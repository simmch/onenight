import { DIMS } from './ObserverSkeleton.js';

// Procedural animation. Each frame the current state writes a target rotation for every joint, and the joints
// ease toward it. 'frozen' and 'reveal' write nothing and advance nothing: the pose stops dead, mid-motion.
//
// Conventions: limbs hang down their joint's -Y; rotation.x < 0 swings a hanging limb forward (+Z).
// For the upward torso and neck, rotation.x > 0 leans forward. Left is +X, so outward is +z on the left, -z on the right.

const SIDES = [['Left', 1], ['Right', -1]];
const RATE = { idle: 4, stalk: 9, scurry: 16, hunt: 13, attack: 22, mimic: 8 };

export class ObserverAnimator {
  constructor(model, rng = Math.random) {
    this.m = model; this.j = model.j; this.rng = rng;
    this.state = 'idle'; this.time = 0; this.gait = 0; this.attackT = 0;
    this.t = {};                                         // joint -> [x, y, z] targets for this frame
    this.pelvisY = DIMS.hip; this.breath = 0;
    this.head = { yaw: 0, pitch: 0, roll: 0, hold: 0, snap: false, follow: true };
    this.twitch = { t: 0, side: 1 };
    this.fingerPhase = Array.from({ length: 10 }, () => [rng() * 6.28, 0.6 + rng() * 1.8]);
    this.lastStep = [0, 0];
    this.onStep = null;                                  // (side, strength) at each footfall
  }
  setState(s) {
    if (s === this.state) return;
    if (s === 'attack') this.attackT = 0;
    if (s === 'stalk' || s === 'hunt' || s === 'scurry') this.head.hold = 0;
    this.state = s;
  }
  // An abrupt head turn with no easing, used when a match lands on it: it is already looking at you.
  snapHead(yaw, pitch, roll) {
    const h = this.j.Head;
    if (this.m.asset) {
      h.rotateY(Math.max(-1.2, Math.min(1.2, yaw)));
      h.rotateX(pitch);
      h.rotateZ(roll);
      return;
    }
    h.rotation.set(pitch, Math.max(-2.6, Math.min(2.6, yaw)), roll);
    this.j.Neck.rotation.y = 0;
  }
  set(name, x, y, z) { const a = this.t[name] || (this.t[name] = [0, 0, 0]); a[0] = x; a[1] = y; a[2] = z; }

