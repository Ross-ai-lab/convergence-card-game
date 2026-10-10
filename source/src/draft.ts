/**
 * Rift Draft: build a deck from offers of three, then play rival drafters until
 * seven wins or three losses.
 *
 * Every card in the game is draftable, whether or not the collection owns it:
 * a draft is about the pool, not about ownership, and it never grants cards.
 * Everything here is pure and seeded. An offer is derived from the run id, the
 * pick number and the cards already taken, so a reload shows the same three
 * cards and a run can never be rerolled by refreshing the page.
 */
import { cards, relics } from "./data/cards";
import { CAMPAIGN_CARD_IDS } from "./progress";
import { CAMPAIGN_DIFFICULTIES, type CampaignDifficultyId } from "./campaign";
import { DECK_SIZE } from "./decks";
import { PLAYER_HERO_POWER_IDS } from "./engine/hero-powers";
import type { CardDefinition, HeroPowerId, RelicDefinition } from "./engine/types";

export const DRAFT_PICKS = DECK_SIZE;
export const DRAFT_WIN_GOAL = 7;
export const DRAFT_LOSS_LIMIT = 3;
/** A deck needs bodies to carry its relics; past this many, relics stop being offered. */
export const DRAFT_RELIC_CAP = 6;
/** Picks 1, 11 and 21 offer only Legendary or Mythic cards: the run's three big moments. */
export const DRAFT_SPECIAL_PICKS: readonly number[] = [0, 10, 20];

export type DraftTier = "Black" | "Purple" | "Yellow" | "Red" | "Relic";
/** Lowest to highest, for fallbacks when a tier runs dry. */
const TIER_ORDER: readonly DraftTier[] = ["Black", "Purple", "Yellow", "Red", "Relic"];
const ORDINARY_WEIGHTS: Readonly<Record<DraftTier, number>> = { Black: 48, Purple: 26, Yellow: 12, Red: 4, Relic: 10 };
const SPECIAL_WEIGHTS: Readonly<Record<DraftTier, number>> = { Black: 0, Purple: 0, Yellow: 75, Red: 25, Relic: 0 };
const FALLBACK: Readonly<Record<DraftTier, DraftTier>> = { Red: "Yellow", Yellow: "Purple", Purple: "Black", Relic: "Black", Black: "Black" };

export interface DraftRun {
  /** The run's seed, and its identity in a saved duel. */
  id: string;
  /** The three Hero Powers offered before the first card pick. */
  powerChoices: HeroPowerId[];
  heroPower: HeroPowerId | null;
  /** The deck, in pick order. */
  picks: string[];
  wins: number;
  losses: number;
  draws: number;
  /** Duel ids already counted, so a result is never recorded twice. */
  settled: string[];
  /**
   * The draft duel started and not yet finished. Starting the next one first
   * counts this one as a loss, so walking away from a losing duel never erases
   * it from the run.
   */
  activeDuel: string | null;
  /** Set when the run reaches its goal, its loss limit, or is retired. */
  finished: boolean;
}

export interface DraftRecord {
  runs: number;
  bestWins: number;
  perfectRuns: number;
  totalWins: number;
}

export interface DraftSave {
  version: 1;
  run: DraftRun | null;
  record: DraftRecord;
}

export interface DraftOffer {
  pick: number;
  tier: DraftTier;
  special: boolean;
  cardIds: string[];
}

type PoolCard = CardDefinition | RelicDefinition;
const deckable = new Set(CAMPAIGN_CARD_IDS);
const POOL: readonly PoolCard[] = [...cards, ...relics].filter((card) => deckable.has(card.id));
const BY_ID = new Map(POOL.map((card) => [card.id, card]));
const isRelic = (card: PoolCard): card is RelicDefinition => card.kind === "relic";
export const tierOf = (card: PoolCard): DraftTier => (isRelic(card) ? "Relic" : (card.rarity as DraftTier));
const inTier = (tier: DraftTier) => POOL.filter((card) => tierOf(card) === tier).map((card) => card.id);
const POOL_BY_TIER: Readonly<Record<DraftTier, readonly string[]>> = {
  Black: inTier("Black"), Purple: inTier("Purple"), Yellow: inTier("Yellow"), Red: inTier("Red"), Relic: inTier("Relic"),
};
/** Mana cost; a relic always prints one, but the type allows none. */
export const draftCost = (card: PoolCard): number => card.cost ?? 0;

