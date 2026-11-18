// Shared horizontal cover for doors, vegetation and world geometry.
export function segmentHits(x0, z0, x1, z1, minX, minZ, maxX, maxZ) {
  let first = 0, last = 1;
  for (const [start, delta, low, high] of [[x0, x1 - x0, minX, maxX], [z0, z1 - z0, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-7) { if (start < low || start > high) return false; continue; }
    const a = (low - start) / delta, b = (high - start) / delta;
    first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return last > 0.001 && first < 0.999;
}

export function doorBounds(d, defaults) {
  const width = d.width ?? defaults.W, thickness = d.thickness ?? defaults.T;
  const halfX = (d.along === 'x' ? width : thickness) / 2, halfZ = (d.along === 'x' ? thickness : width) / 2;
  return [d.x - halfX, d.z - halfZ, d.x + halfX, d.z + halfZ];
}

export function doorIsClosed(door, state) {
  return door.mode === 'lockdown' ? !!state?.has(door.id) : !state?.has(door.id);
}
