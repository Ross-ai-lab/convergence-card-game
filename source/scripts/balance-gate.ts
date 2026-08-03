/**
 * The balance gate: measured numbers in, PASS / FAIL / SKIP out.
 *
 * Deliberately pure — no file reading, no printing, no simulating. Everything in
 * here is a function of its arguments, which is what makes the whole gate
 * testable in milliseconds instead of in seven-minute simulation runs. The
 * live-fire suite next door (`balance-gate.test.ts`) plants a violating number
 * for every single check and proves that check, and only that check, goes red.
 *
 * Three rules the shape of this file exists to enforce:
 *
 *   1. **A check whose evidence is too thin SKIPS.** It is never folded into the
 *      pass count. "All checks passed" while two never ran is a false coverage
 *      report and the worst failure a harness can have.
 *   2. **A threshold left null SKIPS too.** An unset number must never read as a
 *      green light.
 *   3. **One check per implementation path.** The three ladder matchups are three
 *      separate checks, not one "does skill win" check, so the summary names the
 *      matchup that broke (R-ps-98).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BalanceConfig {
  sample: {
    minDecidedGamesForCoinFlip: number;
    minFinishedGamesForLength: number;
    minGamesForOpening: number;
    minGamesPerLadderMatchup: number;
    minLeadGamesForSnowball: number;
    minCardDrawnForRates: number;
    minCardPlaysForTier: number;
  };
  checks: {
    coinFlip: { enabled: boolean; minPct: number; maxPct: number };
    matchLength: { enabled: boolean; minMedianTurns: number; maxMedianTurns: number };
    softLocks: { enabled: boolean; max: number };
    stalls: { enabled: boolean; max: number };
    invariants: { enabled: boolean; max: number };
    draws: { enabled: boolean; maxPct: number };
    deadOpening: { enabled: boolean; throughOwnTurns: number; maxPct: number | null };
    /** `games` is per matchup: the hard bot's duels cost ~8x and need far less sample. */
    skillLadder: { enabled: boolean; games: Record<string, number>; floors: Record<string, number> };
    snowball: { enabled: boolean; atTurn: number; maxLeaderWinPct: number | null };
  };
  report: {
    watchlistPlayRatePct: number;
    tierOutlierZ: number;
    tierOutlierMinDeltaPct: number;
    diffNoiseMultiple: number;
    historyRunsKept: number;
  };
}

/**
 * The shape every key is checked against. A key present in the file but missing
 * here is a hard error rather than a shrug: a threshold that silently does
 * nothing because it was typed `maxPCT` is exactly the decoration this gate
 * exists to avoid.
 */
const SHAPE: Record<string, Record<string, string>> = {
  sample: {
    minDecidedGamesForCoinFlip: "number",
    minFinishedGamesForLength: "number",
    minGamesForOpening: "number",
    minGamesPerLadderMatchup: "number",
    minLeadGamesForSnowball: "number",
    minCardDrawnForRates: "number",
    minCardPlaysForTier: "number",
  },
  checks: {
    coinFlip: "object",
    matchLength: "object",
    softLocks: "object",
    stalls: "object",
    invariants: "object",
    draws: "object",
    deadOpening: "object",
    skillLadder: "object",
    snowball: "object",
  },
  report: {
    watchlistPlayRatePct: "number",
    tierOutlierZ: "number",
    tierOutlierMinDeltaPct: "number",
    diffNoiseMultiple: "number",
    historyRunsKept: "number",
  },
};

/**
 * The ladder matchups the gate knows about. Canonical, so a matchup cannot be
 * removed from the run by deleting or mistyping a key in the config: an
 * adversarial review found that `floors: { "norml>easy": 53 }` was accepted, the
 * matchup silently stopped being checked, and the verdict read "all 9 checks
 * green" while normal was losing to easy on screen. Disappearing is worse than
 * skipping, which is the exact failure this file exists to prevent.
 */
export const LADDER_MATCHUPS = ["hard>easy", "hard>normal", "normal>easy"] as const;

/** Every check id the gate must account for. Nothing may quietly leave this list. */
export const REQUIRED_CHECKS = [
  "soft-locks",
  "stalls",
  "invariants",
  "draws",
  "coin-flip",
  "match-length",
  "dead-opening",
  ...LADDER_MATCHUPS.map((key) => `ladder:${key}`),
  "snowball",
] as const;

