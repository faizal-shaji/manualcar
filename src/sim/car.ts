import type { Road } from './road';

/*
 * Longitudinal model of the car: position along the road, speed, gear, engine speed and engine
 * temperature. Nothing here draws anything.
 *
 * The player only picks gears. Everything else is automatic: the throttle holds the speed limit,
 * the brakes slow the car for lower limits and red lights, and the clutch is used to stop, to pull
 * away and to let in a gear too low for the speed. Speed bumps are the player's: the car doesn't
 * slow down for them, and over one too fast it flips. Distances are in px along the road, speeds in
 * px/s and accelerations in px/s².
 */

/** Speed at the rev limiter in each gear. Index 0 is neutral. */
export const GEAR_TOP_SPEED = [0, 200, 333.4, 466.6, 700, 966.6] as const;
export const GEARS = 5;
/** Converts px/s to the km/h shown on the dashboard. */
export const KMH_PER_PX = 0.15;

export const IDLE_RPM = 850;
/** In gear with the clutch up, the engine stalls after STALL_TIME below this. */
export const STALL_RPM = 800;
/** Below this the engine lugs: it has little torque and judders. */
export const LUG_RPM = 1300;
/** Start of the red zone. */
export const RED_RPM = 6000;
/** The rev limiter cuts the drive above this. */
export const LIMIT_RPM = 6500;
/**
 * Above this the wheels are spinning the engine faster than the limiter allows, which only a
 * steep descent in too low a gear can do. The engine overheats there.
 */
export const OVERREV_RPM = 6700;
/** Full scale of the rev counter. */
export const DIAL_MAX_RPM = 7000;
/** Engine speed while the clutch slips during a pull-away. */
const PULL_AWAY_RPM = 1400;

// The forces are strong compared with the car's speed, so in the wrong gear a hill slows the car
// within about a screen. Steepest grade each gear can hold at full torque: 5th about 4%, 4th 6%,
// 3rd 10%, 2nd 14% and 1st 25%.

/** Drive at peak torque in 5th. Lower gears multiply it by their ratio. */
const DRIVE = 70;
const ROLLING_RESISTANCE = 20;
/** Aerodynamic drag, times v². */
const DRAG = 7.5e-5;
/** Pull of a 100% grade. */
const GRAVITY = 1250;
/** Extra resistance in mud, about the same as an 8% climb. */
export const MUD_RESISTANCE = 100;
/** Traction limit. */
const MAX_ACCEL = 120;
/** Deceleration the driver uses to slow down for something ahead. */
export const COMFORT_DECEL = 200;
const MAX_BRAKE = 1000;
/** Engine braking off the throttle in 5th. Lower gears multiply it by their ratio. */
const ENGINE_BRAKE = 20;
/**
 * Engine braking in 5th while the clutch slips to let in a gear too low for the speed. Lower gears
 * multiply it by their ratio, so dropping to 1st at speed slows the car hard.
 */
const DOWNSHIFT_BRAKE = 100;
/**
 * Over a speed bump faster than this (55 km/h), the car flips. BUMP_GEAR tops out below it, so
 * changing down to it slows the car enough.
 */
export const BUMP_CRASH_SPEED = 366.7;
export const BUMP_GEAR = 2;
/** Deceleration of a car sliding on its roof. */
const ROOF_FRICTION = 450;

const STALL_TIME = 0.5;
/** Once the engine stops, the car rolls freely for this long before the brake goes on. */
const ROLL_AFTER_STOP_TIME = 0.7;
/** Seconds of over-revving before the engine fails, and seconds to cool down fully after it. */
export const OVERHEAT_TIME = 3;
const COOL_DOWN_TIME = 6;
/** Pulling away in any gear but 1st, the car lurches for this long and then stalls. */
const LURCH_TIME = 0.35;
/** Rolling backwards for this long while pulling away stalls the engine. */
const ROLLBACK_STALL_TIME = 0.4;

/** Engine torque as a fraction of its peak, by rpm. Linear between the points. */
const TORQUE_CURVE: [number, number][] = [
  [0, 0.35],
  [1000, 0.45],
  [2000, 0.8],
  [3000, 1],
  [4500, 1],
  [6000, 0.72],
  [6500, 0.6],
  [8000, 0.4],
];

export function torqueAt(rpm: number): number {
  for (let i = 1; i < TORQUE_CURVE.length; i++) {
    const [r0, t0] = TORQUE_CURVE[i - 1]!;
    const [r1, t1] = TORQUE_CURVE[i]!;
    if (rpm <= r1) return t0 + ((t1 - t0) * (Math.max(rpm, r0) - r0)) / (r1 - r0);
  }
  return TORQUE_CURVE[TORQUE_CURVE.length - 1]![1];
}

