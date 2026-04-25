import { useState, useEffect, useRef, useCallback } from 'react';
import HelpFab from '../HelpFab';
import HelpLink from '../HelpLink';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchFlightZones, planCoverage, batchCreateReceivers,
  type PlanCoverageResult,
} from '../../api';
import type { FlightZone } from '../../types/drone';
import { ANTENNA_PRESETS, getDefaultRadius } from '../../config/antennaPresets';
import { useIsMobile } from '../../useIsMobile';

// ─── Tile URLs (same as MapComponent) ────────────────────
const TILE_URLS: Record<string, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

type Step = 'draw' | 'config' | 'result' | 'done';

export default function PlanningTab() {
  const isMobile = useIsMobile();

  // ─── State ────────────────────────────────────────────
  const [step, setStep] = useState<Step>('draw');
  const [polygon, setPolygon] = useState<[number, number][]>([]);
  const [antennaType, setAntennaType] = useState('pcb');
  const [radius, setRadius] = useState(1000);
  const [result, setResult] = useState<PlanCoverageResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [namePrefix, setNamePrefix] = useState('Empfaenger');
  const [error, setError] = useState<string | null>(null);
  const [useExistingZone, setUseExistingZone] = useState(false);
  const [zones, setZones] = useState<FlightZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  // ─── Map refs ─────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  // Draggable vertex markers — L.Marker (not CircleMarker) because only Marker
  // supports the `draggable` option. We use a divIcon so the visual stays a
  // small cyan dot instead of Leaflet's default blue pin.
  const pointMarkersRef = useRef<L.Marker[]>([]);
  const resultMarkersRef = useRef<L.CircleMarker[]>([]);
  const resultCirclesRef = useRef<L.Circle[]>([]);

  // ─── Load zones ───────────────────────────────────────
  useEffect(() => {
    fetchFlightZones().then(setZones).catch(() => {});
  }, []);

  // ─── Initialize map ───────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const map = L.map(mapContainerRef.current, {
      center: [52.03, 8.53],
      zoom: 12,
      zoomControl: !isMobile,
      attributionControl: false,
    });

    tileLayerRef.current = L.tileLayer(TILE_URLS[theme] || TILE_URLS.dark, {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Click handler for drawing ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (step !== 'draw' || useExistingZone) {
      // Remove click handler when not drawing
      map.off('click');
      return;
    }

    const handler = (e: L.LeafletMouseEvent) => {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPolygon(prev => [...prev, pt]);
    };
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [step, useExistingZone]);

  // ─── Draw polygon + point markers on map ──────────────
  const updateMapLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old layers
    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }
    for (const m of pointMarkersRef.current) map.removeLayer(m);
    pointMarkersRef.current = [];
    for (const m of resultMarkersRef.current) map.removeLayer(m);
    resultMarkersRef.current = [];
    for (const c of resultCirclesRef.current) map.removeLayer(c);
    resultCirclesRef.current = [];

    // Draw polygon. Even with 2 points we draw a polyline hint so users see
    // the edge forming — but the filled polygon only kicks in at 3+.
    if (polygon.length >= 3) {
      polygonLayerRef.current = L.polygon(
        polygon.map(p => [p[0], p[1]] as L.LatLngTuple),
        { color: 'var(--accent)', weight: 2, fillOpacity: 0.18 },
      ).addTo(map);
      // Leaflet needs a real color, not a CSS variable — read it once.
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00d4aa';
      polygonLayerRef.current.setStyle({ color: accent, fillColor: accent });
    }

    // Draggable vertex markers in draw mode. Each marker knows its index so
    // drag / dblclick / contextmenu can mutate the correct slot.
    if (step === 'draw') {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00d4aa';
      polygon.forEach((pt, idx) => {
        const icon = L.divIcon({
          html: `<div class="planning-vertex" style="background:${accent}"></div>`,
          className: 'planning-vertex-wrapper',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([pt[0], pt[1]], {
          icon,
          draggable: true,
          autoPan: true,
          autoPanPadding: [40, 40],
          title: 'Ziehen zum Verschieben · Doppelklick zum Entfernen',
        }).addTo(map);

        // Live-drag: push new position into the polygon shape directly (no
        // state update) so the fill moves with the cursor at 60fps. State is
        // only synced at dragend.
        marker.on('drag', (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          if (polygonLayerRef.current) {
            const latlngs = polygon.map((p, i) => (
              i === idx ? L.latLng(ll.lat, ll.lng) : L.latLng(p[0], p[1])
            ));
            polygonLayerRef.current.setLatLngs(latlngs);
          }
        });
        marker.on('dragend', (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          setPolygon(prev => prev.map((p, i) => (i === idx ? [ll.lat, ll.lng] : p)));
        });

        // Desktop: double-click the dot to remove it. On touch devices
        // Leaflet fires a synthesized dblclick from two quick taps, but
        // that's unreliable — contextmenu (long-press) is the safe path.
        const removeSelf = (e: L.LeafletEvent) => {
          L.DomEvent.stopPropagation(e as unknown as Event);
          setPolygon(prev => prev.filter((_, i) => i !== idx));
        };
        marker.on('dblclick', removeSelf);
        marker.on('contextmenu', removeSelf);

        pointMarkersRef.current.push(marker);
      });
    }

    // Draw result positions
    if ((step === 'result' || step === 'done') && result) {
      for (const pos of result.positions) {
        const circle = L.circle([pos.lat, pos.lon], {
          radius: result.radius,
          color: 'rgba(34,197,94,0.4)',
          fillColor: 'rgba(34,197,94,0.1)',
          fillOpacity: 0.3,
          weight: 1,
        }).addTo(map);
        resultCirclesRef.current.push(circle);

        const marker = L.circleMarker([pos.lat, pos.lon], {
          radius: 5, color: '#22c55e', fillColor: '#22c55e',
          fillOpacity: 1, weight: 2,
        }).addTo(map);
        resultMarkersRef.current.push(marker);
      }
    }

    // Fit bounds
    if (polygon.length >= 3) {
      const bounds = L.latLngBounds(polygon.map(p => [p[0], p[1]] as L.LatLngTuple));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [polygon, step, result]);

  useEffect(() => {
    updateMapLayers();
  }, [updateMapLayers]);

  // ─── Zone selection handling ──────────────────────────
  useEffect(() => {
    if (!useExistingZone || !selectedZoneId) {
      if (useExistingZone) setPolygon([]);
      return;
    }
    const zone = zones.find(z => z.id === selectedZoneId);
    if (zone) {
      setPolygon(zone.polygon);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId, useExistingZone, zones]);

  // ─── Handlers ─────────────────────────────────────────
  const handleCalculate = async () => {
    if (polygon.length < 3) return;
    setCalculating(true);
    setError(null);
    try {
      const res = await planCoverage(polygon, radius);
      setResult(res);
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Berechnung fehlgeschlagen');
    } finally {
      setCalculating(false);
    }
  };

  const handleCreate = async () => {
    if (!result) return;
    setCreating(true);
    setError(null);
    try {
      const res = await batchCreateReceivers({
        positions: result.positions,
        antenna_type: antennaType,
        coverage_radius: radius,
        name_prefix: namePrefix,
      });
      setCreatedCount(res.count);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = () => {
    setStep('draw');
    setPolygon([]);
    setResult(null);
    setError(null);
    setSelectedZoneId(null);
    setUseExistingZone(false);
    setCreatedCount(0);
  };

  const handleAntennaChange = (value: string) => {
    setAntennaType(value);
    setRadius(getDefaultRadius(value));
  };

  const handleUndoPoint = () => {
    setPolygon(prev => prev.slice(0, -1));
  };

  // ─── Render ───────────────────────────────────────────
  const mapHeight = isMobile ? 300 : '100%';

  return (
    <div data-testid="planning-tab">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          Empfänger-Platzierung
          <HelpLink section="receivers" sub="empfaenger-planung" title="Hilfe: Empfänger-Platzierung" size={20} />
        </h1>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 8px',
          borderRadius: 4, background: 'rgba(59,130,246,0.15)',
          color: 'var(--accent)',
        }}>
          {step === 'draw' && 'Gebiet festlegen'}
          {step === 'config' && 'Konfiguration'}
          {step === 'result' && 'Ergebnis'}
          {step === 'done' && 'Fertig'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: '#ef4444',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none', color: '#ef4444',
            cursor: 'pointer', fontSize: 16, padding: 0,
          }}>x</button>
        </div>
      )}

      {/* Main layout: sidebar + map */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 16,
        height: isMobile ? 'auto' : 'calc(100vh - 160px)',
      }}>
        {/* Map */}
        <div style={{
          flex: isMobile ? 'none' : 1,
          height: mapHeight,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          position: 'relative',
        }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          {step === 'draw' && !useExistingZone && (
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, background: 'rgba(0,0,0,0.7)', color: '#fff',
              padding: '6px 12px', borderRadius: 6, fontSize: 12,
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              Klicken Sie auf die Karte, um Punkte zu setzen
            </div>
          )}
        </div>

        {/* Controls sidebar */}
        <div style={{
          width: isMobile ? '100%' : 320,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {/* Step: Draw */}
          {step === 'draw' && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                Gebiet festlegen
              </h3>

              {/* Toggle: draw vs existing zone */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => { setUseExistingZone(false); setPolygon([]); setSelectedZoneId(null); }}
                  style={{
                    ...toggleBtnStyle,
                    ...(useExistingZone ? {} : toggleBtnActiveStyle),
                  }}
                >
                  Zeichnen
                </button>
                <button
                  onClick={() => { setUseExistingZone(true); setPolygon([]); }}
                  disabled={zones.length === 0}
                  style={{
                    ...toggleBtnStyle,
                    ...(useExistingZone ? toggleBtnActiveStyle : {}),
                    ...(zones.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  }}
                >
                  Flugzone verwenden
                </button>
              </div>

              {useExistingZone ? (
                <div>
                  <label style={labelStyle}>Flugzone</label>
                  <select
                    value={selectedZoneId || ''}
                    onChange={e => setSelectedZoneId(e.target.value || null)}
                    style={inputStyle}
                  >
                    <option value="">-- Zone auswählen --</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Klicke auf die Karte, um Punkte hinzuzufügen (min. 3).
                    <br />
                    <strong style={{ color: 'var(--text-secondary)' }}>Ziehen</strong> zum Verschieben,
                    {' '}<strong style={{ color: 'var(--text-secondary)' }}>Doppelklick</strong>{' '}
                    (Handy: langer Druck) zum Entfernen — die Fläche passt sich automatisch an.
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Punkte: <strong className="fa-tabular">{polygon.length}</strong>
                    {polygon.length >= 3 && (
                      <span style={{ color: 'var(--status-active)', marginLeft: 8 }}>✓ genug für Polygon</span>
                    )}
                  </div>
                  {polygon.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <button
                        onClick={handleUndoPoint}
                        style={{
                          padding: '6px 12px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 12,
                        }}
                      >
                        ↶ Letzten Punkt
                      </button>
                      <button
                        onClick={() => setPolygon([])}
                        title="Alle Punkte entfernen"
                        style={{
                          padding: '6px 12px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--status-error)',
                          cursor: 'pointer', fontSize: 12,
                        }}
                      >
                        ✕ Alle löschen
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setStep('config')}
                disabled={polygon.length < 3}
                style={{
                  ...primaryBtnStyle,
                  marginTop: 12,
                  ...(polygon.length < 3 ? disabledBtnStyle : {}),
                }}
              >
                Weiter
              </button>
            </div>
          )}

          {/* Step: Config */}
          {step === 'config' && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                Konfiguration
              </h3>

              {/* Antenna Type */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Antennentyp</label>
                <select
                  value={antennaType}
                  onChange={e => handleAntennaChange(e.target.value)}
                  style={inputStyle}
                >
                  {ANTENNA_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Radius */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Reichweite (m)</label>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  step={100}
                  value={radius}
                  onChange={e => setRadius(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              {/* Name Prefix */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Namens-Prefix</label>
                <input
                  type="text"
                  value={namePrefix}
                  onChange={e => setNamePrefix(e.target.value)}
                  placeholder="Empfaenger"
                  style={inputStyle}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  Empfänger werden als "{namePrefix}-001", "{namePrefix}-002", ... benannt
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setStep('draw')}
                  style={secondaryBtnStyle}
                >
                  Zurück
                </button>
                <button
                  onClick={handleCalculate}
                  disabled={calculating}
                  style={{
                    ...primaryBtnStyle,
                    flex: 1,
                    ...(calculating ? { opacity: 0.7, cursor: 'wait' } : {}),
                  }}
                >
                  {calculating ? 'Berechne...' : 'Berechnen'}
                </button>
              </div>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && result && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                Ergebnis
              </h3>

              {/* Stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 8, marginBottom: 16,
              }}>
                <StatBox label="Empfänger" value={String(result.count)} />
                <StatBox label="Fläche" value={`${result.area_km2.toFixed(2)} km²`} />
                <StatBox label="Reichweite" value={`${result.radius} m`} />
                <StatBox label="Antennentyp" value={ANTENNA_PRESETS.find(p => p.value === antennaType)?.label.split(' ')[0] || antennaType} />
              </div>

              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>{result.count} Empfänger</strong> decken eine Fläche von{' '}
                <strong>{result.area_km2.toFixed(2)} km²</strong> ab.
                Jeder Empfänger hat eine Reichweite von {result.radius} m.
              </p>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStep('config')}
                  style={secondaryBtnStyle}
                >
                  Zurück
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  style={{
                    ...primaryBtnStyle,
                    flex: 1,
                    background: creating ? 'var(--bg-tertiary)' : '#22c55e',
                    ...(creating ? { cursor: 'wait' } : {}),
                  }}
                >
                  {creating ? 'Erstelle...' : `${result.count} Empfänger erstellen`}
                </button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}>
              <div style={{
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)',
                borderRadius: 8, padding: '12px 16px', marginBottom: 16,
                fontSize: 14, color: '#22c55e', fontWeight: 600,
              }}>
                {createdCount} Empfänger erfolgreich erstellt!
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Die Empfänger wurden angelegt und sind unter "Empfänger" sichtbar.
                Sie können dort Firmware bauen und die Geräte konfigurieren.
              </p>
              <button onClick={handleReset} style={primaryBtnStyle}>
                Neue Planung
              </button>
            </div>
          )}

          {/* Info box */}
          {step === 'draw' && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              <strong>Hinweis:</strong> Definieren Sie ein Gebiet, das mit Empfängern
              abgedeckt werden soll. Die optimale Anzahl und Platzierung wird automatisch
              berechnet basierend auf der gewählten Antenne und Reichweite.
            </div>
          )}
        </div>
      </div>
      <HelpFab section="receivers" sub="empfaenger-planung" title="Hilfe: Empfänger-Planung" />
    </div>
  );
}

// ─── Stat Box Sub-component ─────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 10px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}


// ─── Shared Styles ──────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.3px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'var(--accent)', color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  width: '100%',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
};

const toggleBtnStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 12, fontWeight: 500,
};

const toggleBtnActiveStyle: React.CSSProperties = {
  background: 'rgba(59,130,246,0.15)',
  borderColor: 'var(--accent)',
  color: 'var(--accent)',
  fontWeight: 600,
};

const disabledBtnStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};
