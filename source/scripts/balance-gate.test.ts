/**
 * Live fire for the balance gate.
 *
 * Every check in here is proved by planting the exact failure it exists to catch
 * and watching it, AND ONLY IT, go red. A check that has never failed is
 * decoration, and a check that fires on its
 * neighbour's failure is worse than none at all.
 *
 * This is the fast half of the proof: it takes milliseconds and pins the
 * comparators. The slow half — planting real defects in the engine and the card
 * data and watching a whole simulation run go red — is recorded in the README,
 * because it costs minutes per plant and cannot live in a test suite.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LEAD_CHECKPOINTS, OPENING_TURNS } from "./sim-core";
import {
  checkConfigAgainstHarness,
  diffRuns,
  evaluate,
  formatGateBlock,
  parseConfig,
  REQUIRED_CHECKS,
  summarise,
  tierOutliers,
  watchlist,
  type BalanceConfig,
  type CardRow,
  type CheckResult,
  type GateMetrics,
  type RunSnapshot,
} from "./balance-gate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A configuration with every threshold set, so "everything else passes" is meaningful. */
function config(): BalanceConfig {
  return parseConfig({
    sample: {
      minDecidedGamesForCoinFlip: 800,
      minFinishedGamesForLength: 200,
      minGamesForOpening: 400,
      minGamesPerLadderMatchup: 75,
      minLeadGamesForSnowball: 200,
      minCardDrawnForRates: 40,
      minCardPlaysForTier: 60,
    },
    checks: {
      coinFlip: { enabled: true, minPct: 44, maxPct: 56 },
      matchLength: { enabled: true, minMedianTurns: 18, maxMedianTurns: 26 },
      softLocks: { enabled: true, max: 0 },
      stalls: { enabled: true, max: 0 },
      invariants: { enabled: true, max: 0 },
      draws: { enabled: true, maxPct: 0.5 },
      deadOpening: { enabled: true, throughOwnTurns: 3, maxPct: 5 },
      skillLadder: {
        enabled: true,
        games: { "hard>easy": 80, "hard>normal": 80, "normal>easy": 200 },
        floors: { "hard>easy": 60, "hard>normal": 55, "normal>easy": 53 },
      },
      snowball: { enabled: true, atTurn: 5, maxLeaderWinPct: 78 },
    },
    report: {
      watchlistPlayRatePct: 20,
      tierOutlierZ: 2,
      tierOutlierMinDeltaPct: 6,
      diffNoiseMultiple: 2,
      historyRunsKept: 20,
    },
  });
}

/** A game that is working. Every check green. */
function healthy(): GateMetrics {
  return {
    decidedGames: 1480,
    firstWinPct: 49,
    finishedGames: 1500,
    medianTurns: 21,
    softLocks: 0,
    stalls: 0,
    fuzzStalls: 0,
    invariantBreaches: 0,
    draws: 0,
    concludedGames: 1480,
    opening: { samples: 3000, deadThroughWindowPct: 2, deadTurnOnePct: 88.4 },
    // Sample sizes match what the shipped config actually runs: the two hard
    // matchups are expensive and have wide margins, so they get 80 duels; the
    // cheap one with the narrow margin gets 200.
    ladder: [
      { key: "hard>easy", strong: "hard", weak: "easy", played: 80, decided: 79, winPct: 79.2 },
      { key: "hard>normal", strong: "hard", weak: "normal", played: 80, decided: 79, winPct: 71.6 },
      { key: "normal>easy", strong: "normal", weak: "easy", played: 200, decided: 198, winPct: 62.4 },
    ],
    snowball: { turn: 5, leadGames: 1400, tiedGames: 100, leaderWinPct: 70 },
  };
}

const find = (results: CheckResult[], id: string): CheckResult => {
  const hit = results.find((result) => result.id === id);
  if (!hit) throw new Error(`no check with id "${id}" — the gate is missing a check it is supposed to run`);
  return hit;
};

