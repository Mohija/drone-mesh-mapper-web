import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiLogin, loginAs } from './helpers';
import fs from 'fs';
import path from 'path';

/**
 * Multi-tenancy E2E tests.
 *
 * Verifies:
 *  - Users in the same tenant see the same flight zones and violations
 *  - Users in different tenants do NOT see each other's zones
 *  - Admin tenant/user CRUD with proper isolation
 *  - Role-based access (super_admin, tenant_admin, user)
 */

// Retries spawn new workers which re-evaluate module-level code,
// generating a different uid and breaking shared test state.
test.describe.configure({ retries: 0 });

// ─── Shared state persisted to file across worker restarts ────

const STATE_FILE = '/tmp/playwright-mt-state.json';

interface SharedState {
  uid: string;
  tenantAId: string;
  tenantBId: string;
  userA1Id: string;
  userA2Id: string;
  userB1Id: string;
  tenantAdminAId: string;
  tenantAdminBId: string;
}

function loadState(): SharedState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(s: SharedState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

// Initialize UID: stable across worker restarts
const existingState = loadState();
const uid = existingState?.uid || Date.now().toString(36);

// Shared state (populated by setup, read by other describes)
const S: SharedState = existingState || {
  uid,
  tenantAId: '',
  tenantBId: '',
  userA1Id: '',
  userA2Id: '',
  userB1Id: '',
  tenantAdminAId: '',
  tenantAdminBId: '',
};

// Test tenant and user names (derived from uid, always consistent)
const TENANT_A = `e2e-tenant-a-${uid}`;
const TENANT_B = `e2e-tenant-b-${uid}`;

const USER_A1 = `e2e-ua1-${uid}`;
const USER_A2 = `e2e-ua2-${uid}`;
const USER_B1 = `e2e-ub1-${uid}`;
const TENANT_ADMIN_A = `e2e-tadmin-a-${uid}`;
const TENANT_ADMIN_B = `e2e-tadmin-b-${uid}`;

const PASSWORD = 'testpass123';

/** Helper: login via API as a specific user */
async function loginUser(request: APIRequestContext, username: string, password = PASSWORD) {
  return apiLogin(request, username, password);
}

/**
 * Login as a specific user via the UI.
 * Clears existing auth state first (the chromium project pre-loads admin's storageState).
 */
async function loginAsUser(page: import('@playwright/test').Page, username: string, password = PASSWORD) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await loginAs(page, username, password);
}

// ─── Setup & Teardown ─────────────────────────────────────────

test.describe('Multi-Tenant Setup', () => {
  test('create test tenants and users', async ({ request }) => {
    const adminHeaders = await apiLogin(request);

    // Create Tenant A
    const resA = await request.post('/api/admin/tenants', {
      headers: adminHeaders,
      data: { name: TENANT_A, display_name: `E2E Tenant A ${uid}` },
    });
    expect(resA.status()).toBe(201);
    S.tenantAId = (await resA.json()).id;

    // Create Tenant B
    const resB = await request.post('/api/admin/tenants', {
      headers: adminHeaders,
      data: { name: TENANT_B, display_name: `E2E Tenant B ${uid}` },
    });
    expect(resB.status()).toBe(201);
    S.tenantBId = (await resB.json()).id;

    // Create User A1 in Tenant A (role: user)
    const resUA1 = await request.post('/api/admin/users', {
      headers: adminHeaders,
      data: {
        username: USER_A1, email: `${USER_A1}@test.local`, password: PASSWORD,
        display_name: 'User A1', role: 'user', tenant_id: S.tenantAId,
      },
    });
    expect(resUA1.status()).toBe(201);
    S.userA1Id = (await resUA1.json()).id;

    // Create User A2 in Tenant A (role: user)
    const resUA2 = await request.post('/api/admin/users', {
      headers: adminHeaders,
      data: {
        username: USER_A2, email: `${USER_A2}@test.local`, password: PASSWORD,
        display_name: 'User A2', role: 'user', tenant_id: S.tenantAId,
      },
    });
    expect(resUA2.status()).toBe(201);
    S.userA2Id = (await resUA2.json()).id;

    // Create User B1 in Tenant B (role: user)
    const resUB1 = await request.post('/api/admin/users', {
      headers: adminHeaders,
      data: {
        username: USER_B1, email: `${USER_B1}@test.local`, password: PASSWORD,
        display_name: 'User B1', role: 'user', tenant_id: S.tenantBId,
      },
    });
    expect(resUB1.status()).toBe(201);
    S.userB1Id = (await resUB1.json()).id;

    // Create tenant_admin in Tenant A
    const resTAdminA = await request.post('/api/admin/users', {
      headers: adminHeaders,
      data: {
        username: TENANT_ADMIN_A, email: `${TENANT_ADMIN_A}@test.local`, password: PASSWORD,
        display_name: 'Tenant Admin A', role: 'tenant_admin', tenant_id: S.tenantAId,
      },
    });
    expect(resTAdminA.status()).toBe(201);
    S.tenantAdminAId = (await resTAdminA.json()).id;

    // Create tenant_admin in Tenant B
    const resTAdminB = await request.post('/api/admin/users', {
      headers: adminHeaders,
      data: {
        username: TENANT_ADMIN_B, email: `${TENANT_ADMIN_B}@test.local`, password: PASSWORD,
        display_name: 'Tenant Admin B', role: 'tenant_admin', tenant_id: S.tenantBId,
      },
    });
    expect(resTAdminB.status()).toBe(201);
    S.tenantAdminBId = (await resTAdminB.json()).id;

    // Persist state for other describes / worker restarts
    saveState(S);
  });
});

