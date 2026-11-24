import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for critical user journeys.
 *
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e                 # local stack (start-dev.sh)
 *   E2E_BASE_URL=https://<cloudfront-domain> npm run e2e           # deployed stack
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
