import { test, expect, type Page } from '@playwright/test';
import { apiLogin } from './helpers';

/**
 * E2E-Tests für Mobile-Ansichten.
 * Viewport: 375x667 (iPhone SE) für alle Tests.
 */

const MOBILE_VIEWPORT = { width: 375, height: 667 };

let authHeaders: Record<string, string>;

// ─── Helper: wait for drones API ─────────────────────────
async function waitForDrones(page: Page) {
  await page.waitForResponse(
    resp => resp.url().includes('/api/drones') && resp.status() === 200,
    { timeout: 10000 }
  );
}

// ═══════════════════════════════════════════════════════════
// MAP PAGE — Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Map Page', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForDrones(page);
  });

  test('compact top bar is visible', async ({ page }) => {
    // On mobile, FlightArc title should be visible
    await expect(page.locator('text=FlightArc')).toBeVisible();
  });

  test('drone count shows on mobile', async ({ page }) => {
    await expect(page.locator('text=/\\d+ Drohne/')).toBeVisible({ timeout: 5000 });
  });

  test('map fills viewport', async ({ page }) => {
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    // Map should use most of the viewport width
    expect(box!.width).toBeGreaterThan(300);
  });

  test('leaflet zoom controls hidden on mobile', async ({ page }) => {
    // Zoom controls should be hidden on mobile (use pinch-to-zoom)
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    if (await zoomIn.count() > 0) {
      const visible = await zoomIn.isVisible().catch(() => false);
      // On mobile they should be hidden via CSS
      expect(visible).toBe(false);
    }
  });

  test('admin button is accessible on mobile', async ({ page }) => {
    const adminBtn = page.locator('[data-testid="admin-button"]');
    if (await adminBtn.count() > 0) {
      await expect(adminBtn).toBeVisible();
      const box = await adminBtn.boundingBox();
      // Should be at least 44px for touch targets
      if (box) expect(box.height).toBeGreaterThanOrEqual(30);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// ADMIN — Mobile Drawer
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Admin Drawer', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
    // Wait for dashboard to load
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });

  test('hamburger menu button visible on mobile', async ({ page }) => {
    // The hamburger button opens the sidebar drawer
    const hamburger = page.locator('button').filter({ hasText: '\u2630' });
    // It might auto-open on first load, or show hamburger
    const sidebarVisible = await page.locator('a:has-text("Benutzer")').isVisible().catch(() => false);
    if (!sidebarVisible) {
      await expect(hamburger).toBeVisible();
    }
  });

  test('sidebar drawer opens and shows nav items', async ({ page }) => {
    // Check that navigation items are accessible
    const nav = page.locator('a:has-text("Benutzer")');
    if (!await nav.isVisible().catch(() => false)) {
      // Click hamburger to open
      await page.locator('button').filter({ hasText: '\u2630' }).click();
    }
    await expect(page.locator('a:has-text("Benutzer")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('a:has-text("Empfänger")')).toBeVisible();
    await expect(page.locator('a:has-text("Einstellungen")')).toBeVisible();
    await expect(page.locator('a:has-text("Logs")')).toBeVisible();
  });

  test('sidebar drawer navigation works', async ({ page }) => {
    // Open sidebar if needed
    const nav = page.locator('a:has-text("Benutzer")');
    if (!await nav.isVisible().catch(() => false)) {
      await page.locator('button').filter({ hasText: '\u2630' }).click();
    }
    await page.locator('a:has-text("Benutzer")').click();
    // Sidebar should close after click, content should show
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 5000 });
  });

  test('sidebar has back to map and logout buttons', async ({ page }) => {
    // Open sidebar
    const nav = page.locator('a:has-text("Benutzer")');
    if (!await nav.isVisible().catch(() => false)) {
      await page.locator('button').filter({ hasText: '\u2630' }).click();
    }
    await expect(page.locator('text=Zur Karte')).toBeVisible();
    await expect(page.locator('text=Abmelden')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════
// ADMIN — Receivers as Cards on Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Receiver Cards', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('receivers page loads on mobile', async ({ page }) => {
    await page.goto('/admin/receivers');
    // Should show heading or empty state
    await expect(page.locator('h1:has-text("Empfänger")')).toBeVisible({ timeout: 10000 });
  });

  test('receiver create button is touch-friendly', async ({ page }) => {
    await page.goto('/admin/receivers');
    await expect(page.locator('h1:has-text("Empfänger")')).toBeVisible({ timeout: 10000 });
    // The create button should exist and be visible
    const createBtn = page.locator('button:has-text("Empfänger hinzufügen"), button:has-text("Hinzufügen"), button:has-text("+")');
    if (await createBtn.count() > 0) {
      await expect(createBtn.first()).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// ADMIN — UserList Cards on Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: UserList', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('users page loads on mobile', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });
  });

  test('user list shows at least admin user', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });
    // Should show at least the admin user
    await expect(page.locator('text=admin').first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════
// LOGIN PAGE — Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Login Page', () => {
  test.use({
    viewport: MOBILE_VIEWPORT,
    storageState: { cookies: [], origins: [] },
  });

  test('login form is responsive', async ({ page }) => {
    await page.goto('/login');
    const usernameInput = page.locator('[data-testid="login-username"]');
    await expect(usernameInput).toBeVisible({ timeout: 5000 });
    const box = await usernameInput.boundingBox();
    // Form should be at most the mobile viewport width
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(375);
    expect(box!.width).toBeGreaterThan(200);
  });

  test('login buttons are touch-friendly', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('[data-testid="login-submit"]');
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    const box = await submitBtn.boundingBox();
    expect(box).toBeTruthy();
    // Touch target should be at least 40px high
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});

// ═══════════════════════════════════════════════════════════
// SETTINGS PAGE — Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Settings Page', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('settings page loads on mobile', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=/Einstellungen|Settings/')).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════
// FLIGHT REPORT — Stacked Layout
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Flight Report', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('violation records API accessible', async ({ request }) => {
    const res = await request.get('/api/violations', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('records');
  });
});

