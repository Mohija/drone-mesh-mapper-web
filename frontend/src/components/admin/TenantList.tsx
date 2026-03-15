import { useState, useEffect, useCallback } from 'react';
import { fetchTenants, createTenant, deleteTenant } from '../../api';
import type { Tenant } from '../../api';
import { useAuth } from '../../AuthContext';
import AdminTooltip from './AdminTooltip';

export default function TenantList() {
  const { refreshUser } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTenants(await fetchTenants());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setError(null);
    try {
      await createTenant({ name: name.trim().toLowerCase(), display_name: displayName.trim() });
      setName('');
      setDisplayName('');
      setShowForm(false);
      load();
      refreshUser(); // Update tenant list in AuthContext (sidebar switcher)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const handleDelete = async (id: string, tenantName: string) => {
    if (!confirm(`Mandant "${tenantName}" wirklich löschen? Alle Benutzer und Daten werden gelöscht.`)) return;
    try {
      await deleteTenant(id);
      load();
      refreshUser(); // Update tenant list in AuthContext
    } catch { /* silent */ }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1 }}>Mandanten</h1>
        <AdminTooltip
          brief="Neuen Mandanten erstellen"
          detail={"Erstellt einen neuen Mandanten (Tenant) im System.\nJeder Mandant hat eigene Benutzer, Empfänger, Zonen und Einstellungen — komplett getrennt voneinander.\n\nFelder:\n- Technischer Name: Kleinbuchstaben, Bindestriche erlaubt (z.B. \"firma-gmbh\")\n- Anzeigename: Frei wählbar (z.B. \"Firma GmbH\")\n\nNach dem Erstellen kannst du Benutzer dem Mandanten zuweisen."}
        >
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showForm ? 'Abbrechen' : 'Neuer Mandant'}
          </button>
        </AdminTooltip>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <input
            placeholder="Technischer Name (z.B. firma-gmbh)"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <input
            placeholder="Anzeigename (z.B. Firma GmbH)"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !displayName.trim()}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', alignSelf: 'flex-start', opacity: (!name.trim() || !displayName.trim()) ? 0.5 : 1,
            }}
          >
            Erstellen
          </button>
        </div>
      )}

      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Anzeigename</th>
              <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Benutzer</th>
              <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Zonen</th>
              <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
              <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{t.name}</td>
                <td style={{ padding: '10px 16px' }}>{t.display_name}</td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>{t.user_count ?? 0}</td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>{t.zone_count ?? 0}</td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: t.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: t.is_active ? '#22c55e' : '#ef4444',
                  }}>
                    {t.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  {t.name !== 'default' && (
                    <AdminTooltip
                      brief="Mandant und alle Daten löschen"
                      detail={"Löscht diesen Mandanten und ALLE zugehörigen Daten:\n- Alle Benutzer des Mandanten\n- Alle Empfänger und deren Firmware\n- Alle Zonen und Einstellungen\n\nDiese Aktion kann nicht rückgängig gemacht werden!\nDer Standard-Mandant (\"default\") kann nicht gelöscht werden."}
                    >
                      <button
                        onClick={() => handleDelete(t.id, t.display_name)}
                        style={{
                          background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        Löschen
                      </button>
                    </AdminTooltip>
                  )}
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Keine Mandanten vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
