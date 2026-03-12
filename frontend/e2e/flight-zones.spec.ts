import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

// Unique zone name per test run to avoid collisions
const uid = Date.now().toString(36);

// Auth headers for API requests (populated in beforeAll)
let authHeaders: Record<string, string>;

/** Helper: find our test zone by name prefix */
async function findZone(request: any, name: string) {
  const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
  return all.find((z: any) => z.name === name);
}

/** Helper: wait for violation table to appear and expand it */
async function expandViolationTable(page: any) {
  const table = page.locator('[data-testid="violation-table"]');
  await expect(table).toBeVisible({ timeout: 10000 });
  // Expand if collapsed
  const body = page.locator('[data-testid="violation-table-body"]');
  if (!(await body.isVisible().catch(() => false))) {
    await page.locator('[data-testid="violation-table-header"]').click();
  }
  await expect(body).toBeVisible({ timeout: 3000 });
  return { table, body };
}

/** Helper: wait for at least N violation rows */
async function waitForViolationRows(page: any, minCount: number, timeout = 15000) {
  const { body } = await expandViolationTable(page);
  await expect(body.locator('tr[data-testid^="violation-row-"]').nth(minCount - 1))
    .toBeVisible({ timeout });
  return body;
}

// ─── API Tests ─────────────────────────────────────────────────

test.describe('Flight Zones API', () => {
  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }
  });

  test('POST /api/zones creates a zone', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: `E2E-Zone-${uid}`,
        color: '#ff0000',
        polygon: [
          [52.03, 8.53],
          [52.04, 8.53],
          [52.04, 8.54],
          [52.03, 8.54],
        ],
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.name).toBe(`E2E-Zone-${uid}`);
    expect(data.color).toBe('#ff0000');
    expect(data.polygon).toHaveLength(4);
    expect(data.assignedDrones).toEqual([]);
    expect(data).toHaveProperty('id');
  });

  test('GET /api/zones lists zones', async ({ request }) => {
    const res = await request.get('/api/zones', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const ourZone = data.find((z: any) => z.name === `E2E-Zone-${uid}`);
    expect(ourZone).toBeTruthy();
  });

  test('GET /api/zones/:id returns single zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);
    expect(zone).toBeTruthy();

    const res = await request.get(`/api/zones/${zone.id}`, { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toBe(`E2E-Zone-${uid}`);
  });

  test('PUT /api/zones/:id updates a zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.put(`/api/zones/${zone.id}`, {
      headers: authHeaders,
      data: { name: `E2E-Zone-Updated-${uid}`, color: '#00ff00' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toBe(`E2E-Zone-Updated-${uid}`);
    expect(data.color).toBe('#00ff00');

    // Rename back for subsequent tests
    await request.put(`/api/zones/${zone.id}`, {
      headers: authHeaders,
      data: { name: `E2E-Zone-${uid}` },
    });
  });

  test('PUT /api/zones/:id updates AGL range', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.put(`/api/zones/${zone.id}`, {
      headers: authHeaders,
      data: { minAltitudeAGL: 10, maxAltitudeAGL: 120 },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.minAltitudeAGL).toBe(10);
    expect(data.maxAltitudeAGL).toBe(120);

    // Reset AGL
    await request.put(`/api/zones/${zone.id}`, {
      headers: authHeaders,
      data: { minAltitudeAGL: null, maxAltitudeAGL: null },
    });
  });

  test('POST /api/zones/:id/assign assigns drones', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.post(`/api/zones/${zone.id}/assign`, {
      headers: authHeaders,
      data: { droneIds: ['AZTEST001', 'AZTEST002'] },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.assignedDrones).toContain('AZTEST001');
    expect(data.assignedDrones).toContain('AZTEST002');
  });

  test('POST /api/zones/:id/unassign removes drones', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.post(`/api/zones/${zone.id}/unassign`, {
      headers: authHeaders,
      data: { droneIds: ['AZTEST002'] },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.assignedDrones).toContain('AZTEST001');
    expect(data.assignedDrones).not.toContain('AZTEST002');
  });

  test('GET /api/zones/violations returns violations', async ({ request }) => {
    const res = await request.get('/api/zones/violations', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('violations');
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data).toHaveProperty('count');
    for (const v of data.violations) {
      expect(v).toHaveProperty('droneId');
      expect(v).toHaveProperty('droneName');
      expect(v).toHaveProperty('zoneId');
      expect(v).toHaveProperty('zoneName');
    }
  });

  test('POST /api/zones 400 without required fields', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: { name: 'Bad Zone' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/zones 400 with too few polygon points', async ({ request }) => {
    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'Bad Zone',
        color: '#ff0000',
        polygon: [[52.03, 8.53], [52.04, 8.53]],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/zones/nonexistent returns 404', async ({ request }) => {
    const res = await request.get('/api/zones/nonexistent-id-xyz', { headers: authHeaders });
    expect(res.status()).toBe(404);
  });

  test('DELETE /api/zones/:id deletes a zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);
    expect(zone).toBeTruthy();

    const res = await request.delete(`/api/zones/${zone.id}`, { headers: authHeaders });
    expect(res.status()).toBe(200);

    const after = await request.get(`/api/zones/${zone.id}`, { headers: authHeaders });
    expect(after.status()).toBe(404);
  });
});

