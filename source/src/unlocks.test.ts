import { describe, expect, it } from "vitest";

import { cards, relics } from "./data/cards";
import { emptyProgress, recordDuel, type DuelResult } from "./progress";
import {
  STARTING_POOL,
  balancedOrder,
  ensureUnlockOrder,
  newlyUnlocked,
  reconcileOrder,
  unlockReward,
  unlockedPool,
} from "./unlocks";
import type { PlayableCard } from "./engine/types";

const roster: PlayableCard[] = [...cards, ...relics];

function costOf(card: PlayableCard): number {
  return Math.max(0, Math.min(10, Math.round(card.cost ?? 0)));
}

describe("the unlock order", () => {
  it("is the whole roster, once each", () => {
    const order = balancedOrder(roster, "seed-a");
    expect(order).toHaveLength(roster.length);
    expect(new Set(order).size).toBe(roster.length);
    // Not a filter, not a sample: every printed card is reachable.
    for (const card of roster) expect(order).toContain(card.id);
  });

  it("keeps the mana curve in proportion at EVERY size, not just at the end", () => {
    // The thing this feature could quietly get wrong. A plain shuffle passes the
    // "all cards eventually" test above and still hands out a 50-card pool with
    // one 1-cost card in it, which is a pool you cannot open a turn with.
    //
    // The bounds are MEASURED, not chosen. Across 400 seeds and every pool size
    // this roster drifts at most 0.87 of a card on the minion curve and 1.34 on
    // the combined one, so the assertions sit just above those. The combined
    // figure is looser because relics carry their own printed costs and are
    // balanced as a separate lane; the single-pass version that treated them as
    // one more cost bucket drifted 3.99, which is what these numbers guard.
    const minionCosts = new Array(11).fill(0);
    const combinedCosts = new Array(11).fill(0);
    let minionTotal = 0;
    for (const card of roster) {
      combinedCosts[costOf(card)] += 1;
      if (card.kind !== "relic") {
        minionCosts[costOf(card)] += 1;
        minionTotal += 1;
      }
    }

    for (const seed of ["seed-b", "seed-c", "seed-d"]) {
      const order = balancedOrder(roster, seed);
      const byId = new Map(roster.map((card) => [card.id, card]));
      const runMinion = new Array(11).fill(0);
      const runCombined = new Array(11).fill(0);
      let minionSeen = 0;
      for (let size = 1; size <= order.length; size += 1) {
        const card = byId.get(order[size - 1]);
        if (!card) continue;
        runCombined[costOf(card)] += 1;
        if (card.kind !== "relic") {
          runMinion[costOf(card)] += 1;
          minionSeen += 1;
        }
        if (size < STARTING_POOL) continue;
        for (let cost = 0; cost <= 10; cost += 1) {
          expect(Math.abs(runMinion[cost] - (minionCosts[cost] / minionTotal) * minionSeen)).toBeLessThan(1);
          expect(Math.abs(runCombined[cost] - (combinedCosts[cost] / roster.length) * size)).toBeLessThan(1.5);
        }
      }
    }
  });

  it("keeps the relic share in proportion at every size", () => {
    const order = balancedOrder(roster, "seed-c");
    const relicIds = new Set(relics.map((relic) => relic.id));
    const share = relics.length / roster.length;
    let seen = 0;
    for (let size = 1; size <= order.length; size += 1) {
      if (relicIds.has(order[size - 1])) seen += 1;
      if (size < STARTING_POOL) continue;
      expect(Math.abs(seen - share * size)).toBeLessThanOrEqual(1);
    }
  });

  it("gives different seeds different orders", () => {
    expect(balancedOrder(roster, "seed-a")).not.toEqual(balancedOrder(roster, "seed-b"));
  });

  it("is stable for one seed, so a reload cannot reshuffle a collection", () => {
    expect(balancedOrder(roster, "seed-a")).toEqual(balancedOrder(roster, "seed-a"));
  });
});

describe("reconciling an order with a changed roster", () => {
  it("leaves an unchanged roster alone", () => {
    const order = balancedOrder(roster, "seed-a");
    expect(reconcileOrder(order, roster, "patch")).toEqual(order);
  });

  it("appends a new card behind everything already unlocked", () => {
    const trimmed = roster.slice(0, roster.length - 1);
    const order = balancedOrder(trimmed, "seed-a");
    const patched = reconcileOrder(order, roster, "patch");
    expect(patched).toHaveLength(roster.length);
    // The prefix is untouched, which is the guarantee that matters: adding a
    // card to the game must never take one away from a player.
    expect(patched.slice(0, order.length)).toEqual(order);
    expect(patched[patched.length - 1]).toBe(roster[roster.length - 1].id);
  });

  it("drops a card that no longer exists", () => {
    const order = balancedOrder(roster, "seed-a");
    const smaller = roster.filter((card) => card.id !== order[3]);
    const patched = reconcileOrder(order, smaller, "patch");
    expect(patched).not.toContain(order[3]);
    expect(patched).toHaveLength(smaller.length);
  });
});

