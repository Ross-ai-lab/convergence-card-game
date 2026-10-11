/**
 * Does the campaign get harder the way it says it does?
 *
 * Every chapter's boss is set up exactly as the game sets it up (its deck, its
 * Hero Power, its search depth and its cheats, through `createCampaignDuel`) and
 * played against two stand-in players:
 *
 *   starter   the 30-card starter deck and the first Hero Power: a new player
 *   drafted   a deck drafted from the whole pool: a player with a full collection
 *
 * Both stand-ins search at Veteran depth and never cheat. What comes out is the
 * boss's win rate per chapter, with a 95% interval, and the same rates averaged
 * per difficulty tier. The gate in `simulate.ts` reads those tier averages.
 *
 * Usage, on its own:
 *   npx tsx scripts/campaign-difficulty.ts --games 40
 *   npx tsx scripts/campaign-difficulty.ts --games 40 --chapters 1,5,11,15
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createCampaignDuel } from "../src/campaign-duel";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_DIFFICULTIES, CAMPAIGN_STARTER_DECK, type CampaignDifficultyId } from "../src/campaign";
import { CAMPAIGN_CARD_IDS } from "../src/progress";
import { HERO_POWER_UNLOCK_ORDER } from "../src/engine/hero-powers";
import type { BotSkill } from "../src/engine/bot";
import type { GameState } from "../src/engine/types";
import { BOT_CHEATS } from "../src/engine/bot";
import { draftedSeat, FAIR_CHEATS, loadData, playOneGame, ROOT } from "./sim-core";

export type PlayerProxy = "starter" | "drafted";
/**
 * Whose cheats the boss plays with. `tier` is the game as shipped; `none` and
 * `all` force every boss fair or fully cheating, on the same seeds, so the two
 * runs differ in the cheats alone and the gap between them is what they are worth.
 */
export type CheatMode = "tier" | "none" | "all";
export const PLAYER_PROXIES: readonly PlayerProxy[] = ["starter", "drafted"];
/** The stand-in player's search depth: Veteran, the middle of the three. */
export const PLAYER_SKILL: BotSkill = "normal";
/** Fewer duels per boss and deck than this is a smoke test, saved apart. */
const MIN_SAVED_GAMES = 40;

export interface ChapterResult {
  chapter: number;
  boss: string;
  difficulty: CampaignDifficultyId;
  proxy: PlayerProxy;
  games: number;
  bossWins: number;
  draws: number;
  stalled: number;
  bossWinPct: number;
  /** Half-width of the 95% interval, in points. */
  ci95: number;
  medianTurns: number;
}

export interface TierResult {
  difficulty: CampaignDifficultyId;
  proxy: PlayerProxy;
  chapters: number[];
  games: number;
  bossWinPct: number;
  ci95: number;
}

export interface CampaignRun {
  gamesPerChapter: number;
  cheatMode: CheatMode;
  playerSkill: BotSkill;
  chapters: ChapterResult[];
  tiers: TierResult[];
  seconds: number;
}

const TIERS: readonly CampaignDifficultyId[] = ["recruit", "veteran", "ascendantFair", "ascendant"];

const ci95 = (pct: number, n: number) => (n === 0 ? 0 : Math.round(196 * Math.sqrt((pct / 100) * (1 - pct / 100) / n) * 10) / 10);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** One boss duel, built exactly as the game builds it, with the stand-in in seat one. */
export function bossDuel(chapter: number, proxy: PlayerProxy, seed: string, cheatMode: CheatMode = "tier"): GameState {
  const { cards, relics } = loadData();
  const seat = proxy === "starter"
    ? { deck: [...CAMPAIGN_STARTER_DECK], heroPower: HERO_POWER_UNLOCK_ORDER[0] }
    : draftedSeat(cards, relics, seed, 0);
  const { state, difficulty } = createCampaignDuel({
    chapter, playerDeck: seat.deck, unlockedCardIds: CAMPAIGN_CARD_IDS, cards, relics, seed, heroPower: seat.heroPower,
  });
  // The boss keeps its tier's cheats; the stand-in gets none, explicitly, or its
  // search would default to the cheats of its own skill.
  const bossCheats = cheatMode === "none" ? FAIR_CHEATS : cheatMode === "all" ? BOT_CHEATS.hard : difficulty.cheats;
  state.botCheats = [{ ...FAIR_CHEATS }, { ...bossCheats }];
  return state;
}

