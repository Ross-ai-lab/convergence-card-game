/**
 * Extract the Star Charts profiles from the official lore page into a small
 * TypeScript data module used by the game's card gallery.
 *
 * The lore page is the authoring source for these profiles. Keeping extraction
 * here prevents the gallery from carrying a hand-copied, silently stale blob.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(sourceDir, "..");
const lorePath = path.join(projectDir, "materials", "Convergence-Official-Lore.html");
const additionsPath = path.join(projectDir, "materials", "Convergence-Star-Charts-Additions.json");
const outputPath = path.join(sourceDir, "src", "data", "lore.ts");

const html = fs.readFileSync(lorePath, "utf8");
const marker = "window.CV_DETAIL=";
const start = html.indexOf(marker);
if (start < 0) throw new Error(`Could not find ${marker} in ${lorePath}`);
const jsonStart = start + marker.length;
const jsonEnd = html.indexOf(";</script>", jsonStart);
if (jsonEnd < 0) throw new Error(`Could not find the Star Charts closing marker in ${lorePath}`);

const officialDetails = JSON.parse(html.slice(jsonStart, jsonEnd));
const additions = JSON.parse(fs.readFileSync(additionsPath, "utf8"));
if (!additions || typeof additions !== "object" || Array.isArray(additions)) {
  throw new Error(`Star Charts additions must be an object in ${additionsPath}`);
}
const duplicateIds = Object.keys(additions).filter((id) => Object.hasOwn(officialDetails, id));
if (duplicateIds.length) {
  throw new Error(`Star Charts additions overlap official profiles: ${duplicateIds.join(", ")}`);
}
const details = { ...officialDetails, ...additions };
const entries = Object.entries(details);
if (entries.length === 0) throw new Error("Star Charts data parsed to zero profiles");

for (const [id, profile] of entries) {
  if (!profile || typeof profile !== "object" || typeof profile.name !== "string") {
    throw new Error(`Star Charts profile ${id} is not a named object`);
  }
  if (!Array.isArray(profile.vals) || profile.vals.length !== 6) {
    throw new Error(`Star Charts profile ${id} must have six chart values`);
  }
}

const output = `/* Generated from the official lore page and materials/Convergence-Star-Charts-Additions.json. Do not edit by hand. */
export interface LoreRival {
  who: string;
  rel: string;
  id: string;
}

export interface LoreDetail {
  name: string;
  origin: string;
  epithet: string;
  rar: string;
  camp: string;
  align: string;
  cost: number;
  atk: number;
  hp: number;
  cc: string;
  vals: number[];
  rank: string;
  lore: string;
  quote: string;
  str: string[];
  wk: string[];
  sig_name: string;
  sig_desc: string;
  playstyle: string;
  ability: string;
  rivals: LoreRival[];
}

export const LORE_DETAILS: Record<string, LoreDetail> = ${JSON.stringify(details, null, 2)};
`;

const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
if (previous !== output) fs.writeFileSync(outputPath, output, "utf8");

console.log(`Star Charts data ${previous === output ? "already current" : "rebuilt"}: ${entries.length} profiles`);
