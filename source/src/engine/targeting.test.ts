import { describe, expect, it } from "vitest";
import { cards } from "../data/cards";
import { chooseBotAction } from "./bot";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
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

/** A stat-only body, immune to whatever effect its card may gain later. */
function dummy(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return makeMinion(name, owner, { effectId: "none", effectTiming: "none", keywords: [], ...overrides });
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

function mainState(seed = "targeting-tests"): GameState {
  const state = createInitialGame(cards, seed);
  state.phase = "main";
  state.drawChoice = null;
  state.activePlayer = 0;
  return state;
}

function choose(state: GameState, choiceIndex: number): GameState {
  const pending = state.pendingTarget;
  if (!pending) throw new Error("Expected a pending target");
  return applyAction(state, { type: "choose_target", player: pending.player, choiceIndex }, library).state;
}

function protectFriendlySlotWithNeo(state: GameState, slot: number): GameState {
  const asking = playCardFor(state, 1, "Neo", 4);
  const choiceIndex = asking.pendingTarget?.options.findIndex((option) => option.owner === 1 && option.slot === slot) ?? -1;
  expect(choiceIndex).toBeGreaterThanOrEqual(0);
  return applyAction(asking, { type: "choose_target", player: 1, choiceIndex }, library).state;
}

/** Ongoing effects fire at the start of the owner's turn, so get back round to it. */
function endTurnAndDraw(state: GameState, player: PlayerId): GameState {
  let next = applyAction(state, { type: "end_turn", player }, library).state;
  if (next.phase === "drawChoice" && next.drawChoice) {
    next = applyAction(next, { type: "choose_draw", player: next.drawChoice.player, choiceIndex: 0 }, library).state;
  }
  return next;
}
const toMyNextTurn = (state: GameState): GameState => endTurnAndDraw(endTurnAndDraw(state, 0), 1);

describe("targeted effects", () => {
  it("cancels a fresh target-card play back to hand and refunds its mana", () => {
    const state = mainState("cancel-target-play");
    const cecilId = cardId("Cecil");
    state.players[0].hand = [cecilId];
    state.players[0].mana = 5;
    state.players[0].board[1] = dummy("John Wick", 0);
    state.players[0].board[2] = dummy("Zoro", 0);

    const asking = applyAction(state, { type: "play_card", player: 0, handIndex: 0, slotIndex: 0 }, library).state;
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.cancelPlay?.cardId).toBe(cecilId);
    expect(getLegalActions(asking, library)).toContainEqual({ type: "cancel_target", player: 0 });

    const cancelled = applyAction(asking, { type: "cancel_target", player: 0 }, library).state;
    expect(cancelled.phase).toBe("main");
    expect(cancelled.pendingTarget).toBeNull();
    expect(cancelled.players[0].board[0]).toBeNull();
    expect(cancelled.players[0].board[1]?.name).toBe("John Wick");
    expect(cancelled.players[0].board[2]?.name).toBe("Zoro");
    expect(cancelled.players[0].hand).toEqual([cecilId]);
    expect(cancelled.players[0].mana).toBe(5);
  });

  it("Neo blocks targeted silence and freeze without blocking damage", () => {
    const state = protectFriendlySlotWithNeo(mainState("neo-targeting"), 1);
    state.players[1].board[1] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const freezePrompt = playCardFor(state, 0, "Kiritsugu Emiya", 0);
    expect(freezePrompt.pendingTarget?.options.some((option) => option.slot === 1)).toBe(false);
    expect(freezePrompt.players[1].board[1]?.frozen).toBe(false);

    const silencePrompt = playCardFor(state, 0, "Aizawa", 0);
    expect(silencePrompt.pendingTarget?.options.some((option) => option.slot === 1)).toBe(false);
    expect(silencePrompt.players[1].board[1]?.silenced).toBe(false);
  });

  it("Neo also blocks Chained effects while leaving ordinary removal targetable", () => {
    const state = protectFriendlySlotWithNeo(mainState("neo-chain"), 1);
    state.players[1].board[1] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const chainPrompt = playCardFor(state, 0, "Darth Vader", 0);
    expect(chainPrompt.pendingTarget?.options.some((option) => option.slot === 1)).toBe(false);
    expect(chainPrompt.pendingTarget?.options.every((option) => option.slot !== 1)).toBe(true);

    const damaged = protectFriendlySlotWithNeo(mainState("neo-removal"), 1);
    damaged.players[1].board[1] = dummy("John Wick", 1, { hp: 2, maxHp: 3 });
    const removed = playCardFor(damaged, 0, "Musashi", 0);
    expect(removed.players[1].board[1]).toBeNull();
  });

  it("lets combat kill a minion inside Neo's protected slot", () => {
    const state = protectFriendlySlotWithNeo(mainState("neo-combat"), 1);
    state.activePlayer = 0;
    state.players[0].board[0] = dummy("Zoro", 0, { atk: 5 });
    state.players[1].board[1] = dummy("John Wick", 1, { hp: 3, maxHp: 3 });

    const after = applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 1 }, library).state;
    expect(after.players[1].board[1]).toBeNull();
  });

  it("keeps Chained minions out of attack and targeted-effect choices", () => {
    const state = mainState("chained-untargetable");
    state.players[0].board[0] = dummy("Zoro", 0, { sleeping: false });
    state.players[1].board[0] = dummy("John Wick", 1, { chained: 2 });
    state.players[1].board[1] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const attacks = getLegalActions(state, library).filter((action) => action.type === "attack_minion");
    expect(attacks.some((action) => action.targetSlot === 0)).toBe(false);
    expect(attacks.some((action) => action.targetSlot === 1)).toBe(true);

    const asking = playCardFor(state, 0, "Kiritsugu Emiya", 1);
    expect(asking.pendingTarget?.options).toEqual([
      { owner: 1, slot: 1 },
      { owner: 1, slot: 2 },
    ]);
  });

  it("stops and asks when more than one enemy is legal", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 1); // Battlecry: freeze an enemy
    expect(after.phase).toBe("targeting");
    expect(after.pendingTarget?.sourceName).toBe("Kiritsugu Emiya");
    expect(after.pendingTarget?.player).toBe(0);
    expect(after.pendingTarget?.options).toEqual([
      { owner: 1, slot: 0 },
      { owner: 1, slot: 2 },
    ]);
    // Nothing has happened to either enemy yet.
    expect(after.players[1].board[0]?.frozen).toBe(false);
    expect(after.players[1].board[2]?.frozen).toBe(false);
    // The choices plus the explicit play-to-hand escape are the only legal moves.
    const legal = getLegalActions(after, library);
    expect(legal.filter((action) => action.type !== "cancel_target").every((action) => action.type === "choose_target")).toBe(true);
    expect(legal).toContainEqual({ type: "cancel_target", player: 0 });
  });

  it("hits the minion the player named, not the leftmost one", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const asking = playCardFor(state, 0, "Kiritsugu Emiya", 1);
    const chosen = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: 1 }, library).state;

    expect(chosen.phase).toBe("main");
    expect(chosen.pendingTarget).toBeNull();
    expect(chosen.players[1].board[2]?.frozen).toBe(true);
    expect(chosen.players[1].board[0]?.frozen).toBe(false); // the old engine always hit this one
  });

  it("Batman chooses a gadget for the enemy minion", () => {
    const freezeState = mainState("batman-freeze");
    freezeState.players[1].board[0] = dummy("John Wick", 1);
    const freezePrompt = playCardFor(freezeState, 0, "Batman", 1);
    expect(freezePrompt.pendingTarget?.kind).toBe("option");
    expect(freezePrompt.pendingTarget?.labelOptions.map((option) => option.value)).toEqual(["freeze", "silence", "weaken"]);
    const frozen = choose(freezePrompt, 0);
    expect(frozen.players[1].board[0]?.frozen).toBe(true);

    const silenceState = mainState("batman-silence");
    silenceState.players[1].board[0] = dummy("John Wick", 1);
    const silenced = choose(playCardFor(silenceState, 0, "Batman", 1), 1);
    expect(silenced.players[1].board[0]?.silenced).toBe(true);

    const weakenState = mainState("batman-weaken");
    weakenState.players[1].board[0] = dummy("John Wick", 1, { atk: 5 });
    const weakened = choose(playCardFor(weakenState, 0, "Batman", 1), 2);
    expect(weakened.players[1].board[0]?.atk).toBe(2);
  });

  it("does not offer a refund after a multi-step effect accepts its first target", () => {
    const state = mainState("batman-cancel-boundary");
    state.players[1].board[0] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);

    const victimPrompt = playCardFor(state, 0, "Batman", 1);
    expect(victimPrompt.pendingTarget?.cancelPlay?.cardId).toBe(cardId("Batman"));

    const gadgetPrompt = choose(victimPrompt, 0);
    expect(gadgetPrompt.phase).toBe("targeting");
    expect(gadgetPrompt.pendingTarget?.kind).toBe("option");
    expect(gadgetPrompt.pendingTarget?.cancelPlay).toBeUndefined();
    expect(getLegalActions(gadgetPrompt, library)).not.toContainEqual({ type: "cancel_target", player: 0 });
    expect(gadgetPrompt.players[1].board[0]?.frozen).toBe(false);
  });

  it("Musashi kills all damaged enemy minions", () => {
    const state = mainState();
    state.players[1].board[0] = dummy("John Wick", 1, { hp: 1, maxHp: 2 });
    state.players[1].board[3] = dummy("Zoro", 1, { hp: 2, maxHp: 3 });

    const after = playCardFor(state, 0, "Musashi", 1);
    expect(after.pendingTarget).toBeNull();
    expect(after.players[1].board[0]).toBeNull();
    expect(after.players[1].board[3]).toBeNull();
  });

  it("Darth Vader asks for a target and chains the minion the player names", () => {
    const state = mainState("vader-targeting");
    state.players[1].board[0] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Zoro", 1);
    const asking = playCardFor(state, 0, "Darth Vader", 1);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.options).toEqual([
      { owner: 1, slot: 0 },
      { owner: 1, slot: 2 },
    ]);
    const chosen = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: 1 }, library).state;
    expect(chosen.players[1].board[2]?.atk).toBe(1);
    expect(chosen.players[1].board[2]?.chained).toBe(2);
    expect(chosen.players[1].board[0]?.chained).toBe(0);
  });

  it("resolves silently when only one target is legal", () => {
    const state = mainState();
    state.players[1].board[3] = dummy("John Wick", 1);

    const after = playCardFor(state, 0, "Kiritsugu Emiya", 1);
    expect(after.phase).toBe("main");
    expect(after.pendingTarget).toBeNull();
    expect(after.players[1].board[3]?.frozen).toBe(true);
  });

  it("fizzles without asking when nothing is legal", () => {
    const state = mainState();
    state.players[1].board[0] = makeMinion("Hypnos", 1, { atk: 0 });

    const after = playCardFor(state, 0, "Stain", 1); // destroy_damaged_enemy needs a damaged enemy
    expect(after.phase).toBe("main");
    expect(after.pendingTarget).toBeNull();
  });

  it("only offers friendly minions to a friendly-side effect", () => {
    const state = mainState();
    state.players[0].board[1] = dummy("John Wick", 0);
    state.players[0].board[2] = dummy("Zoro", 0);
    state.players[1].board[0] = dummy("John Wick", 1);

    const after = playCardFor(state, 0, "Knov", 0); // Battlecry: choose a friendly minion for the pocket room
    expect(after.pendingTarget?.options.every((option) => option.owner === 0)).toBe(true);
    // The source is excluded from its own pocket-room choice.
    expect(after.pendingTarget?.options).toEqual([
      { owner: 0, slot: 1 },
      { owner: 0, slot: 2 },
    ]);
  });

  it("holds the rest of the turn's ongoing effects behind the prompt", () => {
    const state = mainState();
    state.players[0].board[0] = makeMinion("Gyoro Gyoro", 0, { playOrder: 1 }); // ongoing + targeted: asks first
    state.players[0].board[1] = makeMinion("Carnage Kabuto", 0, { playOrder: 2 }); // ongoing self-buff, no prompt
    state.players[0].board[2] = dummy("Zoro", 0, { alignment: "Evil" });
    state.players[0].board[3] = dummy("John Wick", 0, { alignment: "Evil" });

    const asking = toMyNextTurn(state);
    expect(asking.phase).toBe("targeting");
    expect(asking.players[0].board[1]?.atk).toBe(3); // Carnage has NOT fired yet

    const zoroIndex = asking.pendingTarget!.options.findIndex((option) => option.slot === 2);
    const resumed = applyAction(asking, { type: "choose_target", player: 0, choiceIndex: zoroIndex }, library).state;
    expect(resumed.phase).toBe("main");
    expect(resumed.players[0].board[2]?.atk).toBe(6); // Zoro took the +2/+2
    expect(resumed.players[0].board[1]?.atk).toBe(6); // and Carnage's own +3 landed after it
    expect(resumed.effectQueue).toHaveLength(0);
  });
});

