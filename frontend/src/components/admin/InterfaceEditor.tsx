import { useEffect, useRef, useState } from 'react';
import {
  AlarmInterface,
  AlarmAuthConfig,
  ResponseMapping,
  createAlarmInterface,
  updateAlarmInterface,
  fetchVariablePool,
  fetchSettings,
  testAlarmInterface,
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
  const [responseMapping, setResponseMapping] = useState<ResponseMapping | null>(existing?.responseMapping || null);
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
  const [externalUrl, setExternalUrl] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; body?: string; error?: string } | null>(null);
  // Modal-Size: nutzer-gewählt (max), persistent. Auf Payload-Tab automatisch breiter.
  const [fullscreen, setFullscreen] = useState<boolean>(() => {
    try { return localStorage.getItem('flightarc.interface-editor.fullscreen') === '1'; } catch { return false; }
  });
  function toggleFullscreen() {
    setFullscreen(v => {
      const next = !v;
      try { localStorage.setItem('flightarc.interface-editor.fullscreen', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }
  const payloadRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchVariablePool().then(p => {
      setVariables(p.variables);
      setPreviewCtx(p.exampleContext);
    }).catch(() => { /* non-fatal */ });
    fetchSettings().then(s => {
      setExternalUrl((s.firmware_backend_url || '').trim());
    }).catch(() => { /* non-fatal */ });
  }, []);

  function endpointUrl(): string | null {
    const base = externalUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return null;
    const trimmed = base.replace(/\/+$/, '');
    if (interfaceType === 'pull_in') {
      return `${trimmed}/api/integrations/violations`;
    }
    if (interfaceType === 'subscription' && existing) {
      return `${trimmed}/api/integrations/subscriptions/${existing.id}/register`;
    }
    return null;
  }

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

  async function submit(closeAfter = true): Promise<AlarmInterface | null> {
    setSubmitError(null);
    setHeadersError(null);
    setPayloadError(null);

    let parsedPayload: unknown;
    try { parsedPayload = JSON.parse(payloadJson); }
    catch (e) { setPayloadError('Ungültiges JSON: ' + (e as Error).message); setTab('payload'); return null; }

    let parsedHeaders: Record<string, string>;
    try { parsedHeaders = JSON.parse(extraHeaders); }
    catch (e) { setHeadersError('Ungültiges JSON: ' + (e as Error).message); setTab('connection'); return null; }

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
      responseMapping: interfaceType === 'pull_out' ? responseMapping : null,
    };

    setSubmitting(true);
    try {
      const saved = isEdit
        ? await updateAlarmInterface(existing!.id, payload)
        : await createAlarmInterface(payload);
      if (closeAfter) onSaved(saved);
      return saved;
    } catch (e) { setSubmitError((e as Error).message); return null; }
    finally { setSubmitting(false); }
  }

  async function runTest(opts?: { useLatestViolation?: boolean }, ifaceId?: string) {
    setTestResult(null);
    setTesting(true);
    try {
      const id = ifaceId ?? existing?.id;
      if (!id) throw new Error('Schnittstelle muss erst gespeichert werden.');
      const res = await testAlarmInterface(id, opts);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function saveAndTest(opts?: { useLatestViolation?: boolean }) {
    const saved = await submit(false);
    if (saved) await runTest(opts, saved.id);
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: fullscreen ? 0 : 'clamp(8px, 2vw, 24px)', overflow: 'auto' }}>
      <div style={{
        width: fullscreen
          ? '100vw'
          : (tab === 'payload' ? 'min(1320px, 100%)' : 'min(960px, 100%)'),
        height: fullscreen ? '100vh' : undefined,
        background: 'var(--bg-secondary)',
        borderRadius: fullscreen ? 0 : 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        transition: 'width 0.2s ease, height 0.2s ease',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isEdit ? `Schnittstelle: ${existing!.name}` : 'Neue Schnittstelle'}</h2>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={toggleFullscreen}
              title={fullscreen ? 'Verkleinern' : 'Vergrößern (Vollbild)'}
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer',
                padding: '4px 10px', borderRadius: 6, lineHeight: 1,
              }}
            >{fullscreen ? '🗗' : '🗖'}</button>
            <button onClick={onClose} title="Schließen" style={{ background: 'transparent', border: 0, fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 4, padding: '10px 12px 0', borderBottom: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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

        <div style={{
          padding: 'clamp(12px, 3vw, 20px)',
          maxHeight: fullscreen ? undefined : '70vh',
          flex: fullscreen ? 1 : undefined,
          minHeight: 0,
          overflow: 'auto',
        }}>
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
                  Pull-In: das Drittsystem fragt FlightArc ab — keine ausgehende URL. Nach dem Speichern erhältst du einmalig einen Service-Token, den du im Drittsystem als <code>X-Service-Token</code>-Header hinterlegst.
                </p>
              )}
              {(interfaceType === 'pull_in' || (interfaceType === 'subscription' && isEdit)) && (
                <EndpointUrlBox
                  label={interfaceType === 'pull_in' ? 'Pull-In-Endpoint' : 'Subscription-Registrierungs-URL'}
                  url={endpointUrl()}
                  externalUrlConfigured={Boolean(externalUrl)}
                  unique={interfaceType === 'subscription'
                    ? 'Eindeutig pro Schnittstelle (UUID im Pfad).'
                    : 'Pro Service-Token authentifiziert; alle Pull-In-Schnittstellen teilen denselben Pfad.'}
                />
              )}
              {interfaceType === 'subscription' && !isEdit && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  Die Registrierungs-URL wird nach dem ersten Speichern angezeigt — sie enthält die eindeutige
                  Channel-ID dieser Schnittstelle.
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

              {interfaceType === 'pull_out' && (
                <ResponseMappingEditor value={responseMapping} onChange={setResponseMapping} />
              )}
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
                  fullscreen={fullscreen}
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
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Live-Vorschau, gerendert mit dem Beispiel-Kontext aus dem Backend (echte Drohnen / Zonen werden bei Auslösung eingesetzt).
                </p>
                <pre style={{
                  background: 'var(--bg-primary)', padding: 12, borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 12, overflow: 'auto', maxHeight: 320,
                }}>{renderedPreview}</pre>
              </div>

              <div style={{
                padding: 14, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>Test-Sendung</strong>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {interfaceType === 'pull_in'
                      ? 'Pull-In: kein ausgehender Aufruf — der Test stößt nur die interne Pipeline an.'
                      : interfaceType === 'pull_out'
                      ? 'Triggert einen Poll auf die konfigurierte URL und wertet die Antwort aus.'
                      : interfaceType === 'subscription'
                      ? 'Sendet ein Test-Event an alle aktiven Subscriber dieses Channels.'
                      : 'Sendet einen Beispiel-Request mit dem konfigurierten Payload an die URL.'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => isEdit ? runTest({ useLatestViolation: false }) : saveAndTest({ useLatestViolation: false })}
                    disabled={testing || submitting || !name.trim()}
                    style={{
                      ...btnPrimary, opacity: testing || submitting || !name.trim() ? 0.5 : 1,
                    }}
                  >
                    {testing ? 'Sendet…' : isEdit ? '▶ Test mit Beispielkontext' : '💾 Speichern & testen (Beispielkontext)'}
                  </button>
                  <button
                    onClick={() => isEdit ? runTest({ useLatestViolation: true }) : saveAndTest({ useLatestViolation: true })}
                    disabled={testing || submitting || !name.trim()}
                    style={{
                      ...btnSecondary, opacity: testing || submitting || !name.trim() ? 0.5 : 1,
                    }}
                    title="Verwendet den letzten echten Verstoß als Kontext, falls vorhanden."
                  >
                    {isEdit ? '▶ Test mit letztem Verstoß' : '💾 Speichern & testen (letzter Verstoß)'}
                  </button>
                </div>
                {!isEdit && (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    Hinweis: für eine neue Schnittstelle wird zuerst gespeichert, dann gesendet.
                    Bei einer bestehenden bezieht sich der Test auf den <em>gespeicherten</em> Stand —
                    ungespeicherte Änderungen im Editor sind dabei nicht enthalten. Vorher speichern,
                    um den aktuellen Stand zu testen.
                  </p>
                )}

                {testResult && (
                  <div style={{
                    marginTop: 12, padding: 10, borderRadius: 6,
                    border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    background: testResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                      <strong style={{ color: testResult.ok ? '#22c55e' : '#ef4444' }}>
                        {testResult.ok ? '✓ Erfolg' : '✗ Fehler'}
                      </strong>
                      {typeof testResult.status === 'number' && (
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                          HTTP {testResult.status}
                        </span>
                      )}
                    </div>
                    {testResult.error && (
                      <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{testResult.error}</p>
                    )}
                    {testResult.body && (
                      <pre style={{
                        margin: 0, fontSize: 11, lineHeight: 1.4, fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto',
                        color: 'var(--text-primary)',
                      }}>{testResult.body}</pre>
                    )}
                  </div>
                )}
              </div>
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
          <button onClick={() => submit()} disabled={submitting || !name.trim()} style={{
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

function EndpointUrlBox({ label, url, externalUrlConfigured, unique }: {
  label: string;
  url: string | null;
  externalUrlConfigured: boolean;
  unique: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!url) {
    return (
      <div style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 12, color: 'var(--text-muted)' }}>
        URL kann nicht ermittelt werden — pflege die <strong>Externe URL</strong> unter Administration → Einstellungen.
      </div>
    );
  }
  return (
    <div style={{
      padding: 10, borderRadius: 6, border: '1px solid var(--border)',
      background: 'var(--bg-primary)', display: 'grid', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 12 }}>{label}</strong>
        <span style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5,
          background: 'var(--bg-tertiary)', color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>{externalUrlConfigured ? 'aus Externer URL' : 'aus aktuellem Host'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
        <code
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
          }}
          title="Klicken zum Kopieren"
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 4,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            wordBreak: 'break-all', userSelect: 'all',
            color: 'var(--text-primary)', minWidth: 0,
          }}
        >{url}</code>
        <button
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
          }}
          title="In Zwischenablage kopieren"
          style={{
            padding: '0 14px', borderRadius: 4,
            background: copied ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.5)' : 'var(--border)'}`,
            color: copied ? '#22c55e' : 'var(--text-primary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >{copied ? '✓ Kopiert' : 'Kopieren'}</button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{unique}</p>
    </div>
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
    marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
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


function ResponseMappingEditor({ value, onChange }: {
  value: ResponseMapping | null;
  onChange: (v: ResponseMapping | null) => void;
}) {
  const enabled = !!value;
  const v = value || {};

  function update(patch: Partial<ResponseMapping>) {
    onChange({ ...v, ...patch });
  }
  function clearKey(key: keyof ResponseMapping) {
    const next = { ...v };
    delete next[key];
    onChange(Object.keys(next).length === 0 ? null : next);
  }

  return (
    <fieldset style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: 12,
      margin: '4px 0', background: 'var(--bg-primary)',
    }}>
      <legend style={{ padding: '0 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
        Antwort-Auswertung (Pull-Out)
      </legend>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Standardmäßig zählen 2xx-Antworten als Erfolg. Hier kannst du eine eigene
        Bedingung formulieren — Status-Code-Allowlist, JSON-Feld, Fehler-Pfad. Die
        Auswertung läuft serverseitig und füllt die Lieferungs-Statistiken
        entsprechend.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
        <input type="checkbox" checked={enabled}
               onChange={e => onChange(e.target.checked ? {} : null)} />
        Antwort-Auswertung aktivieren
      </label>
      {enabled && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Erfolgreiche Status-Codes (kommagetrennt, leer = 200–299)
            </span>
            <input
              value={(v.status_codes || []).join(',')}
              placeholder="200,202,204"
              onChange={e => {
                const codes = e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                if (codes.length === 0) clearKey('status_codes');
                else update({ status_codes: codes });
              }}
              style={inp}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              JSON-Pfad im Response-Body (Punkt-Notation, z.B. <code>data.acknowledged</code>)
            </span>
            <input
              value={v.json_path || ''}
              placeholder="acknowledged"
              onChange={e => {
                const val = e.target.value.trim();
                if (!val) { clearKey('json_path'); clearKey('expected_value'); }
                else update({ json_path: val });
              }}
              style={inp}
            />
          </label>
          {v.json_path && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Erwarteter Wert (JSON-Literal: <code>true</code>, <code>"ok"</code>, <code>42</code>)
              </span>
              <input
                value={v.expected_value === undefined ? '' : JSON.stringify(v.expected_value)}
                placeholder='true'
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { clearKey('expected_value'); return; }
                  try { update({ expected_value: JSON.parse(raw) }); }
                  catch { update({ expected_value: raw }); }
                }}
                style={{ ...inp, fontFamily: 'monospace' }}
              />
            </label>
          )}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Fehler-Pfad (wenn vorhanden &amp; truthy → Lieferung als Fehler markieren)
            </span>
            <input
              value={v.fail_on_path || ''}
              placeholder="error"
              onChange={e => {
                const val = e.target.value.trim();
                if (!val) clearKey('fail_on_path');
                else update({ fail_on_path: val });
              }}
              style={inp}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
