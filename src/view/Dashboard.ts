import Phaser from 'phaser';
import { DIAL_MAX_RPM, GEARS, LUG_RPM, RED_RPM } from '../sim/car';
import { COLORS, TEXT, WIDTH } from './theme';
import { drawPanel, outlinedText, pinToScreen, textStyle } from './ui';

/** Where each gear sits on the gear stick's H, from its centre. Index 0 is neutral. */
export const GATE_SLOTS: [number, number][] = [
  [0, 0],
  [-70, -64],
  [-70, 64],
  [0, -64],
  [0, 64],
  [70, -64],
];

/** Needle angle for an engine speed: from the bottom left, clockwise round to the bottom right. */
export function dialAngle(rpm: number) {
  return Phaser.Math.DegToRad(135 + (Phaser.Math.Clamp(rpm, 0, DIAL_MAX_RPM) / DIAL_MAX_RPM) * 270);
}

/** Draws the rev counter's face (without the needle) and returns what it created. */
export function drawRevCounter(scene: Phaser.Scene, x: number, y: number, radius: number) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.outline, 0.25);
  g.fillCircle(x + 4, y + 8, radius + 12);
  g.fillStyle(COLORS.dial, 1);
  g.fillCircle(x, y, radius + 10);
  g.lineStyle(6, COLORS.outline, 1);
  g.strokeCircle(x, y, radius + 10);
  const band = (from: number, to: number, color: number) => {
    g.lineStyle(14, color, 1);
    g.beginPath();
    g.arc(x, y, radius - 8, dialAngle(from), dialAngle(to));
    g.strokePath();
  };
  band(0, LUG_RPM, COLORS.low);
  band(LUG_RPM, RED_RPM, COLORS.ok);
  band(RED_RPM, DIAL_MAX_RPM, COLORS.hot);

  const parts: Phaser.GameObjects.GameObject[] = [g];
  for (let k = 0; k <= DIAL_MAX_RPM / 1000; k++) {
    const a = dialAngle(k * 1000);
    const point = (r: number) => [x + Math.cos(a) * r, y + Math.sin(a) * r] as const;
    g.lineStyle(4, 0xffffff, 1);
    g.lineBetween(...point(radius - 24), ...point(radius + 4));
    const label = scene.add.text(...point(radius - 42), String(k), textStyle(22, TEXT.white));
    parts.push(label.setOrigin(0.5));
  }
  parts.push(scene.add.text(x, y + 30, 'rpm ×1000', textStyle(13, TEXT.dim)).setOrigin(0.5));
  return parts;
}

/** Draws the gear stick's panel and gear numbers (without the knob) and returns what it created. */
export function drawGearGate(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics();
  drawPanel(g, x, y, 236, 200, COLORS.box, 30);
  g.lineStyle(18, COLORS.gate, 1);
  g.lineBetween(x - 70, y - 64, x - 70, y + 64);
  g.lineBetween(x, y - 64, x, y + 64);
  g.lineBetween(x + 70, y - 64, x + 70, y);
  g.lineBetween(x - 70, y, x + 70, y);
  const parts: Phaser.GameObjects.GameObject[] = [g];
  for (let gear = 1; gear <= GEARS; gear++) {
    const [dx, dy] = GATE_SLOTS[gear]!;
    parts.push(
      scene.add.text(x + dx, y + dy, String(gear), textStyle(26, TEXT.white)).setOrigin(0.5),
    );
  }
  return parts;
}

/** The gear stick's knob, labelled with the gear it's in. */
export class GearKnob extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, gear = 0) {
    super(scene, x, y);
    this.label = scene.add.text(0, -2, '', textStyle(28)).setOrigin(0.5);
    this.add([scene.add.image(0, 0, 'knob').setOrigin(32 / 68, 32 / 70), this.label]);
    this.setGear(gear);
    scene.add.existing(this);
  }

  setGear(gear: number) {
    this.label.setText(gear ? String(gear) : 'N');
    return this;
  }
}

