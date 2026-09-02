/**
 * Does the bot actually go for the engine?
 *
 * Reported from play on 2 September 2026: "it killed my Knight with no passive
 * and left two cards benefiting me like crazy". The valuation carries a large
 * `ENGINE_PREMIUM`, so the question is not whether the number exists — it is
 * whether the number wins when a kill is genuinely available on either target.
 *
 * These are behaviour tests on a hand-built board, not balance measurements: a
 * board with exactly two legal victims and one attacker, asked once.
 */
import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { chooseBotAction } from "./bot";
import { createInitialGame, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

const library = makeCardLibrary(cards, relics);
const BOT: PlayerId = 1;

function minion(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return spawnTestMinion(card, owner, overrides);
}

/** The bot on move, its hand emptied so the only decision left is the swing. */
function board(seed: string): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.mulligan = null;
  state.activePlayer = BOT;
  state.players[BOT] = { ...state.players[BOT], hand: [], mana: 0 };
  return state;
}

describe("the bot answers engines before bodies", () => {
  it("kills the Passive minion rather than the equal vanilla body", () => {
    const state = board("engine-vs-vanilla");
    // Same stats on both, both killable in one swing, so the ONLY difference
    // the bot can be reacting to is the standing rule.
    state.players[0].board[0] = minion("Zoro", 0, { effectId: "none", effectTiming: "none", keywords: [], atk: 1, hp: 2, maxHp: 2 });
    state.players[0].board[1] = minion("John Wick", 0, { atk: 1, hp: 2, maxHp: 2 });
    state.players[BOT].board[0] = minion("Modern Tank", BOT, { atk: 6, hp: 9, maxHp: 9, sleeping: false });

    const action = chooseBotAction(state, library, BOT, "normal");
    expect(action).toMatchObject({ type: "attack_minion", targetSlot: 1 });
  });

  it("prefers the engine even when the vanilla body is the bigger one", () => {
    const state = board("engine-vs-bigger-vanilla");
    state.players[0].board[0] = minion("Zoro", 0, { effectId: "none", effectTiming: "none", keywords: [], atk: 4, hp: 3, maxHp: 3 });
    state.players[0].board[1] = minion("John Wick", 0, { atk: 1, hp: 3, maxHp: 3 });
    state.players[BOT].board[0] = minion("Modern Tank", BOT, { atk: 6, hp: 20, maxHp: 20, sleeping: false });

    const action = chooseBotAction(state, library, BOT, "normal");
    expect(action).toMatchObject({ type: "attack_minion", targetSlot: 1 });
  });

  it("prefers killing an engine to hitting the core", () => {
    const state = board("engine-vs-core");
    state.players[0].board[0] = minion("John Wick", 0, { atk: 1, hp: 2, maxHp: 2 });
    state.players[BOT].board[0] = minion("Modern Tank", BOT, { atk: 4, hp: 9, maxHp: 9, sleeping: false });

    const action = chooseBotAction(state, library, BOT, "normal");
    expect(action).toMatchObject({ type: "attack_minion", targetSlot: 0 });
  });

  it("does not chase an engine it cannot kill when a real kill is on offer", () => {
    // The counterweight. Swinging into a body that survives is a trade the bot
    // loses, and "prioritise engines" must not become "walk into the big one".
    const state = board("engine-out-of-reach");
    state.players[0].board[0] = minion("John Wick", 0, { atk: 6, hp: 20, maxHp: 20 });
    state.players[0].board[1] = minion("Zoro", 0, { effectId: "none", effectTiming: "none", keywords: [], atk: 1, hp: 2, maxHp: 2 });
    state.players[BOT].board[0] = minion("Modern Tank", BOT, { atk: 4, hp: 5, maxHp: 5, sleeping: false });

    const action = chooseBotAction(state, library, BOT, "normal");
    // The claim is only that it does not walk into the body it cannot kill.
    // Racing the core here is a legitimate answer and the test must not forbid
    // it — "prioritise engines" is not "suicide into the big one".
    expect(action).not.toMatchObject({ type: "attack_minion", targetSlot: 0 });
  });
});
