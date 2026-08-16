/**
 * The FOURTH balance pass. Smaller and more conservative than pass 3, because
 * the gaps are smaller: pass 3 took the roster from 36 outliers to 19, and
 * nothing here is worse than +14.9.
 *
 *   node scripts/apply-balance-pass-4.mjs           # dry run
 *   node scripts/apply-balance-pass-4.mjs --write   # apply
 *
 * Measured over 1500 duels at normal, 2026-07-31, each card against its OWN
 * mana cost bracket. MANA COST IS NEVER TOUCHED.
 *
 * TWO CARDS ARE DELIBERATELY LEFT ALONE, which matters as much as the changes:
 *
 *   APR (+9.4) has been changed in two consecutive passes and pass 1 demonstrably
 *   overshot in the other direction (buffed off 33.8%, came back at 73.9%). Pass 3
 *   closed more than half the gap with one stat. A third consecutive cut on a card
 *   whose last two changes both overshot is how a card gets destroyed.
 *
 *   Detective L (-12.4) is not measurable by this harness at all. `bot.ts` gives
 *   +2.2 only to effectTiming 'ongoing' (bot.ts:85) and L is 'passive', so his
 *   effect is worth EXACTLY ZERO to the bot, and the only card-flow term in the
 *   whole evaluation is `hand.length * 0.8` (bot.ts:151). A draw engine cannot
 *   show its value to a player that cannot value cards. Fix the bot before
 *   trusting his number.
 *
 * That second point generalises, and it is the main finding of this pass: SEVEN
 * of these nineteen carried a bot caveat. The bot has no term for passive
 * effects at all, so every passive-effect card in the game is measured as a
 * bare body. Where a nerf is applied to such a card anyway (Kaku Kaioh), it is
 * because the true value is UNDER-counted and the card is winning regardless.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  Conquest: {
    effect: "Ongoing: Gain +2/+1 for each enemy Good minion.",
    codeToo: "anti_good_grow -> count*2 / count*1",
    why: "60.3% vs a 45.4% bracket. The body (3/6) is far BELOW the cost-9 median of 6/7, so the gap is entirely the effect and cutting the body would aim at the wrong half. This is a compounding engine, not a recalculated aura: every turn's growth is added permanently and survives the Good minions dying. Good is ~35% of the roster, so a full enemy board averaged +5/+3 every turn, for ever.",
  },
  UFO: {
    atk: 5,
    hp: 5,
    why: "61.1% vs 49.8% on the cleanest target in the batch — a pure vanilla beater with no effect, no keywords and nothing depending on it. 6/6 against a cost-6 median of 4/5 was the largest raw body surplus at its tier. 5/5 still sits above the median, which is where a card with no text belongs.",
  },
  Yujiro: {
    atk: 4,
    why: "63.7% vs a 54.4% bracket. A 5/3 at cost 4 is well over the 3/3 median AND comes with a free Freeze on the opposing slot; the freeze is the character, so the body pays.",
  },
  Cthulhu: {
    effect: "All enemy minions lose 1 ATK",
    codeToo: "all_enemy_atk_down_1 -> -1 ATK",
    why: "61.9% vs 53.1% at an 83.8% play rate — the most-played card in the roster. Its body is exactly the tier median, so the effect was carrying all of it: a permanent, board-wide ATK strip that scales with how wide the enemy is, for three mana.",
  },
  Sandworm: {
    atk: 1,
    why: "59.6% vs 48.2%. Taunt plus immunity to everything with 2 or less ATK is already a hard wall at cost 2; a 2/3 body on top of it was over the 1/2 median in both halves. The ward is the card, so the body gives.",
  },
  "All for One": {
    hp: 5,
    why: "59.0% vs 49.3%. Copying and triggering an enemy's effect is open-ended value, and it was riding a body at the tier median. One HP is the smallest move that registers on a 7-drop.",
  },
  "Kaku Kaioh": {
    hp: 3,
    why: "57.5% vs 48.2%. HP is exactly the fuel here: with 0 ATK it never trades, so every point of HP is another attack absorbed and another enemy card discarded. 4 HP at cost 2 is double the tier median. Taunt stays — without it the passive would almost never fire.",
  },
  "Angstrom Levy": {
    atk: 0,
    why: "55.6% vs 47.4%. An ongoing +2/+2 to an ally every turn is an unbounded engine on a 1-drop, and it was also a full body. Same treatment the three alignment anthems got in pass 3: it stays an engine and stops being a beater.",
  },
  "Dr. Heinz Doofenshmirtz": {
    effect: "Ongoing: Roll a dice: Low roll (1-2) = +1/+1 to all enemies Medium roll (3-5) = +1/+1 to itself High roll (6) = +3/+3 to itself",
    codeToo: "doof_dice jackpot -> +3/+3",
    why: "56.4% vs 47.4%. Pass 3 cut the middle band and it barely moved (+10.2 -> +9.0), which proved the jackpot was carrying the card rather than the middle. The 1-in-6 gamble stays, because the gamble is the character; it just pays less.",
  },

  // ---------------------------------------------------------------- BUFFS
  Ouken: {
    atk: 2,
    why: "35.2% vs 48.2%, the worst gap left in the roster. Copying an ally's HP makes it durable and does nothing about the fact that a 1 ATK body cannot use that durability to threaten anything.",
  },
  "John Wick": {
    atk: 2,
    hp: 2,
    why: "35.8% vs 47.4% at a 67.1% play rate — played and losing. His Battlecry is one-shot disruption the opponent often satisfies for free by playing a card they wanted to play anyway. The effect cannot be strengthened without inventing behaviour, so the body is the lever.",
  },
  Bigfoot: {
    atk: 3,
    hp: 4,
    why: "39.2% vs 48.2%, still low after pass 3 freed it to attack at all. Pass 3 fixed the wrong-shaped half twice over: the problem was never survivability, it was that a 1 ATK dodger threatens nothing. Trading a point of HP for two of ATK keeps the cryptid slippery and makes it matter.",
  },
  Homelander: {
    atk: 6,
    hp: 6,
    why: "39.6% vs 49.8%. His Battlecry only pays out when he is your ONLY minion, which is the board state you are least often in and least want to be in — a genuinely restrictive condition, unlike the ones that read restrictive and are not. The body has to be worth six mana without it.",
  },
  "Elden Beast": {
    atk: 4,
    hp: 5,
    why: "39.5% vs 49.4%. Both stats sat below the cost-5 median and the Battlecry is a flat 2 damage restricted to Magic targets — worth about a mana. No unrestricted damage effect exists to swap in, so the body is the honest lever.",
  },
  Dabi: {
    atk: 3,
    why: "41.8% vs 53.1%. One damage to ALL other minions hits your own board too, so it is a genuine cost as often as a benefit; the body should not also be below median.",
  },
  Stain: {
    atk: 2,
    hp: 2,
    why: "38.3% vs 48.2%. Killing a damaged minion is conditional removal that needs the board set up first, and a 1/1 cannot do that setting up itself.",
  },
  Batman: {
    hp: 2,
    why: "39.9% vs 48.2%. Freezing two enemies is real tempo, but a 1/1 dies to anything and the freeze buys a turn he does not survive to use.",
  },

  // ------------------------------------------------------------ LEFT ALONE
  // APR (+9.4) and Detective L (-12.4). Reasons in the header — both are about
  // knowing when NOT to cut, which is the harder half of a late balance pass.
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
