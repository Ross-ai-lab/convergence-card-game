/**
 * Comparing two ladder runs without pretending percentages are comparable.
 *
 * The obvious way to ask "did that change help?" is to subtract one run's win
 * rate from another's. It does not work at these sample sizes: two runs of 100
 * duels carry roughly seven points of error on their difference, so anything
 * short of a landslide vanishes into it. Worse, it invites the mistake that
 * started this file — comparing against a run measured on an older roster, and
 * reading a rules change as a bot change.
 *
 * The fix costs nothing extra to run. Every ladder duel is seeded by matchup and
 * index, so two runs deal the IDENTICAL shuffles. Pair the games by seed and
 * look only at the ones whose result flipped: shuffle luck appears on both sides
 * of the pairing and cancels. What is left is the change. That is McNemar's
 * test, and it sees a four-point move on a hundred duels where subtracting
 * percentages would need about nine hundred.
 *
 * Two guards keep it honest. A matchup whose seeds are not identical between the
 * runs is REFUSED rather than approximated, because a partial pairing is exactly
 * the silent-wrong-answer this module exists to prevent. And each run records
 * the bot's dials, so the report can state what actually differed instead of
 * leaving the reader to assume.
 */

export interface LadderGame {
  seed: string;
  strongSeat: number;
  /** null = drawn or unfinished. Excluded from the pairing, never counted as a loss. */
  strongWon: boolean | null;
  turns: number;
}

export interface LadderMatchup {
  key: string;
  strong: string;
  weak: string;
  played: number;
  decided: number;
  winPct: number;
  medianTurns: number;
  results?: LadderGame[];
}

export interface LadderRun {
  generatedAt: string;
  seedPrefix: string;
  dials: Record<string, unknown>;
  matchups: LadderMatchup[];
}

export interface ComparisonRow {
  key: string;
  beforePct: number;
  afterPct: number;
  /** Duels present and decided in BOTH runs. */
  paired: number;
  /** Won before, lost after. */
  lost: number;
  /** Lost before, won after. */
  gained: number;
  /** Percentage points, measured on the paired games only. */
  delta: number;
  pValue: number;
  verdict: "improved" | "worsened" | "no measurable change";
  /** Set when the matchup could not be paired. Everything else is then meaningless. */
  refused?: string;
}

export interface Comparison {
  rows: ComparisonRow[];
  /** Human-readable list of dials that differ between the runs. Empty = same bot. */
  dialChanges: string[];
  /** Set when the two files cannot be compared at all. */
  refused?: string;
}

/**
 * Two-sided exact McNemar, which is a binomial sign test on the flips.
 *
 * With `lost` results going one way and `gained` the other, the null hypothesis
 * is that a flip was equally likely in either direction. Exact rather than the
 * chi-square approximation because the interesting cases here have very few
 * flips, which is precisely where the approximation misleads.
 */
export function mcnemarP(lost: number, gained: number): number {
  const total = lost + gained;
  if (total === 0) return 1;
  const smaller = Math.min(lost, gained);
  // Sum the binomial tail in log space so a long ladder cannot overflow.
  let logTerm = -total * Math.LN2; // k = 0
  let tail = Math.exp(logTerm);
  for (let k = 1; k <= smaller; k += 1) {
    logTerm += Math.log((total - k + 1) / k);
    tail += Math.exp(logTerm);
  }
  return Math.min(1, 2 * tail);
}

