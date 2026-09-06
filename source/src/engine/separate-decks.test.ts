import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { CAMPAIGN_STARTER_DECK, CAMPAIGN_DIFFICULTIES } from "../campaign";
import { createCampaignDuel } from "../campaign-duel";
import { applyAction, createInitialGame, getLegalActions, hasForesight, makeCardLibrary } from "./game";
import { botCheatsFor, chooseBotAction, clairvoyanceEdge } from "./bot";
import { drawPileFor, remainingDeckCards, remainingDeckCount } from "./draw-piles";
import { spawnTestMinion } from "./test-utils";
import { isMinionCard, type GameAction, type GameState, type PlayerId } from "./types";

const library = makeCardLibrary(cards, relics);
const fair = CAMPAIGN_DIFFICULTIES.ascendantFair.cheats;
const full = CAMPAIGN_DIFFICULTIES.ascendant.cheats;
function fresh(seed = "separate") {
  return createInitialGame(cards, seed, relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK] });
}
function main() {
  const state = fresh();
  state.phase = "main"; state.mulligan = null; state.cheatMode = true;
  for (const player of state.players) {
    player.hand = []; player.mana = 10; player.maxMana = 10;
    state.playerDecks![player.id] = { deck: [], bottomDeck: [] };
  }
  return state;
}
function act(state: GameState, action: GameAction) {
  expect(getLegalActions(state, library)).toContainEqual(action);
  return applyAction(state, action, library).state;
}
function play(state: GameState, id: string, seat: PlayerId = 0, slot = 0) {
  state.activePlayer = seat; state.players[seat].hand.push(id);
  return act(state, { type: "play_card", player: seat, handIndex: state.players[seat].hand.length - 1, slotIndex: slot });
}
function resolveChoices(state: GameState) {
  for (let n = 0; state.phase === "targeting" && n < 8; n++) {
    const choice = getLegalActions(state, library).find((action) => action.type === "choose_target");
    expect(choice).toBeDefined(); state = act(state, choice!);
  }
  expect(state.phase).not.toBe("targeting"); return state;
}
function body(id: string, owner: PlayerId) {
  const card = library[id]; if (!isMinionCard(card)) throw new Error(id);
  return spawnTestMinion(card, owner, { originalOwner: owner });
}

describe("separate duel piles", () => {
  it("deals three from each unique 30-card list with independent repeatable shuffles", () => {
    const state = fresh();
    expect(state).toEqual(fresh());
    expect(state.players.map((p) => p.hand.length)).toEqual([3, 3]);
    expect(state.players[1].coins).toBe(1);
    for (const p of state.players) {
      expect(remainingDeckCount(state, p.id)).toBe(27);
      expect([...p.hand, ...remainingDeckCards(state, p.id)].sort()).toEqual([...CAMPAIGN_STARTER_DECK].sort());
    }
    expect(state.playerDecks![0]).not.toEqual(state.playerDecks![1]);
    expect(state.playerDecks).not.toEqual(fresh("other-seed").playerDecks);
    expect(state.deck).toEqual([]); expect(state.bottomDeck).toEqual([]);
  });

  it("rejects invalid setup decks and leaves input definitions untouched", () => {
    const snapshot = [...CAMPAIGN_STARTER_DECK]; fresh();
    expect(CAMPAIGN_STARTER_DECK).toEqual(snapshot);
    expect(() => createInitialGame(cards, "bad", relics, { decks: [snapshot.slice(1), snapshot] })).toThrow(/Invalid deck for player 0/);
    expect(() => createInitialGame(cards, "bad", relics, { decks: [snapshot, [...snapshot.slice(1), snapshot[1]]] })).toThrow(/duplicate-card/);
    expect(() => createInitialGame(cards, "bad", relics, { decks: [snapshot, [...snapshot.slice(1), "token:knight"]] })).toThrow(/unknown-card/);
  });

  it("mulligans into the same seat's deck without redrawing the rejected cards", () => {
    let state = fresh(); const before = structuredClone(state);
    const original = state.players[0].hand[0]; const next = remainingDeckCards(state, 0)[0];
    state = act(state, { type: "toggle_mulligan", player: 0, handIndex: 0 });
    state = act(state, { type: "confirm_mulligan", player: 0 });
    expect(state.players[0].hand).toContain(next); expect(state.players[0].hand).not.toContain(original);
    expect(state.playerDecks![0].bottomDeck).toEqual([original]);
    expect(state.playerDecks![1]).toEqual(before.playerDecks![1]);
    expect(before).toEqual(fresh());
  });

  it("draws the bottom in order and damages only the seat with no cards", () => {
    let state = main(); state.playerDecks![0].deck = ["c001"];
    state.playerDecks![1].bottomDeck = ["c004", "c006"];
    state = act(state, { type: "end_turn", player: 0 });
    expect(state.players[1].hand).toEqual(["c006"]);
    expect(remainingDeckCards(state, 1)).toEqual(["c004"]);
    state.playerDecks![1].bottomDeck = []; drawPileFor(state, 1).deck = []; state.activePlayer = 0;
    state = act(state, { type: "end_turn", player: 0 });
    expect(state.players[1].health).toBe(74); expect(state.players[1].fatigue).toBe(1);
    state.activePlayer = 0; state = act(state, { type: "end_turn", player: 0 });
    expect(state.players[1].health).toBe(72); expect(state.players[1].fatigue).toBe(2);
    expect(state.players[0].health).toBe(75); expect(state.playerDecks![0].deck).toEqual(["c001"]);
  });

  it("Nezu draws only its controller's copy even when both decks contain that ID", () => {
    let state = main(); state.playerDecks![0].deck = ["c004"]; state.playerDecks![1].deck = ["c004"];
    state = play(state, "c173"); expect(state.players[0].hand).toEqual(["c004"]);
    expect(state.playerDecks![1].deck).toEqual(["c004"]); expect(state.playerDecks![0].deck).toEqual([]);
  });

  it("empty direct draws apply fatigue; Blood Price also pays its printed health cost", () => {
    let state = main(); state.playerDecks![1].deck = ["c004"];
    state = play(state, "c173"); expect(state.players[0].health).toBe(74);
    state.heroPowers[0] = "core_trade_draw";
    state = act(state, { type: "use_hero_power", player: 0 });
    expect(state.players[0].health).toBe(70); expect(state.players[0].fatigue).toBe(2);
    expect(state.playerDecks![1].deck).toEqual(["c004"]);
  });

  it("burns a card into a full hand without touching the other pile", () => {
    let state = main(); state.players[1].hand = Array(10).fill("c004");
    state.playerDecks![1].deck = ["c006"]; state.playerDecks![0].deck = ["c001"];
    state = act(state, { type: "end_turn", player: 0 });
    expect(state.players[1].hand).toHaveLength(10); expect(state.discard).toContain("c006");
    expect(state.playerDecks![0].deck).toEqual(["c001"]); expect(state.players[1].fatigue).toBe(0);
  });
});

