import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { fetchViolationDetail, updateViolationComments } from '../api';
import type { ViolationDetail, ViolationTrailPoint } from '../api';
import { useTheme } from '../ThemeContext';

const TILE_URLS: Record<string, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

function formatTime(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function FlightReportView() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [data, setData] = useState<ViolationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [commentsSaved, setCommentsSaved] = useState(false);

  // Timeline state
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playSpeed, setPlaySpeed] = useState(1);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Map refs
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const progressPolylineRef = useRef<L.Polyline | null>(null);
  const droneMarkerRef = useRef<L.CircleMarker | null>(null);
  const zonePolygonRef = useRef<L.Polygon | null>(null);

  // Load data
  useEffect(() => {
    if (!recordId) return;
    fetchViolationDetail(recordId)
      .then(d => {
        setData(d);
        setComments(d.comments || '');
        setCurrentIndex(0);
      })
      .catch(() => setError('Flugbericht konnte nicht geladen werden'));
  }, [recordId]);

  const trail = data?.trailData || [];
  const totalPoints = trail.length;
  const currentPoint = trail[currentIndex] || null;
  const startTime = trail.length > 0 ? trail[0].ts : data?.startTime || 0;
  const endTime = trail.length > 0 ? trail[trail.length - 1].ts : data?.endTime || 0;
  const duration = endTime - startTime;

  // Stats
  const stats = useMemo(() => {
    if (trail.length === 0) return null;
    const alts = trail.map(p => p.alt);
    const speeds = trail.map(p => p.speed);
    const batteries = trail.filter(p => p.battery != null).map(p => p.battery!);
    return {
      minAlt: Math.min(...alts),
      maxAlt: Math.max(...alts),
      avgAlt: alts.reduce((a, b) => a + b, 0) / alts.length,
      maxSpeed: Math.max(...speeds),
      avgSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
      startBattery: batteries.length > 0 ? batteries[0] : null,
      endBattery: batteries.length > 0 ? batteries[batteries.length - 1] : null,
    };
  }, [trail]);

  // Playback
  useEffect(() => {
    if (playing && totalPoints > 1) {
      animRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= totalPoints - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500 / playSpeed);
    }
    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [playing, totalPoints, playSpeed]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [52.03, 8.53],
      zoom: 14,
      zoomControl: true,
    });
    const tile = L.tileLayer(TILE_URLS[theme] || TILE_URLS.dark, {
      attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = tile;
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update tile layer on theme change
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.dark);
    }
  }, [theme]);

  // Render zone polygon + full trail when data loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data || trail.length === 0) return;

    // Zone polygon
    if (zonePolygonRef.current) zonePolygonRef.current.remove();
    if (data.zonePolygon && data.zonePolygon.length >= 3) {
      const latlngs: L.LatLngExpression[] = data.zonePolygon.map(p => [p[0], p[1]]);
      zonePolygonRef.current = L.polygon(latlngs, {
        color: data.zoneColor,
        weight: 2,
        fillOpacity: 0.1,
        dashArray: '6, 4',
      }).addTo(map);
    }

    // Full trail (faded)
    if (trailPolylineRef.current) trailPolylineRef.current.remove();
    const fullPoints: L.LatLngExpression[] = trail.map(p => [p.lat, p.lon]);
    trailPolylineRef.current = L.polyline(fullPoints, {
      color: data.zoneColor,
      weight: 2,
      opacity: 0.25,
      dashArray: '4, 4',
    }).addTo(map);

    // Fit bounds
    const bounds = L.latLngBounds(fullPoints);
    if (data.zonePolygon) {
      for (const p of data.zonePolygon) bounds.extend([p[0], p[1]]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [data, trail]);

  // Update drone marker + progress trail on currentIndex change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentPoint || trail.length === 0) return;

    // Progress trail (solid, up to currentIndex)
    if (progressPolylineRef.current) progressPolylineRef.current.remove();
    const progressPoints: L.LatLngExpression[] = trail.slice(0, currentIndex + 1).map(p => [p.lat, p.lon]);
    if (progressPoints.length >= 2) {
      progressPolylineRef.current = L.polyline(progressPoints, {
        color: '#f97316',
        weight: 3,
        opacity: 0.9,
      }).addTo(map);
    }

    // Drone marker
    if (droneMarkerRef.current) droneMarkerRef.current.remove();
    droneMarkerRef.current = L.circleMarker([currentPoint.lat, currentPoint.lon], {
      radius: 7,
      fillColor: '#f97316',
      fillOpacity: 1,
      color: '#fff',
      weight: 2,
    }).addTo(map).bindTooltip(
      `${data?.droneName || ''} | ${formatTime(currentPoint.ts)} | ${currentPoint.alt}m`,
      { permanent: false, direction: 'top' },
    );
  }, [currentIndex, currentPoint, trail, data]);

  // Save comments
  const saveComments = useCallback(async () => {
    if (!recordId) return;
    try {
      await updateViolationComments(recordId, comments);
      setCommentsSaved(true);
      setTimeout(() => setCommentsSaved(false), 2000);
    } catch { /* ignore */ }
  }, [recordId, comments]);

  // Generate report HTML
  const generateReport = useCallback(() => {
    if (!data || trail.length === 0) return;
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) return;

    const dur = (data.endTime || trail[trail.length - 1].ts) - data.startTime;

    reportWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Flugbericht - ${data.droneName} - ${formatDate(data.startTime)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 4px; margin: 24px 0 12px; color: #3b82f6; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
  .header-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .badge-violation { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
  .badge-ended { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
  .card-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card-value { font-size: 16px; font-weight: 600; }
  .card-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
  td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-family: 'SF Mono', monospace; }
  tr:nth-child(even) { background: #fafafa; }
  .comments { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-top: 16px; white-space: pre-wrap; font-size: 13px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head><body>
<div class="header-bar">
  <div>
    <h1>Flugbericht</h1>
    <div class="subtitle">Zonenverstosz #${data.id} | Erstellt am ${formatDate(Date.now() / 1000)}</div>
  </div>
  <div style="text-align:right">
    <span class="badge ${data.endTime ? 'badge-ended' : 'badge-violation'}">${data.endTime ? 'Beendet' : 'Aktiv'}</span>
    <div style="font-size:11px;color:#64748b;margin-top:4px">FlightArc Report</div>
  </div>
</div>

<h2>Flugobjekt</h2>
<div class="grid">
  <div class="card"><div class="card-label">Bezeichnung</div><div class="card-value">${data.droneName}</div><div class="card-sub">ID: ${data.droneId}</div></div>
  <div class="card"><div class="card-label">Datenquelle</div><div class="card-value">${data.droneId.startsWith('AZTEST') ? 'Simulator' : 'Live-Erkennung'}</div></div>
</div>

<h2>Verstosz-Details</h2>
<div class="grid">
  <div class="card"><div class="card-label">Zone</div><div class="card-value" style="color:${data.zoneColor}">${data.zoneName}</div><div class="card-sub">Zone-ID: ${data.zoneId}</div></div>
  <div class="card"><div class="card-label">Zeitraum</div><div class="card-value">${formatTime(data.startTime)} - ${data.endTime ? formatTime(data.endTime) : 'aktiv'}</div><div class="card-sub">${formatDate(data.startTime)} | Dauer: ${formatDuration(dur)}</div></div>
</div>

<h2>Flugstatistik</h2>
<div class="grid">
  <div class="card"><div class="card-label">Hoehe (m)</div><div class="card-value">${stats ? `${stats.minAlt.toFixed(1)} - ${stats.maxAlt.toFixed(1)}` : '-'}</div><div class="card-sub">Durchschnitt: ${stats ? stats.avgAlt.toFixed(1) : '-'}m</div></div>
  <div class="card"><div class="card-label">Geschwindigkeit (m/s)</div><div class="card-value">max. ${stats ? stats.maxSpeed.toFixed(1) : '-'}</div><div class="card-sub">Durchschnitt: ${stats ? stats.avgSpeed.toFixed(1) : '-'} m/s</div></div>
  <div class="card"><div class="card-label">Batterie</div><div class="card-value">${stats?.startBattery != null ? `${stats.startBattery.toFixed(1)}%` : '-'} &rarr; ${stats?.endBattery != null ? `${stats.endBattery.toFixed(1)}%` : '-'}</div></div>
  <div class="card"><div class="card-label">Messpunkte</div><div class="card-value">${trail.length}</div><div class="card-sub">Abtastrate: ~${duration > 0 && trail.length > 1 ? (duration / (trail.length - 1)).toFixed(1) : '-'}s</div></div>
</div>

<h2>Flugdaten (Messpunkte)</h2>
<table>
  <thead><tr><th>#</th><th>Zeit</th><th>Lat</th><th>Lon</th><th>Hoehe (m)</th><th>Speed (m/s)</th><th>Batterie</th><th>Signal (dBm)</th></tr></thead>
  <tbody>
    ${trail.map((p, i) => `<tr><td>${i + 1}</td><td>${formatTime(p.ts)}</td><td>${p.lat.toFixed(6)}</td><td>${p.lon.toFixed(6)}</td><td>${p.alt.toFixed(1)}</td><td>${p.speed.toFixed(1)}</td><td>${p.battery != null ? p.battery.toFixed(1) + '%' : '-'}</td><td>${p.signal != null ? p.signal.toFixed(1) : '-'}</td></tr>`).join('\n    ')}
  </tbody>
</table>

${comments.trim() ? `<h2>Kommentare</h2><div class="comments">${comments.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}

<div class="footer">
  Generiert von FlightArc | ${new Date().toLocaleString('de-DE')} | Verstosz-ID: ${data.id}
</div>

<div class="no-print" style="text-align:center;margin-top:24px">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#3b82f6;color:#fff;border:none;border-radius:6px">Drucken / Als PDF speichern</button>
</div>
</body></html>`);
    reportWindow.document.close();
  }, [data, trail, stats, comments]);

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--status-error)', marginBottom: 16 }}>{error}</p>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Zurueck</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        Lade Flugbericht...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)',
            padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
          }}>&#8592; Zurueck</button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Flugbericht</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.droneName} | {data.zoneName} | {formatDate(data.startTime)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: data.endTime ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: data.endTime ? '#22c55e' : '#ef4444',
          }}>
            {data.endTime ? 'Beendet' : 'Aktiv'}
          </span>
        </div>
        <button onClick={generateReport} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>
          &#128196; Bericht erstellen
        </button>
      </div>

      {/* Main area: Map + Data panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          {/* Stats overlay */}
          {stats && (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 1000,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12,
              display: 'flex', gap: 16, opacity: 0.95,
            }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Hoehe:</span> {stats.minAlt.toFixed(0)}-{stats.maxAlt.toFixed(0)}m</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Speed:</span> avg {stats.avgSpeed.toFixed(1)} m/s</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Punkte:</span> {totalPoints}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Dauer:</span> {formatDuration(duration)}</div>
            </div>
          )}
        </div>

        {/* Right panel: Measurements + Comments */}
        <div style={{
          width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)',
        }}>
          {/* Current point info */}
          {currentPoint && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                Messpunkt {currentIndex + 1} / {totalPoints}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Zeit:</span> {formatTime(currentPoint.ts)}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Hoehe:</span> {currentPoint.alt.toFixed(1)}m</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Lat:</span> {currentPoint.lat.toFixed(6)}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Speed:</span> {currentPoint.speed.toFixed(1)} m/s</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Lon:</span> {currentPoint.lon.toFixed(6)}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Batterie:</span> {currentPoint.battery != null ? `${currentPoint.battery.toFixed(1)}%` : '-'}</div>
              </div>
            </div>
          )}

          {/* Measurement list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>#</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Zeit</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Hoehe</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Speed</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Bat</th>
                </tr>
              </thead>
              <tbody>
                {trail.map((p, i) => (
                  <tr
                    key={i}
                    onClick={() => { setPlaying(false); setCurrentIndex(i); }}
                    style={{
                      cursor: 'pointer',
                      background: i === currentIndex ? 'rgba(249,115,22,0.15)' : 'transparent',
                      borderLeft: i === currentIndex ? '3px solid #f97316' : '3px solid transparent',
                    }}
                  >
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace' }}>{formatTime(p.ts)}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', textAlign: 'right' }}>{p.alt.toFixed(1)}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', textAlign: 'right' }}>{p.speed.toFixed(1)}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', textAlign: 'right' }}>{p.battery != null ? `${p.battery.toFixed(0)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comments */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Kommentare</div>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Kommentar zum Verstosz..."
              style={{
                width: '100%', height: 60, resize: 'vertical',
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: 8, fontSize: 12, fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              {commentsSaved && <span style={{ fontSize: 11, color: '#22c55e' }}>Gespeichert</span>}
              <button onClick={saveComments} style={{
                background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', padding: '4px 12px',
                borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}>Speichern</button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)', flexShrink: 0,
      }}>
        {/* Play/Pause */}
        <button
          onClick={() => {
            if (currentIndex >= totalPoints - 1) setCurrentIndex(0);
            setPlaying(!playing);
          }}
          disabled={totalPoints < 2}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            width: 36, height: 36, borderRadius: '50%', cursor: totalPoints < 2 ? 'default' : 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: totalPoints < 2 ? 0.4 : 1,
          }}
        >
          {playing ? '\u23F8' : '\u25B6'}
        </button>

        {/* Time labels */}
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', minWidth: 60 }}>
          {currentPoint ? formatTime(currentPoint.ts) : '--:--:--'}
        </span>

        {/* Slider */}
        <input
          type="range"
          min={0}
          max={Math.max(totalPoints - 1, 0)}
          value={currentIndex}
          onChange={e => { setPlaying(false); setCurrentIndex(Number(e.target.value)); }}
          style={{ flex: 1, cursor: 'pointer' }}
        />

        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', minWidth: 60 }}>
          {endTime ? formatTime(endTime) : '--:--:--'}
        </span>

        {/* Speed control */}
        <select
          value={playSpeed}
          onChange={e => setPlaySpeed(Number(e.target.value))}
          style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: '4px 8px', fontSize: 11, cursor: 'pointer',
          }}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
      </div>
    </div>
  );
}
