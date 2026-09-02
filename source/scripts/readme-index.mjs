/**
 * Keeps README.md in a fixed section order and regenerates its navigation block.
 *
 * The README is the only documentation this project has and it is now about
 * 150 KB, which is past the point where a whole-file read returns the whole
 * file: an agent Read of it truncates and hands back the first slice, silently,
 * so a session can answer confidently from a fraction of the page. Two things
 * fix that, and both of them go stale the moment anyone edits by hand — the
 * banner quotes a byte count, and the index quotes headings. So neither is
 * written by hand.
 *
 *   node scripts/readme-index.mjs          rewrite README.md in place
 *   node scripts/readme-index.mjs --check  fail if it is out of date
 *
 * ORDER lives here and nowhere else. A new `##` section that is not listed is
 * an ERROR rather than a silent append: the point of a fixed order is that
 * somebody decided where each thing goes, and a section that lands wherever it
 * was typed is the drift this exists to stop. Nothing is ever dropped — an
 * unlisted section is parked at the end and named in the failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const README = resolve(dirname(fileURLToPath(import.meta.url)), "../../README.md");

/**
 * The page in reading order, grouped.
 *
 * The grouping answers "what am I here to do": find out what this is, look up a
 * rule, find a file, change a card, change how it looks, argue about balance.
 * That is the order a session arrives in, and it is not the order the sections
 * were written in.
 */
const ORDER = [
  [
    "What this is",
    ["Version 1.0 — complete, 21 August 2026", "What Convergence is", "What the game still needs"],
  ],
  [
    "How the game plays",
    [
      "Rules at a glance",
      "Controls and modes",
      "Cards and card language",
      "Ascension Relics",
      "Gradual card unlocking",
    ],
  ],
  [
    "The code, and how to run it",
    ["Project structure and source of truth", "Run and verify", "Parallel work"],
  ],
  ["Changing the game", ["Changing cards and effects", "Engine rules that must stay coherent"]],
  ["Look, sound and feel", ["Interface and card faces", "The rarity shine", "Assets and audio"]],
  ["Balance and the bot", ["Balance, pacing, and bot"]],
  [
    "Project reference",
    [
      "Contributing",
      "Development lessons",
      "Included materials and links",
      "Fan-project notice",
      "Sources",
    ],
  ],
];

const NAV_START = "<!-- README-NAV-START -->";
const NAV_END = "<!-- README-NAV-END -->";

/** GitHub's anchor rules, which is what a `[text](#anchor)` link has to match. */
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Splits the file into everything before the first `##` and one block per `##`. */
function parse(text) {
  const lines = text.split("\n");
  const blocks = [];
  let head = [];
  let current = null;
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith("```")) fenced = !fenced;
    const isHeading = !fenced && /^## (?!#)/.test(line);
    if (isHeading) {
      if (current) blocks.push(current);
      current = { title: line.slice(3).trim(), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
    else head.push(line);
  }
  if (current) blocks.push(current);
  return { head, blocks };
}

/** The `###` headings inside one `##` block, for the second level of the index. */
function subsections(block) {
  const found = [];
  let fenced = false;
  for (const line of block.lines) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && /^### (?!#)/.test(line)) found.push(line.slice(4).trim());
  }
  return found;
}

function buildNav(blocks, byteLength) {
  const byTitle = new Map(blocks.map((block) => [block.title, block]));
  const tokens = Math.round(byteLength / 4 / 1000);
  const readable = Math.min(99, Math.round((25000 / (byteLength / 4)) * 100));
  const out = [
    NAV_START,
    `> **BIG PAGE — do NOT read this file whole.** It is ${byteLength.toLocaleString("en-US")} bytes, roughly ${tokens}k tokens. One whole-file Read truncates at 25,000 tokens and returns only the first ~${readable}% of it, so answering from that view means answering from a fraction of the page. Read one section instead:`,
    ">",
    '> 1. `rg -n "^## " README.md` — every section is a `##` heading, so this prints a live, never-stale index with current line numbers.',
    "> 2. `Read` with `offset` = that section's line and `limit` = the gap to the next heading.",
    ">",
    '> Chasing a symptom rather than a section: `rg -n -C3 "<3-4 distinctive words>" README.md`.',
    "",
    "**Sections, in reading order.** Sub-entries are the `###` headings inside each one.",
    "",
  ];
  for (const [group, titles] of ORDER) {
    out.push(`**${group}**`);
    out.push("");
    for (const title of titles) {
      const block = byTitle.get(title);
      if (!block) continue;
      out.push(`- [${title}](#${anchor(title)})`);
      for (const sub of subsections(block)) out.push(`  - [${sub}](#${anchor(sub)})`);
    }
    out.push("");
  }
  out.push(NAV_END);
  return out.join("\n");
}

function build(text) {
  const { head, blocks } = parse(text);
  const wanted = ORDER.flatMap(([, titles]) => titles);
  const byTitle = new Map(blocks.map((block) => [block.title, block]));
  const unlisted = blocks.filter((block) => !wanted.includes(block.title));

  const ordered = [];
  for (const title of wanted) {
    const block = byTitle.get(title);
    if (block) ordered.push(block);
  }
  ordered.push(...unlisted);

  // The head keeps the title and the "Use this page when" line; the old nav
  // block, whatever shape it was in, is replaced wholesale.
  const kept = [];
  let skipping = false;
  for (const line of head) {
    if (line.includes(NAV_START) || line.includes("<!-- KB-JUMP-START -->")) skipping = true;
    else if (line.includes(NAV_END) || line.includes("<!-- KB-JUMP-END -->")) skipping = false;
    else if (!skipping) kept.push(line);
  }
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();

  const body = ordered.map((block) => block.lines.join("\n").replace(/\n+$/, "")).join("\n\n");
  // Two passes: the banner quotes the finished file's own size, so the file has
  // to be assembled once before the number is known and once with it in place.
  const withoutNav = `${kept.join("\n")}\n\n${body}\n`;
  const size = Buffer.byteLength(withoutNav, "utf8");
  const nav = buildNav(ordered, size + 1800);
  const final = `${kept.join("\n")}\n\n${nav}\n\n${body}\n`;
  return { final, unlisted };
}

const original = readFileSync(README, "utf8");
const { final, unlisted } = build(original);
const check = process.argv.includes("--check");

if (unlisted.length > 0) {
  console.error("README section order is incomplete. Add these to ORDER in scripts/readme-index.mjs:");
  for (const block of unlisted) console.error(`  ${block.title}`);
  console.error("They have been parked at the end of the page rather than dropped.");
}

if (check) {
  if (final !== original) {
    console.error("README.md is out of order or its navigation block is stale. Run: node scripts/readme-index.mjs");
    process.exit(1);
  }
  console.log("README navigation is current.");
} else if (final === original) {
  console.log("README navigation is already current.");
} else {
  writeFileSync(README, final, "utf8");
  console.log(`README rewritten: ${Buffer.byteLength(final, "utf8").toLocaleString("en-US")} bytes.`);
}

if (unlisted.length > 0) process.exit(1);
