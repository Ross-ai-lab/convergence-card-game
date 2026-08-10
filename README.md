# Convergence — Game Guide and Development Reference

**Use this page when** playing, running, changing, testing, balancing, documenting, or troubleshooting the Convergence browser card game.

<!-- KB-JUMP-START -->
**Jump:** Play · Rules · Card language · Relics · Controls and modes · Project structure · Run and verify · Cards and effects · Engine rules · Interface · Balance · Assets and audio · Contributing · Development lessons
<!-- KB-JUMP-END -->

## What Convergence is

Convergence is a non-commercial browser card duel where 175 characters and forces from fiction collide in one shared deck. It supports a hotseat duel on one screen or solo play against three opponent levels:

- **Recruit** — deliberately forgiving.
- **Veteran** — plays each move correctly but does not plan beyond it.
- **Ascendant** — searches a full turn and answers likely plans.

[Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/)

No account or installation is required. The public site records only an aggregate count of browsers that opened the game, not player names or visitor records. The current game uses the full roster as a shared deck; there is no deck-building screen.

## Rules at a glance

- Both cores begin at **76 health**. Reduce the opposing core to zero to win.
- Both players draw from the same shuffled deck. The player going first opens with **2 cards**; the other opens with **3 cards and The Coin**.
- At the start of a turn, draw one card. Mana starts at **1**, refills each turn, and increases by one each turn up to **10**.
- Your hand holds at most **10 cards**. A card drawn into a full hand burns and is discarded.
- Play a hand card into one of **five board slots** by paying its cost. Effects that summon minions also need an open slot.
- A minion is asleep for the turn it enters play and normally waits until its owner's next turn before attacking. A **Chained** minion is unavailable for its first two owner turns.
- A minion can attack once per turn. A minion with **0 ATK** cannot attack.
- Combat is simultaneous: attacker and defender deal damage to each other, even when the attack kills the defender.
- **Taunt** must be dealt with before attacks can reach the opposing core, unless an effect or relic explicitly bypasses that defence.
- When the shared deck and its bottom-deck cards are empty, drawing causes escalating fatigue damage: 1, then 2, then 3, and so on.

Nothing damages a core automatically just because a turn starts; core damage comes from a minion attacking it or from an effect that explicitly says it damages a core.

## Cards and card language

Each card has a cost, ATK, HP, rarity, artwork, flavour text, a **camp**, and an **alignment**. The three camps are **Magic**, **Nature**, and **Tech**. The three alignments are **Good**, **Evil**, and **Neutral**. Many effects target a camp or alignment, so read both labels before playing a card.

### Timing words

- **Battlecry** — happens once when the minion enters play.
- **Ongoing** — happens at the start of its owner's turn while the minion is active.
- **Passive** — continuously applies while the minion is active; it does not trigger a second time.
- **Battlecry/Ongoing** — the same effect happens on arrival and again at the start of its owner's turns.

### Conditions and keywords

- **Chained** — unavailable for the first two owner turns; it cannot attack or run Ongoing effects until the chains break.
- **Taunt** — the enemy must deal with this minion before attacking your core.
- **Divine Shield** — blocks the next damage instance, then the gold shield disappears.
- **Freeze** — the minion loses its next turn, then thaws after sitting out that turn.
- **Silence** — removes the minion's printed effect and active keywords; its stats remain.
- **Invulnerable** — the minion cannot take damage while the condition is active; the blue-and-white aura shows it.
- **Evade** — gives the minion a chance to avoid an incoming attack. The percentage is printed on the card.
- **Sleep** — the normal one-turn delay after play. It is separate from Chained.
- **Attack Locked** — the minion cannot attack until the printed lock duration ends; its attack gem is greyed out.
- **Protected slot** — a board position is protected from targeting, Silence, Freeze, and damage. The protection belongs to the slot, not permanently to the minion occupying it.
- **Immune** — the named damage type cannot hurt the minion while the immunity is active.
- **Marked** — a delayed effect is waiting on the minion; the card text explains when it resolves.

“Destroy” kills a minion directly rather than dealing damage. “Gain stats” adds ATK and maximum/current HP to the recipient. “Summon” creates or brings a minion onto an open slot. “Lose ATK” permanently reduces ATK, never below zero. Copy effects that say **copy a passive** copy Passive or Ongoing text, not Battlecry.

**Evade** is the player-facing term throughout the game. Older internal identifiers may still contain `dodge` for save or code compatibility, but new card text and documentation should say Evade.

## Ascension Relics

The current relic pool contains **21 relics**. Relics are equipment, not hand cards: card effects pull them from the rift and attach them to a minion.

- A minion can carry one relic.
- A relic dies with its bearer.
- A relic that can be moved may be passed to another friendly minion by clicking its badge and then the recipient. This is limited to once per player's turn.
- Some relics spend themselves when they arrive and cannot be passed.
- The **Relics** button shows the remaining shelf, its order, and who is carrying each relic.

## Controls and modes

### Starting and resuming

The title screen offers **Continue your duel** when a live duel was saved in that browser, solo play at one of the three bot levels, and a two-player hotseat duel. A duel is saved locally after state changes; completed duels are not offered for resuming. Hotseat uses a privacy curtain while the screen is passed so the next player cannot see the previous player's hand.

### During a duel

