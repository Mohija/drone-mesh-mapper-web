import type { DronesResponse, Drone, DroneHistoryEntry, DataSourceSettings, AircraftLookup, ArchivedTrailSummary, ArchivedTrail, TrailPoint, FlightZone, ZoneViolation } from './types/drone';
import type { User, LoginResponse, TenantInfo } from './types/auth';

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

/** Public: fetch all active tenants for the login form dropdown. */
export async function fetchLoginTenants(): Promise<TenantInfo[]> {
  const res = await fetch(`${API_BASE}/auth/tenants`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function login(username: string, password: string, tenantId?: string): Promise<LoginResponse> {
  const body: Record<string, string> = { username, password };
  if (tenantId) body.tenant_id = tenantId;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login fehlgeschlagen' }));
    throw new Error(data.error || `Login fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

export async function switchTenant(tenantId: string): Promise<LoginResponse> {
  const res = await authFetch(`${API_BASE}/auth/switch-tenant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Mandantenwechsel fehlgeschlagen' }));
    throw new Error(data.error || `Fehler (${res.status})`);
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

export async function restartSimulation(): Promise<{ status: string; drone_count: number }> {
  const res = await authFetch(`${API_BASE}/simulation/restart`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error: ${res.status}`);
  }
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

export async function createMissionZone(data: {
  name: string;
  lat?: number;
  lon?: number;
  address?: string;
}): Promise<FlightZone & { resolved_address?: string }> {
  const res = await authFetch(`${API_BASE}/zones/mission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

export async function forwardGeocode(query: string): Promise<GeocodeResult | null> {
  try {
    const res = await authFetch(`${API_BASE}/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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
  zonePolygon: [number, number][] | null;
  startTime: number;
  endTime: number | null;
  trailPointCount: number;
  comments: string | null;
}

export interface ViolationTrailPoint {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  battery: number | null;
  signal: number | null;
  heading: number | null;
  pilot_lat: number | null;
  pilot_lon: number | null;
  ts: number;
}

export interface ViolationDetail extends ServerViolationRecord {
  trailData: ViolationTrailPoint[];
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

export async function fetchViolationDetail(recordId: string): Promise<ViolationDetail> {
  const res = await authFetch(`${API_BASE}/violations/${encodeURIComponent(recordId)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateViolationComments(recordId: string, comments: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/violations/${encodeURIComponent(recordId)}/comments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ─── Reverse Geocoding (Nominatim) ────────────────────────

const _geocodeCache = new Map<string, string>();
let _lastGeocodeTime = 0;

function _geocodeKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)}_${lon.toFixed(5)}`;
}

export function getCachedAddress(lat: number, lon: number): string | null {
  return _geocodeCache.get(_geocodeKey(lat, lon)) ?? null;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = _geocodeKey(lat, lon);
  const cached = _geocodeCache.get(key);
  if (cached !== undefined) return cached;

  // Nominatim rate limit: max 1 request per second
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - _lastGeocodeTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastGeocodeTime = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&format=json&addressdetails=1&zoom=18`,
      { headers: { 'User-Agent': 'FlightArc/1.4 (drone monitoring)' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) { _geocodeCache.set(key, ''); return null; }

    // Build concise address: street + number, city
    const parts: string[] = [];
    const street = addr.road || addr.pedestrian || addr.footway || addr.path || '';
    if (street) {
      parts.push(addr.house_number ? `${street} ${addr.house_number}` : street);
    }
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    if (city) parts.push(city);
    if (!parts.length && addr.suburb) parts.push(addr.suburb);
    const result = parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || '';
    _geocodeCache.set(key, result);
    return result || null;
  } catch {
    return null;
  }
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

// ─── Receiver API ─────────────────────────────────────────

export interface ReceiverNode {
  id: string;
  tenantId: string;
  name: string;
  hardwareType: 'esp32-s3' | 'esp32-c3' | 'esp8266';
  apiKey?: string;
  firmwareVersion: string | null;
  isActive: boolean;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAccuracy: number | null;
  lastHeartbeat: number | null;
  lastIp: string | null;
  wifiSsid: string | null;
  wifiRssi: number | null;
  freeHeap: number | null;
  uptimeSeconds: number | null;
  totalDetections: number;
  detectionsSinceBoot: number;
  status: 'online' | 'stale' | 'offline';
  createdAt: number;
  updatedAt: number;
  lastBuildAt: number | null;
  lastBuildSize: number | null;
  lastBuildSha256: string | null;
  lastBuildVersion: string | null;
  lastBuildMergedSize: number | null;
  otaUpdatePending: boolean;
  otaLastAttempt: number | null;
  otaLastResult: string | null;
}

export interface ReceiverStats {
  total: number;
  online: number;
  stale: number;
  offline: number;
  totalDetections: number;
}

export async function fetchReceivers(): Promise<ReceiverNode[]> {
  const res = await authFetch(`${API_BASE}/receivers`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createReceiver(data: { name: string; hardware_type: string }): Promise<ReceiverNode> {
  const res = await authFetch(`${API_BASE}/receivers`, {
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

export async function updateReceiver(id: string, data: { name?: string; is_active?: boolean }): Promise<ReceiverNode> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteReceiver(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function setReceiverLocation(id: string, latitude: number, longitude: number, accuracy?: number): Promise<ReceiverNode> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(id)}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, accuracy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Standort setzen fehlgeschlagen' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function regenerateReceiverKey(id: string): Promise<ReceiverNode> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(id)}/regenerate-key`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchReceiverStats(): Promise<ReceiverStats> {
  const res = await authFetch(`${API_BASE}/receivers/stats`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface FirmwareCheck {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
  detail: string;
}

export interface FirmwareBuildResult {
  blob: Blob;
  meta: {
    size: number;
    flashMode: string;
    sha256: string;
    boardFlashMode: string;
    boardFlashSize: string;
    boardChip: string;
    checks: FirmwareCheck[];
  };
}

export async function buildFirmware(data: {
  node_id: string;
  hardware_type?: string;
  backend_url: string;
  wifi_networks?: { ssid: string; password: string }[];
  regenerate_key?: boolean;
}): Promise<FirmwareBuildResult> {
  const res = await authFetch(`${API_BASE}/receivers/firmware/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let errMsg = `Build fehlgeschlagen (HTTP ${res.status})`;
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
      if (err.details) errMsg += '\n' + err.details;
    } catch { /* not JSON */ }
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  let checks: FirmwareCheck[] = [];
  try {
    const raw = res.headers.get('X-Firmware-Checks');
    if (raw) checks = JSON.parse(atob(raw));
  } catch (e) {
    console.warn('[buildFirmware] Failed to parse checks header:', e);
  }
  return {
    blob,
    meta: {
      size: parseInt(res.headers.get('X-Firmware-Size') || '0', 10),
      flashMode: res.headers.get('X-Firmware-Flash-Mode') || '',
      sha256: res.headers.get('X-Firmware-SHA256') || '',
      boardFlashMode: res.headers.get('X-Board-Flash-Mode') || '',
      boardFlashSize: res.headers.get('X-Board-Flash-Size') || '',
      boardChip: res.headers.get('X-Board-Chip') || '',
      checks,
    },
  };
}

export async function startBuildAsync(data: {
  node_id: string;
  hardware_type?: string;
  backend_url: string;
  wifi_networks?: { ssid: string; password: string }[];
  regenerate_key?: boolean;
}): Promise<void> {
  const res = await authFetch(`${API_BASE}/receivers/firmware/build-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Build-Start fehlgeschlagen' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
}

export interface BuildStatus {
  status: 'idle' | 'building' | 'done' | 'error';
  log: string[];
  error: string | null;
  checks: FirmwareCheck[] | null;
  result: { size: number; flash_mode: string; sha256: string; node_id: string } | null;
}

export async function pollBuildStatus(nodeId: string): Promise<BuildStatus> {
  const res = await authFetch(`${API_BASE}/receivers/firmware/build-status/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Connection Log ──────────────────────────────────────

export interface ConnectionLogEntry {
  timestamp: number;
  receiver_id: string | null;
  receiver_name: string | null;
  endpoint: string;
  method: string;
  http_status: number;
  error: string | null;
  detections_count: number | null;
  ip: string | null;
  firmware_version: string | null;
  hardware_type: string | null;
  wifi_ssid: string | null;
  wifi_rssi: number | null;
  wifi_channel: number | null;
  free_heap: number | null;
  uptime_seconds: number | null;
  ap_active: boolean | null;
  error_count: number | null;
  last_http_code: number | null;
}

export interface ConnectionLogResponse {
  enabled: boolean;
  entries: ConnectionLogEntry[];
}

export async function fetchConnectionLog(receiverId?: string): Promise<ConnectionLogResponse> {
  const params = receiverId ? `?receiver_id=${encodeURIComponent(receiverId)}` : '';
  const res = await authFetch(`${API_BASE}/receivers/connection-log${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function toggleConnectionLog(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await authFetch(`${API_BASE}/receivers/connection-log/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function clearConnectionLog(): Promise<void> {
  const res = await authFetch(`${API_BASE}/receivers/connection-log/clear`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function downloadFirmware(nodeId: string, type: 'app' | 'merged' = 'app'): Promise<Blob> {
  const params = type === 'merged' ? '?type=merged' : '';
  const res = await authFetch(`${API_BASE}/receivers/firmware/download/${encodeURIComponent(nodeId)}${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download fehlgeschlagen' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.blob();
}

export async function triggerOtaUpdate(nodeId: string): Promise<{ ok: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(nodeId)}/ota-trigger`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'OTA-Trigger fehlgeschlagen' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function cancelOtaUpdate(nodeId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/receivers/${encodeURIComponent(nodeId)}/ota-cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}


// ─── Simulation API ──────────────────────────────────────

export interface SimulatorInstance {
  id: string;
  name: string;
  status: 'stopped' | 'running' | 'error';
  numDrones: number;
  activeDrones: number;
  lat: number;
  lon: number;
  hardwareType: 'esp32-s3' | 'esp32-c3' | 'esp8266';
  receiverNodeId: string;
  startedAt: number | null;
  uptimeSeconds: number;
  detectionsSent: number;
  error: string | null;
}

export async function fetchSimulators(): Promise<SimulatorInstance[]> {
  const res = await authFetch(`${API_BASE}/simulation/instances`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createSimulator(data: {
  name: string;
  numDrones: number;
  lat: number;
  lon: number;
  hardwareType: string;
}): Promise<SimulatorInstance> {
  const res = await authFetch(`${API_BASE}/simulation/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erstellen fehlgeschlagen' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function deleteSimulator(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/simulation/instances/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function startSimulator(id: string): Promise<SimulatorInstance> {
  const res = await authFetch(`${API_BASE}/simulation/instances/${encodeURIComponent(id)}/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function stopSimulator(id: string): Promise<SimulatorInstance> {
  const res = await authFetch(`${API_BASE}/simulation/instances/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function stopAllSimulators(): Promise<void> {
  const res = await authFetch(`${API_BASE}/simulation/stop-all`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
