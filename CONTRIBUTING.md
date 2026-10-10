# Contributing to Convergence

Improve the game by reporting a reproducible problem, clarifying a card, refining a screen or implementing an approved change.
AI agents start with [AGENTS.md](AGENTS.md). The reasons behind major choices live in [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md).

## Reporting a problem

Include the mode and champion, the card names, your last action, expected behaviour and actual behaviour.
For layout issues, add the browser, device orientation and a screenshot. For rules issues, note any buffs, relics or status effects.
Do not clear a real save to reproduce a problem. Use a separate browser context for disposable test states.

## Project layout

| Path | Purpose |
|---|---|
| [source/](source/) | React, TypeScript, Vite, and the test tools |
| [source/data/cards.csv](source/data/cards.csv) | Live minion definitions |
| [source/data/relics.csv](source/data/relics.csv) | Live relic definitions |
| [source/src/engine/](source/src/engine/) | Deterministic game rules and bot search |
| [source/src/App.tsx](source/src/App.tsx) | Duel state, screen flow and orchestration |
| [source/src/duel/](source/src/duel/) | Board rows, hand, hero plates, effects, overlays, card pack and developer tools |
| [source/src/gallery/](source/src/gallery/) | My Deck collection and Star Chart profiles |
| [source/src/card-face.tsx](source/src/card-face.tsx) | The live card face every surface draws |
| [source/src/screens/](source/src/screens/) | Title, campaign, dialogue, rules, and settings |
| [source/src/mobile.css](source/src/mobile.css) | Phone and tablet layout, loaded after desktop styles |
| [source/src/phone-layout.ts](source/src/phone-layout.ts) | Phone detection, fullscreen request, and landscape rotation |
| [source/src/relic-peek.ts](source/src/relic-peek.ts) | Tap and hold timing for equipped relic card previews |
| [source/src/gallery-detail.css](source/src/gallery-detail.css) | Character profiles and Star Charts |
| [source/public/](source/public/) | Runtime artwork, fonts, and audio |
| [source/scripts/](source/scripts/) | Validation, browser checks, production build, and publishing |
| [materials/](materials/) | Lore, campaign data, statistics and optional production tools |
| [play/](play/) | Generated playable release; build it from source |
| [counter/](counter/) | Aggregate website visit-count service |
| [index.html](index.html) and [styles.css](styles.css) | Public project landing page |

