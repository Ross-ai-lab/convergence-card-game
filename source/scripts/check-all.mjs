/**
 * One check runner, with explicit focus or change-based suggestions.
 * --only docs,cardface selects checks; --list reviews the plan; --all opts into everything.
 * Unit checks finish before browser work, which runs in two shared-browser lanes.
 */

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadChromium } from "./browser.mjs";
import { readCheckOptions, selectChecks, changedPaths } from "./check-selection.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.find((arg) => arg.startsWith("http")) ?? "http://localhost:5177";
const options = readCheckOptions(process.argv.slice(2));
const ALL = options.all, LIST = options.list;

/**
 * What each suite covers, and what kind of change can reach it.
 *
 * `browser` suites need the dev server AND get the shared browser. The others
 * are plain Node and start instantly.
 */
// The harness itself: editing the shared browser helper or a check script has to
// re-run the suites that ride on it, or the one change nobody re-checks is the
// change to the checker.
const HARNESS = /^source\/scripts\/(browser|profile-layout|campaign-fixtures|campaign-motion|story-fixtures|phone-fixtures|deck-fixtures|gallery-interactions|death-motion|tutorial-flow|menu-polish|interface-followup|build-gallery-previews)\.(mjs|py)$/;

const SUITES = [
  { name: "card-interface", command: ["node", "scripts/check-card-interface.mjs", BASE], browser: true,
    reaches: [/^source\/scripts\/check-card-interface\.mjs$/] },
  { name: "docs", command: ["node", "scripts/validate-project-docs.mjs"], browser: false,
    reaches: [/\.md$/i, /^source\/scripts\/(validate-project-docs|readme-index)\.mjs$/] },
  { name: "selection", command: ["node", "--test", "scripts/check-selection.test.mjs"], browser: false,
    reaches: [/^source\/scripts\/check-(all|selection(?:\.test)?)\.mjs$/] },
  {
    name: "mobile",
    command: ["node", "scripts/check-mobile.mjs", BASE, ...process.argv.filter(arg => arg === "--webkit" || arg.startsWith("--size="))],
    browser: true,
    reaches: [/^source\/src\/.*\.(tsx|css)$/, /^source\/src\/(phone-layout|relic-peek|gallery-visibility|profile-fit)\.ts$/, /^source\/src\/data\/gallery-previews\.ts$/, /^source\/public\/card-art\//, /^source\/index\.html$/, HARNESS],
  },
  {
    name: "workbook",
    command: ["node", "scripts/sync-card-workbook.mjs", "--check"],
    browser: false,
    reaches: [/^README\.md$/, /^source\/data\//, /^source\/scripts\/sync-card-workbook/, /^materials\/.*\.xlsx/],
  },
  {
    name: "campaign",
    command: ["node", "scripts/check-campaign.mjs", BASE],
    browser: true,
    reaches: [/^source\/src\//, /^materials\/campaign-design\.json$/, HARNESS],
  },
  {
    name: "performance",
    command: ["node", "scripts/check-performance.mjs", BASE],
    browser: true,
    reaches: [/^source\/src\//, /^source\/scripts\/duel-performance\.mjs$/, HARNESS],
  },
  {
    name: "tests",
    command: ["npm", "test"],
    browser: false,
    reaches: [/^source\/src\/.*\.tsx?$/, /^source\/scripts\/.*\.test\.ts$/, /^source\/vitest\.config/],
  },
  {
    name: "data",
    command: ["npm", "run", "validate:data"],
    browser: false,
    reaches: [/^source\/data\//, /^source\/scripts\/validate-cards\.mjs$/, /^source\/src\/engine\//],
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
    name: "relic-popup",
    command: ["node", "scripts/check-relic-popup.mjs", BASE],
    browser: true,
    reaches: [/^source\/src\/.*\.(tsx|css)$/, HARNESS],
  },
  {
    name: "campaign-voices",
    command: ["node", "scripts/check-campaign-voices.mjs", BASE],
    browser: true,
    reaches: [
      /^source\/public\/audio\/campaign\//,
      /^source\/data\/campaign-voices\.json$/,
      /^materials\/campaign-(story|voice-cast)\.json$/,
      /^source\/src\/audio\//,
      /^source\/src\/screens\/CampaignSpeech/,
      HARNESS,
    ],
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
      /^source\/scripts\/turn-and-keyword-checks\.mjs$/,
      /^source\/scripts\/gallery-request-checks\.mjs$/,
      HARNESS,
    ],
  },
];

// Editing a suite checks that suite; shared fixtures may affect several.
for (const suite of SUITES) {
  suite.reaches.push(new RegExp(`^source/scripts/check-${suite.name}\\.mjs$`));
}

function changedFiles() {
  const output = execFileSync("git", ["status", "--porcelain=1", "-z", "--untracked-files=all"], {
    cwd: path.join(HERE, "..", ".."), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  return changedPaths(output);
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
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`${ok ? "PASS" : "FAIL"}  ${suite.name} (${seconds}s)`);
      resolve({ suite: suite.name, ok, seconds, output });
    };
    child.on("error", error => { output += `Cannot start ${suite.name}: ${error.message}\n`; finish(false); });
    child.on("close", code => finish(code === 0));
  });
}

const changed = ALL || options.only.length ? [] : changedFiles();
const wanted = selectChecks(SUITES, options, changed);

if (LIST) {
  console.log(`Would run: ${wanted.map((s) => s.name).join(", ") || "nothing"}`);
  console.log(ALL ? "Everything, by --all." : options.only.length ? "Explicitly selected checks." : `From ${changed.length} changed file(s).`);
  process.exit(0);
}

console.log(
  ALL
    ? `Running every suite: ${wanted.map((s) => s.name).join(", ")}`
    : options.only.length ? `Running selected checks: ${wanted.map(s => s.name).join(", ")}`
      : `${changed.length} file(s) changed -> ${wanted.map((s) => s.name).join(", ") || "nothing"}`,
);

// The browser server starts only after CPU-heavy Node checks finish. Keeping
// Vitest away from Chromium prevents timing deadlines from becoming machine-load
// tests instead of checks of the game.
let server = null;

// Keep CPU-heavy checks away from browser interactions; two browser lanes share one server.
const BROWSER_LANES = 2;

async function runAll(suites) {
  const results = [];
  const plain = suites.filter((suite) => !suite.browser);
  const cpuHeavyNames = new Set(["tests", "coverage"]);
  const quick = plain.filter((suite) => !cpuHeavyNames.has(suite.name));
  const cpuHeavy = plain.filter((suite) => cpuHeavyNames.has(suite.name));

  await Promise.all(quick.map(async (suite) => results.push(await run(suite))));
  for (const suite of cpuHeavy) results.push(await run(suite));

  const browserSuites = suites.filter((suite) => suite.browser);
  if (browserSuites.length > 0) {
    const chromium = await loadChromium();
    server = await chromium.launchServer();
    process.env.CONVERGENCE_BROWSER_WS = server.wsEndpoint();
  }

  // LONGEST FIRST. Alphabetical order put the 300-second suite last and the
  // whole run took 451s instead of 339 — two lanes are slower than no lanes if
  // the long pole starts after the short ones. `costs` is a rough ordering hint
  // measured 4 September 2026, not a budget: only the sort uses it.
  const costs = { ui: 300, audio: 145, "campaign-voices": 110, features: 350, cardface: 25 };
  const queue = [...browserSuites].sort(
    (a, b) => (costs[b.name] ?? 0) - (costs[a.name] ?? 0) || a.name.localeCompare(b.name),
  );
  const lane = async () => {
    for (;;) {
      const suite = queue.shift();
      if (!suite) return;
      results.push(await run(suite));
    }
  };
  await Promise.all(Array.from({ length: Math.min(BROWSER_LANES, queue.length) }, lane));
  return results;
}

const wallStart = Date.now();
let results;
try { results = await runAll(wanted); } finally { if (server) await server.close(); }

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
