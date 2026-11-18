import * as THREE from 'three';
import { createTreadmill } from './Stage.js';

// The landing page: someone runs through the woods with a flashlight, looking for something, for as long as
// the page is open. No sound of its own; only the title music plays. PLAY kills the light, and the night
// begins where it always has, face down on the ground.
// kit adds: { buildCorpse, render(scene, camera), aspect(), fade (element), menu (element), onPlay(), onLeft(), moveBoard(into) }
const SHOTS = [                                           // camera [x, y, z], looks at [x, y, z], field of view, seconds
  { pos: [-1.5, 1.5, 4.2], at: [-2.6, 1.0, -6], fov: 58, dur: 8.5 },       // close behind, over the shoulder
  { pos: [3.6, 1.05, 0.2], at: [0, 1.15, 0.75], fov: 54, dur: 6.5 },          // level with them, through the trees
  { pos: [2.4, 0.75, -5.2], at: [0.9, 1.15, 0.5], fov: 52, dur: 6.0 },     // low and ahead, looking back
  { pos: [0.4, 3.2, 7.0], at: [-3.0, 0.8, -5], fov: 50, dur: 7.0 },        // high behind, the beam out in front
];
const BOX = new THREE.BoxGeometry(1, 1, 1);
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export function createTitleScreen(kit) {
  const stage = createTreadmill(kit, { seed: 0x1d1e });
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);
  const SPEED = 4.7;

  // the runner: the game's own blocky body, alive this time
  const body = kit.buildCorpse(kit.mulberry(0x5eed)), j = body.j;
  body.mats.skin.color.set(0xb08e74); body.mats.jacket.color.set(0x56684a); body.mats.pants.color.set(0x3a3c44);
  body.root.rotation.y = Math.PI;                         // built facing +z; the woods come at them from -z
  stage.scene.add(body.root);
  const torch = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
  torch.scale.set(0.05, 0.05, 0.22); torch.position.set(0, -0.36, 0.08); j.elR.add(torch);
  const lens = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0xffd49c }));
  lens.scale.set(0.045, 0.045, 0.02); lens.position.set(0, -0.36, 0.2); j.elR.add(lens);
  const beam = new THREE.SpotLight(0xffd49c, 0, 42, 0.42, 0.5, 1.35);
  beam.position.set(-0.26, 1.12, 0.5); body.root.add(beam, beam.target);
  // the beam itself, hanging in the night air: a faint cone that fades toward its far end
  const CONE = 7, coneGeo = new THREE.ConeGeometry(Math.tan(0.2) * CONE, CONE, 20, 1, true);
  coneGeo.translate(0, -CONE / 2, 0); coneGeo.rotateX(-Math.PI / 2);
  const shade = new Float32Array(coneGeo.attributes.position.count * 3);
  for (let i = 0; i < shade.length / 3; i++) shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = Math.pow(1 - coneGeo.attributes.position.getZ(i) / CONE, 1.6);
  coneGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffd49c, vertexColors: true, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  cone.position.copy(beam.position); body.root.add(cone);
  const aim = new THREE.Vector3();
  const spill = new THREE.PointLight(0xffe2b0, 0, 5.5, 2);                 // what comes back off the ground onto them
  spill.position.set(0, 1.0, 1.5); body.root.add(spill);
  // a landing page has to be read at a glance, so this night has a moon the game's own never does
  const NIGHT = 0x04070d;
  stage.scene.background.set(NIGHT); stage.scene.fog.color.set(NIGHT); stage.scene.fog.density = 0.038;
  const moon = new THREE.DirectionalLight(0x7f95d0, 3.0); moon.position.set(0.7, 1, 0.35); stage.scene.add(moon);
  stage.scene.add(new THREE.HemisphereLight(0x46557e, 0x0b0d13, 1.7));

  // someone standing in the trees, who comes round once a lap
  const watcher = kit.buildCorpse(kit.mulberry(0xdead));
  watcher.j.hips.position.y = 0.93; watcher.j.head.rotation.set(0.12, -0.5, 0.3);
  watcher.root.rotation.y = 1.9;
  const stand = new THREE.Group(); stand.add(watcher.root); stage.loop(stand, -4.6, 31);

  let t = 0, gait = 0, shot = 0, shotT = 0, leaving = null;
  const state = { active: true };

  function pose(dt) {
    gait += dt * SPEED * 2.1;
    const p = gait, s = Math.sin(p), c = Math.cos(p);
    // every so often: a long look back over the left shoulder
    const lap = t % 11, back = smooth(7.4, 7.9, lap) * (1 - smooth(8.7, 9.3, lap));
    const look = (0.5 * Math.sin(t * 0.83) + 0.22 * Math.sin(t * 2.1 + 1)) * (1 - back) + back * 1.0;
    j.hips.position.y = 0.93 + Math.abs(s) * 0.07;
    j.hips.rotation.set(0, s * 0.1, 0);
    j.torso.rotation.set(0.24, -s * 0.16 + look * 0.25, 0);
    j.head.rotation.set(-0.12, look * 0.8 + back * 1.1, 0);
    j.hipL.rotation.set(-s * 0.95 - 0.15, 0, 0); j.hipR.rotation.set(s * 0.95 - 0.15, 0, 0);
    j.knL.rotation.set(0.35 + 0.95 * Math.max(0, c), 0, 0); j.knR.rotation.set(0.35 + 0.95 * Math.max(0, -c), 0, 0);
    j.shL.rotation.set(s * 0.85, 0, 0.12); j.elL.rotation.set(-1.15, 0, 0);
    j.shR.rotation.set(-1.0 - s * 0.16 - back * 0.3, 0, -0.1 - look * 0.25); j.elR.rotation.set(-0.5 + c * 0.1, 0, 0);
    // the beam goes where they look, and bounces with the hand
    const bl = look * 0.75 + back * 0.5, bob = Math.sin(p + 1.2) * 0.5;
    beam.target.position.set(Math.sin(bl) * 10, 0.1 + bob * 0.6, Math.cos(bl) * 10);
    body.root.updateMatrixWorld(); cone.lookAt(beam.target.getWorldPosition(aim));
  }

  function update(dt) {
    t += dt; shotT += dt;
    if (!leaving && shotT > SHOTS[shot].dur) { shot = (shot + 1) % SHOTS.length; shotT = 0; }
    stage.scroll(SPEED * dt);
    pose(dt);
    let power = 0.94 + 0.06 * Math.sin(t * 23) * Math.sin(t * 7.3);
    if (leaving) {                                        // PLAY: the light stutters and dies, and the dark takes the rest
      leaving.t += dt;
      const k = leaving.t;
      power *= k > 0.8 ? 0 : (Math.sin(k * 46) > 0.15 ? 1 : 0.06) * (1 - k / 1.0);
      kit.fade.style.opacity = String(smooth(0.45, 1.05, k));
      if (k >= 1.3) { state.active = false; kit.fade.style.opacity = '1'; const done = leaving.done; leaving = null; done(); return; }
    }
    beam.intensity = 95 * power; spill.intensity = 2.2 * power; lens.visible = power > 0.3; cone.material.opacity = 0.07 * power;
    const S = SHOTS[shot], drift = shotT / S.dur - 0.5;
    camera.position.set(S.pos[0] + drift * 0.5 + Math.sin(t * 0.7) * 0.05, S.pos[1] + Math.sin(t * 1.3) * 0.03 + Math.abs(Math.sin(gait)) * 0.015, S.pos[2] + drift * 0.9);
    camera.lookAt(S.at[0], S.at[1] + Math.sin(t * 0.9) * 0.04, S.at[2]);
    if (camera.fov !== S.fov || camera.aspect !== kit.aspect()) { camera.fov = S.fov; camera.aspect = kit.aspect(); camera.updateProjectionMatrix(); }
  }

  // ── the menu: PLAY, LEADERBOARD, INSTRUCTIONS ──
  const menu = kit.menu, panel = menu.querySelector('#menuPanel'), main = menu.querySelector('#menuMain');
  const sections = { board: menu.querySelector('#menuBoard'), how: menu.querySelector('#menuHow') };
  const touch = document.body.classList.contains('touch');
  let page = null;
  function show(which) {
    main.hidden = !!which; panel.hidden = !which;
    for (const k in sections) sections[k].hidden = k !== which;
    menu.querySelector('#menuPanelTitle').textContent = which === 'board' ? 'LEADERBOARD' : 'INSTRUCTIONS';
    if (which === 'board') kit.moveBoard(sections.board);
    page = which;
    if (!touch) (which ? panel.querySelector('[data-menu=back]') : main.querySelector('[data-menu=play]')).focus({ preventScroll: true });
    else { panel.scrollTop = 0; menu.querySelector('#menuBackHint').textContent = which === 'board' ? '← SWIPE LEFT TO GO BACK' : 'SWIPE RIGHT → TO GO BACK'; }
  }
  function play() {
    if (leaving || !state.active) return;
    menu.classList.add('leaving');
    kit.fade.style.transition = '';
    leaving = { t: 0, done: () => { menu.hidden = true; kit.onLeft(); } };
    kit.onPlay();                                         // inside the click, so the browser lets the pointer lock through
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    const what = b.dataset.menu;
    if (what === 'play') play(); else show(what === 'back' ? null : what);
  });
  addEventListener('keydown', (e) => {
    if (!state.active || leaving || e.target.matches?.('input, select')) return;
    if (e.code === 'Escape' && !panel.hidden) show(null);
  });
  if (touch) {
    // A phone has no buttons here. The title is the middle of three pages: a tap plays, a swipe left brings the
    // instructions in from the right, a swipe right brings the leaderboard in from the left, and the opposite swipe goes back.
    let finger = null;
    menu.addEventListener('pointerdown', (e) => { finger = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), field: !!(e.target.closest && e.target.closest('input, select, button, #board')) }; });
    const lift = (e) => {
      if (!finger || e.pointerId !== finger.id) return;
      const f = finger, dx = e.clientX - f.x, dy = e.clientY - f.y; finger = null;
      if (!state.active || leaving) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (!page) show(dx < 0 ? 'how' : 'board');
        else if ((page === 'how' && dx > 0) || (page === 'board' && dx < 0)) show(null);
      } else if (!page && !f.field && Math.hypot(dx, dy) < 14 && performance.now() - f.t < 450) play();
    };
    menu.addEventListener('pointerup', lift);
    menu.addEventListener('pointercancel', () => { finger = null; });
  }
  menu.hidden = false;
  if (!touch) main.querySelector('[data-menu=play]').focus({ preventScroll: true });

  return Object.assign(state, {
    update,
    render() { kit.render(stage.scene, camera, false, true); },
    // straight past the title, for ?nointro and the debug handle
    skip() { if (!state.active) return; state.active = false; leaving = null; menu.hidden = true; kit.onLeft(); },
    debug: () => ({ t, shot, leaving: !!leaving, dist: stage.dist }),
  });
}
