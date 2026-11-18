import * as THREE from 'three';

const SIZE = 128;
const mix = (a, b, k) => a + (b - a) * k;
const curve = (a, b, value) => {
  const k = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function hash(i, j, seed) {
  const n = Math.imul(i, 2246822519) ^ Math.imul(j, 3266489917) ^ seed;
  return (Math.imul(n ^ (n >>> 15), 668265263) >>> 0) / 4294967296;
}
const wrap = (n, span) => (n % span + span) % span;

// Tile both axes so folds and scars meet cleanly at the model's UV seams.
function noise(u, v, columns, rows, seed) {
  const x = u * columns, y = v * rows;
  const i = Math.floor(x), j = Math.floor(y);
  const fx = curve(0, 1, x - i), fy = curve(0, 1, y - j);
  const x0 = wrap(i, columns), x1 = wrap(i + 1, columns);
  const y0 = wrap(j, rows), y1 = wrap(j + 1, rows);
  return mix(mix(hash(x0, y0, seed), hash(x1, y0, seed), fx),
    mix(hash(x0, y1, seed), hash(x1, y1, seed), fx), fy);
}

function fissures(u, v, columns, rows) {
  const x = u * columns, y = v * rows;
  const i = Math.floor(x), j = Math.floor(y);
  let first = Infinity, second = Infinity;
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
    const px = wrap(a, columns), py = wrap(b, rows);
    const dx = a + 0.13 + 0.74 * hash(px, py, 7187) - x;
    const dy = b + 0.13 + 0.74 * hash(px, py, 9389) - y;
    const d = dx * dx + dy * dy;
    if (d < first) { second = first; first = d; }
    else if (d < second) second = d;
  }
  return 1 - curve(0.014, 0.19, second - first);
}

const surfaces = {
  hide: {
    shade: [69, 47, 52], pale: [175, 160, 143], scar: [68, 35, 45], bump: 0.042,
    sample(u, v, cloud, grit, grain) {
      const lines = fissures(u + grain * 0.022, v + cloud * 0.028, 5, 4);
      const blots = curve(0.28, 0.72, noise(u, v, 6, 6, 15001));
      const crack = lines * (0.43 + blots * 0.57);
      return [0.23 + cloud * 0.75 + grit * 0.14 - blots * 0.29, crack * 0.79,
        0.34 + cloud * 0.36 + grain * 0.12 - crack * 0.37, 0.66 + grit * 0.23 - crack * 0.15];
    },
  },
  tendon: {
    shade: [40, 22, 23], pale: [139, 90, 77], scar: [163, 105, 94], bump: 0.023,
    sample(u, v, cloud, grit, grain) {
      const twist = noise(u, v, 5, 3, 8801) * 1.17 + noise(u, v, 12, 9, 2101) * 0.21;
      const ribs = 0.5 + 0.5 * Math.sin((u * 18 + twist) * Math.PI * 2);
      const fibers = curve(0.65, 0.98, ribs);
      return [0.15 + cloud * 0.50 + fibers * 0.25, fibers * (0.16 + 0.30 * grit),
        0.23 + ribs * 0.43 + grain * 0.21, 0.74 - ribs * 0.25 + grit * 0.12];
    },
  },
  bone: {
    shade: [96, 72, 57], pale: [213, 197, 161], scar: [87, 67, 55], bump: 0.022,
    sample(u, v, cloud, grit, grain) {
      const etch = fissures(u + grain * 0.009, v + cloud * 0.036, 12, 5);
      const pits = curve(0.62, 0.89, grit);
      return [0.42 + cloud * 0.50 + grain * 0.18 - pits * 0.31, etch * (0.22 + grit * 0.27),
        0.61 + grain * 0.29 - pits * 0.21 - etch * 0.27, 0.61 + grit * 0.28];
    },
  },
  core: {
    shade: [58, 15, 29], pale: [139, 53, 59], scar: [51, 16, 34], bump: 0.021,
    sample(u, v, cloud, grit, grain) {
      const vessels = fissures(u + cloud * 0.070, v + grit * 0.03, 6, 5);
      return [0.34 + cloud * 0.57 + grit * 0.14, vessels * 0.54,
        0.25 + cloud * 0.53 + grain * 0.11 + vessels * 0.17, 0.39 + grit * 0.15 - vessels * 0.13];
    },
  },
};

function texture(bytes, colorSpace) {
  const result = new THREE.DataTexture(bytes, SIZE, SIZE, THREE.RGBAFormat);
  result.colorSpace = colorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.needsUpdate = true;
  return result;
}

export function consumerSurface(name) {
  const profile = surfaces[name];
  const color = new Uint8Array(SIZE * SIZE * 4);
  const relief = new Uint8Array(color.length);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const u = (i + 0.5) / SIZE, v = (j + 0.5) / SIZE;
    const cloud = noise(u, v, 5, 5, 1703);
    const grit = noise(u, v, 19, 17, 6011);
    const grain = hash(i, j, 20249);
    const [depth, detail, height, roughness] = profile.sample(u, v, cloud, grit, grain);
    const index = (j * SIZE + i) * 4;
    for (let k = 0; k < 3; k++) {
      color[index + k] = mix(mix(profile.shade[k], profile.pale[k], curve(0, 1, depth)), profile.scar[k], detail);
    }
    color[index + 3] = 255;
    // Three.js samples bump from red and roughness from green, so one texture supplies both.
    relief[index] = Math.round(Math.min(1, Math.max(0, height)) * 255);
    relief[index + 1] = Math.round(Math.min(1, Math.max(0, roughness)) * 255);
    relief[index + 3] = 255;
  }
  const finish = texture(relief, THREE.NoColorSpace);
  return { map: texture(color, THREE.SRGBColorSpace), bumpMap: finish, roughnessMap: finish, bumpScale: profile.bump, roughness: 1 };
}
