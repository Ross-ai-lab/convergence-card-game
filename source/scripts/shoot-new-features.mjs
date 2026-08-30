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

// Tutorial first duel ------------------------------------------------------
await fresh();
await page.getByRole("button", { name: "Tutorial", exact: true }).click();
await waitForBoard();
check("tutorial opens the coach", await page.locator(".tutorial-coach").isVisible());
check("tutorial skips mulligan", await page.locator(".mulligan-panel").count() === 0);
check("tutorial uses the curated opening", (await page.locator(".hand-card").count()) === 3);
check("tutorial starts at lesson one", await page.locator(".tutorial-coach-top small").innerText() === "1 / 6");
await page.locator(".hand-card.playable").first().click();
await page.locator('[aria-label="Player One\'s board"] .board-slot.empty').first().click();
check("tutorial advances after playing a card", await page.locator(".tutorial-coach-top small").innerText() === "2 / 6");
await page.locator(".end-turn").click();
await page.locator('[aria-label="Player One\'s board"] .board-slot.ready').first().waitFor({ state: "visible", timeout: 25000 });
check("tutorial shows the card after End Turn", await page.locator(".tutorial-coach-top small").innerText() === "3 / 6" && await page.locator(".tutorial-card-example").count() === 1);
await page.screenshot({ path: path.join(outputDir, "tutorial-card-spotlight.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
const tutorialMobileCoach = await page.locator(".tutorial-coach").evaluate((coach) => {
  const box = coach.getBoundingClientRect();
  return { right: box.right, bottom: box.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
});
check("mobile Tutorial coach stays inside the viewport", tutorialMobileCoach.right <= tutorialMobileCoach.viewportWidth && tutorialMobileCoach.bottom <= tutorialMobileCoach.viewportHeight);
await page.screenshot({ path: path.join(outputDir, "tutorial-card-spotlight-mobile.png"), fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole("button", { name: "Continue to first swing", exact: true }).click();
check("tutorial reveals the swing lesson after the card", await page.locator(".tutorial-coach-top small").innerText() === "4 / 6");
await page.locator('[aria-label="Player One\'s board"] .board-slot.ready').first().click();
await page.locator('[aria-label="Player Two\'s board"] .board-slot.targetable').first().click();
check("tutorial advances one lesson after hitting Taunt", await page.locator(".tutorial-coach-top small").innerText() === "5 / 6");
await page.screenshot({ path: path.join(outputDir, "tutorial-after-taunt.png"), fullPage: false });

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
await page.locator(".gallery-detail-panel").waitFor({ state: "visible", timeout: 5000 });
check("gallery card opens a Star Chart modal", await page.locator(".gallery-detail-panel").isVisible());
check("Star Chart renders its six-axis chart", await page.locator(".star-chart").count() === 1);
check("Star Chart removes the In Convergence panel", await page.locator(".gallery-detail-rule").count() === 0);
check("Star Chart uses the Relationships block", await page.locator(".gallery-detail-relationships").getByText("Relationships", { exact: true }).count() === 1);
check("Star Chart removes footer copy", await page.locator(".gallery-detail-hint").count() === 0 && await page.locator(".gallery-detail-nav span").count() === 0);
const modalGeometry = await page.locator(".gallery-detail-panel").evaluate((panel) => {
  const body = panel.querySelector(".gallery-detail-body");
  return body ? { overflow: getComputedStyle(body).overflowY, fits: body.scrollHeight <= body.clientHeight + 1 } : { overflow: "missing", fits: false };
});
check("Star Chart fits without an internal scrollbar", modalGeometry.overflow === "hidden" && modalGeometry.fits);
await page.setViewportSize({ width: 1279, height: 851 });
await page.waitForTimeout(200);
const referenceModalGeometry = await page.locator(".gallery-detail-panel").evaluate((panel) => {
  const body = panel.querySelector(".gallery-detail-body");
  return body ? { overflow: getComputedStyle(body).overflowY, fits: body.scrollHeight <= body.clientHeight + 1 } : { overflow: "missing", fits: false };
});
check("reference-size Star Chart fits without an internal scrollbar", referenceModalGeometry.overflow === "hidden" && referenceModalGeometry.fits);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-reference-size.png"), fullPage: false });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
const mobileModalGeometry = await page.locator(".gallery-detail-panel").evaluate((panel) => {
  const body = panel.querySelector(".gallery-detail-body");
  return body ? { overflow: getComputedStyle(body).overflowY, fits: body.scrollHeight <= body.clientHeight + 1 } : { overflow: "missing", fits: false };
});
check("mobile Star Chart fits without an internal scrollbar", mobileModalGeometry.overflow === "hidden" && mobileModalGeometry.fits);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-mobile.png"), fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole("button", { name: "Close Star Chart", exact: true }).click();
await page.locator(".gallery-detail-panel").waitFor({ state: "detached", timeout: 5000 });
for (const name of ["Meteor", "Planetary Defense Grid", "Black Hole", "Rudeus Greyrat", "Prince Lloyd", "Motoko Kusanagi", "Allspark Cube"]) {
  await page.locator(".gallery-search").fill(name);
  await page.locator('.gallery-cell[role="button"]').first().click();
  await page.locator(".gallery-detail-panel").waitFor({ state: "visible", timeout: 5000 });
  const profileGeometry = await page.locator(".gallery-detail-panel").evaluate((panel) => {
    const body = panel.querySelector(".gallery-detail-body");
    return body ? body.scrollHeight <= body.clientHeight + 1 : false;
  });
  check(`${name} has a Star Chart profile`, await page.locator(".gallery-detail-panel").isVisible() && await page.locator(".star-chart").count() === 1 && await page.locator(".gallery-detail-rule").count() === 0 && profileGeometry);
  if (name === "Allspark Cube") {
    check("Relic Star Charts hide Lore attributes", await page.locator(".gallery-detail-chart-caption").count() === 0);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outputDir, "gallery-relic-star-chart.png"), fullPage: false });
  }
  await page.getByRole("button", { name: "Close Star Chart", exact: true }).click();
  await page.locator(".gallery-detail-panel").waitFor({ state: "detached", timeout: 5000 });
}

const failed = results.filter((result) => !result.condition);
await browser.close();
console.log(failed.length ? `${failed.length} checks failed.` : `All ${results.length} new-feature checks passed.`);
process.exit(failed.length ? 1 : 0);
