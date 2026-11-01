import { describe, expect, it } from "vitest";
import { cards } from "./cards";

// Every card prints its own effect. scripts/validate-cards.mjs enforces the same
// rule, including the same text under different labels.
describe("card effects", () => {
  it("never share an effect between two cards", () => {
    const byEffect = new Map<string, string[]>();
    for (const card of cards) {
      if (!card.effectId || card.effectId === "none") continue;
      byEffect.set(card.effectId, [...(byEffect.get(card.effectId) ?? []), card.name]);
    }
    const shared = [...byEffect].filter(([, names]) => names.length > 1).map(([id, names]) => `${id}: ${names.join(", ")}`);
    expect(shared).toEqual([]);
  });
});
