import { useState, useEffect, useRef } from 'react';
import type { Drone, AircraftLookup } from '../types/drone';
import { useNavigate } from 'react-router-dom';
import { lookupAircraft } from '../api';
import { DIPUL_WMS_URL, getWmsLayerString, NFZ_LAYERS } from '../config/noFlyZones';

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
}

const SOURCE_COLORS: Record<string, string> = {
  simulator: '#3b82f6',
  opensky: '#f59e0b',
  adsbfi: '#8b5cf6',
  adsblol: '#ec4899',
  ogn: '#10b981',
};

export default function StatusPanel({ drone, onClose, enabledNoFlyLayers }: Props) {
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

  const prevIdRef = useRef<string>('');

  // Lookup aircraft info when drone changes
  useEffect(() => {
    const droneKey = drone.basic_id || drone.id;
    if (droneKey === prevIdRef.current) return;
    prevIdRef.current = droneKey;

    // Only lookup for external sources (have hex codes)
    if (drone.source === 'simulator') {
      setLookup(null);
      setLookupLoading(false);
      setLookupError(null);
    } else {
      setLookupLoading(true);
      setLookupError(null);
      const callsign = drone.name && drone.name !== 'Unknown' ? drone.name.replace(/\s/g, '') : undefined;
      lookupAircraft(droneKey, callsign)
        .then(data => {
          setLookup(data);
          setLookupLoading(false);
        })
        .catch(err => {
          setLookupError(err.message);
          setLookupLoading(false);
        });
    }
  }, [drone.basic_id, drone.id, drone.source, drone.name]);

  // Check if drone is in any NFZ (via DIPUL WMS GetFeatureInfo)
  useEffect(() => {
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
        if (data?.features?.length > 0) {
          const zones: NfzFeature[] = data.features.map((f: any) => ({
            name: f.properties?.name || 'Unbekannte Zone',
            type_code: f.properties?.type_code || '',
          }));
          // Deduplicate by name
          const seen = new Set<string>();
          setNfzZones(zones.filter(z => {
            if (seen.has(z.name)) return false;
            seen.add(z.name);
            return true;
          }));
        } else {
          setNfzZones([]);
        }
        setNfzLoading(false);
      })
      .catch(() => {
        setNfzZones([]);
        setNfzLoading(false);
      });

    return () => controller.abort();
  }, [drone.latitude, drone.longitude, enabledNoFlyLayers]);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 350,
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      zIndex: 1001,
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
        {/* NFZ Warning */}
        {nfzLoading ? (
          <div style={{
            padding: '8px 12px',
            marginBottom: 16,
            background: 'var(--bg-tertiary)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Spinner size={14} /> NFZ-Pr&uuml;fung...
          </div>
        ) : nfzZones.length > 0 ? (
          <div style={{
            padding: '10px 12px',
            marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--status-error)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>&#9888;</span>
              In Flugverbotszone ({nfzZones.length})
            </div>
            {nfzZones.slice(0, 4).map((z, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '1px 0' }}>
                {z.name}
                {z.type_code && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({z.type_code.replace(/_/g, ' ')})</span>}
              </div>
            ))}
            {nfzZones.length > 4 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>+{nfzZones.length - 4} weitere</div>
            )}
          </div>
        ) : null}

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
          <DataRow label="L&auml;ngengrad" value={drone.longitude.toFixed(6)} />
          <DataRow label="H&ouml;he" value={`${drone.altitude.toFixed(1)} m`} />
          <DataRow label="Geschwindigkeit" value={`${drone.speed.toFixed(1)} m/s`} />
          <DataRow label="Flugmuster" value={drone.flight_pattern} />
          {drone.distance !== undefined && (
            <DataRow label="Entfernung" value={`${(drone.distance / 1000).toFixed(2)} km`} />
          )}
        </Section>

        {/* Pilot */}
        {drone.pilot_latitude != null && drone.pilot_longitude != null && (
          <Section title="Pilot">
            <DataRow label="Breitengrad" value={drone.pilot_latitude.toFixed(6)} />
            <DataRow label="L&auml;ngengrad" value={drone.pilot_longitude.toFixed(6)} />
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
      </div>

      {/* Footer */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--border)',
      }}>
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

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '3px 0',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 12 }}>{value}</span>
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
