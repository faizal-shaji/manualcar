import Phaser from 'phaser';
import type { Car } from '../sim/car';
import type { Road } from '../sim/road';
import { BONNET, CAR_ORIGIN, EXHAUST, WHEEL_RADIUS, WHEELBASE } from './textures';

// Depths: exhaust 9, the car 10, mud 11, steam 11.

/** The car on the road: body, turning wheels, exhaust smoke, steam and flying mud. */
export class CarView {
  private readonly body: Phaser.GameObjects.Container;
  private readonly wheels: Phaser.GameObjects.Image[];
  private time = 0;
  private wheelTurn = 0;
  private lastX: number | null = null;
  private untilExhaust = 0;
  private untilSteam = 0;
  private untilMud = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const back = scene.add.image(-WHEELBASE / 2, 0, 'wheel');
    const front = scene.add.image(WHEELBASE / 2, 0, 'wheel');
    const car = scene.add.image(0, 0, 'car').setOrigin(CAR_ORIGIN.x, CAR_ORIGIN.y);
    this.wheels = [back, front];
    this.body = scene.add.container(0, 0, [car, back, front]).setDepth(10);
  }

  /** Midway between the wheel centres. */
  get position() {
    return { x: this.body.x, y: this.body.y };
  }

  /**
   * Puts the car on its two wheels, tilted with the road (riding up over speed bumps), shaking
   * when the engine labours and buzzing at the rev limiter.
   */
  update(dt: number, car: Car, road: Road, bumpHeightAt: (x: number) => number, exhaust: boolean) {
    this.time += dt;
    const backX = car.x - WHEELBASE / 2;
    const frontX = car.x + WHEELBASE / 2;
    const backY = road.heightAt(backX) - bumpHeightAt(backX);
    const frontY = road.heightAt(frontX) - bumpHeightAt(frontX);
    const shake =
      car.judder * 3 * Math.sin(this.time * 55) +
      (car.atLimiter ? 1.2 * Math.sin(this.time * 90) : 0);
    const tilt =
      Math.atan2(frontY - backY, WHEELBASE) + car.judder * 0.012 * Math.sin(this.time * 37);
    this.body.setPosition(car.x, (backY + frontY) / 2 - WHEEL_RADIUS + shake).setRotation(tilt);
    this.wheelTurn += (car.x - (this.lastX ?? car.x)) / WHEEL_RADIUS;
    this.lastX = car.x;
    for (const wheel of this.wheels) wheel.setRotation(this.wheelTurn);
    this.emit(dt, car, road, exhaust);
  }

  /** A burst of smoke from the exhaust: dark for a stall. */
  smokeBurst(dark: boolean) {
    const { x, y } = this.toWorld(EXHAUST);
    for (let i = 0; i < 5; i++) {
      const tint = dark ? 0x555555 : 0xffffff;
      this.puff(x - i * 6, y - i * 4, tint, 0.6 + i * 0.12, -40 - i * 12, -30 - i * 8, 9);
    }
  }

  /** Exhaust (dark when the engine labours), steam from an overheating engine, mud off the back wheel. */
  private emit(dt: number, car: Car, road: Road, exhaust: boolean) {
    if (exhaust && car.engine === 'running') {
      this.untilExhaust -= dt;
      if (this.untilExhaust <= 0) {
        this.untilExhaust = 0.42 - car.throttle * 0.28;
        const { x, y } = this.toWorld(EXHAUST);
        const tint = car.judder > 0.4 ? 0x6b6b6b : 0xf2f2f2;
        this.puff(x, y, tint, 0.45 + car.throttle * 0.35, -50 - Math.abs(car.v) * 0.25, -24, 9);
      }
    }
    const blown = car.engine === 'blown';
    if (car.heat > 0.2 || blown) {
      this.untilSteam -= dt;
      if (this.untilSteam <= 0) {
        this.untilSteam = blown ? 0.07 : 0.4 - car.heat * 0.3;
        const { x, y } = this.toWorld(BONNET);
        const tint = blown ? 0x4a4a4a : 0xc4ced4;
        this.puff(x, y, tint, 0.7 + car.heat * 0.8, -Math.abs(car.v) * 0.3 - 10, -110, 11);
      }
    }
    if (road.mudAt(car.x) && car.v > 20) {
      this.untilMud -= dt;
      if (this.untilMud <= 0) {
        this.untilMud = 0.06;
        this.flingMud();
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