describe("separate-deck abilities", () => {
  it.each(["c159", "c017", "c160"])("%s finds a relic only in its own deck", (source) => {
    let state = main(); state.playerDecks![0].bottomDeck = ["r001"];
    state.playerDecks![1].deck = ["r009"];
    state = resolveChoices(play(state, source));
    expect(state.players[0].hand).toEqual(["r001"]); expect(remainingDeckCards(state, 0)).toEqual([]);
    expect(state.playerDecks![1].deck).toEqual(["r009"]);
  });

  it.each(["c159", "c017", "c160", "c054", "c162", "c167", "c061"])("%s never falls back to an enemy pile", (source) => {
    let state = main(); state.playerDecks![1].deck = ["r001", "c020", "c139"];
    state = resolveChoices(play(state, source));
    expect(state.players[0].hand).toEqual([]); expect(state.playerDecks![1].deck).toEqual(["r001", "c020", "c139"]);
    expect(state.players[0].board.filter(Boolean)).toHaveLength(1);
  });

  it.each(["c054", "c162", "c167"])("%s discovers and removes only a matching friendly-pile card", (source) => {
    let state = main(); state.playerDecks![0].deck = ["c140", "c103"];
    state.playerDecks![1].deck = ["c020", "c139"];
    state = resolveChoices(play(state, source));
    expect(state.players[0].hand).toHaveLength(1); expect(["c140", "c103"]).toContain(state.players[0].hand[0]);
    expect(remainingDeckCount(state, 0)).toBe(1); expect(state.playerDecks![1].deck).toEqual(["c020", "c139"]);
  });

  it("Chaos summons from its controller's pile", () => {
    let state = main(); state.playerDecks![0].deck = ["c004"]; state.playerDecks![1].deck = ["c020"];
    state = play(state, "c061"); expect(state.players[0].board.some((m) => m?.cardId === "c004")).toBe(true);
    expect(remainingDeckCards(state, 0)).toEqual([]); expect(state.playerDecks![1].deck).toEqual(["c020"]);
  });

  it("Gilgamesh and the Heroic Spirits equip relics from their controller's pile", () => {
    for (const id of ["c019", "c101"]) {
      let state = main(); state.players[0].board[1] = body("c004", 0);
      state.playerDecks![0].deck = ["r001"]; state.playerDecks![1].deck = ["r009"];
      state = play(state, id);
      expect(state.players[0].board.some((m) => m?.relic?.id === "r001")).toBe(true);
      expect(state.playerDecks![0].deck).toEqual([]); expect(state.playerDecks![1].deck).toEqual(["r009"]);
    }
  });

  it("Frieren discovers a friendly-pile relic after a relic is played", () => {
    let state = main(); state.players[0].board[0] = body("c184", 0);
    state.players[0].hand = ["r001"]; state.playerDecks![0].deck = ["r008"]; state.playerDecks![1].deck = ["r009"];
    state = resolveChoices(act(state, { type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 }));
    expect(state.players[0].hand).toEqual(["r008"]); expect(state.playerDecks![1].deck).toEqual(["r009"]);
  });

  it("Angstrom buries and replaces an enemy using the enemy deck, never the actor's", () => {
    let state = main(); state.players[1].board[0] = body("c004", 1);
    state.playerDecks![0].deck = ["c153"]; state.playerDecks![1].deck = ["c006"];
    state = resolveChoices(play(state, "c163"));
    expect(state.players[1].board[0]?.cardId).toBe("c006");
    expect(state.playerDecks![1].bottomDeck).toEqual(["c004"]); expect(state.playerDecks![0].deck).toEqual(["c153"]);
  });

  it("Angstrom cannot replace a target with itself when its deck has no candidate", () => {
    let state = main(); state.players[1].board[0] = body("c004", 1); state.playerDecks![0].deck = ["c006"];
    state = resolveChoices(play(state, "c163"));
    expect(state.players[1].board[0]).toBeNull(); expect(state.playerDecks![1].bottomDeck).toEqual(["c004"]);
  });

  it("cancelling a discovery leaves both piles intact, and replaying an action is exact", () => {
    const initial = main(); initial.players[0].hand = ["c159"];
    initial.playerDecks![0].deck = ["r001", "r008"]; initial.playerDecks![1].deck = ["r009"];
    const action: GameAction = { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 };
    const snapshot = structuredClone(initial); const pending = act(initial, action);
    expect(pending.phase).toBe("targeting");
    const cancelled = act(pending, { type: "cancel_target", player: 0 });
    expect(cancelled.playerDecks).toEqual(initial.playerDecks); expect(cancelled.players[0].hand).toEqual(["c159"]);
    expect(act(initial, action)).toEqual(pending); expect(initial).toEqual(snapshot);
  });

  it("Rick Prime returns a stolen minion to its original owner", () => {
    let state = main(); state.players[1].board[0] = body("c004", 1);
    state = resolveChoices(play(state, "c048"));
    const stolen = state.players[0].board.find((m) => m?.cardId === "c004")!;
    expect(stolen.owner).toBe(0); expect(stolen.originalOwner).toBe(1);
    state = play(state, "c045", 0, 2);
    expect(state.players[1].hand).toContain("c004"); expect(state.players[0].hand).not.toContain("c004");
  });

  it("resurrection keeps original ownership and consumes only the controller's death history", () => {
    let state = main(); state.players[0].board[0] = { ...body("c004", 0), hp: 1, originalOwner: 1 };
    state.players[1].deadMinions = ["c004"]; state.players[1].deadMinionOwners = [1]; state.discard = ["c004"];
    state = resolveChoices(play(state, "c139", 1));
    expect(state.players[0].deadMinions).toEqual(["c004"]);
    expect(state.players[0].deadMinionOwners).toEqual([1]);
    state = play(state, "c100", 0);
    const returned = state.players[0].board.find((minion) => minion?.cardId === "c004");
    expect(returned?.originalOwner).toBe(1); expect(returned?.owner).toBe(0);
    expect(state.players[0].deadMinions).toEqual([]); expect(state.players[0].deadMinionOwners).toEqual([]);
    expect(state.players[1].deadMinions).toEqual(["c004"]); expect(state.discard).toEqual(["c004"]);
  });

  it("Reborn preserves the original owner of a stolen minion", () => {
    let state = main(); state.players[0].board[0] = { ...body("c156", 0), hp: 1, originalOwner: 1 };
    state = resolveChoices(play(state, "c139", 1));
    expect(state.players[0].board[0]?.cardId).toBe("c156");
    expect(state.players[0].board[0]?.originalOwner).toBe(1);
  });

  it("the second seat's relic search cannot consume the first seat's relic", () => {
    let state = main(); state.playerDecks![0].deck = ["r001"]; state.playerDecks![1].deck = ["r009"];
    state = resolveChoices(play(state, "c159", 1));
    expect(state.players[1].hand).toEqual(["r009"]); expect(state.playerDecks![0].deck).toEqual(["r001"]);
  });

  it("Sir Nighteye reveals his controller's own top card", () => {
    const state = main(); state.players[0].board[0] = body("c166", 0);
    state.players[1].board[0] = body("c166", 1);
    state.playerDecks![0].deck = ["c004"]; state.playerDecks![1].deck = ["c006", "c020"];
    const result = applyAction(state, { type: "end_turn", player: 0 }, library);
    const revelations = result.events.filter((event) => event.text.includes("sees the top card"));
    expect(revelations.some((event) => event.player === 0 && event.text.includes("Bigfoot"))).toBe(true);
    expect(revelations.some((event) => event.player === 1 && event.text.includes("Superman"))).toBe(true);
  });
});

