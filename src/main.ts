import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { COLORS, HEIGHT, WIDTH } from './view/theme';
import { waitForFont } from './view/fonts';

await waitForFont();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.sky,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WIDTH,
    height: HEIGHT,
  },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, GameScene],
});
