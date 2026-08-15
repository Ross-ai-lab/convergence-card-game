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
  effectTiming: new Set(["none", "onPlay", "ongoing", "onPlayAndOngoing", "passive", "deathrattle"]),
  keyword: new Set(["Passive", "Ongoing", "Taunt", "Divine Shield", "Freeze", "Silence", "Chained", "Invulnerable", "Charge", "Deathrattle", "Cannot Attack"]),
};

// --- printed-text rules ------------------------------------------------------
// Two whole sessions were spent hand-correcting 86 cards whose printed text
// disagreed with the engine. These two rules make that impossible to reintroduce:
// the build fails instead of the card quietly lying to the player.

/** Keywords the engine actually acts on, and which the card face draws. */
const MECHANICAL = ["Taunt", "Divine Shield", "Chained", "Charge", "Deathrattle", "Cannot Attack"];

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
const TIMING_WORD = {
  onPlay: "Battlecry",
  onPlayAndOngoing: "Battlecry/Ongoing",
  none: null,
  ongoing: "Ongoing",
  passive: "Passive",
  deathrattle: "Deathrattle",
};

/** A card declares its own keywords as leading sentences ("Taunt. Divine Shield. "),
 *  then the timing word. Only the LEADING block counts as a declaration — The
 *  Driller's "Give another minion Taunt" is about someone else's Taunt, so a
 *  plain substring search would wave it through. */
const LEADING_KEYWORDS = /^((?:(?:Divine Shield|Taunt|Chained|Charge|Deathrattle|Cannot attack)\.\s*)*)/;
const PRINTED_TIMING = /^(?:(?:Divine Shield|Taunt|Chained|Charge|Cannot attack)\.\s*)*(Battlecry\/Ongoing|Battlecry|Ongoing|Passive|Deathrattle):\s/;

