import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers';

let authHeaders: Record<string, string>;

test.describe('API Endpoints', () => {
  test.beforeAll(async ({ request }) => {
    authHeaders = await apiLogin(request);
  });

  test('health check returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('GET /api/drones returns all drones', async ({ request }) => {
    const res = await request.get('/api/drones', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.count).toBeGreaterThanOrEqual(5);
    expect(data.drones.length).toBe(data.count);
    expect(data.center).toHaveProperty('lat');
    expect(data.center).toHaveProperty('lon');
    expect(data).toHaveProperty('sources');
  });

  test('GET /api/drones with radius filter', async ({ request }) => {
    const res = await request.get('/api/drones?lat=52.0302&lon=8.5325&radius=50000', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.count).toBeGreaterThanOrEqual(5);
  });

  test('GET /api/drones with radius=0 returns all drones', async ({ request }) => {
    // radius=0 disables filter - should return all drones even far from center
    const res = await request.get('/api/drones?lat=0&lon=0&radius=0', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.count).toBeGreaterThanOrEqual(5);
  });

  test('GET /api/drones radius toggle sequence', async ({ request }) => {
    // 1. Small radius far from fleet → 0 drones
    const res1 = await request.get('/api/drones?lat=0&lon=0&radius=1', { headers: authHeaders });
    const data1 = await res1.json();
    expect(data1.count).toBe(0);

    // 2. Disable radius (0) → all drones
    const res2 = await request.get('/api/drones?lat=0&lon=0&radius=0', { headers: authHeaders });
    const data2 = await res2.json();
    expect(data2.count).toBeGreaterThanOrEqual(5);

    // 3. Re-enable small radius → 0 drones again (cache must not interfere)
    const res3 = await request.get('/api/drones?lat=0&lon=0&radius=1', { headers: authHeaders });
    const data3 = await res3.json();
    expect(data3.count).toBe(0);
  });

  test('GET /api/settings returns source configuration', async ({ request }) => {
    const res = await request.get('/api/settings', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('sources');
    expect(data.sources).toHaveProperty('simulator');
    expect(data.sources.simulator).toHaveProperty('enabled');
    expect(data.sources.simulator).toHaveProperty('label');
  });

  test('POST /api/settings toggles source', async ({ request }) => {
    // Get current settings
    const before = await (await request.get('/api/settings', { headers: authHeaders })).json();
    const wasEnabled = before.sources.simulator.enabled;

    // Toggle simulator
    const res = await request.post('/api/settings', {
      headers: authHeaders,
      data: { sources: { simulator: { enabled: !wasEnabled } } },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.sources.simulator.enabled).toBe(!wasEnabled);

    // Restore original
    await request.post('/api/settings', {
      headers: authHeaders,
      data: { sources: { simulator: { enabled: wasEnabled } } },
    });
  });

  test('GET /api/drones/<id> returns single drone', async ({ request }) => {
    const res = await request.get('/api/drones/AZTEST001', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Desert Eagle');
    expect(data.id).toBe('AZTEST001');
    expect(data).toHaveProperty('latitude');
    expect(data).toHaveProperty('longitude');
    expect(data).toHaveProperty('battery');
    expect(data).toHaveProperty('faa_data');
  });

  test('GET /api/drones/<id> 404 for unknown', async ({ request }) => {
    const res = await request.get('/api/drones/NONEXISTENT', { headers: authHeaders });
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Drone not found');
  });

  test('GET /api/drones/<id>/history returns history', async ({ request }) => {
    const res = await request.get('/api/drones/AZTEST001/history', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.drone_id).toBe('AZTEST001');
    expect(Array.isArray(data.history)).toBe(true);
  });

  test('GET /api/drones/<id>/history 404 for unknown', async ({ request }) => {
    const res = await request.get('/api/drones/NONEXISTENT/history', { headers: authHeaders });
    expect(res.status()).toBe(404);
  });

  test('POST /api/fleet/center recenters fleet', async ({ request }) => {
    const res = await request.post('/api/fleet/center', {
      headers: authHeaders,
      data: { lat: 48.1351, lon: 11.5820 },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.center.lat).toBe(48.1351);
    expect(data.center.lon).toBe(11.5820);

    // Verify center updated
    const dronesRes = await request.get('/api/drones', { headers: authHeaders });
    const dronesData = await dronesRes.json();
    expect(dronesData.center.lat).toBe(48.1351);

    // Reset center back
    await request.post('/api/fleet/center', {
      headers: authHeaders,
      data: { lat: 52.0302, lon: 8.5325 },
    });
  });

  test('POST /api/fleet/center 400 without lat/lon', async ({ request }) => {
    const res = await request.post('/api/fleet/center', {
      headers: authHeaders,
      data: { lat: 48.0 },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/status returns simulation status', async ({ request }) => {
    const res = await request.get('/api/status', { headers: authHeaders });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.running).toBe(true);
    expect(data.drone_count).toBe(5);
    expect(data.center).toHaveProperty('lat');
    expect(data.center).toHaveProperty('lon');
  });

  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get('/api/drones');
    expect(res.status()).toBe(401);
  });
});
