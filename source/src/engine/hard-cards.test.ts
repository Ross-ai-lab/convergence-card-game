import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * The cards that used to be listed as "too hard for this engine". Each test
 * pins the mechanic the card needed, not just the card.
 */
const minionLibrary = makeCardLibrary(cards);
const library = makeCardLibrary(cards, relics);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function makeMinion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(minionLibrary[cardId(name)], owner, overrides);
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

  it("Darkwing also kills a defender when it dies on retaliation", () => {
    const state = mainState("darkwing-attacker");
    state.players[0].board[0] = makeMinion("Darkwing", 0, { atk: 2, sleeping: false, hp: 1, maxHp: 1 });
    state.players[1].board[0] = dummy("Zoro", 1, { atk: 1, hp: 10, maxHp: 10, sleeping: false });

    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[1].board[0]).toBeNull();
  });

  it("APR locks the attacking minion for exactly two of its turns", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99 });
    state.players[1].board[0] = makeMinion("APR", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    const attacker = after.players[0].board[0];
    expect(attacker?.attackLocked).toBe(true);
    expect(attacker?.attackLockedUntilTurn).toBe(after.turnNumber + 6);

    // And that really removes it from the legal-move list while the lock is
    // active. Reset the spent swing so this assertion tests APR, not the normal
    // once-per-turn attack limit.
    const fresh = { ...after, activePlayer: 0 as PlayerId };
    fresh.players[0].board[0]!.attacksUsed = 0;
    expect(getLegalActions(fresh, library).some((action) => action.type === "attack_minion")).toBe(false);

    // turnNumber advances once per player's turn. APR therefore skips the
    // attacker's next two owner turns and releases it on the third.
    let released = fresh;
    for (const player of [0, 1, 0, 1, 0, 1] as PlayerId[]) {
      released = endTurnAndDraw(released, player);
    }
    expect(released.players[0].board[0]?.attackLocked).toBe(false);
    expect(getLegalActions(released, library)).toContainEqual({
      type: "attack_minion",
      player: 0,
      attackerSlot: 0,
      targetSlot: 0,
    });
  });

  it("Mahoraga refuses a second swing from the same attacker", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99, effectId: "attack_2x" });
    state.players[1].board[0] = makeMinion("Mahoraga", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.attackedBy).toHaveLength(1);
    const second = { ...after, activePlayer: 0 as PlayerId };
    second.players[0].board[0]!.attacksUsed = 0;
    expect(getLegalActions(second, library).some((action) => action.type === "attack_minion")).toBe(false);
  });

  it("Doomsday adapts to the Camp that hit it", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Mob Psycho", 0, { atk: 1, hp: 99, maxHp: 99 }); // Magic
    state.players[1].board[0] = makeMinion("Doomsday", 1, { hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.campImmunity?.camp).toBe("Magic");
    const hpAfterFirst = after.players[1].board[0]!.hp;
    expect(after.players[1].board[0]?.campImmunity?.untilTurn).toBe(after.turnNumber + 8);
    const nextEnemyTurn = endTurnAndDraw(endTurnAndDraw(after, 0), 1);
    expect(getLegalActions(nextEnemyTurn, library)).toContainEqual({
      type: "attack_minion",
      player: 0,
      attackerSlot: 0,
      targetSlot: 0,
    });
    const firstBlocked = attack(nextEnemyTurn, 0, 0);
    expect(firstBlocked.players[1].board[0]?.hp).toBe(hpAfterFirst);

    const followingEnemyTurn = endTurnAndDraw(endTurnAndDraw(firstBlocked, 0), 1);
    const secondBlocked = attack(followingEnemyTurn, 0, 0);
    expect(secondBlocked.players[1].board[0]?.hp).toBe(hpAfterFirst);

    const thirdEnemyTurn = endTurnAndDraw(endTurnAndDraw(secondBlocked, 0), 1);
    const thirdBlocked = attack(thirdEnemyTurn, 0, 0);
    expect(thirdBlocked.players[1].board[0]?.hp).toBe(hpAfterFirst);

    const immunityExpired = endTurnAndDraw(endTurnAndDraw(thirdBlocked, 0), 1);
    const landed = attack(immunityExpired, 0, 0);
    expect(landed.players[1].board[0]?.hp).toBe(hpAfterFirst - 1);
  });

  it("Kojiro Sasaki gives other friendly minions 33% evasion", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99 });
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 10, maxHp: 10 });
    state.players[1].board[1] = makeMinion("Kojiro Sasaki", 1);
    state.rngSeed = 1;
    const evaded = attack(state, 0, 0);
    expect(evaded.players[1].board[0]?.hp).toBe(10);

    const second = { ...evaded, activePlayer: 0 as PlayerId, rngSeed: 12345 };
    second.players[0].board[0]!.attacksUsed = 0;
    const landed = attack(second, 0, 0);
    expect(landed.players[1].board[0]?.hp).toBe(9);
  });

  it("Yoriichi sharpens the friendly minions that live through a fight", () => {
    const state = mainState();
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 1, hp: 99, maxHp: 99 });
    state.players[0].board[1] = makeMinion("Yoriichi Type Zero", 0);
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 1, hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]?.atk).toBe(2); // 1 + 1
    expect(after.players[0].board[0]?.maxHp).toBe(100); // 99 + 1
    expect(after.players[0].board[1]).toMatchObject({ atk: 2, maxHp: 2 }); // did not participate
  });

  it("Yoriichi also sharpens itself when it survives combat", () => {
    const state = mainState("yoriichi-self");
    state.players[0].board[0] = makeMinion("Yoriichi Type Zero", 0, { sleeping: false });
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 0, hp: 99, maxHp: 99 });

    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
  });
});

