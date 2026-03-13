import { useState } from 'react';
import { buildFirmware } from '../../api';
import type { ReceiverNode } from '../../api';

interface Props {
  node: ReceiverNode;
  onClose: () => void;
}

type Step = 'intro' | 'config' | 'build' | 'download' | 'done';

const STEP_LABELS: Record<Step, string> = {
  intro: '1. Vorbereitung',
  config: '2. Konfiguration',
  build: '3. Firmware bauen',
  download: '4. Firmware herunterladen',
  done: '5. Fertig',
};

export default function ReceiverFlashWizard({ node, onClose }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [backendUrl, setBackendUrl] = useState(window.location.origin);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmwareBlob, setFirmwareBlob] = useState<Blob | null>(null);

  const isEsp8266 = node.hardwareType === 'esp8266';

  const handleBuild = async () => {
    setBuilding(true);
    setError(null);
    try {
      const blob = await buildFirmware({
        node_id: node.id,
        backend_url: backendUrl,
        wifi_ssid: wifiSsid,
        wifi_password: wifiPass,
      });
      setFirmwareBlob(blob);
      setStep('download');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Build fehlgeschlagen');
    } finally {
      setBuilding(false);
    }
  };

  const handleDownload = () => {
    if (!firmwareBlob) return;
    const url = URL.createObjectURL(firmwareBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flightarc-${node.hardwareType}-${node.id}.bin`;
    a.click();
    URL.revokeObjectURL(url);
    setStep('done');
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
        width: 520,
        maxHeight: '80vh',
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
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13,
            color: 'var(--status-error)',
          }}>{error}</div>
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
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>WiFi SSID (optional)</label>
              <input
                data-testid="flash-wifi-ssid"
                value={wifiSsid}
                onChange={e => setWifiSsid(e.target.value)}
                placeholder="Dein WiFi-Netzwerk"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>WiFi Passwort (optional)</label>
              <input
                data-testid="flash-wifi-pass"
                type="password"
                value={wifiPass}
                onChange={e => setWifiPass(e.target.value)}
                placeholder="WiFi-Passwort"
                style={inputStyle}
              />
            </div>
            <div style={{
              background: 'var(--bg-primary)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12,
            }}>
              <div style={{ color: 'var(--text-muted)' }}>API-Key wird automatisch in die Firmware eingebettet.</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Hardware: {node.hardwareType.toUpperCase()}</div>
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

        {/* Step: Build */}
        {step === 'build' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {building ? (
              <>
                <div style={{ fontSize: 14, marginBottom: 12 }}>Firmware wird kompiliert...</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Dies kann 30-60 Sekunden dauern.
                </div>
                <div style={{
                  width: '100%', height: 4, background: 'var(--bg-tertiary)',
                  borderRadius: 2, marginTop: 16, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', background: '#14b8a6', borderRadius: 2,
                    animation: 'progress 2s infinite',
                    width: '40%',
                  }} />
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => setStep('config')} style={secondaryBtnStyle}>Zurück</button>
                <button onClick={handleBuild} style={primaryBtnStyle}>Erneut versuchen</button>
              </div>
            )}
          </div>
        )}

        {/* Step: Download */}
        {step === 'download' && (
          <div>
            <div style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
              borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: '#22c55e',
            }}>
              Firmware erfolgreich gebaut!
              {firmwareBlob && ` (${(firmwareBlob.size / 1024).toFixed(0)} KB)`}
            </div>

            <button onClick={handleDownload} style={{ ...primaryBtnStyle, marginBottom: 16 }}>
              Firmware herunterladen (.bin)
            </button>

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
                wordBreak: 'break-all',
              }}>
                esptool.py --chip {node.hardwareType.replace('esp32-', 'esp32')} --port /dev/ttyUSB0 write_flash 0x0 flightarc-{node.hardwareType}-{node.id}.bin
              </code>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>OK</div>
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
