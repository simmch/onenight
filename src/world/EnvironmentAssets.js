// Small, reusable 3D architectural assets that sit on top of the procedural
// boxes. They are intentionally low-poly and dark so they catch the flashlight
// without making the facilities feel clean or gamey.
import * as THREE from 'three';

const PALE = new THREE.Color(0xd6e0d6);
const AMBER = new THREE.Color(0xffb35c);
const RED = new THREE.Color(0xb93829);
const AQUA = new THREE.Color(0x55d9d0);
const DARK = new THREE.Color(0x18201f);
const RUST = new THREE.Color(0x47342d);

function hash(x, z, salt = 0) {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function createEnvironmentAssets({ scene, name }) {
  const chunks = new Map();
  const shared = {
    housing: new THREE.BoxGeometry(0.52, 0.085, 2.28),
    rim: new THREE.BoxGeometry(0.07, 0.11, 2.34),
    lens: new THREE.BoxGeometry(0.245, 0.045, 1.72),
    end: new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8),
    conduit: new THREE.CylinderGeometry(0.035, 0.035, 1.5, 7),
    seam: new THREE.BoxGeometry(0.035, 0.018, 3.55),
    patch: new THREE.BoxGeometry(0.22, 0.024, 0.22),
  };
  const materials = {
    housing: new THREE.MeshLambertMaterial({ color: DARK, roughness: 0.92, flatShading: true }),
    rim: new THREE.MeshLambertMaterial({ color: RUST, roughness: 0.98, flatShading: true }),
    floor: new THREE.MeshLambertMaterial({ color: 0x2c3431, roughness: 1, flatShading: true }),
    grime: new THREE.MeshLambertMaterial({ color: 0x0c1110, roughness: 1, flatShading: true }),
    dead: new THREE.MeshLambertMaterial({ color: 0x222726, roughness: 1, flatShading: true }),
    pale: new THREE.MeshLambertMaterial({ color: PALE, emissive: PALE, emissiveIntensity: 0.42, roughness: 0.5 }),
    amber: new THREE.MeshLambertMaterial({ color: AMBER, emissive: AMBER, emissiveIntensity: 0.52, roughness: 0.5 }),
    red: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.5, roughness: 0.5 }),
    aqua: new THREE.MeshLambertMaterial({ color: AQUA, emissive: AQUA, emissiveIntensity: 0.5, roughness: 0.5 }),
  };

  function matFor(kind) {
    return kind === 3 ? materials.red : kind === 6 ? materials.aqua : kind === 7 ? materials.amber : materials.pale;
  }

  function fixture(d, index, dead = false) {
    const [x, y, z, strength, kind] = d;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    // Most procedural ceiling lamps run along the z axis. A sparse quarter-turn
    // keeps long corridors from reading as a repeated texture stamp.
    const turn = hash(x, z, 4) > 0.72 ? Math.PI / 2 : 0;
    root.rotation.y = turn;
    const housing = new THREE.Mesh(shared.housing, materials.housing);
    housing.position.y = 0.055;
    root.add(housing);
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(shared.rim, materials.rim);
      rim.position.x = side * 0.24;
      rim.position.y = 0.075;
      root.add(rim);
    }
    const lens = new THREE.Mesh(shared.lens, dead ? materials.dead : matFor(kind));
    lens.position.y = 0.012;
    root.add(lens);
    for (const side of [-1, 1]) {
      const end = new THREE.Mesh(shared.end, materials.rim);
      end.rotation.z = Math.PI / 2;
      end.position.set(0, 0.055, side * 1.12);
      root.add(end);
    }
    // An exposed cable and a little junction box sell the fixture as an object
    // attached to the building instead of a bright rectangle on the ceiling.
    const cable = new THREE.Mesh(shared.conduit, materials.rim);
    cable.rotation.z = Math.PI / 2;
    cable.position.set((hash(x, z, 8) - 0.5) * 0.36, 0.135, 1.67);
    root.add(cable);
    const junction = new THREE.Mesh(shared.patch, materials.housing);
    junction.position.set(cable.position.x, 0.135, 2.37);
    root.add(junction);
    scene.add(root);
    return { root, lens, dead, strength: Math.max(0.35, strength), phase: hash(x, z, 12) * 9 + index * 0.37 };
  }

  function floorDressing(d, index, floorY = 0) {
    const [x, y, z, , kind] = d;
    const root = new THREE.Group();
    root.position.set(x, floorY + 0.012, z);
    root.rotation.y = hash(x, z, 19) > 0.5 ? Math.PI / 2 : 0;
    const seam = new THREE.Mesh(shared.seam, materials.floor);
    seam.position.set(0, 0, -1.72);
    root.add(seam);
    const grime = new THREE.Mesh(shared.patch, materials.grime);
    grime.scale.set(1.2 + hash(x, z, 23), 1, 0.7 + hash(x, z, 24) * 0.65);
    grime.position.set((hash(x, z, 20) - 0.5) * 1.4, 0.013, 0.86);
    root.add(grime);
    // Emergency/aqua fixtures get a corresponding stained reflection in the
    // nearest floor tile, barely visible until the player brings a beam in.
    if (kind === 3 || kind === 6) {
      const reflection = new THREE.Mesh(shared.patch, matFor(kind));
      reflection.material = reflection.material.clone();
      reflection.material.transparent = true;
      reflection.material.opacity = 0.12;
      reflection.position.set(0, 0.018, 0.35);
      reflection.scale.set(2.7, 1, 3.4);
      root.add(reflection);
    }
    scene.add(root);
    return root;
  }

  function mount(key, lights = [], details = [], boxes = {}) {
    if (chunks.has(key) || (!lights.length && !details.length)) return;
    const fixtures = [], floor = [];
    // Keep this conservative. A streamed chunk can contain many cells, but a
    // fixture every other cell gives the eye a physical rhythm without a mesh
    // explosion.
    const floorBox = boxes.interiorFloor || boxes.serviceFloor || boxes.trackFloor || boxes.liquid;
    const floorY = floorBox?.length >= 5 ? floorBox[1] + floorBox[4] / 2 : 0;
    for (let i = 0; i < lights.length; i += 5) {
      const d = lights.slice(i, i + 5);
      fixtures.push(fixture(d, i / 5));
      if (i % 10 === 0) floor.push(floorDressing(d, i / 5, floorY));
    }
    // Unpowered cells still receive a housing and cable run. Their lens is
    // opaque so the old dead-lamp box never reads like a missing asset.
    const dead = boxes.deadLamp || [];
    for (let i = 0; i < dead.length; i += 7) {
      const d = [dead[i], dead[i + 1], dead[i + 2], 0, 4];
      fixtures.push(fixture(d, 1000 + i / 7, true));
    }
    const root = new THREE.Group();
    // Meshes are already attached to the scene so they can remain independent
    // of the group transform; the group is retained as a lifecycle marker.
    chunks.set(key, { root, fixtures, floor });
  }

  function unmount(key) {
    const entry = chunks.get(key);
    if (!entry) return;
    // Geometry and materials are shared by every streamed chunk. Remove the
    // meshes here, but keep the shared GPU resources alive for the next chunk.
    for (const f of entry.fixtures) scene.remove(f.root);
    for (const f of entry.floor) scene.remove(f);
    chunks.delete(key);
  }

  function update(t, dt, playing) {
    if (!playing) return;
    for (const entry of chunks.values()) for (const f of entry.fixtures) {
      if (f.dead) continue;
      // A slow, irregular ballast flutter. It never fully blacks out the lamp;
      // the actual facility flicker still comes from MapLighting.
      const pulse = 0.86 + Math.sin(t * 2.7 + f.phase) * 0.08 + Math.sin(t * 11.2 + f.phase * 1.7) * 0.035;
      f.lens.material.emissiveIntensity = pulse * (0.34 + f.strength * 0.12);
    }
  }

  return { mount, unmount, update, chunks };
}
