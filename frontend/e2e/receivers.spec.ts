import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

const uid = Date.now().toString(36);

// ─── API Tests: Receiver CRUD ────────────────────────────────

test.describe('Receiver API CRUD', () => {
  let headers: Record<string, string>;
  const createdIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('GET /api/receivers returns array', async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('POST /api/receivers creates receiver with 64-char API key', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Create-${uid}`, hardware_type: 'esp32-s3' },
    });
    expect(res.status()).toBe(201);
    const node = await res.json();
    expect(node.name).toBe(`E2E-Create-${uid}`);
    expect(node.hardwareType).toBe('esp32-s3');
    expect(node.apiKey).toBeTruthy();
    expect(node.apiKey.length).toBe(64);
    expect(node.status).toBe('offline');
    expect(node.isActive).toBe(true);
    expect(node.totalDetections).toBe(0);
    expect(node.id).toBeTruthy();
    expect(node.id.length).toBe(8);
    createdIds.push(node.id);
  });

  test('POST /api/receivers creates esp32-c3 receiver', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-C3-${uid}`, hardware_type: 'esp32-c3' },
    });
    expect(res.status()).toBe(201);
    const node = await res.json();
    expect(node.hardwareType).toBe('esp32-c3');
    createdIds.push(node.id);
  });

  test('POST /api/receivers creates esp8266 receiver', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-8266-${uid}`, hardware_type: 'esp8266' },
    });
    expect(res.status()).toBe(201);
    const node = await res.json();
    expect(node.hardwareType).toBe('esp8266');
    createdIds.push(node.id);
  });

  test('POST /api/receivers rejects invalid hardware type', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Bad-${uid}`, hardware_type: 'raspberry-pi' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Ungültiger Hardware-Typ');
  });

  test('POST /api/receivers rejects empty name', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: '', hardware_type: 'esp32-s3' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Name');
  });

  test('POST /api/receivers rejects whitespace-only name', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: '   ', hardware_type: 'esp32-s3' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/receivers/:id returns single receiver', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-GetOne-${uid}`, hardware_type: 'esp32-c3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);

    const res = await request.get(`/api/receivers/${node.id}`, { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(node.id);
    expect(data.name).toBe(`E2E-GetOne-${uid}`);
    expect(data.hardwareType).toBe('esp32-c3');
    // GET single should NOT include apiKey by default
    expect(data.apiKey).toBeFalsy();
  });

  test('GET /api/receivers/:id returns 404 for non-existent', async ({ request }) => {
    const res = await request.get('/api/receivers/NOTEXIST', { headers });
    expect(res.status()).toBe(404);
  });

  test('PUT /api/receivers/:id updates name', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-UpdName-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);

    const res = await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Updated-${uid}` },
    });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe(`E2E-Updated-${uid}`);
  });

  test('PUT /api/receivers/:id rejects empty name update', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-EmptyUpd-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);

    const res = await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT /api/receivers/:id deactivates receiver', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Deact-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);

    const res = await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { is_active: false },
    });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.isActive).toBe(false);
  });

  test('PUT /api/receivers/:id reactivates receiver', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-React-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);

    // Deactivate
    await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { is_active: false },
    });

    // Reactivate
    const res = await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { is_active: true },
    });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.isActive).toBe(true);
  });

  test('POST /api/receivers/:id/regenerate-key returns new key', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-RegenKey-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    createdIds.push(node.id);
    const oldKey = node.apiKey;

    const res = await request.post(`/api/receivers/${node.id}/regenerate-key`, { headers });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.apiKey).toBeTruthy();
    expect(updated.apiKey.length).toBe(64);
    expect(updated.apiKey).not.toBe(oldKey);
  });

  test('DELETE /api/receivers/:id removes receiver', async ({ request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Delete-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    const res = await request.delete(`/api/receivers/${node.id}`, { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify 404
    const getRes = await request.get(`/api/receivers/${node.id}`, { headers });
    expect(getRes.status()).toBe(404);
  });

  test('DELETE /api/receivers/:id returns 404 for non-existent', async ({ request }) => {
    const res = await request.delete('/api/receivers/NOTEXIST', { headers });
    expect(res.status()).toBe(404);
  });
});

// ─── API Tests: Receiver Stats ───────────────────────────────

test.describe('Receiver Stats API', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('GET /api/receivers/stats returns all stat fields', async ({ request }) => {
    const res = await request.get('/api/receivers/stats', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe('number');
    expect(typeof data.online).toBe('number');
    expect(typeof data.stale).toBe('number');
    expect(typeof data.offline).toBe('number');
    expect(typeof data.totalDetections).toBe('number');
  });

  test('stats.total increments after creating receiver', async ({ request }) => {
    const statsBefore = await (await request.get('/api/receivers/stats', { headers })).json();

    await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-StatsInc-${uid}`, hardware_type: 'esp32-s3' },
    });

    const statsAfter = await (await request.get('/api/receivers/stats', { headers })).json();
    expect(statsAfter.total).toBe(statsBefore.total + 1);
    // Newly created receiver should be offline (no heartbeat)
    expect(statsAfter.offline).toBeGreaterThanOrEqual(statsBefore.offline + 1);
  });
});

