import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Drone, UserLocation } from '../types/drone';
import { useNavigate } from 'react-router-dom';
import { DIPUL_WMS_URL, getWmsLayerString, NFZ_LAYERS } from '../config/noFlyZones';
import { useTheme } from '../ThemeContext';
import type { TrailData } from '../useTracking';
import type { FlightZone } from '../types/drone';

// Persist map view across remounts (route navigation)
let savedCenter: [number, number] = [52.0302, 8.5325]; // Bielefeld
let savedZoom = 13;

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  idle: '#eab308',
  error: '#ef4444',
  lost: '#6b7280',
};

const SOURCE_COLORS: Record<string, string> = {
  simulator: '#3b82f6',
  opensky: '#f59e0b',
  adsbfi: '#8b5cf6',
  adsblol: '#ec4899',
  ogn: '#10b981',
  receiver: '#14b8a6',
};

// Friendly labels for DIPUL type_code values
const TYPE_CODE_LABELS: Record<string, string> = {
  FLUGHAFEN: 'Flughafen',
  FLUGPLATZ: 'Flugplatz',
  KONTROLLZONE: 'Kontrollzone',
  FLUGBESCHRAENKUNGSGEBIET: 'Flugbeschränkungsgebiet',
  MODELLFLUGPLATZ: 'Modellflugplatz',
  TEMPORAERE_BETRIEBSEINSCHRAENKUNG: 'Temporäre Einschränkung',
  NATURSCHUTZGEBIET: 'Naturschutzgebiet',
  NATIONALPARK: 'Nationalpark',
  VOGELSCHUTZGEBIET: 'Vogelschutzgebiet',
  FFH_GEBIET: 'FFH-Gebiet',
  KRAFTWERK: 'Kraftwerk',
  BUNDESAUTOBAHN: 'Bundesautobahn',
  STROMLEITUNG: 'Stromleitung',
  WINDKRAFTANLAGE: 'Windkraftanlage',
  MILITAERISCHE_ANLAGE: 'Militärische Anlage',
  KRANKENHAUS: 'Krankenhaus',
  JUSTIZVOLLZUGSANSTALT: 'Justizvollzugsanstalt',
};

function formatTypeCode(code: string): string {
  return TYPE_CODE_LABELS[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getColor(drone: Drone): string {
  return drone.source
    ? (SOURCE_COLORS[drone.source] || STATUS_COLORS[drone.status] || '#6b7280')
    : (STATUS_COLORS[drone.status] || '#6b7280');
}

function signalColor(rssi: number): string {
  if (rssi >= -50) return '#22c55e';
  if (rssi >= -70) return '#eab308';
  return '#ef4444';
}

function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `
      <div style="
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          border: 3px solid #fff;
          box-shadow: 0 0 12px rgba(59,130,246,0.6);
          animation: user-pulse 2s infinite;
        "></div>
      </div>
    `,
  });
}

function buildPopup(drone: Drone): string {
  const sourceTag = drone.source_label
    ? `<span style="background: ${SOURCE_COLORS[drone.source || ''] || '#6b7280'}22; color: ${SOURCE_COLORS[drone.source || ''] || '#6b7280'}; padding: 1px 6px; border-radius: 3px; font-size: 10px;">${drone.source_label}</span>`
    : '';
  const signalText = drone.signal_strength != null
    ? `<span style="color: ${signalColor(drone.signal_strength)};">${drone.signal_strength} dBm</span>`
    : '<span style="color: #666;">N/A</span>';
  const batteryText = drone.battery != null ? `${drone.battery}%` : 'N/A';

  return `
    <div style="font-family: sans-serif; font-size: 12px; min-width: 160px; color: var(--text-primary);">
      <strong style="font-size: 13px;">${drone.name}</strong> ${sourceTag}<br/>
      <span style="color: ${STATUS_COLORS[drone.status]};">&#9679;</span> ${drone.status.toUpperCase()}
      <hr style="margin: 4px 0; border-color: var(--border);" />
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;">
        <span style="color: var(--text-muted);">Signal:</span>
        ${signalText}
        <span style="color: var(--text-muted);">Batterie:</span>
        <span>${batteryText}</span>
        <span style="color: var(--text-muted);">Höhe MSL:</span>
        <span>${Math.round(drone.altitude_baro ?? drone.altitude)} m</span>
        <span style="color: var(--text-muted);">Speed:</span>
        <span>${drone.speed.toFixed(1)} m/s (${(drone.speed * 3.6).toFixed(0)} km/h)</span>
        ${drone.distance !== undefined ? `<span style="color: var(--text-muted);">Entfernung:</span><span>${(drone.distance / 1000).toFixed(1)} km</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Build a WMS GetFeatureInfo URL using the map's current view state.
 * Uses the exact same CRS/bbox as the tile requests for pixel-perfect accuracy.
 */
function buildFeatureInfoUrl(
  map: L.Map,
  containerPoint: L.Point,
  wmsLayers: string,
): string {
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());

  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: wmsLayers,
    query_layers: wmsLayers,
    crs: 'EPSG:3857',
    bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    width: String(size.x),
    height: String(size.y),
    i: String(Math.round(containerPoint.x)),
    j: String(Math.round(containerPoint.y)),
    info_format: 'application/json',
  });

  return `${DIPUL_WMS_URL}?${params}`;
}

