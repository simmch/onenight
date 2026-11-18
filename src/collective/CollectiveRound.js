import * as THREE from 'three';
import { createRouteFixtures, nearPassage, planPassages } from './CollectiveRoutes.js';
import { createCollectiveMaterials, buildChild, poseChild } from './CollectiveModel.js';

// THE COLLECTIVE. Thirty of them. As the round begins they run in and take uneven places around you.
// They approach and close around the player before the warning starts. The rest of the rules:
//   1. never hurt one   2. put away your flashlight   3. stay in light   4. walk away slowly.
// Break any rule and all thirty come at once. Keep them and they drift off one by one, except the last.
export const COLLECTIVE = {
  count: 30,
  spawn: [26, 38],            // metres out when they start running in
  ring: [3.6, 7.4],           // uneven places around you, still inside a match's reach
  close: 9,                   // close enough that the surround counts and the light timer starts
  gatherLimit: 30,            // a wall or held beam cannot postpone the warning forever
  warn: 20,                   // seconds after the group closes in to put the light out
  separate: 10,               // then this long to move off before a match is required
  departDistance: 5.5,
  noLight: 5,                 // after that, how long you may stand unlit
  approach: 2.6,              // closer than this to one of them provokes them
  leaveEvery: [0.5, 1.1], leaveTo: 46, whisperSwitch: 10,
  indoorLeaveLimit: 9, indoorPursuitLimit: 24,
  lastWatch: 5, lastNear: 4,  // the last one: how long it watches, how close is too close
  escape: 32, indoorEscape: 14, // how far to get from the ring once they have gone
  speed: { run: 5.0, crawl: 3.3, walk: 1.2, keep: 1.6, leave: 1.3 },
  crawlers: 0.4, capture: 1.15,
};
const rand = ([a, b]) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
              formation: 'ring', gapAngle: null, gapClosed: false, routes: [], routeOrigin: null, palm: null, bell: null, burstClock: Math.random() * 1.8, lookAwayT: 7, distanceEcho: null, distanceEchoT: 0, distanceEchoNext: 9, companion: null, currentRound: 0, aimX: 0, aimY: 0, lastFlashlight: null, wasMoving: false, wasSurrounded: false, wasRunning: false, wasWalkingAway: false, walkAwayGap: 0, homeSaid: false, runWarned: false, runClearAt: 0, speechUntil: 0 };

  const fixtures = createRouteFixtures(scene, world, {
    say: hooks.say,
    crank: hooks.crank,
    ring(point) {
      callAway(point);
      hooks.bell();
      hooks.say('At the bell, you hear more feet begin to move.');
    },
  });

  function callAway(point) {
    S.bell = point;
    S.nextLeave = 0;
    for (const k of kids) {
      if (k.gone || k.mode !== 'leave') continue;
      k.leaveDir = Math.atan2(point.x - k.x, point.z - k.z);
      k.turnT = 0.35;
    }
  }

  function usedLever(control) {
    if (S.phase !== 'dispersal' || !S.routes.some(r => r.lever && r.lever.target === control.target)) return;
    callAway(control);
    hooks.say('The gate unlocks. The children turn toward the clank.');
  }

  // ── sound: two of them echo the player's footsteps. Spoken lines use one voice so they never pile up. ──
  const voices = Array.from({ length: 2 }, () => {
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
  // The group's own footsteps, while they are still walking and the beam has not frozen them.
  let groupSteps = null;
  function stopGroupSteps() {
    if (!groupSteps) return;
    stopLoop(groupSteps, 0.16);
    groupSteps = null;
  }
  function ensureGroupSteps() {
    if (groupSteps || !ctx.audio.groupSteps) return;
    const g = ac.createGain(), pan = ac.createStereoPanner(), s = ac.createBufferSource();
    g.gain.value = 0;
    s.buffer = ctx.audio.groupSteps; s.loop = true;
    s.connect(g).connect(pan).connect(ctx.audio.dest);
    s.start();
    groupSteps = { s, g, pan };
  }
  let speech = null, speechNext = null;
  function cutSpeech() {
    speechNext = null;
    if (speech) {
      const src = speech;
      speech = null;
      src.onended = null;
      try { src.stop(); } catch (e) { /* already stopped */ }
      try { src.disconnect(); } catch (e) { /* already stopped */ }
    }
    S.speechUntil = 0;
  }
  function beginSpeech(buf, vol) {
    const g = ac.createGain(), s = ac.createBufferSource();
    g.gain.value = vol; s.buffer = buf; s.connect(g).connect(ctx.audio.dest); s.start();
    speech = s;
    S.speechUntil = ac.currentTime + buf.duration;
    s.onended = () => {
      if (speech !== s) return;
      speech = null;
      const next = speechNext;
      speechNext = null;
      if (next) beginSpeech(next.buf, next.vol);
      else S.speechUntil = 0;
    };
  }
  // One line at a time. A second line waits, and a newer one replaces that wait so they don't queue up.
  function once(buf, vol = 1, delay = 0, force = false) {
    if (!buf) return;
    if (force) { speechNext = null; if (speech) cutSpeech(); beginSpeech(buf, vol); return; }
    if (speech) { speechNext = { buf, vol }; return; }
    beginSpeech(buf, vol);
  }
  function speak(buf, vol = 1) { once(buf, vol); }
  // The first run plays the warning. Running is only fatal once that line has finished.
  function warnStopRunning() {
    if (!ctx.audio.stopMoving || S.runWarned) return;
    once(ctx.audio.stopMoving, 1.1, 0, true);
    S.runWarned = true;
    S.runClearAt = ac.currentTime + ctx.audio.stopMoving.duration;
  }

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
    S.field = null; S.fieldT = 0; S.last = null; S.walked = 0;
    S.warnT = 0; S.whisperStage = 0; S.loudPlayed = false; S.warned = false; S.gapClosed = false; S.gapAngle = null; S.routes = []; S.routeOrigin = null; S.palm = null; S.bell = null; S.expected = C.count; S.burstClock = Math.random() * 1.8; S.lookAwayT = 5 + Math.random() * 4; S.distanceEchoNext = 7 + Math.random() * 8; S.lastFlashlight = null; S.wasMoving = false; S.wasSurrounded = false; S.wasRunning = false; S.wasWalkingAway = false; S.walkAwayGap = 0; S.homeSaid = false; S.runWarned = false; S.runClearAt = 0;
  }
  function clear() {
    fixtures.clear();
    for (const k of kids) { k.c.root.removeFromParent(); k.afterImage?.removeFromParent(); k.lagImage?.removeFromParent(); }
    kids.length = 0;
    S.distanceEcho?.removeFromParent(); S.distanceEcho = null; S.distanceEchoT = 0;
    stopLoop(S.whisper); S.whisper = null;
    cutSpeech();
    stopGroupSteps();
    for (const v of voices) { voiceFor(v, null); v.gain.gain.value = 0; }
  }
  // uneven places around the player: random angles and distances, with just enough gap that they don't stack
  function ringSlots(n, formation) {
    const gap = Math.random() * Math.PI * 2;
    S.gapAngle = gap;
    const slots = [];
    for (let i = 0; i < n; i++) {
      const fraction = (i + Math.random() * 0.7) / n;
      let angle;
      if (formation === 'corridor') angle = gap + (i % 2 ? 1 : -1) * (Math.PI / 2 + (fraction - 0.5) * 0.95);
      else if (formation === 'cross') angle = gap + Math.PI / 4 + (i % 4) * Math.PI / 2 + (fraction - 0.5) * 0.38;
      else if (formation === 'blocked exit') angle = gap + Math.PI + (fraction - 0.5) * 2.3;
      else {
        const opening = formation === 'crescent' ? 1.1 : 0.60;
        angle = gap + opening + fraction * (Math.PI * 2 - 2 * opening);
      }
      slots.push({ a: wrap(angle), r: rand(C.ring) + (Math.random() < 0.28 ? 1.1 : 0) });
    }
    return slots;
  }
  function appear(info) {
    const p = P(); S.center = { x: p.x, z: p.z }; S.phase = 'appear'; S.t = 0; S.warnT = 0;
    S.loudPlayed = false;
    S.formation = ['ring', 'crescent', 'corridor', 'cross', 'blocked exit'][(Math.random() * 5) | 0];
    const slots = ringSlots(C.count, S.formation);
    const roles = ['crawler', 'backward', 'pivot', 'face', 'sentinel', 'peripheral'];
    const approaches = world.grid ? buildField() : [];
    const spawns = approaches.flatMap(([i, j, steps]) => {
      const x = i * world.grid.CELL, z = j * world.grid.CELL;
      const d = Math.hypot(x - p.x, z - p.z);
      return steps >= 3 && steps <= 13 && d >= 9 && d <= C.spawn[1] && world.walkable(x, z, 0.35) ? [{ x, z }] : [];
    });
    const remaining = spawns.slice();
    for (let i = 0; i < C.count; i++) {
      const slot = slots[i];
      const from = i === C.count - 1 ? info.yaw : Math.random() * Math.PI * 2; // one waits behind the player, facing away
      const list = remaining.length ? remaining : spawns;
      const index = Math.floor(Math.random() * list.length);
      let spot = world.grid && list.length ? (remaining.length ? remaining.splice(index, 1)[0] : list[index]) : null;
      for (let tries = 0; tries < 10 && !spot && !world.grid; tries++) {
        const d = rand(C.spawn), aa = from + (Math.random() - 0.5) * 1.4, x = p.x + Math.sin(aa) * d, z = p.z + Math.cos(aa) * d;
        if (world.walkable(x, z, 0.35)) spot = { x, z };
      }
      if (!spot && !world.grid) spot = walkableNear(p.x + Math.sin(from) * 30, p.z + Math.cos(from) * 30, p.x, p.z);
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
    if (!S.expected) { S.phase = 'done'; S.escaped = true; return; }
    draw(0, info);
    hooks.say('Something is running toward you.');
  }
  function showAfterimages(info) {
    if (Number.isFinite(info?.sanity) && info.sanity > 68) return;
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
    if (Number.isFinite(info.sanity) && info.sanity > 68) return;
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
  function prepareRoutes() {
    const origin = { x: P().x, z: P().z };
    const routes = planPassages(world, origin, S.gapAngle, hooks.levers?.() || []);
    const turn = routes.length ? wrap(routes[0].angle - S.gapAngle) : 0;
    for (const k of kids) {
      k.slot = wrap(k.slot + turn);
      k.guide = null;
      // Clear the walking lane itself, including the outside of a bend.
      for (let i = 0; i < 24; i++) {
        const offset = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 12;
        const angle = k.slot + offset;
        const x = origin.x + Math.sin(angle) * k.r, z = origin.z + Math.cos(angle) * k.r;
        if (routes.some(r => nearPassage(x, z, origin, r)) || !world.walkable(x, z, 0.35)) continue;
        k.slot = angle;
        break;
      }
    }
    for (const route of routes) {
      const guides = kids.filter(k => !k.guide && k.role === 'ordinary').sort((a, b) =>
        Math.abs(wrap(a.slot - route.angle)) - Math.abs(wrap(b.slot - route.angle)));
      for (const k of guides.slice(0, 2)) k.guide = route;
    }
    S.routes = routes;
    S.routeOrigin = origin;
    if (routes.length) S.gapAngle = routes[0].angle;
    fixtures.show(routes);
  }

  const formationTell = {
    ring: 'A pair in the ring points through a gap.',
    crescent: 'Follow the hands at the tips of the crescent.',
    corridor: 'Look down the aisle between the two rows.',
    cross: 'Hands point between the four ranks.',
    'blocked exit': 'Two hands point away from the crowded exit.',
  };

  function beginWarning() {
    if (S.loudPlayed) return;
    S.phase = 'warning'; S.warnT = 0; S.loudPlayed = true;
    once(ctx.audio.loud, 1.1);
    prepareRoutes();
    hooks.say('Put your flashlight away within 20 seconds.');
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
    fixtures.clear();
    S.phase = 'aggro'; S.aggroT = 0; S.reason = reason;
    stopLoop(S.whisper, 0.15); S.whisper = null;
    once(ctx.audio.hug, 1.0, 0, true);                    // and then they come
    for (const k of kids) {                               // every one of them, even those already gone, turns back
      if (k.gone) { k.gone = false; k.c.root.visible = true; }
      k.mode = 'aggro';
    }
    hooks.provoked(reason);
  }
  // With the flashlight away, give the player ten seconds to clear the gathering.
  function beginDispersal(live, yaw = 0) {
    stopLoop(S.whisper, 0.3); S.whisper = null;
    if (S.whisperStage === 0) once(ctx.audio.whisper, 1.1);
    S.whisperStage = 1;
    S.phase = 'dispersal'; S.sinceOff = 0; S.dark = 0; S.warned = false; S.walkWarned = false; S.nextLeave = rand([1.2, 2]);
    if (Math.hypot(P().x - S.routeOrigin.x, P().z - S.routeOrigin.z) > 2.5) prepareRoutes();
    S.center = { x: P().x, z: P().z };
    // Children stranded in a corridor yield first. The watcher stays outside the indicated path.
    const inLane = k => S.routes.some(route => nearPassage(k.x, k.z, S.routeOrigin, route));
    const visible = live.filter(k => !['peripheral', 'fragment', 'decoy'].includes(k.role));
    const watchers = visible.filter(k => !inLane(k) && distTo(k) < C.close);
    const candidates = visible.length ? visible : live;
    S.last = watchers.length ? watchers[(Math.random() * watchers.length) | 0]
      : candidates.reduce((nearest, k) => distTo(k) < distTo(nearest) ? k : nearest);
    S.last.returnToRing = !watchers.length;
    for (const k of live) {
      k.inPassage = inLane(k);
      if (k !== S.last && (k.mode === 'decoyHidden' || (k.inPassage && distTo(k) < 3.5))) {
        depart(k, Math.atan2(k.x - P().x, k.z - P().z));
      }
    }
    S.leaveHeading = wrap(yaw);
    S.escapeX = P().x; S.escapeZ = P().z; S.walked = 0;
    hooks.say('Walk away slowly. Keep a match lit in the dark.');
  }

  function depart(k, heading) {
    k.mode = 'leave';
    k.leaveT = 0;
    k.turnT = 0.45 + (k.index % 4) * 0.12;
    k.leaveDir = heading;
  }

  function updatePassageChildren(dt, info, live) {
    const p = P();
    // Only offer a pause once there is ample time or space to clear the ring.
    const fromRing = Math.hypot(p.x - S.center.x, p.z - S.center.z);
    if (!S.palm && !S.bell && info.moving && !info.running && fromRing > 2 &&
        (S.sinceOff < 5 || fromRing >= C.departDistance)) {
      const direction = Math.hypot(info.moveX, info.moveZ);
      const child = live.find(k => {
        if (k === S.last || k.mode !== 'stand' || k.role !== 'ordinary') return false;
        const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
        return d >= 4.6 && d < 8.5 && dx * info.moveX + dz * info.moveZ > d * direction * 0.87
          && !world.losBlocked(p.x, p.z, k.x, k.z, true);
      });
      if (child) {
        S.palm = { child, waited: 0, age: 0 };
        hooks.say('A child holds up one hand. Give it a moment or walk around.');
      }
    }
    const palm = S.palm;
    for (const k of live) {
      if (!k.inPassage || k === S.last || k === palm?.child || k.mode !== 'stand' || distTo(k) > 4.4) continue;
      depart(k, Math.atan2(k.x - p.x, k.z - p.z));
    }
    if (!palm || palm.child.mode !== 'stand') return;
    palm.age += dt;
    palm.waited = info.moving ? 0 : palm.waited + dt;
    if (S.bell || palm.waited >= 0.8 || palm.age >= 4) {
      depart(palm.child, Math.atan2(palm.child.x - p.x, palm.child.z - p.z) + Math.PI / 2);
    }
  }

  function routeAction(dt, info) {
    const available = info.available && ['dispersal', 'last'].includes(S.phase);
    return fixtures.action(dt, P(), info.yaw, available, info.held, S.phase === 'dispersal');
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
    setCompanion(k, S.currentRound || info.round || 1, k.c.root.scale.x);
  }

  function setCompanion(k, bornRound, size) {
    k.c.root.scale.setScalar(size);
    const originals = new Map();
    k.c.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!originals.has(o.material)) {
        const material = o.material.clone();
        if (material.color) material.userData.collectiveBaseColor = material.color.clone();
        originals.set(o.material, material);
      }
      o.material = originals.get(o.material);
    });
    S.companion = { k, materials: [...originals.values()], bornRound, lastRound: bornRound };
    hooks.mark?.();
  }

  function restoreCompanion(saved) {
    if (!saved || S.companion) return;
    const { x, z } = P();
    const point = walkableNear(x + 5, z + 7, x, z) || { x, z };
    const c = buildChild(M, Math.random);
    c.root.visible = false;
    scene.add(c.root);
    setCompanion({ ...point, c, heading: 0, headYaw: 0, phase: 0, speed: 0 }, saved.bornRound, saved.size);
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
    const idx = (i, j) => (j - pj + R) * W + (i - pi + R), q = [[pi, pj, 0]]; d[idx(pi, pj)] = 0;
    for (let h = 0; h < q.length; h++) {
      const [i, j, steps] = q[h];
      for (const [a, b] of DIRS) {
        const ni = i + a, nj = j + b;
        if (Math.abs(ni - pi) > R || Math.abs(nj - pj) > R || d[idx(ni, nj)] !== -1 || !world.cellWalkable(ni, nj)) continue;
        if (world.canStep && !world.canStep(i, j, ni, nj)) continue;
        d[idx(ni, nj)] = steps + 1; q.push([ni, nj, steps + 1]);
      }
    }
    S.field = { d, pi, pj, R, W };
    return q;
  }
  function fieldStep(k) {
    const F = S.field, G = world.grid; if (!F) return null;
    const ci = G.cellOf(k.x), cj = G.cellOf(k.z), at = (i, j) => (Math.abs(i - F.pi) > F.R || Math.abs(j - F.pj) > F.R) ? -1 : F.d[(j - F.pj + F.R) * F.W + (i - F.pi + F.R)];
    const here = at(ci, cj);
    if (here <= 0) return null;                            // in the player's cell: go straight
    let best = null, bd = here;
    for (const [a, b] of DIRS) {
      const ni = ci + a, nj = cj + b, v = at(ni, nj);
      if (v >= 0 && v < bd && (!world.canStep || world.canStep(ci, cj, ni, nj))) {
        bd = v; best = { x: ni * G.CELL, z: nj * G.CELL };
      }
    }
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
    if (k.role === 'fragment' && k.speed > 0.15 && (S.sanity ?? 100) <= 68) {
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

  function approachSlot(k, slot, speed, dt) {
    const blocked = world.grid && world.losBlocked(k.x, k.z, slot.x, slot.z);
    const waypoint = blocked ? fieldStep(k) : null;
    moveKid(k, waypoint?.x ?? slot.x, waypoint?.z ?? slot.z, speed, dt);
    return Math.hypot(slot.x - k.x, slot.z - k.z);
  }

  function capturePlayer() {
    S.captureT = 0; S.phase = 'captured'; hooks.capture();
  }

  // info: { inControl, yaw, flashlightOn, matchLit, roomLit, running, moving, clock }
  function update(dt, info) {
    if (S.phase === 'idle' || S.phase === 'done') { stopGroupSteps(); return; }
    if (!info.inControl) { for (const v of voices) v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.05); stopGroupSteps(); S.wasRunning = !!(info.running && info.moving); return; }
    S.t += dt; S.burstClock += dt; S.currentRound = info.round || S.currentRound; S.sanity = info.sanity ?? S.sanity ?? 100;
    const p = P(), ph = S.phase;
    if (S.distanceEchoT > 0 && (S.distanceEchoT -= dt) <= 0) { S.distanceEcho?.removeFromParent(); S.distanceEcho = null; }
    if (info.flashlightOn && ['appear', 'warning'].includes(ph)) {
      S.distanceEchoNext -= dt;
      if (S.distanceEchoNext <= 0) { showDistanceEcho(info); S.distanceEchoNext = rand([15, 24]); }
    }
    if (S.lastFlashlight === true && !info.flashlightOn) showAfterimages(info);
    S.lastFlashlight = info.flashlightOn;
    for (const k of kids) k.litFreeze = beamHits(k, info);
    for (const k of kids) {
      if (k.role !== 'decoy') continue;
      if (Number.isFinite(info.sanity) && info.sanity > 68) {
        if (k.mode === 'decoyHidden') { k.mode = 'arrive'; k.delay = 0; k.c.root.visible = true; }
        continue;
      }
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
    if (ph === 'gather') {       // they come as soon as the round begins
      appear(info);
      if (info.running && info.moving && !S.wasRunning) warnStopRunning();
      S.wasRunning = !!(info.running && info.moving);
      return;
    }
    if (world.grid && ['appear', 'surround', 'warning', 'aggro'].includes(ph) && (S.fieldT -= dt) <= 0) {
      buildField(); S.fieldT = 0.5;
    }

    // ── the rules (once they have you surrounded) ──
    const live = kids.filter((k) => !k.gone);
    if (ph === 'dispersal') updatePassageChildren(dt, info, live);
    const ruled = ph === 'dispersal' || ph === 'last';
    if (ruled) {
      const stepX = p.x - S.escapeX, stepZ = p.z - S.escapeZ;
      const limit = ph === 'last' ? C.lastNear : C.approach;
      const approached = S.sinceOff > C.separate && live.some((k) => {
        if (k.mode === 'leave' || k.mode === 'vanish' || distTo(k) >= limit) return false;
        if (!world.grid) return true;
        // A child that never reached the ring cannot block the player's escape down a corridor.
        if (k !== S.last && Math.hypot(k.x - S.center.x, k.z - S.center.z) > C.close) return false;
        const movingTowardChild = stepX * (k.x - p.x) + stepZ * (k.z - p.z) > 0.001;
        return movingTowardChild && !world.losBlocked(p.x, p.z, k.x, k.z);
      });
      const running = !!(info.running && info.moving);
      const runPunish = S.runWarned && ac.currentTime >= S.runClearAt;
      if (running && runPunish) provoke('ran');
      else if (approached) provoke('approached');
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

    if (S.phase === 'dispersal' && !S.gapClosed) {
      const route = S.routes.find(r => {
        const dx = p.x - S.routeOrigin.x, dz = p.z - S.routeOrigin.z;
        const forward = dx * Math.sin(r.angle) + dz * Math.cos(r.angle);
        return forward > 2.5 && Math.hypot(dx, dz) >= C.departDistance && nearPassage(p.x, p.z, S.routeOrigin, r, 2.3);
      });
      if (route) {
        S.gapClosed = true;
        // Only close the opening once the player has physically crossed it.
        const flank = live.filter(k => k.guide === route && k !== S.last && distTo(k) < 14);
        const x = (S.routeOrigin.x + route.turn.x) / 2, z = (S.routeOrigin.z + route.turn.z) / 2;
        for (const k of flank) depart(k, Math.atan2(x - k.x, z - k.z));
        const cue = flank.length ? 'They close ranks behind you. ' : '';
        const landmark = { lamp: 'A crank lamp waits ahead.', bell: 'A bell rope hangs ahead.', lever: 'A gate lever waits ahead.' };
        hooks.say(cue + landmark[route.kind]);
      }
    }

    // Starting to run gets told to stop. Surrounded with the light still on, starting to walk does too.
    const startedRunning = !!(info.running && info.moving) && !S.wasRunning;
    const surrounded = ph === 'warning' || ph === 'surround';
    if (startedRunning) warnStopRunning();
    else if (surrounded && info.flashlightOn && info.moving && !info.running && (!S.wasMoving || !S.wasSurrounded) && ctx.audio.stopMoving) once(ctx.audio.stopMoving, 1.1);
    S.wasMoving = !!info.moving;
    S.wasSurrounded = surrounded;
    S.wasRunning = !!(info.running && info.moving);
    // Walking, not running, and heading away from where they closed in: the quiet line, once per stretch.
    const ox = p.x - S.center.x, oz = p.z - S.center.z;
    const leaving = S.phase === 'dispersal' || S.phase === 'last';
    const walkingAway = leaving && info.moving && !info.running && (ox * (info.moveX || 0) + oz * (info.moveZ || 0)) > 0;
    if (walkingAway) {
      if (!S.wasWalkingAway && ctx.audio.walkAway) once(ctx.audio.walkAway, 1);
      S.wasWalkingAway = true;
      S.walkAwayGap = 0.45;
    } else if ((S.walkAwayGap -= dt) <= 0) S.wasWalkingAway = false;

    if (ph === 'warning') {
      S.warnT += dt;
      if (S.whisperStage === 0 && S.warnT >= C.whisperSwitch && info.flashlightOn) { once(ctx.audio.whisper, 1.1); S.whisperStage = 1; }
      if (S.warnT - dt < 3 && S.warnT >= 3 && S.routes.length) {
        const tell = { bell: 'Lamp or bell. Watch their hands.', lever: 'Lamp or gate lever. Watch their hands.' }[S.routes[1]?.kind] || 'Look for the crank lamp.';
        hooks.say(formationTell[S.formation] + ' ' + tell);
      }
      if (S.warnT >= C.warn || (S.warnT >= 4 && !info.flashlightOn && info.moving && !info.running)) {
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
        const s = slotOf(k), d = approachSlot(k, s, k.role === 'crawler' ? SP.crawl : SP.run, dt);
        if ((k.role === 'sentinel' || k.role === 'pivot') && d < 0.55) k.anchored = true;
        if (k.role === 'face') faceTo(k, p.x, p.z, dt, 12);
        if (d < 1.15 && distTo(k) < C.close) held++;
      }
      if (held >= S.expected - 5 && near >= S.expected - 6 || S.t > 16 && near >= S.expected * 0.6 || S.t >= C.gatherLimit) beginWarning();
    } else if (S.phase === 'surround' || S.phase === 'warning') {
      for (const k of kids) {
        if (k.mode === 'decoyHidden') continue;
        const s = slotOf(k), d = approachSlot(k, s, d2speed(k, s), dt);
        if (d < 0.3 && !k.litFreeze && !['backward', 'pivot'].includes(k.role)) faceTo(k, p.x, p.z, dt, k.role === 'face' ? 12 : 1.7);
        if (k.role === 'face' && !k.litFreeze) faceTo(k, p.x, p.z, dt, 12);
        if (S.phase === 'warning' && !k.litFreeze) faceTo(k, p.x, p.z, dt, 0.8 + Math.min(1, S.warnT / C.warn) * 4.2);
      }
    } else if (S.phase === 'dispersal' || S.phase === 'last') {
      S.sinceOff += dt;
      const moved = Math.hypot(p.x - S.escapeX, p.z - S.escapeZ);
      if (moved < 1) S.walked += moved;
      S.escapeX = p.x; S.escapeZ = p.z;
      const fromRing = Math.hypot(p.x - S.center.x, p.z - S.center.z);
      if (S.phase === 'dispersal' && S.sinceOff > C.separate && fromRing < C.departDistance) {
        provoke('approached'); draw(dt, info); return;
      }
      if (S.phase === 'dispersal' && S.sinceOff > C.separate - 3 && fromRing < C.departDistance && !S.walkWarned) {
        S.walkWarned = true; hooks.say('Keep walking. Slowly.');
      }
      fixtures.update(dt, p);
      if (info.matchLit || info.roomLit || fixtures.lit) { S.dark = 0; S.warned = false; }
      else if (S.sinceOff > C.separate) {
        S.dark += dt;
        if (S.dark > 1.5 && !S.warned) { S.warned = true; hooks.say('Strike a match (M). Don\'t let it go dark.'); }
        if (S.dark > C.noLight) { provoke('dark'); draw(dt, info); return; }
      }
      if (S.phase === 'dispersal') {
        S.nextLeave -= dt;
        if (S.nextLeave <= 0) {
          const stay = kids.filter((k) => k.mode === 'stand' || k.mode === 'arrive');
          const pick = stay.filter((k) => k !== S.last && k !== S.palm?.child);
          if (pick.length) {
            const k = pick[(Math.random() * pick.length) | 0];
            const direction = S.bell ? Math.atan2(S.bell.x - k.x, S.bell.z - k.z) : S.leaveHeading;
            depart(k, direction + (Math.random() - 0.5) * 0.12);
            if (!S.homeSaid && ctx.audio.goHome) { once(ctx.audio.goHome, 1); S.homeSaid = true; }
          }
          S.nextLeave = S.bell ? rand([0.15, 0.35]) : rand(C.leaveEvery);
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
          else k.leaveT += dt;
          const out = k.mode === 'vanish' ? distTo(k) > 14 || k.vanishT > 6
            : distTo(k) > C.leaveTo || k.leaveT >= (world.grid ? C.indoorLeaveLimit : 22);
          if (out) {
            k.gone = true; k.c.root.visible = false;
            if (k === S.last) hooks.say('Keep walking until you are clear.');
          }
        } else if (k === S.last && k.returnToRing && fromRing > 3 && Math.hypot(k.x - S.center.x, k.z - S.center.z) > 0.8) {
          const waypoint = world.grid && world.losBlocked(k.x, k.z, S.center.x, S.center.z) ? fieldStep(k) : null;
          moveKid(k, waypoint?.x ?? S.center.x, waypoint?.z ?? S.center.z, SP.keep, dt);
        } else if (k.mode === 'watch') { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt, 2); }
        else { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt); k.mode = 'stand'; }
      }
      if (S.phase === 'last' && S.last.mode === 'watch') {
        // the last one: motionless, facing you. Keep walking. After a while it turns and is gone. Nothing else.
        S.lastT += dt;
        const lastOutOfSight = world.grid && world.losBlocked(p.x, p.z, S.last.x, S.last.z);
        if (S.lastT >= C.lastWatch && (distTo(S.last) > C.lastNear + 1 || lastOutOfSight || (world.grid && S.lastT > 10))) {
          S.last.mode = 'vanish'; S.last.turnT = 2.2; S.last.leaveDir = Math.atan2(S.last.x - p.x, S.last.z - p.z); S.last.vanishT = 0;
        }
      }
      const escapeDistance = world.grid ? C.indoorEscape : C.escape;
      const clearOfRing = fromRing >= escapeDistance || !!world.grid && S.walked >= C.escape && fromRing >= C.departDistance * 1.5;
      if (S.phase === 'last' && S.last.gone && clearOfRing) { S.phase = 'done'; S.escaped = true; adoptLast(info); }
    } else if (S.phase === 'aggro') {
      S.aggroT += dt;
      S.syncPhase += dt * 10;                              // in step with one another
      for (const k of kids) {
        if (S.aggroT < 1.3) { k.speed = 0; if (!k.litFreeze) faceTo(k, p.x, p.z, dt, 12); continue; }   // they all turn to you first
        const wp = world.grid ? fieldStep(k) : null;
        moveKid(k, wp ? wp.x : p.x, wp ? wp.z : p.z, k.crawler ? SP.crawl : SP.run, dt);
        if (distTo(k) < 3 && !k.litFreeze) faceTo(k, p.x, p.z, dt, 12);
        if (distTo(k) < C.capture && S.captureT < 0 && (!world.grid || !world.losBlocked(p.x, p.z, k.x, k.z))) { capturePlayer(); break; }
      }
      if (S.captureT < 0 && world.grid && S.aggroT >= C.indoorPursuitLimit) capturePlayer();
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
        const sentinelStill = k.role === 'sentinel' && k.anchored && ['appear', 'warning', 'surround'].includes(S.phase);
        if (sentinelStill) {
          if (!k.sentinelSettled) poseChild(k.c, 'still', t, k0);
          k.sentinelSettled = true;
        } else {
          k.sentinelSettled = false;
          poseChild(k.c, state, t, k0, { a: S.captureT / 0.4 });
          const toPlayer = Math.atan2(p.x - k.x, p.z - k.z);
          if (k.role === 'face') k.heading += wrap(toPlayer - k.heading) * Math.min(1, dt * 12);
          let gaze = toPlayer;
          if (S.phase === 'warning' && k.guide) {
            gaze = Math.atan2(k.guide.turn.x - k.x, k.guide.turn.z - k.z);
            k.heading += wrap(gaze - k.heading) * Math.min(1, dt * 8);
            k.c.j.shR.rotation.x = -1.48;
            // Point with the right hand. The left mimes the fixture at the end of the path.
            const beat = k0 * 3;
            if (k.guide.kind === 'lamp') {
              k.c.j.shL.rotation.x = -0.72 + 0.25 * Math.cos(beat);
              k.c.j.elL.rotation.x = -0.6;
              k.c.j.shL.rotation.z = 0.28 * Math.sin(beat);
            } else {
              k.c.j.shL.rotation.x = -1.85 + 0.58 * Math.cos(beat);
              k.c.j.elL.rotation.x = -0.75;
            }
          } else if (k === S.palm?.child && k.mode === 'stand') {
            k.c.j.shL.rotation.x = -1.3;
            k.c.j.elL.rotation.x = -1.4;
          } else if (k.mode === 'watch' && S.phase === 'last') {
            // The final child acknowledges a peaceful departure with a small wave.
            k.c.j.shR.rotation.z = -2.45;
            k.c.j.elR.rotation.z = -0.35 + Math.sin(S.lastT * 4) * 0.22;
          }
          if (!(k.startsBack && k.delay > 0)) {
            const wantedHead = Math.max(-1.35, Math.min(1.35, wrap(gaze - k.heading)));
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
    // Footsteps of the ones still walking. The beam stops a child, and the loop stops once none of them are moving.
    const walking = kids.filter((k) => !k.gone && !k.litFreeze && k.speed > 0.25);
    if (!walking.length || !ctx.audio.groupSteps) stopGroupSteps();
    else {
      ensureGroupSteps();
      let sx = 0, sz = 0;
      for (const k of walking) {
        const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz) || 1;
        sx += dx / d; sz += dz / d;
      }
      sx /= walking.length; sz /= walking.length;
      const side = Math.max(-1, Math.min(1, sx * Math.cos(info.yaw) + sz * -Math.sin(info.yaw)));
      const ahead = Math.max(-1, Math.min(1, sx * -Math.sin(info.yaw) + sz * -Math.cos(info.yaw)));
      const level = 0.2 + 0.55 * (0.5 + 0.5 * ahead);
      groupSteps.g.gain.setTargetAtTime(level, ac.currentTime, 0.08);
      groupSteps.pan.pan.setTargetAtTime(side, ac.currentTime, 0.08);
    }
    // the old per-child steps stay quiet while the group loop is the sound of them walking
    const movers = groupSteps ? [] : kids.filter((k) => !k.gone && k.speed > 0.3 && k !== S.last).map((k) => [distTo(k), k]).sort((a, b) => a[0] - b[0]).slice(0, voices.length);
    voices.forEach((v, n) => {
      const m = movers[n];
      if (!m) { v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.08); return; }
      const [d, k] = m, rel = wrap(Math.atan2(-(k.x - p.x), -(k.z - p.z)) - info.yaw);
      voiceFor(v, k.speed > 2.5 ? ctx.audio.run : ctx.audio.walk);
      const fall = Math.max(0, 1 - d / 34);
      const bed = S.speechUntil > ac.currentTime ? 0 : 0.22 * fall * fall;
      v.gain.gain.setTargetAtTime(bed, ac.currentTime, 0.08);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(rel))), ac.currentTime, 0.08);
    });
  }

  // a bullet along dir: hitting any of them breaks rule 1
  function shot(origin, dir, range = 60) {
    if (!kids.length || S.phase === 'gather' || S.phase === 'idle' || S.phase === 'done') return false;
    for (const k of kids) {
      if (k.gone) continue;
      const sc = k.c.root.scale.x, gy = world.groundY(k.x, k.z);
      for (const h of [0.35, 0.7, 1.0]) {
        const cx = k.x - origin.x, cy = gy + h * sc - origin.y, cz = k.z - origin.z, t = cx * dir.x + cy * dir.y + cz * dir.z;
        if (t <= 0 || t > range) continue;
        const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
        if (mx * mx + my * my + mz * mz < 0.24 * 0.24 && !world.losBlocked(origin.x, origin.z, k.x, k.z)) { provoke('shot'); return true; }
      }
    }
    return false;
  }

  return {
    start, update, updateFollower, restoreCompanion, shot, provoke, clear, speak, routeAction, usedLever,
    saveCompanion: () => S.companion && { bornRound: S.companion.bornRound, size: S.companion.k.c.root.scale.x },
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
