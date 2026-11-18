import * as THREE from 'three';

// Three dead bodies per round, built from boxes in the same blocky style as everything else.
// Poses: 'hang' (from a branch or the cave ceiling), 'ground' (on its back), 'lean' (slumped against a trunk or wall).
const BOX = new THREE.BoxGeometry(1, 1, 1);
const STAIN = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
const JACKETS = [0x4a5c3c, 0x6a4c36, 0x3c4660, 0x67635c, 0x7a3a34, 0x8a7a52];
const PANTS = [0x3a3836, 0x46506a, 0x58462e, 0x2e3a2e];
const SKIN = [0xb3b9b2, 0xa8a99c, 0xbdb4a5, 0x9ea6a6];

function part(parent, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(BOX, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
}
function group(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export function buildCorpse(rng) {
  const pick = (a) => a[(rng() * a.length) | 0];
  const lam = (hex, gain = 1.25) => { const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); m.color.multiplyScalar(gain); m.userData.base = m.color.clone(); return m; };
  const mats = { jacket: lam(pick(JACKETS)), pants: lam(pick(PANTS)), skin: lam(pick(SKIN)), dark: lam(0x231d18, 1) };
  const root = new THREE.Group(), j = {};
  j.hips = group(root, 0, 0, 0);
  part(j.hips, mats.pants, 0.34, 0.16, 0.2, 0, 0, 0);
  j.torso = group(j.hips, 0, 0.06, 0);
  part(j.torso, mats.jacket, 0.38, 0.52, 0.22, 0, 0.28, 0);
  j.head = group(j.torso, 0, 0.56, 0);
  part(j.head, mats.skin, 0.08, 0.06, 0.08, 0, 0.02, 0);
  part(j.head, mats.skin, 0.2, 0.24, 0.22, 0, 0.16, 0.01);
  part(j.head, mats.dark, 0.21, 0.08, 0.23, 0, 0.27, -0.01);
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = j['sh' + side] = group(j.torso, s * 0.24, 0.5, 0);
    part(sh, mats.jacket, 0.1, 0.3, 0.11, 0, -0.15, 0);
    const el = j['el' + side] = group(sh, 0, -0.3, 0);
    part(el, mats.jacket, 0.09, 0.27, 0.095, 0, -0.135, 0);
    part(el, mats.skin, 0.08, 0.11, 0.045, 0, -0.32, 0);
    const hip = j['hip' + side] = group(j.hips, s * 0.1, -0.04, 0);
    part(hip, mats.pants, 0.14, 0.44, 0.15, 0, -0.22, 0);
    const kn = j['kn' + side] = group(hip, 0, -0.44, 0);
    part(kn, mats.pants, 0.12, 0.42, 0.125, 0, -0.21, 0);
    part(kn, mats.dark, 0.115, 0.08, 0.25, 0, -0.44, 0.055);
  }
  return { root, j, mats };
}
const R = (g, x, y, z) => g.rotation.set(x, y, z);

