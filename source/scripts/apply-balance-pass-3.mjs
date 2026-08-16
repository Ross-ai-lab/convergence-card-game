/**
 * The THIRD balance pass, run after the opening hand went from 1/2 cards to 2/3.
 *
 *   node scripts/apply-balance-pass-3.mjs           # dry run
 *   node scripts/apply-balance-pass-3.mjs --write   # apply
 *
 * Why there is a third one: raising the opening hand fixed dead openings
 * (20.7% -> 13.0% of players unable to play anything across three turns) and, as
 * always, was not balance-neutral. Re-measuring over 1500 duels produced a
 * materially different outlier list from the one before the change, so the
 * previous list was thrown away rather than tuned to a game that no longer
 * exists.
 *
 * Every number below is a measured win rate against that card's OWN mana cost
 * bracket, never the roster average. Source: `npm run check:balance`, 1500 duels
 * at normal, 2026-07-31.
 *
 * MANA COST IS NEVER TOUCHED. Bodies, keywords and effect magnitudes only.
 * Values are absolute, so running this twice changes nothing the second time.
 *
 * Some entries here are CSV-only. The magnitude nerfs live in `src/engine/game.ts`
 * instead, because that is where the real number is — changing only the printed
 * text would make the card lie and change nothing. Those are marked `codeToo`.
 */

// EFFECT LABELS HAVE BEEN RENAMED SINCE THIS PASS RAN. The codeToo notes below
// quote the labels as they read at the time, deliberately, because this file is
// a record of what was done and not a description of the code today. Current
// names for the labels this pass touched:
//
//   buff_all_friendly_4_neg1  ->  buff_all_friendly_3_neg2
//   any_death_buff_2_1        ->  nito_any_death_1_1
//
// Grep the current name, not the one printed below. Bigfoot's entry is the one
// exception that WAS rewritten in place (dodge_half -> dodge_50): it assigns a
// live effectId rather than describing one, so leaving the old name there would
// have written a label the engine no longer knows if this pass were ever rerun.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS = join(ROOT, "data", "cards.csv");
const write = process.argv.includes("--write");

