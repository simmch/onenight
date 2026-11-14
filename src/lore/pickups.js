import * as THREE from 'three';
import { BY_ID, drawLore } from './lore.js';

// Fragments lying in the world: a pale sheet of paper or a small dark object, barely lit, with a slow breathing glow
// so it can be found at the edge of the light. Nothing here knows what the fragments say.
const PAPER = new THREE.BoxGeometry(0.3, 0.012, 0.21);
const OBJECT = new THREE.BoxGeometry(0.14, 0.1, 0.11);
const MOTE = new THREE.BoxGeometry(0.035, 0.035, 0.035);
const REACH = 2.1;

// ctx: { scene, camera, world (creature world: walkable, groundY), map: 'forest' | ..., journal, rng }
export function createLorePickups(ctx) {
  const { scene, camera, world, journal } = ctx, rng = ctx.rng || Math.random;
  const items = [];
  let clock = 0;
  const taken = () => { const s = new Set(journal.ids); for (const p of items) s.add(p.id); return s; };

  function make(id, x, z) {
    const e = BY_ID.get(id), paper = e.kind !== 'item';
    const tone = paper ? (e.kind === 'letter' ? 0xcbbf94 : e.kind === 'document' ? 0xb7b8a6 : 0xc3b58a) : 0x8a7a5a;
    const mat = new THREE.MeshBasicMaterial({ color: tone });
    const body = new THREE.Mesh(paper ? PAPER : OBJECT, mat);
    const root = new THREE.Group(), y = world.groundY(x, z);
    root.position.set(x, y + (paper ? 0.04 : 0.06), z);
    body.rotation.y = rng() * 6.28; if (paper) { body.rotation.z = (rng() - 0.5) * 0.12; }
    root.add(body);
    const mote = new THREE.Mesh(MOTE, new THREE.MeshBasicMaterial({ color: 0xe8dcaa }));
    mote.position.y = 0.32; root.add(mote);
    scene.add(root);
    items.push({ id, x, z, root, body, mote, mat, tone: new THREE.Color(tone), phase: rng() * 6.28, kind: e.kind });
  }
  // somewhere on foot-reachable ground between min and max metres of (cx, cz)
  function place(cx, cz, min, max, gap = 8, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2, d = min + rng() * (max - min), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!world.walkable(x, z, 0.5)) continue;
      if (items.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      return { x, z };
    }
    return null;
  }
  function spawn(pool, cx, cz, min, max, gap = 8) {
    const e = drawLore(pool, ctx.map, taken(), journal.count, rng);
    if (!e) return null;
    const at = place(cx, cz, min, max, gap);
    if (!at) return null;
    make(e.id, at.x, at.z);
    return e.id;
  }
  function clear() { for (const p of items) { p.root.removeFromParent(); p.mat.dispose(); p.mote.material.dispose(); } items.length = 0; }

  return {
    // two the first night, three after, scattered between 18 and 70 metres out
    spawnRound(n) { clear(); const p = camera.position; for (let i = 0; i < (n === 1 ? 2 : 3); i++) spawn('world', p.x, p.z, 18, 70); },
    // something left where it happened: close to (x, z)
    dropAt(pool, x, z) { return spawn(pool, x, z, 0.9, 1.8, 0.7) || spawn(pool, x, z, 0.4, 3.2, 0.5); },
    clear,
    update(dt, inControl, yaw) {
      clock += dt;
      const p = camera.position, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let near = null, best = REACH;
      for (const it of items) {
        const k = 0.55 + 0.45 * Math.sin(clock * 1.7 + it.phase);
        it.mat.color.copy(it.tone).multiplyScalar(0.55 + 0.45 * k);
        it.mote.position.y = 0.3 + 0.06 * Math.sin(clock * 1.3 + it.phase);
        it.mote.material.color.setRGB(0.9 * k, 0.85 * k, 0.6 * k);
        it.root.rotation.y += dt * 0.2;
        if (!inControl) continue;
        const ex = it.x - p.x, ez = it.z - p.z, d = Math.hypot(ex, ez);
        if (d < best && (d < 0.9 || (ex * fx + ez * fz) / d > 0.3)) { best = d; near = it; }
      }
      return near;
    },
    collect(it) {
      const i = items.indexOf(it); if (i < 0) return null;
      items.splice(i, 1); it.root.removeFromParent(); it.mat.dispose(); it.mote.material.dispose();
      return it.id;
    },
    get items() { return items; },
  };
}
