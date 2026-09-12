import { RARITY_TIERS, rarityRank, RELIC_RARITY } from "./engine/types";
import type { PlayableCard } from "./engine/types";
import { CAMPAIGN_INITIAL_COLLECTION } from "./campaign";

export const STARTING_POOL = CAMPAIGN_INITIAL_COLLECTION.length;

/** Presentation order only. Campaign definitions decide membership. */
function revealRank(rarity: string): number {
  if (rarity === RELIC_RARITY) return RARITY_TIERS.length;
  const rank = rarityRank(rarity);
  return rank < 0 ? 0 : rank;
}

/**
 * Orders one pack's cards so the best of them is the LAST to arrive.
 *
 * A pack that deals in unlock order buries its Mythic in the middle and finishes
 * on a 1-cost common, which spends the best card of the batch on the moment
 * nobody is looking at yet. Rarity decides it, cost breaks the tie.
 */
export function revealOrder(cards: PlayableCard[]): PlayableCard[] {
  const score = (card: PlayableCard) => {
    const rarity = card.kind === "relic" ? RELIC_RARITY : card.rarity;
    return revealRank(rarity) * 100 + Math.max(0, Math.min(10, Math.round(card.cost ?? 0)));
  };
  // Stable by index, so two cards of equal score keep the order the unlock gave
  // them rather than depending on the sort implementation.
  return cards
    .map((card, index) => ({ card, index, score: score(card) }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.card);
}
