/**
 * Photograph any named card's face, large enough to actually judge.
 *
 *   node scripts/shoot-card.mjs "Kaku Kaioh"
 *   node scripts/shoot-card.mjs "Kaku Kaioh" "Gravelord Nito" c012
 *   npm run shoot:card                      (no names = every card, slow)
 *
 * CALL IT WITH `node`, NOT `npm run`, WHENEVER A NAME HAS A SPACE IN IT. npm on
 * Windows strips the quotes before the script sees them, so "Kaku Kaioh" arrives
 * as two arguments and both fail to resolve. The npm alias is fine for the
 * no-argument whole-roster run.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other capture path in this project can photograph a screen but not a
 * CARD OF YOUR CHOOSING:
 *
 *   - `just wall` opens a brand-new profile and shoots whatever the app renders
 *     on load, which here is the title menu and nothing else.
 *   - `shoot-screens.mjs` reaches a populated board, but the card it blows up is
 *     whichever one the shuffle happened to deal. You cannot ask it for a card.
 *   - The in-app Browser pane cannot screenshot at all while it is backgrounded,
 *     which it is whenever the owner is reading the chat. That is an Electron
 *     renderer-backgrounding bug with no agent-side workaround, so waiting for
 *     the pane is waiting forever.
 *
 * The gap that leaves is the common one: a card's printed text or stats change
 * and nobody can look at that card without playing until it shows up. This
 * closes it. It starts its own dev server, deals itself the card through the
 * `window.__debug` hook, scales the face to fill the frame, and writes a PNG.
 *
 * The dev server is not optional and not a convenience: `__debug` is compiled
 * out of production builds on purpose, so the published game cannot be driven
 * this way. That is why this script owns the server's whole lifetime rather
 * than asking for one to already be running.
 *
 * WHAT THE SHOT PROVES, AND WHAT IT DOES NOT
 * ------------------------------------------
 * It proves CONTENT: the name, cost, rules text, ATK, HP, camp and alignment
 * rails, origin, and the art actually resolving. That is the question this
 * script was built for — "does the card say what the CSV says" — and reading it
 * off a picture catches things a data check never will, such as text the layout
 * silently truncates.
 *
 * It does NOT prove LAYOUT AT PLAY SIZE. The face is deliberately blown up to
 * fill the frame, and `.card-face` is `container-type: size`, so its internals
 * lay out for that size and not for the size a player sees. Two consequences
 * worth knowing before reading anything into a capture:
 *   - it photographs the BOARD variant, which prints no flavour line. Flavour
 *     missing here is correct, not a bug.
 *   - gem/text collisions at real hand and board sizes are a different question
 *     with its own tool. Use `npm run check:cardface`, which measures them at
 *     the sizes the game actually renders.
 *
 * Output: .preview/cards/<Card Name>.png (disposable evidence, never published).
 */

import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";
import { readCards, readRelics } from "./card-tools.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".preview", "cards");

/**
 * Take a port the OS says is free rather than assuming one.
 *
 * `just html-preview` taught this the hard way: a server that quietly moves to
 * the next port when its own is busy sends every later check at a STALE server,
 * and a stale server's answers are indistinguishable from a broken page. Ask
 * the OS for a free port, then pin it with --strictPort so vite either takes
 * that exact port or dies loudly.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Dev server never answered at ${url}`);
}

/**
 * Start vite and take the base URL from ITS OWN output, never from the port we
 * asked for.
 *
 * Two separate traps, both of which cost a run here:
 *   - vite prints `Local: http://localhost:<port>/`, and on Windows `localhost`
 *     resolves to `::1` first. Probing `http://127.0.0.1:<port>` then refuses
 *     forever while the server is up and perfectly healthy — it reads as "the
 *     server never started" and it is really "you knocked on the wrong address".
 *   - a server that is allowed to move ports silently sends every later check at
 *     a stale server, whose answers are indistinguishable from a broken page.
 *     --strictPort keeps that honest; reading the printed URL makes it moot.
 */
function startDevServer(port) {
  // Run vite's own JS entry through this same node binary. Spawning `npx.cmd`
  // or `vite.cmd` instead dies `spawn EINVAL` on Windows under current Node
  // unless `shell: true` is set, and turning the shell on re-opens the argument
  // concatenation this script is already fighting elsewhere. There is no reason
  // to go through a shim to reach a JS file.
  const child = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], shell: false },
  );

  let output = "";
  const url = new Promise((resolve, reject) => {
    const scan = (chunk) => {
      // ESCAPE-AWARE ON PURPOSE. Two fixes are needed and having only the first
      // fails INTERMITTENTLY, depending on how stdout happens to chunk:
      //   1. strip the WHOLE escape sequence including the ESC byte. Dropping
      //      only the `[1m` part leaves a bare ESC between `Local` and `:`, so
      //      any pattern anchored on that label quietly stops matching.
      //   2. do not anchor on the label at all. The only thing worth finding is
      //      a localhost URL, and no future vite banner change can reformat
      //      that shape out from under us.
      output += chunk.toString().replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
      const found = output.match(/http:\/\/(?:localhost|127\.0\.0\.1):[0-9]+/);
      if (found) resolve(found[0]);
      // Context for the two rules above: vite prints
      // `http://localhost:<esc>[1m53278<esc>[22m/`, so the port itself sits
      // inside the colour codes and a naive URL regex reads a truncated address,
      // then times out against a server that is up and perfectly healthy.
    };
    child.stdout.on("data", scan);
    child.stderr.on("data", scan);
    child.on("exit", (code) => reject(new Error(`vite exited with ${code}\n${output.slice(-800)}`)));
    setTimeout(() => reject(new Error(`vite printed no URL in 45s\n${output.slice(-800)}`)), 45_000);
  });

  return { child, url };
}

