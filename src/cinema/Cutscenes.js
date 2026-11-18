import * as THREE from 'three';
import { createTreadmill } from './Stage.js';

// What can happen between one round and the next. When a round is survived the night sometimes does not simply
// move on: one of these plays first, picked at random, none of them twice until all have been seen. Most stay where
// you are standing and take the camera out of your hands; the chase leaves the map for a strip of woods of its own.
// Several ask something of you (a key to press, hammer or hold, or nothing to be touched at all) and end the night
// if you do not manage it.
//
// kit: see main.js (cinemaKit). Everything the scenes use from the game comes through it.

const CSS = `
#cine { position: fixed; inset: 0; z-index: 20; pointer-events: none; font-family: "Courier New", monospace; color: #d8d2c0; }
#cine .bar { position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .45s; }
#cine .bar.top { top: 0; } #cine .bar.bot { bottom: 0; }
#cine.on .bar { height: 9vh; }
#cineTint { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, rgba(70,20,90,.15) 20%, rgba(40,6,60,.85) 100%); }
#cineWater { position: absolute; inset: 0; overflow: hidden; display: none; }
#cineWater .surface { position: absolute; left: 50%; top: -24vh; width: 96vw; height: 64vh; margin-left: -48vw; border-radius: 50%; transform-origin: 50% 20%;
  background: radial-gradient(ellipse at center, rgba(180,222,236,.8) 0%, rgba(96,158,184,.38) 38%, rgba(40,90,120,0) 70%); }
#cineWater i { position: absolute; bottom: -5vh; border-radius: 50%; border: 1px solid rgba(196,228,242,.75); background: rgba(160,205,225,.16); opacity: 0; animation: cineBubble linear infinite; }
@keyframes cineBubble { 0% { transform: translate(0, 0) scale(.6); opacity: 0; } 10% { opacity: .9; } 100% { transform: translate(var(--dx), -118vh) scale(1.3); opacity: 0; } }
#cineSkip { position: absolute; right: 22px; bottom: 2.6vh; font-size: 10px; letter-spacing: 3px; opacity: 0; transition: opacity .8s; }
#cineCap { position: absolute; left: 0; right: 0; bottom: 10.5vh; text-align: center; font-size: 15px; letter-spacing: 3px; opacity: 0; transition: opacity .5s; text-shadow: 0 0 8px #000, 0 0 2px #000; }
#cine.asking #cineCap { bottom: auto; top: 12.5vh; }
#qte { position: absolute; left: 50%; top: 71%; transform: translate(-50%, -50%); display: none; flex-direction: column; align-items: center; gap: 10px;
       background: none; border: 0; color: inherit; font: inherit; pointer-events: auto; touch-action: none; cursor: pointer; padding: 18px 26px; }
#qte.show { display: flex; }
#qte.left { left: 24%; } #qte.right { left: 76%; }
#qte .key { min-width: 64px; height: 64px; box-sizing: border-box; padding: 0 14px; display: flex; align-items: center; justify-content: center; border: 2px solid #d8d2c0; border-radius: 6px;
            background: rgba(0,0,0,.6); font-size: 26px; letter-spacing: 2px; color: #fff; animation: qtePulse .5s ease-in-out infinite alternate; }
#qte.nokey .key { display: none; }
#qte.gesture { pointer-events: none; cursor: default; }
#qte.gesture .key { font-size: 30px; }
#qte.gesture.swL .key { animation: qteL .55s ease-in infinite; } #qte.gesture.swR .key { animation: qteR .55s ease-in infinite; } #qte.gesture.swU .key { animation: qteU .55s ease-in infinite; }
@keyframes qteL { from { transform: translateX(26px); opacity: .3; } to { transform: translateX(-26px); opacity: 1; } }
@keyframes qteR { from { transform: translateX(-26px); opacity: .3; } to { transform: translateX(26px); opacity: 1; } }
@keyframes qteU { from { transform: translateY(22px); opacity: .3; } to { transform: translateY(-22px); opacity: 1; } }
#qte .what { font-size: 15px; letter-spacing: 5px; text-shadow: 0 0 8px #000, 0 0 2px #000; }
#qte .sub { font-size: 11px; letter-spacing: 2px; opacity: .75; min-height: 1em; text-shadow: 0 0 6px #000; }
#qte .meter { width: 190px; height: 6px; border: 1px solid rgba(216,210,192,.6); background: rgba(0,0,0,.6); }
#qte .meter i { display: block; height: 100%; background: #d8d2c0; transform-origin: left center; transform: scaleX(0); }
#qte.urgent .meter i { background: #c0564a; }
#qte.ok .key, #qte.ok .meter { border-color: #9fc79a; } #qte.ok .meter i { background: #9fc79a; }
#qte.bad .key, #qte.bad .meter { border-color: #c0564a; } #qte.bad .key { color: #c0564a; animation: none; }
@keyframes qtePulse { from { transform: scale(1); } to { transform: scale(1.12); } }
body.cine #hud, body.cine #status, body.cine #ammo, body.cine #inventoryPanel, body.cine #reticle, body.cine #prompt, body.cine #toast,
body.cine #banner, body.cine #touch, body.cine #sanityVision, body.cine #collectiveMark { visibility: hidden; }
`;
const KEY_NAME = { KeyA: 'A', KeyD: 'D', KeyE: 'E', KeyF: 'F', Space: 'SPACE' };
const QTE_KEYS = new Set(Object.keys(KEY_NAME));
const TAU = Math.PI * 2;
const ease = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;

