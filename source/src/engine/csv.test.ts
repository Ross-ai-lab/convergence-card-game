import { describe, expect, it } from "vitest";
import { cards, resolvePublicAssetUrl } from "../data/cards";

describe("card CSV data", () => {
  it("loads the full 175-card roster", () => {
    expect(cards).toHaveLength(175);
    expect(new Set(cards.map((card) => card.id)).size).toBe(175);
    expect(new Set(cards.map((card) => card.name)).size).toBe(175);
  });

  it("contains the v1 systems needed for engine coverage", () => {
    const keywords = new Set(cards.flatMap((card) => card.keywords));
    const effectIds = new Set(cards.map((card) => card.effectId));
    expect(keywords.has("Divine Shield")).toBe(true);
    expect(keywords.has("Taunt")).toBe(true);
    expect(effectIds.has("kill_random_enemy")).toBe(true);
    expect(effectIds.has("gain_relic")).toBe(true);
    expect(effectIds.has("freeze_or_kill")).toBe(true);
  });

  it("resolves public artwork from both root and folder-hosted builds", () => {
    const artwork = "/card-art/raw/c001.webp";
    expect(resolvePublicAssetUrl(artwork, "/")).toBe("/card-art/raw/c001.webp");
    expect(resolvePublicAssetUrl(artwork, "/convergence-card-game/play/")).toBe(
      "/convergence-card-game/play/card-art/raw/c001.webp",
    );
  });

  it("fully replaces the old keyword layers on changed effects", () => {
    const changed = new Map(cards.map((card) => [card.name, card]));
    expect(changed.get("Kaido")?.keywords).not.toContain("Chained");
    expect(changed.get("Kaido")?.keywords).not.toContain("Taunt");
    expect(changed.get("King")?.keywords).not.toContain("Taunt");
    expect(changed.get("Kaku Kaioh")?.keywords).not.toContain("Taunt");
    expect(changed.get("Gandalf the White")?.keywords).toContain("Divine Shield");
    expect(changed.get("Gandalf the White")?.effect).toBe("Divine Shield. Battlecry: Give all friendly Good minions Divine Shield");
    expect(changed.get("Kaido")?.effect).toBe("Battlecry: Destroy an enemy Taunt minion");
    expect(changed.get("Rennala Queen of the Full Moon")?.effect).toBe(
      "Ongoing: Transform the strongest enemy minion into a 1/1 Lunar Slime until your next turn",
    );
  });
});