/**
 * Format altitude range from feature properties.
 */
function formatAltitude(p: Record<string, unknown>): string {
  const parts: string[] = [];
  if (p.lower_limit_altitude != null) {
    parts.push(`${p.lower_limit_altitude} ${p.lower_limit_unit || 'm'} ${p.lower_limit_alt_ref || 'AGL'}`);
  }
  if (p.upper_limit_altitude != null) {
    parts.push(`${p.upper_limit_altitude} ${p.upper_limit_unit || 'm'} ${p.upper_limit_alt_ref || 'AGL'}`);
  }
  if (parts.length === 2) return `${parts[0].trim()} – ${parts[1].trim()}`;
  if (parts.length === 1) return parts[0].trim();
  return '';
}

/**
 * Get DIPUL category color for a type_code.
 */
function getNfzTypeColor(typeCode: string): string {
  const tc = typeCode.toUpperCase();
  if (['FLUGHAFEN', 'FLUGPLATZ', 'KONTROLLZONE', 'FLUGBESCHRAENKUNGSGEBIET', 'MODELLFLUGPLATZ'].includes(tc)) return '#ef4444';
  if (['NATURSCHUTZGEBIET', 'NATIONALPARK', 'VOGELSCHUTZGEBIET', 'FFH_GEBIET'].includes(tc)) return '#22c55e';
  if (['KRAFTWERK', 'BUNDESAUTOBAHN', 'STROMLEITUNG', 'WINDKRAFTANLAGE'].includes(tc)) return '#eab308';
  if (['MILITAERISCHE_ANLAGE', 'KRANKENHAUS', 'JUSTIZVOLLZUGSANSTALT'].includes(tc)) return '#8b5cf6';
  if (tc.includes('TEMPORAER')) return '#f97316';
  return '#ef4444';
}

/**
 * Deduplicate features by name.
 */
