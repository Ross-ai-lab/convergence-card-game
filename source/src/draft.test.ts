import { describe, expect, it } from "vitest";
import {
  beginDraftDuel, chooseDraftHeroPower, draftBotSkill, draftCard, draftDifficulty, draftOffer, draftReady, draftRivalDeck,
  DRAFT_LOSS_LIMIT, DRAFT_PICKS, DRAFT_RELIC_CAP, DRAFT_WIN_GOAL, emptyDraftSave, newDraftRun, parseDraftSave,
  pickDraftCard, recordDraftDuel, retireDraftRun, startDraftRun, tierOf, type DraftRun, type DraftSave,
} from "./draft";
import { validateDeck } from "./decks";
import { CAMPAIGN_CARD_IDS } from "./progress";

/** Drafts a whole deck by always taking the first card offered. */
function draftAll(id: string): DraftRun {
  let run = newDraftRun(id);
  run = chooseDraftHeroPower(run, run.powerChoices[0]);
  for (let offer = draftOffer(run); offer; offer = draftOffer(run)) run = pickDraftCard(run, offer.cardIds[0]);
  return run;
}

describe("Arena draft", () => {
  it("offers three distinct Hero Powers, then three cards of one tier per pick", () => {
    const run = newDraftRun("seed-a");
    expect(new Set(run.powerChoices).size).toBe(3);
    expect(pickDraftCard(run, draftOffer(run)!.cardIds[0])).toBe(run); // no picks before a power
    const ready = chooseDraftHeroPower(run, run.powerChoices[1]);
    const offer = draftOffer(ready)!;
    expect(offer.cardIds).toHaveLength(3);
    expect(new Set(offer.cardIds.map((id) => tierOf(draftCard(id)!)))).toEqual(new Set([offer.tier]));
  });

  it("is deterministic: the same run shows the same offer after a reload", () => {
    const run = chooseDraftHeroPower(newDraftRun("seed-b"), newDraftRun("seed-b").powerChoices[0]);
    const first = draftOffer(run);
    const reloaded = parseDraftSave(JSON.stringify(startDraftRun(emptyDraftSave(), "seed-b")));
    const again = draftOffer(chooseDraftHeroPower(reloaded.run!, reloaded.run!.powerChoices[0]));
    expect(again).toEqual(first);
  });

  it("refuses a card that is not in the current offer", () => {
    const run = chooseDraftHeroPower(newDraftRun("seed-c"), newDraftRun("seed-c").powerChoices[0]);
    const outsider = CAMPAIGN_CARD_IDS.find((id) => !draftOffer(run)!.cardIds.includes(id))!;
    expect(pickDraftCard(run, outsider)).toBe(run);
  });

  it("builds a legal thirty-card deck with no duplicates, across many seeds", () => {
    for (let index = 0; index < 40; index++) {
      const run = draftAll(`deck-${index}`);
      expect(run.picks).toHaveLength(DRAFT_PICKS);
      expect(draftReady(run)).toBe(true);
      expect(validateDeck(run.picks, CAMPAIGN_CARD_IDS, CAMPAIGN_CARD_IDS).valid).toBe(true);
      expect(run.picks.filter((id) => draftCard(id)!.kind === "relic").length).toBeLessThanOrEqual(DRAFT_RELIC_CAP);
    }
  });

  it("makes picks 1, 11 and 21 Legendary or Mythic", () => {
    for (let index = 0; index < 20; index++) {
      const run = draftAll(`special-${index}`);
      for (const pick of [0, 10, 20]) expect(["Yellow", "Red"]).toContain(tierOf(draftCard(run.picks[pick])!));
    }
  });

  it("gives every rival a legal deck of its own", () => {
    const rival = draftRivalDeck("rival-seed", 0);
    expect(validateDeck(rival.deck, CAMPAIGN_CARD_IDS, CAMPAIGN_CARD_IDS).valid).toBe(true);
    expect(draftRivalDeck("rival-seed", 0)).toEqual(rival);
    expect(draftRivalDeck("rival-seed", 1).deck).not.toEqual(rival.deck);
  });

  it("climbs from Recruit to the fair Ascendant as wins mount", () => {
    expect(draftDifficulty(0)).toBe("recruit");
    expect(draftDifficulty(2)).toBe("veteran");
    expect(draftDifficulty(5)).toBe("ascendantFair");
    expect(draftBotSkill(6)).toBe("hard");
  });

  it("counts each duel once and ends at seven wins", () => {
    let save = startDraftRun(emptyDraftSave(), "run-w");
    save = { ...save, run: draftAll("run-w") };
    for (let duel = 0; duel < DRAFT_WIN_GOAL; duel++) {
      save = recordDraftDuel(save, "run-w", `d${duel}`, "won");
      save = recordDraftDuel(save, "run-w", `d${duel}`, "won");
    }
    expect(save.run!.wins).toBe(DRAFT_WIN_GOAL);
    expect(save.run!.finished).toBe(true);
    expect(save.record).toEqual({ runs: 1, bestWins: 7, perfectRuns: 1, totalWins: 7 });
    expect(recordDraftDuel(save, "run-w", "late", "won")).toBe(save);
  });

  it("ends at three losses; draws replay; retiring banks the wins", () => {
    let save: DraftSave = { ...emptyDraftSave(), run: draftAll("run-l") };
    save = recordDraftDuel(save, "run-l", "a", "won");
    save = recordDraftDuel(save, "run-l", "b", "drawn");
    for (let loss = 0; loss < DRAFT_LOSS_LIMIT; loss++) save = recordDraftDuel(save, "run-l", `l${loss}`, "lost");
    expect(save.run).toMatchObject({ wins: 1, draws: 1, losses: 3, finished: true });
    expect(save.record.bestWins).toBe(1);
    let retired: DraftSave = { ...save, run: draftAll("run-r") };
    retired = recordDraftDuel(retired, "run-r", "x", "won");
    retired = retireDraftRun(retired);
    expect(retired.run!.finished).toBe(true);
    expect(retired.record).toMatchObject({ runs: 2, totalWins: 2 });
  });

  it("ignores a result for a different run", () => {
    const save = { ...emptyDraftSave(), run: draftAll("mine") };
    expect(recordDraftDuel(save, "other", "z", "won")).toBe(save);
  });

  it("drops a damaged save rather than restoring a broken run", () => {
    expect(parseDraftSave("not json").run).toBeNull();
    const damaged = JSON.parse(JSON.stringify({ ...emptyDraftSave(), run: draftAll("dmg") }));
    damaged.run.picks[0] = damaged.run.picks[1];
    expect(parseDraftSave(JSON.stringify(damaged)).run).toBeNull();
    const fine = { ...emptyDraftSave(), run: draftAll("ok") };
    expect(parseDraftSave(JSON.stringify(fine))).toEqual(fine);
  });

  it("counts a draft duel left unfinished as a loss when the next one starts", () => {
    let save: DraftSave = { ...emptyDraftSave(), run: draftAll("walk") };
    save = beginDraftDuel(save, "one");
    expect(save.run!.activeDuel).toBe("one");
    save = beginDraftDuel(save, "two");
    expect(save.run).toMatchObject({ losses: 1, activeDuel: "two" });
    save = recordDraftDuel(save, "walk", "two", "won");
    expect(save.run).toMatchObject({ wins: 1, losses: 1, activeDuel: null });
    expect(beginDraftDuel(beginDraftDuel(save, "three"), "three").run!.losses).toBe(1);
  });

  it("does not start a duel when the forfeited one ends the run", () => {
    let save: DraftSave = { ...emptyDraftSave(), run: { ...draftAll("edge"), losses: 2 } };
    save = beginDraftDuel(save, "a");
    save = beginDraftDuel(save, "b");
    expect(save.run).toMatchObject({ losses: 3, finished: true, activeDuel: null });
    expect(draftReady(save.run)).toBe(false);
  });

  it("keeps each duel's result and deciding card, and survives a reload with them", () => {
    let save: DraftSave = { ...emptyDraftSave(), run: draftAll("hist") };
    save = recordDraftDuel(save, "hist", "a", "won", "c001");
    save = recordDraftDuel(save, "hist", "b", "lost", null);
    expect(save.run!.history).toEqual([{ outcome: "won", mvpCardId: "c001" }, { outcome: "lost", mvpCardId: null }]);
    expect(parseDraftSave(JSON.stringify(save)).run!.history).toEqual(save.run!.history);
    const older = JSON.parse(JSON.stringify(save)); delete older.run.history;
    expect(parseDraftSave(JSON.stringify(older)).run!.history).toEqual([]);
  });
});
