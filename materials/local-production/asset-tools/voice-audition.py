"""Repackage the approved Qwen audition clips without regenerating rejected tests."""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "materials/voice-auditions"
TEMP = ROOT / ".preview/voice-comparison"
TEMP.mkdir(parents=True, exist_ok=True)
story = json.loads((ROOT / "materials/campaign-story.json").read_text(encoding="utf-8"))
samples = [
    ("01-glados", "GLaDOS", 1, "play"),
    ("02-vader", "Darth Vader", 6, "entrance"),
    ("03-goku", "Goku", 19, "defeat"),
    ("04-bill", "Bill Cipher", 20, "loss"),
]


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def normalize(source, target, filters):
    measurement = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(source),
        "-af", ",".join(filters + ["loudnorm=I=-18:TP=-1.5:LRA=9:print_format=json"]),
        "-f", "null", "-",
    ])
    stats = json.JSONDecoder().raw_decode(measurement.stderr[measurement.stderr.rfind("{"):])[0]
    norm = (
        "loudnorm=I=-18:TP=-1.5:LRA=9:"
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
        f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
        f"offset={stats['target_offset']}:linear=true"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-af", ",".join(filters + [norm]), "-ar", "24000", "-ac", "1",
        "-c:a", "libmp3lame", "-b:a", "96k", str(target),
    ])


manifest = []
playlist = []
for slug, name, chapter, stage in samples:
    text = story["chapters"][chapter - 1][stage]
    source = ROOT / ".preview/voice-full-hold/campaign" / f"{chapter:02d}-{stage}.ogg"
    if not source.exists():
        raise RuntimeError(f"Missing retained Qwen sample: {source}")
    output = OUT / "qwen" / f"{slug}.mp3"
    normalize(source, output, ["anull"])
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(output),
    ], text=True))
    manifest.append({
        "engine": "qwen",
        "name": name,
        "chapter": chapter,
        "stage": stage,
        "text": text,
        "file": f"qwen/{slug}.mp3",
        "duration": duration,
        "voice": "Qwen3-TTS VoiceDesign",
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    })
    audio, rate = sf.read(output)
    if rate != 24000:
        raise RuntimeError(f"Unexpected sample rate for {output}: {rate}")
    playlist.extend([audio, np.zeros(24000), np.zeros(24000)])
    print("DONE", name, round(duration, 1), "seconds", flush=True)

wav = TEMP / "qwen-playlist.wav"
sf.write(wav, np.concatenate(playlist), 24000)
normalize(wav, OUT / "qwen-samples.mp3", ["anull"])
(OUT / "samples.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("READY Qwen audition samples only", flush=True)
