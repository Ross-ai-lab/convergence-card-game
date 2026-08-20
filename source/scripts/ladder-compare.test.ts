import { describe, expect, it } from "vitest";

import {
  compareLadders,
  mcnemarP,
  type LadderGame,
  type LadderRun,
} from "./ladder-compare";

/**
 * The whole point of this module is to stop a comparison from returning a
 * confident wrong answer, so the tests care most about the refusals.
 */

function games(pattern: string): LadderGame[] {
  // "WLD" -> game 0 won, game 1 lost, game 2 drawn. Seeds are positional.
  return [...pattern].map((mark, index) => ({
    seed: `sim-ladder-hard-normal-${index}`,
    strongSeat: index % 2,
    strongWon: mark === "W" ? true : mark === "L" ? false : null,
    turns: 20,
  }));
}

function run(pattern: string, overrides: Partial<LadderRun> = {}): LadderRun {
  const decided = [...pattern].filter((mark) => mark !== "D").length;
  const wins = [...pattern].filter((mark) => mark === "W").length;
  return {
    generatedAt: "2026-08-17T00:00:00.000Z",
    seedPrefix: "sim",
    dials: { enemyBranch: 3 },
    matchups: [
      {
        key: "hard>normal",
        strong: "hard",
        weak: "normal",
        played: pattern.length,
        decided,
        winPct: decided === 0 ? 0 : Math.round((wins / decided) * 1000) / 10,
        medianTurns: 20,
        results: games(pattern),
      },
    ],
    ...overrides,
  };
}

describe("the sign test", () => {
  it("says nothing happened when the flips cancel", () => {
    expect(mcnemarP(5, 5)).toBe(1);
  });

  it("says nothing happened when there were no flips at all", () => {
    expect(mcnemarP(0, 0)).toBe(1);
  });

  it("calls a one-sided run of flips real", () => {
    // Ten flips, all the same direction, is 2 * 0.5^10.
    expect(mcnemarP(0, 10)).toBeCloseTo(0.001953, 6);
    expect(mcnemarP(0, 10)).toBeLessThan(0.05);
  });

  it("is not fooled by a small lopsided count", () => {
    // Three flips one way, none the other, is the classic false positive if you
    // squint at percentages instead of testing.
    expect(mcnemarP(0, 3)).toBeGreaterThan(0.05);
  });

  it("is symmetric, because direction is the caller's business", () => {
    expect(mcnemarP(2, 9)).toBe(mcnemarP(9, 2));
  });

  it("stays a probability on a long ladder", () => {
    const p = mcnemarP(90, 110);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("pairing two runs", () => {
  it("finds a real improvement that a percentage comparison would bury", () => {
    // 12 duels. The strong side won 6 before and 6 after, so both runs report
    // exactly 50% and subtracting them says "nothing changed". Game by game,
    // every single result flipped in the same direction that matters.
    const before = run("WWWWWWLLLLLL");
    const after = run("LLLLLLWWWWWW");
    expect(before.matchups[0].winPct).toBe(after.matchups[0].winPct);

    const [row] = compareLadders(before, after).rows;
    expect(row.paired).toBe(12);
    expect(row.lost).toBe(6);
    expect(row.gained).toBe(6);
    // Six flips each way is genuinely no evidence, which is the honest verdict.
    expect(row.verdict).toBe("no measurable change");
  });

  it("reports a one-sided shift as improved", () => {
    const before = run("LLLLLLLLLLLL");
    const after = run("WWWWWWWWWWWL");
    const [row] = compareLadders(before, after).rows;
    expect(row.gained).toBe(11);
    expect(row.lost).toBe(0);
    expect(row.delta).toBeCloseTo(91.7, 1);
    expect(row.verdict).toBe("improved");
    expect(row.pValue).toBeLessThan(0.05);
  });

  it("reports a one-sided collapse as worsened", () => {
    const before = run("WWWWWWWWWWWW");
    const after = run("LLLLLLLLLLLW");
    const [row] = compareLadders(before, after).rows;
    expect(row.verdict).toBe("worsened");
  });

  it("leaves draws and unfinished duels out of the pairing", () => {
    const before = run("WDLDW");
    const after = run("WDLDW");
    const [row] = compareLadders(before, after).rows;
    expect(row.paired).toBe(3);
  });

  it("names the dials that changed, so the reader is not left guessing", () => {
    const before = run("WWLL");
    const after = run("WWLL", { dials: { enemyBranch: 5 } });
    expect(compareLadders(before, after).dialChanges).toEqual(["enemyBranch: 3 -> 5"]);
  });

  it("says plainly when the bot did not change at all", () => {
    expect(compareLadders(run("WWLL"), run("WWLL")).dialChanges).toEqual([]);
  });
});

describe("refusing rather than approximating", () => {
  it("refuses two runs that never played the same duels", () => {
    const before = run("WWLL");
    const after = run("WWLL", { seedPrefix: "other" });
    const comparison = compareLadders(before, after);
    expect(comparison.refused).toContain("different seeds");
    expect(comparison.rows).toHaveLength(0);
  });

  it("refuses a baseline that predates a dial this run sets", () => {
    // The signature of the shared-file trap: `.preview/balance/ladder.json` was
    // replaced by a parallel session's run between the baseline being taken and
    // the comparison being made, so the "baseline" is a stranger's bot. A dial
    // reading `undefined -> <value>` is the tell, and it used to be a line in
    // the output that was easy to read past on the way to a confident number.
    const before = run("WWLL", { dials: {} });
    const after = run("WWLL", { dials: { enemyBranch: 3, deepLines: 5 } });
    const comparison = compareLadders(before, after);
    expect(comparison.refused).toContain("written by a different bot");
    expect(comparison.refused).toContain("deepLines");
    expect(comparison.rows).toHaveLength(0);
  });

  it("does not refuse a dial the baseline simply changed", () => {
    // A dial with a value on both sides is an ordinary A/B, which is the entire
    // purpose of this tool. Only a MISSING dial means a different bot.
    const before = run("WWLL", { dials: { enemyBranch: 3 } });
    const after = run("WWLL", { dials: { enemyBranch: 5 } });
    expect(compareLadders(before, after).refused).toBeUndefined();
  });

  it("refuses a matchup whose sample size changed", () => {
    // This is the 80-to-100 case. The extra duels are new seeds, so the old run
    // has nothing to pair them against and a partial pairing would silently
    // measure a different set of games.
    const [row] = compareLadders(run("WWLL"), run("WWLLWW")).rows;
    expect(row.refused).toContain("different duels");
  });

  it("refuses a matchup the earlier run never measured", () => {
    const before = run("WWLL");
    before.matchups[0].key = "hard>easy";
    const [row] = compareLadders(before, run("WWLL")).rows;
    expect(row.refused).toContain("missing from the earlier run");
  });

  it("refuses a run written before per-game recording existed", () => {
    const before = run("WWLL");
    delete before.matchups[0].results;
    const [row] = compareLadders(before, run("WWLL")).rows;
    expect(row.refused).toContain("predates per-game recording");
  });
});
