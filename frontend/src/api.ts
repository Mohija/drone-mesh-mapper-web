import type { DronesResponse, Drone, DroneHistoryEntry, DataSourceSettings, AircraftLookup, ArchivedTrailSummary, ArchivedTrail, TrailPoint, FlightZone, ZoneViolation } from './types/drone';

function getApiBase(): string {
  const path = window.location.pathname;
  const match = path.match(/^(\/api\/live\/[^/]+)/);
  return match ? `${match[1]}/api` : '/api';
}

const API_BASE = getApiBase();

export async function fetchDrones(
  lat?: number,
  lon?: number,
  radius?: number
): Promise<DronesResponse> {
  const params = new URLSearchParams();
  if (lat !== undefined) params.set('lat', String(lat));
  if (lon !== undefined) params.set('lon', String(lon));
  if (radius !== undefined) params.set('radius', String(radius));

  const query = params.toString();
  const url = `${API_BASE}/drones${query ? `?${query}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDrone(droneId: string): Promise<Drone> {
  const res = await fetch(`${API_BASE}/drones/${encodeURIComponent(droneId)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDroneHistory(
  droneId: string
): Promise<{ drone_id: string; history: DroneHistoryEntry[] }> {
  const res = await fetch(`${API_BASE}/drones/${encodeURIComponent(droneId)}/history`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function setFleetCenter(lat: number, lon: number): Promise<void> {
  const res = await fetch(`${API_BASE}/fleet/center`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function fetchSettings(): Promise<DataSourceSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateSettings(settings: Partial<DataSourceSettings>): Promise<DataSourceSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function lookupAircraft(
  identifier: string,
  callsign?: string,
  icaoHex?: string,
): Promise<AircraftLookup> {
  const params = new URLSearchParams();
  if (callsign) params.set('callsign', callsign);
  if (icaoHex) params.set('icao_hex', icaoHex);
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/aircraft/lookup/${encodeURIComponent(identifier)}${query ? `?${query}` : ''}`,
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface NoFlyCheckResult {
  available: boolean;
  status_code?: number;
  wms_url?: string;
  error?: string;
}

export async function checkNoFlyWms(): Promise<NoFlyCheckResult> {
  const res = await fetch(`${API_BASE}/nofly/check`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface NoFlyFeatureInfo {
  type?: string;
  features?: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry?: unknown;
  }>;
  error?: string;
}

export async function fetchNoFlyInfo(
  lat: number,
  lon: number,
  layers: string
): Promise<NoFlyFeatureInfo> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    layers,
  });
  const res = await fetch(`${API_BASE}/nofly/info?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Terrain Elevation API (direct Open-Meteo, no backend proxy) ──

const _elevationCache = new Map<string, number>();

function _elevKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}`;
}

export function getCachedElevation(lat: number, lon: number): number | null {
  return _elevationCache.get(_elevKey(lat, lon)) ?? null;
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const key = _elevKey(lat, lon);
  const cached = _elevationCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const elev = Array.isArray(data.elevation) ? data.elevation[0] : data.elevation;
    if (elev != null) _elevationCache.set(key, elev);
    return elev ?? null;
  } catch {
    return null;
  }
}

/** Batch-fetch elevations for multiple coordinates. Skips already-cached ones. */
export async function fetchElevationBatch(
  coords: Array<{ lat: number; lon: number }>,
): Promise<void> {
  const uncached = coords.filter(c => !_elevationCache.has(_elevKey(c.lat, c.lon)));
  if (uncached.length === 0) return;

  // Deduplicate by key
  const seen = new Set<string>();
  const unique = uncached.filter(c => {
    const k = _elevKey(c.lat, c.lon);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length === 0) return;

  // Open-Meteo supports batch: comma-separated lat/lon
  const lats = unique.map(c => c.lat.toFixed(4)).join(',');
  const lons = unique.map(c => c.lon.toFixed(4)).join(',');

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    const elevations: number[] = Array.isArray(data.elevation) ? data.elevation : [data.elevation];
    for (let i = 0; i < unique.length && i < elevations.length; i++) {
      if (elevations[i] != null) {
        _elevationCache.set(_elevKey(unique[i].lat, unique[i].lon), elevations[i]);
      }
    }
  } catch {
    // Silent fail — elevation is supplementary data
  }
}

// ─── Trail Archive API ──────────────────────────────────────

export async function fetchArchivedTrails(): Promise<ArchivedTrailSummary[]> {
  const res = await fetch(`${API_BASE}/trails/archives`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchArchivedTrail(id: string): Promise<ArchivedTrail> {
  const res = await fetch(`${API_BASE}/trails/archives/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function saveArchivedTrail(data: {
  droneId: string;
  droneName: string;
  source?: string;
  color: string;
  trail: TrailPoint[];
  startedAt: number;
}): Promise<ArchivedTrail> {
  const res = await fetch(`${API_BASE}/trails/archives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteArchivedTrail(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/trails/archives/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ─── Flight Zones API ────────────────────────────────────────

export async function fetchFlightZones(): Promise<FlightZone[]> {
  const res = await fetch(`${API_BASE}/zones`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createFlightZone(data: {
  name: string;
  color: string;
  polygon: [number, number][];
  minAltitudeAGL?: number | null;
  maxAltitudeAGL?: number | null;
}): Promise<FlightZone> {
  const res = await fetch(`${API_BASE}/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateFlightZone(
  id: string,
  data: Partial<Pick<FlightZone, 'name' | 'color' | 'polygon' | 'minAltitudeAGL' | 'maxAltitudeAGL'>>,
): Promise<FlightZone> {
  const res = await fetch(`${API_BASE}/zones/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteFlightZone(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/zones/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function assignDronesToZone(zoneId: string, droneIds: string[]): Promise<FlightZone> {
  const res = await fetch(`${API_BASE}/zones/${encodeURIComponent(zoneId)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ droneIds }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function unassignDronesFromZone(zoneId: string, droneIds: string[]): Promise<FlightZone> {
  const res = await fetch(`${API_BASE}/zones/${encodeURIComponent(zoneId)}/unassign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ droneIds }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function checkZoneViolations(): Promise<{ violations: ZoneViolation[]; count: number }> {
  const res = await fetch(`${API_BASE}/zones/violations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
