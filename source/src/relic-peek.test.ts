import { afterEach, expect, it, vi } from 'vitest';
import { createRelicPeek } from './relic-peek';
afterEach(() => vi.useRealTimers());
const point = {pointerId:1,clientX:100,clientY:100};
it('shows a tapped relic for one second after release', () => {
  vi.useFakeTimers();const show=vi.fn(),peek=createRelicPeek(show);
  peek.start(point,'relic');vi.advanceTimersByTime(100);peek.end(point);
  vi.advanceTimersByTime(999);expect(show).toHaveBeenLastCalledWith('relic');
  vi.advanceTimersByTime(1);expect(show).toHaveBeenLastCalledWith(null);
});
it('keeps a held relic visible and closes on release', () => {
  vi.useFakeTimers();const show=vi.fn(),peek=createRelicPeek(show);
  peek.start(point,'relic');vi.advanceTimersByTime(2500);expect(show).toHaveBeenLastCalledWith('relic');
  peek.end(point);expect(show).toHaveBeenLastCalledWith(null);
});
it('cancels movement and does not let an old timer close a new relic', () => {
  vi.useFakeTimers();const show=vi.fn(),peek=createRelicPeek(show);
  peek.start(point,'first');peek.end(point);vi.advanceTimersByTime(500);
  peek.start(point,'second');vi.advanceTimersByTime(600);expect(show).toHaveBeenLastCalledWith('second');
  peek.move({...point,clientX:113});expect(show).toHaveBeenLastCalledWith(null);
});
