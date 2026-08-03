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
    expect(effectIds.has("destroy_weakest")).toBe(true);
    expect(effectIds.has("gain_relic")).toBe(true);
    expect(effectIds.has("freeze_two")).toBe(true);
  });

  it("resolves public artwork from both root and folder-hosted builds", () => {
    const artwork = "/card-art/raw/c001.webp";
    expect(resolvePublicAssetUrl(artwork, "/")).toBe("/card-art/raw/c001.webp");
    expect(resolvePublicAssetUrl(artwork, "/convergence-card-game/play/")).toBe(
      "/convergence-card-game/play/card-art/raw/c001.webp",
    );
  });
});