describe("seeded randomness", () => {
  function rollWith(seed: string): number {
    const state = mainState(seed);
    // dice_buff. The die is a d6 but Kite pays out ceil(d6/2), so what is visible
    // through this card is 1-3, not 1-6 — the balance pass halved it.
    const kiteCard = cards.find((card) => card.name === "Kite")!;
    state.players[0].board[0] = makeMinion("Kite", 0);
    const after = toMyNextTurn(state);
    const kite = after.players[0].board[0];
    return (kite?.atk ?? 0) - kiteCard.atk;
  }

  it("is reproducible from the same seed", () => {
    expect(rollWith("same-seed")).toBe(rollWith("same-seed"));
  });

  it("spreads across seeds instead of following a turn-counter pattern", () => {
    // The old implementation was (turnNumber + playOrder) % 6 + 1, which returns a
    // single fixed value for a fixed board. This asserts real spread, measured two
    // ways so that retuning a card's payout can never quietly disarm it: the
    // generator's own state must vary widely, and the visible payout must vary at
    // all across the range the card actually pays.
    const payouts = new Set<number>();
    const seeds = new Set<number>();
    for (let index = 0; index < 60; index += 1) {
      payouts.add(rollWith(`seed-${index}`));
      seeds.add(toMyNextTurn(mainState(`seed-${index}`)).rngSeed);
    }
    for (const roll of payouts) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(3);
    }
    expect(payouts.size).toBe(3);
    expect(seeds.size).toBeGreaterThan(40);
  });

  it("advances the seed, so a re-roll from a later state differs", () => {
    const state = mainState("advance");
    state.players[0].board[0] = makeMinion("Kite", 0);
    const first = toMyNextTurn(state);
    const second = toMyNextTurn(first);
    expect(second.rngSeed).not.toBe(first.rngSeed);
  });
});

