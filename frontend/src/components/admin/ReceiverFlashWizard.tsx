import { useState, useRef, useEffect, useCallback } from 'react';
import { startBuildAsync, pollBuildStatus, downloadFirmware } from '../../api';
import type { ReceiverNode, FirmwareCheck } from '../../api';

interface Props {
  node: ReceiverNode;
  onClose: () => void;
  regenerateKey?: boolean;
}

type Step = 'intro' | 'config' | 'build' | 'download' | 'done';

const STEP_LABELS: Record<Step, string> = {
  intro: '1. Vorbereitung',
  config: '2. Konfiguration',
  build: '3. Firmware bauen',
  download: '4. Verifizierung & Download',
  done: '5. Fertig',
};

interface WifiNetwork {
  ssid: string;
  password: string;
}

const FLASH_INFO: Record<string, { mode: string; size: string; chip: string; erase: string; offset: string }> = {
  'esp32-s3': { mode: 'dio', size: '8MB', chip: 'esp32s3', erase: 'esptool.py --chip esp32s3 erase_flash', offset: '0x0' },
  'esp32-c3': { mode: 'qio', size: '4MB', chip: 'esp32c3', erase: 'esptool.py --chip esp32c3 erase_flash', offset: '0x0' },
  'esp8266':  { mode: 'qio', size: '4MB', chip: 'esp8266', erase: 'esptool.py --chip esp8266 erase_flash', offset: '0x0' },
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

export default function ReceiverFlashWizard({ node, onClose, regenerateKey = false }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [backendUrl, setBackendUrl] = useState(window.location.origin);
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([{ ssid: '', password: '' }]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [buildResult, setBuildResult] = useState<{ size: number; checks: FirmwareCheck[]; sha256: string; flash_mode: string } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isEsp8266 = node.hardwareType === 'esp8266';
  const flashInfo = FLASH_INFO[node.hardwareType] || FLASH_INFO['esp32-s3'];

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildLog]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const updateNetwork = (index: number, field: keyof WifiNetwork, value: string) => {
    setWifiNetworks(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
  };
  const addNetwork = () => {
    if (wifiNetworks.length < 3) setWifiNetworks(prev => [...prev, { ssid: '', password: '' }]);
  };
  const removeNetwork = (index: number) => {
    if (wifiNetworks.length > 1) setWifiNetworks(prev => prev.filter((_, i) => i !== index));
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
      const networks = wifiNetworks.filter(n => n.ssid.trim());
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
        width: 580,
        maxHeight: '90vh',
        overflow: 'auto',
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

              {isEsp8266 && (
                <div style={{
                  padding: '10px 12px', background: 'rgba(234,179,8,0.1)',
                  border: '1px solid #eab308', borderRadius: 8, fontSize: 12, color: '#eab308',
                }}>
                  <strong>ESP8266 Einschränkungen:</strong> Kein BLE (nur WiFi-Beacon ODID),
                  kein HTTPS, eingeschränkter RAM (~80KB).
                </div>
              )}
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
              <label style={labelStyle}>Backend-URL *</label>
              <input
                data-testid="flash-backend-url"
                value={backendUrl}
                onChange={e => setBackendUrl(e.target.value)}
                placeholder="https://your-server.de:3020"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
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
              {wifiNetworks.map((net, i) => (
                <div
                  key={i}
                  data-testid={`flash-wifi-network-${i}`}
                  style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 10, marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flex: 1 }}>
                      Netzwerk {i + 1}
                    </span>
                    {wifiNetworks.length > 1 && (
                      <button
                        data-testid={`flash-wifi-remove-${i}`}
                        onClick={() => removeNetwork(i)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-muted)',
                          cursor: 'pointer', fontSize: 14, padding: '0 4px',
                        }}
                      >x</button>
                    )}
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
                    placeholder="Passwort"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{
              background: 'var(--bg-primary)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12,
            }}>
              <div style={{ color: 'var(--text-muted)' }}>API-Key wird automatisch in die Firmware eingebettet.</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                Hardware: {node.hardwareType.toUpperCase()} | Flash: {flashInfo.mode.toUpperCase()} | {flashInfo.size}
              </div>
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

            {/* Download button */}
            <button
              data-testid="flash-download-btn"
              onClick={handleDownload}
              disabled={buildResult?.checks.some(c => !c.ok)}
              style={{
                ...primaryBtnStyle,
                marginBottom: 16,
                opacity: buildResult?.checks.some(c => !c.ok) ? 0.5 : 1,
                cursor: buildResult?.checks.some(c => !c.ok) ? 'not-allowed' : 'pointer',
              }}
            >
              {buildResult?.checks.some(c => !c.ok)
                ? 'Download gesperrt — Checks fehlgeschlagen'
                : 'Firmware herunterladen (.bin)'}
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

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{'\u2713'}</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              Firmware heruntergeladen!
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Flashe die Firmware auf den ESP, verbinde ihn mit Strom und warte auf den ersten Heartbeat.
              Der Empfänger erstellt einen WiFi-Hotspot "FlightArc-..." für die Konfiguration.
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
