import * as THREE from 'three';
import { DIMS, buildSkeleton } from './ObserverSkeleton.js';
import { createObserverMaterials } from './ObserverMaterials.js';
import { monsterAsset } from '../world/MonsterAssets.js';

// Procedural low-poly body: a handful of shared, roughened geometries scaled onto the skeleton.
// Few faces and flat shading so it sits in the game's 300-line pixel render instead of looking like a model.

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const posHash = (x, y, z, seed) => hash(Math.round(x * 997) * 0.37 + Math.round(y * 991) * 1.13 + Math.round(z * 983) * 2.71 + seed * 17.3);

// Jitter vertices by position (so seams move together and nothing cracks) and colour them pale grey with
// a few quantised shades, so the surface reads as uneven skin rather than plastic.
function roughen(geo, { amount = 0.25, seed = 1, twist = 0, shade = 0.66 } = {}) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = posHash(x, y, z, seed), m = posHash(x, y, z, seed + 9);
    const k = 1 + (n - 0.5) * amount;
    x *= k; z *= k; y += (m - 0.5) * amount * 0.05;
    if (twist) { const a = y * twist, c = Math.cos(a), s = Math.sin(a); [x, z] = [x * c - z * s, x * s + z * c]; }
    pos.setXYZ(i, x, y, z);
    const v = Math.round((shade + (posHash(x, y, z, seed + 21) - 0.5) * 0.2) * 25) / 25;     // a few steps of grey
    col[i * 3] = v; col[i * 3 + 1] = v * 0.985; col[i * 3 + 2] = v * 0.93;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

let shared = null;
function sharedGeometry() {
  if (shared) return shared;
  const limb = (seed, twist) => {
    const g = new THREE.CylinderGeometry(1, 0.7, 1, 5, 4);
    g.translate(0, -0.5, 0);                               // pivot at the top, hanging down
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                    // knobbly at both ends, wasted in the middle
      const y = -p.getY(i), bulge = 1 + 0.35 * (Math.exp(-((y - 0.04) ** 2) * 160) + Math.exp(-((y - 0.96) ** 2) * 160)) - 0.12 * Math.sin(y * Math.PI);
      p.setX(i, p.getX(i) * bulge); p.setZ(i, p.getZ(i) * bulge);
    }
    return roughen(g, { amount: 0.4, seed, twist });
  };
  const head = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x > 0) x *= 1.22;                                // lopsided
      z -= Math.max(0, y) * 0.45;                          // skull swept back
      if (y < -0.2) { z += 0.18; x *= 0.7; }               // a narrow, jutting underside where a face should be
      if (z > 0.5 && y > 0.05 && y < 0.5) z -= 0.22;       // sunken sockets, no nose, no mouth
      p.setXYZ(i, x * 0.105, y * 0.2, z * 0.125);
    }
    g.translate(0, 0.16, 0.02);
    return roughen(g, { amount: 0.3, seed: 5, shade: 0.62 });
  })();
  const torso = (() => {
    const g = new THREE.CylinderGeometry(1, 0.5, 1, 6, 6, false), p = g.attributes.position;
    g.translate(0, 0.5, 0);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), pinch = y < 0.45 ? 0.62 + 0.38 * Math.abs(y - 0.22) / 0.23 : 1;   // a wasp waist where the gut should be
      p.setXYZ(i, p.getX(i) * 0.13 * pinch, y * DIMS.torso, p.getZ(i) * 0.075 * pinch);
    }
    return roughen(g, { amount: 0.22, seed: 7, shade: 0.6 });
  })();
  const rib = (() => {
    const g = new THREE.TorusGeometry(1, 0.09, 3, 8, Math.PI * 1.25);
    g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 8);       // arc wraps round the front
    return roughen(g, { amount: 0.1, seed: 11, shade: 0.72 });
  })();
  const knob = roughen(new THREE.IcosahedronGeometry(1, 0), { amount: 0.5, seed: 13, shade: 0.68 });
  const eye = new THREE.IcosahedronGeometry(1, 0);
  shared = { limbs: [limb(1, 1.2), limb(2, -0.9), limb(3, 2.2), limb(4, 0)], head, torso, rib, knob, eye };
  return shared;
}

const eyeGeometry = new THREE.SphereGeometry(1, 8, 6);

