import { useState, useEffect } from 'react';

/**
 * Detects if current device is a tablet.
 * Combines multiple signals for reliable detection:
 * - iPadOS 13+ (reports as Macintosh but has touch)
 * - Android tablets (via Client Hints or UA heuristic)
 * - Kindle/Silk tablets
 * - Samsung/Android tablets with coarse pointer + no hover + tablet screen size
 */
function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;

  // iPad (old UA or apps)
  if (/iPad/.test(ua)) return true;

  // iPadOS 13+ (Macintosh + multi-touch, Macs have no touch screen)
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;

  // Client Hints API (Chromium): Android + not mobile = tablet
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform === 'Android' && uaData?.mobile === false) return true;

  // Android without "Mobile" in UA = tablet (Google's recommendation)
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return true;

  // Kindle/Silk tablets
  if (/Kindle|Silk/.test(ua) && !/Mobile/.test(ua)) return true;

  // Android with coarse pointer + no hover + tablet screen size (catches Samsung tabs)
  if (/Android/.test(ua)) {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    const shortSide = Math.min(screen.width, screen.height);
    if (isCoarse && noHover && shortSide >= 600) return true;
  }

  return false;
}

/**
 * Returns true if the device should use the mobile/tablet layout.
 * Mobile layout is used when:
 * - Screen width < breakpoint (default 768px), OR
 * - Device is a tablet (any screen size)
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint || isTabletDevice();
  });

  useEffect(() => {
    // Tablet detection is static (doesn't change on resize)
    const tablet = isTabletDevice();
    const handler = () => setIsMobile(window.innerWidth < breakpoint || tablet);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  return isMobile;
}
