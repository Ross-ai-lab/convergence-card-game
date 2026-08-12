import { defineConfig } from "vitest/config";

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
  },
});
