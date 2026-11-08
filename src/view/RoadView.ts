import Phaser from 'phaser';
import { BUMP_GEAR, slowingDistance } from '../sim/car';
import { Road, START_X, type TrafficLight } from '../sim/road';
import { COLORS, HEIGHT, WIDTH } from './theme';
import { drawPanel, pinToScreen, textStyle } from './ui';

/** Thickness of the road surface. */
const ROAD_THICKNESS = 26;
/** Speed bump height and half width. */
const BUMP_HEIGHT = 12;
const BUMP_HALF_WIDTH = 32;
/**
 * The car stops with its middle about 90 px before a traffic light's position, which leaves its
 * nose a little past it, so the stop line is drawn this much further on.
 */
const STOP_LINE_AHEAD = 32;

// Depths: backdrop 0-3, scenery 5, posts and signs 5.5-5.7, the road 6.

/** Everything the car drives through: the backdrop, scenery, signs, traffic lights and the road. */
export class RoadView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly farHills: Phaser.GameObjects.TileSprite;
  private readonly midHills: Phaser.GameObjects.TileSprite;
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly lamps: { light: TrafficLight; g: Phaser.GameObjects.Graphics; shown: string }[] =
    [];
  /** Camera height when the round started, for the hills' parallax. */
  private readonly baseScrollY: number;

  /** The camera should already be looking at the start of the road. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly road: Road,
    seed: string,
  ) {
    this.baseScrollY = scene.cameras.main.scrollY;
    const sky = pinToScreen(scene.add.graphics(), 0);
    sky.fillGradientStyle(COLORS.sky, COLORS.sky, COLORS.skyLow, COLORS.skyLow, 1);
    sky.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 5; i++) {
      const cloud = scene.add.image(i * 290 + 90, 60 + ((i * 67) % 140), 'cloud');
      this.clouds.push(pinToScreen(cloud.setScale(0.7 + (i % 3) * 0.2), 1));
    }
    this.farHills = pinToScreen(
      scene.add.tileSprite(0, 230, WIDTH, 420, 'hillsFar').setOrigin(0),
      2,
    );
    this.midHills = pinToScreen(
      scene.add.tileSprite(0, 300, WIDTH, 420, 'hillsMid').setOrigin(0),
      3,
    );
    this.placeScenery(new Phaser.Math.RandomDataGenerator([seed]));
    this.placeSigns();
    this.placeLights();
    const flagX = road.finish + 50;
    const flagY = road.heightAt(flagX);
    this.post(flagX, flagY, 200);
    scene.add
      .image(flagX + 3, flagY - 196, 'flag')
      .setOrigin(0)
      .setDepth(5.6);
    this.ground = scene.add.graphics().setDepth(6);
  }

  /** How high a speed bump lifts a wheel at x. */
  bumpHeightAt(x: number) {
    for (const bump of this.road.bumps) {
      const d = Math.abs(x - bump);
      if (d < BUMP_HALF_WIDTH) return BUMP_HEIGHT * Math.cos((d / BUMP_HALF_WIDTH) * (Math.PI / 2));
    }
    return 0;
  }

  /**
   * Moves the backdrop with the camera and redraws the stretch of road on screen.
   * Returns true when a traffic light has just turned green.
   */
  update(dt: number, carMovedBy: number) {
    const camera = this.scene.cameras.main;
    this.farHills.tilePositionX = camera.scrollX * 0.12;
    this.midHills.tilePositionX = camera.scrollX * 0.3;
    const rise = Phaser.Math.Clamp((this.baseScrollY - camera.scrollY) * 0.05, -60, 140);
    this.farHills.y = 230 + rise * 0.6;
    this.midHills.y = 300 + rise;
    for (const cloud of this.clouds) {
      cloud.x -= carMovedBy * 0.04 + 6 * dt;
      if (cloud.x < -120) cloud.x += WIDTH + 240;
    }
    this.drawRoad(camera);
    return this.drawLamps();
  }

  /** Trees, with houses where the speed limit is low. */
  private placeScenery(random: Phaser.Math.RandomDataGenerator) {
    const road = this.road;
    const town = ['house0', 'house1', 'house0', 'house1', 'tree0', 'bush'];
    const country = ['tree0', 'tree1', 'tree1', 'bush', 'tree0', 'house0'];
    for (let x = -300; x < road.length + 900; x += random.between(170, 400)) {
      const key = random.pick(road.limitAt(x).kmh <= 50 ? town : country);
      const image = this.scene.add
        .image(x, road.heightAt(x) + 14, key)
        .setOrigin(0.5, 1)
        .setDepth(5);
      image.setScale(random.realInRange(0.8, 1.05)).setFlipX(random.frac() < 0.5);
    }
  }

  /** Speed limits, and warnings ahead of steep hills and speed bumps, spaced out along the road. */
  private placeSigns() {
    const road = this.road;
    const signs: { x: number; place: (x: number) => void }[] = [];
    road.limits.forEach((limit, i) => {
      const x = i === 0 ? START_X + 300 : limit.at;
      signs.push({ x, place: (at) => this.limitSign(at, limit.kmh) });
    });
    for (const { at, grade } of road.segments) {
      if (Math.abs(grade) < 5) continue;
      const kind = grade > 0 ? 'up' : 'down';
      signs.push({ x: at - 520, place: (x) => this.warningSign(x, kind, `${Math.abs(grade)}%`) });
    }
    for (const bump of road.bumps) {
      // Far enough ahead to change down for the bump in time, even from the speed limit.
      const limit = road.limitAt(bump).speed;
      const ahead = Math.max(640, slowingDistance(limit, BUMP_GEAR) + 300);
      signs.push({ x: bump - ahead, place: (x) => this.warningSign(x, 'bump') });
    }
    signs.sort((a, b) => a.x - b.x);
    let last = -Infinity;
    for (const sign of signs) {
      const x = Math.max(sign.x, last + 110);
      sign.place(x);
      last = x;
    }
  }

  private placeLights() {
    for (const light of this.road.lights) {
      const x = light.at + STOP_LINE_AHEAD + 16;
      const y = this.road.heightAt(x);
      this.post(x, y, 140);
      this.scene.add
        .image(x, y - 132, 'lightBox')
        .setOrigin(0.5, 1)
        .setDepth(5.6);
      this.lamps.push({ light, g: this.scene.add.graphics().setDepth(5.7), shown: '' });
    }
  }

  /** A grey post standing behind the road. */
  private post(x: number, y: number, height: number) {
    const g = this.scene.add.graphics().setDepth(5.5);
    g.fillStyle(COLORS.pole, 1);
    g.fillRect(x - 4, y - height, 8, height + 12);
    g.lineStyle(3, COLORS.outline, 1);
    g.strokeRect(x - 4, y - height, 8, height + 12);
  }

  private limitSign(x: number, kmh: number) {
    const y = this.road.heightAt(x);
    this.post(x, y, 100);
    this.scene.add.image(x, y - 112, 'limit').setDepth(5.6);
    const text = this.scene.add.text(x, y - 112, String(kmh), textStyle(kmh >= 100 ? 24 : 28));
    text.setOrigin(0.5).setDepth(5.7);
  }

  private warningSign(x: number, kind: 'bump' | 'up' | 'down', label?: string) {
    const y = this.road.heightAt(x);
    this.post(x, y, 96);
    this.scene.add.image(x, y - 116, `warn-${kind}`).setDepth(5.6);
    if (!label) return;
    drawPanel(this.scene.add.graphics().setDepth(5.6), x, y - 58, 64, 30, 0xffffff, 8);
    this.scene.add
      .text(x, y - 58, label, textStyle(20))
      .setOrigin(0.5)
      .setDepth(5.7);
  }

  /** The stretch of road on screen: earth, a grass verge, the asphalt and what's on it. */
  private drawRoad(camera: Phaser.Cameras.Scene2D.Camera) {
    const g = this.ground;
    const road = this.road;
    const V = Phaser.Math.Vector2;
    const x0 = Math.floor((camera.scrollX - 40) / 8) * 8;
    const x1 = camera.scrollX + WIDTH + 48;
    const bottom = camera.scrollY + HEIGHT + 60;
    const surface: Phaser.Math.Vector2[] = [];
    for (let x = x0; x <= x1; x += 8) surface.push(new V(x, road.heightAt(x)));
    const band = (from: number, to: number) => [
      ...surface.map((p) => new V(p.x, p.y + from)),
      ...surface
        .slice()
        .reverse()
        .map((p) => new V(p.x, p.y + to)),
    ];
    g.clear();

    g.fillStyle(COLORS.earth, 1);
    const earthTop = surface.map((p) => new V(p.x, p.y + ROAD_THICKNESS));
    g.fillPoints([...earthTop, new V(x1, bottom), new V(x0, bottom)], true);
    g.fillStyle(COLORS.earthDark, 1);
    for (let x = Math.ceil(x0 / 90) * 90; x < x1; x += 90) {
      const k = Math.abs(x / 90);
      const y = road.heightAt(x) + ROAD_THICKNESS + 40 + ((k * 37) % 90);
      g.fillCircle(x + (k % 4) * 9, y, 4 + (k % 3) * 2);
    }
    g.fillStyle(COLORS.grass, 1);
    g.fillPoints(band(ROAD_THICKNESS - 2, ROAD_THICKNESS + 10), true);
    g.fillStyle(COLORS.asphalt, 1);
    g.fillPoints(band(0, ROAD_THICKNESS), true);
    g.lineStyle(4, COLORS.line, 0.85);
    const middle = ROAD_THICKNESS / 2;
    for (let x = Math.ceil(x0 / 70) * 70; x < x1; x += 70) {
      g.lineBetween(x, road.heightAt(x) + middle, x + 30, road.heightAt(x + 30) + middle);
    }

    for (const mud of road.mud) this.drawMud(mud.from, mud.to, x0, x1);
    for (const bump of road.bumps) {
      if (bump > x0 - BUMP_HALF_WIDTH && bump < x1 + BUMP_HALF_WIDTH) this.drawBump(bump);
    }
    for (const light of road.lights) {
      const x = light.at + STOP_LINE_AHEAD;
      if (x < x0 || x > x1) continue;
      g.fillStyle(0xffffff, 1);
      g.fillRect(x - 4, road.heightAt(x) + 2, 8, ROAD_THICKNESS - 4);
    }
    if (road.finish > x0 && road.finish < x1) this.drawFinishLine();
    g.lineStyle(4, COLORS.outline, 1);
    g.strokePoints(surface, false);
  }

  /** A lumpy layer of mud over the whole road, with puddles in it. */
  private drawMud(from: number, to: number, x0: number, x1: number) {
    const a = Math.max(from, x0);
    const b = Math.min(to, x1);
    if (a >= b) return;
    const g = this.ground;
    const V = Phaser.Math.Vector2;
    const points: Phaser.Math.Vector2[] = [];
    for (let x = a; x <= b; x += 8) points.push(new V(x, this.road.heightAt(x)));
    const lump = (x: number) =>
      (Math.min(x - from, to - x, 40) / 40) * (9 + 4 * Math.sin(x / 23) + 2 * Math.sin(x / 9));
    const top = points.map((p) => new V(p.x, p.y - lump(p.x)));
    const bottom = points.map((p) => new V(p.x, p.y + ROAD_THICKNESS + 2)).reverse();
    g.fillStyle(COLORS.mud, 1);
    g.fillPoints([...top, ...bottom], true);
    g.lineStyle(3, COLORS.outline, 0.7);
    g.strokePoints(top, false);
    for (let x = Math.ceil(a / 52) * 52; x < b - 16; x += 52) {
      const y = this.road.heightAt(x);
      g.fillStyle(COLORS.mudLight, 1);
      g.fillEllipse(x + 8, y + 9, 30, 7);
      g.fillStyle(0xd7b48a, 0.7);
      g.fillEllipse(x + 4, y + 8, 10, 3);
    }
  }

  /** A striped hump. */
  private drawBump(at: number) {
    const g = this.ground;
    const road = this.road;
    const hump: Phaser.Math.Vector2[] = [];
    for (let x = at - BUMP_HALF_WIDTH; x <= at + BUMP_HALF_WIDTH; x += 4) {
      hump.push(new Phaser.Math.Vector2(x, road.heightAt(x) - this.bumpHeightAt(x)));
    }
    g.fillStyle(COLORS.bump, 1);
    g.fillPoints(hump, true);
    g.lineStyle(5, COLORS.outline, 1);
    for (const s of [-14, 2, 18]) {
      const x = at + s;
      g.lineBetween(
        x - 4,
        road.heightAt(x) + 1,
        x + 2,
        road.heightAt(x) - this.bumpHeightAt(x) + 2,
      );
    }
    g.lineStyle(3, COLORS.outline, 1);
    g.strokePoints(hump, true);
  }

  private drawFinishLine() {
    const g = this.ground;
    const x = this.road.finish;
    const y = this.road.heightAt(x);
    for (let i = 0; i < 8; i++) {
      g.fillStyle((i + Math.floor(i / 4)) % 2 ? COLORS.outline : 0xffffff, 1);
      g.fillRect(x - 16 + (i % 4) * 8, y + 1 + Math.floor(i / 4) * 12, 8, 12);
    }
  }

  /** Redraws lights that changed. Returns true if one has just turned green. */
  private drawLamps() {
    let turnedGreen = false;
    for (const lamp of this.lamps) {
      const state = lamp.light.state;
      if (state === lamp.shown) continue;
      turnedGreen ||= state === 'green' && lamp.shown !== '';
      lamp.shown = state;
      const x = lamp.light.at + STOP_LINE_AHEAD + 16;
      const y = this.road.heightAt(x) - 132;
      const colors = [
        state === 'green' ? COLORS.lampOff : COLORS.red,
        state === 'amber' ? COLORS.amber : COLORS.lampOff,
        state === 'green' ? COLORS.green : COLORS.lampOff,
      ];
      lamp.g.clear();
      colors.forEach((color, i) => {
        lamp.g.fillStyle(color, 1);
        lamp.g.fillCircle(x, y - 86 + i * 32, 12);
      });
    }
    return turnedGreen;
  }
}