describe("practice bot", () => {
  it("stays silent when it is not its turn", () => {
    const state = mainState();
    expect(chooseBotAction(state, library, 1)).toBeNull();
  });

  it("only ever returns a move the engine already called legal", () => {
    let state = mainState();
    state.activePlayer = 1;
    let moves = 0;
    for (let step = 0; step < 40 && state.phase !== "gameOver"; step += 1) {
      const action = chooseBotAction(state, library, 1);
      if (!action) break;
      moves += 1;
      const legal = getLegalActions(state, library);
      expect(legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))).toBe(true);
      state = applyAction(state, action, library).state;
    }
    expect(moves).toBeGreaterThan(0);
  });

  it("develops its board rather than passing the turn away", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[1].mana = 10;
    state.players[1].maxMana = 10;
    const action = chooseBotAction(state, library, 1);
    expect(action?.type).toBe("play_card");
  });

  it("takes a lethal swing at an open core", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[1].hand = [];
    state.players[1].mana = 0;
    state.players[1].board[0] = dummy("Zoro", 1, { atk: 9 });
    state.players[0].health = 4;
    state.players[0].board = [null, null, null, null, null];
    const action = chooseBotAction(state, library, 1);
    expect(action?.type).toBe("attack_core");
  });

  it("answers its own targeting prompts", () => {
    const state = mainState();
    state.activePlayer = 1;
    state.players[0].board[0] = dummy("John Wick", 0);
    state.players[0].board[2] = dummy("Zoro", 0);

    const asking = playCardFor(state, 1, "Kiritsugu Emiya", 1);
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.player).toBe(1);
    const action = chooseBotAction(asking, library, 1);
    expect(action?.type).toBe("choose_target");
  });
});

