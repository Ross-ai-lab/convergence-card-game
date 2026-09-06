/**
 * The three screens the duel checks never reach: the tutorial, developer mode,
 * and the gallery's Star Chart profile.
 *
 *   npm run check:features          (needs the dev server on :5177)
 *   node scripts/check-features.mjs http://localhost:5177
 *
 * It was called `shoot-new-features.mjs`, was in no npm script and in no suite,
 * and defaulted to the IPv4 literal that `localhost` does not resolve to on this
 * machine — so it could not be run by accident and refused the connection when
 * it was. Both things it guards had broken in the meantime: the tutorial
 * dead-ended on its third lesson, and every Star Chart profile was clipping its
 * last rows. A check nobody can run is not a check, which is why it now lives in
 * `check-all.mjs` with the rest.
 *
 * It still writes its screenshots to .preview/new-features/; looking at them is
 * how the layout questions get answered, and the assertions are how the
 * regressions get caught.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";
import { checkProfileLayouts } from "./profile-layout.mjs";

const BASE = process.argv[2] || "http://localhost:5177";
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
check("normal menu has no Tutorial button", await page.getByRole("button", { name: "Tutorial", exact: true }).count() === 0);
await page.keyboard.type("Ross");
const runTutorialButton = page.locator(".developer-cheat-panel").getByRole("button", { name: "Run tutorial", exact: true });
check("developer panel shows Run tutorial", await runTutorialButton.isVisible());
await runTutorialButton.click();
await waitForBoard();
check("tutorial opens the coach", await page.locator(".tutorial-coach").isVisible());
check("tutorial skips mulligan", await page.locator(".mulligan-panel").count() === 0);
check("tutorial uses the curated opening", (await page.locator(".hand-card").count()) === 3);
check("tutorial starts at lesson one", await page.locator(".tutorial-coach-top small").innerText() === "1 / 4");
await page.locator(".hand-card.playable").first().click();
await page.locator('[aria-label="Player One\'s board"] .board-slot.empty').first().click();
check("tutorial advances after playing a card", await page.locator(".tutorial-coach-top small").innerText() === "2 / 4");
await page.locator(".end-turn").click();
await page.locator('[aria-label="Player One\'s board"] .board-slot.ready').first().waitFor({ state: "visible", timeout: 25000 });
check("tutorial advances after End Turn", await page.locator(".tutorial-coach-top small").innerText() === "3 / 4");
await page.locator('[aria-label="Player One\'s board"] .board-slot.ready').first().click();
await page.locator('[aria-label="Player Two\'s board"] .board-slot.targetable').first().click();
check("tutorial reaches the fourth lesson after hitting Taunt", await page.locator(".tutorial-coach-top small").innerText() === "4 / 4");
await page.locator('[aria-label="Player One\'s hand"] .hand-card').filter({ hasText: "Batman" }).first().click();
await page.locator('[aria-label="Player One\'s board"] .board-slot.empty').first().click();
await page.locator('[aria-label="Player Two\'s board"] .board-slot.choosable').first().click();
await page.locator(".target-prompt .prompt-value").first().click();
check("tutorial marks complete after four lessons", await page.locator(".tutorial-coach").getByText("Tutorial complete", { exact: true }).count() === 1);
await page.screenshot({ path: path.join(outputDir, "tutorial-after-taunt.png"), fullPage: false });

// Developer mode ----------------------------------------------------------
await fresh();
await page.keyboard.type("Ross");
await page.getByRole("button", { name: "Open developer tools", exact: true }).click();
check("developer mode opens its workbench", await page.locator(".developer-panel").isVisible());
check("developer mode lists the complete library", (await page.locator(".developer-card-row").count()) === 216);
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
check("locked gallery card opens a sealed profile", await page.locator(".gallery-detail-kicker").getByText("The Rift is holding this profile", { exact: true }).count() === 1);
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
/**
 * THE PROFILE FITS. Owner's ruling, 4 September 2026: no scrolling here.
 *
 * The assertion has now been wrong in both directions, which is worth keeping.
 * It began as "overflow is hidden AND it fits", which sounds like this rule and
 * is not: a hidden overflow that does NOT fit passes the first half and silently
 * eats the last row, which is exactly what happened for weeks after the profile
 * copy was enlarged. Then it became "fits OR can scroll", which was honest about
 * reachability and permitted the scrollbar the owner has since ruled out.
 *
 * What it checks now is the thing that is actually required: the content is no
 * taller than the box. `overflow` is reported alongside so a failure says which
 * of the two states it is in, and a scrollable body fails here on purpose.
 */
