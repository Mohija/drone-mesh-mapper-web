import { useState, useCallback, useRef, useMemo } from 'react';
import type { Drone, ViolationRecord } from './types/drone';
import type { ServerViolationRecord } from './api';
import { fetchViolations, deleteViolationRecord, clearViolationRecords } from './api';
import { getUserItem } from './userStorage';

/** Play a short alert beep for new violations (respects user setting) */
function playAlertSound() {
  if (getUserItem('violation-sound') === 'off') return;
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
  /** Sync violation records from backend. Detects new violations for alerts/auto-tracking. */
  sync: (
    drones: Drone[],
    onAutoTrack?: (drone: Drone) => void,
  ) => Promise<void>;
  deleteRecord: (recordId: string) => Promise<void>;
  toggleTrackingVisible: (recordId: string) => void;
  clearAll: () => Promise<void>;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  hiddenTrailDroneIds: Set<string>;
  getDroneIdForRecord: (recordId: string) => string | undefined;
  hasOtherRecords: (droneId: string, excludeRecordId: string) => boolean;
}

export function useViolationLog(violationVersion?: number): UseViolationLogReturn {
  const [records, setRecords] = useState<ViolationRecord[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  // Track which record IDs we already alerted on (survives re-renders)
  const alertedRef = useRef<Set<string>>(new Set());
  // Local UI state: per-record trail visibility (not shared across users)
  const trackingVisRef = useRef<Map<string, boolean>>(new Map());
  // For getDroneIdForRecord / hasOtherRecords — keep in ref so callbacks are stable
  const recordsRef = useRef(records);
  recordsRef.current = records;
  // Track last seen violation version to skip redundant fetches
  const lastViolationVersionRef = useRef<number | undefined>(undefined);

  /**
   * Fetch violation records from backend and merge with local UI state.
   * Detects NEW active violations (not yet alerted) → plays sound + auto-tracks.
   * Skips fetch when violation_version from /api/drones hasn't changed.
   */
  const sync = useCallback(async (
    drones: Drone[],
    onAutoTrack?: (drone: Drone) => void,
  ) => {
    // Skip fetch if violation version hasn't changed (saves bandwidth)
    if (violationVersion !== undefined &&
        lastViolationVersionRef.current !== undefined &&
        violationVersion === lastViolationVersionRef.current) {
      return;
    }
    lastViolationVersionRef.current = violationVersion;

    let serverRecords: ServerViolationRecord[];
    try {
      const data = await fetchViolations();
      serverRecords = data.records;
    } catch {
      return; // API error — keep existing records
    }

    const serverIds = new Set(serverRecords.map(r => r.id));
    const newAutoTrackDroneIds: string[] = [];

    // Detect new active violations (record IDs we haven't alerted on yet)
    for (const r of serverRecords) {
      if (r.endTime === null && !alertedRef.current.has(r.id)) {
        alertedRef.current.add(r.id);
        newAutoTrackDroneIds.push(r.droneId);
      }
    }

    // Clean up alertedRef for records removed from backend
    for (const id of alertedRef.current) {
      if (!serverIds.has(id)) {
        alertedRef.current.delete(id);
      }
    }

    // Clean up trackingVis for deleted records
    for (const id of trackingVisRef.current.keys()) {
      if (!serverIds.has(id)) {
        trackingVisRef.current.delete(id);
      }
    }

    // Merge server records with local trackingVisible
    const merged: ViolationRecord[] = serverRecords.map(r => ({
      ...r,
      trackingVisible: trackingVisRef.current.get(r.id) ?? true,
    }));

    setRecords(merged);

    // Side effects: alert sound + auto-tracking for new violations
    if (newAutoTrackDroneIds.length > 0) {
      playAlertSound();
      if (onAutoTrack) {
        const seen = new Set<string>();
        for (const droneId of newAutoTrackDroneIds) {
          if (seen.has(droneId)) continue;
          seen.add(droneId);
          const drone = drones.find(d => d.id === droneId);
          if (drone) onAutoTrack(drone);
        }
      }
    }
  }, [violationVersion]);

  const deleteRecord = useCallback(async (recordId: string) => {
    // Optimistic: remove locally first, then sync to backend
    alertedRef.current.delete(recordId);
    trackingVisRef.current.delete(recordId);
    setRecords(prev => prev.filter(r => r.id !== recordId));
    // Reset version so next sync fetches fresh data after server-side re-detection
    lastViolationVersionRef.current = undefined;
    try {
      await deleteViolationRecord(recordId);
    } catch { /* best-effort — next sync will reconcile */ }
  }, []);

  const toggleTrackingVisible = useCallback((recordId: string) => {
    const current = trackingVisRef.current.get(recordId) ?? true;
    trackingVisRef.current.set(recordId, !current);
    setRecords(prev => prev.map(r =>
      r.id === recordId ? { ...r, trackingVisible: !r.trackingVisible } : r
    ));
  }, []);

  const clearAll = useCallback(async () => {
    setRecords([]);
    alertedRef.current.clear();
    trackingVisRef.current.clear();
    // Reset version so next sync always fetches fresh data
    lastViolationVersionRef.current = undefined;
    try {
      await clearViolationRecords();
    } catch { /* best-effort */ }
  }, []);

  const getDroneIdForRecord = useCallback((recordId: string) => {
    return recordsRef.current.find(r => r.id === recordId)?.droneId;
  }, []);

  const hasOtherRecords = useCallback((droneId: string, excludeRecordId: string) => {
    return recordsRef.current.some(r => r.droneId === droneId && r.id !== excludeRecordId);
  }, []);

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
    sync,
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
