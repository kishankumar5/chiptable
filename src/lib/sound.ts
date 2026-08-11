// Tiny synthesised sound effects. No audio files, no library, no autoplay:
// the AudioContext is only created after the player's first tap.

import { setSoundEnabled, soundEnabled } from './session.ts';

type Cue = 'tap' | 'chip' | 'pot' | 'win' | 'hand' | 'turn' | 'fold';

let ctx: AudioContext | null = null;
let on = true;

export function initSound() {
  on = soundEnabled();
}

export function isSoundOn() {
  return on;
}

export function toggleSound() {
  on = !on;
  setSoundEnabled(on);
  if (on) play('tap');
  return on;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  amp.gain.setValueAtTime(0.0001, ac.currentTime + start);
  amp.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

/** A short burst of noise — the clatter of chips. */
function clack(start: number, gain = 0.18) {
  const ac = audio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * 0.06);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(ac.currentTime + start);
}

export function play(cue: Cue) {
  if (!on) return;
  switch (cue) {
    case 'tap':
      tone(880, 0, 0.05, 0.07, 'triangle');
      break;
    case 'chip':
      clack(0);
      clack(0.045, 0.12);
      break;
    case 'pot':
      clack(0);
      clack(0.05, 0.14);
      clack(0.1, 0.1);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.22, 0.12, 'triangle'));
      clack(0.02, 0.2);
      break;
    case 'hand':
      tone(392, 0, 0.12, 0.09, 'sine');
      tone(587, 0.08, 0.16, 0.09, 'sine');
      break;
    case 'turn':
      tone(1046, 0, 0.09, 0.11, 'sine');
      tone(1318, 0.09, 0.12, 0.11, 'sine');
      break;
    case 'fold':
      tone(220, 0, 0.14, 0.07, 'sawtooth');
      break;
  }
}

/** Subtle haptics where the platform supports it. Silently ignored elsewhere. */
export function buzz(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
