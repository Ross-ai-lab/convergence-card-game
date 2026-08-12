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

No account or installation is required. The public site records only an aggregate count of browsers that opened the game, not player names or visitor records. The current game uses all **175 character cards plus 21 Ascension Relics** in one shared 196-card draw pool; there is no deck-building screen. Each new duel generates fresh browser entropy, shuffles that complete pool once, and then draws from the top. The seeded order is stored in game state so Continue, undo, tests, and replays remain exact.

## Rules at a glance

- Both cores begin at **76 health**. Reduce the opposing core to zero to win.
- Both players draw from the same shuffled deck. The player going first opens with **2 cards**; the other opens with **3 cards and The Coin**.
- At the start of a turn, draw one card. Mana starts at **1**, refills each turn, and increases by one each turn up to **10**.
- Your hand holds at most **10 cards**. A card drawn into a full hand burns and is discarded.
- Play a hand card into one of **five board slots** by paying its cost. Effects that summon minions also need an open slot.
- A minion is asleep for the turn it enters play and normally waits until its owner's next turn before attacking. A **Chained** minion is unavailable for its first two owner turns.
- A minion can attack once per turn. A minion with **0 ATK** can still attack, but deals no damage.
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
- **Deathrattle** — triggers after the minion dies, unless it was Silenced.

### Conditions and keywords

- **Chained** — unavailable for the first two owner turns; it cannot attack or run Ongoing effects until the chains break.
- **Charge** — may attack on the same turn it is summoned or brought under a new player's control.
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
- **Untargetable** — attacks and effects cannot choose the minion while the condition lasts. A minion that is also damage-immune cannot lose HP during that window.

“Destroy” kills a minion directly rather than dealing damage. “Gain stats” adds ATK and maximum/current HP to the recipient. “Summon” creates or brings a minion onto an open slot. “Lose ATK” permanently reduces ATK, never below zero. Copy effects that say **copy a passive** copy Passive or Ongoing text, not Battlecry.

**Evade** is the player-facing term throughout the game. Older internal identifiers may still contain `dodge` for save or code compatibility, but new card text and documentation should say Evade.

## Ascension Relics

The current relic pool contains **21 relics**. Relics are equipment cards: they are shuffled into the shared deck, drawn into hand, and played onto a friendly minion that has no relic. Some character effects can also find or equip a relic directly.

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

### README-only documentation policy

This file is the single maintained project guide and knowledge-base page. Do not create another Markdown file anywhere in the Convergence project; add or revise the appropriate section here instead. `npm run validate:docs` enforces that rule, and the normal data-validation, test, build, and full-balance entry points run it automatically. The two README files inside ignored, locally downloaded production packages are frozen third-party-style package notes, not new project documentation; do not add more beside them.

For a deployable update, build with `--base=./`, replace the generated `source/dist/` contents in `play/`, verify that `play/index.html` and its asset references are present, then commit and push the generated copy. GitHub Pages serves `play/` from the repository's published static site.

## Changing cards and effects

For stats, wording, keywords, timing, or art paths, update the relevant `cards.csv` row, validate the data, run focused tests, and rebuild the playable copy when needed.

### Effect-selection doctrine

Every Convergence card should feel mechanically inseparable from the character, force, or object on its face. The ideal is that the effect makes sense when the name is revealed, and the name explains why the effect works that way. A mechanically useful effect is not enough if it could be pasted onto ten unrelated cards without changing its meaning.

Choose effects by these criteria, in this order:

1. **Start from the strongest lore anchor.** Identify the subject's signature power, behaviour, motive, relationship, weakness, or defining story role. Use the most recognisable anchor, not an obscure fact merely because it is easier to code.
2. **Translate the fantasy into a game verb and condition.** Express what the subject does through targeting, timing, restrictions, risks, or board position. A good translation captures behaviour rather than copying a wiki sentence literally.
3. **Demand a mechanical silhouette.** The combination of trigger, target, and consequence should distinguish the card from its cost peers. Repeated text is acceptable only when the shared mechanic genuinely describes each subject; never use it as filler or to complete a keyword quota.
4. **Make the player enact the character.** Prefer effects that create an in-character decision or play pattern: isolation, sacrifice, protection, theft, adaptation, revenge, deception, domination, and so on. The player should feel the lore through a choice or condition, not only read it in flavour text.
5. **Keep counterplay and clarity.** The opponent must be able to understand what happened and, where the fantasy allows, answer it. State the timing, legal target, duration, and edge cases precisely. Do not add invisible exceptions just to force a lore reference.
6. **Lock the identity before balancing it.** Preserve the lore-shaped effect whenever possible, then tune ATK, HP, magnitude, duration, frequency, or conditions. Cost remains an in-fiction power ranking and is not a balance lever.
7. **Use generic mechanics only when they are specifically true.** Taunt, Divine Shield, Freeze, or a plain stat gain are vocabulary, not finished concepts. They belong only when that exact mechanic expresses the subject; otherwise shape the effect with a character-specific trigger, target, limitation, or consequence.

Use four acceptance tests before approving an effect:

- **Flavour test:** Can its lore explain every important mechanical clause?
- **Silhouette test:** Would changing the card's name make the effect feel wrong or noticeably less fitting?
- **Play-pattern test:** Does it make the player behave like, plan around, or fear something associated with the subject?
- **Truth test:** Do the printed words, timing, keywords, visuals, and engine resolution all describe the same rule?

Canonical examples:

