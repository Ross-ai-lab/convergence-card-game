import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary, readySwings } from "./game";
import { chooseBotAction } from "./bot";
import type { GameState, MinionInstance, PlayerId } from "./types";
import { spawnTestMinion } from "./test-utils";

const library = makeCardLibrary(cards);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function makeMinion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(library[cardId(name)], owner, overrides);
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
  const state = createInitialGame(cards);
  state.phase = "main";
  state.drawChoice = null;
  state.mulligan = null;
  return state;
}

describe("Convergence engine", () => {
  it("puts every roster card and relic into the shared draw pool exactly once", () => {
    const state = createInitialGame(cards, "full-roster-audit", relics);
    const drawableIds = [
      ...state.players[0].hand,
      ...state.players[1].hand,
      ...state.deck,
      ...state.bottomDeck,
      ...state.discard,
    ];
    const expectedIds = [
      ...cards.map((card) => card.id),
      ...relics.filter((relic) => relic.relicId !== "none").map((relic) => relic.id),
    ];

    expect(cards).toHaveLength(182);
    expect(relics).toHaveLength(34);
    expect(drawableIds).toHaveLength(expectedIds.length);
    expect(new Set(drawableIds)).toEqual(new Set(expectedIds));
    for (const id of expectedIds) {
      expect(drawableIds.filter((candidate) => candidate === id), `${id} should appear exactly once`).toHaveLength(1);
    }
  });

  it("replays one shuffle from one seed and produces new orders from new seeds", () => {
    const deckOrder = (seed: string) => {
      const state = createInitialGame(cards, seed, relics);
      return [...state.players[0].hand, ...state.players[1].hand, ...state.deck];
    };

    expect(deckOrder("repeatable-seed")).toEqual(deckOrder("repeatable-seed"));
    const openingSequences = new Set(
      Array.from({ length: 64 }, (_, index) => deckOrder(`fresh-duel-${index}`).slice(0, 12).join(",")),
    );
    expect(openingSequences.size).toBe(64);
  });

  it("starts a hotseat game with the right hands, coins, and legal moves", () => {
    const state = createInitialGame(cards);
    const legal = getLegalActions(state, library);
    expect(state.players[0].hand).toHaveLength(3);
    expect(state.players[1].hand).toHaveLength(3); // both start with 3; player two also keeps The Coin
    expect(state.players[1].coins).toBe(1);
    expect(state.phase).toBe("mulligan");
    expect(state.mulligan).toEqual({ player: 0, selected: [false, false, false] });
    expect(legal).toHaveLength(4);
    expect(legal).toContainEqual({ type: "toggle_mulligan", player: 0, handIndex: 0 });
    expect(legal).toContainEqual({ type: "confirm_mulligan", player: 0 });
    const selected = applyAction(state, { type: "toggle_mulligan", player: 0, handIndex: 0 }, library).state;
    expect(selected.mulligan?.selected[0]).toBe(true);
    const replacedId = state.players[0].hand[0];
    const drafted = applyAction(selected, { type: "confirm_mulligan", player: 0 }, library).state;
    expect(drafted.phase).toBe("main");
    expect(drafted.mulligan).toBeNull();
    expect(drafted.players[0].hand).toHaveLength(3);
    expect(drafted.bottomDeck).toContain(replacedId);
  });

  /**
   * The tutorial's teaching target, asserted by its RULES rather than its name.
   *
   * The old version of this test pinned the name "Goblins" and nothing else,
   * which is why it went on passing after Goblins lost its Taunt and became a
   * Deathrattle minion. The lesson text says "choose the enemy Taunt minion" and
   * the third lesson cannot be finished without one, so Taunt is the assertion.
   */
  it("builds the tutorial from a real, deterministic game position", () => {
    const state = createInitialGame(cards, "tutorial-seed", relics, {
      tutorial: true,
      heroPowers: ["core_heal", null],
    });

    expect(state.phase).toBe("main");
    expect(state.mulligan).toBeNull();
    expect(state.players[0].hand.map((id) => library[id].name)).toEqual([
      "An Order of Heavy Knights",
      "Batman",
      "Nezu",
    ]);
    const target = state.players[1].board[2];
    expect(target).not.toBeNull();
    // Lesson three names this keyword out loud, and Taunt closing the core is
    // the whole point of that lesson.
    expect(target?.keywords).toContain("Taunt");
    // It must never swing at the minion lesson one taught the player to play.
    expect(target?.keywords).toContain("Cannot Attack");
    // Lesson four points a Battlecry at it, so it has to outlive lesson three's
    // swing, and it must print no rule of its own for a first-duel player to read.
    expect(target?.effectId).toBe("none");
    expect(target?.hp).toBeGreaterThan(1);
    expect(state.players[0].board.every((slot) => slot === null)).toBe(true);
    expect(getLegalActions(state, library).some((action) => action.type === "play_card")).toBe(true);
  });

  /**
   * The tutorial has to still be finishable after the Recruit has had its turn.
   *
   * This is the failure the position-only test above cannot see. Lesson three
   * asks the player to swing, and the enemy moves in between: with a 2 ATK body
   * on the enemy board and a damage Battlecry in its hand, the Recruit removed
   * the 1-HP minion the player had just been told to play, and the coach sat on
   * lesson three asking for a green rim that could never appear.
   */
  it("leaves both sides something to do after the Recruit's turn", () => {
    let state = createInitialGame(cards, "tutorial-walk", relics, { tutorial: true });

    const play = getLegalActions(state, library).find((action) => action.type === "play_card");
    expect(play).toBeDefined();
    state = applyAction(state, play!, library).state;
    state = applyAction(state, { type: "end_turn", player: 0 }, library).state;

    let guard = 0;
    while (state.activePlayer === 1 && state.phase === "main" && guard < 100) {
      guard += 1;
      const action = chooseBotAction(state, library, 1, "easy", getLegalActions(state, library));
      if (!action) break;
      state = applyAction(state, action, library).state;
    }

    expect(state.activePlayer).toBe(0);
    // Lesson three: a minion of the player's, awake, ready to be clicked.
    const mine = state.players[0].board.filter(Boolean);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.sleeping).toBe(false);
    // Lesson three again, and lesson four: something on the enemy board to
    // point at, still wearing the Taunt the lesson names.
    const taunts = state.players[1].board.filter((minion) => minion?.keywords.includes("Taunt"));
    expect(taunts).toHaveLength(1);
  });

  it("reuses a known legal-action list without changing action resolution", () => {
    const state = mainState();
    const legal = getLegalActions(state, library);
    const action = legal.find((candidate) => candidate.type === "end_turn");
    expect(action).toBeDefined();
    const normal = applyAction(state, action!, library);
    expect(applyAction(state, action!, library, legal)).toEqual(normal);

    const speculative = applyAction(state, action!, library, legal, false);
    expect(speculative.state).toEqual(normal.state);
    expect(speculative.events).toEqual(normal.events);
    expect(speculative.legalActions).toEqual([]);
  });

  it("plays a card into an empty slot and spends mana", () => {
    const state = mainState();
    state.players[0].hand = [cardId("John Wick")];
    state.players[0].mana = 1;
    const result = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library);
    expect(result.state.players[0].board[0]?.name).toBe("John Wick");
    expect(result.state.players[0].mana).toBe(0);
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it("lets cheat mode play cards without spending mana", () => {
    const state = mainState();
    state.cheatMode = true;
    state.players[0].hand = [cardId("Batman")];
    state.players[0].mana = 0;
    const legal = getLegalActions(state, library);
    expect(legal.some((action) => action.type === "play_card")).toBe(true);
    const result = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library);
    expect(result.state.players[0].board[0]?.name).toBe("Batman");
    expect(result.state.players[0].mana).toBe(0);
  });

  it("scopes developer infinite mana to the player who enabled it", () => {
    const state = mainState();
    state.cheatMode = true;
    state.cheatPlayer = 0;
    state.players[0].hand = [cardId("Batman")];
    state.players[0].mana = 0;
    expect(getLegalActions(state, library)).toContainEqual({ type: "play_card", player: 0, handIndex: 0, slotIndex: 0 });

    const enemyTurn: GameState = {
      ...state,
      activePlayer: 1,
      players: [
        state.players[0],
        { ...state.players[1], hand: [cardId("Batman")], mana: 0 },
      ],
    };
    expect(getLegalActions(enemyTurn, library)).not.toContainEqual({ type: "play_card", player: 1, handIndex: 0, slotIndex: 0 });
  });

  it("blocks playing cards when the board is full", () => {
    const state = mainState();
    state.players[0].mana = 10;
    state.players[0].hand = [cardId("John Wick")];
    state.players[0].board = Array.from({ length: 5 }, (_, index) =>
      makeMinion("Bigfoot", 0, { instanceId: `full-${index}`, playOrder: index + 1 }),
    );
    const legal = getLegalActions(state, library);
    expect(legal.some((action) => action.type === "play_card")).toBe(false);
  });

  it("draws one card straight into hand on end turn — no choice step", () => {
    const state = mainState();
    const before = state.players[1].hand.length;
    const ended = applyAction(state, { type: "end_turn", player: 0 }, library).state;
    expect(ended.phase).toBe("main"); // Hearthstone's draw: no pick-1-of-2
    expect(ended.activePlayer).toBe(1);
    expect(ended.players[1].hand).toHaveLength(before + 1);
    expect(ended.players[1].mana).toBe(ended.players[1].maxMana);
  });

  it("Detective L turns the draw back into a choice of two", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Detective L", 1);
    const before = state.players[1].hand.length;
    const ended = applyAction(state, { type: "end_turn", player: 0 }, library).state;
    expect(ended.phase).toBe("drawChoice");
    expect(ended.drawChoice?.cards).toHaveLength(2);

    const chosen = applyAction(ended, { type: "choose_draw", player: 1, choiceIndex: 0 }, library).state;
    expect(chosen.phase).toBe("main");
    expect(chosen.players[1].hand).toHaveLength(before + 1); // one kept, one to the bottom
    expect(chosen.bottomDeck).toHaveLength(1);
  });

  it("a silenced Detective L gives no Foresight", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Detective L", 1, { silenced: true });
    const ended = applyAction(state, { type: "end_turn", player: 0 }, library).state;
    expect(ended.phase).toBe("main");
  });

  it("uses taunt to restrict attack targets", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[1].board[0] = makeMinion("Sandworm", 1);
    state.players[1].board[1] = makeMinion("Batman", 1);
    const legalTargets = getLegalActions(state, library).filter((action) => action.type === "attack_minion");
    expect(legalTargets).toHaveLength(1);
    expect(legalTargets[0]).toMatchObject({ targetSlot: 0 });
  });

  it("defender retaliates even when it dies (simultaneous combat)", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Pandora's Actor", 0); // 2 ATK / 2 HP, no combat passive
    // Pin the defender's body so this remains a simultaneous-combat test,
    // independent of later balance passes to John Wick's printed stats.
    state.players[1].board[0] = makeMinion("John Wick", 1, { atk: 1, hp: 1, maxHp: 1 });
    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    expect(result.state.players[1].board[0]).toBeNull(); // defender died
    expect(result.state.players[0].board[0]?.hp).toBe(1); // attacker still took the hit back
  });

  it("leaves exactly 2 HP when a 3-ATK minion hits a 5-HP defender", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0, { atk: 3, hp: 20, maxHp: 20, sleeping: false });
    state.players[1].board[0] = makeMinion("John Wick", 1, { atk: 0, hp: 5, maxHp: 5, sleeping: false });

    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    expect(result.state.players[1].board[0]?.hp).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({ text: "John Wick takes 3 damage." }));
  });

  it("breaks Divine Shield before health damage", () => {
    // Pick the defender by the KEYWORD rather than by name: this test used to
    // name Avatar Aang, and a balance pass that took his Divine Shield away left
    // it silently testing an ordinary trade instead of the shield rule.
    const shielded = cards.find((card) => card.keywords.includes("Divine Shield"))!;
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[1].board[0] = makeMinion(shielded.name, 1);
    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    const defender = result.state.players[1].board[0];
    expect(defender?.divineShield).toBe(false);
    expect(defender?.hp).toBe(shielded.hp); // the shield ate the whole blow
  });

  it("does not let a Silenced minion's Divine Shield block anything", () => {
    // Silence strips printed keywords, and Divine Shield is a keyword. Every
    // other keyword already answered to it, and the card face already hid the
    // gold rim on a silenced minion, while the shield itself went on eating a
    // whole blow. Assert the exact HP so a shield that silently returns fails.
    const shielded = cards.find((card) => card.keywords.includes("Divine Shield"))!;
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    const attackerAtk = state.players[0].board[0]!.atk;
    state.players[1].board[0] = makeMinion(shielded.name, 1, { silenced: true, hp: 20, maxHp: 20 });
    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    const defender = result.state.players[1].board[0];
    expect(defender?.hp).toBe(20 - attackerAtk);
    // Suppressed, not consumed: Gojo's Silence lifts, and the shield comes back
    // with the rest of the card's text.
    expect(defender?.divineShield).toBe(true);
  });

  it("runs a Chained minion's Ongoing effect on the turn its chain breaks", () => {
    // The chain counter is decremented at turn start, so the turn it reaches
    // zero the minion may attack and may be targeted. Its Ongoing used to be
    // held back for that turn as well, which charged a one-turn chain two
    // payments.
    const state = mainState();
    state.activePlayer = 0;
    state.players[1].turnsStarted = 1;
    const kabuto = makeMinion("Carnage Kabuto", 1, { chained: 1 });
    const startingAtk = kabuto.atk;
    state.players[1].board[0] = kabuto;

    const chainBreaks = applyAction(state, { type: "end_turn", player: 0 }, library).state;
    expect(chainBreaks.players[1].board[0]?.chained).toBe(0);
    // "Ongoing: Gain +3 ATK", paid on the turn the chains come off.
    expect(chainBreaks.players[1].board[0]?.atk).toBe(startingAtk + 3);
  });

  it("holds a still-Chained minion's Ongoing effect back", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[1].turnsStarted = 1;
    const kabuto = makeMinion("Carnage Kabuto", 1, { chained: 2 });
    const startingAtk = kabuto.atk;
    state.players[1].board[0] = kabuto;

    const stillChained = applyAction(state, { type: "end_turn", player: 0 }, library).state;
    expect(stillChained.players[1].board[0]?.chained).toBe(1);
    expect(stillChained.players[1].board[0]?.atk).toBe(startingAtk);
  });

  it("deals no core damage just for having a board", () => {
    // The passive ping was removed: a board only hurts a core by swinging at it.
    const state = mainState();
    state.players[0].board[0] = makeMinion("John Wick", 0);
    state.players[0].board[1] = makeMinion("Joker", 0);
    const before = state.players[1].health;
    const result = applyAction(state, { type: "end_turn", player: 0 }, library);
    // Asserted against the core it started on, never against a literal — starting
    // core HP is the game's pacing dial and has already moved once.
    expect(result.state.players[1].health).toBe(before);
  });

  it("resolves Ongoing effects in play order", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[0].turnsStarted = 1;
    state.players[0].board[0] = makeMinion("Boros", 0, { playOrder: 1 });
    state.players[0].board[1] = makeMinion("Carnage Kabuto", 0, { playOrder: 2 });
    // With the draw step gone, the turn's Ongoing effects resolve inside end_turn.
    const resolved = applyAction(state, { type: "end_turn", player: 1 }, library);
    const effectTexts = resolved.events.filter((event) => event.kind === "effect").map((event) => event.text);
    expect(effectTexts[0]).toContain("Boros");
    expect(effectTexts.some((text) => text.includes("Carnage Kabuto"))).toBe(true);
    expect(effectTexts.indexOf(effectTexts.find((t) => t.includes("Boros"))!))
      .toBeLessThan(effectTexts.indexOf(effectTexts.find((t) => t.includes("Carnage Kabuto"))!));
  });

  it("keeps Light Yagami on the board when there is no Nature enemy to name", () => {
    const state = mainState();
    // Avatar Aang is not Nature, so the Battlecry has nothing legal to point at
    // and resolves quietly. He lost the Deathrattle half on 2 September 2026.
    state.players[1].board[0] = makeMinion("Avatar Aang", 1, { divineShield: true });
    const resolved = playCardFor(state, 0, "Light Yagami", 0);
    expect(resolved.players[0].board[0]?.name).toBe("Light Yagami");
    expect(resolved.players[0].board[0]?.effectTiming).toBe("onPlay");
    expect(resolved.players[1].board[0]?.name).toBe("Avatar Aang");
  });
});

