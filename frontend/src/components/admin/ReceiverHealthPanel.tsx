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
  /** Latest version expected for THIS node's hardware type, resolved from
   *  the backend changelog (stats.latestFirmwareVersions). Falls back to
   *  the node's own firmwareVersion so nodes without a published changelog
   *  entry don't get a spurious warning. */
  expectedFirmware?: string | null;
}

interface HealthCheck {
  label: string;
  level: 'ok' | 'warn' | 'error' | 'info';
  detail?: string;
}

/**
 * Parse a semantic version like "1.6.1" into [1, 6, 1] for numeric compare.
 * Non-numeric / missing parts become 0 so "1.5" sorts below "1.5.1".
 */
function parseVersion(v: string): number[] {
  return v.split('.').map(p => parseInt(p, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a), pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

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

function computeChecks(node: ReceiverNode, expectedFirmware?: string | null): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const age = secondsAgo(node.lastHeartbeat);

  // Status
  checks.push({
    label: `Heartbeat: ${node.status}`,
    level: node.status === 'online' ? 'ok' : node.status === 'stale' ? 'warn' : 'error',
    detail: age != null ? `vor ${formatAge(age)}` : 'nie',
  });

  // Firmware — compare against the latest published version for this
  // node's hardware type. Old == warn (upgrade available), newer == info
  // (dev build running ahead of the published changelog), equal == ok.
  if (node.firmwareVersion) {
    const fw = node.firmwareVersion;
    if (!expectedFirmware) {
      checks.push({ label: `Firmware ${fw}`, level: 'info', detail: 'keine Referenz im Changelog' });
    } else {
      const cmp = compareVersions(fw, expectedFirmware);
      if (cmp === 0) {
        checks.push({ label: `Firmware ${fw}`, level: 'ok', detail: 'aktuell' });
      } else if (cmp < 0) {
        checks.push({ label: `Firmware ${fw}`, level: 'warn', detail: `Update auf ${expectedFirmware} verfügbar` });
      } else {
        checks.push({ label: `Firmware ${fw}`, level: 'info', detail: `neuer als Changelog-Stand ${expectedFirmware}` });
      }
    }
  } else {
    checks.push({ label: 'Firmware unbekannt', level: 'info' });
  }

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

function GpsStatusLine({ node }: { node: ReceiverNode }) {
  // Three-layer diagnostic — ordered from "worst" to "best":
  //   1. Modul stumm           → rot    (keine NMEA-Bytes, Verdrahtung defekt)
  //   2. Modul aktiv, kein Sat → orange (UART ok, aber Antenne sieht nichts)
  //   3. Satelliten sichtbar   → gelb   (Sky-View ok, braucht nur 4+ sats für Fix)
  //   4. Fix                   → grün
  const messagesParsed = node.gpsMessagesParsed ?? 0;
  const lastMsgAge = node.gpsLastMessageAgeSeconds;
  const moduleActive = messagesParsed > 0 && lastMsgAge != null && lastMsgAge >= 0 && lastMsgAge < 10;
  const satsInView = node.gpsSatsInView ?? 0;

  let color = '#6b7280', label = 'unbekannt';
  if (node.gpsHasFix) {
    color = '#22c55e';
    label = 'Fix';
  } else if (!moduleActive && messagesParsed === 0) {
    color = '#ef4444';
    label = 'Modul stumm — keine NMEA-Daten';
  } else if (!moduleActive) {
    color = '#ef4444';
    label = 'Modul inaktiv — Verbindung verloren';
  } else if (satsInView === 0) {
    color = '#f97316';
    label = 'Aktiv, aber keine Satelliten';
  } else if ((node.gpsSatellites ?? 0) === 0) {
    color = '#eab308';
    label = `${satsInView} Sat sichtbar — noch kein Fix`;
  } else {
    color = '#eab308';
    label = 'Kein Fix — sucht Satelliten';
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontWeight: 600, color }}>{label}</span>
    </div>
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

export default function ReceiverHealthPanel({ node, expectedFirmware }: Props) {
  const checks = computeChecks(node, expectedFirmware);
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

        {/* GPS — only shown when the firmware reports GPS support (esp32-s3-gps).
            Surfaces module status even when no fix has been acquired, so the
            operator can distinguish "wiring broken" (0 sat) from "needs sky
            view" (some sat, no fix). */}
        {node.gpsPresent && (
          <div className="fa-card" style={{ padding: 12 }} data-testid={`receiver-gps-${node.id}`}>
            <div className="fa-micro" style={{ marginBottom: 10 }}>GPS-Modul</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <GpsStatusLine node={node} />
              <div><span style={{ color: 'var(--text-muted)' }}>NMEA-Nachrichten:</span>{' '}
                <span style={{
                  fontWeight: 600,
                  color: (node.gpsMessagesParsed ?? 0) > 0 ? '#22c55e' : '#ef4444',
                }}>
                  {node.gpsMessagesParsed ?? 0}
                </span>
                {node.gpsLastMessageAgeSeconds != null && node.gpsLastMessageAgeSeconds >= 0 && (
                  <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                    (letzte vor {node.gpsLastMessageAgeSeconds}s)
                  </span>
                )}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Sichtbar / im Fix:</span>{' '}
                <span style={{
                  fontWeight: 600,
                  color: (node.gpsSatsInView ?? 0) >= 4 ? '#22c55e'
                    : (node.gpsSatsInView ?? 0) >= 1 ? '#eab308' : '#ef4444',
                }}>
                  {node.gpsSatsInView ?? 0}
                </span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ fontWeight: 600 }}>
                  {node.gpsSatellites ?? 0}
                </span>
                <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                  Satelliten
                </span>
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>HDOP:</span>{' '}
                {node.gpsHdop != null && node.gpsHdop < 99
                  ? (
                    <span style={{
                      color: node.gpsHdop < 2 ? '#22c55e'
                        : node.gpsHdop < 5 ? '#eab308' : '#ef4444',
                    }}>
                      {node.gpsHdop.toFixed(1)}
                    </span>
                  )
                  : '-'}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Letzter Fix:</span>{' '}
                {node.gpsLastFixAgeSeconds == null || node.gpsLastFixAgeSeconds < 0
                  ? 'nie'
                  : node.gpsLastFixAgeSeconds < 60
                    ? `vor ${node.gpsLastFixAgeSeconds}s`
                    : `vor ${Math.floor(node.gpsLastFixAgeSeconds / 60)}m ${node.gpsLastFixAgeSeconds % 60}s`}
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Koordinaten:</span>{' '}
                {node.lastLatitude != null && node.lastLongitude != null && node.gpsHasFix
                  ? <code style={{ fontSize: 10 }}>{node.lastLatitude.toFixed(5)}, {node.lastLongitude.toFixed(5)}</code>
                  : '-'}
              </div>
            </div>
          </div>
        )}
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
