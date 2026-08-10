import type { GameEvent, GameState } from "./engine/types";
import type { BotSkill } from "./engine/bot";

/** How the duel is being played. Mirrors GameMode in screens/Screens.tsx. */
export type SavedMode = { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };

const SKILLS: BotSkill[] = ["easy", "normal", "hard"];

/**
 * Saved game. Closing the tab mid-duel used to throw the whole match away,
 * which in a hotseat game meant "one of you sneezed on the laptop lid, start
 * over". The full GameState is a plain serialisable object, so the save IS the
 * state — no snapshot format to keep in sync with the engine.
 *
 * Per-PC and per-URL by nature (localStorage), which is fine: a hotseat duel
 * does not travel between machines.
 */

// BUMP THIS whenever GameState, PlayerState or MinionInstance gains a field.
// A save written before the field exists restores an object the UI then reads
// through (`player.slotAuras.filter(...)`), which throws during render and
// blanks the whole board with no console error — it looks exactly like a broken
// build. The version key is the cheap guard; the shape checks below are the
// belt-and-braces one.
// v4: card faces are drawn live from data instead of being baked images, so every
// minion's `art` moved from /card-art/<id>.webp to /card-art/raw/<id>.webp. A v3
// save holds instances carrying the OLD path, and restoring one shows stale art
// under a live frame — bump, don't try to migrate.
// v5: GameState gained `manaRamp`, and starting core HP moved from 30 to 48. A v4
// save restores a duel with no ramp field (every turn would recompute maxMana as
// 1) and a 30-HP core inside a 48-HP game — bump, don't migrate.
// v6: the saved `vsBot` boolean became a `mode`, because the opponent now has
// three difficulties and "true" no longer says which one you were playing.
// v7: the pacing was re-cut — core 48 -> 76 and the mana ramp back to a plain +1
// a turn. A v6 save restores a duel holding 48-HP cores and a bent mana curve
// inside a game that no longer works that way.
// v8: targeting prompts now remember earlier picks for two-card and two-minion
// Battlecries. Older in-progress prompts do not carry that continuation state.
// v9: card and relic artwork now follows the app's deployment base path. A v8
// save can carry root-only artwork paths into a folder-hosted build, so discard
// it rather than restoring black cards from stale minion instances.
// v10: MinionInstance gained `gainedEffects`. A v9 save can therefore reach
// `hasEffect()` with no array to search, which blanks the game before it draws.
const SAVE_VERSION = 10;
const SAVE_KEY = `convergence.save.v${SAVE_VERSION}`;

export interface SavedGame {
  version: number;
  game: GameState;
  events: GameEvent[];
  mode: SavedMode;
  savedAt: number;
}

export function saveGame(game: GameState, events: GameEvent[], mode: SavedMode, now: number): void {
  try {
    const payload: SavedGame = {
      version: SAVE_VERSION,
      game,
      events: events.slice(-60),
      mode,
      savedAt: now,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode, a full quota, or a browser that refuses storage on file://
    // — a lost save is never worth breaking the game over.
  }
}

/**
 * Reads a save back, returning null on anything suspicious. Engine changes
 * (a new field on GameState, a renamed phase) would otherwise restore a
 * half-shaped object and crash the board on the first render, so the shape is
 * checked rather than trusted.
 */
export function loadGame(): SavedGame | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    if (!parsed || parsed.version !== SAVE_VERSION) return null;
    const game = parsed.game;
    if (!game || typeof game !== "object") return null;
    if (!Array.isArray(game.players) || game.players.length !== 2) return null;
    if (typeof game.rngSeed !== "number" || typeof game.turnNumber !== "number") return null;
    if (typeof game.manaRamp !== "number" || game.manaRamp <= 0) return null;
    if (!Array.isArray(game.deck) || !Array.isArray(game.effectQueue)) return null;
    if (!Array.isArray(game.relicPool)) return null;
    const playerShapeOk = (player: SavedGame["game"]["players"][number]) =>
      Array.isArray(player?.board) &&
      player.board.length === 5 &&
      player.board.every((minion) => minion === null || Array.isArray(minion.gainedEffects)) &&
      Array.isArray(player.relics) &&
      Array.isArray(player.slotAuras) &&
      player.costReductions !== undefined &&
      "confusedUntilTurn" in player;
    if (!game.players.every(playerShapeOk)) return null;
    if (game.phase === "gameOver") return null; // finished duels are not worth resuming
    // An unrecognisable mode falls back to hotseat rather than rejecting the whole
    // save — losing the difficulty is a shrug, losing the duel is not.
    const saved = parsed.mode;
    const mode: SavedMode =
      saved && saved.kind === "bot" && SKILLS.includes(saved.skill) ? { kind: "bot", skill: saved.skill } : { kind: "hotseat" };
    return {
      version: SAVE_VERSION,
      game,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      mode,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore — see saveGame
  }
}
