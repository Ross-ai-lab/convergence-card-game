# Convergence — Game Guide and Development Reference

**Use this page when** playing, running, changing, testing, balancing, documenting, or troubleshooting the Convergence browser card game.

<!-- KB-JUMP-START -->
**Jump:** Play · Rules · Card language · Relics · Controls and modes · Project structure · Parallel work · Run and verify · Cards and effects · Engine rules · Interface · Balance · Assets and audio · Contributing · Development lessons
<!-- KB-JUMP-END -->

## What Convergence is

Convergence is a non-commercial browser card duel where 173 characters and forces from fiction collide in one shared deck. It supports a hotseat duel on one screen or solo play against three opponent levels:

- **Recruit** — deliberately forgiving.
- **Veteran** — plays each move correctly but does not plan beyond it.
- **Ascendant** — searches a full turn and answers likely plans.

[Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/play/)

**Owner play location:** Play only through the public [GitHub Pages game URL](https://ross-ai-lab.github.io/convergence-card-game/play/). The local `play/` folder is a generated deployment artifact for building and publishing; it is not the owner's play location.

No account or installation is required. The public site records only an aggregate count of browsers that opened the game, not player names or visitor records. The current game uses all **173 character cards plus 21 Ascension Relics** in one shared 194-card draw pool; there is no deck-building screen. Each new duel generates fresh browser entropy, shuffles that complete pool once, and then draws from the top. The seeded order is stored in game state so Continue, undo, tests, and replays remain exact.

The live game and `source/data/cards.csv` now contain 173 character cards; the lore guide is a reference document, and the live roster is the source of truth.

## Parallel work

Multiple threads usually work on Convergence at the same time. Files, generated artifacts, tests, and documentation may shift while you are working; that is expected. Preserve changes you did not create, do not revert them, and do not stop the other threads. Re-read the current file before making an overlapping edit. A small compile or test repair is fine when necessary, but keep it behavior-neutral unless the thread that owns the change explicitly asks for a behavior change.

## Rules at a glance

- Both cores begin at **76 health**. Reduce the opposing core to zero to win.
- Both players draw from the same shuffled deck and open with **3 cards**. The second player also receives **The Coin**.
- At the start of the duel, each player is offered **2 random Hero Powers** and chooses one. A Hero Power costs **2 mana** and can be used once during its controller's turn.
- At the start of a turn, draw one card. Mana starts at **1**, refills each turn, and increases by one each turn up to **10**.
- Your hand holds at most **10 cards**. A card drawn into a full hand burns and is discarded.
- Play a hand card into one of **five board slots** by paying its cost. Effects that summon minions also need an open slot.
- A minion is asleep for the turn it enters play and normally waits until its owner's next turn before attacking. A **Chained** minion is unavailable for its first two owner turns and cannot be targeted by attacks or effects while chained.
- A minion can attack once per turn. A minion with **0 ATK** can still attack, but deals no damage.
- Combat is simultaneous: attacker and defender deal damage to each other, even when the attack kills the defender.
- **Taunt** must be dealt with before attacks can reach the opposing core, unless an effect or relic explicitly bypasses that defence.
- When the shared deck and its bottom-deck cards are empty, drawing causes escalating fatigue damage: 1, then 2, then 3, and so on.

Nothing damages a core automatically just because a turn starts; core damage comes from a minion attacking it or from an effect that explicitly says it damages a core.

## Cards and card language

Each card has a cost, ATK, HP, rarity, artwork, flavour text, a **camp**, and an **alignment**. The four camps are **Magic**, **Nature**, **Tech**, and **ALL**. An **ALL** card receives positive buffs aimed at any of the three source camps, but never camp-specific debuffs. The three alignments are **Good**, **Evil**, and **Neutral**. Many effects target a camp or alignment, so read both labels before playing a card.

### Mana is lore power

Mana is the roster's in-fiction power grade for each card subject. A 2-mana subject is intended to be more powerful in lore than a 1-mana subject, and subjects sharing a mana value should be roughly equal in lore power. This is separate from gameplay balance: tune stats, effects, timing, or keywords first, and change mana only when the subject's lore placement is wrong.

Each mana tier also has a **Basic** reference card that represents the peak power of that tier. A card at mana **N** may equal, but must not exceed, the Basic card at N; it must also be strong enough to defeat the Basic card at N-1. The 7-mana reference card is **Aircraft Carrier (6/6)**.

### Timing words

- **Battlecry** — happens once when the minion enters play.
- **Ongoing** — happens at the start of its owner's turn while the minion is active. An enemy's Ongoing effect therefore waits for that enemy's next turn; it does not fire on the opponent's intervening turn.
- **Passive** — continuously applies while the minion is active; it does not trigger a second time. A Passive aura is transient: if its source leaves the board or is Silenced, its granted stats/keywords disappear with it.
- **Battlecry/Ongoing** — the same effect happens on arrival and again at the start of its owner's turns.
- **Deathrattle** — triggers after the minion dies, unless it was Silenced.

### Conditions and keywords

- **Chained** — unavailable for the first two owner turns; it cannot attack, run Ongoing effects, or be targeted by attacks or effects until the chains break.
- **Charge** — may attack on the same turn it is summoned or brought under a new player's control.
- **Taunt** — the enemy must deal with this minion before attacking your core.
- **Divine Shield** — blocks the next damage instance, then the gold shield disappears.
- **Freeze** — the minion loses its next turn, then thaws after sitting out that turn.
- **Silence** — removes the minion's printed effect and active keywords; its stats remain.
- **Invulnerable** — the minion cannot take damage while the condition is active; the blue-and-white aura shows it.
- **Evade** — gives the minion a chance to avoid an incoming attack. The percentage is printed on the card.
- **Sleep** — the normal one-turn delay after play. It is separate from Chained.
- **Attack Locked** — the minion cannot attack until the printed lock duration ends; its attack gem is greyed out.
- **Protected slot** — a board position protects its minions from Silence, Freeze, and Chained effects. It does not stop ordinary targeting, removal, or combat damage. The protection belongs to the slot, not permanently to the minion occupying it.
- **Immune** — the named damage type cannot hurt the minion while the immunity is active.
- **Marked** — a delayed effect is waiting on the minion; the card text explains when it resolves.
- **Untargetable** — attacks and effects cannot choose the minion while the condition lasts. A minion that is also damage-immune cannot lose HP during that window.

“Destroy” kills a minion directly rather than dealing damage. “Gain stats” adds ATK and maximum/current HP to the recipient. “Summon” creates or brings a minion onto an open slot. “Lose ATK” permanently reduces ATK, never below zero. Copy effects that say **copy a passive** copy Passive or Ongoing text, not Battlecry.

**Evade** is the player-facing term throughout the game. Older internal identifiers may still contain `dodge` for save or code compatibility, but new card text and documentation should say Evade.

## Ascension Relics

The current relic pool contains **21 relics**. Relics are equipment cards: they are shuffled into the shared deck, drawn into hand, and played onto a friendly minion with an open relic slot. Some character effects can also find or equip a relic directly.

- A minion can carry up to two relics. The first and second slots are independent;
  a full bearer cannot accept a third, and moving one relic does not move or
  re-trigger the other.
- A relic dies with its bearer.
- A relic that can be moved may be passed to another friendly minion by clicking its badge and then the recipient. This is limited to once per player's turn.
- Some relics spend themselves when they arrive and cannot be passed.
- The **Relics** button shows the remaining shelf, its order, and who is carrying each relic.

## Controls and modes

### Starting and resuming

The title screen offers **Continue your duel** when a live duel was saved in that browser, solo play at one of the three bot levels, and a two-player hotseat duel. A duel is saved locally after state changes; completed duels are not offered for resuming. Hotseat uses a privacy curtain while the screen is passed so the next player cannot see the previous player's hand.

### Opening duel animation timeline

The opening is driven by one React phase clock plus several CSS animations. The circle's 3.43-second draw window and the `drawMs: 3_430` value in `source/src/App.tsx` must stay aligned. The intro ends after the mana reveal, while pointer-free opening card flights may finish behind the playable board.

| Relative time | Phase or animation | Length and delay | What it controls |
|---:|---|---|---|
| 0 ms | `prelude` | 1,860 ms | Dims and blurs the board before the reveal. |
| 0 ms | `duel-intro-in` | 1,380 ms | Fades in the full-screen intro veil. |
| 0 ms | `duel-rift-arrive` | 4,050 ms | Expands and settles the large centered circle. It changes scale and rotation, not horizontal position. |
| 1,860 ms | `reveal` | 1,680 ms | Sharpens the board and plays the short reveal beat. |
| 3,540 ms | `draw` | 3,430 ms | Starts the opening card deal and the circle's 3.43-second visual window. |
| 3,540 ms | `duel-rift-spin` | 3,430 ms, one iteration | Rotates the outer circle and both masked rings through a 288° arc. This is 20% less arc and 30% slower angular motion than the previous 360° / 3-second pass. |
| 3,540 ms | `duel-rift-draw-window` | 3,430 ms | Holds the circle, then fades it out by the mana handoff. |
| 3,540 ms | `opening-draw-fly` | 3,870 ms per card | Flies each opening card from the deck. Player delays are 0, 630, 1,260 ms; opponent delays are 330, 960, 1,590 ms. The last flight ends 5,460 ms after draw starts. |
| 3,540 ms | `opening-hand-arrive` | 3,240 ms per hand card | Settles the cards into the fan. The first delay is 360 ms, then each hand index adds 630 ms. |
| 3,540 ms | `deck-kick` | 1,890 ms in the opening draw | Gives the third deck card its opening-deal response. |
| 6,970 ms | `mana` | 570 ms phase | Starts immediately after the circle window. Each full mana pip fills for 465 ms with a 67.5 ms stagger. |
| 7,540 ms | `exit` | 315 ms | Fades out the remaining intro veil. Controls unlock at about 7,855 ms; opening card flights continue without blocking input. |

The opening uses the licensed `opening-jrpg-trailer.ogg` cue instead of the spoken `duel_begin` line. It is a 4.9-second CC0 cut—about three times the previous 1.62-second cue—from SubspaceAudio (Juhani Junkala)'s [JRPG Trailer / Theme](https://opengameart.org/content/jrpg-trailer-theme), converted to Ogg for the browser and played at 0.35 gain. Ambient effects are separate from the phase clock. The intro breathes for 10.2 seconds and its diagonal light sweep loops every 3 seconds. The permanent battlefield seam has a right-running sweep of 3 seconds and a left-running sweep of 13 seconds. Those seam sweeps are not the large intro circle. The circle rules live in `source/src/screens/Screens.css`; card flights and mana rules live in `source/src/App.css`; phase timers and the opening cue trigger live in `source/src/App.tsx` and `source/src/audio/sfx.ts`.

### During a duel

- Each player starts with three cards. The second player also receives **The Coin**, which spends for +1 mana that turn.
- Each player chooses one of two random Hero Powers during the opening offer. The selected power appears beside the Core and costs 2 mana once per turn.
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
- `play/` is the generated static game copied into the repository for GitHub Pages. Build it from `source/`; do not hand-edit it. The owner plays only through the public `/play/` URL above, never from this local folder.
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

To look at a specific card after changing its text, stats or art, run `node scripts/shoot-card.mjs "Kaku Kaioh"` with any number of card names or ids. It starts and stops its own dev server, deals itself each card through the `window.__debug` hook, and writes a full-frame PNG per card into `.preview/cards/`. Call it with `node` rather than `npm run` whenever a name contains a space, because npm on Windows strips the quotes; the `npm run shoot:card` alias is for the no-argument whole-roster run. The capture proves content — name, cost, rules text, stats, rails, origin, art — and deliberately not layout at play size, since the face is enlarged to fill the frame and `.card-face` is `container-type: size`. It photographs the board variant, which prints no flavour line. Gem and text collisions at real hand and board sizes stay the job of `npm run check:cardface`.

### README-only documentation policy

This file is the single maintained project guide and knowledge-base page. Do not create another Markdown file anywhere in the Convergence project; add or revise the appropriate section here instead. `npm run validate:docs` enforces that rule, and the normal data-validation, test, build, and full-balance entry points run it automatically. The two README files inside ignored, locally downloaded production packages are frozen third-party-style package notes, not new project documentation; do not add more beside them.

For a deployable update, run `npm run publish:pages` from `source/`. That command validates the data, builds with `--base=./`, replaces the generated `source/dist/` contents in `play/`, and fails unless every published file exactly matches the generated build. After it succeeds, publish the generated copy to the GitHub repository. GitHub Pages serves `play/` from the repository's published static site.

## Changing cards and effects

For stats, wording, keywords, timing, or art paths, update the relevant `cards.csv` row, validate the data, run focused tests, and rebuild the playable copy when needed.

### Card wording is uniform, and that is a mechanical requirement

Printed effect text uses one vocabulary across the whole roster. This is not a style preference. Two cards that do the same thing in different words read as two different cards, and that is how duplicated rules can survive under separate effect ids without anyone noticing, or how Whitebeard's sweep can end up on Fire Lord Ozai three mana cheaper. The duplicate report in `validate-cards.mjs` compares normalised printed text precisely so that a rule written twice becomes visible, and wording drift is the one thing that blinds it.

The rules:

- **`damage`, never `DMG`.** One word for the concept.
- **`Destroy` is the action; `kills` only appears in a trigger** describing combat that already happened, as in "whenever this minion kills a minion". Never `Kill a minion` as an instruction.
- **Digits for counts a player must evaluate** (`Deal 3 damage`, `2 or more Evil minions`, `Chained for 1 turn`). Where the word is really an article, write `a` or `an` (`Silence an enemy minion`), not `one`.
- **No shouting.** `all other minions`, not `ALL other minions`.
- **Every effect ends as a sentence**, with a full stop.
- **Effect ids spell magnitudes as digits and must match the printed number.** `validate-cards.mjs` fails the build when a digit in the id is missing from the text, so renaming the id is part of changing a magnitude, not an afterthought.

### Every game change must be published to GitHub in the same session

**Every change to the game must be published to GitHub before it can be reported as done.** This includes changes to cards, balance, engine rules, interface, animations, audio, assets, or any other runtime behaviour. A source edit or a local build is not a finished change because the owner plays only the public site.

For every game change, run `npm run publish:pages` from `source/`, then commit and push the generated `play/` copy to the GitHub repository. Finally, verify that <https://ross-ai-lab.github.io/convergence-card-game/play/> serves the new bundle. This publication step is mandatory for every game change and must happen in the same session without waiting for a separate request.

The reason is that the owner never runs this project. He plays the published URL and nothing else, so a change that exists only in `source/` has not reached the only person it was made for. Worse, it reads as done in every report and every test run: the suite passes, the data validates, the card is correct in the CSV, and the game he opens is unchanged. Two sessions in a row left card changes sitting unpublished on exactly that reasoning.

Balance passes are the sharpest case, because their whole purpose is to change how the game feels to play. A tuning pass that nobody can play has bought nothing, and the next measurement will be taken against a build the player never saw.

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
- **Homelander —** becomes Invulnerable while he is your only minion, turning his ego and need to dominate the spotlight into a defensive isolation reward.
- **Kizaru —** begins with Divine Shield and regains it each turn, matching both the apparent invulnerability of his light body and the card's golden Light theme. This is a generic keyword used well because it is the character fantasy, not filler.

The long-term target is **all cards passing these tests**. Boring copy-paste effects such as bare Taunt, bare Divine Shield, or unconditional `+2/+2` should be redesigned unless the simplicity itself is the most faithful expression of that card.

For a behaviour change, update the printed CSV text and the engine branch together. Search the existing `EffectId` and `effectIds` definitions before adding an effect. Add a focused test that proves the new rule.

When an effect is changed, replace the old effect and its old keywords or timing unless the request explicitly says to retain them. Do not silently append a new effect to an existing Taunt, Chained, Divine Shield, or other rule.

Whenever a user asks to recommend effects for a minion or recommend minions for an effect, always use one complete table for the whole answer. Every row must include the minion’s name, mana, ATK/HP, old effect verbatim, and every new proposal requested (for example, all 3 replacement effects). Do not put a separate old-only table before the recommendations, and do not move the new effects into prose where mana, stats, or the old text can go missing. If the user selects replacements, keep the selected new effect, replacement stats, and implementation status in that same all-cards table.

Printed timing must match play. For every target or choice, specify whether it selects a minion, board slot, hand card, or random legal object. Test no-valid-target, cancellation, opponent-turn, and resolution behaviour where relevant.

## Engine rules that must stay coherent

- Keep the engine deterministic. Randomness comes from game state and its seeded RNG, never `Math.random()` in the engine.
- Taunt is enforced through legal targets. Divine Shield is a breakable state. Invulnerable prevents damage. These are gameplay rules with visible card states, not text-only decoration.
- Passive stat/keyword auras are derived from live sources through `auraBonuses`. Refresh removes each source's contribution before reapplying live auras, so a dead or Silenced source cannot leave a stale buff behind. Use this reversible path for effects such as Giant Tree and Chaos; do not use a permanent `buffMinion` call for a Passive aura.
- Passive status effects are transient too. Track the live source of a Passive Silence (for example, Gojo); when that source dies, leaves the board, or is Silenced, remove its Silence and restore the affected minions' effects. Do not turn a Passive aura into a permanent mutation.
- Reborn is a return, not a fresh play: every reborn minion suppresses its
  arrival card theme so an Ouken-style loop never repeats its music.
- Slot auras and protected slots belong to the board position, not the minion occupying it. Replacement and movement must preserve the intended slot rule.
- Every permanent effect that chooses a board slot must recolour that slot with a unique effect colour. Keep the small effect label above the slot, and keep both markers when a slot has multiple permanent effects.
- When the saved minion shape changes, bump `SAVE_VERSION` and extend save validation. Otherwise old saves can restore incomplete objects and leave the game blank.
- Relics are equipment instances: up to two per minion, destroyed with their
  bearer, and moved at most once per turn. Moving a relic must not re-trigger
  one-shot equip logic.
- The bot evaluates legal actions on a throwaway state. A new effect usually needs no separate bot branch, but bot valuation changes affect balance measurements and need a fresh balance run.

The engine’s central contract is `applyAction(state, action, library) -> { state, events, legalActions }`. An action outside the legal-action list is rejected without changing the state. Targeting pauses the game in a target-selection state so human and bot choices follow the same route and survive saving, cloning, and undo.

## Interface and card faces

Cards are DOM-rendered by `CardFace` and CSS, using a 750 × 1050 design coordinate system. Keep full card faces readable in hand and on the board. Text fitting must use `source/src/textfit.ts`, which measures the real fonts and finds the largest size that fits the box; the 64/32 caps are upper bounds, not a substitute for measurement.

Choice prompts that offer cards or Ascension Relics must show the complete readable card face, including its rules text, cost, and stats where applicable. Names and artwork alone are never enough to make a choice.

Conditions have distinct, composable visual channels:

- Divine Shield uses a gold rim.
- Invulnerable uses a blue-and-white rim.
- Frozen uses ice treatment.
- Chained draws chains only across artwork.
- Sleeping shows drifting `z` glyphs.
- Silenced greys and blanks the rules text (without placeholder words), with a
  red cross over the effect box.
- Protected and Adapted use teal or camp glow.
- Attack Locked greys the ATK gem.
- Marked uses a red pulse and remains visible until its delayed resolution.

Keep status indicators large enough to survive real board-card size. Verify condition work on a populated board; the opening screen cannot prove board conditions, targeting, hand interaction, or settings behaviour. Load card art eagerly and resolve public asset paths through `resolvePublicAssetUrl` so the game works both at a domain root and under a project page path.

### Visual design changes require close-up and full-screen QA

Any visual design change — including a card frame, keyword treatment, animation,
badge, status tint, spacing, or board layout — must be inspected in the running
game at both scales before it is considered done:

1. **Close-up:** inspect the whole card face and its edges at readable zoom. Check
   clipping, legibility, layering, and whether the treatment actually looks good.
2. **Full screen:** inspect the populated board at the normal play viewport. Check
   recognition at board-card size, neighbour collisions, status stacking, and
   attack/target affordances.

If the result is even slightly unsatisfying at either scale, redesign or improve
it and repeat both inspections. A passing build or a technically present CSS
class is not visual approval; the agent must look at the result itself before
publishing it.

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

Card-theme stings are the `c###.ogg` files in `source/public/audio/stings/` for the voiced entries in `source/data/cards.csv`. Relics use `r###` IDs and are intentionally not part of that theme set, even though relics share the deck and can appear in hand; audio prefetch must filter relic IDs rather than request `audio/stings/r###.ogg`.

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
- Assert every printed number exactly. Do not settle for “damage happened,” “the list is non-empty,” or “the stat changed”; assert the exact damage, stat, multiplier, event text, and affected targets, and update the expected number whenever the card changes.
- Re-read test assumptions whenever card text, engine timing, or helper setup changes. Reset counters, advance turns explicitly, and assert the expiration boundary so an unrelated once-per-turn limit or stale turn counter cannot make a test pass without checking its intended rule.
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
- [Current lore and roster guide](https://ross-ai-lab.github.io/convergence-card-game/materials/Convergence-Official-Lore.html)
- [Card statistics workbook](materials/Convergence%20card%20stat%20excel%20sheet.xlsx)
- [Raw card artwork](https://github.com/Ross-ai-lab/convergence-card-game/tree/main/materials/raw-card-art)
- Skeleton token artwork: [Skeleton Warrior by Clint Bellanger](https://opengameart.org/content/skeleton-warrior-0), adapted from the CC BY 3.0 sprite sheet.
- TIE Fighter token art: owner-supplied `source/public/card-art/raw/token-tie-fighter.png`.
- Morgott token art: owner-supplied `source/public/card-art/raw/token-morgott.png`.
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
