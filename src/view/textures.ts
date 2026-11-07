import Phaser from 'phaser';
import { COLORS } from './theme';

/** Wheel centres sit this far apart, and this big. */
export const WHEELBASE = 128;
export const WHEEL_RADIUS = 24;
/** The car texture, drawn with the point midway between the wheel centres at (cx, cy). */
const CAR = { width: 232, height: 116, cx: 116, cy: 88 };
export const CAR_ORIGIN = { x: CAR.cx / CAR.width, y: CAR.cy / CAR.height };
/** Exhaust pipe and bonnet, relative to the point midway between the wheel centres. */
export const EXHAUST = { x: -114, y: 2 };
export const BONNET = { x: 84, y: -38 };

/** Draws every texture the game uses. There are no image files. */
export function createTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({}, false);
  const save = (key: string, width: number, height: number) => {
    g.generateTexture(key, width, height);
    g.clear();
  };
  const outline = (width = 4) => g.lineStyle(width, COLORS.outline, 1);

  // The car: cabin with a sloping back and windscreen, windows with a glint each, and the body
  // with arches cut out for the wheels.
  g.fillStyle(COLORS.car, 1);
  g.fillRoundedRect(62, 10, 120, 54, { tl: 36, tr: 28, bl: 4, br: 4 });
  outline();
  g.strokeRoundedRect(62, 10, 120, 54, { tl: 36, tr: 28, bl: 4, br: 4 });
  for (const [x, w, tl, tr] of [
    [76, 46, 24, 6],
    [128, 42, 6, 20],
  ] as const) {
    g.fillStyle(COLORS.glass, 1);
    g.fillRoundedRect(x, 20, w, 30, { tl, tr, bl: 4, br: 4 });
    outline(3);
    g.strokeRoundedRect(x, 20, w, 30, { tl, tr, bl: 4, br: 4 });
    g.lineStyle(4, 0xffffff, 0.8);
    g.lineBetween(x + w * 0.45, 26, x + w * 0.3, 42);
  }
  g.fillStyle(COLORS.car, 1);
  g.fillRoundedRect(8, 50, 216, 46, 20);
  outline();
  g.strokeRoundedRect(8, 50, 216, 46, 20);
  g.fillStyle(COLORS.carDark, 1);
  g.fillRoundedRect(14, 80, 204, 12, 6);
  for (const x of [CAR.cx - WHEELBASE / 2, CAR.cx + WHEELBASE / 2]) {
    g.fillStyle(COLORS.outline, 1);
    g.fillCircle(x, CAR.cy + 2, WHEEL_RADIUS + 7);
  }
  // Door and handle, lights, bumpers, exhaust pipe.
  g.lineStyle(3, COLORS.carDark, 1);
  g.lineBetween(124, 54, 124, 84);
  g.fillStyle(COLORS.carDark, 1);
  g.fillRoundedRect(132, 60, 16, 6, 3);
  g.fillStyle(COLORS.headlight, 1);
  g.fillRoundedRect(212, 56, 14, 14, 5);
  outline(3);
  g.strokeRoundedRect(212, 56, 14, 14, 5);
  g.fillStyle(COLORS.taillight, 1);
  g.fillRoundedRect(4, 56, 10, 16, 4);
  g.strokeRoundedRect(4, 56, 10, 16, 4);
  g.fillStyle(COLORS.outline, 1);
  g.fillRoundedRect(206, 84, 24, 10, 5);
  g.fillRoundedRect(2, 84, 24, 10, 5);
  g.fillStyle(COLORS.pole, 1);
  g.fillRoundedRect(0, 92, 14, 7, 3);
  save('car', CAR.width, CAR.height);

  // A wheel: tyre, hub and spokes, so it can be seen turning.
  const r = WHEEL_RADIUS;
  g.fillStyle(COLORS.tyre, 1);
  g.fillCircle(r + 2, r + 2, r);
  g.fillStyle(COLORS.hub, 1);
  g.fillCircle(r + 2, r + 2, r * 0.5);
  g.lineStyle(3, COLORS.outline, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.lineBetween(r + 2, r + 2, r + 2 + Math.cos(a) * r * 0.48, r + 2 + Math.sin(a) * r * 0.48);
  }
  g.strokeCircle(r + 2, r + 2, r * 0.5);
  g.fillStyle(COLORS.outline, 1);
  g.fillCircle(r + 2, r + 2, 3);
  save('wheel', r * 2 + 4, r * 2 + 4);

  // Smoke and steam (tinted when used), and a drop of mud.
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(22, 22, 20);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(22, 22, 14);
  save('puff', 44, 44);
  g.fillStyle(COLORS.mud, 1);
  g.fillCircle(6, 6, 5);
  save('drop', 12, 12);

  // Countryside.
  g.fillStyle(COLORS.cloud, 1);
  g.fillEllipse(80, 40, 120, 46);
  g.fillEllipse(44, 50, 70, 34);
  g.fillEllipse(118, 50, 76, 36);
  save('cloud', 160, 72);
  drawHills(g, 'hillsFar', COLORS.hillFar, 140, [
    [45, 2, 0],
    [25, 4, 1.3],
  ]);
  drawHills(g, 'hillsMid', COLORS.hillMid, 170, [
    [60, 3, 0.5],
    [20, 7, 2],
  ]);

  // A round tree, a pine and a bush.
  g.fillStyle(COLORS.trunk, 1);
  g.fillRect(52, 110, 16, 80);
  for (const [x, y, radius] of [
    [60, 70, 46],
    [34, 98, 30],
    [88, 96, 32],
  ] as const) {
    g.fillStyle(COLORS.leafDark, 1);
    g.fillCircle(x, y + 4, radius);
    g.fillStyle(COLORS.leaf, 1);
    g.fillCircle(x - 3, y, radius - 4);
  }
  save('tree0', 120, 190);
  g.fillStyle(COLORS.trunk, 1);
  g.fillRect(43, 160, 14, 30);
  for (const [top, base, half] of [
    [10, 80, 34],
    [40, 122, 42],
    [80, 166, 50],
  ] as const) {
    g.fillStyle(COLORS.leafDark, 1);
    g.fillTriangle(50, top, 50 + half, base, 50 - half, base);
  }
  save('tree1', 100, 190);
  g.fillStyle(COLORS.leafDark, 1);
  g.fillEllipse(45, 34, 90, 44);
  g.fillStyle(COLORS.leaf, 1);
  g.fillEllipse(40, 30, 70, 32);
  save('bush', 90, 56);

  // A cottage, and a house with an upstairs.
  g.fillStyle(COLORS.wall, 1);
  g.fillRect(24, 74, 152, 96);
  outline(3);
  g.strokeRect(24, 74, 152, 96);
  g.fillStyle(COLORS.roof, 1);
  g.fillTriangle(10, 78, 100, 12, 190, 78);
  g.strokeTriangle(10, 78, 100, 12, 190, 78);
  drawWindows(g, [
    [42, 98],
    [130, 98],
  ]);
  g.fillStyle(COLORS.trunk, 1);
  g.fillRect(88, 122, 26, 48);
  save('house0', 200, 170);
  g.fillStyle(COLORS.wallAlt, 1);
  g.fillRect(34, 36, 132, 134);
  outline(3);
  g.strokeRect(34, 36, 132, 134);
  g.fillStyle(COLORS.roofAlt, 1);
  g.fillRect(26, 24, 148, 16);
  g.strokeRect(26, 24, 148, 16);
  drawWindows(g, [
    [50, 56],
    [120, 56],
    [50, 108],
  ]);
  g.fillStyle(COLORS.roofAlt, 1);
  g.fillRect(118, 118, 30, 52);
  save('house1', 200, 170);

  // Road signs: a speed limit (the number is a text on top), and warning triangles.
  g.fillStyle(0xffffff, 1);
  g.fillCircle(36, 36, 32);
  g.lineStyle(9, COLORS.red, 1);
  g.strokeCircle(36, 36, 27);
  outline(3);
  g.strokeCircle(36, 36, 33);
  save('limit', 72, 72);
  for (const kind of ['bump', 'up', 'down'] as const) {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(40, 6, 76, 68, 4, 68);
    g.lineStyle(8, COLORS.red, 1);
    g.strokeTriangle(40, 12, 70, 64, 10, 64);
    outline(3);
    g.strokeTriangle(40, 3, 79, 70, 1, 70);
    g.fillStyle(COLORS.outline, 1);
    if (kind === 'bump') {
      g.fillRect(24, 52, 32, 4);
      g.fillEllipse(40, 52, 18, 14);
    } else if (kind === 'up') {
      g.fillTriangle(24, 56, 56, 56, 56, 36);
    } else {
      g.fillTriangle(24, 56, 56, 56, 24, 36);
    }
    save(`warn-${kind}`, 80, 74);
  }

  // Traffic light housing (the lamps are drawn on top) and the chequered finish flag.
  g.fillStyle(COLORS.box, 1);
  g.fillRoundedRect(2, 2, 40, 104, 10);
  outline(3);
  g.strokeRoundedRect(2, 2, 40, 104, 10);
  save('lightBox', 44, 108);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      g.fillStyle((row + col) % 2 ? COLORS.outline : 0xffffff, 1);
      g.fillRect(2 + col * 14, 2 + row * 14, 14, 14);
    }
  }
  outline(3);
  g.strokeRect(2, 2, 84, 56);
  save('flag', 88, 60);

  // Rev counter needle and gear knob.
  g.fillStyle(COLORS.hot, 1);
  g.fillTriangle(0, 6, 112, 3, 112, 9);
  g.fillTriangle(0, 6, 0, 2, 112, 3);
  g.fillTriangle(0, 6, 0, 10, 112, 9);
  save('needle', 114, 12);
  g.fillStyle(COLORS.outline, 0.3);
  g.fillCircle(34, 38, 28);
  g.fillStyle(COLORS.knob, 1);
  g.fillCircle(32, 32, 28);
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(24, 22, 9);
  outline(4);
  g.strokeCircle(32, 32, 28);
  save('knob', 68, 70);

  g.destroy();
}

