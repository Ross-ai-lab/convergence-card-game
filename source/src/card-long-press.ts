import { useEffect, useMemo, type PointerEvent } from 'react';

export const CARD_HOLD_MS = 1000;
const MOVE_TOLERANCE = 12;
type Point = { pointerId: number; clientX: number; clientY: number };

/** One active finger. A completed hold consumes its release click. */
export function createCardHold() {
  let press: (Point & { held: boolean; show: () => void }) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressUntil = 0;
  const cancel = () => { clearTimeout(timer); timer = undefined; press = null; };
  return {
    start(point: Point, show: () => void) {
      cancel();
      suppressUntil = 0;
      press = { ...point, show, held: false };
      timer = setTimeout(() => {
        if (!press) return;
        press.held = true;
        suppressUntil = Number.POSITIVE_INFINITY;
        press.show();
      }, CARD_HOLD_MS);
    },
    move(point: Point) {
      if (!press || press.pointerId !== point.pointerId || press.held) return;
      if (Math.hypot(point.clientX - press.clientX, point.clientY - press.clientY) > MOVE_TOLERANCE) cancel();
    },
    end(point: Pick<Point, 'pointerId'>) {
      if (!press || press.pointerId !== point.pointerId) return;
      if (press.held) suppressUntil = Date.now() + 500;
      cancel();
    },
    consumeClick() {
      if (Date.now() >= suppressUntil) return false;
      suppressUntil = 0;
      return true;
    },
    newTouch() { if (!press) suppressUntil = 0; },
    contextMenuActive() { return Boolean(press) || Date.now() < suppressUntil; },
    cancel,
  };
}

export function useCardLongPress() {
  const hold = useMemo(createCardHold, []);
  useEffect(() => {
    const up = (event: globalThis.PointerEvent) => hold.end(event);
    const move = (event: globalThis.PointerEvent) => hold.move(event);
    const context = (event: Event) => {
      const card = event.target instanceof Element && event.target.closest('.hand-card,.board-slot');
      if (hold.contextMenuActive() || (card && window.matchMedia('(pointer: coarse)').matches)) event.preventDefault();
    };
    const reset = () => hold.newTouch();
    document.addEventListener('pointerdown', reset, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('contextmenu', context, true);
    document.addEventListener('scroll', hold.cancel, true);
    return () => {
      hold.cancel();
      document.removeEventListener('pointerdown', reset, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('contextmenu', context, true);
      document.removeEventListener('scroll', hold.cancel, true);
    };
  }, [hold]);
  return useMemo(() => ({
    start(event: PointerEvent<HTMLElement>, show: () => void) {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') hold.start(event, show);
    },
    consumeClick: hold.consumeClick,
    cancel: hold.cancel,
  }), [hold]);
}
export type CardLongPress = ReturnType<typeof useCardLongPress>;