// spec: { kind, x, z, y (ground height), facing (radians), anchorY (hang) }
export function poseCorpse(c, spec, rng) {
  const { root, j } = c, kind = spec.kind;
  root.position.set(spec.x, spec.y, spec.z);
  root.rotation.set(0, spec.facing, 0);
  if (kind === 'hang') {
    const hipY = Math.min(1.62 + rng() * 0.22, spec.anchorY - 0.95);     // feet well clear of the ground
    j.hips.position.y = hipY;
    R(j.head, 0.35, 0.2, 0.62);                            // the neck is broken
    R(j.shL, 0.05, 0, 0.07); R(j.shR, -0.04, 0, -0.06); R(j.elL, -0.08, 0, 0); R(j.elR, -0.12, 0, 0);
    R(j.hipL, 0.02, 0, 0.02); R(j.hipR, -0.04, 0, -0.03); R(j.knL, 0.1, 0, 0); R(j.knR, 0.05, 0, 0);
    const neckY = hipY + 0.62, len = Math.max(0.3, spec.anchorY - neckY);
    const rope = new THREE.Mesh(BOX, c.mats.dark); rope.scale.set(0.035, len, 0.035); rope.position.set(0, neckY + len / 2, 0.02);
    root.add(rope); c.rope = rope;
    const knot = new THREE.Mesh(BOX, c.mats.dark); knot.scale.set(0.12, 0.05, 0.14); knot.position.set(0, neckY + 0.02, 0.02); root.add(knot);
  } else if (kind === 'ground') {
    j.hips.position.y = 0.11;
    j.hips.rotation.x = -Math.PI / 2;                      // on its back, staring up
    R(j.head, 0, 0.9, 0.15);
    R(j.shL, 0, 0, 1.3); R(j.elL, -0.3, 0, 0); R(j.shR, -0.3, 0, -0.35); R(j.elR, -1.2, 0, 0);
    R(j.hipL, 0, 0, 0.16); R(j.knL, 0.05, 0, 0); R(j.hipR, -0.65, 0, -0.1); R(j.knR, 0.95, 0, 0);
  } else {                                                  // lean: sat against something, slumped
    j.hips.position.y = 0.1;
    R(j.torso, -0.32, 0, 0.08);
    R(j.head, 0.75, 0.15, 0.32);
    R(j.shL, -0.28, 0, 0.22); R(j.elL, -0.35, 0, 0); R(j.shR, -0.2, 0, -0.18); R(j.elR, -0.5, 0, 0);
    R(j.hipL, -1.5, 0, 0.1); R(j.knL, 0.15, 0, 0); R(j.hipR, -1.05, 0, -0.08); R(j.knR, 1.15, 0, 0);
  }
  if (kind !== 'hang') {
    const stain = new THREE.Mesh(STAIN, new THREE.MeshLambertMaterial({ color: 0x3a0d0b }));
    stain.scale.setScalar(0.55 + rng() * 0.3); stain.position.set(0, 0.012, kind === 'lean' ? 0.35 : 0); root.add(stain);
    c.stain = stain;
  }
  c.spec = spec;
}

// Where to put them. world: { grid, kind, ceiling, roofY, groundY, walkable(x, z, r), trees(x, z, radius) -> [[x, z, h, r]], cellWalkable(i, j), solidCell(i, j) }
// Three rings out from the player, spread round the compass, each body a different pose where the map allows.
export function placeBodies(world, center, rng, count = 3) {
  const kinds = ['hang', 'ground', 'lean'].sort(() => rng() - 0.5);
  const rings = [[20, 42], [38, 64], [55, 85]];
  const a0 = rng() * Math.PI * 2, out = [], spread = count <= 3 ? 2.1 : 2.4;   // more bodies: golden-angle spacing so they fan out all round
  const reach = world.grid ? reachable(world, center) : null;
  for (let k = 0; k < count; k++) {
    const kind0 = kinds[k % 3], ring = rings[k % 3];
    const order = [kind0, ...kinds.filter((x) => x !== kind0), 'ground'];
    let spec = null;
    for (const kind of order) {
      for (let tries = 0; tries < 70 && !spec; tries++) {
        const a = a0 + k * spread + (rng() - 0.5) * 1.5, d = ring[0] + rng() * (ring[1] - ring[0]);
        const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
        spec = world.grid ? onGrid(world, reach, kind, x, z, rng) : outdoors(world, kind, x, z, rng);
        if (spec && out.some((o) => Math.hypot(o.x - spec.x, o.z - spec.z) < (tries < 50 ? 18 : 10))) spec = null;
      }
      if (spec) break;
    }
    if (spec) { spec.y = world.groundY(spec.x, spec.z); out.push(spec); }
  }
  return out;
}
function outdoors(world, kind, x, z, rng) {
  if (kind === 'ground') return world.walkable(x, z, 0.9) ? { kind, x, z, facing: rng() * 6.28 } : null;
  const trees = world.trees(x, z, 10);
  if (!trees.length) return null;
  const [tx, tz, th, tr] = trees[(rng() * trees.length) | 0];
  for (let n = 0; n < 8; n++) {
    const a = rng() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    if (kind === 'hang') {
      const bx = tx + dx * (tr + 0.75), bz = tz + dz * (tr + 0.75);
      if (world.walkable(bx, bz, 0.35)) return { kind, x: bx, z: bz, facing: rng() * 6.28, anchorY: Math.min(3.5, Math.max(3.0, th * 0.45)) };
    } else {
      const bx = tx + dx * (tr + 0.28), bz = tz + dz * (tr + 0.28);
      if (world.walkable(tx + dx * (tr + 1.0), tz + dz * (tr + 1.0), 0.35)) return { kind, x: bx, z: bz, facing: Math.atan2(dx, dz) };
    }
  }
  return null;
}
function reachable(world, center) {                        // cells you can walk to from where the round starts
  const G = world.grid, si = G.cellOf(center.x), sj = G.cellOf(center.z), seen = new Set([si + ',' + sj]), q = [[si, sj]];
  for (let h = 0; h < q.length && q.length < 6000; h++) {
    const [i, j] = q[h];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, k = a + ',' + b;
      if (seen.has(k) || Math.abs(a - si) > 30 || Math.abs(b - sj) > 30 || !world.cellWalkable(a, b)) continue;
      if (world.canStep && !world.canStep(i, j, a, b)) continue;
      seen.add(k); q.push([a, b]);
    }
  }
  return seen;
}
function onGrid(world, reach, kind, x, z, rng) {
  const G = world.grid, i = G.cellOf(x), j = G.cellOf(z);
  for (let r = 0; r <= 2; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di, b = j + dj;
    if (!reach.has(a + ',' + b)) continue;
    const cx = a * G.CELL, cz = b * G.CELL;
    if (kind === 'hang') {
      if (world.ceiling) {
        const x = cx + (rng() - 0.5) * 1.2, z = cz + (rng() - 0.5) * 1.2;
        if (world.roofY && !world.walkable(x, z, 0.35)) continue;
        const anchorY = world.roofY ? world.roofY(x, z) - world.groundY(x, z) : world.ceiling;
        return { kind, x, z, facing: rng() * 6.28, anchorY };
      }
      const trees = world.trees(cx, cz, 2.5);            // hell has no ceiling, only the burnt trees
      if (trees.length) { const [tx, tz, th, tr] = trees[0]; return { kind, x: tx + tr + 0.75, z: tz, facing: rng() * 6.28, anchorY: Math.max(2.9, Math.min(3.3, th * 0.65)) }; }
      return null;
    }
    if (kind === 'lean') {
      for (const [ni, nj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!world.solidCell(a + ni, b + nj)) continue;
        return { kind, x: cx + ni * (G.CELL / 2 - 0.3), z: cz + nj * (G.CELL / 2 - 0.3), facing: Math.atan2(-ni, -nj) };
      }
      continue;
    }
    return { kind, x: cx + (rng() - 0.5) * 1.6, z: cz + (rng() - 0.5) * 1.6, facing: rng() * 6.28 };
  }
  return null;
}

