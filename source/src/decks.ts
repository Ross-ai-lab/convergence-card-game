/** Construction rules only. In-duel copying, theft and tokens do not edit a saved deck. */
export const DECK_SIZE = 30;

export type DeckIssue =
  | { code: "wrong-size"; actual: number; required: number }
  | { code: "duplicate-card"; cardId: string }
  | { code: "unknown-card"; cardId: string }
  | { code: "locked-card"; cardId: string };

export interface DeckValidation {
  readonly valid: boolean;
  readonly issues: readonly DeckIssue[];
}

/**
 * Pass the collectible roster, not the engine library (which also holds tokens).
 * An explicit unlock collection is required, so omitted progress cannot grant access.
 * Boss validation passes the full roster as unlocked. Relics occupy ordinary slots.
 * No mana curve, camp, alignment or minimum-minion rule applies to custom decks.
 */
export function validateDeck(
  cardIds: readonly string[],
  rosterIds: Iterable<string>,
  unlockedIds: Iterable<string>,
): DeckValidation {
  const roster = new Set(rosterIds);
  const unlocked = new Set(unlockedIds);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const issues: DeckIssue[] = [];
  if (cardIds.length !== DECK_SIZE) {
    issues.push({ code: "wrong-size", actual: cardIds.length, required: DECK_SIZE });
  }
  for (const cardId of cardIds) {
    if (seen.has(cardId)) {
      if (!duplicates.has(cardId)) issues.push({ code: "duplicate-card", cardId });
      duplicates.add(cardId);
      continue;
    }
    seen.add(cardId);
    if (!roster.has(cardId)) issues.push({ code: "unknown-card", cardId });
    else if (!unlocked.has(cardId)) issues.push({ code: "locked-card", cardId });
  }
  return { valid: issues.length === 0, issues };
}
