import { useState, useCallback, useEffect, useRef } from 'react';
import type { FlightZone } from './types/drone';
import {
  fetchFlightZones,
  createFlightZone,
  updateFlightZone as apiUpdateZone,
  deleteFlightZone as apiDeleteZone,
  assignDronesToZone,
  unassignDronesFromZone,
} from './api';

const ZONE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

/**
 * Ray-casting point-in-polygon (client-side, matches backend algorithm).
 */
export function pointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];

    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

/** Snap distance in degrees (~15m at mid-latitudes) */
const SNAP_THRESHOLD = 0.00015;

export interface UseFlightZonesReturn {
  zones: FlightZone[];
  drawingMode: boolean;
  pendingPoints: [number, number][];
  snappable: boolean; // true when next click would snap to first point
  startDrawing: () => void;
  addPoint: (lat: number, lon: number) => boolean; // returns true if snapped (polygon closed)
  undoLastPoint: () => void;
  cancelDrawing: () => void;
  finishDrawing: (name: string, color: string, minAGL: number | null, maxAGL: number | null) => Promise<void>;
  deleteZone: (zoneId: string) => Promise<void>;
  updateZone: (zoneId: string, updates: Partial<Pick<FlightZone, 'name' | 'color' | 'polygon' | 'minAltitudeAGL' | 'maxAltitudeAGL'>>) => Promise<void>;
  assignDrones: (zoneId: string, droneIds: string[]) => Promise<void>;
  unassignDrones: (zoneId: string, droneIds: string[]) => Promise<void>;
  colorIndex: number;
}

export function useFlightZones(): UseFlightZonesReturn {
  const [zones, setZones] = useState<FlightZone[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<[number, number][]>([]);
  const colorIndexRef = useRef(0);

  // Load zones on mount + refresh periodically (30s) so all users in a tenant
  // see zones created by other users without a page reload.
  useEffect(() => {
    const load = () => fetchFlightZones().then(setZones).catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  const startDrawing = useCallback(() => {
    setDrawingMode(true);
    setPendingPoints([]);
  }, []);

  const addPoint = useCallback((lat: number, lon: number): boolean => {
    let snapped = false;
    setPendingPoints(prev => {
      // Snap-to-first-point: if we have 3+ points and click near the first, close polygon
      if (prev.length >= 3) {
        const [firstLat, firstLon] = prev[0];
        const dLat = Math.abs(lat - firstLat);
        const dLon = Math.abs(lon - firstLon);
        if (dLat < SNAP_THRESHOLD && dLon < SNAP_THRESHOLD) {
          snapped = true;
          return prev; // don't add the point, polygon is closed
        }
      }
      return [...prev, [lat, lon]];
    });
    return snapped;
  }, []);

  const undoLastPoint = useCallback(() => {
    setPendingPoints(prev => prev.slice(0, -1));
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawingMode(false);
    setPendingPoints([]);
  }, []);

  const finishDrawing = useCallback(async (name: string, color: string, minAGL: number | null, maxAGL: number | null) => {
    if (pendingPoints.length < 3) return;
    try {
      const zone = await createFlightZone({
        name,
        color,
        polygon: pendingPoints,
        minAltitudeAGL: minAGL,
        maxAltitudeAGL: maxAGL,
      });
      setZones(prev => [...prev, zone]);
    } finally {
      setDrawingMode(false);
      setPendingPoints([]);
    }
  }, [pendingPoints]);

  const deleteZone = useCallback(async (zoneId: string) => {
    await apiDeleteZone(zoneId);
    setZones(prev => prev.filter(z => z.id !== zoneId));
  }, []);

  const updateZone = useCallback(async (zoneId: string, updates: Partial<Pick<FlightZone, 'name' | 'color' | 'polygon' | 'minAltitudeAGL' | 'maxAltitudeAGL'>>) => {
    const updated = await apiUpdateZone(zoneId, updates);
    setZones(prev => prev.map(z => z.id === zoneId ? updated : z));
  }, []);

  const assignDrones = useCallback(async (zoneId: string, droneIds: string[]) => {
    const updated = await assignDronesToZone(zoneId, droneIds);
    setZones(prev => prev.map(z => z.id === zoneId ? updated : z));
  }, []);

  const unassignDrones = useCallback(async (zoneId: string, droneIds: string[]) => {
    const updated = await unassignDronesFromZone(zoneId, droneIds);
    setZones(prev => prev.map(z => z.id === zoneId ? updated : z));
  }, []);

  return {
    zones,
    drawingMode,
    pendingPoints,
    snappable: pendingPoints.length >= 3,
    startDrawing,
    addPoint,
    undoLastPoint,
    cancelDrawing,
    finishDrawing,
    deleteZone,
    updateZone,
    assignDrones,
    unassignDrones,
    colorIndex: colorIndexRef.current,
  };
}

export { ZONE_COLORS, SNAP_THRESHOLD };
