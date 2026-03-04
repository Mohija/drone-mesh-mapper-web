import type { Drone, DronesResponse, DroneHistoryEntry } from '../types/drone';

export function createMockDrone(overrides: Partial<Drone> = {}): Drone {
  return {
    id: 'TEST001',
    mac: 'AA:BB:CC:DD:EE:01',
    name: 'Test Drone',
    latitude: 50.1109,
    longitude: 8.6821,
    altitude: 100.0,
    pilot_latitude: 50.112,
    pilot_longitude: 8.683,
    signal_strength: -45,
    battery: 85.0,
    speed: 12.5,
    status: 'active',
    flight_pattern: 'linear',
    basic_id: 'TEST001',
    faa_data: {
      registrant_name: 'Pilot 1',
      registrant_type: 'Individual',
      manufacturer: 'DJI',
      model: 'Mavic 3',
      registration_date: '2024-01-15',
      expiration_date: '2027-01-15',
      status: 'Active',
      serial_number: 'SN00011234',
      weight: 0.95,
      purpose: 'Commercial',
    },
    last_update: Date.now() / 1000,
    ...overrides,
  };
}

export function createMockDronesResponse(count = 3): DronesResponse {
  const drones = Array.from({ length: count }, (_, i) =>
    createMockDrone({
      id: `TEST${String(i + 1).padStart(3, '0')}`,
      basic_id: `TEST${String(i + 1).padStart(3, '0')}`,
      name: `Drone ${i + 1}`,
      mac: `AA:BB:CC:DD:EE:${String(i + 1).padStart(2, '0')}`,
    })
  );
  return { drones, count, center: { lat: 50.1109, lon: 8.6821 } };
}

export function createMockHistory(count = 5): DroneHistoryEntry[] {
  const now = Date.now() / 1000;
  return Array.from({ length: count }, (_, i) => ({
    lat: 50.1109 + i * 0.001,
    lon: 8.6821 + i * 0.001,
    altitude: 100 + i * 5,
    timestamp: now - (count - i) * 2,
    status: 'active' as const,
    battery: 90 - i * 2,
  }));
}
