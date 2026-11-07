import { describe, expect, it } from 'vitest';
import { Bot, CARELESS, stayInGear } from './drivers';
import { ROUNDS } from './rounds';
import { simulate } from './run';

describe.each(ROUNDS.map((round) => [round.n, round] as const))('round %i', (_n, round) => {
  it('the bot finishes in time', () => {
    expect(simulate(round, new Bot()).outcome).toBe('finished');
  });

  it('a careless driver finishes in time', () => {
    expect(simulate(round, new Bot(CARELESS)).outcome).toBe('finished');
  });

  // The first two rounds only teach changing up, so there only the slow gears must fail.
  const gears = round.n <= 2 ? [1, 2] : [1, 2, 3, 4, 5];
  it.each(gears)('staying in gear %i does not finish', (gear) => {
    expect(simulate(round, stayInGear(gear)).outcome).not.toBe('finished');
  });
});
