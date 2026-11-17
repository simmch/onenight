import * as THREE from 'three';

// Gear that gets better as the night goes on: the gun, the flashlight, the radar, and things that explode.
// Parts turn up in every chest, on some of the dead, and at the end of each round survived. They are spent at the
// workbench (C), which stops the world while it is open. Kits found in chests do the same job for nothing, on the spot.
// This file is the tables, the pictures and the workbench itself; what an upgrade does to the game is in main.js.

// ── pixel sprites, drawn here so new gear needs no new image files ──
const PAL = { a: '#000000', b: '#27293d', c: '#2e3449', d: '#434a5c', e: '#9ba2c8', f: '#596081', g: '#1a172c', h: '#56291b', i: '#662d18', j: '#924c24', k: '#48536a',
              l: '#4b1d13', m: '#351512', G: '#3f5a2e', H: '#5c7d3f', I: '#2a3d20', y: '#c9a94e', o: '#c9652a', s: '#8a8f9c', t: '#5b6070', r: '#b03a2e' };
function sprite(w, text) {
  const rows = text.split('\n').filter((r) => r.length), c = document.createElement('canvas');
  c.width = w; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const col = PAL[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return { url: c.toDataURL(), tex };
}
// Guns point left with the grip at the lower right, like the pistol's own picture, so they sit in the hand the same way.
export const SPRITES = {
  smg: sprite(20, `
....................
....................
....................
....................
....................
............aa...aa.
..aaaaaaaaaabbaaadda
.aeeeeeeeeeeeeefbfga
adddddddddddddddgdga
.adddkdddddddddgdgda
..aaggggggggggggggga
....agdgaaadaahihaa.
....agdga.adaahjjha.
....agdga.aaaahjjha.
....agdga....aljjia.
....agdga....aljjha.
....aaaaa....ammmma.
..............aaaa..
....................
....................`),
  rifle: sprite(24, `
........................
........................
........................
........................
........................
........................
........aa......aa......
.....aaabbaaaaaadda.aaaa
aaaaaeeeeeeeeeefbfgahjja
adddddddddddddddgdgahjja
aaaaadkddddddddgdgdahjja
....aggggggggggggggahjia
.....aaagdgaadahihaaamma
........agdga.dahjjha...
........agdga.aahjjha...
........agdgga.aljjia...
.........agdga.aljjha...
.........aaaaa.ammmma...
................aaaa....
........................
........................
........................
........................
........................`),
  storm: sprite(24, `
........................
........................
........................
........................
........................
.......aaaa.....aa......
...aaaabbbbaaaaadda.aaaa
aaaaeeeeeeeeeeefbfgahjja
arorddddddddddddgdgahjja
aaaadkdkdkdddddgdgdahjja
...aaggggggggggggggahjia
...aaaaggggggaahihaaamma
.....agddddga.ahjjha....
.....agdssdga.ahjjha....
.....agdssdga.aljjia....
.....agddddga.aljjha....
......agggga..ammmma....
.......aaaa....aaaa.....
........................
........................
........................
........................
........................
........................`),
  camera: sprite(22, `
......................
......................
.....aaaaaa...........
....addddddaa.........
...aeeeeeeefba........
..adddddddddgga.......
..aadddddddddgga......
..aaddddddddeega......
..aaddddddddeega......
..aaddddddddeega......
..aadddddddddgga......
...agggggggggga.......
....aaagggga..........
......aagga...........
......aagga...........
......aaaa............
......................
......................
......................
......................`),
  grenade: sprite(16, `
................
.......aaaa.....
......asssta.ya.
......attta.yay.
.....aaaaaa..y..
....aHHHGGGa....
...aHHGGGGGIa...
...aHGGaGGaIa...
...aGGGGGGGIa...
...aGGaGGaGIa...
...aGGGGGGIIa...
...aGIaIIaIIa...
....aIIIIIIa....
.....aaaaaa.....
................
................`),
  parts: sprite(16, `
................
......aaaa......
...aa.asta.aa...
..assaasstaasta.
..asssssssssta..
...assstttssta..
.aaasstaaatssaaa
.assstaa.aatssta
.assstaa.aatssta
.aaasstaaatssaaa
...asssttttsta..
..assssssssssta.
..astaasstaasta.
...aa.asta.aa...
......aaaa......
................`),
};

// ── the gun in your right hand, one tier at a time ──
// cooldown: seconds between shots. auto: fires for as long as the trigger is held. pitch/vol: how the one gunshot clip
// is played for each bullet. ammoScale: how much more ammunition a find gives, since a fast gun eats it. cost: parts to build.
export const GUN_TIERS = [
  { id: 'pistol', name: 'Pistol', icon: './assets/items/pistol.png', sprite: null, mag: 6, reload: 2.0, cooldown: 0.3, damage: 1, auto: false, kick: 0.025, pitch: 1, vol: 1, ammoScale: 1, scale: 1, cost: 0 },
  { id: 'smg', name: 'Machine pistol', icon: SPRITES.smg.url, sprite: 'smg', mag: 18, reload: 2.0, cooldown: 0.1, damage: 1, auto: true, kick: 0.010, pitch: 1.12, vol: 0.78, ammoScale: 2.5, scale: 1.25, cost: 8 },
  { id: 'rifle', name: 'Assault rifle', icon: SPRITES.rifle.url, sprite: 'rifle', mag: 24, reload: 2.0, cooldown: 0.125, damage: 2, auto: true, kick: 0.013, pitch: 0.86, vol: 0.88, ammoScale: 3.2, scale: 1.5, cost: 14 },
  { id: 'storm', name: 'Storm gun', icon: SPRITES.storm.url, sprite: 'storm', mag: 36, reload: 2.0, cooldown: 0.085, damage: 3, auto: true, kick: 0.011, pitch: 0.74, vol: 0.9, ammoScale: 4.5, scale: 1.5, cost: 22 },
];
// life: how many times longer a battery lasts. recharge: charge gained per second while the light is off.
export const LIGHT_TIERS = [
  { name: 'Flashlight', life: 1, recharge: 0, cost: 0, note: '' },
  { name: 'Flashlight Mk II', life: 1.5, recharge: 0, cost: 6, note: 'A battery lasts half as long again' },
  { name: 'Flashlight Mk III', life: 2, recharge: 1 / 240, cost: 10, note: 'A battery lasts twice as long, and creeps back up while the light is off' },
  { name: 'Spectral video camera', icon: SPRITES.camera.url, sprite: SPRITES.camera.tex, life: 5, recharge: 0, cost: 35, camera: true, note: 'Replaces the flashlight with a green, grainy camera: five times the base battery life, a wider beam, and brief messages on walls that vanish after you look away' },
];
export const RADAR_TIERS = [
  { name: 'Radar', range: 32, cost: 6, note: 'Finds bodies and the Choir. Only wakes in those rounds' },
  { name: 'Tracker', range: 38, cost: 8, note: 'Works in every round, and shows whatever is moving out there' },
  { name: 'Prospector', range: 46, cost: 10, note: 'Reaches farther, and marks every unopened chest in range' },
];
export const COSTS = { battery: 3, ammo: 2, matches: 2, grenade: 4, potion: 6, launcher: 10 };
export const PARTS_IN_CHEST = { common: [1, 2], blue: [3, 4], red: [4, 6], armory: [5, 7] };

// ── the workbench ──
const CSS = `
#bench { position: fixed; inset: 0; z-index: 21; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.88); font-family: "Courier New", monospace; color: #b9b3a3; }
#bench[hidden] { display: none; }
#bench .wbox { width: min(720px, 94vw); max-height: 92vh; display: flex; flex-direction: column; border: 1px solid rgba(185,179,163,.28); background: #0c0b09; }
#bench .whead { display: flex; justify-content: space-between; align-items: center; padding: 13px 20px; border-bottom: 1px solid rgba(185,179,163,.2); letter-spacing: 6px; font-size: 14px; color: #d8d2c0; }
#bench .wparts { display: flex; align-items: center; gap: 8px; letter-spacing: 3px; }
#bench .wparts img, #bench .wcost img { width: 18px; height: 18px; image-rendering: pixelated; }
#bench .wgear { padding: 9px 20px; font-size: 11px; letter-spacing: 2px; opacity: .7; border-bottom: 1px solid rgba(185,179,163,.12); }
#bench .wlist { overflow-y: auto; padding: 6px 0; }
#bench .wrow { display: grid; grid-template-columns: 26px 1fr auto; gap: 2px 12px; align-items: baseline; width: 100%; box-sizing: border-box; padding: 5px 20px; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
#bench .wrow:hover { background: rgba(185,179,163,.08); }
#bench .wrow .n { color: #d8d2c0; opacity: .55; font-size: 12px; }
#bench .wrow .nm { color: #e6dfc8; font-size: 14px; letter-spacing: 1.5px; }
#bench .wrow .nm i { font-style: normal; color: #c8a25a; font-size: 11px; letter-spacing: 3px; margin-left: 8px; }
#bench .wrow .wcost { display: flex; align-items: center; gap: 5px; font-size: 14px; color: #d8d2c0; }
#bench .wrow .nt { grid-column: 2 / 4; font-size: 11.5px; line-height: 1.45; opacity: .7; }
#bench .wrow.no { cursor: default; }
#bench .wrow.no .nm, #bench .wrow.no .wcost { color: #7a756a; }
#bench .wrow.no .nt b { font-weight: normal; color: #b0705f; }
#bench .wsay { min-height: 1.3em; padding: 8px 20px 0; font-size: 12.5px; letter-spacing: 1px; color: #9fc79a; }
#bench .wfoot { padding: 10px 20px 12px; font-size: 11px; letter-spacing: 3px; opacity: .55; }
#bench.touch .wlist { touch-action: pan-y; }
#bench.touch .wrow { cursor: default; touch-action: pan-y; transition: transform .18s, background-color .12s; }
#bench.touch .wrow.drag { transition: none; }
#bench.touch .wrow .n { color: #c8a25a; opacity: .9; }
#bench.touch .wrow.go { background: rgba(159,199,154,.2); }
#bench.touch .wrow.go .n { color: #9fc79a; }
`;
// recipes(): [{ id, name, tag, cost, note, ok, why }] for what can be built right now. craft(id): the line to show, or null.
export function createWorkbench({ onOpen, onClose, recipes, craft, parts, gear, touch = false }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const el = document.createElement('div'); el.id = 'bench'; el.hidden = true;
  el.innerHTML = `<div class="wbox"><div class="whead"><span>WORKBENCH</span><span class="wparts"><img alt="Parts" src="${SPRITES.parts.url}"><span class="wn"></span></span></div>` +
    `<div class="wgear"></div><div class="wlist"></div><div class="wsay"></div><div class="wfoot">${touch ? 'SLIDE A ROW RIGHT » TO BUILD · SWIPE LEFT TO PUT THE BENCH AWAY' : '1–9 BUILD · C / ESC CLOSE'}</div></div>`;
  if (touch) el.classList.add('touch');
  document.body.append(el);
  const list = el.querySelector('.wlist'), say = el.querySelector('.wsay');
  let rows = [];
  function draw() {
    rows = recipes();
    el.querySelector('.wn').textContent = `${parts()} PARTS`;
    el.querySelector('.wgear').textContent = gear();
    list.replaceChildren();
    rows.forEach((r, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wrow' + (r.ok ? '' : ' no');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = touch ? '»' : String(i + 1);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
      if (r.tag) { const t = document.createElement('i'); t.textContent = r.tag; nm.append(t); }
      const cost = document.createElement('span'); cost.className = 'wcost';
      const img = document.createElement('img'); img.src = SPRITES.parts.url; img.alt = 'parts'; cost.append(String(r.cost), img);
      const nt = document.createElement('span'); nt.className = 'nt'; nt.textContent = r.note;
      if (!r.ok && r.why) { const w = document.createElement('b'); w.textContent = ` · ${r.why}`; nt.append(w); }
      b.append(n, nm, cost, nt);
      if (!touch) b.addEventListener('click', () => build(i));
      list.append(b);
    });
  }
  function build(i) {
    const r = rows[i]; if (!r) return;
    if (!r.ok) { say.style.color = '#b0705f'; say.textContent = r.why ? `${r.name}: ${r.why}` : ''; return; }
    const line = craft(r.id);
    say.style.color = line ? '#9fc79a' : '#b0705f'; say.textContent = line || 'That did not work';
    draw();
  }
  const api = {
    get isOpen() { return !el.hidden; },
    open() { if (!el.hidden) return; say.textContent = ''; draw(); el.hidden = false; if (onOpen) onOpen(); },
    close() { if (el.hidden) return; el.hidden = true; if (onClose) onClose(); },
  };
  if (touch) {
    // No buttons on a phone. A finger that moves sideways is a gesture: on a row, sliding it right past the mark builds it;
    // anywhere, a swipe to the left puts the bench away. Up and down is left to the list, which scrolls.
    const SLIDE = 72;
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      const row = e.target.closest && e.target.closest('.wrow');
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, row, i: row ? [...list.children].indexOf(row) : -1, dx: 0, side: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.side && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) { drag.side = true; if (drag.row) drag.row.classList.add('drag'); }
      if (!drag.side) return;
      drag.dx = dx;
      if (drag.row) { drag.row.style.transform = `translateX(${Math.max(0, Math.min(dx, 130))}px)`; drag.row.classList.toggle('go', dx > SLIDE); }
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (d.row) { d.row.style.transform = ''; d.row.classList.remove('go', 'drag'); }
      if (cancelled || !d.side) { if (!cancelled && d.row) { say.style.color = '#b9b3a3'; say.textContent = 'Slide it to the right to build it'; } return; }
      if (d.dx > SLIDE && d.i >= 0) build(d.i);
      else if (d.dx < -SLIDE) api.close();
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }
  // while it is open the keyboard is the workbench's alone
  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyC' || e.code === 'Escape') api.close();
    else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) build(Number(e.code.slice(-1)) - 1);
  }, true);
  addEventListener('keyup', (e) => { if (!el.hidden) e.stopImmediatePropagation(); }, true);
  return api;
}


