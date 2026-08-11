import { applyAction, getLegalActions, actionKey, type CardLibrary } from "./game";
import type { GameAction, GameState, MinionInstance, PlayerId } from "./types";

/**
 * The practice opponent.
 *
 * Deliberately NOT a hand-written rulebook of "if taunt then…" heuristics: the
 * engine already exposes every legal move and is a pure function, so the bot
 * plays each candidate on a throwaway copy of the game and keeps the move that
 * leaves the board looking best. That buys two things a rules-of-thumb bot would
 * not have — it automatically respects every effect in the game (wards, shields,
 * invulnerability, the lot) because it reads the real outcome rather than
 * predicting it, and it stays correct when new effects are added later.
 *
 * Three skills share one evaluation function and differ only in how far they
 * look and how much noise they tolerate:
 *
 *   easy   — one move ahead, heavy noise, and it will simply do something silly
 *            a third of the time. A first opponent, not a wall.
 *   normal — one move ahead, no noise. Plays every individual move correctly and
 *            never sees the move after it.
 *   hard   — searches whole TURNS: it finishes its own turn greedily, lets the
 *            opponent answer with a full greedy turn, and scores the board that
 *            comes back. That is what lets it set up a trade it only profits
 *            from next turn, and what makes it hold a Taunt back to block lethal.
 */

export type BotSkill = "easy" | "normal" | "hard";

/** How many candidate opening moves `hard` is willing to search in depth. */
const HARD_BRANCH = 5;
/** Safety rail on every greedy roll-out; a turn never legitimately runs this long. */
const ROLLOUT_CAP = 24;

/**
 * Easy's noise, derived from the position rather than from `Math.random()`.
 *
 * The engine's rule is that nothing here may reach for real randomness, and the
 * bot is no exception even though its dice never enter the state: a bot that
 * rolls `Math.random()` cannot be replayed, cannot be tested, and makes the same
 * saved game play out differently on a reload. This reads the seed the state is
 * already carrying and does not touch it, so the same position always produces
 * the same silly decision.
 */
function positionNoise(state: GameState, salt: number): number {
  let value = (state.rngSeed ^ (state.turnNumber * 2654435761) ^ (salt * 40503)) >>> 0;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >>> 17;
  value ^= value << 5;
  value >>>= 0;
  return (value % 100000) / 100000;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * What a single minion is worth sitting on the board.
 *
 * There is NO passive per-body ping in this game any more — bodies are worth
 * exactly the pressure and the blocking they provide, and nothing extra for
 * merely existing. (The old version carried a flat +2 for a ping that had
 * already been removed from the rules, which quietly inflated every wide board.)
 */
function minionValue(minion: MinionInstance, state: GameState): number {
  // A minion's job is to threaten the core and to survive being answered, so ATK
  // and HP are both real value and ATK leads slightly — the core clock counts
  // power, not bodies.
  let value = 1 + minion.atk * 1.15 + minion.hp * 0.9;

  // Taunt is the only thing in the game that closes the core, which makes it far
  // more valuable than it was when every attack had to go through the board
  // anyway. It is worth roughly its own bulk again.
  if (minion.keywords.includes("Taunt") && !minion.silenced) value += 1.5 + minion.hp * 0.5;

  // A shield eats one instance of damage whatever its size, so it is worth more
  // on a big body than a small one, but never unbounded.
  if (minion.divineShield) value += Math.min(4, 1.5 + minion.atk * 0.4);
  if (minion.invulnerableUntilTurn !== null && minion.invulnerableUntilTurn >= state.turnNumber) value += 3;

  // An engine that fires every turn compounds; a battlecry has already paid out
  // by the time it is sitting here.
  if ((minion.effectTiming === "ongoing" || minion.effectTiming === "onPlayAndOngoing") && !minion.silenced && minion.chained === 0) value += 2.2;

  // Ready right now is tempo the opponent has to answer this turn.
  if (!minion.sleeping && !minion.frozen && minion.attacksUsed === 0 && minion.atk > 0 && !minion.attackLocked) {
    value += minion.atk * 0.35;
  }

  if (minion.frozen) value -= 2.5;
  if (minion.chained > 0) value -= 2;
  if (minion.silenced) value -= 1.5;
  if (minion.attackLocked) value -= minion.atk * 0.5;
  if (minion.markedBy) value -= minion.hp * 0.4;
  if (minion.atk === 0) value -= 1.5; // cannot attack at all
  if (minion.relic) value += 2.5;

  return value;
}

function boardValue(state: GameState, playerId: PlayerId): number {
  return state.players[playerId].board.reduce(
    (total, minion) => total + (minion ? minionValue(minion, state) : 0),
    0,
  );
}

/** Damage this player could put on the enemy core right now, if nothing blocked. */
function reach(state: GameState, playerId: PlayerId): number {
  return state.players[playerId].board.reduce((total, minion) => {
    if (!minion) return total;
    if (minion.sleeping || minion.frozen || minion.attackLocked || minion.attacksUsed > 0) return total;
    return total + minion.atk;
  }, 0);
}

function hasTaunt(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId].board.some((m) => m && !m.silenced && m.keywords.includes("Taunt"));
}

