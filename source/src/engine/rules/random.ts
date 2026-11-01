/**
 * Seeded randomness. Every roll in a duel comes from the state's own seed, so a saved
 * duel, an undo and a replay all roll the same dice.
 */
import type { GameState, PlayableCard } from "../types";

// ---------------------------------------------------------------------------
// Randomness. Everything that says "random" on a card now rolls through here.
// The seed lives in GameState, so a roll is reproducible from a saved game and
// undo rewinds it — but nothing is predictable from the turn counter any more.
// (The old effects derived their "rolls" from (turnNumber + playOrder), which in
// a hotseat game both players can read straight off the screen.)
// ---------------------------------------------------------------------------
export function hashSeed(seed: string): number {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return (value | 0) === 0 ? 0x9e3779b9 : value | 0;
}

/** xorshift32 — small, fast, and fine for dice. Returns [0, 1). */
function nextRandom(state: GameState): number {
  let value = state.rngSeed | 0;
  if (value === 0) value = 0x9e3779b9;
  value ^= value << 13;
  value |= 0;
  value ^= value >>> 17;
  value ^= value << 5;
  value |= 0;
  state.rngSeed = value;
  return (value >>> 0) / 4294967296;
}

export function rollInt(state: GameState, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function rollDie(state: GameState): number {
  return rollInt(state, 6) + 1;
}

export function coinFlip(state: GameState): boolean {
  return nextRandom(state) < 0.5;
}

export function buildDeck(cards: PlayableCard[], seed: string): string[] {
  const shuffled = seededShuffle(cards, seed);
  return shuffled.map((card) => card.id);
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const output = [...items];
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  for (let index = output.length - 1; index > 0; index -= 1) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const swapIndex = Math.abs(value) % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

/**
 * Up to three DISTINCT offers, rolled on the duel's seeded dice.
 *
 * Every Discover except the alignment one used to take the first three of its
 * pool in deck order, and deck order does not change during a duel — so a
 * second Indiana Jones offered the same three relics as the first, and the word
 * "discover" described nothing that was actually happening. The seed lives in
 * the game state, so rolling here leaves a duel exactly as replayable.
 */
export function discoverThree<T>(state: GameState, pool: T[]): T[] {
  const remaining = [...pool];
  const offers: T[] = [];
  while (offers.length < 3 && remaining.length > 0) {
    offers.push(remaining.splice(rollInt(state, remaining.length), 1)[0]);
  }
  return offers;
}
