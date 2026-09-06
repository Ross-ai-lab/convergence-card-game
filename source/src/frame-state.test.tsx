// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrameState } from './frame-state';

afterEach(() => vi.unstubAllGlobals());

it('coalesces motion and prevents a queued pointer sample from resurrecting a released drag', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback); return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let controls!: ReturnType<typeof useFrameState<number | null>>;
  let renders = 0;
  function Probe() {
    controls = useFrameState<number | null>(null);
    renders++;
    return <span>{controls[0]}</span>;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => { for (let i = 0; i < 100; i++) controls[2](i); });
  expect(frames.size).toBe(1);
  expect(renders).toBe(1);
  const callback = [...frames.values()][0]; frames.clear();
  act(() => callback(16));
  expect(controls[0]).toBe(99);
  expect(renders).toBe(2);
  act(() => { controls[2](100); controls[1](null); });
  expect(frames.size).toBe(0);
  expect(controls[0]).toBeNull();
  act(() => controls[2](101));
  act(() => root.unmount());
  expect(frames.size).toBe(0);
});
