/**
 * PASS 7 — a two-card correction, not a pass.
 *
 *   node scripts/apply-balance-pass-7.mjs           # dry run
 *   node scripts/apply-balance-pass-7.mjs --write   # apply
 *
 * Pass 6 moved nine cards and seven of them landed inside +/-6 of their bracket.
 * These are the two that did not, and both misses are worth recording because
 * they are different kinds of mistake.
 *
 * MERUEM IS AN OVERSHOOT, the plain kind. It was -15.7 and got +3/+2, which is
 * a big swing to hand a card in one go; it came back +27.9 points at +11.0. That
 * is the lesson pass 3 already wrote down — *a previous pass can overshoot, and
 * only a re-measure finds it* — earned again. Half the buff is given back.
 *
 * EYE OF SAURON IS SOMETHING ELSE, and it is worth understanding before anyone
 * "fixes" it a third time. It was NERFED in pass 6 (4/6 -> 4/5) and its gap got
 * WORSE, +9.1 -> +12.0. Its win rate barely moved (59.6 -> 62.0, inside the
 * noise floor). What moved was the BRACKET: Fort was cut in the same pass and
 * Rennala sits low, so the cost-5 average fell underneath it. A gap is a
 * difference between two numbers and either one of them can be the thing that
 * changed — always check which before reaching for the card.
 *
 * A NOTE ON THE OUTLIER COUNT, because it went the wrong way and that needs
 * saying plainly: cards 9+ points from their bracket went 9 -> 14 across pass 6
 * even though the roster's best-to-worst SPREAD narrowed 32.1 -> 28.4. Both are
 * true. Moving nine cards moves their brackets' averages, which re-labels their
 * neighbours, so the count is unstable exactly when a pass is doing the most
 * work. **The spread is the honest progress metric** (37.8 -> 32.1 -> 28.4); the
 * count is a worklist, not a score.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  Meruem: {
    atk: 5,
    hp: 6,
    why:
      "62.5% vs a 51.5% bracket, up from 34.6% — pass 6 gave it +3/+2 in one step and it came back 27.9 points higher. Half of that buff returned. Still well above where it started, because 3/5 at cost 6 genuinely was unplayable.",
  },
  "Eye of Sauron": {
    atk: 3,
    why:
      "62.0% vs a 50.0% bracket. Read the header before touching this again: pass 6 already cut its HP and the gap grew, because its own win rate barely moved and the cost-5 bracket fell underneath it instead. The body is doing all the work here — revealing one random card is information the bot cannot even act on — so ATK is the lever that actually reaches it.",
  },
};

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

  const shape = (r) => `${r[col.atk]}/${r[col.hp]}${r[col.keywords] ? ` [${r[col.keywords]}]` : ""}`;
  const before = shape(row);
  if (patch.atk !== undefined) row[col.atk] = String(patch.atk);
  if (patch.hp !== undefined) row[col.hp] = String(patch.hp);
  const after = shape(row);
  if (before !== after) changed += 1;
  console.log(`${before !== after ? " > " : " = "} ${row[col.name].padEnd(20)} ${before.padEnd(14)} -> ${after}`);
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
console.log("data/cards.csv written. Run: npm run validate:data && npm test && npm run check:balance");
