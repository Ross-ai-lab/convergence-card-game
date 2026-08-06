# Contributing to Convergence

Contributions are welcome through GitHub pull requests. You do not need to be invited as a collaborator and you do not need permission to propose a change.

## Beginner-friendly workflow

1. Sign in to GitHub and open the [Convergence repository](https://github.com/Ross-ai-lab/convergence-card-game).
2. Click **Fork**. This creates your own editable copy under your GitHub account.
3. In your fork, edit files in `source/` using GitHub's pencil button, GitHub Codespaces, or a local clone.
4. Commit the change to a new branch in your fork.
5. Run the relevant checks if the change was made locally.
6. Click **Contribute → Open pull request** and describe what changed and why.
7. The repository owner reviews the exact differences. They can ask for changes or merge the pull request when it is ready.

A fork and pull request cannot directly change this repository or the live game. The live version changes only after someone with write access accepts and publishes the work.

## Local setup

```bash
git clone https://github.com/YOUR-GITHUB-NAME/convergence-card-game.git
cd convergence-card-game/source
npm ci
npm run dev
```

Use Node.js 22.12 or newer. See the repository's [`source/`](source/) directory and the Convergence KB for the project map, commands, and editing recipes.

## Optional production materials

The normal clone already contains everything needed to run, edit, test, and build the browser game. Developers working on original card renders or full-length audio can also use the optional archives linked from [`materials/local-production/`](materials/local-production/). The production helper scripts are stored there in `asset-tools/`.

## Before opening a pull request

- Keep the change focused and explain the player-visible result.
- Run `npm run validate:data`, `npm test`, and `npm run build` from `source/`.
- Add or update a focused test when changing game rules.
- Confirm card text matches the implemented effect.
- Preserve player-selected targeting unless the card explicitly says the target is random, positional, weakest, costliest, or otherwise automatic.
- Do not commit `node_modules/`, `dist/`, `.preview/`, `.wrangler/`, logs, local launchers, secret files, or personal computer paths.
- Do not include API keys, passwords, private email addresses, or other personal information.

## Where to make changes

- Cards and relics: `source/data/`
- Game rules and computer opponents: `source/src/engine/`
- Interface and controls: `source/src/App.tsx` and `source/src/*.css`
- Art, fonts, and runtime audio: `source/public/`
- Card rendering and optional production tools: `materials/`
- Tests: files ending in `.test.ts` beside the code they cover

For an idea that is not ready for code, open a GitHub Issue first so it can be discussed without changing the game.