/**
 * A strip of rolling hills that tiles horizontally: each wave fits a whole number of times.
 * Waves are [amplitude, times across, phase].
 */
function drawHills(
  g: Phaser.GameObjects.Graphics,
  key: string,
  color: number,
  base: number,
  waves: [number, number, number][],
) {
  const width = 1280;
  const height = 420;
  // The bottom rows stay empty: a tile sprite's top edge picks up its bottom row.
  const points = [new Phaser.Math.Vector2(0, height - 3)];
  for (let x = 0; x <= width; x += 8) {
    let y = base;
    for (const [amplitude, times, phase] of waves) {
      y += amplitude * Math.sin((x / width) * Math.PI * 2 * times + phase);
    }
    points.push(new Phaser.Math.Vector2(x, y));
  }
  points.push(new Phaser.Math.Vector2(width, height - 3));
  g.fillStyle(color, 1);
  g.fillPoints(points, true);
  g.generateTexture(key, width, height);
  g.clear();
}

function drawWindows(g: Phaser.GameObjects.Graphics, windows: [number, number][]) {
  for (const [x, y] of windows) {
    g.fillStyle(COLORS.window, 1);
    g.fillRect(x, y, 30, 28);
    g.lineStyle(3, COLORS.outline, 1);
    g.strokeRect(x, y, 30, 28);
    g.lineBetween(x + 15, y, x + 15, y + 28);
  }
}
