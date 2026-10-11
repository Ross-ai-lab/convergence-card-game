/**
 * The Arena, bound to the game: the deckable card pool, the rivals' climb
 * through the campaign's difficulty profiles, and the browser save.
 *
 * Every card in the game is draftable, whether or not the collection owns it:
 * a draft is about the pool, not about ownership, and it never grants cards.
 * The rules themselves live in `draft-core.ts`.
 */
import { cards, relics } from "./data/cards";
import { CAMPAIGN_CARD_IDS } from "./progress";
import { CAMPAIGN_DIFFICULTIES, type CampaignDifficultyId } from "./campaign";
import { createDraftKit, DRAFT_KEY, emptyDraftSave, type DraftSave } from "./draft-core";

export * from "./draft-core";

const deckable = new Set(CAMPAIGN_CARD_IDS);
const kit = createDraftKit([...cards, ...relics].filter((card) => deckable.has(card.id)));
export const { draftCard, draftOffer, pickDraftCard, draftRivalDeck, draftShowcase, parseDraftSave } = kit;

/**
 * The rivals get stronger as the run goes: Recruit for the first two wins,
 * Veteran up to four, then the Ascendant search. Never the cheating Ascendant:
 * a draft rival holds a drafted deck too, and the run is a fair climb.
 */
export function draftDifficulty(wins: number): CampaignDifficultyId {
  return wins < 2 ? "recruit" : wins < 5 ? "veteran" : "ascendantFair";
}

export function draftDifficultyTitle(wins: number): string {
  const titles: Partial<Record<CampaignDifficultyId, string>> = { recruit: "Recruit", veteran: "Veteran", ascendantFair: "Ascendant" };
  return titles[draftDifficulty(wins)] ?? "Rival";
}

export function draftBotSkill(wins: number) {
  return CAMPAIGN_DIFFICULTIES[draftDifficulty(wins)].botSkill;
}

export function loadDraft(): DraftSave {
  try {
    return parseDraftSave(window.localStorage.getItem(DRAFT_KEY));
  } catch {
    return emptyDraftSave();
  }
}

export function saveDraft(save: DraftSave): boolean {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
