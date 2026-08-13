/**
 * Does any card's TEXT collide with anything on the card?
 *
 *   npm run check:cardface          (needs the dev server on :5177)
 *
 * WHY THIS EXISTS
 * ---------------
 * The card face has three text boxes and three gems, and the gems sit on top of
 * the boxes at the corners. Whether they touch depends on the card — the longest
 * name in the roster and the wordiest rules text are the only ones that get
 * anywhere near — so the shuffle decides whether a screenshot catches it. It has
 * been checked by hand three times now, each time after a change that moved one
 * of them, and each time the proof evaporated with the session:
 *
 *   - the cost gem grew 104 -> 240 units in hand, and the name reserve had to
 *     move with it
 *   - the cost gem moved to the LEFT corner in hand, so the reserve had to flip
 *   - the name switched from an arithmetic estimate to real glyph measurement,
 *     which allows a LARGER font than the estimate did, which reaches further
 *
 * Every one of those was a silent overlap waiting to happen on about four cards
 * out of 175. This measures instead of hoping.
 *
 * WHAT IT ASSERTS, per card, on the board and in hand:
 *   - the rendered name glyphs do not overlap the cost gem
 *   - the name does not spill past either edge of the card
 *   - the rules text does not overflow its plaque
 *   - the rules text does not overlap the attack or health gem
 *
 * It plants the worst cases through `window.__debug` rather than waiting for
 * them to be dealt — the same reason check-ui.mjs does.
 */
import { launch } from "./browser.mjs";

const BASE = process.argv[2] || "http://localhost:5177";

/** Longest names and longest rules text in the roster. */
const WORST = [
  // Longest names in the roster — they fight the cost gem for the top corner.
  "Giorno - Gold Experience Requiem",
  "Rennala Queen of the Full Moon",
  "Mastered Ultra Instinct Goku",
  // Wordiest rules text — it fights the plaque and the bottom gems.
  "Morpheus",
  "Dr. Heinz Doofenshmirtz",
  // A MEDIAN card too. Worst cases alone tell you nothing about the size a
  // typical card actually renders at, which is the number worth watching.
  "Furious Five",
  "Kojiro Sasaki",
  "The Nameless King",
];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
// Use the current title-screen control. The old `/Duel the/` label belonged to
// an earlier title screen and silently skipped starting the duel.
await page.getByRole("button", { name: /2 players|Start a hotseat/i }).first().click();
// Wait for the hook itself, not for a guessed 1200ms. `window.__debug` is
// registered from inside a DYNAMIC import, so the first page load after a
// rebuild has to fetch and transform that module before it appears — which took
// longer than the fixed wait and reported "no __debug hook, run this against the
// DEV server" on a dev server that was running perfectly.
await page
  .waitForFunction(() => Boolean(window.__debug), null, { timeout: 15000 })
  .catch(() => {});

const planted = await page.evaluate((names) => {
  if (!window.__debug) return false;
  names.slice(0, 5).forEach((n, i) => window.__debug.place(n, "me", i));
  // Plant the wordiest on the ENEMY side too, so that row is covered by the same
  // worst cases rather than by whatever the shuffle happened to deal there.
  names.slice(3, 8).forEach((n, i) => window.__debug.place(n, "them", i));
  names.forEach((n) => window.__debug.giveCard(n, "me"));
  return true;
}, WORST);

if (!planted) {
  console.error("no __debug hook — run this against the DEV server, not a production build");
  await browser.close();
  process.exit(1);
}
// Fonts decide every measurement here, and they load after the first paint.
await page.evaluate(() => document.fonts?.ready);
await page.waitForTimeout(900);

const rows = await page.evaluate(() => {
  const out = [];
  // FLATTEN THE FAN FIRST. Hand cards are rotated, and `getBoundingClientRect`
  // on a rotated element returns its AXIS-ALIGNED bounding box — which is wider
  // and taller than the element itself. Comparing two such boxes reports an
  // overlap between things that do not touch, and the error grows with the
  // rotation angle, so the outermost cards in the fan look worst. The first run
  // of this check "found" three collisions in hand that were entirely this.
  //
  // Whether a name sits under a crystal is a question about the card's own
  // geometry, which rotating the card cannot change, so measuring it upright is
  // measuring the real thing.
  for (const card of document.querySelectorAll(".hand-card")) {
    card.style.transform = "none";
    card.style.marginLeft = "0px";
  }
  /** The rectangle the GLYPHS occupy, not the padded element box. */
  const glyphs = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    range.detach();
    return r;
  };
  const overlap = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.5 && h > 0.5 ? +(w * h).toFixed(0) : 0;
  };
  /**
   * A gem's DRAWN shape, not its element box.
   *
   * The three gems are CSS masks — a diamond for cost, a heart for health, a
   * blade for attack — so each element box has large empty corners that nothing
   * is painted into. Comparing text against the raw box therefore reports a
   * collision whenever a letter enters a corner the player cannot see anything
   * in, which is how this check first "found" a 31-square-pixel overlap on a
   * card where the name and the crystal are visibly nowhere near each other.
   * The central 64% is inside all three silhouettes.
   */
  const drawn = (el) => {
    const r = el.getBoundingClientRect();
    const dx = r.width * 0.18;
    const dy = r.height * 0.18;
    return { left: r.left + dx, right: r.right - dx, top: r.top + dy, bottom: r.bottom - dy };
  };

  const scan = (root, where) => {
    if (!root) return;
    for (const face of root.querySelectorAll(".card-face")) {
      const nameEl = face.querySelector(".cf-name");
      const mana = face.querySelector(".cf-mana");
      const desc = face.querySelector(".cf-desc");
      const descP = desc?.querySelector("p");
      const atk = face.querySelector(".cf-atk");
      const hp = face.querySelector(".cf-hp");
      const stage = face.querySelector(".cf-stage");
      if (!nameEl || !mana || !stage || !nameEl.textContent.trim()) continue;
      const isVisible = (el) => el && getComputedStyle(el).display !== "none";

      const nameRect = glyphs(nameEl);
      const cardRect = stage.getBoundingClientRect();
      const row = {
        where,
        name: nameEl.textContent.trim(),
        nameOverManaPx: overlap(nameRect, drawn(mana)),
        nameSpillPx: +Math.max(cardRect.left - nameRect.left, nameRect.right - cardRect.right).toFixed(1),
        textOverflowPx: 0,
        textOverGemPx: 0,
        fontPx: 0,
      };
      if (descP && isVisible(desc)) {
        row.fontPx = +parseFloat(getComputedStyle(descP).fontSize).toFixed(1);
        // The plaque clips with overflow:hidden, so compare content to client.
        row.textOverflowPx = Math.max(0, desc.scrollHeight - desc.clientHeight);
        const textRect = glyphs(descP);
        for (const gem of [atk, hp]) {
          if (isVisible(gem)) row.textOverGemPx = Math.max(row.textOverGemPx, overlap(textRect, drawn(gem)));
        }
      }
      out.push(row);
    }
  };

  // BOTH rows. This scanned only `[1]`, the player's own row, so every card the
  // opponent had on the table sat outside the check — half the board, and the
  // half you spend most of a turn reading.
  scan(document.querySelectorAll(".board-row")[0], "enemy");
  scan(document.querySelectorAll(".board-row")[1], "board");
  scan(document.querySelector(".hand-fan"), "hand");
  return out;
});

