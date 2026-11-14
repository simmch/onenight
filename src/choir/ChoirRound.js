import * as THREE from 'three';

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
    const mesh = new THREE.Mesh(singerGeometry, singerMaterial);
    mesh.position.set(x, world.groundY(x, z) + 0.95, z);
    mesh.rotation.order = 'YXZ';
    scene.add(mesh);
    const height = role === 'crawler' ? 0.9 : 1.9;
    mesh.scale.set(role === 'crawler' ? 1.45 : 1, height / 1.9, 1);
    if (role === 'crawler') mesh.rotation.z = Math.PI * 0.48;
    const a = rng() * Math.PI * 2;
    const radius = 5 + rng() * 7;
    return {
      mesh, x, z, y: 0, role, alive: true,
      hp: C.round >= 4 && rng() < Math.min(0.8, 0.28 + (C.round - 4) * 0.1) ? 2 : 1,
      suspicion: 0, targetX: x, targetZ: z, searchT: 0, attackT: 1 + rng(),
      guardA: a, guardR: radius, orbit: (rng() - 0.5) * 0.12,
      phase: rng() * Math.PI * 2, roleDelay: 0, speedFactor: 0.78 + rng() * 0.48,
    };
  }

  const requiredGrunts = () => Math.min(3, 1 + Math.floor((C.round - 1) / 3));
  const livingGrunts = () => singers.reduce((n, s) => n + (s.alive && s.role === 'grunt' ? 1 : 0), 0);
  function spawnWave(initial = false, reinforcement = false) {
    if (!C.hive || C.hive.dead) return;
    C.wave++;
    const missingGrunts = Math.max(0, requiredGrunts() - livingGrunts());
    if (aliveSingers() + missingGrunts > 14) {
      for (let i = singers.length - 1; i >= 0 && aliveSingers() + missingGrunts > 14; i--) {
        if (singers[i].role === 'grunt') continue;
        scene.remove(singers[i].mesh); singers.splice(i, 1);
      }
    }
    const cap = Math.min(14, Math.max(Math.floor(3 + C.round * 1.45), aliveSingers() + missingGrunts));
    const amount = Math.min(Math.max(0, cap - aliveSingers()), reinforcement ? missingGrunts : Math.max(Math.ceil(2 + C.round * 0.72), missingGrunts));
    const rng = makeRand(((C.round * 0x45d9f3b) ^ (C.wave * 0x119de1f3) ^ Math.floor(C.t * 1000)) | 0);
    const roles = ['singer', 'crawler', 'backstep', 'echo', 'still'];
    for (let i = 0; i < amount; i++) {
      const [x, z] = placePoint(C.hive.x, C.hive.z, 7 + rng() * 7, rng);
      const role = livingGrunts() < requiredGrunts() ? 'grunt' : roles[(i + C.wave - 1) % roles.length];
      const s = makeSinger(x, z, rng, role);
      if (initial && Math.hypot(x - camera.position.x, z - camera.position.z) < 11) {
        const [sx, sz] = placePoint(C.hive.x, C.hive.z, 13, rng); s.x = sx; s.z = sz;
      }
      singers.push(s);
    }
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
    const hearing = (25 + C.round * 1.9) * Math.max(0.15, volume);
    let heard = 0;
    for (const s of singers) {
      if (!s.alive) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > hearing) continue;
      const wall = world.losBlocked?.(s.x, s.z, x, z) ? 0.58 : 1;
      const signal = Math.max(0, volume * wall - d / hearing * 0.6);
      if (signal < 0.055) continue;
      heard++;
      const spread = (1 - signal) * (1.8 + C.round * 0.12);
      let tx = x + (Math.random() - 0.5) * spread, tz = z + (Math.random() - 0.5) * spread;
      if (s.role === 'echo') {
        const delayed = C.soundHistory.find((entry) => entry.age >= 2.5) || C.soundHistory[0];
        if (delayed) { tx = delayed.x; tz = delayed.z; }
      }
      s.targetX = tx; s.targetZ = tz;
      s.searchT = Math.max(s.searchT, 5 + signal * 8);
      s.suspicion = Math.min(1, Math.max(s.suspicion, 0.18 + signal * 0.92));
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
        const volume = info.holdingBreath ? (info.running ? 0.14 : 0.045) : info.running ? 1 : 0.42;
        noise(info.x, info.z, volume * surface * Math.max(0.5, 1 - clutter / 5), info.running ? 'running' : 'footstep');
        C.footstepIn = info.running ? Math.max(0.25, 0.46 - C.round * 0.012) : 0.72;
      }
    } else C.footstepIn = Math.min(C.footstepIn, 0.18);

    if (!info.holdingBreath) {
      C.breathIn -= dt;
      if (C.breathIn <= 0) {
        noise(info.x, info.z, info.running ? 0.52 : info.moving ? 0.32 : 0.2, 'breathing');
        C.breathIn = Math.max(0.8, 1.6 - C.round * 0.06);
      }
    } else C.breathIn = 0.5;
  }

  function moveSinger(s, tx, tz, speed, dt) {
    let dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
    if (dist < 0.15) return 0;
    dx /= dist; dz /= dist;
    // The backward singer keeps its face pointed at the sound while stepping away from it.
    const backwards = s.role === 'backstep' && s.suspicion > 0.2;
    const faceX = backwards ? -dx : dx, faceZ = backwards ? -dz : dz;
    s.mesh.userData.faceX = faceX; s.mesh.userData.faceZ = faceZ;
    const step = Math.min(dist, speed * dt);
    const angles = [0, 0.7, -0.7, 1.35, -1.35, Math.PI];
    for (const turn of angles) {
      const a = Math.atan2(dz, dx) + turn;
      const nx = s.x + Math.cos(a) * step, nz = s.z + Math.sin(a) * step;
      if (!world.walkable || world.walkable(nx, nz, s.role === 'crawler' ? 0.3 : 0.28)) { s.x = nx; s.z = nz; return step; }
    }
    return 0;
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
    if (!C.active || C.death) return;
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
      if (s.suspicion > 0.08 && (s.searchT > 0 || C.soundAge < 4.5) && C.lastSound) {
        tx = s.targetX; tz = s.targetZ;
        const d = Math.hypot(tx - s.x, tz - s.z);
        speed = (1.4 + Math.min(1.2, (C.round - 1) * 0.15) + C.alert * 0.45) * s.speedFactor;
        if (C.state === 'FRENZY') speed += 0.55;
        if (d < 2.1 && s.suspicion > 0.35) { tx = px; tz = pz; speed += 0.25; }
      } else {
        s.guardA += dt * s.orbit * (1 + C.round * 0.025);
        tx = C.hive.x + Math.cos(s.guardA) * s.guardR;
        tz = C.hive.z + Math.sin(s.guardA) * s.guardR;
        speed = (0.75 + C.round * 0.055) * s.speedFactor;
      }
      if (s.role === 'still' && C.state !== 'FRENZY') speed = s.suspicion > 0.5 ? speed * 0.35 : 0;
      if (C.state === 'CHORUS' || C.state === 'FRENZY') speed *= sharedBurst ? 1 : 0;
      if (C.tellT > 0) speed = 0;
      if (s.role === 'echo' && s.suspicion > 0.15 && C.lastSound?.age > 1.2) {
        // This one follows an old sound; it continues toward the place the player has already left.
        if (C.lastSound.age > 4) { tx = C.lastSound.x; tz = C.lastSound.z; }
      }
      moveSinger(s, tx, tz, speed, dt);
      s.mesh.position.x = s.x;
      s.mesh.position.z = s.z;
      s.y = world.groundY(s.x, s.z) + (s.role === 'crawler' ? 0.47 : 0.95);
      s.mesh.position.y = s.y + Math.sin(C.t * (s.role === 'crawler' ? 3 : 2) + s.phase) * 0.035;
      const faceX = s.mesh.userData.faceX ?? (C.hive.x - s.x), faceZ = s.mesh.userData.faceZ ?? (C.hive.z - s.z);
      if (C.tellT > 0 || (s.role === 'still' && s.suspicion < 0.2)) s.mesh.rotation.y = Math.atan2(C.hive.x - s.x, C.hive.z - s.z);
      else s.mesh.rotation.y = Math.atan2(faceX, faceZ);
      if (s.role === 'crawler') s.mesh.rotation.z = Math.PI * 0.48 + Math.sin(C.t * 2 + s.phase) * 0.035;
      else s.mesh.rotation.z = Math.sin(C.t * 2 + s.phase) * 0.025;

      const dPlayer = Math.hypot(px - s.x, pz - s.z);
      if (dPlayer < 1.45 && s.suspicion > 0.25 && s.attackT <= 0) {
        s.attackT = Math.max(0.62, 1.45 - C.round * 0.07);
        playAt(audio.queenAttack, s.x, s.z, 0.95);
        hooks.damage?.(7 + Math.min(9, C.round * 1.35), 'choir');
        C.alert = Math.max(C.alert, 0.75);
      }
    }

    C.alive = aliveSingers();
    if (livingGrunts() < requiredGrunts()) spawnWave(false, true);
    else if (C.alive < Math.min(14, 3 + C.round * 1.45) && C.t >= C.nextWave) spawnWave();

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
      if (t <= 0 || t >= closestT || t >= hiveHitT) continue;
      const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
      if (mx * mx + mz * mz < (melee ? 0.9 : 0.32) && Math.abs(my) < (melee ? 1.25 : 0.92) && !world.losBlocked?.(origin.x, origin.z, s.x, s.z)) { closest = s; closestT = t; }
    }
    if (closest) {
      closest.hp -= damage;
      closest.suspicion = 1; closest.searchT = 10; closest.targetX = origin.x; closest.targetZ = origin.z;
      if (closest.hp <= 0) {
        playAt(audio.gruntDeath, closest.x, closest.z, 0.9);
        closest.alive = false; scene.remove(closest.mesh);
        const index = singers.indexOf(closest);
        if (index >= 0) singers.splice(index, 1);
        C.alive = aliveSingers();
        if (!C.alive) C.nextWave = Math.min(C.nextWave, C.t + 4.5);
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
    for (const s of singers) scene.remove(s.mesh);
    singers.length = 0;
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
