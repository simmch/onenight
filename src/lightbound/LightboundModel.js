import * as THREE from 'three';

const oval = new THREE.SphereGeometry(1, 10, 8);
const bone = new THREE.CylinderGeometry(0.76, 1, 1, 7);
const plate = new THREE.BoxGeometry(1, 1, 1);
const skin = new THREE.MeshStandardMaterial({ color: 0x666656, roughness: 0.79, flatShading: true, emissive: 0x39382c, emissiveIntensity: 0.19 });
const sinew = new THREE.MeshStandardMaterial({ color: 0x3a312c, roughness: 0.85, flatShading: true });
const sockets = new THREE.MeshBasicMaterial({ color: 0x080707 });
const eyes = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, emissive: 0xeae6d6, emissiveIntensity: 0.67, roughness: 0.22 });
const teeth = new THREE.MeshLambertMaterial({ color: 0xab9d79 });
const spark = new THREE.MeshBasicMaterial({ color: 0xb9b36e });

function group(parent, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}
function piece(parent, geometry, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
const ellipsoid = (parent, material, x, y, z, w, h, d) => piece(parent, oval, material, x, y, z, w, h, d);
const limb = (parent, material, x, y, z, w, h, d = w) => piece(parent, bone, material, x, y, z, w, h, d);

export function buildLightbound(side, phase) {
  const root = new THREE.Group();
  const torso = group(root, 0, 1.30, 0);
  ellipsoid(torso, skin, 0, 0.05, 0, 0.17, 0.14, 0.095);
  ellipsoid(torso, skin, 0, 0.44, 0, 0.22, 0.34, 0.13);
  limb(torso, sinew, 0, 0.24, 0, 0.065, 0.32, 0.08);
  for (let i = 0; i < 4; i++) {
    const y = 0.30 + i * 0.12;
    for (const s of [-1, 1]) {
      const rib = ellipsoid(torso, sinew, s * 0.10, y, 0.105, 0.026, 0.117, 0.032);
      rib.rotation.z = -s * (1 + i * 0.08);
    }
  }
  const neck = group(torso, 0.06 * side, 0.69, 0);
  limb(neck, sinew, 0, 0.13, 0, 0.06, 0.32);
  const head = group(neck, 0, 0.35, 0.035);
  ellipsoid(head, skin, 0, 0.12, 0.01, 0.34, 0.43, 0.25);
  ellipsoid(head, skin, side * 0.10, 0.24, -0.02, 0.242, 0.32, 0.21);
  for (const s of [-1, 1]) {
    ellipsoid(head, sockets, s * 0.152, 0.09 + s * 0.019, 0.198, 0.133, 0.115, 0.102);
    ellipsoid(head, eyes, s * 0.152, 0.076 + s * 0.019, 0.263, 0.079, 0.084, 0.066);
    ellipsoid(head, sockets, s * 0.149 + 0.011 * side, 0.072 + s * 0.019, 0.32, 0.012, 0.014, 0.009);
  }
  const jaw = group(head, 0, -0.115, 0.144);
  ellipsoid(jaw, sockets, 0, -0.08, 0.105, 0.122, 0.132, 0.021);
  ellipsoid(jaw, skin, 0, -0.168, 0.036, 0.147, 0.077, 0.111);
  for (let i = -2; i <= 2; i++) {
    piece(jaw, plate, teeth, i * 0.036, -0.038, 0.122, 0.019, 0.043 - Math.abs(i) * 0.005, 0.02);
  }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const shoulder = group(torso, s * 0.225, 0.64, 0.001);
    ellipsoid(shoulder, skin, 0, -0.025, 0, 0.076, 0.082, 0.067);
    limb(shoulder, skin, 0, -0.304, 0, 0.056, 0.59);
    const elbow = group(shoulder, 0, -0.59, 0);
    limb(elbow, skin, 0, -0.298, 0, 0.041, 0.59);
    ellipsoid(elbow, sinew, 0, -0.603, 0, 0.054, 0.092, 0.036);
    for (let i = -1; i <= 1; i++) {
      const finger = limb(elbow, skin, i * 0.035, -0.74 + Math.abs(i) * 0.025, 0.01, 0.18, 0.015);
      finger.rotation.z = i * 0.16;
    }
    arms.push({ s, shoulder, elbow });

    const hip = group(root, s * 0.105, 1.35, 0);
    limb(hip, skin, 0, -0.324, 0, 0.061, 0.65);
    const knee = group(hip, 0, -0.64, 0);
    ellipsoid(knee, sinew, 0, 0.012, 0, 0.055, 0.076, 0.047);
    limb(knee, skin, 0, -0.332, 0, 0.044, 0.65);
    ellipsoid(knee, skin, 0, -0.647, 0.055, 0.061, 0.052, 0.125);
    legs.push({ s, hip, knee });
  }

  function pose(time, scream, recoil) {
    const sway = Math.sin(time * 1.85 + phase);
    const ripple = Math.sin(time * 3.1 + phase);
    torso.position.y = 1.30 + 0.043 * sway;
    torso.rotation.set(0.15 - 0.09 * scream - recoil * 0.23, 0.09 * ripple, -side * (0.14 + 0.095 * sway));
    neck.rotation.z = -side * (0.27 + 0.12 * ripple + recoil * 0.25);
    head.rotation.set(0.16 - scream * 0.23, 0.11 * sway, -side * (0.33 + 0.09 * sway));
    jaw.rotation.x = 0.02 + scream * 0.66 + Math.max(0, ripple) * 0.17;
    for (const { s, shoulder, elbow } of arms) {
      shoulder.rotation.set(-0.13 + 0.23 * s * sway - 0.56 * scream, s * 0.12, s * (0.13 + 0.08 * ripple + 0.16 * scream));
      elbow.rotation.x = -0.17 - 0.14 * (1 + s * sway);
    }
    for (const { s, hip, knee } of legs) {
      hip.rotation.set(0.045 * s * ripple, 0, s * (0.052 + 0.019 * sway));
      knee.rotation.x = 0.045 + Math.max(0, s * sway) * 0.056;
    }
  }
  return { root, torso, head, pose };
}

export function buildBreaker() {
  const root = new THREE.Group();
  piece(root, plate, skin, 0, 0.60, 0, 0.08, 1.2, 0.10);
  piece(root, plate, sinew, 0, 1.06, 0, 0.45, 0.54, 0.25);
  piece(root, plate, spark, 0, 1.25, 0.13, 0.20, 0.019, 0.017);
  const handle = group(root, 0, 1.05, 0.145);
  piece(handle, plate, skin, 0, 0.088, 0.055, 0.075, 0.21, 0.049);
  piece(handle, plate, teeth, 0, 0.177, 0.077, 0.16, 0.052, 0.064);
  return { root, handle };
}

export function buildEmergencyTube() {
  const root = new THREE.Group();
  piece(root, plate, sinew, 0, 0.16, 0, 0.27, 0.12, 0.87);
  const lens = piece(root, plate, spark, 0, 0.05, 0, 0.16, 0.07, 0.7);
  return { root, lens };
}