// Burning: flames climb the body for a few seconds while it chars black, then embers.
const CHAR = new THREE.Color(0x120d0a), EMBER = new THREE.Color(0xff5a14);
const tmp = new THREE.Vector3();
export function burnStep(c, t, glowAdd, lightPush, fireCells, smallCells, clock) {
  const k = Math.min(1, t / 0.7), fade = t < 6 ? 1 : Math.max(0, 1 - (t - 6) / 2.5);
  const charK = Math.min(1, t / 4), ember = t < 2 ? t / 2 : Math.max(0, 1 - (t - 9) / 12);
  for (const m of Object.values(c.mats)) {
    m.color.copy(m.userData.base).lerp(CHAR, charK);
    m.emissive.copy(EMBER).multiplyScalar(ember * 0.22 * (0.75 + 0.25 * Math.sin(clock * 9 + m.id)));
  }
  const pts = [c.j.torso, c.j.head, c.j.knL, c.j.knR, c.j.hips];
  pts.forEach((g, n) => {
    g.getWorldPosition(tmp);
    const base = c.spec.kind === 'hang' ? tmp.y - 0.35 : c.spec.y;
    if (fade > 0) {
      const h = (c.spec.kind === 'hang' ? 0.9 : 1.1 + 0.4 * Math.sin(clock * 7 + n)) * k * fade, list = fireCells;
      glowAdd(tmp.x, base, tmp.z, 0.7 * k * fade + 0.2, h, list[(Math.floor(clock * 11) + n) % list.length], 0.03);
    } else if (ember > 0.05 && n < 3) glowAdd(tmp.x, c.spec.y, tmp.z, 0.3, 0.25, smallCells[(Math.floor(clock * 6) + n) % smallCells.length], 0);
  });
  c.j.hips.getWorldPosition(tmp);
  if (fade > 0) lightPush(tmp.x, tmp.y + 0.7, tmp.z, 1.6 * k * fade, 0);
  else if (ember > 0.05) lightPush(tmp.x, c.spec.y + 0.3, tmp.z, 0.35 * ember, 0);
}
