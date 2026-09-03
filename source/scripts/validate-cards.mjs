import fs from "node:fs";
import path from "node:path";
import { countBy, engineVocabulary, parseCsv, projectRoot, readCards, readRelics } from "./card-tools.mjs";

const vocabulary = engineVocabulary();

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

// Read from the engine, never typed out again here. A hand-kept copy of a closed
// set is a copy the compiler does not check, and it fails by rejecting a card
// the engine is perfectly happy with.
const allowed = {
  rarity: new Set(vocabulary.rarities),
  camp: new Set(vocabulary.camps),
  alignment: new Set(vocabulary.alignments),
  effectTiming: new Set(vocabulary.effectTimings),
  keyword: new Set(vocabulary.keywords),
};

const tokenAudioPath = path.join(projectRoot, "data", "token-audio.csv");
/** Battlecry and Hero-Power tokens: everything `tokens.ts` does not list as themed. */
const battlecryTokenIds = new Set(vocabulary.genericTokenIds);

// --- printed-text rules ------------------------------------------------------
// Two whole sessions were spent hand-correcting 86 cards whose printed text
// disagreed with the engine. These two rules make that impossible to reintroduce:
// the build fails instead of the card quietly lying to the player.

/**
 * Keywords the engine acts on, and which the card face draws.
 *
 * A deliberate SUBSET of the engine's keyword list rather than a copy of it:
 * Passive, Ongoing, Freeze and Silence name a timing or a status rather than a
 * standing rule the card must declare in its own first sentence. Built by
 * subtraction so a new keyword lands here by default and has to be excluded on
 * purpose.
 */
const NOT_DECLARED_IN_TEXT = ["Passive", "Ongoing", "Freeze", "Silence"];
const MECHANICAL = engineVocabulary().keywords.filter((keyword) => !NOT_DECLARED_IN_TEXT.includes(keyword));

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
  // Reborn prints no timing word at all. The keyword IS the timing — "Reborn"
  // already says when it happens — and "Deathrattle: Reborn" said the same thing
  // twice in a row.
  reborn: null,
};

/** A card declares its own keywords as leading sentences ("Taunt. Divine Shield. "),
 *  then the timing word. Only the LEADING block counts as a declaration — The
 *  Driller's "Give another minion Taunt" is about someone else's Taunt, and
 *  Ouken's "Become Chained after each Reborn" is about a chain he has not got
 *  yet, so a plain substring search would wave both through.
 *
 *  Reborn is the one keyword allowed to carry a word of its own — "Reborn
 *  twice", "Reborn infinitely" — because the count is the card's whole point and
 *  belongs in the same breath as the keyword. */
const LEADING_KEYWORDS = /^((?:(?:Divine Shield|Taunt|Chained|Charge|Deathrattle|Cannot attack|Reborn(?: twice| infinitely)?)(?:\.\s*|$))*)/;
const PRINTED_TIMING = /^(?:(?:Divine Shield|Taunt|Chained|Charge|Cannot attack)\.\s*)*(Battlecry and Deathrattle|Battlecry\/Ongoing|Battlecry|Ongoing|Passive|Deathrattle):\s/;

