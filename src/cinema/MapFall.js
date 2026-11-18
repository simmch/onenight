const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, value) => {
  const k = clamp((value - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function createMapFall({ camera, screen, label, state, render, onLand }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = '', time = 0, ready = false;
  let start = null, rotation = null, height = 0, depart = null;

  function show() {
    document.body.classList.add('map-travel');
    screen.hidden = false;
  }
  function launch(destination, next) {
    mode = 'depart';
    time = 0;
    start = camera.position.clone();
    rotation = camera.rotation.clone();
    depart = next;
    label.textContent = destination;
    state.textContent = 'LOADING';
    screen.style.removeProperty('--fall-shift');
    screen.style.opacity = '0';
    show();
  }
  function wait(clearance) {
    mode = 'load';
    time = 0;
    height = Math.max(8, clearance + 1);
    start = camera.position.clone();
    rotation = camera.rotation.clone();
    screen.style.opacity = '1';
    show();
  }
  function loaded() {
    ready = true;
    screen.dispatchEvent(new Event('map-ready'));
  }
  function update(dt) {
    if (!mode) return false;
    time += dt;
    const motion = !reduce.matches;
    if (mode === 'depart') {
      const k = clamp(time / 1.17);
      if (motion) {
        camera.position.y = start.y - 16 * k * k * k;
        camera.rotation.set(rotation.x * (1 - smooth(0, 0.65, k)) - 0.93 * smooth(0.08, 0.7, k),
          rotation.y + 0.33 * k * k, rotation.z + 0.27 * smooth(0.12, 0.8, k), rotation.order);
      }
      screen.style.opacity = String(smooth(0.24, 0.94, k));
      if (k < 0.95) render(1);
      if (k === 1) { mode = 'handoff'; depart(); }
    } else if (mode === 'load' && ready && time >= 0.52) {
      mode = 'land';
      time = 0;
      state.textContent = 'ARRIVING';
    } else if (mode === 'land') {
      const k = clamp(time / 1.55);
      const drop = clamp(k / 0.81);
      if (motion) {
        const settle = drop === 1 ? Math.sin(Math.PI * (k - 0.81) / 0.19) * 0.13 : 0;
        camera.position.y = start.y + height * (1 - drop * drop) - settle;
        camera.rotation.set(rotation.x - 0.82 * (1 - smooth(0.3, 0.96, k)),
          rotation.y + 0.23 * (1 - k), rotation.z - 0.12 * (1 - k), rotation.order);
      }
      screen.style.opacity = String(1 - smooth(0.28, 0.8, k));
      render(1 - smooth(0.82, 1, k) * 0.65);
      if (k === 1) {
        camera.position.copy(start);
        camera.rotation.copy(rotation);
        mode = '';
        screen.hidden = true;
        document.body.classList.remove('map-travel');
        onLand();
      }
    }
    return true;
  }
  return { launch, wait, loaded, update, get active() { return mode !== ''; } };
}
