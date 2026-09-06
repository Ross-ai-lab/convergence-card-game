import type { DrawPile, GameState, PlayerId } from "./types";

/** The legacy app keeps its old pile until campaign UI integration in chunk 3. */
export function drawPileFor(state: GameState, player: PlayerId): DrawPile {
  return state.playerDecks?.[player] ?? state;
}

/** Exact draw order, including cards returned to the bottom. Never mutates state. */
export function remainingDeckCards(state: GameState, player: PlayerId): string[] {
  const pile = drawPileFor(state, player);
  return [...pile.deck, ...pile.bottomDeck.toReversed()];
}

export function remainingDeckCount(state: GameState, player: PlayerId): number {
  const pile = drawPileFor(state, player);
  return pile.deck.length + pile.bottomDeck.length;
}
