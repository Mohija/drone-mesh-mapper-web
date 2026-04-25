import { useEffect, useRef, useState } from 'react';
import {
  AlarmInterface,
  AlarmAuthConfig,
  createAlarmInterface,
  updateAlarmInterface,
  fetchVariablePool,
  VariablePoolEntry,
} from '../../api';
import PayloadBuilder from './payloadBuilder/PayloadBuilder';
import InterfaceSubscribersTab from './InterfaceSubscribersTab';
import InterfaceExamplesTab from './InterfaceExamplesTab';

interface Props {
  existing?: AlarmInterface;
  onClose: () => void;
  onSaved: (saved: AlarmInterface) => void;
}

type Tab = 'general' | 'connection' | 'auth' | 'payload' | 'preview' | 'subscribers' | 'examples';

const AUTH_OPTIONS: { value: AlarmInterface['authType']; label: string }[] = [
  { value: 'none', label: 'Keine Authentifizierung' },
  { value: 'bearer', label: 'Bearer-Token' },
  { value: 'basic', label: 'Basic Auth (Username + Passwort)' },
  { value: 'api_key_header', label: 'API-Key (Header)' },
  { value: 'api_key_query', label: 'API-Key (Query-Parameter)' },
];

const TYPE_OPTIONS: { value: AlarmInterface['interfaceType']; label: string; hint: string }[] = [
  { value: 'webhook', label: 'Webhook (Push)', hint: 'FlightArc sendet HTTP-Request bei Verstoß.' },
  { value: 'pull_out', label: 'Pull-Out (FlightArc pollt extern)', hint: 'FlightArc ruft die URL periodisch ab (Liveness-Check).' },
  { value: 'pull_in', label: 'Pull-In (Drittsystem holt ab)', hint: 'Beim Speichern wird ein Service-Token erzeugt — das Drittsystem fragt /api/integrations/violations ab.' },
  { value: 'subscription', label: 'Subscription (Pub/Sub)', hint: 'Beim Speichern wird ein API-Key erzeugt. Beliebig viele Drittsysteme können sich am Channel registrieren und bekommen jedes Event automatisch gepusht.' },
];

const SAMPLE_TEMPLATES: Record<string, unknown> = {
  empty: {},
  alamos: {
    keyword: 'Drohne in Sperrzone',
    units: [{ address: '{{drone.id}}' }],
    note: '{{zone.name}} • {{drone.name}}',
    timestamp: '{{system.now_iso}}',
  },
  slack: {
    text: '🚨 *{{trigger}}* — {{drone.name}} hat „{{zone.name}}" verletzt ({{system.now_iso}})',
  },
  generic: {
    event: '{{trigger}}',
    drone: { id: '{{drone.id}}', name: '{{drone.name}}', altitude: '${{drone.altitude}}' },
    zone: { id: '{{zone.id}}', name: '{{zone.name}}' },
    violationId: '{{violation.id}}',
    timestamp: '{{system.now_iso}}',
  },
};

