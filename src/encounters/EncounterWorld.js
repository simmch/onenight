import * as THREE from 'three';
import { ObserverMovement } from '../observer/ObserverMovement.js';

const PLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(0.84, 1, 28).rotateX(-Math.PI / 2);
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Survey connected floor around the player, using the same door and cover tests as movement.
export function survey(world, origin, limit = 28) {
  const grid = world.grid;
  const size = grid?.CELL ?? 2.5;
  const i0 = grid ? grid.cellOf(origin.x) : 0, j0 = grid ? grid.cellOf(origin.z) : 0;
  const start = { x: origin.x, z: origin.z, i: i0, j: j0, steps: 0 };
  const points = [start], seen = new Set([i0 + ',' + j0]);
  const open = (a, b) => {
    if (world.losBlocked(a.x, a.z, b.x, b.z, true)) return false;
    const samples = Math.ceil(distance(a, b) / 0.5);
    for (let k = 1; k <= samples; k++) {
      const f = k / samples;
      if (!world.walkable(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, 0.32)) return false;
    }
    return true;
  };
  for (let n = 0; n < points.length; n++) {
    const a = points[n];
    if (a.steps * size >= limit) continue;
    for (const [di, dj] of DIRECTIONS) {
      const i = a.i + di, j = a.j + dj, key = i + ',' + j;
      if (seen.has(key) || (grid && (!world.cellWalkable(i, j) || (world.canStep && !world.canStep(a.i, a.j, i, j))))) continue;
      const b = { i, j, x: i * size + (grid ? 0 : origin.x), z: j * size + (grid ? 0 : origin.z), steps: a.steps + 1 };
      // Some authored cells have furniture in their centre. Try both shoulders of the passage.
      for (const offset of [0, 0.95, -0.95, 1.48, -1.48]) {
        const side = { ...b, x: b.x + dj * offset, z: b.z + di * offset };
        if (!open(a, side)) continue;
        seen.add(key);
        points.push(side);
        break;
      }
    }
  }
  // Small locked rooms still have enough room for a local puzzle.
  if (points.length < 12) for (const radius of [1, 2, 3, 4.4]) {
    for (let n = 0; n < 12; n++) {
      const a = n * Math.PI / 6;
      const b = { x: origin.x + Math.sin(a) * radius, z: origin.z + Math.cos(a) * radius, steps: 1 };
      if (points.every(p => distance(p, b) > 0.75) && open(origin, b)) points.push(b);
    }
  }
  return points;
}