export function createCutscenes(kit) {
  const A = kit.audio, cam = kit.camera, v3 = new THREE.Vector3();
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const root = document.createElement('div'); root.id = 'cine';
  root.innerHTML = '<div id="cineTint"></div><div id="cineWater"><div class="surface"></div><div class="bubbles"></div></div><div class="bar top"></div><div class="bar bot"></div><div id="cineCap"></div><div id="cineSkip"></div>' +
    '<button id="qte" type="button" tabindex="-1"><span class="key"></span><span class="what"></span><span class="meter"><i></i></span><span class="sub"></span></button>';
  document.body.append(root);
  const $ = (q) => root.querySelector(q);
  const waterEl = $('#cineWater'), surfaceEl = $('#cineWater .surface'), bubblesEl = $('#cineWater .bubbles');
  const skipEl = $('#cineSkip'); skipEl.textContent = kit.TOUCH ? 'TAP TO MOVE ON' : 'ANY KEY TO MOVE ON';
  const tintEl = $('#cineTint'), capEl = $('#cineCap'), qteEl = $('#qte'), keyEl = $('#qte .key'), whatEl = $('#qte .what'), subEl = $('#qte .sub'), fillEl = $('#qte .meter i');

  // ── the cast, built once so nothing has to be made in the middle of a fright ──
  const obs = { model: kit.createObserverModel(), a: 0, d: 0 };
  obs.model.root.visible = false; kit.scene.add(obs.model.root);
  obs.anim = new kit.ObserverAnimator(obs.model);
  const kids = Array.from({ length: 5 }, () => { const c = kit.buildChild(kit.kidMats, Math.random); c.root.visible = false; kit.scene.add(c.root); return c; });
  const glow = new THREE.PointLight(0xffb060, 0, 10, 1.6); kit.scene.add(glow);       // a match, or eyes used to the dark
  let stage = null, runCam = null, runSpot = null;                                       // the woods the chase runs through, made the first time

  // ── quick time events: one at a time ──
  // press: the key, once, before the time is up (a different action key is a miss). mash: hammer it until the bar is full.
  // hold: get it down within the grace and keep it down. still: touch nothing at all.
  let Q = null, qHide = 0;
  function ask(spec) {
    down.clear();
    Q = { type: 'press', time: 1.2, need: 12, decay: 1.2, grace: 1.3, side: 0, sub: '', ...spec, t: 0, n: 0, held: false, moved: 0, state: 'live' };
    // On a phone nothing is a button: a prompt names a gesture, made anywhere on the screen.
    // press: swipe the way the arrow points (A left, D right, Space up). mash: tap fast. hold: press and keep pressing.
    const swipe = Q.key === 'KeyA' ? ['←', 'Swipe left', ' swL'] : Q.key === 'KeyD' ? ['→', 'Swipe right', ' swR'] : ['↑', 'Swipe up', ' swU'];
    const touchKey = Q.type === 'press' ? swipe[0] : Q.type === 'mash' ? 'TAP' : 'HOLD';
    const touchSub = Q.type === 'press' ? swipe[1] : Q.type === 'mash' ? 'Tap fast, anywhere' : Q.type === 'hold' ? 'Press anywhere and keep pressing' : 'Lift every finger off the screen';
    keyEl.textContent = kit.TOUCH ? touchKey : KEY_NAME[Q.key] || '';
    whatEl.textContent = Q.text; subEl.textContent = kit.TOUCH ? touchSub : Q.sub;
    qteEl.className = 'show' + (Q.side < 0 ? ' left' : Q.side > 0 ? ' right' : '') + (Q.type === 'still' ? ' nokey' : '') + (kit.TOUCH ? ' gesture' + (Q.type === 'press' ? swipe[2] : '') : '');
    fillEl.style.transform = 'scaleX(' + (Q.type === 'press' ? 1 : 0) + ')';
    qHide = 0; root.classList.add('asking');             // the line of text moves up out of the prompt's way
    return Q;
  }
  function settle(ok) { if (!Q || Q.state !== 'live') return; Q.state = ok ? 'ok' : 'fail'; qteEl.classList.add(ok ? 'ok' : 'bad'); qteEl.classList.remove('urgent'); qHide = 0.3; }
  function qDown(code) {
    if (!Q || Q.state !== 'live') return;
    if (Q.type === 'still') { settle(false); return; }
    if (code !== Q.key) { if (Q.type === 'press' && QTE_KEYS.has(code)) settle(false); return; }
    if (Q.type === 'press') settle(true);
    else if (Q.type === 'mash') { Q.n += 1; A.sfx.click(); if (Q.n >= Q.need) settle(true); }
    else if (Q.type === 'hold') Q.held = true;
  }
  function qUp(code) { if (Q && Q.state === 'live' && Q.type === 'hold' && code === Q.key && Q.held) settle(false); }
  function tickQ(dt) {
    if (qHide > 0 && (qHide -= dt) <= 0) { qteEl.className = ''; root.classList.remove('asking'); }
    if (!Q || Q.state !== 'live') return;
    Q.t += dt;
    let fill = 0;
    if (Q.type === 'press') { fill = 1 - Q.t / Q.time; if (Q.t >= Q.time) settle(false); }
    else if (Q.type === 'mash') { Q.n = Math.max(0, Q.n - Q.decay * dt); fill = Q.n / Q.need; if (Q.t >= Q.time) settle(false); }
    else if (Q.type === 'hold') {
      if (!Q.held) { if (Q.t >= Q.grace) settle(false); }
      else { Q.n += dt; fill = Q.n / Q.time; if (Q.n >= Q.time) settle(true); }
    } else { fill = Q.t / Q.time; if (Q.t >= Q.time) settle(true); }
    Q.fill = Math.max(0, Math.min(1, fill));
    fillEl.style.transform = 'scaleX(' + Q.fill + ')';
    qteEl.classList.toggle('urgent', Q.type === 'press' ? fill < 0.4 : Q.type === 'mash' && Q.t > Q.time * 0.65);
  }
  const live = () => cur && kit.playing();
  addEventListener('keydown', (e) => {
    if (!cur || e.code === 'Escape') return;
    e.stopImmediatePropagation(); if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (S.death) { if (!e.repeat && S.clock > 1.2) skipDeath(); return; }
    if (!e.repeat && live()) qDown(e.code);
  }, true);
  addEventListener('keyup', (e) => { if (!cur || e.code === 'Escape') return; e.stopImmediatePropagation(); if (live()) qUp(e.code); }, true);
  addEventListener('mousemove', (e) => { if (live() && Q && Q.state === 'live' && Q.type === 'still' && (Q.moved += Math.abs(e.movementX) + Math.abs(e.movementY)) > 90) settle(false); }, true);
  let finger = null;                                      // the touch a gesture is being read from
  const down = new Set();                                 // every finger on the glass: a hold lasts until the last one lifts
  addEventListener('pointerdown', (e) => {
    if (cur && S.death) { if (S.clock > 1.2) skipDeath(); return; }
    if (!live() || !Q || Q.state !== 'live') return;
    if (Q.type === 'still') { settle(false); return; }
    if (kit.TOUCH) {
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false }; down.add(e.pointerId);
      if (Q.type === 'mash' || Q.type === 'hold') qDown(Q.key);          // a tap anywhere; a press anywhere
    } else if (e.target.closest && e.target.closest('#qte')) { e.preventDefault(); qDown(Q.key); }
  }, true);
  addEventListener('pointermove', (e) => {
    if (!finger || e.pointerId !== finger.id || finger.used || !live() || !Q || Q.state !== 'live' || Q.type !== 'press') return;
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
    if (Math.hypot(dx, dy) < 44) return;
    finger.used = true;                                   // one swipe, one answer: the wrong way is a miss, as the wrong key is
    if (Math.abs(dx) > Math.abs(dy)) qDown(dx < 0 ? 'KeyA' : 'KeyD'); else if (dy < 0) qDown('Space');
  }, true);
  const lift = (e) => { if (finger && e.pointerId === finger.id) finger = null; down.delete(e.pointerId); if (live() && Q && (!kit.TOUCH || down.size === 0)) qUp(Q.key); };
  addEventListener('pointerup', lift, true);
  addEventListener('pointercancel', lift, true);

  // ── the scene in play ──
  let cur = null, S = null, capT = 0;
  const fired = new Set();
  function fade(to, secs) { kit.fade.style.transition = secs > 0 ? `opacity ${secs}s linear` : ''; kit.fade.style.opacity = String(to); }
  function caption(text, secs = 3) { capEl.textContent = text; capEl.style.opacity = text ? '1' : '0'; capT = secs; }
  const at = (time) => { if (S.t >= time && !fired.has(time)) { fired.add(time); return true; } return false; };
  const phase = (name) => { S.ph = name; S.t = 0; fired.clear(); };
  const spotAt = (a, d) => [S.px - Math.sin(a) * d, S.pz - Math.cos(a) * d];
  const dist = (want, min = 1) => Math.max(min, Math.min(want, S.room - 0.4));
  function stand(obj, a, d) { const [x, z] = spotAt(a, d); obj.position.set(x, kit.groundY(x, z), z); obj.rotation.y = a; obj.visible = true; }
  function obsAt(a, d) { obs.a = a; obs.d = d; stand(obs.model.root, a, d); }
  function obsTick(state, speed = 0, eyes = 0.7, dt = S.dt) {
    obs.anim.setState(state); obs.anim.update(dt, { speed, lookYaw: 0, lookPitch: 0 });
    obs.model.sizeEyes(obs.d, kit.radPerPixel()); obs.model.mats.setEyeGlow(eyes);
  }
  // how far the head has to tip to look it in the face
  function facePitch() {
    obs.model.root.updateMatrixWorld(true);
    const h = obs.model.j.Head.getWorldPosition(v3), ex = S.px + S.cam.x, ez = S.pz + S.cam.z;
    return Math.max(-0.8, Math.min(0.8, Math.atan2(h.y - (S.gy + kit.eye + S.cam.y), Math.max(0.3, Math.hypot(h.x - ex, h.z - ez)))));
  }
  // Its face, d metres from yours, dead ahead, whatever the rest of it is doing. It is tall and it leans, so the
  // body is moved to wherever puts the head there. Call every frame while it looms.
  function loom(state = 'attack', d = 0.62) {
    const r = obs.model.root, a = S.yaw0 + S.cam.yaw;
    if (!r.visible) { obs.a = a; stand(r, a, d + 0.8); }
    r.rotation.y = a; obs.d = d;
    obsTick(state, 0, 1);
    r.updateMatrixWorld(true);
    const h = obs.model.j.Head.getWorldPosition(v3);
    r.position.x += S.px + S.cam.x - Math.sin(a) * d - h.x; r.position.z += S.pz + S.cam.z - Math.cos(a) * d - h.z;
    S.cam.pitch = Math.max(-0.8, Math.min(0.8, Math.atan2(h.y - (S.gy + kit.eye + S.cam.y), d)));
    S.beam = Math.min(S.beam, 0.42);                      // this close a full beam is only white
  }
  function corpse(kind, a, d, extra = {}) {
    const c = kit.buildCorpse(Math.random), [x, z] = spotAt(a, d);
    kit.poseCorpse(c, { kind, x, z, y: kit.groundY(x, z), facing: a, ...extra }, Math.random);
    kit.scene.add(c.root); S.bodies.push(c); return c;
  }
  const beamStutter = (t) => (Math.sin(t * 46) > 0.2 ? 1 : 0.05);
  // the farthest you can see along level ground from here, and which way that is (so there is room to put things)
  function findRoom(keepFacing = false) {
    let best = S.yaw0, room = 0, score = -1;
    for (let k = 0; k < 24; k++) {
      const a = S.yaw0 + (k / 24) * TAU; let d = 0.5;
      for (; d <= 12; d += 0.5) { const [x, z] = spotAt(a, d); if (!kit.world.walkable(x, z, 0.45)) break; }
      const turn = Math.abs(Math.atan2(Math.sin(a - S.yaw0), Math.cos(a - S.yaw0)));
      const s = Math.min(d, 9) - turn * 0.6;
      if (s > score) { score = s; best = a; room = d - 0.5; }
      if (keepFacing) break;                               // k = 0 is the way you are facing
    }
    S.yaw0 = best; S.room = Math.max(1.4, room);
  }

  function begin() {
    findRoom();
    Object.assign(S.cam, { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 });
    S.beam = 1; S.torch = true;
    phase('go');
    S.zone = kit.clearGround(S.px, S.pz, 6.5);            // no tall grass between you and what you are about to be shown
    if (cur.start) cur.start(S);
    fade(0, 0.5);
  }
  function cleanup() {
    obs.model.root.visible = false; if (obs.model.root.parent !== kit.scene) kit.scene.add(obs.model.root);
    obs.model.root.position.y = 0;
    for (const k of kids) { k.root.visible = false; k.root.rotation.x = 0; }
    for (const c of S.bodies) { c.root.removeFromParent(); c.root.traverse((o) => { if (o.material) o.material.dispose(); }); }
    for (const h of S.loops) A.stop(h, 0.3);
    glow.intensity = 0; glow.distance = 10; tintEl.style.opacity = '0'; tintEl.style.background = ''; caption(''); kit.hurt(0);
    skipEl.style.opacity = '0'; kit.fade.style.background = '';
    waterEl.style.display = 'none'; bubblesEl.replaceChildren();
    if (S.death) { kit.flames([]); if (S.dawned) kit.dawn(0); }
    if (S.zone) S.zone();
    Q = null; qteEl.className = ''; root.classList.remove('on', 'asking'); document.body.classList.remove('cine');
    if (stage) stage.clearExtras();
    kit.setView(S.yaw0 + S.cam.yaw, 0);
    kit.lock(false);
    const done = S.done; cur = null; S = null;
    return done;
  }
  const finish = () => { if (S.ph !== 'out' && S.ph !== 'dead') { phase('out'); fade(1, 0.4); } };
  function kill(line, voice = true) {
    if (S.ph === 'dead' || S.ph === 'out') return;
    phase('dead'); S.line = line; S.shake = 1.2;
    if (voice) A.obs.shriek();
    kit.hurt(1); fade(1, 0.14);
  }

  function update(dt) {
    if (!cur) return;
    S.dt = dt; S.t += dt; S.clock += dt;
    tickQ(dt);
    if (capT > 0 && (capT -= dt) <= 0) capEl.style.opacity = '0';
    S.shake = Math.max(0, S.shake - dt * 1.8);
    if (S.ph === 'in') { if (S.t >= 0.5) begin(); }
    else if (S.ph === 'out') { if (S.t >= 0.55) { const done = cleanup(); fade(0, 0.7); done(); return; } }
    else if (S.ph === 'dead') { if (S.t >= 1.5) { const line = S.line, from = S.name; cleanup(); fade(0, 0); kit.die(line, from); return; } }
    else if (S.ph === 'gone') { if (S.t >= 0.75) { const done = cleanup(); kit.lids(0); done(); return; } }       // a death is over: black, and the screen that says so
    else cur.run(S);
    if (!S || S.stage) return;
    // the camera stays where you stood; the scene turns your head for you
    const c = S.cam, k = S.shake, w = S.clock;
    cam.position.set(S.px + c.x, S.gy + kit.eye + c.y + Math.sin(w * 47) * 0.03 * k, S.pz + c.z);
    const tilt = S.death ? S.pitch0 * (1 - ease(0, 0.5, w)) : 0;      // dying starts from wherever you were looking
    if (S.death) skipEl.style.opacity = w > 1.6 && S.ph !== 'gone' ? '0.45' : '0';
    cam.rotation.set(c.pitch + tilt + Math.sin(w * 31) * 0.035 * k, S.yaw0 + c.yaw + Math.sin(w * 37) * 0.04 * k, c.roll + Math.sin(w * 29) * 0.03 * k);
    const flick = 0.94 + 0.06 * Math.sin(w * 23) * Math.sin(w * 7.3);
    kit.beam(S.beam * flick, S.torch);
  }
  function render() {
    root.style.visibility = kit.playing() || (S && S.death) ? '' : 'hidden';          // paused: the pause screen has the page to itself
    if (S && S.stage) kit.render(stage.scene, runCam, false); else kit.render(kit.scene, cam, kit.handsShown());
  }

  // ═════════════════════════ the scenes ═════════════════════════
  const SCENES = {
    // 1. Nothing behind you. (no input: a plain fright)
    behind: {
      run() {
        if (S.ph === 'go') {
          if (at(0.6)) A.obs.creak(Math.PI, 5);
          S.beam = S.t > 0.9 && S.t < 1.5 ? beamStutter(S.t) : 1;
          S.cam.yaw = Math.PI * ease(1.6, 3.6, S.t);                        // a slow turn, to see what that was
          if (at(4.3)) A.obs.exhale(Math.PI, 1.5);
          if (S.t >= 4.9) { phase('snap'); A.obs.screech(0, 1); S.shake = 1.4; kit.hurt(0.5); }
        } else if (S.ph === 'snap') {
          S.cam.yaw = Math.PI * (1 - ease(0, 0.14, S.t));
          if (S.t < 1.0) { const yaw = S.cam.yaw; S.cam.yaw = 0; loom(); S.cam.yaw = yaw; }      // it is where you were looking a moment ago
          if (at(0.7)) { fade(1, 0); S.beam = 0; }
          if (at(1.0)) { obs.model.root.visible = false; kit.hurt(0); S.cam.pitch = 0; }
          if (at(2.4)) { fade(0, 1.2); S.beam = 1; A.sfx.click(); }
          if (at(3.2)) caption('There is nothing there.', 2.2);
          if (S.t >= 5.2) finish();
        }
      },
    },

    // 2. Something has your ankle. Hammer E to kick free.
    grab: {
      qte: true,
      start() { S.body = corpse('ground', S.yaw0, 1.15); S.body.root.rotation.y = S.yaw0 + Math.PI; S.body.root.visible = false; },
      run() {
        if (S.ph === 'go') {
          if (at(0.9)) { A.thump(120, 38, 0.5, 1); S.shake = 1.3; kit.hurt(0.6); S.body.root.visible = true; A.play(A.clips.bones, 0.8); }
          const drop = ease(0.9, 1.4, S.t);
          S.beam = 1 - 0.6 * drop;
          S.cam.y = -0.75 * drop; S.cam.pitch = -1.05 * drop;
          if (at(1.5)) { caption('Something has your ankle.', 2.5); S.q = ask({ type: 'mash', key: 'KeyE', text: 'KICK FREE', need: 14, decay: 1.3, time: 6 }); phase('pull'); }
        } else if (S.ph === 'pull') {
          const q = S.q, lose = q.t / q.time;
          S.cam.y = -0.75 - lose * 0.55 + (q.fill || 0) * 0.5; S.cam.pitch = -1.05 - lose * 0.2;
          S.cam.z = -Math.cos(S.yaw0) * lose * 0.6; S.cam.x = -Math.sin(S.yaw0) * lose * 0.6;       // dragged toward it
          S.shake = Math.max(S.shake, 0.35 + lose * 0.5); kit.hurt(0.25 + lose * 0.5);
          if (q.state === 'ok') { phase('free'); A.thump(200, 60, 0.2, 0.9); S.shake = 1; S.from = { y: S.cam.y, p: S.cam.pitch, x: S.cam.x, z: S.cam.z }; }
          else if (q.state === 'fail') kill('It pulled you under.');
        } else if (S.ph === 'free') {
          const k = ease(0.1, 1.1, S.t), back = ease(0.2, 1.4, S.t) * 1.3;
          S.cam.y = lerp(S.from.y, 0, k); S.cam.pitch = lerp(S.from.p, -0.35, k);
          S.cam.x = lerp(S.from.x, Math.sin(S.yaw0) * back, k); S.cam.z = lerp(S.from.z, Math.cos(S.yaw0) * back, k);   // backing off
          kit.hurt(0.4 * (1 - k)); S.beam = 0.4 + 0.6 * k;
          if (at(1.3)) caption('It lies still again.', 2);
          if (S.t >= 3.2) finish();
        }
      },
    },

    // 3. You are running. Jump, left, right: whatever is behind you does not slow down.
    chase: {
      qte: true,
      start() {
        if (!stage) {
          stage = createTreadmill(kit, { seed: 0xc4a5e });
          runCam = new THREE.PerspectiveCamera(70, 1, 0.05, 120); runCam.rotation.order = 'YXZ';
          runSpot = new THREE.SpotLight(0xffd49c, 0, kit.L.distance, kit.L.angle, kit.L.penumbra, kit.L.decay);
          runSpot.position.set(0.22, -0.18, 0); runSpot.target.position.set(0, -0.35, -10);
          runCam.add(runSpot, runSpot.target); stage.scene.add(runCam);
        }
        runCam.aspect = cam.aspect; runCam.updateProjectionMatrix();
        stage.clearExtras(); stage.scene.add(obs.model.root);
        S.stage = true; S.gait = 0; S.lane = 0; S.hop = -1; S.gap = 9; S.miss = 0; S.n = 0; S.next = 2.4; S.speed = 6.2; S.glance = -1; S.ob = null;
        S.loops.push(A.play(A.clips.run, 0.85, true));
        A.obs.screech(Math.PI, 6);
        caption('Run.', 1.8);
      },
      run() {
        const dt = S.dt;
        S.speed += (6.2 - S.speed) * Math.min(1, dt * 1.5);
        stage.scroll(S.speed * dt); S.gait += dt * S.speed * 2.3;
        S.gap = Math.min(9, S.gap - dt * 0.2);
        let yaw = 0;
        if (S.ph === 'go') {
          if (!S.ob && S.t >= S.next && S.n < 6) {             // something in the way
            const kind = ['jump', 'left', 'right'][(Math.random() * 3) | 0], lead = 1.3 - S.n * 0.07, z = -S.speed * lead;
            if (kind === 'jump') stage.put(['log', 'stump'], 0, z, 3.0, 1.1);
            else stage.put(['dead', 'fir'], kind === 'left' ? 0.8 : -0.8, z, 4.2, 6);
            S.ob = { kind, q: ask({ type: 'press', time: lead, key: kind === 'jump' ? 'Space' : kind === 'left' ? 'KeyA' : 'KeyD', text: kind === 'jump' ? 'JUMP' : kind === 'left' ? 'LEFT' : 'RIGHT', side: kind === 'left' ? -1 : kind === 'right' ? 1 : 0 }) };
          }
          if (S.ob && S.ob.q.state !== 'live') {
            if (S.ob.q.state === 'ok') { if (S.ob.kind === 'jump') S.hop = 0; else S.dodge = { to: S.ob.kind === 'left' ? -1.5 : 1.5, t: 0 }; S.gap += 0.5; }
            else { S.miss++; S.gap -= 3.3; S.speed = 2.6; S.shake = 1.3; kit.hurt(0.8); A.sfx.hurt(); A.thump(150, 45, 0.3, 0.9); }
            S.n++; S.next = S.t + 1.25 + Math.random() * 0.5; S.ob = null;
            if (S.n === 2 || S.n === 4) S.glance = 0;
            if (S.miss >= 2) { phase('caught'); A.obs.screech(Math.PI, 2); }
            else if (S.n >= 6) phase('clear');
          }
          if (S.glance >= 0) {                                  // a look over the shoulder: it is closer than you hoped
            S.glance += dt; yaw = Math.PI * 0.92 * ease(0, 0.22, S.glance) * (1 - ease(0.7, 0.95, S.glance));
            if (S.glance > 1) S.glance = -1;
          }
        } else if (S.ph === 'caught') {
          yaw = Math.PI * ease(0, 0.2, S.t); S.gap = lerp(S.gap, 0.9, Math.min(1, dt * 9));
          if (S.t >= 0.55) { S.stageDead = true; kill('It ran you down.'); }
        } else if (S.ph === 'clear') {
          if (at(0.5)) caption('The trees thin out. It lets you go.', 2.4);
          S.gap += dt * 2.5;
          if (S.t >= 1.8) finish();
        }
        if (S.hop >= 0) { S.hop += dt / 0.55; if (S.hop >= 1) S.hop = -1; }
        if (S.dodge) { S.dodge.t += dt; S.lane = S.dodge.to * ease(0, 0.2, S.dodge.t) * (1 - ease(0.55, 0.9, S.dodge.t)); if (S.dodge.t > 0.9) { S.dodge = null; S.lane = 0; } }
        const k = S.shake, w = S.clock, bob = Math.abs(Math.sin(S.gait)) * 0.075, hop = S.hop >= 0 ? Math.sin(S.hop * Math.PI) * 0.75 : 0;
        runCam.position.set(S.lane, 1.66 + bob + hop + Math.sin(w * 47) * 0.03 * k, 0);
        runCam.rotation.set(-0.04 + Math.sin(w * 31) * 0.05 * k - hop * 0.12, yaw + Math.cos(S.gait) * 0.02 + Math.sin(w * 37) * 0.05 * k, Math.sin(S.gait) * 0.035 + S.lane * -0.03);
        runSpot.intensity = kit.L.intensity * (0.94 + 0.06 * Math.sin(w * 23));
        runSpot.target.position.set(Math.cos(S.gait) * 0.8, -0.35 + Math.sin(S.gait + 1.2) * 1.3, -10);
        obs.d = Math.max(0.9, S.gap); obs.model.root.visible = true;
        obs.model.root.position.set(S.ph === 'caught' ? S.lane : 0, 0, obs.d); obs.model.root.rotation.y = Math.PI;
        obsTick(S.ph === 'caught' ? 'attack' : 'hunt', 6.2, 0.9);
        if (S.ph === 'caught') {                                // its face, not its chest
          obs.model.root.updateMatrixWorld(true);
          const h = obs.model.j.Head.getWorldPosition(v3);
          obs.model.root.position.z += 0.65 - h.z;
          runCam.rotation.x = Math.atan2(h.y - runCam.position.y, 0.65) * ease(0, 0.2, S.t);
        }
      },
    },

    // 4. It comes back. Light off, breath held, until it has gone past.
    breath: {
      qte: true,
      start() { S.walk = dist(7, 2.5); obsAt(S.yaw0 + 0.5, S.walk); obs.model.root.visible = false; },
      run() {
        if (S.ph === 'go') {
          if (at(0.5)) { caption('It is coming back. Put out the light.', 2.6); A.obs.step(0.4, 9, 1, 1); }
          if (at(1.7)) { S.beam = 0; S.torch = false; A.sfx.click(); }
          if (S.t >= 2.3) { S.q = ask({ type: 'hold', key: 'Space', text: 'HOLD YOUR BREATH', sub: 'Do not let go', time: 7.5, grace: 1.5 }); phase('hide'); obs.model.root.visible = true; }
        } else if (S.ph === 'hide') {
          const q = S.q, k = q.n / q.time;                      // it walks up to your face, waits, and walks on
          const near = Math.min(1.45, S.walk), d = k < 0.45 ? lerp(S.walk, near, ease(0, 0.45, k)) : k < 0.72 ? near : lerp(near, S.walk, ease(0.72, 1, k));
          const a = S.yaw0 + (k < 0.45 ? lerp(0.5, 0, ease(0, 0.45, k)) : k < 0.72 ? 0 : lerp(0, -0.9, ease(0.72, 1, k)));
          const moving = k < 0.45 || k > 0.72;
          obsAt(a, d); if (k > 0.72) obs.model.root.rotation.y = a + Math.PI * ease(0.72, 0.8, k);
          obsTick(moving ? 'stalk' : 'idle', moving ? 1.1 : 0, 0.95);
          glow.color.set(0x7088b0); glow.distance = 10; glow.position.copy(cam.position); glow.intensity = 0.55;
          A.obs.breath(S.dt, 0, d, 1, 12);
          if ((S.stepIn = (S.stepIn || 0) - S.dt) <= 0 && moving && q.held) { S.stepIn = 0.62; A.obs.step(0, d, 0.9, 1); }
          S.cam.pitch = lerp(S.cam.pitch, k > 0.4 && k < 0.75 ? facePitch() : 0, Math.min(1, S.dt * 3));
          if (q.state === 'ok') { phase('gone'); obs.model.root.visible = false; A.obs.stop(); }
          else if (q.state === 'fail') { loom(); A.obs.stop(); A.obs.screech(0, 1); kill('It heard you breathe.', false); }
        } else if (S.ph === 'gone') {
          glow.intensity = 0.55 * (1 - ease(0, 0.8, S.t)); S.cam.pitch = lerp(S.cam.pitch, 0, Math.min(1, S.dt * 3));
          if (at(0.4)) A.obs.exhale(0, 1);
          if (at(1.3)) { S.beam = 1; S.torch = true; A.sfx.click(); caption('It did not hear you.', 2); }
          if (S.t >= 3.2) finish();
        }
      },
    },

    // 5. The children. Touch nothing. Not a key, not the mouse.
    still: {
      qte: true,
      start() { S.ring = dist(2.5, 1.6); },
      run() {
        const pose = (state) => kids.forEach((c, i) => kit.poseChild(c, state, i * 1.7, S.clock));
        if (S.ph === 'go') {
          S.beam = S.t > 0.8 && S.t < 1.3 ? beamStutter(S.t) * 0.6 : 1;
          if (at(1.05)) kids.forEach((c, i) => stand(c.root, S.yaw0 + (i - 2) * 0.21, S.ring + Math.abs(i - 2) * 0.2));
          if (at(1.4)) A.play(A.clips.stopMoving, 1);
          if (S.t >= 1.05) { pose('watch'); S.beam = Math.min(S.beam, 0.6); S.cam.pitch = lerp(S.cam.pitch, -0.2, Math.min(1, S.dt * 2)); }
          if (S.t >= 2.6) { S.q = ask({ type: 'still', text: "DON'T MOVE", sub: 'Touch nothing. Not even the mouse', time: 5.5 }); phase('wait'); }
        } else if (S.ph === 'wait') {
          const q = S.q;
          if (at(2.6)) { stand(kids[2].root, S.yaw0, 1.05); A.thump(90, 40, 0.35, 1); S.shake = 0.5; }       // one of them is suddenly much closer
          S.beam = S.t > 2.5 && S.t < 2.62 ? 0.05 : S.t > 2.62 ? 0.4 : 0.6;
          pose(S.t > 2.6 ? 'still' : 'watch');
          if (S.t > 2.6) S.cam.pitch = lerp(S.cam.pitch, -0.52, Math.min(1, S.dt * 7));          // it is right under your chin
          if (q.state === 'ok') { phase('gone'); }
          else if (q.state === 'fail') { kids.forEach((c, i) => stand(c.root, S.yaw0 + (i - 2) * 0.45, 0.8)); pose('lunge'); S.cam.pitch = -0.5; A.play(A.clips.hug, 1); kill('You moved. They all saw.', false); }
        } else if (S.ph === 'gone') {
          S.beam = S.t < 0.5 ? beamStutter(S.t) * 0.5 : 1;
          if (at(0.3)) for (const c of kids) c.root.visible = false;
          S.cam.pitch = lerp(S.cam.pitch, 0, Math.min(1, S.dt * 2));
          if (at(0.8)) A.play(A.clips.thank, 0.9);
          if (S.t >= 3) finish();
        }
      },
    },

    // 6. Your mind is going. Look away from each thing it shows you, then breathe.
    mind: {
      qte: true,
      start() { S.k = 0; S.pull = 0; S.haze = 0; caption('None of this is here.', 2.5); },
      run() {
        S.haze = lerp(S.haze, S.ph === 'calm' ? 0 : 0.85, Math.min(1, S.dt * 1.5));
        S.beam = S.ph === 'calm' ? 1 : 0.5;
        tintEl.style.opacity = String(S.ph === 'breathe' ? S.haze * (1 - (S.q.fill || 0)) : S.haze);
        S.cam.roll = Math.sin(S.clock * 1.3) * 0.06 * S.haze; S.cam.pitch = Math.sin(S.clock * 0.9) * 0.04 * S.haze;
        if (S.ph === 'go') {
          S.cam.yaw = lerp(S.cam.yaw, 0, Math.min(1, S.dt * 2.5));
          if (S.t >= (S.k ? 1.0 : 1.8)) {
            const side = Math.random() < 0.5 ? 1 : -1, a = S.yaw0 + side * 1.1, d = dist(1.7, 1.1), what = S.k % 3;       // +1: on your left
            if (what === 0) S.app = corpse('hang', a, d, { anchorY: 3.6 }).root;
            else if (what === 1) { stand(kids[0].root, a, d); kit.poseChild(kids[0], 'watch', 0, S.clock); S.app = kids[0].root; }
            else { obsAt(a, d); obsTick('idle', 0, 0.9, 0.3); S.app = obs.model.root; }
            A.obs.sting(); S.side = side; S.shake = 0.4;
            S.q = ask({ type: 'press', key: side > 0 ? 'KeyD' : 'KeyA', text: 'LOOK AWAY', side, time: 1.7 - S.k * 0.18 });
            phase('see');
          }
        } else if (S.ph === 'see') {
          S.cam.yaw = lerp(S.cam.yaw, S.side * 0.85, Math.min(1, S.dt * 5));        // it draws the eye
          if (S.q.state === 'ok') {
            S.app.visible = false; A.obs.whisper(S.side * 1.2, 2); S.cam.yaw = -S.side * 0.5; S.k++;
            phase(S.k >= 4 ? 'breathe' : 'go');
            if (S.ph === 'breathe') { caption('Breathe.', 2); S.q = ask({ type: 'hold', key: 'Space', text: 'BREATHE', sub: 'Hold it. Let it pass', time: 3.2, grace: 2 }); }
          } else if (S.q.state === 'fail') {
            S.app.visible = false; obs.model.root.visible = false; loom(); A.obs.screech(0, 1);
            kill('Your mind did not come back.', false);
          }
        } else if (S.ph === 'breathe') {
          S.cam.yaw = lerp(S.cam.yaw, 0, Math.min(1, S.dt * 2));
          if (S.q.state === 'ok') { phase('calm'); kit.clearMind(); A.obs.exhale(0, 1); caption('It passes. Your head is clear.', 2.4); }
          else if (S.q.state === 'fail') { obs.model.root.visible = false; loom(); A.obs.screech(0, 1); kill('Your mind did not come back.', false); }
        } else if (S.ph === 'calm') { if (S.t >= 2.6) finish(); }
      },
    },

    // 7. The light dies. Three matches. (no input)
    match: {
      start() {
        S.ringA = dist(4.6, 2.2); S.ringB = dist(2.3, 1.4);
        S.hung = Array.from({ length: 6 }, (_, i) => corpse('hang', S.yaw0 + (i - 2.5) * 0.52, S.ringA + (i % 2) * 0.5, { anchorY: 3.7 }));
      },
      run() {
        const t = S.t, lit = (a, b) => (t >= a && t < b ? Math.min(1, (b - t) / 0.25) * (0.8 + 0.2 * Math.sin(t * 31) * Math.sin(t * 13)) : 0);
        S.beam = t < 0.6 ? 1 : t < 1.2 ? beamStutter(t) * (1 - (t - 0.6) / 0.6) : t > 9.4 ? 1 : 0;
        S.torch = S.beam > 0;
        if (at(1.2)) { A.sfx.click(); caption('Not the battery. Not now.', 1.8); }
        for (const s of [2.4, 4.7, 6.6]) if (at(s)) { A.sfx.strike(); S.loops.push(A.play(A.clips.candle, 0.5)); }
        if (at(4.3)) S.hung.forEach((c, i) => { const [x, z] = spotAt(S.yaw0 + (i - 2.5) * 0.42, S.ringB + (i % 2) * 0.3); c.root.position.set(x, kit.groundY(x, z), z); });
        if (at(6.2)) for (const c of S.hung) c.root.visible = false;
        if (at(7.7)) { A.obs.screech(0, 1); S.shake = 1.4; kit.hurt(0.5); }
        if (at(8.25)) { obs.model.root.visible = false; kit.hurt(0); }
        if (t >= 7.7 && t < 8.25) loom();
        if (at(9.4)) { A.sfx.click(); S.cam.pitch = 0; caption('You are alone. You think.', 2.2); }
        glow.color.set(0xffb060); glow.position.copy(cam.position); glow.position.y -= 0.25;
        glow.distance = 15; glow.intensity = 14 * lit(2.4, 3.9) + 7 * (lit(4.7, 5.8) + lit(6.6, 8.2));
        if (t >= 11.6) finish();
      },
    },

    // 8. The flashlight is failing and something is walking up the beam. Hammer F to keep it alight.
    flicker: {
      qte: true,
      start() { S.far = dist(11, 2.4); obsAt(S.yaw0, S.far); obs.model.root.visible = false; },
      run() {
        if (S.ph === 'go') {
          S.beam = S.t < 0.9 ? 1 : beamStutter(S.t) * 0.7;
          if (at(0.9)) { A.sfx.click(); caption('Not now. Not now.', 2); }
          if (S.t >= 1.7) { S.q = ask({ type: 'mash', key: 'KeyF', text: 'KEEP IT ALIGHT', need: 16, decay: 1.4, time: 7 }); phase('fight'); obs.model.root.visible = true; }
        } else if (S.ph === 'fight') {
          const q = S.q, on = (S.t % 0.62) < 0.17;              // it only moves while the light is out
          S.beam = on ? 0.45 + 0.55 * (q.fill || 0) : 0.02;
          if (!on) { obsAt(S.yaw0, lerp(S.far, 1.0, q.t / q.time)); obsTick('stalk', 1.2, 0.9); S.cam.pitch = lerp(S.cam.pitch, obs.d < 3 ? facePitch() : 0, 0.2); }
          else obs.model.sizeEyes(obs.d, kit.radPerPixel());
          if (on && !S.wasOn) A.obs.step(0, obs.d, 1.1, 1);
          S.wasOn = on;
          if (q.state === 'ok') { phase('lit'); obs.model.root.visible = false; A.sfx.click(); A.obs.exhale(0, obs.d); }
          else if (q.state === 'fail') { obs.model.root.visible = false; loom(); S.beam = 0.4; A.obs.screech(0, 1); kill('The light went out. It did not have far to come.', false); }
        } else if (S.ph === 'lit') {
          S.beam = 1; S.cam.pitch = lerp(S.cam.pitch, 0, Math.min(1, S.dt * 3));
          if (at(0.6)) caption('The beam holds. The path is empty.', 2.2);
          if (S.t >= 2.8) finish();
        }
      },
    },
  };


  // ═════════════════════════ dying ═════════════════════════
  // The night does not end on a cut to a menu. What killed you decides how you go: six ways, each a few seconds long,
  // each ending in the dark with the death screen over it. Nothing is asked of you; any key or a tap moves on.
  const beat = (vol = 0.9) => { A.thump(58, 34, 0.22, vol); setTimeout(() => A.thump(50, 30, 0.2, vol * 0.7), 170); };
  const endDeath = () => { if (S.ph !== 'gone') { phase('gone'); fade(1, 0.5); } };
  const DEATHS = {
    // The dead have you. Your legs go, the flashlight rolls off into the grass, and your heart takes its time stopping.
    fall: {
      run() {
        const t = S.t, knees = ease(0.1, 0.7, t), down = ease(1.0, 1.45, t);
        if (at(0)) { S.shake = 1.2; kit.hurt(0.85); }
        S.cam.y = -0.55 * knees - 0.85 * down; S.cam.pitch = -0.35 * knees * (1 - down) + 0.12 * down; S.cam.roll = 1.2 * down; S.cam.yaw = 0.25 * down;
        if (at(1.42)) { A.thump(110, 36, 0.4, 1); S.shake = 0.9; S.beam = 0; S.torch = false; }
        const [fx, fz] = spotAt(S.yaw0 + 0.5, 1.7);          // where the flashlight came to rest, still on
        glow.color.set(0xffd49c); glow.distance = 9; glow.position.set(fx, S.gy + 0.12, fz);
        glow.intensity = t < 1.42 ? 0 : 3.2 * (t > 4.6 ? beamStutter(t) * Math.max(0, 1 - (t - 4.6) / 1.2) : 1);
        for (const b of [1.9, 2.9, 4.1, 5.6]) if (at(b)) beat();
        kit.hurt(0.85 * (1 - ease(1.5, 5, t)) + 0.15);
        kit.lids(Math.max(ease(3.0, 3.25, t) * (1 - ease(3.4, 3.7, t)) * 0.9, ease(4.6, 6.2, t)));     // a long blink, then the last one
        if (t >= 6.6) endDeath();
      },
    },
    // Under the water. The surface is a pale thing going away above you.
    drown: {
      start() {
        tintEl.style.background = 'radial-gradient(ellipse at 50% 10%, rgba(40,96,124,.55) 0%, rgba(4,20,36,.95) 78%)'; S.cam.y = -1.0;
        waterEl.style.display = 'block'; bubblesEl.style.opacity = '1';
        for (let i = 0; i < 18; i++) {                      // your air, going up without you
          const b = document.createElement('i'), s = 5 + Math.random() * 11;
          b.style.cssText = `left:${22 + Math.random() * 56}%;width:${s}px;height:${s}px;animation-duration:${2.2 + Math.random() * 2.4}s;animation-delay:${Math.random() * 2.6}s`;
          b.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
          bubblesEl.append(b);
        }
      },
      run() {
        const t = S.t;
        if (at(0.05)) A.noise1(2.6, 'lowpass', 500, 90, 0.9);
        if (at(2.4)) A.noise1(3.6, 'lowpass', 300, 60, 0.8);
        tintEl.style.opacity = String(0.7 + 0.28 * ease(0, 5, t));
        const sink = ease(0, 5.5, t);
        surfaceEl.style.transform = `scale(${1 - 0.68 * sink})`; surfaceEl.style.opacity = String(1 - ease(1.2, 5.6, t));
        bubblesEl.style.opacity = String(1 - ease(2.6, 5, t));
        S.cam.y = -1.0 - 0.75 * sink;
        S.cam.pitch = lerp(-0.1, 0.95, ease(0.3, 3.5, t)); S.cam.roll = Math.sin(t * 0.9) * 0.12; S.cam.yaw = Math.sin(t * 0.5) * 0.3;
        S.beam = t < 1.6 ? S.beam0 * 0.6 : t < 2.6 ? S.beam0 * beamStutter(t) * 0.5 : 0; S.torch = false;
        glow.color.set(0x9fd0e6); glow.distance = 12; glow.position.set(S.px, S.gy + 2.6, S.pz); glow.intensity = 2.4 * (1 - ease(1.5, 5.5, t));
        if ((S.bub = (S.bub ?? 0.3) - S.dt) <= 0 && t < 4.2) { S.bub = 0.25 + Math.random() * 0.5; A.noise1(0.09, 'bandpass', 700 + Math.random() * 900, 1600, 0.3 * (1 - t / 5)); }   // the last of your air
        for (const b of [1.2, 2.3, 3.7, 5.4]) if (at(b)) beat(0.8);
        if (at(4.4)) fade(1, 1.8);
        if (t >= 6.4) endDeath();
      },
    },
    // Fire. It closes in from every side, you go to your knees, and the world goes white and then to ash.
    burn: {
      start() { tintEl.style.background = 'radial-gradient(ellipse at center, rgba(255,150,40,.22) 0%, rgba(190,50,8,.9) 100%)'; },
      run() {
        const t = S.t, rise = ease(0, 2.2, t), down = ease(2.6, 3.3, t);
        if (at(0)) { A.noise1(3, 'lowpass', 1800, 300, 1.1); S.shake = 1; }
        if (at(2.6)) { A.noise1(3, 'lowpass', 1200, 120, 1.0); A.sfx.hurt(); }
        S.shake = Math.max(S.shake, 0.5 * (1 - ease(3, 5, t)));
        tintEl.style.opacity = String(0.22 + 0.5 * rise);
        const flames = [];
        for (let i = 0; i < 9; i++) {
          const [x, z] = spotAt(S.yaw0 + i * 0.7 + Math.sin(t * 0.7 + i) * 0.1, 4.4 - 2.3 * rise + (i % 3) * 0.55);
          flames.push([x, kit.groundY(x, z) - 0.1, z, 1.5 + rise * 1.5 + Math.sin(t * 9 + i * 2) * 0.2, i + ((t * 12) | 0)]);
        }
        kit.flames(flames);
        glow.color.set(0xff7a22); glow.distance = 12; glow.position.set(S.px, S.gy + 0.9, S.pz); glow.intensity = (5 + 6 * rise) * (0.8 + 0.2 * Math.sin(t * 27) * Math.sin(t * 11));
        S.cam.yaw = Math.sin(t * 2.1) * 0.5 * (1 - ease(2.4, 3.2, t));        // looking for a way out, and there is none
        S.cam.y = -0.95 * down; S.cam.pitch = 0.5 * down;
        S.beam = 0; S.torch = false;
        if (at(3.6)) { kit.fade.style.background = '#f6e7c4'; fade(1, 0.9); }
        if (at(4.7)) { kit.fade.style.transition = 'background-color 1.3s linear'; kit.fade.style.background = '#000'; }
        if (t >= 6.3) endDeath();
      },
    },
    // It did not kill you where you stood. You come round on your back, moving, with your ankle in its hand.
    drag: {
      start() { fade(1, 0); S.len = Math.max(1.5, Math.min(9, S.room - 1.2)); },
      run() {
        const t = S.t, go = ease(0.4, 6.0, t) * S.len, d = 2.3;
        if (at(0.3)) fade(0, 0.9);
        S.cam.x = -Math.sin(S.yaw0) * go; S.cam.z = -Math.cos(S.yaw0) * go;
        S.cam.y = -1.3 + Math.sin(t * 5.3) * 0.03 + Math.abs(Math.sin(t * 2.2)) * 0.05; S.cam.pitch = 0.16; S.cam.roll = Math.sin(t * 2.2) * 0.05;
        S.beam = 0; S.torch = false;
        const [ox, oz] = spotAt(S.yaw0, go + d);               // it walks ahead of you and does not look back
        obs.d = d; obs.model.root.visible = true; obs.model.root.position.set(ox, kit.groundY(ox, oz), oz); obs.model.root.rotation.y = S.yaw0 + Math.PI;
        obsTick('stalk', 1.3, 0.2);
        glow.color.set(0x7088b0); glow.distance = 9; glow.position.set(S.px + S.cam.x, S.gy + 0.8, S.pz + S.cam.z); glow.intensity = 0.9;
        if ((S.stepIn = (S.stepIn ?? 0) - S.dt) <= 0 && t < 5.4) { S.stepIn = 0.7; A.obs.step(0, d, 1, 1); A.noise1(0.5, 'lowpass', 500, 180, 0.35); }   // its feet, and you, scraping along behind
        if (t < 5.4) A.obs.breath(S.dt, 0, d, 1, 12);
        if (at(5.4)) { A.obs.stop(); A.obs.exhale(0, 1); }
        kit.lids(ease(4.8, 6.4, t));
        if (t >= 6.8) endDeath();
      },
    },
    // The children. You are on your back and they are all round you, looking down, and they are still singing.
    circle: {
      start() { S.loops.push(A.play(A.clips.sing, 0.7)); },
      run() {
        const t = S.t, down = ease(0, 0.9, t), r = lerp(1.5, 1.0, ease(1.6, 5.2, t));
        if (at(0.75)) { A.thump(110, 36, 0.4, 1); S.shake = 0.8; }
        S.cam.y = -1.42 * down; S.cam.pitch = 0.82 * ease(0.2, 1.3, t); S.cam.roll = 0.08 * Math.sin(t * 0.8);
        if (t >= 0.9) { S.beam = 0; S.torch = false; }
        if (t >= 1.3) kids.forEach((c, i) => {
          stand(c.root, S.yaw0 + (i - 2) * 0.38, r + Math.abs(i - 2) * 0.08); kit.poseChild(c, 'watch', i * 1.7, S.clock);       // a half ring over you, heads together
          c.root.rotation.order = 'YXZ'; c.root.rotation.x = 0.42;                   // bent over you
        });
        glow.color.set(0xc9d2e0); glow.distance = 7; glow.position.set(S.px, S.gy + 0.25, S.pz); glow.intensity = 0.8 * ease(1.2, 2, t);
        if (at(3.6)) A.play(A.clips.thank, 0.9);
        kit.lids(ease(4.6, 6.4, t));
        if (t >= 6.9) endDeath();
      },
    },
    // You leave. What is left of you lies where it fell with the flashlight still on, and gets smaller.
    float: {
      start() {
        const b = corpse('ground', S.yaw0, 0.1); b.mats.jacket.color.set(0x56684a); b.mats.skin.color.set(0xb08e74);
        S.top = kit.ceiling ? Math.max(0.6, kit.ceiling - kit.eye - 0.5) : 9;
      },
      run() {
        const t = S.t;
        if (at(0.1)) A.obs.sting();
        S.cam.y = -0.2 * ease(0, 0.5, t) + S.top * ease(0.6, 7, t); S.cam.pitch = lerp(0, -1.45, ease(0.1, 1.6, t)); S.cam.yaw = t * 0.12; S.cam.roll = Math.sin(t * 0.5) * 0.04;
        S.beam = 0; S.torch = false;
        const [fx, fz] = spotAt(S.yaw0 + 1.2, 0.9);
        glow.color.set(0xffd49c); glow.distance = 13; glow.position.set(fx, S.gy + 0.3, fz); glow.intensity = 6 * (1 - ease(4.5, 7, t) * 0.8);
        if (S.cause === 'time') { S.dawned = true; kit.dawn(ease(2, 7, t)); }
        if (at(2.2)) caption(S.cause === 'time' ? 'The sun comes up without you.' : 'It gets quiet.', 3);
        if (at(6.2)) fade(1, 1.4);
        if (t >= 7.8) endDeath();
      },
    },
  };
  const DEATH_FOR = { ghost: 'fall', choir: 'fall', consumer: 'fall', slime: 'drown', drowned: 'drown', burned: 'burn', blast: 'burn', observer: 'drag', collective: 'circle', sanity: 'float', time: 'float' };
  // cause: what main.js calls the death. from: when a quick time event was failed, which scene it was in.
  function playDeath(cause, done = () => {}, from = '') {
    if (cur) return false;
    const name = DEATHS[cause] ? cause : cause === 'cutscene' ? (from === 'still' ? 'circle' : from === 'mind' ? 'float' : 'drag') : DEATH_FOR[cause] || 'fall';
    const view = kit.view();
    cur = DEATHS[name];
    S = { name, death: true, cause, done, t: 0, dt: 0, clock: 0, ph: 'go', px: cam.position.x, pz: cam.position.z, gy: kit.groundY(cam.position.x, cam.position.z),
          yaw0: view.yaw, pitch0: view.pitch, room: 2, cam: { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }, beam: kit.lightOn() ? 1 : 0, torch: kit.lightOn(), shake: 0, stage: false, bodies: [], loops: [] };
    S.beam0 = S.beam;
    fired.clear(); Q = null; qteEl.className = '';
    kit.lock(true); kit.quiet();
    document.body.classList.add('cine'); root.classList.add('on');
    findRoom(name !== 'drag');                              // only the drag turns you to face where there is room to be pulled
    S.zone = kit.clearGround(S.px, S.pz, 6.5);
    if (cur.start) cur.start(S);
    return true;
  }
  function skipDeath() { if (S && S.death && S.ph !== 'gone') { phase('gone'); kit.fade.style.background = ''; fade(1, 0.25); S.t = 0.45; } }

  // ── which, and when ──
  const names = Object.keys(SCENES);
  let bag = [];
  function play(name, done = () => {}) {
    if (cur || !SCENES[name]) return false;
    cur = SCENES[name];
    const view = kit.view();
    S = { name, done, t: 0, dt: 0, clock: 0, ph: 'in', px: cam.position.x, pz: cam.position.z, gy: kit.groundY(cam.position.x, cam.position.z),
          yaw0: view.yaw, room: 2, cam: { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0 }, beam: kit.lightOn() ? 1 : 0, torch: kit.lightOn(), shake: 0, stage: false, bodies: [], loops: [] };
    S.cam.pitch = view.pitch;
    fired.clear(); Q = null;
    kit.lock(true); kit.quiet(); kit.clear();
    document.body.classList.add('cine'); root.classList.add('on');
    fade(1, 0.4);
    return true;
  }
  return {
    names, play,
    get active() { return !!cur; },
    get name() { return S ? S.name : null; },
    get dying() { return !!(S && S.death); },
    deaths: Object.keys(DEATHS), playDeath, skipDeath,
    // called when a round has been survived and its rest is over: true if a scene has taken over (done runs after it)
    maybePlay(done, { force = null, chance = 0.65 } = {}) {
      if (cur || force === 'none' || !kit.canPlay()) return false;
      let name = SCENES[force] ? force : null;
      if (!name) {
        if (force !== 'all' && Math.random() > chance) return false;
        if (!bag.length) bag = names.slice().sort(() => Math.random() - 0.5);
        name = bag.pop();
      }
      return play(name, done);
    },
    update, render, _S: () => S, _obs: obs,
    debug: () => (S ? { name: S.name, ph: S.ph, t: +S.t.toFixed(2), q: Q && { type: Q.type, key: Q.key, state: Q.state, fill: Q.fill }, room: S.room, stage: S.stage } : null),
  };
}