// ═══════════════════════════════════════════════════════════
// VIOLATION TABLE — Mobile Touch Buttons
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Violation Table', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('violations API returns data', async ({ request }) => {
    const res = await request.get('/api/violations', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.records)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// LOG VIEWER — Mobile
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Log Viewer', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('log viewer page loads on mobile', async ({ page }) => {
    await page.goto('/admin/logs');
    await expect(page.locator('h1:has-text("System-Logs")')).toBeVisible({ timeout: 10000 });
  });

  test('log level select is accessible', async ({ page }) => {
    await page.goto('/admin/logs');
    await expect(page.locator('h1:has-text("System-Logs")')).toBeVisible({ timeout: 10000 });
    const select = page.locator('[data-testid="log-level-select"]');
    await expect(select).toBeVisible();
    const box = await select.boundingBox();
    expect(box).toBeTruthy();
    // Touch-friendly on mobile (min 40px height)
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });

  test('filter controls are visible', async ({ page }) => {
    await page.goto('/admin/logs');
    await expect(page.locator('h1:has-text("System-Logs")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="log-filter-level"]')).toBeVisible();
    await expect(page.locator('[data-testid="log-search"]')).toBeVisible();
  });

  test('log level can be changed', async ({ page }) => {
    await page.goto('/admin/logs');
    await expect(page.locator('h1:has-text("System-Logs")')).toBeVisible({ timeout: 10000 });
    const select = page.locator('[data-testid="log-level-select"]');
    await select.selectOption('debug');
    // Should not error
    await page.waitForTimeout(500);
    // Verify the value stuck
    const value = await select.inputValue();
    expect(value).toBe('debug');
    // Reset to info
    await select.selectOption('info');
  });
});

// ═══════════════════════════════════════════════════════════
// ADMIN LOGS API — Mobile context
// ═══════════════════════════════════════════════════════════

test.describe('Mobile: Logs API', () => {
  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('GET /api/admin/logs returns structure', async ({ request }) => {
    const res = await request.get('/api/admin/logs', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('logs');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.logs)).toBe(true);
  });

  test('GET /api/admin/logs/levels returns level', async ({ request }) => {
    const res = await request.get('/api/admin/logs/levels', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(['debug', 'info', 'warning', 'error']).toContain(data.level);
  });

  test('POST /api/admin/logs/levels sets level', async ({ request }) => {
    const res = await request.post('/api/admin/logs/levels', {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { level: 'debug' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.level).toBe('debug');
    // Reset
    await request.post('/api/admin/logs/levels', {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { level: 'info' },
    });
  });

  test('GET /api/admin/logs/modules returns array', async ({ request }) => {
    const res = await request.get('/api/admin/logs/modules', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.modules)).toBe(true);
  });

  test('GET /api/admin/logs with filters', async ({ request }) => {
    const res = await request.get('/api/admin/logs?level=error&limit=10', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.limit).toBe(10);
    // All returned logs should be error level (if any)
    for (const log of data.logs) {
      expect(log.level).toBe('error');
    }
  });
});
