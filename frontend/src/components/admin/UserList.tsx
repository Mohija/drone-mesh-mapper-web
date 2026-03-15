import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthContext';
import { fetchUsers, fetchTenants, createUser, deleteUser, resetUserPassword, updateUser } from '../../api';
import type { UserAdmin, Tenant } from '../../api';
import AdminTooltip from './AdminTooltip';
import { useIsMobile } from '../../useIsMobile';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  tenant_admin: 'Mandanten-Admin',
  user: 'Benutzer',
};

export default function UserList() {
  const { user: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', email: '', role: '', is_active: true });
  const [editError, setEditError] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '', email: '', password: '', display_name: '', role: 'user', tenant_id: '',
  });

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([
        fetchUsers(),
        currentUser?.role === 'super_admin' ? fetchTenants() : Promise.resolve([]),
      ]);
      setUsers(u);
      setTenants(t);
      if (t.length > 0 && !form.tenant_id) {
        setForm(prev => ({ ...prev, tenant_id: t[0].id }));
      }
    } catch { /* silent */ }
  }, [currentUser?.role, form.tenant_id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setError(null);
    try {
      await createUser(form);
      setForm({ username: '', email: '', password: '', display_name: '', role: 'user', tenant_id: form.tenant_id });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Benutzer "${username}" wirklich löschen?`)) return;
    try {
      await deleteUser(id);
      load();
    } catch { /* silent */ }
  };

  const handleResetPassword = async (id: string) => {
    const pw = prompt('Neues Passwort (min. 8 Zeichen):');
    if (!pw || pw.length < 8) {
      if (pw !== null) alert('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    try {
      await resetUserPassword(id, pw);
      alert('Passwort zurückgesetzt.');
    } catch { /* silent */ }
  };

  const startEdit = (u: UserAdmin) => {
    setEditingId(u.id);
    setEditForm({
      display_name: u.display_name,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
    });
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditError(null);
    try {
      await updateUser(editingId, editForm);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 8, padding: isMobile ? '10px 12px' : '8px 12px',
    fontSize: isMobile ? 14 : 13, color: 'var(--text-primary)', outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
    minHeight: isMobile ? 44 : undefined,
  };

  const mobileBtnStyle: React.CSSProperties = {
    padding: isMobile ? '10px 14px' : '4px 10px',
    borderRadius: 6, fontSize: isMobile ? 13 : 12, cursor: 'pointer',
    fontWeight: isMobile ? 600 : 400, minHeight: isMobile ? 44 : undefined,
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';

  // ─── Edit form (shared between mobile and desktop) ───
  const renderEditForm = (u: UserAdmin) => (
    <div style={{
      background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      ...(isMobile ? {} : { }),
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
        Bearbeiten: @{u.username}
      </div>
      {editError && <div style={{ color: '#ef4444', fontSize: 13 }}>{editError}</div>}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anzeigename</label>
          <input
            value={editForm.display_name}
            onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>E-Mail</label>
          <input
            type="email"
            value={editForm.email}
            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rolle</label>
          <select
            value={editForm.role}
            onChange={e => setEditForm({ ...editForm, role: e.target.value })}
            style={inputStyle}
            disabled={!isSuperAdmin}
          >
            <option value="user">Benutzer</option>
            <option value="tenant_admin">Mandanten-Admin</option>
            {isSuperAdmin && <option value="super_admin">Super-Admin</option>}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status</label>
          <div
            onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
            style={{
              ...inputStyle,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{
              width: 40, height: 22, borderRadius: 11,
              background: editForm.is_active ? '#22c55e' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2,
                left: editForm.is_active ? 20 : 2,
                transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 13 }}>{editForm.is_active ? 'Aktiv' : 'Inaktiv'}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSaveEdit}
          style={{
            ...mobileBtnStyle,
            background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600,
            flex: isMobile ? 1 : undefined,
          }}
        >
          Speichern
        </button>
        <button
          onClick={() => setEditingId(null)}
          style={{
            ...mobileBtnStyle,
            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            flex: isMobile ? 1 : undefined,
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 700, flex: 1 }}>Benutzer</h1>
        <AdminTooltip
          brief="Neuen Benutzer anlegen"
          detail={"Erstellt einen neuen Benutzer im System.\nFelder: Benutzername, E-Mail, Passwort, Anzeigename, Rolle.\n\nRollen:\n- Benutzer: Kann die Karte sehen und Einstellungen ändern\n- Mandanten-Admin: Kann Benutzer und Empfänger im eigenen Mandanten verwalten\n- Super-Admin: Vollzugriff auf alle Mandanten und Systemeinstellungen"}
        >
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: isMobile ? '10px 16px' : '8px 16px',
              fontSize: isMobile ? 14 : 13, fontWeight: 600, cursor: 'pointer',
              minHeight: isMobile ? 44 : undefined,
            }}
          >
            {showForm ? 'Abbrechen' : 'Neuer Benutzer'}
          </button>
        </AdminTooltip>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: isMobile ? 14 : 20, marginBottom: 20,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}>
            <input placeholder="Benutzername" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={inputStyle} />
            <input placeholder="E-Mail" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input placeholder="Anzeigename" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} style={inputStyle} />
            <input placeholder="Passwort (min. 8 Zeichen)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="user">Benutzer</option>
              {isSuperAdmin && <option value="tenant_admin">Mandanten-Admin</option>}
              {isSuperAdmin && <option value="super_admin">Super-Admin</option>}
            </select>
            {isSuperAdmin && (
              <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} style={inputStyle}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={handleCreate}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: isMobile ? '12px 16px' : '8px 16px',
              fontSize: isMobile ? 14 : 13, fontWeight: 600,
              cursor: 'pointer', alignSelf: isMobile ? 'stretch' : 'flex-start',
              minHeight: isMobile ? 48 : undefined,
            }}
          >
            Erstellen
          </button>
        </div>
      )}

      {/* ─── Mobile: Card layout ─── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {users.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              Keine Benutzer vorhanden.
            </div>
          )}
          {users.map(u => (
            editingId === u.id ? (
              <div key={u.id}>{renderEditForm(u)}</div>
            ) : (
              <div key={u.id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 14,
              }}>
                {/* User info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.display_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.username}</div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    background: u.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: u.is_active ? '#22c55e' : '#ef4444',
                  }}>
                    {u.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>

                {/* Details */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div>{u.email}</div>
                  <div>
                    <span style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 4,
                      background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                    }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => startEdit(u)}
                    style={{
                      ...mobileBtnStyle, flex: 1,
                      background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                      border: '1px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => handleResetPassword(u.id)}
                    style={{
                      ...mobileBtnStyle, flex: 1,
                      background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    PW Reset
                  </button>
                  {u.role !== 'super_admin' && (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      style={{
                        ...mobileBtnStyle,
                        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.3)',
                      }}
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        /* ─── Desktop: Table layout ─── */
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Benutzer</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>E-Mail</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Rolle</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                editingId === u.id ? (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                    <td colSpan={5} style={{ padding: '16px' }}>
                      {renderEditForm(u)}
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div>{u.display_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}</div>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                      }}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: u.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: u.is_active ? '#22c55e' : '#ef4444',
                      }}>
                        {u.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <AdminTooltip
                        brief="Benutzerdaten bearbeiten"
                        detail={"Ändert Anzeigename, E-Mail, Rolle oder Aktiv-Status dieses Benutzers.\nRollenänderungen wirken sich sofort auf die Berechtigungen aus.\nDer Benutzername kann nicht geändert werden."}
                      >
                        <button
                          onClick={() => startEdit(u)}
                          style={{
                            background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Bearbeiten
                        </button>
                      </AdminTooltip>
                      <AdminTooltip
                        brief="Passwort zurücksetzen"
                        detail={"Setzt das Passwort dieses Benutzers auf ein neues Passwort zurück.\nDas neue Passwort muss mindestens 8 Zeichen lang sein.\nDer Benutzer wird beim nächsten Login aufgefordert, das neue Passwort zu verwenden.\nAktive Sessions bleiben bestehen bis das Token abläuft."}
                      >
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          style={{
                            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          PW Reset
                        </button>
                      </AdminTooltip>
                      {u.role !== 'super_admin' && (
                        <AdminTooltip
                          brief="Benutzer unwiderruflich löschen"
                          detail={"Löscht diesen Benutzer und alle seine Daten aus dem System.\nDiese Aktion kann nicht rückgängig gemacht werden.\nAlternative: Benutzer über \"Bearbeiten\" auf \"Inaktiv\" setzen — damit bleibt der Eintrag erhalten, aber der Login wird gesperrt."}
                        >
                          <button
                            onClick={() => handleDelete(u.id, u.username)}
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
                )
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Keine Benutzer vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
