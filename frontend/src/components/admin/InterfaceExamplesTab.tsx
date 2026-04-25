import { useEffect, useState } from 'react';
import { fetchInterfaceUsageExamples, UsageExamples, UsageExample } from '../../api';

interface Props { interfaceId: string; }

const SECTION_LABEL: Record<keyof UsageExamples, { title: string; help: string }> = {
  oneShot: {
    title: 'Einmaliger Abruf (Pull-In)',
    help: 'Drittsystem ruft FlightArc einmalig ab — z.B. periodisch im Cron-Job.',
  },
  subscribe: {
    title: 'Subscription (registrieren + empfangen)',
    help: 'Drittsystem registriert seine Callback-URL einmalig per API-Key, danach pusht FlightArc jedes Event.',
  },
  webhook: {
    title: 'Empfangs-Handler (Webhook & Subscription)',
    help: 'Beispiel-Code für die Empfangsseite — inkl. HMAC-Signatur-Prüfung bei Subscriptions.',
  },
};

export default function InterfaceExamplesTab({ interfaceId }: Props) {
  const [examples, setExamples] = useState<UsageExamples | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInterfaceUsageExamples(interfaceId)
      .then(setExamples)
      .catch(e => setError((e as Error).message));
  }, [interfaceId]);

  if (error) return <p style={{ color: '#ef4444' }}>{error}</p>;
  if (!examples) return <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>;

  const sections = (['subscribe', 'oneShot', 'webhook'] as (keyof UsageExamples)[])
    .filter(k => examples[k] && examples[k].length > 0);

  if (sections.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Für diesen Schnittstellen-Typ sind keine vordefinierten Beispiele hinterlegt — du
        sendest aktiv von FlightArc, ein eigener Empfangs-Handler ist auf der Drittsystem-Seite
        zu implementieren.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {sections.map(section => (
        <section key={section}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {SECTION_LABEL[section].title}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {SECTION_LABEL[section].help}
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {examples[section].map((ex, i) => <CodeBlock key={i} ex={ex} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function CodeBlock({ ex }: { ex: UsageExample }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 11 }}>{ex.label}</strong>
          <span style={{
            fontSize: 9, padding: '1px 6px', background: 'var(--bg-tertiary)',
            borderRadius: 3, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>{ex.language}</span>
        </div>
        <button
          onClick={async () => { await navigator.clipboard.writeText(ex.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{
            padding: '4px 10px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 4,
            color: copied ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer',
          }}
        >{copied ? '✓ Kopiert' : 'Kopieren'}</button>
      </div>
      <pre style={{
        margin: 0, padding: 10, fontSize: 11, lineHeight: 1.5,
        overflow: 'auto', maxHeight: 280, fontFamily: 'monospace',
        color: 'var(--text-primary)',
      }}>{ex.code}</pre>
    </div>
  );
}
