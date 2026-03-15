import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { useIsMobile } from '../useIsMobile';

// ─── Subsection Metadata (for search + mini-TOC) ───────

interface SubMeta { id: string; title: string }

const SECTION_SUBS: Record<string, SubMeta[]> = {
  overview: [
    { id: 'funktionsumfang', title: 'Funktionsumfang' },
    { id: 'systemarchitektur', title: 'Systemarchitektur' },
  ],
  login: [
    { id: 'login-vorgang', title: 'Login-Vorgang' },
    { id: 'rollen-system', title: 'Rollen-System' },
    { id: 'abmelden', title: 'Abmelden' },
  ],
  map: [
    { id: 'kopfleiste', title: 'Kopfleiste (Steuerungsleiste)' },
    { id: 'drohnen-marker', title: 'Drohnen-Marker' },
    { id: 'status-panel', title: 'Status-Panel' },
    { id: 'karten-interaktion', title: 'Karten-Interaktion' },
  ],
  drones: [
    { id: 'sektionen', title: 'Sektionen' },
    { id: 'status-indikatoren', title: 'Status-Indikatoren' },
  ],
  flightzones: [
    { id: 'zonen-panel', title: 'Zonen-Panel öffnen' },
    { id: 'zone-erstellen', title: 'Zone erstellen' },
    { id: 'zone-bearbeiten', title: 'Zone bearbeiten' },
    { id: 'drohnen-zuweisung', title: 'Drohnen-Zuweisung' },
  ],
  nfz: [
    { id: 'nfz-panel', title: 'NFZ-Panel öffnen' },
    { id: 'kategorien', title: 'Kategorien' },
    { id: 'bedienung', title: 'Bedienung' },
    { id: 'nfz-pruefung', title: 'NFZ-Prüfung im Status-Panel' },
  ],
  violations: [
    { id: 'verstoss-tabelle', title: 'Verstoß-Tabelle' },
    { id: 'alarmton', title: 'Alarmton' },
  ],
  reports: [
    { id: 'bericht-erstellen', title: 'Bericht erstellen' },
    { id: 'bericht-ansicht', title: 'Bericht-Ansicht' },
    { id: 'export', title: 'Export' },
  ],
  settings: [
    { id: 'erscheinungsbild', title: 'Erscheinungsbild' },
    { id: 'verstoss-alarmton', title: 'Verstoß-Alarmton' },
    { id: 'datenquellen', title: 'Datenquellen' },
  ],
  admin: [
    { id: 'dashboard', title: 'Dashboard' },
    { id: 'mandanten-verwaltung', title: 'Mandanten-Verwaltung (nur Super-Admin)' },
    { id: 'benutzer-verwaltung', title: 'Benutzer-Verwaltung' },
    { id: 'erweiterte-tooltips', title: 'Erweiterte Tooltips' },
  ],
  receivers: [
    { id: 'statistik-leiste', title: 'Statistik-Leiste' },
    { id: 'empfaenger-erstellen', title: 'Empfänger erstellen' },
    { id: 'empfaenger-tabelle', title: 'Empfänger-Tabelle' },
    { id: 'standort-setzen', title: 'Standort setzen' },
    { id: 'connection-log', title: 'Connection Log (Kommunikationsprotokoll)' },
    { id: 'live-build-terminal', title: 'Live Build Terminal' },
    { id: 'telemetrie-daten', title: 'Telemetrie-Daten' },
    { id: 'firmware-versionierung', title: 'Firmware-Versionierung' },
    { id: 'auto-refresh', title: 'Auto-Refresh' },
  ],
  simulation: [
    { id: 'simulator-erstellen', title: 'Simulator erstellen' },
    { id: 'funktionsweise', title: 'Funktionsweise' },
    { id: 'voraussetzung', title: 'Voraussetzung' },
    { id: 'wichtig', title: 'Wichtig' },
  ],
  hardware: [
    { id: 'voraussetzungen', title: 'Voraussetzungen' },
    { id: 'schritt-1', title: 'Schritt 1: Empfänger in FlightArc erstellen' },
    { id: 'schritt-2', title: 'Schritt 2: Flash-Wizard starten' },
    { id: 'schritt-3', title: 'Schritt 3: Firmware auf ESP flashen' },
    { id: 'schritt-4', title: 'Schritt 4: Erstinbetriebnahme' },
    { id: 'antenne', title: 'Antenne anschließen (ESP32-S3 mit IPEX)' },
    { id: 'led-anzeige', title: 'LED-Anzeige' },
    { id: 'problembehandlung', title: 'Problembehandlung' },
    { id: 'hardware-vergleich', title: 'Vergleich der Hardware-Typen' },
    { id: 'einkaufslisten', title: 'Einkaufslisten' },
  ],
  ota: [
    { id: 'ota-updates', title: 'OTA-Updates (Over-the-Air)' },
    { id: 'build-versionierung', title: 'Build-Versionierung' },
    { id: 'merged-binary', title: 'Merged Binary (Full-Flash)' },
    { id: 'vergleich', title: 'Vergleich: App-Firmware vs. Merged Binary vs. OTA' },
  ],
  tips: [
    { id: 'performance', title: 'Performance' },
    { id: 'empfaenger-platzierung', title: 'Empfänger-Platzierung' },
    { id: 'tastenkuerzel', title: 'Tastenkürzel' },
    { id: 'browser-empfehlung', title: 'Browser-Empfehlung' },
  ],
};

type Section =
  | 'overview' | 'login' | 'map' | 'drones' | 'flightzones'
  | 'nfz' | 'violations' | 'reports' | 'settings' | 'admin'
  | 'receivers' | 'simulation' | 'hardware' | 'ota' | 'tips';

const SECTIONS: { id: Section; title: string; icon: string }[] = [
  { id: 'overview', title: 'Übersicht', icon: '📋' },
  { id: 'login', title: 'Anmeldung', icon: '🔑' },
  { id: 'map', title: 'Kartenansicht', icon: '🗺️' },
  { id: 'drones', title: 'Drohnen-Details', icon: '🛩️' },
  { id: 'flightzones', title: 'Flugzonen', icon: '📐' },
  { id: 'nfz', title: 'Flugverbotszonen', icon: '🚫' },
  { id: 'violations', title: 'Verstöße', icon: '⚠️' },
  { id: 'reports', title: 'Flugberichte', icon: '📄' },
  { id: 'settings', title: 'Einstellungen', icon: '⚙️' },
  { id: 'admin', title: 'Administration', icon: '👤' },
  { id: 'receivers', title: 'Empfänger-Verwaltung', icon: '📡' },
  { id: 'simulation', title: 'Simulation', icon: '🧪' },
  { id: 'hardware', title: 'Hardware-Inbetriebnahme', icon: '🔧' },
  { id: 'ota', title: 'OTA-Updates & Merged Binary', icon: '📲' },
  { id: 'tips', title: 'Tipps & Tricks', icon: '💡' },
];

// ─── SVG Diagram Components ─────────────────────────────

function AppLayoutDiagram() {
  return (
    <svg viewBox="0 0 700 340" style={{ width: '100%', maxWidth: 700, margin: '16px 0' }}>
      <defs>
        <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect x="2" y="2" width="696" height="336" rx="10" fill="#0f172a" stroke="#334155" strokeWidth="2" />
      {/* Header bar */}
      <rect x="10" y="10" width="680" height="44" rx="8" fill="url(#hdr)" stroke="#475569" />
      <text x="24" y="37" fill="#14b8a6" fontWeight="700" fontSize="15" fontFamily="monospace">FlightArc</text>
      <text x="110" y="37" fill="#64748b" fontSize="11" fontFamily="sans-serif">v1.5</text>
      <text x="150" y="37" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">12 Drohnen</text>
      {/* Refresh rate */}
      <rect x="240" y="18" width="70" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="254" y="37" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">↻ 2s</text>
      {/* Radius */}
      <rect x="320" y="18" width="80" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="334" y="37" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">⊕ 50km</text>
      {/* Altitude */}
      <rect x="410" y="18" width="70" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="420" y="37" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">↕ Alle</text>
      {/* Buttons */}
      <rect x="500" y="18" width="28" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="507" y="37" fill="#94a3b8" fontSize="12">🚫</text>
      <rect x="534" y="18" width="28" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="541" y="37" fill="#94a3b8" fontSize="12">📐</text>
      <rect x="568" y="18" width="28" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="575" y="37" fill="#94a3b8" fontSize="12">⚙️</text>
      {/* User area */}
      <rect x="610" y="18" width="72" height="28" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="618" y="37" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">Admin ×</text>
      {/* Map area */}
      <rect x="10" y="62" width="680" height="230" rx="8" fill="#1a2332" stroke="#334155" />
      <text x="300" y="180" fill="#334155" fontSize="16" fontFamily="sans-serif" textAnchor="middle">Karte (Leaflet.js)</text>
      {/* Drone markers */}
      <circle cx="200" cy="140" r="8" fill="#3b82f6" opacity="0.8" />
      <circle cx="350" cy="180" r="8" fill="#14b8a6" opacity="0.8" />
      <circle cx="480" cy="120" r="8" fill="#f59e0b" opacity="0.8" />
      <circle cx="550" cy="200" r="8" fill="#8b5cf6" opacity="0.8" />
      {/* Flight zone */}
      <circle cx="350" cy="180" r="50" fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="5,3" />
      {/* Status panel */}
      <rect x="495" y="70" width="185" height="140" rx="8" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5" />
      <text x="510" y="92" fill="#3b82f6" fontWeight="600" fontSize="11" fontFamily="sans-serif">Status-Panel</text>
      <text x="510" y="110" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">Quelle: Simulator</text>
      <text x="510" y="126" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">Höhe: 1250m</text>
      <text x="510" y="142" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">Speed: 45 km/h</text>
      <text x="510" y="158" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">Signal: -62 dBm</text>
      <text x="510" y="178" fill="#64748b" fontSize="9" fontFamily="sans-serif">▸ Details anzeigen</text>
      <text x="510" y="194" fill="#64748b" fontSize="9" fontFamily="sans-serif">▸ Tracking starten</text>
      {/* Violation table */}
      <rect x="10" y="296" width="680" height="36" rx="6" fill="#1e293b" stroke="#ef4444" strokeWidth="1" />
      <text x="24" y="318" fill="#ef4444" fontWeight="600" fontSize="11" fontFamily="sans-serif">⚠ Verstöße (3)</text>
      <text x="160" y="318" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">DRONE-A12 → Zone Alpha | DRONE-B07 → Zone Bravo</text>
      {/* Labels */}
      <line x1="110" y1="5" x2="110" y2="0" stroke="#475569" />
      <line x1="350" y1="60" x2="350" y2="55" stroke="#475569" />
    </svg>
  );
}

function RoleHierarchyDiagram() {
  return (
    <svg viewBox="0 0 500 200" style={{ width: '100%', maxWidth: 500, margin: '16px 0' }}>
      <rect x="2" y="2" width="496" height="196" rx="8" fill="#0f172a" stroke="#334155" />
      {/* Super Admin */}
      <rect x="170" y="16" width="160" height="40" rx="8" fill="#7c3aed" fillOpacity="0.2" stroke="#7c3aed" />
      <text x="250" y="41" fill="#a78bfa" fontWeight="600" fontSize="13" textAnchor="middle" fontFamily="sans-serif">Super-Admin</text>
      {/* Arrows */}
      <line x1="220" y1="56" x2="140" y2="80" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
      <line x1="280" y1="56" x2="360" y2="80" stroke="#475569" strokeWidth="1.5" />
      {/* Tenant Admin */}
      <rect x="50" y="80" width="170" height="40" rx="8" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" />
      <text x="135" y="105" fill="#60a5fa" fontWeight="600" fontSize="13" textAnchor="middle" fontFamily="sans-serif">Mandanten-Admin</text>
      <rect x="280" y="80" width="170" height="40" rx="8" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" />
      <text x="365" y="105" fill="#60a5fa" fontWeight="600" fontSize="13" textAnchor="middle" fontFamily="sans-serif">Mandanten-Admin</text>
      {/* Arrows */}
      <line x1="100" y1="120" x2="80" y2="148" stroke="#475569" strokeWidth="1.5" />
      <line x1="170" y1="120" x2="190" y2="148" stroke="#475569" strokeWidth="1.5" />
      <line x1="340" y1="120" x2="330" y2="148" stroke="#475569" strokeWidth="1.5" />
      <line x1="390" y1="120" x2="410" y2="148" stroke="#475569" strokeWidth="1.5" />
      {/* Users */}
      <rect x="30" y="148" width="100" height="34" rx="6" fill="#22c55e" fillOpacity="0.15" stroke="#22c55e" />
      <text x="80" y="170" fill="#4ade80" fontSize="12" textAnchor="middle" fontFamily="sans-serif">Benutzer</text>
      <rect x="145" y="148" width="100" height="34" rx="6" fill="#22c55e" fillOpacity="0.15" stroke="#22c55e" />
      <text x="195" y="170" fill="#4ade80" fontSize="12" textAnchor="middle" fontFamily="sans-serif">Benutzer</text>
      <rect x="280" y="148" width="100" height="34" rx="6" fill="#22c55e" fillOpacity="0.15" stroke="#22c55e" />
      <text x="330" y="170" fill="#4ade80" fontSize="12" textAnchor="middle" fontFamily="sans-serif">Benutzer</text>
      <rect x="395" y="148" width="100" height="34" rx="6" fill="#22c55e" fillOpacity="0.15" stroke="#22c55e" />
      <text x="445" y="170" fill="#4ade80" fontSize="12" textAnchor="middle" fontFamily="sans-serif">Benutzer</text>
      {/* Tenant labels */}
      <text x="135" y="192" fill="#475569" fontSize="10" textAnchor="middle" fontFamily="sans-serif">─ Mandant A ─</text>
      <text x="365" y="192" fill="#475569" fontSize="10" textAnchor="middle" fontFamily="sans-serif">─ Mandant B ─</text>
    </svg>
  );
}

