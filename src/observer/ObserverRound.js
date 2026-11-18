import * as THREE from 'three';
import { createObserver } from './ObserverController.js';
import { buildCorpse, poseCorpse, placeBodies, burnStep } from './DeadBodies.js';

// The Observer round: bodies to find and burn (three in round 1, one more each round after), one match each, while the Observer watches.
// Timer, win and loss live in main.js with the other rounds; this owns the bodies and the creature.
export const OBS_ROUND = { bodies: 3, perRound: 1, seconds: 360, burnDone: 2.5, reach: 2.3,
  firstExtra: 240, extraEvery: 60, extraChance: 0.5 };   // a second observer at 4:00, then a coin flip every minute after
// A body that is not there: seen at the edge of the light, gone when the light lands on it. The radar catches it only briefly.
export const DECOY = { first: [25, 40], every: [28, 50], life: 14, radarFor: 1.8 };
// Traces it leaves where it has been: drag marks, claw scratches on trunks, hanging bodies set swinging.
export const MARKS = { every: 2.2, max: 60, freshFor: 40, breathChance: 0.3 };
// When it hunts, the bodies you are not looking at move: crawl a little, turn, lift their heads.
export const SHIFT = { chance: 0.6, crawl: [1.5, 4] };
const rnd = ([a, b]) => a + Math.random() * (b - a);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const MARK_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const SCRATCH_GEO = new THREE.BoxGeometry(0.02, 0.42, 0.014);
export const bodiesFor = (roundN) => OBS_ROUND.bodies + OBS_ROUND.perRound * Math.max(0, roundN - 1);

