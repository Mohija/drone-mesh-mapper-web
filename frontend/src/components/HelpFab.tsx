import { useNavigate, useLocation } from 'react-router-dom';

interface Props {
  section: string;
  sub?: string;
  title?: string;
}

/**
 * Floating help button pinned to the top-right of the viewport.
 *
 * Lives on admin subpages as the single entry point into the user manual —
 * replaces the earlier inline "?" icons that sat next to each h1/h2. One
 * button per page keeps the signal consistent: users always know where to
 * find contextual help. AdminLayout reserves a right-side gutter so the
 * FAB never collides with page-header action buttons.
 */
export default function HelpFab({ section, sub, title }: Props) {
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
        position: 'fixed',
        top: 'calc(16px + env(safe-area-inset-top))',
        right: 'calc(16px + env(safe-area-inset-right))',
        zIndex: 100,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--accent)',
        color: 'var(--accent)',
        fontSize: 20,
        fontWeight: 700,
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,212,170,0.15)',
        transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
        touchAction: 'manipulation',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(0,212,170,0.12)';
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4), 0 0 0 2px rgba(0,212,170,0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-secondary)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,212,170,0.15)';
      }}
    >
      ?
    </button>
  );
}
