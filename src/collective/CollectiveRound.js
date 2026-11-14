import * as THREE from 'three';
import { createCollectiveMaterials, buildChild, poseChild } from './CollectiveModel.js';

// THE COLLECTIVE. Thirty of them. As the round begins they run in and take uneven places around you.
// They approach and close around the player before the warning starts. The rest of the rules:
//   1. never hurt one   2. the light cannot stay on   3. keep a match burning   4. walk away slowly.
// Break any rule and all thirty come at once. Keep them and they drift off one by one, except the last.
export const COLLECTIVE = {
  count: 30,
  spawn: [26, 38],            // metres out when they start running in
  ring: [3.6, 7.4],           // uneven places around you, still inside a match's reach
  close: 9,                   // close enough that the surround counts and the light timer starts
  warn: 20,                   // seconds after the group closes in to put the light out
  separate: 10,               // then this long to move off before a match is required
  departDistance: 5.5,
  noLight: 5,                 // after that, how long you may stand unlit
  approach: 2.6,              // closer than this to one of them provokes them
  leaveEvery: [0.5, 1.1], leaveTo: 46, whisperSwitch: 10,
  lastWatch: 5, lastNear: 4,  // the last one: how long it watches, how close is too close
  escape: 32,                 // metres from where they surrounded you, once they have all gone
  speed: { run: 5.0, crawl: 3.3, walk: 1.2, keep: 1.6, leave: 1.3 },
  crawlers: 0.4, capture: 1.15,
};
const rand = ([a, b]) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ctx: { scene, camera, world (the creature world from main.js), audio: { ctx, dest, walk, run, loud, whisper, hug },
//        hooks: { capture(), say(text), provoked(reason) } }
export function createCollective(ctx) {
  const { scene, camera, world, hooks } = ctx, C = COLLECTIVE, SP = C.speed, ac = ctx.audio.ctx;
  const M = createCollectiveMaterials();
  const kids = [];
  const afterMaterial = new THREE.MeshBasicMaterial({ color: 0xc5c2ae, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  const distanceMaterial = new THREE.MeshBasicMaterial({ color: 0xd2d0c3, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide });
  const companionShade = new THREE.Color(0x45484a);
  const S = { phase: 'idle', t: 0, center: { x: 0, z: 0 }, warnT: 0, dark: 0, sinceOff: 0, nextLeave: 0, last: null, lastT: 0,
              aggroT: 0, reason: '', captureT: -1, escaped: false, whisper: null, whisperStage: 0, loudPlayed: false, warned: false, syncPhase: 0, field: null, fieldT: 0,
              formation: 'ring', gapAngle: null, gapClosed: false, gapCommit: 0, burstClock: Math.random() * 1.8, lookAwayT: 7, distanceEcho: null, distanceEchoT: 0, distanceEchoNext: 9, companion: null, currentRound: 0, aimX: 0, aimY: 0, lastFlashlight: null };

  // ── sound: the player's own footstep loops, carried by up to six of them at a time ──
  const voices = Array.from({ length: 6 }, () => {
    const gain = ac.createGain(), pan = ac.createStereoPanner(); gain.gain.value = 0;
    gain.connect(pan).connect(ctx.audio.dest);
    return { gain, pan, src: null, buf: null };
  });
  function voiceFor(v, buf) {
    if (v.buf === buf) return;
    if (v.src) { try { v.src.stop(); } catch (e) { /* stopped */ } v.src.disconnect(); v.src = null; }
    v.buf = buf;
    if (!buf) return;
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.93 + Math.random() * 0.14;
    s.connect(v.gain); s.start(0, Math.random() * buf.duration); v.src = s;
  }
  function loop(buf, vol) {
    const g = ac.createGain(), s = ac.createBufferSource(); g.gain.value = vol; s.buffer = buf; s.loop = true; s.connect(g).connect(ctx.audio.dest); s.start();
    return { s, g };
  }
  function stopLoop(h, fade = 0.4) {
    if (!h) return;
    const t = ac.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + fade);
    try { h.s.stop(t + fade + 0.05); } catch (e) { /* stopped */ }
  }
  function once(buf, vol, delay = 0) { const g = ac.createGain(), s = ac.createBufferSource(); g.gain.value = vol; s.buffer = buf; s.connect(g).connect(ctx.audio.dest); s.start(ac.currentTime + delay); }

  const P = () => camera.position;
  const distTo = (k) => Math.hypot(k.x - P().x, k.z - P().z);
  function walkableNear(x, z, towardX, towardZ) {       // pull a point toward (towardX, towardZ) until it is somewhere you can stand
    for (let n = 0; n < 12; n++) {
      const f = n / 12, px = x + (towardX - x) * f, pz = z + (towardZ - z) * f;
      if (world.walkable(px, pz, 0.35)) return { x: px, z: pz };
    }
    return null;
  }

  function start() {
    clear();
    S.phase = 'gather'; S.t = 0; S.escaped = false; S.captureT = -1; S.reason = '';
    S.warnT = 0; S.whisperStage = 0; S.loudPlayed = false; S.warned = false; S.gapClosed = false; S.gapCommit = 0; S.gapAngle = null; S.expected = C.count; S.burstClock = Math.random() * 1.8; S.lookAwayT = 5 + Math.random() * 4; S.distanceEchoNext = 7 + Math.random() * 8; S.lastFlashlight = null;
  }
  function clear() {
    for (const k of kids) { k.c.root.removeFromParent(); k.afterImage?.removeFromParent(); k.lagImage?.removeFromParent(); }
    kids.length = 0;
    S.distanceEcho?.removeFromParent(); S.distanceEcho = null; S.distanceEchoT = 0;
    stopLoop(S.whisper); S.whisper = null;
    for (const v of voices) { voiceFor(v, null); v.gain.gain.value = 0; }
  }
  // uneven places around the player: random angles and distances, with just enough gap that they don't stack
  function ringSlots(n, formation, yaw = 0) {
    const angles = [], minGap = 0.09;
    const crowdAngle = Math.random() * Math.PI * 2;
    const gap = formation === 'blocked exit' ? wrap(crowdAngle + Math.PI) : crowdAngle;
    S.gapAngle = ['ring', 'crescent', 'blocked exit'].includes(formation) ? gap : null;
    for (let i = 0; i < n; i++) {
      let a, guard = 0;
      if (formation === 'crescent') a = gap + 0.62 + Math.random() * (Math.PI * 2 - 1.24);
      else if (formation === 'ring') a = gap + 0.42 + Math.random() * (Math.PI * 2 - 0.84);
      else if (formation === 'corridor') { const axis = crowdAngle; a = axis + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + (Math.random() - 0.5) * 0.5); }
      else if (formation === 'cross') { const arm = (Math.random() * 4) | 0; a = crowdAngle + arm * Math.PI / 2 + (Math.random() - 0.5) * 0.32; }
      else if (formation === 'blocked exit') a = crowdAngle + (Math.random() - 0.5) * 1.05;
      else a = Math.random() * Math.PI * 2;
      while (guard++ < 28 && angles.some((b) => Math.abs(wrap(a - b)) < minGap)) {
        if (formation === 'crescent') a = gap + 0.62 + Math.random() * (Math.PI * 2 - 1.24);
        else if (formation === 'ring') a = gap + 0.42 + Math.random() * (Math.PI * 2 - 0.84);
        else a = Math.random() * Math.PI * 2;
      }
      angles.push(a);
    }
    return angles.map((a) => ({ a, r: rand(C.ring) + (Math.random() < 0.28 ? 1.1 : 0) }));
  }
  function appear(info) {
    const p = P(); S.center = { x: p.x, z: p.z }; S.phase = 'appear'; S.t = 0; S.warnT = 0;
    S.loudPlayed = false;
    S.formation = ['ring', 'crescent', 'corridor', 'cross', 'blocked exit'][(Math.random() * 5) | 0];
    const slots = ringSlots(C.count, S.formation, info.yaw);
    const roles = ['crawler', 'backward', 'pivot', 'face', 'sentinel', 'peripheral'];
    for (let i = 0; i < C.count; i++) {
      const slot = slots[i];
      const from = i === C.count - 1 ? info.yaw : Math.random() * Math.PI * 2; // one waits behind the player, facing away
      let spot = null;
      for (let tries = 0; tries < 10 && !spot; tries++) {
        const d = rand(C.spawn), aa = from + (Math.random() - 0.5) * 1.4, x = p.x + Math.sin(aa) * d, z = p.z + Math.cos(aa) * d;
        if (world.walkable(x, z, 0.35)) spot = { x, z };
      }
      if (!spot) spot = walkableNear(p.x + Math.sin(from) * 30, p.z + Math.cos(from) * 30, p.x, p.z);
      if (!spot || Math.hypot(spot.x - p.x, spot.z - p.z) < 8) continue;
      const c = buildChild(M, Math.random);
      scene.add(c.root);
      // a random place in the ring, nudged toward thinner grass so it can be seen
      let ang = slot.a, r = slot.r, least = Infinity;
      for (let n = 0; n < 6; n++) {
        const sa = slot.a + (Math.random() - 0.5) * 0.35, sr = slot.r + (Math.random() - 0.5) * 0.8;
        const x = p.x + Math.sin(sa) * sr, z = p.z + Math.cos(sa) * sr;
        if (!world.walkable(x, z, 0.35)) continue;
        const g = world.clutter(x, z, 0.9);
        if (g < least) { least = g; ang = sa; r = sr; }
      }
      if (i === 5) { ang = Math.PI - info.yaw + (Math.random() < 0.5 ? -1 : 1) * 0.68; r = rand([5.5, 7]); }
      const role = i < roles.length ? roles[i] : i === roles.length ? 'fragment' : i === roles.length + 1 ? 'decoy' : 'ordinary';
      kids.push({ c, x: spot.x, z: spot.z, heading: i === C.count - 1 ? info.yaw : role === 'face' ? Math.atan2(p.x - spot.x, p.z - spot.z) : 0, speed: 0, state: 'run', mode: 'arrive', slot: ang, r, phase: Math.random() * 6.28,
                  role, crawler: role === 'crawler', startsBack: i === C.count - 1, anchored: false, litFreeze: false, headYaw: 0, revealT: 0, decoyT: 0, gone: false, leaveDir: 0, turnT: 0, delay: Math.random() * 1.6, index: i });
    }
    S.expected = kids.length;
    draw(0, info);
    hooks.say('Something is running toward you.');
  }
  function showAfterimages() {
    for (const k of kids) {
      if (k.gone || !k.c.root.visible) continue;
      k.afterImage?.removeFromParent();
      const ghost = k.c.root.clone(true);
      ghost.traverse((o) => { if (o.isMesh) o.material = afterMaterial; });
      ghost.position.copy(k.c.root.position); ghost.rotation.copy(k.c.root.rotation); ghost.scale.copy(k.c.root.scale);
      scene.add(ghost); k.afterImage = ghost; k.afterT = 0.34;
    }
  }
  function showDistanceEcho(info) {
    const candidates = kids.filter((k) => !k.gone && k.mode !== 'decoyHidden' && k.role !== 'peripheral');
    if (!candidates.length) return;
    const fx = -Math.sin(info.yaw), fz = -Math.cos(info.yaw), base = Math.max((info.beamRange || 26) + 5, 32);
    for (let i = 0; i < 8; i++) {
      const d = base + i * 1.5, x = P().x + fx * d, z = P().z + fz * d;
      if (!world.walkable(x, z, 0.3) || world.losBlocked(P().x, P().z, x, z)) continue;
      S.distanceEcho?.removeFromParent();
      const echo = candidates[(Math.random() * candidates.length) | 0].c.root.clone(true);
      echo.traverse((o) => { if (o.isMesh) o.material = distanceMaterial; });
      echo.position.set(x, world.groundY(x, z), z); echo.rotation.y = Math.random() * Math.PI * 2; echo.scale.multiplyScalar(0.72);
      scene.add(echo); S.distanceEcho = echo; S.distanceEchoT = 0.28;
      return;
    }
  }
  function beginWarning() {
    if (S.loudPlayed) return;
    S.phase = 'warning'; S.warnT = 0; S.loudPlayed = true;
    once(ctx.audio.loud, 1.1);
    hooks.say('Put the light out within 20 seconds.');
  }
  function slotOf(k) {
    const x = S.center.x + Math.sin(k.slot) * k.r, z = S.center.z + Math.cos(k.slot) * k.r;
    if (world.walkable(x, z, 0.35)) return { x, z };
    let best = null, score = Infinity;
    for (let n = 0; n < 32; n++) {
      const a = k.slot + (n % 8) * Math.PI / 4, r = Math.max(C.ring[0], k.r - 1.2 + Math.floor(n / 8) * 0.9);
      const px = S.center.x + Math.sin(a) * r, pz = S.center.z + Math.cos(a) * r;
      if (!world.walkable(px, pz, 0.35) || Math.hypot(px - S.center.x, pz - S.center.z) < 3.4) continue;
      const next = Math.abs(wrap(a - k.slot)) + Math.abs(r - k.r) * 0.2;
      if (next < score) { score = next; best = { x: px, z: pz }; }
    }
    return best || { x: k.x, z: k.z };
  }

  function provoke(reason) {
    if (S.phase === 'aggro' || S.phase === 'captured' || S.phase === 'idle' || S.phase === 'gather' || S.phase === 'done') return;
    S.phase = 'aggro'; S.aggroT = 0; S.reason = reason;
    stopLoop(S.whisper, 0.15); S.whisper = null;
    once(ctx.audio.hug, 1.0);                             // and then they come
    for (const k of kids) {                               // every one of them, even those already gone, turns back
      if (k.gone) { k.gone = false; k.c.root.visible = true; }
      k.mode = 'aggro';
    }
    hooks.provoked(reason);
  }
  // 20 seconds are up and the light is out: the quieter whisper, and 10 seconds to start walking away
  function beginDispersal(live, yaw = 0) {
    stopLoop(S.whisper, 0.3); S.whisper = null;
    if (S.whisperStage === 0) once(ctx.audio.whisper, 1.1);
    S.whisperStage = 1;
    S.phase = 'dispersal'; S.sinceOff = 0; S.dark = 0; S.warned = false; S.walkWarned = false; S.nextLeave = rand([1.2, 2]);
    S.last = live[(Math.random() * live.length) | 0];
    S.leaveHeading = wrap(yaw);
    hooks.say('Walk away. Slowly. Keep a match lit.');
  }

  function adoptLast(info) {
    if (S.companion || !S.last) return;
    const k = S.last, i = kids.indexOf(k);
    if (i >= 0) kids.splice(i, 1);
    k.afterImage?.removeFromParent(); k.lagImage?.removeFromParent();
    const d = Math.max(9, Math.min(15, C.escape * 0.36));
    const side = (info.round % 2 ? -1 : 1) * d * (info.beamAngle || 0.44) * 1.2;
    const a = info.yaw + Math.PI + side / d;
    const target = walkableNear(P().x + Math.sin(a) * d, P().z + Math.cos(a) * d, P().x, P().z);
    if (target) { k.x = target.x; k.z = target.z; }
    k.mode = 'companion'; k.gone = false; k.speed = 0; k.turnT = 0; k.c.root.visible = false;
    k.c.root.position.set(k.x, world.groundY(k.x, k.z), k.z);
    const originals = new Map(), materials = new Set();
    k.c.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!originals.has(o.material)) {
        const material = o.material.clone();
        if (material.color) material.userData.collectiveBaseColor = material.color.clone();
        originals.set(o.material, material);
      }
      o.material = originals.get(o.material); materials.add(o.material);
    });
    S.companion = { k, materials: [...materials], bornRound: S.currentRound || info.round || 1, lastRound: S.currentRound || info.round || 1 };
    hooks.mark?.();
  }

  function updateFollower(dt, info) {
    const companion = S.companion;
    if (!companion || !info?.inControl) return;
    const k = companion.k, round = info.round || companion.lastRound;
    companion.lastRound = Math.max(companion.lastRound, round);
    const distance = Math.max(4.8, 12.5 - Math.max(0, round - companion.bornRound) * 1.65);
    const side = (round % 2 ? -1 : 1) * distance * (info.beamAngle || 0.44) * 1.2;
    const a = info.yaw + Math.PI + side / distance;
    const gx = P().x + Math.sin(a) * distance, gz = P().z + Math.cos(a) * distance;
    const goal = world.walkable(gx, gz, 0.35) ? { x: gx, z: gz } : walkableNear(gx, gz, P().x, P().z);
    const lit = beamHits(k, info);
    k.litFreeze = lit;
    if (goal && !lit) {
      const dx = goal.x - k.x, dz = goal.z - k.z, d = Math.hypot(dx, dz), ox = k.x, oz = k.z;
      if (d > 0.45) {
        const step = Math.min(d, 1.05 * dt), pos = { x: k.x + dx / d * step, z: k.z + dz / d * step };
        world.collide(pos, 0.25); k.x = pos.x; k.z = pos.z; k.speed = Math.hypot(k.x - ox, k.z - oz) / Math.max(dt, 0.001);
      } else k.speed = 0;
    } else k.speed = 0;
    const toPlayer = Math.atan2(P().x - k.x, P().z - k.z);
    const looking = Math.abs(wrap(Math.atan2(k.x - P().x, k.z - P().z) - (info.yaw + Math.PI))) < 0.13 && !world.losBlocked(P().x, P().z, k.x, k.z);
    if (looking) k.speed = 0;
    if (!lit && !looking) k.heading += wrap(toPlayer - k.heading) * Math.min(1, dt * 1.1);
    if (!lit) k.headYaw += wrap(Math.max(-1.25, Math.min(1.25, wrap(toPlayer - k.heading))) - k.headYaw) * Math.min(1, dt * 12);
    if (!lit) {
      poseChild(k.c, k.speed > 0.15 ? 'walk' : 'still', k.phase += dt * Math.max(0.2, k.speed) * 3, info.clock || 0);
      k.c.j.head.rotation.y = k.headYaw;
    }
    k.c.root.position.set(k.x, world.groundY(k.x, k.z), k.z); k.c.root.rotation.y = k.heading;
    const dx = k.x - P().x, dz = k.z - P().z, d = Math.hypot(dx, dz), fx = -Math.sin(info.yaw), fz = -Math.cos(info.yaw);
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
    k.c.root.visible = !!info.flashlightOn && !lit && d < (info.beamRange || 40) && angle > (info.beamAngle || 0.44) * 0.92 && angle < (info.beamAngle || 0.44) * 1.55;
    const shade = Math.min(1, Math.max(0, (round - companion.bornRound) / 4));
    companionShade.setHex(({ forest: 0x454735, rural: 0x47413a, cave: 0x464343, snow: 0x737a83, swamp: 0x343d35 })[info.environment] || 0x45484a);
    for (const m of companion.materials) if (m.userData.collectiveBaseColor) m.color.copy(m.userData.collectiveBaseColor).lerp(companionShade, shade);
  }

  // A flow field over the cave grid toward the player, rebuilt twice a second, so thirty of them can find you through the tunnels.
  function buildField() {
    const G = world.grid, pi = G.cellOf(P().x), pj = G.cellOf(P().z), R = 22, W = 2 * R + 1, d = new Int16Array(W * W).fill(-1);
    const idx = (i, j) => (j - pj + R) * W + (i - pi + R), q = [[pi, pj]]; d[idx(pi, pj)] = 0;
    for (let h = 0; h < q.length; h++) {
      const [i, j] = q[h];
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + a, nj = j + b;
        if (Math.abs(ni - pi) > R || Math.abs(nj - pj) > R || d[idx(ni, nj)] !== -1 || !world.cellWalkable(ni, nj)) continue;
        d[idx(ni, nj)] = d[idx(i, j)] + 1; q.push([ni, nj]);
      }
    }
    S.field = { d, pi, pj, R, W };
  }
  function fieldStep(k) {
    const F = S.field, G = world.grid; if (!F) return null;
    const ci = G.cellOf(k.x), cj = G.cellOf(k.z), at = (i, j) => (Math.abs(i - F.pi) > F.R || Math.abs(j - F.pj) > F.R) ? -1 : F.d[(j - F.pj + F.R) * F.W + (i - F.pi + F.R)];
    const here = at(ci, cj);
    if (here <= 1) return null;                            // in the player's cell or next to it: go straight
    let best = null, bd = here;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = at(ci + a, cj + b); if (v >= 0 && v < bd) { bd = v; best = { x: (ci + a) * G.CELL, z: (cj + b) * G.CELL }; } }
    return best;
  }

  function moveKid(k, tx, tz, speed, dt) {
    const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
    if (k.litFreeze || (k.anchored && ['appear', 'surround', 'warning'].includes(S.phase))) { k.speed = 0; return d; }
    const burstPhase = (S.burstClock % 1.8 + 1.8) % 1.8;
    if (S.phase !== 'captured' && burstPhase > 0.98) { k.speed = 0; return d; }
    speed *= 1.28;
    if (d < 0.05 || speed <= 0) { k.speed = 0; return d; }
    const step = Math.min(d, speed * dt), ox = k.x, oz = k.z;
    const pos = { x: k.x + dx / d * step, z: k.z + dz / d * step };
    world.collide(pos, 0.25);
    k.x = pos.x; k.z = pos.z;
    k.speed = Math.hypot(k.x - ox, k.z - oz) / dt;
    if (k.role === 'fragment' && k.speed > 0.15) {
      if (k.lagDistance === 0 || !k.lagStart) k.lagStart = { x: ox, z: oz, heading: k.heading };
      k.lagDistance = (k.lagDistance || 0) + Math.hypot(k.x - ox, k.z - oz);
      if (k.lagDistance >= 2.4 && !(k.lagT > 0)) {
        const shadow = k.c.root.clone(true);
        shadow.traverse((o) => { if (o.isMesh) o.material = afterMaterial; });
        shadow.position.set(k.lagStart.x, world.groundY(k.lagStart.x, k.lagStart.z), k.lagStart.z);
        shadow.rotation.y = k.lagStart.heading; shadow.scale.copy(k.c.root.scale);
        scene.add(shadow); k.lagImage = shadow; k.lagT = 0.28; k.lagDistance = 0; k.lagStart = { x: k.x, z: k.z, heading: k.heading };
      }
    }
    if (k.speed > 0.2) {
      const travel = Math.atan2(k.x - ox, k.z - oz) + (k.role === 'backward' ? Math.PI : 0);
      k.heading += wrap(travel - k.heading) * Math.min(1, dt * (k.role === 'face' ? 7 : 2.8));
    }
    return d;
  }
  const faceTo = (k, x, z, dt, rate = 3) => { const back = k.role === 'backward' ? Math.PI : 0; k.heading += wrap(Math.atan2(x - k.x, z - k.z) + back - k.heading) * Math.min(1, dt * rate); };
  function beamHits(k, info) {
    if (!info.flashlightOn || (info.beamLit ?? 1) < 0.12) return false;
    const dx = k.x - P().x, dz = k.z - P().z, d = Math.hypot(dx, dz);
    if (d > (info.beamRange || 40)) return false;
    const fx = -Math.sin(info.yaw), fz = -Math.cos(info.yaw);
    if ((dx * fx + dz * fz) / (d || 1) < Math.cos(info.beamAngle || 0.44)) return false;
    return !world.losBlocked(P().x, P().z, k.x, k.z);
  }

  // info: { inControl, yaw, flashlightOn, matchLit, running, moving, clock }
  function update(dt, info) {
    if (S.phase === 'idle' || S.phase === 'done') return;
    if (!info.inControl) { for (const v of voices) v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.05); return; }
    S.t += dt; S.burstClock += dt; S.currentRound = info.round || S.currentRound;
    const p = P(), ph = S.phase;
    if (S.distanceEchoT > 0 && (S.distanceEchoT -= dt) <= 0) { S.distanceEcho?.removeFromParent(); S.distanceEcho = null; }
    if (info.flashlightOn && ['appear', 'warning'].includes(ph)) {
      S.distanceEchoNext -= dt;
      if (S.distanceEchoNext <= 0) { showDistanceEcho(info); S.distanceEchoNext = rand([15, 24]); }
    }
    if (S.lastFlashlight === true && !info.flashlightOn) showAfterimages();
    S.lastFlashlight = info.flashlightOn;
    for (const k of kids) k.litFreeze = beamHits(k, info);
    for (const k of kids) {
      if (k.role !== 'decoy') continue;
      if (k.mode === 'decoyHidden') {
        k.decoyT -= dt; k.speed = 0;
        if (k.decoyT <= 0) {
          const a = info.yaw + Math.PI + (Math.random() - 0.5) * 0.9, r = 4.6;
          const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
          if (world.walkable(x, z, 0.35)) {
            k.x = x; k.z = z; k.slot = a; k.r = r; k.mode = 'arrive'; k.delay = 0.35; k.c.root.position.set(x, world.groundY(x, z), z);
          } else k.decoyT = 0.35;
        }
      } else if (!k.litFreeze && distTo(k) < 2.8 && ['appear', 'warning'].includes(S.phase)) {
        k.mode = 'decoyHidden'; k.decoyT = 0.55; k.c.root.visible = false;
      }
    }
    if (ph === 'gather') { appear(info); return; }       // they come as soon as the round begins

    // ── the rules (once they have you surrounded) ──
    const live = kids.filter((k) => !k.gone);
    let nearest = Infinity;                               // the ones still standing their ground; those walking off don't count
    for (const k of live) if (k.mode !== 'leave' && k.mode !== 'vanish') nearest = Math.min(nearest, distTo(k));
    const ruled = ph === 'dispersal' || ph === 'last';     // during the first 20 seconds only a shot sets them off
    if (ruled) {
      if (info.running && info.moving) provoke('ran');
      else if ((ph === 'last' || S.sinceOff > C.separate) && nearest < (ph === 'last' ? C.lastNear : C.approach)) provoke('approached');   // the 10 seconds are for getting clear of them
      else if ((ph === 'dispersal' || ph === 'last') && info.flashlightOn) provoke('light');
    }
    if (ph === 'appear' || ph === 'surround' || ph === 'warning') {
      const follow = ph === 'appear' ? 1.1 : 0.8;                            // they chase you in, then the ring moves with you
      S.center.x += (p.x - S.center.x) * Math.min(1, dt * follow);
      S.center.z += (p.z - S.center.z) * Math.min(1, dt * follow);
      S.lookAwayT -= dt;
      if (S.lookAwayT <= 0) {
        const fx = -Math.sin(info.yaw), fz = -Math.cos(info.yaw);
        const unseen = kids.filter((k) => !k.gone && !k.litFreeze && !k.anchored && k.role !== 'decoy' && k.r > C.ring[0] + 0.2 && ((k.x - p.x) * fx + (k.z - p.z) * fz) / Math.max(0.01, distTo(k)) < 0.32);
        for (let n = 0; n < Math.min(3, unseen.length); n++) {
          const index = (Math.random() * unseen.length) | 0, k = unseen.splice(index, 1)[0];
          k.r = Math.max(C.ring[0], k.r - rand([1.1, 2.0]));
        }
        S.lookAwayT = rand([6, 11]);
      }
    }

    if (!S.gapClosed && S.gapAngle != null && info.moving && Number.isFinite(info.moveX) && Number.isFinite(info.moveZ)) {
      const committed = Math.atan2(info.moveX, info.moveZ);
      if (Math.abs(wrap(committed - S.gapAngle)) < 0.52) {
        S.gapCommit += dt;
      } else S.gapCommit = 0;
      if (S.gapCommit >= 0.35) {
        S.gapClosed = true;
        const blocker = kids.filter((k) => !k.gone && !['sentinel', 'pivot'].includes(k.role)).sort((a, b) => Math.abs(wrap(a.slot - S.gapAngle)) - Math.abs(wrap(b.slot - S.gapAngle)))[0];
        if (blocker) { blocker.slot = S.gapAngle; blocker.r = 5.2; blocker.anchored = false; }
        hooks.say('The opening closes behind you.');
      }
    } else S.gapCommit = 0;

    if (ph === 'warning') {
      S.warnT += dt;
      if (S.whisperStage === 0 && S.warnT >= C.whisperSwitch && info.flashlightOn) { once(ctx.audio.whisper, 1.1); S.whisperStage = 1; }
      if (S.warnT >= C.warn) {
        if (info.flashlightOn) { provoke('light'); draw(dt, info); return; }
        beginDispersal(live, info.yaw);
      }
    }
    if (S.phase === 'appear') {
      let held = 0, near = 0;
      for (const k of kids) {
        if (k.mode === 'decoyHidden') continue;
        if (distTo(k) < C.close) near++;
        if (k.delay > 0) { k.delay -= dt; k.speed = 0; if (!k.litFreeze && !k.startsBack) faceTo(k, p.x, p.z, dt); continue; }
        const s = slotOf(k), d = moveKid(k, s.x, s.z, k.role === 'crawler' ? SP.crawl : SP.run, dt);
        if ((k.role === 'sentinel' || k.role === 'pivot') && d < 0.55) k.anchored = true;
        if (k.role === 'face') faceTo(k, p.x, p.z, dt, 12);
        if (d < 1.15 && distTo(k) < C.close) held++;
      }
      // the timer waits until they have actually closed in, not on a clock
      if (S.expected && ((held >= S.expected - 5 && near >= S.expected - 6) || (S.t > 16 && near >= S.expected * 0.6))) beginWarning();
    } else if (S.phase === 'surround' || S.phase === 'warning') {
      for (const k of kids) {
        if (k.mode === 'decoyHidden') continue;
        const s = slotOf(k), d = moveKid(k, s.x, s.z, d2speed(k, s), dt);
        if (d < 0.3 && !k.litFreeze && !['backward', 'pivot'].includes(k.role)) faceTo(k, p.x, p.z, dt, k.role === 'face' ? 12 : 1.7);
        if (k.role === 'face' && !k.litFreeze) faceTo(k, p.x, p.z, dt, 12);
        if (S.phase === 'warning' && !k.litFreeze) faceTo(k, p.x, p.z, dt, 0.8 + Math.min(1, S.warnT / C.warn) * 4.2);
      }
    } else if (S.phase === 'dispersal' || S.phase === 'last') {
      // keep a match burning: a few seconds' grace, then darkness is not allowed to last
      S.sinceOff += dt;
      if (S.phase === 'dispersal' && S.sinceOff > C.separate && Math.hypot(p.x - S.center.x, p.z - S.center.z) < C.departDistance) {
        provoke('approached'); draw(dt, info); return;
      }
      if (S.phase === 'dispersal' && S.sinceOff > C.separate - 3 && Math.hypot(p.x - S.center.x, p.z - S.center.z) < C.departDistance && !S.walkWarned) {
        S.walkWarned = true; hooks.say('Keep walking. Slowly.');
      }
      if (info.matchLit) { S.dark = 0; S.warned = false; }
      else if (S.sinceOff > C.separate) {
        S.dark += dt;
        if (S.dark > 1.5 && !S.warned) { S.warned = true; hooks.say('Strike a match (M). Don\'t let it go dark.'); }
        if (S.dark > C.noLight) provoke('dark');
      }
      if (S.phase === 'dispersal') {
        S.nextLeave -= dt;
        if (S.nextLeave <= 0) {
          const stay = kids.filter((k) => k.mode === 'stand' || k.mode === 'arrive');
          const pick = stay.filter((k) => k !== S.last);
          if (pick.length) { const k = pick[(Math.random() * pick.length) | 0]; k.mode = 'leave'; k.turnT = 0.45 + (k.index % 4) * 0.12; k.leaveDir = S.leaveHeading + (Math.random() - 0.5) * 0.12; }
          S.nextLeave = rand(C.leaveEvery);
        }
        if (kids.every((k) => k === S.last || k.gone || (k.mode === 'leave' && distTo(k) > 16))) { S.phase = 'last'; S.lastT = 0; S.last.mode = 'watch'; }
      }
      for (const k of kids) {
        if (k.gone) continue;
        if (k.mode === 'leave' || k.mode === 'vanish') {
          if (k.turnT > 0) { k.turnT -= dt; k.speed = 0; if (!k.litFreeze) k.heading += wrap(k.leaveDir - k.heading) * Math.min(1, dt * (k.mode === 'vanish' ? 1.6 : 5)); continue; }
          const tx = k.x + Math.sin(k.leaveDir) * 5, tz = k.z + Math.cos(k.leaveDir) * 5;
          moveKid(k, tx, tz, k.mode === 'vanish' ? 0.9 : SP.leave, dt);
          if (k.mode === 'vanish') k.vanishT += dt;
          const out = k.mode === 'vanish' ? distTo(k) > 14 || k.vanishT > 6 : distTo(k) > C.leaveTo;      // the last one walks off into the dark
          if (out) { k.gone = true; k.c.root.visible = false; }
        } else if (k.mode === 'watch') { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt, 2); }
        else { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt); k.mode = 'stand'; }
      }
      if (S.phase === 'last' && S.last.mode === 'watch') {
        // the last one: motionless, facing you. Keep walking. After a while it turns and is gone. Nothing else.
        S.lastT += dt;
        if (S.lastT >= C.lastWatch && distTo(S.last) > C.lastNear + 1) {
          S.last.mode = 'vanish'; S.last.turnT = 2.2; S.last.leaveDir = Math.atan2(S.last.x - p.x, S.last.z - p.z); S.last.vanishT = 0;
        }
      }
      if (S.phase === 'last' && S.last.gone && Math.hypot(p.x - S.center.x, p.z - S.center.z) >= C.escape) { S.phase = 'done'; S.escaped = true; adoptLast(info); }
    } else if (S.phase === 'aggro') {
      S.aggroT += dt;
      if (world.grid && (S.fieldT -= dt) <= 0) { buildField(); S.fieldT = 0.5; }
      S.syncPhase += dt * 10;                              // in step with one another
      for (const k of kids) {
        if (S.aggroT < 1.3) { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt, 12); continue; }   // they all turn to you first
        const wp = world.grid ? fieldStep(k) : null;
        moveKid(k, wp ? wp.x : p.x, wp ? wp.z : p.z, k.crawler ? SP.crawl : SP.run, dt);
        if (distTo(k) < 3 && !k.litFreeze) faceTo(k, p.x, p.z, dt, 12);
        if (distTo(k) < C.capture && S.captureT < 0) { S.captureT = 0; S.phase = 'captured'; hooks.capture(); }
      }
    } else if (S.phase === 'captured') {
      S.captureT += dt;
      for (const k of kids) { if (distTo(k) < 5) { moveKid(k, p.x, p.z, 4, dt); if (!k.litFreeze) faceTo(k, p.x, p.z, dt, 14); } }
    }
    draw(dt, info);
  }
  function d2speed(k, s) { const d = Math.hypot(s.x - k.x, s.z - k.z); return d > 3 ? SP.run * 0.7 : d > 0.4 ? SP.keep : 0; }

  function draw(dt, info) {
    const p = P(), k0 = info.clock;
    for (const k of kids) {
      if (k.afterT > 0) {
        k.afterT -= dt;
        if (k.afterT <= 0) { k.afterImage?.removeFromParent(); k.afterImage = null; }
      }
      if (k.lagT > 0) {
        k.lagT -= dt;
        if (k.lagT <= 0) { k.lagImage?.removeFromParent(); k.lagImage = null; }
      }
      if (k.gone) continue;
      if (!k.litFreeze) {
        k.phase += dt * Math.max(0.0001, k.speed) * (k.speed > 2.5 ? 3.0 : 4.2);
        let state = k.speed > 2.5 ? 'run' : k.speed > 0.15 ? 'walk' : 'still', t = k.phase;
        if (S.phase === 'aggro' || S.phase === 'captured') { t = S.syncPhase; if (k.crawler && S.aggroT >= 1.3) state = 'crawl'; else if (k.speed > 0.15) state = 'run'; }
        if (k.role === 'crawler' && k.speed > 0.1) state = 'crawl';
        if (k.mode === 'watch') state = 'still';
        if (S.phase === 'captured' && distTo(k) < 2.5) state = 'lunge';
        const sentinelStill = k.role === 'sentinel' && k.anchored && S.phase !== 'aggro' && S.phase !== 'captured';
        if (sentinelStill) {
          if (!k.sentinelSettled) poseChild(k.c, 'still', t, k0);
          k.sentinelSettled = true;
        } else {
          k.sentinelSettled = false;
          poseChild(k.c, state, t, k0, { a: S.captureT / 0.4 });
          const toPlayer = Math.atan2(p.x - k.x, p.z - k.z);
          if (k.role === 'face') k.heading += wrap(toPlayer - k.heading) * Math.min(1, dt * 12);
          if (!(k.startsBack && k.delay > 0)) {
            const wantedHead = Math.max(-1.35, Math.min(1.35, wrap(toPlayer - k.heading)));
            k.headYaw += wrap(wantedHead - k.headYaw) * Math.min(1, dt * 12);
            k.c.j.head.rotation.y = k.headYaw;
          }
        }
      }
      if (k.role === 'fragment') {
        k.revealT = Math.max(0, Math.min(0.62, k.revealT + (k.litFreeze ? dt * 1.35 : -dt * 0.65)));
        const torso = k.c.j.torso, hips = k.c.j.hips;
        torso.children[0].visible = k.revealT >= 0.18; // torso
        torso.children[1].visible = k.revealT >= 0.02; // face first
        torso.children[2].visible = k.revealT >= 0.30; torso.children[3].visible = k.revealT >= 0.42;
        hips.children[0].visible = k.revealT >= 0.50; // skirt and feet arrive last
        hips.children[2].visible = k.revealT >= 0.58; hips.children[3].visible = k.revealT >= 0.58;
      }
      k.c.root.position.set(k.x, world.groundY(k.x, k.z), k.z);
      k.c.root.rotation.y = k.heading;
      if (k.mode === 'decoyHidden') k.c.root.visible = false;
      else if (k.role === 'peripheral') {
        const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz), fx = -Math.sin(info.yaw), fz = -Math.cos(info.yaw);
        const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
        k.c.root.visible = !!info.flashlightOn && d < (info.beamRange || 40) && angle > (info.beamAngle || 0.44) * 0.92 && angle < (info.beamAngle || 0.44) * 1.55;
      } else k.c.root.visible = true;
    }
    // footsteps: the six nearest that are moving carry the player's own footstep sounds
    const movers = kids.filter((k) => !k.gone && k.speed > 0.3 && k !== S.last).map((k) => [distTo(k), k]).sort((a, b) => a[0] - b[0]).slice(0, voices.length);
    voices.forEach((v, n) => {
      const m = movers[n];
      if (!m) { v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.08); return; }
      const [d, k] = m, rel = wrap(Math.atan2(-(k.x - p.x), -(k.z - p.z)) - info.yaw);
      voiceFor(v, k.speed > 2.5 ? ctx.audio.run : ctx.audio.walk);
      const fall = Math.max(0, 1 - d / 34);
      v.gain.gain.setTargetAtTime(0.5 * fall * fall, ac.currentTime, 0.08);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(rel))), ac.currentTime, 0.08);
    });
  }

  // a bullet along dir: hitting any of them breaks rule 1
  function shot(origin, dir) {
    if (!kids.length || S.phase === 'gather' || S.phase === 'idle' || S.phase === 'done') return false;
    for (const k of kids) {
      if (k.gone) continue;
      const sc = k.c.root.scale.x, gy = world.groundY(k.x, k.z);
      for (const h of [0.35, 0.7, 1.0]) {
        const cx = k.x - origin.x, cy = gy + h * sc - origin.y, cz = k.z - origin.z, t = cx * dir.x + cy * dir.y + cz * dir.z;
        if (t <= 0 || t > 60) continue;
        const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
        if (mx * mx + my * my + mz * mz < 0.24 * 0.24 && !world.losBlocked(origin.x, origin.z, k.x, k.z)) { provoke('shot'); return true; }
      }
    }
    return false;
  }

  return {
    start, update, updateFollower, shot, provoke, clear,
    get phase() { return S.phase; },
    get active() { return S.phase !== 'idle'; },
    get encounter() { return S.phase !== 'idle' && S.phase !== 'gather' && S.phase !== 'done'; },
    get escaped() { return S.escaped; },
    get remaining() { return kids.filter((k) => !k.gone).length; },
    get gatherLeft() { return 0; },
    stop() { S.phase = 'idle'; clear(); },
    debug: () => ({ phase: S.phase, t: +S.t.toFixed(2), warnT: +S.warnT.toFixed(2), dark: +S.dark.toFixed(2), sinceOff: +S.sinceOff.toFixed(2), reason: S.reason,
      remaining: kids.filter((k) => !k.gone).length, nearest: kids.filter((k) => !k.gone).reduce((m, k) => Math.min(m, distTo(k)), 99).toFixed(2),
      last: S.last && { mode: S.last.mode, dist: +distTo(S.last).toFixed(2) }, center: [+S.center.x.toFixed(1), +S.center.z.toFixed(1)],
      modes: kids.reduce((o, k) => (o[k.gone ? 'gone' : k.mode] = (o[k.gone ? 'gone' : k.mode] || 0) + 1, o), {}) }),
    S, kids,
  };
}
