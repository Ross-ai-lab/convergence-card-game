# Convergence — Game Guide and Development Reference

**Use this page when** playing, running, changing, testing, balancing, documenting, or troubleshooting the Convergence browser card game.

<!-- README-NAV-START -->
> **BIG PAGE — do NOT read this file whole.** It is 185,081 bytes, roughly 46k tokens. One whole-file Read truncates at 25,000 tokens and returns only the first ~54% of it, so answering from that view means answering from a fraction of the page. Read one section instead:
>
> 1. `rg -n "^## " README.md` — every section is a `##` heading, so this prints a live, never-stale index with current line numbers.
> 2. `Read` with `offset` = that section's line and `limit` = the gap to the next heading.
>
> Chasing a symptom rather than a section: `rg -n -C3 "<3-4 distinctive words>" README.md`.

**Sections, in reading order.** Sub-entries are the `###` headings inside each one.

**What this is**

- [Version 1.0 — complete, 21 August 2026](#version-10-complete-21-august-2026)
- [What Convergence is](#what-convergence-is)
- [What the game still needs](#what-the-game-still-needs)

**How the game plays**

- [Rules at a glance](#rules-at-a-glance)
- [Controls and modes](#controls-and-modes)
  - [Starting and resuming](#starting-and-resuming)
  - [Opening duel animation timeline](#opening-duel-animation-timeline)
  - [During a duel](#during-a-duel)
- [Cards and card language](#cards-and-card-language)
  - [Mana is lore power](#mana-is-lore-power)
  - [Timing words](#timing-words)
  - [Conditions and keywords](#conditions-and-keywords)
- [Ascension Relics](#ascension-relics)
- [Gradual card unlocking](#gradual-card-unlocking)

**The code, and how to run it**

- [Project structure and source of truth](#project-structure-and-source-of-truth)
- [Run and verify](#run-and-verify)
  - [Which checks a change actually needs](#which-checks-a-change-actually-needs)
  - [README-only documentation policy](#readme-only-documentation-policy)
  - [What “publish” means](#what-publish-means)
- [Parallel work](#parallel-work)

**Changing the game**

- [Changing cards and effects](#changing-cards-and-effects)
  - [Every save that changes a card must name the cards it changed](#every-save-that-changes-a-card-must-name-the-cards-it-changed)
  - [Ask what happened to a card instead of reconstructing it](#ask-what-happened-to-a-card-instead-of-reconstructing-it)
  - [Reference requests must be globally safe and future-proof](#reference-requests-must-be-globally-safe-and-future-proof)
  - [Card wording is uniform, and that is a mechanical requirement](#card-wording-is-uniform-and-that-is-a-mechanical-requirement)
  - [Every game change must be published to the public site in the same session](#every-game-change-must-be-published-to-the-public-site-in-the-same-session)
  - [Effect-selection doctrine](#effect-selection-doctrine)
- [Engine rules that must stay coherent](#engine-rules-that-must-stay-coherent)

**Look, sound and feel**

- [Interface and card faces](#interface-and-card-faces)
  - [The game-over screen names ONE card](#the-game-over-screen-names-one-card)
  - [Clicking a keyword on a card face explains it](#clicking-a-keyword-on-a-card-face-explains-it)
  - [Hovering a minion shows what it is reaching](#hovering-a-minion-shows-what-it-is-reaching)
  - [The duel log](#the-duel-log)
  - [The hand grows as one, and the win screen never scrolls](#the-hand-grows-as-one-and-the-win-screen-never-scrolls)
  - [Three things the board now says out loud](#three-things-the-board-now-says-out-loud)
  - [Developer tools can arm the enemy](#developer-tools-can-arm-the-enemy)
  - [Developer tools can jump to the result screen](#developer-tools-can-jump-to-the-result-screen)
  - [Visual design changes require close-up and full-screen QA](#visual-design-changes-require-close-up-and-full-screen-qa)
  - [Title-menu design QA record](#title-menu-design-qa-record)
- [The rarity shine](#the-rarity-shine)
  - [The technique, which is the transferable part](#the-technique-which-is-the-transferable-part)
  - [Making fire, specifically](#making-fire-specifically)
  - [Living rails, and tier-coloured names](#living-rails-and-tier-coloured-names)
  - [Proving it, because a screenshot cannot](#proving-it-because-a-screenshot-cannot)
- [Assets and audio](#assets-and-audio)
  - [The four moment pieces, and the endings the herald no longer narrates](#the-four-moment-pieces-and-the-endings-the-herald-no-longer-narrates)
  - [A heavy minion lands with a thud](#a-heavy-minion-lands-with-a-thud)
  - [Card art is WebP. Every file, no exceptions](#card-art-is-webp-every-file-no-exceptions)
  - [What the title screen is allowed to download](#what-the-title-screen-is-allowed-to-download)

**Balance and the bot**

- [Balance, pacing, and bot](#balance-pacing-and-bot)
  - [NEVER run a balance patch without being asked. Every single time](#never-run-a-balance-patch-without-being-asked-every-single-time)
  - [The measured baseline, and what it still says](#the-measured-baseline-and-what-it-still-says)
  - [Duel length is CORRECT. Do not shorten it](#duel-length-is-correct-do-not-shorten-it)
  - [Choosing a pacing lever](#choosing-a-pacing-lever)
  - [Reading the measured numbers](#reading-the-measured-numbers)
  - [Gating on the game, not on the harness](#gating-on-the-game-not-on-the-harness)
  - [The engine premium, and why it is 22](#the-engine-premium-and-why-it-is-22)
  - [Fixing a bot-valuation blind spot](#fixing-a-bot-valuation-blind-spot)
  - [Why the bot trades into Passive and Ongoing minions](#why-the-bot-trades-into-passive-and-ongoing-minions)
  - [The cheat ladder](#the-cheat-ladder)
  - [How long an enemy turn may take](#how-long-an-enemy-turn-may-take)
  - [Bot and balance work is PARKED, not finished](#bot-and-balance-work-is-parked-not-finished)
  - [Beware the shared ladder file](#beware-the-shared-ladder-file)
  - [Measuring anything timed, on this machine](#measuring-anything-timed-on-this-machine)
  - [Comparing two ladder runs](#comparing-two-ladder-runs)
  - [The skill ladder needs explicit permission, every single time](#the-skill-ladder-needs-explicit-permission-every-single-time)
  - [Replaying a failure the harness found](#replaying-a-failure-the-harness-found)

**Project reference**

- [Contributing](#contributing)
- [Development lessons](#development-lessons)
- [Included materials and links](#included-materials-and-links)
- [Fan-project notice](#fan-project-notice)
- [Sources](#sources)

<!-- README-NAV-END -->

## Version 1.0 — complete, 21 August 2026

**Convergence is finished and shipped.** The duel works, it has been played and
enjoyed, the roster is complete with no blank cards, every card carries real
artwork and a real theme, and a record and collection now survive each duel.

What 1.0 means in practice, so nobody reopens a closed question:

- **The duel is done.** Do not put "does a turn feel good" back on any list.

**Four things are PARKED FOR VERSION 2.** Parked, not abandoned and not declined:
the owner may pick any of them up whenever he wants, and none of them is a gap in
1.0. What the parking means is that a session must not start one unasked, and must
not list one as outstanding work.

- **Bot quality.** The per-card value table, Insight, and any further search dial.
  Three separate deepenings of the search have already measured as zero, so this
  is a real problem rather than an easy win.
- **Fine balance.** Chasing a first-player rate or a per-tier outlier only matters
  once enough people play that anyone can tell.
- **Draft mode.** Worth knowing before it is picked up: this engine deals both
  players from ONE shared deck, and that is exactly what gives Foresight and
  Clairvoyance their bite. Draft means designing around losing that layer, not
  bolting a mode on beside it.
- **Online multiplayer.** Hotseat already covers playing with people in one room.
  This is a server, matchmaking and state sync, which is a bigger build than the
  game itself was.

Changes after this point are maintenance or things the owner asks for, not a
march toward a finish line that has already been crossed.

## What Convergence is

Convergence is a non-commercial browser card duel where 167 named characters and forces from fiction collide alongside ten Basic reference cards in one shared deck. It supports a hotseat duel on one screen or solo play against three opponent levels:

- **Recruit** — deliberately forgiving.
- **Veteran** — plays each move correctly but does not plan beyond it.
- **Ascendant** — searches a full turn, assumes you answer well, and cheats. See [The cheat ladder](#the-cheat-ladder).

[Play Convergence](https://ross-ai-lab.github.io/convergence-card-game/play/)

**Owner play location:** Play only through the public [GitHub Pages game URL](https://ross-ai-lab.github.io/convergence-card-game/play/). The local `play/` folder is a generated deployment artifact for building and publishing; it is not the owner's play location.

No account or installation is required. The public site records only an aggregate count of browsers that opened the game, not player names or visitor records. The roster is **172 character cards, 10 Basic reference cards, and 34 Ascension Relics**, 216 in all, and there is no deck-building screen. What a duel draws from is the **unlocked** slice of that roster: it opens on 50 cards and grows with every duel finished against the practice opponent — see [Gradual card unlocking](#gradual-card-unlocking). Each new duel generates fresh browser entropy, shuffles the unlocked pool once, and then draws from the top. The seeded order is stored in game state so Continue, undo, tests, and replays remain exact.

The live game and `source/data/cards.csv` now contain 172 named character cards plus 10 Basic reference cards, 182 card definitions in total; the lore guide is a reference document, and the live roster is the source of truth.

## What the game still needs

**The duel itself is finished and it is fun.** The owner has played it and enjoyed it. Treat "does a
turn feel good" as an answered question, not an open one, and do not put a human playtest back on any
list of remaining work. Older notes that describe the playtest as pending are stale; correct them
where you find them.

**Meta-progression exists now, in three forms.** A duel used to end and leave nothing behind, so the
tenth duel was indistinguishable from the first. Built 20 August 2026, extended 23 August 2026:

- **A record.** Duels played, won and lost per opponent level, plus the last ten results. Reached from
  the title screen, which only shows the door once a duel has finished.
- **A collection.** Every card is marked in the gallery by how far it has got: dimmed until it has
  been in your hand, plain once it has, a teal ring once you have played it, a gold ring once you have
  won a duel with it on the board.
- **Gradual unlocking**, described in its own section below.

All three live in `source/src/progress.ts`, under their own localStorage key with their own version.
**They are deliberately NOT part of the save**: a save holds one duel and is cleared at game over,
and a record has to survive exactly that. The React side is three lines calling `finishDuel`, because
the judgement — which ladder, what counts as a loss — is the part that goes quietly wrong, so it lives
in a pure function with tests rather than in a component.

**Two larger candidates were considered and are NOT being built.** They are recorded here so nobody
re-proposes them as gaps:

- **A ladder** (beat Recruit to open Veteran) — the record already answers "how am I doing", and
  locking away two thirds of the opponents on a game one person plays for fun costs more than it adds.
- **A run**, and the **draft mode** that pairs with it. Draft is not a feature here, it is a different
  game: this engine deals both players from ONE shared deck, and that is what makes Foresight and
  Clairvoyance mean anything — the card the Ascendant rejects is the card you were about to draw. Give
  each player their own deck and that whole layer is deleted. Do not propose it as an addition.

Gradual unlocking is neither of those two and does not reopen them. It locks no opponent and starts no
run: it narrows the ONE shared deck and widens it again, which is a change to a single argument.

## Rules at a glance

- Both cores begin at **75 health**. Reduce the opposing core to zero to win.
- Both players draw from the same shuffled deck and open with **3 cards**. Player One may replace any number of those cards once during the mulligan; Player Two keeps the opening hand. The second player also receives **The Coin**.
- Hero Powers are selected from the title-screen **Hero Powers** menu. Each bot win unlocks the next player power permanently, in the order shown in that menu. In a bot duel, the opponent receives one random power from all ten and needs no unlocks. A selected Hero Power costs **2 mana** and can be used once during its controller's turn.
- At the start of a turn, draw one card. Mana starts at **1**, refills each turn, and increases by one each turn up to **10**.
- Your hand holds at most **10 cards**. A card drawn into a full hand burns and is discarded.
- Play a hand card into one of **five board slots** by paying its cost. Effects that summon minions also need an open slot.
- A minion is asleep for the turn it enters play and normally waits until its owner's next turn before attacking. A **Chained** minion is unavailable for its first two owner turns and cannot be targeted by attacks or effects while chained.
- A minion can attack once per turn. A minion with **0 ATK** can still attack, but deals no damage.
- Combat is simultaneous: attacker and defender deal damage to each other, even when the attack kills the defender.
- **Taunt** must be dealt with before attacks can reach the opposing core, unless an effect or relic explicitly bypasses that defence.
- **Silence** strips printed text, keywords, and stat buffs at once. A minion pumped above its printed stats falls back to them; a minion pushed below them stays there. A silenced minion's **Divine Shield** blocks nothing while the silence holds.
- When the shared deck and its bottom-deck cards are empty, drawing causes escalating fatigue damage: 1, then 2, then 3, and so on.

Nothing damages a core automatically just because a turn starts; core damage comes from a minion attacking it or from an effect that explicitly says it damages a core.

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

- Each player starts with three cards. Player One may select any number to replace once; the second player also receives **The Coin**, which spends for +1 mana that turn.
- Choose an unlocked Hero Power from the title-screen menu before starting. Bot wins unlock the ten player powers in order; the selected power appears beside the Core and costs 2 mana once per turn. The bot receives one random power from all ten each duel.
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
- **Log** is the drawer on the left edge. It prints every event of the duel, newest first.

**A developer test duel COUNTS.** Owner's ruling, 2 September 2026, reversing the build before it. A
duel started from the developer tools used to be recorded nowhere and therefore paid nothing, which
made the one route into the game that starts with a chosen card also the only route that ended in
silence: no record line, and no pack. It now folds into the record and pays its cards like any other
duel. The tutorial is still exempt, because it is a scripted board rather than a duel and every
player would win it once for free.

The board communicates conditions visually: a wall means Taunt, a gold rim means Divine Shield, a blue-and-white rim means Invulnerable, ice means Frozen, chains across the artwork mean Chained, a grey attack gem means the minion cannot attack, and a sleeping minion shows drifting `z` glyphs.

## Cards and card language

**The last sentence of a printed effect carries NO full stop.** Owner's ruling, 26 August 2026. The
rules panel is a box of its own on the card face and its edge already ends the sentence, so a closing
period is a glyph that says nothing and costs a character of the auto-fit budget on the longest cards.
Internal sentences keep their periods — only the last one goes, across all 182 cards and all 34
relics.

It is a build failure, not a style note. `scripts/validate-cards.mjs` rejects any effect ending in
`.`, `,`, `;` or `:`, and `npm run publish:pages` runs that validator before it builds, so a card with
a trailing period cannot reach the public site. The rule it replaced REQUIRED that period; both exist
for the same reason, which is that 216 cards cannot be kept consistent by hand. A keyword-only card
now prints `Taunt` rather than `Taunt.`, and the validator's leading-keyword patterns were widened to
match.


Each card has a cost, ATK, HP, rarity, artwork, flavour text, a **camp**, and an **alignment**. The four camps are **Magic**, **Nature**, **Tech**, and **ALL**. An **ALL** card counts as EVERY camp, in both directions: it receives positive buffs aimed at any of the three
source camps, and it is a legal victim for anything that hunts one of them. Owner's ruling, 2 September 2026,
reversing the rule before it — ALL used to take every camp's buff while ducking every camp's answer, which made it
the one camp in the game with no counterplay. `campTargetedBy` in `game.ts` is the SELECTION half; camp IMMUNITY
still asks the attacker's exact camp, or an ALL attacker would bounce off all three immunity relics at once. The three alignments are **Good**, **Evil**, and **Neutral**. Many effects target a camp or alignment, so read both labels before playing a card.

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

- **Chained** — the minion loses **two** of its own turns. **Always two, and no card may print a different number beside the word** (owner ruling, 2 September 2026, and the same rule Reborn follows). Across both turns it cannot attack, its Passive and Ongoing effects do not fire, and it is untargetable by **both** players, including by a buff of its owner's. An effect that wants a one-turn lockout is a **Freeze**, not a chain — that is the line between the two keywords, and `CHAIN_TURNS` in `game.ts` is the only place the number lives.
  - **The counter is not the turn count.** `chained` is spent at the *start* of a turn, before attacks are offered, so a counter of 1 ticks to 0 and the minion swings that same turn. `applyChain` takes real turns and adds the +1 itself; do not write the counter by hand. This off-by-one is why Chained measured identical to Freeze for months, why four cards printed "Chained for 1 turn" and delivered Freeze, and why Queen's Cocoon's printed drawback cost its bearer **nothing at all**.
  - A card that **arrives** Chained is asleep on the turn it lands, and that turn is already one of the two, so `createMinion` sets a counter one lower than `applyChain` does. Both routes cost the player the same thing: two turns in which the minion does nothing.
- **Charge** — may attack on the same turn it is summoned or brought under a new player's control.
- **Taunt** — the enemy must deal with this minion before attacking your core.
- **Divine Shield** — blocks the next damage instance, then the gold shield disappears. It is a keyword, so **Silence** switches it off: a silenced bearer takes the blow in full. The shield is suspended rather than destroyed, so it returns if the silence does — Gojo's aura being the one silence that lifts. Fixed 1 September 2026; before that the card face hid the gold rim on a silenced minion while the engine went on spending the shield, so the board and the rules disagreed about the same card.
- **Freeze** — the minion loses **one** turn, then thaws after sitting out that turn. It keeps its Passive and stays targetable throughout; that, and the second turn, is everything **Chained** has over it.
- **Cannot Attack** — the minion never attacks, whatever its ATK. It still blocks, still takes damage, and still retaliates when attacked; its ATK gem is grey.
- **Reborn** — a **keyword**, not a Deathrattle. The minion returns to the slot it died in at **1 HP** with its printed ATK and nothing else it was carrying: no buffs, no relic, no shield. Silence stops it, a full board leaves it nowhere to go, and the Necronomicon does **not** double it. How many lives a card has is printed on it — plain `Reborn` is one, `Reborn twice` is two, `Reborn infinitely` never runs out — and a rebirth is SPENT, so the returning body prints what it has left and prints nothing once the last life is gone. The staged text lives in `REBORN_STAGE` in `game.ts`; a card with more lives is one more row.
- **Adapted** — Doomsday's answer to being hit: it shrugs off the attacker's Camp for three of its owner's turns. A purple glow rises from the card, and it goes out when the immunity does.
- **Stasis** — the minion is lifted off the board for two full turns and returns exactly as it left, in its own slot when that slot is free.
- **Banished** — the minion is held away until the card that banished it dies, then returns.
- **Pocket room** — one friendly and one enemy minion are shut away together for two turns; the higher ATK walks out and the other is discarded. Equal ATK releases both.
- **Silence** — removes the minion's printed effect and active keywords, and takes back every stat **buff** it is carrying, down to its printed ATK and HP. It moves in one direction only: a stat **nerf** is kept, because Silence is an answer, not a cleanse. Current HP is capped at the restored maximum rather than refilled, so silencing a damaged minion never heals it. A live aura stops paying a silenced minion its positive half while the silence lasts, and keeps applying its negative half. **Gojo is the one exception to the permanent half of the rule**: his Silence is an aura that lifts when he dies, his card says so, and a temporary silence must not take a minion's growth for good — so his aura cancels stat auras while it holds and leaves permanent buffs alone. Stats handed over by a **relic** count as a buff and are taken back too, while the relic itself stays equipped — which is what makes **Elder wand**, the Silence-immunity relic, worth its slot.
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

The current relic pool contains **34 relics**. Relics are equipment cards: they are shuffled into the shared deck, drawn into hand, and played onto a friendly minion with an open relic slot. Some character effects can also find or equip a relic directly.

**The relic roster target is about 15% of the full roster.** Count relics against
all minion cards and relics together. With the current 182 minion cards, the
first whole-number total that reaches or exceeds 15% is 33 relics in a 215-card
roster. The current pool has 34 relics in 216 cards, so it exceeds the target.
Thirty-two relics would be
14.95%, which rounds to 15.0% but remains just below the threshold.

**A relic card face prints NO side rails**, unlike every character card. It has no camp and no alignment: it carried the placeholders "Ascension" and "Relic" purely so the two rails had something to say, and two rails naming a thing that is not a property of the card is worse than no rails. The teal frame and the diamond gem already say relic.

**Every relic card prints bare `RELIC` in the flavour-text slot, without quotation marks.** Relics do not carry individual flavour text; `RELIC` is the fixed label for that exact card-face position.

**A relic card carries the teal shine** — a drifting aurora, rising motes, a breathing rim, and the one crossing light bar in the game, every 15 seconds. It is one of four tiers built on the same technique; see [The rarity shine](#the-rarity-shine).

- A minion can carry up to two relics. The first and second slots are independent;
  a full bearer cannot accept a third.
- A bearer cannot manually return an attached relic to its owner's hand. A relic
  dies with its bearer unless the relic's own text says otherwise.
- Effects that return a minion to hand discard its attached relics before the
  minion arrives. Relics never ride back as an accidental second card.
- During a duel, attached relic badges show who is carrying each relic. They are
  previews only; there is no separate relic-shelf screen.

## Gradual card unlocking

**The shared deck opens on 50 cards and grows by finishing duels.** Built 23 August 2026, in
`source/src/unlocks.ts`, with `source/src/unlocks.test.ts` covering every claim below.

| Result | Cards |
|---|---|
| Beat the Ascendant | +15 |
| Beat the Veteran | +10 |
| Beat the Recruit | +5 |
| Lose or draw, any level | +1 |
| Hotseat, any outcome | 0 |

Raised from 10 / 6 / 3 on 26 August 2026. Owner's ruling, and the table is the only place the numbers
live: `UNLOCK_REWARD` in `unlocks.ts` feeds the in-game "?" panel directly, so nothing has to be kept
in step by hand.

**Hotseat pays nothing on purpose.** Both seats are the same person and `progress.ts` records every
hotseat duel as won, so paying it would make conceding to yourself the fastest route to the roster.

**Why the reason for the feature is recurrence, not collecting.** A duel is a median 22 player-turns,
so it consumes roughly 30 of 216 cards and about 15 of them reach one player's hand. At the full
roster a given card reaches your hand about once every thirteen duels, which is far too rare to form
an opinion about it. At 50 it is about once every three.

**The count is an ORDER plus an INDEX, never a growing set of ids.** `progress.unlockOrder` holds all
216 ids and `progress.unlocked` says how far down it the deck reaches. An order is fixed once, so
every prefix of it can be balanced by construction; a set built batch by batch can only be balanced
batch by batch, and batches that are each fair still stack into a lopsided whole. An index also cannot
re-lock a card, cannot lose one, and cannot disagree with itself.

**The order is balanced on two axes, in two passes, and this is the part that matters.** A plain
shuffle would hand out a 50-card pool whose mana curve wanders by several cards per bucket, and a pool
holding four 10-cost cards and one 1-cost card is a pool you cannot open a turn with — the duel's
measured pacing rests on the printed curve. Minions and relics are spread by cost separately, then
interleaved by their share of the roster, both passes using the Sainte-Laguë divisor. Measured across
400 seeds and every pool size: the minion curve drifts at most **0.87 of a card**, the relic share at
most **0.5**, and the combined curve at most **1.34**. The single-pass version that treated relics as
an eleventh cost bucket drifted **3.99**, which is why it is not the version that shipped.

**The opening 50 holds every BASIC card and no Mythic at all.** Owner's ruling, laid over the balanced
order on 26 August 2026 by `applyOpeningRules` in `unlocks.ts`. Two rules, and each fixes a different
thing the plain balanced order got wrong.

The ten BASIC cards are the plain, no-franchise ones — Modern Tank, Fort, Battleship, Meteor and the
rest — and they are exactly one card at every mana cost from 1 to 10. They are the cleanest possible
spine for a first pool, and leaving them to chance meant half of them were missing from it.

No Mythic belongs there for the opposite reason. A Mythic is what a duel PAYS you, and a roster of 19
of them handed six over before the first duel had been played, which spends the best moment the
feature has. Each evicted Mythic is traded for a Rare, the tier the BASIC cards themselves sit in, so
the pool keeps its size and its shape.

**The evicted Mythics are SPREAD through the locked remainder, never parked at the front of it.** That
was the first build and it is the wrong shape: it hands those six cards straight back on the very
first win, which is the same mistake as starting with them, delayed by one duel. They are interleaved
with the same Sainte-Laguë divisor the roster order uses, so a Mythic arrives roughly every eighth
unlock and every prefix of the remainder holds them within about one card of their fair share. Stop
after any number of wins and the proportion still holds.

**This is a REORDER, not a re-generation, and it is applied to the opening slice only.** The balanced
order still decides which cards land where past card 50, and both lanes of the spread keep the
relative order the balanced pass gave them, so the mana curve underneath is undisturbed. It also
settles in one pass: run it twice and the second finds nothing to move.

**It is the one place a card can be taken back, and that is deliberate.** A record written before these
rules existed already had Mythics in its opening 50; loading it moves them out. `ensureUnlockOrder`
runs on every load, so the migration needs no version bump and no reset. Every other path still obeys
"a card that has been unlocked can never leave".

**50 cards does not deck anyone out — measured, not assumed.** 600 self-play duels at a 50-card shared
pool: the deck empties in **1.3%** of them, fatigue is dealt in **1.0%**, and the median duel runs 24
turns against 25 at the full roster. The arithmetic that said otherwise assumed the 54-turn outlier
was common; it is not. Anything below 50 has not been measured and must be before it is used.

**Restricting the deck restricts everything, with no per-effect work.** Every effect that fetches a
card — summon-from-deck, the relic grants, the Discover offers — reads `state.deck`, never the card
library, so cutting the deck cuts all of them at once. The library passed to the engine stays FULL on
purpose: a saved duel or a minion already in play can name a locked card, and every one of those has
to keep resolving.

**AN UNLOCKED CARD IS NEVER DIMMED, and the collection mark moved off the card face.** Owner's ruling,
26 August 2026, reversing the build before it. Unseen used to be the loud state: the whole face was
desaturated and darkened until the pointer touched it, so the wall answered "how much of this have I
actually met" from across the room. It answered it by hiding the artwork, which is the one thing a
gallery exists to show, and it left the art of a card you already own visible only while you were
hovering it. The mark now sits on the CELL, beside the played and won rings that were already there:
a card you have MET carries a pale ring and an unmet card carries nothing. Same fact, read the other
way round — the wall fills with rings as the collection grows, rather than clearing of shadow.

**Locked cards are SEALED, not merely marked, and the padlock is meant to be in the way.** The gallery
greys them and covers the middle of the face with a padlock at **68% of the card width**, so a locked
card shows its name, its frame colour and a shape behind the glass, and nothing that tells you what it
does. It was twice shrunk so the rules text underneath stayed readable, and that was the wrong goal
both times: a locked card the player can read is a card already spent, and what arrives in a pack
should still be news. Owner's ruling. Keep it large.

The padlock is drawn rather than fetched because it is furniture — an icon, in the same family as the
keyword artwork, not a photograph. **The SILHOUETTE is what makes it look antique**, and the first
version got that wrong: a rounded rectangle with a band and four rivets reads as a padlock ICON, the
kind a browser puts in an address bar, and no amount of extra rivets rescues it. What says "old" is
the outline — broad flared horns at the four corners, sides that pinch inward between them, a wide
foot with only a slight dip — and scrollwork inside it.

Two things learned drawing it. **The foot must be BROAD**: a long central spike made it a shield or a
pendant, and a real padlock is wide at the bottom because it has to hold a mechanism. And **the
scrollwork must stay out of the middle**: two curls level with the keyhole plus a curve beneath it
read as eyes and a mouth, which is the one thing an ornate lock must not do. They sit in the
shoulders and the haunches instead, following the body's edge. Every dark mark is a hole, a groove or
a shadow, so the whole thing still works as one flat colour over any artwork.

**The Collection filter has NO "any" option and starts on Unlocked.** It is the only filter that
behaves that way. The gallery is your collection first and the locked wall second, so mixing 50
readable cards into the locked remainder is a list that answers neither question. The deliberate
cost is that no view shows all 216 at once.

**The "?" opens a POPUP, and it prints the reward table and nothing else.** A panel pushed in above
the grid shoved 200 cards down the page to make room, so opening it lost the reader's place in the
list and closing it lost the place again. Everything it used to print around the table — a paragraph
of preamble, the reason hotseat pays nothing, a paragraph on how batches are balanced — was true and
unread: the table already answers the only question anyone opens it to ask.

**The pack.** A duel that earns cards ends on a sealed pack that takes FIVE strikes to open, then
holds for a second and bursts, dealing the cards out one at a time.

Raised from three on 3 September 2026, owner's ruling, and the change is the SHAPE rather than the
number. Three hits had a middle; five has a climb, and each hit now cuts its own line into the box, so
the damage is countable instead of merely louder. `PACK_CRACKS` in `App.tsx` describes the five lines
in one place — angle and length each — and a crack element mounts on the click that makes it, so its
cut animation runs once rather than fading up. The shake and the glow read a `--hit` custom property
instead of having a hand-written state each, and the button is keyed on the count so the shake
restarts every time.

**The fifth hit does not open it.** The box holds for `PACK_BURST_DELAY_MS` — one second — fully
cracked, white-hot and straining, and then goes. That pause is what the count exists for: the player
lands the last hit and then watches it fail, which is a different event from a box that opens the
moment it has been clicked enough times. `opened` is its own state rather than `hits >= PACK_HITS`
for exactly this reason, so the fireworks, the deal and the Collect button did not have to learn
about the pause.

**`Open 5/10/15-card pack` in the developer tools reaches this screen directly.** It draws random
cards from the whole roster and does NOT touch the record: nothing is unlocked, and the log says so.
Every part of the screen above — five hits, the held beat, the burst, the stagger, the reveal order,
the row balancing — was otherwise reachable only by finishing a duel and winning enough to earn that
many cards, which made the fifteen-card layout close to untestable. The buttons sit outside the
in-duel block, because the pack screen is not part of a duel. It deals in `revealOrder`, best LAST, so the prize of the
batch lands on the moment the player is watching rather than in the middle of the row. Rarity decides
and cost breaks the tie, and **relics outrank every character tier, Mythic included** — owner's call,
with scarcity behind it (34 relics against 19 Mythics) and the fact that a relic changes what another
card does rather than adding a body. The ordering is cosmetic and runs after the contents are settled,
so it cannot bias the reward; a test pins that. Pack cards are **206px minimum and never
lazy-loaded** — see the 200px floor under [Interface and card faces](#interface-and-card-faces), and
note that a card dealing itself onto the table as an empty black frame is the reward arriving broken.
Rows are balanced by an explicit width rather than left to wrap, because six cards wrapping naturally
strand one under a row of five.

**THE PACK NEVER SCROLLS. Every card in it is on screen at once.** Owner's ruling, 3 September 2026.
It used to scroll at fifteen, which put a third of the reward below a fold that nothing on the screen
mentioned — and the one screen a player is certain to look at is the one that just paid them.

The way it fits is a **CSS transform on the whole reveal, never a smaller card**. `.card-face` is
`container-type: size` and silently drops its rules text below roughly 200px, so shrinking the cards
to fit would hand over fifteen cards that no longer say what they do — the failure that is worse than
scrolling, and the harder one to notice, because the screen still looks right. A transform changes
what is PAINTED and not what is MEASURED: every card goes on laying itself out at 206px, the
container query never sees the difference, and only the pixels get smaller.

`packLayout` in `App.tsx` does the sums, and it is the one place the grid is decided. It tries every
balanced split from `PACK_MAX_PER_ROW` upward and keeps the shape that needs the least shrinking,
which is why fifteen cards land on three rows of five rather than two rows of eight — the flat shape
is wider than any laptop and would scale everything down to fit a row nobody asked for. Ties go to
the fewest rows. The height it measures against is READ off the laid-out wrapper (`.pack-scroll` is
the stage's one flexible child, so what the kicker, the total and the Collect button leave over is
exactly its height) rather than estimated from a constant; `PACK_STAGE_RESERVE` is the first-frame
fallback only. Measured: fifteen cards render at 0.81 scale in a 1440 × 900 window and at 0.53 in
1024 × 640, with the rules text on every card and the Collect button in place at both.

**The tally rides inside the Cards button** on the title screen, stacked under its label, and
disappears once the roster is complete rather than reading 216 of 216 forever. It lived outside the
button first and had to be nearly invisible there, because between two gold pills it read as a third
one; inside a button it cannot be mistaken for a control, so it can afford to be legible.

**A free pack every day, worth 5 cards.** Built 2 September 2026. `lastDailyPack` on the record
holds the last local calendar day whose pack was taken; `dailyPackAvailable` and `claimDailyPack` in
`progress.ts` are pure and tested, and the title screen shows a gold **Today's pack** button while one
is owed.

- **A DAY STRING, never a timestamp.** A timestamp would make "a new day" mean "24 hours since last
  time", which punishes a player for opening the game an hour earlier than yesterday and slides the
  reward later every day until it lands in the night. `todayKey` builds it from local date fields
  rather than `toISOString`, which converts to UTC first and rolls the day over at the wrong moment
  for everyone not on it — an evening in Baku is already tomorrow in that string.
- **Five cards, which is deliberately the Recruit win and no more.** The pack is paid for by opening
  the game, not by playing it, so it must never be the fastest route to the roster: beating the
  Ascendant is still worth three of them.
- **A COMPLETE ROSTER also hides it, and that is the other reason it can be missing.**
  `dailyPackAvailable` returns false when `unlocked` has reached the end of `unlockOrder`, because a
  pack with nothing to give is a ceremony around an empty box. The tell is the Cards button on the
  same screen: its `50 / 216` tally disappears at the same moment and for the same reason. Reset
  progress from the developer panel to see either of them again.
- **The button DISAPPEARS once taken, rather than greying out.** A dead control saying "come back
  tomorrow" would be permanent furniture advertising something the player cannot have, for 23 hours
  out of every 24. Its absence is the reward already collected.
- **It opens the ordinary pack screen.** A second reward ceremony would be a second thing to keep in
  step with `revealOrder`, and it would make the daily cards feel like a different currency from the
  ones a duel pays. They are the same cards off the same order.
- **The guard is the identity check, not the button.** `claimDailyPack` returns the record unchanged
  when nothing is owed, and the caller does nothing when it gets the same object back — so a double
  click, a stale render, or a tab left open past midnight cannot pay twice.

**The gallery's Unlocked view puts newly earned cards FIRST, newest first.** A pack deals five cards
and then hands the player a list of two hundred sorted by mana, which is the one order that
guarantees those five are scattered and none of them is on the first screen. The unlock order already
records when each card arrived, so recency costs one lookup. **The opening 50 are exempt and keep
mana order**: they were never earned, so ranking them by their position in a shuffled order would be
sorting by nothing, and it would leave a brand-new player looking at a list with no shape. The
gallery therefore reads normally until the first pack lands.

**`progress` is at v2 and v1 is deleted on load, not migrated.** v1 described a roster that was
entirely unlocked, so carrying it forward would hand a returning player all 205 cards and delete the
feature on the machine that most needed it. The version bump is also what resets the record.

## Project structure and source of truth

- `source/data/cards.csv` is the live card roster: names, stats, costs, effect text, timing, keywords, art paths, and flavour.
- `source/data/relics.csv` is the relic authority.
- `source/src/engine/` is the authority for game behaviour. React and CSS files under `source/src/` are the interface authority.
- `source/src/engine/types.ts` holds every card vocabulary ONCE, as a `const` array — `EFFECT_IDS`, `RELIC_IDS`, `KEYWORDS`, `RARITY_TIERS`, `CAMPS`, `ALIGNMENTS`, `EFFECT_TIMINGS` — and derives the TypeScript type from it. `csv.ts` builds its validation sets from the same arrays; the plain-Node scripts read them through `engineVocabulary()` in `scripts/card-tools.mjs`, which parses them straight out of `types.ts` rather than listing them a third time. Add a value in one place only. The lists were kept by hand for a long time, and only one copy was checked by the compiler, so an effect added to the type and forgotten in the validator would pass every test and then reject the first real card that used it.
- **`RARITY_TIERS` is the tier table, commonest first, with the name a player sees.** The order of the array IS the ranking. Seven separate lists used to encode some part of it — which tier speaks on arrival, which get a shine, how the gallery sorts them, what the pack saves for last, which tier the opening pool evicts, and what the public codex page calls each one — and each carried its own idea of the order, which is how Legendary once sorted above Epic. Read `rarityRank`, `rarityName`, `BASELINE_RARITY` and `TOP_RARITY` instead of writing a colour down.
- **`scripts/` is inside `tsconfig.json`.** It was outside it until 1 September 2026, so the balance harness, the gate and the ladder comparison were TypeScript that nothing typechecked — `tsc -b` covered `src` alone. Turning it on found one real defect immediately: the ladder's matchup array was declared without the per-duel `results` field it has been pushing, and reading, all along.
- **`strict` is on in `tsconfig.json`.** It was off until 1 September 2026 while the code was already written as though it were on, so every `| null`, every `??` and every non-null assertion in the engine was unchecked decoration. Turning it on produced zero errors, which is the measure of how carefully the null-handling had been done by hand; it is now the compiler's job to keep it that way.
- `source/src/textfit.ts` controls measured card-text fitting. The current effect-text upper cap is 64 design units; flavour text is capped at 32, but the real rendered size is chosen by measurement.
- `play/` is the generated static game copied into the repository for GitHub Pages. Build it from `source/`; do not hand-edit it. The owner plays only through the public `/play/` URL above, never from this local folder.
- `docs/Convergence Browser Game Roadmap.html` is useful for design direction and browsing, but its embedded roster can lag behind the live CSV.
- `materials/local-production/` contains optional rebuild tools and source libraries. It is not required to play the included build.
- `counter/` is the small aggregate player-count service used by the public landing page.
- `source/src/progress.ts` is everything that outlives a duel: the record, the collection marks, and the unlock index. `source/src/unlocks.ts` decides WHICH cards the unlock index points at — see [Gradual card unlocking](#gradual-card-unlocking). Both are pure and both are tested; neither reads a CSV.
- `source/src/screens/Screens.tsx` holds the **How to play** guide as `HowToPlayContent`. It is the player-facing twin of [Rules at a glance](#rules-at-a-glance) and [Conditions and keywords](#conditions-and-keywords) above: a rules change has to land in both, and the guide is the copy a player will actually read. Its glossary is NOT written there — it is rendered from `source/src/keywords.ts`, which is also what the card face's keyword tooltips read.
- `source/src/keywords.ts` is the single copy of every keyword definition, plus the longest-first match table the card face scans rules text with. Two surfaces render it; neither owns it.
- `source/scripts/readme-index.mjs` owns this page's section ORDER and regenerates its navigation block. The order lives in that file and nowhere else, and a `##` section missing from it is an error rather than a silent append. `node scripts/readme-index.mjs --check` fails when the page is stale.
- `source/scripts/dump-log.ts` plays one self-play duel and prints every line the duel log would show. See [The duel log](#the-duel-log).
- `.claude/launch.json` is the agent-facing dev-server entry, so a session opens the game with one call instead of inventing a shell command for it.
- `source/scripts/` holds the tooling. `simulate.ts` is the balance harness: self-play, fuzzing, the dial sweep, and the difficulty ladder. `balance-gate.ts` and `balance-gate.test.ts` hold the pure pass, fail, and skip logic, with one planted failure per check. `ladder-compare.ts` is the paired ladder comparison. `source/balance.config.json` carries every threshold with the reasoning for it written alongside. The `apply-balance-pass*.mjs` files record each past pass with the measured number behind every change.

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

**Address the dev server as `http://localhost:5177`, never `http://127.0.0.1:5177`.** `vite.config.ts` sets no `server.host`, so the server binds to `localhost` and on a machine where that resolves to `::1` a request to the IPv4 literal is refused outright. Every browser harness here takes the URL as its first argument and defaults to `localhost`; `shoot-rules.mjs` defaulted to the IPv4 literal instead and failed with `ERR_CONNECTION_REFUSED` against a perfectly healthy server, which reads as a broken script rather than a wrong address.

**Keep the suite fast, and treat any test over about ten seconds as a defect to be explained.** `npm test` is the thing a session runs after every change, so its cost is paid dozens of times a day, and it has twice grown a two-minute test that was really a balance measurement in disguise. The rule that catches both: a test may play a whole duel only when the thing it asserts is a property OF a whole duel — that the game terminates, that no illegal action is ever produced, that the bot never stalls on its own prompt. Anything else — who wins, how often, whether a flag is wired — is either a balance question, which belongs in the harness, or a state question, which should read the state.

Measured 2026-08-22, before and after that pass: **452 seconds down to 123.8**, same 391 tests. What remains is dominated by two Ascendant probes that genuinely do have to run a duel to the end — the legality check at 25.5s and the targeting-prompt check at 42s. Everything else in the project, all 386 other tests, is about 55 seconds together.

**After editing this README, run `node scripts/readme-index.mjs`.** It re-sorts the page into its
fixed section order and regenerates the navigation block at the top, whose byte count and heading list
both go stale on every edit — and a banner quoting a stale size is worse than no banner, because it
tells a session the truncation will not happen to them.

Run the relevant checks before calling a code change finished. Useful focused checks include `npm run check:ui`, `npm run check:audio`, `npm run check:cardface`, `npm run shoot`, `npm run sim`, and `npm run check:balance`. Browser checks need the local server running where their help text says so.

### Which checks a change actually needs

**Never run the balance harness unless the owner asked for it in that message.** See
[NEVER run a balance patch without being asked](#never-run-a-balance-patch-without-being-asked-every-single-time).

**`npm test` is not optional, however small the change looks.** It costs about
seventy seconds, and "small" is exactly the change it catches: a two-line card
edit broke seven tests in one pass, and a one-word retiming broke six in
another. Every one of those edits looked too small to be worth a run. The suite
is the cheapest thing in this project that can tell you that you were wrong, and
skipping it moves the discovery to the published site.

**The BROWSER checks are the ones to skip, and skipping them is a judgement
about reach, not about size.** `check:ui`, `check:audio`, `check:cardface`,
`shoot` and the shoot scripts each need a dev server and take minutes. Match
them to what the change can reach:

| What changed | What to run |
|---|---|
| Engine rules, the bot, the save, scripts | `npm test` and `npm run validate:data` |
| A card's stats, text or keywords | those, plus `npm run check:cardface` — text length drives the auto-fit |
| Anything drawn on screen: layout, CSS, a component, a new prompt | those, plus `npm run check:ui` |
| Sound, a card theme, a herald line | plus `npm run check:audio` |
| Anything at all, before publishing | `npm run publish:pages`, which validates and rebuilds |

**The balance harness is a separate decision.** `npm run sim` and
`npm run check:balance` measure win rates, not correctness, so they answer a
question about the roster rather than about the code. Run the fuzz sweep
(`npx tsx scripts/simulate.ts --mode fuzz --games 300`) after any change to
combat, targeting or the effect queue: it drives about twenty thousand random
legal moves with every invariant armed and takes half a minute.

After changing the **How to play** guide, run `node scripts/shoot-rules.mjs http://localhost:5177` against a running dev server. It starts a duel, answers the Hero Power offer, opens the guide, and walks the panel down in overlapping screen-height steps into `.preview/rules/`, plus one full-height capture. That step exists because the guide is roughly 2,500 pixels of content inside a 600-pixel window: a single screenshot photographs the first quarter of it and proves nothing about the rest, and no other harness opens the panel at all.

To look at the card pack or the gallery's locked state, run `node scripts/shoot-pack.mjs http://localhost:5177 hard` with the dev server up. It clears the browser's stored progress so the pool really is the starting 50, photographs the gallery locked, the "?" panel and both Collection filters, then ends a duel on purpose through the dev `setCore` hook and walks the pack open one strike at a time. It strikes until the box GIVES WAY rather than a fixed number of times: it clicked three, the pack has needed five since the strike animation was rebuilt, and the script sat photographing a sealed box and then timed out waiting for a Collect button that could not appear. The last argument picks the opponent and therefore the pack size, straight off `UNLOCK_REWARD`: `easy` for five cards, `normal` for ten, `hard` for fifteen — always shoot `hard` after any layout change, because fifteen is the size that has to wrap onto three rows and be scaled down to fit one screen. It is also the size that caught this: the reveal was built when the top reward was ten, and at fifteen it overflowed the veil and carried the Collect button off the bottom of the screen, leaving a won duel with no way to dismiss its own reward. If the reward table changes again, re-shoot the largest one. `setCore` does not end the duel by itself; the engine's own win check does, so the record, the reward and the pack all run the path a real duel takes.

To look at a specific card after changing its text, stats or art, run `node scripts/shoot-card.mjs "Kaku Kaioh"` with any number of card names or ids. **Relics work here too** — they did not until 23 August 2026, because the script read `cards.csv` alone and answered "matches no card" for a fifth of the printed roster. They also cannot be placed, since `__debug.place` refuses a non-minion, so a relic is dealt into the hand and cloned from there instead. It starts and stops its own dev server, deals itself each card through the `window.__debug` hook, and writes a full-frame PNG per card into `.preview/cards/`. Call it with `node` rather than `npm run` whenever a name contains a space, because npm on Windows strips the quotes; the `npm run shoot:card` alias is for the no-argument whole-roster run. The capture proves content — name, cost, rules text, stats, rails, origin, art — and deliberately not layout at play size, since the face is enlarged to fill the frame and `.card-face` is `container-type: size`. It photographs the board variant, which prints no flavour line. Gem and text collisions at real hand and board sizes stay the job of `npm run check:cardface`.

### README-only documentation policy

This file is the single maintained project guide and knowledge-base page. Do not create another Markdown file anywhere in the Convergence project; add or revise the appropriate section here instead. `npm run validate:docs` enforces that rule, and the normal data-validation, test, build, and full-balance entry points run it automatically. The two README files inside ignored, locally downloaded production packages are frozen third-party-style package notes, not new project documentation; do not add more beside them.

### What “publish” means

In this project, **publish** always means make the current game change live at the public play URL: <https://ross-ai-lab.github.io/convergence-card-game/play/>. A source edit, local build, generated `play/` folder, or `just vault-publish` workspace checkpoint does **not** count as published. The change is published only after the public Pages deployment finishes and the live URL is verified to serve the new build.

For a deployable update, run `npm run publish:pages` from `source/`. That command validates the data, builds with `--base=./`, replaces the generated `source/dist/` contents in `play/`, and fails unless every published file exactly matches the generated build. After it succeeds, publish the generated copy to the public GitHub repository. GitHub Pages serves `play/` from the repository's published static site.

## Parallel work

Multiple threads usually work on Convergence at the same time. Files, generated artifacts, tests, and documentation may shift while you are working; that is expected. Preserve changes you did not create, do not revert them, and do not stop the other threads. Re-read the current file before making an overlapping edit. A small compile or test repair is fine when necessary, but keep it behavior-neutral unless the thread that owns the change explicitly asks for a behavior change.

## Changing cards and effects

For stats, wording, keywords, timing, or art paths, update the relevant `cards.csv` row, validate the data, run focused tests, and rebuild the playable copy when needed.

### Every save that changes a card must name the cards it changed

**A card change committed under a description about something else is invisible, and this has already cost a full investigation.** Shibukawa's effect was changed from `silence_enemy` to `set_attack_highest_enemy` and back again; the restoring commit was described only as "Implement mulligan and hero power progression", and the same commit quietly renamed `c169` and retimed Nezu. None of it was mentioned. Ten days later the only way to answer "why did my card change?" was to walk every version of `cards.csv` by hand and diff one row across five months.

Nothing was lost and nothing was reverted maliciously. That is the point: the record did not hide the change, it simply never said it happened, and to the owner that is indistinguishable from a card rewriting itself. He plays the published site and cannot see a diff, so the description is the only account of a change he will ever have.

The rule: **every commit that touches `cards.csv` or `relics.csv` names each affected card in its message.** One line per card is enough. Write what changed, and where a reason exists, write the reason too, because the data already records what changed and only the message can record why.

This is enforced rather than trusted. `.githooks/commit-msg` rejects a commit whose message does not mention every changed card, and prints the lines to paste. Enable it once per clone:

```
git config core.hooksPath .githooks
```

The hook fails open when Node is unavailable, so a machine without the toolchain is never blocked. To see the summary at any time without committing:

```
npm run changed-cards
```

### Ask what happened to a card instead of reconstructing it

`just card-history "Shibukawa"` from the workspace root, or `npm run card-history -- "Shibukawa"` from `source/`, prints every change that card has ever had, dated, with the description each one rode in and the card's state right now. It accepts an id (`c174`), the current name, or any name the card used to have, so a renamed card is still findable under its old name.

`just card-history --flips` lists every card whose **effect id** was changed and later changed back. That A to B to A shape is what a lost change looks like in data, where a plain A to B is an ordinary edit. It reports on the effect id alone by design: widening it to stats and wording was measured and returned 26 and 17 hits respectively, nearly all of it balance tuning and punctuation, which buried the two genuine cases. Add `all` to widen it anyway.

Reach for both of these before investigating by hand, and before telling the owner anything about whether a change survived.

### Reference requests must be globally safe and future-proof

**Never use a display name, partial name, screenshot label, or artwork filename as an edit scope.** Those are search clues, not identities. The failure mode is fuzzy matching: a request for one card or token can silently change another card whose name or artwork partly matches it.

For every reference-based request, first resolve the exact runtime identity: a stable card id for a card, a token constructor or effect id for a summoned token, and the exact asset path. Search all matching names and paths before editing. If more than one entity matches, stop and resolve the ambiguity. Apply the change only to the explicitly identified entity. Never use a global replace, substring match, or shared display name to rename cards, replace artwork, or change effects.

Keep cards and generated tokens separate even when they share a name. Photo 3 is an example: the **Heroic Recruit** from the 2-mana `summon_recruit` Hero Power is a token request. It does not authorize changes to **An Order of Heavy Knights**, a roster card, or to any future card with a similar name. The same rule applies to every future screenshot, photo, label, and asset request.

Before reporting completion, state the exact entities changed and the similar entities deliberately left untouched. Prefer general ambiguity guards and collision-class checks over a one-card exception test, so the protection covers future dragons, knights, tokens, and every other partial-name collision.

### Card wording is uniform, and that is a mechanical requirement

Printed effect text uses one vocabulary across the whole roster. This is not a style preference. Two cards that do the same thing in different words read as two different cards, and that is how duplicated rules can survive under separate effect ids without anyone noticing, or how Whitebeard's sweep can end up on Fire Lord Ozai three mana cheaper. The duplicate report in `validate-cards.mjs` compares normalised printed text precisely so that a rule written twice becomes visible, and wording drift is the one thing that blinds it.

The rules:

- **`damage`, never `DMG`.** One word for the concept.
- **`Destroy` is the action; `kills` only appears in a trigger** describing combat that already happened, as in "whenever this minion kills a minion". Never `Kill a minion` as an instruction.
- **Digits for counts a player must evaluate** (`Deal 3 damage`, `2 or more Evil minions`, `Chained for 1 turn`). Where the word is really an article, write `a` or `an` (`Silence an enemy minion`), not `one`.
- **No shouting.** `all other minions`, not `ALL other minions`.
- **Every effect ends as a sentence**, with a full stop.
- **Effect ids spell magnitudes as digits and must match the printed number.** `validate-cards.mjs` fails the build when a digit in the id is missing from the text, so renaming the id is part of changing a magnitude, not an afterthought.

Two more rules about the detector itself. **Report a duplicate as a warning, never as a build failure**: two cards legitimately sharing a mechanic is a design judgement, and a gate that cannot tell "borrowed as filler" from "genuinely describes both subjects" will simply get muted. And **near-duplicate scoring by word overlap is worth running once by hand and not automating**, because it flags "freeze all enemies" against "freeze an enemy" as identical, and that difference is the whole card.

**Two cards with the same effect keep two separate code branches.** Collapsing duplicate branches into one shared effect looks like tidying and is not: it welds the two cards together, so the next balance pass aimed at one silently retunes the other, and their measured histories stop being separable. Keep the branches apart and name each one after its card.

### Every game change must be published to the public site in the same session

**Every change to the game must be published to the public play URL before it can be reported as done.** This includes changes to cards, balance, engine rules, interface, animations, audio, assets, or any other runtime behaviour. A source edit or a local build is not a finished change because the owner plays only the public site.

For every game change, run `npm run publish:pages` from `source/`, then commit and push the generated `play/` copy to the public GitHub repository. Wait for the Pages deployment to finish, then verify that <https://ross-ai-lab.github.io/convergence-card-game/play/> serves the new bundle. This publication step is mandatory for every game change and must happen in the same session without waiting for a separate request. `just vault-publish` is only a workspace checkpoint; it never replaces this public deployment.

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

**Five cards changed shape on 2 September 2026 in ways the engine has to keep
straight.** The CSV is the source of truth for what each one prints; these are
the mechanics behind them.

- **All for One is a PASSIVE now** — it wears every enemy minion's printed Passive
  or Ongoing at once, rebuilt from scratch on every aura recompute by
  `copyEnemyPassives`. It lives in `gainedEffects` because `hasEffect` already
  reads that, so every passive in the game answers for the wearer without knowing
  this card exists. It never copies its own id, and it copies the PRINTED effect,
  so a power already on loan cannot be borrowed twice. The whole array is
  replaced each recompute, so a card that grants All for One an effect by some
  other route would lose it — nothing in the roster does that today.
- **`copy_and_trigger` is GONE**, deleted on 2 September 2026 with the card that
  printed it. The effect, its targeting spec, `copiedVictimIsLegalTarget`,
  `restoreCopiedEffect` and `MinionInstance.copyRestoreEffectId` all went with it,
  along with the six tests that existed only to guard that one handoff. It was
  the only place in the engine where a target choice was BUILT BY HAND instead of
  offered through a prompt, and that hand-built choice was the upstream cause of
  the worst invariant breach this project has had — see the pocket-room entry
  under [The measured baseline](#the-measured-baseline-and-what-it-still-says),
  which is history now rather than live machinery.
  `printedEffectId` survives as a plain read of `effectId`: it is the one name
  every "read another minion's power" site calls, so if a card ever wears a
  temporary effect again there is exactly one place to teach about it.
- **The death reactions read `hasEffect`, not `effectId`.** Xenomorph Queen's
  brood, Gravelord Nito and John Wick all watch for deaths, and all three are
  Passives — which in this game can be WORN as well as printed, by Meruem copying
  a killed minion's persistent effects or by All for One wearing the enemy
  board's. Comparing `effectId` meant a copied John Wick sat there doing nothing,
  which is the one outcome a copy effect must never produce.
- **Deep Sea King is a cost reduction, not a board effect.** `effectiveCardCost`
  is the only place it applies, and it reads BOTH boards, because a discount only
  your own Freeze could unlock would make the card a two-card combo rather than
  an opportunist.
- **Superman covers the friendly Good board.** `supermanCovers` reads the
  TARGET's own board, so a Superman on the other side does nothing for the minion
  being hit.
- **One-Eyed Owl is fed by a DIFF, not a hook.** It watches Chained, Frozen and
  Silenced, and those three arrive from a dozen places, several of which have no
  events array to report into. `afflictionSnapshot` is taken at the top of
  `applyAction` and `feedAfflictionWatchers` compares it after the auras settle,
  which catches every route including ones that do not exist yet. A minion that
  ARRIVES afflicted pays nothing — it was not there before, so it never became
  anything, which is what stops a printed-Chained card feeding the Owl on every
  summon.
- **Thanos, The 7 Heroic Spirits and Kojiro Sasaki all changed who they include.**
  Thanos and the Spirits now exclude themselves; Kojiro now includes himself. Each
  is one predicate, and each was reported as reading wrong on the board rather
  than as a rules question.


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
  bearer, and never manually returned by the bearer. Returning a minion to hand
  discards its attached relics; only a relic's own printed text can override that.
- The bot evaluates legal actions on a throwaway state. A new effect usually needs no separate bot branch, but bot valuation changes affect balance measurements and need a fresh balance run.
- **One counter, one window.** A timed state has to open and close the same door
  for every rule that reads it. The chain counter is decremented at the start of
  its owner's turn, so the turn it reaches zero the minion may attack and may be
  targeted — and its Ongoing effect now fires on that turn too. It used to be
  held back for one turn more than the attack was, which quietly charged a
  one-turn chain two payments.
- **A timed state is CLEARED when it expires, not merely ignored.** Every rule
  that reads one already compares against `turnNumber`, so leaving an expired
  value in place changes nothing about how a duel plays — and everything about
  what the board says, because the card face reads the same field. Doomsday's
  `campImmunity` was never cleared, so a minion that adapted on turn 4 wore the
  adapted ring for the rest of the duel while taking that Camp's damage
  normally. `expireTimedStates` runs after every action.
- **All core damage goes through `dealCoreDamage`.** It is the only thing that
  knows about Aladdin's core Divine Shield. Doctor Strange's bargain used to
  subtract from `health` directly and was the one path in the game that walked
  past a shield the player had paid a card for.
- **`hasRelic` takes a `RelicId`, never a string.** Six checks against relic ids
  that no relic carries had accumulated behind the loose signature, each with a
  comment describing behaviour the game did not have; one of them named the
  wrong relic entirely. Typing the parameter makes that a compile error.

The engine’s central contract is `applyAction(state, action, library) -> { state, events, legalActions }`. An action outside the legal-action list is rejected without changing the state. Targeting pauses the game in a target-selection state so human and bot choices follow the same route and survive saving, cloning, and undo.

## Interface and card faces

**What keeps a gallery of 216 card faces scrollable, and the measurements behind each part.** Every
cell is a full card face: about 23 elements, its own size container, gradients, rails, gems and six
text measurements. Measured on the locked gallery at 148 cells, laying all of them out costs
**219 ms** against **4.5 ms** when they are skipped — roughly **1.4 ms per cell**, which is why three
rows arriving inside one frame is felt as a stutter. Four things hold it together and they are not
interchangeable.

1. **`content-visibility: auto` on `.gallery-cell`** skips layout and paint for off-screen cells. The
   cell keeps its box because `aspect-ratio` sits on the CELL and is not contained away with its
   contents, so nothing jumps and the scrollbar is honest from the first frame.
2. **`contain-intrinsic-size: auto 264px auto 370px`** on the same rule. The `auto` keywords are the
   point, not the lengths: without an intrinsic size a cell that leaves the viewport throws its layout
   away and rebuilds it from nothing on the way back, and with `auto` the browser reuses the size it
   last measured. The lengths themselves never apply, because `aspect-ratio` wins — measured before
   and after, neither the scroll height nor the row height moves by a pixel.
3. **The card shine pauses while the body is scrolling.** A card face carries up to six blended,
   infinitely animating layers; measured in the unlocked gallery that is **112 animating spans**, all
   of them compositing on every frame the browser draws. `.gallery-body` gets an `is-scrolling` class
   from a passive scroll listener that writes to `classList` rather than to state — re-rendering the full roster
   memoised cells to say "we are moving" would cost more than the animations it is quietening — and
   the CSS sets `animation-play-state: paused`. Paused, not hidden: every layer freezes where it was,
   so a still gallery is pixel-identical to what it was before this rule existed.
4. **Card art warms on idle once the screen has finished appearing.** The cells load their art lazily,
   which is right for the first paint and wrong for the twentieth: the browser's lazy heuristics look
   only a short way ahead and a fast flick outruns them, which is what leaves a screenful of cards
   showing a frame and no picture. After the last cell mounts, the gallery pulls the whole set six at
   a time on idle callbacks, so it never competes with a scroll and costs
   the opening nothing.

5. **A locked card draws a SEALED FACE, not a full one.** `SealedFace` in `App.tsx` renders the four
   things a sealed card is supposed to show — frame colour, name, mana cost, and a shape behind the
   glass — and nothing else. No rules panel, no flavour, no origin, no rails, no stat gems, no shine.
   That is the printed doctrine for a locked card rather than a saving invented to fit one, and the
   saving arrives with it. Measured in one browser, in one sitting, against the full face beside it:
   **8 elements against 18**, and **0.97 ms of layout per cell against 2.23 ms** — a locked card now
   costs **56% less** to lay out than an unlocked one. At 148 locked cards that is the difference
   between about 330 ms and about 144 ms for the whole grid.

   Its artwork runs the full height of the face, because the 490 units below the printed art window
   belong to the plaque, the flavour line and the gems, and a sealed card draws none of them. Left as
   it was, a locked card was a picture in the top half and a flat dark slab in the bottom half, which
   reads as a card that failed to load rather than a card that is sealed.

Only the first two are about layout. Items three and four are about paint and decode, and neither was
measured against a frame budget: the browser tab available to this project's agents stays backgrounded,
where `requestAnimationFrame` never fires. The element counts, the byte totals and the layout timings
above are all measured; the frame-rate improvement is reasoned from them.


Cards are DOM-rendered by `CardFace` and CSS, using a 750 × 1050 design coordinate system. Keep full card faces readable in hand and on the board. Text fitting must use `source/src/textfit.ts`, which measures the real fonts and finds the largest size that fits the box; the 64/32 caps are upper bounds, not a substitute for measurement.

Choice prompts that offer cards or Ascension Relics must show the complete readable card face, including its rules text, cost, and stats where applicable. Names and artwork alone are never enough to make a choice.

**`CardFace` DROPS ITS RULES TEXT below roughly 200px wide, so 200px is a hard floor on any screen that shows cards to be read.** `.card-face` is `container-type: size` and switches to the compact board-minion layout under that width — correct for a minion on a crowded board, and wrong everywhere else. It is a floor rather than a preference, and it holds at every screen size: a narrow viewport is a reason to show fewer cards or wrap them onto more rows, never a reason to shrink them past the point where the card stops saying what it does. It has now caught two builds, the gallery's grid and the card pack's reveal, and in both the failure looked like a layout choice rather than missing content. `just wall` and a wide screenshot both hide it, because the cards look fine — they are simply no longer telling you anything.

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

### The game-over screen names ONE card

**The winner's highest-damage minion, printed as a real card face.** Built 2 September 2026. It
replaced a parade of the winner's surviving minions, and the reason is that surviving is the wrong
measure: a board is whatever happens to be left standing, so the parade was routinely five bodies
that had done nothing and none of the ones that won the duel — a Mythic that traded for three minions
and died doing it never appeared on its own victory screen. Damage is what a duel is decided by, and
it is the only figure on that screen that names a card rather than a number.

- **`state.damageTally` is the source**, keyed by instance id, written by `creditDamage` in `game.ts`
  wherever a blow has already been allowed and applied. A shield that ate the hit, an immunity that
  refused it, or a target that was not there all credit nothing. `duelMvp` reads it.
- **It outlives the minion.** The tally cannot live on `MinionInstance`, because the body the screen
  most wants to name is frequently the one that died winning. Optional on `GameState` so every save
  written before it existed still loads, and an absent tally simply names nobody.
- **Only damage with a MINION behind it counts.** Fatigue and hero powers have no card to put on a
  screen, so crediting them would invent an MVP out of something the player never played. A duel
  decided that way shows no card at all, which is the honest answer.
- **Ties break on the lower instance id** — arbitrary, but stable, so one finished duel always names
  the same card however many times the screen re-renders. Pinned in `src/engine/mvp.test.ts`.
- The card is **232px wide**, above the 200px floor below, because a trophy the player cannot read is
  a picture of a trophy. Three things were REMOVED with the parade: the "Core Collapsed" kicker, the
  two final-core numbers, and the survivor row. Owner's ruling.
- **Two more went on 3 September 2026, both for saying a thing twice.** The wide champion strip across
  the top was the MVP's own artwork at lower resolution with nothing printed on it, directly above the
  card face carrying the same picture — it was already the first thing dropped on a short screen, and
  it is gone at every height now. The line under the title — "The rift stabilizes after N turns", plus
  whichever sentence about the practice bot applied — was the only prose on a screen whose whole job
  is to name a winner and a card. What is left is the title, the champion, its damage, and the two
  buttons.
- **The god-rays turn inside a clipping frame**, and that is what makes the screen's own height
  honest. A rotating square has to be about 1.8x the viewport or its corners sweep into view, and the
  rays bought that with `inset: -40%` — leaving the overlay reporting 360px of content past its bottom
  edge, clipped and unreachable, but enough to make every measurement of that screen say it overflowed.
  **A transform does not fix this**, which is worth knowing before trying it: a scaled box contributes
  its SCALED size to scrollable overflow, measured at the same 1302px against a 900px window. Only a
  clipping ancestor stops it.

### Clicking a keyword on a card face explains it

**Every glossary word in a card's rules text is a button, and the definitions live in exactly one
file.** Built 2 September 2026. `src/keywords.ts` is the single copy: the How to play guide renders
its glossary from it, and the card face's tooltips read the same entries, so a wording fix lands in
both places or in neither. Definitions carry `*emphasis*` markers rather than markup, because one has
to survive being read as a plain string by the tooltip and as rich text by the guide.

- **`KEYWORD_LOOKUP` is sorted longest-match-first**, and that ordering is the whole correctness of
  the matcher: `Divine Shield` has to be offered before `Shield` would be, and `Attack Locked` before
  `Attack`. Matches only count on word boundaries, so "Charged" is not Charge.
- **It is OPT-IN, and it is on in the gallery only.** A card in hand is clicked to PLAY it and a
  minion on the board is clicked to ATTACK with it; a second meaning on part of those faces would
  turn "I clicked Taunt" into a misplay. The gallery is the one place a card is only ever read.
- **The panel is rendered through a PORTAL onto `document.body`,** and that is what stops it
  clipping. `position: fixed` alone was not enough: a fixed element is still positioned and painted
  inside the nearest ancestor that makes a stacking context, and a card face is full of them —
  transforms on the frame, blend modes on the shine, its own z-indexed gems and rails. Rendered in
  place it showed the card's flavour text through itself and was painted over by the ATK gem. Mounted
  on the body it has no ancestor left to be trapped by. Its background is a FLAT colour, not 98%
  alpha: two per cent of transparency is invisible on a flat panel and very visible over artwork.
- **Resting on a card in hand for two seconds explains its keywords too.** Built 3 September 2026.
  The panel sits ABOVE the card, hanging over its right-hand side, and lists every glossary word the
  card prints, in the order it prints them. Above rather than beside: beside meant sitting on
  the card it was explaining, or on its neighbour in the fan, and the empty board over the hand is the
  one place with room. `KeywordPopover` takes an `above` flag for this, which forces the placement
  instead of only flipping when it runs out of space below. `HAND_KEYWORD_DELAY_MS` is 2000, not the ordinary hover delay:
  sweeping the fan to read it must never fire a panel, and a card whose keywords you want explained is
  one you have stopped on. A card printing no glossary word arms nothing.
- **It reads the RULES TEXT, not only the keywords column, and it runs for relics.** Fixed
  3 September 2026, and both halves were the same mistake — asking the CSV which words a card prints
  instead of asking the card. `Battlecry` is written in the effect line and is in no card's keywords
  column, so the panel that exists to explain a card's timing had never once explained the commonest
  timing word in the game. Relics carry no keywords column at all and so armed nothing, while a relic
  is ALL rules text. `handKeywordEntriesFor` in `App.tsx` scans the effect with `splitOnKeywords` —
  the same longest-match-first pass the gallery's clickable words use, so a definition cannot be
  offered by one surface and missed by the other — then appends any column keyword the text never
  mentioned, and dedupes by entry so `Freeze` and `Frozen` on one card are one line.

### Hovering a minion shows what it is reaching

**A dashed magenta ring appears on every minion the hovered one is currently affecting.** Built
2 September 2026. `reachOf` in `App.tsx` is a REVERSE LOOKUP over live state, not a reading of card
text: the engine already records who is paying whom — an aura bonus names its source, a granted
shield names its holder, a mark names who set it — because it has to take those things back when the
source dies. Nothing is re-derived, so a minion whose text has not actually landed on anybody lights
up nothing, which is the honest answer.

**Only the minions being AFFECTED are ringed.** The source was ringed too, more brightly, until
3 September 2026 (owner's ruling). That was the wrong read: the source is the one already under the
pointer, so marking it says nothing and puts a fifth ring on a board that has four.

**Dashed, and magenta, for a reason.** The board already spends solid green on "ready to attack",
solid red on "legal target" and blue on "you can afford this"; a fourth solid ring in a nearby hue is
a ring nobody can read. It is drawn with `outline`, never `box-shadow`, because ready, targetable,
armed and the slot auras all write `box-shadow` on that same element and a later rule of equal weight
would silently delete whichever was showing. A live target prompt suppresses it entirely: while the
player is being asked to choose, one ring system owns the board.

**No hand-card tooltip.** The native "Drag onto the board (or click) to play" title was removed on
2 September 2026 (owner's ruling): it covered the neighbouring card a second after the pointer
landed, which is exactly when the hover preview was trying to show that card, and it explained a
control the player had already used by the time they could read it.

### The duel log

The drawer on the left edge of the board, newest first, fed by `GameEvent`s the engine emits. Four
rules it now obeys, each of which it broke until 2 September 2026:

- **It prints everything it is handed.** It used to print the last 30 of the 80 events being kept, so
  one busy turn — a board wipe, a chain of Deathrattles — could push the move that caused it off the
  top of the list a player was scrolling precisely to find it in. A log that drops the middle of a
  story is worse than a short one, because nothing marks the gap. The buffer is now
  `EVENT_LOG_LIMIT` = 300; a measured 23-turn self-play duel produces 169 events, so the old 80 was
  deleting the first half of a normal duel while it was still being played. **The constant lives in
  `storage.ts`, not in `App.tsx`,** because the SAVE is the tighter constraint — every event in the
  list is written to localStorage on each state change. It was two numbers for a while, 300 in the
  drawer and 60 in the save, so continuing a saved duel silently truncated its own history to the
  last few turns: the one moment a player is most likely to open the log.
- **An action is logged BEFORE its consequences.** Playing a relic used to log the equip, the relic's
  own effect, and any card it drew, and only then "Player Two plays Poké Ball on Knight" — because
  `equipRelic` was called before the play event was pushed. Every other play in the game already had
  this right.
- **Effect damage names its source; combat damage does not.** A combat blow always sits under its own
  "A attacks B" line, so repeating the attacker is an echo. Effect damage has no such line, and a bare
  "Cecil takes 1 damage." under "Player Two plays Modern Tank" left the reader to guess the two were
  connected — and to guess wrong whenever anything resolved in between.
- **Every line ends in a full stop**, deaths included. The death text is assembled from a bare clause
  at sixteen call sites, so the stop is added where the event is pushed.
- **One death, one line.** The Monkey's Paw used to push "X dies from The Monkey's Paw" and then let the
  death event push "X falls to The Monkey's Paw" underneath it, so every paw death was reported twice and
  read like two minions dying.
- **A relic that acts names ITSELF, not its bearer.** The Stand Arrow transforms the minion it is strapped
  to, and the line read "Tech Hub transforms Tech Hub into Zoro" — which looks like a minion doing something
  the rules forbid rather than a relic doing exactly what it prints. `transformMinionFromPool` takes an
  optional `sourceLabel` for this; any future relic that transforms should pass one.
- **A choice is logged, not only its outcome.** Aladdin Lamp printed what the wish DID and never what was
  wished for, so watching an opponent's lamp resolve showed a summon with nothing saying a wish had been
  made at all.

**A card added to hand is deliberately anonymous** — "Player One adds a card to hand", never the card
name. The log is readable straight through the hotseat curtain, which exists so the incoming player
cannot see the outgoing player's hand.

**`npx tsx scripts/dump-log.ts [seed]` prints a whole self-played duel's log.** It is how the four
faults above were found: ordering and omission are invisible to every test in the suite, and reading
one duel end to end is the only thing that shows them.

### The hand grows as one, and the win screen never scrolls

Two owner rulings from 2 September 2026, both about the same failure: a panel
appearing over the thing the player was trying to look at.

- **Hovering any card in your hand enlarges the WHOLE fan** (about 38%, inside
  the 30-50% asked for) and lifts it. The per-card preview panel is gone from the
  hand: it opened a full-size copy of one card beside the fan, covering the board
  that card was about to be played onto, and left the fan itself exactly as
  unreadable as it had been. It is ONE transform on the container, never a scale
  per card — the fan overlaps its cards with negative margins, so scaling them
  individually pushes them through each other. Board minions KEEP their preview
  panel, because there is no room to enlarge a board in place.
- **The player-count pill sits ABOVE the column of doors on a narrow screen.** At
  680px and under that column runs edge to edge, so a pill pinned 62px off the
  bottom-left corner landed on top of whichever button happened to be there.
- **The result screen fits on one screen.** `.overlay.result-overlay` does not
  scroll at all. The wide hero strip used to be dropped under 720px of height to
  make that fit; it was removed from the screen entirely on 3 September 2026, so
  what tightens on a short screen now is the title, the spacing and the card. The card itself never goes below
  208px, which keeps it above the 200px floor where `CardFace` silently drops its
  rules text.

### Three things the board now says out loud

- **A blocked relic names the minion blocking it.** Kratos forbids the opponent's
  relics and Hero Power, and the board used to report that as "No room on the
  board" — a different problem with a different fix, which sends the player
  rearranging a board that was never the issue. `relicLockSource` in `game.ts` is
  the selector.
- **The enemy Hero Power card opens on a CLICK, never a hover.** It used to appear
  after a one-second hover, which meant it opened whenever the pointer crossed the
  top strip on its way somewhere else, and covered the enemy board while it was
  there. Any action closes it again. `check:ui` went on asserting the one-second
  hover until 3 September 2026 and failed on every run against a build doing
  exactly what the ruling asked; it now hovers, checks that nothing opens, clicks,
  and checks that it does. The click is forced, because the plate carries
  `aria-disabled` whenever the core cannot be struck.
- **A hand revealed by The Watcher reads instantly and says nothing twice.** Those
  cards are 25px wide and unreadable without the preview panel, so the hover delay
  is skipped for them (`previewCard(..., instant)`); the native tooltips on the
  card and on the row are gone, and the cursor is a pointer rather than the
  question mark that promised a tooltip.

### Developer tools can arm the enemy

`Equip on enemy first minion` sits beside `Equip on my first minion` in the
developer panel. Testing a relic used to mean testing only what it does FOR you,
and a good half of the relic pool is interesting precisely because of what it does
TO you. `developerEquipRelic` already took an owner; only the button was missing.

### Developer tools can jump to the result screen

`I win`, `Enemy wins` and `Draw` sit under the selected card in the developer
panel, and each opens the result screen with that card as the champion. Built
3 September 2026, for the same reason as the pack buttons: the screen was
reachable only by playing a duel to its end, and to a SPECIFIC end, since which
card it names is decided by who dealt the most damage over the whole duel. The
title, the rays, the hero strip, the full card face and the damage line were
therefore all judged from memory of the last real duel that happened to produce
one.

**Nothing is recorded, and the log says so.** `developerShowResult` claims
`duelRecorded` BEFORE it changes the phase, so the effect that writes the record,
pays the pack and clears the save sees a duel already dealt with and stands down —
claiming it afterwards would be too late, because that effect fires on the phase.
It writes one `damageTally` entry the way the engine writes them, keyed by
instance id and owned by the winner, rather than teaching `GameOver` a second way
to be told about a card. The damage figure is invented, and it is the only
invented number on that screen.

The buttons sit outside the panel's title/duel split, because the result screen is
no more part of a duel than the pack screen is.

**It switches the mode to a BOT duel, and that is not cosmetic.** The ending music
asks whether the duel was LOST, and only a duel against the bot can be — in
hotseat somebody always won. Jumping from a hotseat mode therefore played the
victory piece under `Enemy wins`, which made the defeat music unreachable from the
one tool built to reach these screens.

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

## The rarity shine

**Every card above Rare carries an animated shine, and each tier's is a different KIND of thing rather than the same thing in a different colour.** Built 23 August 2026, in `source/src/App.css` under the same heading, driven by `.cf-shine` in `App.tsx`.

| Tier | Colour | What it does | Layers |
|---|---|---|---|
| Epic | violet | mist drifting sideways, dust settling through it | 4 |
| Legendary | gold | five tinted rays spinning at the card foot | 3 |
| Mythic | crimson | a low bed of tapered flame, embers off the top | 5 |
| Relic | teal | aurora, motes rising, one rare foil sweep | 4 |
| Rare | — | nothing at all | 0 |

**Rare having none is the load-bearing part.** Give every card a shine and the tiers stop meaning anything, and 60 Rare cards stop costing anything at the same time, which is what keeps a gallery of 216 affordable.

### The technique, which is the transferable part

The colours are not reusable. These five rules are, and they are the whole reason this reads as magic rather than as a blinking light.

1. **Three layers minimum, and they must differ in KIND.** A colour field, a particle field and an edge do three different jobs. One layer, however pretty, is read as a loop within about two seconds.

2. **Mismatched, non-multiple periods.** Every duration is chosen so no two share a factor: 17/29/8.7, 15/23/11/6.1, 12/14/9.3/19/5.7, 13/19/16.5/5.3. Two layers on 8s and 16s realign every 16 seconds and the whole thing snaps back into one visible beat.

3. **Motion KIND carries identity far more than colour does.** Epic drifts sideways, Legendary ROTATES, Mythic licks upward in fast irregular tongues, Relic rises slowly. Recolour all four teal and they are still four different cards. **Two tiers sharing a motion is the failure**, and it happened: an earlier build had gold dust falling and crimson embers rising, which are the same motion mirrored, and Legendary read as a paler Mythic because of it.

4. **Size everything in `--u`, never px.** The first build sized particles in pixels and they vanished: a 1.5px dot is a speck on a card rendered 1400px tall, so the layer looked like nothing rather than like a bug.

5. **Transform and opacity only.** Nothing may reflow or repaint layout, because a gallery can hold a screen of these at once. Anything animating `background-position`, `width`, `filter` or `box-shadow` belongs somewhere else. Most published CSS fire ends at a `filter: contrast()` over two sliding noise layers, and that filter is exactly what this rule forbids.

6. **Particles need a near-white CORE, not a flat tier colour.** Screen-blending a mid-tone over bright artwork barely moves it, so the first Mythic embers disappeared entirely against Yujiro's silver-white figure. A white centre with a coloured falloff reads on anything.

7. **The card has to survive the shine, and a MASK is what makes that true.** Three separate layers had to be masked back, and in each case the unmasked version looked like a sticker laid over the illustration rather than light inside it:
   - The Mythic flame is masked off the bottom 14%, because its brightest part sat exactly on the ATK and HP gems and screen blending turned both to pale mush.
   - The Legendary rays are masked into a halo with a clear centre, because edge-to-edge they erased the subject of the picture entirely.
   - The camp sigil is masked to the art window, because faint tick marks drawn through a sentence read as a rendering fault.

**The rim is the loudest channel available, because it is the only one not competing with the artwork.** A field or a particle over a busy illustration gets swallowed; a glow burning inward from the frame always reads. The escalation between tiers is therefore spent mostly on the rim: 30 design units on Epic, 40 on Legendary, 52 on Mythic.

**A light bar crossing the card belongs to relics and to nothing else.** It was on Legendary and Mythic too, and having three tiers share the single most noticeable motion in the system flattened all three. There is a check that stops it creeping back one tier at a time.

**Six fixed slots in the markup for every tier**, with the ones a tier does not use switched off in CSS. A different element list per rarity puts the layer count in two places at once and lets the markup and the stylesheet disagree silently.

### Making fire, specifically

Mythic was rebuilt after the first version read as a red glow rather than as flame. The published CSS-fire techniques were read before rebuilding and they agree on two things it had wrong:

- **A temperature ramp is the biggest single realism cue.** Real fire is white-hot at the base, then yellow, orange, deep red, gone. The first build gave every lobe one flat orange, so it had no temperature at all and could only ever look like coloured light. Every tongue now runs white → gold → orange → red → transparent along its own length.
- **Tongues must be NARROW AND TAPERED.** They were wide ellipses, which is the shape of a glow. Each is now about a tenth of the card wide and several times taller than wide, and no two share a width, a height or an even spacing — even spacing is the tell that turns a fire back into a pattern.

**What could not be taken from those sources:** both end at either a prerendered Perlin-noise texture scrolled upward, or a `filter: contrast()`/`blur()` stack over sliding noise. The filter route is barred by rule 5 and a texture is an asset this project does not need. The substitute for noise is two tongue rows on different fast clocks — 1.7s and 1.1s — at different widths and offsets, with a **`skewX` lean** in the keyframes. The lean is what sells it: a flame that only grows and shrinks is a lamp; a flame that also bends is fire.

**Speed was the other half of the fix, and it has been tuned in both directions.** The first build swelled over 12 seconds, which is not fire. Real fire flickers in about one, which turned out to be too fast: a thumbnail-sized flame at that rate reads as a strobe, and a gallery row of them is unusable. It runs at 3.4s and 2.2s now. **Slow enough to watch beats accurate**, and the same held for the Legendary rays, which turn once every 134 seconds — slow enough that you never catch them moving, only notice some seconds later that the light is not where it was.

**Height is capped low on purpose** — a thin band along the bottom edge, ending at the flavour line. It came down three times on the owner's call, from half the card to a fifth to about a tenth. Fire that climbs into the artwork stops being a card that is burning and becomes a card behind a bonfire.

**The mask's top stop is what caps the height, but the LOBES have to come down with it.** Cut the mask alone and it slices each tongue through its widest part, so what survives is a bright band rather than tongue shapes — which looks like a gradient bug rather than a height setting. Both were halved together each time.

**The Legendary rays sit at the card's FOOT**, and they are short — the last of the light is gone before the rules plaque, whose bottom edge is 130 design units up. Light rising from the card rather than a sun behind the subject.

**Ten wedges in the gradient show as FIVE rays on the card.** The origin sits on the card's foot, so the lower half of the circle is always outside the frame and the number you can count is half the number in the gradient. Nineteen wedges at 19 degrees read as a texture, eight at 45 as a burst, five at 72 as about three, and ten at 36 as five.

**It is a plain `conic-gradient`, not a `repeating-conic-gradient`, and that is what lets the rays differ in colour.** A repeating one stamps the same wedge every time, so every ray is necessarily identical. Naming the stops out gives each ray its own tint of yellow, and because the whole gradient turns, any one spot on the card is lit by a slightly different gold each time a ray passes over it — the colour change comes from the rotation, not from animating a colour, which would repaint every frame.

**They must SPIN, not travel, and getting that right took two geometry corrections that both looked like something else.**

- **`transform: rotate()` turns an element about its OWN centre.** The conic gradient's origin was elsewhere on that element, so the origin orbited the centre once per turn: the rays crawled sideways across the card and swept off its edge. It read as a timing or easing problem and was neither. The layer is now a big square whose centre IS the gradient origin, so gradient origin, element centre and rotation pivot are one point.
- **A percentage margin resolves against the containing block's WIDTH on BOTH axes.** `margin-top: -130%` therefore pulled the layer up by 130% of the card's *width* instead of its height, leaving the pivot about a quarter of a card below its foot. Everything here is sized and offset in design units instead, which has no such trap.

`check:ui` pins all three properties — the pivot does not drift while the animation runs, it sits on the card's centre line, and it sits at the foot. It measures on a BOARD minion, not a hand card: **the hand fans its cards**, so a card there is tilted several degrees, and once it is, comparing the screen-space position of a point at the card's foot against the centre of the whole card is meaningless. That produced a ten-pixel "failure" that was the check being wrong rather than the CSS.

The bloom moved down and shrank with the rays: leaving it centred put the source in one place and its glow in another.

### Living rails, and tier-coloured names

A tier says how RARE a card is. The two rails say what KIND of thing it is. **Both vertical words down the card's edges now carry a gradient clipped to their glyphs and travelling along them**, so each says what it is in its own colours.

| Rail | Value | Colour |
|---|---|---|
| camp | Magic | violet |
| camp | Tech | electric blue |
| camp | Nature | leaf green |
| camp | ALL | white, being every colour at once |
| alignment | Good | pale gold |
| alignment | Neutral | steel, the dullest of the seven on purpose |
| alignment | Evil | crimson |

**They used to CYCLE a prismatic gradient through their letters, and that was worse than it looked.** It made each word an event: the eye went to whichever rail happened to be flashing white, twice a cycle, on every card on screen. A camp is a FACT about a card, not a thing that happens to it, and a fact is best said once in one colour. Owner's call, and it removed three problems at once — the cards stopped competing for attention, seven words stopped needing seven non-clashing periods, and **the one place this system broke the transform-and-opacity rule went away**, because nothing on a rail animates at all now.

`ALL` belongs to two cards only, and white is the right answer for it rather than a seventh invented hue: white IS every colour at once, which is what the camp means. Relics print no rails at all.

**The rails are tracked wide** — 12 design units against the 0.5 they started at. These words run VERTICALLY, one glyph above the next, and vertical text at normal tracking reads as a stack rather than a word: the letters touch and the eye has to work them out.

**The ceiling is measured, and the arithmetic that guessed it was wrong by a third.** Reasoning from a nominal glyph advance put the limit near 24 units; two real readings of the longest word, "Neutral", against its own box gave 55.9% filled at 14 units and 82.4% at 28, which puts 95% at about 34. 28 was then tried and was too much — the letters read as separate marks rather than as a word — so the useful range turned out to be well under the measured ceiling. It sits at 12, about half the box. `check:ui` re-measures it on every run, because the rail has a fixed top and bottom and `white-space: nowrap`, so a word too long for it spills out of BOTH ends rather than wrapping or clipping.

**An arcane circle behind the artwork was tried first and scrapped.** However faint it was made, a second animated system in the middle of the card competed with the tier shine for the same space, and a card has one middle.

Two rules survive from the cycling version:

- **Every colour is LIGHT.** A mid-tone rail on a dark plaque is a rail you have to look for, and these words are 26 design units tall against artwork that can be any colour at all. **A decoration may not cost legibility.**
- **The halo is what makes it look lit rather than tinted.** `text-shadow` cannot be seen through transparent glyphs, so it is a tight coloured `drop-shadow` on the element, in that rail's own hue, over the dark shadow that keeps it legible on pale artwork.



**The cost crystal and the ATK/HP gems are a third larger everywhere the card is NOT on a board** — in hand, in the preview, in the gallery, in a pack, in a discover prompt. A minion in play already has its own much bigger gems (150 and 156 design units against the printed card's 84 and 72), so the board is untouched by construction rather than by a rule.

**A BIGGER CRYSTAL AND A BIGGER NAME COMPETE FOR THE SAME ROW, and the name is centred, so every unit the crystal gains costs the name's box two.** The crystal's left edge walks from 664 to 636, so `NAME_BOX` comes down from 580 to 500 to keep the name clear of it. All of this was measured rather than reasoned: before the change every name on the roster inked at the 45.5 cap with the widest stopping 52 units short of the crystal; after it, names run 32.5 to 54.5 and the tightest clearance is 12 units. Nothing collides, and **the longest few names are now box-limited and end up smaller than the rest** — the honest cost of the trade, not a bug.

**The name cap rose a fifth, 46 to 55**, and that is the only thing that could make a name bigger: every name was pinned by the cap rather than by its box, so widening boxes would have done nothing. The BOARD keeps its own 46 cap, because a minion in play has far less room across the top.

**A board name is CENTRED whenever it can afford to be.** It is pushed left by an asymmetric padding so a long name clears the cost crystal, and that padding used to apply to every name — so short ones sat 76 design units off the centre line for no reason, which is what the eye actually noticed. `CardFace` now centres any name that fits at full board size inside a symmetric box, which is most of them.

**That test compares two fits rather than testing one against the cap**, and it has to. `fitOneLine` floors its answer to half units, so a name that fits comfortably at a 46 cap comes back as 45.5 and never as 46 — a `>= 46` test is dead code that silently centres nothing, which is exactly how it shipped the first time. Every name on the roster measures 45.5 for this reason. `check:ui` measures the text's INK, not its box: the box is full-width either way and only the text inside it moves, which is why the fault survived every earlier check.

**The name, the flavour line and the origin line all carry the tier's colour**, as a PALE tint and never the saturated one: lilac for Epic, gold for Legendary, rose for Mythic, cyan for Relic, plain white for Rare. That puts the tier's colour at the top of the card and at the bottom, which frames the artwork in it rather than labelling it once.

Pale rather than saturated because the banner behind the name is already painted in that tier's palette, so a saturated gold name would be gold on gold — and the name is the one thing on a card that must never be hard to read. All three use the SAME four values, not a second palette: two near-identical sets of tier colours would drift apart the first time one of them was tuned, and there is a check that notices when they do.

An earlier attempt named its layer `.cf-camp`, which was already the left rail's own class, and claiming it silently rewrote the rail's box and dropped the word "Magic" rotated across the middle of the card. Nothing errored and every test stayed green. `check:ui` now measures the rail's WIDTH, because every obvious assertion about it — present, vertical, left-hand side, correct text — kept passing while it was broken. It also compares all six gradients against each other, because "distinct" is the one property that cannot survive someone copying a block and forgetting to change the colours.

### Proving it, because a screenshot cannot

`npm run check:ui` asserts two things per tier: that the expected number of animations are actually RUNNING, and that the card's pixels change between two frames a second apart. **Neither alone is enough, and that is not a guess** — live-fired by misspelling one keyframe name, which left the other layers moving and passed the pixel diff while the animation count went red. The counts in that check are the escalation itself: a tier that silently loses a layer stops escalating, and nothing else in this project would notice.

An unmet card in the gallery does NOT shine, and that is correct rather than a bug: the collection's own grayscale dimming sits on the whole card face and wins. The shine is for cards you have met, and for the pack, the hand and the preview, where nothing dims them.

**A LOCKED card carries no shine and no camp mark at all**, and that is an explicit rule rather than a side effect. A blend-mode layer is not a colour a grayscale filter can drain, so sealed relics went on flickering with teal light while sealed characters sat dead, and the locked wall stopped reading as one wall. A locked card shows its seal and nothing else.

## Assets and audio

`source/public/` is the runtime asset location. `materials/local-production/` contains optional rebuild tools for art, music, voice previews, and cast sheets; it is not required to play the included build. Large audio and card-production libraries are release downloads rather than normal clone requirements.

### The four moment pieces, and the endings the herald no longer narrates

**A pack opening and each of the three endings has its own piece of music.** Built 3 September 2026,
owner's ruling, and it came with a deletion: the herald's spoken `victory`, `defeat` and `draw` lines
are gone from `announcer.csv` and their clips are gone from the build. "Your core collapses. The rift
takes you" is the one line a player hears on every duel they lose, and by the third loss it is the
game talking over its own ending. Music says the same thing and does not wear out.

| Cue | Source | Where it plays |
|---|---|---|
| `pack` | Christopher Tin — *Sogno di Volare* | The whole pack ceremony: five strikes, the burst, the deal |
| `victory` | *One Piece* OST — Overtaken | The result screen, on a win |
| `defeat` | *Naruto* OST — Sadness and Sorrow | The result screen, on a loss |
| `draw` | *Attack on Titan* OST — Vogel im Käfig | Mutual annihilation |

- **FOUND, not generated**, like every other piece of audio here — see the ruling under
  [What the title screen is allowed to download](#what-the-title-screen-is-allowed-to-download). The
  previous `victory` and `defeat` stings were generated locally, which is why they were the two files
  this pass replaced rather than kept. `materials/local-production/asset-tools/fetch-screen-music.py`
  is the front door: `--dry-run` searches and ranks candidates without downloading anything, the
  chosen video ids live in `screen-music-picks.json` so a re-run fetches the same track, and the cut
  itself reuses `build-card-stings.py`'s picker rather than owning a second one.
- **A cue plays on the THEME bus, not on the bed's own gain node.** The bed is ducked underneath for
  the cue's whole length, and a cue hanging off `musicGain` is ducked by its own duck: measured on the
  master bus at **0.018** wired that way against **0.29–0.48** wired correctly, which is the difference
  between "there is something playing" and music. Card themes had already solved this; cues now share
  the solution.
- **One at a time, and it leaves with its screen.** A second cue cuts the first, `stopCue` ends one
  when its screen closes, and the ending waits for the pack to be collected — the pack sits above the
  result screen, so the two would otherwise start together.
- **`probeCue` and `probeBus` in the DEV hook are how any of this is checked.** `check:audio` probes
  all four cues on the master bus, because a cue comes off disk and can fail its fetch or its decode
  with every counter still reading healthy. `probeBus` measures whatever is sounding right now and
  triggers nothing, which is the only way to prove the WIRING — that the pack screen really starts its
  own music, and that the menu bed really comes back.

**The menu bed comes back when you leave a finished duel, and for a while it did not.** Fixed
3 September 2026. `toTitle` does not reset the game, so `phase` stays `gameOver` all the way back to
the title screen; the music effect tested for that phase BEFORE it tested the screen, answered
"a duel just ended, play nothing", and the title screen stayed silent until the tab was reloaded. The
screen is asked first now. It was never a developer-tools bug — every route home was silent.

### A heavy minion lands with a thud

**A minion costing 6 or more lands with a thud, and the thud SCALES with the cost.** Built
2 September 2026, made proportional on 3 September (owner's ruling). `HEAVY_LANDING_COST` is the
threshold and `heavyLandingWeight` in `App.tsx` is the curve: 0.28 at 6 mana rising to 1 at 10. It
starts at 0.28 rather than 0 because "minimal" is not "silent" — a 6-mana body should still be felt,
and only the top of the range should be an event. One fixed thud for the whole top half of the curve
said the wrong thing about everything in between.

It is keyed to COST, not to rarity or to stats: rarity already has the summon fanfare, cost is what
the player is paying, a 6-mana Rare should land as hard as a 6-mana Mythic, and a small minion that
got big from buffs did not arrive big.

- **The cue is all bottom end and no top** at every weight — a taiko, a sub drop, a low noise floor,
  and a second taiko a beat behind. It fires under a rarity fanfare, so a second bright layer would
  fight it while the sub sits in the one part of the spectrum the fanfares leave empty.
- **Loudness is not the only thing that scales.** A louder tap is still a tap: weight is also LOWER
  and LONGER, so the sub drops further and rings longer as the number climbs. `renderHeavyLand` in
  `sfx.ts` takes the weight and scales every layer. The second taiko is genuinely absent below about
  a third of the way up, and only the top of the range ducks the music, so a 10-mana arrival owns the
  room for a moment and a 6-mana one does not interrupt the bed.
- **It waits 0.16s**, so the cue and the fanfare read as one arrival rather than smearing together.
  The CSS animation carries the same delay; keep the two in step.
- **The screen movement is its own animation, not the hero-hit shake.** A hit is a fast horizontal
  rattle that dies out; weight arriving is a single vertical drop with one rebound. Reusing
  `screen-shake` would have made a big minion landing feel like taking a punch. It reads the same
  weight through a `--thud` custom property, and the DURATION scales with it too — holding the timing
  fixed made every weight feel the same however far the table moved.

### Card art is WebP. Every file, no exceptions

**Producing a card image, start to finish.** Every step here is Convergence's
own; the general image technique lives in
[Knowledge/image.md](../../../Knowledge/image.md) and is not repeated.

1. **Source a real photograph.** Never generate one — see the ruling below.
2. **Upscale if it is small.** `py -3.14 Pipelines/image/image.py upscale <file> --scale 2`
   uses the vendored waifu2x. Processing, not generation.
3. **Crop to the art window, which is `732 x 492` design units** (aspect 1.488).
   The window is LANDSCAPE — a portrait source will be cropped hard, and that
   surprises people who assume a card frame wants a portrait picture.
4. **Save as WebP at quality 88.** That is where a side-by-side stops being
   distinguishable at card size.
5. **Rebuild the menu thumbnails** with
   `materials/local-production/asset-tools/build-menu-art.py`.

**Bulk-shrinking oversized source art**, if a batch ever arrives at print size.
Target roughly **2 to 3 times the on-screen size** and leave the print masters
untouched. One run took **358 MB down to 12 MB** (~60 kB a face) across 196 card
faces with the baked-in card text still crisp:

```
image_convert.ps1 -Path <folder> -From png -To webp -MaxWidth 600 -Quality 86
```

Per file:

```
ffmpeg -i in.png -vf "scale=600:-1:flags=lanczos" -c:v libwebp -quality 86 out.webp
```


**A new card image is saved as `.webp`.** As of 2026-08-21 every one of the 203
files in `source/public/card-art/raw/` is WebP except one deliberate SVG, and the
last eight PNGs converted at **3.85 MB -> 0.48 MB, 88% smaller**, with no visible
difference at card size. One of them, `token-sin.png`, was 2.1 MB by itself: the
largest file in the entire game, for a 1/1 token.

**WebP is not universally better than PNG, so the rule is scoped to what this
folder actually holds.** PNG wins on small flat-colour graphics, on anything
needing pixel-exact reproduction, and SVG beats both for vector art — which is
why `basic-mothership.svg` stays an SVG. What lives here is photographic
character art displayed at roughly 730x490, and for that WebP is decisively
better at the same visual quality. Judge a genuinely different kind of image on
its own terms rather than converting it because of this line.

**Every minion wears a real photograph, and hand-drawn art is banned.** One card,
Mothership, shipped with a hand-authored SVG of gradients and polygons sitting
among 174 photographs, and it reads as a broken asset rather than as a style.
`npm run validate:data` now fails on any card whose art is not `.webp`, with a
single dated exemption for that card because it is being replaced outright.

**Do not generate a replacement image.** Owner ruling, 2026-08-21: image
generation is banned. Source a real photograph, or say plainly that you cannot
and ask. The full rule and its reasoning are in
[Knowledge/image.md](../../../Knowledge/image.md) as R-img-56.

### What the title screen is allowed to download

**Every card must have a theme, and `npm run validate:data` now fails when one does not.** Three cards
shipped silent purely because nothing counted. Relics are deliberately excluded: they use `r###` ids
and are not part of the theme set.

**Themes are FOUND, never generated.** Owner ruling, 2026-08-21: generation is banned for audio as
well as images, unless he permits a specific job by name. Three themes were generated before that
ruling and have been replaced with real recordings, sourced with `yt-dlp` per
[Knowledge/audio.md](../../../Knowledge/audio.md):

| Card | Source | Why |
|---|---|---|
| Meteor | [Meteor Whoosh and Explosion](https://www.youtube.com/watch?v=WFN9tUtrq-s) | Free sound effect; the whoosh-then-impact arc is the card |
| Planetary Defense Grid | [Sci-Fi Energy Shield Activate](https://www.youtube.com/watch?v=ekErpYY7X8c) | No-copyright SFX, already the right length |
| Black Hole | [NASA black hole sonification](https://www.youtube.com/watch?v=_tXhBLg3Wng) | NASA'''s own data made audible: a real recording, public domain |
| Lord Voldemort | [Hedwig's Theme](https://www.youtube.com/watch?v=wtHra9tFISY) | Owner-selected iconic Harry Potter theme |

The eleven newest cards each use a distinct YouTube source from their own universe. The sting cutter
stores only the six-second excerpt in the game, while these source choices remain documented here:

| Card | Source |
|---|---|
| Xenomorph Queen | [The Queen — James Horner, *Aliens*](https://www.youtube.com/watch?v=VLG94f_koQQ) |
| Naruto | [Strong and Strike — *Naruto* Original Soundtrack](https://www.youtube.com/watch?v=scWSTDsj3IM) |
| Frieren | [Journey of a Lifetime ~ Frieren Main Theme — Evan Call](https://www.youtube.com/watch?v=sSmK6-O-0gk) |
| Guts | [Berserk OST — 04 Guts](https://www.youtube.com/watch?v=dIoILN_KrhU) |
| Omnitrix | [Ben 10: Secret of the Omnitrix Theme](https://www.youtube.com/watch?v=eOU-7O-3hW8) |
| Stand Arrow | [JoJo's Bizarre Adventure: Golden Wind OST — Stand Arrow](https://www.youtube.com/watch?v=omyS3-a0cwE) |
| Poké Ball | [Pokémon Movie 01 BGM — Monster Balls / Poké Balls](https://www.youtube.com/watch?v=j-pNFMbi48o) |
| Time Turner | [The Time Turner — *Harry Potter and the Cursed Child* Soundtrack](https://www.youtube.com/watch?v=Sdvauf-DyKg) |
| Symbiote | [Symbiote Peter Boss Fight Theme — *Marvel's Spider-Man 2*](https://www.youtube.com/watch?v=Mb1AYDnzAkg) |
| Neuralyzer | [M.I.B. Main Theme — Danny Elfman](https://www.youtube.com/watch?v=jyb33RgAxis) |
| Green Lantern Ring | [The Ring Chooses Hal — *Green Lantern* Soundtrack](https://www.youtube.com/watch?v=E7_l6wuHwiw) |

Each is the LOUDEST six-second window of its source, found by stepping `volumedetect` across the file
rather than guessing an offset, then two-pass `loudnorm` to sit with the other 172. **volumedetect
reports at ffmpeg'''s info level** — suppressing to `-v error` makes every window score nothing and the
search silently returns offset 0 while looking like it worked.

**The menu has a size budget, and it is easy to undo by accident.** Measured 2026-08-21, the title
screen was downloading **7.9 MB** before it settled, and the owner's report was that it "opens a bit
slow and laggy". It is **1.1 MB** now, with nothing about the design changed. Three rules keep it there:

| What | Rule | Why |
|---|---|---|
| Floating cards | Serve `card-art/menu/`, never `card-art/raw/` | 84 cards render at most 134px wide and are blurred; the full art was 4.67 MB for pixels nobody can see. Thumbnails are 568 kB |
| Backdrop | `menu-rift.webp`, never a PNG | The same picture was 2.0 MB as PNG and is 124 kB as WebP |
| Fonts | WOFF2, never TTF | 1.21 MB became 382 kB. This matters more than it looks: `font-display: block` holds every piece of text invisible until its font arrives |

`materials/local-production/asset-tools/build-menu-art.py` regenerates the thumbnails; re-run it after
adding cards. **`font-display: block` stays.** Swapping fonts mid-render would resize card text in
front of the player, because a card's rules text is measured to fit its plaque. Shrink the file
instead of trading the layout away.

**A card whose art is an SVG has no thumbnail and must keep the raw path.** `menuArt()` in
`Screens.tsx` checks for a raster extension first; rewriting an SVG pointed at a file the generator
never produces, and the card rendered blank.

Card stings are the `c###.ogg` files and relic stings are the `r###.ogg` files in `source/public/audio/stings/`. Every playable minion and relic resolves to its own direct file. Relics use `r###` IDs and are intentionally not part of the title-screen theme set, even though relics share the deck and can appear in hand; audio prefetch must filter relic IDs rather than request `audio/stings/r###.ogg`.

**Hard rule for new content: never reuse an existing audio mapping.** Every new card or relic must get its own suitable source from the YouTube pipeline. Never point a new `c###` or `r###` entry at an existing mapping, copy another item's sting, or fill the slot with a generic theme. Run `materials/local-production/audio-tracks/download_convergence_audio.py` to find and download the source through YouTube, then cut the card-specific sting with `materials/local-production/asset-tools/build-card-stings.py`. If the pipeline cannot find a suitable source for that specific item, stop and ask; do not ship a reused track. The relic prefetch exclusion above concerns loading only and does not waive this provenance rule.

The complete original audio collection is the separate [Convergence-Audio-Tracks.7z release download](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Audio-Tracks.7z), because it is larger than a practical GitHub Pages site.

Use the tools under `materials/local-production/asset-tools/` for production rebuilds — including
`fetch-screen-music.py`, which fetches and cuts the four moment pieces (see
[The four moment pieces](#the-four-moment-pieces-and-the-endings-the-herald-no-longer-narrates)). For audio changes, run the browser analyser check with `npm run check:audio`; a UI counter or a `musicPlaying` flag can say music is active while the browser’s audio graph is silent. Keep synthetic voices original and do not clone real actors.

Do not casually regenerate approved menu, battle, or tension music. Preserve the existing loudness, loop-seam, and energy checks when replacing them.

## Balance, pacing, and bot

### NEVER run a balance patch without being asked. Every single time

**Do not run the balance harness, a balance pass, a dial sweep or a difficulty
ladder unless the owner has asked for that run in the message you are answering.**
Owner's ruling, 2 September 2026. It is a hard ban, and it covers
`npm run sim`, `npm run check:balance`, `scripts/simulate.ts` in any mode, the
`apply-balance-pass*.mjs` scripts, and any new script that measures or retunes
the game.

Three things make it a rule rather than a preference:

- **It is expensive and it is silent.** A full run is thousands of self-play
  duels. Nothing about the request that triggered it says it is happening, so it
  arrives as a long unexplained wait at the end of an unrelated piece of work.
- **It produces numbers that invite changes nobody asked for.** A gate that comes
  back red at the end of a card edit reads as "now fix balance", and the balance
  of this game is the owner's call, not a checker's.
- **Balance work is PARKED** — see [Bot and balance work is PARKED, not
  finished](#bot-and-balance-work-is-parked-not-finished). Running the harness is
  starting parked work without being asked.

A card change, a stat change, an effect change and a bot-dial change are all
finished without a harness run. Say what you changed and what you traded; do not
go and measure it. The narrower rule for the difficulty ladder still stands
below and is not weakened by this one.

### The measured baseline, and what it still says

This block used to live at the bottom of [Gradual card unlocking](#gradual-card-unlocking),
because that is where it happened to be written. It is a balance measurement and it belongs here.

**The balance gate was red on the fresh baseline measured 18 August 2026** — three of eleven checks.
One is fixed; the other two are below. In the order they matter:

- ~~**An invariant breach: `instance <id> is on the board twice`.**~~ **Fixed 18 August 2026.** It was
  Knov's pocket room. A room could be stored holding the *same* minion as both its friendly and its
  enemy side, and since a minion trivially ties its own ATK, the tie branch released it into two slots
  at once. Two guards now exist: the room refuses to open around a single minion, and the release
  refuses to place an instance twice or to place one already on a board. The second guard is the
  load-bearing one, because it closes the whole bug class rather than this one cause. The fuzz phase
  now reports **0 invariant breaches** over 20,996 actions, where it reported 1. Pinned by
  `src/engine/pocket-room.test.ts`, live-fired by removing the dedupe and watching it go red.

  **The upstream cause is now known, and it was never the two-step plumbing.** It is All for One
  (`copy_and_trigger`), and it was doing visible damage in ordinary play, not only in the fuzzer.
  `runEffect` reads `chosen ?? requestChoice(...)`, so handing it a ready-made choice skips
  `requestChoice` and every rule the borrowed effect's own `TargetSpec` carries — side, filter,
  `includeSelf`, untargetability. All for One is the only caller that builds a choice by hand, and the
  one it builds always names the **enemy** minion it copied. Feeding that to a `side: "friendly"`
  effect made the card fully heal, buff, shield or Taunt the *opponent's* minion, and made a `slot`
  effect bless the opponent's slot. Reaching the pocket-room resolver with an enemy-owned "friendly"
  pick was the same fault wearing its worst outcome. `priorOptions` was never lost: the synthetic
  choice simply never had any, so `firstChoice` fell through to the enemy pick by design.

  **Fixed 18 August 2026, and completed 20 August**, by `copiedVictimIsLegalTarget` in
  `source/src/engine/game.ts`. The copied victim is now *offered* to the borrowed effect and accepted
  only when that effect would legally target it. When it would not, the effect **asks for its own
  target** instead, which resolves the copy exactly as though All for One's controller had cast it: a
  copied friendly power lands on THEIR board.

  The first version simply lost the copy, because a borrowed effect could not survive an open prompt —
  `effectId` was restored the instant the branch returned, so a deferred answer would have resolved
  against `copy_and_trigger`. The minion's own effect is now parked in `MinionInstance.copyRestoreEffectId`
  (save v20) and put back by `restoreCopiedEffect` once the copy has no question left. That is what
  makes the prompt possible, and it fixed a second bug for free: **multi-step copies now work**. A
  copied Batman picks a victim and then a gadget, and a copied pocket room takes one minion from each
  side, where before the first prompt silently cancelled the whole effect.

  **All of the above is HISTORY, not live machinery.** All for One became a passive on 2 September 2026
  and `copy_and_trigger` was deleted with it, taking `copyRestoreEffectId`, `restoreCopiedEffect`,
  `copiedVictimIsLegalTarget` and the four targeting tests with it. It is kept here because it is the
  clearest worked example this project has of a whole bug class — an effect handed a target it did not
  ask for — and because the pocket room's own two guards are still load-bearing. The fuzz figure
  below was measured with that code in place: **0 invariant breaches over 21,005 actions.**

  Worth knowing for whoever changes this next: a board assertion cannot test this fix. The pocket
  room's own two guards already stop the duplicate instance, so a "no minion appears twice" test
  passes with or without the cause being fixed. The discriminating assertion is that the room
  resolver is never entered at all.
- ~~**One duel in 1,000 never finished.**~~ **Closed 20 August 2026.** It was 121 turns against a
  120-turn cap, cores at 27 and 15, no invariant broken: two bots grinding, not a lock. The cap is now
  150 (`--turncap` in `scripts/simulate.ts`). A real duel ends around turn 22, so this was never
  reachable by a player and was only ever a self-play artefact.
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


### Duel length is CORRECT. Do not shorten it

**Measured 2026-08-21 over 600 self-play duels: median 22 turns, p10 19, p90 28,
longest 54.** That figure is settled and the pacing behind it is not up for
revision.

**Read the unit carefully, because the obvious reading is wrong and has already
caused one attempt to "fix" this.** The turn counter ticks once per PLAYER turn,
not once per round. A 22-turn duel is **eleven turns each**. Hearthstone's
commonly quoted ~10 turns is counted per player, so Convergence is within one
turn of it. The game is not long; the number just counts differently.

So: **do not lower core health to shorten duels.** Health is what makes the
expensive half of the roster reachable — 80% of duels reach 10 mana at the
current total, and cutting it deletes the 9 and 10-mana cards from live play
without deleting them from the deck. If duel length is ever genuinely a problem,
the trigger is the owner saying a duel felt long, and the lever is the mana ramp,
not the health bar. The reasoning is in `DEFAULT_STARTING_HEALTH`'s comment.


Card cost is a fiction and canon assignment, not a balancing lever. Change stats, effect magnitude, timing, keywords, or global pacing instead.

Re-measure before every tuning pass as well as after one. A rules change invalidates the outlier list you were about to tune from, a previous buff can have overshot into the roster's next worst outlier, and a bot-valuation change moves every balance number at once. Raising the opening hand from 1/2 cards to 2/3 to fix dead openings (20.7% down to 13.0%) produced an outlier list materially different from the one measured before it: different cards, different sizes. Every tuning pass is a rules change to the next one.

Balance checks must report inadequate samples, unset thresholds, disabled checks, and missing results as a skip or failure, never as a silent pass. A verdict line has to read `PASS WITH 4 SKIPPED` rather than `PASS`, because a summary that folds skips into passes is a false coverage report, which is worse than no check at all.

The card-level numbers quoted in the four subsections below were measured on 2026-07-30, on the 175-card roster at 76 starting core, over 1500 bot-versus-bot duels. Re-measure before quoting any of them again. Ladder and turn-time numbers carry their own dates in their own sections.

### Choosing a pacing lever

**When a pacing problem has two levers, take the one the player never feels.** A resource curve is felt every single turn; a core-health total is felt once, at a glance, and then never thought about again. Convergence needed its expensive half of the roster to become reachable, and the clever fix — accelerating the mana ramp to 1.35 per turn — produced the sequence 1, 2, 4, 5, 6, 8, 9, 10, silently skipping 3 and 7. Every card costed at 3 or 7 then had no turn where it was on curve: two whole cost tiers deleted, invisibly. Raising starting core health from 48 to 76 with a plain +1 ramp bought the same access (80% of duels reaching maximum mana against 82%) with fewer blowouts and fuller boards. No major card game skips resource values, because players build a per-turn rhythm on it.

**Sweep dials in a grid and read the table; do not reason about them.** The first instinct here, "raise health so matches last longer", was measured and found nearly useless on its own: 30 to 52 core health moved the median only from 15 to 18 turns, because bigger boards deal more damage in step with the extra health. The grid is what made the real answer obvious.

**A pacing change is never balance-neutral.** Any Ongoing effect is worth turns alive times effect magnitude, so stretching the median duel by a third makes every one of them roughly a third stronger. The first tuning pass held for 20 of 24 cards across a pacing change, and the four that broke loose were all per-turn engines.

### Reading the measured numbers

- **Judge a card inside its own cost tier, never against the roster average.** Cheap cards get played more often, so a flat comparison reads "cheap" as "overpowered" and points the whole pass backwards. Score each card as a z-score within its mana tier.
- **Play rate and win rate answer different questions.** A card drawn 327 times and played twice is invisible to win rate, and it is the more serious defect.
- **Anything the bot cannot value is unmeasured, not balanced.** `scoreState` prices Passive and Ongoing minions as a class through `ENGINE_PREMIUM` but cannot tell a strong engine from a weak one, and its only card-flow term is hand length, so a draw engine is worth nothing to it and a targeted discard scores the same as a random one. Seven of nineteen outliers in one pass were the bot's blindness rather than the card's power. Two usable consequences: a card the bot under-values that is winning anyway is stronger than measured and safe to nerf, and a card whose whole effect is invisible to the bot cannot be tuned from these numbers at all. Write that caveat next to the number, not in your head.
- **A high play rate with a low win rate means the card is being used and failing**, which is precisely when the body is the wrong lever. A 2-cost minion measured at 34% was buffed from 1/2 to 1/5 and came back at 33.6%, unmoved: its keyword made it unable to attack and it had no Taunt, so nothing obliged the enemy to attack it either. Its ATK was decoration and its HP defended nothing. Read the keyword's implementation, not its flavour, before changing a number.
- **Count every outcome you exclude.** A draw is not a win, not a loss, not a stall and not a soft-lock, so it drops out of the coin-flip, ladder, and snowball denominators at once. The game could start ending in draws half the time and every published rate would still look normal, just measured on a smaller sample nobody mentioned. Give each exclusion its own counter and its own threshold, and print the excluded count beside the rate it shrank.
- **Ask "who is ahead" with more than one number before building a snowball metric on it.** The turn-5 health leader wins only 58%, because the player on more health that early is often simply the one who has not committed to an attack yet. Board strength alone gives 56%. The player ahead on both at once gives 59.5%, which is also what a human would call being ahead.

### Gating on the game, not on the harness

- **Pair self-play with a fuzzer over random legal actions, asserting invariants after every action**: no crash, no NaN or negative stat, no duplicate instance, no unserialisable save, and above all no state where the duel is unfinished but offers zero legal moves. That last one is the soft-lock class a human playtest takes dozens of hours to stumble into.
- **Split every metric by driver.** A fuzzer driving both seats with random legal moves will miss a turn cap honestly; that is the random driver's property, not a defect in the game. The gate went red on its first real run for exactly this: bot play stalled 0 times in 1500 duels while the fuzzer stalled once. Gate the bot-play number and print the fuzzer's beside it, ungated. Soft-locks are the opposite case and stay summed, because a legal-action dead end found under random play is a real dead end.
- **Size each comparison's sample by its own margin, not uniformly.** Cost and need are usually inverted. The two ladder matchups involving the Ascendant cost roughly eight times as much per duel and had 20-point margins needing about 80 duels; the cheap matchup had a 9-point margin and needed 200. A flat 200 across all three took 16 minutes and bought nothing over the 7 that per-matchup sizing takes. Work out the false-red probability per comparison, `z = (floor - measured) / se`, and spend duels where that number is uncomfortable.
- **A per-card before-and-after diff is mostly noise unless the noise floor is printed beside every number.** A card played in about 130 duels carries roughly 4.4 points of shuffle noise on its win rate, and the difference between two runs carries about 6, so "this card is down 8 since the nerf" is barely a signal and a table of 112 such rows is a machine for chasing ghosts. Compute each delta's own standard error, list only what exceeds it, and count the rest as noise rather than showing it. Replay the same seed list before and after, and refuse to compare runs whose size, seeds, skill, or dials differ at all. Buffing one card from 1/1 to 9/9 proved the method: the diff named that card at +36.8 against a 13.1 floor and correctly dismissed 111 other cards that had moved by less. The same pairing argument in its stronger form is in [Comparing two ladder runs](#comparing-two-ladder-runs).

### The engine premium, and why it is 22

**`ENGINE_PREMIUM` in `bot.ts` was raised from 14 to 22 on 2 September 2026**, on
the owner's instruction, after a reported duel in which the bot killed a vanilla
Knight and left two Passive minions standing.

That was the arithmetic working exactly as written rather than a bug. Face damage
is worth about 3.6 points per point of ATK in this evaluation, so at 14 the
premium only beat a swing at the core for attackers of roughly 5 ATK and under —
and the swing in that duel was bigger. At 22, a 6-ATK attacker scores about 26
for killing a small engine against 21.6 for the core, so it trades; an 8-ATK one
still races at 28.8, which is deliberate and is the same shape the number has
always had.

**Not measured against the harness**, because the harness is not run without being
asked. This is a stated trade, not a proven one. `src/engine/bot-engine-priority.test.ts`
pins the behaviour instead: four hand-built boards, each with one attacker and a
clear choice, including the counterweight that the bot must NOT walk into an
engine it cannot kill.

### Fixing a bot-valuation blind spot

**Price a deterrent on the attacker, never on the defender.** A minion whose text punishes whoever attacks it — a permanent disarm, a freeze, a damage reflection, a forced discard — does not become harder to kill; it makes killing it expensive, and that expense already lands on the attacker where the evaluation can see it. Adding a matching bonus to the defender's own value looks like the bot finally respecting the card and does the opposite, because a more valuable enemy is a more attractive target, so the bot walks into it harder. A permanent-disarm minion was scored at +3.5 here and the premium almost exactly cancelled the attacker's own penalty. Fix the consequence instead: the disarm is irreversible, so it must cancel the attacker's whole ATK term rather than shave half of it. Model a threat once, on the side that actually pays it.

**When you fix a blind spot, plant the old evaluation back and watch the new tests fail.** Two of the three "proofs" written for that change turned out to be decoration. In one, the bot correctly ignored both options because it attacked the core instead; in another, the forced move was never a choice at all, because the trap minion had Taunt. Both looked like passes until the old scoring was restored. Every discriminating test needs the alternative to be genuinely available and genuinely attractive: block the core, give both candidates the same body, and change exactly one property.

### Why the bot trades into Passive and Ongoing minions

**The old bot was reported as attacking the core with practically every swing,
and its own arithmetic was the reason.** Face damage is worth about 3.6 points per point of ATK to `scoreState`
— 2.2 from the health difference and 1.4 from the progress-toward-winning term —
while a whole 4/4 body is worth 9.2. The evaluation was therefore stating,
correctly by its own numbers, that three points of core damage beat killing an
equal minion. No amount of extra search fixes that; the verdict was in the
scoring, not in the depth.

**The fix is a large premium on minions that keep paying, and only on those.**
`ENGINE_PREMIUM` in `source/src/engine/bot.ts` adds 14 points to any minion whose
effect is Passive or Ongoing and is currently live. The distinction it draws is
about which threats expire:

| Card property | What it costs the opponent | Priced here? |
|---|---|---|
| Passive, Ongoing | Collects again every turn nobody answers it | **Yes, +14** |
| Battlecry | Already paid out before the minion sat down | No |
| Deathrattle | Pays once, and killing it is what triggers it | No |
| Taunt, Divine Shield | A one-time toll the attacker pays and is done with | No |

Only the first row gets better for its owner by being left alone, which is why
only the first row is worth spending a body to remove.

The premium is **symmetric**: it is also what stops the bot throwing its own
engine into a pointless attack. The README's warning in
[Fixing a bot-valuation blind spot](#fixing-a-bot-valuation-blind-spot) about
pricing a threat on the wrong side does not apply, because that warning is about
*deterrents*, which punish the attacker. An engine punishes the **defender** for
leaving it alone, so the defender's own value is the correct place for it.

It is also switched off by the game's own answers. A **Silenced** or **Chained**
engine earns nothing, which is how the bot learns that silencing an engine is
nearly as good as killing it.

What 14 actually buys, for a 4-ATK attacker: killing a 2/2 engine and surviving
scores about 17 against the core's 14.4, so it trades. Killing a vanilla 2/2
scores 3.3, so it does not. An 8-ATK minion still races, because 28.8 of face is
genuinely worth more than one small engine. **The intended shape is "often, not
always"** — it answers engines, it does not stop attacking cores.

`source/src/engine/bot-trading.test.ts` holds the paired proofs. Every case there
is two boards differing in exactly one property, because "the bot attacked the
minion" on its own proves nothing.

**The skill ORDERING is not in the test suite, and must not be put back there.**
A test that played 16 Ascendant-versus-Recruit duels and asserted the Ascendant
won more than half was deleted on 2026-08-22. It cost 117.6 seconds, more than
three times the whole rest of the suite, and it was wrong twice over: a win rate
is a balance measurement rather than an engine property, and sixteen duels
cannot carry the claim. Against an Ascendant broken all the way down to a coin
flip, the binomial says that test still passed 40% of the time; at a true 60% it
passed 72% of the time. It waved through the exact failure it existed to catch.

Skill ordering is gated where the samples are sized for it, in
[The cheat ladder](#the-cheat-ladder)'s three matchups under `npm run sim --
--full`. The part of the claim that IS engine logic — that searching a whole
turn finds turns the greedy line never builds — stays covered by
`source/src/engine/bot-cheats.test.ts`, whose whole file runs in under ten
seconds.

**What it cost, measured 2026-08-22.** 200 self-play duels at Veteran, the same
seed list before and after, nothing else changed:

| | Old evaluation | With `ENGINE_PREMIUM` |
|---|---|---|
| Median duel length | 23 turns | 25 turns |
| Blowouts — winner ends on 80%+ core | 5% | 11% |
| First player wins | 54.5% | 56.5% |
| Dead openings through own turn 3 | 16.3% | 16% |
| Soft-locks, stalls, invariant breaches | 0 | 0 |
| Cards standing clear of their cost tier | none | none |

The full gate ran with the ladder on the same day and came back **9 of 11 green,
2 skipped for sample size**: hard beats easy 85%, hard beats normal 86%, normal
beats easy 65.5%, every one of them clear of its floor. Those three numbers sit
below the 2026-08-17 figures quoted in [The cheat ladder](#the-cheat-ladder),
and that gap is NOT evidence of anything on its own — the runs are not paired.
Use `--ladder-compare` against the stamped baseline before reading a skill
regression into it.

**Read the blowout row before touching the number.** A trading bot ends duels on
a board advantage rather than a mutual race, so the winner finishes healthier.
Six points on 200 duels is roughly two standard errors — real, but thin, and it
should be re-measured on a larger sample before anyone tunes against it.

Also measured: 12 and 14 are indistinguishable on every row above, so the size of
the premium is not what moved the blowout rate — the trading behaviour is. Pick
the number for which trades you want the bot to take, not to chase a metric.

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

**The budget is 10 seconds for a whole enemy turn**, raised from 8 on 2026-08-20 (and from 5 on
2026-08-18). The raise is a decision, not a measurement: at 8 seconds about one turn in nine was over
budget, the owner does not find those turns annoying in play, and the alternative was spending real
effort chasing a tail nobody minds. **The long-turn tail is no longer a finding.** Do not reopen it as
one; if it is ever worth fixing again, the trigger is the owner saying a turn felt slow, not a
percentage. Check any bot change against that number, and measure a whole TURN rather than a move: a turn is five or six moves, and `BOT_DELAY_MS` (620 ms) sits between each one, so roughly 3.7 seconds of every turn is a deliberate pause with no thinking in it at all.

Two deterministic cost cuts keep the beam affordable: `DEEP_LINES` limits how many built turns get the expensive opponent-reply search, and `BEAM_BUDGET` narrows the beam on crowded boards.

Measured 2026-08-18 on a confirmed-idle machine, 56 Ascendant turns across five duels:

These figures were taken while the budget was 8 seconds, so the last column counts against 8 and not
against the current 10. They are left as measured rather than recomputed, because a measurement edited
to match a later decision is no longer a measurement.

| Dials | Median turn | p90 | Worst | Over 8 s |
|---|---|---|---|---|
| deep 4, branch 3, budget 110 | 3.81 s | 9.01 s | 14.10 s | 11% |
| **deep 5, branch 3, budget 110 (shipped)** | **3.41 s** | **9.39 s** | **14.15 s** | **11%** |
| deep 6, branch 4, budget 80 | 3.91 s | 10.79 s | 17.88 s | 16% |

The first step up is free and the second is not, which is why the shipped value is 5. It is also worth nothing: a paired ladder A/B of 4 against 5 moved both Ascendant matchups by +1.0 at p=1.000, with only three and five duels in a hundred changing at all.

Also worth knowing: tightening `BEAM_BUDGET` to curb the slow turns made them *worse*. The slowest turns are the LONG ones — many moves, each paying full search — not the crowded ones, and no dial here caps a turn's move count. The tail is not currently reachable by tuning.

**Do not read a bigger search number as a stronger opponent.** Three separate deepenings of this search have now measured as zero: the cheats, the beam, and this dial. The limit is not how far the bot looks, it is what `scoreState` can see — it counts a hand by length, cannot value a passive effect, and rates a draw engine at nothing. Fix the judgement before buying more search.

### Bot and balance work is PARKED, not finished

**Owner decision, 20 August 2026: do not start bot or fine-balance work.** It is retired for now, not
abandoned, and it may come back if this game is ever put in front of a larger audience.

The reasoning is his and it is worth keeping, because it is the thing that makes the rest of this
section safe to leave alone. Chasing a first-player rate of 57% toward 50%, or a per-card outlier from
+17 toward its tier mean, only matters when enough people play that the difference is visible to
anyone. One person and a few friends is not that. Until it is, the cost is real and the benefit is
theoretical: `npm run check:balance` is 1 hour 40 minutes, roughly 91% of it the Ascendant ladder, and
by its own maths it cannot resolve a change smaller than about four points.

So the standing instruction for a new session is: **do not propose the per-card value table, Insight,
or another search dial as outstanding work.** They are on the shelf deliberately. What is still fair
game is anything a PLAYER would notice — a card that does nothing, a rule that reads wrong, a bug.

The apparatus itself stays exactly where it is. Nothing in this section is deleted, because parking
work is not the same as throwing away the means to resume it, and the traps documented here (the
shared ladder file, the paired comparison, timing on a busy machine) cost real time to learn.

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

### The skill ladder needs explicit permission, every single time

**Never run the skill ladder unless the owner explicitly authorises it, by any route.** The ladder is what makes this expensive, so the rule binds to the ladder and not to one command's name. All of these are the same forbidden thing:

```
npm run check:balance
npm run sim -- --full
npm run sim -- --ladder
npx tsx scripts/simulate.ts --full            # any --games value
npx tsx scripts/simulate.ts --ladder          # any --ladder-games value
```

**Shrinking `--games` does not make it cheap, and this exact mistake has been made.** A session read the older wording as naming only the npm script, ran `npx tsx scripts/simulate.ts --full --games 200` believing the small sample made it a focused check, and spent about seventy minutes of the owner's machine on it without being asked. `--games` sizes the self-play half only. The ladder takes its own per-matchup sample from `balance.config.json`, so it runs at full size regardless, and it is roughly 91% of the total cost.

A request described as “a balance pass,” even when it lists card changes, is not authorisation. Neither is a bot-valuation change — which is precisely the case that feels most like it needs the ladder, and is therefore the case most likely to talk a session into running it unasked. Ask, and say what the ladder would answer that the cheap run cannot.

**What you may run without asking is the cheap half: `npm run sim` on its own.** It skips the ladder and reports those three checks as SKIP, which is honest rather than green. At 200 duels it costs about two minutes and still answers soft-locks, stalls, invariant breaches, draws, duel length, dead openings, the snowball rate, and per-card outliers. That is the right tool for one changed card and for one changed valuation term. Focused tests and `npm run validate:data` come first, before even that.

The observed full run at the 1,000-duel cap, measured on 18 August 2026, took **1 hour 40 minutes** wall-clock. Self-play was 506 seconds and fuzz 31 seconds; the Ascendant ladder was the remaining **91 minutes, about 91% of the run**. The earlier estimate of roughly ten minutes came from a 1,500-duel run that took 11 minutes 28.2 seconds before the Ascendant searched whole turns, and it is no longer close.

Treat that as a planning fact, not a footnote. A measurement nobody can afford to run twice cannot be tuned against, because tuning needs a before and an after, so the ladder's cost is now the thing standing between this project and its next balance pass. Anything that cuts Ascendant search cost buys back most of this run.

### Replaying a failure the harness found

Every duel is seeded, so any failure the gate reports can be played back exactly.

```bash
npm run sim -- --replay sim-308                              # a self-play stall
npm run sim -- --replay sim-fuzz-46 --drivers random,bot     # a fuzz invariant breach
npx tsx scripts/find-duplicate-instance.mts sim-fuzz-46 random,bot   # name the ACTION that broke it
```

`--replay` tells you a duel went wrong; `find-duplicate-instance.mts` tells you which action did it. It
walks the same duel one action at a time and stops at the first duplicated instance, printing the
action, the events it produced, and both slots. That is what turned "1 invariant breach" into "Knov's
pocket room releases one minion twice" in a single run.

**A fuzz duel needs its `--drivers` pair or it is a different duel.** The fuzz phase rotates random/random, bot/random, random/bot and bot/bot, and `--replay` defaults to bot/bot because self-play duels are bot-vs-bot. Replaying a fuzz seed without its drivers runs a duel that never had the bug and prints `no invariant ever broke in this duel`, which reads exactly like the defect being fixed. The fuzz summary prints the whole command beside each distinct breach; copy it rather than retyping the seed alone.

Do not make the simulated rules, bot skill, or turn timing “10× faster” by simplifying them: that would measure a different game. Safe implementation optimisations may reuse already-computed legal actions and candidate results, and independent duels may eventually run across CPU workers if deterministic output and result ordering are preserved. The current harness applies the safe reuse optimisation; the Ascendant ladder remains the unavoidable dominant cost because it searches whole turns.

## Contributing

Contributions are welcome through a fork and pull request. Keep each change focused, explain the player-visible result, and run the relevant checks before proposing it.

- **Visual and UI changes require browser proof.** Run the real browser and capture and inspect screenshots at every affected desktop and mobile viewport. When browser zoom changes CSS dimensions, verify the exact effective viewport, not only the nominal window size.

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
- Balance and pacing lessons live in [Balance, pacing, and bot](#balance-pacing-and-bot) with the measurements behind them: re-measure before a pass as well as after, tune the lever that actually controls the behaviour, and treat anything the bot cannot value as unmeasured.
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
- TIE Fighter token art: owner-supplied `source/public/card-art/raw/token-tie-fighter.webp`.
- Morgott token art: owner-supplied `source/public/card-art/raw/token-morgott.webp`.
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
