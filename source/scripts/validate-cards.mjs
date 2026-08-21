import fs from "node:fs";
import path from "node:path";
import { countBy, projectRoot, readCards, readRelics } from "./card-tools.mjs";

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
  camp: new Set(["Magic", "Tech", "Nature", "ALL"]),
  alignment: new Set(["Good", "Evil", "Neutral"]),
  effectTiming: new Set(["none", "onPlay", "ongoing", "onPlayAndOngoing", "onPlayAndDeathrattle", "passive", "deathrattle"]),
  keyword: new Set(["Passive", "Ongoing", "Taunt", "Divine Shield", "Freeze", "Silence", "Chained", "Invulnerable", "Charge", "Deathrattle", "Cannot Attack"]),
};

// --- printed-text rules ------------------------------------------------------
// Two whole sessions were spent hand-correcting 86 cards whose printed text
// disagreed with the engine. These two rules make that impossible to reintroduce:
// the build fails instead of the card quietly lying to the player.

/**
 * Cards temporarily exempt from the WebP art rule.
 *
 * DELETE AN ENTRY RATHER THAN ADDING ONE. c176 is Mothership, whose hand-drawn
 * SVG is the reason the rule exists at all; that card is being replaced, so this
 * exemption disappears with it. If the set is ever empty, remove it and its
 * lookup — an empty allowance is an invitation to add a new entry.
 */
const ART_FORMAT_EXCEPTIONS = new Set(["c176"]);

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
  onPlayAndDeathrattle: "Battlecry and Deathrattle",
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
const PRINTED_TIMING = /^(?:(?:Divine Shield|Taunt|Chained|Charge|Cannot attack)\.\s*)*(Battlecry and Deathrattle|Battlecry\/Ongoing|Battlecry|Ongoing|Passive|Deathrattle):\s/;

function checkPrintedText(card, line, errors) {
  const text = card.effect ?? "";
  checkEffectPunctuation(card.name, line, text, errors);
  checkFactionCase(card.name, line, text, errors);

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
  if (/^(?:(?:Divine Shield|Taunt|Chained)\.\s*)*Battlecry and Deathrattle:\s/.test(text)) declared.add("Deathrattle");
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

function checkEffectPunctuation(name, line, text, errors) {
  if (text && text !== "-" && !/[.!?]$/.test(text.trim())) {
    errors.push(`Line ${line}: ${name}'s printed effect must end with punctuation.`);
  }
}

/**
 * Camps and alignments are proper labels on the card, printed on its rails and
 * used by the filters in the gallery and the codex. "all good minions" reads as
 * ordinary English rather than as the Good alignment, and the player has to
 * guess whether the rule means the label or the adjective. Two cards had drifted
 * into lowercase before this check existed.
 *
 * Only the exact standalone words count. "goods", "high-tech" and a name that
 * happens to contain one are left alone, and ALL is the camp's own spelling.
 */
const FACTION_WORDS = ["Good", "Evil", "Neutral", "Magic", "Tech", "Nature"];

function checkFactionCase(name, line, text, errors) {
  if (!text || text === "-") return;
  for (const word of FACTION_WORDS) {
    const lower = word.toLowerCase();
    if (new RegExp(String.raw`(?<![A-Za-z-])${lower}(?![A-Za-z])`).test(text)) {
      errors.push(
        `Line ${line}: ${name} prints "${lower}" in lowercase. ` +
          `Camps and alignments are labels, so write "${word}".`,
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
const relics = readRelics();
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
    // EVERY minion wears a real photograph, saved as WebP. Owner ruling: a card
    // carrying hand-drawn vector art next to 174 photographs looks like a
    // mistake, because it is one. WebP is the format because this is
    // photographic art displayed at roughly 730x490 — see the README, which
    // scopes the rule rather than claiming WebP beats PNG everywhere.
    if (!/\.webp$/i.test(card.art) && !ART_FORMAT_EXCEPTIONS.has(card.id)) {
      errors.push(
        `Line ${line}: ${card.name}'s art is not WebP (${card.art}). ` +
          `Every card carries a real photograph saved as .webp.`,
      );
    }
  }

  // EVERY card has a theme. A card whose sting is missing is silent when it
  // lands, which is not a small blemish: the sound IS the arrival, and the
  // silence reads as a broken build rather than as a card without music. Three
  // cards shipped that way (Mothership, Planetary Defense Grid, Black Hole)
  // simply because nothing counted, so this counts. Relics are deliberately NOT
  // included — they use r### ids and are not part of the theme set at all.
  const stingPath = path.join(projectRoot, "public", "audio", "stings", `${card.id}.ogg`);
  if (!fs.existsSync(stingPath)) {
    errors.push(`Line ${line}: ${card.name} has no theme — expected public/audio/stings/${card.id}.ogg`);
  }
}

if (cards.length !== 175) errors.push(`Expected 175 cards, found ${cards.length}`);
if (relics.length !== 21) errors.push(`Expected 21 relics, found ${relics.length}`);
for (const [index, relic] of relics.entries()) {
  checkEffectPunctuation(relic.name, index + 2, relic.effect, errors);
}

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

  // The label is only half the question. Grouping by label can miss a duplicate
  // when two cards use different ids, so the printed-text check below keeps that
  // review visible instead of relying on memory.
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
