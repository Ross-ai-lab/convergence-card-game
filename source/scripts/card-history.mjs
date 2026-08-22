/**
 * What has ever happened to one card.
 *
 * Written after an afternoon spent proving, by hand, that a single card's effect
 * had not been silently reverted. The answer took a full investigation: walking
 * every save of `cards.csv`, parsing each version, and diffing one row across
 * five months. That should be one command, because the question is not rare and
 * the panic it causes is real - the owner plays the published game and cannot
 * see a change land, so "did my change survive?" is the question he actually has.
 *
 * Two modes:
 *   node scripts/card-history.mjs "Shibukawa"   one card, every change, dated
 *   node scripts/card-history.mjs --flips       every card whose value went A -> B -> A
 *
 * The second mode is the one that answers "is this happening everywhere?" -
 * an A -> B -> A shape is what a lost change looks like in data, where a plain
 * A -> B is just an edit.
 *
 * Cards are tracked by ID, never by name, because names change too (c169 went
 * from "An Order of Heavy Knights" to "Knight"). Searching either name finds it.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseCsv, projectRoot } from "./card-tools.mjs";

const REPO = path.resolve(projectRoot, "..");
const CSV = "source/data/cards.csv";

/** Fields worth reporting, in the order a person would read them, plainly named. */
const FIELDS = [
  ["name", "name"],
  ["cost", "mana cost"],
  ["atk", "attack"],
  ["hp", "health"],
  ["rarity", "rarity"],
  ["camp", "camp"],
  ["alignment", "alignment"],
  ["keywords", "keywords"],
  ["effectId", "effect id"],
  ["effectTiming", "timing"],
  ["effect", "printed text"],
  ["flavor", "flavour line"],
  ["origin", "origin"],
  ["art", "artwork"],
];

function git(...args) {
  return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Every save that touched the card table, oldest first. */
function commits() {
  return git("log", "--reverse", "--format=%H%ad%s", "--date=short", "--", CSV)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split("");
      return { sha, date, subject };
    });
}

function cardsAt(sha) {
  let text;
  try {
    text = git("show", `${sha}:${CSV}`);
  } catch {
    return null; // the file did not exist yet at this point
  }
  if (!text.trim()) return null;
  const byId = new Map();
  for (const row of parseCsv(text)) {
    if (row.id) byId.set(row.id, row);
  }
  return byId;
}

/**
 * Walk every save once and record, per card, only the points where something
 * changed. Reading all ~50 versions is the expensive part, so both modes share it.
 */
function buildHistory() {
  const timeline = new Map(); // id -> [{ date, subject, row, changes }]
  const names = new Map(); // id -> Set of every name it has ever had
  let previous = new Map();

  for (const commit of commits()) {
    const current = cardsAt(commit.sha);
    if (!current) continue;

    for (const [id, row] of current) {
      if (!names.has(id)) names.set(id, new Set());
      names.get(id).add(row.name);

      const before = previous.get(id);
      if (!before) {
        timeline.set(id, [{ ...commit, row, changes: null }]); // first appearance
        continue;
      }
      const changes = FIELDS.filter(([key]) => (before[key] ?? "") !== (row[key] ?? "")).map(([key, label]) => ({
        key,
        label,
        from: before[key] ?? "",
        to: row[key] ?? "",
      }));
      if (changes.length) timeline.get(id)?.push({ ...commit, row, changes });
    }
    previous = current;
  }
  return { timeline, names };
}

