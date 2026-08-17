/**
 * Rebuild the roster and relic data embedded in the project codex page,
 * `docs/Convergence Browser Game Roadmap.html`.
 *
 * Why this exists. The page used to carry a hand-written JSON snapshot of the
 * roster. Nobody regenerates a snapshot by hand, so every later session patched
 * it instead: by August 2026 it had grown an ad-hoc patch list re-labelling ten
 * cards on top of a blob that still described 20 relics, 40 ongoing engines and
 * a roster three cards short. The patch list was the evidence that the whole
 * blob was stale. The cure is that nothing about the roster is written into
 * that page by hand any more.
 *
 * Truth comes from three places, all of them the same files the game loads:
 *   - data/cards.csv    names, costs, stats, camps, alignments, effect text
 *   - data/relics.csv   the relic pool and its printed mana costs
 *   - src/engine/game.ts  TARGETED_EFFECTS, which decides what "targeted" means
 *
 * The page's prose is still written by hand and is NOT touched here. Only the
 * `var DATA = {...};` line is replaced.
 */

import fs from "node:fs";
import path from "node:path";

import { countBy, projectRoot, readCards, readRelics } from "./card-tools.mjs";

const codexPath = path.join(projectRoot, "..", "docs", "Convergence Browser Game Roadmap.html");
const enginePath = path.join(projectRoot, "src", "engine", "game.ts");

/** The page filters and colours by tier; the CSV stores the same thing as a rarity colour. */
const TIER = { Black: "Rare", Red: "Mythic", Yellow: "Legendary", Purple: "Epic" };

/**
 * Choice effects that pause outside `TARGETED_EFFECTS`.
 *
 * That table holds board-target specs. These three stop and ask too, but the
 * thing they ask you to point at is a card rather than a minion, so they never
 * appear in it. Without them the page would file three genuinely interactive
 * cards as "the effect runs automatically".
 */
const CARD_CHOICE_EFFECTS = new Set(["choose_relic", "discover_relic_self", "discover_random_keyword_minion"]);

/** A card whose whole printed effect is one of these is enforced structurally, not scripted. */
const BARE_KEYWORDS = new Set(["taunt", "chained", "divine shield", "charge", "passive", "ongoing"]);

/**
 * Read the effect ids that stop and ask, straight out of the engine.
 *
 * Deliberately not a second hand-written list: a list would be one more thing
 * that drifts, which is the failure this whole script exists to end.
 */
function targetedEffectIds() {
  const source = fs.readFileSync(enginePath, "utf8");
  const start = source.indexOf("export const TARGETED_EFFECTS");
  if (start < 0) throw new Error("TARGETED_EFFECTS not found in src/engine/game.ts");
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) throw new Error("TARGETED_EFFECTS object literal is unterminated");
  const body = source.slice(open + 1, end);
  const ids = new Set();
  for (const match of body.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) ids.add(match[1]);
  if (ids.size === 0) throw new Error("TARGETED_EFFECTS parsed to zero entries");
  return ids;
}

/** Which stripe the page draws on a card. */
function statusOf(card, targeted) {
  const effect = card.effect.trim();
  if (effect === "" || effect === "-") return "vanilla";
  if (targeted.has(card.effectId) || CARD_CHOICE_EFFECTS.has(card.effectId)) return "targeted";
  const sentences = effect
    .split(".")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (sentences.length > 0 && sentences.every((part) => BARE_KEYWORDS.has(part))) return "keyword";
  return "wired";
}

function build() {
  const targeted = targetedEffectIds();
  const cardRows = readCards();
  const relicRows = readRelics();

  const cards = cardRows.map((card) => ({
    id: card.id,
    n: card.name,
    c: Number(card.cost),
    a: Number(card.atk),
    h: Number(card.hp),
    r: card.rarity,
    t: TIER[card.rarity],
    camp: card.camp,
    al: card.alignment,
    kw: card.keywords.split(";").map((word) => word.trim()).filter(Boolean),
    eid: card.effectId,
    tim: card.effectTiming,
    e: card.effect,
    o: card.origin,
    s: statusOf(card, targeted),
    why: "",
    // The old snapshot flagged cards whose text promised a choice the engine
    // did not offer. Both cards that carried it have since been rewritten, and
    // validate-cards.mjs now fails the build on text/engine disagreement, so
    // the flag has no way to become true without someone noticing first.
    mm: false,
  }));

  for (const card of cards) {
    if (!card.t) throw new Error(`${card.n}: unknown rarity ${JSON.stringify(card.r)}`);
    if (!Number.isFinite(card.c) || !Number.isFinite(card.a) || !Number.isFinite(card.h)) {
      throw new Error(`${card.n}: cost, atk and hp must be numbers`);
    }
  }

  const relics = relicRows.map((relic) => ({
    id: relic.id,
    n: relic.name,
    c: Number(relic.cost),
    e: relic.effect,
    rid: relic.relicId,
    o: relic.origin,
    wired: true,
  }));

  const counts = { wired: 0, targeted: 0, keyword: 0, vanilla: 0 };
  for (const card of cards) counts[card.s] += 1;

  const curve = {};
  for (const cost of cards.map((card) => card.c).sort((a, b) => a - b)) {
    curve[String(cost)] = (curve[String(cost)] ?? 0) + 1;
  }

  // The cards that fire again at the start of every owner turn. Passive text is
  // continuously true rather than re-triggered, so it does not belong here.
  const engines = cards
    .filter((card) => card.tim === "ongoing" || card.tim === "onPlayAndOngoing")
    .map((card) => ({ n: card.n, c: card.c, a: card.a, h: card.h, eid: card.eid }))
    .sort((a, b) => a.c - b.c || a.n.localeCompare(b.n));

  const data = {
    cards,
    relics,
    counts,
    curve,
    campMix: countBy(cards, "camp"),
    alignMix: countBy(cards, "al"),
    tierMix: countBy(cards, "t"),
    timings: countBy(cards, "tim"),
    repeatables: [],
    engines,
  };

  // `</` would close the host <script> element early; JSON has no opinion about
  // that, so escape it here rather than trusting the page never to hold one.
  const line = `var DATA = ${JSON.stringify(data).replaceAll("</", "<\\/")};`;

  const page = fs.readFileSync(codexPath, "utf8");
  const pattern = /^var DATA = .*;$/m;
  if (!pattern.test(page)) {
    throw new Error(`No "var DATA = ...;" line in ${path.basename(codexPath)} — refusing to guess where it went`);
  }
  const next = page.replace(pattern, () => line);
  const changed = next !== page;
  if (changed) fs.writeFileSync(codexPath, next);

  console.log(`Codex data ${changed ? "rebuilt" : "already current"}: ${path.basename(codexPath)}`);
  console.log(`  ${cards.length} cards — ${counts.wired} wired, ${counts.targeted} targeted, ${counts.keyword} keyword-only, ${counts.vanilla} vanilla`);
  console.log(`  ${relics.length} relics, ${engines.length} ongoing engines`);
  return changed;
}

build();
