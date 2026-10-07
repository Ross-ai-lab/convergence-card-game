/**
 * The pointer position a drag or an aim follows.
 *
 * Pointer moves arrive faster than frames, and they used to be React state on
 * the duel itself: every frame of a drag re-rendered the whole board, hand and
 * both heroes to move one card. Now the position lives outside React. Samples
 * coalesce into one notification per animation frame, and only the drag ghost
 * and the targeting arrow listen; they write the new position straight onto
 * their own elements.
 */
export type ScreenPoint = { x: number; y: number };

export class PointerStore {
  private point: ScreenPoint | null = null;
  private frame: number | null = null;
  private readonly listeners = new Set<() => void>();

  get = (): ScreenPoint | null => this.point;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Coalesced: the latest sample is published on the next frame. */
  schedule(point: ScreenPoint): void {
    this.point = point;
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.emit();
    });
  }

  /** Immediate: publishes now and drops any queued sample. */
  set(point: ScreenPoint | null): void {
    this.cancel();
    this.point = point;
    this.emit();
  }

  cancel(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
