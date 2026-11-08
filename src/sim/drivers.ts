import { BUMP_GEAR, GEARS, rpmAt, slowingDistance, targetSpeed, type Car } from './car';
import type { Road } from './road';
import type { Driver } from './run';

interface DrivingStyle {
  upshiftRpm: number;
  downshiftRpm: number;
  /** Changes down before the revs fall when the car can't hold its speed (on a hill, in mud). */
  anticipates: boolean;
  /** How long a change has to be needed before the driver makes it (s). */
  reactionTime: number;
}

/** Shifts close to the red, anticipates hills: the times the clocks are set against. */
export const EXPERT: DrivingStyle = {
  upshiftRpm: 5600,
  downshiftRpm: 1900,
  anticipates: true,
  reactionTime: 0,
};

/** Shifts up late and down once the revs have dropped, a little slowly. */
export const CARELESS: DrivingStyle = {
  upshiftRpm: 6300,
  downshiftRpm: 2200,
  anticipates: false,
  reactionTime: 0.3,
};

/** While struggling, an anticipating driver changes down below this. */
const STRUGGLE_RPM = 3200;
/** Shortest time between two gear changes (s). */
const MIN_SHIFT_INTERVAL = 0.3;
/**
 * The driver is in BUMP_GEAR this long before a speed bump (s), and at least this far before it
 * (px) so that it doesn't change up again in between.
 */
const BUMP_LEAD_TIME = 0.5;
const BUMP_HOLD_DISTANCE = 500;

/** Drives by the revs: ?bot in the game, and the tests. */
export class Bot implements Driver {
  private sinceShift = MIN_SHIFT_INTERVAL;
  private pending: number | null = null;
  private pendingFor = 0;
  private lastSpeed = 0;
  /** The speed bump the driver has changed down for, until the car is over it. */
  private bump: number | null = null;

  constructor(private readonly style: DrivingStyle = EXPERT) {}

  next(car: Car, road: Road, dt: number): number | null {
    this.sinceShift += dt;
    const losingSpeed = car.v < this.lastSpeed - 4 * dt;
    this.lastSpeed = car.v;

    const gear = this.choose(car, road, losingSpeed);
    if (gear !== this.pending) {
      this.pending = gear;
      this.pendingFor = 0;
    }
    if (gear === null) return null;
    this.pendingFor += dt;
    if (this.pendingFor < this.style.reactionTime || this.sinceShift < MIN_SHIFT_INTERVAL) {
      return null;
    }
    this.sinceShift = 0;
    this.pending = null;
    return gear;
  }

  private choose(car: Car, road: Road, losingSpeed: boolean): number | null {
    if (car.engine !== 'running') return null;
    const { upshiftRpm, downshiftRpm, anticipates } = this.style;
    const slow = car.v < 30 && (car.clutchDown || car.pullingAway);
    if (car.gear === 0 || slow) return car.gear === 1 ? null : 1;
    const topGear = this.bumpAhead(car, road) ? BUMP_GEAR : GEARS;
    if (car.gear > topGear) return topGear;
    if (car.rpm > upshiftRpm && car.gear < topGear) return car.gear + 1;
    if (car.gear > 1 && rpmAt(car.v, car.gear - 1) < upshiftRpm) {
      const struggling =
        anticipates &&
        losingSpeed &&
        car.throttle > 0.9 &&
        car.v < targetSpeed(road, car.x) - 20 &&
        car.rpm < STRUGGLE_RPM;
      if (car.rpm < downshiftRpm || struggling) return car.gear - 1;
    }
    return null;
  }

  /** Whether it's time to be in BUMP_GEAR for a speed bump, and to stay there until over it. */
  private bumpAhead(car: Car, road: Road) {
    if (this.bump !== null && car.x > this.bump) this.bump = null;
    const next = Math.min(...road.bumps.filter((bump) => bump > car.x));
    const lead = this.style.reactionTime + BUMP_LEAD_TIME;
    const needed = slowingDistance(car.v, BUMP_GEAR) + car.v * lead;
    if (next - car.x < Math.max(needed, BUMP_HOLD_DISTANCE)) this.bump = next;
    return this.bump !== null;
  }
}

/** Changes up at the expert's revs until it reaches a gear, then never changes again. */
export function stayInGear(gear: number): Driver {
  return {
    next(car) {
      if (car.gear >= gear) return null;
      if (car.gear === 0) return 1;
      return car.rpm > EXPERT.upshiftRpm ? car.gear + 1 : null;
    },
  };
}
