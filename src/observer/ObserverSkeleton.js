import * as THREE from 'three';

// Proportions in metres. The player's eye sits at 1.7 m; the Observer stands about 2.55 m.
// Legs are far too long, the torso too short and narrow, and the arms hang well below the knees.
export const DIMS = {
  thigh: 0.64, shin: 0.68, ankle: 0.05,
  pelvisW: 0.085, torso: 0.6, neck: 0.3, head: 0.34,
  shoulderW: 0.15, upperArm: 0.5, forearm: 0.78, palm: 0.12,
  finger: [[0.07, 0.06], [0.12, 0.11], [0.14, 0.12], [0.13, 0.12], [0.11, 0.1]],   // [base, tip] per finger, thumb first
};
DIMS.hip = DIMS.thigh + DIMS.shin + DIMS.ankle;
DIMS.height = DIMS.hip + 0.04 + DIMS.torso + DIMS.neck + DIMS.head * 0.8;

// Nested groups, one per joint, each pivoting where the joint is. Every joint can be rotated on its own.
// The creature faces +Z; its left side is +X.
//
// ObserverRoot
//  └ Pelvis ─ Torso ─ Neck ─ Head
//      │        ├ LeftShoulder ─ LeftUpperArm ─ LeftElbow ─ LeftForearm ─ LeftHand ─ LeftFinger0..4 ─ ...Tip
//      │        └ RightShoulder ─ ...
//      ├ LeftThigh ─ LeftKnee ─ LeftLowerLeg ─ LeftFoot
//      └ RightThigh ─ ...
export function buildSkeleton() {
  const D = DIMS, j = {};
  const joint = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z);
    if (parent) parent.add(g);
    j[name] = g; return g;
  };
  const root = joint('ObserverRoot', null);
  const pelvis = joint('Pelvis', root, 0, D.hip, 0);
  const torso = joint('Torso', pelvis, 0, 0.04, 0);
  const neck = joint('Neck', torso, 0, D.torso, 0.03);
  const head = joint('Head', neck, 0, D.neck, 0);
  head.rotation.order = 'YXZ';
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    const shoulder = joint(side + 'Shoulder', torso, s * D.shoulderW, D.torso - 0.06, -0.01);
    const upper = joint(side + 'UpperArm', shoulder, s * 0.025, 0, 0);
    const elbow = joint(side + 'Elbow', upper, 0, -D.upperArm, 0);
    const fore = joint(side + 'Forearm', elbow);
    const hand = joint(side + 'Hand', fore, 0, -D.forearm, 0);
    D.finger.forEach(([a], f) => {
      const thumb = f === 0;
      const base = joint(`${side}Finger${f}`, hand, s * (thumb ? 0.026 : 0.024 - (f - 1) * 0.016), thumb ? -D.palm * 0.45 : -D.palm, thumb ? 0.014 : 0);
      joint(`${side}Finger${f}Tip`, base, 0, -a, 0);
    });
    const thigh = joint(side + 'Thigh', pelvis, s * D.pelvisW, 0, 0);
    const knee = joint(side + 'Knee', thigh, 0, -D.thigh, 0);
    const lower = joint(side + 'LowerLeg', knee);
    joint(side + 'Foot', lower, 0, -D.shin, 0);
  }
  // breathing scales this, not the Torso joint, so the arms and neck are not dragged along
  const chest = new THREE.Group(); chest.name = 'Chest'; torso.add(chest);
  return { root, j, chest };
}
