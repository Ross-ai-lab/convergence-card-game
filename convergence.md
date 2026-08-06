# Convergence — Game Guide and Development Reference

**Use when** playing, running, changing, testing, balancing, documenting, or troubleshooting the Convergence browser card game.

**Jump:** Play · Core rules · Controls · Project structure · Run and verify · Cards and effects · Engine rules · Interface · Balance · Assets and audio · Contributing · Development lessons

## What Convergence is

Convergence is a non-commercial browser card duel where 175 characters and forces from fiction collide in one shared deck. It supports a hotseat duel on one screen or solo play against three opponent levels.

[Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/)

No account or installation is required to play. The public site records only an aggregate count of browsers that have opened the game, not player names or visitor records.

## Core rules

- Both cores begin at 76 health. Reduce the opposing core to zero to win.
- At the start of a turn, draw a card. Mana refills and increases by one.
- Play a hand card into one of five empty board slots.
- A minion waits one turn after entering play before it can attack. A Chained minion waits two turns.
- Combat is simultaneous: attacker and defender damage each other.
- Targeted Battlecries ask the player to choose a legal target. Effects that say random, weakest, costliest, or a board slot resolve automatically.
- Taunt must be dealt with before the opposing core can be attacked.
- Both players draw from the same deck.

## Controls

- Click or drag a hand card onto an empty slot to play it.
- Click or drag a ready minion onto an enemy minion or the enemy core to attack.
- Press Space to end the turn, Z to undo the last local action, and Escape to clear a selection.
- Settings contains sound controls, opponent difficulty, the Infinite Mana sandbox, the Effect Codex, and the full how-to-play guide.

## Project structure and source of truth

- `source/data/cards.csv` is the live card roster: names, stats, costs, effect text, timing, keywords, art paths, and flavour.
- `source/data/relics.csv` is the relic authority.
- `source/src/engine/` is the authority for game behaviour. React and CSS files under `source/src/` are the interface authority.
- `play/` is the generated static game served to players. Build it from `source/`; do not hand-edit it.
- `docs/Convergence Browser Game Roadmap.html` is useful for design direction and browsing, but its embedded roster can lag behind the live CSV.

The maintained game is React and TypeScript with a deterministic rules engine, DOM-rendered card faces, Ascension Relics, and a practice bot.

## Run and verify

From `source/`, use Node.js 22.12 or newer.

```bash
npm ci
npm run dev
npm run validate:data
npm test
npm run build -- --base=./
```

Run the relevant checks before calling a code change finished. A white page is not proof of a code failure by itself: the local server may be stopped, a different folder may be served, or `play/` may be behind `source/`. After a successful build, copy the generated `source/dist/` contents into `play/` when updating the deployable game.

Useful focused checks include `npm run check:ui`, `npm run check:audio`, `npm run check:cardface`, `npm run shoot`, `npm run sim`, and `npm run check:balance`. Browser checks need the local server running where their help text says so.

## Changing cards and effects

For stats, wording, keywords, timing, or art paths, update the relevant `cards.csv` row, validate the data, run focused tests, and rebuild the playable copy when needed.

For a behaviour change, update the printed CSV text and the engine branch together. Search the existing `EffectId` and `effectIds` definitions before adding an effect. Add a focused test that proves the new rule.

When an effect is changed, replace the old effect and its old keywords or timing unless the request explicitly says to retain them. Do not silently append a new effect to an existing Taunt, Chained, Divine Shield, or other rule.

Printed timing must match play:

- **Battlecry** happens on placement.
- **Ongoing** persists while the minion is active.
- **Passive** is a standing rule.

For every target or choice, specify whether it selects a minion, board slot, hand card, or random legal object. Test no-valid-target, cancellation, opponent-turn, and resolution behaviour where relevant.

## Engine rules that must stay coherent

- Keep the engine deterministic. Randomness comes from game state and its seeded RNG, never `Math.random()` in the engine.
- Taunt is enforced through legal targets. Divine Shield is a breakable state. Invulnerable prevents damage. These are gameplay rules with visible card states, not text-only decoration.
- **Evade** is the player-facing name for a percentage chance to avoid an incoming attack. Older internal identifiers may remain for save compatibility.
- Slot auras and protected slots belong to the board position, not the minion occupying it. Replacement and movement must preserve the intended slot rule.
- When the saved minion shape changes, bump `SAVE_VERSION` and extend save validation. Otherwise old saves can restore incomplete objects and leave the game blank.
- Relics are equipment instances: one per minion, destroyed with their bearer, and moved at most once per turn. Moving a relic must not re-trigger one-shot equip logic.
- The bot evaluates legal actions on a throwaway state. A new effect usually needs no separate bot branch, but bot valuation changes affect balance measurements and need a fresh balance run.

The engine’s central contract is `applyAction(state, action, library) -> { state, events, legalActions }`. An action outside the legal-action list is rejected without changing the state. Targeting pauses the game in a target-selection state so human and bot choices follow the same route and survive saving, cloning, and undo.

