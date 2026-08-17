import { describe, expect, it } from "vitest";

import { loadData, playOneGame, type GameResult } from "./sim-core";

/**
 * The one wiring mistake in the cheat work that would be silent and expensive:
 * letting an engine-side cheat leak into the card-balance measurement.
 *
 * Self-play produces every card's win rate. If the Ascendant draws two and keeps
 * one during those duels, every one of those numbers describes a game nobody
 * plays, and nothing about the output would look wrong. The ladder is the exact
 * opposite case and must have the cheat on.
 */
const { cards, relics } = loadData();

function duel(seed: string, grantCheats: boolean | undefined): GameResult {
  return playOneGame({
    cards,
    relics,
    seed,
    drivers: ["bot", "bot"],
    skills: ["hard", "normal"],
    turnCap: 200,
    deepChecks: false,
    ...(grantCheats === undefined ? {} : { grantCheats }),
  });
}

function fingerprint(result: GameResult): string {
  return `${result.winner}:${result.turns}:${result.actions}:${result.healthLeft.join("/")}`;
}

describe("ladder cheats stay out of the balance measurement", () => {
  const seeds = ["cheatwire-a", "cheatwire-b", "cheatwire-c"];

  it("defaults to off, so a caller that says nothing measures the honest game", () => {
    for (const seed of seeds) {
      expect(fingerprint(duel(seed, undefined))).toBe(fingerprint(duel(seed, false)));
    }
  }, 120_000);

  it("actually reaches the engine when the ladder asks for it", () => {
    // Same seeds, same skills, same shuffle. If granting the cheat changed
    // nothing at all, the flag is not wired to anything.
    const changed = seeds.filter((seed) => fingerprint(duel(seed, true)) !== fingerprint(duel(seed, false)));
    expect(changed.length).toBeGreaterThan(0);
  }, 120_000);

  it("gives it to nobody when both seats would qualify", () => {
    // The field holds one seat, and a duel where both sides burn two cards a
    // turn is a different game. Hard-vs-hard therefore stays clean.
    const both = playOneGame({
      cards, relics, seed: "cheatwire-mirror", drivers: ["bot", "bot"],
      skills: ["hard", "hard"], turnCap: 200, deepChecks: false, grantCheats: true,
    });
    const neither = playOneGame({
      cards, relics, seed: "cheatwire-mirror", drivers: ["bot", "bot"],
      skills: ["hard", "hard"], turnCap: 200, deepChecks: false,
    });
    expect(fingerprint(both)).toBe(fingerprint(neither));
  }, 120_000);
});
