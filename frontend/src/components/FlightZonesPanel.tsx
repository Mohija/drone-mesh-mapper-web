import { useState } from 'react';
import HelpLink from './HelpLink';
import type { FlightZone } from '../types/drone';
import { ZONE_COLORS } from '../useFlightZones';
import { forwardGeocode } from '../api';

interface Props {
  zones: FlightZone[];
  drawingMode: boolean;
  pendingPoints: [number, number][];
  snappable: boolean;
  mapCenter: { lat: number; lon: number };
  onStartDrawing: () => void;
  onCancelDrawing: () => void;
  onUndoPoint: () => void;
  onFinishDrawing: (name: string, color: string, minAGL: number | null, maxAGL: number | null) => Promise<FlightZone | undefined>;
  onCreateMissionZone: (name: string, lat: number, lon: number) => Promise<{ id: string }>;
  onCreateMissionZoneByAddress: (name: string, address: string) => Promise<{ id: string; resolved_address?: string }>;
  onDeleteZone: (zoneId: string) => Promise<void>;
  onSelectZone: (zoneId: string) => void;
  onAssignZone: (zoneId: string) => void;
  onClose: () => void;
  /** If true, hide zone management controls (create, delete, assign) */
  readOnly?: boolean;
  /** Per-tenant mission zone defaults (radius & color) */
  missionZoneDefaults?: { radius: number; color: string };
  /** Zone currently in vertex-edit mode (drag markers live on the map). */
  editingZoneId?: string | null;
  /** Live vertex count of the working copy — shown in the edit controls. */
  editingPointCount?: number;
  onStartEditZone?: (zoneId: string) => void;
  onSaveEditZone?: () => void;
  onCancelEditZone?: () => void;
}

