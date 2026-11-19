import * as THREE from 'three';
import { consumerSurface } from './ConsumerTextures.js';
import { monsterAsset } from '../world/MonsterAssets.js';

export const CONSUMER_HEIGHT = 2.96;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function warpedHide() {
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const grain = Math.sin(x * 20 + y * 13) * Math.cos(z * 17 - y * 7);
    const scale = 1 + grain * 0.057;
    pos.setXYZ(i, x * scale, y * scale, z * scale);
    const value = 0.72 + 0.20 * grain + 0.08 * Math.sin(x * 8 + z * 7);
    colors.push(value, value * 0.95, value * 0.96);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

const hide = warpedHide();
const joint = new THREE.SphereGeometry(1, 9, 7);
const shaft = new THREE.CylinderGeometry(0.62, 1, 1, 8, 8);
const shaftPositions = shaft.attributes.position;
for (let i = 0; i < shaftPositions.count; i++) {
  const y = shaftPositions.getY(i), x = shaftPositions.getX(i), z = shaftPositions.getZ(i);
  const bulge = 1 + 0.19 * Math.cos(y * 9) + 0.13 * Math.sin(y * 16 + x * 5);
  shaftPositions.setX(i, x * bulge + 0.11 * Math.sin((y + 0.5) * Math.PI));
  shaftPositions.setZ(i, z * (bulge - 0.10 * Math.sin(y * 9)));
}
shaft.computeVertexNormals();
const needle = new THREE.ConeGeometry(1, 1, 7);
for (const geo of [hide, joint, shaft, needle]) geo.computeBoundingBox();

const skin = new THREE.MeshStandardMaterial({ ...consumerSurface('hide'), vertexColors: true, flatShading: true,
  emissive: 0x292121, emissiveIntensity: 0.22 });
const sinew = new THREE.MeshStandardMaterial({ ...consumerSurface('tendon'), emissive: 0x281018, emissiveIntensity: 0.21, flatShading: true });
const ivory = new THREE.MeshStandardMaterial({ ...consumerSurface('bone'), flatShading: true, emissive: 0x342522, emissiveIntensity: 0.17 });
const coreSurface = consumerSurface('core');
const hollow = new THREE.MeshBasicMaterial({ color: 0x0b050a });
const socket = new THREE.MeshBasicMaterial({ color: 0x15090c });
const ember = new THREE.MeshBasicMaterial({ color: 0xc3705b });

function group(parent, x, y, z) {
  const obj = new THREE.Group();
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}
function piece(parent, geometry, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}
const flesh = (p, x, y, z, w, h, d) => piece(p, hide, skin, x, y, z, w, h, d);
const oval = (p, mat, x, y, z, w, h, d) => piece(p, joint, mat, x, y, z, w, h, d);
function curl(parent, material, coords, width) {
  const path = new THREE.CatmullRomCurve3(coords.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geometry = new THREE.TubeGeometry(path, 8, width, 5, false);
  const uv = geometry.attributes.uv;
  // Match the cylinder UVs so the fibers run lengthwise along tendons and ribs.
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return piece(parent, geometry, material, 0, 0, 0, 1, 1, 1);
}
function thorn(parent, material, base, tip, radius) {
  const axis = new THREE.Vector3(...tip).sub(new THREE.Vector3(...base));
  const mid = new THREE.Vector3(...base).addScaledVector(axis, 0.5);
  const mesh = piece(parent, needle, material, mid.x, mid.y, mid.z, radius, axis.length(), radius);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.normalize());
  return mesh;
}

function buildMaw(asset) {
  const { root } = asset;
  const distortion = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32),
    new THREE.MeshBasicMaterial({ color: 0x6c2743, transparent: true, depthWrite: false }));
  distortion.rotation.x = -Math.PI / 2;
  distortion.position.y = 0.035;
  root.add(distortion);
  const mouth = new THREE.Group();
  asset.bone('mouth_upper').add(mouth);
  mouth.position.copy(asset.bone('mouth_upper').worldToLocal(
    asset.bone('mouth_upper').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.09, 0.20)),
  ));
  return {
    ...asset, distortion, mouth, hitT: 0, contactRadius: 0.59,
    pose(dt, { state, speed, hit }) {
      if (state === 'consume') asset.animate('Attack_Eat', dt, { once: true, rate: 0.9 });
      else if (state === 'windup' || state === 'lunge' || state === 'recover') {
        asset.animate('Attack_Swipe', dt, { once: true, rate: 0.72 });
      } else if (hit > 0) asset.animate('Hit', dt, { once: true, rate: 0.7 });
      else if (speed > 0.25) {
        const clip = state === 'hunt' ? 'Run_Chomp' : state === 'scurry' ? 'Run_Pull' : 'Crawl';
        asset.animate(clip, dt, { rate: THREE.MathUtils.clamp(speed / 3.1, 0.5, 1.55) });
      } else asset.animate('Idle_Breathe', dt, { rate: 0.7 });
    },
  };
}

