import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS, achievementSnapshot, duelFeats, emptyAchievements, grantAchievements, grantMeasured,
  markAchievementsSeen, parseAchievements, unseenAchievements,
} from "./achievements";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_DIFFICULTIES } from "./campaign";
import { cards, relics } from "./data/cards";
import { emptyDraftSave } from "./draft-core";
import { createInitialGame } from "./engine/game";
import { spawnTestMinion } from "./engine/test-utils";
import type { GameState } from "./engine/types";
import { CAMPAIGN_CARD_IDS, createNamedDeck, emptyProgress, finishDuel, saveDeckDraft, unlockAllProgress, type Progress } from "./progress";

function clearChapters(progress: Progress, chapters: readonly number[]): Progress {
  for (const chapter of chapters) {
    const skill = CAMPAIGN_DIFFICULTIES[CAMPAIGN_CHAPTERS[chapter - 1].difficultyId].botSkill;
    progress = finishDuel(progress, { winner: 0, viewerId: 0, turns: 12, at: chapter, mode: { kind: "campaign", chapter, skill, duelId: `test-${chapter}` } }, { seen: [], played: [] });
  }
  return progress;
}
const earnedFrom = (progress: Progress, draft = emptyDraftSave()) =>
  grantMeasured(emptyAchievements(), achievementSnapshot(progress, draft), 1).earned;

describe("achievements", () => {
  it("has unique ids and something to say for each", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const achievement of ACHIEVEMENTS) expect(achievement.title && achievement.description).toBeTruthy();
  });

  it("marks the quarter, half, three-quarter and full campaign milestones", () => {
    expect(earnedFrom(emptyProgress())).toEqual([]);
    const five = earnedFrom(clearChapters(emptyProgress(), [1, 2, 3, 4, 5]));
    expect(five).toEqual(expect.arrayContaining(["champions-1", "champions-5"]));
    expect(five).not.toContain("champions-10");
    const all = earnedFrom(clearChapters(emptyProgress(), CAMPAIGN_CHAPTERS.map((c) => c.chapter)));
    expect(all).toEqual(expect.arrayContaining(["champions-10", "champions-15", "champions-all", "champions-ascendant", "cards-all", "hero-powers-all"]));
  });

  it("counts Beyond Fair only for the full Ascendant chapters 15–20", () => {
    expect(earnedFrom(clearChapters(emptyProgress(), [14]))).not.toContain("champions-ascendant");
    expect(earnedFrom(clearChapters(emptyProgress(), [15]))).toContain("champions-ascendant");
  });

  it("counts cards from champions defeated, so the developer unlock earns nothing", () => {
    const unlocked = unlockAllProgress(emptyProgress());
    expect(unlocked.unlockedIds).toHaveLength(CAMPAIGN_CARD_IDS.length);
    expect(earnedFrom(unlocked)).not.toContain("cards-60");
    expect(earnedFrom(unlocked)).not.toContain("hero-powers-all");
  });

  it("reads card milestones from the reward packs", () => {
    const progress = clearChapters(emptyProgress(), CAMPAIGN_CHAPTERS.map((c) => c.chapter).slice(0, 10));
    const snapshot = achievementSnapshot(progress, emptyDraftSave());
    expect(snapshot.cardsOwned).toBe(new Set(progress.unlockedIds).size);
    const earned = earnedFrom(progress);
    expect(earned.includes("cards-60")).toBe(snapshot.cardsOwned >= 60);
    expect(earned.includes("cards-100")).toBe(snapshot.cardsOwned >= 100);
  });

  it("needs a complete deck of the player's own for Deckbuilder", () => {
    const named = createNamedDeck(emptyProgress(), "Mine");
    expect(earnedFrom(named)).not.toContain("deckbuilder");
    expect(earnedFrom(saveDeckDraft(named, emptyProgress().playerDeck))).toContain("deckbuilder");
  });

  it("counts the Arena run under way as well as finished runs", () => {
    const draft = emptyDraftSave();
    const running = { ...draft, run: { id: "r", powerChoices: [], heroPower: null, picks: [], wins: 1, losses: 0, draws: 0, settled: [], activeDuel: null, history: [], finished: false } };
    expect(earnedFrom(emptyProgress(), running)).toContain("arena-win");
    expect(earnedFrom(emptyProgress(), { ...draft, record: { runs: 3, bestWins: 7, perfectRuns: 1, totalWins: 25 } })).toEqual(
      expect.arrayContaining(["arena-win", "arena-seven", "arena-wins-25"]));
  });

  it("grants once, keeps the first date, and tracks what is new", () => {
    const first = grantAchievements(emptyAchievements(), ["tutorial", "tutorial", "not-an-achievement"], 10);
    expect(first.earned).toEqual(["tutorial"]);
    const again = grantAchievements(first.save, ["tutorial"], 20);
    expect(again.earned).toEqual([]);
    expect(again.save.earned.tutorial).toBe(10);
    expect(unseenAchievements(again.save)).toBe(1);
    expect(unseenAchievements(markAchievementsSeen(again.save))).toBe(0);
  });

  it("reads back only known achievements from a save", () => {
    expect(parseAchievements(null)).toEqual(emptyAchievements());
    expect(parseAchievements("{broken")).toEqual(emptyAchievements());
    expect(parseAchievements(JSON.stringify({ version: 1, earned: { tutorial: 5, bogus: 6, blitz: "x" }, seen: ["tutorial", "bogus"] })))
      .toEqual({ version: 1, earned: { tutorial: 5 }, seen: ["tutorial"] });
  });

  describe("duel feats", () => {
    const library = Object.fromEntries(cards.map((card) => [card.id, card]));
    const byOrigin = (origin: string) => cards.find((card) => card.origin === origin)!;
    function finished(edit: (state: GameState) => void): GameState {
      const state = createInitialGame(cards, "feats", relics);
      state.phase = "gameOver";
      state.winner = 0;
      edit(state);
      return state;
    }

    it("only counts a win", () => {
      expect(duelFeats(finished((s) => { s.winner = 1; }), 0)).toEqual([]);
      expect(duelFeats(finished((s) => { s.winner = "draw"; }), 0)).toEqual([]);
    });

    it("reads core health, turns and the board", () => {
      expect(duelFeats(finished((s) => { s.players[0].health = 2; s.players[0].turnsStarted = 12; }), 0)).toEqual(["close-call"]);
      expect(duelFeats(finished((s) => { s.players[0].turnsStarted = 6; }), 0)).toEqual(["untouched", "blitz"]);
      const four = ["Star Wars", "One Piece", "MCU", "Baki"].map((origin) => spawnTestMinion(byOrigin(origin), 0));
      expect(duelFeats(finished((s) => { s.players[0].health = 20; s.players[0].turnsStarted = 9; s.players[0].board = four; }), 0)).toEqual(["full-house", "crossover"]);
      const sameWorld = [spawnTestMinion(library[four[0].cardId], 0), ...four.slice(1, 3), spawnTestMinion(byOrigin("Basic"), 0)];
      expect(duelFeats(finished((s) => { s.players[0].health = 20; s.players[0].turnsStarted = 9; s.players[0].board = sameWorld; }), 0)).toEqual(["full-house"]);
    });
  });
});