const CHECK_SHAPE: Record<string, string[]> = {
  coinFlip: ["enabled", "minPct", "maxPct"],
  matchLength: ["enabled", "minMedianTurns", "maxMedianTurns"],
  softLocks: ["enabled", "max"],
  stalls: ["enabled", "max"],
  invariants: ["enabled", "max"],
  draws: ["enabled", "maxPct"],
  deadOpening: ["enabled", "throughOwnTurns", "maxPct"],
  skillLadder: ["enabled", "games", "floors"],
  snowball: ["enabled", "atTurn", "maxLeaderWinPct"],
};

/** Keys beginning with `$` are prose for whoever opens the file. Never data. */
function realKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => !key.startsWith("$"));
}

export function parseConfig(raw: unknown): BalanceConfig {
  if (!raw || typeof raw !== "object") throw new Error("balance config is not an object");
  const root = raw as Record<string, unknown>;

  for (const key of realKeys(root)) {
    if (!SHAPE[key]) throw new Error(`balance config: unknown top-level section "${key}"`);
  }
  for (const section of Object.keys(SHAPE)) {
    const body = root[section];
    if (!body || typeof body !== "object") throw new Error(`balance config: section "${section}" is missing`);
    const entries = body as Record<string, unknown>;
    for (const key of realKeys(entries)) {
      const want = SHAPE[section][key];
      if (!want) throw new Error(`balance config: unknown key "${section}.${key}"`);
      if (want === "number" && typeof entries[key] !== "number") {
        throw new Error(`balance config: "${section}.${key}" must be a number`);
      }
    }
    for (const key of Object.keys(SHAPE[section])) {
      if (!(key in entries)) throw new Error(`balance config: "${section}.${key}" is missing`);
    }
  }

  const checks = root.checks as Record<string, Record<string, unknown>>;
  for (const [name, fields] of Object.entries(CHECK_SHAPE)) {
    const body = checks[name];
    for (const key of realKeys(body)) {
      if (!fields.includes(key)) throw new Error(`balance config: unknown key "checks.${name}.${key}"`);
    }
    for (const key of fields) {
      if (!(key in body)) throw new Error(`balance config: "checks.${name}.${key}" is missing`);
    }
    if (typeof body.enabled !== "boolean") throw new Error(`balance config: "checks.${name}.enabled" must be true or false`);
  }

  // The ladder's two free-form maps are the one place a typo could otherwise
  // remove a check rather than break the load.
  const ladder = checks.skillLadder as unknown as { games: Record<string, number>; floors: Record<string, number> };
  for (const field of ["games", "floors"] as const) {
    const map = ladder[field];
    if (!map || typeof map !== "object") throw new Error(`balance config: "checks.skillLadder.${field}" must be an object`);
    for (const key of realKeys(map as Record<string, unknown>)) {
      if (!(LADDER_MATCHUPS as readonly string[]).includes(key)) {
        throw new Error(
          `balance config: unknown ladder matchup "${key}" in checks.skillLadder.${field} — expected one of ${LADDER_MATCHUPS.join(", ")}`,
        );
      }
    }
    for (const key of LADDER_MATCHUPS) {
      if (typeof map[key] !== "number") {
        throw new Error(`balance config: "checks.skillLadder.${field}.${key}" is missing — a matchup may not vanish from the gate`);
      }
    }
  }

  return raw as unknown as BalanceConfig;
}

/**
 * Two thresholds in the config address measurement points that are fixed in
 * `sim-core.ts`. Set either of them outside what the harness records and the
 * measurement silently returns an empty sample, which the gate then reports as a
 * SKIP — so *tightening* the config would quietly switch the check off. Caught
 * by adversarial review; this turns it into a loud startup error instead.
 */