function dedupeFeatures(features: Array<{ properties: Record<string, unknown> }>): Array<{ properties: Record<string, unknown> }> {
  const seen = new Set<string>();
  return features.filter(f => {
    const name = String(f.properties.name || '');
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/**
 * Build HTML for the no-fly zone hover tooltip from GeoJSON feature properties.
 */
function buildNfzTooltipHtml(features: Array<{ properties: Record<string, unknown> }>): string {
  const unique = dedupeFeatures(features);

  return unique.slice(0, 3).map((f, idx) => {
    const p = f.properties;
    const name = String(p.name || 'Unbenannte Zone');
    const typeCode = String(p.type_code || '');
    const typeLabel = typeCode ? formatTypeCode(typeCode) : '';
    const typeColor = typeCode ? getNfzTypeColor(typeCode) : '#ef4444';
    const altText = formatAltitude(p);
    const legal = p.legal_ref ? String(p.legal_ref) : '';

    return `
      <div style="margin-bottom:4px;${idx > 0 ? 'padding-top:4px;border-top:1px solid var(--popup-divider);' : ''}">
        <div style="font-weight:600;font-size:12px;color:var(--popup-text);">${name}</div>
        ${typeLabel ? `<div style="font-size:11px;color:${typeColor};margin-top:1px;">${typeLabel}</div>` : ''}
        ${altText ? `<div style="font-size:10px;color:var(--popup-text-secondary);margin-top:1px;">Höhe: ${altText}</div>` : ''}
        ${legal ? `<div style="font-size:10px;color:var(--popup-text-muted);margin-top:1px;">${legal}</div>` : ''}
      </div>
    `;
  }).join('') + (unique.length > 3 ? `<div style="font-size:10px;color:var(--popup-text-muted);">+${unique.length - 3} weitere</div>` : '');
}

/**
 * Build HTML for the no-fly zone click popup (detailed view).
 */
function buildNfzPopupHtml(features: Array<{ properties: Record<string, unknown> }>): string {
  const unique = dedupeFeatures(features);

  const header = `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;min-width:220px;max-width:320px;color:var(--text-primary);">`;
  const footer = `</div>`;

  const items = unique.map((f, idx) => {
    const p = f.properties;
    const name = String(p.name || 'Unbenannte Zone');
    const typeCode = String(p.type_code || '');
    const typeLabel = typeCode ? formatTypeCode(typeCode) : '';
    const typeColor = typeCode ? getNfzTypeColor(typeCode) : '#ef4444';
    const altText = formatAltitude(p);
    const legal = p.legal_ref ? String(p.legal_ref) : '';
    const extRef = p.external_reference ? String(p.external_reference) : '';

    const rows: string[] = [];
    if (typeLabel) rows.push(`<span style="color:var(--text-muted);">Typ:</span><span style="color:${typeColor};">${typeLabel}</span>`);
    if (altText) rows.push(`<span style="color:var(--text-muted);">Höhe:</span><span>${altText}</span>`);
    if (legal) rows.push(`<span style="color:var(--text-muted);">Rechtsgrundlage:</span><span>${legal}</span>`);
    if (extRef) rows.push(`<span style="color:var(--text-muted);">Referenz:</span><span>${extRef}</span>`);

    // Show any extra properties not already displayed
    const knownKeys = new Set(['name', 'type_code', 'legal_ref', 'lower_limit_altitude', 'lower_limit_unit', 'lower_limit_alt_ref', 'upper_limit_altitude', 'upper_limit_unit', 'upper_limit_alt_ref', 'external_reference']);
    Object.entries(p).forEach(([key, val]) => {
      if (!knownKeys.has(key) && val != null && val !== '') {
        rows.push(`<span style="color:var(--text-muted);">${key.replace(/_/g, ' ')}:</span><span>${String(val)}</span>`);
      }
    });

    return `
      <div style="${idx > 0 ? 'margin-top:8px;padding-top:8px;border-top:1px solid var(--border);' : ''}">
        <strong style="font-size:13px;">${name}</strong>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:4px;">
          ${rows.join('')}
        </div>
      </div>
    `;
  }).join('');

  return header + items + footer;
}

interface Props {
  drones: Drone[];
  selectedDrone: Drone | null;
  userLocation: UserLocation | null;
  onDroneClick: (drone: Drone) => void;
  activeNoFlyLayers: string[];
  nfzBounds: L.LatLngBoundsExpression | null;
  nfzRadiusCenter: { lat: number; lon: number } | null;
  nfzRadiusMeters: number | null;
  droneRadiusCenter: { lat: number; lon: number } | null;
  droneRadiusMeters: number | null;
  trails?: TrailData[];
  flightZones?: FlightZone[];
  drawingMode?: boolean;
  pendingPoints?: [number, number][];
  snappable?: boolean;
  onMapClickForZone?: (lat: number, lon: number) => boolean | void;
  focusPosition?: { lat: number; lon: number } | null;
}

// Store drone data for map event handlers (avoids stale closures)
let droneDataMap: Map<string, Drone> = new Map();
// Store active WMS layer string for event handlers
let currentWmsLayers = '';
// Store drawing mode state for click handler
let isDrawingMode = false;
let drawingClickHandler: ((lat: number, lon: number) => boolean | void) | null = null;

const TILE_URLS = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

export default function MapComponent({ drones, selectedDrone, userLocation, onDroneClick, activeNoFlyLayers, nfzBounds, nfzRadiusCenter, nfzRadiusMeters, droneRadiusCenter, droneRadiusMeters, trails = [], flightZones = [], drawingMode = false, pendingPoints = [], snappable = false, onMapClickForZone, focusPosition }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const droneMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const selectedMarkerRef = useRef<L.CircleMarker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const pilotMarkerRef = useRef<L.CircleMarker | null>(null);
  const wmsLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const nfzPaneRef = useRef<HTMLElement | null>(null);
  const nfzRadiusCircleRef = useRef<L.Circle | null>(null);
  const droneRadiusCircleRef = useRef<L.Circle | null>(null);
  const nfzTooltipRef = useRef<HTMLDivElement | null>(null);
  const nfzFetchControllerRef = useRef<AbortController | null>(null);
  const nfzDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailPolylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const zonePolygonsRef = useRef<Map<string, L.Polygon>>(new Map());
  const zoneLabelsRef = useRef<Map<string, L.Tooltip>>(new Map());
  const drawingPolylineRef = useRef<L.Polyline | null>(null);
  const drawingMarkersRef = useRef<L.CircleMarker[]>([]);
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Initialize map with Canvas renderer for correct positioning at all zoom levels
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: savedCenter,
      zoom: savedZoom,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    // Only show zoom controls on desktop
    if (window.innerWidth >= 768) {
      L.control.zoom({ position: 'topleft' }).addTo(map);
    }

    // Map tiles (theme-aware, initial)
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    tileLayerRef.current = L.tileLayer(TILE_URLS[initialTheme as keyof typeof TILE_URLS] || TILE_URLS.dark, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Create custom pane for NFZ WMS layer (for clip-path radius clipping)
    map.createPane('nfz');
    const nfzPane = map.getPane('nfz')!;
    nfzPane.style.zIndex = '250';
    nfzPaneRef.current = nfzPane;

    // Create NFZ hover tooltip element
    const tooltipDiv = document.createElement('div');
    tooltipDiv.className = 'nfz-tooltip';
    tooltipDiv.setAttribute('data-testid', 'nfz-tooltip');
    tooltipDiv.style.cssText = [
      'position:absolute',
      'display:none',
      'pointer-events:none',
      'z-index:2000',
      'background:var(--popup-bg)',
      'border:1px solid var(--popup-border)',
      'border-radius:8px',
      'padding:8px 12px',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'max-width:280px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'color:var(--popup-text)',
    ].join(';');
    mapContainerRef.current.appendChild(tooltipDiv);
    nfzTooltipRef.current = tooltipDiv;

    // NFZ hover handler - GetFeatureInfo on mousemove (debounced)
    function handleMouseMove(e: L.LeafletMouseEvent) {
      if (!currentWmsLayers) return;

      // Clear previous debounce
      if (nfzDebounceRef.current) clearTimeout(nfzDebounceRef.current);
      if (nfzFetchControllerRef.current) nfzFetchControllerRef.current.abort();

      nfzDebounceRef.current = setTimeout(async () => {
        const url = buildFeatureInfoUrl(map, e.containerPoint, currentWmsLayers);
        const controller = new AbortController();
        nfzFetchControllerRef.current = controller;

        try {
          const resp = await fetch(url, { signal: controller.signal });
          if (!resp.ok || controller.signal.aborted) return;
          const data = await resp.json();

          if (data.features && data.features.length > 0 && tooltipDiv) {
            tooltipDiv.innerHTML = buildNfzTooltipHtml(data.features);
            tooltipDiv.style.display = 'block';
            // Position relative to map container
            const x = e.containerPoint.x + 16;
            const y = e.containerPoint.y - 10;
            // Keep tooltip within map bounds
            const mapWidth = mapContainerRef.current?.clientWidth || 800;
            const tooltipWidth = tooltipDiv.offsetWidth || 200;
            const adjustedX = x + tooltipWidth > mapWidth ? x - tooltipWidth - 32 : x;
            tooltipDiv.style.left = adjustedX + 'px';
            tooltipDiv.style.top = y + 'px';
          } else if (tooltipDiv) {
            tooltipDiv.style.display = 'none';
          }
        } catch {
          // Aborted or network error - ignore
        }
      }, 200);
    }

    function handleMouseOut() {
      if (nfzDebounceRef.current) clearTimeout(nfzDebounceRef.current);
      if (nfzFetchControllerRef.current) nfzFetchControllerRef.current.abort();
      if (tooltipDiv) tooltipDiv.style.display = 'none';
    }

    // NFZ click handler - GetFeatureInfo on click for detailed popup
    function handleMapClick(e: L.LeafletMouseEvent) {
      // Drawing mode intercepts clicks
      if (isDrawingMode && drawingClickHandler) {
        drawingClickHandler(e.latlng.lat, e.latlng.lng);
        return;
      }
      if (!currentWmsLayers) return;

      const url = buildFeatureInfoUrl(map, e.containerPoint, currentWmsLayers);
      const controller = new AbortController();

      fetch(url, { signal: controller.signal })
        .then(resp => resp.ok ? resp.json() : null)
        .then(data => {
          if (data?.features?.length > 0) {
            // Hide hover tooltip
            if (tooltipDiv) tooltipDiv.style.display = 'none';
            // Open Leaflet popup with detailed info
            L.popup({ maxWidth: 350, className: 'nfz-popup' })
              .setLatLng(e.latlng)
              .setContent(buildNfzPopupHtml(data.features))
              .openOn(map);
          }
        })
        .catch(() => { /* ignore */ });
    }

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);
    map.on('click', handleMapClick);
    // Hide tooltip during zoom/pan
    map.on('zoomstart', handleMouseOut);
    map.on('movestart', handleMouseOut);

    mapRef.current = map;
    // Expose map instance on container for E2E testing
    (mapContainerRef.current as any)._leaflet_map = map;

    return () => {
      const c = map.getCenter();
      savedCenter = [c.lat, c.lng];
      savedZoom = map.getZoom();
      if (nfzDebounceRef.current) clearTimeout(nfzDebounceRef.current);
      if (nfzFetchControllerRef.current) nfzFetchControllerRef.current.abort();
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
      map.off('click', handleMapClick);
      map.off('zoomstart', handleMouseOut);
      map.off('movestart', handleMouseOut);
      if (tooltipDiv.parentNode) tooltipDiv.parentNode.removeChild(tooltipDiv);
      nfzTooltipRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch tile layer when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileLayerRef.current) return;

    const url = TILE_URLS[theme] || TILE_URLS.dark;
    tileLayerRef.current.setUrl(url);
  }, [theme]);

  // Update user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userLocation.latitude, userLocation.longitude]);
      } else {
        userMarkerRef.current = L.marker(
          [userLocation.latitude, userLocation.longitude],
          { icon: createUserIcon(), zIndexOffset: 1000 }
        )
          .addTo(map)
          .bindPopup(`<strong>Dein Standort</strong><br/>Genauigkeit: ${Math.round(userLocation.accuracy)}m`);
      }
      map.setView([userLocation.latitude, userLocation.longitude], 14);
    }
  }, [userLocation]);

  // Fly to focus position (e.g. when selecting drone from violation table)
  const prevFocusRef = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPosition) return;
    if (prevFocusRef.current === focusPosition) return;
    prevFocusRef.current = focusPosition;
    map.flyTo([focusPosition.lat, focusPosition.lon], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [focusPosition]);

  // Update DIPUL WMS no-fly zone overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const wmsLayers = getWmsLayerString(activeNoFlyLayers);
    // Update module-level ref for event handlers
    currentWmsLayers = wmsLayers;

    if (!wmsLayers) {
      // No layers selected — remove WMS overlay and hide tooltip
      if (wmsLayerRef.current) {
        wmsLayerRef.current.remove();
        wmsLayerRef.current = null;
      }
      if (nfzTooltipRef.current) {
        nfzTooltipRef.current.style.display = 'none';
      }
      return;
    }

    // Bounds changed → must recreate layer (can't update bounds dynamically)
    const prevBounds = wmsLayerRef.current?.options?.bounds;
    const boundsChanged = nfzBounds !== prevBounds;

    if (wmsLayerRef.current && !boundsChanged) {
      // Only layers changed — update params
      wmsLayerRef.current.setParams({ layers: wmsLayers });
    } else {
      // Remove old layer and create new one with updated bounds
      if (wmsLayerRef.current) {
        wmsLayerRef.current.remove();
        wmsLayerRef.current = null;
      }
      // Create WMS tile layer with optional bounds for radius limiting
      const opts: Record<string, unknown> = {
        layers: wmsLayers,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: 0.85,
        attribution: 'Geodaten: DFS, BKG 2026',
        className: 'nfz-wms-tiles',
        pane: 'nfz',
      };
      if (nfzBounds) {
        opts.bounds = nfzBounds;
      }
      wmsLayerRef.current = L.tileLayer.wms(DIPUL_WMS_URL, opts as any).addTo(map);
    }
  }, [activeNoFlyLayers, nfzBounds]);

  // Clip NFZ pane to circular radius (position-based, zoom-independent)
  useEffect(() => {
    const map = mapRef.current;
    const pane = nfzPaneRef.current;
    if (!map || !pane) return;

    function updateClip() {
      if (!nfzRadiusCenter || !nfzRadiusMeters) {
        pane!.style.clipPath = '';
        return;
      }
      const center = L.latLng(nfzRadiusCenter.lat, nfzRadiusCenter.lon);
      const layerPoint = map!.latLngToLayerPoint(center);
      const zoom = map!.getZoom();
      // Earth circumference * cos(lat) / 2^(zoom+8) = meters per pixel
      const metersPerPixel = 40075016.686 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom + 8);
      const radiusPixels = nfzRadiusMeters! / metersPerPixel;
      pane!.style.clipPath = `circle(${radiusPixels}px at ${layerPoint.x}px ${layerPoint.y}px)`;
    }

    map.on('zoomend moveend', updateClip);
    updateClip();

    return () => {
      map.off('zoomend moveend', updateClip);
      pane.style.clipPath = '';
    };
  }, [nfzRadiusCenter, nfzRadiusMeters]);

  // Update NFZ radius circle indicator (dashed red boundary line)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (nfzRadiusCenter && nfzRadiusMeters) {
      const center: L.LatLngExpression = [nfzRadiusCenter.lat, nfzRadiusCenter.lon];
      if (nfzRadiusCircleRef.current) {
        nfzRadiusCircleRef.current.setLatLng(center);
        nfzRadiusCircleRef.current.setRadius(nfzRadiusMeters);
      } else {
        nfzRadiusCircleRef.current = L.circle(center, {
          radius: nfzRadiusMeters,
          color: 'rgba(239, 68, 68, 0.5)',
          weight: 2,
          fillColor: 'transparent',
          fillOpacity: 0,
          dashArray: '8, 6',
          interactive: false,
        }).addTo(map);
      }
    } else {
      if (nfzRadiusCircleRef.current) {
        nfzRadiusCircleRef.current.remove();
        nfzRadiusCircleRef.current = null;
      }
    }
  }, [nfzRadiusCenter, nfzRadiusMeters]);

  // Update drone search radius circle indicator (dashed blue boundary line)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (droneRadiusCenter && droneRadiusMeters) {
      const center: L.LatLngExpression = [droneRadiusCenter.lat, droneRadiusCenter.lon];
      if (droneRadiusCircleRef.current) {
        droneRadiusCircleRef.current.setLatLng(center);
        droneRadiusCircleRef.current.setRadius(droneRadiusMeters);
      } else {
        droneRadiusCircleRef.current = L.circle(center, {
          radius: droneRadiusMeters,
          color: 'rgba(59, 130, 246, 0.4)',
          weight: 2,
          fillColor: 'transparent',
          fillOpacity: 0,
          dashArray: '10, 8',
          interactive: false,
        }).addTo(map);
      }
    } else {
      if (droneRadiusCircleRef.current) {
        droneRadiusCircleRef.current.remove();
        droneRadiusCircleRef.current = null;
      }
    }
  }, [droneRadiusCenter, droneRadiusMeters]);

  // Update drone markers using Canvas-rendered CircleMarkers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Filter drones to only those within the radius circle
    const visibleDrones = (droneRadiusCenter && droneRadiusMeters)
      ? drones.filter(d => {
          const dist = L.latLng(droneRadiusCenter.lat, droneRadiusCenter.lon)
            .distanceTo(L.latLng(d.latitude, d.longitude));
          return dist <= droneRadiusMeters;
        })
      : drones;

    // Update drone data map for event handlers
    droneDataMap = new Map(visibleDrones.map(d => [d.id, d]));

    const currentIds = new Set(visibleDrones.map((d) => d.id));

    // Remove markers for drones no longer in the list (or outside radius)
    droneMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        droneMarkersRef.current.delete(id);
      }
    });

    // Update or create drone markers
    visibleDrones.forEach((drone) => {
      const isSelected = selectedDrone?.id === drone.id;
      const color = getColor(drone);
      const r = isSelected ? 10 : 6;

      const existing = droneMarkersRef.current.get(drone.id);
      if (existing) {
        existing.setLatLng([drone.latitude, drone.longitude]);
        existing.setStyle({
          radius: r,
          fillColor: color,
          color: isSelected ? '#fff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: 0.9,
        });
        existing.setPopupContent(buildPopup(drone));
      } else {
        const marker = L.circleMarker([drone.latitude, drone.longitude], {
          radius: r,
          fillColor: color,
          color: isSelected ? '#fff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: 0.9,
          opacity: 0.8,
        })
          .addTo(map)
          .bindPopup(buildPopup(drone));

        // Use droneDataMap to avoid stale closure
        const droneId = drone.id;
        marker.on('click', () => {
          const current = droneDataMap.get(droneId);
          if (current) onDroneClick(current);
        });
        marker.on('dblclick', () => navigate(`/drone/${droneId}`));
        droneMarkersRef.current.set(drone.id, marker);
      }
    });

    // Selected drone highlight ring
    if (selectedDrone) {
      const pos: L.LatLngExpression = [selectedDrone.latitude, selectedDrone.longitude];
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.setLatLng(pos);
      } else {
        selectedMarkerRef.current = L.circleMarker(pos, {
          radius: 16,
          fillColor: 'transparent',
          color: '#fff',
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0,
        }).addTo(map);
      }

      // Pilot marker (only for selected drone with pilot position)
      if (selectedDrone.pilot_latitude != null && selectedDrone.pilot_longitude != null) {
        const pilotPos: L.LatLngExpression = [selectedDrone.pilot_latitude, selectedDrone.pilot_longitude];
        if (pilotMarkerRef.current) {
          pilotMarkerRef.current.setLatLng(pilotPos);
        } else {
          pilotMarkerRef.current = L.circleMarker(pilotPos, {
            radius: 6,
            fillColor: '#f97316',
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9,
          })
            .addTo(map)
            .bindPopup(`<strong>Pilot: ${selectedDrone.name}</strong>`);
        }
      } else if (pilotMarkerRef.current) {
        pilotMarkerRef.current.remove();
        pilotMarkerRef.current = null;
      }
    } else {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove();
        selectedMarkerRef.current = null;
      }
      if (pilotMarkerRef.current) {
        pilotMarkerRef.current.remove();
        pilotMarkerRef.current = null;
      }
    }
  }, [drones, selectedDrone, onDroneClick, navigate, droneRadiusCenter, droneRadiusMeters]);

  // Render flight trail polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(trails.map(t => t.id));

    // Remove polylines no longer in trails
    trailPolylinesRef.current.forEach((polyline, id) => {
      if (!currentIds.has(id)) {
        polyline.remove();
        trailPolylinesRef.current.delete(id);
      }
    });

    // Update or create polylines
    for (const trail of trails) {
      if (trail.points.length < 2) continue;
      const existing = trailPolylinesRef.current.get(trail.id);

      if (existing) {
        existing.setLatLngs(trail.points);
        existing.setStyle({
          dashArray: trail.dashed ? '8, 6' : undefined,
          color: trail.color,
        });
      } else {
        const polyline = L.polyline(trail.points, {
          color: trail.color,
          weight: 3,
          opacity: trail.dashed ? 0.5 : 0.8,
          dashArray: trail.dashed ? '8, 6' : undefined,
          interactive: true,
        })
          .addTo(map)
          .bindTooltip(trail.label, { sticky: true, direction: 'top' });
        polyline.bringToBack();
        trailPolylinesRef.current.set(trail.id, polyline);
      }
    }
  }, [trails]);

  // Sync drawing mode state to module-level variable for click handler
  useEffect(() => {
    isDrawingMode = drawingMode;
    drawingClickHandler = onMapClickForZone || null;

    // Change cursor for drawing mode
    const container = mapContainerRef.current;
    if (container) {
      container.style.cursor = drawingMode ? 'crosshair' : '';
    }

    return () => {
      isDrawingMode = false;
      drawingClickHandler = null;
      if (container) container.style.cursor = '';
    };
  }, [drawingMode, onMapClickForZone]);

  // Render drawing mode polyline + point markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous drawing visuals
    if (drawingPolylineRef.current) {
      drawingPolylineRef.current.remove();
      drawingPolylineRef.current = null;
    }
    drawingMarkersRef.current.forEach(m => m.remove());
    drawingMarkersRef.current = [];

    if (!drawingMode || pendingPoints.length === 0) return;

    // Draw polyline connecting pending points (close it if 3+ points)
    const latlngs = pendingPoints.map(p => L.latLng(p[0], p[1]));
    if (pendingPoints.length >= 3) {
      // Close the polygon preview
      latlngs.push(latlngs[0]);
    }
    drawingPolylineRef.current = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 2,
      dashArray: '6, 4',
      opacity: 0.8,
      interactive: false,
    }).addTo(map);

    // Draw point markers
    pendingPoints.forEach((p, i) => {
      const isFirst = i === 0;
      const showSnap = isFirst && snappable;
      const marker = L.circleMarker([p[0], p[1]], {
        radius: showSnap ? 9 : 5,
        fillColor: isFirst ? '#22c55e' : '#3b82f6',
        color: showSnap ? '#22c55e' : '#fff',
        weight: showSnap ? 3 : 2,
        fillOpacity: showSnap ? 0.5 : 1,
        interactive: false,
        className: showSnap ? 'drone-marker-pulse' : undefined,
      }).addTo(map);
      drawingMarkersRef.current.push(marker);
    });

    return () => {
      if (drawingPolylineRef.current) {
        drawingPolylineRef.current.remove();
        drawingPolylineRef.current = null;
      }
      drawingMarkersRef.current.forEach(m => m.remove());
      drawingMarkersRef.current = [];
    };
  }, [drawingMode, pendingPoints, snappable]);

  // Render flight zone polygons with permanent name labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(flightZones.map(z => z.id));

    // Remove polygons and labels no longer in zones
    zonePolygonsRef.current.forEach((polygon, id) => {
      if (!currentIds.has(id)) {
        polygon.remove();
        zonePolygonsRef.current.delete(id);
      }
    });
    zoneLabelsRef.current.forEach((label, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(label as unknown as L.Layer);
        zoneLabelsRef.current.delete(id);
      }
    });

    // Helper: compute polygon centroid for label placement
    function centroid(polygon: [number, number][]): [number, number] {
      let latSum = 0, lonSum = 0;
      for (const [lat, lon] of polygon) {
        latSum += lat;
        lonSum += lon;
      }
      return [latSum / polygon.length, lonSum / polygon.length];
    }

    // Build altitude label suffix
    function altLabel(zone: FlightZone): string {
      const min = zone.minAltitudeAGL;
      const max = zone.maxAltitudeAGL;
      if (min === null && max === null) return '';
      return `\n${min ?? 0}–${max ?? '∞'} m AGL`;
    }

    // Update or create polygons
    for (const zone of flightZones) {
      if (zone.polygon.length < 3) continue;
      const latlngs: L.LatLngExpression[] = zone.polygon.map(p => [p[0], p[1]]);
      const labelText = zone.name + altLabel(zone);
      const center = centroid(zone.polygon);
      const existing = zonePolygonsRef.current.get(zone.id);

      if (existing) {
        existing.setLatLngs(latlngs);
        existing.setStyle({ color: zone.color, fillColor: zone.color });
      } else {
        const polygon = L.polygon(latlngs, {
          color: zone.color,
          fillColor: zone.color,
          fillOpacity: 0.15,
          weight: 2,
          opacity: 0.7,
          interactive: true,
        }).addTo(map);
        polygon.bringToBack();
        zonePolygonsRef.current.set(zone.id, polygon);
      }

      // Permanent label at centroid
      const existingLabel = zoneLabelsRef.current.get(zone.id);
      if (existingLabel) {
        existingLabel.setLatLng(L.latLng(center[0], center[1]));
        existingLabel.setContent(`<div style="text-align:center;white-space:pre">${labelText}</div>`);
      } else {
        const tooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'zone-label',
          interactive: false,
        })
          .setLatLng(L.latLng(center[0], center[1]))
          .setContent(`<div style="text-align:center;white-space:pre">${labelText}</div>`)
          .addTo(map);
        zoneLabelsRef.current.set(zone.id, tooltip);
      }
    }
  }, [flightZones]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
    />
  );
}