// ─── UI Tests ──────────────────────────────────────────────────

test.describe('Flight Zones UI', () => {
  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }
  });

  test.afterAll(async ({ request }) => {
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }
  });

  test('zones button is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await expect(page.locator('[data-testid="zones-toggle"]')).toBeVisible({ timeout: 5000 });
  });

  test('clicking zones button opens panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();
    await expect(page.locator('[data-testid="flight-zones-panel"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Flugzonen')).toBeVisible();
  });

  test('panel shows empty state when no zones exist', async ({ page, request }) => {
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
    }

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.waitForTimeout(500);
    await page.locator('[data-testid="zones-toggle"]').click();
    await expect(page.locator('[data-testid="zones-empty"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Keine Zonen definiert')).toBeVisible();
  });

  test('start drawing button activates drawing mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();
    await expect(page.locator('[data-testid="start-drawing-btn"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="start-drawing-btn"]').click();

    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=ZEICHNEN')).toBeVisible();
  });

  test('cancel drawing returns to normal mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();
    await page.locator('[data-testid="start-drawing-btn"]').click();
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });

    await page.locator('[data-testid="cancel-drawing-btn"]').click();

    await expect(page.locator('[data-testid="start-drawing-btn"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).not.toBeVisible();
  });

  test('create zone by clicking map points', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.waitForTimeout(1000);

    await page.locator('[data-testid="zones-toggle"]').click();
    await page.locator('[data-testid="start-drawing-btn"]').click();
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });

    // Click 4 points on the map via Leaflet API
    await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container') as any;
      if (!container?._leaflet_map) return;
      const map = container._leaflet_map;
      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;

      const offsets = [
        [0.005, -0.005],
        [0.005, 0.005],
        [-0.005, 0.005],
        [-0.005, -0.005],
      ];
      for (const [dlat, dlng] of offsets) {
        map.fireEvent('click', {
          latlng: { lat: lat + dlat, lng: lng + dlng },
          originalEvent: { preventDefault: () => {} },
        });
      }
    });

    await page.waitForTimeout(500);

    await page.locator('[data-testid="zone-name-input"]').fill('E2E-TestZone');

    const finishBtn = page.locator('[data-testid="finish-drawing-btn"]');
    await expect(finishBtn).toBeEnabled({ timeout: 3000 });
    await finishBtn.click();

    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator('text=E2E-TestZone')).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('[data-testid="zones-empty"]')).not.toBeVisible();
  });

  test('zone appears in panel after creation via API', async ({ page, request }) => {
    await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-ListTest',
        color: '#3b82f6',
        polygon: [
          [52.035, 8.535],
          [52.04, 8.535],
          [52.04, 8.545],
          [52.035, 8.545],
        ],
      },
    });

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();

    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator('text=E2E-ListTest')).toBeVisible({ timeout: 5000 });
  });

  test('delete zone from panel', async ({ page, request }) => {
    const createRes = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-DeleteMe',
        color: '#ef4444',
        polygon: [
          [52.05, 8.55],
          [52.06, 8.55],
          [52.06, 8.56],
          [52.05, 8.56],
        ],
      },
    });
    const zone = await createRes.json();

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();

    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator('text=E2E-DeleteMe')).toBeVisible({ timeout: 5000 });

    await page.locator(`[data-testid="delete-btn-${zone.id}"]`).click();

    await expect(panel.locator('text=E2E-DeleteMe')).not.toBeVisible({ timeout: 5000 });
  });

  test('assign drones panel opens with edit fields', async ({ page, request }) => {
    const createRes = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-AssignTest',
        color: '#22c55e',
        polygon: [
          [52.025, 8.525],
          [52.035, 8.525],
          [52.035, 8.535],
          [52.025, 8.535],
        ],
      },
    });
    const zone = await createRes.json();

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();

    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator('text=E2E-AssignTest')).toBeVisible({ timeout: 5000 });

    await page.locator(`[data-testid="assign-btn-${zone.id}"]`).click();

    await expect(page.locator('text=Zone bearbeiten')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Drohnen zuweisen')).toBeVisible({ timeout: 3000 });

    const nameInput = page.locator('[data-testid="edit-zone-name"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('E2E-AssignTest');

    const colorInput = page.locator('[data-testid="edit-zone-color"]');
    await expect(colorInput).toBeVisible();
  });

  test('edit zone name and color via assign panel', async ({ page, request }) => {
    const createRes = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-EditMe',
        color: '#3b82f6',
        polygon: [
          [52.045, 8.545],
          [52.055, 8.545],
          [52.055, 8.555],
          [52.045, 8.555],
        ],
      },
    });
    const zone = await createRes.json();

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();

    const zonesPanel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(zonesPanel.locator('text=E2E-EditMe')).toBeVisible({ timeout: 5000 });

    await page.locator(`[data-testid="assign-btn-${zone.id}"]`).click();
    await expect(page.locator('text=Zone bearbeiten')).toBeVisible({ timeout: 3000 });

    const nameInput = page.locator('[data-testid="edit-zone-name"]');
    await nameInput.clear();
    await nameInput.fill('E2E-Edited');

    await page.locator('[data-testid="save-assignments-btn"]').click();

    await page.waitForTimeout(500);
    const updated = await (await request.get(`/api/zones/${zone.id}`, { headers: authHeaders })).json();
    expect(updated.name).toBe('E2E-Edited');

    await expect(zonesPanel.locator('text=E2E-Edited')).toBeVisible({ timeout: 3000 });
  });

  test('zone badge shows count on button', async ({ page, request }) => {
    const zones = await (await request.get('/api/zones', { headers: authHeaders })).json();
    if (zones.length === 0) {
      await request.post('/api/zones', {
        headers: authHeaders,
        data: {
          name: 'E2E-Badge',
          color: '#3b82f6',
          polygon: [
            [52.01, 8.51],
            [52.02, 8.51],
            [52.02, 8.52],
            [52.01, 8.52],
          ],
        },
      });
    }

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.waitForTimeout(1000);

    const toggle = page.locator('[data-testid="zones-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    const badgeSpan = toggle.locator('span').filter({ hasText: /^\d+$/ });
    await expect(badgeSpan.first()).toBeVisible({ timeout: 3000 });
  });

  test('close button closes zones panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();

    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    await panel.locator('button:has-text("×")').click();
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Violation Table ───────────────────────────────────────────

test.describe('Violation Table', () => {
  let testZoneId: string;

  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
    // Clean up old E2E violation zones
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-ViolationZone')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }

    // Create a zone covering the entire Bielefeld area (where simulated drones fly)
    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-ViolationZone',
        color: '#ef4444',
        polygon: [
          [51.9, 8.3],
          [52.2, 8.3],
          [52.2, 8.7],
          [51.9, 8.7],
        ],
      },
    });
    const zone = await res.json();
    testZoneId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (testZoneId) {
      await request.delete(`/api/zones/${testZoneId}`, { headers: authHeaders });
    }
  });

  test('violation table appears when violations exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    const header = page.locator('[data-testid="violation-table-header"]');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Zonenverstoesze');
  });

  test('violation table is collapsible', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    const header = page.locator('[data-testid="violation-table-header"]');

    // Expand
    await header.click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Collapse
    await header.click();
    await expect(body).not.toBeVisible({ timeout: 3000 });
  });

  test('violation table shows drone and zone info', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const { body } = await expandViolationTable(page);

    const rows = body.locator('tr[data-testid^="violation-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    await expect(body).toContainText('E2E-ViolationZone');
  });

  test('active violations show live badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    const badge = page.locator('[data-testid="active-violations-badge"]');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('aktiv');
  });

  test('trail toggle changes icon', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const { body } = await expandViolationTable(page);

    const toggleBtn = body.locator('button[data-testid^="toggle-trail-"]').first();
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });

    // Initially visible (filled circle)
    await expect(toggleBtn).toContainText('\u25C9');

    // Toggle off
    await toggleBtn.click();
    await expect(toggleBtn).toContainText('\u25CB');

    // Toggle back on
    await toggleBtn.click();
    await expect(toggleBtn).toContainText('\u25C9');
  });

  test('delete violation removes row', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const { body } = await expandViolationTable(page);

    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
    const rowTestId = await firstRow.getAttribute('data-testid');

    const deleteBtn = body.locator('button[data-testid^="delete-violation-"]').first();
    await deleteBtn.click();

    if (rowTestId) {
      await expect(page.locator(`[data-testid="${rowTestId}"]`)).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('clear all removes all violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    await page.locator('[data-testid="clear-all-violations-btn"]').click();

    // Table should disappear briefly (no more records)
    await expect(table).not.toBeVisible({ timeout: 3000 });
  });

  test('clicking violation row opens status panel for that drone', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const { body } = await expandViolationTable(page);

    // Get drone name from first row
    const droneNameEl = body.locator('div[data-testid^="violation-drone-"]').first();
    await expect(droneNameEl).toBeVisible({ timeout: 5000 });
    const droneName = await droneNameEl.locator('div').first().textContent();

    // Click the row (not just the drone name)
    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await firstRow.click();

    // Status panel should appear with the drone name
    const statusPanel = page.locator('[data-testid="status-panel"]');
    await expect(statusPanel).toBeVisible({ timeout: 3000 });
    if (droneName) {
      await expect(statusPanel).toContainText(droneName);
    }
  });
});

