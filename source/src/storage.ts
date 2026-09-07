import type { GameEvent, GameState } from "./engine/types";
import type { BotSkill } from "./engine/bot";
import { CAMPAIGN_DIFFICULTIES, getCampaignChapter } from "./campaign";

/** How the duel is being played. Mirrors GameMode in screens/Screens.tsx. */
export type SavedMode = ({ kind: "hotseat" } | { kind: "bot"; skill: BotSkill } | { kind: "campaign"; chapter: number; skill: BotSkill }) & { duelId?: string };

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
// v11: Ascension Relics became ordinary shared-deck cards. Legacy satchels are
// migrated into hand and the old rift pool is returned to the shared deck.
// v12: MinionInstance gained temporary transformation state for Rennala's
// Lunar Slime effect.
// v13: Charge, Deathrattle, temporary untargetability, pocket rooms, and new
// aura/mark state were added to the live rules.
// v14: the requested card pass added hero shields and reactive/aura state.
// v15: the replacement card pass added G-Man's stasis and Ten Commandments'
// per-turn trigger marker.
// v16: MinionInstance gained passiveSilenceSources so Gojo's Silence aura can
// be removed when Gojo leaves play.
// v17: Doctor Strange's next-turn mana penalty and Dormammu's persistent Dark
// Dimension banishment zone became part of GameState.
// v18: the opening hero-power draft, once-per-turn usage flags, and the
// chain-growth marker became part of GameState/MinionInstance.
// v19: GameState gained `foresightFor`, the seat the Ascendant opponent's draw
// cheat belongs to. A v18 save has no such field, so a duel resumed from one
// would silently stop cheating halfway through — migrated to null rather than
// discarded, because losing the duel is worse than losing one cheat.
// v20: MinionInstance gained `copyRestoreEffectId`, the minion's own effect
// parked while All for One wears a copied one. A copied effect can now open a
// prompt and be saved mid-question, so a v19 save restored into this build could
// hold a minion permanently wearing a borrowed effect with nothing recorded to
// put back. Migrated to null rather than discarded: a v19 save cannot be mid-copy
// in the first place, because the old code never left a copy open across a save.
// v21: the opening Hero Power draft became a player-only mulligan, and manual
// attached-relic returns were removed. A mid-draft v20 save has no equivalent
// state and is discarded rather than restoring a broken opening screen.
// v22: MinionInstance gained temporary control state for Motoko Kusanagi.
// v23: MinionInstance gained Frieren's once-per-turn relic discovery marker.
// v24: RelicInstance gained Time Turner's previous-turn HP snapshot.
// v25: GameState gained the developer-cheat owner, so infinite mana no longer
// leaks to the opponent when a saved duel is resumed.
// v26: five state fields were REMOVED, which is the first time this version has
// counted down rather than up. Rennala's transform slot, Neo's old protected
// flag, the confusion timer, the delayed-destroy mark and the timed
// invulnerability all belonged to cards the roster no longer carries, so nothing
// could set them. A v25 save still holds the keys; the shape check below stopped
// requiring them, and a save that keeps them is simply carrying dead weight.
// v27: `copyRestoreEffectId` was REMOVED from MinionInstance along with All for
// One's borrow-a-Battlecry effect, which was the only thing that ever set it.
// A v26 save can hold a minion mid-copy — wearing a borrowed effect with its own
// parked in that field — and this build has nothing left that would ever put the
// real one back, so such a minion would wear the borrowed power for the rest of
// the duel. The migration below hands it back before the field is dropped. That
// is the whole reason for the bump: the field going missing is harmless, a
// minion silently keeping somebody else's power is not.
// v28: campaign cutover deliberately resets all pre-campaign duels.
const SAVE_VERSION = 28;
const SAVE_KEY = `convergence.save.v${SAVE_VERSION}`;
export interface SavedGame {
  version: number;
  game: GameState;
  events: GameEvent[];
  mode: SavedMode;
  savedAt: number;
}

/**
 * How many duel events are kept — by the log drawer, and by the save.
 *
 * ONE number, and it lives here because the save is the tighter constraint: the
 * drawer can hold whatever it likes in memory, while every event in this list is
 * written to localStorage on each state change. It used to be 300 in the drawer
 * and 60 here, so continuing a saved duel silently truncated its own history to
 * the last few turns — the one moment a player is most likely to open the log.
 *
 * 300 short strings is a few tens of kilobytes against localStorage's megabytes,
 * and a measured 23-turn self-play duel produces 169 events, so a whole duel
 * fits.
 */
export const EVENT_LOG_LIMIT = 300;

