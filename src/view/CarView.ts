import Phaser from 'phaser';
import { KMH_PER_PX, type Car } from '../sim/car';
import type { Road } from '../sim/road';
import { BONNET, CAR_ORIGIN, EXHAUST, ROOF_HEIGHT, WHEEL_RADIUS, WHEELBASE } from './textures';

/** Above this speed (4th and 5th) the wheels blur and wind streaks rush past. */
const FAST_KMH = 70;
/** How far the body tips forward under braking, and back when accelerating, per px/s². */
const PITCH_PER_ACCEL = 1.5e-4;
const MAX_PITCH = 0.05;
/** Over a speed bump at v px/s, a wheel jumps v² times this high (px), up to HOP_MAX. */
const HOP_PER_V2 = 2e-4;
const HOP_MAX = 30;
/** Pulls a jumping wheel back down (px/s²). */
const HOP_GRAVITY = 2400;
/** Seconds from flipping over a speed bump to landing on the roof. */
export const TUMBLE_TIME = 0.75;
/** How high the car flies when it flips (px). */
const TUMBLE_HEIGHT = 120;

// Depths: exhaust and wind 9, the car 10, mud, steam, dust and sparks 11.

interface Tumble {
  /** Seconds since the car flipped. */
  time: number;
  /** How high and how tilted the car was then. */
  lift: number;
  rotation: number;
  /** Wheels spinning in the air (rad/s). */
  spin: number;
  landed: boolean;
}

