import { createDuelSeed } from "./duelSeed";
import type { PlayableCard } from "./engine/types";
import type { DuelResult, LadderKey, Progress } from "./progress";

/**
 * Gradual unlocking: which slice of the roster the shared deck is allowed to
 * draw from.
 *
 * The duel deals BOTH seats from one shared deck, so there is exactly one pool
 * and no per-seat design to do — restricting the pool restricts the opponent by
 * the same act. That is the whole reason this feature is small.
 *
 * The shape here is deliberately an ORDER plus a COUNT, not a growing set of
 * ids. An order is fixed once, so a prefix of it can be balanced by
 * construction and every later unlock inherits that balance for free; a set
 * built batch by batch can only be balanced batch by batch, and batches that
 * are each fair still stack into a lopsided whole. A count also cannot re-lock
 * a card, cannot lose one, and cannot disagree with itself.
 */

/**
 * How many cards the shared deck holds before a single duel has been won.
 *
 * MEASURED, not chosen for feel: the deck is shared and empties into fatigue,
 * so this number decides how often a duel ends by running out of cards rather
 * than by damage. See the deck-out figures on the Convergence README. Do not
 * lower it without re-running that measurement.
 */
export const STARTING_POOL = 50;

/**
 * What a finished duel is worth, in cards.
 *
 * Hotseat pays nothing on purpose. Both seats are the same human, so a hotseat
 * "win" is whatever that human decided it was — `progress.ts` records every one
 * of them as won — and paying it would make the fastest route to the full
 * roster a duel against yourself that you concede immediately.
 */
export const UNLOCK_REWARD: Record<LadderKey, { won: number; lost: number; drawn: number }> = {
  easy: { won: 5, lost: 1, drawn: 1 },
  normal: { won: 10, lost: 1, drawn: 1 },
  hard: { won: 15, lost: 1, drawn: 1 },
  hotseat: { won: 0, lost: 0, drawn: 0 },
};

/** Cards earned by one finished duel. Never negative, never a surprise. */
export function unlockReward(result: Pick<DuelResult, "ladder" | "outcome">): number {
  const table = UNLOCK_REWARD[result.ladder];
  if (!table) return 0;
  return table[result.outcome] ?? 0;
}

/**
 * Interleaves several lists so that every prefix of the result holds each list
 * in proportion to its size.
 *
 * The rule is the Sainte-Laguë divisor: take next from whichever list has the
 * lowest `(taken + 0.5) / size`. That is the allocation with the smallest
 * proportional error at every single step, which is the exact guarantee wanted
 * here — not "the batches average out over time", but "stop anywhere and it is
 * still in proportion".
 */
function divisorMerge(lanes: string[][]): string[] {
  const state = lanes.filter((ids) => ids.length).map((ids) => ({ ids, taken: 0 }));
  const total = state.reduce((sum, lane) => sum + lane.ids.length, 0);
  const order: string[] = [];
  for (let index = 0; index < total; index += 1) {
    let best: (typeof state)[number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const lane of state) {
      if (lane.taken >= lane.ids.length) continue;
      const score = (lane.taken + 0.5) / lane.ids.length;
      // Ties go to the larger lane, which is the one that would otherwise fall
      // behind fastest. Lane order is fixed, so the result is reproducible.
      if (score < bestScore || (score === bestScore && best !== null && lane.ids.length > best.ids.length)) {
        best = lane;
        bestScore = score;
      }
    }
    if (!best) break;
    order.push(best.ids[best.taken]);
    best.taken += 1;
  }
  return order;
}

/** One kind of card, spread so its mana curve holds at every prefix. */
function orderByCost(cards: PlayableCard[], seed: string): string[] {
  const buckets = new Map<number, string[]>();
  for (const card of cards) {
    const cost = Math.max(0, Math.min(10, Math.round(card.cost ?? 0)));
    const bucket = buckets.get(cost);
    if (bucket) bucket.push(card.id);
    else buckets.set(cost, [card.id]);
  }
  const lanes = [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([cost, ids]) => seededShuffle(ids, `${seed}:cost:${cost}`));
  return divisorMerge(lanes);
}

