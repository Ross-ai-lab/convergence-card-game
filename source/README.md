# Convergence editable source

This folder contains the complete runnable source for the Convergence browser card game. It includes the React interface, deterministic game engine, card and relic data, computer opponents, tests, card art, fonts, music, sound effects, and voice clips needed by the game.

The repository's `play/` folder is the already-built copy used by GitHub Pages. Make changes here in `source/`; after review, the maintainer can build and copy the new production output into `play/`.

## Run it locally

Install [Node.js](https://nodejs.org/) 22.12 or newer, then run:

```bash
git clone https://github.com/Ross-ai-lab/convergence-card-game.git
cd convergence-card-game/source
npm ci
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173/`.

For the browser-based visual and audio checks, install Playwright's Chromium once:

```bash
npx playwright install chromium
```

No secret keys, private folders, databases, or paid services are required to run, edit, test, or build the game.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the editable development version |
| `npm test` | Run the automated engine and component tests |
| `npm run validate:data` | Check card and relic CSV data and linked assets |
| `npm run build` | Type-check and make a production build in `dist/` |
| `npm run sim -- --games 100` | Run a small bot and rules simulation |
| `npm run check:balance` | Run the full balance gate; this is intentionally much slower |
| `npm run check:ui -- http://localhost:5173` | Check important browser flows while the development server is running |
| `npm run check:audio -- http://localhost:5173` | Verify that the browser audio graph emits sound |
| `npm run shoot -- http://localhost:5173` | Save reference screenshots under `.preview/` |

To build with relative asset paths, useful for a subfolder deployment such as GitHub Pages:

```bash
npm run build -- --base=./
```

## Project map

| Path | What it contains |
| --- | --- |
| `data/cards.csv` | The full minion roster and card stats/effect text |
| `data/relics.csv` | Relic definitions |
| `data/announcer.csv` and `data/voicelines.csv` | Audio cue mappings |
| `src/engine/` | Game state, legal actions, combat, targeting, relics, and computer opponents |
| `src/data/cards.ts` | CSV loading and public asset URL resolution |
| `src/App.tsx` | Main interaction layer and game board |
| `src/screens/` | Title, rules, and supporting screens |
| `src/audio/` | Music, sound-effect, and voice playback code |
| `src/*.css` | Visual styling and board effects |
| `public/card-art/` | Runtime card images |
| `public/audio/` | Runtime music, sound effects, stings, and voice clips |
| `public/fonts/` | Bundled fonts |
| `scripts/` | Data validation, simulation, balance, visual, and audio checks |
| `design-reference/` | Visual reference material used while developing the interface |

Additional creation materials live one level above this folder in `materials/`: the official lore, statistics workbook, raw card artwork, and card-render pipeline. The original high-resolution audio-track collection is a separate GitHub Release download because it is too large for GitHub Pages.

## Common edits

### Change a card

Edit the card's row in `data/cards.csv`. Card IDs connect each row to its image and audio assets. Run `npm run validate:data` and `npm test` afterward.

Card mana costs are intentionally treated as fixed design anchors. If changing balance, prefer attack, health, or effect strength unless a deliberate design decision says otherwise. Keep the visible effect text and the implemented behavior in agreement.

### Change an effect or targeting rule

Start in `src/engine/game.ts` and the related tests in `src/engine/`. Specific battlecries such as freeze, silence, destroy, or copy should request a player-selected target unless their text explicitly says random, opposing slot, weakest, costliest, or another automatic rule. Add or update a focused test for every rules change.

### Change the computer opponent

Edit `src/engine/bot.ts`. The three opponent levels share the same legal-action engine but rank choices differently.

### Change the interface

The main interaction code is in `src/App.tsx`; the primary styling is in `src/App.css`, `src/index.css`, and `src/board-fx.css`. The UI calls the game engine rather than rewriting rules in the browser layer.

### Replace art or audio

Runtime assets are under `public/`. Preserve the existing relative filenames unless you also change the corresponding CSV or code reference. The game uses Vite's base URL so assets work both at a domain root and inside GitHub Pages' `/convergence-card-game/play/` subfolder.

### Player counter

`src/playerCount.ts` calls the public aggregate counter used by the live site. It stores no secret in this repository. When a local origin is not allowed by the service, the game still works and simply hides the count.

## Rules and data safeguards

- Both players draw from one shared deck.
- The engine is deterministic when given the same starting state and choices.
- Effects must use legal targets and must never silently choose a random target unless the card says so.
- A minion cannot attack on the turn it is played unless an effect permits it.
- Taunt and other targeting restrictions are enforced by the engine, not only by the interface.
- Generated output (`dist/`), dependencies (`node_modules/`), local previews, caches, logs, secrets, and machine-specific launch files are excluded from source control.

## Contributing

You do not need collaborator access. Fork the public repository, make your changes in your fork, and open a pull request. The repository owner can inspect the exact differences, discuss them, request revisions, and merge only the accepted work. See the repository's [contribution guide](../CONTRIBUTING.md) for a beginner-friendly walkthrough.

## Fan-project notice

Convergence is a non-commercial fan project for private play and educational experimentation. Character names, franchises, imagery, and music remain the property of their respective rights holders. The project is not endorsed by or affiliated with those rights holders.

