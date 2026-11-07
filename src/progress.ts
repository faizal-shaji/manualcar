import { LAST_ROUND } from './sim/rounds';

/** The player's progress, kept in this browser. */
const STORAGE_KEY = 'manualcar.progress.v1';

interface SavedProgress {
  /** The furthest round the player can choose. */
  round: number;
  /** Every round has been finished. */
  won: boolean;
}

function load(): SavedProgress {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<SavedProgress> | null;
    const round = Math.min(LAST_ROUND, Math.max(1, Math.floor(Number(saved?.round) || 1)));
    return { round, won: saved?.won === true };
  } catch {
    return { round: 1, won: false };
  }
}

let saved = load();

export const progress = {
  get unlockedRound() {
    return saved.round;
  },

  get completedAll() {
    return saved.won;
  },

  /** Records a finished round, which unlocks the next one. */
  markFinished(round: number) {
    saved = {
      round: Math.min(LAST_ROUND, Math.max(saved.round, round + 1)),
      won: saved.won || round >= LAST_ROUND,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage is unavailable: progress lasts until the page closes.
    }
  },
};
