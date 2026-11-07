import { describe, expect, it } from 'vitest';
import { Car, LIMIT_RPM, MAX_SHIFT_RPM, rpmAt } from './car';
import { Road, START_X } from './road';
import type { Round } from './rounds';
import { FIXED_STEP } from './run';

function road(segments: [number, number][], limitKmh = 100) {
  const round: Round = { n: 0, title: 'test', timeLimit: 999, segments, limits: [[0, limitKmh]] };
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
    drive(car, road([[20000, 0]]), 2);
    expect(car.engine).toBe('running');
    expect(car.v).toBeGreaterThan(50);
  });

  it.each([2, 3, 4, 5])('stalls pulling away in gear %i', (gear) => {
    const car = new Car(START_X);
    car.shift(gear);
    drive(car, road([[20000, 0]]), 1.5);
    expect(car.engine).toBe('stalled');
  });

  it('stalls on a hill too steep for the gear', () => {
    const car = rolling(300, 4);
    drive(
      car,
      road([
        [200, 0],
        [20000, 12],
      ]),
      20,
    );
    expect(car.engine).toBe('stalled');
  });

  it('climbs the same hill in 2nd', () => {
    const car = rolling(120, 2);
    drive(
      car,
      road([
        [200, 0],
        [20000, 12],
      ]),
      20,
    );
    expect(car.engine).toBe('running');
    expect(car.v).toBeGreaterThan(100);
  });

  it('refuses a downshift that would over-rev the engine', () => {
    const car = rolling(300, 4);
    expect(rpmAt(300, 1)).toBeGreaterThan(MAX_SHIFT_RPM);
    expect(car.shift(1)).toBe(false);
    expect(car.gear).toBe(4);
  });

  it('sits at the rev limiter on the flat without overheating', () => {
    const car = new Car(START_X);
    car.shift(1);
    drive(car, road([[40000, 0]]), 120);
    expect(car.rpm).toBeGreaterThan(LIMIT_RPM - 100);
    expect(car.heat).toBe(0);
    expect(car.engine).toBe('running');
  });

  it('blows the engine when a steep descent spins it past the limiter', () => {
    const car = rolling(150, 2);
    drive(
      car,
      road(
        [
          [200, 0],
          [20000, -9],
        ],
        60,
      ),
      8,
    );
    expect(car.engine).toBe('blown');
  });
});
