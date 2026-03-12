import type { TrackedFlight, ArchivedTrailSummary } from '../types/drone';

interface Props {
  trackedFlights: Map<string, TrackedFlight>;
  archives: ArchivedTrailSummary[];
  onUntrack: (droneId: string) => void;
  onArchive: (droneId: string) => Promise<void>;
  onDeleteArchive: (archiveId: string) => Promise<void>;
  onTrack: (droneId: string) => void;
  onClose: () => void;
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function daysLeft(expiresAt: number): string {
  const days = Math.ceil((expiresAt * 1000 - Date.now()) / 86400000);
  if (days <= 0) return 'abgelaufen';
  return `${days}d`;
}

export default function TrackingPanel({
  trackedFlights,
  archives,
  onUntrack,
  onArchive,
  onDeleteArchive,
  onClose,
}: Props) {
  const flights = [...trackedFlights.values()];
  const hasContent = flights.length > 0 || archives.length > 0;

  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: 8,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 12,
      zIndex: 2000,
      width: 300,
      maxHeight: 400,
      overflow: 'auto',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Tracking</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          &times;
        </button>
      </div>

      {!hasContent && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
          Kein aktives Tracking. Klicke auf eine Drohne und starte das Tracking.
        </div>
      )}

      {/* Active flights */}
      {flights.length > 0 && (
        <>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: 6,
          }}>
            Aktiv ({flights.length})
          </div>
          {flights.map(f => (
            <div key={f.droneId} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--bg-tertiary)',
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: f.color,
                boxShadow: f.state === 'tracking' ? `0 0 6px ${f.color}` : 'none',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {f.droneName}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {f.trail.length} Punkte
                  {f.state === 'tracking' ? ' \u00b7 Tracking' : ' \u00b7 Gestoppt'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {f.state === 'tracking' && (
                  <button
                    onClick={() => onUntrack(f.droneId)}
                    title="Tracking stoppen"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Stop
                  </button>
                )}
                {f.trail.length >= 2 && (
                  <button
                    onClick={() => onArchive(f.droneId)}
                    title="Archivieren (7 Tage)"
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      color: 'var(--accent)',
                      fontSize: 10,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Archiv
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Archives */}
      {archives.length > 0 && (
        <>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginTop: flights.length > 0 ? 12 : 0,
            marginBottom: 6,
          }}>
            Archiv ({archives.length})
          </div>
          {archives.map(a => (
            <div key={a.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--bg-tertiary)',
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: a.color,
                opacity: 0.6,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {a.droneName}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {a.pointCount} Punkte \u00b7 {formatDate(a.archivedAt * 1000)} {formatTime(a.archivedAt * 1000)} \u00b7 {daysLeft(a.expiresAt)}
                </div>
              </div>
              <button
                onClick={() => onDeleteArchive(a.id)}
                title="Archiv löschen"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--status-error)',
                  borderRadius: 4,
                  color: 'var(--status-error)',
                  fontSize: 10,
                  padding: '2px 6px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
