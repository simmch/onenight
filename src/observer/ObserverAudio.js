// Synthesised, positional sound for the Observer: footsteps, breathing, the hunt, and the small
// disturbances it causes. rel is the sound's bearing from where the player faces (+ = to the left), in radians.
// clips (optional): recorded jump-scare sounds, { screech, shriek } AudioBuffers. Missing ones fall back to synthesis.
export function createObserverAudio(ac, dest, noiseBuffer, bonesBuffer, clips = {}) {
  const out = ac.createGain(); out.connect(dest);
  let screeching = null;
  function playBuffer(buffer, node, vol) {
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buffer; g.gain.value = vol;
    src.connect(g).connect(node); src.start();
    return { src, g };
  }
  function place(rel, dist, maxDist, vol) {
    const gain = ac.createGain(), pan = ac.createStereoPanner(), lp = ac.createBiquadFilter();
    const k = Math.max(0, 1 - dist / maxDist);
    gain.gain.value = vol * k * k;
    pan.pan.value = Math.max(-1, Math.min(1, -Math.sin(rel)));
    lp.type = 'lowpass'; lp.frequency.value = Math.cos(rel) < -0.2 ? 1300 : 5200;      // dull when it comes from behind
    gain.connect(pan).connect(lp).connect(out);
    return gain;
  }
  function burst(node, type, f0, f1, dur, vol, at = 0) {
    const t = ac.currentTime + at, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuffer; src.loop = true; f.type = type;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(node); src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }
  function tone(node, type, f0, f1, dur, vol, at = 0) {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0008, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(node); o.start(t); o.stop(t + dur + 0.05);
  }
  // breathing: one looping noise band whose level and pan follow the creature
  const bSrc = ac.createBufferSource(), bF = ac.createBiquadFilter(), bG = ac.createGain(), bP = ac.createStereoPanner(), bL = ac.createBiquadFilter();
  bSrc.buffer = noiseBuffer; bSrc.loop = true; bF.type = 'bandpass'; bF.frequency.value = 520; bF.Q.value = 1.4; bG.gain.value = 0;
  bL.type = 'lowpass'; bL.frequency.value = 4000;
  bSrc.connect(bF).connect(bG).connect(bP).connect(bL).connect(out); bSrc.start();
  let bPhase = 0;
  // bone crackle while it is actually moving; faint far away, loud up close
  let boneSrc = null, boneGain = null, bonePan = null;
  if (bonesBuffer) {
    boneSrc = ac.createBufferSource(); boneSrc.buffer = bonesBuffer; boneSrc.loop = true;
    boneGain = ac.createGain(); boneGain.gain.value = 0;
    bonePan = ac.createStereoPanner();
    boneSrc.connect(boneGain).connect(bonePan).connect(out); boneSrc.start();
  }
  return {
    out,
    // a foot coming down, unevenly; now and then a joint cracks with it
    step(rel, dist, vol, heavy = 1) {
      const n = place(rel, dist, 34, vol);
      tone(n, 'sine', 95 * heavy, 42, 0.16, 0.9);
      burst(n, 'lowpass', 900, 200, 0.12, 0.5);
      if (Math.random() < 0.18) burst(n, 'highpass', 3800, 5200, 0.03, 0.4, 0.05 + Math.random() * 0.08);
    },
    // level 0..1; call every frame
    breath(dt, rel, dist, level, maxDist = 22) {
      bPhase += dt * (0.55 + 0.25 * Math.sin(bPhase * 0.3));
      const k = Math.max(0, 1 - dist / maxDist), cyc = Math.sin(bPhase * Math.PI * 2);
      const env = cyc > 0 ? cyc ** 1.5 : 0.35 * (-cyc) ** 2;                   // wet inhale, shorter rattle out
      bG.gain.setTargetAtTime(level * k * k * (0.15 + env) * 0.55, ac.currentTime, 0.05);
      bF.frequency.setTargetAtTime(cyc > 0 ? 620 : 380, ac.currentTime, 0.08);
      bP.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(rel))), ac.currentTime, 0.05);
      bL.frequency.setTargetAtTime(Math.cos(rel) < -0.2 ? 1500 : 4500, ac.currentTime, 0.1);
    },
    // moving: keep the crackle with it. Standing still fades it out.
    bones(moving, rel, dist) {
      if (!boneGain) return;
      const k = Math.max(0, Math.min(1, 1 - Math.max(0, dist - 2.5) / 38));
      const vol = moving ? 0.035 + k * k * 0.8 : 0;
      boneGain.gain.setTargetAtTime(vol, ac.currentTime, moving ? 0.08 : 0.15);
      bonePan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(rel))), ac.currentTime, 0.06);
    },
    snap(rel, dist) { burst(place(rel, dist, 40, 1.1), 'highpass', 2600, 1800, 0.06, 1); },                // a branch underfoot
    knock(rel, dist) { const n = place(rel, dist, 40, 1); tone(n, 'sine', 160, 90, 0.12, 0.8); tone(n, 'sine', 150, 85, 0.12, 0.7, 0.32); },
    creak(rel, dist) { const n = place(rel, dist, 40, 0.8); tone(n, 'sawtooth', 210, 140, 0.9, 0.12); burst(n, 'bandpass', 900, 600, 0.9, 0.15); },
    rocks(rel, dist) { const n = place(rel, dist, 40, 1); for (let i = 0; i < 6; i++) burst(n, 'lowpass', 1400, 300, 0.12, 0.6, i * 0.07 + Math.random() * 0.05); },
    whisper(rel, dist) { burst(place(rel, dist, 30, 0.7), 'bandpass', 2400, 1200, 1.4, 0.35); },
    // a fire is lit: a long, cracked moan from wherever it is, so you know it heard
    howl(rel, dist) {
      const n = place(rel, dist, 90, 1.3);
      tone(n, 'sawtooth', 150, 95, 2.4, 0.32); tone(n, 'sawtooth', 157, 88, 2.4, 0.22, 0.05);
      burst(n, 'bandpass', 700, 380, 2.2, 0.45);
    },
    // one breath let out, close by, then nothing
    exhale(rel, dist) { burst(place(rel, dist, 14, 1.1), 'bandpass', 640, 300, 1.3, 0.55); },
    // the click of a flashlight going off, far away
    click(rel, dist) { burst(place(rel, dist, 45, 1.2), 'highpass', 3200, 2400, 0.03, 0.9); },
    // stared at too long: a wet hiss
    hiss(rel, dist) { burst(place(rel, dist, 40, 1.2), 'highpass', 2800, 1400, 0.9, 0.6); tone(place(rel, dist, 40, 0.8), 'sawtooth', 120, 70, 0.7, 0.2); },
    // everything stops, and something very low drops out from under it
    sting() { tone(out, 'sine', 70, 28, 2.6, 0.9); burst(out, 'lowpass', 300, 40, 2.2, 0.5); tone(out, 'triangle', 1900, 1500, 1.1, 0.05, 0.1); },
    // it comes for you: a screech from where it is, loud enough to be heard a long way off
    screech(rel, dist) {
      if (!clips.screech) { this.howl(rel, dist); return; }
      if (screeching) { try { screeching.src.stop(); } catch (e) { /* done */ } }
      screeching = playBuffer(clips.screech, place(rel, Math.min(dist, 12), 90, 1.6), 1);
    },
    // it is on you: the shriek, full volume, dead centre. Cuts off the screech.
    shriek() {
      if (screeching) { const t = ac.currentTime; screeching.g.gain.setTargetAtTime(0, t, 0.03); try { screeching.src.stop(t + 0.2); } catch (e) { /* done */ } screeching = null; }
      if (clips.shriek) playBuffer(clips.shriek, out, 1.4);
      else { burst(out, 'bandpass', 1400, 300, 0.7, 2.2); tone(out, 'sawtooth', 90, 30, 0.8, 0.8); }
    },
    capture() { this.shriek(); },
    stop() { bG.gain.setTargetAtTime(0, ac.currentTime, 0.05); if (boneGain) boneGain.gain.setTargetAtTime(0, ac.currentTime, 0.05); },
  };
}
