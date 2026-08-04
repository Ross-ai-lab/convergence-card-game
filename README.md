# Convergence

Convergence is a free, fan-made browser card duel where 175 characters and forces from fiction collide in one shared deck. Play alone against three opponent levels or share one screen for a hotseat duel.

## Play

[Open the public Convergence page](https://ross-ai-lab.github.io/convergence-card-game/)

No installation or account is required. A modern desktop browser is recommended.

The homepage and game show the same public **played this game** total. Opening the game registers a browser once using a local browser marker; the counter service stores only the aggregate number, not names or visitor records.

## Quick rules

- Both cores begin at 76 health. Reduce the opposing core to zero to win.
- At the start of your turn, draw a card. Your mana refills and increases by one.
- Play a card from your hand into one of your five empty board slots.
- A minion rests on the turn it enters play. From the following turn, it can attack once per turn unless its card says otherwise.
- Combat is simultaneous: the attacking minion and defending minion damage each other.
- Battlecries that affect a particular card or minion ask you to choose the target. Effects that explicitly say random, opposing slot, weakest, costliest, or similar resolve automatically.
- Taunt must be dealt with before the opposing core can be attacked.
- Both players draw from the same deck.

## Controls

- Click or drag a hand card onto an empty slot to play it.
- Click or drag a ready minion onto an enemy minion or the enemy core to attack.
- Space ends the turn.
- Z undoes the last local action.
- Escape clears the current selection.
- The Settings menu contains sound controls, opponent difficulty and an Infinite Mana sandbox switch.

The game also has a complete **How to play** panel on its opening screen.

## Edit or contribute

The repository now includes the [complete editable game source](source/) with all runtime card art, fonts, music, sound effects, voice clips, game data, computer opponents, and automated tests needed to run and build it on another computer.

Start with the [source setup and project map](source/README.md). To propose a change without collaborator access, follow the [fork and pull-request guide](CONTRIBUTING.md). A public visitor can edit their own fork and submit a proposal, but cannot alter this repository or the live game unless the owner reviews and accepts it.

## Repository map

- `source/` is the only editable game codebase.
- `play/` is the built copy served by GitHub Pages; do not hand-edit it.
- `materials/` contains the lore, card workbook, raw art, card-render pipeline, and production tooling.
- `docs/` contains the project road map and voice-cast reference.
- `counter/` contains the small aggregate player-counter service.
- `release-assets/` is the ignored local staging area for large files published through GitHub Releases.

The repository root is the single Convergence project home. `materials/local-production/` includes the public production tools and instructions. Its full-size audio and rendered card libraries are distributed as release downloads so a normal clone stays practical. Everything required to clone, run, edit, test, and build the browser game remains in the repository.

## Included project materials

- [Official lore and roster guide](https://ross-ai-lab.github.io/convergence-card-game/materials/Convergence-Official-Lore.html)
- [Card statistics workbook](materials/Convergence%20card%20stat%20excel%20sheet.xlsx)
- [Card rendering pipeline](https://github.com/Ross-ai-lab/convergence-card-game/tree/main/materials/card-render-pipeline)
- [Raw card artwork](https://github.com/Ross-ai-lab/convergence-card-game/tree/main/materials/raw-card-art)
- [Original audio-track collection](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Audio-Tracks.7z)
- [Rendered card-production library](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Card-Production.7z)
- [Production tools and setup](materials/local-production/)
- [Project road map](docs/Convergence%20Browser%20Game%20Roadmap.html)
- [Voice-cast reference](docs/Convergence%20Voice%20Cast.html)
- [Complete editable game source](source/)
- [Contribution guide](CONTRIBUTING.md)

The original audio collection and rendered card-production library are supplied as separate release downloads because they are large binary working assets rather than runtime dependencies.

## Fan-project notice

Convergence is a non-commercial fan project made for private play and educational experimentation. Character names, franchises, imagery and music remain the property of their respective rights holders. This project is not endorsed by or affiliated with those rights holders.
