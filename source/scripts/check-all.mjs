/**
 * THE ONE CHECK COMMAND. It decides what to run, and runs it all at once.
 *
 *   npm run check              # only what the current changes could break
 *   npm run check -- --all     # every suite, whatever changed
 *   npm run check -- --list    # say what it would run, run nothing
 *
 * WHY THIS EXISTS
 * ---------------
 * There were six commands and a table in the README saying which to run when,
 * and the picking was done from memory every time. That is a memory problem, and
 * a wrong pick is exactly how something ships broken — the owner's words on
 * 4 September 2026: "do you think we need bazillion checks?" The answer was that
 * the checks are ordinary and the ORCHESTRATION was the problem.
 *
 * Two things it fixes:
 *
 * 1. IT CHOOSES. `git status` says what changed, the table below says what each
 *    kind of change can reach, and only those suites run. Nothing is skipped by
 *    judgement any more.
 * 2. IT RUNS THEM TOGETHER. The three browser suites used to run one after
 *    another, each starting its own browser: about eleven minutes of waiting for
 *    eleven minutes of work. They now share one browser server and run at the
 *    same time, so the wait is the slowest suite rather than the sum of all of
 *    them. Sharing the browser is worth seconds; running them together is worth
 *    minutes.
 *
 * The balance harness is deliberately absent. It is banned unless the owner asks
 * for it in the message being answered — see the README.
 */

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadChromium } from "./browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.find((arg) => arg.startsWith("http")) ?? "http://localhost:5177";
const ALL = process.argv.includes("--all");
const LIST = process.argv.includes("--list");
/** `--only tests` runs one suite by name, for working on the checks themselves. */
const ONLY = (process.argv.find((arg) => arg.startsWith("--only")) ?? "").split(/[= ]/)[1]
  ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null);

/**
 * What each suite covers, and what kind of change can reach it.
 *
 * `browser` suites need the dev server AND get the shared browser. The others
 * are plain Node and start instantly.
 */
// The harness itself: editing the shared browser helper or a check script has to
// re-run the suites that ride on it, or the one change nobody re-checks is the
// change to the checker.
const HARNESS = /^source\/scripts\/(browser|check-)/;

