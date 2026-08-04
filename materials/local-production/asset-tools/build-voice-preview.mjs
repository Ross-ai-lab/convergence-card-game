/**
 * Builds a self-contained page for listening to the cast.
 *
 *   node materials/local-production/asset-tools/build-voice-preview.mjs
 *
 * Every clip is base64'd into one HTML file so it can be opened by double-click,
 * with no server and no folder of loose audio. Written for the owner to judge the
 * casting in one sitting and tell me which cards to re-voice.
 *
 * Output: "Convergence Voice Cast.html" in the source folder.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "source");
const VO = join(ROOT, "public", "audio", "vo");

const cards = new Map(
  readFileSync(join(ROOT, "data", "cards.csv"), "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
          else if (ch === '"') quoted = false;
          else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { cells.push(cell); cell = ""; }
        else cell += ch;
      }
      cells.push(cell);
      return [cells[0], { cost: cells[2], rarity: cells[5], origin: cells[13] }];
    }),
);

const rows = readFileSync(join(ROOT, "data", "voicelines.csv"), "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { cells.push(cell); cell = ""; }
      else cell += ch;
    }
    cells.push(cell);
    const [id, name, voice, rate, pitch, treatment, source, ...rest] = cells;
    return { id, name, voice, rate, pitch, treatment, source, line: rest.join(",") };
  })
  .filter((row) => existsSync(join(VO, `${row.id}.ogg`)));

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const TREATMENT_BLURB = {
  plain: "clean, small room", hero: "bright and forward", titan: "octave underneath, cathedral",
  demon: "growl twin, bitten", beast: "formants down, sub layer", machine: "bandpassed, quantised",
  radio: "narrow band, clipped", ancient: "detuned twin, long tail", void: "detuned twin, huge tail",
  spectral: "ghost twin, tremolo", manic: "fast, bright, hot", whisper: "close and dry, no tail",
  regal: "warm, big hall", child: "lifted and small",
};

const treatments = [...new Set(rows.map((r) => r.treatment))].sort();

const cardsHtml = rows
  .map((row) => {
    const audio = readFileSync(join(VO, `${row.id}.ogg`)).toString("base64");
    const meta = cards.get(row.id) ?? {};
    const short = row.voice.replace(/^en-[A-Z]{2}-/, "").replace(/Neural$/, "").replace(/Multilingual$/, " (x)");
    return `<article class="v" data-t="${esc(row.treatment)}" data-n="${esc(row.name.toLowerCase())}">
  <button class="play" data-src="data:audio/ogg;base64,${audio}" aria-label="Play ${esc(row.name)}">
    <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
  </button>
  <div class="body">
    <h3>${esc(row.name)} <span class="cost">${esc(meta.cost ?? "")}</span></h3>
    <p class="line">&ldquo;${esc(row.line)}&rdquo;</p>
    <p class="meta"><b class="tr tr-${esc(row.treatment)}">${esc(row.treatment)}</b> · ${esc(short)} · ${esc(row.rate)} ${esc(row.pitch)}${
      row.source === "master" ? ' · <i title="line rewritten during review">edited</i>' : ""
    }</p>
  </div>
</article>`;
  })
  .join("\n");

const html = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Convergence — the cast</title>
<style>
 :root{--ink:#f2e6cf;--dim:#a08f74;--edge:#3d3226;--panel:#1d1711}
 *{box-sizing:border-box}
 body{margin:0;background:radial-gradient(1200px 700px at 50% -10%,#2c2318,#120e0a 60%);color:var(--ink);
      font:15px/1.5 "Segoe UI",system-ui,sans-serif;padding:28px 20px 60px}
 header{max-width:1180px;margin:0 auto 20px}
 h1{font-size:clamp(26px,4vw,38px);margin:0 0 6px;letter-spacing:.5px}
 .sub{color:var(--dim);margin:0 0 18px;max-width:62ch}
 .controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
 input[type=search]{background:var(--panel);border:1px solid var(--edge);color:var(--ink);
      border-radius:999px;padding:8px 15px;font-size:14px;min-width:200px;outline:none}
 input[type=search]:focus{border-color:#c9a45e}
 .chip{background:var(--panel);border:1px solid var(--edge);color:var(--dim);border-radius:999px;
      padding:6px 13px;font-size:13px;cursor:pointer;font-family:inherit}
 .chip:hover{color:var(--ink);border-color:#6d5a3f}
 .chip.on{background:#c9a45e;color:#1a1409;border-color:#c9a45e;font-weight:600}
 .grid{max-width:1180px;margin:0 auto;display:grid;gap:10px;
      grid-template-columns:repeat(auto-fill,minmax(325px,1fr))}
 .v{display:flex;gap:13px;align-items:center;background:var(--panel);border:1px solid var(--edge);
      border-radius:12px;padding:11px 13px;transition:border-color .15s,transform .15s}
 .v:hover{border-color:#6d5a3f}
 .v.playing{border-color:#c9a45e;transform:translateY(-1px)}
 .play{flex:0 0 auto;width:42px;height:42px;border-radius:50%;border:1px solid #6d5a3f;
      background:#2a2117;color:#e8c98a;cursor:pointer;display:grid;place-items:center;padding:0}
 .play:hover{background:#3a2d1e}
 .v.playing .play{background:#c9a45e;color:#1a1409;border-color:#c9a45e}
 .body{min-width:0;flex:1}
 h3{margin:0;font-size:15px;font-weight:600;display:flex;gap:7px;align-items:baseline}
 .cost{font-size:11px;color:#1a1409;background:#7fa8d8;border-radius:4px;padding:1px 5px;font-weight:700}
 .line{margin:3px 0 4px;font-size:14px;color:#e5d5b4;font-style:italic;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .meta{margin:0;font-size:11.5px;color:var(--dim);letter-spacing:.2px}
 .meta i{color:#8fb9e8;font-style:normal}
 .tr{color:#1a1409;border-radius:3px;padding:0 5px;font-weight:700;font-size:11px}
 .tr-plain{background:#9aa39a}.tr-hero{background:#f0c96a}.tr-titan{background:#d1743f}
 .tr-demon{background:#c25a5a}.tr-beast{background:#a8894f}.tr-machine{background:#7fa8d8}
 .tr-radio{background:#6fa89a}.tr-ancient{background:#a98fd0}.tr-void{background:#8b7fd0}
 .tr-spectral{background:#9fd0d8}.tr-manic{background:#e88f5a}.tr-whisper{background:#8f9aa8}
 .tr-regal{background:#d8b45a}.tr-child{background:#e8a8c0}
 .none{color:var(--dim);text-align:center;padding:40px;grid-column:1/-1}
 footer{max-width:1180px;margin:26px auto 0;color:var(--dim);font-size:13px;line-height:1.6}
</style>
<header>
  <h1>Convergence &mdash; the cast</h1>
  <p class="sub">Every one of the ${rows.length} minions, speaking. Click a card to hear it. This is exactly what
     will play the moment that card lands on the board. Tell me any that sound wrong and I will re-cast them.</p>
  <div class="controls">
    <input type="search" id="q" placeholder="Search a character…" autocomplete="off">
    <button class="chip on" data-f="all">All ${rows.length}</button>
    ${treatments.map((t) => `<button class="chip" data-f="${esc(t)}" title="${esc(TREATMENT_BLURB[t] ?? "")}">${esc(t)}</button>`).join("\n    ")}
  </div>
</header>
<div class="grid" id="grid">
${cardsHtml}
<p class="none" id="none" hidden>Nothing matches.</p>
</div>
<footer>
  Every voice is synthetic &mdash; a free Microsoft neural voice, pitched and paced per character, then put
  through one of ${treatments.length} processing chains (an octave underneath for the titans, a growl twin for the
  demons, a bandpass and bit-crush for the machines). No real actor was copied and no audio was taken from
  any film or game.
</footer>
<script>
 var current = null, currentCard = null;
 document.getElementById('grid').addEventListener('click', function (event) {
   var button = event.target.closest('.play');
   if (!button) return;
   var card = button.closest('.v');
   if (current) { current.pause(); current = null; }
   if (currentCard) { currentCard.classList.remove('playing'); }
   if (currentCard === card) { currentCard = null; return; }
   current = new Audio(button.dataset.src);
   currentCard = card;
   card.classList.add('playing');
   current.addEventListener('ended', function () { card.classList.remove('playing'); currentCard = null; });
   current.play();
 });
 var filter = 'all', query = '';
 function apply() {
   var shown = 0;
   document.querySelectorAll('.v').forEach(function (card) {
     var ok = (filter === 'all' || card.dataset.t === filter) &&
              (!query || card.dataset.n.indexOf(query) >= 0);
     card.hidden = !ok;
     if (ok) shown += 1;
   });
   document.getElementById('none').hidden = shown > 0;
 }
 document.querySelectorAll('.chip').forEach(function (chip) {
   chip.addEventListener('click', function () {
     document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
     chip.classList.add('on');
     filter = chip.dataset.f;
     apply();
   });
 });
 document.getElementById('q').addEventListener('input', function (event) {
   query = event.target.value.trim().toLowerCase();
   apply();
 });
</script>`;

const out = join(ROOT, "Convergence Voice Cast.html");
writeFileSync(out, html, "utf8");
console.log(`Convergence Voice Cast.html — ${rows.length} clips, ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
