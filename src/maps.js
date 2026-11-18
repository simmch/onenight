import { createInteriorMap, INTERIOR_META } from './interiors/InteriorMaps.js';
import { BAYOU_META, createBayou } from './world/Bayou.js';
import { doorBounds, segmentHits } from './world/Cover.js';

// World generation for every map. Pure data (no rendering, no audio), so it can be checked in Node.
// A chunk is: props/glow [x, z, width, height, cell, sway, y] billboards (glow = self-lit), col [x, z, r] circle colliders,
// aabb [x0, z0, x1, z1] wall colliders, boxes {layer: [x, y, z, sx, sy, sz, rotY]}, lights [x, y, z, strength, kind],
// vents [x, z, period, phase], doors, houses [x0, z0, x1, z1] interiors, secrets (sealed cave walls) and one optional chest.

export const MAP_NAMES = ['forest', 'rural', 'cave', 'snow', 'hell', 'labyrinth', 'swamp', ...Object.keys(INTERIOR_META)];
export const MAP_META = {
  forest: { label: 'THE FOG-SHROUDED PINES', fog: 0x030708, fogDensity: 0.075, beamRange: 24, ambient: [0x000000, 0], eerie: 1, weather: null,
            ground: ['#394132', '#414637', '#34392d', '#423f30', '#36372d', '#4b4231'],
            hint: 'Trees break sightlines. The logging winch opens a path across the old cut.' },
  rural:  { label: 'THE OUTSKIRTS', fog: 0x000000, fogDensity: 0.045, ambient: [0x000000, 0], eerie: 0.45, weather: 'rain',
            ground: ['#3d4a2e', '#46523a', '#38412b', '#4b4634', '#3f4a30', '#54503a'] },
  cave:   { label: 'THE CAVES', fog: 0x000000, fogDensity: 0.05, ambient: [0x000000, 0], eerie: 0, weather: 'drips', ceiling: 4.4,
            ground: ['#55555e', '#62616b', '#4b4b55', '#6a655c', '#585762', '#726b62'] },
  snow:   { label: 'THE MOUNTAIN', fog: 0x04060a, fogDensity: 0.05, ambient: [0x000000, 0], eerie: 0.35, weather: 'snow', terrain: true,
            ground: ['#cfd9e6', '#dfe7f0', '#c2cedd', '#e9eff5', '#d5deea', '#b9c6d8'] },
  hell:   { label: 'HELL', fog: 0x0b0100, fogDensity: 0.042, ambient: [0xff3a14, 0.12], eerie: 0, weather: 'embers',
            ground: ['#57302a', '#653a30', '#472620', '#70402e', '#532e27', '#7a462c'] },
  labyrinth: { label: 'THE LABYRINTH', fog: 0x000000, fogDensity: 0.05, ambient: [0x000000, 0], eerie: 0.7, weather: null, ceiling: 4.2,
            ground: ['#4c4844', '#57524c', '#423f3b', '#5e574e', '#4a4541', '#655c50'] },
  swamp: BAYOU_META, ...INTERIOR_META,
};
export const SOLID = 0, FLOOR = 1, LIQUID = 2, SECRET = 3;

