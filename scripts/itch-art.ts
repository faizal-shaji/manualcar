/**
 * Renders the images for the itch.io page into itch/: the cover (cover.html, at twice itch's
 * 630 x 500) and five screenshots at the game's own size. Needs the dev server (npm run dev).
 *
 * Usage: npm run itch-art
 */
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import '../src/snapshot';

const BASE_URL = 'http://127.0.0.1:5200/';
const OUT_DIR = path.resolve(import.meta.dirname, '..', 'itch');
const PROGRESS = { round: 9, won: false };

fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });

async function shoot(name: string, page: Page) {
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  await page.close();
}

/** Opens the game with a few rounds unlocked, as a returning player would have. */
async function openGame(query: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((progress) => {
    localStorage.setItem('manualcar.progress.v1', JSON.stringify(progress));
  }, PROGRESS);
  await page.goto(BASE_URL + query);
  await page.waitForSelector('canvas');
  return page;
}

const LONG = { timeout: 60_000 };

const cover = await browser.newPage({ viewport: { width: 1260, height: 1000 } });
await cover.goto(`${BASE_URL}cover.html`);
await cover.waitForFunction(() => window.__coverReady);
await shoot('cover.png', cover);

const menu = await openGame('');
await menu.waitForTimeout(2500);
await shoot('screenshot-1-menu.png', menu);

// Round 12's 12% climb runs from x 8200 to 12200.
const mountain = await openGame('?bot&speed=3&round=12');
await mountain.waitForFunction(() => window.__manualcar!.x > 9300, null, LONG);
await shoot('screenshot-2-mountain.png', mountain);

const redLight = await openGame('?bot&speed=2&round=9');
await redLight.waitForFunction(
  () => {
    const s = window.__manualcar!;
    return s.lights[0] === 'red' && s.v === 0 && s.x > 1800;
  },
  null,
  LONG,
);
await redLight.waitForTimeout(150);
await shoot('screenshot-3-red-light.png', redLight);

// Up to 4th, then the steep hill stalls it.
const stalled = await openGame('?play&speed=2&round=5');
await stalled.waitForFunction(() => window.__manualcar!.phase === 'driving');
for (let gear = 0; gear < 4;) {
  const s = await stalled.evaluate(() => window.__manualcar!);
  gear = s.gear;
  if (gear < 4 && (gear === 0 || s.rpm > 5400)) await stalled.keyboard.press('ArrowUp');
  await stalled.waitForTimeout(40);
}
await stalled.waitForFunction(() => window.__manualcar!.engine === 'stalled', null, LONG);
await stalled.waitForTimeout(200);
await shoot('screenshot-4-stalled.png', stalled);

// Round 8's mud runs from x 4800 to 9600.
const mud = await openGame('?bot&speed=3&round=8');
await mud.waitForFunction(() => window.__manualcar!.x > 6000, null, LONG);
await shoot('screenshot-5-mud.png', mud);

await browser.close();
console.log(`Saved to ${OUT_DIR}`);
