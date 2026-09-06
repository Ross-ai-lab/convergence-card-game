import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotSearch, type BotRequest } from './bot-search';
import { createInitialGame, makeCardLibrary } from './game';
import { cards, relics } from '../data/cards';

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
}
const request: BotRequest = {
  game: createInitialGame(cards, 'worker-test', relics),
  library: makeCardLibrary(cards, relics), player: 1, skill: 'normal',
};
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); WorkerStub.instances = []; });

describe('background bot search lifecycle', () => {
  it('reuses a completed worker for the next move', () => {
    vi.stubGlobal('Worker', WorkerStub);
    const search = new BotSearch();
    const receive = vi.fn();
    const cancel = search.search(request, receive);
    const worker = WorkerStub.instances[0];
    worker.onmessage?.({ data: { type: 'end_turn' } });
    cancel();
    search.search(request, receive);
    expect(WorkerStub.instances).toHaveLength(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(receive).toHaveBeenCalledOnce();
    search.dispose();
  });
  it('terminates unfinished work and ignores its late result after a restart', () => {
    vi.stubGlobal('Worker', WorkerStub);
    const search = new BotSearch();
    const oldReceive = vi.fn(), nextReceive = vi.fn();
    search.search(request, oldReceive);
    const oldWorker = WorkerStub.instances[0];
    const lateResult = oldWorker.onmessage;
    search.search(request, nextReceive);
    lateResult?.({ data: { type: 'end_turn' } });
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldReceive).not.toHaveBeenCalled();
    WorkerStub.instances[1].onmessage?.({ data: null });
    expect(nextReceive).toHaveBeenCalledWith(null);
    search.dispose();
  });
  it('cancels the fallback when leaving a duel after a worker load failure', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerStub);
    const search = new BotSearch();
    const receive = vi.fn();
    search.search(request, receive);
    WorkerStub.instances[0].onerror?.({ preventDefault: vi.fn() });
    search.dispose();
    vi.runAllTimers();
    expect(receive).not.toHaveBeenCalled();
  });
  it('keeps play possible when workers are unavailable', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', undefined);
    const search = new BotSearch();
    const receive = vi.fn();
    search.search({ ...request, game: { ...request.game, phase: 'gameOver' } }, receive);
    vi.runAllTimers();
    expect(receive).toHaveBeenCalledWith(null);
    search.dispose();
  });
});
