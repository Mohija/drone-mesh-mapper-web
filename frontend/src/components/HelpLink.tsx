import { useNavigate, useLocation } from 'react-router-dom';

interface Props {
  /** Top-level help section id (e.g. 'receivers', 'administration'). */
  section: string;
  /** Optional subsection id that follows the `--` delimiter in the hash. */
  sub?: string;
  /** Hover tooltip + aria label. Defaults to a generic "Hilfe öffnen". */
  title?: string;
  /** Visual size (diameter in px) — 16 for tight menu items, 20 for headings. */
  size?: number;
}

/**
 * Tiny circular "?" button that deep-links into the user manual.
 *
 * Routing is pure hash-based (/help#<section>--<sub>) so it plays nicely with
 * the browser's back stack — a click pushes the help URL, the back button
 * returns the user to exactly where they came from (React Router preserves
 * scroll via its own mechanics).
 *
 * We also stash the origin path + a timestamp in the navigation state so the
 * HelpPage can surface a contextual "← Zurück zu …" breadcrumb. The hash is
 * never displayed to the user; they just see the help content.
 */
export default function HelpLink({ section, sub, title, size = 16 }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const hash = sub ? `${section}--${sub}` : section;
  const targetLabel = title ?? `Hilfe: ${sub ?? section}`;

  return (
    <button
      type="button"
      aria-label={targetLabel}
      title={targetLabel}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigate(`/help#${hash}`, {
          state: {
            fromPath: location.pathname + location.search,
            fromLabel: document.title || 'vorherige Seite',
            at: Date.now(),
          },
        });
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '50%',
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: Math.round(size * 0.6),
        fontWeight: 700,
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1,
        flexShrink: 0,
        transition: 'color 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--accent)';
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,212,170,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      ?
    </button>
  );
}
