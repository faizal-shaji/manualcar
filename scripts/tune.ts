/**
 * Prints how each round plays for a few drivers: the bot, a careless driver, and drivers who
 * change up to one gear and then stay in it. Times are measured without a time limit; the
 * suggested limit leaves some room over the bot and the careless driver.
 *
 * Usage: npm run tune
 */
import { Bot, CARELESS, stayInGear } from '../src/sim/drivers';
import { ROUNDS, type Round } from '../src/sim/rounds';
import { simulate, type Driver } from '../src/sim/run';

const untimed = (round: Round): Round => ({ ...round, timeLimit: 600 });

function describe(round: Round, driver: Driver) {
  const { outcome, time } = simulate(untimed(round), driver);
  const late = outcome === 'finished' && time > round.timeLimit;
  const label = late ? 'late' : outcome === 'finished' ? 'ok' : outcome;
  return { text: `${label} ${time.toFixed(1)}`.padEnd(13), time, outcome, late };
}

let problems = 0;
for (const round of ROUNDS) {
  const expert = describe(round, new Bot());
  const careless = describe(round, new Bot(CARELESS));
  const slack = round.n <= 2 ? 1.25 : 1.12;
  const suggested = Math.ceil(Math.max(expert.time * slack, careless.time * 1.05));
  const stuck = [1, 2, 3, 4, 5].map((gear) => describe(round, stayInGear(gear)));
  const stuckFinishing = stuck.filter((s) => s.outcome === 'finished' && !s.late).length;
  if (
    expert.outcome !== 'finished' ||
    expert.late ||
    careless.outcome !== 'finished' ||
    careless.late
  ) {
    problems++;
  }
  console.log(
    `${String(round.n).padStart(2)} ${round.title.padEnd(14)} limit ${String(round.timeLimit).padStart(3)}` +
      ` (suggest ${String(suggested).padStart(3)})  bot ${expert.text} careless ${careless.text}` +
      ` stuck ${stuck.map((s) => s.text).join(' ')}` +
      (stuckFinishing ? `  <- ${stuckFinishing} stuck driver(s) finish` : ''),
  );
}
console.log(problems ? `\n${problems} round(s) the bot or careless driver can't finish` : '');
