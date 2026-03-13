export type DroneStatus = 'active' | 'idle' | 'error' | 'lost';

export interface Drone {
  id: string;
  mac: string | null;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  altitude_baro: number | null;   // barometric altitude MSL (meters)
  altitude_geom: number | null;   // geometric/GPS altitude (meters)
  ground_elevation?: number | null; // terrain elevation MSL (meters) — from elevation API
  altitude_agl?: number | null;     // above ground level (meters) — computed
  pilot_latitude: number | null;
  pilot_longitude: number | null;
  signal_strength: number | null;
  battery: number | null;
  speed: number;
  status: DroneStatus;
  flight_pattern: string;
  basic_id: string;
  faa_data: FAAData | null;
  last_update: number;
  distance?: number;
  source?: string;
  source_label?: string;
  icao_hex?: string;
  ogn_aircraft_type?: number;
  ogn_aircraft_type_label?: string;
}

export interface FAAData {
  registrant_name: string;
  registrant_type: string;
  manufacturer: string;
  model: string;
  registration_date: string;
  expiration_date: string;
  status: string;
  serial_number: string;
  weight: number;
  purpose: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface DroneHistoryEntry {
  lat: number;
  lon: number;
  altitude: number;
  timestamp: number;
  status: DroneStatus;
  battery: number;
}

export interface DronesResponse {
  drones: Drone[];
  count: number;
  center: { lat: number; lon: number };
  sources?: string[];
  zone_version?: number;
  violation_version?: number;
  settings_version?: number;
}

export interface AircraftLookup {
  identifier: string;
  found: boolean;
  type?: string;
  icao_type?: string;
  manufacturer?: string;
  registration?: string;
  owner?: string;
  owner_country?: string;
  operator?: string;
  operator_callsign?: string;
  operator_icao?: string;
  operator_flag?: string;
  serial_number?: string;
  icao_aircraft_class?: string;
  country?: string;
  photo_url?: string;
  source_db?: string;
  callsign?: string;
  airline?: string;
  airline_icao?: string;
  airline_country?: string;
  origin?: { name?: string; icao?: string; iata?: string; city?: string };
  destination?: { name?: string; icao?: string; iata?: string; city?: string };
  ogn_cn?: string;
  ogn_device_type?: string;
}

export interface DataSourceConfig {
  enabled: boolean;
  label: string;
  description: string;
}

export interface DataSourceSettings {
  sources: Record<string, DataSourceConfig>;
}

// ─── Tracking ────────────────────────────────────────────

export interface TrailPoint {
  lat: number;
  lon: number;
  altitude: number;
  timestamp: number;
}

export type TrackingState = 'tracking' | 'untracked';

export interface TrackedFlight {
  droneId: string;
  droneName: string;
  source?: string;
  state: TrackingState;
  trail: TrailPoint[];
  color: string;
  startedAt: number;
}

export interface ArchivedTrailSummary {
  id: string;
  droneId: string;
  droneName: string;
  source?: string;
  color: string;
  startedAt: number;
  archivedAt: number;
  expiresAt: number;
  pointCount: number;
}

export interface ArchivedTrail extends ArchivedTrailSummary {
  trail: TrailPoint[];
}

// ─── Flight Zones ─────────────────────────────────────────

export interface FlightZone {
  id: string;
  name: string;
  color: string;
  polygon: [number, number][]; // [lat, lon][]
  minAltitudeAGL: number | null; // meters above ground level
  maxAltitudeAGL: number | null; // meters above ground level
  assignedDrones: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ZoneViolation {
  droneId: string;
  droneName: string;
  zoneId: string;
  zoneName: string;
  timestamp: number;
}

export interface ViolationRecord {
  id: string;
  droneId: string;
  droneName: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  startTime: number;       // epoch seconds
  endTime: number | null;  // null = still active
  trackingVisible: boolean;
}
