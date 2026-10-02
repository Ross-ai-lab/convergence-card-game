import { useLayoutEffect, useRef, useState } from 'react';

/** Fit the complete dossier, including its close control, inside the visible viewport. */
export function useProfileFit(entry: string) {
  const panel = useRef<HTMLElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => {
      if (!element.isConnected) return;
      const viewport = window.visualViewport;
      const available = (viewport?.height ?? innerHeight) - 16;
      const width = element.offsetWidth, height = Math.max(element.offsetHeight, element.scrollHeight) + 1;
      const scale = Math.min(1, available / height);
      setFit(previous => previous.width === width && previous.height === height && previous.scale === scale
        ? previous : { width, height, scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.visualViewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    measure();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, [entry]);
  return { panel, fit };
}
