import fs from "node:fs";
import path from "node:path";
import { countBy, projectRoot, readCards } from "./card-tools.mjs";

const required = [
  "id",
  "name",
  "cost",
  "atk",
  "hp",
  "rarity",
  "camp",
  "alignment",
  "keywords",
  "effectId",
  "effectTiming",
  "effect",
  "flavor",
  "origin",
  "art",
];

const allowed = {
  rarity: new Set(["Red", "Yellow", "Purple", "Black"]),
  camp: new Set(["Magic", "Tech", "Nature"]),
  alignment: new Set(["Good", "Evil", "Neutral"]),
  effectTiming: new Set(["none", "onPlay", "ongoing", "passive"]),
  keyword: new Set(["Passive", "Ongoing", "Taunt", "Divine Shield", "Freeze", "Silence", "Chained", "Invulnerable"]),
};

// --- printed-text rules ------------------------------------------------------
// Two whole sessions were spent hand-correcting 86 cards whose printed text
// disagreed with the engine. These two rules make that impossible to reintroduce:
// the build fails instead of the card quietly lying to the player.

/** Keywords the engine actually acts on, and which the card face draws. */
const MECHANICAL = ["Taunt", "Divine Shield", "Chained"];

/**
 * The word a card must print for each timing.
 *
 * BATTLECRIES PRINT "Battlecry:" NOW (owner ruling). The old house style was
 * that they printed nothing, on the theory that a bare instruction reads as a
 * one-off. It does not. "Gain Divine Shield." on a card with no timing word
 * tells you neither WHEN it happens nor whether it keeps happening, and next to
 * an "Ongoing:" card that ambiguity is the whole question. Every card now says
 * which of the four it is, or is stat-only and says nothing at all.
 */
const TIMING_WORD = { onPlay: "Battlecry", none: null, ongoing: "Ongoing", passive: "Passive" };

/** A card declares its own keywords as leading sentences ("Taunt. Divine Shield. "),
 *  then the timing word. Only the LEADING block counts as a declaration — The
 *  Driller's "Give another minion Taunt" is about someone else's Taunt, so a
 *  plain substring search would wave it through. */
const LEADING_KEYWORDS = /^((?:(?:Divine Shield|Taunt|Chained)\.\s*)*)/;
const PRINTED_TIMING = /^(?:(?:Divine Shield|Taunt|Chained)\.\s*)*(Battlecry|Ongoing|Passive):\s/;

function checkPrintedText(card, line, errors) {
  const text = card.effect ?? "";

  const match = PRINTED_TIMING.exec(text);
  const printed = match ? match[1] : null;
  const expected = TIMING_WORD[card.effectTiming];
  if (printed !== expected) {
    const says = printed ? `"${printed}:"` : "no timing word";
    const want = expected ? `"${expected}:"` : "no timing word (stat-only cards print none)";
    errors.push(
      `Line ${line}: ${card.name} is effectTiming=${card.effectTiming} but its text prints ${says}. Expected ${want}.`,
    );
  }

  const declared = new Set((LEADING_KEYWORDS.exec(text)[1].match(/Divine Shield|Taunt|Chained/g) ?? []));
  const carried = new Set(
    (card.keywords ?? "").split(";").map((k) => k.trim()).filter((k) => MECHANICAL.includes(k)),
  );
  for (const keyword of carried) {
    if (!declared.has(keyword)) {
      errors.push(
        `Line ${line}: ${card.name} has the ${keyword} keyword but does not declare it. ` +
          `Start the text with "${keyword}." so the card reads true.`,
      );
    }
  }
  for (const keyword of declared) {
    if (!carried.has(keyword)) {
      errors.push(
        `Line ${line}: ${card.name} declares "${keyword}." but has no ${keyword} keyword, ` +
          `so the card promises something the engine will not do.`,
      );
    }
  }
}

const cards = readCards();
const errors = [];
const ids = new Set();
const names = new Set();