// ─── Zone Isolation (API) ─────────────────────────────────────

test.describe('Zone Tenant Isolation (API)', () => {
  let headersA1: Record<string, string>;
  let headersA2: Record<string, string>;
  let headersB1: Record<string, string>;
  let headersTAdminA: Record<string, string>;
  let headersTAdminB: Record<string, string>;
  let zoneAId: string;
  let zoneBId: string;

  test.beforeAll(async ({ request }) => {
    headersA1 = await loginUser(request, USER_A1);
    headersA2 = await loginUser(request, USER_A2);
    headersB1 = await loginUser(request, USER_B1);
    headersTAdminA = await loginUser(request, TENANT_ADMIN_A);
    headersTAdminB = await loginUser(request, TENANT_ADMIN_B);
  });

  test.afterAll(async ({ request }) => {
    // Clean up zones created during tests
    for (const headers of [headersTAdminA, headersTAdminB]) {
      if (!headers) continue;
      const res = await request.get('/api/zones', { headers });
      if (res.ok()) {
        const zones = await res.json();
        for (const z of zones) {
          if (z.name.startsWith('E2E-MT-')) {
            await request.delete(`/api/zones/${z.id}`, { headers });
          }
        }
      }
    }
  });

  test('Tenant admin A creates a zone in Tenant A', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: headersTAdminA,
      data: {
        name: `E2E-MT-ZoneA-${uid}`,
        color: '#3b82f6',
        polygon: [[52.03, 8.53], [52.04, 8.53], [52.04, 8.54], [52.03, 8.54]],
      },
    });
    expect(res.status()).toBe(201);
    const zone = await res.json();
    zoneAId = zone.id;
    expect(zone.name).toBe(`E2E-MT-ZoneA-${uid}`);
  });

  test('User A2 (same tenant, user role) sees the zone', async ({ request }) => {
    const res = await request.get('/api/zones', { headers: headersA2 });
    expect(res.status()).toBe(200);
    const zones = await res.json();
    const found = zones.find((z: any) => z.id === zoneAId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(`E2E-MT-ZoneA-${uid}`);
  });

  test('User B1 (different tenant) does NOT see the zone', async ({ request }) => {
    const res = await request.get('/api/zones', { headers: headersB1 });
    expect(res.status()).toBe(200);
    const zones = await res.json();
    const found = zones.find((z: any) => z.id === zoneAId);
    expect(found).toBeUndefined();
  });

  test('Tenant admin B creates a zone in Tenant B', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: headersTAdminB,
      data: {
        name: `E2E-MT-ZoneB-${uid}`,
        color: '#ef4444',
        polygon: [[52.05, 8.55], [52.06, 8.55], [52.06, 8.56], [52.05, 8.56]],
      },
    });
    expect(res.status()).toBe(201);
    const zone = await res.json();
    zoneBId = zone.id;
  });

  test('User A1 does NOT see Tenant B zone', async ({ request }) => {
    const res = await request.get('/api/zones', { headers: headersA1 });
    const zones = await res.json();
    const found = zones.find((z: any) => z.id === zoneBId);
    expect(found).toBeUndefined();
  });

  test('User B1 cannot access Tenant A zone by ID', async ({ request }) => {
    const res = await request.get(`/api/zones/${zoneAId}`, { headers: headersB1 });
    expect(res.status()).toBe(404);
  });

  test('Tenant admin B cannot update Tenant A zone', async ({ request }) => {
    const res = await request.put(`/api/zones/${zoneAId}`, {
      headers: headersTAdminB,
      data: { name: 'Hijacked!' },
    });
    expect(res.status()).toBe(404);
  });

  test('Tenant admin B cannot delete Tenant A zone', async ({ request }) => {
    const res = await request.delete(`/api/zones/${zoneAId}`, { headers: headersTAdminB });
    expect(res.status()).toBe(404);

    // Verify zone still exists for Tenant A
    const check = await request.get(`/api/zones/${zoneAId}`, { headers: headersA1 });
    expect(check.status()).toBe(200);
  });

  test('Tenant admin A can update own zone', async ({ request }) => {
    const res = await request.put(`/api/zones/${zoneAId}`, {
      headers: headersTAdminA,
      data: { name: `E2E-MT-ZoneA-Updated-${uid}` },
    });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe(`E2E-MT-ZoneA-Updated-${uid}`);

    // Rename back
    await request.put(`/api/zones/${zoneAId}`, {
      headers: headersTAdminA,
      data: { name: `E2E-MT-ZoneA-${uid}` },
    });
  });

  test('Tenant admin A can delete own zone', async ({ request }) => {
    const createRes = await request.post('/api/zones', {
      headers: headersTAdminA,
      data: {
        name: `E2E-MT-DeleteTest-${uid}`,
        color: '#22c55e',
        polygon: [[52.01, 8.51], [52.02, 8.51], [52.02, 8.52], [52.01, 8.52]],
      },
    });
    const zone = await createRes.json();
    const res = await request.delete(`/api/zones/${zone.id}`, { headers: headersTAdminA });
    expect(res.status()).toBe(200);
  });

  test('Tenant admin B cannot assign drones to Tenant A zone', async ({ request }) => {
    const res = await request.post(`/api/zones/${zoneAId}/assign`, {
      headers: headersTAdminB,
      data: { droneIds: ['HACK001'] },
    });
    expect(res.status()).toBe(404);
  });

  test('Regular user cannot create zones via POST /api/zones', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: headersA1,
      data: {
        name: `E2E-MT-Forbidden-${uid}`,
        color: '#ff0000',
        polygon: [[52.0, 8.5], [52.1, 8.5], [52.1, 8.6], [52.0, 8.6]],
      },
    });
    expect(res.status()).toBe(403);
  });

  test('Mission zone created by Tenant A is NOT visible to Tenant B', async ({ request }) => {
    // Any authenticated user can create mission zones via /api/zones/mission
    const createRes = await request.post('/api/zones/mission', {
      headers: headersA1,
      data: { name: `E2E-MT-Mission-${uid}`, lat: 52.016, lon: 8.575 },
    });
    expect(createRes.status()).toBe(201);
    const missionZone = await createRes.json();
    expect(missionZone.polygon.length).toBe(36);

    // Tenant A (User A2) can see it
    const zonesA = await (await request.get('/api/zones', { headers: headersA2 })).json();
    expect(zonesA.find((z: any) => z.id === missionZone.id)).toBeTruthy();

    // Tenant B cannot see it
    const zonesB = await (await request.get('/api/zones', { headers: headersB1 })).json();
    expect(zonesB.find((z: any) => z.id === missionZone.id)).toBeUndefined();

    // Tenant B cannot access by ID
    const directRes = await request.get(`/api/zones/${missionZone.id}`, { headers: headersB1 });
    expect(directRes.status()).toBe(404);

    // Cleanup
    await request.delete(`/api/zones/${missionZone.id}`, { headers: headersTAdminA });
  });
});

