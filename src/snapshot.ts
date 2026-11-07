import type { EngineState } from './sim/car';
import type { LightState } from './sim/road';
import type { Outcome } from './sim/run';

export type Phase = 'ready' | 'driving' | 'finished' | 'failed';

/** The game's state, published as `window.__manualcar` for the end-to-end tests. */
export interface GameSnapshot {
  phase: Phase;
  outcome: Outcome | null;
  round: number;
  tries: number;
  gear: number;
  rpm: number;
  kmh: number;
  x: number;
  v: number;
  heat: number;
  engine: EngineState;
  elapsed: number;
  timeLimit: number;
  lights: LightState[];
  refusedShifts: number;
  unlockedRound: number;
  completedAll: boolean;
}

declare global {
  interface Window {
    __manualcar?: GameSnapshot;
    /** Set by the itch.io cover page (cover.html) once it's drawn. */
    __coverReady?: boolean;
  }
}
