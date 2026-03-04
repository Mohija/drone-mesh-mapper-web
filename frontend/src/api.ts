import type { DronesResponse, Drone, DroneHistoryEntry } from './types/drone';

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
  const res = await fetch(`${API_BASE}/drones/${droneId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDroneHistory(
  droneId: string
): Promise<{ drone_id: string; history: DroneHistoryEntry[] }> {
  const res = await fetch(`${API_BASE}/drones/${droneId}/history`);
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
