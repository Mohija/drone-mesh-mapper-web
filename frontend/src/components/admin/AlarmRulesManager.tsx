import { useEffect, useState } from 'react';
import {
  AlarmInterface, AlarmRule,
  listAlarmInterfaces, listAlarmRules, createAlarmRule, updateAlarmRule,
  deleteAlarmRule, testAlarmRule,
  fetchFlightZones,
} from '../../api';

const TRIGGER_LABEL: Record<string, string> = {
  violation_start: 'Verstoß-Start (Drohne betritt Zone)',
  violation_end: 'Verstoß-Ende (Drohne verlässt Zone)',
  violation_update: 'Verstoß-Update (Trail-Snapshot)',
};

interface FlightZoneLite { id: string; name: string; }

export default function AlarmRulesManager() {
  const [rules, setRules] = useState<AlarmRule[]>([]);
  const [interfaces, setInterfaces] = useState<AlarmInterface[]>([]);
  const [zones, setZones] = useState<FlightZoneLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AlarmRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [testFor, setTestFor] = useState<{ id: string; ok: boolean; status?: number; body?: string; error?: string } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [r, i, z] = await Promise.all([
        listAlarmRules(),
        listAlarmInterfaces(),
        fetchFlightZones().catch(() => []),
      ]);
      setRules(r.items);
      setInterfaces(i.items);
      setZones(z.map(zone => ({ id: zone.id, name: zone.name })));
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  async function handleDelete(rule: AlarmRule) {
    if (!confirm('Regel wirklich löschen?')) return;
    try { await deleteAlarmRule(rule.id); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  async function handleTest(rule: AlarmRule) {
    setTestFor(null);
    try {
      const res = await testAlarmRule(rule.id);
      setTestFor({ id: rule.id, ...res });
    } catch (e) { setTestFor({ id: rule.id, ok: false, error: (e as Error).message }); }
  }

  async function handleToggle(rule: AlarmRule) {
    try { await updateAlarmRule(rule.id, { enabled: !rule.enabled }); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Alarmverwaltung</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Verbindet eine Zone (oder alle Zonen) mit einer Schnittstelle für einen bestimmten Trigger.
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={{
          padding: '10px 18px', background: 'var(--accent)', color: 'var(--bg-primary)',
          border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>+ Neue Regel</button>
      </header>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>}
      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {!loading && interfaces.length === 0 && (
        <div style={{
          padding: 16, marginBottom: 16,
          background: 'rgba(245,158,11,0.10)', border: '1px solid #f59e0b', borderRadius: 8,
          fontSize: 13,
        }}>
          ⚠ Keine Schnittstellen angelegt. Lege erst eine unter „Schnittstellen" an, bevor du Regeln definierst.
        </div>
      )}

      {!loading && interfaces.length > 0 && rules.length === 0 && !creating && (
        <div style={{
          padding: 32, textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-secondary)', borderRadius: 12,
          border: '1px dashed var(--border)',
        }}>
          <p style={{ margin: 0, fontSize: 15 }}>Noch keine Regeln.</p>
        </div>
      )}

      {(creating || editing) && (
        <RuleEditor
          existing={editing || undefined}
          interfaces={interfaces}
          zones={zones}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {rules.map(rule => {
          const iface = interfaces.find(i => i.id === rule.interfaceId);
          const zone = rule.zoneId ? zones.find(z => z.id === rule.zoneId) : null;
          return (
            <article key={rule.id} style={{
              padding: 14, background: 'var(--bg-secondary)', borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                    {rule.name || '(unbenannte Regel)'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {zone ? `Zone „${zone.name}"` : 'Alle Zonen'}
                    {' → '}
                    {iface ? iface.name : '(unbekannte Schnittstelle)'}
                    {' • '}
                    {TRIGGER_LABEL[rule.triggerType] || rule.triggerType}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => handleToggle(rule)} style={{
                    ...miniBtn,
                    background: rule.enabled ? 'rgba(0,212,170,0.15)' : 'rgba(239,68,68,0.15)',
                    color: rule.enabled ? 'var(--accent)' : '#ef4444',
                    borderColor: rule.enabled ? 'var(--accent)' : 'rgba(239,68,68,0.4)',
                  }}>{rule.enabled ? 'Aktiv' : 'Inaktiv'}</button>
                  <button onClick={() => handleTest(rule)} style={miniBtn}>Test</button>
                  <button onClick={() => setEditing(rule)} style={miniBtn}>Bearbeiten</button>
                  <button onClick={() => handleDelete(rule)} style={{
                    ...miniBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)',
                  }}>Löschen</button>
                </div>
              </div>
              {testFor && testFor.id === rule.id && (
                <div style={{
                  marginTop: 10, padding: 8, fontSize: 12, borderRadius: 4,
                  background: testFor.ok ? 'rgba(0,212,170,0.10)' : 'rgba(239,68,68,0.10)',
                  border: `1px solid ${testFor.ok ? 'var(--accent)' : '#ef4444'}`,
                }}>
                  {testFor.ok ? '✓ Gesendet' : '✗ Fehler'}
                  {testFor.status != null && ` • HTTP ${testFor.status}`}
                  {testFor.error && ` • ${testFor.error}`}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RuleEditor({
  existing, interfaces, zones, onCancel, onSaved,
}: {
  existing?: AlarmRule;
  interfaces: AlarmInterface[];
  zones: FlightZoneLite[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [interfaceId, setInterfaceId] = useState(existing?.interfaceId || interfaces[0]?.id || '');
  const [zoneId, setZoneId] = useState<string>(existing?.zoneId || '');
  const [triggerType, setTriggerType] = useState<AlarmRule['triggerType']>(existing?.triggerType || 'violation_start');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const payload: Partial<AlarmRule> = {
        name: name.trim() || null,
        interfaceId, zoneId: zoneId || null,
        triggerType, enabled,
      };
      if (existing) await updateAlarmRule(existing.id, payload);
      else await createAlarmRule(payload);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <div style={{
      padding: 16, marginBottom: 12, background: 'var(--bg-secondary)',
      borderRadius: 10, border: '1px solid var(--accent)',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
        {existing ? 'Regel bearbeiten' : 'Neue Regel'}
      </h3>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Name (optional)">
          <input value={name} onChange={e => setName(e.target.value)} style={inp} />
        </Field>
        <Field label="Schnittstelle">
          <select value={interfaceId} onChange={e => setInterfaceId(e.target.value)} style={inp}>
            {interfaces.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Zone (leer = alle)">
          <select value={zoneId} onChange={e => setZoneId(e.target.value)} style={inp}>
            <option value="">— alle Zonen —</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </Field>
        <Field label="Trigger">
          <select value={triggerType} onChange={e => setTriggerType(e.target.value as AlarmRule['triggerType'])} style={inp}>
            {Object.entries(TRIGGER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Aktiviert">
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', padding: '8px 0' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Regel ist aktiv
          </label>
        </Field>
      </div>
      {err && <p style={{ color: '#ef4444', fontSize: 12, margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} style={{ ...miniBtn, padding: '8px 16px' }}>Abbrechen</button>
        <button onClick={submit} disabled={submitting || !interfaceId} style={{
          padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-primary)',
          border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600,
          cursor: submitting ? 'wait' : 'pointer',
          opacity: submitting || !interfaceId ? 0.5 : 1,
        }}>{submitting ? 'Speichert…' : 'Speichern'}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  padding: 8, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};

const miniBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
  cursor: 'pointer', border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', color: 'var(--text-primary)', minHeight: 32,
};
