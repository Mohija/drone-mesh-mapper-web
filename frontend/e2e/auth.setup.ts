import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="login-username"]', 'admin');
  await page.fill('[data-testid="login-password"]', 'admin');
  await page.click('[data-testid="login-submit"]');

  // Wait for redirect to map page
  // Wait until we're no longer on the login page
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

  // Wait for initial API call to confirm auth works
  await page.waitForResponse(
    resp => resp.url().includes('/api/drones') && resp.status() === 200,
    { timeout: 10000 }
  );

  // Save storage state (includes localStorage with tokens)
  await page.context().storageState({ path: AUTH_FILE });
});
