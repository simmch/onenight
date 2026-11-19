const db = level => 10 ** (level / 20);

function roomImpulse(ctx, seconds, decay, taps) {
  const frames = Math.ceil(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
  let seed = 137;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let ear = 0; ear < 2; ear++) {
    const data = buffer.getChannelData(ear);
    const onset = Math.round(0.018 * ctx.sampleRate);
    let smear = 0;
    for (let frame = onset; frame < frames; frame++) {
      smear = smear * 0.58 + noise() * 0.42;
      data[frame] = smear * 0.15 * (1 - (frame - onset) / (frames - onset)) ** decay;
    }
    taps.forEach(([delay, level], i) => {
      const frame = Math.round((delay + ear * (i % 2 === 0 ? 0.007 : -0.004)) * ctx.sampleRate);
      data[frame] += level;
    });
  }
  return buffer;
}

export function createCinematicMix(ctx) {
  function eq(type, frequency, gain = 0, q = 0.707) {
    const node = ctx.createBiquadFilter();
    node.type = type; node.frequency.value = frequency; node.gain.value = gain; node.Q.value = q;
    return node;
  }
  function gain(level) {
    const node = ctx.createGain(); node.gain.value = level;
    return node;
  }
  const output = eq('highpass', 27);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -13;
  compressor.knee.value = 9;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.19;
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = Float32Array.from({ length: 2049 }, (_, i) => {
    const input = i / 1024 - 1, magnitude = Math.abs(input), knee = 0.68;
    return Math.sign(input) * (magnitude <= knee ? magnitude : knee + 0.25 * Math.tanh((magnitude - knee) / 0.25));
  });
  output.connect(compressor).connect(gain(db(-2))).connect(ceiling).connect(ctx.destination);

  function bus(level, filters = []) {
    const input = gain(db(level)), focus = gain(1), dip = gain(1);
    let end = input;
    for (const filter of filters) end = end.connect(filter);
    end.connect(focus).connect(dip).connect(output);
    return { input, focus: focus.gain, dip: dip.gain };
  }
  const music = bus(-2, [eq('peaking', 480, -1.7, 0.9)]);
  const ambience = bus(-2.5, [eq('lowshelf', 130, -2.2), eq('peaking', 1500, -2.4, 0.8)]);
  const foley = bus(-2, [eq('peaking', 250, -1.9, 0.85)]);
  const creatures = bus(-1, [eq('peaking', 330, -1.7, 1.1)]);
  const impacts = bus(-2, [eq('highshelf', 6500, -1.8)]);
  const cues = bus(-2, [eq('peaking', 3000, -1.6, 0.9)]);

  const reflections = gain(1);
  const room = ctx.createConvolver(), hall = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, 0.65, 4, [[0.022, 0.44], [0.040, 0.27], [0.065, -0.16], [0.092, 0.09]]);
  hall.buffer = roomImpulse(ctx, 2.1, 2.8, [[0.038, 0.43], [0.070, -0.28], [0.11, 0.22], [0.17, 0.12]]);
  const roomSend = gain(0.055), hallSend = gain(0);
  const reflectionTone = eq('lowpass', 3300);
  reflections.connect(roomSend).connect(room).connect(reflectionTone);
  reflections.connect(hallSend).connect(hall).connect(reflectionTone);
  reflectionTone.connect(eq('highpass', 125)).connect(output);
  function send(source, amount) {
    source.connect(gain(amount)).connect(reflections);
  }
  send(foley.input, 0.52);
  send(creatures.input, 0.82);
  send(impacts.input, 0.82);
  const hallCue = gain(0.88);
  const cueSend = gain(0.18);
  hallCue.connect(cues.input);
  hallCue.connect(cueSend).connect(hall);

  let lastSpace, lastMode, lastDuck = -Infinity, peakDuck = 0;
  function space(value) {
    if (value === lastSpace) return;
    lastSpace = value;
    const [short, long, cutoff] = {
      open: [0.055, 0, 2450],
      room: [0.22, 0.038, 3650],
      hall: [0.12, 0.25, 3150],
      confined: [0.14, 0.012, 2300],
    }[value];
    const t = ctx.currentTime;
    roomSend.gain.setTargetAtTime(short, t, 0.18);
    hallSend.gain.setTargetAtTime(long, t, 0.23);
    reflectionTone.frequency.setTargetAtTime(cutoff, t, 0.20);
  }
  function focus(mode) {
    if (mode === lastMode) return;
    lastMode = mode;
    const [score, air, body] = {
      normal: [1, 1, 1],
      breath: [0.76, 0.78, 1],
      hunt: [0.39, 0.66, 0.81],
      pause: [0.69, 0.72, 1],
      cinema: [0.53, 0.56, 0.88],
    }[mode];
    const t = ctx.currentTime, glide = mode === 'normal' ? 0.54 : 0.16;
    music.focus.setTargetAtTime(score, t, glide);
    ambience.focus.setTargetAtTime(air, t, glide);
    foley.focus.setTargetAtTime(body, t, glide);
  }
  function accent(strength) {
    const t = ctx.currentTime;
    peakDuck = Math.max(strength, peakDuck * Math.exp(-(t - lastDuck) / 0.42));
    lastDuck = t;
    for (const [param, depth] of [[music.dip, 0.36], [ambience.dip, 0.24]]) {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
      param.linearRampToValueAtTime(1 - depth * peakDuck, t + 0.028);
      param.setTargetAtTime(1, t + 0.105, 0.34);
    }
  }
  return {
    music: music.input, ambience: ambience.input, foley: foley.input, creatures: creatures.input,
    impacts: impacts.input, cues: cues.input, hallCue, space, focus, accent,
  };
}
