// The light records in generated chunks are [x, y, z, strength, kind].
export const MAP_LIGHTS = [
  { color: 0xff873e, range: 6.3, intensity: 13, decay: 1.65 },                         // flame
  { color: 0xf54d21, range: 5.6, intensity: 10, decay: 1.7 },                          // lava
  { color: 0xa5c4ed, range: 5.4, intensity: 14, decay: 1.65 },                         // way out
  { color: 0xfa6c46, range: 4.9, intensity: 28, decay: 1.65, spread: 0.46, drift: 1.2 }, // emergency
  { color: 0xb6cec4, range: 5.6, intensity: 29, decay: 1.65, spread: 0.54, drift: 0.75 }, // fluorescent
  { color: 0x97accf, range: 6.2, intensity: 19, decay: 1.6, spread: 0.4, drift: 1 },    // skylight
  { color: 0x6abbbb, range: 5.2, intensity: 29, decay: 1.65, spread: 0.49, drift: 0.7 }, // bulkhead
  { color: 0xe3d299, range: 5.0, intensity: 29, decay: 1.65, spread: 0.58, drift: 0.56 }, // backrooms
  { color: 0x65bbad, range: 3.7, intensity: 15, decay: 1.6 },                          // aisle LEDs
  { color: 0x7e9ec8, range: 5.9, intensity: 24, decay: 1.6, spread: 0.31, drift: 1.9 }, // moon through a window
];
const ease = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function fixtureSeed(x, z) {
  let h = Math.imul(Math.round(x * 4), 374761393) ^ Math.imul(Math.round(z * 4), 668265263) ^ 0x669e9b35;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function fixtureLevel(kind, seed, time) {
  const phase = seed * Math.PI * 2;
  if (kind === 0) {
    // A flame gutters for a few seconds but the ember stays visible.
    const gust = ease(0.45, 0.96, Math.sin(time * 0.48 + phase));
    return (1 - 0.67 * gust) * (0.9 + 0.1 * Math.sin(time * 7 + phase));
  }
  if (kind === 1 || kind === 2) return 0.9 + 0.1 * Math.sin(time * 0.84 + phase);

  const period = 13 + seed * 12;
  const elapsed = time + period * seed * 2.13;
  const cycle = Math.floor(elapsed / period);
  const at = elapsed - cycle * period;
  const outage = 3.6 + seed * 3.2 + (kind === 3 || kind === 8 ? 1.6 : 0);
  const darkAt = 3.4 + 1.35 * Math.sin(cycle * 1.63 + phase);
  if (kind === 5 || kind === 9) {
    // Cloud cover lingers over the skylights, letting the blue edge return slowly.
    return 1 - 0.95 * ease(darkAt - 1.35, darkAt, at) * (1 - ease(darkAt + outage, darkAt + outage + 2, at));
  }
  if (at >= darkAt && at < darkAt + outage) return 0;
  if (at < darkAt && at > darkAt - 1.2) return at < darkAt - 0.64 ? 0.24 : 0.75;
  if (at >= darkAt + outage && at < darkAt + outage + 1.25) {
    const recovery = at - darkAt - outage;
    return recovery < 0.44 ? 0.46 * ease(0, 0.26, recovery) : ease(0.52, 1.25, recovery);
  }
  return 0.96 + 0.04 * Math.sin(time * 3.2 + phase);
}

export function fixtureLensKind(layer, map) {
  if (layer === 'emergency') return 3;
  if (layer === 'fluorescent') return map === 'backrooms' ? 7 : 4;
  if (layer === 'aqua') return 6;
  if (layer === 'serverLamp') return 8;
  if (layer === 'moonPane') return 9;
}

export function isPoweredFixture(kind) {
  return kind === 3 || kind === 4 || kind === 6 || kind === 7 || kind === 8;
}

export function fixtureId(x, y, z, kind) {
  return `${x},${y},${z},${kind}`;
}

// Shared between the renderer and encounters that depend on the physical pool of a lamp.
export function describeMapLight(x, y, z, strength, kind, floor, tile) {
  const profile = MAP_LIGHTS[kind];
  const intensity = strength * profile.intensity;
  const light = { x, y, z, color: profile.color, decay: profile.decay, range: profile.range, intensity };
  if (profile.spread) {
    const height = Math.max(1, y - floor);
    const heading = kind === 9
      ? Math.atan2(Math.round(x / tile) * tile - x, Math.round(z / tile) * tile - z)
      : fixtureSeed(x, z) * Math.PI * 2;
    light.target = { x: x + Math.sin(heading) * profile.drift, y: floor + 0.02, z: z + Math.cos(heading) * profile.drift };
    light.angle = Math.min(profile.spread, Math.atan2(kind === 5 || kind === 9 ? 1.7 : 2.05, height));
    light.penumbra = 0.56;
    light.range = Math.max(profile.range, Math.hypot(height, profile.drift) + 1.35);
    light.intensity = intensity * Math.max(1, Math.min(2.6, (height / 3.3) ** 1.5));
  }
  return light;
}

export function mapLightAt(light, x, y, z) {
  const dx = x - light.x, dy = y - light.y, dz = z - light.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= light.range) return 0;
  let cone = 1;
  if (light.target && distance > 0.01) {
    const tx = light.target.x - light.x, ty = light.target.y - light.y, tz = light.target.z - light.z;
    const dot = (tx * dx + ty * dy + tz * dz) / (Math.hypot(tx, ty, tz) * distance);
    cone = ease(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)), dot);
  }
  const edge = 1 - (distance / light.range) ** 4;
  return light.intensity * cone * edge ** 2 / Math.max(1, distance ** light.decay);
}
