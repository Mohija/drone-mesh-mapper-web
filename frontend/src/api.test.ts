import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDrones, fetchDrone, fetchDroneHistory, setFleetCenter, checkNoFlyWms, fetchNoFlyInfo, fetchFlightZones, createFlightZone, updateFlightZone, deleteFlightZone, assignDronesToZone, unassignDronesFromZone, checkZoneViolations } from './api';
import { createMockDrone, createMockDronesResponse, createMockHistory, createMockFlightZone, createMockZoneViolation } from './test/mocks';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

/** Get the URL from the first fetch call. */
function calledUrl(callIndex = 0): string {
  return mockFetch.mock.calls[callIndex][0] as string;
}

/** Get the init object from a fetch call. */
function calledInit(callIndex = 0): RequestInit | undefined {
  return mockFetch.mock.calls[callIndex][1] as RequestInit | undefined;
}

describe('fetchDrones', () => {
  it('fetches all drones without params', async () => {
    const mockData = createMockDronesResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchDrones();
    expect(calledUrl()).toBe('/api/drones');
    expect(result).toEqual(mockData);
  });

  it('includes location params when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(createMockDronesResponse()),
    });

    await fetchDrones(50.0, 8.0, 5000);
    const url = calledUrl();
    expect(url).toContain('lat=50');
    expect(url).toContain('lon=8');
    expect(url).toContain('radius=5000');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchDrones()).rejects.toThrow('API error: 500');
  });
});

describe('fetchDrone', () => {
  it('fetches a single drone', async () => {
    const mockDrone = createMockDrone();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDrone),
    });

    const result = await fetchDrone('TEST001');
    expect(calledUrl()).toBe('/api/drones/TEST001');
    expect(result).toEqual(mockDrone);
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchDrone('NOTFOUND')).rejects.toThrow('API error: 404');
  });
});

describe('fetchDroneHistory', () => {
  it('fetches drone history', async () => {
    const history = createMockHistory();
    const mockData = { drone_id: 'TEST001', history };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchDroneHistory('TEST001');
    expect(calledUrl()).toBe('/api/drones/TEST001/history');
    expect(result.history).toHaveLength(5);
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchDroneHistory('NOTFOUND')).rejects.toThrow();
  });
});

describe('setFleetCenter', () => {
  it('posts new center coordinates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await setFleetCenter(48.0, 11.0);
    expect(calledUrl()).toBe('/api/fleet/center');
    const init = calledInit();
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ lat: 48.0, lon: 11.0 });
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(setFleetCenter(48.0, 11.0)).rejects.toThrow();
  });
});

describe('checkNoFlyWms', () => {
  it('fetches WMS check endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ available: true, status_code: 200, wms_url: 'https://test.de/wms' }),
    });

    const result = await checkNoFlyWms();
    expect(calledUrl()).toBe('/api/nofly/check');
    expect(result.available).toBe(true);
    expect(result.status_code).toBe(200);
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(checkNoFlyWms()).rejects.toThrow('API error: 500');
  });
});

describe('fetchNoFlyInfo', () => {
  it('fetches feature info with correct params', async () => {
    const mockData = { type: 'FeatureCollection', features: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchNoFlyInfo(52.0, 8.0, 'dipul:flughaefen');
    const url = calledUrl();
    expect(url).toContain('/api/nofly/info');
    expect(url).toContain('lat=52');
    expect(url).toContain('lon=8');
    expect(url).toContain('layers=dipul');
    expect(result.type).toBe('FeatureCollection');
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(fetchNoFlyInfo(52.0, 8.0, 'dipul:flughaefen')).rejects.toThrow('API error: 502');
  });
});

// ─── Flight Zones API Tests ──────────────────────────────

describe('fetchFlightZones', () => {
  it('fetches zones list', async () => {
    const zones = [createMockFlightZone()];
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(zones) });
    const result = await fetchFlightZones();
    expect(calledUrl()).toBe('/api/zones');
    expect(result).toEqual(zones);
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchFlightZones()).rejects.toThrow('API error: 500');
  });
});

describe('createFlightZone', () => {
  it('posts zone data', async () => {
    const zone = createMockFlightZone();
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(zone) });
    const result = await createFlightZone({ name: 'Test', color: '#ff0000', polygon: [[0, 0], [0, 1], [1, 1]] });
    expect(calledUrl()).toBe('/api/zones');
    expect(calledInit()?.method).toBe('POST');
    expect(result.id).toBe('zone001');
  });

  it('throws on validation error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(createFlightZone({ name: '', color: '#ff0000', polygon: [] })).rejects.toThrow('API error: 400');
  });
});

describe('updateFlightZone', () => {
  it('sends PUT with updates', async () => {
    const zone = createMockFlightZone({ name: 'Updated' });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(zone) });
    const result = await updateFlightZone('zone001', { name: 'Updated' });
    expect(calledUrl()).toBe('/api/zones/zone001');
    expect(calledInit()?.method).toBe('PUT');
    expect(result.name).toBe('Updated');
  });
});

describe('deleteFlightZone', () => {
  it('sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await deleteFlightZone('zone001');
    expect(calledUrl()).toBe('/api/zones/zone001');
    expect(calledInit()?.method).toBe('DELETE');
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(deleteFlightZone('nonexistent')).rejects.toThrow('API error: 404');
  });
});

describe('assignDronesToZone', () => {
  it('posts drone IDs', async () => {
    const zone = createMockFlightZone({ assignedDrones: ['D1', 'D2'] });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(zone) });
    const result = await assignDronesToZone('zone001', ['D1', 'D2']);
    expect(calledUrl()).toBe('/api/zones/zone001/assign');
    expect(result.assignedDrones).toEqual(['D1', 'D2']);
  });
});

describe('unassignDronesFromZone', () => {
  it('posts drone IDs to unassign', async () => {
    const zone = createMockFlightZone({ assignedDrones: ['D2'] });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(zone) });
    const result = await unassignDronesFromZone('zone001', ['D1']);
    expect(calledUrl()).toBe('/api/zones/zone001/unassign');
    expect(result.assignedDrones).toEqual(['D2']);
  });
});

describe('checkZoneViolations', () => {
  it('fetches violations', async () => {
    const data = { violations: [createMockZoneViolation()], count: 1 };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
    const result = await checkZoneViolations();
    expect(calledUrl()).toBe('/api/zones/violations');
    expect(result.count).toBe(1);
    expect(result.violations[0].droneId).toBe('TEST001');
  });
});
