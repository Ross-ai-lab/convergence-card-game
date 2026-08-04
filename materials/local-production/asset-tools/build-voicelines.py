"""
Renders one spoken line for every card in the roster.

    py -3.14 materials/local-production/asset-tools/build-voicelines.py
    py -3.14 materials/local-production/asset-tools/build-voicelines.py --only c001,c025
    py -3.14 materials/local-production/asset-tools/build-voicelines.py --force
    py -3.14 materials/local-production/asset-tools/build-voicelines.py --sample

Pipeline per card, from `data/voicelines.csv`:

    edge-tts (free Microsoft neural voice, rate + pitch per card)
      -> a DSP treatment chain in ffmpeg that turns 26 stock voices into 175
         distinct characters (a titan gets a sub-octave layer and a cathedral,
         a machine gets bandpassed and bitcrushed, a ghost gets a detuned twin)
      -> silence trimmed, fitted under three seconds without ever clipping a word
      -> loudness-matched so no card is twice as loud as its neighbour
      -> mono OGG in public/audio/vo/

Nothing here clones a real actor and nothing rips source audio: every clip is a
synthetic voice reading a line written for this game.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "source"
SHEET = ROOT / "data" / "voicelines.csv"
OUT_DIR = ROOT / "public" / "audio" / "vo"
ANNOUNCER_SHEET = ROOT / "data" / "announcer.csv"
ANNOUNCER_DIR = OUT_DIR / "announcer"

#: Speech longer than this is sped up to fit rather than cut off mid-word.
TARGET_SPEECH = 2.9
#: Hard ceiling including any reverb tail.
HARD_CAP = 3.4
SR = 24000

SAMPLE_IDS = ["c025", "c027", "c002", "c029", "c063", "c136", "c005", "c164", "c104", "c044"]


# ---------------------------------------------------------------------------
# The treatments. Each returns an ffmpeg filter_complex body ending at [out].
#
# Two tricks do most of the work. A pitch shift done as
# `asetrate -> aresample -> atempo` moves the formants with the pitch, which is
# what makes a voice sound like a bigger or smaller *body* rather than a
# tape-speed effect. And mixing a voice with a detuned or octave-shifted copy of
# itself makes one throat sound like two, which is where monsters, ghosts and
# collectives come from.
# ---------------------------------------------------------------------------

def _shift(ratio: float, tag_in: str, tag_out: str) -> str:
    """Pitch shift by `ratio` with the duration preserved. Formants move too."""
    tempo = 1.0 / ratio
    # atempo only accepts 0.5..2.0 per instance; chain two when we need more.
    if tempo > 2.0:
        stages = f"atempo=2.0,atempo={tempo / 2.0:.5f}"
    elif tempo < 0.5:
        stages = f"atempo=0.5,atempo={tempo / 0.5:.5f}"
    else:
        stages = f"atempo={tempo:.5f}"
    return f"[{tag_in}]asetrate={SR}*{ratio:.4f},aresample={SR},{stages}[{tag_out}]"


def _room(taps: str, gains: str, wet: float = 0.85) -> str:
    return f"aecho=0.9:{wet}:{taps}:{gains}"


def treatment_chain(name: str) -> str:
    """The filter_complex for one treatment, from [0:a] to [out]."""
    if name == "plain":
        return (
            "[0:a]highpass=f=85,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,"
            f"{_room('18|31', '0.13|0.07', 0.55)}[out]"
        )

    if name == "hero":
        return (
            "[0:a]highpass=f=95,equalizer=f=3800:t=q:w=1.2:g=4,equalizer=f=180:t=q:w=1:g=2,"
            "acompressor=threshold=-20dB:ratio=4:attack=4:release=100,"
            f"{_room('42|74', '0.24|0.13', 0.7)}[out]"
        )

    if name == "titan":
        # Voice dropped hard, plus a half-speed octave under it for the chest, in
        # a cathedral. This is the one that has to sound physically enormous.
        #
        # Tuned DOWN from its first version: at a 0.76 shift with a 0.55 sub and a
        # 0.42 reverb tail, the transcribe-back check heard "And the news" for
        # "Balance. At any cost." A titan nobody can understand is not a titan, it
        # is mud — the weight comes from the octave underneath, not from drowning
        # the consonants.
        # Softened a SECOND time. The cards on this chain also carry the roster's
        # deepest per-card pitch dials (Thanos is already -20 Hz before the
        # treatment sees him), so the two compound and 4 of the 6 clips the QA
        # pass could not read back were titans. The lead now barely shifts and the
        # size comes almost entirely from the octave underneath.
        return (
            "[0:a]asplit=2[t_a][t_b];"
            + _shift(0.87, "t_a", "t_lead")
            + ";"
            + _shift(0.50, "t_b", "t_sub_raw")
            + ";[t_sub_raw]lowpass=f=160,volume=0.30[t_sub];"
            "[t_lead][t_sub]amix=inputs=2:normalize=0,"
            "equalizer=f=2600:t=q:w=1.3:g=4,lowpass=f=8200,"
            f"{_room('110|187|301', '0.22|0.13|0.07', 0.78)}[out]"
        )

    if name == "demon":
        # A rough growl: the voice mixed with a fifth below itself, then bitten.
        return (
            "[0:a]asplit=2[d_a][d_b];"
            + _shift(0.82, "d_a", "d_lead")
            + ";"
            + _shift(0.61, "d_b", "d_growl_raw")
            + ";[d_growl_raw]lowpass=f=1400,volume=0.6[d_growl];"
            "[d_lead][d_growl]amix=inputs=2:normalize=0,"
            "acrusher=level_in=1:level_out=1:bits=11:mode=log:aa=1,"
            "aphaser=type=t:speed=0.4:decay=0.3,lowpass=f=6800,"
            f"{_room('56|97', '0.3|0.19', 0.82)}[out]"
        )

    if name == "beast":
        return (
            "[0:a]asplit=2[b_a][b_b];"
            + _shift(0.80, "b_a", "b_lead")
            + ";"
            + _shift(0.56, "b_b", "b_sub_raw")
            + ";[b_sub_raw]lowpass=f=900,volume=0.5[b_sub];"
            "[b_lead][b_sub]amix=inputs=2:normalize=0,"
            "equalizer=f=1600:t=q:w=1.4:g=3,lowpass=f=6200,"
            f"{_room('34|58', '0.24|0.14', 0.7)}[out]"
        )

    if name == "machine":
        # Narrow band, quantised, with very short echoes for the metal box.
        return (
            "[0:a]highpass=f=310,lowpass=f=3300,"
            "acrusher=level_in=1:level_out=1:bits=9:mode=log:aa=1,"
            "equalizer=f=2100:t=q:w=1.5:g=4,"
            f"{_room('7|11|17', '0.45|0.3|0.2', 0.8)}[out]"
        )

    if name == "radio":
        return (
            "[0:a]highpass=f=420,lowpass=f=2700,"
            "acompressor=threshold=-24dB:ratio=8:attack=2:release=60,"
            "alimiter=level_in=1.6:level_out=0.92,"
            f"{_room('9|14', '0.28|0.16', 0.6)}[out]"
        )

    if name == "ancient":
        # One throat, two voices, slightly out of tune with each other. The tail
        # is long but thin — same lesson as titan and void, a four-tap wet reverb
        # over an already-deep voice turned Gravelord Nito into porridge.
        return (
            "[0:a]asplit=2[a_a][a_b];"
            + _shift(0.985, "a_a", "a_l")
            + ";"
            + _shift(1.014, "a_b", "a_r")
            + ";[a_l][a_r]amix=inputs=2:normalize=0,"
            "equalizer=f=2600:t=q:w=1.3:g=3,lowpass=f=8200,"
            f"{_room('130|221|360|540', '0.27|0.19|0.12|0.07', 0.82)}[out]"
        )

    if name == "void":
        # Also pulled back after QA: a 4.2 kHz ceiling removes the consonants
        # outright, and four wet taps smeared what was left. The unearthly part is
        # the detuned twin and the long tail, neither of which needs the voice
        # buried to work.
        return (
            "[0:a]asplit=2[v_a][v_b];"
            + _shift(0.94, "v_a", "v_l")
            + ";"
            + _shift(1.05, "v_b", "v_r")
            + ";[v_l][v_r]amix=inputs=2:normalize=0,"
            "equalizer=f=2800:t=q:w=1.3:g=3,lowpass=f=6000,"
            f"{_room('180|330|520|760', '0.32|0.22|0.14|0.09', 0.85)}[out]"
        )

    if name == "spectral":
        return (
            "[0:a]asplit=2[s_a][s_b];"
            "[s_a]anull[s_l];"
            + _shift(1.42, "s_b", "s_ghost_raw")
            + ";[s_ghost_raw]highpass=f=700,volume=0.34[s_ghost];"
            "[s_l][s_ghost]amix=inputs=2:normalize=0,"
            "tremolo=f=5.5:d=0.35,lowpass=f=6800,"
            f"{_room('150|265|420', '0.44|0.32|0.22', 0.93)}[out]"
        )

    if name == "manic":
        return (
            "[0:a]highpass=f=120,equalizer=f=2600:t=q:w=1.3:g=5,"
            "acompressor=threshold=-24dB:ratio=6:attack=2:release=60,"
            "alimiter=level_in=1.4:level_out=0.95,"
            f"{_room('13|21', '0.2|0.1', 0.55)}[out]"
        )

    if name == "whisper":
        # Close and dry. No tail at all — a tail would put them across the room.
        return (
            "[0:a]highpass=f=150,equalizer=f=3100:t=q:w=1.1:g=5,"
            "equalizer=f=250:t=q:w=1:g=-2,"
            "acompressor=threshold=-26dB:ratio=6:attack=3:release=90,"
            "volume=1.1[out]"
        )

    if name == "regal":
        return (
            "[0:a]highpass=f=80,equalizer=f=190:t=q:w=1:g=3,equalizer=f=3200:t=q:w=1.4:g=2,"
            "acompressor=threshold=-19dB:ratio=3:attack=8:release=160,"
            "lowpass=f=9500,"
            f"{_room('140|248|398', '0.38|0.27|0.18', 0.88)}[out]"
        )

    if name == "herald":
        # The announcer, and ONLY the announcer. It has to be instantly separable
        # from all 175 card voices, so it gets the one thing no card gets: real
        # width. A short slap either side of centre plus a long hall reads as a
        # voice speaking from the arena itself rather than from a card on it.
        return (
            "[0:a]asplit=2[h_a][h_b];"
            + _shift(0.94, "h_a", "h_l")
            + ";[h_b]anull[h_r];"
            "[h_l][h_r]amix=inputs=2:normalize=0,"
            "highpass=f=90,equalizer=f=180:t=q:w=1:g=3,equalizer=f=2900:t=q:w=1.2:g=4,"
            "acompressor=threshold=-21dB:ratio=4:attack=6:release=140,"
            f"{_room('63|118|196|318', '0.34|0.24|0.16|0.1', 0.86)}[out]"
        )

    if name == "child":
        return (
            _shift(1.10, "0:a", "c_up")
            + ";[c_up]equalizer=f=4200:t=q:w=1.3:g=3,highpass=f=170,"
            "acompressor=threshold=-20dB:ratio=3.5,"
            f"{_room('16|27', '0.18|0.1', 0.6)}[out]"
        )

    raise SystemExit(f"unknown treatment: {name}")


# ---------------------------------------------------------------------------


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def duration_of(path: Path) -> float:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "default=nw=1:nk=1", str(path)])
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


async def speak(text: str, voice: str, rate: str, pitch: str, out: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(out))


def treat(raw: Path, treatment: str, out: Path) -> tuple[bool, str]:
    """Applies the treatment, fits the clip under the cap, and encodes it."""
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / "staged.wav"

        # Stage one: mono, resampled, silence off both ends, then the character.
        chain = treatment_chain(treatment)
        pre = (
            f"[0:a]aformat=channel_layouts=mono,aresample={SR},"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,"
            "areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,"
            "areverse[pre]"
        )
        body = chain.replace("[0:a]", "[pre]", 1)
        result = run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw),
            "-filter_complex", f"{pre};{body}", "-map", "[out]",
            "-ar", str(SR), "-ac", "1", str(staged),
        ])
        if result.returncode != 0:
            return False, result.stderr.strip().splitlines()[-1] if result.stderr else "ffmpeg failed"

        # Stage two: fit. A line that runs long is compressed in time rather than
        # cut, because a clipped final word is far worse than a slightly quick one.
        length = duration_of(staged)
        speed = 1.0
        if length > TARGET_SPEECH:
            speed = min(1.28, length / TARGET_SPEECH)
        tail = f"atempo={speed:.4f}," if speed > 1.001 else ""
        result = run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(staged),
            "-af",
            f"{tail}atrim=0:{HARD_CAP},"
            f"afade=t=out:st={max(0.1, min(HARD_CAP, length / speed) - 0.16):.3f}:d=0.16,"
            "loudnorm=I=-17:TP=-1.5:LRA=11,"
            f"aresample={SR}",
            "-ac", "1", "-c:a", "libvorbis", "-q:a", "2", str(out),
        ])
        if result.returncode != 0:
            return False, result.stderr.strip().splitlines()[-1] if result.stderr else "encode failed"
    return True, ""


async def build(rows: list[dict], force: bool, jobs: int) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [r for r in rows if force or not (OUT_DIR / f"{r['id']}.ogg").exists()]
    if not todo:
        print("Everything already rendered. Use --force to rebuild.")
        return 0

    print(f"Rendering {len(todo)} voice lines ({jobs} at a time)…")
    gate = asyncio.Semaphore(jobs)
    failures: list[str] = []
    done = 0

    async def one(row: dict) -> None:
        nonlocal done
        async with gate:
            with tempfile.TemporaryDirectory() as tmp:
                raw = Path(tmp) / "raw.mp3"
                try:
                    await speak(row["line"], row["voice"], row["rate"], row["pitch"], raw)
                except Exception as error:  # noqa: BLE001 — one bad clip must not kill the run
                    failures.append(f"{row['id']} {row['name']}: TTS — {error}")
                    return
                if not raw.exists() or raw.stat().st_size < 500:
                    failures.append(f"{row['id']} {row['name']}: TTS produced nothing")
                    return
                ok, message = await asyncio.to_thread(
                    treat, raw, row["treatment"], OUT_DIR / f"{row['id']}.ogg"
                )
                if not ok:
                    failures.append(f"{row['id']} {row['name']}: {message}")
                    return
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(todo)}")

    await asyncio.gather(*(one(row) for row in todo))

    sizes = [(OUT_DIR / f"{r['id']}.ogg") for r in rows if (OUT_DIR / f"{r['id']}.ogg").exists()]
    total = sum(p.stat().st_size for p in sizes)
    print(f"\n{len(sizes)} clips on disk, {total / 1024 / 1024:.2f} MB total")
    if failures:
        print(f"\n{len(failures)} FAILED:")
        for failure in failures[:25]:
            print(f"  {failure}")
        return 1
    print("No failures.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="", help="comma-separated card ids")
    parser.add_argument("--sample", action="store_true", help="render the 10-card taster")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--jobs", type=int, default=6)
    parser.add_argument("--manifest", action="store_true", help="write vo-manifest.json and exit")
    parser.add_argument("--announcer", action="store_true", help="render the announcer lines instead")
    args = parser.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg is not on PATH.")
        return 1

    if args.announcer:
        # The announcer shares the whole pipeline — same TTS, same treatment
        # chains, same fitting and loudness matching — so it can never drift out
        # of level with the 175 card voices it plays alongside.
        global OUT_DIR
        rows = list(csv.DictReader(ANNOUNCER_SHEET.open(encoding="utf-8")))
        for row in rows:
            row.setdefault("name", row["id"])
        OUT_DIR = ANNOUNCER_DIR
        return asyncio.run(build(rows, True, args.jobs))

    if not SHEET.exists():
        print(f"Missing {SHEET}. Run the local asset-tools/build-cast-sheet.mjs")
        return 1

    rows = list(csv.DictReader(SHEET.open(encoding="utf-8")))

    if args.manifest:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        manifest = {r["id"]: r["line"] for r in rows if (OUT_DIR / f"{r['id']}.ogg").exists()}
        (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=0), encoding="utf-8")
        print(f"manifest.json — {len(manifest)} clips")
        return 0

    if args.sample:
        rows = [r for r in rows if r["id"] in SAMPLE_IDS]
    elif args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        rows = [r for r in rows if r["id"] in wanted]

    if not rows:
        print("Nothing selected.")
        return 1
    return asyncio.run(build(rows, args.force or args.sample or bool(args.only), args.jobs))


if __name__ == "__main__":
    sys.exit(main())
