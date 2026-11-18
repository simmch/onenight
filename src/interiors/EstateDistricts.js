// District interiors vary with the seed. The two through corridors always align at their edges.
const base = { fog: 0x000000, ambient: [0x000000, 0], ground: ['#292724'] };
export const ESTATE_META = {
  prison: { ...base, label: 'THE DECOMMISSIONED PRISON', ceiling: 4.2, fogDensity: 0.036,
    hint: 'Use the control booth to lift the gates. The catwalk and west bypass stay open.' },
  manor: { ...base, label: 'THE SHIFTING MANOR', ceiling: 3.85, fogDensity: 0.039,
    hint: 'Hold E to move a heavy door. Look for a loose book in the west parlor.' },
  apartments: { ...base, label: 'THE CONCRETE ESTATE', ceiling: 3.35, fogDensity: 0.038,
    hint: 'Follow the stairwell numbers. Hold E to breach a boarded flat. The noise carries.' },
  school: { ...base, label: 'THE STORMBOUND BOARDING SCHOOL', ceiling: 3.7, fogDensity: 0.034, weather: 'rain',
    hint: 'Use the equipment lever to open the gym shortcut. Hide behind lockers and bleachers.' },
};

export const ESTATE_POWER = {
  prison: [[0, -4, 1, -1], [2, -6, 3, -5]],
  manor: [[-1, -2, 0, 0], [-4, -4, -3, -4]],
  apartments: [[-1, -2, 0, 1], [-3, -6, -3, -5]],
  school: [[0, -2, 1, 0], [3, -7, 4, -4]],
};

