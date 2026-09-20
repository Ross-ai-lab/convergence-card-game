import { describe, expect, it } from "vitest";
import { cards } from "../data/cards";
import { applyAction, createInitialGame, effectiveCardCost, getLegalActions, makeCardLibrary } from "./game";
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

  it("exposes player powers and the distinct campaign boss powers", () => {
    expect(HERO_POWER_DEFINITIONS).toHaveLength(30);
    for (const power of HERO_POWER_DEFINITIONS) {
      expect(power.text.length).toBeGreaterThan(8);
    }
    expect(HERO_POWER_DEFINITIONS.find((power) => power.id === "glados_test_protocol")).toMatchObject({ cost: 0, passive: true });
    expect(HERO_POWER_DEFINITIONS.find((power) => power.id === "light_delayed_mark")).toMatchObject({ cost: 3 });
    expect(HERO_POWER_DEFINITIONS.find((power) => power.id === "thanos_destroy")).toMatchObject({ cost: 5 });
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

  it("resolves the targeted campaign powers without changing their printed base stats", () => {
    const mark = mainState("light_delayed_mark");
    mark.players[1].board[0] = minion("Modern Tank", 1);
    const marked = usePower(mark).players[1].board[0]!;
    expect(marked.markedBy).toBe("hero-power:light_delayed_mark");
    expect(marked.markedForDeathAtTurn).toBe(mark.turnNumber + 2);

    const theft = mainState("all_for_one_copy");
    theft.players[1].board[0] = minion("John Wick", 1);
    const copied = usePower(theft);
    expect(copied.players[0].hand).toContain(card("John Wick").id);

    const chaos = mainState("bill_chaos");
    chaos.players[0].board[0] = minion("Modern Tank", 0, { atk: 3, hp: 5, maxHp: 5 });
    const chaotic = usePower(chaos).players[0].board[0]!;
    expect(chaotic).toMatchObject({ atk: 5, hp: 3, maxHp: 5 });
  });

  it("applies the passive and non-targeted campaign powers", () => {
    const gojo = usePower(mainState("gojo_core_shield"));
    expect(gojo.players[0].heroDivineShield).toBe(true);

    const thanos = mainState("thanos_destroy");
    thanos.players[1].board[0] = minion("John Wick", 1);
    expect(usePower(thanos).players[1].board[0]).toBeNull();

    const goku = mainState("goku_start_mana");
    goku.players[0].turnsStarted = 0;
    const afterEnemy = applyAction(goku, { type: "end_turn", player: 0 }, library).state;
    const afterGoku = applyAction(afterEnemy, { type: "end_turn", player: 1 }, library).state;
    expect(afterGoku.players[0].mana).toBe(2);
    const afterNextEnemy = applyAction(afterGoku, { type: "end_turn", player: 0 }, library).state;
    const afterSecondGoku = applyAction(afterNextEnemy, { type: "end_turn", player: 1 }, library).state;
    expect(afterSecondGoku.players[0].mana).toBe(3);
    const gokuOpening = createInitialGame(cards, "goku-opening", [], { heroPowers: [null, "goku_start_mana"] });
    expect(gokuOpening.players[1]).toMatchObject({ mana: 2, maxMana: 2 });

    const ainz = createInitialGame(cards, "ainz-power", [], { heroPowers: [null, "ainz_skeleton"] });
    ainz.phase = "main"; ainz.mulligan = null; ainz.activePlayer = 0;
    const afterAinzStart = applyAction(ainz, { type: "end_turn", player: 0 }, library).state;
    const afterAinzFirst = applyAction(afterAinzStart, { type: "end_turn", player: 1 }, library).state;
    const afterAinzSecond = applyAction(afterAinzFirst, { type: "end_turn", player: 0 }, library).state;
    expect(afterAinzSecond.players[1].board.some((entry) => entry?.name === "Skeleton")).toBe(true);

    const glados = createInitialGame(cards, "glados-power", [], { heroPowers: [null, "glados_test_protocol"] });
    glados.phase = "main"; glados.mulligan = null; glados.activePlayer = 1;
    glados.players[0].turnsStarted = 14; glados.players[0].health = 10;
    const finalTurn = applyAction(glados, { type: "end_turn", player: 1 }, library).state;
    expect(finalTurn.players[0].turnsStarted).toBe(15);
    expect(finalTurn.players[0].health).toBe(10);
    const beforeDeadline = applyAction(finalTurn, { type: "end_turn", player: 0 }, library).state;
    const afterDeadline = applyAction(beforeDeadline, { type: "end_turn", player: 1 }, library).state;
    expect(afterDeadline.players[0].health).toBe(0);

    const voldemort = mainState("enemy_core_damage");
    voldemort.heroPowers = ["enemy_core_damage", "voldemort_immortal"];
    voldemort.players[1].health = 1;
    voldemort.players[1].board[0] = minion("John Wick", 1);
    const protectedCore = usePower(voldemort);
    expect(protectedCore.players[1].health).toBe(1);
    expect(protectedCore.winner).toBeNull();
  });

  it("limits Yujiro's Core attacks to the highest-ATK enemy minion", () => {
    const state = createInitialGame(cards, "yujiro-power", [], { heroPowers: [null, "yujiro_apex_duel"] });
    state.phase = "main"; state.mulligan = null; state.activePlayer = 0;
    state.players[0].board[0] = minion("John Wick", 0, { atk: 1 });
    state.players[0].board[1] = minion("Modern Tank", 0, { atk: 2 });
    const attacks = getLegalActions(state, library).filter((action) => action.type === "attack_core");
    expect(attacks).toEqual([{ type: "attack_core", player: 0, attackerSlot: 1 }]);
  });

  it("resolves the remaining campaign powers and the global Saitama guard", () => {
    const vader = mainState("vader_minion_tax");
    const taxed = usePower(vader);
    expect(taxed.players[1].minionCostPenaltyNextTurn).toBe(1);
    taxed.activePlayer = 1;
    taxed.turnNumber += 1;
    taxed.players[1].minionCostPenaltyThisTurn = taxed.players[1].minionCostPenaltyNextTurn;
    taxed.players[1].minionCostPenaltyNextTurn = 0;
    expect(effectiveCardCost(taxed, 1, card("John Wick"))).toBe(card("John Wick").cost! + 1);

    const dio = mainState("dio_freeze");
    dio.players[1].board[0] = minion("John Wick", 1);
    expect(usePower(dio).players[1].board[0]?.frozen).toBe(true);

    const meruem = mainState("meruem_discover");
    meruem.deck = [card("John Wick").id];
    expect(usePower(meruem).players[0].hand).toContain(card("John Wick").id);

    const luffy = mainState("luffy_set_one");
    luffy.players[1].board[0] = minion("Modern Tank", 1, { atk: 4, hp: 5, maxHp: 5 });
    expect(usePower(luffy).players[1].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });

    const elden = mainState("elden_revival");
    elden.players[0].deadMinions = [card("John Wick").id];
    elden.players[0].deadMinionOwners = [0];
    elden.discard = [card("John Wick").id];
    expect(usePower(elden).players[0].board[0]).toMatchObject({ name: "John Wick", atk: 1, hp: 1 });

    const saitama = createInitialGame(cards, "saitama-power", [], { heroPowers: [null, "saitama_small_guard"] });
    saitama.phase = "main"; saitama.mulligan = null; saitama.activePlayer = 0;
    saitama.players[0].board[0] = minion("John Wick", 0, { atk: 1, sleeping: false });
    const blocked = applyAction(saitama, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    expect(blocked.players[1].health).toBe(50);
    blocked.players[0].board[0]!.atk = 4;
    blocked.players[0].board[0]!.attacksUsed = 0;
    const landed = applyAction(blocked, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    expect(landed.players[1].health).toBe(46);
  });

  it("gives Po a restricted Skadoosh target and protects Conquest's board", () => {
    const po = mainState("po_skadoosh");
    po.players[1].board[0] = minion("Joker", 1, { hp: 3, maxHp: 3 });
    const skadoosh = usePower(po);
    expect(skadoosh.players[1].board[0]).toBeNull();

    const conquest = mainState("dio_freeze");
    conquest.heroPowers = ["dio_freeze", "conquest_no_retreat"];
    conquest.players[1].board[0] = minion("John Wick", 1);
    expect(usePower(conquest).players[1].board[0]?.frozen).toBe(false);
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
    almostFull.players[0].health = 49;
    expect(usePower(almostFull).players[0].health).toBe(50);

    const full = mainState("core_heal");
    expect(usePower(full).players[0].health).toBe(50);

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
    expect(chained.players[0].board[0]).toMatchObject({ chained: 3, chainGrowthPending: true, atk: 2, hp: 2 });
    expect(getLegalActions(chained, library)).not.toContainEqual({ type: "use_hero_power", player: 0 });

    // Two of the player's own turns pass with the minion still chained — that is
    // what the keyword costs — and the reward lands as it breaks free on the
    // third. The pair moved together: +1/+1 was too little for two lost turns.
    const ownTurn = (from: GameState): GameState => {
      const enemyTurn = applyAction(from, { type: "end_turn", player: 0 }, library).state;
      return applyAction(enemyTurn, { type: "end_turn", player: 1 }, library).state;
    };
    const first = ownTurn(chained);
    expect(first.players[0].board[0]).toMatchObject({ chained: 2, chainGrowthPending: true, atk: 2, hp: 2 });
    const second = ownTurn(first);
    expect(second.players[0].board[0]).toMatchObject({ chained: 1, chainGrowthPending: true, atk: 2, hp: 2 });
    const released = ownTurn(second);
    expect(released.players[0].board[0]).toMatchObject({ chained: 0, chainGrowthPending: false, atk: 4, hp: 4, maxHp: 4 });
  });
});
