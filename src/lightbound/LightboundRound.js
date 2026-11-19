import * as THREE from 'three';
import { survey, distance } from '../encounters/EncounterWorld.js';
import { describeMapLight, fixtureId, fixtureSeed, isPoweredFixture, mapLightAt } from '../world/MapLighting.js';
import { buildBreaker, buildEmergencyTube, buildLightbound } from './LightboundModel.js';

const STABLE_SECONDS = 20;
const BODY_SAMPLE = 1.35;
const MIN_LIGHT = 0.46;

export function createLightboundRound({ scene, world, fixtures, fixtureIsOn, hooks, rng = Math.random }) {
  const creatures = [], circuits = new Set(), emergencyLights = [], emergencyTubes = [];
  const breaker = buildBreaker(), ray = new THREE.Ray(), hit = new THREE.Vector3(),
    sphere = new THREE.Sphere(), chest = new THREE.Vector3(), head = new THREE.Vector3();
  let active = false, level = 0, remaining = 0, position = null, guideYaw = 0;
  let loopTime = 0, stabilized = 0, hurtClock = 0, pendingDamage = 0, drain = 0;
  const clear = (a, b) => !world.losBlocked(a.x, a.z, b.x, b.z, true);

  function pointsInPool(record, paths) {
    const { x, y, z, strength, kind } = record;
    const light = describeMapLight(x, y, z, strength, kind, world.groundY(x, z), world.grid.CELL);
    const f = light.target ? Math.max(0, (y - light.target.y - BODY_SAMPLE) / Math.max(0.1, y - light.target.y)) : 0;
    const center = light.target ? { x: x + (light.target.x - x) * f, z: z + (light.target.z - z) * f } : { x, z };
    const points = [];
    for (let i = 0; i < 18; i++) {
      const r = i ? 0.52 + 0.45 * Math.floor((i - 1) / 8) : 0;
      const a = i * 2.4 + fixtureSeed(x, z) * 6.28;
      const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
      const floor = world.groundY(p.x, p.z);
      const room = world.roofY(p.x, p.z) - floor;
      if (room < 2.0 || !world.walkable(p.x, p.z, 0.29)) continue;
      if (!paths.some(q => distance(q, p) < 2.85 && clear(q, p)) || !clear(record, p)) continue;
      const low = BODY_SAMPLE * Math.min(1.08, (room - 0.1) / 2.93);
      const high = BODY_SAMPLE * Math.min(1.17, (room - 0.1) / 2.93);
      if (Math.min(mapLightAt(light, p.x, floor + low, p.z), mapLightAt(light, p.x, floor + high, p.z)) < MIN_LIGHT * 1.8) continue;
      if (points.some(q => distance(q, p) < 0.49)) continue;
      points.push(p);
    }
    return points;
  }

  function extinguishEmergencyTubes() {
    for (const tube of emergencyTubes) tube.root.removeFromParent();
    emergencyLights.length = emergencyTubes.length = 0;
  }

  function extraFixture(p) {
    const floor = world.groundY(p.x, p.z);
    const y = Math.min(floor + 3.2, world.roofY(p.x, p.z) - 0.32);
    const tube = buildEmergencyTube();
    tube.root.position.set(p.x, y, p.z);
    scene.add(tube.root);
    emergencyTubes.push(tube);
    emergencyLights.push(p.x, y, p.z, 1.05, 8);
    return { x: p.x, y, z: p.z, strength: 1.05, kind: 8, id: fixtureId(p.x, p.z, 8), points: [p] };
  }

  function bind(player) {
    extinguishEmergencyTubes();
    circuits.clear();
    const paths = survey(world, player, 44);
    const sources = fixtures();
    const nests = [];
    const seen = new Set();
    for (let i = 0; i < sources.length; i += 5) {
      const x = sources[i], y = sources[i + 1], z = sources[i + 2], strength = sources[i + 3], kind = sources[i + 4];
      if (!isPoweredFixture(kind) || Math.hypot(x - player.x, z - player.z) > 38) continue;
      const id = fixtureId(x, z, kind);
      if (seen.has(id)) continue;
      const record = { x, y, z, strength, kind };
      const points = pointsInPool(record, paths);
      if (points.length === 0) continue;
      seen.add(id);
      nests.push({ ...record, id, points });
    }
    const ordered = nests.sort((a, b) => Math.abs(distance(a, player) - 11) - Math.abs(distance(b, player) - 11));
    const occupied = [];
    const assigned = [];
    function add(nest, index) {
      const point = nest.points[index];
      if (!point || occupied.some(p => distance(p, point) < 0.48)) return false;
      assigned.push({ ...point, circuit: nest.id });
      occupied.push(point);
      circuits.add(nest.id);
      return true;
    }
    if (rng() < 0.48) {
      const group = ordered.find(n => n.points.length >= 2);
      if (group) {
        for (let i = 0; i < Math.min(group.points.length, rng() < 0.34 ? 3 : 2, remaining); i++) add(group, i);
      }
    }
    for (const nest of ordered) {
      if (assigned.length >= remaining) break;
      if (!circuits.has(nest.id)) {
        const i = nest.points.findIndex(p => occupied.every(q => distance(p, q) >= 0.48));
        if (i >= 0) add(nest, i);
      }
    }
    for (const nest of ordered) {
      for (let i = 0; assigned.length < remaining && i < Math.min(3, nest.points.length); i++) add(nest, i);
    }
    // The round can start in an unpowered wing. Use emergency tubes on reachable floor there.
    const backup = paths.filter(p => world.walkable(p.x, p.z, 0.29) &&
      world.roofY(p.x, p.z) - world.groundY(p.x, p.z) >= 2.0)
      .sort((a, b) => Math.abs(distance(a, player) - 9) - Math.abs(distance(b, player) - 9));
    for (const point of backup) {
      if (assigned.length >= remaining) break;
      if (occupied.every(q => distance(q, point) >= 1.5)) add(extraFixture(point), 0);
    }
    // A very small sealed room can hold several souls around the same emergency light.
    if (assigned.length < remaining) {
      const base = assigned[0] || backup[0] || player;
      const backupFixture = assigned[0] ? null : extraFixture(base);
      const circuit = assigned[0]?.circuit || backupFixture.id;
      circuits.add(circuit);
      while (assigned.length < remaining) assigned.push({ x: base.x, z: base.z, circuit });
    }
    const living = creatures.filter(m => m.hp > 0);
    for (let i = 0; i < living.length; i++) place(living[i], assigned[i]);

    const sites = paths.filter(p => world.walkable(p.x, p.z, 0.4) && occupied.every(q => distance(p, q) > 1.7));
    const spot = sites.sort((a, b) => Math.abs(distance(a, player) - 5) - Math.abs(distance(b, player) - 5))[0] || backup[0] || player;
    breaker.root.position.set(spot.x, world.groundY(spot.x, spot.z), spot.z);
    breaker.root.rotation.y = Math.atan2(player.x - spot.x, player.z - spot.z);
  }

  function place(monster, point) {
    Object.assign(monster, point);
    const floor = world.groundY(point.x, point.z);
    const room = world.roofY(point.x, point.z) - floor;
    monster.model.root.position.set(point.x, floor, point.z);
    monster.model.root.scale.setScalar(Math.min(1.08 + monster.variation * 0.09, (room - 0.1) / 2.93));
    monster.model.root.visible = false;
  }

  function start(n, player) {
    stop();
    level = Math.max(0, n - 1);
    remaining = Math.min(9, 3 + Math.floor(rng() * 3) + Math.floor(level / 5));
    const health = 3 + Math.min(30, Math.floor(level * 0.55));
    for (let i = 0; i < remaining; i++) {
      const variation = rng();
      const model = buildLightbound(variation > 0.5 ? 1 : -1, rng() * Math.PI * 2);
      model.root.visible = false;
      scene.add(model.root);
      creatures.push({ model, hp: health + (level > 2 && variation > 0.6 ? 1 : 0), variation,
        nextCry: 2 + rng() * 3, nextNearCry: 0, scream: 0, recoil: 0 });
    }
    active = true;
    scene.add(breaker.root);
    bind(player);
  }

  function stop(playTail = false) {
    active = false;
    remaining = stabilized = loopTime = hurtClock = pendingDamage = drain = 0;
    position = null;
    circuits.clear();
    breaker.root.removeFromParent();
    breaker.handle.rotation.x = 0;
    for (const monster of creatures) monster.model.root.removeFromParent();
    creatures.length = 0;
    extinguishEmergencyTubes();
    if (!playTail) hooks.silence();
  }

  function levelFor(x, z, kind, base) {
    if (!active || !isPoweredFixture(kind) || !circuits.has(fixtureId(x, z, kind))) return base;
    if (stabilized > 0) return 0.94;
    if (base < 0.35) return base;
    const seed = fixtureSeed(x, z);
    const phase = (loopTime + seed * 11.7) % (5.1 + seed * 3.4);
    // A short burst of rapid interruptions, between the normal long blackouts.
    if (phase < 1.45 && Math.sin(phase * 29) < 0.18) return 0.012;
    return base;
  }

  function visible(monster) {
    if (monster.hp <= 0) return false;
    const p = monster.model.root.position;
    return fixtureIsOn(monster.circuit, p.x, p.y + BODY_SAMPLE * monster.model.root.scale.y, p.z, MIN_LIGHT);
  }

  function update(dt, info) {
    if (!active || !remaining) return;
    position = info.player;
    guideYaw = info.yaw;
    if (info.inControl) {
      loopTime += dt;
      stabilized = Math.max(0, stabilized - dt);
    }
    breaker.handle.rotation.x = stabilized > 0 ? 1.35 : -0.23;
    for (let i = 0; i < emergencyTubes.length; i++) {
      const { x, z } = emergencyTubes[i].root.position;
      emergencyTubes[i].lens.visible = levelFor(x, z, 8, hooks.level(x, z, 8)) > 0.12;
    }
  }

  function updateBodies(dt, info) {
    if (!active || !remaining) return;
    const p = info.player;
    drain = 0;
    for (const m of creatures) {
      const root = m.model.root;
      root.visible = visible(m);
      if (!root.visible) continue;
      const range = distance(m, p);
      if (!info.inControl) continue;
      root.rotation.y = Math.atan2(p.x - m.x, p.z - m.z);
      m.scream = Math.max(0, m.scream - dt * 1.65);
      m.recoil = Math.max(0, m.recoil - dt * 4.6);
      m.nextCry -= dt;
      m.nextNearCry -= dt;
      if (range < 6.2 && m.nextNearCry <= 0 && clear(m, p)) {
        cry(m, 'near');
        m.nextNearCry = 3.2 + rng() * 1.4;
      } else if (range < 27 && m.nextCry <= 0) cry(m, 'idle');
      m.model.pose(loopTime, m.scream, m.recoil, dt);
      if (range < 8.2 && Math.abs(p.y - root.position.y - 1.45) < 2.35 && clear(m, p)) {
        drain += Math.max(0.28, 1 - range / 9.8);
      }
    }
    if (!info.inControl || drain <= 0) return;
    const pressure = Math.min(2.12, drain);
    hooks.sanity(pressure * (7.4 + Math.min(17, level * 0.43)) * dt);
    hurtClock += dt;
    pendingDamage += pressure * (6 + Math.min(14, level * 0.31)) * dt;
    if (hurtClock >= 0.4) {
      const hit = pendingDamage;
      hurtClock = pendingDamage = 0;
      hooks.damage(hit);
    }
  }

  function cry(m, reason) {
    m.scream = 1;
    m.nextCry = 3.9 + rng() * 5.3;
    hooks.screech(m, reason);
  }
  function strike(m, damage) {
    m.recoil = 1;
    m.hp = Math.max(0, m.hp - damage);
    cry(m, 'hit');
    if (m.hp === 0) {
      remaining--;
      m.model.root.visible = false;
    }
  }

  function shot(origin, direction, { range = 45, damage = 1, melee = false } = {}) {
    ray.set(origin, direction);
    let best = range, target = null, multiplier = 1;
    for (const m of creatures) {
      if (!m.model.root.visible || !visible(m) || !clear(origin, m)) continue;
      m.model.root.updateMatrixWorld(true);
      const scale = m.model.root.scale.x;
      const zones = m.model.hitZones
        ? m.model.hitZones.map(([bone, radius, bonus]) => [bone.getWorldPosition(new THREE.Vector3()), radius, bonus])
        : [[m.model.head.getWorldPosition(head), 0.34, 2], [m.model.torso.localToWorld(chest.set(0, 0.42, 0)), 0.29, 1]];
      for (const [center, radius, bonus] of zones) {
        sphere.set(center, (radius + (melee ? 0.22 : 0.06)) * scale);
        if (!ray.intersectSphere(sphere, hit)) continue;
        const d = hit.distanceTo(origin);
        if (d < best && Math.abs(origin.y - m.model.root.position.y - 1.45) < 3.1) {
          best = d; target = m; multiplier = melee ? 1 : bonus;
        }
      }
    }
    if (target) strike(target, damage * multiplier);
  }

  function blast(point, radius) {
    for (const m of creatures) {
      if (m.model.root.visible && visible(m) && distance(point, m) < radius && clear(point, m)) strike(m, 5);
    }
  }

  function action(p, yaw) {
    if (!active || !remaining) return null;
    const b = breaker.root.position, d = distance(p, b);
    if (d > 2 || !clear(p, b) || Math.abs(p.y - b.y - 1.5) > 1.55) return null;
    if (d > 0.65 && ((b.x - p.x) * -Math.sin(yaw) + (b.z - p.z) * -Math.cos(yaw)) / d < 0.25) return null;
    if (stabilized > 0) return { label: `Circuit steady for ${Math.ceil(stabilized)}s`, run() {} };
    return { label: '[E] Flip the breaker', run() {
      if (!active || stabilized > 0) return;
      stabilized = STABLE_SECONDS;
      hooks.switched();
    } };
  }
  function info() {
    if (stabilized > 0) return `LIGHTS STEADY ${Math.ceil(stabilized)}s`;
    if (!position) return 'FIND THE BREAKER';
    const b = breaker.root.position, dx = b.x - position.x, dz = b.z - position.z;
    const a = Math.atan2(dx * Math.cos(guideYaw) - dz * Math.sin(guideYaw), -dx * Math.sin(guideYaw) - dz * Math.cos(guideYaw));
    const side = Math.abs(a) < 0.64 ? 'ahead' : Math.abs(a) > 2.44 ? 'behind' : a > 0 ? 'right' : 'left';
    return `BREAKER ${Math.ceil(Math.hypot(dx, dz))} m ${side}`;
  }
  return {
    start, stop, update, updateBodies, levelFor, action, shot, blast,
    rebind(player) { if (active && remaining) bind(player); },
    get active() { return active; },
    get remaining() { return remaining; },
    get status() { return info(); },
    get creatures() { return creatures; },
    get emergencyLights() { return emergencyLights; },
    get health() { return creatures.reduce((total, m) => total + m.hp, 0); },
    occupies(x, z, kind) { return circuits.has(fixtureId(x, z, kind)); },
    get draining() { return drain > 0; },
  };
}