describe("hand-targeting cards", () => {
  it("Davy Jones steals exactly one Ascension Relic from the enemy hand", () => {
    const state = mainState();
    const relicId = relics[0].id;
    const secondRelicId = relics[1].id;
    const otherCardId = cardId("Zoro");
    state.players[1].hand = [relicId, secondRelicId, otherCardId];

    const asking = play(state, "Davy Jones");
    expect(asking.players[0].board[0]).toMatchObject({ name: "Davy Jones", atk: 1, hp: 1, keywords: [] });
    expect(asking.pendingTarget?.kind).toBe("hand");
    expect(asking.pendingTarget?.handOptions).toEqual([
      { owner: 1, index: 0, cardId: relicId },
      { owner: 1, index: 1, cardId: secondRelicId },
    ]);

    const stolen = applyAction(
      asking,
      { type: "choose_target", player: 0, choiceIndex: 0 },
      library,
    ).state;
    expect(stolen.players[1].hand).toEqual([secondRelicId, otherCardId]);
    expect(stolen.players[0].hand).toContain(relicId);
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

  it("Lelouch immediately gains control of any enemy minion", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 9, maxHp: 9 });

    const commanded = play(state, "Lelouch Lamperouge", 1);
    expect(commanded.players[1].board[0]).toBeNull();
    expect(commanded.players[0].board.some((minion) => minion?.name === "Death Star")).toBe(true);
  });

  it("Ten Commandments chains the first enemy minion to attack each turn", () => {
    const state = mainState();
    state.players[1].board[1] = makeMinion("Ten Commandments", 1);
    state.players[1].board[0] = dummy("Death Star", 1, { hp: 20, maxHp: 20 });
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 2, hp: 10, maxHp: 10 });
    const after = attack(state, 0, 0);
    expect(after.players[0].board[0]?.chained).toBe(2);
  });

  it("Ten Commandments chains the attacker without shielding it from the retaliation", () => {
    const state = mainState();
    state.players[1].board[1] = makeMinion("Ten Commandments", 1);
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 5, hp: 20, maxHp: 20 });
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 2, hp: 10, maxHp: 10 });

    const after = attack(state, 0, 0);

    // The chain used to be applied BEFORE the swing resolved, and a Chained
    // minion cannot be damaged — so attacking into Ten Commandments cost the
    // attacker nothing at all. It takes the full 5 now, and is still chained.
    expect(after.players[0].board[0]?.hp).toBe(5);
    expect(after.players[0].board[0]?.chained).toBe(2);
    expect(after.players[1].board[0]?.hp).toBe(18);
  });

  it("Doctor Octopus destroys a relic outright", () => {
    const state = mainState();
    const relic = relics.find((entry) => state.deck.includes(entry.id));
    if (!relic) throw new Error("No relic in test deck");
    const attached = { id: relic.id, relicId: relic.relicId, name: relic.name, effect: relic.effect, art: relic.art };
    state.players[1].board[0] = dummy("Death Star", 1, { relic: attached });

    const after = play(state, "Doctor Octopus", 1);
    expect(after.players[1].board[0]?.relic).toBeNull();
    expect(after.players[0].board[1]?.relic).toBeNull(); // destroyed, not taken
    expect(after.discard).toContain(relic.id);
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

  it("Kento Nanami sets the chosen enemy minion's HP to 1", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 0, hp: 10, maxHp: 10 });
    state.players[1].board[1] = dummy("John Wick", 1, { atk: 0, hp: 10, maxHp: 10 });

    const asking = play(state, "Kento Nanami", 0);
    expect(asking.pendingTarget?.kind).toBe("board");
    const choice = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const after = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: choice }, library).state;
    expect(after.players[1].board[0]?.hp).toBe(1);
  });

  it("Kuma bounces an ally home and discounts it by 5", () => {
    const state = mainState();
    state.players[0].board[1] = dummy("Death Star", 0);
    const deathStar = cardId("Death Star");
    const targetInstanceId = state.players[0].board[1]!.instanceId;

    const next: GameState = { ...state, cheatMode: true, players: [...state.players] as GameState["players"] };
    next.players[0] = { ...state.players[0], hand: [cardId("Kuma")] };
    const result = applyAction(next, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library);
    const after = result.state;
    expect(after.players[0].hand).toContain(deathStar);
    expect(after.players[0].costReductions[deathStar]).toBe(5);
    expect(result.events).toContainEqual(expect.objectContaining({ motion: "return", instanceId: targetInstanceId }));
  });
});

