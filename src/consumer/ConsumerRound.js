import * as THREE from 'three';
import { createObserverModel } from '../observer/ObserverModel.js';
import { ObserverAnimator } from '../observer/ObserverAnimator.js';
import { ObserverMovement } from '../observer/ObserverMovement.js';
import { DIMS } from '../observer/ObserverSkeleton.js';

const CIVILIAN_COUNT = 26;
const CIVILIAN_RESCUE_TIME = 4.2;
const CIVILIAN_SPEED = [1.85, 2.55];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function createCitizenFrames() {
  const palettes = [
    ['#527c8b', '#303d59', '#d69a74', '#26202a'], ['#a35b53', '#39494c', '#e0ae84', '#30251f'],
    ['#728352', '#463a3c', '#9b6951', '#201d28'], ['#74628b', '#484854', '#d59d8b', '#3a292a'],
    ['#c09a55', '#41506a', '#b27659', '#352320'], ['#4c8371', '#5a4641', '#e0b792', '#3b2a26'],
  ];
  return palettes.map(([shirt, pants, skin, hair]) => [0, 1].map((step) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 48;
    const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    rect(11, 3, 10, 3, hair); rect(9, 6, 14, 9, skin); rect(10, 5, 12, 3, hair);
    rect(8, 15, 16, 13, shirt); rect(5, 16 + step, 4, 12, shirt); rect(23, 16 + (1 - step), 4, 12, shirt);
    rect(9, 28, 6, 11 - step * 3, pants); rect(17, 28, 6, 8 + step * 3, pants);
    rect(8, 39 - step * 3, 7, 3, '#241f22'); rect(17, 36 + step * 3, 7, 3, '#241f22');
    rect(12, 9, 2, 1, '#2a2020'); rect(18, 9, 2, 1, '#2a2020');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, emissive: 0x101010 });
    return { tex, mat };
  }));
}

const CITIZEN_FRAMES = createCitizenFrames();
const CITIZEN_GEO = new THREE.PlaneGeometry(0.78, 1.55);
const SOUL_GEO = new THREE.IcosahedronGeometry(0.065, 0);
const SOUL_MAT = new THREE.MeshStandardMaterial({ color: 0x1b0714, emissive: 0x70203c, emissiveIntensity: 1.1, roughness: 1 });

