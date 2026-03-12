import { useState, useEffect, useRef, useCallback } from 'react';
import type { ViolationRecord } from '../types/drone';

interface Props {
  records: ViolationRecord[];
  collapsed: boolean;
  selectedRecordId: string | null;
  onToggleCollapsed: () => void;
  onDeleteRecord: (recordId: string) => void;
  onToggleTracking: (recordId: string) => void;
  onClearAll: () => void;
  onSelectRecord: (recordId: string) => void;
  onOpenReport: (recordId: string) => void;
  onHeightChange?: (height: number) => void;
  /** If true, hide delete buttons */
  readOnly?: boolean;
}

function formatTime(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  fontSize: 11,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '5px 12px',
  whiteSpace: 'nowrap',
  fontSize: 12,
};

export default function ViolationTable({
  records,
  collapsed,
  selectedRecordId,
  onToggleCollapsed,
  onDeleteRecord,
  onToggleTracking,
  onClearAll,
  onSelectRecord,
  onOpenReport,
  onHeightChange,
  readOnly = false,
}: Props) {
  // Force re-render every second for live duration updates
  const [, setTick] = useState(0);
  useEffect(() => {
    if (records.some(r => r.endTime === null)) {
      const interval = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [records.some(r => r.endTime === null)]);

  // Measure height via callback ref — fires when element mounts/unmounts
  const roRef = useRef<ResizeObserver | null>(null);
  const measuredRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!onHeightChange) return;
    if (!node) {
      onHeightChange(0);
      return;
    }
    const ro = new ResizeObserver(() => onHeightChange(node.offsetHeight));
    ro.observe(node);
    roRef.current = ro;
    onHeightChange(node.offsetHeight);
  }, [onHeightChange]);

  if (records.length === 0) return null;

  const now = Date.now() / 1000;
  const activeCount = records.filter(r => r.endTime === null).length;
  const sorted = [...records].sort((a, b) => b.startTime - a.startTime);

  return (
    <div
      ref={measuredRef}
      data-testid="violation-table"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2500,
        background: 'var(--bg-secondary)',
        borderTop: '2px solid var(--status-error)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header bar - always visible */}
      <div
        data-testid="violation-table-header"
        onClick={onToggleCollapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          background: activeCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--status-error)', fontSize: 14 }}>&#9888;</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Zonenverstöße ({records.length})
          </span>
          {activeCount > 0 && (
            <span
              data-testid="active-violations-badge"
              style={{
                background: 'var(--status-error)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 8,
                animation: 'violationPulse 2s ease-in-out infinite',
              }}
            >
              {activeCount} aktiv
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onClearAll(); }}
              data-testid="clear-all-violations-btn"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Alle löschen
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {collapsed ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </div>

      {/* Table body - collapsible */}
      {!collapsed && (
        <div data-testid="violation-table-body" style={{ maxHeight: 250, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={thStyle}></th>
                <th style={thStyle}>Drohne</th>
                <th style={thStyle}>Zone</th>
                <th style={thStyle}>Beginn</th>
                <th style={thStyle}>Dauer</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Trail</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Bericht</th>
                {!readOnly && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(record => {
                const duration = (record.endTime || now) - record.startTime;
                const isActive = record.endTime === null;
                const isSelected = record.id === selectedRecordId;

                return (
                  <tr
                    key={record.id}
                    data-testid={`violation-row-${record.id}`}
                    onClick={() => onSelectRecord(record.id)}
                    style={{
                      borderBottom: '1px solid var(--bg-tertiary)',
                      background: isSelected
                        ? 'rgba(59, 130, 246, 0.12)'
                        : isActive ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                      cursor: 'pointer',
                      outline: isSelected ? '1px solid var(--accent)' : 'none',
                    }}
                  >
                    <td style={tdStyle}>
                      <span
                        data-testid={isActive ? 'violation-active-dot' : 'violation-ended-dot'}
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isActive ? 'var(--status-error)' : 'var(--text-muted)',
                          boxShadow: isActive ? '0 0 6px var(--status-error)' : 'none',
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <div
                        data-testid={`violation-drone-${record.droneId}`}
                      >
                        <div style={{ fontWeight: 500 }}>{record.droneName}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{record.droneId}</div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ borderLeft: `3px solid ${record.zoneColor}`, paddingLeft: 6 }}>
                        {record.zoneName}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {formatTime(record.startTime)}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace' }}>
                        {formatDuration(duration)}
                      </span>
                      {isActive && (
                        <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--status-error)', fontWeight: 600 }}>
                          live
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleTracking(record.id); }}
                        data-testid={`toggle-trail-${record.id}`}
                        title={record.trackingVisible ? 'Trail ausblenden' : 'Trail anzeigen'}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: 14,
                          cursor: 'pointer',
                          color: record.trackingVisible ? 'var(--accent)' : 'var(--text-muted)',
                          padding: '2px 6px',
                          opacity: record.trackingVisible ? 1 : 0.5,
                        }}
                      >
                        {record.trackingVisible ? '\u25C9' : '\u25CB'}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenReport(record.id); }}
                        title="Flugbericht anzeigen"
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          fontSize: 10,
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        &#128196;
                      </button>
                    </td>
                    {!readOnly && (
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                          data-testid={`delete-violation-${record.id}`}
                          title="Verstoß löschen"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--status-error)',
                            fontSize: 13,
                            cursor: 'pointer',
                            padding: '2px 6px',
                          }}
                        >
                          &#10005;
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
