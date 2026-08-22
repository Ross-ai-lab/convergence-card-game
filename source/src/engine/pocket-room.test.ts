/**
 * Knov's pocket room, and the corruption it produced.
 *
 * The balance gate on 18 August 2026 reported one invariant breach across 23,531
 * fuzz actions: `instance <id> is on the board twice`. It was this card. A room
 * can be stored holding the SAME minion as both its friendly and its enemy side,
 * and because a minion trivially ties its own ATK, the tie branch then released
 * it into two slots at once. Reproduce the original duel with:
 *
 *   npx tsx scripts/find-duplicate-instance.mts sim-fuzz-46 random,bot
 *
 * Two guards were added and both are pinned here: the room refuses to open
 * around a single minion, and the release refuses to place an instance twice or
 * to place one that is already on a board. The second guard is the load-bearing
 * one — it makes the invariant unbreakable from this path no matter what a future
 * effect manages to store.
 */
import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "./game";
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

/** Every instance sitting on either board, so duplicates are countable. */
function boardInstances(state: GameState): string[] {
  return state.players.flatMap((player) =>
    player.board.filter((minion): minion is MinionInstance => Boolean(minion)).map((minion) => minion.instanceId),
  );
}

/**
 * Advance until every stored pocket room has been released.
 *
 * It drives whatever the engine actually offers rather than only `end_turn`: a
 * fresh duel opens in the hero-power draft, where `end_turn` is not legal yet.
 * The first version of this helper only looked for `end_turn`, found none, and
 * returned the untouched state — so two of these tests passed against an empty
 * board without ever resolving a room. Asserting the rooms drained is what
 * stops that from being green again.
 */
function releaseRooms(state: GameState): GameState {
  let next = state;
  for (let step = 0; step < 400; step += 1) {
    if ((next.pocketRooms ?? []).length === 0 && step > 0) return next;
    const legal = getLegalActions(next, library);
    if (legal.length === 0) break;
    if (next.phase === "mulligan") {
      next = applyAction(next, { type: "confirm_mulligan", player: next.mulligan?.player ?? 0 }, library).state;
      continue;
    }
    const end = legal.find((action) => action.type === "end_turn");
    next = applyAction(next, end ?? legal[0], library).state;
  }
  if ((next.pocketRooms ?? []).length !== 0) {
    throw new Error("the pocket room never resolved — this test would pass vacuously");
  }
  return next;
}

describe("the pocket room cannot duplicate a minion", () => {
  it("releases a single-minion room only once, and never onto two slots", () => {
    // The corrupt state written directly, because the point is that the RELEASE
    // is safe even when something upstream stored nonsense. Both sides are one
    // instance, which is exactly what the fuzz duel produced.
    const state = createInitialGame(cards, "pocket-dup", relics);
    const trapped = makeMinion("Knov", 1);
    state.pocketRooms = [{
      owner: 0,
      friendly: trapped,
      friendlySlot: 1,
      enemy: trapped,
      enemySlot: 1,
      returnAtTurn: state.turnNumber + 1,
    }];

    const after = releaseRooms(state);
    const live = boardInstances(after).filter((id) => id === trapped.instanceId);
    expect(live.length).toBeLessThanOrEqual(1);
    expect(new Set(boardInstances(after)).size).toBe(boardInstances(after).length);
  });

  it("never returns a minion that is already on the board", () => {
    // The other half of the same bug class: a room holding a minion that some
    // other effect already put back. Placing it again would duplicate it.
    const state = createInitialGame(cards, "pocket-live", relics);
    const stored = makeMinion("Knov", 1);
    state.players[1].board[0] = stored;
    state.pocketRooms = [{
      owner: 0,
      friendly: stored,
      friendlySlot: 2,
      enemy: makeMinion("Big Mom", 0),
      enemySlot: 3,
      returnAtTurn: state.turnNumber + 1,
    }];

    const after = releaseRooms(state);
    const ids = boardInstances(after);
    expect(ids.filter((id) => id === stored.instanceId).length).toBe(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still returns the higher-ATK minion of a legitimate room", () => {
    // The guards must not have retired the card. A real room holds two different
    // minions and gives back the stronger one.
    const state = createInitialGame(cards, "pocket-ok", relics);
    const weak = makeMinion("Knov", 0, { atk: 1 });
    const strong = makeMinion("Big Mom", 1, { atk: 9 });
    state.pocketRooms = [{
      owner: 0,
      friendly: weak,
      friendlySlot: 0,
      enemy: strong,
      enemySlot: 1,
      returnAtTurn: state.turnNumber + 1,
    }];

    const after = releaseRooms(state);
    const ids = boardInstances(after);
    expect(ids).toContain(strong.instanceId);
    expect(ids).not.toContain(weak.instanceId);
  });

  it("returns both minions of a legitimate room on an ATK tie", () => {
    // The tie branch is intended behaviour and must survive the dedupe: two
    // DIFFERENT minions of equal ATK both come back.
    const state = createInitialGame(cards, "pocket-tie", relics);
    const mine = makeMinion("Knov", 0, { atk: 4 });
    const theirs = makeMinion("Big Mom", 1, { atk: 4 });
    state.pocketRooms = [{
      owner: 0,
      friendly: mine,
      friendlySlot: 0,
      enemy: theirs,
      enemySlot: 1,
      returnAtTurn: state.turnNumber + 1,
    }];

    const after = releaseRooms(state);
    const ids = boardInstances(after);
    expect(ids).toContain(mine.instanceId);
    expect(ids).toContain(theirs.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
