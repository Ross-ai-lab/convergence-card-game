/**
 * The SECOND balance pass, run after the pacing was re-cut.
 *
 *   node scripts/apply-balance-pass-2.mjs           # dry run
 *   node scripts/apply-balance-pass-2.mjs --write   # apply
 *
 * Why there is a second one: duels went from a median of 16 player-turns to 21
 * when the accelerated mana ramp was reverted and core HP took over the pacing.
 * **An Ongoing engine's value is (turns alive x effect), so a third more turns
 * makes every one of them roughly a third stronger** — and sure enough four of
 * the five cards still above the line here are Ongoing. A pacing change is never
 * balance-neutral; it always needs a re-measure.
 *
 * 20 of the first pass's 24 cards landed in range and are untouched.
 *
 * Same rules as pass one: MANA COST IS NEVER TOUCHED. Bodies, keywords and
 * effect magnitudes only. Values are absolute, so a second run changes nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  "Deep Sea King": {
    atk: 3,
    hp: 3,
    why: "71.9% vs a 51.7% bracket. Its effect was already halved in pass one; the body is what is left to move.",
  },
  "Avatar Aang": {
    keywords: "",
    effect: "Ongoing: Gain +1/+1 for each different camp on the board.",
    why: "66.0% vs 48.5%. A 2/2 that grows every turn AND cannot be killed by the first answer is two safety nets. The growth is the card, so Divine Shield goes.",
  },
  "General Grievous": {
    hp: 3,
    why: "66.4% vs 53.2%. Effect already cut to +1/+1 in pass one, so the 4-HP body is the remaining lever.",
  },
  "Walter White": {
    atk: 0,
    hp: 2,
    why: "70.0% vs 48.9%, while his Good and Evil twins sit in range — Neutral is simply the biggest alignment, so the same anthem pays more. He keeps the anthem and stops being a body: a chemistry teacher should not be swinging.",
  },
  "S-Class Heroes": {
    effect: "Ongoing: Give +2/+2 to one of your Good type minion",
    why: "63.3% vs 49.3%. +3/+3 aimed anywhere, every turn, over a 21-turn duel.",
  },

  // ---------------------------------------------------------------- BUFFS
  Netero: {
    atk: 5,
    hp: 6,
    why: "33.6% vs 48.4%. Board-wide Divine Shield is a real effect, but a 3/4 at 7 mana dies before a second turn of value.",
  },
  Darkwing: {
    atk: 3,
    hp: 3,
    why: "34.7% vs 51.7%. Its whole effect is revenge on its killer, which is worth nothing when a 1/1 dies to anything for free.",
  },
  "Doctor Octopus": {
    atk: 4,
    hp: 4,
    why: "38.1% vs 53.2%. Destroying an enemy relic is dead text in every duel where the enemy has no relic, so the body must stand alone.",
  },
  Whitebeard: {
    atk: 7,
    hp: 9,
    effect: "Deal 3 DMG to ALL other minions",
    why: "36.9% vs 49.3% even after pass one buffed him. At 2 damage the sweep killed almost nothing while still hitting his own board; at 3 it is a real board clear worth the self-damage.",
  },
  "Lelouch Lamperouge": {
    atk: 5,
    hp: 9,
    why: "34.0% vs 43.3%. Stealing a small minion NEXT turn is slow and telegraphed; the body has to survive to collect.",
  },
  Homelander: {
    atk: 5,
    hp: 5,
    why: "34.8% vs 48.5%. The +5/+5 needs him alone on an empty board, which is the worst board state to be in.",
  },
};

// ---------------------------------------------------------------------------

function parse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const rows = parse(readFileSync(CARDS, "utf8"));
const header = rows[0];
const col = Object.fromEntries(header.map((name, index) => [name, index]));
const seen = new Set();
let changed = 0;

for (const row of rows.slice(1)) {
  if (row.length < header.length) continue;
  const patch = CHANGES[row[col.name]];
  if (!patch) continue;
  seen.add(row[col.name]);

  const before = `${row[col.atk]}/${row[col.hp]}${row[col.keywords] ? ` [${row[col.keywords]}]` : ""}`;
  if (patch.atk !== undefined) row[col.atk] = String(patch.atk);
  if (patch.hp !== undefined) row[col.hp] = String(patch.hp);
  if (patch.keywords !== undefined) row[col.keywords] = patch.keywords;
  if (patch.effect !== undefined) row[col.effect] = patch.effect;
  const after = `${row[col.atk]}/${row[col.hp]}${row[col.keywords] ? ` [${row[col.keywords]}]` : ""}`;

  if (before !== after) changed += 1;
  console.log(`${before === after ? " = " : " > "} ${row[col.name].padEnd(22)} ${before.padEnd(22)} -> ${after}`);
  console.log(`     ${patch.why}`);
}

for (const name of Object.keys(CHANGES)) {
  if (!seen.has(name)) console.error(`  !! "${name}" is not in cards.csv`);
}

console.log(`\n${changed} cards would change (${Object.keys(CHANGES).length} listed).`);
if (!write) {
  console.log("Dry run. Pass --write to apply.");
  process.exit(0);
}

writeFileSync(CARDS, `${rows.map((r) => r.map(esc).join(",")).join("\n")}\n`, "utf8");
console.log("data/cards.csv written. Run: npm run validate:data && npm run test && npm run sim");
