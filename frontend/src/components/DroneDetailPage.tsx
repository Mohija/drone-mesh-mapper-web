import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Drone, DroneHistoryEntry, AircraftLookup } from '../types/drone';
import { fetchDrone, fetchDroneHistory, lookupAircraft } from '../api';
import { getElevation, onGridReady } from '../elevationGrid';
import { DIPUL_WMS_URL, getWmsLayerString, NFZ_LAYERS } from '../config/noFlyZones';
import { getCachedLookup, setCachedLookup, getCachedNfz, setCachedNfz } from '../lookupCache';
import StatusHistory from './StatusHistory';

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--status-active)',
  idle: 'var(--status-idle)',
  error: 'var(--status-error)',
  lost: 'var(--status-lost)',
};

const SOURCE_COLORS: Record<string, string> = {
  simulator: '#3b82f6',
  opensky: '#f59e0b',
  adsbfi: '#8b5cf6',
  adsblol: '#ec4899',
  ogn: '#10b981',
};

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

function signalColor(rssi: number): string {
  if (rssi >= -50) return 'var(--signal-good)';
  if (rssi >= -70) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

function batteryColor(pct: number): string {
  if (pct > 50) return 'var(--signal-good)';
  if (pct > 20) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

export default function DroneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [drone, setDrone] = useState<Drone | null>(null);
  const [history, setHistory] = useState<DroneHistoryEntry[]>([]);
  const [gone, setGone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const failCountRef = useRef(0);
  const everLoadedRef = useRef(false);

  // Aircraft lookup — initialised from cache
  const [lookup, setLookup] = useState<AircraftLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupDoneRef = useRef<string>('');

  // NFZ zone check — initialised from cache
  const [nfzZones, setNfzZones] = useState<NfzFeature[]>([]);
  const [nfzLoading, setNfzLoading] = useState(false);
  const nfzDoneRef = useRef<string>('');

  // Ground elevation from pre-computed grid (synchronous bilinear interpolation)
  const [groundElevation, setGroundElevation] = useState<number | null>(null);

  // Delayed loading indicator — only show after 400ms to avoid brief flickers
  const [showLoading, setShowLoading] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isLoading = lookupLoading || nfzLoading;

  useEffect(() => {
    if (isLoading) {
      loadingTimerRef.current = setTimeout(() => setShowLoading(true), 400);
    } else {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setShowLoading(false);
    }
    return () => { if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current); };
  }, [isLoading]);

  // Ground elevation from pre-computed grid
  useEffect(() => {
    if (!drone) return;
    const elev = getElevation(drone.latitude, drone.longitude);
    setGroundElevation(elev);

    if (elev !== null) return;
    // Grid might still be loading
    const unsub = onGridReady(() => {
      const e = getElevation(drone.latitude, drone.longitude);
      if (e !== null) setGroundElevation(e);
    });
    return unsub;
  }, [drone]);

  // Polling: keep last known drone data on temporary 404s
  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [droneData, historyData] = await Promise.all([
          fetchDrone(id!),
          fetchDroneHistory(id!),
        ]);
        setDrone(droneData);
        setHistory(historyData.history);
        setGone(false);
        failCountRef.current = 0;
        everLoadedRef.current = true;
      } catch {
        failCountRef.current += 1;
        // Only show "gone" after 5 consecutive failures (10s) AND we had data before
        if (failCountRef.current >= 5 && everLoadedRef.current) {
          setGone(true);
        }
        // If we never loaded the drone at all, show error immediately
        if (!everLoadedRef.current && failCountRef.current >= 2) {
          setGone(true);
        }
      }
    }

    load();
    intervalRef.current = setInterval(load, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  // Aircraft lookup — runs once, result goes to shared cache
  useEffect(() => {
    if (!drone) return;
    const droneKey = drone.basic_id || drone.id;
    if (droneKey === lookupDoneRef.current) return;
    lookupDoneRef.current = droneKey;

    // Check shared cache first
    const cached = getCachedLookup(droneKey);
    if (cached) {
      setLookup(cached);
      setLookupLoading(false);
      setLookupError(null);
      return;
    }

    if (drone.source === 'simulator') {
      setLookup(null);
      setLookupLoading(false);
      setLookupError(null);
      return;
    }

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
      .catch(err => { setLookupError(err.message); setLookupLoading(false); });
  }, [drone]);

  // NFZ zone check — runs once, result goes to shared cache
  useEffect(() => {
    if (!drone) return;
    const posKey = `${drone.latitude.toFixed(4)}_${drone.longitude.toFixed(4)}`;
    if (posKey === nfzDoneRef.current) return;
    nfzDoneRef.current = posKey;

    // Check shared cache first
    const cached = getCachedNfz(posKey);
    if (cached) {
      setNfzZones(cached);
      setNfzLoading(false);
      return;
    }

    const allLayers = getWmsLayerString(NFZ_LAYERS.map(l => l.id));
    if (!allLayers) { setNfzZones([]); return; }

    setNfzLoading(true);
    const controller = new AbortController();
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
      .catch(() => { setNfzZones([]); setNfzLoading(false); });

    return () => controller.abort();
  }, [drone]);

  // No drone data at all and confirmed gone
  if (!drone && gone) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>&#128681;</div>
        <div style={{ color: 'var(--status-error)', fontSize: 18 }}>Drohne nicht gefunden</div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 24px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Zur Karte
        </button>
      </div>
    );
  }

  if (!drone) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-secondary)',
      }}>
        Laden...
      </div>
    );
  }

  const statusColor = STATUS_COLORS[drone.status] || STATUS_COLORS.lost;

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          &#8592; Karte
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{drone.name}</span>
            {drone.source_label && (
              <span style={{
                background: `${SOURCE_COLORS[drone.source || ''] || '#6b7280'}22`,
                color: SOURCE_COLORS[drone.source || ''] || '#6b7280',
                padding: '2px 10px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {drone.source_label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {drone.basic_id}{drone.mac ? ` \u00b7 ${drone.mac}` : ''}
          </div>
        </div>
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: 20,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
          }} />
          <span style={{ color: statusColor, fontWeight: 600, fontSize: 13 }}>
            {drone.status.toUpperCase()}
          </span>
        </div>
        {gone && (
          <div style={{
            padding: '4px 12px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderRadius: 12,
            fontSize: 11,
            color: 'var(--status-error)',
            fontWeight: 600,
          }}>
            Signal verloren
          </div>
        )}
      </div>

      {/* Loading progress indicator — only after 400ms delay */}
      {showLoading && (
        <div style={{
          height: 3,
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            height: '100%',
            width: '40%',
            background: 'var(--accent)',
            borderRadius: 2,
            animation: 'loading-progress 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* NFZ Warning Banner — only show loading state after delay */}
      {nfzLoading && showLoading ? (
        <div style={{
          margin: '16px 24px 0',
          padding: '10px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Spinner size={14} /> Flugverbotszonen werden gepr&uuml;ft...
        </div>
      ) : nfzZones.length > 0 ? (
        <div style={{
          margin: '16px 24px 0',
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--status-error)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>&#9888;</span>
            In Flugverbotszone ({nfzZones.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {nfzZones.map((z, i) => (
              <span key={i} style={{
                fontSize: 12,
                padding: '3px 10px',
                background: 'rgba(239, 68, 68, 0.15)',
                borderRadius: 4,
                color: 'var(--text-primary)',
              }}>
                {z.name}
                {z.type_code && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({z.type_code.replace(/_/g, ' ')})</span>}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
        padding: 24,
        maxWidth: 1200,
      }}>
        {/* Live Stats */}
        <Card title="Live-Status">
          <StatGrid>
            <StatItem
              label="Signal"
              value={drone.signal_strength != null ? `${drone.signal_strength} dBm` : 'N/A'}
              color={drone.signal_strength != null ? signalColor(drone.signal_strength) : undefined}
            />
            <StatItem
              label="Batterie"
              value={drone.battery != null ? `${drone.battery.toFixed(1)}%` : 'N/A'}
              color={drone.battery != null ? batteryColor(drone.battery) : undefined}
            />
            <StatItem
              label="H&ouml;he MSL"
              value={`${(drone.altitude_baro ?? drone.altitude).toFixed(1)} m`}
            />
            <StatItem
              label="H&ouml;he AGL"
              value={groundElevation != null
                ? `${((drone.altitude_baro ?? drone.altitude) - groundElevation).toFixed(1)} m`
                : undefined
              }
              loading={groundElevation == null}
            />
            <StatItem
              label="Geschwindigkeit"
              value={`${drone.speed.toFixed(1)} m/s`}
              sub={`${(drone.speed * 3.6).toFixed(0)} km/h`}
            />
            <StatItem
              label="Gel&auml;nde"
              value={groundElevation != null ? `${groundElevation.toFixed(0)} m` : undefined}
              loading={groundElevation == null}
            />
          </StatGrid>
          {drone.battery != null && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                height: 6,
                background: 'var(--bg-primary)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${drone.battery}%`,
                  height: '100%',
                  background: batteryColor(drone.battery),
                  borderRadius: 3,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}
        </Card>

        {/* Position */}
        <Card title="Position">
          <DetailRow label="Breitengrad" value={drone.latitude.toFixed(6)} mono />
          <DetailRow label="L&auml;ngengrad" value={drone.longitude.toFixed(6)} mono />
          <DetailRow
            label="H&ouml;he MSL"
            value={`${(drone.altitude_baro ?? drone.altitude).toFixed(1)} m`}
            hint={drone.altitude_baro != null ? 'barometrisch' : undefined}
          />
          <DetailRow
            label="H&ouml;he GPS"
            value={drone.altitude_geom != null ? `${drone.altitude_geom.toFixed(1)} m` : 'N/A'}
            hint={drone.altitude_geom != null ? 'geometrisch' : undefined}
          />
          <DetailRow
            label="H&ouml;he AGL"
            value={groundElevation != null
              ? `${((drone.altitude_baro ?? drone.altitude) - groundElevation).toFixed(1)} m`
              : undefined}
            loading={groundElevation == null}
            hint="&uuml;ber Grund"
          />
          <DetailRow
            label="Gel&auml;ndeh&ouml;he"
            value={groundElevation != null ? `${groundElevation.toFixed(0)} m MSL` : undefined}
            loading={groundElevation == null}
          />
          <DetailRow
            label="Geschwindigkeit"
            value={`${drone.speed.toFixed(1)} m/s (${(drone.speed * 3.6).toFixed(0)} km/h)`}
          />
          <DetailRow label="Flugmuster" value={drone.flight_pattern} />
          {drone.distance !== undefined && (
            <DetailRow label="Entfernung" value={`${(drone.distance / 1000).toFixed(2)} km`} />
          )}
        </Card>

        {/* Pilot */}
        {drone.pilot_latitude != null && drone.pilot_longitude != null && (
          <Card title="Pilot-Position">
            <DetailRow label="Breitengrad" value={drone.pilot_latitude.toFixed(6)} mono />
            <DetailRow label="Längengrad" value={drone.pilot_longitude.toFixed(6)} mono />
          </Card>
        )}

        {/* FAA Data */}
        {drone.faa_data && (
          <Card title="FAA Registrierung">
            <DetailRow label="Registrant" value={drone.faa_data.registrant_name} />
            <DetailRow label="Typ" value={drone.faa_data.registrant_type} />
            <DetailRow label="Hersteller" value={drone.faa_data.manufacturer} />
            <DetailRow label="Modell" value={drone.faa_data.model} />
            <DetailRow label="Seriennr." value={drone.faa_data.serial_number} mono />
            <DetailRow label="Gewicht" value={`${drone.faa_data.weight} kg`} />
            <DetailRow label="Zweck" value={drone.faa_data.purpose} />
            <DetailRow label="Status" value={drone.faa_data.status} />
            <DetailRow label="Registriert" value={drone.faa_data.registration_date} />
            <DetailRow label="Gültig bis" value={drone.faa_data.expiration_date} />
          </Card>
        )}

        {/* OGN Aircraft Type */}
        {drone.source === 'ogn' && drone.ogn_aircraft_type_label && (
          <Card title="OGN Typ">
            <DetailRow label="Kategorie" value={drone.ogn_aircraft_type_label} />
            {drone.icao_hex && <DetailRow label="ICAO Hex" value={drone.icao_hex} mono />}
            <DetailRow label="OGN ID" value={drone.basic_id} mono />
          </Card>
        )}

        {/* Aircraft Lookup — only show loading after delay */}
        {lookupLoading && showLoading && (
          <Card title="Luftfahrzeug-Daten">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Spinner size={16} /> Daten werden geladen...
            </div>
          </Card>
        )}
        {lookupError && (
          <Card title="Luftfahrzeug-Daten">
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lookup fehlgeschlagen</span>
          </Card>
        )}
        {lookup && !lookupLoading && lookup.found && (
          <Card title="Luftfahrzeug-Daten">
            {lookup.photo_url && (
              <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img
                  src={lookup.photo_url}
                  alt={lookup.type || 'Aircraft'}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
            {lookup.type && <DetailRow label="Typ" value={lookup.type} />}
            {lookup.manufacturer && <DetailRow label="Hersteller" value={lookup.manufacturer} />}
            {lookup.icao_type && <DetailRow label="ICAO Typ" value={lookup.icao_type} mono />}
            {lookup.registration && <DetailRow label="Kennzeichen" value={lookup.registration} mono />}
            {lookup.owner && <DetailRow label="Halter" value={lookup.owner} />}
            {lookup.operator && lookup.operator !== lookup.owner && <DetailRow label="Betreiber" value={lookup.operator} />}
            {lookup.country && <DetailRow label="Land" value={lookup.country} />}
            {lookup.serial_number && <DetailRow label="Seriennr." value={lookup.serial_number} mono />}
            {lookup.icao_aircraft_class && (
              <DetailRow
                label="Klasse"
                value={AIRCRAFT_CLASS_LABELS[lookup.icao_aircraft_class] || lookup.icao_aircraft_class}
              />
            )}
            {lookup.source_db && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                Quelle: {lookup.source_db}
              </div>
            )}
          </Card>
        )}
        {lookup && !lookupLoading && !lookup.found && drone.source !== 'simulator' && (
          <Card title="Luftfahrzeug-Daten">
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Daten gefunden</span>
          </Card>
        )}

        {/* Flight Route */}
        {lookup && (lookup.origin || lookup.destination) && (
          <Card title="Flugroute">
            {lookup.airline && <DetailRow label="Airline" value={lookup.airline} />}
            {lookup.callsign && <DetailRow label="Callsign" value={lookup.callsign} mono />}
            {lookup.origin && (
              <DetailRow
                label="Von"
                value={`${lookup.origin.city || lookup.origin.name || '?'} (${lookup.origin.iata || lookup.origin.icao || '?'})`}
              />
            )}
            {lookup.destination && (
              <DetailRow
                label="Nach"
                value={`${lookup.destination.city || lookup.destination.name || '?'} (${lookup.destination.iata || lookup.destination.icao || '?'})`}
              />
            )}
          </Card>
        )}

        {/* History */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Card title="Status-Verlauf">
            <StatusHistory droneId={drone.id} history={history} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-muted)',
        marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
    }}>
      {children}
    </div>
  );
}

function StatItem({ label, value, color, sub, loading }: { label: string; value?: string; color?: string; sub?: string; loading?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 8,
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Spinner size={14} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Berechne...</span>
        </div>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--text-primary)' }}>
          {value ?? 'N/A'}
        </div>
      )}
      {sub && !loading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, hint, loading }: { label: string; value?: string; mono?: boolean; hint?: string; loading?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 0',
      fontSize: 13,
      borderBottom: '1px solid var(--bg-tertiary)',
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>
        {label}
        {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({hint})</span>}
      </span>
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Spinner size={12} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Laden...</span>
        </span>
      ) : (
        <span style={{
          fontWeight: 500,
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: mono ? 12 : 13,
        }}>
          {value ?? 'N/A'}
        </span>
      )}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: '2px solid var(--border)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}
