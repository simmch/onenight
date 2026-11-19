import * as THREE from 'three';

// Silhouettes are painted on small textures so they read like the existing prop sprites.
export function paintEncounterSprite(name, pose) {
  const canvas = document.createElement('canvas');
  canvas.width = 56;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  const attack = pose === 'attack', stride = pose === 'step' ? 5 : 0;
  function poly(color, ...points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }
  const pixel = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  function hooks(color, height) {
    for (const side of [0, 1]) {
      ctx.save();
      if (side) { ctx.translate(56, 0); ctx.scale(-1, 1); }
      const low = attack ? 31 : 50 + side * stride;
      poly(color, [22, height], [14, height - 5], [3, low - 3], [1, low + 13], [6, low + 9], [11, low + 1], [20, height + 9]);
      poly('#827568', [12, height], [4, low + 3], [8, low - 3], [17, height - 4]);
      ctx.restore();
    }
  }

  if (name === 'burrower' || name === 'counterfeit') {
    const top = name === 'burrower' ? 11 : 4;
    const hide = name === 'burrower' ? '#57413b' : '#594638';
    hooks(hide, 40);
    poly('#292025', [3, 70], [11, 39], [9, top + 13], [17, top + 2], [38, top], [49, top + 15], [44, 44], [54, 70]);
    poly(hide, [11, 68], [15, 34], [12, top + 17], [22, top + 5], [40, top + 4], [46, top + 21], [38, 43], [47, 68]);
    poly('#1c1010', [15, 26], [22, 19], [37, 19], [42, 32], [38, attack ? 61 : 49], [22, attack ? 62 : 50]);
    for (let i = 0; i < 5; i++) {
      const x = 17 + i * 5;
      poly('#c1a083', [x, 26], [x + 4, 27], [x + 2, 34 + (i % 2) * 4]);
      poly('#886c5d', [x, attack ? 56 : 47], [x + 4, attack ? 56 : 47], [x + 2, attack ? 45 : 39]);
    }
    pixel('#bc4c36', 27, attack ? 43 : 37, 6, 5);
    for (const [x, y] of [[12, 44], [38, 49], [17, 64], [32, 4]]) pixel('#8a6851', x, y, 5, 2);
  } else if (name === 'seamstress') {
    poly('#322b31', [19, 9], [36, 9], [46, 27], [40, 42], [48, 63], [27, 70], [9, 61], [17, 41], [9, 31]);
    hooks('#7a686b', 34);
    poly('#908083', [24, 9], [35, 9], [39, 23], [34, 39], [24, 41], [19, 27]);
    pixel('#161015', 24, 19, 11, 4);
    for (let i = 0; i < 4; i++) pixel('#cfbfa9', 24 + i * 3, 29 + i % 2, 2, 7);
    for (let i = 0; i < 5; i++) poly('#665661', [20 + i * 4, 44], [24 + i * 3, 44], [12 + i * 8, 71]);
  } else if (name === 'wickling') {
    // what the Wick Eater pushes out of the walls: low, burnt, all reach, one ember for an eye
    const low = attack ? 0 : 6;
    poly('#1a1213', [4, 70], [8, 52 + low], [14, 38 + low], [28, 30 + low], [42, 36 + low], [50, 52 + low], [53, 70]);
    poly('#5a2617', [10, 68], [14, 52 + low], [20, 42 + low], [30, 37 + low], [40, 42 + low], [45, 55 + low], [46, 68]);
    for (const side of [0, 1]) {                                  // spidery arms, reaching forward when it lunges
      const x = side ? 44 : 12, d = side ? 1 : -1;
      poly('#2b1c1a', [x, 50 + low], [x + d * 10, (attack ? 30 : 44) + low], [x + d * 13, (attack ? 34 : 60)], [x + d * 4, 56 + low]);
    }
    pixel('#f0a24a', 26, 44 + low, 6, 4);
    pixel('#fff0b5', 28, 45 + low, 2, 2);
    for (const [x, y] of [[16, 58], [38, 61], [24, 66]]) pixel('#b76026', x, y, 3, 2);
  } else if (name === 'wickeater') {
    hooks('#642d1e', 35);
    poly('#1c1618', [8, 69], [12, 41], [10, 26], [19, 7], [36, 2], [47, 20], [41, 39], [50, 68]);
    poly('#74391e', [17, 62], [18, 35], [15, 22], [23, 10], [35, 6], [41, 19], [35, 39], [41, 58]);
    poly('#170d0b', [23, 17], [31, 15], [36, 30], [29, 45], [22, 37]);
    pixel('#e1a04c', 27, 18, 4, 21);
    pixel('#fff0b5', 28, 22, 2, 11);
    for (const [x, y] of [[17, 12], [39, 17], [24, 50], [14, 60], [42, 47]]) pixel('#b76026', x, y, 3, 2);
  } else {
    // An articulated-looking silhouette using two foot placements and a reaching pose.
    const bellman = name === 'bellman', cloth = bellman ? '#3c3f45' : '#685b4c';
    poly('#292529', [13, 70], [16, 47], [12, 34], [17, 21], [20, 11], [24, 3], [35, 3], [41, 13], [38, 22], [43, 30], [40, 52], [43, 70 - stride]);
    poly(cloth, [17, 62], [20, 44], [16, 32], [21, 21], [35, 21], [39, 31], [34, 43], [39, 61], [31, 66], [28, 53], [24, 68]);
    hooks(cloth, 31);
    poly('#a39780', [23, 11], [34, 9], [38, 16], [34, 27], [25, 26], [21, 19]);
    pixel('#271f21', 23, 15, 13, 4);
    pixel(attack ? '#d98d54' : '#c7b699', 28, 16, 2, 2);
    poly('#372a28', [27, 21], [33, 21], [34, attack ? 31 : 24], [26, 25]);
    if (bellman) {
      poly('#87724b', [25, 34], [31, 34], [34, 47], [22, 47]);
      pixel('#b99962', 23, 47, 10, 2);
    } else for (const y of [32, 40, 52]) pixel('#87735a', 20 + y % 4, y, 10, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
