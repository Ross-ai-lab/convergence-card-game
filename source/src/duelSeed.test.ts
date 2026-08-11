import { describe, expect, it } from "vitest";
import { createDuelSeed } from "./duelSeed";

describe("fresh duel seeds", () => {
  it("builds the seed from browser-provided entropy", () => {
    const first = createDuelSeed((values) => {
      values.set([0, 1, 35, 36]);
    });
    const second = createDuelSeed((values) => {
      values.set([36, 35, 1, 0]);
    });

    expect(first).toBe("convergence-0-1-z-10");
    expect(second).toBe("convergence-10-z-1-0");
    expect(first).not.toBe(second);
  });
});
