import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Drone, TrackedFlight, TrailPoint, ArchivedTrail, ArchivedTrailSummary } from './types/drone';
import { fetchArchivedTrails, fetchArchivedTrail, saveArchivedTrail, deleteArchivedTrail } from './api';

const TRAIL_COLORS = [
  '#f97316', '#06b6d4', '#a855f7', '#eab308',
  '#ec4899', '#14b8a6', '#f43f5e', '#84cc16',
];

const MAX_TRAIL_POINTS = 2000;
const MIN_DISTANCE_M = 15; // minimum distance to add a new point

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TrailData {
  id: string;
  points: [number, number][]; // [lat, lon]
  color: string;
  dashed: boolean;
  label: string;
}

export interface UseTrackingReturn {
  trackedFlights: Map<string, TrackedFlight>;
  archives: ArchivedTrailSummary[];
  archiveTrails: ArchivedTrail[]; // full loaded archive data
  trackDrone: (drone: Drone) => void;
  untrackDrone: (droneId: string) => void;
  archiveFlight: (droneId: string) => Promise<void>;
  loadArchive: (archiveId: string) => Promise<void>;
  removeArchive: (archiveId: string) => Promise<void>;
  updatePositions: (drones: Drone[]) => void;
  allTrails: TrailData[];
  isTracked: (droneId: string) => TrackedFlight | undefined;
}

