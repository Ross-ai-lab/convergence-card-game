/**
 * The simulation harness's shared machinery: loading the real card data outside
 * Vite, a reproducible generator for the *driver* (never for the engine), the
 * state invariants every game is checked against, and one function that plays a
 * single game to its end and reports what happened.
 *
 * Kept separate from `simulate.ts` so the balance run and the fuzz run share one
 * definition of "a legal game" and can never drift apart.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCardsCsv, parseRelicsCsv } from "../src/engine/csv";
import {
  applyAction,
  createInitialGame,
  getLegalActions,
  makeCardLibrary,
  actionKey,
  STARTING_CORE,
  type CardLibrary,
} from "../src/engine/game";
import { chooseBotAction, type BotSkill } from "../src/engine/bot";
import type { CardDefinition, GameAction, GameState, PlayerId, RelicDefinition } from "../src/engine/types";

/** How many of each player's OWN opening turns are sampled for playability. */
export const OPENING_TURNS = 4;

/**
 * Turn numbers at which the who-is-ahead snapshot is taken. Global player-turns,
 * so an ODD one is the top of Player One's turn and an EVEN one the top of
 * Player Two's.
 *
 * 5 and 6 are both here on purpose. Board strength read at the top of a turn is
 * mildly biased toward whoever moved last — their newest minions have not been
 * attacked yet — so the pair brackets that bias and lets the report state its
 * size instead of guessing at it. The gate judges turn 5; turn 6 is the control.
 */
export const LEAD_CHECKPOINTS = [5, 6, 9, 13, 17];

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");

export function loadData(): { cards: CardDefinition[]; relics: RelicDefinition[] } {
  return {
    cards: parseCardsCsv(readFileSync(join(ROOT, "data", "cards.csv"), "utf8")),
    relics: parseRelicsCsv(readFileSync(join(ROOT, "data", "relics.csv"), "utf8")),
  };
}

/**
 * The driver's own generator. Deliberately separate from the engine's — the
 * engine's seed lives in GameState and must stay untouched, so the fuzzer rolls
 * its dice here instead and a run stays reproducible from `--seed`.
 */
