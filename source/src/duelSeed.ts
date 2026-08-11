export type RandomValuesFiller = (values: Uint32Array<ArrayBuffer>) => void;

/**
 * Give every new duel a fresh 128-bit shuffle seed. The engine remains seeded
 * and deterministic after setup, so saves, undo, tests, and replays still see
 * the exact same deck and effect rolls.
 */
export function createDuelSeed(
  fillRandomValues: RandomValuesFiller = (values) => {
    globalThis.crypto.getRandomValues(values);
  },
): string {
  const entropy = new Uint32Array(new ArrayBuffer(16));
  fillRandomValues(entropy);
  return `convergence-${Array.from(entropy, (value) => value.toString(36)).join("-")}`;
}
