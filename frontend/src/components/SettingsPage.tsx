import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DataSourceSettings } from '../types/drone';
import { fetchSettings, updateSettings } from '../api';

const SOURCE_COLORS: Record<string, string> = {
  simulator: '#3b82f6',
  opensky: '#f59e0b',
  adsbfi: '#8b5cf6',
  adsblol: '#ec4899',
  ogn: '#10b981',
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<DataSourceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(() => setError('Einstellungen konnten nicht geladen werden'));
  }, []);

  const handleToggle = (sourceId: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      sources: {
        ...settings.sources,
        [sourceId]: {
          ...settings.sources[sourceId],
          enabled: !settings.sources[sourceId].enabled,
        },
      },
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-secondary)',
      }}>
        {error || 'Laden...'}
      </div>
    );
  }

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
        <div style={{ fontSize: 20, fontWeight: 600 }}>Datenquellen</div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          marginBottom: 24,
          lineHeight: 1.5,
        }}>
          Aktiviere oder deaktiviere Datenquellen. Externe Quellen liefern echte
          ADS-B Flugdaten (Flugzeuge, UAVs, Gleiter) aus oeffentlichen Netzwerken.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-error)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--status-error)',
          }}>
            {error}
          </div>
        )}

        {/* Source list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(settings.sources).map(([id, cfg]) => (
            <div
              key={id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              {/* Color indicator */}
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: SOURCE_COLORS[id] || '#6b7280',
                boxShadow: cfg.enabled ? `0 0 8px ${SOURCE_COLORS[id] || '#6b7280'}` : 'none',
                opacity: cfg.enabled ? 1 : 0.4,
                flexShrink: 0,
              }} />

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{cfg.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {cfg.description}
                </div>
              </div>

              {/* Toggle */}
              <button
                onClick={() => handleToggle(id)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  border: 'none',
                  background: cfg.enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: cfg.enabled ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>

        {/* Save button */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 24px',
              background: saved ? 'var(--status-active)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            {saving ? 'Speichern...' : saved ? 'Gespeichert!' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