/** The core assertion of this whole file: this one is red, everything else is green. */
function expectOnlyFailure(results: CheckResult[], id: string) {
  expect(find(results, id).state, `${id} should have failed`).toBe("fail");
  const collateral = results.filter((result) => result.id !== id && result.state !== "pass");
  expect(collateral.map((result) => `${result.id}:${result.state}`), "no other check may react").toEqual([]);
}

describe("the healthy baseline", () => {
  it("passes every check, so a planted failure below means something", () => {
    const results = evaluate(healthy(), config());
    expect(results.filter((result) => result.state !== "pass")).toEqual([]);
    expect(results).toHaveLength(11);
    expect(summarise(results).verdict).toBe("PASS — all 11 checks green");
  });
});

describe("live fire — does it end at all", () => {
  it("catches a soft-lock", () => {
    expectOnlyFailure(evaluate({ ...healthy(), softLocks: 1 }, config()), "soft-locks");
  });

  it("catches a stalled duel", () => {
    expectOnlyFailure(evaluate({ ...healthy(), stalls: 1 }, config()), "stalls");
  });

  it("does NOT fail on a fuzz stall — that is the fuzzer's behaviour, not the game's", () => {
    // Found on the first real 1500-duel run: bot play stalled zero times and the
    // fuzzer stalled once. Two seats picking legal moves at random can honestly
    // miss a turn cap, and gating on it reports the harness as a game defect.
    const results = evaluate({ ...healthy(), stalls: 0, fuzzStalls: 3 }, config());
    expect(find(results, "stalls").state).toBe("pass");
    expect(find(results, "stalls").measured).toMatch(/3 under random fuzz play, not gated/);
  });

  it("still fails on a bot stall even when the fuzzer is quiet", () => {
    expectOnlyFailure(evaluate({ ...healthy(), stalls: 2, fuzzStalls: 0 }, config()), "stalls");
  });

  it("catches an invariant breach", () => {
    expectOnlyFailure(evaluate({ ...healthy(), invariantBreaches: 1 }, config()), "invariants");
  });

  it("has no sample floor on those three — one occurrence in a tiny run is still a bug", () => {
    const tiny = { ...healthy(), decidedGames: 20, finishedGames: 20, softLocks: 1 };
    expect(find(evaluate(tiny, config()), "soft-locks").state).toBe("fail");
  });
});

describe("live fire — first-player advantage", () => {
  it("catches the first player winning too often", () => {
    expectOnlyFailure(evaluate({ ...healthy(), firstWinPct: 58 }, config()), "coin-flip");
  });

  it("catches the first player winning too rarely", () => {
    expectOnlyFailure(evaluate({ ...healthy(), firstWinPct: 41 }, config()), "coin-flip");
  });

  it("accepts the widened band the owner set — 46% is fine, 43% is not", () => {
    expect(find(evaluate({ ...healthy(), firstWinPct: 46 }, config()), "coin-flip").state).toBe("pass");
    expect(find(evaluate({ ...healthy(), firstWinPct: 43.9 }, config()), "coin-flip").state).toBe("fail");
  });
});

describe("live fire — pacing", () => {
  it("catches duels that end too fast", () => {
    expectOnlyFailure(evaluate({ ...healthy(), medianTurns: 15 }, config()), "match-length");
  });

  it("catches duels that drag", () => {
    expectOnlyFailure(evaluate({ ...healthy(), medianTurns: 31 }, config()), "match-length");
  });
});

describe("live fire — opening hands", () => {
  it("catches openings where nothing can be played for three turns", () => {
    const metrics = healthy();
    metrics.opening = { samples: 3000, deadThroughWindowPct: 9.4, deadTurnOnePct: 88.4 };
    expectOnlyFailure(evaluate(metrics, config()), "dead-opening");
  });

  it("never gates on the turn-1 number, however bad it looks", () => {
    const metrics = healthy();
    // Going first means two cards and one mana: a dead first turn is the design.
    metrics.opening = { samples: 3000, deadThroughWindowPct: 2, deadTurnOnePct: 99 };
    expect(find(evaluate(metrics, config()), "dead-opening").state).toBe("pass");
  });
});

