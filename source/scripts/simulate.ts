/**
 * The playtest the owner does not have time to run.
 *
 * Two jobs, one harness:
 *
 *   --mode selfplay   thousands of bot-vs-bot duels, reporting how long games
 *                     last, whether they end at all, how much the coin flip
 *                     decides, and how every one of the 175 cards actually
 *                     performs when it reaches a board.
 *   --mode fuzz       both seats play random LEGAL moves with the full invariant
 *                     suite armed after every action, hunting crashes, corrupt
 *                     states, unserialisable saves and soft-locks.
 *
 * Usage:
 *   npm run sim                          both modes, default sizes
 *   npm run sim -- --games 1000          the largest permitted balance sample
 *   npm run sim -- --mode fuzz --games 400
 *   npm run sim -- --skill hard          how the roster looks under the strong bot
 *
 * Writes `.preview/balance/report.html` and `.preview/balance/stats.json`.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadData, playOneGame, ROOT, LEAD_CHECKPOINTS, OPENING_TURNS, type Driver, type GameResult } from "./sim-core";
import {
  checkConfigAgainstHarness,
  diffRuns,
  evaluate,
  formatGateBlock,
  parseConfig,
  summarise,
  tierOutliers,
  watchlist,
  type GateMetrics,
  type LadderMetric,
  type RunSnapshot,
} from "./balance-gate";
import {
  compareLadders,
  formatComparison,
  type LadderGame,
  type LadderRun,
} from "./ladder-compare";
import { botDials, type BotSkill } from "../src/engine/bot";
import { STARTING_CORE } from "../src/engine/game";
import type { CardDefinition, PlayerId } from "../src/engine/types";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const MODE = arg("mode", "both");
/** Owner cap: full self-play samples never exceed 1,000 duels. */
const MAX_GAMES = 1000;
const GAMES = Number(arg("games", String(MAX_GAMES)));
const FUZZ_GAMES = Number(arg("fuzz-games", String(Math.max(150, Math.round(GAMES / 6)))));
const SKILL = arg("skill", "normal") as BotSkill;
const SEED_PREFIX = arg("seed", "sim");
const TURN_CAP = Number(arg("turncap", "120"));
const CORE_HP_TEXT = arg("core-hp", "");
const CORE_HP = CORE_HP_TEXT === "" ? undefined : Number(CORE_HP_TEXT);
/** `--full` adds the bot ladder. Without it the three ladder checks SKIP loudly. */
const FULL = flag("full");

// The thresholds live in a file, never in this script. A check whose threshold is
// null, or whose sample is too thin, SKIPS — it is never counted as a pass.
const CONFIG = parseConfig(JSON.parse(readFileSync(join(ROOT, "balance.config.json"), "utf8")));
checkConfigAgainstHarness(CONFIG, OPENING_TURNS, LEAD_CHECKPOINTS);
const OPENING_WINDOW = CONFIG.checks.deadOpening.throughOwnTurns;
const SNOWBALL_TURN = CONFIG.checks.snowball.atTurn;