export function createEncounterWorld({ scene, world, camera, atlas, atlasTexture, paintSprite, hooks }) {
  const stage = new THREE.Group();
  scene.add(stage);
  const palette = new Map(), billboards = [];
  const cached = (key, make) => {
    if (!palette.has(key)) palette.set(key, make());
    return palette.get(key);
  };
  const stock = (name) => cached(name, () => {
    const cell = (atlas.sprites[name] ?? atlas.sprites.crate)[0];
    const texture = atlasTexture.clone();
    texture.repeat.set(0.98 / atlas.cols, 0.98 / atlas.rows);
    texture.offset.set((cell % atlas.cols + 0.01) / atlas.cols, (atlas.rows - 1 - Math.floor(cell / atlas.cols) + 0.01) / atlas.rows);
    texture.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.47 });
  });
  const creature = (name, pose) => cached(name + '/' + pose, () => {
    const texture = paintSprite(name, pose);
    return new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.45, emissive: 0x1c1514 });
  });
  function prop(point, { art, name, width = 1, height = 1, lift = 0 } = {}) {
    const root = new THREE.Group();
    const skin = (art || name) && new THREE.Mesh(PLANE, art ? stock(art) : creature(name, 'still'));
    if (skin) {
      skin.scale.set(width, height, 1);
      skin.position.y = lift;
      root.add(skin);
      billboards.push(root);
    }
    const item = {
      x: point.x, z: point.z, root, skin, width, height,
      place(next) {
        item.x = next.x;
        item.z = next.z;
        root.position.set(next.x, world.groundY(next.x, next.z), next.z);
      },
      pose(pose) { if (name) skin.material = creature(name, pose); },
    };
    item.place(point);
    stage.add(root);
    return item;
  }
  function part(parent, color, x, y, z, w, h, d, glow = false) {
    const mat = cached(color + '/' + glow, () => glow ?
      new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    const model = new THREE.Mesh(BOX, mat);
    model.position.set(x, y, z);
    model.scale.set(w, h, d);
    parent.add(model);
    return model;
  }
  function mark(item, color, radius) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.68, depthWrite: false });
    const ring = new THREE.Mesh(RING, material);
    ring.position.y = 0.045;
    ring.scale.setScalar(radius);
    item.root.add(ring);
    return ring;
  }
  function lamp(item, color, intensity) {
    const light = new THREE.PointLight(color, intensity, 6, 1.65);
    light.position.y = 1.03;
    item.root.add(light);
    return light;
  }
  const clearLine = (a, b) => !world.losBlocked(a.x, a.z, b.x, b.z, true);
  function faced(a, p, threshold = 0.35) {
    const d = distance(a, p);
    return d < 0.62 || ((a.x - p.x) * -Math.sin(p.yaw) + (a.z - p.z) * -Math.cos(p.yaw)) / d > threshold;
  }
  const close = (item, p, radius = 2.1) => distance(item, p) < radius && faced(item, p) && clearLine(item, p);
  function seen(item, p, range = 30, cone = 0.91) {
    return distance(item, p) < range && faced(item, p, cone) && clearLine(item, p);
  }
  function move(item, dt, goal, speed) {
    item.motor ??= new ObserverMovement(world, 0.27);
    const pos = { x: item.x, z: item.z };
    const result = item.motor.update(dt, pos, goal, speed);
    item.place(pos);
    return result;
  }
  function ray(items, origin, dir, range, melee) {
    let nearest = null, best = range;
    for (const item of items) {
      if (!item.root.visible) continue;
      if (item.rayHit) {
        if (!clearLine(item, origin)) continue;
        const hit = item.rayHit(origin, dir, best, melee ? 0.32 : 0.08);
        if (hit) { best = hit.distanceTo(origin); nearest = item; }
        continue;
      }
      const dx = item.x - origin.x, dz = item.z - origin.z;
      const dy = item.root.position.y + item.height * 0.48 - origin.y;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0 || t > best || !clearLine(item, origin)) continue;
      if (Math.hypot(dx - t * dir.x, dz - t * dir.z) > item.width * 0.52 + (melee ? 0.32 : 0.08)) continue;
      if (Math.abs(dy - t * dir.y) > item.height * 0.51 + (melee ? 0.45 : 0.1)) continue;
      best = t;
      nearest = item;
    }
    return nearest;
  }
  function draw() {
    for (const root of billboards) root.rotation.y = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
  }
  function clear() {
    stage.traverse(o => {
      if (o.geometry === RING) o.material.dispose();
      if (o.isLight) o.dispose();
    });
    stage.clear();
    billboards.length = 0;
  }
  return { world, hooks, prop, part, mark, lamp, close, clearLine, seen, move, ray, draw, clear };
}

export function pickSites(points, origin, count, min = 5) {
  const result = [];
  const pool = points.filter(p => p.steps > 0);
  const take = (spread) => {
    let best = null, bestScore = -Infinity;
    for (const p of pool) {
      const d = distance(p, origin);
      if (result.includes(p) || (spread > 1 && (d < min || result.some(q => distance(p, q) < spread)))) continue;
      const spacing = Math.min(9, ...result.map(q => distance(p, q)));
      const score = spacing - Math.abs(d - (7 + result.length * 1.8)) * 0.58;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  };
  for (let i = 0; i < count; i++) result.push(take(3.8) || take(2) || take(0) || origin);
  return result;
}

export const press = (label, run) => ({ label: '[E] ' + label, run });
export const hold = (label, duration, run) => ({ label, duration, run });
