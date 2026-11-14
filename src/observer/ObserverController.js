import * as THREE from 'three';
import { createObserverModel } from './ObserverModel.js';
import { ObserverAnimator } from './ObserverAnimator.js';
import { ObserverMovement } from './ObserverMovement.js';
import { createVisibility, updateVisibility } from './ObserverVisibility.js';
import { createObserverAudio } from './ObserverAudio.js';

// Tuning. Attention is hidden from the player; it only shows through how the creature behaves and sounds.
export const OBSERVER = {
  stages: [   // 0 Awareness, 1 Interest, 2 Fixation, 3 Imminent danger. dist: metres it keeps; peek: seconds between sightings
    { name: 'awareness', dist: [16, 26], peek: [12, 20], step: 0,    breath: 0 },
    { name: 'interest',  dist: [12, 20], peek: [8, 14],  step: 0.35, breath: 0.3 },
    { name: 'fixation',  dist: [8, 14],  peek: [5, 9],   step: 0.6,  breath: 0.5, disturb: [22, 36] },
    { name: 'imminent',  dist: [5, 9],   peek: [3, 6],   step: 0.95, breath: 0.75, disturb: [12, 20], flicker: [6, 12], phantom: [9, 16] },
  ],
  attention: { look: 4, match: 12, shot: 20, approach: 5, approachMetres: 3, ignoreEvery: 10, ignoreDrop: 5, calmEvery: 20, calmDrop: 10 },
  hunt: { duration: 20, startDist: 12, attackDist: 1.5, speed: 3.5, after: 75, silence: 3, retreatCooldown: 2.5 },
  speed: { stalk: 1.4, creep: 2.0, reposition: 4.4, catchUp: 8, retreat: 7.5, relocate: 9 },
  stare: { after: 1.5, rate: 9, burst: 4.5, burstGain: 18 },   // looking straight at it: past 1.5 s each second costs more; 4.5 s and it hisses
  unseen: { close: 0.45, time: 9 },          // looking away lets it come in: up to 45% closer after 9 s unseen
  mimic: { first: [20, 35], every: [55, 90], dur: [10, 16], dist: [24, 30], breakDist: 14 },
  guard: { ring: [3, 4.5], lightRange: 22, lightGain: 7 },   // the last body: your light near it is what it watches for
  alert: { gain: 14, watch: 9, standOff: 7.5 },             // a body burning: it comes to the edge of the firelight
  centralAngle: 0.2,         // radians either side of the crosshair that count as looking straight at it
  radius: 0.35,
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = ([a, b]) => a + Math.random() * (b - a);
const stageOf = (a) => a >= 75 ? 3 : a >= 50 ? 2 : a >= 25 ? 1 : 0;

// ctx: { scene, camera, world, audio: { ctx, dest, noise }, ambientScale,
//        hooks: { huntStart(), huntEnd(), flicker(kind), disturb(rel, dist) -> handled?, capture() } }
// world: { kind, grid, groundY, walkable(x, z, r), losBlocked(x0, z0, x1, z1), cover(x, z, px, pz),
//          cellWalkable(i, j), clearLine(x0, z0, x1, z1, r), collide(pos, r) }
export function createObserver(ctx) {
  const { scene, camera, world, hooks } = ctx;
  const model = createObserverModel({ ambientScale: ctx.ambientScale ?? 1 });
  model.root.visible = false;
  scene.add(model.root);
  const anim = new ObserverAnimator(model);
  const move = new ObserverMovement(world, OBSERVER.radius);
  const vis = createVisibility();
  const audio = createObserverAudio(ctx.audio.ctx, ctx.audio.dest, ctx.audio.noise, ctx.audio.bones);
  const A = OBSERVER.attention, SP = OBSERVER.speed, HU = OBSERVER.hunt, ST = OBSERVER.stare, MI = OBSERVER.mimic, GU = OBSERVER.guard, AL = OBSERVER.alert;
  // only the first Observer of a round does the imitation; its light exists from the start so no shader rebuild mid-round
  let mLight = null, mLens = null;
  if (ctx.mimic) {
    mLight = new THREE.SpotLight(0xffeccc, 0, 30, 0.42, 0.55, 1.35);
    scene.add(mLight); scene.add(mLight.target);
    mLens = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
    mLens.visible = false; model.j.RightHand.add(mLens); mLens.position.set(0, -0.14, 0.03);
  }
  const handPos = new THREE.Vector3(), lastP = new THREE.Vector3();
  const chest = new THREE.Vector3(), eye = new THREE.Vector3();
  const S = {
    active: false, pos: new THREE.Vector3(), heading: 0, attention: 0, stage: 0,
    mode: 'lurk', modeT: 0, goal: null, retarget: 0, peekIn: 20, peekHold: 0,
    frozen: false, revealed: false, prevMatch: false, matchAwarded: true,
    notSeen: 0, sinceGain: 0, closed: 0, prevDist: 0,
    disturbIn: 25, flickerIn: 8, phantomIn: 10, phantom: null,
    hunt: null, lunge: -1, captured: false, rel: 0, yaw: 0, info: null,
    stare: 0, stareBurst: false, unseenT: 0, mimic: null, mimicIn: rand(MI.first), guard: null, drawn: null, edgePeek: false,
  };
  const P = () => camera.position;
  const relOf = (x, z) => wrap(Math.atan2(-(x - P().x), -(z - P().z)) - S.yaw);   // bearing from the player's facing, + = left
  const at = (rel, d) => { const a = S.yaw + rel; return { x: P().x - Math.sin(a) * d, z: P().z - Math.cos(a) * d }; };
  const gain = (v) => { S.attention = Math.min(100, S.attention + v); S.sinceGain = 0; };
  const drop = (v) => { S.attention = Math.max(0, S.attention - v); };

  // Somewhere to stand, chosen against the player's real view: just outside it, at the edge of the beam,
  // or behind, preferring places with rock, a wall or a trunk between it and the player.
  function pickSpot(kind, dMin, dMax) {
    const p = P(), curRel = relOf(S.pos.x, S.pos.z), side = curRel >= 0 ? 1 : -1, H = vis.halfH;
    const curDist = Math.hypot(S.pos.x - p.x, S.pos.z - p.z), beam = S.info ? S.info.beamAngle : 0.44;
    let best = null, bestScore = -1e9;
    for (let k = 0; k < 28; k++) {
      let rel, d = dMin + Math.random() * (dMax - dMin);
      if (kind === 'peek') { rel = side * beam * (0.22 + Math.random() * 0.36); d = Math.min(d, 11); }   // into the beam, close enough to catch the light
      else if (kind === 'edge') rel = side * beam * (1.15 + Math.random() * 0.25);                      // the dim fringe: the corner of your eye
      else if (kind === 'lurk') rel = Math.random() < 0.6 ? side * (H + 0.15 + Math.random() * 0.6) : side * (Math.PI - Math.random() * 0.9);
      else if (kind === 'retreat') { rel = curRel + side * (0.25 + Math.random() * 0.8); d = Math.max(d, curDist + 7 + Math.random() * 7); }   // backing off, out toward the edge
      else rel = Math.PI + (Math.random() - 0.5) * (kind === 'spawn' ? 1.6 : 0.7);           // 'behind', 'spawn'
      const { x, z } = at(rel, d);
      if (!world.walkable(x, z, 0.45)) continue;
      const hidden = world.losBlocked(p.x, p.z, x, z);
      if ((kind === 'peek' || kind === 'edge') && hidden) continue;
      let s = -Math.abs(d - (dMin + dMax) / 2) * 0.15 - Math.hypot(x - S.pos.x, z - S.pos.z) * 0.04;
      if (kind !== 'peek' && kind !== 'edge') {
        if (hidden) s += 2.5; else if (world.cover(x, z, p.x, p.z)) s += 1.6;
        if (Math.abs(rel) < H + 0.08) s -= kind === 'retreat' ? 1 : 4;
        if (kind === 'retreat') {                                 // never a route that brings it closer first
          const ax = S.pos.x - p.x, az = S.pos.z - p.z, bx = x - S.pos.x, bz = z - S.pos.z, L2 = bx * bx + bz * bz || 1;
          const t = Math.max(0, Math.min(1, -(ax * bx + az * bz) / L2));
          if (Math.hypot(ax + bx * t, az + bz * t) < curDist - 0.3) s -= 6;
        }
        if (kind !== 'behind' && kind !== 'spawn' && Math.sign(rel) !== side && Math.abs(curRel) < 2.4) s -= 3;   // don't cut across the view
      }
      if (s > bestScore) { bestScore = s; best = { x, z }; }
    }
    return best;
  }
  function away(d) {
    const p = P(), dx = S.pos.x - p.x, dz = S.pos.z - p.z, l = Math.hypot(dx, dz) || 1;
    return { x: S.pos.x + dx / l * d, z: S.pos.z + dz / l * d };
  }
  function setRetreat(far = false) {
    const st = OBSERVER.stages[Math.min(3, S.stage)];
    S.mode = 'retreat'; S.modeT = 0;
    S.goal = pickSpot('retreat', far ? 26 : st.dist[0], far ? 36 : st.dist[1] + 6) || away(far ? 25 : 10);
  }
  function startHunt() {
    if (S.mimic) endMimic(false);
    S.drawn = null;
    S.hunt = { t: 0, phase: 1, cd: 0, back: 0, relocate: 0 };
    S.attention = 100; S.mode = 'hunt'; S.goal = null; S.frozen = false; S.revealed = false;
    move.reset(); audio.sting(); hooks.huntStart();
  }
  function endHunt() {
    S.hunt = null; S.attention = HU.after; S.sinceGain = 0; S.notSeen = 0;
    setRetreat(true); hooks.huntEnd();
  }

  anim.onStep = (side, strength) => {
    if (!S.active || !S.info) return;
    const st = OBSERVER.stages[Math.min(3, S.stage)], d = vis.dist;
    const v = S.hunt ? 0.75 + 0.75 * Math.max(0, 1 - d / 14) : S.mimic ? 0.6 : st.step;
    if (v > 0) audio.step(S.rel, d, v, strength);
  };

  function spawn() {
    S.yaw = S.info ? S.info.yaw : 0;
    vis.halfH = 0.9;
    const p = pickSpot('spawn', 28, 38) || pickSpot('spawn', 18, 28) || at(Math.PI, 30);
    S.pos.set(p.x, 0, p.z); S.heading = Math.atan2(P().x - p.x, P().z - p.z);
    Object.assign(S, { active: true, attention: 0, stage: 0, mode: 'lurk', modeT: 0, goal: null, retarget: 0, peekIn: rand([8, 14]),
      frozen: false, revealed: false, notSeen: 0, sinceGain: 0, hunt: null, lunge: -1, captured: false, disturbIn: 25, flickerIn: 8, phantomIn: 10, phantom: null,
      stare: 0, stareBurst: false, unseenT: 0, mimic: null, mimicIn: rand(MI.first), guard: null, drawn: null, edgePeek: false });
    lastP.copy(P());
    if (mLight) { mLight.intensity = 0; mLens.visible = false; }
    move.reset();
    model.root.visible = true;
    place();
  }
  function place() {
    model.root.position.set(S.pos.x, world.groundY(S.pos.x, S.pos.z), S.pos.z);
    model.root.rotation.y = S.heading;
  }

  // info: { inControl, yaw, flashlightOn, beamLit, beamRange, beamAngle, matchActive, matchRadius, flash, playerMoving }
  function update(dt, info) {
    if (!S.active) return;
    S.info = info; S.yaw = info.yaw;
    if (!info.inControl) { audio.breath(dt, 0, 99, 0); audio.bones(false, 0, 99); return; }        // paused, intro, or dead: hold everything
    const p = P(), gy = world.groundY(S.pos.x, S.pos.z);
    chest.set(S.pos.x, gy + 1.75, S.pos.z);
    model.eyes[0].getWorldPosition(eye);
    updateVisibility(vis, camera, chest, eye, {
      flashlightOn: info.flashlightOn, beamLit: info.beamLit, beamRange: info.beamRange, beamAngle: info.beamAngle,
      matchActive: info.matchActive, matchRadius: info.matchRadius, flash: info.flash, blocked: world.losBlocked, centralAngle: OBSERVER.centralAngle,
    });
    const dist = vis.dist, rel = S.rel = relOf(S.pos.x, S.pos.z);
    model.sizeEyes(Math.hypot(dist, eye.y - p.y), THREE.MathUtils.degToRad(camera.fov) / (ctx.renderHeight || 300));
    if (S.hold) {                       // console only: pin it in place in one animation, for inspection
      const lk = wrap(Math.atan2(p.x - S.pos.x, p.z - S.pos.z) - S.heading);
      anim.setState(S.hold.state); anim.update(dt, { speed: S.hold.speed || 0, lookYaw: lk, lookPitch: 0.2 }); place();
      model.mats.setEyeGlow(vis.los && vis.depth > 0 ? Math.max(0, Math.min(1, (vis.facing - 0.5) / 0.4)) ** 1.2 * 0.95 : 0);
      return;
    }

    // ── attention ──
    if (!S.hunt) {
      if (vis.visible && vis.central) {
        S.stare += dt;
        const over = S.stare - ST.after;
        gain((A.look + (over > 0 ? ST.rate * over : 0)) * dt);              // the longer you hold its gaze, the worse
        if (S.stare >= ST.burst && !S.stareBurst) { S.stareBurst = true; gain(ST.burstGain); audio.hiss(S.rel, vis.dist); hooks.flicker('dip'); }
        const closer = S.prevDist - dist;
        if (closer > 0 && info.playerMoving) { S.closed += closer; while (S.closed >= A.approachMetres) { S.closed -= A.approachMetres; gain(A.approach); } }
      } else { S.closed = 0; S.stare = Math.max(0, S.stare - dt * 2); if (S.stare === 0) S.stareBurst = false; }
      if (S.guard && info.flashlightOn && Math.hypot(p.x - S.guard.x, p.z - S.guard.z) < GU.lightRange) gain(GU.lightGain * dt);   // it watches the last body for your light
      if (vis.visible) S.notSeen = 0;
      else { S.notSeen += dt; if (S.notSeen >= A.ignoreEvery) { S.notSeen -= A.ignoreEvery; drop(A.ignoreDrop); } }
      S.sinceGain += dt;
      if (S.sinceGain >= A.calmEvery) { S.sinceGain -= A.calmEvery; drop(A.calmDrop); }
    }
    S.prevDist = dist;
    S.unseenT = vis.visible ? 0 : S.unseenT + dt;
    if (info.matchActive && !S.prevMatch) S.matchAwarded = false;           // a fresh match
    S.prevMatch = info.matchActive;
    const revealNow = !S.hunt && vis.matchLit;
    if (revealNow && vis.inView && !S.matchAwarded) { S.matchAwarded = true; gain(A.match); }
    if (S.attention >= 100 && !S.hunt) startHunt();
    S.stage = S.hunt ? 4 : stageOf(S.attention);
    const st = OBSERVER.stages[Math.min(3, S.stage)];

    // ── behaviour ──
    let speed = 0, state = 'idle', goal = S.goal, freeze = false;
    const look = wrap(Math.atan2(p.x - S.pos.x, p.z - S.pos.z) - S.heading);
    const lookPitch = Math.atan2(gy + 2.35 - p.y, Math.max(0.5, dist)) * 0.8;
    if (!S.hunt && !S.mimic && ctx.mimic && !S.guard && !S.drawn && S.stage <= 1) { S.mimicIn -= dt; if (S.mimicIn <= 0) startMimic(); }
    if (S.mimic && !S.hunt) {
      if (mimicStep(dt, dist)) { lastP.copy(p); return; }
    }
    lastP.copy(p);
    if (S.hunt) ({ speed, state, goal } = hunt(dt, dist));
    else if (revealNow) {
      if (!S.revealed) { S.revealed = true; anim.setState('reveal'); anim.snapHead(look, lookPitch * 0.6, 0.38); }
      state = 'reveal'; freeze = true;
    } else if (!info.flashlightOn && S.stage < 3 && !S.drawn && !S.guard) { S.revealed = false; state = 'frozen'; freeze = true; }   // drawn to a fire or waiting by the last body, it keeps moving in the dark
    else { S.revealed = false; ({ speed, state, goal } = stalk(dt, dist, st)); }
    S.frozen = freeze;

    // ── move, face, animate ──
    let m = { speed: 0, vx: 0, vz: 0, arrived: true };
    if (!freeze) {
      S.goal = goal;
      m = move.update(dt, S.pos, goal, speed);
      if (S.mode === 'retreat' && m.arrived && !S.hunt) { S.mode = 'lurk'; S.retarget = 0; }
      const want = m.speed > 0.3 && !(S.hunt && state === 'hunt' && dist < 6) ? Math.atan2(m.vx, m.vz) : Math.atan2(p.x - S.pos.x, p.z - S.pos.z);
      S.heading += wrap(want - S.heading) * (1 - Math.exp(-(state === 'scurry' ? 14 : 6) * dt));
      place();
    }
    anim.setState(state);
    anim.update(dt, { speed: m.speed, lookYaw: look, lookPitch });
    // the eyes catch the light only when the player is facing them
    const f = vis.los && vis.depth > 0 ? Math.max(0, Math.min(1, (vis.facing - 0.5) / 0.4)) : 0;
    model.mats.setEyeGlow(f ** 1.2 * (S.hunt ? 1 : 0.95));

    // ── sound and the environment ──
    const breathLvl = freeze ? 0 : S.hunt ? (S.hunt.phase === 3 || S.lunge >= 0 ? 1.7 : 0.9) : st.breath;
    audio.breath(dt, rel, dist, breathLvl, S.hunt ? 26 : 20);
    audio.bones(!freeze && m.speed > 0.35, rel, dist);
    if (!S.hunt) stageEffects(dt, st);
  }

  // ── imitation: far off, it holds a light the way you do, walks when you walk, turns when you turn ──
  function startMimic() {
    S.mimicIn = rand(MI.every);
    if (vis.visible || !S.info) return;
    for (let k = 0; k < 16; k++) {
      const rel = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35), d = rand(MI.dist), g = at(rel, d);
      if (!world.walkable(g.x, g.z, 0.5) || world.losBlocked(P().x, P().z, g.x, g.z)) continue;
      S.pos.set(g.x, 0, g.z); move.reset();
      S.mimic = { t: 0, dur: rand(MI.dur), off: (Math.random() - 0.5) * 0.3, lit: false };
      S.heading = S.yaw + Math.PI + S.mimic.off; place();
      return;
    }
  }
  function endMimic(edge) {
    if (!S.mimic) return;
    if (S.mimic.lit) audio.click(S.rel, vis.dist);
    S.mimic = null;
    if (mLight) { mLight.intensity = 0; mLens.visible = false; }
    S.mode = 'lurk'; S.retarget = 0;
    if (edge) { S.edgePeek = true; S.peekIn = 1.2; }           // next, the corner of your eye
  }
  function mimicStep(dt, dist) {
    const M = S.mimic, p = P(), info = S.info;
    M.t += dt;
    const lit = vis.flashLit && vis.central;
    if (lit || dist < MI.breakDist) { endMimic(false); setRetreat(true); return false; }       // caught in your beam: the light goes out and it is gone
    if (M.t >= M.dur) { endMimic(true); return false; }
    const dx = p.x - lastP.x, dz = p.z - lastP.z, stepLen = Math.hypot(dx, dz);
    if (stepLen > 0 && stepLen < 2) {
      const pos = { x: S.pos.x + dx, z: S.pos.z + dz };
      if (world.walkable(pos.x, pos.z, 0.4)) { S.pos.x = pos.x; S.pos.z = pos.z; }
    }
    const speed = stepLen / Math.max(dt, 1e-3);
    S.heading = S.yaw + Math.PI + M.off;                       // facing the way you face
    place();
    anim.setState('mimic');
    anim.update(dt, { speed: speed > 0.3 ? speed : 0, lookYaw: 0, lookPitch: 0 });
    model.mats.setEyeGlow(0);
    M.lit = !!info.flashlightOn;
    if (mLight) {
      mLight.intensity = M.lit ? 28 : 0; mLens.visible = M.lit;
      mLens.getWorldPosition(handPos);
      mLight.position.copy(handPos);
      const pitch = camera.rotation.x || 0;
      mLight.target.position.set(handPos.x + Math.sin(S.heading) * 10, handPos.y + Math.tan(pitch) * 10, handPos.z + Math.cos(S.heading) * 10);
    }
    audio.breath(dt, S.rel, dist, 0);
    audio.bones(false, S.rel, dist);
    return true;
  }
  // a body has caught fire somewhere: it heard, and it comes to look
  function alert(x, z) {
    if (!S.active) return;
    gain(AL.gain);
    audio.howl(relOf(S.pos.x, S.pos.z), Math.hypot(S.pos.x - P().x, S.pos.z - P().z));
    if (S.hunt) return;
    if (S.mimic) endMimic(false);
    S.drawn = { x, z, t: AL.watch, spot: null };
    if (S.attention >= 100) startHunt();
  }
  // the last body: it waits there. Moves in at once if you can't see it.
  function setGuard(spec) {
    if (!spec) { S.guard = null; return; }
    if (S.guard && S.guard.x === spec.x && S.guard.z === spec.z) return;
    S.guard = { x: spec.x, z: spec.z }; S.retarget = 0; S.goal = null;
    if (S.mimic) endMimic(false);
    if (!vis.visible && !S.hunt) {
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = rand(GU.ring), x = spec.x + Math.sin(a) * r, z = spec.z + Math.cos(a) * r;
        if (!world.walkable(x, z, 0.45)) continue;
        const pp = P();
        if (!world.losBlocked(pp.x, pp.z, x, z) && Math.hypot(x - pp.x, z - pp.z) < 30 && Math.abs(relOf(x, z)) < vis.halfH) continue;   // not in plain view
        S.pos.set(x, 0, z); move.reset(); place(); break;
      }
    }
  }

  function stalk(dt, dist, st) {
    S.modeT += dt;
    const info = S.info, p = P();
    // a fire was lit: it goes to the edge of the light and stands there, looking at you
    if (S.drawn) {
      S.drawn.t -= dt;
      if (S.drawn.t <= 0) { S.drawn = null; S.mode = 'lurk'; S.retarget = 0; }
      else {
        if (!S.drawn.spot) {
          const fx = S.drawn.x, fz = S.drawn.z, a = Math.atan2(S.pos.x - fx, S.pos.z - fz);
          for (let k = 0; k < 12 && !S.drawn.spot; k++) {
            const aa = a + (k ? (Math.random() - 0.5) * 2.4 : 0), x = fx + Math.sin(aa) * AL.standOff, z = fz + Math.cos(aa) * AL.standOff;
            if (world.walkable(x, z, 0.45)) S.drawn.spot = { x, z };
          }
          S.drawn.spot = S.drawn.spot || { x: S.pos.x, z: S.pos.z };
        }
        const g = S.drawn.spot, far = Math.hypot(g.x - S.pos.x, g.z - S.pos.z);
        S.mode = 'drawn';
        return far > 0.6 ? { speed: far > 10 ? SP.catchUp : SP.reposition, state: far > 10 ? 'scurry' : 'stalk', goal: g } : { speed: 0, state: 'idle', goal: g };
      }
    }
    // the last body: it stands by it. Your light is what gives you away; it does not run from it here.
    if (S.guard) {
      S.retarget -= dt;
      if (S.retarget <= 0 || !S.goal) {
        const gx = S.guard.x, gz = S.guard.z, a = Math.atan2(gx - p.x, gz - p.z);
        let g = null;
        for (let k = 0; k < 10 && !g; k++) {
          const aa = a + (Math.random() - 0.5) * (1.2 + k * 0.2), r = rand(GU.ring), x = gx + Math.sin(aa) * r, z = gz + Math.cos(aa) * r;
          if (world.walkable(x, z, 0.45)) g = { x, z };
        }
        S.goal = g || S.goal || { x: gx, z: gz }; S.retarget = 3 + Math.random() * 2;
      }
      S.mode = 'guard';
      const far = Math.hypot(S.goal.x - S.pos.x, S.goal.z - S.pos.z);
      if (far < 0.5 || (vis.visible && far < 3)) return { speed: 0, state: 'idle', goal: S.goal };
      return { speed: far > 12 ? SP.catchUp : SP.reposition, state: far > 12 ? 'scurry' : 'stalk', goal: S.goal };
    }
    if (S.mode === 'guard' || S.mode === 'drawn') { S.mode = 'lurk'; S.retarget = 0; }
    const staredAt = info.flashlightOn && vis.inView && vis.central && dist < 38;
    // stared at from stage 2 on, it no longer backs off: it stands and stares back
    if (staredAt && S.stage >= 2 && S.mode !== 'retreat') return { speed: 0, state: 'idle', goal: S.goal };
    if (S.mode !== 'retreat' && (staredAt || (vis.visible && dist < st.dist[0] * 0.55))) setRetreat();
    if (S.mode === 'retreat') {
      if (S.modeT > 3.2) { S.mode = 'lurk'; S.retarget = 0; }
      else return { speed: SP.retreat, state: 'scurry', goal: S.goal };
    }
    if (S.mode === 'peek') {
      if (S.peekHold <= 0) {
        const near = S.goal && Math.hypot(S.goal.x - S.pos.x, S.goal.z - S.pos.z) < 0.7;
        if (near || S.modeT > 7) S.peekHold = 2.4 + Math.random() * 1.8;
        else return { speed: SP.creep, state: 'stalk', goal: S.goal };
      }
      S.peekHold -= dt;
      if (S.peekHold > 0) return { speed: 0, state: 'idle', goal: S.goal };          // standing at the edge of the light, watching
      S.mode = 'lurk'; S.retarget = 0; S.peekIn = rand(st.peek);
    }
    // lurking: hold still while the player is looking its way, close in whenever they look elsewhere
    S.retarget -= dt;
    if (S.retarget <= 0 || !S.goal) {
      const k = 1 - OBSERVER.unseen.close * Math.min(1, S.unseenT / OBSERVER.unseen.time);   // look away and it comes in
      S.goal = pickSpot('lurk', Math.max(4.5, st.dist[0] * k), Math.max(6, st.dist[1] * k)) || S.goal;
      S.retarget = S.stage === 3 ? 0.6 + Math.random() * 0.6 : 1.4 + Math.random() * 1.4;
    }
    if (info.flashlightOn && !vis.visible) {
      S.peekIn -= dt;
      if (S.peekIn <= 0) {
        const g = S.edgePeek ? pickSpot('edge', 8, 11) : pickSpot('peek', st.dist[0], st.dist[1]);
        S.edgePeek = false;
        if (g) { S.mode = 'peek'; S.goal = g; S.modeT = 0; S.peekHold = 0; return { speed: SP.creep, state: 'stalk', goal: g }; }
        S.peekIn = 3;
      }
    }
    if (vis.inView) return vis.visible ? { speed: 0, state: 'idle', goal: S.goal } : { speed: SP.stalk, state: 'stalk', goal: S.goal };
    const far = dist > st.dist[1] + 12;
    const speed = far ? SP.catchUp : SP.reposition * (S.stage === 3 ? 1.35 : 1);
    return { speed, state: speed > 3 ? 'scurry' : 'stalk', goal: S.goal };
  }

  function hunt(dt, dist) {
    const h = S.hunt, p = P();
    hooks.flicker('hunt');
    if (S.lunge >= 0) {                                    // the lunge: nothing stops it now
      S.lunge += dt;
      if (S.lunge >= 0.42 && !S.captured) { S.captured = true; audio.capture(); hooks.capture(); }
      return { speed: 6.5, state: 'attack', goal: { x: p.x, z: p.z } };
    }
    h.t += dt; h.cd -= dt;
    if (h.t >= HU.duration) { endHunt(); return { speed: SP.retreat, state: 'scurry', goal: S.goal }; }
    if (h.phase === 1) {
      // Silence: it circles round to get behind the player, about twelve metres back, then comes.
      // It goes round the side rather than through the light, a quarter turn at a time.
      h.relocate -= dt;
      const curRel = S.rel, behind = Math.abs(curRel) > 2.3;
      if (h.relocate <= 0 || !S.goal) {
        const side = curRel >= 0 ? 1 : -1, next = behind ? Math.PI : Math.min(Math.PI, Math.abs(curRel) + 1.1) * side;
        const g = at(next, HU.startDist);
        S.goal = world.walkable(g.x, g.z, 0.45) ? g : pickSpot('behind', HU.startDist - 1, HU.startDist + 1) || S.goal || away(0);
        h.relocate = 0.4;
      }
      if ((h.t >= HU.silence && behind && Math.abs(dist - HU.startDist) < 3) || h.t >= HU.silence * 2) h.phase = 2;
      const speed = vis.inView ? HU.speed : SP.relocate;
      return { speed, state: speed > 4 ? 'scurry' : 'hunt', goal: S.goal };
    }
    if (dist <= HU.attackDist) { S.lunge = 0; return { speed: 6.5, state: 'attack', goal: { x: p.x, z: p.z } }; }
    if (dist < 4.5) h.phase = 3;                            // right behind: the breathing
    if (h.back > 0) { h.back -= dt; return { speed: 6, state: 'scurry', goal: away(3) }; }
    if (vis.inView && vis.central && h.cd <= 0 && dist > 2.6) { h.back = 0.45; h.cd = HU.retreatCooldown; }
    return { speed: HU.speed, state: 'hunt', goal: { x: p.x, z: p.z } };
  }

  function stageEffects(dt, st) {
    if (st.disturb) {
      S.disturbIn -= dt;
      if (S.disturbIn <= 0) {
        S.disturbIn = rand(st.disturb);
        const rel = (Math.random() - 0.5) * Math.PI * 2, d = 8 + Math.random() * 12;
        if (!hooks.disturb(rel, d)) {
          const r = Math.random(), cave = world.kind === 'cave' || world.kind === 'hell';
          if (cave) (r < 0.5 ? audio.rocks : audio.knock)(rel, d);
          else (r < 0.45 ? audio.snap : r < 0.75 ? audio.creak : audio.whisper)(rel, d);
          if (Math.random() < 0.35) hooks.flicker('dip');
        }
      }
    }
    if (st.flicker) { S.flickerIn -= dt; if (S.flickerIn <= 0) { S.flickerIn = rand(st.flicker); hooks.flicker('warn'); } }
    if (st.phantom) {
      if (!S.phantom) { S.phantomIn -= dt; if (S.phantomIn <= 0) { S.phantomIn = rand(st.phantom); S.phantom = { n: 3 + (Math.random() * 3 | 0), t: 0, rel: Math.PI + (Math.random() - 0.5) * 2, d: 4 + Math.random() * 3 }; } }
      else {
        S.phantom.t -= dt;
        if (S.phantom.t <= 0) {                             // footsteps right nearby, from wherever
          audio.step(S.phantom.rel, S.phantom.d, 0.8, 1); S.phantom.t = 0.45 + Math.random() * 0.35; S.phantom.d -= 0.3;
          if (--S.phantom.n <= 0) S.phantom = null;
        }
      }
    }
  }

  // A gunshot along dir. It cannot be killed: a hit only raises its attention and drives it off for a moment.
  function shot(origin, dir) {
    if (!S.active) return false;
    const gy = world.groundY(S.pos.x, S.pos.z);
    let hit = false;
    for (const h of [0.45, 0.9, 1.35, 1.8, 2.25, 2.45]) {
      const cx = S.pos.x - origin.x, cy = gy + h - origin.y, cz = S.pos.z - origin.z, t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t <= 0 || t > 60) continue;
      const mx = cx - dir.x * t, my = cy - dir.y * t, mz = cz - dir.z * t;
      if (mx * mx + my * my + mz * mz < 0.36 * 0.36) { hit = true; break; }
    }
    if (hit && world.losBlocked(origin.x, origin.z, S.pos.x, S.pos.z)) hit = false;
    const dist = Math.hypot(S.pos.x - origin.x, S.pos.z - origin.z);
    if (hit) gain(A.shot);
    if (S.hunt) { if (hit && S.lunge < 0) { S.hunt.back = 0.6; S.hunt.cd = 1.5; } }
    else if (dist < 40 && !S.frozen) setRetreat();
    if (S.attention >= 100 && !S.hunt) startHunt();
    return hit;
  }

  return {
    model, audio, spawn, update, shot, alert, setGuard,
    get mimicking() { return !!S.mimic; },
    get mode() { return S.mode; },
    get active() { return S.active; },
    get hunting() { return !!S.hunt; },
    get position() { return S.pos; },
    silence() { audio.stop(); },
    despawn() { S.active = false; S.hunt = null; S.mimic = null; S.guard = null; S.drawn = null; model.root.visible = false; audio.stop(); if (mLight) { mLight.intensity = 0; mLens.visible = false; } },
    dispose() { scene.remove(model.root); model.dispose(); },
    debug: () => ({ attention: +S.attention.toFixed(1), stage: S.stage, mode: S.mimic ? 'mimic' : S.mode, stare: +S.stare.toFixed(2), unseenT: +S.unseenT.toFixed(1), guard: !!S.guard, drawn: !!S.drawn, state: anim.state, hunt: S.hunt && { ...S.hunt }, lunge: S.lunge,
      frozen: S.frozen, revealed: S.revealed, pos: [+S.pos.x.toFixed(2), +S.pos.z.toFixed(2)], dist: +vis.dist.toFixed(2), rel: +S.rel.toFixed(2),
      inView: vis.inView, central: vis.central, visible: vis.visible, flashLit: vis.flashLit, matchLit: vis.matchLit, los: vis.los, facing: +vis.facing.toFixed(2) }),
    S, vis, anim,
  };
}
