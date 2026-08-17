import { applyAction, getLegalActions, actionKey, type CardLibrary } from "./game";
import { isMinionCard, type GameAction, type GameState, type MinionInstance, type PlayerId } from "./types";

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
 * Three skills share one evaluation function and differ in how far they look,
 * how much noise they tolerate, and — deliberately — how much they are allowed
 * to KNOW. The cheats are the difficulty. See `BOT_CHEATS` below.
 *
 *   easy   — one move ahead, heavy noise, and it will simply do something silly
 *            a third of the time. A first opponent, not a wall. Rolls blind.
 *   normal — one move ahead, no noise. Plays every individual move correctly and
 *            never sees the move after it. Rolls blind.
 *   hard   — searches whole TURNS: it finishes its own turn greedily, branches
 *            the opponent's reply, and scores the worst board that comes back.
 *            It also sees the true dice and the top of the shared deck.
 */

export type BotSkill = "easy" | "normal" | "hard";

/**
 * What a skill is allowed to know that a human at the same seat would not.
 *
 * Kept as data rather than scattered `if (skill === "hard")` checks so the table
 * in the README and the behaviour of the code cannot drift apart, and so the
 * simulator can read the same row the game does.
 *
 * `foresight` is the one cheat this file does not implement — the draw happens
 * inside `beginTurn`, so the engine grants it from `GameState.foresightFor` and
 * the app sets that field from this table when the duel begins.
 */
export interface BotCheats {
  /**
   * Sees the real outcome of a random effect before committing to it.
   *
   * Every skill used to have this by accident: a candidate move is tested by
   * applying it to a copy of the real state, and the RNG seed lives IN the
   * state, so the copy rolled exactly the dice the game was about to roll.
   * Recruit and Veteran now evaluate on a scrambled seed instead, which is what
   * a player does — guess, and find out afterwards.
   */
  trueDice: boolean;
  /** Branches the opponent's reply instead of assuming one greedy line. */
  readsYourReply: boolean;
  /** Values the next cards of the SHARED deck, for both seats. */
  clairvoyance: boolean;
  /** Draw two and keep one every turn. Granted by the engine, not by this file. */
  foresight: boolean;
}

export const BOT_CHEATS: Record<BotSkill, BotCheats> = {
  easy: { trueDice: false, readsYourReply: false, clairvoyance: false, foresight: false },
  normal: { trueDice: false, readsYourReply: false, clairvoyance: false, foresight: false },
  hard: { trueDice: true, readsYourReply: true, clairvoyance: true, foresight: true },
};

/**
 * Every dial this file exposes, in one readable object.
 *
 * Written into the ladder's result file so that comparing two runs can say WHAT
 * changed between them rather than only that the number moved. A comparison
 * whose dials are identical is measuring shuffle luck; one whose dials differ is
 * measuring the change — and only the file knows which it is looking at.
 */
export function botDials(): Record<string, unknown> {
  return {
    cheats: BOT_CHEATS,
    hardBranch: HARD_BRANCH,
    enemyBranch: ENEMY_BRANCH,
    enemyDice: ENEMY_DICE,
    clairvoyantDepth: CLAIRVOYANT_DEPTH,
    clairvoyantWeight: CLAIRVOYANT_WEIGHT,
    blindSamples: BLIND_SAMPLES,
    rolloutCap: ROLLOUT_CAP,
  };
}

/** How many candidate opening moves `hard` is willing to search in depth. */
const HARD_BRANCH = 5;
/** How many of the opponent's replies `hard` weighs before assuming the worst. */
const ENEMY_BRANCH = 3;
/**
 * Whether the OPPONENT, inside the Ascendant's projection, gets to see the dice.
 *
 * No, and it is a constant rather than a dial because there is no defensible
 * value on the other side: the seat being modelled is a human or a lower tier,
 * and neither of them can read a roll. A bot that braces against answers its
 * opponent cannot find is not playing more carefully, it is playing a different
 * game.
 */
const ENEMY_DICE = false;

/** How many upcoming DRAWS Clairvoyance reads down the shared deck. */
const CLAIRVOYANT_DEPTH = 3;
/**
 * What the nearest unseen draw is worth in board points.
 *
 * Deliberately small. A card that has not been drawn yet should break a tie
 * between two otherwise equal lines, never outweigh a real minion trade.
 */
const CLAIRVOYANT_WEIGHT = 0.35;
/**
 * How many blind rolls a skill without `trueDice` averages over a random move.
 *
 * Three was not enough. A move with one good outcome in three came out ahead
 * whenever two of three samples happened to land on it, which made Recruit and
 * Veteran look like they were reading the dice after all — the opposite of the
 * point. Five is steady enough to price a one-in-three gamble correctly and
 * still costs nothing on the overwhelming majority of moves, which are not
 * random at all and are detected in a single apply.
 */
