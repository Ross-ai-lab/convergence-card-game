import type { BotSkill } from "./engine/bot";
import type { HeroPowerId } from "./engine/types";
import type { SavedMode } from "./storage";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STARTER_DECK, CAMPAIGN_INITIAL_COLLECTION, getCampaignChapter } from "./campaign";
import { firstUnlockedHeroPower, isHeroPowerUnlocked, HERO_POWER_UNLOCK_ORDER } from "./engine/hero-powers";

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
  chapter?: number;
  duelId?: string;
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
  storyIntroduced: boolean;
  pendingBossSpeech: number | null;
  version: number;
  developerCheat: boolean;
  ladders: Record<LadderKey, LadderRecord>;
  recent: DuelResult[];
  seen: string[];
  played: string[];
  wonWith: string[];
  completedChapters: number;
  unlockedIds: string[];
  playerDeck: string[];
  hotseatDeck: string[];
  selectedHeroPower: HeroPowerId | null;
  pendingRewards: string[];
  settledDuels: string[];
}

export const PROGRESS_VERSION = 3;
export const PROGRESS_KEY = "convergence.progress.v3";
export const RECENT_LIMIT = 10;
export const CAMPAIGN_CARD_IDS: readonly string[] = Object.freeze([
  ...CAMPAIGN_INITIAL_COLLECTION, ...CAMPAIGN_CHAPTERS.flatMap((chapter) => chapter.rewardCardIds),
]);
const roster = new Set(CAMPAIGN_CARD_IDS);
const emptyRecord = (): LadderRecord => ({ played: 0, won: 0, lost: 0, drawn: 0 });

export function emptyProgress(): Progress {
  return {
    storyIntroduced: false, pendingBossSpeech: null,
    version: PROGRESS_VERSION, developerCheat: false,
    ladders: { easy: emptyRecord(), normal: emptyRecord(), hard: emptyRecord(), hotseat: emptyRecord() },
    recent: [], seen: [], played: [], wonWith: [], completedChapters: 0,
    unlockedIds: [...CAMPAIGN_INITIAL_COLLECTION], playerDeck: [...CAMPAIGN_STARTER_DECK],
    hotseatDeck: [...CAMPAIGN_STARTER_DECK], selectedHeroPower: null, pendingRewards: [], settledDuels: [],
  };
}

export function campaignComplete(progress: Progress): boolean { return progress.completedChapters === CAMPAIGN_CHAPTERS.length; }
export function canPlayChapter(progress: Progress, chapter: number): boolean {
  return Boolean(getCampaignChapter(chapter)) && chapter <= progress.completedChapters + 1;
}
/** Player powers advance only on first chapter clears, never replay/free/hotseat wins. */
export function botWins(progress: Progress): number {
  return progress.developerCheat ? HERO_POWER_UNLOCK_ORDER.length : progress.completedChapters;
}
function knownIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && roster.has(id)))] : [];
}
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** One-time development cutover. Sound/fullscreen preferences are intentionally untouched. */
export function loadProgress(): Progress {
  try {
    for (const key of ["convergence.progress.v1", "convergence.progress.v2"]) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const saved = JSON.parse(raw) as Partial<Progress>;
    if (!saved || saved.version !== PROGRESS_VERSION) return emptyProgress();
    const progress = emptyProgress();
    progress.completedChapters = Math.min(CAMPAIGN_CHAPTERS.length, count(saved.completedChapters));
    progress.storyIntroduced = saved.storyIntroduced === true;
    progress.pendingBossSpeech = typeof saved.pendingBossSpeech === "number" && getCampaignChapter(saved.pendingBossSpeech) && saved.pendingBossSpeech <= progress.completedChapters ? saved.pendingBossSpeech : null;
    progress.developerCheat = saved.developerCheat === true;
    const earned = [...CAMPAIGN_INITIAL_COLLECTION, ...CAMPAIGN_CHAPTERS.slice(0, progress.completedChapters).flatMap((chapter) => chapter.rewardCardIds)];
    // Reconstruct only legitimate earned IDs. Missing fields cannot unlock future bosses.
    progress.unlockedIds = progress.developerCheat ? [...CAMPAIGN_CARD_IDS] : earned;
    const allowed = new Set(progress.unlockedIds);
    const draft = (value: unknown) => Array.isArray(value)
      ? knownIds(value).filter((id) => allowed.has(id)).slice(0, 30) : [...CAMPAIGN_STARTER_DECK];
    progress.playerDeck = canEditDeck(progress) ? draft(saved.playerDeck) : [...CAMPAIGN_STARTER_DECK];
    progress.hotseatDeck = canEditDeck(progress) ? draft(saved.hotseatDeck) : [...CAMPAIGN_STARTER_DECK];
    progress.pendingRewards = knownIds(saved.pendingRewards).filter((id) => allowed.has(id));
    progress.seen = knownIds(saved.seen); progress.played = knownIds(saved.played); progress.wonWith = knownIds(saved.wonWith);
    progress.selectedHeroPower = saved.selectedHeroPower && isHeroPowerUnlocked(saved.selectedHeroPower, botWins(progress))
      ? saved.selectedHeroPower : firstUnlockedHeroPower(botWins(progress));
    progress.settledDuels = Array.isArray(saved.settledDuels) ? saved.settledDuels.filter((id): id is string => typeof id === "string").slice(-200) : [];
    for (const key of LADDER_KEYS) {
      const record = saved.ladders?.[key];
      if (record) progress.ladders[key] = { played: count(record.played), won: count(record.won), lost: count(record.lost), drawn: count(record.drawn) };
    }
    progress.recent = Array.isArray(saved.recent) ? saved.recent.filter((result) => result && LADDER_KEYS.includes(result.ladder) && ["won", "lost", "drawn"].includes(result.outcome)).slice(0, RECENT_LIMIT) : [];
    return progress;
  } catch { return emptyProgress(); }
}

