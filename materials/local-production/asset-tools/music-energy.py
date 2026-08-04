"""How DRIVING is a track, measured rather than guessed.

The owner's complaint about the battle bed is "too calm, I fall asleep". RMS
loudness does not capture that — a sustained pad is loud and sleepy. What
separates driving from calm is the rate and sharpness of ONSETS: how often the
signal jumps, which is drums and plucked/struck attacks.

Two numbers per track, both over the candidate loop window:
  onsets/sec  — how many spectral-flux peaks per second (tempo/percussion)
  crest       — peak-to-RMS ratio, i.e. how much transient sits above the bed

Compared against the CURRENT battle.ogg so the claim is relative, not absolute.
"""
import sys, wave, array, math, os

def onsets(path, start=0.0, dur=None):
    with wave.open(path, "rb") as w:
        rate, chans, n = w.getframerate(), w.getnchannels(), w.getnframes()
        w.setpos(min(int(start * rate), n - 1))
        want = n - int(start * rate) if dur is None else int(dur * rate)
        raw = w.readframes(min(want, n - int(start * rate)))
    s = array.array("h", raw)
    if chans == 2:
        s = array.array("h", [(s[i] + s[i + 1]) // 2 for i in range(0, len(s) - 1, 2)])
    hop = rate // 100                       # 10 ms frames
    frames = len(s) // hop
    env = []
    for f in range(frames):
        chunk = s[f * hop : (f + 1) * hop]
        env.append(math.sqrt(sum(float(v) * v for v in chunk) / max(1, len(chunk))))
    # Spectral-flux stand-in: positive first difference of the amplitude
    # envelope, which is what an onset detector thresholds.
    flux = [max(0.0, env[i] - env[i - 1]) for i in range(1, len(env))]
    if not flux:
        return 0, 0
    mean = sum(flux) / len(flux)
    sd = math.sqrt(sum((v - mean) ** 2 for v in flux) / len(flux))
    thresh = mean + sd
    count, last = 0, -99
    for i, v in enumerate(flux):
        if v > thresh and i - last > 6:      # 60 ms refractory
            count += 1
            last = i
    secs = len(env) / 100
    rms = math.sqrt(sum(v * v for v in env) / len(env))
    crest = max(env) / rms if rms else 0
    return count / secs, crest

for spec in sys.argv[1:]:
    parts = spec.split(":")
    path = parts[0]
    start = float(parts[1]) if len(parts) > 1 else 0.0
    dur = float(parts[2]) if len(parts) > 2 else None
    rate, crest = onsets(path, start, dur)
    print(f"{os.path.basename(path):<24} from {start:>5.0f}s  onsets/sec {rate:5.2f}   crest {crest:5.2f}")