describe("choice-driven cards", () => {
  it("Doctor Manhattan permanently sets an enemy slot to 1/1", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("Death Star", 1, { atk: 9, hp: 9, maxHp: 9 });

    const asking = play(state, "Doctor Manhattan", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("slot");
    const targetIndex = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const set = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: targetIndex }, library).state;
    expect(set.players[1].board[0]?.atk).toBe(1);
    expect(set.players[1].board[0]?.hp).toBe(1);
  });

  it("John Wick gains +1/+1 when another friendly minion dies", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[0].board[1] = dummy("Zoro", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = dummy("Wall of Flesh", 1, { atk: 5, hp: 20, maxHp: 20 });

    const before = state.players[0].board[0]!;
    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 },
      library,
    ).state;

    expect(after.players[0].board[1]).toBeNull();
    expect(after.players[0].board[0]?.atk).toBe(before.atk + 1);
    expect(after.players[0].board[0]?.maxHp).toBe(before.maxHp + 1);
  });

  it("Indiana Jones discovers a relic and adds it to hand", () => {
    const state = mainState();
    const offered = state.deck.filter((cardId) => relics.some((relic) => relic.id === cardId)).slice(0, 3);

    const asking = play(state, "Indiana Jones", 0);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("option");
    expect(asking.pendingTarget?.labelOptions.map((option) => option.value)).toEqual(offered);

    const after = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: 0 }, library).state;
    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].board[0]?.relic).toBeNull();
    expect(after.players[0].hand).toContain(offered[0]);
    expect(after.deck).not.toContain(offered[0]);
  });
});
