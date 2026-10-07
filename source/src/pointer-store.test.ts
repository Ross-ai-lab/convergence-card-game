import { afterEach, expect, it, vi } from 'vitest';
import { PointerStore } from './pointer-store';

afterEach(() => vi.unstubAllGlobals());

function stubFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return frames;
}

it('coalesces pointer samples into one notification per frame', () => {
  const frames = stubFrames();
  const store = new PointerStore();
  const seen: Array<number | undefined> = [];
  store.subscribe(() => seen.push(store.get()?.x));
  for (let x = 0; x < 100; x++) store.schedule({ x, y: 0 });
  expect(frames.size).toBe(1);
  expect(seen).toEqual([]);
  const [callback] = frames.values(); frames.clear();
  callback(16);
  expect(seen).toEqual([99]);
});

it('publishes an immediate position at once and drops the queued sample', () => {
  const frames = stubFrames();
  const store = new PointerStore();
  const seen: Array<number | null> = [];
  const unsubscribe = store.subscribe(() => seen.push(store.get()?.x ?? null));
  store.schedule({ x: 5, y: 5 });
  store.set({ x: 1, y: 1 });
  expect(frames.size).toBe(0);
  expect(seen).toEqual([1]);
  unsubscribe();
  store.schedule({ x: 7, y: 7 });
  const [callback] = frames.values();
  callback(16);
  expect(seen).toEqual([1]);
});
