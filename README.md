# Convergence — Game Guide and Development Reference

**Use this page when** playing, running, changing, testing, balancing, documenting, or troubleshooting the Convergence browser card game.

<!-- KB-JUMP-START -->
**Jump:** Play · What the game still needs · Rules · Card language · Relics · Controls and modes · Project structure · Parallel work · Run and verify · Cards and effects · Engine rules · Interface · Balance · Assets and audio · Contributing · Development lessons
<!-- KB-JUMP-END -->

## What Convergence is

Convergence is a non-commercial browser card duel where 172 named characters and forces from fiction collide alongside three Basic reference cards in one shared deck. It supports a hotseat duel on one screen or solo play against three opponent levels:

- **Recruit** — deliberately forgiving.
- **Veteran** — plays each move correctly but does not plan beyond it.
- **Ascendant** — searches a full turn, assumes you answer well, and cheats. See [The cheat ladder](#the-cheat-ladder).

[Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/play/)

**Owner play location:** Play only through the public [GitHub Pages game URL](https://ross-ai-lab.github.io/convergence-card-game/play/). The local `play/` folder is a generated deployment artifact for building and publishing; it is not the owner's play location.

No account or installation is required. The public site records only an aggregate count of browsers that opened the game, not player names or visitor records. The current game uses all **172 character cards, 3 Basic reference cards, and 21 Ascension Relics** in one shared 196-card draw pool; there is no deck-building screen. Each new duel generates fresh browser entropy, shuffles that complete pool once, and then draws from the top. The seeded order is stored in game state so Continue, undo, tests, and replays remain exact.

The live game and `source/data/cards.csv` now contain 172 named character cards plus 3 Basic reference cards, 175 card definitions in total; the lore guide is a reference document, and the live roster is the source of truth.

## What the game still needs

**The duel itself is finished and it is fun.** The owner has played it and enjoyed it. Treat "does a
turn feel good" as an answered question, not an open one, and do not put a human playtest back on any
list of remaining work. Older notes that describe the playtest as pending are stale; correct them
where you find them.

**The one big thing missing is meta-progression.** A duel ends and nothing survives it: no record, no
unlock, no rank, no reason the tenth duel differs from the first. Everything else outstanding is
maintenance beside it, because everything else improves a match that already works. No direction has
been chosen yet, so do not start building one without asking. The four candidates, smallest first:

- **A record.** Duels played, won and lost per bot level, plus the last few results.
- **A collection.** Cards seen, played, or won with, marked in the existing gallery.
- **A ladder.** Beat Recruit to open Veteran, beat Veteran to open Ascendant.
- **A run.** A sequence of duels carrying something forward: a kept relic, a kept Hero Power, a
  growing core. The largest option, and the one that changes the game most.

A draft or deckbuilding mode pairs with the run option, because a drafted deck is the most natural
thing for a run to carry. A match currently shows roughly 25 to 30 of the 175 cards and the player
chooses none of them, so that mode is also what would make the roster size mean something.

**The balance gate is red, on a fresh baseline measured 18 August 2026.** Three of eleven checks
failed. In the order they matter:

- **An invariant breach: `instance <id> is on the board twice`**, found under random legal play. This
  is corruption rather than a balance problem, and it is the only finding that can produce a broken
  duel instead of an unfair one. Replay it with
  `npm run sim -- --replay sim-fuzz-46 --drivers random,bot`, which reproduces it at turn 16 on
  instance `m6`. Fix this before touching any card.
- **One duel in 1,000 never finished.** `npm run sim -- --replay sim-308` reproduces it: 121 turns
  against a 120 cap, cores at 27 and 15, and no invariant broken. A slow grind, not a lock.
- **First player wins 57%** against a 44 to 56% band. The gate flags that its own 95% range still
  touches the band, so do not act on this from one run.

The per-tier outliers ARE usable, because each card is compared with its own cost bracket inside one
run: above their tier, Escanor "The One" +23.6, Elden Beast +19.5, Darth Vader +17.9, Planetary
Defense Grid +16.9, Flash +14.7; below it, Cecil -23.1 (the worst card in the game, a 2-mana 1/1),
Ten Tails -15.2, Shigaraki -14.2, The Watcher -13.8. Cost 7 is clean.

**Do not tune from the run-to-run diff.** That block spans both a roster change and the bot rewrite
that landed in the same window, so it measures two things and separates neither, and several of its
entries do not clear their own stated noise floor. For the same reason, hold off on tuning anything
except the three largest gaps until the bot stops moving: a ±23 gap is too big to be bot noise, and a
±10 one is not.

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

Mana is the roster's in-fiction power grade for each card subject. A 2-mana subject is intended to be more powerful in lore than a 1-mana subject, and subjects sharing a mana value should be roughly equal in lore power. Determine mana from the subject's lore first; stats, effects, timing, and keywords are the later card translation and are not evidence for the mana tier.

#### Lore-only audit safeguard

Mana comparisons must use canon lore and narrative role only. Do not use printed ATK, HP, effects, keywords, synergies, board outcomes, engine behaviour, or gameplay impact as evidence that a subject belongs in a higher or lower mana tier. Those fields are the game's representation of the subject, not evidence of the subject's in-fiction power. First place the subject on the Basic lore ladder from its source material; only afterward should stats and effects be designed to express that placement. If a subject has multiple versions, state which canon version is being judged instead of mixing versions or inferring lore from its card mechanics.

An earlier audit violated this rule by treating card effects and gameplay impact as lore evidence. Do not repeat that mistake: every future mana review must show the subject's current card text separately, but the tier judgment must be justified only by the subject's canon capabilities, scale, achievements, and narrative role.

Each mana tier also has a **Basic** reference card that represents the peak power of that tier. A card at mana **N** may equal, but must not exceed, the Basic card at N; it must also be strong enough to defeat the Basic card at N-1. The 7-mana reference card is **Mothership (6/6)**, placed above the 6-mana UFO and below the 8-mana Star Destroyer. The 9-mana reference is **Planetary Defense Grid (4/8)**, and the 10-mana reference is **Black Hole (10/5)**.

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
- During a duel, attached relic badges show who is carrying each relic. Click a movable badge to begin a transfer; there is no separate relic-shelf screen.

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
- **How to play** opens the in-duel rules guide.
- **Settings** contains sound mute/volume controls and returns to the title screen. Choose the bot level on the title screen before starting a duel.
- **Cards** opens the card gallery from the title screen.
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
- Passive stat/keyword auras are derived from live sources through `auraBonuses`. Refresh removes each source's contribution before reapplying live auras, so a dead or Silenced source cannot leave a stale buff behind. Use this reversible path for effects such as Giant Tree and the other live passive auras; do not use a permanent `buffMinion` call for a Passive aura.
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

### The cheat ladder

The three difficulties differ in what the opponent is allowed to KNOW, not only in how far it searches. Higher difficulties cheat on purpose. Every cheat is information the bot could not honestly have; none of them give it extra mana, extra core health, or a stat it did not earn.

| Cheat | Recruit | Veteran | Ascendant |
|---|---|---|---|
| Sees your hand | no | no | yes |
| Predicts your reply | no | no | assumes your best line |
| Knows the dice before committing | no | no | yes |
| Sees the top of the shared deck | no | no | next 3 draws |
| Draws two and keeps one | no | no | every turn |

`BOT_CHEATS` in `source/src/engine/bot.ts` is the single source of truth for that table; `source/src/engine/bot-cheats.test.ts` fails if the code and this page disagree.

Notes that matter when changing any of it:

- **Reading the dice used to be an accident, and every skill had it.** A candidate move is tested by applying it to a copy of the real state, and the RNG seed lives in the state, so the copy rolled exactly the dice the game was about to roll. Recruit and Veteran now evaluate on a scrambled seed and average five rolls when a move is genuinely random, which is what a player does. Three samples was not enough: a one-in-three gamble came out ahead whenever two samples landed on the good outcome.
- **Seeing your hand is not a separate feature.** The Ascendant plays your reply turn out using your real cards, so it has always had this; branching your best few replies rather than assuming one greedy line is what turns the knowledge into pressure.
- **Foresight is granted by the engine, not by the bot.** The draw happens inside `beginTurn`, which knows nothing about bots, so the seat is named in `GameState.foresightFor` and the app sets it from `BOT_CHEATS` when the duel starts. It survives a save. Self-play never sets it, so the balance harness keeps measuring the honest game.
- **The deck is shared, which is what makes Foresight and Clairvoyance interesting.** The card the Ascendant rejects is the card you were about to draw, and every card it sees coming is a card it knows might go to you instead.
- **Clairvoyance values an upcoming card by its printed cost**, because this game freezes cost as the subject's power grade in its own fiction. That is a proxy standing in for a real per-card valuation the bot does not have yet. Replace it when that valuation exists.
- **A bot-valuation change moves every balance number.** Blind dice change how random-effect cards perform in self-play. Re-measure rather than comparing across the change.

Measured on 2026-08-17 with `npm run sim -- --ladder`, on the same cards and the same seeds, once with the pre-cheat bot and once with the shipped one:

| Matchup | Pre-cheat bot | Shipped cheat bot | Paired verdict | Games |
|---|---|---|---|---|
| Ascendant beats Recruit | 83.0% | 91.0% | +8.0, leans positive but does not clear the bar (p=0.077) | 100 |
| Ascendant beats Veteran | 81.0% | 82.0% | +1.0, nothing (p=1.000) | 100 |
| Veteran beats Recruit | 71.5% | 71.5% | 0.0, nothing — but 18 duels flipped, 9 each way (p=1.000) | 200 |

**The cheats did not measurably raise the Ascendant's win rate.** They changed how it plays, not how often it wins against these opponents. Against a human that should read very differently, because the two cheats with the most bite — seeing your hand and taking your draw — are aimed at a player who holds cards for a reason. A bot ladder cannot measure that, and this table should never be quoted as how hard the game feels.

That last row is the clearest argument for the paired comparison. The percentage is identical to the decimal in both runs, which reads as "the blind-dice change did nothing at all". Eighteen of those 200 duels actually changed hands; they simply cancelled. Only the game-by-game pairing can tell those two situations apart.

Three earlier readings of this ladder were wrong and are recorded here so they are not repeated. A pre-cheat figure of 88.8% came from a 15 August run measured on a different roster, and the apparent 14-point collapse was that roster difference, not the bot. A follow-up at 80 duels put Ascendant-versus-Veteran at 75.0%, against 81-82% here: that is the sampling error of 80 duels, which is why the two Ascendant matchups now run 100 and why comparisons go through `--ladder-compare` instead of subtraction.

### How long an enemy turn may take

**The budget is 8 seconds for a whole enemy turn**, raised from 5 on 2026-08-18. Check any bot change against that number, and measure a whole TURN rather than a move: a turn is five or six moves, and `BOT_DELAY_MS` (620 ms) sits between each one, so roughly 3.7 seconds of every turn is a deliberate pause with no thinking in it at all.

Two deterministic cost cuts keep the beam affordable: `DEEP_LINES` limits how many built turns get the expensive opponent-reply search, and `BEAM_BUDGET` narrows the beam on crowded boards.

Measured 2026-08-18 on a confirmed-idle machine, 56 Ascendant turns across five duels:

| Dials | Median turn | p90 | Worst | Over 8 s |
|---|---|---|---|---|
| deep 4, branch 3, budget 110 | 3.81 s | 9.01 s | 14.10 s | 11% |
| **deep 5, branch 3, budget 110 (shipped)** | **3.41 s** | **9.39 s** | **14.15 s** | **11%** |
| deep 6, branch 4, budget 80 | 3.91 s | 10.79 s | 17.88 s | 16% |

The first step up is free and the second is not, which is why the shipped value is 5. It is also worth nothing: a paired ladder A/B of 4 against 5 moved both Ascendant matchups by +1.0 at p=1.000, with only three and five duels in a hundred changing at all.

Also worth knowing: tightening `BEAM_BUDGET` to curb the slow turns made them *worse*. The slowest turns are the LONG ones — many moves, each paying full search — not the crowded ones, and no dial here caps a turn's move count. The tail is not currently reachable by tuning.

**Do not read a bigger search number as a stronger opponent.** Three separate deepenings of this search have now measured as zero: the cheats, the beam, and this dial. The limit is not how far the bot looks, it is what `scoreState` can see — it counts a hand by length, cannot value a passive effect, and rates a draw engine at nothing. Fix the judgement before buying more search.

### Beware the shared ladder file

`.preview/balance/ladder.json` is a single file that every ladder run and every full balance pass overwrites, including runs started by another session. **Snapshot a baseline to a private filename in the same breath as producing it**, never later. A comparison here was once run against a stranger's 10:46 run that had silently replaced the intended baseline, and reported a confident 6-point regression that belonged to nobody.

The tell is in the output, and it is easy to read past. A dial line saying `deepLines: undefined -> 5` means the baseline came from a bot that had no such setting at all. If a baseline is genuinely yours, the dial lines name both values.

### Measuring anything timed, on this machine

**A benchmark is a tool that lies by default, because nothing in the result says what else was running.** Several sessions work in this repository at once, so an idle machine is an assumption and never a default. A whole afternoon of turn-time figures here were quoted, written into this guide, used to call a feature too slow, and then used again to call it free — all measured while a balance pass ran on the same CPU. The clean numbers above came out roughly 40% lower.

Three rules:

1. **Confirm the machine is quiet before timing anything**, and record that alongside the number. A figure without its conditions is not a measurement.
2. **Prefer a back-to-back A/B to any absolute number.** Run both versions within minutes of each other; shared load hurts both roughly equally, while an absolute number is pure noise.
3. **A test that fails on a TIMEOUT under load is not a defect, and raising its budget is the wrong reflex.** The tell is the whole suite inflating together — one run went from 337 s to 529 s. Re-run that file alone before touching anything. Test budgets in `pacing.test.ts` are set from measured quiet-machine times with room for load, and each carries its measured time in a comment.

The same trap applies to any duration: build times, deploy times, "is this optimisation working".

**Neither cut may be replaced by a wall-clock deadline**, however obvious that looks. The same board would then produce different moves on a slower machine, and every save, replay, undo and test in this engine depends on that not happening. Cost limits here are always derived from the position.

A caution for whoever measures next: the first attempt at this compared the beam's turn times against nothing and concluded the beam had broken the budget. The pre-beam game was already over it. Measure both sides or the number means nothing.

### Comparing two ladder runs

**Never answer "did that change help?" by subtracting one run's win rate from another's.** At these sample sizes the difference of two runs carries around seven points of error, so any ordinary change disappears into it, and the subtraction gives no warning that it has. That mistake has already been made once here: a run measured on an older roster was read as a 14-point bot regression, when the bot was responsible for under four points of it.

Use the paired comparison instead:

```bash
npm run sim -- --ladder-compare .preview/balance/ladder-before.json
```

It pairs the two runs duel by duel and counts only the games whose result flipped. Every ladder duel is seeded by matchup and index, so two runs deal identical shuffles; pairing them cancels shuffle luck instead of averaging over it. That makes a four-point change visible on 100 duels, where subtracting percentages would need roughly 900. The maths is a two-sided exact McNemar test in `scripts/ladder-compare.ts`.

How to read the output:

- **won→lost and lost→won** are the flip counts. Everything else stayed the same and carries no information.
- **verdict** is `improved`, `worsened`, or `no measurable change`, at p < 0.05. Equal flips in both directions is genuinely no evidence, however much the percentage moved.
- **Bot dials that changed** is printed from a snapshot each run stores. Identical dials mean any difference came from the engine or the card data, not the bot.
- A matchup whose seeds are not identical between the runs is **REFUSED**, not approximated. Changing a sample size makes the old run unpairable, by design — a partial pairing is the silent wrong answer this tool exists to prevent. Re-run the baseline at the new size.
- **Card data is not captured.** A comparison spanning a roster change measures the bot and the cards at once, and nothing in the output can separate them. Re-run the baseline after any card change.

Save a baseline before making a bot change, not after:

```bash
cp .preview/balance/ladder.json .preview/balance/ladder-before.json
```

### Full balance-command gate and runtime

`npm run check:balance` is an expensive full-roster measurement, not a routine check. Never launch it unless the owner explicitly says to run `npm run check:balance` or otherwise explicitly authorises that full command. A request described as “a balance pass,” even when it lists card changes, is not authorisation. Do not run the full command for one changed card; use focused tests and data validation. Reserve it for a pass that changes many cards, global pacing, draw rules, bot valuation, or another system-wide balance lever.

The observed full run at the 1,000-duel cap, measured on 18 August 2026, took **1 hour 40 minutes** wall-clock. Self-play was 506 seconds and fuzz 31 seconds; the Ascendant ladder was the remaining **91 minutes, about 91% of the run**. The earlier estimate of roughly ten minutes came from a 1,500-duel run that took 11 minutes 28.2 seconds before the Ascendant searched whole turns, and it is no longer close.

Treat that as a planning fact, not a footnote. A measurement nobody can afford to run twice cannot be tuned against, because tuning needs a before and an after, so the ladder's cost is now the thing standing between this project and its next balance pass. Anything that cuts Ascendant search cost buys back most of this run.

### Replaying a failure the harness found

Every duel is seeded, so any failure the gate reports can be played back exactly.

```bash
npm run sim -- --replay sim-308                              # a self-play stall
npm run sim -- --replay sim-fuzz-46 --drivers random,bot     # a fuzz invariant breach
```

**A fuzz duel needs its `--drivers` pair or it is a different duel.** The fuzz phase rotates random/random, bot/random, random/bot and bot/bot, and `--replay` defaults to bot/bot because self-play duels are bot-vs-bot. Replaying a fuzz seed without its drivers runs a duel that never had the bug and prints `no invariant ever broke in this duel`, which reads exactly like the defect being fixed. The fuzz summary prints the whole command beside each distinct breach; copy it rather than retyping the seed alone.

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