function buildContortionist(asset, opts) {
  const mats = createObserverMaterials(opts);
  const head = asset.bone('head');
  const eyeOrigin = head.getWorldPosition(new THREE.Vector3());
  const worldScale = head.getWorldScale(new THREE.Vector3());
  const eyes = [-1, 1].map(side => {
    const eye = new THREE.Mesh(eyeGeometry, mats.eyes);
    head.add(eye);
    eye.position.copy(head.worldToLocal(eyeOrigin.clone().add(new THREE.Vector3(side * 0.048, 0.09, 0.10))));
    eye.frustumCulled = false;
    return eye;
  });
  const materials = asset.meshes.map(mesh => {
    const mat = mesh.material.clone();
    mat.onBeforeCompile = mats.skin.onBeforeCompile;
    mat.customProgramCacheKey = () => 'contortionist-ambient-' + (opts.ambientScale ?? 1);
    mesh.material = mat;
    return mat;
  });
  function sizeEyes(dist, radPerPixel) {
    const size = Math.max(0.013, dist * radPerPixel * 1.1);
    for (const eye of eyes) eye.scale.setScalar(size).divide(worldScale);
  }
  sizeEyes(0, 0);
  return {
    root: asset.root, eyes, mats, sizeEyes, asset,
    j: { Head: head, RightHand: asset.bone('limb_R1_c') },
    dispose() {
      asset.root.removeFromParent();
      for (const material of materials) material.dispose();
      mats.dispose();
    },
  };
}

export function createObserverModel(opts = {}) {
  const replacement = monsterAsset('observer', { scale: [1.07, 1.84, 1.13], idle: 'Idle' });
  if (replacement) return buildContortionist(replacement, opts);
  const G = sharedGeometry(), mats = createObserverMaterials(opts), D = DIMS;
  const { root, j, chest } = buildSkeleton();
  const meshes = [];
  const add = (parent, geo, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, mat = mats.skin) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); meshes.push(m); return m;
  };
  const L = G.limbs;
  // pelvis and torso
  add(j.Pelvis, G.knob, 0.1, 0.07, 0.07, 0, 0.02, 0);
  add(chest, G.torso, 1.2, 1, 1.2, 0, 0, 0);
  for (let r = 0; r < 6; r++) {                           // ribs standing out through the skin
    const h = 0.3 + r * 0.05, w = 1.2 * 0.13 * (0.55 + 0.45 * (0.04 + h / D.torso)) + 0.016;
    add(chest, G.rib, w, w * 0.9, w * 0.62, 0, h, 0.008, 0.12 - r * 0.03);
  }
  add(chest, L[3], 0.018, D.torso * 0.95, 0.018, 0, D.torso * 0.97, -0.06);   // spine ridge down the back
  // neck and head
  add(j.Neck, L[0], 0.04, D.neck, 0.038, 0, 0, 0, Math.PI);
  add(j.Head, G.head, 1.25, 1.15, 1.2);
  const eyeL = add(j.Head, G.eye, 0.017, 0.013, 0.01, 0.052, 0.245, 0.152, 0, 0, 0, mats.eyes);
  const eyeR = add(j.Head, G.eye, 0.013, 0.016, 0.01, -0.045, 0.218, 0.157, 0, 0, 0, mats.eyes);
  for (const e of [eyeL, eyeR]) e.userData.base = e.scale.clone();
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    add(j[side + 'Shoulder'], G.knob, 0.04, 0.035, 0.035);
    add(j[side + 'UpperArm'], L[0], 0.046, D.upperArm, 0.043);
    add(j[side + 'Elbow'], G.knob, 0.038, 0.045, 0.032);
    add(j[side + 'Forearm'], L[1], 0.038, D.forearm, 0.035);
    add(j[side + 'Hand'], L[2], 0.04, D.palm, 0.016, 0, 0, 0);
    D.finger.forEach(([a, b], f) => {
      const base = j[`${side}Finger${f}`], tip = j[`${side}Finger${f}Tip`];
      if (f === 0) base.rotation.z = s * 0.5;
      add(base, L[f % 4], 0.0105, a, 0.0105);
      add(tip, L[(f + 1) % 4], 0.0085, b, 0.0085);
    });
    add(j[side + 'Thigh'], L[3], 0.062, D.thigh, 0.058);
    add(j[side + 'Knee'], G.knob, 0.05, 0.06, 0.045);
    add(j[side + 'LowerLeg'], L[1], 0.044, D.shin, 0.04);
    add(j[side + 'Foot'], L[2], 0.03, 0.3, 0.016, 0, -0.02, -0.04, -Math.PI / 2);     // long, narrow, toes forward
    add(j[side + 'Foot'], G.knob, 0.025, 0.03, 0.04, 0, -0.01, -0.06);                // heel spur
  }
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return {
    root, j, chest, mats, eyes: [eyeL, eyeR], meshes,
    // At range a real-sized eye is far smaller than one pixel of the low-resolution render. Grow the eyes
    // with distance so they never drop below about two pixels; up close they are their true size.
    sizeEyes(dist, radPerPixel) {
      const k = Math.max(1, (dist * radPerPixel * 1.1) / 0.016);
      for (const e of [eyeL, eyeR]) e.scale.copy(e.userData.base).multiplyScalar(k);
    },
    dispose() { root.removeFromParent(); mats.dispose(); },           // shared geometry stays cached for the next spawn
  };
}
