import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * The last two systems: marks laid on board POSITIONS, and swings that go
 * somewhere other than where they were aimed.
 */
const library = makeCardLibrary(cards);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function makeMinion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(library[cardId(name)], owner, overrides);
}

function dummy(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return makeMinion(name, owner, { effectId: "none", effectTiming: "none", keywords: [], ...overrides });
}

function mainState(seed = "slot-auras"): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function playCardFor(state: GameState, player: PlayerId, name: string, slotIndex = 0): GameState {
  const next: GameState = { ...state, cheatMode: true, activePlayer: player, phase: "main", drawChoice: null };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [cardId(name)] };
  return applyAction(next, { type: "play_card", player, handIndex: 0, slotIndex }, library).state;
}

function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
  let next = applyAction(state, { type: "end_turn", player }, library).state;
  while (next.phase === "drawChoice" && next.drawChoice) {
    next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
  }
  return next;
}
const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

/** Answers a pending slot prompt by naming a board position. */
function chooseSlot(state: GameState, owner: PlayerId, slot: number): GameState {
  const index = state.pendingTarget!.options.findIndex((option) => option.owner === owner && option.slot === slot);
  expect(index).toBeGreaterThanOrEqual(0);
  return applyAction(state, { type: "choose_target", player: state.pendingTarget!.player, choiceIndex: index }, library).state;
}

