import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { fetchTenants, fetchUsers } from '../../api';

interface Stats {
  tenants: number;
  users: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ tenants: 0, users: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [tenants, users] = await Promise.all([
          user?.role === 'super_admin' ? fetchTenants() : Promise.resolve([]),
          fetchUsers(),
        ]);
        setStats({
          tenants: tenants.length,
          users: users.length,
        });
      } catch {
        // Silent
      }
    };
    load();
  }, [user?.role]);

  const cards = [
    ...(user?.role === 'super_admin' ? [{ label: 'Mandanten', value: stats.tenants }] : []),
    { label: 'Benutzer', value: stats.users },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700 }}>Dashboard</h1>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '20px 24px',
            minWidth: 160,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: 8,
            }}>
              {card.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
