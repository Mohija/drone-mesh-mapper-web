import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('health check returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('GET /api/drones returns all drones', async ({ request }) => {
    const res = await request.get('/api/drones');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(5);
    expect(data.drones).toHaveLength(5);
    expect(data.center).toHaveProperty('lat');
    expect(data.center).toHaveProperty('lon');
  });

  test('GET /api/drones with radius filter', async ({ request }) => {
    const res = await request.get('/api/drones?lat=50.1109&lon=8.6821&radius=50000');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(5);
    // Filtered results should have distance field
    for (const drone of data.drones) {
      expect(drone).toHaveProperty('distance');
    }
  });

  test('GET /api/drones/<id> returns single drone', async ({ request }) => {
    const res = await request.get('/api/drones/AZTEST001');
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
    const res = await request.get('/api/drones/NONEXISTENT');
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Drone not found');
  });

  test('GET /api/drones/<id>/history returns history', async ({ request }) => {
    const res = await request.get('/api/drones/AZTEST001/history');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.drone_id).toBe('AZTEST001');
    expect(Array.isArray(data.history)).toBe(true);
  });

  test('GET /api/drones/<id>/history 404 for unknown', async ({ request }) => {
    const res = await request.get('/api/drones/NONEXISTENT/history');
    expect(res.status()).toBe(404);
  });

  test('POST /api/fleet/center recenters fleet', async ({ request }) => {
    const res = await request.post('/api/fleet/center', {
      data: { lat: 48.1351, lon: 11.5820 },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.center.lat).toBe(48.1351);
    expect(data.center.lon).toBe(11.5820);

    // Verify center updated
    const dronesRes = await request.get('/api/drones');
    const dronesData = await dronesRes.json();
    expect(dronesData.center.lat).toBe(48.1351);

    // Reset center back
    await request.post('/api/fleet/center', {
      data: { lat: 50.1109, lon: 8.6821 },
    });
  });

  test('POST /api/fleet/center 400 without lat/lon', async ({ request }) => {
    const res = await request.post('/api/fleet/center', {
      data: { lat: 48.0 },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/status returns simulation status', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.running).toBe(true);
    expect(data.drone_count).toBe(5);
    expect(data.center).toHaveProperty('lat');
    expect(data.center).toHaveProperty('lon');
  });
});
