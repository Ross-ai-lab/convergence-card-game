/**
 * Which card effects does the test suite never actually exercise?
 *
 *   npm run check:coverage
 *
 * WHY THIS EXISTS
 * ---------------
 * Kaku Kaioh printed "Deal 4x damage" while the engine multiplied by 2, for the
 * entire balance history of the game. Every check passed the whole time. The
 * data file was right, the type list was right, the printed text was right, and
 * the one number that decided combat was wrong — because no test ever read it.
 *
 * That bug is not really about Kaku Kaioh. It is about the class of effects
 * nobody has ever made fire. This report names them, so the next wrong number
 * gets found by a list instead of by luck.
 *
 * HOW IT WORKS
 * ------------
 * The engine records each effect that RESOLVES when `CONVERGENCE_EFFECT_TRACE`
 * points at a file (see src/engine/trace.ts). This script runs the real test
 * suite with that switched on, unions what every forked worker recorded, and
 * subtracts it from the roster.
 *
 * Reachability is checked separately and matters just as much: an effect id that
 * appears on a card but has no branch in the engine does nothing at all, and a
 * card that does nothing looks identical to a card whose test is merely missing.
 *
 * READING THE OUTPUT
 * ------------------
 * `NEVER EXERCISED` is the real list. Each line is a card whose rules text has
 * never been proven to match its behaviour.
 *
 * `NOT TRACED, BUT NAMED IN A TEST` is the honest caveat. A few effects resolve
 * through paths the trace does not sit on, so this group is "probably covered,
 * check by hand" rather than a finding. It exists so that a gap in the
 * instrumentation shows up as a question instead of as a false accusation — a
 * coverage tool that quietly over-reports is worse than none.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCards } from "./card-tools.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACE = join(ROOT, ".preview", "effect-trace.txt");
const ENGINE = join(ROOT, "src", "engine", "game.ts");
const TEST_GLOB = join(ROOT, "src", "engine");

mkdirSync(dirname(TRACE), { recursive: true });
rmSync(TRACE, { force: true });

// --- what the roster asks for -----------------------------------------------
const cards = readCards();
const rosterEffects = new Map(); // effectId -> [card names]
for (const card of cards) {
  const effectId = (card.effectId ?? "").trim();
  if (!effectId || effectId === "none") continue;
  if (!rosterEffects.has(effectId)) rosterEffects.set(effectId, []);
  rosterEffects.get(effectId).push(card.name);
}

// --- what the engine can actually do ----------------------------------------
// A branch is `effectId === "x"`, `hasEffect(m, "x")` or a membership list. Any
// mention of the quoted id inside the engine counts as reachable; the point is
// to separate "no branch at all" from "branch exists, nothing tests it", not to
// parse control flow.
const engineSource = readFileSync(ENGINE, "utf8");
const unreachable = [...rosterEffects.keys()].filter(
  (effectId) => !engineSource.includes(`"${effectId}"`),
);

// --- run the suite with tracing on ------------------------------------------
console.log("Running the test suite with effect tracing on. This takes a couple of minutes.\n");
const run = spawnSync(
  process.execPath,
  [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", TEST_GLOB],
  {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CONVERGENCE_EFFECT_TRACE: TRACE },
    encoding: "utf8",
  },
);

if (run.status !== 0) {
  console.error("The test suite failed, so coverage would be measured against a broken run.");
  console.error(String(run.stdout ?? "").slice(-2000));
  console.error(String(run.stderr ?? "").slice(-2000));
  process.exit(1);
}

const traced = new Set(
  existsSync(TRACE)
    ? readFileSync(TRACE, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [],
);

if (!traced.size) {
  console.error(
    "No effects were traced at all. That means the recorder never armed, not that the game is untested — " +
      "check that src/engine/trace.ts is still imported by the engine before believing any number below.",
  );
  process.exit(1);
}

// --- does a test at least NAME the card? ------------------------------------
const testSource = spawnSync(
  process.platform === "win32" ? "cmd.exe" : "sh",
  process.platform === "win32"
    ? ["/d", "/s", "/c", `type "${join(TEST_GLOB, "*.test.ts")}"`]
    : ["-c", `cat "${join(TEST_GLOB, "*.test.ts")}"`],
  { encoding: "utf8" },
).stdout ?? "";

const namedInTests = (effectId) =>
  testSource.includes(effectId) || rosterEffects.get(effectId).some((name) => testSource.includes(name));

// --- verdict ----------------------------------------------------------------
const missing = [...rosterEffects.keys()].filter((effectId) => !traced.has(effectId));
const neverExercised = missing.filter((effectId) => !namedInTests(effectId));
const probablyCovered = missing.filter((effectId) => namedInTests(effectId));

const total = rosterEffects.size;
const covered = total - missing.length;
const percent = ((covered / total) * 100).toFixed(1);

console.log(`\nEffects on cards: ${total}`);
console.log(`Exercised by the suite: ${covered} (${percent}%)`);

if (unreachable.length) {
  console.log(`\n=== NO ENGINE BRANCH (${unreachable.length}) — these cards do nothing at all ===`);
  for (const effectId of unreachable.sort()) {
    console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
  }
}

console.log(`\n=== NEVER EXERCISED (${neverExercised.length}) ===`);
if (!neverExercised.length) console.log("  none — every card effect fires at least once under test");
for (const effectId of neverExercised.sort()) {
  console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
}

if (probablyCovered.length) {
  console.log(`\n=== NOT TRACED, BUT NAMED IN A TEST (${probablyCovered.length}) — check by hand ===`);
  for (const effectId of probablyCovered.sort()) {
    console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
  }
}

// A report, not a gate. Nobody is going to write 158 tests today, and a check
// that fails the build every single run gets muted within a week, which would
// cost the report the one job it has. It exits non-zero only for the case that
// is unambiguously a bug: a card wired to an effect the engine cannot run.
process.exitCode = unreachable.length ? 1 : 0;
