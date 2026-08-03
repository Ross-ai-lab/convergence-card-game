/**
 * The FIFTH balance pass.
 *
 *   node scripts/apply-balance-pass-5.mjs           # dry run
 *   node scripts/apply-balance-pass-5.mjs --write   # apply
 *
 * Measured over 1500 duels at normal, each card against its OWN mana cost
 * bracket. MANA COST IS NEVER TOUCHED.
 *
 * FIFTEEN cards, and fourteen of them are pure body changes. That is deliberate:
 * a stat edit needs no engine work, so it cannot ship a card whose text says one
 * thing while its code does another — the trap pass 3 documented. The single
 * exception (Nulgath) is called out below and edited in BOTH halves.
 *
 * DETECTIVE L IS BUFFED THIS TIME, reversing pass 4's decision to leave him
 * alone. Pass 4's stated reason was that the bot has no term for passive effects
 * and no card-flow term at all, so his number meant nothing. Both of those were
 * fixed by the bot pass that followed it, and the claim was then re-tested
 * directly: given the weakest card in the game and the strongest, the bot takes
 * the strongest, in either presentation order. It CAN value a drawn card now.
 *
 * What the re-test actually found is smaller and stranger. Across 40 bot-vs-bot
 * duels his Foresight opened ONCE — he has to be drawn, played, and still alive
 * at the next draw out of a shared 175-card deck, so his text fires in roughly
 * one duel in ten and cannot move a win rate built from a hundred and fifty of
 * them. His 35.1% is very nearly the win rate of a 1/1 body. He is not
 * unmeasurable; he is a card whose effect almost never happens, and a 1/1 body
 * at cost 1 is simply under-statted. So the body is what gets fixed.
 *
 * APR IS LEFT ALONE AGAIN (+8.5). Two consecutive passes changed it and pass 1
 * demonstrably overshot in the other direction (buffed off 33.8%, came back at
 * 73.9%). A third cut on a card whose history is two overshoots is how a card
 * gets destroyed. It stays on the watchlist.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  Nulgath: {
    effect: "Passive: Whenever any minion dies, this minion gains +1/+2",
    codeToo: "any_death_buff_2_2 -> buffMinion(minion, 1, 2)",
    why:
      "65.1% vs a 50.1% bracket, the worst outlier in the roster. Unbounded growth off EVERY death on BOTH boards, so the opponent's own trades feed it. The body is already 1/1 and cannot be cut, so this is the one effect edit in the pass. The calibration is not a guess: Gravelord Nito runs the same shape one branch below, was cut from +2/+1 to +1/+1 in pass 3, and now measures 47.7% against a 48.5% bracket — dead on. Nulgath costs 6 to Nito's 2, so it keeps the faster HP growth and loses the ATK growth, which is the half that runs the clock.",
  },
  "One-Eyed Owl": {
    atk: 4,
    hp: 4,
    why:
      "68.0% vs a 54.5% bracket — the largest gap at any cost. A 5/5 for 4 with 'Chained' as its only text is a vanilla body priced like a drawback card, and Chained wears off. Straight body cut; nothing else on the card to aim at.",
  },
  Albion: {
    atk: 4,
    hp: 5,
    why: "63.7% vs 54.5%, the same shape as One-Eyed Owl and cut less hard because the gap is smaller.",
  },
  "Bill Cipher": {
    atk: 6,
    hp: 6,
    why:
      "59.6% vs a 45.2% bracket. Locking an enemy SLOT into random attacks is permanent and unanswerable, and it arrives on a 7/7. Played only 20% of the time it is drawn (cost 10), so the body is the safe lever — the effect is the reason to play it and stays intact.",
  },
  "Mob Psycho": {
    atk: 5,
    hp: 5,
    why:
      "57.8% vs 45.2%. Another unbounded ongoing (+2/+2 a turn) on a body that was already at the cost-9 median. The engine is the card; the body should not also be free.",
  },
  "Ten Tails": {
    atk: 5,
    hp: 6,
    why: "56.3% vs 45.2%. Removal of choice plus a top-of-bracket body. One point off each.",
  },
  "Vergil & Dante & Nero": {
    atk: 3,
    why:
      "57.9% vs 48.7%. Double attack multiplies ATK, so ATK is the only honest lever — cutting HP would leave the damage output untouched. 4 -> 3 takes its per-turn output from 8 to 6.",
  },
  "Giant Tree": {
    keywords: "",
    effect: "Ongoing: Give all other friendly Nature minions +2/+1",
    why:
      "63.7% vs 53.1% at cost 3. Nature is 65 of the 175 cards, so this anthem is live in most decks, and Divine Shield on a 1/1 engine means the cheapest board-wide buff in the game also survives its first answer. Removing the shield leaves the anthem exactly as strong and makes it killable, which is the correct pressure valve for a 1-cost-shaped body. Keyword only — no engine change, the aura is untouched.",
  },

  // ---------------------------------------------------------------- BUFFS
  Thanos: {
    atk: 9,
    hp: 10,
    why:
      "30.2% vs a 45.2% bracket — the worst card in the game. A 5/7 at cost 10 is barely half the bracket's median body, and the effect is SYMMETRIC (both players destroy and discard), so it is close to worth nothing on average. Everything he has to offer has to be in the body.",
  },
  Doomsday: {
    atk: 8,
    hp: 9,
    why:
      "32.2% vs 45.2%. A 5/6 at cost 9 is far under the bracket, and camp-immunity-after-being-attacked only pays off if it survives the first hit, which at 6 HP it usually does not.",
  },
  "Light Yagami": {
    atk: 7,
    why:
      "35.2% vs 45.2%. 4 ATK at cost 9 is the lowest clock in the bracket; the 9 HP already survives. Destroying the LOWEST-attack enemy is the weakest removal in the game — it takes the target the opponent cares least about.",
  },
  "Thirteen Lords of Chaos": {
    atk: 6,
    hp: 7,
    why:
      "37.1% vs 50.1%. The effect needs a friendly EVIL minion already on the board, so it is dead on curve and dead in half of all decks. A 4/5 at cost 6 does not carry the conditional.",
  },
  Kizaru: {
    atk: 6,
    hp: 7,
    why: "37.1% vs 48.7%. A 4/5 plus one Divine Shield is a 7-cost paying for a 4-cost's worth of board.",
  },
  Gilgamesh: {
    atk: 7,
    hp: 7,
    why:
      "40.2% vs 50.3%. A relic every turn is genuinely strong, but relics arrive by luck and a 5/5 at cost 8 dies before enough of them land.",
  },
  Mahoraga: {
    atk: 5,
    hp: 6,
    why:
      "40.7% vs 50.1%. Once-per-enemy-minion-ever is a real ward, but a 3/5 threatens nothing, so the opponent simply ignores it and it does no work at all — the same failure Bigfoot had in pass 1, where the body was never the lever.",
  },
  "Detective L": {
    atk: 2,
    hp: 3,
    why:
      "35.1% vs 47.6%. See the header: his effect fires in about one duel in ten, so the measured number IS his body's, and a 1/1 at cost 1 is under the bracket. Buffing the body rather than the text on purpose — the text is fine, it is just rare.",
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
