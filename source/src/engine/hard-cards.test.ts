import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * The cards that used to be listed as "too hard for this engine". Each test
 * pins the mechanic the card needed, not just the card.
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

/** A stat-only body, so a fixture never trips over the card's own effect. */
function dummy(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return makeMinion(name, owner, { effectId: "none", effectTiming: "none", keywords: [], ...overrides });
}

function mainState(seed = "hard-cards"): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
  let next = applyAction(state, { type: "end_turn", player }, library).state;
  while (next.phase === "drawChoice" && next.drawChoice) {
    next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
  }
  return next;
}
const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

/** Plays a card from hand into slot 0, ignoring mana. */
function play(state: GameState, name: string, slotIndex = 0): GameState {
  const next = { ...state, cheatMode: true, players: [...state.players] } as GameState;
  next.players[0] = { ...state.players[0], hand: [cardId(name)] };
  return applyAction(next, { type: "play_card", player: 0, handIndex: 0, slotIndex }, library).state;
}

const attack = (state: GameState, attackerSlot: number, targetSlot: number) =>
  applyAction(state, { type: "attack_minion", player: 0, attackerSlot, targetSlot }, library).state;

describe("combat-reaction cards", () => {
  it("Darkwing drags its killer down with it", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 99, hp: 99, maxHp: 99 });
    state.players[1].board[0] = makeMinion("Darkwing", 1, { hp: 1, maxHp: 1 });

    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toBeNull(); // the killer went too
  });

  it("APR ends the attacking minion's war for good", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99 });
    state.players[1].board[0] = makeMinion("APR", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    const attacker = after.players[0].board[0];
    expect(attacker?.attackLocked).toBe(true);
    // And that really removes it from the legal-move list.
    const fresh = { ...after, activePlayer: 0 as PlayerId };
    fresh.players[0].board[0]!.attacksUsed = 0;
    expect(getLegalActions(fresh, library).some((action) => action.type === "attack_minion")).toBe(false);
  });

  it("Mahoraga refuses a second swing from the same attacker", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99, effectId: "double_attack" });
    state.players[1].board[0] = makeMinion("Mahoraga", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.attackedBy).toHaveLength(1);
    const second = { ...after, activePlayer: 0 as PlayerId };
    expect(getLegalActions(second, library).some((action) => action.type === "attack_minion")).toBe(false);
  });

  it("Doomsday adapts to the Camp that hit it", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Mob Psycho", 0, { atk: 1, hp: 99, maxHp: 99 }); // Magic
    state.players[1].board[0] = makeMinion("Doomsday", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.campImmunity?.camp).toBe("Magic");
    const hpAfterFirst = after.players[1].board[0]!.hp;
    const second = attack({ ...after, activePlayer: 0 as PlayerId }, 0, 0);
    expect(second.players[1].board[0]?.hp).toBe(hpAfterFirst); // the second blow bounces
  });

  it("Kojiro Sasaki soaks the attacks aimed at his allies", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1 });
    state.players[1].board[0] = dummy("Death Star", 1);
    state.players[1].board[1] = makeMinion("Kojiro Sasaki", 1);

    const targets = getLegalActions(state, library)
      .filter((action) => action.type === "attack_minion")
      .map((action) => (action.type === "attack_minion" ? action.targetSlot : -1));
    expect(targets).toEqual([1]); // only Kojiro may be hit
  });

  it("Yoriichi sharpens the friendly minions that live through a fight", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99 });
    state.players[0].board[1] = makeMinion("Yoriichi Type Zero", 0);
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 1, hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]?.atk).toBe(3); // 1 + 2
    expect(after.players[0].board[0]?.maxHp).toBe(100); // 99 + 1
  });
});

