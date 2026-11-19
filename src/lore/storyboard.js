import { ENTRIES, BY_ID, KINDS } from './lore.js';
import { THREADS, LINKS as RAW_LINKS } from './threads.js';

// The storyboard: every fragment pinned to a board, with string run between the ones that belong together.
// Opened from the title screen (LORE). Unfound fragments are blank pins; one next to something found is a lead,
// marked "?" with a dashed string. A string, and the name of its thread, only appear once both ends are found.
//
// Desktop: drag the board to pan, wheel to zoom, drag a card to move it, click to read, double-click for the whole board.
//          Arrows step through what you have, / searches, F fits, Esc backs out.
// Phone:   one finger pans or moves a card, two fingers zoom, tap a card to read, swipe the reading sheet down to
//          put it away, swipe the header down to close the board.
// Card positions are the player's to keep: they are saved, and RESET puts them back.

const POS_KEY = 'oneNight.storyboard.v1';
const W = 176, H = 66;                       // card size, world units (px at zoom 1)
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label.replace(/S$/, '')]));
const THREAD = new Map(THREADS.map((t) => [t.id, t]));
const LINKS = RAW_LINKS.filter(([a, b, t]) => {
  const ok = BY_ID.has(a) && BY_ID.has(b) && THREAD.has(t) && a !== b;
  if (!ok) console.warn('storyboard: skipping link', a, b, t);
  return ok;
});

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s) => esc(s).replace(/~~(.+?)~~/g, '<s>$1</s>');
const plain = (s) => String(s).replace(/~~/g, '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// A fixed starting layout: each card starts near its main thread, then a force pass pulls linked cards together
// and pushes the rest apart, and a last pass clears overlaps. Same every time, so the board never reshuffles.
export function defaultLayout(K = 150, GX = 2, GY = 3) {
  const rnd = mulberry(0x5eed), ids = ENTRIES.map((e) => e.id), at = new Map(ids.map((id, i) => [id, i]));
  const main = new Map();
  for (const [a, b, t] of LINKS) { if (!main.has(a)) main.set(a, t); if (!main.has(b)) main.set(b, t); }
  const P = ids.map((id) => {
    const ti = THREADS.findIndex((t) => t.id === main.get(id)), ang = (ti / THREADS.length) * Math.PI * 2;
    return { x: Math.cos(ang) * 700 + (rnd() - 0.5) * 300, y: Math.sin(ang) * 460 + (rnd() - 0.5) * 220, vx: 0, vy: 0 };
  });
  const E = LINKS.map(([a, b]) => [at.get(a), at.get(b)]), k = 250;
  for (let it = 0, temp = 60; it < 420; it++, temp *= 0.992) {
    for (const p of P) { p.vx = 0; p.vy = 0; }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let dx = P[i].x - P[j].x, dy = (P[i].y - P[j].y) * 1.5, d = Math.hypot(dx, dy) || 0.01;
      const f = (k * k) / d;
      dx = dx / d * f; dy = dy / d * f;
      P[i].vx += dx; P[i].vy += dy; P[j].vx -= dx; P[j].vy -= dy;
    }
    for (const [i, j] of E) {
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.hypot(dx, dy) || 0.01, f = (d * d) / k;
      P[i].vx -= dx / d * f; P[i].vy -= dy / d * f; P[j].vx += dx / d * f; P[j].vy += dy / d * f;
    }
    for (const p of P) {
      p.vx -= p.x * GX; p.vy -= p.y * GY;                       // a little gravity keeps islands on the board
      const v = Math.hypot(p.vx, p.vy) || 1, s = Math.min(v, temp);
      p.x += p.vx / v * s; p.y += p.vy / v * s;
    }
  }
  for (let pass = 0; pass < 80; pass++) {                         // no two cards on top of each other
    let moved = false;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const ox = W + 26 - Math.abs(P[i].x - P[j].x), oy = H + 34 - Math.abs(P[i].y - P[j].y);
      if (ox > 0 && oy > 0) {
        moved = true;
        if (ox < oy) { const s = (P[i].x < P[j].x ? -1 : 1) * ox / 2; P[i].x += s; P[j].x -= s; }
        else { const s = (P[i].y < P[j].y ? -1 : 1) * oy / 2; P[i].y += s; P[j].y -= s; }
      }
    }
    if (!moved) break;
  }
  const minX = Math.min(...P.map((p) => p.x)), minY = Math.min(...P.map((p) => p.y));
  return Object.fromEntries(ids.map((id, i) => [id, { x: Math.round(P[i].x - minX + 120), y: Math.round(P[i].y - minY + 120) }]));
}

