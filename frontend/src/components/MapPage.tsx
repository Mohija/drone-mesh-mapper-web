import { useState, useEffect, useCallback, useRef } from 'react';
import type { Drone, UserLocation } from '../types/drone';
import { fetchDrones, setFleetCenter } from '../api';
import MapComponent from './MapComponent';
import StatusPanel from './StatusPanel';
import GeolocationButton from './GeolocationButton';

export default function MapPage() {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [droneCount, setDroneCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const loadDrones = useCallback(async () => {
    try {
      const data = await fetchDrones(
        userLocation?.latitude,
        userLocation?.longitude,
        10000
      );
      setDrones(data.drones);
      setDroneCount(data.count);
      setError(null);

      // Update selected drone data if one is selected (functional form avoids stale closure)
      setSelectedDrone(prev => {
        if (!prev) return null;
        return data.drones.find((d) => d.id === prev.id) || prev;
      });
    } catch (err) {
      setError('Verbindung zum Server fehlgeschlagen');
    }
  }, [userLocation]);

  // Polling interval
  useEffect(() => {
    loadDrones();
    intervalRef.current = setInterval(loadDrones, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadDrones]);

  const handleLocationFound = useCallback(async (loc: UserLocation) => {
    setUserLocation(loc);
    try {
      await setFleetCenter(loc.latitude, loc.longitude);
    } catch {
      // Fleet recentering failed, but we still have the location
    }
  }, []);

  const handleDroneClick = useCallback((drone: Drone) => {
    setSelectedDrone(drone);
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedDrone(null);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapComponent
        drones={drones}
        selectedDrone={selectedDrone}
        userLocation={userLocation}
        onDroneClick={handleDroneClick}
      />

      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 60,
        right: selectedDrone ? 370 : 12,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 18 }}>&#128681;</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Drone Mesh Mapper</span>
          <span style={{
            background: 'var(--bg-tertiary)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}>
            {droneCount} Drohne{droneCount !== 1 ? 'n' : ''}
          </span>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-error)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            color: 'var(--status-error)',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Geolocation button */}
      <GeolocationButton onLocationFound={handleLocationFound} />

      {/* Status panel */}
      {selectedDrone && (
        <StatusPanel drone={selectedDrone} onClose={handlePanelClose} />
      )}
    </div>
  );
}