export function useTracking(): UseTrackingReturn {
  const [trackedFlights, setTrackedFlights] = useState<Map<string, TrackedFlight>>(new Map());
  const [archives, setArchives] = useState<ArchivedTrailSummary[]>([]);
  const [archiveTrails, setArchiveTrails] = useState<ArchivedTrail[]>([]);
  const colorIndexRef = useRef(0);

  // Load archives on mount
  useEffect(() => {
    fetchArchivedTrails()
      .then(list => {
        setArchives(list);
        // Auto-load all trail data
        list.forEach(a => {
          fetchArchivedTrail(a.id)
            .then(full => setArchiveTrails(prev => [...prev.filter(t => t.id !== full.id), full]))
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  // Restore tracked IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tracked-drones');
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        // We only store IDs — the trails start fresh after reload
        // They will be populated when drones appear in the next poll
        setTrackedFlights(prev => {
          const next = new Map(prev);
          for (const id of ids) {
            if (!next.has(id)) {
              next.set(id, {
                droneId: id,
                droneName: id,
                state: 'tracking',
                trail: [],
                color: TRAIL_COLORS[colorIndexRef.current++ % TRAIL_COLORS.length],
                startedAt: Date.now(),
              });
            }
          }
          return next;
        });
      }
    } catch {}
  }, []);

  // Persist tracked IDs
  useEffect(() => {
    const ids = [...trackedFlights.values()]
      .filter(f => f.state === 'tracking')
      .map(f => f.droneId);
    localStorage.setItem('tracked-drones', JSON.stringify(ids));
  }, [trackedFlights]);

  const trackDrone = useCallback((drone: Drone) => {
    setTrackedFlights(prev => {
      const next = new Map(prev);
      const existing = next.get(drone.id);
      if (existing && existing.state === 'tracking') return prev; // already tracking

      const color = existing?.color || TRAIL_COLORS[colorIndexRef.current++ % TRAIL_COLORS.length];
      const initialPoint: TrailPoint = {
        lat: drone.latitude,
        lon: drone.longitude,
        altitude: drone.altitude,
        timestamp: Date.now() / 1000,
      };
      next.set(drone.id, {
        droneId: drone.id,
        droneName: drone.name,
        source: drone.source,
        state: 'tracking',
        trail: existing?.trail.length ? existing.trail : [initialPoint],
        color,
        startedAt: existing?.startedAt || Date.now(),
      });
      return next;
    });
  }, []);

  const untrackDrone = useCallback((droneId: string) => {
    setTrackedFlights(prev => {
      const next = new Map(prev);
      const flight = next.get(droneId);
      if (!flight) return prev;
      next.set(droneId, { ...flight, state: 'untracked' });
      return next;
    });
  }, []);

  const archiveFlight = useCallback(async (droneId: string) => {
    const flight = trackedFlights.get(droneId);
    if (!flight || flight.trail.length < 2) return;

    const result = await saveArchivedTrail({
      droneId: flight.droneId,
      droneName: flight.droneName,
      source: flight.source,
      color: flight.color,
      trail: flight.trail,
      startedAt: flight.startedAt,
    });

    // Remove from active tracked flights
    setTrackedFlights(prev => {
      const next = new Map(prev);
      next.delete(droneId);
      return next;
    });

    // Add to archives
    const { trail, ...summary } = result;
    setArchives(prev => [...prev, { ...summary, pointCount: trail.length }]);
    setArchiveTrails(prev => [...prev, result]);
  }, [trackedFlights]);

  const loadArchive = useCallback(async (archiveId: string) => {
    const full = await fetchArchivedTrail(archiveId);
    setArchiveTrails(prev => [...prev.filter(t => t.id !== full.id), full]);
  }, []);

  const removeArchive = useCallback(async (archiveId: string) => {
    await deleteArchivedTrail(archiveId);
    setArchives(prev => prev.filter(a => a.id !== archiveId));
    setArchiveTrails(prev => prev.filter(t => t.id !== archiveId));
  }, []);

  const updatePositions = useCallback((drones: Drone[]) => {
    setTrackedFlights(prev => {
      let changed = false;
      const next = new Map(prev);

      for (const [droneId, flight] of next) {
        if (flight.state !== 'tracking') continue;

        const drone = drones.find(d => d.id === droneId);
        if (!drone) continue;

        // Update name if it was a placeholder from localStorage restore
        if (flight.droneName === droneId && drone.name !== droneId) {
          changed = true;
          next.set(droneId, { ...flight, droneName: drone.name, source: drone.source });
          continue;
        }

        const last = flight.trail[flight.trail.length - 1];
        if (!last) {
          // First point
          changed = true;
          next.set(droneId, {
            ...flight,
            droneName: drone.name,
            source: drone.source,
            trail: [{
              lat: drone.latitude,
              lon: drone.longitude,
              altitude: drone.altitude,
              timestamp: Date.now() / 1000,
            }],
          });
          continue;
        }

        const dist = haversineM(last.lat, last.lon, drone.latitude, drone.longitude);
        if (dist >= MIN_DISTANCE_M) {
          changed = true;
          let trail = [...flight.trail, {
            lat: drone.latitude,
            lon: drone.longitude,
            altitude: drone.altitude,
            timestamp: Date.now() / 1000,
          }];
          if (trail.length > MAX_TRAIL_POINTS) {
            trail = trail.slice(trail.length - MAX_TRAIL_POINTS);
          }
          next.set(droneId, { ...flight, trail });
        }
      }

      return changed ? next : prev;
    });
  }, []);

  const allTrails = useMemo((): TrailData[] => {
    const result: TrailData[] = [];

    // Active/untracked flights
    for (const [, flight] of trackedFlights) {
      if (flight.trail.length < 2) continue;
      result.push({
        id: `track-${flight.droneId}`,
        points: flight.trail.map(p => [p.lat, p.lon]),
        color: flight.color,
        dashed: flight.state === 'untracked',
        label: flight.droneName,
      });
    }

    // Archived trails
    for (const a of archiveTrails) {
      if (!a.trail || a.trail.length < 2) continue;
      result.push({
        id: `archive-${a.id}`,
        points: a.trail.map(p => [p.lat, p.lon]),
        color: a.color,
        dashed: true,
        label: `${a.droneName} (Archiv)`,
      });
    }

    return result;
  }, [trackedFlights, archiveTrails]);

  const isTracked = useCallback((droneId: string) => {
    return trackedFlights.get(droneId);
  }, [trackedFlights]);

  return {
    trackedFlights,
    archives,
    archiveTrails,
    trackDrone,
    untrackDrone,
    archiveFlight,
    loadArchive,
    removeArchive,
    updatePositions,
    allTrails,
    isTracked,
  };
}
