import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { makeCardLibrary } from "./game";
import { chooseBotAction } from "./bot";
import { spawnTestMinion } from "./test-utils";
import { createInitialGame } from "./game";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * The bot has to answer engines, not just race.
 *
 * For most of this project's life the practice opponent attacked the core with
 * almost every swing, and its own evaluation was the reason: face damage priced
 * at about 3.6 points per ATK beat killing an equal body priced at 9.2, so a
 * 4-ATK minion "correctly" ignored a Passive minion forever. ENGINE_PREMIUM is
 * the fix, and these tests are what stop it being quietly tuned back to a
 * number that does nothing.
 *
 * Every test here is a PAIR. The engine board and the control board differ in
 * exactly one property — whether the defender's effect is live — and are
 * identical in stats, keywords, mana, hand and core health. Without the pair,
 * "the bot attacked the minion" proves nothing: it might have had no other
 * legal move, or been low on health, or been taking a lethal line.
 */
const library = makeCardLibrary(cards, relics);
const BOT: PlayerId = 1;
const HUMAN: PlayerId = 0;

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function body(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(library[cardId(name)] as never, owner, {
    keywords: [],
    divineShield: false,
    sleeping: false,
    attacksUsed: 0,
    ...overrides,
  });
}

/**
 * One board, one decision.
 *
 * The bot holds a single ready 4/4 with nothing else to do: no cards, no mana,
 * no hero power. Its only choices are the core, the one enemy minion, or
 * passing. The human core sits at 60 so no line here is anywhere near lethal,
 * which would otherwise dominate every score in the file.
 */
function oneChoice(defender: MinionInstance): GameState {
  const state = createInitialGame(cards, "bot-trading", relics);
  state.phase = "main";
  state.drawChoice = null;
  state.pendingTarget = null;
  state.heroPowerChoicePlayer = null;
  state.heroPowers = [null, null];
  state.activePlayer = BOT;

  state.players[BOT].hand = [];
  state.players[BOT].mana = 0;
  state.players[BOT].coins = 0;
  state.players[BOT].health = 60;
  state.players[BOT].board = [body("UFO", BOT, { atk: 4, hp: 4, maxHp: 4 }), null, null, null, null];

  state.players[HUMAN].hand = [];
  state.players[HUMAN].health = 60;
  state.players[HUMAN].board = [defender, null, null, null, null];

  return state;
}

/** A 2/2 that pays its owner every turn. Zoro's Passive, cut down to size. */
function engine(): MinionInstance {
  return body("Zoro", HUMAN, { atk: 2, hp: 2, maxHp: 2 });
}

/** The same 2/2, with the engine switched off and nothing else changed. */
function vanilla(): MinionInstance {
  return body("Zoro", HUMAN, { atk: 2, hp: 2, maxHp: 2, effectId: "none", effectTiming: "none" });
}

describe("the bot answers engines instead of always racing", () => {
  it("kills a Passive minion it can trade with", () => {
    const action = chooseBotAction(oneChoice(engine()), library, BOT, "normal");
    expect(action).toEqual({ type: "attack_minion", player: BOT, attackerSlot: 0, targetSlot: 0 });
  });

  it("goes face against the same body with no live effect", () => {
    const action = chooseBotAction(oneChoice(vanilla()), library, BOT, "normal");
    expect(action).toEqual({ type: "attack_core", player: BOT, attackerSlot: 0 });
  });

  it("goes face again once that engine is silenced, because it has stopped paying", () => {
    const action = chooseBotAction(oneChoice(body("Zoro", HUMAN, { atk: 2, hp: 2, maxHp: 2, silenced: true })), library, BOT, "normal");
    expect(action).toEqual({ type: "attack_core", player: BOT, attackerSlot: 0 });
  });

  it("goes face against a chained engine, which cannot be attacked and is not paying either", () => {
    const action = chooseBotAction(oneChoice(body("Zoro", HUMAN, { atk: 2, hp: 2, maxHp: 2, chained: 2 })), library, BOT, "normal");
    expect(action).toEqual({ type: "attack_core", player: BOT, attackerSlot: 0 });
  });

  it("still races when the face is worth more than the engine", () => {
    // Eight points of core beats one small Passive body, and should. The
    // premium is meant to buy trades, not to forbid the clock.
    const state = oneChoice(engine());
    state.players[BOT].board[0] = body("UFO", BOT, { atk: 8, hp: 8, maxHp: 8 });
    const action = chooseBotAction(state, library, BOT, "normal");
    expect(action).toEqual({ type: "attack_core", player: BOT, attackerSlot: 0 });
  });
});
