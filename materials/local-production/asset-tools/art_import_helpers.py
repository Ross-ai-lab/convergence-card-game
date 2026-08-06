"""Shared helpers for importing raw art into the browser game.

These helpers used to live inside the physical-card renderer. The browser game
does not need the renderer, but its raw-art import still needs the same fuzzy
name matching and conservative movie-letterbox trimming.
"""

import re
from pathlib import Path


MATERIALS = Path(__file__).resolve().parents[2]
RAW_ROOT = MATERIALS / "raw-card-art"


def _norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def find_art(card):
    folder = RAW_ROOT / (
        "Ascension Relics" if card.get("type") == "relic" else f"{card['cost']} mana"
    )
    if not folder.is_dir():
        return None

    card_name = _norm(card["name"])
    best = None
    best_score = 0
    for candidate in folder.iterdir():
        if candidate.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
            continue
        filename = _norm(candidate.stem)
        if filename == card_name:
            return candidate
        if card_name.startswith(filename) or filename.startswith(card_name):
            score = len(filename)
        else:
            score = len(set(card_name.split()) & set(filename.split()))
        if score > best_score:
            best = candidate
            best_score = score
    return best


def trim_letterbox(image, threshold=24, max_fraction=0.35):
    """Remove conservative near-black movie letterbox bars from image edges."""

    grayscale = image.convert("L")
    width, height = grayscale.size
    sample_width, sample_height = min(width, 160), min(height, 160)
    sample = grayscale.resize((sample_width, sample_height))
    pixels = sample.load()

    row_dark = lambda y: sum(pixels[x, y] < threshold for x in range(sample_width)) >= sample_width * 0.96
    column_dark = lambda x: sum(pixels[x, y] < threshold for y in range(sample_height)) >= sample_height * 0.96

    top = 0
    while top < sample_height * max_fraction and row_dark(top):
        top += 1
    bottom = sample_height - 1
    while bottom > sample_height * (1 - max_fraction) and row_dark(bottom):
        bottom -= 1
    left = 0
    while left < sample_width * max_fraction and column_dark(left):
        left += 1
    right = sample_width - 1
    while right > sample_width * (1 - max_fraction) and column_dark(right):
        right -= 1

    x0, x1 = int(left / sample_width * width), int((right + 1) / sample_width * width)
    y0, y1 = int(top / sample_height * height), int((bottom + 1) / sample_height * height)
    if x1 - x0 >= width * 0.4 and y1 - y0 >= height * 0.4:
        return image.crop((x0, y0, x1, y1))
    return image