/** A small, fast, seedable generator. Its quality is ample for shuffling offers. */
function random(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

function weightedTier(weights: Readonly<Record<DraftTier, number>>, next: () => number): DraftTier {
  const total = TIER_ORDER.reduce((sum, tier) => sum + weights[tier], 0);
  let roll = next() * total;
  for (const tier of TIER_ORDER) {
    roll -= weights[tier];
    if (roll < 0 && weights[tier] > 0) return tier;
  }
  return "Black";
}

export function draftCard(cardId: string): PoolCard | undefined {
  return BY_ID.get(cardId);
}

export function newDraftRun(id: string): DraftRun {
  const next = random(`${id}:powers`);
  return {
    id,
    powerChoices: shuffled(PLAYER_HERO_POWER_IDS, next).slice(0, 3),
    heroPower: null,
    picks: [],
    wins: 0,
    losses: 0,
    draws: 0,
    settled: [],
    activeDuel: null,
    finished: false,
  };
}

export function chooseDraftHeroPower(run: DraftRun, power: HeroPowerId): DraftRun {
  if (run.heroPower || !run.powerChoices.includes(power)) return run;
  return { ...run, heroPower: power };
}

/** The current offer of three, or null once the deck is complete. */
export function draftOffer(run: DraftRun): DraftOffer | null {
  const pick = run.picks.length;
  if (pick >= DRAFT_PICKS) return null;
  const next = random(`${run.id}:pick:${pick}`);
  const special = DRAFT_SPECIAL_PICKS.includes(pick);
  const relicsTaken = run.picks.filter((id) => BY_ID.get(id)?.kind === "relic").length;
  const weights = { ...(special ? SPECIAL_WEIGHTS : ORDINARY_WEIGHTS) };
  if (relicsTaken >= DRAFT_RELIC_CAP) weights.Relic = 0;
  const taken = new Set(run.picks);
  const left = (tier: DraftTier) => POOL_BY_TIER[tier].filter((id) => !taken.has(id));
  let tier = weightedTier(weights, next);
  // A tier with fewer than three cards left steps down towards the commoner
  // tiers; relics step straight to Rare. Rare alone holds 76 cards, far more
  // than one run can take.
  while (left(tier).length < 3 && tier !== "Black") tier = FALLBACK[tier];
  const cardIds = shuffled(left(tier), next).slice(0, 3);
  return { pick, tier, special, cardIds };
}

export function pickDraftCard(run: DraftRun, cardId: string): DraftRun {
  if (!run.heroPower || run.finished) return run;
  const offer = draftOffer(run);
  if (!offer || !offer.cardIds.includes(cardId)) return run;
  return { ...run, picks: [...run.picks, cardId] };
}

export function draftReady(run: DraftRun | null): run is DraftRun {
  return Boolean(run && run.heroPower && run.picks.length === DRAFT_PICKS && !run.finished);
}

/** Which duel of the run comes next, counting draws, so each rival is new. */
export function draftDuelIndex(run: DraftRun): number {
  return run.wins + run.losses + run.draws;
}

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

/** How many cards the rival's picker would like at each cost, 1 to 8+. */
const TARGET_CURVE: Readonly<Record<number, number>> = { 1: 3, 2: 5, 3: 5, 4: 5, 5: 4, 6: 3, 7: 2, 8: 3 };

/**
 * A simple, honest picker for the rival: stats for the cost, a bonus for having
 * an effect, a bonus for the higher tiers, and a pull towards a sane curve.
 * It is meant to build a deck a person might build, not the strongest one.
 */
function rivalScore(card: PoolCard, picked: readonly string[]): number {
  const costBand = Math.min(8, Math.max(1, draftCost(card)));
  const atBand = picked.filter((id) => Math.min(8, Math.max(1, BY_ID.get(id)?.cost ?? 0)) === costBand).length;
  const curvePull = atBand < TARGET_CURVE[costBand] ? 1.2 : -0.8;
  if (isRelic(card)) {
    const relicCount = picked.filter((id) => BY_ID.get(id)?.kind === "relic").length;
    return (relicCount < 3 ? 2.2 : 0.4) + curvePull * 0.5;
  }
  const stats = (card.atk + card.hp) / (draftCost(card) + 1);
  const tierBonus = { Black: 0, Purple: 0.5, Yellow: 0.9, Red: 1.3 }[card.rarity] ?? 0;
  const effectBonus = card.effect ? 0.6 : 0;
  return stats + tierBonus + effectBonus + curvePull;
}

/** A rival's whole drafted deck and Hero Power, seeded by the run and the duel number. */
export function draftRivalDeck(runId: string, duelIndex: number): { deck: string[]; heroPower: HeroPowerId } {
  let rival = newDraftRun(`${runId}:rival:${duelIndex}`);
  rival = chooseDraftHeroPower(rival, rival.powerChoices[0]);
  for (let offer = draftOffer(rival); offer; offer = draftOffer(rival)) {
    const best = offer.cardIds
      .map((id) => ({ id, score: rivalScore(BY_ID.get(id)!, rival.picks) }))
      .sort((a, b) => b.score - a.score)[0];
    rival = pickDraftCard(rival, best.id);
  }
  return { deck: rival.picks, heroPower: rival.heroPower! };
}

export type DraftOutcome = "won" | "lost" | "drawn";

/** Counts one finished duel into the run, once; the run ends at its goal or limit. */
export function recordDraftDuel(save: DraftSave, runId: string, duelId: string, outcome: DraftOutcome): DraftSave {
  const run = save.run;
  if (!run || run.id !== runId || run.finished || run.settled.includes(duelId)) return save;
  const next: DraftRun = {
    ...run,
    wins: run.wins + Number(outcome === "won"),
    losses: run.losses + Number(outcome === "lost"),
    draws: run.draws + Number(outcome === "drawn"),
    settled: [...run.settled, duelId].slice(-40),
    activeDuel: run.activeDuel === duelId ? null : run.activeDuel,
  };
  if (next.wins >= DRAFT_WIN_GOAL || next.losses >= DRAFT_LOSS_LIMIT) return closeRun(save, next);
  return { ...save, run: next };
}

/**
 * Marks a new draft duel as under way. An earlier duel left unfinished is
 * settled as a loss first, and that can end the run, in which case the new duel
 * does not start: the caller checks `draftReady` on the result.
 */
export function beginDraftDuel(save: DraftSave, duelId: string): DraftSave {
  const run = save.run;
  if (!run || run.finished) return save;
  const settledFirst = run.activeDuel && run.activeDuel !== duelId ? recordDraftDuel(save, run.id, run.activeDuel, "lost") : save;
  if (!draftReady(settledFirst.run)) return settledFirst;
  return { ...settledFirst, run: { ...settledFirst.run, activeDuel: duelId } };
}

/** Ends the run where it stands, banking its wins in the record. */
export function retireDraftRun(save: DraftSave): DraftSave {
  return save.run && !save.run.finished ? closeRun(save, save.run) : save;
}

function closeRun(save: DraftSave, run: DraftRun): DraftSave {
  const record = save.record;
  return {
    ...save,
    run: { ...run, activeDuel: null, finished: true },
    record: {
      runs: record.runs + 1,
      bestWins: Math.max(record.bestWins, run.wins),
      perfectRuns: record.perfectRuns + Number(run.wins >= DRAFT_WIN_GOAL),
      totalWins: record.totalWins + run.wins,
    },
  };
}

/** Three cards to show on the rules screen: a Mythic, a Legendary and an Epic. */
export function draftShowcase(seed: string): string[] {
  const next = random(`${seed}:showcase`);
  return (["Purple", "Red", "Yellow"] as const).map((tier) => shuffled(POOL_BY_TIER[tier], next)[0]);
}

export function startDraftRun(save: DraftSave, id: string): DraftSave {
  return { ...save, run: newDraftRun(id) };
}

export function updateDraftRun(save: DraftSave, run: DraftRun): DraftSave {
  return { ...save, run };
}

// --- persistence -----------------------------------------------------------

export const DRAFT_KEY = "convergence.draft.v1";

export function emptyDraftSave(): DraftSave {
  return { version: 1, run: null, record: { runs: 0, bestWins: 0, perfectRuns: 0, totalWins: 0 } };
}

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Reads the draft back, dropping a run that no longer fits the card pool. */
export function parseDraftSave(raw: string | null): DraftSave {
  const empty = emptyDraftSave();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftSave>;
    if (!parsed || parsed.version !== 1) return empty;
    const record = parsed.record ?? empty.record;
    const safeRecord: DraftRecord = {
      runs: count(record.runs), bestWins: Math.min(DRAFT_WIN_GOAL, count(record.bestWins)),
      perfectRuns: count(record.perfectRuns), totalWins: count(record.totalWins),
    };
    const run = parsed.run;
    const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");
    const runOk = run && typeof run.id === "string" && strings(run.picks) && strings(run.settled) &&
      Array.isArray(run.powerChoices) && run.powerChoices.length === 3 &&
      run.powerChoices.every((power) => PLAYER_HERO_POWER_IDS.includes(power)) &&
      (run.heroPower === null || run.powerChoices.includes(run.heroPower)) &&
      run.picks.length <= DRAFT_PICKS && new Set(run.picks).size === run.picks.length &&
      run.picks.every((id) => BY_ID.has(id)) && typeof run.finished === "boolean" &&
      (run.activeDuel === undefined || run.activeDuel === null || typeof run.activeDuel === "string");
    return {
      version: 1,
      record: safeRecord,
      run: runOk ? {
        id: run.id, powerChoices: [...run.powerChoices], heroPower: run.heroPower, picks: [...run.picks],
        wins: Math.min(DRAFT_WIN_GOAL, count(run.wins)), losses: Math.min(DRAFT_LOSS_LIMIT, count(run.losses)), draws: count(run.draws),
        settled: [...run.settled], activeDuel: run.activeDuel ?? null, finished: run.finished,
      } : null,
    };
  } catch {
    return empty;
  }
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