// ─── Violation Row Selection & Trail Filtering ─────────────────

test.describe('Violation Selection & Trails', () => {
  let testZoneId: string;

  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-SelectZone')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }

    // Large zone covering all simulated drones
    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-SelectZone',
        color: '#3b82f6',
        polygon: [
          [51.9, 8.3],
          [52.2, 8.3],
          [52.2, 8.7],
          [51.9, 8.7],
        ],
      },
    });
    const zone = await res.json();
    testZoneId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (testZoneId) {
      await request.delete(`/api/zones/${testZoneId}`, { headers: authHeaders });
    }
  });

  test('clicking a row visually selects it', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const body = await waitForViolationRows(page, 1);

    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await firstRow.click();

    // Selected row should have blue highlight (outline)
    const outline = await firstRow.evaluate(el => getComputedStyle(el).outline);
    expect(outline).toContain('rgb(');  // Has an outline set
  });

  test('can switch between violations by clicking different rows', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Wait for at least 2 violations
    const body = await waitForViolationRows(page, 2);

    const rows = body.locator('tr[data-testid^="violation-row-"]');
    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);

    // Click first row
    await firstRow.click();

    // Get drone name from first row
    const firstDroneName = await firstRow.locator('div[data-testid^="violation-drone-"] div').first().textContent();

    // Status panel should show first drone
    const statusPanel = page.locator('[data-testid="status-panel"]');
    await expect(statusPanel).toBeVisible({ timeout: 3000 });
    if (firstDroneName) {
      await expect(statusPanel).toContainText(firstDroneName);
    }

    // Click second row
    await secondRow.click();

    // Get drone name from second row
    const secondDroneName = await secondRow.locator('div[data-testid^="violation-drone-"] div').first().textContent();

    // Status panel should now show second drone
    if (secondDroneName && secondDroneName !== firstDroneName) {
      await expect(statusPanel).toContainText(secondDroneName);
    }

    // First row should no longer be highlighted, second should be
    const firstOutline = await firstRow.evaluate(el => getComputedStyle(el).outlineStyle);
    const secondOutline = await secondRow.evaluate(el => getComputedStyle(el).outlineStyle);
    expect(firstOutline).toBe('none');
    expect(secondOutline).not.toBe('none');
  });

  test('selected row shows only that drone trail on map', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const body = await waitForViolationRows(page, 2);

    // Click first row to select a drone
    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await firstRow.click();

    // Wait for trail rendering
    await page.waitForTimeout(1000);

    // Get the number of trail polylines on the map
    const trailCount = await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container') as any;
      if (!container?._leaflet_map) return 0;
      const map = container._leaflet_map;
      let count = 0;
      map.eachLayer((layer: any) => {
        // Polylines in the overlay pane (not zone polygons, not circles)
        if (layer instanceof (window as any).L.Polyline
          && !(layer instanceof (window as any).L.Polygon)
          && !(layer instanceof (window as any).L.Circle)) {
          count++;
        }
      });
      return count;
    });

    // With a row selected, only 1 trail should be visible (the selected drone's)
    // Could be 0 if tracking hasn't accumulated enough points yet
    expect(trailCount).toBeLessThanOrEqual(1);
  });

  test('selecting different rows switches the visible trail', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const body = await waitForViolationRows(page, 2);

    const rows = body.locator('tr[data-testid^="violation-row-"]');

    // Click first row
    await rows.nth(0).click();
    await page.waitForTimeout(500);

    // Get trail info for first selection
    const getTrailDroneId = async () => {
      return page.evaluate(() => {
        const container = document.querySelector('.leaflet-container') as any;
        if (!container?._leaflet_map) return null;
        const map = container._leaflet_map;
        let trailTooltip: string | null = null;
        map.eachLayer((layer: any) => {
          if (layer instanceof (window as any).L.Polyline
            && !(layer instanceof (window as any).L.Polygon)
            && !(layer instanceof (window as any).L.Circle)
            && layer.getTooltip()) {
            trailTooltip = layer.getTooltip().getContent();
          }
        });
        return trailTooltip;
      });
    };

    const trail1 = await getTrailDroneId();

    // Click second row
    await rows.nth(1).click();
    await page.waitForTimeout(500);

    const trail2 = await getTrailDroneId();

    // If both rows are different drones, trails should differ (or be null if not enough points)
    const drone1 = await rows.nth(0).locator('div[data-testid^="violation-drone-"] div').first().textContent();
    const drone2 = await rows.nth(1).locator('div[data-testid^="violation-drone-"] div').first().textContent();

    if (drone1 !== drone2 && trail1 && trail2) {
      expect(trail1).not.toBe(trail2);
    }
  });
});

