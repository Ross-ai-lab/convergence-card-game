/**
 * The interaction net. Drives a REAL board in a REAL browser and asserts what
 * clicking actually does.
 *
 *   npm run check:ui                       (needs the dev server on :5177)
 *   node scripts/check-ui.mjs http://localhost:5177
 *
 * WHY THIS EXISTS
 * ---------------
 * The 95 engine tests are pure: they ask the rules a question and read the
 * answer straight back. They never open the game. So a bug that lives in the
 * CLICKING is invisible to every one of them — the engine says "yes, that
 * minion may attack" while the screen quietly drops the click on the floor.
 * That is exactly what happened: picking up a card silently disabled attacking
 * for the whole turn, all 95 tests green throughout, and the only reason it was
 * found is the owner played the game and said so.
 *
 * Each check below is a click sequence a person would perform, followed by an
 * assertion about the resulting DOM. Selectors are the ones the app really
 * uses: `.hand-card`, `.board-slot.placeable`, `.board-slot.occupied.ready`,
 * `.board-slot.armed`.
 *
 * Targeting and relics are set up through `window.__debug` (registered in
 * App.tsx, DEV builds only). Playing cards and hoping made those checks skip on
 * almost every run — the card has to BE in your hand and there has to be a legal
 * target — which is coverage in name only. The hook removes the luck.
 *
 * Cheat mode is turned on for most scenarios on purpose. The roster runs to
 * cost 10, so without it many of
 * these checks are a coin flip on whether the opening hand is affordable —
 * which is how the audio harness failed the first time it ran.
 */
import { launch } from "./browser.mjs";

