import { applyAction, getLegalActions, actionKey, readySwings, STARTING_CORE, type CardLibrary } from "./game";
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
    enginePremium: ENGINE_PREMIUM,
    beamWidth: BEAM_WIDTH,
    deepLines: DEEP_LINES,
    enemyBranch: ENEMY_BRANCH,
    enemyDice: ENEMY_DICE,
    clairvoyantDepth: CLAIRVOYANT_DEPTH,
    clairvoyantWeight: CLAIRVOYANT_WEIGHT,
    blindSamples: BLIND_SAMPLES,
    rolloutCap: ROLLOUT_CAP,
  };
}

/**
 * How many part-built turns `hard` carries at once.
 *
 * This is both dials at once. It is the width of the opening shortlist, because
 * the beam starts as the best few openings — and it is the width of the turn
 * search, because those lines are extended together rather than each being
 * finished greedily on its own. Five was the old shortlist size; nine buys a
 * weak-looking setup card enough room to survive its first move and prove itself
 * on the second, at roughly 1.6x the search cost.
 *
 * Cost is close to linear in this number, and the Ascendant's move already runs
 * on the UI thread. Read the timing note in the README before raising it.
 */
const BEAM_WIDTH = 9;

/**
 * How many of those finished turns get the full "and then what do they do?"
 * search.
 *
 * Building nine turns is cheap. Answering each one with a branched opponent
 * reply is the expensive half, and doing it for all nine was measurably the
 * dominant cost. This keeps the beam's ability to FIND a better turn while
 * paying for the deep look only on the turns that could win the argument.
 *
 * The owner's budget for a whole enemy turn is 8 SECONDS (raised from 5 on
 * 2026-08-18). It is a whole TURN, not a move: a turn is five or six moves plus
 * `BOT_DELAY_MS` between each, so most of it is deliberate pause.
 *
 * Five is where the spending stopped, and the stopping point was measured rather
 * than chosen. On a quiet machine, 56 turns across five duels:
 *
 *     deep 4, branch 3, budget 110  — median 3.81s, p90 9.01s, 11% over 8s
 *     deep 5, branch 3, budget 110  — median 3.41s, p90 9.39s, 11% over 8s
 *     deep 6, branch 4, budget 80   — median 3.91s, p90 10.79s, 16% over 8s
 *
 * The first step is free and the second is not. Note also what the tail did NOT
 * respond to: tightening `BEAM_BUDGET` to 80 was supposed to curb the slow turns
 * and did the opposite, because the slowest turns are the LONG ones — many moves,
 * each paying full search — not the crowded ones. No dial here caps a turn's
 * move count, so the tail is not currently reachable by tuning.
 *
 * Free, and also worth nothing. A paired ladder A/B of 4 against 5, same seeds
 * back to back, moved hard>easy and hard>normal by +1.0 each at p=1.000, with
 * only three and five duels out of a hundred changing at all. Five is shipped
 * because it costs nothing and looks a little further, not because it wins.
 * DO NOT read a bigger number here as a stronger opponent: three separate
 * deepenings of this search have now measured as zero, and the reason is that
 * `scoreState` cannot see card quality or passive effects. Fix the judgement
 * before buying more search.
 */
const DEEP_LINES = 5;

/**
 * Roughly how many moves the beam is allowed to weigh per step of a turn.
 *
 * The cost of a step is the beam's width times the number of legal moves, and
 * the second half of that is the game's business, not ours: a crowded board with
 * a full hand offers three or four times as many moves as an opening turn. A
 * fixed width therefore does not cost a fixed amount, which is why the slowest
 * turns measured several times the typical one.
 *
 * Holding width times legal-moves near a constant bounds the step instead, so
 * the search narrows exactly where it was running away.
 *
 * It stays deterministic —
 * the width comes from the position, never from a clock. A wall-clock budget
 * would cap the same cost and is the obvious answer, but it would mean the same
 * board producing different moves on a slower machine, and every replay, save
 * and test in this engine depends on that not happening.
 */
const BEAM_BUDGET = 110;

