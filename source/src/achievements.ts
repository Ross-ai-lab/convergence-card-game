/**
 * Achievements: milestones across the collection, the campaign, the Arena and
 * duels, plus a few one-duel feats.
 *
 * Most achievements are read from what the game already saves (the campaign
 * record, the Arena record, the duel ladders), so a returning player is
 * credited for progress made before achievements existed. The rest are feats
 * the saves cannot reconstruct, and are granted when they happen.
 *
 * Achievements keep their own save beside the collection and the Arena. They
 * never award cards, never unlock anything, and clearing them cannot disturb
 * either of those saves.
 */
import { CAMPAIGN_CHAPTERS, CAMPAIGN_INITIAL_COLLECTION } from "./campaign";
import type { DraftSave } from "./draft-core";
import { HERO_POWER_UNLOCK_ORDER, isHeroPowerUnlocked } from "./engine/hero-powers";
import { STARTING_CORE } from "./engine/game";
import type { GameState, PlayerId } from "./engine/types";
import { CAMPAIGN_CARD_IDS, isStarterPreset, type Progress } from "./progress";

export type AchievementCategory = "Champions" | "Collection" | "Duels" | "Arena" | "Feats";
export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = ["Champions", "Collection", "Duels", "Arena", "Feats"];

/** What the saves say, reduced to the numbers achievements are measured on. */
export interface AchievementSnapshot {
  championsDefeated: number;
  /** A champion from universes 15–20, who play with full Ascendant knowledge. */
  ascendantChampionDefeated: boolean;
  cardsOwned: number;
  heroPowersUnlocked: number;
  /** A 30-card saved deck that is not the Starter Deck. */
  ownDeck: boolean;
  /** Campaign and free duels won against the bot. */
  botWins: number;
  localDuels: number;
  /** Arena wins across every run, the one under way included, and the best single run. */
  arena: { totalWins: number; bestWins: number };
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  /** Read from the saves. Without it, the achievement is a feat granted when it happens. */
  measure?: (snapshot: AchievementSnapshot) => { value: number; goal: number };
}

const ROSTER_SIZE = CAMPAIGN_CARD_IDS.length;
const CHAMPIONS = CAMPAIGN_CHAPTERS.length;
/** Universes 15–20: the full Ascendant tier in campaign-design.json. */
const ASCENDANT_CHAPTERS = new Set(CAMPAIGN_CHAPTERS.filter((chapter) => chapter.difficultyId === "ascendant").map((chapter) => chapter.chapter));

const count = (goal: number, read: (snapshot: AchievementSnapshot) => number) => (snapshot: AchievementSnapshot) => ({ value: Math.min(goal, read(snapshot)), goal });
const flag = (read: (snapshot: AchievementSnapshot) => boolean) => (snapshot: AchievementSnapshot) => ({ value: Number(read(snapshot)), goal: 1 });