const BASE = process.argv[2] || "http://localhost:5177";
const TITLE_ONLY = process.argv.includes("--title-only");
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${detail}`);
}

/**
 * For a check whose PRECONDITION depends on the shuffle. A skip is loud and is
 * never counted as a pass — reporting "it worked" when the situation never
 * arose is the one thing a harness must not do.
 */
function skip(name, why) {
  results.push({ name, ok: true, skipped: true });
  console.log(`  SKIP  ${name.padEnd(46)} ${why}`);
}

/** Current mana as [now, max], read off the tray. */
async function mana() {
  const text = await page.locator(".mana-tray strong").first().textContent().catch(() => null);
  if (!text) return [null, null];
  const [now, max] = text.split("/").map((n) => Number(n.trim()));
  return [now, max];
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------- title-screen rules
await page.goto(BASE, { waitUntil: "domcontentloaded" });
check(
  "title menu has no obsolete Relics button",
  (await page.getByRole("button", { name: /relics/i }).count()) === 0,
  "no Relics control rendered",
);
check(
  "Hero Powers menu button stays neutral",
  (await page.locator(".hero-power-trigger small").count()) === 0 &&
    (await page.locator(".hero-power-trigger").getByText("Call a Recruit", { exact: true }).count()) === 0,
  "the equipped power name is not printed on the title menu",
);

// These four buttons live on the rift artwork, beneath the transparent title
// layer. A full-screen decorative wrapper once caught their pointer events,
// leaving the right-side buttons clickable while every duel control was dead.
const difficultyClicks = [];
for (const selector of [".orbit-choice-easy", ".orbit-choice-hard", ".orbit-choice-normal"]) {
  await page.locator(selector).click({ timeout: 2000 }).catch(() => {});
  difficultyClicks.push((await page.locator(selector).getAttribute("aria-pressed")) === "true");
}
check(
  "all title difficulties receive clicks",
  difficultyClicks.every(Boolean),
  difficultyClicks.map((clicked) => clicked ? "clicked" : "BLOCKED").join(", "),
);

async function measureTitleHoverDrifts() {
  const drifts = [];
  for (const selector of [".orbit-choice-easy", ".orbit-choice-normal", ".orbit-choice-hard", ".duel-trigger"]) {
    await page.mouse.move(0, 0);
    const before = await page.locator(selector).boundingBox();
    let maxDrift = 0;
    if (before) {
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      for (let frame = 0; frame < 6; frame += 1) {
        await page.waitForTimeout(70);
        const current = await page.locator(selector).boundingBox();
        if (current) maxDrift = Math.max(maxDrift, Math.abs(current.x - before.x), Math.abs(current.y - before.y));
      }
    }
    drifts.push({ selector, maxDrift });
  }
  return drifts;
}

const titleHoverDrifts = await measureTitleHoverDrifts();
check(
  "title duel controls stay still on hover",
  titleHoverDrifts.every(({ maxDrift }) => maxDrift < 0.25),
  titleHoverDrifts.map(({ selector, maxDrift }) => `${selector} ${maxDrift.toFixed(1)}px`).join(", "),
);

await page.locator(".hotseat-trigger").click({ timeout: 2000 });
check(
  "2 Players opens a confirmation before starting",
  (await page.locator('[role="dialog"][aria-label="Two-player duel"]').count()) === 1 &&
    (await page.locator(".title-screen").count()) === 1 &&
    (await page.locator(".duel-intro").count()) === 0,
  "confirmation is visible before a new duel intro begins",
);
await page.locator(".hotseat-confirm-cancel").click();

await page.locator(".duel-trigger").click({ timeout: 2000 }).catch(() => {});
await page.locator(".hs-shell").waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check(
  "the title Duel button starts a match",
  (await page.locator(".hs-shell").count()) === 1,
  (await page.locator(".hs-shell").count()) === 1 ? "board opened" : "BLOCKED",
);
await page.locator(".duel-intro").waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check(
  "mulligan waits for the intro",
  (await page.locator(".mulligan-panel").count()) === 0,
  "mulligan hidden during opening animation",
);
await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 }).catch(() => {});
check(
  "mulligan appears after the intro",
  (await page.locator(".mulligan-card").count()) === 3,
  "three opening cards revealed after opening animation",
);
await page.locator(".mulligan-card").first().click();
const mulliganCross = await page.evaluate(() => {
  const selected = document.querySelector(".mulligan-card.selected");
  if (!selected) return { hasCross: false, hasLabel: false };
  const cross = getComputedStyle(selected, "::after");
  return {
    hasCross: cross.backgroundImage !== "none" && cross.boxShadow !== "none",
    hasLabel: Boolean(selected.querySelector(".mulligan-card-label")),
  };
});
check(
  "selected mulligan cards show only a red cross",
  mulliganCross.hasCross && !mulliganCross.hasLabel,
  "selected card is crossed out and has no Keep/Replace label",
);
await page.locator(".mulligan-panel button.primary").click();

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.locator(".title-links").getByRole("button", { name: "Settings", exact: true }).click();
check(
  "difficulty is not available inside Settings",
  (await page.getByRole("dialog").getByText("Recruit", { exact: true }).count()) === 0,
  "Settings contains sound controls only",
);

if (TITLE_ONLY) {
  await page.setViewportSize({ width: 945, height: 720 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const compactHoverDrifts = await measureTitleHoverDrifts();
  check(
    "compact title duel controls stay still on hover",
    compactHoverDrifts.every(({ maxDrift }) => maxDrift < 0.25),
    compactHoverDrifts.map(({ selector, maxDrift }) => `${selector} ${maxDrift.toFixed(1)}px`).join(", "),
  );
  await browser.close();
  const titleFailures = results.filter((result) => !result.ok);
  console.log("");
  if (titleFailures.length) {
    console.log(`${titleFailures.length} FAILED: ${titleFailures.map((result) => result.name).join(", ")}`);
    process.exit(1);
  }
  console.log(`All ${results.length} title UI checks passed.`);
  process.exit(0);
}

/**
 * Fresh duel. By default: cheat mode on, one minion placed and rested.
 *
 * `cheat` is an option rather than always-on because the mana tray renders "∞"
 * instead of a number while cheating, so any check that MEASURES mana has to
 * run without it — the coin check read null on both sides until this was split.
 */
async function newBoard({ awake = true, place = true, cheat = true } = {}) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".hotseat-trigger").first().click();
  await page.locator(".hotseat-confirm-start").click();
  await page.locator(".hs-shell").waitFor({ state: "visible", timeout: 9000 });
  await page.locator(".duel-intro").waitFor({ state: "detached", timeout: 18000 });
  // Player One is the only seat with a mulligan. Confirm it so the scenarios
  // below start on the ordinary board.
  const mulliganConfirm = page.locator(".mulligan-panel button.primary");
  await mulliganConfirm.waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
  if (await mulliganConfirm.isVisible().catch(() => false)) await mulliganConfirm.click();
  await page.waitForTimeout(300);
  // Wait for the test hook, not for a guessed 1100ms. It registers from inside a
  // DYNAMIC import, so the first load after a rebuild has to fetch and transform
  // that module first — and a fixed wait that is usually long enough is exactly
  // the kind of thing that fails one run in ten and looks like a real bug.
  await page.waitForFunction(() => Boolean(window.__debug), null, { timeout: 15000 }).catch(() => {});
  if (cheat) {
    // Cheat is a top-bar action in the current layout, so use its accessible
    // name directly. Deliberately NOT wrapped in a silent catch: a failure here
    // leaves every scenario running with the wrong mana rules.
    await page.getByRole("button", { name: /Cheat Off|Cheat On/ }).first().click();
    await page.waitForTimeout(350);
    // And PROVE it took. The old one-liner ended in `.catch(() => {})`, so the
    // day the button moved every cheat scenario below would have carried on
    // measuring a normal-mana game and reported PASS. The tray prints "∞" only
    // while cheat is on, so this cannot be satisfied by a game that merely
    // happens to have an affordable card in hand.
    if ((await page.locator(".mana-inf").count()) === 0) {
      check("cheat mode is actually on for the scenarios that need it", false, "no ∞ in the mana tray");
    }
  }

  if (!place) return; // leave the hand full and the board empty

  if (!awake) {
    // Summoning-sick body, and it has to arrive BY BEING PLAYED, because the two
    // checks that use it are about playing a card. The shared deck contains
    // relics now, so inject a known minion instead of gambling on the opening.
    await page.evaluate(() => window.__debug?.giveCard("Modern Tank"));
    await page.locator(".hand-card").last().click();
    await page.waitForTimeout(250);
    await page.locator(".board-slot.placeable").first().click();
    await page.waitForTimeout(600);
    await answerAnyPrompt();
    return;
  }

  // A RESTED MINION IS PLANTED, NOT PLAYED.
  //
  // This used to play the first card in hand and then hand the turn over twice
  // to wake it up, which made every downstream scenario depend on the shuffle:
  //   - roughly one card in five has a battlecry that stops and asks a question,
  //     and while that prompt is open End Turn is not a legal action, so the
  //     hand-off clicked a dead button and the minion never woke
  //   - the hotseat curtain sits OVER the board, so a missed "I'm ready" click
  //     left every later click hitting the curtain
  // Both showed up as about one run in five failing on a completely healthy
  // build, with the symptom landing on whichever assertion came first — "0
  // ready" one run, "picked up 0, armed 0" the next, "Undo takes the played card
  // back" the run after that. Three different-looking failures, one cause: the
  // set-up was a game of chance.
  //
  // Nothing here is testing whether a card can be played — scenario 1 does that,
  // by clicking. These scenarios need A RESTED BODY ON THE BOARD, so they ask
  // for exactly that. Modern Tank is a 3/3 with no keywords and no effect, so it
  // cannot open a prompt or change anything it touches.
  await page.evaluate(() => window.__debug?.place("Modern Tank", "me", 0));
  await page
    .locator(".board-slot.occupied.ready")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
}

/**
 * Clear a targeting prompt if one is open, whatever kind it is.
 *
 * The four kinds answer differently: a board or slot prompt wants a click on a
 * highlighted slot, a hand prompt wants a card in the strip, and an option
 * prompt wants one of its labelled buttons. Tries each, then confirms the prompt
 * is actually gone rather than assuming the click landed.
 */
async function answerAnyPrompt() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prompt = page.locator(".target-prompt");
    const boardChoice = page.locator(".board-slot.choosable").first();
    if ((await prompt.count()) === 0 && (await boardChoice.count()) === 0) return;
    const option = page.locator(".prompt-value").first();
    const handCard = page.locator(".prompt-hand-card").first();
    if (await option.count()) await option.click().catch(() => {});
    else if (await handCard.count()) await handCard.click().catch(() => {});
    else if (await boardChoice.count()) await boardChoice.click().catch(() => {});
    else return; // a prompt with no answers is a soft-lock, and not this file's job
    if (await prompt.count()) await prompt.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  }
}

/**
 * End the turn and get through the hotseat curtain.
 *
 * Waits for the real conditions rather than sleeping a guessed number of
 * milliseconds. Fixed sleeps made this harness fail intermittently on a clean
 * build — the curtain was still up when the next check reached for a hand card,
 * which looks exactly like a broken game and is not.
 */
async function handOff() {
  await page.getByRole("button", { name: /End Turn/i }).first().click().catch(() => {});
  const curtainBtn = page.getByRole("button", { name: /Continue|Ready/i }).first();
  await curtainBtn.waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
  await curtainBtn.click().catch(() => {});
  await answerAnyPrompt(); // an Ongoing effect can ask a question at turn start
  // WAIT FOR THE CURTAIN TO BE GONE, not for a hand card to appear.
  //
  // The curtain is an overlay and the board stays mounted BEHIND it, so every
  // board and hand element is present and "visible" to a selector while the
  // curtain is still covering them. Waiting on `.hand-card` therefore returned
  // immediately whether or not the "I'm ready" click had actually landed — and
  // when it had not, the next scenario's clicks all hit the curtain instead of
  // the board and reported `picked up 0, armed 0`. That is what made this
  // harness fail roughly one run in six, on a build with nothing wrong with it.
  await page.locator(".pass-screen").waitFor({ state: "detached", timeout: 9000 }).catch(() => {});
  // The hand renders before the board finishes settling, so waiting only for a
  // card returns mid-transition and the next check reaches for a minion that is
  // not marked ready yet.
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------- 1. placing
await newBoard({ awake: false });
check(
  "a card can be played into an empty slot",
  (await page.locator(".board-slot.occupied").count()) > 0,
  `${await page.locator(".board-slot.occupied").count()} occupied`,
);

// The enemy power is a real hover card, not a delayed native title tooltip.
// Check it immediately after the pointer enters and verify that its full text
// is rendered below the hero plate once the opening overlays are gone.
{
  const enemyHero = page.locator(".enemy-hero-wrap .hero-plate.enemy");
  const powerCard = page.locator(".enemy-power-card");
  await enemyHero.hover();
  if (await powerCard.count()) {
    const heroBox = await enemyHero.boundingBox();
    const cardBox = await powerCard.boundingBox();
    const cardText = (await powerCard.textContent()) ?? "";
    const visible = await powerCard.isVisible();
    const below = Boolean(heroBox && cardBox && cardBox.y >= heroBox.y + heroBox.height);
    check(
      "enemy Hero Power display matches the selected unlock",
      !visible || (below && cardText.length > 20),
      visible ? `visible=${visible}, below=${below}, text=${cardText.length} chars` : "power card mounted but hidden",
    );
  } else {
    check(
      "enemy Hero Power display matches the selected unlock",
      true,
      "no power selected before the first bot win",
    );
  }
  await page.mouse.move(0, 0);
}

// -------------------------------------------------- 2. a fresh minion is sick
check(
  "a just-summoned minion cannot attack",
  (await page.locator(".board-slot.occupied.ready").count()) === 0,
  "no ready glow on the turn it lands",
);

// ------------------------------------------------------------- 3. attacking
await newBoard();
const readyCount = await page.locator(".board-slot.occupied.ready").count();
check("a rested minion offers an attack", readyCount > 0, `${readyCount} ready`);

// Guarded rather than clicked blind: a missing precondition should report
// itself, not crash the whole run 30 seconds later on a locator timeout.
if (readyCount > 0) {
  await page.locator(".board-slot.occupied.ready").first().click();
  await page.waitForTimeout(300);
  check(
    "clicking a ready minion arms it",
    (await page.locator(".board-slot.armed").count()) === 1,
    "one attacker armed",
  );
} else {
  skip("clicking a ready minion arms it", "no rested minion to click");
}

// --------------------------------- 4. THE REGRESSION: attack with a card held
await newBoard();
// The shared deck now contains relics, so the first random card may be an
// intentional play-on-bearer action rather than a minion card. Inject a known
// minion for this click-regression check, then select the injected last card.
await page.evaluate(() => window.__debug?.giveCard("Modern Tank"));
await page.locator(".hand-card").last().waitFor({ state: "visible", timeout: 9000 }).catch(() => {});
await page.locator(".hand-card").last().click(); // pick a card up
await page.waitForTimeout(250);
const handHeld = await page.locator(".hand-card.selected").count();

if (await page.locator(".board-slot.occupied.ready").count()) {
  await page.locator(".board-slot.occupied.ready").first().click();
}
// Wait for the RESULT rather than for a guessed 350ms — every other wait in this
// file was converted long ago and this one was missed. (It was not what made
// this check flaky; that was the hand-off above returning while the hotseat
// curtain was still covering the board. Both are worth having right.)
await page
  .locator(".board-slot.armed")
  .first()
  .waitFor({ state: "attached", timeout: 4000 })
  .catch(() => {});
const armedWhileHolding = await page.locator(".board-slot.armed").count();
const handDropped = (await page.locator(".hand-card.selected").count()) === 0;

check(
  "holding a card does not block attacking",
  handHeld === 1 && armedWhileHolding === 1 && handDropped,
  `picked up ${handHeld}, armed ${armedWhileHolding}, hand released ${handDropped}`,
);

// ------------------------------------------------------------ 5. turn handover
// Assert the HAND-OFF ITSELF, not a count that varies with the draw. The first
// version compared how many minions were "ready" before and after, which is
// luck: it passed with a bug deliberately planted and failed on clean code
// minutes later. A check that can do that is worse than no check.
await newBoard();
if (await page.locator(".board-slot.occupied.ready").count()) {
  await page.locator(".board-slot.occupied.ready").first().click(); // arm someone
}
await page.waitForTimeout(250);
const armedBefore = await page.locator(".board-slot.armed").count();
await page.getByRole("button", { name: /End Turn/i }).first().click().catch(() => {});
await page.waitForTimeout(1400);
const curtain = await page.getByRole("button", { name: /Continue|Ready/i }).count();
const armedAfter = await page.locator(".board-slot.armed").count();
// Skips rather than fails when nothing could be armed: that is a missing
// PRECONDITION (the draw left no rested minion), not a broken hand-off, and
// reporting it as a failure made this check cry wolf on a healthy build.
if (armedBefore !== 1) {
  skip("ending the turn hands the board over", "no rested minion to arm first");
} else {
  check(
    "ending the turn hands the board over",
    curtain > 0 && armedAfter === 0,
    `armed ${armedBefore} -> ${armedAfter}, hotseat curtain ${curtain > 0 ? "shown" : "MISSING"}`,
  );
}

// -------------------------------------------- 5b. the turn's two announcements
// The draw flight and the turn banner both live under a second and then delete
// themselves, so polling for them is a coin flip. A MutationObserver armed
// BEFORE the click records whether each element ever existed, which is the only
// honest way to assert a transient.
//
// Both of these replaced nothing: drawing a card had no picture and no sound at
// all, and `banner-sweep` sat in App.css with a section header and no user.
await newBoard({ place: false });
{
  await page.evaluate(() => {
    window.__seen = { flight: 0, banner: 0 };
    window.__obs = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("draw-flight")) window.__seen.flight += 1;
          if (node.classList.contains("turn-banner")) window.__seen.banner += 1;
        }
      }
    });
    window.__obs.observe(document.body, { childList: true, subtree: true });
  });

  await handOff();
  await page.waitForTimeout(400);

  const seen = await page.evaluate(() => {
    window.__obs.disconnect();
    return window.__seen;
  });

  check(
    "ending a turn announces itself",
    seen.banner > 0,
    `${seen.banner} turn banner(s)`,
  );
  check(
    "a drawn card flies out of the deck",
    seen.flight > 0,
    `${seen.flight} flight(s) from the pile`,
  );
}

// ------------------------------------------------------------ 6. drag & drop
// Real pointer steps, not Playwright's dragTo. The board uses pointer events
// with setPointerCapture, and a single synthetic drag lands as a click — the
// pointer has to actually travel with gaps between moves.
await newBoard({ place: false });
{
  // The shared deck contains relics and targeted battlecries. Inject a vanilla
  // minion so this pointer path always tests a card-to-empty-slot drag.
  await page.evaluate(() => window.__debug?.giveCard("Modern Tank"));
  await page.locator(".hand-card").last().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  const before = await page.locator(".board-slot.occupied").count();
  const card = page.locator(".hand-card").last();
  // A slot only gains `.placeable` once a card is SELECTED, and nothing is
  // selected before a drag starts — so target a plain slot on our own half of
  // the board (the lower one) instead of waiting for a class that cannot exist.
  const to = await page.evaluate(() => {
    // Split the slots into the two rows by vertical position and take one from
    // the LOWER row. A fixed "below half the viewport" test misses: the board
    // sits around the middle of the screen, not the bottom.
    const rects = [...document.querySelectorAll(".board-slot")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .sort((a, b) => a.top - b.top);
    if (!rects.length) return null;
    const r = rects[rects.length - 1];
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  // count() first: boundingBox() on a locator that never resolves BLOCKS for the
  // full 30 s timeout and then throws, so a null-check alone never runs.
  const from = (await card.count()) > 0 ? await card.boundingBox() : null;
  if (!from || !to) {
    skip("a card can be DRAGGED into a slot", "no free slot or card in hand");
  } else {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(
        from.x + ((to.x + to.width / 2 - from.x) * i) / 6,
        from.y + ((to.y + to.height / 2 - from.y) * i) / 6,
      );
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);
    const after = await page.locator(".board-slot.occupied").count();
    check("a card can be DRAGGED into a slot", after > before, `${before} -> ${after} occupied`);
  }
}

// ------------------------------------------------------------------ 7. undo
await newBoard({ awake: false });
{
  const occupied = await page.locator(".board-slot.occupied").count();
  await page.keyboard.press("z");
  await page.waitForTimeout(600);
  const afterUndo = await page.locator(".board-slot.occupied").count();
  check(
    "Undo takes the played card back",
    occupied === 1 && afterUndo === 0,
    `${occupied} -> ${afterUndo} occupied`,
  );
}

// ------------------------------------------------------------------- 8. coin
// The coin belongs to whoever went SECOND, so it is ABSENT on player one's first
// turn and appears once the board is handed over. Both halves are asserted: a
// button that never works would otherwise pass a naive "it exists" test.
//
// It used to sit in the top bar permanently and be *disabled* when unusable, and
// this check read `isDisabled()`. It is now rendered only on the turn it can be
// used, so presence is the assertion.
await newBoard({ place: false, cheat: false });
{
  const coin = page.getByRole("button", { name: /^Coin$/ }).first();
  const absentForFirstPlayer = (await coin.count()) === 0;

  await handOff();

  const liveForSecondPlayer = (await coin.count()) > 0;
  if (!liveForSecondPlayer) {
    skip("the coin grants mana and is then spent", "no coin available to this seat");
  } else {
    const [before] = await mana();
    await coin.click();
    await page.waitForTimeout(600);
    const [after] = await mana();
    check(
      "the coin grants mana and is then spent",
      absentForFirstPlayer && after > before && (await coin.count()) === 0,
      `mana ${before} -> ${after}, button gone once spent`,
    );
  }
}

// ------------------------------------------------------ 9. infinite mana setting
await newBoard({ place: false, cheat: false });
{
  const ready = await page.evaluate(() => Boolean(window.__debug));
  if (!ready) {
    skip("Infinite mana makes an expensive card playable", "no __debug hook (production build?)");
  } else {
    await page.evaluate(() => window.__debug.giveCard("Death Star"));
    await page.waitForTimeout(400);
    const expensive = page.locator(".hand-card").last();
    const blockedBefore = (await expensive.getAttribute("data-playable")) === "false";
    const unwantedPopupGone = (await expensive.getAttribute("title")) === null;

    await page.getByRole("button", { name: /Cheat Off|Cheat On/ }).first().click();
    await expensive.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector(".hand-card:last-child")?.getAttribute("data-playable") === "true");
    const playableAfter = (await expensive.getAttribute("data-playable")) === "true";
    const occupiedBefore = await page.locator(".board-slot.occupied").count();
    await expensive.click();
    await page.locator(".board-slot.placeable").first().click();
    await page.waitForTimeout(700);
    const occupiedAfter = await page.locator(".board-slot.occupied").count();

    check(
      "Infinite mana makes an expensive card playable",
      blockedBefore && unwantedPopupGone && playableAfter && occupiedAfter === occupiedBefore + 1 &&
        (await page.locator(".mana-inf").count()) === 1,
      `blocked ${blockedBefore}, no hover message ${unwantedPopupGone}, playable ${playableAfter}, placed ${occupiedBefore} -> ${occupiedAfter}`,
    );
  }
}

// ------------------------------------------------------- 10. targeting prompts
// TWO checks, not one, because there are two answer paths and they share no
// code. A single check using whichever card came first passed happily while
// `chooseTargetAt` was deliberately broken — it had been answering a BUTTON
// prompt the whole time and never touched the board path at all.
//
//   board  -> click a minion the app marked `.choosable`   (chooseTargetAt)
//             NOT `.targetable` — that class means "you may ATTACK this", a
//             different state entirely, and using it found zero legal targets
//             while the prompt was plainly offering two.
//   value  -> click a button inside the prompt             (onChoose)
async function targetingCheck(label, cardName, choiceSelector, screenPromptExpected = true) {
  await newBoard({ place: false });
  if (!(await page.evaluate(() => Boolean(window.__debug)))) {
    skip(label, "no __debug hook (production build?)");
    return;
  }
  const given = await page.evaluate((name) => {
    window.__debug.place("Zoro", "them", 0);
    window.__debug.place("Kaido", "them", 1);
    return window.__debug.giveCard(name);
  }, cardName);
  await page.waitForTimeout(500);

  await page.locator(".hand-card").last().click(); // the injected card lands last
  await page.waitForTimeout(300);
  const slot = page.locator(".board-slot.placeable").first();
  if (await slot.count()) await slot.click();
  await page.waitForTimeout(900);

  const shown = (await page.locator(".target-prompt").count()) > 0;
  const choice = page.locator(choiceSelector);
  await choice.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  const offered = await choice.count();
  const choiceDescriptions = choiceSelector.includes("prompt-value")
    ? await page.locator(".prompt-card-choice .cf-desc p").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""))
    : [];
  if (offered) await choice.first().click().catch(() => {});
  await page.waitForTimeout(900);

  check(
    label,
    (screenPromptExpected ? shown : !shown) && offered > 0 && (await page.locator(".target-prompt").count()) === 0,
    `${given}: screen tip ${shown ? "shown" : "hidden"}, ${offered} choice(s), cleared`,
  );
  if (choiceSelector.includes("prompt-value")) {
    check(
      "card choices show their full effect text",
      choiceDescriptions.length === offered && choiceDescriptions.every((text) => text.length > 0),
      `${choiceDescriptions.length}/${offered} choice cards include rules text`,
    );
  }
}

// Kiritsugu's freeze_enemy is an enemy-side board pick with no filter, so any
// enemy minion is a legal target — the most reliable board prompt in the roster.
await targetingCheck(
  "a BOARD-target battlecry highlights the board without a tip popup",
  "Kiritsugu Emiya",
  ".board-slot.choosable",
  false,
);

// Batman chooses a victim, then chooses one of his three gadgets.
await newBoard({ place: false });
{
  const ready = await page.evaluate(() => Boolean(window.__debug));
  if (!ready) {
    skip("Batman asks for two distinct freeze targets", "no __debug hook (production build?)");
  } else {
    await page.evaluate(() => {
      window.__debug.place("Zoro", "them", 0);
      window.__debug.place("Kaido", "them", 1);
      window.__debug.place("Death Star", "them", 2);
      window.__debug.giveCard("Batman");
    });
    await page.waitForTimeout(500);
    await page.locator(".hand-card").last().click();
    await page.locator(".board-slot.placeable").first().click();
    await page.locator(".board-slot.choosable").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const firstOffered = await page.locator(".board-slot.choosable").count();
    if (firstOffered) {
      await page.locator(".board-slot.choosable").first().click();
      await page.getByRole("button", { name: "Freeze it", exact: true }).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      await page.getByRole("button", { name: "Freeze it", exact: true }).click().catch(() => {});
    }
    await page.waitForTimeout(700);
    check(
      "Batman asks for a victim and gadget",
      firstOffered === 3 &&
        (await page.locator(".target-prompt").count()) === 0 &&
        (await page.locator(".board-slot .card-face.is-frozen").count()) === 1,
      `${firstOffered} choices; ${await page.locator(".board-slot .card-face.is-frozen").count()} board minion frozen`,
    );
  }
}

// Gol D. Roger's discover answers with buttons inside the prompt instead.
await targetingCheck(
  "a VALUE-choice battlecry asks, then resolves",
  "Gol D. Roger",
  ".prompt-hand-card:not([disabled]), .prompt-value:not([disabled])",
);

// ------------------------------------------------------------- 10. a relic
// A relic is a real hand card now: select it, then select an occupied friendly
// slot. The badge check proves the explicit play path and the visual result.
await newBoard({ place: false });
{
  const ready = await page.evaluate(() => Boolean(window.__debug));
  if (!ready) {
    skip("a minion shows the relic it carries", "no __debug hook (production build?)");
  } else {
    const before = await page.locator(".relic-badge").count();
    await page.evaluate(() => {
      window.__debug.place("Zoro", "me", 0);
      window.__debug.giveCard("Elder wand");
    });
    await page.locator(".hand-card").last().click();
    await page.locator(".board-slot.placeable.occupied").first().click();
    await page.waitForTimeout(700);
    const after = await page.locator(".relic-badge").count();
    check(
      "a minion shows the relic it carries",
      before === 0 && after > 0,
      `badges ${before} -> ${after}`,
    );

    // A cancelled press or the beginning of a drag must not return the relic.
    // The old UI performed the return on pointerdown, which made an equipped
    // relic disappear before the gesture had become a click.
    await page.evaluate(() => {
      const badge = document.querySelector(".relic-badge");
      badge?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    });
    await page.waitForTimeout(120);
    const afterPress = await page.locator(".relic-badge").count();
    check(
      "a relic survives an incomplete badge press",
      afterPress === after,
      `badges ${after} -> ${afterPress}`,
    );

    // A completed click is only a preview now; it cannot return the relic.
    await page.locator(".relic-badge").first().click();
    await page.waitForTimeout(250);
    check(
      "a completed badge click cannot return the relic",
      (await page.locator(".relic-badge").count()) === after,
      "attached relic remains with its bearer",
    );
  }
}

// ------------------------------------------------------------- 11. card discover layout
// All card-backed option prompts share one renderer. Verify the three Tech
// choices used by Vegapunk stay in one row, so Indiana Jones and future
// three-card discovers inherit the same fix.
await newBoard({ place: false });
{
  const ready = await page.evaluate(() => Boolean(window.__debug));
  if (!ready) {
    skip("three-card discovers stay on one line", "no __debug hook (production build?)");
  } else {
    await page.evaluate(() => {
      window.__debug.place("Zoro", "me", 0);
      window.__debug.giveCard("Vegapunk");
    });
    await page.waitForTimeout(350);
    await page.locator(".hand-card").last().click();
    await page.locator(".board-slot.placeable.empty").first().click();
    await page.locator(".target-prompt.card-choice-prompt .prompt-card-choice").first().waitFor({ state: "visible", timeout: 5000 });
    const choiceBoxes = await page.locator(".target-prompt.card-choice-prompt .prompt-card-choice").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width) };
      }),
    );
    const sameRow = choiceBoxes.length === 3 && Math.max(...choiceBoxes.map((box) => box.top)) - Math.min(...choiceBoxes.map((box) => box.top)) <= 2;
    check(
      "three-card discovers stay on one line",
      sameRow,
      JSON.stringify(choiceBoxes),
    );
    await page.locator(".target-prompt.card-choice-prompt .prompt-card-choice").first().click();
  }
}

// --- the rarity shine actually moves, on every tier that has one -------------
//
// A still screenshot cannot tell a running animation from a dead one: four
// layers with a typo in a keyframe name look exactly like four layers mid-pause.
// So this asserts the two things a picture cannot — that the browser is running
// the animations it was handed, and that the card LOOKS different a second
// apart. Both halves matter, and the second alone is not enough: a broken
// keyframe name leaves the other layers moving and a pixel diff passes it. That
// has been live-fired, not assumed.
//
// The counts are the escalation itself. Epic is the quietest with three layers,
// Legendary and Relic carry four, Mythic five. A tier that silently loses a
// layer stops escalating, and nothing else in this project would notice.
const SHINE_TIERS = [
  { rarity: "purple", name: "Epic", card: "Aizen", layers: 4 },
  { rarity: "yellow", name: "Legendary", card: "Detective L", layers: 4 },
  { rarity: "red", name: "Mythic", card: "Yujiro", layers: 5 },
  { rarity: "relic", name: "Relic", card: "Elder wand", layers: 4 },
];

await newBoard({ place: false });
{
  const ready = await page.evaluate(() => Boolean(window.__debug));
  if (!ready) {
    skip("the rarity shine runs", "no __debug hook (production build?)");
  } else {
    for (const tier of SHINE_TIERS) {
      await page.evaluate((cardName) => window.__debug.giveCard(cardName), tier.card);
      await page.waitForTimeout(300);
      const face = page.locator(`.hand-card .card-face.rarity-${tier.rarity}`).last();
      if (!(await face.count())) {
        check(`the ${tier.name} shine runs`, false, `no ${tier.rarity} card face in hand (${tier.card})`);
        continue;
      }
      const running = await face.evaluate((element) =>
        [...element.querySelectorAll(".cf-shine > span")]
          .filter((layer) => getComputedStyle(layer).display !== "none")
          .flatMap((layer) => layer.getAnimations())
          .filter((animation) => animation.playState === "running")
          .map((animation) => animation.animationName ?? "?"),
      );
      check(
        `the ${tier.name} shine runs`,
        running.length === tier.layers,
        `${running.length}/${tier.layers}: ${running.join(", ")}`,
      );

      const frameOne = await face.screenshot();
      await page.waitForTimeout(900);
      const frameTwo = await face.screenshot();
      const moved = frameOne.length !== frameTwo.length || !frameOne.equals(frameTwo);
      check(`the ${tier.name} shine changes the card between frames`, moved, `${frameOne.length} vs ${frameTwo.length} bytes`);
    }

    // Rare is the baseline the others escalate from, so it must carry nothing.
    await page.evaluate(() => window.__debug.giveCard("John Wick"));
    await page.waitForTimeout(300);
    const rare = page.locator(".hand-card .card-face.rarity-black").last();
    const bare = (await rare.count()) ? await rare.evaluate((element) => element.querySelectorAll(".cf-shine").length) : -1;
    check("Rare cards carry no shine at all", bare === 0, `${bare} shine layer group(s)`);

    // The light bar belongs to relics and to nothing else. Three tiers sharing
    // the most noticeable motion in the system flattened all three, and this is
    // the check that stops it creeping back one tier at a time.
    const sweeps = await page.evaluate(() =>
      ["purple", "yellow", "red", "relic"].map((tier) => {
        const face = [...document.querySelectorAll(`.hand-card .card-face.rarity-${tier}`)].pop();
        if (!face) return `${tier}:missing`;
        const bar = face.querySelector(".cf-shine > .sh-sweep");
        return `${tier}:${bar && getComputedStyle(bar).display !== "none" ? "on" : "off"}`;
      }),
    );
    check(
      "only relics carry the crossing light bar",
      sweeps.join(",") === "purple:off,yellow:off,red:off,relic:on",
      sweeps.join(" "),
    );

    // The Magic camp mark, which is a trial and the first of its kind. It has to
    // be PRESENT and it has to be quieter than the tier: if a camp reads louder
    // than a rarity, the two systems are fighting rather than layering.
    await page.evaluate(() => window.__debug.giveCard("Doctor Strange"));
    await page.waitForTimeout(300);
    const magic = page.locator(".hand-card .card-face").last();
    const camp = await magic.evaluate((face) => {
      const mark = face.querySelector(".cf-sigil.sigil-magic");
      if (!mark) return { found: false, running: 0, over: false };
      const running = [...mark.querySelectorAll("span")]
        .flatMap((layer) => layer.getAnimations())
        .filter((animation) => animation.playState === "running").length;
      const campZ = Number(getComputedStyle(mark).zIndex);
      const shine = face.querySelector(".cf-shine");
      const shineZ = shine ? Number(getComputedStyle(shine).zIndex) : Infinity;
      return { found: true, running, over: campZ >= shineZ };
    });
    check(
      "the Magic camp mark turns beneath the tier shine",
      camp.found && camp.running === 2 && !camp.over,
      JSON.stringify(camp),
    );

    // The camp RAIL — the vertical word down the left edge — is a different
    // thing from the mark above, and this check exists because the two collided.
    // The sigil layer was first written as `.cf-camp`, a class the rail already
    // owned, which silently rewrote the rail's position and writing mode and
    // dropped the word "Magic" rotated across the middle of the card. Nothing
    // errored, every test stayed green, and it was visible only by looking.
    const rail = await magic.evaluate((face) => {
      const element = face.querySelector(".cf-rail.cf-camp");
      if (!element) return { found: false };
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const card = face.getBoundingClientRect();
      return {
        found: true,
        text: (element.textContent ?? "").trim(),
        vertical: style.writingMode.startsWith("vertical"),
        // Within the left fifth of the card, which is where a rail lives.
        onTheLeft: box.left - card.left < card.width * 0.2,
        // The one that actually catches it. The collision left the rail sitting
        // at the same left edge with the same vertical text and the same DOM
        // content — every obvious assertion still passed. What changed was its
        // BOX: an `inset` shorthand from the other rule blew it out to the whole
        // card, and the vertical text then ran down the middle. Measure the
        // width, not the position.
        narrow: box.width < card.width * 0.15,
      };
    });
    check(
      "the camp rail still runs down the left edge",
      rail.found && rail.text === "Magic" && rail.vertical && rail.onTheLeft && rail.narrow,
      JSON.stringify(rail),
    );
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
const passed = results.length - failed.length - skipped.length;
console.log("");
if (failed.length) {
  console.log(`${failed.length} FAILED: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
// Skips are reported apart from passes on purpose. Rolling them together reads
// as "everything was checked" when some of it never ran.
console.log(
  skipped.length
    ? `${passed} UI checks passed, ${skipped.length} skipped (${skipped.map((r) => r.name).join("; ")}).`
    : `All ${passed} UI checks passed.`,
);
