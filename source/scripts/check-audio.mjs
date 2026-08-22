/**
 * Proves the audio graph actually emits sound, in a real browser.
 *
 *   node scripts/check-audio.mjs http://localhost:5177
 *
 * Counters and "musicPlaying: true" are worthless here — this workspace has
 * already shipped a bench that measured peak 0.73 and was inaudible, and a card
 * whose art served HTTP 200 and rendered black. So every assertion below reads an
 * AnalyserNode on the master bus (the DEV probes in src/audio/sfx.ts) rather than
 * asking the code whether it thinks it worked.
 *
 * Voice lines have an extra failure mode the oscillator sounds do not: they are
 * fetched and decoded, so the file can 404 or fail to decode while every flag in
 * the app still reads healthy.
 */

import { launch } from "./browser.mjs";

const BASE = process.argv[2] || "http://localhost:5177";

const browser = await launch([
  // Headless Chromium has no audio device; this gives it a silent one so the
  // graph runs for real instead of staying suspended forever.
  "--autoplay-policy=no-user-gesture-required",
  "--use-fake-device-for-media-stream",
]);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const failures = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${detail}`);
  if (!ok) failures.push(label);
};

// Player One is the only seat with an opening mulligan. Complete it before
// clicking any board controls so the overlay cannot intercept the audio trigger.
async function completeOpeningMulligan() {
  const confirm = page.locator(".mulligan-panel button.primary");
  await confirm.waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);

// Regression: the very first real gesture may be the Duel button itself. That
// click unlocks audio and changes the screen at the same time, so the menu bed
// and battle bed can race while their files are loading.
await page.locator(".duel-trigger").click({ timeout: 5000 }).catch(() => {});
await page.locator(".hs-shell").waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});
await completeOpeningMulligan();
await page.waitForTimeout(2600);
const directDuel = await page.evaluate(() => window.__sfx?.getStats() ?? { error: "SFX probe missing" });
check(
  "direct Duel starts battle music",
  directDuel.current === "battle" && directDuel.musicPlaying,
  `current=${directDuel.current}, playing=${directDuel.musicPlaying}`,
);

// A real gesture is what unlocks the AudioContext in browsers that do not use
// the test runner's autoplay override.
await page.mouse.click(640, 400);
await page.waitForTimeout(600);

const ready = await page.evaluate(async () => {
  const api = window.__sfx;
  if (!api) return { error: "DEV probes missing — is this a production build?" };
  api.unlock();
  api.setMuted(false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return api.getStats();
});
if (ready.error) {
  console.error(ready.error);
  await browser.close();
  process.exit(1);
}
check("AudioContext running", ready.ctxState === "running", `state=${ready.ctxState}`);

// --- the three buses
for (const [label, effect] of [["effects bus (summon)", "summonMythic"], ["effects bus (impact)", "hit"]]) {
  const result = await page.evaluate((name) => window.__sfx.probePeak(name, 1100), effect);
  check(label, result.peak > 0.02, `peak ${result.peak}, energy ${result.energy}, ${result.activeMs}ms`);
}

// `mana` fires on every card played, so it is deliberately the quietest thing in
// the game after the hover tick — which is exactly why it needs its own probe.
// A sound tuned that low is the easiest kind to leave wired to silence, and the
// threshold here is set well under the bus checks above on purpose.
{
  const result = await page.evaluate(() => window.__sfx.probePeak("mana", 700));
  check("effects bus (mana spend)", result.peak > 0.004, `peak ${result.peak}, ${result.activeMs}ms`);
}

for (const track of ["menu", "battle", "tension"]) {
  const result = await page.evaluate((name) => window.__sfx.probeTrack(name, 2200), track);
  check(`music: ${track}`, result.peak > 0.01 && result.current === track, `peak ${result.peak}, current=${result.current}`);
}

// A spread of card themes. Each sting is an independent ffmpeg cut from a
// different source track, so any one of them could have come out silent.
const themes = [
  ["c025", "Saitama"],
  ["c027", "Thanos"],
  ["c029", "Darth Vader"],
  ["c136", "Cthulhu"],
  ["c005", "Batman"],
];
for (const [id, label] of themes) {
  const result = await page.evaluate((cardId) => window.__sfx.probeCardTheme(cardId, 2600), id);
  check(`card theme: ${label}`, result.peak > 0.02 && result.activeMs > 200, `peak ${result.peak}, ${result.activeMs}ms audible`);
}

// Relics use the same theme path as minions, but their IDs are distinct so an
// equip can never be proven by the minion-only sample above. Probe every relic
// ID, including the locally cut Made in Abyss sting, to catch a missing mapping
// or a missing file before the player reaches an equip action.
for (let index = 1; index <= 21; index += 1) {
  const relicId = `r${String(index).padStart(3, "0")}`;
  const result = await page.evaluate((cardId) => window.__sfx.probeCardTheme(cardId, 900), relicId);
  check(`relic theme: ${relicId}`, result.peak > 0.02 && result.activeMs > 200, `peak ${result.peak}, ${result.activeMs}ms audible`);
}

// The herald comes off its own clip set through its own code path, so a working
// card theme proves nothing about it.
// Only DUEL-level lines exist now: the herald was removed from card placement
// (owner ruling), so "mythic" is gone along with the rest of the summon lines.
// `first_blood` was here and is gone — the line was deleted from the sheet and
// its clip removed (owner ruling), so probing it would fail on a missing file.
for (const clip of ["duel_begin", "core_low_them", "victory"]) {
  const result = await page.evaluate(async (name) => {
    const api = window.__sfx;
    api.stopMusic();
    const before = api.getStats().themesPlayed;
    api.playAnnouncer(name);
    await new Promise((resolve) => setTimeout(resolve, 2600));
    const stats = api.getStats();
    return { fired: stats.themesPlayed > before, last: stats.lastTheme };
  }, clip);
  check(`herald: ${clip}`, result.fired && result.last === `announcer/${clip}`, `last=${result.last}`);
}

// A COMPARATOR IS NOT ENOUGH, proven by it passing a bad seam.
//
// This asserted only `seamless <= naive`, so it went green on a fold that left a
// 0.0071 step against a 0.073 peak — roughly a 10% jump, i.e. a soft thump every
// time the 44-second loop wrapped. Any fold at all beats no fold, so the
// comparator can never fail on a bed that was folded and cut badly.
//
// The ceiling is baselined from what a good fold actually achieves: menu reads
// 0.0001 and a 4-second fold on the dense orchestral beds reads 0.0009, so 0.004
// leaves 4x headroom and still catches the 0.0071 case that slipped through.
// Raising it needs a reason, not a rebuild that happens to miss.
const SEAM_CEILING = 0.004;
const seam = await page.evaluate(() => window.__sfx.probeLoopSeam());
check(
  "music loop seam is folded",
  !seam.error && seam.seamlessJump <= seam.naiveJump && seam.seamlessJump < SEAM_CEILING,
  seam.error ? seam.error : `naive ${seam.naiveJump} -> seamless ${seam.seamlessJump} (ceiling ${SEAM_CEILING})`,
);

// The crossfade itself. A card theme being audible proves nothing about whether
// the battle loop got out of its way -- two pieces of music at full level is
// exactly the mush this change existed to remove. This reads the music loop's
// own gain param, which is what duck() actually automates.
//
// Deliberately AFTER the seam check: probeLoopSeam measures whichever buffer is
// currently loaded and is sensitive to having had music started and stopped
// before it, so anything that touches playback has to run after it.
{
  const d = await page.evaluate(() => window.__sfx.probeDuck("c025"));
  const dropped = d.ducked < d.nominal * 0.25;
  const cameBack = d.restored > d.nominal * 0.8;
  check(
    "music crossfades under a card theme",
    dropped && cameBack,
    `music gain ${d.nominal.toFixed(3)} -> ${d.ducked.toFixed(3)} -> ${d.restored.toFixed(3)}`,
  );
}

// --- the TRIGGER, not just the audio path.
//
// Everything above proves a voice CAN be played. This proves one actually IS,
// when a card lands on the board, which is the entire feature.
//
// Watching the network for the clip does NOT work and looked like a real bug for
// two rounds: `prefetchCardThemes` warms the viewer's whole hand as soon as the board
// renders, so by the time a card is clicked its clip is already cached and no new
// request ever fires. The counter below is the right instrument — it counts the
// trigger, while audibility is proven separately by the analyser probes above.
await page.evaluate(() => window.__sfx.setMuted(false));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.locator(".duel-trigger").click({ timeout: 5000 }).catch(() => {});
await page.locator(".hs-shell").waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});
await completeOpeningMulligan();
await page.waitForTimeout(1200);

// Cheat mode first. Going first deals TWO cards against ONE mana, and the roster
// runs to 10 cost — without infinite mana this check is a coin flip on whether
// the opening card happens to be affordable, which is how it failed the first
// time it ran. The trigger under test is unaffected by how the card was paid for.
//
// It lives in the top bar now. Keep this check on the actual player-facing
// control so a UI move does not make the audio trigger check fail before it
// reaches the card-placement assertion.
await page.getByRole("button", { name: /Cheat Off|Cheat On/ }).first().click();
await page.waitForTimeout(400);
if ((await page.locator(".mana-inf").count()) === 0) {
  check("cheat mode is on for the play-a-card check", false, "no ∞ in the mana tray");
}

// Click a card in hand, then an empty slot on our side. Both halves are plain
// clicks; drag & drop is unreliable to script (pointer events need real gaps).
const before = await page.evaluate(() => window.__sfx.getStats().themesPlayed);
// Inject a plain minion so the trigger check cannot become a random test of
// whether the opening hand happened to contain a board-playable card or a
// relic that needs a bearer.
await page.evaluate(() => window.__debug?.giveCard("Modern Tank"));
const hand = page.locator(".hand-card").last();
let placed = false;
if (await hand.count()) {
  await hand.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  const slots = page.locator(".board-slot.placeable");
  if (await slots.count()) {
    await slots.first().click({ timeout: 2000 }).catch(() => {});
    placed = true;
  }
  await page.waitForTimeout(2400);
}
const after = await page.evaluate(() => window.__sfx.getStats());
check(
  "playing a card sounds its theme",
  after.themesPlayed > before,
  after.themesPlayed > before
    ? `played ${after.lastTheme} (${after.themesPlayed - before} sting)`
    : placed
      ? "a card was placed but no theme sounded"
      : "could not place a card — no placeable slot appeared",
);

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nAll audio checks passed.");
process.exit(failures.length ? 1 : 0);
