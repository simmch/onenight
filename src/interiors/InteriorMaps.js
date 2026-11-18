// Interior layouts share the same grid, chunk, collision and loot contracts as the caves.
import { ESTATE_META, ESTATE_POWER, buildEstate } from './EstateDistricts.js';
import { HAZARD_MAPS, EXPOSED_ZONES, CATHEDRAL_DEPTH, buildHazardDistrict } from './HazardDistricts.js';
import { dressHazardCell, dressHazardProp } from './HazardLook.js';
import { doorBounds, doorIsClosed, segmentHits } from '../world/Cover.js';

export const INTERIOR_META = {
  asylum: { label: 'THE CONDEMNED ASYLUM', fog: 0x000000, fogDensity: 0.032, ambient: [0x000000, 0], ceiling: 3.7,
    ground: ['#343838'], hint: 'Unlock the surgical wing to reach the basement. Walk through the patient hall to avoid the broken glass.' },
  subway: { label: 'THE METRO TUNNELS', fog: 0x000000, fogDensity: 0.028, ambient: [0x000000, 0], ceiling: 4,
    ground: ['#34302c'], hint: 'The wrecked trains break line of sight. Watch for deep water in maintenance.' },
  mall: { label: 'THE OVERGROWN MALL', fog: 0x000000, fogDensity: 0.021, ambient: [0x000000, 0], ceiling: 10,
    ground: ['#38403b'], hint: 'The stopped escalator leads to the upper arcade.' },
  deepsea: { label: 'THE DEEP-SEA RESEARCH FACILITY', fog: 0x000000, fogDensity: 0.047, ambient: [0x000000, 0], ceiling: 3.65,
    ground: ['#243332'], hint: 'Follow the deck markings. The flooded labs still have a dry service bypass.' },
  backrooms: { label: 'THE BACKROOMS', fog: 0x000000, fogDensity: 0.047, ambient: [0x000000, 0], ceiling: 3.05,
    ground: ['#494028'], hint: 'Listen for the lights. Look closely at doors where the wallpaper changes.' },
  ...ESTATE_META, ...HAZARD_MAPS,
};

const CELL = 4, SIDE = 24;
const SOLID = 0, FLOOR = 1, LIQUID = 2;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const cellOf = (v) => Math.floor(v / CELL + 0.5);
const lo = (i) => (i - 0.5) * CELL;
const wrap = (n) => ((n + SIDE / 2) % SIDE + SIDE) % SIDE - SIDE / 2;
const id = (i, j) => i + ',' + j;
const solid = { type: SOLID, zone: '', y: 0 };
// The rest of every district has dead fixtures. These rectangles are the surviving circuits and skylight bays.
const poweredSections = {
  asylum: [[-1, -2, 1, 1], [-4, -8, -2, -7]],
  subway: [[-1, -3, 2, 1], [-3, -6, -2, -4], [6, 0, 8, 0]],
  mall: [[-1, -5, 1, -2], [-5, -6, -3, -5]],
  deepsea: [[-1, -2, 1, 1], [-5, -5, -3, -4], [8, -5, 9, -4]],
  backrooms: [[-1, -2, 1, 1], [5, -6, 7, -4], [6, 7, 6, 8]],
  ...ESTATE_POWER,
  cathedral: [[-1, -1, 1, 0], [-1, -9, 1, -8]],
  accelerator: [[-4, -2, 4, 1], [-1, 7, 1, 8]],
  taxidermy: [[-2, -2, 1, 0], [4, -5, 5, -4]],
  glasshouse: [[-1, -1, 1, 0], [2, 1, 4, 2]],
  offshore: [[-1, -1, 1, 1], [-1, -10, 1, -9]],
  serverfarm: [[-1, -2, 1, 0], [-2, -7, -2, -4], [4, -7, 4, -3]],
};

function layout(spine, draw, base) {
  const cells = new Map(base?.cells), objects = new Map(base?.objects);
  function room(x0, z0, x1, z1, zone, y = 0) {
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      cells.set(id(i, j), { zone, y, type: zone === 'flood' ? LIQUID : FLOOR });
    }
  }
  function ramp(x0, z0, x1, z1, y0, y1) {
    room(x0, z0, x1, z1, 'ramp');
    const alongX = x0 !== x1;
    const first = alongX ? lo(x0) : lo(z0), last = alongX ? lo(x1 + 1) : lo(z1 + 1);
    const slope = { alongX, first, last, y0, y1, x: (x0 + x1) * CELL / 2, z: (z0 + z1) * CELL / 2 };
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) cells.get(id(i, j)).slope = slope;
  }
  function at(i, j, type, opts = {}) {
    const k = id(i, j);
    objects.set(k, [...(objects.get(k) || []), { type, ...opts }]);
  }
  if (!base && spine) { room(0, -12, 0, 11, spine); room(-12, 0, 11, 0, spine); }
  draw(room, ramp, at);
  return { cells, objects };
}

