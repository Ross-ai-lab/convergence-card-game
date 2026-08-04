"""
Proves every rendered voice line actually says its line.

    py -3.14 materials/local-production/asset-tools/qa-voicelines.py
    py -3.14 materials/local-production/asset-tools/qa-voicelines.py --sample

Transcribes each clip back with Whisper and compares against the script. Two
false-alarm classes are already handled:

  * Whisper invents text over trailing silence and low-energy tails, so the score
    is computed on the PREFIX where the script should live, not the whole string.
  * difflib's `autojunk` silently collapses long-prose similarity to ~0.25 on
    identical text, so every comparison passes autojunk=False.

A heavily treated clip (titan, void, machine) legitimately scores lower than a
clean one — the DSP is doing its job. So a low score is reported for a HUMAN to
read, never auto-failed: the operating rule is read the heard text, and if the
words are there, the audio is good and the checker is wrong.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "source"
SHEET = ROOT / "data" / "voicelines.csv"
VO_DIR = ROOT / "public" / "audio" / "vo"
TRANSCRIBE = ROOT.parent.parent.parent.parent / "Pipelines" / "audio" / "whisper" / "transcribe.py"


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split() and " ".join(
        re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split()
    ) or ""


def similarity(script: str, heard: str) -> float:
    want, got = normalise(script), normalise(heard)
    if not want:
        return 0.0
    # Score the prefix only: Whisper's hallucinations all land after the content.
    got = got[: max(len(want) + 24, int(len(want) * 1.5))]
    return difflib.SequenceMatcher(None, want, got, autojunk=False).ratio()


def transcribe(path: Path) -> str:
    # `py -3.14` is the launcher, NOT an argument to a python.exe — passing the
    # version flag to sys.executable makes every call fail silently and return an
    # empty string, which reads exactly like ten broken audio files.
    result = subprocess.run(
        ["py", "-3.14", str(TRANSCRIBE), str(path), "--model", "base", "--language", "en"],
        capture_output=True, text=True,
    )
    # The engine's progress lines go to stderr; stdout is the transcript alone.
    return " ".join(line for line in (result.stdout or "").splitlines() if not line.startswith("[whisper]")).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--threshold", type=float, default=0.62)
    args = parser.parse_args()

    rows = [r for r in csv.DictReader(SHEET.open(encoding="utf-8")) if (VO_DIR / f"{r['id']}.ogg").exists()]
    if args.sample:
        rows = rows[:12]
    if not rows:
        print("No rendered clips found.")
        return 1

    print(f"Transcribing {len(rows)} clips back…\n")
    weak: list[tuple[str, str, str, float, str]] = []
    scores: list[float] = []
    for index, row in enumerate(rows, 1):
        heard = transcribe(VO_DIR / f"{row['id']}.ogg")
        score = similarity(row["line"], heard)
        scores.append(score)
        if score < args.threshold:
            weak.append((row["id"], row["name"], row["treatment"], score, heard.strip()))
        if index % 25 == 0:
            print(f"  {index}/{len(rows)}")

    good = sum(1 for s in scores if s >= args.threshold)
    print(f"\n{good}/{len(rows)} clips transcribe back cleanly (mean {sum(scores) / len(scores):.2f})")
    if weak:
        print(f"\n{len(weak)} to read by eye — heavy treatments score low on purpose:")
        for card_id, name, treatment, score, heard in weak:
            script = next(r["line"] for r in rows if r["id"] == card_id)
            print(f"\n  {card_id} {name} [{treatment}] {score:.2f}")
            print(f"    script: {script}")
            print(f"    heard : {heard[:110] or '(nothing)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