// ── the survivor's pick: live through a round and the night leaves three things; you take one ──
const PICK_CSS = `
#pick { position: fixed; inset: 0; z-index: 21; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: rgba(0,0,0,.93); font-family: "Courier New", monospace; color: #b9b3a3; }
#pick[hidden] { display: none; }
#pick h2 { margin: 0; font-size: 18px; letter-spacing: 8px; font-weight: normal; color: #d8d2c0; }
#pick .psub { margin: -8px 0 0; font-size: 12px; letter-spacing: 3px; opacity: .7; }
#pick .pcards { display: flex; gap: 16px; }
#pick .pcard { width: min(210px, 28vw); min-height: 150px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 14px 14px 12px; border: 1px solid rgba(185,179,163,.35); background: #0c0b09; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .16s, border-color .16s, background-color .16s; }
#pick .pcard:hover, #pick .pcard.go { border-color: #d8d2c0; background: #15130f; transform: translateY(-6px); }
#pick .pcard.drag { transition: none; }
#pick .pcard .n { font-size: 12px; color: #c8a25a; letter-spacing: 2px; }
#pick .pcard .nm { font-size: 15px; letter-spacing: 1.5px; color: #e6dfc8; }
#pick .pcard .nt { font-size: 11.5px; line-height: 1.5; opacity: .75; }
#pick .pfoot { font-size: 11px; letter-spacing: 3px; opacity: .55; }
#pick.touch .pcard { cursor: default; touch-action: none; }
`;
// open(options): options are [{ name, note, take() }], three of them. One is taken; onTake gets what take() returned.
export function createPicker({ onOpen, onClose, onTake, touch = false }) {
  const style = document.createElement('style'); style.textContent = PICK_CSS; document.head.append(style);
  const el = document.createElement('div'); el.id = 'pick'; el.hidden = true; if (touch) el.classList.add('touch');
  el.innerHTML = `<h2>YOU LIVED</h2><p class="psub">The night leaves three things. Take one.</p><div class="pcards"></div><div class="pfoot">${touch ? 'SLIDE A CARD UP TO TAKE IT' : '1 · 2 · 3 TO TAKE ONE'}</div>`;
  document.body.append(el);
  const cards = el.querySelector('.pcards');
  let options = [];
  function choose(i) {
    const o = options[i]; if (!o || el.hidden) return;
    el.hidden = true; options = [];
    const line = o.take();
    if (onClose) onClose();
    if (onTake) onTake(line);
  }
  const api = {
    get isOpen() { return !el.hidden; },
    open(list) {
      if (!el.hidden || !list.length) return;
      options = list; cards.replaceChildren();
      list.forEach((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pcard'; b.dataset.i = String(i);
        const n = document.createElement('span'); n.className = 'n'; n.textContent = touch ? '︿' : String(i + 1);
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = o.name;
        const nt = document.createElement('span'); nt.className = 'nt'; nt.textContent = o.note;
        b.append(n, nm, nt);
        if (!touch) b.addEventListener('click', () => choose(i));
        cards.append(b);
      });
      el.hidden = false; if (onOpen) onOpen();
    },
  };
  if (touch) {                                              // a card is taken by sliding it up, not by tapping it
    const LIFT = 56;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { const card = e.target.closest && e.target.closest('.pcard'); if (card) { drag = { id: e.pointerId, y: e.clientY, card, dy: 0 }; card.classList.add('drag'); } });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = e.clientY - drag.y;
      drag.card.style.transform = `translateY(${Math.max(-110, Math.min(0, drag.dy))}px)`; drag.card.classList.toggle('go', drag.dy < -LIFT);
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      d.card.style.transform = ''; d.card.classList.remove('drag', 'go');
      if (!cancelled && d.dy < -LIFT) choose(Number(d.card.dataset.i));
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }
  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!e.repeat && /^(Digit|Numpad)[1-3]$/.test(e.code)) choose(Number(e.code.slice(-1)) - 1);
  }, true);
  addEventListener('keyup', (e) => { if (!el.hidden) e.stopImmediatePropagation(); }, true);
  return api;
}

