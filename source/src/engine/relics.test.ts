import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { Camp, CardDefinition, GameState, MinionInstance, PlayerId, RelicInstance } from "./types";

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

function makeToken(tokenId: string): MinionInstance {
  const token: CardDefinition = {
    kind: "minion",
    id: tokenId,
    name: tokenId.replace("token:", "").replace(/-/g, " "),
    cost: 0,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Magic",
    alignment: "Neutral",
    keywords: [],
    effectId: "none",
    effectTiming: "none",
    effect: "-",
    flavor: "A temporary token.",
    origin: "Token",
    art: "/card-art/raw/token-shadow-clone.webp",
  };
  return spawnTestMinion(token, 0);
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

  it("returns every token as a playable hand card without adding it to the gallery", () => {
    const tokenIds = [
      "token:shenron",
      "token:skeleton",
      "token:knight",
      "token:shadow-clone",
      "token:larva",
      "token:sin",
      "token:tie-fighter",
      "token:morgott",
      "token:drakath",
      "token:vision",
      "token:galactus",
      "token:awakened",
    ];

    for (const tokenId of tokenIds) {
      const state = mainState(`poke-ball-${tokenId}`);
      state.players[0].board[0] = makeToken(tokenId);

      const after = playRelicFor(state, 0, "Poké Ball", 0);

      expect(after.players[0].board[0], tokenId).toBeNull();
      expect(after.players[0].hand, tokenId).toContain(tokenId);
      expect(after.players[0].hand.filter((cardId) => cardId.startsWith("token:")), tokenId).toEqual([tokenId]);
      expect(library[tokenId], tokenId).toMatchObject({ id: tokenId, kind: "minion" });
      expect(cards.some((card) => card.id === tokenId), tokenId).toBe(false);
      expect(relics.some((relic) => relic.id === tokenId), tokenId).toBe(false);

      const playAction = getLegalActions(after, library).find(
        (action) => action.type === "play_card" && action.handIndex === 0 && action.slotIndex === 0,
      );
      expect(playAction, tokenId).toEqual({ type: "play_card", player: 0, handIndex: 0, slotIndex: 0 });
      const replayed = applyAction(after, playAction!, library).state;
      expect(replayed.players[0].board[0]?.cardId, tokenId).toBe(tokenId);
    }
  });

  it("ships the requested relic costs and replacement effects", () => {
    const requested = [
      ["Lostvayne", 3, "The bearer is invulnerable to Magic attacks while defending"],
      ["One Ring", 4, "The first time the bearer would die, set it to full HP instead and destroy this relic"],
      ["White Whistle", 3, "The bearer's Battlecry effect turns into Ongoing effect"],
      ["Chamber of Secrets", 3, "The bearer is invulnerable to Nature attacks while defending"],
      ["Cyber-Enchantment", 3, "The bearer is invulnerable to Tech attacks while defending"],
      ["Ea", 3, "The bearer's ATK is doubled"],
      ["Elder wand", 1, "The bearer is immune to Silence"],
      ["Monster Cell", 2, "The bearer gains +2/+2 and Taunt"],
      ["Philosopher's Stone", 4, "The bearer takes double damage on the enemy's turn but is invulnerable on your own"],
      ["Anti-magic Mask", 1, "The bearer is immune to Freeze and Chained"],
      ["Queen's Cocoon", 2, "The bearer is Chained for a turn. When it awakens, it gains +3/+3"],
      ["The Green Mask", 2, "Return the bearer to your hand after death"],
      ["Tesseract", 4, "The bearer can attack twice each turn"],
      ["Infinity Castle", 4, "The bearer's Evade chance is 50%"],
      ["Pandora's Box", 2, "The bearer gains +4/+4. It dies at the start of your next turn"],
      ["Omnitrix", 3, "At the start of your turn transform the bearer into a random minion that costs 1 more"],
      ["Stand Arrow", 1, "50% chance to transform the bearer into a random minion that costs 2 more; otherwise Silence it"],
      ["Poké Ball", 1, "Return the bearer to your hand"],
      ["Time Turner", 2, "At the start of your turn if the bearer is damaged restore it to the HP it had at the start of your previous turn"],
      ["Symbiote", 1, "When the bearer dies leave it Chained with 1 HP instead"],
      ["Neuralyzer", 1, "Remove all negative effects from the bearer"],
      ["Green Lantern Ring", 1, "At the end of your turn, if the bearer did not attack, give it +2/+1"],
      ["Green Lantern Ring", 1, "At the end of your turn, if the bearer did not attack, give it +2/+1"],
    ] as const;

    for (const [name, cost, effect] of requested) {
      expect(relics.find((relic) => relic.name === name)).toMatchObject({ cost, effect });
    }
    expect(relics.find((relic) => relic.name === "Devil Fruit")).toMatchObject({ cost: 2, effect: expect.stringContaining("+2/+1") });
  });

  it("Green Lantern Ring gives +2/+1 when its bearer did not attack", () => {
    const rested = mainState("green-lantern-rested");
    rested.players[0].board[0] = makeMinion("John Wick", 0);
    const afterRest = endTurnAndDraw(playRelicFor(rested, 0, "Green Lantern Ring", 0), 0);
    expect(afterRest.players[0].board[0]).toMatchObject({ atk: 3, hp: 2, maxHp: 2 });

    const fought = mainState("green-lantern-fought");
    fought.players[0].board[0] = makeMinion("John Wick", 0);
    fought.players[1].board[0] = makeMinion("Death Star", 1, { atk: 0, hp: 10, maxHp: 10, sleeping: false });
    const equipped = playRelicFor(fought, 0, "Green Lantern Ring", 0);
    equipped.players[0].board[0]!.sleeping = false;
    const afterAttack = applyAction(
      equipped,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    const afterFight = endTurnAndDraw(afterAttack, 0);
    expect(afterFight.players[0].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });
  });

  it("Green Lantern Ring gives +2/+1 when its bearer did not attack", () => {
    const rested = mainState("green-lantern-rested");
    rested.players[0].board[0] = makeMinion("John Wick", 0);
    const afterRest = endTurnAndDraw(playRelicFor(rested, 0, "Green Lantern Ring", 0), 0);
    expect(afterRest.players[0].board[0]).toMatchObject({ atk: 3, hp: 2, maxHp: 2 });

    const fought = mainState("green-lantern-fought");
    fought.players[0].board[0] = makeMinion("John Wick", 0);
    fought.players[1].board[0] = makeMinion("Death Star", 1, { atk: 0, hp: 10, maxHp: 10, sleeping: false });
    const equipped = playRelicFor(fought, 0, "Green Lantern Ring", 0);
    equipped.players[0].board[0]!.sleeping = false;
    const afterAttack = applyAction(
      equipped,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    const afterFight = endTurnAndDraw(afterAttack, 0);
    expect(afterFight.players[0].board[0]).toMatchObject({ atk: 1, hp: 1, maxHp: 1 });
  });

  it("replaces Sunshine Grace with Ark of the Covenant", () => {
    expect(relics.find((relic) => relic.name === "Sunshine Grace")).toBeUndefined();
    expect(relics.find((relic) => relic.name === "Ark of the Covenant")).toMatchObject({
      cost: 4,
      relicId: "ark_divine_shield",
      effect: "The bearer gains Divine Shield",
    });

    const state = mainState("ark-divine-shield");
    state.players[0].board[0] = makeMinion("John Wick", 0);
    const after = playRelicFor(state, 0, "Ark of the Covenant", 0);
    expect(after.players[0].board[0]?.divineShield).toBe(true);
  });

  it("Pandora's Box buffs its bearer and kills it at the start of its owner's next turn", () => {
    const state = mainState("pandora-box");
    state.players[0].board[0] = makeMinion("John Wick", 0);
    const afterEquip = playRelicFor(state, 0, "Pandora's Box", 0);
    expect(afterEquip.players[0].board[0]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });

    const afterOpponentTurn = endTurnAndDraw(afterEquip, 0);
    expect(afterOpponentTurn.players[0].board[0]).toMatchObject({ atk: 5, hp: 5, maxHp: 5 });
    expect(afterOpponentTurn.players[1].board.filter(Boolean)).toHaveLength(0);

    const afterOwnerNextTurn = endTurnAndDraw(afterOpponentTurn, 1);
    expect(afterOwnerNextTurn.players[0].board[0]).toBeNull();
    expect(afterOwnerNextTurn.players[1].board.filter(Boolean)).toHaveLength(0);
    expect(afterOwnerNextTurn.discard).toContain(relicByName("Pandora's Box").id);
  });

  it("The Monkey's Paw buffs its bearer and kills it on the next turn", () => {
    const state = mainState("monkeys-paw");
    state.players[0].board[0] = makeMinion("John Wick", 0);
    const afterEquip = playRelicFor(state, 0, "The Monkey's Paw", 0);
    expect(afterEquip.players[0].board[0]).toMatchObject({ atk: 6, hp: 6, maxHp: 6 });

    const result = applyAction(afterEquip, { type: "end_turn", player: 0 }, library);
    expect(result.state.players[0].board[0]).toBeNull();
    expect(result.state.discard).toContain(relicByName("The Monkey's Paw").id);
    expect(result.events).toContainEqual(expect.objectContaining({ text: expect.stringContaining("dies from The Monkey's Paw") }));
  });

  it("Necronomicon repeats the bearer's Deathrattle", () => {
    const state = mainState("necronomicon");
    state.players[0].board[0] = makeMinion("Light Yagami", 0, { relic: relicByName("Necronomicon") });
    state.players[1].board[0] = makeMinion("John Wick", 1, { atk: 99, hp: 20, maxHp: 20, sleeping: false });
    state.players[1].board[1] = makeMinion("Dragon", 1, { hp: 20, maxHp: 20, sleeping: false });
    state.players[1].board[2] = makeMinion("Modern Tank", 1, { hp: 20, maxHp: 20, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[1].board.filter(Boolean)).toHaveLength(1);
  });

  it("Dragon Balls summon a 7/7 Taunt Shenron after the bearer dies", () => {
    const state = mainState("dragon-balls");
    state.players[0].board[0] = makeMinion("John Wick", 0, { relic: relicByName("Dragon Balls") });
    state.players[1].board[0] = makeMinion("Death Star", 1, { atk: 99, hp: 99, maxHp: 99, sleeping: false });
    state.activePlayer = 1;

    const after = applyAction(
      state,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]).toMatchObject({
      cardId: "token:shenron",
      name: "Shenron",
      atk: 7,
      hp: 7,
      keywords: ["Taunt"],
    });
    expect(after.players[0].board[0]?.art).toContain("token-shenron.webp");
  });

  it("Mjolnir is Good-only and protects its attacking bearer from retaliation", () => {
    const legalState = mainState("mjolnir-targets");
    legalState.players[0].board[0] = makeMinion("John Wick", 0);
    legalState.players[0].board[1] = makeMinion("Dumbledore", 0);
    legalState.players[0].hand = [relicByName("Mjolnir").id];
    legalState.players[0].mana = 10;
    const legal = getLegalActions(legalState, library);
    expect(legal).not.toContainEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 });
    expect(legal).toContainEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 1 });

    const state = mainState("mjolnir-retaliation");
    state.players[0].board[0] = makeMinion("Dumbledore", 0);
    state.players[1].board[0] = makeMinion("John Wick", 1, { atk: 1, hp: 10, maxHp: 10, sleeping: false });
    const equipped = playRelicFor(state, 0, "Mjolnir", 0);
    const after = applyAction(
      equipped,
      { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(after.players[0].board[0]?.hp).toBe(4);
    expect(after.players[1].board[0]?.hp).toBe(8);

    const defending = mainState("mjolnir-defending");
    defending.players[0].board[0] = makeMinion("Dumbledore", 0);
    defending.players[1].board[0] = makeMinion("John Wick", 1, { atk: 1, hp: 10, maxHp: 10, sleeping: false });
    const defendingEquipped = playRelicFor(defending, 0, "Mjolnir", 0);
    const defendingHit = applyAction(
      { ...defendingEquipped, activePlayer: 1 },
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    expect(defendingHit.players[0].board[0]?.hp).toBe(3);
  });

  it("Excalibur is Good-only and gives its bearer Charge", () => {
    const legalState = mainState("excalibur-targets");
    legalState.players[0].board[0] = makeMinion("John Wick", 0);
    legalState.players[0].board[1] = makeMinion("Dumbledore", 0);
    legalState.players[0].hand = [relicByName("Excalibur").id];
    legalState.players[0].mana = 10;
    const legal = getLegalActions(legalState, library);
    expect(legal).not.toContainEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 0 });
    expect(legal).toContainEqual({ type: "play_relic", player: 0, handIndex: 0, slotIndex: 1 });

    const state = mainState("excalibur-charge");
    state.players[0].board[0] = makeMinion("Dumbledore", 0, { sleeping: true });
    const after = playRelicFor(state, 0, "Excalibur", 0);
    expect(after.players[0].board[0]?.keywords).toContain("Charge");
    expect(after.players[0].board[0]?.sleeping).toBe(false);
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

  it("all three camp attack relics protect only a defending bearer", () => {
    const cases: Array<{ relic: string; camp: Camp }> = [
      { relic: "Lostvayne", camp: "Magic" },
      { relic: "Chamber of Secrets", camp: "Nature" },
      { relic: "Cyber-Enchantment", camp: "Tech" },
    ];

    for (const { relic, camp } of cases) {
      const defending = mainState(`${relic}-defending`);
      defending.players[0].board[0] = makeMinion("Mob Psycho", 0, {
        camp,
        atk: 5,
        hp: 10,
        maxHp: 10,
        sleeping: false,
      });
      defending.players[1].board[0] = makeMinion("John Wick", 1, {
        hp: 10,
        maxHp: 10,
        relic: relicByName(relic),
        sleeping: false,
      });
      const protectedHit = applyAction(
        defending,
        { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
        library,
      ).state;
      expect(protectedHit.players[1].board[0]?.hp, `${relic} should protect while defending`).toBe(10);

      const attacking = mainState(`${relic}-attacking`);
      attacking.players[0].board[0] = makeMinion("Mob Psycho", 0, {
        camp,
        atk: 5,
        hp: 10,
        maxHp: 10,
        relic: relicByName(relic),
        sleeping: false,
      });
      attacking.players[1].board[0] = makeMinion("John Wick", 1, {
        camp,
        atk: 3,
        hp: 10,
        maxHp: 10,
        sleeping: false,
      });
      const retaliation = applyAction(
        attacking,
        { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 },
        library,
      ).state;
      expect(retaliation.players[0].board[0]?.hp, `${relic} should not block retaliation`).toBe(7);
    }
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
    expect(bearer.atk).toBe(7);
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

  it("Omnitrix transforms its bearer upward at the start of its owner's turn", () => {
    const state = mainState("omnitrix-transform");
    state.players[0].board[0] = makeMinion("Dumbledore", 0);
    const equipped = playRelicFor(state, 0, "Omnitrix", 0);
    const nextTurn = toMyNextTurn(equipped);
    const transformed = nextTurn.players[0].board[0]!;

    expect(transformed.name).not.toBe("Dumbledore");
    expect(transformed.cost).toBe(6);
    expect(transformed.relic?.name).toBe("Omnitrix");
  });

  it("Stand Arrow either transforms upward or Silences its bearer", () => {
    let transformed: GameState | undefined;
    let silenced: GameState | undefined;

    for (const seed of [1, 0x80000000]) {
      const state = mainState(`stand-arrow-${seed}`);
      state.rngSeed = seed;
      state.players[0].board[0] = makeMinion("John Wick", 0);
      const after = playRelicFor(state, 0, "Stand Arrow", 0);
      const bearer = after.players[0].board[0];
      if (bearer?.cost === 3) transformed = after;
      if (bearer?.name === "John Wick" && bearer.silenced) silenced = after;
    }

    expect(transformed).toBeDefined();
    expect(transformed?.players[0].board[0]?.relic).toBeNull();
    expect(silenced).toBeDefined();
    expect(silenced?.players[0].board[0]?.relic?.name).toBe("Stand Arrow");
  });

  it("Poké Ball returns its bearer to hand and is consumed with the equipment", () => {
    const state = mainState("poke-ball-return");
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    const bearerCard = cardId("Mob Psycho");
    const ballId = relicByName("Poké Ball").id;
    const after = playRelicFor(state, 0, "Poké Ball", 0);

    expect(after.players[0].board[0]).toBeNull();
    expect(after.players[0].hand).toContain(bearerCard);
    expect(after.discard).toContain(ballId);
  });

  it("Time Turner restores the HP recorded at the previous turn start", () => {
    const state = mainState("time-turner-rewind");
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    const equipped = playRelicFor(state, 0, "Time Turner", 0);
    equipped.players[0].board[0]!.hp = 2;

    const firstRewind = toMyNextTurn(equipped);
    expect(firstRewind.players[0].board[0]?.hp).toBe(5);
    expect(firstRewind.players[0].board[0]?.relic?.previousTurnStartHp).toBe(5);

    firstRewind.players[0].board[0]!.hp = 3;
    const secondRewind = toMyNextTurn(firstRewind);
    expect(secondRewind.players[0].board[0]?.hp).toBe(5);
  });

  it("Symbiote leaves a lethal bearer Chained at 1 HP once", () => {
    const state = mainState("symbiote-survival");
    state.players[0].board[0] = makeMinion("Mob Psycho", 0);
    const equipped = playRelicFor(state, 0, "Symbiote", 0);
    equipped.players[1].board[0] = makeMinion("Death Star", 1, { atk: 99, sleeping: false });
    equipped.activePlayer = 1;

    const after = applyAction(
      equipped,
      { type: "attack_minion", player: 1, attackerSlot: 0, targetSlot: 0 },
      library,
    ).state;
    const survivor = after.players[0].board[0];

    expect(survivor).toMatchObject({ hp: 1, chained: 2, relic: null });
    expect(after.discard).toContain(relicByName("Symbiote").id);
    expect(after.players[0].deadMinions ?? []).not.toContain(cardId("Mob Psycho"));
  });

  it("Neuralyzer removes the bearer's negative statuses", () => {
    const state = mainState("neuralyzer-cleanse");
    state.players[0].board[0] = makeMinion("Mob Psycho", 0, {
      silenced: true,
      frozen: true,
      thawPending: true,
      chained: 2,
      attackLocked: true,
      attackLockedUntilTurn: 20,
      markedBy: "enemy-source",
      markedForDeathAtTurn: 5,
    });
    const after = playRelicFor(state, 0, "Neuralyzer", 0);
    const bearer = after.players[0].board[0]!;

    expect(bearer).toMatchObject({
      silenced: false,
      frozen: false,
      thawPending: false,
      chained: 0,
      attackLocked: false,
      attackLockedUntilTurn: null,
      markedBy: null,
      markedForDeathAtTurn: null,
    });
    expect(bearer.relic?.name).toBe("Neuralyzer");
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
