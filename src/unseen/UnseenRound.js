import * as THREE from 'three';
import { ObserverMovement } from '../observer/ObserverMovement.js';
import { monsterAsset } from '../world/MonsterAssets.js';

export const UNSEEN = {
  observe: 10, maxCount: 8, radius: 0.3, reach: 1.65,
  stalkSpeed: 6.4, chargeSpeed: 9.2, windup: 0.48, rear: -0.2,
};

function silhouetteMaterial(fill, edge) {
  const material = new THREE.MeshBasicMaterial({ color: fill, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: new THREE.Color(edge) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRimNormal, vRimView;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vRimNormal = normalize(normalMatrix * normal);
        vRimView = -mvPosition.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; varying vec3 vRimNormal, vRimView;')
      .replace('#include <opaque_fragment>', `
        float rim = pow(1.0 - abs(dot(normalize(vRimNormal), normalize(vRimView))), 3.0);
        outgoingLight = mix(outgoingLight, uRim, rim * 0.76);
        #include <opaque_fragment>`);
  };
  return material;
}

function createModels() {
  const matchMat = silhouetteMaterial(0x0e0909, 0xc18253);
  const cameraMat = silhouetteMaterial(0x07110d, 0x80e2af);
  const orb = new THREE.SphereGeometry(1, 12, 8);
  const limb = new THREE.CylinderGeometry(0.68, 1, 1, 8);
  const bruteMaterials = new WeakMap();

  return function build() {
    const rig = monsterAsset('unseen', { scale: 0.88, idle: 'Idle' });
    if (rig?.meshes.length) {
      rig.root.visible = false;
      const finishes = rig.meshes.map(mesh => {
        const source = mesh.material;
        if (!bruteMaterials.has(source)) {
          const match = source.clone();
          match.color.set(0xcfa181);
          match.emissive.set(0xc27545);
          match.emissiveMap = source.map;
          match.emissiveIntensity = 0.42;
          const spectral = source.clone();
          spectral.color.set(0x91d4a6);
          spectral.emissive.set(0x9af9ae);
          spectral.emissiveMap = source.map;
          spectral.emissiveIntensity = 0.72;
          bruteMaterials.set(source, { match, camera: spectral });
        }
        return bruteMaterials.get(source);
      });
      return {
        root: rig.root, rig,
        reveal(mode) {
          rig.root.visible = !!mode;
          if (mode) rig.meshes.forEach((mesh, i) => { mesh.material = finishes[i][mode]; });
        },
        dispose() { for (const mesh of rig.meshes) mesh.skeleton.dispose(); },
      };
    }
    const root = new THREE.Group(), torso = new THREE.Group(), meshes = [];
    function part(parent, geometry, x, y, z, sx, sy, sz) {
      const mesh = new THREE.Mesh(geometry, matchMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      meshes.push(mesh);
      return mesh;
    }
    root.add(torso);
    torso.position.y = 1.02;
    part(torso, orb, 0, 0.18, 0, 0.22, 0.39, 0.16);
    part(torso, orb, 0, 0.43, 0.02, 0.34, 0.24, 0.20);
    part(torso, limb, 0, 0.65, 0.09, 0.09, 0.30, 0.08).rotation.x = 0.3;
    part(torso, orb, 0, 0.85, 0.17, 0.17, 0.25, 0.18);
    const arms = [], legs = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(), elbow = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.44, 0.02);
      elbow.position.y = -0.53;
      torso.add(shoulder); shoulder.add(elbow);
      part(shoulder, limb, 0, -0.25, 0, 0.103, 0.55, 0.10);
      part(elbow, limb, 0, -0.25, 0, 0.062, 0.54, 0.067);
      for (let i = -1; i <= 1; i++) {
        part(elbow, limb, i * 0.046, -0.57, 0.025, 0.022, 0.23 - Math.abs(i) * 0.04, 0.026).rotation.z = i * 0.23;
      }
      arms.push({ shoulder, elbow, side });

      const hip = new THREE.Group(), knee = new THREE.Group();
      hip.position.set(side * 0.13, 1.06, 0);
      knee.position.y = -0.51;
      root.add(hip); hip.add(knee);
      part(hip, limb, 0, -0.25, 0, 0.109, 0.54, 0.10);
      part(knee, limb, 0, -0.24, 0, 0.061, 0.47, 0.066);
      part(knee, orb, 0, -0.47, 0.08, 0.071, 0.07, 0.17);
      legs.push({ hip, knee, side });
    }
    root.visible = false;
    return {
      root, torso, arms, legs,
      reveal(mode) {
        root.visible = !!mode;
        if (mode) for (const mesh of meshes) mesh.material = mode === 'camera' ? cameraMat : matchMat;
      },
    };
  };
}

