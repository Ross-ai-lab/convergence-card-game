import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotSearch, type BotRequest } from './bot-search';
import { createInitialGame, makeCardLibrary } from './game';
import { cards, relics } from '../data/cards';
import { CAMPAIGN_STARTER_DECK, CAMPAIGN_DIFFICULTIES } from '../campaign';
import { chooseBotAction } from './bot';

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
  it('passes separate piles and cheat-free Ascendant settings through the worker boundary', () => {
    vi.stubGlobal('Worker', WorkerStub);
    const game = createInitialGame(cards, 'fair-worker', relics, {
      decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK],
      botCheats: [null, CAMPAIGN_DIFFICULTIES.ascendantFair.cheats],
    });
    const search = new BotSearch();
    search.search({ ...request, game, skill: 'hard' }, vi.fn());
    const sent = structuredClone(WorkerStub.instances[0].postMessage.mock.calls[0][0]);
    expect(sent.game.playerDecks).toEqual(game.playerDecks);
    expect(sent.game.botCheats[1]).toEqual(CAMPAIGN_DIFFICULTIES.ascendantFair.cheats);
    expect(sent.skill).toBe('hard'); search.dispose();
  });
  it('uses the same saved campaign settings in the no-worker fallback', () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', undefined);
    const game = createInitialGame(cards, 'fair-fallback', relics, {
      decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK],
      botCheats: [null, CAMPAIGN_DIFFICULTIES.ascendantFair.cheats],
    });
    game.phase = 'main'; game.mulligan = null; game.activePlayer = 1;
    game.players[1].hand = ['c004'];
    const expected = chooseBotAction(game, request.library, 1, 'hard');
    const search = new BotSearch(); const receive = vi.fn();
    search.search({ ...request, game, skill: 'hard' }, receive); vi.runAllTimers();
    expect(receive).toHaveBeenCalledWith(expected); search.dispose();
  });
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