describe("live fire — does skill win", () => {
  // One check per matchup, not one check for "the ladder". A single check would
  // stay green while one difficulty quietly stopped being a difficulty (R-ps-98).
  for (const key of ["hard>easy", "hard>normal", "normal>easy"]) {
    it(`catches ${key} collapsing, and leaves the other two alone`, () => {
      const metrics = healthy();
      const target = metrics.ladder?.find((entry) => entry.key === key);
      if (!target) throw new Error("missing matchup");
      target.winPct = 51;
      expectOnlyFailure(evaluate(metrics, config()), `ladder:${key}`);
    });
  }

  it("rejects a matchup that clears its floor but is still inside the noise", () => {
    const metrics = healthy();
    const target = metrics.ladder?.find((entry) => entry.key === "normal>easy");
    if (!target) throw new Error("missing matchup");
    target.winPct = 56;
    target.decided = 160;
    const result = find(evaluate(metrics, config()), "ladder:normal>easy");
    expect(result.state).toBe("fail");
    expect(result.note).toMatch(/not distinguishable from a coin flip/);
  });
});

describe("live fire — snowballing", () => {
  it("catches an early lead converting too often", () => {
    const metrics = healthy();
    metrics.snowball = { turn: 5, leadGames: 1400, tiedGames: 100, leaderWinPct: 91 };
    expectOnlyFailure(evaluate(metrics, config()), "snowball");
  });
});

describe("skips are not passes", () => {
  it("skips the coin flip below its sample floor instead of passing it", () => {
    const results = evaluate({ ...healthy(), decidedGames: 300 }, config());
    const check = find(results, "coin-flip");
    expect(check.state).toBe("skip");
    expect(check.note).toMatch(/needs 800 decided duels/);
  });

  it("skips every ladder matchup when the ladder did not run", () => {
    const results = evaluate({ ...healthy(), ladder: null }, config());
    for (const key of ["hard>easy", "hard>normal", "normal>easy"]) {
      expect(find(results, `ladder:${key}`).state).toBe("skip");
    }
    expect(find(results, `ladder:hard>easy`).note).toMatch(/check:balance/);
  });

  it("skips a ladder matchup that ran too few duels to mean anything", () => {
    const metrics = healthy();
    const target = metrics.ladder?.find((entry) => entry.key === "hard>easy");
    if (!target) throw new Error("missing matchup");
    target.played = 30;
    target.decided = 30;
    target.winPct = 100;
    const check = find(evaluate(metrics, config()), "ladder:hard>easy");
    expect(check.state).toBe("skip");
    expect(check.note).toMatch(/needs 75 duels per matchup/);
  });

  it("skips a check whose threshold is still null, rather than reading null as a green light", () => {
    const loose = config();
    loose.checks.deadOpening.maxPct = null;
    loose.checks.snowball.maxLeaderWinPct = null;
    const results = evaluate(healthy(), loose);
    expect(find(results, "dead-opening").state).toBe("skip");
    expect(find(results, "snowball").state).toBe("skip");
    expect(find(results, "snowball").note).toMatch(/not a pass/);
  });

  it("skips measurements the run never collected", () => {
    const results = evaluate({ ...healthy(), opening: null, snowball: null }, config());
    expect(find(results, "dead-opening").state).toBe("skip");
    expect(find(results, "snowball").state).toBe("skip");
  });

  it("never folds a skip into the pass count, and says so in the verdict", () => {
    const results = evaluate({ ...healthy(), decidedGames: 300, ladder: null }, config());
    const summary = summarise(results);
    expect(summary.skipped).toBe(4);
    expect(summary.passed).toBe(7);
    expect(summary.passed + summary.skipped).toBe(results.length);
    expect(summary.verdict).not.toBe("PASS — all 11 checks green");
    expect(summary.verdict).toMatch(/PASS WITH 4 SKIPPED/);
    expect(formatGateBlock(results)).toMatch(/A skipped check is NOT a pass/);
  });

  it("a skip does not turn a red run green", () => {
    const results = evaluate({ ...healthy(), decidedGames: 300, softLocks: 2 }, config());
    const summary = summarise(results);
    expect(summary.green).toBe(false);
    expect(summary.verdict).toMatch(/^FAIL/);
  });
});