export function createUnseenRound({ scene, world, hooks, rng = Math.random }) {
  const monsters = [], build = createModels();
  const view = new THREE.Vector3(), target = new THREE.Vector3(), hitVolume = new THREE.Sphere();
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  let active = false, elapsed = 0, damage = 0, speedBonus = 0, nextAttack = 0, attacker = null;

  function nearby(x, z, heading, min, max, clear = true, available = () => true) {
    for (let i = 0; i < 32; i++) {
      const angle = heading + i * 2.4;
      const d = i === 0 ? max : min + rng() * (max - min);
      const tx = x + Math.sin(angle) * d, tz = z + Math.cos(angle) * d;
      if (!world.walkable(tx, tz, UNSEEN.radius) || !available(tx, tz)) continue;
      if (!clear || !world.losBlocked(x, z, tx, tz)) return { x: tx, z: tz };
    }
    return null;
  }

  function start(round, player, yaw) {
    stop();
    active = true;
    elapsed = nextAttack = 0;
    attacker = null;
    const level = Math.max(0, round - 1);
    const count = Math.min(UNSEEN.maxCount, 3 + Math.floor(level / 2));
    const hp = 2 + Math.min(6, Math.floor(level / 3));
    damage = 16 + Math.min(22, level * 2);
    speedBonus = Math.min(2, level * 0.15);
    const free = (x, z) => monsters.every((m) => Math.hypot(m.x - x, m.z - z) > 1.3);
    for (let i = 0; i < count; i++) {
      const heading = yaw + Math.PI + i * Math.PI * 2 / count;
      const spawn = nearby(player.x, player.z, heading, 4, 8, true, free)
        || nearby(player.x, player.z, heading, 1.8, 6, true, free)
        || nearby(player.x, player.z, heading, 1.8, 10, false, free)
        || nearby(player.x, player.z, heading, 1.8, 12, false);
      const x = spawn?.x ?? player.x, z = spawn?.z ?? player.z;
      const model = build();
      const ground = world.groundY(x, z);
      model.root.position.set(x, ground, z);
      scene.add(model.root);
      monsters.push({ x, z, ground, hp, model, motor: new ObserverMovement(world, UNSEEN.radius),
        trailX: x, trailZ: z, angle: heading, phase: rng() * 6, speed: 0,
        state: 'stalk', timer: 0, goal: null, retarget: 1.3 + i * 0.8,
        voiceIn: 0.7 + i * 1.8, stride: 0, flank: i % 2 ? -1 : 1, previouslyRevealed: false });
    }
  }

  function remove(index) {
    const [monster] = monsters.splice(index, 1);
    if (attacker === monster) { attacker = null; nextAttack = 1.1; }
    scene.remove(monster.model.root);
    monster.model.dispose?.();
    hooks.silence(monster);
  }

  function stop() {
    active = false;
    while (monsters.length) remove(monsters.length - 1);
  }

  function pose(m, dt, dx, dz) {
    const { root, torso, arms, legs } = m.model;
    const moving = Math.min(1, m.speed / UNSEEN.stalkSpeed);
    const swing = m.state === 'windup' ? 1 - Math.max(0, m.timer / UNSEEN.windup) : 0;
    const facing = Math.atan2(dx, dz);
    m.angle += Math.atan2(Math.sin(facing - m.angle), Math.cos(facing - m.angle)) * Math.min(1, dt * 16);
    root.rotation.y = m.angle;
    if (m.model.rig) {
      root.position.set(m.x, m.ground, m.z);
      const clip = m.state === 'windup' || m.state === 'recover' ? 'Attack_Slam'
        : m.speed > 2.5 ? 'Run' : m.speed > 0.25 ? 'Walk' : 'Idle';
      const rate = clip === 'Attack_Slam' ? 2 : clip === 'Run' ? Math.min(2.55, m.speed / 3.5) : clip === 'Walk' ? Math.min(2.3, m.speed / 0.78) : 1;
      m.model.rig.animate(clip, dt, { once: clip === 'Attack_Slam', rate });
      return;
    }
    m.phase += dt * (2.5 + m.speed * 1.8);
    root.position.set(m.x, m.ground + Math.sin(m.phase * 2) * moving * 0.065, m.z);
    torso.rotation.x = 0.18 + moving * 0.33 + swing * 0.4;
    torso.rotation.z = Math.sin(m.phase) * (0.025 + moving * 0.095);
    for (const { shoulder, elbow, side } of arms) {
      shoulder.rotation.set(Math.sin(m.phase) * side * moving * 0.85 - swing * 1.65, 0, side * (0.29 + swing * 0.5));
      elbow.rotation.x = -0.27 - moving * 0.36 - swing * 0.44;
    }
    for (const { hip, knee, side } of legs) {
      const stride = Math.sin(m.phase) * side;
      hip.rotation.x = stride * moving * 0.83;
      knee.rotation.x = Math.max(0, stride) * moving * 1.15;
    }
  }

  function retreat(m, player, dx, dz) {
    if (attacker === m) { attacker = null; nextAttack = 1.1; }
    m.state = 'retreat';
    m.timer = 1.1;
    m.motor.reset();
    m.goal = nearby(player.x, player.z, Math.atan2(-dx, -dz) + m.flank * 0.55, 4, 7);
    m.flank *= -1;
  }

  function update(dt, camera, { inControl, yaw, matchRange, cameraRange }) {
    if (!active) return;
    if (!inControl) {
      for (const m of monsters) { m.model.reveal(null); hooks.silence(m); }
      return;
    }
    elapsed += dt;
    nextAttack = Math.max(0, nextAttack - dt);
    const player = camera.position, forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    if (cameraRange || matchRange) camera.getWorldDirection(view);
    for (const m of monsters) {
      let dx = player.x - m.x, dz = player.z - m.z, distance = Math.hypot(dx, dz);
      const behind = () => distance > 0.05 && -(dx * forwardX + dz * forwardZ) < UNSEEN.rear * distance;
      const clear = () => !world.losBlocked(player.x, player.z, m.x, m.z);
      m.timer -= dt; m.retarget -= dt; m.voiceIn -= dt;
      let speed = 0, goal = null, strike = false;

      if (m.state === 'retreat' && m.timer <= 0) {
        m.state = 'stalk'; m.goal = null; m.retarget = 0;
      }
      if (attacker === m && m.state !== 'recover' && (!behind() || !clear())) retreat(m, player, dx, dz);
      if (m.state === 'stalk' && elapsed >= UNSEEN.observe && !attacker && nextAttack <= 0 && distance < Math.max(4, 12 * (world.exposure?.(player.x, player.z) ?? 1)) && behind() && clear()) {
        attacker = m;
        m.state = 'coil'; m.timer = 0.3 + rng() * 0.2; m.motor.reset();
        hooks.warning?.(m);
      }
      if (m.state === 'coil' && m.timer <= 0) { m.state = 'charge'; m.timer = 1.45; }
      if (m.state === 'charge' && distance <= UNSEEN.reach) {
        m.state = 'windup'; m.timer = UNSEEN.windup;
        hooks.screech(m, true);
      }

      if (m.state === 'charge') {
        if (m.timer <= 0) retreat(m, player, dx, dz);
        else { goal = player; speed = UNSEEN.chargeSpeed + speedBonus; }
      } else if (m.state === 'windup') {
        if (distance > UNSEEN.reach + 0.3) retreat(m, player, dx, dz);
        else if (m.timer <= 0) {
          strike = distance <= UNSEEN.reach;
          m.state = 'recover'; m.timer = 0.38;
          hooks.footfall?.(m, true);
        }
      } else if (m.state === 'recover') {
        if (m.timer <= 0) retreat(m, player, dx, dz);
      } else if (m.state === 'retreat') {
        goal = m.goal; speed = UNSEEN.chargeSpeed;
      } else if (m.state === 'stalk') {
        if (m.retarget <= 0) {
          m.retarget = distance > 11 || distance < 2.8 ? 0.65 : 1.7 + rng() * 2.1;
          const heading = Math.atan2(-dx, -dz) + m.flank * (0.5 + rng() * 0.7);
          m.goal = nearby(player.x, player.z, heading, 4, 7) || nearby(player.x, player.z, heading, 2, 4);
          m.flank *= -1;
        }
        // Alternate short, fast passes with long stretches standing still.
        goal = m.goal; speed = !attacker || distance > 9 ? UNSEEN.stalkSpeed : 1.2;
      }

      const move = m.motor.update(dt, m, goal, speed);
      m.speed = move.speed;
      m.trailX += (m.x - m.trailX) * Math.min(1, dt * 5);
      m.trailZ += (m.z - m.trailZ) * Math.min(1, dt * 5);
      m.ground = world.groundY(m.x, m.z);
      dx = player.x - m.x; dz = player.z - m.z; distance = Math.hypot(dx, dz);
      if (m.speed > 1 && m.voiceIn <= 0 && distance < 28) {
        hooks.screech(m, false);
        m.voiceIn = 5 + rng() * 5;
      }
      if (m.speed > 1 && distance < 11) {
        m.stride += m.speed * dt;
        if (m.stride >= 1.65) {
          m.stride %= 1.65;
          hooks.footfall?.(m, m.state === 'charge');
        }
      }
      pose(m, dt, m.speed > 1 ? move.vx : dx, m.speed > 1 ? move.vz : dz);
      const facing = target.set(-dx, m.ground + 1.3 - player.y, -dz).normalize().dot(view);
      const cameraLit = cameraRange > 0 && distance < cameraRange && facing > 0.56;
      const matchLit = matchRange > 0 && distance < matchRange;
      const reveal = (cameraLit || matchLit) && clear() ? (cameraLit ? 'camera' : 'match') : null;
      if (reveal && !m.previouslyRevealed && distance < 6 && facing > 0.15) hooks.glimpse?.(m);
      m.previouslyRevealed = !!reveal;
      m.model.reveal(reveal);
      if (strike) {
        hooks.damage(damage, 'unseen', m);
        if (!active) return;
      }
    }
  }

  function hurt(index, amount) {
    const m = monsters[index];
    m.hp -= amount;
    if (m.hp <= 0) remove(index);
  }

  function shot(origin, direction, { range = 45, melee = false, damage = 1 } = {}) {
    if (!active) return;
    ray.set(origin, direction);
    let best = -1, nearest = range;
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (world.losBlocked(origin.x, origin.z, m.x, m.z)) continue;
      if (m.model.rig) {
        if (ray.distanceSqToPoint(target.set(m.x, m.ground + 1.1, m.z)) > 2.3 ** 2) continue;
        const posedHit = m.model.rig.rayHit(origin, direction, nearest, melee ? 0.2 : 0.06);
        if (posedHit) { nearest = origin.distanceTo(posedHit); best = i; }
        continue;
      }
      for (const height of [0.65, 1.23, 1.72]) {
        hitVolume.center.set(m.x, m.ground + height, m.z);
        hitVolume.radius = melee ? 0.76 : 0.43;
        if (!ray.intersectSphere(hitVolume, hit)) continue;
        const distance = origin.distanceTo(hit);
        if (distance < nearest) { nearest = distance; best = i; }
      }
    }
    if (best >= 0) hurt(best, damage);
  }

  function blast(x, z, radius) {
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      const distance = Math.hypot(m.x - x, m.z - z);
      if (distance < radius && !world.losBlocked(x, z, m.x, m.z)) hurt(i, distance < radius * 0.5 ? 5 : 2);
    }
  }

  return { start, stop, update, shot, blast, monsters, get active() { return active; } };
}