describe("slot auras", () => {
  it("offers every position, empty ones included", () => {
    const state = mainState();
    const asking = playCardFor(state, 0, "Giorno - Gold Experience Requiem", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("slot");
    // All five enemy slots, none of them occupied.
    expect(asking.pendingTarget?.options).toEqual([0, 1, 2, 3, 4].map((slot) => ({ owner: 1, slot })));
  });

  it("Giorno silences whoever is standing there, and whoever arrives later", () => {
    const state = mainState();
    state.players[1].board[2] = dummy("Zoro", 1);

    const asking = playCardFor(state, 0, "Giorno - Gold Experience Requiem", 0);
    const marked = chooseSlot(asking, 1, 2);
    expect(marked.players[1].slotAuras).toEqual([{ slot: 2, auraId: "slot_silence", sourceName: "Giorno - Gold Experience Requiem" }]);
    expect(marked.players[1].board[2]?.silenced).toBe(true);

    // A fresh minion walking into the cursed slot is silenced on arrival.
    marked.players[1].board[2] = null;
    const arrived = playCardFor(marked, 1, "Mob Psycho", 2);
    expect(arrived.players[1].board[2]?.silenced).toBe(true);
  });

  it("outlives the minion that laid it — the whole point", () => {
    const state = mainState();
    state.players[1].board[1] = dummy("Zoro", 1);

    const asking = playCardFor(state, 0, "Giorno - Gold Experience Requiem", 0);
    const marked = chooseSlot(asking, 1, 1);
    expect(marked.players[0].board[0]?.name).toContain("Giorno");

    // Kill Giorno outright; the mark must stay.
    const armed = { ...marked, activePlayer: 1 as PlayerId };
    armed.players[1].board[3] = dummy("Zoro", 1, { atk: 99 });
    const dead = applyAction(armed, { type: "attack_minion", player: 1, attackerSlot: 3, targetSlot: 0 }, library).state;
    expect(dead.players[0].board[0]).toBeNull(); // Giorno is gone
    expect(dead.players[1].slotAuras).toHaveLength(1); // the mark is not

    dead.players[1].board[1] = null;
    const arrived = playCardFor(dead, 1, "Mob Psycho", 1);
    expect(arrived.players[1].board[1]?.silenced).toBe(true);
  });

  it("Goku's blessing feeds whoever stands in the slot, every turn", () => {
    const state = mainState();
    const asking = playCardFor(state, 0, "Mastered Ultra Instinct Goku", 0);
    expect(asking.pendingTarget?.options.every((option) => option.owner === 0)).toBe(true);
    const blessed = chooseSlot(asking, 0, 3);
    expect(blessed.players[0].slotAuras[0]).toMatchObject({ slot: 3, auraId: "slot_grow_2" });

    blessed.players[0].board[3] = dummy("Zoro", 0); // a 3/3
    const grown = toMyNextTurn(blessed);
    expect(grown.players[0].board[3]?.atk).toBe(5);
    expect(grown.players[0].board[3]?.maxHp).toBe(5);
  });

  it("an empty blessed slot simply does nothing", () => {
    const state = mainState();
    const asking = playCardFor(state, 0, "Mastered Ultra Instinct Goku", 0);
    const blessed = chooseSlot(asking, 0, 4);
    expect(() => toMyNextTurn(blessed)).not.toThrow();
    expect(toMyNextTurn(blessed).players[0].board[4]).toBeNull();
  });
});

describe("forced-random attacks", () => {
  it("Bill Cipher's slot sends its occupant somewhere it did not aim", () => {
    const state = mainState("bill-cypher");
    const asking = playCardFor(state, 0, "Bill Cipher", 0);
    const cursed = chooseSlot(asking, 1, 0);
    expect(cursed.players[1].slotAuras[0]).toMatchObject({ slot: 0, auraId: "random_attacks" });

    // The cursed slot's occupant swings at player 0; every enemy is a candidate.
    cursed.players[1].board[0] = dummy("Zoro", 1, { atk: 1 });
    cursed.players[0].board[1] = dummy("Death Star", 0, { hp: 30, maxHp: 30 });
    cursed.players[0].board[2] = dummy("Fort", 0, { hp: 30, maxHp: 30 });
    const swinging = { ...cursed, activePlayer: 1 as PlayerId };

    const after = applyAction(swinging, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 }, library);
    expect(after.events.some((event) => event.text.includes("swings blindly"))).toBe(true);
    const hurt = after.state.players[0].board.filter((minion) => minion && minion.hp < minion.maxHp);
    expect(hurt).toHaveLength(1); // exactly one victim, not necessarily the named one
  });

  it("Sans blinds the enemy board for a turn, then it clears", () => {
    const state = mainState("sans");
    state.players[1].board[0] = dummy("Zoro", 1, { atk: 1 });

    const cast = playCardFor(state, 0, "Sans", 0);
    expect(cast.players[1].confusedUntilTurn).toBeGreaterThan(cast.turnNumber);

    const theirTurn = endTurnAndDraw(cast, 0);
    const swing = applyAction(theirTurn, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library);
    expect(swing.events.some((event) => event.text.includes("swings blindly"))).toBe(true);

    // Two turns later the fog is gone.
    const later = endTurnAndDraw(endTurnAndDraw(swing.state, 1), 0);
    expect(later.players[1].confusedUntilTurn! > later.turnNumber).toBe(false);
  });

  it("Kurogiri fogs BOTH boards while it lives, and only while it lives", () => {
    const state = mainState("kurogiri");
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1 });
    state.players[1].board[0] = makeMinion("Kurogiri", 1, { hp: 1, maxHp: 1 });
    state.players[1].board[1] = dummy("Death Star", 1, { hp: 30, maxHp: 30 });

    const blind = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }, library);
    expect(blind.events.some((event) => event.text.includes("swings blindly"))).toBe(true);

    // Silence it and the fog lifts.
    const clear = { ...state };
    clear.players[1].board[0] = makeMinion("Kurogiri", 1, { hp: 1, maxHp: 1, silenced: true });
    const aimed = applyAction(clear, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }, library);
    expect(aimed.events.some((event) => event.text.includes("swings blindly"))).toBe(false);
  });

  it("a blind swing still respects Taunt rather than bypassing it", () => {
    const state = mainState("blind-taunt");
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1 });
    state.players[1].board[0] = makeMinion("Kurogiri", 1, { hp: 30, maxHp: 30 });
    state.players[1].board[1] = dummy("Death Star", 1, { hp: 30, maxHp: 30, keywords: ["Taunt"] });
    state.players[1].board[2] = dummy("Fort", 1, { hp: 30, maxHp: 30 });

    const legal = getLegalActions(state, library).filter((action) => action.type === "attack_minion");
    expect(legal).toHaveLength(1); // only the Taunt is offered

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(after.players[1].board[1]!.hp).toBeLessThan(30); // the roll had one legal answer
    expect(after.players[1].board[2]!.hp).toBe(30);
  });
});