  // ctx: { speed (m/s), lookYaw (rad, player relative to body facing), lookPitch }
  update(dt, ctx) {
    if (this.state === 'frozen' || this.state === 'reveal') return;
    this.time += dt; this.dt = dt;
    const T = this.time, st = this.state;
    const stride = st === 'scurry' ? 0.42 : st === 'hunt' ? 1.15 : 0.85;
    let pace = (ctx.speed || 0) / stride * Math.PI;
    if (st === 'stalk') pace *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.gait * 0.37)) * (Math.sin(this.gait * 0.13) > 0.85 ? 0.15 : 1);   // hitches
    this.gait += dt * pace;
    if (this.m.asset) {
      const speed = ctx.speed || 0;
      const name = st === 'attack' ? 'Attack' : speed <= 0.2 ? 'Idle' : st === 'hunt' || st === 'scurry' ? 'Run' : 'Walk';
      const rate = name === 'Run' || name === 'Walk' ? Math.max(0.3, Math.min(1.55, speed / (name === 'Run' ? 3.4 : 0.92))) : 0.7;
      this.m.asset.animate(name, dt, { once: name === 'Attack', rate });
    } else {
      this.pose(T, ctx);
      this.apply(dt);
    }
    // footfalls: each foot plants when its swing crosses zero
    if (ctx.speed > 0.2 && (st === 'stalk' || st === 'hunt' || st === 'scurry' || st === 'mimic')) {
      SIDES.forEach((_, k) => {
        const s = Math.sin(this.gait + k * (Math.PI + 0.3));
        if (Math.sign(s) !== Math.sign(this.lastStep[k]) && s > 0) this.onStep?.(k, st === 'scurry' ? 0.6 : st === 'hunt' ? 1.2 : 1);
        this.lastStep[k] = s;
      });
    }
  }

  pose(T, ctx) {
    const st = this.state, look = ctx.lookYaw || 0, lp = ctx.lookPitch || 0, w = this.gait + 0.32 * Math.sin(this.gait * 2);
    // ── the base stance: hunched, neck craned forward, knees locked slightly backwards ──
    let pelvisX = 0.04, hip = DIMS.hip;
    this.set('Pelvis', pelvisX, 0, 0);
    this.set('Torso', 0.24, 0, 0);
    this.set('Neck', 0.5, 0, 0);
    this.breath = 1 + 0.03 * Math.sin(T * 1.25) * Math.sin(T * 0.31 + 1);
    for (const [S, s] of SIDES) {
      this.set(S + 'Shoulder', 0, 0, s * (0.07 + 0.025 * Math.sin(T * 0.37 + s)));
      this.set(S + 'UpperArm', -0.06, 0, s * 0.05);
      this.set(S + 'Elbow', 0.2, s * 0.45, 0);                 // bends the wrong way, and twisted
      this.set(S + 'Forearm', 0, s * 0.35, 0);
      this.set(S + 'Hand', -0.12, 0, s * 0.12);
      this.set(S + 'Thigh', 0.02, 0, s * 0.05);
      this.set(S + 'Knee', -0.14, 0, 0);
      this.set(S + 'LowerLeg', 0, s * 0.18, 0);
      this.set(S + 'Foot', 0.05, 0, 0);
      for (let f = 0; f < 5; f++) {
        const [ph, sp] = this.fingerPhase[f + (s > 0 ? 0 : 5)], wig = 0.13 * Math.sin(T * sp + ph) * Math.sin(T * sp * 0.43 + ph * 2);
        this.set(`${S}Finger${f}`, -0.22 + wig, 0, f === 0 ? s * 0.5 : s * (f - 2.5) * 0.06);
        this.set(`${S}Finger${f}Tip`, -0.3 + wig * 1.6, 0, 0);
      }
    }
    // ── head: holds odd angles for seconds at a time ──
    this.planHead(ctx);
    const H = this.head;
    this.set('Head', -0.3 + H.pitch, H.follow ? look * 0.8 + H.yaw : H.yaw, H.roll);

    if (st === 'idle') {
      if (this.twitch.t > 0) this.twitch.t -= this.dt; else if (this.rng() < 0.004) this.twitch = { t: 0.25, side: this.rng() < 0.5 ? 1 : -1 };
      if (this.twitch.t > 0) { const S = this.twitch.side > 0 ? 'Left' : 'Right'; this.set(S + 'Shoulder', 0.1, 0, this.twitch.side * 0.32); }
    } else if (st === 'stalk') {
      // imitating a walk and getting it wrong: arms swing with the leg on the same side, the knees snap back
      for (const [S, s] of SIDES) {
        const p = w + (s > 0 ? 0 : Math.PI + 0.3);
        this.set(S + 'Thigh', -0.55 * Math.sin(p) - pelvisX, 0, s * 0.06);
        this.set(S + 'Knee', -0.12 + 0.95 * Math.max(0, Math.sin(p + 1.25)), 0, 0);
        this.set(S + 'Foot', 0.25 * Math.max(0, Math.sin(p + 0.4)), 0, 0);
        this.set(S + 'UpperArm', -0.5 * Math.sin(p) - 0.05, 0, s * 0.07);
        this.set(S + 'Elbow', 0.2 + 0.35 * Math.max(0, Math.sin(p - 1)), s * 0.45, 0);
      }
      this.set('Torso', 0.26, 0.12 * Math.sin(w + 0.5), 0.07 * Math.sin(w));
      hip -= 0.025 * Math.abs(Math.sin(w));
    } else if (st === 'mimic') {
      // copying you from far off: upright for once, walking the way a person walks, one arm held out with a light
      pelvisX = 0; this.set('Pelvis', 0, 0, 0);
      this.set('Torso', 0.04, 0, 0); this.set('Neck', 0.08, 0, 0); this.set('Head', -0.05, 0, 0);
      for (const [S, s] of SIDES) {
        const p = w + (s > 0 ? 0 : Math.PI);
        this.set(S + 'Thigh', -0.42 * Math.sin(p), 0, s * 0.03);
        this.set(S + 'Knee', 0.75 * Math.max(0, Math.sin(p + 1.2)), 0, 0);
        this.set(S + 'Foot', 0.2 * Math.max(0, Math.sin(p + 0.4)), 0, 0);
        this.set(S + 'UpperArm', 0.3 * Math.sin(p), 0, s * 0.04);
        this.set(S + 'Elbow', -0.15, 0, 0); this.set(S + 'Forearm', 0, 0, 0);
      }
      this.set('RightUpperArm', -0.12 - 1.08 * (ctx.lightRaised ?? 1), 0, -0.06);
      this.set('RightElbow', 0.05, 0, 0); this.set('RightHand', -0.3, 0, 0);
      hip = DIMS.hip + 0.03;
    } else if (st === 'scurry') {
      // folded almost flat, hands on the ground, legs going far too fast and out of step
      pelvisX = 0.28; hip = 0.8;
      this.set('Pelvis', pelvisX, 0, 0);
      this.set('Torso', 1.18, 0, 0.1 * Math.sin(w * 1.7));
      this.set('Neck', -0.95, 0, 0);
      this.set('Head', -0.35, look, 0.25 * Math.sin(T * 9));
      for (const [S, s] of SIDES) {
        const o = s > 0 ? 0 : 2.3, oa = s > 0 ? 1.7 : -0.6;
        this.set(S + 'Thigh', -pelvisX - 0.75 + 0.55 * Math.sin(w + o), 0, s * 0.28);
        this.set(S + 'Knee', 1.5 + 0.45 * Math.sin(w + o + 1.3), 0, 0);
        this.set(S + 'Foot', -0.55, 0, 0);
        this.set(S + 'Shoulder', 0, 0, s * 0.18);
        this.set(S + 'UpperArm', -1.6 + 0.5 * Math.sin(w * 1.1 + oa), 0, s * 0.45);
        this.set(S + 'Elbow', 0.65 + 0.4 * Math.sin(w * 1.1 + oa + 1), s * 0.7, 0);
        this.set(S + 'Hand', 0.7, 0, 0);
        for (let f = 0; f < 5; f++) { this.set(`${S}Finger${f}`, 0.35, 0, s * (f - 2) * 0.22); this.set(`${S}Finger${f}Tip`, 0.2, 0, 0); }
      }
    } else if (st === 'hunt') {
      pelvisX = 0.15; hip = DIMS.hip - 0.1;
      this.set('Pelvis', pelvisX, 0, 0);
      this.set('Torso', 0.6, 0.08 * Math.sin(w), 0);
      this.set('Neck', -0.15, 0, 0);
      this.set('Head', -0.2 + lp, look, 0.15 * Math.sin(T * 3.1));
      for (const [S, s] of SIDES) {
        const p = w + (s > 0 ? 0 : Math.PI + 0.45);
        this.set(S + 'Thigh', -pelvisX - 0.15 - 0.85 * Math.sin(p), 0, s * 0.08);
        this.set(S + 'Knee', 0.2 + 1.3 * Math.max(0, Math.sin(p + 1.1)), 0, 0);
        this.set(S + 'Foot', 0.3 * Math.max(0, Math.sin(p + 0.3)), 0, 0);
        this.set(S + 'Shoulder', -0.1, 0, s * 0.15);
        this.set(S + 'UpperArm', -1.45 + 0.3 * Math.sin(p), 0, s * 0.42);          // reaching out ahead of it
        this.set(S + 'Elbow', 0.5 + 0.2 * Math.sin(p * 1.3), s * 0.6, 0);           // bent backwards
        this.set(S + 'Hand', -0.3, 0, 0);
        for (let f = 0; f < 5; f++) { const sp = -0.1 + 0.4 * Math.sin(T * 13 + f * 1.7 + s); this.set(`${S}Finger${f}`, sp, 0, s * (f - 2) * 0.2); this.set(`${S}Finger${f}Tip`, sp, 0, 0); }
      }
      hip -= 0.02 * Math.abs(Math.sin(w));
    } else if (st === 'attack') {
      this.attackT += this.dt;
      const a = Math.min(1, this.attackT / 0.35);
      this.set('Pelvis', 0.25, 0, 0);
      this.set('Torso', 0.45 + 0.45 * a, 0, 0);
      this.set('Neck', -0.3, 0, 0);
      this.set('Head', -0.3 + lp, look, 1.25 * a);                                   // the head rolls over sideways as it lunges
      for (const [S, s] of SIDES) {
        this.set(S + 'Shoulder', -0.2, 0, s * 0.1);
        this.set(S + 'UpperArm', -1.65 * a - 0.2, 0, s * (0.35 - 0.25 * a));
        this.set(S + 'Elbow', 0.1, s * 0.3, 0);
        this.set(S + 'Hand', -0.25, 0, 0);
        for (let f = 0; f < 5; f++) { this.set(`${S}Finger${f}`, -0.45, 0, s * (f - 2) * 0.3); this.set(`${S}Finger${f}Tip`, -0.3, 0, 0); }
      }
      this.set('LeftThigh', -0.25 - 0.8 * a, 0, 0.06); this.set('RightThigh', -0.25 + 0.45 * a, 0, -0.06);
      this.set('LeftKnee', 0.3, 0, 0); this.set('RightKnee', 0.7, 0, 0);
      hip -= 0.15 * a;
    }
    this.pelvisY = hip;
  }

  planHead(ctx) {
    const H = this.head, r = this.rng;
    H.hold -= this.dt;
    if (H.hold > 0) return;
    const st = this.state, roll = r();
    H.snap = st === 'stalk' && r() < 0.5;                // sudden turns while it walks
    if (roll < 0.5) { H.follow = true; H.yaw = 0; H.roll = (r() - 0.5) * 0.2; H.pitch = (ctx.lookPitch || 0) * 0.6; H.hold = 1.5 + r() * 3; }
    else if (roll < 0.8) {                               // an uncomfortable tilt, held
      H.follow = true; H.yaw = (r() - 0.5) * 0.6; H.roll = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.55); H.pitch = (r() - 0.3) * 0.5; H.hold = 3 + r() * 3.5;
    } else { H.follow = false; H.yaw = (r() - 0.5) * 4.2; H.roll = (r() - 0.5) * 0.9; H.pitch = (r() - 0.5) * 0.6; H.hold = 0.8 + r() * 1.6; }   // a turn no neck should manage
  }

  apply(dt) {
    const st = this.state, k = 1 - Math.exp(-RATE[st] * dt), hk = 1 - Math.exp(-(this.head.snap || st === 'scurry' ? 26 : 5) * dt);
    for (const name in this.t) {
      const g = this.j[name]; if (!g) continue;
      const [x, y, z] = this.t[name], q = name === 'Head' || name === 'Neck' ? hk : k, r = g.rotation;
      r.x += (x - r.x) * q; r.y += (y - r.y) * q; r.z += (z - r.z) * q;
    }
    const p = this.j.Pelvis.position; p.y += (this.pelvisY - p.y) * k;
    const c = this.m.chest.scale, b = this.breath;
    c.x += (b - c.x) * k; c.z += (1 + (b - 1) * 1.6 - c.z) * k;
  }
}
