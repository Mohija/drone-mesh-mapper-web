import { useState, useRef, useEffect, useCallback } from 'react';
import { startBuildAsync, pollBuildStatus, downloadFirmware, fetchWifiNetworks, fetchSettings, API_BASE } from '../../api';
import type { ReceiverNode, FirmwareCheck } from '../../api';
// Registers the <esp-web-install-button> custom element used by step 5.
// Side-effect import — the library attaches itself to the global element registry.
import 'esp-web-tools';

// JSX typing for the Web Component so TypeScript accepts the tag name.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'esp-web-install-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          manifest?: string;
          'erase-first'?: boolean | '';
          'show-log'?: boolean | '';
        },
        HTMLElement
      >;
    }
  }
}

interface Props {
  node: ReceiverNode;
  onClose: () => void;
  regenerateKey?: boolean;
  /** Open the wizard directly on a specific step — used by the overview's
   *  "Web-Flash" shortcut to skip straight to step 5 when a merged binary
   *  is already available. */
  initialStep?: Step;
}

type Step = 'intro' | 'config' | 'build' | 'download' | 'webflash' | 'done';

const STEP_LABELS: Record<Step, string> = {
  intro: '1. Vorbereitung',
  config: '2. Konfiguration',
  build: '3. Firmware bauen',
  download: '4. Verifizierung & Download',
  webflash: '5. Browser-Flash',
  done: '6. Fertig',
};

interface WifiNetwork {
  ssid: string;
  password: string;
  /** Pre-filled from tenant settings — password stored server-side */
  isTenant?: boolean;
  /** If true, the backend uses the stored password instead of the one sent */
  use_stored?: boolean;
}

const FLASH_INFO: Record<string, { mode: string; size: string; chip: string; erase: string; offset: string }> = {
  'esp32-s3': { mode: 'dio', size: '8MB', chip: 'esp32s3', erase: 'esptool.py --chip esp32s3 erase_flash', offset: '0x0' },
  'esp32-c3': { mode: 'qio', size: '4MB', chip: 'esp32c3', erase: 'esptool.py --chip esp32c3 erase_flash', offset: '0x0' },
  'esp32-s3-gps': { mode: 'dio', size: '8MB', chip: 'esp32s3', erase: 'esptool.py --chip esp32s3 erase_flash', offset: '0x0' },
};

const BOOT_MODE_INFO: Record<string, { port: string; auto: string; manual: { steps: string[]; buttons: string; note?: string } }> = {
  'esp32-s3': {
    port: '/dev/ttyACM0 (Linux) oder COM-Port (Windows)',
    auto: 'Die meisten ESP32-S3 DevKits haben einen USB-JTAG/Serial-Port. Wenn das Board per nativem USB (USB-C direkt am Chip) angeschlossen ist, ist meist kein manueller Boot-Modus nötig — esptool kann den ESP automatisch resetten.',
    manual: {
      buttons: 'BOOT + RST (RESET/EN)',
      steps: [
        'BOOT-Taste gedrückt halten',
        'RST-Taste kurz drücken (während BOOT gehalten wird)',
        'BOOT-Taste loslassen',
        'Das Board ist jetzt im Download-Modus (bereit zum Flashen)',
      ],
      note: 'Der ESP32-S3 hat zwei USB-Anschlüsse auf manchen Boards: USB (nativ, ttyACM) und UART (ttyUSB). Für den Flash-Modus den nativen USB-Port verwenden.',
    },
  },
  'esp32-c3': {
    port: '/dev/ttyACM0 oder /dev/ttyUSB0 (je nach Board)',
    auto: 'ESP32-C3 DevKits mit USB-Serial/JTAG unterstützen automatischen Reset über DTR/RTS. Bei USB-CDC Boards (nativ USB) muss der Boot-Modus manuell aktiviert werden.',
    manual: {
      buttons: 'BOOT (GPIO9) + RST (RESET/EN)',
      steps: [
        'BOOT-Taste (GPIO9) gedrückt halten',
        'RST-Taste kurz drücken',
        'BOOT-Taste loslassen',
        'Download-Modus aktiv',
      ],
    },
  },
  'esp32-s3-gps': {
    port: '/dev/ttyACM0 (Linux) oder COM-Port (Windows)',
    auto: 'Gleiches Vorgehen wie beim ESP32-S3 — das Board basiert auf demselben Chip. Nativer USB unterstützt automatischen Reset.',
    manual: {
      buttons: 'BOOT + RST (RESET/EN)',
      steps: [
        'BOOT-Taste gedrückt halten',
        'RST-Taste kurz drücken (während BOOT gehalten wird)',
        'BOOT-Taste loslassen',
        'Das Board ist jetzt im Download-Modus (bereit zum Flashen)',
      ],
      note: 'GPS-Modul und RGB-Taster sind fest verdrahtet (GPIO 17/18 UART, GPIO 4/5/6/7 für Button+LEDs) — nichts muss zum Flashen abgesteckt werden.',
    },
  },
};

