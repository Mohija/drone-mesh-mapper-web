export type DroneStatus = 'active' | 'idle' | 'error' | 'lost';

export interface Drone {
  id: string;
  mac: string | null;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
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
}

export interface DataSourceConfig {
  enabled: boolean;
  label: string;
  description: string;
}

export interface DataSourceSettings {
  sources: Record<string, DataSourceConfig>;
}
