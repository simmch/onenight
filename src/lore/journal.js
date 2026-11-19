import { ENTRIES, BY_ID, KINDS } from './lore.js';

// The journal: everything found so far, kept between nights. Unfound entries show as blanks, so the size of the
// puzzle is always visible. Opening it (J) or picking something up pauses the world.
const KEY = 'oneNight.lore.v1';
const CSS = `
#journal { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.9); font-family: "Courier New", monospace; color: #b9b3a3; }
#journal[hidden] { display: none; }
#journal .jbox { width: min(1040px, 94vw); height: min(640px, 88vh); display: flex; flex-direction: column; border: 1px solid rgba(185,179,163,.28); background: #0c0b09; }
#journal .jhead { display: flex; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid rgba(185,179,163,.2); letter-spacing: 6px; font-size: 14px; }
#journal .jhead .jcount { letter-spacing: 3px; opacity: .65; }
#journal .jbody { flex: 1; display: flex; min-height: 0; }
#journal .jlist { width: 34%; overflow-y: auto; padding: 10px 0; border-right: 1px solid rgba(185,179,163,.2); }
#journal .jsec { padding: 10px 20px 4px; font-size: 11px; letter-spacing: 4px; opacity: .5; }
#journal .jrow { padding: 4px 20px; font-size: 13px; cursor: pointer; display: flex; gap: 8px; line-height: 1.35; }
#journal .jrow:hover { background: rgba(185,179,163,.07); }
#journal .jrow.sel { background: rgba(185,179,163,.14); color: #e6dfc8; }
#journal .jrow.blank { opacity: .3; cursor: default; letter-spacing: 3px; word-break: break-all; }
#journal .jrow .dot { width: 8px; flex: none; color: #c8a25a; }
#journal .jread { flex: 1; padding: 30px 44px; overflow-y: auto; }
#journal .jrk { font-size: 11px; letter-spacing: 5px; opacity: .5; margin-bottom: 8px; }
#journal .jrt { font-size: 20px; letter-spacing: 2px; color: #e6dfc8; margin-bottom: 22px; }
#journal .jrx { white-space: pre-wrap; font-size: 15px; line-height: 1.75; max-width: 560px; color: #d3ccb2; }
#journal .jrx s { opacity: .6; text-decoration-thickness: 2px; }
#journal .jread.letter .jrx { font-style: italic; color: #dccfa6; }
#journal .jread.item .jrt { color: #cfc6a4; }
#journal .jread.item .jrx { color: #b9b3a3; }
#journal .jread.document .jrx { font-size: 14px; }
#journal .jempty { opacity: .5; font-size: 14px; line-height: 1.8; }
#journal .jfoot { padding: 10px 20px; border-top: 1px solid rgba(185,179,163,.2); font-size: 12px; letter-spacing: 3px; opacity: .55; }
`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (s) => esc(s).replace(/~~(.+?)~~/g, '<s>$1</s>');

export function createJournal({ onOpen, onClose } = {}) {
  let found = {};                                     // id -> { n: order found, read }
  try { found = JSON.parse(localStorage.getItem(KEY) || '{}').found || {}; } catch (e) { found = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ found })); } catch (e) { /* private mode: it just won't persist */ } };

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'journal'; root.hidden = true;
  root.innerHTML = `<div class="jbox"><div class="jhead"><span>JOURNAL</span><span class="jcount"></span></div>
    <div class="jbody"><div class="jlist"></div><div class="jread"></div></div>
    <div class="jfoot">J / ESC  CLOSE     UP / DOWN  BROWSE</div></div>`;
  document.body.appendChild(root);
  const list = root.querySelector('.jlist'), read = root.querySelector('.jread'), countEl = root.querySelector('.jcount');
  let sel = null, isOpen = false;
  const foundIds = () => Object.keys(found);
  const ordered = () => KINDS.flatMap((k) => ENTRIES.filter((e) => e.kind === k.id));   // list order: by kind, then as written

  function render() {
    countEl.textContent = `${foundIds().length} / ${ENTRIES.length}`;
    list.innerHTML = '';
    for (const k of KINDS) {
      const all = ENTRIES.filter((e) => e.kind === k.id), got = all.filter((e) => found[e.id]).sort((a, b) => found[a.id].n - found[b.id].n);
      const sec = document.createElement('div'); sec.className = 'jsec'; sec.textContent = `${k.label}  ${got.length}/${all.length}`; list.appendChild(sec);
      got.forEach((e) => {
        const r = document.createElement('div'); r.className = 'jrow' + (sel === e.id ? ' sel' : ''); r.dataset.id = e.id;
        r.innerHTML = `<span class="dot">${found[e.id].read ? '' : '•'}</span><span>${esc(e.title)}</span>`;
        r.onclick = () => select(e.id); list.appendChild(r);
      });
      if (got.length < all.length) { const r = document.createElement('div'); r.className = 'jrow blank'; r.innerHTML = '<span class="dot"></span><span>' + '. '.repeat(all.length - got.length).trim() + '</span>'; list.appendChild(r); }   // one dot for each still missing
    }
    const e = sel && BY_ID.get(sel);
    if (!e) { read.className = 'jread'; read.innerHTML = '<div class="jempty">' + (foundIds().length ? 'Choose something to read.' : 'Nothing yet.<br>What you find out here, you keep.') + '</div>'; return; }
    read.className = 'jread ' + e.kind;
    read.innerHTML = `<div class="jrk">${e.kind.toUpperCase()}</div><div class="jrt">${esc(e.title)}</div><div class="jrx">${fmt(e.text)}</div>`;
    read.scrollTop = 0;
    const row = list.querySelector('.jrow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
  }
  function select(id) {
    if (!found[id]) return;
    sel = id; found[id].read = true; save(); render();
  }
  function step(d) {
    const seq = ordered().filter((e) => found[e.id]); if (!seq.length) return;
    const i = Math.max(0, seq.findIndex((e) => e.id === sel));
    select(seq[(i + d + seq.length) % seq.length].id);
  }
  function open(id) {
    if (isOpen) { if (id) select(id); return; }
    isOpen = true; root.hidden = false;
    if (id && found[id]) { sel = id; found[id].read = true; save(); }
    else if (!sel || !found[sel]) { const first = ordered().find((e) => found[e.id] && !found[e.id].read) || ordered().find((e) => found[e.id]); sel = first ? first.id : null; if (sel) { found[sel].read = true; save(); } }
    render();
    onOpen && onOpen();
  }
  function close() { if (!isOpen) return; isOpen = false; root.hidden = true; onClose && onClose(); }
  function add(id) {
    if (!BY_ID.has(id) || found[id]) return false;
    found[id] = { n: foundIds().length + 1, read: false }; save(); return true;
  }
  addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.code === 'Escape' || e.code === 'KeyJ' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); step(1); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); step(-1); }
  }, true);
  render();
  return {
    open, close, add, has: (id) => !!found[id],
    toggle() { isOpen ? close() : open(); },
    get isOpen() { return isOpen; },
    get count() { return foundIds().length; },
    get total() { return ENTRIES.length; },
    get ids() { return new Set(foundIds()); },
    reset() { found = {}; sel = null; save(); render(); },
    // for the storyboard: a copy of what has been found, and a way to mark something read from there
    snapshot() { return JSON.parse(JSON.stringify(found)); },
    markRead(id) { if (found[id] && !found[id].read) { found[id].read = true; save(); render(); } },
  };
}
