import Phaser from 'phaser';
import { isSoundOn, toggleSound } from '../audio';
import { progress } from '../progress';
import { LAST_ROUND } from '../sim/rounds';
import { CAR_ORIGIN, EXHAUST, WHEEL_RADIUS, WHEELBASE } from '../view/textures';
import { COLORS, HEIGHT, TEXT, WIDTH } from '../view/theme';
import { button, drawPanel, outlinedText } from '../view/ui';

/** Top of the road the car idles on. */
const ROAD_Y = 560;

/** The title over a country road with the car idling on it, and a card to start a round. */
export class MenuScene extends Phaser.Scene {
  private chosenRound = 1;

  constructor() {
    super('menu');
  }

  create() {
    this.drawCountryside();
    this.idlingCar(1010);
    this.add
      .text(WIDTH / 2, 96, 'Manual Car', outlinedText(110))
      .setOrigin(0.5)
      .setAngle(-3);
    this.add
      .text(WIDTH / 2, 186, 'change gear, don’t stall', outlinedText(40, TEXT.cream))
      .setOrigin(0.5);

    this.chosenRound = progress.unlockedRound;
    drawPanel(this.add.graphics(), WIDTH / 2, 380, 440, 260, COLORS.card, 34);
    button(this, WIDTH / 2, 320, 'Play', () => this.play(), {
      width: 300,
      height: 100,
      fontSize: 56,
      primary: true,
    });
    this.roundPicker(412);
    const soundLabel = () => (isSoundOn() ? '🔊 Sound on' : '🔈 Sound off');
    const sound = this.add.text(WIDTH / 2, 472, soundLabel(), outlinedText(28)).setOrigin(0.5);
    sound.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      toggleSound();
      sound.setText(soundLabel());
    });

    const keys = '▲ or Shift: change up     ▼: change down     1–5: a gear     R: try again';
    this.add.text(WIDTH / 2, 668, keys, outlinedText(24, TEXT.cream)).setOrigin(0.5);
    this.input.keyboard?.once('keydown-ENTER', () => this.play());
  }

  private play() {
    this.scene.start('game', { round: this.chosenRound });
  }

  /** ‹ Round N › to replay any round reached so far. */
  private roundPicker(y: number) {
    const label = this.add.text(WIDTH / 2, y, '', outlinedText(38, TEXT.cream)).setOrigin(0.5);
    const arrow = (dx: number, text: string, step: number) =>
      this.add
        .text(WIDTH / 2 + dx, y, text, outlinedText(54))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          this.chosenRound = Phaser.Math.Clamp(this.chosenRound + step, 1, progress.unlockedRound);
          show();
        });
    const previous = arrow(-150, '‹', -1);
    const next = arrow(150, '›', 1);
    const show = () => {
      const star = progress.completedAll && this.chosenRound === LAST_ROUND ? ' ★' : '';
      label.setText(`Round ${this.chosenRound}${star}`);
      previous.setAlpha(this.chosenRound > 1 ? 1 : 0.3);
      next.setAlpha(this.chosenRound < progress.unlockedRound ? 1 : 0.3);
    };
    show();
  }

  private drawCountryside() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(COLORS.sky, COLORS.sky, COLORS.skyLow, COLORS.skyLow, 1);
    sky.fillRect(0, 0, WIDTH, HEIGHT);
    this.add
      .image(WIDTH / 2, 250, 'hillsFar')
      .setOrigin(0.5, 0)
      .setScale(1.05, 1);
    this.add.image(WIDTH / 2, 330, 'hillsMid').setOrigin(0.5, 0);
    for (const [x, y, scale] of [
      [160, 90, 0.9],
      [1080, 70, 1.1],
      [700, 180, 0.7],
    ] as const) {
      this.add.image(x, y, 'cloud').setScale(scale);
    }
    for (const [key, x] of [
      ['tree1', 70],
      ['house0', 230],
      ['tree0', 380],
      ['tree1', 900],
      ['house1', 1180],
    ] as const) {
      this.add.image(x, ROAD_Y + 14, key).setOrigin(0.5, 1);
    }
    const road = this.add.graphics();
    road.fillStyle(COLORS.earth, 1);
    road.fillRect(0, ROAD_Y + 26, WIDTH, HEIGHT - ROAD_Y);
    road.fillStyle(COLORS.grass, 1);
    road.fillRect(0, ROAD_Y + 24, WIDTH, 12);
    road.fillStyle(COLORS.asphalt, 1);
    road.fillRect(0, ROAD_Y, WIDTH, 26);
    road.fillStyle(COLORS.line, 0.85);
    for (let x = 10; x < WIDTH; x += 70) road.fillRect(x, ROAD_Y + 11, 30, 4);
    road.fillStyle(COLORS.outline, 1);
    road.fillRect(0, ROAD_Y - 2, WIDTH, 4);
  }

  /** The car ticking over: a slight shake and a puff of exhaust now and then. */
  private idlingCar(x: number) {
    const y = ROAD_Y - WHEEL_RADIUS;
    const car = this.add.container(x, y, [
      this.add.image(0, 0, 'car').setOrigin(CAR_ORIGIN.x, CAR_ORIGIN.y),
      this.add.image(-WHEELBASE / 2, 0, 'wheel'),
      this.add.image(WHEELBASE / 2, 0, 'wheel'),
    ]);
    this.tweens.add({ targets: car, y: y - 1.5, duration: 70, yoyo: true, repeat: -1 });
    this.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => {
        const puff = this.add
          .image(x + EXHAUST.x, y + EXHAUST.y, 'puff')
          .setScale(0.45)
          .setAlpha(0.9);
        this.tweens.add({
          targets: puff,
          x: puff.x - 50,
          y: puff.y - 26,
          scale: 0.9,
          alpha: 0,
          duration: 900,
          onComplete: () => puff.destroy(),
        });
      },
    });
  }
}
