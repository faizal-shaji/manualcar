/*
 * All sounds are synthesized with the Web Audio API. Browsers only allow audio after the first
 * click or key press, and starting a round is one.
 */

const MUTE_KEY = 'manualcar.muted';

let context: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // Storage is unavailable: keep the sound on.
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  start: number,
  length: number,
  volume: number,
  type: OscillatorType,
  slideTo?: number,
) {
  const a = audio();
  if (!a) return;
  const oscillator = a.createOscillator();
  const gain = a.createGain();
  const t = a.currentTime + start;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, t);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  oscillator.connect(gain).connect(a.destination);
  oscillator.start(t);
  oscillator.stop(t + length + 0.02);
}

function noise(
  length: number,
  volume: number,
  frequency: number,
  start: number,
  type: BiquadFilterType,
) {
  const a = audio();
  if (!a) return;
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * length), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.frequency.value = frequency;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start(a.currentTime + start);
}

/** The running engine: two oscillators at its firing frequency through a low-pass filter. */
interface EngineNodes {
  low: OscillatorNode;
  high: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  /** Modulates the volume for the judder and the rev limiter. */
  wobble: OscillatorNode;
  wobbleDepth: GainNode;
}

let engineNodes: EngineNodes | null = null;

export const engineSound = {
  start() {
    const a = audio();
    if (!a || engineNodes) return;
    const low = a.createOscillator();
    const high = a.createOscillator();
    const mix = a.createGain();
    const filter = a.createBiquadFilter();
    const gain = a.createGain();
    const wobble = a.createOscillator();
    const wobbleDepth = a.createGain();
    low.type = 'sawtooth';
    high.type = 'square';
    mix.gain.value = 0.35;
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.value = 500;
    gain.gain.value = 0;
    wobble.frequency.value = 8;
    wobbleDepth.gain.value = 0;
    low.connect(filter);
    high.connect(mix).connect(filter);
    filter.connect(gain).connect(a.destination);
    wobble.connect(wobbleDepth).connect(gain.gain);
    low.start();
    high.start();
    wobble.start();
    engineNodes = { low, high, filter, gain, wobble, wobbleDepth };
  },

  /** Follows the engine: rpm, load (0 to 1), judder (0 to 1) and whether it's at the rev limiter. */
  update(rpm: number, load: number, judder: number, atLimiter: boolean) {
    if (!engineNodes || !context) return;
    const t = context.currentTime;
    // A four-cylinder engine fires twice per revolution.
    const frequency = Math.max(14, rpm / 30);
    engineNodes.low.frequency.setTargetAtTime(frequency, t, 0.03);
    engineNodes.high.frequency.setTargetAtTime(frequency * 2.01, t, 0.03);
    engineNodes.filter.frequency.setTargetAtTime(220 + rpm * 0.32 + load * 500, t, 0.05);
    const volume = 0.05 + load * 0.035 + (rpm / 7000) * 0.03;
    engineNodes.gain.gain.setTargetAtTime(volume, t, 0.04);
    engineNodes.wobble.frequency.setTargetAtTime(atLimiter ? 17 : 6 + judder * 5, t, 0.02);
    const depth = atLimiter ? volume * 0.9 : judder * volume * 0.85;
    engineNodes.wobbleDepth.gain.setTargetAtTime(depth, t, 0.03);
  },

  stop() {
    if (!engineNodes || !context) return;
    const { low, high, wobble, gain } = engineNodes;
    const t = context.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, 0.05);
    for (const oscillator of [low, high, wobble]) oscillator.stop(t + 0.4);
    engineNodes = null;
  },
};

export const sfx = {
  gearIn() {
    noise(0.06, 0.16, 700, 0, 'lowpass');
    tone(150, 0, 0.07, 0.07, 'square', 90);
  },
  /** A gear refused because the car is too fast for it. */
  grind() {
    noise(0.32, 0.2, 3200, 0, 'bandpass');
    tone(190, 0, 0.3, 0.05, 'sawtooth', 150);
  },
  stall() {
    tone(80, 0, 0.4, 0.13, 'sawtooth', 28);
    noise(0.12, 0.14, 500, 0.05, 'lowpass');
    noise(0.1, 0.1, 400, 0.22, 'lowpass');
  },
  bang() {
    noise(0.7, 0.4, 600, 0, 'lowpass');
    tone(95, 0, 0.6, 0.16, 'square', 35);
    noise(1.2, 0.08, 4000, 0.3, 'highpass');
  },
  timeUp() {
    tone(392, 0, 0.22, 0.08, 'square', 330);
    tone(294, 0.2, 0.45, 0.08, 'square', 196);
  },
  /** Each of the last seconds on the clock. */
  tick() {
    tone(1400, 0, 0.035, 0.035, 'square');
  },
  lightGreen() {
    tone(988, 0, 0.09, 0.04, 'sine');
  },
  finish() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.24, 0.07, 'triangle'));
  },
  allRoundsDone() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.3, 0.07, 'triangle'));
  },
};

export function isSoundOn() {
  return !muted;
}

/** Turns the sound on or off, remembered in this browser. Returns whether it's now on. */
export function toggleSound(): boolean {
  muted = !muted;
  if (muted) engineSound.stop();
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage is unavailable: the setting lasts until the page closes.
  }
  return !muted;
}
