import { useState, useEffect, useCallback } from 'react';
import {
  fetchMissionZoneDefaults, updateMissionZoneDefaults,
  type MissionZoneDefaults,
} from '../../api';
import { useIsMobile } from '../../useIsMobile';

const DEFAULT_VALUES: MissionZoneDefaults = {
  radius: 100,
  color: '#f97316',
  min_alt_agl: null,
  max_alt_agl: null,
};

export default function SettingsTab() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [radius, setRadius] = useState(DEFAULT_VALUES.radius);
  const [color, setColor] = useState(DEFAULT_VALUES.color);
  const [minAlt, setMinAlt] = useState('');
  const [maxAlt, setMaxAlt] = useState('');

  const loadDefaults = useCallback(async () => {
    try {
      const data = await fetchMissionZoneDefaults();
      setRadius(data.radius);
      setColor(data.color);
      setMinAlt(data.min_alt_agl !== null ? String(data.min_alt_agl) : '');
      setMaxAlt(data.max_alt_agl !== null ? String(data.max_alt_agl) : '');
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateMissionZoneDefaults({
        radius,
        color,
        min_alt_agl: minAlt.trim() ? parseFloat(minAlt) : null,
        max_alt_agl: maxAlt.trim() ? parseFloat(maxAlt) : null,
      });
      setRadius(data.radius);
      setColor(data.color);
      setMinAlt(data.min_alt_agl !== null ? String(data.min_alt_agl) : '');
      setMaxAlt(data.max_alt_agl !== null ? String(data.max_alt_agl) : '');
      setSuccess('Einstellungen gespeichert');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateMissionZoneDefaults(DEFAULT_VALUES);
      setRadius(data.radius);
      setColor(data.color);
      setMinAlt(data.min_alt_agl !== null ? String(data.min_alt_agl) : '');
      setMaxAlt(data.max_alt_agl !== null ? String(data.max_alt_agl) : '');
      setSuccess('Auf Standardwerte zurückgesetzt');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Zurücksetzen fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Laden...</div>;
  }

  return (
    <div data-testid="settings-tab">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20, flexWrap: 'wrap',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Einstellungen</h1>
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

      {/* Success */}
      {success && (
        <div style={{
          background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: '#22c55e',
        }}>
          {success}
        </div>
      )}

      {/* Mission Zone Defaults */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
          Einsatz-Zonen Standardwerte
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          Diese Werte werden beim Erstellen neuer Einsatz-Zonen als Standard verwendet.
        </p>

        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end',
        }}>
          {/* Radius */}
          <div style={{ flex: isMobile ? '1 1 100%' : '1 1 140px' }}>
            <label style={labelStyle}>Radius (m)</label>
            <input
              data-testid="settings-radius"
              type="number"
              min={50}
              max={5000}
              step={10}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              style={inputStyle}
            />
          </div>

          {/* Color */}
          <div style={{ flex: isMobile ? '1 1 100%' : '0 0 140px' }}>
            <label style={labelStyle}>Farbe</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                data-testid="settings-color"
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{
                  width: 36, height: 36, padding: 0,
                  border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', background: 'none',
                }}
              />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                maxLength={7}
              />
            </div>
          </div>

          {/* Min Altitude AGL */}
          <div style={{ flex: isMobile ? '1 1 100%' : '1 1 140px' }}>
            <label style={labelStyle}>Min. Höhe AGL (m)</label>
            <input
              data-testid="settings-min-alt"
              type="number"
              min={0}
              step={10}
              value={minAlt}
              onChange={e => setMinAlt(e.target.value)}
              placeholder="Leer = keine"
              style={inputStyle}
            />
          </div>

          {/* Max Altitude AGL */}
          <div style={{ flex: isMobile ? '1 1 100%' : '1 1 140px' }}>
            <label style={labelStyle}>Max. Höhe AGL (m)</label>
            <input
              data-testid="settings-max-alt"
              type="number"
              min={0}
              step={10}
              value={maxAlt}
              onChange={e => setMaxAlt(e.target.value)}
              placeholder="Leer = keine"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            data-testid="settings-save"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: saving ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: '#fff', cursor: saving ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? 'Speichere...' : 'Speichern'}
          </button>
          <button
            data-testid="settings-reset"
            onClick={handleReset}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Standardwerte
          </button>
        </div>
      </div>

      {/* Info */}
      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <strong>Hinweis:</strong> Diese Einstellungen gelten pro Mandant.
        Beim Erstellen einer neuen Einsatz-Zone werden die hier konfigurierten
        Standardwerte für Radius, Farbe und Höhengrenzen verwendet.
      </div>
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