/**
 * All for One is the only card that answers a targeting prompt with a choice it
 * built itself instead of one a player named. That handoff bypasses the borrowed
 * effect's own target rules, and the choice it builds always names an ENEMY
 * minion — so before this was fixed, copying a friendly-targeting effect fired
 * it on the opponent's board.
 *
 * Each test here plants a specific borrowed effect on the single enemy minion,
 * which keeps All for One's own prompt forced and the assertion about one thing.
 */
describe("All for One aims a copied effect legally", () => {
  /** Board with exactly one enemy minion, wearing the effect to be copied. */
  function boardWithVictim(seed: string, effectId: MinionInstance["effectId"]): GameState {
    const state = mainState(seed);
    state.players[1].board[0] = dummy("Zoro", 1, { effectId, effectTiming: "onPlay", hp: 1, maxHp: 5 });
    state.players[0].board[3] = dummy("John Wick", 0, { hp: 2, maxHp: 6 });
    return state;
  }

  it("aims a copied friendly power at its OWN board, never at the enemy it copied", () => {
    const state = boardWithVictim("afo-heal", "heal_ally_full");

    const asking = playCardFor(state, 0, "All for One", 0);

    // The victim is an enemy, so it is not a legal target for "fully heal a
    // FRIENDLY minion" and is never handed over. The copy asks for its own
    // target instead, and every option offered belongs to the copier.
    expect(asking.phase).toBe("targeting");
    expect(asking.pendingTarget?.options.length).toBeGreaterThan(0);
    expect(asking.pendingTarget?.options.every((option) => option.owner === 0)).toBe(true);
    expect(asking.players[1].board[0]?.hp).toBe(1);

    const mine = asking.pendingTarget!.options.findIndex((option) => option.owner === 0 && option.slot === 3);
    expect(mine).toBeGreaterThanOrEqual(0);
    const after = choose(asking, mine);

    expect(after.players[0].board[3]?.hp).toBe(6); // our own minion, fully healed
    expect(after.players[1].board[0]?.hp).toBe(1); // theirs, untouched
    // And All for One takes its own effect back once the copy has finished.
    expect(after.players[0].board[0]?.effectId).toBe("copy_and_trigger");
    expect(after.players[0].board[0]?.copyRestoreEffectId ?? null).toBeNull();
  });

  it("gives Knov's pocket room a friendly pick from its own side", () => {
    const state = boardWithVictim("afo-pocket", "knov_pocket_room");
    const mine = state.players[0].board[3]!.instanceId;
    const theirs = state.players[1].board[0]!.instanceId;

    const after = playCardFor(state, 0, "All for One", 0);

    // Both picks are forced here, so the room opens with no prompt. WHICH two
    // minions it took is the whole point: before this was fixed the enemy victim
    // arrived as the "friendly" pick, the room closed around one minion, and the
    // release put that single instance into two slots.
    expect(after.pocketRooms).toHaveLength(1);
    const room = after.pocketRooms![0];
    expect(room.friendly.instanceId).toBe(mine);
    expect(room.enemy.instanceId).toBe(theirs);
    expect(room.friendly.owner).toBe(0);
    expect(room.enemy.owner).toBe(1);
  });

  it("carries a copied effect across its own prompts instead of dropping it", () => {
    // Ten Commandments freezes TWO enemies, so a copy of it has to survive the
    // question between them. The borrowed effect used to be handed back the
    // instant the first prompt opened, which silently cancelled the whole copy.
    const state = mainState("afo-multistep");
    state.players[1].board[0] = dummy("Zoro", 1, { effectId: "freeze_two", effectTiming: "onPlay" });
    state.players[1].board[1] = dummy("John Wick", 1);
    state.players[1].board[2] = dummy("Sonic", 1);

    const asking = playCardFor(state, 0, "All for One", 0);
    expect(asking.phase).toBe("targeting");
    const after = choose(asking, 0);

    const frozen = after.players[1].board.filter((minion) => minion?.frozen).length;
    expect(frozen).toBe(2);
    expect(after.players[0].board[0]?.effectId).toBe("copy_and_trigger");
  });

  it("still fires a copied enemy-targeting effect on the minion it copied", () => {
    const state = boardWithVictim("afo-legal", "set_attack_1");
    const victimAtk = state.players[1].board[0]!.atk;
    expect(victimAtk).toBeGreaterThan(1);

    const after = playCardFor(state, 0, "All for One", 0);

    // The guard must not cost the card its normal use: an enemy victim IS a
    // legal target for an enemy-targeting effect, so the copy resolves as before.
    expect(after.players[1].board[0]?.atk).toBe(1);
  });
});