export const ACHIEVEMENTS: readonly AchievementDefinition[] = Object.freeze([
  { id: "champions-1", category: "Champions", title: "First Contact", description: "Defeat your first champion.", measure: count(1, (s) => s.championsDefeated) },
  { id: "champions-5", category: "Champions", title: "A Quarter of the Multiverse", description: `Defeat 5 of the ${CHAMPIONS} champions.`, measure: count(5, (s) => s.championsDefeated) },
  { id: "champions-10", category: "Champions", title: "Halfway Across", description: `Defeat 10 of the ${CHAMPIONS} champions.`, measure: count(10, (s) => s.championsDefeated) },
  { id: "champions-15", category: "Champions", title: "Three Quarters Converged", description: `Defeat 15 of the ${CHAMPIONS} champions.`, measure: count(15, (s) => s.championsDefeated) },
  { id: "champions-all", category: "Champions", title: "Convergence", description: `Defeat all ${CHAMPIONS} champions.`, measure: count(CHAMPIONS, (s) => s.championsDefeated) },
  { id: "champions-ascendant", category: "Champions", title: "Beyond Fair", description: "Defeat a champion from universes 15–20, the full Ascendant tier.", measure: flag((s) => s.ascendantChampionDefeated) },
  { id: "pleasantries", category: "Champions", title: "Pleasantries", description: "Say Hi to a champion." },

  { id: "cards-60", category: "Collection", title: "Growing Collection", description: "Own 60 cards.", measure: count(60, (s) => s.cardsOwned) },
  { id: "cards-100", category: "Collection", title: "Curator", description: "Own 100 cards.", measure: count(100, (s) => s.cardsOwned) },
  { id: "cards-150", category: "Collection", title: "Archivist", description: "Own 150 cards.", measure: count(150, (s) => s.cardsOwned) },
  { id: "cards-all", category: "Collection", title: "The Complete Collection", description: `Own all ${ROSTER_SIZE} cards.`, measure: count(ROSTER_SIZE, (s) => s.cardsOwned) },
  { id: "hero-powers-all", category: "Collection", title: "Full Arsenal", description: "Unlock every Hero Power.", measure: count(HERO_POWER_UNLOCK_ORDER.length, (s) => s.heroPowersUnlocked) },
  { id: "deckbuilder", category: "Collection", title: "Deckbuilder", description: "Save a complete deck of your own besides the Starter Deck.", measure: flag((s) => s.ownDeck) },

  { id: "wins-10", category: "Duels", title: "Duelist", description: "Win 10 campaign or free duels.", measure: count(10, (s) => s.botWins) },
  { id: "wins-50", category: "Duels", title: "Seasoned Duelist", description: "Win 50 campaign or free duels.", measure: count(50, (s) => s.botWins) },
  { id: "wins-100", category: "Duels", title: "Centurion", description: "Win 100 campaign or free duels.", measure: count(100, (s) => s.botWins) },
  { id: "local-duel", category: "Duels", title: "Couch Rivals", description: "Finish a Local Duel.", measure: count(1, (s) => s.localDuels) },
  { id: "online-win", category: "Duels", title: "Long-Distance Rival", description: "Win an online duel." },
  { id: "tutorial", category: "Duels", title: "Quick Study", description: "Finish the tutorial." },

  { id: "arena-win", category: "Arena", title: "Into the Arena", description: "Win an Arena duel.", measure: count(1, (s) => s.arena.totalWins) },
  { id: "arena-seven", category: "Arena", title: "Seven Wins", description: "Reach seven wins in one Arena run.", measure: count(7, (s) => s.arena.bestWins) },
  { id: "arena-flawless", category: "Arena", title: "Flawless Draft", description: "Reach seven wins in one Arena run without a loss." },
  { id: "arena-wins-25", category: "Arena", title: "Arena Regular", description: "Win 25 Arena duels in total.", measure: count(25, (s) => s.arena.totalWins) },

  { id: "close-call", category: "Feats", title: "Close Call", description: "Win a duel with 3 or less core health." },
  { id: "untouched", category: "Feats", title: "Untouched", description: `Win a duel with your core at full health.` },
  { id: "blitz", category: "Feats", title: "Blitz", description: "Win a duel within your first seven turns." },
  { id: "full-house", category: "Feats", title: "Full House", description: "Win a duel with all four of your board slots filled." },
  { id: "crossover", category: "Feats", title: "Crossover", description: "Win a duel with minions from four different universes on your board." },
  { id: "good-sport", category: "Feats", title: "Good Sport", description: "Say Well played in a duel you go on to lose." },
]);

const KNOWN = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
export function achievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

export const ACHIEVEMENTS_KEY = "convergence.achievements.v1";

export interface AchievementSave {
  version: 1;
  /** Achievement id to the moment it was earned, in epoch milliseconds. */
  earned: Record<string, number>;
  /** Earned achievements the player has already seen on the Achievements page. */
  seen: string[];
}

export function emptyAchievements(): AchievementSave {
  return { version: 1, earned: {}, seen: [] };
}

/** Reads a save, keeping only known achievements and well-formed times. */
export function parseAchievements(raw: string | null): AchievementSave {
  if (!raw) return emptyAchievements();
  try {
    const value = JSON.parse(raw) as Partial<AchievementSave> | null;
    if (!value || value.version !== 1 || typeof value.earned !== "object" || value.earned === null) return emptyAchievements();
    const earned: Record<string, number> = {};
    for (const [id, at] of Object.entries(value.earned)) {
      if (KNOWN.has(id) && typeof at === "number" && Number.isFinite(at)) earned[id] = at;
    }
    const seen = Array.isArray(value.seen) ? [...new Set(value.seen.filter((id): id is string => typeof id === "string" && id in earned))] : [];
    return { version: 1, earned, seen };
  } catch {
    return emptyAchievements();
  }
}