export function createConsumerRound({ scene, camera, world, hooks = {}, audio = {} } = {}) {
  const model = createObserverModel({ ambientScale: 0.85 });
  // The Consumer is the same malformed body as the Observer, with longer arms and bruised-dark skin.
  model.mats.skin.color.setRGB(0.58, 0.36, 0.39);
  model.mats.eyes.color.setHex(0x590714);
  for (const side of ['Left', 'Right']) {
    const upper = model.j[`${side}UpperArm`], forearm = model.j[`${side}Forearm`];
    model.j[`${side}Elbow`].position.y = -DIMS.upperArm * 1.62;
    model.j[`${side}Hand`].position.y = -DIMS.forearm * 1.62;
    for (const mesh of model.meshes) {
      if (mesh.parent === upper || mesh.parent === forearm) mesh.scale.y *= 1.62;
    }
  }
  model.root.visible = false; model.root.rotation.order = 'YXZ'; scene.add(model.root);
  const anim = new ObserverAnimator(model);
  const mover = new ObserverMovement(world, 0.42);
  const citizens = [];
  const soulWisps = Array.from({ length: 7 }, () => {
    const mesh = new THREE.Mesh(SOUL_GEO, SOUL_MAT); mesh.visible = false; scene.add(mesh); return mesh;
  });
  const S = {
    active: false, dead: false, round: 1, time: 0, pos: new THREE.Vector3(), heading: 0,
    health: 0, maxHealth: 0, eaten: 0, rescued: 0, killed: 0, sizeScale: 1,
    surface: 'ground', surfaceT: 0, surfaceTilt: 0, wallSide: 1,
    wallAnchor: null,
    mode: 'stalk', target: null, eatT: 0, playerSound: null, footstepIn: 0.2, breathIn: 1.3,
    attackT: 0, attackHit: false, rescueId: null, rescueProgress: 0,
    vision: new THREE.Vector3(),
  };
  const aliveCitizens = () => citizens.reduce((n, c) => n + (c.alive ? 1 : 0), 0);
  const say = (text) => hooks.say?.(text);
  const ground = (x, z) => world.groundY(x, z);
  const place = (x, z, min, max, rng, avoidX = NaN, avoidZ = NaN, avoidR = 0) => {
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2, d = min + rng() * (max - min);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!world.walkable(px, pz, 0.6) || Math.hypot(px - x, pz - z) < min * 0.7) continue;
      if (Number.isFinite(avoidX) && Math.hypot(px - avoidX, pz - avoidZ) < avoidR) continue;
      return { x: px, z: pz };
    }
    return { x: x + min, z };
  };

  function makeCitizen(x, z, rng, id) {
    const variant = (rng() * CITIZEN_FRAMES.length) | 0;
    const mesh = new THREE.Mesh(CITIZEN_GEO, CITIZEN_FRAMES[variant][0].mat);
    mesh.frustumCulled = false; scene.add(mesh);
    const c = {
      id, x, z, pos: new THREE.Vector3(x, 0, z), mesh, variant,
      mover: new ObserverMovement(world, 0.22),
      alive: true, rescued: false, consumed: false, beingEaten: false,
      speed: CIVILIAN_SPEED[0] + rng() * (CIVILIAN_SPEED[1] - CIVILIAN_SPEED[0]),
      stepAudio: null, stepLevel: 0, stepPan: 0,
      goal: null, retarget: rng() * 2, gait: rng() * 6.28, phase: rng() * 6.28,
    };
    const stepBuffer = c.speed >= 2.2 ? audio.run : audio.walk;
    if (audio.ctx && stepBuffer) {
      const source = audio.ctx.createBufferSource(); source.buffer = stepBuffer; source.loop = true;
      const gain = audio.ctx.createGain(); gain.gain.value = 0;
      const pan = audio.ctx.createStereoPanner();
      source.connect(gain).connect(pan).connect(audio.dest || audio.ctx.destination);
      source.start(); c.stepAudio = { source, gain, pan };
    }
    return c;
  }

  function updateCitizenFootsteps(c, info, dt, moving) {
    if (!c.stepAudio) return;
    const dx = c.x - (info.x ?? camera.position.x), dz = c.z - (info.z ?? camera.position.z), d = Math.hypot(dx, dz);
    const falloff = Math.max(0, 1 - d / 36);
    const target = moving ? 0.22 * falloff * falloff : 0;
    c.stepLevel += (target - c.stepLevel) * Math.min(1, dt * 7);
    const yaw = info.yaw || 0, rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    const targetPan = d > 0.01 ? THREE.MathUtils.clamp((dx * rightX + dz * rightZ) / d, -1, 1) : 0;
    c.stepPan += (targetPan - c.stepPan) * Math.min(1, dt * 8);
    c.stepAudio.gain.gain.value = c.stepLevel;
    c.stepAudio.pan.pan.value = c.stepPan;
  }

  function stopCitizenFootsteps(c) {
    if (!c.stepAudio) return;
    try { c.stepAudio.source.stop(); } catch { /* already stopped */ }
    c.stepAudio.source.disconnect(); c.stepAudio.gain.disconnect(); c.stepAudio.pan.disconnect();
    c.stepAudio = null;
  }

  function chooseGoal(c, fromX = c.x, fromZ = c.z, min = 8, max = 19) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
      const x = fromX + Math.cos(a) * d, z = fromZ + Math.sin(a) * d;
      if (world.walkable(x, z, 0.25)) { c.goal = { x, z }; c.retarget = 4 + Math.random() * 6; return; }
    }
    c.goal = null; c.retarget = 1;
  }

  function findWallAnchor() {
    const trees = world.trees?.(S.pos.x, S.pos.z, 7) || [];
    let nearestTree = null, nearestDistance = 7;
    for (const [x, z, height, radius] of trees) {
      const d = Math.hypot(S.pos.x - x, S.pos.z - z);
      if (d < nearestDistance) { nearestDistance = d; nearestTree = { x, z, height, radius }; }
    }
    if (nearestTree) {
      const a = Math.atan2(S.pos.z - nearestTree.z, S.pos.x - nearestTree.x);
      const d = nearestTree.radius + 0.38;
      return { kind: 'tree', x: nearestTree.x + Math.cos(a) * d, z: nearestTree.z + Math.sin(a) * d, height: nearestTree.height };
    }
    const G = world.grid;
    if (!G || !world.cellWalkable) return null;
    const i = G.cellOf(S.pos.x), j = G.cellOf(S.pos.z), x0 = G.lo(i), x1 = G.lo(i + 1), z0 = G.lo(j), z1 = G.lo(j + 1);
    const candidates = [
      !world.cellWalkable(i - 1, j) && { x: x0 + 0.48, z: THREE.MathUtils.clamp(S.pos.z, z0 + 0.48, z1 - 0.48) },
      !world.cellWalkable(i + 1, j) && { x: x1 - 0.48, z: THREE.MathUtils.clamp(S.pos.z, z0 + 0.48, z1 - 0.48) },
      !world.cellWalkable(i, j - 1) && { x: THREE.MathUtils.clamp(S.pos.x, x0 + 0.48, x1 - 0.48), z: z0 + 0.48 },
      !world.cellWalkable(i, j + 1) && { x: THREE.MathUtils.clamp(S.pos.x, x0 + 0.48, x1 - 0.48), z: z1 - 0.48 },
    ].filter(Boolean).filter((p) => world.walkable(p.x, p.z, 0.42));
    if (!candidates.length) return null;
    candidates.sort((a, b) => Math.hypot(a.x - S.pos.x, a.z - S.pos.z) - Math.hypot(b.x - S.pos.x, b.z - S.pos.z));
    return { kind: 'wall', ...candidates[0], height: world.ceiling || 3.6 };
  }

  function removeCitizen(c, outcome) {
    if (!c || !c.alive) return;
    c.alive = false; c.beingEaten = false; c.mesh.removeFromParent();
    stopCitizenFootsteps(c);
    if (S.target === c) S.target = null;
    if (S.rescueId === c.id) { S.rescueId = null; S.rescueProgress = 0; }
    if (outcome !== 'rescued') hooks.civilianDeath?.(outcome, c);
    if (outcome === 'eaten') { c.consumed = true; S.eaten++; grow(); }
    else if (outcome === 'rescued') { c.rescued = true; S.rescued++; say('A civilian makes it to safety. The Consumer turns toward the sound.'); }
    else { S.killed++; say('The civilian is dead. The Consumer cannot feed on them now.'); }
  }

  function grow() {
    const gain = 3 + Math.floor(S.round * 0.35);
    S.maxHealth += gain; S.health = Math.min(S.maxHealth, S.health + gain);
    S.sizeScale = Math.min(2.45, 1 + (S.round - 1) * 0.018 + S.eaten * 0.06);
    model.root.scale.setScalar(S.sizeScale);
    say(`The Consumer swells. ${S.maxHealth} maximum health.`);
  }

  function noise(x, z, volume = 0.4, kind = 'noise') {
    if (!S.active || S.dead) return false;
    if (S.mode === 'consume' && S.target?.alive) {
      const victimDistance = Math.hypot(S.target.x - S.pos.x, S.target.z - S.pos.z);
      const playerDistance = Math.hypot(x - S.pos.x, z - S.pos.z);
      if (victimDistance + 1 < playerDistance) return false;
    }
    const hearing = Math.min(78, (32 + S.round * 2.5) * Math.sqrt(Math.max(0.08, volume)));
    const d = Math.hypot(x - S.pos.x, z - S.pos.z);
    if (d > hearing) return false;
    const wall = world.losBlocked?.(S.pos.x, S.pos.z, x, z) ? 0.6 : 1;
    const signal = volume * wall - d / hearing * 0.52;
    if (signal < 0.055) return false;
    S.playerSound = { x, z, age: 0, kind };
    if (S.mode !== 'consume') S.mode = 'huntPlayer';
    return true;
  }

  function beginRescue(id) {
    const c = citizens.find((v) => v.id === id && v.alive);
    if (!S.active || !c) return;
    S.rescueId = id; S.rescueProgress = 0;
    noise(camera.position.x, camera.position.z, 0.26, 'rescue attempt');
  }

  function worldAction(px, pz, yaw) {
    if (!S.active || S.dead) return null;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best = 2.3, target = null;
    for (const c of citizens) {
      if (!c.alive || c.beingEaten) continue;
      const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
      if (d > best || d < 1e-4 || (dx * fx + dz * fz) / d < -0.35) continue;
      best = d; target = c;
    }
    if (!target) return null;
    const progress = S.rescueId === target.id ? Math.min(CIVILIAN_RESCUE_TIME, S.rescueProgress) : 0;
    return {
      label: progress > 0 ? `[Hold E] Guide civilian to safety ${progress.toFixed(1)}/${CIVILIAN_RESCUE_TIME}s` : '[E] Begin rescue (hold still 4.2s)',
      run: () => beginRescue(target.id),
    };
  }

  function updateCitizens(dt, info) {
    const rescue = citizens.find((c) => c.alive && c.id === S.rescueId);
    const rescueValid = rescue && info.interacting && !info.moving && Math.hypot(rescue.x - info.x, rescue.z - info.z) < 2.6 && Math.hypot(S.pos.x - info.x, S.pos.z - info.z) > 8;
    if (S.rescueId && !rescueValid) { S.rescueId = null; S.rescueProgress = 0; }
    if (rescueValid) {
      S.rescueProgress += dt; rescue.beingEaten = false;
      if (S.rescueProgress >= CIVILIAN_RESCUE_TIME) removeCitizen(rescue, 'rescued');
    }
    for (const c of citizens) {
      if (!c.alive) continue;
      const dConsumer = Math.hypot(c.x - S.pos.x, c.z - S.pos.z);
      if (c.beingEaten || (rescueValid && rescue === c)) {
        updateCitizenFootsteps(c, info, dt, false);
        c.mesh.position.set(c.x, ground(c.x, c.z) + 0.68 + Math.sin(S.time * 12 + c.phase) * 0.12, c.z);
        c.mesh.rotation.y = Math.atan2(info.x - c.x, info.z - c.z);
        continue;
      }
      c.retarget -= dt;
      if (dConsumer < 24) {
        const dx = c.x - S.pos.x, dz = c.z - S.pos.z, d = Math.hypot(dx, dz) || 1;
        if (c.retarget <= 0 || !c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 2) {
          chooseGoal(c, c.x + dx / d * 12, c.z + dz / d * 12, 6, 18);
        }
      } else if (c.retarget <= 0 || !c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 1.5) chooseGoal(c);
      let moving = false;
      if (c.goal) {
        const speed = c.speed * (dConsumer < 24 ? 1.22 : 1);
        const moved = c.mover.update(dt, c.pos, c.goal, speed);
        c.x = c.pos.x; c.z = c.pos.z; c.gait += dt * speed * 3.8;
        moving = moved.speed > 0.25;
        if (moved.arrived) c.retarget = 0;
      }
      updateCitizenFootsteps(c, info, dt, moving);
      const frame = Math.floor(c.gait * 1.5) % 2;
      c.mesh.material = CITIZEN_FRAMES[c.variant][frame].mat;
      c.mesh.position.set(c.x, ground(c.x, c.z) + 0.78 + Math.abs(Math.sin(c.gait)) * 0.07, c.z);
      c.mesh.rotation.y = Math.atan2(info.x - c.x, info.z - c.z);
      c.mesh.rotation.z = Math.sin(c.gait * 0.5) * 0.035;
    }
  }

  function surfacePose(dt) {
    S.surfaceT -= dt;
    if (S.surfaceT <= 0) {
      const r = Math.random(), hasCeiling = world.ceiling > 0;
      S.wallAnchor = null;
      if (r < 0.42) S.surface = 'ground';
      else if (hasCeiling && r >= 0.7) S.surface = 'ceiling';
      else {
        S.wallAnchor = findWallAnchor();
        S.surface = S.wallAnchor ? 'wall' : 'ground';
        if (S.wallAnchor) { S.pos.x = S.wallAnchor.x; S.pos.z = S.wallAnchor.z; mover.reset(); }
      }
      S.wallSide = Math.random() < 0.5 ? -1 : 1;
      S.surfaceT = S.surface === 'ground' ? 5 + Math.random() * 8 : 2.5 + Math.random() * 3.5;
    }
    const gy = ground(S.pos.x, S.pos.z);
    const wallRise = S.wallAnchor ? Math.max(0.4, Math.min(2.5, S.wallAnchor.height - DIMS.height)) : 0.4;
    const wallY = gy + 0.65 + (0.5 + 0.5 * Math.sin(S.time * 1.1)) * wallRise;
    const targetY = S.surface === 'ground' ? gy : S.surface === 'wall' ? wallY : gy + Math.max(4.2, Math.min(5.5, world.ceiling || 4.8)) - 0.15;
    const xTilt = S.surface === 'ceiling' ? Math.PI : 0;
    const zTilt = S.surface === 'wall' ? S.wallSide * Math.PI * 0.5 : 0;
    model.root.position.y += (targetY - model.root.position.y) * Math.min(1, dt * 3.2);
    model.root.rotation.x += wrap(xTilt - model.root.rotation.x) * Math.min(1, dt * 3.5);
    model.root.rotation.z += wrap(zTilt - model.root.rotation.z) * Math.min(1, dt * 3.5);
  }

  function updateSoulWisps() {
    const victim = S.mode === 'consume' && S.target?.alive ? S.target : null;
    for (let i = 0; i < soulWisps.length; i++) {
      const wisp = soulWisps[i];
      if (!victim) { wisp.visible = false; continue; }
      const t = (S.time * 0.46 + i / soulWisps.length) % 1;
      const arc = Math.sin(t * Math.PI);
      const hx = S.pos.x, hy = model.root.position.y + DIMS.height * 0.82 * S.sizeScale, hz = S.pos.z;
      wisp.visible = true;
      wisp.position.set(
        victim.x + (hx - victim.x) * t + Math.sin(S.time * 4 + i * 1.9) * arc * 0.55,
        ground(victim.x, victim.z) + 0.9 + (hy - ground(victim.x, victim.z) - 0.9) * t + arc * 0.7,
        victim.z + (hz - victim.z) * t + Math.cos(S.time * 4.7 + i * 1.6) * arc * 0.55,
      );
      wisp.scale.setScalar(0.55 + arc * 0.9);
      wisp.rotation.set(S.time * 3 + i, S.time * 4 - i, S.time * 2.6 + i);
    }
  }

  function update(dt, info = {}) {
    if (!S.active || S.dead) return;
    S.time += dt;
    if (!info.inControl) { for (const c of citizens) updateCitizenFootsteps(c, info, dt, false); return; }
    const px = info.x ?? camera.position.x, pz = info.z ?? camera.position.z;
    if (S.playerSound) S.playerSound.age += dt;
    if (info.moving) {
      S.footstepIn -= dt;
      if (S.footstepIn <= 0) { noise(px, pz, info.running ? 0.95 : 0.4, info.running ? 'running' : 'footsteps'); S.footstepIn = info.running ? 0.38 : 0.72; }
    }
    if (!info.holdingBreath) {
      S.breathIn -= dt;
      if (S.breathIn <= 0) { noise(px, pz, info.moving ? 0.27 : 0.2, 'breathing'); S.breathIn = 1.4; }
    }
    updateCitizens(dt, { ...info, x: px, z: pz });
    const playerDistance = Math.hypot(px - S.pos.x, pz - S.pos.z);
    const soundRecent = S.playerSound && S.playerSound.age < 11;
    let goal = null, speed = 0, state = 'stalk';
    const eating = S.mode === 'consume' && S.target?.alive;
    const attackInProgress = S.mode === 'attackPlayer';
    const victimDistance = eating ? Math.hypot(S.target.x - S.pos.x, S.target.z - S.pos.z) : Infinity;
    const canKeepFeeding = !attackInProgress && eating && playerDistance > 7 && (!soundRecent || victimDistance + 1 < playerDistance);
    if (canKeepFeeding) {
      S.eatT -= dt; state = 'attack';
      if (S.eatT <= 0) { removeCitizen(S.target, 'eaten'); S.target = null; S.mode = 'stalk'; }
    } else {
      if (eating) { S.target.beingEaten = false; S.target = null; }
      if (attackInProgress) {
        state = 'attack'; goal = { x: px, z: pz }; S.attackT -= dt;
        if (!S.attackHit && S.attackT < 0.58) {
          S.attackHit = true;
          const hitRange = S.surface === 'ground' ? 2.25 : 4.8;
          if (playerDistance <= hitRange) hooks.damage?.(32 + Math.min(18, S.round * 2), 'consumer');
          if (!S.active) return;
        }
        if (S.attackT <= 0) { S.mode = 'huntPlayer'; S.playerSound = { x: px, z: pz, age: 0, kind: 'scream' }; }
      } else {
        const pursuePlayer = playerDistance < 10.5 || !!soundRecent;
        if (pursuePlayer) {
          S.mode = 'huntPlayer'; state = 'hunt';
          goal = playerDistance < 16 || (soundRecent && S.playerSound.age < 2.2) ? { x: px, z: pz } : { x: S.playerSound.x, z: S.playerSound.z };
        } else {
          let nearest = null, nearestDistance = 34;
          for (const c of citizens) {
            if (!c.alive || c.beingEaten) continue;
            const d = Math.hypot(c.x - S.pos.x, c.z - S.pos.z);
            if (d < nearestDistance) { nearestDistance = d; nearest = c; }
          }
          if (nearest) { S.mode = 'feed'; S.target = nearest; goal = { x: nearest.x, z: nearest.z }; state = 'scurry'; }
          else { S.mode = 'huntPlayer'; goal = { x: px, z: pz }; state = 'hunt'; }
        }
        const closeToPlayer = playerDistance < (S.surface === 'ground' ? 1.75 : 4.4);
        if (closeToPlayer && S.attackT <= 0) {
          S.mode = 'attackPlayer'; S.attackT = 0.85; S.attackHit = false; state = 'attack'; goal = { x: px, z: pz };
        }
      }
      speed = state === 'hunt' ? Math.min(7.2, 4.15 + S.round * 0.08 + S.eaten * 0.13) : 2.9 + S.eaten * 0.06;
      if (goal && S.surface !== 'wall') {
        const moved = mover.update(dt, S.pos, goal, speed);
        S.heading = Math.atan2(moved.vx || goal.x - S.pos.x, moved.vz || goal.z - S.pos.z);
      } else if (S.surface === 'wall') S.heading = Math.atan2(px - S.pos.x, pz - S.pos.z);
      if (S.mode === 'feed' && S.target?.alive && Math.hypot(S.target.x - S.pos.x, S.target.z - S.pos.z) < 1.45) {
        S.target.beingEaten = true; S.mode = 'consume'; S.eatT = 3.6; state = 'attack';
        say('The Consumer has someone. It is vulnerable while it feeds.');
      }
    }
    if (S.playerSound?.age > 11) S.playerSound = null;
    model.root.visible = true;
    surfacePose(dt);
    model.root.position.x = S.pos.x; model.root.position.z = S.pos.z;
    model.root.rotation.y = S.heading;
    anim.setState(state); anim.update(dt, { speed, lookYaw: wrap(Math.atan2(px - S.pos.x, pz - S.pos.z) - S.heading), lookPitch: -0.25 });
    if (S.mode === 'consume') {
      const convulse = Math.sin(S.time * 17);
      model.j.Torso.rotation.x = 1.15 + convulse * 0.12;
      model.j.Neck.rotation.z = Math.sin(S.time * 11) * 0.22;
      model.j.LeftUpperArm.rotation.x = -1.8 + convulse * 0.25;
      model.j.RightUpperArm.rotation.x = -1.45 - convulse * 0.3;
      model.j.LeftHand.rotation.x = -1.4 - convulse * 0.35;
      model.j.RightHand.rotation.x = -0.85 + convulse * 0.4;
    }
    model.mats.setEyeGlow(S.mode === 'huntPlayer' || S.mode === 'attackPlayer' ? 0.9 : 0.3);
    updateSoulWisps();
  }

  function shot(origin, dir, options = {}) {
    if (!S.active || S.dead) return false;
    if (options.noiseVolume) noise(origin.x, origin.z, options.noiseVolume, options.melee ? 'weapon' : 'gunshot');
    const maxRange = options.range ?? 45, spread = options.melee ? 0.6 : 0.38;
    let best = null, bestT = maxRange, targetKind = '';
    const checkTarget = (target, x, y, z, radius, kind) => {
      const cx = x - origin.x, cy = y - origin.y, cz = z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t <= 0 || t >= bestT) return;
      const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
      if (mx * mx + mz * mz <= radius * radius && Math.abs(my) <= radius * 1.8 && !world.losBlocked?.(origin.x, origin.z, x, z)) {
        best = target; bestT = t; targetKind = kind;
      }
    };
    for (const c of citizens) if (c.alive) checkTarget(c, c.x, ground(c.x, c.z) + 0.8, c.z, spread * 0.72, 'citizen');
    const consumerY = model.root.position.y + (S.surface === 'ceiling' ? -1.4 : S.surface === 'wall' ? 0 : 1.4) * S.sizeScale;
    checkTarget(S, S.pos.x, consumerY, S.pos.z, spread * S.sizeScale, 'consumer');
    if (!best) return false;
    const damage = options.damage ?? 1;
    if (targetKind === 'citizen') removeCitizen(best, 'killed');
    else {
      S.health -= damage;
      model.j.Head.rotation.z = 0.4;
      if (S.health <= 0) {
        S.health = 0; S.dead = true; S.mode = 'dead'; model.root.visible = false;
        say('The Consumer collapses. The survivors scatter into the dark.');
      } else say(`The Consumer takes the hit. ${S.health}/${S.maxHealth}`);
    }
    return true;
  }

  function start({ round = 1, center = camera.position } = {}) {
    stop(); S.active = true; S.dead = false; S.round = Math.max(1, round); S.time = 0;
    S.eaten = S.rescued = S.killed = 0; S.sizeScale = 1 + (S.round - 1) * 0.018;
    S.maxHealth = S.health = 18 + S.round * 3; S.playerSound = null; S.mode = 'stalk';
    S.surface = 'ground'; S.surfaceT = 3 + Math.random() * 4; S.wallAnchor = null; S.rescueId = null; S.rescueProgress = 0;
    S.eatT = 0; S.attackT = 0; S.attackHit = false; S.footstepIn = 0.2; S.breathIn = 1.3;
    const rng = (() => { let a = ((S.round * 0x45d9f3b) ^ Math.floor(center.x * 43 + center.z * 61) ^ 0x71c09eab) | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const spawn = place(center.x, center.z, 26, 38, rng);
    S.pos.set(spawn.x, 0, spawn.z); S.heading = Math.atan2(center.x - spawn.x, center.z - spawn.z);
    model.root.scale.setScalar(S.sizeScale); model.root.visible = true;
    model.root.position.set(S.pos.x, ground(S.pos.x, S.pos.z), S.pos.z);
    model.root.rotation.set(0, S.heading, 0);
    mover.reset(); anim.setState('idle');
    const count = CIVILIAN_COUNT + Math.min(10, S.round * 2);
    for (let i = 0; i < count; i++) {
      const p = place(center.x, center.z, 12, 72, rng, spawn.x, spawn.z, 8);
      citizens.push(makeCitizen(p.x, p.z, rng, i));
    }
    say(`The Consumer is loose. ${count} civilians are running. Hold E near one to guide them to safety.`);
  }

  function stop() {
    S.active = false; S.rescueId = null; S.rescueProgress = 0; S.target = null;
    for (const c of citizens) { c.mesh.removeFromParent(); stopCitizenFootsteps(c); }
    citizens.length = 0; model.root.visible = false; mover.reset();
    for (const wisp of soulWisps) wisp.visible = false;
  }

  return {
    start, stop, update, shot, noise, worldAction,
    get active() { return S.active; }, get dead() { return S.dead; },
    get health() { return S.health; }, get maxHealth() { return S.maxHealth; },
    get sizeScale() { return S.sizeScale; }, get mode() { return S.mode; }, get surface() { return S.surface; },
    get civilians() { return aliveCitizens(); }, get total() { return citizens.length; },
    get rescued() { return S.rescued; }, get eaten() { return S.eaten; }, get killed() { return S.killed; },
  };
}
