import * as THREE from 'three';
import { ObserverMovement } from '../observer/ObserverMovement.js';

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

function createConsumerModel() {
  const root = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x180a13, roughness: 0.96, emissive: 0x10030a, emissiveIntensity: 0.35 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x54202a, roughness: 0.82, emissive: 0x22040b, emissiveIntensity: 0.42 });
  const raw = new THREE.MeshStandardMaterial({ color: 0x8c2935, roughness: 0.92, emissive: 0x38070f, emissiveIntensity: 0.48 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xbca99a, roughness: 0.78 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x080509, roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xff473e, emissive: 0xc20d26, emissiveIntensity: 2.4, roughness: 0.2 });
  const sphere = new THREE.SphereGeometry(1, 9, 7);
  const addBlob = (parent, material, position, scale, geometry = sphere) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; parent.add(mesh);
    return mesh;
  };
  const torso = new THREE.Group(); root.add(torso);
  addBlob(torso, hide, [0, 1.42, 0], [0.68, 0.93, 0.56]);
  addBlob(torso, flesh, [0, 1.98, 0.02], [0.76, 0.59, 0.62]);
  addBlob(torso, raw, [0.08, 1.36, 0.16], [0.48, 0.59, 0.48]);
  addBlob(torso, hide, [0, 0.78, -0.02], [0.58, 0.39, 0.5]);

  // The chest is split into a long vertical maw, and the head sits off to one side of it.
  addBlob(torso, mouth, [0.04, 1.42, 0.52], [0.55, 1.05, 0.22]);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 4), bone);
    tooth.position.set(-0.22 + i * 0.11, 1.95 - (i % 2) * 0.12, 0.78);
    tooth.rotation.x = 2.4; torso.add(tooth);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), bone);
    lower.position.set(-0.18 + i * 0.1, 0.95, 0.72); torso.add(lower);
  }
  const head = new THREE.Group(); head.position.set(0.42, 2.05, 0.34); head.scale.set(1.35, 0.7, 1.15); torso.add(head);
  addBlob(head, flesh, [0, 0.18, 0], [0.5, 0.42, 0.46]);
  addBlob(head, raw, [0.08, -0.16, 0.12], [0.42, 0.28, 0.36]);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.18, 0.12); head.add(jaw);
  addBlob(jaw, mouth, [0, -0.08, 0.28], [0.34, 0.22, 0.12]);
  addBlob(jaw, flesh, [0.04, -0.16, 0.16], [0.38, 0.16, 0.28]);
  for (const side of [-1, 1]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), bone);
    tooth.position.set(side * 0.12, 0.02, 0.36); jaw.add(tooth);
  }
  addBlob(head, eye, [-0.22, 0.28, 0.38], [0.18, 0.14, 0.08]);
  addBlob(head, eye, [0.24, -0.02, 0.4], [0.07, 0.11, 0.06]);
  addBlob(head, eye, [0.05, -0.42, 0.3], [0.08, 0.12, 0.06]);
  addBlob(torso, eye, [-0.48, 1.85, 0.36], [0.11, 0.14, 0.07]);

  const makeArm = (side, length = 1) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.62, 2.04, 0.03); pivot.scale.y = length; root.add(pivot);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.82, 8), flesh);
    upper.position.y = -0.4; upper.rotation.z = side * -0.09; upper.castShadow = true; pivot.add(upper);
    addBlob(pivot, raw, [0, -0.82, 0], [0.16, 0.17, 0.16]);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.13, 0.82, 7), hide);
    forearm.position.set(side * -0.04, -1.22, 0.04); forearm.rotation.z = side * 0.06; forearm.castShadow = true; pivot.add(forearm);
    addBlob(pivot, raw, [side * -0.05, -1.66, 0.1], [0.14, 0.22, 0.18]);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 5), bone);
      claw.position.set(side * -0.05 + i * 0.09, -1.85, 0.2); claw.rotation.x = 0.55; pivot.add(claw);
    }
    return pivot;
  };
  const leftArm = makeArm(-1, 2.35), rightArm = makeArm(1, 0.55);
  rightArm.rotation.z = 0.55;
  const extraArm = makeArm(-1, 0.78); extraArm.position.set(-0.22, 1.72, -0.28); extraArm.rotation.z = -1.35; extraArm.rotation.x = 0.4;
  const drag = makeArm(1, 1.15); drag.position.set(0.2, 0.95, -0.22); drag.rotation.x = 1.35; drag.rotation.z = 0.8;
  const makeLeg = (side, offset = 0) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.31, 0.83 + offset, 0); root.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.25, 0.65, 8), hide);
    thigh.position.y = -0.31; pivot.add(thigh);
    addBlob(pivot, flesh, [0, -0.65, 0], [0.17, 0.16, 0.17]);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 0.58, 7), flesh);
    shin.position.set(side * 0.06, -0.95, 0.04); shin.rotation.z = side * 0.12; pivot.add(shin);
    addBlob(pivot, raw, [side * 0.07, -1.25, 0.14], [0.2, 0.13, 0.31]);
    return pivot;
  };
  const leftLeg = makeLeg(-1, 0.12), rightLeg = makeLeg(1, -0.34);
  rightLeg.rotation.z = -0.55; rightLeg.scale.set(1.35, 0.72, 1.1);

  // Exposed ribs, vertebrae and dangling growths break the clean humanoid outline.
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.42 + i * 0.025, 0.035, 5, 18, Math.PI), bone);
    rib.position.set(0, 1.3 + i * 0.23, 0.42); rib.rotation.z = Math.PI; rib.scale.x = 1.4; torso.add(rib);
  }
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42 + (i % 2) * 0.16, 5), raw);
    spike.position.set((i - 2) * 0.22, 2.55 - (i % 2) * 0.2, -0.48); spike.rotation.x = -0.65; root.add(spike);
  }
  const growthSacs = [];
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7, sac = addBlob(root, raw,
      [Math.cos(a) * 0.48, 1.2 + (i % 3) * 0.42, Math.sin(a) * 0.43], [0.13, 0.16, 0.12]);
    growthSacs.push(sac);
  }
  const distortion = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32),
    new THREE.MeshBasicMaterial({ color: 0x751b35, transparent: true, opacity: 0, depthWrite: false }));
  distortion.rotation.x = -Math.PI / 2; distortion.position.y = 0.035; root.add(distortion);
  return { root, parts: { torso, head, jaw, leftArm, rightArm, extraArm, drag, leftLeg, rightLeg }, growthSacs, distortion, mats: { eye, raw } };
}

