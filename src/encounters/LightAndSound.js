import { distance, press, hold } from './EncounterWorld.js';

export function createWickEater(w, sites, level) {
  const { hooks } = w;
  const relays = sites.slice(0, 3).map((p, i) => {
    const relay = w.prop(p);
    w.part(relay.root, 0x463e38, 0, 0.62, 0, 0.54, 1.24, 0.42);
    w.part(relay.root, 0x8c7659, 0, 1.11, 0.24, 0.31, 0.23, 0.06);
    const dots = [];
    for (let n = 0; n <= i; n++) dots.push(w.part(relay.root, 0xe9aa65, (n - i / 2) * 0.10, 1.11, 0.28, 0.05, 0.05, 0.03, true));
    relay.indicators = dots;
    relay.light = w.lamp(relay, 0xfba662, 0);
    relay.id = i + 1;
    relay.ring = w.mark(relay, 0xaa7046, 0.78);
    relay.powered = false;
    relay.open = true;
    return relay;
  });
  const core = w.prop(sites[0], { name: 'wickeater', width: 1.2, height: 1.02 });
  core.root.visible = false;
  let fed = null, next = 9, cue = 0, darkness = 0, strike = 0, exposed = 0, hp = 0, overloads = 0, eaten = 0, blackout = 0;
  const ready = () => relays.every(r => r.powered);
  const closed = () => relays.filter(r => r !== fed && !r.open).length;
  const encounter = {
    get status() {
      if (exposed > 0) return `CORE ${hp} HP · OVERLOADS ${overloads}/3`;
      if (!ready()) return `POWER THE RELAYS ${relays.filter(r => r.powered).length}/3`;
      if (!fed) return 'WAIT FOR THE BUZZ';
      return `BUZZ AT RELAY ${fed.id} · BREAKERS ${closed()}/2 · CORES ${overloads}/3`;
    },
    get target() {
      if (exposed > 0) return core;
      return relays.find(r => !r.powered) || relays.find(r => r !== fed && r.open) || fed;
    },
    get hostiles() { return [core.root.visible ? core : fed].filter(Boolean); },
    get power() { return blackout > 0 ? 0.14 : 1; },
    update(dt, p) {
      strike -= dt;
      blackout = Math.max(0, blackout - dt);
      for (const r of relays) {
        const hum = r === fed && Math.sin(p.time * 10) > 0.15;
        const power = r.powered && r.open ? hum ? 0.1 : r === fed ? 0.22 : 1 : 0;
        r.light.intensity = 16 * power;
        r.ring.material.opacity = r === fed ? 0.52 + 0.3 * Math.sin(p.time * 7) : 0.30 + power * 0.28;
        for (const dot of r.indicators) dot.visible = !r.powered || !r.open || r !== fed || !hum;
      }
      if (exposed > 0) {
        core.pose('attack');
        exposed -= dt;
        if (exposed <= 0) {
          core.root.visible = false;
          relays.forEach(r => { r.open = true; });
          next = 7;
          hooks.say('The core slips back into the wires. Trap it again.');
        }
        return;
      }
      if (!fed) return;
      if ((cue -= dt) <= 0) { hooks.cue('buzz', fed, 0.83); cue = 1.35; }
      const dark = distance(fed, p) < 6.2 && w.clearLine(fed, p) && !p.match && !p.beam && (!p.roomLit || blackout > 0);
      darkness = dark ? darkness + dt : Math.max(0, darkness - dt * 2);
      if (darkness > 2.0 && strike <= 0) {
        core.place(fed); core.root.visible = true; core.pose('attack');
        hooks.cue('crack', fed);
        hooks.hurt(16 + level, 'wickeater');
        strike = 3.9;
      } else if (strike < 3.55) core.root.visible = false;
      if (distance(fed, p) < 4 && w.clearLine(fed, p) && p.beam && !p.match) hooks.drain(dt * (0.6 + eaten * 0.15));
      if (!ready() || closed() === 2 || (next -= dt) > 0) return;
      hop(relays.find(r => r !== fed && r.open));
    },
    action(p) {
      if (exposed > 0 && w.close(core, p, 1.8)) return hold('Crush the exposed core', 0.62, () => encounter.hit(core, 3));
      const r = relays.find(r => w.close(r, p));
      if (!r || exposed > 0) return null;
      if (!r.powered) return press(`Power relay ${r.id}`, () => {
        r.powered = true;
        if (!fed) fed = r;
        else hop(r);
        hooks.cue('latch', r);
        if (ready()) hooks.say('Listen for the buzz. Isolate the two quiet relays, then overload the buzzing one.');
      });
      if (!ready()) return { label: 'Connect all three relays first.', run() {} };
      if (r === fed && closed() === 2) return hold('Overload the trapped relay', 1.05, () => {
        exposed = Math.max(7, 11 - level * 0.26);
        hp = 5 + Math.floor(level / 2);
        core.place(r);
        core.root.visible = true;
        hooks.cue('crack', r);
        hooks.say('The core falls out. Destroy it while it is exposed.');
      });
      return press(r.open ? `Isolate relay ${r.id}` : `Reconnect relay ${r.id}`, () => {
        if (r === fed && r.open) hop(relays.find(other => other !== r && other.open));
        r.open = !r.open;
        hooks.cue('latch', r);
      });
    },
    targets() { return exposed > 0 ? [core] : []; },
    hit(item, damage) {
      hp -= damage;
      hooks.cue('stone', core);
      if (hp > 0) return;
      overloads++;
      if (overloads === 3) { encounter.won = true; return; }
      exposed = 0;
      core.root.visible = false;
      relays.forEach(r => { r.open = true; });
      hop(relays[(fed.id + 1) % relays.length]);
      hooks.say('The core cracks. The remaining charge runs to another relay.');
    },
    relocate(nextSites) {
      relays.forEach((r, i) => r.place(nextSites[i]));
      if (fed) core.place(fed);
    },
  };
  function hop(nextRelay) {
    if (!nextRelay) return;
    fed = nextRelay;
    next = Math.max(8, 23 - level * 0.73 - eaten * 0.4);
    blackout = 3.6;
    eaten = Math.min(7, eaten + 1);
    hooks.cue('buzz', fed);
  }
  return encounter;
}

