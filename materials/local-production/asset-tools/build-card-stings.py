#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cut a short music sting for every Convergence card or relic (6 seconds by default).

Source: materials/local-production/audio-tracks/
Output: source/public/audio/stings/<cardId>.ogg

Picking the MOMENT is the whole problem, and it is scored over a fixed
3-second window no matter how long the finished clip is -- so changing the
length with --seconds gives you more of the same moment, never a different one. A track's most recognisable
moment is almost never its opening, and it is usually not its single loudest
instant either -- that tends to be a cymbal crash or a drum fill landing
mid-phrase. What works, and what this does:

  1. Skip the intro. Nothing before `--min-start` seconds is considered, and
     anything in the quiet lead-in is discarded outright.
  2. Score every candidate window by sustained energy, not peak. A window that
     is loud throughout beats one with a single spike.
  3. Prefer the FIRST strong statement over a later one. In a theme, the hook
     usually lands early and later repeats are variations.
  4. Snap the start back onto a note onset, so the clip begins ON the beat
     instead of clipping the front off a phrase.
  5. Normalise every sting to the same loudness, so no card is jarringly louder
     than another, then fade 60 ms in and 250 ms out so nothing clicks.

Usage:
    python build-card-stings.py                 # build all missing cards and relics
    python build-card-stings.py --force         # rebuild everything
    python build-card-stings.py --only c014     # one card (repeatable)
    python build-card-stings.py --only r001     # one relic (repeatable)
    python build-card-stings.py --offset c014=41.5   # hand-pick a start time
    python build-card-stings.py --report        # print chosen offsets, build nothing
    python build-card-stings.py --seconds 3 --force  # go back to 3-second stings

Hand-picked offsets live in `data/sting-offsets.csv` (cardId,seconds) and always
win over the automatic choice. That file is the fix-by-ear lane: listen, note a
better number, put it there, rebuild that one card.
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GAME = ROOT / "source"
AUDIO_SRC = ROOT / "materials" / "local-production" / "audio-tracks"
CARDS_CSV = GAME / "data" / "cards.csv"
RELICS_CSV = GAME / "data" / "relics.csv"
OFFSETS_CSV = GAME / "data" / "sting-offsets.csv"
OUT_DIR = GAME / "public" / "audio" / "stings"

CLIP_SECONDS = 6.0            # length of the finished sting; --seconds overrides

# The window used to CHOOSE the moment, deliberately decoupled from the output
# length. The 3-second picks were the ones the owner liked, so lengthening the
# clip must not re-run the search with a wider window and land somewhere else:
# same start, more of it. Changing this changes every offset.
SELECTION_SECONDS = 3.0
FADE_IN = 0.06
FADE_OUT = 0.25
ANALYSIS_RATE = 8000          # plenty for an energy envelope, and fast to decode
HOP = 256                     # ~32 ms per frame at 8 kHz

# The three roster names whose wording differs between the stat sheet and
# cards.csv. Keep the aliases in step with the current roster so a mismatch
# does not silently leave a card with no sting.
NAME_ALIASES = {
    "13 lords of chaos": "thirteen lords of chaos",
    "gol d roger king of pirates": "gol d roger",
    "ragnaros the firelord": "ragnaros",
}


def norm(text: str) -> str:
    text = (text or "").lower()
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("–", "-"), ("—", "-")):
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def run(cmd: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          encoding="utf-8", errors="replace", timeout=timeout)


