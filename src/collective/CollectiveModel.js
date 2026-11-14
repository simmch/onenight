import * as THREE from 'three';

// The Collective: small, pale figures in nightgowns, built from boxes like the rest of the game's people.
// All thirty share one box geometry and a handful of materials. Each faces +Z; its left is +X.
const BOX = new THREE.BoxGeometry(1, 1, 1);

export function createCollectiveMaterials() {
  const lam = (hex, gain = 1.45) => { const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); m.color.multiplyScalar(gain); return m; };
  return {
    gowns: [lam(0xd9d5c9), lam(0xbcc0c3), lam(0xaab5c4), lam(0xcab4b5), lam(0x9d998c), lam(0xc8c3a8)],
    skin: lam(0xc3c9c6, 1.45),
    hair: [lam(0x171310, 1), lam(0x34261b, 1), lam(0x0d0c0c, 1)],
    eyes: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    dispose() { for (const m of [...this.gowns, this.skin, ...this.hair, this.eyes]) m.dispose(); },
  };
}

const part = (parent, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(BOX, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
export const HIP = 0.55;

export function buildChild(M, rng) {
  const gown = M.gowns[(rng() * M.gowns.length) | 0], hair = M.hair[(rng() * M.hair.length) | 0];
  const root = new THREE.Group(), j = {};
  j.hips = grp(root, 0, HIP, 0);
  part(j.hips, gown, 0.3, 0.32, 0.22, 0, -0.12, 0);                  // skirt, to the knee
  j.torso = grp(j.hips, 0, 0.02, 0);
  part(j.torso, gown, 0.25, 0.38, 0.16, 0, 0.19, 0);
  j.head = grp(j.torso, 0, 0.4, 0);
  part(j.head, M.skin, 0.06, 0.05, 0.06, 0, 0.02, 0);
  part(j.head, M.skin, 0.2, 0.22, 0.19, 0, 0.15, 0.01);
  part(j.head, hair, 0.22, 0.07, 0.22, 0, 0.27, -0.005);
  part(j.head, hair, 0.22, 0.36, 0.07, 0, 0.1, -0.09);                // long hair down the back
  part(j.head, hair, 0.2, 0.09, 0.03, 0, 0.22, 0.105);                // fringe over the eyes
  part(j.head, hair, 0.04, 0.26, 0.17, 0.11, 0.12, 0.01); part(j.head, hair, 0.04, 0.26, 0.17, -0.11, 0.12, 0.01);
  part(j.head, M.eyes, 0.04, 0.035, 0.01, 0.045, 0.15, 0.106); part(j.head, M.eyes, 0.04, 0.035, 0.01, -0.045, 0.15, 0.106);
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const sh = j['sh' + S] = grp(j.torso, s * 0.15, 0.36, 0);
    part(sh, gown, 0.08, 0.2, 0.08, 0, -0.1, 0);
    const el = j['el' + S] = grp(sh, 0, -0.2, 0);
    part(el, M.skin, 0.055, 0.2, 0.055, 0, -0.1, 0);
    part(el, M.skin, 0.06, 0.07, 0.03, 0, -0.23, 0);
    const hp = j['hip' + S] = grp(j.hips, s * 0.07, -0.02, 0);
    part(hp, M.skin, 0.075, 0.27, 0.075, 0, -0.135, 0);
    const kn = j['kn' + S] = grp(hp, 0, -0.27, 0);
    part(kn, M.skin, 0.065, 0.26, 0.065, 0, -0.13, 0);
    part(kn, M.skin, 0.07, 0.035, 0.13, 0, -0.27, 0.03);             // bare feet
  }
  root.scale.setScalar(0.92 + rng() * 0.3);
  return { root, j, tilt: (rng() - 0.5) * 0.6, sway: rng() * 6.28 };
}

// Poses are set outright every frame; t is a gait phase in radians, k the clock.
const R = (g, x, y, z) => g.rotation.set(x, y, z);
export function poseChild(c, state, t, k, extra = {}) {
  const { j } = c;
  let hipY = HIP;
  R(j.hips, 0, 0, 0); R(j.torso, 0, 0, 0);
  if (state === 'idle' || state === 'watch') {
    const s = Math.sin(k * 0.7 + c.sway);
    R(j.torso, 0.04, 0, 0.03 * s);
    R(j.head, 0.12, 0, c.tilt + 0.05 * Math.sin(k * 0.4 + c.sway));    // the head held to one side
    R(j.shL, 0, 0, 0.05); R(j.shR, 0, 0, -0.05); R(j.elL, -0.05, 0, 0); R(j.elR, -0.05, 0, 0);
    R(j.hipL, 0, 0, 0.02); R(j.hipR, 0, 0, -0.02); R(j.knL, 0, 0, 0); R(j.knR, 0, 0, 0);
    if (state === 'watch') R(j.head, 0.05, 0, 0);                      // the last one: straight, still, looking
  } else if (state === 'walk' || state === 'run') {
    const run = state === 'run', a = run ? 0.85 : 0.4;
    R(j.torso, run ? 0.32 : 0.05, 0, 0);
    R(j.head, run ? -0.2 : 0.08, 0, c.tilt * 0.4);
    R(j.hipL, -a * Math.sin(t), 0, 0.02); R(j.hipR, a * Math.sin(t), 0, -0.02);
    R(j.knL, (run ? 1.1 : 0.45) * Math.max(0, Math.sin(t + 1.3)), 0, 0); R(j.knR, (run ? 1.1 : 0.45) * Math.max(0, Math.sin(t + Math.PI + 1.3)), 0, 0);
    R(j.shL, a * 0.9 * Math.sin(t), 0, 0.08); R(j.shR, -a * 0.9 * Math.sin(t), 0, -0.08);
    R(j.elL, run ? -1.1 : -0.15, 0, 0); R(j.elR, run ? -1.1 : -0.15, 0, 0);
    hipY -= (run ? 0.04 : 0.015) * Math.abs(Math.cos(t));
  } else if (state === 'crawl') {
    // on all fours, low and fast, head craned up to keep looking at you
    hipY = 0.3;
    R(j.hips, 1.25, 0, 0.05 * Math.sin(t));
    R(j.head, -1.05, 0, 0.15 * Math.sin(t * 0.5));
    R(j.shL, -1.35 + 0.45 * Math.sin(t), 0, 0.15); R(j.shR, -1.35 - 0.45 * Math.sin(t), 0, -0.15);
    R(j.elL, -0.15, 0, 0); R(j.elR, -0.15, 0, 0);
    R(j.hipL, -0.2 - 0.45 * Math.sin(t + 0.4), 0, 0.12); R(j.hipR, -0.2 + 0.45 * Math.sin(t + 0.4), 0, -0.12);
    R(j.knL, 1.6, 0, 0); R(j.knR, 1.6, 0, 0);
  } else if (state === 'still') {
    R(j.head, 0, 0, 0); R(j.shL, 0, 0, 0); R(j.shR, 0, 0, 0); R(j.elL, 0, 0, 0); R(j.elR, 0, 0, 0);
    R(j.hipL, 0, 0, 0); R(j.hipR, 0, 0, 0); R(j.knL, 0, 0, 0); R(j.knR, 0, 0, 0);
  } else if (state === 'lunge') {
    const a = Math.min(1, (extra.a ?? 1));
    R(j.torso, 0.5 * a, 0, 0);
    R(j.head, -0.3, 0, 0.8 * a);
    R(j.shL, -1.7 * a, 0, 0.25); R(j.shR, -1.7 * a, 0, -0.25); R(j.elL, -0.1, 0, 0); R(j.elR, -0.1, 0, 0);
    R(j.hipL, -0.6 * a, 0, 0); R(j.hipR, 0.3 * a, 0, 0); R(j.knL, 0.5, 0, 0); R(j.knR, 0.8, 0, 0);
    hipY -= 0.08 * a;
  }
  j.hips.position.y = hipY;
}
