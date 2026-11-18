const base = { fog: 0x000000, ambient: [0x000000, 0], ground: ['#292724'] };
export const HAZARD_MAPS = {
  cathedral: { ...base, label: 'THE SUNKEN SALT-CURED CATHEDRAL', ceiling: 6.6, fogDensity: 0.041, weather: 'drips',
    hint: 'Follow the flooded aisles to muffle your steps. Deep brine corrodes gear.' },
  accelerator: { ...base, label: 'THE PARTICLE ACCELERATOR', ceiling: 4.45, fogDensity: 0.038, beamRange: 30,
    hint: 'When the magnets hum, back away. The isolation switch cuts power to the sector.' },
  taxidermy: { ...base, label: 'THE NATURAL HISTORY ARCHIVE', ceiling: 4.4, fogDensity: 0.044,
    hint: 'Use the angled glass to look into the next aisle. The extraction fan clears the spill fumes.' },
  glasshouse: { ...base, label: 'THE OVERGROWN GLASSHOUSE', ceiling: 6.9, fogDensity: 0.058, beamRange: 28, weather: 'rain',
    hint: 'Move while rain drums on the glass. Look up when a roof panel starts to crack.' },
  offshore: { ...base, label: 'THE OFFSHORE BALLOON STATION', ceiling: 5.7, fogDensity: 0.038, weather: 'snow',
    hint: 'Warm up in the domes. Use the guide ropes to cross the catwalks during a squall.' },
  serverfarm: { ...base, label: 'THE SERVER FARM AND DATA VAULT', ceiling: 3.3, fogDensity: 0.042, beamRange: 32,
    hint: 'Watch the LEDs. Walk through the cold aisle or use the lowered cable bypass.' },
};

export const EXPOSED_ZONES = ['catwalk', 'iceYard'];
export const CATHEDRAL_DEPTH = { saltChannel: 0.13, brinePool: 0.47 };