export function createBellman(w, sites, level) {
  const { hooks } = w;
  const clocks = sites.slice(0, 5).map(p => {
    const clock = w.prop(p, { art: 'clock', width: 0.82, height: 1.55 });
    clock.pulse = w.part(clock.root, 0xb8a373, 0, 1.18, 0.05, 0.10, 0.10, 0.055, true);
    return clock;
  });
  const bell = w.prop(sites[5]);
  w.mark(bell, 0xa38b5b, 1.15);
  w.part(bell.root, 0x403638, 0, 0.77, 0, 0.1, 1.54, 0.14);
  w.part(bell.root, 0x6a5b47, 0, 1.52, 0, 0.52, 0.25, 0.48);
  w.part(bell.root, 0x92784f, 0, 1.37, 0, 0.59, 0.08, 0.52);
  const clapper = w.part(bell.root, 0xcfb476, 0, 1.28, 0, 0.09, 0.16, 0.09, true);
  const monster = w.prop(sites[6], { name: 'bellman', width: 1.13, height: 2.35 });
  let silent = 0, active = clocks[0], tick = 0, gait = 0, freeze = 0, blow = 0, beat = 0, finalTime = 0, lure = null;
  bell.root.visible = false;
  const period = Math.max(2.65, 3.65 - level * 0.09);
  const quiet = () => finalTime >= 1.36 && finalTime < period - 0.28;
  const encounter = {
    get status() { return silent === 3 ? `MASTER BELL · ${quiet() ? 'RING NOW' : 'WAIT FOR SILENCE'}` : `CLOCKS ${silent}/3 · FOLLOW THE PAIRED TICKS`; },
    get target() { return silent === 3 ? bell : active; },
    get hostiles() { return [monster]; },
    update(dt, p) {
      freeze = Math.max(0, freeze - dt); blow -= dt; gait -= dt;
      if (silent === 3) {
        const old = finalTime;
        finalTime = (finalTime + dt) % period;
        if (finalTime < old || (old < 1 && finalTime >= 1)) step(monster);
        clapper.visible = quiet();
      } else if ((tick -= dt) <= 0) {
        hooks.cue(silent === 0 ? 'clockLow' : silent === 1 ? 'clockMid' : 'clockHigh', active, 0.95);
        tick = Math.max(0.78, 1.5 - silent * 0.2 - level * 0.06);
        if (++beat % 3 === 0) step(monster);
        const decoy = clocks.find(c => c !== active && !c.off && c !== lure);
        if (decoy && beat % 4 === 1) hooks.cue('falseTick', decoy, 0.55);
        for (const c of clocks) c.pulse.visible = !c.off && c !== active;
      }
      if (active) active.pulse.visible = tick > (Math.max(0.78, 1.5 - silent * 0.2 - level * 0.06) - 0.35);
      if (gait > 0 && !freeze) {
        w.move(monster, dt, lure || p, 5.6 + level * 0.16);
        monster.pose('step');
        if (distance(monster, p) < 1.55 && w.clearLine(monster, p) && blow <= 0) {
          monster.pose('attack');
          hooks.cue('crack', monster);
          hooks.hurt(20 + level, 'bellman');
          blow = 2.55;
        }
      } else monster.pose('still');
    },
    action(p) {
      if (silent === 3) {
        if (!w.close(bell, p)) return null;
        return press(quiet() ? 'Ring the master bell' : 'Wait for the second footfall', () => {
          if (quiet()) ring();
          else hooks.say('Ring in the quiet after the second footfall.');
        });
      }
      const c = clocks.find(c => c.root.visible && w.close(c, p));
      if (!c) return null;
      if (c.off) return press('Wind the stopped clock as a lure', () => {
        lure = c;
        hooks.cue('falseTick', c);
      });
      return press('Stop this clock', () => {
        c.off = true;
        c.pulse.visible = false;
        hooks.cue('latch', c);
        if (c !== active) { freeze = 0; lure = null; step(monster); hooks.say('A decoy. You hear a footfall answer.'); return; }
        silent++;
        freeze = Math.max(3, 5.5 - level * 0.2);
        lure = null;
        if (silent === 3) {
          active = null;
          bell.root.visible = true;
          finalTime = 0;
          hooks.say('The master bell is ready. Wait for the pause after two footfalls.');
        } else {
          const options = clocks.filter(k => !k.off);
          // A premature stop cannot use up the supply of working clocks.
          if (options.length < 3 - silent) for (const k of clocks) {
            if (!k.correct && k !== c && k.off) { k.off = false; options.push(k); }
          }
          c.correct = true;
          active = options[hooks.random() * options.length | 0];
          tick = 0;
          hooks.say('The Bellman stops. Listen for the next clock.');
        }
      });
    },
    relocate(nextSites) {
      clocks.forEach((c, i) => c.place(nextSites[i]));
      bell.place(nextSites[5]);
      monster.place(nextSites[6]);
      monster.motor?.reset();
      lure = null;
    },
  };
  function step(signal) {
    hooks.cue('step', signal);
    if (!freeze) gait = 0.42 + level * 0.028;
  }
  function ring() {
    hooks.cue('bell', bell);
    encounter.won = true;
  }
  return encounter;
}