const DIAL = { x: 150, y: 588, radius: 104 };
const GATE = { x: 1130, y: 590 };
const THERMOMETER = { x: 292, top: 504, height: 120 };
const PROGRESS_Y = 86;
const PROGRESS_HALF_WIDTH = 200;

export interface DashboardOptions {
  roundNumber: number;
  title: string;
  hint?: string;
  onGear: (gear: number) => void;
  onMenu: () => void;
  onRetry: () => void;
}

export interface DashboardReading {
  rpm: number;
  atLimiter: boolean;
  kmh: number;
  heat: number;
  timeLeft: number;
  /** How far along the road the car is, from 0 to 1. */
  progress: number;
}

/** Everything fixed to the screen while driving: gauges, gear stick, clock and progress. */
export class Dashboard {
  /** The gear the knob shows. */
  shownGear = 0;
  private readonly needle: Phaser.GameObjects.Image;
  private readonly speed: Phaser.GameObjects.Text;
  private readonly thermometer: Phaser.GameObjects.Graphics;
  private readonly clock: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly knob: GearKnob;
  private shownRpm = 0;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    options: DashboardOptions,
  ) {
    const { x, y, radius } = DIAL;
    for (const part of drawRevCounter(scene, x, y, radius)) pinToScreen(part, 50);
    this.speed = pinToScreen(
      scene.add.text(x, y + 68, '', textStyle(24, TEXT.white)).setOrigin(0.5),
      51,
    );
    this.needle = pinToScreen(scene.add.image(x, y, 'needle').setOrigin(0.1, 0.5), 52);
    const cap = pinToScreen(scene.add.graphics(), 53);
    cap.fillStyle(COLORS.knob, 1);
    cap.fillCircle(x, y, 12);
    cap.lineStyle(3, COLORS.outline, 1);
    cap.strokeCircle(x, y, 12);

    const label = scene.add.text(
      THERMOMETER.x,
      THERMOMETER.top - 18,
      'TEMP',
      textStyle(14, TEXT.white),
    );
    pinToScreen(label.setOrigin(0.5), 51);
    this.thermometer = pinToScreen(scene.add.graphics(), 51);

    for (const part of drawGearGate(scene, GATE.x, GATE.y)) pinToScreen(part, 50);
    this.knob = pinToScreen(new GearKnob(scene, GATE.x, GATE.y), 52);
    GATE_SLOTS.forEach(([dx, dy], gear) => {
      const zone = scene.add.zone(GATE.x + dx, GATE.y + dy, 68, 60);
      zone.setInteractive({ useHandCursor: true }).on('pointerdown', () => options.onGear(gear));
      pinToScreen(zone, 53);
    });

    this.clock = pinToScreen(
      scene.add.text(WIDTH / 2, 36, '', outlinedText(46)).setOrigin(0.5),
      51,
    );
    this.drawProgressBar();
    this.marker = pinToScreen(scene.add.graphics(), 51);

    pinToScreen(scene.add.text(26, 16, `Round ${options.roundNumber}`, outlinedText(36)), 50);
    pinToScreen(scene.add.text(28, 60, options.title, outlinedText(24, TEXT.cream)), 50);
    this.topButton(WIDTH - 26, 'Menu', options.onMenu);
    this.topButton(WIDTH - 140, '↻', options.onRetry);
    if (options.hint) this.showHint(options.hint);
  }

  /** Moves the knob to a gear's slot. */
  showGear(gear: number) {
    this.shownGear = gear;
    const [dx, dy] = GATE_SLOTS[gear]!;
    this.knob.setGear(gear);
    this.scene.tweens.killTweensOf(this.knob);
    this.scene.tweens.add({
      targets: this.knob,
      x: GATE.x + dx,
      y: GATE.y + dy,
      duration: 90,
      ease: 'Quad.easeOut',
    });
  }

  update(dt: number, reading: DashboardReading) {
    this.time += dt;
    // The needle eases towards the revs and flutters at the rev limiter.
    const flutter = reading.atLimiter ? Math.sin(this.time * 60) * 180 : 0;
    this.shownRpm += (reading.rpm + flutter - this.shownRpm) * Math.min(1, dt * 14);
    this.needle.setRotation(dialAngle(this.shownRpm));
    this.speed.setText(`${Math.round(reading.kmh)} km/h`);
    this.drawThermometer(reading.heat);

    const secondsLeft = Math.ceil(reading.timeLeft);
    const clockText = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
    this.clock.setText(clockText).setColor(reading.timeLeft <= 10 ? TEXT.hot : TEXT.white);

    const markerX = WIDTH / 2 - PROGRESS_HALF_WIDTH + reading.progress * PROGRESS_HALF_WIDTH * 2;
    this.marker.clear();
    this.marker.fillStyle(COLORS.car, 1);
    this.marker.fillRoundedRect(markerX - 15, PROGRESS_Y - 9, 30, 18, 7);
    this.marker.lineStyle(3, COLORS.outline, 1);
    this.marker.strokeRoundedRect(markerX - 15, PROGRESS_Y - 9, 30, 18, 7);
  }

  /** A thermometer that fills up as the engine overheats, and flashes near the end. */
  private drawThermometer(heat: number) {
    const { x, top, height } = THERMOMETER;
    const g = this.thermometer;
    g.clear();
    g.fillStyle(COLORS.outline, 1);
    g.fillRoundedRect(x - 14, top - 5, 28, height + 10, 13);
    g.fillCircle(x, top + height + 16, 22);
    g.fillStyle(0x51463f, 1);
    g.fillRoundedRect(x - 8, top, 16, height, 7);
    const level = Phaser.Math.Clamp(heat, 0, 1);
    const color = level > 0.66 ? COLORS.hot : level > 0.33 ? COLORS.low : COLORS.ok;
    const flashing = level > 0.66 && Math.sin(this.time * 16) > 0;
    const fill = Math.max(8, level * height);
    g.fillStyle(color, flashing ? 0.55 : 1);
    g.fillRoundedRect(x - 8, top + height - fill, 16, fill, Math.min(7, fill / 2));
    g.fillCircle(x, top + height + 16, 16);
  }

  /** A line from start to finish, ending in a little chequered flag. */
  private drawProgressBar() {
    const g = pinToScreen(this.scene.add.graphics(), 50);
    const left = WIDTH / 2 - PROGRESS_HALF_WIDTH;
    const right = WIDTH / 2 + PROGRESS_HALF_WIDTH;
    g.lineStyle(12, COLORS.outline, 1);
    g.lineBetween(left, PROGRESS_Y, right, PROGRESS_Y);
    g.lineStyle(6, 0xffffff, 1);
    g.lineBetween(left, PROGRESS_Y, right, PROGRESS_Y);
    for (let i = 0; i < 4; i++) {
      g.fillStyle(i === 0 || i === 3 ? COLORS.outline : 0xffffff, 1);
      g.fillRect(right + 4 + (i % 2) * 9, PROGRESS_Y - 9 + Math.floor(i / 2) * 9, 9, 9);
    }
    g.lineStyle(2, COLORS.outline, 1);
    g.strokeRect(right + 4, PROGRESS_Y - 9, 18, 18);
  }

  private topButton(x: number, label: string, onClick: () => void) {
    const text = this.scene.add.text(x, 40, label, outlinedText(32)).setOrigin(1, 0.5);
    pinToScreen(text.setInteractive({ useHandCursor: true }).on('pointerup', onClick), 50);
  }

  private showHint(hint: string) {
    const text = pinToScreen(
      this.scene.add.text(WIDTH / 2, 130, hint, textStyle(26)).setOrigin(0.5),
      51,
    );
    const card = pinToScreen(this.scene.add.graphics(), 50);
    card.fillStyle(COLORS.card, 0.92);
    card.fillRoundedRect(
      WIDTH / 2 - text.width / 2 - 20,
      130 - text.height / 2 - 8,
      text.width + 40,
      text.height + 16,
      20,
    );
  }
}
