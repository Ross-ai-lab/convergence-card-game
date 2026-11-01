import {copyGameState} from './state-copy';
import { isMinionCard, isRelicCard } from "./types";
import { validateDeck } from "../decks";
import { isTokenCardId, TOKEN_CARDS } from "./tokens";
import type {
  ApplyResult,
  BotCheats,
  CardDefinition,
  DamageTallyEntry,
  GameAction,
  GameEvent,
  GameState,
  HeroPowerId,
  PlayerId,
  PlayerState,
  RelicDefinition,
} from "./types";
import {
  DEFAULT_MANA_RAMP,
  DEFAULT_STARTING_HEALTH,
  boardSize,
  effectEvent,
  hasInfiniteMana,
  opponent,
  type CardLibrary,
} from "./rules/core";
import {
  afflictionSnapshot,
  enforceDumbledoreCleansing,
  enforceGlobalSilence,
  enforceSlotAuras,
  feedAfflictionWatchers,
  hasSlotAura,
  refreshPassiveAuras,
  suppressAuraBuffsOnSilenced,
} from "./rules/auras";
import {
  announceTopDeck,
  beginTurn,
  chooseDraw,
  confirmMulligan,
  expireTimedStates,
  resolveEndOfTurn,
  spendCoin,
  toggleMulligan,
} from "./rules/turns";
import {
  attackCore,
  attackMinion,
  attacksRandomly,
  canAttack,
  canDeclareAttack,
  hasHighestAttackRestriction,
  randomAttackTarget,
  refreshCarrierLocks,
  yujiroCoreAttackRestricted,
} from "./rules/combat";
import { attackTargetable, cancelPendingTarget, chooseTarget } from "./rules/targeting";
import { buildDeck, hashSeed, seededShuffle } from "./rules/random";
import { canEquipRelicToBearer, hasFreeRelicSlot, hasRelic, playRelic } from "./rules/relics";
import { checkGameOver, sweepDeaths } from "./rules/death";
import { drawDirect, effectiveCardCost } from "./rules/cards";
import { hasKeyword, tauntBypassActive, thawServed } from "./rules/stats";
import { heroPowerIsUsable, opponentHasKratosLock, useHeroPower } from "./rules/hero-power-rules";
import { playCard } from "./rules/play";

// The engine's public surface. The rules live in ./rules and ./effects; callers
// keep importing from here.
export { equipRelicFromOutside, hasFreeRelicSlot, relicRequiredAlignment } from "./rules/relics";
export { attacksRandomly, opponentHandRevealed, readySwings } from "./rules/combat";
export { effectiveCardCost } from "./rules/cards";
export { BOARD_SIZE, STARTING_CORE, hasInfiniteMana } from "./rules/core";
export type { CardLibrary } from "./rules/core";
export { effectiveHeroPowerCost, relicLockSource } from "./rules/hero-power-rules";
export { CONCEALED_CHOICE_EFFECTS, TARGETED_EFFECTS } from "./rules/targeting";
export { hasForesight } from "./rules/turns";

export function makeCardLibrary(cards: CardDefinition[]): Record<string, CardDefinition>;
export function makeCardLibrary(cards: CardDefinition[], relics: RelicDefinition[]): CardLibrary;
export function makeCardLibrary(cards: CardDefinition[], relics: RelicDefinition[] = []): CardLibrary {
  return Object.fromEntries([...cards, ...relics, ...TOKEN_CARDS].map((card) => [card.id, card]));
}

/** Knobs the simulator sweeps. The game itself always uses the defaults. */
export interface GameSetup {
  /** Explicit collectible deck lists; each must contain thirty unique cards. */
  decks?: readonly [readonly string[], readonly string[]];
  botCheats?: readonly [Readonly<BotCheats> | null, Readonly<BotCheats> | null];
  /** Seats that receive an opening mulligan, in order. */
  mulliganPlayers?: readonly PlayerId[];
  startingHealth?: number;
  manaRamp?: number;
  /** Seat granted permanent Foresight — the Ascendant opponent's draw cheat. */
  foresightFor?: PlayerId | null;
  /** Hero Powers assigned to each seat for this duel. */
  heroPowers?: [HeroPowerId | null, HeroPowerId | null];
  /** Build the deterministic first-duel teaching position instead of a normal deal. */
  tutorial?: boolean;
  /** Whether the second seat receives The Coin. AI duels omit it; hotseat keeps it. */
  hasCoin?: boolean;
}

