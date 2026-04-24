import { useState, useEffect, useCallback, useRef } from 'react';
import HelpLink from '../HelpLink';
import {
  fetchLogs, fetchLogLevel, setLogLevel, clearLogs, fetchLogModules,
  type SystemLogEntry,
} from '../../api';
import { useIsMobile } from '../../useIsMobile';
import AdminTooltip from './AdminTooltip';

const LOG_LEVELS = ['debug', 'info', 'warning', 'error'];
const LEVEL_COLORS: Record<string, string> = {
  debug: '#8b8b8b',
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
};

const PAGE_SIZE = 100;

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function LogViewerTab() {
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterLevel, setFilterLevel] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [searchText, setSearchText] = useState('');
  const [offset, setOffset] = useState(0);

  // Log level config
  const [currentLevel, setCurrentLevel] = useState('info');
  const [modules, setModules] = useState<string[]>([]);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const data = await fetchLogs({
        level: filterLevel || undefined,
        module: filterModule || undefined,
        search: searchText || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setLogs(data.logs);
      setTotal(data.total);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterModule, searchText, offset]);

  const loadMeta = useCallback(async () => {
    try {
      const [level, mods] = await Promise.all([fetchLogLevel(), fetchLogModules()]);
      setCurrentLevel(level);
      setModules(mods);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadLogs();
    loadMeta();
  }, [loadLogs, loadMeta]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadLogs, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadLogs]);

  const handleLevelChange = async (level: string) => {
    try {
      const result = await setLogLevel(level);
      setCurrentLevel(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Level setzen fehlgeschlagen');
    }
  };

  const handleClear = async () => {
    if (!confirm('Alle Logs für diesen Mandanten löschen?')) return;
    try {
      await clearLogs();
      setLogs([]);
      setTotal(0);
      setOffset(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>System-Logs</h1>
        <HelpLink section="admin" sub="log-viewer" title="Hilfe: System-Logs" size={18} />
        <AdminTooltip
          brief="Mandanten-Logs"
          detail="Systemweite Log-Einträge für diesen Mandanten. Log-Level bestimmt, welche Einträge erfasst werden. Debug zeigt alle Details, Error nur Fehler."
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', cursor: 'help',
          }}>?</span>
        </AdminTooltip>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)', padding: '4px 8px',
          borderRadius: 4,
        }}>
          {total} Einträge
        </span>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, color: '#ef4444', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Log Level Setting */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Level:</span>
          <select
            data-testid="log-level-select"
            value={currentLevel}
            onChange={(e) => handleLevelChange(e.target.value)}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 4, padding: isMobile ? '8px' : '4px 6px',
              fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
              minHeight: isMobile ? 40 : undefined,
            }}
          >
            {LOG_LEVELS.map(l => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Filter: Level */}
        <select
          data-testid="log-filter-level"
          value={filterLevel}
          onChange={(e) => { setFilterLevel(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          <option value="">Alle Level</option>
          {LOG_LEVELS.map(l => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          ))}
        </select>

        {/* Filter: Module */}
        <select
          data-testid="log-filter-module"
          value={filterModule}
          onChange={(e) => { setFilterModule(e.target.value); setOffset(0); }}
          style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: isMobile ? '8px' : '6px 8px',
            fontSize: isMobile ? 14 : 12, color: 'var(--text-primary)',
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          <option value="">Alle Module</option>
          {modules.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Search */}
        <input
          data-testid="log-search"
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

        {/* Clear */}
        <button
          onClick={handleClear}
          style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6, padding: isMobile ? '8px 14px' : '6px 10px',
            color: '#ef4444', cursor: 'pointer', fontSize: isMobile ? 14 : 12,
            minHeight: isMobile ? 40 : undefined,
          }}
        >
          Löschen
        </button>

        {/* Refresh */}
        <button
          onClick={() => { setLoading(true); loadLogs(); }}
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

      {/* Log Table */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            Lade Logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            Keine Log-Einträge vorhanden
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: isMobile ? 13 : 12,
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Zeit</th>
                  <th style={{ ...thStyle, width: 70 }}>Level</th>
                  {!isMobile && <th style={{ ...thStyle, width: 120 }}>Modul</th>}
                  <th style={thStyle}>Nachricht</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: log.level === 'error' ? 'rgba(239,68,68,0.05)' :
                                log.level === 'warning' ? 'rgba(245,158,11,0.05)' : undefined,
                  }}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11 }}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 6px',
                        borderRadius: 4, fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        color: '#fff',
                        background: LEVEL_COLORS[log.level] || '#666',
                      }}>
                        {log.level}
                      </span>
                    </td>
                    {!isMobile && (
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>
                        {log.module}
                      </td>
                    )}
                    <td style={{ ...tdStyle, wordBreak: 'break-word' }}>
                      {isMobile && (
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
                          display: 'block', marginBottom: 2,
                        }}>
                          {log.module}
                        </span>
                      )}
                      {log.message}
                      {log.details && (
                        <details style={{ marginTop: 4, fontSize: 11 }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Details</summary>
                          <pre style={{
                            margin: '4px 0 0', padding: 8, borderRadius: 4,
                            background: 'var(--bg-primary)', fontSize: 10,
                            overflow: 'auto', maxHeight: 200,
                          }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
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
