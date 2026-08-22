import { describe, expect, it } from "vitest";

import { createInitialGame } from "../src/engine/game";
import { BOT_CHEATS, type BotSkill } from "../src/engine/bot";
import { loadData, playOneGame, resolveCheatSeat, type GameResult } from "./sim-core";
import type { PlayerId } from "../src/engine/types";

/**
 * The one wiring mistake in the cheat work that would be silent and expensive:
 * letting an engine-side cheat leak into the card-balance measurement.
 *
 * Self-play produces every card's win rate. If the Ascendant draws two and keeps
 * one during those duels, every one of those numbers describes a game nobody
 * plays, and nothing about the output would look wrong. The ladder is the exact
 * opposite case and must have the cheat on.
 *
 * HOW THIS FILE TESTS THAT, AND WHY IT CHANGED.
 *
 * Until 2026-08-22 all three checks below played complete duels and compared
 * their final scoreboards, inferring from a changed outcome that the flag must
 * have been on. Twelve full duels, two of them Ascendant against Ascendant,
 * which is the most expensive pairing the game has: 123.5 seconds to prove that
 * one boolean is connected.
 *
 * It was an indirect test as well as a slow one. `grantCheats` has exactly one
 * effect on the world — it decides `foresightFor`, a single field written into
 * the setup before the first card is dealt — so the seat that field names IS
 * the answer, and reading it is stricter than reading a final score. Two
 * scoreboards can also match by luck, which is the failure mode the old version
 * papered over by using three seeds.
 *
 * `resolveCheatSeat` is the decision itself, lifted out of `playOneGame` so the
 * two cannot drift: the harness and these tests now call the same function.
 *
 * ONE end-to-end duel pair survives, because a state assertion can only see the
 * channel it was told about. If a future cheat is ever granted by some route
 * other than `foresightFor`, the seat check would stay green while the duel it
 * produced quietly changed. That case is worth two duels; it was never worth
 * twelve.
 */
const { cards, relics } = loadData();

function seatFor(skills: [BotSkill, BotSkill], grantCheats?: boolean): PlayerId | null {
  return resolveCheatSeat(["bot", "bot"], skills, grantCheats);
}

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
  it("defaults to off, so a caller that says nothing measures the honest game", () => {
    // Self-play is the caller that says nothing, and every card win rate in the
    // project comes out of it. Nobody gets Foresight there, at any skill.
    expect(seatFor(["hard", "normal"], undefined)).toBeNull();
    expect(seatFor(["hard", "normal"], false)).toBeNull();
    expect(seatFor(["hard", "hard"], undefined)).toBeNull();
    expect(seatFor(["normal", "easy"], undefined)).toBeNull();

    // And the engine agrees: a game built the self-play way carries no holder.
    const state = createInitialGame(cards, "cheatwire-default", relics, {});
    expect(state.foresightFor ?? null).toBeNull();
  });

  it("gives it to the Ascendant seat, whichever seat that is", () => {
    expect(seatFor(["hard", "normal"], true)).toBe(0);
    expect(seatFor(["normal", "hard"], true)).toBe(1);

    // The table is the authority on who qualifies, so a skill whose row says
    // `foresight: false` must never be handed it, however the seats are ordered.
    for (const skill of ["easy", "normal"] as BotSkill[]) {
      expect(BOT_CHEATS[skill].foresight).toBe(false);
      expect(seatFor([skill, skill], true)).toBeNull();
    }
    expect(BOT_CHEATS.hard.foresight).toBe(true);
  });

  it("gives it to nobody when both seats would qualify", () => {
    // The field holds one seat, and a duel where both sides burn two cards a
    // turn is a different game. Hard-vs-hard therefore stays clean.
    expect(seatFor(["hard", "hard"], true)).toBeNull();
  });

  it("actually reaches the engine, end to end, on a real duel", () => {
    // The backstop. Same seed, same skills, same shuffle: if granting the cheat
    // changed nothing about how the duel played out, the flag is decorative and
    // every seat assertion above is testing a function nobody obeys.
    expect(fingerprint(duel("cheatwire-a", true))).not.toBe(fingerprint(duel("cheatwire-a", false)));
    // Two duels, roughly 25s. It was six duels and 91s for the same claim.
  }, 180_000);
});