export function checkConfigAgainstHarness(
  config: BalanceConfig,
  openingTurnsRecorded: number,
  leadCheckpointsRecorded: readonly number[],
): void {
  const window = config.checks.deadOpening.throughOwnTurns;
  if (!Number.isInteger(window) || window < 1 || window > openingTurnsRecorded) {
    throw new Error(
      `balance config: checks.deadOpening.throughOwnTurns is ${window}, but sim-core records only ` +
        `${openingTurnsRecorded} opening turns per player. Raise OPENING_TURNS in scripts/sim-core.ts first — ` +
        `left as is, every opening would be discarded and the check would silently SKIP.`,
    );
  }
  const turn = config.checks.snowball.atTurn;
  if (!leadCheckpointsRecorded.includes(turn)) {
    throw new Error(
      `balance config: checks.snowball.atTurn is ${turn}, which is not one of the turns sim-core snapshots ` +
        `(${leadCheckpointsRecorded.join(", ")}). Add it to LEAD_CHECKPOINTS in scripts/sim-core.ts first — ` +
        `left as is, no duel would match and the check would silently SKIP.`,
    );
  }
}

// ---------------------------------------------------------------------------
// What a check produces
// ---------------------------------------------------------------------------

export type CheckState = "pass" | "fail" | "skip";

export interface CheckResult {
  id: string;
  title: string;
  state: CheckState;
  /** The number that was measured, already formatted. */
  measured: string;
  /** The rule it had to satisfy. */
  expected: string;
  /** Why it skipped, or what exactly is wrong. */
  note?: string;
}

export interface LadderMetric {
  key: string;
  strong: string;
  weak: string;
  /** Duels actually run. The SAMPLE FLOOR is judged on this, never on `decided`. */
  played: number;
  /** Duels that produced a winner. The win rate's denominator only. */
  decided: number;
  winPct: number;
}

export interface GateMetrics {
  /** Self-play games that produced a winner. The coin flip's denominator. */
  decidedGames: number;
  firstWinPct: number;
  /** Games that reached a natural end — neither stalled nor soft-locked. */
  finishedGames: number;
  medianTurns: number;
  /**
   * `null` means NOT MEASURED and must skip. It is not the same as zero, and
   * conflating the two is how `npm run sim -- --mode fuzz` used to print
   * "Stalled duels (bot play): 0 — PASS" without a single bot duel being played.
   * These three checks have no sample floor, so nothing else would catch it.
   */
  softLocks: number | null;
  /**
   * Stalls under BOT play only. Random-driver fuzz games are excluded on
   * purpose: two seats picking legal moves at random can miss the turn cap
   * honestly, and gating on that reports the fuzzer's behaviour as the game's.
   * Measured, and it happened on the very first real run.
   */
  stalls: number | null;
  /** Fuzz stalls, reported beside the gated number and never gated on. */
  fuzzStalls: number;
  invariantBreaches: number | null;
  /**
   * Duels both players lost at once. Counted by nothing before an adversarial
   * review pointed out that a draw quietly leaves every gated denominator —
   * coin flip, snowball and the ladder all just get a smaller sample — so the
   * game could start ending in draws half the time and no lamp would light.
   */
  draws: number | null;
  /** Duels that produced a winner or a draw. The draw rate's denominator. */
  concludedGames: number;
  /** null = opening fairness was not measured on this run. */
  opening: {
    /** Player-openings sampled (two per duel). */
    samples: number;
    deadThroughWindowPct: number;
    deadTurnOnePct: number;
  } | null;
  /** null = the ladder was not run (the fast loop skips it). */
  ladder: LadderMetric[] | null;
  /** null = the snowball snapshot was not measured. */
  snowball: {
    turn: number;
    leadGames: number;
    tiedGames: number;
    leaderWinPct: number;
  } | null;
}

const pass = (id: string, title: string, measured: string, expected: string): CheckResult => ({
  id, title, state: "pass", measured, expected,
});
const fail = (id: string, title: string, measured: string, expected: string, note?: string): CheckResult => ({
  id, title, state: "fail", measured, expected, note,
});
const skip = (id: string, title: string, measured: string, expected: string, note: string): CheckResult => ({
  id, title, state: "skip", measured, expected, note,
});