export function createInitialGame(
  cards: CardDefinition[],
  seed = "convergence-v1",
  relicDefs: RelicDefinition[] = [],
  setup: GameSetup = {},
): GameState {
  const health = setup.startingHealth ?? DEFAULT_STARTING_HEALTH;
  const deck = setup.decks ? [] : buildDeck(
    [...cards, ...relicDefs.filter((relic) => relic.relicId !== "none")],
    seed,
  );
  const collectibleIds = [...cards, ...relicDefs.filter((relic) => relic.relicId !== "none")]
    .filter((card) => !isTokenCardId(card.id)).map((card) => card.id);
  if (setup.decks) {
    if (setup.tutorial) throw new Error("A scripted tutorial cannot use constructed duel decks");
    for (const [seat, ids] of setup.decks.entries()) {
      const result = validateDeck(ids, collectibleIds, collectibleIds);
      if (!result.valid) throw new Error(`Invalid deck for player ${seat}: ${JSON.stringify(result.issues)}`);
    }
  }
  const players: [PlayerState, PlayerState] = [makePlayer(0, "Player One", health), makePlayer(1, "Player Two", health)];
  const state: GameState = {
    phase: "mulligan",
    activePlayer: 0,
    turnNumber: 1,
    cheatMode: false,
    cheatPlayer: null,
    coreInvincible: [false, false],
    manaRamp: setup.manaRamp ?? DEFAULT_MANA_RAMP,
    nextInstance: 1,
    nextPlayOrder: 1,
    rngSeed: hashSeed(`${seed}:rng`),
    foresightFor: setup.foresightFor ?? null,
    deck,
    bottomDeck: [],
    discard: [],
    ...(setup.decks ? { playerDecks: [
      { deck: seededShuffle([...setup.decks[0]], `${seed}:player:0`), bottomDeck: [] },
      { deck: seededShuffle([...setup.decks[1]], `${seed}:player:1`), bottomDeck: [] },
    ] as GameState["playerDecks"] } : {}),
    ...(setup.botCheats ? { botCheats: setup.botCheats.map((cheats) => cheats ? { ...cheats } : null) as GameState["botCheats"] } : {}),
    drawChoice: null,
    pendingTarget: null,
    pendingPlayCancel: null,
    mulligan: {
      player: setup.mulliganPlayers?.[0] ?? 0,
      selected: [false, false, false],
      ...(setup.mulliganPlayers && setup.mulliganPlayers.length > 1 ? { players: [...setup.mulliganPlayers] } : {}),
    },
    heroPowers: setup.heroPowers
      ? [...setup.heroPowers] as [HeroPowerId | null, HeroPowerId | null]
      : [null, null],
    heroPowerUsed: [false, false],
    pocketRooms: [],
    stasis: [],
    darkDimension: [],
    effectQueue: [],
    winner: null,
    players,
  };

  players[0].turnsStarted = 1;
  if (state.heroPowers[0] === "goku_start_mana") {
    players[0].maxMana = 2;
    players[0].mana = 2;
  }
  if (state.heroPowers[1] === "goku_start_mana") {
    players[1].maxMana = 2;
    players[1].mana = 2;
  }
  // Both players open with three cards; hotseat keeps The Coin while AI duels do not.
  // The extra card gives the starting player the same room to enact a plan
  // without taking away the second player's tempo tool.
  drawDirect(state, 0, 3, []);
  drawDirect(state, 1, 3, []);
  players[1].coins = setup.hasCoin === true ? 1 : 0;
  if (setup.tutorial) configureTutorialState(state, cards);
  return state;
}

