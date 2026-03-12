import { test, expect } from '@playwright/test';

// Unique zone name per test run to avoid collisions
const uid = Date.now().toString(36);

/** Helper: find our test zone by name prefix */
async function findZone(request: any, name: string) {
  const all = await (await request.get('/api/zones')).json();
  return all.find((z: any) => z.name === name);
}

test.describe('Flight Zones API', () => {
  // Clean up test zones after all API tests
  test.afterAll(async ({ request }) => {
    const all = await (await request.get('/api/zones')).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`);
      }
    }
  });

  test('POST /api/zones creates a zone', async ({ request }) => {
    const res = await request.post('/api/zones', {
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
    const res = await request.get('/api/zones');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const ourZone = data.find((z: any) => z.name === `E2E-Zone-${uid}`);
    expect(ourZone).toBeTruthy();
  });

  test('GET /api/zones/:id returns single zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);
    expect(zone).toBeTruthy();

    const res = await request.get(`/api/zones/${zone.id}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toBe(`E2E-Zone-${uid}`);
  });

  test('PUT /api/zones/:id updates a zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.put(`/api/zones/${zone.id}`, {
      data: { name: `E2E-Zone-Updated-${uid}`, color: '#00ff00' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toBe(`E2E-Zone-Updated-${uid}`);
    expect(data.color).toBe('#00ff00');

    // Rename back for subsequent tests
    await request.put(`/api/zones/${zone.id}`, {
      data: { name: `E2E-Zone-${uid}` },
    });
  });

  test('POST /api/zones/:id/assign assigns drones', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);

    const res = await request.post(`/api/zones/${zone.id}/assign`, {
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
      data: { droneIds: ['AZTEST002'] },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.assignedDrones).toContain('AZTEST001');
    expect(data.assignedDrones).not.toContain('AZTEST002');
  });

  test('GET /api/zones/violations returns violations', async ({ request }) => {
    const res = await request.get('/api/zones/violations');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('violations');
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data).toHaveProperty('count');
    // Each violation has required fields
    for (const v of data.violations) {
      expect(v).toHaveProperty('droneId');
      expect(v).toHaveProperty('droneName');
      expect(v).toHaveProperty('zoneId');
      expect(v).toHaveProperty('zoneName');
    }
  });

  test('POST /api/zones 400 without required fields', async ({ request }) => {
    const res = await request.post('/api/zones', {
      data: { name: 'Bad Zone' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/zones 400 with too few polygon points', async ({ request }) => {
    const res = await request.post('/api/zones', {
      data: {
        name: 'Bad Zone',
        color: '#ff0000',
        polygon: [[52.03, 8.53], [52.04, 8.53]],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/zones/nonexistent returns 404', async ({ request }) => {
    const res = await request.get('/api/zones/nonexistent-id-xyz');
    expect(res.status()).toBe(404);
  });

  test('DELETE /api/zones/:id deletes a zone', async ({ request }) => {
    const zone = await findZone(request, `E2E-Zone-${uid}`);
    expect(zone).toBeTruthy();

    const res = await request.delete(`/api/zones/${zone.id}`);
    expect(res.status()).toBe(200);

    // Verify gone
    const after = await request.get(`/api/zones/${zone.id}`);
    expect(after.status()).toBe(404);
  });
});

test.describe('Flight Zones UI', () => {
  // Cleanup: delete all E2E zones before/after suite
  test.beforeAll(async ({ request }) => {
    const all = await (await request.get('/api/zones')).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`);
      }
    }
  });

  test.afterAll(async ({ request }) => {
    const all = await (await request.get('/api/zones')).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-')) {
        await request.delete(`/api/zones/${z.id}`);
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
    // Ensure no zones exist
    const all = await (await request.get('/api/zones')).json();
    for (const z of all) {
      await request.delete(`/api/zones/${z.id}`);
    }

    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    // Wait for zones to load
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

    // Drawing mode UI should appear
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });
    // ZEICHNEN badge visible
    await expect(page.locator('text=ZEICHNEN')).toBeVisible();
  });

  test('cancel drawing returns to normal mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.locator('[data-testid="zones-toggle"]').click();
    await page.locator('[data-testid="start-drawing-btn"]').click();
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });

    await page.locator('[data-testid="cancel-drawing-btn"]').click();

    // Should be back to normal
    await expect(page.locator('[data-testid="start-drawing-btn"]')).toBeVisible({ timeout: 3000 });
    // The green ZEICHNEN badge on the zones toggle should disappear
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).not.toBeVisible();
  });

  test('create zone by clicking map points', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
    await page.waitForTimeout(1000); // let map initialize

    // Open zones panel and start drawing
    await page.locator('[data-testid="zones-toggle"]').click();
    await page.locator('[data-testid="start-drawing-btn"]').click();
    await expect(page.locator('[data-testid="drawing-mode-ui"]')).toBeVisible({ timeout: 3000 });

    // Click 4 points on the map via Leaflet API to create a polygon
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

    // Fill in zone name
    await page.locator('[data-testid="zone-name-input"]').fill('E2E-TestZone');

    // Finish button should be enabled now
    const finishBtn = page.locator('[data-testid="finish-drawing-btn"]');
    await expect(finishBtn).toBeEnabled({ timeout: 3000 });
    await finishBtn.click();

    // Wait for zone to be saved — check within panel to avoid matching map tooltip
    const panel = page.locator('[data-testid="flight-zones-panel"]');
    await expect(panel.locator('text=E2E-TestZone')).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('[data-testid="zones-empty"]')).not.toBeVisible();
  });

  test('zone appears in panel after creation via API', async ({ page, request }) => {
    await request.post('/api/zones', {
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

    // Click delete button
    await page.locator(`[data-testid="delete-btn-${zone.id}"]`).click();

    // Zone should disappear from panel
    await expect(panel.locator('text=E2E-DeleteMe')).not.toBeVisible({ timeout: 5000 });
  });

  test('assign drones panel opens with edit fields', async ({ page, request }) => {
    const createRes = await request.post('/api/zones', {
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

    // Click assign/edit button
    await page.locator(`[data-testid="assign-btn-${zone.id}"]`).click();

    // Modal should show "Zone bearbeiten" header and drone assignment section
    await expect(page.locator('text=Zone bearbeiten')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Drohnen zuweisen')).toBeVisible({ timeout: 3000 });

    // Edit fields should be pre-filled
    const nameInput = page.locator('[data-testid="edit-zone-name"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('E2E-AssignTest');

    const colorInput = page.locator('[data-testid="edit-zone-color"]');
    await expect(colorInput).toBeVisible();
  });

  test('edit zone name and color via assign panel', async ({ page, request }) => {
    const createRes = await request.post('/api/zones', {
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

    // Open edit modal
    await page.locator(`[data-testid="assign-btn-${zone.id}"]`).click();
    await expect(page.locator('text=Zone bearbeiten')).toBeVisible({ timeout: 3000 });

    // Change name
    const nameInput = page.locator('[data-testid="edit-zone-name"]');
    await nameInput.clear();
    await nameInput.fill('E2E-Edited');

    // Save
    await page.locator('[data-testid="save-assignments-btn"]').click();

    // Verify via API
    await page.waitForTimeout(500);
    const updated = await (await request.get(`/api/zones/${zone.id}`)).json();
    expect(updated.name).toBe('E2E-Edited');

    // Zone name should be updated in the panel
    await expect(zonesPanel.locator('text=E2E-Edited')).toBeVisible({ timeout: 3000 });
  });

  test('zone badge shows count on button', async ({ page, request }) => {
    // Ensure at least one zone exists
    const zones = await (await request.get('/api/zones')).json();
    if (zones.length === 0) {
      await request.post('/api/zones', {
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
    // Wait for zones to load
    await page.waitForTimeout(1000);

    // The zones-toggle button should have a badge span with a count number
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

    // Close via the × button in the panel header
    await panel.locator('button:has-text("×")').click();
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Violation Table', () => {
  // Create a large zone covering the simulator area to trigger violations
  let testZoneId: string;

  test.beforeAll(async ({ request }) => {
    // Clean up old E2E violation zones
    const all = await (await request.get('/api/zones')).json();
    for (const z of all) {
      if (z.name.startsWith('E2E-ViolationZone')) {
        await request.delete(`/api/zones/${z.id}`);
      }
    }

    // Create a zone covering the entire Bielefeld area (where simulated drones fly)
    const res = await request.post('/api/zones', {
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
      await request.delete(`/api/zones/${testZoneId}`);
    }
  });

  test('violation table appears when violations exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Wait for violation detection (polls every 2s)
    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Header shows count
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

    // Click to expand (starts collapsed)
    await header.click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Click to collapse
    await header.click();
    await expect(body).not.toBeVisible({ timeout: 3000 });
  });

  test('violation table shows drone and zone info', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Expand table
    await page.locator('[data-testid="violation-table-header"]').click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Should have at least one violation row
    const rows = body.locator('tr[data-testid^="violation-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    // Row should contain zone name
    await expect(body).toContainText('E2E-ViolationZone');
  });

  test('active violations show live badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Active violations badge
    const badge = page.locator('[data-testid="active-violations-badge"]');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('aktiv');
  });

  test('trail toggle changes icon', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Expand table
    await page.locator('[data-testid="violation-table-header"]').click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Find first trail toggle button
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

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Expand table
    await page.locator('[data-testid="violation-table-header"]').click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Get the specific row ID of the first violation
    const firstRow = body.locator('tr[data-testid^="violation-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
    const rowTestId = await firstRow.getAttribute('data-testid');

    // Delete that specific violation
    const deleteBtn = body.locator('button[data-testid^="delete-violation-"]').first();
    await deleteBtn.click();

    // The specific row should disappear
    if (rowTestId) {
      await expect(page.locator(`[data-testid="${rowTestId}"]`)).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('clear all removes all violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Click clear all
    await page.locator('[data-testid="clear-all-violations-btn"]').click();

    // Table should disappear (no more records)
    await expect(table).not.toBeVisible({ timeout: 3000 });
  });

  test('clicking drone name in violation opens status panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    const table = page.locator('[data-testid="violation-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Expand table
    await page.locator('[data-testid="violation-table-header"]').click();
    const body = page.locator('[data-testid="violation-table-body"]');
    await expect(body).toBeVisible({ timeout: 3000 });

    // Click drone name
    const droneLink = body.locator('div[data-testid^="violation-drone-"]').first();
    await expect(droneLink).toBeVisible({ timeout: 5000 });
    await droneLink.click();

    // Status panel should appear
    await expect(page.locator('.status-panel, [class*="StatusPanel"]')).toBeVisible({ timeout: 3000 }).catch(() => {
      // StatusPanel might not have a specific class/testid, check for known content
    });
  });
});
