import * as THREE from 'three';

export const PULPIT_Z = -43.65;

export function buildCultHall({ hall, doctrine, leader, random }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(hall.shadow).multiplyScalar(0.28);
  scene.fog = new THREE.FogExp2(hall.shadow, 0.030);
  const camera = new THREE.PerspectiveCamera(57, 1, 0.045, 110);
  scene.add(camera);
  const group = (parent, x = 0, y = 0, z = 0) => {
    const node = new THREE.Group(); node.position.set(x, y, z); parent.add(node); return node;
  };
  const mat = (color, roughness = 0.94) => new THREE.MeshStandardMaterial({ color, roughness });
  const lit = (color, strength = 0.75) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) });
  const stone = mat(hall.stone), joint = mat(hall.shadow), edge = mat(new THREE.Color(hall.stone).multiplyScalar(1.54));
  const rug = mat(new THREE.Color(doctrine.color).multiplyScalar(0.20));
  const wood = mat(0x2a1718), darkWood = mat(0x130e14), iron = mat(0x28252f, 0.55);
  const brass = mat(0x8e633e, 0.62), rope = mat(0xa27b54), flesh = mat(0x87615b);
  const robe = mat(0x231c26), guardCloth = mat(0x352633), leaderCloth = mat(new THREE.Color(doctrine.color).multiplyScalar(0.30));
  const hood = mat(0x18131e), black = lit(0x0c080d), mask = mat(0xc5ad8e), leaderMask = mat(0xe8ccb2);
  const flameMat = lit(0xffa54e, 2), windowMat = lit(hall.light, 0.24);
  const eyeMat = lit(doctrine.color, 0.85);
  const cube = new THREE.BoxGeometry(1, 1, 1), ball = new THREE.SphereGeometry(1, 12, 8);
  const taper = new THREE.CylinderGeometry(0.54, 0.92, 1, 9);
  const pillar = new THREE.CylinderGeometry(1, 1, 1, hall.adjective === 'timber' ? 4 : 8);
  const ring = new THREE.TorusGeometry(1, 0.09, 6, 40);
  const arch = new THREE.TorusGeometry(1, 0.072, 6, 22, Math.PI);
  const knot = new THREE.TorusKnotGeometry(1, 0.38, 32, 6, 2, 3);
  const mesh = (parent, geometry, material, x, y, z, sx, sy, sz) => {
    const node = new THREE.Mesh(geometry, material);
    node.position.set(x, y, z); node.scale.set(sx, sy, sz); parent.add(node); return node;
  };
  const box = (parent, material, x, y, z, w, h, d) => mesh(parent, cube, material, x, y, z, w, h, d);
  const oval = (parent, material, x, y, z, w, h, d) => mesh(parent, ball, material, x, y, z, w, h, d);
  const parts = new Map();
  const proxy = new THREE.Object3D();
  function batch(geometry, material, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const id = `${geometry.id}/${material.id}`;
    if (!parts.has(id)) parts.set(id, { geometry, material, matrices: [] });
    proxy.position.set(x, y, z); proxy.scale.set(sx, sy, sz); proxy.rotation.set(rx, ry, rz); proxy.updateMatrix();
    parts.get(id).matrices.push(proxy.matrix.clone());
  }

  box(scene, joint, 0, -0.18, -23, 22, 0.35, 71);
  box(scene, stone, 0, 14.6, -23, 22, 0.4, 71);
  for (const side of [-1, 1]) {
    box(scene, stone, side * 10.9, 7.2, -23, 0.4, 14.5, 71);
    box(scene, darkWood, side * 8.9, 4.25, -23, 3.9, 0.45, 67);
    box(scene, edge, side * 7.05, 5.05, -23, 0.12, 0.10, 67);
  }
  box(scene, stone, 0, 7.2, -57.8, 22, 14.5, 0.4);
  for (const side of [-1, 1]) box(scene, stone, side * 6.57, 7.2, 11.95, 9.0, 14.5, 0.4);
  box(scene, stone, 0, 9.55, 11.95, 4.4, 9.8, 0.4);
  for (let i = 0; i < 3; i++) box(scene, edge, 0, 0.115 + i * 0.23, -47.25 - i * 0.34, 14 - i * 0.7, 0.23, 13 - i * 0.68);
  box(scene, rug, 0, 0.026, -15.3, 2.25, 0.038, 53);
  for (const side of [-1, 1]) box(scene, brass, side * 1.01, 0.049, -15.3, 0.024, 0.015, 53);
  const tiles = [stone, edge, darkWood];
  for (let row = 0; row < 49; row++) for (let col = -7; col <= 7; col++) {
    const tile = random() > 0.27 ? stone : tiles[Math.floor(random() * tiles.length)];
    batch(cube, tile, col * 1.47, -0.007, 11 - row * 1.38, 1.44, 0.029, 1.35);
  }
  for (let bay = 0; bay < 11; bay++) {
    const z = 8.6 - bay * 6.2;
    batch(arch, edge, 0, 6.95, z, 8.6, 6.8, 3.3);
    for (const side of [-1, 1]) {
      const x = side * 8.55;
      batch(pillar, stone, x, 3.55, z, 0.48, 7.1, 0.55);
      batch(cube, edge, x, 0.2, z, 1.26, 0.40, 1.38);
      batch(cube, edge, x, 6.92, z, 1.16, 0.35, 1.22);
      batch(arch, edge, side * 10.63, 8.1, z - 3.1, 1.42, 2.7, 0.9, 0, side * Math.PI / 2);
      batch(cube, windowMat, side * 10.63, 7.73, z - 3.1, 0.04, 3.35, 1.86);
      batch(ball, windowMat, side * 10.645, 9.025, z - 3.1, 0.038, 1.60, 0.93);
      batch(cube, iron, side * 10.58, 8.18, z - 3.1, 0.075, 4.45, 0.08);
      batch(cube, iron, side * 10.58, 8.3, z - 3.1, 0.075, 0.09, 2.0);
      for (let j = 0; j < 6; j++) batch(cube, iron, side * 7.08, 4.65, z - j, 0.09, 0.78, 0.09);
      if (hall.adjective === 'timber') {
        batch(cube, wood, side * 7.86, 7.74, z, 0.24, 2.4, 0.32, 0, 0, -side * 0.58);
        batch(cube, darkWood, side * 5.05, 13.20, z, 0.24, 0.36, 6.4);
      } else if (hall.adjective === 'industrial') {
        batch(pillar, iron, side * 9.3, 6.12, z, 0.22, 6.19, 0.22, Math.PI / 2);
        batch(pillar, edge, side * 9.3, 6.12, z, 0.28, 0.16, 0.28, Math.PI / 2);
      } else if (hall.adjective === 'institutional') {
        batch(cube, edge, side * 10.55, 2.4, z, 0.12, 0.16, 6.18);
        batch(cube, darkWood, side * 8.55, 2.72, z + 0.56, 0.41, 0.24, 0.06);
      }
    }
  }
  if (hall.adjective === 'drowned') {
    const water = mat(0x425355, 0.19);
    water.metalness = 0.47;
    for (const side of [-1, 1]) {
      box(scene, water, side * 5.88, 0.019, -23, 9.28, 0.02, 68);
      box(scene, edge, side * 1.25, 0.038, -17, 0.16, 0.057, 53);
    }
  }

  const door = group(scene, 0, 0, 11.63);
  for (const side of [-1, 1]) box(door, edge, side * 2.29, 2.25, 0, 0.35, 4.5, 0.33);
  mesh(door, arch, edge, 0, 4.45, 0.06, 2.5, 2.08, 1);
  const doors = [-1, 1].map(side => {
    const leaf = group(door, side * 2.12, 0, -0.26);
    box(leaf, wood, -side * 1.05, 2.23, 0, 2.11, 4.46, 0.22);
    for (const y of [0.6, 2.1, 3.8]) box(leaf, iron, -side * 1.05, y, -0.13, 2.06, 0.12, 0.08);
    mesh(leaf, ring, brass, -side * 1.77, 1.7, -0.18, 0.13, 0.17, 0.13);
    return leaf;
  });

  const members = [];
  for (let row = 0; row < 18; row++) for (const side of [-1, 1]) {
    const z = 5.2 - row * 2.58;
    batch(cube, wood, side * 4.45, 0.48, z, 5.30, 0.18, 0.68);
    batch(cube, darkWood, side * 4.45, 0.75, z + 0.35, 5.35, 0.66, 0.14);
    batch(cube, edge, side * 4.45, 1.08, z + 0.36, 5.45, 0.08, 0.18);
    for (const dx of [-2.42, 2.42]) batch(cube, wood, side * 4.45 + dx, 0.34, z, 0.23, 0.67, 0.82);
    for (let n = 0; n < 5; n++) {
      if (n > 0 && random() < 0.11) continue;
      members.push({ x: side * (2.23 + n * 1.03 + random() * 0.17), z: z - 0.02 + random() * 0.12,
        size: 0.85 + random() * 0.3, phase: random() * Math.PI * 2, alert: random(), seated: true });
    }
    if (row % 2 === 0) members.push({ x: side * (7.65 + random() * 2.55), z, size: 0.92 + random() * 0.16,
      phase: random() * Math.PI * 2, alert: random(), seated: false });
  }
  const crowd = [
    [taper, robe, 0.46, 0.85, 0.38, 0.61, 0],
    [ball, hood, 0.225, 0.265, 0.21, 1.25, 0.035],
    [ball, mask, 0.136, 0.185, 0.063, 1.21, 0.199],
  ].map(([geometry, material, sx, sy, sz, y, forward]) => {
    const instanced = new THREE.InstancedMesh(geometry, material, members.length);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage); instanced.frustumCulled = false;
    scene.add(instanced);
    return { instanced, sx, sy, sz, y, forward };
  });

  function person(parent, cloth, face, ornate = false) {
    const root = group(parent), upper = group(root, 0, 1.09, 0);
    mesh(root, taper, cloth, 0, 0.6, 0, 0.53, 1.18, 0.39);
    oval(upper, cloth, 0, 0.20, 0, 0.44, 0.42, 0.27);
    const head = group(upper, 0, 0.54, 0.03);
    oval(head, hood, 0, 0.12, -0.025, 0.29, 0.35, 0.26);
    oval(head, face, 0, 0.06, 0.194, 0.189, 0.229, 0.081);
    oval(head, black, 0, -0.056, 0.268, 0.046, 0.012, 0.012);
    const arms = [-1, 1].map(side => {
      oval(head, black, side * 0.073, 0.102, 0.267, 0.053, 0.035, 0.014);
      if (ornate) {
        oval(head, eyeMat, side * 0.073, 0.102, 0.281, 0.015, 0.013, 0.006);
        for (let i = 0; i < 3; i++) box(head, brass, side * (0.056 + i * 0.028), -0.026 - i * 0.017, 0.271 - i * 0.015, 0.015, 0.045, 0.008).rotation.z = side * 0.55;
        mesh(head, taper, brass, side * 0.20, 0.42, -0.08, 0.11, 0.41, 0.10).rotation.z = -side * 0.31;
        box(upper, brass, side * 0.13, 0.14, 0.23, 0.053, 0.79, 0.04).rotation.z = side * 0.12;
      }
      const arm = group(upper, side * 0.34, 0.32, 0);
      oval(arm, cloth, 0, -0.22, 0, 0.125, 0.33, 0.135);
      const forearm = group(arm, 0, -0.43, 0);
      oval(forearm, cloth, 0, -0.133, 0, 0.111, 0.21, 0.112);
      oval(forearm, flesh, 0, -0.315, 0.006, 0.069, 0.105, 0.05);
      return { arm, forearm };
    });
    return { root, upper, head, arms };
  }

  const officiant = person(scene, leaderCloth, leaderMask, true);
  const escorts = [-1, 1].map(() => person(scene, guardCloth, mask));
  const pulpit = group(scene, 0, 0.65, PULPIT_Z + 0.68);
  box(pulpit, wood, 0, 0.57, 0, 0.72, 1.13, 0.50);
  box(pulpit, darkWood, 0, 1.16, 0, 1.28, 0.13, 0.69).rotation.x = -0.21;
  box(pulpit, brass, 0, 0.72, 0.26, 0.42, 0.035, 0.035);
  box(pulpit, edge, 0, 1.24, -0.06, 0.43, 0.065, 0.31).rotation.x = -0.21;
  mesh(pulpit, taper, brass, 0.54, 1.29, -0.09, 0.13, 0.16, 0.13);
  oval(pulpit, brass, 0.54, 1.40, -0.09, 0.032, 0.04, 0.032);
  const altar = group(scene, 0, 0.65, -49.4);
  box(altar, darkWood, 0, 0.61, 0, 4.1, 1.24, 1.03);
  box(altar, edge, 0, 1.21, 0, 4.35, 0.16, 1.19);
  const standard = group(scene, 0, 6.7, -48.95);
  box(standard, rug, 0, 0, 0, 3.75, 5.1, 0.08);
  box(standard, brass, 0, 2.54, 0, 4.15, 0.09, 0.12);
  const sigil = group(standard, 0, 0.18, 0.065);
  mesh(sigil, ring, brass, 0, 0, 0, 1.16, 1.16, 0.54);
  for (let i = -1; i <= 1; i++) {
    const horizontal = doctrine.emblem === 'water' || doctrine.emblem === 'ledger';
    const stroke = box(sigil, brass, horizontal ? 0 : i * 0.33, horizontal ? i * 0.32 : -0.08, 0.02, horizontal ? 1.24 : 0.07, horizontal ? 0.055 : 1.37, 0.048);
    if (doctrine.emblem === 'lantern') stroke.rotation.z = i * 0.38;
  }

  const flames = [];
  function candle(x, y, z, h) {
    batch(pillar, brass, x, y + h * 0.5, z, 0.055, h, 0.055);
    const flame = oval(scene, flameMat, x, y + h + 0.07, z, 0.045, 0.115, 0.045);
    flames.push({ flame, phase: random() * 10, y: flame.position.y });
  }
  const pools = [];
  function lamp(x, y, z, strength, range, color) {
    const light = new THREE.PointLight(color, strength, range, 1.6);
    light.position.set(x, y, z); scene.add(light); pools.push({ light, strength, phase: random() * 10 });
    return light;
  }
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
    const x = side * 1.29, z = 7 - i * 5.8;
    candle(x, 0, z, 0.44 + random() * 0.24);
    if (i % 2 === 0) lamp(side * 2.0, 2.18, z, 25, 10, 0xffa364);
  }
  for (let i = 0; i < 9; i++) candle((i - 4) * 0.42, 1.94, -49.1, 0.18 + random() * 0.34);
  lamp(0, 3.2, -48.8, 75, 19, doctrine.color);
  const stageLight = lamp(0.4, 3.9, -40, 72, 15, 0xe1a581);
  lamp(-3.2, 5.4, -44.8, 63, 16, hall.light);
  const wash = new THREE.HemisphereLight(hall.light, 0x473336, 1.45);
  scene.add(wash);
  const moon = new THREE.DirectionalLight(hall.light, 1.48);
  moon.position.set(-6, 12, 4); scene.add(moon);

  for (const { geometry, material, matrices } of parts.values()) {
    const instanced = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.instanceMatrix.needsUpdate = true; scene.add(instanced);
  }

  const wrists = group(camera, 0, -0.26, -0.59);
  const cuffs = [];
  for (const side of [-1, 1]) {
    const wrist = group(wrists, side * 0.115, 0, 0);
    oval(wrist, guardCloth, side * 0.071, -0.117, 0.071, 0.09, 0.23, 0.092).rotation.z = side * 0.34;
    oval(wrist, flesh, 0, 0.018, -0.018, 0.075, 0.084, 0.103);
    for (let i = 0; i < 4; i++) oval(wrist, flesh, (i - 1.5) * 0.026, 0.059, -0.078, 0.017, 0.046, 0.038);
    const cuff = group(wrist, side * 0.016, -0.036, 0.024);
    for (let i = -2; i <= 2; i++) mesh(cuff, ring, rope, 0, i * 0.017, 0, 0.081, 0.078, 0.080).rotation.x = Math.PI * 0.5 + i * 0.07;
    cuffs.push({ wrist, cuff, side });
  }
  const binding = mesh(wrists, knot, rope, 0, -0.035, -0.044, 0.032, 0.027, 0.025);
  const weapon = group(camera, 0.15, -0.3, -0.46);
  box(weapon, iron, 0, 0, -0.10, 0.076, 0.069, 0.29);
  box(weapon, darkWood, 0, -0.071, 0.008, 0.068, 0.13, 0.095).rotation.x = 0.18;
  box(weapon, brass, 0, 0.044, -0.211, 0.019, 0.018, 0.028);
  oval(weapon, flesh, 0, -0.112, 0.066, 0.088, 0.115, 0.114);
  const flash = mesh(weapon, ball, flameMat, 0, 0, -0.31, 0.105, 0.085, 0.17);
  const flashLight = new THREE.PointLight(0xffa25f, 0, 10, 1.6);
  camera.add(flashLight); flashLight.position.set(0, 0, -0.96);
  const faceMask = group(camera, 0, -0.38, -0.65);
  oval(faceMask, mask, 0, 0, 0, 0.21, 0.31, 0.055);
  for (const side of [-1, 1]) oval(faceMask, black, side * 0.085, 0.063, 0.052, 0.053, 0.041, 0.009);
  oval(faceMask, black, 0, -0.105, 0.057, 0.059, 0.016, 0.009);
  const dustGeometry = new THREE.BufferGeometry();
  const specks = new Float32Array(210 * 3);
  for (let i = 0; i < specks.length; i += 3) {
    specks[i] = (random() - 0.5) * 18; specks[i + 1] = random() * 9; specks[i + 2] = 9 - random() * 60;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(specks, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc69f8a, size: 0.027, transparent: true, opacity: 0.29, depthWrite: false }));
  scene.add(dust);

  const clamp = THREE.MathUtils.clamp;
  function pose({ phase, age, time, mood, beat, shot, action, walking, reduced }) {
    const surge = mood === 'restless' ? 1 : mood === 'eager' ? 0.62 : 0.14;
    const crowdTurn = phase === 'capture' ? 0.14 : phase === 'procession' ? 0.86 : 0.9;
    const yRise = phase === 'converted' ? Math.min(1, age * 0.9) : phase === 'verdict' || phase === 'convert' ? 0.9 : surge * (phase === 'reaction' ? Math.min(1, age * 2) : 0.22);
    members.forEach((member, i) => {
      const direction = Math.atan2(-member.x, camera.position.z - member.z);
      const angle = Math.PI + Math.atan2(Math.sin(direction - Math.PI), Math.cos(direction - Math.PI)) * crowdTurn;
      const sway = Math.sin(time * (1 + surge * 0.55) + member.phase) * 0.035;
      const stand = member.seated ? clamp((yRise - member.alert * 0.48) * 0.58, 0, 0.49) : 0.47;
      const turn = angle + sway * 1.9;
      for (const part of crowd) {
        const forward = part.forward * member.size;
        proxy.position.set(member.x + Math.sin(turn) * forward, (part.y + sway) * member.size + stand, member.z + Math.cos(turn) * forward);
        proxy.rotation.set(sway * 2.2, turn, sway * 0.8);
        proxy.scale.set(part.sx * member.size, part.sy * member.size, part.sz * member.size);
        proxy.updateMatrix(); part.instanced.setMatrixAt(i, proxy.matrix);
      }
    });
    for (const { instanced } of crowd) instanced.instanceMatrix.needsUpdate = true;
    const collapse = phase === 'escape' ? clamp(age / 1.07, 0, 1) ** 2 : 0;
    const fall = Math.min(1, collapse);
    const speech = ['creed', 'instruction', 'question', 'reaction', 'verdict', 'convert'].includes(phase);
    const emphasis = speech ? Math.exp(-age * 0.45) : 0;
    officiant.root.position.set(-0.10 + fall * 0.89, 0.69 - fall * 0.14, PULPIT_Z - fall * 0.76);
    officiant.root.rotation.set(-fall * 1.39, Math.sin(time * 0.72) * 0.11 - fall * 0.18, fall * -0.35);
    officiant.upper.rotation.x = (speech ? 0.13 : 0) + Math.sin(time * 2.2) * 0.028;
    officiant.head.rotation.set(-0.09 + Math.sin(time * 3 + beat) * emphasis * 0.14, Math.sin(time * 1.15) * 0.11, 0.065 + Math.sin(time * 1.4) * 0.07);
    for (const [i, { arm, forearm }] of officiant.arms.entries()) {
      const side = i ? 1 : -1;
      const reaching = leader.gesture === 'reach' ? 1 : leader.gesture === 'point' ? i * 0.92 : 0.42;
      const toBell = phase === 'aim' && i === 1 ? THREE.MathUtils.smoothstep(age, 0.3, 2.3) : 0;
      arm.rotation.set(-0.48 - emphasis * reaching * 0.88 - toBell * 0.52, 0, side * (0.29 + emphasis * (leader.gesture === 'open' ? 0.6 : 0.24) + toBell * 0.15));
      forearm.rotation.x = -0.68 + Math.sin(time * 3.2 + i) * 0.16 - emphasis * 0.28 - toBell * 0.20;
    }
    escorts.forEach(({ root, upper, arms, head }, i) => {
      const side = i ? 1 : -1;
      const grab = action === 'loosen' || phase === 'verdict' || phase === 'convert' ? 0.22 : 0;
      const stagger = phase === 'escape' ? Math.min(1, age * 1.6) * 0.92 : 0;
      root.visible = phase !== 'converted';
      const z = phase === 'capture' || phase === 'procession' ? camera.position.z + 0.66 : -39.50;
      root.position.set(side * (0.98 - grab + stagger), Math.abs(Math.sin(time * 8 + i)) * (walking ? 0.055 : 0.012), z - i * 0.26);
      root.rotation.y = -side * (walking ? 2.21 : 1.18) + side * stagger;
      upper.rotation.x = 0.08 + (walking ? Math.sin(time * 8 + i) * 0.12 : 0);
      head.rotation.z = side * 0.08;
      for (const { arm, forearm } of arms) {
        arm.rotation.x = walking ? -1.02 - Math.sin(time * 8 + i) * 0.24 : -0.54 - grab * 2.4;
        forearm.rotation.x = -0.56 - grab;
      }
    });
    doors.forEach((leaf, i) => {
      const opening = phase === 'capture' ? 1.32 * (1 - THREE.MathUtils.smoothstep(age, 0.75, 2.45)) : phase === 'escape' ? 1.27 * THREE.MathUtils.smoothstep(age, 1.0, 2.5) : 0;
      leaf.rotation.y = (i ? 1 : -1) * opening;
    });
    wrists.visible = !['aim', 'escape', 'converted'].includes(phase);
    const snap = phase === 'break' ? THREE.MathUtils.smoothstep(age, 0.52, 1.38) : 0;
    wrists.position.y = (phase === 'capture' || phase === 'struggle' || phase === 'break' ? -0.19 : -0.28) + Math.sin(time * 3.5) * 0.014 - snap * 0.17;
    wrists.rotation.z = reduced ? 0 : Math.sin(time * (walking ? 8 : 3)) * (walking ? 0.10 : 0.042);
    binding.visible = snap < 0.48;
    for (const { wrist, cuff, side } of cuffs) {
      wrist.position.x = side * (0.111 + snap * 0.32);
      wrist.rotation.z = side * (snap * 0.66 + (action === 'loosen' ? 0.16 : 0));
      cuff.rotation.z = side * snap * 2.6;
    }
    weapon.visible = phase === 'aim' || phase === 'escape';
    weapon.position.set(0.082, -0.24 - (phase === 'aim' ? (1 - THREE.MathUtils.smoothstep(age, 0, 0.56)) * 0.25 : fall * 0.4) + shot * 0.032, -0.53 + 0.14 * shot);
    weapon.rotation.x = shot * 0.37;
    flash.visible = shot > 0.19 && !reduced;
    flashLight.intensity = reduced ? 0 : shot * 11;
    faceMask.visible = phase === 'convert' && age > 1.2;
    if (faceMask.visible) {
      const raise = THREE.MathUtils.smoothstep(age, 1.2, 3.0);
      faceMask.position.set(0.11 * (1 - raise), -0.44 * (1 - raise), -0.77 + 0.67 * raise);
      faceMask.rotation.z = 0.31 * (1 - raise);
    }
    stageLight.position.x = Math.sin(time * 0.58) * 1.5;
    for (const { light, strength, phase: wave } of pools) light.intensity = strength * (0.86 + 0.12 * Math.sin(time * 5 + wave) * Math.sin(time * 8.4 + wave)) * (phase === 'escape' ? 1 - fall * 0.52 : 1);
    for (const { flame, phase: wave, y } of flames) {
      flame.position.y = y + Math.sin(time * 7 + wave) * 0.022;
      flame.scale.y = 0.1 + Math.sin(time * 9 + wave) * 0.026;
    }
    standard.rotation.y = Math.sin(time * 0.75) * 0.023;
    dust.position.set(Math.sin(time * 0.31) * 0.37, time * 0.04 % 1, 0);
  }

  function dispose() {
    const materials = new Set(), geometry = new Set();
    scene.traverse(node => {
      if (node.isInstancedMesh) node.dispose();
      if (node.material) materials.add(node.material);
      if (node.geometry) geometry.add(node.geometry);
    });
    materials.forEach(item => item.dispose()); geometry.forEach(item => item.dispose());
  }

  return { scene, camera, pose, dispose };
}