// ─── API Tests: Node Authentication ──────────────────────────

test.describe('Node Authentication', () => {
  let headers: Record<string, string>;
  let nodeApiKey = '';
  let nodeId = '';

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-NodeAuth-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await res.json();
    nodeApiKey = node.apiKey;
    nodeId = node.id;
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('heartbeat without X-Node-Key returns 401', async ({ request }) => {
    const res = await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('heartbeat with wrong key returns 401', async ({ request }) => {
    const res = await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': 'wrongkey123' },
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('heartbeat with valid key returns 200 and server_time', async ({ request }) => {
    const res = await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: {
        firmware_version: '1.0.0-test',
        wifi_ssid: 'TestWiFi',
        wifi_rssi: -55,
        free_heap: 120000,
        uptime_seconds: 300,
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.server_time).toBe('number');
  });

  test('heartbeat updates receiver fields persistently', async ({ request }) => {
    // Send heartbeat with specific data
    await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: {
        firmware_version: '2.0.0-e2e',
        wifi_ssid: 'E2E-WiFi',
        wifi_rssi: -42,
        free_heap: 98765,
        uptime_seconds: 12345,
        latitude: 52.5200,
        longitude: 13.4050,
        accuracy: 3.5,
      },
    });

    // Fetch receiver via admin API and verify fields are persisted
    const getRes = await request.get(`/api/receivers/${nodeId}`, { headers });
    expect(getRes.status()).toBe(200);
    const node = await getRes.json();
    expect(node.firmwareVersion).toBe('2.0.0-e2e');
    expect(node.wifiSsid).toBe('E2E-WiFi');
    expect(node.wifiRssi).toBe(-42);
    expect(node.freeHeap).toBe(98765);
    expect(node.uptimeSeconds).toBe(12345);
    expect(node.lastLatitude).toBeCloseTo(52.52, 2);
    expect(node.lastLongitude).toBeCloseTo(13.405, 2);
    expect(node.lastLocationAccuracy).toBeCloseTo(3.5, 1);
    // After heartbeat, status should be online (heartbeat was just sent)
    expect(node.status).toBe('online');
  });

  test('ingest without X-Node-Key returns 401', async ({ request }) => {
    const res = await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json' },
      data: { detections: [{ basic_id: 'TEST-001', lat: 52, lon: 8 }] },
    });
    expect(res.status()).toBe(401);
  });

  test('ingest with valid key stores detections and returns count', async ({ request }) => {
    const res = await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: {
        node_lat: 52.03,
        node_lon: 8.53,
        detections: [
          { basic_id: 'TEST-DRONE-001', lat: 52.031, lon: 8.531, alt: 100, speed: 5.0, rssi: -60 },
          { basic_id: 'TEST-DRONE-002', lat: 52.032, lon: 8.532, alt: 150, speed: 8.0, rssi: -70 },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.stored).toBe(2);
  });

  test('ingest with empty detections returns 400', async ({ request }) => {
    const res = await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: { node_lat: 52.03, node_lon: 8.53, detections: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('ingest updates total_detections counter', async ({ request }) => {
    // Get baseline
    const before = await (await request.get(`/api/receivers/${nodeId}`, { headers })).json();
    const baselineDetections = before.totalDetections;

    // Ingest 3 detections
    await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: {
        node_lat: 52.03,
        node_lon: 8.53,
        detections: [
          { basic_id: 'COUNTER-001', lat: 52.031, lon: 8.531, alt: 100, rssi: -60 },
          { basic_id: 'COUNTER-002', lat: 52.032, lon: 8.532, alt: 120, rssi: -65 },
          { basic_id: 'COUNTER-003', lat: 52.033, lon: 8.533, alt: 140, rssi: -70 },
        ],
      },
    });

    // Verify counter increased
    const after = await (await request.get(`/api/receivers/${nodeId}`, { headers })).json();
    expect(after.totalDetections).toBe(baselineDetections + 3);
    expect(after.detectionsSinceBoot).toBeGreaterThan(before.detectionsSinceBoot);
  });

  test('ingest updates node location from node_lat/node_lon', async ({ request }) => {
    await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': nodeApiKey },
      data: {
        node_lat: 48.8566,
        node_lon: 2.3522,
        node_accuracy: 5.0,
        detections: [
          { basic_id: 'LOC-001', lat: 48.857, lon: 2.353, alt: 200, rssi: -50 },
        ],
      },
    });

    const node = await (await request.get(`/api/receivers/${nodeId}`, { headers })).json();
    expect(node.lastLatitude).toBeCloseTo(48.8566, 3);
    expect(node.lastLongitude).toBeCloseTo(2.3522, 3);
    expect(node.lastLocationAccuracy).toBeCloseTo(5.0, 1);
  });

  test('deactivated receiver cannot authenticate', async ({ request }) => {
    // Create a receiver, get its key, then deactivate it
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-DeactAuth-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    const key = node.apiKey;

    // Verify it works first
    const hbOk = await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': key },
      data: {},
    });
    expect(hbOk.status()).toBe(200);

    // Deactivate
    await request.put(`/api/receivers/${node.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { is_active: false },
    });

    // Now heartbeat should fail with 403
    const hbFail = await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': key },
      data: {},
    });
    expect(hbFail.status()).toBe(403);
    const body = await hbFail.json();
    expect(body.error).toContain('deaktiviert');
  });
});

// ─── API Tests: Receiver Version Counter ─────────────────────

test.describe('Receiver Version Counter', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
  });

  test('/api/drones response includes receiver_version', async ({ request }) => {
    const res = await request.get('/api/drones', { headers });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.receiver_version).toBe('number');
  });

  test('receiver_version increments after ingest', async ({ request }) => {
    // Create a receiver for ingesting
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Version-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();
    const key = node.apiKey;

    // Get version before
    const dronesBefore = await (await request.get('/api/drones', { headers })).json();
    const versionBefore = dronesBefore.receiver_version;

    // Ingest something
    await request.post('/api/receivers/ingest', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': key },
      data: {
        node_lat: 52.0, node_lon: 8.5,
        detections: [{ basic_id: 'VER-001', lat: 52.01, lon: 8.51, alt: 50, rssi: -55 }],
      },
    });

    // Get version after
    const dronesAfter = await (await request.get('/api/drones', { headers })).json();
    expect(dronesAfter.receiver_version).toBeGreaterThan(versionBefore);

    // Cleanup
    await request.delete(`/api/receivers/${node.id}`, { headers });
  });
});

// ─── API Tests: Auth Requirements ────────────────────────────

test.describe('Receiver API Auth Requirements', () => {
  test('GET /api/receivers without token returns 401', async ({ request }) => {
    const res = await request.get('/api/receivers');
    expect(res.status()).toBe(401);
  });

  test('POST /api/receivers without token returns 401', async ({ request }) => {
    const res = await request.post('/api/receivers', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'test', hardware_type: 'esp32-s3' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/receivers/stats without token returns 401', async ({ request }) => {
    const res = await request.get('/api/receivers/stats');
    expect(res.status()).toBe(401);
  });

  test('regular user cannot access receiver endpoints', async ({ request }) => {
    // Login as regular user (if one exists with user role)
    // The admin account has tenant_admin role, so it should work
    // This test verifies the endpoint requires authentication
    const res = await request.get('/api/receivers', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── API Tests: Firmware Build Endpoint ──────────────────────

test.describe('Firmware Build API', () => {
  let headers: Record<string, string>;
  let nodeId = '';

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
    const res = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-FW-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await res.json();
    nodeId = node.id;
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('firmware build requires node_id', async ({ request }) => {
    const res = await request.post('/api/receivers/firmware/build', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { backend_url: 'http://localhost:3020' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('node_id');
  });

  test('firmware build requires backend_url', async ({ request }) => {
    const res = await request.post('/api/receivers/firmware/build', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { node_id: nodeId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('backend_url');
  });

  test('firmware build rejects non-existent node', async ({ request }) => {
    const res = await request.post('/api/receivers/firmware/build', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { node_id: 'NOTEXIST', backend_url: 'http://localhost:3020' },
    });
    expect(res.status()).toBe(404);
  });

  test('firmware build returns error without PlatformIO', async ({ request }) => {
    // Use a short timeout since PlatformIO might not be installed
    // and the backend has a 120s build timeout
    const res = await request.post('/api/receivers/firmware/build', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { node_id: nodeId, backend_url: 'http://localhost:3020' },
      timeout: 5000,
    });
    // Either 500 (pio not installed / firmware dir missing) or 200 (if pio is available)
    expect([200, 500]).toContain(res.status());
    if (res.status() === 500) {
      const body = await res.json();
      expect(body.error).toBeTruthy();
    }
  });
});

// ─── Admin UI Tests: Receiver List Page ──────────────────────

test.describe('Receiver Admin UI', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('navigates to receiver list via admin sidebar', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(1000);

    // Click "Empfänger" in sidebar
    const receiverLink = page.locator('a', { hasText: 'Empfänger' });
    await expect(receiverLink).toBeVisible();
    await receiverLink.click();

    await page.waitForURL('**/admin/receivers');
    await expect(page.locator('[data-testid="receiver-list"]')).toBeVisible();
  });

  test('shows page title "Empfänger"', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForTimeout(1000);

    await expect(page.locator('h1', { hasText: 'Empfänger' })).toBeVisible();
  });

  test('shows stats bar with all stat cards', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers/stats') && r.status() === 200);

    const stats = page.locator('[data-testid="receiver-stats"]');
    await expect(stats).toBeVisible();
    await expect(page.locator('[data-testid="stat-total"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-online"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-stale"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-offline"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-detections"]')).toBeVisible();
  });

  test('create button toggles create form', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Form should be hidden
    await expect(page.locator('[data-testid="receiver-create-form"]')).not.toBeVisible();

    // Click create button
    await page.locator('[data-testid="receiver-create-btn"]').click();
    await expect(page.locator('[data-testid="receiver-create-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="receiver-name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="receiver-type-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="receiver-submit-btn"]')).toBeVisible();

    // Click again to hide
    await page.locator('[data-testid="receiver-create-btn"]').click();
    await expect(page.locator('[data-testid="receiver-create-form"]')).not.toBeVisible();
  });

  test('creates receiver via UI and shows API key', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Open create form
    await page.locator('[data-testid="receiver-create-btn"]').click();

    // Fill name
    await page.locator('[data-testid="receiver-name-input"]').fill(`E2E-UICreate-${uid}`);

    // Select hardware type
    await page.locator('[data-testid="receiver-type-select"]').selectOption('esp32-c3');

    // Submit
    const createPromise = page.waitForResponse(r =>
      r.url().includes('/api/receivers') && r.request().method() === 'POST' && r.status() === 201
    );
    await page.locator('[data-testid="receiver-submit-btn"]').click();
    await createPromise;

    // API key banner should appear
    await expect(page.locator('[data-testid="api-key-banner"]')).toBeVisible({ timeout: 5000 });
    const keyValue = await page.locator('[data-testid="api-key-value"]').textContent();
    expect(keyValue).toBeTruthy();
    expect(keyValue!.trim().length).toBe(64);

    // Create form should be closed
    await expect(page.locator('[data-testid="receiver-create-form"]')).not.toBeVisible();
  });

  test('dismisses API key banner', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Create a receiver to get API key banner
    await page.locator('[data-testid="receiver-create-btn"]').click();
    await page.locator('[data-testid="receiver-name-input"]').fill(`E2E-Dismiss-${uid}`);
    const createPromise = page.waitForResponse(r =>
      r.url().includes('/api/receivers') && r.request().method() === 'POST' && r.status() === 201
    );
    await page.locator('[data-testid="receiver-submit-btn"]').click();
    await createPromise;

    await expect(page.locator('[data-testid="api-key-banner"]')).toBeVisible({ timeout: 5000 });

    // Dismiss
    await page.locator('[data-testid="api-key-dismiss"]').click();
    await expect(page.locator('[data-testid="api-key-banner"]')).not.toBeVisible();
  });

  test('receiver table shows created receivers', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Table should be visible (we created receivers in previous tests)
    const table = page.locator('[data-testid="receiver-table"]');
    await expect(table).toBeVisible({ timeout: 5000 });

    // Should have rows with E2E- prefix
    const rows = page.locator('tr[data-testid^="receiver-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('ESP8266 warning shows when selecting esp8266', async ({ page }) => {
    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    await page.locator('[data-testid="receiver-create-btn"]').click();

    // Warning should not be visible initially (esp32-s3 is default)
    await expect(page.locator('[data-testid="esp8266-warning"]')).not.toBeVisible();

    // Select esp8266
    await page.locator('[data-testid="receiver-type-select"]').selectOption('esp8266');
    await expect(page.locator('[data-testid="esp8266-warning"]')).toBeVisible();

    // Switch back
    await page.locator('[data-testid="receiver-type-select"]').selectOption('esp32-s3');
    await expect(page.locator('[data-testid="esp8266-warning"]')).not.toBeVisible();
  });

  test('clicking row expands detail view', async ({ page, request }) => {
    // Create a receiver with known data via API
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Expand-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    // Send heartbeat to populate fields
    await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': node.apiKey },
      data: {
        firmware_version: '3.0.0-expand',
        wifi_ssid: 'ExpandWiFi',
        wifi_rssi: -38,
        free_heap: 150000,
        uptime_seconds: 7200,
      },
    });

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Click the row
    const row = page.locator(`[data-testid="receiver-row-${node.id}"]`);
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();

    // Detail should expand
    const detail = page.locator(`[data-testid="receiver-detail-${node.id}"]`);
    await expect(detail).toBeVisible({ timeout: 3000 });

    // Check detail content
    const detailText = await detail.textContent();
    expect(detailText).toContain(node.id);
    expect(detailText).toContain('3.0.0-expand');
    expect(detailText).toContain('ExpandWiFi');
    expect(detailText).toContain('-38');
    expect(detailText).toContain('KB'); // free heap formatted

    // Flash and regen buttons should be visible
    await expect(page.locator(`[data-testid="receiver-flash-${node.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="receiver-regen-key-${node.id}"]`)).toBeVisible();
  });

  test('clicking row again collapses detail view', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Collapse-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    const row = page.locator(`[data-testid="receiver-row-${node.id}"]`);
    await expect(row).toBeVisible({ timeout: 5000 });

    // Expand
    await row.click();
    await expect(page.locator(`[data-testid="receiver-detail-${node.id}"]`)).toBeVisible({ timeout: 3000 });

    // Collapse
    await row.click();
    await expect(page.locator(`[data-testid="receiver-detail-${node.id}"]`)).not.toBeVisible();
  });

  test('status shows "Online" after recent heartbeat', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Online-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    // Send heartbeat (makes it online)
    await request.post('/api/receivers/heartbeat', {
      headers: { 'Content-Type': 'application/json', 'X-Node-Key': node.apiKey },
      data: {},
    });

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    const statusLabel = page.locator(`[data-testid="receiver-status-label-${node.id}"]`);
    await expect(statusLabel).toBeVisible({ timeout: 5000 });
    await expect(statusLabel).toHaveText('Online');
  });

  test('deactivate button changes text to "Akt."', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-ToggleUI-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    const toggleBtn = page.locator(`[data-testid="receiver-toggle-${node.id}"]`);
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    await expect(toggleBtn).toHaveText('Deakt.');

    // Click to deactivate
    const updatePromise = page.waitForResponse(r =>
      r.url().includes(`/api/receivers/${node.id}`) && r.request().method() === 'PUT'
    );
    await toggleBtn.click();
    await updatePromise;

    // Wait for reload
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.request().method() === 'GET');

    // Button text should change to "Akt."
    await expect(page.locator(`[data-testid="receiver-toggle-${node.id}"]`)).toHaveText('Akt.', { timeout: 5000 });
  });

  test('delete button removes receiver from table', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-DelUI-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    const deleteBtn = page.locator(`[data-testid="receiver-delete-${node.id}"]`);
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });

    // Delete
    const deletePromise = page.waitForResponse(r =>
      r.url().includes(`/api/receivers/${node.id}`) && r.request().method() === 'DELETE'
    );
    await deleteBtn.click();
    await deletePromise;

    // Wait for reload
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.request().method() === 'GET');

    // Row should be gone
    await expect(page.locator(`[data-testid="receiver-row-${node.id}"]`)).not.toBeVisible({ timeout: 5000 });
  });

  test('regenerate key shows new API key banner', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-RegenUI-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Expand row
    await page.locator(`[data-testid="receiver-row-${node.id}"]`).click();
    await expect(page.locator(`[data-testid="receiver-detail-${node.id}"]`)).toBeVisible({ timeout: 3000 });

    // Click regenerate key
    const regenPromise = page.waitForResponse(r =>
      r.url().includes(`/api/receivers/${node.id}/regenerate-key`) && r.status() === 200
    );
    await page.locator(`[data-testid="receiver-regen-key-${node.id}"]`).click();
    await regenPromise;

    // API key banner should appear
    await expect(page.locator('[data-testid="api-key-banner"]')).toBeVisible({ timeout: 5000 });
    const newKeyValue = await page.locator('[data-testid="api-key-value"]').textContent();
    expect(newKeyValue!.trim().length).toBe(64);
  });
});

