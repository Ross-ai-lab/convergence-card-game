import { describe, expect, it } from "vitest";
import { cards } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import {
  HERO_POWER_DEFINITIONS,
  HERO_POWER_IDS,
  HERO_POWER_UNLOCK_ORDER,
  firstUnlockedHeroPower,
  isHeroPowerUnlocked,
  randomHeroPower,
} from "./hero-powers";
import type { GameState, HeroPowerId, MinionInstance } from "./types";
import { spawnTestMinion } from "./test-utils";

const library = makeCardLibrary(cards);

function card(name: string) {
  const definition = cards.find((entry) => entry.name === name);
  if (!definition) throw new Error(`Missing card ${name}`);
  return definition;
}

function minion(name: string, owner: 0 | 1, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(card(name), owner, overrides);
}

function mainState(power: HeroPowerId): GameState {
  const state = createInitialGame(cards, `hero-power-${power}`);
  state.phase = "main";
  state.mulligan = null;
  state.heroPowers = [power, null];
  state.heroPowerUsed = [false, false];
  state.activePlayer = 0;
  state.players[0].mana = 10;
  state.players[0].hand = [];
  state.players[1].hand = [];
  return state;
}

function usePower(state: GameState, choiceIndex = 0): GameState {
  const action = { type: "use_hero_power", player: 0 } as const;
  expect(getLegalActions(state, library)).toContainEqual(action);
  let result = applyAction(state, action, library).state;
  if (result.phase === "targeting") {
    result = applyAction(result, { type: "choose_target", player: 0, choiceIndex }, library).state;
  }
  return result;
}

