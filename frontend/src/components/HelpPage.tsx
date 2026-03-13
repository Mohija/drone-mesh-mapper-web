import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';

type Section =
  | 'overview' | 'login' | 'map' | 'drones' | 'flightzones'
  | 'nfz' | 'violations' | 'reports' | 'settings' | 'admin'
  | 'receivers' | 'hardware' | 'tips';

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
  { id: 'hardware', title: 'Hardware-Inbetriebnahme', icon: '🔧' },
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
      <text x="110" y="37" fill="#64748b" fontSize="11" fontFamily="sans-serif">v1.4</text>
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
      <h3>Systemarchitektur</h3>
      <NetworkArchDiagram />
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
      <h3>Abmelden</h3>
      <p>
        Klicke auf <strong>Abmelden</strong> oben rechts in der Kopfleiste. Deine Sitzung wird beendet
        und du wirst zur Login-Seite weitergeleitet.
      </p>
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
      <h3>Kopfleiste (Steuerungsleiste)</h3>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Element</th><th style={thStyle}>Funktion</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}><strong>FlightArc v1.4</strong></td><td style={tdStyle}>App-Name mit Version. Daneben die aktuelle Drohnen-Anzahl.</td></tr>
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
      <h3>Karten-Interaktion</h3>
      <ul>
        <li><strong>Scrollen</strong> — Zoom rein/raus</li>
        <li><strong>Ziehen</strong> — Karte verschieben</li>
        <li><strong>Rechtsklick</strong> — Koordinaten in Zwischenablage kopieren</li>
        <li><strong>Klick auf leere Fläche</strong> — Status-Panel schließen</li>
      </ul>
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
      <h3>Status-Indikatoren</h3>
      <ul>
        <li><span style={{ color: '#22c55e' }}>●</span> <strong>ACTIVE</strong> — Drohne wird aktiv empfangen</li>
        <li><span style={{ color: '#f59e0b' }}>●</span> <strong>IDLE</strong> — Letzte Meldung vor &gt;30s</li>
        <li><span style={{ color: '#ef4444' }}>●</span> <strong>ERROR</strong> — Fehlerhafte Daten</li>
        <li><span style={{ color: '#6b7280' }}>●</span> <strong>LOST</strong> — Kein Signal seit &gt;120s</li>
      </ul>
      <p>Über den <strong>← Karte</strong>-Button kehrst du zur Kartenansicht zurück.</p>
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
      <h3>Zonen-Panel öffnen</h3>
      <p>Klicke auf den <strong>📐 Zonen-Button</strong> in der Kopfleiste.</p>
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
      <h3>Drohnen-Zuweisung</h3>
      <p>
        Im Zuweisungs-Dialog kannst du Drohnen einer Zone zuordnen. Nur zugewiesene Drohnen erzeugen
        dann Verstöße in dieser Zone. Ohne Zuweisung werden alle Drohnen überwacht.
      </p>
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
      <h3>NFZ-Panel öffnen</h3>
      <p>Klicke auf den <strong>🚫 NFZ-Button</strong> in der Kopfleiste.</p>
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
      <h3>NFZ-Prüfung im Status-Panel</h3>
      <p>
        Im Status-Panel einer Drohne kannst du <strong>„NFZ prüfen"</strong> klicken, um zu prüfen,
        ob die aktuelle Position in einer Flugverbotszone liegt.
      </p>
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
      <h3>Alarmton</h3>
      <p>
        Bei neuen Verstößen wird ein Alarmton abgespielt. Dieser kann in den Einstellungen
        unter <strong>„Verstoß-Alarmton"</strong> deaktiviert werden.
      </p>
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
      <h3>Bericht erstellen</h3>
      <ol>
        <li>Klicke in der Verstoß-Tabelle auf das <strong>Bericht-Symbol</strong> neben einem Verstoß.</li>
        <li>Der Bericht wird automatisch generiert und in einer neuen Ansicht geöffnet.</li>
      </ol>
      <h3>Bericht-Ansicht</h3>
      <ul>
        <li><strong>Karte</strong> — Zeigt Zone, Flugweg (Trail), Drohnen-Position und Pilot-Position</li>
        <li><strong>Layer-Toggles</strong> — Blende einzelne Elemente ein/aus (Zone, Trail, Marker, Statistiken, NFZ)</li>
        <li><strong>Zeitlinie</strong> — Schieberegler zum Abspielen des Flugverlaufs. Geschwindigkeit: 0.5x–10x</li>
        <li><strong>Messpunkte-Tabelle</strong> — Alle aufgezeichneten Positionen mit Timestamp, Höhe, Geschwindigkeit</li>
        <li><strong>Kommentar</strong> — Freitextfeld für Notizen zum Vorfall</li>
      </ul>
      <h3>Export</h3>
      <p>
        Klicke auf <strong>„HTML-Report erstellen"</strong> um den Bericht als eigenständiges HTML-Dokument
        herunterzuladen. Dieses kann direkt im Browser geöffnet oder als PDF gedruckt werden.
      </p>
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
      <h3>Erscheinungsbild</h3>
      <p>
        Wechsle zwischen <strong>Dunklem Modus</strong> (Standard) und <strong>Hellem Modus</strong>.
        Die Karte passt sich automatisch an.
      </p>
      <h3>Verstoß-Alarmton</h3>
      <p>
        Aktiviert/deaktiviert den Alarmton bei Zonenverstößen. Standardmäßig aktiviert.
      </p>
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
      <h3>Dashboard</h3>
      <p>
        Übersicht mit Statistik-Karten: Mandanten-Anzahl (Super-Admin), Benutzer-Anzahl, aktuelle Rolle
        und Empfänger Online/Gesamt.
      </p>
      <h3>Mandanten-Verwaltung (nur Super-Admin)</h3>
      <ul>
        <li><strong>Mandant erstellen</strong> — Name und Anzeigename eingeben</li>
        <li><strong>Mandant deaktivieren/löschen</strong> — Deaktivierte Mandanten können sich nicht anmelden</li>
        <li><strong>Standard-Mandant</strong> — Kann nicht gelöscht werden</li>
      </ul>
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
      <h3>Statistik-Leiste</h3>
      <p>Am oberen Rand siehst du fünf Kennzahlen:</p>
      <ul>
        <li><strong>Gesamt</strong> — Anzahl registrierter Empfänger</li>
        <li><span style={{ color: '#22c55e' }}>●</span> <strong>Online</strong> — Letzter Heartbeat &lt;90 Sekunden</li>
        <li><span style={{ color: '#eab308' }}>●</span> <strong>Verzögert</strong> — Letzter Heartbeat 90–300 Sekunden</li>
        <li><span style={{ color: '#6b7280' }}>●</span> <strong>Offline</strong> — Kein Heartbeat seit &gt;300 Sekunden</li>
        <li><span style={{ color: '#14b8a6' }}>●</span> <strong>Erkennungen</strong> — Gesamtzahl aller Drohnen-Erkennungen</li>
      </ul>
      <h3>Empfänger erstellen</h3>
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
      <h3>Empfänger-Tabelle</h3>
      <p>
        Die Tabelle zeigt alle Empfänger mit Status-Indikator, Name, Hardware-Typ, letztem Kontakt und Erkennungen.
      </p>
      <ul>
        <li><strong>Klick auf Zeile</strong> — Erweitert die Detailansicht mit ID, Firmware, IP, WiFi (SSID + dBm), Heap, Uptime, Standort</li>
        <li><strong>„Firmware flashen"</strong> — Öffnet den Flash-Wizard</li>
        <li><strong>„API-Key regenerieren"</strong> — Erstellt einen neuen API-Key (alter wird ungültig)</li>
        <li><strong>„Deakt."</strong> — Deaktiviert den Empfänger (kann sich nicht mehr authentifizieren)</li>
        <li><strong>„Löschen"</strong> — Entfernt den Empfänger dauerhaft</li>
      </ul>
      <h3>Auto-Refresh</h3>
      <p>Die Empfänger-Liste aktualisiert sich automatisch alle 30 Sekunden.</p>
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
      <h3>Voraussetzungen</h3>
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
      <h3>Schritt 1: Empfänger in FlightArc erstellen</h3>
      <ol>
        <li>Gehe zu <strong>Administration → Empfänger</strong></li>
        <li>Klicke <strong>„+ Neuer Empfänger"</strong></li>
        <li>Gib einen aussagekräftigen Namen ein (z.B. „Feld-Nord", „Dach-Halle-3")</li>
        <li>Wähle den passenden Hardware-Typ</li>
        <li>Klicke <strong>„Erstellen"</strong></li>
        <li>Kopiere den <strong>API-Key</strong> — er wird nur einmal angezeigt!</li>
      </ol>
      <h3>Schritt 2: Flash-Wizard starten</h3>
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
        <li><strong>WiFi SSID</strong> (optional) — Wenn leer, konfigurierst du WiFi später über das Captive Portal.</li>
        <li><strong>WiFi Passwort</strong> (optional) — Passwort für das oben angegebene WiFi-Netzwerk.</li>
      </ul>
      <p>Klicke auf <strong>„Firmware bauen"</strong>. Der API-Key wird automatisch eingebettet.</p>
      <h4>Wizard: Firmware herunterladen (Schritt 3-4)</h4>
      <p>
        Nach erfolgreichem Build klicke <strong>„Firmware herunterladen (.bin)"</strong>.
      </p>
      <h3>Schritt 3: Firmware auf ESP flashen</h3>
      <InfoBox type="info">
        Verbinde das ESP-Board per USB mit deinem Computer. Stelle sicher, dass es ein Datenkabel ist
        (bei reinen Ladekabeln wird das Board nicht erkannt).
      </InfoBox>
      <h4>Option A: esptool (empfohlen)</h4>
      <div style={codeBlockStyle}>
        <code>
          # ESP32-S3:{'\n'}
          esptool.py --chip esp32s3 --port /dev/ttyUSB0 write_flash 0x0 flightarc-esp32-s3-XXXX.bin{'\n\n'}
          # ESP32-C3:{'\n'}
          esptool.py --chip esp32c3 --port /dev/ttyUSB0 write_flash 0x0 flightarc-esp32-c3-XXXX.bin{'\n\n'}
          # ESP8266:{'\n'}
          esptool.py --chip esp8266 --port /dev/ttyUSB0 write_flash 0x0 flightarc-esp8266-XXXX.bin{'\n\n'}
          # Windows: --port COM3 (o.ä.) statt /dev/ttyUSB0
        </code>
      </div>
      <h4>Option B: Web Serial (Chrome/Edge)</h4>
      <p>
        Öffne <a href="https://web.esphome.io" target="_blank" rel="noopener" style={{ color: '#14b8a6' }}>web.esphome.io</a> →
        „Install" → Wähle die heruntergeladene .bin Datei → Flash.
      </p>
      <h3>Schritt 4: Erstinbetriebnahme</h3>
      <ol>
        <li><strong>Strom anschließen</strong> — Der ESP startet und die LED blinkt schnell (Boot / WiFi-Verbindung wird versucht).</li>
        <li><strong>WiFi-Verbindung</strong> —
          <ul>
            <li>Wenn WiFi-Daten in der Firmware eingebettet: Verbindet sich automatisch. LED blinkt langsam (WiFi OK).</li>
            <li>Wenn kein WiFi konfiguriert oder das Netzwerk nicht erreichbar ist: Nach 30 Sekunden startet der ESP
              automatisch einen Hotspot <strong>„FlightArc-XXXX"</strong> (LED: Dreifach-Blinken).</li>
          </ul>
        </li>
        <li><strong>Captive Portal</strong> (bei Hotspot) — Verbinde dich mit dem Hotspot <strong>„FlightArc-XXXX"</strong>,
          ein Konfigurationsportal öffnet sich automatisch:
          <ul>
            <li>WiFi-Netzwerk auswählen oder manuell eingeben</li>
            <li>Passwort eingeben → „Verbinden" klicken</li>
            <li>Optional: GPS-Position über Browser-Geolocation setzen</li>
            <li>Der ESP verbindet sich mit dem WiFi und der <strong>Hotspot schaltet sich automatisch ab</strong></li>
          </ul>
        </li>
        <li><strong>Automatische Wiederherstellung</strong> — Falls das WiFi-Netzwerk ausfällt, startet der ESP den
          Hotspot erneut. Sobald das Netzwerk wieder da ist, verbindet er sich automatisch und der Hotspot geht aus.</li>
        <li><strong>Online</strong> — LED leuchtet dauerhaft. Der Empfänger sendet nun Heartbeats (alle 30s) und Erkennungen (alle 2s).</li>
      </ol>
      <h3>LED-Anzeige</h3>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Muster</th><th style={thStyle}>Bedeutung</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>Schnelles Blinken (100ms)</td><td style={tdStyle}>Boot — versucht sich mit WiFi zu verbinden</td></tr>
          <tr><td style={tdStyle}>Dreifach-Blinken (alle 2s)</td><td style={tdStyle}>Hotspot aktiv — wartet auf WiFi-Konfiguration über Captive Portal</td></tr>
          <tr><td style={tdStyle}>Langsames Blinken (500ms)</td><td style={tdStyle}>WiFi verbunden, warte auf Backend</td></tr>
          <tr><td style={tdStyle}>Dauerhaft an</td><td style={tdStyle}>Online — verbunden mit FlightArc Backend</td></tr>
          <tr><td style={tdStyle}>Kurzes Aufblitzen</td><td style={tdStyle}>Drohne erkannt!</td></tr>
          <tr><td style={tdStyle}>Doppelblinken</td><td style={tdStyle}>Fehler (kein WiFi oder Backend nicht erreichbar)</td></tr>
        </tbody>
      </table>
      <h3>Problembehandlung</h3>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Problem</th><th style={thStyle}>Lösung</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>ESP wird nicht erkannt</td><td style={tdStyle}>Anderes USB-Kabel versuchen (Datenkabel!). CP2102/CH340 Treiber installieren.</td></tr>
          <tr><td style={tdStyle}>Kein WiFi-Hotspot</td><td style={tdStyle}>30 Sekunden warten — der Hotspot startet erst nach dem STA-Timeout. Falls danach kein Hotspot: Board resetten (EN/RST-Taste).</td></tr>
          <tr><td style={tdStyle}>Empfänger bleibt „Offline"</td><td style={tdStyle}>Backend-URL prüfen. Firewall-Port 3020 offen? HTTP statt HTTPS bei ESP8266.</td></tr>
          <tr><td style={tdStyle}>Doppelblinken (Fehler)</td><td style={tdStyle}>WiFi-Zugangsdaten falsch? Captive Portal prüfen. Backend erreichbar?</td></tr>
          <tr><td style={tdStyle}>Keine Drohnen erkannt</td><td style={tdStyle}>Nur Drohnen mit Remote ID / ODID-Beacon werden erkannt. ESP8266 kann kein BLE.</td></tr>
          <tr><td style={tdStyle}>API-Key verloren</td><td style={tdStyle}>Unter Empfänger → Details → „API-Key regenerieren". Firmware neu flashen mit neuem Key.</td></tr>
        </tbody>
      </table>
      <h3>Vergleich der Hardware-Typen</h3>
      <table style={tableStyle}>
        <thead>
          <tr><th style={thStyle}>Feature</th><th style={thStyle}>ESP32-S3</th><th style={thStyle}>ESP32-C3</th><th style={thStyle}>ESP8266</th></tr>
        </thead>
        <tbody>
          <tr><td style={tdStyle}>BLE-Scan (ODID)</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>WiFi-Beacon (ODID)</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>HTTPS</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Ja</td><td style={tdStyle}>Nein</td></tr>
          <tr><td style={tdStyle}>RAM</td><td style={tdStyle}>~320KB</td><td style={tdStyle}>~280KB</td><td style={tdStyle}>~80KB</td></tr>
          <tr><td style={tdStyle}>Preis (ca.)</td><td style={tdStyle}>6–10€</td><td style={tdStyle}>4–7€</td><td style={tdStyle}>2–4€</td></tr>
          <tr><td style={tdStyle}>Empfehlung</td><td style={tdStyle}>Beste Wahl</td><td style={tdStyle}>Kompakt & günstig</td><td style={tdStyle}>Nur für WiFi-only</td></tr>
        </tbody>
      </table>

      <h3>Einkaufslisten</h3>
      <p>
        Hier findest du für jeden Hardware-Typ eine vollständige Einkaufsliste mit allen Komponenten,
        die du für den Aufbau eines Empfängers benötigst. Die gleiche Liste wird auch beim Erstellen
        eines Empfängers in der Admin-Oberfläche angezeigt.
      </p>

      {/* ESP32-S3 Shopping List */}
      <h4>ESP32-S3 (Empfohlen)</h4>
      <InfoBox type="info">
        Voller Funktionsumfang: BLE + WiFi Remote ID, HTTPS, viel RAM. Beste Wahl für stationäre Empfänger.
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
          <tr><td style={tdStyle}><strong>ESP32-S3-DevKitC-1 (N16R8)</strong></td><td style={tdStyle}>16 MB Flash, 8 MB PSRAM – Board mit USB-C</td><td style={tdStyle}>~8–12 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-C Kabel</td><td style={tdStyle}>Für Stromversorgung & erstes Flashen</td><td style={tdStyle}>~3 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil (5V / min. 1A)</td><td style={tdStyle}>Für Dauerbetrieb – USB-C oder Micro-USB je nach Board</td><td style={tdStyle}>~5–8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>2,4 GHz WiFi-Antenne (IPEX/U.FL)</td><td style={tdStyle}>Externe Antenne für bessere WiFi-Beacon-Reichweite</td><td style={tdStyle}>~3 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}><strong>Gehäuse (100×68×50 mm ABS IP65)</strong></td><td style={tdStyle}>Wetterfestes Gehäuse für Außenmontage</td><td style={tdStyle}>~5–10 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Kabelverschraubung M12/M16</td><td style={tdStyle}>Wasserdichte USB-Kabel-Durchführung ins Gehäuse</td><td style={tdStyle}>~2 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>Montagematerial</td><td style={tdStyle}>Kabelbinder, Schrauben, Abstandhalter für Mast/Wand-Montage</td><td style={tdStyle}>~3–5 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>Outdoor PoE-Splitter (5V)</td><td style={tdStyle}>Stromversorgung über Ethernet-Kabel (spart extra Stromkabel)</td><td style={tdStyle}>~8–12 €</td><td style={tdStyle}>Optional</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~21–35 €</strong></p>

      {/* ESP32-C3 Shopping List */}
      <h4>ESP32-C3 (Kompakt)</h4>
      <InfoBox type="info">
        BLE + WiFi Remote ID, HTTPS – mit RISC-V Kern. Günstiger und kleiner als S3, aber weniger RAM.
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
          <tr><td style={tdStyle}><strong>ESP32-C3-DevKitM-1</strong></td><td style={tdStyle}>RISC-V Board mit BLE 5.0 + WiFi – USB-C</td><td style={tdStyle}>~5–8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-C Kabel</td><td style={tdStyle}>Für Stromversorgung & erstes Flashen</td><td style={tdStyle}>~3 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil (5V / min. 500mA)</td><td style={tdStyle}>Für Dauerbetrieb – geringerer Stromverbrauch als S3</td><td style={tdStyle}>~5–8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>2,4 GHz WiFi-Antenne (IPEX/U.FL)</td><td style={tdStyle}>Externe Antenne für bessere Reichweite</td><td style={tdStyle}>~3 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}><strong>Gehäuse (83×58×33 mm ABS IP65)</strong></td><td style={tdStyle}>Kompaktes wetterfestes Gehäuse</td><td style={tdStyle}>~4–8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Kabelverschraubung M12</td><td style={tdStyle}>Wasserdichte Kabel-Durchführung</td><td style={tdStyle}>~2 €</td><td style={tdStyle}>Optional</td></tr>
          <tr><td style={tdStyle}>Montagematerial</td><td style={tdStyle}>Kabelbinder, Schrauben für Befestigung</td><td style={tdStyle}>~3–5 €</td><td style={tdStyle}>Optional</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~17–27 €</strong></p>

      {/* ESP8266 Shopping List */}
      <h4>ESP8266 / NodeMCU (Budget)</h4>
      <InfoBox type="warning">
        Nur WiFi-Beacon ODID – kein BLE, kein HTTPS. Geeignet als günstige Ergänzung an Standorten mit bekanntem WiFi-Beacon-Verkehr.
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
          <tr><td style={tdStyle}><strong>NodeMCU v2/v3 (ESP8266)</strong></td><td style={tdStyle}>ESP-12E Board mit Micro-USB</td><td style={tdStyle}>~3–5 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Micro-USB Kabel</td><td style={tdStyle}>Für Stromversorgung & erstes Flashen</td><td style={tdStyle}>~2 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>USB-Netzteil (5V / min. 500mA)</td><td style={tdStyle}>Für Dauerbetrieb</td><td style={tdStyle}>~5–8 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}><strong>Gehäuse (70×45×30 mm ABS)</strong></td><td style={tdStyle}>Kleines Gehäuse – NodeMCU passt in Standard-Projektboxen</td><td style={tdStyle}>~3–5 €</td><td style={tdStyle}>Ja</td></tr>
          <tr><td style={tdStyle}>Montagematerial</td><td style={tdStyle}>Kabelbinder oder doppelseitiges Klebeband</td><td style={tdStyle}>~2–3 €</td><td style={tdStyle}>Optional</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Geschätzte Gesamtkosten (Pflichtteile): <strong>~13–20 €</strong></p>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 16 }}>
        Preise sind Richtwerte (Stand 2026). Bezugsquellen: AliExpress, Amazon, Berrybase, Mouser.
        Die Einkaufslisten werden auch beim Erstellen eines Empfängers in der Admin-Oberfläche angezeigt.
      </p>
    </div>
  );
}

