/**
 * The first real balance pass, applied to `data/cards.csv`.
 *
 *   node scripts/apply-balance-pass.mjs           # show what would change
 *   node scripts/apply-balance-pass.mjs --write   # apply it
 *
 * Every number here came out of `npm run sim` over 3,000 bot-vs-bot duels, and
 * every card is judged against the OTHER CARDS OF ITS OWN COST rather than
 * against the roster average — otherwise "cheap cards get played more often in a
 * mana-limited game" reads as "cheap cards are overpowered" and the whole pass
 * points the wrong way.
 *
 * MANA COST IS NEVER TOUCHED. It is a statement about how powerful a being is in
 * its own fiction and the owner assigned all 175 by hand (see README). So an
 * overpowered card gets a worse body or a smaller effect, and an unplayable one
 * gets a better body — never a different price.
 *
 * Values are absolute, so running this twice changes nothing the second time.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

/**
 * name -> { atk, hp, keywords, effect, why }
 *
 * `why` records the measured win rate against its own cost bracket, so a future
 * pass can tell a deliberate call from a guess.
 */
const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  // Ongoing engines run away with the game: their value is (turns alive x effect),
  // which has no ceiling. The fix is either a smaller tick or a body fragile
  // enough that the engine has to be defended.
  "Carnage Kabuto": {
    hp: 2,
    why: "70.7% vs a 57.5% bracket — +3 ATK every turn forever. Keeps the growth, loses the durability, so it must be protected.",
  },
  Sandworm: {
    hp: 3,
    why: "63.6% vs 49.0% — a 2-mana Taunt that most early minions literally cannot damage. Still a wall, no longer an unanswerable one.",
  },
  "Vergil & Dante & Nero": {
    hp: 5,
    why: "61.2% vs 46.4% — two attacks a turn on a 4/6 body.",
  },

  // These five had their effect MAGNITUDE cut in src/engine/game.ts. The printed
  // text is updated to match, because a card that lies about its own numbers is
  // the exact debt this project already paid off once.
  Kite: {
    effect: "Ongoing: Roll a dice to gain from +1/+1 to +3/+3",
    why: "78.1% vs 57.5%, the strongest card in the game — a full d6 every turn averaged +3.5/+3.5. Now 1-3.",
  },
  "General Grievous": {
    effect: "Ongoing: Give one friendly Tech minion +1/+1.",
    why: "76.5% vs 57.5% — +2/+2 a turn, aimed wherever it helped most, on a 4-mana body.",
  },
  "Deep Sea King": {
    effect: "Ongoing: If this is your only Evil minion, gain +2/+2.",
    why: "70.0% vs 52.0% — the 'only Evil minion' clause reads restrictive and almost never was.",
  },
  Chaos: {
    effect: "Ongoing: Give all friendly minions +3/-1",
    why: "67.5% vs 49.3% — board-wide ATK every turn.",
  },
  "Avatar Aang": {
    effect: "Divine Shield. Ongoing: Gain +1/+1 for each different camp on the board.",
    why: "67.0% vs 50.0% — counting camps AND alignments scaled to +6/+6 a turn. Camps alone caps it at 3.",
  },

  // ---------------------------------------------------------------- BUFFS
  // Two structural problems show up all over the bottom of the table. A minion
  // with 0 ATK cannot attack at all, so its only job is to be hit — and none of
  // these had Taunt, which is the keyword that makes an enemy hit you. And big
  // one-shot effects at 8-10 mana were priced as if the effect carried the card,
  // when at that cost the body has to carry it too.
  Saitama: {
    atk: 10,
    hp: 10,
    why: "32.7% vs 42.1% — the most famous card in the game was one of its worst. A 10-cost 8/8 loses to a 10-cost 7/7 with an effect.",
  },
  Hypnos: {
    hp: 9,
    keywords: "Taunt;Passive",
    effect: "Taunt. Passive: Freeze the enemy minion which attacks this",
    why: "28.4% vs 49.3% — 0 ATK means it can never attack, and without Taunt nothing had to attack it either. It was an 8-mana blank.",
  },
  APR: {
    hp: 5,
    keywords: "Taunt;Passive",
    effect: "Taunt. Passive: After the enemy minion attacks this minion, it can never attack again",
    why: "33.8% vs 48.4% — same trap: a punisher nobody was obliged to walk into.",
  },
  "Kaku Kaioh": {
    hp: 4,
    keywords: "Taunt;Passive",
    effect: "Taunt. Passive: Discard a random enemy card each time they hit this minion",
    why: "37.0% vs 49.0% — same trap again.",
  },
  King: {
    atk: 2,
    hp: 8,
    keywords: "Taunt;Passive",
    effect: "Taunt. Passive: Whenever this minion takes damage, freeze the attacker",
    why: "38.0% vs 46.4% — a 7-mana freeze wall that could be walked straight past.",
  },
  Bigfoot: {
    hp: 5,
    why: "34.2% vs 49.0% — it cannot attack, so ATK is decoration; it needed to be worth playing as a body that survives.",
  },
  Korosensei: {
    atk: 6,
    hp: 7,
    why: "35.6% vs 49.3% — damage immunity under 4 ATK is real, but 4/6 is a 4-mana body at 8 mana.",
  },
  "Silver Surfer": {
    atk: 3,
    hp: 4,
    why: "35.7% vs 52.0% — a 1/1 shell at 5 mana; the summon rarely paid for it.",
  },
  "The Five Convicts": {
    atk: 3,
    hp: 3,
    why: "35.1% vs 48.4% — a single Freeze does not carry a 2/1.",
  },
  "Eye of Sauron": {
    atk: 4,
    hp: 6,
    why: "38.3% vs 52.0% — revealing one card is the weakest effect in the roster, so the body has to be the card.",
  },
  Morpheus: {
    atk: 6,
    hp: 9,
    why: "32.1% vs 42.5% — its effect replaces your own board at random, which is often a downside. Paid for in stats.",
  },
  Whitebeard: {
    atk: 6,
    hp: 8,
    why: "35.5% vs 49.3% — 2 damage to ALL other minions hits his own side too; the worst card in the roster before this.",
  },
  "Light Yagami": {
    atk: 4,
    hp: 9,
    why: "34.0% vs 42.5% — killing the smallest enemy minion is not a 9-mana effect on a 1-ATK body.",
  },
  "Gandalf the White": {
    atk: 3,
    hp: 4,
    why: "41.8% vs 50.0% — board-wide Divine Shield is strong, but a 1/1 died before it mattered.",
  },
  "Big Mom": {
    atk: 3,
    hp: 5,
    why: "42.1% vs 52.0% — the effect eats one of your own minions, so it starts behind.",
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
  const name = row[col.name];
  const patch = CHANGES[name];
  if (!patch) continue;
  seen.add(name);

  const before = `${row[col.atk]}/${row[col.hp]}${row[col.keywords] ? ` [${row[col.keywords]}]` : ""}`;
  if (patch.atk !== undefined) row[col.atk] = String(patch.atk);
  if (patch.hp !== undefined) row[col.hp] = String(patch.hp);
  if (patch.keywords !== undefined) row[col.keywords] = patch.keywords;
  if (patch.effect !== undefined) row[col.effect] = patch.effect;
  const after = `${row[col.atk]}/${row[col.hp]}${row[col.keywords] ? ` [${row[col.keywords]}]` : ""}`;

  if (before !== after) changed += 1;
  console.log(`${before === after ? " = " : " > "} ${name.padEnd(24)} ${before.padEnd(22)} -> ${after}`);
  console.log(`     ${patch.why}`);
}

for (const name of Object.keys(CHANGES)) {
  if (!seen.has(name)) console.error(`  !! "${name}" is not in cards.csv — check the spelling`);
}

console.log(`\n${changed} cards would change (${Object.keys(CHANGES).length} listed).`);
if (!write) {
  console.log("Dry run. Pass --write to apply.");
  process.exit(0);
}

writeFileSync(CARDS, `${rows.map((r) => r.map(esc).join(",")).join("\n")}\n`, "utf8");
console.log("data/cards.csv written. Run: npm run validate:data && npm run test && npm run sim");
