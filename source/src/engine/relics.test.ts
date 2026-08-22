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
  it("Gilgamesh equips one random Ascension Relic on arrival", () => {
    const state = mainState("gilgamesh-equip");
    const available = new Set(state.deck.filter((cardId) => relics.some((relic) => relic.id === cardId)));
    const after = playCardFor(state, 0, "Gilgamesh");
    const equipped = after.players[0].board[0]?.relic;

    expect(after.players[0].board[0]).toMatchObject({ name: "Gilgamesh", baseAtk: 5, baseHp: 5 });
    expect(equipped).not.toBeNull();
    expect(available.has(equipped?.id ?? "")).toBe(true);
    expect(after.players[0].hand).not.toContain(equipped?.id);
    expect(after.deck).not.toContain(equipped?.id);
    expect(after.bottomDeck).not.toContain(equipped?.id);
  });

  it("puts every relic card in the shared deck", () => {
    const state = mainState();
    const relicIds = relics.map((relic) => relic.id);
    const sharedCards = [...state.deck, ...state.players[0].hand, ...state.players[1].hand];
    expect(sharedCards.filter((cardId) => relicIds.includes(cardId))).toHaveLength(relics.length);
    expect(state.deck.length + state.players[0].hand.length + state.players[1].hand.length).toBe(cards.length + relics.length);
    expect(mainState("other-seed").deck).not.toEqual(state.deck);
  });

  it("keeps Gilgamesh's random relic equipped through later turns", () => {
    const state = mainState("gilgamesh-stays-equipped");
    const after = playCardFor(state, 0, "Gilgamesh");
    const equippedId = after.players[0].board[0]?.relic?.id;
    expect(equippedId).toBeTruthy();

    const later = toMyNextTurn(after);
    expect(later.players[0].board[0]?.relic?.id).toBe(equippedId);
  });
});

