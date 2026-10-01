import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCardHold } from './card-long-press';

afterEach(() => vi.useRealTimers());
describe('card long press', () => {
  const down = { pointerId: 1, clientX: 100, clientY: 100 };
  it('opens at one second and consumes the release click once', () => {
    vi.useFakeTimers();
    const hold = createCardHold(), show = vi.fn();
    hold.start(down, show);
    vi.advanceTimersByTime(999); expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(show).toHaveBeenCalledOnce();
    hold.end(down); expect(hold.consumeClick()).toBe(true); expect(hold.consumeClick()).toBe(false);
  });
  it('allows a short tap without opening or consuming its click', () => {
    vi.useFakeTimers();
    const hold = createCardHold(), show = vi.fn();
    hold.start(down, show); vi.advanceTimersByTime(250); hold.end(down); vi.advanceTimersByTime(1000);
    expect(show).not.toHaveBeenCalled(); expect(hold.consumeClick()).toBe(false);
  });
  it('cancels a swipe and tolerates a small finger movement', () => {
    vi.useFakeTimers();
    const hold = createCardHold(), show = vi.fn();
    hold.start(down, show); hold.move({...down, clientX:112}); vi.advanceTimersByTime(1000); expect(show).toHaveBeenCalledOnce();
    hold.end(down); hold.start(down, show); hold.move({...down, clientX:113}); vi.advanceTimersByTime(1000); expect(show).toHaveBeenCalledOnce();
  });
  it('does not open after cancellation, and a fresh touch is not blocked', () => {
    vi.useFakeTimers();
    const hold = createCardHold(), show = vi.fn();
    hold.start(down, show); hold.cancel(); vi.advanceTimersByTime(1000); expect(show).not.toHaveBeenCalled();
    hold.start(down, show); vi.advanceTimersByTime(1000); hold.end(down); hold.newTouch(); expect(hold.consumeClick()).toBe(false);
  });
});