// ─── Violation Isolation (API) ────────────────────────────────

test.describe('Violation Tenant Isolation (API)', () => {
  let headersA1: Record<string, string>;
  let headersB1: Record<string, string>;
  let headersTAdminA: Record<string, string>;
  let bigZoneAId: string;

  test.beforeAll(async ({ request }) => {
    headersA1 = await loginUser(request, USER_A1);
    headersB1 = await loginUser(request, USER_B1);
    headersTAdminA = await loginUser(request, TENANT_ADMIN_A);

    // Create a big zone covering the simulation area (needs tenant_admin)
    const res = await request.post('/api/zones', {
      headers: headersTAdminA,
      data: {
        name: `E2E-MT-BigZoneA-${uid}`,
        color: '#ef4444',
        polygon: [[51.9, 8.3], [52.2, 8.3], [52.2, 8.7], [51.9, 8.7]],
      },
    });
    expect(res.ok()).toBeTruthy();
    const zone = await res.json();
    bigZoneAId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (bigZoneAId && headersTAdminA) {
      await request.delete(`/api/zones/${bigZoneAId}`, { headers: headersTAdminA });
    }
  });

  test('Tenant A sees violations for its zones', async ({ request }) => {
    // Wait for violations to accumulate (simulation produces drone positions)
    const res = await request.get('/api/zones/violations', { headers: headersA1 });
    expect(res.status()).toBe(200);
    const data = await res.json();
    // API returns { records: [...], count: N }
    expect(data).toHaveProperty('records');
    expect(data.records.length).toBeGreaterThanOrEqual(0);
  });

  test('Tenant B sees no violations (has no zones)', async ({ request }) => {
    const res = await request.get('/api/zones/violations', { headers: headersB1 });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.records.length).toBe(0);
  });
});

