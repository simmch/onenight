import { CATHEDRAL_DEPTH, EXPOSED_ZONES } from './HazardDistricts.js';

export const FACILITY_THEMES = {
  cathedral: { wall: ['#929080', '#5e6058', '#686b62'], floor: ['#898778', '#555a50'], ceiling: ['#747568', '#474d46'], trim: 0x514b37, sign: ['#2c3129', '#ded8c6'], paint: 0x848674 },
  accelerator: { wall: ['#647074', '#364248', '#505e61'], floor: ['#555f62', '#343b42'], ceiling: ['#65686c', '#41494a'], trim: 0x695638, sign: ['#332a21', '#f6d8a2'], paint: 0xa18140 },
  taxidermy: { wall: ['#777462', '#484941', '#555445'], floor: ['#626150', '#41423a'], ceiling: ['#747269', '#494944'], trim: 0x453830, sign: ['#383229', '#f2dcb1'], paint: 0x90845e },
  glasshouse: { wall: ['#748178', '#49584e', '#4b6052'], floor: ['#626e59', '#424c3f'], ceiling: ['#575f5a', '#313b35'], trim: 0x354e3d, sign: ['#29392b', '#d8e1c7'], paint: 0x698466 },
  offshore: { wall: ['#687982', '#3f4a53', '#566877'], floor: ['#697783', '#434c55'], ceiling: ['#7c8d94', '#435260'], trim: 0x455962, sign: ['#303742', '#dde8ef'], paint: 0xb1a28e },
  serverfarm: { wall: ['#565d63', '#373c42', '#444a52'], floor: ['#646b70', '#383f48'], ceiling: ['#767d81', '#3d444b'], trim: 0x42484f, sign: ['#22313a', '#d0ebf0'], paint: 0xc1a066 },
};

