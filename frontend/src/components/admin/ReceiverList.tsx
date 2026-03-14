import { useState, useEffect, useCallback } from 'react';
import {
  fetchReceivers,
  createReceiver,
  updateReceiver,
  deleteReceiver,
  fetchReceiverStats,
  downloadFirmware,
  fetchConnectionLog,
  toggleConnectionLog,
  clearConnectionLog,
} from '../../api';
import type { ReceiverNode, ReceiverStats, ConnectionLogEntry } from '../../api';
import ReceiverFlashWizard from './ReceiverFlashWizard';

const HARDWARE_TYPES = [
  { value: 'esp32-s3', label: 'ESP32-S3', desc: 'BLE + WiFi ODID, HTTPS | DIO 8MB', recommended: true },
  { value: 'esp32-c3', label: 'ESP32-C3', desc: 'BLE + WiFi ODID, HTTPS | QIO 4MB' },
  { value: 'esp8266', label: 'ESP8266', desc: 'Nur WiFi-Beacon ODID, kein BLE, kein HTTPS', limited: true },
];

interface ShoppingItem {
  name: string;
  desc: string;
  link?: string;
  price?: string;
  required: boolean;
  group?: string; // Items with same group belong together (e.g. "controller-set")
}

const SHOPPING_LISTS: Record<string, { title: string; note: string; items: ShoppingItem[] }> = {
  'esp32-s3': {
    title: 'ESP32-S3 (Empfohlen)',
    note: 'Voller Funktionsumfang: BLE + WiFi Remote ID (inkl. NAN/DJI), HTTPS, Dual-Core, viel RAM. Beste Wahl für stationäre Empfänger. Das empfohlene Board hat einen IPEX-Anschluss und kommt mit externer 2,4 GHz Antenne — wichtig für Outdoor-Gehäuse und maximale Reichweite.',
    items: [
      { name: 'ESP32-S3-DevKitC-1 N16R8 mit IPEX + Antenne', desc: 'Heemol Board: 16 MB Flash, 8 MB PSRAM, WiFi + BLE 5.0, USB-C, Dual-Core 240 MHz. Mit IPEX-Anschluss + 2,4 GHz Antenne im Lieferumfang. Pin-Headers vorgelötet.', price: '~15 €', required: true, group: 'controller-set',
        link: 'https://www.amazon.de/Heemol-DevKitC-1-Entwicklung-Bluetooth-Anschlie%C3%9Fbare/dp/B0FKFXC6F8' },
      { name: 'GPIO Breakout Board für ESP32-S3', desc: 'Steckboden mit Montagelöchern — ESP32 einstecken, im Gehäuse verschrauben. Kein Löten, kein Breadboard. 5V/3.3V Ausgänge, GPIO-Status-LEDs.', price: '~12 €', required: true, group: 'controller-set',
        link: 'https://www.amazon.de/Meshnology-Erweiterungsboard-Kunststoffdichtungen-Steckdosen-N40/dp/B0FLK4MDDW' },
      { name: 'USB-A auf USB-C Kabel (1m)', desc: 'Datenkabel (nicht nur Lade!) für Flashen und Stromversorgung.', price: '~7 €', required: true,
        link: 'https://www.amazon.de/1-m-langes-usb-c-kabel-usb-a-auf-usb-c-von-amazon/dp/B07Q5JW4J3' },
      { name: 'USB-Netzteil 5V/2A (USB-C)', desc: 'Steckernetzteil für Dauerbetrieb. 5V, min. 1A (2A empfohlen).', price: '~8 €', required: true,
        link: 'https://www.amazon.de/Bouge-Universal-Ladeger%C3%A4t-Kompatibilit%C3%A4t-Blackview/dp/B0C2Q5LK11' },
      { name: 'ABS-Gehäuse IP65 (100×68×50 mm)', desc: 'Wasserdichtes Elektronik-Gehäuse für Außenmontage. Board + Breakout passen zusammen hinein. Antenne durch Kabelverschraubung nach außen führen.', price: '~7 €', required: true,
        link: 'https://www.amazon.de/Elektronische-Wasserdichte-Industriegeh%C3%A4use-Anschlussdose-Verteilerdose/dp/B0DDWR9LP3' },
      { name: 'Kabelverschraubung M16 IP68 (5er-Pack)', desc: 'Wasserdichte Kabel-Durchführung für USB-Kabel und Antennenkabel ins Gehäuse. M16×1,5, 4-8 mm Kabeldurchmesser.', price: '~7 €', required: false,
        link: 'https://www.amazon.de/Kabelverschraubung-M16-Hanibos-Kabeldurchf%C3%BChrung-Kabelverschraubungen/dp/B0BXRVX368' },
      { name: 'PoE-Splitter 5V USB-C (IEEE 802.3af)', desc: 'Stromversorgung über Ethernet-Kabel. Spart extra Stromkabel bei Outdoor-Installation.', price: '~15 €', required: false,
        link: 'https://www.amazon.de/UCTRONICS-PoE-Splitter-USB-C-USB-C-Adapter-Sicherheitskameras/dp/B087F4QCTR' },
    ],
  },
  'esp32-c3': {
    title: 'ESP32-C3 (Kompakt)',
    note: 'BLE + WiFi Remote ID, HTTPS – mit RISC-V Kern. Günstiger und kleiner als S3, aber weniger RAM. Board kommt mit vorgelöteten Pin-Headers. Hinweis: Der kompakte C3-DevKitM-1 (30 Pins) passt in keinen Standard-Steckboden — Befestigung im Gehäuse mit Abstandshaltern und Klebepads.',
    items: [
      { name: 'ESP32-C3-DevKitM-1 (vorgelötet)', desc: 'DollaTek Board, 4 MB Flash, WiFi + BLE 5.0, Dual USB-C, RISC-V 160 MHz. Pin-Headers vorgelötet. Kompaktes Format (54×25 mm).', price: '~9 €', required: true,
        link: 'https://www.amazon.de/DollaTek-ESP32-C3-Bluetooth-Development-ESP32-C3-DevKitM-1/dp/B0BVQP3XPJ' },
      { name: 'USB-A auf USB-C Kabel (1m)', desc: 'Datenkabel für Flashen und Stromversorgung.', price: '~7 €', required: true,
        link: 'https://www.amazon.de/1-m-langes-usb-c-kabel-usb-a-auf-usb-c-von-amazon/dp/B07Q5JW4J3' },
      { name: 'USB-Netzteil 5V/2A (USB-A)', desc: 'Steckernetzteil für Dauerbetrieb. Geringerer Verbrauch als S3.', price: '~7 €', required: true,
        link: 'https://www.amazon.de/Ladeger%C3%A4t-Netzstecker-Steckdosenadapter-Ladestecker-Tischleuchte/dp/B0DNMKG9C3' },
      { name: 'ABS-Gehäuse IP65 (83×58×34 mm)', desc: 'Kompaktes wasserdichtes Gehäuse. Der kleine C3-DevKitM-1 passt problemlos hinein.', price: '~5 €', required: true,
        link: 'https://www.amazon.de/Robustes-ABS-Elektronik-Projektbox-wasserdichtes-Abzweiggeh%C3%A4use-Gr%C3%B6%C3%9Fenoptionen/dp/B0DL9MG241' },
      { name: 'Nylon Abstandshalter M3 Set (260-tlg.)', desc: 'M3 Standoffs + Schrauben zur Befestigung der Platine im Gehäuse. Board mit Abstandshaltern positionieren und mit Klebepads fixieren.', price: '~8 €', required: false,
        link: 'https://www.amazon.de/Schrauben-Abstandshalter-Schraubenmutter-Distanzh%C3%BClsen-Reparatur/dp/B0B2S6JLX4' },
      { name: '2,4 GHz WiFi-Antenne 3dBi (IPEX/U.FL)', desc: 'Externe Antenne. Optional da C3-MINI-1 bereits PCB-Antenne hat.', price: '~6 €', required: false,
        link: 'https://www.amazon.de/Bluetooth-Antenne-2-4GHz-geeignet-ESP8266/dp/B0CTG8XJSN' },
      { name: 'Kabelverschraubung M16 IP68 (5er-Pack)', desc: 'Wasserdichte Kabel-Durchführung für USB-Kabel ins Gehäuse.', price: '~7 €', required: false,
        link: 'https://www.amazon.de/Kabelverschraubung-M16-Hanibos-Kabeldurchf%C3%BChrung-Kabelverschraubungen/dp/B0BXRVX368' },
    ],
  },
  'esp8266': {
    title: 'ESP8266 / NodeMCU (Budget)',
    note: 'Nur WiFi-Beacon ODID – kein BLE, kein HTTPS. NodeMCU kommt immer mit vorgelöteten Pin-Headers. Wichtig: NodeMCU Lolin V3 ist die breite Variante (28mm Pin-Abstand) — nur kompatible Base Boards verwenden!',
    items: [
      { name: 'AZDelivery NodeMCU Lolin V3 (vorgelötet)', desc: 'ESP-12F Board mit CH340G, Micro-USB, WiFi 2,4 GHz. Pin-Headers vorgelötet, inkl. E-Book. Breite Variante (28mm Pin-Abstand).', price: '~7 €', required: true, group: 'controller-set',
        link: 'https://www.amazon.de/AZDelivery-NodeMCU-Lolin-WiFi-Parent/dp/B07Z5C3KQF' },
      { name: 'Base Board für NodeMCU V3 Wide (28mm)', desc: 'DUBEUYEW Base Board — bestätigt kompatibel mit breiter NodeMCU V3 (28mm Pin-Abstand). DC-Buchse 6–24V, 5V/3.3V Ausgänge, GPIO-Verdopplung, Montagelöcher (60×60mm).', price: '~9 €', required: true, group: 'controller-set',
        link: 'https://www.amazon.de/dp/B0D1KCYG3W' },
      { name: 'Micro-USB Kabel (1m)', desc: 'Datenkabel für Flashen und Stromversorgung. Auf Datenkabel achten!', price: '~5 €', required: true,
        link: 'https://www.amazon.de/KabelDirekt-Micro-Ladekabel-Datenkabel-schwarz/dp/B00L5G2IR6' },
      { name: 'USB-Netzteil 5V/2A (3er-Pack)', desc: 'Steckernetzteil mit USB-A Ausgang. 3er-Pack praktisch für mehrere Nodes.', price: '~9 €', required: true,
        link: 'https://www.amazon.de/Ladeger%C3%A4t-Netzstecker-Smartphones-Spielzeug-Spielkonsole-wei%C3%9F/dp/B0CM9G39DW' },
      { name: 'ABS-Gehäuse IP65 (100×68×50 mm)', desc: 'Wasserdichtes Elektronik-Gehäuse. Passt NodeMCU + Base Board (60×60mm) mit etwas Luft.', price: '~7 €', required: true,
        link: 'https://www.amazon.de/Elektronische-Wasserdichte-Industriegeh%C3%A4use-Anschlussdose-Verteilerdose/dp/B0DDWR9LP3' },
    ],
  },
};

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  stale: '#eab308',
  offline: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  stale: 'Verzögert',
  offline: 'Offline',
};