export function createMap(name, env) {
  if (Object.hasOwn(INTERIOR_META, name)) return createInteriorMap(name, env);
  if (name === 'swamp') return createBayou(env);
  const { seed, S, atlas, hash2, mulberry, noise, chestChance } = env;
  const meta = MAP_META[name];
  const key = (a, b) => a + ',' + b;
  const kinds = atlas.sprites;
  const has = (k) => !!(kinds[k] && kinds[k].length);
  const pick = (r, ...names) => { for (const n of names) if (has(n)) return kinds[n][(r() * kinds[n].length) | 0]; return 0; };
  const rngFor = (a, b, salt) => mulberry((hash2(a, b, salt) * 4294967296) | 0);
  const blank = () => ({ props: [], glow: [], col: [], aabb: [], chest: null, boxes: {}, lights: [], vents: [], doors: [], houses: [], secrets: [], cameraWords: [] });
  const box = (c, layer, x, y, z, sx, sy, sz, rot = 0) => (c.boxes[layer] ||= []).push(x, y, z, sx, sy, sz, rot);
  // billboard helpers: kind names fall back left to right; a missing kind is skipped
  const put = (c, r, names, x, z, w, h, rad = 0, sway = 0, y = 0) => {
    const list = [].concat(names); if (!list.some(has)) return false;
    c.props.push(x, z, w, h, pick(r, ...list), sway, y); if (rad) c.col.push(x, z, rad); return true;
  };
  const lit = (c, r, names, x, z, w, h, y = 0, sway = 0.01) => { const list = [].concat(names); if (list.some(has)) c.glow.push(x, z, w, h, pick(r, ...list), sway, y); };

  // ── chests on open ground: one a short walk ahead of the spawn point, the rest scattered ──
  const spawnChest = (() => {
    const r = mulberry(seed ^ 0xc4e5), a = (r() - 0.5) * 0.9, d = name === 'labyrinth' ? 4.2 : 9 + r() * 2;   // the labyrinth's first room is small
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    return { x, z, cx: Math.floor(x / S), cz: Math.floor(z / S) };
  })();
  const isSpawnChunk = (cx, cz) => cx === spawnChest.cx && cz === spawnChest.cz;
  function chestTier(cx, cz) {
    if (isSpawnChunk(cx, cz)) return 'common';
    const roll = rngFor(cx, cz, 11)();
    if (roll < 0.03) return 'armory';
    return roll < 0.075 ? 'red' : roll < 0.25 ? 'blue' : 'common';
  }
  function openChest(cx, cz) {
    if (isSpawnChunk(cx, cz)) return { x: spawnChest.x, z: spawnChest.z, id: key(cx, cz), tier: 'common' };
    if (hash2(cx, cz, 9) >= chestChance) return null;
    const r = rngFor(cx, cz, 10);
    const x = (cx + 0.15 + r() * 0.7) * S, z = (cz + 0.15 + r() * 0.7) * S;
    return x * x + z * z < 14 * 14 ? null : { x, z, id: key(cx, cz), tier: chestTier(cx, cz) };
  }

  // ───────────────────────── forest ─────────────────────────
  const forestCover = new Map();
  const forestDoor = { W: 4, H: 2.55, T: 0.16 };
  function forestChunk(cx, cz) {
    const c = blank(), r = rngFor(cx, cz, 1), ox = cx * S, oz = cz * S;
    c.cover = []; c.controls = [];
    const add = (x, z, w, h, cell, sway, rad) => { c.props.push(x, z, w, h, cell, sway, 0); if (rad) c.col.push(x, z, rad); };
    const chest = c.chest = openChest(cx, cz);
    if (chest) c.col.push(chest.x, chest.z, 0.4);
    const nearChestSq = (x, z) => chest ? (x - chest.x) ** 2 + (z - chest.z) ** 2 : Infinity;
    const G = S / 6;
    for (let i = 0; i < S / G; i++) for (let j = 0; j < S / G; j++) {
      const x = ox + (i + 0.15 + r() * 0.7) * G, z = oz + (j + 0.15 + r() * 0.7) * G;
      const density = noise(x, z, 31, 2);
      if (r() > (density < 0.38 ? 0.035 : 0.34 + density * 0.72)) continue;
      if (x * x + z * z < 16) continue;                   // keep spawn clear
      const loggingZ = Math.round((z + 15) / 80) * 80 - 15, loggingX = Math.round(x / 80) * 80;
      if (Math.abs(x - loggingX) < 2.35 && Math.abs(z - loggingZ) < 13) continue;
      if (nearChestSq(x, z) < 6) continue;                // and leave a small clearing around a chest
      const roll = r();
      if (roll < 0.1) {
        const h = 4 + r() * 3; add(x, z, h * 0.95, h, pick(r, 'dead'), 0.004, 0.3);
        if (hash2(Math.floor(x), Math.floor(z), 79) < 0.012) c.cameraWords.push({ id: `forest:${Math.floor(x)},${Math.floor(z)}:birthday`, x, y: 1.8, z: z + 0.18, rotation: 0, line: (hash2(x, z, 80) * 4) | 0, chalk: hash2(x, z, 81) > 0.52 });
      }
      else {
        const h = 7 + r() * 6, width = 0.32 + h * 0.036;
        add(x, z, h * 0.58, h, pick(r, roll < 0.52 ? 'fir' : 'pine'), 0.007, 0.52 * width);
        box(c, 'bark', x, h * 0.19, z, width, h * 0.39, width, r() * Math.PI);
        c.cover.push(x - width / 2, z - width / 2, x + width / 2, z + width / 2);
      }
    }
    const gx = Math.round((ox + S / 2) / 80) * 80, gz = Math.round((oz + S / 2 + 15) / 80) * 80 - 15;
    const owns = (x, z) => x >= ox && x < ox + S && z >= oz && z < oz + S;
    const gate = `logging:${gx},${gz}`;
    if (owns(gx, gz)) {
      c.doors.push({ id: gate, x: gx, y: 0, z: gz, along: 'x', style: 'wood', mode: 'locked' });
      for (const side of [-1, 1]) {
        box(c, 'bark', gx + 2.08 * side, 1.6, gz, 0.29, 3.2, 0.3);
        box(c, 'wood', gx + 4.55 * side, 1.03, gz, 5.1, 2.06, 0.16);
        c.aabb.push(gx + 4.55 * side - 2.55, gz - 0.08, gx + 4.55 * side + 2.55, gz + 0.08);
      }
    }
    if (owns(gx + 1.48, gz + 3)) {
      c.controls.push({ target: gate, x: gx + 1.48, y: 0, z: gz + 3, label: 'Crank the logging winch' });
      put(c, r, 'sign', gx + 1.8, gz + 4, 0.8, 1.68);
    }
    // stumps and boulders
    for (let n = 0; n < 3; n++) {
      const x = ox + r() * S, z = oz + r() * S;
      if (x * x + z * z < 9) continue;
      if (r() < 0.5) { const s = 0.7 + r() * 0.4; add(x, z, s, s, pick(r, 'stump'), 0, 0.3); }
      else { const s = 0.7 + r() * 1.0; add(x, z, s * 1.2, s, pick(r, 'boulder'), 0, s * 0.45); }
    }
    // tall grass: thick in patches, sparse elsewhere
    for (let n = 0; n < 420; n++) {
      const x = ox + r() * S, z = oz + r() * S;
      const patch = noise(x, z, 11, 4) * 0.7 + noise(x, z, 4, 5) * 0.3;
      if (r() > (patch - 0.32) * 2.6) continue;
      if (nearChestSq(x, z) < 3.2) continue;
      if (x * x + z * z < 5) continue;                    // none on top of the spawn point, where the cutscene camera lies
      if (Math.abs(x) < 1.3 && z > -13 && z < 0) continue;
      const h = 0.8 + r() * 0.5 + patch * 0.6;
      add(x, z, 0.8 + r() * 0.5, h, pick(r, r() < 0.2 ? 'drygrass' : 'grass'), 0.05 + r() * 0.05, 0);
    }
    if (forestCover.size >= 400 && !forestCover.has(key(cx, cz))) forestCover.clear();
    forestCover.set(key(cx, cz), { cover: c.cover, aabb: c.aabb, doors: c.doors });
    return c;
  }
  function forestBlocked(x0, z0, x1, z1, opened, swallowed) {
    for (let a = Math.floor((Math.min(x0, x1) - 8) / S); a <= Math.floor((Math.max(x0, x1) + 8) / S); a++) {
      for (let b = Math.floor(Math.min(z0, z1) / S); b <= Math.floor(Math.max(z0, z1) / S); b++) {
        const chunk = forestCover.get(key(a, b)) || forestChunk(a, b);
        for (const list of [chunk.cover, chunk.aabb]) for (let i = 0; i < list.length; i += 4) {
          if (swallowed?.((list[i] + list[i + 2]) / 2, (list[i + 1] + list[i + 3]) / 2)) continue;
          if (segmentHits(x0, z0, x1, z1, list[i], list[i + 1], list[i + 2], list[i + 3])) return true;
        }
        if (chunk.doors.some((d) => !opened?.has(d.id) && !swallowed?.(d.x, d.z) && segmentHits(x0, z0, x1, z1, ...doorBounds(d, forestDoor)))) return true;
      }
    }
    return false;
  }

  // ───────────────────────── snow mountain ─────────────────────────
  const snowY = (x, z) => (noise(x, z, 150, 21) - 0.5) * 26 + (noise(x, z, 46, 22) - 0.5) * 7 + (noise(x, z, 13, 23) - 0.5) * 1.1;
  function snowChunk(cx, cz) {
    const c = blank(), r = rngFor(cx, cz, 1), ox = cx * S, oz = cz * S;
    const Y = (x, z) => snowY(x, z) - 0.12;
    const chest = c.chest = openChest(cx, cz);
    if (chest) c.col.push(chest.x, chest.z, 0.4);
    const nearChestSq = (x, z) => chest ? (x - chest.x) ** 2 + (z - chest.z) ** 2 : Infinity;
    const G = 4;
    for (let i = 0; i < S / G; i++) for (let j = 0; j < S / G; j++) {
      const x = ox + (i + 0.15 + r() * 0.7) * G, z = oz + (j + 0.15 + r() * 0.7) * G;
      const density = noise(x, z, 44, 2);
      if (r() > 0.12 + density * 0.7) continue;
      if (x * x + z * z < 16 || nearChestSq(x, z) < 6) continue;
      if (r() < 0.16) {
        const h = 4 + r() * 3; put(c, r, ['snowdead', 'dead'], x, z, h * 0.95, h, 0.3, 0.004, Y(x, z));
        if (hash2(Math.floor(x), Math.floor(z), 82) < 0.018) c.cameraWords.push({ id: `snow:${Math.floor(x)},${Math.floor(z)}:birthday`, x, y: Y(x, z) + 1.8, z: z + 0.18, rotation: 0, line: (hash2(x, z, 83) * 4) | 0, chalk: true });
      }
      else { const h = 6 + r() * 5; put(c, r, ['snowtree', 'fir'], x, z, h * 0.74, h, 0.35, 0.007, Y(x, z)); }
    }
    for (let n = 0; n < 5; n++) {
      const x = ox + r() * S, z = oz + r() * S, roll = r();
      if (x * x + z * z < 12 || nearChestSq(x, z) < 4) continue;
      if (roll < 0.34) { const s = 1.1 + r() * 1.2; put(c, r, ['snowrock', 'boulder'], x, z, s * 1.2, s, s * 0.45, 0, Y(x, z)); }
      else if (roll < 0.58) { const h = 1.2 + r() * 1.6; put(c, r, 'ice', x, z, h * 0.8, h, 0.4, 0, Y(x, z)); }
      else if (roll < 0.8) put(c, r, ['snowlog', 'stump'], x, z, 1.7, 0.9, 0.5, 0, Y(x, z));
      else if (roll < 0.9) put(c, r, 'snowman', x, z, 1.2, 1.6, 0.4, 0, Y(x, z));
      else if (roll < 0.95) put(c, r, 'sled', x, z, 1.4, 0.6, 0, 0, Y(x, z));
      else if (roll < 0.975) put(c, r, 'snowmobile', x, z, 2.1, 1.3, 0.8, 0, Y(x, z));
      else put(c, r, 'igloo', x, z, 4.2, 3.0, 1.6, 0, Y(x, z));
    }
    for (let n = 0; n < 70; n++) {       // drifts, and dry grass poking through
      const x = ox + r() * S, z = oz + r() * S;
      const patch = noise(x, z, 12, 4);
      if (r() > (patch - 0.38) * 2.2 || x * x + z * z < 5 || nearChestSq(x, z) < 3.2) continue;
      if (r() < 0.45) put(c, r, 'snowpile', x, z, 1.3 + r() * 0.8, 0.7 + r() * 0.5, 0, 0, Y(x, z));
      else put(c, r, 'drygrass', x, z, 0.8, 0.7 + r() * 0.4, 0, 0.05, Y(x, z));
    }
    return c;
  }

  // ───────────────────────── rural: streets, houses with doors ─────────────────────────
  const BLOCK = 64, ROAD = 3.5, WALL_T = 0.3, WALL_H = 3, DOOR_W = 1.3, DOOR_H = 2.2;
  const roadDist = (v) => { const m = v - Math.floor(v / BLOCK) * BLOCK; return Math.min(m, BLOCK - m); };   // to the nearest road centre line
  const blockCache = new Map();
  function housesOf(bx, bz) {
    const k = key(bx, bz); let out = blockCache.get(k); if (out) return out;
    out = []; const ox = bx * BLOCK, oz = bz * BLOCK;
    [['s', 15], ['s', 32], ['s', 49], ['n', 15], ['n', 32], ['n', 49], ['w', 32], ['e', 32]].forEach(([side, at], n) => {
      const r = rngFor(bx * 8 + n, bz, 50);
      if (r() > 0.62) return;
      const w = 8 + r() * 3, d = 7 + r() * 2, set = 8 + r() * 1.5;
      let x0, z0, x1, z1;
      if (side === 's') { x0 = ox + at - w / 2; x1 = x0 + w; z0 = oz + set; z1 = z0 + d; }
      if (side === 'n') { x0 = ox + at - w / 2; x1 = x0 + w; z1 = oz + BLOCK - set; z0 = z1 - d; }
      if (side === 'w') { z0 = oz + at - w / 2; z1 = z0 + w; x0 = ox + set; x1 = x0 + d; }
      if (side === 'e') { z0 = oz + at - w / 2; z1 = z0 + w; x1 = ox + BLOCK - set; x0 = x1 - d; }
      const id = `h${bx},${bz},${n}`, off = (r() - 0.5) * (w - 3.4), off2 = (r() - 0.5) * (w - 3.4), back = r() < 0.35;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, doors = [];
      // wall: 'z0' | 'z1' (run along x) or 'x0' | 'x1' (run along z); inward points into the house
      const door = (wall, t, n2) => doors.push({ id: id + 'd' + n2, wall, t,
        along: wall[0] === 'z' ? 'x' : 'z', inward: wall[1] === '0' ? 1 : -1,
        x: wall[0] === 'z' ? t : (wall === 'x0' ? x0 : x1), z: wall[0] === 'z' ? (wall === 'z0' ? z0 : z1) : t });
      const front = { s: 'z0', n: 'z1', w: 'x0', e: 'x1' }[side], rear = { s: 'z1', n: 'z0', w: 'x1', e: 'x0' }[side];
      door(front, (front[0] === 'z' ? mx : mz) + off, 0);
      if (back) door(rear, (rear[0] === 'z' ? mx : mz) + off2, 1);
      out.push({ id, side, x0, z0, x1, z1, mx, mz, doors, seed: (hash2(bx * 8 + n, bz, 51) * 4294967296) | 0 });
    });
    blockCache.set(k, out); return out;
  }
  function buildHouse(c, h) {
    const { x0, z0, x1, z1, mx, mz } = h, T = WALL_T, r = mulberry(h.seed);
    for (const wall of ['z0', 'z1', 'x0', 'x1']) {
      const alongX = wall[0] === 'z', fixed = { z0, z1, x0, x1 }[wall];
      const a = (alongX ? x0 : z0) - T / 2, b = (alongX ? x1 : z1) + T / 2;
      const seg = (p, q, y0, y1) => {
        if (q - p < 0.05) return;
        if (alongX) box(c, 'hwall', (p + q) / 2, (y0 + y1) / 2, fixed, q - p, y1 - y0, T); else box(c, 'hwall', fixed, (y0 + y1) / 2, (p + q) / 2, T, y1 - y0, q - p);
        if (y0 < 1) { if (alongX) c.aabb.push(p, fixed - T / 2, q, fixed + T / 2); else c.aabb.push(fixed - T / 2, p, fixed + T / 2, q); }
      };
      const gaps = h.doors.filter(d => d.wall === wall).map(d => d.t).sort((p, q) => p - q);
      let from = a;
      for (const g of gaps) { seg(from, g - DOOR_W / 2, 0, WALL_H); seg(g - DOOR_W / 2, g + DOOR_W / 2, DOOR_H, WALL_H); from = g + DOOR_W / 2; }
      seg(from, b, 0, WALL_H);
      // one window per wall, clear of the doors
      const len = b - a, wt = a + len * (0.25 + r() * 0.5);
      if (len > 5 && !gaps.some(g => Math.abs(g - wt) < 1.9)) {
        if (alongX) box(c, 'window', wt, 1.65, fixed, 1.1, 0.95, T + 0.06); else box(c, 'window', fixed, 1.65, wt, T + 0.06, 0.95, 1.1);
      }
    }
    for (const d of h.doors) c.doors.push(d);
    box(c, 'floor', mx, 0.03, mz, x1 - x0, 0.06, z1 - z0);
    box(c, 'roof', mx, WALL_H + 0.13, mz, x1 - x0 + 1.1, 0.26, z1 - z0 + 1.1);
    c.houses.push(x0 + T / 2, z0 + T / 2, x1 - T / 2, z1 - T / 2);

    // A few homes carry marks left by the birthday boy. They are just map data until the
    // upgraded video camera's light finds them; the renderer owns the handwriting texture.
    if (r() < 0.2) {
      const walls = ['z0', 'z1', 'x0', 'x1'].filter((wall) => !h.doors.some((d) => d.wall === wall));
      if (walls.length) {
        const wall = walls[(r() * walls.length) | 0], alongX = wall[0] === 'z';
        const inward = wall[1] === '0' ? 1 : -1;
        const x = alongX ? mx : (wall === 'x0' ? x0 : x1) + inward * 0.17;
        const z = alongX ? (wall === 'z0' ? z0 : z1) + inward * 0.17 : mz;
        c.cameraWords.push({ id: `${h.id}:birthday`, x, y: 1.52, z,
          rotation: wall === 'z0' ? 0 : wall === 'z1' ? Math.PI : wall === 'x0' ? Math.PI / 2 : -Math.PI / 2,
          line: (hash2(h.seed, 0, 94) * 4) | 0, chalk: hash2(h.seed, 1, 94) > 0.52 });
      }
    }

    // chest and furniture
    const placed = [];
    const free = (x, z, gap) => !placed.some(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 < gap * gap) && !h.doors.some(d => (d.x - x) ** 2 + (d.z - z) ** 2 < 2.0 * 2.0);
    if (r() < 0.7 && !c.chest) {
      const x = mx + (r() - 0.5) * (x1 - x0 - 3.4), z = mz + (r() - 0.5) * (z1 - z0 - 3.4);
      c.chest = { x, z, id: h.id }; c.col.push(x, z, 0.4); placed.push([x, z]);
    }
    const FURN = [['bed', 2.0, 1.1, 0.7], ['table', 1.5, 1.0, 0.55], ['chair', 0.8, 1.1, 0.3], ['armchair', 1.3, 1.1, 0.5], ['shelf', 1.2, 2.0, 0.45],
                  ['cabinet', 1.1, 1.7, 0.45], ['clock', 0.7, 2.1, 0.25], ['fireplace', 1.6, 1.6, 0.6], ['stove', 1.0, 1.5, 0.45], ['tv', 1.0, 0.9, 0.4],
                  ['bath', 1.5, 1.0, 0.55], ['floorlamp', 0.6, 1.8, 0.15], ['crib', 1.2, 1.1, 0.5], ['piano', 1.5, 1.4, 0.6], ['mirror', 0.7, 1.7, 0.25]];
    for (let n = 0, want = 4 + ((r() * 4) | 0); n < 14 && want > 0; n++) {
      const [kind, w, hh, rad] = FURN[(r() * FURN.length) | 0], inset = Math.max(0.75, w * 0.42), side = (r() * 4) | 0, t = 0.12 + r() * 0.76;
      const x = side === 0 ? x0 + inset : side === 1 ? x1 - inset : x0 + (x1 - x0) * t;
      const z = side === 2 ? z0 + inset : side === 3 ? z1 - inset : z0 + (z1 - z0) * t;
      if (!free(x, z, 1.5)) continue;
      if (put(c, r, kind, x, z, w, hh, rad, 0, 0.06)) { placed.push([x, z]); want--; }
    }
    if (r() < 0.5) {     // a picture on a wall
      const t = 0.2 + r() * 0.6; put(c, r, 'painting', x0 + (x1 - x0) * t, z1 - 0.35, 0.8, 0.8, 0, 0, 1.25);
    }
    if (r() < 0.3) {     // someone left a candle burning
      const x = mx + (r() - 0.5) * 2, z = mz + (r() - 0.5) * 2;
      if (free(x, z, 0.8)) { lit(c, r, 'candle', x, z, 0.3, 0.42, 0, 0); c.lights.push(x, 0.5, z, 0.3, 0); }
    }
    // front step: mailbox, bins, a pumpkin
    const f = h.doors[0], ox = f.along === 'x' ? 0 : -f.inward, oz = f.along === 'x' ? -f.inward : 0;   // outward from the front door
    const px = -oz, pz = ox;                                                                             // along the wall
    put(c, r, 'mailbox', f.x + ox * 3.4 + px * 1.3, f.z + oz * 3.4 + pz * 1.3, 0.8, 1.1, 0.15);
    if (r() < 0.6) put(c, r, ['trashcan', 'trashbag'], f.x + ox * 0.8 - px * 2.2, f.z + oz * 0.8 - pz * 2.2, 0.8, 1.0, 0.3);
    if (r() < 0.3) put(c, r, 'pumpkin', f.x + ox * 0.7 + px * 1.2, f.z + oz * 0.7 + pz * 1.2, 0.5, 0.5);
    if (r() < 0.25) put(c, r, 'gnome', f.x + ox * 2.2 - px * 1.6, f.z + oz * 2.2 - pz * 1.6, 0.5, 0.65);
    if (r() < 0.45) for (let t = -3; t <= 3; t++) {      // a run of fence either side of the path
      if (Math.abs(t) < 1) continue;
      put(c, r, 'fence', f.x + ox * 2.6 + px * t * 1.5, f.z + oz * 2.6 + pz * t * 1.5, 1.6, 1.2, 0.5);
    }
  }
  function ruralChunk(cx, cz) {
    const c = blank(), r = rngFor(cx, cz, 1), ox = cx * S, oz = cz * S;
    const inside = (x, z) => x >= ox && x < ox + S && z >= oz && z < oz + S;
    // roads: one strip along each block line, plus centre dashes
    const kx = Math.round((ox + S / 2) / BLOCK) * BLOCK, kz = Math.round((oz + S / 2) / BLOCK) * BLOCK;
    const ax = Math.max(ox, kx - ROAD), bx2 = Math.min(ox + S, kx + ROAD), az = Math.max(oz, kz - ROAD), bz2 = Math.min(oz + S, kz + ROAD);
    const onX = bx2 > ax, onZ = bz2 > az;
    if (onX) box(c, 'road', (ax + bx2) / 2, 0.010, oz + S / 2, bx2 - ax, 0.02, S);
    if (onZ) box(c, 'road', ox + S / 2, 0.012, (az + bz2) / 2, S, 0.024, bz2 - az);
    if (onX && ox === kx) for (let z = oz + 2; z < oz + S; z += 4) if (roadDist(z) > 5.5) box(c, 'paint', kx, 0.03, z, 0.16, 0.012, 1.8);
    if (onZ && oz === kz) for (let x = ox + 2; x < ox + S; x += 4) if (roadDist(x) > 5.5) box(c, 'paint', x, 0.03, kz, 1.8, 0.012, 0.16);

    const bx = Math.floor(ox / BLOCK), bz = Math.floor(oz / BLOCK), hs = housesOf(bx, bz);
    if (isSpawnChunk(cx, cz)) { c.chest = { x: spawnChest.x, z: spawnChest.z, id: key(cx, cz) }; c.col.push(spawnChest.x, spawnChest.z, 0.4); }
    for (const h of hs) if (Math.floor(h.mx / S) === cx && Math.floor(h.mz / S) === cz) buildHouse(c, h);
    const clear = (x, z, road, house) => roadDist(x) > ROAD + road && roadDist(z) > ROAD + road &&
      !hs.some(h => x > h.x0 - house && x < h.x1 + house && z > h.z0 - house && z < h.z1 + house) && x * x + z * z > 30;

    // street furniture
    for (const sx of [-1, 1]) {
      for (let z = Math.ceil((oz - 16) / 32) * 32 + 16; z < oz + S; z += 32) { const x = kx + sx * 4.4; if (inside(x, z) && sx === (Math.floor(z / 32) % 2 ? 1 : -1)) put(c, r, 'lamppost', x, z, 1.4, 4.2, 0.15); }
      for (let x = Math.ceil((ox - 16) / 32) * 32 + 16; x < ox + S; x += 32) { const z = kz + sx * 4.4; if (inside(x, z) && sx === (Math.floor(x / 32) % 2 ? 1 : -1)) put(c, r, 'lamppost', x, z, 1.4, 4.2, 0.15); }
    }
    if (inside(kx + 4.6, kz + 4.6)) put(c, r, 'sign', kx + 4.6, kz + 4.6, 1.0, 2.2, 0.1);
    if (inside(kx - 4.6, kz - 4.6) && r() < 0.5) put(c, r, ['hydrant', 'phonebooth'], kx - 4.6, kz - 4.6, 0.7, 0.9, 0.25);
    if ((onX || onZ) && r() < 0.22) {       // something abandoned on the road
      const along = ox + 2 + r() * (S - 4), alongZ = oz + 2 + r() * (S - 4), lane = (r() < 0.5 ? -1 : 1) * 1.9;
      const x = onX ? kx + lane : along, z = onX ? alongZ : kz + lane;
      if (inside(x, z) && x * x + z * z > 150 && roadDist(onX ? z : x) > 8) {
        if (r() < 0.6) put(c, r, 'car', x, z, 4.0, 2.0, 1.2); else put(c, r, ['barrier', 'tire', 'bicycle'], x, z, 1.3, 1.0, 0.4);
      }
    }
    // yards: trees on a jittered grid, the odd bit of clutter, then grass
    const G = 4;
    for (let i = 0; i < S / G; i++) for (let j = 0; j < S / G; j++) {
      const x = ox + (i + 0.15 + r() * 0.7) * G, z = oz + (j + 0.15 + r() * 0.7) * G, roll = r(), kind = r();
      if (roll > 0.2 || !clear(x, z, 1.8, 2.2)) continue;
      if (kind < 0.18) {
        const h = 4 + r() * 3; put(c, r, ['yarddead', 'haunted', 'dead'], x, z, h, h, 0.3, 0.004);
        if (hash2(Math.floor(x), Math.floor(z), 84) < 0.035) c.cameraWords.push({ id: `rural-tree:${Math.floor(x)},${Math.floor(z)}:birthday`, x, y: 1.8, z: z + 0.18, rotation: 0, line: (hash2(x, z, 85) * 4) | 0, chalk: hash2(x, z, 86) > 0.52 });
      }
      else if (kind < 0.3) { const h = 6 + r() * 3; put(c, r, 'fir', x, z, h * 0.72, h, 0.35, 0.006); }
      else { const h = 5 + r() * 3.5; put(c, r, ['yardtree', 'oak'], x, z, h, h, 0.4, 0.005); }
    }
    const CLUTTER = [['barrel', 0.8, 1.0, 0.35], ['crate', 0.9, 0.9, 0.4], ['well', 1.8, 1.9, 0.8], ['scarecrow', 1.6, 2.2, 0.3], ['haybale', 1.3, 1.2, 0.55],
                     ['wheelbarrow', 1.3, 0.9, 0.4], ['firewood', 1.4, 0.9, 0.5], ['outhouse', 1.4, 2.3, 0.6], ['doghouse', 1.2, 1.1, 0.5], ['bench', 1.6, 1.0, 0.5],
                     ['dumpster', 2.2, 1.6, 0.9], ['tire', 0.8, 0.8, 0], ['log', 1.6, 0.8, 0.5], ['hedge', 1.4, 1.1, 0.5]];
    for (let n = 0; n < 3; n++) {
      const x = ox + r() * S, z = oz + r() * S, [kind, w, h, rad] = CLUTTER[(r() * CLUTTER.length) | 0];
      if (r() < 0.6 && clear(x, z, 1.2, 1.6)) put(c, r, kind, x, z, w, h, rad);
    }
    for (let n = 0; n < 200; n++) {
      const x = ox + r() * S, z = oz + r() * S;
      const patch = noise(x, z, 11, 4) * 0.7 + noise(x, z, 4, 5) * 0.3;
      if (r() > (patch - 0.36) * 2.4 || !clear(x, z, 0.3, 0.6)) continue;
      const roll = r();
      if (roll < 0.08) put(c, r, ['bush', 'deadbush'], x, z, 1.2, 1.0, 0, 0.02);
      else put(c, r, roll < 0.3 ? 'drygrass' : 'grass', x, z, 0.8 + r() * 0.5, 0.7 + r() * 0.5 + patch * 0.4, 0, 0.05 + r() * 0.05);
    }
    return c;
  }

  // ───────────────────────── cave and hell: rooms joined by long straight hallways ─────────────────────────
  // Regions of REG x REG cells each hold one room; every room is tunnelled to the rooms east and south of it, so the
  // whole infinite cave is connected. Lake rooms are flooded in the middle. Some regions hide a sealed side chamber.
  const CELL = 4, REG = 12, HALF = REG / 2;
  const P = name === 'hell'
    ? { lake: 0.42, wide: true, ceiling: 0, secret: 0.25, torch: 0, vent: 0.075, wallMin: 3.4, wallVar: 4.5, cracks: 0.07 }
    : { lake: 0.32, wide: false, ceiling: 4.4, secret: 0.85, torch: 0.04, vent: 0, wallMin: 4.4, wallVar: 0, cracks: 0 };
  const regions = new Map();
  function roomOf(rx, rz) {
    if (rx === 0 && rz === 0) return { ci: 0, cj: 0, rad: 3.3, lake: false };
    const r = rngFor(rx, rz, 31), lake = r() < P.lake, m = lake ? 4 : 3;      // lakes sit nearer the middle so they fit
    return { ci: rx * REG - HALF + m + ((r() * (REG - 2 * m + 1)) | 0), cj: rz * REG - HALF + m + ((r() * (REG - 2 * m + 1)) | 0), rad: lake ? 3.5 + r() * 1.0 : 1.5 + r() * 1.6, lake };
  }
  function lpath(a, b, hFirst) {       // cell list from a to b with one bend
    const out = []; let i = a.ci, j = a.cj;
    const runI = () => { while (i !== b.ci) { out.push(i, j); i += Math.sign(b.ci - i); } };
    const runJ = () => { while (j !== b.cj) { out.push(i, j); j += Math.sign(b.cj - j); } };
    if (hFirst) { runI(); runJ(); } else { runJ(); runI(); }
    out.push(i, j); return out;
  }
  function region(rx, rz) {
    const k = key(rx, rz); let R = regions.get(k); if (R) return R;
    const bi = rx * REG - HALF, bj = rz * REG - HALF, g = new Uint8Array(REG * REG), spawn = rx === 0 && rz === 0;
    const inR = (i, j) => i >= bi && i < bi + REG && j >= bj && j < bj + REG;
    const at = (i, j) => inR(i, j) ? g[(j - bj) * REG + (i - bi)] : -1;
    const set = (i, j, t) => { if (inR(i, j)) g[(j - bj) * REG + (i - bi)] = t; };
    const me = roomOf(rx, rz);
    for (let j = bj; j < bj + REG; j++) for (let i = bi; i < bi + REG; i++) {
      const d = Math.hypot(i - me.ci, j - me.cj) + hash2(i, j, 33) * 0.5;
      if (d >= me.rad) continue;
      set(i, j, me.lake && d < me.rad - 1.5 ? LIQUID : FLOOR);
      if (P.cracks && !spawn && !me.lake && d > 1.2 && hash2(i, j, 36) < P.cracks) set(i, j, LIQUID);
    }
    const carve = (cells) => {
      for (let n = 0; n < cells.length; n += 2) {
        const i = cells[n], j = cells[n + 1];
        if (at(i, j) === SOLID) set(i, j, FLOOR);
        if (P.wide) { if (at(i + 1, j) === SOLID) set(i + 1, j, FLOOR); if (at(i, j + 1) === SOLID) set(i, j + 1, FLOOR); }
      }
    };
    carve(lpath(me, roomOf(rx + 1, rz), true)); carve(lpath(me, roomOf(rx, rz + 1), false));
    carve(lpath(roomOf(rx - 1, rz), me, true)); carve(lpath(roomOf(rx, rz - 1), me, false));

    // hidden chamber in a corner, reached by a tunnel whose mouth is sealed
    let secret = null;
    if (!spawn && hash2(rx, rz, 34) < P.secret) {
      const r = rngFor(rx, rz, 35), corners = [[bi + 1, bj + 1], [bi + REG - 3, bj + 1], [bi + 1, bj + REG - 3], [bi + REG - 3, bj + REG - 3]];
      const [qi, qj] = corners[(r() * 4) | 0];
      let ok = true;
      for (let j = qj - 1; j <= qj + 2 && ok; j++) for (let i = qi - 1; i <= qi + 2; i++) if (inR(i, j) && at(i, j) !== SOLID) { ok = false; break; }
      if (ok) {
        const start = { ci: qi + (me.ci > qi ? 1 : 0), cj: qj + (me.cj > qj ? 1 : 0) };
        const path = lpath(start, me, r() < 0.5), tunnel = [];
        for (let n = 2; n < path.length; n += 2) { if (at(path[n], path[n + 1]) !== SOLID) break; tunnel.push(path[n], path[n + 1]); }
        const chamber = (i, j) => i >= qi && i <= qi + 1 && j >= qj && j <= qj + 1;
        const inTunnel = (i, j) => { for (let n = 0; n < tunnel.length; n += 2) if (tunnel[n] === i && tunnel[n + 1] === j) return true; return false; };
        ok = tunnel.length >= 4;
        for (let n = 0; n < tunnel.length - 2 && ok; n += 2) {       // everything but the mouth must be walled in
          const i = tunnel[n], j = tunnel[n + 1];
          if (i <= bi || i >= bi + REG - 1 || j <= bj || j >= bj + REG - 1) ok = false;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(i + di, j + dj) !== SOLID && !chamber(i + di, j + dj) && !inTunnel(i + di, j + dj)) ok = false;
        }
        if (ok) {
          for (let j = qj; j <= qj + 1; j++) for (let i = qi; i <= qi + 1; i++) set(i, j, FLOOR);
          for (let n = 0; n < tunnel.length; n += 2) set(tunnel[n], tunnel[n + 1], n === tunnel.length - 2 ? SECRET : FLOOR);
          secret = { x: qi * CELL + 0.9, z: qj * CELL + 0.9, id: 'sc' + k };
        }
      }
    }
    R = { g, bi, bj, room: me, secret };
    regions.set(k, R); return R;
  }
  const regionAt = (i, j) => region(Math.floor((i + HALF) / REG), Math.floor((j + HALF) / REG));
  function caveCellType(i, j) { const R = regionAt(i, j); return R.g[(j - R.bj) * REG + (i - R.bi)]; }
  const cellType = (i, j) => name === 'labyrinth' ? labCell(i, j) : caveCellType(i, j);
  // Cell (i, j) is centred on (i * CELL, j * CELL), so the spawn point sits in the middle of cell (0, 0) and hallways run through it.
  const cellOf = (v) => Math.floor(v / CELL + 0.5), cellLo = (i) => (i - 0.5) * CELL;
  const secretId = (i, j) => 's' + key(i, j);
  const solidCell = (i, j, opened) => { const t = cellType(i, j); return t === SOLID || (t === SECRET && !opened.has(secretId(i, j))); };

  function gridChunk(cx, cz) {
    const c = blank(), r = rngFor(cx, cz, 1), n = S / CELL, floors = [], hell = name === 'hell';
    const H = P.ceiling || 0;
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = cx * n + a, j = cz * n + b, t = cellType(i, j), x = i * CELL, z = j * CELL, h = hash2(i, j, 40);
      if (t === SOLID) {
        let edge = false;
        for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if (cellType(i + di, j + dj) !== SOLID) { edge = true; break; }
        if (edge) {
          const wh = P.wallMin + h * P.wallVar; box(c, 'wall', x, wh / 2, z, CELL, wh, CELL);
          const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => cellType(i + di, j + dj) === FLOOR);
          if (faces.length && hash2(i, j, 71) < 0.045) {
            const [di, dj] = faces[(hash2(i, j, 72) * faces.length) | 0];
            c.cameraWords.push({ id: `${name}:${i},${j}:birthday`, x: x + di * (CELL / 2 + 0.04), y: 1.45, z: z + dj * (CELL / 2 + 0.04),
              rotation: Math.atan2(di, dj), line: (hash2(i, j, 73) * 4) | 0, chalk: hash2(i, j, 74) > 0.52 });
          }
        }
        continue;
      }
      if (t === SECRET) { c.secrets.push({ id: secretId(i, j), i, j, x, z }); continue; }
      if (t === LIQUID) { box(c, 'liquid', x, 0.02, z, CELL, 0.04, CELL); if (hell && h < 0.16) c.lights.push(x, 1.0, z, 1, 1); continue; }
      const far = x * x + z * z > 64;
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => cellType(i + di, j + dj) === SOLID);
      const at = (spread) => [x + (r() - 0.5) * spread, z + (r() - 0.5) * spread];
      if (far) floors.push(x, z);
      if (!hell) {
        if (walls.length && h < P.torch && far) {       // a torch burning on the wall
          const [di, dj] = walls[(h * 1000 | 0) % walls.length], tx = x + di * (CELL / 2 - 0.12), tz = z + dj * (CELL / 2 - 0.12);
          lit(c, r, 'torch', tx, tz, 0.6, 0.9, 1.25, 0.012); c.lights.push(tx - di * 0.35, 1.9, tz - dj * 0.35, 1, 0);
        }
        if (far && r() < 0.13) { const [px, pz] = at(3), hh = 1.0 + r() * 1.5; put(c, r, 'stalagmite', px, pz, hh * 0.6, hh, 0.3); }
        if (r() < 0.16) { const [px, pz] = at(3.4), hh = 0.8 + r() * 1.2; put(c, r, 'stalactite', px, pz, 0.7, hh, 0, 0, H - hh); }
        if (far && r() < 0.05) { const [px, pz] = at(3); put(c, r, ['rock', 'boulder'], px, pz, 1.1, 0.9, 0.4); }
        if (r() < 0.05) { const [px, pz] = at(3.2); put(c, r, 'gravel', px, pz, 1.0, 0.6); }
        if (r() < 0.045) { const [px, pz] = at(3); put(c, r, 'crystal', px, pz, 0.9, 1.0, 0.3); }
        if (r() < 0.07) { const [px, pz] = at(3.4); put(c, r, 'cavemush', px, pz, 0.5, 0.55); }
        if (r() < 0.035) { const [px, pz] = at(3); put(c, r, ['bone', 'skull'], px, pz, 0.6, 0.45); }
        if (far && r() < 0.012) { const [px, pz] = at(2.4); put(c, r, 'skeleton', px, pz, 1.0, 1.1, 0.3); }
        if (far && r() < 0.012) { const [px, pz] = at(2); put(c, r, ['minecart', 'pickaxe'], px, pz, 1.4, 1.1, 0.55); }
        if (r() < 0.05) { const [px, pz] = at(3.2); put(c, r, 'mosspatch', px, pz, 1.0, 0.5); }
        if (walls.length && r() < 0.12) { const [di, dj] = walls[0]; put(c, r, ['moss', 'web'], x + di * 1.6, z + dj * 1.6, 1.1, 1.2, 0, 0.01, H - 1.2); }
      } else {
        if (far && h > 1 - P.vent && walls.length < 2) c.vents.push(x + (r() - 0.5) * 2, z + (r() - 0.5) * 2, 5 + r() * 5, r() * 10);
        if (far && r() < 0.07) {
          const [px, pz] = at(3), hh = 3 + r() * 2.5; put(c, r, ['burnt', 'dead'], px, pz, hh, hh, 0.3, 0.003);
          if (hash2(Math.floor(px), Math.floor(pz), 87) < 0.035) c.cameraWords.push({ id: `hell:${Math.floor(px)},${Math.floor(pz)}:birthday`, x: px, y: 1.65, z: pz + 0.18, rotation: 0, line: (hash2(px, pz, 88) * 4) | 0, chalk: hash2(px, pz, 89) > 0.52 });
        }
        if (far && r() < 0.1) { const [px, pz] = at(3), hh = 1.5 + r() * 2.2; put(c, r, ['hellrock', 'stalagmite'], px, pz, hh * 0.6, hh, 0.4); }
        if (far && r() < 0.04) { const [px, pz] = at(3); put(c, r, 'lavarock', px, pz, 1.2, 1.2, 0.45); }
        if (far && r() < 0.035) { const [px, pz] = at(3); put(c, r, 'spikes', px, pz, 1.2, 0.9, 0.4); }
        if (r() < 0.08) { const [px, pz] = at(3.4); put(c, r, ['bone', 'skull'], px, pz, 0.6, 0.45); }
        if (far && r() < 0.02) { const [px, pz] = at(2.4); put(c, r, 'skeleton', px, pz, 1.0, 1.1, 0.3); }
        if (r() < 0.06) { const [px, pz] = at(3.2); put(c, r, 'ash', px, pz, 1.0, 0.5); }
        if (far && r() < 0.02) { const [px, pz] = at(2.4); put(c, r, 'cage', px, pz, 1.2, 1.8, 0.5); }
        if (far && r() < 0.016) { const [px, pz] = at(2.4); put(c, r, ['gargoyle', 'skullidol'], px, pz, 1.4, 1.7, 0.5); }
        if (far && r() < 0.016) { const [px, pz] = at(2.4); put(c, r, ['obelisk', 'pillar'], px, pz, 0.95, 2.6, 0.3); }
        if (far && r() < 0.014) { const [px, pz] = at(2.4); put(c, r, ['stake', 'pitchfork'], px, pz, 0.55, 1.6, 0.15); }
        if (r() < 0.03) { const [px, pz] = at(3); put(c, r, ['bramble', 'redcrystal'], px, pz, 1.1, 1.0); }
        if (far && r() < 0.006) { const [px, pz] = at(1.5); put(c, r, 'throne', px, pz, 1.6, 2.2, 0.6); }
        if (far && r() < 0.012) { const [px, pz] = at(2); put(c, r, 'cauldron', px, pz, 1.1, 1.0, 0.45); }
        if (far && r() < 0.014) {       // something still burning
          const [px, pz] = at(2.4), roll = r();
          if (roll < 0.4) { lit(c, r, 'brazier', px, pz, 0.9, 1.3); c.col.push(px, pz, 0.3); c.lights.push(px, 1.4, pz, 0.8, 0); }
          else if (roll < 0.75) { lit(c, r, 'bonfire', px, pz, 1.3, 1.3, 0, 0.02); c.col.push(px, pz, 0.4); c.lights.push(px, 1.0, pz, 0.9, 0); }
          else { const hh = 3.2 + r() * 1.5; lit(c, r, 'burning', px, pz, hh, hh, 0, 0.004); c.col.push(px, pz, 0.3); c.lights.push(px, 2.2, pz, 1, 0); }
        }
      }
    }
    // chest: a hidden chamber always has one; otherwise sometimes on open floor
    const reg = new Set();
    for (const [a, b] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) reg.add(regionAt(cx * n + a, cz * n + b));
    for (const R of reg) if (R.secret && Math.floor(R.secret.x / S) === cx && Math.floor(R.secret.z / S) === cz) c.chest = { x: R.secret.x, z: R.secret.z, id: R.secret.id };
    if (isSpawnChunk(cx, cz)) c.chest = { x: spawnChest.x, z: spawnChest.z, id: key(cx, cz) };
    else if (!c.chest && floors.length && hash2(cx, cz, 9) < chestChance * 1.2) {
      const f = ((r() * floors.length / 2) | 0) * 2;
      c.chest = { x: floors[f] + (r() - 0.5) * 2, z: floors[f + 1] + (r() - 0.5) * 2, id: key(cx, cz) };
    }
    if (c.chest) {
      c.chest.tier ||= chestTier(cx, cz);
      c.col.push(c.chest.x, c.chest.z, 0.4);
      // nothing standing on top of it
      for (let p = c.props.length - 7; p >= 0; p -= 7) if ((c.props[p] - c.chest.x) ** 2 + (c.props[p + 1] - c.chest.z) ** 2 < 1.4) c.props.splice(p, 7);
      for (let p = c.col.length - 6; p >= 0; p -= 3) if ((c.col[p] - c.chest.x) ** 2 + (c.col[p + 1] - c.chest.z) ** 2 < 1.4) c.col.splice(p, 3);
    }
    return c;
  }
  // straight-line sight test through cave walls (1 m steps)
  function gridBlocked(x0, z0, x1, z1, opened) {
    const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d);
    for (let s = 1; s < steps; s++) { const t = s / steps; if (solidCell(cellOf(x0 + (x1 - x0) * t), cellOf(z0 + (z1 - z0) * t), opened)) return true; }
    return false;
  }

  // ───────────────────────── labyrinth: one finite maze, one way out ─────────────────────────
  // Corridors one cell (4 m) wide between walls one cell thick. You start in a small room at the centre; the exit is a gap
  // in the outer wall, as far from the centre as the maze allows. Leaving through it calls for a new maze: regen().
  // Grown with a "growing tree" that mostly extends the newest passage but often branches from an old one, which gives long
  // winding halls with a great many dead ends; a few dead ends are then opened into loops so nothing can be cornered for certain.
  const LAB_H = MAP_META.labyrinth.ceiling;
  const lab = { gen: -1 };
  function buildLab(gen) {
    const M = 15 + 2 * Math.min(gen, 2), N = 2 * M + 1;             // M halls a side (odd, so the centre is a hall), N cells a side
    const g = new Uint8Array(N * N), seen = new Uint8Array(N * N), r = mulberry((seed ^ Math.imul(gen + 1, 0x9e3779b1)) | 0);
    const at = (a, b) => b * N + a, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const open = (a, b) => a >= 0 && a < N && b >= 0 && b < N && g[at(a, b)] === FLOOR;
    for (let b = M - 1; b <= M + 1; b++) for (let a = M - 1; a <= M + 1; a++) g[at(a, b)] = FLOOR;
    const active = [[M, M]]; seen[at(M, M)] = 1;
    while (active.length) {
      const k = r() < 0.5 ? active.length - 1 : (r() * active.length) | 0, [a, b] = active[k];
      const opts = DIRS.filter(([da, db]) => { const x = a + 2 * da, y = b + 2 * db; return x > 0 && x < N - 1 && y > 0 && y < N - 1 && !seen[at(x, y)]; });
      if (!opts.length) { active.splice(k, 1); continue; }
      const [da, db] = opts[(r() * opts.length) | 0];
      g[at(a + da, b + db)] = g[at(a + 2 * da, b + 2 * db)] = FLOOR; seen[at(a + 2 * da, b + 2 * db)] = 1; active.push([a + 2 * da, b + 2 * db]);
    }
    const exitsOf = (a, b) => DIRS.filter(([da, db]) => open(a + da, b + db));
    for (let b = 1; b < N; b += 2) for (let a = 1; a < N; a += 2) {   // a few loops
      if (exitsOf(a, b).length !== 1 || r() > 0.09) continue;
      const walls = DIRS.filter(([da, db]) => !open(a + da, b + db) && a + 2 * da > 0 && a + 2 * da < N - 1 && b + 2 * db > 0 && b + 2 * db < N - 1);
      if (walls.length) { const [da, db] = walls[(r() * walls.length) | 0]; g[at(a + da, b + db)] = FLOOR; }
    }
    // walking distance from the centre to every cell
    const dist = new Int32Array(N * N).fill(-1), queue = [M, M]; dist[at(M, M)] = 0;
    for (let q = 0; q < queue.length; q += 2) {
      const a = queue[q], b = queue[q + 1];
      for (const [da, db] of DIRS) if (open(a + da, b + db) && dist[at(a + da, b + db)] < 0) { dist[at(a + da, b + db)] = dist[at(a, b)] + 1; queue.push(a + da, b + db); }
    }
    // the way out: one of the farthest halls on the rim
    const rim = [];
    for (let v = 1; v < N; v += 2) rim.push([v, 1, 0, -1], [v, N - 2, 0, 1], [1, v, -1, 0], [N - 2, v, 1, 0]);
    rim.sort((p, q) => dist[at(q[0], q[1])] - dist[at(p[0], p[1])]);
    const [ea, eb, eda, edb] = rim[(r() * Math.max(1, rim.length * 0.2)) | 0];
    g[at(ea + eda, eb + edb)] = FLOOR;
    const W = (a) => a - M, beyond = new Set();                       // local cell -> world cell; the passage outside the wall
    for (let n = 2; n <= 3; n++) beyond.add(key(W(ea + eda * n), W(eb + edb * n)));
    const exit = { i: W(ea + eda * 3), j: W(eb + edb * 3), di: eda, dj: edb, steps: dist[at(ea, eb)] + 1 };
    exit.x = exit.i * CELL; exit.z = exit.j * CELL;

    // the dead: slumped at the ends of blind halls, and here and there along the way
    const ends = new Set(), bodies = [];
    const near0 = (a, b) => Math.abs(a - M) < 4 && Math.abs(b - M) < 4;
    const lean = (a, b, [wa, wb]) => ({ kind: 'lean', x: W(a) * CELL + wa * (CELL / 2 - 0.3), z: W(b) * CELL + wb * (CELL / 2 - 0.3), facing: Math.atan2(-wa, -wb) + (r() - 0.5) * 0.5 });
    const lying = (a, b) => ({ kind: 'ground', x: W(a) * CELL + (r() - 0.5) * 1.6, z: W(b) * CELL + (r() - 0.5) * 1.6, facing: r() * 6.28 });
    const hung = (a, b) => ({ kind: 'hang', x: W(a) * CELL + (r() - 0.5) * 1.2, z: W(b) * CELL + (r() - 0.5) * 1.2, facing: r() * 6.28, anchorY: LAB_H });
    for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) {
      if (!open(a, b) || near0(a, b)) continue;
      const ex = exitsOf(a, b), node = a % 2 === 1 && b % 2 === 1, roll = r(), which = r();
      if (node && ex.length === 1 && !(a === ea && b === eb)) {
        ends.add(key(W(a), W(b)));
        if (roll < 0.5) bodies.push(which < 0.6 ? lean(a, b, [-ex[0][0], -ex[0][1]]) : which < 0.82 ? lying(a, b) : hung(a, b));
      } else if (roll < 0.035) {
        const walls = DIRS.filter(([da, db]) => !open(a + da, b + db));
        bodies.push(which < 0.4 && walls.length ? lean(a, b, walls[(r() * walls.length) | 0]) : which < 0.75 ? lying(a, b) : hung(a, b));
      }
    }
    return { gen, M, N, g, beyond, exit, ends, bodies, deadEnds: ends.size, half: (N / 2) * CELL };
  }
  function setLab(gen) { Object.assign(lab, buildLab(gen)); return lab; }
  if (name === 'labyrinth') setLab(0);
  function labCell(i, j) {
    const a = i + lab.M, b = j + lab.M;
    if (a >= 0 && a < lab.N && b >= 0 && b < lab.N) return lab.g[b * lab.N + a];
    return lab.beyond.has(key(i, j)) ? FLOOR : SOLID;
  }
  const labOutside = (x, z) => { const a = cellOf(x) + lab.M, b = cellOf(z) + lab.M; return a < 0 || a >= lab.N || b < 0 || b >= lab.N; };
  function labChunk(cx, cz) {
    const c = blank(), n = S / CELL, r = mulberry((hash2(cx, cz, 60 + lab.gen) * 4294967296) | 0), id = (k) => 'L' + lab.gen + ':' + k;
    const taken = (x, z, gap) => lab.bodies.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < gap * gap);
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = cx * n + a, j = cz * n + b, x = i * CELL, z = j * CELL;
      if (labCell(i, j) === SOLID) {
        let edge = false;
        for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if (labCell(i + di, j + dj) !== SOLID) { edge = true; break; }
        if (edge) {
          box(c, 'wall', x, LAB_H / 2, z, CELL, LAB_H, CELL);
          const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => labCell(i + di, j + dj) === FLOOR);
          if (faces.length && hash2(i, j, 75 + lab.gen) < 0.045) {
            const [di, dj] = faces[(hash2(i, j, 76 + lab.gen) * faces.length) | 0];
            c.cameraWords.push({ id: `labyrinth:${lab.gen}:${i},${j}:birthday`, x: x + di * (CELL / 2 + 0.04), y: 1.45, z: z + dj * (CELL / 2 + 0.04),
              rotation: Math.atan2(di, dj), line: (hash2(i, j, 77 + lab.gen) * 4) | 0, chalk: hash2(i, j, 78 + lab.gen) > 0.52 });
          }
        }
        continue;
      }
      const far = x * x + z * z > 64, walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => labCell(i + di, j + dj) === SOLID);
      const at = (spread) => [x + (r() - 0.5) * spread, z + (r() - 0.5) * spread];
      if (i === lab.exit.i && j === lab.exit.j) {      // the way out: a pale doorway at the end of the last passage
        const { di, dj } = lab.exit, gx = x + di * (CELL / 2 - 0.05), gz = z + dj * (CELL / 2 - 0.05);
        box(c, 'exit', gx, LAB_H / 2, gz, di ? 0.1 : CELL, LAB_H, di ? CELL : 0.1);
        c.lights.push(x, 2.2, z, 1.2, 2);
        continue;
      }
      if (lab.beyond.has(key(i, j))) { c.lights.push(x, 2.2, z, 0.5, 2); continue; }
      if (lab.ends.has(key(i, j)) && !c.chest && !taken(x, z, 2.2) && hash2(i, j, 70 + lab.gen) < 0.3) c.chest = { x, z, id: id(key(i, j)) };   // blind halls are worth a look
      if (walls.length && far && r() < 0.03) {         // a torch someone left burning
        const [di, dj] = walls[(r() * walls.length) | 0], tx = x + di * (CELL / 2 - 0.12), tz = z + dj * (CELL / 2 - 0.12);
        lit(c, r, 'torch', tx, tz, 0.6, 0.9, 1.25, 0.012); c.lights.push(tx - di * 0.35, 1.9, tz - dj * 0.35, 1, 0);
      }
      if (r() < 0.09) { const [px, pz] = at(3); put(c, r, ['bone', 'skull'], px, pz, 0.6, 0.45); }
      if (far && r() < 0.02) { const [px, pz] = at(2.2); if (!taken(px, pz, 1.4)) put(c, r, 'skeleton', px, pz, 1.0, 1.1, 0.3); }
      if (r() < 0.04) { const [px, pz] = at(3.2); put(c, r, 'gravel', px, pz, 1.0, 0.6); }
      if (far && r() < 0.008) { const [px, pz] = at(1.6); if (!taken(px, pz, 1.6)) put(c, r, ['cage', 'coffin'], px, pz, 1.2, 1.8, 0.5); }
      if (walls.length && r() < 0.16) { const [di, dj] = walls[(r() * walls.length) | 0]; put(c, r, ['web', 'moss'], x + di * 1.6, z + dj * 1.6, 1.1, 1.2, 0, 0.01, LAB_H - 1.2); }
      if (far && r() < 0.012 && !taken(x, z, 2)) { const [px, pz] = at(2); lit(c, r, 'candle', px, pz, 0.3, 0.42, 0, 0); c.lights.push(px, 0.5, pz, 0.3, 0); }
    }
    for (const b of lab.bodies) if (b.kind === 'hang' && Math.floor(b.x / S) === cx && Math.floor(b.z / S) === cz) c.col.push(b.x, b.z, 0.2);   // you walk round the hanged
    if (isSpawnChunk(cx, cz)) c.chest = { x: spawnChest.x, z: spawnChest.z, id: id('spawn'), tier: 'common' };
    if (c.chest) {
      c.chest.tier ||= chestTier(cx, cz);
      c.col.push(c.chest.x, c.chest.z, 0.4);
      for (let p = c.props.length - 7; p >= 0; p -= 7) if ((c.props[p] - c.chest.x) ** 2 + (c.props[p + 1] - c.chest.z) ** 2 < 1.4) c.props.splice(p, 7);
      for (let p = c.col.length - 6; p >= 0; p -= 3) if ((c.col[p] - c.chest.x) ** 2 + (c.col[p + 1] - c.chest.z) ** 2 < 1.4) c.col.splice(p, 3);
    }
    return c;
  }

  const isGrid = name === 'cave' || name === 'hell' || name === 'labyrinth';
  const generateChunk = { forest: forestChunk, snow: snowChunk, rural: ruralChunk, cave: gridChunk, hell: gridChunk, labyrinth: labChunk }[name];
  return {
    name, meta, label: meta.label, generateChunk, spawnChest,
    groundY: name === 'snow' ? snowY : () => 0,
    grid: isGrid ? { CELL, cellType, solidCell, cellOf, lo: cellLo, secretId, liquid: name === 'hell' ? 'lava' : 'water' } : null,
    blocked: isGrid ? gridBlocked : name === 'forest' ? forestBlocked : () => false,
    door: name === 'forest' ? forestDoor : { W: DOOR_W, H: DOOR_H, T: WALL_T }, wallH: WALL_H,
    // the labyrinth only: its current maze, whether a point lies outside the outer wall, and a fresh maze on demand
    // a new seed has been set (hash2 reads it live): forget everything worked out under the old one
    reseed() { blockCache.clear(); regions.clear(); forestCover.clear(); },
    labyrinth: name === 'labyrinth' ? { state: lab, outside: labOutside, regen: () => setLab(lab.gen + 1) } : null,
  };
}
