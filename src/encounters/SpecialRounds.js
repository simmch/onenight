import { createEncounterWorld, distance, pickSites, survey } from './EncounterWorld.js';
import { paintEncounterSprite } from './EncounterSprites.js';
import { createBurrower, createEffigy } from './CreatureTraps.js';
import { createCounterfeit, createSeamstress } from './WebAndMimic.js';
import { createBellman, createWickEater } from './LightAndSound.js';

export const SPECIAL_ROUNDS = {
  effigy: {
    name: 'The Effigy', sites: 5, create: createEffigy,
    objective: 'Find the living statue. Lead it into the gold circle and seal three locks in the flashlight beam.',
    ending: 'The last lock closes. The statues crack.',
    death: 'The statue took another step.',
  },
  burrower: {
    name: 'The Burrower', sites: 6, create: createBurrower,
    objective: 'Arm three traps. Run over an armed plate, then get clear and trigger it. Finish the exposed creature.',
    ending: 'The ground is finally still.',
    death: 'The floor opened beneath you.',
  },
  seamstress: {
    name: 'The Seamstress', sites: 4, create: createSeamstress,
    objective: 'Burn or cut three anchor webs. Burn the nest when it opens. Wax tins hold spare matches.',
    ending: 'The nest burns. The last thread falls slack.',
    death: 'The threads pulled tight.',
  },
  counterfeit: {
    name: 'The Counterfeit', sites: 6, create: createCounterfeit,
    objective: 'Check the props for breathing or a false creak. Destroy three copies, then find their source.',
    ending: 'The false landmark collapses. The remaining props are still.',
    death: 'The thing inside the prop opened its mouth.',
  },
  wickeater: {
    name: 'The Wick Eater', sites: 3, create: createWickEater,
    objective: 'Power three relays. Hold E on the one that buzzes and flickers, then shoot the core that falls out. Twice. Things will come out of the walls.',
    ending: 'The last core goes dark. Current returns to the lights.',
    death: 'It found you when the lights went out.',
  },
  bellman: {
    name: 'The Bellman', sites: 7, create: createBellman,
    objective: 'Follow the paired ticks and stop three clocks. Ring the master bell in the pause after two footfalls.',
    ending: 'The bell rings. The footsteps stop.',
    death: 'Its last step landed beside you.',
  },
};

export function createSpecialRounds(params) {
  const w = createEncounterWorld({ ...params, paintSprite: paintEncounterSprite });
  const { world, camera, hooks } = params;
  let spec = null, encounter = null, reach = null, player = null, origin = null;
  let holding = 0, heldLabel = '', released = true, time = 0, relocateTimer = 0;
  let guideTimer = 0, guide = '';

  function project(spec, origin) {
    return pickSites(survey(world, origin), origin, spec.sites);
  }
  function start(type, n) {
    stop();
    spec = SPECIAL_ROUNDS[type];
    origin = { x: camera.position.x, z: camera.position.z };
    encounter = spec.create(w, project(spec, origin), Math.min(10, Math.max(0, n - 1)));
  }
  function stop(playTail = false) {
    w.clear();
    if (!playTail) hooks.silence();
    encounter = spec = reach = player = origin = null;
    holding = time = guideTimer = relocateTimer = 0;
    heldLabel = guide = '';
    released = true;
  }
  function relocate() {
    if (!encounter) return;
    origin = { x: camera.position.x, z: camera.position.z };
    encounter.relocate(project(spec, origin));
    guideTimer = 0;
    reach = null;
    holding = 0;
    hooks.say('You hear it ahead again.');
  }
  function update(dt, info) {
    if (!encounter || encounter.won) return;
    if (!info.inControl) { hooks.silence(); return; }
    time += dt;
    player = { x: camera.position.x, z: camera.position.z, time, ...info };
    if ((relocateTimer -= dt) <= 0) {
      relocateTimer = 1;
      if (distance(origin, player) > 55) relocate();
    }
    encounter.update(dt, player);
    if (!encounter) return; // damage can end the run immediately
    if ((guideTimer -= dt) <= 0) {
      guideTimer = 0.26;
      const point = encounter.target;
      guide = point ? bearing(point, player) : '';
    }
    w.draw();
  }
  function bearing(point, p) {
    const dx = point.x - p.x, dz = point.z - p.z;
    const forward = -dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw);
    const right = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
    const directions = ['ahead', 'ahead right', 'right', 'behind right', 'behind', 'behind left', 'left', 'ahead left'];
    const dir = directions[(Math.round(Math.atan2(right, forward) / (Math.PI / 4)) + 8) % 8];
    const d = Math.hypot(dx, dz);
    return d < 2 ? 'NEARBY' : `${Math.ceil(d)} m ${dir}`;
  }
  function action(dt, available, held, info) {
    if (!encounter || encounter.won) return null;
    if (!held) released = true;
    const p = { ...player, ...info, x: camera.position.x, z: camera.position.z };
    reach = available && encounter.action(p);
    if (!reach?.duration || reach.label !== heldLabel || !held) holding = 0;
    heldLabel = reach?.label;
    if (!reach) return null;
    if (!reach.duration) return reach;
    if (held && released) holding += dt;
    if (holding >= reach.duration) {
      const finish = reach.run;
      holding = 0;
      released = false;
      finish();
      return null;
    }
    const progress = holding ? ` · ${Math.floor(100 * holding / reach.duration)}%` : '';
    return { label: '[Hold E] ' + reach.label + progress, run() {} };
  }
  function shot(origin, dir, { range = 45, melee = false, damage = 1 } = {}) {
    if (!encounter || encounter.won) return;
    if (!melee) noise(origin, 1.7);
    const item = w.ray(encounter.targets?.(melee) || [], origin, dir, range, melee);
    if (item) encounter.hit(item, damage);
    else if (melee) encounter.cut?.();
  }
  function blast(point, radius) {
    if (!encounter || encounter.won) return;
    noise(point, 2.6);
    const items = encounter.targets?.(false) || [];
    for (const item of [...items]) {
      if (!encounter.won && item.root.visible && distance(item, point) < radius && w.clearLine(item, point)) encounter.hit(item, 5);
    }
  }
  function noise(point, amount) { encounter?.noise?.(point, amount); }
  // the Counterfeit only: a real chest in the world was one of them
  function chestTrap(x, z) {
    if (!encounter?.chestTrap || encounter.won) return false;
    encounter.chestTrap(x, z, { x: camera.position.x, z: camera.position.z });
    return true;
  }
  return {
    start, stop, relocate, update, action, shot, blast, noise, chestTrap,
    get active() { return !!encounter; },
    get encounter() { return encounter; },            // console debugging
    get won() { return !!encounter?.won; },
    get drag() { return encounter?.drag ?? 1; },
    get power() { return encounter?.power ?? 1; },
    get hostiles() { return encounter?.hostiles ?? []; },
    get status() { return (encounter?.status || '') + (guide ? ' · ' + guide : ''); },
  };
}