const layouts = {
  asylum: layout('hall', (room, ramp, at) => {
    room(-1, -1, 1, 1, 'reception');
    room(-5, -3, -2, -1, 'intake'); room(-1, -2, -1, -2, 'hall');
    room(-5, -9, -2, -6, 'ward'); room(-1, -7, -1, -7, 'hall');
    room(2, -3, 3, -2, 'padded'); room(1, -3, 1, -3, 'hall');
    room(2, -8, 3, -7, 'padded'); room(1, -7, 1, -7, 'hall');
    room(1, -5, 5, -5, 'hall'); ramp(6, -5, 8, -5, 0, -3.25);
    room(9, -7, 9, -3, 'surgery', -3.25);
    room(10, -7, 11, -6, 'surgery', -3.25); room(10, -4, 11, -3, 'surgery', -3.25);
    room(3, 2, 7, 5, 'ward'); room(5, 1, 5, 1, 'hall');
    room(-8, 3, -2, 7, 'intake'); room(-6, 1, -6, 2, 'hall');
    at(0, -1, 'sign', { text: 'BLACKWATER SANATORIUM', face: 0, dy: 2.65 });
    at(0, -5, 'sign', { text: 'SURGERY  →  BASEMENT', face: 1 });
    at(2, -3, 'sign', { text: 'OBSERVATION CELL 06', face: 1 });
    at(2, -3, 'bed', { dx: 0.65, dz: 0.6 }); at(2, -7, 'bed', { dx: 0.65, dz: -0.6 });
    at(-3, -2, 'gurney'); at(-2, -7, 'gurney', { dx: -1.2 }); at(0, -4, 'gurney', { dx: 1.0, turn: 0.1 });
    at(10, -4, 'gurney', { surgical: true }); at(10, -7, 'gurney', { surgical: true, turn: 1.57 });
    at(9, -6, 'screen', { dx: -0.8 }); at(11, -4, 'lockers', { dx: 1.0 });
  }),
  subway: layout('service', (room, ramp, at) => {
    room(-1, -12, 1, 11, 'track');
    room(-12, 0, -5, 0, 'crossTrack'); room(6, 0, 11, 0, 'crossTrack');
    room(-4, -6, -2, 4, 'platform', 0.22); room(2, -7, 4, 3, 'platform', 0.22);
    room(-4, -2, -3, 1, 'concourse', 0.22); room(3, -1, 5, 2, 'concourse', 0.22);
    room(5, -3, 9, -3, 'service'); room(9, -6, 9, -1, 'service');
    room(6, -7, 8, -5, 'flood'); room(6, -4, 8, -4, 'service'); room(6, -8, 9, -8, 'service'); room(9, -7, 9, -7, 'service');
    room(-3, 6, -2, 8, 'storage'); room(-2, 6, -2, 6, 'service');
    at(0, -1, 'sign', { text: 'NORTH TERMINAL  •  LINE 04', face: 0, dy: 3.05 });
    at(2, -3, 'sign', { text: 'MAINTENANCE  →', face: 1 });
    at(-1, -2, 'train', { dx: -0.1, broken: true }); at(-1, -4, 'train'); at(1, -7, 'train', { broken: true });
    at(2, -4, 'bench', { dx: 0.75 }); at(-3, -1, 'lockers');
    at(7, -4, 'sign', { text: 'TUNNEL FLOODED', face: 0 }); at(5, -3, 'rack');
  }),
  mall: layout('arcade', (room, ramp, at) => {
    room(-2, -8, 2, 3, 'atrium');
    room(3, -8, 8, -6, 'store'); room(3, -5, 3, -4, 'arcade');
    room(4, -4, 8, -2, 'food'); room(3, -3, 3, -3, 'food');
    room(3, 1, 6, 4, 'store'); room(8, 2, 11, 5, 'storage'); room(9, 1, 9, 1, 'arcade');
    ramp(-3, -3, -3, -1, 3.55, 0);
    room(-3, -8, -3, -4, 'balcony', 3.55);
    room(-7, -8, -4, -6, 'upper', 3.55); room(-5, -5, -4, -4, 'upper', 3.55);
    room(-6, 1, -3, 4, 'food');
    at(0, -1, 'sign', { text: 'EVERGREEN GALLERIA', face: 0, dy: 3.75 });
    at(-2, -2, 'sign', { text: 'UPPER ARCADE  ←', face: 3, dy: 2.55 });
    at(3, -3, 'sign', { text: 'FOOD TERRACE', face: 1, dy: 2.85 });
    at(4, -7, 'sign', { text: 'PINE & THREAD', face: 1 });
    at(4, 2, 'sign', { text: 'JUNIPER BOOKS', face: 1 });
    at(-4, -6, 'sign', { text: 'CEDAR DEPARTMENT STORE', face: 0 });
    at(1, -2, 'kiosk', { dz: -0.85 }); at(0, -5, 'planter'); at(-1, -6, 'planter');
    at(2, -2, 'mannequin', { dx: -0.4 }); at(4, -6, 'mannequin'); at(-4, -6, 'mannequin');
    at(5, -4, 'table'); at(6, -3, 'table'); at(-4, 2, 'table'); at(5, 2, 'rack');
  }),
  deepsea: layout('passage', (room, ramp, at) => {
    room(-1, -2, 1, 1, 'control');
    room(-5, -6, -2, -3, 'view'); room(-1, -4, -1, -4, 'passage');
    room(2, -5, 4, -2, 'lab'); room(1, -4, 1, -4, 'passage');
    room(1, -8, 9, -8, 'passage'); room(9, -7, 9, -2, 'passage');
    room(6, -7, 8, -3, 'flood'); room(6, -2, 8, -2, 'lab'); room(5, -2, 5, -2, 'passage');
    room(4, 1, 4, 2, 'passage'); room(3, 3, 5, 5, 'flood'); room(3, 6, 5, 6, 'lab');
    room(6, 0, 6, 6, 'passage');
    room(-9, 2, -6, 6, 'engine'); room(-7, 1, -7, 1, 'passage');
    at(0, -1, 'sign', { text: 'PELAGIC STATION  //  4,870 M', face: 0, dy: 2.78 });
    at(0, -4, 'sign', { text: '←  OBSERVATION    LABS  →', face: 0, dy: 2.72 });
    at(-5, -4, 'port', { face: 3 }); at(-5, -5, 'port', { face: 3 }); at(-4, -6, 'port', { face: 0 });
    at(-3, -5, 'console'); at(-1, -1, 'console', { dx: -0.9 }); at(1, -1, 'lockers', { dx: 1.0 });
    at(4, -4, 'gurney'); at(6, -2, 'sign', { text: 'FLOODED  /  LAB 3', face: 0, dy: 2.68 });
    at(-7, 3, 'machinery'); at(-8, 5, 'machinery');
  }),
  backrooms: layout('office', (room, ramp, at) => {
    room(-2, -3, 2, -1, 'office'); room(-2, -6, -1, -5, 'dim');
    room(1, -8, 4, -6, 'office'); room(-7, -9, -3, -6, 'office'); room(-4, -6, -2, -6, 'dim');
    room(2, -2, 6, -2, 'office'); room(5, -6, 8, -4, 'office'); room(6, -4, 6, -2, 'office');
    room(7, -3, 8, -1, 'dim'); room(7, -1, 7, 0, 'office');
    room(-7, 1, -1, 3, 'office'); room(-9, 4, -6, 8, 'office'); room(-6, 3, -6, 5, 'office');
    room(3, 2, 5, 3, 'dim'); room(4, 0, 4, 2, 'office');
    ramp(4, 4, 4, 6, 0, -2.4);
    room(3, 7, 8, 10, 'utility', -2.4);
    room(8, 8, 10, 8, 'utility', -2.4); ramp(10, 4, 10, 7, 0, -2.4); room(10, 1, 10, 3, 'dim');
    ramp(-10, -8, -8, -8, -2.8, 0);
    room(-12, -10, -11, -7, 'archive', -2.8);
    at(6, -3, 'fold', { face: 0, toI: -3, toJ: -6, yaw: Math.PI / 2 });
    at(-2, -5, 'fold', { face: 2, toI: 6, toJ: -3, yaw: -Math.PI / 2 });
    at(5, 3, 'transition', { face: 1, toI: 4, toJ: 8, yaw: Math.PI, label: 'Slip through the loose wallpaper', text: 'LEVEL 0.2 · SERVICE FLOOR' });
    at(7, 10, 'transition', { face: 2, toI: -6, toJ: 2, yaw: 0, label: 'Open the unmarked service door', text: 'LEVEL 0 · OFFICE' });
    at(8, -4, 'transition', { face: 1, toI: -11, toJ: -8, yaw: 0, label: 'Lift the loose wall panel', text: 'LEVEL 0.3 · RECORDS' });
    at(-11, -10, 'transition', { face: 0, toI: 6, toJ: 8, yaw: Math.PI / 2, label: 'Open the records door', text: 'LEVEL 0.2 · SERVICE FLOOR' });
    at(4, 8, 'sign', { text: 'B2   /   SERVICE ACCESS', face: 2 });
    at(-12, -10, 'rack'); at(-12, -8, 'desk'); at(-12, -7, 'rack');
    at(-1, -2, 'chair'); at(2, -2, 'chair'); at(5, -5, 'desk'); at(7, -5, 'partition', { dz: 1.8 });
  }),
};

