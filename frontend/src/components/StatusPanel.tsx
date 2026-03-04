import type { Drone } from '../types/drone';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktiv', color: 'var(--status-active)' },
  idle: { label: 'Leerlauf', color: 'var(--status-idle)' },
  error: { label: 'Fehler', color: 'var(--status-error)' },
  lost: { label: 'Verloren', color: 'var(--status-lost)' },
};

function signalBar(rssi: number): { level: number; color: string; label: string } {
  if (rssi >= -50) return { level: 4, color: 'var(--signal-good)', label: 'Stark' };
  if (rssi >= -60) return { level: 3, color: 'var(--signal-good)', label: 'Gut' };
  if (rssi >= -70) return { level: 2, color: 'var(--signal-mid)', label: 'Mittel' };
  if (rssi >= -80) return { level: 1, color: 'var(--signal-bad)', label: 'Schwach' };
  return { level: 0, color: 'var(--signal-bad)', label: 'Kritisch' };
}

function batteryColor(pct: number): string {
  if (pct > 50) return 'var(--signal-good)';
  if (pct > 20) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('de-DE');
}

interface Props {
  drone: Drone;
  onClose: () => void;
}

export default function StatusPanel({ drone, onClose }: Props) {
  const navigate = useNavigate();
  const statusInfo = STATUS_LABELS[drone.status] || STATUS_LABELS.lost;
  const signal = signalBar(drone.signal_strength);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 350,
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{drone.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {drone.basic_id} &middot; {drone.mac}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Panel schließen"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 20,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: statusInfo.color,
            boxShadow: `0 0 6px ${statusInfo.color}`,
          }} />
          <span style={{ color: statusInfo.color, fontWeight: 600 }}>{statusInfo.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {formatTimestamp(drone.last_update)}
          </span>
        </div>

        {/* Signal */}
        <Section title="Signal">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 4 + i * 4,
                    borderRadius: 1,
                    background: i <= signal.level ? signal.color : 'var(--border)',
                  }}
                />
              ))}
            </div>
            <span style={{ color: signal.color, fontSize: 14, fontWeight: 500 }}>
              {drone.signal_strength} dBm
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({signal.label})</span>
          </div>
        </Section>

        {/* Battery */}
        <Section title="Batterie">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 120,
              height: 8,
              background: 'var(--bg-primary)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${drone.battery}%`,
                height: '100%',
                background: batteryColor(drone.battery),
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ color: batteryColor(drone.battery), fontWeight: 500 }}>
              {drone.battery.toFixed(1)}%
            </span>
          </div>
        </Section>

        {/* Position */}
        <Section title="Position">
          <DataRow label="Breitengrad" value={drone.latitude.toFixed(6)} />
          <DataRow label="Längengrad" value={drone.longitude.toFixed(6)} />
          <DataRow label="Höhe" value={`${drone.altitude.toFixed(1)} m`} />
          <DataRow label="Geschwindigkeit" value={`${drone.speed.toFixed(1)} m/s`} />
          <DataRow label="Flugmuster" value={drone.flight_pattern} />
          {drone.distance !== undefined && (
            <DataRow label="Entfernung" value={`${(drone.distance / 1000).toFixed(2)} km`} />
          )}
        </Section>

        {/* Pilot */}
        <Section title="Pilot">
          <DataRow label="Breitengrad" value={drone.pilot_latitude.toFixed(6)} />
          <DataRow label="Längengrad" value={drone.pilot_longitude.toFixed(6)} />
        </Section>

        {/* FAA Data */}
        {drone.faa_data && (
          <Section title="FAA Registrierung">
            <DataRow label="Name" value={drone.faa_data.registrant_name} />
            <DataRow label="Hersteller" value={drone.faa_data.manufacturer} />
            <DataRow label="Modell" value={drone.faa_data.model} />
            <DataRow label="Seriennr." value={drone.faa_data.serial_number} />
            <DataRow label="Gewicht" value={`${drone.faa_data.weight} kg`} />
            <DataRow label="Zweck" value={drone.faa_data.purpose} />
            <DataRow label="Status" value={drone.faa_data.status} />
          </Section>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--border)',
      }}>
        <button
          onClick={() => navigate(`/drone/${drone.id}`)}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Details anzeigen
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-muted)',
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '3px 0',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 12 }}>{value}</span>
    </div>
  );
}
