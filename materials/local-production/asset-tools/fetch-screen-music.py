#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch and cut the SCREEN music: the card pack, and the three ways a duel ends.

These four cues are not card themes. A card theme belongs to one character and
is picked by `download_convergence_audio.py`; these belong to a MOMENT — a pack
cracking open, a win, a loss, a mutual annihilation — and each one is chosen by
hand from a small list of candidates rather than by a franchise matcher.

    python fetch-screen-music.py --dry-run              # search and rank, download nothing
    python fetch-screen-music.py --pick victory=<id>    # force one cue's video id
    python fetch-screen-music.py                        # download and encode every cue whole
    python fetch-screen-music.py --cut                  # the old tuned-excerpt cut instead
    python fetch-screen-music.py --only pack            # one cue (repeatable)

Sources land in materials/local-production/audio-tracks/ as `screen-<cue> …`,
and the finished clips in source/public/audio/music/<cue>.ogg, which is where
`src/audio/sfx.ts` reads them from.

The YouTube rules baked in here are the ones this machine has already paid for:
the direct-audio lane returns HTTP 403, so downloads use the Android client and
format 18; a search is `--flat-playlist --dump-json`, which costs one request
and fetches no media; and the winner is downloaded BY VIDEO ID, so a re-run
fetches the same track rather than whatever YouTube feels like returning today.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUDIO_SRC = ROOT / "materials" / "local-production" / "audio-tracks"
WORK = AUDIO_SRC / "_work"
OUT_DIR = ROOT / "source" / "public" / "audio" / "music"
PICKS_PATH = HERE / "screen-music-picks.json"

# The sting cutter owns the "which moment" problem — sustained energy, an
# early-statement bias, an onset snap and a fixed loudness. Imported rather than
# copied, so a fix to the picker reaches these four cues too.
_spec = importlib.util.spec_from_file_location("card_stings", HERE / "build-card-stings.py")
card_stings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(card_stings)


# Fades on the WHOLE-TRACK encode. Long enough that a piece does not start with
# a click, short enough that it is not a production choice being made on top of
# somebody's recording.
FULL_FADE_IN = 0.35
FULL_FADE_OUT = 2.5

CUES: dict[str, dict] = {
    "pack": {
        "seconds": 22.0,
        "min_start": 10.0,
        "queries": [
            "hearthstone main theme music",
            "epic orchestral reward fanfare ost",
            "magic the gathering opening cinematic music",
            "epic treasure chest opening music ost",
        ],
        "note": "Plays over the whole pack ceremony: five strikes, the burst, the deal.",
    },
    "victory": {
        "seconds": 16.0,
        "min_start": 6.0,
        "queries": [
            "one piece ost overtaken",
            "anime victory theme ost epic",
            "final fantasy victory fanfare orchestra",
        ],
        "note": "The win screen.",
    },
    "defeat": {
        "seconds": 16.0,
        "min_start": 6.0,
        "queries": [
            "naruto sadness and sorrow ost",
            "sad emotional anime ost defeat",
            "attack on titan ost call your name",
        ],
        "note": "The loss screen.",
    },
    "draw": {
        "seconds": 16.0,
        "min_start": 6.0,
        "queries": [
            "attack on titan vogel im kafig ost",
            "solemn ominous orchestral ost aftermath",
            "elden ring ost erdtree burning",
        ],
        "note": "Mutual annihilation: both cores collapse, nobody wins.",
    },
}


def run(cmd: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout
    )


def search(query: str, count: int = 8) -> list[dict]:
    """One cheap request, no media fetched. Never `ytsearch1` — that is a coin flip."""
    res = run(
        [
            "yt-dlp",
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
            f"ytsearch{count}:{query}",
        ],
        timeout=180,
    )
    out = []
    for line in res.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "duration": item.get("duration") or 0,
                "views": item.get("view_count") or 0,
                "channel": item.get("channel") or item.get("uploader") or "",
            }
        )
    return out


def rank(candidates: list[dict]) -> list[dict]:
    """
    Popularity, log-scaled and capped, plus a hard length filter.

    Anything under 40 seconds is a clip rather than a piece, and anything over
    12 minutes is a compilation or a one-hour loop — both are the classic wrong
    answers this ranking exists to keep out.
    """
    import math

    scored = []
    for item in candidates:
        length = item["duration"]
        if not (40 <= length <= 12 * 60):
            continue
        score = min(30.0, 3.0 * math.log10(max(item["views"], 1)))
        title = item["title"].lower()
        if any(word in title for word in ("1 hour", "10 hours", "compilation", "playlist", "mix")):
            score -= 25
        if any(word in title for word in ("ost", "soundtrack", "theme", "music")):
            score += 4
        item["score"] = round(score, 2)
        scored.append(item)
    return sorted(scored, key=lambda item: item["score"], reverse=True)


def candidates_for(cue: str) -> list[dict]:
    seen: dict[str, dict] = {}
    for query in CUES[cue]["queries"]:
        for item in search(query):
            seen.setdefault(item["id"], item)
    return rank(list(seen.values()))


