/**
 * Records which card effects actually RESOLVED during a run. Inert unless the
 * environment variable `CONVERGENCE_EFFECT_TRACE` is set.
 *
 * This exists because Kaku Kaioh printed "4x damage" while the code did 2x for
 * the game's entire balance history. Nothing caught it, and nothing could have:
 * no test ever read that multiplier. The card was correct in the data file,
 * correct in the type list, correct in its printed text, and wrong in the only
 * place that decided combat. The general shape of that bug is "an effect nobody
 * ever makes fire", and the only way to find those is to watch which ones do.
 *
 * THIS MODULE NEVER TOUCHES THE FILESYSTEM, and that is the whole design.
 * The engine is imported by the browser bundle, so a `node:fs` import here would
 * either break that build or have to be smuggled in through a dynamic import
 * racing process exit. Instead the names are parked on `globalThis`, and the
 * Node-only vitest setup file writes them out. Nothing in the engine's module
 * graph gains a Node dependency.
 *
 * It records names only — never game state — so it cannot affect determinism or
 * the seeded RNG, and the order it records in is deliberately used for nothing.
 */

const KEY = "__convergenceEffectTrace";

type TraceHost = { [KEY]?: Set<string>; process?: { env?: Record<string, string | undefined> } };

let armed: boolean | null = null;

function bucket(): Set<string> | null {
  const host = globalThis as unknown as TraceHost;

  if (armed === null) {
    try {
      // `globalThis.process` rather than a bare `process`: the browser bundle has
      // no such binding, and a bare reference throws at module load, which takes
      // the whole game down instead of quietly skipping the trace.
      armed = Boolean(host.process?.env?.CONVERGENCE_EFFECT_TRACE);
    } catch {
      armed = false;
    }
  }
  if (!armed) return null;

  if (!host[KEY]) host[KEY] = new Set<string>();
  return host[KEY]!;
}

/** Note that `effectId` resolved. A single boolean check when tracing is off. */
export function traceEffect(effectId: string): void {
  if (armed === false) return;
  if (!effectId || effectId === "none") return;
  bucket()?.add(effectId);
}
