/**
 * The SIXTH balance pass — the nine cards pass 5's tightening left exposed.
 *
 *   node scripts/apply-balance-pass-6.mjs           # dry run
 *   node scripts/apply-balance-pass-6.mjs --write   # apply
 *
 * Measured over 1500 duels at normal, each card against its OWN mana cost
 * bracket. MANA COST IS NEVER TOUCHED.
 *
 * Pass 5 took cards 9+ points off their bracket from 19 to 9. These are those
 * nine. Eight of them are pure body changes; only Nulgath touches an effect, and
 * it is edited in both halves.
 *
 * NULGATH IS CUT A SECOND TIME, and that deserves its own note because the
 * standing rule here is that consecutive cuts are how APR was destroyed. The
 * rule's actual content is narrower than "never twice": APR was cut twice
 * WITHOUT a measurement between, so the second cut could not know the first had
 * already overshot. This is not that. Pass 5 took it +2/+2 -> +1/+2, a full
 * 1500-duel run measured the result at 61.4% against a 50.3% bracket, and this
 * cut is aimed at that number. The target is not invented either: Gravelord Nito
 * runs the identical effect one branch below at +1/+1 and measures 47.7% against
 * 48.5% — dead on its bracket, and it has held there since pass 3.
 *
 * WHAT TO WATCH IN PASS 7: Nulgath's body is 1/1 and cannot absorb another cut,
 * so if +1/+1 undershoots there is nothing left to trim and the next move is a
 * body BUFF, not a third nerf.
 */

// EFFECT LABELS HAVE BEEN RENAMED SINCE THIS PASS RAN. The codeToo note below
// quotes the label as it read at the time, deliberately, because this file is a
// record of what was done and not a description of the code today. Current
// names for the two labels named in this pass:
//
//   any_death_buff_2_2  ->  nulgath_any_death_1_1
//   any_death_buff_2_1  ->  nito_any_death_1_1   (the Nito branch this pass cites)
//
// Grep the current name, not the one printed below.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  Nulgath: {
    effect: "Passive: Whenever any minion dies, this minion gains +1/+1",
    codeToo: "any_death_buff_2_2 -> buffMinion(minion, 1, 1)",
    why:
      "61.4% vs a 50.3% bracket after pass 5 moved it from 65.1%. Second cut, and the header explains why that is allowed here: there is a fresh 1500-duel measurement between the two, which is the thing APR never had. Lands on Gravelord Nito's proven number — same effect, one branch below, 47.7% against a 48.5% bracket and stable there for three passes.",
  },
  Gums: {
    atk: 1,
    hp: 1,
    why:
      "66.7% vs a 53.4% bracket, the largest gap left in the roster. Removal AND growth for three mana: it kills anything up to 3/3 and then becomes it, so the printed body is only ever its floor. Cutting the floor is the honest lever — the effect is the card and stays untouched.",
  },
  Joker: {
    atk: 1,
    hp: 1,
    why:
      "60.7% vs 48.1% at cost 1. Looking at two cards in the opponent's hand and shuffling one away is strong disruption on the cheapest body in the game, and a 2/1 at cost 1 is already at the top of its bracket before the text is read.",
  },
  Fort: {
    atk: 4,
    hp: 5,
    why:
      "60.1% vs 50.5%. A vanilla 5/5 at cost 5 with no text and no drawback — the plainest kind of overstatting, and the only thing on the card to adjust.",
  },
  "Eye of Sauron": {
    atk: 4,
    hp: 5,
    why:
      "59.6% vs 50.5%. Revealing one random card from a hand is close to worthless — it is information, and the bot cannot act on it at all — so the 4/6 body is doing every point of that win rate on its own. One HP off puts the body where the bracket is.",
  },

  // ---------------------------------------------------------------- BUFFS
  Meruem: {
    atk: 6,
    hp: 7,
    why:
      "34.6% vs a 50.3% bracket — the worst card in the roster now. A 3/5 at cost 6 is barely over half the bracket's median body, and the effect only answers minions at 2 HP or less, which by the time six mana is available is almost nothing on the board.",
  },
  "Aladdin Lamp": {
    atk: 6,
    hp: 8,
    why:
      "36.4% vs 48.6%. Stealing one card is real value, but it is a one-off, and a 4/6 at cost 7 leaves nothing on the table to show for the turn.",
  },
  Morpheus: {
    atk: 8,
    hp: 10,
    why:
      "34.9% vs 45.5%. The effect is genuinely DOUBLE-EDGED and mostly bad: it destroys your own board and replaces it with random minions from the deck, so playing it usually costs you the position you had. The body has to be worth the turn on its own, and a 6/9 at cost 9 is not. Buffing the body rather than rewriting the effect on purpose — the effect is the card's whole identity and the roster needs cards that gamble.",
  },
  Ouken: {
    atk: 3,
    hp: 2,
    why:
      "38.8% vs 48.4%. Copying an ally's HP is an engine that needs the minion to survive its first turn, and a 2/1 does not survive anything. One point of each puts it over the line where a 1-damage ping stops killing it.",
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
  const beforeText = row[col.effect];
  if (patch.atk !== undefined) row[col.atk] = String(patch.atk);
  if (patch.hp !== undefined) row[col.hp] = String(patch.hp);
  if (patch.keywords !== undefined) row[col.keywords] = patch.keywords;
  if (patch.effect !== undefined) row[col.effect] = patch.effect;
  if (patch.effectId !== undefined) row[col.effectId] = patch.effectId;
  const after = shape(row);

  const moved = before !== after || beforeText !== row[col.effect];
  if (moved) changed += 1;
  console.log(`${moved ? " > " : " = "} ${row[col.name].padEnd(24)} ${before.padEnd(20)} -> ${after}`);
  if (beforeText !== row[col.effect]) console.log(`     text: ${row[col.effect]}`);
  if (patch.codeToo) console.log(`     code: ${patch.codeToo}`);
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
