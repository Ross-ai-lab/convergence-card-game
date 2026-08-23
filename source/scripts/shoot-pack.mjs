/**
 * Screenshots the card-pack screen and the gallery's locked state.
 *
 *   node scripts/shoot-pack.mjs http://localhost:5177
 *
 * These two screens are unreachable by `shoot-screens.mjs` for the same reason
 * they are easy to ship broken: the pack only exists in the seconds after a duel
 * ENDS, and the gallery's lock only shows while cards are still locked. Playing
 * twenty real turns to see either is not a check anyone runs twice, so this
 * script ends a duel on purpose through the dev `setCore` hook and then walks
 * the pack open one hit at a time.
 *
 * It drives the REAL app and the real win path: `setCore` lowers a core, the
 * engine's own win check flips the phase, and everything downstream — record,
 * reward, pack — runs exactly as it does in a duel nobody interfered with.
 *
 * Writes into .preview/pack/.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".preview", "pack");
const BASE = process.argv[2] || "http://localhost:5177";

mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const shots = [];

async function shoot(name, wait = 600) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  shots.push(name);
  console.log(`  ${name}.png`);
}

page.on("pageerror", (error) => console.log(`  [page error] ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") console.log(`  [console error] ${message.text().slice(0, 200)}`);
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
// A clean machine, so the pool really is the starting 50 and the gallery really
// does have locked cards in it.
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("convergence.")) localStorage.removeItem(key);
  }
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);

// --- the gallery, with most of the roster still locked
// The title screen's gallery door is an icon button labelled "Cards".
await page.locator(".gallery-trigger").first().click().catch(() => {});
await page.locator(".gallery-panel").waitFor({ state: "visible", timeout: 8000 });
await shoot("01-gallery-locked", 1400);

await page.locator(".gallery-help").click();
await shoot("02-gallery-help", 700);
await page.locator(".gallery-help").click();

// The Collection filter, set to Locked, is the whole point of the new control.
await page.locator(".gallery-filter select[aria-label*='unlocked']").selectOption("unlocked");
await shoot("03-gallery-unlocked-only", 1200);
await page.locator(".gallery-filter select[aria-label*='unlocked']").selectOption("locked");
await shoot("04-gallery-locked-only", 1200);
await page.keyboard.press("Escape");

// --- end a duel on purpose and open the pack
//
// The opponent level decides the pack SIZE, so it decides the layout being
// checked. Ascendant is the default here because ten cards is the widest case
// and the only one that has to wrap; pass "easy" or "normal" for three or six.
const skill = process.argv[3] || "hard";
await page.locator(`.orbit-choice-${skill}`).first().click();
await page.waitForTimeout(300);
await page.locator(".duel-trigger").first().click();
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});
const mulligan = page.locator(".mulligan-panel button.primary");
await mulligan.waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
if (await mulligan.isVisible().catch(() => false)) await mulligan.click();
await page.waitForFunction(() => Boolean(window.__debug), null, { timeout: 12000 });

// An awake minion of ours, and an enemy core one point from collapse.
await page.evaluate(() => window.__debug.place("Godzilla", "me", 0));
await page.waitForTimeout(400);
await page.evaluate(() => window.__debug.setCore("them", 1));
await page.waitForTimeout(400);

// Select the minion, then swing at the core. Both are ordinary clicks on the
// ordinary board: nothing here bypasses the engine's legality check.
await page.locator('[data-slot="0-0"]').first().click();
await page.waitForTimeout(400);
await page.locator('[data-hero="1"]').first().click();

await page.locator(".pack-veil").waitFor({ state: "visible", timeout: 12000 });
await shoot("05-pack-sealed", 900);

await page.locator(".pack-box").click({ force: true });
await shoot("06-pack-hit-1", 420);
await page.locator(".pack-box").click({ force: true });
await shoot("07-pack-hit-2", 420);
await page.locator(".pack-box").click({ force: true });
await shoot("08-pack-burst", 500);
await shoot("09-pack-dealing", 700);
await page.locator(".pack-collect:not([disabled])").waitFor({ state: "visible", timeout: 12000 });
await shoot("10-pack-open", 400);

// --- and the gallery again, now three cards richer
await page.locator(".pack-collect").click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Menu/i }).first().click().catch(() => {});
await page.waitForTimeout(900);
// The title screen's gallery door is an icon button labelled "Cards".
await page.locator(".gallery-trigger").first().click().catch(() => {});
await page.locator(".gallery-panel").waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
await page.locator(".gallery-help").click().catch(() => {});
await shoot("11-gallery-after", 900);

console.log(`\n${shots.length} shots in .preview/pack/`);
await browser.close();
