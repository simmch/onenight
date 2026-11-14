import * as THREE from 'three';

// What the player can see of the Observer this frame, using the real camera and field of view.
// Nothing here hides it: whether its body shows up is decided by the actual lights in the scene.
// This only tells the AI where it sits in the player's view and whether light is falling on it.
const v = new THREE.Vector3(), e = new THREE.Vector3();
const BEAM_AXIS = new THREE.Vector3(0, -0.035, -1).normalize();     // the flashlight aims a hair below centre

export function createVisibility() {
  return { dist: 0, depth: 0, inView: false, central: false, los: true, flashLit: false, matchLit: false, visible: false, facing: 0, halfH: 0.9, halfV: 0.6, offAxis: 0, beamOff: 0 };
}
// opt: { flashlightOn, beamLit (beam strength 0..1), beamRange, beamAngle, matchActive, matchRadius, flash (lightning 0..1), blocked(x0,z0,x1,z1), centralAngle }
export function updateVisibility(out, camera, chest, eye, opt) {
  const cp = camera.position;
  out.dist = Math.hypot(chest.x - cp.x, chest.z - cp.z);
  out.los = !opt.blocked(cp.x, cp.z, chest.x, chest.z);
  v.copy(chest).applyMatrix4(camera.matrixWorldInverse);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
  out.halfV = Math.atan(tanV); out.halfH = Math.atan(tanH);
  const depth = -v.z, len = v.length() || 1;
  out.depth = depth;
  out.offAxis = Math.acos(Math.min(1, Math.max(-1, depth / len)));
  // anywhere from its feet to its head on screen counts as in view
  out.inView = depth > 0.15 && Math.abs(v.x) < depth * tanH * 1.02 && v.y - 1.3 < depth * tanV && v.y + 1.6 > -depth * tanV;
  out.central = depth > 0.15 && Math.abs(Math.atan2(v.x, depth)) < opt.centralAngle && Math.abs(Math.atan2(v.y, depth)) < 0.5;
  out.beamOff = Math.acos(Math.min(1, (v.x * BEAM_AXIS.x + v.y * BEAM_AXIS.y + v.z * BEAM_AXIS.z) / len));
  // The wide, dim flashlight fringe should reveal the Observer at the edge of the beam too.
  out.flashLit = opt.flashlightOn && opt.beamLit > 0.08 && out.dist < opt.beamRange && out.beamOff < opt.beamAngle * 1.48 && out.los;
  out.matchLit = opt.matchActive && out.dist < opt.matchRadius && out.los;
  out.visible = out.inView && out.los && (out.flashLit || out.matchLit || opt.flash > 0.3);
  e.copy(eye).applyMatrix4(camera.matrixWorldInverse);
  out.facing = e.z < 0 ? -e.z / (e.length() || 1) : 0;               // 1 = looking straight at its eyes
  return out;
}
