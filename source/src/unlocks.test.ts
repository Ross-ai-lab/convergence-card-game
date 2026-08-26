import { describe, expect, it } from "vitest";

import { cards, relics } from "./data/cards";
import { emptyProgress, recordDuel, type DuelResult } from "./progress";
import {
  STARTING_POOL,
  UNLOCK_REWARD,
  balancedOrder,
  ensureUnlockOrder,
  newlyUnlocked,
  reconcileOrder,
  revealOrder,
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
    expect(reward("easy", "won")).toBe(5);
    expect(reward("normal", "won")).toBe(10);
    expect(reward("hard", "won")).toBe(15);
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
    const paid = UNLOCK_REWARD.hard.won;
    expect(after.unlocked).toBe(STARTING_POOL + paid);
    expect(newlyUnlocked(after.unlockOrder, before.unlocked, after.unlocked)).toEqual(
      after.unlockOrder.slice(STARTING_POOL, STARTING_POOL + paid),
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

describe("the order a pack deals itself out in", () => {
  const byName = (name: string) => {
    const card = roster.find((entry) => entry.name === name);
    if (!card) throw new Error(`no card named ${name}`);
    return card;
  };
  const rarityOf = (card: PlayableCard) => (card.kind === "relic" ? "Relic" : card.rarity);

  it("keeps every card, exactly once", () => {
    const batch = roster.slice(0, 10);
    const revealed = revealOrder(batch);
    expect(revealed).toHaveLength(batch.length);
    expect(new Set(revealed.map((card) => card.id)).size).toBe(batch.length);
  });

  it("finishes on the rarest card in the batch", () => {
    // The whole point: a pack that deals in unlock order buries its best card in
    // the middle and ends on a 1-cost common.
    const mythic = roster.find((card) => card.kind !== "relic" && card.rarity === "Red");
    const commons = roster.filter((card) => card.kind !== "relic" && card.rarity === "Black").slice(0, 5);
    if (!mythic) throw new Error("no Mythic card in the roster");
    const revealed = revealOrder([mythic, ...commons]);
    expect(revealed[revealed.length - 1].id).toBe(mythic.id);
  });

  it("puts a relic last even against a Mythic", () => {
    const mythic = roster.find((card) => card.kind !== "relic" && card.rarity === "Red");
    const relic = roster.find((card) => card.kind === "relic");
    if (!mythic || !relic) throw new Error("roster is missing a Mythic or a relic");
    // Owner's call, and the reason it is worth a test of its own: relics
    // outrank every character tier, which is the opposite of the first build.
    expect(revealOrder([relic, mythic]).map((card) => card.id)).toEqual([mythic.id, relic.id]);
    expect(revealOrder([mythic, relic]).map((card) => card.id)).toEqual([mythic.id, relic.id]);
  });

  it("never lets a lower tier land after a higher one", () => {
    const revealed = revealOrder(roster.slice(0, 40));
    const ranks = revealed.map((card) => REVEAL_ORDER.indexOf(rarityOf(card)));
    for (let index = 1; index < ranks.length; index += 1) {
      expect(ranks[index]).toBeGreaterThanOrEqual(ranks[index - 1]);
    }
  });

  it("breaks a tier tie on cost, cheapest first", () => {
    const sameTier = roster.filter((card) => card.kind !== "relic" && card.rarity === "Purple").slice(0, 8);
    const revealed = revealOrder(sameTier);
    const costs = revealed.map((card) => card.cost ?? 0);
    for (let index = 1; index < costs.length; index += 1) {
      expect(costs[index]).toBeGreaterThanOrEqual(costs[index - 1]);
    }
  });

  it("does not change WHICH cards a pack holds", () => {
    // Guards the one way this could go wrong: reveal order is cosmetic, and must
    // never leak back into the reward itself.
    const batch = [byName("John Wick"), byName("Joker")];
    expect(revealOrder(batch).map((card) => card.id).sort()).toEqual(batch.map((card) => card.id).sort());
  });
});

/** Weakest to strongest, mirroring REVEAL_RANK in unlocks.ts. */
const REVEAL_ORDER = ["Black", "Purple", "Yellow", "Red", "Relic"];

describe("the opening pool rules", () => {
  const byId = new Map(roster.map((card) => [card.id, card]));
  const tierOf = (id: string) => {
    const card = byId.get(id);
    return !card || card.kind === "relic" ? "Relic" : card.rarity;
  };
  const basics = roster.filter(
    (card) => (card.origin ?? "").trim().toUpperCase() === "BASIC",
  );
  const opening = (progress: ReturnType<typeof emptyProgress>) =>
    unlockedPool(progress.unlockOrder, STARTING_POOL);

  it("hands over every BASIC card before the first duel", () => {
    // They are one card at every cost from 1 to 10, so they are the spine the
    // opening curve is built on. There is no seed where one is missing.
    expect(basics.length).toBeGreaterThan(0);
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const held = new Set(opening(ensureUnlockOrder(emptyProgress(), roster)));
      for (const card of basics) expect(held.has(card.id)).toBe(true);
    }
  });

  it("holds no Mythic at all", () => {
    // Owner's ruling: a Mythic is what a duel pays you, never what you start on.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      for (const id of opening(ensureUnlockOrder(emptyProgress(), roster))) {
        expect(tierOf(id)).not.toBe("Red");
      }
    }
  });

  it("re-locks a Mythic that an older record had already handed out", () => {
    // The migration case, and the one place this feature is allowed to take a
    // card back. A record written before the rule existed opens on the raw
    // balanced order; loading it must move the Mythics out of the first 50.
    const raw = balancedOrder(roster, "seed-with-mythics");
    const stale = { ...emptyProgress(), unlockOrder: raw, unlocked: STARTING_POOL };
    const fixed = ensureUnlockOrder(stale, roster);
    const before = raw.slice(0, STARTING_POOL).filter((id) => tierOf(id) === "Red");
    expect(before.length).toBeGreaterThan(0);
    for (const id of opening(fixed)) expect(tierOf(id)).not.toBe("Red");
    // Evicted, not lost, and not handed straight back either.
    const held = new Set(opening(fixed));
    const pushedOut = raw.slice(0, STARTING_POOL).filter((id) => !held.has(id));
    expect(pushedOut).toEqual(expect.arrayContaining(before));
    for (const id of pushedOut) expect(fixed.unlockOrder).toContain(id);
  });

  it("spreads the locked Mythics instead of paying them out all at once", () => {
    // The failure this guards: parking every evicted Mythic at the front of the
    // remainder hands the six best cards in the game over on the first win,
    // which is the same mistake as starting with them.
    const mythics = roster.filter((card) => tierOf(card.id) === "Red");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const order = ensureUnlockOrder(emptyProgress(), roster).unlockOrder;
      const locked = order.slice(STARTING_POOL);
      const share = mythics.length / locked.length;
      // Proportional at EVERY prefix, not just at the end. The divisor rule
      // holds each prefix within one card of its fair share.
      for (let size = 1; size <= locked.length; size += 1) {
        const seen = locked.slice(0, size).filter((id) => tierOf(id) === "Red").length;
        expect(Math.abs(seen - size * share)).toBeLessThan(1.5);
      }
      // Concretely: the first win at the top ladder cannot be a Mythic shower.
      const firstWin = locked.slice(0, UNLOCK_REWARD.hard.won);
      expect(firstWin.filter((id) => tierOf(id) === "Red").length).toBeLessThanOrEqual(3);
    }
  });

  it("settles after one pass and then leaves the record alone", () => {
    const first = ensureUnlockOrder(emptyProgress(), roster);
    expect(ensureUnlockOrder(first, roster)).toBe(first);
  });

  it("still holds the whole roster, once each", () => {
    const progress = ensureUnlockOrder(emptyProgress(), roster);
    expect(progress.unlockOrder).toHaveLength(roster.length);
    expect(new Set(progress.unlockOrder).size).toBe(roster.length);
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
