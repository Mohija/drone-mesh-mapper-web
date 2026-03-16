import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAuditLogs, fetchAuditActions, fetchAuditResourceTypes,
  type AuditLogEntry, authFetch, API_BASE,
} from '../../api';
import { useIsMobile } from '../../useIsMobile';
import AdminTooltip from './AdminTooltip';

const ACTION_LABELS: Record<string, string> = {
  create: 'Erstellt',
  update: 'Geändert',
  delete: 'Gelöscht',
  login: 'Anmeldung',
  logout: 'Abmeldung',
  switch_tenant: 'Mandant gewechselt',
};

const RESOURCE_LABELS: Record<string, string> = {
  zone: 'Einsatz-Zone',
  receiver: 'Empfänger',
  user: 'Benutzer',
  settings: 'Einstellungen',
  tenant: 'Mandant',
  auth: 'Authentifizierung',
  firmware: 'Firmware',
};

const ACTION_COLORS: Record<string, string> = {
  create: '#22c55e',
  update: '#3b82f6',
  delete: '#ef4444',
  login: '#8b8b8b',
  logout: '#8b8b8b',
  switch_tenant: '#f59e0b',
};

const PAGE_SIZE = 100;

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDetails(details: Record<string, unknown> | null): React.ReactNode {
  if (!details) return null;

  // Handle 'changes' field
  if (details.changes && typeof details.changes === 'object') {
    const changes = details.changes as Record<string, unknown>;
    const parts = Object.entries(changes).map(([key, val]) => {
      if (typeof val === 'object' && val !== null && 'from' in (val as Record<string, unknown>) && 'to' in (val as Record<string, unknown>)) {
        const v = val as { from: unknown; to: unknown };
        return `${key}: ${String(v.from)} → ${String(v.to)}`;
      }
      return `${key}: ${String(val)}`;
    });
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parts.join(', ')}</span>;
  }

  // Handle 'action' sub-field
  if (typeof details.action === 'string') {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{details.action}</span>;
  }

  // Fallback: compact JSON
  const keys = Object.keys(details);
  if (keys.length === 0) return null;

  return (
    <details style={{ fontSize: 11 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Details</summary>
      <pre style={{
        margin: '4px 0 0', padding: 8, borderRadius: 4,
        background: 'var(--bg-primary)', fontSize: 10,
        overflow: 'auto', maxHeight: 200,
      }}>
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  );
}

export default function AuditLogTab() {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [searchText, setSearchText] = useState('');
  const [offset, setOffset] = useState(0);

  // Available filter options from API
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableResourceTypes, setAvailableResourceTypes] = useState<string[]>([]);

  // Audit enabled toggle
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditToggling, setAuditToggling] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load audit enabled state
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/admin/audit/enabled`);
        if (res.ok) {
          const data = await res.json();
          setAuditEnabled(data.enabled);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const toggleAudit = async () => {
    setAuditToggling(true);
    try {
      const res = await authFetch(`${API_BASE}/admin/audit/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !auditEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditEnabled(data.enabled);
      }
    } catch { /* ignore */ }
    finally { setAuditToggling(false); }
  };

  const downloadLog = (format: 'csv' | 'json') => {
    window.open(`${API_BASE}/admin/audit/download?format=${format}`, '_blank');
  };

  const loadEntries = useCallback(async () => {
    try {
      const data = await fetchAuditLogs({
        action: filterAction || undefined,
        resource_type: filterResource || undefined,
        user: filterUser || undefined,
        search: searchText || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEntries(data.entries);
      setTotal(data.total);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterResource, filterUser, searchText, offset]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [actions, resourceTypes] = await Promise.all([
        fetchAuditActions(),
        fetchAuditResourceTypes(),
      ]);
      setAvailableActions(actions);
      setAvailableResourceTypes(resourceTypes);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadEntries();
    loadFilterOptions();
  }, [loadEntries, loadFilterOptions]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadEntries, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadEntries]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div data-testid="audit-log-tab">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>
          <span style={{ marginRight: 8, fontSize: isMobile ? 18 : 20 }}>&#x1f6e1;</span>
          Sicherheits-Audit
        </h1>
        <AdminTooltip
          brief="Audit-Log"
          detail="Protokolliert alle sicherheitsrelevanten Aktionen: Anmeldungen, Änderungen an Zonen, Empfängern, Benutzern und Einstellungen. Nicht löschbar."
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', cursor: 'help',
          }}>?</span>
        </AdminTooltip>
        <div style={{ flex: 1 }} />
        {/* Status */}
        <span style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 4,
          background: auditEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: auditEnabled ? '#22c55e' : '#ef4444',
          fontWeight: 600,
        }}>
          {auditEnabled ? 'Aktiv' : 'Deaktiviert'}
        </span>
        {/* Download */}
        <button onClick={() => downloadLog('csv')} style={{
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}>CSV</button>
        <button onClick={() => downloadLog('json')} style={{
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}>JSON</button>
        <span style={{
          fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)', padding: '4px 8px',
          borderRadius: 4,
        }}>
          {total} Einträge
        </span>
      </div>

      {!auditEnabled && (
        <div style={{
          padding: '12px 16px', marginBottom: 12,
          background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 8, color: '#eab308', fontSize: 13,
        }}>
          Audit-Logging ist deaktiviert. Aktiviere es unter <strong>Einstellungen → Sicherheits-Audit</strong> um Benutzeraktionen zu protokollieren.
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, color: '#ef4444', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Filter: Action */}
        <select
          data-testid="audit-filter-action"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          <option value="">Alle Aktionen</option>
          {availableActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>

        {/* Filter: Resource Type */}
        <select
          data-testid="audit-filter-resource"
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          <option value="">Alle Ressourcen</option>
          {availableResourceTypes.map(r => (
            <option key={r} value={r}>{RESOURCE_LABELS[r] || r}</option>
          ))}
        </select>

        {/* Filter: User */}
        <input
          data-testid="audit-filter-user"
          type="text"
          placeholder="Benutzer..."
          value={filterUser}
          onChange={(e) => { setFilterUser(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px 10px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            width: isMobile ? '100%' : 140,
            minHeight: isMobile ? 40 : undefined,
          }}
        />

        {/* Search */}
        <input
          data-testid="audit-filter-search"
          type="text"
          placeholder="Suche..."
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px 10px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            flex: isMobile ? '1 1 100%' : '0 1 200px',
            minHeight: isMobile ? 40 : undefined,
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Auto-refresh toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto
        </label>

        {/* Refresh */}
        <button
          onClick={() => { setLoading(true); loadEntries(); }}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px 14px' : '6px 10px',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: isMobile ? 14 : 12,
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          Aktualisieren
        </button>
      </div>

      {/* Audit Table */}
      <div data-testid="audit-table" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {loading && entries.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            Lade Audit-Log...
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            Keine Audit-Einträge vorhanden
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: isMobile ? 13 : 12,
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Zeitpunkt</th>
                  <th style={thStyle}>Benutzer</th>
                  <th style={{ ...thStyle, width: 100 }}>Aktion</th>
                  {!isMobile && <th style={thStyle}>Ressource</th>}
                  {!isMobile && <th style={thStyle}>Details</th>}
                  {!isMobile && <th style={{ ...thStyle, width: 120 }}>IP</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <React.Fragment key={entry.id}>
                    <tr
                      data-testid={`audit-entry-${entry.id}`}
                      style={{
                        borderBottom: isMobile ? 'none' : '1px solid var(--border)',
                        background: entry.action === 'delete' ? 'rgba(239,68,68,0.05)' :
                                    entry.action === 'login' || entry.action === 'logout' ? 'rgba(139,139,139,0.05)' : undefined,
                      }}
                    >
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11 }}>
                        {formatTime(entry.timestamp)}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>
                        {entry.username}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '2px 6px',
                          borderRadius: 4, fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: '#fff',
                          background: ACTION_COLORS[entry.action] || '#666',
                        }}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      {!isMobile && (
                        <td style={tdStyle}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {RESOURCE_LABELS[entry.resourceType] || entry.resourceType}
                          </span>
                          {entry.resourceName && (
                            <span style={{
                              display: 'block', fontSize: 11, fontWeight: 500,
                              color: 'var(--text-primary)', marginTop: 1,
                            }}>
                              {entry.resourceName}
                            </span>
                          )}
                        </td>
                      )}
                      {!isMobile && (
                        <td style={{ ...tdStyle, wordBreak: 'break-word' }}>
                          {formatDetails(entry.details)}
                        </td>
                      )}
                      {!isMobile && (
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>
                          {entry.ipAddress || '-'}
                        </td>
                      )}
                    </tr>
                    {/* Mobile: show resource + details inline below each row */}
                    {isMobile && (
                      <tr style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                      }}>
                        <td colSpan={3} style={{ padding: '4px 12px 8px', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {RESOURCE_LABELS[entry.resourceType] || entry.resourceType}
                          </span>
                          {entry.resourceName && (
                            <span style={{ fontWeight: 500, marginLeft: 6 }}>
                              {entry.resourceName}
                            </span>
                          )}
                          {entry.ipAddress && (
                            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {entry.ipAddress}
                            </span>
                          )}
                          {entry.details && (
                            <div style={{ marginTop: 4 }}>
                              {formatDetails(entry.details)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '10px 12px',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              style={paginationBtnStyle}
            >
              Zurück
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Seite {currentPage} / {totalPages}
            </span>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              style={paginationBtnStyle}
            >
              Weiter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-muted)',
  background: 'var(--bg-tertiary)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
};

const paginationBtnStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 12px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 12,
};