function timeAgo(epoch: number | null): string {
  if (!epoch) return 'Nie';
  const seconds = Math.floor(Date.now() / 1000 - epoch);
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return '-';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function ConnectionLogViewer({ entries, receiverFilter, onClear, onClose, receivers, onFilterChange }: {
  entries: ConnectionLogEntry[];
  receiverFilter: string | null;
  onClear: () => void;
  onClose: () => void;
  receivers: ReceiverNode[];
  onFilterChange: (id: string | null) => void;
}) {
  return (
    <div data-testid="connection-log" style={{
      background: '#0d1117', border: '1px solid #30363d',
      borderRadius: 10, marginBottom: 20, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid #30363d', flexWrap: 'wrap',
      }}>
        <span style={{ color: '#3fb950', fontWeight: 700, fontSize: 13 }}>Connection Log</span>
        <select
          data-testid="log-filter"
          value={receiverFilter || ''}
          onChange={e => onFilterChange(e.target.value || null)}
          style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
            color: '#c9d1d9', fontSize: 11, padding: '3px 8px',
          }}
        >
          <option value="">Alle Empfänger</option>
          {receivers.map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
          ))}
        </select>
        <span style={{ color: '#8b949e', fontSize: 11, marginLeft: 'auto' }}>
          {entries.length} Einträge
        </span>
        <button onClick={onClear} style={{
          background: 'none', border: '1px solid #30363d', borderRadius: 4,
          color: '#8b949e', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
        }}>Leeren</button>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#8b949e',
          fontSize: 16, cursor: 'pointer', padding: '0 4px',
        }}>x</button>
      </div>

      {/* Log entries */}
      <div style={{
        maxHeight: 300, overflow: 'auto', padding: '4px 0',
        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
      }}>
        {entries.length === 0 ? (
          <div style={{ color: '#8b949e', padding: '20px', textAlign: 'center' }}>
            Noch keine Einträge. Warte auf Empfänger-Kommunikation...
          </div>
        ) : entries.map((e, i) => {
          const time = new Date(e.timestamp * 1000).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const isError = e.http_status >= 400;
          const isHeartbeat = e.endpoint === '/heartbeat';
          const isIngest = e.endpoint === '/ingest';
          return (
            <div key={i} style={{
              padding: '2px 14px',
              color: isError ? '#f85149' : isIngest ? '#3fb950' : isHeartbeat ? '#58a6ff' : '#c9d1d9',
              borderBottom: '1px solid rgba(48,54,61,0.3)',
            }}>
              <span style={{ color: '#8b949e' }}>{time}</span>
              {' '}
              <span style={{
                display: 'inline-block', width: 28, textAlign: 'center',
                background: isError ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.1)',
                borderRadius: 3, fontSize: 10, fontWeight: 600,
                color: isError ? '#f85149' : '#3fb950',
              }}>{e.http_status}</span>
              {' '}
              <span style={{ color: '#d2a8ff', fontWeight: 500 }}>{e.endpoint}</span>
              {' '}
              {e.receiver_name
                ? <span style={{ color: '#79c0ff' }}>[{e.receiver_name}]</span>
                : e.receiver_id
                  ? <span style={{ color: '#79c0ff' }}>[{e.receiver_id}]</span>
                  : <span style={{ color: '#f85149' }}>[unbekannt]</span>
              }
              {e.detections_count != null && (
                <span style={{ color: '#3fb950' }}> {e.detections_count} Drohnen</span>
              )}
              {e.error && (
                <span style={{ color: '#f85149' }}> {e.error}</span>
              )}
              {isHeartbeat && e.wifi_ssid && (
                <span style={{ color: '#8b949e' }}>
                  {' '}WiFi:{e.wifi_ssid} {e.wifi_rssi != null && `(${e.wifi_rssi}dBm)`}
                  {e.free_heap != null && ` Heap:${(e.free_heap / 1024).toFixed(0)}KB`}
                  {e.firmware_version && ` FW:${e.firmware_version}`}
                </span>
              )}
              {e.ip && <span style={{ color: '#484f58' }}> {e.ip}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReceiverList() {
  const [receivers, setReceivers] = useState<ReceiverNode[]>([]);
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('esp32-s3');
  const [creating, setCreating] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Shopping list toggle
  const [showShopping, setShowShopping] = useState(false);

  // Flash wizard
  const [flashNode, setFlashNode] = useState<ReceiverNode | null>(null);
  const [flashRegenKey, setFlashRegenKey] = useState(false);

  // Connection log
  const [logEnabled, setLogEnabled] = useState(false);
  const [logEntries, setLogEntries] = useState<ConnectionLogEntry[]>([]);
  const [logReceiverId, setLogReceiverId] = useState<string | null>(null); // null = all
  const [showLog, setShowLog] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([fetchReceivers(), fetchReceiverStats()]);
      setReceivers(r);
      setStats(s);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLog = useCallback(async (receiverId?: string | null) => {
    try {
      const res = await fetchConnectionLog(receiverId || undefined);
      setLogEnabled(res.enabled);
      setLogEntries(res.entries);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadData();
    loadLog();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData, loadLog]);

  // Poll log when visible and enabled
  useEffect(() => {
    if (!showLog || !logEnabled) return;
    const interval = setInterval(() => loadLog(logReceiverId), 3000);
    return () => clearInterval(interval);
  }, [showLog, logEnabled, logReceiverId, loadLog]);

  const handleToggleLog = async () => {
    try {
      const res = await toggleConnectionLog(!logEnabled);
      setLogEnabled(res.enabled);
      if (res.enabled) {
        setShowLog(true);
        loadLog(logReceiverId);
      }
    } catch { /* silent */ }
  };

  const handleClearLog = async () => {
    try {
      await clearConnectionLog();
      setLogEntries([]);
    } catch { /* silent */ }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createReceiver({ name: newName.trim(), hardware_type: newType });
      setNewName('');
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (node: ReceiverNode) => {
    try {
      await updateReceiver(node.id, { is_active: !node.isActive });
      await loadData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReceiver(id);
      await loadData();
    } catch { /* silent */ }
  };


  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Laden...</div>;
  }

  return (
    <div data-testid="receiver-list">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Empfänger</h1>
        <button
          data-testid="receiver-create-btn"
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Neuer Empfänger
        </button>
        <button
          data-testid="connection-log-toggle"
          onClick={handleToggleLog}
          style={{
            padding: '8px 16px',
            background: logEnabled ? '#22c55e' : 'var(--bg-tertiary)',
            color: logEnabled ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${logEnabled ? '#22c55e' : 'var(--border)'}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {logEnabled ? 'Log aktiv' : 'Log aus'}
        </button>
        {logEnabled && (
          <button
            onClick={() => { setLogReceiverId(null); setShowLog(!showLog); if (!showLog) loadLog(null); }}
            style={{
              padding: '8px 16px',
              background: showLog ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: showLog ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${showLog ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {showLog ? 'Log ausblenden' : 'Log anzeigen'}
          </button>
        )}
      </div>

      {/* Connection Log Viewer */}
      {showLog && logEnabled && (
        <ConnectionLogViewer
          entries={logEntries}
          receiverFilter={logReceiverId}
          onClear={handleClearLog}
          onClose={() => setShowLog(false)}
          receivers={receivers}
          onFilterChange={(id) => { setLogReceiverId(id); loadLog(id); }}
        />
      )}

      {/* Stats */}
      {stats && (
        <div data-testid="receiver-stats" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Gesamt', value: stats.total, color: 'var(--text-primary)', tid: 'stat-total' },
            { label: 'Online', value: stats.online, color: '#22c55e', tid: 'stat-online' },
            { label: 'Verzögert', value: stats.stale, color: '#eab308', tid: 'stat-stale' },
            { label: 'Offline', value: stats.offline, color: '#6b7280', tid: 'stat-offline' },
            { label: 'Erkennungen', value: stats.totalDetections, color: '#14b8a6', tid: 'stat-detections' },
          ].map(s => (
            <div key={s.label} data-testid={s.tid} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 16px',
              minWidth: 90,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid var(--status-error)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--status-error)',
        }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div data-testid="receiver-create-form" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Neuen Empfänger erstellen</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                data-testid="receiver-name-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="z.B. Empfänger Dach-Nord"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hardware-Typ</label>
              <select
                data-testid="receiver-type-select"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {HARDWARE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}{t.recommended ? ' ★ Empfohlen' : ''}{t.limited ? ' (eingeschränkt)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              data-testid="receiver-submit-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating || !newName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Erstellen...' : 'Erstellen'}
            </button>
          </div>
          {newType === 'esp8266' && (
            <div data-testid="esp8266-warning" style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(234,179,8,0.1)',
              border: '1px solid #eab308',
              borderRadius: 6,
              fontSize: 12,
              color: '#eab308',
            }}>
              ESP8266 ist eine Light-Variante: Kein BLE (nur WiFi-Beacon ODID), kein HTTPS, eingeschränkter RAM.
            </div>
          )}

          {/* Shopping list */}
          {SHOPPING_LISTS[newType] && (
            <div data-testid="shopping-list-section" style={{ marginTop: 12 }}>
              <button
                data-testid="shopping-list-toggle"
                onClick={() => setShowShopping(!showShopping)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ transform: showShopping ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                Einkaufsliste: {SHOPPING_LISTS[newType].title}
              </button>
              {showShopping && (
                <div data-testid="shopping-list-content" style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    {SHOPPING_LISTS[newType].note}
                  </div>

                  <table data-testid="shopping-list-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Komponente</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Beschreibung</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ca. Preis</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pflicht</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SHOPPING_LISTS[newType].items.map((item, i, arr) => {
                        const isGroupStart = item.group && (i === 0 || arr[i - 1].group !== item.group);
                        const isInGroup = !!item.group;
                        const groupSize = item.group ? arr.filter(x => x.group === item.group).length : 0;
                        return (
                        <tr key={i} style={{
                          borderBottom: '1px solid var(--border)',
                          borderLeft: isInGroup ? '3px solid #3b82f6' : 'none',
                          background: isInGroup ? 'rgba(59,130,246,0.04)' : 'transparent',
                        }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span>{item.name}</span>
                              {item.link && (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`shopping-link-${i}`}
                                  style={{
                                    display: 'inline-block',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    background: 'rgba(20,184,166,0.15)',
                                    color: '#14b8a6',
                                    textDecoration: 'none',
                                  }}
                                >
                                  Amazon &#8599;
                                </a>
                              )}
                              {isGroupStart && groupSize > 1 && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '1px 7px',
                                  borderRadius: 4,
                                  fontSize: 9,
                                  fontWeight: 600,
                                  background: 'rgba(59,130,246,0.15)',
                                  color: '#3b82f6',
                                  whiteSpace: 'nowrap',
                                }}>
                                  &#x1F517; {groupSize} Teile = 1 Set
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                            {item.desc}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {item.price || '-'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              background: item.required ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                              color: item.required ? '#22c55e' : '#6b7280',
                            }}>
                              {item.required ? 'Ja' : 'Optional'}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Total estimate */}
                  <div style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    background: 'rgba(20,184,166,0.08)',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Geschätzte Gesamtkosten (Pflichtteile):
                    </span>
                    <span data-testid="shopping-list-total" style={{ fontWeight: 700, color: '#14b8a6' }}>
                      {newType === 'esp32-s3' ? '~49 € (mit Antenne)' : newType === 'esp32-c3' ? '~28 €' : '~37 €'}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Preise sind Richtwerte (Stand 2026). Bezugsquellen: AliExpress, Amazon, Berrybase, Mouser.
                  </div>

                  {/* Best choice recommendation */}
                  <div data-testid="shopping-recommendation" style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    lineHeight: 1.5,
                    background: newType === 'esp32-s3'
                      ? 'rgba(34,197,94,0.1)'
                      : newType === 'esp32-c3'
                        ? 'rgba(59,130,246,0.1)'
                        : 'rgba(234,179,8,0.1)',
                    border: `1px solid ${newType === 'esp32-s3' ? '#22c55e' : newType === 'esp32-c3' ? '#3b82f6' : '#eab308'}`,
                    color: newType === 'esp32-s3' ? '#22c55e' : newType === 'esp32-c3' ? '#3b82f6' : '#eab308',
                  }}>
                    {newType === 'esp32-s3' && (
                      <>
                        <strong>★ Beste Wahl für dieses Projekt.</strong> Das empfohlene Board kommt mit IPEX-Anschluss und externer 2,4 GHz Antenne
                        für maximale Reichweite (~500-1000m). BLE + WiFi NAN (DJI u.a.), HTTPS, Dual-Core,
                        WiFi-Hotspot für Konfiguration, automatische WLAN-Einwahl und Internet-Übermittlung an FlightArc.
                      </>
                    )}
                    {newType === 'esp32-c3' && (
                      <>
                        <strong>Kompakteste Variante.</strong> Der ESP32-C3 bietet BLE + WiFi und HTTPS, ist aber deutlich kleiner und günstiger.
                        Kein passender Steckboden verfügbar — Befestigung im Gehäuse mit Abstandshaltern/Klebepads. Etwas weniger RAM als der S3.
                      </>
                    )}
                    {newType === 'esp8266' && (
                      <>
                        <strong>Nur für Spezialfälle.</strong> Der ESP8266 erkennt nur WiFi-Beacon ODID — kein BLE, kein HTTPS.
                        Nur sinnvoll als Budget-Ergänzung an Standorten, wo bekannt WiFi-Beacon-Drohnen fliegen.
                        Für den vollen Funktionsumfang wird <strong>ESP32-S3</strong> empfohlen.
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Receiver table */}
      {receivers.length === 0 ? (
        <div data-testid="receiver-empty" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 32,
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: 14,
        }}>
          Noch keine Empfänger erstellt.
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <table data-testid="receiver-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Name</th>
                <th style={thStyle}>Typ</th>
                <th style={thStyle}>Letzter Kontakt</th>
                <th style={thStyle}>Erkennungen</th>
                <th style={thStyle}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {receivers.map(node => (
                <>
                  <tr
                    key={node.id}
                    data-testid={`receiver-row-${node.id}`}
                    onClick={() => setExpandedId(expandedId === node.id ? null : node.id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: expandedId === node.id ? 'rgba(59,130,246,0.05)' : 'transparent',
                      opacity: node.isActive ? 1 : 0.5,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span data-testid={`receiver-status-${node.id}`} style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLORS[node.status],
                        boxShadow: node.status === 'online' ? `0 0 6px ${STATUS_COLORS.online}` : 'none',
                      }} />
                      <div data-testid={`receiver-status-label-${node.id}`} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {STATUS_LABELS[node.status]}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {node.name}
                      {!node.isActive && (
                        <span style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444',
                          marginLeft: 8,
                        }}>
                          Deaktiviert
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ fontSize: 12 }}>{node.hardwareType.toUpperCase()}</span>
                      {node.hardwareType === 'esp8266' && (
                        <span style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234,179,8,0.15)',
                          color: '#eab308',
                          marginLeft: 4,
                        }}>
                          Light
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12 }}>
                      {timeAgo(node.lastHeartbeat)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ color: '#14b8a6', fontWeight: 600 }}>{node.totalDetections}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <button
                          data-testid={`receiver-toggle-${node.id}`}
                          onClick={() => handleToggleActive(node)}
                          title={node.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          style={actionBtnStyle}
                        >
                          {node.isActive ? 'Deakt.' : 'Akt.'}
                        </button>
                        <button
                          data-testid={`receiver-delete-${node.id}`}
                          onClick={() => handleDelete(node.id)}
                          title="Löschen"
                          style={{ ...actionBtnStyle, color: '#ef4444' }}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === node.id && (
                    <tr key={`${node.id}-detail`} data-testid={`receiver-detail-${node.id}`}>
                      <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--bg-primary)' }}>
                        <div data-testid={`receiver-detail-grid-${node.id}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 12 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>ID:</span> <code style={{ fontSize: 11 }}>{node.id}</code></div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Firmware:</span> {node.firmwareVersion || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>IP:</span> {node.lastIp || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>WiFi:</span> {node.wifiSsid || '-'} {node.wifiRssi != null && `(${node.wifiRssi} dBm)`}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Heap:</span> {node.freeHeap != null ? `${(node.freeHeap / 1024).toFixed(0)} KB` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Uptime:</span> {formatUptime(node.uptimeSeconds)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Standort:</span> {node.lastLatitude != null ? `${node.lastLatitude.toFixed(5)}, ${node.lastLongitude?.toFixed(5)}` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Seit Boot:</span> {node.detectionsSinceBoot}</div>
                        </div>
                        {/* Firmware build info */}
                        {node.lastBuildAt && (
                          <div style={{
                            marginTop: 10, padding: '8px 10px',
                            background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)',
                            borderRadius: 6, fontSize: 11, display: 'flex', gap: 12, alignItems: 'center',
                            flexWrap: 'wrap',
                          }}>
                            <span style={{ color: '#14b8a6', fontWeight: 600 }}>Letzter Build:</span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {new Date(node.lastBuildAt * 1000).toLocaleString('de-DE')}
                            </span>
                            {node.lastBuildSize && (
                              <span style={{ color: 'var(--text-muted)' }}>
                                {(node.lastBuildSize / 1024).toFixed(0)} KB
                              </span>
                            )}
                            {node.lastBuildSha256 && (
                              <code style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                SHA: {node.lastBuildSha256.slice(0, 12)}...
                              </code>
                            )}
                          </div>
                        )}
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {node.lastBuildAt && (
                            <button
                              data-testid={`receiver-download-${node.id}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const blob = await downloadFirmware(node.id);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `flightarc-${node.hardwareType}-${node.id}.bin`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch { /* silent */ }
                              }}
                              style={{
                                padding: '5px 12px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid #14b8a6',
                                borderRadius: 6,
                                color: '#14b8a6',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              Firmware herunterladen
                            </button>
                          )}
                          <button
                            data-testid={`receiver-build-${node.id}`}
                            onClick={() => { setFlashRegenKey(!!node.lastBuildAt); setFlashNode(node); }}
                            style={{
                              padding: '5px 12px',
                              background: '#14b8a6',
                              border: 'none',
                              borderRadius: 6,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {node.lastBuildAt ? 'Neu bauen (neuer Key)' : 'Firmware bauen'}
                          </button>
                          {logEnabled && (
                            <button
                              data-testid={`receiver-log-${node.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogReceiverId(node.id);
                                setShowLog(true);
                                loadLog(node.id);
                              }}
                              style={{
                                padding: '5px 12px',
                                background: logReceiverId === node.id && showLog ? '#eab308' : 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: logReceiverId === node.id && showLog ? '#fff' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: 11,
                              }}
                            >
                              Kommunikations-Log
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flash Wizard Modal */}
      {flashNode && (
        <ReceiverFlashWizard
          node={flashNode}
          regenerateKey={flashRegenKey}
          onClose={() => { setFlashNode(null); setFlashRegenKey(false); loadData(); }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  textAlign: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
};