export function runCampaignDifficulty(options: { games: number; chapters?: number[]; seedPrefix?: string; cheatMode?: CheatMode; onChapter?: (result: ChapterResult) => void }): CampaignRun {
  const cheatMode = options.cheatMode ?? "tier";
  const started = Date.now();
  const { cards, relics } = loadData();
  const wanted = options.chapters ?? CAMPAIGN_CHAPTERS.map((chapter) => chapter.chapter);
  const results: ChapterResult[] = [];
  for (const chapter of CAMPAIGN_CHAPTERS.filter((entry) => wanted.includes(entry.chapter))) {
    const difficulty = CAMPAIGN_DIFFICULTIES[chapter.difficultyId];
    const boss = cards.find((card) => card.id === chapter.bossId)?.name ?? chapter.bossId;
    for (const proxy of PLAYER_PROXIES) {
      let bossWins = 0, draws = 0, stalled = 0;
      const turns: number[] = [];
      for (let index = 0; index < options.games; index++) {
        const seed = `${options.seedPrefix ?? "campaign"}:${chapter.chapter}:${proxy}:${index}`;
        const result = playOneGame({
          cards, relics, seed, drivers: ["bot", "bot"], skills: [PLAYER_SKILL, difficulty.botSkill],
          turnCap: 150, deepChecks: false, initialState: bossDuel(chapter.chapter, proxy, seed, cheatMode),
        });
        if (result.winner === 1) bossWins += 1;
        else if (result.winner === "draw") draws += 1;
        if (result.stalled) stalled += 1;
        turns.push(result.turns);
      }
      turns.sort((a, b) => a - b);
      const pct = round1((bossWins / options.games) * 100);
      const row: ChapterResult = {
        chapter: chapter.chapter, boss, difficulty: chapter.difficultyId, proxy, games: options.games,
        bossWins, draws, stalled, bossWinPct: pct, ci95: ci95(pct, options.games), medianTurns: turns[Math.floor(turns.length / 2)] ?? 0,
      };
      results.push(row);
      options.onChapter?.(row);
    }
  }
  return { gamesPerChapter: options.games, cheatMode, playerSkill: PLAYER_SKILL, chapters: results, tiers: summariseTiers(results), seconds: Math.round((Date.now() - started) / 1000) };
}

/** Pools each tier's chapters into one rate per stand-in deck. */
export function summariseTiers(results: ChapterResult[]): TierResult[] {
  const tiers: TierResult[] = [];
  for (const difficulty of TIERS) {
    for (const proxy of PLAYER_PROXIES) {
      const rows = results.filter((row) => row.difficulty === difficulty && row.proxy === proxy);
      if (!rows.length) continue;
      const games = rows.reduce((sum, row) => sum + row.games, 0);
      const wins = rows.reduce((sum, row) => sum + row.bossWins, 0);
      const pct = round1((wins / games) * 100);
      tiers.push({ difficulty, proxy, chapters: rows.map((row) => row.chapter), games, bossWinPct: pct, ci95: ci95(pct, games) });
    }
  }
  return tiers;
}

/**
 * The same run split across worker processes, one group of chapters each. The
 * Ascendant chapters search far deeper, so chapters are dealt out round-robin
 * rather than in blocks, which keeps the groups close in cost.
 */
export async function runCampaignDifficultyParallel(options: { games: number; chapters?: number[]; seedPrefix?: string; cheatMode?: CheatMode; jobs: number; onLine?: (line: string) => void }): Promise<CampaignRun> {
  const cheatMode = options.cheatMode ?? "tier";
  const started = Date.now();
  const wanted = options.chapters ?? CAMPAIGN_CHAPTERS.map((chapter) => chapter.chapter);
  const groups = Array.from({ length: Math.min(options.jobs, wanted.length) }, (_, index) => wanted.filter((_, at) => at % options.jobs === index));
  const script = join(ROOT, "scripts", "campaign-difficulty.ts");
  // Node runs tsx's own entry directly: no shell, no npx lookup per worker, and
  // every argument reaches the worker as it was given.
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const parts = await Promise.all(groups.map((group, index) => new Promise<CampaignRun>((resolve, reject) => {
    const out = join(tmpdir(), `convergence-campaign-${process.pid}-${index}.json`);
    const child = spawn(process.execPath, [tsx, script, "--games", String(options.games), "--chapters", group.join(","), "--seed", options.seedPrefix ?? "campaign", "--cheats", cheatMode, "--out", out, "--quiet"], { cwd: ROOT });
    child.stdout.on("data", (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => options.onLine?.(line)));
    child.stderr.on("data", (chunk) => options.onLine?.(String(chunk).trim()));
    child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(readFileSync(out, "utf8")) as CampaignRun) : reject(new Error(`campaign worker ${index} exited with ${code}`))));
  })));
  const chapters = parts.flatMap((part) => part.chapters).sort((a, b) => a.chapter - b.chapter || a.proxy.localeCompare(b.proxy));
  return { gamesPerChapter: options.games, cheatMode, playerSkill: PLAYER_SKILL, chapters, tiers: summariseTiers(chapters), seconds: Math.round((Date.now() - started) / 1000) };
}

