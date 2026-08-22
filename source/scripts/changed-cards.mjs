/**
 * What card changes are about to be saved, and are they described?
 *
 * Two jobs, one file:
 *
 *   node scripts/changed-cards.mjs            print the summary, ready to paste
 *   node scripts/changed-cards.mjs --check F  fail unless the message in F names
 *                                             every changed card (used by the hook)
 *
 * The reason this exists: a card's effect was changed inside a save labelled
 * "Implement mulligan and hero power progression", and another was renamed in
 * the same one. Neither was mentioned. Months later the only way to answer "why
 * did my card change?" was to walk every version of the table by hand. The record
 * did not hide the change - it just never said it happened.
 *
 * Generating the summary is deliberately the easy path. A rule that asks an AI to
 * remember something is a rule that gets skipped on the busy sessions; a rule that
 * prints the exact text to paste, and refuses the save without it, does not.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseCsv, projectRoot } from "./card-tools.mjs";

const REPO = path.resolve(projectRoot, "..");
const TABLES = ["source/data/cards.csv", "source/data/relics.csv"];

const LABELS = {
  name: "renamed",
  cost: "mana cost",
  atk: "attack",
  hp: "health",
  rarity: "rarity",
  camp: "camp",
  alignment: "alignment",
  keywords: "keywords",
  effectId: "effect id",
  effectTiming: "timing",
  effect: "text",
  flavor: "flavour",
  origin: "origin",
  art: "artwork",
};

function git(...args) {
  return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function readAt(ref, file) {
  try {
    const text = git("show", `${ref}:${file}`);
    if (!text.trim()) return null;
    const byId = new Map();
    for (const row of parseCsv(text)) if (row.id) byId.set(row.id, row);
    return byId;
  } catch {
    return null;
  }
}

/** Cards that differ between what is committed and what is staged to be committed. */
function changes() {
  const out = [];
  for (const file of TABLES) {
    const before = readAt("HEAD", file) ?? new Map();
    const after = readAt("", file); // "" means the index: the exact content being saved
    if (!after) continue;

    for (const [id, row] of after) {
      const old = before.get(id);
      if (!old) {
        out.push({ id, name: row.name, kind: "added", fields: [] });
        continue;
      }
      const fields = Object.keys(LABELS)
        .filter((key) => (old[key] ?? "") !== (row[key] ?? ""))
        .map((key) => ({ key, label: LABELS[key], from: old[key] ?? "", to: row[key] ?? "" }));
      if (fields.length) out.push({ id, name: row.name, oldName: old.name, kind: "changed", fields });
    }
    for (const [id, row] of before) {
      if (!after.has(id)) out.push({ id, name: row.name, kind: "removed", fields: [] });
    }
  }
  return out;
}

function describe(change) {
  if (change.kind === "added") return `${change.name} (${change.id}) added`;
  if (change.kind === "removed") return `${change.name} (${change.id}) removed`;
  const parts = change.fields.map((f) =>
    f.key === "effect" || f.key === "flavor" ? f.label : `${f.label} ${f.from || "(empty)"} to ${f.to || "(empty)"}`,
  );
  const named = change.oldName && change.oldName !== change.name ? `${change.oldName} renamed to ${change.name}` : change.name;
  return `${named} (${change.id}): ${parts.join(", ")}`;
}

/** A name counts as mentioned if the message contains it, or the card's id. */
function mentioned(message, change) {
  const haystack = message.toLowerCase();
  const candidates = [change.name, change.oldName, change.id].filter(Boolean);
  return candidates.some((value) => haystack.includes(String(value).toLowerCase()));
}

function main() {
  const [flag, messageFile] = process.argv.slice(2);
  const found = changes();

  if (flag !== "--check") {
    if (!found.length) {
      console.log("No card or relic changes are staged.");
      return;
    }
    console.log(`${found.length} card change${found.length === 1 ? "" : "s"} staged:\n`);
    for (const change of found) console.log(`  - ${describe(change)}`);
    console.log("\nPaste those lines into the save description so the change is findable later.");
    return;
  }

  if (!found.length) return; // nothing to describe
  if (!messageFile || !fs.existsSync(messageFile)) return; // nothing to check against

  const raw = fs.readFileSync(messageFile, "utf8");
  const message = raw
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");

  const missing = found.filter((change) => !mentioned(message, change));
  if (!missing.length) return;

  console.error("");
  console.error(`This save changes ${found.length} card${found.length === 1 ? "" : "s"}, and ${missing.length} of them ${missing.length === 1 ? "is" : "are"} not mentioned in the description.`);
  console.error("");
  console.error("A card change inside a save described as something else is invisible. That is");
  console.error("how a card can appear to change on its own months later. Name them:");
  console.error("");
  for (const change of missing) console.error(`  - ${describe(change)}`);
  console.error("");
  console.error("Add those lines to the description and save again.");
  console.error("Full summary any time:  npm run changed-cards");
  console.error("");
  process.exitCode = 1;
}

main();
