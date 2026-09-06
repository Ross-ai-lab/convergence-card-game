import definition from "../../materials/campaign-design.json";
import type { BotCheats, BotSkill } from "./engine/bot";
import { HERO_POWER_IDS } from "./engine/hero-powers";
import type { HeroPowerId } from "./engine/types";

/**
 * Chunk 1 exposes definitions only: no storage, RNG, duel setup or menu hooks.
 * The JSON is the sole card-list source for this module and the review report.
 * The future bot adapter must pass BOTH botSkill and cheats; skill="hard" alone
 * still enables all cheats in the currently shipped bot.
 */
export type CampaignDifficultyId = keyof typeof definition.difficultyProfiles;

export interface CampaignDifficulty {
  readonly label: string;
  readonly botSkill: BotSkill;
  readonly cheats: Readonly<BotCheats>;
}

export interface CampaignChapter {
  readonly chapter: number;
  readonly bossId: string;
  readonly universe: string;
  readonly theme: string;
  readonly designReason: string;
  readonly heroPowerId: HeroPowerId;
  readonly difficultyId: CampaignDifficultyId;
  readonly universeCardIds: readonly string[];
  readonly rewardCardIds: readonly string[];
  readonly fillerRewardIds: readonly string[];
  readonly deckCardIds: readonly string[];
}

function requireValue<T extends string>(value: string, values: readonly T[], field: string): T {
  const known = values.find((candidate) => candidate === value);
  if (known === undefined) throw new Error(`Campaign ${field}: unknown value "${value}"`);
  return known;
}

function difficulty(raw: typeof definition.difficultyProfiles.recruit): CampaignDifficulty {
  return Object.freeze({
    label: raw.label,
    botSkill: requireValue(raw.botSkill, ["easy", "normal", "hard"] as const, "bot skill"),
    cheats: Object.freeze({ ...raw.cheats }),
  });
}

export const CAMPAIGN_DIFFICULTIES: Readonly<Record<CampaignDifficultyId, CampaignDifficulty>> = Object.freeze({
  recruit: difficulty(definition.difficultyProfiles.recruit),
  veteran: difficulty(definition.difficultyProfiles.veteran),
  ascendantFair: difficulty(definition.difficultyProfiles.ascendantFair),
  ascendant: difficulty(definition.difficultyProfiles.ascendant),
});

const difficultyIds = Object.keys(CAMPAIGN_DIFFICULTIES) as CampaignDifficultyId[];
const freezeIds = (ids: readonly string[]): readonly string[] => Object.freeze([...ids]);

export const CAMPAIGN_STARTER_DECK = freezeIds(definition.starterCardIds);
export const CAMPAIGN_ROSTER_SIZE = definition.rosterCount;
export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = Object.freeze(
  definition.chapters.map((raw): CampaignChapter => Object.freeze({
    chapter: raw.chapter,
    bossId: raw.bossId,
    universe: raw.universe,
    theme: raw.theme,
    designReason: raw.designReason,
    heroPowerId: requireValue(raw.heroPowerId, HERO_POWER_IDS, `chapter ${raw.chapter} Hero Power`),
    difficultyId: requireValue(raw.difficultyId, difficultyIds, `chapter ${raw.chapter} difficulty`),
    universeCardIds: freezeIds(raw.universeCardIds),
    rewardCardIds: freezeIds(raw.rewardCardIds),
    fillerRewardIds: freezeIds(raw.fillerRewardIds),
    deckCardIds: freezeIds(raw.deckCardIds),
  })),
);

/** Reject invalid chapter numbers rather than falling back to an easier opponent. */
export function getCampaignChapter(chapter: number): CampaignChapter | undefined {
  return Number.isInteger(chapter) ? CAMPAIGN_CHAPTERS.find((entry) => entry.chapter === chapter) : undefined;
}

const universeAliases = new Map(
  Object.entries(definition.universeAliases).map(([origin, universe]) => [origin.trim().toLowerCase(), universe]),
);

/** Basic is intentionally its own category, even for the Star Destroyer reference card. */
export function campaignUniverse(origin: string): string {
  return universeAliases.get(origin.trim().toLowerCase()) ?? origin.trim();
}
