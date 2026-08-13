import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import type { GameState, MinionInstance, PlayerId } from "./types";
import { spawnTestMinion } from "./test-utils";

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
/**
 * Plays a card from hand into a slot, ignoring mana — how a Battlecry fires.
 * (Most effects moved from Ongoing to Battlecry, so cycling turns no longer
 * triggers them.)
 */
function playCardFor(state: GameState, player: PlayerId, name: string, slotIndex = 0): GameState {
  const next: GameState = { ...state, cheatMode: true, activePlayer: player, phase: "main", drawChoice: null };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [cardId(name)] };
  return applyAction(next, { type: "play_card", player, handIndex: 0, slotIndex }, library).state;
}

function mainState(): GameState {
  const state = createInitialGame(cards, "effects", relics);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function attack(state: GameState, attackerSlot: number, targetSlot: number) {
  return applyAction(state, { type: "attack_minion", player: 0, attackerSlot, targetSlot }, library).state;
}

describe("full-roster effects", () => {
  it("Rennala (heal_all_friendly_full): restores every friendly minion on arrival", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 1, maxHp: 6 });
    state.players[0].board[1] = makeMinion("Zoro", 0, { atk: 5, hp: 2, maxHp: 5 });
    state.players[1].board[0] = makeMinion("John Wick", 1, { hp: 1, maxHp: 6 });

    const afterPlay = playCardFor(state, 0, "Rennala Queen of the Full Moon", 2);
    expect(afterPlay.players[0].board[0]).toMatchObject({ hp: 6, maxHp: 6 });
    expect(afterPlay.players[0].board[1]).toMatchObject({ hp: 5, maxHp: 5 });
    expect(afterPlay.players[0].board[2]).toMatchObject({ name: "Rennala Queen of the Full Moon", hp: 4, maxHp: 4 });
    expect(afterPlay.players[1].board[0]).toMatchObject({ hp: 1, maxHp: 6 });
  });

  it("Hypnos (chain_attacker): makes an attacker skip its next turn", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Hypnos", 1);

    const afterAttack = attack(state, 0, 0);
    expect(afterAttack.players[0].board[0]?.chained).toBe(2);

    const nextOwnerTurn = toMyNextTurn(afterAttack);
    expect(nextOwnerTurn.players[0].board[0]?.chained).toBe(1);
    expect(getLegalActions(nextOwnerTurn, library)).not.toContainEqual({
      type: "attack_minion",
      player: 0,
      attackerSlot: 0,
      targetSlot: 0,
    });
  });

  it("Dio Brando (freeze_all_enemies): freezes every enemy but not friendly minions", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[1].board[0] = makeMinion("John Wick", 1);
    state.players[1].board[1] = makeMinion("John Wick", 1);

    const after = playCardFor(state, 0, "Dio Brando", 2);

    expect(after.players[0].board[0]?.frozen).toBe(false);
    expect(after.players[1].board[0]?.frozen).toBe(true);
    expect(after.players[1].board[1]?.frozen).toBe(true);
  });

  it("Gol D. Roger offers three relics and adds the chosen one to hand", () => {
    const state = mainState();
    const offered = state.deck.filter((cardId) => relics.some((relic) => relic.id === cardId)).slice(0, 3);

    const firstPrompt = playCardFor(state, 0, "Gol D. Roger", 2);
    expect(firstPrompt.pendingTarget?.kind).toBe("option");
    expect(firstPrompt.pendingTarget?.labelOptions.map((option) => option.value)).toEqual(offered);

    const after = applyAction(firstPrompt, { type: "choose_target", player: 0, choiceIndex: 1 }, library).state;
    expect(after.players[0].hand).toContain(offered[1]);
    expect(after.players[0].board[2]?.relic).toBeNull();
    expect(after.deck).not.toContain(offered[1]);
  });

  it("Transformers consumes friendly Tech minions and gains their stats and effects", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, {
      camp: "Tech",
      atk: 2,
      hp: 3,
      maxHp: 3,
      keywords: ["Taunt", "Divine Shield"],
      divineShield: true,
      effectId: "robocop_evil_bonus",
      effectTiming: "passive",
      effect: "Passive: Deal 3x damage against evil minions",
    });

    const after = playCardFor(state, 0, "Transformers", 2);
    const transformers = after.players[0].board[2];
    expect(after.players[0].board[0]).toBeNull();
    expect(transformers?.atk).toBe(4);
    expect(transformers?.hp).toBe(8);
    expect(transformers?.keywords).toEqual(expect.arrayContaining(["Taunt", "Divine Shield"]));
    expect(transformers?.divineShield).toBe(true);
    expect(transformers?.gainedEffects).toEqual([
      expect.objectContaining({ effectId: "robocop_evil_bonus", timing: "passive" }),
    ]);
  });

  it("Korosensei: ignores weak attacks and evades 20% of stronger attacks", () => {
    const printedHp = cards.find((card) => card.name === "Korosensei")!.hp;
    const weak = mainState();
    weak.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    weak.players[1].board[0] = makeMinion("Korosensei", 1, { hp: printedHp + 2, maxHp: printedHp + 2 });
    const afterWeak = attack(weak, 0, 0);
    expect(afterWeak.players[1].board[0]?.hp).toBe(printedHp + 2); // undamaged

    const strong = mainState();
    strong.rngSeed = 12345;
    strong.players[0].board[0] = makeMinion("John Wick", 0, { atk: 4, hp: 20, maxHp: 20 });
    strong.players[1].board[0] = makeMinion("Korosensei", 1, { hp: printedHp + 2, maxHp: printedHp + 2 });
    const afterStrong = attack(strong, 0, 0);
    expect(afterStrong.players[1].board[0]?.hp).toBe(printedHp - 2);
  });

  it("Gordon Freeman gains +2/+2 whenever he survives damage", () => {
    const alone = mainState();
    alone.players[0].board[0] = makeMinion("John Wick", 0, { atk: 1, hp: 20, maxHp: 20 });
    alone.players[1].board[0] = makeMinion("Gordon Freeman", 1);
    const after = attack(alone, 0, 0).players[1].board[0]!;
    expect(after.hp).toBe(4); // 3 - 1 + 2
    expect(after.maxHp).toBe(5);
  });

  it("Sans (dodge_75): evades an incoming attack", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Sans", 1);
    // This deterministic lower-bound RNG value takes the 75% evasion branch
    // without making the test probabilistic. The defender still retaliates.
    state.rngSeed = 1;
    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.hp).toBe(1);
  });

  it("Zoro (on_kill_buff_1): grows +1/+1 after a kill", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Zoro", 0, { atk: 5 });
    state.players[1].board[0] = makeMinion("John Wick", 1);
    const zoro = attack(state, 0, 0).players[0].board[0];
    expect(zoro?.atk).toBe(6);
    expect(zoro?.maxHp).toBe(4);
  });

  it("RoboCop (robocop_evil_bonus): triples damage into Evil", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("RoboCop", 0, { atk: 2, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Wall of Flesh", 1); // 3/5 Evil
    expect(attack(state, 0, 0).players[1].board[0]).toBeNull(); // 2 * 3 = 6 > 5
  });

  it("Kaku Kaioh (damage_3x_nature): triples damage into Nature", () => {
    // This card printed "4x" while the code did 2x, and nothing caught it for
    // the whole balance history because no test read the multiplier at all.
    // Both halves are asserted here: the kill proves it is at least 3x, and the
    // survivor proves it is not 4x.
    const state = mainState();
    state.players[0].board[0] = makeMinion("Kaku Kaioh", 0, { atk: 2, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Dragon", 1); // 3/5 Nature
    expect(attack(state, 0, 0).players[1].board[0]).toBeNull(); // 2 * 3 = 6 > 5

    const nearMiss = mainState();
    nearMiss.players[0].board[0] = makeMinion("Kaku Kaioh", 0, { atk: 2, hp: 20, maxHp: 20 });
    nearMiss.players[1].board[0] = makeMinion("Dragon", 1, { hp: 7, maxHp: 7 });
    expect(attack(nearMiss, 0, 0).players[1].board[0]?.hp).toBe(1); // 7 - 6, not 7 - 8
  });

  it("Kaku Kaioh (damage_3x_nature): deals normal damage into other camps", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Kaku Kaioh", 0, { atk: 2, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Cthulhu", 1); // 3/4 Magic
    expect(attack(state, 0, 0).players[1].board[0]?.hp).toBe(2); // 4 - 2, no multiplier
  });

  it("Nulgath (nulgath_any_death_2_2): grows whenever a minion dies", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Nulgath", 0);
    state.players[0].board[1] = makeMinion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("John Wick", 1);
    // Read the growth off the state, never off a literal. This test asserted
    // `atk === 3` and broke the moment pass 5 changed the buff, which reads
    // exactly like a real regression and is not one — the rule under test is
    // "one death makes it grow", not the size of one particular pass's number.
    const before = state.players[0].board[0]!;
    const after = attack(state, 1, 0); // slot-1 attacker kills the enemy
    const grown = after.players[0].board[0]!;
    expect(grown.atk).toBeGreaterThan(before.atk);
    expect(grown.maxHp).toBeGreaterThan(before.maxHp);
  });

  it("Nulgath and Gravelord Nito are no longer the same card", () => {
    // These two ran the identical rule under two different effect ids for the
    // whole balance history, which made them one card charged at 6 mana and at
    // 2. The separation is the point of the difference in magnitude, so assert
    // that they DIVERGE rather than asserting either number — a future pass may
    // move both, and only "they are not equal" must survive it.
    const growthOf = (name: string) => {
      const state = mainState();
      state.players[0].board[0] = makeMinion(name, 0);
      state.players[0].board[1] = makeMinion("John Wick", 0, { atk: 5, hp: 20, maxHp: 20 });
      state.players[1].board[0] = makeMinion("John Wick", 1);
      const before = state.players[0].board[0]!;
      const after = attack(state, 1, 0).players[0].board[0]!;
      return { atk: after.atk - before.atk, hp: after.maxHp - before.maxHp };
    };

    const nulgath = growthOf("Nulgath");
    const nito = growthOf("Gravelord Nito");
    expect(nulgath.atk).toBeGreaterThan(nito.atk);
    expect(nulgath.hp).toBeGreaterThan(nito.hp);
  });

  it("Fire Lord Ozai (aoe_all_2): deals 2 to every other minion, not 3", () => {
    // Ozai and Whitebeard shared one effect id, so Ozai was Whitebeard's sweep
    // three mana cheaper. The number is what separates them now, which makes it
    // worth pinning exactly rather than as "some damage".
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { hp: 9, maxHp: 9 });
    state.players[1].board[0] = makeMinion("John Wick", 1, { hp: 9, maxHp: 9 });

    const after = playCardFor(state, 0, "Fire Lord Ozai", 2);
    expect(after.players[0].board[0]?.hp).toBe(7);
    expect(after.players[1].board[0]?.hp).toBe(7);
    expect(after.players[0].board[2]?.name).toBe("Fire Lord Ozai"); // spares itself
  });

  it("Domovoy (draw_relic): puts an Ascension Relic in hand with no prompt", () => {
    const state = mainState();
    const relicIds = new Set(relics.map((relic) => relic.id));

    const after = playCardFor(state, 0, "Domovoy", 2);
    expect(after.pendingTarget).toBeFalsy(); // random, never a choice
    const drawn = after.players[0].hand.filter((cardId) => relicIds.has(cardId));
    expect(drawn).toHaveLength(1);
    expect(after.deck).not.toContain(drawn[0]);
  });

  it("Homelander is Invulnerable while he is your only minion", () => {
    const printed = cards.find((card) => card.name === "Homelander")!;
    const alone = mainState();
    alone.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    alone.players[1].board[0] = makeMinion("Homelander", 1);
    const blocked = attack(alone, 0, 0);
    expect(blocked.players[1].board[0]?.hp).toBe(printed.hp);

    const crowded = mainState();
    crowded.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    crowded.players[1].board[0] = makeMinion("Homelander", 1);
    crowded.players[1].board[1] = makeMinion("John Wick", 1);
    const exposed = attack(crowded, 0, 0);
    expect(exposed.players[1].board[0]?.hp).toBe(printed.hp - 3);
  });

  // --- ongoing effects fire at the start of the owner's turn ---
  function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
    let next = applyAction(state, { type: "end_turn", player }, library).state;
    if (next.phase === "drawChoice" && next.drawChoice) {
      next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
    }
    return next;
  }
  const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

  it("Chained minions wait through two owner turns before acting", () => {
    const state = mainState();
    const afterPlay = playCardFor(state, 0, "One-Eyed Owl", 0);
    expect(afterPlay.players[0].board[0]?.chained).toBe(2);

    const afterFirstTurn = toMyNextTurn(afterPlay);
    expect(afterFirstTurn.players[0].board[0]?.chained).toBe(1);

    const afterSecondTurn = toMyNextTurn(afterFirstTurn);
    expect(afterSecondTurn.players[0].board[0]?.chained).toBe(0);
    expect(
      getLegalActions(afterSecondTurn, library).some(
        (action) => action.type === "attack_core" && action.attackerSlot === 0,
      ),
    ).toBe(true);
  });

  it("ongoing buff (Flowey buff_all_evil_1) rallies Evil allies", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Flowey", 0);
    state.players[0].board[1] = makeMinion("Wall of Flesh", 0); // 3/5 Evil
    expect(toMyNextTurn(state).players[0].board[1]?.atk).toBe(4);
  });

  it("Kizaru starts with Divine Shield and restores it on his owner's turn", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Kizaru", 0, { divineShield: false });
    expect(state.players[0].board[0]?.keywords).toContain("Divine Shield");
    expect(toMyNextTurn(state).players[0].board[0]?.divineShield).toBe(true);
  });

  it("Light Yagami (kill_random_enemy): kills an enemy at the start of its owner's turn", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Light Yagami", 0);
    state.players[1].board[0] = makeMinion("Avatar Aang", 1, { divineShield: true });
    const after = toMyNextTurn(state);
    expect(after.players[1].board[0]).toBeNull();
  });

  it("Mob Psycho ascends after returning three friendly minions", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[0].board[1] = makeMinion("Joker", 0);
    state.players[0].board[2] = makeMinion("Zoro", 0);
    const after = playCardFor(state, 0, "Mob Psycho", 3);
    expect(after.players[0].board[3]?.atk).toBe(12);
    expect(after.players[0].board[3]?.maxHp).toBe(12);
    expect(after.players[0].hand).toEqual(expect.arrayContaining([cardId("John Wick"), cardId("Joker"), cardId("Zoro")]));
  });

  it("Battlecry silence (Aizawa silence_enemy) disables an enemy on arrival", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Death Star", 1);
    expect(playCardFor(state, 0, "Aizawa", 0).players[1].board[0]?.silenced).toBe(true);
  });

});
