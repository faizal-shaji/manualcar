import Phaser from 'phaser';
import { createTextures } from '../view/textures';

/** Creates the textures, then opens the menu, or a round straight away with ?play or ?bot. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    createTextures(this);
    const params = new URLSearchParams(location.search);
    this.scene.start(params.has('play') || params.has('bot') ? 'game' : 'menu');
  }
}
