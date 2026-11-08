import { describe, expect, it } from 'vitest';
import { BUMP_GEAR, Car, GEAR_TOP_SPEED, LIMIT_RPM, slowingDistance } from './car';
import { Road, START_X } from './road';
import type { Round } from './rounds';
import { FIXED_STEP } from './run';

function road(segments: [number, number][], limitKmh = 100, bumps: number[] = []) {
  const round: Round = {
    n: 0,
    title: 'test',
    timeLimit: 999,
    segments,
    limits: [[0, limitKmh]],
    bumps,
  };
  return new Road(round);
}

function drive(car: Car, onRoad: Road, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_STEP) car.step(FIXED_STEP, onRoad);
}

/** A car already moving at speed v in a gear. */
function rolling(v: number, gear: number) {
  const car = new Car(START_X);
  car.v = v;
  car.shift(gear);
  return car;
}

describe('Car', () => {
  it('pulls away in 1st', () => {
    const car = new Car(START_X);
    car.shift(1);
    drive(car, road([[40000, 0]]), 2);
    expect(car.engine).toBe('running');
    expect(car.v).toBeGreaterThan(100);
  });

  it.each([2, 3, 4, 5])('stalls pulling away in gear %i', (gear) => {
    const car = new Car(START_X);
    car.shift(gear);
    drive(car, road([[40000, 0]]), 1.5);
    expect(car.engine).toBe('stalled');
  });

  it('stalls on a hill too steep for the gear', () => {
    const car = rolling(600, 4);
    drive(
      car,
      road([
        [400, 0],
        [40000, 12],
      ]),
      20,
    );
    expect(car.engine).toBe('stalled');
  });

  it('climbs the same hill in 2nd', () => {
    const car = rolling(240, 2);
    drive(
      car,
      road([
        [400, 0],
        [40000, 12],
      ]),
      20,
    );
    expect(car.engine).toBe('running');
    expect(car.v).toBeGreaterThan(200);
  });

  it('takes a gear far too low for the speed and slows down to it', () => {
    const car = rolling(600, 4);
    car.shift(1);
    expect(car.gear).toBe(1);
    drive(car, road([[40000, 0]]), 1.5);
    expect(car.slowingToGear).toBe(false);
    expect(car.v).toBeLessThan(GEAR_TOP_SPEED[1] * 1.05);
    expect(car.heat).toBe(0);
    expect(car.engine).toBe('running');
  });

  it('flips over a speed bump too fast', () => {
    const car = rolling(GEAR_TOP_SPEED[3], 3);
    drive(car, road([[40000, 0]], 100, [1200]), 3);
    expect(car.engine).toBe('crashed');
    expect(car.v).toBe(0);
  });

  it('goes over a speed bump in 2nd, changing down just before it', () => {
    const car = rolling(GEAR_TOP_SPEED[4], 4);
    const bumpy = road([[40000, 0]], 100, [1600]);
    while (car.x < 1600 - slowingDistance(car.v, BUMP_GEAR) - 40) car.step(FIXED_STEP, bumpy);
    car.shift(BUMP_GEAR);
    drive(car, bumpy, 3);
    expect(car.x).toBeGreaterThan(1600);
    expect(car.engine).toBe('running');
  });

  it('sits at the rev limiter on the flat without overheating', () => {
    const car = new Car(START_X);
    car.shift(1);
    drive(car, road([[80000, 0]]), 120);
    expect(car.rpm).toBeGreaterThan(LIMIT_RPM - 100);
    expect(car.heat).toBe(0);
    expect(car.engine).toBe('running');
  });

  it('blows the engine when a steep descent spins it past the limiter', () => {
    const car = rolling(300, 2);
    drive(
      car,
      road(
        [
          [400, 0],
          [40000, -9],
        ],
        60,
      ),
      8,
    );
    expect(car.engine).toBe('blown');
  });
});
