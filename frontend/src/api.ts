import type { DronesResponse, Drone, DroneHistoryEntry, DataSourceSettings, AircraftLookup, ArchivedTrailSummary, ArchivedTrail, TrailPoint, FlightZone, ZoneViolation } from './types/drone';
import type { User, LoginResponse } from './types/auth';

function getApiBase(): string {
  const path = window.location.pathname;
  const match = path.match(/^(\/api\/live\/[^/]+)/);
  return match ? `${match[1]}/api` : '/api';
}

const API_BASE = getApiBase();

// ─── Auth Utilities ───────────────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

async function _doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch wrapper.
 * Adds Authorization header, handles 401 with token refresh + retry.
 * Dispatches 'auth:logout' event if refresh fails.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('access_token');
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    // Try refresh (singleton to prevent parallel refresh storms)
    if (!_refreshPromise) {
      _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
    }
    const newToken = await _refreshPromise;
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(input, { ...init, headers });
    } else {
      // Refresh failed — force logout
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.dispatchEvent(new Event('auth:logout'));
    }
  }

  return res;
}

// ─── Auth API ─────────────────────────────────────────────

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login fehlgeschlagen' }));
    throw new Error(data.error || `Login fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

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
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDrone(droneId: string): Promise<Drone> {
  const res = await authFetch(`${API_BASE}/drones/${encodeURIComponent(droneId)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDroneHistory(
  droneId: string
): Promise<{ drone_id: string; history: DroneHistoryEntry[] }> {
  const res = await authFetch(`${API_BASE}/drones/${encodeURIComponent(droneId)}/history`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function setFleetCenter(lat: number, lon: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/fleet/center`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function fetchSettings(): Promise<DataSourceSettings> {
  const res = await authFetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateSettings(settings: Partial<DataSourceSettings>): Promise<DataSourceSettings> {
  const res = await authFetch(`${API_BASE}/settings`, {
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
  const res = await authFetch(
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
  const res = await authFetch(`${API_BASE}/nofly/check`);
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
  const res = await authFetch(`${API_BASE}/nofly/info?${params}`);
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
  const res = await authFetch(`${API_BASE}/trails/archives`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchArchivedTrail(id: string): Promise<ArchivedTrail> {
  const res = await authFetch(`${API_BASE}/trails/archives/${encodeURIComponent(id)}`);
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
  const res = await authFetch(`${API_BASE}/trails/archives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteArchivedTrail(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/trails/archives/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ─── Flight Zones API ────────────────────────────────────────

export async function fetchFlightZones(): Promise<FlightZone[]> {
  const res = await authFetch(`${API_BASE}/zones`);
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
  const res = await authFetch(`${API_BASE}/zones`, {
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
  const res = await authFetch(`${API_BASE}/zones/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteFlightZone(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/zones/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function assignDronesToZone(zoneId: string, droneIds: string[]): Promise<FlightZone> {
  const res = await authFetch(`${API_BASE}/zones/${encodeURIComponent(zoneId)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ droneIds }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function unassignDronesFromZone(zoneId: string, droneIds: string[]): Promise<FlightZone> {
  const res = await authFetch(`${API_BASE}/zones/${encodeURIComponent(zoneId)}/unassign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ droneIds }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function checkZoneViolations(): Promise<{ violations: ZoneViolation[]; count: number }> {
  const res = await authFetch(`${API_BASE}/zones/violations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Shared Violation Records API ──────────────────────────

export interface ServerViolationRecord {
  id: string;
  droneId: string;
  droneName: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  startTime: number;
  endTime: number | null;
}

export async function fetchViolations(): Promise<{ records: ServerViolationRecord[]; count: number }> {
  const res = await authFetch(`${API_BASE}/violations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteViolationRecord(recordId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/violations/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function clearViolationRecords(): Promise<void> {
  const res = await authFetch(`${API_BASE}/violations`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ─── Admin API ────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean;
  user_count?: number;
  zone_count?: number;
  created_at: string;
}

export interface UserAdmin extends User {
  last_login: number | null;
  created_at: string;
}

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await authFetch(`${API_BASE}/admin/tenants`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createTenant(data: { name: string; display_name: string }): Promise<Tenant> {
  const res = await authFetch(`${API_BASE}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fehler' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function updateTenant(id: string, data: { display_name?: string; is_active?: boolean }): Promise<Tenant> {
  const res = await authFetch(`${API_BASE}/admin/tenants/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteTenant(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/tenants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function fetchUsers(tenantId?: string): Promise<UserAdmin[]> {
  const params = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await authFetch(`${API_BASE}/admin/users${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  display_name: string;
  role: string;
  tenant_id: string;
}): Promise<UserAdmin> {
  const res = await authFetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fehler' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function updateUser(id: string, data: {
  display_name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}): Promise<UserAdmin> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