export function createConsumerRound({ scene, camera, world, hooks = {}, audio = {} } = {}) {
  const model = createConsumerModel();
  model.root.visible = false; model.root.rotation.order = 'YXZ'; scene.add(model.root);
  const mover = new ObserverMovement(world, 0.42);
  const citizens = [];
  const stompRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0x8f273c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  stompRing.rotation.x = -Math.PI / 2; stompRing.visible = false; scene.add(stompRing);
  const soulWisps = Array.from({ length: 7 }, () => {
    const mesh = new THREE.Mesh(SOUL_GEO, SOUL_MAT); mesh.visible = false; scene.add(mesh); return mesh;
  });
  const S = {
    active: false, dead: false, round: 1, time: 0, pos: new THREE.Vector3(), heading: 0,
    health: 0, maxHealth: 0, eaten: 0, rescued: 0, killed: 0, sizeScale: 1,
    surface: 'ground', surfaceT: 0, stompIn: 0.3, stompAge: -1, contactIn: 0,
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

  function removeCitizen(c, outcome) {
    if (!c || !c.alive) return;
    c.alive = false; c.beingEaten = false; c.mesh.removeFromParent();
    stopCitizenFootsteps(c);
    if (S.target === c) S.target = null;
    if (S.rescueId === c.id) { S.rescueId = null; S.rescueProgress = 0; }
    if (outcome !== 'rescued') hooks.civilianDeath?.(outcome, c);
    if (outcome === 'eaten') { c.consumed = true; S.eaten++; grow(); }
    else if (outcome === 'rescued') { c.rescued = true; S.rescued++; say('A civilian makes it to safety. The Consumer turns toward the sound.'); }
    else S.killed++;
  }

  function grow() {
    const gain = 6 + S.round;
    S.maxHealth += gain; S.health = Math.min(S.maxHealth, S.health + gain);
    S.sizeScale = Math.min(3.3, 1 + (S.round - 1) * 0.018 + S.eaten * 0.12);
    model.root.scale.setScalar(S.sizeScale);
    if (S.surface === 'ceiling' && S.sizeScale >= 1.25) { S.surface = 'ground'; S.surfaceT = 0.8; }
    model.distortion.material.opacity = Math.min(0.48, 0.14 + S.eaten * 0.035);
    hooks.growth?.(S.eaten, S.sizeScale, S.maxHealth);
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
      const canReachCeiling = world.ceiling > 0 && S.sizeScale < 1.25;
      S.surface = canReachCeiling && Math.random() < 0.18 ? 'ceiling' : 'ground';
      S.surfaceT = S.surface === 'ground' ? 7 + Math.random() * 9 : 3 + Math.random() * 3;
    }
    const gy = ground(S.pos.x, S.pos.z);
    const targetY = S.surface === 'ground'
      ? gy
      : gy + (world.ceiling || 4.8) - 0.08;
    const xTilt = S.surface === 'ceiling' ? Math.PI : 0;
    model.root.position.y += (targetY - model.root.position.y) * Math.min(1, dt * 3.2);
    model.root.rotation.x += wrap(xTilt - model.root.rotation.x) * Math.min(1, dt * 3.5);
    model.root.rotation.z += wrap(-model.root.rotation.z) * Math.min(1, dt * 3.5);
  }

  function resolvePlayerContact(impact) {
    if (S.surface !== 'ground') return false;
    const player = camera.position, minDistance = 0.82 * S.sizeScale + 0.36;
    let dx = player.x - S.pos.x, dz = player.z - S.pos.z, distance = Math.hypot(dx, dz);
    if (distance >= minDistance) return false;
    if (distance < 1e-4) { dx = Math.sin(S.heading); dz = Math.cos(S.heading); distance = 1; }
    const nx = dx / distance, nz = dz / distance;
    player.x += nx * (minDistance - distance); player.z += nz * (minDistance - distance);
    world.collide?.(player, 0.3);
    distance = Math.hypot(player.x - S.pos.x, player.z - S.pos.z);
    if (distance < minDistance) {
      S.pos.x -= nx * (minDistance - distance); S.pos.z -= nz * (minDistance - distance);
      world.collide?.(S.pos, Math.min(1.35, 0.58 * S.sizeScale)); mover.reset();
    }
    if (impact && S.contactIn <= 0) { hooks.bump?.(S.pos.x, S.pos.z, S.sizeScale); S.contactIn = 0.65; }
    return true;
  }

  function updateStomp(dt, moving) {
    if (S.contactIn > 0) S.contactIn -= dt;
    if (moving && S.surface === 'ground') {
      S.stompIn -= dt;
      if (S.stompIn <= 0) {
        S.stompIn = Math.max(0.64, 0.96 - S.sizeScale * 0.09);
        S.stompAge = 0;
        hooks.stomp?.(S.pos.x, S.pos.z, S.sizeScale);
      }
    }
    if (S.stompAge >= 0) {
      S.stompAge += dt;
      const k = Math.min(1, S.stompAge / 0.72);
      stompRing.visible = true; stompRing.position.set(S.pos.x, ground(S.pos.x, S.pos.z) + 0.04, S.pos.z);
      stompRing.scale.setScalar(0.8 + k * 5.2 * S.sizeScale);
      stompRing.material.opacity = (1 - k) * 0.42;
      if (k >= 1) { S.stompAge = -1; stompRing.visible = false; }
    }
  }

  function animateModel(dt, state, speed) {
    const { torso, head, jaw, leftArm, rightArm, extraArm, drag, leftLeg, rightLeg } = model.parts;
    const gait = S.time * (state === 'hunt' || state === 'lunge' ? 9.5 : 6.2), moving = speed > 0.15 ? 1 : 0;
    const consume = state === 'consume', windup = state === 'windup', lunge = state === 'lunge';
    torso.rotation.x = consume ? 1.25 + Math.sin(S.time * 17) * 0.16 : windup ? -0.75 : lunge ? 1.05 : 0.32 + Math.sin(gait * 2) * 0.04 * moving;
    torso.rotation.z = 0.18 + Math.sin(S.time * 1.8) * 0.04;
    head.rotation.x = consume ? 0.35 + Math.sin(S.time * 14) * 0.2 : windup ? -0.55 : lunge ? 0.4 : 0.05 + Math.sin(S.time * 1.4) * 0.05;
    head.rotation.z = 0.35 + Math.sin(S.time * 2.2) * 0.08;
    jaw.rotation.x = consume ? 1.15 + Math.sin(S.time * 22) * 0.25 : lunge ? 0.85 : windup ? 0.35 : 0.22 + Math.sin(S.time * 1.6) * 0.06;
    leftArm.rotation.x = consume ? -1.7 + Math.sin(S.time * 17) * 0.3 : windup ? -2.2 : lunge ? 0.9 : -0.15 + Math.sin(gait) * 0.6 * moving;
    rightArm.rotation.x = consume ? -1.2 - Math.sin(S.time * 16) * 0.35 : windup ? -1.6 : lunge ? 1.15 : 0.2 - Math.sin(gait) * 0.35 * moving;
    extraArm.rotation.x = (consume || lunge ? -1.1 : -0.2) + Math.sin(S.time * 5.3) * 0.3;
    drag.rotation.x = 1.25 + Math.sin(S.time * 3.1) * 0.12 + (lunge ? 0.35 : 0);
    leftLeg.rotation.x = Math.sin(gait) * 0.5 * moving;
    rightLeg.rotation.x = -Math.sin(gait) * 0.28 * moving;
    model.mats.eye.emissiveIntensity = state === 'hunt' || state === 'lunge' || state === 'windup' || state === 'consume' ? 4.2 : 1.6;
    const growth = Math.min(1, S.eaten / 9);
    for (let i = 0; i < model.growthSacs.length; i++) {
      const pulse = 0.88 + 0.14 * Math.sin(S.time * 2.4 + i * 1.7);
      model.growthSacs[i].scale.set(0.13 + growth * 0.08, (0.16 + growth * 0.11) * pulse, 0.12 + growth * 0.07);
    }
    model.distortion.visible = S.surface === 'ground';
    model.distortion.material.opacity = growth * 0.4 * (0.82 + Math.sin(S.time * 2.3) * 0.18);
  }

  function updateSoulWisps() {
    const victim = S.mode === 'consume' && S.target?.alive ? S.target : null;
    for (let i = 0; i < soulWisps.length; i++) {
      const wisp = soulWisps[i];
      if (!victim) { wisp.visible = false; continue; }
      const t = (S.time * 0.46 + i / soulWisps.length) % 1;
      const arc = Math.sin(t * Math.PI);
      const hx = S.pos.x, hy = model.root.position.y + 2.85 * S.sizeScale, hz = S.pos.z;
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
    let playerDistance = Math.hypot(px - S.pos.x, pz - S.pos.z);
    let goal = null, speed = 0, state = 'stalk', moving = false;
    const attackReach = 3.5 + S.sizeScale * 0.35;
    let nearest = null, nearestDistance = 56;
    for (const c of citizens) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - S.pos.x, c.z - S.pos.z);
      if (d < nearestDistance) { nearestDistance = d; nearest = c; }
    }
    const mealNearby = nearest && nearestDistance < 22 && playerDistance > attackReach;
    if (S.mode === 'consume' && S.target?.alive) {
      S.eatT -= dt; state = 'consume'; speed = 0;
      S.heading = Math.atan2(S.target.x - S.pos.x, S.target.z - S.pos.z);
      if (S.eatT <= 0) { removeCitizen(S.target, 'eaten'); S.target = null; S.mode = 'stalk'; }
    } else if (S.mode === 'attackPlayer') {
      S.attackT -= dt;
      S.heading = Math.atan2(px - S.pos.x, pz - S.pos.z);
      if (S.attackT > 0.62) { state = 'windup'; speed = 0.45; goal = { x: px, z: pz }; }
      else if (S.attackT > 0.28) { state = 'lunge'; speed = 11.5 + S.eaten * 0.15; goal = { x: px, z: pz }; }
      else { state = 'recover'; speed = 0; }
      if (goal && speed > 0) {
        mover.r = Math.min(1.1, 0.42 * S.sizeScale);
        const moved = mover.update(dt, S.pos, goal, speed);
        moving = moved.speed > 0.15;
      }
      playerDistance = Math.hypot(px - S.pos.x, pz - S.pos.z);
      if (!S.attackHit && S.attackT <= 0.28) {
        S.attackHit = true;
        const hitRange = 2.6 + S.sizeScale * 0.7;
        if (playerDistance <= hitRange) {
          hooks.damage?.(26 + S.eaten * 5 + Math.min(14, S.round * 2), 'consumer');
          hooks.bump?.(S.pos.x, S.pos.z, S.sizeScale);
          if (!S.active) return;
        }
      }
      if (S.attackT <= 0) S.mode = 'stalk';
    } else if (mealNearby) {
      S.mode = 'feed'; S.target = nearest; state = 'scurry';
      goal = { x: nearest.x, z: nearest.z };
      speed = 3.15 + S.eaten * 0.1;
      mover.r = Math.min(1.1, 0.42 * S.sizeScale);
      const moved = mover.update(dt, S.pos, goal, speed);
      S.heading = Math.atan2(moved.vx || goal.x - S.pos.x, moved.vz || goal.z - S.pos.z);
      moving = moved.speed > 0.15;
      if (Math.hypot(nearest.x - S.pos.x, nearest.z - S.pos.z) < 1.45) {
        nearest.beingEaten = true; S.mode = 'consume'; S.eatT = 3.6; state = 'consume';
        say('The Consumer has someone. It is vulnerable while it feeds.');
      }
    } else {
      S.target = null; S.mode = 'huntPlayer';
      if (playerDistance < attackReach) {
        S.mode = 'attackPlayer'; S.attackT = 1.08; S.attackHit = false; state = 'windup';
      } else {
        state = 'hunt'; goal = { x: px, z: pz };
        speed = Math.min(7.6, 4.35 + S.round * 0.08 + S.eaten * 0.18);
        mover.r = Math.min(1.1, 0.42 * S.sizeScale);
        const moved = mover.update(dt, S.pos, goal, speed);
        S.heading = Math.atan2(moved.vx || goal.x - S.pos.x, moved.vz || goal.z - S.pos.z);
        moving = moved.speed > 0.15;
      }
    }
    if (S.playerSound?.age > 11) S.playerSound = null;
    if (S.mode !== 'attackPlayer') resolvePlayerContact(false);
    playerDistance = Math.hypot(camera.position.x - S.pos.x, camera.position.z - S.pos.z);
    updateStomp(dt, moving);
    model.root.visible = true;
    surfacePose(dt);
    model.root.position.x = S.pos.x; model.root.position.z = S.pos.z;
    model.root.rotation.y = S.heading;
    animateModel(dt, state, speed);
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
    const consumerY = model.root.position.y + (S.surface === 'ceiling' ? -2.55 : 1.72) * S.sizeScale;
    checkTarget(S, S.pos.x, consumerY, S.pos.z, spread * S.sizeScale * 0.9, 'consumer');
    if (!best) return false;
    const damage = options.damage ?? 1;
    if (targetKind === 'citizen') removeCitizen(best, 'killed');
    else {
      S.health -= damage;
      model.parts.head.rotation.z = 0.4;
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
    S.surface = 'ground'; S.surfaceT = 3 + Math.random() * 4; S.stompIn = 0.3; S.stompAge = -1; S.contactIn = 0; S.rescueId = null; S.rescueProgress = 0;
    S.eatT = 0; S.attackT = 0; S.attackHit = false; S.footstepIn = 0.2; S.breathIn = 1.3;
    const rng = (() => { let a = ((S.round * 0x45d9f3b) ^ Math.floor(center.x * 43 + center.z * 61) ^ 0x71c09eab) | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const spawn = place(center.x, center.z, 26, 38, rng);
    S.pos.set(spawn.x, 0, spawn.z); S.heading = Math.atan2(center.x - spawn.x, center.z - spawn.z);
    model.root.scale.setScalar(S.sizeScale); model.root.visible = true;
    model.root.position.set(S.pos.x, ground(S.pos.x, S.pos.z), S.pos.z);
    model.root.rotation.set(0, S.heading, 0);
    model.distortion.material.opacity = 0; mover.reset();
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
    stompRing.visible = false;
  }

  return {
    start, stop, update, shot, noise, worldAction,
    get active() { return S.active; }, get dead() { return S.dead; },
    get health() { return S.health; }, get maxHealth() { return S.maxHealth; },
    get sizeScale() { return S.sizeScale; }, get mode() { return S.mode; }, get surface() { return S.surface; },
    get x() { return S.pos.x; }, get z() { return S.pos.z; },
    get civilians() { return aliveCitizens(); }, get total() { return citizens.length; },
    get rescued() { return S.rescued; }, get eaten() { return S.eaten; }, get killed() { return S.killed; },
  };
}
