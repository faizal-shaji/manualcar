import Phaser from 'phaser';
import { createTextures } from '../view/textures';

/**
 * Creates the textures, then opens the menu. On the dev server, ?play or ?bot opens a round
 * straight away.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    createTextures(this);
    const params = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    this.scene.start(params.has('play') || params.has('bot') ? 'game' : 'menu');
  }
}
