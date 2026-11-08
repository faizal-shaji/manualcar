/*
 * The itch.io cover image, served by the dev server as cover.html (the build only has the game).
 * A still in the game's style at twice itch's 630 x 500: the title, the car pulling up a steep
 * hill, and the rev counter and gear stick. scripts/itch-art.ts takes the screenshot once
 * `window.__coverReady` is set.
 */
import Phaser from 'phaser';
import {
  dialAngle,
  drawGearDisplay,
  drawGearGate,
  drawRevCounter,
  GATE_SLOTS,
  GearKnob,
  gearNumber,
} from './view/Dashboard';
import './snapshot';
import { waitForFont } from './view/fonts';
import { CAR_ORIGIN, createTextures, EXHAUST, WHEEL_RADIUS, WHEELBASE } from './view/textures';
import { COLORS, TEXT } from './view/theme';
import { drawPanel, outlinedText, textStyle } from './view/ui';

const COVER_WIDTH = 1260;
const COVER_HEIGHT = 1000;
const ROAD_THICKNESS = 26;

/** The road's top edge: flat on the left, then up a steep hill. */
function roadY(x: number) {
  const t = Phaser.Math.Clamp((x - 280) / 780, 0, 1);
  return 690 - 160 * t * t * (3 - 2 * t);
}

class CoverScene extends Phaser.Scene {
  create() {
    createTextures(this);
    const sky = this.add.graphics();
    sky.fillGradientStyle(COLORS.sky, COLORS.sky, COLORS.skyLow, COLORS.skyLow, 1);
    sky.fillRect(0, 0, COVER_WIDTH, 760);
    for (const [x, y, scale] of [
      [120, 60, 0.8],
      [1150, 330, 0.9],
      [210, 390, 0.7],
    ] as const) {
      this.add.image(x, y, 'cloud').setScale(scale);
    }
    this.add.image(-10, 300, 'hillsFar').setOrigin(0);
    this.add.image(-10, 400, 'hillsMid').setOrigin(0);
    for (const [key, x, scale] of [
      ['tree1', 90, 1],
      ['bush', 300, 1],
      ['tree0', 1190, 0.95],
    ] as const) {
      this.add
        .image(x, roadY(x) + 14, key)
        .setOrigin(0.5, 1)
        .setScale(scale);
    }
    this.hillSign(950, '12%');
    this.drawGround();
    this.drawCar(590);

    // Revs near the red in 2nd.
    const dial = { x: 190, y: 862, radius: 104 };
    drawRevCounter(this, dial.x, dial.y, dial.radius);
    this.add.text(dial.x, dial.y + 68, '43 km/h', textStyle(24, TEXT.white)).setOrigin(0.5);
    this.add.image(dial.x, dial.y, 'needle').setOrigin(0.1, 0.5).setRotation(dialAngle(5600));
    const cap = this.add.graphics();
    cap.fillStyle(COLORS.knob, 1);
    cap.fillCircle(dial.x, dial.y, 12);
    cap.lineStyle(3, COLORS.outline, 1);
    cap.strokeCircle(dial.x, dial.y, 12);
    drawGearDisplay(this, dial.x + 180, dial.y + 2);
    gearNumber(this, dial.x + 180, dial.y + 2, 2);
    const gate = { x: 1066, y: 866 };
    drawGearGate(this, gate.x, gate.y);
    const [dx, dy] = GATE_SLOTS[2]!;
    new GearKnob(this, gate.x + dx, gate.y + dy, 2);

    this.add
      .text(COVER_WIDTH / 2, 128, 'Manual Car', outlinedText(160))
      .setOrigin(0.5)
      .setAngle(-3);
    const tagline = this.add.text(
      COVER_WIDTH / 2,
      258,
      'change gear, don’t stall',
      outlinedText(54, TEXT.cream),
    );
    tagline.setOrigin(0.5);
    this.time.delayedCall(300, () => (window.__coverReady = true));
  }

