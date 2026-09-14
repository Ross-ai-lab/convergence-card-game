"""Convergence adapter for the shared Qwen VoiceDesign pipeline.

Dialogue and casting stay in this project.  Runtime setup, model loading,
batching, loudness processing, resume logic and signal validation live in
``Pipelines/audio/qwen/voice.py``.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = ROOT.parents[2]
SHARED = WORKSPACE / "Pipelines/audio/qwen/voice.py"
ENGINE = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
STAGES = ("entrance", "defeat", "loss", "play")


def filters_for(chapter: int) -> list[str]:
    filters = ["highpass=f=65"]
    # These restrained treatments are part of the Convergence cast direction,
    # not of the reusable engine.  They preserve the existing full-batch mix.
    if chapter == 1:
        filters += ["tremolo=f=32:d=0.08", "equalizer=f=2200:t=q:w=1:g=2"]
    if chapter in (6, 12, 16):
        filters += ["aecho=0.9:0.9:45:0.08"]
    return filters


def parse_selected(value: str, label: str) -> set[str] | None:
    if not value or value.strip().lower() in {"all", "*"}:
        return None
    selected = {part.strip() for part in value.split(",") if part.strip()}
    if not selected:
        raise RuntimeError(f"--{label} selected nothing")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chapters", default="", help="chapter numbers, comma-separated; default is all 20")
    parser.add_argument("--keys", default="all", help="recording keys, comma-separated; default is all 80")
    parser.add_argument("--stages", default=",".join(STAGES), help="stage names, comma-separated")
    parser.add_argument("--force", action="store_true", help="regenerate selected recordings even when current")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--model-dir", default="", help="optional explicit Qwen model directory")
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 4:
        parser.error("--batch-size must be between 1 and 4 on the approved 6 GB GPU")

    story = json.loads((ROOT / "materials/campaign-story.json").read_text(encoding="utf-8"))
    cast = json.loads((ROOT / "materials/campaign-voice-cast.json").read_text(encoding="utf-8"))
    chapters = {int(value) for value in args.chapters.split(",") if value.strip()}
    stages = [stage.strip() for stage in args.stages.split(",") if stage.strip()]
    unknown_stages = sorted(set(stages) - set(STAGES))
    if unknown_stages:
        parser.error(f"unknown stage(s): {', '.join(unknown_stages)}; expected {', '.join(STAGES)}")
    selected_keys = parse_selected(args.keys, "keys")

    jobs: list[dict[str, object]] = []
    for chapter in story["chapters"]:
        number = int(chapter["chapter"])
        if chapters and number not in chapters:
            continue
        voice = cast["cast"][str(number)]
        for stage in stages:
            key = f"{number:02d}-{stage}"
            if selected_keys is not None and key not in selected_keys:
                continue
            text = str(chapter[stage])
            spoken = text.capitalize() if number == 20 else text
            direction = str(voice["direction"][stage])
            jobs.append({
                "id": key,
                "text": text,
                "spoken": spoken,
                "voice": str(voice["voice"]),
                "direction": direction,
                "seed": int(voice["seed"]),
                "engine": ENGINE,
                "filters": filters_for(number),
            })

    known_keys = {str(job["id"]) for job in jobs}
    if selected_keys is not None:
        unknown = sorted(selected_keys - known_keys)
        if unknown:
            raise RuntimeError(f"Unknown campaign voice key(s): {', '.join(unknown)}")
    if not jobs:
        raise RuntimeError("No campaign voice jobs selected")

    target = ROOT / ".preview/voice-full-hold/campaign"
    raw = ROOT / ".preview/campaign-voices/raw"
    manifest_path = ROOT / ".preview/voice-full-hold/campaign-voices.json"
    input_path = ROOT / ".preview/voice-full-hold/campaign-jobs.json"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    input_path.write_text(json.dumps({"jobs": jobs}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    command = [
        sys.executable,
        str(SHARED),
        "generate",
        "--input", str(input_path),
        "--output-dir", str(target),
        "--manifest", str(manifest_path),
        "--raw-dir", str(raw),
        "--batch-size", str(args.batch_size),
    ]
    if args.model_dir:
        command += ["--model-dir", args.model_dir]
    if args.force:
        command.append("--force")
    result = subprocess.run(command, cwd=WORKSPACE)
    if result.returncode != 0:
        return result.returncode

    # Keep the Convergence manifest useful to the game-specific validator.
    # The shared engine owns audio fields; this adapter owns chapter, boss and
    # stage identity.
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for job in jobs:
        key = str(job["id"])
        number = int(key.split("-", 1)[0])
        stage = key.split("-", 1)[1]
        chapter = next(item for item in story["chapters"] if int(item["chapter"]) == number)
        entry = manifest.get(key, {})
        entry.update({
            "chapter": number,
            "bossId": chapter["bossId"],
            "stage": stage,
            "text": chapter[stage],
        })
        manifest[key] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Convergence campaign jobs: {len(jobs)} requested; manifest now contains {len(manifest)} recordings")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"CAMPAIGN VOICE ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
