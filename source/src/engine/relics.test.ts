import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId, RelicInstance } from "./types";

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

function relicByName(name: string): RelicInstance {
  const relic = relics.find((entry) => entry.name === name);
  if (!relic) throw new Error(`Missing relic ${name}`);
  return { id: relic.id, relicId: relic.relicId, name: relic.name, effect: relic.effect, art: relic.art };
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

function mainState(seed = "relic-tests"): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function playRelicFor(state: GameState, player: PlayerId, relicName: string, slotIndex: number): GameState {
  const next: GameState = { ...state, cheatMode: true, activePlayer: player, phase: "main", drawChoice: null };
  next.players = [...state.players] as GameState["players"];
  next.players[player] = { ...state.players[player], hand: [relicByName(relicName).id] };
  return applyAction(next, { type: "play_relic", player, handIndex: 0, slotIndex }, library).state;
}

function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
  let next = applyAction(state, { type: "end_turn", player }, library).state;
  while (next.phase === "drawChoice" && next.drawChoice) {
    next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
  }
  return next;
}
const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

describe("relic cards in the shared deck", () => {
  it("puts every relic card in the shared deck", () => {
    const state = mainState();
    const relicIds = relics.map((relic) => relic.id);
    expect(state.deck.filter((cardId) => relicIds.includes(cardId))).toHaveLength(relics.length);
    expect(state.deck.length + state.players[0].hand.length + state.players[1].hand.length).toBe(cards.length + relics.length);
    expect(mainState("other-seed").deck).not.toEqual(state.deck);
  });

  it("hands a gained relic to its finder without auto-equipping it", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Gilgamesh", 0); // ongoing: gain an Ascension Relic
    const available = new Set(state.deck.filter((cardId) => relics.some((relic) => relic.id === cardId)));

    const after = toMyNextTurn(state);
    const gained = after.players[0].hand.find((cardId) => available.has(cardId));
    expect(gained).toBeTruthy();
    expect(after.players[0].board[0]?.relic).toBeNull();
    expect(after.deck).not.toContain(gained);
  });

  it("never auto-equips a second gained relic onto another ally", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Gilgamesh", 0, {
      relic: relicByName("Elder wand"),
    });
    state.players[0].board[1] = makeMinion("Mob Psycho", 0);

    const after = toMyNextTurn(state);
    expect(after.players[0].board[0]?.relic?.name).toBe("Elder wand");
    expect(after.players[0].board[1]?.relic).toBeNull();
    expect(after.players[0].hand.some((cardId) => relics.some((relic) => relic.id === cardId))).toBe(true);
  });
});

