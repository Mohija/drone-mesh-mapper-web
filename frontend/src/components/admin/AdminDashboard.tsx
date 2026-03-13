import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { fetchTenants, fetchUsers, fetchReceiverStats } from '../../api';
import type { Tenant, UserAdmin, ReceiverStats } from '../../api';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  tenant_admin: 'Mandanten-Admin',
  user: 'Benutzer',
};

export default function AdminDashboard() {
  const { user, effectiveRole } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [receiverStats, setReceiverStats] = useState<ReceiverStats | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, u, rs] = await Promise.all([
          isSuperAdmin ? fetchTenants() : Promise.resolve([]),
          fetchUsers(),
          fetchReceiverStats().catch(() => null),
        ]);
        setTenants(t);
        setUsers(u);
        setReceiverStats(rs);
      } catch { /* silent */ }
    };
    load();
  }, [isSuperAdmin]);

  const cards: Array<{ label: string; value: string | number; color?: string }> = [
    ...(isSuperAdmin ? [{ label: 'Mandanten', value: tenants.length }] : []),
    { label: 'Benutzer', value: users.length },
    { label: 'Deine Rolle', value: ROLE_LABELS[effectiveRole || 'user'] || effectiveRole || '' },
    ...(receiverStats ? [
      { label: 'Empfänger Online', value: `${receiverStats.online}/${receiverStats.total}`, color: receiverStats.online > 0 ? '#14b8a6' : undefined },
    ] : []),
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700 }}>Dashboard</h1>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
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
            <div style={{ fontSize: typeof card.value === 'number' ? 28 : 18, fontWeight: 700 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Super Admin: overview of all tenants and their users */}
      {isSuperAdmin && tenants.length > 0 && (
        <>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>
            Mandanten-Übersicht
          </h2>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Mandant</th>
                  <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Benutzer</th>
                  <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Zonen</th>
                  <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{t.display_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.name}</div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {t.user_count ?? 0}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {t.zone_count ?? 0}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: t.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: t.is_active ? '#22c55e' : '#ef4444',
                      }}>
                        {t.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
