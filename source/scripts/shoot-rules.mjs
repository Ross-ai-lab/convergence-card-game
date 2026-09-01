/**
 * Photographs the How to play panel, top to bottom, at real play size.
 *
 * The rules guide is the one screen in this game that cannot be checked by any
 * of the other harnesses: `shoot-screens.mjs` never opens it, `check-ui.mjs`
 * asserts behaviour rather than layout, and `just wall` only ever sees a fresh
 * profile's opening screen. It is also 2,500 pixels of scrolling content inside
 * a 600-pixel window, so a single screenshot proves nothing about the two
 * thirds below the fold.
 *
 * So this walks the panel down in overlapping screen-height steps and writes one
 * PNG per step into `.preview/rules/`, plus one full-height capture of the panel
 * on its own. Run it against a dev server that is already up:
 *
 *     node scripts/shoot-rules.mjs [http://localhost:5177]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", ".preview", "rules");
const url = process.argv[2] ?? "http://localhost:5177";

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle" });

// The title screen, then a duel, then the opening mulligan: the guide is
// reachable from the toolbar only once a duel is actually on screen.
// Target .duel-trigger by class, never by label: the toolbar buttons exist in
// the DOM behind the title screen, so a label match resolves the wrong node and
// times out reporting a z-index bug that is not there. shoot-screens.mjs learnt
// this the same way.
await page.locator(".duel-trigger").first().click();
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18_000 }).catch(() => {});
const mulliganConfirm = page.locator(".mulligan-panel button.primary");
await mulliganConfirm.waitFor({ state: "visible", timeout: 9_000 }).catch(() => {});
if (await mulliganConfirm.isVisible().catch(() => false)) await mulliganConfirm.click();

await page.locator("button", { hasText: /How to play/i }).first().click();
await page.waitForTimeout(400);

const panel = page.locator(".screen-panel");
await panel.waitFor({ state: "visible" });
const body = page.locator(".screen-panel-body");

const metrics = await body.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }));
const step = Math.round(metrics.client * 0.85);
const shots = Math.max(1, Math.ceil((metrics.scroll - metrics.client) / step) + 1);

for (let index = 0; index < shots; index += 1) {
  const top = Math.min(index * step, metrics.scroll - metrics.client);
  await body.evaluate((node, value) => node.scrollTo(0, value), top);
  await page.waitForTimeout(150);
  await panel.screenshot({ path: path.join(outDir, `rules-${String(index + 1).padStart(2, "0")}.png`) });
}

// And the whole thing in one image, by letting the panel grow to its content.
await page.evaluate(() => {
  const node = document.querySelector(".screen-panel");
  if (node instanceof HTMLElement) node.style.maxHeight = "none";
  const scroller = document.querySelector(".screen-panel-body");
  if (scroller instanceof HTMLElement) scroller.style.overflow = "visible";
});
await page.waitForTimeout(200);
await panel.screenshot({ path: path.join(outDir, "rules-full.png") });

await browser.close();
console.log(`Wrote ${shots + 1} images to ${path.relative(process.cwd(), outDir)}`);
console.log(`Panel body: ${metrics.scroll}px of content in a ${metrics.client}px window.`);