function truncate(value, limit = 96) {
  const text = value === "" ? "(empty)" : value;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * Show the two values WHERE THEY DIFFER, not from character one.
 *
 * Truncating both from the start is worse than useless on long effect text: a
 * change that adds a full stop at the end printed two visibly identical lines
 * with an arrow between them, which reads as a bug in the tool rather than as a
 * real one-character edit. Find the point they part company and window there.
 */
function diffWindow(from, to, limit = 60) {
  let at = 0;
  while (at < from.length && at < to.length && from[at] === to[at]) at += 1;
  const start = Math.max(0, at - Math.floor(limit / 3));
  const clip = (value) => {
    if (value === "") return "(empty)";
    const slice = value.slice(start, start + limit);
    return `${start > 0 ? "…" : ""}${slice}${start + limit < value.length ? "…" : ""}`;
  };
  return [clip(from), clip(to)];
}

/** Did this field return to a value it already held before? That is a lost change. */
function returnedToEarlier(entries, key, atIndex) {
  const valueNow = entries[atIndex].row[key] ?? "";
  for (let i = 0; i < atIndex - 1; i += 1) {
    if ((entries[i].row[key] ?? "") === valueNow) return true;
  }
  return false;
}

function reportCard(id, entries, allNames) {
  const current = entries[entries.length - 1].row;
  const aliases = [...allNames].filter((n) => n !== current.name);
  console.log(`\n${current.name}  (${id})`);
  if (aliases.length) console.log(`  also known as: ${aliases.join(", ")}`);
  console.log(`  ${entries.length} point${entries.length === 1 ? "" : "s"} of change on record\n`);

  entries.forEach((entry, index) => {
    if (!entry.changes) {
      console.log(`  ${entry.date}   first appeared`);
      console.log(`      ${current.cost} mana, ${entry.row.atk}/${entry.row.hp}, ${entry.row.rarity}, ${entry.row.camp}, ${entry.row.alignment}`);
      console.log(`      ${truncate(entry.row.effect)}`);
      console.log(`      effect id: ${entry.row.effectId}`);
    } else {
      const reverted = entry.changes.filter((c) => returnedToEarlier(entries, c.key, index));
      const flag = reverted.length ? "   << RETURNED TO AN EARLIER VALUE" : "";
      console.log(`  ${entry.date}   ${entry.changes.length} field${entry.changes.length === 1 ? "" : "s"} changed${flag}`);
      for (const change of entry.changes) {
        const mark = reverted.includes(change) ? " *" : "  ";
        const [from, to] = diffWindow(change.from, change.to);
        console.log(`    ${mark}${change.label.padEnd(13)} ${from}`);
        console.log(`      ${" ".repeat(13)} -> ${to}`);
      }
    }
    console.log(`      saved as: "${entry.subject}"`);
    console.log("");
  });

  console.log("  RIGHT NOW");
  console.log(`      ${current.cost} mana, ${current.atk}/${current.hp}, ${current.rarity}, ${current.camp}, ${current.alignment}`);
  console.log(`      keywords: ${current.keywords || "(none)"}`);
  console.log(`      text:     ${current.effect}`);
  console.log(`      effect id: ${current.effectId}, timing: ${current.effectTiming}`);
  console.log("");
  console.log("  This is the SAVED state. The published game is only guaranteed to match it");
  console.log("  after `npm run publish:pages` and a live check of the play URL.");
}

/**
 * Which fields count as a card being CHANGED BACK, rather than tuned.
 *
 * Only the effect id, and that narrowness was measured rather than guessed.
 * Every field at once returned 26 hits; adding timing, keywords and printed text
 * to the id returned 17. Both lists were almost entirely balance tuning (attack
 * 3 -> 4 -> 3) and wording normalisation ("Invulnerable" -> "invulnerable"),
 * which buried the two real cases. The effect id is the one field nobody
 * re-treads by accident, so on its own it is the honest signal.
 */
const FLIP_FIELDS = new Set(["effectId"]);

function reportFlips(timeline, names, everyField) {
  const found = [];
  for (const [id, entries] of timeline) {
    for (let i = 0; i < entries.length; i += 1) {
      if (!entries[i].changes) continue;
      const reverted = entries[i].changes.filter(
        (c) => (everyField || FLIP_FIELDS.has(c.key)) && returnedToEarlier(entries, c.key, i),
      );
      if (reverted.length) found.push({ id, entry: entries[i], reverted, entries });
    }
  }
  console.log(`\nChanges that went back to something the card had before: ${found.length}`);
  console.log(
    everyField
      ? "  Checking EVERY field. Expect balance tuning and wording tidies in here.\n"
      : "  Checking the effect id: what the card mechanically DOES.\n  Stats and wording are excluded because they legitimately re-tread old values.\n  Add `all` to see every field instead.\n",
  );
  if (!found.length) {
    console.log("  Nothing. No card has had a change undone and then redone.");
    return;
  }
  for (const { id, entry, reverted, entries } of found) {
    const current = entries[entries.length - 1].row;
    console.log(`  ${entry.date}  ${current.name} (${id})  -  saved as "${entry.subject}"`);
    for (const change of reverted) {
      console.log(`      ${change.label}: ${truncate(change.from, 44)}  ->  ${truncate(change.to, 44)}   (a value it held earlier)`);
    }
    console.log("");
  }
  console.log(`  Names checked: ${names.size} cards.`);
}

function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Which card? e.g.  npm run card-history -- "Shibukawa"');
    console.error("Or pass --flips to list every value that was ever undone and redone.");
    process.exitCode = 1;
    return;
  }

  const { timeline, names } = buildHistory();

  if (query.startsWith("--flips") || query.startsWith("--reverts")) {
    reportFlips(timeline, names, /\ball\b/.test(query));
    return;
  }

  const needle = query.toLowerCase();
  const exact = [...names].filter(([id, set]) => id.toLowerCase() === needle || [...set].some((n) => n.toLowerCase() === needle));
  const partial = [...names].filter(([id, set]) => id.toLowerCase().includes(needle) || [...set].some((n) => n.toLowerCase().includes(needle)));
  const matches = exact.length ? exact : partial;

  if (!matches.length) {
    console.error(`No card matches "${query}".`);
    console.error("Search accepts an id (c174), a current name, or any name the card used to have.");
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(`"${query}" matches ${matches.length} cards. Be more specific:`);
    for (const [id, set] of matches) console.error(`  ${id}  ${[...set].join(" / ")}`);
    process.exitCode = 1;
    return;
  }

  const [id, set] = matches[0];
  reportCard(id, timeline.get(id), set);
}

main();