describe("relic effects", () => {
  it("plays a relic from hand onto exactly the chosen bearer and charges its cost", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    state.players[0].board[1] = makeMinion("Gilgamesh", 0);
    state.players[0].hand = [relicByName("Elder wand").id];
    state.players[0].mana = 2;
    const action = getLegalActions(state, library).find((candidate) => candidate.type === "play_relic");
    expect(action).toEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 });
    const after = applyAction(state, action!, library).state;
    expect(after.players[0].mana).toBe(0);
    expect(after.players[0].board[0]?.relic?.name).toBe("Elder wand");
    expect(after.players[0].board[1]?.relic).toBeNull();
  });

  it("returns reusable relics to hand once per turn, but never re-fires them automatically", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { relic: relicByName("Elder wand") });
    state.players[0].hand = [];
    const action = getLegalActions(state, library).find((candidate) => candidate.type === "return_relic");
    expect(action).toEqual({ type: "return_relic", player: 0, slotIndex: 0 });
    const returned = applyAction(state, action!, library).state;
    expect(returned.players[0].board[0]?.relic).toBeNull();
    expect(returned.players[0].hand).toEqual([relicByName("Elder wand").id]);
    expect(getLegalActions(returned, library).some((candidate) => candidate.type === "return_relic")).toBe(false);
  });

  it("does not let a full hand keep a returned relic", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { relic: relicByName("Elder wand") });
    state.players[0].hand = Array.from({ length: 10 }, () => cardId("Zoro"));
    expect(getLegalActions(state, library).some((candidate) => candidate.type === "return_relic")).toBe(false);
  });

  it("The Holy Grail doubles the bearer on equip", () => {
    const state = mainState();
    const bearer = makeMinion("Mob Psycho", 0); // 6/6
    state.players[0].board[0] = bearer;
    const after = playRelicFor(state, 0, "The Holy Grail", 0);
    const wearer = after.players[0].board[0]!;
    expect(wearer.relic?.name).toBe("The Holy Grail");
    expect(wearer.atk).toBe(wearer.baseAtk * 2);
    expect(wearer.maxHp).toBe(wearer.baseHp * 2);
  });

  it("One Ring adds 3 to a swing at the core, and nothing to a minion trade", () => {
    const swing = (relic: RelicInstance | null) => {
      const state = mainState();
      state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 5, relic });
      return applyAction(state, { type: "attack_core", player: 0, attackerSlot: 0 }, library)
        .state.players[1].health;
    };
    // Relative to the core the duel actually starts on, so a pacing change to
    // starting health never fails this test again.
    const fullCore = mainState().players[1].health;
    expect(swing(null)).toBe(fullCore - 5);
    expect(swing(relicByName("One Ring"))).toBe(fullCore - 8);

    // A minion trade is untouched by it.
    const trade = mainState();
    trade.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 5, relic: relicByName("One Ring") });
    trade.players[1].board[0] = makeMinion("Death Star", 1, { hp: 20, maxHp: 20 });
    const after = applyAction(trade, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]?.hp).toBe(15);
  });

  it("Tesseract takes no retaliation on its own swing, but is hit normally on the enemy's turn", () => {
    // Re-cut from a "move to another board slot" effect the engine has no action
    // for. This is the only thing in the game that suspends simultaneous combat.
    const attack = (relic: RelicInstance | null) => {
      const state = mainState();
      state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 3, hp: 9, maxHp: 9, relic });
      state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 4, hp: 20, maxHp: 20 });
      const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
      return after.players[0].board[0]!.hp;
    };
    expect(attack(null)).toBe(5); // 9 - 4 retaliation
    expect(attack(relicByName("Tesseract"))).toBe(9); // untouched

    // It only protects the bearer's OWN swing. Being attacked still hurts.
    const incoming = mainState();
    incoming.players[0].board[0] = makeMinion("Mob Psycho", 0, {
      atk: 3, hp: 9, maxHp: 9, relic: relicByName("Tesseract"),
    });
    incoming.players[1].board[0] = makeMinion("Death Star", 1, { atk: 4, hp: 20, maxHp: 20 });
    incoming.activePlayer = 1;
    const hit = applyAction(incoming, { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(hit.players[0].board[0]!.hp).toBe(5);
  });

  it("Anti-magic Mask refuses a Freeze", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Mob Psycho", 1, { relic: relicByName("Anti-magic Mask") });

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 0); // Battlecry: freeze an enemy
    expect(after.players[1].board[0]?.frozen).toBe(false);
  });

  it("Elder wand halves damage coming from Magic", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 5 }); // Magic camp
    state.players[1].board[0] = makeMinion("Death Star", 1, { hp: 20, maxHp: 20, relic: relicByName("Elder wand") });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]?.hp).toBe(18); // 5 -> 2
  });

  it("The Green Mask sends a dying bearer to hand instead of the discard", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 99 });
    state.players[1].board[0] = makeMinion("Death Star", 1, { hp: 1, maxHp: 1, relic: relicByName("The Green Mask") });
    const deathStar = cardId("Death Star");

    const targetInstanceId = state.players[1].board[0]!.instanceId;
    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);
    const after = result.state;
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[1].hand).toContain(deathStar);
    expect(after.discard).not.toContain(deathStar);
    expect(result.events).toContainEqual(expect.objectContaining({ motion: "return", instanceId: targetInstanceId }));
  });

  it("Allspark Cube marks a captured kill as a return to hand", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, {
      atk: 99,
      hp: 20,
      maxHp: 20,
      relic: relicByName("Allspark Cube"),
    });
    state.players[1].board[0] = makeMinion("Death Star", 1, { hp: 1, maxHp: 1 });
    const targetInstanceId = state.players[1].board[0]!.instanceId;

    const result = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library);

    expect(result.state.players[0].hand).toContain(cardId("Death Star"));
    expect(result.events).toContainEqual(expect.objectContaining({ motion: "return", instanceId: targetInstanceId }));
  });

  it("Infinity Castle hides its bearer from enemy targeting", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Mob Psycho", 1, { relic: relicByName("Infinity Castle") });
    state.players[1].board[1] = makeMinion("Death Star", 1);

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 0);
    // Only the unprotected minion was ever an option, so it froze without a prompt.
    expect(after.phase).toBe("main");
    expect(after.players[1].board[0]?.frozen).toBe(false);
    expect(after.players[1].board[1]?.frozen).toBe(true);
  });

  it("a relic dies with its bearer", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 99 });
    state.players[1].board[0] = makeMinion("Death Star", 1, { hp: 1, maxHp: 1, relic: relicByName("Elder wand") });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
    expect(after.players[1].board[0]).toBeNull();
    // It does not fall into the satchel and it does not go back on the shelf —
    // losing the bearer loses the relic.
    expect(after.discard).toContain(relicByName("Elder wand").id);
    expect(after.players[1].board.some((minion) => minion?.relic)).toBe(false);
  });
});
