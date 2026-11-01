/**
 * Keep the official lore page in step with the card rosters.
 *
 * The lore page authors each Star Chart profile's prose: epithet, lore, quote,
 * strengths, weaknesses, signature move, rivals and the six chart values. The
 * card rosters own everything printed on a card. Before this script, the page
 * carried its own copy of cost, ATK, HP, rarity, camp, alignment and name, and
 * a rebalance left 98 profiles showing numbers the game no longer used.
 *
 * This script copies the card-owned fields from cards.csv and relics.csv into
 * every profile, puts the profiles in roster order, and rebuilds the Star
 * Charts grid from them. Each grid portrait links materials/lore/portraits/<id>.webp,
 * so the page stays small and phones fetch portraits as they scroll. A card
 * with no portrait file there links its card art from the published game.
 *
 *   node scripts/sync-lore-page.mjs           rewrite the page when it is stale
 *   node scripts/sync-lore-page.mjs --check   fail when the page is stale
 */

import fs from "node:fs";
import path from "node:path";
import { projectRoot, readCards, readRelics } from "./card-tools.mjs";

const repoRoot = path.resolve(projectRoot, "..");
const pagePath = path.join(repoRoot, "materials", "Convergence-Official-Lore.html");
const portraitDir = path.join(repoRoot, "materials", "lore", "portraits");
const checkOnly = process.argv.includes("--check");

const RARITY_NAME = { Black: "Rare", Purple: "Epic", Yellow: "Legendary", Red: "Mythic", Relic: "Relic" };
const RARITY_DOT = { Black: "#8a93bd", Purple: "#bb8bff", Yellow: "#f7c948", Red: "#ff5c8a", Relic: "#54d6c3" };
// Grid accents are bright for the dark page; profile accents are darker for the light popup.
const CAMP_GLOW = { Magic: "#bb8bff", Nature: "#6dff9b", Tech: "#46e0ff", ALL: "#d5a84c", Relic: "#54d6c3" };
const CAMP_ACCENT = { Magic: "#7a52c8", Nature: "#2f9c63", Tech: "#1a86a8", ALL: "#d5a84c", Relic: "#1f9e8f" };
const AXES = ["STR", "TUF", "WIL", "MAG", "INT", "AGI"];
const AXIS_KEYS = ["str", "tuf", "wil", "mag", "int", "agi"];

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

function between(text, start, end, from = 0) {
  const a = text.indexOf(start, from);
  if (a < 0) throw new Error(`Lore page marker not found: ${start}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Lore page marker not found: ${end}`);
  return { from: a + start.length, to: b };
}

