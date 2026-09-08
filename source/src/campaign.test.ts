import { describe, expect, it } from "vitest";
import { cards, relics } from "./data/cards";
import { HERO_POWER_IDS } from "./engine/hero-powers";
import { isMinionCard } from "./engine/types";
import { validateDeck } from "./decks";
import {
  CAMPAIGN_CHAPTERS, CAMPAIGN_DIFFICULTIES, CAMPAIGN_ROSTER_SIZE,
  CAMPAIGN_STARTER_DECK, campaignUniverse, getCampaignChapter,
} from "./campaign";

const roster = [...cards, ...relics];
const rosterIds = roster.map(({ id }) => id);
const byId = new Map(roster.map((card) => [card.id, card]));
const noCheats = { trueDice: false, readsYourReply: false, clairvoyance: false, foresight: false };
const allCheats = { trueDice: true, readsYourReply: true, clairvoyance: true, foresight: true };

describe("campaign definitions", () => {
  it("contains the approved twenty opponents in sequence, with Meruem and Bill reserved", () => {
    expect(CAMPAIGN_CHAPTERS.map(({ chapter }) => chapter)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(CAMPAIGN_CHAPTERS.map(({ bossId }) => bossId)).toEqual([
      "c104", "c134", "c033", "c021", "c114", "c029", "c024", "c096", "c071", "c084",
      "c023", "c037", "c058", "c019", "c022", "c097", "c051", "c027", "c044", "c041",
    ]);
    expect(new Set(CAMPAIGN_CHAPTERS.map(({ universe }) => universe)).size).toBe(20);
  });

  it("starts with three cards at EVERY mana cost, all ten Basics and no Mythics", () => {
    expect(validateDeck(CAMPAIGN_STARTER_DECK, rosterIds, CAMPAIGN_STARTER_DECK).valid).toBe(true);
    const starter = CAMPAIGN_STARTER_DECK.map((id) => byId.get(id)!);
    for (let cost = 1; cost <= 10; cost++) expect(starter.filter((card) => card.cost === cost)).toHaveLength(3);
    expect(starter.filter((card) => !isMinionCard(card))).toHaveLength(4);
    expect(starter.some((card) => isMinionCard(card) && card.rarity === "Red")).toBe(false);
    expect(starter.filter((card) => card.origin === "Basic").map(({ id }) => id).sort())
      .toEqual(cards.filter((card) => card.origin === "Basic").map(({ id }) => id).sort());
    expect(starter.filter((card) => card.origin === "Basic")).toHaveLength(10);
  });

  it("allocates every current collectible once, with the approved pack sizes", () => {
    expect(CAMPAIGN_ROSTER_SIZE).toBe(roster.length);
    expect(roster.length).toBe(216);
    expect(CAMPAIGN_CHAPTERS.map(({ rewardCardIds }) => rewardCardIds.length))
      .toEqual([9,9,9,9,9,9,9,9,9,10,10,10,11,10,10,10,11,16,6,1]);
    const allocated = [...CAMPAIGN_STARTER_DECK, ...CAMPAIGN_CHAPTERS.flatMap(({ rewardCardIds }) => rewardCardIds)];
    expect(allocated).toHaveLength(216);
    expect(new Set(allocated).size).toBe(216);
    expect(allocated.sort()).toEqual([...rosterIds].sort());
    expect(getCampaignChapter(20)!.rewardCardIds).toEqual(["c041"]);
  });

  for (const chapter of CAMPAIGN_CHAPTERS) {
    it(`chapter ${chapter.chapter}: legal fixed deck, complete universe reward, no early unlock`, () => {
      expect(validateDeck(chapter.deckCardIds, rosterIds, rosterIds)).toEqual({ valid: true, issues: [] });
      const universeIds = roster.filter((card) => campaignUniverse(card.origin) === chapter.universe).map(({ id }) => id);
      expect([...chapter.universeCardIds].sort()).toEqual(universeIds.sort());
      expect(chapter.universeCardIds).toContain(chapter.bossId);
      expect(HERO_POWER_IDS).toContain(chapter.heroPowerId);
      const previouslyOwned = new Set([...CAMPAIGN_STARTER_DECK, ...CAMPAIGN_CHAPTERS
        .filter((entry) => entry.chapter < chapter.chapter).flatMap((entry) => entry.rewardCardIds)]);
      for (const id of universeIds) {
        expect(chapter.deckCardIds).toContain(id);
        expect(chapter.rewardCardIds).toContain(id);
        expect(previouslyOwned.has(id)).toBe(false);
      }
      expect([...chapter.rewardCardIds].sort()).toEqual([...chapter.universeCardIds, ...chapter.fillerRewardIds].sort());
      const futureUniverseIds = new Set(CAMPAIGN_CHAPTERS.filter((entry) => entry.chapter > chapter.chapter)
        .flatMap((entry) => entry.universeCardIds));
      expect(chapter.deckCardIds.some((id) => futureUniverseIds.has(id))).toBe(false);
    });
  }

  it("lets early bosses use later filler cards without paying their deck as a reward", () => {
    const first = getCampaignChapter(1)!;
    const laterRewards = new Set(CAMPAIGN_CHAPTERS.slice(1).flatMap(({ fillerRewardIds }) => fillerRewardIds));
    const previewed = first.deckCardIds.filter((id) => laterRewards.has(id));
    expect(previewed.length).toBeGreaterThan(0);
    for (const id of previewed) expect(first.rewardCardIds).not.toContain(id);
    expect(first.deckCardIds.length).not.toBe(first.rewardCardIds.length);
  });

  it.each([
    [1, "recruit", "easy", noCheats], [4, "recruit", "easy", noCheats],
    [5, "veteran", "normal", noCheats], [10, "veteran", "normal", noCheats],
    [11, "ascendantFair", "hard", noCheats], [14, "ascendantFair", "hard", noCheats],
    [15, "ascendant", "hard", allCheats], [20, "ascendant", "hard", allCheats],
  ] as const)("chapter %i has the correct difficulty and cheats", (number, id, skill, cheats) => {
    expect(getCampaignChapter(number)!.difficultyId).toBe(id);
    expect(CAMPAIGN_DIFFICULTIES[id].botSkill).toBe(skill);
    expect(CAMPAIGN_DIFFICULTIES[id].cheats).toEqual(cheats);
  });

  it("keeps the entire four-band schedule consistent, including interior chapters", () => {
    expect(CAMPAIGN_CHAPTERS.map(({ difficultyId }) => difficultyId)).toEqual([
      ...Array(4).fill("recruit"), ...Array(6).fill("veteran"),
      ...Array(4).fill("ascendantFair"), ...Array(6).fill("ascendant"),
    ]);
  });

  it.each([0, -1, 21, 1.5, NaN, Infinity])("rejects invalid chapter lookup %s", (chapter) => {
    expect(getCampaignChapter(chapter)).toBeUndefined();
  });

  it("normalizes universe aliases, including relics and the Basic exception", () => {
    for (const origin of ["MCU", "Marvel", "Loki", " mcu "]) expect(campaignUniverse(origin)).toBe("Marvel");
    for (const origin of ["HxH", "Hxh", "HXH"]) expect(campaignUniverse(origin)).toBe("Hunter x Hunter");
    expect(campaignUniverse("Lord of The Rings")).toBe("Lord of the Rings");
    expect(campaignUniverse("DCU")).toBe(campaignUniverse("DC"));
    expect(campaignUniverse("RoR")).toBe(campaignUniverse("Record of Ragnarok"));
    expect(campaignUniverse("Tensura")).toBe(campaignUniverse("That time I got reincarnated as a Slime"));
    expect(campaignUniverse(byId.get("c068")!.origin)).toBe("Basic");
    expect(getCampaignChapter(10)!.universeCardIds).toHaveLength(9);
    expect(getCampaignChapter(18)!.universeCardIds).toHaveLength(16);
  });

  it("keeps the first campaign boss at Legendary rarity", () => {
    const glados = byId.get("c104");
    expect(glados?.name).toBe("GLaDOS");
    if (!glados || glados.kind !== "minion") throw new Error("GLaDOS must be a minion");
    expect(glados.rarity).toBe("Yellow");
  });

  it("protects shared definitions from mutation by future consumers", () => {
    expect(Object.isFrozen(CAMPAIGN_STARTER_DECK)).toBe(true);
    for (const chapter of CAMPAIGN_CHAPTERS) {
      expect(Object.isFrozen(chapter)).toBe(true);
      expect(Object.isFrozen(chapter.deckCardIds)).toBe(true);
      expect(Object.isFrozen(chapter.rewardCardIds)).toBe(true);
    }
    expect(() => (CAMPAIGN_CHAPTERS[0].rewardCardIds as string[]).push("c041")).toThrow();
    expect(Object.isFrozen(CAMPAIGN_DIFFICULTIES.ascendant.cheats)).toBe(true);
  });
});
