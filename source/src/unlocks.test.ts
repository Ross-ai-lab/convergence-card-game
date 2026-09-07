import { describe, expect, it } from "vitest";
import { cards, relics } from "./data/cards";
import { revealOrder } from "./unlocks";
import type { PlayableCard } from "./engine/types";
const roster: PlayableCard[] = [...cards, ...relics];

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
