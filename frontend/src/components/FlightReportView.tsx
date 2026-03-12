import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { fetchViolationDetail, updateViolationComments, reverseGeocode } from '../api';
import type { ViolationDetail, ViolationTrailPoint } from '../api';
import { useTheme } from '../ThemeContext';
import {
  DIPUL_WMS_URL,
  NFZ_LAYERS,
  NFZ_CATEGORIES,
  getWmsLayerString,
  getLayersByCategory,
  type NoFlyCategory,
} from '../config/noFlyZones';

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

function signalColor(rssi: number): string {
  if (rssi >= -50) return '#22c55e';
  if (rssi >= -70) return '#eab308';
  return '#ef4444';
}

// Shared checkbox styles
const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 11, cursor: 'pointer', padding: '2px 0',
};

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

  // Layer toggles
  const [showZone, setShowZone] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [showDroneMarker, setShowDroneMarker] = useState(true);
  const [showPilot, setShowPilot] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showNfz, setShowNfz] = useState(false);
  const [enabledNfzLayers, setEnabledNfzLayers] = useState<string[]>([]);
  const [nfzPanelOpen, setNfzPanelOpen] = useState(false);
  const [followDrone, setFollowDrone] = useState(false);

  // Map refs
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const progressPolylineRef = useRef<L.Polyline | null>(null);
  const droneMarkerRef = useRef<L.CircleMarker | null>(null);
  const pilotMarkerRef = useRef<L.CircleMarker | null>(null);
  const pilotLineRef = useRef<L.Polyline | null>(null);
  const zonePolygonRef = useRef<L.Polygon | null>(null);
  const zoneLabelRef = useRef<L.Tooltip | null>(null);
  const wmsLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const mapInitializedRef = useRef(false);

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

  // Check if pilot data exists in any trail point
  const hasPilotData = useMemo(() =>
    trail.some(p => p.pilot_lat != null && p.pilot_lon != null),
    [trail],
  );

  // Pilot address (reverse geocoded from first trail point with pilot data)
  const [pilotAddress, setPilotAddress] = useState<string | null>(null);
  const [droneAddress, setDroneAddress] = useState<string | null>(null);
  const pilotGeocodedRef = useRef<string>('');
  const droneGeocodedRef = useRef<string>('');

  // Geocode pilot position (once from first point with pilot data)
  useEffect(() => {
    if (!hasPilotData || trail.length === 0) return;
    const pt = trail.find(p => p.pilot_lat != null && p.pilot_lon != null);
    if (!pt || pt.pilot_lat == null || pt.pilot_lon == null) return;
    const key = `${pt.pilot_lat.toFixed(4)}_${pt.pilot_lon.toFixed(4)}`;
    if (key === pilotGeocodedRef.current) return;
    pilotGeocodedRef.current = key;
    reverseGeocode(pt.pilot_lat, pt.pilot_lon).then(addr => {
      if (addr) setPilotAddress(addr);
    });
  }, [hasPilotData, trail]);

  // Geocode current drone position
  useEffect(() => {
    if (!currentPoint) return;
    const key = `${currentPoint.lat.toFixed(4)}_${currentPoint.lon.toFixed(4)}`;
    if (key === droneGeocodedRef.current) return;
    droneGeocodedRef.current = key;
    setDroneAddress(null);
    reverseGeocode(currentPoint.lat, currentPoint.lon).then(addr => {
      if (addr) setDroneAddress(addr);
    });
  }, [currentPoint]);

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

  // Init map — runs when container is available (always rendered now)
  useEffect(() => {
    if (!mapContainerRef.current || mapInitializedRef.current) return;
    mapInitializedRef.current = true;

    const map = L.map(mapContainerRef.current, {
      center: [52.03, 8.53],
      zoom: 14,
      zoomControl: true,
      preferCanvas: true,
    });
    const tile = L.tileLayer(TILE_URLS[theme] || TILE_URLS.dark, {
      attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = tile;

    // Create NFZ pane
    map.createPane('nfz');
    const nfzPane = map.getPane('nfz')!;
    nfzPane.style.zIndex = '250';

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapInitializedRef.current = false;
    };
  }, []);

  // Update tile layer on theme change
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.dark);
    }
  }, [theme]);

  // Fit map to zone + trail when data loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const bounds = L.latLngBounds([]);
    if (data.zonePolygon && data.zonePolygon.length >= 3) {
      for (const p of data.zonePolygon) bounds.extend([p[0], p[1]]);
    }
    for (const p of trail) {
      bounds.extend([p.lat, p.lon]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [data, trail]);

  // Render zone polygon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up
    if (zonePolygonRef.current) { zonePolygonRef.current.remove(); zonePolygonRef.current = null; }
    if (zoneLabelRef.current) { map.removeLayer(zoneLabelRef.current as unknown as L.Layer); zoneLabelRef.current = null; }

    if (!showZone || !data?.zonePolygon || data.zonePolygon.length < 3) return;

    const latlngs: L.LatLngExpression[] = data.zonePolygon.map(p => [p[0], p[1]]);
    zonePolygonRef.current = L.polygon(latlngs, {
      color: data.zoneColor,
      fillColor: data.zoneColor,
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.7,
    }).addTo(map);

    // Zone label at centroid
    let latSum = 0, lonSum = 0;
    for (const p of data.zonePolygon) { latSum += p[0]; lonSum += p[1]; }
    const center: [number, number] = [latSum / data.zonePolygon.length, lonSum / data.zonePolygon.length];
    zoneLabelRef.current = L.tooltip({
      permanent: true,
      direction: 'center',
      className: 'zone-label',
      interactive: false,
    })
      .setLatLng(L.latLng(center[0], center[1]))
      .setContent(`<div style="text-align:center;white-space:pre">${data.zoneName}</div>`)
      .addTo(map);
  }, [data, showZone]);

  // Render full trail (faded) + progress trail (solid)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up
    if (trailPolylineRef.current) { trailPolylineRef.current.remove(); trailPolylineRef.current = null; }
    if (progressPolylineRef.current) { progressPolylineRef.current.remove(); progressPolylineRef.current = null; }

    if (!showTrail || trail.length < 2 || !data) return;

    // Full trail (faded)
    const fullPoints: L.LatLngExpression[] = trail.map(p => [p.lat, p.lon]);
    trailPolylineRef.current = L.polyline(fullPoints, {
      color: data.zoneColor,
      weight: 2,
      opacity: 0.2,
      dashArray: '4, 4',
    }).addTo(map);

    // Progress trail (solid, up to currentIndex)
    const progressPoints: L.LatLngExpression[] = trail.slice(0, currentIndex + 1).map(p => [p.lat, p.lon]);
    if (progressPoints.length >= 2) {
      progressPolylineRef.current = L.polyline(progressPoints, {
        color: '#f97316',
        weight: 3,
        opacity: 0.9,
      }).addTo(map);
    }
  }, [trail, data, showTrail, currentIndex]);

  // Render drone marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (droneMarkerRef.current) { droneMarkerRef.current.remove(); droneMarkerRef.current = null; }

    if (!showDroneMarker || !currentPoint || !data) return;

    droneMarkerRef.current = L.circleMarker([currentPoint.lat, currentPoint.lon], {
      radius: 8,
      fillColor: '#f97316',
      fillOpacity: 1,
      color: '#fff',
      weight: 2,
    }).addTo(map).bindTooltip(
      `${data.droneName} | ${formatTime(currentPoint.ts)} | ${currentPoint.alt.toFixed(1)}m | ${currentPoint.speed.toFixed(1)} m/s`,
      { permanent: false, direction: 'top' },
    );

    // Follow drone if enabled
    if (followDrone) {
      map.panTo([currentPoint.lat, currentPoint.lon], { animate: true, duration: 0.3 });
    }
  }, [currentIndex, currentPoint, data, showDroneMarker, followDrone]);

  // Render pilot marker + line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pilotMarkerRef.current) { pilotMarkerRef.current.remove(); pilotMarkerRef.current = null; }
    if (pilotLineRef.current) { pilotLineRef.current.remove(); pilotLineRef.current = null; }

    if (!showPilot || !currentPoint || !data) return;
    if (currentPoint.pilot_lat == null || currentPoint.pilot_lon == null) return;

    pilotMarkerRef.current = L.circleMarker([currentPoint.pilot_lat, currentPoint.pilot_lon], {
      radius: 6,
      fillColor: '#3b82f6',
      fillOpacity: 0.9,
      color: '#fff',
      weight: 2,
    }).addTo(map).bindTooltip(
      `Pilot: ${data.droneName}`,
      { permanent: false, direction: 'top' },
    );

    // Dashed line from pilot to drone
    pilotLineRef.current = L.polyline(
      [[currentPoint.pilot_lat, currentPoint.pilot_lon], [currentPoint.lat, currentPoint.lon]],
      { color: '#3b82f6', weight: 1, opacity: 0.5, dashArray: '4, 4' },
    ).addTo(map);
  }, [currentIndex, currentPoint, data, showPilot]);

  // NFZ WMS layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (wmsLayerRef.current) {
      wmsLayerRef.current.remove();
      wmsLayerRef.current = null;
    }

    if (!showNfz || enabledNfzLayers.length === 0) return;

    const wmsLayers = getWmsLayerString(enabledNfzLayers);
    if (!wmsLayers) return;

    wmsLayerRef.current = L.tileLayer.wms(DIPUL_WMS_URL, {
      layers: wmsLayers,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.85,
      attribution: 'Geodaten: DFS, BKG 2026',
      pane: 'nfz',
    } as any).addTo(map);
  }, [showNfz, enabledNfzLayers]);

  // Save comments
  const saveComments = useCallback(async () => {
    if (!recordId) return;
    try {
      await updateViolationComments(recordId, comments);
      setCommentsSaved(true);
      setTimeout(() => setCommentsSaved(false), 2000);
    } catch { /* ignore */ }
  }, [recordId, comments]);

  // Toggle NFZ layer
  const toggleNfzLayer = useCallback((layerId: string) => {
    setEnabledNfzLayers(prev =>
      prev.includes(layerId) ? prev.filter(id => id !== layerId) : [...prev, layerId],
    );
  }, []);

  // Toggle NFZ category
  const toggleNfzCategory = useCallback((category: NoFlyCategory) => {
    const catLayers = getLayersByCategory(category);
    const catIds = catLayers.map(l => l.id);
    setEnabledNfzLayers(prev => {
      const allEnabled = catIds.every(id => prev.includes(id));
      if (allEnabled) return prev.filter(id => !catIds.includes(id));
      return [...prev.filter(id => !catIds.includes(id)), ...catIds];
    });
  }, []);

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