// ─── Clear All & Re-detection ──────────────────────────────────

test.describe('Violation Clear & Re-detection', () => {
  let testZoneId: string;

  test.beforeAll(async ({ request }) => {
    if (!authHeaders) authHeaders = await apiLogin(request);
    const all = await (await request.get('/api/zones', { headers: authHeaders })).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-RedetectZone')) {
        await request.delete(`/api/zones/${z.id}`, { headers: authHeaders });
      }
    }

    const res = await request.post('/api/zones', {
      headers: authHeaders,
      data: {
        name: 'E2E-RedetectZone',
        color: '#f59e0b',
        polygon: [
          [51.9, 8.3],
          [52.2, 8.3],
          [52.2, 8.7],
          [51.9, 8.7],
        ],
      },
    });
    const zone = await res.json();
    testZoneId = zone.id;
  });

  test.afterAll(async ({ request }) => {
    if (testZoneId) {
      await request.delete(`/api/zones/${testZoneId}`, { headers: authHeaders });
    }
  });

  test('after clear all, all violating drones are re-detected', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Wait for violations to appear and count them
    const body = await waitForViolationRows(page, 2, 15000);
    const initialCount = await body.locator('tr[data-testid^="violation-row-"]').count();

    // Clear all
    await page.locator('[data-testid="clear-all-violations-btn"]').click();

    // Table should disappear
    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).not.toBeVisible({ timeout: 3000 });

    // Wait for re-detection (violations should reappear within a few poll cycles)
    await expect(table).toBeVisible({ timeout: 15000 });

    // Expand and verify count matches or exceeds initial
    const bodyAfter = await waitForViolationRows(page, 2, 15000);
    const redetectedCount = await bodyAfter.locator('tr[data-testid^="violation-row-"]').count();

    // All drones should be re-detected (same or more due to timing)
    expect(redetectedCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('after deleting single violation, drone is re-detected', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const body = await waitForViolationRows(page, 2);

    // Remember first row's drone ID
    const firstDroneTestId = await body.locator('div[data-testid^="violation-drone-"]').first().getAttribute('data-testid');
    const droneId = firstDroneTestId?.replace('violation-drone-', '');

    // Delete the first violation
    const deleteBtn = body.locator('button[data-testid^="delete-violation-"]').first();
    await deleteBtn.click();

    // Wait for re-detection — the same drone should reappear
    await page.waitForTimeout(5000);

    // Check if a new violation for that drone was created
    if (droneId) {
      const droneCell = page.locator(`[data-testid="violation-drone-${droneId}"]`);
      await expect(droneCell).toBeVisible({ timeout: 10000 });
    }
  });

  test('clear all resets selection state', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const body = await waitForViolationRows(page, 1);

    // Select a row
    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await firstRow.click();

    // Status panel should be open
    await expect(page.locator('[data-testid="status-panel"]')).toBeVisible({ timeout: 3000 });

    // Clear all
    await page.locator('[data-testid="clear-all-violations-btn"]').click();

    // Table disappears
    await expect(page.locator('[data-testid="violation-table"]')).not.toBeVisible({ timeout: 3000 });

    // After re-detection, no row should be pre-selected (no outline)
    const bodyAfter = await waitForViolationRows(page, 1, 15000);

    const firstNewRow = bodyAfter.locator('tr[data-testid^="violation-row-"]').first();
    await expect(firstNewRow).toBeVisible({ timeout: 5000 });

    // No row should have selection outline
    const outline = await firstNewRow.evaluate(el => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('none');
  });
});