/** Standard error of a percentage, in percentage points. */
export function sePct(ratePct: number, n: number): number {
  if (n <= 0) return Infinity;
  const p = Math.min(1, Math.max(0, ratePct / 100));
  return Math.sqrt((p * (1 - p)) / n) * 100;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const pctOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

export function evaluate(metrics: GateMetrics, config: BalanceConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const c = config.checks;
  const s = config.sample;

  /**
   * The three hygiene checks. No sample floor on purpose — one occurrence is a
   * bug, and a bug found in 40 duels is still a bug — which is exactly why a
   * NOT-MEASURED value has to skip explicitly. Nothing else would catch it.
   */
  const hygiene = (
    id: string,
    title: string,
    enabled: boolean,
    value: number | null,
    max: number,
    note: string,
    extra = "",
  ) => {
    if (!enabled) {
      results.push(skip(id, title, "not run", `at most ${max}`, "disabled in balance.config.json"));
      return;
    }
    const expected = `at most ${max}`;
    if (value === null) {
      results.push(skip(id, title, "not measured", expected, "this run played no duels that could show it — zero is not the same as nothing"));
    } else if (value > max) {
      results.push(fail(id, title, `${value}${extra}`, expected, note));
    } else {
      results.push(pass(id, title, `${value}${extra}`, expected));
    }
  };

  hygiene(
    "soft-locks",
    "Soft-locks",
    c.softLocks.enabled,
    metrics.softLocks,
    c.softLocks.max,
    // Worded for what it actually detects. The main phase always offers
    // end_turn, so a zero-legal-action state comes from a targeting or draw
    // prompt that opened with no options — the UI would show a prompt nobody
    // can answer and no way out.
    "a duel reached a state offering zero legal moves — a prompt with no answer, and no way out of it",
  );

  hygiene(
    "stalls",
    "Stalled duels (bot play)",
    c.stalls.enabled,
    metrics.stalls,
    c.stalls.max,
    "two competent players could not finish a duel inside the turn cap",
    metrics.fuzzStalls ? ` (plus ${metrics.fuzzStalls} under random fuzz play, not gated)` : "",
  );

  hygiene(
    "invariants",
    "Invariant breaches",
    c.invariants.enabled,
    metrics.invariantBreaches,
    c.invariants.max,
    "a corrupt state, a crash or an unsaveable duel",
  );

  // --- Draws. A duel both players lose leaves every other denominator quietly
  // smaller and shows up nowhere else.
  {
    const id = "draws";
    const title = "Draws";
    const rate = metrics.draws === null ? 0 : pctOf(metrics.draws, metrics.concludedGames);
    const expected = `at most ${c.draws.maxPct}% of concluded duels`;
    const measured = metrics.draws === null ? "not measured" : `${metrics.draws} (${rate}% of ${metrics.concludedGames})`;
    if (!c.draws.enabled) {
      results.push(skip(id, title, measured, expected, "disabled in balance.config.json"));
    } else if (metrics.draws === null) {
      results.push(skip(id, title, measured, expected, "this run played no duels that could show it"));
    } else if (rate > c.draws.maxPct) {
      results.push(fail(id, title, measured, expected, "duels are ending with nobody winning — every other rate here is measured on a shrinking sample"));
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // --- Is it fair?
  if (!c.coinFlip.enabled) {
    results.push(skip("coin-flip", "First-player advantage", "not run", `${c.coinFlip.minPct}–${c.coinFlip.maxPct}%`, "disabled in balance.config.json"));
  } else {
    const id = "coin-flip";
    const title = "First-player advantage";
    const margin = round1(1.96 * sePct(metrics.firstWinPct, metrics.decidedGames));
    const measured = `${round1(metrics.firstWinPct)}% of ${metrics.decidedGames} decided duels (±${margin})`;
    const expected = `${c.coinFlip.minPct}–${c.coinFlip.maxPct}%`;
    if (metrics.decidedGames < s.minDecidedGamesForCoinFlip) {
      results.push(
        skip(id, title, measured, expected,
          `needs ${s.minDecidedGamesForCoinFlip} decided duels; a smaller sample swings by more than the band is wide`),
      );
    } else if (metrics.firstWinPct < c.coinFlip.minPct || metrics.firstWinPct > c.coinFlip.maxPct) {
      // The note used to claim the miss was "more than shuffle luck" while
      // computing that margin purely for the sentence and never comparing it to
      // anything. Say which of the two it is instead of asserting the stronger one.
      const clear =
        metrics.firstWinPct + margin < c.coinFlip.minPct || metrics.firstWinPct - margin > c.coinFlip.maxPct;
      results.push(
        fail(id, title, measured, expected,
          clear
            ? `outside the band, and the whole 95% range is outside it — this is real, not shuffle luck`
            : `outside the band, but only just: the 95% range still touches it. Re-run before acting on this one`),
      );
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // --- Does it run for the right length?
  if (!c.matchLength.enabled) {
    results.push(skip("match-length", "Median duel length", "not run", `${c.matchLength.minMedianTurns}–${c.matchLength.maxMedianTurns} turns`, "disabled in balance.config.json"));
  } else {
    const id = "match-length";
    const title = "Median duel length";
    const measured = `${metrics.medianTurns} turns over ${metrics.finishedGames} finished duels`;
    const expected = `${c.matchLength.minMedianTurns}–${c.matchLength.maxMedianTurns} turns`;
    if (metrics.finishedGames < s.minFinishedGamesForLength) {
      results.push(skip(id, title, measured, expected, `needs ${s.minFinishedGamesForLength} finished duels`));
    } else if (
      metrics.medianTurns < c.matchLength.minMedianTurns ||
      metrics.medianTurns > c.matchLength.maxMedianTurns
    ) {
      results.push(
        fail(id, title, measured, expected,
          "pacing moved — every ongoing effect in the game changed value with it, so re-read the card tables"),
      );
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // --- Can you play on your opening turns?
  if (!c.deadOpening.enabled) {
    results.push(skip("dead-opening", "Dead openings", "not run", "—", "disabled in balance.config.json"));
  } else {
    const id = "dead-opening";
    const title = `Dead openings (nothing playable through own turn ${c.deadOpening.throughOwnTurns})`;
    const measured = metrics.opening
      ? `${round1(metrics.opening.deadThroughWindowPct)}% of ${metrics.opening.samples} openings`
      : "not measured";
    const expected = c.deadOpening.maxPct === null ? "threshold not set" : `at most ${c.deadOpening.maxPct}%`;
    if (!metrics.opening) {
      results.push(skip(id, title, measured, expected, "this run did not collect opening data"));
    } else if (c.deadOpening.maxPct === null) {
      results.push(
        skip(id, title, measured, expected,
          "checks.deadOpening.maxPct is null — measure first, then set it. An unset threshold is not a pass"),
      );
    } else if (metrics.opening.samples < s.minGamesForOpening) {
      results.push(skip(id, title, measured, expected, `needs ${s.minGamesForOpening} sampled openings`));
    } else if (metrics.opening.deadThroughWindowPct > c.deadOpening.maxPct) {
      results.push(
        fail(id, title, measured, expected,
          "these players could not put a single card down across their first three turns — invisible to win rates, and the worst possible way to start"),
      );
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // --- Does skill win? One check per matchup, never one for "the ladder", and
  // iterated over the CANONICAL matchup list rather than over the config's keys,
  // so a matchup cannot leave the gate by leaving the file.
  for (const key of LADDER_MATCHUPS) {
    const id = `ladder:${key}`;
    const title = `Skill ladder — ${key.replace(">", " beats ")}`;
    const floor = c.skillLadder.floors[key];
    const found = metrics.ladder?.find((entry) => entry.key === key);
    const undecided = found ? found.played - found.decided : 0;
    const measured = found
      ? `${round1(found.winPct)}% of ${found.decided} decided duels${undecided ? ` (${undecided} of ${found.played} ended undecided)` : ""}`
      : "not measured";
    const expected = floor === undefined ? "no floor configured" : `at least ${floor}%, and clear of 50% beyond noise`;
    if (!c.skillLadder.enabled) {
      results.push(skip(id, title, "not run", expected, "disabled in balance.config.json"));
      continue;
    }
    if (floor === undefined) {
      results.push(fail(id, title, measured, expected, `no floor configured for "${key}" — a matchup may not vanish from the gate`));
      continue;
    }
    if (!metrics.ladder) {
      results.push(skip(id, title, measured, expected, "the ladder did not run — use `npm run check:balance` for the full gate"));
      continue;
    }
    if (!found) {
      results.push(skip(id, title, measured, expected, `no ladder result for "${key}"`));
      continue;
    }
    // The floor is judged on duels PLAYED, not on duels decided. Using `decided`
    // made a collapsing bot hide itself: duels that stall or draw shrink the
    // sample until the check downgrades from a verdict to a SKIP, which is how a
    // hard bot losing to normal turned green.
    if (found.played < s.minGamesPerLadderMatchup) {
      results.push(skip(id, title, measured, expected, `needs ${s.minGamesPerLadderMatchup} duels per matchup`));
      continue;
    }
    if (found.decided < found.played * 0.8) {
      results.push(
        fail(id, title, measured, expected,
          `${undecided} of ${found.played} duels never produced a winner — the win rate here is measured on a sample that is falling apart`),
      );
      continue;
    }
    // Two conditions, because either alone lies. Clearing the floor on a noisy
    // sample proves nothing, and being statistically above 50% by one point is
    // a difficulty setting nobody can feel.
    const lower = found.winPct - 1.96 * sePct(found.winPct, found.decided);
    if (found.winPct < floor) {
      results.push(fail(id, title, measured, expected, `below the floor — ${key.split(">")[0]} is not winning clearly enough to call it a difficulty`));
    } else if (lower <= 50) {
      results.push(
        fail(id, title, measured, expected,
          `clears the floor but the 95% range still reaches ${round1(lower)}% — the gap is not distinguishable from a coin flip`),
      );
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // --- Is it over before it is over?
  if (!c.snowball.enabled) {
    results.push(skip("snowball", "Snowball", "not run", "—", "disabled in balance.config.json"));
  } else {
    const id = "snowball";
    const title = `Snowball — whoever is clearly ahead at turn ${c.snowball.atTurn}`;
    const measured = metrics.snowball
      ? `wins ${round1(metrics.snowball.leaderWinPct)}% of ${metrics.snowball.leadGames} duels`
      : "not measured";
    const expected =
      c.snowball.maxLeaderWinPct === null ? "threshold not set" : `at most ${c.snowball.maxLeaderWinPct}%`;
    if (!metrics.snowball) {
      results.push(skip(id, title, measured, expected, "this run did not collect the turn-5 snapshot"));
    } else if (c.snowball.maxLeaderWinPct === null) {
      results.push(
        skip(id, title, measured, expected,
          "checks.snowball.maxLeaderWinPct is null — measure first, then set it. An unset threshold is not a pass"),
      );
    } else if (metrics.snowball.leadGames < s.minLeadGamesForSnowball) {
      results.push(skip(id, title, measured, expected, `needs ${s.minLeadGamesForSnowball} duels with a clear leader at that turn`));
    } else if (metrics.snowball.leaderWinPct > c.snowball.maxLeaderWinPct) {
      results.push(
        fail(id, title, measured, expected,
          "an early lead is converting too often — the rest of the duel is a formality the player still has to sit through"),
      );
    } else {
      results.push(pass(id, title, measured, expected));
    }
  }

  // Last line of defence. Every id in REQUIRED_CHECKS must be accounted for by
  // the time we get here — a check that produces no result at all is invisible,
  // and `summarise` counts against `results.length`, which would happily report
  // "all 9 checks green" and never mention the tenth.
  const produced = new Set(results.map((result) => result.id));
  for (const id of REQUIRED_CHECKS) {
    if (!produced.has(id)) {
      results.push(
        fail(id, `Missing check: ${id}`, "no result produced", "a result of some kind",
          "the gate did not evaluate this check at all — balance.config.json is malformed or the gate has a bug. Treat this run as unjudged"),
      );
    }
  }

  return results;
}

export interface GateSummary {
  passed: number;
  failed: number;
  skipped: number;
  /** True only when nothing failed. Skips do not fail the gate but do change the wording. */
  green: boolean;
  verdict: string;
}

export function summarise(results: CheckResult[]): GateSummary {
  const passed = results.filter((r) => r.state === "pass").length;
  const failed = results.filter((r) => r.state === "fail").length;
  const skipped = results.filter((r) => r.state === "skip").length;
  const verdict = failed
    ? `FAIL — ${failed} of ${results.length} checks red${skipped ? `, ${skipped} skipped` : ""}`
    : skipped
      ? `PASS WITH ${skipped} SKIPPED — ${passed} of ${results.length} checks green, ${skipped} never ran`
      : `PASS — all ${passed} checks green`;
  return { passed, failed, skipped, green: failed === 0, verdict };
}

// ---------------------------------------------------------------------------
// Per-tier outliers
//
// A card is judged against the other cards of ITS OWN mana cost and never
// against the roster average. In a
// mana-limited game cheap cards are simply played more often, so a flat
// comparison reads "cheap" as "overpowered" and points the whole balance pass
// backwards.
// ---------------------------------------------------------------------------

export interface CardRow {
  id: string;
  name: string;
  cost: number;
  drawn: number;
  played: number;
  playRate: number;
  winRate: number;
  /** Duels in which this card reached a board. The denominator of winRate. */
  sample: number;
}

export interface TierCard {
  id: string;
  name: string;
  cost: number;
  winRate: number;
  sample: number;
  /** Win rate minus the tier's own mean, in points. */
  delta: number;
  /** That gap expressed in standard errors. Below ~2 it is not distinguishable from noise. */
  z: number;
}

export interface TierReport {
  cost: number;
  /** Pooled win rate across every judged card of this cost. */
  mean: number;
  judged: number;
  tooFewPlays: number;
  above: TierCard[];
  below: TierCard[];
  /** How many points a card must beat the tier by before it can be named, at this tier's sample. */
  noiseFloor: number;
}

export function tierOutliers(rows: CardRow[], config: BalanceConfig): TierReport[] {
  const { minCardPlaysForTier } = config.sample;
  const { tierOutlierZ, tierOutlierMinDeltaPct } = config.report;
  const byCost = new Map<number, CardRow[]>();
  for (const row of rows) {
    const bucket = byCost.get(row.cost) ?? [];
    bucket.push(row);
    byCost.set(row.cost, bucket);
  }

  const out: TierReport[] = [];
  for (const cost of [...byCost.keys()].sort((a, b) => a - b)) {
    const all = byCost.get(cost) as CardRow[];
    const judged = all.filter((row) => row.sample >= minCardPlaysForTier);
    if (judged.length < 3) {
      out.push({ cost, mean: 0, judged: judged.length, tooFewPlays: all.length - judged.length, above: [], below: [], noiseFloor: Infinity });
      continue;
    }
    // Pooled, not the average of averages: a card played 40 times should not
    // move the tier's centre as much as one played 400 times.
    const totalGames = judged.reduce((total, row) => total + row.sample, 0);
    const mean = judged.reduce((total, row) => total + (row.winRate / 100) * row.sample, 0) / totalGames * 100;
    const medianSample = [...judged].map((r) => r.sample).sort((a, b) => a - b)[Math.floor(judged.length / 2)];

    const scored: TierCard[] = judged.map((row) => {
      const se = sePct(mean, row.sample);
      return {
        id: row.id, name: row.name, cost, winRate: row.winRate, sample: row.sample,
        delta: Math.round((row.winRate - mean) * 10) / 10,
        z: se === 0 ? 0 : Math.round(((row.winRate - mean) / se) * 100) / 100,
      };
    });

    // Both tests, always. The z alone names cards whose gap is real but tiny
    // enough that nobody would ever feel it; the points gap alone names noise.
    const named = scored.filter((card) => Math.abs(card.z) >= tierOutlierZ && Math.abs(card.delta) >= tierOutlierMinDeltaPct);
    out.push({
      cost,
      mean: Math.round(mean * 10) / 10,
      judged: judged.length,
      tooFewPlays: all.length - judged.length,
      above: named.filter((card) => card.delta > 0).sort((a, b) => b.delta - a.delta),
      below: named.filter((card) => card.delta < 0).sort((a, b) => a.delta - b.delta),
      noiseFloor: Math.round(tierOutlierZ * sePct(mean, medianSample) * 10) / 10,
    });
  }
  return out;
}

/**
 * Cards that reach a hand often and a board rarely — invisible to win rate.
 *
 * Generic on purpose: the caller's rows carry more than CardRow does (stats,
 * timing, camp) and the report prints those columns. Narrowing the return to
 * CardRow here rendered them as "undefined" in the page.
 */
export function watchlist<T extends CardRow>(rows: T[], config: BalanceConfig): T[] {
  return rows
    .filter((row) => row.drawn >= config.sample.minCardDrawnForRates && row.playRate < config.report.watchlistPlayRatePct)
    .sort((a, b) => a.playRate - b.playRate);
}

// ---------------------------------------------------------------------------
// Before / after
// ---------------------------------------------------------------------------

export interface RunSnapshot {
  stamp: string;
  games: number;
  skill: string;
  seedPrefix: string;
  coreHp: number;
  headline: Record<string, number>;
  cards: Array<{ id: string; name: string; cost: number; winRate: number; playRate: number; sample: number }>;
}

export interface CardDelta {
  id: string;
  name: string;
  cost: number;
  before: number;
  after: number;
  delta: number;
  /** Two runs' worth of shuffle noise on this card, in points. */
  noise: number;
  beyondNoise: boolean;
}

export interface RunDiff {
  comparable: boolean;
  reason?: string;
  against?: string;
  headline: Array<{ key: string; before: number; after: number; delta: number }>;
  cards: CardDelta[];
  /** Cards that moved, but not by more than the noise. Counted, never listed. */
  insideNoise: number;
}

/**
 * Compare this run with the previous one.
 *
 * The honesty layer matters more than the diff itself. At default sample sizes a
 * single card is played in roughly 130 duels, which puts about ±4.4 points of
 * shuffle noise on its win rate and about ±6 on the difference between two runs.
 * "Whitebeard −8" is therefore barely a signal. Every delta is printed next to
 * its own noise floor and anything inside it is counted, not listed.
 *
 * Runs with different sizes, seeds, skills or core HP are refused outright — a
 * delta between two different experiments is not a result.
 */
export function diffRuns(prev: RunSnapshot | null, curr: RunSnapshot, config: BalanceConfig): RunDiff {
  const empty: RunDiff = { comparable: false, headline: [], cards: [], insideNoise: 0 };
  if (!prev) return { ...empty, reason: "no previous run stored yet — this run becomes the baseline" };

  const mismatches: string[] = [];
  if (prev.games !== curr.games) mismatches.push(`${prev.games} vs ${curr.games} duels`);
  if (prev.seedPrefix !== curr.seedPrefix) mismatches.push(`seed "${prev.seedPrefix}" vs "${curr.seedPrefix}"`);
  if (prev.skill !== curr.skill) mismatches.push(`${prev.skill} vs ${curr.skill} bot`);
  if (prev.coreHp !== curr.coreHp) mismatches.push(`${prev.coreHp} vs ${curr.coreHp} core HP`);
  if (mismatches.length) {
    return { ...empty, reason: `previous run is not comparable (${mismatches.join(", ")}) — deltas would mean nothing` };
  }

  const before = new Map(prev.cards.map((card) => [card.id, card]));
  const cards: CardDelta[] = [];
  let insideNoise = 0;
  for (const card of curr.cards) {
    const was = before.get(card.id);
    if (!was) continue;
    if (was.sample < config.sample.minCardPlaysForTier || card.sample < config.sample.minCardPlaysForTier) continue;
    const delta = Math.round((card.winRate - was.winRate) * 10) / 10;
    const noise =
      Math.round(
        config.report.diffNoiseMultiple *
          Math.sqrt(sePct(was.winRate, was.sample) ** 2 + sePct(card.winRate, card.sample) ** 2) *
          10,
      ) / 10;
    if (Math.abs(delta) > noise) {
      cards.push({ id: card.id, name: card.name, cost: card.cost, before: was.winRate, after: card.winRate, delta, noise, beyondNoise: true });
    } else if (delta !== 0) {
      insideNoise += 1;
    }
  }
  cards.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const headline = Object.keys(curr.headline)
    .filter((key) => key in prev.headline)
    .map((key) => ({
      key,
      before: prev.headline[key],
      after: curr.headline[key],
      delta: Math.round((curr.headline[key] - prev.headline[key]) * 10) / 10,
    }));

  return { comparable: true, against: prev.stamp, headline, cards, insideNoise };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

const MARK: Record<CheckState, string> = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

export function formatGateBlock(results: CheckResult[]): string {
  const summary = summarise(results);
  const lines: string[] = [];
  lines.push("");
  lines.push("─".repeat(78));
  lines.push("BALANCE GATE");
  lines.push("─".repeat(78));
  for (const result of results) {
    lines.push(`  ${MARK[result.state].padEnd(5)} ${result.title}`);
    lines.push(`        measured ${result.measured}   ·   wanted ${result.expected}`);
    if (result.note) lines.push(`        ${result.state === "skip" ? "skipped: " : ""}${result.note}`);
  }
  lines.push("─".repeat(78));
  lines.push(`  ${summary.verdict}`);
  if (summary.skipped) {
    lines.push(`  A skipped check is NOT a pass. ${summary.skipped} of these never ran.`);
  }
  lines.push("─".repeat(78));
  return lines.join("\n");
}