Card definitions, campaign JSON, and engine code are authoritative. The statistics workbook and playable release are generated outputs.
The documentation map is in [README](README.md#explore-and-contribute).

## Development

Use Node.js **22.12 or newer**, or a supported newer release, and npm.
Run these commands from `source/`:

```sh
npm ci
npm run dev
```

The development address is **http://localhost:5177**. The port is fixed; an occupied port produces an error.
Use the server address rather than opening the game through `file://`.
`npm run prepare:assets` prepares the lore module, checks the workbook and refreshes gallery previews. Both development and production builds use it.
Campaign voice checks run explicitly when voice or story assets change.

```sh
npx vitest run src/engine/game.test.ts -t "Divine Shield"
npm run check -- --only cardface
npm run build
```

Choose the specific file, test name or suite that matches the change. The commands above are examples, not a required batch.

### Choosing checks

`npm run check -- --only docs,cardface` runs explicitly selected suites. `--list` reviews the selection; `--all` is an explicit full run.
Without `--only`, the runner infers checks from changed files. It does not force unit or workbook suites on unrelated changes.
The check runner executes unit tests before browser suites to avoid timing failures under CPU load.
Browser suites use this project's Playwright Chromium and need the development server running.
Install its browser once with `npx playwright install chromium` on a new development machine.
For Safari engine checks, install Playwright WebKit and run `node scripts/check-mobile.mjs --webkit`.
That pass covers upright menus, phone rotation, landscape duels, and tablet layouts with touchscreen taps.
Chromium checks native holds and swipes. WebKit checks long-press pointer events and scroll containers programmatically.

| Focused command | Checks |
|---|---|
| `npm test` | Engine, saves, decks, progression, targeting, and bot legality |
| `npm run validate:data` | Card definitions, public roster counts, and workbook freshness |
| `npm run check:ui` | Duel controls and title-screen behaviour |
| `npm run check -- --only card-interface` | Shield readiness, Apex targeting, grouped cheats, deck presets and placement sound |
| `npm run check:cardface` | Card names, text fit, stats, and viewport containment |
| `npm run check:features` | Tutorial, developer tools, and all character profiles |
| `npm run check -- --only mobile` | Phone/tablet layouts, touch interactions, reader, deck editing, and landscape |
| `npm run check:audio` | Music and effects routing |
| `npm run check:campaign-voices` | Campaign recordings, cast manifest, and checksums |
| `npm run check:coverage` | A behaviour test for every printed nontrivial card effect |

`npm run check` also covers campaign progression, performance, relic popups, and the card workbook.
Balance simulations are separate and do not run implicitly.
When completing work, run only checks you judge necessary for the actual changes. Do not run all suites by default.
Use focused unit tests and relevant browser checks; skip unrelated phone/tablet matrices and simulations.
Run the full suite only when the change genuinely needs it or the owner requests it.
Inspect real populated screens at their intended sizes; geometry assertions complement visual review.

### Generated statistics workbook

[Convergence card stat excel sheet.xlsx](materials/Convergence%20card%20stat%20excel%20sheet.xlsx) contains Cards, Relics, Rules, and Summary tabs.
It is generated from the two CSV rosters, rarity definitions, and [README's Rules at a glance](README.md#rules-at-a-glance).
The adjacent `.sync.json` record verifies both the source fingerprint and workbook bytes.

`npm run sync:cards` refreshes it when sources change. Development watches those sources; builds and deployment check freshness.
Regeneration requires the bundled Codex spreadsheet runtime. Set `CONVERGENCE_ARTIFACT_RUNTIME` to its dependency directory when needed.
An unchanged workbook can be verified with Node alone. The generator refuses a missing runtime or a workbook locked in Excel.
`node scripts/check-card-workbook.mjs --exercise` tests generation using disposable data, independently checks the XLSX, and removes its temporary files.

### Documentation navigation

`npm run readme:index` refreshes README's contents from its headings.
`node scripts/readme-index.mjs --check` verifies that the generated navigation is current.
`npm run validate:docs` checks the documentation entry points and their local links. Additional Markdown files are allowed in this project.

## Changing cards

1. Edit the appropriate CSV in `source/data/`; do not maintain a second roster.
2. Keep effect text consistent with the engine. Specific effects ask the player to choose; explicitly random, positional, weakest, or costliest effects resolve automatically.
3. Add or update the behaviour test. Every nontrivial new card needs a test reached by `check:coverage`.
4. Run `validate:data` and the focused behaviour and browser checks needed for this change. Rebuild the workbook and playable release.
5. Name the affected cards in the change description. `npm run changed-cards` and `npm run card-history -- "Card name"` help trace changes.

Effect text has no final period, comma, semicolon, or colon. Internal sentences retain punctuation.
Use the existing wording for repeated mechanics, such as Freeze, Silence, Chained, and Reborn.
Every new engine vocabulary value belongs in [types.ts](source/src/engine/types.ts); validators derive their lists from it.

Mana is the subject's lore power tier. Assign it from canon capabilities and the Basic reference ladder, independently of card stats or gameplay results.
Do not change mana as an incidental balance adjustment. Routine interface work must preserve card costs, effects, bot strength, and pacing.
Fine balance, bot valuation, draft, and online multiplayer are separate future work.
Run `sim` or `check:balance` only when the current request explicitly asks for simulation or a difficulty study; use [balance.config.json](source/balance.config.json) for measured thresholds and minimum samples.
An insufficient sample is a skip, never a pass. The difficulty ladder requires a separately requested run.

Engine contracts are recorded in [the design decisions](DESIGN-DECISIONS.md#engine-contracts).
Clickable definitions and aliases live in [keywords.ts](source/src/keywords.ts). Their scanner and shared artwork positions live in [card-presentation.ts](source/src/card-presentation.ts). Engine vocabulary and effect IDs belong in [types.ts](source/src/engine/types.ts).
A repeated keyword is highlighted only on its first occurrence in a card description.

## Interface, art and audio

Card faces are live DOM, not exported images. Stats and conditions come from actual game state.
Keep mana, attack, health, name, artwork, and printed rules visible at every breakpoint. Small cards retain the same complete card design.
Mythic, Legendary, Epic, and Relic cards use their own animated shine. Keep the animation and palette coherent with rarity ordering in `types.ts`.
The shine is pre-drawn textures listed in `card-shine.ts` and drawn by `npm run build:shine`; change a look in that script and rerun it. Its animated layers use no blend mode, mask or rounded clip.
Selection rings on cards are `box-shadow` spreads, never `outline`: a card already carries a drop shadow, and Chrome redraws an element with both on every frame while its shine runs.
The desktop hand enlarges as one container. Phone hands scroll without scaling or overlap.
During a duel, tap-and-hold inspection applies to equipped relic badges. Their card-only preview includes the printed description, without a modal backdrop or separate text.
Equipped relic badges do not grow on hover or tap. Their card preview lasts one second after a tap, or until a held pointer is released.
The phone collection scrolls as one surface, including its controls. Card visibility tracking follows that scrolling surface when resizing.
Collection long presses open Star Charts. Movement cancels the hold; releasing a completed hold must not change the deck.
Profiles open in a separate, opaque layer above the gallery and fit the visible viewport without scrolling. Check short phone windows as well as full device dimensions.
Board cards display current stats and conditions. Equipped relics expose their own complete card when inspected.

The maintained artwork library is [source/public/card-art/raw/](source/public/card-art/raw/), entirely WebP, with readable character and relic filenames. Legacy paths migrate through `source/data/art-renames.json`. Keep one authored image collection; the published copy is generated.
Encode replacements directly into that folder, update the CSV path and rebuild gallery previews. Use a new filename for changed art so browser caches cannot retain the previous image.
The existing [card validator](source/scripts/validate-cards.mjs) checks that both rosters resolve to the retained artwork.
Card-specific crops must agree between the full image and its embedded preview.
Gallery art is loaded near the visible area; do not decode the entire collection at title-screen startup.
Gallery cards share one pixel-sizing measurement and static rarity frames. Avoid paint-skipping containment and animated shine on the card wall. Keep decoded artwork mounted during scrolling.
Collection artwork has a small embedded preview beneath each full image, so pending requests never leave black artwork panels.
The preview module loads only when opening My Deck. The build refreshes it automatically from the original artwork using Python and Pillow.
The title screen should load its backdrop and small menu artwork, not the full roster or dormant campaign recordings.
Audio follows [sfx.ts](source/src/audio/sfx.ts), respects the sound controls, and cancels stale fetches when changing screens.
Campaign voice files and their manifest must agree with story text, cast, and checksums.
Reborn minions suppress arrival themes; returning bodies are not fresh plays.
Only Legendary and Mythic minions play their card music. Rare and Epic tracks remain stored and turn on automatically if their tier changes.
Relic music, battle music, and ordinary summon effects remain active.

### Local production data

The voice-generation runtime and model weights live in the workspace's shared voice pipeline, `Pipelines/audio/qwen/` (its `.venv` and `models`), outside this repository. Set `QWEN_RUNTIME`, `QWEN_MODEL_DIR` or `QWEN_BASE_MODEL_DIR` to use another location.
Voice jobs and recordings use `.preview/voice-full-hold` and `.preview/campaign-voices`. Preserve them during routine cleanup.
The workbook preview's `node_modules` is a junction to the shared dependency runtime. Remove the junction itself before clearing that preview; never traverse and delete its target.
Generated `source/dist` can be removed after publishing. The release in `play/` and authored assets stay available.

### Campaign voice production

Character dialogue was generated with **Qwen3-TTS**.
The project uses **Qwen3-TTS-12Hz-1.7B-VoiceDesign** to cast character voices and **Qwen3-TTS-12Hz-1.7B-Base** to reuse selected reference voices consistently.
The game ships 101 campaign recordings: Rick Gramps's prologue, twenty Rick introductions, and eighty champion dialogue lines.
The [voice cast](materials/campaign-voice-cast.json) and [recording manifest](source/data/campaign-voices.json) preserve the dialogue, recording fingerprints, and audio checksums.
Voice models and generation environments are not required to play.

## Developer tools

Typing `Ross` reveals developer controls. The title screen then shows the developer panel.
It offers card/power unlocks, test duels, and reset confirmation. Tutorial is available directly on the ordinary title screen.
All universes are already available. The tutorial does not grant progression.
Developer test duels count toward the ordinary record and reward transaction.
Use the workbench to place cards, arm an enemy turn, preview results, or test infinite mana.
The `window.__debug` browser hook exists only in development; the production build must remove it.

## Publishing

The public game lives at **https://ross-ai-lab.github.io/convergence-card-game/play/**.
The landing page lives one directory above it.

From `source/`:

```sh
npm run publish:pages
```

This validates the data and workbook, builds the source, replaces `play/`, compares every generated file by hash, and rejects a leaked development hook.
It prepares the release files locally. Publication happens when the updated source, documentation, landing page, workbook, and generated `play/` reach the repository's main line.
[pages.yml](.github/workflows/pages.yml) then deploys them to GitHub Pages and independently checks workbook freshness.

Wait for the deployment to succeed. Verify the live `/play/` page, deployed bundle names, artwork, dialogue, and an actual duel.
Do not report deployment from a successful build alone.
Vite uses relative asset paths so the release works under the repository's `/play/` directory.
Runtime art and audio addresses must use [asset-url.ts](source/src/engine/asset-url.ts) or the configured base; hardcoded root paths can work locally and fail on Pages.

For documentation-only changes, publish the documentation without rebuilding unchanged game assets.
Check that the relevant files and pictures render correctly on the repository page.
A release summary should describe the visible result, the checks performed and any remaining limits.

## Measuring smoothness

Use the existing performance check for gallery rendering, real deaths and bot-worker parity.
For a comparison, keep the previous release at a separate local URL and measure both production builds on the same machine:

```sh
node scripts/duel-performance.mjs http://127.0.0.1:5181 --baseline=http://127.0.0.1:5180/baseline --seed=http://127.0.0.1:5177 --runs=3 --label=duel-comparison
```

The seed URL must be the development server. Each run creates its own browser storage and uses real legal actions, decoded artwork and active animations.
The default scenario plays John Wick, Giant Tree, Ainz and Meteor. `--scenario=triggers` starts with eight real bodies and exercises Godzilla reactions, Reborn and a hard bot turn.
`--cpu-rate=4` adds a separate slower-CPU comparison. Do not mix its results with normal-speed runs.
`--gpu` uses the machine's graphics device. Without it, headless Chromium composites in software and hides layer, blend-mode and blur costs, so judge gallery scrolling and idle duels with `--gpu`.
The runner alternates build order and saves frame intervals, long tasks and CPU profiles in `.preview/duel-performance/`.
Compare repeated runs without other check suites competing for CPU.
Before measuring, check live per-process CPU and graphics load, not lifetime totals. Another AI coding app, a game or a 3D editor running alongside makes the same build's slowest frame swing several-fold between runs. When repeated runs of one build disagree like that, find the competing program before reading any result.
Automated Chromium timings are evidence for those scenes, not a guaranteed frame rate on every device.
Never use `settleMotion` or disable animations in a final smoothness comparison. Temporary CSS bisection is diagnostic only.
