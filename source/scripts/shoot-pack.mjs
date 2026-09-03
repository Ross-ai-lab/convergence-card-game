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

// --- the title screen, where the tally rides inside the Cards button
await shoot("00-title-tally", 400);

// --- the gallery. It OPENS on Unlocked: there is no combined view, so the
// first thing a player sees is their own collection, and Locked is the
// deliberate second stop.
// The title screen's gallery door is an icon button labelled "Cards".
await page.locator(".gallery-trigger").first().click().catch(() => {});
await page.locator(".gallery-panel").waitFor({ state: "visible", timeout: 8000 });
await shoot("01-gallery-unlocked", 1400);

await page.locator(".gallery-help").click();
await shoot("02-gallery-help", 700);
// Close it by its OWN button. The help is a popup now, so its veil covers the
// "?" that opened it and clicking that again just times out against the veil.
await page.locator(".help-x").click();
await page.locator(".help-veil").waitFor({ state: "detached", timeout: 5000 });

const collection = page.locator(".gallery-filter select[aria-label*='unlocked']");
await collection.selectOption("locked");
await shoot("03-gallery-locked", 1400);
// Relics carry the glimmer, and the gallery is where several are on screen at
// once — the one place a per-card animation can cost something.
await collection.selectOption("unlocked");
await page.locator(".gallery-filter select[aria-label*='rarity']").selectOption("Relic");
await shoot("04-gallery-relics", 1400);
await page.locator(".gallery-filter select[aria-label*='rarity']").selectOption("");
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

// Struck until it GIVES WAY, rather than a fixed three times. It was three, and
// the pack has taken five hits since the strike animation was rebuilt: the
// script went on photographing a sealed box and then timed out waiting for a
// Collect button that could not appear. A loop cannot go stale that way.
for (let hit = 1; hit <= 10; hit += 1) {
  // A charged pack is already on its way open and detaches a beat later, so
  // clicking it again races the burst rather than adding a hit.
  const box = page.locator(".pack-box:not(.is-charged)");
  if (!(await box.isVisible().catch(() => false))) break;
  await box.click({ force: true, timeout: 4000 }).catch(() => {});
  if (hit <= 2) await shoot(`0${hit + 5}-pack-hit-${hit}`, 420);
  else await page.waitForTimeout(420);
}
await shoot("08-pack-burst", 900);
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
await page.locator(".help-pop").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
await shoot("11-gallery-after", 900);

// --- the four shines side by side, which is the only way to judge them
//
// Each tier looks fine alone; the question is whether they read as an
// ESCALATION next to each other, and that cannot be answered one card at a
// time. Everything is unlocked and marked met first, because the gallery's own
// grayscale dimming sits on top of the shine and would hide all four.
await page.keyboard.press("Escape");
await page.evaluate(() => {
  const key = "convergence.progress.v2";
  const progress = JSON.parse(localStorage.getItem(key) ?? "null");
  if (!progress) return;
  progress.unlocked = progress.unlockOrder.length;
  progress.seen = [...progress.unlockOrder];
  progress.played = [...progress.unlockOrder];
  localStorage.setItem(key, JSON.stringify(progress));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await page.locator(".gallery-trigger").first().click();
await page.locator(".gallery-panel").waitFor({ state: "visible", timeout: 8000 });
const rarity = page.locator(".gallery-filter select[aria-label*='rarity']");
for (const [value, name] of [
  ["Red", "12-shine-mythic"],
  ["Yellow", "13-shine-legendary"],
  ["Purple", "14-shine-epic"],
  ["Relic", "15-shine-relic"],
  ["Black", "16-shine-rare-none"],
]) {
  await rarity.selectOption(value);
  await shoot(name, 1500);
}

console.log(`\n${shots.length} shots in .preview/pack/`);
await browser.close();
