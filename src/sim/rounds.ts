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
  /** Traffic lights: [x, seconds red once the car is waiting]. */
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
    segments: [[7600, 0]],
    limits: [[0, 80]],
  },
  {
    title: 'Open road',
    hint: 'Keep the needle out of the red: change up before it gets there',
    timeLimit: 30,
    segments: [[15600, 0]],
    limits: [[0, 120]],
  },
  {
    title: 'A hill',
    hint: 'Uphill: ▼ change down before the engine labours',
    timeLimit: 39,
    segments: [
      [5200, 0],
      [5200, 8],
      [7200, 0],
    ],
    limits: [[0, 120]],
  },
  {
    title: 'Up and over',
    hint: 'Downhill: change up again, or the engine over-revs',
    timeLimit: 40,
    segments: [
      [4800, 0],
      [4800, 8],
      [4000, -6],
      [6400, 0],
    ],
    limits: [[0, 120]],
  },
  {
    title: 'Steep',
    hint: 'Steep: drop straight to 2nd (press 2)',
    timeLimit: 37,
    segments: [
      [3200, 0],
      [3600, 12],
      [1600, 0],
      [2800, -4],
      [4400, 0],
    ],
    limits: [[0, 100]],
  },
  {
    title: 'Bumps',
    hint: 'The car won’t slow down for a bump: ▼ change down to 2nd, or it flips',
    timeLimit: 24,
    segments: [[9600, 0]],
    limits: [[0, 80]],
    bumps: [2200, 4400, 6600],
  },
  {
    title: 'Red light',
    hint: 'Waiting at a red light? Into 1st before it turns green',
    timeLimit: 34,
    segments: [[9200, 0]],
    limits: [[0, 50]],
    lights: [[4000, 2.5]],
  },
  {
    title: 'Mud',
    hint: 'Mud holds the car back like a hill',
    timeLimit: 37,
    segments: [[16800, 0]],
    limits: [[0, 120]],
    mud: [[4800, 9600]],
  },
  {
    title: 'Town',
    timeLimit: 54,
    segments: [[11600, 0]],
    limits: [
      [0, 50],
      [3600, 30],
      [7200, 50],
    ],
    bumps: [4600, 6000],
    lights: [
      [2400, 2],
      [9200, 2],
    ],
  },
  {
    title: 'Hill start',
    hint: 'On a hill too: into 1st before the light turns green',
    timeLimit: 40,
    segments: [
      [2400, 0],
      [5200, 8],
      [3200, 0],
    ],
    limits: [[0, 50]],
    lights: [[4800, 2.5]],
  },
  {
    title: 'Rolling hills',
    timeLimit: 65,
    segments: [
      [2000, 0],
      [4800, 7],
      [2800, -8],
      [5200, 8],
      [2800, -8],
      [4800, 7],
      [2000, -3],
      [3600, 0],
    ],
    limits: [[0, 100]],
  },
  {
    title: 'Mountain road',
    timeLimit: 63,
    segments: [
      [1800, 0],
      [4400, 8],
      [2000, -8],
      [4000, 12],
      [2800, -9],
      [3200, 7],
      [2400, 0],
    ],
    limits: [[0, 60]],
  },
  {
    title: 'Rush hour',
    timeLimit: 64,
    segments: [[16400, 0]],
    limits: [[0, 60]],
    lights: [
      [2200, 1.5],
      [5400, 2],
      [8800, 1.5],
      [12400, 2],
    ],
    bumps: [3800, 7000, 10600, 14200],
  },
  {
    title: 'Everything',
    timeLimit: 67,
    segments: [
      [2400, 0],
      [3200, 7],
      [2000, 0],
      [2800, -7],
      [2800, 0],
      [3600, 12],
      [2400, 0],
      [2800, 0],
    ],
    limits: [
      [0, 100],
      [10400, 50],
      [13400, 100],
    ],
    bumps: [6600],
    lights: [[12600, 2]],
    mud: [[17400, 19000]],
  },
  {
    title: 'The long road',
    timeLimit: 99,
    segments: [
      [2800, 0],
      [5200, 0],
      [3200, 5],
      [3200, -5],
      [4800, 0],
      [3600, 12],
      [2800, -8],
      [2400, 0],
      [3600, 7],
      [2400, -4],
      [3200, 0],
    ],
    limits: [
      [0, 100],
      [17200, 50],
      [22400, 60],
      [30000, 100],
    ],
    bumps: [18600, 32800],
    lights: [[20400, 2]],
    mud: [[27200, 28800]],
  },
];

export const ROUNDS: Round[] = DEFINITIONS.map((round, i) => ({ n: i + 1, ...round }));
export const LAST_ROUND = ROUNDS.length;