function SectionTips() {
  return (
    <div>
      <h2>Tipps & Tricks</h2>
      <h3>Performance</h3>
      <ul>
        <li>Bei vielen Drohnen (&gt;100) die Aktualisierungsrate auf 5s oder 10s erhöhen</li>
        <li>Radius-Filter nutzen um nur relevante Drohnen zu laden</li>
        <li>Höhenfilter nutzen um nur bestimmte Höhenzonen anzuzeigen</li>
        <li>Nicht benötigte Datenquellen deaktivieren</li>
      </ul>
      <h3>Empfänger-Platzierung</h3>
      <ul>
        <li>So hoch wie möglich platzieren (Dach, Mast) für beste Reichweite</li>
        <li>Freie Sichtlinie in alle Richtungen</li>
        <li>ESP32-S3 bevorzugen für BLE + WiFi Abdeckung</li>
        <li>Mehrere Empfänger: Stärkste Signalstärke (RSSI) wird automatisch priorisiert</li>
        <li>Wetterschutz (IP65-Gehäuse) für Außenmontage</li>
      </ul>
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
      <h3>Browser-Empfehlung</h3>
      <p>
        Chrome oder Edge für beste Kompatibilität (insb. Web Serial für ESP-Flash).
        Firefox funktioniert für alle Features außer Web Serial.
      </p>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────

function InfoBox({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  const colors = type === 'info'
    ? { bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', text: '#60a5fa' }
    : { bg: 'rgba(234,179,8,0.1)', border: '#eab308', text: '#eab308' };
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: '12px 16px', margin: '12px 0',
      fontSize: 13, color: colors.text, lineHeight: 1.6,
    }}>
      {type === 'info' ? 'ℹ ' : '⚠ '}{children}
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

const codeBlockStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace',
  overflowX: 'auto', margin: '12px 0', whiteSpace: 'pre', lineHeight: 1.6,
  color: 'var(--text-secondary)',
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
  hardware: SectionHardware,
  tips: SectionTips,
};

// ─── Main Component ──────────────────────────────────────

export default function HelpPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [active, setActive] = useState<Section>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const _ = theme; // ensure re-render on theme change

  const filteredSections = searchTerm
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : SECTIONS;

  const Content = SECTION_CONTENT[active];

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      {/* Sidebar */}
      <nav style={{
        width: 260, background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={() => navigate('/')} style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13,
            }}>← Karte</button>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Hilfe</span>
          </div>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Suche..."
            style={{
              width: '100%', padding: '6px 10px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {/* Nav items */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {filteredSections.map(s => (
            <button
              key={s.id}
              onClick={() => { setActive(s.id); setSearchTerm(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 16px', border: 'none',
                background: active === s.id ? 'rgba(20,184,166,0.1)' : 'transparent',
                color: active === s.id ? '#14b8a6' : 'var(--text-secondary)',
                fontWeight: active === s.id ? 600 : 400,
                borderLeft: active === s.id ? '3px solid #14b8a6' : '3px solid transparent',
                cursor: 'pointer', fontSize: 13, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              {s.title}
            </button>
          ))}
        </div>
        <div style={{
          padding: 12, borderTop: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
        }}>
          FlightArc v1.4 — Benutzerhandbuch
        </div>
      </nav>

      {/* Content */}
      <main style={{
        flex: 1, overflow: 'auto', padding: '24px 40px',
        maxWidth: 800, lineHeight: 1.7, fontSize: 14,
      }}>
        <Content />
      </main>
    </div>
  );
}
