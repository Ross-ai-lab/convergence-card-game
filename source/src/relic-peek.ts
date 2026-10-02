import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import type { RelicInstance } from './engine/types';

/** A tap previews for one second; a held finger previews until release. */
export function createRelicPeek<T>(show: (value: T | null) => void) {
  let active: { id: number; time: number; x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); active = null; show(null); };
  return {
    start(point: { pointerId: number; clientX: number; clientY: number }, value: T) {
      clearTimeout(timer);
      active = { id: point.pointerId, time: Date.now(), x: point.clientX, y: point.clientY };
      show(value);
    },
    end(point: { pointerId: number }) {
      if (!active || active.id !== point.pointerId) return;
      const held = Date.now() - active.time >= 350;
      active = null;
      if (held) cancel();
      else timer = setTimeout(cancel, 1000);
    },
    move(point: { pointerId: number; clientX: number; clientY: number }) {
      if (active?.id === point.pointerId && Math.hypot(point.clientX-active.x, point.clientY-active.y) > 12) cancel();
    },
    cancel,
  };
}

export function useRelicPeek() {
  const [preview, setPreview] = useState<{relic:RelicInstance;rect:{left:number;right:number;top:number;bottom:number}} | null>(null);
  const controller = useMemo(() => createRelicPeek(setPreview), []);
  useEffect(() => {
    const up = (event: globalThis.PointerEvent) => controller.end(event);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointermove', controller.move, true);
    document.addEventListener('pointercancel', controller.cancel, true);
    document.addEventListener('scroll', controller.cancel, true);
    window.addEventListener('resize', controller.cancel);
    return () => {
      controller.cancel();
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointermove', controller.move, true);
      document.removeEventListener('pointercancel', controller.cancel, true);
      document.removeEventListener('scroll', controller.cancel, true);
      window.removeEventListener('resize', controller.cancel);
    };
  }, [controller]);
  return useMemo(() => ({ relic:preview?.relic ?? null, rect:preview?.rect ?? null, cancel: controller.cancel,
    start(event: PointerEvent<HTMLElement>, relic: RelicInstance) {
      const {left,right,top,bottom}=event.currentTarget.getBoundingClientRect();
      controller.start(event, {relic,rect:{left,right,top,bottom}});
    },
  }), [preview, controller]);
}
