import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/tenants', label: 'Mandanten', superAdminOnly: true },
  { to: '/admin/users', label: 'Benutzer' },
  { to: '/admin/receivers', label: 'Empfänger' },
  { to: '/admin/simulation', label: 'Simulation' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, effectiveRole, tenants, switchTenant, currentTenantId } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      {/* Sidebar */}
      <nav style={{
        width: 220,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
      }}>
        <div style={{
          padding: '0 16px 16px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 8,
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Administration</h2>
          {user && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {user.display_name}
              {user.tenant_name && (
                <span style={{ display: 'block', marginTop: 2 }}>
                  {user.tenant_name}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Tenant switcher (for users with multiple tenants) */}
        {tenants.length > 1 && (
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 8,
          }}>
            <label style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              color: 'var(--text-muted)', letterSpacing: '0.5px',
              display: 'block', marginBottom: 4,
            }}>
              Mandant
            </label>
            <select
              value={currentTenantId || ''}
              onChange={async (e) => {
                try {
                  await switchTenant(e.target.value);
                  // Reload page to refresh data for new tenant
                  window.location.reload();
                } catch { /* silent */ }
              }}
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 12,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.display_name}</option>
              ))}
            </select>
          </div>
        )}

        {navItems
          .filter(item => !item.superAdminOnly || isSuperAdmin)
          .map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                textDecoration: 'none',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))
        }

        <div style={{ flex: 1 }} />

        <button
          onClick={() => navigate('/')}
          style={{
            margin: '8px 16px',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Zur Karte
        </button>
      </nav>

      {/* Content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: 24,
      }}>
        <Outlet />
      </main>
    </div>
  );
}
