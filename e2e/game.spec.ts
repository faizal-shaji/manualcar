import { expect, test, type Page } from '@playwright/test';
import { START_X } from '../src/sim/road';
import { ROUNDS } from '../src/sim/rounds';
import type { GameSnapshot } from '../src/snapshot';

// URL flags: ?play skips the menu, ?round=N picks the round, ?bot lets the bot drive and
// ?speed=N runs the game N times faster.

async function open(page: Page, query: string) {
  await page.goto(query);
  await page.waitForFunction(() => window.__manualcar);
}

async function snapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => window.__manualcar!);
}

/** The state after the game has drawn another frame (it publishes its state once a frame). */
async function nextSnapshot(page: Page): Promise<GameSnapshot> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return snapshot(page);
}

/** Changes up near the red until the car is in a gear. */
async function driveUpTo(page: Page, gear: number) {
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        if (s.gear < gear && (s.gear === 0 || s.rpm > 5400)) await page.keyboard.press('ArrowUp');
        return s.gear;
      },
      { intervals: [40], timeout: 30_000 },
    )
    .toBe(gear);
}

test.describe('the bot finishes every round', () => {
  for (const round of ROUNDS) {
    test(`round ${round.n}: ${round.title}`, async ({ page }) => {
      await open(page, `?bot&speed=6&round=${round.n}`);
      await page.waitForFunction(
        (n) => {
          const s = window.__manualcar!;
          return s.phase === 'finished' || s.phase === 'failed' || s.round > n;
        },
        round.n,
        { timeout: 60_000 },
      );
      const s = await snapshot(page);
      expect(s.phase === 'failed' ? s.outcome : 'finished').toBe('finished');
      expect(s.tries).toBe(0);
    });
  }
});

test('left in neutral, the clock runs out', async ({ page }) => {
  await open(page, '?play&speed=8&round=1');
  await page.waitForFunction(() => window.__manualcar!.phase === 'failed');
  const s = await snapshot(page);
  expect(s.outcome).toBe('late');
  expect(s.x).toBe(START_X);
});

test('staying in 1st is too slow, without blowing the engine', async ({ page }) => {
  await open(page, '?play&speed=4&round=2');
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__manualcar!.phase === 'failed', null, {
    timeout: 30_000,
  });
  const s = await snapshot(page);
  expect(s.outcome).toBe('late');
  expect(s.engine).toBe('running');
});

test('pulling away in 3rd stalls and ends the round', async ({ page }) => {
  await open(page, '?play&round=1');
  await page.keyboard.press('3');
  await page.waitForFunction(() => window.__manualcar!.phase === 'failed');
  const s = await snapshot(page);
  expect(s.outcome).toBe('stalled');
  expect(s.x).toBeLessThan(START_X + 15);
});

test('pulling away in 1st works', async ({ page }) => {
  await open(page, '?play&round=1');
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__manualcar!.x > 260);
  const s = await snapshot(page);
  expect(s.phase).toBe('driving');
  expect(s.engine).toBe('running');
});

test('tapping the gear stick changes gear', async ({ page }) => {
  await open(page, '?play&round=2');
  // The page shows the game at 0.75 scale. 3rd is at the top middle of the H, neutral in the middle.
  await page.mouse.click(1130 * 0.75, (590 - 64) * 0.75);
  const third = (await nextSnapshot(page)).gear;
  await page.mouse.click(1130 * 0.75, 590 * 0.75);
  expect([third, (await nextSnapshot(page)).gear]).toEqual([3, 0]);
});

test('the keys change gear', async ({ page }) => {
  await open(page, '?play&round=2');
  const steps: [string, number][] = [
    ['ArrowUp', 1],
    ['ArrowUp', 2],
    ['Shift', 3],
    ['w', 4],
    ['ArrowDown', 3],
    ['s', 2],
    ['5', 5],
    ['n', 0],
    ['1', 1],
  ];
  // Quickly, before the car sets off in the wrong gear.
  const gears: number[] = [];
  for (const [key] of steps) {
    await page.keyboard.press(key);
    gears.push((await nextSnapshot(page)).gear);
  }
  expect(gears).toEqual(steps.map(([, gear]) => gear));
});

test('a gear far too low for the speed is refused', async ({ page }) => {
  await open(page, '?play&round=2');
  await driveUpTo(page, 4);
  await page.waitForFunction(() => window.__manualcar!.kmh >= 75);
  await page.keyboard.press('1');
  const s = await nextSnapshot(page);
  expect(s.gear).toBe(4);
  expect(s.refusedShifts).toBe(1);
});

test.describe('the steep hill in round 5', () => {
  test('stalls the car in 4th', async ({ page }) => {
    await open(page, '?play&speed=2&round=5');
    await driveUpTo(page, 4);
    await page.waitForFunction(() => window.__manualcar!.phase === 'failed', null, {
      timeout: 30_000,
    });
    expect((await snapshot(page)).outcome).toBe('stalled');
  });

  test('is climbed in 2nd', async ({ page }) => {
    await open(page, '?play&speed=2&round=5');
    await driveUpTo(page, 4);
    await page.waitForFunction(() => {
      const s = window.__manualcar!;
      return s.x > 1800 && s.rpm < 2600;
    });
    await page.keyboard.press('2');
    await page.waitForFunction(() => {
      const s = window.__manualcar!;
      return s.x > 3500 || s.phase === 'failed';
    });
    expect((await snapshot(page)).phase).toBe('driving');
  });
});

test.describe('the red light in round 7', () => {
  async function stopAtTheLight(page: Page) {
    await open(page, '?play&speed=2&round=7');
    await driveUpTo(page, 3);
    await page.waitForFunction(() => {
      const s = window.__manualcar!;
      return s.lights[0] === 'red' && s.v === 0 && s.x > 1800;
    });
  }

  test('stalls the car on green when it waits in 3rd', async ({ page }) => {
    await stopAtTheLight(page);
    expect((await snapshot(page)).gear).toBe(3);
    await page.waitForFunction(() => window.__manualcar!.phase === 'failed');
    expect((await snapshot(page)).outcome).toBe('stalled');
  });

  test('lets the car pull away on green in 1st', async ({ page }) => {
    await stopAtTheLight(page);
    await page.keyboard.press('1');
    await page.waitForFunction(() => window.__manualcar!.x > 2100);
    expect((await snapshot(page)).phase).toBe('driving');
  });
});

test('finishing a round unlocks the next, and the menu carries on from it', async ({ page }) => {
  await open(page, '?bot&speed=6&round=2');
  await page.waitForFunction(() => window.__manualcar!.round === 3, null, { timeout: 30_000 });
  expect((await snapshot(page)).unlockedRound).toBe(3);
  await page.goto('/');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__manualcar?.round);
  expect((await snapshot(page)).round).toBe(3);
});