describe("campaign difficulty in the engine", () => {
  it.each([1,4,5,10,11,14,15,20])("chapter %i sets the fixed decks, power, identity and saved cheats", (chapter) => {
    const duel = createCampaignDuel({ chapter, cards, relics, playerDeck: CAMPAIGN_STARTER_DECK, unlockedCardIds: CAMPAIGN_STARTER_DECK, seed: "chapter" });
    expect(remainingDeckCount(duel.state, 0)).toBe(27); expect(remainingDeckCount(duel.state, 1)).toBe(27);
    expect(duel.state.heroPowers[1]).not.toBeNull(); expect(duel.state.players[1].name).not.toBe("Player Two");
    expect(botCheatsFor(duel.state, 1, duel.difficulty.botSkill)).toEqual(chapter >= 15 ? full : fair);
    expect(hasForesight(duel.state, 1)).toBe(chapter >= 15);
  });

  it("rejects a locked player card even if it is in the boss deck", () => {
    expect(() => createCampaignDuel({ chapter: 10, cards, relics, playerDeck: [...CAMPAIGN_STARTER_DECK.slice(0,29), "c084"], unlockedCardIds: CAMPAIGN_STARTER_DECK, seed: "locked" })).toThrow(/locked-card/);
  });

  it("full Ascendant chooses two of its own cards and returns the reject to its own bottom", () => {
    let state = main(); state.botCheats = [null, { ...full }]; state.playerDecks![0].deck = ["c020"];
    state.playerDecks![1].deck = ["c004", "c006"];
    state = act(state, { type: "end_turn", player: 0 });
    expect(state.drawChoice?.cards).toEqual(["c004", "c006"]);
    state = act(state, { type: "choose_draw", player: 1, choiceIndex: 0 });
    expect(state.players[1].hand).toEqual(["c004"]); expect(state.playerDecks![1].bottomDeck).toEqual(["c006"]);
    expect(state.playerDecks![0].deck).toEqual(["c020"]);
  });

  it("Foresight draws a lone card without extra fatigue; an empty pile fatigues once", () => {
    let state = main(); state.botCheats = [null, { ...full }]; state.playerDecks![1].deck = ["c004"];
    state = act(state, { type: "end_turn", player: 0 });
    expect(state.phase).toBe("main"); expect(state.players[1].hand).toEqual(["c004"]); expect(state.players[1].fatigue).toBe(0);
    state.activePlayer = 0; state = act(state, { type: "end_turn", player: 0 });
    expect(state.players[1].fatigue).toBe(1);
  });

  it("fair Ascendant overrides the legacy flag while Detective L remains a legitimate power", () => {
    const state = main(); state.foresightFor = 1; state.botCheats = [null, { ...fair }];
    expect(hasForesight(state, 1)).toBe(false); expect(botCheatsFor(state, 1, "hard")).toEqual(fair);
    state.players[1].board[0] = body("c003", 1); expect(hasForesight(state, 1)).toBe(true);
    state.players[1].board[0]!.silenced = true; expect(hasForesight(state, 1)).toBe(false);
  });

  it("Clairvoyance rates each seat's own future, includes bottom cards and never mutates", () => {
    const state = main(); state.activePlayer = 0; state.playerDecks![0].deck = ["c001"];
    state.playerDecks![1].bottomDeck = ["c178"];
    const snapshot = structuredClone(state); const high = clairvoyanceEdge(state, library, 1);
    const low = structuredClone(state); low.playerDecks![1].bottomDeck = ["c001"];
    expect(high).toBeGreaterThan(clairvoyanceEdge(low, library, 1)); expect(state).toEqual(snapshot);
    state.playerDecks![0].deck = []; expect(clairvoyanceEdge(state, library, 1)).toBeGreaterThan(0);
  });

  it("fair and full searches produce legal deterministic actions without altering state", () => {
    for (const cheats of [fair, full]) {
      const state = main(); state.activePlayer = 1; state.botCheats = [null, { ...cheats }];
      state.players[1].hand = ["c004", "c006"]; state.playerDecks![1].deck = ["c020"];
      const snapshot = structuredClone(state); const chosen = chooseBotAction(state, library, 1, "hard");
      expect(getLegalActions(state, library)).toContainEqual(chosen);
      expect(chooseBotAction(state, library, 1, "hard")).toEqual(chosen); expect(state).toEqual(snapshot);
    }
  });
});
