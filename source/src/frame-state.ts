import { useCallback, useEffect, useRef, useState } from 'react';

/** Coalesce pointer samples; immediate resets cancel any queued sample. */
export function useFrameState<T>(initial: T) {
  const [value, update] = useState(initial);
  const frame = useRef<number | null>(null);
  const latest = useRef(initial);
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const set = useCallback((next: T) => {
    cancel();
    latest.current = next;
    update(next);
  }, [cancel]);
  const schedule = useCallback((next: T) => {
    latest.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      update(latest.current);
    });
  }, []);
  return [value, set, schedule] as const;
}