function ChecklistItem({ check }: { check: FirmwareCheck }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = check.expected || check.actual || check.detail;

  return (
    <div
      data-testid={`check-${check.name.replace(/\s+/g, '-').toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: hasDetails ? 'pointer' : 'default',
      }}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      <span style={{
        fontSize: 14, lineHeight: '18px', flexShrink: 0,
        color: check.ok ? '#22c55e' : '#ef4444',
      }}>
        {check.ok ? '\u2713' : '\u2717'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: check.ok ? 'var(--text-primary)' : '#ef4444',
          }}>
            {check.name}
          </span>
          {check.actual && (
            <span style={{
              fontSize: 10, color: 'var(--text-muted)',
              padding: '0 5px', background: 'var(--bg-tertiary)',
              borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis', maxWidth: 180,
            }}>
              {check.actual}
            </span>
          )}
          {hasDetails && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {expanded ? '\u25B2' : '\u25BC'}
            </span>
          )}
        </div>
        {expanded && hasDetails && (
          <div style={{
            marginTop: 4, padding: '4px 8px', fontSize: 10,
            background: 'var(--bg-tertiary)', borderRadius: 4,
            color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            {check.expected && <div>Erwartet: <strong>{check.expected}</strong></div>}
            {check.actual && <div>Aktuell: <strong>{check.actual}</strong></div>}
            {check.detail && <div style={{ color: check.ok ? 'var(--text-secondary)' : '#ef4444' }}>{check.detail}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistSummary({ checks }: { checks: FirmwareCheck[] }) {
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;
  const total = checks.length;
  const allOk = failed === 0;

  return (
    <div data-testid="firmware-checklist" style={{
      background: 'var(--bg-primary)', border: `1px solid ${allOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 8, padding: 14, marginBottom: 16,
    }}>
      {/* Header with summary */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        paddingBottom: 8, borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 16,
          color: allOk ? '#22c55e' : '#ef4444',
        }}>
          {allOk ? '\u2713' : '\u26A0'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: allOk ? '#22c55e' : '#ef4444',
          }}>
            {allOk ? 'Alle Checks bestanden' : `${failed} Check${failed > 1 ? 's' : ''} fehlgeschlagen`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {passed}/{total} bestanden
          </div>
        </div>
        {/* Mini progress */}
        <div style={{
          width: 60, height: 6, background: 'var(--bg-tertiary)',
          borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${(passed / total) * 100}%`, height: '100%',
            background: allOk ? '#22c55e' : '#ef4444',
            borderRadius: 3, transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Individual checks */}
      <div>
        {checks.map((check, i) => (
          <ChecklistItem key={i} check={check} />
        ))}
      </div>
    </div>
  );
}

function BootModeInstructions({ hardwareType, compact }: { hardwareType: string; compact?: boolean }) {
  const info = BOOT_MODE_INFO[hardwareType];
  if (!info) return null;

  if (compact) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 10px',
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
      }}>
        <strong style={{ color: '#3b82f6' }}>Boot-Modus ({hardwareType.toUpperCase()}):</strong>{' '}
        {info.manual.steps.map((s, i) => (
          <span key={i}>{i > 0 ? ' \u2192 ' : ' '}{s}</span>
        ))}
        <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          Port: <code style={{ fontSize: 10 }}>{info.port}</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, marginTop: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
        Boot-Modus: {hardwareType.toUpperCase()}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
        {info.auto}
      </div>

      <div style={{
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
        borderRadius: 6, padding: 10, marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', marginBottom: 6 }}>
          Manueller Download-Modus (Tasten: {info.manual.buttons})
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          {info.manual.steps.map((step, i) => (
            <li key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{step}</li>
          ))}
        </ol>
      </div>

      {info.manual.note && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {info.manual.note}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        Serieller Port: <code style={{ fontSize: 10 }}>{info.port}</code>
      </div>
    </div>
  );
}

export default function ReceiverFlashWizard({ node, onClose, regenerateKey: _regenKeyProp = false, initialStep = 'intro' }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  // When the wizard is opened in shortcut mode (directly on a later step),
  // Zurück closes instead of hopping back into a never-run download step.
  const shortcutMode = initialStep !== 'intro';
  // Backend URL is managed centrally in Einstellungen (firmware_backend_url)
  const [backendUrl, setBackendUrl] = useState('');
  const [backendUrlLoaded, setBackendUrlLoaded] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [tenantNetworksLoaded, setTenantNetworksLoaded] = useState(false);
  // API key: only regenerate if user explicitly checks the box (or first build)
  const isFirstBuild = !node.lastBuildAt;
  const [regenerateKey, setRegenerateKey] = useState(isFirstBuild);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [buildResult, setBuildResult] = useState<{ size: number; checks: FirmwareCheck[]; sha256: string; flash_mode: string } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flashInfo = FLASH_INFO[node.hardwareType] || FLASH_INFO['esp32-s3'];

  // Load tenant WiFi networks + firmware backend URL on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tenantNets, settings] = await Promise.all([
          fetchWifiNetworks(),
          fetchSettings().catch(() => ({ sources: {}, firmware_backend_url: '' })),
        ]);
        if (cancelled) return;
        setBackendUrl(settings.firmware_backend_url || '');
        if (tenantNets.length > 0) {
          setWifiNetworks(tenantNets.map(n => ({
            ssid: n.ssid,
            password: '',
            isTenant: true,
            use_stored: !!n.has_password,
          })));
        } else {
          setWifiNetworks([{ ssid: '', password: '' }]);
        }
      } catch {
        if (!cancelled) {
          setWifiNetworks([{ ssid: '', password: '' }]);
        }
      } finally {
        if (!cancelled) {
          setTenantNetworksLoaded(true);
          setBackendUrlLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildLog]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const updateNetwork = (index: number, field: 'ssid' | 'password', value: string) => {
    setWifiNetworks(prev => prev.map((n, i) => {
      if (i !== index) return n;
      const updated = { ...n, [field]: value };
      // When user types a password for a tenant network, stop using stored password
      if (field === 'password' && value && n.isTenant) {
        updated.use_stored = false;
      }
      // If user clears password on tenant network that had stored password, re-enable use_stored
      if (field === 'password' && !value && n.isTenant) {
        updated.use_stored = true;
      }
      return updated;
    }));
  };
  const addNetwork = () => {
    if (wifiNetworks.length < 3) setWifiNetworks(prev => [...prev, { ssid: '', password: '' }]);
  };
  const removeNetwork = (index: number) => {
    if (wifiNetworks.length > 0) setWifiNetworks(prev => prev.filter((_, i) => i !== index));
  };

  const startPolling = useCallback((nodeId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await pollBuildStatus(nodeId);
        setBuildLog(status.log);

        if (status.status === 'done' && status.result) {
          if (pollRef.current) clearInterval(pollRef.current);
          setBuildResult({
            size: status.result.size,
            checks: status.checks || [],
            sha256: status.result.sha256,
            flash_mode: status.result.flash_mode,
          });
          setBuilding(false);
          setStep('download');
        } else if (status.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(status.error || 'Build fehlgeschlagen');
          setBuilding(false);
        }
      } catch { /* ignore poll errors */ }
    }, 800);
  }, []);

  const handleBuild = async () => {
    setBuilding(true);
    setError(null);
    setBuildLog([]);
    setBuildResult(null);
    setStep('build');

    try {
      const networks = wifiNetworks
        .filter(n => n.ssid.trim())
        .map(n => {
          if (n.use_stored) {
            return { ssid: n.ssid, use_stored: true as const };
          }
          return { ssid: n.ssid, password: n.password };
        });
      await startBuildAsync({
        node_id: node.id,
        backend_url: backendUrl,
        wifi_networks: networks.length > 0 ? networks : undefined,
        regenerate_key: regenerateKey,
      });
      // Build started — poll for progress
      startPolling(node.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Build-Start fehlgeschlagen');
      setBuilding(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await downloadFirmware(node.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flightarc-${node.hardwareType}-${node.id}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Download fehlgeschlagen');
    }
  };

  const hasWebSerial = 'serial' in navigator;

  return (
    <div data-testid="flash-wizard-overlay" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div data-testid="flash-wizard" style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: '100%',
        maxWidth: 580,
        maxHeight: '90vh',
        overflow: 'auto',
        margin: '0 12px',
        padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h2 data-testid="flash-wizard-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>
            Flash-Wizard: {node.name}
          </h2>
          <button data-testid="flash-wizard-close" onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 20, padding: 4,
          }}>x</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {(Object.keys(STEP_LABELS) as Step[]).map(s => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: s === step ? '#14b8a6' :
                Object.keys(STEP_LABELS).indexOf(s) < Object.keys(STEP_LABELS).indexOf(step) ? '#14b8a6' : 'var(--border)',
            }} />
          ))}
        </div>
        <div data-testid="flash-wizard-step-label" style={{ fontSize: 12, color: '#14b8a6', marginBottom: 16, fontWeight: 600 }}>
          {STEP_LABELS[step]}
        </div>

        {error && (
          <div data-testid="flash-wizard-error" style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12,
            color: 'var(--status-error)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Fehler:</div>
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflow: 'auto',
            }}>{error}</pre>
          </div>
        )}

        {/* Step: Intro */}
        {step === 'intro' && (
          <div data-testid="flash-step-intro">
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              <p style={{ marginBottom: 8 }}>
                Dieser Wizard erstellt eine angepasste Firmware für deinen <strong>{node.hardwareType.toUpperCase()}</strong> Empfänger
                und hilft beim Flashen.
              </p>
              <div style={{
                background: 'var(--bg-primary)', borderRadius: 8, padding: 12, marginBottom: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Voraussetzungen:</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <li>{node.hardwareType.toUpperCase()} Board mit USB-Anschluss</li>
                  <li>USB-Kabel (Daten, nicht nur Laden)</li>
                  {!hasWebSerial && <li style={{ color: '#eab308' }}>Chrome oder Edge Browser (für Web Serial)</li>}
                </ul>
              </div>

              {/* Board-specific flash info */}
              <div style={{
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 8, padding: 12, marginBottom: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#3b82f6' }}>
                  Flash-Konfiguration: {node.hardwareType.toUpperCase()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <div>Flash-Modus: <strong style={{ color: 'var(--text-primary)' }}>{flashInfo.mode.toUpperCase()}</strong></div>
                  <div>Flash-Größe: <strong style={{ color: 'var(--text-primary)' }}>{flashInfo.size}</strong></div>
                  <div>Chip: <strong style={{ color: 'var(--text-primary)' }}>{flashInfo.chip}</strong></div>
                  <div>Partition: <strong style={{ color: 'var(--text-primary)' }}>{node.hardwareType === 'esp32-s3' ? '8MB (OTA)' : '4MB (OTA)'}</strong></div>
                </div>
              </div>

              {/* Boot mode instructions */}
              <BootModeInstructions hardwareType={node.hardwareType} />
            </div>
            <button data-testid="flash-wizard-next" onClick={() => setStep('config')} style={primaryBtnStyle}>Weiter</button>
          </div>
        )}

        {/* Step: Config */}
        {step === 'config' && (
          <div data-testid="flash-step-config">
            <div style={{ fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>
              Konfiguriere die Firmware-Parameter. WiFi-Daten sind optional und können
              später über das Captive Portal des Empfängers konfiguriert werden.
              Du kannst bis zu 3 Netzwerke hinterlegen — der Empfänger verbindet sich automatisch
              mit dem stärksten verfügbaren.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Backend-URL</label>
              <div
                data-testid="flash-backend-url"
                style={{
                  ...inputStyle,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bg-tertiary)', cursor: 'default',
                  fontFamily: 'monospace', fontSize: 12,
                  wordBreak: 'break-all',
                  color: backendUrl ? 'var(--text-primary)' : 'var(--status-error)',
                }}
              >
                {!backendUrlLoaded
                  ? <span style={{ color: 'var(--text-muted)' }}>Lade…</span>
                  : backendUrl || 'Nicht gesetzt — in Einstellungen eintragen'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Wird zentral unter <strong>Einstellungen → Firmware Backend-URL</strong> gepflegt.
                Muss extern erreichbar sein (keine LAN-IP).
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>WiFi-Netzwerke (optional)</label>
                {wifiNetworks.length < 3 && (
                  <button
                    data-testid="flash-wifi-add"
                    onClick={addNetwork}
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                      color: '#14b8a6', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
                    }}
                  >
                    + Netzwerk
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#eab308', marginBottom: 8 }}>
                Nur 2,4-GHz-Netzwerke. iPhone-Hotspot: &quot;Kompatibilit&auml;t maximieren&quot; aktivieren. Details im Handbuch.
              </div>
              {!tenantNetworksLoaded ? (
                <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>Lade WiFi-Netzwerke...</div>
              ) : wifiNetworks.map((net, i) => (
                <div
                  key={i}
                  data-testid={`flash-wifi-network-${i}`}
                  style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${net.isTenant ? 'rgba(20,184,166,0.3)' : 'var(--border)'}`,
                    borderRadius: 8, padding: 10, marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flex: 1 }}>
                      Netzwerk {i + 1}
                      {net.isTenant && (
                        <span data-testid={`flash-wifi-tenant-badge-${i}`} style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 700,
                          padding: '1px 5px', borderRadius: 3,
                          background: 'rgba(20,184,166,0.15)', color: '#14b8a6',
                          verticalAlign: 'middle', textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Mandant
                        </span>
                      )}
                    </span>
                    <button
                      data-testid={`flash-wifi-remove-${i}`}
                      onClick={() => removeNetwork(i)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 14, padding: '0 4px',
                      }}
                    >x</button>
                  </div>
                  <input
                    data-testid={`flash-wifi-ssid-${i}`}
                    value={net.ssid}
                    onChange={e => updateNetwork(i, 'ssid', e.target.value)}
                    placeholder="SSID"
                    style={{ ...inputStyle, marginBottom: 6 }}
                  />
                  <input
                    data-testid={`flash-wifi-pass-${i}`}
                    type="password"
                    value={net.password}
                    onChange={e => updateNetwork(i, 'password', e.target.value)}
                    placeholder={net.use_stored ? 'Gespeichertes Passwort' : 'Passwort'}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{
              background: 'var(--bg-primary)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12,
            }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                Hardware: {node.hardwareType.toUpperCase()} | Flash: {flashInfo.mode.toUpperCase()} | {flashInfo.size}
              </div>
              {isFirstBuild ? (
                <div style={{ color: '#14b8a6', fontSize: 12 }}>
                  Erster Build — neuer API-Key wird automatisch erstellt.
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={regenerateKey}
                    onChange={e => setRegenerateKey(e.target.checked)}
                    style={{ accentColor: '#ef4444' }}
                  />
                  <span style={{ color: regenerateKey ? '#ef4444' : 'var(--text-muted)' }}>
                    Neuen API-Key generieren {regenerateKey && '(alter Key wird ungültig!)'}
                  </span>
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('intro')} style={secondaryBtnStyle}>Zurück</button>
              <button
                onClick={() => { setStep('build'); handleBuild(); }}
                disabled={!backendUrl}
                style={{ ...primaryBtnStyle, opacity: backendUrl ? 1 : 0.5 }}
              >
                Firmware bauen
              </button>
            </div>
          </div>
        )}

        {/* Step: Build (Live Terminal) */}
        {step === 'build' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: building ? '#14b8a6' : 'var(--text-primary)' }}>
              {building ? 'Firmware wird kompiliert...' : error ? 'Build fehlgeschlagen' : 'Build abgeschlossen'}
            </div>

            {/* Live terminal */}
            <div data-testid="build-terminal" style={{
              background: '#0d1117', border: '1px solid #30363d',
              borderRadius: 8, padding: 10, marginBottom: 12,
              height: 220, overflow: 'auto', fontFamily: 'monospace',
              fontSize: 10, lineHeight: 1.5, color: '#c9d1d9',
            }}>
              {buildLog.map((line, i) => (
                <div key={i} style={{
                  color: line.includes('error') || line.includes('Error') || line.includes('FAILED')
                    ? '#f85149'
                    : line.includes('SUCCESS') || line.includes('Verifizierung')
                      ? '#3fb950'
                      : line.includes('Compiling') || line.includes('Building')
                        ? '#58a6ff'
                        : line.includes('Linking') || line.includes('Creating')
                          ? '#d2a8ff'
                          : line.startsWith('[Build]')
                            ? '#14b8a6'
                            : '#8b949e',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {line}
                </div>
              ))}
              {building && (
                <div style={{ color: '#14b8a6' }}>
                  {'> _'}
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            {building && (
              <div style={{
                width: '100%', height: 3, background: 'var(--bg-tertiary)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: '#14b8a6', borderRadius: 2,
                  animation: 'progress 2s infinite', width: '40%',
                }} />
              </div>
            )}

            {!building && error && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setStep('config')} style={secondaryBtnStyle}>Zurück</button>
                <button onClick={handleBuild} style={primaryBtnStyle}>Erneut versuchen</button>
              </div>
            )}
          </div>
        )}

        {/* Step: Download (with verification checklist) */}
        {step === 'download' && (
          <div>
            {/* Compile success banner */}
            <div style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
              borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: '#22c55e',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>{'\u2713'}</span>
              <div>
                <div style={{ fontWeight: 600 }}>Kompilierung erfolgreich</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  {buildResult && `${(buildResult.size / 1024).toFixed(0)} KB`}
                  {buildResult?.flash_mode && ` | ${buildResult.flash_mode.toUpperCase()}`}
                  {` | ${flashInfo.chip}`}
                </div>
              </div>
            </div>

            {/* Verification checklist */}
            {buildResult && buildResult.checks.length > 0 && (
              <ChecklistSummary checks={buildResult.checks} />
            )}

            {/* Web-Flash — primary action when the browser supports it and
                the checks passed. Kept above the .bin download so it's the
                first thing the user sees. */}
            {hasWebSerial && !buildResult?.checks.some(c => !c.ok) && (
              <button
                data-testid="flash-webflash-btn"
                onClick={() => setStep('webflash')}
                style={{
                  ...primaryBtnStyle,
                  marginBottom: 8,
                }}
              >
                {'⚡'} Jetzt über USB flashen (Browser)
              </button>
            )}

            {/* Download button */}
            <button
              data-testid="flash-download-btn"
              onClick={handleDownload}
              disabled={buildResult?.checks.some(c => !c.ok)}
              style={{
                ...(hasWebSerial ? secondaryBtnStyle : primaryBtnStyle),
                marginBottom: 16,
                opacity: buildResult?.checks.some(c => !c.ok) ? 0.5 : 1,
                cursor: buildResult?.checks.some(c => !c.ok) ? 'not-allowed' : 'pointer',
              }}
            >
              {buildResult?.checks.some(c => !c.ok)
                ? 'Download gesperrt — Checks fehlgeschlagen'
                : 'Oder: .bin-Datei herunterladen'}
            </button>

            {/* Flash instructions */}
            <div style={{
              background: 'var(--bg-primary)', borderRadius: 8, padding: 14, fontSize: 12,
              lineHeight: 1.6, color: 'var(--text-secondary)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                Manuelles Flashen mit esptool:
              </div>
              <code style={{
                display: 'block', background: 'var(--bg-tertiary)',
                padding: 10, borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
                wordBreak: 'break-all', whiteSpace: 'pre-wrap',
              }}>
{`# 1. Flash komplett löschen (wichtig beim ersten Flashen!)
${flashInfo.erase}

# 2. Firmware flashen
esptool.py --chip ${flashInfo.chip} --port /dev/ttyUSB0 \\
  --baud 460800 write_flash \\
  --flash_mode ${flashInfo.mode} --flash_size ${flashInfo.size} \\
  ${flashInfo.offset} flightarc-${node.hardwareType}-${node.id}.bin

# Windows: --port COM3 (o.ä.) statt /dev/ttyUSB0`}
              </code>

              {/* Boot mode reminder */}
              <BootModeInstructions hardwareType={node.hardwareType} compact />

              {/* SHA-256 troubleshooting hint */}
              <div style={{
                marginTop: 10, padding: '8px 10px',
                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
                borderRadius: 6, fontSize: 11, color: '#eab308',
              }}>
                <strong>SHA-256 Boot-Loop?</strong> Falls der ESP nach dem Flashen in einer
                Endlosschleife mit "SHA-256 comparison failed" startet: Flash zuerst komplett
                löschen mit <code>erase_flash</code> (Schritt 1), dann erneut flashen.
              </div>
            </div>
          </div>
        )}

        {/* Step: Web-Flash (Browser via USB using esp-web-tools) */}
        {step === 'webflash' && (
          <div data-testid="flash-step-webflash">
            <div style={{
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12,
              color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#3b82f6' }}>
                {'⚡'} Browser-Flash (Web Serial)
              </div>
              <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                <li>ESP per USB-Kabel am PC anschliessen (Datenkabel, nicht nur Laden)</li>
                <li>Unten auf <strong>„Verbinden"</strong> klicken — ein Browser-Dialog fragt nach dem USB-Port</li>
                <li>Den passenden seriellen Port auswählen (meist <code>USB JTAG/serial debug unit</code> oder <code>USB-SERIAL CH340</code>)</li>
                <li>„Install FlightArc" bestätigen — der Flash-Vorgang startet automatisch (inkl. Erase + Bootloader + App)</li>
                <li>Nach „Done" den ESP kurz vom Strom trennen, dann wieder anschließen — er bootet in die neue Firmware</li>
              </ol>
            </div>

            <BootModeInstructions hardwareType={node.hardwareType} compact />

            <div style={{
              display: 'flex', justifyContent: 'center',
              padding: 16, marginTop: 12, marginBottom: 16,
              background: 'var(--bg-primary)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <esp-web-install-button
                data-testid="esp-web-install-button"
                manifest={(() => {
                  // esp-web-tools uses plain fetch() without auth headers —
                  // pass the access_token as query param so the backend can
                  // authenticate the same user that already loaded this page.
                  const token = localStorage.getItem('access_token') || '';
                  const url = new URL(`${API_BASE}/receivers/firmware/manifest/${node.id}`, window.location.origin);
                  url.searchParams.set('token', token);
                  return url.toString();
                })()}
                erase-first
              >
                <button slot="activate" style={{
                  ...primaryBtnStyle,
                  width: 'auto',
                  minWidth: 220,
                }}>
                  Verbinden & flashen
                </button>
                <span slot="unsupported" style={{ fontSize: 12, color: 'var(--status-error)' }}>
                  Dieser Browser unterstützt Web Serial nicht. Nutze Chrome oder Edge auf Desktop,
                  oder lade die <code>.bin</code> herunter und flashe mit esptool.
                </span>
                <span slot="not-allowed" style={{ fontSize: 12, color: '#eab308' }}>
                  Web Serial benötigt HTTPS oder localhost. Öffne die Seite über
                  <code> https://hub.dasilvafelix.de</code> oder <code>http://localhost:3020</code>.
                </span>
              </esp-web-install-button>
            </div>

            <div style={{
              padding: '8px 10px', marginBottom: 12,
              background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: 6, fontSize: 11, color: '#eab308',
            }}>
              <strong>Fehler „ESP nicht erkannt"?</strong> Manche ESP32-S3-Boards müssen erst
              in den Download-Modus gebracht werden: BOOT halten → RST kurz drücken → BOOT loslassen,
              dann „Verbinden" erneut klicken.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => shortcutMode ? onClose() : setStep('download')}
                style={secondaryBtnStyle}
              >
                {shortcutMode ? 'Schliessen' : 'Zurück'}
              </button>
              <button onClick={() => setStep('done')} style={primaryBtnStyle}>Fertig</button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{'\u2713'}</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              Firmware heruntergeladen!
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Flashe die Firmware auf den ESP, verbinde ihn mit Strom und warte auf den ersten Heartbeat.
              Wenn kein WLAN konfiguriert ist, erstellt der Empfänger nach ~8s einen WiFi-Hotspot "FlightArc-..." für die Konfiguration.
              Das Captive Portal öffnet sich nach dem Verbinden mit dem Hotspot automatisch.
              <br /><strong>Hinweis:</strong> iOS benötigt ca. 30–45s, Android 5–15s bis das Portal-Popup erscheint.
              Alternativ direkt <strong>http://192.168.4.1</strong> im Browser öffnen.
            </div>
            <button onClick={onClose} style={primaryBtnStyle}>Schliessen</button>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#14b8a6',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};