// ─── Refresh Rate ──────────────────────────────────────────────

test.describe('Refresh Rate Control', () => {
  test('refresh rate dropdown is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const select = page.locator('[data-testid="refresh-rate-select"]');
    await expect(select).toBeVisible({ timeout: 5000 });
  });

  test('refresh rate has correct default (2s)', async ({ page }) => {
    // Clear stored value
    await page.goto('/');
    await page.evaluate(() => {
      const userId = localStorage.getItem('current_user_id');
      const key = userId ? `refresh-rate_${userId}` : 'refresh-rate';
      localStorage.removeItem(key);
    });
    await page.reload();
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const select = page.locator('[data-testid="refresh-rate-select"]');
    await expect(select).toHaveValue('2000');
  });

  test('refresh rate options include all preset values', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const select = page.locator('[data-testid="refresh-rate-select"]');
    const options = select.locator('option');

    const values = await options.evaluateAll(opts =>
      (opts as HTMLOptionElement[]).map(o => Number(o.value))
    );
    expect(values).toContain(1000);
    expect(values).toContain(2000);
    expect(values).toContain(5000);
    expect(values).toContain(10000);
    expect(values).toContain(30000);
  });

  test('changing refresh rate persists in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const select = page.locator('[data-testid="refresh-rate-select"]');
    await select.selectOption('5000');

    // Verify localStorage
    const stored = await page.evaluate(() => {
      const userId = localStorage.getItem('current_user_id');
      const key = userId ? `refresh-rate_${userId}` : 'refresh-rate';
      return localStorage.getItem(key);
    });
    expect(stored).toBe('5000');

    // Reload and verify persistence
    await page.reload();
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await expect(select).toHaveValue('5000');

    // Reset
    await select.selectOption('2000');
  });

  test('faster refresh rate increases poll frequency', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Set to 1s and count polls over 5 seconds
    const select = page.locator('[data-testid="refresh-rate-select"]');
    await select.selectOption('1000');

    let fastPollCount = 0;
    page.on('response', resp => {
      if (resp.url().includes('/api/drones') && resp.status() === 200) {
        fastPollCount++;
      }
    });

    await page.waitForTimeout(5000);

    // At 1s interval, expect ~4-6 polls in 5 seconds (minus startup)
    expect(fastPollCount).toBeGreaterThanOrEqual(3);

    // Now set to 5s and count
    let slowPollCount = 0;
    await select.selectOption('5000');

    // Reset counter
    page.removeAllListeners('response');
    page.on('response', resp => {
      if (resp.url().includes('/api/drones') && resp.status() === 200) {
        slowPollCount++;
      }
    });

    await page.waitForTimeout(5000);

    // At 5s interval, expect ~1-2 polls in 5 seconds
    expect(slowPollCount).toBeLessThan(fastPollCount);

    // Reset
    await select.selectOption('2000');
  });
});
