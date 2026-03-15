import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AdminTooltipProps {
  /** Short text shown after ~300ms (like native title) */
  brief?: string;
  /** Extended tooltip text shown after 2 seconds */
  detail: string;
  children: React.ReactElement;
}

/**
 * Two-stage tooltip for admin buttons:
 * - After 300ms hover: brief text (or small "..." hint)
 * - After 2000ms hover: full detailed explanation
 *
 * Uses a portal so positioning isn't affected by overflow:hidden parents.
 */
export default function AdminTooltip({ brief, detail, children }: AdminTooltipProps) {
  const [stage, setStage] = useState<'hidden' | 'brief' | 'detail'>('hidden');
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerBrief = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerDetail = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number }>({ top: 0, left: 0, maxWidth: 320 });

  const updatePos = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const viewW = window.innerWidth;

    // Center horizontally, clamp to viewport
    let left = rect.left + rect.width / 2;
    const maxWidth = Math.min(360, viewW - 24);
    left = Math.max(maxWidth / 2 + 12, Math.min(left, viewW - maxWidth / 2 - 12));

    setPos({
      top: rect.top - 8,
      left,
      maxWidth,
    });
  }, []);

  const handleEnter = useCallback(() => {
    timerBrief.current = setTimeout(() => {
      updatePos();
      setStage('brief');
    }, 300);
    timerDetail.current = setTimeout(() => {
      updatePos();
      setStage('detail');
    }, 2000);
  }, [updatePos]);

  const handleLeave = useCallback(() => {
    if (timerBrief.current) clearTimeout(timerBrief.current);
    if (timerDetail.current) clearTimeout(timerDetail.current);
    setStage('hidden');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerBrief.current) clearTimeout(timerBrief.current);
      if (timerDetail.current) clearTimeout(timerDetail.current);
    };
  }, []);

  const visible = stage !== 'hidden';
  const showDetail = stage === 'detail';

  return (
    <span
      ref={anchorRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ display: 'inline-flex' }}
    >
      {children}
      {visible && createPortal(
        <div
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            pointerEvents: 'none',
            animation: 'adminTooltipIn 0.15s ease-out',
          }}
        >
          <div style={{
            background: '#1e2233',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 8,
            padding: showDetail ? '10px 14px' : '6px 12px',
            maxWidth: pos.maxWidth,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            {/* Brief stage */}
            {!showDetail && (
              <div style={{ fontSize: 11, color: '#e4e6eb', lineHeight: 1.4 }}>
                {brief || detail.split('.')[0] + '.'}
                <span style={{
                  display: 'block',
                  fontSize: 9,
                  color: '#6b7280',
                  marginTop: 3,
                  fontStyle: 'italic',
                }}>
                  Hover halten für Details...
                </span>
              </div>
            )}

            {/* Detail stage */}
            {showDetail && (
              <div style={{ fontSize: 12, color: '#e4e6eb', lineHeight: 1.6 }}>
                {brief && (
                  <div style={{
                    fontWeight: 600,
                    marginBottom: 6,
                    paddingBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    color: '#3b82f6',
                    fontSize: 11,
                  }}>
                    {brief}
                  </div>
                )}
                <div style={{ color: '#c9d1d9', whiteSpace: 'pre-line' }}>
                  {detail}
                </div>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #1e2233',
            margin: '0 auto',
          }} />
        </div>,
        document.body,
      )}
    </span>
  );
}
