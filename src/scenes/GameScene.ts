import Phaser from 'phaser';
import { engineSound, sfx } from '../audio';
import { progress } from '../progress';
import type { Phase } from '../snapshot';
import { GEAR_TOP_SPEED, GEARS, KMH_PER_PX, rpmAt, type CarEvent } from '../sim/car';
import { Bot } from '../sim/drivers';
import { START_X } from '../sim/road';
import { LAST_ROUND, ROUNDS, type Round } from '../sim/rounds';
import { FIXED_STEP, RoundRun, type Outcome } from '../sim/run';
import { CarView, TUMBLE_TIME } from '../view/CarView';
import { Dashboard } from '../view/Dashboard';
import { RoadView } from '../view/RoadView';
import { COLORS, HEIGHT, TEXT, WIDTH } from '../view/theme';
import { button, drawPanel, outlinedText, pinToScreen, textStyle } from '../view/ui';

/** Seconds before the clock starts. The round's name shows, and a gear can already go in. */
const READY_TIME = 1.2;
/** Where the car sits on the screen when it stands still. */
const CAR_SCREEN_X = 330;
const CAR_SCREEN_Y = 410;
/** At top speed the car sits this much further left, showing more of the road ahead. */
const CAMERA_LEAD = 80;
/** Changing up from above these revs pops the exhaust. */
const POPS_RPM = 4800;
/** A round's hint shows for this many tries. */
const HINT_TRIES = 3;

type Failure = Exclude<Outcome, 'finished'>;

const FAILURES: Record<Failure, { title: string; text: string }> = {
  stalled: {
    title: 'Stalled!',
    text: 'The gear was too high for the speed.\nChange down as the car slows,\nand pull away in 1st.',
  },
  late: {
    title: 'Too slow!',
    text: 'The clock ran out.\nA gear too low keeps the car slow:\nchange up as the needle climbs.',
  },
  blown: {
    title: 'Engine blown!',
    text: 'Down a steep hill in too low a gear,\nthe engine spun far past the red.\nChange up on the way down.',
  },
  crashed: {
    title: 'Crashed!',
    text: 'Over a speed bump too fast,\nthe car flipped. Change down to 2nd\nbefore a bump to slow it down.',
  },
};

/**
 * One round: a road to drive before the clock runs out. The car drives itself (src/sim); the
 * player only changes gear, with the keys or by tapping the gear stick.
 *
 * URL flags for testing, on the dev server only: ?round=N starts round N, ?bot lets the bot drive
 * and ?speed=N runs N times faster.
 */
export class GameScene extends Phaser.Scene {
  private round!: Round;
  private run!: RoundRun;
  private tries = 0;
  private autopilot = false;
  private speed = 1;
  private phase: Phase = 'ready';
  private readyTime = 0;
  private accumulator = 0;
  private lastCountdown = 0;
  private leaving = false;
  private humming = false;
  private lastCarX = 0;
  private roadView!: RoadView;
  private carView!: CarView;
  private dashboard!: Dashboard;
  private message?: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  init(data: { round?: number; tries?: number }) {
    const params = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    this.autopilot = params.has('bot');
    this.speed = Phaser.Math.Clamp(Number(params.get('speed')) || 1, 1, 10);
    const requested = data.round ?? (Number(params.get('round')) || progress.unlockedRound);
    this.round = ROUNDS[Phaser.Math.Clamp(Math.floor(requested), 1, LAST_ROUND) - 1]!;
    this.tries = data.tries ?? 0;
    this.phase = 'ready';
    this.readyTime = 0;
    this.accumulator = 0;
    this.lastCountdown = 0;
    this.leaving = false;
    this.humming = false;
    this.message = undefined;
  }

  create() {
    this.run = new RoundRun(this.round, this.autopilot ? new Bot() : null);
    const camera = this.cameras.main;
    camera.scrollX = this.run.car.x - CAR_SCREEN_X;
    camera.scrollY = this.cameraFocus() - CAR_SCREEN_Y;
    this.lastCarX = this.run.car.x;

    this.roadView = new RoadView(this, this.run.road, `manualcar-${this.round.n}`);
    this.carView = new CarView(this);
    this.dashboard = new Dashboard(this, {
      roundNumber: this.round.n,
      title: this.round.title,
      hint: this.tries < HINT_TRIES ? this.round.hint : undefined,
      onGear: (gear) => this.changeGear(gear),
      onMenu: () => this.scene.start('menu'),
      onRetry: () => this.retry(),
    });
    this.listenToKeys();
    this.events.once('shutdown', () => engineSound.stop());
    this.startEngineSound();

    const name = `Round ${this.round.n}: ${this.round.title}`;
    const title = pinToScreen(
      this.add.text(WIDTH / 2, 250, name, outlinedText(60)).setOrigin(0.5),
      40,
    );
    this.tweens.add({
      targets: title,
      alpha: 0,
      y: 230,
      delay: 1000,
      duration: 600,
      onComplete: () => title.destroy(),
    });
    this.draw(0);
    this.report();
  }