function NetworkArchDiagram() {
  return (
    <svg viewBox="0 0 660 280" style={{ width: '100%', maxWidth: 660, margin: '16px 0' }}>
      <rect x="2" y="2" width="656" height="276" rx="8" fill="#0f172a" stroke="#334155" />
      {/* ESP Nodes */}
      <rect x="20" y="20" width="120" height="60" rx="8" fill="#14b8a6" fillOpacity="0.15" stroke="#14b8a6" />
      <text x="80" y="45" fill="#14b8a6" fontWeight="600" fontSize="11" textAnchor="middle" fontFamily="sans-serif">ESP32-S3</text>
      <text x="80" y="62" fill="#5eead4" fontSize="9" textAnchor="middle" fontFamily="sans-serif">BLE + WiFi ODID</text>
      <rect x="20" y="95" width="120" height="60" rx="8" fill="#14b8a6" fillOpacity="0.15" stroke="#14b8a6" />
      <text x="80" y="120" fill="#14b8a6" fontWeight="600" fontSize="11" textAnchor="middle" fontFamily="sans-serif">ESP32-C3</text>
      <text x="80" y="137" fill="#5eead4" fontSize="9" textAnchor="middle" fontFamily="sans-serif">BLE + WiFi ODID</text>
      <rect x="20" y="170" width="120" height="60" rx="8" fill="#eab308" fillOpacity="0.15" stroke="#eab308" />
      <text x="80" y="195" fill="#eab308" fontWeight="600" fontSize="11" textAnchor="middle" fontFamily="sans-serif">ESP8266</text>
      <text x="80" y="212" fill="#fde047" fontSize="9" textAnchor="middle" fontFamily="sans-serif">Nur WiFi (Light)</text>
      {/* Arrows to backend */}
      <line x1="140" y1="50" x2="230" y2="130" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="4,3" />
      <line x1="140" y1="125" x2="230" y2="130" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="4,3" />
      <line x1="140" y1="200" x2="230" y2="140" stroke="#eab308" strokeWidth="1.5" strokeDasharray="4,3" />
      <text x="180" y="92" fill="#475569" fontSize="9" fontFamily="sans-serif" transform="rotate(-25,180,92)">HTTP/HTTPS</text>
      {/* Backend */}
      <rect x="230" y="90" width="180" height="100" rx="10" fill="#3b82f6" fillOpacity="0.12" stroke="#3b82f6" strokeWidth="2" />
      <text x="320" y="118" fill="#60a5fa" fontWeight="700" fontSize="13" textAnchor="middle" fontFamily="sans-serif">FlightArc Backend</text>
      <text x="320" y="138" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Flask API (Port 3020)</text>
      <text x="320" y="155" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">ReceiverProvider</text>
      <text x="320" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">SQLite + In-Memory</text>
      {/* External sources */}
      <rect x="230" y="210" width="180" height="50" rx="8" fill="#f59e0b" fillOpacity="0.1" stroke="#f59e0b" />
      <text x="320" y="232" fill="#f59e0b" fontSize="10" textAnchor="middle" fontFamily="sans-serif">OpenSky / ADS-B.fi / OGN</text>
      <text x="320" y="248" fill="#fbbf24" fontSize="9" textAnchor="middle" fontFamily="sans-serif">Externe Datenquellen</text>
      <line x1="320" y1="210" x2="320" y2="190" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />
      {/* Arrow to frontend */}
      <line x1="410" y1="140" x2="470" y2="140" stroke="#60a5fa" strokeWidth="2" />
      <text x="440" y="132" fill="#475569" fontSize="9" fontFamily="sans-serif">REST API</text>
      {/* Frontend */}
      <rect x="470" y="70" width="170" height="140" rx="10" fill="#22c55e" fillOpacity="0.1" stroke="#22c55e" strokeWidth="2" />
      <text x="555" y="98" fill="#4ade80" fontWeight="700" fontSize="13" textAnchor="middle" fontFamily="sans-serif">Frontend (React)</text>
      <text x="555" y="118" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Leaflet.js Karte</text>
      <text x="555" y="135" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Echtzeit-Updates</text>
      <text x="555" y="152" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Admin-Panel</text>
      <text x="555" y="169" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Flugberichte</text>
      <text x="555" y="186" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Flash-Wizard</text>
      {/* Browser */}
      <rect x="480" y="230" width="150" height="36" rx="6" fill="#6366f1" fillOpacity="0.1" stroke="#6366f1" />
      <text x="555" y="253" fill="#818cf8" fontSize="11" textAnchor="middle" fontFamily="sans-serif">Browser (Chrome/Edge)</text>
      <line x1="555" y1="230" x2="555" y2="210" stroke="#6366f1" strokeWidth="1.5" />
      {/* Drone symbol */}
      <rect x="20" y="245" width="120" height="28" rx="6" fill="#334155" />
      <text x="80" y="264" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Drohnen (ODID-Beacon)</text>
      <line x1="80" y1="245" x2="80" y2="230" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
    </svg>
  );
}

function EspSetupDiagram() {
  return (
    <svg viewBox="0 0 600 220" style={{ width: '100%', maxWidth: 600, margin: '16px 0' }}>
      <rect x="2" y="2" width="596" height="216" rx="8" fill="#0f172a" stroke="#334155" />
      {/* Step 1 */}
      <rect x="20" y="20" width="120" height="80" rx="8" fill="#3b82f6" fillOpacity="0.15" stroke="#3b82f6" />
      <text x="80" y="44" fill="#60a5fa" fontWeight="700" fontSize="24" textAnchor="middle">1</text>
      <text x="80" y="64" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Empfänger</text>
      <text x="80" y="78" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">erstellen</text>
      <text x="80" y="92" fill="#60a5fa" fontSize="9" textAnchor="middle" fontFamily="sans-serif">(Admin-UI)</text>
      {/* Arrow */}
      <text x="155" y="60" fill="#475569" fontSize="20">→</text>
      {/* Step 2 */}
      <rect x="175" y="20" width="120" height="80" rx="8" fill="#14b8a6" fillOpacity="0.15" stroke="#14b8a6" />
      <text x="235" y="44" fill="#14b8a6" fontWeight="700" fontSize="24" textAnchor="middle">2</text>
      <text x="235" y="64" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Flash-Wizard</text>
      <text x="235" y="78" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">starten</text>
      <text x="235" y="92" fill="#14b8a6" fontSize="9" textAnchor="middle" fontFamily="sans-serif">(Firmware bauen)</text>
      {/* Arrow */}
      <text x="310" y="60" fill="#475569" fontSize="20">→</text>
      {/* Step 3 */}
      <rect x="330" y="20" width="120" height="80" rx="8" fill="#f59e0b" fillOpacity="0.15" stroke="#f59e0b" />
      <text x="390" y="44" fill="#f59e0b" fontWeight="700" fontSize="24" textAnchor="middle">3</text>
      <text x="390" y="64" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Firmware</text>
      <text x="390" y="78" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">flashen</text>
      <text x="390" y="92" fill="#f59e0b" fontSize="9" textAnchor="middle" fontFamily="sans-serif">(esptool / USB)</text>
      {/* Arrow */}
      <text x="465" y="60" fill="#475569" fontSize="20">→</text>
      {/* Step 4 */}
      <rect x="485" y="20" width="100" height="80" rx="8" fill="#22c55e" fillOpacity="0.15" stroke="#22c55e" />
      <text x="535" y="44" fill="#22c55e" fontWeight="700" fontSize="24" textAnchor="middle">4</text>
      <text x="535" y="64" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Strom an</text>
      <text x="535" y="78" fill="#94a3b8" fontSize="10" textAnchor="middle" fontFamily="sans-serif">& fertig!</text>
      <text x="535" y="92" fill="#22c55e" fontSize="9" textAnchor="middle" fontFamily="sans-serif">(Auto-Connect)</text>
      {/* Detail box */}
      <rect x="20" y="115" width="565" height="90" rx="8" fill="#1e293b" stroke="#475569" />
      <text x="35" y="138" fill="#94a3b8" fontWeight="600" fontSize="11" fontFamily="sans-serif">Benötigt:</text>
      <text x="35" y="158" fill="#64748b" fontSize="11" fontFamily="sans-serif">• ESP32-S3/C3 oder ESP8266 Board mit USB-Anschluss</text>
      <text x="35" y="175" fill="#64748b" fontSize="11" fontFamily="sans-serif">• USB-Datenkabel (nicht nur Ladekabel!)</text>
      <text x="35" y="192" fill="#64748b" fontSize="11" fontFamily="sans-serif">• esptool.py installiert (pip install esptool) oder Chrome/Edge für Web Serial</text>
    </svg>
  );
}

