// The Slime: a blue thing with two black eyes that rolls after the player, eats whatever it rolls over
// and grows on it. Nothing the player carries can kill it. Water can: lead it into the lake and it comes apart.
// It sheds small slimes that are faster than it is; those cling to the player's legs and slow them, and they can be shot.
import * as THREE from 'three';
import { ObserverMovement } from '../observer/ObserverMovement.js';

export const SLIME = {
  startR: 1.4, maxR: 14, grow: 0.028,            // metres of radius, and metres gained per second on its own
  speed: 2.9, speedPerR: 0.06, speedMax: 3.7,    // always under the player's run (4.8), always over their walk (2.6)
  touch: 42,                                     // health per second while it is on top of you
  goneR: 0.6,                                    // smaller than this in water and it is gone
  shakeR: 3,                                     // from this size up the ground shakes under it
  little: { r: 0.36, speed: 5.3, max: 6, slow: 2.6, bite: 3, hitR: 0.6 },
};

export function createSlimeRound({ scene, world, hooks }) {
  const S = { active: false, gone: false, x: 0, z: 0, r: SLIME.startR, stun: 0, wet: false, phase: 0, shed: 0, biteX: 0, biteZ: 0, told: false, maxLittle: 4, growK: 1 };
  const littles = [];
  const corridor = !!world.grid, mover = corridor ? new ObserverMovement(world, 0.44) : null;
  const maxRadius = corridor ? 2.65 : SLIME.maxR;
  const bodyGeo = new THREE.IcosahedronGeometry(1, 2), eyeGeo = new THREE.SphereGeometry(1, 10, 8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a7bff, emissive: 0x0c3590, flatShading: true, transparent: true, opacity: 0.93 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const axis = new THREE.Vector3();

  function build() {
    const root = new THREE.Group(), body = new THREE.Mesh(bodyGeo, bodyMat), face = new THREE.Group();
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.17, 0.21, 0.1); eye.position.set(side * 0.33, 0.3, 0.88); eye.lookAt(side * 0.66, 0.6, 1.76);
      face.add(eye);
    }
    root.add(body, face); root.visible = false; scene.add(root);
    return { root, body, face };
  }
  const big = build();

  function place(m, x, z, r, squash, px, pz) {
    const sy = 0.84 * (1 + squash), sxz = 1 - squash * 0.5;
    m.root.scale.set(r * sxz, r * sy, r * sxz);
    m.root.position.set(x, world.groundY(x, z) + r * sy * 0.94, z);
    m.face.rotation.y = Math.atan2(px - x, pz - z);
  }
  function roll(m, dx, dz, r) {
    const d = Math.hypot(dx, dz); if (d < 1e-5) return;
    axis.set(dz / d, 0, -dx / d); m.body.rotateOnWorldAxis(axis, d / r);
  }

  function addLittle(x, z) {
    const m = build(); m.root.visible = true;
    littles.push({ x, z, m, phase: Math.random() * 6, pop: -1, mover: corridor ? new ObserverMovement(world, 0.20) : null });
  }
  function popLittle(l) { if (l.pop < 0) { l.pop = 0; hooks.pop && hooks.pop(l.x, l.z); } }
  function dropLittle(i) { scene.remove(littles[i].m.root); littles.splice(i, 1); }

  function spawnNear(x, z, heading, distance, clearance) {
    for (let i = 0; i < 64; i++) {
      const a = heading + i * 2.399, d = Math.max(3, distance - Math.floor(i / 8) * 2.4);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (world.walkable(px, pz, clearance)) return { x: px, z: pz };
    }
    return { x, z };
  }

  function start({ round = 1, x, z, awayX = 0, awayZ = 1 }) {
    stop();
    const k = Math.min(round, 12);
    S.active = true; S.gone = false; S.r = Math.min(maxRadius, SLIME.startR + k * 0.12); S.growK = 1 + k * 0.05; S.maxLittle = Math.min(SLIME.little.max, 3 + Math.floor(k / 3));
    S.stun = 0; S.wet = false; S.shed = 5; S.phase = 0; S.told = false;
    const a = Math.atan2(awayZ, awayX) + (Math.random() - 0.5) * 1.6;      // it starts behind you, on the side away from the water
    const p = corridor ? spawnNear(x, z, a, 26, 0.5) : { x: x + Math.cos(a) * 26, z: z + Math.sin(a) * 26 };
    S.x = S.biteX = p.x; S.z = S.biteZ = p.z;
    mover?.reset();
    big.root.visible = true; place(big, S.x, S.z, S.r, 0, x, z);
    for (let i = 0; i < 2; i++) {
      const b = Math.random() * 6.283;
      const spawn = corridor ? spawnNear(x, z, b, 20, 0.25) : { x: x + Math.cos(b) * 20, z: z + Math.sin(b) * 20 };
      addLittle(spawn.x, spawn.z);
    }
  }
  function stop() {
    S.active = false; big.root.visible = false;
    while (littles.length) dropLittle(0);
    hooks.rumble && hooks.rumble(0);
  }

  function update(dt, p) {
    if (!S.active) return;
    if (!p.inControl) { hooks.rumble && hooks.rumble(0); return; }
    // ── the big one ──
    let dx = p.x - S.x, dz = p.z - S.z, dist = Math.hypot(dx, dz) || 1e-6;
    S.stun = Math.max(0, S.stun - dt);
    S.wet = hooks.inWater(S.x, S.z);
    const speed = Math.min(SLIME.speedMax, SLIME.speed + S.r * SLIME.speedPerR) * (S.stun > 0 ? 0.4 : 1) * (S.wet ? 0.6 : 1);
    const reach = S.r * 0.86 + 0.3;
    if (dist > reach * 0.6) {
      const ox = S.x, oz = S.z;
      if (mover) mover.update(dt, S, p, speed);
      else {
        const step = Math.min(speed * dt, dist);
        S.x += dx / dist * step; S.z += dz / dist * step;
      }
      roll(big, S.x - ox, S.z - oz, S.r);
      dx = p.x - S.x; dz = p.z - S.z; dist = Math.hypot(dx, dz) || 1e-6;
    }
    if (dist < reach && (!corridor || !world.losBlocked(p.x, p.z, S.x, S.z) && Math.abs(world.groundY(p.x, p.z) - world.groundY(S.x, S.z)) < 1.4)) hooks.damage(SLIME.touch * dt, 'slime');
    S.wet = hooks.inWater(S.x, S.z);
    if (S.wet) {                                            // water takes it apart, the faster the more of it there is
      S.r -= (0.8 + S.r * 0.24) * dt;
      hooks.fizz && hooks.fizz(S.x, S.z, S.r, dt);
      if (S.r < SLIME.goneR) { S.gone = true; const x = S.x, z = S.z; stop(); hooks.dissolved(x, z); return; }
    } else {
      S.r = Math.min(maxRadius, S.r + SLIME.grow * S.growK * dt);
      if (Math.hypot(S.x - S.biteX, S.z - S.biteZ) > Math.max(0.8, S.r * 0.4)) {   // a bite out of the world, and what was in it
        S.biteX = S.x; S.biteZ = S.z;
        S.r = Math.min(maxRadius, S.r + hooks.eat(S.x, S.z, S.r * 0.95));
      }
    }
    // it bounces as it rolls; every landing is heard, and felt once it is big enough
    const before = S.phase;
    S.phase += dt * 6.283 / (0.5 + S.r * 0.07);
    if (Math.floor(before / 6.283) !== Math.floor(S.phase / 6.283)) hooks.stomp(S.x, S.z, S.r, dist);
    place(big, S.x, S.z, S.r, Math.sin(S.phase) * 0.1, p.x, p.z);
    if (hooks.rumble) hooks.rumble(S.r > SLIME.shakeR ? Math.max(0, 1 - dist / (16 + S.r * 3.2)) * Math.min(1, 0.3 + (S.r - SLIME.shakeR) / 8) : 0);
    // ── the small ones ──
    S.shed -= dt;
    if (S.shed <= 0 && littles.length < S.maxLittle && !S.wet) {
      S.shed = 4 + Math.random() * 4;
      const x = S.x + dx / dist * S.r, z = S.z + dz / dist * S.r;
      if (!corridor || world.walkable(x, z, 0.25)) addLittle(x, z);
      else addLittle(S.x, S.z);
    }
    const L = SLIME.little;
    for (let i = littles.length - 1; i >= 0; i--) {
      const l = littles[i];
      if (l.pop >= 0) {
        l.pop += dt; const k = Math.max(0, 1 - l.pop / 0.22);
        l.m.root.scale.set(L.r * (2 - k), L.r * k * 0.5, L.r * (2 - k));
        if (k <= 0) dropLittle(i);
        continue;
      }
      const ex = p.x - l.x, ez = p.z - l.z, d = Math.hypot(ex, ez) || 1e-6;
      if (d > 70) { dropLittle(i); continue; }
      l.phase += dt * 9;
      const hop = Math.max(0, Math.sin(l.phase)), speed = L.speed * (0.35 + hop * 1.05);
      const ox = l.x, oz = l.z;
      if (l.mover) l.mover.update(dt, l, p, speed);
      else { l.x += ex / d * speed * dt; l.z += ez / d * speed * dt; }
      roll(l.m, l.x - ox, l.z - oz, L.r);
      if (hooks.inWater(l.x, l.z)) { popLittle(l); continue; }
      if (d < 0.75 && (!corridor || !world.losBlocked(p.x, p.z, l.x, l.z))) { hooks.cling(L.slow); hooks.damage(L.bite, 'slime'); popLittle(l); continue; }
      place(l.m, l.x, l.z, L.r, hop * 0.25 - 0.1, p.x, p.z);
      l.m.root.position.y += hop * 0.45;
    }
  }

  // A shot or a swing along a ray. Small ones die to it. The big one only flinches.
  function shot(origin, dir, { range = 45, melee = false } = {}) {
    if (!S.active) return false;
    const L = SLIME.little;
    let best = null, bestT = Infinity;
    const along = (cx, cy, cz, rad) => {
      const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z, t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > range + rad || world.losBlocked?.(origin.x, origin.z, cx, cz)) return -1;
      const px = ox - dir.x * t, py = oy - dir.y * t, pz = oz - dir.z * t;
      return px * px + py * py + pz * pz < rad * rad ? t : -1;
    };
    for (const l of littles) {
      if (l.pop >= 0) continue;
      const t = along(l.x, l.m.root.position.y, l.z, melee ? L.hitR + 0.35 : L.hitR);
      if (t >= 0 && t < bestT) { bestT = t; best = l; }
    }
    const tb = along(S.x, big.root.position.y, S.z, S.r);
    if (best && (tb < 0 || bestT < tb + S.r)) { popLittle(best); return true; }
    if (tb >= 0) {
      S.stun = Math.max(S.stun, 0.55);
      if (!S.told) { S.told = true; hooks.say('It closes over the wound. Bullets only slow it. It needs water.'); }
      return true;
    }
    return false;
  }
  // An explosion: every small one in it is gone, and the big one loses a piece of itself.
  function blast(x, z, R) {
    if (!S.active) return;
    for (const l of littles) if (Math.hypot(l.x - x, l.z - z) < R && !world.losBlocked?.(x, z, l.x, l.z)) popLittle(l);
    if (Math.hypot(S.x - x, S.z - z) < R + S.r && !world.losBlocked?.(x, z, S.x, S.z)) { S.r = Math.max(1, S.r * 0.85); S.stun = Math.max(S.stun, 1.5); }
  }

  return {
    start, stop, update, shot, blast, S, littles,
    get active() { return S.active; }, get gone() { return S.gone; },
    get x() { return S.x; }, get z() { return S.z; }, get r() { return S.r; },
    get small() { let n = 0; for (const l of littles) if (l.pop < 0) n++; return n; },
    speedNow: () => Math.min(SLIME.speedMax, SLIME.speed + S.r * SLIME.speedPerR),
  };
}
