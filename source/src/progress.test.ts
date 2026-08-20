import { describe, expect, it } from "vitest";

import { emptyProgress, finishDuel, recordDuel, totals, winPct, RECENT_LIMIT, type DuelResult } from "./progress";

const won: DuelResult = { ladder: "hard", outcome: "won", turns: 21, at: 1_000 };
const lost: DuelResult = { ladder: "hard", outcome: "lost", turns: 18, at: 2_000 };

function cardsPlayed(...ids: string[]) {
  return { seen: ids, played: ids };
}

describe("the duel record", () => {
  it("counts a result against the opponent it was played against", () => {
    const after = recordDuel(emptyProgress(), won, cardsPlayed("c001"));
    expect(after.ladders.hard).toEqual({ played: 1, won: 1, lost: 0, drawn: 0 });
    // The other levels must not move. A record that quietly credits Recruit for
    // an Ascendant win is worse than no record.
    expect(after.ladders.easy).toEqual({ played: 0, won: 0, lost: 0, drawn: 0 });
    expect(after.ladders.normal.played).toBe(0);
  });

  it("keeps the newest duels first and stops at the limit", () => {
    let progress = emptyProgress();
    for (let index = 0; index < RECENT_LIMIT + 4; index += 1) {
      progress = recordDuel(progress, { ...won, at: index }, cardsPlayed("c001"));
    }
    expect(progress.recent).toHaveLength(RECENT_LIMIT);
    expect(progress.recent[0].at).toBe(RECENT_LIMIT + 3);
    expect(progress.ladders.hard.played).toBe(RECENT_LIMIT + 4);
  });

  it("counts a card as won-with only when the duel was actually won", () => {
    const afterLoss = recordDuel(emptyProgress(), lost, cardsPlayed("c001", "c002"));
    expect(afterLoss.seen).toEqual(["c001", "c002"]);
    expect(afterLoss.played).toEqual(["c001", "c002"]);
    // The whole point of the third tier: a card you played in a duel you lost is
    // met, not proven. Collapsing the two would make the mark mean nothing.
    expect(afterLoss.wonWith).toEqual([]);

    const afterWin = recordDuel(afterLoss, won, cardsPlayed("c002", "c003"));
    expect(afterWin.wonWith).toEqual(["c002", "c003"]);
  });

  it("never counts the same card twice", () => {
    let progress = recordDuel(emptyProgress(), won, cardsPlayed("c001", "c001", "c002"));
    progress = recordDuel(progress, won, cardsPlayed("c002", "c003"));
    expect(progress.seen).toEqual(["c001", "c002", "c003"]);
    expect(progress.played).toEqual(["c001", "c002", "c003"]);
  });

  it("does not mutate the record it was handed", () => {
    // The record is React state, so an in-place edit would leave the title screen
    // and the gallery showing yesterday's numbers with nothing to explain why.
    const before = emptyProgress();
    recordDuel(before, won, cardsPlayed("c001"));
    expect(before.ladders.hard.played).toBe(0);
    expect(before.seen).toEqual([]);
    expect(before.recent).toEqual([]);
  });

  it("adds up every opponent for the headline figure", () => {
    let progress = recordDuel(emptyProgress(), won, cardsPlayed("c001"));
    progress = recordDuel(progress, { ...lost, ladder: "easy" }, cardsPlayed("c002"));
    progress = recordDuel(progress, { ...won, ladder: "hotseat" }, cardsPlayed("c003"));
    expect(totals(progress)).toEqual({ played: 3, won: 2, lost: 1, drawn: 0 });
  });

  it("has no win rate until something has been decided", () => {
    expect(winPct({ played: 0, won: 0, lost: 0, drawn: 0 })).toBeNull();
    // A draw is played but not decided, so it must not read as a 0% record.
    expect(winPct({ played: 3, won: 0, lost: 0, drawn: 3 })).toBeNull();
    expect(winPct({ played: 4, won: 3, lost: 1, drawn: 0 })).toBe(75);
  });

  it("leaves a draw out of both the won and lost columns", () => {
    const after = recordDuel(emptyProgress(), { ...won, outcome: "drawn" }, cardsPlayed("c001"));
    expect(after.ladders.hard).toEqual({ played: 1, won: 0, lost: 0, drawn: 1 });
    expect(after.wonWith).toEqual([]);
  });
});

describe("reading a finished duel", () => {
  const cards = { seen: ["c001"], played: ["c001"] };
  const base = { viewerId: 0 as const, turns: 20, at: 1 };

  it("credits the opponent level the duel was played against", () => {
    const after = finishDuel(emptyProgress(), { ...base, winner: 0, mode: { kind: "bot", skill: "hard" } }, cards);
    expect(after.ladders.hard).toEqual({ played: 1, won: 1, lost: 0, drawn: 0 });
  });

  it("counts the bot winning as a loss for the player", () => {
    const after = finishDuel(emptyProgress(), { ...base, winner: 1, mode: { kind: "bot", skill: "normal" } }, cards);
    expect(after.ladders.normal.lost).toBe(1);
    expect(after.wonWith).toEqual([]);
  });

  it("reads the viewer's seat rather than assuming seat zero", () => {
    // Hotseat seats the viewer on either side, and a record that always treated
    // player 0 as "me" would report the wrong result for half of them.
    const after = finishDuel(
      emptyProgress(),
      { ...base, viewerId: 1, winner: 1, mode: { kind: "bot", skill: "easy" } },
      cards,
    );
    expect(after.ladders.easy.won).toBe(1);
  });

  it("never records a hotseat duel as a loss", () => {
    // Both seats are the same person at the same laptop. Whoever won, the device
    // did not lose, and a losing column here would be meaningless.
    const after = finishDuel(emptyProgress(), { ...base, winner: 1, mode: { kind: "hotseat" } }, cards);
    expect(after.ladders.hotseat).toEqual({ played: 1, won: 1, lost: 0, drawn: 0 });
  });

  it("treats a draw and an unfinished winner alike", () => {
    const drawn = finishDuel(emptyProgress(), { ...base, winner: "draw", mode: { kind: "hotseat" } }, cards);
    expect(drawn.ladders.hotseat.drawn).toBe(1);
    // `winner: null` at game over should not be reachable, but if it ever is,
    // guessing a winner is worse than recording the duel as undecided.
    const none = finishDuel(emptyProgress(), { ...base, winner: null, mode: { kind: "hotseat" } }, cards);
    expect(none.ladders.hotseat.drawn).toBe(1);
  });
});
