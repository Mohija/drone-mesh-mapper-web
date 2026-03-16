import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  setReceiverLocation,
  triggerOtaUpdate,
  cancelOtaUpdate,
  startBuildAsync,
  pollBuildStatus,
  updateReceiverCoverage,
  fetchFirmwareChangelog,
} from '../../api';
import type { ReceiverNode, ReceiverStats, ConnectionLogEntry, FirmwareChangelogEntry } from '../../api';
import ReceiverFlashWizard from './ReceiverFlashWizard';
import AdminTooltip from './AdminTooltip';
import { useIsMobile } from '../../useIsMobile';

function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

const HARDWARE_TYPES = [
  { value: 'esp32-s3', label: 'ESP32-S3', desc: 'BLE + WiFi ODID, HTTPS | DIO 8MB', recommended: true },
  { value: 'esp32-c3', label: 'ESP32-C3', desc: 'BLE + WiFi ODID, HTTPS | QIO 4MB' },
  { value: 'esp8266', label: 'ESP8266', desc: 'Nur WiFi-Beacon ODID, kein BLE, kein HTTPS', limited: true },
];

const ANTENNA_PRESETS = [
  { value: 'pcb', label: 'PCB-Antenne (eingebaut)', defaultRadius: 1000 },
  { value: 'dipole_5dbi', label: 'Externe Dipol 5dBi', defaultRadius: 2000 },
  { value: 'omni_9dbi', label: 'Externe Omni 9dBi', defaultRadius: 3000 },
  { value: 'panel_12dbi', label: 'Panel 12dBi (gerichtet)', defaultRadius: 5000 },
  { value: 'yagi_15dbi', label: 'Yagi 15-18dBi (gerichtet)', defaultRadius: 10000 },
] as const;

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
              {isHeartbeat && (
                <span style={{ color: '#8b949e' }}>
                  {e.wifi_ssid && ` WiFi:${e.wifi_ssid}`}
                  {e.wifi_rssi != null && `(${e.wifi_rssi}dBm)`}
                  {e.wifi_channel != null && ` Ch:${e.wifi_channel}`}
                  {e.free_heap != null && ` Heap:${(e.free_heap / 1024).toFixed(0)}KB`}
                  {e.firmware_version && ` FW:${e.firmware_version}`}
                  {e.ap_active && <span style={{ color: '#eab308' }}> [AP aktiv]</span>}
                  {e.error_count != null && e.error_count > 0 && (
                    <span style={{ color: '#f85149' }}> Errors:{e.error_count} (HTTP {e.last_http_code})</span>
                  )}
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
  const [changelog, setChangelog] = useState<FirmwareChangelogEntry[]>([]);
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

  // GPS location
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  // OTA flow (build + trigger + monitor)
  const [otaNode, setOtaNode] = useState<ReceiverNode | null>(null);
  const [otaStep, setOtaStep] = useState<'idle' | 'building' | 'triggering' | 'waiting' | 'done' | 'error'>('idle');
  const [otaLog, setOtaLog] = useState<string[]>([]);
  const [otaError, setOtaError] = useState<string | null>(null);
  const [otaLoadingId, setOtaLoadingId] = useState<string | null>(null);
  const otaPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otaLogEndRef = useRef<HTMLDivElement | null>(null);

  // Connection log
  const [logEnabled, setLogEnabled] = useState(false);
  const [logEntries, setLogEntries] = useState<ConnectionLogEntry[]>([]);
  const [logReceiverId, setLogReceiverId] = useState<string | null>(null); // null = all
  const isMobile = useIsMobile();
  const [showLog, setShowLog] = useState(false);

  // Coverage editing
  const [editAntennaType, setEditAntennaType] = useState<string>('pcb');
  const [editCoverageRadius, setEditCoverageRadius] = useState<string>('1000');
  const [coverageSaving, setCoverageSaving] = useState(false);
  const [coverageMsg, setCoverageMsg] = useState<string | null>(null);

  // Sync coverage fields when expanded row changes
  useEffect(() => {
    if (!expandedId) return;
    const node = receivers.find(r => r.id === expandedId);
    if (node) {
      setEditAntennaType(node.antennaType || 'pcb');
      setEditCoverageRadius(String(node.coverageRadius || ANTENNA_PRESETS.find(a => a.value === (node.antennaType || 'pcb'))?.defaultRadius || 1000));
      setCoverageMsg(null);
    }
  }, [expandedId, receivers]);

  const loadData = useCallback(async () => {
    try {
      const [r, s, cl] = await Promise.all([
        fetchReceivers(),
        fetchReceiverStats(),
        fetchFirmwareChangelog().catch(() => ({ versions: [] as FirmwareChangelogEntry[] })),
      ]);
      setReceivers(r);
      setStats(s);
      setChangelog(cl.versions);
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

  const addOtaLog = (msg: string) => setOtaLog(prev => [...prev, msg]);

  const handleOtaFlow = async (node: ReceiverNode) => {
    setOtaNode(node);
    setOtaStep('building');
    setOtaLog([]);
    setOtaError(null);
    setOtaLoadingId(node.id);

    // ── Step 1: Build firmware (reuse last build config for WiFi credentials) ──
    addOtaLog(`Firmware-Build für "${node.name}" wird gestartet...`);
    const buildConfig = (node as any).lastBuildConfig;
    const wifiNets = buildConfig?.wifi_networks;
    if (wifiNets?.length > 0) {
      addOtaLog(`WiFi-Credentials aus letztem Build übernommen (${wifiNets.length} Netzwerk${wifiNets.length > 1 ? 'e' : ''})`);
    } else {
      addOtaLog('Hinweis: Keine WiFi-Credentials gespeichert — ESP nutzt vorherige Konfiguration');
    }
    try {
      await startBuildAsync({
        node_id: node.id,
        backend_url: buildConfig?.backend_url || window.location.origin,
        wifi_networks: wifiNets || undefined,
      });
      addOtaLog('Build gestartet, warte auf Abschluss...');
    } catch (e: unknown) {
      setOtaStep('error');
      setOtaError(e instanceof Error ? e.message : 'Build-Start fehlgeschlagen');
      setOtaLoadingId(null);
      return;
    }

    // Poll build status
    const buildDone = await new Promise<boolean>((resolve) => {
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const status = await pollBuildStatus(node.id);
          // Show build log lines
          if (status.log.length > 0) {
            setOtaLog(prev => {
              const base = prev.filter(l => !l.startsWith('[build]'));
              return [...base, ...status.log.slice(-8).map(l => `[build] ${l}`)];
            });
          }
          if (status.status === 'done' && status.result) {
            clearInterval(poll);
            addOtaLog(`Build erfolgreich! (${(status.result.size / 1024).toFixed(0)} KB, SHA: ${status.result.sha256.slice(0, 12)}...)`);
            resolve(true);
          } else if (status.status === 'error') {
            clearInterval(poll);
            setOtaError(status.error || 'Build fehlgeschlagen');
            resolve(false);
          }
        } catch { /* ignore poll error */ }
        if (attempts > 120) { // 120 * 800ms = ~96s timeout
          clearInterval(poll);
          setOtaError('Build-Timeout (>90s)');
          resolve(false);
        }
      }, 800);
    });

    if (!buildDone) {
      setOtaStep('error');
      setOtaLoadingId(null);
      return;
    }

    // ── Step 2: Trigger OTA ──
    setOtaStep('triggering');
    addOtaLog('OTA-Update wird ausgelöst...');
    try {
      const result = await triggerOtaUpdate(node.id);
      addOtaLog(result.message || 'OTA ausgelöst.');
    } catch (e: unknown) {
      setOtaStep('error');
      setOtaError(e instanceof Error ? e.message : 'OTA-Trigger fehlgeschlagen');
      setOtaLoadingId(null);
      return;
    }

    // ── Step 3: Wait for heartbeat + OTA completion ──
    setOtaStep('waiting');
    addOtaLog('Warte auf ESP-Heartbeat (alle ~30s)...');
    addOtaLog('ESP wird Firmware herunterladen, verifizieren und neu starten.');

    let waitAttempts = 0;
    if (otaPollRef.current) clearInterval(otaPollRef.current);
    otaPollRef.current = setInterval(async () => {
      waitAttempts++;
      try {
        const [r] = await Promise.all([fetchReceivers()]);
        setReceivers(r);
        const updated = r.find(rx => rx.id === node.id);
        if (updated) {
          if (updated.otaLastResult === 'success' && !updated.otaUpdatePending) {
            if (otaPollRef.current) clearInterval(otaPollRef.current);
            addOtaLog(`OTA erfolgreich! Neue Firmware: ${updated.firmwareVersion}`);
            setOtaStep('done');
            setOtaLoadingId(null);
          } else if (updated.otaUpdatePending) {
            const elapsed = waitAttempts * 5;
            setOtaLog(prev => {
              const base = prev.filter(l => !l.startsWith('[warte]'));
              return [...base, `[warte] ${elapsed}s vergangen... OTA ausstehend`];
            });
          }
        }
      } catch { /* ignore */ }
      if (waitAttempts >= 36) { // 36 * 5s = 3min
        if (otaPollRef.current) clearInterval(otaPollRef.current);
        addOtaLog('Timeout: ESP hat sich nach 3 Minuten nicht gemeldet.');
        addOtaLog('Der ESP könnte noch updaten — prüfe den Status manuell.');
        setOtaStep('done');
        setOtaLoadingId(null);
      }
    }, 5000);
  };

  const closeOtaModal = () => {
    if (otaPollRef.current) { clearInterval(otaPollRef.current); otaPollRef.current = null; }
    setOtaNode(null);
    setOtaStep('idle');
    setOtaLog([]);
    setOtaError(null);
    setOtaLoadingId(null);
    loadData();
  };

  // Auto-scroll OTA log
  useEffect(() => {
    otaLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [otaLog]);

  // Cleanup OTA poll on unmount
  useEffect(() => {
    return () => { if (otaPollRef.current) clearInterval(otaPollRef.current); };
  }, []);

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
        <AdminTooltip
          brief="Neuen Hardware-Empfänger registrieren"
          detail={"Erstellt einen neuen Empfänger-Eintrag in der Datenbank. Du wählst einen Namen und den Hardware-Typ (ESP32-S3, ESP32-C3 oder ESP8266).\nNach dem Erstellen kannst du die Firmware bauen und auf den Mikrocontroller flashen.\nEs wird eine Einkaufsliste mit allen benötigten Teilen und Links angezeigt."}
        >
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
        </AdminTooltip>
        <AdminTooltip
          brief="Echtzeit-Kommunikationslog ein-/ausschalten"
          detail={"Aktiviert oder deaktiviert das serverseitige Logging aller Empfänger-Kommunikation.\nWenn aktiv, werden alle HTTP-Anfragen der Empfänger (Heartbeats, Drohnen-Meldungen) mit Zeitstempel, Status-Code, Endpoint und Empfänger-Info protokolliert.\nNützlich zur Diagnose von Verbindungsproblemen, WiFi-Signalstärke und Firmware-Fehlern.\nDie Logs werden nur im Arbeitsspeicher gehalten und gehen bei Server-Neustart verloren."}
        >
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
        </AdminTooltip>
        {logEnabled && (
          <AdminTooltip
            brief="Log-Ansicht ein-/ausblenden"
            detail={"Blendet das Echtzeit-Kommunikationslog ein oder aus.\nIm Log siehst du alle eingehenden Anfragen der Empfänger mit farbiger Markierung:\n- Grün: Drohnen-Meldungen (/ingest)\n- Blau: Heartbeats (Status-Updates)\n- Rot: Fehler (HTTP 4xx/5xx)\nDu kannst nach einzelnen Empfängern filtern."}
          >
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
          </AdminTooltip>
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

      {/* Firmware Changelog */}
      {changelog.length > 0 && (
        <details style={{ marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <summary style={{
            cursor: 'pointer', padding: '10px 14px', fontSize: 13,
            color: 'var(--text-secondary)', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            Firmware Changelog
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              (aktuell: {changelog[0]?.version})
            </span>
          </summary>
          <div style={{ padding: '0 14px 14px', maxHeight: 300, overflowY: 'auto' }}>
            {changelog.map(entry => (
              <div key={entry.version} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 13 }}>v{entry.version}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.date}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: 3 }}>
                    {entry.hardware.join(', ')}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {entry.changes.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>
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
              <AdminTooltip
                brief="Einkaufsliste mit allen benötigten Teilen"
                detail={"Zeigt eine vollständige Einkaufsliste für den gewählten Hardware-Typ an.\nEnthält:\n- Alle Pflichtkomponenten (Board, Kabel, Netzteil, Gehäuse)\n- Optionale Teile (Antenne, PoE-Splitter, Abstandshalter)\n- Direkte Amazon-Links zu getesteten/kompatiblen Produkten\n- Geschätzte Gesamtkosten\n- Empfehlung welcher Typ sich für welchen Einsatz eignet"}
              >
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
              </AdminTooltip>
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

      {/* Receiver list */}
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
      ) : isMobile ? (
        /* ─── Mobile: Card Layout ─── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {receivers.map(node => (
            <div key={node.id} data-testid={`receiver-row-${node.id}`} style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 14, opacity: node.isActive ? 1 : 0.5,
              borderLeft: `3px solid ${STATUS_COLORS[node.status]}`,
            }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span data-testid={`receiver-status-${node.id}`} style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: STATUS_COLORS[node.status],
                  boxShadow: node.status === 'online' ? `0 0 6px ${STATUS_COLORS.online}` : 'none',
                }} />
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{node.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {node.hardwareType.toUpperCase()}
                </span>
              </div>

              {/* Card stats */}
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, flexWrap: 'wrap' }}>
                <span>{STATUS_LABELS[node.status]} &middot; {timeAgo(node.lastHeartbeat)}</span>
                <span style={{ color: '#14b8a6' }}>{node.totalDetections} Erkennungen</span>
                {node.firmwareVersion && <span>FW: {node.firmwareVersion}</span>}
                {(() => {
                  const latestForHw = stats?.latestFirmwareVersions?.[node.hardwareType];
                  const isOutdated = latestForHw && node.firmwareVersion
                    && semverCompare(node.firmwareVersion, latestForHw) < 0;
                  const buildIsLatest = latestForHw && node.lastBuildVersion
                    && semverCompare(node.lastBuildVersion, latestForHw) >= 0;
                  const buildNewer = node.lastBuildVersion && node.firmwareVersion
                    && node.lastBuildVersion !== node.firmwareVersion;
                  // Orange badge: firmware is outdated (regardless of build state)
                  if (isOutdated) return (
                    <span data-testid={`receiver-update-badge-${node.id}`} title="Es gibt eine neue Firmware-Version, bitte updaten!" style={{
                      background: 'rgba(251,146,60,0.15)', color: '#fb923c',
                      padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                      fontSize: 11, whiteSpace: 'nowrap', cursor: 'default',
                    }}>
                      ⚠️ Neue FW: {latestForHw}
                    </span>
                  );
                  // Blue badge: build exists that's newer than running firmware (and build is current)
                  if (buildNewer && buildIsLatest) return (
                    <span data-testid={`receiver-update-badge-${node.id}`} style={{
                      background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                      padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                      fontSize: 11, whiteSpace: 'nowrap',
                    }}>
                      Update: {node.lastBuildVersion}
                    </span>
                  );
                  return null;
                })()}
              </div>

              {/* Location info */}
              {node.lastLatitude != null && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Standort: {node.lastLatitude.toFixed(5)}, {node.lastLongitude?.toFixed(5)}
                </div>
              )}

              {/* Location feedback */}
              {locMsg && expandedId === node.id && (
                <div style={{
                  marginBottom: 10, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                  background: locMsg.includes('Fehler') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  color: locMsg.includes('Fehler') ? '#ef4444' : '#22c55e',
                }}>
                  {locMsg}
                </div>
              )}

              {/* PRIMARY ACTION: Standort setzen - large, prominent */}
              <button
                data-testid={`receiver-location-${node.id}`}
                onClick={async () => {
                  setExpandedId(node.id);
                  if (!navigator.geolocation) { setLocMsg('GPS nicht verfügbar'); return; }
                  setLocatingId(node.id);
                  setLocMsg(null);
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      try {
                        await setReceiverLocation(node.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                        setLocMsg(`Standort gesetzt: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${pos.coords.accuracy.toFixed(0)}m)`);
                        await loadData();
                      } catch (err: unknown) { setLocMsg(err instanceof Error ? err.message : 'Fehler'); }
                      finally { setLocatingId(null); }
                    },
                    (err) => { setLocMsg(`GPS-Fehler: ${err.message}`); setLocatingId(null); },
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                }}
                disabled={locatingId === node.id}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 8,
                  background: locatingId === node.id ? 'rgba(20,184,166,0.15)' : 'rgba(20,184,166,0.1)',
                  border: '1px solid #14b8a6', color: '#14b8a6',
                  cursor: locatingId === node.id ? 'wait' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 8, minHeight: 48,
                }}
              >
                {locatingId === node.id ? 'GPS wird abgerufen...' : 'Standort setzen'}
              </button>

              {/* Secondary actions row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  data-testid={`receiver-toggle-${node.id}`}
                  onClick={() => handleToggleActive(node)}
                  style={{ ...mobileBtnStyle }}
                >
                  {node.isActive ? 'Deakt.' : 'Akt.'}
                </button>
                <button
                  data-testid={`receiver-build-${node.id}`}
                  onClick={() => { setFlashRegenKey(!!node.lastBuildAt); setFlashNode(node); }}
                  style={{ ...mobileBtnStyle, background: '#14b8a6', color: '#fff', border: 'none' }}
                >
                  {node.lastBuildAt ? 'Neu bauen' : 'Firmware'}
                </button>
                {node.status !== 'offline' && node.hardwareType !== 'esp8266' && !node.otaUpdatePending && (() => {
                  const latestForHw = stats?.latestFirmwareVersions?.[node.hardwareType];
                  const hasUpdate = (node.lastBuildVersion && node.firmwareVersion && node.lastBuildVersion !== node.firmwareVersion)
                    || (latestForHw && node.firmwareVersion && semverCompare(node.firmwareVersion, latestForHw) < 0);
                  return (
                    <button
                      data-testid={`receiver-ota-${node.id}`}
                      disabled={otaLoadingId === node.id}
                      onClick={() => handleOtaFlow(node)}
                      style={{
                        ...mobileBtnStyle,
                        borderColor: '#3b82f6', color: '#3b82f6',
                        opacity: otaLoadingId === node.id ? 0.6 : 1,
                        ...(hasUpdate ? { background: 'rgba(59,130,246,0.15)', fontWeight: 700 } : {}),
                      }}
                    >
                      {otaLoadingId === node.id ? 'OTA...' : hasUpdate ? 'OTA Update!' : 'OTA'}
                    </button>
                  );
                })()}
                <button
                  data-testid={`receiver-delete-${node.id}`}
                  onClick={() => handleDelete(node.id)}
                  style={{ ...mobileBtnStyle, color: '#ef4444', borderColor: '#ef4444' }}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── Desktop: Table Layout ─── */
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
                        <AdminTooltip
                          brief={node.isActive ? 'Empfänger deaktivieren' : 'Empfänger aktivieren'}
                          detail={node.isActive
                            ? 'Deaktiviert diesen Empfänger. Er wird weiterhin in der Liste angezeigt (ausgegraut), aber seine Drohnen-Meldungen werden vom Server ignoriert.\nNützlich um einen Empfänger vorübergehend stillzulegen ohne ihn zu löschen.'
                            : 'Aktiviert diesen Empfänger wieder. Seine Drohnen-Meldungen werden ab sofort vom Server verarbeitet und auf der Karte angezeigt.'}
                        >
                          <button
                            data-testid={`receiver-toggle-${node.id}`}
                            onClick={() => handleToggleActive(node)}
                            style={actionBtnStyle}
                          >
                            {node.isActive ? 'Deakt.' : 'Akt.'}
                          </button>
                        </AdminTooltip>
                        <AdminTooltip
                          brief="Empfänger unwiderruflich löschen"
                          detail={"Löscht diesen Empfänger und seinen API-Key aus der Datenbank. Die Firmware auf dem ESP wird dadurch nicht verändert, aber der Empfänger kann sich nicht mehr am Server authentifizieren.\nDiese Aktion kann nicht rückgängig gemacht werden. Der ESP muss danach neu registriert und geflasht werden."}
                        >
                          <button
                            data-testid={`receiver-delete-${node.id}`}
                            onClick={() => handleDelete(node.id)}
                            style={{ ...actionBtnStyle, color: '#ef4444' }}
                          >
                            Löschen
                          </button>
                        </AdminTooltip>
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
                        {/* Coverage / Antenna Configuration */}
                        <div data-testid={`receiver-coverage-${node.id}`} style={{
                          marginTop: 10, padding: '10px 12px',
                          background: 'rgba(20,184,166,0.05)', border: '1px solid rgba(20,184,166,0.15)',
                          borderRadius: 6, display: 'flex', gap: 12, alignItems: 'flex-end',
                          flexWrap: 'wrap', fontSize: 12,
                        }}>
                          <div style={{ minWidth: 160 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Antennen-Typ</label>
                            <select
                              data-testid={`receiver-antenna-${node.id}`}
                              value={editAntennaType}
                              onChange={e => {
                                const val = e.target.value;
                                setEditAntennaType(val);
                                const preset = ANTENNA_PRESETS.find(a => a.value === val);
                                if (preset) setEditCoverageRadius(String(preset.defaultRadius));
                              }}
                              style={{
                                width: '100%', padding: '5px 8px',
                                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
                              }}
                            >
                              {ANTENNA_PRESETS.map(a => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ minWidth: 120 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Reichweite (m)</label>
                            <input
                              data-testid={`receiver-radius-${node.id}`}
                              type="number"
                              min={100}
                              max={50000}
                              value={editCoverageRadius}
                              onChange={e => setEditCoverageRadius(e.target.value)}
                              style={{
                                width: '100%', padding: '5px 8px',
                                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <button
                            data-testid={`receiver-coverage-save-${node.id}`}
                            disabled={coverageSaving}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setCoverageSaving(true);
                              setCoverageMsg(null);
                              try {
                                await updateReceiverCoverage(node.id, {
                                  coverage_radius: parseInt(editCoverageRadius, 10) || 1000,
                                  antenna_type: editAntennaType,
                                });
                                setCoverageMsg('Gespeichert');
                                await loadData();
                              } catch (err: unknown) {
                                setCoverageMsg(err instanceof Error ? err.message : 'Fehler');
                              } finally {
                                setCoverageSaving(false);
                              }
                            }}
                            style={{
                              padding: '5px 14px',
                              background: '#14b8a6',
                              border: 'none',
                              borderRadius: 4,
                              color: '#fff',
                              cursor: coverageSaving ? 'wait' : 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                              opacity: coverageSaving ? 0.6 : 1,
                            }}
                          >
                            {coverageSaving ? 'Speichern...' : 'Abdeckung speichern'}
                          </button>
                          {coverageMsg && (
                            <span style={{
                              fontSize: 11,
                              color: coverageMsg === 'Gespeichert' ? '#22c55e' : '#ef4444',
                            }}>
                              {coverageMsg}
                            </span>
                          )}
                        </div>

                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {/* OTA Update */}
                          {node.status !== 'offline' && node.hardwareType !== 'esp8266' && (
                            node.otaUpdatePending ? (
                              <AdminTooltip
                                brief="OTA-Update abbrechen"
                                detail={"Bricht das ausstehende Over-the-Air Update ab. Der Empfänger wird beim nächsten Heartbeat informiert, dass kein Update mehr bereitsteht.\nFalls der ESP das Update bereits herunterlädt, wird es trotzdem abgebrochen."}
                              >
                                <button
                                  data-testid={`receiver-ota-cancel-${node.id}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await cancelOtaUpdate(node.id);
                                      if (otaPollRef.current) { clearInterval(otaPollRef.current); otaPollRef.current = null; }
                                      await loadData();
                                    } catch { /* silent */ }
                                  }}
                                  style={{
                                    padding: '5px 12px', background: 'rgba(234,179,8,0.15)',
                                    border: '1px solid #eab308', borderRadius: 6, color: '#eab308',
                                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                  }}
                                >
                                  OTA ausstehend... (Abbrechen)
                                </button>
                              </AdminTooltip>
                            ) : (
                              <AdminTooltip
                                brief="Firmware drahtlos aktualisieren (OTA)"
                                detail={"Baut automatisch die neueste Firmware und sendet sie per Over-the-Air Update an den ESP.\n\nAblauf:\n1. Automatischer Firmware-Build (WiFi-Credentials werden aus dem letzten Build übernommen)\n2. OTA-Trigger an den Empfänger\n3. ESP lädt Firmware herunter, verifiziert SHA-256 und startet neu\n\nEin Progress-Modal zeigt Build-Log, OTA-Status und ESP-Antwort in Echtzeit.\n\nWiFi-Persistenz: Falls keine gespeicherten Build-Credentials vorhanden sind, nutzt der ESP die im NVS (Non-Volatile Storage) gespeicherten WiFi-Daten vom letzten erfolgreichen Login. NVS überlebt OTA-Updates.\n\nKein physischer Zugriff nötig! Nur ESP32-S3/C3 (nicht ESP8266).\nBei Fehler: Automatischer Rollback auf die vorherige Firmware."}
                              >
                                <button
                                  data-testid={`receiver-ota-${node.id}`}
                                  disabled={otaLoadingId === node.id}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    handleOtaFlow(node);
                                  }}
                                  style={{
                                    padding: '5px 12px', background: 'rgba(59,130,246,0.1)',
                                    border: '1px solid #3b82f6', borderRadius: 6, color: '#3b82f6',
                                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                    opacity: otaLoadingId === node.id ? 0.6 : 1,
                                  }}
                                >
                                  {otaLoadingId === node.id ? 'OTA läuft...' : 'OTA Update senden'}
                                </button>
                              </AdminTooltip>
                            )
                          )}
                          {node.otaLastResult && (
                            <span style={{
                              fontSize: 10, padding: '4px 8px', borderRadius: 4,
                              background: node.otaLastResult === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: node.otaLastResult === 'success' ? '#22c55e' : '#ef4444',
                            }}>
                              OTA: {node.otaLastResult === 'success' ? 'Erfolgreich' : node.otaLastResult}
                            </span>
                          )}
                          {node.lastBuildAt && (
                            <AdminTooltip
                              brief="Anwendungs-Firmware herunterladen (.bin)"
                              detail={"Lädt die reine Anwendungs-Firmware als .bin-Datei herunter.\nDiese Datei enthält NUR den FlightArc-Code ohne Bootloader und Partitionstabelle.\n\nVerwendung:\n- Für OTA-Updates über esptool oder das Web-Interface des ESP\n- Wenn Bootloader und Partitionen bereits auf dem ESP vorhanden sind\n- Offset beim manuellen Flashen: 0x10000 (ESP32) bzw. 0x0 (ESP8266)\n\nFür ein komplett frisches Board verwende stattdessen \"Full-Flash (Merged)\"."}
                            >
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
                                App-Firmware
                              </button>
                            </AdminTooltip>
                          )}
                          {node.lastBuildMergedSize && (
                            <AdminTooltip
                              brief="Komplettes Flash-Image herunterladen"
                              detail={"Lädt das vollständige Flash-Image (Merged Binary) herunter. Diese Datei enthält ALLES in einem:\n- Bootloader\n- Partitionstabelle\n- NVS (Konfigurationsdaten)\n- FlightArc Anwendungs-Firmware\n\nVerwendung:\n- Für ein komplett frisches/neues Board (Erstinstallation)\n- Wenn der Flash-Speicher vorher gelöscht wurde (erase_flash)\n- Wird immer ab Offset 0x0 geflasht\n\nEmpfohlen für den ersten Flash. Für spätere Updates reicht die \"App-Firmware\" oder \"OTA Update\"."}
                            >
                              <button
                                data-testid={`receiver-download-merged-${node.id}`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const blob = await downloadFirmware(node.id, 'merged');
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `flightarc-${node.hardwareType}-${node.id}-merged.bin`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch { /* silent */ }
                                }}
                                style={{
                                  padding: '5px 12px',
                                  background: 'var(--bg-tertiary)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                }}
                              >
                                Full-Flash (Merged)
                              </button>
                            </AdminTooltip>
                          )}
                          <AdminTooltip
                            brief={node.lastBuildAt ? 'Firmware neu kompilieren mit neuem API-Key' : 'Firmware erstmalig kompilieren'}
                            detail={node.lastBuildAt
                              ? 'Öffnet den Flash-Wizard und kompiliert eine neue Firmware mit einem NEUEN API-Key.\nDer alte Key wird ungültig — der ESP muss danach neu geflasht werden (per USB oder OTA).\nNützlich wenn:\n- Du die Backend-URL ändern willst\n- WiFi-Zugangsdaten aktualisieren willst\n- Der alte Key kompromittiert wurde\n- Du auf eine neue Firmware-Version aktualisieren willst'
                              : 'Öffnet den Flash-Wizard: Ein 5-Schritte-Assistent der eine individuelle Firmware für diesen Empfänger kompiliert.\n\nSchritte:\n1. Vorbereitung — Board-Info und Boot-Modus\n2. Konfiguration — Backend-URL und WiFi-Daten eingeben\n3. Build — Firmware wird live auf dem Server kompiliert\n4. Verifizierung — Automatische Checks (Größe, Checksumme, API-Key)\n5. Download — .bin-Datei herunterladen und flashen\n\nJede Firmware enthält einen einzigartigen API-Key für die sichere Kommunikation.'}
                          >
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
                          </AdminTooltip>
                          {logEnabled && (
                            <AdminTooltip
                              brief="Gefilterte Logs für diesen Empfänger"
                              detail={"Öffnet das Kommunikations-Log gefiltert auf diesen einen Empfänger.\nZeigt nur dessen Heartbeats, Drohnen-Meldungen und Fehler an.\nNützlich um die Verbindungsqualität eines einzelnen Empfängers zu diagnostizieren:\n- Heartbeat-Intervall (sollte alle 30s kommen)\n- WiFi-Signalstärke (RSSI in dBm)\n- Freier Arbeitsspeicher (Heap)\n- Firmware-Version\n- HTTP-Fehlercodes"}
                            >
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
                            </AdminTooltip>
                          )}
                          <AdminTooltip
                            brief="GPS-Position des Empfängers speichern"
                            detail={"Ermittelt deinen aktuellen Standort per Browser-GPS und speichert ihn als Position dieses Empfängers.\nDer Standort wird auf der Karte als Empfänger-Marker angezeigt.\n\nSo geht's:\n1. Gehe physisch zum Standort des Empfängers\n2. Öffne diese Seite auf deinem Smartphone\n3. Klicke auf \"Standort setzen\"\n4. Erlaube die GPS-Abfrage im Browser\n\nDie Genauigkeit hängt vom GPS-Empfang ab (wird in Metern angezeigt).\nBenötigt HTTPS oder localhost für die Geolocation-API."}
                          >
                            <button
                              data-testid={`receiver-location-${node.id}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!navigator.geolocation) {
                                  setLocMsg('GPS nicht verfügbar in diesem Browser');
                                  return;
                                }
                                setLocatingId(node.id);
                                setLocMsg(null);
                                navigator.geolocation.getCurrentPosition(
                                  async (pos) => {
                                    try {
                                      await setReceiverLocation(
                                        node.id,
                                        pos.coords.latitude,
                                        pos.coords.longitude,
                                        pos.coords.accuracy
                                      );
                                      setLocMsg(`Standort gesetzt: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${pos.coords.accuracy.toFixed(0)}m)`);
                                      await loadData();
                                    } catch (err: unknown) {
                                      setLocMsg(err instanceof Error ? err.message : 'Fehler beim Speichern');
                                    } finally {
                                      setLocatingId(null);
                                    }
                                  },
                                  (err) => {
                                    setLocMsg(`GPS-Fehler: ${err.message}`);
                                    setLocatingId(null);
                                  },
                                  { enableHighAccuracy: true, timeout: 15000 }
                                );
                              }}
                              disabled={locatingId === node.id}
                              style={{
                                padding: '5px 12px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: locatingId === node.id ? '#14b8a6' : 'var(--text-secondary)',
                                cursor: locatingId === node.id ? 'wait' : 'pointer',
                                fontSize: 11,
                              }}
                            >
                              {locatingId === node.id ? 'GPS wird abgerufen...' : 'Standort setzen'}
                            </button>
                          </AdminTooltip>
                        </div>
                        {/* Location feedback */}
                        {locMsg && expandedId === node.id && (
                          <div style={{
                            marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11,
                            background: locMsg.includes('Fehler') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                            color: locMsg.includes('Fehler') ? '#ef4444' : '#22c55e',
                          }}>
                            {locMsg}
                          </div>
                        )}
                        {/* Firmware-Verlauf */}
                        {node.firmwareHistory?.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Firmware-Verlauf</div>
                            {node.firmwareHistory.slice(0, 10).map((h, i) => (
                              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8, marginBottom: 2 }}>
                                <span style={{ fontFamily: 'monospace' }}>{h.version}</span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {new Date(h.timestamp * 1000).toLocaleDateString('de-DE')}
                                </span>
                                <span style={{
                                  fontSize: 10, padding: '0 4px', borderRadius: 3,
                                  background: h.method === 'ota' ? 'rgba(59,130,246,0.1)' : h.method === 'build' ? 'rgba(20,184,166,0.1)' : 'rgba(148,163,184,0.1)',
                                  color: h.method === 'ota' ? '#3b82f6' : h.method === 'build' ? '#14b8a6' : 'var(--text-muted)',
                                }}>
                                  {h.method === 'build' ? 'Flash' : h.method === 'ota' ? 'OTA' : 'Update'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
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

      {/* OTA Progress Modal */}
      {otaNode && (
        <>
          <div onClick={otaStep === 'done' || otaStep === 'error' ? closeOtaModal : undefined} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-secondary)', borderRadius: 12,
              border: '1px solid var(--border)', maxWidth: 520, width: '100%',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    OTA Update: {otaNode.name}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {otaNode.hardwareType} &middot; {otaNode.id}
                  </p>
                </div>
                {(otaStep === 'done' || otaStep === 'error') && (
                  <button onClick={closeOtaModal} style={{
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, color: 'var(--text-muted)',
                  }}>&times;</button>
                )}
              </div>

              {/* Progress Steps */}
              <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
                {(['building', 'triggering', 'waiting', 'done'] as const).map((step, i) => {
                  const labels = ['Firmware bauen', 'OTA auslösen', 'Warte auf ESP', 'Fertig'];
                  const icons = ['1', '2', '3', '\u2713'];
                  const isActive = otaStep === step;
                  const isPast = ['building', 'triggering', 'waiting', 'done'].indexOf(otaStep) > i;
                  const isError = otaStep === 'error' && ['building', 'triggering', 'waiting', 'done'].indexOf(step) >= ['building', 'triggering', 'waiting', 'done'].indexOf(
                    otaLog.some(l => l.includes('Build erfolgreich')) ? 'triggering' :
                    otaLog.some(l => l.includes('OTA ausgelöst') || l.includes('OTA-Update wird')) ? 'waiting' : 'building'
                  );
                  return (
                    <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        background: isPast || (isActive && step === 'done') ? '#22c55e'
                          : isActive ? '#3b82f6'
                          : isError ? '#ef4444'
                          : 'var(--bg-tertiary)',
                        color: isPast || isActive ? '#fff' : 'var(--text-muted)',
                        border: `2px solid ${isPast || (isActive && step === 'done') ? '#22c55e' : isActive ? '#3b82f6' : isError ? '#ef4444' : 'var(--border)'}`,
                      }}>
                        {isPast ? '\u2713' : isError ? '!' : icons[i]}
                      </div>
                      <span style={{ fontSize: 10, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {labels[i]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Log output */}
              <div style={{
                flex: 1, overflow: 'auto', padding: '12px 20px',
                fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                background: 'var(--bg-primary)', minHeight: 150, maxHeight: 300,
              }}>
                {otaLog.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes('erfolgreich') || line.includes('Erfolgreich') ? '#22c55e'
                      : line.includes('fehlgeschlagen') || line.includes('Fehler') || line.includes('Timeout') ? '#ef4444'
                      : line.startsWith('[build]') ? '#94a3b8'
                      : line.startsWith('[warte]') ? '#eab308'
                      : 'var(--text-secondary)',
                  }}>
                    {line}
                  </div>
                ))}
                {(otaStep === 'building' || otaStep === 'triggering' || otaStep === 'waiting') && (
                  <div style={{ color: '#3b82f6' }}>
                    {otaStep === 'building' ? '\u25CF Firmware wird kompiliert...' :
                     otaStep === 'triggering' ? '\u25CF OTA wird ausgelöst...' :
                     '\u25CF Warte auf ESP-Heartbeat...'}
                  </div>
                )}
                <div ref={otaLogEndRef} />
              </div>

              {/* Error */}
              {otaError && (
                <div style={{
                  padding: '10px 20px', background: 'rgba(239,68,68,0.1)',
                  borderTop: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', fontSize: 12,
                }}>
                  Fehler: {otaError}
                </div>
              )}

              {/* Footer */}
              <div style={{
                padding: '12px 20px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'flex-end', gap: 8,
              }}>
                {(otaStep === 'done' || otaStep === 'error') && (
                  <button onClick={closeOtaModal} style={{
                    padding: '8px 20px', background: 'var(--accent)',
                    border: 'none', borderRadius: 8, color: '#fff',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
                    Schließen
                  </button>
                )}
                {otaStep === 'waiting' && (
                  <button onClick={async () => {
                    try {
                      await cancelOtaUpdate(otaNode.id);
                      addOtaLog('OTA abgebrochen.');
                      setOtaStep('done');
                      if (otaPollRef.current) { clearInterval(otaPollRef.current); otaPollRef.current = null; }
                      setOtaLoadingId(null);
                    } catch { /* ignore */ }
                  }} style={{
                    padding: '8px 16px', background: 'rgba(239,68,68,0.1)',
                    border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444',
                    cursor: 'pointer', fontSize: 13,
                  }}>
                    Abbrechen
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
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

const mobileBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  minHeight: 40,
};