for (const [index, card] of cards.entries()) {
  const line = index + 2;
  for (const field of required) {
    if (!(field in card)) errors.push(`Line ${line}: missing field ${field}`);
  }
  if (ids.has(card.id)) errors.push(`Line ${line}: duplicate id ${card.id}`);
  if (names.has(card.name)) errors.push(`Line ${line}: duplicate name ${card.name}`);
  ids.add(card.id);
  names.add(card.name);

  for (const field of ["cost", "atk", "hp"]) {
    const value = Number.parseInt(card[field], 10);
    if (!Number.isInteger(value) || value < 0) errors.push(`Line ${line}: ${field} must be a non-negative integer`);
  }
  for (const field of ["rarity", "camp", "alignment", "effectTiming"]) {
    if (!allowed[field].has(card[field])) errors.push(`Line ${line}: invalid ${field} ${card[field]}`);
  }
  if (card.keywords) {
    for (const keyword of card.keywords.split(";")) {
      if (!allowed.keyword.has(keyword.trim())) errors.push(`Line ${line}: invalid keyword ${keyword}`);
    }
  }
  checkPrintedText(card, line, errors);

  if (!card.art || !card.art.startsWith("/card-art/")) {
    errors.push(`Line ${line}: art must point at /card-art/...`);
  } else {
    const artPath = path.join(projectRoot, "public", card.art.replace(/^\//, ""));
    if (!fs.existsSync(artPath)) errors.push(`Line ${line}: art file does not exist: ${card.art}`);
  }
}

if (cards.length !== 175) errors.push(`Expected 175 cards, found ${cards.length}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// --- relic drift ------------------------------------------------------------
// relics.csv is what the ENGINE plays. cards.json is what the render pipeline
// draws from. They describe the same 21 relics and nothing kept them in step,
// so cards.json quietly went stale: Tesseract described something its own
// `no_retaliation` hook does not do, and Infinity Castle had lost its cost and
// effect entirely. The re-import now preserves relics.csv instead of
// overwriting from cards.json, which stops the damage; this stops the DRIFT.
{
  const relicsCsvPath = path.join(projectRoot, "data", "relics.csv");
  const cardsJsonPath = path.resolve(
    projectRoot, "..", "materials", "card-render-pipeline", "data", "cards.json",
  );
  if (fs.existsSync(relicsCsvPath) && fs.existsSync(cardsJsonPath)) {
    const norm = (v) => String(v == null ? "" : v).split(" ").filter(Boolean).join(" ").trim().toLowerCase();
    const rows = fs.readFileSync(relicsCsvPath, "utf8").trim().split(String.fromCharCode(10));
    const head = rows[0].replace(String.fromCharCode(10), "").trim().split(",");
    const cell = (row, key) => {
      const out = []; let cur = ""; let quoted = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
          // A doubled quote inside a quoted field is ONE literal quote, not two
          // delimiters. Missing this reported White Whistle as permanently
          // drifted: its effect really contains "Ongoing" in quotes, and the
          // naive reader silently stripped them and compared two different
          // strings forever.
          if (quoted && row[i + 1] === '"') { cur += '"'; i++; }
          else quoted = !quoted;
        } else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      const i = head.indexOf(key);
      return i < 0 ? "" : (out[i] || "").trim();
    };
    const csvEffect = new Map(rows.slice(1).map((r) => [norm(cell(r, "name")), norm(cell(r, "effect"))]));
    const drift = [];
    for (const c of JSON.parse(fs.readFileSync(cardsJsonPath, "utf8")).cards) {
      const key = norm(c.name);
      if (!csvEffect.has(key)) continue;
      if (csvEffect.get(key) !== norm(c.effect)) drift.push(c.name);
    }
    if (drift.length) {
      errors.push(
        "Relic text has drifted between relics.csv and the render pipeline's cards.json for: " +
        drift.join(", ") +
        ". relics.csv is the truth (the engine reads it) - update cards.json to match.",
      );
    }
  }
}

if (errors.length) {
  console.error(errors.join(String.fromCharCode(10)));
  process.exit(1);
}

console.log("Card data OK");
console.log("Cards:", cards.length);
console.log("Costs:", JSON.stringify(countBy(cards, "cost")));
console.log("Rarities:", JSON.stringify(countBy(cards, "rarity")));
console.log("Camps:", JSON.stringify(countBy(cards, "camp")));