// ── armor: a shield worn over your health ──
// It takes every hit first. After `delay` seconds without being hit it grows back at `regen` a second. One is worn at a time;
// finding a better one puts it on and strips the old one for parts, and finding one no better patches the shield you have.
// Tiers 1–3 are what turns up in rounds 1–20; tiers 4–6 take over past round 20, when the night has gone on too long.
export const ARMOR_TIERS = [
  null,
  { name: 'Bone armor', a: '', shield: 25, regen: 4, delay: 6, colors: ['#c9bfa3', '#9c927a', '#e6dfc8', '#6a6152'] },
  { name: 'Leather coat', a: 'a ', shield: 40, regen: 5, delay: 6, colors: ['#7a5232', '#5a3b22', '#a87445', '#c9a94e'] },
  { name: 'Chain vest', a: 'a ', shield: 60, regen: 6, delay: 5.5, colors: ['#8a8f9c', '#5b6070', '#c3c8d4', '#434a5c'] },
  { name: 'Riot plate', a: '', shield: 90, regen: 8, delay: 5.5, colors: ['#3d4a5e', '#273041', '#6b7f9e', '#c9a94e'] },
  { name: "Warden's mail", a: '', shield: 125, regen: 10, delay: 5, colors: ['#5d2a2a', '#3e1a1a', '#9c4a3a', '#d9b86c'] },
  { name: 'Choir carapace', a: 'a ', shield: 170, regen: 13, delay: 4.5, colors: ['#2c2a3e', '#181726', '#6f5a9e', '#b8e0c8'] },
];
// how likely each tier is to be what turns up, by round (index = tier; 0 unused)
export function armorWeights(round) {
  if (round <= 20) {
    const late = Math.max(0, round - 8) / 12;              // 0 at round 8, 1 at round 20
    return [0, 10 - 6 * late, 6, 2 + 4 * late, 0.25 + 1.2 * late, 0.12 * late, 0];
  }
  const deep = Math.min(1, (round - 20) / 15);             // settles by round 35
  return [0, 0.5, 1, 1, 8 - 2 * deep, 5 + 2 * deep, 2.5 + 3.5 * deep];
}
export function rollArmorTier(round, rng = Math.random) {
  const w = armorWeights(round), total = w.reduce((s, v) => s + v, 0);
  let pick = rng() * total;
  for (let t = 1; t < w.length; t++) { pick -= w[t]; if (pick <= 0) return t; }
  return 1;
}
// a chestplate, drawn in each tier's colours: o outline, m main, s shade, h highlight, t trim
const PLATE = `
................
...oo......oo...
..ohho....ohmo..
..ohmmooooommo..
..ommmthhtmmmo..
...ommthhtmmo...
...ohmmttmmso...
...ohmmmmmmso...
...ohmmttmmso...
...ohmmmmmmso...
...ohmmttmmso...
...ommmmmmmso...
...osmmttmmso...
....ossmmsso....
.....oooooo.....
................`;
export const ARMOR_ICONS = ARMOR_TIERS.map((a) => {
  if (!a) return null;
  const [m, s, h, t] = a.colors, map = { o: '#000000', m, s, h, t }, c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  PLATE.split('\n').filter((r) => r.length).forEach((row, y) => { for (let x = 0; x < 16; x++) if (map[row[x]]) { g.fillStyle = map[row[x]]; g.fillRect(x, y, 1, 1); } });
  return c.toDataURL();
});
