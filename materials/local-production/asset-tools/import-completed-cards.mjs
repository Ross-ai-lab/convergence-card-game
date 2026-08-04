// Import the finished "Completed cards" faces + full roster into the browser game.
//
// Option A build (2026-07-11): the browser game grows from the curated 40-card
// starter set to the ENTIRE Convergence roster — 175 playable minions + 21
// Ascension Relics — every card showing its finished, formatted PNG face.
//
// What it does:
//   1. Reads the render pipeline's cards.json (the stat source that matches the
//      finished faces 1:1) from the master materials folder.
//   2. Keeps the existing 40 cards' IDs AND their wired effect logic untouched
//      (so the working duel / engine tests never regress) — only their art is
//      repointed at the new face. The other 135 minions are added as vanilla
//      stat-minions (effectId=none) — their effects get wired LATER (see README).
//   3. Writes data/cards.csv (175 minions) and data/relics.csv (21 relics, staged
//      for later — relics have no ATK/HP so they are NOT fed to the minion engine).
//   4. Emits a manifest (id -> source PNG) so a companion step can transcode each
//      1500x2100 print master down to a web-sized WebP in public/card-art/.
//
// Run: node materials/local-production/asset-tools/import-completed-cards.mjs
import fs from "node:fs";
import path from "node:path";
import { cardsPath, parseCsv, projectRoot } from "../../../source/scripts/card-tools.mjs";
import { syncRelicText } from "../../../source/scripts/sync-relic-text.mjs";

const materialsRoot = path.resolve(projectRoot, "..", "materials");
const cardsJsonPath = path.join(materialsRoot, "card-render-pipeline", "data", "cards.json");
const facesRoot = path.join(materialsRoot, "local-production", "card-production", "completed-cards");
const relicsPath = path.join(projectRoot, "data", "relics.csv");
// Inside the project, not a session scratchpad. This was pinned to one agent
// session's temp folder, which stops existing the moment that session ends.
const manifestPath = path.join(projectRoot, ".preview", "card-manifest.tsv");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const colorToRarity = { black: "Black", purple: "Purple", yellow: "Yellow", red: "Red" };

// The three roster names whose curated-40 wording differs from cards.json, so the
// finished face resolves to the right existing ID instead of being re-added.
const jsonNameAliases = new Map([
  ["13 Lords of Chaos", "Thirteen Lords of Chaos"],
  ["Gol D. Roger - King of Pirates", "Gol D. Roger"],
  ["Ragnaros the Firelord", "Ragnaros"],
]);

const cardHeaders = [
  "id", "name", "cost", "atk", "hp", "rarity", "camp", "alignment",
  "keywords", "effectId", "effectTiming", "effect", "flavor", "origin", "art",
];
// `relicId` is the relic's ENGINE HOOK and exists only in relics.csv -- cards.json
// has no such field. It was missing from this list, so every run wrote the file
// without that column and silently un-wired all 21 relics; the engine then
// refused to load at all ("relicId has invalid value \"undefined\"").
const relicHeaders = ["id", "name", "cost", "rarity", "color", "relicId", "effect", "flavor", "origin", "art"];

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/^the\s+/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function oneLine(text) {
  return (text ?? "").replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
    "",
  ].join("\n");
}

function walk(dir) {
  const output = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (/abandoned/i.test(item.name)) continue; // skip "original card art (abandoned)"
      output.push(...walk(fullPath));
    } else if (imageExtensions.has(path.extname(item.name).toLowerCase())) {
      output.push(fullPath);
    }
  }
  return output;
}

// --- load sources -----------------------------------------------------------
const existingRows = parseCsv(fs.readFileSync(cardsPath, "utf8"));
// Push relics.csv (the engine's truth) into cards.json BEFORE reading it, so
// the import can never pick up stale relic wording. This is what makes
// cards.json a derived copy rather than a second hand-maintained one.
syncRelicText({ quiet: true });

const jsonCards = JSON.parse(fs.readFileSync(cardsJsonPath, "utf8")).cards;
const faces = walk(facesRoot).map((file) => ({
  file,
  norm: normalize(path.basename(file, path.extname(file))),
}));

// existing-name -> row (plus the three cards.json aliases pointing at the same row)
const existingByNorm = new Map(existingRows.map((row) => [normalize(row.name), row]));
for (const [jsonName, curatedName] of jsonNameAliases) {
  const row = existingByNorm.get(normalize(curatedName));
  if (row) existingByNorm.set(normalize(jsonName), row);
}
const existingIds = new Set(existingRows.map((row) => row.id));

// Relics are matched back by NAME for the same reason minions are: their id and
// their hand-wired relicId must survive a re-import. Rebuilding them from
// cards.json alone renumbers them and throws the wiring away.
const existingRelics = fs.existsSync(relicsPath)
  ? parseCsv(fs.readFileSync(relicsPath, "utf8"))
  : [];
const existingRelicByNorm = new Map(existingRelics.map((row) => [normalize(row.name), row]));

