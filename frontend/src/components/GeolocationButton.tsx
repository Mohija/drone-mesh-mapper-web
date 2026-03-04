import { useState, useCallback } from 'react';
import type { UserLocation } from '../types/drone';

interface Props {
  onLocationFound: (location: UserLocation) => void;
}

export default function GeolocationButton({ onLocationFound }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation nicht unterstützt');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        onLocationFound(loc);
        setLoading(false);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Standort-Zugriff verweigert',
          2: 'Standort nicht verfügbar',
          3: 'Zeitüberschreitung',
        };
        setError(messages[err.code] || 'Unbekannter Fehler');
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [onLocationFound]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: 12,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: loading ? 'var(--accent)' : 'var(--text-primary)',
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          transition: 'all 0.2s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        title="Meinen Standort finden"
      >
        {loading ? (
          <span style={{ animation: 'pulse 1s infinite' }}>&#9737;</span>
        ) : (
          <span>&#9737;</span>
        )}
      </button>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--status-error)',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 11,
          color: 'var(--status-error)',
          maxWidth: 160,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
