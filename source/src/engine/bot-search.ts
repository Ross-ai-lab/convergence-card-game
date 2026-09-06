import { chooseBotAction, type BotSkill } from './bot';
import type { CardLibrary } from './game';
import type { GameAction, GameState, PlayerId } from './types';

export interface BotRequest {
  game: GameState;
  library: CardLibrary;
  player: PlayerId;
  skill: BotSkill;
}

/** One reusable worker per mounted game. Cancelled searches cannot play stale moves. */
export class BotSearch {
  private worker: Worker | null = null;
  private cancelPending: (() => void) | null = null;

  search(request: BotRequest, receive: (action: GameAction | null) => void): () => void {
    this.cancelPending?.();
    let pending = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (action: GameAction | null) => {
      if (!pending) return;
      pending = false;
      this.cancelPending = null;
      receive(action);
    };
    const fallback = () => {
      if (!pending) return;
      clearTimeout(fallbackTimer);
      this.worker?.terminate();
      this.worker = null;
      // Preserve playability if a browser or deployment refuses workers.
      fallbackTimer = setTimeout(() => {
        if (pending) finish(chooseBotAction(request.game, request.library, request.player, request.skill));
      }, 0);
    };
    const cancel = () => {
      if (!pending) return;
      pending = false;
      clearTimeout(fallbackTimer);
      this.worker?.terminate();
      this.worker = null;
      this.cancelPending = null;
    };
    this.cancelPending = cancel;
    try {
      this.worker ??= new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<GameAction | null>) => finish(event.data);
      this.worker.onerror = (event) => { event.preventDefault(); fallback(); };
      this.worker.onmessageerror = fallback;
      this.worker.postMessage(request);
    } catch {
      fallback();
    }
    return cancel;
  }

  dispose() {
    this.cancelPending?.();
    this.worker?.terminate();
    this.worker = null;
  }
}