export function makeRng(seed: string) {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return function next(): number {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// Invariants. These are the things that must be true after EVERY action, and
// each one of them is a bug class a human playtest would take dozens of hours
// to stumble into.
// ---------------------------------------------------------------------------

export function checkState(state: GameState, where: string): string[] {
  const problems: string[] = [];
  const seenInstances = new Set<string>();

  const bad = (message: string) => problems.push(`${where}: ${message}`);

  if (!Number.isFinite(state.turnNumber) || state.turnNumber < 1) bad(`turnNumber is ${state.turnNumber}`);
  if (!Number.isFinite(state.rngSeed)) bad("rngSeed is not finite");

  for (const player of state.players) {
    if (!Number.isFinite(player.health)) bad(`p${player.id} health is ${player.health}`);
    if (!Number.isFinite(player.mana) || player.mana < 0) bad(`p${player.id} mana is ${player.mana}`);
    if (player.maxMana > 10) bad(`p${player.id} maxMana ${player.maxMana} above the cap`);
    if (player.board.length !== 5) bad(`p${player.id} board has ${player.board.length} slots`);
    if (player.hand.length > 40) bad(`p${player.id} hand has ${player.hand.length} cards`);

    player.board.forEach((minion, slot) => {
      if (!minion) return;
      if (seenInstances.has(minion.instanceId)) bad(`instance ${minion.instanceId} is on the board twice`);
      seenInstances.add(minion.instanceId);
      if (minion.owner !== player.id) bad(`${minion.name} sits on p${player.id}'s board but is owned by p${minion.owner}`);
      if (!Number.isFinite(minion.atk)) bad(`${minion.name} atk is ${minion.atk}`);
      if (!Number.isFinite(minion.hp)) bad(`${minion.name} hp is ${minion.hp}`);
      if (minion.hp <= 0) bad(`${minion.name} is alive at ${minion.hp} hp in slot ${slot}`);
      if (minion.atk < 0) bad(`${minion.name} has negative atk ${minion.atk}`);
      if (minion.relic && !minion.relic.relicId) bad(`${minion.name} carries a relic with no relicId`);
    });
  }

  // A live game that offers nobody a move is a soft-lock: the UI would sit there
  // with nothing clickable and no way out. This is the single most valuable
  // assertion in the file.
  if (state.phase !== "gameOver" && state.winner !== null) bad("winner is set but the phase is not gameOver");

  return problems;
}

/** The save file has to survive a JSON round trip or a restored duel is corrupt. */
export function checkSerialisable(state: GameState, where: string): string[] {
  try {
    const round = JSON.parse(JSON.stringify(state)) as GameState;
    if (round.players.length !== 2) return [`${where}: round-tripped state lost a player`];
    if (round.turnNumber !== state.turnNumber) return [`${where}: round trip changed turnNumber`];
    const liveA = state.players.flatMap((p) => p.board.filter(Boolean)).length;
    const liveB = round.players.flatMap((p) => p.board.filter(Boolean)).length;
    if (liveA !== liveB) return [`${where}: round trip changed the board population (${liveA} -> ${liveB})`];
    return [];
  } catch (error) {
    return [`${where}: state is not JSON-serialisable — ${(error as Error).message}`];
  }
}

// ---------------------------------------------------------------------------
// Playing one game.
// ---------------------------------------------------------------------------

export type Driver = "bot" | "random";

/** Who was ahead at one checkpoint, and by how much. */
export interface LeadSnapshot {
  turn: number;
  health: [number, number];
  /** Sum of atk + hp over every live minion, per player. */
  boardPower: [number, number];
}

/**
 * Could this player legally put ANY card on the board at the top of their own
 * turn? Read off the engine's legal-action list, never off cost arithmetic, so
 * The Coin, per-card discounts and relics are all accounted for.
 *
 * Deliberately "could", not "did": this measures the hand the shuffle dealt, not
 * the bot's taste. `null` means that turn never happened — the duel ended first.
 */
function couldPlayAnything(
  state: GameState,
  legal: GameAction[],
  player: PlayerId,
  library: CardLibrary,
): boolean {
  if (legal.some((action) => (action.type === "play_card" || action.type === "play_relic") && action.player === player)) return true;
  // A hand that is dead only until The Coin is spent is not a dead hand. Ask
  // again on the other side of it.
  const coin = legal.find((action) => action.type === "use_coin" && action.player === player);
  if (!coin) return false;
  return applyAction(state, coin, library).legalActions.some(
    (action) => (action.type === "play_card" || action.type === "play_relic") && action.player === player,
  );
}

function boardPower(state: GameState, player: PlayerId): number {
  return state.players[player].board.reduce((total, minion) => total + (minion ? minion.atk + minion.hp : 0), 0);
}

export interface GameResult {
  seed: string;
  winner: PlayerId | "draw" | null;
  turns: number;
  actions: number;
  /** True when the game hit the turn cap without anyone winning. */
  stalled: boolean;
  softLocked: boolean;
  healthLeft: [number, number];
  /** Board population averaged over every action, per player. */
  avgBoard: [number, number];
  /** cardId -> times that player put it on the board. */
  playsByPlayer: [Map<string, number>, Map<string, number>];
  /** cardId -> times it reached a hand at all. */
  drawn: Map<string, number>;
  /** The highest mana either player ever had available. Caps which half of the roster is real. */
  peakMana: number;
  /** Index = card cost, value = how many cards of that cost were played all game. */
  playsByCost: number[];
  /**
   * Per player, per own-turn (index 0 = their first turn): was ANY card legally
   * playable at the top of it? `null` = that turn never happened.
   */
  openingPlayable: [Array<boolean | null>, Array<boolean | null>];
  /** Who was ahead at each LEAD_CHECKPOINTS turn the duel actually reached. */
  leads: LeadSnapshot[];
  /** The core both players started on. Recorded so no downstream stat has to guess it. */
  startingHealth: number;
  problems: string[];
}

export interface PlayOptions {
  cards: CardDefinition[];
  relics: RelicDefinition[];
  seed: string;
  drivers: [Driver, Driver];
  skills: [BotSkill, BotSkill];
  turnCap: number;
  /** Full invariant checking is ~3x slower; the balance run samples it instead. */
  deepChecks: boolean;
  /** Core HP both players start on. Omitted = the game's real default. */
  startingHealth?: number;
  /** Mana per turn. Omitted = the game's real default. */
  manaRamp?: number;
}

export function playOneGame(options: PlayOptions): GameResult {
  const { cards, relics, seed, drivers, skills, turnCap, deepChecks, startingHealth, manaRamp } = options;
  const library = makeCardLibrary(cards, relics);
  const rng = makeRng(`${seed}:driver`);
  const byId = new Map([...cards, ...relics].map((card) => [card.id, card]));

  const setup: { startingHealth?: number; manaRamp?: number } = {};
  if (startingHealth) setup.startingHealth = startingHealth;
  if (manaRamp) setup.manaRamp = manaRamp;
  let state = createInitialGame(cards, seed, relics, setup);
  let peakMana = 1;
  const playsByCost = new Array(11).fill(0);
  const problems: string[] = [];
  const playsByPlayer: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  const drawn = new Map<string, number>();
  const boardTotals: [number, number] = [0, 0];

  const noteHand = (next: GameState) => {
    for (const player of next.players) {
      for (const cardId of player.hand) drawn.set(cardId, (drawn.get(cardId) ?? 0) + 1);
    }
  };

  let actions = 0;
  let softLocked = false;
  let repeated = 0;
  let lastKey = "";

  const openingPlayable: [Array<boolean | null>, Array<boolean | null>] = [
    new Array<boolean | null>(OPENING_TURNS).fill(null),
    new Array<boolean | null>(OPENING_TURNS).fill(null),
  ];
  const leads: LeadSnapshot[] = [];
  const leadsTaken = new Set<number>();

  // Cards sitting in the opening hands were never "drawn" by an action, so they
  // are counted once up front and the loop only counts what arrives later.
  const handSeen = new Set<string>();
  for (const player of state.players) for (const cardId of player.hand) handSeen.add(`${player.id}:${cardId}`);
  noteHand(state);

  while (state.phase !== "gameOver" && state.turnNumber <= turnCap) {
    const legal = getLegalActions(state, library);
    if (legal.length === 0) {
      softLocked = true;
      problems.push(`turn ${state.turnNumber}: no legal actions but the game is not over (phase ${state.phase})`);
      break;
    }

    // Opening fairness and the snowball snapshot are both sampled here, at the
    // top of a turn, before anybody has acted on it. Both ride along inside games
    // that are being played anyway and cost no extra duels.
    if (state.phase === "main") {
      const ownTurn = state.players[state.activePlayer].turnsStarted;
      if (ownTurn >= 1 && ownTurn <= OPENING_TURNS && openingPlayable[state.activePlayer][ownTurn - 1] === null) {
        openingPlayable[state.activePlayer][ownTurn - 1] = couldPlayAnything(
          state,
          legal,
          state.activePlayer,
          library,
        );
      }
    }
    if (LEAD_CHECKPOINTS.includes(state.turnNumber) && !leadsTaken.has(state.turnNumber)) {
      leadsTaken.add(state.turnNumber);
      leads.push({
        turn: state.turnNumber,
        health: [state.players[0].health, state.players[1].health],
        boardPower: [boardPower(state, 0), boardPower(state, 1)],
      });
    }

    const actor: PlayerId =
      state.phase === "drawChoice" && state.drawChoice
        ? state.drawChoice.player
        : state.phase === "targeting" && state.pendingTarget
          ? state.pendingTarget.player
          : state.activePlayer;

    let action: GameAction | null = null;
    if (drivers[actor] === "bot") {
      action = chooseBotAction(state, library, actor, skills[actor]);
      if (action && !legal.some((candidate) => actionKey(candidate) === actionKey(action as GameAction))) {
        problems.push(`turn ${state.turnNumber}: the bot returned an action that is not legal — ${actionKey(action)}`);
        action = null;
      }
    }
    if (!action) action = legal[Math.floor(rng() * legal.length)] ?? legal[0];

    // A card leaving the hand is only identifiable before the action lands.
    if (action.type === "play_card" || action.type === "play_relic") {
      const cardId = state.players[action.player].hand[action.handIndex];
      if (cardId) {
        const bucket = playsByPlayer[action.player];
        bucket.set(cardId, (bucket.get(cardId) ?? 0) + 1);
        const cost = byId.get(cardId)?.cost;
        if (typeof cost === "number" && cost >= 0 && cost <= 10) playsByCost[cost] += 1;
      }
    }

    const key = actionKey(action);
    let next: GameState;
    try {
      const result = applyAction(state, action, library);
      next = result.state;
    } catch (error) {
      problems.push(`turn ${state.turnNumber}: applyAction THREW on ${key} — ${(error as Error).message}`);
      break;
    }

    if (deepChecks) {
      problems.push(...checkState(next, `turn ${state.turnNumber} after ${key}`));
      if (actions % 25 === 0) problems.push(...checkSerialisable(next, `turn ${state.turnNumber}`));
    }

    // The same action producing the same state over and over is a live-lock: the
    // turn cap would eventually catch it, but naming it is far more useful.
    if (key === lastKey && JSON.stringify(next) === JSON.stringify(state)) {
      repeated += 1;
      if (repeated > 8) {
        softLocked = true;
        problems.push(`turn ${state.turnNumber}: ${key} repeated with no state change — live-lock`);
        break;
      }
    } else {
      repeated = 0;
    }
    lastKey = key;

    for (const player of next.players) {
      for (const cardId of player.hand) {
        const mark = `${player.id}:${cardId}`;
        if (!handSeen.has(mark)) {
          handSeen.add(mark);
          drawn.set(cardId, (drawn.get(cardId) ?? 0) + 1);
        }
      }
    }

    boardTotals[0] += next.players[0].board.filter(Boolean).length;
    boardTotals[1] += next.players[1].board.filter(Boolean).length;
    peakMana = Math.max(peakMana, next.players[0].maxMana, next.players[1].maxMana);

    state = next;
    actions += 1;
    if (actions > turnCap * 60) {
      problems.push(`ran ${actions} actions without finishing — aborting`);
      softLocked = true;
      break;
    }
  }

  const stalled = state.phase !== "gameOver" && !softLocked;

  return {
    seed,
    winner: state.winner,
    turns: state.turnNumber,
    actions,
    stalled,
    softLocked,
    healthLeft: [state.players[0].health, state.players[1].health],
    avgBoard: [boardTotals[0] / Math.max(1, actions), boardTotals[1] / Math.max(1, actions)],
    playsByPlayer,
    drawn,
    peakMana,
    playsByCost,
    openingPlayable,
    leads,
    startingHealth: startingHealth ?? STARTING_CORE,
    problems,
  };
}
