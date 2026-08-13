/**
 * Records which card effects actually RESOLVED during a run. Off unless the
 * environment variable `CONVERGENCE_EFFECT_TRACE` names a file to write.
 *
 * This exists because Kaku Kaioh printed "4x damage" while the code did 2x for
 * the game's entire balance history. Nothing caught it, and nothing could have:
 * no test ever read that multiplier. The card was correct in the data file,
 * correct in the type list, and wrong in the only place that matters. The
 * general shape of that bug is "an effect nobody ever exercises", and the only
 * way to find those is to watch which ones fire.
 *
 * WHY AN ENV VAR AND NOT A FLAG: the engine is imported by the browser build,
 * where `process` does not exist, so every access is guarded. When the variable
 * is unset this module is two dead branches and one unused Set. It records
 * names only — no game state — so it cannot affect determinism or the seeded
 * RNG, and the recorded order is deliberately not used for anything.
 */

const seen = new Set<string>();
let armed: boolean | null = null;
let target = "";

function traceFile(): string {
  if (armed !== null) return target;
  armed = false;
  try {
    // `globalThis.process` rather than a bare `process`: the browser bundle has
    // no such binding and a bare reference throws at module load, which would
    // take the whole game down rather than quietly skipping the trace.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    target = env?.CONVERGENCE_EFFECT_TRACE ?? "";
    armed = Boolean(target);
  } catch {
    armed = false;
  }
  return target;
}

/** Note that `effectId` resolved. Cheap no-op unless tracing is armed. */
export function traceEffect(effectId: string): void {
  if (armed === false) return;
  if (!traceFile()) return;
  if (!effectId || effectId === "none") return;
  seen.add(effectId);
}

/**
 * Write what was seen. Called from the process-exit hook the coverage script
 * installs; appends rather than replaces, because vitest runs each test file in
 * its own forked process and every one of them holds a different slice of the
 * truth. The script unions them.
 */
export async function flushEffectTrace(): Promise<void> {
  const file = traceFile();
  if (!file || !seen.size) return;
  const { appendFileSync } = await import("node:fs");
  appendFileSync(file, `${[...seen].join("\n")}\n`, "utf8");
  seen.clear();
}
