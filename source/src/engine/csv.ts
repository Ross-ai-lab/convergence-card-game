import {
  ALIGNMENTS,
  CAMPS,
  EFFECT_IDS,
  EFFECT_TIMINGS,
  KEYWORDS,
  RARITIES,
  RELIC_IDS,
} from "./types";
import type {
  Alignment,
  Camp,
  CardDefinition,
  EffectId,
  EffectTiming,
  Keyword,
  Rarity,
  RelicDefinition,
  RelicId,
} from "./types";

/**
 * The vocabularies a CSV row is allowed to use.
 *
 * Every one of these is BUILT FROM the array in `types.ts` rather than typed
 * out again beside it. They were two hand-maintained lists for a long time --
 * one the compiler checked and one it did not -- so an effect added to the type
 * and forgotten here would pass every test and then throw
 * `effectId has invalid value` the first time a real card used it. One array,
 * one list, no drift.
 */
const rarities: ReadonlySet<Rarity> = new Set(RARITIES);
const camps: ReadonlySet<Camp> = new Set(CAMPS);
const alignments: ReadonlySet<Alignment> = new Set(ALIGNMENTS);
const timings: ReadonlySet<EffectTiming> = new Set(EFFECT_TIMINGS);
const keywords: ReadonlySet<Keyword> = new Set(KEYWORDS);
const effectIds: ReadonlySet<EffectId> = new Set(EFFECT_IDS);
const relicIds: ReadonlySet<RelicId> = new Set(RELIC_IDS);

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
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
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];

  return body.map((values) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), values[index]?.trim() ?? ""])),
  );
}

export function parseCardsCsv(text: string): CardDefinition[] {
  const rows = parseCsv(text);
  return rows.map((row, index) => normalizeCardRow(row, index + 2));
}

/**
 * Relics carry no ATK/HP — they are equipment, so the only field the engine
 * needs beyond the printed text is the `relicId` hook.
 */
export function parseRelicsCsv(text: string): RelicDefinition[] {
  return parseCsv(text).map((row, index) => {
    const line = index + 2;
    if (!row.id || !row.name) throw new Error(`Relic line ${line}: id and name are required.`);
    return {
      kind: "relic" as const,
      id: row.id,
      name: row.name,
      relicId: oneOf(row.relicId, relicIds, "relicId", line),
      effect: row.effect ?? "",
      flavor: row.flavor ?? "",
      origin: row.origin ?? "",
      art: row.art ?? "",
      cost: /^\d+$/.test((row.cost ?? "").trim()) ? Number(row.cost) : undefined,
    };
  });
}

function normalizeCardRow(row: Record<string, string>, line: number): CardDefinition {
  const cost = parseIntField(row.cost, "cost", line);
  const atk = parseIntField(row.atk, "atk", line);
  const hp = parseIntField(row.hp, "hp", line);
  const rarity = oneOf(row.rarity, rarities, "rarity", line);
  const camp = oneOf(row.camp, camps, "camp", line);
  const alignment = oneOf(row.alignment, alignments, "alignment", line);
  const effectId = oneOf(row.effectId, effectIds, "effectId", line);
  const effectTiming = oneOf(row.effectTiming, timings, "effectTiming", line);
  const parsedKeywords = row.keywords
    ? row.keywords.split(";").map((keyword) => oneOf(keyword.trim(), keywords, "keyword", line))
    : [];

  if (!row.id || !row.name) {
    throw new Error(`Line ${line}: id and name are required.`);
  }

  return {
    kind: "minion" as const,
    id: row.id,
    name: row.name,
    cost,
    atk,
    hp,
    rarity,
    camp,
    alignment,
    keywords: parsedKeywords,
    effectId,
    effectTiming,
    effect: row.effect,
    flavor: row.flavor,
    origin: row.origin,
    art: row.art ?? "",
  };
}

function parseIntField(value: string, field: string, line: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Line ${line}: ${field} must be a non-negative integer.`);
  }
  return parsed;
}

function oneOf<T extends string>(value: string, allowed: ReadonlySet<T>, field: string, line: number): T {
  if (allowed.has(value as T)) return value as T;
  throw new Error(`Line ${line}: ${field} has invalid value "${value}".`);
}