const CSS = `
#story { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; font-family: "Courier New", monospace; color: #c9c0a8; background: #120d09; user-select: none; -webkit-user-select: none; touch-action: none; }
#story[hidden] { display: none; }
#story .sh { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 18px; border-bottom: 1px solid rgba(201,192,168,.18); background: #0d0907; z-index: 3; }
#story .sh h2 { margin: 0; font-weight: normal; font-size: 15px; letter-spacing: 7px; color: #e8dfc6; white-space: nowrap; }
#story .sh .sc { font-size: 11px; letter-spacing: 3px; opacity: .65; white-space: nowrap; }
#story .sh .sp { flex: 1; }
#story .sh input { background: #1b140f; border: 1px solid rgba(201,192,168,.25); color: #e8dfc6; font: 13px "Courier New", monospace; padding: 6px 10px; width: 190px; letter-spacing: 1px; outline: none; }
#story .sh input:focus { border-color: #d9b55c; }
#story .sh button, #story .sr button.sx { background: none; border: 1px solid rgba(201,192,168,.25); color: #c9c0a8; font: 12px "Courier New", monospace; letter-spacing: 3px; padding: 6px 10px; cursor: pointer; }
#story .sh button:hover, #story .sh button:focus-visible, #story .sr button.sx:hover { color: #fff; border-color: #e8dfc6; outline: none; }
#story .sv { position: relative; flex: 1; overflow: hidden; cursor: grab; min-height: 0;
  background-color: #2a1d13;
  background-image: radial-gradient(rgba(0,0,0,.28) 1px, transparent 1.4px), radial-gradient(rgba(255,220,170,.05) 1px, transparent 1.4px), radial-gradient(ellipse at 50% 40%, rgba(120,80,40,.25), rgba(0,0,0,.55));
  background-size: 7px 7px, 11px 11px, 100% 100%; }
#story .sv.panning { cursor: grabbing; }
#story .sw { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
#story svg.ss { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
#story .ln { fill: none; stroke-width: 2.4; stroke-linecap: round; opacity: .78; transition: opacity .2s, stroke-width .2s; filter: drop-shadow(0 2px 1px rgba(0,0,0,.6)); }
#story .ln.lead { stroke: rgba(230,215,180,.35) !important; stroke-dasharray: 5 7; stroke-width: 1.6; opacity: .6; }
#story .lt { font: 12px "Courier New", monospace; fill: #f1e7cc; paint-order: stroke; stroke: #120d09; stroke-width: 4px; opacity: 0; transition: opacity .2s; text-anchor: middle; }
#story .card { position: absolute; width: ${W}px; height: ${H}px; box-sizing: border-box; padding: 16px 10px 6px; border: 0; text-align: left; font: inherit; color: #2a2118; cursor: pointer; box-shadow: 0 6px 12px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.2) inset; transition: opacity .2s, box-shadow .2s, filter .2s; touch-action: none; }
#story .card:focus-visible { outline: 2px solid #d9b55c; outline-offset: 3px; }
#story .card .pin { position: absolute; left: 50%; top: -6px; width: 13px; height: 13px; margin-left: -6.5px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff9d8a, #b2281c 55%, #5a0e08); box-shadow: 0 3px 3px rgba(0,0,0,.6); }
#story .card .ck { display: block; font-size: 9px; letter-spacing: 3px; opacity: .6; margin-bottom: 3px; }
#story .card .ct { display: block; font-size: 12.5px; line-height: 1.2; letter-spacing: .5px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#story .card .dot { position: absolute; right: 7px; top: 6px; width: 7px; height: 7px; border-radius: 50%; background: #b2281c; }
#story .sw.far .card .ck { display: none; }
#story .sw.far .card .ct { font-size: 21px; line-height: 1.1; -webkit-line-clamp: 2; }
#story .sw.far .ln { stroke-width: 4; }
#story .sw.far .lt { font-size: 22px; }
#story .card.k-letter { background: #e9dcb6; font-style: italic; }
#story .card.k-note { background: #e6d58e; }
#story .card.k-document { background: #d7d4cb; }
#story .card.k-item { background: #b89a72; color: #1d150d; border-radius: 3px 3px 14px 3px; }
#story .card.unfound { background: rgba(30,22,15,.75); color: #6e6250; box-shadow: none; border: 1px dashed rgba(201,192,168,.18); opacity: .32; cursor: default; font-style: normal; }
#story .card.unfound .pin { background: #3b2d22; box-shadow: none; }
#story .card.lead { opacity: .8; border-color: rgba(230,215,180,.45); }
#story .card.lead .ct { font-size: 22px; text-align: center; color: #a89a80; }
#story .card.dragging { box-shadow: 0 16px 26px rgba(0,0,0,.7); z-index: 5; cursor: grabbing; }
#story.focus .card:not(.hot), #story.focus .ln:not(.hot) { opacity: .12; }
#story.focus .card.unfound:not(.hot) { opacity: .06; }
#story .ln.hot { opacity: 1; stroke-width: 3.4; }
#story.focus .lt.hot, #story .lt.peek { opacity: 1; }
#story .card.sel { box-shadow: 0 0 0 3px #f1e7cc, 0 12px 22px rgba(0,0,0,.7); z-index: 4; }
#story .card.hit { box-shadow: 0 0 0 3px #d9b55c, 0 6px 12px rgba(0,0,0,.55); }
#story.searching .card:not(.hit) { opacity: .15; }
#story.searching .ln { opacity: .12; }
#story .sl { position: absolute; left: 12px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; max-width: min(640px, 70%); z-index: 2; }
#story .sl button { background: rgba(13,9,7,.85); border: 1px solid rgba(201,192,168,.2); color: #c9c0a8; font: 11px "Courier New", monospace; letter-spacing: 2px; padding: 5px 8px 5px 22px; cursor: pointer; position: relative; }
#story .sl button::before { content: ""; position: absolute; left: 8px; top: 50%; width: 8px; height: 3px; margin-top: -1.5px; background: var(--c); }
#story .sl button.on { border-color: var(--c); color: #fff; }
#story .sl button.unk { opacity: .45; cursor: default; }
#story .sr { position: absolute; right: 0; top: 0; bottom: 0; width: min(420px, 92vw); background: rgba(14,10,8,.96); border-left: 1px solid rgba(201,192,168,.2); padding: 22px 26px 26px; overflow-y: auto; box-sizing: border-box; z-index: 3; transform: translateX(105%); transition: transform .25s ease; }
#story .sr.open { transform: none; }
#story .sr { touch-action: pan-y; }
#story .sr .rk { font-size: 10px; letter-spacing: 5px; opacity: .55; margin: 0 0 8px; }
#story .sr .rt { font-size: 19px; letter-spacing: 1.5px; color: #f1e7cc; margin: 0 0 18px; }
#story .sr .rx { white-space: pre-wrap; font-size: 14.5px; line-height: 1.75; color: #ddd3b8; }
#story .sr .rx s { opacity: .6; text-decoration-thickness: 2px; }
#story .sr.k-letter .rx { font-style: italic; color: #e6d7ad; }
#story .sr h3 { font-size: 10px; letter-spacing: 5px; font-weight: normal; opacity: .55; margin: 26px 0 10px; }
#story .sr .rl { display: block; width: 100%; text-align: left; background: none; border: 0; border-left: 3px solid var(--c); color: #d6ccb0; font: 13px "Courier New", monospace; padding: 6px 10px; margin: 0 0 6px; cursor: pointer; line-height: 1.4; }
#story .sr .rl:hover, #story .sr .rl:focus-visible { background: rgba(201,192,168,.08); outline: none; color: #fff; }
#story .sr .rl small { display: block; opacity: .6; font-size: 11.5px; }
#story .sr .rl.unk { cursor: default; opacity: .5; border-left-style: dashed; }
#story .sr .rtags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
#story .sr .rtags span { font-size: 10px; letter-spacing: 2px; padding: 3px 6px; border: 1px solid var(--c); color: var(--c); }
#story .sr button.sx { position: absolute; right: 14px; top: 14px; padding: 3px 8px; }
#story .sr .grip { display: none; }
#story .se { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); text-align: center; font-size: 14px; letter-spacing: 3px; line-height: 2; color: #d6ccb0; pointer-events: none; text-shadow: 0 2px 6px #000; z-index: 2; }
#story .sf { position: absolute; right: 12px; bottom: 12px; font-size: 10.5px; letter-spacing: 2px; opacity: .5; text-align: right; line-height: 1.7; pointer-events: none; z-index: 1; }
#story.reading .sf { display: none; }
body.touch #story .sh { flex-wrap: wrap; gap: 8px 10px; padding: 10px 12px 8px; }
body.touch #story .sh .grab { flex-basis: 100%; height: 4px; order: -1; display: flex; justify-content: center; }
body.touch #story .sh .grab::before { content: ""; width: 44px; height: 4px; border-radius: 2px; background: rgba(201,192,168,.4); }
body.touch #story .sh .sp, body.touch #story .sh button { display: none; }
body.touch #story .sh input { flex: 1; min-width: 0; width: auto; font-size: 16px; }
body.touch #story .sl { max-width: none; right: 12px; bottom: 10px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; touch-action: pan-x; }
body.touch #story .sl button { flex: none; }
body.touch #story .sr { top: auto; left: 0; width: 100%; max-height: 62%; border-left: 0; border-top: 1px solid rgba(201,192,168,.25); transform: translateY(105%); padding-top: 26px; }
body.touch #story .sr.open { transform: none; }
body.touch #story .sr .grip { display: block; position: absolute; left: 50%; top: 9px; width: 44px; height: 4px; margin-left: -22px; border-radius: 2px; background: rgba(201,192,168,.4); }
body.touch #story .sr button.sx { display: none; }
body.touch #story .sf { display: none; }
body.touch #story .sf.first { display: block; bottom: auto; top: 58%; left: 0; right: 0; text-align: center; }
@media (prefers-reduced-motion: reduce) { #story .sr, #story .card, #story .ln, #story .lt { transition: none; } }
`;

