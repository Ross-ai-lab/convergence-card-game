/**
 * Generate the relic text in the render pipeline's cards.json FROM relics.csv.
 *
 *   npm run sync:relics          (also runs automatically inside import:completed)
 *
 * WHY
 * ---
 * The same 21 relics were described in two hand-maintained places: relics.csv,
 * which the ENGINE plays, and cards.json, which the card RENDERER draws. Nothing
 * kept them in step and they drifted — cards.json ended up with Tesseract
 * describing something its own `no_retaliation` hook does not do, and Infinity
 * Castle with no cost or effect at all. Re-importing then pushed that stale text
 * back into the game.
 *
 * relics.csv is the source of truth because it is what the engine reads. This
 * script makes cards.json a DERIVED copy of it, so the two cannot disagree.
 * `validate:data` still fails on drift — that gate is now a backstop for anyone
 * who edits cards.json by hand rather than the thing holding the line.
 *
 * Only the three text fields are touched. Everything else in a relic's
 * cards.json entry (its art, type, camp — all render-pipeline concerns) is left
 * exactly as it was.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, projectRoot } from "./card-tools.mjs";

const relicsCsvPath = path.join(projectRoot, "data", "relics.csv");
const cardsJsonPath = path.resolve(
  projectRoot,
  "..",
  "materials",
  "card-render-pipeline",
  "data",
  "cards.json",
);

const key = (v) => String(v == null ? "" : v).trim().toLowerCase();

export function syncRelicText({ quiet = false } = {}) {
  if (!fs.existsSync(relicsCsvPath)) {
    if (!quiet) console.warn(`sync:relics — no relics.csv at ${relicsCsvPath}, nothing to do.`);
    return { changed: [], skipped: true };
  }
  if (!fs.existsSync(cardsJsonPath)) {
    // The master materials folder is 495 MB and is not on every PC. That is a
    // normal state, not a failure: the game still builds and plays without it.
    if (!quiet) console.warn("sync:relics — the master materials folder is not on this PC, skipping.");
    return { changed: [], skipped: true };
  }

  const relics = new Map(parseCsv(fs.readFileSync(relicsCsvPath, "utf8")).map((r) => [key(r.name), r]));
  const doc = JSON.parse(fs.readFileSync(cardsJsonPath, "utf8"));
  const changed = [];

  for (const card of doc.cards) {
    const relic = relics.get(key(card.name));
    if (!relic) continue;

    const cost = relic.cost === "" || relic.cost == null ? card.cost : Number(relic.cost);
    const before = JSON.stringify([card.effect, card.flavor, card.cost]);
    card.effect = relic.effect;
    card.flavor = relic.flavor;
    card.cost = Number.isNaN(cost) ? relic.cost : cost;
    if (JSON.stringify([card.effect, card.flavor, card.cost]) !== before) changed.push(card.name);
  }

  if (changed.length) {
    fs.writeFileSync(cardsJsonPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }
  if (!quiet) {
    console.log(
      changed.length
        ? `sync:relics — ${changed.length} relic(s) updated in cards.json: ${changed.join(", ")}`
        : "sync:relics — cards.json already matches relics.csv.",
    );
  }
  return { changed, skipped: false };
}

// Run directly, not when imported by import-completed-cards.mjs.
// Build the comparison with pathToFileURL: hand-rolling `file://` + the path
// gives two slashes on Windows where import.meta.url has three, so the guard
// silently never fires and the script does nothing at all.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncRelicText();
}
