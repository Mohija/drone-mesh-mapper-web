import { useState, useCallback, useRef, useMemo } from 'react';
import type { Drone, FlightZone, ZoneViolation, ViolationRecord } from './types/drone';

/** Play a short alert beep for new violations */
function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore audio errors */ }
}

export interface UseViolationLogReturn {
  records: ViolationRecord[];
  update: (
    activeViolations: ZoneViolation[],
    drones: Drone[],
    zones: FlightZone[],
    onAutoTrack?: (drone: Drone) => void,
  ) => void;
  deleteRecord: (recordId: string) => void;
  toggleTrackingVisible: (recordId: string) => void;
  clearAll: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  hiddenTrailDroneIds: Set<string>;
  getDroneIdForRecord: (recordId: string) => string | undefined;
  hasOtherRecords: (droneId: string, excludeRecordId: string) => boolean;
}

export function useViolationLog(): UseViolationLogReturn {
  const [records, setRecords] = useState<ViolationRecord[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const alertedRef = useRef<Set<string>>(new Set());

  const update = useCallback((
    activeViolations: ZoneViolation[],
    drones: Drone[],
    zones: FlightZone[],
    onAutoTrack?: (drone: Drone) => void,
  ) => {
    const now = Date.now() / 1000;
    const activeKeys = new Set(activeViolations.map(v => `${v.droneId}::${v.zoneId}`));
    const activeDroneIds = new Set(drones.map(d => d.id));

    // Collect new violation keys for post-update side effects
    const newAutoTrackDroneIds: string[] = [];

    setRecords(prev => {
      const next = prev.map(r => ({ ...r }));
      let hasNew = false;
      let hasEnded = false;

      // Detect new violations
      for (const v of activeViolations) {
        const key = `${v.droneId}::${v.zoneId}`;
        const hasActiveRecord = next.some(r =>
          r.droneId === v.droneId && r.zoneId === v.zoneId && r.endTime === null
        );
        if (!hasActiveRecord) {
          const zone = zones.find(z => z.id === v.zoneId);
          next.push({
            id: `${v.droneId}_${v.zoneId}_${Math.round(now * 1000)}`,
            droneId: v.droneId,
            droneName: v.droneName,
            zoneId: v.zoneId,
            zoneName: v.zoneName,
            zoneColor: zone?.color || '#ef4444',
            startTime: now,
            endTime: null,
            trackingVisible: true,
          });
          hasNew = true;

          // Mark for auto-tracking (side effect happens AFTER setRecords)
          if (!alertedRef.current.has(key)) {
            newAutoTrackDroneIds.push(v.droneId);
            alertedRef.current.add(key);
          }
        }
      }

      // End violations that are no longer active or drone disappeared
      for (const record of next) {
        if (record.endTime === null) {
          const key = `${record.droneId}::${record.zoneId}`;
          if (!activeKeys.has(key) || !activeDroneIds.has(record.droneId)) {
            record.endTime = now;
            hasEnded = true;
            alertedRef.current.delete(key);
          }
        }
      }

      if (!hasNew && !hasEnded) return prev;
      return next;
    });

    // Side effects OUTSIDE the state updater — safe from React re-runs
    if (newAutoTrackDroneIds.length > 0) {
      playAlertSound();
      for (const droneId of newAutoTrackDroneIds) {
        const drone = drones.find(d => d.id === droneId);
        if (drone && onAutoTrack) onAutoTrack(drone);
      }
    }
  }, []);

  const deleteRecord = useCallback((recordId: string) => {
    setRecords(prev => {
      const record = prev.find(r => r.id === recordId);
      if (record) {
        alertedRef.current.delete(`${record.droneId}::${record.zoneId}`);
      }
      return prev.filter(r => r.id !== recordId);
    });
  }, []);

  const toggleTrackingVisible = useCallback((recordId: string) => {
    setRecords(prev => prev.map(r =>
      r.id === recordId ? { ...r, trackingVisible: !r.trackingVisible } : r
    ));
  }, []);

  const clearAll = useCallback(() => {
    setRecords([]);
    alertedRef.current.clear();
  }, []);

  const getDroneIdForRecord = useCallback((recordId: string) => {
    return records.find(r => r.id === recordId)?.droneId;
  }, [records]);

  const hasOtherRecords = useCallback((droneId: string, excludeRecordId: string) => {
    return records.some(r => r.droneId === droneId && r.id !== excludeRecordId);
  }, [records]);

  // A drone's trail is hidden only if ALL its records have trackingVisible=false
  const hiddenTrailDroneIds = useMemo(() => {
    const hidden = new Set<string>();
    const droneVisMap = new Map<string, boolean>();
    for (const r of records) {
      const prev = droneVisMap.get(r.droneId);
      droneVisMap.set(r.droneId, prev === undefined ? r.trackingVisible : (prev || r.trackingVisible));
    }
    for (const [droneId, anyVisible] of droneVisMap) {
      if (!anyVisible) hidden.add(droneId);
    }
    return hidden;
  }, [records]);

  return {
    records,
    update,
    deleteRecord,
    toggleTrackingVisible,
    clearAll,
    collapsed,
    setCollapsed,
    hiddenTrailDroneIds,
    getDroneIdForRecord,
    hasOtherRecords,
  };
}
