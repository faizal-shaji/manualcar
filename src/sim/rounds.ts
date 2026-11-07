export interface Round {
  /** 1-based. */
  n: number;
  title: string;
  /** One line of advice, shown during the first tries. */
  hint?: string;
  /** Seconds to reach the finish line. */
  timeLimit: number;
  /** The road as consecutive stretches: [length px, grade %], positive is uphill. */
  segments: [number, number][];
  /** Speed limits: [from x, km/h]. The first one starts at 0. */
  limits: [number, number][];
  /** Speed bump positions. */
  bumps?: number[];
  /** Traffic lights: [stop line x, seconds red once the car is waiting]. */
  lights?: [number, number][];
  /** Muddy stretches: [from x, to x]. */
  mud?: [number, number][];
}

// Time limits are checked by src/sim/rounds.test.ts: the bot and a careless driver get there in
// time, and a driver who stays in one gear doesn't. `npm run tune` prints the margins.
const DEFINITIONS: Omit<Round, 'n'>[] = [
  {
    title: 'Pull away',
    hint: '1 or ▲: first gear · ▲ or Shift: change up as the needle climbs',
    timeLimit: 19,
    segments: [[3800, 0]],
    limits: [[0, 80]],
  },
  {
    title: 'Open road',
    hint: 'Keep the needle out of the red: change up before it gets there',
    timeLimit: 30,
    segments: [[7800, 0]],
    limits: [[0, 120]],
  },
  {
    title: 'A hill',
    hint: 'Uphill: ▼ change down before the engine labours',
    timeLimit: 39,
    segments: [
      [2600, 0],
      [2600, 8],
      [3600, 0],
    ],
    limits: [[0, 120]],
  },
  {
    title: 'Up and over',
    hint: 'Downhill: change up again, or the engine over-revs',
    timeLimit: 40,
    segments: [
      [2400, 0],
      [2400, 8],
      [2000, -6],
      [3200, 0],
    ],
    limits: [[0, 120]],
  },
  {
    title: 'Steep',
    hint: 'Steep: drop straight to 2nd (press 2)',
    timeLimit: 37,
    segments: [
      [1600, 0],
      [1800, 12],
      [800, 0],
      [1400, -4],
      [2200, 0],
    ],
    limits: [[0, 100]],
  },
  {
    title: 'Bumps',
    hint: 'The car slows right down for a bump: change down to 1st with it',
    timeLimit: 46,
    segments: [[4800, 0]],
    limits: [[0, 60]],
    bumps: [1100, 2200, 3300],
  },
  {
    title: 'Red light',
    hint: 'Waiting at a red light? Into 1st before it turns green',
    timeLimit: 34,
    segments: [[4600, 0]],
    limits: [[0, 50]],
    lights: [[2000, 2.5]],
  },
  {
    title: 'Mud',
    hint: 'Mud holds the car back like a hill',
    timeLimit: 37,
    segments: [[8400, 0]],
    limits: [[0, 120]],
    mud: [[2400, 4800]],
  },
  {
    title: 'Town',
    timeLimit: 64,
    segments: [[5800, 0]],
    limits: [
      [0, 50],
      [1800, 30],
      [3600, 50],
    ],
    bumps: [2300, 3000],
    lights: [
      [1200, 2],
      [4600, 2],
    ],
  },
  {
    title: 'Hill start',
    hint: 'On a hill too: into 1st before the light turns green',
    timeLimit: 40,
    segments: [
      [1200, 0],
      [2600, 8],
      [1600, 0],
    ],
    limits: [[0, 50]],
    lights: [[2400, 2.5]],
  },
  {
    title: 'Rolling hills',
    timeLimit: 65,
    segments: [
      [1000, 0],
      [2400, 7],
      [1400, -8],
      [2600, 8],
      [1400, -8],
      [2400, 7],
      [1000, -3],
      [1800, 0],
    ],
    limits: [[0, 100]],
  },
  {
    title: 'Mountain road',
    timeLimit: 63,
    segments: [
      [900, 0],
      [2200, 8],
      [1000, -8],
      [2000, 12],
      [1400, -9],
      [1600, 7],
      [1200, 0],
    ],
    limits: [[0, 60]],
  },
  {
    title: 'Rush hour',
    timeLimit: 89,
    segments: [[8200, 0]],
    limits: [[0, 60]],
    lights: [
      [1100, 1.5],
      [2700, 2],
      [4400, 1.5],
      [6200, 2],
    ],
    bumps: [1900, 3500, 5300, 7100],
  },
  {
    title: 'Everything',
    timeLimit: 72,
    segments: [
      [1200, 0],
      [1600, 7],
      [1000, 0],
      [1400, -7],
      [1400, 0],
      [1800, 12],
      [1200, 0],
      [1400, 0],
    ],
    limits: [
      [0, 100],
      [5200, 50],
      [6700, 100],
    ],
    bumps: [5600],
    lights: [[6300, 2]],
    mud: [[8700, 9500]],
  },
  {
    title: 'The long road',
    timeLimit: 112,
    segments: [
      [1400, 0],
      [2600, 0],
      [1600, 5],
      [1600, -5],
      [2400, 0],
      [1800, 12],
      [1400, -8],
      [1200, 0],
      [1800, 7],
      [1200, -4],
      [1600, 0],
    ],
    limits: [
      [0, 100],
      [8600, 50],
      [11200, 60],
      [15000, 100],
    ],
    bumps: [9300, 16400],
    lights: [[10200, 2]],
    mud: [[13600, 14400]],
  },
];

export const ROUNDS: Round[] = DEFINITIONS.map((round, i) => ({ n: i + 1, ...round }));
export const LAST_ROUND = ROUNDS.length;