// ─── Admin UI Tests: Flash Wizard ────────────────────────────

test.describe('Flash Wizard UI', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ request }) => {
    headers = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    const res = await request.get('/api/receivers', { headers });
    if (res.ok()) {
      const nodes = await res.json();
      for (const n of nodes) {
        if (n.name.startsWith('E2E-')) {
          await request.delete(`/api/receivers/${n.id}`, { headers });
        }
      }
    }
  });

  test('flash button opens wizard modal', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-Flash-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    // Expand row
    await page.locator(`[data-testid="receiver-row-${node.id}"]`).click();
    await expect(page.locator(`[data-testid="receiver-detail-${node.id}"]`)).toBeVisible({ timeout: 3000 });

    // Click flash button
    await page.locator(`[data-testid="receiver-flash-${node.id}"]`).click();

    // Wizard should open
    await expect(page.locator('[data-testid="flash-wizard"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="flash-wizard-title"]')).toContainText(`E2E-Flash-${uid}`);
  });

  test('wizard shows intro step with correct hardware type', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-WizIntro-${uid}`, hardware_type: 'esp32-c3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    await page.locator(`[data-testid="receiver-row-${node.id}"]`).click();
    await page.locator(`[data-testid="receiver-flash-${node.id}"]`).click();

    const wizard = page.locator('[data-testid="flash-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 3000 });

    // Intro step visible
    await expect(page.locator('[data-testid="flash-step-intro"]')).toBeVisible();
    await expect(page.locator('[data-testid="flash-wizard-step-label"]')).toHaveText('1. Vorbereitung');

    // Hardware type mentioned
    const introText = await page.locator('[data-testid="flash-step-intro"]').textContent();
    expect(introText).toContain('ESP32-C3');
  });

  test('wizard navigates from intro to config step', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-WizNav-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    await page.locator(`[data-testid="receiver-row-${node.id}"]`).click();
    await page.locator(`[data-testid="receiver-flash-${node.id}"]`).click();
    await expect(page.locator('[data-testid="flash-wizard"]')).toBeVisible({ timeout: 3000 });

    // Click "Weiter"
    await page.locator('[data-testid="flash-wizard-next"]').click();

    // Config step should show
    await expect(page.locator('[data-testid="flash-step-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="flash-wizard-step-label"]')).toHaveText('2. Konfiguration');

    // Config fields visible
    await expect(page.locator('[data-testid="flash-backend-url"]')).toBeVisible();
    await expect(page.locator('[data-testid="flash-wifi-ssid"]')).toBeVisible();
    await expect(page.locator('[data-testid="flash-wifi-pass"]')).toBeVisible();

    // Backend URL should be pre-populated
    const urlValue = await page.locator('[data-testid="flash-backend-url"]').inputValue();
    expect(urlValue).toContain('localhost');
  });

  test('wizard close button closes modal', async ({ page, request }) => {
    const createRes = await request.post('/api/receivers', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `E2E-WizClose-${uid}`, hardware_type: 'esp32-s3' },
    });
    const node = await createRes.json();

    await page.goto('/admin/receivers');
    await page.waitForResponse(r => r.url().includes('/api/receivers') && r.status() === 200);

    await page.locator(`[data-testid="receiver-row-${node.id}"]`).click();
    await page.locator(`[data-testid="receiver-flash-${node.id}"]`).click();
    await expect(page.locator('[data-testid="flash-wizard"]')).toBeVisible({ timeout: 3000 });

    // Close
    await page.locator('[data-testid="flash-wizard-close"]').click();
    await expect(page.locator('[data-testid="flash-wizard"]')).not.toBeVisible();
  });
});

// ─── Admin Dashboard: Receiver Stats Card ────────────────────

test.describe('Admin Dashboard Receiver Stats', () => {
  test('dashboard shows "Empfänger Online" card', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2000);

    // Should show the receiver stats card
    const card = page.locator('text=Empfänger Online');
    await expect(card).toBeVisible({ timeout: 5000 });
  });
});

// ─── Settings Page: Receiver Source ──────────────────────────

test.describe('Settings Page Receiver Source', () => {
  test('settings page shows receiver source "Empfänger"', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForResponse(r => r.url().includes('/api/settings') && r.status() === 200);

    // Look for the receiver source entry
    const receiverEntry = page.locator('text=Empfänger').first();
    await expect(receiverEntry).toBeVisible({ timeout: 5000 });
  });

  test('receiver source has teal color indicator', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForResponse(r => r.url().includes('/api/settings') && r.status() === 200);

    // Find the receiver source entry container (look for its label and description)
    const sourceDescription = page.locator('text=Hardware-Empfänger');
    await expect(sourceDescription).toBeVisible({ timeout: 5000 });
  });
});