const CHANGES = {
  // ---------------------------------------------------------------- NERFS
  APR: {
    hp: 3,
    why: "73.9% vs a 53.8% bracket, the single worst outlier in the roster — and a pass-1 OVERSHOOT: pass 1 buffed it to 5 HP and gave it Taunt off a measured 33.8%. HP is the right lever because HP is literally how many enemy minions the lock eats: 0 ATK means it never kills the attacker, so every swing into it disables that minion permanently. At 3 HP it still guarantees at least one permanent lock and the three 3-damage sweeps in the roster can finally answer it. Taunt STAYS — without it nobody is obliged to walk into the trap and the card falls straight back to 33.8%.",
  },
  "Walter White": {
    effect: "Ongoing: Give +1/+1 to all other friendly Neutral minions",
    codeToo: "buff_all_neutral_1 no longer includes itself",
    why: "69.4% vs a 51% bracket. One of three alignment anthems measuring 16-18 points above cost 1 — the largest cluster in the roster, all treated the same way: they stay anthems and stop being beaters. He keeps the thing that makes him Walter White, an 0/2 body that makes everyone else dangerous.",
  },
  "Kagaya Ubuyashiki": {
    effect: "Ongoing: Give +1/+1 to all other friendly Good minions",
    codeToo: "alignment anthem no longer includes itself",
    why: "69.2% vs 51%. Same anthem cluster, same lever, deliberately identical treatment — three symmetric cards fixed three different ways would be an unexplainable roster.",
  },
  Flowey: {
    effect: "Ongoing: Give +1/+1 to all other friendly Evil minions",
    codeToo: "buff_all_evil_1 no longer includes itself",
    why: "67.4% vs 51%. Same anthem cluster, same lever.",
  },
  Gums: {
    atk: 2,
    why: "68.3% vs a 53.8% bracket. The effect — kill anything 3/3 or smaller and permanently absorb its stats — IS the card, so the body is what moves. A 2/2 that eats a minion is still a two-for-one; a 3/2 that eats one was winning its bracket by fifteen points.",
  },
  Chaos: {
    effect: "Ongoing: Give all friendly minions +3/-2",
    codeToo: "buff_all_friendly_4_neg1 HP cost 1 -> 2",
    why: "64.5% vs a 51.8% bracket, already cut once from +4/-1. Board-wide ATK every single turn is the card; the HP price is what made it a bargain, so the price goes up rather than the payout down.",
  },
  "Gravelord Nito": {
    effect: "Passive: Gain +1/+1 when a minion dies",
    codeToo: "any_death_buff_2_1 -> +1/+1",
    why: "62.3% vs 48.2% off an 0/1, the smallest 2-cost body in the game, so there is nothing left to cut in the body. It counts every death on BOTH boards with no cap — the opponent's own trades feed it.",
  },
  "Margit the Fell Omen": {
    effect: "Ongoing: Give a friendly Evil minion +2/+1",
    codeToo: "buff_evil_ally_3_2_heal -> +2/+1, full heal removed",
    why: "59.2% vs 48.2% on a 1/1 body already below its bracket median, so the engine is the problem. The full heal was the hidden half the printed text under-sold: it refreshed an ever-growing minion every turn, so chip damage never stuck. Gyoro Gyoro pays 4 mana for +2/+2 with no heal; Margit paid 2 for more.",
  },
  "Deep Sea King": {
    effect: "Ongoing: If this is your only Evil minion, gain +1/+1.",
    codeToo: "lone_evil_buff -> +1/+1",
    why: "59.8% vs 48.8%, already cut twice. The 'only Evil minion' condition keeps reading as restrictive and keeps not being one — it simply holds on most turns.",
  },
  "Dr. Heinz Doofenshmirtz": {
    effect: "Ongoing: Roll a dice: Low roll (1-2) = +1/+1 to all enemies Medium roll (3-5) = +1/+1 to itself High roll (6) = +4/4 to itself",
    codeToo: "doof_dice middle band -> +1/+1",
    why: "61.2% vs 51%. The middle band is half of all rolls, so it — not the jackpot everyone remembers — was the card's real value. The 1-in-6 jackpot is untouched, because the gamble is the character.",
  },

  // ---------------------------------------------------------------- BUFFS
  Bigfoot: {
    effectId: "dodge_50",
    effect: "Passive: Evades half of incoming attacks.",
    why: "33.6% vs 48.2% at a 67.6% play rate — played constantly and losing, which is a weak card rather than an ignored one. The real defect: `evasive` makes a minion UNABLE TO ATTACK, and Bigfoot has no Taunt, so nothing obliges the enemy to attack it either. Its printed ATK was decoration and its HP defended nothing. Pass 1 raised the HP to 5 for exactly this card and the win rate did not move — proof the body was never the lever. `dodge_50` is the identical 50% evade minus the attack ban, so the cryptid can finally contest the board. Deliberately NOT given Taunt: a 5 HP wall with a 50% dodge that must be attacked is effectively 10 HP of unavoidable wall, which is the shape that took APR to 73.9%.",
  },
  "Time Bomb": {
    keywords: "Taunt",
    effect: "Taunt. Deal 3 damage to all enemy minions.",
    why: "37.8% vs 48.1% at a 76.8% play rate, the highest of any outlier. Exactly the pathology pass 1 diagnosed and fixed on four other cards — a 0 ATK minion cannot attack, so its only job is to be hit, and without Taunt the enemy simply walks past it to the core. Hypnos, APR, Kaku Kaioh and King all got Taunt then; Time Bomb has the same body and was missed.",
  },
  Musashi: { atk: 4, why: "39.4% vs a 52.6% bracket. A legendary swordsman priced at a 2 ATK body while his Battlecry only works on an ALREADY-damaged enemy — a conditional removal that needs setup should not also come on a below-median body." },
  Zoro: { atk: 3, why: "43.8% vs 53.8%. His passive rewards killing, and a 2 ATK body kills almost nothing at cost 3, so the engine never starts." },
  Knov: { atk: 2, hp: 3, why: "39.2% vs 53.8% on a 1/1 — the smallest body in its bracket while carrying Divine Shield AND giving one away. The keywords are the card; the body was simply too small to survive using them." },
  "Grand Master Yoda": { atk: 5, why: "33.3% vs a 47.3% bracket at only a 37.8% play rate — drawn and passed over. A 2/6 at cost 7 is a wall that cannot threaten anything, and a targeted Silence is not worth seven mana on its own." },
  Chrollo: { atk: 3, hp: 5, why: "41.7% vs 52.6% at a 51.3% play rate. Stealing a passive is conditional on the enemy HAVING a passive worth stealing, so the body has to stand on its own when it does not." },
  "Silver Surfer": { atk: 4, hp: 5, why: "38.6% vs 48.8%. He pays a real cost — the summoned minion arrives Chained — on a body below his bracket's median HP." },
  "Ainz Ooal Gown": { atk: 6, why: "32.0% vs a 46.6% bracket, the worst win rate in the roster, at a 42.4% play rate. A 4/8 at cost NINE is far under the 6/7 bracket median, and 'gain a relic each turn' is slow value that a nine-drop cannot afford to wait for." },
  Kuma: { atk: 3, hp: 4, why: "43.8% vs 53.8%. Bouncing a friendly minion for a huge discount is a tempo LOSS this turn for a gain later, so the body has to pay for the turn it costs you." },
  "Fantastic Four": { atk: 3, hp: 3, why: "41.5% vs 52.6%. A 1-damage ping that only chains if it kills is nearly dead text against anything above 1 HP; the body is what the four mana is actually buying." },
  "Sir Nighteye": {
    keywords: "Divine Shield",
    effect: "Divine Shield. Randomly choose to reveal 2 cards in your opponent's hand",
    why: "40.4% vs 51%. Information alone does nothing in a hotseat game where the bot cannot act on it, so the card needed a body effect rather than a bigger reveal. Foresight is his identity — Divine Shield reads as seeing the blow coming.",
  },
  Yubaba: { atk: 3, why: "41.2% vs 52.6%. A kill that the opponent gets a full turn to answer is worth less than an immediate one, so the 4 mana has to buy a bracket-median body too." },

  // ------------------------------------------------------------ LEFT ALONE
  // Detective L (-11.4) is deliberately untouched. His Foresight draw is a card
  // ADVANTAGE engine, and the win rate of a card-draw minion is dragged down by
  // the games where you play him behind and still lose. Buffing the body of a
  // 1-cost draw engine is how a format gets a mandatory turn-one play.
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
  if (patch.effectTiming !== undefined) row[col.effectTiming] = patch.effectTiming;
  const after = shape(row);

  const moved = before !== after || beforeText !== row[col.effect];
  if (moved) changed += 1;
  console.log(`${moved ? " > " : " = "} ${row[col.name].padEnd(24)} ${before.padEnd(20)} -> ${after}`);
  if (beforeText !== row[col.effect]) console.log(`     text: ${row[col.effect]}`);
  if (patch.codeToo) console.log(`     code: ${patch.codeToo}`);
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
console.log("data/cards.csv written. Run: npm run validate:data && npm test && npm run check:balance");
