import { GEARS } from './sim/car';

/*
 * All sounds are synthesized with the Web Audio API. Browsers only allow audio after the first
 * click or key press, and starting a round is one.
 */

const MUTE_KEY = 'manualcar.muted';
/** The rush of wind and tyres is at its loudest from this speed. */
const WIND_FULL_KMH = 140;

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

/** White noise to loop. */
function noiseLoop(a: AudioContext, seconds: number) {
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = a.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * The running engine: a sawtooth at its firing frequency, a square wave an octave up for the rasp
 * and a triangle an octave down for the rumble, through a low-pass filter. Beside it, filtered
 * noise for the wind and the tyres.
 */
interface EngineNodes {
  firing: OscillatorNode;
  rasp: OscillatorNode;
  rumble: OscillatorNode;
  raspLevel: GainNode;
  rumbleLevel: GainNode;
  filter: BiquadFilterNode;
  /** Dips for a moment at each gear change. */
  shiftDip: GainNode;
  gain: GainNode;
  /** Modulates the volume for the judder and the rev limiter. */
  wobble: OscillatorNode;
  wobbleDepth: GainNode;
  wind: AudioBufferSourceNode;
  windFilter: BiquadFilterNode;
  windGain: GainNode;
}

export interface EngineReading {
  rpm: number;
  /** The throttle, from 0 to 1. */
  load: number;
  /** From 0 to 1. */
  judder: number;
  atLimiter: boolean;
  gear: number;
  kmh: number;
}

let engineNodes: EngineNodes | null = null;

export const engineSound = {
  start() {
    const a = audio();
    if (!a || engineNodes) return;
    const firing = a.createOscillator();
    const rasp = a.createOscillator();
    const rumble = a.createOscillator();
    const raspLevel = a.createGain();
    const rumbleLevel = a.createGain();
    const filter = a.createBiquadFilter();
    const shiftDip = a.createGain();
    const gain = a.createGain();
    const wobble = a.createOscillator();
    const wobbleDepth = a.createGain();
    firing.type = 'sawtooth';
    rasp.type = 'square';
    rumble.type = 'triangle';
    raspLevel.gain.value = 0.35;
    rumbleLevel.gain.value = 0.3;
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.value = 500;
    gain.gain.value = 0;
    wobble.frequency.value = 8;
    wobbleDepth.gain.value = 0;
    firing.connect(filter);
    rasp.connect(raspLevel).connect(filter);
    rumble.connect(rumbleLevel).connect(filter);
    filter.connect(shiftDip).connect(gain).connect(a.destination);
    wobble.connect(wobbleDepth).connect(gain.gain);

    const wind = noiseLoop(a, 2);
    const windFilter = a.createBiquadFilter();
    const windGain = a.createGain();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(a.destination);

    for (const source of [firing, rasp, rumble, wobble, wind]) source.start();
    engineNodes = {
      firing,
      rasp,
      rumble,
      raspLevel,
      rumbleLevel,
      filter,
      shiftDip,
      gain,
      wobble,
      wobbleDepth,
      wind,
      windFilter,
      windGain,
    };
  },

  /** Follows the engine and the road speed. */
  update({ rpm, load, judder, atLimiter, gear, kmh }: EngineReading) {
    if (!engineNodes || !context) return;
    const nodes = engineNodes;
    const t = context.currentTime;
    // A four-cylinder engine fires twice per revolution.
    const frequency = Math.max(14, rpm / 30);
    nodes.firing.frequency.setTargetAtTime(frequency, t, 0.03);
    nodes.rasp.frequency.setTargetAtTime(frequency * 2.01, t, 0.03);
    nodes.rumble.frequency.setTargetAtTime(frequency / 2, t, 0.03);
    // The higher the gear, the deeper and smoother the note: more rumble, less rasp.
    const tall = gear / GEARS;
    nodes.rumbleLevel.gain.setTargetAtTime(0.3 + 0.5 * tall, t, 0.15);
    nodes.raspLevel.gain.setTargetAtTime(0.35 - 0.15 * tall, t, 0.15);
    const cutoff = 220 + rpm * (0.32 - 0.08 * tall) + load * 500;
    nodes.filter.frequency.setTargetAtTime(cutoff, t, 0.05);
    const volume = 0.05 + load * 0.035 + (rpm / 7000) * 0.03;
    nodes.gain.gain.setTargetAtTime(volume, t, 0.04);
    nodes.wobble.frequency.setTargetAtTime(atLimiter ? 17 : 6 + judder * 5, t, 0.02);
    const depth = atLimiter ? volume * 0.9 : judder * volume * 0.85;
    nodes.wobbleDepth.gain.setTargetAtTime(depth, t, 0.03);
    const rush = Math.min(1, kmh / WIND_FULL_KMH);
    nodes.windFilter.frequency.setTargetAtTime(300 + rush * 1100, t, 0.1);
    nodes.windGain.gain.setTargetAtTime(rush * rush * 0.07, t, 0.1);
  },

  /** A gear change: the throttle lifts and the clutch goes down for a moment. */
  shift() {
    if (!engineNodes || !context) return;
    const dip = engineNodes.shiftDip.gain;
    const t = context.currentTime;
    dip.cancelScheduledValues(t);
    dip.setValueAtTime(1, t);
    dip.linearRampToValueAtTime(0.35, t + 0.04);
    dip.linearRampToValueAtTime(1, t + 0.2);
  },

  stop() {
    if (!engineNodes || !context) return;
    const { firing, rasp, rumble, wobble, wind, gain, windGain } = engineNodes;
    const t = context.currentTime;
    for (const level of [gain.gain, windGain.gain]) {
      level.cancelScheduledValues(t);
      level.setTargetAtTime(0, t, 0.05);
    }
    for (const source of [firing, rasp, rumble, wobble, wind]) source.stop(t + 0.4);
    engineNodes = null;
  },
};

export const sfx = {
  gearIn() {
    noise(0.06, 0.16, 700, 0, 'lowpass');
    tone(150, 0, 0.07, 0.07, 'square', 90);
  },
  /** Exhaust pops as the throttle snaps shut at high revs. */
  pops() {
    noise(0.05, 0.18, 900, 0.03, 'lowpass');
    noise(0.04, 0.12, 1100, 0.1, 'lowpass');
    noise(0.04, 0.08, 800, 0.17, 'lowpass');
  },
  /** Tyres squealing as a gear far too low for the speed goes in. */
  screech() {
    noise(0.4, 0.12, 2500, 0, 'bandpass');
    tone(1200, 0, 0.36, 0.03, 'triangle', 900);
  },
  /** A wheel going over a speed bump: a thud, harder the faster it goes. */
  bump(kmh: number) {
    const hard = Math.min(1, kmh / 55);
    tone(90, 0, 0.12, 0.03 + hard * 0.09, 'sine', 50);
    noise(0.08, 0.04 + hard * 0.16, 400, 0, 'lowpass');
  },
  /** Flipping over a speed bump: the hit, then the landing on the roof and the scrape after it. */
  crash(landing: number) {
    noise(0.25, 0.3, 900, 0, 'lowpass');
    tone(130, 0, 0.2, 0.1, 'square', 70);
    noise(0.6, 0.45, 700, landing, 'lowpass');
    tone(85, landing, 0.45, 0.15, 'square', 32);
    noise(0.9, 0.08, 3200, landing + 0.05, 'bandpass');
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
