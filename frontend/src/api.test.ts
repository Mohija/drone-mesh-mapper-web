import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDrones, fetchDrone, fetchDroneHistory, setFleetCenter, checkNoFlyWms, fetchNoFlyInfo } from './api';
import { createMockDrone, createMockDronesResponse, createMockHistory } from './test/mocks';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchDrones', () => {
  it('fetches all drones without params', async () => {
    const mockData = createMockDronesResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchDrones();
    expect(mockFetch).toHaveBeenCalledWith('/api/drones');
    expect(result).toEqual(mockData);
  });

  it('includes location params when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(createMockDronesResponse()),
    });

    await fetchDrones(50.0, 8.0, 5000);
    const url = mockFetch.mock.calls[0][0] as string;
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
      json: () => Promise.resolve(mockDrone),
    });

    const result = await fetchDrone('TEST001');
    expect(mockFetch).toHaveBeenCalledWith('/api/drones/TEST001');
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
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchDroneHistory('TEST001');
    expect(mockFetch).toHaveBeenCalledWith('/api/drones/TEST001/history');
    expect(result.history).toHaveLength(5);
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchDroneHistory('NOTFOUND')).rejects.toThrow();
  });
});

describe('setFleetCenter', () => {
  it('posts new center coordinates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await setFleetCenter(48.0, 11.0);
    expect(mockFetch).toHaveBeenCalledWith('/api/fleet/center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 48.0, lon: 11.0 }),
    });
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
      json: () => Promise.resolve({ available: true, status_code: 200, wms_url: 'https://test.de/wms' }),
    });

    const result = await checkNoFlyWms();
    expect(mockFetch).toHaveBeenCalledWith('/api/nofly/check');
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
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchNoFlyInfo(52.0, 8.0, 'dipul:flughaefen');
    const url = mockFetch.mock.calls[0][0] as string;
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