// ---------------------------------------------------------------------------
// Everything below was written because an adversarial reviewer broke the gate.
// Each block reproduces one hole it found, so the hole cannot come back.
// ---------------------------------------------------------------------------

describe("holes found by adversarial review", () => {
  it("does not report a confident zero for something it never measured", () => {
    // `npm run sim -- --mode fuzz` plays no bot duels at all, and the three
    // hygiene checks have no sample floor — so `?? 0` printed
    // "Stalled duels (bot play): 0 — PASS" over an empty run.
    const results = evaluate(
      { ...healthy(), softLocks: null, stalls: null, invariantBreaches: null, draws: null },
      config(),
    );
    for (const id of ["soft-locks", "stalls", "invariants", "draws"]) {
      expect(find(results, id).state, `${id} must skip, not pass`).toBe("skip");
    }
    expect(find(results, "stalls").note).toMatch(/zero is not the same as nothing/);
    expect(summarise(results).verdict).toMatch(/SKIPPED/);
  });

  it("keeps a disabled check visible instead of deleting it from the run", () => {
    const off = config();
    off.checks.coinFlip.enabled = false;
    off.checks.snowball.enabled = false;
    const results = evaluate(healthy(), off);
    expect(results).toHaveLength(11);
    expect(find(results, "coin-flip").state).toBe("skip");
    expect(find(results, "coin-flip").note).toMatch(/disabled in balance.config.json/);
    expect(summarise(results).verdict).not.toMatch(/all 9 checks green/);
  });

  it("fails loudly when a ladder matchup has no floor, instead of dropping the check", () => {
    // Deleting floors["normal>easy"] used to remove the check entirely and the
    // verdict read "PASS — all 9 checks green" while normal was losing to easy.
    const gapped = config();
    delete (gapped.checks.skillLadder.floors as Record<string, number>)["normal>easy"];
    const results = evaluate(healthy(), gapped);
    expect(results).toHaveLength(11);
    const check = find(results, "ladder:normal>easy");
    expect(check.state).toBe("fail");
    expect(check.note).toMatch(/may not vanish from the gate/);
  });

  it("refuses a config that mistypes a ladder matchup rather than silently dropping it", () => {
    const raw = JSON.parse(JSON.stringify(config())) as Record<string, never>;
    const ladder = (raw.checks as Record<string, Record<string, Record<string, number>>>).skillLadder;
    ladder.floors["norml>easy"] = ladder.floors["normal>easy"];
    delete ladder.floors["normal>easy"];
    expect(() => parseConfig(raw)).toThrow(/unknown ladder matchup "norml>easy"/);
  });

  it("always accounts for every required check, whatever the config says", () => {
    const results = evaluate(healthy(), config());
    const ids = new Set(results.map((r) => r.id));
    for (const id of REQUIRED_CHECKS) expect(ids.has(id), `missing ${id}`).toBe(true);
    expect(results).toHaveLength(REQUIRED_CHECKS.length);
  });

  it("catches duels ending in a draw, which every other denominator silently excludes", () => {
    const metrics = { ...healthy(), draws: 400, concludedGames: 1480 };
    expectOnlyFailure(evaluate(metrics, config()), "draws");
  });

  it("judges the ladder's sample floor on duels PLAYED, not duels decided", () => {
    // A hard bot that stalls its own duels used to shrink `decided` until the
    // check downgraded from a verdict to a SKIP — so a bot losing to normal
    // went green.
    const metrics = healthy();
    const target = metrics.ladder?.find((e) => e.key === "hard>normal");
    if (!target) throw new Error("missing matchup");
    target.played = 80;
    target.decided = 9;
    target.winPct = 33;
    const check = find(evaluate(metrics, config()), "ladder:hard>normal");
    expect(check.state).toBe("fail");
    expect(check.note).toMatch(/never produced a winner/);
  });

  it("does not claim a coin-flip miss is beyond luck when it is not", () => {
    // The margin used to be computed for the sentence and never compared to
    // anything, so a 0.1-point miss printed "outside the band by more than
    // shuffle luck (±3.4 pts)" — false on its own numbers.
    const narrow = evaluate({ ...healthy(), firstWinPct: 43.9, decidedGames: 800 }, config());
    expect(find(narrow, "coin-flip").state).toBe("fail");
    expect(find(narrow, "coin-flip").note).toMatch(/only just|still touches it/);

    const blatant = evaluate({ ...healthy(), firstWinPct: 62, decidedGames: 1480 }, config());
    expect(find(blatant, "coin-flip").note).toMatch(/whole 95% range is outside it/);
  });

  it("refuses config knobs that would silently switch a check off", () => {
    // Both of these point at measurement points hard-coded in sim-core. Set
    // them out of range and the sample comes back empty, which reads as SKIP —
    // so tightening the config would quietly disable the check.
    const tooWide = config();
    tooWide.checks.deadOpening.throughOwnTurns = 5;
    expect(() => checkConfigAgainstHarness(tooWide, 4, [5, 9, 13, 17])).toThrow(/records only 4 opening turns/);

    const unsnapshotted = config();
    unsnapshotted.checks.snowball.atTurn = 7;
    expect(() => checkConfigAgainstHarness(unsnapshotted, 4, [5, 9, 13, 17])).toThrow(/not one of the turns/);

    expect(() => checkConfigAgainstHarness(config(), 4, [5, 9, 13, 17])).not.toThrow();
  });

  it("holds the shipped config to the same validation", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "balance.config.json"), "utf8"));
    expect(() => checkConfigAgainstHarness(parseConfig(raw), OPENING_TURNS, LEAD_CHECKPOINTS)).not.toThrow();
  });
});

