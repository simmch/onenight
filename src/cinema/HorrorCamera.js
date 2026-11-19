const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);

const reactions = {
  hit: { pitch: 0.027, roll: 0.028, dip: 0.032, focus: 0.8, decay: 10 },
  hound: { pitch: -0.012, roll: 0.025, dip: 0.018, focus: 0.9, decay: 11 },
  stomp: { pitch: -0.017, roll: 0.015, dip: 0.045, focus: 0.5, decay: 6 },
  rumble: { pitch: -0.016, roll: 0.009, dip: 0.029, focus: 0.8, decay: 6 },
  breach: { pitch: 0.045, roll: 0.023, dip: 0.05, focus: 1.2, decay: 8 },
  door: { pitch: -0.009, roll: 0.012, dip: 0.01, focus: 0.4, decay: 7 },
};

export function createHorrorCamera() {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const impulses = [];
  let previousYaw, turn = 0, stride = 0, run = 0, breath = 0, stop = 0, height = 0;
  let attention = 0, exposure = 0, mist = 0, ghosting = 0;
  let wasMoving = false, lastGround, stepLift = 0;

  function kick(kind, strength, bearing = 0) {
    if (media.matches || strength <= 0) return;
    impulses.push({ profile: reactions[kind], strength: Math.min(strength, 1), bearing, age: 0 });
    if (impulses.length > 8) impulses.shift();
  }

  function sample(dt, { active, yaw, bob, moving, running, ads, hold, strain, threat, glance, floor, ground,
    lit, lightbound, ghost, moisture }) {
    const motion = active && !media.matches;
    if (!motion) {
      impulses.length = 0;
      previousYaw = undefined;
      wasMoving = false;
      lastGround = undefined;
      stepLift = 0;
      turn = stride = run = breath = stop = height = attention = exposure = mist = ghosting = 0;
      return { y: 0, pitch: 0, yaw: 0, roll: 0, fov: 0, exposure: 0, mist: 0, ghosting: 0, edge: 0 };
    }
    const free = (1 - ads) ** 2;
    const turnRate = previousYaw === undefined ? 0 : angleDelta(yaw - previousYaw) / Math.max(dt, 0.001);
    previousYaw = yaw;
    turn = approach(turn, clamp(turnRate * 0.003, -0.023, 0.023), 13, dt);
    if (!moving && wasMoving && run > 0.6) stop = 0.022;
    wasMoving = moving;
    stop = approach(stop, 0, 9, dt);
    stride = approach(stride, moving ? 1 : 0, moving ? 9 : 12, dt);
    run = approach(run, running ? 1 : 0, 7, dt);
    height = approach(height, floor, 6, dt);
    const rise = ground - (lastGround ?? ground);
    stepLift = approach(stepLift, moving && rise > 0 && rise < 0.18 ? Math.min(0.026, rise * 1.4) : 0, 10, dt);
    lastGround = ground;
    breath += dt * (1.55 + strain * 1.75 + threat * 0.9);
    const inhale = Math.sin(breath) * (hold ? 0.1 : 1) * (0.006 + strain * 0.008 + threat * 0.004);
    attention = approach(attention, clamp(glance, -0.017, 0.017), glance ? 4 : 18, dt);
    exposure = approach(exposure, lightbound ? (lit ? 0.09 : -0.07) : lit ? 0 : 0.12, lit ? 7 : 1.9, dt);
    mist = approach(mist, moisture, 2.2, dt);
    ghosting = approach(ghosting, ghost, ghost ? 9 : 4, dt);
    const strike = (1 - Math.abs(Math.sin(bob))) ** 6;
    let dip = stop, pitch = -stop * 0.28, roll = -turn, focus = 0;
    for (let i = impulses.length - 1; i >= 0; i--) {
      const cue = impulses[i], { profile, strength, bearing } = cue;
      cue.age += dt;
      if (cue.age * profile.decay >= 5) { impulses.splice(i, 1); continue; }
      const pulse = Math.min(1, cue.age * 48) * Math.exp(-cue.age * profile.decay) * strength;
      dip += pulse * profile.dip;
      pitch += pulse * profile.pitch;
      roll += pulse * profile.roll * (Math.sin(bearing) || 0.15);
      focus += pulse * profile.focus;
    }
    return {
      y: height + free * (stepLift + inhale * (1 - stride * 0.75) + Math.sin(bob) * stride * 0.022 - run * strike * 0.035 - Math.min(0.08, dip)),
      pitch: free * clamp(pitch - run * strike * 0.012 + inhale * 0.45, -0.06, 0.06),
      yaw: free * attention,
      roll: free * clamp(roll + run * Math.sin(bob) * 0.019, -0.045, 0.045),
      fov: free * (run * 1.2 - Math.min(focus, 1.7)),
      exposure, mist, ghosting,
      edge: 0.10 + strain * 0.16 + threat * 0.09 + (lit ? 0 : 0.07),
    };
  }
  return { kick, sample, get reduced() { return media.matches; } };
}