export default function InterfaceEditor({ existing, onClose, onSaved }: Props) {
  const isEdit = Boolean(existing);
  const [tab, setTab] = useState<Tab>('general');
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [interfaceType, setInterfaceType] = useState<AlarmInterface['interfaceType']>(existing?.interfaceType || 'webhook');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [url, setUrl] = useState(existing?.url || '');
  const [httpMethod, setHttpMethod] = useState(existing?.httpMethod || 'POST');
  const [timeoutSeconds, setTimeoutSeconds] = useState(existing?.timeoutSeconds ?? 10);
  const [retryMax, setRetryMax] = useState(existing?.retryMax ?? 3);
  const [retryBackoffSeconds, setRetryBackoffSeconds] = useState(existing?.retryBackoffSeconds ?? 2);
  const [pullIntervalSeconds, setPullIntervalSeconds] = useState(existing?.pullIntervalSeconds ?? 60);
  const [authType, setAuthType] = useState<AlarmInterface['authType']>(existing?.authType || 'bearer');
  const [authConfig, setAuthConfig] = useState<AlarmAuthConfig>(existing?.authConfig || {});
  const [extraHeaders, setExtraHeaders] = useState<string>(JSON.stringify(existing?.extraHeaders || {}, null, 2));
  const [payloadJson, setPayloadJson] = useState<string>(
    JSON.stringify(existing?.payloadTemplate ?? SAMPLE_TEMPLATES.generic, null, 2)
  );
  const [builderMode, setBuilderMode] = useState<'builder' | 'raw'>('builder');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [variables, setVariables] = useState<VariablePoolEntry[]>([]);
  const [previewCtx, setPreviewCtx] = useState<Record<string, unknown> | null>(null);
  const payloadRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchVariablePool().then(p => {
      setVariables(p.variables);
      setPreviewCtx(p.exampleContext);
    }).catch(() => { /* non-fatal */ });
  }, []);

  function insertVariable(path: string) {
    const ta = payloadRef.current;
    if (!ta) return;
    const before = payloadJson.slice(0, ta.selectionStart);
    const after = payloadJson.slice(ta.selectionEnd);
    const token = `{{${path}}}`;
    const next = before + token + after;
    setPayloadJson(next);
    setTimeout(() => {
      ta.focus();
      const pos = before.length + token.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  function applySampleTemplate(key: keyof typeof SAMPLE_TEMPLATES) {
    setPayloadJson(JSON.stringify(SAMPLE_TEMPLATES[key], null, 2));
    setPayloadError(null);
  }

  async function submit() {
    setSubmitError(null);
    setHeadersError(null);
    setPayloadError(null);

    let parsedPayload: unknown;
    try { parsedPayload = JSON.parse(payloadJson); }
    catch (e) { setPayloadError('Ungültiges JSON: ' + (e as Error).message); setTab('payload'); return; }

    let parsedHeaders: Record<string, string>;
    try { parsedHeaders = JSON.parse(extraHeaders); }
    catch (e) { setHeadersError('Ungültiges JSON: ' + (e as Error).message); setTab('connection'); return; }

    const payload: Partial<AlarmInterface> = {
      name: name.trim(),
      description: description.trim() || null,
      interfaceType,
      enabled,
      url: url.trim() || null,
      httpMethod,
      extraHeaders: parsedHeaders,
      timeoutSeconds: Number(timeoutSeconds),
      retryMax: Number(retryMax),
      retryBackoffSeconds: Number(retryBackoffSeconds),
      pullIntervalSeconds: interfaceType === 'pull_out' ? Number(pullIntervalSeconds) : null,
      authType,
      authConfig,
      payloadTemplate: parsedPayload,
    };

    setSubmitting(true);
    try {
      const saved = isEdit
        ? await updateAlarmInterface(existing!.id, payload)
        : await createAlarmInterface(payload);
      onSaved(saved);
    } catch (e) { setSubmitError((e as Error).message); }
    finally { setSubmitting(false); }
  }

  const renderedPreview = (() => {
    if (!previewCtx) return '(Variablen-Pool nicht geladen)';
    try {
      const tpl = JSON.parse(payloadJson);
      const rendered = renderClient(tpl, previewCtx);
      return JSON.stringify(rendered, null, 2);
    } catch (e) {
      return '/* Payload-JSON ungültig: ' + (e as Error).message + ' */';
    }
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
      <div style={{
        width: 'min(900px, 100%)', background: 'var(--bg-secondary)',
        borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{isEdit ? `Schnittstelle bearbeiten — ${existing!.name}` : 'Neue Schnittstelle'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>×</button>
        </header>

        <nav style={{ display: 'flex', gap: 4, padding: '12px 20px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {(() => {
            const tabs: Tab[] = ['general', 'connection', 'auth', 'payload', 'preview'];
            if (isEdit && interfaceType === 'subscription') tabs.push('subscribers');
            if (isEdit) tabs.push('examples');
            return tabs;
          })().map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
              {{
                general: 'Allgemein',
                connection: 'Verbindung',
                auth: 'Authentifizierung',
                payload: 'Payload',
                preview: 'Vorschau & Senden',
                subscribers: 'Abonnenten',
                examples: 'Beispiele',
              }[t]}
            </button>
          ))}
        </nav>

        <div style={{ padding: 20, maxHeight: '60vh', overflow: 'auto' }}>
          {tab === 'general' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Name *">
                <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="z.B. Alarmserver Hauptzentrale" />
              </Field>
              <Field label="Beschreibung">
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </Field>
              <Field label="Typ *">
                <select value={interfaceType} onChange={e => setInterfaceType(e.target.value as AlarmInterface['interfaceType'])} style={inp} disabled={isEdit}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <small style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                  {TYPE_OPTIONS.find(o => o.value === interfaceType)?.hint}
                </small>
              </Field>
              <Field label="Aktiviert">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                  <span>Schnittstelle ist aktiv</span>
                </label>
              </Field>
            </div>
          )}

          {tab === 'connection' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {interfaceType !== 'pull_in' && (
                <>
                  <Field label="URL *">
                    <input value={url} onChange={e => setUrl(e.target.value)} style={inp} placeholder="https://example.com/hook" />
                  </Field>
                  <Field label="HTTP-Methode">
                    <select value={httpMethod} onChange={e => setHttpMethod(e.target.value)} style={inp}>
                      {['POST', 'PUT', 'PATCH', 'GET'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {interfaceType === 'pull_in' && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Pull-In: das Drittsystem fragt FlightArc ab — keine ausgehende URL. Nach dem Speichern erhältst du einmalig einen Service-Token, den du im Drittsystem als <code>X-Service-Token</code>-Header hinterlegst. Der Endpoint lautet <code>/api/integrations/violations</code>.
                </p>
              )}
              {interfaceType === 'pull_out' && (
                <Field label="Polling-Intervall (Sekunden)">
                  <input type="number" min={15} max={86400} value={pullIntervalSeconds}
                         onChange={e => setPullIntervalSeconds(Number(e.target.value))} style={inp} />
                </Field>
              )}
              <Field label="Timeout (Sekunden)">
                <input type="number" min={1} max={120} value={timeoutSeconds}
                       onChange={e => setTimeoutSeconds(Number(e.target.value))} style={inp} />
              </Field>
              <Field label="Wiederholungen bei Fehler">
                <input type="number" min={1} max={10} value={retryMax}
                       onChange={e => setRetryMax(Number(e.target.value))} style={inp} />
              </Field>
              <Field label="Backoff zwischen Wiederholungen (Sekunden)">
                <input type="number" min={0} max={60} step={0.5} value={retryBackoffSeconds}
                       onChange={e => setRetryBackoffSeconds(Number(e.target.value))} style={inp} />
              </Field>
              <Field label="Zusätzliche Header (JSON)">
                <textarea value={extraHeaders} onChange={e => setExtraHeaders(e.target.value)}
                          rows={3} style={{ ...inp, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
                {headersError && <small style={{ color: '#ef4444' }}>{headersError}</small>}
              </Field>
            </div>
          )}

          {tab === 'auth' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Authentifizierungs-Methode">
                <select value={authType} onChange={e => setAuthType(e.target.value as AlarmInterface['authType'])} style={inp}>
                  {AUTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {authType === 'bearer' && (
                <Field label="Bearer-Token">
                  <input value={authConfig.token || ''} onChange={e => setAuthConfig({ ...authConfig, token: e.target.value })}
                         style={inp} placeholder={isEdit ? '(unverändert lassen, wenn nicht geändert)' : 'Token eingeben'} />
                </Field>
              )}
              {authType === 'basic' && (
                <>
                  <Field label="Benutzername">
                    <input value={authConfig.username || ''} onChange={e => setAuthConfig({ ...authConfig, username: e.target.value })} style={inp} />
                  </Field>
                  <Field label="Passwort">
                    <input value={authConfig.password || ''} onChange={e => setAuthConfig({ ...authConfig, password: e.target.value })}
                           style={inp} placeholder={isEdit ? '(unverändert lassen, wenn nicht geändert)' : ''} />
                  </Field>
                </>
              )}
              {(authType === 'api_key_header' || authType === 'api_key_query') && (
                <>
                  <Field label={authType === 'api_key_header' ? 'Header-Name' : 'Query-Parameter-Name'}>
                    <input value={authConfig.name || ''} onChange={e => setAuthConfig({ ...authConfig, name: e.target.value })}
                           style={inp} placeholder={authType === 'api_key_header' ? 'z.B. X-API-Key' : 'z.B. apikey'} />
                  </Field>
                  <Field label="Wert">
                    <input value={authConfig.value || ''} onChange={e => setAuthConfig({ ...authConfig, value: e.target.value })}
                           style={inp} placeholder={isEdit ? '(unverändert lassen, wenn nicht geändert)' : ''} />
                  </Field>
                </>
              )}
              {isEdit && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Sicherheitshinweis: bestehende Geheimnisse werden auf dem Server verschlüsselt und nicht angezeigt.
                  Lasse Felder leer oder mit „••••••••", um den gespeicherten Wert beizubehalten.
                </p>
              )}
            </div>
          )}

          {tab === 'payload' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
                  <button onClick={() => setBuilderMode('builder')} style={modeBtn(builderMode === 'builder')}>Builder</button>
                  <button onClick={() => setBuilderMode('raw')} style={modeBtn(builderMode === 'raw')}>Raw JSON</button>
                </div>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vorlage:</span>
                {Object.keys(SAMPLE_TEMPLATES).map(k => (
                  <button key={k} onClick={() => applySampleTemplate(k as keyof typeof SAMPLE_TEMPLATES)} style={{
                    padding: '4px 10px', fontSize: 11, background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 4,
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>{k}</button>
                ))}
              </div>

              {builderMode === 'builder' && (
                <PayloadBuilder
                  value={parsedPayload(payloadJson)}
                  onChange={(next) => setPayloadJson(JSON.stringify(next, null, 2))}
                  variables={variables}
                  exampleContext={previewCtx}
                />
              )}

              {builderMode === 'raw' && (
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '220px 1fr' }}>
                  <aside style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 360,
                  }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Variablen einfügen</p>
                    {(['drone', 'zone', 'violation', 'tenant', 'system'] as const).map(cat => (
                      <div key={cat} style={{ marginBottom: 10 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</p>
                        {variables.filter(v => v.category === cat).map(v => (
                          <button key={v.path} onClick={() => insertVariable(v.path)} style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '4px 6px', marginBottom: 2, fontSize: 11, fontFamily: 'monospace',
                            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                            borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer',
                          }} title={`Beispiel: ${JSON.stringify(v.example)}`}>{v.path}</button>
                        ))}
                      </div>
                    ))}
                  </aside>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      JSON-Template. Variablen als <code>{`{{drone.id}}`}</code> einsetzen, oder <code>{`\${{drone.altitude}}`}</code> für typisierte Werte.
                    </p>
                    <textarea ref={payloadRef} value={payloadJson} onChange={e => setPayloadJson(e.target.value)}
                              rows={14} style={{
                                ...inp, fontFamily: 'monospace', fontSize: 12,
                                resize: 'vertical', minHeight: 240,
                              }} />
                    {payloadError && <small style={{ color: '#ef4444' }}>{payloadError}</small>}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'preview' && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                Live-Vorschau, gerendert mit dem Beispiel-Kontext aus dem Backend (echte Drohnen / Zonen werden bei Auslösung eingesetzt).
              </p>
              <pre style={{
                background: 'var(--bg-primary)', padding: 12, borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 12, overflow: 'auto', maxHeight: 360,
              }}>{renderedPreview}</pre>
            </div>
          )}

          {tab === 'subscribers' && existing && (
            <InterfaceSubscribersTab iface={existing} />
          )}

          {tab === 'examples' && existing && (
            <InterfaceExamplesTab interfaceId={existing.id} />
          )}
        </div>

        {submitError && (
          <div style={{ padding: '8px 20px', color: '#ef4444', fontSize: 13, borderTop: '1px solid var(--border)' }}>{submitError}</div>
        )}

        <footer style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnSecondary}>Abbrechen</button>
          <button onClick={submit} disabled={submitting || !name.trim()} style={{
            ...btnPrimary, opacity: submitting || !name.trim() ? 0.5 : 1,
          }}>{submitting ? 'Speichert…' : 'Speichern'}</button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  padding: 10, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', background: active ? 'var(--bg-secondary)' : 'transparent',
    border: 0, borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
    marginBottom: -1,
  };
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', background: 'var(--accent)', color: 'var(--bg-primary)',
  border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer',
};

// Lightweight client-side Mustache-style renderer for the live preview.
// The server uses chevron with the same syntax — we keep this minimal to
// avoid pulling in a runtime dep. Falls back to leaving unmatched tokens in
// place rather than throwing.
function renderClient(template: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    if (template.startsWith('${{') && template.endsWith('}}')) {
      const path = template.slice(3, -2).trim();
      const val = lookup(ctx, path);
      return val === undefined ? template : val;
    }
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, p1) => {
      const val = lookup(ctx, p1.trim());
      return val === undefined || val === null ? '' : String(val);
    });
  }
  if (Array.isArray(template)) return template.map(t => renderClient(t, ctx));
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) out[k] = renderClient(v, ctx);
    return out;
  }
  return template;
}

function lookup(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, ctx);
}

// Best-effort: parse the textarea contents back to a JSON value for the
// builder. If the raw text is broken (user mid-edit), fall back to {} so
// the builder always has a tree to work with.
function parsedPayload(json: string): unknown {
  try { return JSON.parse(json); } catch { return {}; }
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
    border: 0, borderRadius: 4, cursor: 'pointer',
  };
}
