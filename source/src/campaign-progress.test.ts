import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STARTER_DECK, CAMPAIGN_INITIAL_COLLECTION } from "./campaign";
import { acknowledgeRewards, botWins, campaignComplete, canPlayChapter, emptyProgress, finishDuel, loadProgress,
  PROGRESS_KEY, saveDeckDraft, saveProgress, selectHeroPower, unlockAllProgress, type Progress } from "./progress";
import { HERO_POWER_UNLOCK_ORDER } from "./engine/hero-powers";
import { randomDeck, validateDeck } from "./decks";
import { cards, relics } from "./data/cards";
import { createCampaignDuel } from "./campaign-duel";
import { loadGame, saveGame } from "./storage";

const roster = [...cards, ...relics].map(({ id }) => id);
const history = { seen: ["c001"], played: ["c001"] };
function finish(progress: Progress, chapter: number, winner: 0 | 1 | "draw" = 0, duelId = `chapter-${chapter}`) {
  return finishDuel(progress, { winner, viewerId: 0, turns: 12, at: 1000,
    mode: { kind: "campaign", chapter, skill: "normal", duelId } }, history);
}
function memory() {
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal("window", { localStorage }); return { values, localStorage };
}
afterEach(() => vi.unstubAllGlobals());

describe("campaign progression transactions", () => {
  it("starts with a thirty-card deck, thirty-two unlocked cards, chapter one and no power", () => {
    const progress = emptyProgress(); expect(progress.unlockedIds).toEqual(CAMPAIGN_INITIAL_COLLECTION);
    expect(progress.playerDeck).toEqual(CAMPAIGN_STARTER_DECK); expect(progress.hotseatDeck).toEqual(CAMPAIGN_STARTER_DECK);
    expect(canPlayChapter(progress, 1)).toBe(true); expect(canPlayChapter(progress, 2)).toBe(false);
    expect(campaignComplete(progress)).toBe(false); expect(botWins(progress)).toBe(0); expect(progress.selectedHeroPower).toBeNull();
  });
  it("atomically clears a chapter, grants its exact reward, opens the next and unlocks a power", () => {
    const before = emptyProgress(); const after = finish(before, 1);
    expect(after.completedChapters).toBe(1); expect(after.unlockedIds).toEqual([...CAMPAIGN_INITIAL_COLLECTION, ...CAMPAIGN_CHAPTERS[0].rewardCardIds]);
    expect(after.pendingRewards).toEqual(CAMPAIGN_CHAPTERS[0].rewardCardIds);
    expect(after.playerDeck).toEqual(before.playerDeck); expect(after.hotseatDeck).toEqual(before.hotseatDeck);
    expect(after.selectedHeroPower).toBe("core_heal"); expect(canPlayChapter(after, 2)).toBe(true); expect(canPlayChapter(after, 3)).toBe(false);
    expect(before.completedChapters).toBe(0);
  });
  it.each([1, "draw"] as const)("result %s gives no cards, power or chapter advance", (winner) => {
    const after = finish(emptyProgress(), 1, winner);
    expect(after.unlockedIds).toEqual(CAMPAIGN_INITIAL_COLLECTION); expect(after.pendingRewards).toEqual([]);
    expect(after.completedChapters).toBe(0); expect(botWins(after)).toBe(0);
  });
  it("cannot skip a chapter, farm a replay, or process a saved victory twice", () => {
    expect(finish(emptyProgress(), 2).completedChapters).toBe(0);
    const won = finish(emptyProgress(), 1); expect(finish(won, 1)).toBe(won);
    const claimed = acknowledgeRewards(won); const replay = finish(claimed, 1, 0, "replay");
    expect(replay.pendingRewards).toEqual([]); expect(replay.unlockedIds).toEqual(won.unlockedIds);
    expect(botWins(replay)).toBe(1); expect(replay.completedChapters).toBe(1);
  });
  it("free and hotseat wins grant no unlocks or powers", () => {
    for (const mode of [{ kind: "bot", skill: "hard" }, { kind: "hotseat" }] as const) {
      const result = finishDuel(emptyProgress(), { winner: 0, viewerId: 0, turns: 5, at: 1, mode }, history);
      expect(result.pendingRewards).toEqual([]); expect(result.unlockedIds).toEqual(CAMPAIGN_INITIAL_COLLECTION); expect(botWins(result)).toBe(0);
    }
  });
  it("all twenty first clears grant every card once and unlock free play only at the end", () => {
    let progress = emptyProgress();
    for (let chapter = 1; chapter <= 20; chapter++) {
      progress = acknowledgeRewards(finish(progress, chapter));
      expect(campaignComplete(progress)).toBe(chapter === 20);
      expect(new Set(progress.unlockedIds).size).toBe(progress.unlockedIds.length);
      expect(progress.playerDeck).toHaveLength(30);
    }
    expect([...progress.unlockedIds].sort()).toEqual([...roster].sort());
    expect(progress.unlockedIds).toHaveLength(218); expect(progress.completedChapters).toBe(20);
  });
  it("developer-assisted chapter wins count without granting arbitrary deck fillers", () => {
    const won = finish(emptyProgress(), 1);
    const unrelated = CAMPAIGN_CHAPTERS[0].deckCardIds.filter((id) => !CAMPAIGN_STARTER_DECK.includes(id) && !CAMPAIGN_CHAPTERS[0].rewardCardIds.includes(id));
    expect(unrelated.length).toBeGreaterThan(0); for (const id of unrelated) expect(won.unlockedIds).not.toContain(id);
    const developer = unlockAllProgress(emptyProgress()); expect(canPlayChapter(developer, 20)).toBe(false);
    const assisted = finish(developer, 1); expect(assisted.completedChapters).toBe(1); expect(assisted.pendingRewards).toEqual([]);
  });
});

