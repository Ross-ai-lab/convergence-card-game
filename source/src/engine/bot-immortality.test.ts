import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { createInitialGame, makeCardLibrary } from "./game";
import { chooseBotAction } from "./bot";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * Dark Immortality holds a core at 1 HP while its owner controls a minion, so
 * against it the lethal is the last minion, not the core.
 *
 * The bot used to read "reach covers core health" as lethal on every turn of
 * that fight, because a core stuck at 1 HP is always covered. Lethal therefore
 * scored the same whatever it did, and it would rather develop a body than
 * spend its removal on the one minion keeping the core alive.
 *
 * The pair below differs only in that hero power. Without it the bot simply
 * takes the lethal swing; with it, it has to clear the board first.
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
 * The human sits on 1 HP behind one plain 1/1. The bot holds a ready 4/4 and six
 * mana for either Fire Lord Ozai (2 damage to every other minion, which clears
 * the 1/1 and costs the bot's own attacker some health) or a UFO (a bigger body).
 */
function lastGuard(immortal: boolean): GameState {
  const state = createInitialGame(cards, "bot-immortality", relics);
  state.phase = "main";
  state.drawChoice = null;
  state.pendingTarget = null;
  state.mulligan = null;
  state.heroPowers = [immortal ? "voldemort_immortal" : null, null];
  state.activePlayer = BOT;

  state.players[BOT].hand = [cardId("Fire Lord Ozai"), cardId("UFO")];
  state.players[BOT].mana = 6;
  state.players[BOT].coins = 0;
  state.players[BOT].health = 30;
  state.players[BOT].board = [body("UFO", BOT, { atk: 4, hp: 4, maxHp: 4 }), null, null, null, null];

  state.players[HUMAN].hand = [];
  state.players[HUMAN].health = 1;
  state.players[HUMAN].board = [
    body("Mr. Poopybutthole", HUMAN, { atk: 1, hp: 1, maxHp: 1, effectId: "none", effectTiming: "none" }),
    null,
    null,
    null,
    null,
  ];
  return state;
}

describe("the bot knows an immortal core cannot fall while it holds a minion", () => {
  it("takes the lethal swing when the core is mortal", () => {
    const action = chooseBotAction(lastGuard(false), library, BOT, "normal");
    expect(action).toEqual({ type: "attack_core", player: BOT, attackerSlot: 0 });
  });

  it("clears the last guard first, keeping its attacker for the core", () => {
    const action = chooseBotAction(lastGuard(true), library, BOT, "normal");
    expect(action).toMatchObject({ type: "play_card", handIndex: 0 });
  });
});
