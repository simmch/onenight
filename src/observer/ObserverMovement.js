// Locomotion over the map that already exists: the same colliders the player hits, and in the caves a
// breadth-first path over the cave's own grid. Nothing here moves the Observer except walking.
//
// world: { grid, cellWalkable(i, j), clearLine(x0, z0, x1, z1, r), collide(pos, r) }
export class ObserverMovement {
  constructor(world, radius) {
    this.w = world; this.r = radius;
    this.path = null; this.pathKey = ''; this.repath = 0;
    this.stuck = 0; this.detour = null;
  }
  reset() { this.path = null; this.pathKey = ''; this.detour = null; this.stuck = 0; }

  update(dt, pos, goal, speed) {
    const out = { vx: 0, vz: 0, speed: 0, arrived: true };
    if (!goal || speed <= 0 || dt <= 0) return out;
    const gd = Math.hypot(goal.x - pos.x, goal.z - pos.z);
    if (gd < 0.25) return out;
    let tx = goal.x, tz = goal.z;
    if (this.w.grid) { const wp = this.waypoint(dt, pos, goal); if (wp) { tx = wp.x; tz = wp.z; } }
    if (this.detour) { this.detour.t -= dt; if (this.detour.t <= 0) this.detour = null; else { tx = this.detour.x; tz = this.detour.z; } }
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz) || 1e-6;
    const step = Math.min(speed * dt, d), ox = pos.x, oz = pos.z;
    pos.x += dx / d * step; pos.z += dz / d * step;
    this.w.collide(pos, this.r);
    const moved = Math.hypot(pos.x - ox, pos.z - oz);
    if (step > 1e-4 && moved < step * 0.35) {
      this.stuck += dt;
      if (this.stuck > 0.45) {          // sliding along something: step round it
        const side = Math.random() < 0.5 ? -1 : 1;
        this.detour = { x: pos.x - dz / d * side * 2.5 + dx / d * 0.8, z: pos.z + dx / d * side * 2.5 + dz / d * 0.8, t: 0.9 };
        this.stuck = 0; this.path = null;
      }
    } else this.stuck = Math.max(0, this.stuck - dt);
    out.vx = (pos.x - ox) / dt; out.vz = (pos.z - oz) / dt; out.speed = moved / dt; out.arrived = gd < 0.6;
    return out;
  }

  waypoint(dt, pos, goal) {
    const G = this.w.grid, ci = G.cellOf(pos.x), cj = G.cellOf(pos.z), gi = G.cellOf(goal.x), gj = G.cellOf(goal.z);
    if ((ci === gi && cj === gj) || this.w.clearLine(pos.x, pos.z, goal.x, goal.z, this.r)) return null;
    this.repath -= dt;
    const k = gi + ',' + gj;
    if (!this.path || this.repath <= 0 || this.pathKey !== k) { this.path = this.bfs(ci, cj, gi, gj); this.pathKey = k; this.repath = 0.6; }
    if (!this.path || !this.path.length) return null;
    for (let n = Math.min(this.path.length - 1, 10); n >= 0; n--) {        // head for the furthest cell it can walk straight to
      const [i, j] = this.path[n], x = i * G.CELL, z = j * G.CELL;
      if (n === 0 || this.w.clearLine(pos.x, pos.z, x, z, this.r)) { if (n > 0) this.path.splice(0, n); return { x, z }; }
    }
    return null;
  }

  bfs(si, sj, gi, gj) {
    const W = this.w, pad = 14;
    const x0 = Math.min(si, gi) - pad, x1 = Math.max(si, gi) + pad, z0 = Math.min(sj, gj) - pad, z1 = Math.max(sj, gj) + pad;
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    if (w * h > 40000) return null;
    const prev = new Int32Array(w * h).fill(-1), idx = (i, j) => (j - z0) * w + (i - x0);
    const q = [idx(si, sj)]; prev[q[0]] = q[0];
    const goal = idx(gi, gj);
    for (let head = 0; head < q.length; head++) {
      const c = q[head]; if (c === goal) break;
      const i = c % w + x0, j = (c / w | 0) + z0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < x0 || a > x1 || b < z0 || b > z1) continue;
        const n = idx(a, b);
        if (prev[n] !== -1 || !W.cellWalkable(a, b)) continue;
        prev[n] = c; q.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== prev[c]; c = prev[c]) out.push([c % w + x0, (c / w | 0) + z0]);
    return out.reverse();
  }
}