function findFace(name) {
  const key = normalize(name);
  const exact = faces.find((face) => face.norm === key);
  if (exact) return exact.file;
  const fuzzy = faces.find((face) => face.norm.includes(key) || key.includes(face.norm));
  return fuzzy ? fuzzy.file : null;
}

// --- assign ids + resolve faces --------------------------------------------
let nextMinion = 41;
let nextRelic = 1;
const manifest = [];
const problems = [];
const newMinionRows = [];
const relicRows = [];

for (const card of jsonCards) {
  const isRelic = card.type === "relic" || card.camp === "ASCENSION";
  const face = findFace(card.name);
  if (!face) {
    problems.push(`No finished face found for "${card.name}"`);
    continue;
  }

  if (isRelic) {
    const priorRelic = existingRelicByNorm.get(normalize(card.name));
    // An EXISTING relic is preserved whole, exactly as an existing minion is.
    // cards.json is the render pipeline's data and its relic text has drifted
    // out of date -- re-importing from it silently replaced curated wording
    // with older wording, left Tesseract describing something its `no_retaliation`
    // hook does not do, and blanked Infinity Castle's cost and effect entirely.
    // cards.json is only consulted to DISCOVER relics that do not exist yet.
    if (priorRelic) {
      manifest.push([priorRelic.id, face]);
      relicRows.push({ ...priorRelic });
      continue;
    }
    const id = `r${String(nextRelic++).padStart(3, "0")}`;
    manifest.push([id, face]);
    relicRows.push({
      id,
      name: card.name,
      cost: card.cost ?? "",
      rarity: "Relic",
      color: "relic",
      relicId: "",
      effect: oneLine(card.effect),
      flavor: oneLine(card.flavor),
      origin: card.origin ?? "",
      art: `/card-art/raw/${id}.webp`,
    });
    continue;
  }

  // minion — reuse existing id (preserve its wired effect) or mint a new one
  const existing = existingByNorm.get(normalize(card.name));
  if (existing) {
    manifest.push([existing.id, face]);
    continue; // existing row is preserved verbatim below (art repointed)
  }

  const id = `c${String(nextMinion++).padStart(3, "0")}`;
  const rarity = colorToRarity[card.color];
  const cost = Number.parseInt(card.cost, 10);
  const atk = Number.parseInt(card.atk, 10);
  const hp = Number.parseInt(card.hp, 10);
  if (!rarity) problems.push(`${card.name}: unknown color "${card.color}"`);
  if (![cost, atk, hp].every((n) => Number.isInteger(n) && n >= 0)) {
    problems.push(`${card.name}: non-integer cost/atk/hp (${card.cost}/${card.atk}/${card.hp})`);
  }
  if (!["Magic", "Tech", "Nature"].includes(card.camp)) problems.push(`${card.name}: bad camp ${card.camp}`);
  if (!["Good", "Evil", "Neutral"].includes(card.alignment)) problems.push(`${card.name}: bad alignment ${card.alignment}`);

  manifest.push([id, face]);
  newMinionRows.push({
    id,
    name: card.name,
    cost,
    atk,
    hp,
    rarity,
    camp: card.camp,
    alignment: card.alignment,
    keywords: "", // logic later — keep new cards fully inert (no enforced keywords yet)
    effectId: "none",
    effectTiming: "none",
    effect: oneLine(card.effect),
    flavor: oneLine(card.flavor),
    origin: card.origin ?? "",
    art: `/card-art/raw/${id}.webp`,
  });
}

// preserve the existing 40 verbatim, only repointing art at the raw character art
const preservedRows = existingRows.map((row) => ({ ...row, art: `/card-art/raw/${row.id}.webp` }));
const minionRows = [...preservedRows, ...newMinionRows];

// --- sanity gates -----------------------------------------------------------
if (problems.length) {
  console.error("Problems:\n" + problems.join("\n"));
  process.exit(1);
}
if (minionRows.length !== 175) {
  console.error(`Expected 175 minions (40 preserved + 135 new), got ${minionRows.length}. Check name aliases.`);
  process.exit(1);
}
if (relicRows.length !== 21) {
  console.error(`Expected 21 relics, got ${relicRows.length}.`);
  process.exit(1);
}
const allIds = [...minionRows.map((r) => r.id), ...relicRows.map((r) => r.id)];
if (new Set(allIds).size !== allIds.length) {
  console.error("Duplicate ids detected.");
  process.exit(1);
}
const names = minionRows.map((r) => r.name);
if (new Set(names).size !== names.length) {
  console.error("Duplicate minion names detected — a face was added twice; add a name alias.");
  process.exit(1);
}

// --- write ------------------------------------------------------------------
fs.writeFileSync(cardsPath, toCsv(cardHeaders, minionRows), "utf8");
fs.writeFileSync(relicsPath, toCsv(relicHeaders, relicRows), "utf8");
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, manifest.map(([id, src]) => `${id}\t${src}`).join("\n") + "\n", "utf8");

console.log(`cards.csv:   ${minionRows.length} minions (40 preserved + ${newMinionRows.length} new)`);
console.log(`relics.csv:  ${relicRows.length} relics (staged, not yet playable)`);
console.log(`manifest:    ${manifest.length} faces -> ${manifestPath}`);
