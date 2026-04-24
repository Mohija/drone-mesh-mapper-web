import type { ReceiverNode } from '../../api';

/**
 * Per-controller health panel — shows the full telemetry snapshot (WiFi, runtime,
 * backend comms, location) as a structured dashboard with status pill, alert
 * banner, and automatic health-check list.
 *
 * The rules mirror what the daily remote agent (flightarc-daily-health) uses,
 * so "this controller has a warning" in the UI and in the agent report agree.
 */

interface Props {
  node: ReceiverNode;
}

interface HealthCheck {
  label: string;
  level: 'ok' | 'warn' | 'error' | 'info';
  detail?: string;
}

const EXPECTED_FIRMWARE = '1.5.3';

function secondsAgo(epoch: number | null): number | null {
  if (!epoch) return null;
  return Math.floor(Date.now() / 1000 - epoch);
}

function formatAge(secs: number | null): string {
  if (secs == null) return '-';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`;
  const d = Math.floor(secs / 86400);
  return `${d} Tag${d === 1 ? '' : 'e'}`;
}

function formatUptime(s: number | null): string {
  if (s == null) return '-';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

// Signal-bar: -30dBm = 100%, -90dBm = 0%
function rssiPercent(rssi: number | null): number {
  if (rssi == null) return 0;
  const pct = ((rssi + 90) / 60) * 100;
  return Math.max(0, Math.min(100, pct));
}

// ESP32-S3 has ~320KB usable heap, ESP32-C3 ~200KB
function heapCapacity(hw: string): number {
  if (hw === 'esp32-c3') return 200_000;
  return 320_000; // esp32-s3 / esp32-s3-gps default
}

function computeChecks(node: ReceiverNode): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const age = secondsAgo(node.lastHeartbeat);

  // Status
  checks.push({
    label: `Heartbeat: ${node.status}`,
    level: node.status === 'online' ? 'ok' : node.status === 'stale' ? 'warn' : 'error',
    detail: age != null ? `vor ${formatAge(age)}` : 'nie',
  });

  // Firmware
  checks.push({
    label: `Firmware ${node.firmwareVersion || 'unbekannt'}`,
    level: node.firmwareVersion === EXPECTED_FIRMWARE ? 'ok'
      : node.firmwareVersion ? 'warn' : 'info',
    detail: node.firmwareVersion === EXPECTED_FIRMWARE ? 'aktuell' : `erwartet ${EXPECTED_FIRMWARE}`,
  });

  // WiFi signal
  if (node.wifiRssi != null) {
    const rssi = node.wifiRssi;
    checks.push({
      label: `WiFi-Signal ${rssi} dBm`,
      level: rssi > -65 ? 'ok' : rssi > -80 ? 'warn' : 'error',
      detail: node.wifiSsid || undefined,
    });
  }

  // AP mode
  if (node.apActive) {
    checks.push({
      label: 'Captive-Portal aktiv',
      level: 'warn',
      detail: 'Controller hängt im AP-Modus — WiFi-Credentials vermutlich falsch',
    });
  }

  // Heap
  if (node.freeHeap != null) {
    checks.push({
      label: `Freier Heap ${(node.freeHeap / 1024).toFixed(0)} KB`,
      level: node.freeHeap > 100_000 ? 'ok' : node.freeHeap > 50_000 ? 'warn' : 'error',
    });
  }

  // Error counter from controller
  const errs = node.lastErrorCount ?? 0;
  if (errs > 0) {
    checks.push({
      label: `Fehlerzähler ${errs}`,
      level: errs > 10 ? 'error' : errs > 3 ? 'warn' : 'info',
      detail: node.lastHttpCodeReported ? `letzter HTTP-Code: ${node.lastHttpCodeReported}` : undefined,
    });
  }

  // OTA
  if (node.otaUpdatePending) {
    checks.push({
      label: 'OTA-Update ausstehend',
      level: 'info',
      detail: node.otaLastAttempt ? `letzter Versuch: ${new Date(node.otaLastAttempt * 1000).toLocaleString('de-DE')}` : undefined,
    });
  }

  return checks;
}

const levelColor: Record<HealthCheck['level'], string> = {
  ok: '#22c55e',
  warn: '#eab308',
  error: '#ef4444',
  info: '#64748b',
};

const levelIcon: Record<HealthCheck['level'], string> = {
  ok: '✓',
  warn: '⚠',
  error: '✗',
  info: 'ℹ',
};

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span className="fa-micro" style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px 5px 10px', borderRadius: 999,
      background: `${color}1f`,
      border: `1px solid ${color}66`,
      color, fontSize: 11, letterSpacing: '0.14em',
      boxShadow: `0 0 0 1px ${color}10, 0 4px 8px -4px ${color}40`,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color,
        boxShadow: `0 0 8px ${color}`,
      }} />
      {label}
    </span>
  );
}

function Bar({ percent, color, label }: { percent: number; color: string; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export default function ReceiverHealthPanel({ node }: Props) {
  const checks = computeChecks(node);
  const warnings = checks.filter(c => c.level === 'warn');
  const errors = checks.filter(c => c.level === 'error');
  const statusColor = node.status === 'online' ? '#22c55e'
    : node.status === 'stale' ? '#eab308' : '#6b7280';
  const age = secondsAgo(node.lastHeartbeat);

  const heapCap = heapCapacity(node.hardwareType);
  const heapPct = node.freeHeap ? (node.freeHeap / heapCap) * 100 : 0;
  const rssiPct = rssiPercent(node.wifiRssi);
  const rssiColor = node.wifiRssi == null ? '#64748b'
    : node.wifiRssi > -65 ? '#22c55e' : node.wifiRssi > -80 ? '#eab308' : '#ef4444';

  return (
    <div data-testid={`receiver-health-${node.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top status banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Pill color={statusColor} label={node.status} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Letzter Heartbeat: {age != null ? `vor ${formatAge(age)}` : 'nie'}
          {node.lastTelemetryAt && ` · ${new Date(node.lastTelemetryAt * 1000).toLocaleString('de-DE')}`}
        </span>
        {node.apActive && (
          <Pill color="#eab308" label="AP-Modus aktiv" />
        )}
      </div>

      {/* Alerts */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div style={{
          padding: 10, borderRadius: 8,
          background: errors.length ? 'rgba(239,68,68,0.10)' : 'rgba(234,179,8,0.10)',
          border: `1px solid ${errors.length ? 'var(--status-error)' : '#eab308'}`,
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: errors.length ? '#ef4444' : '#eab308' }}>
            {errors.length > 0 ? 'Fehler' : 'Warnungen'}
          </div>
          {[...errors, ...warnings].map((c, i) => (
            <div key={i} style={{ marginLeft: 8 }}>
              {levelIcon[c.level]} <strong>{c.label}</strong>{c.detail && ` — ${c.detail}`}
            </div>
          ))}
        </div>
      )}

      {/* 3-panel grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {/* Network */}
        <div className="fa-card" style={{ padding: 12 }}>
          <div className="fa-micro" style={{ marginBottom: 10 }}>Verbindung</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>SSID:</span> {node.wifiSsid || '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Kanal:</span> {node.wifiChannel ?? '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>IP:</span> <code style={{ fontSize: 10 }}>{node.lastIp || '-'}</code></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Bar percent={rssiPct} color={rssiColor} label={`RSSI ${node.wifiRssi ?? '-'} dBm`} />
            </div>
          </div>
        </div>

        {/* Runtime */}
        <div className="fa-card" style={{ padding: 12 }}>
          <div className="fa-micro" style={{ marginBottom: 10 }}>Laufzeit</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Firmware:</span> {node.firmwareVersion || '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Uptime:</span> {formatUptime(node.uptimeSeconds)}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Erkennungen:</span> {node.detectionsSinceBoot} seit Boot · {node.totalDetections} gesamt</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Bar percent={heapPct} color={heapPct > 30 ? '#22c55e' : heapPct > 15 ? '#eab308' : '#ef4444'}
                   label={`Heap ${node.freeHeap != null ? (node.freeHeap / 1024).toFixed(0) + ' KB' : '-'}`} />
            </div>
          </div>
        </div>

        {/* Backend comms */}
        <div className="fa-card" style={{ padding: 12 }}>
          <div className="fa-micro" style={{ marginBottom: 10 }}>Backend-Kommunikation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Fehlerzähler:</span>{' '}
              <span style={{
                color: (node.lastErrorCount ?? 0) > 10 ? '#ef4444'
                  : (node.lastErrorCount ?? 0) > 3 ? '#eab308' : 'var(--text-primary)',
                fontWeight: (node.lastErrorCount ?? 0) > 0 ? 600 : 400,
              }}>{node.lastErrorCount ?? 0}</span>
            </div>
            <div><span style={{ color: 'var(--text-muted)' }}>Letzter HTTP-Code:</span> {node.lastHttpCodeReported ?? '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>OTA:</span> {node.otaUpdatePending ? 'ausstehend' : (node.otaLastResult || '-')}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>AP-Modus:</span> {node.apActive == null ? '-' : (node.apActive ? 'ja (Captive Portal)' : 'nein')}</div>
          </div>
        </div>
      </div>

      {/* Health check list */}
      <div style={{ padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div className="fa-micro" style={{ marginBottom: 10 }}>Checks</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ color: levelColor[c.level], width: 14, textAlign: 'center', fontWeight: 700 }}>{levelIcon[c.level]}</span>
              <span style={{ flex: '0 0 auto', fontWeight: 500 }}>{c.label}</span>
              {c.detail && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>— {c.detail}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Auxiliary reference info (ID, location, coverage) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
        <div>ID: <code style={{ fontSize: 10 }}>{node.id}</code></div>
        <div>Hardware: {node.hardwareType}</div>
        <div>Standort: {node.lastLatitude != null ? `${node.lastLatitude.toFixed(5)}, ${node.lastLongitude?.toFixed(5)}` : '-'}</div>
        <div>Abdeckung: {node.coverageRadius ?? '-'} m ({node.antennaType || '-'})</div>
      </div>
    </div>
  );
}
