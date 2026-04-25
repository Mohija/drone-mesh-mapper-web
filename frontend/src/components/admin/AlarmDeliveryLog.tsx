import { useEffect, useState } from 'react';
import { AlarmDelivery, listAlarmDeliveries } from '../../api';

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--accent)',
  failed: '#ef4444',
  retrying: '#f59e0b',
  pending: 'var(--text-muted)',
};

export default function AlarmDeliveryLog({ interfaceId }: { interfaceId: string }) {
  const [items, setItems] = useState<AlarmDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await listAlarmDeliveries({ interfaceId, limit: 50 });
      setItems(res.items);
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [interfaceId]);

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Letzte Lieferungen
        </p>
        <button onClick={reload} style={{
          padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
        }}>Aktualisieren</button>
      </div>
      {loading && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Lädt…</p>}
      {!loading && items.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Noch keine Lieferungen.</p>
      )}
      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {items.map(d => (
            <div key={d.id} style={{
              padding: '6px 10px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 4, fontSize: 11,
              cursor: 'pointer',
            }} onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: STATUS_COLOR[d.status] || 'inherit', fontWeight: 600 }}>
                  {d.status.toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {d.triggerType}
                  {d.attempt > 1 && ` (Versuch ${d.attempt})`}
                  {d.httpStatus != null && ` • HTTP ${d.httpStatus}`}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {new Date(d.startedAt * 1000).toLocaleString()}
                </span>
              </div>
              {expanded === d.id && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  {d.error && <p style={{ margin: '0 0 6px', color: '#ef4444' }}>{d.error}</p>}
                  {d.requestPayload != null && (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)' }}>Request-Payload</summary>
                      <pre style={{ margin: '4px 0 0', maxHeight: 160, overflow: 'auto', fontSize: 10 }}>
                        {JSON.stringify(d.requestPayload, null, 2)}
                      </pre>
                    </details>
                  )}
                  {d.responseBody && (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)' }}>Response</summary>
                      <pre style={{ margin: '4px 0 0', maxHeight: 160, overflow: 'auto', fontSize: 10 }}>
                        {d.responseBody}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
