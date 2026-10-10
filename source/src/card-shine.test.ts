import { describe, expect, it } from "vitest";
import { SHINE_LAYERS } from "./card-shine";
import { BASELINE_RARITY, RARITIES, RELIC_RARITY } from "./engine/types";

describe("rarity shine layers", () => {
  it("covers every tier above the baseline, plus relics, and leaves the baseline bare", () => {
    const shiny = [...RARITIES.filter((rarity) => rarity !== BASELINE_RARITY), RELIC_RARITY].map((rarity) => rarity.toLowerCase());
    expect(Object.keys(SHINE_LAYERS).sort()).toEqual(shiny.sort());
    expect(SHINE_LAYERS[BASELINE_RARITY.toLowerCase()]).toBeUndefined();
  });

  it("keeps each tier's layer count, with Mythic the busiest", () => {
    expect(SHINE_LAYERS.yellow).toHaveLength(3);
    expect(SHINE_LAYERS.purple).toHaveLength(4);
    expect(SHINE_LAYERS.relic).toHaveLength(4);
    expect(SHINE_LAYERS.red).toHaveLength(5);
  });

  it("keeps the crossing light bar for relics alone", () => {
    for (const [tier, layers] of Object.entries(SHINE_LAYERS)) {
      expect(layers.some((layer) => layer.slot === "sweep")).toBe(tier === "relic");
    }
  });
});
