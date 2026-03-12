import { useState } from 'react';
import type { FlightZone } from '../types/drone';
import { ZONE_COLORS } from '../useFlightZones';

interface Props {
  zones: FlightZone[];
  drawingMode: boolean;
  pendingPoints: [number, number][];
  snappable: boolean;
  onStartDrawing: () => void;
  onCancelDrawing: () => void;
  onUndoPoint: () => void;
  onFinishDrawing: (name: string, color: string, minAGL: number | null, maxAGL: number | null) => Promise<void>;
  onDeleteZone: (zoneId: string) => Promise<void>;
  onSelectZone: (zoneId: string) => void;
  onAssignZone: (zoneId: string) => void;
  onClose: () => void;
  /** If true, hide zone management controls (create, delete, assign) */
  readOnly?: boolean;
}

export default function FlightZonesPanel({
  zones,
  drawingMode,
  pendingPoints,
  snappable,
  onStartDrawing,
  onCancelDrawing,
  onUndoPoint,
  onFinishDrawing,
  onDeleteZone,
  onSelectZone,
  onAssignZone,
  onClose,
  readOnly = false,
}: Props) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ZONE_COLORS[zones.length % ZONE_COLORS.length]);
  const [minAGL, setMinAGL] = useState('');
  const [maxAGL, setMaxAGL] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    if (!newName.trim() || pendingPoints.length < 3) return;
    setSaving(true);
    try {
      const minVal = minAGL.trim() ? parseFloat(minAGL) : null;
      const maxVal = maxAGL.trim() ? parseFloat(maxAGL) : null;
      await onFinishDrawing(newName.trim(), newColor, minVal, maxVal);
      setNewName('');
      setMinAGL('');
      setMaxAGL('');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div
      data-testid="flight-zones-panel"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        width: 320,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        zIndex: 2000,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Flugzonen</span>
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

      <div style={{ maxHeight: 400, overflow: 'auto', padding: '8px 14px' }}>
        {/* Drawing mode UI (only for admins) */}
        {!readOnly && drawingMode ? (
          <div data-testid="drawing-mode-ui" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {snappable
                ? 'Klicke auf den ersten Punkt (grün) zum Schließen'
                : `Klicke auf die Karte um Punkte zu setzen (${pendingPoints.length} Punkt${pendingPoints.length !== 1 ? 'e' : ''})`
              }
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Zonenname..."
                data-testid="zone-name-input"
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                data-testid="zone-color-input"
                style={{
                  width: 32,
                  height: 32,
                  padding: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: 'none',
                }}
              />
            </div>

            {/* Altitude AGL range */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>AGL:</span>
              <input
                type="number"
                value={minAGL}
                onChange={(e) => setMinAGL(e.target.value)}
                placeholder="Min m"
                data-testid="zone-min-agl"
                style={{ ...inputStyle, flex: 1, width: 0 }}
                min={0}
                step={10}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>–</span>
              <input
                type="number"
                value={maxAGL}
                onChange={(e) => setMaxAGL(e.target.value)}
                placeholder="Max m"
                data-testid="zone-max-agl"
                style={{ ...inputStyle, flex: 1, width: 0 }}
                min={0}
                step={10}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleFinish}
                disabled={pendingPoints.length < 3 || !newName.trim() || saving}
                data-testid="finish-drawing-btn"
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: pendingPoints.length >= 3 && newName.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: pendingPoints.length >= 3 && newName.trim() ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: pendingPoints.length >= 3 && newName.trim() ? 'pointer' : 'default',
                }}
              >
                {saving ? 'Speichern...' : 'Fertig'}
              </button>
              {pendingPoints.length > 0 && (
                <button
                  onClick={onUndoPoint}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Undo
                </button>
              )}
              <button
                onClick={onCancelDrawing}
                data-testid="cancel-drawing-btn"
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : !readOnly && !drawingMode ? (
          <button
            onClick={onStartDrawing}
            data-testid="start-drawing-btn"
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: 12,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Neue Zone zeichnen
          </button>
        ) : null}

        {/* Zone list */}
        {zones.length === 0 && !drawingMode && (
          <div data-testid="zones-empty" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            Keine Zonen definiert
          </div>
        )}

        {zones.map(zone => (
          <div
            key={zone.id}
            data-testid={`zone-item-${zone.id}`}
            style={{
              padding: '8px 10px',
              marginBottom: 6,
              background: 'var(--bg-tertiary)',
              borderRadius: 6,
              borderLeft: `3px solid ${zone.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div
                onClick={() => onSelectZone(zone.id)}
                style={{ cursor: 'pointer', flex: 1 }}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>{zone.name}</span>
              </div>
              {!readOnly && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => onAssignZone(zone.id)}
                    title="Drohnen zuweisen"
                    data-testid={`assign-btn-${zone.id}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontSize: 14,
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    &#9874;
                  </button>
                  <button
                    onClick={() => onDeleteZone(zone.id)}
                    title="Zone löschen"
                    data-testid={`delete-btn-${zone.id}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--status-error)',
                      fontSize: 14,
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    &#10005;
                  </button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {zone.polygon.length} Punkte &middot; {zone.assignedDrones.length} Drohne{zone.assignedDrones.length !== 1 ? 'n' : ''} zugewiesen
              {(zone.minAltitudeAGL !== null || zone.maxAltitudeAGL !== null) && (
                <span>
                  {' '}&middot; {zone.minAltitudeAGL ?? 0}–{zone.maxAltitudeAGL ?? '∞'} m AGL
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
