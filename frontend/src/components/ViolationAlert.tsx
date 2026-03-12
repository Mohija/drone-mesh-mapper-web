import { useEffect, useRef } from 'react';
import type { ZoneViolation } from '../types/drone';

interface Props {
  violations: ZoneViolation[];
  onDismiss: (droneId: string, zoneId: string) => void;
  onDismissAll: () => void;
}

export default function ViolationAlert({ violations, onDismiss, onDismissAll }: Props) {
  const prevCountRef = useRef(0);

  // Play alert sound when new violations appear
  useEffect(() => {
    if (violations.length > prevCountRef.current && violations.length > 0) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'square';
        gain.gain.value = 0.1;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        // Audio not available — ignore
      }
    }
    prevCountRef.current = violations.length;
  }, [violations.length]);

  if (violations.length === 0) return null;

  return (
    <div
      data-testid="violation-alert"
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        maxWidth: 500,
        width: '90%',
        background: 'rgba(239, 68, 68, 0.95)',
        border: '1px solid #dc2626',
        borderRadius: 10,
        padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)',
        animation: 'violationPulse 2s ease-in-out infinite',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: violations.length > 1 ? 8 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>&#9888;</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
            Zonenverletzung ({violations.length})
          </span>
        </div>
        <button
          onClick={onDismissAll}
          data-testid="dismiss-all-violations"
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            padding: '3px 10px',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Alle ausblenden
        </button>
      </div>

      {violations.slice(0, 5).map((v, i) => (
        <div
          key={`${v.droneId}-${v.zoneId}`}
          data-testid={`violation-item-${v.droneId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 0',
            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none',
          }}
        >
          <div style={{ fontSize: 12, color: '#fff' }}>
            <strong>{v.droneName}</strong>
            <span style={{ opacity: 0.8, marginLeft: 6 }}>in {v.zoneName}</span>
          </div>
          <button
            onClick={() => onDismiss(v.droneId, v.zoneId)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 14,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            &times;
          </button>
        </div>
      ))}
      {violations.length > 5 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
          +{violations.length - 5} weitere
        </div>
      )}
    </div>
  );
}
