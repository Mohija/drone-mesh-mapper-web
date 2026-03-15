import { useState, useEffect, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { fetchLoginTenants } from '../api';
import type { TenantInfo } from '../types/auth';

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tenant selector state
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load tenants on mount
  useEffect(() => {
    fetchLoginTenants()
      .then(t => {
        setTenants(t);
        // Pre-select last used tenant or first tenant
        const lastTenant = localStorage.getItem('last_tenant_id');
        if (lastTenant && t.some(tt => tt.id === lastTenant)) {
          setSelectedTenantId(lastTenant);
          const found = t.find(tt => tt.id === lastTenant);
          if (found) setTenantSearch(found.display_name);
        } else if (t.length === 1) {
          setSelectedTenantId(t[0].id);
          setTenantSearch(t[0].display_name);
        }
      })
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filtered tenants for autocomplete
  const filteredTenants = useMemo(() => {
    if (!tenantSearch.trim()) return tenants;
    const q = tenantSearch.toLowerCase();
    return tenants.filter(t =>
      t.display_name.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)',
      }}>
        Laden...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password, selectedTenantId || undefined);
      if (selectedTenantId) {
        localStorage.setItem('last_tenant_id', selectedTenantId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  const selectTenant = (t: TenantInfo) => {
    setSelectedTenantId(t.id);
    setTenantSearch(t.display_name);
    setShowDropdown(false);
  };

  const inputStyle = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--text-primary)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)',
      padding: '0 16px',
      boxSizing: 'border-box',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
        width: '100%',
        maxWidth: 360,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            FlightArc
          </h1>
          <p style={{
            margin: '4px 0 0', fontSize: 13,
            color: 'var(--text-muted)',
          }}>
            Anmeldung erforderlich
          </p>
        </div>

        {error && (
          <div data-testid="login-error" style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        {/* Tenant selector */}
        {tenants.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              color: 'var(--text-muted)', letterSpacing: '0.5px',
            }}>
              Mandant
            </label>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <input
                data-testid="login-tenant"
                type="text"
                value={tenantSearch}
                onChange={e => {
                  setTenantSearch(e.target.value);
                  setSelectedTenantId('');
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Mandant auswählen..."
                autoComplete="off"
                style={inputStyle}
              />
              {showDropdown && filteredTenants.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: 'auto',
                  zIndex: 100,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}>
                  {filteredTenants.map(t => (
                    <div
                      key={t.id}
                      onClick={() => selectTenant(t)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        background: t.id === selectedTenantId ? 'var(--bg-tertiary)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = t.id === selectedTenantId ? 'var(--bg-tertiary)' : 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{t.display_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.name}</div>
                    </div>
                  ))}
                </div>
              )}
              {showDropdown && filteredTenants.length === 0 && tenantSearch && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  zIndex: 100,
                }}>
                  Kein Mandant gefunden
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            color: 'var(--text-muted)', letterSpacing: '0.5px',
          }}>
            Benutzername
          </label>
          <input
            data-testid="login-username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus={tenants.length === 0}
            required
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            color: 'var(--text-muted)', letterSpacing: '0.5px',
          }}>
            Passwort
          </label>
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </div>

        <button
          data-testid="login-submit"
          type="submit"
          disabled={submitting}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            marginTop: 4,
          }}
        >
          {submitting ? 'Anmeldung...' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