## Interface and card faces

Cards are DOM-rendered by `CardFace` and CSS, using a 750 × 1050 design coordinate system. Keep full card faces readable in hand and on the board. Text fitting must use `source/src/textfit.ts`, which measures the real fonts and finds the largest fitting size; a character-count estimate or fixed font ceiling is not reliable.

Conditions have distinct, composable visual channels:

- Divine Shield uses a gold rim.
- Invulnerable uses a blue and white rim.
- Frozen uses ice treatment.
- Chained draws chains only across artwork.
- Sleeping shows drifting `z` glyphs.
- Silenced greys and blanks rules text.
- Marked uses a red pulse.
- Protected and Adapted use teal or camp glow.
- Attack Locked greys the ATK gem.

Keep status indicators large enough to survive real board-card size. Verify condition work on a populated board; the opening screen cannot prove board conditions, targeting, hand interaction, or settings behaviour. Load card art eagerly and resolve public asset paths through `resolvePublicAssetUrl` so the game works both at a domain root and under a project page path.

## Balance, pacing, and bot

Card cost is a fiction and canon assignment, not a balancing lever. Change stats, effect magnitude, timing, keywords, or global pacing instead.

Judge each card against its own cost tier, not against the whole-roster average. Separate play rate from win rate, and treat effects the bot cannot value as unmeasured. Re-measure after every balance or pacing pass: a previous buff can become the next pass’s worst outlier, and a bot-valuation change can move every balance number.

Balance checks must report inadequate samples, unset thresholds, disabled checks, and missing results as a skip or failure, never as a silent pass.

## Assets and audio

`source/public/` is the runtime asset location. `materials/local-production/` contains optional rebuild tools for art, music, voice previews, and cast sheets; it is not required to play the included build. Large audio and card-production libraries are release downloads rather than normal clone requirements.

Use the tools under `materials/local-production/asset-tools/` for production rebuilds. For audio changes, run the browser analyser check with `npm run check:audio`; a UI counter or a `musicPlaying` flag can say music is active while the browser’s audio graph is silent. Keep synthetic voices original and do not clone real actors.

Do not casually regenerate approved menu, battle, or tension music. Preserve the existing loudness, loop-seam, and energy checks when replacing them.

## Contributing

Contributions are welcome through a fork and pull request. Keep each change focused, explain the player-visible result, and run the relevant checks before proposing it.

- Cards and relics: `source/data/`
- Game rules and practice opponents: `source/src/engine/`
- Interface and controls: `source/src/App.tsx` and `source/src/*.css`
- Art, fonts, and runtime audio: `source/public/`
- Optional production tools: `materials/`
- Tests: `*.test.ts` beside the code they cover

When changing a rule, add or update a focused test and make the card text agree with the implementation. Preserve player-selected targeting unless a card explicitly says that the target is random, positional, weakest, costliest, or otherwise automatic. Do not include generated folders, local launchers, secrets, or personal paths in a contribution.

## Development lessons

- A card’s text and its resolution can live in different places. Update CSV, engine, and a focused test together so the card does what it says.
- Re-measure a balance pass before making its next adjustment. A successful buff can overshoot into the roster’s next outlier.
- Tune the lever that controls the behaviour. Health does not fix a card whose targeting, keyword, or bot valuation is the real issue.
- Card text needs real font measurement. A fixed maximum can make short text needlessly tiny while still failing long text.
- Board cards must communicate their full rules without hover-only discovery.
- UI tests must assert setup state, not merely click a control and continue. A swallowed click can leave the test green while it tests the wrong game state.
- Treat CSV and engine data as current truth when a visual roadmap and live data disagree.
- Test asset paths under the deployment base path, and load moving card art eagerly so remounted cards do not render black.
- Test sound with the browser’s real analyser. A playing flag is not evidence that the listener graph has audio.

## Included materials and links

- [Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/)
- [Official lore and roster guide](https://ross-ai-lab.github.io/convergence-card-game/materials/Convergence-Official-Lore.html)
- [Card statistics workbook](materials/Convergence%20card%20stat%20excel%20sheet.xlsx)
- [Raw card artwork](https://github.com/Ross-ai-lab/convergence-card-game/tree/main/materials/raw-card-art)
- [Original audio-track collection](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Audio-Tracks.7z)
- [Rendered card-production library](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Card-Production.7z)
- [Project roadmap](docs/Convergence%20Browser%20Game%20Roadmap.html)
- [Voice-cast reference](docs/Convergence%20Voice%20Cast.html)

## Fan-project notice

Convergence is a non-commercial fan project made for personal play and educational experimentation. Character names, franchises, imagery, and music belong to their respective rights holders. The project is not endorsed by or affiliated with those rights holders.

## Sources

- [Convergence source](source/)
- [Card data](source/data/cards.csv)
- [Relic data](source/data/relics.csv)
- [Engine](source/src/engine/)
- [Local production tools](materials/local-production/asset-tools/)
