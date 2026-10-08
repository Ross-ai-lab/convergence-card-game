# Game design decisions

The choices that define Convergence and explain its technical boundaries.
Update a decision when an accepted change alters it. Record the reason and practical consequence, not every routine implementation detail.
Current user instructions take precedence over earlier decisions.

## Lore sets mana; combat sets the rest

Mana expresses a subject's capabilities in its own fiction, using the Basic reference ladder.
Attack, health and effects describe its role in a duel. A balance change should not silently redefine a character's lore tier.
Star Chart attributes describe the character; they are not additional combat stats.

## One rules engine for humans and bots

The deterministic engine owns legal actions, targeting, effects, combat and seeded randomness.
The UI expresses intent through actions instead of implementing a second version of a card effect.
The bot uses the same legal actions; its difficulty changes how it searches and what campaign information it may know.

Search runs through [the bot worker](source/src/engine/bot.worker.ts) to keep it off the interface thread.
An animation or sound cannot decide a combat result.

## Campaign difficulty is explicit

Every universe stays selectable. Later champions receive stronger search and, in the last group, more information.
[campaign-design.json](materials/campaign-design.json) defines the schedule, boss decks and fixed rewards.

| Universes | Difficulty profile |
|---|---|
| 1–4 | Recruit |
| 5–10 | Veteran |
| 11–14 | Ascendant search with cheats disabled |
| 15–20 | Full Ascendant with reply-reading, true-dice knowledge, Clairvoyance and Foresight |

## Separate decks, complete library

Each seat owns its draw and bottom piles. Hotseat privacy hides the other player's hand.
The full card library stays available to the engine even when a deck or collection is restricted.
Bosses, summoned tokens, copies and saved bodies may reference cards outside the player's collection.

## One shared Core limit