describe("relic effects", () => {
  it("plays a relic from hand onto exactly the chosen bearer and charges its cost", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    state.players[0].board[1] = makeMinion("Gilgamesh", 0);
    state.players[0].hand = [relicByName("Elder wand").id];
    state.players[0].mana = 1;
    const action = getLegalActions(state, library).find((candidate) => candidate.type === "play_relic");
    expect(action).toEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 });
    const after = applyAction(state, action!, library).state;
    expect(after.players[0].mana).toBe(0);
    expect(after.players[0].board[0]?.relic?.name).toBe("Elder wand");
    expect(after.players[0].board[1]?.relic).toBeNull();
  });

  it("allows two Ascension Relics on one minion, but no third", () => {
    const state = mainState("two-relic-slots");
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);

    const first = playRelicFor(state, 0, "Elder wand", 0);
    const second = playRelicFor(first, 0, "Tesseract", 0);
    expect(second.players[0].board[0]?.relic?.name).toBe("Elder wand");
    expect(second.players[0].board[0]?.relic2?.name).toBe("Tesseract");
    second.players[0].hand = [relicByName("One Ring").id];
    expect(getLegalActions(second, library)).not.toContainEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 });

    // Attached relics are equipment, not cards the bearer can choose to return.
    second.players[0].hand = [];
    expect(getLegalActions(second, library).some((action) => "relicIndex" in action)).toBe(false);
  });

  it("ships the requested relic costs and replacement effects", () => {
    const requested = [
      ["Lostvayne", 3, "The bearer is invulnerable to Magic attacks."],
      ["One Ring", 4, "The first time the bearer would die, set it to full HP instead and destroy this relic."],
      ["White Whistle", 3, "The bearer's Battlecry effect turns into Ongoing effect."],
      ["Chamber of Secrets", 3, "The bearer is invulnerable to Nature attacks."],
      ["Cyber-Enchantment", 3, "The bearer is invulnerable to Tech attacks."],
      ["Ea", 3, "The bearer's ATK is doubled."],
      ["Elder wand", 1, "The bearer is immune to Silence."],
      ["Monster Cell", 2, "The bearer gains +3/+2 and Taunt."],
      ["Philosopher's Stone", 4, "The bearer takes double damage on the enemy's turn but is invulnerable on your own."],
      ["Anti-magic Mask", 1, "The bearer is immune to Freeze and Chained."],
      ["Queen's Cocoon", 2, "The bearer is Chained for a turn. When it awakens, it gains +3/+3."],
      ["The Green Mask", 2, "Return the bearer to your hand after death."],
      ["Tesseract", 4, "The bearer can attack twice each turn."],
      ["Infinity Castle", 4, "The bearer's Evade chance is 50%."],
    ] as const;

    for (const [name, cost, effect] of requested) {
      expect(relics.find((relic) => relic.name === name)).toMatchObject({ cost, effect });
    }
    expect(relics.find((relic) => relic.name === "Devil Fruit")).toMatchObject({ cost: 2, effect: expect.stringContaining("+2/+1") });
  });

  it("never exposes a manual attached-relic return action", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, { relic: relicByName("Elder wand") });
    state.players[0].hand = [];
    expect(getLegalActions(state, library).some((candidate) => "relicIndex" in candidate)).toBe(false);
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

  it("One Ring prevents the first death, restores full HP, and is destroyed", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, {
      hp: 1,
      maxHp: 10,
      relic: relicByName("One Ring"),
    });
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 99, hp: 20, maxHp: 20 });
    state.activePlayer = 1;

    const result = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    );
    const after = result.state;
    expect(after.players[0].board[0]?.hp).toBe(10);
    expect(after.players[0].board[0]?.relic).toBeNull();
    expect(after.discard).toContain(relicByName("One Ring").id);
    expect(result.events).toContainEqual(expect.objectContaining({ text: expect.stringContaining("survives at full health") }));

    // The relic is consumed: the next lethal hit removes the bearer.
    after.players[1].board[1] = makeMinion("Death Star", 1, { atk: 99, hp: 20, maxHp: 20 });
    const second = applyAction(
      after,
      { type: "attack_minion", player: 1, attackerSlot: 1, targetSlot: 0 },
      library,
    ).state;
    expect(second.players[0].board[0]).toBeNull();
  });

  it("Tesseract lets its bearer attack twice each turn", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, {
      atk: 3,
      hp: 9,
      maxHp: 9,
      relic: relicByName("Tesseract"),
    });
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 1, hp: 20, maxHp: 20 });

    const first = applyAction(
      state,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(first.players[0].board[0]?.attacksUsed).toBe(1);
    expect(getLegalActions(first, library)).toContainEqual({
      type: "attack_minion",
      player: 0,
      attackerSlot: 0,
      targetSlot: 0,
    });

    const second = applyAction(
      first,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(second.players[0].board[0]?.attacksUsed).toBe(2);
    expect(second.players[1].board[0]?.hp).toBe(14);
  });

  it("Anti-magic Mask blocks Freeze and Chained but not Silence", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Mob Psycho", 1, { relic: relicByName("Anti-magic Mask") });

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 0); // Battlecry: freeze and silence an enemy
    expect(after.players[1].board[0]?.frozen).toBe(false);
    expect(after.players[1].board[0]?.silenced).toBe(true);

    const chainState = mainState();
    chainState.players[1].board[0] = makeMinion("Mob Psycho", 1, { relic: relicByName("Anti-magic Mask") });
    const chained = playCardFor(chainState, 0, "Darth Vader", 0);
    expect(chained.players[1].board[0]?.chained).toBe(0);
  });

  it("Elder wand blocks Silence but not Freeze", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Mob Psycho", 1, { relic: relicByName("Elder wand") });

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 0);
    expect(after.players[1].board[0]?.frozen).toBe(true);
    expect(after.players[1].board[0]?.silenced).toBe(false);
  });

  it("Chamber of Secrets blocks Nature attacks and Cyber-Enchantment blocks Tech attacks", () => {
    const chamberState = mainState();
    chamberState.players[0].board[0] = makeMinion("Goblins", 0, { atk: 5 });
    chamberState.players[1].board[0] = makeMinion("Mob Psycho", 1, {
      hp: 10,
      maxHp: 10,
      relic: relicByName("Chamber of Secrets"),
    });
    const chamber = applyAction(
      chamberState,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(chamber.players[1].board[0]?.hp).toBe(10);

    const cyberState = mainState();
    cyberState.players[0].board[0] = makeMinion("Death Star", 0, { atk: 5 });
    cyberState.players[1].board[0] = makeMinion("Mob Psycho", 1, {
      hp: 10,
      maxHp: 10,
      relic: relicByName("Cyber-Enchantment"),
    });
    const cyber = applyAction(
      cyberState,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(cyber.players[1].board[0]?.hp).toBe(10);
  });

  it("Ea doubles the bearer's attack and Monster Cell grants stats and Taunt", () => {
    const eaState = mainState();
    eaState.players[0].board[0] = makeMinion("Mob Psycho", 0);
    const ea = playRelicFor(eaState, 0, "Ea", 0);
    expect(ea.players[0].board[0]?.atk).toBe(10);

    const monsterState = mainState();
    monsterState.players[0].board[0] = makeMinion("Mob Psycho", 0);
    const monster = playRelicFor(monsterState, 0, "Monster Cell", 0);
    const bearer = monster.players[0].board[0]!;
    expect(bearer.atk).toBe(8);
    expect(bearer.maxHp).toBe(7);
    expect(bearer.hp).toBe(7);
    expect(bearer.keywords).toContain("Taunt");
    expect(bearer.silenced).toBe(false);
  });

  it("White Whistle repeats a Battlecry at the next start of turn", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Death Star", 1, { hp: 10, maxHp: 10 });
    const afterBattlecry = playCardFor(state, 0, "Ainz Ooal Gown", 0);
    expect(afterBattlecry.players[1].board[0]?.hp).toBe(1);

    afterBattlecry.players[1].board[1] = makeMinion("Death Star", 1, { hp: 10, maxHp: 10 });
    const equipped = playRelicFor(afterBattlecry, 0, "White Whistle", 0);
    expect(equipped.players[1].board[1]?.hp).toBe(10);

    const nextTurn = toMyNextTurn(equipped);
    expect(nextTurn.players[1].board[1]?.hp).toBe(1);
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

  it("Infinity Castle gives its bearer a 50% chance to evade attacks", () => {
    const attackWithSeed = (rngSeed: number) => {
      const state = mainState();
      state.rngSeed = rngSeed;
      state.players[0].board[0] = makeMinion("Mob Psycho", 0, { atk: 5 });
      state.players[1].board[0] = makeMinion("Death Star", 1, {
        hp: 20,
        maxHp: 20,
        relic: relicByName("Infinity Castle"),
      });
      return applyAction(
        state,
        { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
        library,
      ).state.players[1].board[0]?.hp;
    };

    expect(attackWithSeed(1)).toBe(20);
    expect(attackWithSeed(123456789)).toBe(15);
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
