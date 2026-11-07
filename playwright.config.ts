import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:5200/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // The game runs in real time, so one browser at a time keeps the timing steady.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: url,
    viewport: { width: 960, height: 540 },
    // The installed Microsoft Edge by default. With PW_CHANNEL=chromium, Playwright's own
    // Chromium (after `npx playwright install chromium`).
    channel: process.env.PW_CHANNEL ?? 'msedge',
  },
  webServer: {
    command: 'npm run dev',
    url,
    reuseExistingServer: true,
  },
});