describe("what a finished duel is worth", () => {
  const reward = (ladder: DuelResult["ladder"], outcome: DuelResult["outcome"]) =>
    unlockReward({ ladder, outcome });

  it("pays more for a harder opponent", () => {
    expect(reward("easy", "won")).toBe(3);
    expect(reward("normal", "won")).toBe(6);
    expect(reward("hard", "won")).toBe(10);
  });

  it("pays one card for a loss or a draw at any level", () => {
    expect(reward("easy", "lost")).toBe(1);
    expect(reward("hard", "lost")).toBe(1);
    expect(reward("normal", "drawn")).toBe(1);
  });

  it("pays nothing at all for hotseat", () => {
    // Both seats are the same person, so a hotseat "win" can be handed over in
    // one turn. Paying it would make conceding to yourself the fastest route to
    // the full roster.
    expect(reward("hotseat", "won")).toBe(0);
    expect(reward("hotseat", "lost")).toBe(0);
    expect(reward("hotseat", "drawn")).toBe(0);
  });
});

describe("folding an unlock into the record", () => {
  function started(): ReturnType<typeof emptyProgress> {
    return ensureUnlockOrder(emptyProgress(), roster);
  }

  it("starts on the floor and no lower", () => {
    const progress = started();
    expect(progress.unlocked).toBe(STARTING_POOL);
    expect(unlockedPool(progress.unlockOrder, progress.unlocked)).toHaveLength(STARTING_POOL);
  });

  it("advances by exactly the reward", () => {
    const before = started();
    const after = recordDuel(before, { ladder: "hard", outcome: "won", turns: 20, at: 1 }, { seen: [], played: [] });
    expect(after.unlocked).toBe(STARTING_POOL + 10);
    expect(newlyUnlocked(after.unlockOrder, before.unlocked, after.unlocked)).toEqual(
      after.unlockOrder.slice(STARTING_POOL, STARTING_POOL + 10),
    );
  });

  it("does not move for a hotseat duel", () => {
    const before = started();
    const after = recordDuel(before, { ladder: "hotseat", outcome: "won", turns: 20, at: 1 }, { seen: [], played: [] });
    expect(after.unlocked).toBe(before.unlocked);
    expect(newlyUnlocked(after.unlockOrder, before.unlocked, after.unlocked)).toEqual([]);
  });

  it("stops at the roster and never reports a card that does not exist", () => {
    let progress = started();
    for (let duel = 0; duel < 60; duel += 1) {
      progress = recordDuel(progress, { ladder: "hard", outcome: "won", turns: 20, at: duel }, { seen: [], played: [] });
      expect(progress.unlocked).toBeLessThanOrEqual(roster.length);
      for (const id of unlockedPool(progress.unlockOrder, progress.unlocked)) {
        expect(roster.some((card) => card.id === id)).toBe(true);
      }
    }
    expect(progress.unlocked).toBe(roster.length);
  });

  it("cannot take a card back", () => {
    let progress = started();
    let held = new Set(unlockedPool(progress.unlockOrder, progress.unlocked));
    for (const outcome of ["won", "lost", "drawn", "won"] as const) {
      progress = recordDuel(progress, { ladder: "normal", outcome, turns: 20, at: 1 }, { seen: [], played: [] });
      const now = new Set(unlockedPool(progress.unlockOrder, progress.unlocked));
      for (const id of held) expect(now.has(id)).toBe(true);
      held = now;
    }
  });
});

describe("ensureUnlockOrder", () => {
  it("returns the same object when there is nothing to do", () => {
    const first = ensureUnlockOrder(emptyProgress(), roster);
    expect(ensureUnlockOrder(first, roster)).toBe(first);
  });

  it("never lowers a count that is already above the floor", () => {
    const first = ensureUnlockOrder(emptyProgress(), roster);
    const advanced = { ...first, unlocked: 120 };
    expect(ensureUnlockOrder(advanced, roster).unlocked).toBe(120);
  });
});
