import { EXPOSED_ZONES } from './HazardDistricts.js';

const clamp = (n) => Math.max(0, Math.min(1, n));

export function createFacilityHazards(map, opened, hooks) {
  const name = map.name;
  const timers = new Map(), gas = new Map(), tracks = [];
  const state = {
    time: 0, zone: '', rain: 0, wind: 0, whiteout: 0, thermal: 1, air: 1, gassed: false,
    blind: 0, haze: 0, compass: 0, corrosion: 0, cough: 0, pinned: 0, shiver: 0,
    drop: null, peek: null, status: '', lastSafe: null,
  };
  let stepIn = 0, trackIn = 0, followIn = 0, symptomIn = 0, windIn = 3;
  let contaminated = 0, holdKey = '', holdTime = 0, pinTarget;
  const inRange = (h, p, extra = 0) => Math.hypot(h.x - p.x, h.z - p.z) < h.radius + extra;
  const system = (h, kind) => 'system:' + kind + ':' + h.sector;
  const disabled = (h, kind) => opened.has(system(h, kind));
  const shattered = (h) => opened.has(h.id);

  function timer(h) {
    let t = timers.get(h.id);
    if (!t) {
      if (timers.size >= 160) {
        for (const [key, item] of timers) if (item.seen < state.time - 30) timers.delete(key);
      }
      t = { ready: state.time + 1.3 + h.phase * 3.5, charge: 0, seen: state.time };
      timers.set(h.id, t);
    }
    t.seen = state.time;
    return t;
  }

  function noiseScale(x, z, kind = 'step') {
    const zone = map.zoneAt(x, z);
    if (name === 'cathedral' && kind === 'step') {
      return zone === 'saltChannel' || zone === 'brinePool' ? 0.18 : zone === 'saltNave' ? 1.95 : 1;
    }
    if (name === 'glasshouse') return 1 - state.rain * 0.8;
    if (name === 'offshore' && EXPOSED_ZONES.includes(zone)) return 1 - state.wind * 0.79;
    if (zone === 'cableHatch') return 0.17;
    return 1;
  }

  function resetSuppression(target) {
    const sector = target.slice('system:halon:'.length);
    const active = gas.get(sector);
    if (!active) return;
    for (const id of active.doors) opened.delete(id);
    gas.delete(sector);
    hooks.refresh();
    hooks.say('Emergency purge started. The containment doors release.');
  }

  const canInteract = (control) => !opened.has(control.target) &&
    (control.system !== 'halon' || gas.has(control.target.slice('system:halon:'.length)));

  function interact(control, dt, held) {
    if (!canInteract(control)) return null;
    if (!control.hold) return {
      label: '[E] ' + control.label,
      run() {
        opened.add(control.target);
        hooks.noise(control.x, control.z, 0.75 * noiseScale(control.x, control.z, 'door'), 'control');
        hooks.cue('switch', control);
        hooks.refresh();
        hooks.say({ magnet: 'Sector magnets isolated.', extractor: 'The fumes begin to clear.', beacon: 'The guide-rope beacons flicker on.' }[control.system]);
      },
    };
    if (holdKey !== control.target) { holdKey = control.target; holdTime = 0; }
    holdTime = held ? holdTime + dt : 0;
    if (holdTime >= control.hold) {
      opened.add(control.target);
      holdTime = 0;
      resetSuppression(control.target);
      return null;
    }
    return { label: '[Hold E] ' + control.label + (holdTime > 0 ? ' · ' + Math.round(100 * holdTime / control.hold) + '%' : ''), run() {} };
  }

  function smashOverride(origin, direction, reach, controls) {
    for (const control of controls) {
      if (control.system !== 'halon' || !canInteract(control)) continue;
      const dx = control.x - origin.x, dy = control.y + 1.08 - origin.y, dz = control.z - origin.z;
      const distance = dx * direction.x + dy * direction.y + dz * direction.z;
      if (distance < 0 || distance > reach || Math.hypot(dx, dy, dz) ** 2 - distance ** 2 > 0.32 ** 2 ||
          map.blocked(origin.x, origin.z, control.x, control.z, opened)) continue;
      opened.add(control.target);
      hooks.cue('shatter', control);
      resetSuppression(control.target);
      return true;
    }
    return false;
  }

  function localAction(p, near, yaw) {
    if (state.peek) return { label: '[E] Step away from the glass', run: () => { state.peek = null; } };
    if (state.drop && inRange(state.drop, p)) return {
      label: '[E] Recover the dropped ' + state.drop.label,
      run() { hooks.cue('switch', state.drop); state.drop = null; hooks.say('Recovered your gear.'); },
    };
    const glass = near.find(h => h.kind === 'reflection' && inRange(h, p) &&
      (h.x - p.x) * -Math.sin(yaw) + (h.z - p.z) * -Math.cos(yaw) > -0.35);
    return glass ? {
      label: '[E] Look around the corner in the glass',
      run() { state.peek = glass; hooks.cue('switch', glass); },
    } : null;
  }

  function update(dt, p, near) {
    state.time += dt;
    const t = state.time;
    const zone = state.zone = map.zoneAt(p.x, p.z);
    const exposed = EXPOSED_ZONES.includes(zone);
    const sector = map.sectorAt(p.x, p.z);
    state.blind = Math.max(0, state.blind - dt * 0.36);
    state.haze = Math.max(0, state.haze - dt * 0.65);
    state.compass = Math.max(0, state.compass - dt * 0.25);
    state.corrosion = Math.max(0, state.corrosion - dt * 0.21);
    state.pinned = Math.max(0, state.pinned - dt);
    if (state.pinned > 0 && pinTarget) hooks.pull(pinTarget, dt);
    if (p.moving) state.peek = null;
    const active = gas.get(sector);
    state.gassed = !!active && zone === 'coldAisle';
    state.air = clamp(state.air + dt * (state.gassed ? -0.24 : 0.5));
    if (state.gassed && state.air <= 0) hooks.damage(dt * 16, 'halon');
    if (name === 'glasshouse') {
      const phase = t % 24;
      state.rain += ((phase < 13 ? 1 : 0) - state.rain) * Math.min(1, dt * 2.2);
    } else if (name === 'offshore') {
      const interval = t % 27;
      const squall = interval > 12 && interval < 20;
      const gust = squall ? 1 : 0.34 + 0.32 * Math.sin(t * 1.23) + 0.13 * Math.sin(t * 3.5);
      state.wind = exposed ? clamp(gust) : 0;
      state.whiteout += ((exposed && squall ? 1 : 0) - state.whiteout) * Math.min(1, dt * 2.0);
      state.thermal = clamp(state.thermal + dt * (exposed ? -0.029 - state.wind * 0.024 : 0.12));
      state.shiver = clamp((0.64 - state.thermal) / 0.60);
      if (state.thermal <= 0) hooks.damage(dt * 5, 'cold');
      if (!exposed && zone !== '') state.lastSafe = { x: p.x, z: p.z };
      if (state.shiver > 0.24 && (windIn -= dt) <= 0) {
        hooks.cue('rattle', p);
        hooks.noise(p.x, p.z, state.shiver * (1 - state.wind * 0.48) + 0.25, 'rattling gear');
        windIn = 3.1 - state.shiver;
      }
    }
    if (zone === 'brinePool') {
      state.corrosion = Math.min(1, state.corrosion + dt * 0.85);
      hooks.stamina(-dt * 0.51);
      hooks.corrode(dt);
    }
    if (p.moving && (stepIn -= dt) <= 0) {
      if (zone === 'saltNave') hooks.noise(p.x, p.z, p.running ? 1.55 : 0.94, 'crunching salt');
      stepIn = p.running ? 0.34 : 0.56;
    }
    if (!p.moving) stepIn = 0;
    if (name === 'taxidermy') updateTracks(dt, p, sector);
    for (const h of near) updateHazard(h, dt, p, zone);
    state.status = state.gassed ? 'SUPPRESSION GAS · REACH THE OVERRIDE'
      : state.pinned > 0 ? 'MAGNETIC FIELD · PINNED'
      : state.whiteout > 0.7 ? 'WHITEOUT · FOLLOW THE ROPES'
      : state.shiver > 0.38 ? 'BODY HEAT ' + Math.round(state.thermal * 100) + '%'
      : contaminated > 0 ? 'CHEMICAL TRAIL'
      : zone === 'brinePool' ? 'DEEP BRINE · CORROSION'
      : state.compass > 0.35 ? 'POLLEN · BEARING UNRELIABLE'
      : state.drop ? 'GEAR LOST NEAR THE MAGNET'
      : name === 'glasshouse' ? state.rain > 0.56 ? 'RAIN MASKS MOVEMENT' : 'THE RAIN HAS STOPPED'
      : zone === 'cableHatch' ? 'CABLE BYPASS'
      : state.peek ? 'GLASS REFLECTION' : '';
  }

  function updateTracks(dt, p, sector) {
    contaminated = Math.max(0, contaminated - dt);
    while (tracks.length && (tracks.length >= 44 || state.time - tracks[0].at > 22)) tracks.shift();
    if (contaminated > 0 && p.moving && (trackIn -= dt) <= 0) {
      const side = tracks.length % 2 ? 1 : -1;
      tracks.push({ x: p.x + Math.cos(p.yaw) * side * 0.12, y: map.groundY(p.x, p.z), z: p.z - Math.sin(p.yaw) * side * 0.12, yaw: p.yaw, at: state.time });
      trackIn = p.running ? 0.28 : 0.46;
    }
    if (tracks.length && (followIn -= dt) <= 0) {
      const last = state.time - 1.25;
      const mark = tracks.findLast(track => track.at < last);
      if (mark) hooks.noise(mark.x, mark.z, 0.82, 'chemical trail');
      followIn = 1.4;
    }
    const vented = opened.has('system:extractor:' + sector);
    state.cough = clamp(state.cough + (state.zone === 'jarStorage' && !vented ? dt * 0.19 : -dt * 0.44));
    if (state.cough > 0.96) {
      state.cough = 0.32;
      hooks.cue('cough', p);
      hooks.noise(p.x, p.z, 1.23, 'coughing');
    }
  }

  function updateHazard(h, dt, p, zone) {
    if (h.kind === 'magnet' && disabled(h, 'magnet')) return;
    if (h.kind === 'reflection' || !inRange(h, p, h.kind === 'magnet' ? 5 : 0)) {
      const pending = timers.get(h.id);
      if (h.kind !== 'roofGlass' || shattered(h) || !pending?.charge) return;
    }
    if (h.kind === 'halon') {
      if ((p.running || p.hot) && !disabled(h, 'halon') && !gas.has(h.sector)) {
        gas.set(h.sector, h);
        for (const id of h.doors) opened.add(id);
        hooks.refresh();
        hooks.cue('gas', h);
        hooks.say('Thermal interlock tripped. Hold E at the emergency override.');
      }
    } else if (h.kind === 'exhaust') {
      state.haze = Math.max(state.haze, 0.54);
    } else if (h.kind === 'spill') {
      if (p.moving) contaminated = Math.max(contaminated, 10);
    } else if (h.kind === 'iceEdge') {
      const lateral = h.alongX ? p.z - h.z : p.x - h.x;
      if (Math.abs(lateral) > 1.48 && p.moving) {
        const t = timer(h);
        if (state.time >= (t.slipAt ?? 0) && (p.running || state.whiteout > 0.48 || Math.abs(lateral) > 1.77)) {
          hooks.cue('crack', h);
          hooks.say('You slipped off the edge. Follow the guide ropes.');
          hooks.damage(26, 'fall');
          hooks.reposition(state.lastSafe || { x: h.x, z: h.z });
          t.slipAt = state.time + 7;
        }
      }
    } else if (h.kind === 'brineDrip' || h.kind === 'pollen') {
      const t = timer(h);
      if (state.time >= t.ready && (h.kind === 'brineDrip' || p.moving)) {
        const brine = h.kind === 'brineDrip';
        t.ready = state.time + (brine ? 3.3 : 7);
        state.blind = brine ? 0.68 : 0.94;
        if (brine) {
          hooks.damage(8, 'brine');
          hooks.say('Brine splashes into your eyes.');
        } else {
          state.compass = 1;
          hooks.say('A cloud of pollen blinds you. Your bearing drifts.');
        }
        hooks.cue(brine ? 'drip' : 'pollen', h);
      }
    } else if (h.kind === 'roofGlass') {
      const t = timer(h);
      if (shattered(h)) {
        if (p.moving && state.time >= t.ready && state.time > symptomIn) {
          const volume = (p.running ? 1.82 : 1.14) * noiseScale(p.x, p.z, 'door');
          hooks.noise(p.x, p.z, volume, 'broken glass');
          hooks.cue('crack', h);
          t.ready = state.time + (p.running ? 0.32 : 0.58);
          symptomIn = state.time + 0.22;
        }
      } else if (!t.charge && (p.moving || state.rain > 0.7)) {
        t.charge = state.time + h.delay;
        hooks.cue('creak', h);
        hooks.say('The glass above you is cracking.');
      } else if (t.charge && state.time >= t.charge) {
        t.charge = 0;
        opened.add(h.id);
        hooks.refresh();
        hooks.cue('shatter', h);
        hooks.noise(h.x, h.z, 2.5, 'falling glass');
        if (inRange(h, p)) hooks.damage(42, 'fallingGlass');
        t.ready = state.time + 0.5;
      }
    } else if (h.kind === 'magnet') {
      const t = timer(h);
      if (!t.charge && state.time >= t.ready) {
        t.charge = state.time + 1.4;
        hooks.cue('hum', h);
        hooks.say('A magnet is charging. Get clear.');
      } else if (t.charge && state.time >= t.charge) {
        t.charge = 0;
        t.ready = state.time + 9 + h.phase * 7;
        hooks.cue('surge', h);
        hooks.noise(h.x, h.z, 1.3, 'surge');
        if (!inRange(h, p)) return;
        if (p.metalArmor) {
          pinTarget = h;
          state.pinned = 2.45;
          hooks.damage(12, 'magnet');
          hooks.say('The field has pinned your armor.');
        } else if (!state.drop && p.metalGear) {
          const x = h.x - Math.sign(h.dx) * 0.95;
          state.drop = { ...p.metalGear, x, z: h.z, y: map.groundY(x, h.z), radius: 1.8 };
          hooks.say('The magnet tore the ' + state.drop.label + ' from your hand.');
        }
      }
    }
  }

  function resetHold() { holdKey = ''; holdTime = 0; }
  return { state, tracks, gas, update, noiseScale, canInteract, interact, localAction, resetHold, smashOverride };
}