/**
 * The Hearthstone face rule. Before this, the core could only be attacked with
 * the enemy board completely empty, so a minion's ATK almost never reached the
 * thing that ends the game.
 */
describe("attacking the enemy core", () => {
  const dummy = (name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}) =>
    makeMinion(name, owner, { effectId: "none", effectTiming: "none", keywords: [], ...overrides });
  const coreAttacks = (state: GameState) =>
    getLegalActions(state, library).filter((action) => action.type === "attack_core");

  it("is legal past a defended board", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0);
    state.players[1].board[0] = dummy("Death Star", 1);
    expect(coreAttacks(state)).toHaveLength(1);
  });

  it("is blocked by a Taunt", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0);
    state.players[1].board[0] = dummy("Death Star", 1, { keywords: ["Taunt"] });
    expect(coreAttacks(state)).toHaveLength(0);
  });

  it("is legal past Kojiro Sasaki, whose new passive is evasion rather than redirection", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0);
    state.players[1].board[0] = makeMinion("Kojiro Sasaki", 1);
    expect(coreAttacks(state)).toHaveLength(1);
  });

  it("is blocked for a frozen or sleeping minion, guard or no guard", () => {
    const frozen = mainState();
    frozen.activePlayer = 0;
    frozen.players[0].board[0] = dummy("Zoro", 0, { frozen: true });
    expect(coreAttacks(frozen)).toHaveLength(0);

    const asleep = mainState();
    asleep.activePlayer = 0;
    asleep.players[0].board[0] = dummy("Zoro", 0, { sleeping: true });
    expect(coreAttacks(asleep)).toHaveLength(0);
  });

  it("costs a frozen minion a whole turn, then lets it act the turn after", () => {
    // Freeze used to thaw at the START of the owner's turn, in the same loop
    // that resets attacksUsed -- so the minion attacked immediately and Freeze
    // cost it nothing. It must now sit out one full turn.
    const toMain = (state: GameState): GameState => ({ ...state, phase: "main", drawChoice: null });

    // Frozen on the opponent's turn, which is how Freeze is actually applied.
    let state = mainState();
    state.activePlayer = 1;
    state.players[0].board[0] = dummy("Zoro", 0, { frozen: true });

    // Hand back to its owner: it is still frozen, so it cannot swing.
    state = toMain(applyAction(state, { type: "end_turn", player: 1 }, library).state);
    expect(state.players[0].board[0]?.frozen).toBe(true);
    expect(coreAttacks(state)).toHaveLength(0);

    // Ending that turn is what thaws it -- it has served the turn.
    state = toMain(applyAction(state, { type: "end_turn", player: 0 }, library).state);
    expect(state.players[0].board[0]?.frozen).toBe(false);

    // And the turn after, it swings normally.
    state = toMain(applyAction(state, { type: "end_turn", player: 1 }, library).state);
    expect(coreAttacks(state)).toHaveLength(1);
  });

  it("deals exactly the attacker's ATK, with no retaliation", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 6 });
    state.players[1].board[0] = dummy("Death Star", 1);
    const before = state.players[1].health;
    const after = applyAction(state, { type: "attack_core", player: 0, attackerSlot: 0 }, library).state;
    expect(after.players[1].health).toBe(before - 6);
    expect(after.players[0].board[0]?.hp).toBe(after.players[0].board[0]?.maxHp);
  });

  it("allows a 0-ATK minion to attack for no damage", () => {
    const state = mainState();
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 0 });
    state.players[1].board[0] = dummy("Death Star", 1);
    const legal = getLegalActions(state, library);
    expect(legal.some((action) => action.type === "attack_core")).toBe(true);
    expect(legal.some((action) => action.type === "attack_minion")).toBe(true);
  });

  /**
   * The number the bot's lethal check reads. Its own copy of this rule counted
   * one swing per body and stopped, so every claim below was wrong inside the
   * evaluation that decides whether a duel is already over.
   */
  it("counts the swings a minion has left, not one per body", () => {
    expect(readySwings(makeMinion("Zoro", 0, { sleeping: false }))).toBe(1);
    // Flash and Vergil swing twice; a spent first swing leaves the second.
    expect(readySwings(makeMinion("Flash", 0, { sleeping: false }))).toBe(2);
    expect(readySwings(makeMinion("Flash", 0, { sleeping: false, attacksUsed: 1 }))).toBe(1);
    expect(readySwings(makeMinion("Vergil & Dante & Nero", 0, { sleeping: false }))).toBe(2);
    // Bodies that can never attack are worth no reach at all.
    expect(readySwings(makeMinion("Grand Master Yoda", 0, { sleeping: false }))).toBe(0);
    expect(readySwings(makeMinion("The Watcher", 0, { sleeping: false }))).toBe(0);
    expect(readySwings(makeMinion("Ragnaros", 0, { sleeping: false }))).toBe(0);
    // And neither is a body that simply cannot act this turn.
    expect(readySwings(makeMinion("Zoro", 0, { sleeping: true }))).toBe(0);
    expect(readySwings(makeMinion("Zoro", 0, { sleeping: false, frozen: true }))).toBe(0);
    expect(readySwings(makeMinion("Zoro", 0, { sleeping: false, chained: 2 }))).toBe(0);
    expect(readySwings(makeMinion("Zoro", 0, { sleeping: false, attackLocked: true }))).toBe(0);
  });
});
