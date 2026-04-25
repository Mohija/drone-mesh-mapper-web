import { test, expect } from '@playwright/test';

const API = 'http://localhost:3020';

async function login(request: any): Promise<Record<string, string>> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
  const data = await res.json();
  return { Authorization: `Bearer ${data.access_token}` };
}

test.describe('Alarm Interfaces — API + UI smoke', () => {
  let authHeaders: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    authHeaders = await login(request);
  });

  test.afterEach(async ({ request }) => {
    const list = await request.get(`${API}/api/admin/interfaces`, { headers: authHeaders });
    if (list.ok()) {
      const body = await list.json();
      for (const iface of body.items || []) {
        if (typeof iface.name === 'string' && iface.name.startsWith('E2E-')) {
          await request.delete(`${API}/api/admin/interfaces/${iface.id}`, { headers: authHeaders });
        }
      }
    }
  });

  test('GET /api/admin/interfaces returns versioned list', async ({ request }) => {
    const res = await request.get(`${API}/api/admin/interfaces`, { headers: authHeaders });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.version).toBe('number');
  });

  test('GET /api/admin/interfaces/variables exposes the variable pool', async ({ request }) => {
    const res = await request.get(`${API}/api/admin/interfaces/variables`, { headers: authHeaders });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.variables.length).toBeGreaterThan(20);
    expect(body.exampleContext.drone).toBeDefined();
  });

  test('CRUD: create, list, masked secret, delete', async ({ request }) => {
    const uid = Date.now().toString(36);
    const create = await request.post(`${API}/api/admin/interfaces`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: {
        name: `E2E-Webhook-${uid}`,
        interfaceType: 'webhook',
        url: 'https://example.com/hook',
        authType: 'bearer',
        authConfig: { token: 'secret-token-123' },
        payloadTemplate: { event: '{{trigger}}' },
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.authConfig.token).toBe('••••••••');

    const detail = await request.get(`${API}/api/admin/interfaces/${created.id}`, { headers: authHeaders });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).authConfig.token).toBe('••••••••');

    const del = await request.delete(`${API}/api/admin/interfaces/${created.id}`, { headers: authHeaders });
    expect(del.status()).toBe(200);
  });

  test('Pull-In creates one-shot service token', async ({ request }) => {
    const uid = Date.now().toString(36);
    const res = await request.post(`${API}/api/admin/interfaces`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { name: `E2E-PullIn-${uid}`, interfaceType: 'pull_in', authType: 'none', payloadTemplate: {} },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.pullToken).toBeTruthy();
    expect(body.pullToken).toMatch(/^flightarc_svc_/);

    const detail = await request.get(`${API}/api/admin/interfaces/${body.id}`, { headers: authHeaders });
    const detailBody = await detail.json();
    expect(detailBody.pullToken).toBeUndefined();

    const probe = await request.get(`${API}/api/integrations/violations`, {
      headers: { 'X-Service-Token': body.pullToken },
    });
    expect(probe.status()).toBe(200);

    await request.delete(`${API}/api/admin/interfaces/${body.id}`, { headers: authHeaders });
  });

  test('UI: admin interfaces and alarms tabs render', async ({ page }) => {
    await page.goto(`${API}/login`);
    await page.fill('[data-testid="login-username"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    await page.click('[data-testid="login-submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

    await page.goto(`${API}/admin/interfaces`);
    await expect(page.locator('h1:has-text("Schnittstellen")')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Neue Schnittstelle/ })).toBeVisible();

    await page.goto(`${API}/admin/alarms`);
    await expect(page.locator('h1:has-text("Alarmverwaltung")')).toBeVisible({ timeout: 10000 });
  });
});
