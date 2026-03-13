import { useState, useEffect, useRef, useCallback } from 'react';
import type { Drone, AircraftLookup } from '../types/drone';
import { useNavigate } from 'react-router-dom';
import { lookupAircraft, reverseGeocode } from '../api';
import { getElevation, onGridReady, isGridReady } from '../elevationGrid';
import { DIPUL_WMS_URL, getWmsLayerString, NFZ_LAYERS } from '../config/noFlyZones';
import { getCachedLookup, setCachedLookup, getCachedNfz, setCachedNfz } from '../lookupCache';
import type { TrackingState } from '../types/drone';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktiv', color: 'var(--status-active)' },
  idle: { label: 'Leerlauf', color: 'var(--status-idle)' },
  error: { label: 'Fehler', color: 'var(--status-error)' },
  lost: { label: 'Verloren', color: 'var(--status-lost)' },
};

function signalBar(rssi: number): { level: number; color: string; label: string } {
  if (rssi >= -50) return { level: 4, color: 'var(--signal-good)', label: 'Stark' };
  if (rssi >= -60) return { level: 3, color: 'var(--signal-good)', label: 'Gut' };
  if (rssi >= -70) return { level: 2, color: 'var(--signal-mid)', label: 'Mittel' };
  if (rssi >= -80) return { level: 1, color: 'var(--signal-bad)', label: 'Schwach' };
  return { level: 0, color: 'var(--signal-bad)', label: 'Kritisch' };
}

function batteryColor(pct: number): string {
  if (pct > 50) return 'var(--signal-good)';
  if (pct > 20) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('de-DE');
}

// ICAO aircraft class codes
const AIRCRAFT_CLASS_LABELS: Record<string, string> = {
  L1P: 'Einmotorig (Propeller)',
  L1T: 'Einmotorig (Turboprop)',
  L1J: 'Einmotorig (Jet)',
  L2P: 'Zweimotorig (Propeller)',
  L2T: 'Zweimotorig (Turboprop)',
  L2J: 'Zweimotorig (Jet)',
  L4J: 'Viermotorig (Jet)',
  H1T: 'Helikopter (1 Turbine)',
  H2T: 'Helikopter (2 Turbinen)',
  G: 'Segelflugzeug',
};

interface NfzFeature {
  name: string;
  type_code: string;
}

interface Props {
  drone: Drone;
  onClose: () => void;
  enabledNoFlyLayers?: string[];
  trackingState?: TrackingState | null;
  onTrack?: (drone: Drone) => void;
  onUntrack?: (droneId: string) => void;
  onArchive?: (droneId: string) => Promise<void>;
  bottomOffset?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  simulator: '#3b82f6',
  opensky: '#f59e0b',
  adsbfi: '#8b5cf6',
  adsblol: '#ec4899',
  ogn: '#10b981',
  receiver: '#14b8a6',
};

