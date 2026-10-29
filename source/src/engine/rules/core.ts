/**
 * The engine's shared constants and the small lookups every rules module leans on.
 */
import type { GameEvent, GameState, MinionInstance, PlayerId, PlayerState, PlayableCard } from "../types";
import { hasSlotAura } from "./auras";

export type CardLibrary = Record<string, PlayableCard>;

export const boardSize = 4;

/** Minion slots per side; read by the balance harness's state invariants. */
export const BOARD_SIZE = boardSize;

export const handLimit = 10;

/**
 * How many of its own turns a Chained minion loses. TWO, everywhere, always.
 *
 * This is the keyword's whole definition and no card is allowed to print a
 * different number beside it — the same rule Reborn follows. An effect that
 * wants a ONE-turn lockout is a Freeze, not a chain, and that is the line
 * between the two keywords: Freeze costs a turn, Chained costs two and also
 * switches off Passives and puts the minion out of reach of both players.
 *
 * Owner ruling, 2 September 2026. Before it, four separate cards printed
 * "Chained for 1 turn" and measured identical to Freeze, which made the harsher
 * keyword the weaker one.
 */
export const CHAIN_TURNS = 2;

/** What Reforged Chains pays for those two turns. Printed in `hero-powers.ts`. */
export const CHAIN_GROWTH_REWARD = 2;

/** Shared starting and maximum Core health for every game mode. */
export const DEFAULT_STARTING_HEALTH = 30;

/**
 * The same number, for the UI and the rules screen to read. Exported so the
 * "both players start on N core" line in How To Play can never disagree with the
 * engine — it said 30 for a while after the engine said otherwise.
 */
export const STARTING_CORE = DEFAULT_STARTING_HEALTH;

/**
 * Mana per turn. **One. Do not make this clever.**
 *
 * The real problem it was reached for is genuine: duels used to end around
 * player-turn 15, which is 7–8 turns each, which caps mana at 8 — so every card
 * costing 9 or 10 (Saitama, Thanos, Goku, Neo, Doctor Manhattan, The Watcher)
 * was drawn hundreds of times per thousand duels and played almost never. Cost
 * is frozen, so cost could not absorb it.
 *
 * The fix tried first was an accelerated ramp of 1.35/turn, and it was WRONG.
 * It produces the sequence 1, 2, 4, 5, 6, 8, 9, 10 — which silently **skips 3
 * and 7**, so the 20 cards costed at 3 and the 15 costed at 7 never get a turn
 * where they are on-curve. It quietly deletes the meaning of two whole cost
 * tiers, which is the exact thing the frozen-cost rule exists to protect. No
 * major card game skips resource values, and players build a per-turn rhythm
 * around "next turn I have one more".
 *
 * The shipped lever is the core health total. Keep the mana ramp plain and let
 * the health bar provide pressure without skipping mana tiers.
 *
 * The field survives only so `npm run sim -- --sweep` can still measure
 * alternatives. The shipped game is 1.
 */
export const DEFAULT_MANA_RAMP = 1;

/** Infinite mana belongs to one developer-controlled seat, never the opponent. */
export function hasInfiniteMana(state: Pick<GameState, "cheatMode" | "cheatPlayer">, playerId: PlayerId): boolean {
  // `null`/`undefined` keeps old test states and pre-v25 saves compatible; the
  // developer UI always writes the exact player who enabled the cheat.
  return state.cheatMode && (state.cheatPlayer === null || state.cheatPlayer === undefined || state.cheatPlayer === playerId);
}

export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Where a minion currently sits, or -1 if it has left the board. */
export function slotOf(state: GameState, minion: MinionInstance | null): number {
  if (!minion) return -1;
  return state.players[minion.owner].board.findIndex((entry) => entry?.instanceId === minion.instanceId);
}

/** Returns an empty position that is still allowed to hold a minion. */
export function findEmptySlot(state: GameState, owner: PlayerId, preferred?: number): number {
  const board = state.players[owner].board;
  if (
    preferred !== undefined &&
    preferred >= 0 &&
    preferred < board.length &&
    !board[preferred] &&
    !hasSlotAura(state, owner, preferred, "slot_bound")
  ) {
    return preferred;
  }
  return board.findIndex((minion, slot) => !minion && !hasSlotAura(state, owner, slot, "slot_bound"));
}

export function effectEvent(text: string, source: MinionInstance): GameEvent {
  return { kind: "effect", text, player: source.owner, cardId: source.cardId, instanceId: source.instanceId };
}

// ---------------------------------------------------------------------------
// Helpers for the full-roster effects (added 2026-07-12).
// ---------------------------------------------------------------------------
export function friendlyOthers(player: PlayerState, source: MinionInstance): MinionInstance[] {
  return player.board.filter(
    (minion): minion is MinionInstance => minion !== null && minion.instanceId !== source.instanceId,
  );
}
