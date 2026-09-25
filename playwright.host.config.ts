import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/host',
  timeout: 60000,
  use: {
    baseURL: process.env.GEOTRUST_HOST_URL ?? 'http://127.0.0.1:4182',
    launchOptions: {
      ...(existsSync(chrome) ? { executablePath: chrome } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
});