  /** The car on the hill, tilted with it, with exhaust behind. */
  private drawCar(x: number) {
    const backY = roadY(x - WHEELBASE / 2);
    const frontY = roadY(x + WHEELBASE / 2);
    const car = this.add.container(x, (backY + frontY) / 2 - WHEEL_RADIUS, [
      this.add.image(0, 0, 'car').setOrigin(CAR_ORIGIN.x, CAR_ORIGIN.y),
      this.add.image(-WHEELBASE / 2, 0, 'wheel').setRotation(0.4),
      this.add.image(WHEELBASE / 2, 0, 'wheel').setRotation(1.3),
    ]);
    car.setRotation(Math.atan2(frontY - backY, WHEELBASE));
    const cos = Math.cos(car.rotation);
    const sin = Math.sin(car.rotation);
    const exhaustX = car.x + EXHAUST.x * cos - EXHAUST.y * sin;
    const exhaustY = car.y + EXHAUST.x * sin + EXHAUST.y * cos;
    for (const [dx, dy, scale, alpha] of [
      [-120, -44, 1.05, 0.45],
      [-62, -20, 0.8, 0.7],
      [-14, -4, 0.5, 0.9],
    ] as const) {
      const puff = this.add.image(exhaustX + dx, exhaustY + dy, 'puff').setTint(0xf2f2f2);
      puff.setScale(scale).setAlpha(alpha);
    }
    this.children.bringToTop(car);
  }

  /** A steep-hill warning on its post, as in the game. */
  private hillSign(x: number, label: string) {
    const y = roadY(x);
    const post = this.add.graphics();
    post.fillStyle(COLORS.pole, 1);
    post.fillRect(x - 4, y - 96, 8, 108);
    post.lineStyle(3, COLORS.outline, 1);
    post.strokeRect(x - 4, y - 96, 8, 108);
    this.add.image(x, y - 116, 'warn-up');
    drawPanel(this.add.graphics(), x, y - 58, 64, 30, 0xffffff, 8);
    this.add.text(x, y - 58, label, textStyle(20)).setOrigin(0.5);
  }

  /** Earth, a grass verge, and the asphalt with its dashes. */
  private drawGround() {
    const g = this.add.graphics();
    const V = Phaser.Math.Vector2;
    const surface: Phaser.Math.Vector2[] = [];
    for (let x = -16; x <= COVER_WIDTH + 16; x += 8) surface.push(new V(x, roadY(x)));
    const band = (from: number, to: number) => [
      ...surface.map((p) => new V(p.x, p.y + from)),
      ...surface
        .slice()
        .reverse()
        .map((p) => new V(p.x, p.y + to)),
    ];
    g.fillStyle(COLORS.earth, 1);
    const earthTop = surface.map((p) => new V(p.x, p.y + ROAD_THICKNESS));
    g.fillPoints(
      [...earthTop, new V(COVER_WIDTH + 16, COVER_HEIGHT), new V(-16, COVER_HEIGHT)],
      true,
    );
    g.fillStyle(COLORS.earthDark, 1);
    for (let x = 0; x < COVER_WIDTH; x += 90) {
      const k = x / 90;
      g.fillCircle(
        x + (k % 4) * 9,
        roadY(x) + ROAD_THICKNESS + 40 + ((k * 37) % 90),
        4 + (k % 3) * 2,
      );
    }
    g.fillStyle(COLORS.grass, 1);
    g.fillPoints(band(ROAD_THICKNESS - 2, ROAD_THICKNESS + 10), true);
    g.fillStyle(COLORS.asphalt, 1);
    g.fillPoints(band(0, ROAD_THICKNESS), true);
    g.lineStyle(4, COLORS.line, 0.85);
    const middle = ROAD_THICKNESS / 2;
    for (let x = 20; x < COVER_WIDTH; x += 70) {
      g.lineBetween(x, roadY(x) + middle, x + 30, roadY(x + 30) + middle);
    }
    g.lineStyle(4, COLORS.outline, 1);
    g.strokePoints(surface, false);
  }
}

await waitForFont();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COVER_WIDTH,
  height: COVER_HEIGHT,
  backgroundColor: COLORS.skyLow,
  scene: [CoverScene],
});
