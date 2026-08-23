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
  it("Rennala (rebirth_friendly_dead): randomly summons a friendly minion that died this game", () => {
    const state = mainState();
    const zoroId = cardId("Zoro");
    const johnWickId = cardId("John Wick");
    state.players[0].deadMinions = [zoroId, johnWickId];
    state.discard.push(zoroId, johnWickId);
    const afterPlay = playCardFor(state, 0, "Rennala Queen of the Full Moon", 2);
    expect(afterPlay.pendingTarget).toBeNull();
    const reborn = afterPlay.players[0].board[0];
    expect(["Zoro", "John Wick"]).toContain(reborn?.name);
    expect(afterPlay.players[0].deadMinions).toHaveLength(1);
    expect(afterPlay.discard).not.toContain(reborn?.cardId);
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

  it("Gordon Freeman has no effect when he survives damage", () => {
    const alone = mainState();
    alone.players[0].board[0] = makeMinion("John Wick", 0, { atk: 1, hp: 20, maxHp: 20 });
    alone.players[1].board[0] = makeMinion("Gordon Freeman", 1);
    const after = attack(alone, 0, 0).players[1].board[0]!;
    expect(after.hp).toBe(2); // 3 - 1
    expect(after.maxHp).toBe(3);
  });

  it("Sans (dodge_80): evades an incoming attack", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Sans", 1);
    // This deterministic lower-bound RNG value takes the 80% evasion branch
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
    expect(zoro?.maxHp).toBe(5);
  });

  it("RoboCop (robocop_evil_bonus): triples damage into Evil", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("RoboCop", 0, { atk: 2, hp: 20, maxHp: 20 });
    state.players[1].board[0] = makeMinion("Wall of Flesh", 1); // 3/5 Evil
    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    expect(result.state.players[1].board[0]).toBeNull(); // 2 * 3 = 6 > 5
    expect(result.events).toContainEqual(expect.objectContaining({ text: "Wall of Flesh takes 6 damage." }));
  });

  it("Kaku Kaioh (kaku_evade_counter): evades and reflects the attacker's ATK", () => {
    const state = mainState();
    state.rngSeed = 1;
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 10, maxHp: 10, sleeping: false });
    state.players[1].board[0] = makeMinion("Kaku Kaioh", 1, { hp: 10, maxHp: 10 });
    const after = attack(state, 0, 0);
    expect(after.players[1].board[0]?.hp).toBe(10);
    expect(after.players[0].board[0]?.hp).toBe(6);
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
    expect(after.pendingTarget).toBeNull(); // random, never a choice
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

  it("Flowey (flowey_save_load) restores the saved core HP when it dies", () => {
    const state = mainState();
    state.players[0].health = 60;
    const afterPlay = playCardFor(state, 0, "Flowey", 0);
    expect(afterPlay.players[0].board[0]?.savedCoreHealth).toBe(60);
    afterPlay.players[0].health = 25;
    afterPlay.players[1].board[0] = makeMinion("John Wick", 1, { atk: 99, sleeping: false });
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(afterPlay, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(afterDeath.players[0].board[0]).toBeNull();
    expect(afterDeath.players[0].health).toBe(60);
  });

  it("caps Flowey's restored core HP at the game's 75-HP maximum", () => {
    const state = mainState();
    state.players[0].health = 80;
    const afterPlay = playCardFor(state, 0, "Flowey", 0);
    afterPlay.players[0].health = 25;
    afterPlay.players[1].board[0] = makeMinion("John Wick", 1, { atk: 99, sleeping: false });
    afterPlay.activePlayer = 1;
    const afterDeath = applyAction(afterPlay, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(afterDeath.players[0].health).toBe(75);
  });

  it("Flowey stays alive through an unopposed turn", () => {
    const state = mainState();
    state.players[0].health = 60;
    const afterPlay = playCardFor(state, 0, "Flowey", 0);
    const afterTurn = toMyNextTurn(afterPlay);
    expect(afterTurn.players[0].board[0]).toMatchObject({ name: "Flowey", hp: 1, maxHp: 1 });
  });

  it("Kizaru starts with Divine Shield and restores it on his owner's turn", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Kizaru", 0, { divineShield: false });
    expect(state.players[0].board[0]?.keywords).toContain("Divine Shield");
    expect(toMyNextTurn(state).players[0].board[0]?.divineShield).toBe(true);
  });

  it("Light Yagami destroys a random Nature enemy on play", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("John Wick", 1, { divineShield: true });
    state.players[1].board[1] = makeMinion("Avatar Aang", 1);
    const after = playCardFor(state, 0, "Light Yagami", 0);
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[1].board[1]?.name).toBe("Avatar Aang");
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

/**
 * Silence takes the growth back with the text.
 *
 * The discriminating property in each of these is the DIRECTION of the change,
 * not the fact that a number moved. A Silence that simply reset both stats to
 * the printed line would pass the first test and fail the second; a Silence
 * that left the stat line alone would fail the first and pass the second.
 */
describe("Silence strips stat buffs", () => {
  it("takes a buffed minion back down to its printed stats", () => {
    const state = mainState();
    // Death Star prints 7/6. This one has been pumped well past that.
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 14, hp: 16, maxHp: 16 });

    const after = playCardFor(state, 0, "Aizawa", 0).players[1].board[0];
    expect(after?.silenced).toBe(true);
    expect(after?.atk).toBe(7);
    expect(after?.maxHp).toBe(6);
    expect(after?.hp).toBe(6);
  });

  it("keeps a nerf, because Silence is not a cleanse", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 1, hp: 2, maxHp: 2 });

    const after = playCardFor(state, 0, "Aizawa", 0).players[1].board[0];
    expect(after?.silenced).toBe(true);
    expect(after?.atk).toBe(1);
    expect(after?.maxHp).toBe(2);
  });

  it("does not heal the damage taken while the minion was oversized", () => {
    const state = mainState();
    // 14/16 over a printed 7/6, sitting on 9 HP. Losing the buff caps current
    // HP at the printed maximum; it must never restore it to full.
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 14, hp: 9, maxHp: 16 });

    const after = playCardFor(state, 0, "Aizawa", 0).players[1].board[0];
    expect(after?.maxHp).toBe(6);
    expect(after?.hp).toBe(6);
  });

  it("undoes a relic's stat gift too, which is what Elder wand is for", () => {
    const state = mainState();
    // The Holy Grail doubles the bearer's stats the moment it is strapped on.
    // Those doubled numbers are a gift like any other, so Silence takes them.
    const grail = relics.find((relic) => relic.name === "The Holy Grail");
    if (!grail) throw new Error("Missing The Holy Grail");
    const printed = makeMinion("Death Star", 1);
    state.players[1].board[0] = makeMinion("Death Star", 1, {
      atk: printed.atk * 2,
      hp: printed.maxHp * 2,
      maxHp: printed.maxHp * 2,
      relic: { ...grail, instanceId: "test-grail" } as never,
    });

    const after = playCardFor(state, 0, "Aizawa", 0).players[1].board[0];
    expect(after?.silenced).toBe(true);
    expect(after?.atk).toBe(printed.atk);
    expect(after?.maxHp).toBe(printed.maxHp);
    // The relic itself is still equipped; only the stats it handed over are gone.
    expect(after?.relic?.name).toBe("The Holy Grail");
  });

  it("leaves permanent buffs alone when the silence is Gojo's, because his lifts when he dies", () => {
    const state = mainState();
    // A Death Star pumped to 14/16 over a printed 7/6, standing under Gojo's
    // aura. His card says the silence is temporary, so taking the growth for
    // good would quietly make him the best removal card in the deck.
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 14, hp: 16, maxHp: 16 });

    const under = playCardFor(state, 0, "Gojo", 0).players[1].board[0];
    expect(under?.silenced).toBe(true);
    expect(under?.atk).toBe(14);
    expect(under?.maxHp).toBe(16);

    // An ordinary Silence on the same board still takes the growth.
    const cut = playCardFor(state, 0, "Aizawa", 0).players[1].board[0];
    expect(cut?.atk).toBe(7);
    expect(cut?.maxHp).toBe(6);
  });

  it("cancels a live aura's buff on a silenced minion, but keeps the aura's curse", () => {
    const printed = makeMinion("Zoro", 1);

    // Giant Tree gives every OTHER friendly Nature minion +2/+1; All Might gives
    // every ENEMY minion -1 ATK. Zoro stands in both at once, so one board shows
    // which half survives a Silence.
    const run = (silenced: boolean) => {
      const state = mainState();
      state.players[1].board[0] = makeMinion("Zoro", 1, { silenced });
      state.players[1].board[1] = makeMinion("Giant Tree", 1);
      state.players[0].board[0] = makeMinion("All Might", 0);
      // Any action re-runs the aura pass. A vanilla body into an empty slot is
      // the quietest one on the roster.
      return playCardFor(state, 0, "UFO", 1).players[1].board[0];
    };

    const open = run(false);
    expect(open?.atk).toBe(printed.atk + 2 - 1);
    expect(open?.maxHp).toBe(printed.maxHp + 1);

    const shut = run(true);
    expect(shut?.atk).toBe(printed.atk - 1);
    expect(shut?.maxHp).toBe(printed.maxHp);
  });
});