function checkPrintedText(card, line, errors) {
  const text = card.effect ?? "";
  checkEffectPunctuation(card.name, line, text, errors);
  checkFactionCase(card.name, line, text, errors);

  const match = PRINTED_TIMING.exec(text);
  const printed = match ? match[1] : null;
  const expected = TIMING_WORD[card.effectTiming];
  const dualTiming = ["flowey_save_load", "avatar_aang_awakened"].includes(card.effectId) &&
    /^Battlecry:\s.+\bDeathrattle:\s/.test(text);
  if (!dualTiming && printed !== expected) {
    const says = printed ? `"${printed}:"` : "no timing word";
    const want = expected ? `"${expected}:"` : "no timing word (stat-only cards print none)";
    errors.push(
      `Line ${line}: ${card.name} is effectTiming=${card.effectTiming} but its text prints ${says}. Expected ${want}.`,
    );
  }

  const declared = new Set(
    (LEADING_KEYWORDS.exec(text)[1].match(/Divine Shield|Taunt|Chained|Cannot attack|Reborn/g) ?? []).map((keyword) =>
      keyword === "Cannot attack" ? "Cannot Attack" : keyword,
    ),
  );
  if (/^(?:(?:Divine Shield|Taunt|Chained)\.\s*)*Deathrattle:\s/.test(text)) declared.add("Deathrattle");
  if (/^(?:(?:Divine Shield|Taunt|Chained|Charge|Cannot attack)\.\s*)*Deathrattle$/.test(text)) declared.add("Deathrattle");
  if (dualTiming && /\bDeathrattle:\s/.test(text)) declared.add("Deathrattle");
  if (/^(?:(?:Divine Shield|Taunt|Chained)\.\s*)*Battlecry and Deathrattle:\s/.test(text)) declared.add("Deathrattle");
  if (/^Charge(?:\.\s*|$)/.test(text)) declared.add("Charge");
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
  // A passive card MUST carry the Passive keyword.
  //
  // Fourteen of the sixty-five did not, because the keyword column is typed by
  // hand and the timing column is what the engine reads, so the two drifted
  // apart with nothing to notice. Kagaya Ubuyashiki offers "a Passive minion"
  // off the keyword list, so the gap silently shrank his pool by a fifth.
  // Passive is not in MECHANICAL — the engine acts on the timing, not on this
  // word — which is exactly why it needs its own check.
  if (card.effectTiming === "passive" && !(card.keywords ?? "").split(";").map((k) => k.trim()).includes("Passive")) {
    errors.push(
      `Line ${line}: ${card.name} is effectTiming=passive but does not carry the Passive keyword. ` +
        `Add it to the keywords column so the card and the engine agree.`,
    );
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
 * NO FULL STOP ON THE LAST SENTENCE (owner ruling, and the reason it is a hard
 * error rather than a style note).
 *
 * The rules panel is a box of its own on the card face. Its edge already ends
 * the sentence, so a final period is a glyph that says nothing and costs a
 * character of the auto-fit budget on the longest cards. Internal sentences keep
 * their periods - only the last one goes.
 *
 * This inverts the rule that stood here before, which REQUIRED the period. Both
 * versions exist for the same reason: 216 cards cannot be kept consistent by
 * hand, so the build decides it.
 */
function checkEffectPunctuation(name, line, text, errors) {
  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed === "-") return;
  if (/\.$/.test(trimmed)) {
    errors.push(
      `Line ${line}: ${name}'s printed effect ends with a full stop. ` +
        `The last sentence carries none - write "${trimmed.slice(0, -1)}".`,
    );
  }
  if (/[,;:]$/.test(trimmed)) {
    errors.push(`Line ${line}: ${name}'s printed effect ends mid-sentence on "${trimmed.slice(-1)}".`);
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
 * happens to contain one are left alone, and ALL is skipped because it is
 * already the camp's own spelling and has no lowercase form to catch.
 */
const FACTION_WORDS = [...vocabulary.alignments, ...vocabulary.camps].filter((word) => word !== "ALL");

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
 * WHAT IT DOES NOT COVER: labels that spell a magnitude as a word. Every label
 * carrying a number that can drift was converted to digits so this rule reaches
 * it. What is left spells a word that is not a magnitude at all — "full" is
 * always 100% in `heal_self_full`, "four" is the team's name in
 * `fantastic_four_aura`, "ten" is the artefact's name in
 * `ten_commandments_first_attack` — so there is nothing for the label and the
 * text to disagree about. If a new label spells a real number as a word, this
 * rule will not see it. Write digits.
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
const tokenAudio = fs.existsSync(tokenAudioPath) ? parseCsv(fs.readFileSync(tokenAudioPath, "utf8")) : [];
const tokenAudioIds = new Set();

for (const [index, token] of tokenAudio.entries()) {
  const line = index + 2;
  const tokenId = (token.id ?? "").trim();
  for (const field of ["id", "name", "origin", "trigger"]) {
    if (!(field in token) || !token[field].trim()) errors.push(`Token audio line ${line}: missing field ${field}`);
  }
  if (tokenAudioIds.has(tokenId)) errors.push(`Token audio line ${line}: duplicate id ${tokenId}`);
  tokenAudioIds.add(tokenId);
  if (!tokenId.startsWith("token:")) errors.push(`Token audio line ${line}: id must start with token: (${tokenId})`);
  if (battlecryTokenIds.has(tokenId)) {
    errors.push(`Token audio line ${line}: ${tokenId} is a Battlecry/Hero-Power token and must stay generic`);
  }
  if (!["deathrattle", "passive"].includes(token.trigger)) {
    errors.push(`Token audio line ${line}: trigger must be deathrattle or passive (${token.trigger})`);
  }
  const audioFile = tokenId.replace(/^token:/, "token-");
  const audioPath = path.join(projectRoot, "public", "audio", "stings", `${audioFile}.ogg`);
  if (!fs.existsSync(audioPath)) {
    errors.push(`Token audio line ${line}: ${token.name} has no theme — expected public/audio/stings/${audioFile}.ogg`);
    // 30 kB, DOWN FROM 200 kB on 4 September 2026. The old floor was calibrated
    // against stings that were secretly carrying a copied video stream and
    // encoding at 192 kHz (see the encoder note in the README): a correct
    // six-second clip is 60–100 kB, so the check would have failed every one of
    // them the moment that was fixed. What it is really guarding against is a
    // truncated or silent stub, and nothing healthy at this length lands under
    // 30 kB.
  } else if (fs.statSync(audioPath).size < 30_000) {
    errors.push(`Token audio line ${line}: ${token.name}'s theme is suspiciously small (${audioPath})`);
  }
}

const requiredTokenAudioIds = new Set(vocabulary.themedTokenIds);
for (const tokenId of requiredTokenAudioIds) {
  if (!tokenAudioIds.has(tokenId)) errors.push(`Token audio catalog is missing ${tokenId}`);
}

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
    // carrying hand-drawn vector art next to 181 photographs looks like a
    // mistake, because it is one. WebP is the format because this is
    // photographic art displayed at roughly 730x490 — see the README, which
    // scopes the rule rather than claiming WebP beats PNG everywhere.
    if (!/\.webp$/i.test(card.art)) {
      errors.push(
        `Line ${line}: ${card.name}'s art is not WebP (${card.art}). ` +
          `Every card carries a real photograph saved as .webp.`,
      );
    }
  }

  // EVERY minion card has a theme. A card whose sting is missing is silent when it
  // lands, which is not a small blemish: the sound IS the arrival, and the
  // silence reads as a broken build rather than as a card without music. Three
  // cards shipped that way (Mothership, Planetary Defense Grid, Black Hole)
  // simply because nothing counted, so this counts. Relics have their own
  // direct r### check below.
  const stingPath = path.join(projectRoot, "public", "audio", "stings", `${card.id}.ogg`);
  if (!fs.existsSync(stingPath)) {
    errors.push(`Line ${line}: ${card.name} has no theme — expected public/audio/stings/${card.id}.ogg`);
  }
}

if (cards.length !== 182) errors.push(`Expected 182 cards, found ${cards.length}`);
if (relics.length !== 34) errors.push(`Expected 34 relics, found ${relics.length}`);
for (const [index, relic] of relics.entries()) {
  checkEffectPunctuation(relic.name, index + 2, relic.effect, errors);
  const stingPath = path.join(projectRoot, "public", "audio", "stings", `${relic.id}.ogg`);
  if (!fs.existsSync(stingPath)) {
    errors.push(`Line ${index + 2}: ${relic.name} has no theme — expected public/audio/stings/${relic.id}.ogg`);
  }
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
console.log("Token audio:", tokenAudio.length, "Deathrattle/passive themes");
reportSharedEffects(cards);
