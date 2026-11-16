import * as THREE from 'three';

// A strip of night woods that slides past a fixed point, so something can run through it for ever without going
// anywhere. The title screen's runner and the chase cutscene both stand on one. Everything on it is drawn with the
// game's own billboards and ground, so it looks like the rest of the night.
// kit: { atlas, mulberry, billboardLayer(isLit, cap), speckleTexture(palette, salt, repeat), surfaceMaterial(tex), groundPalette }
export function createTreadmill(kit, { seed = 1, length = 96, lane = 1.7, half = 18, ahead = 72 } = {}) {
  const kinds = kit.atlas.sprites, rng = kit.mulberry(seed), TILE = 4, SIZE = 160;
  const cell = (...names) => { for (const n of names) if (kinds[n] && kinds[n].length) return kinds[n][(rng() * kinds[n].length) | 0]; return 0; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.045);
  const tex = kit.speckleTexture(kit.groundPalette, 0x71f3, SIZE / TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), kit.surfaceMaterial(tex));
  ground.rotation.x = -Math.PI / 2; ground.frustumCulled = false;
  scene.add(ground);
  const layer = kit.billboardLayer(true, 1100);
  scene.add(layer.mesh);                                  // billboardLayer parks it in the game's scene; it belongs here

  // the fixed set: [x, z, w, h, cell, sway], z in 0..length. It repeats every `length` metres, far past the fog.
  const props = [];
  for (let z = 0; z < length; z += 4) for (let x = -half; x < half; x += 4) {
    const px = x + (0.15 + rng() * 0.7) * 4, pz = z + (0.15 + rng() * 0.7) * 4, roll = rng();
    if (Math.abs(px) < lane + 1.1 || rng() > 0.64) continue;
    if (roll < 0.16) { const h = 4 + rng() * 3; props.push([px, pz, h * 0.95, h, cell('dead'), 0.004]); }
    else if (roll < 0.58) { const h = 6 + rng() * 4; props.push([px, pz, h * 0.72, h, cell('fir'), 0.006]); }
    else if (roll < 0.82) { const h = 6 + rng() * 4.5; props.push([px, pz, h * 0.75, h, cell('pine'), 0.006]); }
    else { const h = 5 + rng() * 3; props.push([px, pz, h, h, cell('oak'), 0.005]); }
  }
  for (let n = 0; n < 16; n++) {
    const px = (rng() - 0.5) * 2 * half, pz = rng() * length, s = 0.7 + rng() * 0.6;
    if (Math.abs(px) < lane + 0.8) continue;
    props.push(rng() < 0.5 ? [px, pz, s, s, cell('stump'), 0] : [px, pz, s * 1.3, s, cell('boulder'), 0]);
  }
  for (let n = 0; n < 620; n++) {
    const px = (rng() - 0.5) * 2 * half, pz = rng() * length;
    if (Math.abs(px) < lane && rng() < 0.8) continue;       // the way through is trodden nearly bare
    props.push([px, pz, 0.8 + rng() * 0.5, 0.7 + rng() * 0.8, cell(rng() < 0.2 ? 'drygrass' : 'grass'), 0.05 + rng() * 0.05]);
  }

  const extras = [], loops = [];
  let dist = 0;
  const wrap = (z) => ((z + dist) % length + length) % length - ahead;       // where a fixed thing is now: -ahead .. length - ahead

  return {
    scene, length, cell,
    get dist() { return dist; },
    // the world slides d metres toward +z (the runner faces -z and stays where they are)
    scroll(d) {
      dist += d;
      tex.offset.y = (dist / TILE) % 1;
      layer.n = 0;
      for (const p of props) layer.add(p[0], 0, wrap(p[1]), p[2], p[3], p[4], p[5]);
      for (let i = extras.length - 1; i >= 0; i--) {
        const e = extras[i]; e.z += d;
        if (e.z > 30) { extras.splice(i, 1); continue; }
        layer.add(e.x, 0, e.z, e.w, e.h, e.cell, 0);
      }
      layer.commit();
      for (const l of loops) l.obj.position.set(l.x, 0, wrap(l.z));
    },
    // something in the way, placed once at world z and carried past with everything else
    put(names, x, z, w, h) { const e = { x, z, w, h, cell: cell(...[].concat(names)) }; extras.push(e); return e; },
    // a model that stands at one place on the strip and comes round again each lap
    loop(obj, x, z) { scene.add(obj); loops.push({ obj, x, z }); },
    clearExtras() { extras.length = 0; },
  };
}
