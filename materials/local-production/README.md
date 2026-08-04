# Production materials

This folder documents the complete production workshop behind Convergence. The lightweight tools and instructions are included in the repository. Large binary working libraries are supplied through the project's `v1.0` GitHub release so a normal clone stays practical.

## Included in the repository

- `asset-tools/`: optional generators for rebuilding runtime art, music stings, voice previews, and cast sheets.

Most tools use Python 3.14 or Node.js 22. Python image and audio helpers may additionally require Pillow, NumPy, FFmpeg, or Whisper depending on the script. Each script describes its own inputs and command near the top of the file.

## Release downloads

- [Convergence-Audio-Tracks.7z](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Audio-Tracks.7z): the 175 original MP3 themes plus the downloader and audit data. Extract its contents into `audio-tracks/`.
- [Convergence-Card-Production.7z](https://github.com/Ross-ai-lab/convergence-card-game/releases/download/v1.0/Convergence-Card-Production.7z): rendered full card faces, older web-sized exports, and review previews. Extract it here so it creates `card-production/`.

The active game source is always `../../source/`. Runtime assets used by the browser game are already included under `../../source/public/`; downloading these production archives is optional.
