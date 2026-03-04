import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Drone, DroneHistoryEntry } from '../types/drone';
import { fetchDrone, fetchDroneHistory } from '../api';
import StatusHistory from './StatusHistory';

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--status-active)',
  idle: 'var(--status-idle)',
  error: 'var(--status-error)',
  lost: 'var(--status-lost)',
};

function signalColor(rssi: number): string {
  if (rssi >= -50) return 'var(--signal-good)';
  if (rssi >= -70) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

function batteryColor(pct: number): string {
  if (pct > 50) return 'var(--signal-good)';
  if (pct > 20) return 'var(--signal-mid)';
  return 'var(--signal-bad)';
}

export default function DroneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [drone, setDrone] = useState<Drone | null>(null);
  const [history, setHistory] = useState<DroneHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [droneData, historyData] = await Promise.all([
          fetchDrone(id!),
          fetchDroneHistory(id!),
        ]);
        setDrone(droneData);
        setHistory(historyData.history);
        setError(null);
      } catch {
        setError('Drohne nicht gefunden');
      }
    }

    load();
    intervalRef.current = setInterval(load, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>&#128681;</div>
        <div style={{ color: 'var(--status-error)', fontSize: 18 }}>{error}</div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 24px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Zur Karte
        </button>
      </div>
    );
  }

  if (!drone) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-secondary)',
      }}>
        Laden...
      </div>
    );
  }

  const statusColor = STATUS_COLORS[drone.status] || STATUS_COLORS.lost;

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          &#8592; Karte
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{drone.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {drone.basic_id} &middot; {drone.mac}
          </div>
        </div>
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: 20,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
          }} />
          <span style={{ color: statusColor, fontWeight: 600, fontSize: 13 }}>
            {drone.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
        padding: 24,
        maxWidth: 1200,
      }}>
        {/* Live Stats */}
        <Card title="Live-Status">
          <StatGrid>
            <StatItem
              label="Signal"
              value={`${drone.signal_strength} dBm`}
              color={signalColor(drone.signal_strength)}
            />
            <StatItem
              label="Batterie"
              value={`${drone.battery.toFixed(1)}%`}
              color={batteryColor(drone.battery)}
            />
            <StatItem label="Höhe" value={`${drone.altitude.toFixed(1)} m`} />
            <StatItem label="Geschwindigkeit" value={`${drone.speed.toFixed(1)} m/s`} />
          </StatGrid>
          <div style={{ marginTop: 12 }}>
            <div style={{
              height: 6,
              background: 'var(--bg-primary)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${drone.battery}%`,
                height: '100%',
                background: batteryColor(drone.battery),
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        </Card>

        {/* Position */}
        <Card title="Position">
          <DetailRow label="Breitengrad" value={drone.latitude.toFixed(6)} mono />
          <DetailRow label="Längengrad" value={drone.longitude.toFixed(6)} mono />
          <DetailRow label="Höhe" value={`${drone.altitude.toFixed(1)} m`} />
          <DetailRow label="Flugmuster" value={drone.flight_pattern} />
          {drone.distance !== undefined && (
            <DetailRow label="Entfernung" value={`${(drone.distance / 1000).toFixed(2)} km`} />
          )}
        </Card>

        {/* Pilot */}
        <Card title="Pilot-Position">
          <DetailRow label="Breitengrad" value={drone.pilot_latitude.toFixed(6)} mono />
          <DetailRow label="Längengrad" value={drone.pilot_longitude.toFixed(6)} mono />
        </Card>

        {/* FAA Data */}
        {drone.faa_data && (
          <Card title="FAA Registrierung">
            <DetailRow label="Registrant" value={drone.faa_data.registrant_name} />
            <DetailRow label="Typ" value={drone.faa_data.registrant_type} />
            <DetailRow label="Hersteller" value={drone.faa_data.manufacturer} />
            <DetailRow label="Modell" value={drone.faa_data.model} />
            <DetailRow label="Seriennr." value={drone.faa_data.serial_number} mono />
            <DetailRow label="Gewicht" value={`${drone.faa_data.weight} kg`} />
            <DetailRow label="Zweck" value={drone.faa_data.purpose} />
            <DetailRow label="Status" value={drone.faa_data.status} />
            <DetailRow label="Registriert" value={drone.faa_data.registration_date} />
            <DetailRow label="Gültig bis" value={drone.faa_data.expiration_date} />
          </Card>
        )}

        {/* History */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Card title="Status-Verlauf">
            <StatusHistory droneId={drone.id} history={history} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-muted)',
        marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
    }}>
      {children}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 8,
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
      fontSize: 13,
      borderBottom: '1px solid var(--bg-tertiary)',
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        fontWeight: 500,
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? 12 : 13,
      }}>
        {value}
      </span>
    </div>
  );
}
