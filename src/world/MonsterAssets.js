import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';

const files = {
  consumer: 'TheMaw/SK_Maw.glb',
  lightbound: 'TheCongregation/SK_Congregation.glb',
  burrower: 'TheVentCrawler/SK_VentCrawler.glb',
  observer: 'TheContortionist/SK_Contortionist.glb',
  trayHound: 'TheTrayHound/SK_TrayHound.glb',
};
const assets = new Map();

export async function preloadMonsterAssets() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(files).map(async ([type, path]) => {
    try {
      const model = await loader.loadAsync(new URL('../../assets/' + path, import.meta.url).href);
      assets.set(type, model);
    } catch (error) {
      console.warn('Could not load the replacement model for ' + type, error);
    }
  }));
}

export function monsterAsset(type, options) {
  return instantiateMonsterAsset(assets.get(type), options);
}

export function instantiateMonsterAsset(source, { scale, yaw = 0, idle }) {
  if (!source) return null;
  const root = new THREE.Group();
  const rig = source.scene.clone();
  const original = [], clones = [];
  source.scene.traverse(node => original.push(node));
  rig.traverse(node => clones.push(node));
  const cloneByOriginal = new Map(original.map((node, i) => [node, clones[i]]));
  const meshes = [];
  for (const [node, clone] of cloneByOriginal) {
    if (!node.isSkinnedMesh) continue;
    const skeleton = node.skeleton.clone();
    skeleton.bones = node.skeleton.bones.map(bone => cloneByOriginal.get(bone));
    clone.bind(skeleton, node.bindMatrix);
    clone.frustumCulled = false;
    meshes.push(clone);
  }
  if (typeof scale === 'number') rig.scale.setScalar(scale);
  else rig.scale.set(...scale);
  rig.rotation.y = yaw;
  root.add(rig);
  const mixer = new THREE.AnimationMixer(rig);
  const clips = new Map(source.animations.map(clip => [clip.name.split('|').pop(), clip]));
  let action;
  function animate(name, dt, { once = false, rate = 1, restart = false } = {}) {
    const clip = clips.get(name) ?? clips.get(idle);
    const next = mixer.clipAction(clip);
    if (next !== action || restart) {
      next.reset().setEffectiveWeight(1).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.play();
      if (action && action !== next) next.crossFadeFrom(action, 0.08, false);
      action = next;
    }
    action.setEffectiveTimeScale(rate);
    mixer.update(dt);
  }
  function reset() {
    mixer.stopAllAction();
    action = null;
    animate(idle, 0);
  }
  reset();
  const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4();
  const box = new THREE.Box3(), vertex = new THREE.Vector3(), point = new THREE.Vector3(), ray = new THREE.Ray();
  function posedBounds(padding) {
    root.updateWorldMatrix(true, false);
    root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();
    box.makeEmpty();
    for (const mesh of meshes) {
      transform.multiplyMatrices(inverse, mesh.matrixWorld);
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        box.expandByPoint(mesh.getVertexPosition(i, vertex).applyMatrix4(transform));
      }
    }
    if (padding) {
      vertex.setFromMatrixScale(root.matrixWorld).set(padding / vertex.x, padding / vertex.y, padding / vertex.z);
      box.min.sub(vertex);
      box.max.add(vertex);
    }
    return box;
  }
  function rayHit(origin, direction, limit, padding) {
    const bounds = posedBounds(padding);
    ray.set(origin, direction).applyMatrix4(inverse);
    const hit = bounds.containsPoint(ray.origin) ? point.copy(ray.origin) : ray.intersectBox(bounds, point);
    if (!hit) return null;
    root.localToWorld(hit);
    return hit.distanceTo(origin) <= limit ? hit : null;
  }
  function closestPoint(origin) {
    return root.localToWorld(posedBounds(0).clampPoint(vertex.copy(origin).applyMatrix4(inverse), point));
  }
  return { root, rig, meshes, animate, reset, rayHit, closestPoint, bone: name => rig.getObjectByName(name) };
}
