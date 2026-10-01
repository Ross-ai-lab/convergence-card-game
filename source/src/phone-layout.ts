import { useLayoutEffect, useState } from 'react';

export function isPhoneViewport(width: number, height: number, touch: boolean): boolean {
  return touch && Math.min(width, height) <= 600;
}

export function usePhoneLayout() {
  const [layout, setLayout] = useState({ compact: false, phone: false, portrait: false });
  useLayoutEffect(() => {
    const pointer = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      const button = document.querySelector('.mobile-menu-toggle');
      const phone = isPhoneViewport(innerWidth, innerHeight, pointer.matches || navigator.maxTouchPoints > 0);
      setLayout(previous => {
        const next = { compact: Boolean(button && getComputedStyle(button).display !== 'none'), phone, portrait: phone && innerHeight > innerWidth };
        return previous.compact === next.compact && previous.phone === next.phone && previous.portrait === next.portrait ? previous : next;
      });
    };
    sync();
    window.addEventListener('resize', sync);
    pointer.addEventListener('change', sync);
    return () => { window.removeEventListener('resize', sync); pointer.removeEventListener('change', sync); };
  }, []);
  return layout;
}

/** Called directly from a play/resume gesture. Unsupported browsers keep the rotate screen. */
export async function requestPhoneLandscape(phone: boolean): Promise<void> {
  if (!phone) return;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
    await orientation?.lock?.('landscape');
  } catch {
    // Rotation permission is controlled by the browser. The visible gate remains usable.
  }
}
