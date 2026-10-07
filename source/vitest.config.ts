import { configDefaults, defineConfig } from "vitest/config";

/**
 * The pacing suite runs deep deterministic bot simulations. Running several
 * test files at once makes those searches compete for CPU and can push the
 * complete test command past its wall-clock limit. One isolated worker keeps
 * the suite predictable without changing any game rules.
 */
export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    // The check runner's own selection test uses Node's built-in runner and is
    // run by the `selection` suite. Vitest finds no suite in it and fails `npm test`.
    exclude: [...configDefaults.exclude, "scripts/check-selection.test.mjs"],
    // Writes the effect-coverage trace, and only when CONVERGENCE_EFFECT_TRACE
    // is set — otherwise it registers one exit handler and does nothing. Kept
    // out of src/ so that `node:fs` stays out of the engine's module graph.
    setupFiles: ["./scripts/trace-setup.ts"],
  },
});
