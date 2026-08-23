import type { BotSkill } from "./engine/bot";
import { STARTING_POOL, unlockReward } from "./unlocks";

/**
 * What survives a duel.
 *
 * Everything else in this game is per-match: the save holds one duel and is
 * thrown away when it ends, so the tenth duel used to be indistinguishable from
 * the first. This file is the only thing that accumulates — a record of results
 * and a record of which cards you have actually met.
 *
 * It is deliberately NOT part of the save. A save is one duel and is cleared on
 * game over; a record outlives every duel and must survive that clearing, so it
 * lives under its own key with its own version. The two have no reason to move
 * together and every reason not to.
 *
 * Per-PC and per-URL by nature, like the save: localStorage. That is the honest
 * shape of a browser game with no account, and it is not worth pretending
 * otherwise.
 */

/** Which opponent a duel was played against. Hotseat is one bucket. */
export type LadderKey = BotSkill | "hotseat";

export const LADDER_KEYS: LadderKey[] = ["easy", "normal", "hard", "hotseat"];

/** The printed name of each opponent level, so the UI never spells one itself. */
export const LADDER_LABEL: Record<LadderKey, string> = {
  easy: "Recruit",
  normal: "Veteran",
  hard: "Ascendant",
  hotseat: "Hotseat",
};

export interface LadderRecord {
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface DuelResult {
  /** Opponent level, or hotseat. */
  ladder: LadderKey;
  /** From the viewer's seat. Hotseat has no losing human, so it records "won". */
  outcome: "won" | "lost" | "drawn";
  /** Turn count, so a record can say something about HOW the duels went. */
  turns: number;
  /** Epoch milliseconds, for ordering the recent list. */
  at: number;
}

export interface Progress {
  version: number;
  /** Result counts per opponent level. */
  ladders: Record<LadderKey, LadderRecord>;
  /** Most recent duels, newest first. */
  recent: DuelResult[];
  /** Card and relic ids that have ever reached your hand. */
  seen: string[];
  /** Card and relic ids you have ever played. */
  played: string[];
  /** Card and relic ids you have played in a duel you went on to win. */
  wonWith: string[];
  /**
   * Every card id in the order they will be unlocked, generated once on the
   * first load and then never reshuffled. See `unlocks.ts` for why this is an
   * order rather than a set.
   */
  unlockOrder: string[];
  /** How far down `unlockOrder` the shared deck currently reaches. */
  unlocked: number;
}

const PROGRESS_VERSION = 2;
const PROGRESS_KEY = `convergence.progress.v${PROGRESS_VERSION}`;

/**
 * Keys this game wrote before the current one. Removed on load rather than left
 * to rot, because a browser profile is the only place any of this lives and a
 * dead key is indistinguishable from a live one when someone comes to debug it.
 *
 * v1 held the record and the collection with no unlock track. It is not migrated
 * on purpose: the roster it described was the whole roster, so carrying it
 * forward would hand a returning player 196 unlocked cards and delete the
 * feature on the machine that most needed it.
 */
const RETIRED_KEYS = ["convergence.progress.v1"];

/** How many finished duels the recent list keeps. */
export const RECENT_LIMIT = 10;

function emptyLadders(): Record<LadderKey, LadderRecord> {
  return {
    easy: { played: 0, won: 0, lost: 0, drawn: 0 },
    normal: { played: 0, won: 0, lost: 0, drawn: 0 },
    hard: { played: 0, won: 0, lost: 0, drawn: 0 },
    hotseat: { played: 0, won: 0, lost: 0, drawn: 0 },
  };
}

export function emptyProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    ladders: emptyLadders(),
    recent: [],
    seen: [],
    played: [],
    wonWith: [],
    // Filled by `ensureUnlockOrder` on the first load that has the roster in
    // hand. This file is deliberately kept free of card data: it is pure and
    // testable precisely because it has never read a CSV.
    unlockOrder: [],
    unlocked: STARTING_POOL,
  };
}

/**
 * Reads the record, repairing anything that does not look right.
 *
 * A record is worth strictly less than a duel, so nothing here ever throws and
 * nothing refuses to load: a field that is the wrong shape is replaced with its
 * empty value and the rest is kept. Losing one counter is a shrug; a crash on
 * the title screen because a number went missing is not.
 */