const fitsOnOneScreen = (geometry) => geometry.fits === true && geometry.overlap <= 2 && geometry.clipped <= 2 && geometry.outside <= 1;

/**
 * Reads BOTH failure modes, because they are independent and only one of them
 * was ever measured.
 *
 * `fits` catches content taller than its box. It cannot catch content sitting
 * ON TOP of other content, and that is exactly how every relic profile shipped
 * broken: the old layout positioned a relic's card absolutely, which took it out
 * of flow, collapsed the column holding it, and printed the Signature move
 * underneath the artwork. The body's scroll height never changed, so this file
 * reported it green for as long as it existed. `overlap` is the largest
 * intersection between the card and anything in the prose column.
 */
const geometryOf = (panel) => {
  const body = panel.querySelector(".gallery-detail-body");
  const card = panel.querySelector(".gallery-detail-card")?.getBoundingClientRect();
  let overlap = 0;
  let clipped = 0;
  for (const element of panel.querySelectorAll('.gallery-detail-box, .gallery-detail-lore, .gdx-head')) {
    clipped = Math.max(clipped, element.scrollHeight - element.clientHeight, element.scrollWidth - element.clientWidth);
  }
  const rect = panel.getBoundingClientRect();
  const outside = Math.max(0, rect.bottom - innerHeight, -rect.top, rect.right - innerWidth, -rect.left);
  if (card) {
    for (const element of panel.querySelectorAll(".gdx-main *")) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const x = Math.min(card.right, box.right) - Math.max(card.left, box.left);
      const y = Math.min(card.bottom, box.bottom) - Math.max(card.top, box.top);
      if (x > 2 && y > 2) overlap = Math.max(overlap, Math.round(Math.min(x, y)));
    }
  }
  return body
    ? { overflow: getComputedStyle(body).overflowY, fits: body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1, overlap, clipped, outside }
    : { overflow: "missing", fits: false, overlap: 999, clipped: 999, outside: 999 };
};
const modalGeometry = await page.locator(".gallery-detail-panel").evaluate(geometryOf);
check(
  "Star Chart fits on one screen with nothing over the card",
  fitsOnOneScreen(modalGeometry),
  `overflow ${modalGeometry.overflow}, card overlap ${modalGeometry.overlap}px`,
);