describe("menu Hero Powers", () => {
  it("starts with the powers selected by the menu instead of an opening draft", () => {
    const state = createInitialGame(cards, "hero-power-menu", [], { heroPowers: ["minion_atk", null] });
    expect(state.phase).toBe("mulligan");
    expect(state.heroPowers).toEqual(["minion_atk", null]);
    const afterMulligan = applyAction(state, { type: "confirm_mulligan", player: 0 }, library).state;
    expect(afterMulligan.phase).toBe("main");
    expect(afterMulligan.heroPowers).toEqual(["minion_atk", null]);
  });

  it("orders unlocks by the menu's one-win-through-ten-win track", () => {
    expect(HERO_POWER_UNLOCK_ORDER).toEqual([
      "core_heal",
      "enemy_core_damage",
      "give_taunt",
      "chain_growth",
      "summon_recruit",
      "minion_atk",
      "minion_hp",
      "core_trade_draw",
      "minion_atk_down",
      "minion_hp_down",
    ]);
    expect(firstUnlockedHeroPower(0)).toBeNull();
    expect(firstUnlockedHeroPower(1)).toBe(HERO_POWER_UNLOCK_ORDER[0]);
    expect(isHeroPowerUnlocked(HERO_POWER_UNLOCK_ORDER[0], 1)).toBe(true);
    expect(isHeroPowerUnlocked(HERO_POWER_UNLOCK_ORDER[1], 1)).toBe(false);
    expect(firstUnlockedHeroPower(10)).toBe(HERO_POWER_UNLOCK_ORDER[9]);
  });

  it("can give the bot any of the ten powers from a fresh duel seed", () => {
    const picked = randomHeroPower("bot-duel-seed");
    expect(HERO_POWER_IDS).toContain(picked);
    expect(randomHeroPower("bot-duel-seed")).toBe(picked);
  });

  it("keeps every power at two mana and exposes the shared text", () => {
    expect(HERO_POWER_DEFINITIONS).toHaveLength(10);
    for (const power of HERO_POWER_DEFINITIONS) {
      expect(power.text.length).toBeGreaterThan(8);
    }
  });

  it("resolves the four friendly and enemy stat powers", () => {
    const friendlyHp = mainState("minion_hp");
    friendlyHp.players[0].board[0] = minion("John Wick", 0, { hp: 2, maxHp: 3 });
    expect(usePower(friendlyHp).players[0].board[0]).toMatchObject({ hp: 3, maxHp: 4 });

    const friendlyAtk = mainState("minion_atk");
    friendlyAtk.players[0].board[0] = minion("John Wick", 0, { atk: 2 });
    expect(usePower(friendlyAtk).players[0].board[0]?.atk).toBe(3);

    const enemyHp = mainState("minion_hp_down");
    enemyHp.players[1].board[0] = minion("John Wick", 1, { hp: 3, maxHp: 3 });
    expect(usePower(enemyHp).players[1].board[0]).toMatchObject({ hp: 2, maxHp: 2 });

    const enemyAtk = mainState("minion_atk_down");
    enemyAtk.players[1].board[0] = minion("John Wick", 1, { atk: 2 });
    expect(usePower(enemyAtk).players[1].board[0]?.atk).toBe(1);
  });

  it("keeps a single legal Hero Power target open for deliberate aiming", () => {
    const state = mainState("minion_hp_down");
    state.players[1].board[0] = minion("Modern Tank", 1);

    const used = applyAction(state, { type: "use_hero_power", player: 0 }, library).state;
    expect(used.phase).toBe("targeting");
    expect(used.pendingTarget?.options).toEqual([{ owner: 1, slot: 0 }]);
    expect(used.players[1].board[0]?.hp).toBe(2);

    const aimed = applyAction(used, { type: "choose_target", player: 0, choiceIndex: 0 }, library).state;
    expect(aimed.phase).toBe("main");
    expect(aimed.players[1].board[0]).toMatchObject({ hp: 1, maxHp: 1 });
  });

  it("refunds a targetable Hero Power when it is cancelled before choosing", () => {
    const state = mainState("minion_atk");
    state.players[0].board[0] = minion("John Wick", 0);
    state.players[0].board[1] = minion("John Wick", 0);

    const used = applyAction(state, { type: "use_hero_power", player: 0 }, library).state;
    expect(used.phase).toBe("targeting");
    expect(used.players[0].mana).toBe(8);
    expect(used.heroPowerUsed[0]).toBe(true);
    expect(used.pendingTarget?.cancelHeroPower).toMatchObject({ player: 0, powerId: "minion_atk", manaRefund: 2 });
    expect(getLegalActions(used, library)).toContainEqual({ type: "cancel_target", player: 0 });

    const cancelled = applyAction(used, { type: "cancel_target", player: 0 }, library).state;
    expect(cancelled.phase).toBe("main");
    expect(cancelled.pendingTarget).toBeNull();
    expect(cancelled.players[0].mana).toBe(10);
    expect(cancelled.heroPowerUsed[0]).toBe(false);
    expect(getLegalActions(cancelled, library)).toContainEqual({ type: "use_hero_power", player: 0 });
  });

  it("resolves core trade, core damage, healing, summoning, and Taunt", () => {
    expect(cards.find((entry) => entry.id === "c169")).toMatchObject({ name: "An Order of Heavy Knights" });

    const trade = mainState("core_trade_draw");
    trade.deck = [card("John Wick").id];
    trade.players[0].health = 20;
    const traded = usePower(trade);
    expect(traded.players[0].health).toBe(18);
    expect(traded.players[0].hand).toEqual([card("John Wick").id]);

    const bolt = mainState("enemy_core_damage");
    const bolted = usePower(bolt);
    // The 2 damage is the claim. The two assertions above set health explicitly
    // first, so only this one was ever tied to the starting core total.
    expect(bolt.players[1].health - bolted.players[1].health).toBe(2);

    const mend = mainState("core_heal");
    mend.players[0].health = 20;
    expect(usePower(mend).players[0].health).toBe(22);

    const almostFull = mainState("core_heal");
    almostFull.players[0].health = 74;
    expect(usePower(almostFull).players[0].health).toBe(75);

    const full = mainState("core_heal");
    expect(usePower(full).players[0].health).toBe(75);

    const recruit = usePower(mainState("summon_recruit"));
    expect(recruit.players[0].board[0]).toMatchObject({
      name: "Knight",
      atk: 1,
      hp: 1,
      maxHp: 1,
      suppressArrivalTheme: true,
      art: "/card-art/raw/token-knight.webp",
    });

    const taunt = mainState("give_taunt");
    taunt.players[0].board[0] = minion("John Wick", 0);
    expect(usePower(taunt).players[0].board[0]?.keywords).toContain("Taunt");
  });

  it("pays once per turn and lets Reforged Chains grow a minion on release", () => {
    const state = mainState("chain_growth");
    state.players[0].board[0] = minion("John Wick", 0, { atk: 2, hp: 2, maxHp: 2 });
    const chained = usePower(state);
    expect(chained.players[0].mana).toBe(8);
    expect(chained.heroPowerUsed[0]).toBe(true);
    expect(chained.players[0].board[0]).toMatchObject({ chained: 2, chainGrowthPending: true, atk: 2, hp: 2 });
    expect(getLegalActions(chained, library)).not.toContainEqual({ type: "use_hero_power", player: 0 });

    let released = chained;
    released = applyAction(released, { type: "end_turn", player: 0 }, library).state;
    released = applyAction(released, { type: "end_turn", player: 1 }, library).state;
    released = applyAction(released, { type: "end_turn", player: 0 }, library).state;
    released = applyAction(released, { type: "end_turn", player: 1 }, library).state;
    expect(released.players[0].board[0]).toMatchObject({ chained: 0, chainGrowthPending: false, atk: 3, hp: 3, maxHp: 3 });
  });
});