export function createInteriorMap(name, { S, atlas, hash2, chestChance }) {
  const meta = INTERIOR_META[name], districts = new Map();
  const base = layouts[name], estate = name === 'asylum' || Object.hasOwn(ESTATE_META, name);
  const facility = Object.hasOwn(HAZARD_MAPS, name);
  const gateId = (i, j, face) => `gate:${i},${j}:${face}`;
  const trapId = (i, j) => `deluge:${i},${j}`;
  const door = { W: 1.25, H: 2.2, T: 0.15 };
  function district(i, j) {
    const a = i - wrap(i), b = j - wrap(j), key = id(a, b);
    let blueprint = districts.get(key);
    if (!blueprint) {
      let draw = 0;
      const rng = () => hash2(a, b, 722 + draw++);
      blueprint = layout(name === 'accelerator' ? null : 'passage', (room, ramp, at) => {
        if (estate) buildEstate(name, room, ramp, at, rng, a !== 0 || b !== 0);
        if (facility) buildHazardDistrict(name, room, ramp, at, rng);
        room(-1, 8, 1, 10, 'deluge');
        at(0, 8, 'control', { flood: true, dx: 1.35, label: 'Pull the deluge valve' });
        at(0, 9, 'sign', { text: 'DELUGE BAY  /  FIRE SUPPRESSION', face: 2 });
      }, base);
      if (districts.size >= 80) districts.clear();
      districts.set(key, blueprint);
    }
    return blueprint;
  }
  const objectsAt = (i, j) => district(i, j).objects.get(id(wrap(i), wrap(j))) || [];
  const cell = (i, j) => {
    const a = wrap(i), b = wrap(j), spec = district(i, j).cells.get(id(a, b));
    // A seeded opening in the repeating office modules changes the sightlines from wing to wing.
    if (name === 'backrooms' && b === -4 && a >= -2 && a <= -1 && hash2(i - a, j - b, 71) > 0.48) return { type: FLOOR, zone: 'office', y: 0 };
    return spec || solid;
  };
  const solidCell = (i, j) => cell(i, j).type === SOLID;
  const interiorRoof = (spec) => {
    if (spec.zone === 'cableHatch') return 1.42;
    if (spec.zone === 'altar') return 7.1;
    if (spec.zone === 'surgery') return 3.35;
    if (spec.zone === 'utility' || spec.zone === 'archive') return 2.7;
    if (['cellblock', 'gallery', 'tower', 'gym', 'stage'].includes(spec.zone)) return spec.y > 2 ? 5.35 : 8.2;
    if (name === 'mall') return ['atrium', 'ramp', 'balcony'].includes(spec.zone) ? 9.4 : 3.3;
    return meta.ceiling;
  };
  const groundY = (x, z) => {
    const i = cellOf(x), j = cellOf(z), spec = cell(i, j);
    if (!spec.slope) return spec.y;
    const s = spec.slope;
    const p = s.alongX ? x - (i - wrap(i)) * CELL : z - (j - wrap(j)) * CELL;
    return s.y0 + (s.y1 - s.y0) * (p - s.first) / (s.last - s.first);
  };
  const roofY = (x, z) => {
    const spec = cell(cellOf(x), cellOf(z));
    const y = spec.slope ? groundY(x, z) : spec.y;
    return name === 'mall' && ['atrium', 'ramp', 'balcony'].includes(spec.zone) ? 9.4 : y + interiorRoof(spec);
  };
  const zoneAt = (x, z) => cell(cellOf(x), cellOf(z)).zone;
  const poweredAt = (i, j) => {
    const a = wrap(i), b = wrap(j), { zone } = cell(i, j);
    return zone !== 'surgery' && zone !== 'flood' && poweredSections[name].some(([x0, z0, x1, z1]) => a >= x0 && a <= x1 && b >= z0 && b <= z1);
  };
  function canStep(i, j, a, b, opened) {
    if ((estate || facility) && opened) {
      const face = DIRS.findIndex(([di, dj]) => di === a - i && dj === b - j);
      const closed = (x, z, side) => objectsAt(x, z).some((o) => o.type === 'gate' && o.face === side && doorIsClosed({ ...o, id: gateId(x, z, side) }, opened));
      if (face >= 0 && (closed(i, j, face) || closed(a, b, (face + 2) % 4))) return false;
    }
    const x = (i + a) * CELL / 2, z = (j + b) * CELL / 2;
    const dx = (a - i) * 0.04, dz = (b - j) * 0.04;
    return Math.abs(groundY(x - dx, z - dz) - groundY(x + dx, z + dz)) <= 0.6;
  }
  const delugeWater = (i, j, opened) => !!opened?.has(trapId(i - wrap(i), j - wrap(j))) && cell(i, j).zone === 'deluge';
  const cellType = (i, j, opened) => delugeWater(i, j, opened) ? LIQUID : cell(i, j).type;
  const grid = { CELL, cellOf, lo, cellType, solidCell, secretId: (i, j) => 'wall:' + id(i, j), liquid: 'water' };
  const spawnChest = { id: 'interior:origin', tier: 'common', x: 0.62, z: -5.1 };
  const blockedCache = new Map();

  function generateChunk(cx, cz) {
    const c = { props: [], glow: [], col: [], cover: [], aabb: [], boxes: {}, slopes: [], chest: null, lights: [], vents: [], doors: [], houses: [], secrets: [], cameraWords: [], details: [], links: [], controls: [], water: [], hazards: [] };
    let powered = false;
    const box = (layer, x, y, z, w, h, d, turn = 0) => {
      const material = !powered && ['emergency', 'fluorescent', 'aqua'].includes(layer) ? 'deadLamp' : layer;
      (c.boxes[material] ||= []).push(x, y, z, w, h, d, turn);
    };
    const shape = (x, z, w, d, cover = false) => {
      const bounds = [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
      c.aabb.push(...bounds);
      if (cover) c.cover.push(...bounds);
    };
    const sprite = (kind, x, y, z, w, h, sway) => {
      const sprites = atlas.sprites[kind];
      if (sprites?.length) c.props.push(x, z, w, h, sprites[Math.floor(hash2(Math.floor(x * 3), Math.floor(z * 3), 14) * sprites.length)], sway, y);
    };
    const floors = [];
    const n = S / CELL;
    for (let j = cz * n; j < (cz + 1) * n; j++) for (let i = cx * n; i < (cx + 1) * n; i++) {
      const spec = cell(i, j);
      if (spec.type === SOLID) continue;
      const a = wrap(i), b = wrap(j), x = i * CELL, z = j * CELL;
      const y = groundY(x, z), roof = roofY(x, z), roll = hash2(i, j, 29);
      const zone = spec.zone, slope = spec.slope;
      powered = poweredAt(i, j);
      const objects = objectsAt(i, j);
      if (zone === 'deluge') {
        c.water.push({ x, y, z, id: trapId(i - a, j - b) });
        box('iron', x, roof - 0.28, z, 0.13, 0.13, CELL);
        box('aqua', x, roof - 0.34, z, 0.3, 0.12, 0.3);
      }
      if (!slope) {
        const floor = spec.type === LIQUID ? 'liquid'
          : ['track', 'crossTrack'].includes(zone) ? 'trackFloor'
          : ['utility', 'archive', 'surgery', 'engine', 'service'].includes(zone) ? 'serviceFloor' : 'interiorFloor';
        const slab = ['platform', 'concourse'].includes(zone) ? 0.30 : 0.20;
        box(floor, x, y - slab / 2, z, CELL, slab, CELL);
        if (spec.type === FLOOR && !objects.length && (Math.abs(x) > 7 || Math.abs(z) > 7)) floors.push([x, z]);
      } else if (slope.alongX ? x - (i - a) * CELL === slope.x : z - (j - b) * CELL === slope.z) {
        const dy = slope.y1 - slope.y0, run = slope.last - slope.first;
        const midY = (slope.y0 + slope.y1) / 2;
        const turn = slope.alongX ? Math.PI / 2 : 0;
        const tilt = -Math.atan2(dy, run);
        c.slopes.push(['stairs', x, midY - 0.09, z, CELL, 0.18, Math.hypot(dy, run), turn, tilt]);
      }
      const skylight = zone === 'atrium' && (a === 0 || a === 1) && b < 0 && b >= -6;
      const canopy = ['conservatory', 'fernery'].includes(zone);
      const panel = canopy && objects.some(o => o.type === 'hazard' && o.kind === 'roofGlass');
      if (canopy && !panel && roll > 0.33) box('barrierGlass', x, roof, z, CELL, 0.06, CELL);
      if (!skylight && !canopy && !EXPOSED_ZONES.includes(zone)) box('interiorCeiling', x, roof + 0.11, z, CELL, 0.22, CELL);
      else if (skylight) {
        box('iron', x - 1.96, roof, z, 0.12, 0.13, CELL);
        box('iron', x, roof, z + 1.94, CELL, 0.14, 0.13);
        c.details.push({ type: 'skylight', x, y: roof + 0.02, z, split: roll, powered });
      }

      const faces = [];
      for (let face = 0; face < DIRS.length; face++) {
        const [di, dj] = DIRS[face], neighbor = cell(i + di, j + dj);
        const wx = x + di * 1.99, wz = z + dj * 1.99, turn = face * Math.PI / 2;
        const isWall = neighbor.type === SOLID;
        const edgeY = groundY(x + di * 1.97, z + dj * 1.97);
        const otherY = groundY(x + di * 2.03, z + dj * 2.03);
        const drop = !isWall && Math.abs(edgeY - otherY) > 0.6;
        if (isWall) {
          faces.push(face);
          if (EXPOSED_ZONES.includes(zone)) continue;
          const bottom = slope ? Math.min(slope.y0, slope.y1) - 0.25 : y - 0.2;
          const wallRoof = slope && name !== 'mall' ? Math.max(slope.y0, slope.y1) + interiorRoof(spec) : roof;
          box(zone === 'padded' ? 'padding' : 'interiorWall', wx, (wallRoof + bottom) / 2, wz, CELL + 0.06, wallRoof - bottom, 0.18, turn);
          if (!slope) {
            box('trim', wx - di * 0.105, y + (name === 'asylum' ? 0.97 : 0.15), wz - dj * 0.105, CELL, name === 'asylum' ? 0.15 : 0.19, 0.04, turn);
            if (name === 'deepsea' && !objects.some((d) => d.type === 'port' && d.face === face)) {
              box('iron', wx - di * 0.16, y + 1.3, wz - dj * 0.16, CELL, 0.055, 0.06, turn);
            }
          }
        } else if (drop) {
          shape(wx, wz, di ? 0.12 : CELL, dj ? 0.12 : CELL);
          if (edgeY > otherY) {
            box('barrierGlass', wx, edgeY + 0.52, wz, CELL, 0.97, 0.055, turn);
            box('iron', wx, edgeY + 1.04, wz, CELL, 0.09, 0.11, turn);
            for (const offset of [-1.6, 1.6]) box('iron', wx + dj * offset, edgeY + 0.54, wz + di * offset, 0.09, 1.08, 0.09);
          } else {
            box('interiorWall', wx, (edgeY + otherY) / 2, wz, CELL, otherY - edgeY, 0.18, turn);
          }
        }
      }

      if (slope) {
        if (name === 'mall' || name === 'prison' || name === 'apartments' && !slope.alongX) {
          for (let k = -1.65; k <= 1.7; k += 0.35) box('iron', x, groundY(x, z + k) + 0.015, z + k, 3.85, 0.06, 0.045);
          for (const side of [-1, 1]) {
            const endY = groundY(x, z - 1.92), startY = groundY(x, z + 1.92);
            c.slopes.push(['slopeRail', x + side * 1.84, (startY + endY) / 2 + 0.85, z, 0.13, 0.13, Math.hypot(4, startY - endY), 0, Math.atan2(endY - startY, 3.84)]);
          }
        }
      } else if (facility && zone !== 'deluge') {
        dressHazardCell({ name, zone, a, b, x, y, z, roof, roll, faces, c, box, shape, sprite, objects, powered });
      } else {
        dressCell({ name, estate, zone, a, b, x, y, z, roof, roll, faces, c, box, sprite, objects, powered });
      }
      for (const obj of objects) {
        if (obj.type === 'gate') {
          const [di, dj] = DIRS[obj.face], gx = x + di * 2, gz = z + dj * 2;
          c.doors.push({ ...obj, id: gateId(i, j, obj.face), x: gx, y, z: gz, along: di ? 'z' : 'x', width: 4.02, height: obj.style === 'bars' ? 3.2 : 2.65, thickness: 0.16 });
          if (roof - y > 2.66 && obj.style !== 'bars') box('interiorWall', gx, (roof + y + 2.65) / 2, gz, CELL, roof - y - 2.65, 0.18, obj.face * Math.PI / 2);
        } else if (obj.type === 'control') {
          const target = obj.system ? `system:${obj.system}:${i - a},${j - b}`
            : obj.flood ? trapId(i - a, j - b) : gateId(i - a + obj.gateI, j - b + obj.gateJ, obj.gateFace);
          c.controls.push({ ...obj, x: x + obj.dx, y, z: z + (obj.dz || 0), target });
        } else if (obj.type === 'hazard') {
          const [di, dj] = [i - a, j - b];
          c.hazards.push({ ...obj, id: `${obj.kind}:${i},${j}`, sector: `${di},${dj}`, x: x + (obj.dx ?? 0), y, roof, z: z + (obj.dz ?? 0),
            phase: roll, doors: obj.kind === 'halon' ? [gateId(di + 4, dj - 2, 0), gateId(di + 4, dj - 7, 0)] : undefined });
        } else if (obj.type === 'facilityProp') {
          dressHazardProp(obj, { x, y, z, c, box, shape, sprite });
        } else if (obj.type === 'cache') {
          c.chest ||= { x: x + 0.65, z: z + 0.7, tier: obj.tier, id: `cache:${i},${j}` };
        } else dressObject(obj, { x, y, z, c, box, shape, sprite, powered, roll });
      }
    }
    if (cx === Math.floor(spawnChest.x / S) && cz === Math.floor(spawnChest.z / S)) c.chest = { ...spawnChest };
    else if (!c.chest && floors.length && hash2(cx, cz, 9) < chestChance * 1.2) {
      const [x, z] = floors[Math.floor(hash2(cx, cz, 17) * floors.length)];
      const tier = hash2(cx, cz, 22);
      c.chest = { x: x + 0.5, z: z + 0.7, id: 'interior:' + id(cx, cz), tier: tier < 0.06 ? 'armory' : tier < 0.2 ? 'red' : tier < 0.45 ? 'blue' : 'common' };
    }
    if (c.chest) c.col.push(c.chest.x, c.chest.z, 0.4);
    if (blockedCache.size >= 450 && !blockedCache.has(id(cx, cz))) blockedCache.clear();
    blockedCache.set(id(cx, cz), { cover: c.cover, doors: c.doors });
    return c;
  }

  function blocked(x0, z0, x1, z1, opened) {
    const di = x1 - x0, dj = z1 - z0;
    let i = cellOf(x0), j = cellOf(z0);
    const gi = cellOf(x1), gj = cellOf(z1), si = Math.sign(di), sj = Math.sign(dj);
    let ti = si ? (lo(i + (si > 0 ? 1 : 0)) - x0) / di : Infinity;
    let tj = sj ? (lo(j + (sj > 0 ? 1 : 0)) - z0) / dj : Infinity;
    // Walk every crossed cell, including the narrow sliver when a beam grazes a corner.
    while (i !== gi || j !== gj) {
      if (i !== gi && (j === gj || ti < tj)) { i += si; ti += CELL / Math.abs(di); }
      else { j += sj; tj += CELL / Math.abs(dj); }
      if (solidCell(i, j)) return true;
    }
    // Train cars, tall fixtures and opaque balcony walls share the world's horizontal cover test.
    for (let a = Math.floor((Math.min(x0, x1) - CELL) / S); a <= Math.floor((Math.max(x0, x1) + CELL) / S); a++) {
      for (let b = Math.floor((Math.min(z0, z1) - CELL) / S); b <= Math.floor((Math.max(z0, z1) + CELL) / S); b++) {
        const chunk = blockedCache.get(id(a, b)) || generateChunk(a, b);
        const { cover } = chunk;
        for (let k = 0; k < cover.length; k += 4) {
          if (segmentHits(x0, z0, x1, z1, cover[k], cover[k + 1], cover[k + 2], cover[k + 3])) return true;
        }
        for (const d of chunk.doors) if (doorIsClosed(d, opened) && segmentHits(x0, z0, x1, z1, ...doorBounds(d, door))) return true;
      }
    }
    return false;
  }
  return {
    name, meta, grid, groundY, roofY, zoneAt, canStep, blocked, spawnChest, generateChunk, interior: true,
    door, facility,
    sectorAt(x, z) { const i = cellOf(x), j = cellOf(z); return `${i - wrap(i)},${j - wrap(j)}`; },
    moveScale: facility ? (x, z) => {
      const zone = zoneAt(x, z);
      return zone === 'brinePool' ? 0.57 : zone === 'saltChannel' ? 0.76 : zone === 'cableHatch' ? 0.62 : zone === 'catwalk' ? 0.87 : 1;
    } : undefined,
    slimeTrap(x, z) {
      const i = cellOf(x), j = Math.round((z / CELL - 9) / SIDE) * SIDE, a = i - wrap(i);
      return { id: trapId(a, j), x: a * CELL, z: (j + 9) * CELL, r: 5.6 };
    },
    slimeWater: (x, z, opened) => delugeWater(cellOf(x), cellOf(z), opened),
    reseed() { blockedCache.clear(); districts.clear(); },
    darkAt: (x, z) => !poweredAt(cellOf(x), cellOf(z)),
  };
}

function dressCell({ name, estate, zone, a, b, x, y, z, roof, roll, faces, c, box, sprite, objects, powered }) {
  const light = (...values) => { if (powered) c.lights.push(...values); };
  const lamp = (kind, dy = 0.13, strength = 1, turn = 0) => {
    const h = roof - dy;
    box('iron', x, h + 0.04, z, 0.48, 0.17, 2.1, turn);
    box(kind === 3 ? 'emergency' : kind === 6 ? 'aqua' : 'fluorescent', x, h - 0.045, z, 0.30, 0.06, kind === 3 ? 0.73 : 1.7, turn);
    light(x, h - 0.2, z, strength, kind);
  };
  if (estate && name !== 'asylum') {
    if (b % 2 === 0 || roll > 0.72) lamp(name === 'prison' ? 3 : 4, 0.17, 1.1);
    if (zone === 'cellblock' || zone === 'gym') {
      if (faces.length && b % 2 === 0) box('iron', x + 1.82, y + 4.0, z + 1.82, 0.23, 8, 0.23);
      if (Math.abs(a) <= 1 || zone === 'gym') box('stripe', x + 1.65, y + 0.012, z, 0.09, 0.017, CELL);
    }
    if (name === 'manor' && zone === 'parlor') box('cushion', x, y + 0.01, z, 3.5, 0.016, 3.6);
    if (zone === 'servant' && roll > 0.55) sprite('web', x + 1.6, y + 1.7, z + 1.6, 1.1, 0.95, 0.012);
  } else if (name === 'asylum') {
    if (zone !== 'surgery' && zone !== 'padded' && (zone === 'hall' || zone === 'reception' ? b % 3 === 0 : roll > 0.63)) lamp(4, 0.16, 1.08);
    if (zone === 'hall' && a === 0 && b < -2 && b % 2 === 0) box('stripe', x + 1.64, y + 0.008, z, 0.08, 0.016, CELL);
    if (!objects.length && faces.length && zone === 'ward' && roll < 0.28) sprite('bed', x + 1.04, y, z + 0.8, 1.45, 0.95, 0);
    if (zone === 'padded' && faces.length && roll > 0.58) sprite('chair', x - 1.1, y, z + 1.1, 0.65, 0.93, 0);
  } else if (name === 'subway') {
    if (zone === 'track') {
      for (const dx of [-0.71, 0.71]) box('iron', x + dx, 0.095, z, 0.08, 0.19, CELL);
      for (let dz = -1.7; dz < 2; dz += 0.76) box('rust', x, 0.025, z + dz, 2.02, 0.07, 0.22);
      if ((a !== 0 && Math.abs(b) % 3 === 1) || (a === 0 && (b === 0 || Math.abs(b) % 5 === 3))) lamp(3, 0.28, 1.38);
      if (b % 3 === 0) {
        box('iron', x, roof - 0.26, z - 1.68, CELL, 0.28, 0.15);
        for (const side of [-1, 1]) box('iron', x + side * 1.15, roof - 0.34, z, 0.065, 0.06, CELL);
      }
    }
    if (zone === 'crossTrack') {
      for (const dz of [-0.71, 0.71]) box('iron', x, 0.095, z + dz, CELL, 0.19, 0.08);
      for (let dx = -1.7; dx < 2; dx += 0.76) box('rust', x + dx, 0.025, z, 0.22, 0.07, 2.02);
      if (a % 3 === 0) lamp(3, 0.24, 1.2, Math.PI / 2);
    }
    if (zone === 'platform' || zone === 'concourse') {
      if (Math.abs(a) === 2) box('stripe', x - Math.sign(a) * 1.83, y + 0.011, z, 0.24, 0.025, CELL);
      if (b % 3 === 0 && Math.abs(a) === 2) lamp(4, 0.42, 1.32, 1.57);
    }
    if (zone === 'service' && roll > 0.68) lamp(3, 0.15, 0.88);
    if (zone === 'flood' && faces.length && roll < 0.32) box('iron', x, 2.25, z, CELL, 0.18, 0.22);
  } else if (name === 'mall') {
    if (zone === 'atrium' && a === 0 && b <= 0 && b % 2 === 0) light(x, 5.1, z, 3.15, 5);
    if (['food', 'store', 'upper'].includes(zone) && roll > 0.7) lamp(4, 0.2, 0.92);
    if (faces.length || zone === 'atrium') {
      const dx = roll > 0.5 ? 1.4 : -1.4, dz = roll > 0.24 ? 1.25 : -1.25;
      if (roll > 0.28) sprite(roll < 0.58 ? 'fern' : 'bush', x + dx, y, z + dz, 1.35, 0.9, 0.12);
      if (faces.length && roll > 0.45) c.details.push({ type: 'vines', x, y: Math.min(y + 3.3, roof - 0.15), z, face: faces[0], split: roll });
    }
    if (zone === 'balcony' && b % 2 === 0) {
      box('iron', x - 1.84, 4.18, z, 0.26, 7.7, 0.29);
      light(x, y + 2.6, z, 1.5, 5);
    }
  } else if (name === 'deepsea') {
    if (zone !== 'flood' && (roll > 0.68 || (a === 0 && b % 2 === 0))) lamp(6, 0.14, 0.92);
    if (zone === 'view') light(x, y + 1.8, z, 0.45, 6);
    if (zone === 'passage' && a === 0 && b % 2 === 0) {
      box('iron', x, roof - 0.21, z - 1.5, CELL, 0.36, 0.32);
      for (const s of [-1, 1]) box('iron', x + s * 1.8, y + 1.6, z - 1.5, 0.28, 3.25, 0.34);
    }
    if (zone === 'flood' && roll > 0.73) lamp(3, 0.13, 0.5);
    if (zone === 'passage') box('stripe', x - 1.2, y + 0.008, z, 0.08, 0.016, CELL);
  } else if ((zone === 'office' && (roll > 0.39 || !b)) || (['utility', 'archive'].includes(zone) && roll > 0.63) || roll > 0.96) {
    lamp(zone === 'utility' || zone === 'archive' ? 3 : 7, 0.09, zone === 'dim' ? 0.56 : 1.04, a % 2 === 0 ? 0 : Math.PI / 2);
  }
}

function dressObject(obj, { x, y, z, c, box, shape, sprite, powered, roll }) {
  const px = x + (obj.dx || 0), pz = z + (obj.dz || 0), turn = obj.turn || 0;
  const part = (layer, dx, h, dz, w, tall, d) => box(layer, px + dx * Math.cos(turn) + dz * Math.sin(turn), y + h, pz + dz * Math.cos(turn) - dx * Math.sin(turn), w, tall, d, turn);
  switch (obj.type) {
    case 'prop':
      sprite(obj.kind, px, y, pz, obj.w, obj.h, 0.016);
      if (obj.cover) shape(px, pz, obj.w * 0.75, 0.65, true);
      break;
    case 'debris':
      c.hazards.push({ x, z, kind: obj.kind, radius: 1.75 });
      for (let i = 0; i < 18; i++) {
        const a = (roll + i) * 2.399, r = 0.19 + ((i * 11) % 17) * 0.09;
        box(obj.kind === 'glass' ? 'railGlass' : 'wood', x + Math.cos(a) * r, y + 0.019, z + Math.sin(a) * r, 0.18 + (i % 4) * 0.06, 0.034, 0.07, a);
      }
      break;
    case 'tower':
      if (wrap(cellOf(z)) === -5) c.details.push({ type: 'towerLight', x, y, z });
      for (const dx of [-1.68, 1.68]) for (const dz of [-1.58, 1.58]) {
        box('iron', x + dx, y * 0.5, z + dz, 0.28, y, 0.28);
        box('iron', x + dx, y + 1.14, z + dz, 0.16, 2.28, 0.16);
      }
      part('iron', 0, 2.27, 0, 3.6, 0.12, 3.6);
      part('barrierGlass', 0, 1.43, -1.6, 3.56, 0.88, 0.05);
      part('barrierGlass', 0, 1.43, 1.6, 3.56, 0.88, 0.05);
      break;
    case 'moonwindow': {
      const [di, dj] = DIRS[obj.face], turn = obj.face * Math.PI / 2;
      const wx = x + di * 1.84, wz = z + dj * 1.84;
      box('moonPane', wx, y + 3.25, wz, 2.75, 2.6, 0.04, turn);
      for (const offset of [-1.36, 0, 1.36]) box('iron', wx - di * 0.03 + dj * offset, y + 3.25, wz - dj * 0.03 - di * offset, 0.08, 2.62, 0.08, turn);
      for (const offset of [-1.24, 0, 1.24]) box('iron', wx - di * 0.035, y + 3.25 + offset, wz - dj * 0.035, 2.76, 0.08, 0.07, turn);
      c.lights.push(wx, y + 3.25, wz, 1.25, 9);
      break;
    }
    case 'bleachers':
      for (let step = 0; step < 4; step++) part('wood', 0, 0.16 + step * 0.19, step * 0.43 - 0.68, 3.65, 0.32 + step * 0.38, 0.46);
      part('iron', 0, 1.42, 0.86, 3.64, 0.09, 0.095);
      shape(px, pz, 1.8, 3.65, true);
      break;
    case 'parlor':
    case 'apartment':
      sprite(obj.type === 'parlor' ? 'armchair' : 'bed', px - 1.0, y, pz + 0.92, 1.55, 1.28, 0);
      sprite(obj.type === 'parlor' ? 'clock' : 'cabinet', px + 1.20, y, pz - 1.24, 0.82, 2.0, 0);
      shape(px + 1.2, pz - 1.24, 0.8, 0.54, true);
      part('wood', -0.45, 0.65, -0.65, 0.87, 0.12, 0.76);
      break;
    case 'sign':
    case 'port':
    case 'mannequin':
      c.details.push({ ...obj, x: px, y, z: pz, powered });
      if (obj.type === 'mannequin') shape(px, pz, 0.55, 0.38);
      break;
    case 'fold':
    case 'transition': {
      const [di, dj] = DIRS[obj.face];
      c.links.push({ ...obj, di, dj, x: x + di * 1.35, z: z + dj * 1.35, toX: x + (obj.toI - wrap(cellOf(x))) * CELL, toZ: z + (obj.toJ - wrap(cellOf(z))) * CELL });
      c.details.push({ ...obj, x, y, z });
      break;
    }
    case 'train': {
      part('iron', 0, 0.47, 0, 2.70, 0.56, 7.62);
      part('carriage', 0, 1.47, 0, 2.72, 1.66, 7.8);
      part('carriage', 0, 2.51, 0, 2.82, 0.4, 7.86);
      for (const s of [-1, 1]) {
        part('stripe', s * 1.375, 1.33, 0, 0.033, 0.14, 7.8);
        for (let k = -3; k <= 3; k += 1.5) {
          const broken = obj.broken && k >= 0;
          part(broken ? 'black' : 'railGlass', s * 1.385, 1.91, k, 0.05, broken ? 0.68 : 0.46, 1.09);
          if (broken) part('rust', s * 1.42, 1.51, k + 0.23, 0.11, 0.18, 0.43);
        }
        part('black', 0, 1.9, s * 3.92, 1.78, 0.63, 0.04);
        part('iron', 0, 0.48, s * 4.08, 0.44, 0.2, 0.40);
      }
      shape(px, pz, 2.75, 7.83, true);
      break;
    }
    case 'gurney':
    case 'bed':
      part('rust', 0, 0.66, 0, 0.77, 0.14, 1.83);
      part(obj.surgical ? 'iron' : 'cushion', 0, 0.79, 0, 0.7, 0.13, 1.74);
      part('cushion', 0, 0.88, 0.59, 0.53, 0.10, 0.39);
      for (const dx of [-0.30, 0.30]) for (const dz of [-0.65, 0.65]) {
        part('rust', dx, 0.35, dz, 0.065, 0.58, 0.065);
        part('black', dx, 0.085, dz, 0.095, 0.13, 0.12);
      }
      if (obj.surgical) {
        part('iron', 0, 2.59, 0.15, 0.09, 0.92, 0.09);
        part('rust', 0, 2.22, 0.15, 0.81, 0.15, 0.54);
        part('black', 0, 2.13, 0.15, 0.66, 0.08, 0.39);
      } else if (obj.type === 'gurney') {
        part('iron', 0.59, 0.82, 0.57, 0.04, 1.61, 0.04);
        part('iron', 0.59, 1.64, 0.57, 0.25, 0.05, 0.13);
        part('railGlass', 0.68, 1.48, 0.57, 0.14, 0.23, 0.075);
      }
      shape(px, pz, turn > 1 ? 1.82 : 0.82, turn > 1 ? 0.82 : 1.82);
      break;
    case 'screen':
    case 'partition':
      part(obj.type === 'screen' ? 'cushion' : 'padding', 0, 1.06, 0, 1.79, 1.42, 0.10);
      for (const side of [-1, 1]) part('iron', side * 0.92, 1, 0, 0.05, 2, 0.09);
      shape(px, pz, 1.82, 0.18, true);
      break;
    case 'console':
    case 'machinery':
      part('iron', 0, 0.65, 0, 1.9, 1.29, 0.73);
      part('black', 0, 1.43, 0.31, 1.6, 0.63, 0.16);
      for (const dx of [-0.48, 0, 0.48]) {
        part('aqua', dx, 1.51, 0.40, 0.29, 0.20, 0.04);
        part('emergency', dx + 0.09, 1.26, 0.40, 0.06, 0.055, 0.03);
      }
      shape(px, pz, 1.9, 0.9, true);
      break;
    case 'bench':
    case 'chair':
    case 'table':
    case 'desk':
    case 'schoolDesk': {
      const w = obj.type === 'chair' ? 0.55 : 1.52, table = ['table', 'desk', 'schoolDesk'].includes(obj.type);
      part(table ? 'cushion' : 'rust', 0, table ? 0.78 : 0.45, 0, w, 0.10, 0.63);
      if (obj.type === 'schoolDesk') part('wood', 0, 0.51, -0.24, w - 0.12, 0.45, 0.12);
      if (!table) part('cushion', 0, 0.78, -0.28, w, 0.43, 0.08);
      for (const s of [-1, 1]) for (const t of [-1, 1]) part('iron', s * (w / 2 - 0.08), table ? 0.38 : 0.21, t * 0.26, 0.052, table ? 0.78 : 0.42, 0.052);
      if (obj.type === 'table') {
        sprite('chair', px - 0.95, y, pz + 0.15, 0.6, 0.87, 0);
        sprite('chair', px + 0.95, y, pz + 0.2, 0.6, 0.87, 0);
      }
      shape(px, pz, w, 0.63, obj.type === 'schoolDesk');
      break;
    }
    case 'planter':
    case 'kiosk':
      part('trim', 0, 0.29, 0, 2.14, 0.59, 1.16);
      if (obj.type === 'kiosk') {
        part('black', 0, 1.51, -0.26, 1.7, 1.58, 0.22);
        part('railGlass', 0, 1.55, -0.10, 1.57, 1.35, 0.11);
        c.details.push({ type: 'sign', text: 'DIRECTORY', placement: 'kiosk', face: 2, dy: 1.95, x: px, y, z: pz });
      }
      sprite('fern', px - 0.58, y + 0.41, pz + 0.3, 1.2, 0.92, 0.16);
      sprite('bush', px + 0.51, y + 0.39, pz - 0.19, 1.45, 1.3, 0.13);
      shape(px, pz, 2.14, 1.16, obj.type === 'kiosk');
      break;
    case 'rack':
    case 'lockers':
      for (const side of [-1, 1]) part('rust', side * 0.67, 0.92, 0, 0.06, 1.83, 0.55);
      if (obj.type === 'rack') {
        for (let h = 0.26; h < 1.84; h += 0.5) part('iron', 0, h, 0, 1.35, 0.06, 0.57);
        sprite('crate', px + 0.31, y + 0.29, pz, 0.47, 0.44, 0);
      } else {
        part('iron', 0, 0.92, 0, 1.30, 1.82, 0.52);
        for (const dx of [-0.42, 0, 0.42]) {
          part('rust', dx, 0.92, 0.28, 0.40, 1.70, 0.04);
          part('black', dx, 1.48, 0.31, 0.31, 0.105, 0.037);
          part('iron', dx + 0.10, 1.0, 0.32, 0.08, 0.16, 0.04);
        }
      }
      shape(px, pz, 1.4, 0.6, obj.type === 'lockers');
      break;
  }
}