/**
 * How good the whole position looks for `botId`. Positive is good for the bot.
 */
function scoreState(state: GameState, botId: PlayerId): number {
  const enemyId: PlayerId = botId === 0 ? 1 : 0;
  if (state.winner === botId) return 1_000_000;
  if (state.winner === enemyId) return -1_000_000;
  if (state.winner === "draw") return -500_000;

  const me = state.players[botId];
  const enemy = state.players[enemyId];

  let score = boardValue(state, botId) - boardValue(state, enemyId);

  // The core clock. Straight health difference is not enough — the last few
  // points of core are worth far more than the first few, because that is where
  // the game actually ends. This term is what stops the bot trading happily
  // while it is being raced down.
  score += (me.health - enemy.health) * 2.2;
  score += (30 - enemy.health) * 1.4; // progress toward winning
  score -= Math.max(0, 12 - me.health) * 3.5; // panic when low

  // Lethal, and being open to it, dominate everything else short of the win.
  const myReach = reach(state, botId);
  const theirReach = reach(state, enemyId);
  if (!hasTaunt(state, enemyId) && myReach >= enemy.health) score += 400;
  if (!hasTaunt(state, botId) && theirReach >= me.health) score -= 500;

  score += me.hand.length * 0.8 - enemy.hand.length * 0.8;
  // Relics are now cards in hand, so their value is already represented by
  // hand size; add a small premium because a held relic is a future attached
  // effect rather than an ordinary card.
  score += me.hand.filter((cardId) => /^r\d+$/i.test(cardId)).length * 0.6;
  // Unspent mana is a wasted turn.
  score -= me.mana * 0.9;

  return score;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function whoActs(state: GameState): PlayerId | null {
  if (state.phase === "gameOver") return null;
  if (state.phase === "drawChoice") return state.drawChoice?.player ?? null;
  if (state.phase === "targeting") return state.pendingTarget?.player ?? null;
  return state.activePlayer;
}

/** A move's resulting state and immediate score. Keeping both avoids applying the
 * same candidate again when a rollout follows it. */
function evaluateAction(
  state: GameState,
  action: GameAction,
  library: CardLibrary,
  forId: PlayerId,
  knownLegal?: readonly GameAction[],
): { state: GameState; score: number } {
  const result = applyAction(state, action, library, knownLegal, false);
  let score = scoreState(result.state, forId);
  // Ending the turn hands over the initiative, so it has to genuinely beat every
  // other option rather than merely tie with it.
  if (action.type === "end_turn") score -= 8;
  // The Coin converts into mana, which the "spend your turn" term would
  // otherwise read as a loss. Cancel that so the bot banks it instead of
  // refusing to touch it all game.
  if (action.type === "use_coin") score += 1;
  return { state: result.state, score };
}

function bestGreedy(
  state: GameState,
  library: CardLibrary,
  forId: PlayerId,
): { action: GameAction; state: GameState } | null {
  const legal = getLegalActions(state, library);
  if (legal.length === 0) return null;
  let best: GameAction | null = null;
  let bestState: GameState | null = null;
  let bestScore = -Infinity;
  for (const action of legal) {
    const evaluated = evaluateAction(state, action, library, forId, legal);
    const score = evaluated.score;
    if (score > bestScore) {
      bestScore = score;
      best = action;
      bestState = evaluated.state;
    }
  }
  return best && bestState ? { action: best, state: bestState } : null;
}

/**
 * Plays `playerId`'s turn out greedily and returns the state once the turn has
 * passed to someone else (or the game has ended). Used by `hard` to see what its
 * own turn really ends up looking like, and what the opponent does with theirs.
 */
function rolloutTurn(state: GameState, library: CardLibrary, playerId: PlayerId): GameState {
  let current = state;
  for (let step = 0; step < ROLLOUT_CAP; step += 1) {
    if (current.phase === "gameOver") return current;
    const actor = whoActs(current);
    if (actor === null || actor !== playerId) return current;
    const step = bestGreedy(current, library, playerId);
    if (!step) return current;
    const before = actionKey(step.action);
    const next = step.state;
    // A move that changes nothing would spin here forever.
    if (actionKey(step.action) === before && next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Picks the bot's next move, or null when it has none (not its turn, or the game
 * is over). Always returns something the engine already called legal.
 */
export function chooseBotAction(
  state: GameState,
  library: CardLibrary,
  botId: PlayerId = 1,
  skill: BotSkill = "normal",
  knownLegal?: GameAction[],
): GameAction | null {
  if (state.phase === "gameOver") return null;
  if (whoActs(state) !== botId) return null;

  // Simulation already asks the engine for legal actions to detect dead ends.
  // Accepting that exact list avoids doing the same rules traversal twice on
  // every simulated bot action; normal app callers simply omit it.
  const legal = knownLegal ?? getLegalActions(state, library);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const scored = legal.map((action) => ({ action, ...evaluateAction(state, action, library, botId, legal) }));

  if (skill === "easy") {
    // A beginner opponent: mostly it does something, occasionally it does the
    // right thing, and it never grinds you down with perfect trades. The noise
    // is proportional to the spread so it stays silly on quiet turns and still
    // takes an obvious lethal.
    const spread = Math.max(1, Math.max(...scored.map((s) => s.score)) - Math.min(...scored.map((s) => s.score)));
    if (positionNoise(state, legal.length) < 0.3) {
      const nonPass = scored.filter((s) => s.action.type !== "end_turn");
      const pool = nonPass.length > 0 ? nonPass : scored;
      return pool[Math.floor(positionNoise(state, legal.length * 7 + 1) * pool.length)].action;
    }
    let best = scored[0];
    let bestNoisy = scored[0].score + (positionNoise(state, 1) - 0.5) * spread * 0.55;
    for (let index = 1; index < scored.length; index += 1) {
      const noisy = scored[index].score + (positionNoise(state, index + 2) - 0.5) * spread * 0.55;
      if (noisy > bestNoisy) {
        bestNoisy = noisy;
        best = scored[index];
      }
    }
    return best.action;
  }

  scored.sort((a, b) => b.score - a.score);
  if (skill === "normal") return scored[0].action;

  // hard: take the shortlist the one-ply score likes and actually look at where
  // each of them leads once both turns have been played out.
  const shortlist = scored.slice(0, Math.min(HARD_BRANCH, scored.length));
  let best = shortlist[0];
  let bestScore = -Infinity;

  for (const candidate of shortlist) {
    let projected = candidate.state;
    if (projected.phase !== "gameOver") {
      projected = rolloutTurn(projected, library, botId);
      const enemyId: PlayerId = botId === 0 ? 1 : 0;
      if (projected.phase !== "gameOver" && whoActs(projected) === enemyId) {
        projected = rolloutTurn(projected, library, enemyId);
      }
    }
    let score = scoreState(projected, botId);
    if (candidate.action.type === "end_turn") score -= 8;
    if (candidate.action.type === "use_coin") score += 1;
    // Break ties toward the move that already looked best, so `hard` never plays
    // worse than `normal` on a position where the deep look adds nothing.
    score += candidate.score * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best.action;
}
