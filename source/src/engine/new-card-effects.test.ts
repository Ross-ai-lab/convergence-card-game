import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

const library = makeCardLibrary(cards, relics);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function minion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return spawnTestMinion(card, owner, overrides);
}

function mainState(seed = "new-card-effects"): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  state.cheatMode = true;
  return state;
}

function play(state: GameState, player: PlayerId, name: string, slotIndex: number): GameState {
  const next: GameState = { ...state, activePlayer: player, phase: "main", drawChoice: null, cheatMode: true };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [cardId(name)] };
  return applyAction(next, { type: "play_card", player, handIndex: 0, slotIndex }, library).state;
}

function choose(state: GameState, choiceIndex: number): GameState {
  const pending = state.pendingTarget;
  if (!pending) throw new Error("Expected a pending target");
  return applyAction(state, { type: "choose_target", player: pending.player, choiceIndex }, library).state;
}

function endTurn(state: GameState, player: PlayerId): GameState {
  let next = applyAction(state, { type: "end_turn", player }, library).state;
  while (next.phase === "drawChoice" && next.drawChoice) {
    next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
  }
  return next;
}

describe("2026 card replacements", () => {
  it("loads the requested stats, origins, keywords, timings, and effect IDs", () => {
    const expected: Record<string, Partial<(typeof cards)[number]>> = {
      "The Watcher": { atk: 5, hp: 8, effectId: "watcher_reveal_hand", effectTiming: "passive" },
      Sonic: { atk: 6, hp: 3, effectId: "charge", effectTiming: "none", keywords: ["Charge"] },
      "Isaac Netero": { atk: 4, hp: 4, effectId: "deathrattle_aoe_3", effectTiming: "deathrattle" },
      "Death Star": { atk: 7, hp: 6, origin: "Star Wars", effectId: "death_star_mark" },
      "The 7 Heroic Spirits": { cost: 2, atk: 2, hp: 2, effectId: "heroic_relics" },
      "Aladdin Lamp": { atk: 5, hp: 4, effectId: "aladdin_wish", effectTiming: "onPlay" },
      "The Mask": { atk: 3, hp: 2, effectId: "mask_return_attacker", effectTiming: "deathrattle" },
      V: { effectId: "deathrattle_random_evil", effectTiming: "deathrattle" },
      "Time Bomb": { atk: 0, hp: 5, effectId: "time_bomb_ongoing_5", effectTiming: "ongoing", keywords: [] },
    };
    for (const [name, fields] of Object.entries(expected)) {
      const card = cards.find((entry) => entry.name === name);
      expect(card, name).toMatchObject(fields);
    }
  });

  it("lets Charge attack immediately and lets 0 ATK declare an attack", () => {
    const charge = play(mainState(), 0, "Sonic", 0);
    expect(charge.players[0].board[0]?.sleeping).toBe(false);
    expect(getLegalActions(charge, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });

    const zero = mainState("zero-attack");
    zero.players[0].board[0] = minion("Meleoron", 0, { sleeping: false, atk: 0 });
    expect(getLegalActions(zero, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
  });

  it("V destroys a random Evil minion from either side when it dies", () => {
    const state = mainState();
    state.players[0].board[0] = minion("V", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[1] = minion("Aizen", 0, { effectId: "none", effectTiming: "none", keywords: [] });
    state.players[1].board[0] = minion("Zoro", 1, { atk: 99, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[0].board[1]).toBeNull();
  });

  it("Morpheus offers the two pill choices", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 3 });
    state.players[1].board[0] = minion("Zoro", 1, { hp: 1, maxHp: 3 });
    const asking = play(state, 0, "Morpheus", 0);
    expect(asking.pendingTarget?.labelOptions).toHaveLength(2);
    const healed = choose(asking, 0);
    expect(healed.players[0].board[1]).toMatchObject({ hp: 3, divineShield: true });
    expect(healed.players[1].board[0]).toMatchObject({ hp: 3, divineShield: true });

    const redState = mainState("morpheus-red");
    redState.players[0].board[1] = minion("John Wick", 0);
    redState.players[1].board[0] = minion("Zoro", 1);
    const red = choose(play(redState, 0, "Morpheus", 0), 1);
    expect(red.players.every((player) => player.board.every((minion) => minion === null))).toBe(true);
  });

  it("Aladdin can give the hero a Divine Shield", () => {
    const state = mainState();
    const asking = play(state, 0, "Aladdin Lamp", 0);
    const shielded = choose(asking, 0);
    expect(shielded.players[0].heroDivineShield).toBe(true);

    shielded.players[1].board[0] = minion("Zoro", 1, { sleeping: false, atk: 5 });
    shielded.activePlayer = 1;
    const before = shielded.players[0].health;
    const hit = applyAction(shielded, { type: "attack_core", player: 1, attackerSlot: 0 }, library).state;
    expect(hit.players[0].health).toBe(before);
    expect(hit.players[0].heroDivineShield).toBe(false);
  });

  it("Time Bomb deals 5 to enemy minions and itself on its owner's turn", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Time Bomb", 0);
    state.players[1].board[0] = minion("John Wick", 1, { hp: 10, maxHp: 10 });
    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[1].board[0]?.hp).toBe(5);
    expect(after.players[0].board[0]).toBeNull();
  });

  it("Pandora copies a minion's effects and keywords without copying stats", () => {
    const state = mainState();
    state.players[1].board[2] = minion("Sandworm", 1, { divineShield: true });
    const asking = play(state, 0, "Pandora's Actor", 0);
    const after = asking.pendingTarget
      ? choose(asking, asking.pendingTarget.options.findIndex((option) => option.owner === 1 && option.slot === 2))
      : asking;
    const pandora = after.players[0].board[0]!;
    expect(pandora.name).toBe("Sandworm");
    expect(pandora.atk).toBe(2);
    expect(pandora.maxHp).toBe(2);
    expect(pandora.keywords).toContain("Taunt");
    expect(pandora.divineShield).toBe(true);
  });

  it("Walter White doubles a friendly Neutral's ATK and sets its HP to 1", () => {
    const state = mainState();
    state.players[0].board[2] = minion("Death Star", 0, { atk: 3, hp: 6, maxHp: 6 });
    const asking = play(state, 0, "Walter White", 0);
    const after = asking.pendingTarget ? choose(asking, asking.pendingTarget.options.findIndex((option) => option.slot === 2)) : asking;
    expect(after.players[0].board[2]).toMatchObject({ atk: 6, hp: 1, maxHp: 1 });
  });

  it("Meleoron hides a chosen ally from attacks and effects while alive", () => {
    const state = mainState();
    state.players[0].board[2] = minion("John Wick", 0);
    const asking = play(state, 0, "Meleoron", 0);
    const after = asking.pendingTarget
      ? choose(asking, asking.pendingTarget.options.findIndex((option) => option.slot === 2))
      : asking;
    after.activePlayer = 1;
    expect(getLegalActions(after, library).some((action) => action.type === "attack_minion" && action.targetSlot === 2)).toBe(false);
    expect(after.players[0].board[2]?.protectedByMeleoron).toBe(after.players[0].board[0]?.instanceId);
  });

  it("Knov keeps two minions in the pocket room and returns the higher ATK one", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { atk: 5, hp: 5, maxHp: 5 });
    state.players[1].board[0] = minion("Sandworm", 1, { atk: 1, hp: 3, maxHp: 3 });
    const first = play(state, 0, "Knov", 2);
    const afterFriendly = first.pendingTarget ? choose(first, 0) : first;
    const afterEnemy = afterFriendly.pendingTarget ? choose(afterFriendly, 0) : afterFriendly;
    expect(afterEnemy.pocketRooms).toHaveLength(1);
    const turnTwo = endTurn(afterEnemy, 0);
    const turnThree = endTurn(turnTwo, 1);
    expect(turnThree.pocketRooms).toHaveLength(0);
    expect(turnThree.players[0].board[1]?.name).toBe("John Wick");
    expect(turnThree.players[1].board[0]).toBeNull();
  });

  it("Doctor Strange chains both minions and makes them untargetable", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1);
    const asking = play(state, 0, "Doctor Strange", 1);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[0].board[1]?.chained).toBe(2);
    expect(after.players[1].board[0]?.chained).toBe(2);
    expect(after.players[1].board[0]?.untargetableUntilTurn).toBe(after.turnNumber + 2);
    expect(getLegalActions({ ...after, activePlayer: 0 }, library).some((action) => action.type === "attack_minion")).toBe(false);
  });

  it("Death Star can mark the core and resolves for 12 if it survives", () => {
    const state = mainState();
    state.players[1].board[1] = minion("John Wick", 1);
    const asking = play(state, 0, "Death Star", 0);
    expect(asking.pendingTarget?.kind).toBe("boardOrCore");
    const marked = choose(asking, asking.pendingTarget!.options.length);
    const before = marked.players[1].health;
    const turnTwo = endTurn(marked, 0);
    const turnThree = endTurn(turnTwo, 1);
    expect(turnThree.players[1].health).toBe(before - 12);
  });

  it("Isaac Netero's Deathrattle damages enemy minions after he dies", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Zoro", 0, { atk: 5, hp: 10, maxHp: 10 });
    state.players[0].board[1] = minion("John Wick", 0, { hp: 5, maxHp: 5 });
    state.players[1].board[0] = minion("Isaac Netero", 1, { divineShield: false });
    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[1]?.hp).toBe(2);
  });

  it("Grand Master Yoda silences the current and future enemy board permanently", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1);
    const afterPlay = play(state, 0, "Grand Master Yoda", 1);
    expect(afterPlay.players[1].board[0]?.silenced).toBe(true);
    afterPlay.players[1].board[1] = minion("Zoro", 1);
    const future = endTurn(afterPlay, 0);
    expect(future.players[1].board[1]?.silenced).toBe(true);
    future.players[0].board[1] = null;
    future.players[1].board[2] = minion("Batman", 1);
    const yodaGone = endTurn(future, 1);
    expect(yodaGone.players[1].board[0]?.silenced).toBe(true);
    expect(yodaGone.players[1].board[2]?.silenced).toBe(false);
  });

  it("GLaDOS continuously buffs adjacent Tech minions and loses the aura when gone", () => {
    const state = mainState();
    state.players[0].board[0] = minion("John Wick", 0, { camp: "Tech", atk: 2, hp: 2, maxHp: 2 });
    const afterPlay = play(state, 0, "GLaDOS", 1);
    expect(afterPlay.players[0].board[0]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(afterPlay.players[0].board[0]?.keywords).toContain("Taunt");
    afterPlay.players[0].board[1] = null;
    const refreshed = applyAction(afterPlay, { type: "end_turn", player: 0 }, library).state;
    expect(refreshed.players[0].board[0]).toMatchObject({ atk: 2, maxHp: 2 });
  });

  it("Fantastic Four assigns its four effects left-to-right and loses them when killed", () => {
    const state = mainState();
    for (const slot of [0, 1, 2, 3]) state.players[0].board[slot] = minion("John Wick", 0, { effectId: "none", effectTiming: "none", keywords: [] });
    const placed = play(state, 0, "Fantastic Four", 4);
    expect(placed.players[0].board[0]?.keywords).toContain("Taunt");
    expect(placed.players[0].board[1]?.divineShield).toBe(true);
    expect(placed.players[0].board[2]?.atk).toBe(4);
    expect(placed.players[0].board[3]?.maxHp).toBe(4);

    placed.players[0].board[0]!.keywords = [];
    placed.players[1].board[0] = minion("Zoro", 1, { atk: 99, sleeping: false, hp: 99, maxHp: 99 });
    placed.activePlayer = 1;
    const after = applyAction(placed, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 4 }, library).state;
    expect(after.players[0].board[4]).toBeNull();
    expect(after.players[0].board[0]?.keywords).not.toContain("Taunt");
    expect(after.players[0].board[1]?.divineShield).toBe(false);
    expect(after.players[0].board[2]?.atk).toBe(2);
    expect(after.players[0].board[3]?.maxHp).toBe(2);
  });

  it("Ragnaros fires at the end of its controller's turn", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Ragnaros", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });
    const after = endTurn(state, 0);
    expect(after.players[1].board[0]?.hp).toBe(2);
  });

  it("Avengers recruits a Good minion from the deck on its ongoing turn", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[0].board[0] = minion("Avengers", 0);
    const after = endTurn(state, 1);
    const recruits = after.players[0].board.filter((entry) => entry && entry.name !== "Avengers");
    expect(recruits.length).toBe(1);
    expect(recruits[0]?.alignment).toBe("Good");
  });

  it("The 7 Heroic Spirits equips random relics to every friendly minion", () => {
    const state = mainState();
    state.players[0].board[0] = minion("John Wick", 0);
    const after = play(state, 0, "The 7 Heroic Spirits", 1);
    expect(after.players[0].board[0]?.relic).not.toBeNull();
    expect(after.players[0].board[1]?.relic).not.toBeNull();
  });

  it("Shigaraki marks a damaged minion and kills it at the next Shigaraki turn", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Shigaraki", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });
    const struck = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(struck.players[1].board[0]?.markedForDeathAtTurn).toBe(struck.turnNumber + 2);
    const nextOpponentTurn = endTurn(struck, 0);
    const nextShigarakiTurn = endTurn(nextOpponentTurn, 1);
    expect(nextShigarakiTurn.players[1].board[0]).toBeNull();
  });

  it("Ainz fills every open slot with distinct-art Taunt Skeletons", () => {
    const after = play(mainState(), 0, "Ainz Ooal Gown", 0);
    const skeletons = after.players[0].board.filter((entry) => entry?.name === "Skeleton");
    expect(skeletons).toHaveLength(4);
    expect(skeletons.every((entry) => entry?.atk === 1 && entry?.hp === 1 && entry.keywords.includes("Taunt"))).toBe(true);
    expect(skeletons.every((entry) => entry?.art.endsWith("/token-skeleton.webp"))).toBe(true);
    expect(skeletons.every((entry) => entry?.art !== after.players[0].board[0]?.art)).toBe(true);
  });

  it("Voldemort sacrifices the lowest-HP ally instead of dying", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Zoro", 0, { atk: 6, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("Lord Voldemort", 1, { hp: 4, maxHp: 4 });
    state.players[1].board[1] = minion("John Wick", 1, { hp: 1, maxHp: 1 });
    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toMatchObject({ name: "Lord Voldemort", hp: 4, maxHp: 4 });
    expect(after.players[1].board[1]).toBeNull();
  });

  it("Rick Prime returns all other minions while staying on the board", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1);
    const after = play(state, 0, "Rick Prime", 0);
    expect(after.players[0].board[0]?.name).toBe("Rick Prime");
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].hand).not.toContain(cardId("Rick Prime"));
    expect(after.players[1].hand).toContain(cardId("John Wick"));
  });

  it("Toji blocks Magic, while Elden Beast buffs Magic ATK", () => {
    const blocked = mainState("toji-magic");
    blocked.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 5, hp: 20, maxHp: 20 });
    blocked.players[1].board[0] = minion("Toji", 1);
    const tojiHit = applyAction(blocked, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(tojiHit.players[1].board[0]?.hp).toBe(3);

    const elder = mainState("elder-no-magic-immunity");
    elder.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 1, hp: 20, maxHp: 20 });
    elder.players[1].board[0] = minion("Elden Beast", 1);
    const elderHit = applyAction(elder, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(elderHit.players[1].board[0]?.hp).toBe(3);
  });

  it("Cthulhu keeps Tech immunity, while T-1000 heals on its ongoing turn", () => {
    const tech = mainState("cthulhu-tech");
    tech.players[0].board[0] = minion("Modern Tank", 0, { sleeping: false, atk: 5, hp: 20, maxHp: 20 });
    tech.players[1].board[0] = minion("Cthulhu", 1);
    const cthulhuHit = applyAction(tech, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(cthulhuHit.players[1].board[0]?.hp).toBe(4);

    const nature = mainState("t1000-nature");
    nature.players[0].board[0] = minion("John Wick", 0, { sleeping: false, camp: "Nature", atk: 1, hp: 20, maxHp: 20 });
    nature.players[1].board[0] = minion("T-1000", 1);
    const t1000Hit = applyAction(nature, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(t1000Hit.players[1].board[0]?.hp).toBe(4);
    const healed = endTurn(t1000Hit, 0);
    expect(healed.players[1].board[0]?.hp).toBe(5);
  });

  it("Godrick kills a friendly minion and keeps its stats and persistent effects", () => {
    const state = mainState();
    state.players[0].board[1] = minion("Gordon Freeman", 0);
    const asking = play(state, 0, "Godrick the Grafted", 0);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    const after = targetIndex >= 0 ? choose(asking, targetIndex) : asking;
    const godrick = after.players[0].board[0];
    expect(after.players[0].board[1]).toBeNull();
    expect(godrick).toMatchObject({ atk: 5, hp: 5, maxHp: 5, effectId: "none", effectTiming: "passive" });
    expect(godrick?.gainedEffects).toEqual([
      expect.objectContaining({ effectId: "gordon_survive_damage", timing: "passive" }),
    ]);
  });

  it("Godzilla retaliates with damage to enemy minions and the enemy core", () => {
    const state = mainState();
    const coreBefore = state.players[1].health;
    state.players[0].board[0] = minion("John Wick", 0, { sleeping: false, atk: 1, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("Godzilla", 1);
    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]?.hp).toBe(4);
    expect(after.players[0].board[0]?.hp).toBe(4);
    expect(after.players[0].health).toBe(coreBefore - 2);
  });

  it("Tempest's Guardian Lords keeps its sacrifice Battlecry and gains +2/+1 ongoing", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 3, maxHp: 3 });
    const asking = play(state, 0, "Tempest's Guardian Lords", 1);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 1 && option.slot === 0) ?? -1;
    const after = targetIndex >= 0 ? choose(asking, targetIndex) : asking;
    const tempest = after.players[0].board[1];
    expect(after.players[1].board[0]).toBeNull();
    expect(tempest).toMatchObject({ atk: 3, hp: 4, maxHp: 4, effectId: "none", effectTiming: "ongoing" });
    expect(tempest?.gainedEffects).toEqual([
      expect.objectContaining({ effectId: "tempest_guardian_growth", timing: "ongoing" }),
    ]);

    const nextOwnerTurn = endTurn(endTurn(after, 0), 1);
    expect(nextOwnerTurn.players[0].board[1]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });
  });

  it("Founding Titan gives Taunt to every friendly minion, including later arrivals", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0);
    const after = play(state, 0, "Founding Titan", 0);
    expect(after.players[0].board[0]?.keywords).toContain("Taunt");
    expect(after.players[0].board[1]?.keywords).toContain("Taunt");

    after.players[0].board[2] = minion("John Wick", 0);
    const refreshed = endTurn(after, 0);
    expect(refreshed.players[0].board[2]?.keywords).toContain("Taunt");
  });
});