function checkPrintedText(card, line, errors) {
  const text = card.effect ?? "";

  const match = PRINTED_TIMING.exec(text);
  const printed = match ? match[1] : null;
  const expected = TIMING_WORD[card.effectTiming];
  const dualTiming = ["flowey_save_load", "avatar_aang_awakened", "chaos_random_summon"].includes(card.effectId) &&
    /^Battlecry:\s.+\bDeathrattle:\s/.test(text);
  if (!dualTiming && printed !== expected) {
    const says = printed ? `"${printed}:"` : "no timing word";
    const want = expected ? `"${expected}:"` : "no timing word (stat-only cards print none)";
    errors.push(
      `Line ${line}: ${card.name} is effectTiming=${card.effectTiming} but its text prints ${says}. Expected ${want}.`,
    );
  }

  const declared = new Set(
    (LEADING_KEYWORDS.exec(text)[1].match(/Divine Shield|Taunt|Chained|Cannot attack/g) ?? []).map((keyword) =>
      keyword === "Cannot attack" ? "Cannot Attack" : keyword,
    ),
  );
  if (/^(?:(?:Divine Shield|Taunt|Chained)\.\s*)*Deathrattle:\s/.test(text)) declared.add("Deathrattle");
  if (dualTiming && /\bDeathrattle:\s/.test(text)) declared.add("Deathrattle");
  if (/^Charge\.\s*/.test(text)) declared.add("Charge");
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

/**
 * An effectId is an internal label. The player never sees it, so when its
 * numbers drift away from the card's printed numbers nothing visibly breaks and
 * nobody notices. Five labels had drifted before this rule existed, and the cost
 * is not cosmetic: a session that reads `set_attack_zero` and trusts it will
 * "fix" an engine branch that was correct, or take a balance measurement against
 * a magnitude the card never had.
 *
 * The rule is deliberately narrow so it can be a hard error with no judgement in
 * it: every run of digits in the label must appear as a number in the printed
 * text. `buff_all_nature_2_1` must print a 2 and a 1 somewhere. Nothing here
 * cares about word order, sign, or what the numbers mean.
 *
 * WHAT IT DOES NOT COVER: labels that spell a magnitude as a word. Those were
 * converted to digits so this rule reaches them, and the four that remain
 * (`heal_self_full`, `heal_all_friendly_full`, `heal_good_ally_full`,
 * `fantastic_four_aura`) carry no magnitude that can drift — "full" is always
 * 100% and the "four" in Fantastic Four is the team's name. If a new label
 * spells a number as a word, this rule will not see it. Write digits.
 */
function checkLabelNumbers(card, line, errors) {
  const effectId = (card.effectId ?? "").trim();
  if (!effectId || effectId === "none") return;

  const labelNumbers = effectId.match(/\d+/g);
  if (!labelNumbers) return;

  const textNumbers = new Set((card.effect ?? "").match(/\d+/g) ?? []);
  const missing = [...new Set(labelNumbers)].filter((number) => !textNumbers.has(number));
  if (missing.length) {
    errors.push(
      `Line ${line}: ${card.name}'s effectId "${effectId}" contains ${missing.join(" and ")}, ` +
        `but its printed text does not: "${card.effect}". ` +
        `The label and the card must agree — rename the label to the printed number, ` +
        `or fix the text if the engine is the thing that changed.`,
    );
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
  checkLabelNumbers(card, line, errors);

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

// --- shared-effect report (warning, never an error) ---------------------------
// Two cards may legitimately share an effectId when the mechanic genuinely
// describes both of them, so this can never fail the build. It exists because
// the opposite case is invisible: an effect written for one character and then
// borrowed to fill a second card reads as filler, and nothing in the data says
// which of the two it was written for. The README's effect-selection doctrine
// calls repeated text acceptable only when it describes each subject, and this
// list is how that judgement gets made instead of skipped.
function reportSharedEffects(all) {
  const withEffects = all.filter((card) => card.effectId?.trim() && card.effectId.trim() !== "none");

  const group = (keyOf) => {
    const buckets = new Map();
    for (const card of withEffects) {
      const key = keyOf(card);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(card);
    }
    return [...buckets.entries()]
      .filter(([, cards]) => cards.length > 1)
      .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
  };

  const byLabel = group((card) => card.effectId.trim());

  // The label is only half the question. Nulgath and Gravelord Nito ran the
  // identical rule under two different ids for the whole balance history, and
  // grouping by label waved them through every time — the duplicate was found by
  // hand, which is exactly the kind of check that stops happening.
  //
  // Normalising the printed text catches that case. It only works because the
  // roster's wording is kept deliberately uniform (see the README's card wording
  // rules): one verb for destruction, digits for counts, no shouting, every
  // effect ending as a sentence. Wording drift is what would blind this half.
  const normalise = (text) =>
    (text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9+\-/ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const byText = group((card) => normalise(card.effect)).filter(
    ([, cards]) => new Set(cards.map((card) => card.effectId.trim())).size > 1,
  );

  if (!byLabel.length && !byText.length) {
    console.log("Shared effects: none");
    return;
  }

  if (byLabel.length) {
    const cardCount = byLabel.reduce((total, [, cards]) => total + cards.length, 0);
    console.log(
      `Shared effects: ${byLabel.length} effect${byLabel.length === 1 ? "" : "s"} printed on ${cardCount} cards ` +
        `(review each against the effect-selection doctrine; this is never a build failure)`,
    );
    for (const [effectId, cards] of byLabel) {
      console.log(`  ${effectId}: ${cards.map((card) => card.name).join(", ")}`);
    }
  }

  if (byText.length) {
    console.log(
      `Same rule under DIFFERENT labels: ${byText.length} ` +
        `(the label hides these; the printed text does not)`,
    );
    for (const [, cards] of byText) {
      console.log(`  ${cards.map((card) => `${card.name} [${card.effectId.trim()}]`).join(", ")}`);
      console.log(`      "${cards[0].effect}"`);
    }
  }
}

console.log("Card data OK");
console.log("Cards:", cards.length);
console.log("Costs:", JSON.stringify(countBy(cards, "cost")));
console.log("Rarities:", JSON.stringify(countBy(cards, "rarity")));
console.log("Camps:", JSON.stringify(countBy(cards, "camp")));
reportSharedEffects(cards);
