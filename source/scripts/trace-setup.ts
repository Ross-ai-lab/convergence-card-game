/**
 * Vitest setup file: writes out whatever `src/engine/trace.ts` recorded.
 *
 * It lives here, outside the engine, so that `node:fs` never enters the engine's
 * module graph — the engine is imported by the browser bundle. This file is only
 * ever loaded by vitest, which is Node, so it can import freely.
 *
 * USE `afterAll`, NOT `process.on("exit")`. That was the bug that cost an
 * evening: the recorder filled correctly inside the worker, and the file was
 * never written, because vitest tears its forked workers down without a clean
 * process exit. Neither `exit` nor `beforeExit` fires, nothing errors, and the
 * result is a coverage report that reads as "nothing is tested" on a suite of
 * 244 passing tests. `afterAll` registered from a setup file runs once per test
 * file, inside the worker, while it is still alive.
 *
 * APPEND, NEVER REPLACE. Each test file runs in its own forked worker (see
 * vitest.config.ts), so every worker holds a different slice of the truth and a
 * writer that replaced the file would leave only the last slice. The coverage
 * script unions the lines.
 *
 * When `CONVERGENCE_EFFECT_TRACE` is unset — every normal test run — this
 * registers one empty hook and does nothing else.
 */

import { afterAll } from "vitest";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const KEY = "__convergenceEffectTrace";
const target = process.env.CONVERGENCE_EFFECT_TRACE;

if (target) {
  mkdirSync(dirname(target), { recursive: true });

  afterAll(() => {
    const seen = (globalThis as unknown as { [KEY]?: Set<string> })[KEY];
    if (!seen?.size) return;
    appendFileSync(target, `${[...seen].join("\n")}\n`, "utf8");
    seen.clear();
  });
}