export function buildEstate(name, room, ramp, at, rng, district) {
  const n = String(1 + Math.floor(rng() * 89)).padStart(2, '0');
  const gate = (x, z, face, style = 'security', mode = 'locked') => at(x, z, 'gate', { face, style, mode });
  const lever = (x, z, gateI, gateJ, gateFace, label, dx = 1.15) =>
    at(x, z, 'control', { gateI, gateJ, gateFace, label, dx, dz: 0.6 });
  const sign = (x, z, text, face = 0, dy = 2.45) => at(x, z, 'sign', { text, face, dy });
  const variant = Math.floor(rng() * 3);

  if (name === 'prison') {
    room(-2, -8, 2, -5, 'cellblock');
    room(0, -4, 0, -2, 'cellblock');
    room(-3, -9, -3, -1, 'service'); room(-3, -9, 0, -9, 'service'); room(-3, -1, 0, -1, 'service');
    for (const z of [-7, -5, -3]) {
      room(-5, z, -4, z, 'cell'); gate(-3, z, 3, 'bars', z === -5 ? 'locked' : 'swing');
      at(-5, z, 'bed', { dx: -0.95 }); at(-4, z, 'prop', { kind: 'toilet', dx: 1.25, dz: 1.05, w: 0.6, h: 0.72 });
    }
    room(3, -8, 3, -4, 'gallery', 3.45); ramp(3, -3, 3, -1, 3.45, 0);
    room(2, -6, 2, -5, 'tower', 3.45);
    at(2, -5, 'tower'); at(2, -6, 'tower');
    room(4, -8 + variant, 5, -6 + variant, 'guard', 3.45);
    room(-8, 1, -6, 3 + variant, 'service'); room(-7, 0, -7, 1, 'service');
    at(-7, 2 + variant, 'lockers', { dx: 1.2, dz: -1.18 });
    room(1, -1, 2, -1, 'guard');
    room(1, -2, 1, -2, 'guard');
    gate(0, -4, 0, 'bars');
    lever(1, -2, 0, -4, 0, 'Pull the cellblock gate lever', -1.0);
    lever(-3, -4, -3, -5, 3, 'Release the isolation cell', 1.2);
    at(-5, -5, 'cache', { tier: 'blue' });
    at(1, -2, 'console', { dx: 1.25, dz: -1.25 });
    sign(0, -1, 'BLOCK ' + n + '   /   WEST BYPASS ←');
    sign(3, -5, 'GUARD CATWALK', 1);
    sign(-3, -5, 'ISOLATION', 3);
  } else if (name === 'manor') {
    room(-1, -2, 1, 1, 'foyer');
    room(-5, -5, -2, -2, 'parlor'); room(2, -5, 5, -2, 'parlor');
    room(1, -3, 1, -3, 'parlor'); room(-1, -3, -1, -3, 'parlor');
    room(-7, -8, -7, -2, 'servant'); room(-7, -2, -6, -2, 'servant');
    room(-7, -8, -2, -8, 'servant'); room(-2, -8, 0, -8, 'service');
    room(-4 - variant, -7, -2 - variant, -6, 'wardrobe');
    room(4, -8, 8, -7, 'parlor'); room(8, -7, 8, -1, 'servant'); room(8, -1, 8, 0, 'service');
    gate(1, -3, 1, 'wood', 'heavy'); gate(-1, -3, 3, 'wood', 'heavy'); gate(-5, -2, 3, 'shelf');
    lever(-5, -3, -5, -2, 3, 'Pull the loose book', -1.25);
    at(-5, -3, 'prop', { kind: 'shelf', dx: -1.55, dz: 0.6, w: 1.05, h: 2.3 });
    at(-4, -3, 'parlor'); at(3, -3, 'parlor'); at(5, -7, 'parlor');
    at(-6, -8, 'cache', { tier: 'red' });
    at(5, -4, 'transition', { face: 1, toI: 5 + variant, toJ: -7, yaw: Math.PI, label: 'Open the door with the warm brass handle', text: 'The corridor has moved.' });
    at(8, -7, 'transition', { face: 0, toI: -6, toJ: -8, yaw: -Math.PI / 2, label: 'Turn the key in the mirror frame', text: 'You hear the door close a floor away.' });
    sign(0, -1, 'THE WEST PARLOR  ←'); sign(-7, -7, 'SERVANTS', 3);
  } else if (name === 'apartments') {
    room(-1, -1, 1, 1, 'lobby');
    room(-3, -2, -1, -2, 'landing'); ramp(-3, -5, -3, -3, 3.25, 0);
    room(-3, -10, -3, -6, 'landing', 3.25);
    room(-6, -10, -4, -9, 'flat', 3.25); room(-6, -7, -4, -6, 'flat', 3.25);
    gate(-3, -9, 3, 'wood', 'breach'); gate(-3, -6, 3, 'wood', 'breach');
    for (const z of [-3, -6, -9]) {
      room(1, z, 1, z, 'landing'); room(2, z - 1, 4 + variant, z, 'flat');
      gate(1, z, 1, 'wood', 'breach');
      at(3, z - 1, 'apartment'); at(3, z, 'cache', { tier: rng() < 0.22 ? 'red' : 'blue' });
      sign(1, z, 'FLAT ' + n + String(-z), 1);
    }
    room(-8, 0, -6, 0, 'service'); room(-8, -5, -8, -1, 'service');
    room(-7, -5, -4, -5, 'service');
    at(-5, -10, 'apartment'); at(-5, -7, 'apartment'); at(-5, -7, 'cache', { tier: 'blue' });
    at(1, -1, 'prop', { kind: 'mailbox', dx: 1.35, dz: 0.75, w: 0.9, h: 1.22 });
    sign(0, -1, 'TOWER ' + n + '  /  STAIR A ←'); sign(-3, -6, '02   /   STAIR A', 0);
  } else if (name === 'school') {
    room(-1, -1, 1, 1, 'lobby');
    room(-5, -5, -2, -2, 'classroom'); room(-1, -3, -1, -3, 'schoolHall');
    room(1, -2, 3, -2, 'schoolHall'); room(4, -7, 8, -2, 'gym');
    room(8, -1, 8, 0, 'schoolHall');
    room(3, -7, 3, -4, 'stage', 0.48); room(2, -7, 2, -6, 'musicRoom', 0.48); room(1, -6, 1, -6, 'musicRoom', 0.48);
    room(-4, 2, -2, 5, 'dorm'); room(-3, 1, -3, 1, 'schoolHall');
    const staffDoor = -3 - variant;
    room(-8, staffDoor - 1, -6, staffDoor + 1, 'staff'); room(-6, staffDoor, -5, staffDoor, 'schoolHall');
    at(-7, staffDoor - 1, 'desk', { dx: 0.65 });
    gate(3, -2, 1);
    lever(2, -2, 3, -2, 1, 'Pull the gym shutter lever', -1.1);
    at(7, -4, 'bleachers', { turn: 1.57 }); at(7, -6, 'bleachers', { turn: 1.57 });
    at(8, -5, 'moonwindow', { face: 1 }); at(8, -7, 'moonwindow', { face: 1 });
    at(3, -5, 'prop', { kind: 'piano', dx: -1.05, w: 1.35, h: 1.35, cover: true });
    for (const z of [-2, -3, -4]) {
      at(-3, z, 'schoolDesk', { dx: rng() > 0.5 ? -0.95 : 0.95 });
      at(-4 - (z === -4 ? variant % 2 : 0), z, 'schoolDesk', { dz: 0.9 });
    }
    at(1, -2, 'lockers', { dx: 0.65, dz: -1.45 }); at(-3, 3, 'bed', { dx: 0.9 });
    at(8, -6, 'cache', { tier: 'blue' });
    sign(0, -1, 'ST. AGNES  /  WING ' + n); sign(2, -2, 'GYMNASIUM  →', 1);
  } else {
    // The asylum's south wing is deliberately symmetrical. The damaged sections change between districts.
    room(-1, 3, 1, 7, 'patientHall');
    for (const side of [-1, 1]) for (const z of [3, 5, 7]) {
      room(side < 0 ? -3 : 2, z, side < 0 ? -2 : 3, z, 'patient');
      gate(side, z, side < 0 ? 3 : 1, 'wardDoor', 'swing');
      at(side * 3, z, 'bed', { dx: side * 0.9, turn: 1.57 });
      sign(side, z, 'PATIENT ' + n + String(z), side < 0 ? 3 : 1);
    }
    at(0, 4, 'debris', { kind: 'glass' });
    at(0, 6, 'debris', { kind: 'boards' });
    at(variant % 2 ? -1 : 1, 6, 'debris', { kind: variant % 2 ? 'glass' : 'boards' });
    at(0, 2, 'sign', { text: district ? 'PATIENT WING ' + n : 'PATIENT WING / QUIET PLEASE', face: 2, dy: 2.45 });
    gate(0, -5, 1, 'wardDoor');
    lever(0, -6, 0, -5, 1, 'Unlock the surgical wing', -1.15);
  }
}
