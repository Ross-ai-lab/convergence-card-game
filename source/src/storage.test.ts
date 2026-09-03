import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSave, loadGame, saveGame } from "./storage";
import { createInitialGame } from "./engine/game";
import { cards, relics } from "./data/cards";
import type { GameState } from "./engine/types";
import { spawnTestMinion } from "./engine/test-utils";

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

const SAVE_KEY = "convergence.save.v27";
const LEGACY_SAVE_KEY = "convergence.save.v26";

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
    storage.values.set(LEGACY_SAVE_KEY, JSON.stringify({ version: 26, game: liveDuel(), events: [], mode: { kind: "hotseat" }, savedAt: 1 }));
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

describe("the v26 migration", () => {
  it("hands back an effect parked by the retired copy-and-trigger", () => {
    // A v26 save could be written mid-copy: the minion wearing a borrowed effect
    // with its own parked in `copyRestoreEffectId`. That field and the effect
    // that set it are both gone now, so nothing in this build would ever put the
    // real one back and the minion would keep somebody else's power for the rest
    // of the duel.
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });

    const midCopy = liveDuel();
    const board = [...midCopy.players[0].board];
    board[0] = {
      ...spawnTestMinion(cards.find((card) => card.name === "All for One")!, 0),
      // Wearing a borrowed Battlecry, with its own effect parked behind it.
      effectId: "aoe_damage_3",
      copyRestoreEffectId: "copy_all_enemy_passives",
    } as GameState["players"][number]["board"][number];
    midCopy.players[0] = { ...midCopy.players[0], board: board as GameState["players"][number]["board"] };

    storage.values.set(
      LEGACY_SAVE_KEY,
      JSON.stringify({ version: 26, game: midCopy, events: [], mode: { kind: "hotseat" }, savedAt: 1 }),
    );

    const minion = loadGame()?.game.players[0].board[0];
    expect(minion?.effectId).toBe("copy_all_enemy_passives");
    expect((minion as { copyRestoreEffectId?: unknown } | null | undefined)?.copyRestoreEffectId).toBeUndefined();
  });
});
