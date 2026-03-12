import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
        width: 360,
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
            autoFocus
            required
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 14,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
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
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 14,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
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