export function dressHazardCell({ name, zone, a, b, x, y, z, roof, roll, faces, c, box, shape, sprite, powered, objects }) {
  const rib = (layer, dx0, h0, dx1, h1, thickness) => {
    const run = dx1 - dx0, rise = h1 - h0;
    c.slopes.push([layer, x + (dx0 + dx1) / 2, y + (h0 + h1) / 2, z - 1.66, thickness, thickness,
      Math.hypot(run, rise) + thickness * 0.42, Math.PI / 2, -Math.atan2(rise, run)]);
  };
  if (name === 'cathedral') {
    if (Object.hasOwn(CATHEDRAL_DEPTH, zone)) box('liquid', x, y + CATHEDRAL_DEPTH[zone] - 0.014, z, 4, 0.028, 4);
    if (zone === 'saltNave') for (let n = 0; n < 6; n++) {
      const dx = Math.sin(5.7 * n + roll * 24) * 1.69, dz = Math.cos(4.2 * n - roll * 27) * 1.72;
      box('saltCrust', x + dx, y + 0.008, z + dz, 0.10 + n * 0.04, 0.018, 0.15 + roll * 0.18, n + roll);
    }
    for (const side of [-1, 1]) if (zone === 'saltNave' && Math.abs(a) === 3 && b % 2 === 0 && Math.sign(a) === side) {
      box('trim', x + side * 1.52, y + 3.05, z, 0.6, 6.1, 0.65);
      box('interiorWall', x + side * 1.52, y + 0.37, z, 0.82, 0.73, 0.85);
      sprite('crystal', x + side * 1.38, y, z + 0.33, 0.65, 0.84, 0);
    }
    if (zone === 'saltNave' && a === 0 && b < 0) {
      for (const side of [-1, 1]) box('trim', x + side * 1.96, roof - 0.32, z, 0.16, 0.68, 0.35);
      if (b % 2 === 0) {
        const span = [[-2, 4.65], [-1.57, 5.61], [-0.9, 6.07], [0, 6.48], [0.9, 6.07], [1.57, 5.61], [2, 4.65]];
        for (let i = 1; i < span.length; i++) rib('trim', ...span[i - 1], ...span[i], 0.22);
      }
    }
    if (zone === 'altar') box('trim', x, y + 0.24, z - 1, 2.05, 0.48, 1.22);
  } else if (name === 'accelerator') {
    if (zone === 'beamRing') {
      for (const side of [-1, 1]) {
        box('iron', x + side * 1.46, y + 0.045, z, 0.12, 0.10, 4);
        box('rust', x + side * 1.52, roof - 0.38, z, 0.09, 0.09, 4);
      }
      box('iron', x, roof - 0.24, z - 1.85, 4, 0.40, 0.14);
      if (roll > 0.52) box('black', x - 1.1, y + 0.05, z - 0.65, 0.16, 0.10, 1.7, roll * 4);
    }
  } else if (name === 'taxidermy') {
    if (zone === 'specimenHall' && Math.abs(a) === 2 && b % 3 === 0) {
      sprite('skeleton', x + Math.sign(a) * 1.25, y, z, 0.9, 2.0, 0);
    }
  } else if (name === 'glasshouse') {
    if (['conservatory', 'fernery'].includes(zone)) {
      if (zone === 'fernery' || a % 2 !== 0) {
        const side = a < 0 ? -1 : 1, px = x + side * 0.8, pz = z + (roll - 0.5) * 1.6;
        box('trim', px, y + 0.29, pz, 1.29, 0.58, 1.45);
        sprite('fern', px, y + 0.46, pz, 1.86, 1.86, 0.14);
        sprite('bush', px + 0.27, y + 0.37, pz - 0.59, 1.26, 1.42, 0.095);
        shape(px, pz, 1.26, 1.44, true);
        if (faces.length) c.details.push({ type: 'vines', x, y: roof - 0.5, z, face: faces[0], split: roll });
      }
      if (objects.some(o => o.type === 'hazard' && o.kind === 'pollen')) sprite('cavemush', x, y, z, 1.24, 0.92, 0.065);
      box('iron', x, roof - 0.08, z - 1.94, 4, 0.16, 0.14);
      box('iron', x - 1.94, roof - 0.04, z, 0.12, 0.14, 4);
      if (b % 2 === 0 && Math.abs(a) <= 4) {
        const crown = (offset) => 6.6 - 0.085 * Math.pow(a + offset, 2);
        rib('iron', -2, crown(-0.5), 2, crown(0.5), 0.15);
      }
    }
  } else if (name === 'offshore') {
    if (EXPOSED_ZONES.includes(zone)) {
      box('icePlate', x, y + 0.012, z, 4, 0.025, 4);
      for (const face of faces) {
        const di = [0, 1, 0, -1][face], dj = [-1, 0, 1, 0][face];
        box('interiorWall', x + di * 1.96, y - 2.35, z + dj * 1.96, 4.02, 4.7, 0.15, face * Math.PI / 2);
      }
    } else if (['radarDome', 'balloonDome'].includes(zone) && b % 2 === 0) {
      box('iron', x, roof - 0.26, z - 1.86, 4, 0.47, 0.11);
      box('iron', x - 1.86, roof - 0.20, z, 0.10, 0.35, 4);
    }
  } else {
    for (const dz of [-1, 0, 1]) for (const side of [-1, 1]) {
      box('black', x + side * 1.12, y + 0.011, z + dz * 0.92, 0.38, 0.015, 0.077);
    }
    if (zone === 'coldAisle') {
      for (const side of [-1, 1]) box('trim', x + side * 1.96, y + 2.45, z, 0.13, 0.14, 4);
      box('serverLed', x, roof - 0.21, z, 0.13, 0.07, 1.33);
      for (const side of [-1, 1]) box('serverFloorLight', x + side * 0.91, y + 0.017, z - 0.46, 0.43, 0.018, 2.24, side * 0.37);
    }
    if (zone === 'hotAisle') box('iron', x, roof - 0.44, z, 1.28, 0.61, 4);
  }
  if (powered && name !== 'serverfarm' && roll > 0.22 && !EXPOSED_ZONES.includes(zone)) {
    box('emergency', x, name === 'cathedral' ? y + 2.7 : roof - 0.21, z, 0.17, 0.11, 0.49);
    c.lights.push(x, name === 'cathedral' ? y + 2.61 : roof - 0.32, z, 0.64, 3);
  }
  if (powered && name === 'serverfarm' && roll > 0.23) {
    box('serverLed', x + 1.45, y + 2.34, z - 1.35, 0.12, 0.10, 0.24);
    c.lights.push(x + 1.45, y + 2.34, z - 1.34, 1.1, 8);
  }
}

