/**
 * Which card effects does the engine run without any test checking the result?
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
 * WHAT THIS MEASURES, AND THE VERSION THAT WAS WRONG
 * --------------------------------------------------
 * The first cut of this script asked "does each effect ever FIRE under test".
 * That question returns 100% and is worthless: the pacing suite plays thousands
 * of bot games and drags the whole roster through the engine. Kaku Kaioh's
 * broken multiplier fired constantly for years. **Firing is not checking.**
 *
 * So the measure is: the engine ran this effect, and no test file anywhere
 * mentions the card or its effect id. A test that asserts something about a card
 * must refer to it — that is how you place the card and how you find it again —
 * while a bulk simulation never names anything. The gap between "ran" and
 * "named" is the list worth having.
 *
 * It is a heuristic in one direction only: a test could name a card and assert
 * nothing useful, so this can over-credit. It cannot under-credit, which is the
 * safe way round for a report whose job is to hand you a to-do list.
 *
 * HOW IT WORKS
 * ------------
 * The engine records each effect that resolves when `CONVERGENCE_EFFECT_TRACE`
 * points at a file (src/engine/trace.ts, written out by scripts/trace-setup.ts).
 * This script runs the real suite with that switched on and unions what every
 * forked worker recorded.
 *
 * Reachability is checked separately: an effect id with no branch in the engine
 * and no matching keyword does nothing at all, and a card that does nothing looks
 * identical to a card whose test is merely missing.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCards } from "./card-tools.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACE = join(ROOT, ".preview", "effect-trace.txt");
const ENGINE = join(ROOT, "src", "engine", "game.ts");
const TEST_DIR = join(ROOT, "src", "engine");
// Vitest's CLI matcher expects slash-separated globs, including on Windows.
const TEST_GLOB = "src/engine";
const SLOW_SIMULATION_TEST = "src/engine/pacing.test.ts";

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
// Any mention of the quoted id inside the engine counts as reachable; the point
// is to separate "no branch at all" from "branch exists, nothing checks it", not
// to parse control flow.
//
// KEYWORD-DRIVEN EFFECTS ARE NOT ORPHANS. Sonic carries the effect id `charge`
// and no branch anywhere reads that string, because Charge is implemented off
// the KEYWORD column instead (`hasKeyword(card, "Charge")`). The id is a label
// for a rule the engine really does run, so flagging it as a card that "does
// nothing" is a false accusation — and a false accusation in a report like this
// is expensive, because the natural response is to go and "fix" working code.
const engineSource = readFileSync(ENGINE, "utf8");
const keywordDriven = new Set(
  cards
    .filter((card) => {
      const effectId = (card.effectId ?? "").trim();
      if (!effectId || effectId === "none") return false;
      const keywords = (card.keywords ?? "").split(";").map((word) => word.trim().toLowerCase());
      return keywords.includes(effectId.toLowerCase());
    })
    .map((card) => card.effectId.trim()),
);
const unreachable = [...rosterEffects.keys()].filter(
  (effectId) => !engineSource.includes(`"${effectId}"`) && !keywordDriven.has(effectId),
);

// --- run focused engine tests with tracing on -------------------------------
// The pacing file is a long bot/soak simulation. It protects duel length and
// bot behavior, but it is not a focused card-effect assertion suite. Running it
// here made this report spend minutes exploring random card combinations, and
// then fail only because tracing pushed two pacing cases beyond their timeout.
// Focused tests must carry this report; if an effect is only reached by pacing,
// it should appear below as NEVER RAN and receive a direct test.
console.log("Running focused engine tests with effect tracing on.\n");
const run = spawnSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "vitest", "vitest.mjs"),
    "run",
    TEST_GLOB,
    "--exclude",
    SLOW_SIMULATION_TEST,
  ],
  {
    cwd: ROOT,
    // Vitest's fork workers can keep inherited pipe handles alive on Windows,
    // making spawnSync wait roughly two minutes after the focused tests finish.
    // Inherit the output so the runner exits with the worker tree normally and
    // still shows Vitest's failure details directly to the caller.
    stdio: "inherit",
    env: { ...process.env, CONVERGENCE_EFFECT_TRACE: TRACE },
  },
);

if (run.status !== 0) {
  console.error("The test suite failed, so coverage would be measured against a broken run.");
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

// --- does any test NAME the card, or is it only swept up by a simulation? ----
//
// THIS IS THE QUESTION THAT MATTERS, and the first version of this script got it
// wrong. Asking "does this effect ever fire under test" returns 100% and means
// nothing, because the pacing suite plays thousands of bot games and drags every
// card in the roster through the engine at some point. Kaku Kaioh's broken
// multiplier fired constantly for the whole balance history. Firing is not
// checking.
//
// A test that ASSERTS something about a card has to refer to it — by name, or by
// its effect id, because that is how you set the card up and how you find it
// again afterwards. A bulk simulation never does. So the real signal is: the
// engine ran this effect, and no test anywhere mentions it.
const testSource = readdirSync(TEST_DIR)
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => readFileSync(join(TEST_DIR, file), "utf8"))
  .join("\n");

const namedInTests = (effectId) =>
  testSource.includes(effectId) || rosterEffects.get(effectId).some((name) => testSource.includes(name));

// --- verdict ----------------------------------------------------------------
const all = [...rosterEffects.keys()];
const neverFired = all.filter((effectId) => !traced.has(effectId));
const firedButUnchecked = all.filter((effectId) => traced.has(effectId) && !namedInTests(effectId));
const checked = all.filter((effectId) => namedInTests(effectId));

const total = all.length;
const percent = ((checked.length / total) * 100).toFixed(1);

console.log(`\nEffects on cards: ${total}`);
console.log(`Named by at least one test: ${checked.length} (${percent}%)`);
console.log(`Ran, but no test refers to them: ${firedButUnchecked.length}`);
console.log(`Never ran at all: ${neverFired.length}`);

if (unreachable.length) {
  console.log(`\n=== NO ENGINE BRANCH (${unreachable.length}) — these cards do nothing at all ===`);
  for (const effectId of unreachable.sort()) {
    console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
  }
}

if (neverFired.length) {
  console.log(`\n=== NEVER RAN (${neverFired.length}) — not even a simulation reached these ===`);
  for (const effectId of neverFired.sort()) {
    console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
  }
}

console.log(`\n=== RAN BUT NOTHING CHECKS THEM (${firedButUnchecked.length}) ===`);
console.log(`    This is the Kaku Kaioh list: the engine runs these, and no test asserts what they do.`);
if (!firedButUnchecked.length) console.log("  none");
for (const effectId of firedButUnchecked.sort()) {
  console.log(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
}

// IT IS A GATE NOW, on the "named by a test" half.
//
// It was a report on purpose: at the time nobody was going to write a hundred
// tests, and a check that is red on every run gets muted within a week, which
// costs the report the one job it has. The roster reached 100% on 4 September
// 2026, so the argument expired — the only thing left for this gate to catch is
// a NEW card arriving without a test, which is exactly what it should catch, and
// exactly when it is cheapest to fix. Owner's ruling, same day: every new card
// ships with a test.
//
// The other two lists stay reports. "Ran but nothing checks them" is a subset of
// this gate and dies with it. "Never ran at all" is not a defect: an effect can
// be genuinely hard for a simulation to reach and still be properly tested.
if (checked.length !== total) {
  const missing = all.filter((effectId) => !namedInTests(effectId));
  console.error(
    `\nNO TEST NAMES ${missing.length} effect${missing.length === 1 ? "" : "s"}. ` +
      `Every card ships with a test that names the card or its effect id:`,
  );
  for (const effectId of missing.sort()) {
    console.error(`  ${effectId}: ${rosterEffects.get(effectId).join(", ")}`);
  }
}

process.exitCode = unreachable.length || checked.length !== total ? 1 : 0;