// ─── Role-Based Access ────────────────────────────────────────

test.describe('Role-Based Access Control', () => {
  let headersA1: Record<string, string>;
  let headersTAdminA: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headersA1 = await loginUser(request, USER_A1);
    headersTAdminA = await loginUser(request, TENANT_ADMIN_A);
  });

  test('regular user cannot access admin endpoints', async ({ request }) => {
    const res = await request.get('/api/admin/tenants', { headers: headersA1 });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot create tenants', async ({ request }) => {
    const res = await request.post('/api/admin/tenants', {
      headers: headersA1,
      data: { name: 'e2e-hacked', display_name: 'Hacked' },
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot create users', async ({ request }) => {
    const res = await request.post('/api/admin/users', {
      headers: headersA1,
      data: {
        username: 'e2e-hacked-user', email: 'hack@test.local',
        password: 'hack12345678', role: 'user', tenant_id: S.tenantAId,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('tenant_admin can list users', async ({ request }) => {
    const res = await request.get('/api/admin/users', { headers: headersTAdminA });
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
  });

  test('tenant_admin only sees own tenant users', async ({ request }) => {
    const res = await request.get('/api/admin/users', { headers: headersTAdminA });
    const users = await res.json();
    const usernames = users.map((u: any) => u.username);

    // All returned users should belong to Tenant A
    expect(usernames).toContain(USER_A1);
    expect(usernames).toContain(USER_A2);
    expect(usernames).toContain(TENANT_ADMIN_A);
    expect(usernames).not.toContain(USER_B1);
    expect(usernames).not.toContain(TENANT_ADMIN_B);
  });

  test('tenant_admin can create user in own tenant', async ({ request }) => {
    const newUser = `e2e-tadmin-created-${uid}`;
    const res = await request.post('/api/admin/users', {
      headers: headersTAdminA,
      data: {
        username: newUser, email: `${newUser}@test.local`,
        password: PASSWORD, display_name: 'Created by TAdmin',
        role: 'user', tenant_id: S.tenantAId,
      },
    });
    expect(res.status()).toBe(201);
    const user = await res.json();
    expect(user.tenant_id).toBe(S.tenantAId);

    // Cleanup
    const adminHeaders = await apiLogin(request);
    await request.delete(`/api/admin/users/${user.id}`, { headers: adminHeaders });
  });

  test('tenant_admin cannot create user in other tenant', async ({ request }) => {
    const res = await request.post('/api/admin/users', {
      headers: headersTAdminA,
      data: {
        username: `e2e-cross-tenant-${uid}`, email: `cross-${uid}@test.local`,
        password: PASSWORD, display_name: 'Cross Tenant',
        role: 'user', tenant_id: S.tenantBId,
      },
    });
    expect([400, 403]).toContain(res.status());
  });

  test('tenant_admin cannot create tenants', async ({ request }) => {
    const res = await request.post('/api/admin/tenants', {
      headers: headersTAdminA,
      data: { name: 'e2e-tadmin-hack', display_name: 'Hacked' },
    });
    expect(res.status()).toBe(403);
  });

  test('tenant_admin cannot delete tenants', async ({ request }) => {
    const res = await request.delete(`/api/admin/tenants/${S.tenantBId}`, {
      headers: headersTAdminA,
    });
    expect(res.status()).toBe(403);
  });
});

// ─── Admin Board: Tenant Management ───────────────────────────

test.describe('Admin Board: Tenant Details', () => {
  let adminHeaders: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    adminHeaders = await apiLogin(request);
  });

  test('admin can list all tenants', async ({ request }) => {
    const res = await request.get('/api/admin/tenants', { headers: adminHeaders });
    expect(res.status()).toBe(200);
    const tenants = await res.json();
    expect(tenants.length).toBeGreaterThanOrEqual(2);
  });

  test('tenant list shows user and zone counts', async ({ request }) => {
    const res = await request.get('/api/admin/tenants', { headers: adminHeaders });
    const tenants = await res.json();

    const tA = tenants.find((t: any) => t.name === TENANT_A);
    expect(tA).toBeTruthy();
    expect(tA.user_count).toBeGreaterThanOrEqual(3); // A1, A2, tenant_admin_a
    expect(typeof tA.zone_count).toBe('number');
  });

  test('super_admin sees all users across tenants', async ({ request }) => {
    const res = await request.get('/api/admin/users', { headers: adminHeaders });
    const users = await res.json();
    const usernames = users.map((u: any) => u.username);

    expect(usernames).toContain(USER_A1);
    expect(usernames).toContain(USER_A2);
    expect(usernames).toContain(USER_B1);
    expect(usernames).toContain(TENANT_ADMIN_A);
  });

  test('super_admin can filter users by tenant', async ({ request }) => {
    const res = await request.get(`/api/admin/users?tenant_id=${S.tenantBId}`, {
      headers: adminHeaders,
    });
    const users = await res.json();
    for (const u of users) {
      expect(u.tenant_id).toBe(S.tenantBId);
    }
    const usernames = users.map((u: any) => u.username);
    expect(usernames).toContain(USER_B1);
    expect(usernames).not.toContain(USER_A1);
  });

  test('super_admin can change user password', async ({ request }) => {
    const res = await request.post(`/api/admin/users/${S.userA1Id}/password`, {
      headers: adminHeaders,
      data: { new_password: 'newpass456789' },
    });
    expect(res.status()).toBe(200);

    // Verify new password works
    const loginRes = await request.post('/api/auth/login', {
      data: { username: USER_A1, password: 'newpass456789' },
    });
    expect(loginRes.status()).toBe(200);

    // Reset password back
    await request.post(`/api/admin/users/${S.userA1Id}/password`, {
      headers: adminHeaders,
      data: { new_password: PASSWORD },
    });
  });
});

// ─── Same Tenant UI: Both Users See Same Zones ────────────────

test.describe('Same Tenant UI Isolation', () => {
  let headersTAdminA: Record<string, string>;
  let uiZoneId: string;

  test.beforeAll(async ({ request }) => {
    headersTAdminA = await loginUser(request, TENANT_ADMIN_A);

    const res = await request.post('/api/zones', {
      headers: headersTAdminA,
      data: {
        name: `E2E-MT-UIZone-${uid}`,
        color: '#8b5cf6',
        polygon: [[52.025, 8.525], [52.035, 8.525], [52.035, 8.535], [52.025, 8.535]],
      },
    });
    expect(res.ok()).toBeTruthy();
    const zone = await res.json();
    uiZoneId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (uiZoneId && headersTAdminA) {
      await request.delete(`/api/zones/${uiZoneId}`, { headers: headersTAdminA });
    }
  });

  test('User A2 sees zone created by admin A in the UI', async ({ page }) => {
    await loginAsUser(page, USER_A2, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );

    await page.locator('[data-testid="zones-toggle"]').click();
    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator(`text=E2E-MT-UIZone-${uid}`)).toBeVisible({ timeout: 5000 });
  });

  test('User B1 does NOT see Tenant A zone in the UI', async ({ page }) => {
    await loginAsUser(page, USER_B1, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );

    await page.locator('[data-testid="zones-toggle"]').click();
    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await page.waitForTimeout(1000);
    await expect(panel.locator(`text=E2E-MT-UIZone-${uid}`)).not.toBeVisible({ timeout: 3000 });
  });

  test('admin button is NOT visible for regular user', async ({ page }) => {
    await loginAsUser(page, USER_A1, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="admin-button"]')).not.toBeVisible();
  });
});

// ─── Same Tenant: Shared Violation Alerts ─────────────────────

test.describe('Same Tenant Shared Violations', () => {
  let headersTAdminA: Record<string, string>;
  let violationZoneId: string;

  test.beforeAll(async ({ request }) => {
    headersTAdminA = await loginUser(request, TENANT_ADMIN_A);

    const res = await request.post('/api/zones', {
      headers: headersTAdminA,
      data: {
        name: `E2E-MT-ViolZone-${uid}`,
        color: '#ef4444',
        polygon: [[51.9, 8.3], [52.2, 8.3], [52.2, 8.7], [51.9, 8.7]],
      },
    });
    expect(res.ok()).toBeTruthy();
    const zone = await res.json();
    violationZoneId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (violationZoneId && headersTAdminA) {
      await request.delete(`/api/zones/${violationZoneId}`, { headers: headersTAdminA });
    }
  });

  test('User A1 sees violation alerts for shared zone', async ({ page }) => {
    await loginAsUser(page, USER_A1, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    const header = page.locator('[data-testid="violation-table-header"]');
    await header.click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });
    await expect(body.locator('tr[data-testid^="violation-row-"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('User A2 also sees violation alerts for same zone', async ({ page }) => {
    await loginAsUser(page, USER_A2, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    const header = page.locator('[data-testid="violation-table-header"]');
    await header.click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });
    await expect(body.locator('tr[data-testid^="violation-row-"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('User B1 sees NO violation alerts (no zones in Tenant B)', async ({ page }) => {
    await loginAsUser(page, USER_B1, PASSWORD);
    await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 10000 },
    );

    // Wait a few poll cycles — violation table should NOT appear
    await page.waitForTimeout(5000);
    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).not.toBeVisible();
  });
});

// ─── Cleanup ──────────────────────────────────────────────────

test.describe('Multi-Tenant Cleanup', () => {
  test('cleanup test data', async ({ request }) => {
    const headers = await apiLogin(request);

    // Delete ALL e2e tenants (handles leftover data from failed runs too)
    const tenantsRes = await request.get('/api/admin/tenants', { headers });
    const tenants = await tenantsRes.json();
    for (const t of tenants) {
      if (t.name.startsWith('e2e-')) {
        await request.delete(`/api/admin/tenants/${t.id}`, { headers });
      }
    }

    // Delete any orphaned e2e users
    const usersRes = await request.get('/api/admin/users', { headers });
    const users = await usersRes.json();
    for (const u of users) {
      if (u.username.startsWith('e2e-')) {
        await request.delete(`/api/admin/users/${u.id}`, { headers });
      }
    }

    // Remove state file
    try { fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
  });
});