/** A deterministic lesson position, using ordinary cards and the real rules. */
function configureTutorialState(state: GameState, cards: CardDefinition[]): void {
  state.players[0].hand = ['c169','c005','r035'];
  state.players[1].hand = ['c143'];
  state.mulligan = null;
  state.phase = 'main';
  state.activePlayer = 0;
  state.turnNumber = 1;
  state.players[0].board = Array(boardSize).fill(null);
  state.players[1].board = Array(boardSize).fill(null);
  state.players[0].coins = 0;
  state.players[1].coins = 0;
  state.bottomDeck = [];
  state.discard = [];
  // Draws remain genuine but cannot introduce unrelated prompts or cheap distractions.
  const later = cards.filter(card=>card.cost>=6).map(card=>card.id);
  state.playerDecks = [{deck:[...later],bottomDeck:[]},{deck:[...later],bottomDeck:[]}];
  state.deck = [];
}

export function applyAction(
  state: GameState,
  action: GameAction,
  library: CardLibrary,
  knownLegal?: readonly GameAction[],
  includeNextLegal = true,
): ApplyResult {
  // Callers that already asked for this exact state's legal actions may reuse
  // the list. The simulator and bot evaluate many legal candidates from one
  // state; recomputing the same list for every candidate dominated their CPU
  // time. Normal callers omit this argument and retain the defensive check.
  const currentLegal = knownLegal ?? getLegalActions(state, library);
  if (!currentLegal.some((legal) => sameAction(legal, action))) {
    return {
      state,
      events: [{ kind: "warning", text: "That move is not legal right now.", player: action.player }],
      legalActions: [...currentLegal],
    };
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  const afflictedBefore = afflictionSnapshot(state);

  if (action.type === "toggle_mulligan") {
    toggleMulligan(next, action.player, action.handIndex);
  } else if (action.type === "confirm_mulligan") {
    confirmMulligan(next, action.player, events);
  } else if (action.type === "use_hero_power") {
    useHeroPower(next, action.player, library, events);
  } else if (action.type === "play_card") {
    playCard(next, action.player, action.handIndex, action.slotIndex, library, events);
  } else if (action.type === "play_relic") {
    playRelic(next, action.player, action.handIndex, action.slotIndex, library, events);
  } else if (action.type === "attack_minion" || action.type === "attack_core") {
    // A confused minion still had every legal target offered — the swing simply
    // does not go where it was aimed.
    const attacker = next.players[action.player].board[action.attackerSlot];
    const blind = attacker ? attacksRandomly(next, attacker) : false;
    const rolled = blind && attacker ? randomAttackTarget(next, attacker) : null;
    if (blind && attacker) {
      if (rolled === null) {
        events.push(effectEvent(`${attacker.name} swings blindly and finds nothing.`, attacker));
        attacker.attacksUsed += 1;
      } else if (rolled === "core") {
        events.push(effectEvent(`${attacker.name} swings blindly — at the core.`, attacker));
        attackCore(next, action.player, action.attackerSlot, events);
      } else {
        const victim = next.players[opponent(action.player)].board[rolled];
        events.push(effectEvent(`${attacker.name} swings blindly — at ${victim?.name ?? "a minion"}.`, attacker));
        attackMinion(next, action.player, action.attackerSlot, rolled, events);
      }
    } else if (action.type === "attack_minion") {
      attackMinion(next, action.player, action.attackerSlot, action.targetSlot, events);
    } else {
      attackCore(next, action.player, action.attackerSlot, events);
    }
  } else if (action.type === "end_turn") {
    resolveEndOfTurn(next, action.player, library, events);
    thawServed(next, action.player, events);
    beginTurn(next, opponent(action.player), library, events);
  } else if (action.type === "choose_draw") {
    chooseDraw(next, action.player, action.choiceIndex, library, events);
  } else if (action.type === "choose_target") {
    chooseTarget(next, action.choiceIndex, library, events);
  } else if (action.type === "cancel_target") {
    cancelPendingTarget(next, action.player, events);
  } else if (action.type === "use_coin") {
    spendCoin(next, action.player, events);
  }

  // Slot marks are permanent and position-based, so they are re-applied after
  // every action — whichever route a minion took into a marked slot.
  enforceSlotAuras(next, events);
  expireTimedStates(next);
  refreshPassiveAuras(next);
  enforceGlobalSilence(next, events);
  // After the silences are settled, because a minion silenced by Gojo or by a
  // slot mark on THIS action must not still be wearing the aura it was paid a
  // moment ago.
  suppressAuraBuffsOnSilenced(next);
  feedAfflictionWatchers(next, afflictedBefore, events);
  enforceDumbledoreCleansing(next, events);
  sweepDeaths(next, events);
  refreshCarrierLocks(next);
  announceTopDeck(next, library, events);
  checkGameOver(next, events);
  if (next.phase !== "targeting") next.pendingPlayCancel = null;
  return {
    state: next,
    events,
    // Speculative bot branches only score the resulting state. They explicitly
    // skip this eager list and compute it once if that branch is actually
    // rolled forward; interactive callers retain the normal complete result.
    legalActions: includeNextLegal ? getLegalActions(next, library) : [],
  };
}

export function getLegalActions(state: GameState, library: CardLibrary): GameAction[] {
  if (state.phase === "gameOver") return [];
  if (state.phase === "mulligan") {
    const mulligan = state.mulligan;
    if (!mulligan) return [];
    return [
      ...state.players[mulligan.player].hand.map((_cardId, handIndex) => ({
        type: "toggle_mulligan" as const,
        player: mulligan.player,
        handIndex,
      })),
      { type: "confirm_mulligan" as const, player: mulligan.player },
    ];
  }
  if (state.phase === "targeting") {
    const pending = state.pendingTarget;
    if (!pending) return [];
    const count =
      pending.kind === "board" || pending.kind === "slot"
        ? pending.options.length
        : pending.kind === "boardOrCore"
          ? pending.options.length + (pending.coreOption ? 1 : 0)
        : pending.kind === "hand"
          ? pending.handOptions.length
          : pending.labelOptions.length;
    const choices: GameAction[] = Array.from({ length: count }, (_unused, choiceIndex) => ({
      type: "choose_target" as const,
      player: pending.player,
      choiceIndex,
    }));
    if (pending.cancelPlay || pending.cancelHeroPower) {
      choices.push({ type: "cancel_target" as const, player: pending.player });
    }
    return choices;
  }
  if (state.phase === "drawChoice") {
    const drawChoice = state.drawChoice;
    if (!drawChoice) return [];
    return drawChoice.cards.map((_cardId, choiceIndex) => ({
      type: "choose_draw" as const,
      player: drawChoice.player,
      choiceIndex,
    }));
  }

  const player = state.players[state.activePlayer];
  const enemy = state.players[opponent(state.activePlayer)];
  const hasHeroPower = Boolean(state.heroPowers[player.id]);
  // A normal position has neither a selected power nor a relic in hand. Keep
  // that hot path cheap; the relic check below asks about Kratos lazily when a
  // relic is actually present.
  let opponentHasKratosLockdown = hasHeroPower && opponentHasKratosLock(state, player.id);
  const actions: GameAction[] = [{ type: "end_turn", player: player.id }];

  if (player.coins > 0) {
    actions.push({ type: "use_coin", player: player.id });
  }

  if (!opponentHasKratosLockdown && heroPowerIsUsable(state, player.id)) {
    actions.push({ type: "use_hero_power", player: player.id });
  }

  player.hand.forEach((cardId, handIndex) => {
    const card = library[cardId];
    if (!card || (!hasInfiniteMana(state, player.id) && effectiveCardCost(state, player.id, card) > player.mana)) return;
    player.board.forEach((slot, slotIndex) => {
      if (isMinionCard(card) && !slot && !hasSlotAura(state, player.id, slotIndex, "slot_bound")) {
        actions.push({ type: "play_card", player: player.id, handIndex, slotIndex });
      }
      if (isRelicCard(card)) {
        if (!hasHeroPower && !opponentHasKratosLockdown) {
          opponentHasKratosLockdown = opponentHasKratosLock(state, player.id);
        }
        if (!opponentHasKratosLockdown && slot && hasFreeRelicSlot(slot) && canEquipRelicToBearer(card, slot)) {
          actions.push({ type: "play_relic", player: player.id, handIndex, slotIndex });
        }
      }
    });
  });

  // Taunt is the only guard left in the roster. A second rank above it once
  // existed — one minion soaking every attack aimed at its side — and the card
  // that printed it now grants an evade chance instead. Shinigami Eyes and
  // Meleoron's hidden ally walk past Taunt.
  const tauntTargets = enemy.board
    .map((minion, targetSlot) => ({ minion, targetSlot }))
    .filter(({ minion }) => minion && attackTargetable(state, minion) && hasKeyword(minion, "Taunt") && !minion.silenced);

  player.board.forEach((minion, attackerSlot) => {
    if (!minion || !canAttack(minion, state)) return;
    const ignoresGuards = hasRelic(minion, "ignore_defences");
    const ignoresTaunt = tauntBypassActive(state, minion);
    const forced = ignoresGuards || ignoresTaunt ? [] : tauntTargets;
    const possibleTargets = forced.length
      ? forced
      : enemy.board
          .map((target, targetSlot) => ({ minion: target, targetSlot }))
          .filter(({ minion: target }) => target && attackTargetable(state, target));

    possibleTargets.forEach(({ minion: target, targetSlot }) => {
      if (target && canDeclareAttack(state, minion, target)) {
        actions.push({ type: "attack_minion", player: player.id, attackerSlot, targetSlot });
      }
    });

    // Hearthstone's rule: the enemy core is a legal target for ANY ready minion.
    // Only a Taunt stops it, and the same things that would force a minion
    // target force it here. Shinigami Eyes walks
    // past both. (Before this, the core could only be hit with the enemy board
    // completely empty, which made ATK almost meaningless.)
    if (forced.length === 0 && !hasHighestAttackRestriction(state, minion) && !yujiroCoreAttackRestricted(state, minion)) {
      actions.push({ type: "attack_core", player: player.id, attackerSlot });
    }
  });

  return actions;
}

export function actionKey(action: GameAction): string {
  if (action.type === "play_card") return `${action.type}:${action.player}:${action.handIndex}:${action.slotIndex}`;
  if (action.type === "play_relic") return `${action.type}:${action.player}:${action.handIndex}:${action.slotIndex}`;
  if (action.type === "attack_minion") {
    return `${action.type}:${action.player}:${action.attackerSlot}:${action.targetSlot}`;
  }
  if (action.type === "attack_core") return `${action.type}:${action.player}:${action.attackerSlot}`;
  if (action.type === "toggle_mulligan") return `${action.type}:${action.player}:${action.handIndex}`;
  if (action.type === "confirm_mulligan") return `${action.type}:${action.player}`;
  if (action.type === "choose_draw") return `${action.type}:${action.player}:${action.choiceIndex}`;
  if (action.type === "choose_target") return `${action.type}:${action.player}:${action.choiceIndex}`;
  if (action.type === "cancel_target") return `${action.type}:${action.player}`;
  return `${action.type}:${action.player}`;
}

function makePlayer(id: PlayerId, name: string, health: number = DEFAULT_STARTING_HEALTH): PlayerState {
  return {
    id,
    name,
    health,
    heroDivineShield: false,
    maxMana: 1,
    mana: 1,
    coins: 0,
    hand: [],
    board: Array(boardSize).fill(null),
    costReductions: {},
    manaPenaltyNextTurn: 0,
    minionCostPenaltyNextTurn: 0,
    minionCostPenaltyThisTurn: 0,
    pressured: null,
    slotAuras: [],
    randomAttacksFromTurn: null,
    randomAttacksUntilTurn: null,
    fatigue: 0,
    turnsStarted: 0,
    deadMinions: [],
  };
}

export function cloneState(state: GameState): GameState {
  return copyGameState(state);
}

function sameAction(left: GameAction, right: GameAction): boolean {
  return actionKey(left) === actionKey(right);
}

/**
 * The minion that dealt the most damage for one player this duel.
 *
 * Ties break on the smaller instance id, which is the body that landed first —
 * arbitrary, but stable, so the same finished duel always names the same card
 * however many times the screen re-renders. Returns null when that player never
 * landed a blow with a minion, which is a real result on a duel decided by hero
 * powers or fatigue and must not be dressed up as an MVP.
 */
export function duelMvp(state: GameState, playerId: PlayerId): DamageTallyEntry | null {
  const tally = state.damageTally;
  if (!tally) return null;
  let best: DamageTallyEntry | null = null;
  for (const entry of Object.values(tally)) {
    if (entry.owner !== playerId || entry.damage <= 0) continue;
    if (!best || entry.damage > best.damage || (entry.damage === best.damage && entry.instanceId < best.instanceId)) {
      best = entry;
    }
  }
  return best;
}