export function dressHazardProp(obj, { x, y, z, c, box, shape, sprite }) {
  const px = x + (obj.dx ?? 0), pz = z + (obj.dz ?? 0);
  const part = (layer, dx, dy, dz, w, h, d, turn) => box(layer, px + dx, y + dy, pz + dz, w, h, d, turn);
  switch (obj.prop) {
    case 'pew':
      part('wood', 0, 0.48, 0, 2.95, 0.13, 0.61);
      part('wood', 0, 0.86, 0.32, 2.95, 0.62, 0.12);
      for (const side of [-1, 1]) part('wood', side * 1.33, 0.33, 0.045, 0.20, 0.65, 0.77);
      shape(px, pz, 2.98, 0.69);
      break;
    case 'saint':
      part('interiorWall', 0, 0.32, 0, 1.03, 0.63, 0.94);
      sprite('gargoyle', px, y + 0.64, pz, 1.53, 2.32, 0);
      sprite('crystal', px + 0.35, y + 0.19, pz + 0.54, 0.7, 0.57, 0);
      shape(px, pz, 0.94, 0.94, true);
      break;
    case 'magnet': {
      const side = obj.side, d = side * 1.47;
      part('iron', d, 0.78, 0, 1.03, 1.58, 2.31);
      part('rust', d, 1.67, 0, 1.0, 0.42, 2.22);
      for (const dz of [-0.86, -0.5, -0.12, 0.25, 0.64, 0.94]) part('rust', d, 0.87, dz, 1.18, 1.62, 0.087);
      part('black', d - side * 0.52, 1.26, 0.08, 0.14, 0.18, 1.71);
      part('amberDiode', d - side * 0.59, 1.27, 0.64, 0.046, 0.077, 0.17);
      shape(px + d, pz, 1.0, 2.26, true);
      break;
    }
    case 'display':
      part('trim', 0, 0.38, 0, 2.67, 0.76, 1.34);
      part('barrierGlass', 0, 1.51, 0, 2.58, 1.57, 1.26);
      for (const s of [-1, 1]) for (const t of [-1, 1]) part('iron', s * 1.28, 1.47, t * 0.63, 0.075, 1.51, 0.075);
      part('iron', 0, 2.28, 0, 2.62, 0.055, 1.26);
      c.details.push({ type: 'specimen', x: px, y: y + 0.76, z: pz, animal: obj.animal });
      shape(px, pz, 2.67, 1.33, true);
      break;
    case 'jars':
      part('iron', 0, 1.22, 0, 1.38, 2.45, 0.57);
      for (const h of [0.5, 0.98, 1.46, 1.94]) {
        part('black', 0, h, 0.25, 1.24, 0.42, 0.071);
        for (const dx of [-0.40, -0.10, 0.26, 0.47]) {
          part('railGlass', dx, h - 0.05, 0.33, 0.16, 0.24, 0.18);
          part('rust', dx, h + 0.085, 0.33, 0.17, 0.033, 0.20);
        }
      }
      shape(px, pz, 1.38, 0.69, true);
      break;
    case 'ropes': {
      const turn = obj.alongX ? Math.PI / 2 : 0;
      for (const side of [-1, 1]) {
        const dx = obj.alongX ? 0 : side * 0.78, dz = obj.alongX ? side * 0.78 : 0;
        part('stripe', dx, 0.78, dz, 0.045, 0.055, 4, turn);
        part('iron', dx, 0.41, dz, 0.09, 0.82, 0.09);
      }
      break;
    }
    case 'tarp':
      c.details.push({ type: 'canvas', x: px, y, z: pz, alongX: obj.alongX });
      if (obj.alongX) shape(px, pz + 1.35, 2.6, 0.15, true);
      else shape(px + 1.35, pz, 0.15, 2.6, true);
      break;
    case 'radome':
      c.details.push({ type: 'radome', x: px, y, z: pz });
      shape(px, pz, 2.37, 2.42, true);
      break;
    case 'serverRack':
      part('black', 0, 1.21, 0, 1.17, 2.42, 1.05);
      part('iron', 0, 1.21, -0.53, 1.18, 2.42, 0.054);
      for (const h of [0.48, 0.76, 1.06, 1.35, 1.64, 1.93, 2.22]) {
        part('iron', 0, h, 0.53, 1.09, 0.16, 0.054);
        part('serverLed', -0.34, h + 0.02, 0.557, 0.07, 0.024, 0.03);
      }
      shape(px, pz, 1.18, 1.05, true);
      break;
    case 'sensor':
      part('iron', 1.72, 2.28, 0, 0.26, 0.28, 0.24);
      part('amberDiode', 1.58, 2.28, 0, 0.075, 0.08, 0.11);
      break;
  }
}
