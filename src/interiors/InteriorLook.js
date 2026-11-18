// Pixel-scale architectural surfaces and the few props that need more than instanced boxes.
import * as THREE from 'three';
import { FACILITY_THEMES } from './HazardLook.js';

const THEMES = {
  asylum: { wall: ['#a2aaa0', '#566764', '#415b58'], floor: ['#727d75', '#3d4744'], ceiling: ['#767f76', '#454b49'], trim: 0x47615c, sign: ['#324138', '#e6e8d3'], paint: 0x64867d },
  subway: { wall: ['#74736a', '#333438', '#3f3932'], floor: ['#79766a', '#454037'], ceiling: ['#55514e', '#27272d'], trim: 0x544841, sign: ['#39282b', '#f0dca3'], paint: 0xceac4f },
  mall: { wall: ['#a29d91', '#55544b', '#64746b'], floor: ['#aaa391', '#515a55'], ceiling: ['#888e88', '#4a4f51'], trim: 0x657b65, sign: ['#354942', '#f1e5c9'], paint: 0x7a8f6d },
  deepsea: { wall: ['#768e8d', '#384748', '#365861'], floor: ['#687678', '#343f42'], ceiling: ['#5e6d6e', '#344344'], trim: 0x325860, sign: ['#173238', '#cbe7dd'], paint: 0xafaa5e },
  backrooms: { wall: ['#c5af78', '#948354', '#71603b'], floor: ['#8c7951', '#51472f'], ceiling: ['#a59b76', '#615b48'], trim: 0x68583a, sign: ['#52492a', '#e5d5a0'], paint: 0x8d784c },
  prison: { wall: ['#777c76', '#424744', '#4e554e'], floor: ['#626b66', '#323b39'], ceiling: ['#525852', '#323637'], trim: 0x454d48, sign: ['#252827', '#ded6ad'], paint: 0x90764a },
  manor: { wall: ['#80604e', '#392a28', '#68533d'], floor: ['#6c4331', '#352923'], ceiling: ['#908778', '#433c34'], trim: 0x5c3930, sign: ['#3a2822', '#e0c99b'], paint: 0x927751 },
  apartments: { wall: ['#797473', '#484448', '#655c55'], floor: ['#5c5856', '#363033'], ceiling: ['#686866', '#464147'], trim: 0x544b46, sign: ['#312b30', '#e4cfac'], paint: 0x966b54 },
  school: { wall: ['#838277', '#4d514a', '#666b43'], floor: ['#817456', '#453a31'], ceiling: ['#8b8780', '#474549'], trim: 0x494e40, sign: ['#333d38', '#d3dec7'], paint: 0x806c42 },
  ...FACILITY_THEMES,
};
const WALL_BEARING = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const WALL_DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const V = new THREE.Vector3(), DIR = new THREE.Vector3();