export function saveGame(game: GameState, events: GameEvent[], mode: SavedMode, now: number): void {
  try {
    const payload: SavedGame = {
      version: SAVE_VERSION,
      game,
      events: events.slice(-EVENT_LOG_LIMIT),
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
    const retired = Object.keys(window.localStorage).filter((key) => /^convergence\.save\.v\d+$/.test(key) && Number(key.split("v").at(-1)) < SAVE_VERSION);
    for (const key of retired) window.localStorage.removeItem(key);
    // Also remove known keys in minimal storage adapters without enumerable keys.
    for (let version = 1; version < SAVE_VERSION; version++) window.localStorage.removeItem(`convergence.save.v${version}`);
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    if (!parsed || parsed.version !== SAVE_VERSION) return null;
    const game = parsed.game as GameState | undefined;
    if (!game || typeof game !== "object") return null;
    if (!Array.isArray(game.players) || game.players.length !== 2) return null;
    if (typeof game.rngSeed !== "number" || typeof game.turnNumber !== "number") return null;
    if (typeof game.manaRamp !== "number" || game.manaRamp <= 0) return null;
    if (!Array.isArray(game.deck) || !Array.isArray(game.effectQueue)) return null;
    // Chunk 2 fields are optional while the current app still creates old-style
    // duels. Reset/version cutover happens when campaign progression is connected.
    const stringArray = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((entry) => typeof entry === "string");
    if (!game.playerDecks) return null;
    if (game.playerDecks !== undefined && (
      !Array.isArray(game.playerDecks) || game.playerDecks.length !== 2 ||
      !game.playerDecks.every((pile) => pile && stringArray(pile.deck) && stringArray(pile.bottomDeck)) ||
      game.deck.length !== 0 || !stringArray(game.bottomDeck) || game.bottomDeck.length !== 0
    )) return null;
    if (game.botCheats !== undefined && (
      !Array.isArray(game.botCheats) || game.botCheats.length !== 2 ||
      !game.botCheats.every((cheats) => cheats === null || (cheats &&
        typeof cheats.trueDice === "boolean" && typeof cheats.readsYourReply === "boolean" &&
        typeof cheats.clairvoyance === "boolean" && typeof cheats.foresight === "boolean"))
    )) return null;
    if (
      !Array.isArray(game.heroPowers) ||
      game.heroPowers.length !== 2 ||
      !Array.isArray(game.heroPowerUsed) ||
      game.heroPowerUsed.length !== 2
    ) return null;
    if ((game.phase as string) === "heroPowerChoice") return null;
    if (
      game.phase === "mulligan" &&
      (!game.mulligan || game.mulligan.player !== 0 || !Array.isArray(game.mulligan.selected))
    ) return null;
    const playerShapeOk = (player: SavedGame["game"]["players"][number]) =>
      Array.isArray(player?.board) &&
      player.board.length === 5 &&
      player.board.every(
        (minion) =>
          minion === null ||
          (Array.isArray(minion.gainedEffects) && "temporaryControl" in minion &&
            (minion.originalOwner === undefined || minion.originalOwner === 0 || minion.originalOwner === 1)),
      ) &&
      Array.isArray(player.slotAuras) &&
      (player.deadMinionOwners === undefined || (Array.isArray(player.deadMinionOwners) &&
        player.deadMinionOwners.length === (player.deadMinions?.length ?? 0) &&
        player.deadMinionOwners.every((owner) => owner === 0 || owner === 1))) &&
      player.costReductions !== undefined;
    if (!game.players.every(playerShapeOk)) return null;
    if (!Array.isArray(game.stasis)) return null;
    if (!Array.isArray(game.darkDimension)) return null;
    if (game.phase === "gameOver") return null; // finished duels are not worth resuming
    const saved = parsed.mode;
    if (!saved || !["hotseat", "bot", "campaign"].includes(saved.kind)) return null;
    let mode: SavedMode;
    const identity = typeof saved.duelId === "string" ? { duelId: saved.duelId } : {};
    if (saved.kind === "campaign") {
      const chapter = getCampaignChapter(saved.chapter);
      if (!chapter) return null;
      const difficulty = CAMPAIGN_DIFFICULTIES[chapter.difficultyId];
      if (!game.botCheats?.[1] || (Object.keys(difficulty.cheats) as Array<keyof typeof difficulty.cheats>).some((key) => game.botCheats![1]![key] !== difficulty.cheats[key])) return null;
      mode = { kind: "campaign", chapter: chapter.chapter, skill: difficulty.botSkill, ...identity };
    } else if (saved.kind === "bot") {
      if (!SKILLS.includes(saved.skill)) return null;
      mode = { kind: "bot", skill: saved.skill, ...identity };
    } else mode = { kind: "hotseat", ...identity };
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
    for (let version = 1; version <= SAVE_VERSION; version++) window.localStorage.removeItem(`convergence.save.v${version}`);

  } catch {
    // ignore — see saveGame
  }
}
