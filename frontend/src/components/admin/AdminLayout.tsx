import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { useIsMobile } from '../../useIsMobile';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/tenants', label: 'Mandanten', superAdminOnly: true },
  { to: '/admin/users', label: 'Benutzer' },
  { to: '/admin/receivers', label: 'Empfänger' },
  { to: '/admin/settings', label: 'Einstellungen' },
  { to: '/admin/simulation', label: 'Simulation' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, effectiveRole, tenants, switchTenant, currentTenantId, logout } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(() => isMobile);
  const _ = effectiveRole;

  const sidebarContent = (
    <>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px 16px' : '0 16px 16px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Administration</h2>
          {user && (
            <p style={{ margin: '4px 0 0', fontSize: isMobile ? 12 : 11, color: 'var(--text-muted)' }}>
              {user.display_name}
              {user.tenant_name && (
                <span style={{ display: 'block', marginTop: 2 }}>
                  {user.tenant_name}
                </span>
              )}
            </p>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 8, width: 44, height: 44, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: 'var(--text-muted)', flexShrink: 0,
          }}>&times;</button>
        )}
      </div>

      {/* Tenant switcher */}
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
                window.location.reload();
              } catch { /* silent */ }
            }}
            style={{
              width: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: isMobile ? '10px 12px' : '6px 8px',
              fontSize: isMobile ? 14 : 12,
              color: 'var(--text-primary)',
              outline: 'none',
              minHeight: isMobile ? 44 : undefined,
            }}
          >
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Nav items */}
      {navItems
        .filter(item => !item.superAdminOnly || isSuperAdmin)
        .map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => isMobile && setSidebarOpen(false)}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              padding: isMobile ? '14px 16px' : '10px 16px',
              minHeight: isMobile ? 48 : undefined,
              fontSize: isMobile ? 15 : 13,
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

      {/* Zur Karte */}
      <button
        onClick={() => navigate('/')}
        style={{
          margin: '8px 16px',
          padding: isMobile ? '12px' : '8px 12px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: isMobile ? 14 : 13,
          minHeight: isMobile ? 48 : undefined,
        }}
      >
        Zur Karte
      </button>

      {/* Abmelden - mobile only, clearly separated */}
      {isMobile && (
        <button
          onClick={logout}
          style={{
            margin: '4px 16px 8px',
            padding: '12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            minHeight: 48,
            textAlign: 'center',
          }}
        >
          Abmelden
        </button>
      )}
    </>
  );

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <nav style={{
          width: 220,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
        }}>
          {sidebarContent}
        </nav>
      )}

      {/* Mobile: Hamburger button */}
      {isMobile && !sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} style={{
          position: 'fixed', top: 12, left: 12, zIndex: 999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, width: 44, height: 44, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: 'var(--text-secondary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          &#9776;
        </button>
      )}

      {/* Mobile: Sidebar drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          }} />
          <nav style={{
            position: 'fixed', top: 0, left: 0, width: 280, height: '100vh',
            zIndex: 1001, background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', padding: '16px 0',
            overflow: 'auto',
          }}>
            {sidebarContent}
          </nav>
        </>
      )}

      {/* Content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? '60px 12px 24px' : 24,
      }}>
        <Outlet />
      </main>
    </div>
  );
}
