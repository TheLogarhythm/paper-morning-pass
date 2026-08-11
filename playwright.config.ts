import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4321/paper-morning-pass',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    env: {
      ASTRO_DEV_BACKGROUND: '0',
    },
    url: 'http://127.0.0.1:4321/paper-morning-pass',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-ipad-pro-11', use: { ...devices['iPad Pro 11'] } },
  ],
});