export function installInteriorLook(name, { scene, addLayer, boxMaterial, paintTexture }) {
  const theme = THEMES[name];
  const textile = name === 'backrooms', tile = ['asylum', 'subway', 'school'].includes(name);
  const surface = (salt, bg, lines, draw, gain = 1, size = 64) => {
    const map = paintTexture(size, salt, (g, rng, n) => {
      g.fillStyle = bg; g.fillRect(0, 0, n, n);
      draw(g, rng, n, lines);
    });
    return boxMaterial({ map, gain, tile: 4, bias: 0.65 });
  };
  function chips(g, r, n, color, count = 340, opacity = 0.24) {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      g.globalAlpha = r() * opacity;
      g.fillRect(r() * n | 0, r() * n | 0, 1 + (r() * 2 | 0), 1 + (r() * 2 | 0));
    }
    g.globalAlpha = 1;
  }
  function seams(g, n, color, xStep, yStep) {
    g.fillStyle = color; g.globalAlpha = 0.48;
    for (let k = 0; k < n; k += xStep) g.fillRect(k, 0, 1, n);
    for (let k = 0; k < n; k += yStep) g.fillRect(0, k, n, 1);
    g.globalAlpha = 1;
  }
  const wall = surface(0xe017, theme.wall[0], theme.wall.slice(1), (g, r, n, [dark, band]) => {
    if (tile) {
      seams(g, n, dark, 8, 8);
      g.fillStyle = band; g.globalAlpha = 0.52; g.fillRect(0, n - 16, n, 16); g.globalAlpha = 1;
    } else if (textile || name === 'manor') {
      g.fillStyle = dark; g.globalAlpha = 0.37;
      for (let i = 0; i < n; i += 8) {
        g.fillRect(i, 0, 1, n);
        for (let j = 3; j < n; j += 10) { g.fillRect(i + 2, j, 3, 1); g.fillRect(i + 3, j + 1, 1, name === 'manor' ? 4 : 2); }
      }
      g.globalAlpha = 1;
    } else if (name === 'deepsea') {
      seams(g, n, dark, 32, 24);
      g.fillStyle = band;
      for (const x of [3, 28, 35, 60]) for (const y of [4, 20, 28, 44, 52, 60]) g.fillRect(x, y, 2, 2);
    } else seams(g, n, dark, 32, 16);
    chips(g, r, n, dark, 550, 0.34);
    for (let i = 0; i < 15; i++) {
      g.fillStyle = dark; g.globalAlpha = 0.10 + r() * 0.2;
      g.fillRect(r() * n | 0, r() * n | 0, 1 + (r() * 3 | 0), 4 + (r() * 21 | 0));
    }
    g.globalAlpha = 1;
  }, 1.27);
  const floor = surface(0xe018, theme.floor[0], theme.floor[1], (g, r, n, dark) => {
    if (!textile) seams(g, n, dark, tile ? 8 : 16, tile ? 8 : 16);
    chips(g, r, n, dark, textile ? 1500 : 540, textile ? 0.84 : 0.37);
    chips(g, r, n, '#d8c9a5', 200, 0.20);
    if (textile) {
      for (let i = 0; i < 5; i++) {
        const x = r() * n, y = r() * n, radius = 3 + r() * 12;
        const stain = g.createRadialGradient(x, y, 0, x, y, radius);
        stain.addColorStop(0, '#382a1aaa'); stain.addColorStop(1, '#382a1a00');
        g.fillStyle = stain; g.fillRect(0, 0, n, n);
      }
    }
  }, 1.2);
  const ceiling = surface(0xe019, theme.ceiling[0], theme.ceiling[1], (g, r, n, dark) => {
    seams(g, n, dark, textile ? 16 : 32, textile ? 16 : 32);
    chips(g, r, n, dark, 780, 0.43);
  });
  const service = surface(0xe01a, name === 'asylum' ? '#4c5553' : '#575550', '#302d28', (g, r, n, dark) => {
    seams(g, n, dark, 16, 16); chips(g, r, n, dark, 660, 0.61);
  });
  const padding = surface(0xe01b, name === 'asylum' ? '#b1a78e' : '#827950', '#514737', (g, r, n, dark) => {
    for (let y = 0; y < n; y += 12) for (let x = 0; x < n; x += 12) {
      g.globalAlpha = 0.56; g.fillStyle = dark; g.fillRect(x, y, 12, 1); g.fillRect(x, y, 1, 12);
      g.globalAlpha = 0.32; g.fillStyle = '#e9d5ad'; g.fillRect(x + 1, y + 1, 10, 2);
      g.globalAlpha = 0.41; g.fillStyle = dark; g.fillRect(x + 2, y + 10, 9, 2);
    }
    g.globalAlpha = 1; chips(g, r, n, dark, 400, 0.4);
  }, 1.23);
  const iron = surface(0xe01c, '#626669', '#232628', (g, r, n, dark) => {
    chips(g, r, n, dark, 640, 0.54); chips(g, r, n, '#ab8d73', 280, 0.27);
  });
  const rust = surface(0xe01d, '#68483a', '#402c26', (g, r, n, dark) => {
    chips(g, r, n, dark, 560, 0.69); chips(g, r, n, '#ab6243', 330, 0.56);
  });
  const specs = {
    interiorWall: [wall, 2200], interiorFloor: [floor, 850], interiorCeiling: [ceiling, 900],
    serviceFloor: [service, 850], stairs: [service, 100], slopeRail: [iron, 150], trackFloor: [service, 850],
    iron: [iron, 4100], rust: [rust, 3100], carriage: [iron, 450], padding: [padding, 540], trim: [boxMaterial({ color: theme.trim, bias: 0.55 }), 2300],
    stripe: [boxMaterial({ color: theme.paint, bias: 1 }), 1250],
    black: [boxMaterial({ color: 0x151619, bias: 0.5 }), 900],
    deadLamp: [boxMaterial({ color: 0x51514b, bias: 0.35 }), 1300],
    cushion: [boxMaterial({ color: name === 'asylum' ? 0x777665 : 0x785447, bias: 0.55 }), 900],
    railGlass: [boxMaterial({ color: 0x52696b, bias: 0.42 }), 850],
    barrierGlass: [new THREE.MeshLambertMaterial({ color: 0x718d98, transparent: true, depthWrite: false, opacity: 0.27 }), 500],
    moonPane: [boxMaterial({ color: 0x546b8b, unlit: true }), 100],
    fluorescent: [boxMaterial({ color: name === 'backrooms' ? 0xe6dfb4 : 0xc8ded6, unlit: true }), 850],
    aqua: [boxMaterial({ color: 0x43c8c3, unlit: true }), 850],
    emergency: [boxMaterial({ color: 0xd44f28, unlit: true }), 500],
  };
  if (Object.hasOwn(FACILITY_THEMES, name)) {
    specs.amberDiode = [boxMaterial({ color: 0xaf6d2c, unlit: true }), 620];
    specs.icePlate = [boxMaterial({ color: 0x637582, bias: 0.82 }), 375];
    if (name === 'cathedral') specs.saltCrust = [boxMaterial({ color: 0x8b9085, bias: 0.65 }), 720];
    specs.serverLed = [boxMaterial({ color: 0x234944, unlit: true }), 1800];
    specs.serverLamp = [boxMaterial({ color: 0x57b0ac, unlit: true }), 400];
  }

  for (const [key, [material, cap]] of Object.entries(specs)) addLayer(key, material, cap);

  const signMaterials = new Map();
  const glassGeo = new THREE.CircleGeometry(1.23, 36);
  const gasket = new THREE.TorusGeometry(1.23, 0.095, 8, 36);
  const gasketMat = new THREE.MeshLambertMaterial({ color: 0x547578, flatShading: true });
  const studGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.048, 7);
  const viewportTexture = paintedViewport();
  const viewportMat = new THREE.MeshBasicMaterial({ map: viewportTexture, color: 0xa2c8cb, side: THREE.DoubleSide });
  const darkViewportMat = new THREE.MeshLambertMaterial({ map: viewportTexture, color: 0xa2c8cb, side: THREE.DoubleSide });
  const glassShardMat = new THREE.MeshBasicMaterial({ color: 0x698597, opacity: 0.39, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const darkShardMat = new THREE.MeshLambertMaterial({ color: 0x698597, opacity: 0.39, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x2b4155, side: THREE.DoubleSide });
  const dollMat = new THREE.MeshLambertMaterial({ color: 0xb0a798, flatShading: true });
  const standMat = new THREE.MeshLambertMaterial({ color: 0x4a5651 });
  const sphere = new THREE.SphereGeometry(1, 9, 7);
  const limb = new THREE.CylinderGeometry(0.74, 1, 1, 8);
  const domeGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 1.85, 0, Math.PI * 0.5);
  const canvasGeo = new THREE.PlaneGeometry(2.65, 1.53, 8, 3);
  const canvasMat = new THREE.MeshLambertMaterial({ color: 0x746b58, side: THREE.DoubleSide });
  const furMat = new THREE.MeshLambertMaterial({ color: 0x594938, flatShading: true });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  const chunks = new Map();

  function canvasTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }
  function paintedViewport() {
    if (name !== 'deepsea') return null;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), glow = g.createRadialGradient(117, 76, 3, 128, 132, 175);
    glow.addColorStop(0, '#2f7780'); glow.addColorStop(0.48, '#0d354e'); glow.addColorStop(1, '#020a19');
    g.fillStyle = glow; g.fillRect(0, 0, 256, 256);
    const r = prng(18935);
    for (let i = 0; i < 310; i++) {
      g.fillStyle = i % 5 ? 'rgba(168,213,203,.12)' : 'rgba(190,231,217,.33)';
      const x = r() * 256, y = r() * 256; g.fillRect(x, y, r() < 0.85 ? 1 : 2, 1);
    }
    g.fillStyle = '#0b283c';
    g.beginPath(); g.moveTo(0, 206); g.bezierCurveTo(82, 142, 174, 231, 256, 173);
    g.lineTo(256, 256); g.lineTo(0, 256); g.fill();
    for (const [startX, startY] of [[188, 86], [61, 171]]) {
      for (let i = 0; i < 8; i++) {
        const angle = i * 0.79 + r() * 0.37;
        let x = startX, y = startY;
        g.beginPath(); g.moveTo(x, y);
        for (let n = 0; n < 5; n++) { x += Math.cos(angle) * (7 + r() * 12) + (r() - 0.5) * 9; y += Math.sin(angle) * (7 + r() * 12) + (r() - 0.5) * 9; g.lineTo(x, y); }
        g.lineWidth = i % 2 ? 1 : 1.7;
        g.strokeStyle = i % 3 ? '#a2c4bd9a' : '#e2f7eaad'; g.stroke();
      }
    }
    return canvasTexture(c);
  }

  function signMaterial(text) {
    if (signMaterials.has(text)) return signMaterials.get(text);
    const c = document.createElement('canvas'); c.width = 512; c.height = 92;
    const g = c.getContext('2d'), [base, ink] = theme.sign;
    g.fillStyle = base; g.fillRect(0, 0, 512, 92);
    g.strokeStyle = ink; g.globalAlpha = 0.65; g.lineWidth = 3; g.strokeRect(7, 7, 498, 78);
    g.globalAlpha = 0.95; g.fillStyle = ink; g.font = 'bold 31px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 48, 466);
    g.globalAlpha = 0.37;
    chips(g, prng(text.length * 87), 92, '#202322', 230, 0.41);
    const map = canvasTexture(c);
    const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
    signMaterials.set(text, mat);
    return mat;
  }
  function sign(d) {
    const m = new THREE.Mesh(signGeo, signMaterial(d.text));
    const [di, dj] = WALL_DIR[d.face];
    const distance = d.placement === 'kiosk' ? 0.01 : 1.71;
    m.position.set(d.x + di * distance, d.y + (d.dy || 2.43), d.z + dj * distance);
    m.rotation.y = WALL_BEARING[d.face];
    const w = Math.min(3.36, 1.3 + d.text.length * 0.068);
    m.scale.set(w, w * 0.18, 1);
    return m;
  }
  function viewport(d) {
    const root = new THREE.Group();
    const [di, dj] = WALL_DIR[d.face];
    root.position.set(d.x + di * 1.83, d.y + 1.72, d.z + dj * 1.83);
    root.rotation.y = WALL_BEARING[d.face];
    root.add(new THREE.Mesh(glassGeo, d.powered ? viewportMat : darkViewportMat), new THREE.Mesh(gasket, gasketMat));
    for (let a = 0; a < 12; a++) {
      const m = new THREE.Mesh(studGeo, gasketMat), p = a * Math.PI / 6;
      m.rotation.x = Math.PI / 2; m.position.set(Math.cos(p) * 1.23, Math.sin(p) * 1.23, 0.1); root.add(m);
    }
    return root;
  }
  function mannequin(d) {
    const root = new THREE.Group(), pivot = new THREE.Group(), arm = new THREE.Group();
    root.position.set(d.x, d.y, d.z);
    root.add(pivot);
    const part = (parent, geo, mat, x, y, z, w, h, depth) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(w, h, depth); parent.add(m); return m;
    };
    part(root, limb, standMat, 0, 0.038, 0, 0.38, 0.075, 0.33);
    part(pivot, sphere, dollMat, 0, 1.15, 0, 0.235, 0.31, 0.135);
    part(pivot, sphere, dollMat, 0, 1.66, 0.028, 0.124, 0.17, 0.118);
    part(pivot, limb, dollMat, 0, 1.47, 0, 0.075, 0.19, 0.077);
    for (const side of [-1, 1]) {
      part(pivot, limb, dollMat, side * 0.105, 0.51, 0, 0.083, 0.92, 0.086);
      part(pivot, sphere, dollMat, side * 0.11, 0.12, 0.055, 0.084, 0.07, 0.16);
    }
    part(pivot, limb, dollMat, -0.26, 1.11, 0, 0.065, 0.59, 0.066).rotation.z = 0.11;
    arm.position.set(0.222, 1.33, 0); pivot.add(arm);
    part(arm, limb, dollMat, 0, -0.25, 0, 0.061, 0.59, 0.067);
    pivot.rotation.y = Math.PI / 2;
    return { root, pivot, arm, thought: false, visibleFor: 0, movedAt: -99 };
  }
  function vineDetail(d) {
    const [di, dj] = WALL_DIR[d.face];
    const root = new THREE.Group();
    root.position.set(d.x + di * 1.83, d.y, d.z + dj * 1.83);
    root.rotation.y = WALL_BEARING[d.face];
    const key = Math.floor(d.split * 5);
    const mat = vineMaterials[key] ||= foliageMaterial(key);
    const m = new THREE.Mesh(signGeo, mat);
    m.position.set(0, -1.05, 0);
    m.scale.set(3.72, 2.38, 1);
    root.add(m);
    return root;
  }
  const vineMaterials = [];
  function foliageMaterial(key) {
    const c = document.createElement('canvas'); c.width = 144; c.height = 112;
    const g = c.getContext('2d'), r = prng(5100 + key);
    const greens = ['#314c31', '#285232', '#476337', '#657746'];
    for (let i = 0; i < 28; i++) {
      let x = 10 + r() * 124, y = -5;
      const count = Math.floor(3 + r() * 13);
      for (let k = 0; k < count; k++) {
        const next = x + (r() - 0.5) * 10, h = y + 5 + r() * 6;
        g.strokeStyle = '#41402a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(next, h); g.stroke();
        for (const side of [-1, 1]) {
          g.fillStyle = greens[Math.floor(r() * greens.length)];
          g.beginPath(); g.ellipse(x + side * 4, y + 2.5, 5 + r() * 3, 2.1 + r() * 1.7, side * 0.5, 0, Math.PI * 2); g.fill();
        }
        x = next; y = h;
      }
    }
    return new THREE.MeshLambertMaterial({ map: canvasTexture(c), alphaTest: 0.45, side: THREE.DoubleSide });
  }

  function skylight(d, own) {
    const root = new THREE.Group(); root.position.set(d.x, d.y, d.z);
    if (d.powered) {
      const sky = new THREE.Mesh(signGeo, skyMat);
      sky.scale.set(4.06, 4.06, 1); sky.rotation.x = Math.PI / 2; sky.position.y = 0.15; root.add(sky);
    }
    const s = d.split * 0.46;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -2,0,-2, 2,0,-2, 0.4+s,0,-0.5, -2,0,-2, 0.4+s,0,-0.5, -2,0,0.3+s,
      2,0,-0.6, 2,0,2, 0.64-s,0,2, 2,0,-0.6, 0.64-s,0,2, 1.4,0,0.34,
      -2,0,1.2, -0.5,0,2, -2,0,2,
    ], 3));
    own.push(geometry);
    root.add(new THREE.Mesh(geometry, d.powered ? glassShardMat : darkShardMat));
    return root;
  }
  function threshold(d) {
    const group = new THREE.Group();
    const [di, dj] = WALL_DIR[d.face];
    group.position.set(d.x + di * 1.42, d.y, d.z + dj * 1.42);
    group.rotation.y = WALL_BEARING[d.face];
    const mat = specs.trim[0];
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(signGeo, mat);
      post.position.set(side * 0.78, 1.13, 0); post.scale.set(0.08, 2.26, 1); group.add(post);
    }
    const lintel = new THREE.Mesh(signGeo, mat);
    lintel.position.y = 2.27; lintel.scale.set(1.64, 0.10, 1); group.add(lintel);
    if (d.type === 'transition') {
      const seam = new THREE.Mesh(signGeo, specs.black[0]); seam.position.set(0.65, 1.05, 0.008); seam.scale.set(0.05, 0.21, 1); group.add(seam);
    }
    return group;
  }

  function facilityDetail(d, own, sails) {
    const root = new THREE.Group();
    root.position.set(d.x, d.y, d.z);
    function piece(geometry, material, x, y, z, w, h, depth) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.scale.set(w, h, depth); root.add(mesh);
      return mesh;
    }
    if (d.type === 'canvas') {
      const geometry = canvasGeo.clone(); own.push(geometry);
      const tarp = piece(geometry, canvasMat, d.alongX ? 0 : 1.35, 1.41, d.alongX ? 1.35 : 0, 1, 1, 1);
      tarp.rotation.y = d.alongX ? 0 : Math.PI / 2;
      sails.push({ positions: geometry.attributes.position, phase: d.x * 0.33 + d.z });
    } else if (d.type === 'radome') {
      piece(domeGeo, canvasMat, 0, 0.48, 0, 1.23, 0.54, 1.24).rotation.z = -0.16;
      for (let side = 0; side < 4; side++) {
        const a = side * Math.PI / 2;
        piece(limb, standMat, Math.sin(a) * 0.96, 0.53, Math.cos(a) * 0.96, 0.065, 1.16, 0.065).rotation.z = 0.23;
      }
    } else {
      root.rotation.y = d.animal === 1 ? -0.2 : 0.36;
      piece(sphere, furMat, -0.16, 0.65, 0, 0.71, d.animal === 1 ? 0.43 : 0.30, 0.31);
      for (const x of [-0.61, 0.24]) for (const z of [-0.17, 0.18]) piece(limb, furMat, x, 0.32, z, 0.066, 0.61, 0.063);
      piece(sphere, furMat, 0.46, d.animal === 0 ? 1.07 : 0.87, 0, 0.26, 0.26, 0.19);
      piece(sphere, furMat, 0.64, d.animal === 0 ? 1.01 : 0.82, 0, 0.22, 0.10, 0.14);
      for (const side of [-1, 1]) {
        const horn = piece(limb, d.animal === 0 ? dollMat : furMat, 0.35, d.animal === 0 ? 1.31 : 1.05, side * 0.12, 0.033, d.animal === 0 ? 0.37 : 0.20, 0.033);
        horn.rotation.set(side * 0.48, 0, 0.46);
      }
    }
    return root;
  }

  function mount(key, details) {
    if (chunks.has(key) || !details?.length) return;
    const root = new THREE.Group(), dolls = [], sails = [], own = [];
    for (const detail of details) {
      if (detail.type === 'towerLight') continue;
      if (detail.type === 'mannequin') {
        const doll = mannequin(detail); dolls.push(doll); root.add(doll.root);
      } else if (['specimen', 'canvas', 'radome'].includes(detail.type)) {
        root.add(facilityDetail(detail, own, sails));
      } else {
        const mesh = detail.type === 'sign' ? sign(detail)
          : detail.type === 'port' ? viewport(detail)
          : detail.type === 'skylight' ? skylight(detail, own)
          : detail.type === 'vines' ? vineDetail(detail) : threshold(detail);
        root.add(mesh);
      }
    }
    scene.add(root); chunks.set(key, { root, dolls, own, sails });
  }
  function unmount(key) {
    const entry = chunks.get(key);
    if (!entry) return;
    scene.remove(entry.root);
    for (const g of entry.own) g.dispose();
    chunks.delete(key);
  }
  function update(t, dt, camera, playing) {
    if (playing && name === 'offshore') for (const { sails } of chunks.values()) for (const { positions, phase } of sails) {
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i);
        positions.setZ(i, Math.sin(t * 13 + x * 3 + y + phase) * (0.75 - y) * 0.23);
      }
      positions.needsUpdate = true;
    }
    if (!playing || name !== 'mall') return;
    camera.getWorldDirection(DIR);
    const pos = camera.position;
    for (const { dolls } of chunks.values()) for (const d of dolls) {
      V.copy(d.root.position).sub(pos); V.y += 1.23;
      const dist = V.length();
      if (dist < 3 || dist > 22) continue;
      const facing = V.normalize().dot(DIR);
      if (facing > 0.72) {
        d.visibleFor += dt;
        if (d.visibleFor > 0.32 && t - d.movedAt > 12) d.thought = true;
      } else if (d.thought && facing < 0.14) {
        d.pivot.rotation.y = Math.atan2(pos.x - d.root.position.x, pos.z - d.root.position.z);
        d.arm.rotation.x = d.arm.rotation.x ? 0 : -1.10;
        d.thought = false; d.visibleFor = 0; d.movedAt = t;
      }
    }
  }
  return { mount, unmount, update, chunks };
}

function prng(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