/** The car on the road: body, turning wheels, exhaust smoke, steam, flying mud and wind. */
export class CarView {
  private readonly body: Phaser.GameObjects.Container;
  private readonly shell: Phaser.GameObjects.Image;
  private readonly wheels: Phaser.GameObjects.Image[];
  /** How high the back and front wheels have jumped off a speed bump (px), and how fast they rise. */
  private readonly hop: [number, number] = [0, 0];
  private readonly hopSpeed: [number, number] = [0, 0];
  private tumble: Tumble | null = null;
  private time = 0;
  private wheelTurn = 0;
  private lastX: number | null = null;
  private lastV = 0;
  private pitch = 0;
  private blurred = false;
  private untilExhaust = 0;
  private untilSteam = 0;
  private untilMud = 0;
  private untilStreak = 0;
  private untilSpark = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const back = scene.add.image(-WHEELBASE / 2, 0, 'wheel');
    const front = scene.add.image(WHEELBASE / 2, 0, 'wheel');
    this.shell = scene.add.image(0, 0, 'car').setOrigin(CAR_ORIGIN.x, CAR_ORIGIN.y);
    this.wheels = [back, front];
    this.body = scene.add.container(0, 0, [this.shell, back, front]).setDepth(10);
  }

  /** Midway between the wheel centres. */
  get position() {
    return { x: this.body.x, y: this.body.y };
  }

  /**
   * Moves the car along the road: on its wheels, or flipping over after a speed bump taken too
   * fast. Returns true when a wheel has just gone over a bump.
   */
  update(dt: number, car: Car, road: Road, bumpHeightAt: (x: number) => number, exhaust: boolean) {
    this.time += dt;
    const moved = car.x - (this.lastX ?? car.x);
    this.lastX = car.x;
    const bumped = this.jump(dt, car, road, moved);
    if (car.engine === 'crashed') {
      this.flip(dt, car, road);
    } else {
      this.ride(dt, car, road, bumpHeightAt);
      this.wheelTurn += moved / WHEEL_RADIUS;
    }
    const wheelSpeed = this.tumble ? this.tumble.spin * WHEEL_RADIUS : Math.abs(car.v);
    const blurred = wheelSpeed * KMH_PER_PX > FAST_KMH;
    for (const wheel of this.wheels) {
      if (blurred !== this.blurred) wheel.setTexture(blurred ? 'wheelBlur' : 'wheel');
      wheel.setRotation(this.wheelTurn);
    }
    this.blurred = blurred;
    this.emit(dt, car, road, exhaust);
    return bumped;
  }

  /**
   * On its two wheels, tilted with the road (riding up over speed bumps, and off them at speed),
   * shaking when the engine labours and buzzing at the rev limiter. The body pitches with the
   * speed changes.
   */
  private ride(dt: number, car: Car, road: Road, bumpHeightAt: (x: number) => number) {
    const backX = car.x - WHEELBASE / 2;
    const frontX = car.x + WHEELBASE / 2;
    const backY = road.heightAt(backX) - bumpHeightAt(backX) - this.hop[0];
    const frontY = road.heightAt(frontX) - bumpHeightAt(frontX) - this.hop[1];
    const shake =
      car.judder * 3 * Math.sin(this.time * 55) +
      (car.atLimiter ? 1.2 * Math.sin(this.time * 90) : 0);
    const tilt =
      Math.atan2(frontY - backY, WHEELBASE) + car.judder * 0.012 * Math.sin(this.time * 37);
    this.body.setPosition(car.x, (backY + frontY) / 2 - WHEEL_RADIUS + shake).setRotation(tilt);

    const accel = dt > 0 ? (car.v - this.lastV) / dt : 0;
    this.lastV = car.v;
    const pitch = Phaser.Math.Clamp(-accel * PITCH_PER_ACCEL, -MAX_PITCH, MAX_PITCH);
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 8);
    this.shell.setRotation(this.pitch);
  }

  /** A wheel going over a speed bump jumps off it, the higher the faster the car goes. */
  private jump(dt: number, car: Car, road: Road, moved: number) {
    let bumped = false;
    for (const i of [0, 1] as const) {
      const x = car.x + (i === 0 ? -WHEELBASE / 2 : WHEELBASE / 2);
      if (car.engine === 'running' && road.bumps.some((bump) => x - moved < bump && bump <= x)) {
        bumped = true;
        const height = Math.min(HOP_MAX, HOP_PER_V2 * car.v * car.v);
        this.hopSpeed[i] = Math.sqrt(2 * HOP_GRAVITY * height);
      }
      this.hopSpeed[i] -= HOP_GRAVITY * dt;
      this.hop[i] = Math.max(0, this.hop[i] + this.hopSpeed[i] * dt);
      if (this.hop[i] === 0) this.hopSpeed[i] = 0;
    }
    return bumped;
  }

  /**
   * Flipped over a speed bump: the car flies up, turns over one and a half times and lands on its
   * roof, then slides to a stop with its wheels still spinning.
   */
  private flip(dt: number, car: Car, road: Road) {
    const groundY = road.heightAt(car.x);
    const upright = groundY - WHEEL_RADIUS;
    this.tumble ??= {
      time: 0,
      lift: upright - this.body.y,
      rotation: this.body.rotation,
      spin: Math.abs(car.v) / WHEEL_RADIUS,
      landed: false,
    };
    const tumble = this.tumble;
    tumble.time += dt;
    tumble.spin *= Math.exp(-dt * 0.6);
    this.wheelTurn += tumble.spin * dt;
    const p = Math.min(1, tumble.time / TUMBLE_TIME);
    const slope = Math.atan2(
      road.heightAt(car.x + WHEELBASE / 2) - road.heightAt(car.x - WHEELBASE / 2),
      WHEELBASE,
    );
    // Upside down, the roof rests on the road. After landing the car rocks a little.
    const y = Phaser.Math.Linear(upright - tumble.lift, groundY - ROOF_HEIGHT, p);
    const turned = Phaser.Math.Linear(
      tumble.rotation,
      slope + 3 * Math.PI,
      Phaser.Math.Easing.Quadratic.Out(p),
    );
    const settling = Math.max(0, tumble.time - TUMBLE_TIME);
    const rock = 0.08 * Math.sin(settling * 16) * Math.exp(-settling * 4);
    this.body.setPosition(car.x, y - TUMBLE_HEIGHT * 4 * p * (1 - p)).setRotation(turned + rock);
    this.shell.setRotation(0);
    if (p === 1 && !tumble.landed) {
      tumble.landed = true;
      this.scene.cameras.main.shake(220, 0.01);
      for (let i = 0; i < 6; i++) {
        const scale = 0.5 + (i % 3) * 0.2;
        this.puff(car.x - 75 + i * 30, groundY - 8, 0xd9c7a8, scale, (i - 2.5) * 24, -60, 11);
      }
    }
  }

  /** A burst of smoke from the exhaust: dark for a stall. */
  smokeBurst(dark: boolean) {
    const { x, y } = this.toWorld(EXHAUST);
    for (let i = 0; i < 5; i++) {
      const tint = dark ? 0x555555 : 0xffffff;
      this.puff(x - i * 6, y - i * 4, tint, 0.6 + i * 0.12, -40 - i * 12, -30 - i * 8, 9);
    }
  }

  /**
   * Exhaust (dark when the engine labours), steam from an overheating engine, smoke from a wreck,
   * mud off the back wheel, wind streaks at speed, and sparks from a roof scraping along the road.
   */
  private emit(dt: number, car: Car, road: Road, exhaust: boolean) {
    const speed = Math.abs(car.v);
    if (exhaust && car.engine === 'running') {
      this.untilExhaust -= dt;
      if (this.untilExhaust <= 0) {
        this.untilExhaust = 0.42 - car.throttle * 0.28;
        const { x, y } = this.toWorld(EXHAUST);
        const tint = car.judder > 0.4 ? 0x6b6b6b : 0xf2f2f2;
        this.puff(x, y, tint, 0.45 + car.throttle * 0.35, -50 - speed * 0.125, -24, 9);
      }
    }
    const blown = car.engine === 'blown';
    const wrecked = this.tumble?.landed ?? false;
    if (car.heat > 0.2 || blown || wrecked) {
      this.untilSteam -= dt;
      if (this.untilSteam <= 0) {
        this.untilSteam = blown ? 0.07 : wrecked ? 0.16 : 0.4 - car.heat * 0.3;
        const { x, y } = this.toWorld(BONNET);
        const tint = blown || wrecked ? 0x4a4a4a : 0xc4ced4;
        this.puff(x, y, tint, 0.7 + car.heat * 0.8, -speed * 0.15 - 10, -110, 11);
      }
    }
    if (road.mudAt(car.x) && car.v > 40) {
      this.untilMud -= dt;
      if (this.untilMud <= 0) {
        this.untilMud = 0.06;
        this.flingMud();
      }
    }
    const kmh = speed * KMH_PER_PX;
    if (kmh > FAST_KMH) {
      this.untilStreak -= dt;
      if (this.untilStreak <= 0) {
        // From a few a second at 80 km/h to a dozen at 120.
        this.untilStreak = Math.min(0.5, 1 / ((kmh - FAST_KMH) * 0.24));
        this.streak(kmh);
      }
    }
    if (wrecked && speed > 30) {
      this.untilSpark -= dt;
      if (this.untilSpark <= 0) {
        this.untilSpark = 0.03;
        this.spark(car.x + Phaser.Math.Between(-50, 50), road.heightAt(car.x) - 2);
      }
    }
  }

  private flingMud() {
    const { x, y } = this.toWorld({ x: -WHEELBASE / 2 - 10, y: WHEEL_RADIUS - 6 });
    const drop = this.scene.add.image(x, y, 'drop').setDepth(11);
    this.scene.tweens.add({
      targets: drop,
      x: x - Phaser.Math.Between(40, 100),
      y: y - Phaser.Math.Between(10, 40),
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => drop.destroy(),
    });
  }

  /** A line of wind around the car, longer the faster it goes. It stays put as the car drives on. */
  private streak(kmh: number) {
    const { x, y } = this.body;
    const streak = this.scene.add
      .image(x + Phaser.Math.Between(-140, 220), y - Phaser.Math.Between(0, 130), 'streak')
      .setOrigin(0, 0.5)
      .setScale(kmh / 100, 1)
      .setDepth(9);
    this.scene.tweens.add({
      targets: streak,
      x: streak.x - 40,
      alpha: { from: 0.7, to: 0 },
      duration: 360,
      onComplete: () => streak.destroy(),
    });
  }

  private spark(x: number, y: number) {
    const spark = this.scene.add.image(x, y, 'streak').setScale(0.15, 1).setDepth(11);
    spark.setTint(0xffd84a);
    this.scene.tweens.add({
      targets: spark,
      x: x - Phaser.Math.Between(30, 90),
      y: y - Phaser.Math.Between(10, 50),
      alpha: { from: 1, to: 0 },
      duration: 260,
      onComplete: () => spark.destroy(),
    });
  }

  private puff(
    x: number,
    y: number,
    tint: number,
    scale: number,
    vx: number,
    vy: number,
    depth: number,
  ) {
    const puff = this.scene.add.image(x, y, 'puff').setTint(tint).setScale(scale).setDepth(depth);
    this.scene.tweens.add({
      targets: puff,
      x: x + vx * 0.9,
      y: y + vy * 0.9,
      scale: scale * 1.9,
      alpha: { from: 0.9, to: 0 },
      duration: 900,
      onComplete: () => puff.destroy(),
    });
  }

  /** A point on the car (relative to the middle between the wheels) in world coordinates. */
  private toWorld(point: { x: number; y: number }) {
    const { x, y, rotation } = this.body;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return { x: x + point.x * cos - point.y * sin, y: y + point.x * sin + point.y * cos };
  }
}
