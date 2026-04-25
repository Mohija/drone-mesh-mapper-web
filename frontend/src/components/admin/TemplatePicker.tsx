import { useEffect, useState } from 'react';
import {
  AlarmTemplate, listAlarmTemplates, createInterfaceFromTemplate,
  AlarmInterface,
} from '../../api';

interface Props {
  onClose: () => void;
  onCreated: (created: AlarmInterface) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  alerting: 'Alarmierung',
  chat: 'Chat & Messaging',
  general: 'Allgemein',
};

const CATEGORY_COLOR: Record<string, string> = {
  alerting: '#ef4444',
  chat: '#22d3ee',
  general: '#94a3b8',
};

const TYPE_BADGE: Record<string, string> = {
  webhook: 'Push',
  pull_out: 'Pull-Out',
  pull_in: 'Pull-In',
  subscription: 'Subscription',
};

export default function TemplatePicker({ onClose, onCreated }: Props) {
  const [templates, setTemplates] = useState<AlarmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    listAlarmTemplates()
      .then(r => setTemplates(r.items))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function pick(tpl: AlarmTemplate) {
    setCreating(tpl.id);
    try {
      const created = await createInterfaceFromTemplate(tpl.id);
      onCreated(created);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 1100, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: 24, overflow: 'auto',
    }}>
      <div style={{
        width: 'min(900px, 100%)', background: 'var(--bg-secondary)',
        borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <header style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Aus Vorlage anlegen</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Vorgegebene Schnittstellen-Vorlagen — wähle eine Karte aus, danach kannst du URL
              und Auth-Daten anpassen.
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 0, fontSize: 22,
            color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
          }}>×</button>
        </header>

        <div style={{ padding: 20, maxHeight: '70vh', overflow: 'auto' }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>}
          {error && <p style={{ color: '#ef4444' }}>{error}</p>}

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {templates.map(tpl => (
              <article key={tpl.id} style={{
                padding: 14, background: 'var(--bg-primary)',
                border: '1px solid var(--border)', borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 999, background: CATEGORY_COLOR[tpl.category] || '#94a3b8',
                    color: 'var(--bg-primary)', textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{CATEGORY_LABEL[tpl.category] || tpl.category}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 6px',
                    borderRadius: 999, background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)', border: '1px solid var(--border)',
                  }}>{TYPE_BADGE[tpl.interfaceType] || tpl.interfaceType}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 14 }}>{tpl.label}</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4 }}>
                  {tpl.description}
                </p>
                <button
                  onClick={() => pick(tpl)}
                  disabled={creating !== null}
                  style={{
                    padding: '8px 12px', background: 'var(--accent)',
                    color: 'var(--bg-primary)', border: 0, borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: creating ? 'wait' : 'pointer',
                    opacity: creating === tpl.id ? 0.5 : 1,
                  }}
                >
                  {creating === tpl.id ? 'Erstelle…' : 'Verwenden'}
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