${hasPilotData ? (() => {
      const pilotPt = trail.find(p => p.pilot_lat != null && p.pilot_lon != null);
      if (!pilotPt || pilotPt.pilot_lat == null || pilotPt.pilot_lon == null) return '';
      return `<h2>Pilot / Fernsteuerungsposition</h2>
<div class="grid">
  <div class="card"><div class="card-label">Position</div><div class="card-value" style="font-family:monospace;font-size:14px">${pilotPt.pilot_lat.toFixed(6)}, ${pilotPt.pilot_lon.toFixed(6)}</div>${pilotAddress ? `<div class="card-sub">${pilotAddress.replace(/</g, '&lt;')}</div>` : ''}</div>
  <div class="card"><div class="card-label">Status</div><div class="card-value">Stationär</div><div class="card-sub">Pilot-Position aus Drohnendaten</div></div>
</div>`;
    })() : ''}

<h2>Verstoß-Details</h2>
<div class="grid">
  <div class="card"><div class="card-label">Zone</div><div class="card-value" style="color:${data.zoneColor}">${data.zoneName}</div><div class="card-sub">Zone-ID: ${data.zoneId}</div></div>
  <div class="card"><div class="card-label">Zeitraum</div><div class="card-value">${formatTime(data.startTime)} - ${data.endTime ? formatTime(data.endTime) : 'aktiv'}</div><div class="card-sub">${formatDate(data.startTime)} | Dauer: ${formatDuration(dur)}</div></div>