const BLIND_SAMPLES = 5;
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

/**
 * A seed that is NOT the one the game is about to use.
 *
 * This is how Recruit and Veteran are made to guess. Handing the evaluation a
 * different seed means a random effect resolves *somehow* in the copy, but not
 * the way it will resolve for real, so the bot can no longer pick the move whose
 * dice it has already seen. Derived from the state, never from `Math.random()` —
 * the whole engine has to replay identically, and the bot is not exempt.
 */
function blindSeed(state: GameState, salt: number): number {
  let value = (state.rngSeed ^ (0xa5a5a5a5 + salt * 2246822519)) >>> 0;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >>> 17;
  value ^= value << 5;
  value >>>= 0;
  // 0 is the one value xorshift cannot leave, and an accidental match with the
  // real seed would hand the cheat straight back.
  if (value === 0 || value === (state.rngSeed >>> 0)) value = 0x9e3779b9 + salt;
  return value | 0;
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
  if (minion.relic || minion.relic2) value += 2.5;

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
// Clairvoyance
// ---------------------------------------------------------------------------

/**
 * What an undrawn card is worth, judged only by its printed cost.
 *
 * The bot has no per-card valuation yet, and inventing one here would be a
 * guess. Printed cost is not a guess: this game freezes mana as the subject's
 * power grade in its own fiction (see the README's frozen-cost rule), so the
 * number on the card IS the roster's own statement of how big the thing is.
 * A crude proxy taken from the game's own scale, and it costs one lookup.
 */
function upcomingValue(cardId: string, library: CardLibrary): number {
  const card = library[cardId];
  if (!card) return 0;
  if (isMinionCard(card)) return card.cost;
  // A relic with no printed cost is Infinity Castle, which is free and strong;
  // treat it as a middling card rather than a worthless one.
  return card.cost ?? 3;
}

/**
 * Reading the top of the shared deck, which is the cheat that a shared deck
 * makes interesting: every card the Ascendant sees coming is a card it knows the
 * OTHER seat might get instead. Positive means the near future favours the bot.
 *
 * Draws alternate, so the walk alternates with them, and a seat holding
 * Foresight burns two to keep the better one — which is why the same cheat that
 * improves its draw also decides which card the opponent never sees.
 */
export function clairvoyanceEdge(state: GameState, library: CardLibrary, botId: PlayerId): number {
  const enemyId: PlayerId = botId === 0 ? 1 : 0;
  // Whoever is active has already drawn for this turn, so the next card off the
  // deck belongs to the other seat.
  let seat: PlayerId = state.activePlayer === botId ? enemyId : botId;
  let index = 0;
  let edge = 0;

  for (let step = 0; step < CLAIRVOYANT_DEPTH; step += 1) {
    const takes = state.foresightFor === seat ? 2 : 1;
    let kept = -1;
    for (let offset = 0; offset < takes; offset += 1) {
      const cardId = state.deck[index + offset];
      if (cardId === undefined) break;
      kept = Math.max(kept, upcomingValue(cardId, library));
    }
    if (kept < 0) break; // the deck ran out before this draw
    index += takes;
    // The next draw is real; the one after it is a rumour.
    edge += (seat === botId ? 1 : -1) * kept * (CLAIRVOYANT_WEIGHT / (step + 1));
    seat = seat === botId ? enemyId : botId;
  }

  return edge;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function whoActs(state: GameState): PlayerId | null {
  if (state.phase === "gameOver") return null;
  if (state.phase === "heroPowerChoice") return state.heroPowerChoicePlayer;
  if (state.phase === "drawChoice") return state.drawChoice?.player ?? null;
  if (state.phase === "targeting") return state.pendingTarget?.player ?? null;
  return state.activePlayer;
}

/**
 * What a move is worth beyond the board it leaves behind.
 *
 * Split out because `hard` re-scores the same action after a deep look and has
 * to apply the identical adjustments, and two copies of these numbers drifted
 * apart the moment either was tuned.
 */
function tempoAdjustment(action: GameAction): number {
  // Ending the turn hands over the initiative, so it has to genuinely beat every
  // other option rather than merely tie with it.
  if (action.type === "end_turn") return -8;
  // The Coin converts into mana, which the "spend your turn" term would
  // otherwise read as a loss. Cancel that so the bot banks it instead of
  // refusing to touch it all game.
  if (action.type === "use_coin") return 1;
  return 0;
}

function evaluateAction(
  state: GameState,
  action: GameAction,
  library: CardLibrary,
  forId: PlayerId,
  knownLegal?: readonly GameAction[],
  trueDice = true,
): { state: GameState; score: number } {
  if (trueDice) {
    const result = applyAction(state, action, library, knownLegal, false);
    return { state: result.state, score: scoreState(result.state, forId) + tempoAdjustment(action) };
  }

  // Blind: resolve the move on dice the game is not going to roll. Most moves
  // are not random at all, and for those this costs exactly one apply — the seed
  // only advances when something actually rolled, so an unchanged seed proves
  // nothing was left to chance and one sample is the exact answer.
  const first = blindSeed(state, 1);
  const trial = applyAction({ ...state, rngSeed: first }, action, library, knownLegal, false);
  const wasRandom = trial.state.rngSeed !== first;
  let total = scoreState(trial.state, forId);
  let samples = 1;

  // The DECISION is blind; the OUTCOME is whatever the game really rolls. Those
  // are two different things, and conflating them matters now that this runs
  // inside a rollout rather than only at the top of a one-ply search: a
  // continuation built on a fictional roll projects a duel that never happens.
  let outcome = { ...trial.state, rngSeed: state.rngSeed };

  if (wasRandom) {
    // Average a few different rolls, so the bot plays the odds rather than one
    // arbitrary outcome it happened to be shown.
    for (let index = 2; index <= BLIND_SAMPLES; index += 1) {
      const seed = blindSeed(state, index);
      const sample = applyAction({ ...state, rngSeed: seed }, action, library, knownLegal, false);
      total += scoreState(sample.state, forId);
      samples += 1;
    }
    outcome = applyAction(state, action, library, knownLegal, false).state;
  }

  return { state: outcome, score: total / samples + tempoAdjustment(action) };
}

function bestGreedy(
  state: GameState,
  library: CardLibrary,
  forId: PlayerId,
  trueDice = true,
): { action: GameAction; state: GameState } | null {
  const legal = getLegalActions(state, library);
  if (legal.length === 0) return null;
  let best: GameAction | null = null;
  let bestState: GameState | null = null;
  let bestScore = -Infinity;
  for (const action of legal) {
    const evaluated = evaluateAction(state, action, library, forId, legal, trueDice);
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
function rolloutTurn(
  state: GameState,
  library: CardLibrary,
  playerId: PlayerId,
  trueDice = true,
): GameState {
  let current = state;
  for (let step = 0; step < ROLLOUT_CAP; step += 1) {
    if (current.phase === "gameOver") return current;
    const actor = whoActs(current);
    if (actor === null || actor !== playerId) return current;
    const step = bestGreedy(current, library, playerId, trueDice);
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
 * Scores the board the opponent hands back, assuming they answer well.
 *
 * The old version let the opponent take one greedy turn — which is exactly what
 * `normal` plays. So `hard` was tuned against one specific weak opponent and
 * quietly assumed you would misplay in the same way it would. Insight+ ranks
 * your best few openings by how good they look TO YOU, plays each of them out,
 * and keeps the WORST board that comes back. That is the difference between
 * "what will probably happen" and "what happens if you are paying attention".
 *
 * Your half of this projection rolls BLIND, because you are blind. Modelling you
 * as someone who reads the dice was the first version's mistake: it braced the
 * Ascendant against answers no Veteran and no human could actually find, and
 * left it unprepared for the ones they can. A cheat is what the Ascendant knows,
 * never what it imagines you know.
 */
export function worstReply(
  state: GameState,
  library: CardLibrary,
  botId: PlayerId,
  cheats: BotCheats,
): number {
  const enemyId: PlayerId = botId === 0 ? 1 : 0;
  const value = (projected: GameState): number =>
    scoreState(projected, botId) + (cheats.clairvoyance ? clairvoyanceEdge(projected, library, botId) : 0);

  if (state.phase === "gameOver" || whoActs(state) !== enemyId) return value(state);

  const legal = getLegalActions(state, library);
  if (legal.length === 0) return value(state);

  // ENEMY_DICE: false — the opponent picks their moves without seeing the roll,
  // because that is the opponent who actually exists on the other side.
  if (!cheats.readsYourReply || legal.length === 1) {
    return value(rolloutTurn(state, library, enemyId, ENEMY_DICE));
  }

  const replies = legal
    .map((action) => ({ action, ...evaluateAction(state, action, library, enemyId, legal, ENEMY_DICE) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, ENEMY_BRANCH);

  let worst = Infinity;
  for (const reply of replies) {
    const after =
      reply.state.phase === "gameOver" ? reply.state : rolloutTurn(reply.state, library, enemyId, ENEMY_DICE);
    const scored = value(after);
    if (scored < worst) worst = scored;
  }
  return worst === Infinity ? value(state) : worst;
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

  const cheats = BOT_CHEATS[skill];
  const scored = legal.map((action) => ({
    action,
    ...evaluateAction(state, action, library, botId, legal, cheats.trueDice),
  }));

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
      // Its OWN turn it may finish with the real dice — that is its cheat.
      projected = rolloutTurn(projected, library, botId, cheats.trueDice);
    }
    let score = worstReply(projected, library, botId, cheats);
    score += tempoAdjustment(candidate.action);
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
