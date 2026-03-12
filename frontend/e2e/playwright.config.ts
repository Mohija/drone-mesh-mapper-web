import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3020',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup project: logs in and saves storage state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Main tests: run after setup, use saved auth state
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: 'cd ../../backend && ./venv/bin/python3 app.py',
    port: 3020,
    timeout: 15000,
    reuseExistingServer: true,
  },
});
