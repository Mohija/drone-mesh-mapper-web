import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Log in via the UI login page.
 * After login, waits for redirect to "/" and first /api/drones response.
 */
export async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.fill('[data-testid="login-username"]', username);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
}

/**
 * Log in via API and return auth headers for request-based tests.
 */
export async function apiLogin(request: APIRequestContext, username = 'admin', password = 'admin'): Promise<Record<string, string>> {
  const res = await request.post('/api/auth/login', {
    data: { username, password },
  });
  const data = await res.json();
  return { Authorization: `Bearer ${data.access_token}` };
}

/**
 * Log in via the UI and wait for drones API (common pattern for map page tests).
 */
export async function loginAndWaitForMap(page: Page, username = 'admin', password = 'admin') {
  await loginAs(page, username, password);
  await page.waitForResponse(
    resp => resp.url().includes('/api/drones') && resp.status() === 200,
    { timeout: 10000 }
  );
}