// The header is new, and it is the only place the character's name appears
// outside the artwork. A profile that opens without saying whose it is was the
// state this replaced.
check(
  "the dossier names the card and its epithet",
  (await page.locator(".gdx-title h2").textContent())?.trim() === "Joker" &&
    (await page.locator(".gdx-epithet").count()) === 1,
);
check("the dossier carries its origin and rarity chips", (await page.locator(".gdx-chip").count()) >= 2);
// The camp colour reaches the whole panel, not just the radar. Every profile in
// the gallery looked identical while this was set on two elements.
const accentReach = await page.locator(".gallery-detail-panel").evaluate((panel) => {
  const accent = getComputedStyle(panel).getPropertyValue("--accent").trim();
  return { accent, head: getComputedStyle(panel.querySelector(".gdx-head")).borderBottomColor };
});
check("the camp accent themes the panel", Boolean(accentReach.accent) && accentReach.head !== "rgba(0, 0, 0, 0)", accentReach.accent);
const chartType = await page.locator('.star-chart').evaluate(chart => ({
  label: parseFloat(getComputedStyle(chart.querySelector('.star-chart-axis-name')).fontSize),
  caption: parseFloat(getComputedStyle(chart.nextElementSibling).fontSize),
}));
check('chart names are enlarged and the caption is at least 13px', chartType.label >= 24 && chartType.caption >= 13);
await page.setViewportSize({ width: 1536, height: 864 });
await page.waitForTimeout(200);
const laptopGeometry = await page.locator(".gallery-detail-panel").evaluate(geometryOf);
// The 801-900px height band. Nothing covered it, and both 1536x864 and 1280x851
// were clipping their last row inside it.
check("laptop-height Star Chart fits on one screen", fitsOnOneScreen(laptopGeometry));
await page.setViewportSize({ width: 1279, height: 851 });
await page.waitForTimeout(200);
const referenceModalGeometry = await page.locator(".gallery-detail-panel").evaluate(geometryOf);
check("reference-size Star Chart fits on one screen", fitsOnOneScreen(referenceModalGeometry));
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-reference-size.png"), fullPage: false });
await page.setViewportSize({ width: 1536, height: 736 });
await page.waitForTimeout(200);
// `geometryOf` is serialised into the page, so it cannot be CALLED from another
// arrow that runs there — the name does not exist on that side. Read the panel's
// own box separately in Node instead.
const shortHeightGeometry = {
  ...(await page.locator(".gallery-detail-panel").evaluate(geometryOf)),
  bottom: (await page.locator(".gallery-detail-panel").boundingBox())?.y
    + (await page.locator(".gallery-detail-panel").boundingBox())?.height,
};
check("short-height Star Chart fits on one screen", fitsOnOneScreen(shortHeightGeometry) && shortHeightGeometry.bottom <= 736);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-short-height.png"), fullPage: false });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart.png"), fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
const mobileModalGeometry = await page.locator(".gallery-detail-panel").evaluate(geometryOf);
check("mobile Star Chart fits on one screen", fitsOnOneScreen(mobileModalGeometry));
check('phone chart caption remains at least 13px', await page.locator('.gallery-detail-chart-caption').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 13));
await page.screenshot({ path: path.join(outputDir, "gallery-star-chart-mobile.png"), fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole("button", { name: "Close Star Chart", exact: true }).click();
await page.locator(".gallery-detail-panel").waitFor({ state: "detached", timeout: 5000 });
for (const name of ["Meteor", "Planetary Defense Grid", "Black Hole", "Rudeus Greyrat", "Prince Lloyd", "Motoko Kusanagi", "Allspark Cube"]) {
  await page.locator(".gallery-search").fill(name);
  await page.locator('.gallery-cell[role="button"]').first().click();
  await page.locator(".gallery-detail-panel").waitFor({ state: "visible", timeout: 5000 });
  const profileGeometry = fitsOnOneScreen(await page.locator(".gallery-detail-panel").evaluate(geometryOf));
  const expectedChartCount = name === "Allspark Cube" ? 0 : 1;
  check(`${name} has a Star Chart profile`, await page.locator(".gallery-detail-panel").isVisible() && await page.locator(".star-chart").count() === expectedChartCount && await page.locator(".gallery-detail-rule").count() === 0 && profileGeometry);
  if (name === "Allspark Cube") {
    check("Relic Star Charts remove the radar", await page.locator(".star-chart").count() === 0);
    check("Relic Star Charts hide Lore attributes", await page.locator(".gallery-detail-chart-caption").count() === 0);
    // THE RELIC BUG. A relic has no radar, and the layout it used to share with
    // minions dealt with the missing element by positioning the card absolutely
    // — so the card left the flow and the Signature move printed underneath the
    // artwork. It fitted perfectly the whole time.
    const relicGeometry = await page.locator(".gallery-detail-panel").evaluate(geometryOf);
    check("a relic profile puts nothing underneath its own card", relicGeometry.overlap <= 2, `${relicGeometry.overlap}px overlap`);
    check("a relic profile still shows its rank line", (await page.locator(".gdx-rank").count()) === 1);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outputDir, "gallery-relic-star-chart.png"), fullPage: false });
  }
  await page.getByRole("button", { name: "Close Star Chart", exact: true }).click();
  await page.locator(".gallery-detail-panel").waitFor({ state: "detached", timeout: 5000 });
}

await checkProfileLayouts(page, geometryOf, fitsOnOneScreen, check);

const failed = results.filter((result) => !result.condition);
await browser.close();
console.log(failed.length ? `${failed.length} checks failed.` : `All ${results.length} new-feature checks passed.`);
process.exit(failed.length ? 1 : 0);
