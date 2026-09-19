import { defineConfig } from '@playwright/test';

// Optional executable path allows testing in environments with a preinstalled Chromium.
const executablePath = process.env.PW_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: executablePath
      ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
      : {},
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
