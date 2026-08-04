/**
 * Turns the raw casting run into `data/voicelines.csv`, the one file the voice
 * build reads.
 *
 * Four Opus workers cast the roster a quarter each and an adversarial checker
 * went over the merged sheet; this script is where the master's corrections are
 * applied on top, in one auditable place, so re-running the casting never
 * silently loses them.
 *
 *   node materials/local-production/asset-tools/build-cast-sheet.mjs
 *
 * Source: .preview/voice/cast-raw.json (the workflow's output).
 * Output: source/data/voicelines.csv
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "source");
const RAW = join(ROOT, ".preview", "voice", "cast-raw.json");

const LEGAL_VOICES = new Set([
  "en-US-AndrewNeural", "en-US-BrianNeural", "en-US-ChristopherNeural", "en-US-EricNeural",
  "en-US-GuyNeural", "en-US-RogerNeural", "en-US-SteffanNeural", "en-GB-RyanNeural",
  "en-GB-ThomasNeural", "en-IE-ConnorNeural", "en-AU-WilliamNeural",
  "en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural",
  "en-US-AriaNeural", "en-US-AvaNeural", "en-US-EmmaNeural", "en-US-JennyNeural",
  "en-US-MichelleNeural", "en-US-AnaNeural", "en-GB-LibbyNeural", "en-GB-MaisieNeural",
  "en-GB-SoniaNeural", "en-IE-EmilyNeural", "en-AU-NatashaNeural",
  "en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural",
]);

const LEGAL_TREATMENTS = new Set([
  "plain", "hero", "titan", "demon", "beast", "machine", "radio",
  "ancient", "void", "spectral", "manic", "whisper", "regal", "child",
]);

/**
 * The checker's findings, plus the master's own calls. Every one is a deliberate
 * override of what a worker produced — see the note on each.
 */
const CORRECTIONS = {
  // --- BLOCKER: the only wrong-sex casting in the roster. Flowey is Asriel.
  c161: { voice: "en-US-GuyNeural", line: "Howdy! It is kill or be killed.", note: "wrong-sex fix" },

  // --- Lines that were narration, card copy or a stage direction rather than speech.
  c006: { line: "You are standing on my back." },
  c009: { line: "Ten. Nine. You will not reach eight." },
  c018: { line: "Zehahaha! Whatever you have, I take." },
  c025: { line: "One punch. Sorry, that is how it goes." },
  c029: { line: "What remains of me is enough." },
  c031: { line: "You dare wake me from my slumber?" },
  c044: { line: "My body moves before I even think." },
  c063: { line: "heya. you're gonna have a bad time." },
  c069: { line: "My prayers land harder than any fist." },
  c072: { line: "What is thy wish, master?" },
  c082: { line: "I have already adapted to your attack." },
  c087: { line: "These walls were never meant to protect you." },
  c111: { line: "The power of the sun, in my hands." },
  c141: { line: "Every machine you fear was assembled here." },
  c143: { line: "We keep moving. That is how we survive." },
  c173: { line: "Yes, a mouse. Also your principal." },

  // --- Wrong owner / wrong franchise / internal contradiction.
  c081: { treatment: "plain", line: "The crowbar does the talking." },
  c089: { line: "My gods bled. Yours will too." },

  // --- Treatments that fought the character.
  c016: { treatment: "machine" }, // Doom Slayer kills demons, he is not one
  c007: { treatment: "manic" },   // Pandora's Actor is a ham, not a monarch
  c014: { treatment: "regal" },   // Kizaru drawls; "hero" is for shonen leads

  // --- Cross-slice duplicate lines.
  c118: { line: "Broadside ready. Nothing floats after this." },
  c139: { line: "Engine hot. Rolling through your position." },
  c134: { line: "Twenty years in chains. Now you pay." },
  c147: { line: "Do not squirm. This is delicate work." },
  c166: { line: "I foresaw this. You do not survive." },

  // --- Identical voice AND dials AND treatment as another marquee card.
  c096: { rate: "-4%", pitch: "-14Hz" },                                    // Dio vs Meruem
  c129: { rate: "-2%", pitch: "-4Hz" },                                     // Dabi vs Tempest's Lords
  c030: { voice: "en-GB-RyanNeural", rate: "-12%", pitch: "-8Hz" },         // Dumbledore vs Gandalf

  // --- Master's own spread pass. The eight unused voices are all female and the
  // roster is genuinely male-dominated, so forcing them onto characters would be
  // worse than the crowding. Objects and machines are the honest place to use
  // them — a cold synthetic female ship voice is a trope, not a miscast.
  c055: { voice: "en-US-AvaMultilingualNeural" },  // Death Star
  c092: { voice: "en-US-EmmaNeural" },             // UFO
  c105: { voice: "en-US-AvaNeural" },              // The Driller
  c103: { voice: "en-IE-EmilyNeural" },            // Fort
  // ...and three heavy male cards moved off the most crowded actor.
  c058: { voice: "en-AU-WilliamNeural" },          // Kaido
  c102: { voice: "en-IE-ConnorNeural" },           // Dragon
  c145: { voice: "en-US-BrianMultilingualNeural" }, // Kaku Kaioh
};

