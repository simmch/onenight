import { distance, press, hold } from './EncounterWorld.js';

function crosses(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

export function createSeamstress(w, sites, level) {
  const { hooks } = w;
  const webs = sites.slice(0, 4).map((p, i) => {
    const web = w.prop(p, { art: 'web', width: i === 3 ? 2.45 : 1.75, height: i === 3 ? 1.85 : 1.4 });
    const post = w.part(web.root, 0xa07862, 0, 1.04, 0, 0.12, 0.12, 0.12, true);
    const ring = w.mark(web, 0xb0968b, 0.9);
    web.bin = w.part(web.root, 0x685543, -0.42, 0.12, 0, 0.22, 0.22, 0.28);
    web.post = post;
    web.ring = ring;
    return web;
  });
  const nest = webs[3];
  nest.root.visible = false;
  const watcher = w.prop(sites[0], { name: 'seamstress', width: 1.45, height: 1.55 });
  watcher.root.visible = false;
  const strands = Array.from({ length: 6 + Math.floor(level / 2) }, () => {
    const prop = w.prop(sites[0], { width: 0.3, height: 1.3 });
    const wire = w.part(prop.root, 0x706362, 0, 0.7, 0, 0.015, 0.017, 1, true);
    return { prop, wire, a: null, b: null };
  });
  let count = 0, tied = 0, previous = null, nextPull = 0, nextClick = 0, snareCooldown = 0, active = webs[0];
  const encounter = {
    get status() { return tied ? `THREADS ${tied} · ${count}/3 ANCHORS · BURN OR CUT THEM` : count === 3 ? 'BURN THE NEST' : `ANCHORS ${count}/3 · FOLLOW THE WEB`; },
    get target() { return active; },
    get hostiles() { return watcher.root.visible ? [watcher] : []; },
    get drag() { return Math.max(0.46, 1 - tied * 0.16); },
    update(dt, p) {
      snareCooldown = Math.max(0, snareCooldown - dt);
      active = count === 3 ? nest : webs.slice(0, 3).filter(s => !s.burned).sort((a, b) => distance(a, p) - distance(b, p))[0];
      for (const web of webs) {
        web.ring.material.opacity = 0.42 + 0.3 * (0.5 + Math.sin(p.time * 3.4) * 0.5);
        web.post.scale.setScalar(0.1 + 0.03 * Math.sin(p.time * 5));
      }
      for (const line of strands) {
        if (!line.prop.root.visible) continue;
        line.wire.visible = p.camera || (p.beam && w.seen(line.prop, p, 15, 0.62)) || (p.match && distance(line.prop, p) < 6);
        if (!previous || !line.a || snareCooldown || tied >= 3 || !crosses(previous, p, line.a, line.b)) continue;
        tied++;
        snareCooldown = 0.32;
        line.prop.root.visible = false;
        hooks.cue('thread', line.prop);
        hooks.say(tied === 1 ? 'A thread catches. Hold E with a match lit to burn it.' : 'The threads start to pull.');
      }
      previous = { x: p.x, z: p.z };
      if (nextClick <= 0 && distance(active, p) < 27) { hooks.cue('thread', active, 0.75); nextClick = 2.1; }
      nextClick -= dt;
      nextPull -= dt;
      watcher.place(active);
      const roof = w.world.roofY?.(active.x, active.z);
      const height = Number.isFinite(roof) && roof > watcher.root.position.y + 1.5
        ? Math.min(3.15, roof - watcher.root.position.y) : 3.05;
      watcher.skin.position.y = Math.max(0.55, height - 1.58) - (tied >= 2 ? 0.42 : 0);
      watcher.root.visible = tied > 0 || (distance(active, p) < 8 && p.beam);
      watcher.pose(tied >= 2 ? 'attack' : 'still');
      if (tied >= 2 && nextPull <= 0) {
        hooks.tug(active, 0.34 + tied * 0.12);
        hooks.cue('thread', p);
        if (tied === 3) hooks.hurt(8 + level, 'seamstress');
        nextPull = Math.max(1, 2.4 - level * 0.07);
      }
    },
    action(p) {
      const web = webs.find(s => s.root.visible && w.close(s, p, 1.95));
      if (web) {
        if (!p.match) return press('Take a match from the wax tin', () => hooks.match());
        return hold(web === nest ? 'Burn the nest' : 'Burn the anchor', web === nest ? 2.15 : 1.22, () => {
          burn(web);
          tied = Math.max(0, tied - 1);
        });
      }
      if (tied && p.match) return hold('Burn the threads on your sleeves', 0.55, release);
      return null;
    },
    noise(point, amount) {
      if (tied && amount >= 0.8 && amount <= 1.1 && distance(point, active) < 9) release();
    },
    targets(melee) {
      return melee ? [...webs.slice(0, 3).filter(s => !s.burned), ...strands.map(s => s.prop)] : [];
    },
    hit(item) {
      if (webs.includes(item)) burn(item);
      else item.root.visible = false;
      if (tied) release();
    },
    cut() { if (tied) release(); },
    relocate(next) {
      webs.forEach((s, i) => s.place(next[i]));
      tied = 0;
      previous = null;
      weave();
    },
  };
  function release() {
    tied = 0;
    hooks.cue('crack', active, 0.55);
  }
  function burn(web) {
    if (web.burned) return;
    web.burned = true;
    web.root.visible = false;
    hooks.cue('crack', web);
    if (web === nest) { hooks.parts(2); encounter.won = true; return; }
    count++;
    if (count === 3) nest.root.visible = true;
    hooks.say(count === 3 ? 'The main web collapses. Burn the nest.' : 'An anchor comes loose.');
    weave();
  }
  function weave() {
    const anchors = count === 3 ? [nest] : webs.slice(0, 3).filter(a => !a.burned);
    strands.forEach((line, i) => {
      const web = anchors[i % anchors.length], a = i * 2.4 + 0.5;
      const offset = 1.35 + Math.floor(i / anchors.length) % 4 * 0.82;
      line.prop.place({ x: web.x + Math.cos(a) * offset, z: web.z + Math.sin(a) * offset });
      const span = 1.42 + (i % 3) * 0.38;
      const dx = Math.sin(a) * span, dz = -Math.cos(a) * span;
      line.a = { x: line.prop.x - dx, z: line.prop.z - dz };
      line.b = { x: line.prop.x + dx, z: line.prop.z + dz };
      line.prop.root.rotation.y = Math.atan2(dx, dz);
      line.wire.scale.z = span * 2;
      line.prop.width = span * 2;
      line.prop.root.visible = w.world.walkable(line.prop.x, line.prop.z, 0.2) && w.clearLine(line.a, line.b);
    });
  }
  weave();
  return encounter;
}

export function createCounterfeit(w, sites, level) {
  const { hooks } = w;
  const props = ({
    forest: ['chest', 'crate', 'stump'], swamp: ['chest', 'barrel', 'log'], cave: ['chest', 'barrel', 'minecart'],
    cathedral: ['chest', 'coffin', 'gargoyle'], school: ['chest', 'crate', 'cabinet'],
    taxidermy: ['chest', 'crate', 'skeleton'], snow: ['chest', 'sled', 'snowman'],
  })[hooks.map] || ['chest', 'crate', 'cabinet'];
  const decoys = props.map((art, i) =>
    w.prop(sites[i], { art, width: 1.2, height: i === 2 ? 1.55 : 0.85 }));
  const landmark = w.prop(sites[3], { art: hooks.map === 'forest' ? 'well' : 'obelisk', width: 1.55, height: 2.2 });
  const mimic = w.prop(sites[0], { name: 'counterfeit', width: 1.47, height: 1.6 });
  let brood = 0, real, exposed = 0, hp = 4, checked = new Set(), grabbed = 0, attack = 0, elapsed = 0, nextCue = 1;
  let homes = sites;
  // Extra copies wait inside ordinary chests in the world (main.js decides which). They look like any chest, and
  // come out biting the moment the lid is lifted.
  const lurkers = [];
  function updateLurkers(dt, p) {
    for (let i = lurkers.length - 1; i >= 0; i--) {
      const m = lurkers[i];
      if (m.dead) { if ((m.fade -= dt) <= 0) { m.root.visible = false; lurkers.splice(i, 1); } continue; }
      m.attack -= dt;
      if (m.attack < 0.2) w.move(m, dt, p, 2.3 + 0.12 * level);
      m.pose(m.attack > 0.6 ? 'attack' : Math.sin(p.time * 11 + i) > 0 ? 'still' : 'step');
      if (m.attack <= 0 && distance(m, p) < 1.45 && w.clearLine(m, p)) {
        hooks.hurt(11 + level, 'counterfeit'); hooks.cue('crack', m); m.attack = 1.7;
      }
    }
  }
  const encounter = {
    chestTrap(x, z, p) {
      const toward = p ? Math.atan2(p.x - x, p.z - z) : 0;
      const m = w.prop({ x: x + Math.sin(toward) * 0.5, z: z + Math.cos(toward) * 0.5 }, { name: 'counterfeit', width: 1.3, height: 1.4 });
      m.hp = 2 + Math.floor(level / 2); m.attack = 0.35; m.dead = false; m.fade = 0;
      m.pose('attack'); lurkers.push(m);
      hooks.cue('crack', m);
      hooks.say('The chest opens its mouth. Shoot it.');
    },
    get lurkers() { return lurkers.filter(m => !m.dead).length; },
    get status() { return (lurkers.some(m => !m.dead) ? 'A CHEST BITES · ' : '') + (grabbed > 0 ? 'HOLD E TO PRY IT OPEN' : exposed > 0 ? `COUNTERFEIT ${Math.min(brood + 1, 4)}/4 · ${hp} HP` : brood === 3 ? 'FIND THE FALSE LANDMARK' : `COPIES ${brood}/3 · INSPECT THE PROPS`); },
    get target() { return exposed > 0 ? mimic : brood === 3 ? landmark : decoys.find(s => !checked.has(s)); },
    get hostiles() { return [exposed > 0 ? mimic : real, ...lurkers.filter(m => !m.dead)]; },
    update(dt, p) {
      elapsed = p.time;
      updateLurkers(dt, p);
      if ((nextCue -= dt) <= 0) {
        hooks.cue(exposed > 0 ? 'stone' : 'mimic', exposed > 0 ? mimic : real, 0.8);
        nextCue = 2.3;
      }
      if (exposed <= 0) {
        const tell = (p.camera || p.match || distance(p, real) < 3.1) && w.seen(real, p, p.match ? 7 : 26, 0.72);
        real.skin.position.x = tell ? 0.14 * Math.sin(elapsed * 10) : 0;
        real.skin.scale.x = real.width * (1 + (tell ? 0.11 : 0.025) * Math.sin(elapsed * 6));
        return;
      }
      if (grabbed > 0) {
        if (distance(mimic, p) > 2.5) grabbed = 0;
        else if ((grabbed -= dt) <= 0) {
          hooks.hurt(17 + level, 'counterfeit');
          attack = 1.5;
        }
        return;
      }
      attack -= dt;
      if ((exposed -= dt) <= 0 && brood < 3) { hide(false); return; }
      if (brood === 3) exposed = 999;
      if (attack < -0.2) w.move(mimic, dt, p, 2.05 + 0.13 * level);
      mimic.pose(attack > 0.7 ? 'attack' : Math.sin(elapsed * 11) > 0 ? 'still' : 'step');
      if (attack <= 0 && distance(mimic, p) < 1.35 && w.clearLine(mimic, p)) {
        hooks.hurt(14 + level, 'counterfeit'); hooks.cue('crack', mimic); attack = 1.8;
      }
    },
    action(p) {
      if (exposed > 0) {
        if (!w.close(mimic, p, 2.3)) return null;
        if (grabbed > 0) return hold('Pry its jaws open', 0.4, () => { grabbed = 0; attack = 1.2; encounter.hit(mimic, 2); });
        return hold('Strike the exposed copy', 0.64, () => { attack = Math.max(attack, 0.65); encounter.hit(mimic, 2); });
      }
      const obj = (brood === 3 ? [landmark] : decoys).find(s => s.root.visible && !checked.has(s) && w.close(s, p));
      if (!obj) return null;
      if (obj === real && (p.match || p.camera)) return press('Expose the breathing prop', () => reveal(false));
      return press(brood === 3 ? 'Inspect the landmark' : 'Search the prop', () => {
        if (obj === real) reveal(true);
        else { checked.add(obj); hooks.cue('latch', obj, 0.65); hooks.say('Dust inside. This one is empty.'); }
      });
    },
    targets() { return [...(exposed > 0 ? [mimic] : brood === 3 ? [landmark] : decoys), ...lurkers.filter(m => !m.dead)]; },
    hit(item, damage) {
      if (lurkers.includes(item)) {
        if (item.dead) return;
        item.hp -= damage; hooks.cue('stone', item);
        if (item.hp <= 0) { item.dead = true; item.fade = 0.5; item.pose('still'); hooks.parts(2); hooks.say('The false chest is still. +2 parts'); }
        return;
      }
      if (item === real && exposed <= 0) { reveal(false); return; }
      if (item !== mimic) { checked.add(item); hooks.cue('stone', item); return; }
      hp -= damage;
      hooks.cue('stone', mimic);
      if (hp > 0) return;
      hooks.parts(1);
      if (brood === 3) { encounter.won = true; return; }
      brood++;
      hide(true);
      hooks.say(brood === 3 ? 'The last copy points to the landmark. Find the source.' : 'One copy falls. Fresh props appear nearby.');
    },
    relocate(next) {
      homes = next;
      if (exposed > 0) mimic.place(next[0]);
      decoys.forEach((obj, i) => obj.place(homes[(brood * 2 + i) % homes.length]));
      landmark.place(homes[3]);
    },
  };
  function reveal(trap) {
    mimic.place(real);
    mimic.root.visible = true;
    real.root.visible = false;
    exposed = 10 + (trap ? 2 : 0);
    grabbed = trap ? 1.8 : 0;
    attack = 1.2;
    hooks.cue('crack', mimic);
    hooks.say(trap ? 'It has your hands. Hold E or pull away.' : 'Its disguise splits. Strike while it is exposed.');
  }
  function hide(fresh) {
    exposed = grabbed = 0;
    mimic.root.visible = false;
    checked = new Set();
    landmark.root.visible = brood === 3;
    decoys.forEach((obj, i) => {
      obj.place(homes[(brood * 2 + i) % homes.length]);
      obj.root.visible = brood < 3;
    });
    const choices = decoys.filter(obj => obj !== real);
    real = brood === 3 ? landmark : choices[hooks.random() * choices.length | 0];
    if (fresh) hp = (brood === 3 ? 10 : 4) + level;
  }
  hide(true);
  return encounter;
}
