import type { Road } from './road';

/*
 * Longitudinal model of the car: position along the road, speed, gear, engine speed and engine
 * temperature. Nothing here draws anything.
 *
 * The player only picks gears. Everything else is automatic: the throttle holds the speed limit,
 * the brakes slow the car for lower limits, speed bumps and red lights, and the clutch is used to
 * stop and to pull away. Distances are in px along the road, speeds in px/s and accelerations in
 * px/s².
 */

/** Speed at the rev limiter in each gear. Index 0 is neutral. */
export const GEAR_TOP_SPEED = [0, 100, 166.7, 233.3, 350, 483.3] as const;
export const GEARS = 5;
/** Converts px/s to the km/h shown on the dashboard. */
export const KMH_PER_PX = 0.3;

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
/** A downshift that would spin the engine faster than this is refused. */
export const MAX_SHIFT_RPM = 7600;
/** Full scale of the rev counter. */
export const DIAL_MAX_RPM = 7000;
/** Engine speed while the clutch slips during a pull-away. */
const PULL_AWAY_RPM = 1400;

// The forces are strong compared with the car's speed, so in the wrong gear a hill slows the car
// within about a screen. Steepest grade each gear can hold at full torque: 5th about 4%, 4th 6%,
// 3rd 10%, 2nd 14% and 1st 25%.

/** Drive at peak torque in 5th. Lower gears multiply it by their ratio. */
const DRIVE = 35;
const ROLLING_RESISTANCE = 10;
/** Aerodynamic drag, times v². */
const DRAG = 1.5e-4;
/** Pull of a 100% grade. */
const GRAVITY = 625;
/** Extra resistance in mud, about the same as an 8% climb. */
export const MUD_RESISTANCE = 50;
/** Traction limit. */
const MAX_ACCEL = 60;
/** Deceleration the driver uses to slow down for something ahead. */
export const COMFORT_DECEL = 100;
const MAX_BRAKE = 500;
/** Engine braking off the throttle in 5th. Lower gears multiply it by their ratio. */
const ENGINE_BRAKE = 10;
/** Speed for crossing a speed bump (6 km/h): slow enough to stall anything but 1st. */
export const BUMP_SPEED = 20;

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
 * limit, a speed bump or a red light ahead.
 */
export function targetSpeed(road: Road, x: number): number {
  const approach = (speed: number, at: number) =>
    Math.sqrt(speed * speed + 2 * COMFORT_DECEL * Math.max(0, at - x));
  let target = road.limitAt(x).speed;
  for (const limit of road.limits) {
    if (limit.at > x) target = Math.min(target, approach(limit.speed, limit.at));
  }
  for (const bump of road.bumps) {
    if (x < bump + 30) target = Math.min(target, approach(BUMP_SPEED, bump - 60));
  }
  for (const light of road.lights) {
    if (light.state === 'green' || x > light.at) continue;
    // Close to the line it stops rather than creeping up to it.
    target = Math.min(target, light.at - x < 60 ? 0 : approach(0, light.at - 8));
  }
  return target;
}

export type EngineState = 'running' | 'stalled' | 'blown';
export type CarEvent = 'stalled' | 'blown';

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

  /**
   * Selects a gear (0 is neutral). Returns false and keeps the current gear if the engine isn't
   * running or would over-rev.
   */
  shift(gear: number): boolean {
    gear = Math.max(0, Math.min(GEARS, Math.round(gear)));
    if (gear === this.gear) return true;
    if (this.engine !== 'running') return false;
    if (gear > 0 && rpmAt(this.v, gear) > MAX_SHIFT_RPM) return false;
    this.gear = gear;
    this.lugTime = 0;
    return true;
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
      if (this.clutchDown && Math.abs(this.v) < 20) brake = MAX_BRAKE;
      this.throttle = this.clutchDown ? 0 : Math.max(0, Math.min(1, (target - this.v) / 4));
      drive = this.engineDrive(dt);
      if (this.engine === 'running') this.updateHeat(dt);
    } else {
      // Engine off: the car rolls on for a moment (backwards on a hill), then the brake holds it.
      this.rpm = Math.max(0, this.rpm - dt * 5000);
      this.offTime += dt;
      brake = this.offTime > ROLL_AFTER_STOP_TIME ? MAX_BRAKE : 0;
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
    this.x = Math.max(0, this.x + this.v * dt);
  }

  /** Clutch down in neutral and to stop; up again once rolling, or slipping to pull away. */
  private updateClutch(target: number) {
    if (this.gear === 0 || (target < 1 && this.v < 30)) {
      this.clutchDown = true;
      this.pullingAway = false;
    } else if (this.clutchDown) {
      if (rpmAt(this.v, this.gear) >= PULL_AWAY_RPM) {
        this.clutchDown = false;
      } else if (target > this.v + 1) {
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
      if (this.v < -6) {
        this.rollbackTime += dt;
        if (this.rollbackTime > ROLLBACK_STALL_TIME) this.stall();
      } else {
        this.rollbackTime = 0;
      }
      return DRIVE * gearRatio(gear) * torqueAt(this.rpm) * Math.max(this.throttle, 0.6);
    }

    // In gear with the clutch up: the engine turns with the wheels.
    this.rpm = rpmAt(this.v, gear);
    let drive: number;
    if (this.v < -6) {
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
    this.clutchDown = true;
    this.events.push(state);
  }
}