export default function FlightZonesPanel({
  zones,
  drawingMode,
  pendingPoints,
  snappable,
  mapCenter,
  onStartDrawing,
  onCancelDrawing,
  onUndoPoint,
  onFinishDrawing,
  onCreateMissionZone,
  onCreateMissionZoneByAddress,
  onDeleteZone,
  onSelectZone,
  onAssignZone,
  onClose,
  readOnly = false,
  missionZoneDefaults,
  editingZoneId = null,
  editingPointCount = 0,
  onStartEditZone,
  onSaveEditZone,
  onCancelEditZone,
}: Props) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ZONE_COLORS[zones.length % ZONE_COLORS.length]);
  const [minAGL, setMinAGL] = useState('');
  const [maxAGL, setMaxAGL] = useState('');
  const [saving, setSaving] = useState(false);
  const [missionName, setMissionName] = useState('');
  const [missionAddress, setMissionAddress] = useState('');
  const [missionMode, setMissionMode] = useState<'map' | 'address' | 'coords'>('address');
  const [creatingMission, setCreatingMission] = useState(false);
  const [missionError, setMissionError] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<{ display: string; lat: number; lon: number } | null>(null);
  const [resolving, setResolving] = useState(false);

  const handleFinish = async () => {
    if (!newName.trim() || pendingPoints.length < 3) return;
    setSaving(true);
    try {
      const minVal = minAGL.trim() ? parseFloat(minAGL) : null;
      const maxVal = maxAGL.trim() ? parseFloat(maxAGL) : null;
      const zone = await onFinishDrawing(newName.trim(), newColor, minVal, maxVal);
      setNewName('');
      setMinAGL('');
      setMaxAGL('');
      // Auto-open drone assignment for the new zone
      if (zone?.id) onAssignZone(zone.id);
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
        <HelpLink section="flightzones" title="Hilfe: Flugzonen" size={16} />
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
        {/* Mission zone quick-create (only for admins, not during drawing) */}
        {!readOnly && !drawingMode && (
          <div
            data-testid="mission-zone-section"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              background: `${missionZoneDefaults?.color ?? '#f97316'}14`,
              border: `1px solid ${missionZoneDefaults?.color ?? '#f97316'}4d`,
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: missionZoneDefaults?.color ?? '#f97316', marginBottom: 6 }}>
              {`Einsatz-Zone (${missionZoneDefaults?.radius ?? 100}m Radius)`}
            </div>
            <input
              type="text"
              value={missionName}
              onChange={(e) => { setMissionName(e.target.value); setMissionError(''); }}
              placeholder="Einsatzname..."
              data-testid="mission-zone-name"
              style={{
                width: '100%',
                padding: '6px 10px',
                marginBottom: 6,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {/* Mode toggle: Adresse / Koordinaten */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 6, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                onClick={() => { setMissionMode('address'); setMissionError(''); }}
                data-testid="mission-mode-address"
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: missionMode === 'address' ? (missionZoneDefaults?.color ?? '#f97316') : 'var(--bg-tertiary)',
                  color: missionMode === 'address' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Adresse
              </button>
              <button
                onClick={() => { setMissionMode('coords'); setMissionError(''); }}
                data-testid="mission-mode-coords"
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  borderLeft: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: missionMode === 'coords' ? (missionZoneDefaults?.color ?? '#f97316') : 'var(--bg-tertiary)',
                  color: missionMode === 'coords' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Koordinaten
              </button>
            </div>
            {missionMode === 'address' && (
              <input
                type="text"
                value={missionAddress}
                onChange={(e) => { setMissionAddress(e.target.value); setMissionError(''); setResolvedAddress(null); }}
                placeholder="Straße Nr, Stadt..."
                data-testid="mission-zone-address"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  marginBottom: 6,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}
            {missionMode === 'coords' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  type="number"
                  step="0.0001"
                  value={missionAddress.split(',')[0]?.trim() || ''}
                  onChange={(e) => {
                    const lon = missionAddress.split(',')[1]?.trim() || '';
                    setMissionAddress(`${e.target.value}, ${lon}`);
                    setMissionError(''); setResolvedAddress(null);
                  }}
                  placeholder="Lat"
                  title="Breitengrad (-90 bis 90)"
                  style={{
                    flex: 1, width: 0, minWidth: 0, padding: '6px 8px',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  type="number"
                  step="0.0001"
                  value={missionAddress.split(',')[1]?.trim() || ''}
                  onChange={(e) => {
                    const lat = missionAddress.split(',')[0]?.trim() || '';
                    setMissionAddress(`${lat}, ${e.target.value}`);
                    setMissionError(''); setResolvedAddress(null);
                  }}
                  placeholder="Lon"
                  title="Längengrad (-180 bis 180)"
                  style={{
                    flex: 1, width: 0, minWidth: 0, padding: '6px 8px',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            {/* Resolved address confirmation */}
            {resolvedAddress && (
              <div data-testid="mission-resolved-address" style={{
                padding: '6px 10px', marginBottom: 6, borderRadius: 4,
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                fontSize: 11, color: '#22c55e', lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Gefunden:</div>
                <div>{resolvedAddress.display}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  {resolvedAddress.lat.toFixed(5)}, {resolvedAddress.lon.toFixed(5)}
                </div>
              </div>
            )}
            {missionError && (
              <div data-testid="mission-zone-error" style={{ fontSize: 11, color: 'var(--status-error)', marginBottom: 4 }}>
                {missionError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Step 1: Verify address/coords (if not yet resolved) */}
              {!resolvedAddress && (
                <button
                  onClick={async () => {
                    setMissionError('');
                    setResolving(true);
                    try {
                      if (missionMode === 'address') {
                        if (!missionAddress.trim()) { setMissionError('Adresse eingeben'); return; }
                        const result = await forwardGeocode(missionAddress.trim());
                        if (!result) {
                          setMissionError(`Adresse nicht gefunden: "${missionAddress.trim()}". Bitte prüfe Schreibweise, PLZ oder Ort.`);
                          return;
                        }
                        setResolvedAddress({ display: result.display_name, lat: result.lat, lon: result.lon });
                      } else if (missionMode === 'coords') {
                        const parts = missionAddress.split(',').map(s => parseFloat(s.trim()));
                        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
                          setMissionError('Breitengrad und Längengrad eingeben (z.B. 52.0302, 8.5325)');
                          return;
                        }
                        const [lat, lon] = parts;
                        if (lat < -90 || lat > 90) { setMissionError(`Breitengrad ${lat} ungültig — muss zwischen -90 und 90 liegen`); return; }
                        if (lon < -180 || lon > 180) { setMissionError(`Längengrad ${lon} ungültig — muss zwischen -180 und 180 liegen`); return; }
                        // Reverse geocode to verify coords point to a real location
                        const result = await forwardGeocode(`${lat}, ${lon}`);
                        setResolvedAddress({
                          display: result?.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                          lat, lon,
                        });
                      }
                    } catch (err: unknown) {
                      setMissionError(err instanceof Error ? err.message : 'Prüfung fehlgeschlagen');
                    } finally {
                      setResolving(false);
                    }
                  }}
                  disabled={!missionAddress.trim() || resolving}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: missionAddress.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: missionAddress.trim() ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: missionAddress.trim() && !resolving ? 'pointer' : 'default',
                  }}
                >
                  {resolving ? 'Prüfe...' : 'Adresse prüfen'}
                </button>
              )}
              {/* Step 2: Create zone (only after verification) */}
              {resolvedAddress && (
                <button
                  onClick={async () => {
                    if (!missionName.trim()) { setMissionError('Name eingeben'); return; }
                    setMissionError('');
                    setCreatingMission(true);
                    try {
                      const zone = await onCreateMissionZone(missionName.trim(), resolvedAddress.lat, resolvedAddress.lon);
                      setMissionName('');
                      setMissionAddress('');
                      setResolvedAddress(null);
                      onSelectZone(zone.id);
                    } catch (err: unknown) {
                      setMissionError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
                    } finally {
                      setCreatingMission(false);
                    }
                  }}
                  disabled={!missionName.trim() || creatingMission}
                  data-testid="mission-zone-create"
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: missionName.trim() ? (missionZoneDefaults?.color ?? '#f97316') : 'var(--bg-tertiary)',
                    color: missionName.trim() ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: missionName.trim() && !creatingMission ? 'pointer' : 'default',
                  }}
                >
                  {creatingMission ? 'Erstellen...' : 'Zone erstellen'}
                </button>
              )}
              {resolvedAddress && (
                <button
                  onClick={() => { setResolvedAddress(null); setMissionError(''); }}
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
                  Ändern
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {missionMode === 'address'
                ? 'Adresse wird geprüft und in Koordinaten aufgelöst'
                : 'Koordinaten werden auf Gültigkeit geprüft (Lat: -90 bis 90, Lon: -180 bis 180)'}
            </div>
          </div>
        )}

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
          <div data-testid="zones-empty" style={{
            fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center',
            padding: '20px 12px', lineHeight: 1.5,
            background: 'rgba(0,212,170,0.04)',
            border: '1px dashed rgba(0,212,170,0.3)',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.8 }}>✦</div>
            <div className="fa-micro" style={{ marginBottom: 4 }}>Noch keine Zonen</div>
            <div style={{ color: 'var(--text-muted)' }}>
              Zeichne ein Polygon auf die Karte, um eine Mission-Zone,
              Verbotszone oder Beobachtungsraum zu definieren.
            </div>
          </div>
        )}

        {zones.map(zone => {
          const isEditing = editingZoneId === zone.id;
          const livePointCount = isEditing ? editingPointCount : zone.polygon.length;
          return (
          <div
            key={zone.id}
            data-testid={`zone-item-${zone.id}`}
            style={{
              padding: '8px 10px',
              marginBottom: 6,
              background: isEditing ? 'rgba(0,212,170,0.08)' : 'var(--bg-tertiary)',
              borderRadius: 6,
              borderLeft: `3px solid ${zone.color}`,
              boxShadow: isEditing ? '0 0 0 1px var(--accent)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div
                onClick={() => !isEditing && onSelectZone(zone.id)}
                style={{ cursor: isEditing ? 'default' : 'pointer', flex: 1 }}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>{zone.name}</span>
                {isEditing && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700,
                    padding: '2px 5px', borderRadius: 3,
                    background: 'var(--accent)', color: '#fff', letterSpacing: '0.5px',
                  }}>BEARBEITEN</span>
                )}
              </div>
              {!readOnly && !isEditing && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {onStartEditZone && zone.polygon.length >= 3 && (
                    <button
                      onClick={() => onStartEditZone(zone.id)}
                      title="Polygon bearbeiten (Punkte ziehen, Doppelklick zum Entfernen)"
                      data-testid={`edit-btn-${zone.id}`}
                      disabled={drawingMode || (editingZoneId !== null && !isEditing)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: drawingMode || editingZoneId !== null ? 'var(--text-muted)' : 'var(--accent)',
                        fontSize: 14,
                        cursor: drawingMode || editingZoneId !== null ? 'default' : 'pointer',
                        padding: '2px 4px',
                      }}
                    >
                      &#9998;
                    </button>
                  )}
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
              {livePointCount} Punkte &middot; {zone.assignedDrones.length} Drohne{zone.assignedDrones.length !== 1 ? 'n' : ''} zugewiesen
              {(zone.minAltitudeAGL !== null || zone.maxAltitudeAGL !== null) && (
                <span>
                  {' '}&middot; {zone.minAltitudeAGL ?? 0}–{zone.maxAltitudeAGL ?? '∞'} m AGL
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {zone.createdBy && <span>Erstellt von {zone.createdBy}</span>}
              {zone.updatedBy && zone.updatedBy !== zone.createdBy && (
                <span>{zone.createdBy ? ' · ' : ''}Bearbeitet von {zone.updatedBy}</span>
              )}
            </div>
            {isEditing && (
              <div
                data-testid={`edit-controls-${zone.id}`}
                style={{
                  marginTop: 8,
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4 }}>
                  Punkte ziehen zum Verschieben. Doppelklick (oder Rechtsklick) entfernt einen Punkt. Mindestens 3 Punkte nötig.
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={onSaveEditZone}
                    disabled={editingPointCount < 3}
                    data-testid={`save-edit-${zone.id}`}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: editingPointCount >= 3 ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: editingPointCount >= 3 ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: editingPointCount >= 3 ? 'pointer' : 'default',
                    }}
                  >
                    Speichern
                  </button>
                  <button
                    onClick={onCancelEditZone}
                    data-testid={`cancel-edit-${zone.id}`}
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
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