export function createStoryboard({ getFound, markRead, onOpen, onClose } = {}) {
  const touch = () => document.body.classList.contains('touch');
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'story'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Lore storyboard');
  root.innerHTML = `
    <div class="sh"><span class="grab" aria-hidden="true"></span><h2>THE BOARD</h2><span class="sc"></span><span class="sp"></span>
      <input type="search" placeholder="search what you've read" aria-label="Search found fragments" spellcheck="false">
      <button type="button" data-act="fit" title="Fit the board (F)">FIT</button><button type="button" data-act="reset" title="Put every card back where it started">RESET</button><button type="button" data-act="close" title="Close (Esc)">CLOSE</button></div>
    <div class="sv"><div class="sw"><svg class="ss" xmlns="http://www.w3.org/2000/svg"></svg></div>
      <div class="se" hidden></div><div class="sl"></div><div class="sf"></div>
      <aside class="sr" aria-live="polite"><span class="grip"></span><button type="button" class="sx" title="Put it away (Esc)">×</button><div class="rb"></div></aside></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const view = $('.sv'), world = $('.sw'), svg = $('svg.ss'), reader = $('.sr'), readBody = $('.rb'), legend = $('.sl'), countEl = $('.sc'), empty = $('.se'), foot = $('.sf'), search = $('.sh input'), header = $('.sh');

  const base = defaultLayout();
  let pos = loadPositions();
  let found = {}, isOpen = false, sel = null, thread = null, query = '', cam = { x: 0, y: 0, s: 1 }, fitted = false;
  const cards = new Map(), lines = [];

  function loadPositions() {
    const out = {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    for (const id in base) {
      const p = saved[id];
      out[id] = p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e5 && Math.abs(p.y) < 1e5 ? { x: p.x, y: p.y } : { ...base[id] };
    }
    return out;
  }
  const savePositions = () => { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (e) { /* private mode: the layout just won't be kept */ } };
  const isFound = (id) => !!found[id];
  const neighbours = (id) => LINKS.filter(([a, b]) => a === id || b === id).map((l) => ({ link: l, other: l[0] === id ? l[1] : l[0] }));
  const isLead = (id) => !isFound(id) && neighbours(id).some((n) => isFound(n.other));
  const knownLink = ([a, b]) => isFound(a) && isFound(b);
  const threadKnown = (t) => LINKS.some((l) => l[2] === t && knownLink(l));
  const ordered = () => ENTRIES.filter((e) => isFound(e.id)).sort((a, b) => (found[a.id].n || 0) - (found[b.id].n || 0));

  // ── building the board ──
  function build() {
    for (const c of cards.values()) c.remove();
    cards.clear();
    for (const e of ENTRIES) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'card'; el.dataset.id = e.id;
      const tilt = ((hashStr(e.id) % 100) / 100 - 0.5) * 4;             // each card hangs a little crooked, always the same way
      el.style.setProperty('--tilt', tilt.toFixed(2) + 'deg');
      world.appendChild(el); cards.set(e.id, el);
    }
    svg.innerHTML = ''; lines.length = 0;
    for (const l of LINKS) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', 'ln');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text'); text.setAttribute('class', 'lt');
      g.append(path, text); svg.appendChild(g);
      lines.push({ l, path, text });
    }
  }
  function placeCard(id) {
    const el = cards.get(id), p = pos[id];
    el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(var(--tilt))`;
  }
  function pinOf(id) { const p = pos[id]; return [p.x + W / 2, p.y]; }
  function drawLine(L) {
    const [a, b] = L.l, [x1, y1] = pinOf(a), [x2, y2] = pinOf(b);
    const d = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 14 + d * 0.09;   // string sags
    L.path.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
    L.text.setAttribute('x', mx.toFixed(1)); L.text.setAttribute('y', ((y1 + y2) / 2 + (14 + d * 0.09) / 2 - 4).toFixed(1));
  }
  function sizeWorld() {
    let mx = 0, my = 0;
    for (const id in pos) { mx = Math.max(mx, pos[id].x + W + 200); my = Math.max(my, pos[id].y + H + 200); }
    svg.setAttribute('width', mx); svg.setAttribute('height', my);
    world.style.width = mx + 'px'; world.style.height = my + 'px';
  }

  // ── what is shown ──
  function paint() {
    const total = ENTRIES.length, got = ordered().length, known = LINKS.filter(knownLink).length;
    countEl.textContent = `${got} / ${total} FOUND · ${known} / ${LINKS.length} CONNECTIONS`;
    for (const e of ENTRIES) {
      const el = cards.get(e.id), f = isFound(e.id), lead = !f && isLead(e.id);
      el.className = `card k-${e.kind}` + (f ? '' : ' unfound') + (lead ? ' lead' : '');
      el.setAttribute('aria-disabled', f ? 'false' : 'true');   // not disabled: a disabled button swallows the pointer, and the board must still pan from it
      el.tabIndex = f ? 0 : -1;
      el.setAttribute('aria-label', f ? `${KIND_LABEL[e.kind] || e.kind}: ${plain(e.title)}` : lead ? 'A lead: not found yet' : 'Not found yet');
      el.innerHTML = '<span class="pin"></span>' + (f
        ? `<span class="ck">${esc(KIND_LABEL[e.kind] || e.kind.toUpperCase())}</span><span class="ct">${esc(plain(e.title))}</span>${found[e.id].read ? '' : '<span class="dot" title="unread"></span>'}`
        : `<span class="ck">${lead ? 'NOT YET FOUND' : ''}</span><span class="ct">${lead ? '?' : ''}</span>`);
      placeCard(e.id);
    }
    for (const L of lines) {
      const [a, b, t, why] = L.l, both = knownLink(L.l), one = isFound(a) !== isFound(b);
      L.path.style.display = both || one ? '' : 'none';
      L.path.setAttribute('class', 'ln' + (both ? '' : ' lead'));
      L.path.style.stroke = THREAD.get(t).color;
      L.text.textContent = both ? plain(why) : '';
      L.text.style.display = both ? '' : 'none';
      drawLine(L);
    }
    legend.innerHTML = '';
    for (const t of THREADS) {
      const all = LINKS.filter((l) => l[2] === t.id), k = all.filter(knownLink).length, b = document.createElement('button');
      b.type = 'button'; b.style.setProperty('--c', t.color); b.dataset.thread = t.id;
      if (k) { b.textContent = `${t.label} ${k}/${all.length}`; b.title = `Show the ${t.label.toLowerCase()} thread`; }
      else { b.textContent = 'UNKNOWN THREAD'; b.className = 'unk'; b.disabled = true; }
      if (thread === t.id) b.classList.add('on');
      legend.appendChild(b);
    }
    empty.hidden = got > 0;
    foot.classList.toggle('first', !got);             // a phone only gets the gesture hints while the board is empty
    empty.innerHTML = 'NOTHING PINNED YET.<br>What you find out in the night is kept here,<br>and strung to what it belongs with.';
    foot.innerHTML = touch() ? 'ONE FINGER: MOVE · TWO: ZOOM<br>TAP A CARD TO READ · SWIPE THE TOP DOWN TO CLOSE'
      : 'DRAG: MOVE · WHEEL: ZOOM · DOUBLE-CLICK: WHOLE BOARD<br>ARROWS: NEXT · / SEARCH · F FIT · ESC BACK';
    highlight();
  }
  function highlight() {
    const hot = new Set(), hotLines = new Set();
    if (sel) { hot.add(sel); for (const n of neighbours(sel)) { hot.add(n.other); hotLines.add(n.link); } }
    if (thread) for (const l of LINKS) if (l[2] === thread && knownLink(l)) { hot.add(l[0]); hot.add(l[1]); hotLines.add(l); }
    root.classList.toggle('focus', !!(sel || thread));
    for (const [id, el] of cards) { el.classList.toggle('hot', hot.has(id)); el.classList.toggle('sel', id === sel); }
    for (const L of lines) { L.path.classList.toggle('hot', hotLines.has(L.l)); L.text.classList.toggle('hot', hotLines.has(L.l)); }
    // search: only what has been read can be searched, so it never gives anything away
    const q = query.trim().toLowerCase();
    root.classList.toggle('searching', !!q);
    for (const [id, el] of cards) {
      const e = BY_ID.get(id);
      el.classList.toggle('hit', !!q && isFound(id) && (plain(e.title) + ' ' + plain(e.text)).toLowerCase().includes(q));
    }
    for (const b of legend.children) b.classList.toggle('on', b.dataset.thread === thread);
  }

  // ── reading ──
  function select(id, { fly = true } = {}) {
    if (!id || !isFound(id)) { sel = null; reader.classList.remove('open'); root.classList.remove('reading'); highlight(); return; }
    sel = id;
    if (!found[id].read) { found[id].read = true; try { markRead && markRead(id); } catch (e) { /* the board still works */ } paint(); }
    const e = BY_ID.get(id), links = neighbours(id);
    const tags = [...new Set(links.filter((n) => knownLink(n.link)).map((n) => n.link[2]))].map((t) => THREAD.get(t));
    const conns = links.map(({ link, other }) => {
      const t = THREAD.get(link[2]);
      if (isFound(other)) return `<button type="button" class="rl" data-go="${esc(other)}" style="--c:${t.color}">${esc(plain(BY_ID.get(other).title))}<small>${fmt(link[3])}</small></button>`;
      return `<div class="rl unk" style="--c:${t.color}">Something not yet found<small>${/^[aeiou]/i.test(KIND_LABEL[BY_ID.get(other).kind] || '') ? 'An' : 'A'} ${esc((KIND_LABEL[BY_ID.get(other).kind] || 'fragment').toLowerCase())}, somewhere out there.</small></div>`;
    }).join('');
    reader.className = `sr open k-${e.kind}`;
    root.classList.add('reading');
    readBody.innerHTML = `<p class="rk">${esc(KIND_LABEL[e.kind] || e.kind.toUpperCase())} · FOUND ${found[id].n ? '#' + found[id].n : ''}</p>
      <p class="rt">${esc(plain(e.title))}</p><div class="rx">${fmt(e.text)}</div>
      ${tags.length ? `<h3>THREADS</h3><div class="rtags">${tags.map((t) => `<span style="--c:${t.color}">${esc(t.label)}</span>`).join('')}</div>` : ''}
      <h3>CONNECTED TO · ${links.filter((n) => isFound(n.other)).length} / ${links.length}</h3>${conns || '<div class="rl unk">Nothing yet.</div>'}`;
    reader.scrollTop = 0;
    highlight();
    if (fly) flyTo(id);
  }
  readBody.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) select(b.dataset.go); });
  $('.sr .sx').addEventListener('click', () => select(null));
  function step(d) {
    const seq = ordered(); if (!seq.length) return;
    const i = seq.findIndex((e) => e.id === sel);
    select(seq[i < 0 ? (d > 0 ? 0 : seq.length - 1) : (i + d + seq.length) % seq.length].id);
  }

  // ── the camera over the board ──
  function applyCam() {
    world.style.transform = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.s.toFixed(4)})`;
    world.classList.toggle('far', cam.s < 0.5);          // zoomed out: bigger titles, so the overview still reads
  }
  function viewRect() { const r = view.getBoundingClientRect(); return { w: r.width || innerWidth, h: r.height || innerHeight, left: r.left, top: r.top }; }
  function readerCover() { if (!reader.classList.contains('open')) return { r: 0, b: 0 }; const rr = reader.getBoundingClientRect(); return touch() ? { r: 0, b: rr.height } : { r: rr.width, b: 0 }; }
  function zoomAt(sx, sy, s) {
    s = clamp(s, 0.2, 2.6);
    const wx = (sx - cam.x) / cam.s, wy = (sy - cam.y) / cam.s;
    cam.s = s; cam.x = sx - wx * s; cam.y = sy - wy * s; applyCam();
  }
  function fit(ids, whole = false) {
    const v = viewRect(), cover = readerCover();
    if (!ids) { ids = ENTRIES.map((e) => e.id).filter((id) => isFound(id) || isLead(id)); if (!ids.length) { ids = ENTRIES.map((e) => e.id); whole = true; } }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) { const p = pos[id]; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + W); y1 = Math.max(y1, p.y + H); }
    const pad = 60, aw = Math.max(100, v.w - cover.r - pad * 2), ah = Math.max(100, v.h - cover.b - pad * 2 - 40);
    // never so far out that a title cannot be read (unless asked for the whole board): if it does not fit, centre on it instead
    cam.s = clamp(Math.min(aw / (x1 - x0), ah / (y1 - y0)), whole ? 0.2 : touch() ? 0.42 : 0.55, 1.4);
    cam.x = pad + (aw - (x1 - x0) * cam.s) / 2 - x0 * cam.s;
    cam.y = pad + (ah - (y1 - y0) * cam.s) / 2 - y0 * cam.s;
    applyCam(); fitted = true;
  }
  function flyTo(id) {                                     // keep the chosen card in view, beside the reader
    const v = viewRect(), cover = readerCover(), p = pos[id];
    const sx = cam.x + (p.x + W / 2) * cam.s, sy = cam.y + (p.y + H / 2) * cam.s;
    const left = 40, right = v.w - cover.r - 40, top = 40, bottom = v.h - cover.b - 50;
    if (sx >= left && sx <= right && sy >= top && sy <= bottom) return;
    cam.x += (left + right) / 2 - sx; cam.y += (top + bottom) / 2 - sy; applyCam();
  }

  // ── pointers: pan, zoom, move a card, pick a card ──
  const ptrs = new Map();
  let gesture = null;          // { kind: 'pan' | 'card' | 'pinch', ... }
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sr, .sl')) return;
    if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') return;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      if (gesture && gesture.kind === 'card') endCardDrag(gesture, false);
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: cam.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.x, cy: cam.y };
      return;
    }
    if (ptrs.size > 2) return;
    const card = e.target.closest('.card');
    if (card && !card.classList.contains('unfound')) gesture = { kind: 'card', id: card.dataset.id, el: card, x: e.clientX, y: e.clientY, px: pos[card.dataset.id].x, py: pos[card.dataset.id].y, moved: false, t: performance.now() };
    else gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  });
  view.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = viewRect();
      const s = clamp(gesture.s * d / gesture.d, 0.2, 2.6);
      const wx = (gesture.mx - v.left - gesture.cx) / gesture.s, wy = (gesture.my - v.top - gesture.cy) / gesture.s;
      cam.s = s; cam.x = mx - v.left - wx * s; cam.y = my - v.top - wy * s; applyCam();
    } else if (gesture.kind === 'pan') {
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) > 4) { gesture.moved = true; view.classList.add('panning'); }
      if (gesture.moved) { cam.x = gesture.cx + dx; cam.y = gesture.cy + dy; applyCam(); }
    } else if (gesture.kind === 'card') {
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) > 6) { gesture.moved = true; gesture.el.classList.add('dragging'); }
      if (gesture.moved) {
        pos[gesture.id] = { x: Math.round(gesture.px + dx / cam.s), y: Math.round(gesture.py + dy / cam.s) };
        placeCard(gesture.id);
        for (const L of lines) if (L.l[0] === gesture.id || L.l[1] === gesture.id) drawLine(L);
      }
    }
  });
  function endCardDrag(g, keep) {
    if (!g || g.kind !== 'card') return;
    g.el.classList.remove('dragging');
    if (g.moved && keep) { sizeWorld(); savePositions(); }
    else if (g.moved) { pos[g.id] = { x: g.px, y: g.py }; placeCard(g.id); for (const L of lines) if (L.l[0] === g.id || L.l[1] === g.id) drawLine(L); }
  }
  function lift(e, cancelled) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    const g = gesture;
    if (!g) return;
    if (g.kind === 'pinch') { if (ptrs.size === 0) gesture = null; else { const [p] = ptrs.values(); gesture = { kind: 'pan', x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: true }; } return; }
    gesture = null; view.classList.remove('panning');
    if (cancelled) { endCardDrag(g, false); return; }
    if (g.kind === 'card') { endCardDrag(g, true); if (!g.moved) select(g.id === sel ? null : g.id); }
    else if (g.kind === 'pan' && !g.moved && (sel || thread)) { thread = null; select(null); }
  }
  view.addEventListener('pointerup', (e) => lift(e, false));
  view.addEventListener('pointercancel', (e) => lift(e, true));
  view.addEventListener('lostpointercapture', (e) => { if (ptrs.has(e.pointerId)) lift(e, true); });
  view.addEventListener('wheel', (e) => {
    if (e.target.closest('.sr')) return;
    e.preventDefault();
    const v = viewRect(), k = Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -300, 300) * (e.ctrlKey ? 0.01 : 0.0018));
    zoomAt(e.clientX - v.left, e.clientY - v.top, cam.s * k);
  }, { passive: false });
  view.addEventListener('dblclick', (e) => { if (!e.target.closest('.card, .sr, .sl')) fit(ENTRIES.map((x) => x.id), true); });   // the whole board
  // keyboard: Enter/Space on a focused card reads it (a <button> click)
  world.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c && e.detail === 0 && !c.classList.contains('unfound')) select(c.dataset.id); });

  legend.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-thread]'); if (!b || b.disabled) return;
    thread = thread === b.dataset.thread ? null : b.dataset.thread;
    highlight();
    if (thread) { const ids = [...new Set(LINKS.filter((l) => l[2] === thread && knownLink(l)).flatMap((l) => [l[0], l[1]]))]; if (ids.length) fit(ids); }
  });
  search.addEventListener('input', () => { query = search.value; highlight(); });
  search.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') { const hit = [...cards.values()].find((c) => c.classList.contains('hit')); if (hit) { select(hit.dataset.id); search.blur(); } }
  });
  header.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'close') close();
    else if (b.dataset.act === 'fit') fit();
    else if (b.dataset.act === 'reset') { pos = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { ...v }])); savePositions(); sizeWorld(); paint(); fit(); }
  });

  // phone: swipe the header down to close; swipe the reading sheet down to put it away
  function swipeDown(el, fn, onlyFromTop) {
    let s = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button.rl')) return;      // from the search box too: a tap still focuses it
      if (onlyFromTop && el.scrollTop > 2) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    });
    addEventListener('pointerup', (e) => {                // on the window: the finger may lift anywhere
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, quick = performance.now() - s.t < 700; s = null;
      if (dy > 60 && dy > Math.abs(dx) * 1.4 && quick) fn();
    });
    addEventListener('pointercancel', (e) => { if (s && s.id === e.pointerId) s = null; });
  }
  swipeDown(header, () => close(), false);
  swipeDown(reader, () => select(null), true);

  addEventListener('keydown', (e) => {
    if (!isOpen) return;
    const typing = e.target === search;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (typing && search.value) { search.value = ''; query = ''; highlight(); }
      else if (typing) search.blur();
      else if (sel) select(null);
      else if (thread) { thread = null; highlight(); }
      else close();
    } else if (!typing) {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.code === 'KeyF') fit();
      else if (e.code === 'Slash') { e.preventDefault(); search.focus(); }
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') { const v = viewRect(); zoomAt(v.w / 2, v.h / 2, cam.s * 1.2); }
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { const v = viewRect(); zoomAt(v.w / 2, v.h / 2, cam.s / 1.2); }
      else if (e.code === 'Tab') return;               // let focus move between cards
    }
    e.stopPropagation();                                // nothing behind the board hears a key while it is open
  }, true);
  addEventListener('resize', () => { if (isOpen && fitted && !sel) fit(); });
  addEventListener('storage', (e) => { if (isOpen && e.key && e.key.startsWith('oneNight.lore')) refresh(); });

  function refresh() {
    try { found = getFound ? getFound() || {} : {}; } catch (err) { found = {}; }
    for (const id of Object.keys(found)) if (!BY_ID.has(id)) delete found[id];   // entries removed from lore.js
    if (sel && !isFound(sel)) sel = null;
    paint();
  }
  function open() {
    if (isOpen) return;
    isOpen = true; root.hidden = false;
    refresh(); sizeWorld();
    thread = null; query = ''; search.value = '';
    select(null);
    requestAnimationFrame(() => fit());
    if (!touch()) setTimeout(() => (ordered()[0] ? cards.get(ordered()[0].id) : header.querySelector('[data-act=close]')).focus({ preventScroll: true }), 0);
    onOpen && onOpen();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; root.hidden = true; ptrs.clear(); gesture = null;
    onClose && onClose();
  }

  build();
  sizeWorld();
  return {
    open, close, refresh,
    get isOpen() { return isOpen; },
    debug: () => ({ cam: { ...cam }, sel, thread, found: Object.keys(found).length, links: LINKS.length, known: LINKS.filter(knownLink).length, leads: ENTRIES.filter((e) => isLead(e.id)).length }),
    select: (id) => select(id),
    focusThread(t) { thread = t; highlight(); },
    resetLayout() { header.querySelector('[data-act=reset]').click(); },
  };
}
