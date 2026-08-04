/**
 * Cut a looping music bed out of a downloaded track.
 *
 *   node materials/local-production/asset-tools/build-music-bed.mjs <input.wav> <startSeconds> <lengthSeconds> <out.ogg>
 *
 * Music for this game is FOUND, never generated (owner rule — locally generated
 * beds came back "way too calm, falling asleep" twice). That made cutting a loop
 * a recurring job, and it was being done by hand from a paragraph of README
 * prose, which is how a bed shipped ten decibels louder than everything else.
 *
 * Three steps, none of them optional:
 *
 *   1. CUT the window. Pick it by looking at the per-second RMS curve
 *      (.preview/music/curve.py) — a sustained-energy selector reliably returns
 *      the OUTRO crescendo, and a loop that spans a hard dip sounds like the
 *      music stopped every time it wraps.
 *   2. FOLD the tail over the head. The last `--fade` seconds are mixed into the
 *      first `--fade` seconds, so the wrap is continuous instead of clicking.
 *      The output is therefore SHORTER than the requested length by that much.
 *   3. LOUDNESS-MATCH to I=-18 LUFS. The raw cut for menu.ogg measured -8.07
 *      against battle's -18.34; shipping that would have made the menu roughly
 *      ten decibels louder than every other bed on the bus.
 *
 * Verify with `npm run check:audio`, which has a dedicated seam check and
 * measures every bed's real peak on the master bus.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename } from "node:path";

const [input, startArg, lengthArg, output, fadeArg] = process.argv.slice(2);
if (!input || !startArg || !lengthArg || !output) {
  console.error("usage: build-music-bed.mjs <input.wav> <start s> <length s> <out.ogg> [foldSeconds]");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`no such file: ${input}`);
  process.exit(1);
}

const start = Number(startArg);
const length = Number(lengthArg);
/**
 * Seconds of tail folded over the head. 1.5 was enough for the sparse menu cut
 * (seam 0.0001) and NOT enough for a dense orchestral one — the same 1.5s fold
 * left a 0.0071 step against a 0.073 peak, about a 10% jump at every wrap, which
 * is a soft thump every 44 seconds. The busier the material, the longer the fold
 * has to be. Measure it: `npm run check:audio` prints the seam.
 */
const FADE = fadeArg ? Number(fadeArg) : 1.5;
const body = length - FADE;
const tmp = `${output}.cut.wav`;
const folded = `${output}.folded.wav`;

const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

console.log(`cut     ${basename(input)}  ${start}s +${length}s`);
ff(["-ss", String(start), "-t", String(length), "-i", input, "-ac", "2", tmp]);

console.log(`fold    last ${FADE}s over the first ${FADE}s  ->  ${body}s loop`);
ff([
  "-i", tmp,
  "-filter_complex",
  [
    `[0:a]atrim=0:${FADE},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE}[head]`,
    `[0:a]atrim=${body}:${length},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${FADE}[tail]`,
    `[head][tail]amix=inputs=2:duration=shortest:normalize=0[seam]`,
    `[0:a]atrim=${FADE}:${body},asetpts=PTS-STARTPTS[rest]`,
    `[seam][rest]concat=n=2:v=0:a=1[out]`,
  ].join(";"),
  "-map", "[out]",
  folded,
]);

console.log(`level   -> I=-18 LUFS, and encode`);
ff(["-i", folded, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-c:a", "libvorbis", "-q:a", "5", output]);

for (const file of [tmp, folded]) rmSync(file, { force: true });

const measured = execFileSync("ffmpeg", ["-v", "info", "-i", output, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const integrated = /I:\s+(-?\d+\.\d+) LUFS/.exec(measured.split("Integrated loudness").pop() ?? "");
console.log(`done    ${output}${integrated ? `  measured ${integrated[1]} LUFS` : ""}`);
