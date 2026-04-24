import { useState, useEffect, useCallback } from 'react';
import {
  fetchMissionZoneDefaults, updateMissionZoneDefaults,
  fetchWifiNetworks, updateWifiNetworks,
  fetchServiceTokens, createServiceToken, revokeServiceToken, deleteServiceToken,
  authFetch, API_BASE,
  type MissionZoneDefaults, type TenantWifiNetwork, type ServiceToken,
} from '../../api';
import { useIsMobile } from '../../useIsMobile';
import HelpFab from '../HelpFab';

// Section heading used across the settings page. Kept as a stand-alone
// helper so per-section styling stays consistent even though the inline
// help icons have moved to a single floating action button at the bottom
// of the page.
function SectionTitle({ children }: { children: React.ReactNode; helpSub?: string }) {
  return (
    <h3 className="fa-display" style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
      {children}
    </h3>
  );
}

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

  // Audit toggle
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditToggling, setAuditToggling] = useState(false);

  // WiFi Networks state
  const [wifiNetworks, setWifiNetworks] = useState<Array<{ ssid: string; password: string; has_password: boolean }>>([]);
  const [wifiLoading, setWifiLoading] = useState(true);
  const [wifiSaving, setWifiSaving] = useState(false);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [wifiSuccess, setWifiSuccess] = useState<string | null>(null);

  // Firmware Backend URL (baked into receiver controllers at build time)
  const [firmwareBackendUrl, setFirmwareBackendUrl] = useState('');
  const [firmwareUrlSaving, setFirmwareUrlSaving] = useState(false);
  const [firmwareUrlError, setFirmwareUrlError] = useState<string | null>(null);
  const [firmwareUrlSuccess, setFirmwareUrlSuccess] = useState<string | null>(null);

  // Data retention caps
  const [retentionSystemDays, setRetentionSystemDays] = useState<string>('');
  const [retentionAuditDays, setRetentionAuditDays] = useState<string>('');
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionSuccess, setRetentionSuccess] = useState<string | null>(null);

  // Service tokens (API keys for external health-check agents)
  const [serviceTokens, setServiceTokens] = useState<ServiceToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<ServiceToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

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

  const loadWifiNetworks = useCallback(async () => {
    try {
      const data = await fetchWifiNetworks();
      setWifiNetworks(data.map(n => ({
        ssid: n.ssid,
        password: '',
        has_password: !!n.has_password,
      })));
    } catch (e: unknown) {
      setWifiError(e instanceof Error ? e.message : 'WiFi-Netzwerke laden fehlgeschlagen');
    } finally {
      setWifiLoading(false);
    }
  }, []);

  const loadFirmwareBackendUrl = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setFirmwareBackendUrl(data.firmware_backend_url || '');
        setRetentionSystemDays(data.retention_system_logs_days != null ? String(data.retention_system_logs_days) : '');
        setRetentionAuditDays(data.retention_audit_logs_days != null ? String(data.retention_audit_logs_days) : '');
      }
    } catch { /* ignore */ }
  }, []);

  const handleRetentionSave = async () => {
    setRetentionSaving(true);
    setRetentionError(null);
    setRetentionSuccess(null);
    try {
      const parseDays = (v: string): number | null => {
        if (!v.trim()) return null;
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 1 || n > 365) throw new Error('Tage müssen zwischen 1 und 365 liegen (leer = Default)');
        return n;
      };
      const body = {
        retention_system_logs_days: parseDays(retentionSystemDays),
        retention_audit_logs_days: parseDays(retentionAuditDays),
      };
      const res = await authFetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setRetentionSuccess('Retention-Regeln gespeichert');
      setTimeout(() => setRetentionSuccess(null), 3000);
    } catch (e: unknown) {
      setRetentionError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleCleanupNow = async () => {
    if (!window.confirm('Jetzt alte Logs nach den gesetzten Retention-Regeln löschen?')) return;
    try {
      const res = await authFetch(`${API_BASE}/admin/retention/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRetentionSuccess(`Bereinigt: ${data.system_logs_pruned} system_logs, ${data.audit_logs_pruned} audit_logs, ${data.trail_archives_pruned} trail_archives`);
      setTimeout(() => setRetentionSuccess(null), 5000);
    } catch (e: unknown) {
      setRetentionError(e instanceof Error ? e.message : 'Cleanup fehlgeschlagen');
    }
  };

  const handleFirmwareUrlSave = async () => {
    setFirmwareUrlSaving(true);
    setFirmwareUrlError(null);
    setFirmwareUrlSuccess(null);
    try {
      const res = await authFetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmware_backend_url: firmwareBackendUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFirmwareBackendUrl(data.firmware_backend_url || '');
      setFirmwareUrlSuccess('Backend-URL gespeichert');
      setTimeout(() => setFirmwareUrlSuccess(null), 3000);
    } catch (e: unknown) {
      setFirmwareUrlError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setFirmwareUrlSaving(false);
    }
  };

  const loadAuditEnabled = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/audit/enabled`);
      if (res.ok) {
        const data = await res.json();
        setAuditEnabled(data.enabled);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleAudit = async () => {
    setAuditToggling(true);
    try {
      const res = await authFetch(`${API_BASE}/admin/audit/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !auditEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditEnabled(data.enabled);
      }
    } catch { /* ignore */ }
    finally { setAuditToggling(false); }
  };

  const loadServiceTokens = useCallback(async () => {
    try {
      setServiceTokens(await fetchServiceTokens());
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : 'Tokens laden fehlgeschlagen');
    } finally {
      setTokensLoading(false);
    }
  }, []);

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      setTokenError('Name erforderlich');
      return;
    }
    setTokenError(null);
    try {
      const created = await createServiceToken(newTokenName.trim());
      setNewlyCreatedToken(created);
      setNewTokenName('');
      await loadServiceTokens();
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : 'Token erstellen fehlgeschlagen');
    }
  };

  const handleRevokeToken = async (id: string) => {
    if (!window.confirm('Token widerrufen? Dieser Vorgang ist nicht umkehrbar — erstelle danach ggf. einen neuen Token für denselben Zweck.')) return;
    try {
      await revokeServiceToken(id);
      await loadServiceTokens();
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : 'Widerruf fehlgeschlagen');
    }
  };

  const handleDeleteToken = async (id: string) => {
    if (!window.confirm('Token hart löschen? Verwende lieber Widerrufen (behält Audit-Spur).')) return;
    try {
      await deleteServiceToken(id);
      await loadServiceTokens();
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  useEffect(() => {
    loadDefaults();
    loadWifiNetworks();
    loadAuditEnabled();
    loadFirmwareBackendUrl();
    loadServiceTokens();
  }, [loadDefaults, loadWifiNetworks, loadAuditEnabled, loadFirmwareBackendUrl, loadServiceTokens]);

  const handleWifiSave = async () => {
    setWifiSaving(true);
    setWifiError(null);
    setWifiSuccess(null);
    try {
      const payload: TenantWifiNetwork[] = wifiNetworks
        .filter(n => n.ssid.trim())
        .map(n => {
          if (n.password) {
            return { ssid: n.ssid, password: n.password };
          }
          if (n.has_password) {
            return { ssid: n.ssid, use_stored: true };
          }
          return { ssid: n.ssid };
        });
      const result = await updateWifiNetworks(payload);
      setWifiNetworks(result.map(n => ({
        ssid: n.ssid,
        password: '',
        has_password: !!n.has_password,
      })));
      setWifiSuccess('WiFi-Netzwerke gespeichert');
      setTimeout(() => setWifiSuccess(null), 3000);
    } catch (e: unknown) {
      setWifiError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setWifiSaving(false);
    }
  };

  const addWifiNetwork = () => {
    if (wifiNetworks.length < 3) {
      setWifiNetworks(prev => [...prev, { ssid: '', password: '', has_password: false }]);
    }
  };

  const removeWifiNetwork = (index: number) => {
    setWifiNetworks(prev => prev.filter((_, i) => i !== index));
  };

  const updateWifiNetwork = (index: number, field: 'ssid' | 'password', value: string) => {
    setWifiNetworks(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
  };

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
        <h1 className="fa-display" style={{ margin: 0, fontSize: isMobile ? 24 : 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Einstellungen</h1>
        <div
          className="fa-micro"
          style={isMobile
            ? { flexBasis: '100%', marginLeft: 0, paddingLeft: 0, borderLeft: 'none', borderTop: '2px solid var(--accent)', paddingTop: 6 }
            : { marginLeft: 2, paddingLeft: 12, borderLeft: '2px solid var(--accent)' }
          }
        >Admin · Mandanten-Config</div>
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
        <SectionTitle helpSub="zonen-einstellungen">Einsatz-Zonen Standardwerte</SectionTitle>
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

      {/* Firmware Backend URL — baked into every controller at build time */}
      <div data-testid="firmware-backend-url-section" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <SectionTitle helpSub="firmware-backend-url">Firmware Backend-URL</SectionTitle>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Diese URL wird beim Firmware-Build in jeden Empfänger-Controller eingebrannt. Muss von überall erreichbar sein — keine LAN-IP.
          Für den LabCore Hub: Live-View-URL (z.&nbsp;B. <code style={{ fontSize: 11 }}>https://hub.dasilvafelix.de/api/live/flight-arc</code>).
        </p>

        {firmwareUrlError && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#ef4444',
          }}>{firmwareUrlError}</div>
        )}
        {firmwareUrlSuccess && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#22c55e',
          }}>{firmwareUrlSuccess}</div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            data-testid="firmware-backend-url-input"
            type="url"
            value={firmwareBackendUrl}
            onChange={e => setFirmwareBackendUrl(e.target.value)}
            placeholder="https://hub.dasilvafelix.de/api/live/flight-arc"
            style={{
              flex: '1 1 320px', padding: '8px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 13, color: 'var(--text-primary)',
              fontFamily: 'monospace', boxSizing: 'border-box',
            }}
          />
          <button
            data-testid="firmware-backend-url-save"
            onClick={handleFirmwareUrlSave}
            disabled={firmwareUrlSaving}
            className="fa-btn-primary"
          >
            {firmwareUrlSaving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Data Retention — caps on how long log tables are kept */}
      <div data-testid="retention-section" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <SectionTitle helpSub="datenaufbewahrung">Datenaufbewahrung</SectionTitle>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Wie lange Log-Tabellen aufbewahrt werden, bevor sie automatisch gelöscht werden (stündlicher Cleanup).
          Leer lassen = Standardwert verwenden. Der Cleanup schützt vor unkontrolliertem DB-Wachstum —
          vor Inkrafttreten der Regel werden automatisch Backups gezogen.
        </p>

        {retentionError && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{retentionError}</div>
        )}
        {retentionSuccess && (
          <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: '#22c55e' }}>{retentionSuccess}</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>System-Logs (Tage, default 14)</label>
            <input
              data-testid="retention-system-days"
              type="number" min={1} max={365}
              placeholder="14"
              value={retentionSystemDays}
              onChange={e => setRetentionSystemDays(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Audit-Logs (Tage, default 90)</label>
            <input
              data-testid="retention-audit-days"
              type="number" min={1} max={365}
              placeholder="90"
              value={retentionAuditDays}
              onChange={e => setRetentionAuditDays(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            data-testid="retention-save"
            onClick={handleRetentionSave}
            disabled={retentionSaving}
            className="fa-btn-primary"
          >{retentionSaving ? 'Speichern…' : 'Speichern'}</button>
          <button
            data-testid="retention-cleanup-now"
            onClick={handleCleanupNow}
            style={{
              padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}
          >Jetzt aufräumen</button>
        </div>
      </div>

      {/* Service Tokens — API keys for external monitors (health-check agents) */}
      <div data-testid="service-tokens-section" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <SectionTitle helpSub="service-tokens">Service-Tokens</SectionTitle>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          API-Tokens für externe Monitore / Scheduled Agents. Jeder Token hat Scope <code>health_read</code> und darf <code>GET /api/receivers/health-summary</code> aufrufen — aber <strong>keine</strong> Daten ändern. Der Token-Wert wird nur beim Erstellen <em>einmalig</em> angezeigt — danach nur noch das Präfix.
        </p>

        {tokenError && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ef4444',
          }}>{tokenError}</div>
        )}

        {newlyCreatedToken?.token && (
          <div data-testid="newly-created-token" style={{
            background: 'rgba(234,179,8,0.15)', border: '1px solid #eab308',
            borderRadius: 8, padding: 12, marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#eab308' }}>
              Neuer Token „{newlyCreatedToken.name}" erstellt — jetzt kopieren, der Wert wird nicht mehr angezeigt!
            </div>
            <code style={{
              display: 'block', fontSize: 11, padding: '6px 8px',
              background: 'var(--bg-tertiary)', borderRadius: 4,
              wordBreak: 'break-all', userSelect: 'all',
            }}>{newlyCreatedToken.token}</code>
            <button
              onClick={() => setNewlyCreatedToken(null)}
              style={{
                marginTop: 8, padding: '4px 10px', fontSize: 11,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >Schließen</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            data-testid="service-token-name-input"
            placeholder="Token-Name (z. B. daily-health-check)"
            value={newTokenName}
            onChange={e => setNewTokenName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateToken()}
            style={{
              flex: '1 1 260px', padding: '8px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 13, color: 'var(--text-primary)',
            }}
          />
          <button
            data-testid="service-token-create"
            onClick={handleCreateToken}
            className="fa-btn-primary"
          >Token erstellen</button>
        </div>

        {tokensLoading ? (
          <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>Lade Tokens…</div>
        ) : serviceTokens.length === 0 ? (
          <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>Noch keine Tokens.</div>
        ) : (
          <div data-testid="service-tokens-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {serviceTokens.map(t => {
              const revoked = !!t.revokedAt;
              const created = new Date(t.createdAt * 1000).toLocaleString('de-DE');
              const lastUsed = t.lastUsedAt ? new Date(t.lastUsedAt * 1000).toLocaleString('de-DE') : 'nie';
              return (
                <div key={t.id} style={{
                  padding: '8px 12px', background: 'var(--bg-primary)',
                  border: `1px solid ${revoked ? 'var(--status-error)' : 'var(--border)'}`,
                  borderRadius: 6, opacity: revoked ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {t.name} {revoked && <span style={{ color: '#ef4444', fontWeight: 400 }}>(widerrufen)</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Prefix <code>{t.tokenPrefix}…</code> · Scopes <code>{t.scopes.join(', ')}</code> · erstellt {created} · zuletzt verwendet: {lastUsed}
                    </div>
                  </div>
                  {!revoked && (
                    <button
                      onClick={() => handleRevokeToken(t.id)}
                      style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: '#eab308' }}
                    >Widerrufen</button>
                  )}
                  <button
                    onClick={() => handleDeleteToken(t.id)}
                    style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--status-error)' }}
                  >Löschen</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WiFi Networks */}
      <div data-testid="wifi-networks-section" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <SectionTitle helpSub="wifi-netzwerk-verwaltung">WiFi-Netzwerke</SectionTitle>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
          Mandanten-WiFi-Netzwerke werden beim Firmware-Build als Standardwerte vorausgefüllt.
          Empfänger verbinden sich automatisch mit dem stärksten verfügbaren Netzwerk.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 11, color: '#eab308', background: 'rgba(234,179,8,0.1)', padding: '4px 8px', borderRadius: 4 }}>
          Nur 2,4-GHz-Netzwerke — 5 GHz wird nicht unterstützt. iPhone-Hotspot: &quot;Kompatibilit&auml;t maximieren&quot; aktivieren. Details im Handbuch.
        </p>

        {wifiError && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--status-error)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#ef4444',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{wifiError}</span>
            <button onClick={() => setWifiError(null)} style={{
              background: 'none', border: 'none', color: '#ef4444',
              cursor: 'pointer', fontSize: 16, padding: 0,
            }}>x</button>
          </div>
        )}

        {wifiSuccess && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#22c55e',
          }}>
            {wifiSuccess}
          </div>
        )}

        {wifiLoading ? (
          <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>Laden...</div>
        ) : (
          <>
            {wifiNetworks.map((net, i) => (
              <div key={i} style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 10, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flex: 1 }}>
                    Netzwerk {i + 1}
                  </span>
                  <button
                    data-testid={`wifi-remove-${i}`}
                    onClick={() => removeWifiNetwork(i)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, padding: '0 4px',
                    }}
                  >x</button>
                </div>
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: isMobile ? '1 1 100%' : '1 1 180px' }}>
                    <label style={labelStyle}>SSID</label>
                    <input
                      data-testid={`wifi-ssid-${i}`}
                      value={net.ssid}
                      onChange={e => updateWifiNetwork(i, 'ssid', e.target.value)}
                      placeholder="Netzwerkname"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: isMobile ? '1 1 100%' : '1 1 180px' }}>
                    <label style={labelStyle}>Passwort</label>
                    <input
                      data-testid={`wifi-pass-${i}`}
                      type="password"
                      value={net.password}
                      onChange={e => updateWifiNetwork(i, 'password', e.target.value)}
                      placeholder={net.has_password ? 'Gespeichertes Passwort' : 'Passwort'}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                data-testid="wifi-add-btn"
                onClick={addWifiNetwork}
                disabled={wifiNetworks.length >= 3}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: wifiNetworks.length >= 3 ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
                  color: wifiNetworks.length >= 3 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  cursor: wifiNetworks.length >= 3 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  opacity: wifiNetworks.length >= 3 ? 0.5 : 1,
                }}
              >
                + Netzwerk hinzufügen
              </button>
              <button
                data-testid="wifi-save-btn"
                onClick={handleWifiSave}
                disabled={wifiSaving}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: wifiSaving ? 'var(--bg-tertiary)' : 'var(--accent)',
                  color: '#fff', cursor: wifiSaving ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {wifiSaving ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Audit Log Toggle */}
      <div data-testid="audit-settings-section" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <SectionTitle helpSub="sicherheits-audit">Sicherheits-Audit</SectionTitle>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          Protokolliert alle Benutzeraktionen (Anmeldungen, Änderungen an Zonen, Empfängern, Benutzern und Einstellungen).
          Einträge werden nach 48 Stunden automatisch gelöscht.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            data-testid="audit-toggle"
            type="checkbox"
            checked={auditEnabled}
            onChange={toggleAudit}
            disabled={auditToggling}
            style={{ accentColor: '#22c55e', width: 18, height: 18 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: auditEnabled ? '#22c55e' : 'var(--text-muted)' }}>
            {auditEnabled ? 'Audit-Logging aktiv' : 'Audit-Logging deaktiviert'}
          </span>
        </label>
        {auditEnabled && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Audit-Einträge einsehen unter <strong>Admin → Sicherheit</strong>.
          </p>
        )}
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
        WiFi-Netzwerke werden beim Firmware-Build automatisch als Vorgabe übernommen.
      </div>
      <HelpFab section="admin" sub="einstellungen" title="Hilfe: Einstellungen" />
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
