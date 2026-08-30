import { describe, expect, it } from "vitest";
import { cards, relics } from "./cards";
import { LORE_DETAILS } from "./lore";

describe("Star Chart coverage", () => {
  it("profiles every playable minion and Relic", () => {
    const roster = [...cards, ...relics];

    expect(Object.keys(LORE_DETAILS)).toHaveLength(roster.length);
    for (const card of roster) {
      const profile = LORE_DETAILS[card.id];
      expect(profile?.name, `${card.id} (${card.name})`).toBeTruthy();
      expect(profile?.vals, `${card.id} chart`).toHaveLength(6);
    }
  });

  it("includes the newly requested character and Relic profiles", () => {
    expect(["c176", "c177", "c178", "c179", "c180", "c181"].every((id) => id in LORE_DETAILS)).toBe(true);
    expect(["r001", "r002", "r003", "r005", "r006", "r007", "r008", "r009", "r010", "r011", "r012", "r013", "r014", "r015", "r016", "r017", "r018", "r019", "r020", "r021", "r022", "r023", "r024", "r025", "r026", "r027", "r028"].every((id) => id in LORE_DETAILS)).toBe(true);
  });
});
