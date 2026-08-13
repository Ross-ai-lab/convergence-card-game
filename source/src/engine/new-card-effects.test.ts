import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId, RelicInstance } from "./types";

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
      "The Watcher": { atk: 10, hp: 7, effectId: "watcher_reveal_hand", effectTiming: "passive" },
      Whitebeard: { atk: 6, hp: 4, effectId: "aoe_all_3", effectTiming: "onPlay" },
      "Dio Brando": { atk: 3, hp: 2, effectId: "freeze_all_enemies", effectTiming: "onPlay" },
      Gilgamesh: { atk: 5, hp: 5, effectId: "equip_random_relic", effectTiming: "onPlay", keywords: [] },
      Sonic: { atk: 6, hp: 3, effectId: "charge", effectTiming: "none", keywords: ["Charge"] },
      "Isaac Netero": { atk: 4, hp: 4, effectId: "deathrattle_aoe_3", effectTiming: "deathrattle" },
      "Death Star": { atk: 7, hp: 6, origin: "Star Wars", effectId: "death_star_mark" },
      "The 7 Heroic Spirits": { cost: 2, atk: 2, hp: 2, effectId: "heroic_relics" },
      "Aladdin Lamp": { atk: 5, hp: 4, effectId: "aladdin_wish", effectTiming: "onPlay" },
      "The Mask": { atk: 3, hp: 2, effectId: "mask_return_attacker", effectTiming: "deathrattle" },
      V: { effectId: "deathrattle_random_evil", effectTiming: "deathrattle" },
      "Time Bomb": { atk: 0, hp: 5, effectId: "time_bomb_ongoing_5", effectTiming: "ongoing", keywords: [] },
      "G-Man": { atk: 3, hp: 6, effectId: "stasis_enemy", effectTiming: "onPlay", keywords: [] },
      Superman: { atk: 6, hp: 6, effectId: "superman_damage_cap_3", effectTiming: "passive", keywords: ["Passive"] },
      "Darth Vader": { atk: 3, hp: 2, effectId: "vader_chain_or_destroy", effectTiming: "onPlay", keywords: [] },
      Dumbledore: { atk: 2, hp: 4, effectId: "dumbledore_cleanse", effectTiming: "passive", keywords: ["Passive"] },
      Gojo: { atk: 4, hp: 8, effectId: "yoda_global_silence", effectTiming: "passive", keywords: ["Passive"] },
      "Rennala Queen of the Full Moon": { atk: 2, hp: 3, effectId: "rebirth_friendly_dead", effectTiming: "onPlay", keywords: [] },
      Cecil: { atk: 1, hp: 1, effectId: "bounce_friendly", effectTiming: "onPlay", keywords: [] },
      "Giorno - Gold Experience Requiem": { atk: 5, hp: 8, effectId: "slot_permanent_silence", effectTiming: "onPlay", keywords: [] },
      Avengers: { atk: 4, hp: 4, effectId: "invuln_with_good_ally", effectTiming: "passive", keywords: ["Passive"] },
      "General Grievous": { atk: 3, hp: 2, effectId: "grievous_on_kill_atk", effectTiming: "passive", keywords: ["Passive"] },
      Buddha: { atk: 3, hp: 4, effectId: "buddha_purify", effectTiming: "onPlay", keywords: [] },
      "Deep Sea King": { atk: 4, hp: 4, effectId: "invulnerable_if_frozen", effectTiming: "passive", keywords: ["Passive"] },
      "Seven Deadly Sins": { atk: 4, hp: 5, effectId: "summon_sins", effectTiming: "onPlay", keywords: [] },
      "Elder Centipede": { atk: 5, hp: 6, effectId: "self_buff_2", effectTiming: "ongoing", keywords: ["Ongoing"] },
      "All Might": { atk: 4, hp: 5, effectId: "all_enemy_atk_down_2", effectTiming: "passive", keywords: ["Passive"] },
      "Grand Master Yoda": { atk: 5, hp: 5, effectId: "yoda_lowest_atk_buff", effectTiming: "ongoing", keywords: ["Cannot Attack", "Ongoing"] },
      King: { atk: 0, hp: 7, effectId: "king_attack_lock_random", effectTiming: "passive", keywords: ["Cannot Attack", "Passive"] },
      "Dominion Authority": { atk: 4, hp: 5, effectId: "dominion_authority", effectTiming: "passive", keywords: ["Passive"] },
      Kratos: { atk: 3, hp: 4, effectId: "kratos_chain_break", effectTiming: "passive", keywords: ["Chained"] },
      "Ten Commandments": { atk: 3, hp: 5, effectId: "ten_commandments_first_attack", effectTiming: "passive", keywords: ["Passive"] },
      "Nine Hashira": { atk: 3, hp: 3, effectId: "hashira_focus_attack", effectTiming: "onPlay", keywords: [] },
      "Kiritsugu Emiya": { atk: 1, hp: 1, effectId: "freeze_and_silence_enemy", effectTiming: "onPlay", keywords: [] },
    };
    for (const [name, fields] of Object.entries(expected)) {
      const card = cards.find((entry) => entry.name === name);
      expect(card, name).toMatchObject(fields);
    }
  });

  it("Dumbledore cleanses existing disables and blocks new Silence and Freeze", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { silenced: true });
    state.players[0].board[2] = minion("Zoro", 0, { frozen: true, thawPending: true, attacksUsed: 1 });

    const afterPlay = play(state, 0, "Dumbledore", 0);
    expect(afterPlay.players[0].board[0]).toMatchObject({ atk: 2, hp: 4, silenced: false, frozen: false });
    expect(afterPlay.players[0].board[1]).toMatchObject({ silenced: false });
    expect(afterPlay.players[0].board[2]).toMatchObject({ frozen: false, thawPending: false, attacksUsed: 0 });

    const frozenAttempt = play(afterPlay, 1, "Dio Brando", 0);
    expect(frozenAttempt.players[0].board[0]?.frozen).toBe(false);
    expect(frozenAttempt.players[0].board[1]?.frozen).toBe(false);
    expect(frozenAttempt.players[0].board[2]?.frozen).toBe(false);

    const silencedAttempt = play(frozenAttempt, 1, "Aizawa", 1);
    const targetIndex = silencedAttempt.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const cleansed = choose(silencedAttempt, targetIndex);
    expect(cleansed.players[0].board[1]?.silenced).toBe(false);
  });

  it("Gojo silences enemy minions now and as they arrive", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1);
    state.players[1].board[1] = minion("Zoro", 1);

    const afterPlay = play(state, 0, "Gojo", 2);
    expect(afterPlay.players[0].board[2]).toMatchObject({ atk: 4, hp: 8 });
    expect(afterPlay.players[1].board[0]?.silenced).toBe(true);
    expect(afterPlay.players[1].board[1]?.silenced).toBe(true);

    const later = play(afterPlay, 1, "John Wick", 2);
    expect(later.players[1].board[2]?.silenced).toBe(true);
  });

  it("Cecil returns the chosen friendly minion to hand", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 6 });
    state.players[0].board[2] = minion("Zoro", 0, { hp: 2, maxHp: 3 });

    const asking = play(state, 0, "Cecil", 0);
    expect(asking.players[0].board[0]).toMatchObject({ keywords: [], divineShield: false });
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const returned = choose(asking, targetIndex);
    expect(returned.players[0].board[1]).toBeNull();
    expect(returned.players[0].hand).toContain(cardId("John Wick"));
    expect(returned.players[0].board[2]).toMatchObject({ hp: 2, maxHp: 3 });
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

  it("Grand Master Yoda cannot attack and empowers the lowest-ATK friendly minion", () => {
    const state = mainState();
    state.players[0].board[0] = minion("John Wick", 0, { atk: 1, hp: 4, maxHp: 4 });
    const afterPlay = play(state, 0, "Grand Master Yoda", 1);
    expect(afterPlay.players[0].board[1]?.keywords).toContain("Cannot Attack");
    expect(getLegalActions(afterPlay, library)).not.toContainEqual({ type: "attack_core", player: 0, attackerSlot: 1 });
    const enemyTurn = endTurn(afterPlay, 0);
    const empowered = endTurn(enemyTurn, 1);
    expect(empowered.players[0].board[0]).toMatchObject({ atk: 3, maxHp: 6, hp: 6 });
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

  it("Avengers is Invulnerable while another Good minion is present", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Avengers", 0, { sleeping: false });
    state.players[0].board[1] = minion("John Wick", 0, { alignment: "Good", sleeping: false });
    state.players[1].board[0] = minion("Zoro", 1, { atk: 5, hp: 5, maxHp: 5, sleeping: false });
    state.activePlayer = 1;
    const protectedState = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(protectedState.players[0].board[0]?.hp).toBe(4);

    protectedState.players[0].board[1] = null;
    protectedState.activePlayer = 1;
    protectedState.players[1].board[0]!.attacksUsed = 0;
    const exposed = applyAction(protectedState, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(exposed.players[0].board[0]).toBeNull();
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

  it("G-Man stores an enemy in stasis and returns it after two turns", () => {
    const state = mainState("g-man-stasis");
    state.players[1].board[0] = minion("John Wick", 1);
    state.players[1].board[2] = minion("Zoro", 1);
    const asking = play(state, 0, "G-Man", 1);
    const stasis = choose(asking, 1);
    expect(stasis.players[1].board[2]).toBeNull();
    expect(stasis.stasis).toHaveLength(1);
    expect(stasis.stasis[0].returnAtTurn).toBe(stasis.turnNumber + 2);

    const twoTurnsLater = endTurn(endTurn(stasis, 0), 1);
    expect(twoTurnsLater.stasis).toHaveLength(0);
    expect(twoTurnsLater.players[1].board[2]?.name).toBe("Zoro");
  });

  it("Darth Vader chains a target, then destroys it if it is already Chained", () => {
    const state = mainState("vader-chain");
    state.players[1].board[0] = minion("John Wick", 1);
    const chained = play(state, 0, "Darth Vader", 1);
    expect(chained.players[1].board[0]).toMatchObject({ atk: 1, chained: 2 });

    const alreadyChained = mainState("vader-destroy");
    alreadyChained.players[1].board[0] = minion("John Wick", 1, { chained: 2 });
    const destroyed = play(alreadyChained, 0, "Darth Vader", 1);
    expect(destroyed.players[1].board[0]).toBeNull();
  });

  it("Buddha makes the board Good and clears its listed negative statuses", () => {
    const state = mainState("buddha-purify");
    const dirty = {
      alignment: "Evil" as const,
      chained: 2,
      frozen: true,
      silenced: true,
      markedBy: "mark-source",
      markedForDeathAtTurn: 4,
      delayedDestroySource: "delay-source",
    };
    state.players[0].board[0] = minion("John Wick", 0, dirty);
    state.players[1].board[0] = minion("Zoro", 1, dirty);
    const after = play(state, 0, "Buddha", 1);
    for (const entry of after.players.flatMap((player) => player.board)) {
      if (!entry) continue;
      expect(entry.alignment).toBe("Good");
      expect(entry.chained).toBe(0);
      expect(entry.frozen).toBe(false);
      expect(entry.silenced).toBe(false);
      expect(entry.markedBy).toBeNull();
      expect(entry.markedForDeathAtTurn).toBeNull();
      expect(entry.delayedDestroySource).toBeNull();
    }
  });

  it("Kiritsugu freezes and silences the chosen enemy", () => {
    const state = mainState("kiritsugu");
    state.players[1].board[0] = minion("John Wick", 1);
    const after = play(state, 0, "Kiritsugu Emiya", 1);
    expect(after.players[1].board[0]).toMatchObject({ frozen: true, silenced: true });
  });

  it("General Grievous permanently gains the ATK of every minion he kills", () => {
    const state = mainState("grievous-kill");
    state.players[0].board[0] = minion("General Grievous", 0, { sleeping: false, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 4, hp: 1, maxHp: 1 });
    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]?.atk).toBe(7);
  });

  it("Superman caps incoming damage at 3 and Deep Sea King is Invulnerable while anything is Frozen", () => {
    const superman = mainState("superman-damage-cap");
    superman.players[1].board[0] = minion("Superman", 1);
    superman.players[0].board[0] = minion("John Wick", 0, { camp: "Nature", atk: 5, hp: 10, maxHp: 10, sleeping: false });
    const blocked = applyAction(superman, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(blocked.players[1].board[0]?.hp).toBe(3);

    const deepSea = mainState("deep-sea-frozen");
    deepSea.players[1].board[0] = minion("Deep Sea King", 1);
    deepSea.players[0].board[0] = minion("John Wick", 0, { atk: 2, hp: 20, maxHp: 20, sleeping: false });
    deepSea.players[0].board[1] = minion("Zoro", 0, { atk: 2, hp: 20, maxHp: 20, sleeping: false, frozen: true });
    const blockedByFreeze = applyAction(deepSea, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(blockedByFreeze.players[1].board[0]?.hp).toBe(4);
    blockedByFreeze.players[0].board[1]!.frozen = false;
    const hit = applyAction(blockedByFreeze, { type: "attack_minion", player: 0, attackerSlot: 1, targetSlot: 0 }, library).state;
    expect(hit.players[1].board[0]?.hp).toBe(2);
  });

  it("Seven Deadly Sins fills the board with unique-keyword Sin tokens and their new art", () => {
    const after = play(mainState("sin-tokens"), 0, "Seven Deadly Sins", 0);
    const sins = after.players[0].board.filter((entry) => entry?.name === "Sin");
    expect(sins).toHaveLength(4);
    expect(new Set(sins.flatMap((entry) => entry?.keywords ?? []))).toEqual(
      new Set(["Taunt", "Divine Shield", "Charge", "Chained"]),
    );
    expect(sins.every((entry) => entry?.atk === 1 && entry?.hp === 1 && entry.art.endsWith("/token-sin.png"))).toBe(true);
    expect(sins.every((entry) => entry?.art !== after.players[0].board[0]?.art)).toBe(true);
  });

  it("Elder Centipede grows +2/+2 on its ongoing turn and All Might lowers enemy ATK", () => {
    const elder = mainState("elder-centipede");
    elder.players[0].board[0] = minion("Elder Centipede", 0);
    const grown = endTurn(endTurn(elder, 0), 1);
    expect(grown.players[0].board[0]).toMatchObject({ atk: 7, hp: 8, maxHp: 8 });

    const might = mainState("all-might-aura");
    might.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 5, maxHp: 5 });
    const empowered = play(might, 0, "All Might", 0);
    expect(empowered.players[1].board[0]?.atk).toBe(3);
    empowered.players[0].board[0] = null;
    const auraGone = applyAction(empowered, { type: "end_turn", player: 0 }, library).state;
    expect(auraGone.players[1].board[0]?.atk).toBe(5);
  });

  it("King locks one random enemy attacker at the start of each enemy turn", () => {
    const state = mainState("king-lock");
    state.players[0].board[0] = minion("King", 0);
    state.players[1].board[0] = minion("John Wick", 1, { sleeping: false });
    state.players[1].board[1] = minion("Zoro", 1, { sleeping: false });
    const enemyTurn = endTurn(state, 0);
    const locked = enemyTurn.players[1].board.filter((entry) => entry?.attackLocked);
    expect(locked).toHaveLength(1);
    expect(locked[0]?.attackLockedUntilTurn).toBe(enemyTurn.turnNumber + 1);
  });

  it("Dominion Authority blocks enemy mind control and returns", () => {
    const control = mainState("dominion-control");
    control.players[1].board[0] = minion("Dominion Authority", 1);
    control.players[1].board[1] = minion("John Wick", 1, { hp: 2, maxHp: 2 });
    const asking = play(control, 0, "Illumi", 0);
    const afterControl = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(afterControl.players[1].board[1]?.name).toBe("John Wick");
    expect(afterControl.players[0].board.some((entry) => entry?.name === "John Wick")).toBe(false);

    const returned = mainState("dominion-return");
    returned.players[1].board[0] = minion("Dominion Authority", 1);
    returned.players[1].board[1] = minion("John Wick", 1);
    const afterReturn = play(returned, 0, "Rick Prime", 0);
    expect(afterReturn.players[1].board[1]?.name).toBe("John Wick");
  });

  it("Kratos breaks his chains and gains +2/+2 when a friendly minion dies", () => {
    const state = mainState("kratos-chain-break");
    state.players[0].board[0] = minion("Kratos", 0, { chained: 2 });
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = minion("Zoro", 1, { atk: 99, hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(after.players[0].board[1]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 5, hp: 6, maxHp: 6, chained: 0 });
  });

  it("Nine Hashira makes every able friendly minion attack the chosen Evil target", () => {
    const state = mainState("hashira-focus");
    state.players[0].board[0] = minion("Zoro", 0, { sleeping: false, atk: 3, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", hp: 10, maxHp: 10 });
    const after = play(state, 0, "Nine Hashira", 1);
    expect(after.players[1].board[0]?.hp).toBe(4);
    expect(after.players[0].board[0]?.attacksUsed).toBe(1);
    expect(after.players[0].board[1]?.attacksUsed).toBe(1);
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

  it("Rimuru Tempest keeps its sacrifice Battlecry and gains +2/+1 ongoing", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 3, maxHp: 3 });
    const asking = play(state, 0, "Rimuru Tempest", 1);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 1 && option.slot === 0) ?? -1;
    const after = targetIndex >= 0 ? choose(asking, targetIndex) : asking;
    const tempest = after.players[0].board[1];
    expect(after.players[1].board[0]).toBeNull();
    expect(tempest).toMatchObject({ atk: 3, hp: 4, maxHp: 4, effectId: "none", effectTiming: "ongoing" });
    expect(tempest?.gainedEffects).toEqual([
      expect.objectContaining({ effectId: "rimuru_tempest_growth", timing: "ongoing" }),
    ]);

    const nextOwnerTurn = endTurn(endTurn(after, 0), 1);
    expect(nextOwnerTurn.players[0].board[1]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });
  });

  it("Silver Surfer summons a Taunt Galactus on death", () => {
    const state = mainState("silver-surfer-galactus");
    state.players[0].board[0] = minion("Silver Surfer", 0, { hp: 1, maxHp: 1, chained: 0 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toMatchObject({ name: "Galactus", atk: 5, hp: 5, maxHp: 5 });
    expect(after.players[0].board[0]?.keywords).toContain("Taunt");
    expect(after.players[0].board[0]?.art).toBe("/card-art/raw/galactus.webp");
  });

  it("Ten Tails chains every minion on both boards", () => {
    const state = mainState("ten-tails-chain");
    state.players[0].board[0] = minion("John Wick", 0);
    state.players[1].board[0] = minion("Zoro", 1);
    const after = play(state, 0, "Ten Tails", 1);
    expect(after.players[0].board[0]?.chained).toBe(2);
    expect(after.players[0].board[1]?.chained).toBe(2);
    expect(after.players[1].board[0]?.chained).toBe(2);
  });

  it("Ouken endlessly Reborns as a Chained 2/1", () => {
    const state = mainState("ouken-reborn");
    state.players[0].board[0] = minion("Ouken", 0, { hp: 1, maxHp: 1, chained: 0 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toMatchObject({ name: "Ouken", atk: 2, hp: 1, maxHp: 1, chained: 2, effectId: "ouken_reborn" });
  });

  it("Kureo Mado steals an attached relic and equips it without leaving it on the victim", () => {
    const state = mainState("kureo-relic");
    const relicDef = relics.find((relic) => relic.id === "r001")!;
    const attached: RelicInstance = {
      id: relicDef.id,
      relicId: relicDef.relicId,
      name: relicDef.name,
      effect: relicDef.effect,
      art: relicDef.art,
    };
    state.players[1].board[0] = minion("John Wick", 1, { relic: attached });
    const after = play(state, 0, "Kureo Mado", 1);
    expect(after.players[1].board[0]?.relic).toBeNull();
    expect(after.players[0].board[1]?.relic).toMatchObject({ id: "r001", name: relicDef.name });
  });

  it("Nyan's Charge ignores Taunt when selecting an attack target", () => {
    const state = mainState("nyan-ignore-taunt");
    state.players[0].board[0] = minion("Nyan", 0, { sleeping: false });
    state.players[1].board[0] = minion("Dragon", 1, { keywords: ["Taunt"] });
    expect(getLegalActions(state, library)).toContainEqual({ type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 });
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
