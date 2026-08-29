import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5177";
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(sourceDir, "..", ".preview", "new-features");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function fresh() {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".title-screen").waitFor({ state: "visible", timeout: 5000 });
}

async function waitForBoard() {
  await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 });
  const mulligan = page.locator(".mulligan-panel button.primary");
  await mulligan.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
  if (await mulligan.isVisible().catch(() => false)) await mulligan.click();
  await page.waitForTimeout(350);
}

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, condition });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Guided first duel --------------------------------------------------------
await fresh();
await page.getByRole("button", { name: "Guided Duel", exact: true }).click();
await waitForBoard();
check("guided duel opens the coach", await page.locator(".tutorial-coach").isVisible());
check("guided duel uses the curated opening", (await page.locator(".hand-card").count()) === 3);
await page.screenshot({ path: path.join(outputDir, "guided-duel-opening.png"), fullPage: false });

// Developer mode ----------------------------------------------------------
await fresh();
await page.keyboard.type("Ross");
await page.getByRole("button", { name: "Open developer tools", exact: true }).click();
check("developer mode opens its workbench", await page.locator(".developer-panel").isVisible());
check("developer mode lists the complete library", (await page.locator(".developer-card-row").count()) === 205);
await page.screenshot({ path: path.join(outputDir, "developer-workbench.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, "developer-workbench-mobile.png"), fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });
await page.locator(".developer-search input").fill("Joker");
await page.getByRole("button", { name: /Joker/ }).first().click();
await page.getByRole("button", { name: "Start test duel with this card", exact: true }).click();
await waitForBoard();
await page.getByRole("button", { name: "DEV tools", exact: true }).click();
if (await page.getByRole("button", { name: "Infinite mana: ON", exact: true }).count()) {
  await page.getByRole("button", { name: "Infinite mana: ON", exact: true }).click();
}
await page.getByRole("button", { name: "Infinite mana: OFF", exact: true }).click();
check("developer mode toggles infinite mana", await page.locator(".mana-inf").count() === 1);
await page.getByRole("button", { name: "Place on enemy board", exact: true }).click();
check("developer mode places any selected minion", (await page.locator(".board-row").first().locator(".board-slot.occupied").count()) >= 1);
await page.screenshot({ path: path.join(outputDir, "developer-in-duel.png"), fullPage: false });
await page.getByRole("button", { name: "Close developer mode", exact: true }).click();

const endTurnStyle = await page.locator(".end-turn").evaluate((element) => {
  const style = getComputedStyle(element);
  return { backgroundImage: style.backgroundImage, borderColor: style.borderColor, color: style.color };
});
check("End Turn uses the green treatment", /199, 255, 192|74, 171, 100|49, 129, 76/.test(endTurnStyle.backgroundImage));
await page.screenshot({ path: path.join(outputDir, "green-end-turn.png"), fullPage: false });

// Gallery Star Chart -------------------------------------------------------
await fresh();
await page.locator(".gallery-trigger").filter({ hasText: "Cards" }).click();
await page.locator('select[aria-label="Filter by unlocked or locked"]').selectOption("locked");
await page.locator('.gallery-cell[role="button"]').first().click();
check("locked gallery card opens a sealed profile", await page.locator(".gallery-detail-kicker").getByText("Sealed profile", { exact: true }).count() === 1);
check("locked profile does not expose its Star Chart", await page.locator(".star-chart").count() === 0);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outputDir, "gallery-locked-profile.png"), fullPage: false });
await page.getByRole("button", { name: "Close Star Chart", exact: true }).click();

await fresh();
await page.keyboard.type("Ross");
await page.getByRole("button", { name: "Unlock all cards + powers", exact: true }).click();
await page.locator(".gallery-trigger").filter({ hasText: "Cards" }).click();
await page.locator(".gallery-search").fill("Joker");
await page.locator('.gallery-cell[role="button"]').first().click();
check("gallery card opens a Star Chart modal", await page.locator(".gallery-detail-panel").isVisible());
check("Star Chart renders its six-axis chart", await page.locator(".star-chart").count() === 1);
check("Star Chart keeps current game text visible", await page.locator(".gallery-detail-rule").getByText(/Battlecry|Passive|Taunt|Divine Shield|Chained/).count() === 1);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-mobile.png"), fullPage: false });

const failed = results.filter((result) => !result.condition);
await browser.close();
console.log(failed.length ? `${failed.length} checks failed.` : `All ${results.length} new-feature checks passed.`);
process.exit(failed.length ? 1 : 0);