export function loadProgress(): Progress {
  try {
    for (const key of RETIRED_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (!parsed || typeof parsed !== "object") return emptyProgress();
    const ladders = emptyLadders();
    for (const key of LADDER_KEYS) {
      const saved = parsed.ladders?.[key];
      if (!saved) continue;
      ladders[key] = {
        played: Number(saved.played) || 0,
        won: Number(saved.won) || 0,
        lost: Number(saved.lost) || 0,
        drawn: Number(saved.drawn) || 0,
      };
    }
    const ids = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
    return {
      version: PROGRESS_VERSION,
      ladders,
      recent: Array.isArray(parsed.recent)
        ? parsed.recent
            .filter((entry): entry is DuelResult => Boolean(entry) && typeof entry === "object")
            .slice(0, RECENT_LIMIT)
        : [],
      seen: ids(parsed.seen),
      played: ids(parsed.played),
      wonWith: ids(parsed.wonWith),
      unlockOrder: ids(parsed.unlockOrder),
      // Clamped at the floor, never below it. A corrupted or missing count must
      // fail towards a playable duel: a pool of zero is not a game.
      unlocked: Math.max(STARTING_POOL, Math.floor(Number(parsed.unlocked)) || 0),
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: Progress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // A full or blocked localStorage costs a record, never a duel.
  }
}

/** Union of two id lists, kept sorted so the stored file is stable to diff. */
function merge(existing: readonly string[], added: readonly string[]): string[] {
  if (added.length === 0) return [...existing];
  return [...new Set([...existing, ...added])].sort();
}

/**
 * Folds one finished duel into the record. Pure, so it is testable without a
 * browser and without a clock.
 */
export function recordDuel(
  progress: Progress,
  result: DuelResult,
  cards: { seen: readonly string[]; played: readonly string[] },
): Progress {
  const ladder = progress.ladders[result.ladder] ?? { played: 0, won: 0, lost: 0, drawn: 0 };
  // The reward is capped by the roster, not just added. Everything downstream
  // reads `unlocked` as an index into `unlockOrder`, and an index past the end
  // would quietly report cards that do not exist as newly unlocked.
  const earned = unlockReward(result);
  const unlocked = Math.min(progress.unlockOrder.length || progress.unlocked, progress.unlocked + earned);
  return {
    version: PROGRESS_VERSION,
    unlockOrder: progress.unlockOrder,
    unlocked,
    ladders: {
      ...progress.ladders,
      [result.ladder]: {
        played: ladder.played + 1,
        won: ladder.won + (result.outcome === "won" ? 1 : 0),
        lost: ladder.lost + (result.outcome === "lost" ? 1 : 0),
        drawn: ladder.drawn + (result.outcome === "drawn" ? 1 : 0),
      },
    },
    recent: [result, ...progress.recent].slice(0, RECENT_LIMIT),
    seen: merge(progress.seen, cards.seen),
    played: merge(progress.played, cards.played),
    // Only a win counts here, which is what makes the third collection tier
    // mean anything at all: "I have met this card" and "this card carried a
    // duel" are different facts and the gallery shows them differently.
    wonWith: result.outcome === "won" ? merge(progress.wonWith, cards.played) : [...progress.wonWith],
  };
}

/**
 * Reads a finished duel and folds it in, deciding the outcome here rather than
 * in the component.
 *
 * This exists so the React side is three lines with no judgement in them. The
 * judgement — which ladder, and what counts as a loss — is the part that can be
 * wrong in a way nobody notices for weeks, and it is testable only if it lives
 * somewhere a test can reach.
 */
export function finishDuel(
  progress: Progress,
  duel: {
    winner: 0 | 1 | "draw" | null;
    viewerId: 0 | 1;
    mode: { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };
    turns: number;
    at: number;
  },
  cards: { seen: readonly string[]; played: readonly string[] },
): Progress {
  const ladder: LadderKey = duel.mode.kind === "bot" ? duel.mode.skill : "hotseat";
  const outcome: DuelResult["outcome"] =
    duel.winner === "draw" || duel.winner === null
      ? "drawn"
      : // Hotseat has no losing human at this screen — whoever is sitting here
        // won — so it records a win rather than pretending the device lost.
        duel.mode.kind === "hotseat"
        ? "won"
        : duel.winner === duel.viewerId
          ? "won"
          : "lost";
  return recordDuel(progress, { ladder, outcome, turns: duel.turns, at: duel.at }, cards);
}

/** Totals across every opponent level, for the one headline number. */
export function totals(progress: Progress): LadderRecord {
  return LADDER_KEYS.reduce<LadderRecord>(
    (sum, key) => {
      const record = progress.ladders[key];
      return {
        played: sum.played + record.played,
        won: sum.won + record.won,
        lost: sum.lost + record.lost,
        drawn: sum.drawn + record.drawn,
      };
    },
    { played: 0, won: 0, lost: 0, drawn: 0 },
  );
}

/** Wins against the bot only; hotseat victories do not advance the unlock track. */
export function botWins(progress: Progress): number {
  return (['easy', 'normal', 'hard'] as const).reduce(
    (wins, key) => wins + progress.ladders[key].won,
    0,
  );
}

/** Win percentage, or null when nothing decided has been played yet. */
export function winPct(record: LadderRecord): number | null {
  const decided = record.won + record.lost;
  if (decided === 0) return null;
  return Math.round((record.won / decided) * 100);
}

export function clearProgress(): void {
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to do; the record is not load-bearing.
  }
}