- Click or drag a hand card onto an empty slot to play it.
- Click or drag a ready minion onto an enemy minion or the enemy core to attack.
- Press **Space** or **Enter** to end the turn.
- Press **Z** to undo the last local action.
- Press **Escape** to clear a selection.
- **The Coin** appears for the player who goes second and spends for +1 mana that turn.
- **Restart** begins a fresh duel.
- **Relics** opens the relic shelf.
- **Effect Codex** opens the in-game glossary and the how-to-play guide.
- **Settings** contains sound mute/volume controls, and in bot games lets you change the opponent level during the duel. It also returns to the title screen.
- **Cheat Off/On** is a separate toolbar sandbox switch. When enabled, mana is infinite; it is intended for testing and experimentation, not normal balance.

The board communicates conditions visually: a wall means Taunt, a gold rim means Divine Shield, a blue-and-white rim means Invulnerable, ice means Frozen, chains across the artwork mean Chained, a grey attack gem means the minion cannot attack, and a sleeping minion shows drifting `z` glyphs.

## Project structure and source of truth

- `source/data/cards.csv` is the live card roster: names, stats, costs, effect text, timing, keywords, art paths, and flavour.
- `source/data/relics.csv` is the relic authority.
- `source/src/engine/` is the authority for game behaviour. React and CSS files under `source/src/` are the interface authority.
- `source/src/textfit.ts` controls measured card-text fitting. The current effect-text upper cap is 64 design units; flavour text is capped at 32, but the real rendered size is chosen by measurement.
- `play/` is the generated static game served to players. Build it from `source/`; do not hand-edit it.
- `docs/Convergence Browser Game Roadmap.html` is useful for design direction and browsing, but its embedded roster can lag behind the live CSV.
- `materials/local-production/` contains optional rebuild tools and source libraries. It is not required to play the included build.
- `counter/` is the small aggregate player-count service used by the public landing page.

The maintained game is React and TypeScript with a deterministic rules engine, DOM-rendered full card faces, Ascension Relics, persistent local saves, and a practice bot.

## Run and verify

From `source/`, use Node.js **20.19 or newer, or 22.12 or newer**, matching the current Vite requirement.

```bash
npm ci
npm run dev
npm run validate:data
npm test
npm run build -- --base=./
```

Use the development or preview server URL, not a `file://` URL. A white page can mean the server is stopped, a different folder is being served, or `play/` is behind `source/`.

Run the relevant checks before calling a code change finished. Useful focused checks include `npm run check:ui`, `npm run check:audio`, `npm run check:cardface`, `npm run shoot`, `npm run sim`, and `npm run check:balance`. Browser checks need the local server running where their help text says so.

For a deployable update, build with `--base=./`, replace the generated `source/dist/` contents in `play/`, verify that `play/index.html` and its asset references are present, then commit and push the generated copy. GitHub Pages serves `play/` from the repository's published static site.

## Changing cards and effects

For stats, wording, keywords, timing, or art paths, update the relevant `cards.csv` row, validate the data, run focused tests, and rebuild the playable copy when needed.

For a behaviour change, update the printed CSV text and the engine branch together. Search the existing `EffectId` and `effectIds` definitions before adding an effect. Add a focused test that proves the new rule.

When an effect is changed, replace the old effect and its old keywords or timing unless the request explicitly says to retain them. Do not silently append a new effect to an existing Taunt, Chained, Divine Shield, or other rule.

Printed timing must match play. For every target or choice, specify whether it selects a minion, board slot, hand card, or random legal object. Test no-valid-target, cancellation, opponent-turn, and resolution behaviour where relevant.

## Engine rules that must stay coherent

- Keep the engine deterministic. Randomness comes from game state and its seeded RNG, never `Math.random()` in the engine.
- Taunt is enforced through legal targets. Divine Shield is a breakable state. Invulnerable prevents damage. These are gameplay rules with visible card states, not text-only decoration.
- Slot auras and protected slots belong to the board position, not the minion occupying it. Replacement and movement must preserve the intended slot rule.
- When the saved minion shape changes, bump `SAVE_VERSION` and extend save validation. Otherwise old saves can restore incomplete objects and leave the game blank.
- Relics are equipment instances: one per minion, destroyed with their bearer, and moved at most once per turn. Moving a relic must not re-trigger one-shot equip logic.
- The bot evaluates legal actions on a throwaway state. A new effect usually needs no separate bot branch, but bot valuation changes affect balance measurements and need a fresh balance run.

The engine’s central contract is `applyAction(state, action, library) -> { state, events, legalActions }`. An action outside the legal-action list is rejected without changing the state. Targeting pauses the game in a target-selection state so human and bot choices follow the same route and survive saving, cloning, and undo.

## Interface and card faces

Cards are DOM-rendered by `CardFace` and CSS, using a 750 × 1050 design coordinate system. Keep full card faces readable in hand and on the board. Text fitting must use `source/src/textfit.ts`, which measures the real fonts and finds the largest size that fits the box; the 64/32 caps are upper bounds, not a substitute for measurement.

Conditions have distinct, composable visual channels:

- Divine Shield uses a gold rim.
- Invulnerable uses a blue-and-white rim.
- Frozen uses ice treatment.
- Chained draws chains only across artwork.
- Sleeping shows drifting `z` glyphs.
- Silenced greys and blanks rules text.
- Protected and Adapted use teal or camp glow.
- Attack Locked greys the ATK gem.
- Marked uses a red pulse.

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
