import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Drone, UserLocation } from '../types/drone';
import { useNavigate } from 'react-router-dom';

// Persist map view across remounts (route navigation)
let savedCenter: [number, number] = [50.1109, 8.6821];
let savedZoom = 13;

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  idle: '#eab308',
  error: '#ef4444',
  lost: '#6b7280',
};

function createDroneIcon(status: string, isSelected: boolean): L.DivIcon {
  const color = STATUS_COLORS[status] || '#6b7280';
  const size = isSelected ? 20 : 14;
  const pulse = status === 'active' ? 'drone-marker-pulse' : '';

  return L.divIcon({
    className: '',
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    html: `
      <div style="
        width: ${size * 2}px;
        height: ${size * 2}px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      ">
        <div class="${pulse}" style="
          position: absolute;
          width: ${size * 2}px;
          height: ${size * 2}px;
          border-radius: 50%;
          background: ${color}33;
        "></div>
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid ${isSelected ? '#fff' : color};
          box-shadow: 0 0 8px ${color}88;
          z-index: 1;
        "></div>
      </div>
    `,
  });
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

function signalColor(rssi: number): string {
  if (rssi >= -50) return '#22c55e';
  if (rssi >= -70) return '#eab308';
  return '#ef4444';
}

interface Props {
  drones: Drone[];
  selectedDrone: Drone | null;
  userLocation: UserLocation | null;
  onDroneClick: (drone: Drone) => void;
}

export default function MapComponent({ drones, selectedDrone, userLocation, onDroneClick }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const droneMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const pilotMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const navigate = useNavigate();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: savedCenter,
      zoom: savedZoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Dark map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      const c = map.getCenter();
      savedCenter = [c.lat, c.lng];
      savedZoom = map.getZoom();
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Update drone markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drones.map((d) => d.id));

    // Remove old markers
    droneMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        droneMarkersRef.current.delete(id);
      }
    });
    pilotMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        pilotMarkersRef.current.delete(id);
      }
    });

    // Update or create drone markers
    drones.forEach((drone) => {
      const isSelected = selectedDrone?.id === drone.id;
      const icon = createDroneIcon(drone.status, isSelected);

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; min-width: 160px;">
          <strong style="font-size: 13px;">${drone.name}</strong><br/>
          <span style="color: ${STATUS_COLORS[drone.status]};">&#9679;</span> ${drone.status.toUpperCase()}
          <hr style="margin: 4px 0; border-color: #444;" />
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;">
            <span style="color: #999;">Signal:</span>
            <span style="color: ${signalColor(drone.signal_strength)};">${drone.signal_strength} dBm</span>
            <span style="color: #999;">Batterie:</span>
            <span>${drone.battery}%</span>
            <span style="color: #999;">Höhe:</span>
            <span>${drone.altitude}m</span>
            <span style="color: #999;">Speed:</span>
            <span>${drone.speed} m/s</span>
            ${drone.distance !== undefined ? `<span style="color: #999;">Entfernung:</span><span>${(drone.distance / 1000).toFixed(1)} km</span>` : ''}
          </div>
        </div>
      `;

      const existing = droneMarkersRef.current.get(drone.id);
      if (existing) {
        existing.setLatLng([drone.latitude, drone.longitude]);
        existing.setIcon(icon);
        existing.setPopupContent(popupContent);
      } else {
        const marker = L.marker([drone.latitude, drone.longitude], {
          icon,
          zIndexOffset: isSelected ? 500 : 0,
        })
          .addTo(map)
          .bindPopup(popupContent);

        marker.on('click', () => onDroneClick(drone));
        marker.on('dblclick', () => navigate(`/drone/${drone.id}`));
        droneMarkersRef.current.set(drone.id, marker);
      }

      // Pilot marker (only for selected drone)
      if (isSelected) {
        const pilotIcon = L.divIcon({
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          html: `<div style="
            width: 12px; height: 12px;
            border-radius: 50%;
            background: #f97316;
            border: 2px solid #fff;
            box-shadow: 0 0 6px rgba(249,115,22,0.6);
          "></div>`,
        });

        const pilotExisting = pilotMarkersRef.current.get(drone.id);
        if (pilotExisting) {
          pilotExisting.setLatLng([drone.pilot_latitude, drone.pilot_longitude]);
        } else {
          const pilotMarker = L.marker(
            [drone.pilot_latitude, drone.pilot_longitude],
            { icon: pilotIcon, zIndexOffset: 400 }
          )
            .addTo(map)
            .bindPopup(`<strong>Pilot: ${drone.name}</strong>`);
          pilotMarkersRef.current.set(drone.id, pilotMarker);
        }
      } else {
        const pm = pilotMarkersRef.current.get(drone.id);
        if (pm) {
          pm.remove();
          pilotMarkersRef.current.delete(drone.id);
        }
      }
    });
  }, [drones, selectedDrone, onDroneClick, navigate]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
    />
  );
}