  update(_time: number, delta: number) {
    if (!this.leaving) {
      this.accumulator += (Math.min(delta, 100) / 1000) * this.speed;
      while (this.accumulator >= FIXED_STEP) {
        this.accumulator -= FIXED_STEP;
        this.step();
      }
    }
    this.draw(delta / 1000);
    this.report();
  }

  private step() {
    const run = this.run;
    if (this.phase === 'ready') {
      this.readyTime += FIXED_STEP;
      if (this.readyTime >= READY_TIME) {
        this.phase = 'driving';
        run.start();
      }
    }
    run.step(FIXED_STEP);
    for (const event of run.car.events) this.onCarEvent(event);
    // The bot changes gear inside the run.
    if (run.car.gear !== this.dashboard.shownGear) this.showGearChange();
    if (this.phase !== 'driving') return;
    if (run.outcome === 'finished') this.finish();
    else if (run.outcome) this.fail(run.outcome);
    else this.countDown();
  }

  /** Where the car sits across the screen: further left the faster it goes. */
  private carScreenX() {
    return CAR_SCREEN_X - (CAMERA_LEAD * Math.abs(this.run.car.v)) / GEAR_TOP_SPEED[GEARS];
  }

  /** Where the camera looks: the road under the car, and a little of what's ahead. */
  private cameraFocus() {
    const { car, road } = this.run;
    return road.heightAt(car.x) * 0.75 + road.heightAt(car.x + 400) * 0.25;
  }

  private draw(dt: number) {
    const { car, road } = this.run;
    const camera = this.cameras.main;
    const moved = car.x - this.lastCarX;
    this.lastCarX = car.x;
    const kmh = Math.abs(car.v) * KMH_PER_PX;
    const bumpHeightAt = (x: number) => this.roadView.bumpHeightAt(x);
    if (this.carView.update(dt, car, road, bumpHeightAt, this.humming && !this.leaving)) {
      sfx.bump(kmh);
    }
    camera.scrollX = car.x - this.carScreenX();
    camera.scrollY += (this.cameraFocus() - CAR_SCREEN_Y - camera.scrollY) * Math.min(1, dt * 3);
    if (this.roadView.update(dt, moved)) sfx.lightGreen();
    this.dashboard.update(dt, {
      rpm: car.rpm,
      atLimiter: car.atLimiter,
      judder: car.judder,
      kmh,
      heat: car.heat,
      timeLeft: this.run.timeLeft,
      progress: Phaser.Math.Clamp((car.x - START_X) / (road.finish - START_X), 0, 1),
    });
    if (this.humming) {
      engineSound.update({
        rpm: car.engine === 'running' ? car.rpm : 0,
        load: car.throttle,
        judder: car.judder,
        atLimiter: car.atLimiter,
        gear: car.gear,
        kmh,
      });
    }
  }

  // Input

