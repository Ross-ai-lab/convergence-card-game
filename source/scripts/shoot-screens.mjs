/**
 * Screenshots the screens `just wall` cannot reach.
 *
 *   node scripts/shoot-screens.mjs http://localhost:5177
 *
 * `just wall` opens a fresh profile and photographs whatever the app shows on
 * load, which for this game is the title screen and nothing else. The rules
 * overlay, the settings panel, a populated board and the hotseat curtain all
 * require someone to click their way there first — and two card conditions have
 * already shipped broken behind exactly that blind spot.
 *
 * Uses Playwright's bundled Chromium, the same engine `just wall` uses.
 * Writes into .preview/screens/.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".preview", "screens");
const BASE = process.argv[2] || "http://localhost:5177";

mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const shots = [];

async function shoot(name) {
  // The board animates forever and never signals idle, so never wait for that —
  // settle on a fixed beat instead.
  await page.waitForTimeout(700);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(name);
  console.log(`  ${name}.png`);
}

page.on("console", (message) => {
  if (message.type() === "error") console.log(`  [console error] ${message.text().slice(0, 160)}`);
});
page.on("pageerror", (error) => console.log(`  [page error] ${error.message.slice(0, 160)}`));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await shoot("01-title");

// --- a real board, against the bot, so minions actually arrive
//
// THE DUEL STARTS FIRST, before the overlay shots below, and that ordering is
// load-bearing. "How to play" and "Sound & settings" are DUEL TOOLBAR buttons.
// They exist in the DOM while the title screen is up, so Playwright resolves
// them happily and then spends its whole timeout reporting `<div
// class="title-screen"> intercepts pointer events` — an error that reads like a
// z-index bug in the game and is really a script clicking a control that is not
// on screen yet.
//
// Target the class, not the label. This control's accessible name is "Duel"
// plus the selected difficulty, so the old `/Duel the/` matcher belonged to an
// earlier title screen and had been silently timing out here — the same stale
// label check-cardface.mjs already had to correct.
await page.locator(".duel-trigger").first().click();
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});
await shoot("04-board-opening");

// --- the rules overlay
await page.getByRole("button", { name: "How to play" }).click();
await shoot("02-how-to-play");
await page.keyboard.press("Escape");

// --- settings
// Match the VISIBLE text, not the tooltip. This button's markup is
// `title="Sound and settings"` wrapping the text `⚙ Settings`, and a button's
// accessible name comes from its text content — the title is only a fallback
// for a button that has none. Matching the tooltip therefore resolves nothing
// at all and burns the full timeout without ever naming the real cause.
await page.getByRole("button", { name: /Settings/i }).click();
await shoot("03-settings");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Let the duel run itself for a while: the bot plays its side, and clicking end
// turn drives ours. This is the only way to reach a POPULATED board, which is
// the state every card condition is invisible in until you have it.
for (let turn = 0; turn < 14; turn += 1) {
  const end = page.getByRole("button", { name: /End Turn/i }).first();
  if (await end.count()) {
    try {
      await end.click({ timeout: 1200 });
    } catch {
      // a prompt is open, or it is the opponent's move — let the tick pass
    }
  }
  await page.waitForTimeout(700);
}
await shoot("05-board-populated");

// --- ONE card, filling the frame.
// The stat gems carry the whole "which number is which" question, and at board
// scale they are 30 px of a 1440 px shot -- far too small to judge. A grid of
// thumbnails is what let a grey blob pass as a shield once already.
{
  const card = page.locator(".board-slot.occupied .card-face").first();
  if (await card.count()) {
    // Blow it up first. The card is built in `--u` units so a transform scales
    // art, text and gems together -- this is the same card, just legible.
    //
    // The scale is COMPUTED, not the flat 4x it used to be: a 4x board minion is
    // ~940px tall in a 900px viewport, so Playwright's element screenshot clipped
    // the bottom of the card and the ATK blade and HP heart came out sliced flat.
    // That reads exactly like a CSS overflow bug and is purely the shot. Fit the
    // card to the viewport and the gems are whole.
    await card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const fit = Math.max(1, Math.min((window.innerHeight - 24) / box.height, (window.innerWidth - 24) / box.width));
      el.dataset.zoomed = "1";
      // The width and height are PINNED to what the card measured in the layout
      // before it was lifted out of it. `.card-face` is `container-type: size`
      // and was sized by its grid cell — going `position: fixed` without this
      // lets it shrink-wrap to something else entirely, which makes the scale
      // computed from the old box wrong and clips the bottom of the card. That
      // sliced the ATK blade and HP heart flat and read exactly like an overflow
      // bug in the card itself.
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.position = "fixed";
      el.style.left = "12px";
      el.style.top = "12px";
      el.style.transform = `scale(${fit.toFixed(3)})`;
      el.style.transformOrigin = "top left";
      el.style.zIndex = "9999";
    });
    await page.waitForTimeout(400);
    await card.screenshot({ path: join(OUT, "09-card-gems.png") });
    await card.evaluate((el) => {
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.position = "";
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.zIndex = "";
      delete el.dataset.zoomed;
    });
    shots.push("09-card-gems");
    console.log("  09-card-gems.png");
  }
}

// --- the stat gems at their REAL size, cropped rather than scaled.
//
// 09-card-gems scales a card up with a CSS transform, which pushes it over the
// 200px container-query breakpoint — so it always photographs the FULL card and
// can never show the compact gems that a board minion and a hand card actually
// use. Those are the ones that were unreadable. A crop at natural size is the
// only shot that shows what the player is looking at.
{
  // Let the board settle first. These are element-box crops, and a minion caught
  // mid-arrival is scaled 1.22 and lifted 26px — the box is then both bigger and
  // higher than the card, so the crop lands half on the rift and half on the top
  // of the card and looks like a layout bug.
  await page.waitForTimeout(1200);
  const clips = [
    [".board-slot.occupied .card-face", "15-gems-on-board"],
    [".hand-card .card-face", "16-gems-in-hand"],
  ];
  for (const [selector, name] of clips) {
    const target = page.locator(selector).first();
    if (!(await target.count())) continue;
    const box = await target.boundingBox();
    if (!box) continue;
    const pad = 10;
    await page.screenshot({
      path: join(OUT, `${name}.png`),
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      },
    });
    shots.push(name);
    console.log(`  ${name}.png`);
  }
}

// --- the WORST CASE name, against the enlarged cost crystal.
//
// The compact stat gems are big enough that a long name and the cost number
// compete for the same corner, and the fit constant caps the name's WIDTH
// without moving where it sits. Whether they collide therefore depends entirely
// on which card you happen to be looking at — so plant the two longest names in
// the roster rather than hoping the shuffle deals one.
{
  // Longest NAMES (they fight the cost crystal for the top corner) and longest
  // RULES TEXT (it has to survive the plaque now that board minions print it).
  const longest = [
    "Giorno - Gold Experience Requiem",
    "Rennala Queen of the Full Moon",
    "Morpheus",
    "Dr. Heinz Doofenshmirtz",
    "Kojiro Sasaki",
  ];
  const placed = await page.evaluate((names) => {
    const debug = window.__debug;
    if (!debug) return null;
    names.forEach((name, i) => debug.place(name, "me", i));
    debug.giveCard(names[0], "me");
    return names.length;
  }, longest);
  if (placed) {
    await page.waitForTimeout(700);
    const row = page.locator(".board-row").last();
    const box = await row.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(OUT, "18-long-names.png"),
        clip: { x: box.x, y: Math.max(0, box.y - 8), width: box.width, height: box.height + 16 },
      });
      shots.push("18-long-names");
      console.log("  18-long-names.png");
    }
    // And in hand, where the crystal is on the LEFT and the reserve flips with
    // it. The card was appended, so it is the last one in the fan — and the last
    // card is the only one NOT overlapped, so it shows the whole face.
    const handCard = page.locator(".hand-card .card-face").last();
    if (await handCard.count()) {
      const hb = await handCard.boundingBox();
      if (hb) {
        await page.screenshot({
          path: join(OUT, "19-long-name-in-hand.png"),
          clip: { x: Math.max(0, hb.x - 10), y: Math.max(0, hb.y - 10), width: hb.width + 20, height: hb.height + 20 },
        });
        shots.push("19-long-name-in-hand");
        console.log("  19-long-name-in-hand.png");
      }
    }
  } else {
    console.log("  [skip] 18-long-names — no __debug hook (production build?)");
  }
}

// --- the keyword artwork, planted rather than hoped for.
//
// Taunt and Divine Shield are the two conditions a player has to read across the
// board, and whether either is on screen depends on the shuffle. Taunt in
// particular shipped as a light-grey slab hiding BEHIND the card and nobody
// noticed for weeks, because no screenshot ever had one in it. Planted side by
// side, at natural size, against the real table.
{
  const planted = await page.evaluate(() => {
    if (!window.__debug) return false;
    // Davy Jones is a Taunt; Survivors carries Divine Shield.
    window.__debug.place("Davy Jones", "me", 0);
    window.__debug.place("Survivors", "me", 1);
    window.__debug.place("Sandworm", "me", 2);
    return true;
  });
  if (planted) {
    await page.waitForTimeout(900);
    const row = page.locator(".board-row").last();
    const box = await row.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(OUT, "20-keywords.png"),
        // The Taunt barricade stands 88 design units proud of the card, so the
        // clip has to be wider than the row box or it shears the thing under test.
        clip: { x: Math.max(0, box.x - 30), y: Math.max(0, box.y - 40), width: Math.min(box.width + 60, 820), height: box.height + 80 },
      });
      shots.push("20-keywords");
      console.log("  20-keywords.png");
    }
  }
}

// --- the state rings, forced onto a real minion.
//
// `ready` and `targetable` depend on whose turn it is and what is legal, so a
// screenshot catches them by luck. Forcing the class onto an already-rendered
// board slot keeps the CSS, the size and the browser real — the workspace rule
// allows exactly this as a last resort — and it is the only way to check the
// thing that was actually wrong: the ring used to be drawn on the SLOT, which is
// not 5:7, so it traced a box with a fat gap above and below the card inside it.
// A crop at natural size is the check; a scaled one would hide a small gap.
{
  const slot = page.locator(".board-slot.occupied").first();
  if (await slot.count()) {
    for (const state of ["ready", "targetable", "armed"]) {
      await slot.evaluate((el, cls) => {
        el.classList.remove("ready", "targetable", "armed");
        el.classList.add("occupied", cls);
      }, state);
      await page.waitForTimeout(160);
      const box = await slot.boundingBox();
      if (!box) continue;
      const pad = 26;
      await page.screenshot({
        path: join(OUT, `17-ring-${state}.png`),
        clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 },
      });
      shots.push(`17-ring-${state}`);
      console.log(`  17-ring-${state}.png`);
    }
    await slot.evaluate((el) => el.classList.remove("ready", "targetable", "armed"));
  }
}

// --- the phone and the tablet.
//
// The narrow layout is a completely different arrangement (each board row and
// the hand scroll sideways on their own, End Turn becomes a fixed thumb button,
// the fan is flattened), and none of the other 18 shots can see any of it. It
// went unnoticed for a long time that the small-screen path put five slots at
// 84px and pushed End Turn off the right edge of the viewport entirely.
for (const [label, w, h] of [
  ["21-phone", 390, 844],
  ["22-tablet", 768, 1024],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  shots.push(label);
  console.log(`  ${label}.png`);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);

// --- the rift, close up.
// It is a 10-px-tall strip across a 1440-px shot, which is far too small to
// judge in the board screenshots — and it is the one thing in the arena that
// moves on its own, so "is it actually lit" cannot be answered from a thumbnail.
// Clipped from the real board rather than mocked up.
{
  // The turn banner lives for 1.5s at 42% of the viewport, which is directly
  // over this clip — the first version of this shot photographed "YOUR TURN"
  // instead of the seam. Let it expire.
  await page.waitForTimeout(1700);
  const rift = page.locator(".rift-line");
  if (await rift.count()) {
    // The travelling sweeps and the flare are both timed, so a plain screenshot
    // catches them by luck. Freeze one sweep mid-run and fire a flare, held at
    // its peak — the same negative-delay + paused trick the camp signatures use,
    // and the only way this shot can prove those two layers exist at all.
    const freezeRift = (options) =>
      page.evaluate((opts) => {
        const line = document.querySelector(".rift-line");
        if (!line) return;
        line.querySelector(".rift-flare")?.remove();
        if (opts.flare) {
          const flare = document.createElement("span");
          flare.className = "rift-flare";
          flare.style.animationPlayState = "paused";
          // 16% of 0.72s — the flare's own peak. A round -0.16s lands PAST it,
          // on the falling edge, and photographed it at two thirds opacity.
          flare.style.animationDelay = "-0.115s";
          flare.style.animationFillMode = "both";
          line.appendChild(flare);
        }
        for (const [selector, delay] of [
          [".rift-sweep.a", "-3.1s"],
          [".rift-sweep.b", "-7.4s"],
          [".rift-glow", "-3.75s"],
        ]) {
          const node = line.querySelector(selector);
          if (!node) continue;
          node.style.animationPlayState = "paused";
          node.style.animationDelay = delay;
          node.style.animationFillMode = "both";
        }
      }, options);

    const clipRift = async (name) => {
      await page.waitForTimeout(220);
      const box = await rift.boundingBox();
      if (!box) return;
      await page.screenshot({
        path: join(OUT, `${name}.png`),
        clip: { x: box.x, y: box.y - 46, width: box.width, height: box.height + 92 },
      });
      shots.push(name);
      console.log(`  ${name}.png`);
    };

    // At rest, with the two travelling sweeps frozen mid-run so the shot proves
    // that layer exists — they are timed, so a plain screenshot catches them by
    // luck or not at all. Same negative-delay + paused trick as the camps.
    await freezeRift({ flare: false });
    await clipRift("13-rift");
    // And answering an arrival. Fired separately because the flare covers the
    // whole seam at its peak and would hide the sweeps underneath it.
    await freezeRift({ flare: true });
    await clipRift("14-rift-flare");
  }
}

// --- the hotseat curtain, which only exists between two human turns
// Reload to reach the title screen rather than navigating back through the UI.
// There is no "Menu" button any more — returning to the title is now buried
// inside the settings overlay — and a two-step click path through a menu that
// keeps being redesigned is exactly what left this script broken. A reload has
// no route to go stale.
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await page.locator(".hotseat-trigger").first().click();
await page.waitForTimeout(700);
const end = page.getByRole("button", { name: /End Turn/i }).first();
if (await end.count()) await end.click().catch(() => {});
await shoot("06-hotseat-curtain");

// ---------------------------------------------------------------------------
// The transient effects.
//
// A camp summon lasts under a second and the killing blow lasts 0.7s, so a
// normal screenshot catches them by luck or not at all. These are injected into
// the real page — real stylesheet, real markup — and FROZEN mid-flight with a
// negative animation-delay plus a paused play-state, which is what the effect
// genuinely looks like at its peak rather than a mock-up of it.
// ---------------------------------------------------------------------------
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);

await page.evaluate(() => {
  const stage = document.createElement("div");
  stage.id = "fx-stage";
  stage.style.cssText =
    "position:fixed;inset:0;z-index:200;display:grid;grid-template-columns:repeat(3,1fr);" +
    "place-items:center;background:#1a1220;font:600 13px system-ui;color:#c9bea7";
  // THE BACKGROUND MATTERS AND USED TO BE A LIE. These were photographed on a
  // dark panel and tuned there, then played on bright parchment over a lit card
  // face, where a thin coloured line at 60% opacity is close to invisible. Each
  // cell now carries the battlefield's own gradient, so what the shot shows is
  // the contrast the effect actually has to win.
  const cell = (label, html) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:relative;width:300px;height:300px;display:grid;place-items:center;" +
      "border:1px solid #3d3226;border-radius:12px;" +
      "background:radial-gradient(ellipse 90% 75% at 50% 50%,#e9d6a8 0%,#d9c191 55%,#b99a63 100%)";
    box.innerHTML = `${html}<span style="position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#3a2410">${label}</span>`;
    stage.appendChild(box);
  };
  const impact = (camp) =>
    `<span class="impact impact-summon camp-${camp}" style="--fd:0s;position:absolute;left:50%;top:45%">
       <span class="impact-core"></span><span class="camp-sigil"></span></span>`;
  cell("Magic", impact("magic"));
  cell("Nature", impact("nature"));
  cell("Tech", impact("tech"));
  document.body.appendChild(stage);

  // Freeze each one at ITS OWN peak. A single shared delay is not a fair
  // comparison — the three effects have different durations, so one flat -0.34s
  // caught Tech already fading out and made it look like the weakest of the
  // three when it was simply photographed late.
  const peak = { magic: "-0.30s", nature: "-0.34s", tech: "-0.28s" };
  for (const [camp, delay] of Object.entries(peak)) {
    for (const node of stage.querySelectorAll(`.camp-${camp}, .camp-${camp} *`)) {
      node.style.animationPlayState = "paused";
      node.style.animationDelay = delay;
      node.style.animationFillMode = "both";
    }
  }
});
await shoot("07-camp-signatures");

// The killing blow sits at z-index 88, above the victory overlay (50) but below
// the title screen (90) — correct in a duel, invisible in a screenshot taken on
// the title. Drop the title first so the shot shows what a player actually sees.
await page.evaluate(() => {
  document.getElementById("fx-stage")?.remove();
  document.querySelector(".title-screen")?.remove();
  const flash = document.createElement("div");
  flash.className = "lethal-flash";
  flash.style.animationPlayState = "paused";
  flash.style.animationDelay = "-0.16s";
  flash.style.animationFillMode = "both";
  document.body.appendChild(flash);
});
await shoot("08-lethal-blow");

console.log(`\n${shots.length} screens written to .preview/screens/`);
// Close defensively and exit explicitly. Chromium's teardown intermittently
// rejects AFTER every screenshot is already on disk, which made this script exit
// non-zero on a completely successful run — a harness that reports failure on
// success is worse than no harness, because the next person learns to ignore it.
try {
  await browser.close();
} catch (error) {
  console.log(`  [teardown] ${String(error).slice(0, 120)} — all ${shots.length} shots were written first`);
}
process.exit(0);
