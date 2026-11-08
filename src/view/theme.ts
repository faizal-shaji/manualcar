/** The game's logical size (landscape). Phaser scales it to fit the window. */
export const WIDTH = 1280;
export const HEIGHT = 720;

export const COLORS = {
  sky: 0x8fd3f4,
  skyLow: 0xdff3fb,
  cloud: 0xffffff,
  hillFar: 0xb4e0a6,
  hillMid: 0x8acb7b,
  grass: 0x6dbb5c,
  earth: 0xb98252,
  earthDark: 0x9a6a3e,
  asphalt: 0x4b4b55,
  line: 0xf4f1e6,
  car: 0xff5a4f,
  carDark: 0xd63f37,
  glass: 0xbfe8f7,
  tyre: 0x2a2320,
  hub: 0xcfd5da,
  headlight: 0xffe58a,
  taillight: 0xff3b3b,
  mud: 0x6e4a2c,
  mudLight: 0x8f6339,
  bump: 0xffd23f,
  pole: 0x8a8f96,
  red: 0xff4f4f,
  amber: 0xffb02e,
  green: 0x52d96b,
  lampOff: 0x3b3b44,
  box: 0x2f3035,
  dial: 0x2f2a27,
  low: 0xffa53f,
  ok: 0x7cc96a,
  hot: 0xff4f4f,
  gate: 0x1d1917,
  knob: 0xe9ecef,
  trunk: 0x8a5a33,
  leaf: 0x58b04f,
  leafDark: 0x3f8f3c,
  wall: 0xfff1d6,
  wallAlt: 0xffd9b8,
  roof: 0xe0604a,
  roofAlt: 0x5f7fd6,
  window: 0x7fc8ea,
  outline: 0x2a2320,
  card: 0xfffdf7,
  button: 0xffd23f,
  buttonPrimary: 0xff6b4a,
} as const;

/** Text colours, as CSS strings. */
export const TEXT = {
  ink: '#2a2320',
  white: '#ffffff',
  coral: '#ff6b4a',
  cream: '#fff4c2',
  low: '#ffa53f',
  hot: '#ff6a5a',
  dim: '#c9beb5',
} as const;

export const FONT = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
