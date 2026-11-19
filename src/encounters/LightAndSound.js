import { distance, press, hold } from './EncounterWorld.js';

// The Wick Eater, made plain: power the three relays, then whichever one is buzzing (it flickers bright and its ring
// pulses) is where it hides. Hold E on that one to overload it, and shoot the core that falls out. Two cores and it is gone.
// It moves to another relay now and then, but never while you are standing near the one it is in.
// In the dark, close to its relay, it can reach you; keep a light on and it cannot.
const WICK = { cores: 2, strikeAfter: 3.0, strikeEvery: 5.0, exposed: [13, 9] };
// Wicklings: the closer you are to finishing it, the more of itself it pushes out of the walls at you.
// [seconds between, most alive at once] for: relays powered / one core gone / the last core exposed.
const CRAWL = { waves: [[18, 1], [8, 3], [5, 3]], speed: 2.2, bite: 8, reach: 1.3, near: 3.5, far: 10 };
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
    return relay;
  });
  const core = w.prop(sites[0], { name: 'wickeater', width: 1.2, height: 1.02 });
  core.root.visible = false;
  let fed = null, next = 0, cue = 0, darkness = 0, strike = 0, exposed = 0, hp = 0, overloads = 0, blackout = 0;
  const ready = () => relays.every(r => r.powered);
  const crawlers = [];
  let crawlIn = 6;
  const alive = () => crawlers.filter(c => !c.dead);
  // Somewhere on a wall near you: walk out from the player in a few directions and stop at the first thing solid.
  function wallSpot(p) {
    const world = w.world;
    for (let tries = 0; tries < 14; tries++) {
      const a = Math.random() * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      let last = null;
      for (let d = 1; d <= CRAWL.far; d += 0.5) {
        const x = p.x + sx * d, z = p.z + sz * d;
        if (!world.walkable(x, z, 0.3) || world.losBlocked(p.x, p.z, x, z, true)) break;
        last = { x, z, d };
      }
      if (last && last.d >= CRAWL.near && last.d < CRAWL.far - 0.5) return last;   // it stopped at a wall, not in open air
    }
    const a = Math.random() * Math.PI * 2;                       // no wall in reach: it comes up out of the floor instead
    const x = p.x + Math.sin(a) * 6, z = p.z + Math.cos(a) * 6;
    return world.walkable(x, z, 0.3) ? { x, z } : null;
  }
  function spawnCrawler(p) {
    const at = wallSpot(p);
    if (!at) return;
    const c = w.prop(at, { name: 'wickling', width: 1.05, height: 0.95 });
    c.hp = 1 + Math.floor(level / 4); c.bite = 0.9; c.emerge = 0; c.dead = false; c.fade = 0;
    c.skin.scale.x = 0.05;
    crawlers.push(c);
    hooks.cue('crack', c, 0.9);
  }
  function updateCrawlers(dt, p) {
    const stage = !ready() ? -1 : exposed > 0 && overloads === WICK.cores - 1 ? 2 : Math.min(1, overloads);
    if (stage >= 0 && (crawlIn -= dt) <= 0) {
      const [every, most] = CRAWL.waves[stage];
      crawlIn = Math.max(3, every - level * 0.4);
      if (alive().length < most + Math.floor(level / 5)) spawnCrawler(p);
    }
    for (let i = crawlers.length - 1; i >= 0; i--) {
      const c = crawlers[i];
      if (c.dead) { c.fade -= dt; c.skin.scale.y = c.height * Math.max(0, c.fade / 0.4); if (c.fade <= 0) { c.root.visible = false; crawlers.splice(i, 1); } continue; }
      if (c.emerge < 0.7) {                                         // tearing itself out of the wall
        c.emerge += dt; c.skin.scale.x = c.width * Math.min(1, c.emerge / 0.7); c.pose('attack'); continue;
      }
      c.bite -= dt;
      const lit = p.beam && !p.match && w.seen(c, p, 10, 0.93);    // a light on it slows it down
      if (c.bite < 0.3) w.move(c, dt, p, (CRAWL.speed + level * 0.1) * (lit ? 0.5 : 1));
      c.pose(c.bite > 0.5 ? 'attack' : Math.sin(p.time * 12 + i) > 0 ? 'still' : 'step');
      if (c.bite <= 0 && distance(c, p) < CRAWL.reach && w.clearLine(c, p)) {
        hooks.hurt(CRAWL.bite + Math.round(level * 0.5), 'wickeater'); hooks.cue('crack', c, 0.7); c.bite = 1.5;
      }
    }
  }
  const encounter = {
    get status() {
      const lings = alive().length ? ` · ${alive().length} IN THE WALLS` : '';
      if (exposed > 0) return `SHOOT THE CORE · ${hp} HP · CORES ${overloads}/${WICK.cores}${lings}`;
      if (!ready()) return `POWER THE RELAYS ${relays.filter(r => r.powered).length}/3`;
      return `OVERLOAD THE BUZZING RELAY (${fed.id}) · CORES ${overloads}/${WICK.cores}${lings}`;
    },
    get target() {
      if (exposed > 0) return core;
      return relays.find(r => !r.powered) || fed;
    },
    get hostiles() { return [core.root.visible ? core : fed, ...alive()].filter(Boolean); },
    get power() { return blackout > 0 ? 0.14 : 1; },
    update(dt, p) {
      strike -= dt;
      blackout = Math.max(0, blackout - dt);
      updateCrawlers(dt, p);
      for (const r of relays) {
        const flick = Math.sin(p.time * 13) > -0.2;
        const isFed = r === fed && ready() && exposed <= 0;
        r.light.intensity = !r.powered ? 0 : isFed ? (flick ? 26 : 9) : 6;     // the buzzing relay is the bright, flickering one
        r.ring.material.opacity = isFed ? 0.62 + 0.3 * Math.sin(p.time * 7) : r.powered ? 0.22 : 0.4;
        for (const dot of r.indicators) dot.visible = !isFed || flick;
      }
      if (exposed > 0) {
        core.pose('attack');
        exposed -= dt;
        if (exposed <= 0) {
          core.root.visible = false;
          hooks.say(`The core slips back into relay ${fed.id}. Overload it again.`);
        }
        return;
      }
      if (!fed) return;
      if ((cue -= dt) <= 0) { hooks.cue('buzz', fed, 0.83); cue = 1.35; }
      const near = distance(fed, p);
      const dark = near < 6.2 && w.clearLine(fed, p) && !p.match && !p.beam && (!p.roomLit || blackout > 0);
      darkness = dark ? darkness + dt : Math.max(0, darkness - dt * 2);
      if (darkness > WICK.strikeAfter && strike <= 0) {
        core.place(fed); core.root.visible = true; core.pose('attack');
        hooks.cue('crack', fed);
        hooks.hurt(10 + Math.round(level * 0.6), 'wickeater');
        hooks.say('It reaches out of the dark. Keep a light on near the relay.');
        strike = WICK.strikeEvery; darkness = 0;
      } else if (strike < WICK.strikeEvery - 0.35) core.root.visible = false;
      if (near < 4 && w.clearLine(fed, p) && p.beam && !p.match) hooks.drain(dt * 0.3);
      if (!ready() || (next -= dt) > 0) return;
      if (near < 8) { next = 2; return; }                       // never slips away while you are right there
      const others = relays.filter(r => r !== fed);
      hop(others[(Math.random() * others.length) | 0]);
    },
    action(p) {
      if (exposed > 0 && w.close(core, p, 1.8)) return hold('Crush the exposed core', 0.62, () => encounter.hit(core, 3));
      const r = relays.find(r => w.close(r, p));
      if (!r || exposed > 0) return null;
      if (!r.powered) return press(`Power relay ${r.id}`, () => {
        r.powered = true;
        hooks.cue('latch', r);
        if (ready()) {
          hop(relays[(Math.random() * 3) | 0], false);
          hooks.say(`Relay ${fed.id} is buzzing: that is where it hides. Hold E on it to force the core out.`);
        }
      });
      if (!ready()) return { label: 'Power all three relays first', run() {} };
      if (r !== fed) return { label: `Relay ${r.id} is quiet. Find the buzzing one (${fed.id})`, run() {} };
      return hold('Overload the buzzing relay', 0.9, () => {
        exposed = Math.max(WICK.exposed[1], WICK.exposed[0] - level * 0.3);
        hp = 3 + Math.floor(level / 3);
        core.place(r);
        core.root.visible = true;
        hooks.cue('crack', r);
        hooks.say('The core falls out. Shoot it before it climbs back in.');
      });
    },
    targets() { return [...(exposed > 0 ? [core] : []), ...alive()]; },
    hit(item, damage) {
      if (crawlers.includes(item)) {
        if (item.dead || item.emerge < 0.3) return;
        item.hp -= damage; hooks.cue('stone', item, 0.7);
        if (item.hp <= 0) { item.dead = true; item.fade = 0.4; }
        return;
      }
      if (exposed <= 0) return;
      hp -= damage;
      hooks.cue('stone', core);
      if (hp > 0) return;
      overloads++;
      exposed = 0;
      core.root.visible = false;
      if (overloads >= WICK.cores) { for (const c of crawlers) { c.dead = true; c.fade = 0.4; } encounter.won = true; return; }
      const others = relays.filter(r => r !== fed);
      hop(others[(Math.random() * others.length) | 0]);
      hooks.say(`One core is gone. Relay ${fed.id} starts to buzz. One more. Something is moving in the walls.`);
      crawlIn = 1.5;
    },
    relocate(nextSites) {
      relays.forEach((r, i) => r.place(nextSites[i]));
      if (fed) core.place(fed);
    },
    debug: { wallSpot, crawlers },
  };
  function hop(nextRelay, dim = true) {
    if (!nextRelay) return;
    fed = nextRelay;
    next = Math.max(14, 26 - level * 0.6);
    if (dim) blackout = 2;
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