</div>

<h2>Flugstatistik</h2>
<div class="grid">
  <div class="card"><div class="card-label">Höhe (m)</div><div class="card-value">${stats ? `${stats.minAlt.toFixed(1)} - ${stats.maxAlt.toFixed(1)}` : '-'}</div><div class="card-sub">Durchschnitt: ${stats ? stats.avgAlt.toFixed(1) : '-'}m</div></div>
  <div class="card"><div class="card-label">Geschwindigkeit (m/s)</div><div class="card-value">max. ${stats ? stats.maxSpeed.toFixed(1) : '-'}</div><div class="card-sub">Durchschnitt: ${stats ? stats.avgSpeed.toFixed(1) : '-'} m/s</div></div>
  <div class="card"><div class="card-label">Batterie</div><div class="card-value">${stats?.startBattery != null ? `${stats.startBattery.toFixed(1)}%` : '-'} &rarr; ${stats?.endBattery != null ? `${stats.endBattery.toFixed(1)}%` : '-'}</div></div>
  <div class="card"><div class="card-label">Messpunkte</div><div class="card-value">${trail.length}</div><div class="card-sub">Abtastrate: ~${duration > 0 && trail.length > 1 ? (duration / (trail.length - 1)).toFixed(1) : '-'}s</div></div>
