import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSave, loadGame, saveGame } from "./storage";
import { createInitialGame } from "./engine/game";
import { cards, relics } from "./data/cards";
import type { GameState } from "./engine/types";

/**
 * The save slot, exercised through a stand-in for `window.localStorage`.
 *
 * `storage.ts` reaches for `window` directly and swallows every failure, so a
 * missing browser would make these tests pass by doing nothing at all. Stubbing
 * the global is what makes them able to fail.
 */
function memoryLocalStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const SAVE_KEY = "convergence.save.v25";
const LEGACY_SAVE_KEY = "convergence.save.v24";

function liveDuel(): GameState {
  const state = createInitialGame(cards, "storage-test", relics);
  return { ...state, phase: "main", mulligan: null, turnNumber: 4 };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the save slot", () => {
  it("round-trips a duel in progress", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const game = liveDuel();

    saveGame(game, [], { kind: "bot", skill: "normal" }, 1_000);
    const restored = loadGame();

    expect(restored?.game.turnNumber).toBe(4);
    expect(restored?.mode).toEqual({ kind: "bot", skill: "normal" });
  });

  it("clears the previous version's key as well, so a finished duel stays finished", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    // A save left behind by the last engine version. `loadGame` still reads this
    // key, so leaving it in place after a clear used to resurrect an old duel on
    // the next visit — the title screen offered Continue on a game nobody had
    // been playing.
    storage.values.set(LEGACY_SAVE_KEY, JSON.stringify({ version: 24, game: liveDuel(), events: [], mode: { kind: "hotseat" }, savedAt: 1 }));
    saveGame(liveDuel(), [], { kind: "hotseat" }, 2);

    clearSave();

    expect(storage.values.has(SAVE_KEY)).toBe(false);
    expect(storage.values.has(LEGACY_SAVE_KEY)).toBe(false);
    expect(loadGame()).toBeNull();
  });

  it("refuses a finished duel", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });

    saveGame({ ...liveDuel(), phase: "gameOver", winner: 0 }, [], { kind: "hotseat" }, 3);

    expect(loadGame()).toBeNull();
  });
});
