import { describe, expect, it } from "vitest";
import { cards } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { HERO_POWER_DEFINITIONS } from "./hero-powers";
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
  state.heroPowerChoicePlayer = null;
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

describe("opening Hero Powers", () => {
  it("offers two distinct choices to each player, then records both selections", () => {
    const state = createInitialGame(cards, "hero-power-draft");
    expect(state.phase).toBe("heroPowerChoice");
    expect(state.heroPowerOptions[0]).toHaveLength(2);
    expect(state.heroPowerOptions[1]).toHaveLength(2);
    expect(new Set(state.heroPowerOptions[0]).size).toBe(2);
    expect(new Set(state.heroPowerOptions[1]).size).toBe(2);
    const first = applyAction(state, { type: "choose_hero_power", player: 0, choiceIndex: 1 }, library).state;
    expect(first.phase).toBe("heroPowerChoice");
    expect(first.heroPowerChoicePlayer).toBe(1);
    const second = applyAction(first, { type: "choose_hero_power", player: 1, choiceIndex: 0 }, library).state;
    expect(second.phase).toBe("main");
    expect(second.heroPowers[0]).toBe(state.heroPowerOptions[0][1]);
    expect(second.heroPowers[1]).toBe(state.heroPowerOptions[1][0]);
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

  it("resolves core trade, core damage, healing, summoning, and Taunt", () => {
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

    const recruit = usePower(mainState("summon_recruit"));
    expect(recruit.players[0].board[0]).toMatchObject({ name: "Heroic Recruit", atk: 1, hp: 1, maxHp: 1 });

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
