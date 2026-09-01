import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const cardsPath = path.join(projectRoot, "data", "cards.csv");
export const relicsPath = path.join(projectRoot, "data", "relics.csv");

export function readCards() {
  return parseCsv(fs.readFileSync(cardsPath, "utf8"));
}

export function readRelics() {
  return parseCsv(fs.readFileSync(relicsPath, "utf8"));
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

// ---------------------------------------------------------------------------
// Reading the engine's own vocabularies from a plain Node script.
//
// `src/engine/types.ts` is the single source of truth for camps, alignments,
// rarities, timings, keywords and effect ids, and `csv.ts` validates against the
// same arrays. The scripts in this folder run under plain `node`, so they cannot
// import a TypeScript module — and for a long time each one simply typed the
// lists out again. That is three copies of a closed set, only one of which the
// compiler checks, and the two it does not check fail LOUDLY and late: a camp
// added to the engine is rejected by the validator as an invalid value.
//
// So the arrays are read out of the source instead. The shape they are written
// in is fixed and mechanical (`export const NAME = [ … ] as const;`), and a
// parse that finds nothing throws rather than quietly handing back an empty set
// — an empty vocabulary would pass every card in the file.
// ---------------------------------------------------------------------------

const typesPath = path.join(projectRoot, "src", "engine", "types.ts");
const tokensPath = path.join(projectRoot, "src", "engine", "tokens.ts");

/** The body of `export const NAME = [ … ] as const;`, as raw source text. */
function constArrayBody(source, name, where) {
  const opener = `export const ${name} = [`;
  const start = source.indexOf(opener);
  if (start < 0) throw new Error(`${where}: no "export const ${name} = [" — has it been renamed?`);
  const end = source.indexOf("] as const;", start);
  if (end < 0) throw new Error(`${where}: "${name}" is not closed with "] as const;"`);
  return source.slice(start + opener.length, end);
}

/** Every double-quoted string inside that array, in order. */
function readConstArray(source, name, where) {
  const values = [...constArrayBody(source, name, where).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (values.length === 0) throw new Error(`${where}: "${name}" parsed as empty`);
  return values;
}

let engineVocabularyCache = null;

/**
 * The engine's card vocabularies, read from `types.ts` and `tokens.ts`.
 *
 * `rarityName` maps a frame colour to the tier name a player sees, which the
 * codex page and the gallery both print.
 */
export function engineVocabulary() {
  if (engineVocabularyCache) return engineVocabularyCache;
  const types = fs.readFileSync(typesPath, "utf8");
  const tokens = fs.readFileSync(tokensPath, "utf8");

  const tierPairs = [...constArrayBody(types, "RARITY_TIERS", "types.ts").matchAll(
    /code:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"/g,
  )].map(([, code, name]) => ({ code, name }));
  if (tierPairs.length === 0) throw new Error("types.ts: RARITY_TIERS parsed as empty");

  const themedTokenIds = readConstArray(tokens, "TOKEN_THEME_IDS", "tokens.ts");
  const allTokenIds = [...tokens.matchAll(/^\s*id: "(token:[^"]+)"/gm)].map((match) => match[1]);
  if (allTokenIds.length === 0) throw new Error("tokens.ts: no token card ids found");

  engineVocabularyCache = {
    rarities: tierPairs.map((tier) => tier.code),
    rarityName: Object.fromEntries(tierPairs.map((tier) => [tier.code, tier.name])),
    camps: readConstArray(types, "CAMPS", "types.ts"),
    alignments: readConstArray(types, "ALIGNMENTS", "types.ts"),
    effectTimings: readConstArray(types, "EFFECT_TIMINGS", "types.ts"),
    keywords: readConstArray(types, "KEYWORDS", "types.ts"),
    effectIds: readConstArray(types, "EFFECT_IDS", "types.ts"),
    relicIds: readConstArray(types, "RELIC_IDS", "types.ts"),
    /** Tokens whose arrival plays their own theme. Every one needs an audio file. */
    themedTokenIds,
    /** The rest: Battlecry and Hero-Power tokens, which stay on the generic FX. */
    genericTokenIds: allTokenIds.filter((id) => !themedTokenIds.includes(id)),
  };
  return engineVocabularyCache;
}

export function countBy(cards, field) {
  return cards.reduce((counts, card) => {
    counts[card[field]] = (counts[card[field]] ?? 0) + 1;
    return counts;
  }, {});
}