// ctx: { scene, camera, world, audio, hooks (observer hooks), glowAdd, lightPush, fireCells, smallCells,
//        inv, toast, sfx: { strike, crackle(x, z) }, clearZones, circles, refresh(), rng, onBurned(n) }
export function createObserverRound(ctx) {
  let huntOn = false;
  // several observers can hunt at once: the world goes silent with the first and comes back after the last
  const hooks = {
    ...ctx.hooks,
    huntStart() { if (!huntOn) { huntOn = true; ctx.hooks.huntStart(); } shiftBodies(); },
    huntEnd() { if (huntOn && !observers.some((o) => o.hunting)) { huntOn = false; ctx.hooks.huntEnd(); } },
  };
  const makeObserver = (first = false) => createObserver({ scene: ctx.scene, camera: ctx.camera, world: ctx.world, audio: ctx.audio, hooks, ambientScale: ctx.ambientScale, mimic: first });
  const observer = makeObserver(true);
  const observers = [observer];
  let bodies = [], active = false, burned = 0, sway = 0, senseWord = '', nearest = Infinity, pulseIn = 1.5;
  const ac = ctx.audio.ctx, W = ctx.world, camDir = new THREE.Vector3();
  let decoy = null, decoyIn = rnd(DECOY.first), lastInfo = null;
  const marks = [];
  const dragMat = new THREE.MeshLambertMaterial({ color: 0x15100b, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const scratchMat = new THREE.MeshLambertMaterial({ color: 0xd8cbb0 });
  const relTo = (x, z) => { const p = ctx.camera.position; return wrapA(Math.atan2(-(x - p.x), -(z - p.z)) - (lastInfo ? lastInfo.yaw : 0)); };
  const distTo = (x, z) => Math.hypot(x - ctx.camera.position.x, z - ctx.camera.position.z);

  // ── evidence ──
  function addMark(m, x, z) {
    ctx.scene.add(m); marks.push({ m, x, z, t: 0, breathed: false });
    if (marks.length > MARKS.max) marks.shift().m.removeFromParent();
  }
  function dragMark(x, z, heading, len = 1.6) {
    const m = new THREE.Mesh(MARK_GEO, dragMat);
    m.scale.set(0.42 + Math.random() * 0.15, 1, len); m.position.set(x, W.groundY(x, z) + 0.025, z); m.rotation.y = heading;
    addMark(m, x, z);
  }
  function scratchTree([tx, tz, th, tr], x, z) {
    const a = Math.atan2(x - tx, z - tz), g = new THREE.Group(), h = 1.45 + Math.random() * 0.5;
    g.position.set(tx + Math.sin(a) * (tr + 0.02), W.groundY(tx, tz) + h, tz + Math.cos(a) * (tr + 0.02)); g.rotation.y = a;
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(SCRATCH_GEO, scratchMat); s.position.set((i - 1) * 0.07, -i * 0.03, 0); s.rotation.z = 0.32; g.add(s); }
    addMark(g, x, z);
  }
  function dragTrail(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(d / 1.4));
    for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; dragMark(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, h, d / n + 0.3); }
  }
  function trackEvidence(dt) {
    for (const o of observers) {
      if (!o.active) continue;
      const ev = o._ev || (o._ev = { x: o.position.x, z: o.position.z, acc: 0 });
      const dx = o.position.x - ev.x, dz = o.position.z - ev.z, l = Math.hypot(dx, dz);
      ev.x = o.position.x; ev.z = o.position.z;
      if (l > 4) { ev.acc = 0; continue; }                 // it was moved, not walked
      ev.acc += l;
      if (ev.acc < MARKS.every) continue;
      ev.acc = 0;
      for (const b of bodies) if (b.spec.kind === 'hang' && !b.done && Math.hypot(b.spec.x - ev.x, b.spec.z - ev.z) < 4.5) b.swing = 1;   // brushed past it
      if (o.vis.visible || o.mimicking) continue;
      const trees = W.trees ? W.trees(ev.x, ev.z, 1.8) : [];
      if (trees.length && Math.random() < 0.4) scratchTree(trees[0], ev.x, ev.z);
      else if (Math.random() < 0.55) dragMark(ev.x, ev.z, Math.atan2(dx, dz));
    }
    for (const k of marks) {
      k.t += dt;
      if (!k.breathed && k.t < MARKS.freshFor && distTo(k.x, k.z) < 5) {
        k.breathed = true;
        if (Math.random() < MARKS.breathChance) observer.audio.exhale(relTo(k.x, k.z) + Math.PI * (0.6 + Math.random() * 0.4), 3 + Math.random() * 3);   // close, behind
      }
    }
  }
  function clearMarks() { for (const k of marks) k.m.removeFromParent(); marks.length = 0; }

  // ── the bodies move while it hunts, the ones you aren't looking at ──
  function shiftBodies() {
    const p = ctx.camera.position; ctx.camera.getWorldDirection(camDir);
    const fl = Math.hypot(camDir.x, camDir.z) || 1;
    let moved = false;
    for (const b of bodies) {
      if (b.done || b.burnT >= 0 || Math.random() > SHIFT.chance) continue;
      const dx = b.spec.x - p.x, dz = b.spec.z - p.z, d = Math.hypot(dx, dz);
      if (d < 18 && (dx * camDir.x + dz * camDir.z) / (d * fl) > 0.45 && !W.losBlocked(p.x, p.z, b.spec.x, b.spec.z)) continue;   // you'd see it go
      const j = b.c.j;
      if (b.spec.kind === 'ground') {
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2, r = rnd(SHIFT.crawl), nx = b.spec.x + Math.sin(a) * r, nz = b.spec.z + Math.cos(a) * r;
          if (!W.walkable(nx, nz, 0.6)) continue;
          dragTrail(b.spec.x, b.spec.z, nx, nz);
          b.spec.x = nx; b.spec.z = nz; b.spec.y = W.groundY(nx, nz); b.spec.facing += (Math.random() - 0.5) * 2.4;
          b.c.root.position.set(nx, b.spec.y, nz); b.c.root.rotation.y = b.spec.facing;
          j.shR.rotation.set(-0.2, 0, -2.4 - Math.random() * 0.4); j.elR.rotation.set(-0.5, 0, 0);   // one arm stretched out ahead, as if it pulled itself along
          j.head.rotation.y = (Math.random() - 0.5) * 1.6;
          ctx.clearZones.push(nx, nz, 1.8); moved = true;
          break;
        }
      } else if (b.spec.kind === 'lean') {
        j.head.rotation.set(0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.4);   // the head has come up
        j.shL.rotation.x -= 0.5 + Math.random() * 0.5;
      } else { b.spec.facing += (Math.random() - 0.5) * 2.6; b.swing = 1; }       // turned round on the rope
    }
    if (moved) ctx.refresh();
  }

  // ── decoys ──
  function spawnDecoy(info) {
    const p = ctx.camera.position, beam = info.beamAngle;
    for (let k = 0; k < 20; k++) {
      const rel = (Math.random() < 0.5 ? -1 : 1) * beam * (1.08 + Math.random() * 0.3), d = 9 + Math.random() * 9, a = info.yaw + rel;
      const x = p.x - Math.sin(a) * d, z = p.z - Math.cos(a) * d;
      if (!W.walkable(x, z, 0.6) || W.losBlocked(p.x, p.z, x, z)) continue;
      if (bodies.some((b) => Math.hypot(b.spec.x - x, b.spec.z - z) < 8)) continue;
      const c = buildCorpse(Math.random), spec = { kind: 'lean', x, z, y: W.groundY(x, z), facing: Math.atan2(p.x - x, p.z - z) + (Math.random() - 0.5) };
      poseCorpse(c, spec, Math.random);
      if (c.stain) c.stain.visible = false;
      ctx.scene.add(c.root);
      decoy = { c, x, z, t: 0 };
      return;
    }
  }
  function removeDecoy() { if (decoy) { decoy.c.root.removeFromParent(); decoy = null; } }
  function updateDecoy(dt, info) {
    // False bodies are a sanity hallucination. Recovering above the clear threshold removes
    // an active false sighting immediately and prevents another one from spawning.
    if (Number.isFinite(info.sanity) && info.sanity > 68) { removeDecoy(); return; }
    if (!decoy) {
      if (huntOn || !(info.flashlightOn || info.dusk)) return;
      decoyIn -= dt;
      if (decoyIn <= 0) { decoyIn = rnd(DECOY.every); spawnDecoy(info); }
      return;
    }
    decoy.t += dt;
    const p = ctx.camera.position, gy = W.groundY(decoy.x, decoy.z);
    ctx.camera.getWorldDirection(camDir);
    const vx = decoy.x - p.x, vy = gy + 0.55 - p.y, vz = decoy.z - p.z, d3 = Math.hypot(vx, vy, vz), d = Math.hypot(vx, vz);
    const ang = Math.acos(Math.min(1, (vx * camDir.x + vy * camDir.y + vz * camDir.z) / (d3 || 1)));
    const clear = !W.losBlocked(p.x, p.z, decoy.x, decoy.z);
    const lit = clear && ((info.flashlightOn && info.beamLit > 0.2 && d < info.beamRange && ang < info.beamAngle * 0.8) || (info.matchActive && d < info.matchRadius + 1.5));
    if (lit || d < 5) { observer.audio.exhale(relTo(decoy.x, decoy.z), d); removeDecoy(); }   // the light lands on it, and there is nothing there
    else if (decoy.t > DECOY.life) removeDecoy();
  }

  // ── the last body: one of them waits beside it ──
  function updateGuard() {
    const left = bodies.filter((b) => !b.done && b.burnT < 0);
    observer.setGuard(active && bodies.length > 1 && left.length === 1 ? left[0].spec : null);
  }

  function senseOf(d) {
    if (!active || !Number.isFinite(d)) return '';
    if (d < 14) return 'CLOSE';
    if (d < 34) return 'NEAR';
    return 'FAR';
  }
  // a short pull from the nearest unburned body: quieter and slower when it is far
  function pulse(px, pz, yaw, bx, bz, d) {
    const dx = bx - px, dz = bz - pz;
    const right = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / (d || 1);
    const vol = d < 14 ? 0.22 : d < 34 ? 0.11 : 0.045;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
    o.type = 'sine'; o.frequency.setValueAtTime(92, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.28);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    p.pan.value = Math.max(-1, Math.min(1, right));
    o.connect(g).connect(p).connect(ctx.audio.dest); o.start(t); o.stop(t + 0.36);
  }

  function start(center, count = OBS_ROUND.bodies) {
    for (const b of bodies) b.c.root.removeFromParent();
    while (observers.length > 1) observers.pop().dispose();
    bodies = []; burned = 0; huntOn = false;
    removeDecoy(); clearMarks(); decoyIn = rnd(DECOY.first); observer._ev = null;
    ctx.clearZones.length = 0;
    for (const spec of placeBodies(ctx.world, center, ctx.rng, count)) {
      const c = buildCorpse(ctx.rng);
      poseCorpse(c, spec, ctx.rng);
      ctx.scene.add(c.root);
      bodies.push({ c, spec, burnT: -1, done: false, phase: ctx.rng() * 6 });
      ctx.clearZones.push(spec.x, spec.z, 1.8);              // no tall grass hiding them
      if (spec.kind !== 'ground') ctx.circles.push(spec.x, spec.z, 0.3);
    }
    ctx.refresh();
    active = true;
    senseWord = ''; nearest = Infinity; pulseIn = 1.2;
    observer.spawn();
    return bodies.length;
  }
  function addObservers(count = 1) {
    if (!active) return 0;
    for (let i = 0; i < count; i++) {
      const extra = makeObserver();
      observers.push(extra);
      extra.spawn();
    }
    return count;
  }
  function stop() { active = false; senseWord = ''; nearest = Infinity; huntOn = false; removeDecoy(); for (const o of observers) o.despawn(); }

  function burn(b) {
    if (ctx.inv.matches <= 0) { ctx.toast('You need a match to burn it'); return; }
    ctx.inv.matches--;
    b.burnT = 0;
    ctx.sfx.strike(); ctx.sfx.crackle(b.spec.x, b.spec.z);
    ctx.toast('It catches');
    for (const o of observers) if (o.active) o.alert(b.spec.x, b.spec.z);     // they all hear it, and come to see
  }

  // every frame, inside the world update (between the glow layer reset and commit)
  function world(dt, inControl, px, pz, yaw, clock) {
    if (!active && !bodies.length) return null;
    sway += dt;
    let action = null, best = OBS_ROUND.reach, nearD = Infinity, nearX = 0, nearZ = 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const b of bodies) {
      if (b.spec.kind === 'hang') {
        const sw = b.swing || 0;                                   // set swinging by something passing
        b.c.root.rotation.y = b.spec.facing + 0.28 * Math.sin(sway * 0.4 + b.phase) + sw * 0.5 * Math.sin(sway * 2.1 + b.phase);
        b.c.root.rotation.z = 0.025 * Math.sin(sway * 0.7 + b.phase) + sw * 0.14 * Math.sin(sway * 2.4 + b.phase);
        if (sw > 0) b.swing = Math.max(0, sw - dt / 9);
      }
      if (!b.done && b.burnT < 0) {
        const dd = Math.hypot(b.spec.x - px, b.spec.z - pz);
        if (dd < nearD) { nearD = dd; nearX = b.spec.x; nearZ = b.spec.z; }
      }
      if (b.burnT >= 0) {
        if (inControl) b.burnT += dt;
        burnStep(b.c, b.burnT, ctx.glowAdd, ctx.lightPush, ctx.fireCells, ctx.smallCells, clock);
        if (!b.done && b.burnT >= OBS_ROUND.burnDone) { b.done = true; burned++; ctx.onBurned(burned); }
        continue;
      }
      if (!active || !inControl) continue;
      const ex = b.spec.x - px, ez = b.spec.z - pz, d = Math.hypot(ex, ez);
      if (d < best && (d < 1.1 || (ex * fx + ez * fz) / d > 0.15)) {
        best = d;
        action = { label: ctx.inv.matches > 0 ? `[E] Burn the body (1 match, ${ctx.inv.matches} left)` : 'No matches left to burn it', run: () => burn(b) };
      }
    }
    nearest = nearD;
    senseWord = senseOf(nearD);
    if (active && inControl) { trackEvidence(dt); updateGuard(); }
    if (active && inControl && Number.isFinite(nearD)) {
      pulseIn -= dt;
      const gap = nearD < 14 ? 0.75 : nearD < 34 ? 1.45 : 2.8;
      if (pulseIn <= 0) { pulseIn = gap; pulse(px, pz, yaw, nearX, nearZ, nearD); }
    }
    return action;
  }

  return {
    observer, start, stop, world, OBS_ROUND,
    update: (dt, info) => {
      if (!active) return;
      lastInfo = info;
      for (const o of observers) o.update(dt, info);
      if (info.inControl) updateDecoy(dt, info);
    },
    // what the radar shows: real bodies, a decoy for a moment after it appears, and, while one hunts, the hunter itself as a body
    radarMarks() {
      const out = [];
      for (const b of bodies) if (!b.done) out.push({ x: b.spec.x, z: b.spec.z, kind: b.burnT >= 0 ? 'burning' : 'body' });
      if (decoy && decoy.t < DECOY.radarFor) out.push({ x: decoy.x, z: decoy.z, kind: 'decoy' });
      for (const o of observers) if (o.active && o.hunting) out.push({ x: o.position.x, z: o.position.z, kind: 'false' });
      return out;
    },
    get decoy() { return decoy && { x: decoy.x, z: decoy.z, t: decoy.t }; },
    spawnDecoy: () => lastInfo && spawnDecoy(lastInfo),
    get marks() { return marks.length; },
    shiftBodies,
    shot: (origin, dir, range) => active && observers.some((o) => o.shot(origin, dir, range)),
    // fire that did not come from a match (a blast): every unburned body within r catches, and they all hear it
    burnNear(x, z, r) {
      let n = 0;
      for (const b of bodies) {
        if (b.done || b.burnT >= 0 || Math.hypot(b.spec.x - x, b.spec.z - z) > r) continue;
        b.burnT = 0; n++;
        ctx.sfx.crackle(b.spec.x, b.spec.z);
        for (const o of observers) if (o.active) o.alert(b.spec.x, b.spec.z);
      }
      return n;
    },
    addObservers,
    get observers() { return observers; },
    get active() { return active; },
    get burned() { return burned; },
    get total() { return bodies.length; },
    get hunting() { return active && observers.some((o) => o.hunting); },
    get sense() { return senseWord; },
    get nearest() { return nearest; },
    bodies: () => bodies.map((b) => ({ kind: b.spec.kind, x: +b.spec.x.toFixed(2), z: +b.spec.z.toFixed(2), facing: b.spec.facing, y: +b.spec.y.toFixed(2), anchorY: b.spec.anchorY, burnT: b.burnT, done: b.done })),
  };
}
