import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const iron = new THREE.MeshLambertMaterial({ color: 0x494641 });
const brass = new THREE.MeshLambertMaterial({ color: 0x99794d });
const bellLip = new THREE.CylinderGeometry(0.1, 0.24, 0.24, 8, 1, true);
const lampGlass = new THREE.MeshBasicMaterial({ color: 0x756044 });
const bellHandle = new THREE.MeshBasicMaterial({ color: 0x827663 });
const LAMP_RADIUS = 6, CHARGE = 16, LOW = 4;

function step(from, angle, distance) {
  return { x: from.x + Math.sin(angle) * distance, z: from.z + Math.cos(angle) * distance };
}

function passage(world, from, to) {
  if (world.losBlocked(from.x, from.z, to.x, to.z, true)) return false;
  if (world.grid && !world.clearLine(from.x, from.z, to.x, to.z, 0.38)) return false;
  const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.45);
  for (let i = 1; i <= count; i++) {
    const f = i / count;
    if (!world.walkable(from.x + (to.x - from.x) * f, from.z + (to.z - from.z) * f, 0.38)) return false;
  }
  return true;
}

// Plan only the next few metres. A bend lets the same landmarks fit rooms and T junctions.
export function planPassages(world, origin, preferred, levers = []) {
  const routes = [];
  for (let i = 0; i < 24 && routes.length < 2; i++) {
    const offset = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 12;
    const angle = preferred + offset;
    if (routes.some(r => Math.cos(r.angle - angle) > 0.3)) continue;
    const turn = step(origin, angle, 4.2);
    if (!passage(world, origin, turn)) continue;
    for (const bend of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      const end = step(turn, angle + bend, 5.8);
      if (routes.some(r => Math.hypot(end.x - r.end.x, end.z - r.end.z) < 6)) continue;
      if (!passage(world, turn, end)) continue;
      // Leave walking room beyond the fixture, so a tell never points into a cupboard.
      const onward = [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2].some(offset => {
        const next = step(end, angle + bend + offset, 4.5);
        return Math.hypot(next.x - origin.x, next.z - origin.z) > 10 && passage(world, end, next);
      });
      if (!onward) continue;
      routes.push({ angle, turn, end, kind: routes.length ? 'bell' : 'lamp' });
      if (routes.length === 1) {
        const gate = passageToLever(world, origin, angle, levers);
        if (gate) routes.push(gate);
      }
      break;
    }
  }
  return routes;
}

function passageToLever(world, origin, lampAngle, levers) {
  for (const lever of levers) {
    const dx = lever.x - origin.x, dz = lever.z - origin.z;
    const distance = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
    if (distance < 7 || distance > 14 || Math.cos(angle - lampAngle) > 0.3) continue;
    const turn = step(origin, angle, 4.2);
    const end = step(origin, angle, distance - 1);
    if (passage(world, origin, turn) && passage(world, turn, end) &&
        !world.losBlocked(end.x, end.z, lever.x, lever.z, true)) {
      return { kind: 'lever', lever, angle, turn, end };
    }
  }
  return null;
}

export function nearPassage(x, z, origin, route, clearance = 2.9) {
  function nearSegment(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < clearance;
  }
  return nearSegment(origin, route.turn) || nearSegment(route.turn, route.end);
}

