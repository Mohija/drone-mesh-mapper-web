import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import type { Drone, UserLocation } from '../types/drone';
import { fetchDrones, setFleetCenter } from '../api';
import { useAuth } from '../AuthContext';
import { buildGrid } from '../elevationGrid';
import MapComponent from './MapComponent';
import StatusPanel from './StatusPanel';
import GeolocationButton from './GeolocationButton';
import { pruneCache } from '../lookupCache';
import { useTracking } from '../useTracking';
import { useFlightZones } from '../useFlightZones';
import { useViolationLog } from '../useViolationLog';
import NoFlyZonesPanel from './NoFlyZonesPanel';
import TrackingPanel from './TrackingPanel';
import FlightZonesPanel from './FlightZonesPanel';
import ZoneAssignPanel from './ZoneAssignPanel';
import ViolationTable from './ViolationTable';
import {
  DEFAULT_ENABLED_LAYERS,
  NFZ_LAYERS,
  type NoFlyCategory,
  getLayersByCategory,
} from '../config/noFlyZones';
import { getUserItem, setUserItem } from '../userStorage';

const DEFAULT_RADIUS = 50000; // 50km
const DEFAULT_CENTER = { lat: 52.0302, lon: 8.5325 }; // Bielefeld

// Refresh rate options (ms). Backend providers cache 10-15s, simulator updates 2s.
// Polling faster than cache TTL returns cached data but keeps UI responsive.
const REFRESH_RATES = [
  { value: 1000,  label: '1s',  description: 'Sehr schnell (Simulator)' },
  { value: 2000,  label: '2s',  description: 'Standard' },
  { value: 5000,  label: '5s',  description: 'Moderat' },
  { value: 10000, label: '10s', description: 'Sparsam (API-Cache)' },
  { value: 30000, label: '30s', description: 'Langsam' },
] as const;

// Altitude zones based on EU/German drone regulations (EASA 2019/947, LuftVO §21h)
const ALTITUDE_ZONES = [
  { id: 'all', label: 'Alle Höhen', min: 0, max: Infinity, color: 'var(--text-secondary)', description: 'Kein Höhenfilter' },
  { id: 'ctr', label: '0–50m (Kontrollzone)', min: 0, max: 50, color: '#ef4444', description: 'CTR / Kontrollzone bei Flughäfen – max. 50m mit ATC-Freigabe' },
  { id: 'nature', label: '0–100m (Naturschutz)', min: 0, max: 100, color: '#22c55e', description: 'Naturschutzgebiete / Nationalparks ohne Genehmigung – max. 100m' },
  { id: 'open', label: '0–120m (Open)', min: 0, max: 120, color: '#3b82f6', description: 'EU Open Category (A1/A2/A3) – Standard-Flughöhe für alle Klassen (C0–C4)' },
  { id: 'above120', label: '120–300m (Specific)', min: 120, max: 300, color: '#f59e0b', description: 'Specific Category (STS/SORA) – Sondergenehmigung erforderlich' },
  { id: 'high', label: '300m+ (Certified)', min: 300, max: Infinity, color: '#8b5cf6', description: 'Certified Category – Zulassung wie bemannte Luftfahrt' },
] as const;