describe("campaign persistence and editing", () => {
  it("resets old records and duels without touching sound preferences", () => {
    const { values } = memory(); values.set("convergence.progress.v2", JSON.stringify({ unlocked: 216 }));
    values.set("convergence.save.v27", JSON.stringify({ version: 27 })); values.set("sound-preference", "keep");
    expect(loadProgress()).toEqual(emptyProgress()); expect(loadGame()).toBeNull();
    expect(values.has("convergence.progress.v2")).toBe(false); expect(values.has("convergence.save.v27")).toBe(false);
    expect(values.get("sound-preference")).toBe("keep");
  });
  it("keeps an unviewed reward through reload, acknowledges it once, and never repays the saved duel", () => {
    memory(); const won = finish(emptyProgress(), 1); expect(saveProgress(won)).toBe(true);
    const loaded = loadProgress(); expect(loaded.pendingRewards).toEqual(CAMPAIGN_CHAPTERS[0].rewardCardIds);
    expect(finish(loaded, 1)).toBe(loaded); saveProgress(acknowledgeRewards(loaded));
    expect(loadProgress().pendingRewards).toEqual([]); expect(loadProgress().unlockedIds).toHaveLength(41);
  });
  it("allows initial Basic alternatives and persists incomplete drafts", () => {
    memory(); const fresh = emptyProgress();
    const initialSwap=saveDeckDraft(fresh,[...fresh.playerDeck.slice(1),"c186"]);
    expect(initialSwap.playerDeck).toContain("c186");
    expect(initialSwap.playerDeck).toHaveLength(30);
    const won = finish(fresh, 1); const draft = saveDeckDraft(won, won.playerDeck.slice(1)); saveProgress(draft);
    expect(loadProgress().playerDeck).toHaveLength(29); expect(validateDeck(loadProgress().playerDeck, roster, won.unlockedIds).valid).toBe(false);
    const complete = saveDeckDraft(draft, [...draft.playerDeck, CAMPAIGN_CHAPTERS[0].rewardCardIds[0]]);
    expect(validateDeck(complete.playerDeck, roster, complete.unlockedIds).valid).toBe(true);
    expect(saveDeckDraft(complete, [...complete.playerDeck, "c001"])).toBe(complete);
    expect(saveDeckDraft(complete, [...complete.playerDeck.slice(1), "c041"])).toBe(complete);
  });
  it("edits the second hotseat deck without changing the personal deck", () => {
    const progress = finish(emptyProgress(), 1); const edited = saveDeckDraft(progress, progress.hotseatDeck.slice(1), 1);
    expect(edited.playerDeck).toEqual(progress.playerDeck); expect(edited.hotseatDeck).toHaveLength(29);
  });
  it("persists selected unlocked powers and rejects locked ones", () => {
    memory(); let progress = finish(emptyProgress(), 1); expect(selectHeroPower(progress, "minion_hp_down")).toBe(progress);
    progress = finish(progress, 2); progress = selectHeroPower(progress, HERO_POWER_UNLOCK_ORDER[1]); saveProgress(progress);
    expect(loadProgress().selectedHeroPower).toBe("enemy_core_damage");
  });
  it("repairs corrupted ownership without granting a future boss", () => {
    const { values } = memory(); values.set(PROGRESS_KEY, JSON.stringify({ ...emptyProgress(), completedChapters: 1,
      unlockedIds: ["c041"], playerDeck: ["c041", "unknown"], pendingRewards: ["c041", "unknown"] }));
    const repaired = loadProgress(); expect(repaired.unlockedIds).toHaveLength(41); expect(repaired.unlockedIds).not.toContain("c041");
    expect(repaired.playerDeck).toEqual([]); expect(repaired.pendingRewards).toEqual([]);
  });
  it("reports a failed save rather than claiming it persisted", () => {
    const { localStorage } = memory(); vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveProgress(emptyProgress())).toBe(false);
  });
  it("restores chapter identity and cheat settings without changing the duel's deck snapshot", () => {
    memory(); const duel = createCampaignDuel({ chapter: 1, playerDeck: CAMPAIGN_STARTER_DECK, unlockedCardIds: CAMPAIGN_STARTER_DECK, cards, relics, seed: "resume" });
    saveGame(duel.state, [], { kind: "campaign", chapter: 1, skill: "easy", duelId: "resume" }, 1);
    const restored = loadGame()!; expect(restored.mode).toEqual({ kind: "campaign", chapter: 1, skill: "easy", duelId: "resume" });
    expect(restored.game).toEqual(duel.state);
  });
  it("free opponents use thirty random unique cards without mutating the roster", () => {
    const copy = [...roster]; const a = randomDeck(roster, "a");
    expect(a).toHaveLength(30); expect(new Set(a).size).toBe(30); expect(a).toEqual(randomDeck(roster, "a"));
    expect(a).not.toEqual(randomDeck(roster, "b")); expect(roster).toEqual(copy);
    expect(() => randomDeck(roster.slice(0, 29), "short")).toThrow();
  });
});