export function buildConsumerModel() {
  const replacement = monsterAsset('consumer', { scale: [1.12, 1.72, 1.04], idle: 'Idle_Breathe' });
  if (replacement) return buildMaw(replacement);
  const root = new THREE.Group();
  root.name = 'Consumer';
  root.rotation.order = 'YXZ';
  const body = group(root, 0, 0, 0), hits = [];
  const hitPart = (mesh) => { hits.push(mesh); return mesh; };
  const trunk = group(body, 0, 1.35, 0);

  hitPart(flesh(trunk, 0, -0.025, -0.10, 0.28, 0.24, 0.25));
  hitPart(flesh(trunk, 0.01, 0.48, -0.12, 0.46, 0.52, 0.28));
  const belly = hitPart(flesh(trunk, 0, 0.20, 0.09, 0.33, 0.29, 0.26));
  const maw = oval(trunk, hollow, 0, 0.49, 0.235, 0.29, 0.45, 0.095);
  const coreMat = new THREE.MeshStandardMaterial({ ...coreSurface, emissive: 0x94263b, emissiveIntensity: 0.32 });
  const core = hitPart(oval(trunk, coreMat, 0, 0.54, 0.322, 0.156, 0.232, 0.063));
  for (const s of [-1, 1]) {
    curl(core, sinew, [[s * 0.46, -0.86, 0.5], [s * 0.21, -0.16, 0.97], [s * 0.61, 0.46, 0.93], [s * 0.28, 0.91, 0.55]], 0.065);
  }
  for (let i = 0; i < 6; i++) {
    const y = 0.14 + i * 0.125, spread = 0.32 + Math.sin(i / 5 * Math.PI) * 0.16;
    for (const s of [-1, 1]) {
      curl(trunk, ivory, [[s * 0.11, y + 0.078, -0.27], [s * spread, y + 0.044, -0.08],
        [s * (spread - 0.06), y, 0.19], [s * (0.14 + i * 0.007), y - 0.1, 0.31]], 0.026 + i * 0.002);
    }
  }
  const spine = group(trunk, 0, 0.26, -0.34);
  for (let i = 0; i < 8; i++) {
    const y = i * 0.102, s = i % 2 ? -1 : 1;
    oval(spine, ivory, s * 0.023, y, -0.02, 0.104, 0.067, 0.08);
    thorn(spine, ivory, [s * 0.04, y, -0.03], [s * 0.12, y + 0.1, -0.11 - i * 0.016], 0.048);
  }
  for (const s of [-1, 1]) {
    const shoulder = flesh(trunk, s * 0.43, 0.72, -0.03, 0.25, 0.21, 0.25);
    shoulder.rotation.z = s * -0.38;
    curl(trunk, ivory, [[s * 0.12, 0.94, -0.24], [s * 0.45, 0.86, -0.29],
      [s * 0.63, 1.02, -0.30], [s * 0.74, 1.23, -0.39]], 0.052);
    thorn(trunk, ivory, [s * 0.738, 1.222, -0.384], [s * 0.80, 1.38, -0.44], 0.052);
    thorn(trunk, ivory, [s * 0.49, 0.77, -0.25], [s * 0.49, 1.27, -0.53], 0.094);
    thorn(trunk, sinew, [s * 0.35, 0.58, -0.29], [s * 0.64, 0.80, -0.55], 0.089);
  }

  const neck = group(trunk, 0, 0.80, 0.07);
  const throat = flesh(neck, 0, 0.12, 0.065, 0.17, 0.29, 0.16);
  throat.rotation.x = 0.39;
  const head = group(neck, -0.048, 0.32, 0.20);
  hitPart(flesh(head, 0.005, 0.065, -0.028, 0.30, 0.267, 0.268));
  oval(head, hollow, 0, -0.06, 0.198, 0.235, 0.172, 0.085);
  const lower = group(head, 0, -0.105, 0.02);
  hitPart(oval(lower, sinew, 0.003, -0.07, 0.19, 0.245, 0.113, 0.19));
  const mouth = group(head, 0, -0.075, 0.27);
  for (const s of [-1, 1]) {
    flesh(head, s * 0.18, 0.095, 0.085, 0.134, 0.144, 0.185).rotation.z = s * -0.31;
    oval(head, socket, s * 0.133, 0.117, 0.224, 0.092, 0.071, 0.044);
    oval(head, ember, s * 0.138, 0.115, 0.261, 0.017, 0.008, 0.016);
    curl(head, sinew, [[s * 0.068, 0.22, 0.222], [s * 0.137, 0.19, 0.237],
      [s * 0.226, 0.148, 0.193], [s * 0.255, 0.06, 0.174]], 0.026);
    for (let i = 0; i < 5; i++) {
      const x = s * (0.023 + i * 0.042), z = 0.33 - i * i * 0.0054;
      const reach = 0.051 + i % 3 * 0.019;
      thorn(head, ivory, [x, -0.037, z - 0.004], [x * 0.98, -0.037 - reach, z + 0.03], 0.016);
      thorn(lower, ivory, [x, -0.065, z - 0.029], [x * 0.97, -0.065 + reach * 0.72, z - 0.016], 0.012);
    }
  }

  function articulated(side, arm) {
    const upper = hitPart(piece(body, shaft, sinew, 0, 0, 0, arm ? 0.11 : 0.15, 1, arm ? 0.094 : 0.13));
    const lower = hitPart(piece(body, shaft, sinew, 0, 0, 0, arm ? 0.075 : 0.099, 1, arm ? 0.061 : 0.097));
    const jointMesh = flesh(body, 0, 0, 0, arm ? 0.103 : 0.122, 0.106, 0.106);
    oval(jointMesh, ivory, side * 0.55, 0.13, 0.48, 0.60, 0.29, 0.52);
    const hand = group(body, 0, 0, 0);
    hitPart(flesh(hand, 0, arm ? 0 : 0.053, 0.055, arm ? 0.12 : 0.128, 0.071, arm ? 0.14 : 0.187));
    for (let i = -1; i <= 1; i++) {
      const x = i * (arm ? 0.084 : 0.067), reach = (arm ? 0.32 : 0.23) - Math.abs(i) * 0.038;
      curl(hand, sinew, [[x * 0.63, 0.04, 0.061], [x, 0.031, 0.16], [x * 1.34, 0.022, reach - 0.03], [x * 1.13, -0.02, reach]], arm ? 0.029 : 0.024);
      thorn(hand, ivory, [x * 1.34, 0.019, reach - 0.045], [x * 1.14, -0.061, reach + 0.078], arm ? 0.027 : 0.022);
    }
    return { side, hinge: new THREE.Vector3(), upper, lower, jointMesh, hand };
  }
  const arms = [-1, 1].map(s => articulated(s, true));
  const legs = [-1, 1].map(s => articulated(s, false));
  const axis = new THREE.Vector3(), pole = new THREE.Vector3(), target = new THREE.Vector3(), offset = new THREE.Vector3();
  const trunkPoint = new THREE.Vector3();
  const distortion = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32),
    new THREE.MeshBasicMaterial({ color: 0x751b35, transparent: true, opacity: 0, depthWrite: false }));
  distortion.rotation.x = -Math.PI / 2;
  distortion.position.y = 0.035;
  root.add(distortion);

  function connect(mesh, a, b) {
    axis.subVectors(b, a);
    mesh.position.copy(a).addScaledVector(axis, 0.5);
    mesh.scale.y = Math.max(0.015, axis.length() * 1.08);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, axis.normalize());
  }
  function bend(limb, start, end, outward, a, b) {
    const { upper, lower, hinge, jointMesh, hand } = limb;
    axis.subVectors(end, start);
    const length = Math.max(0.03, axis.length());
    const d = THREE.MathUtils.clamp(length, Math.abs(a - b) + 0.01, a + b - 0.01);
    axis.normalize();
    const along = (a * a - b * b + d * d) / (2 * d);
    pole.copy(outward).addScaledVector(axis, -outward.dot(axis)).normalize();
    hinge.copy(start).addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    connect(upper, start, hinge);
    connect(lower, hinge, end);
    jointMesh.position.copy(hinge);
    hand.position.copy(end);
  }
  let gait = 0, crouch = 0, jaw = 0, spread = 0;
  function reset() {
    gait = crouch = jaw = spread = 0;
    body.rotation.set(0, 0, 0);
    trunk.rotation.set(0.19, 0, 0);
  }
  function pose(dt, { time, state, speed, size, growth, ceiling, hit, feed }) {
    const blend = Math.min(1, dt * 11);
    const moving = Math.min(1, speed / 3);
    const windup = state === 'windup', lunge = state === 'lunge', feeding = state === 'consume';
    const recover = state === 'recover';
    const crawl = ceiling > 0.18 || state === 'scurry';
    const drop = feeding ? 0.46 : windup ? 0.30 : lunge ? 0.24 : recover ? 0.25 : crawl ? 0.34 : 0.085;
    crouch += (drop - crouch) * blend;
    spread += ((windup ? 0.62 : lunge ? 0.95 : feeding ? 0.28 : 0) - spread) * blend;
    jaw += ((feeding ? 0.43 + 0.34 * Math.sin(time * 14) + 0.42 * feed
      : lunge ? 0.88 : windup ? 0.46 : recover ? 0.19 : 0.07 + 0.04 * Math.sin(time * 3.8)) - jaw) * blend;
    gait += dt * speed * (crawl ? 4.0 : 3.05) / Math.max(0.85, size);
    const cadence = Math.sin(gait);
    const recoil = Math.sin(hit * 30) * hit * 0.44;
    const bellyPulse = 1 + 0.044 * Math.sin(time * 2.9) + (feeding ? 0.043 * Math.cos(time * 12) : 0);
    body.rotation.y = Math.PI * ceiling;
    trunk.position.set(cadence * 0.078 * moving, 1.39 - crouch + Math.abs(cadence) * 0.064 * moving,
      (lunge ? 0.23 : feeding ? 0.16 : windup ? -0.10 : 0.015) + recoil);
    const pitch = feeding ? 0.72 : lunge ? 0.64 : windup ? -0.24 : crawl ? 0.52 : 0.19;
    trunk.rotation.x += (pitch + 0.038 * Math.sin(time * 2.6) + recoil - trunk.rotation.x) * blend;
    trunk.rotation.z = moving * cadence * 0.10 + Math.sin(time * 2.1) * 0.046 + recoil * 0.70;
    trunk.rotation.y = 0.08 * Math.cos(gait) * moving;
    trunk.updateMatrix();
    neck.rotation.x = -trunk.rotation.x * 0.5 + (feeding ? 0.36 : windup ? -0.18 : 0.02);
    head.rotation.set((feeding ? 0.31 : lunge ? -0.14 : 0.04) + recoil, moving * cadence * -0.10,
      0.10 + 0.09 * Math.sin(time * 1.9) + recoil);
    lower.rotation.x = jaw;
    mouth.position.y = -0.078 - jaw * 0.078;
    belly.scale.set(0.33 + growth * 0.15, (0.29 + growth * 0.12) * bellyPulse, (0.26 + growth * 0.20) * bellyPulse);
    maw.scale.x = 0.29 + growth * 0.048 + 0.020 * Math.sin(time * 3);
    core.scale.set(0.156 + growth * 0.075, (0.232 + growth * 0.07) * bellyPulse, 0.063);
    coreMat.emissiveIntensity = 0.25 + growth * 0.56 + (feeding ? feed * 0.75 : 0);

    for (const arm of arms) {
      const s = arm.side, wave = Math.sin(gait + (s < 0 ? Math.PI : 0) + 1.3);
      const step = Math.max(0, Math.cos(gait + (s < 0 ? Math.PI : 0) + 1.3));
      trunkPoint.set(s * 0.49, 0.72, 0.02).applyMatrix4(trunk.matrix);
      const x = s * (0.60 + 0.60 * (crawl ? 1 : 0) + spread * 0.37 + moving * 0.055);
      const y = feeding ? 0.43 + 0.07 * Math.sin(time * 11 + s) : crawl ? 0.035 + step * moving * 0.30
        : lunge ? 0.87 : windup ? 1.11 : 0.32 + (step * 0.16 + 0.12) * moving;
      const z = lunge ? 1.18 : windup ? -0.17 : feeding ? 0.94 : wave * moving * 0.64 + (crawl ? 0.63 : 0.17);
      target.set(x, y, z);
      // Limit reach so the joints never stretch when the torso rises out of a crawl.
      offset.subVectors(target, trunkPoint).clampLength(0.08, 1.98);
      target.copy(trunkPoint).add(offset);
      bend(arm, trunkPoint, target, offset.set(s, 0.30, -0.50), 0.97, 1.01);
      arm.hand.rotation.set(crawl ? -0.10 + step * moving * 0.28 : 0.74 - spread * 0.88, s * -0.20, s * -0.15);
    }
    for (const leg of legs) {
      const s = leg.side, phase = gait + (s < 0 ? Math.PI : 0);
      const step = Math.max(0, Math.cos(phase));
      trunkPoint.set(s * 0.18, 0, -0.14).applyMatrix4(trunk.matrix);
      target.set(s * (crawl ? 0.47 : 0.27), 0.02 + step * moving * 0.23,
        Math.sin(phase) * moving * 0.69 - (crawl ? 0.49 : 0.1));
      bend(leg, trunkPoint, target, offset.set(s * 0.5, 0, 1), 0.81, 0.80);
      leg.hand.rotation.set(step * moving * -0.24, s * 0.09, 0);
    }
  }

  const inverse = new THREE.Matrix4(), ray = new THREE.Ray(), nearest = new THREE.Vector3();
  const local = new THREE.Vector3(), scale = new THREE.Vector3(), bounds = new THREE.Box3();
  function rayHit(origin, direction, limit, padding) {
    root.updateWorldMatrix(true, true);
    let found = false;
    for (const mesh of hits) {
      const matrix = mesh.matrixWorld;
      ray.set(origin, direction).applyMatrix4(inverse.copy(matrix).invert());
      bounds.copy(mesh.geometry.boundingBox);
      if (padding > 0) {
        scale.setFromMatrixScale(matrix);
        local.set(padding / scale.x, padding / scale.y, padding / scale.z);
        bounds.min.sub(local); bounds.max.add(local);
      }
      const point = bounds.containsPoint(ray.origin) ? local.copy(ray.origin) : ray.intersectBox(bounds, local);
      if (!point) continue;
      point.applyMatrix4(matrix);
      const d = point.distanceTo(origin);
      if (d <= limit) { found = true; nearest.copy(point); limit = d; }
    }
    return found ? nearest : null;
  }
  function closestPoint(origin) {
    root.updateWorldMatrix(true, true);
    let best = Infinity;
    for (const mesh of hits) {
      local.copy(origin).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
      mesh.geometry.boundingBox.clampPoint(local, local).applyMatrix4(mesh.matrixWorld);
      const d = origin.distanceToSquared(local);
      if (d < best) { best = d; nearest.copy(local); }
    }
    return nearest;
  }
  return { root, mouth, distortion, contactRadius: 0.59, reset, pose, rayHit, closestPoint, hitT: 0 };
}