</div>

<h2>Flugdaten (Messpunkte)</h2>
<table>
  <thead><tr><th>#</th><th>Zeit</th><th>Lat</th><th>Lon</th><th>Höhe (m)</th><th>Speed (m/s)</th><th>Batterie</th><th>Signal (dBm)</th></tr></thead>
  <tbody>
    ${trail.map((p, i) => `<tr><td>${i + 1}</td><td>${formatTime(p.ts)}</td><td>${p.lat.toFixed(6)}</td><td>${p.lon.toFixed(6)}</td><td>${p.alt.toFixed(1)}</td><td>${p.speed.toFixed(1)}</td><td>${p.battery != null ? p.battery.toFixed(1) + '%' : '-'}</td><td>${p.signal != null ? p.signal.toFixed(1) : '-'}</td></tr>`).join('\n    ')}
  </tbody>
</table>

${comments.trim() ? `<h2>Kommentare</h2><div class="comments">${comments.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}

<div class="footer">
  Generiert von FlightArc | ${new Date().toLocaleString('de-DE')} | Verstoß-ID: ${data.id}
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
          <button onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Zurück</button>
        </div>
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
          }}>&#8592; Zurück</button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Flugbericht</span>
          {data && (
            <>
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
            </>
          )}
        </div>
        {data && (
          <button onClick={generateReport} style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            &#128196; Bericht erstellen
          </button>
        )}
      </div>

      {/* Main area: Map + Right panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Map area */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Loading overlay */}
          {!data && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-primary)', opacity: 0.9,
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Lade Flugbericht...</span>
            </div>
          )}

          {/* Stats overlay — offset right to avoid zoom controls */}
          {showStats && stats && data && (
            <div style={{
              position: 'absolute', top: 12, left: 60, zIndex: 1000,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12,
              display: 'flex', gap: 16, opacity: 0.95,
            }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Höhe:</span> {stats.minAlt.toFixed(0)}-{stats.maxAlt.toFixed(0)}m</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Speed:</span> avg {stats.avgSpeed.toFixed(1)} m/s</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Punkte:</span> {totalPoints}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Dauer:</span> {formatDuration(duration)}</div>
            </div>
          )}

          {/* Drone + Pilot info overlay (bottom left) */}
          {data && currentPoint && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 240, maxWidth: 340,
              opacity: 0.95,
            }}>
              {/* Drone section */}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                &#9992; {data.droneName}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>ID:</span>
                <span style={{ fontFamily: 'monospace' }}>{data.droneId}</span>
                <span style={{ color: 'var(--text-muted)' }}>Position:</span>
                <span style={{ fontFamily: 'monospace' }}>{currentPoint.lat.toFixed(5)}, {currentPoint.lon.toFixed(5)}</span>
                {droneAddress && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>Ort:</span>
                    <span style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{droneAddress}</span>
                  </>
                )}
                <span style={{ color: 'var(--text-muted)' }}>Höhe:</span>
                <span>{currentPoint.alt.toFixed(1)} m</span>
                <span style={{ color: 'var(--text-muted)' }}>Speed:</span>
                <span>{currentPoint.speed.toFixed(1)} m/s ({(currentPoint.speed * 3.6).toFixed(0)} km/h)</span>
                {currentPoint.battery != null && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>Batterie:</span>
                    <span>{currentPoint.battery.toFixed(1)}%</span>
                  </>
                )}
                {currentPoint.signal != null && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>Signal:</span>
                    <span style={{ color: signalColor(currentPoint.signal) }}>{currentPoint.signal.toFixed(1)} dBm</span>
                  </>
                )}
                {currentPoint.heading != null && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>Heading:</span>
                    <span>{currentPoint.heading.toFixed(0)}&deg;</span>
                  </>
                )}
                <span style={{ color: 'var(--text-muted)' }}>Quelle:</span>
                <span>{data.droneId.startsWith('AZTEST') ? 'Simulator' : 'Live'}</span>
              </div>

              {/* Pilot section — always shown if data available */}
              {currentPoint.pilot_lat != null && currentPoint.pilot_lon != null && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, color: '#3b82f6', marginBottom: 4 }}>
                    &#128100; Pilot
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Position:</span>
                    <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>
                      {currentPoint.pilot_lat.toFixed(5)}, {currentPoint.pilot_lon.toFixed(5)}
                    </span>
                    {pilotAddress && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>Standort:</span>
                        <span style={{ fontSize: 10, color: '#3b82f6' }}>{pilotAddress}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Layer toggles panel (top right on map) */}
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px', fontSize: 11,
            opacity: 0.95, minWidth: 180,
          }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Kartenebenen
            </div>

            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={showZone} onChange={() => setShowZone(!showZone)} />
              <span style={{ color: data?.zoneColor || 'var(--text-primary)' }}>&#9634;</span> Flight Zone
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={showTrail} onChange={() => setShowTrail(!showTrail)} />
              <span style={{ color: '#f97316' }}>&#8212;</span> Flugspur
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={showDroneMarker} onChange={() => setShowDroneMarker(!showDroneMarker)} />
              <span style={{ color: '#f97316' }}>&#9679;</span> Drohne
            </label>
            {hasPilotData && (
              <label style={checkboxLabelStyle}>
                <input type="checkbox" checked={showPilot} onChange={() => setShowPilot(!showPilot)} />
                <span style={{ color: '#3b82f6' }}>&#9679;</span> Pilot
              </label>
            )}
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={showStats} onChange={() => setShowStats(!showStats)} />
              Statistik-Overlay
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={followDrone} onChange={() => setFollowDrone(!followDrone)} />
              Drohne verfolgen
            </label>

            {/* NFZ section */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
              <label style={checkboxLabelStyle}>
                <input type="checkbox" checked={showNfz} onChange={() => {
                  const next = !showNfz;
                  setShowNfz(next);
                  if (next && enabledNfzLayers.length === 0) {
                    // Enable default NFZ layers
                    setEnabledNfzLayers(NFZ_LAYERS.filter(l => l.defaultEnabled).map(l => l.id));
                    setNfzPanelOpen(true);
                  }
                }} />
                <span style={{ color: '#ef4444' }}>&#9888;</span> Flugverbotszonen (NFZ)
              </label>

              {showNfz && (
                <>
                  <button
                    onClick={() => setNfzPanelOpen(!nfzPanelOpen)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      fontSize: 10, cursor: 'pointer', padding: '2px 0 2px 20px',
                    }}
                  >
                    {nfzPanelOpen ? '\u25BC' : '\u25B6'} {enabledNfzLayers.length} Layer aktiv
                  </button>

                  {nfzPanelOpen && (
                    <div style={{ paddingLeft: 12, maxHeight: 200, overflow: 'auto' }}>
                      {NFZ_CATEGORIES.map(cat => {
                        const catLayers = getLayersByCategory(cat.id);
                        const allEnabled = catLayers.every(l => enabledNfzLayers.includes(l.id));
                        const someEnabled = catLayers.some(l => enabledNfzLayers.includes(l.id));
                        return (
                          <div key={cat.id} style={{ marginBottom: 4 }}>
                            <label style={{ ...checkboxLabelStyle, fontWeight: 600, color: cat.color }}>
                              <input
                                type="checkbox"
                                checked={allEnabled}
                                ref={el => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
                                onChange={() => toggleNfzCategory(cat.id)}
                              />
                              {cat.label}
                            </label>
                            {catLayers.map(layer => (
                              <label key={layer.id} style={{ ...checkboxLabelStyle, paddingLeft: 16 }}>
                                <input
                                  type="checkbox"
                                  checked={enabledNfzLayers.includes(layer.id)}
                                  onChange={() => toggleNfzLayer(layer.id)}
                                />
                                {layer.label}
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right panel: Current point + Measurements + Comments */}
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
                <div><span style={{ color: 'var(--text-muted)' }}>Höhe:</span> {currentPoint.alt.toFixed(1)}m</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Lat:</span> {currentPoint.lat.toFixed(6)}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Speed:</span> {currentPoint.speed.toFixed(1)} m/s</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Lon:</span> {currentPoint.lon.toFixed(6)}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Batterie:</span> {currentPoint.battery != null ? `${currentPoint.battery.toFixed(1)}%` : '-'}</div>
              </div>
            </div>
          )}

          {/* Measurement list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!data ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                Lade Daten...
              </div>
            ) : trail.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                Keine Messpunkte vorhanden
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>#</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Zeit</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>Höhe</th>
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
            )}
          </div>

          {/* Comments */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Kommentare</div>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Kommentar zum Verstoß..."
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