function SourceColorLegend() {
  const sources = [
    { name: 'Simulator', color: '#3b82f6' },
    { name: 'OpenSky', color: '#f59e0b' },
    { name: 'ADS-B.fi', color: '#8b5cf6' },
    { name: 'ADS-B.lol', color: '#ec4899' },
    { name: 'OGN', color: '#10b981' },
    { name: 'Empfänger', color: '#14b8a6' },
  ];
  return (
    <svg viewBox="0 0 500 50" style={{ width: '100%', maxWidth: 500, margin: '12px 0' }}>
      <rect x="0" y="0" width="500" height="50" rx="8" fill="#1e293b" stroke="#334155" />
      {sources.map((s, i) => (
        <g key={s.name}>
          <circle cx={30 + i * 82} cy="25" r="6" fill={s.color} />
          <text x={42 + i * 82} y="30" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">{s.name}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Content Sections ────────────────────────────────────

function SectionOverview() {
  return (
    <div>
      <h2>Willkommen bei FlightArc</h2>
      <p>
        FlightArc ist eine webbasierte Echtzeit-Plattform zur Visualisierung und Überwachung von
        Drohnen und Luftfahrzeugen. Die Anwendung zeigt Live-Positionen auf einer interaktiven Karte
        und unterstützt Flugzonen-Management, Verstoß-Erkennung, Flugberichte und die Integration
        eigener Hardware-Empfänger.
      </p>
      <AppLayoutDiagram />
      <div id="funktionsumfang">
        <h3>Funktionsumfang</h3>
          <ul>
            <li><strong>Echtzeit-Karte</strong> — Live-Tracking aller erkannten Drohnen mit konfigurierbarer Aktualisierungsrate</li>
            <li><strong>Mehrere Datenquellen</strong> — Simulator, OpenSky, ADS-B.fi, ADS-B.lol, OGN und eigene Hardware-Empfänger</li>
            <li><strong>Flugzonen</strong> — Definiere Überwachungszonen und erkenne Verstöße automatisch</li>
            <li><strong>Flugverbotszonen (NFZ)</strong> — Offizielle DIPUL-Daten mit Flughäfen, Naturschutzgebieten, etc.</li>
            <li><strong>Flugberichte</strong> — Zeichne Flugverläufe auf und exportiere als HTML/PDF-Report</li>
            <li><strong>Multi-Mandanten</strong> — Isolierte Arbeitsbereiche für verschiedene Organisationen</li>
            <li><strong>Hardware-Empfänger</strong> — ESP32/ESP8266-Integration für echte Open Drone ID Erkennung</li>
          </ul>
          <SourceColorLegend />
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Jede Datenquelle hat eine eindeutige Farbe. Drohnen-Marker auf der Karte werden entsprechend ihrer Quelle eingefärbt.
          </p>
      </div>
      <div id="systemarchitektur">
        <h3>Systemarchitektur</h3>
          <NetworkArchDiagram />
      </div>
    </div>
  );
}

function SectionLogin() {
  return (
    <div>
      <h2>Anmeldung</h2>
      <p>
        FlightArc verwendet eine JWT-basierte Authentifizierung mit Mandanten-Isolation.
        Beim ersten Zugriff wirst du automatisch zur Login-Seite weitergeleitet.
      </p>
      <div id="login-vorgang">
        <h3>Login-Vorgang</h3>
          <ol>
            <li><strong>Mandant wählen</strong> — Wenn du mehreren Mandanten zugeordnet bist, wähle zuerst den gewünschten Mandanten aus der Dropdown-Liste. Der zuletzt gewählte Mandant wird gespeichert.</li>
            <li><strong>Benutzername eingeben</strong> — Dein zugewiesener Benutzername.</li>
            <li><strong>Passwort eingeben</strong> — Dein Passwort.</li>
            <li><strong>Anmelden klicken</strong> — Bei Erfolg wirst du zur Kartenansicht weitergeleitet.</li>
          </ol>
          <InfoBox type="info">
            Standard-Zugangsdaten nach der Installation: <code>admin</code> / <code>admin</code>.
            Ändere das Passwort nach dem ersten Login unter Administration → Benutzer.
          </InfoBox>
      </div>
      <div id="rollen-system">
        <h3>Rollen-System</h3>
          <RoleHierarchyDiagram />
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Rolle</th><th style={thStyle}>Berechtigungen</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Super-Admin</strong></td><td style={tdStyle}>Alle Rechte. Mandanten erstellen/löschen, alle Benutzer verwalten, alle Daten sehen.</td></tr>
              <tr><td style={tdStyle}><strong>Mandanten-Admin</strong></td><td style={tdStyle}>Benutzer im eigenen Mandanten verwalten, Datenquellen konfigurieren, Empfänger verwalten, Zonen erstellen.</td></tr>
              <tr><td style={tdStyle}><strong>Benutzer</strong></td><td style={tdStyle}>Karte ansehen, Drohnen verfolgen, Flugberichte erstellen. Keine Einstellungen ändern.</td></tr>
            </tbody>
          </table>
      </div>
      <div id="abmelden">
        <h3>Abmelden</h3>
          <p>
            Klicke auf <strong>Abmelden</strong> oben rechts in der Kopfleiste. Deine Sitzung wird beendet
            und du wirst zur Login-Seite weitergeleitet.
          </p>
      </div>
    </div>
  );
}

function SectionMap() {
  return (
    <div>
      <h2>Kartenansicht</h2>
      <p>
        Die Kartenansicht ist das Herzstück von FlightArc. Hier siehst du alle erkannten Drohnen und
        Luftfahrzeuge in Echtzeit auf einer interaktiven Karte.
      </p>
      <AppLayoutDiagram />
      <div id="kopfleiste">
        <h3>Kopfleiste (Steuerungsleiste)</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Element</th><th style={thStyle}>Funktion</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>FlightArc v1.5</strong></td><td style={tdStyle}>App-Name mit Version. Daneben die aktuelle Drohnen-Anzahl und Empfänger-Status.</td></tr>
              <tr><td style={tdStyle}><strong>↻ Aktualisierungsrate</strong></td><td style={tdStyle}>Wie oft die Karte aktualisiert wird. Optionen: 1s, 2s (Standard), 5s, 10s, 30s. Wird im Browser gespeichert.</td></tr>
              <tr><td style={tdStyle}><strong>⊕ Radius-Filter</strong></td><td style={tdStyle}>Begrenzt die Anzeige auf einen Umkreis um das Kartenzentrum. Optionen: 5–500 km oder Aus. Schalte den Filter mit dem ⊕-Button an/aus.</td></tr>
              <tr><td style={tdStyle}><strong>↕ Höhenfilter</strong></td><td style={tdStyle}>Filtert Drohnen nach Höhenzone: Alle, 0–100m, 100–500m, 500–2000m, &gt;2000m.</td></tr>
              <tr><td style={tdStyle}><strong>🚫 NFZ-Button</strong></td><td style={tdStyle}>Öffnet das Flugverbotszonen-Panel (DIPUL-Layer).</td></tr>
              <tr><td style={tdStyle}><strong>📐 Zonen-Button</strong></td><td style={tdStyle}>Öffnet das Flugzonen-Panel zur Verwaltung von Überwachungszonen.</td></tr>
              <tr><td style={tdStyle}><strong>📊 Tracking-Button</strong></td><td style={tdStyle}>Öffnet das Tracking-Panel mit aktiven Verfolgungen.</td></tr>
              <tr><td style={tdStyle}><strong>⚙ Einstellungen</strong></td><td style={tdStyle}>Navigiert zur Einstellungen-Seite.</td></tr>
              <tr><td style={tdStyle}><strong>? Hilfe</strong></td><td style={tdStyle}>Öffnet dieses Benutzerhandbuch.</td></tr>
            </tbody>
          </table>
      </div>
      <div id="drohnen-marker">
        <h3>Drohnen-Marker</h3>
          <p>
            Jede Drohne wird als farbiger Kreis auf der Karte dargestellt. Die Farbe zeigt die Datenquelle an:
          </p>
          <SourceColorLegend />
          <ul>
            <li><strong>Klick auf Marker</strong> — Öffnet das Status-Panel mit Live-Daten der Drohne.</li>
            <li><strong>Tracking-Linie</strong> — Aktiv verfolgte Drohnen zeigen eine Verbindungslinie zum Kartenzentrum.</li>
            <li><strong>Verstoß-Markierung</strong> — Drohnen in einer Flugzone blinken rot.</li>
          </ul>
      </div>
      <div id="status-panel">
        <h3>Status-Panel</h3>
          <p>
            Das Status-Panel öffnet sich rechts, wenn du auf einen Drohnen-Marker klickst. Es zeigt:
          </p>
          <ul>
            <li><strong>Quelle</strong> — Datenquelle mit farbiger Markierung</li>
            <li><strong>Höhe</strong> — GPS-Höhe, barometrische Höhe, geometrische Höhe und Bodenhöhe (GND)</li>
            <li><strong>Geschwindigkeit</strong> — Aktuelle Geschwindigkeit in km/h</li>
            <li><strong>Signal</strong> — Signalstärke in dBm (bei Empfänger-Drohnen)</li>
            <li><strong>Batterie</strong> — Batteriestand in % (wenn verfügbar)</li>
            <li><strong>Pilot-Position</strong> — GPS-Koordinaten des Piloten mit Reverse-Geocoding (Adresse)</li>
            <li><strong>Aktionen</strong> — Tracking starten/stoppen, Details anzeigen, NFZ prüfen</li>
          </ul>
      </div>
      <div id="karten-interaktion">
        <h3>Karten-Interaktion</h3>
          <ul>
            <li><strong>Scrollen</strong> — Zoom rein/raus</li>
            <li><strong>Ziehen</strong> — Karte verschieben</li>
            <li><strong>Rechtsklick</strong> — Koordinaten in Zwischenablage kopieren</li>
            <li><strong>Klick auf leere Fläche</strong> — Status-Panel schließen</li>
          </ul>
      </div>
    </div>
  );
}

function SectionDrones() {
  return (
    <div>
      <h2>Drohnen-Detailseite</h2>
      <p>
        Klicke im Status-Panel auf <strong>„Details anzeigen"</strong> um die ausführliche Detailseite
        einer Drohne zu öffnen.
      </p>
      <div id="sektionen">
        <h3>Sektionen</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Sektion</th><th style={thStyle}>Inhalt</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Live-Status</strong></td><td style={tdStyle}>Aktuelle Höhe, Geschwindigkeit, Heading, Signalstärke, Batterie, Quelle mit Farbe.</td></tr>
              <tr><td style={tdStyle}><strong>Position</strong></td><td style={tdStyle}>GPS-Koordinaten, Genauigkeit, Bodenhöhe. Pilot-Position mit Adresse (Geocoding).</td></tr>
              <tr><td style={tdStyle}><strong>FAA Registrierung</strong></td><td style={tdStyle}>Lookup in FAA, FlightRadar24, OpenSky Datenbanken. Zeigt Registrierungsinformationen wenn verfügbar.</td></tr>
              <tr><td style={tdStyle}><strong>Status-Historie</strong></td><td style={tdStyle}>Zeitleiste mit Statusänderungen (ACTIVE, IDLE, ERROR, LOST).</td></tr>
            </tbody>
          </table>
      </div>
      <div id="status-indikatoren">
        <h3>Status-Indikatoren</h3>
          <ul>
            <li><span style={{ color: '#22c55e' }}>●</span> <strong>ACTIVE</strong> — Drohne wird aktiv empfangen</li>
            <li><span style={{ color: '#f59e0b' }}>●</span> <strong>IDLE</strong> — Letzte Meldung vor &gt;30s</li>
            <li><span style={{ color: '#ef4444' }}>●</span> <strong>ERROR</strong> — Fehlerhafte Daten</li>
            <li><span style={{ color: '#6b7280' }}>●</span> <strong>LOST</strong> — Kein Signal seit &gt;120s</li>
          </ul>
          <p>Über den <strong>← Karte</strong>-Button kehrst du zur Kartenansicht zurück.</p>
      </div>
    </div>
  );
}

function SectionFlightZones() {
  return (
    <div>
      <h2>Flugzonen</h2>
      <p>
        Flugzonen sind benutzerdefinierte Überwachungsbereiche. Wenn eine Drohne in eine Zone einfliegt,
        wird automatisch ein Verstoß erkannt und in der Verstoß-Tabelle angezeigt.
      </p>
      <div id="zonen-panel">
        <h3>Zonen-Panel öffnen</h3>
          <p>Klicke auf den <strong>📐 Zonen-Button</strong> in der Kopfleiste.</p>
      </div>
      <div id="zone-erstellen">
        <h3>Zone erstellen</h3>
          <h4>Missions-Zone (schnell)</h4>
          <ol>
            <li>Klicke auf <strong>„+ Missions-Zone"</strong> im Zonen-Panel.</li>
            <li>Klicke auf die Karte, um das Zentrum zu setzen.</li>
            <li>Es wird ein Kreis mit 100m Radius erstellt.</li>
            <li>Der Name wird automatisch generiert (z.B. „Mission 001").</li>
            <li>Die Adresse wird per Reverse-Geocoding ermittelt.</li>
          </ol>
          <h4>Freiform-Zone</h4>
          <ol>
            <li>Klicke auf <strong>„+ Neue Zone"</strong> im Zonen-Panel.</li>
            <li>Gib einen Namen ein und wähle eine Farbe.</li>
            <li>Klicke auf die Karte, um Polygon-Punkte zu setzen.</li>
            <li>Definiere optional eine Mindest- und Maximalhöhe.</li>
            <li>Klicke auf <strong>„Speichern"</strong>.</li>
          </ol>
      </div>
      <div id="zone-bearbeiten">
        <h3>Zone bearbeiten</h3>
          <p>
            Klicke auf eine Zone in der Liste, um sie auszuwählen. Du kannst:
          </p>
          <ul>
            <li><strong>Name und Farbe ändern</strong></li>
            <li><strong>Höhengrenzen anpassen</strong></li>
            <li><strong>Drohnen zuweisen</strong> — Weise Drohnen der Zone zu, um nur diese zu überwachen</li>
            <li><strong>Zone löschen</strong></li>
          </ul>
      </div>
      <div id="drohnen-zuweisung">
        <h3>Drohnen-Zuweisung</h3>
          <p>
            Im Zuweisungs-Dialog kannst du Drohnen einer Zone zuordnen. Nur zugewiesene Drohnen erzeugen
            dann Verstöße in dieser Zone. Ohne Zuweisung werden alle Drohnen überwacht.
          </p>
      </div>
    </div>
  );
}

function SectionNFZ() {
  return (
    <div>
      <h2>Flugverbotszonen (NFZ)</h2>
      <p>
        FlightArc kann offizielle Flugverbotszonen aus dem DIPUL-WMS-Dienst (Deutsche Informationsplattform
        für unbemannte Luftfahrt) direkt auf der Karte anzeigen.
      </p>
      <div id="nfz-panel">
        <h3>NFZ-Panel öffnen</h3>
          <p>Klicke auf den <strong>🚫 NFZ-Button</strong> in der Kopfleiste.</p>
      </div>
      <div id="kategorien">
        <h3>Kategorien</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Kategorie</th><th style={thStyle}>Layer</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Luftfahrt</strong></td><td style={tdStyle}>Flughäfen, Kontrollzonen, Flugplätze, Hubschrauberlandeplätze, Segelfluggelände</td></tr>
              <tr><td style={tdStyle}><strong>Natur</strong></td><td style={tdStyle}>Naturschutzgebiete, Nationalparks, Vogelschutzgebiete, FFH-Gebiete</td></tr>
              <tr><td style={tdStyle}><strong>Infrastruktur</strong></td><td style={tdStyle}>Industrieanlagen, Kraftwerke, Gefängnisse, Krankenhäuser, Bundesfernstraßen</td></tr>
              <tr><td style={tdStyle}><strong>Sensibel</strong></td><td style={tdStyle}>Botschaften, Polizei/Bundespolizei, Verfassungsorgane, Militär, Behörden</td></tr>
              <tr><td style={tdStyle}><strong>Temporär</strong></td><td style={tdStyle}>NOTAM (temporäre Flugbeschränkungen), ED-R Gebiete</td></tr>
            </tbody>
          </table>
      </div>
      <div id="bedienung">
        <h3>Bedienung</h3>
          <ul>
            <li><strong>Checkbox pro Layer</strong> — Einzelne Layer ein-/ausblenden</li>
            <li><strong>Alle ein/aus</strong> — Schnell alle Layer aktivieren oder deaktivieren</li>
            <li><strong>Hover über Zone</strong> — Tooltip mit Zone-Name</li>
            <li><strong>Klick auf Zone</strong> — Popup mit Details (Name, Typ, Höhe, Beschreibung)</li>
          </ul>
          <InfoBox type="info">
            NFZ-Daten werden vom DIPUL-WMS-Server geladen. Bei langsamer Verbindung kann das Laden einige
            Sekunden dauern. Die Daten stammen von DFS, BKG und anderen amtlichen Stellen.
          </InfoBox>
      </div>
      <div id="nfz-pruefung">
        <h3>NFZ-Prüfung im Status-Panel</h3>
          <p>
            Im Status-Panel einer Drohne kannst du <strong>„NFZ prüfen"</strong> klicken, um zu prüfen,
            ob die aktuelle Position in einer Flugverbotszone liegt.
          </p>
      </div>
    </div>
  );
}

function SectionViolations() {
  return (
    <div>
      <h2>Verstöße</h2>
      <p>
        Wenn eine Drohne in eine definierte Flugzone einfliegt, wird automatisch ein Verstoß erkannt
        und in der Verstoß-Tabelle am unteren Bildschirmrand angezeigt.
      </p>
      <div id="verstoss-tabelle">
        <h3>Verstoß-Tabelle</h3>
          <p>
            Die Tabelle zeigt sich als zusammenklappbare Leiste am unteren Bildschirmrand. Klicke auf
            die Leiste, um sie zu erweitern.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Spalte</th><th style={thStyle}>Beschreibung</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Drohne</strong></td><td style={tdStyle}>Basic-ID der Drohne</td></tr>
              <tr><td style={tdStyle}><strong>Zone</strong></td><td style={tdStyle}>Name der verletzten Zone</td></tr>
              <tr><td style={tdStyle}><strong>Eintritt</strong></td><td style={tdStyle}>Zeitpunkt des Eintritts in die Zone</td></tr>
              <tr><td style={tdStyle}><strong>Status</strong></td><td style={tdStyle}>Aktiv (rot) oder Beendet (grau)</td></tr>
              <tr><td style={tdStyle}><strong>Trail</strong></td><td style={tdStyle}>Toggle: Flugweg auf der Karte anzeigen</td></tr>
              <tr><td style={tdStyle}><strong>Bericht</strong></td><td style={tdStyle}>Flugbericht für diesen Verstoß erstellen</td></tr>
            </tbody>
          </table>
      </div>
      <div id="alarmton">
        <h3>Alarmton</h3>
          <p>
            Bei neuen Verstößen wird ein Alarmton abgespielt. Dieser kann in den Einstellungen
            unter <strong>„Verstoß-Alarmton"</strong> deaktiviert werden.
          </p>
      </div>
    </div>
  );
}

function SectionReports() {
  return (
    <div>
      <h2>Flugberichte</h2>
      <p>
        Flugberichte dokumentieren einen Flugverlauf mit Karte, Trail-Daten, Zeitlinie und können
        als HTML-Dokument exportiert werden.
      </p>
      <div id="bericht-erstellen">
        <h3>Bericht erstellen</h3>
          <ol>
            <li>Klicke in der Verstoß-Tabelle auf das <strong>Bericht-Symbol</strong> neben einem Verstoß.</li>
            <li>Der Bericht wird automatisch generiert und in einer neuen Ansicht geöffnet.</li>
          </ol>
      </div>
      <div id="bericht-ansicht">
        <h3>Bericht-Ansicht</h3>
          <ul>
            <li><strong>Karte</strong> — Zeigt Zone, Flugweg (Trail), Drohnen-Position und Pilot-Position</li>
            <li><strong>Layer-Toggles</strong> — Blende einzelne Elemente ein/aus (Zone, Trail, Marker, Statistiken, NFZ)</li>
            <li><strong>Zeitlinie</strong> — Schieberegler zum Abspielen des Flugverlaufs. Geschwindigkeit: 0.5x–10x</li>
            <li><strong>Messpunkte-Tabelle</strong> — Alle aufgezeichneten Positionen mit Timestamp, Höhe, Geschwindigkeit</li>
            <li><strong>Kommentar</strong> — Freitextfeld für Notizen zum Vorfall</li>
          </ul>
      </div>
      <div id="export">
        <h3>Export</h3>
          <p>
            Klicke auf <strong>„HTML-Report erstellen"</strong> um den Bericht als eigenständiges HTML-Dokument
            herunterzuladen. Dieses kann direkt im Browser geöffnet oder als PDF gedruckt werden.
          </p>
      </div>
    </div>
  );
}

function SectionSettings() {
  return (
    <div>
      <h2>Einstellungen</h2>
      <p>
        Die Einstellungen erreichst du über das <strong>⚙-Symbol</strong> in der Kopfleiste.
      </p>
      <div id="erscheinungsbild">
        <h3>Erscheinungsbild</h3>
          <p>
            Wechsle zwischen <strong>Dunklem Modus</strong> (Standard) und <strong>Hellem Modus</strong>.
            Die Karte passt sich automatisch an.
          </p>
      </div>
      <div id="verstoss-alarmton">
        <h3>Verstoß-Alarmton</h3>
          <p>
            Aktiviert/deaktiviert den Alarmton bei Zonenverstößen. Standardmäßig aktiviert.
          </p>
      </div>
      <div id="datenquellen">
        <h3>Datenquellen</h3>
          <p>
            Hier aktivierst oder deaktivierst du die verschiedenen Datenquellen. Jede Quelle hat einen Farbindikator:
          </p>
          <SourceColorLegend />
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Quelle</th><th style={thStyle}>Beschreibung</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Simulator</strong></td><td style={tdStyle}>Eingebauter Drohnen-Simulator für Demos und Tests. Mit Neustart-Button.</td></tr>
              <tr><td style={tdStyle}><strong>OpenSky</strong></td><td style={tdStyle}>Echte ADS-B Flugdaten aus dem OpenSky Network (Flugzeuge, Hubschrauber)</td></tr>
              <tr><td style={tdStyle}><strong>ADS-B.fi</strong></td><td style={tdStyle}>Finnisches ADS-B Netzwerk mit weltweiter Abdeckung</td></tr>
              <tr><td style={tdStyle}><strong>ADS-B.lol</strong></td><td style={tdStyle}>Community-basiertes ADS-B Netzwerk</td></tr>
              <tr><td style={tdStyle}><strong>OGN</strong></td><td style={tdStyle}>Open Glider Network — Segelflugzeuge, Gleitschirme, Ballons</td></tr>
              <tr><td style={tdStyle}><strong>Empfänger</strong></td><td style={tdStyle}>Eigene ESP32/ESP8266 Hardware-Empfänger für Open Drone ID</td></tr>
            </tbody>
          </table>
          <InfoBox type="warning">
            Nur Mandanten-Admins können Datenquellen ändern und speichern. Normale Benutzer sehen die
            Einstellungen nur im Lesemodus.
          </InfoBox>
      </div>
    </div>
  );
}

function SectionAdmin() {
  return (
    <div>
      <h2>Administration</h2>
      <p>
        Der Admin-Bereich ist über das <strong>⚙️-Symbol</strong> neben dem Benutzernamen erreichbar
        (nur für Mandanten-Admins und Super-Admins).
      </p>
      <div id="dashboard">
        <h3>Dashboard</h3>
          <p>
            Übersicht mit Statistik-Karten: Mandanten-Anzahl (Super-Admin), Benutzer-Anzahl, aktuelle Rolle
            und Empfänger Online/Gesamt.
          </p>
      </div>
      <div id="mandanten-verwaltung">
        <h3>Mandanten-Verwaltung (nur Super-Admin)</h3>
          <ul>
            <li><strong>Mandant erstellen</strong> — Name und Anzeigename eingeben</li>
            <li><strong>Mandant deaktivieren/löschen</strong> — Deaktivierte Mandanten können sich nicht anmelden</li>
            <li><strong>Standard-Mandant</strong> — Kann nicht gelöscht werden</li>
          </ul>
      </div>
      <div id="benutzer-verwaltung">
        <h3>Benutzer-Verwaltung</h3>
          <ul>
            <li><strong>Benutzer erstellen</strong> — Benutzername, Anzeigename, Passwort, Rolle, Mandant</li>
            <li><strong>Rollen zuweisen</strong> — Super-Admin, Mandanten-Admin, Benutzer</li>
            <li><strong>Passwort zurücksetzen</strong> — Neues Passwort für einen Benutzer setzen</li>
            <li><strong>Benutzer löschen</strong> — Super-Admin Account kann nicht gelöscht werden</li>
          </ul>
          <InfoBox type="info">
            Mandanten-Admins sehen nur Benutzer ihres eigenen Mandanten. Super-Admins können zwischen
            Mandanten wechseln über den Mandanten-Switcher in der Sidebar.
          </InfoBox>
      </div>
      <div id="erweiterte-tooltips">
        <h3>Erweiterte Tooltips</h3>
          <p>
            Alle Buttons im Admin-Bereich haben <strong>zweistufige Tooltips</strong>:
          </p>
          <ul>
            <li><strong>Kurz-Tooltip (~0,3s)</strong> — Zeigt eine kurze Beschreibung der Aktion und den Hinweis „Hover halten für Details..."</li>
            <li><strong>Detail-Tooltip (~2s)</strong> — Zeigt eine ausführliche Erklärung mit Voraussetzungen, Auswirkungen und Tipps</li>
          </ul>
          <p>
            Besonders hilfreich bei den verschiedenen Firmware-Optionen der Empfänger (App-Firmware vs. Full-Flash vs. OTA),
            um den Unterschied zwischen den Download-/Flash-Arten zu verstehen.
          </p>
      </div>
    </div>
  );
}

function SectionReceivers() {
  return (
    <div>
      <h2>Empfänger-Verwaltung</h2>
      <p>
        Unter <strong>Administration → Empfänger</strong> verwaltest du deine Hardware-Empfänger
        (ESP32-S3, ESP32-C3, ESP8266).
      </p>
      <details className="help-sub" id="statistik-leiste" open>
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Statistik-Leiste</summary>
        <div style={subContentStyle}>
          <p>Am oberen Rand siehst du fünf Kennzahlen:</p>
          <ul>
            <li><strong>Gesamt</strong> — Anzahl registrierter Empfänger</li>
            <li><span style={{ color: '#22c55e' }}>●</span> <strong>Online</strong> — Letzter Heartbeat &lt;90 Sekunden</li>
            <li><span style={{ color: '#eab308' }}>●</span> <strong>Verzögert</strong> — Letzter Heartbeat 90–300 Sekunden</li>
            <li><span style={{ color: '#6b7280' }}>●</span> <strong>Offline</strong> — Kein Heartbeat seit &gt;300 Sekunden</li>
            <li><span style={{ color: '#14b8a6' }}>●</span> <strong>Erkennungen</strong> — Gesamtzahl aller Drohnen-Erkennungen</li>
          </ul>
        </div>
      </details>
      <details className="help-sub" id="empfaenger-erstellen">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Empfänger erstellen</summary>
        <div style={subContentStyle}>
          <ol>
            <li>Klicke auf <strong>„+ Neuer Empfänger"</strong></li>
            <li>Gib einen Namen ein (z.B. „Empfänger Dach-Nord")</li>
            <li>Wähle den Hardware-Typ:
              <ul>
                <li><strong>ESP32-S3</strong> — BLE + WiFi ODID, HTTPS-fähig (empfohlen)</li>
                <li><strong>ESP32-C3</strong> — BLE + WiFi ODID, HTTPS-fähig, kompakter</li>
                <li><strong>ESP8266</strong> — Nur WiFi-Beacon ODID, kein BLE, kein HTTPS (Light)</li>
              </ul>
            </li>
            <li>Klicke auf <strong>„Erstellen"</strong></li>
          </ol>
          <InfoBox type="warning">
            Nach dem Erstellen wird der <strong>API-Key</strong> einmalig angezeigt. Kopiere ihn sofort!
            Er wird nie wieder angezeigt (außer bei Regeneration).
          </InfoBox>
        </div>
      </details>
      <details className="help-sub" id="empfaenger-tabelle">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Empfänger-Tabelle</summary>
        <div style={subContentStyle}>
          <p>
            Die Tabelle zeigt alle Empfänger mit Status-Indikator, Name, Hardware-Typ, letztem Kontakt und Erkennungen.
          </p>
          <ul>
            <li><strong>Klick auf Zeile</strong> — Erweitert die Detailansicht mit ID, Firmware-Version, IP, WiFi (SSID + dBm + Kanal), Heap, Uptime, Standort, Boot-Erkennungen</li>
            <li><strong>Firmware-Build Info</strong> — Zeigt Datum, Größe, SHA-256 und Version (1.0.XXXXX) des letzten Builds</li>
            <li><strong>„App-Firmware" herunterladen</strong> — Lädt die gespeicherte Firmware erneut herunter (kein Rebuild nötig)</li>
            <li><strong>„Full-Flash (Merged)" herunterladen</strong> — Lädt das Merged Binary herunter (Bootloader + Partitions + Firmware in einer Datei, nur ESP32). Siehe Abschnitt <em>OTA-Updates & Merged Binary</em>.</li>
            <li><strong>„OTA Update senden"</strong> — Sendet ein Over-the-Air Update an den Empfänger (nur ESP32-S3/C3, nicht ESP8266). Das Update wird beim nächsten Heartbeat übermittelt. Siehe Abschnitt <em>OTA-Updates & Merged Binary</em>.</li>
            <li><strong>„Neu bauen (neuer Key)"</strong> — Baut Firmware komplett neu mit frischem API-Key (alter Key wird ungültig, alter ESP muss neu geflasht werden)</li>
            <li><strong>„Kommunikations-Log"</strong> — Zeigt Log-Einträge nur für diesen Empfänger (muss zuerst aktiviert werden)</li>
            <li><strong>„Deakt."</strong> — Deaktiviert den Empfänger (kann sich nicht mehr authentifizieren)</li>
            <li><strong>„Löschen"</strong> — Entfernt den Empfänger dauerhaft inkl. gespeicherter Firmware</li>
          </ul>
        </div>
      </details>
      <details className="help-sub" id="standort-setzen">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Standort setzen</summary>
        <div style={subContentStyle}>
          <p>
            In der Detail-Ansicht eines Empfängers findest du den Button <strong>„Standort setzen"</strong>.
            Damit kannst du die GPS-Position des Empfängers direkt über dein Smartphone oder Laptop festlegen:
          </p>
          <ol>
            <li>Klappe den gewünschten Empfänger in der Tabelle auf</li>
            <li>Klicke auf <strong>„Standort setzen"</strong></li>
            <li>Dein Browser fragt nach der Berechtigung für den Standortzugriff — erlaube den Zugriff</li>
            <li>Die GPS-Koordinaten und die Genauigkeit werden vom Browser (Geolocation API) ermittelt und am Empfänger gespeichert</li>
          </ol>
          <InfoBox type="info">
            Am besten setzt du den Standort direkt vor Ort am Aufstellungsort des Empfängers mit deinem Smartphone.
            Die Genauigkeit hängt vom GPS deines Geräts ab und wird in Metern angezeigt.
          </InfoBox>
        </div>
      </details>
      <details className="help-sub" id="connection-log">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Connection Log (Kommunikationsprotokoll)</summary>
        <div style={subContentStyle}>
          <p>
            Das Connection Log zeichnet alle Kommunikation zwischen den Hardware-Empfängern und dem Backend auf.
            Es muss zuerst über den <strong>„Log aus"</strong>-Button aktiviert werden.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Eintrag</th><th style={thStyle}>Farbe</th><th style={thStyle}>Beschreibung</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>Ingest</td><td style={tdStyle}>Grün</td><td style={tdStyle}>Drohnen-Erkennungen empfangen (Anzahl, Quell-IP)</td></tr>
              <tr><td style={tdStyle}>Heartbeat</td><td style={tdStyle}>Blau</td><td style={tdStyle}>Status-Update mit WiFi (SSID, dBm, Kanal), Heap, Firmware, Uptime, Hotspot-Status, Fehlerstatistik</td></tr>
              <tr><td style={tdStyle}>Auth-Fehler</td><td style={tdStyle}>Rot</td><td style={tdStyle}>Ungültiger API-Key, fehlender Header, deaktivierter Empfänger</td></tr>
            </tbody>
          </table>
          <p>
            <strong>Filter:</strong> Über das Dropdown kann das Log auf einen bestimmten Empfänger gefiltert werden.
            Alternativ: In der Detail-Ansicht eines Empfängers auf <strong>„Kommunikations-Log"</strong> klicken.
          </p>
        </div>
      </details>
      <details className="help-sub" id="live-build-terminal">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Live Build Terminal</summary>
        <div style={subContentStyle}>
          <p>
            Beim Bauen einer Firmware zeigt der Flash-Wizard ein <strong>Live-Terminal</strong> mit dem
            Compiler-Output in Echtzeit. Danach folgt eine <strong>11-Punkt Verifizierungs-Checkliste</strong> die
            Magic Byte, Flash-Modus (DIO/QIO), Flash-Größe, Segmente, SHA-256, Bootloader und Partitionstabelle prüft.
          </p>
        </div>
      </details>
      <details className="help-sub" id="telemetrie-daten">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Telemetrie-Daten</summary>
        <div style={subContentStyle}>
          <p>Jeder Empfänger sendet regelmäßig folgende Daten ans Backend:</p>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Feld</th><th style={thStyle}>Intervall</th><th style={thStyle}>Beschreibung</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>Heartbeat</td><td style={tdStyle}>30s</td><td style={tdStyle}>Firmware-Version, Hardware-Typ, WiFi (SSID/dBm/Kanal), Heap, Uptime, Erkennungen seit Boot, AP-Status, Fehlerstatistik, GPS</td></tr>
              <tr><td style={tdStyle}>Ingest</td><td style={tdStyle}>2s</td><td style={tdStyle}>Drohnen-Erkennungen mit ID, Position, Höhe, Speed, Heading, Pilot-Position, Operator-ID, ID-Typ, Quelle (BLE/WiFi/NAN)</td></tr>
            </tbody>
          </table>
        </div>
      </details>
      <details className="help-sub" id="firmware-versionierung">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Firmware-Versionierung</summary>
        <div style={subContentStyle}>
          <p>
            Jeder Firmware-Build erhält eine eindeutige Version (<code>1.0.XXXXX</code>), die in der Empfänger-Detailansicht
            unter „Firmware" sichtbar ist. Die Version wird vom ESP bei jedem Heartbeat an das Backend gemeldet und dient
            der Erkennung erfolgreicher OTA-Updates. Details siehe Abschnitt <em>OTA-Updates & Merged Binary</em>.
          </p>
        </div>
      </details>
      <details className="help-sub" id="auto-refresh">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Auto-Refresh</summary>
        <div style={subContentStyle}>
          <p>Die Empfänger-Liste aktualisiert sich automatisch alle 30 Sekunden. Das Connection Log pollt alle 3 Sekunden wenn aktiv und sichtbar.</p>
        </div>
      </details>
    </div>
  );
}

function SectionSimulation() {
  return (
    <div>
      <h2>Simulation</h2>
      <p>
        Unter <strong>Administration → Simulation</strong> kannst du Dummy-Empfänger erstellen und starten,
        die simulierte Drohnen-Daten erzeugen. Diese verhalten sich exakt wie echte Hardware-Empfänger
        (ESP32/ESP8266) und eignen sich zum Testen der Karte, Zonen und Verstöße ohne echte Hardware.
      </p>
      <div id="simulator-erstellen">
        <h3>Simulator erstellen</h3>
          <ol>
            <li>Klicke auf <strong>„+ Neuer Simulator"</strong></li>
            <li><strong>Name</strong> — Ein beschreibender Name (z.B. „Bielefeld City")</li>
            <li><strong>Drohnen</strong> — Anzahl simulierter Drohnen (1–50)</li>
            <li><strong>Position</strong> — Breitengrad/Längengrad als Zentrum der Simulation</li>
            <li><strong>Hardware</strong> — Simulierter Chip-Typ (ESP32-S3, ESP32-C3, ESP8266)</li>
            <li>Klicke <strong>„Erstellen & Starten"</strong></li>
          </ol>
      </div>
      <div id="funktionsweise">
        <h3>Funktionsweise</h3>
          <ul>
            <li>Jeder Simulator erzeugt einen echten Empfänger-Eintrag (mit [SIM]-Prefix) in der Datenbank</li>
            <li>Drohnen fliegen in realistischen Flugmustern mit variierender Höhe und Geschwindigkeit:
              <ul>
                <li><strong>Linear</strong> — Geradliniger Flug in eine Richtung</li>
                <li><strong>Circular</strong> — Kreisbahn um einen Mittelpunkt</li>
                <li><strong>Waypoint</strong> — Flug entlang vorgegebener Wegpunkte</li>
                <li><strong>Search Pattern</strong> — Systematisches Rasterflugmuster</li>
                <li><strong>Hover</strong> — Schwebeflug an einer festen Position</li>
                <li><strong>Figure Eight</strong> — Flug in Form einer Acht</li>
                <li><strong>Spiral</strong> — Spiralförmiger Flug</li>
                <li><strong>Random Walk</strong> — Zufällige Richtungswechsel</li>
              </ul>
            </li>
            <li>Detections werden alle <strong>2 Sekunden</strong> gesendet (wie bei echten Empfängern)</li>
            <li>Heartbeats alle <strong>30 Sekunden</strong> mit simulierten Systemwerten (WiFi, Heap, Uptime)</li>
            <li>Verschiedene Drohnenmodelle (DJI, Autel, Skydio, etc.) mit unterschiedlichen Quellen (WiFi/BLE)</li>
          </ul>
      </div>
      <div id="voraussetzung">
        <h3>Voraussetzung</h3>
          <p>
            Die Datenquelle <strong>„Empfänger"</strong> muss in den <strong>Einstellungen</strong> aktiviert sein,
            damit die simulierten Drohnen auf der Karte erscheinen.
          </p>
      </div>
      <div id="wichtig">
        <h3>Wichtig</h3>
          <ul>
            <li>Simulatoren sind <strong>flüchtig</strong> — nach einem Server-Neustart sind sie weg</li>
            <li>Die erzeugten [SIM]-Empfänger bleiben in der DB (Status: offline)</li>
            <li>„Alle stoppen" beendet alle laufenden Simulatoren des aktuellen Mandanten</li>
          </ul>
      </div>
    </div>
  );
}

function SectionHardware() {
  return (
    <div>
      <h2>Hardware-Inbetriebnahme</h2>
      <p>
        Diese Anleitung beschreibt, wie du einen ESP32 oder ESP8266 als Open Drone ID Empfänger
        in Betrieb nimmst.
      </p>
      <EspSetupDiagram />
      <details className="help-sub" id="voraussetzungen" open>
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Voraussetzungen</summary>
        <div style={subContentStyle}>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Was</th><th style={thStyle}>Details</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Board</strong></td><td style={tdStyle}>ESP32-S3, ESP32-C3 oder ESP8266 (DevKit mit USB)</td></tr>
              <tr><td style={tdStyle}><strong>USB-Kabel</strong></td><td style={tdStyle}>Datenkabel (nicht nur Ladekabel!). Typ-C oder Micro-USB je nach Board.</td></tr>
              <tr><td style={tdStyle}><strong>esptool.py</strong></td><td style={tdStyle}><code>pip install esptool</code> — oder Chrome/Edge für Web Serial Flash</td></tr>
              <tr><td style={tdStyle}><strong>Stromversorgung</strong></td><td style={tdStyle}>USB-Netzteil (5V/500mA) oder Powerbank für Außeneinsatz</td></tr>
            </tbody>
          </table>
        </div>
      </details>
      <details className="help-sub" id="schritt-1">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Schritt 1: Empfänger in FlightArc erstellen</summary>
        <div style={subContentStyle}>
      <ol>
        <li>Gehe zu <strong>Administration → Empfänger</strong></li>
        <li>Klicke <strong>„+ Neuer Empfänger"</strong></li>
        <li>Gib einen aussagekräftigen Namen ein (z.B. „Feld-Nord", „Dach-Halle-3")</li>
        <li>Wähle den passenden Hardware-Typ</li>
        <li>Klicke <strong>„Erstellen"</strong></li>
        <li>Kopiere den <strong>API-Key</strong> — er wird nur einmal angezeigt!</li>
      </ol>
        </div>
      </details>
      <details className="help-sub" id="schritt-2">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Schritt 2: Flash-Wizard starten</summary>
        <div style={subContentStyle}>
      <ol>
        <li>Klicke auf die Zeile des neuen Empfängers, um sie aufzuklappen</li>
        <li>Klicke auf <strong>„Firmware flashen"</strong></li>
        <li>Der Flash-Wizard öffnet sich:</li>
      </ol>
      <h4>Wizard: Vorbereitung (Schritt 1)</h4>
      <p>
        Zeigt die Voraussetzungen an. Bestätige mit <strong>„Weiter"</strong>.
      </p>
      <h4>Wizard: Konfiguration (Schritt 2)</h4>
      <ul>
        <li><strong>Backend-URL</strong> (Pflicht) — Die URL deines FlightArc-Servers (z.B. <code>https://mein-server.de:3020</code>). Ist vorausgefüllt mit der aktuellen URL.</li>
        <li><strong>WiFi-Netzwerke</strong> (optional, bis zu 3) — Der Empfänger verbindet sich automatisch mit dem stärksten verfügbaren Netzwerk. Wenn leer, konfigurierst du WiFi später über das Captive Portal.</li>
      </ul>
      <p>Klicke auf <strong>„Firmware bauen"</strong>. Der API-Key wird automatisch eingebettet.</p>
      <h4>Wizard: Firmware herunterladen (Schritt 3-4)</h4>
      <p>
        Nach erfolgreichem Build klicke <strong>„Firmware herunterladen (.bin)"</strong>.
      </p>
        </div>
      </details>
      <details className="help-sub" id="schritt-3">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Schritt 3: Firmware auf ESP flashen</summary>
        <div style={subContentStyle}>
      <InfoBox type="info">
        Verbinde das ESP-Board per USB mit deinem Computer. Stelle sicher, dass es ein Datenkabel ist
        (bei reinen Ladekabeln wird das Board nicht erkannt).
      </InfoBox>
      <h4>Board in den Download-Modus versetzen</h4>
      <p>
        Bevor die Firmware geflasht werden kann, muss das Board in den Download-Modus versetzt werden.
        Viele DevKits machen das automatisch (via DTR/RTS). Falls nicht, manuell:
      </p>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Board</th><th style={thStyle}>Tasten</th><th style={thStyle}>Anleitung</th><th style={thStyle}>Port</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}><strong>ESP32-S3</strong></td>
            <td style={tdStyle}>BOOT + RST</td>
            <td style={tdStyle}>BOOT halten → RST kurz drücken → BOOT loslassen</td>
            <td style={tdStyle}><code>/dev/ttyACM0</code></td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>ESP32-C3</strong></td>
            <td style={tdStyle}>BOOT (GPIO9) + RST</td>
            <td style={tdStyle}>BOOT halten → RST kurz drücken → BOOT loslassen</td>
            <td style={tdStyle}><code>/dev/ttyACM0</code> oder <code>/dev/ttyUSB0</code></td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>ESP8266</strong></td>
            <td style={tdStyle}>FLASH (GPIO0) + RST</td>
            <td style={tdStyle}>FLASH halten → RST kurz drücken → FLASH loslassen</td>
            <td style={tdStyle}><code>/dev/ttyUSB0</code></td>
          </tr>
        </tbody>
      </table>
      <InfoBox type="warning">
        <strong>ESP32-S3 Hinweis:</strong> Bei Boards mit nativem USB (ttyACM) wird <code>Serial.print</code> nur angezeigt
        wenn die Firmware mit <code>ARDUINO_USB_CDC_ON_BOOT=1</code> gebaut wurde (FlightArc macht das automatisch).
        Der Port wechselt nach dem Flashen möglicherweise — unter Linux mit <code>ls /dev/ttyACM*</code> prüfen.
      </InfoBox>
      <h4>Option A: esptool (empfohlen)</h4>
      <InfoBox type="warning">
        <strong>Wichtig:</strong> Beim ersten Flashen oder bei SHA-256-Fehlern immer zuerst den Flash komplett löschen!
      </InfoBox>
      <CodeBlock>{`# ═══ ESP32-S3 (Flash: DIO, 8MB) ═══
# Schritt 1: Flash löschen (einmalig / bei Problemen)
esptool.py --chip esp32s3 erase_flash

# Schritt 2: Firmware flashen
esptool.py --chip esp32s3 --port /dev/ttyUSB0 \\
  --baud 460800 write_flash \\
  --flash_mode dio --flash_size 8MB \\
  0x0 flightarc-esp32-s3-XXXX.bin

# ═══ ESP32-C3 (Flash: QIO, 4MB) ═══
esptool.py --chip esp32c3 erase_flash
esptool.py --chip esp32c3 --port /dev/ttyUSB0 \\
  --baud 460800 write_flash \\
  0x0 flightarc-esp32-c3-XXXX.bin

# ═══ ESP8266 ═══
esptool.py --chip esp8266 erase_flash
esptool.py --chip esp8266 --port /dev/ttyUSB0 \\
  write_flash 0x0 flightarc-esp8266-XXXX.bin

# Windows: --port COM3 (o.ä.) statt /dev/ttyUSB0`}</CodeBlock>
      <h4>Option B: Web Serial (Chrome/Edge)</h4>
      <p>
        Öffne <a href="https://web.esphome.io" target="_blank" rel="noopener" style={{ color: '#14b8a6' }}>web.esphome.io</a> →
        „Install" → Wähle die heruntergeladene .bin Datei → Flash.
      </p>
        </div>
      </details>
      <details className="help-sub" id="schritt-4">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Schritt 4: Erstinbetriebnahme</summary>
        <div style={subContentStyle}>
      <h4>LED-Signale</h4>
      <InfoBox type="info">
        <strong>ESP32-S3 DevKitC:</strong> RGB Neopixel auf GPIO48 — farbige Statusanzeige (blau, gelb, orange, grün, weiß, rot).{' '}
        <strong>ESP32-C3 / ESP8266:</strong> Eingebaute LED auf GPIO2 — nur an/aus (keine Farben).
      </InfoBox>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>LED-Muster</th><th style={thStyle}>Farbe (S3)</th><th style={thStyle}>Bedeutung</th><th style={thStyle}>Was tun?</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}><strong>Schnelles Blinken</strong> (100ms)</td><td style={tdStyle}>Blau</td><td style={tdStyle}>Boot / WLAN-Suche</td><td style={tdStyle}>Warten — ESP sucht nach konfiguriertem Netzwerk</td></tr>
          <tr><td style={tdStyle}><strong>Langsames Pulsieren</strong> (300ms an, 1200ms aus)</td><td style={tdStyle}>Gelb</td><td style={tdStyle}>Kein WLAN — Hotspot offen</td><td style={tdStyle}>Mit Handy/Laptop mit <strong>„FlightArc-XXXX"</strong> verbinden und WLAN konfigurieren</td></tr>
          <tr><td style={tdStyle}><strong>Doppelblinken</strong> (2x 200ms, Pause)</td><td style={tdStyle}>Orange</td><td style={tdStyle}>WLAN ok, Backend nicht erreichbar</td><td style={tdStyle}>Backend-URL und Netzwerk prüfen (Server erreichbar? Firewall? Port?)</td></tr>
          <tr><td style={tdStyle}><strong>Dauerhaft an</strong></td><td style={tdStyle}>Grün</td><td style={tdStyle}>Alles ok — Online</td><td style={tdStyle}>Empfänger funktioniert, sendet Heartbeats und Erkennungen</td></tr>
          <tr><td style={tdStyle}><strong>Kurzes Aufblitzen</strong> (80ms)</td><td style={tdStyle}>Weiß</td><td style={tdStyle}>Drohne erkannt</td><td style={tdStyle}>Normale Aktivität — LED blitzt weiß bei jeder gesendeten Erkennung</td></tr>
          <tr><td style={tdStyle}><strong>SOS-Muster</strong></td><td style={tdStyle}>Rot</td><td style={tdStyle}>Schwerer Fehler</td><td style={tdStyle}>ESP neustarten, ggf. Flash löschen und Firmware neu flashen</td></tr>
        </tbody>
      </table>

      <h4>Erstinbetriebnahme</h4>
      <ol>
        <li><strong>Strom anschließen</strong> — LED blinkt schnell (WLAN-Suche, ~15 Sekunden).</li>
        <li><strong>WiFi-Verbindung</strong> —
          <ul>
            <li>Wenn WiFi-Daten in der Firmware eingebettet: Verbindet sich automatisch. LED wechselt zu Doppelblinken (Backend-Suche), dann dauerhaft an.</li>
            <li>Wenn kein WiFi konfiguriert oder das Netzwerk nicht erreichbar: Nach 15 Sekunden startet der ESP
              automatisch einen Hotspot <strong>„FlightArc-XXXX"</strong> (LED: langsames Pulsieren).</li>
          </ul>
        </li>
        <li><strong>Captive Portal</strong> (bei Hotspot) — Verbinde dich mit dem Hotspot <strong>„FlightArc-XXXX"</strong>,
          ein Konfigurationsportal öffnet sich automatisch:
          <ul>
            <li>Es wird eine <strong>zwischengespeicherte Netzwerkliste</strong> angezeigt, die vor dem Hotspot-Start gescannt wurde</li>
            <li>WiFi-Netzwerk aus der Liste auswählen und Passwort eingeben</li>
            <li><strong>Netzwerk nicht gefunden?</strong> — SSID und Passwort können auch manuell eingegeben werden</li>
            <li>Hinweis: Den Standort des Empfängers setzt du über die FlightArc Web-App unter <strong>Administration → Empfänger → Standort setzen</strong></li>
            <li>Der ESP verbindet sich mit dem WiFi und der <strong>Hotspot schaltet sich automatisch ab</strong></li>
          </ul>
        </li>
        <li><strong>Automatische Wiederherstellung</strong> — Falls das WiFi ausfällt, startet der ESP nach 3 gescheiterten Versuchen (~30s)
          den Hotspot erneut (LED: langsames Pulsieren). Sobald das Netzwerk wieder da ist, verbindet er sich automatisch und der Hotspot geht aus.
          <br /><em>Hinweis: Während der Hotspot aktiv ist, pausiert der WiFi-Scanner (ODID-Erkennung). Dies ist eine Hardware-Einschränkung — der ESP kann nicht gleichzeitig als Access Point und im Promiscuous Mode scannen.</em></li>
        <li><strong>Online</strong> — LED leuchtet dauerhaft. Der Empfänger sendet Heartbeats (alle 30s) und Erkennungen (alle 2s).</li>
      </ol>
        </div>
      </details>
      <details className="help-sub" id="antenne">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Antenne anschließen (ESP32-S3 mit IPEX)</summary>
        <div style={subContentStyle}>
      <InfoBox type="info">
        Das empfohlene Heemol-Board hat einen <strong>IPEX/U.FL-Anschluss</strong> und kommt mit einer
        2,4 GHz Antenne im Lieferumfang. Kein Löten nötig — die Antenne wird einfach aufgesteckt.
      </InfoBox>
      <ol>
        <li><strong>IPEX-Stecker finden</strong> — Der kleine goldene Anschluss sitzt neben dem WiFi-Modul auf der Platine (beschriftet mit "ANT" oder "IPEX").</li>
        <li><strong>Antenne aufstecken</strong> — Den U.FL-Stecker der Antenne vorsichtig gerade auf den IPEX-Anschluss drücken bis er einrastet. Nur leichter Druck nötig — nicht verkanten!</li>
        <li><strong>Antenne positionieren</strong> — Bei Gehäuse-Montage: Antenne durch eine Kabelverschraubung (M16) nach außen führen. Die Antenne muss außerhalb des Gehäuses sein für optimalen Empfang.</li>
      </ol>
      <InfoBox type="warning">
        <strong>Wichtig:</strong> Nur Boards mit <strong>IPEX-Anschluss</strong> verwenden! Boards ohne IPEX haben nur
        eine interne PCB-Antenne (~200-500m) — zu wenig für zuverlässige Outdoor-Erkennung. Das empfohlene
        Heemol-Board kommt mit IPEX + externer 2,4 GHz Antenne im Lieferumfang.
      </InfoBox>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Antennen-Typ</th><th style={thStyle}>Reichweite (Drohnen-ODID)</th><th style={thStyle}>Geeignet für</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>PCB-Antenne (auf dem Board)</td><td style={tdStyle}>~200-500 m</td><td style={tdStyle}>Indoor, Demo, kurze Distanzen</td></tr>
          <tr><td style={tdStyle}>Externe 2,4 GHz 3dBi</td><td style={tdStyle}>~500-1000 m</td><td style={tdStyle}>Outdoor, Gehäuse-Montage, stationär</td></tr>
          <tr><td style={tdStyle}>Externe 5dBi Richtantenne</td><td style={tdStyle}>~1-2 km</td><td style={tdStyle}>Feldüberwachung, große Areale</td></tr>
        </tbody>
      </table>
        </div>
      </details>
      <details className="help-sub" id="led-anzeige">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> LED-Anzeige</summary>
        <div style={subContentStyle}>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Muster</th><th style={thStyle}>Farbe (S3)</th><th style={thStyle}>Bedeutung</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>Schnelles Blinken (100ms)</td><td style={tdStyle}>Blau</td><td style={tdStyle}>Boot — versucht sich mit WiFi zu verbinden</td></tr>
          <tr><td style={tdStyle}>Langsames Pulsieren (300ms an, 1200ms aus)</td><td style={tdStyle}>Gelb</td><td style={tdStyle}>Kein WLAN — Hotspot aktiv, wartet auf WiFi-Konfiguration über Captive Portal</td></tr>
          <tr><td style={tdStyle}>Doppelblinken (2x 200ms, Pause)</td><td style={tdStyle}>Orange</td><td style={tdStyle}>WiFi verbunden, Backend nicht erreichbar</td></tr>
          <tr><td style={tdStyle}>Dauerhaft an</td><td style={tdStyle}>Grün</td><td style={tdStyle}>Online — verbunden mit FlightArc Backend</td></tr>
          <tr><td style={tdStyle}>Kurzes Aufblitzen (80ms)</td><td style={tdStyle}>Weiß</td><td style={tdStyle}>Drohne erkannt!</td></tr>
          <tr><td style={tdStyle}>SOS-Muster</td><td style={tdStyle}>Rot</td><td style={tdStyle}>Schwerer Fehler — ESP neustarten, ggf. Firmware neu flashen</td></tr>
        </tbody>
      </table>
        </div>
      </details>
      <details className="help-sub" id="problembehandlung">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Problembehandlung</summary>
        <div style={subContentStyle}>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Problem</th><th style={thStyle}>Lösung</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>ESP wird nicht erkannt</td><td style={tdStyle}>Anderes USB-Kabel versuchen (Datenkabel!). ESP32-S3 hat native USB (kein Treiber nötig). ESP32-C3 und ESP8266 brauchen CH340 oder CP2102 Treiber. Unter Linux: <code>ls /dev/ttyUSB*</code> oder <code>ls /dev/ttyACM*</code> prüfen.</td></tr>
          <tr><td style={tdStyle}>Kein WiFi-Hotspot</td><td style={tdStyle}>15 Sekunden warten — der Hotspot startet erst nach dem STA-Timeout (15s). Falls danach kein Hotspot: Board resetten (EN/RST-Taste).</td></tr>
          <tr><td style={tdStyle}>Empfänger bleibt „Offline"</td><td style={tdStyle}>Backend-URL prüfen. Firewall-Port 3020 offen? HTTP statt HTTPS bei ESP8266.</td></tr>
          <tr><td style={tdStyle}>Doppelblinken (orange)</td><td style={tdStyle}>WiFi ist verbunden, aber Backend nicht erreichbar. Backend-URL, Firewall-Port (3020) und Netzwerkverbindung prüfen. Bei HTTPS: ESP8266 unterstützt nur HTTP.</td></tr>
          <tr><td style={tdStyle}>Keine Drohnen erkannt</td><td style={tdStyle}>Nur Drohnen mit aktivierter Remote ID (ODID) werden erkannt — EU-Pflicht seit 01.01.2024. DJI-Drohnen senden per WiFi NAN (ESP32 erforderlich). ESP8266 kann kein BLE und kein NAN. WiFi-Kanal prüfen: Empfänger lauscht auf dem Kanal des verbundenen WiFi-Netzwerks.</td></tr>
          <tr><td style={tdStyle}>SHA-256 Boot-Loop</td><td style={tdStyle}>Flash komplett löschen: <code>esptool.py --chip esp32s3 erase_flash</code>, dann erneut flashen. Alternativ: <strong>Merged Binary</strong> verwenden (Full-Flash enthält Bootloader + Partitionen). Ursache: korrupter Flash, falscher Flash-Modus (ESP32-S3 braucht DIO) oder Web-Flasher ohne Bootloader.</td></tr>
          <tr><td style={tdStyle}>API-Key verloren</td><td style={tdStyle}>Unter Empfänger → Details → „API-Key regenerieren". Firmware neu flashen mit neuem Key.</td></tr>
          <tr><td style={tdStyle}>OTA-Update schlägt fehl</td><td style={tdStyle}>Empfänger muss online sein (grüne LED). Nur ESP32-S3/C3 (nicht ESP8266). Prüfen ob Firmware gebaut wurde. Bei Netzwerkproblemen: Empfänger startet nach fehlgeschlagenem OTA mit alter Firmware weiter.</td></tr>
        </tbody>
      </table>
        </div>
      </details>
      <details className="help-sub" id="hardware-vergleich">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Vergleich der Hardware-Typen</summary>
        <div style={subContentStyle}>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Feature</th><th style={thStyle}>ESP32-S3</th><th style={thStyle}>ESP32-C3</th><th style={thStyle}>ESP8266</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>BLE-Scan (ODID)</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>WiFi-Beacon (ODID)</td><td style={tdStyle}>Ja (2 OUIs)</td><td style={tdStyle}>Ja (2 OUIs)</td><td style={tdStyle}>Ja (2 OUIs)</td></tr>
          <tr><td style={tdStyle}>WiFi NAN (DJI u.a.)</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>Pilot-Position</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja (WiFi only)</td></tr>
          <tr><td style={tdStyle}>Dual-Core</td><td style={tdStyle}>Ja (BLE+WiFi parallel)</td><td style={tdStyle}>Nein (Single Core)</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>HTTPS</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>OTA-Update</td><td style={tdStyle}>Ja (Dual-Slot)</td><td style={tdStyle}>Ja (Dual-Slot)</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>Merged Binary</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>LED-Farben</td><td style={tdStyle}>RGB Neopixel (GPIO48)</td><td style={tdStyle}>Nur An/Aus (GPIO2)</td><td style={tdStyle}>Nur An/Aus (GPIO2)</td></tr>
          <tr><td style={tdStyle}>Flash-Modus</td><td style={tdStyle}>DIO</td><td style={tdStyle}>QIO</td><td style={tdStyle}>QIO</td></tr>
          <tr><td style={tdStyle}>Flash-Größe</td><td style={tdStyle}>8 MB</td><td style={tdStyle}>4 MB</td><td style={tdStyle}>4 MB</td></tr>
          <tr><td style={tdStyle}>Partition</td><td style={tdStyle}>8MB (2x 3.2MB OTA)</td><td style={tdStyle}>4MB (2x 1.3MB OTA)</td><td style={tdStyle}>Standard</td></tr>
          <tr><td style={tdStyle}>RAM</td><td style={tdStyle}>~320KB</td><td style={tdStyle}>~280KB</td><td style={tdStyle}>~80KB</td></tr>
          <tr><td style={tdStyle}>USB-Treiber</td><td style={tdStyle}>Nativ (kein Treiber)</td><td style={tdStyle}>CH340/CP2102</td><td style={tdStyle}>CH340/CP2102</td></tr>
          <tr><td style={tdStyle}>Preis (ca.)</td><td style={tdStyle}>6–10€</td><td style={tdStyle}>4–7€</td><td style={tdStyle}>2–4€</td></tr>
          <tr><td style={tdStyle}>Empfehlung</td><td style={tdStyle}>Beste Wahl</td><td style={tdStyle}>Kompakt & günstig</td><td style={tdStyle}>Nur für WiFi-only</td></tr>
        </tbody>
      </table>

      <InfoBox type="info">
        <strong>ODID-Erkennung:</strong> Die Firmware nutzt die vollständige{' '}
        <a href="https://github.com/opendroneid" target="_blank" rel="noopener" style={{ color: '#14b8a6' }}>OpenDroneID</a>-Library
        und basiert auf dem Open-Source-Projekt{' '}
        <a href="https://github.com/colonelpanichacks/drone-mesh-mapper" target="_blank" rel="noopener" style={{ color: '#14b8a6' }}>drone-mesh-mapper</a>{' '}
        von colonelpanichacks. Unterstützt werden WiFi Beacon (2 OUIs), WiFi NAN Action Frames (DJI u.a.),
        BLE ODID und MessagePack — alle 7 ODID Message-Typen inkl. Pilot-Position und Operator-ID.
      </InfoBox>
        </div>
      </details>
      <details className="help-sub" id="einkaufslisten">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Einkaufslisten</summary>
        <div style={subContentStyle}>
      <p>
        Hier findest du für jeden Hardware-Typ eine vollständige Einkaufsliste mit allen Komponenten,
        die du für den Aufbau eines Empfängers benötigst. Die gleiche Liste wird auch beim Erstellen
        eines Empfängers in der Admin-Oberfläche angezeigt.
      </p>

      {/* ESP32-S3 Shopping List */}
      <h4>ESP32-S3 (Empfohlen)</h4>
      <InfoBox type="info">
        Voller Funktionsumfang: BLE + WiFi Remote ID, HTTPS, viel RAM. Beste Wahl für stationäre Empfänger.
        Alle Boards kommen mit vorgelöteten Pin-Headers — kein Löten nötig.
      </InfoBox>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Komponente</th>
            <th style={thStyle}>Beschreibung</th>
            <th style={thStyle}>Ca. Preis</th>
            <th style={thStyle}>Pflicht</th>
          </tr>
        </thead>
        <tbody>
          <tr style={groupRowStyle}><td style={tdStyle}><strong>ESP32-S3-DevKitC-1 N16R8 mit IPEX + Antenne</strong> <a href="https://www.amazon.de/Heemol-DevKitC-1-Entwicklung-Bluetooth-Anschlie%C3%9Fbare/dp/B0FKFXC6F8" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Heemol Board: 16 MB Flash, 8 MB PSRAM, WiFi + BLE 5.0, USB-C, Dual-Core 240 MHz. <strong>Mit IPEX-Anschluss + 2,4 GHz Antenne im Lieferumfang.</strong> Pin-Headers vorgelötet. Antenne einfach auf den IPEX-Stecker klicken.</td><td style={tdStyle}>~15 €</td><td style={tdStyle}>Ja</td></tr>
          <tr style={groupRowStyle}><td style={tdStyle}><strong>GPIO Breakout Board für ESP32-S3</strong> <a href="https://www.amazon.de/Meshnology-Erweiterungsboard-Kunststoffdichtungen-Steckdosen-N40/dp/B0FLK4MDDW" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Steckboden mit Montagelöchern — ESP32 einstecken, im Gehäuse verschrauben. Kein Löten, kein Breadboard. 5V/3.3V Ausgänge, GPIO-Status-LEDs.</td><td style={tdStyle}>~12 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-A auf USB-C Kabel (1m) <a href="https://www.amazon.de/1-m-langes-usb-c-kabel-usb-a-auf-usb-c-von-amazon/dp/B07Q5JW4J3" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Datenkabel (nicht nur Lade!) für Flashen und Stromversorgung.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil 5V/2A (USB-C) <a href="https://www.amazon.de/Bouge-Universal-Ladeger%C3%A4t-Kompatibilit%C3%A4t-Blackview/dp/B0C2Q5LK11" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Steckernetzteil für Dauerbetrieb. 5V, min. 1A (2A empfohlen).</td><td style={tdStyle}>~8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}><strong>ABS-Gehäuse IP65 (100x68x50 mm)</strong> <a href="https://www.amazon.de/Elektronische-Wasserdichte-Industriegeh%C3%A4use-Anschlussdose-Verteilerdose/dp/B0DDWR9LP3" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Wasserdichtes Elektronik-Gehäuse für Außenmontage. Antenne durch Kabelverschraubung nach außen führen.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Kabelverschraubung M16 IP68 (5er-Pack) <a href="https://www.amazon.de/Kabelverschraubung-M16-Hanibos-Kabeldurchf%C3%BChrung-Kabelverschraubungen/dp/B0BXRVX368" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Wasserdichte Kabel-Durchführung für USB-Kabel und Antennenkabel ins Gehäuse.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>PoE-Splitter 5V USB-C (IEEE 802.3af) <a href="https://www.amazon.de/UCTRONICS-PoE-Splitter-USB-C-USB-C-Adapter-Sicherheitskameras/dp/B087F4QCTR" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Stromversorgung über Ethernet-Kabel. Spart extra Stromkabel bei Outdoor-Installation.</td><td style={tdStyle}>~15 €</td><td style={tdStyle}>Optional</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~49 € (Board mit IPEX-Antenne)</strong></p>

      {/* ESP32-C3 Shopping List */}
      <h4>ESP32-C3 (Kompakt)</h4>
      <InfoBox type="info">
        BLE + WiFi Remote ID, HTTPS – mit RISC-V Kern. Günstiger und kleiner als S3, aber weniger RAM.
        Board kommt mit vorgelöteten Pin-Headers. Hinweis: Der kompakte C3-DevKitM-1 (30 Pins, 54×25mm) passt in keinen
        Standard-Steckboden — Befestigung im Gehäuse mit Abstandshaltern und Klebepads.
      </InfoBox>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Komponente</th>
            <th style={thStyle}>Beschreibung</th>
            <th style={thStyle}>Ca. Preis</th>
            <th style={thStyle}>Pflicht</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}><strong>ESP32-C3-DevKitM-1 (vorgelötet)</strong> <a href="https://www.amazon.de/DollaTek-ESP32-C3-Bluetooth-Development-ESP32-C3-DevKitM-1/dp/B0BVQP3XPJ" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>DollaTek Board, 4 MB Flash, WiFi + BLE 5.0, Dual USB-C, RISC-V 160 MHz. Pin-Headers vorgelötet. Kompaktes Format (54×25 mm).</td><td style={tdStyle}>~9 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-A auf USB-C Kabel (1m) <a href="https://www.amazon.de/1-m-langes-usb-c-kabel-usb-a-auf-usb-c-von-amazon/dp/B07Q5JW4J3" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Datenkabel für Flashen und Stromversorgung.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil 5V/2A (USB-A) <a href="https://www.amazon.de/Ladeger%C3%A4t-Netzstecker-Steckdosenadapter-Ladestecker-Tischleuchte/dp/B0DNMKG9C3" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Steckernetzteil für Dauerbetrieb. Geringerer Verbrauch als S3.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}><strong>ABS-Gehäuse IP65 (83×58×34 mm)</strong> <a href="https://www.amazon.de/Robustes-ABS-Elektronik-Projektbox-wasserdichtes-Abzweiggeh%C3%A4use-Gr%C3%B6%C3%9Fenoptionen/dp/B0DL9MG241" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Kompaktes wasserdichtes Gehäuse. Der kleine C3-DevKitM-1 passt problemlos hinein.</td><td style={tdStyle}>~5 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Nylon Abstandshalter M3 Set (260-tlg.) <a href="https://www.amazon.de/Schrauben-Abstandshalter-Schraubenmutter-Distanzh%C3%BClsen-Reparatur/dp/B0B2S6JLX4" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>M3 Standoffs + Schrauben zur Befestigung der Platine im Gehäuse. Board mit Abstandshaltern positionieren und mit Klebepads fixieren.</td><td style={tdStyle}>~8 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>2,4 GHz WiFi-Antenne 3dBi (IPEX/U.FL) <a href="https://www.amazon.de/Bluetooth-Antenne-2-4GHz-geeignet-ESP8266/dp/B0CTG8XJSN" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Externe Antenne. Optional da C3-MINI-1 bereits PCB-Antenne hat.</td><td style={tdStyle}>~6 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>Kabelverschraubung M16 IP68 (5er-Pack) <a href="https://www.amazon.de/Kabelverschraubung-M16-Hanibos-Kabeldurchf%C3%BChrung-Kabelverschraubungen/dp/B0BXRVX368" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Wasserdichte Kabel-Durchführung.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Optional</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~28 €</strong></p>

      {/* ESP8266 Shopping List */}
      <h4>ESP8266 / NodeMCU (Budget)</h4>
      <InfoBox type="warning">
        Nur WiFi-Beacon ODID – kein BLE, kein HTTPS. Geeignet als günstige Ergänzung an Standorten mit bekanntem WiFi-Beacon-Verkehr.
        NodeMCU kommt immer mit vorgelöteten Pin-Headers. Wichtig: NodeMCU Lolin V3 ist die breite Variante (28mm Pin-Abstand) —
        nur kompatible Base Boards verwenden!
      </InfoBox>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Komponente</th>
            <th style={thStyle}>Beschreibung</th>
            <th style={thStyle}>Ca. Preis</th>
            <th style={thStyle}>Pflicht</th>
          </tr>
        </thead>
        <tbody>
          <tr style={groupRowStyle}><td style={tdStyle}><strong>AZDelivery NodeMCU Lolin V3 (vorgelötet)</strong> <a href="https://www.amazon.de/AZDelivery-NodeMCU-Lolin-WiFi-Parent/dp/B07Z5C3KQF" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a> <span style={groupBadgeStyle}>&#x1F517; 2 Teile = 1 Set</span></td><td style={tdStyle}>ESP-12F Board mit CH340G, Micro-USB, WiFi 2,4 GHz. Pin-Headers vorgelötet, inkl. E-Book. Breite Variante (28mm Pin-Abstand).</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
          <tr style={groupRowStyle}><td style={tdStyle}><strong>Base Board für NodeMCU V3 Wide (28mm)</strong> <a href="https://www.amazon.de/dp/B0D1KCYG3W" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>DUBEUYEW Base Board — bestätigt kompatibel mit breiter NodeMCU V3 (28mm Pin-Abstand). DC-Buchse 6–24V, 5V/3.3V Ausgänge, GPIO-Verdopplung, Montagelöcher (60×60mm).</td><td style={tdStyle}>~9 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Micro-USB Kabel (1m) <a href="https://www.amazon.de/KabelDirekt-Micro-Ladekabel-Datenkabel-schwarz/dp/B00L5G2IR6" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Datenkabel für Flashen und Stromversorgung. Auf Datenkabel achten!</td><td style={tdStyle}>~5 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil 5V/2A (3er-Pack) <a href="https://www.amazon.de/Ladeger%C3%A4t-Netzstecker-Smartphones-Spielzeug-Spielkonsole-wei%C3%9F/dp/B0CM9G39DW" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Steckernetzteil mit USB-A Ausgang. 3er-Pack praktisch für mehrere Nodes.</td><td style={tdStyle}>~9 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}><strong>ABS-Gehäuse IP65 (100×68×50 mm)</strong> <a href="https://www.amazon.de/Elektronische-Wasserdichte-Industriegeh%C3%A4use-Anschlussdose-Verteilerdose/dp/B0DDWR9LP3" target="_blank" rel="noopener noreferrer" style={linkBadgeStyle}>Amazon &#8599;</a></td><td style={tdStyle}>Wasserdichtes Elektronik-Gehäuse. Passt NodeMCU + Base Board (60×60mm) mit etwas Luft.</td><td style={tdStyle}>~7 €</td><td style={tdStyle}>Ja</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~37 €</strong></p>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 16 }}>
        Alle Links führen zu Amazon.de (Stand März 2026). Preise können variieren.
        Die Einkaufslisten mit direkten Links werden auch beim Erstellen eines Empfängers in der Admin-Oberfläche angezeigt.
      </p>
        </div>
      </details>
    </div>
  );
}

function SectionOta() {
  return (
    <div>
      <h2>OTA-Updates & Merged Binary</h2>
      <p>
        Ab Firmware v1.5 unterstützt FlightArc <strong>Over-the-Air (OTA) Updates</strong> und
        ein <strong>Merged Binary</strong> für problemloses Flashen mit Web-Flashern.
      </p>

      <details className="help-sub" id="ota-updates" open>
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> OTA-Updates (Over-the-Air)</summary>
        <div style={subContentStyle}>
          <p>
            Mit OTA kannst du die Firmware eines Empfängers drahtlos aktualisieren, ohne das Board
            physisch per USB anschließen zu müssen. Nur das <strong>erste</strong> Flashen muss per USB erfolgen —
            alle weiteren Updates können per OTA übertragen werden.
          </p>
          <h4>Voraussetzungen</h4>
          <ul>
            <li><strong>Nur ESP32-S3 und ESP32-C3</strong> — ESP8266 unterstützt kein OTA</li>
            <li>Der Empfänger muss <strong>online</strong> sein (grüne LED, Heartbeat aktiv)</li>
            <li>Eine aktuelle Firmware muss <strong>bereits gebaut</strong> sein (Build über Flash-Wizard)</li>
          </ul>
          <h4>OTA-Update auslösen</h4>
          <ol>
            <li>Gehe zu <strong>Administration → Empfänger</strong></li>
            <li>Klappe den gewünschten Empfänger auf (Klick auf die Zeile)</li>
            <li>Klicke auf <strong>„OTA Update senden"</strong></li>
            <li>Der Status wechselt zu <strong>„OTA ausstehend..."</strong></li>
            <li>Beim nächsten Heartbeat (alle 30 Sekunden) erhält der ESP das Update-Signal</li>
            <li>Der ESP lädt die neue Firmware herunter, schreibt sie in den inaktiven OTA-Slot und startet neu</li>
            <li>Nach dem Neustart sendet der ESP die neue Firmware-Version im Heartbeat — das Backend erkennt das Update als erfolgreich und setzt das OTA-Flag zurück</li>
          </ol>
          <InfoBox type="info">
            <strong>Sicherheit:</strong> OTA nutzt eine Dual-Slot Partition (app0/app1). Die neue Firmware wird in den
            inaktiven Slot geschrieben. Bei einem Fehler bleibt die alte Firmware im aktiven Slot erhalten — es gibt
            kein Brick-Risiko. Falls das Update fehlschlägt, läuft der Empfänger einfach mit der alten Version weiter.
          </InfoBox>
          <h4>OTA abbrechen</h4>
          <p>
            Solange der Empfänger das Update noch nicht heruntergeladen hat, kannst du auf <strong>„OTA ausstehend... (Abbrechen)"</strong> klicken,
            um das ausstehende Update zu widerrufen.
          </p>
          <h4>OTA-Status</h4>
          <p>
            Nach einem OTA-Versuch zeigt die Empfänger-Detailansicht den Ergebnis-Status:
          </p>
          <ul>
            <li><span style={{ color: '#22c55e' }}>●</span> <strong>OTA: Erfolgreich</strong> — Firmware-Version stimmt mit Build-Version überein</li>
            <li><span style={{ color: '#ef4444' }}>●</span> <strong>OTA: Fehler</strong> — Download oder Flash fehlgeschlagen, Empfänger läuft weiter mit alter Version</li>
          </ul>
        </div>
      </details>
      <details className="help-sub" id="build-versionierung">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Build-Versionierung</summary>
        <div style={subContentStyle}>
          <p>
            Jeder Firmware-Build erhält eine eindeutige Version im Format <code>1.0.XXXXX</code> (mit Timestamp-Suffix).
            Diese Version wird:
          </p>
          <ul>
            <li>In der <strong>Empfänger-Detailansicht</strong> unter „Firmware" angezeigt</li>
            <li>Im <strong>Heartbeat</strong> vom ESP an das Backend gemeldet</li>
            <li>Für die <strong>OTA-Erkennung</strong> verwendet: Wenn die gemeldete Firmware-Version mit der Build-Version übereinstimmt, gilt das Update als erfolgreich</li>
          </ul>
        </div>
      </details>
      <details className="help-sub" id="merged-binary">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Merged Binary (Full-Flash)</summary>
        <div style={subContentStyle}>
          <p>
            Ein Merged Binary kombiniert <strong>Bootloader + Partitionstabelle + boot_app0 + Firmware</strong> in einer
            einzigen Datei. Es wird nach jedem erfolgreichen Build automatisch erzeugt.
          </p>
          <h4>Wann verwenden?</h4>
          <ul>
            <li><strong>Web-Flasher</strong> (z.B. web.esphome.io) — diese flashen nur eine Datei an Offset 0x0. Ohne Merged Binary fehlen Bootloader und Partitionstabelle, was zu einem <strong>SHA-256 Boot-Loop</strong> führt.</li>
            <li><strong>Erstmaliges Flashen</strong> eines neuen ESP — das Merged Binary stellt sicher, dass alle Partitionen korrekt beschrieben werden.</li>
            <li><strong>Nach einem <code>erase_flash</code></strong> — wenn der gesamte Flash gelöscht wurde.</li>
          </ul>
          <h4>Download</h4>
          <ol>
            <li>Gehe zu <strong>Administration → Empfänger</strong></li>
            <li>Klappe den Empfänger auf und klicke auf <strong>„Full-Flash (Merged)"</strong></li>
            <li>Die Datei hat das Format <code>flightarc-esp32-s3-XXXX-merged.bin</code></li>
          </ol>
          <h4>Flashen mit esptool</h4>
          <CodeBlock>{`# Merged Binary flashen (alles in einer Datei, Offset 0x0)
esptool.py --chip esp32s3 write_flash 0x0 flightarc-esp32-s3-XXXX-merged.bin`}</CodeBlock>
          <h4>Flashen mit Web-Flasher</h4>
          <p>
            Öffne <a href="https://web.esphome.io" target="_blank" rel="noopener" style={{ color: '#14b8a6' }}>web.esphome.io</a> →
            „Install" → Wähle die <strong>Merged</strong>-Datei → Flash. Da Bootloader und Partitionen enthalten sind,
            funktioniert das Flashen fehlerfrei.
          </p>
          <InfoBox type="warning">
            <strong>Nur für ESP32</strong> — Merged Binary wird nur für ESP32-S3 und ESP32-C3 erzeugt, nicht für ESP8266.
          </InfoBox>
          <InfoBox type="warning">
            <strong>NVS wird gelöscht:</strong> Das Merged Binary überschreibt den gesamten Flash inklusive NVS (Non-Volatile Storage).
            WiFi-Zugangsdaten, die über das Captive Portal gespeichert wurden, gehen verloren. WiFi-Daten, die beim Build eingebettet
            wurden (über den Flash-Wizard), sind davon nicht betroffen.
          </InfoBox>
        </div>
      </details>
      <details className="help-sub" id="vergleich">
        <summary style={h3SummaryStyle}><span className="help-caret">&#9654;</span> Vergleich: App-Firmware vs. Merged Binary vs. OTA</summary>
        <div style={subContentStyle}>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Methode</th><th style={thStyle}>Wann</th><th style={thStyle}>Vorteile</th><th style={thStyle}>Einschränkungen</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>App-Firmware (.bin)</strong></td><td style={tdStyle}>Normales USB-Flashen mit esptool</td><td style={tdStyle}>Schnell, bewahrt NVS/WiFi-Einstellungen</td><td style={tdStyle}>Funktioniert nicht mit Web-Flashern</td></tr>
              <tr><td style={tdStyle}><strong>Merged Binary</strong></td><td style={tdStyle}>Erstmaliges Flashen, Web-Flasher, nach erase_flash</td><td style={tdStyle}>Alles in einer Datei, kein SHA-256 Boot-Loop</td><td style={tdStyle}>Löscht NVS (WiFi-Einstellungen). Nur ESP32.</td></tr>
              <tr><td style={tdStyle}><strong>OTA</strong></td><td style={tdStyle}>Folge-Updates ohne USB-Zugang</td><td style={tdStyle}>Drahtlos, kein physischer Zugang nötig, sicher (Dual-Slot)</td><td style={tdStyle}>Nur ESP32-S3/C3. Empfänger muss online sein.</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function SectionTips() {
  return (
    <div>
      <h2>Tipps & Tricks</h2>
      <div id="performance">
        <h3>Performance</h3>
          <ul>
            <li>Bei vielen Drohnen (&gt;100) die Aktualisierungsrate auf 5s oder 10s erhöhen</li>
            <li>Radius-Filter nutzen um nur relevante Drohnen zu laden</li>
            <li>Höhenfilter nutzen um nur bestimmte Höhenzonen anzuzeigen</li>
            <li>Nicht benötigte Datenquellen deaktivieren</li>
          </ul>
      </div>
      <div id="empfaenger-platzierung">
        <h3>Empfänger-Platzierung</h3>
          <ul>
            <li>So hoch wie möglich platzieren (Dach, Mast) für beste Reichweite</li>
            <li>Freie Sichtlinie in alle Richtungen</li>
            <li>ESP32-S3 bevorzugen für BLE + WiFi Abdeckung</li>
            <li>Mehrere Empfänger: Stärkste Signalstärke (RSSI) wird automatisch priorisiert</li>
            <li>Wetterschutz (IP65-Gehäuse) für Außenmontage</li>
          </ul>
      </div>
      <div id="tastenkuerzel">
        <h3>Tastenkürzel</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Taste</th><th style={thStyle}>Funktion</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><kbd>Esc</kbd></td><td style={tdStyle}>Status-Panel schließen</td></tr>
              <tr><td style={tdStyle}><kbd>+</kbd> / <kbd>-</kbd></td><td style={tdStyle}>Zoom rein/raus</td></tr>
              <tr><td style={tdStyle}><kbd>Scroll</kbd></td><td style={tdStyle}>Karten-Zoom</td></tr>
            </tbody>
          </table>
      </div>
      <div id="browser-empfehlung">
        <h3>Browser-Empfehlung</h3>
          <p>
            Chrome oder Edge für beste Kompatibilität (insb. Web Serial für ESP-Flash).
            Firefox funktioniert für alle Features außer Web Serial.
          </p>
      </div>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────

function InfoBox({ type, children }: { type: 'info' | 'warning' | 'tip' | 'danger'; children: React.ReactNode }) {
  const colorMap = {
    info:    { bg: 'rgba(59,130,246,0.1)',  border: '#3b82f6', text: '#60a5fa',  icon: '\u2139\uFE0F ' },
    warning: { bg: 'rgba(234,179,8,0.1)',   border: '#eab308', text: '#eab308',  icon: '\u26A0 ' },
    tip:     { bg: 'rgba(34,197,94,0.1)',   border: '#22c55e', text: '#4ade80',  icon: '\uD83D\uDCA1 ' },
    danger:  { bg: 'rgba(239,68,68,0.1)',   border: '#ef4444', text: '#f87171',  icon: '\uD83D\uDED1 ' },
  };
  const colors = colorMap[type];
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: '12px 16px', margin: '12px 0',
      fontSize: 13, color: colors.text, lineHeight: 1.6,
    }}>
      {colors.icon}{children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ position: 'relative', ...codeBlockStyle }}>
      <button onClick={handleCopy} style={{
        position: 'absolute', top: 8, right: 8,
        background: copied ? 'rgba(34,197,94,0.2)' : 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: 4,
        padding: '4px 10px', cursor: 'pointer',
        fontSize: 11, color: copied ? '#22c55e' : 'var(--text-muted)',
        transition: 'all 0.2s ease',
      }}>
        {copied ? '\u2713 Kopiert' : 'Kopieren'}
      </button>
      <code style={{ display: 'block', whiteSpace: 'pre', paddingRight: 80 }}>
        {children}
      </code>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', margin: '12px 0',
  fontSize: 13, background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 14px', borderBottom: '1px solid var(--border)',
  color: 'var(--text-secondary)', verticalAlign: 'top',
};

const linkBadgeStyle: React.CSSProperties = {
  display: 'inline-block', marginLeft: 6, padding: '1px 6px', borderRadius: 4,
  fontSize: 10, fontWeight: 600, background: 'rgba(20,184,166,0.15)',
  color: '#14b8a6', textDecoration: 'none', verticalAlign: 'middle',
};

const groupRowStyle: React.CSSProperties = {
  borderLeft: '3px solid #3b82f6',
  background: 'rgba(59,130,246,0.04)',
};

const groupBadgeStyle: React.CSSProperties = {
  display: 'inline-block', marginLeft: 8, padding: '1px 7px', borderRadius: 4,
  fontSize: 9, fontWeight: 600, background: 'rgba(59,130,246,0.15)',
  color: '#3b82f6', verticalAlign: 'middle', whiteSpace: 'nowrap',
};

const codeBlockStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace',
  overflowX: 'auto', margin: '12px 0', whiteSpace: 'pre', lineHeight: 1.6,
  color: 'var(--text-secondary)',
};

const h3SummaryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
  cursor: 'pointer', padding: '8px 0', userSelect: 'none',
  margin: '16px 0 0',
};

const subContentStyle: React.CSSProperties = {
  paddingLeft: 4, paddingBottom: 4,
};

// ─── Section Content Map ─────────────────────────────────

const SECTION_CONTENT: Record<Section, () => JSX.Element> = {
  overview: SectionOverview,
  login: SectionLogin,
  map: SectionMap,
  drones: SectionDrones,
  flightzones: SectionFlightZones,
  nfz: SectionNFZ,
  violations: SectionViolations,
  reports: SectionReports,
  settings: SectionSettings,
  admin: SectionAdmin,
  receivers: SectionReceivers,
  simulation: SectionSimulation,
  hardware: SectionHardware,
  ota: SectionOta,
  tips: SectionTips,
};

// ─── Search Modal ────────────────────────────────────────

function SearchModal({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (sectionId: Section, subId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setSelectedIdx(0); inputRef.current?.focus(); }
  }, [open]);

  const results = (() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const out: { sectionId: Section; icon: string; sectionTitle: string; subTitle?: string; subId?: string }[] = [];
    for (const s of SECTIONS) {
      if (s.title.toLowerCase().includes(q)) {
        out.push({ sectionId: s.id, icon: s.icon, sectionTitle: s.title });
      }
      const subs = SECTION_SUBS[s.id] || [];
      for (const sub of subs) {
        if (sub.title.toLowerCase().includes(q)) {
          out.push({ sectionId: s.id, icon: s.icon, sectionTitle: s.title, subTitle: sub.title, subId: sub.id });
        }
      }
    }
    return out.slice(0, 12);
  })();

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      const r = results[selectedIdx];
      onSelect(r.sectionId, r.subId);
      onClose();
    }
    else if (e.key === 'Escape') onClose();
  };

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '15vh',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)', overflow: 'hidden',
        animation: 'helpSearchIn 0.15s ease-out',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKey}
            placeholder="Sektion oder Thema suchen..."
            style={{
              width: '100%', padding: '8px 0', background: 'transparent', border: 'none',
              color: 'var(--text-primary)', fontSize: 15, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ maxHeight: 350, overflow: 'auto', padding: '4px 0' }}>
          {results.length === 0 && query.trim() && (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              Keine Ergebnisse
            </div>
          )}
          {results.map((r, i) => (
            <button key={`${r.sectionId}-${r.subId || ''}-${i}`}
              onClick={() => { onSelect(r.sectionId, r.subId); onClose(); }}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 16px', border: 'none', textAlign: 'left',
                background: i === selectedIdx ? 'rgba(20,184,166,0.1)' : 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{r.sectionTitle}</div>
                {r.subTitle && (
                  <div style={{ fontSize: 11, color: '#14b8a6', marginTop: 1 }}>{r.subTitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12,
        }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> navigieren</span>
          <span><kbd style={kbdStyle}>Enter</kbd> öffnen</span>
          <span><kbd style={kbdStyle}>Esc</kbd> schließen</span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace',
};

// ─── Mini-TOC (Right Sidebar) ────────────────────────────

function MiniTOC({ subs, activeSubId, onSubClick }: {
  subs: SubMeta[];
  activeSubId: string | null;
  onSubClick: (id: string) => void;
}) {
  if (subs.length < 2) return null;
  return (
    <nav style={{
      width: 200, flexShrink: 0, position: 'sticky', top: 24,
      maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
      padding: '0 16px', fontSize: 12,
      borderLeft: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px',
      }}>Auf dieser Seite</div>
      {subs.map(sub => (
        <button key={sub.id} onClick={() => onSubClick(sub.id)} style={{
          display: 'block', width: '100%', padding: '4px 0 4px 10px',
          border: 'none', background: 'transparent', cursor: 'pointer',
          textAlign: 'left', fontSize: 12, lineHeight: 1.5,
          color: activeSubId === sub.id ? '#14b8a6' : 'var(--text-muted)',
          fontWeight: activeSubId === sub.id ? 600 : 400,
          borderLeft: activeSubId === sub.id ? '2px solid #14b8a6' : '2px solid transparent',
        }}>
          {sub.title}
        </button>
      ))}
    </nav>
  );
}

// ─── Main Component ──────────────────────────────────────

export default function HelpPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const isWide = !useIsMobile(1100);
  const contentRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState<Section>(() => {
    const hash = window.location.hash.slice(1).split('--')[0];
    if (hash && SECTIONS.some(s => s.id === hash)) return hash as Section;
    return 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const _ = theme;

  // Deep-link: scroll to subsection on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.includes('--')) {
      const subId = hash.split('--')[1];
      requestAnimationFrame(() => {
        const el = document.getElementById(subId);
        if (el) {
          if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
          el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }, []);

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll listener for progress bar + back-to-top
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = () => {
      setShowBackToTop(el.scrollTop > 300);
      const p = el.scrollHeight - el.clientHeight;
      setScrollProgress(p > 0 ? Math.min(1, el.scrollTop / p) : 0);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  // Scroll-spy for mini-TOC
  useEffect(() => {
    const subs = SECTION_SUBS[active] || [];
    if (subs.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSubId(entry.target.id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px' }
    );
    subs.forEach(sub => {
      const el = document.getElementById(sub.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [active]);

  const handleSectionChange = useCallback((sectionId: Section) => {
    setActive(sectionId);
    setSidebarOpen(false);
    setSearchTerm('');
    setActiveSubId(null);
    window.history.replaceState(null, '', `#${sectionId}`);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const handleSearchSelect = useCallback((sectionId: Section, subId?: string) => {
    setActive(sectionId);
    setSidebarOpen(false);
    window.history.replaceState(null, '', subId ? `#${sectionId}--${subId}` : `#${sectionId}`);
    if (subId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(subId);
        if (el) {
          if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
          el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    } else {
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, []);

  const handleSubClick = useCallback((subId: string) => {
    window.history.replaceState(null, '', `#${active}--${subId}`);
    const el = document.getElementById(subId);
    if (el) {
      if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [active]);

  const handleExpandAll = useCallback((expand: boolean) => {
    contentRef.current?.querySelectorAll('details.help-sub').forEach(d => {
      (d as HTMLDetailsElement).open = expand;
    });
  }, []);

  const filteredSections = searchTerm
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : SECTIONS;

  const Content = SECTION_CONTENT[active];
  const currentSubs = SECTION_SUBS[active] || [];

  // ─── Sidebar content (shared between mobile drawer and desktop) ───
  const sidebarContent = (
    <>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate('/')} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13,
          }}>&larr; Karte</button>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Hilfe</span>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: 0,
            }}>&times;</button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Suche... (Ctrl+K)"
            style={{
              width: '100%', padding: '6px 10px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {filteredSections.map(s => (
          <button key={s.id} onClick={() => handleSectionChange(s.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '10px 16px', border: 'none',
            background: active === s.id ? 'rgba(20,184,166,0.1)' : 'transparent',
            color: active === s.id ? '#14b8a6' : 'var(--text-secondary)',
            fontWeight: active === s.id ? 600 : 400,
            borderLeft: active === s.id ? '3px solid #14b8a6' : '3px solid transparent',
            cursor: 'pointer', fontSize: 13, textAlign: 'left',
          }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            {s.title}
          </button>
        ))}
      </div>
      <div style={{
        padding: 12, borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
      }}>
        FlightArc v1.5 &mdash; Benutzerhandbuch
      </div>
    </>
  );

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <nav style={{
          width: 260, background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {sidebarContent}
        </nav>
      )}

      {/* Mobile: Hamburger button */}
      {isMobile && (
        <button onClick={() => setSidebarOpen(true)} style={{
          position: 'fixed', top: 12, left: 12, zIndex: 999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, width: 40, height: 40, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: 'var(--text-secondary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          &#9776;
        </button>
      )}

      {/* Mobile: Sidebar drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          }} />
          <nav style={{
            position: 'fixed', top: 0, left: 0, width: 280, height: '100vh',
            zIndex: 1001, background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
          }}>
            {sidebarContent}
          </nav>
        </>
      )}

      {/* Content area wrapper */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
        {/* Scroll progress bar */}
        <div style={{ height: 3, background: 'var(--bg-tertiary)', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${scrollProgress * 100}%`,
            background: '#14b8a6', transition: 'width 0.1s ease',
          }} />
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Main content */}
          <main ref={contentRef} style={{
            flex: 1, overflow: 'auto',
            padding: isMobile ? '60px 16px 24px' : '24px 40px',
            maxWidth: 800, lineHeight: 1.7, fontSize: 14,
          }}>
            {/* Expand all / Collapse all - only for long collapsible sections */}
            {(active === 'hardware' || active === 'receivers' || active === 'ota') && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => handleExpandAll(true)} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '3px 8px', cursor: 'pointer', fontSize: 11,
                  color: 'var(--text-muted)',
                }}>Alle aufklappen</button>
                <button onClick={() => handleExpandAll(false)} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '3px 8px', cursor: 'pointer', fontSize: 11,
                  color: 'var(--text-muted)',
                }}>Alle zuklappen</button>
              </div>
            )}
            <Content />
          </main>

          {/* Mini-TOC (desktop wide only) */}
          {!isMobile && isWide && (
            <MiniTOC subs={currentSubs} activeSubId={activeSubId} onSubClick={handleSubClick} />
          )}
        </div>
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          &uarr;
        </button>
      )}

      {/* Search Modal */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />
    </div>
  );
}
