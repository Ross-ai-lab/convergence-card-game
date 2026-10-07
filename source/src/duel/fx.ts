/**
 * Transient view-only duel effects: their shapes, particle generation and the
 * heavy-landing curve. The engine never sees any of this; App derives each
 * effect by diffing the previous and next GameState after an action.
 */
import type { Camp, MinionInstance, PlayerId, RelicDefinition } from "../engine/types";
import type { DuelIntroPhase } from "../screens/Screens";

// Transient view-only effects. All of them are derived by diffing the previous
// and next GameState after an action — the engine stays 100% untouched.
export type FloatNum = { id: number; owner: PlayerId; slot: number | "hero"; delta: number; delay: number };
export type Particle = { key: number; dx: number; dy: number; size: number; delay: number; rot: number; dur: number };
export type Ghost = {
  id: number;
  owner: PlayerId;
  slot: number;
  minion: MinionInstance;
  delay: number;
  particles: Particle[];
  motion: "death" | "return" | "stasis";
  destinationOwner?: PlayerId;
};
export type Lunge = { id: number; owner: PlayerId; slot: number; dx: number; dy: number } | null;
export type ImpactKind = "hit" | "heal" | "summon" | "buff" | "debuff" | "freeze" | "shield";
export type Impact = {
  id: number;
  owner: PlayerId;
  slot: number | "hero";
  kind: ImpactKind;
  delay: number;
  particles: Particle[];
  /**
   * Which camp is arriving. Only set on a summon, and only four signatures were
   * built rather than one bespoke effect per card — the board reads far richer
   * for a fraction of the work, and a player learns the camp language in one
   * duel.
   */
  camp?: Camp;
};
/**
 * A card leaving the deck. `from`/`to` are viewport coordinates measured off the
 * real deck pile and the real destination at spawn time — the same technique the
 * attacker lunge uses, and the reason the flight lands where the card actually
 * goes at any window size.
 */
export type Flight = {
  id: number;
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  mine: boolean;
  opening?: boolean;
  delayMs?: number;
};
export type DuelIntroState = { id: number; phase: DuelIntroPhase };
export type BoardToast = { id: number; text: string; durationMs: number; tone: "normal" | "bargain" };
export type TauntFlash = { id: number; instanceIds: string[] } | null;
export type RelicFlash = { id: number; instanceId: string; relic: RelicDefinition };
export const RELIC_PLAY_FLASH_DURATION_MS = 2000;

/** Which crystals just changed, and in which direction. */
export type ManaFx = { id: number; kind: "spend" | "refill"; from: number; to: number } | null;

/**
 * The mana cost at which a minion lands with a thud instead of just arriving.
 *
 * Six, because that is where the printed curve turns: 1 to 5 is most of what a
 * duel plays and 6 upward is the half a player is saving mana for. Cost rather
 * than stats — a 6-mana body is a decision the player made, and a big minion
 * that got that way from buffs did not arrive big.
 */
export const HEAVY_LANDING_COST = 6;
/** The cost at which the thud is at full weight. */
const HEAVY_LANDING_MAX_COST = 10;

/**
 * How hard a minion of this cost lands, from 0 at 6 mana to 1 at 10.
 *
 * It starts at 0.28 rather than 0, because "minimal" is not "silent" (owner's
 * ruling, 3 September 2026): a 6-mana body should still be felt, and only the
 * top of the curve should be an event. Anything cheaper than 6 never gets here.
 */
export function heavyLandingWeight(cost: number): number {
  const span = HEAVY_LANDING_MAX_COST - HEAVY_LANDING_COST;
  const along = Math.max(0, Math.min(1, (cost - HEAVY_LANDING_COST) / span));
  return 0.28 + 0.72 * along;
}

// Combat FX land when the lunge connects, not when the button is released.
export const STRIKE_DELAY = 0.18;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function makeParticles(kind: ImpactKind | "death" | "stasis", camp?: Camp): Particle[] {
  const out: Particle[] = [];
  const push = (dx: number, dy: number, size: number, delay: number, rot: number, dur: number) =>
    out.push({ key: out.length, dx, dy, size, delay, rot, dur });
  if (kind === "hit") {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(24, 78);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(3, 7), rand(0, 0.06), rand(-160, 160), rand(0.34, 0.52));
    }
  } else if (kind === "heal" || kind === "buff") {
    for (let i = 0; i < 9; i++) push(rand(-34, 34), rand(-30, -86), rand(3, 6), rand(0, 0.24), 0, rand(0.55, 0.85));
  } else if (kind === "debuff") {
    for (let i = 0; i < 8; i++) push(rand(-30, 30), rand(26, 70), rand(3, 6), rand(0, 0.2), 0, rand(0.5, 0.8));
  } else if (kind === "summon") {
    // Each camp arrives differently, in motion as well as colour — colour alone
    // is not a signature, and half the read is whether the debris rises, falls
    // or snaps into place.
    if (camp === "Nature") {
      // Growth: everything climbs, from below, unevenly.
      for (let i = 0; i < 16; i++) {
        push(rand(-52, 52), rand(-40, -104), rand(3, 8), rand(0, 0.26), rand(-140, 140), rand(0.6, 0.95));
      }
    } else if (camp === "Tech") {
      // Assembly: hard horizontal snap, tight and fast, no drift.
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        push(side * rand(34, 96), rand(-16, 16), rand(3, 7), rand(0, 0.08), 0, rand(0.26, 0.4));
      }
    } else if (camp === "Magic") {
      // A sigil: an even ring that turns as it expands.
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * Math.PI * 2;
        const d = rand(46, 82);
        push(Math.cos(a) * d, Math.sin(a) * d * 0.65, rand(3, 6), rand(0, 0.14), rand(120, 300), rand(0.5, 0.82));
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2);
        const d = rand(30, 86);
        push(Math.cos(a) * d, Math.sin(a) * d * 0.6, rand(2, 5), rand(0, 0.1), rand(-90, 90), rand(0.4, 0.66));
      }
    }
  } else if (kind === "shield") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
      const d = rand(40, 84);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(4, 8), rand(0, 0.05), rand(-200, 200), rand(0.4, 0.6));
    }
  } else if (kind === "freeze") {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(16, 46);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(4, 7), rand(0, 0.12), 45, rand(0.5, 0.7));
    }
  } else if (kind === "stasis") {
    // Stasis is suspension, not destruction: a small cyan lattice contracts
    // around the card while square motes hang in place instead of flying out
    // as death debris.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = rand(42, 78);
      push(Math.cos(a) * d, Math.sin(a) * d * 0.72, rand(3, 6), rand(0, 0.18), rand(0, 90), rand(0.65, 0.95));
    }
  } else {
    // Small embers dissolve around the card, without oversized tumbling shards.
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(12, 44);
      push(Math.cos(a) * d, Math.sin(a) * d * 0.7 - 18, rand(2, 4), rand(0.06, 0.16), rand(-35, 35), rand(0.42, 0.62));
    }
  }
  return out;
}