/**
 * Every card id, in an order whose EVERY prefix looks like the whole roster.
 *
 * The naive version of this feature shuffles the roster and takes the first 50.
 * That is not the same thing: a plain shuffle of 196 cards leaves a 50-card
 * prefix whose cost curve wanders by several cards in each bucket, and a pool
 * that happens to hold four 10-cost cards and one 1-cost card is a pool you
 * cannot open a turn with. The duel's measured pacing rests on the printed
 * curve, so the curve is what has to survive being cut down.
 *
 * Balanced on two axes at once, in two passes, because the axes have very
 * different sizes. Minions and relics are spread by mana cost separately, then
 * the two lanes are interleaved by their share of the roster.
 *
 * Doing it in ONE pass, with relics as an eleventh bucket beside the ten cost
 * buckets, was the first build and it is measurably worse: relic costs then
 * arrive in whatever order the shuffle produced, and the worst drift of the
 * combined mana curve across 400 seeds and every pool size goes from 1.34 cards
 * to 3.99. Both numbers were measured against this roster, not reasoned about.
 *
 * Which particular 3-cost card arrives first is random. How many 3-cost cards
 * have arrived is not.
 */
export function balancedOrder(cards: PlayableCard[], seed: string): string[] {
  const minions = cards.filter((card) => card.kind !== "relic");
  const relics = cards.filter((card) => card.kind === "relic");
  return divisorMerge([orderByCost(minions, `${seed}:minion`), orderByCost(relics, `${seed}:relic`)]);
}

/**
 * Folds a roster change into an order that was generated before it.
 *
 * Cards that vanished are dropped and cards that appeared are appended in
 * balanced order behind what is already there. Appending rather than
 * re-generating is the point: re-generating would reshuffle a pool the player
 * has already been given, and a card that has been unlocked must never be able
 * to leave.
 */
export function reconcileOrder(order: string[], cards: PlayableCard[], seed: string): string[] {
  const known = new Set(cards.map((card) => card.id));
  const kept = order.filter((id) => known.has(id));
  if (kept.length === cards.length) return kept;
  const have = new Set(kept);
  const missing = cards.filter((card) => !have.has(card.id));
  return [...kept, ...balancedOrder(missing, `${seed}:patch`)];
}

/**
 * The origin tag on the ten plain, no-franchise cards - one at every mana cost
 * from 1 to 10. They are the deliberate spine of the opening pool.
 */
const OPENING_ORIGIN = "BASIC";

/** Rarity codes. Mythic is the tier the opening pool must not hold; Rare is what it trades for. */
const MYTHIC_RARITY = "Red";
const RARE_RARITY = "Black";

/**
 * Two rules laid over the balanced order, applied to the opening slice only.
 *
 * OWNER'S RULING, not a balance measurement: the first `STARTING_POOL` cards
 * hold every BASIC card and no Mythic at all. A Mythic is meant to be the thing
 * a duel pays you, so being handed six of them before the first duel spends the
 * best moment the unlock feature has. Each Mythic it evicts is traded for a
 * Rare, which is the tier the BASIC cards themselves sit in.
 *
 * Deliberately a REORDER of an existing order rather than a re-generation, and
 * deliberately applied at the opening slice rather than across the whole
 * roster. Both keep the damage contained: the balanced order still governs
 * which cards land where past card 50.
 *
 * The Mythics this evicts are then SPREAD across the locked remainder rather
 * than parked at the front of it. Parking them there was the first build and it
 * is the wrong shape: it hands the six best cards in the game back on the very
 * first win, which is the same mistake as starting with them, only delayed by
 * one duel. Spread proportionally, a Mythic arrives roughly every eighth
 * unlock, so the tier stays an event for the whole climb.
 *
 * The one invariant this knowingly breaks is "a card that has been unlocked can
 * never leave" - re-locking those Mythics on a record that already exists is
 * the whole point of the change. It breaks once: run this twice and the second
 * pass finds nothing to move.
 */
function applyOpeningRules(order: string[], cards: PlayableCard[]): string[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const isBasic = (id: string) => (byId.get(id)?.origin ?? "").trim().toUpperCase() === OPENING_ORIGIN;
  // Relics carry no character tier, so they are neither Mythic nor Rare here.
  const rarityOf = (id: string) => {
    const card = byId.get(id);
    return !card || card.kind === "relic" ? "Relic" : card.rarity;
  };
  const isMythic = (id: string) => rarityOf(id) === MYTHIC_RARITY;
  const isRare = (id: string) => rarityOf(id) === RARE_RARITY;
  const size = Math.min(STARTING_POOL, order.length);
  const chosen = new Set<string>();

  // 1. Every BASIC card, wherever in the order it happened to be sitting.
  for (const id of order) {
    if (chosen.size >= size) break;
    if (isBasic(id)) chosen.add(id);
  }
  // 2. The opening slice as the balanced order left it, minus the Mythics.
  for (const id of order.slice(0, size)) {
    if (chosen.size >= size) break;
    if (!isMythic(id)) chosen.add(id);
  }
  // 3. The slots that freed up, Rare first - a Mythic is traded for a Rare.
  for (const rareOnly of [true, false]) {
    for (const id of order) {
      if (chosen.size >= size) break;
      if (chosen.has(id) || isMythic(id)) continue;
      if (rareOnly && !isRare(id)) continue;
      chosen.add(id);
    }
  }

  const head = order.filter((id) => chosen.has(id));
  const tail = order.filter((id) => !chosen.has(id));

  // The same divisor rule the roster order is built with, so the Mythics are in
  // proportion at EVERY prefix of the remainder - not "they even out by the
  // end", but "stop after any number of wins and it is still in proportion".
  // Both lanes keep the relative order the balanced pass gave them, so the cost
  // curve underneath is undisturbed.
  const spread = divisorMerge([tail.filter((id) => !isMythic(id)), tail.filter(isMythic)]);
  return [...head, ...spread];
}

