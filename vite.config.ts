import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build runs from any folder (itch.io serves it from a subpath).
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  server: { host: '127.0.0.1', port: 5200 },
  preview: { host: '127.0.0.1', port: 5201 },
  test: { include: ['src/**/*.test.ts'] },
});
