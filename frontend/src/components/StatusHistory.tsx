import type { DroneHistoryEntry } from '../types/drone';

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--status-active)',
  idle: 'var(--status-idle)',
  error: 'var(--status-error)',
  lost: 'var(--status-lost)',
};

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface Props {
  droneId: string;
  history: DroneHistoryEntry[];
}

export default function StatusHistory({ droneId: _droneId, history }: Props) {
  if (history.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
        Noch keine Verlaufsdaten verfügbar
      </div>
    );
  }

  // Show last 30 entries
  const entries = history.slice(-30).reverse();

  return (
    <div>
      {/* Timeline header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 60px 80px 60px 1fr',
        gap: 8,
        padding: '4px 0',
        fontSize: 11,
        color: 'var(--text-muted)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        borderBottom: '1px solid var(--border)',
        marginBottom: 4,
      }}>
        <span>Zeit</span>
        <span>Status</span>
        <span>Höhe</span>
        <span>Batterie</span>
        <span>Position</span>
      </div>

      {/* Timeline entries */}
      <div style={{ maxHeight: 300, overflow: 'auto' }}>
        {entries.map((entry, i) => {
          const color = STATUS_COLORS[entry.status] || STATUS_COLORS.lost;
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 60px 80px 60px 1fr',
                gap: 8,
                padding: '4px 0',
                fontSize: 12,
                borderBottom: '1px solid var(--bg-tertiary)',
                opacity: i > 15 ? 0.5 : 1,
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatTime(entry.timestamp)}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color }}>{entry.status}</span>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {entry.altitude.toFixed(1)}m
              </span>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: entry.battery > 50 ? 'var(--signal-good)' : entry.battery > 20 ? 'var(--signal-mid)' : 'var(--signal-bad)',
              }}>
                {entry.battery.toFixed(0)}%
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>
                {entry.lat.toFixed(4)}, {entry.lon.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: 12,
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderRadius: 6,
        fontSize: 12,
        color: 'var(--text-secondary)',
        display: 'flex',
        gap: 16,
      }}>
        <span>{history.length} Einträge</span>
        <span>
          Zeitraum: {formatTime(history[0].timestamp)} - {formatTime(history[history.length - 1].timestamp)}
        </span>
      </div>
    </div>
  );
}
