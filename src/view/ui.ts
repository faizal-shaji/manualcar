import Phaser from 'phaser';
import { COLORS, FONT, TEXT } from './theme';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

export function textStyle(
  size: number,
  color: string = TEXT.ink,
  extra: TextStyle = {},
): TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, ...extra };
}

/** Bold text with a thick dark outline, readable over the sky. */
export function outlinedText(size: number, color: string = TEXT.white): TextStyle {
  return textStyle(size, color, { stroke: TEXT.ink, strokeThickness: Math.round(size / 7) });
}

/** A rounded panel with a thick outline and a drop shadow, centred on (x, y). */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number,
  radius = 26,
) {
  const left = x - width / 2;
  const top = y - height / 2;
  g.fillStyle(COLORS.outline, 0.25);
  g.fillRoundedRect(left + 4, top + 8, width, height, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(left, top, width, height, radius);
  g.lineStyle(5, COLORS.outline, 1);
  g.strokeRoundedRect(left, top, width, height, radius);
}

/** Fixes an object to the screen, so it doesn't scroll with the camera. */
export function pinToScreen<T extends Phaser.GameObjects.GameObject>(object: T, depth: number): T {
  (object as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
  (object as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
  return object;
}

interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  primary?: boolean;
}

/** A button that squashes while it's pressed. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  { width = 300, height = 96, fontSize = 44, primary = false }: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const fill = primary ? COLORS.buttonPrimary : COLORS.button;
  drawPanel(g, 0, 0, width, height, fill, Math.min(height / 2, 34));
  const style = primary ? outlinedText(fontSize) : textStyle(fontSize);
  const text = scene.add.text(0, 0, label, style).setOrigin(0.5);
  const container = scene.add.container(x, y, [g, text]).setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on('pointerdown', () => container.setScale(0.93));
  container.on('pointerout', () => container.setScale(1));
  container.on('pointerup', () => {
    container.setScale(1);
    onClick();
  });
  return container;
}