function describeDials(before: unknown, after: unknown, path: string, into: string[]): void {
  const beforeIsObject = typeof before === "object" && before !== null;
  const afterIsObject = typeof after === "object" && after !== null;
  if (beforeIsObject && afterIsObject) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
    for (const key of keys) {
      describeDials(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        into,
      );
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    into.push(`${path}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
}

export function compareLadders(before: LadderRun, after: LadderRun): Comparison {
  const dialChanges: string[] = [];
  describeDials(before.dials, after.dials, "", dialChanges);

  // A dial the baseline does not have AT ALL means the baseline predates the
  // dial, so it was written by a different bot — almost always somebody else's
  // run that overwrote the shared `ladder.json` between the baseline being taken
  // and the comparison being made. That misread produced a confident six-point
  // regression belonging to nobody. The tell was always in the output and always
  // easy to read past, so it is a refusal now rather than a line to notice.
  const missingDials = dialChanges.filter((change) => change.includes(": undefined -> "));
  if (missingDials.length > 0) {
    return {
      rows: [],
      dialChanges,
      refused:
        `the baseline has no value for ${missingDials.length === 1 ? "a dial" : `${missingDials.length} dials`} ` +
        `this run sets (${missingDials.join("; ")}), so it was written by a different bot. ` +
        `That is the signature of a baseline replaced by a parallel run — take a fresh one`,
    };
  }

  if (before.seedPrefix !== after.seedPrefix) {
    return {
      rows: [],
      dialChanges,
      refused:
        `the runs used different seeds ("${before.seedPrefix}" vs "${after.seedPrefix}"), ` +
        `so they never played the same duels`,
    };
  }

  const beforeByKey = new Map(before.matchups.map((matchup) => [matchup.key, matchup]));
  const rows: ComparisonRow[] = [];

  for (const now of after.matchups) {
    const then = beforeByKey.get(now.key);
    const row: ComparisonRow = {
      key: now.key,
      beforePct: then?.winPct ?? Number.NaN,
      afterPct: now.winPct,
      paired: 0,
      lost: 0,
      gained: 0,
      delta: Number.NaN,
      pValue: 1,
      verdict: "no measurable change",
    };

    if (!then) {
      rows.push({ ...row, refused: "this matchup is missing from the earlier run" });
      continue;
    }
    if (!then.results || !now.results) {
      rows.push({ ...row, refused: "one of the runs predates per-game recording" });
      continue;
    }

    const thenBySeed = new Map(then.results.map((game) => [game.seed, game]));
    const nowSeeds = new Set(now.results.map((game) => game.seed));
    const sameSeeds =
      thenBySeed.size === nowSeeds.size && [...nowSeeds].every((seed) => thenBySeed.has(seed));
    if (!sameSeeds) {
      rows.push({
        ...row,
        refused: `the two runs played different duels (${thenBySeed.size} vs ${nowSeeds.size} seeds)`,
      });
      continue;
    }

    let paired = 0;
    let lost = 0;
    let gained = 0;
    let beforeWins = 0;
    let afterWins = 0;
    for (const nowGame of now.results) {
      const thenGame = thenBySeed.get(nowGame.seed);
      if (!thenGame || thenGame.strongWon === null || nowGame.strongWon === null) continue;
      paired += 1;
      if (thenGame.strongWon) beforeWins += 1;
      if (nowGame.strongWon) afterWins += 1;
      if (thenGame.strongWon && !nowGame.strongWon) lost += 1;
      if (!thenGame.strongWon && nowGame.strongWon) gained += 1;
    }

    const delta = paired === 0 ? Number.NaN : ((afterWins - beforeWins) / paired) * 100;
    const pValue = mcnemarP(lost, gained);
    rows.push({
      ...row,
      paired,
      lost,
      gained,
      delta,
      pValue,
      verdict:
        pValue >= 0.05 || paired === 0
          ? "no measurable change"
          : gained > lost
            ? "improved"
            : "worsened",
    });
  }

  return { rows, dialChanges };
}

/** The console block. Kept next to the maths so the wording cannot drift from it. */
export function formatComparison(comparison: Comparison, beforeLabel: string, afterLabel: string): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  Paired ladder comparison: ${beforeLabel} -> ${afterLabel}`);
  lines.push("");

  if (comparison.refused) {
    lines.push(`  REFUSED — ${comparison.refused}`);
    lines.push("");
    return lines.join("\n");
  }

  lines.push("  matchup              before    after    paired   won->lost  lost->won   change   verdict");
  lines.push("  -------------------  -------  -------   ------   ---------  ---------   ------   -------");
  for (const row of comparison.rows) {
    const name = row.key.replace(">", " vs ").padEnd(21);
    if (row.refused) {
      lines.push(`  ${name}REFUSED — ${row.refused}`);
      continue;
    }
    const change = `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}`;
    lines.push(
      `  ${name}${`${row.beforePct}%`.padStart(7)}  ${`${row.afterPct}%`.padStart(7)}   ` +
        `${String(row.paired).padStart(6)}   ${String(row.lost).padStart(9)}  ${String(row.gained).padStart(9)}   ` +
        `${change.padStart(6)}   ${row.verdict} (p=${row.pValue.toFixed(3)})`,
    );
  }

  lines.push("");
  if (comparison.dialChanges.length === 0) {
    lines.push("  Bot dials: identical. Any change here is the ENGINE or the card data, not the bot.");
  } else {
    lines.push("  Bot dials that changed:");
    for (const change of comparison.dialChanges) lines.push(`    ${change}`);
  }
  lines.push("");
  lines.push("  Card data is NOT captured here. A comparison across a roster change measures both at once.");
  lines.push("");
  return lines.join("\n");
}
