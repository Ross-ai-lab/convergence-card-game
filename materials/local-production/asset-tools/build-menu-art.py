"""Build the small card thumbnails the title screen's floating field uses.

WHY THIS EXISTS
---------------
The menu drifts 84 cards across its background. It was loading the FULL card
artwork for every one of them. Measured 2026-08-21 on the live menu: 84 files,
4.67 MB, source images up to 889x500 pixels. Those cards render at most
134x152 CSS pixels and are blurred on top of that, so roughly twenty-five times
more pixels were being downloaded and decoded than could ever reach the screen.
That was the bulk of the owner's "the menu opens a bit slow and laggy".

The fix has to be invisible, and it is: same 84 cards, same positions, same
drift, same blur. Only the pixels behind them get smaller.

WIDTH
-----
220 px. The widest a floating card renders is 134 CSS px; at the 1.25 device
pixel ratio measured on the owner's screen that is about 168 device pixels, and
220 leaves room for a 1.5x display without ever upscaling. Anything wider buys
detail that a 2.4 px blur immediately throws away.

The thumbnails are committed, because the game is served as a static site and
there is no build step that could produce them on deploy.

Run:  py -3.14 materials/local-production/asset-tools/build-menu-art.py
Re-run after adding cards or after changing the floating field's size.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

WIDTH = 220
QUALITY = 78

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "source" / "public" / "card-art" / "raw"
TARGET = ROOT / "source" / "public" / "card-art" / "menu"

SUFFIXES = {".webp", ".png", ".jpg", ".jpeg"}


def main() -> int:
    if not SOURCE.is_dir():
        print(f"No source art at {SOURCE}", file=sys.stderr)
        return 1

    TARGET.mkdir(parents=True, exist_ok=True)

    source_bytes = 0
    output_bytes = 0
    written = 0

    for path in sorted(SOURCE.iterdir()):
        if path.suffix.lower() not in SUFFIXES:
            continue
        # One extension out, whatever went in: the app builds the menu path from
        # the card id alone and must not have to know how the original was saved.
        out = TARGET / f"{path.stem}.webp"
        with Image.open(path) as im:
            im = im.convert("RGB")
            if im.width > WIDTH:
                height = round(im.height * WIDTH / im.width)
                im = im.resize((WIDTH, height), Image.LANCZOS)
            im.save(out, "WEBP", quality=QUALITY, method=6)
        source_bytes += path.stat().st_size
        output_bytes += out.stat().st_size
        written += 1

    if not written:
        print("No source images found.", file=sys.stderr)
        return 1

    mb = lambda n: f"{n / 1024 / 1024:.2f} MB"
    print(f"menu art: {written} thumbnails at {WIDTH}px")
    print(f"  {mb(source_bytes)} of source art -> {mb(output_bytes)}")
    print(f"  {round((1 - output_bytes / source_bytes) * 100)}% smaller")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