- **Light Yagami —** kills a random enemy minion at the start of each of his controller's turns, translating the Death Note into effortless recurring killing.
- **Stain —** kills a damaged minion; damage represents exposed blood, which is the condition that lets his blood-tasting ability disable a victim.
- **Homelander —** gains +3/+3 when he is the only friendly minion, turning his ego and need to dominate the spotlight into an isolation reward.
- **Kizaru —** begins with Divine Shield and regains it each turn, matching both the apparent invulnerability of his light body and the card's golden Light theme. This is a generic keyword used well because it is the character fantasy, not filler.

The long-term target is **all cards passing these tests**. Boring copy-paste effects such as bare Taunt, bare Divine Shield, or unconditional `+2/+2` should be redesigned unless the simplicity itself is the most faithful expression of that card.

For a behaviour change, update the printed CSV text and the engine branch together. Search the existing `EffectId` and `effectIds` definitions before adding an effect. Add a focused test that proves the new rule.

When an effect is changed, replace the old effect and its old keywords or timing unless the request explicitly says to retain them. Do not silently append a new effect to an existing Taunt, Chained, Divine Shield, or other rule.

Whenever proposing new effects for cards, always list each card’s current/old effect alongside the proposed ideas before suggesting a replacement.

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
- Silenced greys and blanks rules text, with a red cross over the effect box.
- Protected and Adapted use teal or camp glow.
- Attack Locked greys the ATK gem.
- Marked uses a red pulse and remains visible until its delayed resolution.

Keep status indicators large enough to survive real board-card size. Verify condition work on a populated board; the opening screen cannot prove board conditions, targeting, hand interaction, or settings behaviour. Load card art eagerly and resolve public asset paths through `resolvePublicAssetUrl` so the game works both at a domain root and under a project page path.

### Title-menu design QA record

The accepted title-menu direction uses the game’s real card art in a moving edge-to-edge field, an orbital difficulty selector, a violet rift, ivory-and-gold typography, and a cyan selected state. It replaced an earlier implementation whose floating cards left large gaps and whose entrance animation could freeze midway when a browser capture backgrounded the page.

The final pass established these decisions:

- Keep cards drifting inside distributed lanes; the accepted 1331 × 848 capture showed 63 of 84 cards visible with all 12 vertical lanes populated.
- Keep the menu fully visible on first paint. The unstable screen and letter entrance animations were removed, while the ambient rift and card motion remain.
- Place all three difficulty labels in the rift artwork’s normalized coordinate system so they stay on their intended slider segments across aspect ratios.
- Preserve the exact Veteran and Duel hover bounds; hover changes only colour and glow.
- Keep the controls smaller and less text-heavy than the previous menu, and make background cards visible without competing with them.

Interaction verification covered Recruit, Veteran, and Ascendant selection; the selected Duel label; playable Veteran and two-player launches; Settings open/close/return; no overflow at 390 × 844 or 1005 × 397; and a clean browser console. The implementation passed production build, automated tests, and live-site verification. The original local evidence captures were `.preview/github-pages-final-1331x848.png` and `.preview/github-pages-settings-verified.png`; `.preview/` is disposable evidence and is not published.

## Balance, pacing, and bot

Card cost is a fiction and canon assignment, not a balancing lever. Change stats, effect magnitude, timing, keywords, or global pacing instead.

Judge each card against its own cost tier, not against the whole-roster average. Separate play rate from win rate, and treat effects the bot cannot value as unmeasured. Re-measure after every balance or pacing pass: a previous buff can become the next pass’s worst outlier, and a bot-valuation change can move every balance number.

Balance checks must report inadequate samples, unset thresholds, disabled checks, and missing results as a skip or failure, never as a silent pass.

### Full balance-command gate and runtime

`npm run check:balance` is an expensive full-roster measurement, not a routine check. Never launch it unless the owner explicitly says to run `npm run check:balance` or otherwise explicitly authorises that full command. A request described as “a balance pass,” even when it lists card changes, is not authorisation. Do not run the full command for one changed card; use focused tests and data validation. Reserve it for a pass that changes many cards, global pacing, draw rules, bot valuation, or another system-wide balance lever.

The measured full run on this machine with the former 1,500-duel sample took **11 minutes 28.2 seconds** wall-clock. Its self-play phase took 268 seconds, fuzz took 21 seconds, and the Ascendant skill ladder accounted for most of the remaining time. The harness now caps self-play at **1,000 duels**; based on the measured phase costs, a future owner-authorised full run should take roughly ten minutes. Replace that estimate with an observed 1,000-duel time after the next explicitly authorised run.

Do not make the simulated rules, bot skill, or turn timing “10× faster” by simplifying them: that would measure a different game. Safe implementation optimisations may reuse already-computed legal actions and candidate results, and independent duels may eventually run across CPU workers if deterministic output and result ordering are preserved. The current harness applies the safe reuse optimisation; the Ascendant ladder remains the unavoidable dominant cost because it searches whole turns.

## Assets and audio

`source/public/` is the runtime asset location. `materials/local-production/` contains optional rebuild tools for art, music, voice previews, and cast sheets; it is not required to play the included build. Large audio and card-production libraries are release downloads rather than normal clone requirements.

The complete original audio collection is the separate [Convergence-Audio-Tracks.7z release download](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Audio-Tracks.7z), because it is larger than a practical GitHub Pages site.

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
- When replacing a card effect, treat it as a full definition replacement: remove every obsolete keyword and every obsolete keyword sentence from the CSV row unless the new effect explicitly retains that rule. Before calling the change finished, compare the new keywords, timing, and printed text with the requested effect so stale Taunt, Divine Shield, Chained, Passive, or similar rules cannot survive by accident.
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
