"""Check the single maintained WebP artwork collection against both rosters.

The former materials/raw-card-art duplicate was consolidated into
source/public/card-art/raw. Existing assets are never re-encoded in place.
"""
import argparse
import csv
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from art_import_helpers import find_art, trim_letterbox

# asset-tools -> local-production -> materials -> project root
ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "source"
OUT_DIR = PROJECT / "public" / "card-art" / "raw"

# The art window is 750x492 in the print design space. The largest the card is
# ever drawn on screen is ~340 CSS px wide, so 2x DPR wants ~680x446 of pixels.
COVER_W, COVER_H = 760, 500
MAX_DIM = 1400          # hard cap so a 8.5 MB PNG never becomes a 900 KB WebP
QUALITY = 82


def read_rows(path, kind):
    with open(path, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "cost": int(row["cost"]) if str(row.get("cost", "")).strip().isdigit() else None,
            "type": kind,
            "art": row.get("art", ""),
        }
        for row in rows
    ]


def convert(src: Path, dest: Path) -> int:
    image = Image.open(src)
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGB")
    elif image.mode != "RGB":
        image = image.convert("RGB")
    image = trim_letterbox(image)

    width, height = image.size
    scale = min(1.0, max(COVER_W / width, COVER_H / height))
    scale = min(scale, MAX_DIM / max(width, height))
    if scale < 1.0:
        image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)

    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "WEBP", quality=QUALITY, method=6)
    return dest.stat().st_size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="rebuild files that already exist")
    args = parser.parse_args()

    cards = read_rows(PROJECT / "data" / "cards.csv", "minion")
    cards += read_rows(PROJECT / "data" / "relics.csv", "relic")

    missing, done, skipped, total_bytes = [], 0, 0, 0
    for card in cards:
        dest = PROJECT / "public" / card["art"].lstrip("/")
        if dest.exists() and not args.force:
            skipped += 1
            total_bytes += dest.stat().st_size
            continue
        src = find_art(card)
        if not src:
            missing.append(card)
            continue
        if src.resolve() == dest.resolve():
            skipped += 1
            total_bytes += dest.stat().st_size
            continue
        try:
            total_bytes += convert(src, dest)
            done += 1
            print(f"  ok  {card['id']}  {card['name'][:34]:34}  <- {src.name}")
        except Exception as error:  # one bad source never aborts the batch
            print(f"  XX  {card['id']}  {card['name']}: {error}")
            missing.append(card)

    print(f"\nConverted {done}, reused {skipped}, missing {len(missing)}.")
    print(f"Total art payload: {total_bytes / 1_000_000:.1f} MB in {OUT_DIR}")
    if missing:
        print("No raw art for: " + ", ".join(f"{c['name']} ({c['id']})" for c in missing))
        sys.exit(1)


if __name__ == "__main__":
    main()