/** The beam width this particular position can afford. */
function affordableWidth(legalCount: number, cap: number): number {
  return Math.max(2, Math.min(cap, Math.round(BEAM_BUDGET / Math.max(1, legalCount))));
}
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
 * What a minion that keeps PAYING is worth on top of its stat line.
 *
 * This is the number that makes the bot trade instead of running at the core
 * every turn, and it is deliberately large — roughly a whole extra body.
 *
 * The reasoning is about which threats expire and which do not. A Battlecry has
 * already paid out by the time the minion is sitting there; a Deathrattle pays
 * once, later, and killing the minion is what triggers it; Taunt and Divine
 * Shield are one-time tolls that the attacker pays and is then done with. None
 * of those get better for their owner by being left alone. A Passive or an
 * Ongoing does: it is a standing rule or a per-turn payment that collects again
 * every single turn nobody answers it, so its true price is the payout times
 * the turns still to come — and a Convergence duel runs about eleven turns a
 * side, so "the turns still to come" is usually most of the game.
 *
 * Fourteen is arithmetic, not taste, and the arithmetic is why the old bot was
 * reported as attacking the core with practically every swing. Face damage is
 * worth about 3.6 points per point
 * of ATK here — 2.2 from the health difference and 1.4 from the progress term —
 * so a 4-ATK swing at the core scores about 14.4, while a whole 4/4 body is
 * worth only 9.2. The evaluation was therefore stating, correctly by its own
 * numbers, that three points of face beat killing an equal minion. Nothing
 * short of a premium on this scale changes that verdict.
 *
 * What 14 buys, for a 4-ATK attacker: killing a 2/2 engine and surviving scores
 * about 17 against the core's 14.4, so it trades. Killing a vanilla 2/2 scores
 * 3.3, so it does not. An 8-ATK minion still races, because 28.8 of face is
 * genuinely worth more than one small engine. That is the intended shape —
 * trade at engines often, not always, and never blindly.
 *
 * It is symmetric on purpose. The same premium is what stops the bot throwing
 * its OWN engine into a pointless attack, and an asymmetric "enemy engines are
 * scary" term would have made it play its own side worse in order to play the
 * trade better. The README's own warning about pricing a threat twice applies
 * to deterrents, which punish the attacker; an engine punishes the DEFENDER for
 * leaving it alone, so the defender's side is where it belongs.
 *
 * A silenced or chained engine is paying nothing, so it earns nothing here —
 * which is also how the bot learns that silencing an engine is nearly as good
 * as killing it.
 */
const ENGINE_PREMIUM = 14;

/**
 * Is this minion currently collecting value every turn?
 *
 * Printed timing is not the whole answer: Yubaba, Chrollo and All For One hand a
 * Passive or an Ongoing to a minion whose own card prints neither, and a minion
 * wearing a borrowed engine is exactly as expensive to leave alone as one that
 * came with it. Silence and chains are the off switches for both.
 */
function isLiveEngine(minion: MinionInstance): boolean {
  if (minion.silenced || minion.chained > 0) return false;
  if (minion.effectTiming === "passive" || minion.effectTiming === "ongoing" || minion.effectTiming === "onPlayAndOngoing") {
    return minion.effectId !== "none";
  }
  return minion.gainedEffects.some((effect) => effect.timing === "passive" || effect.timing === "ongoing");
}

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
  // by the time it is sitting here. See ENGINE_PREMIUM for why the number is
  // this big and what it is meant to change about the bot's attacks.
  if (isLiveEngine(minion)) value += ENGINE_PREMIUM;

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

/**
 * Damage this player could put on the enemy core right now, if nothing blocked.
 *
 * Counted through the engine's own `readySwings` rather than a local rule of
 * thumb. The local one said "one swing per body that has not swung yet", which
 * missed the second attack Flash, Vergil and a Tesseract bearer get, missed the
 * swing a half-spent multi-attacker still has, and counted the ATK of bodies
 * that can never attack at all — Galactus, Yoda, GLaDOS, The Watcher. Every one
 * of those errors lands on the lethal check, which is the term this evaluation
 * lets dominate everything else.
 */
function reach(state: GameState, playerId: PlayerId): number {
  return state.players[playerId].board.reduce(
    (total, minion) => total + (minion ? minion.atk * readySwings(minion) : 0),
    0,
  );
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
  // Progress toward winning. Measured from the real starting core rather than
  // the 30 this used to hard-code — that number was three pacing passes stale,
  // and while a constant offset cancels out of every comparison, a stale one
  // reads as a live dial to the next person tuning this.
  score += (STARTING_CORE - enemy.health) * 1.4;
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
  if (state.phase === "mulligan") return state.mulligan?.player ?? null;
  if (state.phase === "drawChoice") return state.drawChoice?.player ?? null;
  if (state.phase === "targeting") return state.pendingTarget?.player ?? null;
  return state.activePlayer;
}

