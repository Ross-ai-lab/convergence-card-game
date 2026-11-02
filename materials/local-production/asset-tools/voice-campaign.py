"""Convergence adapter for the shared Qwen VoiceDesign and Base pipeline.

Dialogue and casting stay in this project.  Runtime setup, model loading,
batching, loudness processing, resume logic and signal validation live in
``Pipelines/audio/qwen/voice.py``.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = ROOT.parents[2]
SHARED = WORKSPACE / "Pipelines/audio/qwen/voice.py"
VOICE_DESIGN_ENGINE = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
VOICE_CLONE_ENGINE = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
STAGES = ("entrance", "defeat", "loss", "play")
RICK_PROLOGUE_KEY = "rick-prologue"
RICK_INTRO_SUFFIX = "rick-intro"
EMOTE_IDS = ("hi", "wellPlayed", "oops", "taunt")


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


def project_file(value: str, label: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    root = ROOT.resolve()
    if not path.is_file() or not path.is_relative_to(root):
        raise RuntimeError(f"{label} must be an existing file inside the Convergence project: {path}")
    return path


def run_generation(
    jobs: list[dict[str, object]],
    model_type: str,
    target: Path,
    raw: Path,
    manifest_path: Path,
    args: argparse.Namespace,
    model_dir: str,
) -> int:
    if not jobs:
        return 0
    input_path = ROOT / ".preview/voice-full-hold" / f"campaign-jobs-{model_type}.json"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    input_path.write_text(json.dumps({"jobs": jobs}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    command = [
        sys.executable,
        str(SHARED),
        "generate",
        "--model-type", model_type,
        "--input", str(input_path),
        "--output-dir", str(target),
        "--manifest", str(manifest_path),
        "--raw-dir", str(raw),
        "--batch-size", str(args.batch_size),
    ]
    if model_dir:
        command += ["--model-dir", model_dir]
    if args.emotes:
        # One-word emotes run well under the engine's story-length floor; a runaway take still fails.
        command += ["--min-seconds", "0.4", "--max-seconds", "15"]
    if args.force:
        command.append("--force")
    return subprocess.run(command, cwd=WORKSPACE).returncode


def emote_jobs(
    story: dict, cast: dict, clone: dict, reference_audio: Path, reference_transcript: str, selected_keys: set[str] | None,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, dict[str, object]]]:
    """Rick's four player emotes (Base clone) and every champion's four replies (VoiceDesign).

    Keys are ``rick-emote-<id>`` and ``NN-emote-<id>``; ``identity`` carries the
    speaker fields this adapter adds to the shared engine's manifest.
    """
    design: list[dict[str, object]] = []
    base: list[dict[str, object]] = []
    identity: dict[str, dict[str, object]] = {}
    for emote in EMOTE_IDS:
        key = f"rick-emote-{emote}"
        if selected_keys is not None and key not in selected_keys:
            continue
        text = str(story["rickEmotes"][emote])
        base.append({
            "id": key,
            "text": text,
            "spoken": text,
            "seed": int(clone.get("seed", cast["protagonist"]["seed"])),
            "engine": VOICE_CLONE_ENGINE,
            "reference_audio": str(reference_audio),
            "reference_transcript": reference_transcript,
            "filters": ["highpass=f=65"],
        })
        identity[key] = {"chapter": 0, "speaker": cast["protagonist"]["name"], "stage": "emote", "emote": emote, "text": text}
    for chapter in story["chapters"]:
        number = int(chapter["chapter"])
        voice = cast["cast"][str(number)]
        for emote in EMOTE_IDS:
            key = f"{number:02d}-emote-{emote}"
            if selected_keys is not None and key not in selected_keys:
                continue
            text = str(chapter["emotes"][emote])
            design.append({
                "id": key,
                "text": text,
                "spoken": text.capitalize() if number == 20 else text,
                "voice": str(voice["voice"]),
                "direction": str(voice["emoteDirection"][emote]),
                "seed": int(voice["seed"]),
                "engine": VOICE_DESIGN_ENGINE,
                "filters": filters_for(number),
            })
            identity[key] = {"chapter": number, "bossId": chapter["bossId"], "speaker": voice["name"], "stage": "emote", "emote": emote, "text": text}
    if selected_keys is not None:
        unknown = sorted(selected_keys - set(identity))
        if unknown:
            raise RuntimeError(f"Unknown emote voice key(s): {', '.join(unknown)}")
    return design, base, identity


SHIPPED_FIELDS = (
    "chapter", "bossId", "speaker", "stage", "emote", "duration", "text", "fingerprint", "audioSha256",
    "engine", "model_type", "model_repo", "seed", "reference_audio_sha256", "reference_transcript",
)


def promote_emotes() -> int:
    """Copy the held emote recordings into the game, with the manifest fields the game and checker read."""
    held = json.loads((ROOT / ".preview/voice-full-hold/emote-voices.json").read_text(encoding="utf-8"))
    target = ROOT / "source/public/audio/emotes"
    target.mkdir(parents=True, exist_ok=True)
    shipped: dict[str, dict[str, object]] = {}
    for key in sorted(held):
        source = ROOT / ".preview/voice-full-hold/emotes" / f"{key}.ogg"
        if not source.is_file():
            raise RuntimeError(f"Held emote recording is missing: {source}")
        shutil.copyfile(source, target / source.name)
        shipped[key] = {field: held[key][field] for field in SHIPPED_FIELDS if field in held[key]}
    (ROOT / "source/data/emote-voices.json").write_text(json.dumps(shipped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Promoted {len(shipped)} emote recordings to {target}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--emotes", action="store_true", help="voice the duel emotes instead of the campaign story: Rick's four lines and each champion's four replies")
    parser.add_argument("--promote", action="store_true", help="with --emotes: copy the held emote recordings into the game instead of generating")
    parser.add_argument("--chapters", default="", help="chapter numbers, comma-separated; default is all 20")
    parser.add_argument("--keys", default="all", help="recording keys, comma-separated; an unfiltered default run includes all 80 boss lines, Rick's prologue and 20 Rick selections")
    parser.add_argument("--stages", default=",".join(STAGES), help="stage names, comma-separated")
    parser.add_argument("--force", action="store_true", help="regenerate selected recordings even when current")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--model-dir", default="", help="optional explicit VoiceDesign model directory")
    parser.add_argument("--base-model-dir", default="", help="optional explicit Base voice-cloning model directory")
    args = parser.parse_args()
    if args.promote:
        if not args.emotes:
            parser.error("--promote only applies to --emotes")
        return promote_emotes()
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

    protagonist = cast["protagonist"]
    clone = protagonist.get("clone")
    if not isinstance(clone, dict) or clone.get("model") != VOICE_CLONE_ENGINE:
        raise RuntimeError(
            "Rick's cast must declare the approved Qwen Base model in protagonist.clone.model."
        )
    reference_audio = project_file(str(clone.get("referenceAudio") or ""), "Rick reference audio")
    reference_transcript_file = project_file(
        str(clone.get("referenceTranscriptFile") or ""), "Rick reference transcript"
    )
    reference_transcript = str(clone.get("referenceTranscript") or "")
    if not reference_transcript.strip():
        raise RuntimeError("Rick's Base clone configuration has no reference transcript.")
    if reference_transcript_file.read_text(encoding="utf-8").strip() != reference_transcript.strip():
        raise RuntimeError(
            "Rick's saved Base transcript does not match the reference transcript file. "
            "Repair the exact transcript before generating cloned dialogue."
        )

    if args.emotes:
        design_jobs, clone_jobs, identity = emote_jobs(
            story, cast, clone, reference_audio, reference_transcript.strip(), selected_keys,
        )
        if not identity:
            raise RuntimeError("No emote voice jobs selected")
        target = ROOT / ".preview/voice-full-hold/emotes"
        raw = ROOT / ".preview/campaign-voices/raw-emotes"
        manifest_path = ROOT / ".preview/voice-full-hold/emote-voices.json"
        result = run_generation(design_jobs, "design", target, raw, manifest_path, args, args.model_dir)
        if result != 0:
            return result
        result = run_generation(clone_jobs, "base", target, raw, manifest_path, args, args.base_model_dir)
        if result != 0:
            return result
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key, fields in identity.items():
            manifest[key] = {**manifest.get(key, {}), **fields}
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Convergence emote jobs: {len(identity)} requested; manifest now contains {len(manifest)} recordings")
        return 0

    design_jobs: list[dict[str, object]] = []
    clone_jobs: list[dict[str, object]] = []
    known_keys: set[str] = {RICK_PROLOGUE_KEY}
    known_keys.update(
        f"{int(chapter['chapter']):02d}-{suffix}"
        for chapter in story["chapters"]
        for suffix in (*STAGES, RICK_INTRO_SUFFIX)
    )

    def selected(key: str, number: int, *, kind: str) -> bool:
        if selected_keys is not None:
            return key in selected_keys
        if chapters and number not in chapters:
            return False
        if kind == "boss":
            return True
        return True

    include_prologue = (
        RICK_PROLOGUE_KEY in selected_keys
        if selected_keys is not None
        else not chapters and set(stages) == set(STAGES)
    )
    if include_prologue:
        text = str(story["premise"])
        clone_jobs.append({
            "id": RICK_PROLOGUE_KEY,
            "text": text,
            "spoken": text,
            "seed": int(clone.get("seed", protagonist["seed"])),
            "engine": VOICE_CLONE_ENGINE,
            "reference_audio": str(reference_audio),
            "reference_transcript": reference_transcript.strip(),
            "filters": ["highpass=f=65"],
        })

    for chapter in story["chapters"]:
        number = int(chapter["chapter"])
        voice = cast["cast"][str(number)]
        intro_key = f"{number:02d}-{RICK_INTRO_SUFFIX}"
        if selected(intro_key, number, kind="rick"):
            intro = str(chapter.get("rickIntro") or "").strip()
            if not intro:
                raise RuntimeError(f"Chapter {number} is missing Rick's selection dialogue.")
            clone_jobs.append({
                "id": intro_key,
                "text": intro,
                "spoken": intro,
                "seed": int(clone.get("seed", protagonist["seed"])),
                "engine": VOICE_CLONE_ENGINE,
                "reference_audio": str(reference_audio),
                "reference_transcript": reference_transcript.strip(),
                "filters": ["highpass=f=65"],
            })
        for stage in stages:
            key = f"{number:02d}-{stage}"
            if not selected(key, number, kind="boss"):
                continue
            text = str(chapter[stage])
            spoken = text.capitalize() if number == 20 else text
            direction = str(voice["direction"][stage])
            design_jobs.append({
                "id": key,
                "text": text,
                "spoken": spoken,
                "voice": str(voice["voice"]),
                "direction": direction,
                "seed": int(voice["seed"]),
                "engine": VOICE_DESIGN_ENGINE,
                "filters": filters_for(number),
            })

    requested_keys = design_jobs + clone_jobs
    requested_ids = {str(job["id"]) for job in requested_keys}
    if selected_keys is not None:
        unknown = sorted(selected_keys - known_keys)
        if unknown:
            raise RuntimeError(f"Unknown campaign voice key(s): {', '.join(unknown)}")
    if not requested_keys:
        raise RuntimeError("No campaign voice jobs selected")

    target = ROOT / ".preview/voice-full-hold/campaign"
    raw = ROOT / ".preview/campaign-voices/raw"
    manifest_path = ROOT / ".preview/voice-full-hold/campaign-voices.json"
    result = run_generation(design_jobs, "design", target, raw, manifest_path, args, args.model_dir)
    if result != 0:
        return result
    result = run_generation(clone_jobs, "base", target, raw, manifest_path, args, args.base_model_dir)
    if result != 0:
        return result

    # Keep the Convergence manifest useful to the game-specific validator.
    # The shared engine owns audio fields; this adapter owns chapter, boss and
    # stage identity.
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for job in requested_keys:
        key = str(job["id"])
        if key == RICK_PROLOGUE_KEY:
            entry = manifest.get(key, {})
            entry.update({
                "chapter": 0,
                "speaker": protagonist["name"],
                "stage": "prologue",
                "text": story["premise"],
            })
            manifest[key] = entry
            continue
        number = int(key.split("-", 1)[0])
        stage = key.split("-", 1)[1]
        chapter = next(item for item in story["chapters"] if int(item["chapter"]) == number)
        entry = manifest.get(key, {})
        entry.update({"chapter": number, "bossId": chapter["bossId"], "stage": stage, "text": chapter[stage] if stage in STAGES else chapter["rickIntro"], "speaker": protagonist["name"] if stage == RICK_INTRO_SUFFIX else cast["cast"][str(number)]["name"]})
        manifest[key] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Convergence campaign jobs: {len(requested_ids)} requested; manifest now contains {len(manifest)} recordings")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"CAMPAIGN VOICE ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
