import { Car } from './car';
import { Road, START_X } from './road';
import type { Round } from './rounds';

/** The simulation always advances in steps of this many seconds, whatever the frame rate. */
export const FIXED_STEP = 1 / 60;

export type Outcome = 'finished' | 'stalled' | 'blown' | 'crashed' | 'late';

/** Something that picks gears: the bot, or a test driver. */
export interface Driver {
  /** The gear to change to now, or null to keep the current one. */
  next(car: Car, road: Road, dt: number): number | null;
}

/** One attempt at a round: the road, the car, the clock and the rules that end it. */
export class RoundRun {
  readonly road: Road;
  readonly car = new Car(START_X);
  /** Seconds on the clock so far. */
  elapsed = 0;
  started = false;
  outcome: Outcome | null = null;

  constructor(
    readonly round: Round,
    private readonly driver: Driver | null = null,
  ) {
    this.road = new Road(round);
    this.car.stopping = true;
  }

  get timeLeft() {
    return Math.max(0, this.round.timeLimit - this.elapsed);
  }

  /** Releases the car and starts the clock. */
  start() {
    this.started = true;
    this.car.stopping = false;
  }

  step(dt = FIXED_STEP) {
    if (!this.started || this.outcome) {
      this.car.step(dt, this.road);
      return;
    }
    this.elapsed += dt;
    this.road.updateLights(dt, this.car);
    const gear = this.driver?.next(this.car, this.road, dt) ?? null;
    if (gear !== null) this.car.shift(gear);
    this.car.step(dt, this.road);

    if (this.car.x >= this.road.finish) this.end('finished');
    else if (this.car.engine !== 'running') this.end(this.car.engine);
    else if (this.elapsed >= this.round.timeLimit) this.end('late');
  }

  private end(outcome: Outcome) {
    this.outcome = outcome;
    this.car.stopping = true;
  }
}

/** Plays a round to the end without drawing it. */
export function simulate(round: Round, driver: Driver): { outcome: Outcome; time: number } {
  const run = new RoundRun(round, driver);
  run.start();
  while (!run.outcome) run.step();
  return { outcome: run.outcome, time: run.elapsed };
}