// A sample size that is zero or not a number would run no duels at all while the
// hygiene checks happily reported "0 — PASS". They skip on null now, but a
// mistyped --games is still worth refusing outright.
if (!Number.isInteger(GAMES) || GAMES < 1 || GAMES > MAX_GAMES) {
  console.error(`--games must be a whole number from 1 to ${MAX_GAMES}, got "${arg("games", "")}"`);
  process.exit(2);
}
if (!Number.isInteger(FUZZ_GAMES) || FUZZ_GAMES < 1 || FUZZ_GAMES > MAX_GAMES) {
  console.error(`--fuzz-games must be a whole number from 1 to ${MAX_GAMES}, got "${arg("fuzz-games", "")}"`);
  process.exit(2);
}
if (!Number.isInteger(TURN_CAP) || TURN_CAP < 1) {
  console.error(`--turncap must be a positive whole number, got "${arg("turncap", "")}"`);
  process.exit(2);
}
if (CORE_HP !== undefined && (!Number.isFinite(CORE_HP) || CORE_HP <= 0)) {
  console.error(`--core-hp must be a positive number, got "${CORE_HP_TEXT}"`);
  process.exit(2);
}
if (!["both", "selfplay", "fuzz"].includes(MODE)) {
  console.error(`--mode must be one of both, selfplay, fuzz — got "${MODE}"`);
  process.exit(2);
}
if (!["easy", "normal", "hard"].includes(SKILL)) {
  console.error(`--skill must be one of easy, normal, hard — got "${SKILL}"`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Card statistics
// ---------------------------------------------------------------------------

interface CardStat {
  card: CardDefinition;
  drawn: number;
  played: number;
  winsWhenPlayed: number;
  gamesWhenPlayed: number;
}

function newStats(cards: CardDefinition[]): Map<string, CardStat> {
  const map = new Map<string, CardStat>();
  for (const card of cards) map.set(card.id, { card, drawn: 0, played: 0, winsWhenPlayed: 0, gamesWhenPlayed: 0 });
  return map;
}

function absorb(stats: Map<string, CardStat>, result: GameResult) {
  for (const [cardId, count] of result.drawn) {
    const stat = stats.get(cardId);
    if (stat) stat.drawn += count;
  }
  for (const player of [0, 1] as PlayerId[]) {
    for (const [cardId, count] of result.playsByPlayer[player]) {
      const stat = stats.get(cardId);
      if (!stat) continue;
      stat.played += count;
      stat.gamesWhenPlayed += 1;
      if (result.winner === player) stat.winsWhenPlayed += 1;
    }
  }
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Opening fairness
//
// How often is a player dealt an opening they simply cannot act on? A dead
// opening never shows up in a win rate — the player loses a little tempo and the
// game moves on — but it is the worst first impression the game can make.
// ---------------------------------------------------------------------------

function openingStats(results: GameResult[], window: number) {
  let samples = 0;
  let deadThroughWindow = 0;
  let turnOneSamples = 0;
  let deadTurnOne = 0;
  // Split by seat, because the second player keeps The Coin even though both
  // seats now open with three cards.
  const bySeat = [
    { samples: 0, dead: 0 },
    { samples: 0, dead: 0 },
  ];

  for (const result of results) {
    for (const [seat, turns] of result.openingPlayable.entries()) {
      if (turns[0] !== null) {
        turnOneSamples += 1;
        if (turns[0] === false) deadTurnOne += 1;
      }
      // A duel that ended before the window closed is not a dead opening; it is
      // a short duel. Counting it either way would be a lie.
      const inWindow = turns.slice(0, window);
      if (inWindow.length < window || inWindow.some((playable) => playable === null)) continue;
      samples += 1;
      bySeat[seat].samples += 1;
      if (inWindow.every((playable) => playable === false)) {
        deadThroughWindow += 1;
        bySeat[seat].dead += 1;
      }
    }
  }

  return {
    samples,
    deadThroughWindowPct: pct(deadThroughWindow, samples),
    deadThroughWindow,
    turnOneSamples,
    deadTurnOnePct: pct(deadTurnOne, turnOneSamples),
    firstSeatDeadPct: pct(bySeat[0].dead, bySeat[0].samples),
    secondSeatDeadPct: pct(bySeat[1].dead, bySeat[1].samples),
  };
}

// ---------------------------------------------------------------------------
// Snowballing
//
// Take whoever is ahead at a checkpoint and ask how often they go on to win. A
// duel that is already decided on turn 5 still takes another fifteen turns to
// play out, and the player can feel it the whole way.
// ---------------------------------------------------------------------------

function snowballAt(results: GameResult[], turn: number) {
  let healthGames = 0;
  let healthWins = 0;
  let boardGames = 0;
  let boardWins = 0;
  // "Clearly ahead" = ahead on BOTH health and board. This is the one the gate
  // judges, because it is the only one of the three that matches what a player
  // would call being ahead. Health alone turns out to be a poor signal this
  // early — at turn 5 the player on more health is often simply the one who has
  // not committed to an attack yet.
  let clearGames = 0;
  let clearWins = 0;
  let levelGames = 0;

  for (const result of results) {
    if (result.winner === null || result.winner === "draw") continue;
    const snapshot = result.leads.find((entry) => entry.turn === turn);
    if (!snapshot) continue; // the duel ended before this checkpoint

    const healthLeader = snapshot.health[0] === snapshot.health[1] ? null : snapshot.health[0] > snapshot.health[1] ? 0 : 1;
    const boardLeader =
      snapshot.boardPower[0] === snapshot.boardPower[1] ? null : snapshot.boardPower[0] > snapshot.boardPower[1] ? 0 : 1;

    if (healthLeader !== null) {
      healthGames += 1;
      if (result.winner === healthLeader) healthWins += 1;
    }
    if (boardLeader !== null) {
      boardGames += 1;
      if (result.winner === boardLeader) boardWins += 1;
    }
    if (healthLeader !== null && healthLeader === boardLeader) {
      clearGames += 1;
      if (result.winner === healthLeader) clearWins += 1;
    } else {
      levelGames += 1;
    }
  }

  return {
    turn,
    /** Duels where one player was ahead on both measures. The gate's denominator. */
    leadGames: clearGames,
    tiedGames: levelGames,
    leaderWinPct: pct(clearWins, clearGames),
    healthGames,
    healthLeaderWinPct: pct(healthWins, healthGames),
    boardGames,
    boardLeaderWinPct: pct(boardWins, boardGames),
  };
}

/** A soft-lock is already its own check; counting it as an invariant breach too
 *  would make one defect light up two lamps and hide which one really moved. */
function isSoftLockProblem(text: string): boolean {
  return /no legal actions|live-lock|without finishing/.test(text);
}

// ---------------------------------------------------------------------------
// Self-play
// ---------------------------------------------------------------------------

function runSelfPlay(games: number) {
  const { cards, relics } = loadData();
  const stats = newStats(cards);
  const results: GameResult[] = [];
  const started = Date.now();

  for (let index = 0; index < games; index += 1) {
    // Every 40th game runs the full invariant suite; running it on all of them
    // triples the wall clock for information the fuzz mode already gathers.
    const result = playOneGame({
      cards,
      relics,
      seed: `${SEED_PREFIX}-${index}`,
      drivers: ["bot", "bot"] as [Driver, Driver],
      skills: [SKILL, SKILL],
      turnCap: TURN_CAP,
      deepChecks: index % 40 === 0,
      startingHealth: CORE_HP,
    });
    results.push(result);
    absorb(stats, result);
    if ((index + 1) % 250 === 0) {
      process.stdout.write(`  ${index + 1}/${games} games (${Math.round((Date.now() - started) / 1000)}s)\n`);
    }
  }

  const finished = results.filter((r) => !r.stalled && !r.softLocked);
  const turns = finished.map((r) => r.turns).sort((a, b) => a - b);
  const p = (q: number) => turns[Math.min(turns.length - 1, Math.floor(turns.length * q))] ?? 0;
  const firstWins = results.filter((r) => r.winner === 0).length;
  const secondWins = results.filter((r) => r.winner === 1).length;
  // A blowout is the winner finishing on most of their core. Expressed as a
  // fraction of the core the duel STARTED on — a literal here silently changed
  // meaning the moment starting health moved. That starting core is now read off
  // the game itself: inferring it from the healthiest survivor was wrong the
  // moment a healing effect pushed somebody above where they began.
  const startingCore = results[0]?.startingHealth ?? STARTING_CORE;
  const blowouts = finished.filter((r) => Math.max(r.healthLeft[0], r.healthLeft[1]) >= startingCore * 0.8).length;
  const problems = results.flatMap((r) => r.problems);

  return {
    games,
    skill: SKILL,
    startingCore,
    elapsedSec: Math.round((Date.now() - started) / 1000),
    finished: finished.length,
    stalled: results.filter((r) => r.stalled).length,
    softLocked: results.filter((r) => r.softLocked).length,
    // Seeds are reproducible, so a red gate should hand over the exact duel
    // rather than a count. `npm run sim -- --seed <this> --games 1` replays it.
    stalledSeeds: results.filter((r) => r.stalled).map((r) => r.seed).slice(0, 20),
    softLockedSeeds: results.filter((r) => r.softLocked).map((r) => r.seed).slice(0, 20),
    opening: openingStats(results, OPENING_WINDOW),
    snowball: snowballAt(results, SNOWBALL_TURN),
    snowballCurve: LEAD_CHECKPOINTS.map((turn) => snowballAt(results, turn)),
    invariantBreaches: problems.filter((text) => !isSoftLockProblem(text)).length,
    firstWins,
    secondWins,
    // A duel both players lose. It is not a stall and not a soft-lock, and it
    // quietly leaves every other denominator here smaller than the run size.
    draws: results.filter((r) => r.winner === "draw").length,
    concluded: results.filter((r) => r.winner !== null).length,
    firstWinPct: pct(firstWins, firstWins + secondWins),
    turnMedian: p(0.5),
    turnP10: p(0.1),
    turnP90: p(0.9),
    turnMin: turns[0] ?? 0,
    turnMax: turns[turns.length - 1] ?? 0,
    avgActions: Math.round(results.reduce((t, r) => t + r.actions, 0) / results.length),
    blowoutPct: pct(blowouts, finished.length),
    avgBoard:
      Math.round(
        (results.reduce((t, r) => t + r.avgBoard[0] + r.avgBoard[1], 0) / (results.length * 2)) * 100,
      ) / 100,
    problems: [...new Set(problems)].slice(0, 60),
    stats,
  };
}

// ---------------------------------------------------------------------------
// Core-HP sweep
//
// Mana cost is frozen, so core HP is the only dial that decides how long a duel
// runs — and duel length is what decides whether the expensive half of the
// roster exists at all. This measures that relationship instead of guessing it.
// ---------------------------------------------------------------------------

function runSweep(values: number[], games: number, ramps: number[]) {
  const { cards, relics } = loadData();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const expensive = new Set(cards.filter((c) => c.cost >= 9).map((c) => c.id));
  const bigHalf = new Set(cards.filter((c) => c.cost >= 8).map((c) => c.id));

  console.log("");
  console.log(" ramp  core   median  p90   peak   games reaching   9-10 cost   8+ cost   first   blowout   avg");
  console.log("       HP    turns  turns  mana    10 mana         played/game  played    win %      %     board");
  console.log(" ----  ----   ------ -----  ----   -------------   -----------  --------  ------  -------  -----");

  const table: Array<Record<string, number>> = [];
  const grid = ramps.flatMap((ramp) => values.map((hp) => ({ ramp, hp })));
  for (const { ramp, hp } of grid) {
    const results = [];
    for (let index = 0; index < games; index += 1) {
      results.push(
        playOneGame({
          cards,
          relics,
          seed: `${SEED_PREFIX}-sweep${ramp}x${hp}-${index}`,
          drivers: ["bot", "bot"] as [Driver, Driver],
          skills: [SKILL, SKILL],
          turnCap: 200,
          deepChecks: false,
          startingHealth: hp,
          manaRamp: ramp,
        }),
      );
    }
    const done = results.filter((r) => !r.stalled && !r.softLocked);
    const turns = done.map((r) => r.turns).sort((a, b) => a - b);
    const med = turns[Math.floor(turns.length / 2)] ?? 0;
    const p90 = turns[Math.floor(turns.length * 0.9)] ?? 0;
    const peak = results.reduce((t, r) => t + r.peakMana, 0) / results.length;
    const atTen = pct(results.filter((r) => r.peakMana >= 10).length, results.length);
    const bigPlays =
      results.reduce(
        (total, r) =>
          total +
          [0, 1].reduce(
            (sub, p) =>
              sub +
              [...r.playsByPlayer[p as 0 | 1]].reduce((n, [id, count]) => n + (expensive.has(id) ? count : 0), 0),
            0,
          ),
        0,
      ) / results.length;
    const eightPlays =
      results.reduce(
        (total, r) =>
          total +
          [0, 1].reduce(
            (sub, p) =>
              sub + [...r.playsByPlayer[p as 0 | 1]].reduce((n, [id, count]) => n + (bigHalf.has(id) ? count : 0), 0),
            0,
          ),
        0,
      ) / results.length;
    const first = pct(results.filter((r) => r.winner === 0).length, results.filter((r) => r.winner !== null).length);
    const blow = pct(done.filter((r) => Math.max(...r.healthLeft) >= hp * 0.8).length, done.length);
    const board = results.reduce((t, r) => t + r.avgBoard[0] + r.avgBoard[1], 0) / (results.length * 2);
    console.log(
      ` ${ramp.toFixed(2)}  ${String(hp).padStart(3)}    ${String(med).padStart(4)}   ${String(p90).padStart(4)}   ${peak
        .toFixed(1)
        .padStart(4)}      ${String(atTen).padStart(5)}%          ${bigPlays.toFixed(2).padStart(5)}     ${eightPlays
        .toFixed(2)
        .padStart(5)}    ${first.toFixed(1).padStart(5)}   ${blow.toFixed(1).padStart(5)}   ${board.toFixed(2)}`,
    );
    table.push({ ramp, hp, median: med, p90, peakMana: peak, reachTenPct: atTen, bigPlays, eightPlays, firstWinPct: first, blowoutPct: blow, avgBoard: board });
    void byId;
  }
  console.log("");
  return table;
}

// ---------------------------------------------------------------------------
// Skill ladder
//
// Three named difficulties are a lie unless they actually beat each other. Seats
// alternate every game so the result is the skill gap and not the going-second
// advantage.
// ---------------------------------------------------------------------------

/**
 * Writes the ladder result file.
 *
 * The per-game results and the bot's dials go in alongside the summary, because
 * a percentage on its own cannot be compared with anything later: it carries no
 * record of which duels produced it or which bot played them.
 */
function writeLadderFile(table: Array<LadderMetric & { medianTurns: number; results?: LadderGame[] }>): void {
  const run: LadderRun = {
    generatedAt: new Date().toISOString(),
    seedPrefix: SEED_PREFIX,
    dials: botDials(),
    matchups: table as LadderRun["matchups"],
  };
  writeFileSync(join(outDir, "ladder.json"), JSON.stringify(run, null, 1), "utf8");
}

function runLadder(gamesFor: (key: string) => number) {
  const { cards, relics } = loadData();
  const skills: BotSkill[] = ["easy", "normal", "hard"];
  const pairs: Array<[BotSkill, BotSkill]> = [
    ["hard", "easy"],
    ["hard", "normal"],
    ["normal", "easy"],
  ];
  console.log("");
  console.log("  matchup              stronger wins   median turns");
  console.log("  -------------------  -------------   ------------");
  const out: Array<LadderMetric & { medianTurns: number }> = [];
  // Ladder duels are real bot-vs-bot duels, so what they see about the ENGINE
  // counts too. Throwing it away meant a hard bot that stalled its own duels
  // simply shrank the sample until its check downgraded to a SKIP, while the
  // stalls check — which reads self-play only — stayed green.
  const hygiene = { stalled: 0, softLocked: 0, problems: [] as string[] };

  for (const [strong, weak] of pairs) {
    let wins = 0;
    let decided = 0;
    const turns: number[] = [];
    // Every duel's own result, kept so two runs can be compared game by game
    // instead of percentage against percentage. See `compareLadders`.
    const results: LadderGame[] = [];
    const games = gamesFor(`${strong}>${weak}`);
    for (let index = 0; index < games; index += 1) {
      const strongSeat: PlayerId = index % 2 === 0 ? 0 : 1;
      const seats: [BotSkill, BotSkill] = strongSeat === 0 ? [strong, weak] : [weak, strong];
      const result = playOneGame({
        cards, relics, seed: `${SEED_PREFIX}-ladder-${strong}-${weak}-${index}`,
        drivers: ["bot", "bot"], skills: seats, turnCap: 200, deepChecks: false,
        // The ladder asks how the three opponents compare as the player meets
        // them, so the Ascendant brings its Foresight draw here. Self-play does
        // NOT pass this — card win rates must stay measurements of the honest game.
        grantCheats: true,
      });
      const strongWon = result.winner === strongSeat;
      if (result.winner !== null && result.winner !== "draw") {
        decided += 1;
        if (strongWon) wins += 1;
      }
      results.push({
        seed: result.seed,
        strongSeat,
        // `null` covers a draw and a duel that never finished. Both are excluded
        // from a pairing rather than counted as a loss for either side.
        strongWon: result.winner === null || result.winner === "draw" ? null : strongWon,
        turns: result.turns,
      });
      if (result.stalled) hygiene.stalled += 1;
      if (result.softLocked) hygiene.softLocked += 1;
      hygiene.problems.push(...result.problems);
      turns.push(result.turns);
    }
    turns.sort((a, b) => a - b);
    const rate = pct(wins, Math.max(1, decided));
    console.log(`  ${(strong + " vs " + weak).padEnd(21)}${String(rate).padStart(9)}%       ${turns[Math.floor(turns.length / 2)]}`);
    out.push({
      key: `${strong}>${weak}`, strong, weak, played: games, decided, winPct: rate,
      medianTurns: turns[Math.floor(turns.length / 2)], results,
    });
  }
  void skills;
  console.log("");
  return { table: out, hygiene };
}

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

function runFuzz(games: number) {
  const { cards, relics } = loadData();
  const started = Date.now();
  const problems: string[] = [];
  // Where each problem came from. Recording only the text made a corrupt state
  // the one failure in this harness that could not be replayed: a stall printed
  // its seed and an invariant breach did not, so the more serious defect was the
  // harder one to chase. The drivers travel with the seed because a fuzz duel is
  // not reproducible without them — half the rotation is random play, and
  // replaying that seed under bot play is a different duel.
  const problemOrigins: { text: string; seed: string; drivers: [Driver, Driver] }[] = [];
  let softLocks = 0;
  let stalls = 0;
  // Split by driver: a stall in a bot-vs-bot fuzz duel is a real bot stall and
  // belongs in the gated number. A stall under random play is the random
  // driver's own behaviour and does not.
  let botStalls = 0;
  let actions = 0;

  for (let index = 0; index < games; index += 1) {
    // Mixed drivers matter: pure random play never reaches the late-game states a
    // real duel produces, and pure bot play never explores the weird corners.
    // Bot-vs-bot is in the rotation because it was NOT before, which left the
    // full invariant suite never running on a competently played duel here — and
    // self-play only deep-checks every 40th. A corrupt state that only good play
    // can assemble had almost nowhere to be caught.
    const drivers: [Driver, Driver] =
      index % 4 === 0
        ? ["random", "random"]
        : index % 4 === 1
          ? ["bot", "random"]
          : index % 4 === 2
            ? ["random", "bot"]
            : ["bot", "bot"];
    const seed = `${SEED_PREFIX}-fuzz-${index}`;
    const result = playOneGame({
      cards,
      relics,
      seed,
      drivers,
      skills: ["normal", "normal"],
      turnCap: TURN_CAP,
      deepChecks: true,
    });
    problems.push(...result.problems);
    for (const text of result.problems) problemOrigins.push({ text, seed, drivers });
    actions += result.actions;
    if (result.softLocked) softLocks += 1;
    if (result.stalled) {
      stalls += 1;
      if (drivers[0] === "bot" && drivers[1] === "bot") botStalls += 1;
    }
    if ((index + 1) % 50 === 0) {
      process.stdout.write(`  ${index + 1}/${games} fuzz games (${problems.length} problems so far)\n`);
    }
  }

  const unique = new Map<string, { count: number; seed: string; drivers: [Driver, Driver] }>();
  for (const { text, seed, drivers } of problemOrigins) {
    // Strip the turn number so the same defect reported on 200 different turns
    // collapses to one line with a count.
    const key = text.replace(/turn \d+/g, "turn N").replace(/\b[a-z]\d+\b/g, "<id>");
    const seen = unique.get(key);
    // First occurrence wins: the earliest seed is the cheapest to replay, and a
    // stable choice means two runs of the same build name the same duel.
    if (seen) seen.count += 1;
    else unique.set(key, { count: 1, seed, drivers });
  }

  return {
    games,
    elapsedSec: Math.round((Date.now() - started) / 1000),
    actions,
    softLocks,
    stalls,
    botStalls,
    /** Stalls under a random driver — reported, never gated. */
    randomStalls: stalls - botStalls,
    total: problems.length,
    invariantBreaches: problems.filter((text) => !isSoftLockProblem(text)).length,
    unique: [...unique.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([text, { count, seed, drivers }]) => ({ text, count, seed, drivers })),
    /** Every distinct invariant breach with a duel that produces it. */
    breaches: [...unique.entries()]
      .filter(([text]) => !isSoftLockProblem(text))
      .map(([text, { count, seed, drivers }]) => ({ text, count, seed, drivers })),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function cardRows(stats: Map<string, CardStat>) {
  return [...stats.values()]
    .map((s) => ({
      id: s.card.id,
      name: s.card.name,
      cost: s.card.cost,
      atk: s.card.atk,
      hp: s.card.hp,
      rarity: s.card.rarity,
      timing: s.card.effectTiming,
      camp: s.card.camp,
      drawn: s.drawn,
      played: s.played,
      playRate: pct(s.gamesWhenPlayed, Math.max(1, s.drawn)),
      winRate: pct(s.winsWhenPlayed, Math.max(1, s.gamesWhenPlayed)),
      sample: s.gamesWhenPlayed,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

function esc(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

interface GateSection {
  results: ReturnType<typeof evaluate>;
  summary: ReturnType<typeof summarise>;
  tiers: ReturnType<typeof tierOutliers>;
  watch: ReturnType<typeof cardRows>;
  diff: ReturnType<typeof diffRuns>;
  ladder: Array<LadderMetric & { medianTurns: number }> | null;
}

function buildReport(
  sp: ReturnType<typeof runSelfPlay> | null,
  fz: ReturnType<typeof runFuzz> | null,
  gate: GateSection,
): string {
  const rows = sp ? cardRows(sp.stats) : [];
  const sampled = rows.filter((r) => r.sample >= 25);
  const strong = sampled.slice(0, 20);
  const weak = [...sampled].reverse().slice(0, 20);
  const unplayed = gate.watch;

  const byTiming = new Map<string, { n: number; wins: number; games: number }>();
  for (const row of rows) {
    const bucket = byTiming.get(row.timing) ?? { n: 0, wins: 0, games: 0 };
    bucket.n += 1;
    bucket.games += row.sample;
    bucket.wins += Math.round((row.winRate / 100) * row.sample);
    byTiming.set(row.timing, bucket);
  }

  const table = (title: string, list: typeof rows) => `
  <h3>${esc(title)}</h3>
  <table><thead><tr><th>Card</th><th>Cost</th><th>Stats</th><th>Timing</th><th>Win %</th><th>Play %</th><th>n</th></tr></thead><tbody>
  ${list
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${r.cost}</td><td>${r.atk}/${r.hp}</td><td>${r.timing}</td><td class="${
          r.winRate > 56 ? "hot" : r.winRate < 44 ? "cold" : ""
        }">${r.winRate}</td><td>${r.playRate}</td><td>${r.sample}</td></tr>`,
    )
    .join("")}
  </tbody></table>`;

  // --- The gate verdict. The headline of the whole page: green or red, and if
  // anything skipped, that too — never folded into the green.
  const gateBlock = `
<h2>The gate</h2>
<p class="verdict ${gate.summary.failed ? "v-fail" : gate.summary.skipped ? "v-skip" : "v-pass"}">${esc(
    gate.summary.verdict,
  )}</p>
${gate.summary.skipped ? `<p class="sub">A skipped check is <b>not</b> a pass — ${gate.summary.skipped} of these never ran.</p>` : ""}
<table><thead><tr><th></th><th>Check</th><th>Measured</th><th>Wanted</th><th>Note</th></tr></thead><tbody>
${gate.results
  .map(
    (r) =>
      `<tr><td class="st-${r.state}">${r.state.toUpperCase()}</td><td>${esc(r.title)}</td><td>${esc(
        r.measured,
      )}</td><td>${esc(r.expected)}</td><td class="dim">${esc(r.note ?? "")}</td></tr>`,
  )
  .join("")}
</tbody></table>`;

  // --- Opening fairness and the snowball curve.
  const openingBlock = sp
    ? `
<h2>Opening hands</h2>
<div class="cards">
 <div class="kpi"><b>${sp.opening.deadThroughWindowPct}%</b><span>nothing playable through own turn ${OPENING_WINDOW}</span></div>
 <div class="kpi"><b>${sp.opening.firstSeatDeadPct}%</b><span>…going first</span></div>
 <div class="kpi"><b>${sp.opening.secondSeatDeadPct}%</b><span>…going second (2 cards + The Coin)</span></div>
 <div class="kpi"><b>${sp.opening.deadTurnOnePct}%</b><span>nothing playable on turn 1 (by design, never gated)</span></div>
 <div class="kpi"><b>${sp.opening.samples}</b><span>openings sampled</span></div>
</div>
<p class="sub">Measured by asking the engine for legal moves, not by comparing costs, so The Coin,
 per-card discounts and relics all count. Going first means two cards and one mana, so a dead first
turn is the shape of the opening rather than a defect — the three-turn number is the one that matters.</p>

<h2>Does an early lead decide it?</h2>
<table><thead><tr><th>At turn</th><th>Clearly ahead → wins</th><th>on that many duels</th><th>Ahead on health only</th><th>Ahead on board only</th></tr></thead><tbody>
${sp.snowballCurve
  .map(
    (s) =>
      `<tr><td>${s.turn}</td><td class="${s.leaderWinPct > 85 ? "hot" : ""}"><b>${s.leaderWinPct}%</b></td><td>${
        s.leadGames
      }</td><td>${s.healthLeaderWinPct}%</td><td>${s.boardLeaderWinPct}%</td></tr>`,
  )
  .join("")}
</tbody></table>
<p class="sub"><b>Clearly ahead</b> means ahead on health <i>and</i> on board strength at once — the only
one of the three that matches what a player would call being ahead, and the one the gate judges.
Health alone is a poor signal this early: the player on more health is often just the one who has not
committed to an attack yet.</p>
${(() => {
  // Turn 5 is the top of Player One's turn and turn 6 the top of Player Two's.
  // A snapshot favours whoever moved last, so the gap between the two is the
  // size of that bias, measured rather than assumed.
  const five = sp.snowballCurve.find((s) => s.turn === 5);
  const six = sp.snowballCurve.find((s) => s.turn === 6);
  if (!five || !six) return "";
  const gap = Math.round(Math.abs(five.leaderWinPct - six.leaderWinPct) * 10) / 10;
  return `<p class="sub"><b>How much does the snapshot's timing distort this?</b> Turn 5 is read at the top of
Player One's turn and turn 6 at the top of Player Two's, so each favours whoever moved last. They measure
${five.leaderWinPct}% and ${six.leaderWinPct}% — <b>${gap} points apart</b>. That gap is the size of the
timing bias, and the gate has ${Math.round((CONFIG.checks.snowball.maxLeaderWinPct ?? 0) - five.leaderWinPct)} points of headroom, so it does not change the verdict.</p>`;
})()}`
    : "";

  // --- Per-tier outliers. Every card judged against its OWN cost bracket and
  // never against the roster average, which would read "cheap" as "overpowered".
  const tierBlock = gate.tiers.length
    ? `
<h2>Outliers, cost tier by cost tier</h2>
<p class="sub">Each card is compared with the other cards of its own mana cost — never with the roster
average, which in a mana-limited game reads "cheap" as "overpowered" and points a balance pass
backwards. A card is only named when it is both beyond ${CONFIG.report.tierOutlierZ} standard errors
of its tier and at least ${CONFIG.report.tierOutlierMinDeltaPct} points away from it. Mana cost is
frozen: these get stat, keyword or effect changes, never a repricing.</p>
<table><thead><tr><th>Cost</th><th>Tier win %</th><th>Judged</th><th>Needs to beat</th><th>Winning far above their peers</th><th>Far below</th></tr></thead><tbody>
${gate.tiers
  .map((tier) => {
    const name = (list: typeof tier.above) =>
      list.length
        ? list.map((c) => `${esc(c.name)} <b>${c.delta > 0 ? "+" : ""}${c.delta}</b>`).join("<br>")
        : `<span class="dim">—</span>`;
    return `<tr><td>${tier.cost}</td><td>${tier.mean}%</td><td>${tier.judged}${
      tier.tooFewPlays ? ` <span class="dim">(+${tier.tooFewPlays} too rarely played)</span>` : ""
    }</td><td class="dim">${Number.isFinite(tier.noiseFloor) ? `${tier.noiseFloor} pts` : "—"}</td><td class="hot">${name(
      tier.above,
    )}</td><td class="cold">${name(tier.below)}</td></tr>`;
  })
  .join("")}
</tbody></table>`
    : "";

  // --- Before / after.
  const diffBlock = `
<h2>Against the previous run</h2>
${
  gate.diff.comparable
    ? `<p class="sub">Compared with the run of ${esc(gate.diff.against ?? "")}. Only moves larger than
       this run's own shuffle noise are listed; ${gate.diff.insideNoise} other cards moved by less than
       that and are not results.</p>
<table><thead><tr><th>Headline</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>
${gate.diff.headline
  .map(
    (h) =>
      `<tr><td>${esc(h.key)}</td><td>${h.before}</td><td>${h.after}</td><td class="${
        h.delta > 0 ? "hot" : h.delta < 0 ? "cold" : ""
      }">${h.delta > 0 ? "+" : ""}${h.delta}</td></tr>`,
  )
  .join("")}
</tbody></table>
${
  gate.diff.cards.length
    ? `<table><thead><tr><th>Card</th><th>Cost</th><th>Win % before</th><th>after</th><th>Change</th><th>Noise floor</th></tr></thead><tbody>
${gate.diff.cards
  .map(
    (c) =>
      `<tr><td>${esc(c.name)}</td><td>${c.cost}</td><td>${c.before}</td><td>${c.after}</td><td class="${
        c.delta > 0 ? "hot" : "cold"
      }">${c.delta > 0 ? "+" : ""}${c.delta}</td><td class="dim">±${c.noise}</td></tr>`,
  )
  .join("")}
</tbody></table>`
    : `<p class="good">No card moved by more than the shuffle noise. Whatever changed, it did not move the roster.</p>`
}`
    : `<p class="sub">${esc(gate.diff.reason ?? "no comparison available")}</p>`
}`;

  const ladderBlock = gate.ladder
    ? `
<h2>Does skill win?</h2>
<table><thead><tr><th>Matchup</th><th>Stronger bot wins</th><th>Decided duels</th><th>Median turns</th></tr></thead><tbody>
${gate.ladder
  .map(
    (l) =>
      `<tr><td>${esc(l.strong)} vs ${esc(l.weak)}</td><td>${l.winPct}%</td><td>${l.decided}</td><td>${l.medianTurns}</td></tr>`,
  )
  .join("")}
</tbody></table>`
    : `<h2>Does skill win?</h2><p class="sub">The ladder did not run — <code>npm run check:balance</code> is the full gate.</p>`;

  return `<meta charset="utf-8"><title>Convergence balance</title>
<style>
 body{background:#14100c;color:#e8dcc8;font:14px/1.55 system-ui,sans-serif;margin:0;padding:28px 34px}
 h1{font-size:26px;margin:0 0 4px} h2{margin:32px 0 10px;color:#e0b862;border-bottom:1px solid #3a2f22;padding-bottom:5px}
 h3{margin:20px 0 8px;font-size:15px;color:#c9b48c}
 .sub{color:#9c8a70;margin:0 0 20px}
 .cards{display:flex;flex-wrap:wrap;gap:12px}
 .kpi{background:#1e1811;border:1px solid #3a2f22;border-radius:9px;padding:11px 15px;min-width:128px}
 .kpi b{display:block;font-size:22px;color:#f0d9a8} .kpi span{color:#9c8a70;font-size:12px}
 table{border-collapse:collapse;width:100%;margin-bottom:8px} th,td{padding:4px 9px;text-align:left;border-bottom:1px solid #2b2318}
 th{color:#9c8a70;font-weight:600;font-size:12px} .hot{color:#ff9b7a;font-weight:700} .cold{color:#7ab6ff;font-weight:700}
 .bad{color:#ff8f6a} .good{color:#8fe08f} .dim{color:#7e6f59;font-size:12px}
 pre{background:#1e1811;border:1px solid #3a2f22;padding:11px;border-radius:8px;white-space:pre-wrap;font-size:12px}
 code{background:#1e1811;border:1px solid #3a2f22;border-radius:4px;padding:1px 5px;font-size:12px}
 .verdict{font-size:20px;font-weight:700;margin:0 0 6px;padding:11px 15px;border-radius:9px;border:1px solid}
 .v-pass{color:#8fe08f;background:#161e14;border-color:#2f4a2a}
 .v-fail{color:#ff8f6a;background:#25150f;border-color:#5a2f22}
 .v-skip{color:#f0d9a8;background:#241d10;border-color:#5a4722}
 td.st-pass{color:#8fe08f;font-weight:700} td.st-fail{color:#ff8f6a;font-weight:700} td.st-skip{color:#f0d9a8;font-weight:700}
</style>
<h1>Convergence — machine playtest</h1>
<p class="sub">${sp ? `${sp.games} bot-vs-bot duels at <b>${sp.skill}</b> · ${sp.elapsedSec}s` : ""}${
    fz ? ` · ${fz.games} fuzz games, ${fz.actions.toLocaleString()} actions` : ""
  }</p>
${gateBlock}
${
  sp
    ? `<h2>Does the game work?</h2>
<div class="cards">
 <div class="kpi"><b class="${sp.softLocked ? "bad" : "good"}">${sp.softLocked}</b><span>soft-locks</span></div>
 <div class="kpi"><b class="${sp.stalled ? "bad" : "good"}">${sp.stalled}</b><span>stalled games</span></div>
 <div class="kpi"><b class="${sp.draws ? "bad" : "good"}">${sp.draws}</b><span>draws (nobody wins)</span></div>
 <div class="kpi"><b>${sp.turnMedian}</b><span>median turns</span></div>
 <div class="kpi"><b>${sp.turnP10}–${sp.turnP90}</b><span>10th–90th pct</span></div>
 <div class="kpi"><b class="${Math.abs(sp.firstWinPct - 50) > 6 ? "bad" : "good"}">${sp.firstWinPct}%</b><span>first player wins</span></div>
 <div class="kpi"><b>${sp.blowoutPct}%</b><span>blowouts (winner ≥25 hp)</span></div>
 <div class="kpi"><b>${sp.avgBoard}</b><span>avg minions per side</span></div>
 <div class="kpi"><b>${sp.avgActions}</b><span>actions per game</span></div>
</div>
<h2>Effect timing</h2>
<table><thead><tr><th>Timing</th><th>Cards</th><th>Times played</th><th>Win % when played</th></tr></thead><tbody>
${[...byTiming.entries()]
  .map(
    ([timing, b]) =>
      `<tr><td>${timing}</td><td>${b.n}</td><td>${b.games}</td><td>${pct(b.wins, Math.max(1, b.games))}</td></tr>`,
  )
  .join("")}
</tbody></table>
${openingBlock}
${tierBlock}
<h2>The roster</h2>
${table("Strongest — candidates for a nerf (stats or effect, never cost)", strong)}
${table("Weakest — candidates for a buff", weak)}
${table(
  `Watchlist — reaches a hand often, reaches a board rarely (under ${CONFIG.report.watchlistPlayRatePct}% play rate)`,
  unplayed.slice(0, 20),
)}`
    : ""
}
${ladderBlock}
${diffBlock}
${
  fz
    ? `<h2>Fuzz</h2>
<div class="cards">
 <div class="kpi"><b class="${fz.softLocks ? "bad" : "good"}">${fz.softLocks}</b><span>soft-locks</span></div>
 <div class="kpi"><b>${fz.stalls}</b><span>stalls</span></div>
 <div class="kpi"><b class="${fz.total ? "bad" : "good"}">${fz.total}</b><span>invariant breaches</span></div>
</div>
${
  fz.unique.length
    ? `<pre>${esc(fz.unique.map((u) => `${String(u.count).padStart(5)} x  ${u.text}`).join("\n"))}</pre>`
    : `<p class="good">No invariant ever broke. No crash, no corrupt state, no unserialisable save, no dead end.</p>`
}`
    : ""
}
${
  sp && sp.problems.length
    ? `<h2>Self-play problems</h2><pre>${esc(sp.problems.join("\n"))}</pre>`
    : ""
}`;
}

// ---------------------------------------------------------------------------

const outDir = join(ROOT, ".preview", "balance");
mkdirSync(outDir, { recursive: true });

let selfPlay: ReturnType<typeof runSelfPlay> | null = null;
let fuzz: ReturnType<typeof runFuzz> | null = null;

// Replay one exact duel. Seeds are reproducible, so when the gate names a
// stalled or soft-locked seed this plays that same duel back with the full
// invariant suite armed, instead of leaving a count and no way in.
function parseDrivers(value: string): [Driver, Driver] {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => part !== "bot" && part !== "random")) {
    // Refusing beats defaulting. A mistyped pair would replay a DIFFERENT duel
    // and report "no invariant ever broke", which reads as the bug being fixed.
    console.error(`--drivers must be two of bot|random, comma separated, got "${value}"`);
    process.exit(2);
  }
  return parts as [Driver, Driver];
}

const REPLAY = arg("replay", "");
if (REPLAY) {
  const { cards, relics } = loadData();
  // Self-play duels are bot-vs-bot, so that stays the default. A fuzz duel is
  // only reproducible with the driver pair it actually ran under, which the fuzz
  // summary now prints beside the seed.
  const drivers = parseDrivers(arg("drivers", "bot,bot"));
  const one = playOneGame({
    cards,
    relics,
    seed: REPLAY,
    drivers,
    skills: [SKILL, SKILL],
    turnCap: TURN_CAP,
    deepChecks: true,
    startingHealth: CORE_HP,
  });
  console.log(`Replaying ${REPLAY} at ${SKILL} with drivers ${drivers.join(",")}, turn cap ${TURN_CAP}`);
  console.log(`  winner ${one.winner ?? "nobody"}, ${one.turns} turns, ${one.actions} actions`);
  console.log(`  core left ${one.healthLeft[0]} / ${one.healthLeft[1]}, peak mana ${one.peakMana}`);
  console.log(`  stalled ${one.stalled}, soft-locked ${one.softLocked}`);
  if (one.problems.length) {
    console.log("  problems:");
    for (const problem of one.problems.slice(0, 40)) console.log(`    ${problem}`);
  } else {
    console.log("  no invariant ever broke in this duel");
  }
  process.exit(one.softLocked || one.stalled ? 1 : 0);
}

// Compare two saved ladder runs game by game. Reads only; runs no duels.
{
  const against = arg("ladder-compare", "");
  if (against) {
    const current = arg("ladder-current", join(outDir, "ladder.json"));
    let before: LadderRun;
    let after: LadderRun;
    try {
      before = JSON.parse(readFileSync(against, "utf8")) as LadderRun;
      after = JSON.parse(readFileSync(current, "utf8")) as LadderRun;
    } catch (error) {
      console.error(`Could not read both ladder files: ${(error as Error).message}`);
      process.exit(2);
    }
    if (!Array.isArray(before?.matchups) || !Array.isArray(after?.matchups)) {
      console.error("Both files must be ladder runs written by `npm run sim -- --ladder`.");
      process.exit(2);
    }
    console.log(formatComparison(compareLadders(before, after), against, current));
    process.exit(0);
  }
}

if (flag("ladder")) {
  const override = Number(arg("ladder-games", "0"));
  if (!Number.isInteger(override) || override < 0 || override > MAX_GAMES) {
    console.error(`--ladder-games must be a whole number from 0 to ${MAX_GAMES}, got "${arg("ladder-games", "")}"`);
    process.exit(2);
  }
  const { table } = runLadder((key) => override || CONFIG.checks.skillLadder.games[key] || 150);
  writeLadderFile(table);
  console.log(`  Saved to ${join(outDir, "ladder.json")}.`);
  console.log(`  Compare a later run with: npm run sim -- --ladder-compare <a copy of that file>`);
  console.log("");
  process.exit(0);
}

if (flag("sweep")) {
  const values = arg("sweep-hp", "30,36,44,52").split(",").map(Number);
  const ramps = arg("sweep-ramp", "1,1.2,1.35,1.5").split(",").map(Number);
  const sweepGames = Number(arg("sweep-games", "400"));
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    console.error(`--sweep-hp must be a comma-separated list of positive numbers`);
    process.exit(2);
  }
  if (ramps.length === 0 || ramps.some((ramp) => !Number.isFinite(ramp) || ramp <= 0)) {
    console.error(`--sweep-ramp must be a comma-separated list of positive numbers`);
    process.exit(2);
  }
  if (!Number.isInteger(sweepGames) || sweepGames < 1 || sweepGames > MAX_GAMES) {
    console.error(`--sweep-games must be a whole number from 1 to ${MAX_GAMES}`);
    process.exit(2);
  }
  const table = runSweep(values, sweepGames, ramps);
  writeFileSync(join(outDir, "sweep.json"), JSON.stringify(table, null, 1), "utf8");
  console.log("Sweep written to .preview/balance/sweep.json");
  process.exit(0);
}

if (MODE === "selfplay" || MODE === "both") {
  console.log(`Self-play: ${GAMES} games at ${SKILL}…`);
  selfPlay = runSelfPlay(GAMES);
}
if (MODE === "fuzz" || MODE === "both") {
  console.log(`Fuzz: ${FUZZ_GAMES} games with full invariant checking…`);
  fuzz = runFuzz(FUZZ_GAMES);
}

let ladder: Array<LadderMetric & { medianTurns: number; results?: LadderGame[] }> | null = null;
let ladderHygiene: { stalled: number; softLocked: number; problems: string[] } | null = null;
if (FULL && CONFIG.checks.skillLadder.enabled) {
  const per = CONFIG.checks.skillLadder.games;
  console.log(`Ladder: ${Object.entries(per).map(([key, n]) => `${key} ${n}`).join(", ")} duels…`);
  const run = runLadder((key) => per[key] ?? 150);
  ladder = run.table;
  ladderHygiene = run.hygiene;
  writeLadderFile(ladder);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

// `null` where nothing was measured. `?? 0` here used to make three checks
// report a confident green over an empty run.
const sawBotDuels = Boolean(selfPlay) || Boolean(ladderHygiene);
const sawAnyDuels = sawBotDuels || Boolean(fuzz);
const ladderProblems = ladderHygiene?.problems.filter((text) => !isSoftLockProblem(text)).length ?? 0;

const metrics: GateMetrics = {
  decidedGames: selfPlay ? selfPlay.firstWins + selfPlay.secondWins : 0,
  firstWinPct: selfPlay?.firstWinPct ?? 0,
  finishedGames: selfPlay?.finished ?? 0,
  medianTurns: selfPlay?.turnMedian ?? 0,
  // A soft-lock stays summed across every driver: a dead end found under random
  // play is a real dead end. A stall does not, for the reason recorded on
  // GateMetrics.stalls — but ladder duels ARE bot duels and do count.
  softLocks: sawAnyDuels ? (selfPlay?.softLocked ?? 0) + (fuzz?.softLocks ?? 0) + (ladderHygiene?.softLocked ?? 0) : null,
  stalls: sawBotDuels || fuzz
    ? (selfPlay?.stalled ?? 0) + (ladderHygiene?.stalled ?? 0) + (fuzz?.botStalls ?? 0)
    : null,
  fuzzStalls: fuzz?.randomStalls ?? 0,
  invariantBreaches: sawAnyDuels
    ? (selfPlay?.invariantBreaches ?? 0) + (fuzz?.invariantBreaches ?? 0) + ladderProblems
    : null,
  draws: selfPlay ? selfPlay.draws : null,
  concludedGames: selfPlay?.concluded ?? 0,
  opening: selfPlay
    ? {
        samples: selfPlay.opening.samples,
        deadThroughWindowPct: selfPlay.opening.deadThroughWindowPct,
        deadTurnOnePct: selfPlay.opening.deadTurnOnePct,
      }
    : null,
  ladder,
  snowball: selfPlay
    ? {
        turn: selfPlay.snowball.turn,
        leadGames: selfPlay.snowball.leadGames,
        tiedGames: selfPlay.snowball.tiedGames,
        leaderWinPct: selfPlay.snowball.leaderWinPct,
      }
    : null,
};

const results = evaluate(metrics, CONFIG);
const summary = summarise(results);
const rows = selfPlay ? cardRows(selfPlay.stats) : [];

// ---------------------------------------------------------------------------
// Run history, so "did that balance change help?" has an answer.
//
// The previous run is read BEFORE this one is written, and a run is only
// compared with one that used the same size, seed, skill and core HP — a delta
// between two different experiments is not a result.
// ---------------------------------------------------------------------------

const historyDir = join(outDir, "history");
mkdirSync(historyDir, { recursive: true });

function previousRun(): RunSnapshot | null {
  const files = readdirSync(historyDir)
    .filter((name) => name.startsWith("run-") && name.endsWith(".json"))
    .sort();
  const newest = files[files.length - 1];
  if (!newest) return null;
  try {
    return JSON.parse(readFileSync(join(historyDir, newest), "utf8")) as RunSnapshot;
  } catch {
    console.log(`  (ignoring unreadable history file ${newest})`);
    return null;
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshot: RunSnapshot = {
  stamp,
  games: GAMES,
  skill: SKILL,
  seedPrefix: SEED_PREFIX,
  coreHp: selfPlay?.startingCore ?? CORE_HP ?? STARTING_CORE,
  headline: {
    firstWinPct: selfPlay?.firstWinPct ?? 0,
    medianTurns: selfPlay?.turnMedian ?? 0,
    blowoutPct: selfPlay?.blowoutPct ?? 0,
    avgBoard: selfPlay?.avgBoard ?? 0,
    deadOpeningPct: selfPlay?.opening.deadThroughWindowPct ?? 0,
    snowballPct: selfPlay?.snowball.leaderWinPct ?? 0,
  },
  cards: rows.map((row) => ({
    id: row.id,
    name: row.name,
    cost: row.cost,
    winRate: row.winRate,
    playRate: row.playRate,
    sample: row.sample,
  })),
};

const diff = diffRuns(previousRun(), snapshot, CONFIG);

if (selfPlay) {
  writeFileSync(join(historyDir, `run-${stamp}.json`), JSON.stringify(snapshot), "utf8");
  const kept = readdirSync(historyDir)
    .filter((name) => name.startsWith("run-") && name.endsWith(".json"))
    .sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - CONFIG.report.historyRunsKept))) {
    rmSync(join(historyDir, old), { force: true });
  }
}

const gateSection: GateSection = {
  results,
  summary,
  tiers: tierOutliers(rows, CONFIG),
  watch: watchlist(rows, CONFIG),
  diff,
  ladder,
};

writeFileSync(join(outDir, "report.html"), buildReport(selfPlay, fuzz, gateSection), "utf8");
writeFileSync(
  join(outDir, "stats.json"),
  JSON.stringify(
    {
      gate: { verdict: summary.verdict, results },
      selfPlay: selfPlay ? { ...selfPlay, stats: rows } : null,
      fuzz,
      ladder,
      diff,
    },
    null,
    1,
  ),
  "utf8",
);

console.log("");
if (selfPlay) {
  console.log(`GAMES     ${selfPlay.games} at ${selfPlay.skill}, ${selfPlay.elapsedSec}s`);
  console.log(`LENGTH    median ${selfPlay.turnMedian} turns  (p10 ${selfPlay.turnP10}, p90 ${selfPlay.turnP90}, max ${selfPlay.turnMax})`);
  console.log(`ENDS      ${selfPlay.finished} finished, ${selfPlay.stalled} stalled, ${selfPlay.softLocked} soft-locked`);
  console.log(`COIN FLIP first player wins ${selfPlay.firstWinPct}%`);
  console.log(`BLOWOUTS  ${selfPlay.blowoutPct}%   avg board ${selfPlay.avgBoard}`);
  if (selfPlay.problems.length) console.log(`PROBLEMS  ${selfPlay.problems.length} distinct`);
}
if (selfPlay) {
  console.log(`OPENINGS  ${selfPlay.opening.deadThroughWindowPct}% dead through own turn ${OPENING_WINDOW}  (first seat ${selfPlay.opening.firstSeatDeadPct}%, second ${selfPlay.opening.secondSeatDeadPct}%)`);
  console.log(`          turn 1 alone: ${selfPlay.opening.deadTurnOnePct}% — by design, never gated`);
  console.log(`SNOWBALL  clearly ahead at turn ${selfPlay.snowball.turn} wins ${selfPlay.snowball.leaderWinPct}% of ${selfPlay.snowball.leadGames} duels`);
  console.log(`          health lead alone ${selfPlay.snowball.healthLeaderWinPct}%, board lead alone ${selfPlay.snowball.boardLeaderWinPct}%`);
  {
    const five = selfPlay.snowballCurve.find((s) => s.turn === 5);
    const six = selfPlay.snowballCurve.find((s) => s.turn === 6);
    if (five && six) {
      const gap = Math.round(Math.abs(five.leaderWinPct - six.leaderWinPct) * 10) / 10;
      console.log(`          timing bias: turn 5 (P1 to move) ${five.leaderWinPct}% vs turn 6 (P2 to move) ${six.leaderWinPct}% — ${gap} pts apart`);
    }
  }
}
if (fuzz) {
  console.log(`FUZZ      ${fuzz.games} games, ${fuzz.actions.toLocaleString()} actions, ${fuzz.elapsedSec}s`);
  console.log(`          ${fuzz.total} invariant breaches, ${fuzz.softLocks} soft-locks, ${fuzz.stalls} stalls`);
  for (const u of fuzz.unique.slice(0, 12)) {
    console.log(`          ${String(u.count).padStart(5)} x ${u.text}`);
    console.log(`                  replay: npm run sim -- --replay ${u.seed} --drivers ${u.drivers.join(",")}`);
  }
}

// The per-tier offenders, named. Judged against their own cost bracket only.
const named = gateSection.tiers.filter((tier) => tier.above.length || tier.below.length);
if (named.length) {
  console.log("");
  console.log("OUTLIERS (against their OWN cost tier, never the roster average)");
  for (const tier of named) {
    const say = (list: typeof tier.above) => list.map((c) => `${c.name} ${c.delta > 0 ? "+" : ""}${c.delta}`).join(", ");
    console.log(`  cost ${String(tier.cost).padStart(2)}  tier wins ${tier.mean}%`);
    if (tier.above.length) console.log(`          above: ${say(tier.above)}`);
    if (tier.below.length) console.log(`          below: ${say(tier.below)}`);
  }
} else if (selfPlay) {
  console.log("");
  console.log("OUTLIERS  none — no card stands clear of its own cost tier beyond the noise");
}

if (diff.comparable) {
  console.log("");
  console.log(`VS PREVIOUS RUN (${diff.against})`);
  for (const h of diff.headline) {
    if (h.delta !== 0) console.log(`  ${h.key.padEnd(16)} ${h.before} -> ${h.after}  (${h.delta > 0 ? "+" : ""}${h.delta})`);
  }
  if (diff.cards.length) {
    for (const c of diff.cards.slice(0, 15)) {
      console.log(`  ${c.name.padEnd(24)} ${c.delta > 0 ? "+" : ""}${c.delta} win rate   (noise floor ±${c.noise})`);
    }
  } else {
    console.log(`  no card moved beyond its own shuffle noise`);
  }
  if (diff.insideNoise) console.log(`  ${diff.insideNoise} other cards moved by less than the noise — not results`);
} else {
  console.log("");
  console.log(`VS PREVIOUS RUN  ${diff.reason}`);
}

if (selfPlay?.stalledSeeds.length || selfPlay?.softLockedSeeds.length) {
  console.log("");
  console.log("REPRODUCE  these duels went wrong. Replay any of them exactly as it happened:");
  for (const seed of [...selfPlay.softLockedSeeds, ...selfPlay.stalledSeeds].slice(0, 8)) {
    console.log(`  npm run sim -- --replay ${seed}`);
  }
}

console.log(formatGateBlock(results));
console.log(`Report: .preview/balance/report.html`);
if (!FULL) console.log(`Full gate including the bot ladder: npm run check:balance`);

process.exitCode = summary.green ? 0 : 1;
