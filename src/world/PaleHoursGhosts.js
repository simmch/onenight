import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { instantiateMonsterAsset } from './MonsterAssets.js';

const characters = [
  'ballerina', 'burned_nun', 'butler', 'drowned_bride', 'drowned_sailor', 'hanged_man',
  'lost_soldier', 'miner', 'mourning_widow', 'plague_doctor', 'shrouded',
  'sleepwalker', 'the_host', 'wailer',
];
const names = { idle: 'Idle_Loop', fly: 'Jog_Fwd_Loop', attack: 'Punch_Jab', hurt: 'Hit_Chest', die: 'Death01' };
const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
const models = new Map(), palettes = new Map();
const base = new URL('../../assets/PaleHours_PSX_Ghosts/models/', import.meta.url);
let animationSource;

function cached(cache, key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(error => {
    cache.delete(key);
    throw error;
  }));
  return cache.get(key);
}

export async function loadPaleHoursGhost(height, brute, rng = Math.random) {
  const id = 'pg_' + characters[Math.floor(rng() * characters.length)];
  const skin = Math.floor(rng() * 3);
  const key = `${id}_skin${skin}`;
  // All 14 rigs ship the same clips. Skin 1 and 2 GLBs omit animation data.
  const meshSkin = skin === 0 ? 1 : skin;
  const [model, library, palette] = await Promise.all([
    cached(models, `${id}_skin${meshSkin}`, () => loader.loadAsync(new URL(`${id}/${id}_skin${meshSkin}.glb`, base).href)),
    animationSource ??= loader.loadAsync(new URL('pg_ballerina/pg_ballerina_skin0.glb', base).href)
      .catch(error => { animationSource = null; throw error; }),
    skin === 0 ? cached(palettes, key, () => textureLoader.loadAsync(new URL(`${id}/textures/${key}.png`, base).href)) : null,
  ]);
  const clips = library.animations.filter(clip => Object.values(names).includes(clip.name));
  const asset = instantiateMonsterAsset({ scene: model.scene, animations: clips }, { scale: 1, idle: names.idle });
  // Synchronize the skin matrices before measuring the animated mesh.
  asset.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset.rig, true);
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = height / (bounds.max.y - bounds.min.y);
  asset.rig.scale.setScalar(scale);
  asset.rig.position.copy(center.multiplyScalar(-scale));
  asset.root.name = key;

  const materials = asset.meshes.map(mesh => {
    const material = mesh.material.clone();
    if (palette) {
      palette.colorSpace = THREE.SRGBColorSpace;
      palette.flipY = false;
      material.map = palette;
    }
    const map = material.map;
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestMipmapNearestFilter;
    map.needsUpdate = true;
    material.emissive.setHex(0x685563);
    material.emissiveMap = map;
    material.emissiveIntensity = brute ? 0.36 : 0.24;
    mesh.material = material;
    return material;
  });
  const byName = new Map(clips.map(clip => [clip.name, clip]));
  return {
    root: asset.root,
    update(name, dt, duration, loop, restart = false) {
      const clip = byName.get(names[name]);
      asset.animate(clip.name, dt, { once: !loop, rate: clip.duration / duration, restart });
    },
    dispose() {
      asset.root.removeFromParent();
      for (const material of materials) material.dispose();
      for (const mesh of asset.meshes) mesh.skeleton.dispose();
    },
  };
}
