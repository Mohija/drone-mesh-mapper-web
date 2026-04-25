import { useEffect, useState } from 'react';
import { fetchInterfaceStats, InterfaceStats } from '../../api';

interface Props {
  interfaceId: string;
  interfaceType: string;
}

export default function InterfaceStatsBadge({ interfaceId, interfaceType }: Props) {
  const [stats, setStats] = useState<InterfaceStats | null>(null);

  useEffect(() => {
    let cancel = false;
    fetchInterfaceStats(interfaceId)
      .then(s => { if (!cancel) setStats(s); })
      .catch(() => { /* non-fatal */ });
    return () => { cancel = true; };
  }, [interfaceId]);

  if (!stats) return null;

  const successRate = stats.last24hSuccessRate;
  const max = Math.max(...stats.daily.map(d => d.total), 1);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, marginTop: 8,
      flexWrap: 'wrap', fontSize: 11,
    }}>
      <Stat label="24h"
            value={stats.last24hTotal === 0 ? '—' : `${stats.last24hSuccess}/${stats.last24hTotal}`}
            color={successRate === null ? 'var(--text-muted)'
                  : successRate >= 0.95 ? 'var(--accent)'
                  : successRate >= 0.5 ? '#f59e0b' : '#ef4444'} />
      {stats.lastDeliveryAt && (
        <Stat label="zuletzt"
              value={timeAgo(stats.lastDeliveryAt)}
              color={stats.lastDeliveryStatus === 'success' ? 'var(--accent)' : '#ef4444'} />
      )}
      {interfaceType === 'subscription' && stats.activeSubscribers !== undefined && (
        <Stat label="Subscriber" value={String(stats.activeSubscribers)}
              color={stats.activeSubscribers > 0 ? 'var(--accent)' : 'var(--text-muted)'} />
      )}
      {interfaceType === 'pull_in' && stats.lastPullAt && (
        <Stat label="letzter Pull" value={timeAgo(stats.lastPullAt)} color="var(--accent)" />
      )}
      {/* 7-day spark */}
      <div title="7-Tage Trend (grün = erfolgreich, rot = fehlgeschlagen)" style={{
        display: 'flex', alignItems: 'flex-end', gap: 2, height: 20,
      }}>
        {stats.daily.map((d, i) => {
          const ratio = max > 0 ? Math.max(0.08, d.total / max) : 0.08;
          const height = Math.round(20 * ratio);
          const okShare = d.total > 0 ? d.success / d.total : 0;
          return (
            <div key={i} style={{
              width: 6, height,
              background: d.total === 0 ? 'var(--bg-tertiary)'
                : okShare === 1 ? 'var(--accent)'
                : okShare === 0 ? '#ef4444'
                : `linear-gradient(to top, #ef4444 ${(1 - okShare) * 100}%, var(--accent) ${(1 - okShare) * 100}%)`,
              borderRadius: 1,
            }} />
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

function timeAgo(epoch: number): string {
  const now = Date.now() / 1000;
  const dt = now - epoch;
  if (dt < 60) return `${Math.round(dt)}s`;
  if (dt < 3600) return `${Math.round(dt / 60)}m`;
  if (dt < 86400) return `${Math.round(dt / 3600)}h`;
  return `${Math.round(dt / 86400)}d`;
}
