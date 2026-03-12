import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

let authHeaders: Record<string, string>;

test.describe('Admin Area', () => {
  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('admin button is visible for admin user', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    await expect(page.locator('[data-testid="admin-button"]')).toBeVisible({ timeout: 5000 });
  });

  test('admin button navigates to admin area', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    await page.locator('[data-testid="admin-button"]').click();
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 5000 });
  });

  test('admin dashboard shows stats', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
    // Should show at least "Benutzer" card
    await expect(page.locator('a:has-text("Benutzer")')).toBeVisible({ timeout: 5000 });
  });

  test('admin sidebar has navigation links', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a:has-text("Mandanten")')).toBeVisible();
    await expect(page.locator('a:has-text("Benutzer")')).toBeVisible();
  });

  test('back to map button works', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });

    await page.locator('text=Zur Karte').click();
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin Tenants', () => {
  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    // Clean up E2E tenants
    const res = await request.get('/api/admin/tenants', { headers: authHeaders });
    const tenants = await res.json();
    for (const t of tenants) {
      if (t.name.startsWith('e2e-')) {
        await request.delete(`/api/admin/tenants/${t.id}`, { headers: authHeaders });
      }
    }
  });

  test('tenants page shows tenant list', async ({ page }) => {
    await page.goto('/admin/tenants');
    await expect(page.locator('h1:has-text("Mandanten")')).toBeVisible({ timeout: 10000 });
    // Default tenant should exist
    await expect(page.locator('td:has-text("default")')).toBeVisible({ timeout: 5000 });
  });

  test('create tenant via API', async ({ request }) => {
    const uid = Date.now().toString(36);
    const res = await request.post('/api/admin/tenants', {
      headers: authHeaders,
      data: { name: `e2e-tenant-${uid}`, display_name: `E2E Tenant ${uid}` },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.name).toBe(`e2e-tenant-${uid}`);
  });

  test('create tenant button shows form', async ({ page }) => {
    await page.goto('/admin/tenants');
    await expect(page.locator('h1:has-text("Mandanten")')).toBeVisible({ timeout: 10000 });

    await page.locator('button:has-text("Neuer Mandant")').click();
    await expect(page.locator('input[placeholder*="Technischer Name"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input[placeholder*="Anzeigename"]')).toBeVisible();
  });

  test('create and delete tenant via UI', async ({ page }) => {
    const uid = Date.now().toString(36);

    await page.goto('/admin/tenants');
    await expect(page.locator('h1:has-text("Mandanten")')).toBeVisible({ timeout: 10000 });

    // Open form
    await page.locator('button:has-text("Neuer Mandant")').click();

    // Fill form
    await page.locator('input[placeholder*="Technischer Name"]').fill(`e2e-uitest-${uid}`);
    await page.locator('input[placeholder*="Anzeigename"]').fill(`E2E UI Test ${uid}`);

    // Submit
    await page.locator('button:has-text("Erstellen")').click();

    // Should appear in list
    await expect(page.locator(`td:has-text("e2e-uitest-${uid}")`)).toBeVisible({ timeout: 5000 });

    // Delete
    page.on('dialog', dialog => dialog.accept());
    const row = page.locator(`tr:has-text("e2e-uitest-${uid}")`);
    await row.locator('button:has-text("Löschen")').click();

    // Should disappear
    await expect(page.locator(`td:has-text("e2e-uitest-${uid}")`)).not.toBeVisible({ timeout: 5000 });
  });

  test('default tenant cannot be deleted', async ({ page }) => {
    await page.goto('/admin/tenants');
    await expect(page.locator('h1:has-text("Mandanten")')).toBeVisible({ timeout: 10000 });

    // Default tenant row should not have a delete button
    const defaultRow = page.locator('tr:has-text("default")');
    await expect(defaultRow).toBeVisible({ timeout: 5000 });
    const deleteBtn = defaultRow.locator('button:has-text("Löschen")');
    await expect(deleteBtn).not.toBeVisible();
  });
});

test.describe('Admin Users', () => {
  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    // Clean up E2E users
    const res = await request.get('/api/admin/users', { headers: authHeaders });
    const users = await res.json();
    for (const u of users) {
      if (u.username.startsWith('e2e-')) {
        await request.delete(`/api/admin/users/${u.id}`, { headers: authHeaders });
      }
    }
  });

  test('users page shows user list', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });
    // Admin user should exist
    await expect(page.locator('td:has-text("@admin")')).toBeVisible({ timeout: 5000 });
  });

  test('create user via API', async ({ request }) => {
    const uid = Date.now().toString(36);

    // Get default tenant ID
    const tenants = await (await request.get('/api/admin/tenants', { headers: authHeaders })).json();
    const defaultTenant = tenants.find((t: any) => t.name === 'default');

    const res = await request.post('/api/admin/users', {
      headers: authHeaders,
      data: {
        username: `e2e-user-${uid}`,
        email: `e2e-${uid}@test.local`,
        password: 'testpass123',
        display_name: `E2E User ${uid}`,
        role: 'user',
        tenant_id: defaultTenant.id,
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.username).toBe(`e2e-user-${uid}`);
  });

  test('create user button shows form', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });

    await page.locator('button:has-text("Neuer Benutzer")').click();
    await expect(page.locator('input[placeholder*="Benutzername"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input[placeholder*="E-Mail"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Passwort"]')).toBeVisible();
  });

  test('super_admin cannot be deleted', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });

    // Admin user row should not have a delete button
    const adminRow = page.locator('tr:has-text("@admin")');
    await expect(adminRow).toBeVisible({ timeout: 5000 });
    const deleteBtn = adminRow.locator('button:has-text("Löschen")');
    await expect(deleteBtn).not.toBeVisible();
  });

  test('password reset button exists', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("Benutzer")')).toBeVisible({ timeout: 10000 });

    const adminRow = page.locator('tr:has-text("@admin")');
    await expect(adminRow.locator('button:has-text("PW Reset")')).toBeVisible();
  });
});

test.describe('Admin API Auth', () => {
  test('admin endpoints require authentication', async () => {
    const rawCtx = await (await import('@playwright/test')).request.newContext();
    const res = await rawCtx.get('http://localhost:3020/api/admin/tenants');
    expect(res.status()).toBe(401);
    await rawCtx.dispose();
  });

  test('GET /api/admin/tenants returns tenant list', async ({ request }) => {
    const headers = await apiLogin(request);
    const res = await request.get('/api/admin/tenants', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    // Default tenant
    const defaultTenant = data.find((t: any) => t.name === 'default');
    expect(defaultTenant).toBeTruthy();
    expect(defaultTenant).toHaveProperty('user_count');
    expect(defaultTenant).toHaveProperty('zone_count');
  });

  test('GET /api/admin/users returns user list', async ({ request }) => {
    const headers = await apiLogin(request);
    const res = await request.get('/api/admin/users', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const admin = data.find((u: any) => u.username === 'admin');
    expect(admin).toBeTruthy();
    expect(admin.role).toBe('super_admin');
  });
});
