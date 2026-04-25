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

  test('Templates: list endpoint returns curated entries', async ({ request }) => {
    const res = await request.get(`${API}/api/admin/interfaces/templates`, { headers: authHeaders });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.items.map((t: { id: string }) => t.id);
    expect(ids).toContain('alamos_fe2');
    expect(ids).toContain('slack_webhook');
    expect(ids).toContain('subscription_starter');
  });

  test('Subscription channel: create + register + signed push', async ({ request }) => {
    const uid = Date.now().toString(36);
    // Create channel
    const create = await request.post(`${API}/api/admin/interfaces`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: {
        name: `E2E-Sub-${uid}`,
        interfaceType: 'subscription',
        authType: 'none',
        payloadTemplate: { event: '{{trigger}}' },
        enabled: true,
      },
    });
    expect(create.status()).toBe(201);
    const channel = await create.json();
    expect(channel.apiKey).toMatch(/^flightarc_chan_/);

    // Register a subscriber
    const reg = await request.post(`${API}/api/integrations/subscriptions/${channel.id}/register`, {
      headers: { 'X-API-Key': channel.apiKey, 'Content-Type': 'application/json' },
      data: { callback_url: 'https://httpbin.org/post', name: 'E2E-Sub' },
    });
    expect(reg.status()).toBe(201);
    const sub = await reg.json();
    expect(sub.secret).toBeTruthy();

    // Bad key rejected
    const bad = await request.post(`${API}/api/integrations/subscriptions/${channel.id}/register`, {
      headers: { 'X-API-Key': 'wrong', 'Content-Type': 'application/json' },
      data: { callback_url: 'https://httpbin.org/post' },
    });
    expect(bad.status()).toBe(401);

    // Admin sees the subscriber
    const list = await request.get(`${API}/api/admin/interfaces/${channel.id}/subscriptions`,
      { headers: authHeaders });
    expect(list.status()).toBe(200);
    expect((await list.json()).items.length).toBe(1);

    await request.delete(`${API}/api/admin/interfaces/${channel.id}`, { headers: authHeaders });
  });

  test('Usage examples: contains language-tagged code snippets', async ({ request }) => {
    const create = await request.post(`${API}/api/admin/interfaces`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: {
        name: `E2E-Examples-${Date.now().toString(36)}`,
        interfaceType: 'subscription',
        authType: 'none',
        payloadTemplate: {},
      },
    });
    const id = (await create.json()).id;
    const res = await request.get(`${API}/api/admin/interfaces/${id}/usage-examples`,
      { headers: authHeaders });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.subscribe.length).toBeGreaterThan(0);
    expect(body.webhook.length).toBeGreaterThan(0);
    const langs = body.subscribe.map((s: { language: string }) => s.language);
    expect(new Set(langs)).toEqual(new Set(['bash', 'python']));
    await request.delete(`${API}/api/admin/interfaces/${id}`, { headers: authHeaders });
  });

  test('Stats endpoint returns 7d daily buckets', async ({ request }) => {
    const create = await request.post(`${API}/api/admin/interfaces`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { name: `E2E-Stats-${Date.now().toString(36)}`, interfaceType: 'webhook',
              url: 'https://httpbin.org/post', authType: 'none', payloadTemplate: {} },
    });
    const id = (await create.json()).id;
    const res = await request.get(`${API}/api/admin/interfaces/${id}/stats`, { headers: authHeaders });
    const body = await res.json();
    expect(body.daily.length).toBe(7);
    expect(body.last24hTotal).toBe(0);
    await request.delete(`${API}/api/admin/interfaces/${id}`, { headers: authHeaders });
  });

  test('UI: payload builder mode toggle renders DnD palette', async ({ page }) => {
    await page.goto(`${API}/login`);
    await page.fill('[data-testid="login-username"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    await page.click('[data-testid="login-submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

    await page.goto(`${API}/admin/interfaces`);
    await page.getByRole('button', { name: /Neue Schnittstelle/ }).click();
    await page.fill('input[placeholder*="Alarmserver"]', `E2E-Builder-${Date.now().toString(36)}`);

    await page.getByRole('button', { name: /^Payload$/ }).click();
    // Builder is the default mode — palette + tree must be present
    await expect(page.getByPlaceholder(/Variablen suchen/)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Live-Vorschau')).toBeVisible();
    // Switch to Raw — textarea visible
    await page.getByRole('button', { name: /^Raw JSON$/ }).click();
    await expect(page.locator('textarea')).toBeVisible();
    // Switch back
    await page.getByRole('button', { name: /^Builder$/ }).click();
    await expect(page.getByPlaceholder(/Variablen suchen/)).toBeVisible();
  });
});
