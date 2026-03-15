import { useState, useEffect, useCallback } from 'react';
import {
  fetchSimulators, createSimulator, deleteSimulator,
  startSimulator, stopSimulator, stopAllSimulators,
  type SimulatorInstance,
} from '../../api';

const HARDWARE_TYPES = [
  { value: 'esp32-s3', label: 'ESP32-S3 (empfohlen)', badge: 'WiFi + BLE' },
  { value: 'esp32-c3', label: 'ESP32-C3', badge: 'WiFi + BLE' },
  { value: 'esp8266', label: 'ESP8266 (Light)', badge: 'Nur WiFi' },
];

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function SimulationTab() {
  const [simulators, setSimulators] = useState<SimulatorInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDrones, setNewDrones] = useState(3);
  const [newLat, setNewLat] = useState(52.0302);
  const [newLon, setNewLon] = useState(8.5325);
  const [newHw, setNewHw] = useState('esp32-s3');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchSimulators();
      setSimulators(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const sim = await createSimulator({
        name: newName.trim(),
        numDrones: newDrones,
        lat: newLat,
        lon: newLon,
        hardwareType: newHw,
      });
      // Auto-start after creation
      await startSimulator(sim.id);
      setNewName('');
      setNewDrones(3);
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await startSimulator(id);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Starten fehlgeschlagen');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await stopSimulator(id);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Stoppen fehlgeschlagen');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSimulator(id);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  const handleStopAll = async () => {
    try {
      await stopAllSimulators();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Stoppen fehlgeschlagen');
    }
  };

  const runningCount = simulators.filter(s => s.status === 'running').length;
  const totalDrones = simulators.filter(s => s.status === 'running').reduce((sum, s) => sum + s.activeDrones, 0);
  const totalDetections = simulators.reduce((sum, s) => sum + s.detectionsSent, 0);

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Laden...</div>;
  }

  return (
    <div data-testid="simulation-tab">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Simulation</h1>
        <div style={{ flex: 1 }} />
        {runningCount > 0 && (
          <button
            onClick={handleStopAll}
            data-testid="stop-all-btn"
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #ef4444',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Alle stoppen ({runningCount})
          </button>
        )}
        <button
          onClick={() => setShowCreate(!showCreate)}
          data-testid="create-sim-btn"
          style={{
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          + Neuer Simulator
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }} data-testid="sim-stats">
        <StatBadge label="Simulatoren" value={simulators.length} color="var(--text-secondary)" testId="stat-total" />
        <StatBadge label="Aktiv" value={runningCount} color="#22c55e" testId="stat-running" />
        <StatBadge label="Drohnen" value={totalDrones} color="#3b82f6" testId="stat-drones" />
        <StatBadge label="Detections" value={totalDetections} color="#14b8a6" testId="stat-detections" />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: '#ef4444',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none', color: '#ef4444',
            cursor: 'pointer', fontSize: 16, padding: 0,
          }}>x</button>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div data-testid="create-sim-form" style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 20,
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Neuen Simulator erstellen</h3>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            {/* Name */}
            <div style={{ flex: '1 1 180px' }}>
              <label style={labelStyle}>Name</label>
              <input
                data-testid="sim-name-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="z.B. Bielefeld City"
                style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            {/* Drones */}
            <div style={{ flex: '0 0 100px' }}>
              <label style={labelStyle}>Drohnen</label>
              <input
                data-testid="sim-drones-input"
                type="number" min={1} max={50}
                value={newDrones}
                onChange={e => setNewDrones(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            {/* Lat */}
            <div style={{ flex: '0 0 130px' }}>
              <label style={labelStyle}>Breitengrad</label>
              <input
                data-testid="sim-lat-input"
                type="number" step={0.0001}
                value={newLat}
                onChange={e => setNewLat(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            {/* Lon */}
            <div style={{ flex: '0 0 130px' }}>
              <label style={labelStyle}>Längengrad</label>
              <input
                data-testid="sim-lon-input"
                type="number" step={0.0001}
                value={newLon}
                onChange={e => setNewLon(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            {/* Hardware */}
            <div style={{ flex: '0 0 200px' }}>
              <label style={labelStyle}>Hardware</label>
              <select
                data-testid="sim-hw-select"
                value={newHw}
                onChange={e => setNewHw(e.target.value)}
                style={inputStyle}
              >
                {HARDWARE_TYPES.map(hw => (
                  <option key={hw.value} value={hw.value}>{hw.label}</option>
                ))}
              </select>
            </div>

            {/* Submit */}
            <button
              data-testid="sim-submit-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: creating ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: '#fff', cursor: creating ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                height: 36,
              }}
            >
              {creating ? 'Erstelle...' : 'Erstellen & Starten'}
            </button>
          </div>
        </div>
      )}

      {/* Simulator List */}
      {simulators.length === 0 ? (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '40px 20px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 14,
        }}>
          Keine Simulatoren vorhanden. Erstelle einen um Dummy-Empfänger-Drohnen auf der Karte zu sehen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {simulators.map(sim => (
            <SimulatorCard
              key={sim.id}
              sim={sim}
              onStart={handleStart}
              onStop={handleStop}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Info */}
      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <strong>Hinweis:</strong> Simulierte Empfänger verhalten sich exakt wie echte Hardware-Empfänger (ESP32/ESP8266).
        Die Drohnen erscheinen auf der Karte wenn die Quelle "Empfänger" in den Einstellungen aktiviert ist.
        Simulatoren sind flüchtig — nach einem Server-Neustart sind sie weg, die erzeugten Empfänger-Einträge ([SIM]) bleiben aber in der Datenbank.
      </div>
    </div>
  );
}


// ─── Sub-Components ──────────────────────────────────────

function StatBadge({ label, value, color, testId }: {
  label: string; value: number; color: string; testId: string;
}) {
  return (
    <div data-testid={testId} style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 14px', display: 'flex',
      alignItems: 'center', gap: 8, fontSize: 13,
    }}>
      <span style={{ fontWeight: 700, color, fontSize: 16 }}>{value}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}


function SimulatorCard({ sim, onStart, onStop, onDelete }: {
  sim: SimulatorInstance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isRunning = sim.status === 'running';
  const statusColor = isRunning ? '#22c55e' : sim.status === 'error' ? '#ef4444' : '#6b7280';
  const statusLabel = isRunning ? 'Aktiv' : sim.status === 'error' ? 'Fehler' : 'Gestoppt';

  return (
    <div data-testid={`sim-card-${sim.id}`} style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 16,
      borderLeft: `3px solid ${statusColor}`,
    }}>
      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>
          {sim.name}
        </h3>
        <span style={{
          padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: `${statusColor}22`, color: statusColor,
        }}>
          {statusLabel}
        </span>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8, marginBottom: 12,
      }}>
        <InfoItem label="Hardware" value={sim.hardwareType} />
        <InfoItem label="Drohnen" value={`${sim.activeDrones} / ${sim.numDrones}`} />
        <InfoItem label="Position" value={`${sim.lat.toFixed(4)}, ${sim.lon.toFixed(4)}`} />
        <InfoItem label="Detections" value={sim.detectionsSent.toLocaleString('de-DE')} />
        {isRunning && (
          <InfoItem label="Laufzeit" value={formatUptime(sim.uptimeSeconds)} />
        )}
        <InfoItem label="Receiver-ID" value={sim.receiverNodeId} mono />
      </div>

      {/* Error */}
      {sim.error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', borderRadius: 6,
          padding: '6px 10px', marginBottom: 10, fontSize: 12, color: '#ef4444',
        }}>
          {sim.error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isRunning ? (
          <button
            onClick={() => onStop(sim.id)}
            data-testid={`sim-stop-${sim.id}`}
            style={{
              ...actionBtnStyle,
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            Stoppen
          </button>
        ) : (
          <button
            onClick={() => onStart(sim.id)}
            data-testid={`sim-start-${sim.id}`}
            style={{
              ...actionBtnStyle,
              background: 'rgba(34,197,94,0.1)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.3)',
            }}
          >
            Starten
          </button>
        )}
        <button
          onClick={() => onDelete(sim.id)}
          data-testid={`sim-delete-${sim.id}`}
          style={{
            ...actionBtnStyle,
            background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}


function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>
      <span style={{
        fontWeight: 500, color: 'var(--text-primary)',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </span>
    </div>
  );
}


// ─── Shared Styles ───────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.3px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
};
