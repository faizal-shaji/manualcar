import { KMH_PER_PX } from './car';
import type { Round } from './rounds';

/** The road's profile is sampled every SAMPLE_STEP px. */
const SAMPLE_STEP = 8;
/** Hills are drawn this many times steeper than they pull, so they're easy to see coming. */
export const DRAWN_STEEPNESS = 3;
/** Roughly how far a change of grade is spread (px). */
const GRADE_BLEND = 480;
/** Where the car starts, and how much road there is past the finish line. */
export const START_X = 320;
const RUNOFF = 840;

export interface SpeedLimit {
  /** Where the limit starts. */
  at: number;
  kmh: number;
  /** The same limit in px/s. */
  speed: number;
}

export type LightState = 'red' | 'amber' | 'green';

export interface TrafficLight {
  /** Position of the light. */
  at: number;
  /** Seconds the light stays red once the car is waiting at it. */
  redTime: number;
  waited: number;
  state: LightState;
}

/** A round's road: its grade and drawn height everywhere, and what's on it. */
export class Road {
  readonly length: number;
  readonly finish: number;
  readonly limits: SpeedLimit[];
  readonly bumps: number[];
  readonly lights: TrafficLight[];
  readonly mud: { from: number; to: number }[];
  /** Start and grade (%, positive uphill) of each stretch, for the warning signs. */
  readonly segments: { at: number; grade: number }[] = [];
  private readonly grades: Float32Array;
  private readonly heights: Float32Array;

  constructor(round: Round) {
    this.length = round.segments.reduce((sum, [length]) => sum + length, 0);
    this.finish = this.length - RUNOFF;
    const n = Math.ceil(this.length / SAMPLE_STEP) + 2;
    let grades = new Float32Array(n);
    let x = 0;
    for (const [length, grade] of round.segments) {
      this.segments.push({ at: x, grade });
      const end = Math.min(n, Math.ceil((x + length) / SAMPLE_STEP));
      for (let i = Math.floor(x / SAMPLE_STEP); i < end; i++) grades[i] = grade;
      x += length;
    }
    // A running mean, applied twice, turns each change of grade into a smooth S-curve.
    const halfWidth = Math.round(GRADE_BLEND / SAMPLE_STEP / 4);
    for (let pass = 0; pass < 2; pass++) grades = runningMean(grades, halfWidth);
    this.grades = grades;
    this.heights = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      this.heights[i] =
        this.heights[i - 1]! - (grades[i - 1]! / 100) * DRAWN_STEEPNESS * SAMPLE_STEP;
    }
    this.limits = round.limits.map(([at, kmh]) => ({ at, kmh, speed: kmh / KMH_PER_PX }));
    this.bumps = round.bumps ?? [];
    this.lights = (round.lights ?? []).map(([at, redTime]) => ({
      at,
      redTime,
      waited: 0,
      state: 'red',
    }));
    this.mud = (round.mud ?? []).map(([from, to]) => ({ from, to }));
  }

  /** Grade at x (%, positive uphill). */
  gradeAt(x: number) {
    return sample(this.grades, x);
  }

  /** Drawn height of the road at x, in screen px (up is negative, 0 at the start). */
  heightAt(x: number) {
    return sample(this.heights, x);
  }

  /** The speed limit in force at x. */
  limitAt(x: number): SpeedLimit {
    let current = this.limits[0]!;
    for (const limit of this.limits) if (limit.at <= x) current = limit;
    return current;
  }

  mudAt(x: number) {
    return this.mud.some((m) => x >= m.from && x <= m.to);
  }

  /** A red light turns green once the car has waited at it for its red time, amber just before. */
  updateLights(dt: number, car: { x: number; v: number }) {
    for (const light of this.lights) {
      if (light.state === 'green') continue;
      const distance = light.at - car.x;
      if (distance < 180 && distance > -20 && Math.abs(car.v) < 4) light.waited += dt;
      if (light.waited >= light.redTime) light.state = 'green';
      else if (light.waited >= light.redTime - 0.7) light.state = 'amber';
    }
  }
}

function sample(values: Float32Array, x: number) {
  const f = Math.max(0, Math.min(values.length - 1.001, x / SAMPLE_STEP));
  const i = Math.floor(f);
  return values[i]! + (values[i + 1]! - values[i]!) * (f - i);
}

function runningMean(values: Float32Array, halfWidth: number) {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    const last = Math.min(values.length - 1, i + halfWidth);
    for (let j = Math.max(0, i - halfWidth); j <= last; j++) {
      sum += values[j]!;
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}