const worstName = rows.reduce((a, r) => Math.max(a, r.nameOverManaPx), 0);
const worstSpill = rows.reduce((a, r) => Math.max(a, r.nameSpillPx), 0);
const worstOverflow = rows.reduce((a, r) => Math.max(a, r.textOverflowPx), 0);
const worstTextGem = rows.reduce((a, r) => Math.max(a, r.textOverGemPx), 0);
const fonts = rows.filter((r) => r.fontPx > 0).map((r) => r.fontPx);

check("no card name touches its cost gem", worstName === 0, `worst ${worstName}px^2 over ${rows.length} faces`);
check("no card name spills past the card edge", worstSpill <= 0.5, `worst ${worstSpill}px`);
// 2px, not 0. Sub-pixel layout rounding leaves a paragraph that exactly fills
// its plaque reporting a pixel of overflow no matter how much margin the fitter
// leaves — proven by widening it to 6% and watching the number not move. One
// line is ~14px at board size, so this still fails loudly the moment a real line
// is being cut, which is the thing worth catching.
check("no rules text overflows its plaque", worstOverflow <= 2, `worst ${worstOverflow}px of clipped text (tolerance 2)`);
check("no rules text runs under the ATK/HP gems", worstTextGem === 0, `worst ${worstTextGem}px^2`);
if (fonts.length) {
  console.log(`\n  rules text on board: ${Math.min(...fonts)}px (wordiest) to ${Math.max(...fonts)}px (shortest)`);
  for (const r of rows.filter((x) => x.where === "board" && x.fontPx > 0)) {
    console.log(`        ${String(r.fontPx).padStart(5)}px  ${r.name}`);
  }
}

for (const r of rows) {
  if (r.nameOverManaPx || r.nameSpillPx > 0.5 || r.textOverflowPx || r.textOverGemPx) {
    console.log(
      `        ${r.where} "${r.name}" name/mana ${r.nameOverManaPx} spill ${r.nameSpillPx} clipped ${r.textOverflowPx} text/gem ${r.textOverGemPx}`,
    );
  }
}

// ---------------------------------------------------------- off-screen sweep
//
// Three layout regressions in a row were "it fits at 1440x900" — the hand fan
// arced its outer cards down past the bottom edge, the fan slid over the health
// plate at ten cards, and the mana tray wrapped a crystal onto a second row. All
// of them were visible only at a size or a hand count nobody happened to shoot.
// Cheap to just check.
for (const [w, h] of [
  [1440, 900],
  [1366, 768],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(500);
  const off = await page.evaluate(() => {
    const out = [];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const seen = new Set();
    for (const [label, sel] of [
      ["hand card", ".hand-card"],
      ["board card", ".board-slot .card-face"],
      ["hero plate", ".hero-plate"],
      ["mana tray", ".mana-tray"],
      ["deck pile", ".deck-pile"],
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        const over = Math.max(r.bottom - vh, -r.top, r.right - vw, -r.left);
        if (over > 1 && !seen.has(label)) {
          seen.add(label);
          out.push(`${label} by ${over.toFixed(0)}px`);
        }
      }
    }
    return out;
  });
  check(`nothing falls off screen at ${w}x${h}`, off.length === 0, off.length ? off.join(", ") : "all inside");
}
await page.setViewportSize({ width: 1440, height: 900 });

// LEAVE NO SAVE BEHIND. This check plants minions through `window.__debug`, and
// the game persists after every change — so without this it hands the next
// harness a duel already in progress with five cards on the board. That is how a
// clean build reported "a card can be played into an empty slot" as a failure
// when run straight after this one.
await page.evaluate(() => localStorage.clear()).catch(() => undefined);

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED: ${failed.map((r) => r.name).join(", ")}` : "\nAll card-face checks passed.");
await browser.close();
process.exit(failed.length ? 1 : 0);
