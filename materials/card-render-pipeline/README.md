# Convergence Card-Render Pipeline — FOR PHYSICAL CARDS ONLY

> **Scope: this pipeline exists to print real cards.** The browser game does
> **not** use anything in `Completed cards/` any more — it draws each card face
> live from `data/cards.csv`, so a stat or effect change shows up the moment the
> file is saved, with no render step. Run this only when you want print-ready
> artwork for a physical deck.
>
> The look is shared, not duplicated: the game's card CSS
> (`Convergence Browser Game/src/App.css`) is a transcription of
> `card_template.html` in the same 750×1050 design space, with thinner rails for
> small on-screen cards. **Change the frame design here and mirror it there**, or
> the printed deck and the screen deck drift apart.

Turns raw character art + the master stat sheet into finished, print-ready
**1500×2100 PNG card faces** that match the hand-made Saitama/Thanos style.
Built for an AI operator to run — the owner never runs this.

## What it produces

A composited card with the house layout: name on a chevron banner (top),
mana badge (top-right), art window, **camp** on the left rail, **alignment**
on the right rail, a rounded description plaque (centre), **ATK** (bottom-left)
/ **HP** (bottom-right) gem badges, flavour quote (middle-bottom), and origin
centred on white below the frame.

Frame colour is driven by **rarity** (rulebook v1.0):

| Rarity | Colour | Frame |
|---|---|---|
| Mythic | Red | crimson metal + dark wood-toned rails |
| Legendary | Yellow | gold metal + olive-stone rails |
| Epic | Purple | amethyst metal + violet rails |
| Rare | Black | gunmetal + charcoal rails |

Layout: the card is **full-bleed** (fills the whole image, no white margin); a
full-width name banner (top) with the mana badge (top-right); art filling
edge-to-edge under the banner; **camp** on the left rail / **alignment** on the
right rail (beside the description); a tall **description plaque that JS grows
downward to end ~6px above the flavour text** (so it always reaches the flavour,
whether the quote is one or two lines); **ATK** (bottom-left) / **HP**
(bottom-right) badges; and a **larger flavour line over a smaller origin line**,
fixed at the very bottom *inside* the card.
(No decorative gems — removed per owner request 2026-06-26.)

## Files

- `extract_data.py` — reads `../../Convergence card stat excel sheet.xlsx`
  (sheet `Cards`) → `data/cards.json` (all 175 cards, render-ready, with the
  rarity→colour mapping). Run with the system Python: `py -3.14 extract_data.py`.
- `card_template.html` — the frame design (HTML/CSS). All colours come from
  per-card CSS variables; tune the look here.
- `render_cards.py` — fills the template per card, renders it headless with
  Playwright/Chromium, writes the PNG. Locates art by fuzzy filename match in
  `../Raw art for card creation/<N> mana/`, auto-fits the name and effect text.
- `fonts/` — bundled OFL fonts (Baloo 2 for names/numbers, Nunito for body),
  embedded as base64 so rendering is fully offline.
- `data/cards.json` — generated card data (re-run `extract_data.py` if the
  stat sheet changes).

## Run it

Chromium + the Python deps resolve through `uv`, so nothing heavy lands in the
synced workspace (Chromium lives in the global `ms-playwright` cache).

```bash
# 1. refresh data if the stat sheet changed
py -3.14 extract_data.py

# 2. render. Output defaults to ../Completed cards/<N> mana/ (one folder per tier)
uv run --python 3.13 --with playwright --with pillow python render_cards.py --all
#   --all            render the whole deck (every mana tier + relics) in one session
#   --relics         render only the 21 Ascension Relics
#   --cost N         all cards of that mana cost
#   --all-missing    skip names already present in the output folder
#   --names "A,B"    render specific cards by (sub)name
#   --out "<dir>"    override output folder
#   --test           render to ./_qa_renders for QA without touching real output
# Per-card failures are caught and reported at the end; one bad card never aborts the batch.
```

First run downloads Chromium once (~150 MB, cached globally).

## Notes / gotchas

- **Data is the source of truth.** All ten 10-mana cards are now rendered by
  this pipeline from the live sheet (the original hand-made Saitama/Thanos were
  archived by the owner). The sheet reflects the balance patch — e.g. Thanos is
  `Ongoing … destroy 1`, `5/7` (the old hand-made card said `Battlecry … discard
  half`, `5/5`).
- **Frame texture:** the pipeline uses a clean gradient + subtle weave on the
  rails. To push toward a photoreal stone/wood look, add a tiled noise/material
  overlay to `#well` and the rail backgrounds in the template.
- Art filenames need only loosely match the card name (`Giorno.jpg` →
  `Giorno - Gold Experience Requiem`); output filename uses the short name
  before any ` - `, with Windows-illegal characters (`" : / \ | ? * < >`)
  stripped (e.g. `Escanor "The One"` → `Escanor The One.png`).
- **Full-deck status:** all 175 minions + 21 Ascension Relics render (196 total).
- **Ascension Relics** use a distinct teal "ascension" frame: no ATK/HP badges,
  the side rails read **ASCENSION** / **RELIC** (in place of camp/alignment), and
  they extract from the `Relics` sheet (`type:"relic"`, `color:"relic"`) into
  `Completed cards/Ascension Relics/`. Empty ATK/HP/cost badges auto-hide via
  `.gembadge:empty`.
- **Infinity Castle** (relic) has no cost and no effect in the sheet, so it
  renders with an empty description box and no cost badge — fill in its row to finish it.
- Tall/portrait source art is cover-cropped with `object-position: center 26%`
  to keep faces; adjust per card in the template if a crop cuts badly.
- **Letterbox auto-trim:** `trim_letterbox()` in `render_cards.py` strips baked-in
  black bars from movie-screenshot sources (e.g. Doctor Manhattan) before fitting.
  It only removes edge rows/cols that are ≥96% near-black and never more than 35%
  of a side, so star-field / dark art (e.g. The Watcher) is left intact.
