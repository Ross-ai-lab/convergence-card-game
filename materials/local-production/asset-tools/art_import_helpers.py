"""Shared helpers for importing raw art into the browser game.

These helpers used to live inside the physical-card renderer. The browser game
does not need the renderer, but its raw-art import still needs the same fuzzy
name matching and conservative movie-letterbox trimming.
"""

from pathlib import Path


MATERIALS = Path(__file__).resolve().parents[2]
RAW_ROOT = MATERIALS.parent / "source" / "public" / "card-art" / "raw"


def find_art(card):
    art = card.get("art", "")
    if art:
        candidate = MATERIALS.parent / "source" / "public" / art.lstrip("/")
        return candidate if candidate.is_file() else None
    candidate = RAW_ROOT / f"{card['id']}.webp"
    return candidate if candidate.is_file() else None


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
