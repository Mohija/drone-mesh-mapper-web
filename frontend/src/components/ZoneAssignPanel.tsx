import { useState, useMemo } from 'react';
import type { Drone, FlightZone } from '../types/drone';

interface Props {
  zone: FlightZone;
  drones: Drone[];
  onSave: (zoneId: string, assignedIds: string[], unassignedIds: string[]) => void;
  onUpdateZone: (zoneId: string, updates: Partial<Pick<FlightZone, 'name' | 'color' | 'minAltitudeAGL' | 'maxAltitudeAGL'>>) => Promise<void>;
  onClose: () => void;
}

export default function ZoneAssignPanel({ zone, drones, onSave, onUpdateZone, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(zone.assignedDrones));
  const [filter, setFilter] = useState('');

  // Editable zone properties
  const [editName, setEditName] = useState(zone.name);
  const [editColor, setEditColor] = useState(zone.color);
  const [editMinAGL, setEditMinAGL] = useState(zone.minAltitudeAGL != null ? String(zone.minAltitudeAGL) : '');
  const [editMaxAGL, setEditMaxAGL] = useState(zone.maxAltitudeAGL != null ? String(zone.maxAltitudeAGL) : '');
  const [saving, setSaving] = useState(false);

  const filteredDrones = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return drones;
    return drones.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) ||
      d.basic_id.toLowerCase().includes(q)
    );
  }, [drones, filter]);

  const handleToggle = (droneId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(droneId)) {
        next.delete(droneId);
      } else {
        next.add(droneId);
      }
      return next;
    });
  };

  const hasZoneChanges = useMemo(() => {
    const minVal = editMinAGL.trim() ? parseFloat(editMinAGL) : null;
    const maxVal = editMaxAGL.trim() ? parseFloat(editMaxAGL) : null;
    return editName.trim() !== zone.name
      || editColor !== zone.color
      || minVal !== zone.minAltitudeAGL
      || maxVal !== zone.maxAltitudeAGL;
  }, [editName, editColor, editMinAGL, editMaxAGL, zone]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      // Save zone property changes if any
      if (hasZoneChanges) {
        const updates: Partial<Pick<FlightZone, 'name' | 'color' | 'minAltitudeAGL' | 'maxAltitudeAGL'>> = {};
        if (editName.trim() !== zone.name) updates.name = editName.trim();
        if (editColor !== zone.color) updates.color = editColor;
        const minVal = editMinAGL.trim() ? parseFloat(editMinAGL) : null;
        const maxVal = editMaxAGL.trim() ? parseFloat(editMaxAGL) : null;
        if (minVal !== zone.minAltitudeAGL) updates.minAltitudeAGL = minVal;
        if (maxVal !== zone.maxAltitudeAGL) updates.maxAltitudeAGL = maxVal;
        await onUpdateZone(zone.id, updates);
      }

      // Save drone assignment changes
      const originalSet = new Set(zone.assignedDrones);
      const toAssign = [...selected].filter(id => !originalSet.has(id));
      const toUnassign = [...originalSet].filter(id => !selected.has(id));
      if (toAssign.length > 0 || toUnassign.length > 0) {
        onSave(zone.id, toAssign, toUnassign);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="zone-assign-panel"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{
        width: 360,
        maxHeight: '70vh',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Zone bearbeiten</div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Zone properties edit */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Zonenname..."
              data-testid="edit-zone-name"
              style={{
                flex: 1,
                padding: '6px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              data-testid="edit-zone-color"
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>AGL:</span>
            <input
              type="number"
              value={editMinAGL}
              onChange={(e) => setEditMinAGL(e.target.value)}
              placeholder="Min m"
              data-testid="edit-zone-min-agl"
              style={{
                flex: 1,
                width: 0,
                padding: '6px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
              min={0}
              step={10}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>&ndash;</span>
            <input
              type="number"
              value={editMaxAGL}
              onChange={(e) => setEditMaxAGL(e.target.value)}
              placeholder="Max m"
              data-testid="edit-zone-max-agl"
              style={{
                flex: 1,
                width: 0,
                padding: '6px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
              min={0}
              step={10}
            />
          </div>
        </div>

        {/* Drone assignment section */}
        <div style={{ padding: '6px 16px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Drohnen zuweisen
        </div>

        {/* Search */}
        <div style={{ padding: '8px 16px' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Drohne suchen..."
            data-testid="drone-search-input"
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Drone list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
          {filteredDrones.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              Keine Drohnen gefunden
            </div>
          ) : (
            filteredDrones.map(drone => (
              <label
                key={drone.id}
                data-testid={`drone-assign-${drone.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  cursor: 'pointer',
                  fontSize: 12,
                  borderBottom: '1px solid var(--bg-tertiary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(drone.id)}
                  onChange={() => handleToggle(drone.id)}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {drone.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {drone.id} {drone.source_label ? `(${drone.source_label})` : ''}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {selected.size} ausgewaehlt
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
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
          <button
            onClick={handleSave}
            disabled={!editName.trim() || saving}
            data-testid="save-assignments-btn"
            style={{
              padding: '6px 14px',
              background: editName.trim() && !saving ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: editName.trim() && !saving ? '#fff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: editName.trim() && !saving ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
