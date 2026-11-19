import { distance, press, hold } from './EncounterWorld.js';
import { monsterAsset } from '../world/MonsterAssets.js';

export function createEffigy(w, sites, level) {
  const { hooks } = w;
  const ring = w.prop(sites[0]);
  const circle = w.mark(ring, 0xa98451, 1.55);
  const lockLamps = Array.from({ length: 3 }, (_, i) => {
    const a = i * Math.PI * 2 / 3;
    w.part(ring.root, 0x5e5142, Math.sin(a) * 1.03, 0.24, Math.cos(a) * 1.03, 0.25, 0.48, 0.25);
    return w.part(ring.root, 0xc09961, Math.sin(a) * 1.03, 0.5, Math.cos(a) * 1.03, 0.12, 0.05, 0.12, true);
  });
  const art = ({ forest: 'scarecrow', rural: 'scarecrow', snow: 'snowman', swamp: 'scarecrow',
    cave: 'skeleton', hell: 'gargoyle', cathedral: 'gargoyle', taxidermy: 'skeleton' })[hooks.map] || 'gargoyle';
  const statues = sites.slice(1, 5).map(p => {
    const s = w.prop(p, { art, width: 1.05, height: 1.7 });
    s.mark = w.mark(s, 0xb6ab8a, 0.55);
    s.mark.visible = false;
    return s;
  });
  const real = statues[hooks.random() * statues.length | 0];
  const live = w.prop(real, { name: 'effigy', width: 1.08, height: 1.85 });
  live.root.visible = false;
  const copies = [];
  let shown = false, locks = 0, pinned = 0, stun = 0, scratch = 0, cooldown = 1, shift = Math.max(2.5, 6 - level * 0.3);
  let p;
  const encounter = {
    get status() { return shown ? `LOCKS ${locks}/3 · ${pinned > 0 ? 'BIND IT IN THE LIGHT' : 'LURE IT INTO THE CIRCLE'}` : 'INSPECT THE STATUES'; },
    get target() { return shown ? ring : statues.filter(s => !s.checked && s.root.visible).sort((a, b) => distance(a, p) - distance(b, p))[0]; },
    get hostiles() { return [shown ? live : real, ...copies]; },
    update(dt, player) {
      p = player;
      if (!shown) {
        scratch -= dt;
        if (scratch <= 0) { hooks.cue('stone', real, 0.75); scratch = 3.5; }
        const marked = (p.camera || p.match) && w.seen(real, p, p.match ? 8 : 25, 0.82);
        real.skin.position.x = marked ? 0.11 * Math.sin(p.time * 9) : 0;
        if (marked || distance(p, real) < 3.2) real.root.position.y = w.world.groundY(real.x, real.z) + 0.11 * Math.sin(p.time * 6);
        if ((shift -= dt) <= 0) moveStatue();
      }
      stun -= dt;
      cooldown -= dt;
      for (const m of shown ? [live, ...copies] : copies) {
        const inCircle = m === live && distance(m, ring) < 1.3;
        const frozen = p.beam && w.seen(m, p, p.beamRange, 0.91);
        if (inCircle && frozen) pinned = 2.8;
        if (!frozen && !(m === live && (stun > 0 || (inCircle && pinned > 0)))) {
          const goal = m === live && distance(p, ring) < 1.5 ? ring : p;
          w.move(m, dt, goal, (m === live ? 2.75 : 1.75) + level * 0.15);
          m.pose(Math.sin(p.time * 10) > 0 ? 'step' : 'still');
        } else m.pose('still');
        if (!frozen && cooldown <= 0 && distance(m, p) < 1.3 && w.clearLine(m, p) && !inCircle) {
          m.pose('attack');
          hooks.cue('crack', m);
          hooks.hurt(17 + level, 'effigy');
          cooldown = 1.9;
        }
      }
      pinned = Math.max(0, pinned - dt);
      circle.material.opacity = pinned > 0 ? 0.92 : 0.46;
    },
    action(player) {
      if (player.battery <= 0.05 && w.close(ring, player, 2.35)) return press('Charge the flashlight at the binding stand', hooks.recharge);
      if (shown) {
        if (!w.close(ring, player, 2.35)) return null;
        if (!pinned || !player.beam || !w.seen(live, player, player.beamRange, 0.91)) {
          return { label: 'Lure the Effigy inside. Hold your light on it.', run() {} };
        }
        return hold(`Seal lock ${locks + 1}`, 0.63, () => {
          locks++;
          lockLamps[locks - 1].visible = false;
          hooks.cue('latch', ring);
          if (locks === 3) { hooks.cue('crack', ring); encounter.won = true; }
        });
      }
      const s = statues.find(s => s.root.visible && !s.checked && w.close(s, player));
      if (!s) return null;
      if (s === real && !(player.match || player.camera || player.beam)) return { label: 'Something is breathing here. Bring light close.', run() {} };
      if (!player.match && !player.camera && !player.beam) return null;
      return press('Inspect the statue', () => {
        if (s === real) reveal();
        else {
          s.checked = true;
          s.mark.visible = true;
          hooks.say('Cold stone. This one is still.');
        }
      });
    },
    noise(point, amount) {
      if (p && amount >= 0.65 && !shown) moveStatue();
    },
    targets() { return shown ? [live, ...copies] : [...statues, ...copies]; },
    hit(m) {
      if (m === live) { stun = 1.7; hooks.cue('stone', m); }
      else if (m === real) reveal();
      else if (statues.includes(m)) {
        m.root.visible = false;
        if (copies.length < 2 + Math.floor(level / 3)) copies.push(w.prop(m, { name: 'effigy', width: 1.02, height: 1.65 }));
        hooks.say('You broke an innocent statue. Something steps out of the dust.');
        hooks.cue('crack', m);
      } else m.place(ring);
    },
    relocate(next) {
      ring.place(next[0]);
      statues.forEach((s, i) => s.place(next[i + 1]));
      live.place(real);
      copies.forEach((s, i) => s.place(next[i % 4 + 1]));
      pinned = 0;
    },
  };
  function moveStatue() {
    shift = Math.max(2.5, 6 - level * 0.29);
    if (w.seen(real, p, 30, 0.8)) return;
    const candidates = statues.filter(s => s !== real && s.root.visible && !s.checked && !w.seen(s, p, 26, 0.55));
    const destination = candidates.sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (!destination) return;
    const old = { x: real.x, z: real.z };
    real.place(destination);
    destination.place(old);
    hooks.cue('stone', real);
  }
  function reveal() {
    shown = true;
    real.root.visible = false;
    live.place(real);
    live.root.visible = true;
    hooks.cue('crack', live);
    hooks.say('It moves when you look away. Lead it onto the gold circle, then light it and seal the locks.');
  }
  return encounter;
}

