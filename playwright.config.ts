import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @auth-learning/web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
