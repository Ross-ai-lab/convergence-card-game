import { CAMPAIGN_DIFFICULTIES, getCampaignChapter } from "./campaign";
import { validateDeck } from "./decks";
import { createInitialGame } from "./engine/game";
import type { CardDefinition, HeroPowerId, RelicDefinition } from "./engine/types";

/** Campaign bosses and players both start at 50 Core HP. */
export const CAMPAIGN_BOSS_HEALTH = 50;

/** Engine entry point only. Chapter availability and first-clear rewards belong to chunk 3. */
export function createCampaignDuel(options: {
  chapter: number;
  playerDeck: readonly string[];
  unlockedCardIds: Iterable<string>;
  cards: CardDefinition[];
  relics: RelicDefinition[];
  seed: string;
  heroPower?: HeroPowerId | null;
}) {
  const chapter = getCampaignChapter(options.chapter);
  if (!chapter) throw new Error(`Unknown campaign chapter: ${options.chapter}`);
  const rosterIds = [...options.cards, ...options.relics.filter((relic) => relic.relicId !== "none")].map(({ id }) => id);
  const validation = validateDeck(options.playerDeck, rosterIds, options.unlockedCardIds);
  if (!validation.valid) throw new Error(`Invalid player deck: ${JSON.stringify(validation.issues)}`);
  const difficulty = CAMPAIGN_DIFFICULTIES[chapter.difficultyId];
  const state = createInitialGame(options.cards, options.seed, options.relics, {
    decks: [options.playerDeck, chapter.deckCardIds],
    botCheats: [null, difficulty.cheats],
    heroPowers: [options.heroPower ?? null, chapter.heroPowerId],
    hasCoin: false,
  });
  const boss = options.cards.find(({ id }) => id === chapter.bossId);
  if (!boss) throw new Error(`Campaign boss is missing from the roster: ${chapter.bossId}`);
  state.players[1].name = boss.name;
  state.players[1].health = CAMPAIGN_BOSS_HEALTH;
  return { state, chapter: chapter.chapter, difficulty };
}
