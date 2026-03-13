import { useState, useEffect, useCallback } from 'react';
import {
  fetchReceivers,
  createReceiver,
  updateReceiver,
  deleteReceiver,
  regenerateReceiverKey,
  fetchReceiverStats,
} from '../../api';
import type { ReceiverNode, ReceiverStats } from '../../api';
import ReceiverFlashWizard from './ReceiverFlashWizard';

const HARDWARE_TYPES = [
  { value: 'esp32-s3', label: 'ESP32-S3', desc: 'BLE + WiFi ODID, HTTPS' },
  { value: 'esp32-c3', label: 'ESP32-C3', desc: 'BLE + WiFi ODID, HTTPS' },
  { value: 'esp8266', label: 'ESP8266', desc: 'Nur WiFi-Beacon ODID, kein BLE, kein HTTPS', limited: true },
];

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  stale: '#eab308',
  offline: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  stale: 'Verzögert',
  offline: 'Offline',
};

function timeAgo(epoch: number | null): string {
  if (!epoch) return 'Nie';
  const seconds = Math.floor(Date.now() / 1000 - epoch);
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return '-';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function ReceiverList() {
  const [receivers, setReceivers] = useState<ReceiverNode[]>([]);
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('esp32-s3');
  const [creating, setCreating] = useState(false);

  // Newly created key (shown once)
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Flash wizard
  const [flashNode, setFlashNode] = useState<ReceiverNode | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([fetchReceivers(), fetchReceiverStats()]);
      setReceivers(r);
      setStats(s);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const node = await createReceiver({ name: newName.trim(), hardware_type: newType });
      setNewKey({ id: node.id, key: node.apiKey! });
      setNewName('');
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (node: ReceiverNode) => {
    try {
      await updateReceiver(node.id, { is_active: !node.isActive });
      await loadData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReceiver(id);
      await loadData();
    } catch { /* silent */ }
  };

  const handleRegenKey = async (id: string) => {
    try {
      const node = await regenerateReceiverKey(id);
      setNewKey({ id: node.id, key: node.apiKey! });
      setCopied(false);
    } catch { /* silent */ }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Laden...</div>;
  }

  return (
    <div data-testid="receiver-list">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Empfänger</h1>
        <button
          data-testid="receiver-create-btn"
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Neuer Empfänger
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div data-testid="receiver-stats" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Gesamt', value: stats.total, color: 'var(--text-primary)', tid: 'stat-total' },
            { label: 'Online', value: stats.online, color: '#22c55e', tid: 'stat-online' },
            { label: 'Verzögert', value: stats.stale, color: '#eab308', tid: 'stat-stale' },
            { label: 'Offline', value: stats.offline, color: '#6b7280', tid: 'stat-offline' },
            { label: 'Erkennungen', value: stats.totalDetections, color: '#14b8a6', tid: 'stat-detections' },
          ].map(s => (
            <div key={s.label} data-testid={s.tid} style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 16px',
              minWidth: 90,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid var(--status-error)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--status-error)',
        }}>
          {error}
        </div>
      )}

      {/* API Key display (shown once after create/regenerate) */}
      {newKey && (
        <div data-testid="api-key-banner" style={{
          background: 'rgba(20,184,166,0.1)',
          border: '1px solid #14b8a6',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#14b8a6' }}>
            API-Key (wird nur einmal angezeigt!)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code data-testid="api-key-value" style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}>
              {newKey.key}
            </code>
            <button
              data-testid="api-key-copy"
              onClick={() => copyKey(newKey.key)}
              style={{
                padding: '6px 12px',
                background: copied ? '#22c55e' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: copied ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Kopiert!' : 'Kopieren'}
            </button>
            <button
              data-testid="api-key-dismiss"
              onClick={() => setNewKey(null)}
              style={{
                padding: '6px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Schliessen
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div data-testid="receiver-create-form" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Neuen Empfänger erstellen</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                data-testid="receiver-name-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="z.B. Empfänger Dach-Nord"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hardware-Typ</label>
              <select
                data-testid="receiver-type-select"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                {HARDWARE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}{t.limited ? ' (eingeschränkt)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              data-testid="receiver-submit-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating || !newName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Erstellen...' : 'Erstellen'}
            </button>
          </div>
          {newType === 'esp8266' && (
            <div data-testid="esp8266-warning" style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(234,179,8,0.1)',
              border: '1px solid #eab308',
              borderRadius: 6,
              fontSize: 12,
              color: '#eab308',
            }}>
              ESP8266 ist eine Light-Variante: Kein BLE (nur WiFi-Beacon ODID), kein HTTPS, eingeschränkter RAM.
            </div>
          )}
        </div>
      )}

      {/* Receiver table */}
      {receivers.length === 0 ? (
        <div data-testid="receiver-empty" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 32,
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: 14,
        }}>
          Noch keine Empfänger erstellt.
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <table data-testid="receiver-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Name</th>
                <th style={thStyle}>Typ</th>
                <th style={thStyle}>Letzter Kontakt</th>
                <th style={thStyle}>Erkennungen</th>
                <th style={thStyle}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {receivers.map(node => (
                <>
                  <tr
                    key={node.id}
                    data-testid={`receiver-row-${node.id}`}
                    onClick={() => setExpandedId(expandedId === node.id ? null : node.id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: expandedId === node.id ? 'rgba(59,130,246,0.05)' : 'transparent',
                      opacity: node.isActive ? 1 : 0.5,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span data-testid={`receiver-status-${node.id}`} style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLORS[node.status],
                        boxShadow: node.status === 'online' ? `0 0 6px ${STATUS_COLORS.online}` : 'none',
                      }} />
                      <div data-testid={`receiver-status-label-${node.id}`} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {STATUS_LABELS[node.status]}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {node.name}
                      {!node.isActive && (
                        <span style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444',
                          marginLeft: 8,
                        }}>
                          Deaktiviert
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ fontSize: 12 }}>{node.hardwareType.toUpperCase()}</span>
                      {node.hardwareType === 'esp8266' && (
                        <span style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234,179,8,0.15)',
                          color: '#eab308',
                          marginLeft: 4,
                        }}>
                          Light
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12 }}>
                      {timeAgo(node.lastHeartbeat)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ color: '#14b8a6', fontWeight: 600 }}>{node.totalDetections}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <button
                          data-testid={`receiver-toggle-${node.id}`}
                          onClick={() => handleToggleActive(node)}
                          title={node.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          style={actionBtnStyle}
                        >
                          {node.isActive ? 'Deakt.' : 'Akt.'}
                        </button>
                        <button
                          data-testid={`receiver-delete-${node.id}`}
                          onClick={() => handleDelete(node.id)}
                          title="Löschen"
                          style={{ ...actionBtnStyle, color: '#ef4444' }}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === node.id && (
                    <tr key={`${node.id}-detail`} data-testid={`receiver-detail-${node.id}`}>
                      <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--bg-primary)' }}>
                        <div data-testid={`receiver-detail-grid-${node.id}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 12 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>ID:</span> <code style={{ fontSize: 11 }}>{node.id}</code></div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Firmware:</span> {node.firmwareVersion || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>IP:</span> {node.lastIp || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>WiFi:</span> {node.wifiSsid || '-'} {node.wifiRssi != null && `(${node.wifiRssi} dBm)`}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Heap:</span> {node.freeHeap != null ? `${(node.freeHeap / 1024).toFixed(0)} KB` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Uptime:</span> {formatUptime(node.uptimeSeconds)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Standort:</span> {node.lastLatitude != null ? `${node.lastLatitude.toFixed(5)}, ${node.lastLongitude?.toFixed(5)}` : '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Seit Boot:</span> {node.detectionsSinceBoot}</div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <button
                            data-testid={`receiver-flash-${node.id}`}
                            onClick={() => setFlashNode(node)}
                            style={{
                              padding: '5px 12px',
                              background: '#14b8a6',
                              border: 'none',
                              borderRadius: 6,
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Firmware flashen
                          </button>
                          <button
                            data-testid={`receiver-regen-key-${node.id}`}
                            onClick={() => handleRegenKey(node.id)}
                            style={{
                              padding: '5px 12px',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: 11,
                            }}
                          >
                            API-Key regenerieren
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flash Wizard Modal */}
      {flashNode && (
        <ReceiverFlashWizard
          node={flashNode}
          onClose={() => { setFlashNode(null); loadData(); }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  textAlign: 'center',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
};