function fixture(scene, world, route) {
  const root = new THREE.Group();
  const piece = (parent, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(box, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  };
  const at = route.end;
  root.position.set(at.x, world.groundY(at.x, at.z), at.z);
  root.rotation.y = route.angle + Math.PI;
  scene.add(root);
  piece(root, iron, 0, 0.10, 0, 0.48, 0.2, 0.4);
  piece(root, iron, 0, 0.65, 0, 0.09, 1.05, 0.1);
  const moving = new THREE.Group();
  root.add(moving);
  if (route.kind === 'lamp') {
    piece(root, iron, 0, 1.22, 0, 0.41, 0.10, 0.32);
    const glass = piece(root, lampGlass.clone(), 0, 1.44, 0, 0.25, 0.36, 0.22);
    piece(root, iron, 0, 1.66, 0, 0.38, 0.08, 0.34);
    for (const x of [-0.15, 0.15]) piece(root, brass, x, 1.43, 0.13, 0.02, 0.38, 0.02);
    moving.position.set(0, 0.92, 0.12);
    piece(moving, brass, 0.09, 0, 0, 0.20, 0.045, 0.06);
    piece(moving, iron, 0.18, 0, 0.06, 0.06, 0.06, 0.14);
    const light = new THREE.PointLight(0xffb962, 0, LAMP_RADIUS + 1, 1.5);
    light.position.y = 1.45;
    root.add(light);
    return { root, moving, glass, light };
  }
  piece(root, iron, 0.12, 1.74, 0, 0.34, 0.07, 0.09);
  moving.position.set(0.23, 1.7, 0);
  const bell = new THREE.Mesh(bellLip, brass);
  bell.position.y = -0.14;
  moving.add(bell);
  piece(moving, brass, 0, -0.22, 0, 0.06, 0.19, 0.06);
  piece(moving, bellHandle, 0.12, -0.51, 0, 0.025, 0.76, 0.025);
  piece(moving, bellHandle, 0.12, -0.90, 0, 0.14, 0.04, 0.05);
  return { root, moving };
}

export function createRouteFixtures(scene, world, hooks) {
  let stations = [], charge = 0, winding = 0, ringing = 0, rang = false, nearbyLight = false;
  function clear() {
    for (const s of stations) {
      s.root.removeFromParent();
      s.glass?.material.dispose();
      s.light?.dispose();
    }
    stations = [];
    charge = winding = ringing = 0;
    rang = nearbyLight = false;
  }
  function show(routes) {
    clear();
    stations = routes.filter(route => route.kind !== 'lever').map(route => ({ ...route, ...fixture(scene, world, route) }));
  }
  function update(dt, p) {
    nearbyLight = false;
    ringing = Math.max(0, ringing - dt);
    for (const s of stations) {
      if (s.kind === 'bell') {
        s.moving.rotation.z = Math.sin(ringing * 12) * ringing * 0.2;
        continue;
      }
      const dist = Math.hypot(p.x - s.end.x, p.z - s.end.z);
      const previous = charge;
      charge = Math.max(0, charge - dt);
      const visible = charge > 0 && dist < LAMP_RADIUS + 1 && !world.losBlocked(p.x, p.z, s.end.x, s.end.z, true);
      nearbyLight = visible && dist < LAMP_RADIUS;
      if (previous > LOW && charge <= LOW && nearbyLight) hooks.say('The crank is slowing. Wind it again or strike a match.');
      const strength = charge > LOW ? 1 : Math.min(1, charge) * (0.65 + 0.35 * Math.cos(charge * 12));
      s.light.intensity = visible ? 13 * strength : 0;
      s.glass.material.color.setHex(charge > 0 ? 0xffca79 : 0x756044).multiplyScalar(charge > 0 ? 0.65 + strength * 0.6 : 1);
    }
  }
  function action(dt, p, yaw, available, held, canRing = true) {
    const target = available && stations.find(s => {
      const dx = s.end.x - p.x, dz = s.end.z - p.z, d = Math.hypot(dx, dz);
      return d < 2 && (d < 0.65 || (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / d > 0.35)
        && !world.losBlocked(p.x, p.z, s.end.x, s.end.z, true);
    });
    if (!held || target?.kind !== 'lamp') winding = 0;
    if (!target) return null;
    if (target.kind === 'bell') {
      if (rang || !canRing) return null;
      return { label: '[E] Ring the bell to draw them away', run() {
        if (rang || !stations.includes(target)) return;
        rang = true;
        ringing = 2.4;
        hooks.ring(target.end);
      } };
    }
    if (charge > LOW) return null;
    if (held) {
      if (!winding) hooks.crank();
      winding += dt;
      target.moving.rotation.z -= dt * 12;
      if (winding >= 1.4) {
        charge = CHARGE;
        winding = 0;
        hooks.say('The lamp catches. Its light reaches six paces.');
        return null;
      }
    }
    return { label: '[Hold E] Wind the lamp' + (winding ? ' · ' + Math.floor(winding / 1.4 * 100) + '%' : ''), run() {} };
  }
  return { show, clear, update, action, get lit() { return nearbyLight; } };
}