/** Bot targets should resolve normally; only a human gets the play-to-hand escape. */
function botLegalActions(state: GameState, library: CardLibrary, knownLegal?: readonly GameAction[]): GameAction[] {
  const legal = [...(knownLegal ?? getLegalActions(state, library))];
  const withoutCancel = legal.filter((action) => action.type !== "cancel_target");
  return withoutCancel.length > 0 ? withoutCancel : legal;
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
  const legal = botLegalActions(state, library);
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
export function rolloutTurn(
  state: GameState,
  library: CardLibrary,
  playerId: PlayerId,
  trueDice = true,
): GameState {
  let current = state;
  for (let depth = 0; depth < ROLLOUT_CAP; depth += 1) {
    if (current.phase === "gameOver") return current;
    const actor = whoActs(current);
    if (actor === null || actor !== playerId) return current;
    const move = bestGreedy(current, library, playerId, trueDice);
    if (!move) return current;
    // A move that changes nothing would spin here forever. (The old guard also
    // compared the chosen action's key against itself, which is always true and
    // decided nothing; the state check is what was doing the work.)
    if (move.state === current) return current;
    current = move.state;
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

  const legal = botLegalActions(state, library);
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

/** Every legal move from here, scored on its own. The beam's starting line-up. */
function scoreOpenings(
  state: GameState,
  library: CardLibrary,
  botId: PlayerId,
  trueDice: boolean,
  knownLegal?: readonly GameAction[],
): Array<{ action: GameAction; state: GameState; score: number }> {
  const legal = botLegalActions(state, library, knownLegal);
  return legal.map((action) => ({
    action,
    ...evaluateAction(state, action, library, botId, legal, trueDice),
  }));
}

/**
 * The whole turns `hard` weighed before choosing. Exported for tests: the point
 * of the beam is that it reaches turns the greedy line never builds, and that
 * claim is only checkable by looking at what it built.
 */
export function turnsConsidered(
  state: GameState,
  library: CardLibrary,
  botId: PlayerId,
  cheats: BotCheats,
): BeamLine[] {
  const openings = scoreOpenings(state, library, botId, cheats.trueDice).sort((a, b) => b.score - a.score);
  return beamOwnTurn(library, botId, cheats, openings);
}

/**
 * What makes one opening genuinely different from another.
 *
 * WHICH card you play is a decision; which empty slot you drop it into almost
 * never is. Keying the beam's diversity on the full action spent all nine lines
 * on one card in five slots and a second card in four — nine "different"
 * openings that were really two, scoring identically to three decimal places,
 * with every other card in hand already discarded. Targets are the opposite case
 * and stay part of the identity: who you attack is the whole decision.
 *
 * This only governs which lines are GUARANTEED a place. Every legal move is
 * still explored, and duplicates can still fill the beam's remaining slots.
 *
 * Like the reservation it serves, this is evidenced by measurement rather than
 * by a test: keying on the full action was observed filling all nine lines with
 * one card in five slots and a second in four, every line scoring identically.
 * The beam's width itself IS covered — collapsing it to one fails two tests.
 */
function openingIdentity(action: GameAction): string {
  if (action.type === "play_card") return `play:${action.handIndex}`;
  if (action.type === "play_relic") return `relic:${action.handIndex}`;
  return actionKey(action);
}

/** One part-built turn: where it started, and where it has got to. */
export interface BeamLine {
  firstAction: GameAction;
  openingScore: number;
  state: GameState;
}

/**
 * Builds several whole turns at once and hands back the finished ones.
 *
 * This replaced two mechanisms that shared one blind spot. The old search picked
 * the five best-LOOKING opening moves and then finished each turn greedily, one
 * best-looking move at a time. Both halves judged a move by the board it left
 * behind immediately, which is exactly the wrong test for a setup card: a body
 * that only matters once the buff lands looks like a wasted turn on its own, so
 * it never made the shortlist, and the turn that would have won was never
 * examined. The bot could not see a two-card play unless each card was already
 * the best move by itself — in which case it was not really a combo.
 *
 * A beam keeps the best BEAM_WIDTH part-built turns side by side and extends all
 * of them together, so a weak-looking opening survives long enough to show what
 * it sets up. Nothing is compared as a finished turn until it IS a finished
 * turn. Diversity is not the goal and lines collapsing onto one opening is fine:
 * only the first move is ever played, so several strong turns agreeing on how to
 * start is the answer arriving early.
 */
function beamOwnTurn(
  library: CardLibrary,
  botId: PlayerId,
  cheats: BotCheats,
  openings: Array<{ action: GameAction; state: GameState; score: number }>,
): BeamLine[] {
  const finished: BeamLine[] = [];
  // The openings are already scored and sorted; the beam starts as the best few
  // it can afford on a board this busy.
  const width = affordableWidth(openings.length, BEAM_WIDTH);
  let live: BeamLine[] = openings
    .slice(0, width)
    .map((opening) => ({ firstAction: opening.action, openingScore: opening.score, state: opening.state }));

  for (const line of live) {
    if (line.state.phase === "gameOver" || whoActs(line.state) !== botId) finished.push(line);
  }
  live = live.filter((line) => line.state.phase !== "gameOver" && whoActs(line.state) === botId);

  for (let step = 0; step < ROLLOUT_CAP && live.length > 0; step += 1) {
    const extended: Array<BeamLine & { score: number }> = [];

    for (const line of live) {
      const legal = botLegalActions(line.state, library);
      if (legal.length === 0) {
        finished.push(line);
        continue;
      }
      for (const action of legal) {
        // Its OWN turn it may finish with the real dice — that is its cheat.
        const next = evaluateAction(line.state, action, library, botId, legal, cheats.trueDice);
        extended.push({
          firstAction: line.firstAction,
          openingScore: line.openingScore,
          state: next.state,
          score: next.score,
        });
      }
    }

    if (extended.length === 0) break;
    extended.sort((a, b) => b.score - a.score);
    // Re-price every step: a turn opens crowded and empties as mana is spent.
    const stepWidth = affordableWidth(Math.ceil(extended.length / Math.max(1, live.length)), BEAM_WIDTH);

    // Keep the best line for each DIFFERENT opening move before filling the rest
    // of the beam with whatever scores highest overall.
    //
    // Without this the beam collapses almost immediately: the strongest opening
    // usually has the strongest follow-ups too, so all nine slots fill with
    // variations of one turn and every other opening is gone by the second move.
    // That is the original blind spot wearing a wider hat — a setup card is
    // behind on the board precisely while it is setting something up, so it must
    // be allowed to stay behind until the turn ends. This is the half of the fix
    // that widens the shortlist; the beam itself is what then finds the payoff.
    //
    // Honest note on its size: measured over ten sampled high-mana turns, the
    // reservation improved 5 of them against the greedy line versus 4 without
    // it, for a total advantage of 107.0 against 100.7. Real, but small, and
    // NOT covered by a test — a test that could tell a 6% effect apart would
    // have to be pinned to one specific board, which is precisely the kind of
    // test that later passes for the wrong reason. Re-measure rather than trust
    // this comment if you are deciding whether to keep it.
    const kept: Array<BeamLine & { score: number }> = [];
    const seenOpenings = new Set<string>();
    for (const candidate of extended) {
      if (kept.length >= stepWidth) break;
      const opening = openingIdentity(candidate.firstAction);
      if (seenOpenings.has(opening)) continue;
      seenOpenings.add(opening);
      kept.push(candidate);
    }
    for (const candidate of extended) {
      if (kept.length >= stepWidth) break;
      if (kept.includes(candidate)) continue;
      kept.push(candidate);
    }

    const carry: BeamLine[] = [];
    for (const candidate of kept) {
      const line: BeamLine = {
        firstAction: candidate.firstAction,
        openingScore: candidate.openingScore,
        state: candidate.state,
      };
      if (line.state.phase === "gameOver" || whoActs(line.state) !== botId) finished.push(line);
      else carry.push(line);
    }
    live = carry;
  }

  // A line still running when the cap bites is judged where it stands rather
  // than thrown away; the cap is a safety rail, not a rule of the game.
  finished.push(...live);
  return finished;
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
  const legal = botLegalActions(state, library, knownLegal);
  if (legal.length === 0) return null;
  if (state.phase === "mulligan") {
    return legal.find((action) => action.type === "confirm_mulligan") ?? legal[legal.length - 1];
  }
  if (legal.length === 1) return legal[0];

  const cheats = BOT_CHEATS[skill];
  const scored = scoreOpenings(state, library, botId, cheats.trueDice, legal);

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

  // hard: build several whole turns, then judge them as whole turns.
  let best: { action: GameAction; score: number } = scored[0];
  let bestScore = -Infinity;

  // Building the turns is cheap; asking what the opponent does about each one is
  // not, because that is a fresh branching search per line. So build wide and
  // look deep only at the best few. Ranking by the turn's own finished board is
  // a good enough filter, and it is deterministic — a wall-clock cutoff would
  // cap the cost too, but the same position would then produce different moves
  // on a slower machine, and nothing in this engine is allowed to do that.
  const built = beamOwnTurn(library, botId, cheats, scored);
  const deepest =
    built.length <= DEEP_LINES
      ? built
      : built
          .map((line) => ({ line, quick: scoreState(line.state, botId) }))
          .sort((a, b) => b.quick - a.quick)
          .slice(0, DEEP_LINES)
          .map((entry) => entry.line);

  for (const line of deepest) {
    let score = worstReply(line.state, library, botId, cheats);
    score += tempoAdjustment(line.firstAction);
    // Break ties toward the move that already looked best on its own, so `hard`
    // never plays worse than `normal` on a position where the deep look adds
    // nothing.
    score += line.openingScore * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = { action: line.firstAction, score: line.openingScore };
    }
  }

  return best.action;
}