/** Resolve the requested names against the roster so a typo fails before the browser starts. */
function resolveRequested(names, cards) {
  if (!names.length) return cards.map((card) => card.name);

  const byKey = new Map();
  for (const card of cards) {
    byKey.set(card.id.toLowerCase(), card.name);
    byKey.set(card.name.toLowerCase(), card.name);
  }

  const resolved = [];
  const unknown = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    const exact = byKey.get(key);
    if (exact) {
      resolved.push(exact);
      continue;
    }
    const partial = cards.filter((card) => card.name.toLowerCase().includes(key));
    if (partial.length === 1) resolved.push(partial[0].name);
    else if (partial.length > 1) {
      unknown.push(`"${name}" matches ${partial.length} cards: ${partial.map((c) => c.name).join(", ")}`);
    } else unknown.push(`"${name}" matches no card`);
  }

  if (unknown.length) {
    console.error(unknown.join("\n"));
    process.exit(1);
  }
  return resolved;
}

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
// Relics are part of the roster this script exists to photograph, and were
// missing from it: `readCards` reads cards.csv only, so all 34 of them answered
// "matches no card" and a fifth of the printed roster could not be looked at.
// They also cannot be PLACED — `__debug.place` refuses a non-minion — so they
// are dealt into the hand instead and cloned from there. The hand renders the
// same `CardFace`, minus the board variant's dropped flavour line.
const relics = readRelics();
const relicNames = new Set(relics.map((relic) => relic.name.toLowerCase()));
const cards = [...readCards(), ...relics];
const wanted = resolveRequested(requested, cards);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const port = await freePort();
const server = startDevServer(port);
let browser;

try {
  const base = await server.url;
  await waitForServer(base);

  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 });
  page.on("pageerror", (error) => console.log(`  [page error] ${error.message.slice(0, 160)}`));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // A duel has to be running before `__debug` mounts — the hook is gated on the
  // playing screen, not merely on DEV.
  // Target the class, not the label. The accessible name of this control is
  // "Duel" plus whichever difficulty is selected, so any name-based matcher goes
  // stale the moment the difficulty wording changes — which is exactly how
  // shoot-screens.mjs ended up waiting 30s for a `/Duel the/` button that no
  // longer exists.
  await page.locator(".duel-trigger").first().click();
  await page.waitForFunction(() => Boolean(window.__debug?.place), null, { timeout: 20_000 });
  await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});

  const written = [];
  for (const name of wanted) {
    const isRelic = relicNames.has(name.toLowerCase());
    const source = isRelic ? ".hand-card .card-face" : ".board-slot.occupied .card-face";
    const dealt = isRelic
      ? await page.evaluate((cardName) => window.__debug.giveCard(cardName, "me"), name)
      : await page.evaluate((cardName) => window.__debug.place(cardName, "me", 0), name);
    if (typeof dealt === "string" && dealt.startsWith("no card")) {
      console.log(`  SKIPPED ${name}: ${dealt}`);
      continue;
    }
    await page.waitForTimeout(250);

    // A relic lands at the END of the hand, so take the last face rather than
    // the first — the opening hand is still sitting in front of it.
    const card = isRelic ? page.locator(source).last() : page.locator(source).first();
    if (!(await card.count())) {
      console.log(`  SKIPPED ${name}: no card face rendered`);
      continue;
    }

    // CLONE the face into a clean overlay rather than restyling it in place.
    //
    // Two earlier approaches both produced a picture of the whole board with a
    // small card somewhere inside it, which is the exact thumbnail view this
    // script exists to avoid:
    //   - `transform: scale()` does not change the layout box, and Playwright
    //     clips an element screenshot to the layout box, so the card grew and
    //     the capture region did not.
    //   - setting a real width/height plus `position: fixed` looks right and is
    //     not, because the board has a transformed ancestor and a transform
    //     makes `fixed` resolve against THAT ancestor instead of the viewport.
    //     The card lands back in the board row, still surrounded by the game.
    //
    // Cloning sidesteps both. The clone is appended straight to <body>, so no
    // ancestor transform can capture it, and it is sized honestly rather than
    // magnified — `.card-face` is `container-type: size`, so its internals
    // re-lay-out at the new size exactly as they would in any large context.
    // 750x1050 is the card's design coordinate system; keeping that ratio is
    // what stops the art and gems being stretched.
    await page.evaluate((selector) => {
      const faces = document.querySelectorAll(selector);
      const source = faces[selector.startsWith(".hand-card") ? faces.length - 1 : 0];
      const stage = document.createElement("div");
      stage.id = "__cardstage";
      stage.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:grid",
        "place-items:center",
        "background:#12101a",
      ].join(";");

      const clone = source.cloneNode(true);
      const height = window.innerHeight - 40;
      clone.style.height = `${height}px`;
      clone.style.width = `${Math.round((height * 750) / 1050)}px`;
      clone.style.margin = "0";
      stage.appendChild(clone);
      document.body.appendChild(stage);
    }, source);
    await page.waitForTimeout(400);

    const file = join(OUT, `${name.replace(/[\\/:*?"<>|]/g, "-")}.png`);
    await page.locator("#__cardstage .card-face").screenshot({ path: file });
    written.push(file);
    console.log(`  ${name}`);

    await page.evaluate(() => document.getElementById("__cardstage")?.remove());
  }

  console.log(`\nWrote ${written.length} card face(s) to .preview/cards/`);
  if (!written.length) process.exitCode = 1;
} finally {
  await browser?.close();
  server.child.kill();
}
