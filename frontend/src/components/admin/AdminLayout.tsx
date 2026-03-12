import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/tenants', label: 'Mandanten', superAdminOnly: true },
  { to: '/admin/users', label: 'Benutzer' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
            </p>
          )}
        </div>

        {navItems
          .filter(item => !item.superAdminOnly || user?.role === 'super_admin')
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