const SUITES = [
  {
    name: "tests",
    command: ["npm", "test"],
    browser: false,
    // ALWAYS. It is 90 seconds, it covers the engine, the saves and the
    // unlocks, and "the change was small" is precisely the change it catches.
    always: true,
  },
  {
    name: "data",
    command: ["npm", "run", "validate:data"],
    browser: false,
    reaches: [/^source\/data\//, /^source\/scripts\/validate/, /^source\/src\/engine\//],
  },
  {
    name: "ui",
    command: ["node", "scripts/check-ui.mjs", BASE],
    browser: true,
    reaches: [/^source\/src\/.*\.(tsx|css)$/, /^source\/src\/screens\//, HARNESS],
  },
  {
    name: "cardface",
    command: ["node", "scripts/check-cardface.mjs", BASE],
    browser: true,
    reaches: [/^source\/src\/.*\.(tsx|css)$/, /^source\/src\/textfit\.ts$/, /^source\/data\/cards\.csv$/, HARNESS],
  },
  {
    name: "audio",
    command: ["node", "scripts/check-audio.mjs", BASE],
    browser: true,
    reaches: [/^source\/public\/audio\//, /^source\/src\/audio\//, /^source\/data\/announcer\.csv$/, HARNESS],
  },
  {
    // A new card with no test is the one thing the effect-coverage gate exists to
    // catch, and it can only catch it if something runs it. Card data and engine
    // branches are the only two edits that can create that gap.
    name: "coverage",
    command: ["npm", "run", "check:coverage"],
    browser: false,
    reaches: [/^source\/data\/cards\.csv$/, /^source\/src\/engine\//, /^source\/scripts\/check-effect-coverage/],
  },
  {
    // The tutorial, developer mode and the gallery's Star Chart profile: three
    // screens `ui` and `cardface` never open. It ran nowhere for weeks and both
    // halves of it had rotted by the time anyone looked, so it is a suite now
    // rather than a script somebody has to remember.
    name: "features",
    command: ["node", "scripts/check-features.mjs", BASE],
    browser: true,
    reaches: [
      /^source\/src\/.*\.(tsx|css)$/,
      /^source\/src\/engine\/game\.ts$/,
      /^source\/src\/data\/lore/,
      /^source\/src\/unlocks\.ts$/,
      HARNESS,
    ],
  },
];

/** Everything git knows has changed, tracked or not, as repo-relative paths. */
function changedFiles() {
  const out = execFileSync("git", ["status", "--porcelain=1", "--untracked-files=all"], {
    cwd: path.join(HERE, "..", ".."),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    // A rename prints "old -> new"; the new name is the one that matters.
    .map((name) => (name.includes(" -> ") ? name.split(" -> ")[1] : name))
    .map((name) => name.replace(/^"|"$/g, ""));
}

function run(suite) {
  return new Promise((resolve) => {
    const started = Date.now();
    // npm needs a SHELL and node does not. On Windows npm is a batch file, and
    // Node refuses to spawn one without a shell (EINVAL); passing the whole
    // command as one string is the supported way to ask for that, where passing
    // args alongside `shell: true` is deprecated.
    const [program, ...args] = suite.command;
    const child =
      program === "npm"
        ? spawn(suite.command.join(" "), { cwd: path.join(HERE, ".."), env: process.env, shell: true })
        : spawn(program, args, { cwd: path.join(HERE, ".."), env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`${code === 0 ? "PASS" : "FAIL"}  ${suite.name} (${seconds}s)`);
      resolve({ suite: suite.name, ok: code === 0, seconds, output });
    });
  });
}

const changed = ALL ? null : changedFiles();
const wanted = SUITES.filter((suite) =>
  ONLY
    ? suite.name === ONLY
    : ALL || suite.always || changed.some((file) => (suite.reaches ?? []).some((rule) => rule.test(file))),
);

if (LIST) {
  console.log(`Would run: ${wanted.map((s) => s.name).join(", ") || "nothing"}`);
  console.log(changed ? `From ${changed.length} changed file(s).` : "Everything, by --all.");
  process.exit(0);
}

console.log(
  ALL
    ? `Running every suite: ${wanted.map((s) => s.name).join(", ")}`
    : `${changed.length} file(s) changed -> ${wanted.map((s) => s.name).join(", ")}`,
);

// One browser for every suite that needs one, started before they are, so the
// three of them do not each pay for a launch.
let server = null;
if (wanted.some((suite) => suite.browser)) {
  const chromium = await loadChromium();
  server = await chromium.launchServer();
  process.env.CONVERGENCE_BROWSER_WS = server.wsEndpoint();
}

/**
 * TWO BROWSER SUITES AT A TIME, and it costs nothing.
 *
 * Four of them at once put four Chromium contexts, four React apps and four
 * animation loops on one CPU, and the suites that drive a UI started failing on
 * a working build: a click would sit through its whole timeout because the app
 * had not finished leaving the title screen yet, and the error reads as a
 * z-index bug in the product rather than as a busy machine. An intermittent red
 * is worse than no check, because the next session learns to read past it.
 *
 * The cap is close to free because the suites are wildly uneven. `ui` alone is
 * about 300s and the other three together are about 290, so with the long one
 * started first the two lanes finish inside the time `ui` already took.
 * Measured 4 September 2026: 339s unlimited against 818s of work, 346s capped
 * against 741 — the work itself got cheaper because nothing was fighting.
 *
 * The plain-Node suites are not capped. They are not competing for a renderer,
 * and `tests` is the long pole among them.
 */
const BROWSER_LANES = 2;

async function runAll(suites) {
  const results = [];
  const plain = suites.filter((suite) => !suite.browser);
  // LONGEST FIRST. Alphabetical order put the 300-second suite last and the
  // whole run took 451s instead of 339 — two lanes are slower than no lanes if
  // the long pole starts after the short ones. `costs` is a rough ordering hint
  // measured 4 September 2026, not a budget: only the sort uses it.
  const costs = { ui: 300, audio: 145, features: 125, cardface: 25 };
  const queue = [...suites.filter((suite) => suite.browser)].sort(
    (a, b) => (costs[b.name] ?? 0) - (costs[a.name] ?? 0) || a.name.localeCompare(b.name),
  );
  const lane = async () => {
    for (;;) {
      const suite = queue.shift();
      if (!suite) return;
      results.push(await run(suite));
    }
  };
  await Promise.all([
    ...plain.map(async (suite) => results.push(await run(suite))),
    ...Array.from({ length: BROWSER_LANES }, lane),
  ]);
  return results;
}

const wallStart = Date.now();
const results = await runAll(wanted);
if (server) await server.close();

const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  console.log(`\n----- ${result.suite} -----\n${result.output.trim().split("\n").slice(-40).join("\n")}`);
}
// Real wall clock, not the longest suite: with lanes those are different numbers.
const elapsed = Math.round((Date.now() - wallStart) / 1000);
const total = results.reduce((sum, r) => sum + r.seconds, 0);
console.log(
  `\n${results.length - failed.length}/${results.length} suites passed in ${elapsed}s ` +
    `(${total}s of work; plain suites together, browser suites ${BROWSER_LANES} at a time).`,
);
process.exit(failed.length ? 1 : 0);