export default function MapPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [drones, setDrones] = useState<Drone[]>([]);
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [droneCount, setDroneCount] = useState(0);
  const [radiusEnabled, setRadiusEnabled] = useState(true);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [noFlyEnabled, setNoFlyEnabled] = useState(false);
  const [noFlyPanelOpen, setNoFlyPanelOpen] = useState(false);
  const [nfzRadiusEnabled, setNfzRadiusEnabled] = useState(false);
  const [nfzRadius, setNfzRadius] = useState(50000); // 50km default
  const [altitudeZone, setAltitudeZone] = useState('all');
  const [refreshRate, setRefreshRate] = useState(() => {
    const stored = getUserItem('refresh-rate');
    const parsed = stored ? Number(stored) : 2000;
    return REFRESH_RATES.some(r => r.value === parsed) ? parsed : 2000;
  });
  const [trackingPanelOpen, setTrackingPanelOpen] = useState(false);
  const [zonesPanelOpen, setZonesPanelOpen] = useState(false);
  const [assignZoneId, setAssignZoneId] = useState<string | null>(null);
  const [focusPosition, setFocusPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedViolationRecordId, setSelectedViolationRecordId] = useState<string | null>(null);
  const [violationTableHeight, setViolationTableHeight] = useState(0);
  const handleViolationHeightChange = useCallback((h: number) => setViolationTableHeight(h), []);
  const tracking = useTracking();
  const hasActiveTracking = [...tracking.trackedFlights.values()].some(f => f.state === 'tracking');
  const flightZones = useFlightZones();
  const violationLog = useViolationLog();

  // Refs to break the dependency chain: loadDrones must NOT depend on tracking/violation
  // state, otherwise every trail update recreates loadDrones → resets the polling interval
  // → causes near-continuous polling instead of the configured interval.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;
  const violationLogRef = useRef(violationLog);
  violationLogRef.current = violationLog;
  const [enabledNoFlyLayers, setEnabledNoFlyLayers] = useState<string[]>(() => {
    try {
      const stored = getUserItem('nofly-layers');
      return stored ? JSON.parse(stored) : DEFAULT_ENABLED_LAYERS;
    } catch {
      return DEFAULT_ENABLED_LAYERS;
    }
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  // Sequence counter: incremented on clearAll to discard stale in-flight polls
  const pollSeqRef = useRef(0);

  // Persist no-fly layer selection
  useEffect(() => {
    setUserItem('nofly-layers', JSON.stringify(enabledNoFlyLayers));
  }, [enabledNoFlyLayers]);

  const loadDrones = useCallback(async () => {
    const seq = pollSeqRef.current;
    try {
      // Always send center + radius. Use GPS position if available, otherwise default (Bielefeld)
      const lat = userLocation ? userLocation.latitude : DEFAULT_CENTER.lat;
      const lon = userLocation ? userLocation.longitude : DEFAULT_CENTER.lon;
      const r = radiusEnabled ? radius : 0;

      const data = await fetchDrones(lat, lon, r);

      // Discard result if a clearAll happened while we were fetching
      if (pollSeqRef.current !== seq) return;

      setDrones(data.drones);
      setDroneCount(data.count);
      setError(null);

      setSelectedDrone(prev => {
        if (!prev) return null;
        return data.drones.find((d) => d.id === prev.id) || prev;
      });

      // Prune lookup/NFZ cache for drones no longer visible
      const visibleKeys = new Set(data.drones.map((d) => d.basic_id || d.id));
      pruneCache(visibleKeys);

      // Access latest hook state via refs to avoid dependency on tracking/violation state.
      // Without refs, every trail update changes trackedFlights → isTracked ref → loadDrones
      // ref → useEffect restarts interval → immediate re-poll → infinite loop.
      const t = trackingRef.current;
      const vl = violationLogRef.current;

      // Feed new positions to existing tracked flights
      t.updatePositions(data.drones);

      // Sync shared violation records from backend (violations are computed server-side
      // during the /api/drones call, shared across all tenant users).
      // Await so auto-tracked drones get their positions updated in the same cycle.
      await vl.sync(
        data.drones,
        (drone) => {
          // Use ref to always read latest tracking state (not stale closure)
          if (!trackingRef.current.isTracked(drone.id)) {
            trackingRef.current.trackDrone(drone);
          }
        },
      );

      // Update positions again so newly auto-tracked drones get trail points immediately
      trackingRef.current.updatePositions(data.drones);
    } catch (err) {
      setError('Verbindung zum Server fehlgeschlagen');
    }
  }, [userLocation, radiusEnabled, radius]);

  // Build elevation grid for the search area (pre-computes terrain for AGL)
  useEffect(() => {
    const lat = userLocation ? userLocation.latitude : DEFAULT_CENTER.lat;
    const lon = userLocation ? userLocation.longitude : DEFAULT_CENTER.lon;
    const r = radiusEnabled ? radius : 50000; // Default 50km if no radius
    buildGrid(lat, lon, r);
  }, [userLocation, radiusEnabled, radius]);

  // Persist refresh rate
  useEffect(() => {
    setUserItem('refresh-rate', String(refreshRate));
  }, [refreshRate]);

  // Polling interval - enforce minimum 5s when >100 drones to reduce render load
  const effectiveInterval = droneCount > 100 ? Math.max(refreshRate, 5000) : refreshRate;
  useEffect(() => {
    loadDrones();
    intervalRef.current = setInterval(loadDrones, effectiveInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadDrones, effectiveInterval]);

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

  const handleToggleNoFlyLayer = useCallback((layerId: string) => {
    setEnabledNoFlyLayers(prev =>
      prev.includes(layerId) ? prev.filter(id => id !== layerId) : [...prev, layerId]
    );
  }, []);

  const handleToggleNoFlyCategory = useCallback((category: NoFlyCategory) => {
    const catLayers = getLayersByCategory(category);
    const catIds = catLayers.map(l => l.id);
    setEnabledNoFlyLayers(prev => {
      const allEnabled = catIds.every(id => prev.includes(id));
      if (allEnabled) {
        return prev.filter(id => !catIds.includes(id));
      }
      return [...prev.filter(id => !catIds.includes(id)), ...catIds];
    });
  }, []);

  const handleToggleAllNoFly = useCallback((enabled: boolean) => {
    setEnabledNoFlyLayers(enabled ? NFZ_LAYERS.map(l => l.id) : []);
  }, []);

  const activeNoFlyLayers = noFlyEnabled ? enabledNoFlyLayers : [];

  // Compute NFZ bounds from position + radius (limits WMS tile loading area)
  const nfzCenter = userLocation
    ? { lat: userLocation.latitude, lon: userLocation.longitude }
    : DEFAULT_CENTER;
  const nfzBounds = useMemo(() => {
    if (!nfzRadiusEnabled || !noFlyEnabled) return null;
    const center = L.latLng(nfzCenter.lat, nfzCenter.lon);
    // Convert radius in meters to approximate lat/lon delta
    const latDelta = (nfzRadius / 111320); // ~111km per degree latitude
    const lonDelta = (nfzRadius / (111320 * Math.cos(center.lat * Math.PI / 180)));
    return L.latLngBounds(
      [center.lat - latDelta, center.lng - lonDelta],
      [center.lat + latDelta, center.lng + lonDelta],
    );
  }, [nfzRadiusEnabled, noFlyEnabled, nfzCenter.lat, nfzCenter.lon, nfzRadius]);

  // Filter drones by selected altitude zone
  const activeZone = ALTITUDE_ZONES.find(z => z.id === altitudeZone) || ALTITUDE_ZONES[0];
  const filteredDrones = activeZone.id === 'all'
    ? drones
    : drones.filter(d => d.altitude >= activeZone.min && d.altitude < activeZone.max);

  // Derive selected violation record (null if deleted/cleared)
  const selectedViolationRecord = useMemo(() =>
    selectedViolationRecordId ? violationLog.records.find(r => r.id === selectedViolationRecordId) ?? null : null,
    [selectedViolationRecordId, violationLog.records],
  );

  // Clear selection when record no longer exists
  useEffect(() => {
    if (selectedViolationRecordId && !selectedViolationRecord) {
      setSelectedViolationRecordId(null);
    }
  }, [selectedViolationRecordId, selectedViolationRecord]);

  // Show only the selected drone's trail when a violation row is selected.
  // Falls back to all trails if the selected drone has no trail yet (e.g. just auto-tracked).
  const visibleTrails = useMemo(() => {
    if (selectedViolationRecord) {
      const selectedDroneId = selectedViolationRecord.droneId;
      const filtered = tracking.allTrails.filter(t => {
        const droneId = t.id.startsWith('track-') ? t.id.slice(6) : null;
        return droneId === selectedDroneId;
      });
      // If the selected drone has a trail, show only that; otherwise show all trails
      // so we don't accidentally hide everything when the trail is still building up
      if (filtered.length > 0) return filtered;
    }
    // No violation selected (or selected drone has no trail): show all trails except hidden ones
    if (violationLog.hiddenTrailDroneIds.size === 0) return tracking.allTrails;
    return tracking.allTrails.filter(t => {
      const droneId = t.id.startsWith('track-') ? t.id.slice(6) : null;
      if (droneId && violationLog.hiddenTrailDroneIds.has(droneId)) return false;
      return true;
    });
  }, [tracking.allTrails, violationLog.hiddenTrailDroneIds, selectedViolationRecord]);

  // Shared center for radii (GPS position or Bielefeld default)
  const currentCenter = userLocation
    ? { lat: userLocation.latitude, lon: userLocation.longitude }
    : DEFAULT_CENTER;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapComponent
        drones={filteredDrones}
        selectedDrone={selectedDrone}
        userLocation={userLocation}
        onDroneClick={handleDroneClick}
        activeNoFlyLayers={activeNoFlyLayers}
        nfzBounds={nfzBounds}
        nfzRadiusCenter={nfzRadiusEnabled && noFlyEnabled ? nfzCenter : null}
        nfzRadiusMeters={nfzRadiusEnabled && noFlyEnabled ? nfzRadius : null}
        droneRadiusCenter={radiusEnabled ? currentCenter : null}
        droneRadiusMeters={radiusEnabled ? radius : null}
        trails={visibleTrails}
        flightZones={flightZones.zones}
        drawingMode={flightZones.drawingMode}
        pendingPoints={flightZones.pendingPoints}
        snappable={flightZones.snappable}
        onMapClickForZone={flightZones.addPoint}
        focusPosition={focusPosition}
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
        gap: 8,
        flexWrap: 'wrap',
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>FlightArc</span>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontWeight: 400,
          }}>v{__APP_VERSION__}</span>
          <span style={{
            background: 'var(--bg-tertiary)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}>
            {altitudeZone !== 'all' ? `${filteredDrones.length}/` : ''}{droneCount} Drohne{droneCount !== 1 ? 'n' : ''}
          </span>
        </div>

        {/* Refresh rate control */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 13 }}>&#8635;</span>
          <select
            value={refreshRate}
            onChange={(e) => setRefreshRate(Number(e.target.value))}
            title={`Aktualisierungsrate${droneCount > 100 && refreshRate < 5000 ? ' (min. 5s bei >100 Drohnen)' : ''}`}
            data-testid="refresh-rate-select"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 4px',
              color: 'var(--text-primary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {REFRESH_RATES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {droneCount > 100 && refreshRate < 5000 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>min 5s</span>
          )}
        </div>

        {/* Radius control */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
        }}>
          {/* Toggle */}
          <button
            onClick={() => setRadiusEnabled(prev => !prev)}
            title={radiusEnabled ? 'Radius deaktivieren (alle anzeigen)' : 'Radius aktivieren'}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: radiusEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: radiusEnabled ? 16 : 2,
              transition: 'left 0.2s',
            }} />
          </button>

          {radiusEnabled ? (
            <>
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '2px 4px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <option value={5000}>5 km</option>
                <option value={10000}>10 km</option>
                <option value={25000}>25 km</option>
                <option value={50000}>50 km</option>
                <option value={100000}>100 km</option>
                <option value={250000}>250 km</option>
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Radius</span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Alle</span>
          )}
        </div>

        {/* Altitude zone filter */}
        <div style={{
          background: altitudeZone !== 'all' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
          border: `1px solid ${altitudeZone !== 'all' ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          position: 'relative',
        }}>
          <span style={{ fontSize: 14 }}>&#9650;</span>
          <select
            value={altitudeZone}
            onChange={(e) => setAltitudeZone(e.target.value)}
            title={activeZone.description}
            data-testid="altitude-zone-select"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 4px',
              color: activeZone.color,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: altitudeZone !== 'all' ? 600 : 400,
            }}
          >
            {ALTITUDE_ZONES.map(z => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
          {altitudeZone !== 'all' && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeZone.description.split('–')[0].trim()}
            </span>
          )}
        </div>

        {/* No-fly zones toggle */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              if (!noFlyEnabled) {
                setNoFlyEnabled(true);
                setNoFlyPanelOpen(true);
              } else {
                setNoFlyPanelOpen(prev => !prev);
              }
            }}
            title="Flugverbotszonen"
            data-testid="nofly-toggle"
            style={{
              background: noFlyEnabled ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${noFlyEnabled ? 'var(--status-error)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              color: noFlyEnabled ? 'var(--status-error)' : 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 16 }}>&#9888;</span>
            <span>NFZ</span>
            {noFlyEnabled && enabledNoFlyLayers.length > 0 && (
              <span style={{
                background: 'var(--status-error)',
                color: '#fff',
                borderRadius: 8,
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 16,
                textAlign: 'center',
              }}>
                {enabledNoFlyLayers.length}
              </span>
            )}
          </button>

          {/* Disable button (only when enabled) */}
          {noFlyEnabled && (
            <button
              onClick={() => {
                setNoFlyEnabled(false);
                setNoFlyPanelOpen(false);
              }}
              title="Flugverbotszonen ausblenden"
              data-testid="nofly-disable"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                lineHeight: 1,
              }}
            >
              &#10005;
            </button>
          )}

          {/* Layer selection panel */}
          {noFlyPanelOpen && (
            <NoFlyZonesPanel
              enabledLayers={enabledNoFlyLayers}
              onToggleLayer={handleToggleNoFlyLayer}
              onToggleCategory={handleToggleNoFlyCategory}
              onToggleAll={handleToggleAllNoFly}
              onClose={() => setNoFlyPanelOpen(false)}
            />
          )}
        </div>

        {/* NFZ radius control (only when NFZ is enabled) */}
        {noFlyEnabled && (
          <div
            data-testid="nfz-radius-control"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <button
              onClick={() => setNfzRadiusEnabled(prev => !prev)}
              data-testid="nfz-radius-toggle"
              title={nfzRadiusEnabled ? 'NFZ Radius deaktivieren' : 'NFZ Radius aktivieren'}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                border: 'none',
                background: nfzRadiusEnabled ? 'var(--status-error)' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 2,
                left: nfzRadiusEnabled ? 16 : 2,
                transition: 'left 0.2s',
              }} />
            </button>

            {nfzRadiusEnabled ? (
              <>
                <select
                  value={nfzRadius}
                  onChange={(e) => setNfzRadius(Number(e.target.value))}
                  data-testid="nfz-radius-select"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 4px',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <option value={10000}>10 km</option>
                  <option value={25000}>25 km</option>
                  <option value={50000}>50 km</option>
                  <option value={100000}>100 km</option>
                  <option value={250000}>250 km</option>
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>NFZ Radius</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>NFZ &#x221E;</span>
            )}
          </div>
        )}

        {/* Tracking button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setTrackingPanelOpen(prev => !prev)}
            title="Tracking"
            style={{
              background: hasActiveTracking ? 'rgba(249, 115, 22, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${hasActiveTracking ? '#f97316' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              color: hasActiveTracking ? '#f97316' : 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>&#9678;</span>
            <span>Tracking</span>
            {(tracking.trackedFlights.size > 0 || tracking.archives.length > 0) && (
              <span style={{
                background: '#f97316',
                color: '#fff',
                borderRadius: 8,
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 16,
                textAlign: 'center',
              }}>
                {tracking.trackedFlights.size + tracking.archives.length}
              </span>
            )}
          </button>

          {trackingPanelOpen && (
            <TrackingPanel
              trackedFlights={tracking.trackedFlights}
              archives={tracking.archives}
              onUntrack={tracking.untrackDrone}
              onArchive={tracking.archiveFlight}
              onDeleteArchive={tracking.removeArchive}
              onTrack={(droneId) => {
                const drone = drones.find(d => d.id === droneId);
                if (drone) tracking.trackDrone(drone);
              }}
              onClose={() => setTrackingPanelOpen(false)}
            />
          )}
        </div>

        {/* Flight Zones button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setZonesPanelOpen(prev => !prev)}
            title="Flugzonen"
            data-testid="zones-toggle"
            style={{
              background: flightZones.zones.length > 0 || flightZones.drawingMode
                ? 'rgba(59, 130, 246, 0.15)'
                : 'var(--bg-secondary)',
              border: `1px solid ${flightZones.zones.length > 0 || flightZones.drawingMode ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              color: flightZones.zones.length > 0 || flightZones.drawingMode
                ? 'var(--accent)'
                : 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>&#9634;</span>
            <span>Zonen</span>
            {flightZones.zones.length > 0 && (
              <span style={{
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 8,
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 16,
                textAlign: 'center',
              }}>
                {flightZones.zones.length}
              </span>
            )}
            {flightZones.drawingMode && (
              <span style={{
                background: '#22c55e',
                color: '#fff',
                borderRadius: 4,
                padding: '0 5px',
                fontSize: 9,
                fontWeight: 700,
              }}>
                ZEICHNEN
              </span>
            )}
          </button>

          {zonesPanelOpen && (
            <FlightZonesPanel
              zones={flightZones.zones}
              drawingMode={flightZones.drawingMode}
              pendingPoints={flightZones.pendingPoints}
              snappable={flightZones.snappable}
              onStartDrawing={flightZones.startDrawing}
              onCancelDrawing={flightZones.cancelDrawing}
              onUndoPoint={flightZones.undoLastPoint}
              onFinishDrawing={flightZones.finishDrawing}
              onDeleteZone={flightZones.deleteZone}
              onSelectZone={() => {}}
              onAssignZone={(zoneId) => setAssignZoneId(zoneId)}
              onClose={() => setZonesPanelOpen(false)}
            />
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={() => navigate('/settings')}
          title="Einstellungen"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          &#9881;
        </button>

        {/* User info & logout */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginLeft: 'auto',
        }}>
          {user && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {user.display_name}
              {user.tenant_name && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({user.tenant_name})
                </span>
              )}
            </span>
          )}
          {user && (user.role === 'super_admin' || user.role === 'tenant_admin') && (
            <button
              onClick={() => navigate('/admin')}
              title="Administration"
              data-testid="admin-button"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 14, padding: '2px 4px',
              }}
            >
              &#9881;&#65039;
            </button>
          )}
          <button
            onClick={logout}
            title="Abmelden"
            data-testid="logout-button"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px',
            }}
          >
            Abmelden
          </button>
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
        <StatusPanel
          drone={selectedDrone}
          onClose={handlePanelClose}
          enabledNoFlyLayers={noFlyEnabled ? enabledNoFlyLayers : undefined}
          trackingState={tracking.isTracked(selectedDrone.id)?.state || null}
          onTrack={tracking.trackDrone}
          onUntrack={tracking.untrackDrone}
          onArchive={tracking.archiveFlight}
          bottomOffset={violationTableHeight}
        />
      )}

      {/* Zone assign modal */}
      {assignZoneId && (() => {
        const zone = flightZones.zones.find(z => z.id === assignZoneId);
        if (!zone) return null;
        return (
          <ZoneAssignPanel
            zone={zone}
            drones={drones}
            onSave={async (zoneId, toAssign, toUnassign) => {
              if (toAssign.length > 0) await flightZones.assignDrones(zoneId, toAssign);
              if (toUnassign.length > 0) await flightZones.unassignDrones(zoneId, toUnassign);
              setAssignZoneId(null);
            }}
            onUpdateZone={flightZones.updateZone}
            onClose={() => setAssignZoneId(null)}
          />
        );
      })()}

      {/* Violation table */}
      <ViolationTable
        records={violationLog.records}
        collapsed={violationLog.collapsed}
        selectedRecordId={selectedViolationRecordId}
        onToggleCollapsed={() => violationLog.setCollapsed(!violationLog.collapsed)}
        onHeightChange={handleViolationHeightChange}
        onDeleteRecord={(recordId) => {
          pollSeqRef.current++;
          const droneId = violationLog.getDroneIdForRecord(recordId);
          if (droneId && !violationLog.hasOtherRecords(droneId, recordId)) {
            tracking.untrackDrone(droneId);
          }
          violationLog.deleteRecord(recordId);
        }}
        onToggleTracking={(recordId) => violationLog.toggleTrackingVisible(recordId)}
        onClearAll={() => {
          // Invalidate any in-flight poll so stale results don't overwrite fresh state
          pollSeqRef.current++;
          const droneIds = new Set(violationLog.records.map(r => r.droneId));
          for (const droneId of droneIds) {
            tracking.untrackDrone(droneId);
          }
          violationLog.clearAll();
          setSelectedViolationRecordId(null);
        }}
        onSelectRecord={(recordId) => {
          setSelectedViolationRecordId(recordId);
          const record = violationLog.records.find(r => r.id === recordId);
          if (record) {
            const drone = drones.find(d => d.id === record.droneId);
            if (drone) {
              setSelectedDrone(drone);
              setFocusPosition({ lat: drone.latitude, lon: drone.longitude });
            }
          }
        }}
      />
    </div>
  );
}