def download(cue: str, vid: str, title: str) -> Path | None:
    """Android client, format 18 — the direct-audio lane is 403 on this machine."""
    WORK.mkdir(parents=True, exist_ok=True)
    for stale in WORK.glob(f"{vid}.*"):
        stale.unlink(missing_ok=True)
    res = run(
        [
            "yt-dlp",
            "--no-playlist",
            "--extractor-args", "youtube:player_client=android",
            "-f", "18",
            "--no-warnings",
            "--no-progress",
            "--retries", "5",
            "--socket-timeout", "20",
            "-o", str(WORK / f"{vid}.%(ext)s"),
            f"https://www.youtube.com/watch?v={vid}",
        ],
        timeout=600,
    )
    produced = next((p for p in WORK.glob(f"{vid}.*") if p.suffix.lower() in {".mp4", ".m4a"}), None)
    if produced is None:
        tail = (res.stderr or res.stdout or "").strip().replace("\n", " ")[-200:]
        print(f"  FAILED {cue}: yt-dlp produced nothing ({tail})")
        return None
    safe = re.sub(r'[\\/:*?"<>|]', "", title)[:70].strip()
    final = AUDIO_SRC / f"screen-{cue} - {safe}{produced.suffix}"
    # Staged first, moved only once it exists: a half-written file must never
    # land beside the good sources, where a later run would skip it forever.
    if final.exists():
        final.unlink()
    produced.replace(final)
    return final


def probe_seconds(path: Path) -> float:
    out = run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        timeout=60,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def build_full(src: Path, dst: Path) -> tuple[bool, str]:
    """
    The WHOLE track, levelled, with a fade at each end.

    Owner's ruling, 4 September 2026: these four cues play in full rather than as
    cuts. `loudnorm` at the same target the card stings use, so a moment piece
    and a card theme sit at one level; nothing else about the recording is
    touched.
    """
    seconds = probe_seconds(src)
    if seconds <= 1:
        return False, "unreadable source duration"
    fade_out_at = max(0.0, seconds - FULL_FADE_OUT)
    filters = (
        f"afade=t=in:st=0:d={FULL_FADE_IN},"
        f"afade=t=out:st={fade_out_at}:d={FULL_FADE_OUT},"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.ogg")
    proc = run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(src),
            # See the same pair in build-card-stings.py: without `-vn` the MP4's
            # picture is re-encoded into the .ogg, and `loudnorm` hands the
            # encoder its own 192 kHz analysis rate. Together they made a
            # seven-minute cue 17 MB.
            "-vn", "-ar", "48000",
            "-af", filters, "-c:a", "libvorbis", "-q:a", "4", "-ac", "2",
            str(tmp),
        ],
        timeout=900,
    )
    if proc.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False, (proc.stderr or "").strip()[-160:]
    produced = probe_seconds(tmp)
    # Within a second of the source: an encode that silently stopped early is the
    # failure this catches, and it looks like success everywhere else.
    if produced < seconds - 1.0:
        tmp.unlink(missing_ok=True)
        return False, f"only {produced:.1f}s of {seconds:.1f}s encoded"
    dst.unlink(missing_ok=True)
    tmp.replace(dst)
    return True, f"{produced:.1f}s, {dst.stat().st_size / 1024 / 1024:.1f} MB"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="search and rank only")
    ap.add_argument(
        "--cut",
        action="store_true",
        help="cut the tuned excerpt instead of encoding the whole track",
    )
    ap.add_argument("--only", action="append", default=[], help="cue name (repeatable)")
    ap.add_argument("--pick", action="append", default=[], metavar="CUE=VIDEOID")
    args = ap.parse_args()

    picks = json.loads(PICKS_PATH.read_text("utf-8")) if PICKS_PATH.exists() else {}
    for entry in args.pick:
        cue, _, vid = entry.partition("=")
        picks[cue] = {"id": vid, "title": picks.get(cue, {}).get("title", vid)}

    cues = args.only or list(CUES)
    for cue in cues:
        if cue not in CUES:
            sys.exit(f"Unknown cue: {cue}. Known: {', '.join(CUES)}")
        print(f"\n=== {cue} — {CUES[cue]['note']}")
        if args.dry_run or cue not in picks:
            ranked = candidates_for(cue)
            for item in ranked[:10]:
                mins = f"{item['duration'] // 60}:{item['duration'] % 60:02d}"
                print(
                    f"  {item['score']:6.2f}  {item['id']}  {mins:>6}  "
                    f"{item['views']:>12,}  {item['title'][:70]}  [{item['channel'][:28]}]"
                )
            if args.dry_run:
                continue
            if not ranked:
                print(f"  FAILED {cue}: no candidate survived the length filter")
                continue
            picks[cue] = {"id": ranked[0]["id"], "title": ranked[0]["title"]}

        pick = picks[cue]
        print(f"  using {pick['id']} — {pick['title']}")
        source = next(AUDIO_SRC.glob(f"screen-{cue} - *"), None)
        if source is None or pick.get("refetch"):
            source = download(cue, pick["id"], pick["title"])
        if source is None:
            continue
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        dst = OUT_DIR / f"{cue}.ogg"
        if args.cut:
            samples = card_stings.decode_mono(source)
            track_seconds = len(samples) / card_stings.ANALYSIS_RATE
            start, _ = card_stings.choose_offset(samples, CUES[cue]["min_start"])
            ok, detail = card_stings.build_sting(source, dst, start, CUES[cue]["seconds"], track_seconds)
            print(f"  {'cut' if ok else 'FAILED'} {CUES[cue]['seconds']:.0f}s from {start:.1f}s -> {dst.name} ({detail})")
        else:
            ok, detail = build_full(source, dst)
            print(f"  {'encoded' if ok else 'FAILED'} whole track -> {dst.name} ({detail})")

    if not args.dry_run:
        PICKS_PATH.write_text(json.dumps(picks, indent=2, ensure_ascii=False), "utf-8")
        print(f"\nPicks written to {PICKS_PATH.name}")


if __name__ == "__main__":
    main()
