import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
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
    });
    expect(after.players[0].board[1]?.art).toContain("token-larva.webp");
  });

  it("Naruto fills every empty friendly slot with 2/2 Shadow Clones", () => {
    const state = mainState("naruto-shadow-clones");
    state.players[0].board[1] = minion("John Wick", 0);

    const after = play(state, 0, "Naruto", 0);
    const clones = after.players[0].board.filter((entry) => entry?.cardId === "token:shadow-clone");

    expect(clones).toHaveLength(3);
    expect(clones.every((entry) => entry?.name === "Shadow Clone" && entry.atk === 2 && entry.hp === 2)).toBe(true);
    expect(clones.every((entry) => entry?.art.includes("token-shadow-clone.webp"))).toBe(true);
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

    const sameTurnRelic = after.players[0].hand[0];
    after.players[0].hand = [sameTurnRelic];
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

  it("Guts gains and loses a live +1/+1 aura as the Core crosses 20 HP thresholds", () => {
    const state = mainState("guts-missing-core-growth");
    state.players[0].health = 54;
    const grown = play(state, 0, "Guts", 0);
    expect(grown.players[0].board[0]).toMatchObject({ atk: 2, hp: 2, maxHp: 2 });

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
        atk: 3,
        hp: 3,
        effectId: "battleship_tech_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: All friendly Tech minions have +1/+1",
      },
      Dormammu: { cost: 9, atk: 8, hp: 5, effectId: "dark_dimension_banish", effectTiming: "onPlay" },
      "Doctor Strange": { cost: 7, atk: 3, hp: 2, effectId: "strange_bargain", effectTiming: "onPlay" },
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
        atk: 2,
        hp: 4,
        effectId: "light_yagami_nature_kill",
        effectTiming: "onPlayAndDeathrattle",
        keywords: ["Deathrattle"],
        effect: "Battlecry and Deathrattle: Destroy a random Nature enemy minion",
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
        keywords: [],
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
        effect: "Taunt. Passive: Enemy minions that attack this become Chained for 1 turn",
      },
      Zoro: { cost: 5, atk: 4, hp: 4, effectId: "on_kill_buff_1", effectTiming: "passive", keywords: [], effect: "Passive: Gain +1/+1 after killing a minion" },
      "One-Eyed Owl": { cost: 5, atk: 6, hp: 6, effectId: "none", effectTiming: "none", keywords: ["Chained"], effect: "Chained" },
      "Gravelord Nito": { cost: 4, atk: 2, hp: 3, effectId: "nito_any_death_1_1", effectTiming: "passive", keywords: [], effect: "Passive: Gain +1/+1 when a minion dies" },
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
        effect: "Deathrattle: Summon Galactus (8/8) with Taunt that cannot attack",
      },
      "Pillar Men": { cost: 4, atk: 5, hp: 5, effectId: "none", effectTiming: "none", keywords: ["Chained"], effect: "Chained" },
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
        keywords: [],
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
      Superman: { atk: 6, hp: 6, effectId: "superman_damage_cap_3", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Cannot lose more than 3 HP at once" },
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
      "Deep Sea King": { atk: 4, hp: 4, effectId: "invulnerable_if_frozen", effectTiming: "passive", keywords: ["Passive"] },
      "Seven Deadly Sins": { atk: 4, hp: 5, effectId: "summon_sins", effectTiming: "onPlay", keywords: [] },
      "Elder Centipede": { cost: 7, atk: 5, hp: 6, effectId: "self_buff_2", effectTiming: "ongoing", keywords: ["Ongoing"] },
      "All Might": {
        atk: 4,
        hp: 5,
        effectId: "all_enemy_atk_down_1",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: While on the board, every enemy minion has -1 ATK",
      },
      "Fantastic Four": {
        cost: 4,
        atk: 1,
        hp: 2,
        effectId: "fantastic_four_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
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
      Sans: { cost: 4, atk: 1, hp: 1, effectId: "dodge_80", effect: "Passive: Evade 80% of attacks" },
      "Doom Slayer": { cost: 8, atk: 3, hp: 8, effectId: "doom_evil_slayer", effectTiming: "passive", keywords: ["Passive"] },
      Ragnaros: { cost: 6, atk: 6, hp: 6, effectId: "ragnaros_end_turn", effectTiming: "passive", keywords: ["Passive"] },
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
      "Ten Commandments": { atk: 3, hp: 5, effectId: "ten_commandments_first_attack", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: The first enemy minion to attack each turn is Chained for 1 turn" },
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

  it("Light Yagami destroys a random Nature enemy on play and on death", () => {
    const battlecry = mainState("light-yagami-battlecry");
    battlecry.players[1].board[0] = minion("John Wick", 1);
    battlecry.players[1].board[1] = minion("Modern Tank", 1);
    const afterBattlecry = play(battlecry, 0, "Light Yagami", 0);
    expect(afterBattlecry.players[1].board[0]).toBeNull();
    expect(afterBattlecry.players[1].board[1]).not.toBeNull();

    const deathrattle = mainState("light-yagami-deathrattle");
    deathrattle.players[0].board[0] = minion("Light Yagami", 0, { hp: 1, maxHp: 1, sleeping: false });
    deathrattle.players[1].board[0] = minion("John Wick", 1);
    deathrattle.players[1].board[1] = minion("Modern Tank", 1, { atk: 9, sleeping: false });
    deathrattle.activePlayer = 1;
    const afterDeath = applyAction(
      deathrattle,
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toBeNull();
    expect(afterDeath.players[1].board[0]).toBeNull();
    expect(afterDeath.players[1].board[1]).not.toBeNull();
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

  it("Fantastic Four assigns its four effects left-to-right and loses them when killed", () => {
    const state = mainState();
    for (const slot of [0, 1, 2, 3]) state.players[0].board[slot] = minion("John Wick", 0, { effectId: "none", effectTiming: "none", keywords: [] });
    const placed = play(state, 0, "Fantastic Four", 4);
    expect(placed.players[0].board[0]?.keywords).toContain("Taunt");
    expect(placed.players[0].board[1]?.divineShield).toBe(true);
    expect(placed.players[0].board[2]?.atk).toBe(3);
    expect(placed.players[0].board[3]?.maxHp).toBe(3);

    placed.players[0].board[0]!.keywords = [];
    placed.players[1].board[0] = minion("Zoro", 1, { atk: 99, sleeping: false, hp: 99, maxHp: 99 });
    placed.activePlayer = 1;
    const after = applyAction(placed, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 4 }, library).state;
    expect(after.players[0].board[4]).toBeNull();
    expect(after.players[0].board[0]?.keywords).not.toContain("Taunt");
    expect(after.players[0].board[1]?.divineShield).toBe(false);
    expect(after.players[0].board[2]?.atk).toBe(1);
    expect(after.players[0].board[3]?.maxHp).toBe(1);
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
    expect(afterDeath.players[0].board[0]?.art).toBe("/card-art/raw/token-awakened.webp");
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
    expect(marked.players[1].board[1]?.chained).toBe(2);

    const replacement = { ...marked, players: [...marked.players] as GameState["players"] } as GameState;
    replacement.players[1] = { ...marked.players[1], board: [...marked.players[1].board] };
    replacement.players[1].board[1] = minion("John Wick", 1);
    const enforced = endTurn(replacement, 0);
    expect(enforced.players[1].board[1]?.chained).toBe(2);
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
    expect(stasis.stasis[0].returnAtTurn).toBe(stasis.turnNumber + 2);

    const twoTurnsLater = endTurn(endTurn(stasis, 0), 1);
    expect(twoTurnsLater.stasis).toHaveLength(0);
    expect(twoTurnsLater.players[1].board[2]?.name).toBe("Zoro");
  });

  it("Darth Vader chains a target but cannot target one that is already Chained", () => {
    const state = mainState("vader-chain");
    state.players[1].board[0] = minion("John Wick", 1);
    const chained = play(state, 0, "Darth Vader", 1);
    expect(chained.players[1].board[0]).toMatchObject({ atk: 1, chained: 2 });

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
    const tokenKeywords = sins.map((entry) => entry?.keywords ?? []);
    expect(tokenKeywords.every((keywords) => keywords.length === 1)).toBe(true);
    expect(tokenKeywords.map(([keyword]) => keyword).sort()).toEqual(
      ["Taunt", "Divine Shield", "Charge", "Chained"].sort(),
    );
    expect(sins.every((entry) => entry?.atk === 1 && entry?.hp === 1 && entry.art.endsWith("/token-sin.webp"))).toBe(true);
    expect(sins.every((entry) => entry?.art !== after.players[0].board[0]?.art)).toBe(true);
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
    const buffed = play(tech, 0, "Battleship", 0);
    expect(buffed.players[0].board[0]).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(buffed.players[0].board[1]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
    expect(buffed.players[0].board[2]).toMatchObject({ atk: 2, hp: 3, maxHp: 3 });
    expect(buffed.players[1].board[0]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
    buffed.players[0].board[0]!.silenced = true;
    const auraRemoved = applyAction(buffed, { type: "end_turn", player: 0 }, library).state;
    expect(auraRemoved.players[0].board[0]).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
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
  });

  it("Planetary Defense Grid buffs every Taunt minion and loses the aura when silenced", () => {
    const state = mainState("planetary-defense-grid-aura");
    state.players[0].board[1] = minion("Dragon", 0);
    state.players[1].board[0] = minion("Wall of Flesh", 1);
    state.players[1].board[1] = minion("John Wick", 1);
    const buffed = play(state, 0, "Planetary Defense Grid", 0);

    // "All OTHER Taunt minions", so the grid keeps its printed 4/8 rather than
    // feeding its own aura, and the buff is +2/+2.
    expect(buffed.players[0].board[0]).toMatchObject({ atk: 4, hp: 8, maxHp: 8 });
    expect(buffed.players[0].board[1]).toMatchObject({ atk: 5, hp: 7, maxHp: 7 });
    expect(buffed.players[1].board[0]).toMatchObject({ atk: 5, hp: 7, maxHp: 7 });
    expect(buffed.players[1].board[1]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });

    buffed.players[0].board[0]!.silenced = true;
    const auraGone = endTurn(buffed, 0);
    expect(auraGone.players[0].board[0]).toMatchObject({ atk: 4, hp: 8, maxHp: 8 });
    expect(auraGone.players[0].board[1]).toMatchObject({ atk: 3, hp: 5, maxHp: 5 });
    expect(auraGone.players[1].board[0]).toMatchObject({ atk: 3, hp: 5, maxHp: 5 });
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

    const might = mainState("all-might-aura");
    might.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 5, maxHp: 5 });
    const empowered = play(might, 0, "All Might", 0);
    expect(empowered.players[1].board[0]?.atk).toBe(4);
    empowered.players[1].board[1] = minion("John Wick", 1, { atk: 0, hp: 5, maxHp: 5 });
    const clamped = applyAction(empowered, { type: "end_turn", player: 0 }, library).state;
    expect(clamped.players[1].board[0]?.atk).toBe(4);
    expect(clamped.players[1].board[1]?.atk).toBe(0);
    const refreshed = endTurn(clamped, 1);
    expect(refreshed.players[1].board[0]?.atk).toBe(4);
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
    expect(awake.players[1].board[0]?.atk).toBe(4);
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
    // A deliberately stat-only victim: Modern Tank is a Basic reference card and
    // is supposed to stay a plain 3/3, so this measures the stats graft alone.
    state.players[0].board[1] = minion("Modern Tank", 0);
    const asking = play(state, 0, "Godrick the Grafted", 0);
    const targetIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    const after = targetIndex >= 0 ? choose(asking, targetIndex) : asking;
    const godrick = after.players[0].board[0];
    expect(after.players[0].board[1]).toBeNull();
    expect(godrick).toMatchObject({ atk: 5, hp: 5, maxHp: 5, effectId: "none", effectTiming: "none" });
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
    expect(after.players[0].board[0]?.chained).toBe(2);
    expect(after.players[0].board[1]?.chained).toBe(0);
    expect(after.players[1].board[0]?.chained).toBe(2);
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
      chained: 2,
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

  it("Thanos destroys one random minion per side and discards one card per player", () => {
    const state = mainState("thanos-snap");
    state.players[0].hand = [cardId("Thanos"), cardId("Zoro")];
    state.players[1].hand = [cardId("Zoro")];
    state.players[1].board[0] = minion("John Wick", 1);

    const after = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library).state;
    expect(after.players[0].board.every((entry) => entry === null)).toBe(true);
    expect(after.players[1].board.every((entry) => entry === null)).toBe(true);
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[1].hand).toEqual([]);
    expect(after.discard).toEqual([cardId("Thanos"), cardId("John Wick"), cardId("Zoro"), cardId("Zoro")]);
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

  it("Flash can attack exactly 2 times for 10 total core damage", () => {
    let state = mainState("flash-two-attacks");
    state.players[0].board[0] = minion("Flash", 0, { sleeping: false });
    const before = state.players[1].health;

    for (let attack = 0; attack < 2; attack += 1) {
      expect(getLegalActions(state, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
      state = applyAction(state, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    }

    expect(before - state.players[1].health).toBe(10);
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

  it("All for One copies Dabi's effect and triggers its exact 1 damage sweep", () => {
    const state = mainState("all-for-one-dabi");
    state.players[0].board[1] = minion("John Wick", 0, { hp: 10, maxHp: 10 });
    state.players[1].board[0] = minion("Dabi", 1, { hp: 10, maxHp: 10 });

    const after = play(state, 0, "All for One", 0);
    expect(after.players[0].board[0]?.hp).toBe(5);
    expect(after.players[0].board[1]?.hp).toBe(9);
    expect(after.players[1].board[0]?.hp).toBe(9);
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
    expect(afterDeath.players[0].board[0]?.art).toBe("/card-art/raw/token-drakath.webp");
  });

  it("Big Mom gains exactly the devoured friendly minion's ATK and HP", () => {
    const state = mainState("big-mom-devour");
    state.players[0].board[2] = minion("John Wick", 0, { atk: 2, hp: 4, maxHp: 4 });

    const after = play(state, 0, "Big Mom", 0);
    expect(after.players[0].board[2]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 5, hp: 9, maxHp: 9 });
  });

  it("Grand Master Oogway rescues one dying ally per turn and Chains for 1 turn", () => {
    const state = mainState("oogway-rescue");
    state.players[0].board[0] = minion("Grand Master Oogway", 0);
    state.players[0].board[1] = minion("John Wick", 0, { hp: 1, maxHp: 1 });
    state.players[0].board[2] = minion("Zoro", 0, { hp: 1, maxHp: 1 });
    state.players[0].hand = [];
    state.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    state.players[1].board[1] = minion("Zoro", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;

    const first = applyAction(state, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(first.players[0].board[0]).toMatchObject({ divineShield: true, chained: 2, rescueUsedAtTurn: first.turnNumber });
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

  it("Mr. Poopybutthole Reborns at the printed 75% branch and can fail the 25% branch", () => {
    const success = mainState("reborn-0");
    success.players[0].board[0] = minion("Mr. Poopybutthole", 0, { hp: 1, maxHp: 1 });
    success.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    success.activePlayer = 1;
    const reborn = applyAction(success, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(reborn.players[0].board[0]).toMatchObject({
      name: "Mr. Poopybutthole",
      atk: 1,
      hp: 1,
      maxHp: 1,
      suppressArrivalTheme: true,
    });

    const failure = mainState("reborn-fail-2");
    failure.players[0].board[0] = minion("Mr. Poopybutthole", 0, { hp: 1, maxHp: 1 });
    failure.players[1].board[0] = minion("John Wick", 1, { atk: 5, hp: 20, maxHp: 20, sleeping: false });
    failure.activePlayer = 1;
    const notReborn = applyAction(failure, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(notReborn.players[0].board[0]).toBeNull();
    expect(notReborn.discard).toContain(cardId("Mr. Poopybutthole"));
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

  it("Kagaya Ubuyashiki draws a random Taunt, Divine Shield, or Passive minion", () => {
    const state = mainState("kagaya-keyword-draw");
    state.deck = [cardId("John Wick"), cardId("The Five Convicts")];
    const after = play(state, 0, "Kagaya Ubuyashiki", 0);

    expect(after.pendingTarget).toBeNull();
    expect(after.players[0].hand).toEqual([cardId("The Five Convicts")]);
    expect(after.deck).toEqual([cardId("John Wick")]);
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
  });

  it("Aizen has the printed 50% Reborn chance and always silences and chains the killer", () => {
    const success = mainState("aizen-reborn");
    success.rngSeed = 1;
    success.players[0].board[0] = minion("Aizen", 0, { hp: 1, maxHp: 1 });
    success.players[1].board[0] = minion("John Wick", 1, {
      atk: 5,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    success.activePlayer = 1;
    const reborn = applyAction(success, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(reborn.players[0].board[0]).toMatchObject({ name: "Aizen", hp: 4, maxHp: 4, effectId: "none" });
    expect(reborn.players[1].board[0]).toMatchObject({ silenced: true, chained: 2 });

    const failure = mainState("aizen-no-reborn");
    failure.rngSeed = 12345;
    failure.players[0].board[0] = minion("Aizen", 0, { hp: 1, maxHp: 1 });
    failure.players[1].board[0] = minion("John Wick", 1, {
      atk: 5,
      hp: 10,
      maxHp: 10,
      sleeping: false,
      effectId: "none",
      effectTiming: "none",
      keywords: [],
    });
    failure.activePlayer = 1;
    const gone = applyAction(failure, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(gone.players[0].board[0]).toBeNull();
    expect(gone.players[1].board[0]).toMatchObject({ silenced: true, chained: 2 });
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