export function formatCampaignTable(run: CampaignRun): string {
  const lines = [
    `CAMPAIGN DIFFICULTY  boss win rate against a ${run.playerSkill}-search stand-in, ${run.gamesPerChapter} duels per chapter and deck${run.cheatMode === "tier" ? "" : `, boss cheats forced ${run.cheatMode === "all" ? "ON" : "OFF"}`}`,
    "  ch  boss                       tier            starter deck        drafted deck",
  ];
  for (const chapter of CAMPAIGN_CHAPTERS) {
    const rows = run.chapters.filter((row) => row.chapter === chapter.chapter);
    if (!rows.length) continue;
    const cell = (proxy: PlayerProxy) => {
      const row = rows.find((entry) => entry.proxy === proxy);
      return row ? `${String(row.bossWinPct).padStart(5)}% ±${String(row.ci95).padEnd(5)}` : "";
    };
    lines.push(`  ${String(chapter.chapter).padStart(2)}  ${rows[0].boss.padEnd(26).slice(0, 26)} ${chapter.difficultyId.padEnd(15)} ${cell("starter").padEnd(19)} ${cell("drafted")}`);
  }
  lines.push("  tier averages:");
  for (const difficulty of TIERS) {
    const cells = PLAYER_PROXIES.map((proxy) => run.tiers.find((tier) => tier.difficulty === difficulty && tier.proxy === proxy))
      .map((tier) => (tier ? `${String(tier.bossWinPct).padStart(5)}% ±${String(tier.ci95).padEnd(5)}` : "").padEnd(19));
    lines.push(`      ${difficulty.padEnd(40)} ${cells.join(" ")}`);
  }
  return lines.join("\n");
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const arg = (name: string, fallback: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
  };
  const games = Number(arg("games", "40"));
  const chapters = arg("chapters", "") ? arg("chapters", "").split(",").map(Number) : undefined;
  const jobs = Number(arg("jobs", "1"));
  const quiet = process.argv.includes("--quiet");
  const cheatMode = arg("cheats", "tier") as CheatMode;
  if (!["tier", "none", "all"].includes(cheatMode)) throw new Error(`--cheats must be tier, none or all, got "${cheatMode}"`);
  const log = (row: ChapterResult) => console.log(`  ch ${row.chapter} ${row.proxy}: boss ${row.bossWinPct}% (${row.bossWins}/${row.games}), median ${row.medianTurns} turns`);
  const run = jobs > 1
    ? await runCampaignDifficultyParallel({ games, chapters, jobs, cheatMode, seedPrefix: arg("seed", "campaign"), onLine: (line) => console.log(line) })
    : runCampaignDifficulty({ games, chapters, cheatMode, seedPrefix: arg("seed", "campaign"), onChapter: log });
  const out = arg("out", "");
  if (out) {
    writeFileSync(out, JSON.stringify(run));
  } else {
    console.log(formatCampaignTable(run));
    console.log(`(${run.seconds}s)`);
    const dir = join(ROOT, ".preview", "balance");
    mkdirSync(dir, { recursive: true });
    // Only a run of every chapter at a real sample may replace `campaign.json`,
    // the result the full gate also writes. A quick or partial run keeps its own
    // file, so a smoke test never overwrites a measurement.
    const full = !chapters && games >= MIN_SAVED_GAMES;
    const name = cheatMode !== "tier" ? `campaign-cheats-${cheatMode}${full ? "" : "-partial"}.json` : full ? "campaign.json" : "campaign-partial.json";
    writeFileSync(join(dir, name), JSON.stringify(run, null, 2));
    console.log(`Saved to .preview/balance/${name}`);
  }
  if (quiet) process.exitCode = 0;
}
