import * as THREE from 'three';
import { ObserverMovement } from '../observer/ObserverMovement.js';
import { monsterAsset } from '../world/MonsterAssets.js';

const HOUND_SIZE = 1.15;

function makeSingerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 48;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // A little pixel choir robe, with its eyes stitched shut.
  rect(11, 5, 10, 2, '#101116'); rect(8, 7, 16, 5, '#171920');
  rect(10, 11, 12, 8, '#aaa99e'); rect(9, 12, 2, 5, '#171920'); rect(21, 12, 2, 5, '#171920');
  rect(12, 13, 3, 1, '#28272a'); rect(17, 13, 3, 1, '#28272a');
  rect(13, 16, 7, 1, '#615a59'); rect(14, 18, 4, 3, '#171920');
  rect(8, 20, 16, 4, '#272830'); rect(6, 23, 20, 14, '#20212a');
  rect(4, 24, 4, 12, '#292a32'); rect(24, 24, 4, 12, '#292a32');
  rect(7, 36, 18, 5, '#181920'); rect(5, 41, 8, 3, '#101116'); rect(19, 41, 8, 3, '#101116');
  rect(13, 23, 2, 10, '#373842'); rect(17, 25, 2, 8, '#373842');
  for (const [x, y] of [[4, 27], [27, 29], [8, 33], [24, 34], [12, 39], [19, 39]]) rect(x, y, 1, 1, '#77736c');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRand(seed) {
  let a = seed | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createChoirRound({ scene, camera, world, audio = {}, hooks = {} }) {
  const texture = makeSingerTexture();
  const singerGeometry = new THREE.PlaneGeometry(1.15, 1.9);
  const singerMaterial = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const singers = [];
  const fallen = [];

  function removeSinger(s) {
    stopChase(s, 0.05);
    s.mesh.removeFromParent();
    if (s.hound) for (const mesh of s.hound.meshes) mesh.skeleton.dispose();
  }
  const bodyPos = new THREE.Vector3();
  let singing = null;

  const C = {
    active: false, t: 0, round: 1, state: 'LISTENING', alert: 0,
    hive: null, exposed: false, alive: 0, nextWave: 0, wave: 0,
    lastSound: null, soundHistory: [], soundAge: Infinity, footstepIn: 0, breathIn: 0, noiseScale: 1,
    tellT: 0, beat: 0, death: false,
  };

  function say(message) { hooks.say?.(message); }
  function sayNear(message) {
    const now = C.t;
    if (now - (C.lastToastAt || -20) < 7) return;
    C.lastToastAt = now;
    say(message);
  }
  const aliveSingers = () => singers.reduce((n, s) => n + (s.alive ? 1 : 0), 0);

  function addHive(x, z, rng) {
    const root = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x211418, emissive: 0x160309, emissiveIntensity: 0.5 });
    const flesh = new THREE.MeshLambertMaterial({ color: 0x69332d, emissive: 0x2a0808, emissiveIntensity: 0.8 });
    const pale = new THREE.MeshLambertMaterial({ color: 0xb8a29a, emissive: 0x260909, emissiveIntensity: 0.65 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), flesh);
    core.scale.set(1, 1.22, 0.88);
    root.add(core);
    // Strands anchor the suspended body to the earth and make the central shape read as a nest.
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9 + rng() * 0.18;
      const h = 1.1 + rng() * 1.2, r = 0.8 + rng() * 0.7;
      const end = new THREE.Vector3(Math.cos(a) * r, -h, Math.sin(a) * r);
      const start = new THREE.Vector3(Math.cos(a) * 0.28, 0.35 + rng() * 0.25, Math.sin(a) * 0.28);
      const mid = start.clone().lerp(end, 0.55); mid.x += Math.sin(a * 3) * 0.25; mid.z += Math.cos(a * 2) * 0.25;
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 7, 0.045 + rng() * 0.035, 4, false), dark);
      root.add(strand);
    }
    // The little faces share one mouth. Their slight offsets make the core feel fused together.
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + 0.3;
      const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), pale);
      face.position.set(Math.cos(a) * 0.46, (rng() - 0.5) * 0.5, Math.sin(a) * 0.43);
      face.scale.set(0.82, 1.1, 0.42);
      root.add(face);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.035), dark);
      mouth.position.set(face.position.x, face.position.y - 0.025, face.position.z + 0.1);
      root.add(mouth);
    }
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5040 });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), eyeMaterial);
    eye.position.set(0, 0.06, 0.72); root.add(eye);
    root.position.set(x, world.groundY(x, z) + 1.35, z);
    root.visible = false;
    scene.add(root);
    C.hive = { x, z, root, core, hp: 4 + Math.floor((C.round - 1) * 0.55), maxHp: 4 + Math.floor((C.round - 1) * 0.55), dead: false, pulse: 0, materials: [dark, flesh, pale, eyeMaterial] };
  }

  function placePoint(x, z, radius, rng) {
    for (let tries = 0; tries < 16; tries++) {
      const a = rng() * Math.PI * 2, d = radius * (0.6 + rng() * 0.8);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if ((!world.walkable || world.walkable(px, pz, 0.28)) && Math.hypot(px - camera.position.x, pz - camera.position.z) > 6) return [px, pz];
    }
    return [x + radius, z];
  }

  function makeSinger(x, z, rng, role) {
    const idle = role === 'still' ? 'Idle' : 'Idle_Sniff';
    const scale = HOUND_SIZE * (role === 'grunt' ? 1.15 : role === 'crawler' ? 0.85 : 1);
    const hound = monsterAsset('trayHound', { scale, idle });
    const mesh = hound?.root ?? new THREE.Mesh(singerGeometry, singerMaterial);
    const y = world.groundY(x, z) + (hound ? 0 : 0.95);
    mesh.position.set(x, y, z);
    mesh.rotation.order = 'YXZ';
    scene.add(mesh);
    const height = role === 'crawler' ? 0.9 : 1.9;
    if (!hound) {
      mesh.scale.set(role === 'crawler' ? 1.45 : 1, height / 1.9, 1);
      if (role === 'crawler') mesh.rotation.z = Math.PI * 0.48;
    }
    const a = rng() * Math.PI * 2;
    // Most singers stay packed around the hive; a few roam wide patrol rings.
    const radius = role === 'roamer' ? 15 + rng() * 19 : 3.5 + rng() * 8;
    return {
      mesh, hound, idle, x, z, y: y + (hound ? 0.47 * scale : 0), role, alive: true,
      houndScale: scale,
      poseTime: 0, pose: '',
      hp: C.round >= 4 && rng() < Math.min(0.8, 0.28 + (C.round - 4) * 0.1) ? 2 : 1,
      suspicion: 0, targetX: x, targetZ: z, searchT: 0, attackT: 1 + rng(),
      guardA: a, guardR: radius,
      orbit: (rng() < 0.5 ? -1 : 1) * (role === 'roamer' ? 0.07 + rng() * 0.12 : 0.025 + rng() * 0.075),
      phase: rng() * Math.PI * 2, speedFactor: 0.78 + rng() * 0.48,
      pace: 0, bank: 0, pounce: null,
      mover: world.canStep ? new ObserverMovement(world, role === 'crawler' ? 0.3 : 0.28) : null,
    };
  }

  const requiredGrunts = () => Math.min(3, 1 + Math.floor((C.round - 1) / 3));
  const singerCap = () => Math.min(30, Math.floor(7 + C.round * 2.3));
  const livingGrunts = () => singers.reduce((n, s) => n + (s.alive && s.role === 'grunt' ? 1 : 0), 0);
  function spawnWave(initial = false, reinforcement = false) {
    if (!C.hive || C.hive.dead) return;
    C.wave++;
    const missingGrunts = Math.max(0, requiredGrunts() - livingGrunts());
    if (aliveSingers() + missingGrunts > 30) {
      for (let i = singers.length - 1; i >= 0 && aliveSingers() + missingGrunts > 30; i--) {
        if (singers[i].role === 'grunt') continue;
        removeSinger(singers[i]); singers.splice(i, 1);
      }
    }
    const cap = Math.min(30, Math.max(singerCap(), aliveSingers() + missingGrunts));
    const amount = Math.min(Math.max(0, cap - aliveSingers()), reinforcement ? missingGrunts : Math.max(Math.ceil(4 + C.round * 1.1), missingGrunts));
    const rng = makeRand(((C.round * 0x45d9f3b) ^ (C.wave * 0x119de1f3) ^ Math.floor(C.t * 1000)) | 0);
    const roles = ['singer', 'crawler', 'backstep', 'echo', 'roamer', 'roamer', 'still'];
    for (let i = 0; i < amount; i++) {
      const role = livingGrunts() < requiredGrunts() ? 'grunt' : roles[(rng() * roles.length) | 0];
      // Dense ring around the hive, with roaming patrols reaching farther through the map.
      const patrol = role === 'roamer' || (!initial && rng() < 0.12);
      const [x, z] = placePoint(C.hive.x, C.hive.z, patrol ? 14 + rng() * 17 : 4 + rng() * 8, rng);
      const s = makeSinger(x, z, rng, role);
      if (initial && Math.hypot(x - camera.position.x, z - camera.position.z) < 11) {
        const [sx, sz] = placePoint(C.hive.x, C.hive.z, 13, rng); s.x = sx; s.z = sz;
      }
      singers.push(s);
    }
    C.alive = aliveSingers();
    const interval = Math.max(7.5, 22 - (C.round - 1) * 1.55);
    C.nextWave = C.t + (initial ? interval * 0.8 : interval);
  }

  function start({ round = 1 } = {}) {
    stop();
    C.active = true; C.death = false; C.t = 0; C.round = Math.max(1, round);
    C.state = 'LISTENING'; C.alert = 0; C.exposed = false; C.wave = 0; C.noiseScale = 1;
    C.lastSound = null; C.soundHistory.length = 0; C.soundAge = Infinity; C.footstepIn = 0.15; C.breathIn = 1.2; C.tellT = 0; C.beat = 0; C.lastToastAt = -20;
    let rng = makeRand((0x4f1bbcdc ^ (C.round * 0x7f4a7c15) ^ Math.floor(camera.position.x * 43 + camera.position.z * 61)) | 0);
    let hx = camera.position.x, hz = camera.position.z;
    for (let i = 0; i < 28; i++) {
      const a = rng() * Math.PI * 2, d = 22 + rng() * 16;
      const x = camera.position.x + Math.cos(a) * d, z = camera.position.z + Math.sin(a) * d;
      if ((!world.walkable || world.walkable(x, z, 1.1)) && Math.hypot(x - camera.position.x, z - camera.position.z) > 18) { hx = x; hz = z; break; }
    }
    addHive(hx, hz, rng);
    C.nextWave = 0;
    spawnWave(true);
  }

  // A one-shot at a place in the world: faint far away, loud up close, panned toward it.
  function playAt(buf, x, z, volume) {
    if (!buf || !audio.ctx || !audio.dest) return;
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    const src = audio.ctx.createBufferSource(), gain = audio.ctx.createGain(), pan = audio.ctx.createStereoPanner();
    const dx = x - camera.position.x, dz = z - camera.position.z, dist = Math.hypot(dx, dz);
    const yaw = camera.rotation.y;
    const right = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / (dist || 1);
    const near = Math.max(0, 1 - dist / 28);
    src.buffer = buf;
    gain.gain.value = volume * (0.28 + 0.72 * near * near);
    pan.pan.value = Math.max(-1, Math.min(1, right));
    src.connect(gain).connect(pan).connect(audio.dest);
    src.start();
  }

  function stopChase(s, fade = 0.16) {
    const v = s.chase;
    if (!v || !audio.ctx) return;
    s.chase = null;
    const t = audio.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
    try { v.src.stop(t + fade + 0.03); } catch { /* already stopped */ }
    v.src.onended = () => { for (const node of v.nodes) { try { node.disconnect(); } catch { /* already gone */ } } };
  }
  function stopAllChases() {
    for (const s of singers) stopChase(s, 0.12);
    for (const s of fallen) stopChase(s, 0.12);
  }
  function syncChase(s, on) {
    if (!audio.houndChase || !audio.ctx || !audio.dest) return;
    const dx = s.x - camera.position.x, dz = s.z - camera.position.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (!on || dist > 52) { stopChase(s); return; }
    if (!s.chase) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      const src = audio.ctx.createBufferSource(), gain = audio.ctx.createGain(), pan = audio.ctx.createStereoPanner();
      src.buffer = audio.houndChase; src.loop = true; gain.gain.value = 0;
      src.connect(gain).connect(pan).connect(audio.dest); src.start();
      s.chase = { src, gain, pan, nodes: [src, gain, pan] };
    }
    const yaw = camera.rotation.y;
    const right = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / dist;
    const near = Math.pow(Math.max(0, 1 - dist / 46), 1.15);
    const walls = world.losBlocked?.(camera.position.x, camera.position.z, s.x, s.z) ? 0.4 : 1;
    const biting = !!s.pounce || (s.attackT > 0 && dist < 2.4);
    const t = audio.ctx.currentTime;
    s.chase.gain.gain.setTargetAtTime(near * walls * (biting ? 0.42 : 0.92), t, 0.08);
    s.chase.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, right)), t, 0.06);
  }

  function startSinging() {
    if (singing || !audio.sing || !audio.ctx || !audio.dest) return;
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    const src = audio.ctx.createBufferSource(), gain = audio.ctx.createGain(), pan = audio.ctx.createStereoPanner();
    src.buffer = audio.sing; src.loop = true; gain.gain.value = 0;
    src.connect(gain).connect(pan).connect(audio.dest); src.start();
    singing = { src, gain, pan };
  }

  function noise(x, z, volume = 0.4, kind = 'noise') {
    if (!C.active || !C.hive || C.hive.dead) return false;
    volume *= C.noiseScale;
    const hearing = (36 + C.round * 2.2) * Math.sqrt(Math.max(0.08, volume));
    let heard = 0;
    for (const s of singers) {
      if (!s.alive) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > hearing) continue;
      const wall = world.losBlocked?.(s.x, s.z, x, z) ? 0.58 : 1;
      const signal = Math.max(0, volume * wall - d / hearing * 0.55);
      if (signal < 0.055) continue;
      heard++;
      const spread = (1 - signal) * (1.8 + C.round * 0.12);
      let tx = x + (Math.random() - 0.5) * spread, tz = z + (Math.random() - 0.5) * spread;
      if (s.role === 'echo') {
        const delayed = C.soundHistory.find((entry) => entry.age >= 2.5) || C.soundHistory[0];
        if (delayed) { tx = delayed.x; tz = delayed.z; }
      }
      s.targetX = tx; s.targetZ = tz;
      s.searchT = Math.max(s.searchT, 7 + signal * 9);
      s.suspicion = Math.min(1, Math.max(s.suspicion, 0.22 + signal * 0.78));
      if (signal > 0.45) C.alert = Math.max(C.alert, Math.min(1, signal + (volume > 0.8 ? 0.5 : 0.12)));
    }
    if (heard) {
      C.soundAge = 0;
      C.lastSound = { x, z, kind, age: 0 };
      C.soundHistory.push({ x, z, age: 0 });
      if (C.soundHistory.length > 16) C.soundHistory.shift();
      if (volume > 0.82) C.alert = 1;
      if (volume > 0.55 && C.state === 'LISTENING') C.state = 'SEARCHING';
    }
    return !!heard;
  }

  function movementNoise(dt, info) {
    if (info.moving) {
      C.footstepIn -= dt;
      if (C.footstepIn <= 0) {
        const clutter = info.swimming ? 0 : (world.clutter?.(info.x, info.z, 1.2) || 0);
        let surface = info.swimming ? 1.1 : info.environment === 'cave' ? 0.92 : info.environment === 'snow' ? 0.65 : info.environment === 'rural' ? 0.84 : 0.72;
        if (info.environment === 'rural') surface = clutter > 1 ? 0.68 : 1.08;
        if (info.environment === 'forest') surface = clutter > 1 ? 0.62 : 0.84;
        // Snow, woods and the outskirts carry footsteps farther. The other maps stay as they are.
        const carry = info.environment === 'snow' || info.environment === 'forest' || info.environment === 'rural' ? 1.7 : 1;
        const volume = info.holdingBreath ? (info.running ? 0.14 : 0.045) : info.running ? 1 : 0.42;
        noise(info.x, info.z, volume * surface * Math.max(0.5, 1 - clutter / 5) * carry * (info.surfaceNoise ?? 1), info.running ? 'running' : 'footstep');
        C.footstepIn = info.running ? Math.max(0.25, 0.46 - C.round * 0.012) : 0.72;
      }
    } else C.footstepIn = Math.min(C.footstepIn, 0.18);

    if (!info.holdingBreath) {
      C.breathIn -= dt;
      if (C.breathIn <= 0) {
        noise(info.x, info.z, (info.running ? 0.52 : info.moving ? 0.32 : 0.2) * (info.ambientNoise ?? 1), 'breathing');
        C.breathIn = Math.max(0.8, 1.6 - C.round * 0.06);
      }
    } else C.breathIn = 0.5;
  }

  function moveSinger(s, tx, tz, speed, dt) {
    let dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
    if (dist < 0.15 || speed <= 0) return 0;
    if (s.mover && s.suspicion > 0.2 && world.cellWalkable(world.grid.cellOf(tx), world.grid.cellOf(tz))) {
      const motion = s.mover.update(dt, s, { x: tx, z: tz }, speed);
      if (motion.speed > 0.05) {
        const sign = !s.hound && s.role === 'backstep' ? -1 : 1;
        s.mesh.userData.faceX = motion.vx * sign; s.mesh.userData.faceZ = motion.vz * sign;
      }
      return motion.speed * dt;
    }
    dx /= dist; dz /= dist;
    // The backward singer keeps its face pointed at the sound while stepping away from it.
    const sign = !s.hound && s.role === 'backstep' && s.suspicion > 0.2 ? -1 : 1;
    const step = Math.min(dist, speed * dt);
    const angles = [0, 0.7, -0.7, 1.35, -1.35, Math.PI];
    for (const turn of angles) {
      const a = Math.atan2(dz, dx) + turn;
      const nx = s.x + Math.cos(a) * step, nz = s.z + Math.sin(a) * step;
      if (!world.walkable || world.walkable(nx, nz, s.role === 'crawler' ? 0.3 : 0.28)) {
        s.mesh.userData.faceX = Math.cos(a) * sign;
        s.mesh.userData.faceZ = Math.sin(a) * sign;
        s.x = nx; s.z = nz;
        return step;
      }
    }
    return 0;
  }

  const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function updateHound(s, dt, tx, tz, speed, px, pz, tracking) {
    const facing = s.mesh.rotation.y;
    const inward = C.tellT > 0;
    const toPlayer = Math.atan2(px - s.x, pz - s.z);
    const distance = Math.hypot(px - s.x, pz - s.z);
    const blocked = () => world.losBlocked?.(s.x, s.z, px, pz);
    const staggered = s.pose === 'Hit' && s.poseTime > 0;
    let heading = Math.atan2(tx - s.x, tz - s.z), motion = 0;
    if (inward || staggered) s.pounce = null;
    const canPounce = !inward && !staggered && s.attackT <= 0 && s.suspicion > 0.35 &&
      distance < 2.9 && !blocked();
    if (!s.pounce && canPounce && Math.abs(angleTo(facing, toPlayer)) < 0.85) {
      s.pounce = { age: 0, heading: toPlayer, struck: false, stopped: false };
      s.attackT = 1.48 + s.speedFactor * 0.18;
      s.hound.animate('Attack_Shred', 0, { once: true, rate: 2.65, restart: true });
      playAt(audio.queenAttack, s.x, s.z, 0.95);
    }
    if (s.pounce) {
      const p = s.pounce;
      p.age += dt;
      heading = p.heading;
      if (p.age >= 0.19 && p.age < 0.47 && !p.stopped) {
        const step = 7.8 * dt;
        const nx = s.x + Math.sin(heading) * step, nz = s.z + Math.cos(heading) * step;
        if (world.walkable && !world.walkable(nx, nz, 0.31)) p.stopped = true;
        else if (distance > 0.72) { s.x = nx; s.z = nz; }
        if (!p.struck && Math.hypot(px - s.x, pz - s.z) < 1.23 &&
            Math.abs(angleTo(heading, toPlayer)) < 1.0 && !blocked()) {
          p.struck = true;
          hooks.damage?.(7 + Math.min(9, C.round * 1.35), 'choir');
          if (!C.active) return;
          C.alert = Math.max(C.alert, 0.75);
        }
      }
      s.pace = 0;
      s.hound.animate('Attack_Shred', dt, { once: true, rate: 2.65 });
      if (p.age >= 0.78) s.pounce = null;
    } else {
      if (inward) heading = Math.atan2(C.hive.x - s.x, C.hive.z - s.z);
      const sniffPause = !tracking && Math.sin(C.t * 1.4 + s.phase) < -0.59;
      const turnBrake = 0.50 + 0.50 * Math.max(0, Math.cos(angleTo(facing, heading)));
      const desired = inward || staggered || sniffPause ? 0 : speed * turnBrake;
      s.pace += (desired - s.pace) * Math.min(1, dt * (desired > s.pace ? 5.8 : 10));
      if (!inward && !staggered && s.pace > 0.06) motion = moveSinger(s, tx, tz, s.pace, dt) / Math.max(dt, 0.001);
      if (motion > 0.12) heading = Math.atan2(s.mesh.userData.faceX, s.mesh.userData.faceZ);
      if (canPounce) heading = toPlayer;
      if (staggered) s.hound.animate('Hit', dt, { once: true, rate: 1.7 });
      else if (motion < 0.13) s.hound.animate(s.idle, dt, { rate: 0.75 + s.speedFactor * 0.19 });
      else if (motion < 1.2) s.hound.animate('Walk', dt, { rate: THREE.MathUtils.clamp(motion / 0.36, 0.63, 2.45) });
      else s.hound.animate(C.state === 'FRENZY' ? 'Run_Shred' : 'Run', dt, { rate: THREE.MathUtils.clamp(motion / 2.6, 0.65, 1.75) });
    }
    const turn = angleTo(facing, heading);
    s.mesh.rotation.y += THREE.MathUtils.clamp(turn, -dt * 10, dt * 10);
    const bank = motion > 1.2 ? THREE.MathUtils.clamp(-turn * 0.22, -0.22, 0.22) : 0;
    s.bank += (bank - s.bank) * Math.min(1, dt * 11);
    s.mesh.rotation.z = s.bank;
    const floor = world.groundY(s.x, s.z);
    s.y = floor + 0.47 * s.houndScale;
    s.mesh.position.set(s.x, floor, s.z);
  }

  function expose() {
    if (C.exposed || !C.hive || C.hive.dead) return;
    C.exposed = true; C.hive.root.visible = true; C.tellT = 1.2;
    C.lastSound = { x: camera.position.x, z: camera.position.z, kind: 'hive reveal', age: 0 };
    C.soundAge = 0;
    // The whole group turns inward at once, as if the Hive Mind inhaled.
    for (const s of singers) if (s.alive) { s.suspicion = Math.max(s.suspicion, 0.5); s.searchT = Math.max(s.searchT, 4); s.targetX = camera.position.x; s.targetZ = camera.position.z; }
    C.alert = Math.max(C.alert, 0.72);
    sayNear('The Choir turns inward. The Hive Mind is exposed.');
  }

  function update(dt, info = {}) {
    if (!C.active || C.death || info.inControl === false) { stopAllChases(); return; }
    for (let i = fallen.length - 1; i >= 0; i--) {
      const s = fallen[i];
      s.poseTime -= dt;
      if (s.poseTime > 0) s.hound.animate('Death', dt, { once: true, rate: 1.55 });
      else { removeSinger(s); fallen.splice(i, 1); }
    }
    C.noiseScale = THREE.MathUtils.clamp(info.noiseScale ?? 1, 0.5, 1.15);
    if (info.inControl) startSinging();
    C.t += dt; C.beat += dt; C.soundAge += dt;
    C.tellT = Math.max(0, C.tellT - dt);
    if (C.lastSound) C.lastSound.age += dt;
    for (const item of C.soundHistory) item.age += dt;
    movementNoise(dt, info);
    const px = info.x ?? camera.position.x, pz = info.z ?? camera.position.z;
    const hiveDist = C.hive ? Math.hypot(px - C.hive.x, pz - C.hive.z) : Infinity;
    if (hiveDist < 15.5 && !world.losBlocked?.(px, pz, C.hive.x, C.hive.z)) expose();

    if (C.soundAge > 5) C.alert = Math.max(0, C.alert - dt * (C.soundAge > 11 ? 0.15 : 0.065));
    const maxSuspicion = singers.reduce((m, s) => Math.max(m, s.alive ? s.suspicion : 0), 0);
    C.alive = aliveSingers();
    if (C.alert > 0.86 || (C.alert > 0.55 && C.alive >= 4)) C.state = 'FRENZY';
    else if (C.alert > 0.48 || (C.alert > 0.3 && C.alive >= 3)) C.state = 'CHORUS';
    else if (maxSuspicion > 0.34 || C.alert > 0.12) C.state = 'HUNTING';
    else if (maxSuspicion > 0.05) C.state = 'SEARCHING';
    else C.state = 'LISTENING';

    const sharedBurst = Math.sin(C.beat * (C.state === 'FRENZY' ? 6.2 : 4.8)) > -0.15;
    for (const s of singers) {
      if (!s.alive) continue;
      s.suspicion = Math.max(0, s.suspicion - dt * (C.soundAge > 10 ? 0.105 : 0.035));
      s.searchT = Math.max(0, s.searchT - dt);
      s.attackT -= dt;
      let tx, tz, speed;
      const tracking = s.suspicion > 0.08 && (s.searchT > 0 || C.soundAge < 4.5) && !!C.lastSound;
      if (tracking) {
        tx = s.targetX; tz = s.targetZ;
        const d = Math.hypot(tx - s.x, tz - s.z);
        speed = (1.8 + Math.min(1.5, (C.round - 1) * 0.18) + C.alert * 0.65) * s.speedFactor;
        if (C.state === 'FRENZY') speed += 0.8;
        if (!s.hound && d < 2.1 && s.suspicion > 0.35) { tx = px; tz = pz; speed += 0.25; }
        if (s.hound && s.role === 'backstep' && d > 3.5) {
          const side = Math.sign(s.orbit) * Math.min(2.3, d * 0.25);
          tx += (s.targetZ - s.z) / d * side;
          tz -= (s.targetX - s.x) / d * side;
        }
      } else {
        s.guardA += dt * s.orbit * (1 + C.round * 0.025);
        tx = C.hive.x + Math.cos(s.guardA) * s.guardR;
        tz = C.hive.z + Math.sin(s.guardA) * s.guardR;
        speed = (s.hound ? 0.50 : 0.75) * s.speedFactor + Math.min(0.35, C.round * 0.045);
      }
      if (s.role === 'still' && C.state !== 'FRENZY') speed = s.suspicion > 0.5 ? speed * 0.35 : 0;
      if (C.state === 'CHORUS' || C.state === 'FRENZY') speed *= sharedBurst ? 1 : s.hound ? 0.70 : 0;
      if (C.tellT > 0) speed = 0;
      if (s.role === 'echo' && s.suspicion > 0.15 && C.lastSound?.age > 1.2) {
        // This one follows an old sound; it continues toward the place the player has already left.
        if (C.lastSound.age > 4) { tx = C.lastSound.x; tz = C.lastSound.z; }
      }
      s.poseTime = Math.max(0, s.poseTime - dt);
      if (s.hound) {
        updateHound(s, dt, tx, tz, speed, px, pz, tracking);
        if (!C.active) return;
        syncChase(s, (tracking || !!s.pounce) && C.tellT <= 0);
        continue;
      }
      moveSinger(s, tx, tz, speed, dt);
      s.mesh.position.x = s.x;
      s.mesh.position.z = s.z;
      const floor = world.groundY(s.x, s.z);
      s.y = floor + (s.role === 'crawler' ? 0.47 : 0.95);
      s.mesh.position.y = s.y + Math.sin(C.t * (s.role === 'crawler' ? 3 : 2) + s.phase) * 0.035;
      const faceX = s.mesh.userData.faceX ?? (C.hive.x - s.x), faceZ = s.mesh.userData.faceZ ?? (C.hive.z - s.z);
      if (C.tellT > 0 || (s.role === 'still' && s.suspicion < 0.2)) s.mesh.rotation.y = Math.atan2(C.hive.x - s.x, C.hive.z - s.z);
      else s.mesh.rotation.y = Math.atan2(faceX, faceZ);
      s.mesh.rotation.z = (s.role === 'crawler' ? Math.PI * 0.48 : 0) + Math.sin(C.t * 2 + s.phase) * 0.025;

      const dPlayer = Math.hypot(px - s.x, pz - s.z);
      if (dPlayer < 1.45 && s.suspicion > 0.25 && s.attackT <= 0 && (!world.canStep || !world.losBlocked(px, pz, s.x, s.z))) {
        s.attackT = Math.max(0.62, 1.45 - C.round * 0.07);
        playAt(audio.queenAttack, s.x, s.z, 0.95);
        hooks.damage?.(7 + Math.min(9, C.round * 1.35), 'choir');
        if (!C.active) return;
        C.alert = Math.max(C.alert, 0.75);
      }
      syncChase(s, tracking && C.tellT <= 0);
    }

    C.alive = aliveSingers();
    if (livingGrunts() < requiredGrunts()) spawnWave(false, true);
    else if (C.alive < singerCap() && C.t >= C.nextWave) spawnWave();

    if (C.hive && !C.hive.dead) {
      C.hive.pulse += dt;
      C.hive.root.rotation.y = Math.sin(C.t * 0.35) * 0.16;
      C.hive.root.position.y = world.groundY(C.hive.x, C.hive.z) + 1.35 + Math.sin(C.hive.pulse * 2.2) * 0.06;
      C.hive.core.scale.set(1 + Math.sin(C.hive.pulse * 2.2) * 0.05, 1.22 + Math.sin(C.hive.pulse * 2.2) * 0.07, 0.88);
    }
    if (singing) {
      let nearest = null, best = Infinity;
      for (const s of singers) if (s.alive) { const d = Math.hypot(px - s.x, pz - s.z); if (d < best) { best = d; nearest = s; } }
      const target = nearest || C.hive;
      if (target) {
        camera.getWorldPosition(bodyPos);
        const dx = target.x - bodyPos.x, dz = target.z - bodyPos.z;
        const side = (dx * Math.cos(info.yaw || 0) - dz * Math.sin(info.yaw || 0)) / (Math.hypot(dx, dz) || 1);
        singing.pan.pan.value = THREE.MathUtils.clamp(side, -1, 1);
        const soundDistance = nearest ? best : Math.hypot(px - target.x, pz - target.z);
        const chorusLift = C.state === 'FRENZY' ? 0.075 : C.state === 'CHORUS' ? 0.035 : 0;
        singing.gain.gain.value = soundDistance > 42 ? 0.015 : 0.018 + 0.08 * (1 - soundDistance / 42) + chorusLift;
      }
    }
  }

  function shot(origin, dir, options = {}) {
    if (!C.active || C.death) return null;
    const melee = !!options.melee, range = options.range ?? 48, damage = Math.max(1, options.damage || 1);
    noise(origin.x, origin.z, melee ? (options.noiseVolume ?? 0.38) : 2.2, melee ? 'weapon swing' : 'gunshot');
    let hiveHitT = Infinity;
    if (C.hive && C.exposed && !C.hive.dead) {
      bodyPos.set(C.hive.x, C.hive.root.position.y, C.hive.z);
      const cx = bodyPos.x - origin.x, cy = bodyPos.y - origin.y, cz = bodyPos.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
      if (t > 0 && t < range && mx * mx + my * my + mz * mz < (melee ? 1.25 : 0.82) && !world.losBlocked?.(origin.x, origin.z, C.hive.x, C.hive.z)) hiveHitT = t;
    }
    let closest = null, closestT = range;
    for (const s of singers) {
      if (!s.alive) continue;
      bodyPos.set(s.x, s.y, s.z);
      const cx = bodyPos.x - origin.x, cy = bodyPos.y - origin.y, cz = bodyPos.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
      if (s.hound) {
        const limit = Math.min(closestT, hiveHitT);
        const radius = 1.65 * HOUND_SIZE;
        if (t < -radius || t > limit + radius || mx * mx + my * my + mz * mz > radius ** 2 ||
            world.losBlocked?.(origin.x, origin.z, s.x, s.z)) continue;
        const contact = s.hound.rayHit(origin, dir, limit, melee ? 0.40 : 0.12);
        if (contact) { closest = s; closestT = contact.distanceTo(origin); }
        continue;
      }
      if (t <= 0 || t >= closestT || t >= hiveHitT) continue;
      if (mx * mx + mz * mz < (melee ? 0.9 : 0.32) && Math.abs(my) < (melee ? 1.25 : 0.92) && !world.losBlocked?.(origin.x, origin.z, s.x, s.z)) { closest = s; closestT = t; }
    }
    if (closest) {
      closest.hp -= damage;
      closest.suspicion = 1; closest.searchT = 10; closest.targetX = origin.x; closest.targetZ = origin.z;
      if (closest.hp <= 0) {
        stopChase(closest, 0.1);
        playAt(audio.gruntDeath, closest.x, closest.z, 0.9);
        closest.alive = false;
        if (closest.hound) {
          closest.poseTime = 1.7;
          closest.hound.animate('Death', 0, { once: true, rate: 1.55 });
          fallen.push(closest);
        } else removeSinger(closest);
        const index = singers.indexOf(closest);
        if (index >= 0) singers.splice(index, 1);
        C.alive = aliveSingers();
        if (!C.alive) C.nextWave = Math.min(C.nextWave, C.t + 4.5);
      } else if (closest.hound) {
        closest.pose = 'Hit'; closest.poseTime = 0.40;
        closest.hound.animate('Hit', 0, { once: true, rate: 1.7, restart: true });
      }
      C.alert = Math.max(C.alert, 0.92);
      return { kind: 'singer', killed: closest.hp <= 0 };
    }

    if (Number.isFinite(hiveHitT)) {
      C.hive.hp -= damage;
      C.alert = 1;
      for (const s of singers) if (s.alive) { s.suspicion = 1; s.searchT = 14; s.targetX = origin.x; s.targetZ = origin.z; }
      if (C.hive.hp <= 0) {
        playAt(audio.queenDeath, C.hive.x, C.hive.z, 1);
        C.hive.dead = true; C.death = true; C.hive.root.visible = false;
        if (singing) { singing.gain.gain.value = 0; }
        stopAllChases();
        say('The Choir falls silent. The Hive Mind is dead.');
        return { kind: 'hive', killed: true };
      }
      say(`The Hive Mind pulses. ${C.hive.hp} shots remain.`);
      return { kind: 'hive', killed: false };
    }
    if (C.hive && !C.exposed) sayNear('The singers recoil around something unseen. Get closer.');
    return null;
  }

  function stop() {
    C.active = false;
    for (const s of singers) removeSinger(s);
    for (const s of fallen) removeSinger(s);
    singers.length = 0;
    fallen.length = 0;
    if (C.hive) {
      scene.remove(C.hive.root);
      C.hive.root.traverse((o) => { if (o.geometry && o.geometry !== singerGeometry) o.geometry.dispose(); });
      for (const m of C.hive.materials || []) m.dispose();
      C.hive = null;
    }
    if (singing) {
      const voice = singing; singing = null;
      const now = audio.ctx?.currentTime || 0;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.25);
      try { voice.src.stop(now + 0.3); } catch { /* already stopped */ }
    }
    C.alive = 0; C.exposed = false; C.alert = 0; C.state = 'LISTENING';
  }

  return { ...C, get active() { return C.active; }, get hive() { return C.hive; }, get exposed() { return C.exposed; }, get alive() { return C.alive; }, get grunts() { return livingGrunts(); }, get state() { return C.state; }, get t() { return C.t; }, get death() { return C.death; }, get singers() { return singers; }, start, stop, update, noise, shot };
}
