/**
 * The damage tally behind the game-over MVP card.
 *
 * The screen it feeds names ONE card as the reason a duel was won, so the
 * failure mode that matters is not a crash — it is a plausible-looking wrong
 * name, which nobody can tell is wrong by looking at it. These pin the three
 * ways it could quietly lie: crediting a blow that never landed, forgetting a
 * minion once it dies, and crediting damage to the player who received it.
 */
import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, duelMvp, makeCardLibrary } from "./game";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

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

function freshGame(): GameState {
  return createInitialGame(cards, "mvp-seed", relics);
}

describe("the duel MVP", () => {
  it("names nobody when nothing has landed", () => {
    // A real result: a duel decided by fatigue has no card to put on a screen,
    // and inventing one would be worse than showing none.
    expect(duelMvp(freshGame(), 0)).toBeNull();
  });

  it("ranks by damage and keeps a dead minion in the running", () => {
    const state = freshGame();
    state.damageTally = {
      a: { instanceId: "a", cardId: "c001", name: "Alpha", art: "/a.webp", owner: 0, damage: 12 },
      b: { instanceId: "b", cardId: "c002", name: "Beta", art: "/b.webp", owner: 0, damage: 19 },
      c: { instanceId: "c", cardId: "c003", name: "Gamma", art: "/c.webp", owner: 1, damage: 40 },
    };
    // Beta wins even though nothing named here is on a board: the tally
    // deliberately outlives the body, because the minion that won a duel is
    // routinely the one that died doing it.
    expect(duelMvp(state, 0)?.name).toBe("Beta");
    // And the loser's biggest hitter is never the winner's champion.
    expect(duelMvp(state, 1)?.name).toBe("Gamma");
  });

  it("breaks a tie the same way every time it is asked", () => {
    const state = freshGame();
    state.damageTally = {
      t9: { instanceId: "t9", cardId: "c001", name: "Late", art: "", owner: 0, damage: 7 },
      t2: { instanceId: "t2", cardId: "c002", name: "Early", art: "", owner: 0, damage: 7 },
    };
    expect(duelMvp(state, 0)?.name).toBe("Early");
    expect(duelMvp(state, 0)?.name).toBe("Early");
  });

  it("credits the attacker, not the victim, and only for damage that lands", () => {
    const state = freshGame();
    state.phase = "main";
    state.mulligan = null;
    state.activePlayer = 0;
    const striker = makeMinion("John Wick", 0, { sleeping: false, atk: 3, hp: 20, maxHp: 20 });
    const shielded = makeMinion("John Wick", 1, { atk: 2, hp: 20, maxHp: 20, divineShield: true });
    state.players[0].board[0] = striker;
    state.players[1].board[0] = shielded;

    // Swing one is eaten by the Divine Shield, so the attacker must be credited
    // with nothing at all: a blow that was refused is not damage dealt.
    let next = swing(state);
    expect(next.damageTally?.[striker.instanceId]).toBeUndefined();

    // The defender still retaliated through its own shield, though: a shield
    // stops damage coming IN, not the return blow going out. So the victim is
    // already credited with 2 while the attacker has nothing.
    expect(next.damageTally?.[shielded.instanceId]?.damage).toBe(2);

    // Swing two lands. Combat here is simultaneous, so the defender's return
    // blow is its own credit and must never be added to the attacker's.
    next = swing(next);
    expect(next.damageTally?.[striker.instanceId]?.damage).toBe(3);
    expect(next.damageTally?.[striker.instanceId]?.owner).toBe(0);
    expect(next.damageTally?.[shielded.instanceId]?.damage).toBe(4);
    expect(next.damageTally?.[shielded.instanceId]?.owner).toBe(1);
  });
});

/** One attack from slot 0 into slot 0, through the engine's own action path. */
function swing(state: GameState): GameState {
  const attacker = state.players[0].board[0];
  if (attacker) attacker.attacksUsed = 0;
  return applyAction(state, { type: "attack_minion", player: 0, attackerSlot: 0, targetSlot: 0 }, library).state;
}
