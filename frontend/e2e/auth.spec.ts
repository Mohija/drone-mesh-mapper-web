import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

const BASE = 'http://localhost:3020';
const EMPTY_STORAGE = { cookies: [], origins: [] };

test.describe('Authentication Flow', () => {
  test('unauthenticated access redirects to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(BASE);

    // ProtectedRoute should redirect to /login
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
    await context.close();
  });

  test('login page renders correctly', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);

    await expect(page.locator('[data-testid="login-username"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
    await expect(page.locator('text=Anmelden')).toBeVisible();
    await context.close();
  });

  test('login with valid credentials redirects to map', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);
    await expect(page.locator('[data-testid="login-username"]')).toBeVisible({ timeout: 10000 });

    await page.fill('[data-testid="login-username"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    await page.click('[data-testid="login-submit"]');

    // Should redirect to map page — wait for map-specific element
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible({ timeout: 10000 });
    await context.close();
  });

  test('login with invalid credentials shows error', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);
    await expect(page.locator('[data-testid="login-username"]')).toBeVisible({ timeout: 10000 });

    await page.fill('[data-testid="login-username"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'wrongpassword');
    await page.click('[data-testid="login-submit"]');

    // Error message should appear
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 5000 });
    // Should stay on login page
    expect(page.url()).toContain('/login');
    await context.close();
  });

  test('login stores tokens in localStorage', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);
    await expect(page.locator('[data-testid="login-username"]')).toBeVisible({ timeout: 10000 });

    await page.fill('[data-testid="login-username"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    await page.click('[data-testid="login-submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible({ timeout: 10000 });

    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token'));
    const userId = await page.evaluate(() => localStorage.getItem('current_user_id'));

    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(userId).toBeTruthy();
    await context.close();
  });

  test('logout clears tokens and redirects to login', async ({ page }) => {
    // page has storageState from setup (already authenticated)
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Click logout button
    await page.locator('[data-testid="logout-button"]').click();

    // Should show login page
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });

    // Tokens should be cleared
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(accessToken).toBeNull();
  });

  test('protected route /settings redirects when unauthenticated', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/settings`);

    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
    await context.close();
  });

  test('protected route /admin redirects when unauthenticated', async ({ browser }) => {
    const context = await browser.newContext({ storageState: EMPTY_STORAGE });
    const page = await context.newPage();
    await page.goto(`${BASE}/admin`);

    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
    await context.close();
  });

  test('API returns 401 without auth token', async () => {
    const { request: apiRequest } = await import('@playwright/test');
    const ctx = await apiRequest.newContext();
    const res = await ctx.get(`${BASE}/api/drones`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('API login endpoint returns tokens', async () => {
    const { request: apiRequest } = await import('@playwright/test');
    const ctx = await apiRequest.newContext();
    const res = await ctx.post(`${BASE}/api/auth/login`, {
      data: { username: 'admin', password: 'admin' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('access_token');
    expect(data).toHaveProperty('refresh_token');
    expect(data).toHaveProperty('user');
    expect(data.user.username).toBe('admin');
    expect(data.user.role).toBe('super_admin');
    await ctx.dispose();
  });

  test('API /auth/me returns current user', async ({ request }) => {
    const headers = await apiLogin(request);
    const res = await request.get('/api/auth/me', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.username).toBe('admin');
    expect(data.role).toBe('super_admin');
  });
});