export function loadAchievements(): AchievementSave {
  try { return parseAchievements(window.localStorage.getItem(ACHIEVEMENTS_KEY)); } catch { return emptyAchievements(); }
}
export function saveAchievements(save: AchievementSave): boolean {
  try { window.localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(save)); return true; } catch { return false; }
}
export function clearAchievements(): void {
  try { window.localStorage.removeItem(ACHIEVEMENTS_KEY); } catch { /* Browser storage is unavailable. */ }
}

/**
 * The numbers achievements are measured on. Cards owned and Hero Powers are
 * counted from champions actually defeated, so the developer unlock never
 * earns a collection achievement.
 */
export function achievementSnapshot(progress: Progress, draft: Pick<DraftSave, "run" | "record">): AchievementSnapshot {
  const defeated = new Set(progress.completedBosses);
  const owned = new Set([...CAMPAIGN_INITIAL_COLLECTION, ...CAMPAIGN_CHAPTERS.filter((chapter) => defeated.has(chapter.chapter)).flatMap((chapter) => chapter.rewardCardIds)]);
  const { easy, normal, hard, hotseat } = progress.ladders;
  return {
    championsDefeated: defeated.size,
    ascendantChampionDefeated: [...defeated].some((chapter) => ASCENDANT_CHAPTERS.has(chapter)),
    cardsOwned: owned.size,
    heroPowersUnlocked: HERO_POWER_UNLOCK_ORDER.filter((power) => isHeroPowerUnlocked(power, defeated.size)).length,
    ownDeck: progress.savedDecks.some((deck) => !isStarterPreset(deck) && deck.cards.length === 30),
    botWins: easy.won + normal.won + hard.won,
    localDuels: hotseat.played,
    // A run's wins join the record only when it closes, so the run under way counts here too.
    arena: {
      totalWins: draft.record.totalWins + (draft.run && !draft.run.finished ? draft.run.wins : 0),
      bestWins: Math.max(draft.record.bestWins, draft.run?.wins ?? 0),
    },
  };
}

/** Grants `ids` that are not yet earned; `earned` lists only the new ones, in order. */
export function grantAchievements(save: AchievementSave, ids: readonly string[], at: number): { save: AchievementSave; earned: string[] } {
  const fresh = [...new Set(ids)].filter((id) => KNOWN.has(id) && !(id in save.earned));
  if (!fresh.length) return { save, earned: [] };
  const earned = { ...save.earned };
  for (const id of fresh) earned[id] = at;
  return { save: { ...save, earned }, earned: fresh };
}

/** Grants every measured achievement the saves now satisfy. */
export function grantMeasured(save: AchievementSave, snapshot: AchievementSnapshot, at: number) {
  const met = ACHIEVEMENTS.filter((achievement) => {
    const measured = achievement.measure?.(snapshot);
    return measured !== undefined && measured.value >= measured.goal;
  }).map((achievement) => achievement.id);
  return grantAchievements(save, met, at);
}

export function unseenAchievements(save: AchievementSave): number {
  return Object.keys(save.earned).filter((id) => !save.seen.includes(id)).length;
}
export function markAchievementsSeen(save: AchievementSave): AchievementSave {
  return unseenAchievements(save) === 0 ? save : { ...save, seen: Object.keys(save.earned) };
}

/** Origins that are not a universe: the Basic cards and Hero Power tokens. */
const NOT_A_UNIVERSE = new Set(["Basic", "Hero Power"]);

/**
 * The one-duel feats a finished duel earned for the player in `seat`.
 * A duel only counts when it was won fairly: never in the tutorial, a Local
 * Duel, a developer duel or with infinite mana.
 */
export function duelFeats(state: Pick<GameState, "winner" | "players">, seat: PlayerId): string[] {
  if (state.winner !== seat) return [];
  const me = state.players[seat];
  const feats: string[] = [];
  if (me.health > 0 && me.health <= 3) feats.push("close-call");
  if (me.health >= STARTING_CORE) feats.push("untouched");
  if (me.turnsStarted <= 7) feats.push("blitz");
  const board = me.board.filter((minion) => minion !== null);
  if (board.length >= 4) feats.push("full-house");
  if (new Set(board.map((minion) => minion.origin).filter((origin) => origin && !NOT_A_UNIVERSE.has(origin))).size >= 4) feats.push("crossover");
  return feats;
}
