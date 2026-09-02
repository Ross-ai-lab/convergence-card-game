import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, effectiveCardCost, getLegalActions, makeCardLibrary, opponentHandRevealed } from "./game";
import { HERO_POWER_UNLOCK_ORDER } from "./hero-powers";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId, RelicInstance } from "./types";

const library = makeCardLibrary(cards, relics);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function relicId(name: string): string {
  const relic = relics.find((entry) => entry.name === name);
  if (!relic) throw new Error(`Missing relic ${name}`);
  return relic.id;
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
  it("loads the four requested cards with their final metadata", () => {
    expect(cards.find((card) => card.name === "Xenomorph Queen")).toMatchObject({
      cost: 4,
      atk: 1,
      hp: 4,
      rarity: "Black",
      camp: "Nature",
      alignment: "Evil",
      keywords: ["Passive"],
      effectId: "xenomorph_queen_brood",
      effectTiming: "passive",
    });
    expect(cards.find((card) => card.name === "Naruto")).toMatchObject({
      cost: 8,
      atk: 2,
      hp: 2,
      rarity: "Yellow",
      effectId: "naruto_shadow_clones",
      effectTiming: "onPlay",
    });
    expect(cards.find((card) => card.name === "Frieren")).toMatchObject({
      cost: 6,
      atk: 2,
      hp: 5,
      rarity: "Purple",
      effectId: "frieren_relic_discover",
      effectTiming: "passive",
      effect: "Passive: The first time you cast a relic each turn, discover another relic",
    });
    expect(cards.find((card) => card.name === "Guts")).toMatchObject({
      cost: 2,
      atk: 1,
      hp: 1,
      rarity: "Black",
      effectId: "guts_missing_core_growth",
      effectTiming: "passive",
      effect: "Passive: Gains +2/+1 for each 20 HP your Core is missing",
    });
  });

  it("Xenomorph Queen hatches one Larva after each friendly death", () => {
    const state = mainState("xenomorph-queen-brood");
    state.players[0].board[0] = minion("Xenomorph Queen", 0);
    state.players[0].board[1] = minion("John Wick", 0, { atk: 0, hp: 1, maxHp: 1, sleeping: false });
    state.players[1].board[0] = minion("Gordon Freeman", 1, { atk: 5, hp: 5, maxHp: 5, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 },
      library,
    ).state;

    expect(after.players[0].board[1]).toMatchObject({
      cardId: "token:larva",
      name: "Larva",
      atk: 1,
      hp: 1,
      suppressArrivalTheme: false,
    });
    expect(after.players[0].board[1]?.art).toContain("token-larva.webp");
  });

  it("Xenomorph Queen does not hatch a Larva when a Larva dies", () => {
    const state = mainState("xenomorph-queen-no-larva-chain");
    const larva = library["token:larva"];
    if (!larva || larva.kind !== "minion") throw new Error("Missing Larva token definition");
    state.players[0].board[0] = minion("Xenomorph Queen", 0);
    state.players[0].board[1] = spawnTestMinion(larva, 0, { sleeping: false });
    state.players[1].board[0] = minion("Gordon Freeman", 1, { atk: 5, hp: 5, maxHp: 5, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 },
      library,
    ).state;

    expect(after.players[0].board[1]).toBeNull();
    expect(after.players[0].board.filter(Boolean)).toHaveLength(1);
  });

  it("Naruto fills every empty friendly slot with 2/2 Shadow Clones", () => {
    const state = mainState("naruto-shadow-clones");
    state.players[0].board[1] = minion("John Wick", 0);

    const after = play(state, 0, "Naruto", 0);
    const clones = after.players[0].board.filter((entry) => entry?.cardId === "token:shadow-clone");

    expect(clones).toHaveLength(3);
    expect(clones.every((entry) => entry?.name === "Shadow Clone" && entry.atk === 2 && entry.hp === 2)).toBe(true);
    expect(clones.every((entry) => entry?.art.includes("token-shadow-clone.webp"))).toBe(true);
    expect(clones.every((entry) => entry?.suppressArrivalTheme === true)).toBe(true);
  });

  it("Frieren discovers once per turn for each Frieren, then resets next turn", () => {
    const state = mainState("frieren-relic-discover");
    state.players[0].board[0] = minion("Frieren", 0);
    state.players[0].board[1] = minion("Frieren", 0);
    const playedRelic = relicId("Elder wand");
    state.players[0].hand = [playedRelic];
    state.deck = state.deck.filter((cardId) => cardId !== playedRelic);

    const asking = applyAction(
      state,
      { type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 },
      library,
    ).state;
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.prompt).toBe("Discover 1 of 3 Ascension Relics");
    expect(asking.pendingTarget?.labelOptions).toHaveLength(3);
    expect(asking.pendingTarget?.queuedRelicSources).toHaveLength(1);

    const first = choose(asking, 0);
    expect(first.phase).toBe("targeting");
    expect(first.pendingTarget?.sourceInstanceId).toBe(first.players[0].board[1]?.instanceId);

    const after = choose(first, 0);
    expect(after.phase).toBe("main");
    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].hand).toHaveLength(2);

    // Keep this follow-up relic inert. New relics may have an immediate
    // transformation or return effect, which would remove the second Frieren
    // before the next-turn reset is tested.
    const sameTurnRelic = relicId("Tesseract");
    after.players[0].hand = [sameTurnRelic];
    after.deck = after.deck.filter((cardId) => cardId !== sameTurnRelic);
    const sameTurn = applyAction(
      after,
      { type: "play_relic", player: 0, handIndex: 0, slotIndex: 1 },
      library,
    ).state;
    expect(sameTurn.phase).toBe("main");
    expect(sameTurn.pendingTarget).toBeNull();
    expect(sameTurn.players[0].hand).toHaveLength(0);

    const nextTurn = endTurn(endTurn(sameTurn, 0), 1);
    const nextRelic = relicId("Tesseract");
    nextTurn.players[0].board[2] = minion("John Wick", 0);
    nextTurn.players[0].hand = [nextRelic];
    nextTurn.deck = nextTurn.deck.filter((cardId) => cardId !== nextRelic);
    const nextAsking = applyAction(
      nextTurn,
      { type: "play_relic", player: 0, handIndex: 0, slotIndex: 2 },
      library,
    ).state;
    expect(nextAsking.phase).toBe("targeting");
    expect(nextAsking.pendingTarget?.queuedRelicSources).toHaveLength(1);

    const nextFirst = choose(nextAsking, 0);
    const nextAfter = choose(nextFirst, 0);
    expect(nextAfter.phase).toBe("main");
    expect(nextAfter.players[0].hand).toHaveLength(2);
  });

  it("Guts gains and loses a live +2/+1 aura as the Core crosses 20 HP thresholds", () => {
    const state = mainState("guts-missing-core-growth");
    state.players[0].health = 54;
    const grown = play(state, 0, "Guts", 0);
    expect(grown.players[0].board[0]).toMatchObject({ atk: 3, hp: 2, maxHp: 2 });

    const healed: GameState = { ...grown, players: [...grown.players] as GameState["players"] };
    healed.players[0] = { ...grown.players[0], health: 75 };
    const afterHeal = applyAction(healed, { type: "end_turn", player: 0 }, library).state;
    expect(afterHeal.players[0].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });
  });

  it("loads the requested stats, origins, keywords, timings, and effect IDs", () => {
    const expected: Record<string, Partial<(typeof cards)[number]>> = {
      "The Watcher": { atk: 10, hp: 7, effectId: "watcher_reveal_hand", effectTiming: "passive" },
      Whitebeard: { atk: 4, hp: 3, effectId: "aoe_damage_3", effectTiming: "onPlay" },
      "Dio Brando": { atk: 3, hp: 2, effectId: "freeze_all_enemies", effectTiming: "onPlay" },
      Gilgamesh: { atk: 5, hp: 5, effectId: "equip_random_relic", effectTiming: "onPlay", keywords: [] },
      Sonic: { atk: 6, hp: 3, effectId: "charge", effectTiming: "none", keywords: ["Charge"] },
      "Isaac Netero": { atk: 4, hp: 4, effectId: "deathrattle_aoe_3", effectTiming: "deathrattle" },
      "Death Star": { atk: 7, hp: 6, origin: "Star Wars", effectId: "death_star_mark" },
      "Star Destroyer": {
        cost: 7,
        atk: 5,
        hp: 5,
        effectId: "star_destroyer_tie_fighters",
        effectTiming: "onPlay",
        effect: "Battlecry: Summon two 1/1 TIE Fighters with Charge",
      },
      Battleship: {
        cost: 4,
        atk: 2,
        hp: 3,
        effectId: "battleship_tech_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: All friendly Tech minions have +2/+1",
      },
      Dormammu: { cost: 9, atk: 8, hp: 5, effectId: "dark_dimension_banish", effectTiming: "onPlay" },
      "Doctor Strange": { cost: 7, atk: 3, hp: 3, effectId: "strange_bargain", effectTiming: "onPlay" },
      Morpheus: {
        cost: 4,
        atk: 2,
        hp: 3,
        effectId: "morpheus_choice",
        effectTiming: "onPlay",
        effect: "Battlecry: Discover a random Good or Evil minion from the deck. Draw it",
      },
      "Kento Nanami": { cost: 3, atk: 1, hp: 1, effectId: "set_hp_1", effectTiming: "onPlay", keywords: [] },
      "Ainz Ooal Gown": { cost: 9, atk: 3, hp: 3, effectId: "set_all_enemy_hp_1", effectTiming: "onPlay", keywords: [] },
      "Light Yagami": {
        cost: 8,
        atk: 4,
        hp: 3,
        effectId: "light_yagami_nature_kill",
        effectTiming: "onPlay",
        keywords: [],
        effect: "Battlecry: Destroy an enemy Nature minion",
      },
      "Eye of Sauron": {
        cost: 5,
        atk: 1,
        hp: 5,
        effectId: "enemy_cards_cost_1_more",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Enemy cards cost 1 more",
      },
      "Yoriichi Type Zero": {
        cost: 3,
        atk: 2,
        hp: 2,
        effectId: "survivor_buff",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Whenever a friendly minion survives a combat, it gains +1/+1",
      },
      "Gordon Freeman": {
        cost: 4,
        atk: 1,
        hp: 3,
        effectId: "freeman_charge_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: All friendly minions have Charge",
      },
      Hypnos: {
        cost: 4,
        atk: 0,
        hp: 5,
        effectId: "chain_attacker",
        effectTiming: "passive",
        keywords: ["Taunt", "Passive"],
        effect: "Taunt. Passive: Enemy minions that attack this become Chained",
      },
      Zoro: { cost: 5, atk: 4, hp: 4, effectId: "on_kill_buff_1", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Gain +1/+1 after killing a minion" },
      "One-Eyed Owl": { cost: 5, atk: 4, hp: 4, effectId: "chain_watch_growth", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Whenever a minion becomes Chained, Frozen or Silenced, gain +1/+1" },
      "Gravelord Nito": { cost: 4, atk: 2, hp: 3, effectId: "nito_any_death_1_1", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Gain +1/+1 when a minion dies" },
      "Margit the Fell Omen": {
        cost: 3,
        atk: 1,
        hp: 1,
        effectId: "deathrattle_summon_morgott",
        effectTiming: "deathrattle",
        keywords: ["Deathrattle"],
        effect: "Deathrattle: Summon Morgott, the Omen King (3/3)",
      },
      "T-1000": { cost: 5, atk: 3, hp: 5, effectId: "heal_self_full", effectTiming: "ongoing", keywords: ["Ongoing"] },
      "Silver Surfer": {
        cost: 7,
        atk: 1,
        hp: 1,
        effectId: "deathrattle_summon_galactus",
        effectTiming: "deathrattle",
        keywords: ["Deathrattle"],
        effect: "Deathrattle: Summon Galactus (8/8)",
      },
      "Pillar Men": { cost: 4, atk: 4, hp: 4, effectId: "pillar_men_kill_heal", effectTiming: "passive", keywords: ["Chained", "Passive"], effect: "Chained. Passive: Whenever Pillar Men kills a minion, restore itself to full health" },
      Cthulhu: {
        cost: 8,
        atk: 8,
        hp: 8,
        effectId: "immune_tech_minions",
        effectTiming: "passive",
        keywords: ["Chained", "Passive"],
        effect: "Chained. Passive: Immune to Tech minions",
      },
      Kizaru: { atk: 4, hp: 4 },
      "Avatar Aang": {
        cost: 6,
        atk: 2,
        hp: 3,
        effectId: "avatar_aang_awakened",
        effectTiming: "onPlay",
        keywords: ["Deathrattle"],
        effect: "Battlecry: Restore all friendly minions to full health. Deathrattle: Summon the Awakened (6/3)",
      },
      Chaos: {
        cost: 8,
        atk: 4,
        hp: 4,
        effectId: "chaos_random_summon",
        effectTiming: "onPlay",
        keywords: [],
        effect: "Battlecry: Summon a random minion from the deck",
      },
      UFO: { cost: 6, atk: 3, hp: 3, effectId: "none", effectTiming: "none", keywords: ["Divine Shield"], effect: "Divine Shield" },
      Yujiro: { atk: 4, hp: 4, effectId: "immune_nature_minions", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Immune to Nature minions" },
      Vegapunk: { effectId: "discover_tech_card", effectTiming: "onPlay", keywords: [] },
      "John Wick": { atk: 1, hp: 1, effectId: "friendly_death_buff_1_1", effectTiming: "passive" },
      Joker: { atk: 1, hp: 1, effectId: "copy_minion_to_hand", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Put a copy of a minion in your hand" },
      "Escanor \"The One\"": { cost: 8, atk: 8, hp: 4, effectId: "double_other_friendly_attack", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Double your other friendly minions attack" },
      "Lelouch Lamperouge": { cost: 8, atk: 1, hp: 1, effectId: "mind_control_enemy", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Gain control of an enemy minion" },
      "Ultron Prime": {
        cost: 7,
        atk: 5,
        hp: 3,
        effectId: "deathrattle_summon_vision",
        effectTiming: "deathrattle",
        keywords: ["Taunt", "Deathrattle"],
        effect: "Taunt. Deathrattle: Summon Vision (5/3) with Taunt",
      },
      Neo: { cost: 10, atk: 5, hp: 7, effectId: "protect_slot", effectTiming: "onPlay" },
      "Monkey D. Luffy": { cost: 8, atk: 6, hp: 4, effectId: "free_chained_shield", effectTiming: "onPlay" },
      Meruem: { cost: 6, atk: 4, hp: 5, effectId: "meruem_kill_copy", effectTiming: "passive" },
      "The Driller": { cost: 5, atk: 1, hp: 1, effectId: "consume_tech_4_hp", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Consume an enemy Tech minion with 4 HP or lower" },
      Gums: { cost: 3, atk: 1, hp: 1, effectId: "consume_nature_4_hp", effectTiming: "onPlay" },
      "Thirteen Lords of Chaos": { atk: 4, hp: 2, effectId: "deathrattle_summon_drakath", effectTiming: "deathrattle", keywords: ["Deathrattle"] },
      "Sir Nighteye": { atk: 1, hp: 1, effectId: "reveal_top_deck", effectTiming: "passive", keywords: ["Passive"] },
      "Black Ops": {
        cost: 2,
        atk: 2,
        hp: 2,
        effectId: "black_ops_ignore_taunt",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Ignore Taunt",
      },
      "The Five Convicts": { cost: 3, atk: 5, hp: 1, keywords: ["Taunt"], effectId: "none", effectTiming: "none", effect: "Taunt" },
      "Doctor Octopus": { cost: 4, atk: 3, hp: 3, effectId: "destroy_relic", effectTiming: "onPlay" },
      "The 7 Heroic Spirits": { cost: 7, atk: 2, hp: 2, effectId: "heroic_relics" },
      "Aladdin Lamp": { atk: 5, hp: 4, effectId: "aladdin_wish", effectTiming: "onPlay" },
      "The Mask": { cost: 6, atk: 4, hp: 3, effectId: "transform_random_allies_up", effectTiming: "onPlay", keywords: [] },
      Yubaba: { effectId: "devolve_enemy_minions", effectTiming: "onPlay", keywords: [] },
      V: { effectId: "deathrattle_random_evil", effectTiming: "deathrattle", keywords: ["Deathrattle"], effect: "Deathrattle: Destroy a random Evil minion, no matter friendly or not, and deal 4 damage to your own Core" },
      "Time Bomb": { atk: 0, hp: 9, effectId: "time_bomb_destroy_all", effectTiming: "ongoing", keywords: [] },
      Doomsday: {
        cost: 9,
        atk: 7,
        hp: 6,
        effectId: "camp_immunity_on_hit",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: After it is attacked, gain immunity to that enemies Camp type of attack for the next 3 enemy turns",
      },
      "Giant Tree": { effectTiming: "passive", keywords: ["Passive"], effectId: "buff_all_nature_2_1", effect: "Passive: All other friendly Nature minions have +2/+1" },
      "Elden Beast": {
        cost: 6,
        camp: "Magic",
        effectId: "elden_beast_neutral_magic_atk",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: All friendly Neutral or Magic minions have +2 ATK",
      },
      Darkwing: { effectTiming: "deathrattle", keywords: ["Deathrattle"], effectId: "kill_back", effect: "Deathrattle: The minion which kills this minion also dies right after" },
      "Dr. Heinz Doofenshmirtz": { effect: "Ongoing: 50% to die and 50% to gain +2/+1" },
      "G-Man": { atk: 3, hp: 6, effectId: "stasis_enemy", effectTiming: "onPlay", keywords: [] },
      Superman: { atk: 6, hp: 6, effectId: "superman_damage_cap_3", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Friendly Good minions cannot lose more than 3 HP at once" },
      "Darth Vader": {
        atk: 3,
        hp: 2,
        effectId: "vader_chain_or_destroy",
        effectTiming: "onPlay",
        keywords: [],
        effect: "Battlecry: Choose an enemy minion. Set its ATK to 1 and Chain it",
      },
      Dumbledore: {
        atk: 2,
        hp: 4,
        effectId: "dumbledore_cleanse",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Friendly minions cannot be Silenced, Frozen, or Chained. Undo any such curses",
      },
      Gojo: { atk: 4, hp: 8, effectId: "yoda_global_silence", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: All enemy minions are temporarily silenced (until Gojo dies)" },
      "Rennala Queen of the Full Moon": { atk: 2, hp: 3, effectId: "rebirth_friendly_dead", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Rebirth a random friendly minion that died this game" },
      "Kagaya Ubuyashiki": { atk: 1, hp: 1, effectId: "discover_random_keyword_minion", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Discover a random Taunt, Divine Shield, and Passive minion in the deck. Draw one" },
      Cecil: { atk: 1, hp: 1, effectId: "bounce_friendly", effectTiming: "onPlay", keywords: [] },
      "Giorno - Gold Experience Requiem": { cost: 10, atk: 4, hp: 8, effectId: "slot_permanent_chain", effectTiming: "onPlay", keywords: [] },
      Avengers: { atk: 4, hp: 4, effectId: "invuln_with_good_ally", effectTiming: "passive", keywords: ["Passive"] },
      "General Grievous": { atk: 3, hp: 3, alignment: "Evil", effectId: "grievous_on_kill_atk", effectTiming: "passive", keywords: ["Passive"] },
      Buddha: { atk: 3, hp: 4, effectId: "buddha_purify", effectTiming: "onPlay", keywords: [] },
      "Deep Sea King": { atk: 4, hp: 4, effectId: "deep_sea_discount", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Costs 3 less while any minion is Frozen or Chained" },
      "Seven Deadly Sins": { atk: 4, hp: 5, effectId: "summon_sins", effectTiming: "onPlay", keywords: [] },
      "Elder Centipede": { cost: 7, atk: 5, hp: 6, effectId: "self_buff_2", effectTiming: "ongoing", keywords: ["Ongoing"] },
      "All Might": {
        atk: 4,
        hp: 5,
        effectId: "all_enemy_atk_down_2",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: While on the board, every enemy minion has -2 ATK",
      },
      "Fantastic Four": {
        cost: 4,
        atk: 2,
        hp: 2,
        effectId: "fantastic_four_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Your first 4 board slots each give +1/+1",
      },
      Shibukawa: {
        cost: 1,
        atk: 1,
        hp: 1,
        effectId: "shibukawa_defense_damage_2x",
        effectTiming: "passive",
        keywords: ["Divine Shield", "Passive"],
        effect: "Divine Shield. Passive: Do 2x damage when defending against an attack",
      },
      Sans: { cost: 4, atk: 2, hp: 1, effectId: "dodge_80", effect: "Passive: Evade 80% of attacks" },
      "Doom Slayer": { cost: 8, atk: 3, hp: 8, effectId: "doom_evil_slayer", effectTiming: "passive", keywords: ["Passive"] },
      Ragnaros: { cost: 6, atk: 6, hp: 6, effectId: "ragnaros_ongoing_burn", effectTiming: "ongoing", keywords: ["Cannot Attack", "Ongoing"] },
      Musashi: { atk: 2, hp: 1 },
      Illumi: { atk: 1, hp: 1 },
      "Grand Master Yoda": { atk: 5, hp: 5, effectId: "yoda_lowest_atk_buff", effectTiming: "ongoing", keywords: ["Cannot Attack", "Ongoing"] },
      King: { atk: 0, hp: 7, effectId: "king_attack_lock_random", effectTiming: "passive", keywords: ["Cannot Attack", "Passive"] },
      "Dominion Authority": { atk: 4, hp: 5, effectId: "dominion_authority", effectTiming: "passive", keywords: ["Passive"] },
      Kratos: {
        cost: 6,
        atk: 2,
        hp: 6,
        effectId: "kratos_lockdown",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Your opponent cannot play Ascension Relics or use Hero power",
      },
      "Ten Commandments": { atk: 3, hp: 5, effectId: "ten_commandments_first_attack", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: The first enemy minion to attack each turn is Chained" },
      "Nine Hashira": { atk: 3, hp: 3, effectId: "hashira_focus_attack", effectTiming: "onPlay", keywords: [] },
      "Kiritsugu Emiya": { atk: 1, hp: 1, effectId: "freeze_and_silence_enemy", effectTiming: "onPlay", keywords: [] },
      Meteor: {
        cost: 8,
        atk: 4,
        hp: 3,
        effectId: "aoe_all_4",
        effectTiming: "onPlay",
        keywords: [],
        effect: "Battlecry: Deal 4 damage to all other minions",
        origin: "Basic",
      },
      "Planetary Defense Grid": {
        cost: 9,
        atk: 4,
        hp: 8,
        effectId: "planetary_defense_grid_taunt_buff",
        effectTiming: "passive",
        keywords: ["Taunt", "Passive"],
        effect: "Taunt. Passive: All other Taunt minions have +2/+2",
        origin: "Basic",
      },
      "Black Hole": {
        cost: 10,
        atk: 7,
        hp: 4,
        effectId: "black_hole_deathrattle",
        effectTiming: "deathrattle",
        keywords: ["Deathrattle"],
        effect: "Deathrattle: Silence then destroy all minions",
        origin: "Basic",
      },
      "Motoko Kusanagi": {
        cost: 4,
        atk: 2,
        hp: 1,
        rarity: "Yellow",
        camp: "Tech",
        alignment: "Good",
        effectId: "motoko_kusanagi",
        effectTiming: "onPlay",
        effect: "Battlecry: Take control of an enemy Tech minion with 4 HP or less until the end of your next turn",
        origin: "Ghost in the Shell",
      },
    };
    for (const [name, fields] of Object.entries(expected)) {
      const card = cards.find((entry) => entry.name === name);
      expect(card, name).toMatchObject(fields);
    }
  });

  it("loads Rudeus Greyrat and Prince Lloyd with their requested card text", () => {
    expect(cards.find((card) => card.name === "Rudeus Greyrat")).toMatchObject({
      cost: 4,
      atk: 2,
      hp: 2,
      keywords: ["Divine Shield", "Passive"],
      effectId: "rudeus_hero_power_free",
      effectTiming: "passive",
      effect: "Divine Shield. Passive: Your Hero Power costs 0",
      origin: "Mushoku Tensei",
    });
    expect(cards.find((card) => card.name === "Prince Lloyd")).toMatchObject({
      cost: 6,
      atk: 2,
      hp: 2,
      rarity: "Purple",
      keywords: ["Divine Shield", "Passive"],
      effectId: "prince_lloyd_damage_ward",
      effectTiming: "passive",
      effect: "Divine Shield. Passive: Other friendly minions take 1 less damage",
      origin: "7th Prince",
    });
  });

  it("Eye of Sauron taxes every enemy card while its passive is active", () => {
    const state = mainState("eye-of-sauron-tax");
    state.cheatMode = false;
    state.players[1].board[0] = minion("Eye of Sauron", 1);
    state.players[0].hand = [cardId("John Wick")];
    state.players[0].mana = 1;

    expect(getLegalActions(state, library)).not.toContainEqual({ type: "play_card", player: 0, handIndex: 0, slotIndex: 0 });

    state.players[0].mana = 2;
    expect(getLegalActions(state, library)).toContainEqual({ type: "play_card", player: 0, handIndex: 0, slotIndex: 0 });
    const after = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library).state;
    expect(after.players[0].mana).toBe(0);
    expect(after.players[0].board[0]?.name).toBe("John Wick");

    after.players[1].board[0]!.silenced = true;
    after.players[0].hand = [cardId("John Wick")];
    after.players[0].mana = 1;
    expect(getLegalActions(after, library)).toContainEqual({ type: "play_card", player: 0, handIndex: 0, slotIndex: 1 });
  });

  it("Dumbledore cleanses existing disables and blocks new Silence, Freeze, and Chained", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { silenced: true });
    state.players[0].board[2] = minion("Zoro", 0, { frozen: true, thawPending: true, attacksUsed: 1 });
    state.players[0].board[3] = minion("John Wick", 0, { chained: 2 });

    const afterPlay = play(state, 0, "Dumbledore", 0);
    expect(afterPlay.players[0].board[0]).toMatchObject({ atk: 2, hp: 4, silenced: false, frozen: false });
    expect(afterPlay.players[0].board[1]).toMatchObject({ silenced: false });
    expect(afterPlay.players[0].board[2]).toMatchObject({ frozen: false, thawPending: false, attacksUsed: 0 });
    expect(afterPlay.players[0].board[3]).toMatchObject({ chained: 0 });

    const frozenAttempt = play(afterPlay, 1, "Dio Brando", 0);
    expect(frozenAttempt.players[0].board[0]?.frozen).toBe(false);
    expect(frozenAttempt.players[0].board[1]?.frozen).toBe(false);
    expect(frozenAttempt.players[0].board[2]?.frozen).toBe(false);

    const silencedAttempt = play(frozenAttempt, 1, "Aizawa", 1);
    const targetIndex = silencedAttempt.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const cleansed = choose(silencedAttempt, targetIndex);
    expect(cleansed.players[0].board[1]?.silenced).toBe(false);

    const protectedChain = mainState("dumbledore-blocks-chain");
    protectedChain.players[0].board[0] = minion("Dumbledore", 0);
    protectedChain.players[0].board[1] = minion("John Wick", 0, { chained: 2 });
    const vaderPending = play(protectedChain, 1, "Darth Vader", 0);
    expect((vaderPending.pendingTarget?.options ?? []).some((option) => option.owner === 0 && option.slot === 1)).toBe(false);
    expect(vaderPending.players[0].board[1]).toMatchObject({ chained: 0 });
  });

  it("Gojo silences enemy minions while alive, then releases them when he dies", () => {
    const state = mainState();
    state.players[1].board[0] = minion("John Wick", 1);
    state.players[1].board[1] = minion("Zoro", 1);

    const afterPlay = play(state, 0, "Gojo", 2);
    expect(afterPlay.players[0].board[2]).toMatchObject({ atk: 4, hp: 8 });
    expect(afterPlay.players[1].board[0]?.silenced).toBe(true);
    expect(afterPlay.players[1].board[1]?.silenced).toBe(true);

    const later = play(afterPlay, 1, "John Wick", 2);
    expect(later.players[1].board[2]?.silenced).toBe(true);

    later.players[1].board[3] = minion("Zoro", 1, { atk: 99, hp: 20, maxHp: 20, sleeping: false });
    const afterGojoDies = applyAction(
      { ...later, activePlayer: 1 },
      { type: "attack_minion", player: 1, attackerSlot: 3, targetSlot: 2 },
      library,
    ).state;
    expect(afterGojoDies.players[0].board[2]).toBeNull();
    expect(afterGojoDies.players[1].board[0]?.silenced).toBe(false);
    expect(afterGojoDies.players[1].board[1]?.silenced).toBe(false);
    expect(afterGojoDies.players[1].board[2]?.silenced).toBe(false);
  });

  it("Cecil returns the chosen friendly minion to hand", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 6 });
    state.players[0].board[2] = minion("Zoro", 0, { hp: 2, maxHp: 3 });

    const asking = play(state, 0, "Cecil", 0);
    expect(asking.players[0].board[0]).toMatchObject({ keywords: [], divineShield: false });
    expect(asking.pendingTarget?.options).not.toContainEqual({ owner: 0, slot: 0 });
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const returned = choose(asking, targetIndex);
    expect(returned.players[0].board[1]).toBeNull();
    expect(returned.players[0].hand).toContain(cardId("John Wick"));
    expect(returned.players[0].board[2]).toMatchObject({ hp: 2, maxHp: 3 });
  });

  it("Angstrom Levy cannot replace himself", () => {
    const state = mainState("angstrom-no-self");
    state.players[0].board[1] = minion("John Wick", 0);
    state.players[1].board[0] = minion("Zoro", 1);
    const asking = play(state, 0, "Angstrom Levy", 0);
    expect(asking.pendingTarget?.options).not.toContainEqual({ owner: 0, slot: 0 });
    expect(asking.pendingTarget?.options).toEqual(
      expect.arrayContaining([
        { owner: 0, slot: 1 },
        { owner: 1, slot: 0 },
      ]),
    );
  });

  it("Angstrom Levy buries the displaced minion and never summons it straight back", () => {
    const state = mainState("angstrom-bottom");
    state.players[0].board[1] = minion("John Wick", 0);
    state.players[1].board[0] = minion("Zoro", 1);
    const sentinel = state.deck[state.deck.length - 1];
    state.deck = state.deck.slice(0, -1);
    state.bottomDeck = [sentinel];
    const asking = play(state, 0, "Angstrom Levy", 0);
    const targetIndex = asking.pendingTarget!.options.findIndex((option) => option.owner === 0 && option.slot === 1);
    const after = choose(asking, targetIndex);

    const buried = cardId("John Wick");
    // The replacement is drawn from the pile as it stood BEFORE the burial, so
    // the one copy of the card just removed cannot come back into its own slot.
    expect(after.players[0].board[1]?.cardId).not.toBe(buried);
    // And "the bottom of the deck" has to BE the bottom. `drawFromDeck` refills
    // with a reversed `bottomDeck`, so index 0 is dealt last and the end of the
    // array is dealt first — appending put the buried card back on top. The
    // sentinel below is what makes this assertion able to fail: with an empty
    // pile both ends of a one-item array are the same place.
    expect(after.bottomDeck.length).toBeGreaterThan(1);
    expect(after.bottomDeck[0]).toBe(buried);
    expect(after.bottomDeck[after.bottomDeck.length - 1]).toBe(sentinel);
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
    // The damage is the claim, not the total. Reading it as a delta means a
    // change to starting core health cannot break a card test again.
    expect(state.players[0].health - after.players[0].health).toBe(4);
  });

  it("V cannot randomly destroy an Evil minion that is Chained", () => {
    const state = mainState("v-chained-target");
    state.players[0].board[0] = minion("V", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[1] = minion("Aizen", 0, { chained: 2 });
    state.players[1].board[0] = minion("Zoro", 1, { atk: 99, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[0].board[1]).toMatchObject({ name: "Aizen", chained: 2 });
    expect(state.players[0].health - after.players[0].health).toBe(4);
  });

  it("Morpheus chooses an alignment, then discovers three matching minions to draw", () => {
    const state = mainState();
    const asking = play(state, 0, "Morpheus", 0);
    expect(asking.pendingTarget?.labelOptions).toEqual([
      { label: "Red Pill — Good", value: "good" },
      { label: "Blue Pill — Evil", value: "evil" },
    ]);

    const goodOffers = choose(asking, 0);
    expect(goodOffers.pendingTarget?.labelOptions).toHaveLength(3);
    const offeredGood = goodOffers.pendingTarget!.labelOptions.map((option) => option.value);
    expect(offeredGood.every((id) => cards.find((card) => card.id === id)?.alignment === "Good")).toBe(true);

    const selectedGood = choose(goodOffers, 1);
    expect(selectedGood.players[0].hand).toContain(offeredGood[1]);
    expect(selectedGood.deck).not.toContain(offeredGood[1]);

    const evilOffers = choose(play(mainState("morpheus-blue"), 0, "Morpheus", 0), 1);
    expect(evilOffers.pendingTarget?.labelOptions).toHaveLength(3);
    expect(
      evilOffers.pendingTarget!.labelOptions.every(
        (option) => cards.find((card) => card.id === option.value)?.alignment === "Evil",
      ),
    ).toBe(true);
  });

  it("Light Yagami destroys the Nature enemy he is pointed at, and only Nature", () => {
    const state = mainState("light-yagami-battlecry");
    state.players[1].board[0] = minion("John Wick", 1); // Nature
    state.players[1].board[1] = minion("Modern Tank", 1); // Tech
    state.players[1].board[2] = minion("Zoro", 1); // Nature
    const asking = play(state, 0, "Light Yagami", 0);
    // Chosen, not random (owner's ruling, 2 September 2026). Only the two
    // Nature minions are offered, so the Tech one is not a lucky survival.
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.options).toHaveLength(2);
    const resolved = choose(asking, 1);
    expect(resolved.players[1].board[2]).toBeNull();
    expect(resolved.players[1].board[0]).not.toBeNull();
    expect(resolved.players[1].board[1]).not.toBeNull();
  });

  it("Light Yagami may point at an ALL-camp minion", () => {
    // ALL counts as every camp for HOSTILE targeting now. It used to duck every
    // camp-specific answer in the game while collecting all three camps' buffs.
    const state = mainState("light-yagami-all-camp");
    state.players[1].board[0] = minion("John Wick", 1, { camp: "ALL" });
    // A single legal victim resolves without a prompt, which is the engine's
    // normal handling of a forced choice.
    expect(play(state, 0, "Light Yagami", 0).players[1].board[0]).toBeNull();
  });

  it("Light Yagami has no Deathrattle", () => {
    const state = mainState("light-yagami-deathrattle");
    state.players[0].board[0] = minion("Light Yagami", 0, { hp: 1, maxHp: 1, sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1); // Nature, and safe now
    state.players[1].board[1] = minion("Modern Tank", 1, { atk: 9, hp: 9, maxHp: 9, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]).toBeNull();
    // He dies and takes nobody with him.
    expect(after.players[1].board[0]).not.toBeNull();
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

  it("Time Bomb destroys every minion on its owner's turn", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Time Bomb", 0);
    state.players[1].board[0] = minion("John Wick", 1, { hp: 10, maxHp: 10 });
    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toBeNull();
  });

  it("Time Bomb waits for an enemy controller's next turn, not the opponent's intervening turn", () => {
    const state = mainState("time-bomb-enemy-turn");
    state.activePlayer = 1;
    state.players[1].board[0] = minion("Time Bomb", 1);
    state.players[0].board[0] = minion("John Wick", 0, { hp: 10, maxHp: 10 });

    const myTurn = endTurn(state, 1);
    expect(myTurn.activePlayer).toBe(0);
    expect(myTurn.players[0].board[0]?.hp).toBe(10);
    expect(myTurn.players[1].board[0]).not.toBeNull();

    const enemyTurn = endTurn(myTurn, 0);
    expect(enemyTurn.activePlayer).toBe(1);
    expect(enemyTurn.players[0].board[0]).toBeNull();
    expect(enemyTurn.players[1].board[0]).toBeNull();
  });

  it("Margit summons Morgott with his dedicated token art", () => {
    const state = mainState("morgott-token-art");
    state.players[0].board[0] = minion("Margit the Fell Omen", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = minion("Zoro", 1, { atk: 99, hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toMatchObject({ name: "Morgott, the Omen King", atk: 3, hp: 3, art: "/card-art/raw/token-morgott.webp" });
  });

  it("Giant Tree's Nature aura is removed when the Tree leaves play", () => {
    const state = mainState("giant-tree-transient");
    state.players[0].board[1] = minion("Zoro", 0, { camp: "Nature", atk: 3, hp: 3, maxHp: 3 });
    const withTree = play(state, 0, "Giant Tree", 0);
    expect(withTree.players[0].board[1]).toMatchObject({ atk: 5, hp: 4, maxHp: 4 });

    withTree.players[1].board[0] = minion("Zoro", 1, { atk: 99, hp: 20, maxHp: 20, sleeping: false });
    const afterDeath = applyAction({ ...withTree, activePlayer: 1 }, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(afterDeath.players[0].board[0]).toBeNull();
    expect(afterDeath.players[0].board[1]).toMatchObject({ atk: 3, maxHp: 3 });
  });

  it("ALL receives positive camp auras but is excluded from camp-specific debuffs", () => {
    const natureAura = mainState("all-nature-aura");
    natureAura.players[0].board[1] = minion("Zoro", 0, { camp: "ALL", atk: 3, hp: 3, maxHp: 3 });
    const withTree = play(natureAura, 0, "Giant Tree", 0);
    expect(withTree.players[0].board[1]).toMatchObject({ atk: 5, hp: 4, maxHp: 4 });

    const magicAura = mainState("all-magic-aura");
    magicAura.players[0].board[0] = minion("Giant Crystal", 0);
    magicAura.players[0].board[1] = minion("Zoro", 0, { camp: "ALL", atk: 3, hp: 3, maxHp: 3 });
    magicAura.players[0].board[2] = minion("John Wick", 0, { camp: "Nature", atk: 2, hp: 3, maxHp: 3 });
    const afterCrystal = endTurn(endTurn(magicAura, 0), 1);
    expect(afterCrystal.players[0].board[1]).toMatchObject({ atk: 5, hp: 4, maxHp: 4 });
    expect(afterCrystal.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });

    const debuff = mainState("all-nature-debuff");
    debuff.players[1].board[0] = minion("Zoro", 1, { camp: "ALL", atk: 3, hp: 4, maxHp: 4 });
    const asking = play(debuff, 0, "Gums", 0);
    expect(asking.pendingTarget?.options ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ owner: 1, slot: 0 })]),
    );
  });

  it("Dr. Heinz's winning coin flip grants +2/+1", () => {
    for (let offset = 0; offset < 1000; offset += 1) {
      const seed = 0x80000000 + offset;
      const state = mainState(`heinz-${seed}`);
      state.rngSeed = seed;
      state.players[0].board[0] = minion("Dr. Heinz Doofenshmirtz", 0);
      const after = endTurn(endTurn(state, 0), 1);
      const heinz = after.players[0].board[0];
      if (heinz && heinz.atk > 1) {
        expect(heinz).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
        return;
      }
    }
    throw new Error("No winning Dr. Heinz coin flip found in deterministic seed sweep");
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
    state.players[0].board[3] = minion("Zoro", 0);
    const asking = play(state, 0, "Meleoron", 0);
    const after = asking.pendingTarget
      ? choose(asking, asking.pendingTarget.options.findIndex((option) => option.slot === 2))
      : asking;
    after.activePlayer = 1;
    expect(getLegalActions(after, library).some((action) => action.type === "attack_minion" && action.targetSlot === 2)).toBe(false);
    expect(after.players[0].board[2]?.protectedByMeleoron).toBe(after.players[0].board[0]?.instanceId);

    const targeted = play(after, 1, "Aizawa", 1);
    expect(targeted.pendingTarget?.options).toEqual([
      { owner: 0, slot: 0 },
      { owner: 0, slot: 3 },
    ]);
    const unprotectedIndex = targeted.pendingTarget!.options.findIndex((option) => option.owner === 0 && option.slot === 3);
    const resolved = choose(targeted, unprotectedIndex);
    expect(resolved.players[0].board[2]?.silenced).toBe(false);
    expect(resolved.players[0].board[3]?.silenced).toBe(true);
  });

  it("Meleoron's hidden ally also ignores Taunt, which is the other half of the card", () => {
    const state = mainState("meleoron-taunt");
    state.players[0].board[2] = minion("Zoro", 0, { sleeping: false });
    state.players[1].board[0] = minion("Dragon", 1);
    const asking = play(state, 0, "Meleoron", 0);
    const hidden = asking.pendingTarget
      ? choose(asking, asking.pendingTarget.options.findIndex((option) => option.slot === 2))
      : asking;

    expect(hidden.players[1].board[0]?.keywords).toContain("Taunt");
    // Only the untargetable half was wired, so the hidden ally was still herded
    // into the enemy Taunt like anyone else and could never reach the core.
    expect(getLegalActions(hidden, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 2 });
  });

  it("Knov keeps two minions in the pocket room and returns the higher ATK one", () => {
    const state = mainState();
    state.players[0].board[1] = minion("John Wick", 0, { atk: 5, hp: 5, maxHp: 5 });
    state.players[1].board[0] = minion("Sandworm", 1, { atk: 1, hp: 3, maxHp: 3 });
    const first = play(state, 0, "Knov", 2);
    const afterFriendly = first.pendingTarget ? choose(first, 0) : first;
    const afterEnemy = afterFriendly.pendingTarget ? choose(afterFriendly, 0) : afterFriendly;
    expect(afterEnemy.pocketRooms).toHaveLength(1);
    const firstRound = endTurn(endTurn(afterEnemy, 0), 1);
    expect(firstRound.pocketRooms).toHaveLength(1);
    expect(firstRound.players[0].board[1]).toBeNull();
    const secondRound = endTurn(endTurn(firstRound, 0), 1);
    expect(secondRound.pocketRooms).toHaveLength(0);
    expect(secondRound.players[0].board[1]?.name).toBe("John Wick");
    expect(secondRound.players[1].board[0]).toBeNull();
  });

  it("Doctor Strange lets the opponent choose one bargain", () => {
    const state = mainState("strange-bargain");
    state.players[0].board[2] = minion("John Wick", 0);
    const asking = play(state, 0, "Doctor Strange", 1);
    expect(asking.pendingTarget?.kind).toBe("option");
    expect(asking.pendingTarget?.player).toBe(1);
    const manaChoice = choose(asking, 2);
    expect(manaChoice.players[0].health).toBe(75);
    expect(manaChoice.players[1].manaPenaltyNextTurn).toBe(5);
    expect(manaChoice.players[0].board[2]?.name).toBe("John Wick");
    const nextOwnTurn = endTurn(endTurn(manaChoice, 0), 1);
    expect(nextOwnTurn.players[1].maxMana).toBe(0);
    expect(nextOwnTurn.players[1].manaPenaltyNextTurn).toBe(0);

    const healthChoice = choose(play(mainState("strange-bargain-health"), 0, "Doctor Strange", 1), 0);
    expect(healthChoice.players[0].health).toBe(75);
    // The bargain costs the opponent 10 core, read against the untouched caster.
    expect(healthChoice.players[1].health).toBe(healthChoice.players[0].health - 10);

    const minionChoice = mainState("strange-bargain-minion");
    minionChoice.players[1].board[3] = minion("Zoro", 1);
    const claimed = choose(play(minionChoice, 0, "Doctor Strange", 1), 1);
    expect(claimed.players[1].board[3]).toBeNull();
  });

  it("Monkey D. Luffy frees chained allies for an immediate shielded swing", () => {
    const state = mainState("luffy-chain-break");
    state.players[0].board[1] = minion("John Wick", 0, { chained: 2, sleeping: true });
    state.players[0].board[2] = minion("Zoro", 0, { chained: 0, sleeping: true });
    const after = play(state, 0, "Monkey D. Luffy", 0);
    expect(after.players[0].board[1]).toMatchObject({ chained: 0, sleeping: false, divineShield: true });
    expect(after.players[0].board[2]?.sleeping).toBe(true);
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
    state.players[0].board[2] = minion("Zoro", 0, { camp: "Tech", atk: 3, hp: 3, maxHp: 3 });
    state.players[0].board[3] = minion("John Wick", 0, { camp: "Nature", atk: 2, hp: 3, maxHp: 3 });
    const afterPlay = play(state, 0, "GLaDOS", 1);
    expect(afterPlay.players[0].board[0]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(afterPlay.players[0].board[0]?.keywords).toContain("Taunt");
    expect(afterPlay.players[0].board[2]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });
    expect(afterPlay.players[0].board[2]?.keywords).toContain("Taunt");
    expect(afterPlay.players[0].board[3]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
    afterPlay.players[0].board[1] = null;
    const refreshed = applyAction(afterPlay, { type: "end_turn", player: 0 }, library).state;
    expect(refreshed.players[0].board[0]).toMatchObject({ atk: 2, maxHp: 2 });
    expect(refreshed.players[0].board[2]).toMatchObject({ atk: 3, maxHp: 3 });
    expect(refreshed.players[0].board[3]).toMatchObject({ atk: 2, maxHp: 3 });
  });

  it("Fantastic Four gives its first four slots +1/+1, and takes it back when killed", () => {
    const state = mainState();
    for (const slot of [0, 1, 2, 3]) state.players[0].board[slot] = minion("John Wick", 0, { effectId: "none", effectTiming: "none", keywords: [] });
    const placed = play(state, 0, "Fantastic Four", 4);
    for (const slot of [0, 1, 2, 3]) {
      expect(placed.players[0].board[slot]?.atk).toBe(2);
      expect(placed.players[0].board[slot]?.maxHp).toBe(2);
    }

    placed.players[1].board[0] = minion("Zoro", 1, { atk: 99, sleeping: false, hp: 99, maxHp: 99 });
    placed.activePlayer = 1;
    const after = applyAction(placed, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 4 }, library).state;
    expect(after.players[0].board[4]).toBeNull();
    for (const slot of [0, 1, 2, 3]) {
      expect(after.players[0].board[slot]?.atk).toBe(1);
      expect(after.players[0].board[slot]?.maxHp).toBe(1);
    }
  });

  it("Ragnaros burns at the start of its controller's turn and never attacks", () => {
    const state = mainState();
    state.players[0].board[0] = minion("Ragnaros", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });
    expect(getLegalActions(state, library).some((action) => action.type === "attack_core")).toBe(false);

    // Round trip to the same seat: an Ongoing fires when its owner's turn opens.
    const after = endTurn(endTurn(state, 0), 1);
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

  it("The 7 Heroic Spirits arms every friendly minion EXCEPT itself", () => {
    const state = mainState();
    state.players[0].board[0] = minion("John Wick", 0);
    const after = play(state, 0, "The 7 Heroic Spirits", 1);
    expect(after.players[0].board[0]?.relic).not.toBeNull();
    // Owner's ruling, 2 September 2026: a 2/2 arming itself was the best line
    // the card had, and it made a board effect read as a self-buff.
    expect(after.players[0].board[1]?.relic).toBeNull();
  });

  it("The 7 Heroic Spirits keeps handing out relics past a bearer that can hold none", () => {
    const state = mainState("heroic-skip");
    // Mjolnir and Excalibur refuse a non-Good bearer, so a board can contain a
    // minion with nothing left it may equip. That used to `break` the grant and
    // rob every ally standing behind it.
    state.deck = [relicId("Mjolnir"), relicId("Excalibur"), ...state.deck.filter((id) => !id.startsWith("r"))];
    state.bottomDeck = [];
    state.players[0].board[0] = minion("John Wick", 0); // Evil
    state.players[0].board[2] = minion("Gandalf the White", 0); // Good

    const after = play(state, 0, "The 7 Heroic Spirits", 1);

    expect(after.players[0].board[0]?.relic).toBeNull();
    expect(after.players[0].board[2]?.relic).not.toBeNull();
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

  it("Ainz sets every enemy minion's HP to 1", () => {
    const state = mainState("ainz-set-hp");
    state.players[1].board[0] = minion("John Wick", 1, { hp: 8, maxHp: 8 });
    state.players[1].board[1] = minion("Zoro", 1, { hp: 5, maxHp: 7 });
    const after = play(state, 0, "Ainz Ooal Gown", 0);
    expect(after.players[1].board[0]).toMatchObject({ hp: 1, maxHp: 8 });
    expect(after.players[1].board[1]).toMatchObject({ hp: 1, maxHp: 7 });
  });

  it("Avatar Aang heals the friendly board and summons Awakened on death", () => {
    const state = mainState("aang-awakened");
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 4 });
    const afterPlay = play(state, 0, "Avatar Aang", 0);
    expect(afterPlay.players[0].board[1]?.hp).toBe(4);
    expect(afterPlay.players[0].board[0]).toMatchObject({ name: "Avatar Aang", atk: 2, hp: 3 });

    const attacker = minion("Zoro", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    afterPlay.players[1].board[0] = attacker;
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(
      afterPlay,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toMatchObject({ name: "Awakened", atk: 6, hp: 3, cost: 6 });
    expect(afterDeath.players[0].board[0]).toMatchObject({
      art: "/card-art/raw/token-awakened.webp",
      suppressArrivalTheme: false,
    });
  });

  it("Chaos summons a random deck minion on play, and nothing more when it dies", () => {
    const state = mainState("chaos-random-summon");
    const zoroId = cardId("Zoro");
    state.deck = [zoroId, zoroId];
    state.bottomDeck = [];

    const afterPlay = play(state, 0, "Chaos", 0);
    expect(afterPlay.players[0].board[1]).toMatchObject({ name: "Zoro", cardId: zoroId });
    expect(afterPlay.deck).toEqual([zoroId]);

    // The Deathrattle half was removed in the 4/4 rework: dying is now just dying.
    afterPlay.players[1].board[0] = minion("Zoro", 1, { atk: 9, hp: 20, maxHp: 20, sleeping: false });
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(
      afterPlay,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toBeNull();
    expect(afterDeath.deck).toEqual([zoroId]);
  });

  it("Giorno permanently Chains every minion that occupies the chosen slot", () => {
    const state = mainState("giorno-permanent-chain");
    state.players[1].board[1] = minion("Zoro", 1);

    const asking = play(state, 0, "Giorno - Gold Experience Requiem", 0);
    expect(asking.pendingTarget?.kind).toBe("slot");
    const targetIndex = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 1);
    const marked = choose(asking, targetIndex);
    expect(marked.players[1].slotAuras).toContainEqual({
      slot: 1,
      auraId: "slot_chain",
      sourceName: "Giorno - Gold Experience Requiem",
    });
    expect(marked.players[1].board[1]?.chained).toBe(3);

    const replacement = { ...marked, players: [...marked.players] as GameState["players"] } as GameState;
    replacement.players[1] = { ...marked.players[1], board: [...marked.players[1].board] };
    replacement.players[1].board[1] = minion("John Wick", 1);
    const enforced = endTurn(replacement, 0);
    expect(enforced.players[1].board[1]?.chained).toBe(3);
  });

  it("Vegapunk discovers three Tech cards and draws the chosen one", () => {
    const state = mainState("vegapunk-tech-discover");
    const techIds = [cardId("UFO"), cardId("Ultron Prime"), cardId("Vegapunk")];
    state.deck = techIds.slice();
    const asking = play(state, 0, "Vegapunk", 0);
    expect(asking.pendingTarget?.kind).toBe("option");
    expect(asking.pendingTarget?.labelOptions).toHaveLength(3);
    const chosenId = asking.pendingTarget!.labelOptions[1].value;
    const after = choose(asking, 1);
    expect(after.players[0].hand).toContain(chosenId);
    expect(after.deck).not.toContain(chosenId);
  });

  it("Yujiro is immune to damage from Nature minions", () => {
    const state = mainState("yujiro-nature-immunity");
    state.players[0].board[0] = minion("Yujiro", 0);
    state.players[1].board[0] = minion("John Wick", 1, { atk: 4, hp: 10, maxHp: 10, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]?.hp).toBe(4);
  });

  it("UFO no longer has Nature immunity", () => {
    const state = mainState("ufo-no-nature-immunity");
    // Divine Shield off, because this test is about Nature immunity and the
    // shield would swallow the hit before immunity could be observed at all.
    state.players[0].board[0] = minion("UFO", 0, { divineShield: false });
    // 2 ATK, not 4: UFO is a 3/3 now, so a 4-ATK swing simply kills it and the
    // board slot reads null -- which proves nothing about immunity either way.
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 10, maxHp: 10, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    // 3 HP minus a full 2 damage. Immunity would have left it untouched at 3.
    expect(after.players[0].board[0]?.hp).toBe(1);
  });

  it("G-Man stores an enemy in stasis and returns it after two turns", () => {
    const state = mainState("g-man-stasis");
    state.players[1].board[0] = minion("John Wick", 1);
    state.players[1].board[2] = minion("Zoro", 1);
    const asking = play(state, 0, "G-Man", 1);
    const picked = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: 1 }, library);
    expect(picked.events).toEqual(expect.arrayContaining([expect.objectContaining({ motion: "stasis" })]));
    const stasis = picked.state;
    expect(stasis.players[1].board[2]).toBeNull();
    expect(stasis.stasis).toHaveLength(1);
    // Four counter steps, because turnNumber advances once per PLAYER turn and
    // the card promises two full ones. At +2 the victim missed a single turn.
    expect(stasis.stasis[0].returnAtTurn).toBe(stasis.turnNumber + 4);

    const oneTurnLater = endTurn(endTurn(stasis, 0), 1);
    expect(oneTurnLater.stasis).toHaveLength(1);
    expect(oneTurnLater.players[1].board[2]).toBeNull();

    const twoTurnsLater = endTurn(endTurn(oneTurnLater, 0), 1);
    expect(twoTurnsLater.stasis).toHaveLength(0);
    expect(twoTurnsLater.players[1].board[2]?.name).toBe("Zoro");
  });

  it("Darth Vader chains a target but cannot target one that is already Chained", () => {
    const state = mainState("vader-chain");
    state.players[1].board[0] = minion("John Wick", 1);
    const chained = play(state, 0, "Darth Vader", 1);
    expect(chained.players[1].board[0]).toMatchObject({ atk: 1, chained: 3 });

    const alreadyChained = mainState("vader-destroy");
    alreadyChained.players[1].board[0] = minion("John Wick", 1, { chained: 2 });
    const destroyed = play(alreadyChained, 0, "Darth Vader", 1);
    expect(destroyed.pendingTarget).toBeNull();
    expect(destroyed.players[1].board[0]).toMatchObject({ chained: 2 });
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

  it("Superman caps damage on himself AND on every friendly Good minion", () => {
    const state = mainState("superman-damage-cap");
    state.players[1].board[0] = minion("Superman", 1);
    // A Good ally standing beside him, and an Evil one that is on its own.
    state.players[1].board[1] = minion("Zoro", 1, { alignment: "Good", hp: 10, maxHp: 10 });
    state.players[1].board[2] = minion("John Wick", 1, { alignment: "Evil", hp: 10, maxHp: 10 });
    state.players[0].board[0] = minion("Modern Tank", 0, { atk: 5, hp: 40, maxHp: 40, sleeping: false });

    const onSuperman = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(onSuperman.players[1].board[0]?.hp).toBe(3);

    onSuperman.players[0].board[0]!.attacksUsed = 0;
    onSuperman.activePlayer = 0;
    const onGoodAlly = applyAction(onSuperman, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(onGoodAlly.players[1].board[1]?.hp).toBe(7);

    onGoodAlly.players[0].board[0]!.attacksUsed = 0;
    onGoodAlly.activePlayer = 0;
    const onEvilAlly = applyAction(onGoodAlly, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 2 }, library).state;
    expect(onEvilAlly.players[1].board[2]?.hp).toBe(5);
  });

  it("Deep Sea King costs 3 less while anything is Frozen or Chained", () => {
    const state = mainState("deep-sea-discount");
    const card = cards.find((entry) => entry.name === "Deep Sea King")!;
    expect(effectiveCardCost(state, 0, card)).toBe(5);

    state.players[1].board[0] = minion("Zoro", 1, { frozen: true });
    expect(effectiveCardCost(state, 0, card)).toBe(2);

    state.players[1].board[0]!.frozen = false;
    state.players[0].board[0] = minion("Zoro", 0, { chained: 2 });
    // Either board, either affliction: the card says "any minion".
    expect(effectiveCardCost(state, 0, card)).toBe(2);
  });

  it("Seven Deadly Sins fills the board with unique-keyword Sin tokens and their new art", () => {
    const after = play(mainState("sin-tokens"), 0, "Seven Deadly Sins", 0);
    const sins = after.players[0].board.filter((entry) => entry?.name === "Sin");
    expect(sins).toHaveLength(4);
    const tokenKeywords = sins.map((entry) => entry?.keywords ?? []);
    expect(tokenKeywords.every((keywords) => keywords.length === 1)).toBe(true);
    expect(tokenKeywords.map(([keyword]) => keyword).sort()).toEqual(
      ["Taunt", "Divine Shield", "Charge", "Chained"].sort(),
    );
    expect(sins.every((entry) => entry?.atk === 1 && entry?.hp === 1 && entry.art.endsWith("/token-sin.webp"))).toBe(true);
    expect(sins.every((entry) => entry?.art !== after.players[0].board[0]?.art)).toBe(true);
    expect(sins.every((entry) => entry?.suppressArrivalTheme === true)).toBe(true);
  });

  it("Black Ops ignores Taunt, Battleship buffs friendly Tech, and Star Destroyer deploys two Charge TIE Fighters", () => {
    const blackOps = mainState("black-ops-taunt");
    blackOps.players[0].board[0] = minion("Black Ops", 0, { sleeping: false });
    blackOps.players[1].board[0] = minion("John Wick", 1, { keywords: ["Taunt"], sleeping: false });
    blackOps.players[1].board[1] = minion("Zoro", 1, { sleeping: false });
    const attacks = getLegalActions(blackOps, library).filter((action) => action.type === "attack_minion");
    expect(attacks.map((action) => action.type === "attack_minion" ? action.targetSlot : -1)).toEqual([0, 1]);

    const tech = mainState("battleship-aura");
    tech.players[0].board[1] = minion("John Wick", 0, { camp: "Tech", atk: 2, hp: 2, maxHp: 2 });
    tech.players[0].board[2] = minion("Zoro", 0, { atk: 2, hp: 3, maxHp: 3 });
    tech.players[1].board[0] = minion("John Wick", 1, { camp: "Tech", atk: 3, hp: 3, maxHp: 3 });
    // +2/+1 now, off a 2/3 body (owner's ruling, 2 September 2026).
    const buffed = play(tech, 0, "Battleship", 0);
    expect(buffed.players[0].board[0]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(buffed.players[0].board[1]).toMatchObject({ atk: 4, hp: 3, maxHp: 3 });
    expect(buffed.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
    expect(buffed.players[1].board[0]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
    buffed.players[0].board[0]!.silenced = true;
    const auraRemoved = applyAction(buffed, { type: "end_turn", player: 0 }, library).state;
    expect(auraRemoved.players[0].board[0]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
    expect(auraRemoved.players[0].board[1]).toMatchObject({ atk: 2, hp: 2, maxHp: 2 });
    expect(auraRemoved.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
    expect(auraRemoved.players[1].board[0]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });

    const destroyer = play(mainState("star-destroyer-tokens"), 0, "Star Destroyer", 0);
    const fighters = destroyer.players[0].board.slice(1).filter((entry): entry is MinionInstance => Boolean(entry));
    expect(destroyer.players[0].board[0]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });
    expect(fighters).toHaveLength(2);
    expect(fighters.every((fighter) => fighter.name === "TIE Fighter" && fighter.atk === 1 && fighter.hp === 1)).toBe(true);
    expect(fighters.every((fighter) => fighter.keywords.includes("Charge") && fighter.sleeping === false)).toBe(true);
    expect(fighters.every((fighter) => fighter.art.endsWith("/token-tie-fighter.webp"))).toBe(true);
    expect(fighters.every((fighter) => fighter.suppressArrivalTheme === true)).toBe(true);
  });

  it("Planetary Defense Grid buffs every Taunt minion and loses the aura when silenced", () => {
    const state = mainState("planetary-defense-grid-aura");
    state.players[0].board[1] = minion("Dragon", 0);
    // A plain Taunt body on the far side. Wall of Flesh used to stand here and
    // now grinds the board every turn, which would measure its Ongoing rather
    // than the Grid aura this test is about.
    state.players[1].board[0] = minion("Fort", 1);
    state.players[1].board[1] = minion("John Wick", 1);
    const buffed = play(state, 0, "Planetary Defense Grid", 0);

    // "All OTHER Taunt minions", so the grid keeps its printed 4/8 rather than
    // feeding its own aura, and the buff is +2/+2.
    expect(buffed.players[0].board[0]).toMatchObject({ atk: 4, hp: 8, maxHp: 8 });
    expect(buffed.players[0].board[1]).toMatchObject({ atk: 5, hp: 7, maxHp: 7 });
    expect(buffed.players[1].board[0]).toMatchObject({ atk: 6, hp: 7, maxHp: 7 });
    expect(buffed.players[1].board[1]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });

    buffed.players[0].board[0]!.silenced = true;
    const auraGone = endTurn(buffed, 0);
    expect(auraGone.players[0].board[0]).toMatchObject({ atk: 4, hp: 8, maxHp: 8 });
    expect(auraGone.players[0].board[1]).toMatchObject({ atk: 3, hp: 5, maxHp: 5 });
    expect(auraGone.players[1].board[0]).toMatchObject({ atk: 4, hp: 5, maxHp: 5 });
  });

  it("Black Hole silences before destroying every minion, preventing their Deathrattles", () => {
    const state = mainState("black-hole-deathrattle");
    state.players[0].board[0] = minion("Black Hole", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[1] = minion("Margit the Fell Omen", 0);
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 5, maxHp: 5, sleeping: false });
    state.players[1].board[1] = minion("Dragon", 1);
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players.every((player) => player.board.every((entry) => entry === null))).toBe(true);
    expect(after.players[0].deadMinions).not.toContain("token:morgott");
  });

  it("Elder Centipede grows +2/+2 on its ongoing turn and All Might lowers enemy ATK", () => {
    const elder = mainState("elder-centipede");
    elder.players[0].board[0] = minion("Elder Centipede", 0);
    const grown = endTurn(endTurn(elder, 0), 1);
    expect(grown.players[0].board[0]).toMatchObject({ atk: 7, hp: 8, maxHp: 8 });

    // -2 ATK now, up from -1 (owner's ruling, 2 September 2026).
    const might = mainState("all-might-aura");
    might.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 5, maxHp: 5 });
    const empowered = play(might, 0, "All Might", 0);
    expect(empowered.players[1].board[0]?.atk).toBe(3);
    // A 1-ATK body floors at zero rather than going negative, which is why the
    // reduction is clamped to the target's own ATK.
    empowered.players[1].board[1] = minion("John Wick", 1, { atk: 1, hp: 5, maxHp: 5 });
    const clamped = applyAction(empowered, { type: "end_turn", player: 0 }, library).state;
    expect(clamped.players[1].board[0]?.atk).toBe(3);
    expect(clamped.players[1].board[1]?.atk).toBe(0);
    const refreshed = endTurn(clamped, 1);
    expect(refreshed.players[1].board[0]?.atk).toBe(3);
    refreshed.players[0].board[0] = null;
    const auraGone = applyAction(refreshed, { type: "end_turn", player: 0 }, library).state;
    expect(auraGone.players[1].board[0]?.atk).toBe(5);
  });

  it("a Chained passive is dormant until its chain expires", () => {
    const state = mainState("chained-passive-dormant");
    state.players[0].board[0] = minion("All Might", 0, { chained: 2 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 5, maxHp: 5 });

    const dormant = play(state, 0, "UFO", 1);
    expect(dormant.players[1].board[0]?.atk).toBe(5);

    dormant.players[0].board[0]!.chained = 0;
    const awake = play(dormant, 0, "UFO", 2);
    expect(awake.players[1].board[0]?.atk).toBe(3);
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

  it("King does not choose a Chained minion for its random attack lock", () => {
    const state = mainState("king-chain-lock");
    state.players[0].board[0] = minion("King", 0);
    state.players[1].board[0] = minion("John Wick", 1, { sleeping: false, chained: 2 });

    const enemyTurn = endTurn(state, 0);
    expect(enemyTurn.players[1].board[0]).toMatchObject({ chained: 1, attackLocked: false });
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

  it("Kratos locks the opponent's Ascension Relics and Hero Power while active", () => {
    const state = mainState("kratos-lockdown");
    state.players[0].board[0] = minion("Kratos", 0);
    state.players[1].board[0] = minion("John Wick", 1);
    state.players[1].hand = [relicId("The Holy Grail")];
    state.heroPowers[1] = HERO_POWER_UNLOCK_ORDER[0];
    state.activePlayer = 1;

    const blocked = getLegalActions(state, library);
    expect(blocked).not.toContainEqual({ type: "use_hero_power", player: 1 });
    expect(blocked.some((action) => action.type === "play_relic")).toBe(false);

    state.players[0].board[0]!.silenced = true;
    const released = getLegalActions(state, library);
    expect(released).toContainEqual({ type: "use_hero_power", player: 1 });
    expect(released).toContainEqual({ type: "play_relic", player: 1, handIndex: 0, slotIndex: 0 });
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

  it("Nine Hashira reaches minions standing behind an empty slot", () => {
    const state = mainState("hashira-gap");
    // Slot 0 empty on purpose: the loop used to `break` on it and the card did
    // nothing at all, however many minions were standing further along.
    state.players[0].board[2] = minion("Zoro", 0, { sleeping: false, atk: 3, hp: 10, maxHp: 10 });
    state.players[0].board[3] = minion("Kizaru", 0, { sleeping: false, atk: 4, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", atk: 0, hp: 30, maxHp: 30 });
    const after = play(state, 0, "Nine Hashira", 1);
    // 3 (Zoro) + 4 (Kizaru) + 3 (Nine Hashira itself) off a 30 HP body.
    expect(after.players[1].board[0]?.hp).toBe(20);
    expect(after.players[0].board[2]?.attacksUsed).toBe(1);
    expect(after.players[0].board[3]?.attacksUsed).toBe(1);
  });

  it("Nine Hashira never orders a minion that can never attack", () => {
    const state = mainState("hashira-locked");
    state.players[0].board[0] = minion("Grand Master Yoda", 0, { sleeping: false });
    state.players[0].board[2] = minion("Zoro", 0, { sleeping: false, atk: 3, hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", atk: 0, hp: 30, maxHp: 30 });
    const after = play(state, 0, "Nine Hashira", 1);
    expect(after.players[0].board[0]?.attacksUsed).toBe(0);
    expect(after.players[1].board[0]?.hp).toBe(30 - 3 - 3);
  });

  it("One-Eyed Owl grows every time a minion becomes Chained, on either board", () => {
    const state = mainState("owl-chains");
    state.players[0].board[0] = minion("One-Eyed Owl", 0, { sleeping: false });
    const before = state.players[0].board[0]!;
    state.players[1].board[0] = minion("John Wick", 1);

    // Darth Vader chains the enemy minion, and the Owl is watching.
    const chained = play(state, 0, "Darth Vader", 1);
    expect(chained.players[1].board[0]?.chained).toBe(3);
    expect(chained.players[0].board[0]).toMatchObject({ atk: before.atk + 1, maxHp: before.maxHp + 1 });
  });

  it("One-Eyed Owl pays for the transition, not for a chain that was already on", () => {
    // Giorno's mark chains whoever stands in the cursed slot. Laying it on a
    // free minion is a transition and pays; laying it on one that is already
    // Chained changes nothing and pays nothing.
    const build = () => {
      const state = mainState("owl-transition");
      state.players[0].board[0] = minion("One-Eyed Owl", 0, { sleeping: false });
      state.players[1].board[0] = minion("Albion", 1, { chained: 2 });
      state.players[1].board[1] = minion("John Wick", 1);
      return state;
    };
    const printed = build().players[0].board[0]!;

    const onAFreeMinion = build();
    const asking = play(onAFreeMinion, 0, "Giorno - Gold Experience Requiem", 1);
    const freeSlot = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 1);
    const paid = choose(asking, freeSlot);
    expect(paid.players[1].board[1]?.chained).toBe(3);
    expect(paid.players[0].board[0]).toMatchObject({ atk: printed.atk + 1, maxHp: printed.maxHp + 1 });

    const onAChainedMinion = build();
    const askingAgain = play(onAChainedMinion, 0, "Giorno - Gold Experience Requiem", 1);
    const takenSlot = askingAgain.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const unpaid = choose(askingAgain, takenSlot);
    expect(unpaid.players[0].board[0]).toMatchObject({ atk: printed.atk, maxHp: printed.maxHp });
  });

  it("Wall of Flesh grinds every other minion at the start of its owner's turn", () => {
    const state = mainState("wall-of-flesh");
    state.players[0].board[0] = minion("Wall of Flesh", 0);
    state.players[0].board[1] = minion("John Wick", 0, { hp: 4, maxHp: 4 });
    state.players[1].board[0] = minion("Albion", 1, { hp: 4, maxHp: 4 });

    // Round trip to the same seat, because an Ongoing fires on its owner's turn.
    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]?.hp).toBe(5); // itself, untouched
    expect(after.players[0].board[1]?.hp).toBe(3);
    expect(after.players[1].board[0]?.hp).toBe(3);
  });

  it("Tai Lung takes the keywords of what he kills, but never Chained", () => {
    const state = mainState("tai-lung-kill");
    state.players[0].board[0] = minion("Tai Lung", 0, { sleeping: false, chained: 0, atk: 9, hp: 6, maxHp: 6 });
    state.players[1].board[0] = minion("Dragon", 1, { hp: 1, maxHp: 1 }); // Taunt
    const before = state.players[0].board[0]!;

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    const lung = after.players[0].board[0];
    expect(after.players[1].board[0]).toBeNull();
    expect(lung).toMatchObject({ atk: before.atk + 1, maxHp: before.maxHp + 1 });
    expect(lung?.keywords).toContain("Taunt");
    expect(lung?.keywords.filter((keyword) => keyword === "Chained")).toHaveLength(1);
  });

  it("Tai Lung is paid after the counter-blow, so the reward cannot save him", () => {
    // Owner ruling. He used to grow BEFORE the retaliation landed, which handed
    // him the extra point of HP that let him survive it — a reward paying for
    // the fight it had not finished.
    const state = mainState("tai-lung-trade");
    state.players[0].board[0] = minion("Tai Lung", 0, { sleeping: false, chained: 0, atk: 9, hp: 3, maxHp: 3 });
    state.players[1].board[0] = minion("Dragon", 1, { atk: 3, hp: 1, maxHp: 1 });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toBeNull();
  });

  it("Pillar Men takes the counter-blow first, then heals if it survived", () => {
    const state = mainState("pillar-men-kill");
    // Wounded to 1, and the victim hits back for 2. Healing inside the kill —
    // the way every other death reaction fires — put Pillar Men back to full a
    // beat BEFORE the counter-blow, so the counter-blow just took it off again
    // and he ended on 1. Owner ruling: he takes the hit, then mends.
    state.players[0].board[0] = minion("Pillar Men", 0, { sleeping: false, chained: 0, atk: 9, hp: 1 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 1, maxHp: 1 });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    const pillar = after.players[0].board[0];
    expect(after.players[1].board[0]).toBeNull();
    expect(pillar?.hp).toBe(pillar?.maxHp);
  });

  it("Pillar Men heals nothing when the counter-blow kills it", () => {
    const state = mainState("pillar-men-trade");
    state.players[0].board[0] = minion("Pillar Men", 0, { sleeping: false, chained: 0, atk: 9, hp: 1 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, hp: 1, maxHp: 1 });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[1].board[0]).toBeNull();
  });

  it("Modern Tank deals exactly 1 damage to the enemy minion it picks", () => {
    const state = mainState("modern-tank");
    state.players[1].board[0] = minion("John Wick", 1, { hp: 4, maxHp: 4 });
    state.players[1].board[1] = minion("Albion", 1, { hp: 4, maxHp: 4 });

    const asking = play(state, 0, "Modern Tank", 0);
    expect(asking.phase).toBe("targeting");
    const index = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const after = choose(asking, index);
    expect(after.players[1].board[0]?.hp).toBe(3);
    expect(after.players[1].board[1]?.hp).toBe(4);
  });

  it("An Order of Heavy Knights stands taller behind a Taunt, and shrinks without one", () => {
    const state = mainState("heavy-knights");
    state.players[0].board[0] = minion("An Order of Heavy Knights", 0);
    const printed = state.players[0].board[0]!;
    expect(state.players[0].board[0]).toMatchObject({ atk: printed.atk, maxHp: printed.maxHp });

    const behindAWall = play(state, 0, "Dragon", 1);
    expect(behindAWall.players[0].board[0]).toMatchObject({ atk: printed.atk + 1, maxHp: printed.maxHp + 1 });

    // It is an aura, so silencing the wall takes the buff straight back.
    behindAWall.players[0].board[1]!.silenced = true;
    const gone = applyAction(behindAWall, { type: "end_turn", player: 0 }, library).state;
    expect(gone.players[0].board[0]).toMatchObject({ atk: printed.atk, maxHp: printed.maxHp });
  });

  it("Goblins clip a random enemy for 1 on the way out", () => {
    const state = mainState("goblins-deathrattle");
    state.players[0].board[0] = minion("Goblins", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = minion("Albion", 1, { atk: 9, hp: 9, maxHp: 9, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toBeNull();
    // 9, minus the Goblins' own 2 ATK on the simultaneous counter-blow, minus
    // the 1 the Deathrattle clips off on the way out.
    expect(after.players[1].board[0]?.hp).toBe(6);
  });

  it("Death Star keeps its swing, so Charge lets it mark and attack in one turn", () => {
    const state = mainState("death-star-charge");
    state.players[0].board[1] = minion("Gordon Freeman", 0); // grants Charge to the board
    state.players[1].board[0] = minion("John Wick", 1);

    const asking = play(state, 0, "Death Star", 0);
    const index = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 0);
    const marked = choose(asking, index);

    // The Battlecry used to spend the attack, which held a Charge-granted Death
    // Star back for a rule its card no longer prints.
    expect(marked.players[0].board[0]?.attacksUsed).toBe(0);
    expect(getLegalActions(marked, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
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
    state.players[0].board[1] = minion("Zoro", 0);
    state.players[1].board[0] = minion("John Wick", 1);
    const after = play(state, 0, "Rick Prime", 0);
    expect(after.players[0].board[0]?.name).toBe("Rick Prime");
    expect(after.players[0].board[1]).toBeNull();
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].hand).not.toContain(cardId("Rick Prime"));
    expect(after.players[0].hand).toContain(cardId("Zoro"));
    expect(after.players[1].hand).toContain(cardId("John Wick"));
  });

  it("Toji blocks Magic, while Elden Beast buffs friendly Neutral and Magic ATK", () => {
    const blocked = mainState("toji-magic");
    blocked.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 5, hp: 20, maxHp: 20 });
    blocked.players[1].board[0] = minion("Toji", 1);
    const tojiHit = applyAction(blocked, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(tojiHit.players[1].board[0]?.hp).toBe(3);

    const elder = mainState("elder-no-magic-immunity");
    elder.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 1, hp: 20, maxHp: 20 });
    elder.players[1].board[0] = minion("Elden Beast", 1);
    elder.players[1].board[1] = minion("Pandora's Actor", 1, { atk: 1, hp: 20, maxHp: 20 });
    elder.players[1].board[2] = minion("John Wick", 1, { atk: 1, hp: 20, maxHp: 20, alignment: "Neutral" });
    const elderHit = applyAction(elder, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(elderHit.players[1].board[0]?.hp).toBe(3);
    expect(elderHit.players[1].board[0]?.atk).toBe(6);
    expect(elderHit.players[1].board[1]?.atk).toBe(3);
    expect(elderHit.players[1].board[2]?.atk).toBe(3);
    expect(elderHit.players[0].board[0]?.atk).toBe(1);
  });

  it("Elden Beast buffs an ALL-camp ally, which is the umbrella camp for every camp buff", () => {
    const state = mainState("elden-all-camp");
    state.players[0].board[0] = minion("Elden Beast", 0);
    // Avengers is camp ALL and alignment Good, so ONLY the umbrella rule can
    // reach it. The aura tested a bare camp match and quietly skipped it.
    state.players[0].board[1] = minion("Avengers", 0);
    const after = endTurn(state, 0);
    const avengers = after.players[0].board[1];
    expect(avengers?.atk).toBe((avengers?.baseAtk ?? 0) + 2);
  });

  it("Cthulhu keeps Tech immunity, while T-1000 heals on its ongoing turn", () => {
    const tech = mainState("cthulhu-tech");
    tech.players[0].board[0] = minion("Modern Tank", 0, { sleeping: false, atk: 5, hp: 20, maxHp: 20 });
    tech.players[1].board[0] = minion("Cthulhu", 1);
    const cthulhuHit = applyAction(tech, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(cthulhuHit.players[1].board[0]?.hp).toBe(8);

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
    // Modern Tank's own effect is a Battlecry, and a graft copies only the
    // persistent half, so this measures the stats transfer alone.
    state.players[0].board[1] = minion("Modern Tank", 0);
    const asking = play(state, 0, "Godrick the Grafted", 0);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    const after = targetIndex >= 0 ? choose(asking, targetIndex) : asking;
    const godrick = after.players[0].board[0];
    expect(after.players[0].board[1]).toBeNull();
    expect(godrick).toMatchObject({ atk: 4, hp: 4, maxHp: 4, effectId: "none", effectTiming: "none" });
    expect(godrick?.gainedEffects).toEqual([]);
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

  it("Rimuru Tempest keeps its sacrifice Battlecry and gains +1/+1 ongoing", () => {
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
    expect(nextOwnerTurn.players[0].board[1]).toMatchObject({ atk: 4, hp: 5, maxHp: 5 });
  });

  it("Silver Surfer summons a Taunt Galactus that cannot attack", () => {
    const state = mainState("silver-surfer-galactus");
    state.players[0].board[0] = minion("Silver Surfer", 0, { hp: 1, maxHp: 1, chained: 0 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    // Galactus arrives unchained now, so he blocks from the turn he lands rather
    // than sitting untargetable for two turns; "Cannot Attack" is what keeps a
    // free 8/8 wall from also being a free 8-damage swing.
    expect(after.players[0].board[0]).toMatchObject({ name: "Galactus", atk: 8, hp: 8, maxHp: 8, chained: 0 });
    expect(after.players[0].board[0]?.keywords).toEqual(["Taunt", "Cannot Attack"]);
    expect(after.players[0].board[0]?.art).toBe("/card-art/raw/galactus.webp");
  });

  it("Ultron Prime leaves Vision behind when he dies", () => {
    const state = mainState("ultron-vision");
    state.players[0].board[0] = minion("Ultron Prime", 0, { hp: 1, maxHp: 3 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;

    // Killing Ultron is not the end of him: the wall is replaced by an identical
    // wall, which is the whole reason the body is 6/3 rather than something that
    // survives on its own.
    expect(after.players[0].board[0]).toMatchObject({ name: "Vision", atk: 5, hp: 3, maxHp: 3, chained: 0 });
    expect(after.players[0].board[0]?.keywords).toEqual(["Taunt"]);
    expect(after.players[0].board[0]?.art).toBe("/card-art/raw/token-vision.webp");
    expect(after.players[0].board[0]?.owner).toBe(0);
  });

  it("Vision does not arrive when there is nowhere to put him", () => {
    const state = mainState("ultron-vision-full");
    state.players[0].board[0] = minion("Ultron Prime", 0, { hp: 1, maxHp: 3 });
    // Ultron dies in slot 0, so that slot frees up and Vision takes it. Fill
    // every OTHER slot to prove the fallback search is not what is being tested,
    // then kill him from a board where his own slot is the only opening.
    for (const slot of [1, 2, 3, 4]) state.players[0].board[slot] = minion("Zoro", 0);
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;

    expect(after.players[0].board[0]?.name).toBe("Vision");
    expect(after.players[0].board.filter(Boolean)).toHaveLength(5);
  });

  it("Gordon Freeman lets the minions already on the board attack at once", () => {
    const state = mainState("freeman-wakes-board");
    // Asleep, the way a minion played this turn would be.
    state.players[0].board[1] = minion("Zoro", 0, { sleeping: true });
    state.players[0].board[2] = minion("John Wick", 0, { sleeping: true });

    const after = play(state, 0, "Gordon Freeman", 0);

    // Granting the keyword alone would do nothing here, because Charge is read
    // when a minion is CREATED. Waking the board is the half that makes the card
    // work on the turn it lands.
    expect(after.players[0].board[1]?.sleeping).toBe(false);
    expect(after.players[0].board[2]?.sleeping).toBe(false);
    expect(after.players[0].board[1]?.keywords).toContain("Charge");
    // And it is a friendly-only aura.
    expect(after.players[1].board.every((entry) => entry === null || !entry.keywords.includes("Charge"))).toBe(true);
  });

  it("a minion played after Gordon Freeman can attack immediately", () => {
    const state = mainState("freeman-wakes-newcomer");
    state.players[0].board[0] = minion("Gordon Freeman", 0, { sleeping: false });

    const after = play(state, 0, "Zoro", 1);

    expect(after.players[0].board[1]?.sleeping).toBe(false);
    expect(after.players[0].board[1]?.keywords).toContain("Charge");
  });

  it("Gordon Freeman's Charge is taken back when he leaves", () => {
    const state = mainState("freeman-aura-removal");
    state.players[0].board[0] = minion("Gordon Freeman", 0, { hp: 1, maxHp: 3 });
    state.players[0].board[1] = minion("Zoro", 0, { sleeping: true });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;

    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;

    expect(after.players[0].board[0]).toBeNull();
    // The card must stop promising Charge once the source of it is gone.
    expect(after.players[0].board[1]?.keywords).not.toContain("Charge");
  });

  it("Ten Tails chains every minion on both boards", () => {
    const state = mainState("ten-tails-chain");
    state.players[0].board[0] = minion("John Wick", 0);
    state.players[1].board[0] = minion("Zoro", 1);
    const after = play(state, 0, "Ten Tails", 1);
    expect(after.players[0].board[0]?.chained).toBe(3);
    expect(after.players[0].board[1]?.chained).toBe(0);
    expect(after.players[1].board[0]?.chained).toBe(3);
  });

  it("Ouken endlessly Reborns as a Chained 2/1", () => {
    const state = mainState("ouken-reborn");
    state.players[0].board[0] = minion("Ouken", 0, { hp: 1, maxHp: 1, chained: 0 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 9, sleeping: false, hp: 20, maxHp: 20 });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toMatchObject({
      name: "Ouken",
      atk: 2,
      hp: 1,
      maxHp: 1,
      chained: 3,
      effectId: "ouken_reborn",
      suppressArrivalTheme: true,
    });
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

  it("Motoko Kusanagi temporarily controls an eligible Tech minion", () => {
    const state = mainState("motoko-control");
    state.players[1].board[0] = minion("Modern Tank", 1, { hp: 4, maxHp: 4, sleeping: false });
    state.players[1].board[1] = minion("Dragon", 1, { hp: 5, maxHp: 5, sleeping: false });

    const controlled = play(state, 0, "Motoko Kusanagi", 0);
    const victim = controlled.players[0].board[1];
    expect(victim).toMatchObject({ name: "Modern Tank", owner: 0, temporaryControl: { originalOwner: 1, originalSlot: 0 } });
    expect(controlled.players[1].board[0]).toBeNull();
    expect(controlled.players[1].board[1]?.name).toBe("Dragon");

    const interveningTurn = endTurn(controlled, 0);
    expect(interveningTurn.players[0].board[1]?.owner).toBe(0);
    const nextOwnTurn = endTurn(interveningTurn, 1);
    expect(nextOwnTurn.players[0].board[1]?.owner).toBe(0);
    const returned = endTurn(nextOwnTurn, 0);
    expect(returned.players[0].board[1]).toBeNull();
    expect(returned.players[1].board[0]).toMatchObject({ name: "Modern Tank", owner: 1, temporaryControl: null });
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

  it("Saitama ignores ATK damage below 5 but takes exactly 5", () => {
    const weak = mainState("saitama-four");
    weak.players[1].board[0] = minion("Saitama", 1);
    weak.players[0].board[0] = minion("John Wick", 0, { atk: 4, hp: 20, maxHp: 20, sleeping: false });
    const blocked = applyAction(weak, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(blocked.players[1].board[0]?.hp).toBe(10);
    expect(blocked.players[0].board[0]?.hp).toBe(10);

    const threshold = mainState("saitama-five");
    threshold.players[1].board[0] = minion("Saitama", 1);
    threshold.players[0].board[0] = minion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    const hit = applyAction(threshold, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(hit.players[1].board[0]?.hp).toBe(5);
    expect(hit.players[0].board[0]?.hp).toBe(10);
  });

  it("Thanos destroys one random minion per side, and never himself", () => {
    const state = mainState("thanos-snap");
    state.players[0].hand = [cardId("Thanos"), cardId("Zoro")];
    state.players[1].hand = [cardId("Zoro")];
    state.players[0].board[1] = minion("Zoro", 0);
    state.players[1].board[0] = minion("John Wick", 1);

    const after = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library).state;
    // Owner's ruling, 2 September 2026: "Thanos: balances your board: Thanos."
    // was a real log line. He survives his own snap; the ally does not.
    expect(after.players[0].board[0]?.name).toBe("Thanos");
    expect(after.players[0].board[1]).toBeNull();
    expect(after.players[1].board.every((entry) => entry === null)).toBe(true);
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[1].hand).toEqual([]);
  });

  it("Doom Slayer deals exactly triple damage to Evil minions and heals 3 after a kill", () => {
    const wounded = mainState("doom-triple");
    wounded.players[0].board[0] = minion("Doom Slayer", 0, { sleeping: false });
    wounded.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", atk: 1, hp: 10, maxHp: 10 });
    const nineDamage = applyAction(wounded, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(nineDamage.players[1].board[0]?.hp).toBe(1);
    expect(nineDamage.players[0].board[0]?.hp).toBe(7);

    const kill = mainState("doom-kill-heal");
    kill.players[0].board[0] = minion("Doom Slayer", 0, { sleeping: false, hp: 2, maxHp: 8 });
    kill.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", atk: 1, hp: 8, maxHp: 8 });
    const healed = applyAction(kill, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(healed.players[1].board[0]).toBeNull();
    expect(healed.players[0].board[0]).toMatchObject({ hp: 4, maxHp: 8 });
  });

  it("Flash can attack exactly 2 times for 8 total core damage", () => {
    let state = mainState("flash-two-attacks");
    state.players[0].board[0] = minion("Flash", 0, { sleeping: false });
    const before = state.players[1].health;

    for (let attack = 0; attack < 2; attack += 1) {
      expect(getLegalActions(state, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
      state = applyAction(state, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    }

    // 4 ATK now, down from 5 (owner's ruling, 2 September 2026).
    expect(before - state.players[1].health).toBe(8);
    expect(state.players[0].board[0]?.attacksUsed).toBe(2);
    expect(getLegalActions(state, library)).not.toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
  });

  it("Meruem grows and copies a killed minion's persistent effects", () => {
    const state = mainState("meruem-kill-copy");
    state.players[0].board[0] = minion("Meruem", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 0, hp: 1, maxHp: 1 });
    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 5, hp: 6, maxHp: 6 });
    expect(after.players[0].board[0]?.gainedEffects).toContainEqual(
      expect.objectContaining({ effectId: "friendly_death_buff_1_1", timing: "passive" }),
    );
  });

  it("Gravelord Nito gains +1/+1 when a minion dies on either board", () => {
    const enemyDeath = mainState("gravelord-nito-enemy-death");
    enemyDeath.players[0].board[0] = minion("Gravelord Nito", 0);
    enemyDeath.players[0].board[1] = minion("Gordon Freeman", 0, { atk: 4, hp: 4, maxHp: 4, sleeping: false });
    enemyDeath.players[1].board[0] = minion("Gordon Freeman", 1, { atk: 0, hp: 1, maxHp: 1, sleeping: false });
    const afterEnemyDeath = applyAction(
      enemyDeath,
      { type: "attack_minion", player: 0, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(afterEnemyDeath.players[0].board[0]).toMatchObject({ atk: 3, hp: 4, maxHp: 4 });

    const friendlyDeath = mainState("gravelord-nito-friendly-death");
    friendlyDeath.players[0].board[0] = minion("Gravelord Nito", 0);
    friendlyDeath.players[0].board[1] = minion("Gordon Freeman", 0, { atk: 0, hp: 1, maxHp: 1, sleeping: false });
    friendlyDeath.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 2, maxHp: 2, sleeping: false });
    friendlyDeath.activePlayer = 1;
    const afterFriendlyDeath = applyAction(
      friendlyDeath,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 },
      library,
    ).state;
    expect(afterFriendlyDeath.players[0].board[0]).toMatchObject({ atk: 3, hp: 4, maxHp: 4 });
  });

  it("Escanor The One doubles the ATK of his other friendly minions", () => {
    const state = mainState("escanor-double-attack");
    state.players[0].board[1] = minion("Zoro", 0, { atk: 3, hp: 5, maxHp: 5 });
    state.players[0].board[2] = minion("Saitama", 0, { atk: 5, hp: 6, maxHp: 6 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 7, hp: 10, maxHp: 10 });

    const after = play(state, 0, 'Escanor "The One"', 0);
    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 8, hp: 4, maxHp: 4 });
    expect(after.players[0].board[1]?.atk).toBe(6);
    expect(after.players[0].board[2]?.atk).toBe(10);
    expect(after.players[1].board[0]?.atk).toBe(7);
  });

  it("Dormammu holds an enemy in the Dark Dimension until he dies", () => {
    const state = mainState("dormammu-dark-dimension");
    state.players[1].board[0] = minion("John Wick", 1, { hp: 4, maxHp: 4 });
    const asking = play(state, 0, "Dormammu", 0);
    const banished = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(banished.players[1].board[0]).toBeNull();
    expect(banished.darkDimension).toHaveLength(1);

    banished.players[1].board[0] = minion("Zoro", 1, { atk: 8, hp: 20, maxHp: 20, sleeping: false });
    banished.activePlayer = 1;
    const afterDeath = applyAction(
      banished,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toBeNull();
    expect(afterDeath.darkDimension).toHaveLength(0);
    expect(afterDeath.players[1].board[1]?.name).toBe("John Wick");
  });

  it("Conquest gains exactly +2/+2 for each enemy Good minion", () => {
    const state = mainState("conquest-good-count");
    state.players[0].board[0] = minion("Conquest", 0);
    state.players[1].board[0] = minion("John Wick", 1, { alignment: "Good" });
    state.players[1].board[1] = minion("Zoro", 1, { alignment: "Good" });
    state.players[1].board[2] = minion("John Wick", 1, { alignment: "Evil", atk: 2, hp: 2, maxHp: 2 });

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]).toMatchObject({ atk: 10, hp: 10, maxHp: 10 });
    expect(after.players[1].board[2]).toMatchObject({ atk: 2, hp: 2, maxHp: 2 });
  });

  it("S-Class Heroes gives exactly +2/+2 to every Good minion, including itself", () => {
    const state = mainState("s-class-good-buff");
    state.players[0].board[0] = minion("S-Class Heroes", 0);
    state.players[0].board[1] = minion("John Wick", 0, { alignment: "Good", atk: 2, hp: 3, maxHp: 3 });
    state.players[0].board[2] = minion("Zoro", 0, { alignment: "Evil", atk: 2, hp: 3, maxHp: 3 });

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]).toMatchObject({ atk: 6, hp: 9, maxHp: 9 });
    expect(after.players[0].board[1]).toMatchObject({ atk: 4, hp: 5, maxHp: 5 });
    expect(after.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
  });

  it("Marshall D. Teach copies one persistent effect from each side", () => {
    const state = mainState("marshall-copy-passives");
    state.players[0].board[1] = minion("Saitama", 0);
    state.players[1].board[0] = minion("Flash", 1);
    state.players[1].board[1] = minion("John Wick", 1, { atk: 4, hp: 20, maxHp: 20, sleeping: false });

    const afterPlay = play(state, 0, "Marshall D. Teach", 0);
    const afterCopy = endTurn(endTurn(afterPlay, 0), 1);
    const teach = afterCopy.players[0].board[0];
    expect(teach?.gainedEffects).toHaveLength(2);
    expect(teach?.gainedEffects.map((effect) => effect.effectId).sort()).toEqual(["flash_speed", "small_cannot_attack"]);

    const blocked = applyAction(
      { ...afterCopy, activePlayer: 1 },
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(blocked.players[0].board[0]?.hp).toBe(5);
    expect(blocked.players[1].board[1]?.hp).toBe(15);
  });

  it("All for One wears every enemy Passive at once, and gives them back", () => {
    // Owner's ruling, 2 September 2026: the card stopped borrowing one
    // Battlecry and started wearing the whole enemy board's standing rules.
    const state = mainState("all-for-one-passives");
    state.players[1].board[0] = minion("John Wick", 1); // friendly_death_buff_1_1
    state.players[1].board[1] = minion("Saitama", 1); // small_cannot_attack

    const after = play(state, 0, "All for One", 0);
    const worn = (after.players[0].board[0]?.gainedEffects ?? []).map((entry) => entry.effectId);
    expect(worn).toContain("friendly_death_buff_1_1");
    expect(worn).toContain("small_cannot_attack");

    // An aura in everything but name: the power goes back when its owner does.
    after.players[1].board[1] = null;
    const shrunk = applyAction(after, { type: "end_turn", player: 0 }, library).state;
    const left = (shrunk.players[0].board[0]?.gainedEffects ?? []).map((entry) => entry.effectId);
    expect(left).toContain("friendly_death_buff_1_1");
    expect(left).not.toContain("small_cannot_attack");
  });

  it("All for One actually enacts a copied Passive", () => {
    const state = mainState("all-for-one-enacts");
    // Saitama's printed passive ignores ATK damage under 5. Worn by All for One,
    // a 4-ATK swing has to bounce off it too.
    state.players[1].board[0] = minion("Saitama", 1);
    const after = play(state, 0, "All for One", 0);
    after.players[1].board[1] = minion("Zoro", 1, { atk: 4, hp: 9, maxHp: 9, sleeping: false });
    after.activePlayer = 1;
    const swung = applyAction(after, { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 }, library).state;
    expect(swung.players[0].board[0]?.hp).toBe(5);
  });

  it("All for One never copies its own power, however many mirrors are present", () => {
    const state = mainState("all-for-one-mirror-passive");
    state.players[1].board[0] = minion("All for One", 1);
    const after = play(state, 0, "All for One", 0);
    const worn = (after.players[0].board[0]?.gainedEffects ?? []).map((entry) => entry.effectId);
    expect(worn).not.toContain("copy_all_enemy_passives");
    expect(worn).toEqual([]);
  });

  it("a silenced All for One wears nothing", () => {
    const state = mainState("all-for-one-silenced");
    state.players[1].board[0] = minion("John Wick", 1);
    const after = play(state, 0, "All for One", 0);
    expect(after.players[0].board[0]?.gainedEffects).toHaveLength(1);

    after.players[0].board[0]!.silenced = true;
    const silenced = applyAction(after, { type: "end_turn", player: 0 }, library).state;
    expect(silenced.players[0].board[0]?.gainedEffects).toEqual([]);
  });

  it("Joker puts a copy of a chosen minion into its owner's hand", () => {
    const state = mainState("joker-copy-minion");
    state.players[1].board[1] = minion("John Wick", 1);
    const asking = play(state, 0, "Joker", 0);
    const choice = asking.pendingTarget!.options.findIndex((option) => option.owner === 1 && option.slot === 1);
    const after = choose(asking, choice);
    expect(after.players[0].hand).toContain(cardId("John Wick"));
    expect(after.players[1].board[1]?.name).toBe("John Wick");
  });

  it("Ultron Prime no longer has the copy effect", () => {
    const state = mainState("ultron-vanilla");
    state.players[1].board[1] = minion("John Wick", 1);
    const after = play(state, 0, "Ultron Prime", 0);
    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].hand).toHaveLength(0);
  });

  it("Thirteen Lords of Chaos summons Drakath on death", () => {
    const state = mainState("chaos-drakath");
    const afterPlay = play(state, 0, "Thirteen Lords of Chaos", 0);
    afterPlay.players[1].board[0] = minion("Zoro", 1, { atk: 3, hp: 20, maxHp: 20, sleeping: false });
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(
      afterPlay,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toMatchObject({ name: "Drakath", atk: 5, hp: 3, maxHp: 3 });
    expect(afterDeath.players[0].board[0]).toMatchObject({
      art: "/card-art/raw/token-drakath.webp",
      suppressArrivalTheme: false,
    });
  });

  it("Big Mom gains exactly the devoured friendly minion's ATK and HP", () => {
    const state = mainState("big-mom-devour");
    state.players[0].board[2] = minion("John Wick", 0, { atk: 2, hp: 4, maxHp: 4 });

    const after = play(state, 0, "Big Mom", 0);
    expect(after.players[0].board[2]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 5, hp: 9, maxHp: 9 });
  });

  it("Grand Master Oogway rescues one dying ally per turn and is Chained for it", () => {
    const state = mainState("oogway-rescue");
    state.players[0].board[0] = minion("Grand Master Oogway", 0);
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[2] = minion("Zoro", 0, { hp: 1, maxHp: 1 });
    state.players[0].hand = [];
    state.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    state.players[1].board[1] = minion("Zoro", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;

    const first = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(first.players[0].board[0]).toMatchObject({ divineShield: true, chained: 3, rescueUsedAtTurn: first.turnNumber });
    expect(first.players[0].board[1]).toBeNull();
    expect(first.players[0].hand).toContain(cardId("John Wick"));

    const second = applyAction(first, { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 2 }, library).state;
    expect(second.players[0].board[2]).toBeNull();
    expect(second.players[0].hand).not.toContain(cardId("Zoro"));
  });

  it("The Driller consumes an enemy Tech minion at the exact 4 HP limit", () => {
    const state = mainState("driller-tech-consume");
    state.players[1].board[0] = minion("John Wick", 1, { camp: "Tech", atk: 3, hp: 4, maxHp: 4 });

    const asking = play(state, 0, "The Driller", 0);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 4, hp: 5, maxHp: 5 });
  });

  it("The Driller leaves a 5 HP Tech minion alone", () => {
    const state = mainState("driller-tech-five-survives");
    state.players[1].board[0] = minion("John Wick", 1, { camp: "Tech", atk: 3, hp: 5, maxHp: 5 });

    const after = play(state, 0, "The Driller", 0);
    expect(after.pendingTarget).toBeNull();
    expect(after.players[1].board[0]).toMatchObject({ atk: 3, hp: 5, maxHp: 5 });
    expect(after.players[0].board[0]).toMatchObject({ name: "The Driller", atk: 1, hp: 1, maxHp: 1 });
  });

  it("Po gains exactly +1/+1 after surviving an attack and a defense", () => {
    const state = mainState("po-survives");
    state.players[0].board[0] = minion("Po", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 1, hp: 10, maxHp: 10 });
    state.players[1].board[1] = minion("Zoro", 1, { atk: 1, hp: 10, maxHp: 10, sleeping: false });

    const afterAttack = applyAction(
      state,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterAttack.players[0].board[0]).toMatchObject({ atk: 4, hp: 3, maxHp: 4 });

    const afterDefense = applyAction(
      endTurn(afterAttack, 0),
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(afterDefense.players[0].board[0]).toMatchObject({ atk: 5, hp: 3, maxHp: 5 });
  });

  it("Gyoro Gyoro gives exactly +2/+2 to the chosen Evil ally", () => {
    const state = mainState("gyoro-evil-buff");
    state.players[0].board[0] = minion("Gyoro Gyoro", 0);
    state.players[0].board[1] = minion("John Wick", 0, { alignment: "Evil", atk: 2, hp: 2, maxHp: 2 });
    state.players[0].board[2] = minion("Zoro", 0, { alignment: "Evil", atk: 3, hp: 3, maxHp: 3 });
    state.players[0].board[3] = minion("John Wick", 0, { alignment: "Good", atk: 2, hp: 2, maxHp: 2 });

    const asking = endTurn(endTurn(state, 0), 1);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const after = choose(asking, targetIndex);
    expect(after.players[0].board[1]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(after.players[0].board[2]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
    expect(after.players[0].board[3]).toMatchObject({ atk: 2, hp: 2, maxHp: 2 });
  });

  it("Spider-Man Freezes an enemy and halves its ATK with exact rounding", () => {
    const state = mainState("spider-man-freeze-weaken");
    state.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 10, maxHp: 10 });

    const after = play(state, 0, "Spider-Man", 0);
    expect(after.players[1].board[0]).toMatchObject({ frozen: true, atk: 3, hp: 10 });
  });

  it("Yubaba devolves each enemy minion by one mana", () => {
    const state = mainState("yubaba-devolve");
    state.players[1].board[0] = minion("T-1000", 1);
    state.players[1].board[1] = minion("Doom Slayer", 1);
    const originalCosts = state.players[1].board.map((entry) => entry?.cost);

    const after = play(state, 0, "Yubaba", 0);
    expect(after.players[1].board[0]?.cost).toBe((originalCosts[0] ?? 0) - 1);
    expect(after.players[1].board[1]?.cost).toBe((originalCosts[1] ?? 0) - 1);
  });

  it("Giant Crystal gives exactly +2/+1 to other friendly Magic minions", () => {
    const state = mainState("giant-crystal-magic-buff");
    state.players[0].board[0] = minion("Giant Crystal", 0);
    state.players[0].board[1] = minion("Flash", 0, { atk: 4, hp: 6, maxHp: 6 });
    state.players[0].board[2] = minion("John Wick", 0, { camp: "Nature", atk: 2, hp: 3, maxHp: 3 });

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1, divineShield: true });
    expect(after.players[0].board[1]).toMatchObject({ atk: 6, hp: 7, maxHp: 7 });
    expect(after.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
  });

  it("Tech Hub gives exactly +2/+1 to other friendly Tech minions", () => {
    const state = mainState("tech-hub-tech-buff");
    state.players[0].board[0] = minion("Tech Hub", 0);
    state.players[0].board[1] = minion("Modern Tank", 0, { atk: 3, hp: 3, maxHp: 3 });
    state.players[0].board[2] = minion("John Wick", 0, { camp: "Nature", atk: 2, hp: 3, maxHp: 3 });

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1, divineShield: true });
    expect(after.players[0].board[1]).toMatchObject({ atk: 5, hp: 4, maxHp: 4 });
    expect(after.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
  });

  it("Gums consumes an enemy Nature minion at the exact 4 HP limit", () => {
    const state = mainState("gums-devour-small");
    state.players[1].board[0] = minion("John Wick", 1, { camp: "Nature", atk: 3, hp: 4, maxHp: 4 });
    state.players[1].board[1] = minion("Zoro", 1, { camp: "Tech", atk: 4, hp: 4, maxHp: 4 });

    const asking = play(state, 0, "Gums", 0);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[1].board[1]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(after.players[0].board[0]).toMatchObject({ atk: 4, hp: 5, maxHp: 5 });
  });

  it("Dabi deals exactly 1 damage to every other minion", () => {
    const state = mainState("dabi-one-damage");
    state.players[0].board[1] = minion("John Wick", 0, { hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("Zoro", 1, { hp: 10, maxHp: 10 });

    const after = play(state, 0, "Dabi", 0);
    expect(after.players[0].board[0]).toMatchObject({ hp: 3, maxHp: 3 });
    expect(after.players[0].board[1]?.hp).toBe(9);
    expect(after.players[1].board[0]?.hp).toBe(9);
  });

  it("Mr. Oliva ignores ATK 1 but takes exact ATK 2 damage", () => {
    const weak = mainState("oliva-one-attack");
    weak.players[1].board[0] = minion("Mr. Oliva", 1, { hp: 5, maxHp: 5 });
    weak.players[0].board[0] = minion("John Wick", 0, { atk: 1, hp: 20, maxHp: 20, sleeping: false });
    const blocked = applyAction(weak, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(blocked.players[1].board[0]?.hp).toBe(5);

    const threshold = mainState("oliva-two-attack");
    threshold.players[1].board[0] = minion("Mr. Oliva", 1, { hp: 5, maxHp: 5 });
    threshold.players[0].board[0] = minion("John Wick", 0, { atk: 2, hp: 20, maxHp: 20, sleeping: false });
    const hit = applyAction(threshold, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(hit.players[1].board[0]?.hp).toBe(3);
  });

  it("Lu Bu can attack only the enemy with the highest ATK", () => {
    const state = mainState("lu-bu-highest-attack");
    state.players[0].board[0] = minion("Lu Bu", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 4, hp: 10, maxHp: 10 });
    state.players[1].board[1] = minion("Zoro", 1, { atk: 6, hp: 10, maxHp: 10 });

    expect(getLegalActions(state, library).filter(
      (action) => action.type === "attack_minion" && action.player === 0 && action.attackerSlot === 0,
    )).toEqual([{ type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }]);
  });

  it("Mr. Poopybutthole is Reborn once, at 1 HP, and the second death is final", () => {
    const state = mainState("reborn-once");
    state.players[0].board[0] = minion("Mr. Poopybutthole", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;
    const swing = { type: "attack_minion" as const, player: 1 as const, attackerSlot: 0, targetSlot: 0 };
    const reborn = applyAction(state, swing, library).state;
    // The rebirth is spent, so the returning card prints nothing at all: no
    // keyword, no effect, no promise it can no longer keep.
    expect(reborn.players[0].board[0]).toMatchObject({
      name: "Mr. Poopybutthole",
      atk: 1,
      hp: 1,
      maxHp: 1,
      keywords: [],
      effectId: "none",
      effectTiming: "none",
      suppressArrivalTheme: true,
    });

    const second = { ...reborn, activePlayer: 1 as const, phase: "main" as const };
    second.players[1].board[0]!.attacksUsed = 0;
    const gone = applyAction(second, swing, library).state;
    expect(gone.players[0].board[0]).toBeNull();
    expect(gone.discard).toContain(cardId("Mr. Poopybutthole"));
  });

  it("Nezu draws exactly 1 card from its Battlecry", () => {
    const state = mainState("nezu-draw-one");
    state.deck = [cardId("Thanos"), cardId("John Wick"), cardId("Zoro")];

    const after = play(state, 0, "Nezu", 0);
    expect(after.players[0].hand).toEqual([cardId("Thanos")]);
    expect(after.deck).toEqual([cardId("John Wick"), cardId("Zoro")]);
  });

  it("Shibukawa has Divine Shield and doubles its defending retaliation damage", () => {
    const state = mainState("shibukawa-defense");
    state.players[0].board[0] = minion("Shibukawa", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1, { atk: 2, hp: 10, maxHp: 10, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]).toMatchObject({
      divineShield: false,
      effectId: "shibukawa_defense_damage_2x",
      atk: 1,
    });
    expect(after.players[1].board[0]?.hp).toBe(8);
  });

  it("Mugen & Jin gains exactly +1 ATK only with another friendly minion", () => {
    const together = mainState("mugen-jin-ally");
    together.players[0].board[1] = minion("John Wick", 0);
    const withAlly = play(together, 0, "Mugen & Jin", 0);
    expect(withAlly.players[0].board[0]).toMatchObject({ atk: 2, hp: 2 });

    const alone = mainState("mugen-jin-alone");
    const byItself = play(alone, 0, "Mugen & Jin", 0);
    expect(byItself.players[0].board[0]).toMatchObject({ atk: 1, hp: 2 });
  });

  it("Kagaya Ubuyashiki offers one Taunt, one Divine Shield and one Passive minion", () => {
    const state = mainState("kagaya-keyword-draw");
    // One card of each kind, so the offer is fully determined and the pick is
    // the only thing left to check. John Wick is a Passive card that never had
    // the keyword typed into the CSV, which is why the offer reads the timing.
    state.deck = [cardId("John Wick"), cardId("The Five Convicts"), cardId("Survivors"), cardId("Nezu")];
    const asking = play(state, 0, "Kagaya Ubuyashiki", 0);

    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.kind).toBe("option");
    expect(asking.pendingTarget?.labelOptions.map((option) => option.value).sort()).toEqual(
      [cardId("John Wick"), cardId("Survivors"), cardId("The Five Convicts")].sort(),
    );

    const chosenIndex = asking.pendingTarget!.labelOptions.findIndex((option) => option.value === cardId("John Wick"));
    const after = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: chosenIndex }, library).state;
    expect(after.players[0].hand).toEqual([cardId("John Wick")]);
    expect(after.deck).not.toContain(cardId("John Wick"));
  });

  it("Kagaya still resolves when only one kind is left in the deck", () => {
    const state = mainState("kagaya-single-offer");
    state.deck = [cardId("The Five Convicts")];
    const after = play(state, 0, "Kagaya Ubuyashiki", 0);

    // One legal offer resolves without a pointless one-button prompt.
    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].hand).toEqual([cardId("The Five Convicts")]);
    expect(after.deck).toEqual([]);
  });

  it("Sir Nighteye sees the card left on top of the shared deck", () => {
    const state = mainState("sir-nighteye-reveal");
    state.players[0].board[0] = minion("Sir Nighteye", 0);
    state.players[1].hand = [];
    state.deck = [cardId("Saitama"), cardId("Zoro")];

    const result = applyAction(state, { type: "end_turn", player: 0 }, library);
    expect(result.state.players[1].hand).toEqual([cardId("Saitama")]);
    expect(result.events).toContainEqual(expect.objectContaining({ text: "Sir Nighteye sees the top card of the deck: Zoro." }));
  });

  it("Furious Five gives Divine Shield to Good minions but not Evil minions when played", () => {
    const state = mainState("furious-five-shield");
    state.players[0].board[0] = minion("Furious Five", 0);

    const withShield = play(state, 0, "Kagaya Ubuyashiki", 1);
    expect(withShield.players[0].board[1]?.divineShield).toBe(true);

    const withoutShield = play(withShield, 0, "Gums", 2);
    expect(withoutShield.players[0].board[2]?.divineShield).toBe(false);
  });
});

describe("direct effect reachability", () => {
  it("Bigfoot evades exactly the printed 50% of incoming attacks", () => {
    const evades = mainState("bigfoot-evades");
    evades.rngSeed = 1;
    evades.players[0].board[0] = minion("John Wick", 0, {
      atk: 3,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    evades.players[1].board[0] = minion("Bigfoot", 1, { hp: 5, maxHp: 5 });
    evades.activePlayer = 0;
    const evaded = applyAction(evades, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(evaded.players[1].board[0]?.hp).toBe(5);

    const lands = mainState("bigfoot-lands");
    lands.rngSeed = 12345;
    lands.players[0].board[0] = minion("John Wick", 0, {
      atk: 3,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    lands.players[1].board[0] = minion("Bigfoot", 1, { hp: 5, maxHp: 5 });
    lands.activePlayer = 0;
    const landed = applyAction(lands, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(landed.players[1].board[0]?.hp).toBe(2);
  });

  it("Sandworm ignores exactly 2 ATK and takes exact damage from 3 ATK", () => {
    const weak = mainState("sandworm-weak");
    weak.players[0].board[0] = minion("John Wick", 0, {
      atk: 2,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    weak.players[1].board[0] = minion("Sandworm", 1, { hp: 5, maxHp: 5 });
    const ignored = applyAction(weak, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(ignored.players[1].board[0]?.hp).toBe(5);

    const strong = mainState("sandworm-strong");
    strong.players[0].board[0] = minion("John Wick", 0, {
      atk: 3,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    strong.players[1].board[0] = minion("Sandworm", 1, { hp: 5, maxHp: 5 });
    const damaged = applyAction(strong, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(damaged.players[1].board[0]?.hp).toBe(2);
  });

  it("The Watcher cannot attack while its passive reveals the enemy hand", () => {
    const state = mainState("watcher-passive");
    state.players[0].board[0] = minion("The Watcher", 0, { sleeping: false });
    state.players[1].board[0] = minion("John Wick", 1);
    const attacks = getLegalActions(state, library).filter(
      (action) => action.type === "attack_core" || action.type === "attack_minion",
    );
    expect(attacks).toEqual([]);
    // The other half of the card. The reveal is a rule, so the engine owns it
    // and the UI asks; a silenced Watcher shows nothing.
    expect(opponentHandRevealed(state, 0)).toBe(true);
    expect(opponentHandRevealed(state, 1)).toBe(false);
    state.players[0].board[0]!.silenced = true;
    expect(opponentHandRevealed(state, 0)).toBe(false);
  });

  it("Aizen is Reborn twice, dropping a life from his printed text each time", () => {
    const killer = (atk: number) =>
      minion("John Wick", 1, {
        atk,
        hp: 40,
        maxHp: 40,
        sleeping: false,
        effectId: "none" as const,
        effectTiming: "none" as const,
        keywords: [],
      });
    const swing = { type: "attack_minion" as const, player: 1 as const, attackerSlot: 0, targetSlot: 0 };

    const state = mainState("aizen-reborn");
    state.players[0].board[0] = minion("Aizen", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[0] = killer(5);
    state.activePlayer = 1;

    // First death: two lives become one, and the count drops out of the text.
    const first = applyAction(state, swing, library).state;
    expect(first.players[0].board[0]).toMatchObject({
      name: "Aizen",
      hp: 1,
      keywords: ["Reborn"],
      effectId: "aizen_reborn_once",
      effectTiming: "reborn",
      effect: "Reborn. Silence and chain your killer",
    });
    expect(first.players[1].board[0]).toMatchObject({ silenced: true, chained: 3 });

    // Second death: the last life is spent, so the body comes back with no
    // text at all — and the killer is still cursed, because Aizen still had
    // the line printed when he died.
    const second = { ...first, activePlayer: 1 as const, phase: "main" as const };
    second.players[1].board[0] = killer(5);
    const third = applyAction(second, swing, library).state;
    expect(third.players[0].board[0]).toMatchObject({
      name: "Aizen",
      hp: 1,
      keywords: [],
      effectId: "none",
      effectTiming: "none",
    });
    expect(third.players[1].board[0]).toMatchObject({ silenced: true, chained: 3 });

    // Third death: nothing left to spend, and no curse either.
    const last = { ...third, activePlayer: 1 as const, phase: "main" as const };
    last.players[1].board[0] = killer(5);
    const gone = applyAction(last, swing, library).state;
    expect(gone.players[0].board[0]).toBeNull();
    expect(gone.players[1].board[0]).toMatchObject({ silenced: false, chained: 0 });
  });

  it("a Silenced Aizen is not Reborn at all", () => {
    const state = mainState("aizen-silenced");
    state.players[0].board[0] = minion("Aizen", 0, { hp: 1, maxHp: 1, silenced: true });
    state.players[1].board[0] = minion("John Wick", 1, {
      atk: 5,
      hp: 20,
      maxHp: 20,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    state.activePlayer = 1;
    const after = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[1].board[0]).toMatchObject({ silenced: false, chained: 0 });
  });

  it("Kaido destroys the enemy Taunt minion and leaves a non-Taunt minion alive", () => {
    const state = mainState("kaido-taunt");
    state.players[1].board[0] = minion("The Five Convicts", 1);
    state.players[1].board[1] = minion("John Wick", 1);
    const asking = play(state, 0, "Kaido", 2);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[1].board[1]?.name).toBe("John Wick");
  });

  it("Whitebeard deals 3 to the ENEMY board and spares your own", () => {
    const state = mainState("whitebeard-aoe");
    state.players[0].board[0] = minion("John Wick", 0, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    state.players[1].board[0] = minion("Zoro", 1, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    const after = play(state, 0, "Whitebeard", 2);
    // Enemy only. This is what separates him from Meteor, which costs the same,
    // has the same body, hits for 4, and hits YOUR board too.
    expect(after.players[0].board[0]?.hp).toBe(9);
    expect(after.players[1].board[0]?.hp).toBe(6);
    expect(after.players[0].board[2]?.hp).toBe(3);
  });

  it("Meteor deals 4 to every other minion, including your own", () => {
    const state = mainState("meteor-aoe");
    state.players[0].board[0] = minion("John Wick", 0, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    state.players[1].board[0] = minion("Zoro", 1, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    const after = play(state, 0, "Meteor", 2);
    expect(after.players[0].board[0]?.hp).toBe(5);
    expect(after.players[1].board[0]?.hp).toBe(5);
    // "All OTHER minions" — the meteor does not hit itself.
    expect(after.players[0].board[2]?.hp).toBe(3);
  });

  it("Gandalf the White gives Divine Shield to every friendly Good minion only", () => {
    const state = mainState("gandalf-shields");
    state.players[0].board[0] = minion("John Wick", 0, { alignment: "Good", divineShield: false });
    state.players[0].board[1] = minion("Zoro", 0, { alignment: "Evil", divineShield: false });
    const after = play(state, 0, "Gandalf the White", 2);
    expect(after.players[0].board[0]?.divineShield).toBe(true);
    expect(after.players[0].board[1]?.divineShield).toBe(false);
    expect(after.players[0].board[2]?.divineShield).toBe(true);
  });

  it("The Mask transforms all friendly minions into random minions that cost one more", () => {
    const state = mainState("mask-transform");
    state.players[0].board[1] = minion("John Wick", 0);
    const after = play(state, 0, "The Mask", 0);
    expect(after.players[0].board[0]).not.toBeNull();
    expect(after.players[0].board[1]).not.toBeNull();
    expect(after.players[0].board[0]?.cost).toBe(7);
    expect(after.players[0].board[1]?.cost).toBe(2);
  });

  it("Stain destroys a damaged enemy and leaves a full-health enemy alive", () => {
    const state = mainState("stain-damaged");
    state.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });
    state.players[1].board[1] = minion("Zoro", 1, { hp: 2, maxHp: 3 });
    const asking = play(state, 0, "Stain", 2);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[1].board[0]?.name).toBe("John Wick");
    expect(after.players[1].board[1]).toBeNull();
  });

  it("Rudeus makes the Hero Power free while active, but not while silenced", () => {
    const state = mainState("rudeus-free-hero-power");
    state.cheatMode = false;
    state.heroPowers = ["minion_hp", null];
    state.players[0].mana = 0;
    state.players[0].board[0] = minion("Rudeus Greyrat", 0);
    state.players[0].board[1] = minion("John Wick", 0);

    expect(getLegalActions(state, library)).toContainEqual({ type: "use_hero_power", player: 0 });
    const pending = applyAction(state, { type: "use_hero_power", player: 0 }, library).state;
    expect(pending.players[0].mana).toBe(0);
    expect(pending.heroPowerUsed[0]).toBe(true);

    pending.players[0].board[0]!.silenced = true;
    pending.pendingTarget = null;
    pending.phase = "main";
    pending.heroPowerUsed = [false, false];
    expect(getLegalActions(pending, library)).not.toContainEqual({ type: "use_hero_power", player: 0 });
  });

  it("Prince Lloyd reduces damage to other friendly minions, not to himself", () => {
    const state = mainState("lloyd-damage-ward");
    state.players[0].board[0] = minion("Prince Lloyd", 0);
    state.players[0].board[1] = minion("John Wick", 0, { hp: 5, maxHp: 5 });
    state.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });

    const after = play(state, 0, "Dabi", 2);
    expect(after.players[0].board[0]?.divineShield).toBe(false);
    expect(after.players[0].board[1]?.hp).toBe(5);
    expect(after.players[1].board[0]?.hp).toBe(4);

    const silenced = mainState("lloyd-silenced");
    silenced.players[0].board[0] = minion("Prince Lloyd", 0, { silenced: true });
    silenced.players[0].board[1] = minion("John Wick", 0, { hp: 5, maxHp: 5 });
    silenced.players[1].board[0] = minion("John Wick", 1, { hp: 5, maxHp: 5 });
    const withoutWard = play(silenced, 0, "Dabi", 2);
    expect(withoutWard.players[0].board[1]?.hp).toBe(4);
    expect(withoutWard.players[1].board[0]?.hp).toBe(4);
  });
});

/**
 * The one thing nobody had ever measured.
 *
 * Chained and Freeze had been the same card for months — both cost exactly one
 * turn — because the chain counter is spent at the START of a turn, before
 * attacks are offered, so a counter of 1 blocked nothing and 2 blocked one turn.
 * Four cards printed "Chained for 1 turn" and delivered a Freeze; Queen's Cocoon
 * printed a drawback that cost its bearer nothing at all.
 *
 * These tests assert the PRICE in turns rather than the counter, because the
 * counter is the thing that was lying. A card change that makes Chained cost one
 * turn again fails here.
 */
describe("what Chained and Freeze cost, in turns", () => {
  /** How many of player 0's own turns pass before slot 0 may attack again. */
  function turnsLost(start: GameState): number {
    let state = start;
    for (let ownTurn = 1; ownTurn <= 5; ownTurn += 1) {
      state = endTurn(endTurn(state, 0), 1);
      const canSwing = getLegalActions(state, library).some(
        (action) =>
          (action.type === "attack_minion" || action.type === "attack_core") && action.attackerSlot === 0,
      );
      if (canSwing) return ownTurn - 1;
    }
    return 99;
  }

  function boardWith(seed: string, overrides: Partial<MinionInstance>): GameState {
    const state = mainState(seed);
    state.players[0].board[0] = minion("John Wick", 0, { sleeping: false, atk: 3, ...overrides });
    state.players[1].board[0] = minion("Albion", 1, { sleeping: false, chained: 0 });
    return state;
  }

  it("an untouched minion loses nothing", () => {
    expect(turnsLost(boardWith("chain-baseline", {}))).toBe(0);
  });

  it("Freeze costs exactly one turn", () => {
    expect(turnsLost(boardWith("chain-freeze", { frozen: true, attacksUsed: 1 }))).toBe(1);
  });

  it("a chain laid by an effect costs exactly two turns", () => {
    // Through Darth Vader, so the number comes from the engine's own
    // `applyChain` rather than from a counter typed into the test.
    const state = mainState("chain-vader");
    state.players[0].board[0] = minion("John Wick", 0, { sleeping: false, atk: 3 });
    state.players[1].board[0] = minion("Albion", 1, { sleeping: false, chained: 0 });
    const asking = play(state, 1, "Darth Vader", 1);
    const chained = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(chained.players[0].board[0]?.chained).toBeGreaterThan(0);
    expect(turnsLost({ ...chained, activePlayer: 0, phase: "main" })).toBe(2);
  });

  it("a card that arrives Chained also costs two turns, its sleep being one of them", () => {
    const state = mainState("chain-arrives");
    const arrived = play(state, 0, "Albion", 0);
    expect(arrived.players[0].board[0]?.chained).toBeGreaterThan(0);
    // One of the two is the turn it was played, which it would have slept
    // through anyway, so only one more turn-start is blocked from here.
    expect(turnsLost(arrived)).toBe(1);
  });

  it("Queen's Cocoon really chains its bearer", () => {
    const state = mainState("chain-cocoon");
    state.players[0].board[0] = minion("John Wick", 0, { sleeping: false, atk: 3 });
    state.players[0].hand = [relics.find((relic) => relic.name === "Queen's Cocoon")!.id];
    const equipped = applyAction(
      state,
      { type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 },
      library,
    ).state;
    expect(equipped.players[0].board[0]?.chained).toBeGreaterThan(0);
    expect(turnsLost(equipped)).toBe(2);
  });
});

/**
 * Plays a minion whose Battlecry is `copy_and_trigger`.
 *
 * No card in the roster prints that effect any more — All for One traded it for
 * a passive on 2 September 2026 — but the effect is still in the engine, and it
 * is still the only place in the game where a target choice is BUILT BY HAND
 * rather than offered through a prompt. That hand-built choice is what these two
 * tests exist to pin, so the coverage moves onto a one-off library rather than
 * disappearing with the card.
 */
const carrierCards = cards.map((card) =>
  card.name === "All for One"
    ? { ...card, effectId: "copy_and_trigger" as const, effectTiming: "onPlay" as const, keywords: [] }
    : card,
);
const carrierLibrary = makeCardLibrary(carrierCards, relics);

function playCarrier(state: GameState, player: PlayerId, slotIndex: number): GameState {
  const next: GameState = { ...state, activePlayer: player, phase: "main", drawChoice: null, cheatMode: true };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [cardId("All for One")] };
  return applyAction(next, { type: "play_card", player, handIndex: 0, slotIndex }, carrierLibrary).state;
}

describe("All for One cannot copy a copy of itself", () => {
  it("refuses a victim that is itself carrying Copy-and-trigger, instead of recursing forever", () => {
    // Pandora's Actor BECOMES another minion's effects, so it can end up
    // carrying All for One's own Battlecry. All for One then copied that, wore
    // "copy an effect" as its effect, ran it against the same victim, and copied
    // it again — a hard `Maximum call stack size exceeded` crash, not a bad
    // board. The balance harness hit it once in 800 self-play duels.
    const state = mainState("all-for-one-mirror");
    state.players[1].board[0] = minion("Pandora's Actor", 1, {
      effectId: "copy_and_trigger",
      effectTiming: "onPlay",
    });
    state.players[1].board[1] = minion("John Wick", 1);

    const asking = playCarrier(state, 0, 0);
    // The mirror is not offered at all: every legal target is a minion that is
    // not wearing this same power.
    const offered = (asking.pendingTarget?.options ?? []).map(
      (option) => asking.players[option.owner].board[option.slot]?.effectId,
    );
    expect(offered).not.toContain("copy_and_trigger");

    const resolved = asking.pendingTarget ? choose(asking, 0) : asking;
    // Whatever it copied, it is holding its own effect again afterwards.
    expect(resolved.players[0].board[0]?.copyRestoreEffectId ?? null).toBeNull();
  });

  it("fizzles quietly when the mirror is the only enemy on the board", () => {
    // With nothing else to copy, the Battlecry finds no legal target and does
    // nothing. That is the correct outcome and, more to the point, it is a
    // finite one — this is the board that used to crash the duel outright.
    const state = mainState("all-for-one-only-mirror");
    state.players[1].board[0] = minion("Pandora's Actor", 1, {
      effectId: "copy_and_trigger",
      effectTiming: "onPlay",
    });

    const played = playCarrier(state, 0, 0);
    expect(played.pendingTarget).toBeNull();
    expect(played.players[0].board[0]?.effectId).toBe("copy_and_trigger");
    expect(played.players[0].board[0]?.copyRestoreEffectId ?? null).toBeNull();
    expect(played.players[1].board[0]?.name).toBe("Pandora's Actor");
  });
});

/**
 * Two bugs the owner reported from real duels, pinned here so the answer is not
 * "I looked and it seemed fine".
 */
describe("reported from play, 2 September 2026", () => {
  it("John Wick counts only HIS OWN side's deaths", () => {
    // Reported as: the opponent's John Wick grew when my minions died.
    const state = mainState("john-wick-enemy-death");
    state.players[1].board[0] = minion("John Wick", 1); // theirs
    state.players[0].board[0] = minion("Zoro", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[1] = minion("Modern Tank", 0, { hp: 1, maxHp: 1 });
    state.players[1].board[1] = minion("Dragon", 1, { atk: 9, hp: 9, maxHp: 9, sleeping: false });
    state.activePlayer = 1;

    const printed = minion("John Wick", 1);
    const afterEnemyDeath = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(afterEnemyDeath.players[0].board[0]).toBeNull();
    expect(afterEnemyDeath.players[1].board[0]).toMatchObject({ atk: printed.atk, maxHp: printed.maxHp });

    // And he DOES grow when one of his own dies, so the guard is not just
    // switching the card off.
    const ally = mainState("john-wick-own-death");
    ally.players[1].board[0] = minion("John Wick", 1);
    ally.players[1].board[1] = minion("Zoro", 1, { hp: 1, maxHp: 1 });
    ally.players[0].board[0] = minion("Dragon", 0, { atk: 9, hp: 9, maxHp: 9, sleeping: false });
    ally.activePlayer = 0;
    const afterOwnDeath = applyAction(
      ally,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 },
      library,
    ).state;
    expect(afterOwnDeath.players[1].board[1]).toBeNull();
    expect(afterOwnDeath.players[1].board[0]).toMatchObject({ atk: printed.atk + 1, maxHp: printed.maxHp + 1 });
  });

  it("The Mask transforms only the caster's own board", () => {
    // Reported as: the opponent's Mask changed all minions. It does not — but
    // when both boards are full, a correct cast still turns over half the table
    // in one animation, which is what that looks like from the other seat.
    const state = mainState("mask-caster-only");
    state.players[0].board[0] = minion("Zoro", 0);
    state.players[0].board[1] = minion("Modern Tank", 0);
    const mine = [state.players[0].board[0]!.name, state.players[0].board[1]!.name];

    const after = play(state, 1, "The Mask", 0);
    expect(after.players[0].board[0]?.name).toBe(mine[0]);
    expect(after.players[0].board[1]?.name).toBe(mine[1]);
    // The caster's own body is on its board and is a legal victim of its own
    // Battlecry, so the only claim here is about whose board was touched.
    expect(after.players[1].board.filter(Boolean).length).toBeGreaterThan(0);
  });
});