export default function StatusPanel({ drone, onClose, enabledNoFlyLayers, trackingState, onTrack, onUntrack, onArchive, bottomOffset = 0 }: Props) {
  const navigate = useNavigate();
  const statusInfo = STATUS_LABELS[drone.status] || STATUS_LABELS.lost;
  const signal = drone.signal_strength != null ? signalBar(drone.signal_strength) : null;
  const sourceColor = SOURCE_COLORS[drone.source || ''] || '#6b7280';

  // Async aircraft lookup
  const [lookup, setLookup] = useState<AircraftLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // NFZ zone check
  const [nfzZones, setNfzZones] = useState<NfzFeature[]>([]);
  const [nfzLoading, setNfzLoading] = useState(false);
  const prevNfzPosRef = useRef<string>('');

  // Pilot address (reverse geocoded)
  const [pilotAddress, setPilotAddress] = useState<string | null>(null);
  const prevPilotPosRef = useRef<string>('');

  useEffect(() => {
    if (drone.pilot_latitude == null || drone.pilot_longitude == null) {
      setPilotAddress(null);
      return;
    }
    const key = `${drone.pilot_latitude.toFixed(4)}_${drone.pilot_longitude.toFixed(4)}`;
    if (key === prevPilotPosRef.current) return;
    prevPilotPosRef.current = key;
    setPilotAddress(null);
    reverseGeocode(drone.pilot_latitude, drone.pilot_longitude).then(addr => {
      if (addr) setPilotAddress(addr);
    });
  }, [drone.pilot_latitude, drone.pilot_longitude]);

  // Manual NFZ re-check
  const triggerNfzCheck = useCallback(() => {
    prevNfzPosRef.current = ''; // reset to force re-check
    setNfzLoading(true);
  }, []);

  // Ground elevation from pre-computed grid (synchronous, O(1) bilinear interpolation)
  const [groundElevation, setGroundElevation] = useState<number | null>(
    () => getElevation(drone.latitude, drone.longitude),
  );

  const prevIdRef = useRef<string>('');

  // Update elevation when drone moves or grid becomes ready
  useEffect(() => {
    const elev = getElevation(drone.latitude, drone.longitude);
    setGroundElevation(elev);

    if (elev !== null) return; // Already have it
    // Grid might still be loading — subscribe to updates
    const unsub = onGridReady(() => {
      const e = getElevation(drone.latitude, drone.longitude);
      if (e !== null) setGroundElevation(e);
    });
    return unsub;
  }, [drone.latitude, drone.longitude]);

  // Lookup aircraft info when drone changes — use shared cache
  useEffect(() => {
    const droneKey = drone.basic_id || drone.id;
    if (droneKey === prevIdRef.current) return;
    prevIdRef.current = droneKey;

    // Check shared cache first
    const cached = getCachedLookup(droneKey);
    if (cached) {
      setLookup(cached);
      setLookupLoading(false);
      setLookupError(null);
      return;
    }

    // Only lookup for external sources (have hex codes)
    if (drone.source === 'simulator') {
      setLookup(null);
      setLookupLoading(false);
      setLookupError(null);
    } else {
      setLookupLoading(true);
      setLookupError(null);
      const callsign = drone.name && drone.name !== 'Unknown' ? drone.name.replace(/\s/g, '') : undefined;
      const icaoHex = drone.icao_hex || undefined;
      lookupAircraft(droneKey, callsign, icaoHex)
        .then(data => {
          setCachedLookup(droneKey, data);
          setLookup(data);
          setLookupLoading(false);
        })
        .catch(err => {
          setLookupError(err.message);
          setLookupLoading(false);
        });
    }
  }, [drone.basic_id, drone.id, drone.source, drone.name, drone.icao_hex]);

  // Check if drone is in any NFZ (via DIPUL WMS GetFeatureInfo) — with shared cache
  useEffect(() => {
    const posKey = `${drone.latitude.toFixed(4)}_${drone.longitude.toFixed(4)}`;
    if (posKey === prevNfzPosRef.current) return;
    prevNfzPosRef.current = posKey;

    // Check shared cache first
    const cached = getCachedNfz(posKey);
    if (cached) {
      setNfzZones(cached);
      setNfzLoading(false);
      return;
    }

    const allLayers = enabledNoFlyLayers && enabledNoFlyLayers.length > 0
      ? getWmsLayerString(enabledNoFlyLayers)
      : getWmsLayerString(NFZ_LAYERS.map(l => l.id));

    if (!allLayers) {
      setNfzZones([]);
      return;
    }

    setNfzLoading(true);
    const controller = new AbortController();

    // Direct DIPUL WMS query (CORS allowed)
    const delta = 0.0005;
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetFeatureInfo',
      layers: allLayers,
      query_layers: allLayers,
      crs: 'EPSG:4326',
      bbox: `${drone.latitude - delta},${drone.longitude - delta},${drone.latitude + delta},${drone.longitude + delta}`,
      width: '101',
      height: '101',
      i: '50',
      j: '50',
      info_format: 'application/json',
    });

    fetch(`${DIPUL_WMS_URL}?${params}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        let zones: NfzFeature[] = [];
        if (data?.features?.length > 0) {
          const raw: NfzFeature[] = data.features.map((f: any) => ({
            name: f.properties?.name || 'Unbekannte Zone',
            type_code: f.properties?.type_code || '',
          }));
          const seen = new Set<string>();
          zones = raw.filter(z => {
            if (seen.has(z.name)) return false;
            seen.add(z.name);
            return true;
          });
        }
        setCachedNfz(posKey, zones);
        setNfzZones(zones);
        setNfzLoading(false);
      })
      .catch(() => {
        setNfzZones([]);
        setNfzLoading(false);
      });

    return () => controller.abort();
  }, [drone.latitude, drone.longitude, enabledNoFlyLayers]);

  return (
    <div
      data-testid="status-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: bottomOffset,
        width: 350,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        zIndex: 2400,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{drone.name}</span>
            {drone.source_label && (
              <span style={{
                background: `${sourceColor}22`,
                color: sourceColor,
                padding: '1px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
              }}>
                {drone.source_label}
                {drone.receiver_count && drone.receiver_count > 1 && ` (${drone.receiver_count} Empfänger)`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {drone.basic_id}{drone.mac ? ` \u00b7 ${drone.mac}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Panel schließen"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 20,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: statusInfo.color,
            boxShadow: `0 0 6px ${statusInfo.color}`,
          }} />
          <span style={{ color: statusInfo.color, fontWeight: 600 }}>{statusInfo.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {formatTimestamp(drone.last_update)}
          </span>
        </div>

        {/* Signal */}
        <Section title="Signal">
          {signal ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 5,
                      height: 4 + i * 4,
                      borderRadius: 1,
                      background: i <= signal.level ? signal.color : 'var(--border)',
                    }}
                  />
                ))}
              </div>
              <span style={{ color: signal.color, fontSize: 14, fontWeight: 500 }}>
                {drone.signal_strength} dBm
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({signal.label})</span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>N/A</span>
          )}
        </Section>

        {/* Battery */}
        <Section title="Batterie">
          {drone.battery != null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 120,
                height: 8,
                background: 'var(--bg-primary)',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${drone.battery}%`,
                  height: '100%',
                  background: batteryColor(drone.battery),
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ color: batteryColor(drone.battery), fontWeight: 500 }}>
                {drone.battery.toFixed(1)}%
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>N/A</span>
          )}
        </Section>

        {/* Position */}
        <Section title="Position">
          <DataRow label="Breitengrad" value={drone.latitude.toFixed(6)} />
          <DataRow label="Längengrad" value={drone.longitude.toFixed(6)} />
          <DataRow
            label="Höhe MSL"
            value={`${(drone.altitude_baro ?? drone.altitude).toFixed(1)} m`}
          />
          <DataRow
            label="Höhe AGL"
            value={groundElevation != null
              ? `${((drone.altitude_baro ?? drone.altitude) - groundElevation).toFixed(1)} m`
              : undefined}
            loading={groundElevation == null}
          />
          {drone.altitude_geom != null && (
            <DataRow label="Höhe GPS" value={`${drone.altitude_geom.toFixed(1)} m`} />
          )}
          <DataRow
            label="Gelände"
            value={groundElevation != null ? `${groundElevation.toFixed(0)} m MSL` : undefined}
            loading={groundElevation == null}
          />
          <DataRow label="Geschwindigkeit" value={`${drone.speed.toFixed(1)} m/s (${(drone.speed * 3.6).toFixed(0)} km/h)`} />
          <DataRow label="Flugmuster" value={drone.flight_pattern} />
          {drone.distance !== undefined && (
            <DataRow label="Entfernung" value={`${(drone.distance / 1000).toFixed(2)} km`} />
          )}
        </Section>

        {/* Pilot */}
        {drone.pilot_latitude != null && drone.pilot_longitude != null && (
          <Section title="Pilot">
            <DataRow label="Breitengrad" value={drone.pilot_latitude.toFixed(6)} />
            <DataRow label="Längengrad" value={drone.pilot_longitude.toFixed(6)} />
            <DataRow
              label="Standort"
              value={pilotAddress || undefined}
              loading={!pilotAddress}
            />
          </Section>
        )}

        {/* FAA Data */}
        {drone.faa_data && (
          <Section title="FAA Registrierung">
            <DataRow label="Name" value={drone.faa_data.registrant_name} />
            <DataRow label="Hersteller" value={drone.faa_data.manufacturer} />
            <DataRow label="Modell" value={drone.faa_data.model} />
            <DataRow label="Seriennr." value={drone.faa_data.serial_number} />
            <DataRow label="Gewicht" value={`${drone.faa_data.weight} kg`} />
            <DataRow label="Zweck" value={drone.faa_data.purpose} />
            <DataRow label="Status" value={drone.faa_data.status} />
          </Section>
        )}

        {/* OGN Aircraft Type (always shown for OGN source if available) */}
        {drone.source === 'ogn' && drone.ogn_aircraft_type_label && !lookupLoading && (
          <Section title="OGN Typ">
            <DataRow label="Kategorie" value={drone.ogn_aircraft_type_label} />
            {drone.icao_hex && <DataRow label="ICAO Hex" value={drone.icao_hex} />}
          </Section>
        )}

        {/* Aircraft Lookup (async loaded) */}
        {lookupLoading && (
          <Section title="Luftfahrzeug-Daten">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
              <Spinner size={14} /> Daten werden geladen...
            </div>
          </Section>
        )}
        {lookupError && (
          <Section title="Luftfahrzeug-Daten">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lookup fehlgeschlagen</span>
          </Section>
        )}
        {lookup && !lookupLoading && (
          <>
            {lookup.found ? (
              <Section title="Luftfahrzeug-Daten">
                {lookup.photo_url && (
                  <div style={{ marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img
                      src={lookup.photo_url}
                      alt={lookup.type || 'Aircraft'}
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {lookup.type && <DataRow label="Typ" value={lookup.type} />}
                {lookup.manufacturer && <DataRow label="Hersteller" value={lookup.manufacturer} />}
                {lookup.registration && <DataRow label="Kennzeichen" value={lookup.registration} />}
                {lookup.owner && <DataRow label="Halter" value={lookup.owner} />}
                {lookup.operator && lookup.operator !== lookup.owner && <DataRow label="Betreiber" value={lookup.operator} />}
                {lookup.country && <DataRow label="Land" value={lookup.country} />}
                {lookup.serial_number && <DataRow label="Seriennr." value={lookup.serial_number} />}
                {lookup.icao_aircraft_class && (
                  <DataRow
                    label="Klasse"
                    value={AIRCRAFT_CLASS_LABELS[lookup.icao_aircraft_class] || lookup.icao_aircraft_class}
                  />
                )}
                {lookup.source_db && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Quelle: {lookup.source_db}
                  </div>
                )}
              </Section>
            ) : (
              <Section title="Luftfahrzeug-Daten">
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Daten gefunden</span>
              </Section>
            )}

            {/* Flight route (from callsign) */}
            {(lookup.origin || lookup.destination) && (
              <Section title="Flugroute">
                {lookup.airline && <DataRow label="Airline" value={lookup.airline} />}
                {lookup.origin && (
                  <DataRow
                    label="Von"
                    value={`${lookup.origin.city || lookup.origin.name || '?'} (${lookup.origin.iata || lookup.origin.icao || '?'})`}
                  />
                )}
                {lookup.destination && (
                  <DataRow
                    label="Nach"
                    value={`${lookup.destination.city || lookup.destination.name || '?'} (${lookup.destination.iata || lookup.destination.icao || '?'})`}
                  />
                )}
              </Section>
            )}
          </>
        )}

        {/* NFZ Check — at bottom with refresh button */}
        <div style={{
          marginTop: 8,
          padding: '10px 12px',
          background: nfzZones.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)',
          border: nfzZones.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
          borderRadius: 8,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: nfzZones.length > 0 ? 6 : 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              {nfzZones.length > 0 ? (
                <span style={{ fontWeight: 700, color: 'var(--status-error)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>&#9888;</span>
                  In Flugverbotszone ({nfzZones.length})
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>
                  {nfzLoading ? 'NFZ wird gepr\u00fcft...' : 'Keine Flugverbotszonen'}
                </span>
              )}
            </div>
            <button
              onClick={triggerNfzCheck}
              title="NFZ erneut pr\u00fcfen"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 16, padding: '2px 4px',
                display: 'flex', alignItems: 'center',
                animation: nfzLoading ? 'spin 1s linear infinite' : 'none',
                opacity: nfzLoading ? 0.5 : 1,
              }}
            >
              &#8635;
            </button>
          </div>
          {nfzZones.length > 0 && nfzZones.slice(0, 4).map((z, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '1px 0' }}>
              {z.name}
              {z.type_code && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({z.type_code.replace(/_/g, ' ')})</span>}
            </div>
          ))}
          {nfzZones.length > 4 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>+{nfzZones.length - 4} weitere</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Tracking controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(!trackingState || trackingState === 'untracked') && onTrack && (
            <button
              onClick={() => onTrack(drone)}
              style={{
                flex: 1,
                padding: '7px 12px',
                background: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid #f97316',
                color: '#f97316',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>&#9678;</span>
              {trackingState === 'untracked' ? 'Erneut tracken' : 'Tracking starten'}
            </button>
          )}
          {trackingState === 'tracking' && (
            <>
              <button
                onClick={() => onUntrack?.(drone.id)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Stoppen
              </button>
              <button
                onClick={() => onArchive?.(drone.id)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Archivieren
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => navigate(`/drone/${drone.id}`)}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Details anzeigen
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-muted)',
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value, loading }: { label: string; value?: string; loading?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '3px 0',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Spinner size={10} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Laden...</span>
        </span>
      ) : (
        <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 12 }}>{value ?? 'N/A'}</span>
      )}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}
