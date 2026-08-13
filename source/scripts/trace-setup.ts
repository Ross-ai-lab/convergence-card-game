/**
 * Vitest setup file: writes out whatever `src/engine/trace.ts` recorded.
 *
 * It lives here, outside the engine, so that `node:fs` never enters the engine's
 * module graph — the engine is imported by the browser bundle. This file is only
 * ever loaded by vitest, which is Node, so it can import freely.
 *
 * APPEND, NEVER REPLACE. The suite runs each test file in its own forked worker
 * (see vitest.config.ts), so every worker holds a different slice of the truth
 * and a writer that replaced the file would leave only the last one's slice.
 * The coverage script unions the lines.
 *
 * When `CONVERGENCE_EFFECT_TRACE` is unset — which is every normal test run —
 * the recorder never fills, this writes nothing, and the whole thing costs one
 * exit handler.
 */

import { appendFileSync } from "node:fs";

const KEY = "__convergenceEffectTrace";
const target = process.env.CONVERGENCE_EFFECT_TRACE;

if (target) {
  const flush = () => {
    const seen = (globalThis as unknown as { [KEY]?: Set<string> })[KEY];
    if (!seen?.size) return;
    appendFileSync(target, `${[...seen].join("\n")}\n`, "utf8");
    seen.clear();
  };

  // `exit` fires for a normal end and for an explicit process.exit; `beforeExit`
  // does not fire for the latter. Registering both and clearing the set after a
  // write makes a double call harmless.
  process.on("exit", flush);
  process.on("beforeExit", flush);
}