describe("the config file itself", () => {
  it("accepts the shipped balance.config.json", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "balance.config.json"), "utf8"));
    expect(() => parseConfig(raw)).not.toThrow();
  });

  it("rejects a mistyped threshold instead of silently ignoring it", () => {
    const raw = JSON.parse(JSON.stringify(config())) as Record<string, never>;
    (raw.checks as Record<string, Record<string, unknown>>).coinFlip.maxPCT = 56;
    expect(() => parseConfig(raw)).toThrow(/unknown key "checks.coinFlip.maxPCT"/);
  });

  it("rejects a missing threshold", () => {
    const raw = JSON.parse(JSON.stringify(config())) as Record<string, never>;
    delete (raw.checks as Record<string, Record<string, unknown>>).coinFlip.maxPct;
    expect(() => parseConfig(raw)).toThrow(/missing/);
  });

  it("rejects an unknown section", () => {
    const raw = JSON.parse(JSON.stringify(config())) as Record<string, unknown>;
    raw.tuning = {};
    expect(() => parseConfig(raw)).toThrow(/unknown top-level section "tuning"/);
  });

  it("ignores $comment prose", () => {
    const raw = JSON.parse(JSON.stringify(config())) as Record<string, unknown>;
    raw.$comment = ["notes for a human"];
    (raw.sample as Record<string, unknown>).$comment = "more notes";
    expect(() => parseConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

function card(over: Partial<CardRow> & { id: string; cost: number; winRate: number }): CardRow {
  return { name: over.id, drawn: 200, played: 120, playRate: 60, sample: 120, ...over };
}

describe("per-tier outliers", () => {
  it("judges a card against its own cost tier, never the roster average", () => {
    // The trap this exists to avoid: cheap cards win less overall, so a flat
    // comparison would name every cost-1 card as weak and every cost-9 card as
    // strong, and point the whole balance pass backwards (README, Reading the measured numbers).
    const rows: CardRow[] = [
      ...Array.from({ length: 6 }, (_unused, index) => card({ id: `cheap${index}`, cost: 1, winRate: 40 })),
      ...Array.from({ length: 6 }, (_unused, index) => card({ id: `dear${index}`, cost: 9, winRate: 60 })),
    ];
    const report = tierOutliers(rows, config());
    // Nothing is an outlier: every card is exactly average FOR ITS TIER, even
    // though the roster-wide spread is a full 20 points.
    expect(report.flatMap((tier) => [...tier.above, ...tier.below])).toEqual([]);
    expect(report.find((tier) => tier.cost === 1)?.mean).toBe(40);
    expect(report.find((tier) => tier.cost === 9)?.mean).toBe(60);
  });

  it("names a card that beats its own tier, even when its absolute win rate is low", () => {
    const rows: CardRow[] = [
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `cheap${index}`, cost: 1, winRate: 40 })),
      card({ id: "overtuned", cost: 1, winRate: 62, sample: 400 }),
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `dear${index}`, cost: 9, winRate: 60 })),
    ];
    const tier = tierOutliers(rows, config()).find((entry) => entry.cost === 1);
    expect(tier?.above.map((entry) => entry.id)).toEqual(["overtuned"]);
    // ...and it is still not called strong against the roster: 62 sits level
    // with the entire cost-9 tier.
    expect(tier?.below).toEqual([]);
  });

  it("names a card that falls below its own tier", () => {
    const rows: CardRow[] = [
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `peer${index}`, cost: 6, winRate: 55 })),
      card({ id: "limp", cost: 6, winRate: 33, sample: 400 }),
    ];
    const tier = tierOutliers(rows, config()).find((entry) => entry.cost === 6);
    expect(tier?.below.map((entry) => entry.id)).toEqual(["limp"]);
  });

  // A card is only named when BOTH conditions hold, so both are proved
  // separately — a filter with an "and" in it that is only ever tested on one
  // side is half untested (R-ps-98).
  it("refuses to name a wide gap that rests on too few duels", () => {
    const rows: CardRow[] = [
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `peer${index}`, cost: 4, winRate: 50 })),
      card({ id: "lucky", cost: 4, winRate: 60, sample: 61 }),
    ];
    const tier = tierOutliers(rows, config()).find((entry) => entry.cost === 4);
    // Nearly 10 points clear of its tier and still not named: across 61 duels
    // that is under two standard errors, which is what a coin does on a slow
    // afternoon. Widen the sample and the same card would be named.
    expect(tier?.above).toEqual([]);
    const wider = tierOutliers(
      rows.map((row) => (row.id === "lucky" ? { ...row, sample: 400 } : row)),
      config(),
    ).find((entry) => entry.cost === 4);
    expect(wider?.above.map((entry) => entry.id)).toEqual(["lucky"]);
  });

  it("refuses to name a rock-solid gap that is too small to feel", () => {
    const rows: CardRow[] = [
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `peer${index}`, cost: 4, winRate: 50, sample: 6000 })),
      card({ id: "a-shade-better", cost: 4, winRate: 54, sample: 6000 }),
    ];
    const tier = tierOutliers(rows, config()).find((entry) => entry.cost === 4);
    // Statistically beyond doubt — and four points is not a balance problem.
    expect(tier?.above).toEqual([]);
  });

  it("drops cards with too few plays out of the tier maths entirely", () => {
    const rows: CardRow[] = [
      ...Array.from({ length: 8 }, (_unused, index) => card({ id: `peer${index}`, cost: 3, winRate: 50 })),
      card({ id: "barely-seen", cost: 3, winRate: 100, sample: 4 }),
    ];
    const tier = tierOutliers(rows, config()).find((entry) => entry.cost === 3);
    expect(tier?.tooFewPlays).toBe(1);
    expect(tier?.mean).toBe(50);
  });
});