/** Lines the workers left without terminal punctuation. TTS phrasing depends on it. */
const NEEDS_STOP = ["c048", "c050", "c104", "c108", "c113", "c125", "c140", "c164", "c168", "c169"];

if (!existsSync(RAW)) {
  console.error(`Missing ${RAW} — run the casting workflow first.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(RAW, "utf8"));
const entries = raw.entries.map((entry) => ({ ...entry }));
const byId = new Map(entries.map((entry) => [entry.id, entry]));

let applied = 0;
for (const [id, patch] of Object.entries(CORRECTIONS)) {
  const entry = byId.get(id);
  if (!entry) {
    console.error(`  correction for unknown card ${id}`);
    continue;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === "note") continue;
    entry[key] = value;
  }
  if (patch.line) entry.line_source = "master";
  applied += 1;
}

for (const id of NEEDS_STOP) {
  const entry = byId.get(id);
  if (entry && !/[.!?…]$/.test(entry.line.trim())) entry.line = `${entry.line.trim()}.`;
}

// ---------------------------------------------------------------------------
// Validate before writing. A bad voice name only fails at render time, hundreds
// of clips in, so it is caught here instead.
// ---------------------------------------------------------------------------

const cards = readFileSync(join(ROOT, "data", "cards.csv"), "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => line.slice(0, line.indexOf(",")));

const problems = [];
const seen = new Set();
for (const entry of entries) {
  if (seen.has(entry.id)) problems.push(`${entry.id}: duplicate entry`);
  seen.add(entry.id);
  if (!LEGAL_VOICES.has(entry.voice)) problems.push(`${entry.id} ${entry.name}: illegal voice "${entry.voice}"`);
  if (!LEGAL_TREATMENTS.has(entry.treatment)) problems.push(`${entry.id} ${entry.name}: illegal treatment "${entry.treatment}"`);
  if (!/^[+-]\d{1,2}%$/.test(entry.rate)) problems.push(`${entry.id} ${entry.name}: bad rate "${entry.rate}"`);
  if (!/^[+-]\d{1,2}Hz$/.test(entry.pitch)) problems.push(`${entry.id} ${entry.name}: bad pitch "${entry.pitch}"`);
  if (!entry.line.trim()) problems.push(`${entry.id} ${entry.name}: empty line`);
  if (entry.line.split(/\s+/).length > 10) problems.push(`${entry.id} ${entry.name}: ${entry.line.split(/\s+/).length} words`);
}
for (const id of cards) if (!seen.has(id)) problems.push(`${id}: no voice line cast`);

if (problems.length) {
  console.error("Cast sheet is not shippable:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------

const esc = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const order = new Map(cards.map((id, index) => [id, index]));
entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

const csv = [
  "id,name,voice,rate,pitch,treatment,source,line",
  ...entries.map((e) =>
    [e.id, e.name, e.voice, e.rate, e.pitch, e.treatment, e.line_source, e.line].map(esc).join(","),
  ),
].join("\n");

writeFileSync(join(ROOT, "data", "voicelines.csv"), `${csv}\n`, "utf8");

const voices = new Map();
const treatments = new Map();
for (const e of entries) {
  voices.set(e.voice, (voices.get(e.voice) ?? 0) + 1);
  treatments.set(e.treatment, (treatments.get(e.treatment) ?? 0) + 1);
}
console.log(`data/voicelines.csv — ${entries.length} lines, ${applied} master corrections applied`);
console.log(`  ${voices.size} distinct voices (most used ${[...voices.entries()].sort((a, b) => b[1] - a[1])[0].join(" x ")})`);
console.log(`  ${treatments.size} treatments in use`);
