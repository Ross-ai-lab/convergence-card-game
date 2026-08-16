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
    expect(effectIds.has("light_yagami_nature_kill")).toBe(true);
    expect(effectIds.has("equip_random_relic")).toBe(true);
    expect(effectIds.has("batman_gadget_choice")).toBe(true);
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
    expect(changed.get("Gandalf the White")?.effect).toBe("Divine Shield. Battlecry: Give all friendly Good minions Divine Shield.");
    expect(changed.get("Kaido")?.effect).toBe("Battlecry: Destroy an enemy Taunt minion.");
    expect(changed.get("Rennala Queen of the Full Moon")).toMatchObject({
      atk: 2,
      hp: 3,
      effectId: "rebirth_friendly_dead",
      effectTiming: "onPlay",
      effect: "Battlecry: Rebirth a random friendly minion that died this game",
    });
    expect(changed.get("Stain")).toMatchObject({ atk: 1, hp: 1 });
    expect(changed.get("Eye of Sauron")).toMatchObject({
      cost: 5,
      atk: 1,
      hp: 5,
      effectId: "enemy_cards_cost_1_more",
      effectTiming: "passive",
      keywords: ["Passive"],
      effect: "Passive: Enemy cards cost 1 more",
    });
    expect(changed.get("Kizaru")).toMatchObject({ atk: 4, hp: 4 });
    expect(changed.get("Ten Tails")?.effect).toBe("Battlecry: Chain all other minions.");
    expect(changed.get("Mothership")).toMatchObject({ cost: 7, atk: 6, hp: 6, origin: "Basic", effect: "-" });
    expect(changed.get("Planetary Defense Grid")).toMatchObject({
      cost: 9,
      atk: 4,
      hp: 8,
      effectId: "planetary_defense_grid_taunt_buff",
      effectTiming: "passive",
      origin: "Basic",
    });
    expect(changed.get("Black Hole")).toMatchObject({
      cost: 10,
      atk: 10,
      hp: 5,
      effectId: "black_hole_deathrattle",
      effectTiming: "deathrattle",
      origin: "Basic",
    });
  });

  it("has exactly one Basic reference card at each mana tier from 1 through 10", () => {
    const basicCosts = cards.filter((card) => card.origin === "Basic").map((card) => card.cost).sort((a, b) => a - b);
    expect(basicCosts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("loads Luffy's chained-minion rescue Battlecry", () => {
    expect(cards.find((card) => card.name === "Monkey D. Luffy")?.effect).toBe(
      "Battlecry: Free all friendly Chained minions. They may attack immediately and gain Divine Shield.",
    );
  });

  it("keeps the approved lore-only camp and alignment corrections", () => {
    expect(cards.find((card) => card.id === "c082")).toMatchObject({
      camp: "Magic",
      alignment: "Neutral",
    });
    expect(cards.find((card) => card.id === "c087")).toMatchObject({
      camp: "Nature",
      alignment: "Evil",
    });
    expect(cards.find((card) => card.id === "c130")).toMatchObject({
      camp: "Magic",
      alignment: "Evil",
    });
    expect(cards.find((card) => card.id === "c154")).toMatchObject({
      camp: "Magic",
      alignment: "Neutral",
    });
    expect(cards.find((card) => card.id === "c077")).toMatchObject({ camp: "Nature", alignment: "Neutral" });
    expect(cards.find((card) => card.id === "c084")).toMatchObject({ camp: "Nature", alignment: "Neutral" });
    expect(cards.find((card) => card.id === "c155")).toMatchObject({ camp: "Magic", alignment: "Neutral" });
    expect(cards.find((card) => card.id === "c167")).toMatchObject({ camp: "Tech", alignment: "Neutral" });
  });
});
