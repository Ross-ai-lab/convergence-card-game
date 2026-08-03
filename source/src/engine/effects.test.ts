import { describe, expect, it } from "vitest";
import { cards } from "../data/cards";
import { applyAction, createInitialGame, makeCardLibrary } from "./game";
import type { GameState, MinionInstance, PlayerId } from "./types";
import { spawnTestMinion } from "./test-utils";

const library = makeCardLibrary(cards);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function makeMinion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(library[cardId(name)], owner, overrides);
}
/**
 * Plays a card from hand into a slot, ignoring mana — how a Battlecry fires.
 * (Most effects moved from Ongoing to Battlecry, so cycling turns no longer
 * triggers them.)
 */
function playCardFor(state: GameState, player: PlayerId, name: string, slotIndex = 0): GameState {
  const next: GameState = { ...state, cheatMode: true, activePlayer: player, phase: "main", drawChoice: null };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [cardId(name)] };
  return applyAction(next, { type: "play_card", player, handIndex: 0, slotIndex }, library).state;
}

function mainState(): GameState {
  const state = createInitialGame(cards);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function attack(state: GameState, attackerSlot: number, targetSlot: number) {
  return applyAction(state, { type: "attack_minion", player: 0, attackerSlot, targetSlot }, library).state;
}

describe("full-roster effects", () => {
  it("Korosensei (mid_attack_only): ignores ATK < 4, takes ATK >= 4", () => {
    const weak = mainState();
    weak.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    weak.players[1].board[0] = makeMinion("Korosensei", 1);
    // Read off the printed card rather than a literal — his body moved in the
    // balance pass and the rule under test is the damage threshold, not his HP.
    const printedHp = cards.find((card) => card.name === "Korosensei")!.hp;
    const afterWeak = attack(weak, 0, 0);
    expect(afterWeak.players[1].board[0]?.hp).toBe(printedHp); // undamaged

    const strong = mainState();
    strong.players[0].board[0] = makeMinion("John Wick", 0, { atk: 4, hp: 20, maxHp: 20 });
    strong.players[1].board[0] = makeMinion("Korosensei", 1);
    const afterStrong = attack(strong, 0, 0);
    expect(afterStrong.players[1].board[0]?.hp).toBe(printedHp - 4);
  });

  it("Gordon Freeman (invuln_if_alone): untouchable alone, vulnerable with an ally", () => {
    const alone = mainState();
    alone.players[0].board[0] = makeMinion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20 });
    alone.players[1].board[0] = makeMinion("Gordon Freeman", 1);
    expect(attack(alone, 0, 0).players[1].board[0]?.hp).toBe(4); // blocked

    const paired = mainState();
    paired.players[0].board[0] = makeMinion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20 });
    paired.players[1].board[0] = makeMinion("Gordon Freeman", 1);
    paired.players[1].board[1] = makeMinion("John Wick", 1);
    expect(attack(paired, 0, 0).players[1].board[0]).toBeNull(); // 4 hp - 5 dmg
  });

  it("King (freeze_attacker): the attacker is frozen after striking it", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("King", 1);
    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]?.frozen).toBe(true);
  });

  it("Zoro (on_kill_buff_1): grows +1/+1 after a kill", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Zoro", 0, { atk: 5 });
    state.players[1].board[0] = makeMinion("John Wick", 1);
    const zoro = attack(state, 0, 0).players[0].board[0];
    expect(zoro?.atk).toBe(6);
    expect(zoro?.maxHp).toBe(4);
  });

  it("RoboCop (robocop_evil_bonus): triples damage into Evil", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("RoboCop", 0, { atk: 2, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Wall of Flesh", 1); // 3/5 Evil
    expect(attack(state, 0, 0).players[1].board[0]).toBeNull(); // 2 * 3 = 6 > 5
  });

  it("Nulgath (any_death_buff_2_2): grows whenever a minion dies", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Nulgath", 0);
    state.players[0].board[1] = makeMinion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("John Wick", 1);
    // Read the growth off the state, never off a literal. This test asserted
    // `atk === 3` and broke the moment pass 5 changed the buff, which reads
    // exactly like a real regression and is not one — the rule under test is
    // "one death makes it grow", not the size of one particular pass's number.
    const before = state.players[0].board[0]!;
    const after = attack(state, 1, 0); // slot-1 attacker kills the enemy
    const grown = after.players[0].board[0]!;
    expect(grown.atk).toBeGreaterThan(before.atk);
    expect(grown.maxHp).toBeGreaterThan(before.maxHp);
  });

  it("Homelander (alone_buff_5, onPlay): +5/+5 when played alone", () => {
    const state = mainState();
    state.players[0].hand = [cardId("Homelander")];
    state.players[0].mana = 10;
    const printed = cards.find((card) => card.name === "Homelander")!;
    const after = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library).state;
    // Read the base off the card — the rule under test is the +5/+5, not his body.
    expect(after.players[0].board[0]?.atk).toBe(printed.atk + 5);
    expect(after.players[0].board[0]?.maxHp).toBe(printed.hp + 5);
  });

  // --- ongoing effects fire at the start of the owner's turn ---
  function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
    let next = applyAction(state, { type: "end_turn", player }, library).state;
    if (next.phase === "drawChoice" && next.drawChoice) {
      next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
    }
    return next;
  }
  const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

  it("ongoing buff (Flowey buff_all_evil_1) rallies Evil allies", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Flowey", 0);
    state.players[0].board[1] = makeMinion("Wall of Flesh", 0); // 3/5 Evil
    expect(toMyNextTurn(state).players[0].board[1]?.atk).toBe(4);
  });

  it("ongoing self-buff (Mob Psycho self_buff_2)", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    // `+2 on the printed body`, not the literal 8 — his body changed in pass 5
    // and the old assertion failed on a completely correct engine.
    const base = state.players[0].board[0]!.atk;
    expect(toMyNextTurn(state).players[0].board[0]?.atk).toBe(base + 2);
  });

  it("Battlecry silence (Aizawa silence_enemy) disables an enemy on arrival", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Death Star", 1);
    expect(playCardFor(state, 0, "Aizawa", 0).players[1].board[0]?.silenced).toBe(true);
  });
});
