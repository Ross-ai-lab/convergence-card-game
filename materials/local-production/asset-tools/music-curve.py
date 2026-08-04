"""Per-second RMS as a bar chart, so the loop window is picked by LOOKING at the
energy curve rather than trusting a sustained-energy selector.

The selector reliably returns the OUTRO crescendo (README, menu.ogg recipe), so
the last 15% is excluded and an early statement is preferred. Prints the whole
curve because the dips matter as much as the peaks — a loop must not span one.
"""
import subprocess, sys, wave, array, math, os

for path in sys.argv[1:]:
    with wave.open(path, "rb") as w:
        rate, chans, n = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = w.readframes(n)
    samples = array.array("h", raw)
    per_sec = rate * chans
    secs = len(samples) // per_sec
    rms = []
    for s in range(secs):
        chunk = samples[s * per_sec : (s + 1) * per_sec]
        rms.append(math.sqrt(sum(float(v) * v for v in chunk) / len(chunk)))
    med = sorted(rms)[len(rms) // 2]
    peak = max(rms)
    print(f"\n=== {os.path.basename(path)}  {secs}s  median {med:.0f}  peak {peak:.0f} ===")
    for s, v in enumerate(rms):
        bar = "#" * int(v / peak * 56)
        mark = "  <-- last 15%" if s > secs * 0.85 else ""
        print(f"{s//60}:{s%60:02d} {v/med:5.2f} {bar}{mark}")

    # Best sustained 46s window, restricted to the first 85% of the track.
    win = 46
    best, best_at = 0, 0
    for start in range(0, max(1, int(secs * 0.85) - win)):
        avg = sum(rms[start : start + win]) / win
        low = min(rms[start : start + win])
        # A window is only as good as its quietest second: a loop that spans a
        # hard dip sounds like the music stopped every time it wraps.
        score = avg * (low / med)
        if score > best:
            best, best_at = score, start
    print(f"BEST 46s WINDOW: {best_at//60}:{best_at%60:02d} -> {(best_at+win)//60}:{(best_at+win)%60:02d}"
          f"  (avg {sum(rms[best_at:best_at+win])/win/med:.2f}x median, floor {min(rms[best_at:best_at+win])/med:.2f}x)")
