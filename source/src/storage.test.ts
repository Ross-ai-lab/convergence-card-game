import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSave, loadGame, saveGame } from "./storage";
import { createInitialGame } from "./engine/game";
import { cards, relics } from "./data/cards";
import type { GameState } from "./engine/types";
import { spawnTestMinion } from "./engine/test-utils";
import { CAMPAIGN_STARTER_DECK, CAMPAIGN_DIFFICULTIES } from "./campaign";
import { applyAction, makeCardLibrary } from "./engine/game";

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

const SAVE_KEY = "convergence.save.v28";
const LEGACY_SAVE_KEY = "convergence.save.v27";

function liveDuel(): GameState {
  const state = createInitialGame(cards, "storage-test", relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK] });
  return { ...state, phase: "main", mulligan: null, turnNumber: 4 };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the save slot", () => {
  it("round-trips separate piles, pending Foresight, ownership and campaign cheat flags", () => {
    vi.stubGlobal("window", { localStorage: memoryLocalStorage() });
    const game = createInitialGame(cards, "separate-save", relics, {
      decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK],
      botCheats: [null, CAMPAIGN_DIFFICULTIES.ascendant.cheats],
    });
    game.phase = "drawChoice"; game.mulligan = null; game.activePlayer = 1;
    game.drawChoice = { player: 1, cards: game.playerDecks![1].deck.splice(0, 2) };
    game.playerDecks![0].bottomDeck = [game.playerDecks![0].deck.pop()!];
    game.players[0].board[0] = spawnTestMinion(cards[0], 0, { originalOwner: 1 });
    saveGame(game, [], { kind: "bot", skill: "hard" }, 1_000);
    const restored = loadGame()!.game;
    expect(restored).toEqual(game);
    const choice = { type: "choose_draw" as const, player: 1 as const, choiceIndex: 0 };
    const library = makeCardLibrary(cards, relics);
    expect(applyAction(restored, choice, library)).toEqual(applyAction(game, choice, library));
  });

  it.each([
    { playerDecks: [] },
    { playerDecks: [{ deck: [], bottomDeck: [] }, { deck: [3], bottomDeck: [] }] },
    { playerDecks: [null, null] },
    { playerDecks: [{ deck: [], bottomDeck: [] }, { deck: [], bottomDeck: [] }], deck: ["c001"] },
    { botCheats: [{}, null] },
    { botCheats: [null, { trueDice: true, readsYourReply: false, clairvoyance: false, foresight: "yes" }] },
  ])("rejects malformed optional separate-deck state %#", (corruption) => {
    const storage = memoryLocalStorage(); vi.stubGlobal("window", { localStorage: storage });
    saveGame(liveDuel(), [], { kind: "bot", skill: "hard" }, 1_000);
    const saved = JSON.parse(storage.values.get(SAVE_KEY)!);
    Object.assign(saved.game, corruption); storage.values.set(SAVE_KEY, JSON.stringify(saved));
    expect(loadGame()).toBeNull();
  });
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
  it("resets pre-campaign saves instead of migrating them", () => {
    const storage = memoryLocalStorage(); vi.stubGlobal("window", { localStorage: storage });
    storage.values.set(LEGACY_SAVE_KEY, JSON.stringify({ version: 27, game: liveDuel(), events: [], mode: { kind: "hotseat" }, savedAt: 1 }));
    expect(loadGame()).toBeNull(); expect(storage.values.has(LEGACY_SAVE_KEY)).toBe(false);
  });
});
