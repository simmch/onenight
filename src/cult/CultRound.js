import * as THREE from 'three';
import { buildCultHall, PULPIT_Z } from './CultHall.js';
import { createCultTrial } from './CultDialogue.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const INTERRUPTIONS = {
  1: { line: 'The attendants change their grip while the leader turns a page.', options: [
    ['loosen', 'Twist one wrist under the knot.'], ['ground', 'Listen for the congregation’s words.'], ['doubt', 'Watch the person in the pew who has gone quiet.'],
  ] },
  3: { line: 'An attendant steps in front of you. Something hard knocks against the back of the pew.', options: [
    ['gun', 'Look down at the attendant’s sash.'], ['ground', 'Breathe slowly and let the attendant pass.'], ['loosen', 'Work your other wrist against the rope.'],
  ] },
};

export function createCultRound({ root, aspect, render, sound, onWin, onConversion }) {
  const fade = root.querySelector('.cult-fade');
  const plaque = root.querySelector('.cult-plaque');
  const panel = root.querySelector('.cult-panel');
  const speaker = root.querySelector('.cult-speaker');
  const line = root.querySelector('.cult-line');
  const cue = root.querySelector('.cult-cue');
  const choices = root.querySelector('.cult-choices');
  const aim = root.querySelector('.cult-aim');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let hall = null, trial = null, phase = 'idle', age = 0, time = 0, index = 0;
  let shot = 0, nextStep = 0, action = '', walking = false, result = '';
  let heard = '', heardText = '', buttons = [];

  function dialogue(who, words, detail = '') {
    speaker.textContent = who;
    line.textContent = words;
    cue.textContent = detail;
    panel.hidden = !words;
  }

  function offer(options, numbers = false) {
    buttons = options.map(({ text, run }, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      if (numbers) {
        const key = document.createElement('span');
        key.className = 'cult-key'; key.textContent = i + 1; key.setAttribute('aria-hidden', 'true');
        button.append(key);
        button.setAttribute('aria-keyshortcuts', String(i + 1));
      }
      button.append(text);
      button.addEventListener('click', () => {
        if (buttons[i] === button) run();
      });
      return button;
    });
    choices.replaceChildren(...buttons);
    buttons[0]?.focus({ preventScroll: true });
  }

  function enter(name) {
    phase = name; age = 0;
    offer([]);
    aim.hidden = true;
    dialogue('', '');
    plaque.hidden = true;
    switch (name) {
      case 'capture':
        plaque.hidden = false;
        dialogue('', 'The hand on your shoulder pushes again.');
        sound.chant(0.11); sound.cue('door');
        break;
      case 'procession': sound.chant(0.30); break;
      case 'creed':
        dialogue(trial.leader.name, trial.doctrine.creed, `The pews answer, “${trial.doctrine.refrain}”`);
        sound.chant(0.13); sound.cue('stop');
        break;
      case 'instruction':
        dialogue(trial.leader.name, trial.doctrine.instruction, `The refrain is written on the lectern. “${trial.doctrine.refrain}”`);
        sound.chant(0.07);
        break;
      case 'question': {
        action = '';
        const question = trial.question(index);
        dialogue(trial.leader.name, question.line, question.context);
        offer(question.options.map(option => ({ text: option.text, run() {
          heardText = option.text;
          heard = trial.answer(index, option.type);
          enter('reaction');
        } })), true);
        break;
      }
      case 'reaction':
        dialogue('You', heardText);
        sound.chant(trial.mood === 'restless' ? 0.22 : trial.mood === 'eager' ? 0.16 : 0.046);
        if (trial.mood !== 'hushed') sound.cue('pews');
        break;
      case 'struggle': {
        const moment = INTERRUPTIONS[index];
        dialogue('', moment.line);
        offer(moment.options.map(([move, text]) => ({ text, run() {
          action = move;
          result = trial.interruption(index, move);
          enter('struggleResult');
        } })), true);
        break;
      }
      case 'struggleResult':
        dialogue('', result); sound.cue(action === 'loosen' ? 'rope' : 'cloth');
        break;
      case 'verdict':
        dialogue(trial.leader.name, trial.leader.escape, 'The attendant at your right steps too close.');
        sound.cue('pews'); sound.chant(0.19);
        break;
      case 'break':
        dialogue('', 'You pull a hand through the knot and catch the pistol in the attendant’s sash.');
        sound.cue('rope'); sound.chant(0.24);
        break;
      case 'aim':
        aim.hidden = false; sound.chant(0.16);
        break;
      case 'escape':
        shot = 1; sound.cue('shot'); sound.chant(0, 0.22);
        break;
      case 'return':
        dialogue('', 'The hall goes quiet behind you.');
        offer([{ text: 'Return to the night', run() { stop(); onWin(); } }]);
        break;
      case 'convert':
        dialogue(trial.leader.name, trial.doctrine.verdict, 'The attendant raises a mask. The pews rise without a word.');
        sound.cue('pews'); sound.chant(0.24);
        break;
      case 'converted':
        dialogue('The congregation', trial.doctrine.refrain, 'Your own voice is the first to join them.');
        sound.chant(0.39);
        break;
    }
  }

  function start(context, sceneryRandom) {
    stop();
    trial = createCultTrial(context);
    hall = buildCultHall({ ...trial, random: sceneryRandom });
    time = index = shot = nextStep = 0;
    action = result = '';
    fade.style.opacity = '1';
    root.hidden = false;
    document.body.classList.add('cult-active');
    enter('capture');
  }

  function stop() {
    if (!hall) return;
    phase = 'idle'; hall.dispose(); hall = null; trial = null;
    sound.stop();
    offer([]);
    document.body.classList.remove('cult-active');
    root.hidden = true;
  }

  function advance(dt) {
    const crossed = mark => age >= mark && age - dt < mark;
    switch (phase) {
      case 'capture':
        if (crossed(2.50)) sound.cue('shove');
        if (age >= 4.4) enter('procession');
        break;
      case 'procession':
        if (crossed(4.8) || crossed(9.6)) sound.cue('shove');
        if (age >= 13.7) enter('creed');
        break;
      case 'creed':
        if (crossed(1.1)) offer([{ text: 'Listen', run: () => enter('instruction') }]);
        break;
      case 'instruction':
        if (crossed(1.1)) offer([{ text: 'Hear the first question', run: () => enter('question') }]);
        break;
      case 'reaction':
        if (crossed(2.15)) {
          dialogue(trial.leader.name, heard);
          offer([{ text: 'Continue', run() {
            if (index === trial.count - 1) enter(trial.escaped() ? 'verdict' : 'convert');
            else if (INTERRUPTIONS[index]) enter('struggle');
            else { index++; enter('question'); }
          } }]);
        }
        break;
      case 'struggleResult':
        if (crossed(0.85)) offer([{ text: 'Look back at the pulpit', run() { index++; enter('question'); } }]);
        break;
      case 'verdict':
        if (age >= 3.1) enter('break');
        break;
      case 'break':
        if (crossed(0.95)) sound.cue('shove');
        if (age >= 2.2) enter('aim');
        break;
      case 'aim':
        if (crossed(0.78)) {
          dialogue('', 'The leader reaches for the bell.');
          offer([{ text: 'Fire at the leader', run: () => enter('escape') }]);
        }
        break;
      case 'escape':
        if (crossed(0.36)) sound.cue('echo');
        if (crossed(2.1)) sound.cue('door');
        if (age >= 5.4) enter('return');
        break;
      case 'convert':
        if (crossed(1.6)) sound.cue('cloth');
        if (age >= 4.5) enter('converted');
        break;
      case 'converted':
        if (age >= 5.2) { stop(); onConversion(); }
        break;
    }
  }

  function frameCamera(reduced) {
    const cam = hall.camera, stage = PULPIT_Z;
    const aspectRatio = aspect();
    let x = 0.30, y = 1.63, z = -39.60, tx = 0, ty = 2.08, tz = stage, roll = 0, fov = 51;
    const wobble = reduced ? 0.12 : 1;
    walking = phase === 'procession' || (phase === 'escape' && age > 2.05);
    if (phase === 'capture') {
      const turn = smoothstep(age, 1.55, 3.65);
      x = lerp(0.21, 0, turn); y = lerp(1.32, 1.62, turn); z = lerp(8.55, 7.05, turn);
      tx = lerp(-0.83, 0, turn); ty = lerp(1.91, 2.30, turn); tz = lerp(9.07, -30, turn);
      roll = -0.09 * (1 - turn) * wobble; fov = 59;
    } else if (phase === 'procession') {
      const p = clamp(age / 13.7, 0, 1);
      const shove = Math.exp(-Math.max(0, age - 4.8) * 7) * Number(age >= 4.8) + Math.exp(-Math.max(0, age - 9.6) * 7) * Number(age >= 9.6);
      const glance = reduced ? 0 : 2.9 * (smoothstep(age, 3.0, 4.05) - smoothstep(age, 4.25, 5.25)) - 3.0 * (smoothstep(age, 8.1, 8.9) - smoothstep(age, 9.2, 10.1));
      x = Math.sin(age * 4.3) * 0.08 * wobble; y += Math.sin(age * 8.6) * 0.045 * wobble - shove * 0.15 * wobble;
      z = lerp(7.05, -39.6, p) - shove * 0.48 * wobble;
      tz = Math.max(stage, z - lerp(16, 4.05, Math.abs(glance) / 3)); tx = glance;
      ty = 1.86 + 0.26 * p - shove * 0.42 * wobble;
      roll = wobble * (Math.sin(age * 4.3) * 0.027 + glance * 0.018);
      fov = lerp(63, 51, p);
    } else if (phase === 'reaction' && age < 1.9) {
      const side = index % 2 === 0 ? 1 : -1;
      x = side * 0.55; z = -39.2; tx = side * 3.7; tz = -37.9; ty = 1.67; fov = 48;
      roll = side * 0.024 * wobble;
    } else if (phase === 'struggle' || phase === 'struggleResult') {
      x = 0.10; y = 1.48; tx = 0.52; ty = 0.57; tz = -40.8; fov = 57;
      roll = Math.sin(time * 5.4) * (action === 'loosen' ? 0.075 : 0.015) * wobble;
    } else if (phase === 'verdict' || phase === 'break' || phase === 'aim') {
      const surge = smoothstep(age, 0.4, 1.68);
      const ready = phase === 'aim' ? smoothstep(age, 0, 0.72) : 0;
      if (phase === 'break') {
        y -= Math.sin(surge * Math.PI) * 0.20; z += Math.sin(surge * Math.PI) * 0.43;
        tx += Math.sin(surge * Math.PI) * 0.56; ty -= Math.sin(surge * Math.PI) * 0.82;
        roll = Math.sin(surge * Math.PI) * -0.16 * wobble;
      }
      if (phase === 'aim') { x = lerp(0.30, 0.02, ready); ty = lerp(2.08, 2.22, ready); fov = lerp(51, 44, ready); }
    } else if (phase === 'escape' || phase === 'return') {
      if (age <= 2.05 && phase === 'escape') {
        y += shot * 0.13; ty = 2.22 + shot * 0.42 * wobble; fov = 44 + shot * 5;
        roll = shot * 0.07 * wobble;
      } else {
        const run = phase === 'return' ? 1 : clamp((age - 2.05) / 3.1, 0, 1);
        z = lerp(-15.5, 10.0, run); y = 1.68 + Math.sin(age * 13) * 0.10 * wobble;
        x = Math.sin(age * 6.5) * 0.15 * wobble; tx = 0; ty = 2.33; tz = z + 13;
        roll = Math.sin(age * 6.5) * 0.047 * wobble; fov = 66;
      }
    } else if (phase === 'convert') {
      x *= 1 - smoothstep(age, 0, 3); z -= smoothstep(age, 0, 3) * 0.4;
      y -= smoothstep(age, 0.4, 2.7) * 0.15; ty = 2.13; fov = 48;
    } else if (phase === 'converted') {
      x = -2.42; y = lerp(1.18, 1.69, smoothstep(age, 0.55, 2.8)); z = -27.93;
      ty = 2.4; fov = 58;
    }
    if (phase === 'creed' || phase === 'instruction' || phase === 'question' || phase === 'reaction' || phase === 'verdict') {
      ty -= clamp((1.4 - aspectRatio) / 0.68, 0, 1) * 0.64;
    }
    cam.position.set(x, y, z);
    cam.lookAt(tx, ty, tz);
    cam.rotateZ(roll);
    const vertical = fov + Math.max(0, 1.1 - aspectRatio) * 35;
    if (cam.aspect !== aspectRatio || cam.fov !== vertical) {
      cam.aspect = aspectRatio; cam.fov = vertical; cam.updateProjectionMatrix();
    }
  }

  function update(dt) {
    if (!hall) return false;
    time += dt; age += dt; shot = Math.max(0, shot - dt * 4.4);
    advance(dt);
    if (!hall) return true;
    const reduced = reducedMotion.matches;
    frameCamera(reduced);
    hall.pose({ phase, age, time, mood: trial.mood, beat: index, shot, action, walking, reduced });
    if (walking && nextStep <= time) { sound.cue(phase === 'escape' ? 'run' : 'step'); nextStep = time + (phase === 'escape' ? 0.29 : 0.51); }
    let darkness = 0;
    if (phase === 'capture') darkness = 1 - smoothstep(age, 0.25, 2.2);
    else if (phase === 'convert') darkness = smoothstep(age, 2.75, 3.65);
    else if (phase === 'converted') darkness = Math.max(1 - smoothstep(age, 0.08, 1.44), smoothstep(age, 3.6, 5.1));
    else if (phase === 'escape') darkness = Math.max(smoothstep(age, 4.33, 5.38), smoothstep(age, 1.7, 2.0) * (1 - smoothstep(age, 2.05, 2.4)));
    else if (phase === 'return') darkness = 1;
    fade.style.opacity = String(darkness);
    render(hall.scene, hall.camera);
    return true;
  }

  function key(event) {
    if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
    const number = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    if (!number && event.code !== 'Enter') return;
    if (event.code === 'Enter' && buttons.includes(document.activeElement)) return;
    const button = number ? buttons[Number(number[1]) - 1] : buttons.length === 1 ? buttons[0] : null;
    if (!button) return;
    event.preventDefault();
    button.click();
  }

  return { start, stop, update, key, get active() { return hall !== null; }, get phase() { return phase; } };
}