describe("control and theft cards", () => {
  it("Illumi takes a wounded enemy for himself", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 2, maxHp: 9 });

    const after = play(state, "Illumi", 1);
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board.some((minion) => minion?.name === "Death Star")).toBe(true);
  });

  it("Lelouch's command lands a turn later, not immediately", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 3, maxHp: 9 });

    const commanded = play(state, "Lelouch Lamperouge", 1);
    expect(commanded.players[1].board[0]).not.toBeNull(); // still theirs for now
    expect(commanded.players[0].pendingControl).not.toBeNull();

    const later = toMyNextTurn(commanded);
    expect(later.players[1].board[0]).toBeNull();
    expect(later.players[0].board.some((minion) => minion?.name === "Death Star")).toBe(true);
  });

  it("Ten Commandments strips a relic off an enemy and wears it", () => {
    const state = mainState();
    const relic = state.relicPool[0];
    state.players[1].board[0] = dummy("Death Star", 1, { relic });

    const after = play(state, "Ten Commandments", 1);
    expect(after.players[1].board[0]?.relic).toBeNull();
    expect(after.players[0].board[1]?.relic?.id).toBe(relic.id);
  });

  it("Doctor Octopus destroys a relic outright", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { relic: state.relicPool[0] });

    const after = play(state, "Doctor Octopus", 1);
    expect(after.players[1].board[0]?.relic).toBeNull();
    expect(after.players[0].board[1]?.relic).toBeNull(); // destroyed, not taken
  });

  it("Chrollo takes a passive and gives it back when he dies", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Mahoraga", 1); // passive: attack_once_ever

    const stolen = play(state, "Chrollo", 1);
    expect(stolen.players[0].board[1]?.effectId).toBe("attack_once_ever");
    expect(stolen.players[1].board[0]?.effectId).toBe("none");

    // Kill Chrollo — the enemy has to do it, he is on our board — and the
    // passive goes home to Mahoraga.
    const armed = { ...stolen, activePlayer: 1 as PlayerId };
    armed.players[1].board[1] = dummy("Zoro", 1, { atk: 99 });
    const dead = applyAction(
      armed,
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 1 },
      library,
    ).state;
    expect(dead.players[0].board[1]).toBeNull(); // Chrollo is gone
    expect(dead.players[1].board[0]?.effectId).toBe("attack_once_ever");
  });

  it("Kento Nanami collects +2/+2 when his mark dies", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 1, maxHp: 1 });

    const marked = play(state, "Kento Nanami", 0);
    expect(marked.players[1].board[0]?.markedBy).toBeTruthy();

    marked.players[0].board[1] = dummy("Zoro", 0, { atk: 99 });
    const collected = attack({ ...marked, activePlayer: 0 as PlayerId }, 1, 0);
    expect(collected.players[0].board[0]?.atk).toBe(4); // Nanami is a 2/2
  });

  it("Kuma bounces an ally home and discounts it by 5", () => {
    const state = mainState();
    state.players[0].board[1] = dummy("Death Star", 0);
    const deathStar = cardId("Death Star");

    const after = play(state, "Kuma", 0);
    expect(after.players[0].hand).toContain(deathStar);
    expect(after.players[0].costReductions[deathStar]).toBe(5);
  });
});

describe("choice-driven cards", () => {
  it("Doctor Manhattan asks for a minion, then a value", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 9, hp: 9, maxHp: 9 });

    const asking = play(state, "Doctor Manhattan", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("board");
    const targetIndex = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const values = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: targetIndex }, library).state;
    expect(values.pendingTarget?.kind).toBe("option");
    expect(values.pendingTarget?.labelOptions).toHaveLength(5);

    const set = applyAction(values, { type: "choose_target", player: 0, choiceIndex: 2 }, library).state;
    expect(set.players[1].board[0]?.atk).toBe(3);
    expect(set.players[1].board[0]?.hp).toBe(3);
  });

  it("The Nameless King re-aligns the whole board to the chosen side", () => {
    const state = mainState();
    state.players[0].board[1] = dummy("Death Star", 0, { alignment: "Evil" });

    const asking = play(state, "The Nameless King", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("option");

    const index = asking.pendingTarget!.labelOptions.findIndex((option) => option.value === "Good");
    const shifted = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: index }, library).state;
    expect(shifted.players[0].board.every((minion) => !minion || minion.alignment === "Good")).toBe(true);
  });

  it("John Wick names a card in the enemy hand and burns it if unplayed", () => {
    const state = mainState();
    state.players[1].hand = [cardId("Death Star"), cardId("Zoro")];

    const asking = play(state, "John Wick", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("hand");
    // The enemy also drew during the turn cycle, so the hand is at least the two
    // cards we planted — every one of them is on offer.
    expect(asking.pendingTarget!.handOptions.length).toBe(asking.players[1].hand.length);

    const index = asking.pendingTarget!.handOptions.findIndex((option) => option.cardId === cardId("Death Star"));
    const named = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: index }, library).state;
    expect(named.players[1].pressured?.cardId).toBe(cardId("Death Star"));

    // They get one full turn with it. (As a Battlecry he names one card, once —
    // he no longer re-marks a fresh one every turn.)
    const theirTurn = endTurnAndDraw(named, 0); // their chance to play it
    expect(theirTurn.players[1].hand).toContain(cardId("Death Star"));

    const ignored = endTurnAndDraw(endTurnAndDraw(theirTurn, 1), 0); // they ignored it
    expect(ignored.players[1].hand).not.toContain(cardId("Death Star"));
    expect(ignored.discard).toContain(cardId("Death Star"));
  });

  it("Joker chooses two cards, then chooses which one to shuffle away", () => {
    const state = mainState();
    state.players[1].hand = [cardId("Death Star"), cardId("Zoro")];

    const asking = play(state, "Joker", 0);
    expect(asking.pendingTarget?.kind).toBe("hand");

    const firstIndex = asking.pendingTarget!.handOptions.findIndex((option) => option.cardId === cardId("Zoro"));
    const deciding = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: firstIndex }, library).state;
    expect(deciding.pendingTarget?.step).toBe(2);
    expect(deciding.pendingTarget?.handOptions).toHaveLength(2);
    const shuffleIndex = deciding.pendingTarget!.handOptions.findIndex((option) => option.cardId === cardId("Zoro"));
    const shuffled = applyAction(deciding, { type: "choose_target", player: 0, choiceIndex: shuffleIndex }, library).state;
    expect(shuffled.players[1].hand).not.toContain(cardId("Zoro"));
    expect(shuffled.bottomDeck).toContain(cardId("Zoro"));
  });
});