export function createBurrower(w, sites, level) {
  const { hooks } = w;
  const stages = Array.from({ length: 3 }, (_, i) => {
    const plate = w.prop(sites[i * 2]);
    w.mark(plate, 0xa66b3c, 2.35);
    w.part(plate.root, 0x75644d, 0, 0.07, 0, 1.3, 0.14, 1.3);
    const at = controlSite(plate, sites[i * 2 + 1], sites);
    const control = w.prop(at);
    w.part(control.root, 0x665844, 0, 0.52, 0, 0.33, 1.04, 0.35);
    w.part(control.root, 0xdda36d, 0, 1.1, 0, 0.19, 0.12, 0.18, true);
    control.mat = w.mark(control, 0x81908b, 1);
    plate.root.visible = control.root.visible = !i;
    return { plate, control };
  });
  const crawler = monsterAsset('burrower', { scale: 0.74, idle: 'Idle_Ground' });
  const burrow = w.prop(sites[0], { name: crawler ? undefined : 'burrower', width: 1.8, height: 1.25 });
  if (crawler) {
    burrow.root.add(crawler.root);
    burrow.rayHit = crawler.rayHit;
  }
  let attackPose = 0, hitPose = 0;
  const mound = w.prop(sites[5]);
  const tremor = w.mark(mound, 0xa78a72, 1.8);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047;
    w.part(mound.root, 0x5e5248, Math.sin(a) * 0.75, 0.07, Math.cos(a) * 0.75, 0.18, 0.12, 0.27);
  }
  burrow.root.visible = mound.root.visible = false;
  let hitCount = 0, phase = 'idle', clock = 1, noise = null, approach = null, cue = 0, wait = 0, health = 11 + level;
  let p, strike = 0;
  const active = () => stages[Math.min(hitCount, 2)];
  const encounter = {
    get status() {
      if (phase === 'surface') return `EXPOSED · ${health} HP`;
      if (phase === 'tracking') return `TRAPS ${hitCount}/3 · ${approach.trapped ? 'GET BACK TO THE SWITCH' : 'THE GROUND IS MOVING'}`;
      return `TRAPS ${hitCount}/3 · ${phase === 'caught' ? 'TRIGGER AT THE SWITCH' : phase === 'armed' ? 'MAKE NOISE IN THE RING' : 'ARM THE SWITCH'}`;
    },
    get target() { return phase === 'surface' ? burrow : phase === 'armed' ? active().plate : active().control; },
    get hostiles() { return phase === 'surface' ? [burrow] : mound.root.visible ? [mound] : []; },
    update(dt, player) {
      p = player;
      cue -= dt;
      wait = Math.max(0, wait - dt);
      strike -= dt;
      const { plate, control } = active();
      if (phase === 'surface') {
        const moving = strike < -0.9;
        if (moving) w.move(burrow, dt, p, 1.65 + level * 0.09);
        attackPose = Math.max(0, attackPose - dt);
        hitPose = Math.max(0, hitPose - dt);
        if (strike <= 0 && distance(burrow, p) < 1.65 && w.clearLine(burrow, p)) {
          attackPose = 1.75;
          burrow.pose('attack');
          hooks.hurt(18 + level, 'burrower');
          hooks.cue('crack', burrow);
          strike = 2.5;
        } else if (strike < 1.8) burrow.pose(Math.sin(p.time * 9) > 0 ? 'still' : 'step');
        if (crawler) {
          burrow.root.rotation.y = Math.atan2(p.x - burrow.x, p.z - burrow.z);
          const clip = hitPose > 0 ? 'Hit' : attackPose > 0 ? 'Attack' : moving ? 'Run_Snake' : 'Idle_Ground';
          crawler.animate(clip, dt, { once: hitPose > 0 || attackPose > 0 });
        }
        return;
      }
      if (phase === 'tracking') {
        clock -= dt;
        w.move(mound, dt, approach.point, 5 + level * 0.19);
        tremor.scale.setScalar(0.94 + Math.sin(p.time * 9) * 0.22);
        if (cue <= 0) { hooks.cue('rumble', mound, 0.74); cue = 0.51; }
        if (clock <= 0 || distance(mound, approach.point) < 0.6) {
          mound.place(approach.point);
          phase = approach.trapped ? 'caught' : 'eruption';
          clock = approach.trapped ? Math.max(9, distance(plate, control) / 1.35 + 6) : Math.max(1, 2.1 - level * 0.07);
          hooks.say(approach.trapped ? 'It is under the plate. Get clear and pull the trigger switch.' : 'The ground buckles. Move!');
        }
        return;
      }
      if (phase === 'caught' || phase === 'eruption') {
        clock -= dt;
        tremor.scale.setScalar(1.65 + 0.38 * Math.sin(p.time * 15));
        if (cue <= 0) { hooks.cue('rumble', mound); cue = 0.65; }
        if (clock <= 0) {
          if (distance(mound, p) < 2.2 && w.clearLine(mound, p)) hooks.hurt(22 + level, 'burrower');
          hooks.cue('crack', mound);
          mound.root.visible = false;
          phase = phase === 'caught' ? 'armed' : mound.previous;
          wait = 3.8;
        }
        return;
      }
      if (distance(p, control) > 1.1 && p.moving) {
        const force = (p.running ? 1.2 : 0.2) + p.armor * 0.12;
        clock += dt * force;
        if (phase === 'armed' && distance(p, plate) < 2.1 && clock > 0.8) noise = { point: plate, amount: 1.5 };
        else if (clock > 3.6) noise = { point: p, amount: 0.9 };
      } else clock = Math.max(0, clock - dt * 0.3);
      if (noise && !wait) {
        const inTrap = phase === 'armed' && distance(noise.point, plate) < 2.5;
        if (inTrap || noise.amount > 0.8) {
          mound.root.visible = true;
          mound.previous = phase;
          approach = { point: inTrap ? plate : noise.point, trapped: inTrap };
          phase = 'tracking';
          clock = inTrap ? 1.2 : 1.05;
        }
        noise = null;
      }
    },
    action(player) {
      if (phase === 'surface') {
        if (w.close(burrow, player, 2.25)) return hold('Strike the open wound', 0.66, () => encounter.hit(burrow, 3));
        return null;
      }
      const { plate, control } = active();
      if (!w.close(control, player)) return null;
      if (phase === 'idle') return press('Arm the vibration trap', () => {
        phase = 'armed'; clock = 0; wait = 0;
        hooks.cue('latch', control);
        hooks.say('Run through the bronze ring to bait the trap.');
      });
      if (phase === 'caught') return press('Trigger the trap', () => {
        if (distance(plate, player) < 2.35 && distance(plate, control) >= 2.65) {
          hooks.say('Step back from the blast ring first.');
          return;
        }
        hitCount++;
        hooks.cue('crack', plate);
        mound.root.visible = plate.root.visible = control.root.visible = false;
        if (hitCount === 3) {
          phase = 'surface'; burrow.place(plate); burrow.root.visible = true; strike = 2.6;
          hooks.say('Its wound is open. Shoot it, or get close and strike it.');
        } else {
          phase = 'idle'; clock = 0; wait = 2.5;
          active().plate.root.visible = active().control.root.visible = true;
        }
      });
      return { label: phase === 'tracking' && approach.trapped ? 'Wait for it to reach the trap.' : 'Trap armed. Make noise in the ring.', run() {} };
    },
    noise(point, amount) {
      if (phase === 'idle' || phase === 'armed') noise = { point: { x: point.x, z: point.z }, amount };
    },
    targets() { return phase === 'surface' ? [burrow] : []; },
    hit(m, damage) {
      health -= damage;
      hitPose = 0.48;
      strike = Math.max(strike, 0.72);
      hooks.cue('stone', burrow);
      if (health <= 0) encounter.won = true;
    },
    relocate(next) {
      stages.forEach(({ plate, control }, i) => {
        plate.place(next[i * 2]); control.place(controlSite(plate, next[i * 2 + 1], next));
      });
      mound.root.visible = false;
      if (phase === 'surface') burrow.place(next[1]); else { phase = 'idle'; clock = 0; }
    },
  };
  function controlSite(plate, alternate, points) {
    if (distance(plate, alternate) > 2.65 && w.clearLine(plate, alternate)) return alternate;
    return points.filter(p => distance(plate, p) > 2.65 && w.clearLine(plate, p))
      .sort((a, b) => distance(plate, a) - distance(plate, b))[0] || alternate;
  }
  return encounter;
}