/** Torque multiplication of a gear relative to 5th. */
const gearRatio = (gear: number) => GEAR_TOP_SPEED[GEARS] / GEAR_TOP_SPEED[gear]!;

/** Engine speed at road speed v in a gear (0 in neutral). */
export const rpmAt = (v: number, gear: number) =>
  gear === 0 ? 0 : (Math.abs(v) / GEAR_TOP_SPEED[gear]!) * LIMIT_RPM;

/**
 * The speed the automatic driver aims for at x: the speed limit, lowered in time for a lower
 * limit or a red light ahead.
 */
export function targetSpeed(road: Road, x: number): number {
  const approach = (speed: number, at: number) =>
    Math.sqrt(speed * speed + 2 * COMFORT_DECEL * Math.max(0, at - x));
  let target = road.limitAt(x).speed;
  for (const limit of road.limits) {
    if (limit.at > x) target = Math.min(target, approach(limit.speed, limit.at));
  }
  for (const light of road.lights) {
    if (light.state === 'green' || x > light.at) continue;
    // Close to the light it stops rather than creeping up to it.
    target = Math.min(target, light.at - x < 120 ? 0 : approach(0, light.at - 16));
  }
  return target;
}

/** How far a gear too low for speed v takes to slow the car down to that gear's top speed. */
export function slowingDistance(v: number, gear: number) {
  const top = GEAR_TOP_SPEED[gear]!;
  return v > top ? (v * v - top * top) / (2 * DOWNSHIFT_BRAKE * gearRatio(gear)) : 0;
}

/** Running, or what stopped the engine. */
export type EngineState = 'running' | 'stalled' | 'blown' | 'crashed';
export type CarEvent = Exclude<EngineState, 'running'>;

export class Car {
  x: number;
  v = 0;
  /** 0 is neutral. */
  gear = 0;
  rpm = IDLE_RPM;
  /** From 0 to 1. The engine fails at 1. */
  heat = 0;
  engine: EngineState = 'running';
  throttle = 0;
  /** From 0 to 1: how hard the engine shakes when it lugs or pulls away badly. */
  judder = 0;
  atLimiter = false;
  /** Clutch pedal down (disengaged), in neutral or when stopping. */
  clutchDown = true;
  /** Pulling away from a standstill with the clutch slipping. */
  pullingAway = false;
  /**
   * A gear too low for the speed has gone in: the clutch slips while the engine brakes the car
   * down to that gear's top speed.
   */
  slowingToGear = false;
  /** Brake to a standstill and stay there. */
  stopping = false;
  /** What happened during the last step. */
  readonly events: CarEvent[] = [];

  private lugTime = 0;
  private offTime = 0;
  private lurchTime = 0;
  private rollbackTime = 0;

  constructor(x: number) {
    this.x = x;
  }

  /** Selects a gear (0 is neutral). Any gear goes in at any speed. */
  shift(gear: number) {
    gear = Math.max(0, Math.min(GEARS, Math.round(gear)));
    if (gear === this.gear) return;
    this.gear = gear;
    this.lugTime = 0;
    this.slowingToGear = rpmAt(this.v, gear) > LIMIT_RPM;
  }

  step(dt: number, road: Road) {
    this.events.length = 0;
    const target = this.stopping ? 0 : targetSpeed(road, this.x);
    let brake = Math.min(MAX_BRAKE, Math.max(0, (this.v - target) * 8));
    let drive = 0;
    this.throttle = 0;
    this.judder = 0;
    this.atLimiter = false;

    if (this.engine === 'running') {
      this.updateClutch(target);
      // Standing still with the clutch down: foot on the brake.
      if (this.clutchDown && Math.abs(this.v) < 40) brake = MAX_BRAKE;
      this.throttle = this.clutchDown ? 0 : Math.max(0, Math.min(1, (target - this.v) / 8));
      drive = this.engineDrive(dt);
      if (this.engine === 'running') this.updateHeat(dt);
    } else {
      // Engine off: the car rolls on for a moment (backwards on a hill), then the brake holds it.
      // Upside down, it slides to a stop.
      this.rpm = Math.max(0, this.rpm - dt * 5000);
      this.offTime += dt;
      if (this.engine === 'crashed') brake = ROOF_FRICTION;
      else brake = this.offTime > ROLL_AFTER_STOP_TIME ? MAX_BRAKE : 0;
    }

    // Drive and gravity first, then every resistance, which can stop the car but never reverse
    // it, and finally the traction limit.
    const slope = (GRAVITY * road.gradeAt(this.x)) / 100;
    const resistance =
      brake + ROLLING_RESISTANCE + (road.mudAt(this.x) ? MUD_RESISTANCE : 0) + Math.max(0, -drive);
    let v = this.v + (Math.max(0, drive) - slope) * dt;
    v -= Math.sign(v) * DRAG * v * v * dt;
    v = v > 0 ? Math.max(0, v - resistance * dt) : Math.min(0, v + resistance * dt);
    this.v = Math.min(v, this.v + MAX_ACCEL * dt);
    const from = this.x;
    this.x = Math.max(0, this.x + this.v * dt);
    const overBump = road.bumps.some((bump) => from < bump && bump <= this.x);
    if (overBump && this.v > BUMP_CRASH_SPEED) this.stopEngine('crashed');
  }