describe("the play-rate watchlist", () => {
  it("names cards that reach a hand often and a board rarely", () => {
    const rows: CardRow[] = [
      card({ id: "rots", cost: 8, winRate: 50, drawn: 200, playRate: 11 }),
      card({ id: "fine", cost: 2, winRate: 50, drawn: 200, playRate: 61 }),
    ];
    expect(watchlist(rows, config()).map((row) => row.id)).toEqual(["rots"]);
  });

  it("stays quiet about a card nobody has drawn enough times to judge", () => {
    const rows: CardRow[] = [card({ id: "unseen", cost: 8, winRate: 50, drawn: 9, playRate: 0 })];
    expect(watchlist(rows, config())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

function snapshot(over: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    stamp: "2026-01-01T00:00:00Z",
    games: 1500,
    skill: "normal",
    seedPrefix: "sim",
    coreHp: 76,
    headline: { firstWinPct: 49, medianTurns: 21 },
    cards: [{ id: "c001", name: "Whitebeard", cost: 9, winRate: 55, playRate: 60, sample: 400 }],
    ...over,
  };
}

describe("before / after", () => {
  it("refuses to compare runs of different sizes", () => {
    const diff = diffRuns(snapshot({ games: 500 }), snapshot(), config());
    expect(diff.comparable).toBe(false);
    expect(diff.reason).toMatch(/500 vs 1500 duels/);
    expect(diff.cards).toEqual([]);
  });

  it("refuses to compare runs from different seeds, skills or core HP", () => {
    expect(diffRuns(snapshot({ seedPrefix: "other" }), snapshot(), config()).reason).toMatch(/seed/);
    expect(diffRuns(snapshot({ skill: "hard" }), snapshot(), config()).reason).toMatch(/bot/);
    expect(diffRuns(snapshot({ coreHp: 30 }), snapshot(), config()).reason).toMatch(/core HP/);
  });

  it("says so plainly when there is no baseline yet", () => {
    const diff = diffRuns(null, snapshot(), config());
    expect(diff.comparable).toBe(false);
    expect(diff.reason).toMatch(/becomes the baseline/);
  });

  it("reports a real swing", () => {
    const after = snapshot({ cards: [{ id: "c001", name: "Whitebeard", cost: 9, winRate: 39, playRate: 60, sample: 400 }] });
    const diff = diffRuns(snapshot(), after, config());
    expect(diff.comparable).toBe(true);
    expect(diff.cards).toHaveLength(1);
    expect(diff.cards[0].delta).toBe(-16);
    expect(diff.cards[0].beyondNoise).toBe(true);
  });

  it("counts a small swing as noise instead of listing it as a result", () => {
    // The failure this prevents: reading "Whitebeard -4" as a balance change
    // when four points is what the shuffle does on its own.
    const after = snapshot({ cards: [{ id: "c001", name: "Whitebeard", cost: 9, winRate: 51, playRate: 60, sample: 400 }] });
    const diff = diffRuns(snapshot(), after, config());
    expect(diff.cards).toEqual([]);
    expect(diff.insideNoise).toBe(1);
  });

  it("ignores cards too rarely played to compare in either run", () => {
    const before = snapshot({ cards: [{ id: "c001", name: "Whitebeard", cost: 9, winRate: 55, playRate: 60, sample: 12 }] });
    const after = snapshot({ cards: [{ id: "c001", name: "Whitebeard", cost: 9, winRate: 20, playRate: 60, sample: 400 }] });
    const diff = diffRuns(before, after, config());
    expect(diff.cards).toEqual([]);
  });

  it("tracks the headline numbers too", () => {
    const after = snapshot({ headline: { firstWinPct: 52, medianTurns: 19 } });
    const diff = diffRuns(snapshot(), after, config());
    expect(diff.headline).toEqual([
      { key: "firstWinPct", before: 49, after: 52, delta: 3 },
      { key: "medianTurns", before: 21, after: 19, delta: -2 },
    ]);
  });
});