def decode_mono(path: Path) -> np.ndarray:
    """Whole track as mono float32 at ANALYSIS_RATE."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(ANALYSIS_RATE),
         "-f", "f32le", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise RuntimeError(f"ffmpeg could not decode {path.name}")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def choose_offset(samples: np.ndarray, min_start: float) -> tuple[float, dict]:
    """Return (start_seconds, diagnostics) for the best window.

    Scored over SELECTION_SECONDS regardless of how long the finished clip is,
    so output length and chosen moment stay independent of each other.
    """
    frames_per_sec = ANALYSIS_RATE / HOP
    n_frames = len(samples) // HOP
    if n_frames < int(frames_per_sec * (SELECTION_SECONDS + 1)):
        return 0.0, {"reason": "track shorter than the clip; taking the start"}

    # RMS envelope, one value per HOP samples.
    frames = samples[: n_frames * HOP].reshape(n_frames, HOP)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-12)

    # Smooth a little so a single spike cannot dominate.
    kernel = max(1, int(frames_per_sec * 0.15))
    smooth = np.convolve(rms, np.ones(kernel) / kernel, mode="same")

    win = int(frames_per_sec * SELECTION_SECONDS)
    first = int(frames_per_sec * min_start)
    last = n_frames - win
    if last <= first:
        first = 0
        last = max(1, n_frames - win)

    # Sustained energy = mean of the window, penalised by how much of it is quiet.
    # A window that is loud throughout beats one that is loud for half a second.
    csum = np.concatenate([[0.0], np.cumsum(smooth)])
    means = (csum[win:] - csum[:-win]) / win
    floor = np.percentile(smooth, 55)
    quiet = np.convolve((smooth < floor).astype(float), np.ones(win) / win, mode="valid")
    score = means[: len(quiet)] * (1.0 - 0.6 * quiet)

    # Ignore the last 15% of the track. Raw sustained energy peaks in the FINALE
    # of most orchestral and rock themes, so without this the picker reliably
    # returns the outro -- measured at 90% into John Wick and 94% into the
    # Matrix theme, which is the closing crescendo, not anything anyone hums.
    last = min(last, int(n_frames * 0.85))
    if last <= first:
        last = max(first + 1, n_frames - win)

    region = score[first:last] if last <= len(score) else score[first:]
    if region.size == 0:
        return min_start, {"reason": "no usable window; using --min-start"}

    # Tilt gently towards earlier windows so that, between two passages of
    # similar strength, the first statement of the hook wins over a later
    # reprise of it.
    positions = np.linspace(0.0, 1.0, region.size)
    region = region * (1.0 - 0.30 * positions)

    # Then take the FIRST window within 4% of that weighted best, not the max.
    best = float(region.max())
    good = np.flatnonzero(region >= best * 0.96)
    chosen = first + int(good[0])

    # Snap backwards onto a note onset so the clip does not start mid-phrase.
    look = int(frames_per_sec * 0.4)
    lo = max(first, chosen - look)
    if chosen > lo:
        rise = np.diff(smooth[lo : chosen + 1])
        if rise.size:
            chosen = lo + int(np.argmax(rise)) + 1

    start = chosen / frames_per_sec
    start = max(0.0, min(start, (n_frames - win) / frames_per_sec))
    return round(start, 2), {
        "peak_score": round(best, 5),
        "picked_frame": int(chosen),
        "track_seconds": round(n_frames / frames_per_sec, 1),
    }


def build_sting(src: Path, dst: Path, start: float, clip: float,
                track_seconds: float | None = None) -> tuple[bool, str]:
    # A 6-second clip taken at a 3-second window's offset can overrun a short
    # track. Slide back rather than deliver a clip that fades into nothing.
    if track_seconds and start + clip > track_seconds:
        start = max(0.0, track_seconds - clip)
    fade_out_at = max(0.0, clip - FADE_OUT)
    filters = (
        f"afade=t=in:st=0:d={FADE_IN},"
        f"afade=t=out:st={fade_out_at}:d={FADE_OUT},"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.ogg")
    proc = run([
        "ffmpeg", "-v", "error", "-y",
        "-ss", f"{start:.2f}", "-t", f"{clip}", "-i", str(src),
        "-af", filters, "-c:a", "libvorbis", "-q:a", "4", "-ac", "2",
        str(tmp),
    ], timeout=180)
    if proc.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False, (proc.stderr or "").strip()[-160:]

    # Verify: it must actually be ~3 s of audio, not silence.
    dur = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0", str(tmp)], timeout=30).stdout.strip()
    try:
        seconds = float(dur)
    except ValueError:
        tmp.unlink(missing_ok=True)
        return False, "unreadable output"
    if seconds < clip - 0.25:
        tmp.unlink(missing_ok=True)
        return False, f"only {seconds:.2f}s produced"

    dst.unlink(missing_ok=True)
    tmp.replace(dst)
    return True, f"{seconds:.2f}s @ {start:.2f}s"


def load_offsets() -> dict[str, float]:
    out: dict[str, float] = {}
    if not OFFSETS_CSV.exists():
        return out
    for row in csv.DictReader(OFFSETS_CSV.open(encoding="utf-8")):
        try:
            out[row["cardId"].strip()] = float(row["seconds"])
        except (KeyError, ValueError):
            continue
    return out


def track_index() -> dict[str, Path]:
    index: dict[str, Path] = {}
    for path in AUDIO_SRC.iterdir():
        if path.suffix.lower() not in {".mp3", ".mp4"}:
            continue
        m = re.match(r"^(?:\d{3}|r\d{3}) - (.+) \(([^()]*)\)\.(?:mp3|mp4)$", path.name, re.IGNORECASE)
        if m:
            index[norm(m.group(1))] = path
    return index


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="Cut a short music sting per card or relic (6 s by default).")
    ap.add_argument("--force", action="store_true", help="rebuild stings that already exist")
    ap.add_argument("--only", action="append", default=[], help="card id or name fragment (repeatable)")
    ap.add_argument("--offset", action="append", default=[], metavar="ID=SECONDS",
                    help="hand-pick a start time for one card, e.g. c014=41.5")
    ap.add_argument("--seconds", type=float, default=CLIP_SECONDS,
                    help=f"length of each sting (default {CLIP_SECONDS:g}); the chosen moment does not change")
    ap.add_argument("--min-start", type=float, default=8.0,
                    help="ignore this many seconds of intro (default 8)")
    ap.add_argument("--report", action="store_true", help="print chosen offsets, build nothing")
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()
    clip = max(1.0, args.seconds)

    for exe in ("ffmpeg", "ffprobe"):
        if run([exe, "-version"], timeout=30).returncode != 0:
            sys.exit(f"{exe} is not available on PATH.")
    if not AUDIO_SRC.exists():
        sys.exit(f"Source tracks not found: {AUDIO_SRC}")

    pinned = load_offsets()
    for spec in args.offset:
        cid, _, secs = spec.partition("=")
        try:
            pinned[cid.strip()] = float(secs)
        except ValueError:
            sys.exit(f"--offset wants ID=SECONDS, got {spec!r}")

    tracks = track_index()
    cards = list(csv.DictReader(CARDS_CSV.open(encoding="utf-8")))
    if RELICS_CSV.exists():
        cards.extend(csv.DictReader(RELICS_CSV.open(encoding="utf-8")))
    if args.only:
        wanted = [w.lower() for w in args.only]
        cards = [c for c in cards
                 if any(w == c["id"].lower() or w in c["name"].lower() for w in wanted)]
    if not cards:
        sys.exit("No cards or relics matched.")

    def resolve(card: dict) -> Path | None:
        key = norm(card["name"])
        if key in tracks:
            return tracks[key]
        for sheet_name, game_name in NAME_ALIASES.items():
            if norm(game_name) == key and sheet_name in tracks:
                return tracks[sheet_name]
        return None

    def work(card: dict) -> tuple[str, str, str]:
        cid, name = card["id"], card["name"]
        src = resolve(card)
        if src is None:
            return cid, name, "NO SOURCE TRACK"
        dst = OUT_DIR / f"{cid}.ogg"
        # --report must answer for every card, built or not: it is the review
        # surface, and "skipped (exists)" tells the reader nothing.
        if dst.exists() and not args.force and cid not in pinned and not args.report:
            return cid, name, "skipped (exists)"
        try:
            samples = decode_mono(src)
            track_seconds = len(samples) / ANALYSIS_RATE
            if cid in pinned:
                start, note = pinned[cid], "hand-picked"
            else:
                start, diag = choose_offset(samples, args.min_start)
                note = diag.get("reason", "auto")
            if args.report:
                return cid, name, f"would cut at {start:6.2f}s  ({note})"
            okay, detail = build_sting(src, dst, start, clip, track_seconds)
            return cid, name, (f"OK {detail} ({note})" if okay else f"FAILED {detail}")
        except Exception as exc:
            return cid, name, f"ERROR {type(exc).__name__}: {exc}"

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {pool.submit(work, c): c for c in cards}
        for fut in as_completed(futures):
            cid, name, status = fut.result()
            results.append((cid, name, status))

    for cid, name, status in sorted(results):
        print(f"  {cid}  {name[:28]:28s} {status}")

    bad = [r for r in results if r[2].startswith(("FAILED", "ERROR", "NO SOURCE"))]
    print(f"\n{len(results) - len(bad)}/{len(results)} ok")
    if bad:
        print("Problems:")
        for cid, name, status in bad:
            print(f"  {cid} {name}: {status}")
    if not args.report:
        print(f"\nStings: {OUT_DIR}")
        print("Wrong moment on a card? Put a better start time in data/sting-offsets.csv "
              "(cardId,seconds) and rerun with --only <id>.")


if __name__ == "__main__":
    main()
