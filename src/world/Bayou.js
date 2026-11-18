import { doorBounds, segmentHits } from './Cover.js';

export const BAYOU_META = {
  label: 'THE BLACKWATER BAYOU', fog: 0x070603, fogDensity: 0.071, beamRange: 27,
  ambient: [0x000000, 0], eerie: 0.38, weather: 'drips',
  ground: ['#262b1e', '#303020', '#333024', '#3b3226', '#43402b'],
  hint: 'The raised boardwalks skirt the mud. Pull the chain to raise the old floodgate.',
};

const SPACING = 48, WIDTH = 1.5, DECK = 0.46;
const local = (v) => v - Math.round(v / SPACING) * SPACING;
const onDeck = (x, z) => Math.abs(local(x)) < WIDTH || Math.abs(local(z)) < WIDTH;
const door = { W: 3, H: 2.65, T: 0.16 };

export function createBayou({ S, atlas, hash2, mulberry, noise, chestChance }) {
  const caches = new Map();
  const footingAt = (x, z) => onDeck(x, z) ? 'boardwalk' : noise(x, z, 17, 503) > 0.59 ? 'island' : 'mud';
  const groundY = (x, z) => onDeck(x, z) ? DECK : 0;
  const spawnChest = { x: 0.45, z: -7.4, id: 'bayou:spawn', tier: 'common' };

  function generateChunk(cx, cz) {
    const c = { props: [], glow: [], col: [], cover: [], aabb: [], boxes: {}, chest: null, lights: [], vents: [],
      doors: [], houses: [], secrets: [], cameraWords: [], controls: [] };
    const r = mulberry(Math.floor(hash2(cx, cz, 501) * 4294967296));
    const ox = cx * S, oz = cz * S;
    const owns = (x, z) => x >= ox && x < ox + S && z >= oz && z < oz + S;
    const add = (layer, x, y, z, w, h, d, turn = 0) => (c.boxes[layer] ||= []).push(x, y, z, w, h, d, turn);
    const sprite = (name, x, z, w, h, sway, y = 0) => {
      const cells = atlas.sprites[name];
      c.props.push(x, z, w, h, cells[Math.floor(r() * cells.length)], sway, y);
    };
    if (owns(spawnChest.x, spawnChest.z)) c.chest = { ...spawnChest };
    else if (r() < chestChance * 1.4) {
      const x = ox + 2 + r() * (S - 4), z = oz + 2 + r() * (S - 4);
      if (footingAt(x, z) !== 'mud') c.chest = { x, z, id: `bayou:${cx},${cz}`, tier: r() < 0.24 ? 'blue' : 'common' };
    }
    if (c.chest) c.col.push(c.chest.x, c.chest.z, 0.33);
    for (let i = 0; i < S; i += 4) for (let j = 0; j < S; j += 4) {
      const x = ox + i + 2, z = oz + j + 2;
      if (footingAt(x, z) === 'mud') add('bayouWater', x, 0.015, z, 4, 0.04, 4);
    }
    for (let i = 0; i < S; i += 0.5) {
      const x = ox + i + 0.25, z = oz + i + 0.25;
      if (Math.abs(local(ox)) < 0.01) add('wood', ox + (r() - 0.5) * 0.09, DECK - 0.07, z, WIDTH * 2, 0.14, 0.47);
      if (Math.abs(local(oz)) < 0.01 && Math.abs(local(x)) >= WIDTH) add('wood', x, DECK - 0.07, oz + (r() - 0.5) * 0.09, 0.47, 0.14, WIDTH * 2);
    }
    if (Math.abs(local(ox)) < 0.01) for (let i = 2; i < S; i += 4) for (const side of [-1, 1]) {
      add('wood', ox + side * 1.44, 0.43, oz + i, 0.14, 0.85, 0.16);
      if (r() > 0.56) add('wood', ox + side * 1.44, 0.84, oz + i, 0.09, 0.14, 3.92);
    }
    if (Math.abs(local(oz)) < 0.01) for (let i = 2; i < S; i += 4) for (const side of [-1, 1]) {
      add('wood', ox + i, 0.43, oz + side * 1.44, 0.16, 0.85, 0.14);
    }
    for (let n = 0; n < 20; n++) {
      const x = ox + r() * S, z = oz + r() * S;
      if (onDeck(x, z) || Math.hypot(x, z) < 4 || (c.chest && Math.hypot(x - c.chest.x, z - c.chest.z) < 1.5)) continue;
      const h = 4.8 + r() * 5.1;
      sprite(r() < 0.45 ? 'yarddead' : 'oak', x, z, h * 0.8, h, 0.008);
      const width = 0.34 + h * 0.036;
      add('bark', x, h * 0.22, z, width, h * 0.47, width, r() * Math.PI);
      c.col.push(x, z, width * 0.55);
      c.cover.push(x - width / 2, z - width / 2, x + width / 2, z + width / 2);
      for (const side of [-1, 1]) add('bark', x + side * width * 0.58, 0.28, z, width * 0.53, 0.58, width * (1.5 + r()));
    }
    for (let n = 0; n < 210; n++) {
      const x = ox + r() * S, z = oz + r() * S, growth = noise(x, z, 11, 506);
      if (onDeck(x, z) || r() + 0.25 > 1.2 * growth || (c.chest && Math.hypot(x - c.chest.x, z - c.chest.z) < 1.25)) continue;
      const tall = footingAt(x, z) === 'mud' && r() > 0.22;
      sprite(tall ? 'drygrass' : 'fern', x, z, 0.63 + r() * 0.53, tall ? 1.6 + r() * 1.15 : 0.7 + r() * 0.6, 0.105);
      if (tall && n % 5 === 0) c.cover.push(x - 0.24, z - 0.24, x + 0.24, z + 0.24);
    }
    const gx = Math.round((cx * S + S / 2) / SPACING) * SPACING;
    const gz = Math.round((cz * S + S / 2 + 13) / SPACING) * SPACING;
    const id = `bayou:sluice:${gx},${gz}`;
    if (owns(gx, gz - 13)) {
      c.doors.push({ id, x: gx, y: DECK, z: gz - 13, along: 'x', style: 'bars', mode: 'locked' });
      for (const s of [-1, 1]) add('bark', gx + s * 1.48, 1.52, gz - 13, 0.22, 3.02, 0.23);
    }
    if (owns(gx + 1.08, gz - 10)) {
      c.controls.push({ target: id, x: gx + 1.08, y: DECK, z: gz - 10, label: 'Pull the sluice chain' });
      sprite('sign', gx + 1.23, gz - 9.1, 0.72, 1.45, 0, DECK);
    }
    if (owns(gx + 0.67, gz - 17) && !c.chest) {
      c.chest = { x: gx + 0.67, z: gz - 17, id: `bayou:cache:${gx},${gz}`, tier: 'blue' };
      c.col.push(c.chest.x, c.chest.z, 0.34);
    }
    if (caches.size >= 400 && !caches.has(`${cx},${cz}`)) caches.clear();
    caches.set(`${cx},${cz}`, { cover: c.cover, doors: c.doors });
    return c;
  }

  return {
    name: 'swamp', meta: BAYOU_META, groundY, generateChunk, spawnChest, door, footingAt,
    moveScale: (x, z) => footingAt(x, z) === 'mud' ? 0.58 : 1,
    reseed: () => caches.clear(),
    blocked(x0, z0, x1, z1, opened, swallowed) {
      for (let a = Math.floor((Math.min(x0, x1) - 2) / S); a <= Math.floor((Math.max(x0, x1) + 2) / S); a++) {
        for (let b = Math.floor((Math.min(z0, z1) - 1) / S); b <= Math.floor((Math.max(z0, z1) + 1) / S); b++) {
          const chunk = caches.get(`${a},${b}`) || generateChunk(a, b);
          for (let i = 0; i < chunk.cover.length; i += 4) {
            if (swallowed?.((chunk.cover[i] + chunk.cover[i + 2]) / 2, (chunk.cover[i + 1] + chunk.cover[i + 3]) / 2)) continue;
            if (segmentHits(x0, z0, x1, z1, chunk.cover[i], chunk.cover[i + 1], chunk.cover[i + 2], chunk.cover[i + 3])) return true;
          }
          if (chunk.doors.some((d) => !opened?.has(d.id) && !swallowed?.(d.x, d.z) && segmentHits(x0, z0, x1, z1, ...doorBounds(d, door)))) return true;
        }
      }
      return false;
    },
  };
}