export function buildHazardDistrict(name, room, ramp, at, rng) {
  const variant = Math.floor(rng() * 3);
  const sign = (i, j, text, face = 0) => at(i, j, 'sign', { face, text });
  const prop = (i, j, type, data = {}) => at(i, j, 'facilityProp', { prop: type, ...data });
  const danger = (i, j, kind, radius, extra = {}) => at(i, j, 'hazard', { kind, radius, ...extra });
  const control = (i, j, system, label, extra = {}) => at(i, j, 'control', { system, label, dx: 1.25, dz: 0.7, ...extra });
  const gate = (i, j, face, mode = 'locked') => at(i, j, 'gate', { face, style: 'security', mode });

  if (name === 'cathedral') {
    room(-3, -8, 3, -1, 'saltNave'); room(-1, -9, 1, -9, 'altar');
    room(-2, -7, -2, -2, 'saltChannel', -0.13); room(2, -7, 2, -2, 'saltChannel', -0.13);
    room(-7, -7 + variant, -5, -4 + variant, 'brinePool', -0.47);
    room(-4, -5 + variant, -3, -5 + variant, 'saltNave');
    room(4, -6, 7, -4, 'sacristy'); gate(3, -5, 1);
    at(1, -4, 'control', { gateI: 3, gateJ: -5, gateFace: 1, dx: 1.25, dz: 0.8, label: 'Crank the sacristy gate' });
    for (let j = -2; j >= -7; j--) for (const side of [-1, 1]) prop(side, j, 'pew');
    for (const side of [-1, 1]) prop(side, -8, 'saint');
    for (const j of [-3, -6]) danger(0, j, 'brineDrip', 1.15);
    danger(-3, -5 + variant, 'brineDrip', 1, { dx: -1 });
    at(6, -5, 'cache', { tier: 'red' });
    sign(0, -1, 'NAVE   /   FLOODED SIDE AISLES'); sign(-4, -5 + variant, 'CRYPT   /   DEEP BRINE', 3);
  } else if (name === 'accelerator') {
    // Vary the arc in both directions and bring the track back to the same seam at every district.
    const bend = variant === 0 ? -1 : 1, span = variant === 2 ? 5 : 4;
    for (let j = -12; j <= 11; j++) {
      const i = Math.round(bend * span * Math.sin(Math.PI * j / 11) ** 2 * Math.sign(j));
      room(i - 1, j, i + 1, j, 'beamRing');
      prop(i, j, 'magnet', { side: j % 2 === 0 ? 1 : -1 });
      if (j === -4 || j === 4) danger(i, j, 'magnet', 4.5, { dx: j % 2 === 0 ? 1.55 : -1.55 });
      if (j === 8) room(Math.min(i, 0), 8, Math.max(i, 0), 8, 'magnetService');
    }
    room(-12, 0, 11, 0, 'magnetService');
    room(-1, 0, 1, 1, 'magnetService');
    room(-8, 1, -6, 2 + variant, 'magnetService');
    control(0, 1, 'magnet', 'Isolate the sector magnets');
    sign(0, -1, 'BEAM RING   /   MAGNETIC FIELD');
    at(-7, 1, 'cache', { tier: 'blue' });
  } else if (name === 'taxidermy') {
    room(-3, -6, 3, -1, 'specimenHall'); room(-2, -9, 2, -7, 'specimenHall');
    room(-7, -7 + variant, -5, -2, 'jarStorage'); room(-4, -3, -3, -3, 'jarStorage');
    room(4, -7, 7, -3, 'jarStorage'); room(4, -2, 4, -1, 'jarStorage');
    for (let j = -2; j >= -8; j -= 2) {
      for (const side of [-1, 1]) prop(side, j, 'display', { animal: (j + variant + (side + 1) * 2 + 12) % 3 });
    }
    for (const i of [-6, 5, 7]) for (const j of [-3, -5]) prop(i, j, 'jars', { dx: 1.05 });
    danger(-5, -3, 'spill', 1.9); danger(4, -3, 'spill', 1.85); danger(0, -5, 'spill', 1.6);
    at(0, -3, 'hazard', { kind: 'reflection', dx: 1.65, radius: 1.35, peekX: 10.7, peekZ: -15.6, lookX: 10.5, lookZ: -24 });
    control(-2, -2, 'extractor', 'Start the archive extraction fan');
    sign(0, -1, 'COLLECTIONS   /   WEST STORAGE ←');
    at(5, -5, 'cache', { tier: 'blue' });
  } else if (name === 'glasshouse') {
    room(-4, -8, 4, -1, 'conservatory');
    room(-7, -7, -5, -4 + variant, 'fernery'); room(5, -7, 7, -5 + variant, 'fernery');
    room(-4, -8, -2, -6, 'fernery'); room(2, -8, 4, -6, 'fernery');
    room(2, 1, 5, 3, 'potting'); gate(3, 0, 2);
    at(2, 0, 'control', { gateI: 3, gateJ: 0, gateFace: 2, dx: 1.1, dz: -0.7, label: 'Wind open the potting shed' });
    for (const [i, j] of [[0,-2], [0,-5], [2,-4], [-2,-6]]) danger(i, j, 'roofGlass', 1.65, { delay: 1.1 + rng() * 1.1 });
    for (const [i, j] of [[-2,-3], [2,-3], [-4,-6], [4,-6]]) danger(i, j, 'pollen', 1.6);
    at(4, 2, 'cache', { tier: 'blue' }); sign(0, -1, 'TROPICAL HOUSE   /   UNSOUND ROOF');
  } else if (name === 'offshore') {
    room(-3, -2, 3, 2, 'radarDome'); room(-2, -3, 2, -3, 'radarDome');
    room(0, -7, 0, -4, 'catwalk'); room(-2, -10, 2, -8, 'balloonDome');
    room(-6, 0, -4, 0, 'catwalk'); room(4, 0, 7, 0, 'catwalk');
    room(-9, -2, -7, 2 + variant, 'balloonDome'); room(8, -2, 10, 2, 'radarDome');
    room(0, 3, 0, 6, 'catwalk'); room(0, 7, 0, 7, 'iceYard');
    const exposed = [[0,-7],[0,-6],[0,-5],[0,-4],[-5,0],[-6,0],[4,0],[5,0],[6,0],[7,0],[0,3],[0,4],[0,5],[0,6]];
    for (const [i,j] of exposed) {
      const alongX = i !== 0;
      prop(i, j, 'ropes', { alongX });
      danger(i, j, 'iceEdge', 2, { alongX });
      if ((Math.abs(i + j) + variant) % 3 === 0) prop(i, j, 'tarp', { alongX });
    }
    for (const [i,j] of [[-2,0],[0,-9],[9,0],[-8,-1]]) prop(i, j, 'radome');
    control(1, -2, 'beacon', 'Start the guide-rope beacons');
    sign(0, -3, 'OUTSIDE   /   STAY ON THE CENTRE ROPE');
    at(0, -10, 'cache', { tier: 'red' });
  } else {
    room(-2, -2, 2, 1, 'serverLobby'); room(-3, -8, 2, -3, 'serverGrid');
    room(3, -2, 6, -2, 'serverGrid'); room(3, -8, 7, -8, 'serverGrid');
    room(4, -7, 4, -3, 'coldAisle');
    room(6, -7, 6, -3, 'hotAisle');
    ramp(7, -8, 7, -8, 0, -0.8);
    room(7, -7, 7, -3, 'cableHatch', -0.8);
    ramp(7, -2, 7, -2, -0.8, 0);
    room(-7, -5, -5, -3 + variant, 'dataVault'); room(-4, -4, -3, -4, 'serverGrid');
    gate(4, -2, 0, 'lockdown'); gate(4, -7, 0, 'lockdown');
    danger(4, -5, 'halon', 2.6);
    control(4, -5, 'halon', 'Override the suppression lock', { hold: 1.5, dx: 1.34, dz: -0.45 });
    danger(6, -5, 'exhaust', 4.3);
    for (let j = -3; j >= -7; j--) for (const i of [-2, 0, 2]) prop(i, j, 'serverRack', { dx: i === 0 ? -1.22 : 0 });
    prop(4, -5, 'sensor'); prop(6, -5, 'serverRack', { dx: -0.5 });
    sign(4, -2, 'COLD AISLE   /   THERMAL INTERLOCK'); sign(7, -2, 'LOW CABLE BYPASS');
    at(-6, -4, 'cache', { tier: 'red' });
  }
}
