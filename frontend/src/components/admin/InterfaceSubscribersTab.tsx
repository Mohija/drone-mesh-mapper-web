import { useEffect, useState } from 'react';
import {
  AlarmSubscription, listInterfaceSubscriptions,
  revokeInterfaceSubscription, testInterfaceSubscription,
  rotateInterfaceApiKey, AlarmInterface,
} from '../../api';

interface Props {
  iface: AlarmInterface;
  onApiKeyRotated?: (key: string) => void;
}

export default function InterfaceSubscribersTab({ iface, onApiKeyRotated }: Props) {
  const [subs, setSubs] = useState<AlarmSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; status?: number; error?: string } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await listInterfaceSubscriptions(iface.id);
      setSubs(r.items);
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [iface.id]);

  async function handleRotate() {
    if (!confirm('Den API-Key wirklich rotieren? Alle bestehenden Drittsysteme müssen den neuen Key erhalten.')) return;
    setRotating(true);
    try {
      const r = await rotateInterfaceApiKey(iface.id);
      setNewKey(r.apiKey);
      onApiKeyRotated?.(r.apiKey);
    } catch (e) { alert((e as Error).message); }
    finally { setRotating(false); }
  }

  async function handleRevoke(sub: AlarmSubscription) {
    if (!confirm(`Abonnement "${sub.name || sub.callbackUrl}" wirklich entfernen?`)) return;
    await revokeInterfaceSubscription(iface.id, sub.id);
    await reload();
  }

  async function handleTest(sub: AlarmSubscription) {
    setTesting(sub.id);
    setTestResult(null);
    try {
      const r = await testInterfaceSubscription(iface.id, sub.id);
      setTestResult({ id: sub.id, ...r });
    } catch (e) {
      setTestResult({ id: sub.id, ok: false, error: (e as Error).message });
    } finally { setTesting(null); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{
        padding: 12, background: 'var(--bg-primary)',
        border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>API-Key des Channels</p>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Drittsysteme verwenden diesen Key, um sich am Channel zu registrieren
          (Header <code>X-API-Key</code>). Aus Sicherheitsgründen wird der vollständige Key
          nur einmal angezeigt — danach kann nur der Prefix in der UI eingesehen werden.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{
            padding: '6px 10px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 4, fontSize: 12,
          }}>{iface.apiKeyPrefix || '(noch nicht generiert)'}…</code>
          <button onClick={handleRotate} disabled={rotating} style={{
            padding: '6px 12px', background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)', borderRadius: 4, fontSize: 12,
            color: 'var(--text-primary)', cursor: rotating ? 'wait' : 'pointer',
            minHeight: 32,
          }}>{rotating ? 'Rotiert…' : iface.apiKeyPrefix ? 'Key rotieren' : 'Key generieren'}</button>
        </div>
        {newKey && (
          <div style={{
            marginTop: 10, padding: 10, background: 'rgba(0,212,170,0.10)',
            border: '1px solid var(--accent)', borderRadius: 6,
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600 }}>
              Neuer API-Key (nur einmalig sichtbar):
            </p>
            <code style={{
              display: 'block', padding: 8, background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 4,
              fontSize: 11, wordBreak: 'break-all',
            }}>{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); }} style={{
              marginTop: 6, padding: '4px 10px', fontSize: 11,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
            }}>Kopieren</button>
          </div>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Registrierte Subscriber ({subs.length})
          </p>
          <button onClick={reload} style={{
            padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 4, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
          }}>Aktualisieren</button>
        </div>

        {loading && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Lädt…</p>}
        {!loading && subs.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Noch keine Subscriber registriert. Drittsysteme können sich mit dem API-Key am
            Endpoint <code>/api/integrations/subscriptions/{iface.id}/register</code> anmelden.
          </p>
        )}
        {!loading && subs.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {subs.map(sub => {
              const healthColor = sub.failCount === 0 && sub.lastSuccessAt
                ? 'var(--accent)'
                : sub.failCount >= 3 ? '#ef4444' : 'var(--text-muted)';
              return (
                <div key={sub.id} style={{
                  padding: 10, background: 'var(--bg-primary)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  display: 'grid', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: healthColor }} />
                    <strong style={{ fontSize: 12 }}>{sub.name || '(unbenannt)'}</strong>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{sub.callbackUrl}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>angelegt {new Date(sub.createdAt * 1000).toLocaleString()}</span>
                    {sub.lastSuccessAt && <span>• zuletzt OK {new Date(sub.lastSuccessAt * 1000).toLocaleString()}</span>}
                    {sub.failCount > 0 && <span style={{ color: '#ef4444' }}>• {sub.failCount} Fehler in Folge</span>}
                  </div>
                  {sub.lastError && <p style={{ margin: 0, fontSize: 10, color: '#ef4444' }}>{sub.lastError}</p>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleTest(sub)} disabled={testing === sub.id} style={miniBtn}>
                      {testing === sub.id ? 'Sendet…' : 'Test-Push'}
                    </button>
                    <button onClick={() => handleRevoke(sub)} style={{ ...miniBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                      Entfernen
                    </button>
                  </div>
                  {testResult && testResult.id === sub.id && (
                    <div style={{
                      padding: 6, fontSize: 10, borderRadius: 4,
                      background: testResult.ok ? 'rgba(0,212,170,0.10)' : 'rgba(239,68,68,0.10)',
                      border: `1px solid ${testResult.ok ? 'var(--accent)' : '#ef4444'}`,
                    }}>
                      {testResult.ok ? '✓ Erfolg' : '✗ Fehler'}
                      {testResult.status && ` • HTTP ${testResult.status}`}
                      {testResult.error && ` • ${testResult.error}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text-primary)', cursor: 'pointer', minHeight: 28,
};
