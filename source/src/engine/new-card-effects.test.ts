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
      "Star Destroyer": {
        cost: 8,
        atk: 5,
        hp: 5,
        effectId: "star_destroyer_tie_fighters",
        effectTiming: "onPlay",
        effect: "Battlecry: Summon two 1/1 TIE Fighters with Charge.",
      },
      Battleship: {
        cost: 4,
        atk: 3,
        hp: 3,
        effectId: "battleship_tech_aura",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: All friendly Tech minions have +1/+1.",
      },
      Dormammu: { cost: 9, atk: 8, hp: 5, effectId: "dark_dimension_banish", effectTiming: "onPlay" },
      "Doctor Strange": { cost: 7, atk: 3, hp: 2, effectId: "strange_bargain", effectTiming: "onPlay" },
      "Kento Nanami": { cost: 3, atk: 1, hp: 1, effectId: "set_hp_1", effectTiming: "onPlay", keywords: [] },
      "Ainz Ooal Gown": { cost: 9, atk: 3, hp: 3, effectId: "set_all_enemy_hp_1", effectTiming: "onPlay", keywords: [] },
      "Eye of Sauron": {
        cost: 1,
        atk: 1,
        hp: 5,
        effectId: "enemy_cards_cost_1_more",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Enemy cards cost 1 more",
      },
      Kizaru: { atk: 4, hp: 4 },
      "Avatar Aang": {
        cost: 6,
        atk: 2,
        hp: 3,
        effectId: "avatar_aang_awakened",
        effectTiming: "onPlay",
        keywords: ["Deathrattle"],
        effect: "Battlecry: Restore all friendly minions to full health. Deathrattle: Summon the Awakened (6/3).",
      },
      Chaos: {
        cost: 8,
        atk: 1,
        hp: 1,
        effectId: "chaos_random_summon",
        effectTiming: "onPlay",
        keywords: ["Deathrattle"],
        effect: "Battlecry: Summon a random minion from the deck. Deathrattle: Summon a random minion from the deck.",
      },
      UFO: { effectId: "none", effectTiming: "none", keywords: [], effect: "-" },
      Yujiro: { atk: 4, hp: 4, effectId: "immune_nature_minions", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: Immune to Nature minions" },
      Vegapunk: { effectId: "discover_tech_card", effectTiming: "onPlay", keywords: [] },
      "John Wick": { atk: 1, hp: 1, effectId: "friendly_death_buff_1_1", effectTiming: "passive" },
      Joker: { atk: 1, hp: 1, effectId: "copy_minion_to_hand", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Put a copy of a minion in your hand." },
      "Escanor \"The One\"": { cost: 8, atk: 8, hp: 4, effectId: "double_other_friendly_attack", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Double your other friendly minions attack." },
      "Lelouch Lamperouge": { cost: 9, atk: 1, hp: 1, effectId: "mind_control_enemy", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Gain control of an enemy minion" },
      "Ultron Prime": { cost: 7, atk: 4, hp: 5, effectId: "none", effectTiming: "none", keywords: [], effect: "-" },
      Neo: { cost: 10, atk: 5, hp: 7, effectId: "protect_slot", effectTiming: "onPlay" },
      "Monkey D. Luffy": { cost: 8, atk: 6, hp: 4, effectId: "free_chained_shield", effectTiming: "onPlay" },
      Meruem: { cost: 6, atk: 4, hp: 5, effectId: "meruem_kill_copy", effectTiming: "passive" },
      "The Driller": { cost: 5, atk: 1, hp: 1, effectId: "consume_tech_5_hp", effectTiming: "onPlay", keywords: [] },
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
        effect: "Passive: Ignore Taunt.",
      },
      "The Five Convicts": { cost: 3, atk: 5, hp: 1, keywords: ["Taunt"], effectId: "none", effectTiming: "none", effect: "Taunt." },
      "Doctor Octopus": { cost: 4, atk: 3, hp: 3, effectId: "destroy_relic", effectTiming: "onPlay" },
      "The 7 Heroic Spirits": { cost: 2, atk: 2, hp: 2, effectId: "heroic_relics" },
      "Aladdin Lamp": { atk: 5, hp: 4, effectId: "aladdin_wish", effectTiming: "onPlay" },
      "The Mask": { atk: 3, hp: 2, effectId: "transform_random_allies_up", effectTiming: "onPlay", keywords: [] },
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
        effect: "Passive: After it is attacked, gain immunity to that enemies Camp type of attack for the next 3 enemy turns.",
      },
      "Giant Tree": { effectTiming: "passive", keywords: ["Passive"], effectId: "buff_all_nature_2_1", effect: "Passive: All other friendly Nature minions have +2/+1." },
      "Elden Beast": { camp: "Magic", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: All friendly Magic minions have +2 ATK." },
      Darkwing: { effectTiming: "deathrattle", keywords: ["Deathrattle"], effectId: "kill_back", effect: "Deathrattle: The minion which kills this minion also dies right after." },
      "Dr. Heinz Doofenshmirtz": { effect: "Ongoing: 50% to die and 50% to gain +2/+1." },
      "G-Man": { atk: 3, hp: 6, effectId: "stasis_enemy", effectTiming: "onPlay", keywords: [] },
      Superman: { atk: 6, hp: 6, effectId: "superman_damage_cap_3", effectTiming: "passive", keywords: ["Passive"] },
      "Darth Vader": { atk: 3, hp: 2, effectId: "vader_chain_or_destroy", effectTiming: "onPlay", keywords: [] },
      Dumbledore: {
        atk: 2,
        hp: 4,
        effectId: "dumbledore_cleanse",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: Friendly minions cannot be Silenced, Frozen, or Chained. Undo any such curses.",
      },
      Gojo: { atk: 4, hp: 8, effectId: "yoda_global_silence", effectTiming: "passive", keywords: ["Passive"] },
      "Rennala Queen of the Full Moon": { atk: 2, hp: 3, effectId: "rebirth_friendly_dead", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Rebirth a random friendly minion that died this game" },
      "Kagaya Ubuyashiki": { atk: 1, hp: 1, effectId: "discover_random_keyword_minion", effectTiming: "onPlay", keywords: [], effect: "Battlecry: Discover a random Taunt, Divine Shield, and Passive minion in the deck. Draw one" },
      Cecil: { atk: 1, hp: 1, effectId: "bounce_friendly", effectTiming: "onPlay", keywords: [] },
      "Giorno - Gold Experience Requiem": { cost: 10, atk: 4, hp: 8, effectId: "slot_permanent_chain", effectTiming: "onPlay", keywords: [] },
      Avengers: { atk: 4, hp: 4, effectId: "invuln_with_good_ally", effectTiming: "passive", keywords: ["Passive"] },
      "General Grievous": { atk: 3, hp: 3, alignment: "Evil", effectId: "grievous_on_kill_atk", effectTiming: "passive", keywords: ["Passive"] },
      Buddha: { atk: 3, hp: 4, effectId: "buddha_purify", effectTiming: "onPlay", keywords: [] },
      "Deep Sea King": { atk: 4, hp: 4, effectId: "invulnerable_if_frozen", effectTiming: "passive", keywords: ["Passive"] },
      "Seven Deadly Sins": { atk: 4, hp: 5, effectId: "summon_sins", effectTiming: "onPlay", keywords: [] },
      "Elder Centipede": { atk: 5, hp: 6, effectId: "self_buff_2", effectTiming: "ongoing", keywords: ["Ongoing"] },
      "All Might": {
        atk: 4,
        hp: 5,
        effectId: "all_enemy_atk_down_1",
        effectTiming: "passive",
        keywords: ["Passive"],
        effect: "Passive: While on the board, every enemy minion has -1 ATK.",
      },
      Sans: { effectId: "dodge_80", effect: "Passive: Evade 80% of attacks." },
      Musashi: { atk: 2, hp: 1 },
      Illumi: { atk: 1, hp: 1 },
      "Grand Master Yoda": { atk: 5, hp: 5, effectId: "yoda_lowest_atk_buff", effectTiming: "ongoing", keywords: ["Cannot Attack", "Ongoing"] },
      King: { atk: 0, hp: 7, effectId: "king_attack_lock_random", effectTiming: "passive", keywords: ["Cannot Attack", "Passive"] },
      "Dominion Authority": { atk: 4, hp: 5, effectId: "dominion_authority", effectTiming: "passive", keywords: ["Passive"] },
      Kratos: { atk: 3, hp: 4, effectId: "kratos_chain_break", effectTiming: "passive", keywords: ["Chained"] },
      "Ten Commandments": { atk: 3, hp: 5, effectId: "ten_commandments_first_attack", effectTiming: "passive", keywords: ["Passive"], effect: "Passive: The first enemy minion to attack each turn is Chained for 1 turn." },
      "Nine Hashira": { atk: 3, hp: 3, effectId: "hashira_focus_attack", effectTiming: "onPlay", keywords: [] },
      "Kiritsugu Emiya": { atk: 1, hp: 1, effectId: "freeze_and_silence_enemy", effectTiming: "onPlay", keywords: [] },
    };
    for (const [name, fields] of Object.entries(expected)) {
      const card = cards.find((entry) => entry.name === name);
      expect(card, name).toMatchObject(fields);
    }
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
    const protectedTarget = vaderPending.pendingTarget?.options.findIndex((option) => option.owner === 0 && option.slot === 1) ?? -1;
    expect(protectedTarget).toBeGreaterThanOrEqual(0);
    const vaderBlocked = choose(vaderPending, protectedTarget);
    expect(vaderBlocked.players[0].board[1]).toMatchObject({ chained: 0 });
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
    expect(after.players[0].health).toBe(72);
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
    expect(after.players[0].board[0]).toMatchObject({ name: "Morgott, the Omen King", art: "/card-art/raw/token-morgott.png" });
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
    expect(manaChoice.players[0].health).toBe(76);
    expect(manaChoice.players[1].manaPenaltyNextTurn).toBe(5);
    expect(manaChoice.players[0].board[2]?.name).toBe("John Wick");
    const nextOwnTurn = endTurn(endTurn(manaChoice, 0), 1);
    expect(nextOwnTurn.players[1].maxMana).toBe(0);
    expect(nextOwnTurn.players[1].manaPenaltyNextTurn).toBe(0);

    const healthChoice = choose(play(mainState("strange-bargain-health"), 0, "Doctor Strange", 1), 0);
    expect(healthChoice.players[0].health).toBe(76);
    expect(healthChoice.players[1].health).toBe(66);

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

  it("Chaos summons random deck minions on play and on death", () => {
    const state = mainState("chaos-random-summon");
    const zoroId = cardId("Zoro");
    state.deck = [zoroId, zoroId];
    state.bottomDeck = [];

    const afterPlay = play(state, 0, "Chaos", 0);
    expect(afterPlay.players[0].board[1]).toMatchObject({ name: "Zoro", cardId: zoroId });
    expect(afterPlay.deck).toEqual([zoroId]);

    afterPlay.players[1].board[0] = minion("Zoro", 1, { atk: 3, hp: 20, maxHp: 20, sleeping: false });
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(
      afterPlay,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(afterDeath.players[0].board[0]).toMatchObject({ name: "Zoro", cardId: zoroId });
    expect(afterDeath.deck).toEqual([]);
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
    state.players[0].board[0] = minion("UFO", 0);
    state.players[1].board[0] = minion("John Wick", 1, { atk: 4, hp: 10, maxHp: 10, sleeping: false });
    state.activePlayer = 1;
    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
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
    const tokenKeywords = sins.map((entry) => entry?.keywords ?? []);
    expect(tokenKeywords.every((keywords) => keywords.length === 1)).toBe(true);
    expect(tokenKeywords.map(([keyword]) => keyword).sort()).toEqual(
      ["Taunt", "Divine Shield", "Charge", "Chained"].sort(),
    );
    expect(sins.every((entry) => entry?.atk === 1 && entry?.hp === 1 && entry.art.endsWith("/token-sin.png"))).toBe(true);
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
    expect(fighters.every((fighter) => fighter.art.endsWith("/token-tie-fighter.png"))).toBe(true);
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
    expect(clamped.players[1].board[1]?.atk).toBe(0);
    clamped.players[0].board[0] = null;
    const auraGone = applyAction(clamped, { type: "end_turn", player: 1 }, library).state;
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

  it("Toji blocks Magic, while Elden Beast buffs only friendly Magic ATK", () => {
    const blocked = mainState("toji-magic");
    blocked.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 5, hp: 20, maxHp: 20 });
    blocked.players[1].board[0] = minion("Toji", 1);
    const tojiHit = applyAction(blocked, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(tojiHit.players[1].board[0]?.hp).toBe(3);

    const elder = mainState("elder-no-magic-immunity");
    elder.players[0].board[0] = minion("Pandora's Actor", 0, { sleeping: false, atk: 1, hp: 20, maxHp: 20 });
    elder.players[1].board[0] = minion("Elden Beast", 1);
    elder.players[1].board[1] = minion("Pandora's Actor", 1, { atk: 1, hp: 20, maxHp: 20 });
    const elderHit = applyAction(elder, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(elderHit.players[1].board[0]?.hp).toBe(3);
    expect(elderHit.players[1].board[0]?.atk).toBe(6);
    expect(elderHit.players[1].board[1]?.atk).toBe(3);
    expect(elderHit.players[0].board[0]?.atk).toBe(1);
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
    expect(nineDamage.players[0].board[0]?.hp).toBe(5);

    const kill = mainState("doom-kill-heal");
    kill.players[0].board[0] = minion("Doom Slayer", 0, { sleeping: false, hp: 2, maxHp: 6 });
    kill.players[1].board[0] = minion("John Wick", 1, { alignment: "Evil", atk: 1, hp: 8, maxHp: 8 });
    const healed = applyAction(kill, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(healed.players[1].board[0]).toBeNull();
    expect(healed.players[0].board[0]).toMatchObject({ hp: 4, maxHp: 6 });
  });

  it("Flash can attack exactly 2 times for 10 total core damage", () => {
    let state = mainState("flash-two-attacks");
    state.players[0].board[0] = minion("Flash", 0, { sleeping: false });

    for (let attack = 0; attack < 2; attack += 1) {
      expect(getLegalActions(state, library)).toContainEqual({ type: "attack_core", player: 0, attackerSlot: 0 });
      state = applyAction(state, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    }

    expect(state.players[1].health).toBe(66);
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
    expect(afterDeath.players[0].board[0]?.art).toBe("/card-art/raw/token-drakath.png");
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

  it("The Driller consumes an enemy Tech minion at 5 HP", () => {
    const state = mainState("driller-tech-consume");
    state.players[1].board[0] = minion("John Wick", 1, { camp: "Tech", atk: 3, hp: 5, maxHp: 5 });

    const asking = play(state, 0, "The Driller", 0);
    const after = asking.pendingTarget ? choose(asking, 0) : asking;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[0].board[0]).toMatchObject({ atk: 4, hp: 6, maxHp: 6 });
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

  it("Nezu draws exactly 1 extra card on its ongoing turn", () => {
    const state = mainState("nezu-draw-one");
    state.players[0].board[0] = minion("Nezu", 0);
    state.players[0].hand = [];
    state.players[1].hand = [];
    state.deck = [cardId("Thanos"), cardId("John Wick"), cardId("Zoro")];

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].hand).toEqual([cardId("John Wick"), cardId("Zoro")]);
    expect(after.deck).toEqual([]);
  });

  it("Shibukawa sets its ATK exactly to the highest enemy ATK", () => {
    const state = mainState("shibukawa-highest-enemy");
    state.players[0].board[0] = minion("Shibukawa", 0);
    state.players[1].board[0] = minion("John Wick", 1, { atk: 7, hp: 10, maxHp: 10 });
    state.players[1].board[1] = minion("Zoro", 1, { atk: 3, hp: 10, maxHp: 10 });

    const after = endTurn(endTurn(state, 0), 1);
    expect(after.players[0].board[0]?.atk).toBe(7);
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

  it("Whitebeard deals exactly 3 damage to every other minion", () => {
    const state = mainState("whitebeard-aoe");
    state.players[0].board[0] = minion("John Wick", 0, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    state.players[1].board[0] = minion("Zoro", 1, { hp: 9, maxHp: 9, effectId: "none", effectTiming: "none", keywords: [] });
    const after = play(state, 0, "Whitebeard", 2);
    expect(after.players[0].board[0]?.hp).toBe(6);
    expect(after.players[1].board[0]?.hp).toBe(6);
    expect(after.players[0].board[2]?.hp).toBe(4);
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
    expect(after.players[0].board[0]?.cost).toBe(5);
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
});
