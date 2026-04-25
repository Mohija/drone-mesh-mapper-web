import { useEffect, useState } from 'react';
import {
  AlarmInterface,
  listAlarmInterfaces,
  deleteAlarmInterface,
  duplicateAlarmInterface,
  exportAlarmInterface,
  importAlarmInterface,
  testAlarmInterface,
} from '../../api';
import InterfaceEditor from './InterfaceEditor';
import AlarmDeliveryLog from './AlarmDeliveryLog';
import TemplatePicker from './TemplatePicker';
import InterfaceStatsBadge from './InterfaceStatsBadge';
import HelpLink from '../HelpLink';

const TYPE_LABEL: Record<string, string> = {
  webhook: 'Webhook (Push)',
  pull_out: 'Pull-Out (FlightArc pollt)',
  pull_in: 'Pull-In (Extern pollt)',
  subscription: 'Subscription (Pub/Sub)',
};

export default function InterfacesManager() {
  const [items, setItems] = useState<AlarmInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AlarmInterface | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [pullTokenInfo, setPullTokenInfo] = useState<{ name: string; token: string } | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = useState<{ name: string; key: string } | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; status?: number; body?: string; error?: string } | null>(null);
  const [showLogFor, setShowLogFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await listAlarmInterfaces();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleDelete(iface: AlarmInterface) {
    if (!confirm(`Schnittstelle "${iface.name}" wirklich löschen?`)) return;
    try { await deleteAlarmInterface(iface.id); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  async function handleDuplicate(iface: AlarmInterface) {
    try { await duplicateAlarmInterface(iface.id); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  async function handleExport(iface: AlarmInterface) {
    try {
      const data = await exportAlarmInterface(iface.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${iface.name.replace(/\W+/g, '_')}.flightarc-interface.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert((e as Error).message); }
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await importAlarmInterface(parsed);
      await reload();
    } catch (e) { alert('Import fehlgeschlagen: ' + (e as Error).message); }
  }

  async function handleTest(iface: AlarmInterface) {
    setTestResult(null);
    try {
      const res = await testAlarmInterface(iface.id);
      setTestResult({ id: iface.id, ...res });
    } catch (e) { setTestResult({ id: iface.id, ok: false, error: (e as Error).message }); }
  }

  function onSaved(saved: AlarmInterface) {
    if (saved.pullToken) {
      setPullTokenInfo({ name: saved.name, token: saved.pullToken });
    }
    if ((saved as AlarmInterface & { apiKey?: string }).apiKey) {
      setApiKeyInfo({ name: saved.name, key: (saved as AlarmInterface & { apiKey: string }).apiKey });
    }
    setEditing(null);
    setCreating(false);
    reload();
  }

  function onTemplateCreated(saved: AlarmInterface) {
    setPickingTemplate(false);
    if ((saved as AlarmInterface & { apiKey?: string }).apiKey) {
      setApiKeyInfo({ name: saved.name, key: (saved as AlarmInterface & { apiKey: string }).apiKey });
    }
    if (saved.pullToken) {
      setPullTokenInfo({ name: saved.name, token: saved.pullToken });
    }
    // Open the new interface in the editor so the admin can wire URL/auth.
    setEditing(saved);
    reload();
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        position: 'relative',
        outline: dragOver ? '3px dashed var(--accent)' : 'none',
        outlineOffset: -8,
        borderRadius: 12,
      }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && /\.json$/i.test(file.name)) await handleImport(file);
        else if (file) alert('Nur .json-Dateien werden akzeptiert');
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
            Schnittstellen
            <HelpLink section="interfaces" title="Hilfe: Schnittstellen" size={20} />
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Außenkanäle für Alarmierung — Webhook-Push, Pull-Out (FlightArc fragt nach), Pull-In (Drittsystem holt ab), Subscription (Pub/Sub).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPickingTemplate(true)} style={{
            padding: '10px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
          }}>Aus Vorlage…</button>
          <label style={{
            padding: '10px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
          }}>
            Importieren
            <input type="file" accept="application/json" style={{ display: 'none' }}
                   onChange={e => e.target.files && handleImport(e.target.files[0])} />
          </label>
          <button onClick={() => setCreating(true)} style={{
            padding: '10px 18px', background: 'var(--accent)', color: 'var(--bg-primary)',
            border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>+ Neue Schnittstelle</button>
        </div>
      </header>

      {pullTokenInfo && (
        <SecretBanner
          title={`Pull-In-Token für „${pullTokenInfo.name}"`}
          help="Dieser Token wird nur einmal angezeigt. Kopiere ihn jetzt in das Drittsystem."
          secret={pullTokenInfo.token}
          onClose={() => setPullTokenInfo(null)}
        />
      )}
      {apiKeyInfo && (
        <SecretBanner
          title={`Channel-API-Key für „${apiKeyInfo.name}"`}
          help="Drittsysteme nutzen diesen Key, um sich am Channel zu registrieren (X-API-Key). Wird nur einmal angezeigt — bei Verlust kann der Key rotiert werden."
          secret={apiKeyInfo.key}
          onClose={() => setApiKeyInfo(null)}
        />
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>}
      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {!loading && items.length === 0 && (
        <div style={{
          padding: 32, textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-secondary)', borderRadius: 12,
          border: '1px dashed var(--border)',
        }}>
          <p style={{ margin: 0, fontSize: 15 }}>Noch keine Schnittstellen.</p>
          <p style={{ margin: '6px 0 0', fontSize: 12 }}>
            Lege z.B. einen Webhook auf einen Slack-Kanal oder einen Alarmserver an.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map(iface => (
          <article key={iface.id} style={{
            padding: 16, background: 'var(--bg-secondary)',
            borderRadius: 12, border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {iface.name}
                  {!iface.enabled && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600,
                    }}>DEAKTIVIERT</span>
                  )}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  {TYPE_LABEL[iface.interfaceType] || iface.interfaceType}
                  {iface.url && ' • '}
                  {iface.url}
                </p>
                {iface.description && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {iface.description}
                  </p>
                )}
                <InterfaceStatsBadge interfaceId={iface.id} interfaceType={iface.interfaceType} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {iface.interfaceType !== 'pull_in' && (
                  <button onClick={() => handleTest(iface)} style={btn('test')}>Test</button>
                )}
                <button onClick={() => setEditing(iface)} style={btn('primary')}>Bearbeiten</button>
                <button onClick={() => handleDuplicate(iface)} style={btn()}>Duplizieren</button>
                <button onClick={() => handleExport(iface)} style={btn()}>Export</button>
                <button onClick={() => setShowLogFor(showLogFor === iface.id ? null : iface.id)} style={btn()}>
                  {showLogFor === iface.id ? 'Log schließen' : 'Lieferungen'}
                </button>
                <button onClick={() => handleDelete(iface)} style={btn('danger')}>Löschen</button>
              </div>
            </div>
            {testResult && testResult.id === iface.id && (
              <div style={{
                marginTop: 12, padding: 10, borderRadius: 6,
                background: testResult.ok ? 'rgba(0,212,170,0.10)' : 'rgba(239,68,68,0.10)',
                border: `1px solid ${testResult.ok ? 'var(--accent)' : '#ef4444'}`,
                fontSize: 12,
              }}>
                <strong>{testResult.ok ? '✓ Erfolg' : '✗ Fehlschlag'}</strong>
                {testResult.status != null && ` • HTTP ${testResult.status}`}
                {testResult.error && ` • ${testResult.error}`}
                {testResult.body && (
                  <pre style={{
                    margin: '6px 0 0', maxHeight: 120, overflow: 'auto',
                    background: 'var(--bg-primary)', padding: 6, borderRadius: 4,
                    fontSize: 11,
                  }}>{testResult.body}</pre>
                )}
              </div>
            )}
            {showLogFor === iface.id && <AlarmDeliveryLog interfaceId={iface.id} />}
          </article>
        ))}
      </div>

      {(editing || creating) && (
        <InterfaceEditor
          existing={editing || undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={onSaved}
        />
      )}

      {pickingTemplate && (
        <TemplatePicker
          onClose={() => setPickingTemplate(false)}
          onCreated={onTemplateCreated}
        />
      )}
    </div>
  );
}

function SecretBanner({ title, help, secret, onClose }: {
  title: string; help: string; secret: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{
      padding: 16, marginBottom: 16, background: 'rgba(0,212,170,0.10)',
      border: '1px solid var(--accent)', borderRadius: 8,
    }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{title}</p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-secondary)' }}>{help}</p>
      <code style={{
        display: 'block', padding: 10, background: 'var(--bg-primary)',
        border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
        wordBreak: 'break-all',
      }}>{secret}</code>
      <button onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{
        marginTop: 8, padding: '6px 12px', background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
        minHeight: 36,
      }}>{copied ? '✓ Kopiert' : 'Kopieren'}</button>
      <button onClick={onClose} style={{
        marginTop: 8, marginLeft: 8, padding: '6px 12px', background: 'transparent',
        border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
        color: 'var(--text-secondary)', minHeight: 36,
      }}>Verstanden</button>
    </div>
  );
}

function btn(variant?: 'primary' | 'danger' | 'test'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)', minHeight: 32,
  };
  if (variant === 'primary') return { ...base, background: 'var(--accent)', color: 'var(--bg-primary)', border: 0, fontWeight: 600 };
  if (variant === 'danger') return { ...base, background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' };
  if (variant === 'test') return { ...base, background: 'rgba(0,212,170,0.12)', color: 'var(--accent)', borderColor: 'var(--accent)' };
  return base;
}