  /** Clutch down in neutral and to stop; up again once rolling, or slipping to pull away. */
  private updateClutch(target: number) {
    if (this.gear === 0 || (target < 2 && this.v < 60)) {
      this.clutchDown = true;
      this.pullingAway = false;
      this.slowingToGear = false;
    } else if (this.clutchDown) {
      if (rpmAt(this.v, this.gear) >= PULL_AWAY_RPM) {
        this.clutchDown = false;
      } else if (target > this.v + 2) {
        this.clutchDown = false;
        this.pullingAway = true;
        this.lurchTime = 0;
        this.rollbackTime = 0;
      }
    }
  }

  /** Engine force at the wheels this step (negative when engine braking). May stall the engine. */
  private engineDrive(dt: number): number {
    const gear = this.gear;
    if (this.clutchDown) {
      this.rpm += (IDLE_RPM - this.rpm) * Math.min(1, dt * 6);
      return 0;
    }
    if (this.pullingAway) {
      const wheelRpm = rpmAt(this.v, gear);
      if (gear !== 1) {
        // Too high a gear to pull away: it lurches and judders, then stalls.
        this.judder = 1;
        this.rpm = Math.max(wheelRpm, 500);
        this.lurchTime += dt;
        if (this.lurchTime > LURCH_TIME) this.stall();
        return DRIVE * gearRatio(gear) * 0.3 * this.throttle;
      }
      this.rpm = Math.max(wheelRpm, PULL_AWAY_RPM);
      if (wheelRpm >= PULL_AWAY_RPM) this.pullingAway = false;
      if (this.v < -12) {
        this.rollbackTime += dt;
        if (this.rollbackTime > ROLLBACK_STALL_TIME) this.stall();
      } else {
        this.rollbackTime = 0;
      }
      return DRIVE * gearRatio(gear) * torqueAt(this.rpm) * Math.max(this.throttle, 0.6);
    }
    if (this.slowingToGear) {
      if (rpmAt(this.v, gear) > LIMIT_RPM) {
        // The engine sits at the rev limiter and brakes the car through the slipping clutch.
        this.rpm = LIMIT_RPM;
        this.atLimiter = true;
        return -DOWNSHIFT_BRAKE * gearRatio(gear);
      }
      this.slowingToGear = false;
    }

    // In gear with the clutch up: the engine turns with the wheels.
    this.rpm = rpmAt(this.v, gear);
    let drive: number;
    if (this.v < -12) {
      this.stall();
      drive = 0;
    } else if (this.rpm >= LIMIT_RPM) {
      this.atLimiter = true;
      drive = -ENGINE_BRAKE * gearRatio(gear);
    } else if (this.throttle > 0.02) {
      drive = DRIVE * gearRatio(gear) * torqueAt(this.rpm) * this.throttle;
    } else {
      drive = -ENGINE_BRAKE * gearRatio(gear) * (this.rpm / LIMIT_RPM);
    }
    if (this.rpm < LUG_RPM) {
      this.judder = Math.min(1, (LUG_RPM - this.rpm) / (LUG_RPM - STALL_RPM));
    }
    if (this.rpm < STALL_RPM) {
      this.lugTime += dt;
      if (this.lugTime > STALL_TIME) this.stall();
    } else {
      this.lugTime = 0;
    }
    return drive;
  }

  /** The engine heats up while over-revving and cools down otherwise. */
  private updateHeat(dt: number) {
    if (this.rpm > OVERREV_RPM && !this.clutchDown) this.heat += dt / OVERHEAT_TIME;
    else this.heat = Math.max(0, this.heat - dt / COOL_DOWN_TIME);
    if (this.heat >= 1) this.stopEngine('blown');
  }

  private stall() {
    this.stopEngine('stalled');
  }

  private stopEngine(state: CarEvent) {
    if (this.engine !== 'running') return;
    this.engine = state;
    this.offTime = 0;
    this.lugTime = 0;
    this.pullingAway = false;
    this.slowingToGear = false;
    this.clutchDown = true;
    this.events.push(state);
  }
}
