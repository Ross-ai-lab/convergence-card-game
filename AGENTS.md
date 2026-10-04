# Convergence agent instructions

Convergence is a React and TypeScript browser card game. These instructions apply only to this repository.
Follow the current user request and applicable workspace instructions. Read only the sections relevant to the task.

## Working scope

- Work directly in the existing checkout. Do not create branches or worktrees.
- Implement the authorized request completely; ask before adding work outside its subject.
- Do not change card costs, effects, bot strength or pacing during unrelated interface or documentation work.
- Keep owner reports in plain language. Operate the tools yourself instead of asking the owner to run commands.
- Preserve real browser progress and ongoing duels. Use isolated test contexts and deliberate save migrations.

## Find the right entry point

| Task | Source | Focused verification |
|---|---|---|
| Card text, stats or rarity | [cards.csv](source/data/cards.csv), [relics.csv](source/data/relics.csv), [game.ts](source/src/engine/game.ts) | Relevant engine test and `validate:data` |
| Keywords and token inspection | [keywords.ts](source/src/keywords.ts), [App.tsx](source/src/App.tsx), [tokens.ts](source/src/engine/tokens.ts) | The affected card and popup in the gallery |
| Duel, deck editor or profiles | [App.tsx](source/src/App.tsx), [App.css](source/src/App.css), [gallery-detail.css](source/src/gallery-detail.css) | The actual affected screen and interaction |
| Phone layout | [mobile.css](source/src/mobile.css), [phone-layout.ts](source/src/phone-layout.ts) | Only the relevant size and orientation |
| Campaign and rewards | [campaign-design.json](materials/campaign-design.json), [campaign.ts](source/src/campaign.ts), [progress.ts](source/src/progress.ts) | Relevant campaign/progression tests |
| Saves and turn expiry | [storage.ts](source/src/storage.ts), [turn-clock.tsx](source/src/turn-clock.tsx) | Existing-save migration or timeout tests |
| Art or audio | [art library](source/public/card-art/raw/), [sfx.ts](source/src/audio/sfx.ts), [card-theme-policy.ts](source/src/audio/card-theme-policy.ts) | Changed asset, routing or playback |
| Documentation | [README](README.md), [CONTRIBUTING](CONTRIBUTING.md), [DESIGN-DECISIONS](DESIGN-DECISIONS.md) | Documentation links and affected source claims |

## Sources and generated outputs

The CSV rosters, campaign JSON and engine are the game authorities.
Edit source files and regenerate their derived outputs; do not hand-edit [play/](play/), [lore.ts](source/src/data/lore.ts), [gallery-previews.ts](source/src/data/gallery-previews.ts) or the statistics workbook.

Keep each documentation rule in its appropriate page. README explains the game, CONTRIBUTING explains the workflow, and DESIGN-DECISIONS records accepted choices.
[CLAUDE.md](CLAUDE.md) only redirects here. Markdown is allowed throughout this project.

## Verification and completion

Follow [Choosing checks](CONTRIBUTING.md#choosing-checks). Select checks for the actual change instead of automatically running the full suite.
A new nontrivial card effect needs a meaningful behaviour test; a simple wording edit does not need an implementation-mirroring test.

For a visible change, inspect the actual rendered result at its intended size. Build the real state that exposes the issue.
Treat hidden-pane geometry as useful evidence, but do not call it visual verification.

For a playable release, use [Publishing](CONTRIBUTING.md#publishing), preserve recoverable finished work, and confirm the deployed version before reporting it live.
Document-only changes do not need game, phone, tablet, audio or balance suites unless they change a related contract.