/**
 * Gives a record its unlock order, once, and keeps it honest afterwards.
 *
 * Returns the SAME object when nothing needed doing, so the caller can save on
 * identity and never write a file that has not changed. The seed is fresh
 * browser entropy rather than a constant, so two machines that both start today
 * do not meet the roster in the same sequence.
 */
export function ensureUnlockOrder(progress: Progress, cards: PlayableCard[]): Progress {
  const generated = progress.unlockOrder.length
    ? reconcileOrder(progress.unlockOrder, cards, "convergence-unlocks")
    : balancedOrder(cards, createDuelSeed());
  const order = applyOpeningRules(generated, cards);
  const unlocked = Math.max(STARTING_POOL, Math.min(order.length, progress.unlocked));
  if (order.length === progress.unlockOrder.length && unlocked === progress.unlocked) {
    let same = true;
    for (let index = 0; index < order.length; index += 1) {
      if (order[index] !== progress.unlockOrder[index]) {
        same = false;
        break;
      }
    }
    if (same) return progress;
  }
  return { ...progress, unlockOrder: order, unlocked };
}

/** The ids the shared deck may hold right now. */
export function unlockedPool(order: string[], unlocked: number): string[] {
  return order.slice(0, Math.max(0, Math.min(order.length, unlocked)));
}

/**
 * The cards a finished duel just revealed — the slice between the old count and
 * the new one, which is what the pack-opening screen tears open.
 */
export function newlyUnlocked(order: string[], before: number, after: number): string[] {
  const from = Math.max(0, Math.min(order.length, before));
  const to = Math.max(from, Math.min(order.length, after));
  return order.slice(from, to);
}

/**
 * How good a card looks when it lands on the table.
 *
 * Used ONLY to decide the order a pack deals itself out in, never to decide
 * which cards are in it — the pack's contents are settled by `unlockOrder`
 * before this is consulted, so weighting the reveal cannot bias what you get.
 *
 * Relics rank ABOVE every character tier, Mythic included. Owner's call, and
 * scarcity backs it: 21 relics against 19 Mythics. A relic is also the only card
 * class that changes what another card does rather than adding a body, so it is
 * the one worth waiting for.
 */
const REVEAL_RANK: Record<string, number> = {
  Black: 0,
  Purple: 1,
  Yellow: 2,
  Red: 3,
  Relic: 4,
};

/**
 * Orders one pack's cards so the best of them is the LAST to arrive.
 *
 * A pack that deals in unlock order buries its Mythic in the middle and finishes
 * on a 1-cost common, which spends the best card of the batch on the moment
 * nobody is looking at yet. Rarity decides it, cost breaks the tie.
 */
export function revealOrder(cards: PlayableCard[]): PlayableCard[] {
  const score = (card: PlayableCard) => {
    const rarity = card.kind === "relic" ? "Relic" : card.rarity;
    return (REVEAL_RANK[rarity] ?? 0) * 100 + Math.max(0, Math.min(10, Math.round(card.cost ?? 0)));
  };
  // Stable by index, so two cards of equal score keep the order the unlock gave
  // them rather than depending on the sort implementation.
  return cards
    .map((card, index) => ({ card, index, score: score(card) }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.card);
}

/**
 * The same generator the engine shuffles the deck with, kept here rather than
 * imported so the unlock order never moves when the engine's shuffle is tuned.
 * The two have no reason to stay identical and one reason not to: a change to
 * how a duel shuffles must not reorder a player's collection.
 */
function seededShuffle<T>(items: T[], seed: string): T[] {
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