  private listenToKeys() {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const gear = this.run.car.gear;
      const key = e.key;
      if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === 'Shift')
        this.changeGear(gear + 1);
      else if (key === 'ArrowDown' || key === 's' || key === 'S') this.changeGear(gear - 1);
      else if (key.length === 1 && key >= '1' && key <= String(GEARS)) this.changeGear(Number(key));
      else if (key === 'n' || key === 'N' || key === '0') this.changeGear(0);
      else if (key === 'r' || key === 'R') this.retry();
      else if ((key === 'Enter' || key === ' ') && this.phase === 'failed') this.retry();
      else return;
      e.preventDefault();
    };
    // Window events rather than Phaser's keyboard plugin, which can deliver a key press twice.
    window.addEventListener('keydown', onKeyDown);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKeyDown));
  }

  private changeGear(gear: number) {
    if (this.phase !== 'ready' && this.phase !== 'driving') return;
    gear = Phaser.Math.Clamp(gear, 0, GEARS);
    if (gear === this.run.car.gear) return;
    this.run.car.shift(gear);
    this.showGearChange();
  }

  /**
   * A gear change, the player's or the bot's: a clunk, pops for a change up at high revs, squealing
   * tyres for a gear far too low for the speed, and the new gear on the dashboard.
   */
  private showGearChange() {
    const car = this.run.car;
    const from = this.dashboard.shownGear;
    sfx.gearIn();
    engineSound.shift();
    if (car.gear > from && from > 0 && rpmAt(car.v, from) > POPS_RPM) sfx.pops();
    if (car.slowingToGear) {
      sfx.screech();
      this.cameras.main.shake(140, 0.004);
    }
    this.dashboard.showGear(car.gear);
  }

  // Events and endings

  private onCarEvent(event: CarEvent) {
    this.stopEngineSound();
    if (event === 'stalled') {
      sfx.stall();
      this.say('Stalled!', TEXT.hot);
      this.carView.smokeBurst(true);
    } else if (event === 'blown') {
      sfx.bang();
      this.cameras.main.shake(350, 0.012);
      this.say('BANG!', TEXT.hot);
    } else {
      sfx.crash(TUMBLE_TIME);
      this.cameras.main.shake(200, 0.008);
      this.say('CRASH!', TEXT.hot);
    }
  }

  /** Ticks through the last five seconds. */
  private countDown() {
    const left = Math.ceil(this.run.timeLeft);
    if (left <= 5 && left !== this.lastCountdown) {
      this.lastCountdown = left;
      sfx.tick();
    }
  }

  private finish() {
    this.phase = 'finished';
    progress.markFinished(this.round.n);
    sfx.finish();
    this.say('Made it!', TEXT.cream);
    if (this.round.n < LAST_ROUND) {
      this.time.delayedCall(1700, () => this.restart(this.round.n + 1, 0));
      return;
    }
    this.time.delayedCall(1400, () => {
      this.stopEngineSound();
      sfx.allRoundsDone();
      this.showCard('You did it!', `All ${LAST_ROUND} rounds, and not a gear wasted.`, [
        ['Menu', () => this.scene.start('menu'), true],
      ]);
    });
  }

  private fail(failure: Failure) {
    this.phase = 'failed';
    if (failure === 'late') sfx.timeUp();
    if (this.autopilot) {
      this.time.delayedCall(500, () => this.retry());
      return;
    }
    // Let a stalled car roll back, the smoke clear or a flipped car land before the card.
    const delay = { late: 800, stalled: 1300, blown: 1300, crashed: 1800 }[failure];
    this.time.delayedCall(delay, () => {
      this.stopEngineSound();
      const { title, text } = FAILURES[failure];
      this.showCard(title, text, [
        ['Try again', () => this.retry(), true],
        ['Menu', () => this.scene.start('menu'), false],
      ]);
    });
  }

  private retry() {
    this.restart(this.round.n, this.tries + 1);
  }

  private restart(round: number, tries: number) {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.restart({ round, tries });
  }

  private startEngineSound() {
    engineSound.start();
    this.humming = true;
  }

  private stopEngineSound() {
    engineSound.stop();
    this.humming = false;
  }

  /** A word over the car that floats up and fades. */
  private say(text: string, color: string = TEXT.white) {
    this.message?.destroy();
    const { x, y } = this.carView.position;
    const style = { ...outlinedText(34, color), align: 'center' };
    const message = this.add
      .text(x, y - 130, text, style)
      .setOrigin(0.5)
      .setDepth(30);
    this.message = message;
    this.tweens.add({
      targets: message,
      y: message.y - 50,
      alpha: { from: 1, to: 0 },
      delay: 800,
      duration: 700,
      onComplete: () => message.destroy(),
    });
  }

  private showCard(title: string, text: string, buttons: [string, () => void, boolean][]) {
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.outline, 0.45);
    pinToScreen(shade.setInteractive(), 60);
    drawPanel(
      pinToScreen(this.add.graphics(), 61),
      WIDTH / 2,
      HEIGHT / 2,
      680,
      400,
      COLORS.card,
      36,
    );
    const heading = this.add.text(WIDTH / 2, HEIGHT / 2 - 122, title, outlinedText(76, TEXT.coral));
    pinToScreen(heading.setOrigin(0.5), 62);
    const style = { ...textStyle(29), align: 'center', wordWrap: { width: 600 } };
    pinToScreen(this.add.text(WIDTH / 2, HEIGHT / 2 - 8, text, style).setOrigin(0.5), 62);
    buttons.forEach(([label, onClick, primary], i) => {
      const x = WIDTH / 2 + (i - (buttons.length - 1) / 2) * 280;
      button(this, x, HEIGHT / 2 + 112, label, onClick, {
        width: 250,
        height: 90,
        fontSize: 38,
        primary,
      })
        .setScrollFactor(0, 0, true)
        .setDepth(62);
    });
  }

  private report() {
    const { car, road, outcome, elapsed } = this.run;
    window.__manualcar = {
      phase: this.phase,
      outcome,
      round: this.round.n,
      tries: this.tries,
      gear: car.gear,
      rpm: Math.round(car.rpm),
      kmh: Math.round(Math.abs(car.v) * KMH_PER_PX),
      x: Math.round(car.x),
      v: Math.round(car.v * 10) / 10,
      heat: Math.round(car.heat * 100) / 100,
      engine: car.engine,
      elapsed: Math.round(elapsed * 10) / 10,
      timeLimit: this.round.timeLimit,
      lights: road.lights.map((light) => light.state),
      unlockedRound: progress.unlockedRound,
      completedAll: progress.completedAll,
    };
  }
}