export function saveProgress(progress: Progress): boolean {
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
export function clearProgress(): void {
  try { window.localStorage.removeItem(PROGRESS_KEY); } catch { /* Browser storage is unavailable. */ }
}
export function unlockAllProgress(progress: Progress): Progress {
  return { ...progress, developerCheat: true, unlockedIds: [...CAMPAIGN_CARD_IDS],
    selectedHeroPower: progress.selectedHeroPower ?? firstUnlockedHeroPower(HERO_POWER_UNLOCK_ORDER.length) };
}
export function acknowledgeRewards(progress: Progress): Progress { return { ...progress, pendingRewards: [] }; }
export function acknowledgeBossSpeech(progress: Progress): Progress { return {...progress, pendingBossSpeech: null}; }
export function canEditDeck(progress: Progress): boolean { return progress.completedChapters > 0 || progress.developerCheat || progress.unlockedIds.length > CAMPAIGN_STARTER_DECK.length; }
export function selectHeroPower(progress: Progress, power: HeroPowerId): Progress {
  return isHeroPowerUnlocked(power, botWins(progress)) ? { ...progress, selectedHeroPower: power } : progress;
}
export function saveDeckDraft(progress: Progress, deck: readonly string[], seat: 0 | 1 = 0): Progress {
  if (!canEditDeck(progress)) return progress;
  const allowed = new Set(progress.unlockedIds);
  if (deck.length > 30 || new Set(deck).size !== deck.length || deck.some((id) => !allowed.has(id))) return progress;
  return { ...progress, [seat === 0 ? "playerDeck" : "hotseatDeck"]: [...deck] };
}
const merge = (left: readonly string[], right: readonly string[]) => [...new Set([...left, ...right])];

/** A single pure transaction covers first clear, card ownership, powers and pending pack. */
export function recordDuel(progress: Progress, result: DuelResult, cards: { seen: readonly string[]; played: readonly string[] }): Progress {
  if (result.duelId && progress.settledDuels.includes(result.duelId)) return progress;
  const firstClear = result.outcome === "won" && result.ladder !== "hotseat" && result.chapter === progress.completedChapters + 1
    ? getCampaignChapter(result.chapter) : undefined;
  const awarded = firstClear?.rewardCardIds.filter((id) => !progress.unlockedIds.includes(id)) ?? [];
  const old = progress.ladders[result.ladder];
  const completedChapters = firstClear ? firstClear.chapter : progress.completedChapters;
  const next: Progress = {
    ...progress, completedChapters, unlockedIds: merge(progress.unlockedIds, awarded),
    pendingBossSpeech: result.outcome === "won" && result.ladder !== "hotseat" && result.chapter && getCampaignChapter(result.chapter) && result.chapter <= completedChapters ? result.chapter : progress.pendingBossSpeech,
    pendingRewards: merge(progress.pendingRewards, awarded),
    settledDuels: result.duelId ? [...progress.settledDuels, result.duelId].slice(-200) : progress.settledDuels,
    ladders: { ...progress.ladders, [result.ladder]: { played: old.played + 1,
      won: old.won + Number(result.outcome === "won"), lost: old.lost + Number(result.outcome === "lost"), drawn: old.drawn + Number(result.outcome === "drawn") } },
    recent: [result, ...progress.recent].slice(0, RECENT_LIMIT),
    seen: merge(progress.seen, cards.seen), played: merge(progress.played, cards.played),
    wonWith: result.outcome === "won" ? merge(progress.wonWith, cards.played) : progress.wonWith,
  };
  next.selectedHeroPower ??= firstUnlockedHeroPower(botWins(next));
  return next;
}
export function finishDuel(progress: Progress, duel: {
  winner: 0 | 1 | "draw" | null; viewerId: 0 | 1; mode: SavedMode; turns: number; at: number;
}, cards: { seen: readonly string[]; played: readonly string[] }): Progress {
  return recordDuel(progress, {
    ladder: duel.mode.kind === "hotseat" ? "hotseat" : duel.mode.skill,
    outcome: duel.winner === "draw" || duel.winner === null ? "drawn" : duel.mode.kind === "hotseat" || duel.winner === duel.viewerId ? "won" : "lost",
    turns: duel.turns, at: duel.at, duelId: duel.mode.duelId,
    ...(duel.mode.kind === "campaign" ? { chapter: duel.mode.chapter } : {}),
  }, cards);
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

/** Win percentage, or null when nothing decided has been played yet. */
export function winPct(record: LadderRecord): number | null {
  const decided = record.won + record.lost;
  if (decided === 0) return null;
  return Math.round((record.won / decided) * 100);
}