[STARTING_CORE](source/src/engine/game.ts) supplies the starting health and healing ceiling for every ordinary mode.
Campaign bosses derive their limit from it, and health bars scale against it.
Keeping these values together prevents a number change from leaving one mode, heal or visual bar behind.
The current player-facing rules remain in [README](README.md#rules-at-a-glance).

## Temporary auras stay temporary

Auras record their source and contribution. Their benefits disappear when that source stops applying.
Bonus health absorbs damage before underlying health, so removing a damaged bonus does not kill an otherwise surviving minion.
A minion with both Taunt and Divine Shield counts once for effects that count either kind of defender.
Permanent growth and effects that overwrite stats use their own explicit rules.

## One complete card face

Cards are live DOM, with printed rules, stats and conditions supplied by game state.
The same face serves the hand, board, gallery, profile and preview. Small cards retain their description and shape.
Artwork is independent of the frame, so a text, rarity or live-stat change cannot leave an obsolete baked card image behind.

## Spend rendering work where the player looks

The title screen does not decode the full collection or dormant campaign recordings.
The gallery loads a small preview module when opened, brings full artwork in near the visible area and uses static frames.
Decoded images stay mounted while scrolling. Shared sizing avoids measuring every card separately.
These choices preserve complete readable cards while avoiding empty artwork panels and unnecessary paint work.

Live bodies retain their decoded face through hits, deaths, returns and stasis. Motion wrappers change without rebuilding the card, and a dying wrapper keeps the living one's layout mode, so a board wipe never lays every card out again. Hand cards are keyed by card and copy, never by position, so playing one card leaves the rest of the hand untouched.
The duel retains a bounded set of compositor surfaces; the gallery does not promote the entire collection into graphics layers.
Only visible card fields invalidate a face. Engine bookkeeping and copied passive arrays do not repaint unchanged artwork or text.
Music loop preparation runs in its own worker, with a yielding compatibility path. Concurrent warm-up and playback requests share one theme fetch and decode. Finished synthesized voices disconnect their temporary audio nodes.
The bot worker receives the immutable roster once and reuses it. Engine copies retain immutable primitive values while independently copying every mutable record and array; aliases stay intact, and unexpected payload types use a native graph copy. Search depth, difficulty and deterministic decisions remain unchanged.

The card's design unit `--u` is a registered length, declared on the card's children. It is computed once per card instead of being re-resolved inside every `calc()` of every element whenever a card restyles.
Effects animate transform and opacity only, so the compositor runs them while the main thread is busy. A ring scales with a constant border; a flash or pulse is its own light layer that fades.
One action starts at most 96 particles. Hits, summons and two-minion trades stay below that; a board-wide clear thins every burst evenly instead of creating two hundred elements in one frame.
A moving layer never carries its own blur. Filters and shadows sit on a still child, so they are drawn once and the layer only moves; the title's floating cards and the drag ghost follow this.
Dragging and aiming keep the pointer outside React. The drag ghost and targeting arrow follow a frame-coalesced pointer store; the duel itself does not re-render while the pointer moves.
While something follows the pointer, every display frame runs the main thread and Chrome restyles each running animation on it. The board's rarity shine pauses for that moment and resumes where it stopped; the held card keeps its own.
An opaque screen skips rendering what it covers. My Deck hides the title screen's floating cards instead of keeping their layers alive under the collection.

## Saves preserve a whole transaction

An ongoing duel includes pending targets, queues, decks and turn state. Progression retains unacknowledged dialogue and rewards.
A first victory awards its fixed reward once and does not rewrite the player's chosen deck.
Migrations preserve earned content and preferences; they do not reset progress to avoid a compatibility problem.
Serialization is coalesced into idle time, with a 200 ms deadline. Leaving or hiding the page flushes the newest complete duel and clock.
Clearing a duel cancels its pending write so an old action cannot restore a finished match.
Named decks retain independent card lists and their selected Hero Power. Edits save automatically to the selected name, initially Starter Deck. Creating a deck starts empty and never replaces an existing name; an incomplete deck cannot start a duel until it reaches thirty cards. Legacy unnamed and unsaved drafts migrate without losing cards. Hotseat seats keep separate named decks by default.
Browser storage is local to the device and origin. There is no account synchronization.

## A static release with relative assets

[source/](source/) is editable; [play/](play/) is its generated browser release.
The game runs below the repository's Pages path, so runtime URLs use [asset-url.ts](source/src/engine/asset-url.ts) and the configured base.
The artwork folder is one maintained WebP library. A replacement can use a new filename to avoid stale cached art.
Story text remains usable when its audio cannot load. Legendary and Mythic minion music follows the tier policy while stored lower-tier tracks remain available for future tier changes.

## Engine contracts

- `applyAction(state, action, library)` returns state, events, and legal actions. Illegal actions leave state unchanged.
- All engine randomness comes from state and its seeded generator. Never use `Math.random()` in the engine.
- Each player owns their draw pile and bottom pile. Draw, mulligan, fatigue, and deck-reading powers must use the correct seat.
- The library contains the full roster, even when the current deck or collection is restricted. Saved games, tokens, copied cards, and opponents can refer to cards outside the player's unlocked collection.
- Targeting is a saved engine phase. Humans and bots use the same prompts; UI code must not invent an automatic target for a specific effect.
- Live auras use reversible source tracking. Remove their contributions when the source dies, leaves, is chained, or is silenced; never convert a Passive aura into a permanent buff.
- Copyable powers are read through `hasEffect`, including granted Passive and Ongoing effects. Recompute borrowed powers from printed sources rather than copying a borrowed copy.
- All core damage goes through `dealCoreDamage`, including fatigue and card effects, so core shields apply consistently.
- Timed states clear when they expire. Their attack, targeting, effect, and visual windows must agree.
- Use `applyChain` for two-turn chaining; its internal counter includes the start-of-turn decrement. A minion arriving chained uses the corresponding arrival counter.
- Slot auras belong to positions. Movement and replacement preserve the intended slot rule and visible markers.
- Relics remain equipment instances with two independent slots. Returning a minion discards its relics unless an explicit printed exception applies.
- Changes to saved object shapes require a `SAVE_VERSION` change and validation updates. Extend progression migrations without losing earned cards or sound preferences.

## Documentation has clear jobs

- [README](README.md): what the game is, how to play and where to go next.
- [AGENTS](AGENTS.md): instructions and task routing for AI agents.
- [CONTRIBUTING](CONTRIBUTING.md): setup, focused verification, asset work and publishing.
- This page: accepted game and technical decisions with their reasons.
- [CLAUDE](CLAUDE.md): a redirect to the shared agent instructions.

Additional Markdown is allowed. Keep a subject in one maintained place and link to it from the other pages.
