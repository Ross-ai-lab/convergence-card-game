/**
 * Cards outside the board: drawing, the hand limit, searching a deck, and what a card
 * costs right now.
 */
import { isMinionCard } from "../types";
import { drawPileFor } from "../draw-piles";
import { traceEffect } from "../trace";
import type {
  CardDefinition,
  GameEvent,
  GameState,
  MinionInstance,
  PlayerId,
  PlayerState,
  PlayableCard,
} from "../types";
import { effectEvent, handLimit, opponent, type CardLibrary } from "./core";
import { DEEP_SEA_DISCOUNT } from "./auras";
import { applyFatigue } from "./turns";
import { discoverThree, rollInt } from "./random";
import { hasEffect, hasKeyword } from "./stats";

/** A card's cost after discounts and live enemy cost auras. */
export function effectiveCardCost(state: GameState, playerId: PlayerId, card: PlayableCard): number {
  const player = state.players[playerId];
  const enemy = state.players[opponent(playerId)];
  const enemyCardTax = isMinionCard(card) && card.camp === "Magic" ? 2 * enemy.board.filter(
    (minion) => minion && !minion.silenced && hasEffect(minion, "enemy_magic_minions_cost_2_more"),
  ).length : 0;
  // Deep Sea King is cheap while the sea is frozen. It reads EITHER board,
  // because the card says "any minion" and because a discount that only your own
  // Freeze could unlock would make the card a two-card combo rather than an
  // opportunist.
  const chilled =
    isMinionCard(card) && card.effectId === "deep_sea_discount" && boardHasFrozenOrChained(state);
  // Compared field-to-string rather than through `hasEffect`, which is where the
  // tracer normally sees a passive, so this branch has to say so itself.
  if (chilled) traceEffect("deep_sea_discount");
  const chill = chilled ? DEEP_SEA_DISCOUNT : 0;
  const vaderTax = isMinionCard(card) ? player.minionCostPenaltyThisTurn : 0;
  return Math.max(0, (card.cost ?? 0) - (player.costReductions[card.id] ?? 0) - chill + enemyCardTax + vaderTax);
}

/** Whether anything on either board is currently Frozen or Chained. */
function boardHasFrozenOrChained(state: GameState): boolean {
  return state.players.some((player) =>
    player.board.some((minion) => Boolean(minion) && (minion!.frozen || minion!.chained > 0)),
  );
}

export function drawFromDeck(state: GameState, playerId: PlayerId, count: number, events: GameEvent[]): string[] {
  const pile = drawPileFor(state, playerId);
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (pile.deck.length === 0 && pile.bottomDeck.length > 0) {
      pile.deck = pile.bottomDeck.splice(0).reverse();
    }
    const card = pile.deck.shift();
    if (!card) break;
    drawn.push(card);
  }
  if (drawn.length === 0) {
    events.push(state.playerDecks
      ? { kind: "draw", text: `${state.players[playerId].name}'s deck is empty.`, player: playerId }
      : { kind: "draw", text: "The shared deck is empty." });
  }
  return drawn;
}

export function drawDirect(state: GameState, playerId: PlayerId, count: number, events: GameEvent[]): void {
  const cards = drawFromDeck(state, playerId, count, events);
  for (const cardId of cards) {
    putCardInHand(state, playerId, cardId, events);
  }
  if (state.playerDecks) {
    for (let missed = cards.length; missed < count && state.phase !== "gameOver"; missed++) {
      applyFatigue(state, playerId, events);
    }
  }
}

export function putCardInHand(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  events: GameEvent[],
  returningInstanceId?: string,
): boolean {
  const player = state.players[playerId];
  if (player.hand.length >= handLimit) {
    state.discard.push(cardId);
    events.push({ kind: "draw", text: `${player.name}'s hand is full, so a card burns.`, player: playerId, cardId });
    return false;
  }
  player.hand.push(cardId);
  events.push({
    kind: "draw",
    text: `${player.name} adds a card to hand.`,
    player: playerId,
    cardId,
    ...(returningInstanceId ? { instanceId: returningInstanceId, motion: "return" as const } : {}),
  });
  return true;
}

/** Distinct minion cards still in this seat's draw and bottom piles. */
function minionsInDrawPile(state: GameState, playerId: PlayerId, library: CardLibrary): CardDefinition[] {
  const seen = new Set<string>();
  return [...drawPileFor(state, playerId).deck, ...drawPileFor(state, playerId).bottomDeck].flatMap((cardId) => {
    const card = library[cardId];
    if (!isMinionCard(card) || seen.has(card.id)) return [];
    seen.add(card.id);
    return [card];
  });
}

/** Vegapunk's offers: three random Tech minions left in the controller's deck. */
export function discoverTechCards(state: GameState, playerId: PlayerId, library: CardLibrary): CardDefinition[] {
  return discoverThree(state, minionsInDrawPile(state, playerId, library).filter((card) => card.camp === "Tech"));
}

/**
 * Kagaya's offers: one random Taunt, one Divine Shield and one Passive minion,
 * never the same card twice. His card names three KEYWORDS rather than three
 * cards, so the offer is built keyword by keyword instead of drawn from one
 * mixed pool.
 *
 * All three are read off the keyword list, which only became safe once every
 * passive card actually declared Passive — fourteen of the sixty-five never had
 * it typed into the CSV, and `validate-cards.mjs` now fails the build if that
 * gap comes back.
 */
export function discoverKeywordMinions(state: GameState, playerId: PlayerId, library: CardLibrary): CardDefinition[] {
  const pile = minionsInDrawPile(state, playerId, library);
  const taken = new Set<string>();
  const offers: CardDefinition[] = [];
  for (const keyword of ["Taunt", "Divine Shield", "Passive"] as const) {
    const pool = pile.filter((card) => !taken.has(card.id) && hasKeyword(card, keyword));
    if (pool.length === 0) continue;
    const pick = pool[rollInt(state, pool.length)];
    taken.add(pick.id);
    offers.push(pick);
  }
  return offers;
}

/** Discover up to three distinct alignment cards, using the duel's seeded RNG. */
export function discoverAlignmentMinions(
  state: GameState, playerId: PlayerId,
  alignment: "Good" | "Evil",
  library: CardLibrary,
): CardDefinition[] {
  return discoverThree(state, minionsInDrawPile(state, playerId, library).filter((card) => card.alignment === alignment));
}

export function removeCardFromDrawPile(state: GameState, playerId: PlayerId, cardId: string): boolean {
  const deckIndex = drawPileFor(state, playerId).deck.indexOf(cardId);
  if (deckIndex >= 0) {
    drawPileFor(state, playerId).deck.splice(deckIndex, 1);
    return true;
  }
  const bottomIndex = drawPileFor(state, playerId).bottomDeck.indexOf(cardId);
  if (bottomIndex >= 0) {
    drawPileFor(state, playerId).bottomDeck.splice(bottomIndex, 1);
    return true;
  }
  return false;
}

export function stealCard(
  state: GameState,
  source: MinionInstance,
  enemy: PlayerState,
  pickIndex: (hand: string[]) => number,
  events: GameEvent[],
): void {
  const index = pickIndex(enemy.hand);
  if (index < 0 || index >= enemy.hand.length) return;
  const cardId = enemy.hand.splice(index, 1)[0];
  putCardInHand(state, source.owner, cardId, events);
  events.push(effectEvent(`${source.name} steals a card.`, source));
}