/** The static hexagon each grid card carries, drawn 152 by 150. */
function radar(vals, glow) {
  const cx = 76, cy = 70, radius = 44;
  const at = (i, value) => {
    const angle = (-90 + i * 60) * Math.PI / 180;
    const r = radius * value / 10;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const pts = (value) => AXES.map((_, i) => at(i, value).map((n) => n.toFixed(1)).join(",")).join(" ");
  let svg = '<svg viewBox="0 0 152 150" class="rdr" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="stat hexagon">';
  for (const level of [2, 4, 6, 8, 10]) {
    svg += `<polygon points="${pts(level)}" fill="none" stroke="#2a3157" stroke-width="${level === 10 ? 1 : 0.6}"/>`;
  }
  for (let i = 0; i < 6; i += 1) {
    const [x, y] = at(i, 10);
    svg += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#232a4d" stroke-width="0.6"/>`;
  }
  const data = vals.map((value, i) => at(i, value).map((n) => n.toFixed(1)));
  svg += `<polygon points="${data.map((p) => p.join(",")).join(" ")}" fill="${glow}33" stroke="${glow}" stroke-width="1.7" stroke-linejoin="round"/>`;
  for (const [x, y] of data) svg += `<circle cx="${x}" cy="${y}" r="1.8" fill="${glow}"/>`;
  const labels = [["76.0", "13.0", "middle"], ["124.5", "41.0", "start"], ["124.5", "102.0", "start"],
    ["76.0", "130.0", "middle"], ["27.5", "102.0", "end"], ["27.5", "41.0", "end"]];
  labels.forEach(([x, y, anchor], i) => {
    svg += `<text x="${x}" y="${y}" text-anchor="${anchor}" class="rl">${AXES[i]} <tspan class="rv">${vals[i]}</tspan></text>`;
  });
  return `${svg}</svg>`;
}

function portraitFor(id, art) {
  // Linked, never embedded: embedded portraits once made this page 7 MB.
  if (fs.existsSync(path.join(portraitDir, `${id}.webp`))) return `lore/portraits/${id}.webp`;
  return `../play${art}`;
}

const page = fs.readFileSync(pagePath, "utf8");
const cards = readCards().map((card) => ({ ...card, kind: "card" }));
const relics = readRelics().map((relic) => ({ ...relic, kind: "relic" }));
const roster = [...cards, ...relics];

// Profiles.
const detailSpan = between(page, "window.CV_DETAIL=", ";</script>");
const details = JSON.parse(page.slice(detailSpan.from, detailSpan.to));
const missing = roster.filter((card) => !details[card.id]).map((card) => `${card.id} ${card.name}`);
if (missing.length) throw new Error(`The lore page has no Star Chart profile for: ${missing.join(", ")}`);
const rosterIds = new Set(roster.map((card) => card.id));
const orphans = Object.keys(details).filter((id) => !rosterIds.has(id));
if (orphans.length) throw new Error(`The lore page profiles cards that no longer exist: ${orphans.join(", ")}`);

const synced = {};
for (const card of roster) {
  const relic = card.kind === "relic";
  const camp = relic ? "Relic" : card.camp;
  const profile = details[card.id];
  synced[card.id] = {
    ...profile,
    name: card.name,
    origin: card.origin,
    rar: RARITY_NAME[relic ? "Relic" : card.rarity],
    camp,
    align: relic ? "Relic" : card.alignment,
    cost: Number(card.cost),
    atk: relic ? 0 : Number(card.atk),
    hp: relic ? 0 : Number(card.hp),
    cc: CAMP_ACCENT[camp],
  };
  if (!synced[card.id].rar || !synced[card.id].cc) throw new Error(`Unknown rarity or camp on ${card.id} ${card.name}`);
}
const detailJson = JSON.stringify(synced);

// Grid.
const gridOpen = '<div class="sc-grid" id="scGrid">';
const gridFrom = page.indexOf(gridOpen) + gridOpen.length;
if (gridFrom < gridOpen.length) throw new Error("Star Charts grid not found on the lore page");
const gridTo = page.indexOf("</div>", page.lastIndexOf("</article>", page.indexOf('<div id="tab-fights"')));
const oldGrid = page.slice(gridFrom, gridTo);
const existingNotes = new Map();
for (const match of oldGrid.matchAll(/<article class="sc-card" data-id="([^"]+)"[\s\S]*?<\/article>/g)) {
  const note = match[0].match(/<p class="sc-note">([^<]*)<\/p>/);
  if (note) existingNotes.set(match[1], note[1]);
}

const articles = roster.map((card) => {
  const d = synced[card.id];
  const glow = CAMP_GLOW[d.camp];
  const rarity = card.kind === "relic" ? "Relic" : card.rarity;
  const note = existingNotes.get(card.id) ?? esc(d.playstyle);
  const total = d.vals.reduce((sum, value) => sum + value, 0);
  const axes = AXIS_KEYS.map((key, i) => `data-${key}="${d.vals[i]}"`).join(" ");
  const meta = card.kind === "relic" ? `${esc(d.origin)} · Relic` : `${esc(d.origin)} · ${esc(d.camp)} · ${esc(d.align)}`;
  return `<article class="sc-card" data-id="${card.id}" data-name="${esc(d.name.toLowerCase())}" data-origin="${esc(d.origin.toLowerCase())}" data-camp="${d.camp}" data-align="${esc(d.align)}" data-rarity="${rarity}" data-total="${total}" ${axes} style="--cc:${glow}" title="${esc(d.name)} — ${note}">`
    + `<img class="sc-portrait" loading="lazy" src="${portraitFor(card.id, card.art)}" alt="${esc(d.name)}">`
    + `<div class="sc-body"><h3 class="sc-name">${esc(d.name)}</h3>`
    + `<p class="sc-meta"><span class="sc-dot" style="background:${RARITY_DOT[rarity]}"></span>${meta}</p>`
    + `${radar(d.vals, glow)}<p class="sc-note">${note}</p></div></article>`;
});

let next = page.slice(0, gridFrom) + articles.join("\n") + page.slice(gridTo);
const span = between(next, "window.CV_DETAIL=", ";</script>");
next = next.slice(0, span.from) + detailJson + next.slice(span.to);
next = next.replace(/<p class="sc-sub">[^<]*?, scored 0 to 10/,
  `<p class="sc-sub">All ${cards.length} characters and ${relics.length} relics, scored 0 to 10`);

if (/src="data:image\/(?:jpeg|png|webp)/.test(next)) {
  throw new Error("The lore page embeds an image. Save it under materials/lore/ and link it instead.");
}

if (next === page) {
  console.log(`Lore page is current: ${roster.length} Star Chart profiles.`);
} else if (checkOnly) {
  console.error("The lore page is out of step with the card rosters. Run `npm run sync:lore` in source/.");
  process.exit(1);
} else {
  fs.writeFileSync(pagePath, next);
  console.log(`Lore page refreshed: ${roster.length} Star Chart profiles.`);
}
