import { isMinionCard, isRelicCard } from "./types";
import { HERO_POWER_COST, heroPowerDefinition } from "./hero-powers";
import { traceEffect } from "./trace";
// Tokens are the only cards whose artwork is named here rather than in the CSV,
// so they are the only ones that have to ask for the published base themselves.
import { resolvePublicAssetUrl } from "./asset-url";
import type {
  ApplyResult,
  Alignment,
  Camp,
  SlotAuraId,
  CardDefinition,
  EffectId,
  GameAction,
  GameEvent,
  GameState,
  HandOption,
  HeroPowerId,
  LabelOption,
  MinionInstance,
  PlayerId,
  PlayerState,
  PlayableCard,
  RelicDefinition,
  RelicInstance,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
  TemporaryMinionControl,
  TemporaryMinionTransform,
} from "./types";

export type CardLibrary = Record<string, PlayableCard>;

// Deathrattles resolve below the effect runner, where the original card
// library is otherwise out of scope. Keep the library attached to the cloned
// action state without serializing it into saves or replay data.
const libraryByState = new WeakMap<GameState, CardLibrary>();

const boardSize = 5;
const handLimit = 10;
/**
 * How much core a duel starts with.
 *
 * This is the ONE global pacing dial in the game, because mana cost is frozen —
 * a card's cost states how powerful that being is in its own fiction and is
 * never a balance lever (see README). So the length of a duel is what decides
 * which half of the roster is real.
 *
 * It is not Hearthstone's 30 any more. At 30 the machine playtest ended the
 * median duel on player-turn 15, which is 7–8 turns each, which caps mana at 8 —
 * and every card costing 9 or 10 was drawn hundreds of times and played almost
 * never. That is 25 cards, and they are the marquee ones: Saitama, Thanos,
 * Goku, Neo, Doctor Manhattan. A roster whose Greats never arrive is not this
 * game.
 *
 * At 75, with the plain +1 mana ramp below, the median duel runs 22 player-turns
 * — eleven each, which is the same shape as Hearthstone — 80% of duels reach 10
 * mana, boards sit at 3.1 of 5 slots, and 6% end as blowouts.
 *
 * The number was 76 until 2026-08-21 and is now 75 by owner preference. One
 * point is inside the noise of every measurement on this page, so nothing above
 * is restated: it is a tidier number on the health bar, not a pacing change.
 *
 * **This number carries ALL of the pacing weirdness on purpose.** A player never
 * feels an unusual health total; they feel an unusual mana curve every single
 * turn. `npm run sim -- --sweep` is the measurement behind it.
 */
const DEFAULT_STARTING_HEALTH = 75;

/**
 * The same number, for the UI and the rules screen to read. Exported so the
 * "both players start on N core" line in How To Play can never disagree with the
 * engine — it said 30 for a while after the engine said otherwise.
 */
export const STARTING_CORE = DEFAULT_STARTING_HEALTH;

/** Restore core health without ever exceeding the game's 75-HP maximum. */
function restoreCoreHealth(player: PlayerState, amount: number): number {
  const before = Math.min(STARTING_CORE, Math.max(0, player.health));
  player.health = Math.min(STARTING_CORE, before + Math.max(0, amount));
  return player.health - before;
}

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
 * The lever that works is the one players never feel: **starting core HP**. At
 * 75 with this plain +1 ramp, 80% of duels reach 10 mana — the same access the
 * clever ramp bought at 48 — with fewer blowouts and fuller boards. Put the odd
 * number in the health bar, never in the mana curve.
 *
 * The field survives only so `npm run sim -- --sweep` can still measure
 * alternatives. The shipped game is 1.
 */
const DEFAULT_MANA_RAMP = 1;

export function makeCardLibrary(cards: CardDefinition[]): Record<string, CardDefinition>;
export function makeCardLibrary(cards: CardDefinition[], relics: RelicDefinition[]): CardLibrary;
export function makeCardLibrary(cards: CardDefinition[], relics: RelicDefinition[] = []): CardLibrary {
  return Object.fromEntries([...cards, ...relics].map((card) => [card.id, card]));
}

/** Knobs the simulator sweeps. The game itself always uses the defaults. */
export interface GameSetup {
  startingHealth?: number;
  manaRamp?: number;
  /** Seat granted permanent Foresight — the Ascendant opponent's draw cheat. */
  foresightFor?: PlayerId | null;
  /** Hero Powers assigned to each seat for this duel. */
  heroPowers?: [HeroPowerId | null, HeroPowerId | null];
  /** Build the deterministic first-duel teaching position instead of a normal deal. */
  tutorial?: boolean;
}

export function createInitialGame(
  cards: CardDefinition[],
  seed = "convergence-v1",
  relicDefs: RelicDefinition[] = [],
  setup: GameSetup = {},
): GameState {
  const health = setup.startingHealth ?? DEFAULT_STARTING_HEALTH;
  const deck = buildDeck(
    [...cards, ...relicDefs.filter((relic) => relic.relicId !== "none")],
    seed,
  );
  const players: [PlayerState, PlayerState] = [makePlayer(0, "Player One", health), makePlayer(1, "Player Two", health)];
  const state: GameState = {
    phase: "mulligan",
    activePlayer: 0,
    turnNumber: 1,
    cheatMode: false,
    manaRamp: setup.manaRamp ?? DEFAULT_MANA_RAMP,
    nextInstance: 1,
    nextPlayOrder: 1,
    rngSeed: hashSeed(`${seed}:rng`),
    foresightFor: setup.foresightFor ?? null,
    deck,
    bottomDeck: [],
    discard: [],
    drawChoice: null,
    pendingTarget: null,
    pendingPlayCancel: null,
    mulligan: { player: 0, selected: [false, false, false] },
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
  // Both players open with three cards; the second player also keeps The Coin.
  // The extra card gives the starting player the same room to enact a plan
  // without taking away the second player's tempo tool.
  drawDirect(state, 0, 3, []);
  drawDirect(state, 1, 3, []);
  players[1].coins = 1;
  if (setup.tutorial) configureTutorialState(state, cards);
  return state;
}

/**
 * A small deterministic teaching position for the first Tutorial duel.
 *
 * The normal game stays random. The tutorial deliberately puts a basic body,
 * a targeted Battlecry, and a draw card in the player's hand, with one harmless
 * enemy body ready to be selected. The position still uses the real engine, so
 * the controls and card resolution are genuine rather than a fake slideshow.
 */
function configureTutorialState(state: GameState, cards: CardDefinition[]): void {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const playerHand = ["c169", "c005", "c173"].filter((id) => byId.has(id));
  const enemyHand = ["c139", "c142", "c173"].filter((id) => byId.has(id));
  const target = byId.get("c171") ?? byId.get("c139");

  state.players[0].hand = playerHand;
  state.players[1].hand = enemyHand;
  // The first duel teaches the actual turn loop immediately. A mulligan is a
  // useful normal-game choice, but it is an unnecessary branch before a new
  // player has learned where cards go, so the tutorial opens in main phase.
  state.mulligan = null;
  state.phase = "main";
  state.activePlayer = 0;
  state.turnNumber = 1;
  state.players[0].board = [null, null, null, null, null];
  state.players[1].board = [null, null, null, null, null];
  state.players[0].coins = 0;
  state.players[1].coins = 1;
  state.bottomDeck = [];
  state.discard = [];

  const removed = new Set([...playerHand, ...enemyHand, target?.id].filter((id): id is string => Boolean(id)));
  state.deck = state.deck.filter((id) => !removed.has(id));

  if (target) {
    const minion = createMinion(target, 1, state);
    minion.sleeping = false;
    // Keep the teaching target alive after the first simultaneous combat so
    // the following Battlecry lesson still has a legal enemy minion to pick.
    // It remains the real Taunt card and is only reinforced in the curated
    // tutorial position.
    if (minion.keywords.includes("Taunt")) {
      minion.maxHp = Math.max(minion.maxHp, 2);
      minion.hp = minion.maxHp;
    }
    state.players[1].board[2] = minion;
  }
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
  libraryByState.set(next, library);
  const events: GameEvent[] = [];

  if (action.type === "toggle_mulligan") {
    toggleMulligan(next, action.player, action.handIndex);
  } else if (action.type === "confirm_mulligan") {
    confirmMulligan(next, action.player, events);
  } else if (action.type === "use_hero_power") {
    useHeroPower(next, action.player, events);
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
  refreshPassiveAuras(next);
  enforceGlobalSilence(next, events);
  // After the silences are settled, because a minion silenced by Gojo or by a
  // slot mark on THIS action must not still be wearing the aura it was paid a
  // moment ago.
  suppressAuraBuffsOnSilenced(next);
  enforceDumbledoreCleansing(next, events);
  sweepDeaths(next, events);
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
    if (pending.cancelPlay) choices.push({ type: "cancel_target" as const, player: pending.player });
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
    if (!card || (!state.cheatMode && effectiveCardCost(state, player.id, card) > player.mana)) return;
    player.board.forEach((slot, slotIndex) => {
      if (isMinionCard(card) && !slot) {
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

  // Kojiro Sasaki soaks every attack aimed at his side; Taunt does the same job
  // one rank below him. Shinigami Eyes ignores both.
  const bodyguard = enemy.board
    .map((minion, targetSlot) => ({ minion, targetSlot }))
    .find(({ minion }) => minion && attackTargetable(state, minion) && hasEffect(minion, "redirect_attacks") && !minion.silenced);
  const tauntTargets = enemy.board
    .map((minion, targetSlot) => ({ minion, targetSlot }))
    .filter(({ minion }) => minion && attackTargetable(state, minion) && hasKeyword(minion, "Taunt") && !minion.silenced);

  player.board.forEach((minion, attackerSlot) => {
    if (!minion || !canAttack(minion)) return;
    const ignoresGuards = hasRelic(minion, "ignore_defences");
    const ignoresTaunt = tauntBypassActive(minion);
    const forced = ignoresGuards ? [] : bodyguard ? [bodyguard] : ignoresTaunt ? [] : tauntTargets;
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
    // Only a guard stops it — a Taunt, or Kojiro soaking his side — and the same
    // things that would force a minion target force it here. Shinigami Eyes walks
    // past both. (Before this, the core could only be hit with the enemy board
    // completely empty, which made ATK almost meaningless.)
    if (forced.length === 0 && !hasHighestAttackRestriction(state, minion)) {
      actions.push({ type: "attack_core", player: player.id, attackerSlot });
    }
  });

  return actions;
}

function heroPowerTargetOptions(state: GameState, playerId: PlayerId, powerId: HeroPowerId): TargetOption[] {
  const definition = heroPowerDefinition(powerId);
  if (!definition || definition.target === "none") return [];
  const owner = definition.target === "friendly" ? playerId : opponent(playerId);
  return state.players[owner].board.flatMap((minion, slot) => {
    if (!minion || isUntargetable(state, minion)) return [];
    if (owner !== playerId && !enemyTargetable(state, minion)) return [];
    return [{ owner, slot }];
  });
}

function heroPowerIsUsable(state: GameState, playerId: PlayerId): boolean {
  const powerId = state.heroPowers[playerId];
  if (!powerId || state.heroPowerUsed[playerId]) return false;
  if (!state.cheatMode && state.players[playerId].mana < effectiveHeroPowerCost(state, playerId)) return false;
  const definition = heroPowerDefinition(powerId);
  if (!definition) return false;
  return definition.target === "none" || heroPowerTargetOptions(state, playerId, powerId).length > 0;
}

/** Rudeus makes the controller's one Hero Power payment free while active. */
function effectiveHeroPowerCost(state: GameState, playerId: PlayerId): number {
  const free = state.players[playerId].board.some(
    (minion) => minion && hasEffect(minion, "rudeus_hero_power_free"),
  );
  return free ? 0 : HERO_POWER_COST;
}

function toggleMulligan(state: GameState, playerId: PlayerId, handIndex: number): void {
  const mulligan = state.mulligan;
  if (!mulligan || mulligan.player !== playerId) return;
  if (handIndex < 0 || handIndex >= state.players[playerId].hand.length) return;
  mulligan.selected[handIndex] = !mulligan.selected[handIndex];
}

/** Kratos's passive is a live opponent lock: silence, chaining, death, and
 * leaving the board all make the opponent's relic and Hero Power actions legal
 * again because hasEffect handles those temporary statuses centrally. */
function opponentHasKratosLock(state: GameState, playerId: PlayerId): boolean {
  return state.players[opponent(playerId)].board.some(
    (minion) => {
      if (!minion) return false;
      if (minion.silenced || minion.chained > 0) return false;
      // Avoid asking the generic effect helper about every ordinary minion in
      // the bot's speculative search. Only a minion that actually holds this
      // effect needs the centralized coverage trace.
      if (minion.effectId === "kratos_lockdown") {
        traceEffect("kratos_lockdown");
        return true;
      }
      if (minion.gainedEffects.length === 0) return false;
      if (!minion.gainedEffects.some((effect) => effect.effectId === "kratos_lockdown")) return false;
      traceEffect("kratos_lockdown");
      return true;
    },
  );
}

function confirmMulligan(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const mulligan = state.mulligan;
  if (!mulligan || mulligan.player !== playerId) return;
  const player = state.players[playerId];
  const selectedIndices = player.hand
    .map((_cardId, handIndex) => handIndex)
    .filter((handIndex) => mulligan.selected[handIndex]);
  const rejected = selectedIndices.map((handIndex) => player.hand[handIndex]);

  // Remove from the end so the remaining opening hand keeps its order.
  for (const handIndex of [...selectedIndices].sort((left, right) => right - left)) {
    player.hand.splice(handIndex, 1);
  }
  const replacements = rejected.length > 0 ? drawFromDeck(state, rejected.length, events) : [];
  for (const cardId of replacements) putCardInHand(state, playerId, cardId, events);
  // The replaced cards go to the bottom only after the new cards are drawn, so
  // a player cannot immediately redraw the card they just rejected.
  state.bottomDeck.unshift(...rejected);
  if (rejected.length > 0) {
    events.push({
      kind: "draw",
      text: `${player.name} mulligans ${rejected.length} opening card${rejected.length === 1 ? "" : "s"}.`,
      player: playerId,
    });
  } else {
    events.push({ kind: "draw", text: `${player.name} keeps the opening hand.`, player: playerId });
  }
  state.mulligan = null;
  state.phase = "main";
}

function useHeroPower(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const powerId = state.heroPowers[playerId];
  const definition = heroPowerDefinition(powerId);
  if (!powerId || !definition || !heroPowerIsUsable(state, playerId)) return;
  const player = state.players[playerId];
  if (!state.cheatMode) player.mana -= effectiveHeroPowerCost(state, playerId);
  state.heroPowerUsed[playerId] = true;
  events.push({ kind: "effect", text: `${player.name} uses ${definition.name}.`, player: playerId });

  if (definition.target !== "none") {
    const options = heroPowerTargetOptions(state, playerId, powerId);
    if (options.length === 1) {
      resolveHeroPower(state, playerId, powerId, { kind: "board", target: options[0] }, events);
      return;
    }
    state.pendingTarget = {
      kind: "board",
      player: playerId,
      sourceInstanceId: "",
      sourceOwner: playerId,
      sourceName: definition.name,
      sourceCardId: "",
      effectId: "none",
      heroPowerId: powerId,
      prompt: definition.text,
      options,
      handOptions: [],
      labelOptions: [],
      step: 0,
      priorOptions: [],
      priorHandOptions: [],
      priorLabelOptions: [],
    };
    state.phase = "targeting";
    return;
  }
  resolveHeroPower(state, playerId, powerId, null, events);
}

function resolveHeroPower(
  state: GameState,
  playerId: PlayerId,
  powerId: HeroPowerId,
  answer: ResolvedChoice | null,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const definition = heroPowerDefinition(powerId);
  if (!definition) return;
  const target = answer?.kind === "board" ? state.players[answer.target.owner].board[answer.target.slot] : null;
  if (powerId === "minion_hp" && target) {
    buffMinion(target, 0, 1);
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} +1 HP.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_atk" && target) {
    target.atk += 1;
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} +1 ATK.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_hp_down" && target) {
    target.maxHp = Math.max(1, target.maxHp - 1);
    target.hp -= 1;
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} -1 HP.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_atk_down" && target) {
    target.atk = Math.max(0, target.atk - 1);
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} -1 ATK.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "core_trade_draw") {
    player.health -= 2;
    drawDirect(state, playerId, 1, events);
    events.push({ kind: "effect", text: `${definition.name} costs ${player.name} 2 Core HP and draws a card.`, player: playerId });
  } else if (powerId === "enemy_core_damage") {
    const enemyId = opponent(playerId);
    if (dealCoreDamage(state, enemyId, 2, events)) {
      events.push({ kind: "effect", text: `${definition.name} deals 2 damage to the enemy Core.`, player: playerId });
    }
  } else if (powerId === "core_heal") {
    const restored = restoreCoreHealth(player, 2);
    events.push({
      kind: "effect",
      text: restored > 0
        ? `${definition.name} restores ${restored} Core HP.`
        : `${definition.name} finds ${player.name}'s Core already at full health.`,
      player: playerId,
    });
  } else if (powerId === "chain_growth" && target) {
    if (isSlotProtected(state, target) || !canDisable(state, playerId, target, "chain")) {
      events.push(effectEvent(`${target.name} resists Chain.`, target));
    } else {
      target.chained = Math.max(target.chained, 2);
      target.chainGrowthPending = true;
      events.push({ kind: "effect", text: `${definition.name} chains ${target.name} for 1 turn.`, player: playerId, instanceId: target.instanceId });
    }
  } else if (powerId === "summon_recruit") {
    summonHeroPowerRecruit(state, playerId, events);
  } else if (powerId === "give_taunt" && target) {
    if (!target.keywords.includes("Taunt")) target.keywords.push("Taunt");
    if (!target.gainedEffects.some((effect) => effect.text === "Passive: Taunt.")) {
      target.gainedEffects.push({ effectId: "none", timing: "passive", text: "Passive: Taunt." });
    }
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} Taunt.`, player: playerId, instanceId: target.instanceId });
  }
}

/** A card's cost after discounts and live enemy cost auras. */
export function effectiveCardCost(state: GameState, playerId: PlayerId, card: PlayableCard): number {
  const player = state.players[playerId];
  const enemy = state.players[opponent(playerId)];
  const enemyCardTax = enemy.board.filter(
    (minion) => minion && !minion.silenced && hasEffect(minion, "enemy_cards_cost_1_more"),
  ).length;
  return Math.max(0, (card.cost ?? 0) - (player.costReductions[card.id] ?? 0) + enemyCardTax);
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

// ---------------------------------------------------------------------------
// Randomness. Everything that says "random" on a card now rolls through here.
// The seed lives in GameState, so a roll is reproducible from a saved game and
// undo rewinds it — but nothing is predictable from the turn counter any more.
// (The old effects derived their "rolls" from (turnNumber + playOrder), which in
// a hotseat game both players can read straight off the screen.)
// ---------------------------------------------------------------------------
function hashSeed(seed: string): number {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return (value | 0) === 0 ? 0x9e3779b9 : value | 0;
}

/** xorshift32 — small, fast, and fine for dice. Returns [0, 1). */
function nextRandom(state: GameState): number {
  let value = state.rngSeed | 0;
  if (value === 0) value = 0x9e3779b9;
  value ^= value << 13;
  value |= 0;
  value ^= value >>> 17;
  value ^= value << 5;
  value |= 0;
  state.rngSeed = value;
  return (value >>> 0) / 4294967296;
}

function rollInt(state: GameState, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return Math.floor(nextRandom(state) * maxExclusive);
}

function rollDie(state: GameState): number {
  return rollInt(state, 6) + 1;
}

function coinFlip(state: GameState): boolean {
  return nextRandom(state) < 0.5;
}

function buildDeck(cards: PlayableCard[], seed: string): string[] {
  const shuffled = seededShuffle(cards, seed);
  return shuffled.map((card) => card.id);
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
    pressured: null,
    slotAuras: [],
    confusedUntilTurn: null,
    randomAttacksFromTurn: null,
    randomAttacksUntilTurn: null,
    fatigue: 0,
    turnsStarted: 0,
    deadMinions: [],
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const output = [...items];
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  for (let index = output.length - 1; index > 0; index -= 1) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const swapIndex = Math.abs(value) % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function sameAction(left: GameAction, right: GameAction): boolean {
  return actionKey(left) === actionKey(right);
}

function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

function playCard(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
  slotIndex: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const cardId = player.hand[handIndex];
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const previousCostReduction = player.costReductions[cardId];
  const previousPressured = player.pressured?.cardId === cardId ? { ...player.pressured } : null;
  const manaPaid = state.cheatMode ? 0 : effectiveCardCost(state, playerId, card);
  player.hand.splice(handIndex, 1);
  player.mana -= manaPaid;
  // A Kuma discount is spent on use, and playing a pressured card satisfies it.
  if (player.costReductions[cardId]) delete player.costReductions[cardId];
  if (player.pressured?.cardId === cardId) player.pressured = null;
  const minion = createMinion(card, playerId, state);
  player.board[slotIndex] = minion;
  events.push({ kind: "play", text: `${player.name} plays ${card.name}.`, player: playerId, cardId: card.id, instanceId: minion.instanceId });
  if (
    minion.alignment === "Good" &&
    player.board.some(
      (ally) => ally && ally.instanceId !== minion.instanceId && hasEffect(ally, "shifu_shield") && !ally.silenced,
    )
  ) {
    minion.divineShield = true;
    events.push(effectEvent(`${minion.name} gains Divine Shield from Furious Five.`, minion));
  }
  state.pendingPlayCancel = {
    player: playerId,
    slotIndex,
    handIndex,
    cardId: card.id,
    instanceId: minion.instanceId,
    manaRefund: manaPaid,
    previousCostReduction,
    previousPressured,
  };
  applyOnPlayEffects(state, minion, slotIndex, library, events);
}

function playRelic(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
  slotIndex: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const cardId = player.hand[handIndex];
  const relic = library[cardId];
  const bearer = player.board[slotIndex];
  if (!isRelicCard(relic) || !bearer || !hasFreeRelicSlot(bearer) || !canEquipRelicToBearer(relic, bearer)) return;
  player.hand.splice(handIndex, 1);
  if (!state.cheatMode) player.mana -= effectiveCardCost(state, playerId, relic);
  if (player.costReductions[cardId]) delete player.costReductions[cardId];
  if (player.pressured?.cardId === cardId) player.pressured = null;
  const instance = createRelicInstance(relic);
  equipRelic(state, bearer, instance, library, events);
  events.push({
    kind: "play",
    text: `${player.name} plays ${relic.name} on ${bearer.name}.`,
    player: playerId,
    cardId: relic.id,
    instanceId: bearer.instanceId,
  });
  triggerRelicDiscoveries(
    state,
    playerId,
    player.board
      .filter((minion): minion is MinionInstance => Boolean(minion && !minion.silenced && minion.effectId === "frieren_relic_discover"))
      .map((minion) => minion.instanceId),
    library,
    events,
  );
}

function createRelicInstance(relic: RelicDefinition): RelicInstance {
  return {
    id: relic.id,
    relicId: relic.relicId,
    name: relic.name,
    effect: relic.effect,
    art: relic.art,
  };
}

function createMinion(card: CardDefinition, owner: PlayerId, state: GameState): MinionInstance {
  // Some effects are implemented by a keyword rather than a runEffect branch.
  // Charge is the current example: the engine resolves it by setting `sleeping`
  // below, so the effect recorder needs to see that resolution here.
  if (
    card.effectId !== "none" &&
    card.keywords.some((keyword) => keyword.toLowerCase() === card.effectId.toLowerCase())
  ) {
    traceEffect(card.effectId);
  }

  const instance: MinionInstance = {
    instanceId: `m${state.nextInstance}`,
    cardId: card.id,
    owner,
    name: card.name,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    maxHp: card.hp,
    baseAtk: card.atk,
    baseHp: card.hp,
    rarity: card.rarity,
    camp: card.camp,
    alignment: card.alignment,
    keywords: [...card.keywords],
    effectId: card.effectId,
    effectTiming: card.effectTiming,
    effect: card.effect,
    origin: card.origin,
    art: card.art,
    playOrder: state.nextPlayOrder,
    attacksUsed: 0,
    sleeping: !hasKeyword(card, "Charge"),
    // Ordinary minions sleep through the turn they are played. Charge is the
    // explicit exception: it also applies when a minion is summoned or changes
    // controller through an effect.
    chained: hasKeyword(card, "Chained") ? 2 : 0,
    frozen: false,
    thawPending: false,
    silenced: false,
    passiveSilenceSources: [],
    divineShield: hasKeyword(card, "Divine Shield"),
    invulnerableUntilTurn: null,
    protectedSlot: false,
    delayedDestroySource: null,
    relic: null,
    relic2: null,
    suppressArrivalTheme: false,
    temporaryTransform: null,
    temporaryControl: null,
    attackedBy: [],
    attackLocked: false,
    attackLockedUntilTurn: null,
    commandmentsTriggeredAtTurn: null,
    markedBy: null,
    markedForDeathAtTurn: null,
    untargetableUntilTurn: null,
    protectedByMeleoron: null,
    auraBonuses: [],
    evadedAttackAtTurn: null,
    weakPointTargetId: null,
    weakPointReady: false,
    rescueUsedAtTurn: null,
    divineShieldAuraSources: [],
    brokenAuraSources: [],
    deathStarTarget: null,
    campImmunity: null,
    stolenPassiveFrom: null,
    stolenPassiveText: null,
    gainedEffects: [],
    relicDiscoveryTurn: null,
    savedCoreHealth: null,
    chainGrowthPending: false,
    copyRestoreEffectId: null,
  };
  state.nextInstance += 1;
  state.nextPlayOrder += 1;
  return instance;
}

function applyOnPlayEffects(
  state: GameState,
  minion: MinionInstance,
  slotIndex: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  // Rennala's ongoing transformation starts when she enters, then refreshes
  // at the start of her owner's turns. The printed text remains Ongoing.
  if (
    minion.effectTiming !== "onPlay" &&
    minion.effectTiming !== "onPlayAndOngoing" &&
    minion.effectTiming !== "onPlayAndDeathrattle" &&
    minion.effectId !== "lunar_slime" &&
    minion.effectId !== "meleoron_protect_ally" &&
    minion.effectId !== "flowey_save_load"
  ) return;
  // A suspend here leaves phase === "targeting"; applyAction returns and the
  // player answers with `choose_target` before anything else can happen.
  runEffect(state, minion, slotIndex, library, events);
}

function beginTurn(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  state.activePlayer = playerId;
  state.turnNumber += 1;
  resolveDueMonkeyPaws(state, events);
  restoreExpiredTransforms(state, playerId, events);
  const player = state.players[playerId];
  player.turnsStarted += 1;
  events.push({ kind: "turn", text: `${player.name}'s turn begins.`, player: playerId });

  // Hearthstone's draw: one card, no choice. The pick-1-of-2 that used to happen
  // every single turn is now a card's privilege — Detective L's Foresight — or
  // the Ascendant opponent's standing cheat, which is the same mechanic granted
  // permanently rather than earned by putting a minion on the board.
  //
  // The deck is SHARED, so this is not only a better draw for whoever holds it:
  // the card it rejects is the card the other seat was about to draw.
  const foresight =
    state.foresightFor === playerId ||
    player.board.some(
      (minion) => minion && hasEffect(minion, "foresight_draw") && !minion.silenced && minion.chained === 0,
    );
  const drawn = drawFromDeck(state, foresight ? 2 : 1, events);

  if (foresight && drawn.length > 1) {
    state.phase = "drawChoice";
    state.drawChoice = { player: playerId, cards: drawn };
    events.push({ kind: "draw", text: `${player.name} reads two futures and takes one.`, player: playerId });
    return;
  }

  if (drawn.length > 0) {
    for (const cardId of drawn) {
      putCardInHand(state, playerId, cardId, events);
      announceEnemyDraw(state, playerId, cardId, library, events);
    }
  } else {
    applyFatigue(state, playerId, events);
  }
  finishStartOfTurn(state, playerId, library, events);
}

function chooseDraw(
  state: GameState,
  playerId: PlayerId,
  choiceIndex: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const drawChoice = state.drawChoice;
  if (!drawChoice) return;
  const chosen = drawChoice.cards[choiceIndex];
  const rejected = drawChoice.cards.filter((_cardId, index) => index !== choiceIndex);
  putCardInHand(state, playerId, chosen, events);
  announceEnemyDraw(state, playerId, chosen, library, events);
  state.bottomDeck.unshift(...rejected);
  if (rejected.length > 0) {
    events.push({ kind: "draw", text: `${state.players[playerId].name} sends ${rejected.length} card to the bottom.`, player: playerId });
  }
  state.drawChoice = null;
  finishStartOfTurn(state, playerId, library, events);
}

function announceEnemyDraw(
  state: GameState,
  drawnPlayerId: PlayerId,
  cardId: string,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const observer = state.players[opponent(drawnPlayerId)];
  const seer = observer.board.find(
    (minion) => minion && hasEffect(minion, "reveal_enemy_draw") && !minion.silenced && minion.chained === 0,
  );
  if (!seer) return;
  const cardName = library[cardId]?.name ?? "a card";
  events.push(effectEvent(`${seer.name} sees ${state.players[drawnPlayerId].name} draw ${cardName}.`, seer));
}

function announceTopDeck(state: GameState, library: CardLibrary, events: GameEvent[]): void {
  const topCardId = state.deck[0] ?? state.bottomDeck[state.bottomDeck.length - 1];
  if (!topCardId) return;
  const cardName = library[topCardId]?.name ?? "a card";
  for (const player of state.players) {
    const seer = player.board.find(
      (minion) => minion && hasEffect(minion, "reveal_top_deck") && !minion.silenced && minion.chained === 0,
    );
    if (seer) events.push(effectEvent(`${seer.name} sees the top card of the deck: ${cardName}.`, seer));
  }
}

function finishStartOfTurn(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const player = state.players[playerId];
  // Derived from the turn count rather than incremented, so the ramp is a single
  // number that a save, an undo and the simulator all agree on. At ramp 1 this is
  // exactly the classic +1 a turn.
  const earnedMana = Math.min(10, 1 + Math.round((player.turnsStarted - 1) * (state.manaRamp ?? 1)));
  const manaPenalty = Math.min(earnedMana, Math.max(0, player.manaPenaltyNextTurn ?? 0));
  player.maxMana = earnedMana - manaPenalty;
  player.mana = player.maxMana;
  if (manaPenalty > 0) {
    events.push({ kind: "effect", text: `${player.name} loses ${manaPenalty} mana this turn.`, player: playerId });
  }
  player.manaPenaltyNextTurn = 0;
  state.heroPowerUsed[playerId] = false;
  state.phase = "main";

  resolveUpkeep(state, playerId, library, events);

  const skipOngoing = new Set<string>();
  for (const minion of player.board) {
    if (!minion) continue;
    if (minion.attackLockedUntilTurn !== null && minion.attackLockedUntilTurn <= state.turnNumber) {
      minion.attackLocked = false;
      minion.attackLockedUntilTurn = null;
      events.push(effectEvent(`${minion.name} can attack again.`, minion));
    }
    if (minion.invulnerableUntilTurn !== null && minion.invulnerableUntilTurn <= state.turnNumber) {
      minion.invulnerableUntilTurn = null;
      events.push({ kind: "effect", text: `${minion.name} is no longer Invulnerable.`, player: playerId, instanceId: minion.instanceId });
    }
    if (minion.frozen) {
      // Stays frozen for the whole of this turn -- that IS the cost of Freeze.
      // It thaws when the turn ends (see the end_turn handler).
      minion.thawPending = true;
      skipOngoing.add(minion.instanceId);
      events.push({ kind: "effect", text: `${minion.name} is frozen solid.`, player: playerId, instanceId: minion.instanceId });
    }
    if (minion.chained > 0) {
      minion.chained -= 1;
      skipOngoing.add(minion.instanceId);
      events.push({ kind: "effect", text: `${minion.name}'s chain weakens.`, player: playerId, instanceId: minion.instanceId });
      if (minion.chained === 0) resolveChainGrowth(minion, events);
    }
    minion.sleeping = false;
    minion.attacksUsed = 0;
  }

  // Queue them instead of running them inline: a targeted ongoing effect has to
  // be able to stop the batch mid-way and resume after the player answers.
  // White Whistle lets a Battlecry bearer run that effect as an Ongoing effect.
  const ready = player.board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .filter((minion) => !skipOngoing.has(minion.instanceId) && !minion.silenced && minion.chained === 0)
    .filter(
      (minion) =>
        minion.effectTiming === "ongoing" ||
        minion.effectTiming === "onPlayAndOngoing" ||
        battlecryRunsAsOngoing(minion),
    )
    .sort((left, right) => left.playOrder - right.playOrder);
  state.effectQueue = ready.flatMap((minion) =>
    hasRelic(minion, "double_ongoing")
      ? [{ instanceId: minion.instanceId, owner: playerId }, { instanceId: minion.instanceId, owner: playerId }]
      : [{ instanceId: minion.instanceId, owner: playerId }],
  );

  processEffectQueue(state, library, events);
}

/**
 * Everything that comes due at the start of a player's turn before their board
 * acts: relic timers tick, and a card someone was pressured into playing burns
 * if they ignored it.
 */
function resolveUpkeep(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const player = state.players[playerId];

  resolveStasis(state, playerId, events);
  resolvePocketRooms(state, playerId, events);
  resolveMarkedDeaths(state, playerId, events);
  resolveDeathStar(state, playerId, events);
  resolveKingAttackLocks(state, playerId, events);

  // John Wick's contract comes due.
  if (player.pressured && player.pressured.dueTurn <= state.turnNumber) {
    const { cardId } = player.pressured;
    player.pressured = null;
    const index = player.hand.indexOf(cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
      state.discard.push(cardId);
      const name = library[cardId]?.name ?? "a card";
      events.push({ kind: "effect", text: `${name} burns — ${player.name} never played it.`, player: playerId, cardId });
    }
  }

  resolveStartOfTurnRelics(state, playerId, library, events);

  // Permanent slot-growth blessings feed whoever is standing in the marked slot.
  for (const aura of player.slotAuras) {
    if (aura.auraId !== "slot_grow_1" && aura.auraId !== "slot_grow_2") continue;
    const minion = player.board[aura.slot];
    if (!minion) continue;
    const amount = aura.auraId === "slot_grow_1" ? 1 : 2;
    buffMinion(minion, amount, amount);
    events.push({
      kind: "effect",
      text: `${minion.name} grows on ${aura.sourceName}'s blessing (+${amount}/+${amount}).`,
      player: playerId,
      instanceId: minion.instanceId,
    });
  }

  for (const minion of player.board) {
    if (!minion) continue;
    for (const relic of attachedRelics(minion)) {
      // Devil Fruit feeds its bearer every turn.
      if (relic.relicId === "ongoing_grow_2") {
        buffMinion(minion, 2, 1);
        events.push(effectEvent(`${minion.name} grows on the Devil Fruit (+2/+1).`, minion));
      }
      // Queen's Cocoon opens.
      if (relic.relicId === "cocoon" && relic.readyOnTurn !== undefined && relic.readyOnTurn <= state.turnNumber) {
        relic.readyOnTurn = undefined;
        buffMinion(minion, 3, 3);
        events.push(effectEvent(`${minion.name} emerges from the Cocoon (+3/+3).`, minion));
      }
    }
  }
}

/** Resolve relics whose printed text begins at the bearer's owner's turn. */
function resolveStartOfTurnRelics(
  state: GameState,
  playerId: PlayerId,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];

  // Time Turner records the current start after applying the previous turn's
  // snapshot, so a wounded bearer can be rewound repeatedly across turns.
  for (const minion of player.board) {
    if (!minion) continue;
    for (const relic of attachedRelics(minion)) {
      if (relic.relicId !== "time_turner") continue;
      const previousStartHp = relic.previousTurnStartHp;
      if (previousStartHp !== undefined && minion.hp < minion.maxHp) {
        const restoredHp = Math.min(minion.maxHp, previousStartHp);
        if (restoredHp > minion.hp) {
          minion.hp = restoredHp;
          events.push(effectEvent(`${minion.name} rewinds its wounds with the Time Turner.`, minion));
        }
      }
      relic.previousTurnStartHp = minion.hp;
    }
  }

  // Keep the Omnitrix attached through its own transformation. Other relics
  // are discarded by transformation, just as they are for every other form
  // change in the engine.
  for (const original of [...player.board]) {
    if (!original) continue;
    const hasOmnitrix = attachedRelics(original).some((relic) => relic.relicId === "omnitrix");
    if (!hasOmnitrix || slotOf(state, original) < 0) continue;
    if (!transformMinionFromPool(state, original, original, 1, library, events, "omnitrix")) {
      events.push(effectEvent(`${original.name} finds no Omnitrix form that costs 1 more.`, original));
    }
  }
}

/** The Monkey's Paw claims its bearer at the start of the next turn. */
function resolveDueMonkeyPaws(state: GameState, events: GameEvent[]): void {
  const due = state.players.flatMap((player) =>
    player.board
      .map((minion, slot) => ({ owner: player.id, minion, slot }))
      .filter(({ minion }) =>
        minion &&
        attachedRelics(minion).some(
          (relic) => relic.relicId === "monkeys_paw" && (relic.destroyOnTurn ?? Infinity) <= state.turnNumber,
        ),
      ),
  );

  for (const entry of due) {
    const minion = state.players[entry.owner].board[entry.slot];
    if (!minion) continue;
    const pawIndex = firstRelicIndex(minion, (relic) => relic.relicId === "monkeys_paw");
    const paw = pawIndex >= 0 ? relicAt(minion, pawIndex) : null;
    if (!paw || (paw.destroyOnTurn ?? Infinity) > state.turnNumber) continue;
    unequipRelic(minion, pawIndex);
    state.discard.push(paw.id);
    events.push({
      kind: "effect",
      text: `${minion.name} dies from The Monkey's Paw.`,
      player: entry.owner,
      cardId: paw.id,
      instanceId: minion.instanceId,
    });
    destroyAtSlot(state, entry.owner, entry.slot, events, `${minion.name} falls to The Monkey's Paw`, null);
  }
}

// The passive board-ping used to live here: every ready minion clipped the enemy
// core for 1 at the start of their turn, regardless of anything printed on it.
// It was removed once minions could swing at the core themselves — two clocks
// running at once ended duels the turn a board completed, and the ping was the
// one that made a card's cost and ATK irrelevant. Hearthstone has no such rule.

function drawFromDeck(state: GameState, count: number, events: GameEvent[]): string[] {
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (state.deck.length === 0 && state.bottomDeck.length > 0) {
      state.deck = state.bottomDeck.splice(0).reverse();
    }
    const card = state.deck.shift();
    if (!card) break;
    drawn.push(card);
  }
  if (drawn.length === 0) {
    events.push({ kind: "draw", text: "The shared deck is empty." });
  }
  return drawn;
}

function drawDirect(state: GameState, playerId: PlayerId, count: number, events: GameEvent[]): void {
  const cards = drawFromDeck(state, count, events);
  for (const cardId of cards) {
    putCardInHand(state, playerId, cardId, events);
  }
}

function putCardInHand(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  events: GameEvent[],
  returningInstanceId?: string,
): boolean {
  const player = state.players[playerId];
  if (player.hand.length >= handLimit) {
    state.discard.push(cardId);
    events.push({ kind: "draw", text: `${player.name}'s hand is full, so a card burns.`, player: playerId, cardId });
    return false;
  }
  player.hand.push(cardId);
  events.push({
    kind: "draw",
    text: `${player.name} adds a card to hand.`,
    player: playerId,
    cardId,
    ...(returningInstanceId ? { instanceId: returningInstanceId, motion: "return" as const } : {}),
  });
  return true;
}

/** A core has one Aladdin-granted Divine Shield, just like a minion does. */
function dealCoreDamage(state: GameState, playerId: PlayerId, amount: number, events: GameEvent[]): boolean {
  const player = state.players[playerId];
  if (amount <= 0) return false;
  if (player.heroDivineShield) {
    player.heroDivineShield = false;
    events.push({ kind: "combat", text: `${player.name}'s core Divine Shield breaks.`, player: playerId });
    return false;
  }
  player.health -= amount;
  return true;
}

function applyFatigue(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  player.fatigue += 1;
  if (dealCoreDamage(state, playerId, player.fatigue, events)) {
    events.push({ kind: "damage", text: `${player.name} takes ${player.fatigue} fatigue damage.`, player: playerId });
  }
}

function attackMinion(
  state: GameState,
  playerId: PlayerId,
  attackerSlot: number,
  targetSlot: number,
  events: GameEvent[],
): void {
  const attacker = state.players[playerId].board[attackerSlot];
  const defenderId = opponent(playerId);
  const defender = state.players[defenderId].board[targetSlot];
  if (!attacker || !defender) return;
  const attackerId = attacker.instanceId;
  triggerTenCommandments(state, attacker, events);
  events.push({ kind: "combat", text: `${attacker.name} attacks ${defender.name}.`, player: playerId, instanceId: attacker.instanceId });
  defender.attackedBy.push(attackerId);
  // RoboCop-style: triple the blow when striking an Evil defender. Ea doubles
  // whatever the attacker was going to land.
  let outgoing =
    hasEffect(attacker, "robocop_evil_bonus") && !attacker.silenced && defender.alignment === "Evil"
      ? attacker.atk * 3
      : attacker.atk;
  if (hasEffect(attacker, "doom_evil_slayer") && !attacker.silenced && defender.alignment === "Evil") {
    outgoing *= 3;
  }
  if (hasRelic(attacker, "double_atk_damage")) outgoing *= 2;
  // 3x, up from 2x. Not a balance decision made here: the card had printed "4x"
  // while the code did 2x since before the first balance pass, so every measured
  // win rate for Kaku Kaioh was taken at 2x and the printed promise was never
  // true. Owner ruling resolved the split at 3x, which also matches the only
  // other two multipliers in the roster (RoboCop and Doom Slayer, both 3x).
  // THE MEASUREMENTS ARE NOW STALE — this card needs a fresh balance run.
  if (hasEffect(attacker, "damage_3x_nature") && !attacker.silenced && defender.camp === "Nature") {
    outgoing *= 3;
  }
  if (
    hasEffect(attacker, "weak_point_mark") &&
    !attacker.silenced &&
    attacker.weakPointReady &&
    attacker.weakPointTargetId === defender.instanceId
  ) {
    outgoing *= 2;
    attacker.weakPointReady = false;
    attacker.weakPointTargetId = null;
    events.push(effectEvent(`${attacker.name} strikes the marked weak point for double damage.`, attacker));
  }
  const alreadyAdapted =
    defender.campImmunity !== null &&
    defender.campImmunity.camp === attacker.camp &&
    defender.campImmunity.untilTurn > state.turnNumber;
  // Simultaneous combat, Hearthstone-style: the defender ALWAYS retaliates with
  // its attack value, even if the blow kills it (owner ruling, 2026-07-06).
  dealMinionDamage(state, defenderId, targetSlot, outgoing, attacker, events, false, new Set(), true, true);
  // Infinity Stone: the swing carries into the two neighbours of the target.
  if (hasRelic(attacker, "cleave_adjacent")) {
    for (const side of [targetSlot - 1, targetSlot + 1]) {
      if (side >= 0 && side < boardSize && state.players[defenderId].board[side]) {
        dealMinionDamage(state, defenderId, side, outgoing, attacker, events, true, new Set(), true, true);
      }
    }
  }
  // Tesseract: the bearer strikes from outside space, so nothing reaches back.
  // It is the one thing in the game that suspends simultaneous combat, and only
  // on the bearer's own swing — it is still hit normally on the enemy's turn.
  if (!hasRelic(attacker, "no_retaliation")) {
    // Retaliation is combat damage, but it is not an attack declared by the
    // relic bearer. Defensive attack-immunity relics must not absorb this
    // return blow when their bearer started the fight.
    const retaliation =
      hasEffect(defender, "shibukawa_defense_damage_2x") && !defender.silenced
        ? defender.atk * 2
        : defender.atk;
    dealMinionDamage(state, playerId, attackerSlot, retaliation, defender, events, false, new Set(), true, false);
  } else {
    events.push(effectEvent(`${attacker.name} strikes from outside space — no retaliation.`, attacker));
  }
  const survivingAttacker = state.players[playerId].board[attackerSlot];
  const attackerAlive = Boolean(survivingAttacker && survivingAttacker.instanceId === attackerId);
  const defenderAlive = state.players[defenderId].board.some((minion) => minion?.instanceId === defender.instanceId);
  if (attackerAlive && survivingAttacker) {
    survivingAttacker.attacksUsed += 1;
    if (!survivingAttacker.silenced) {
      if (hasEffect(survivingAttacker, "on_survive_buff_1")) buffMinion(survivingAttacker, 1, 1);
      if (!defenderAlive && hasEffect(survivingAttacker, "on_kill_buff_1")) buffMinion(survivingAttacker, 1, 1);
      if (!defenderAlive && hasEffect(survivingAttacker, "godrick_relic_on_kill")) {
        grantRelic(state, playerId, survivingAttacker, events);
      }
      if (!defenderAlive && hasEffect(survivingAttacker, "doom_evil_slayer") && defender.alignment === "Evil") {
        survivingAttacker.hp = Math.min(survivingAttacker.maxHp, survivingAttacker.hp + 3);
        events.push(effectEvent(`${survivingAttacker.name} heals 3 after slaying Evil.`, survivingAttacker));
      }
    }
    // Allspark Cube: the kill is taken home as a card.
    if (!defenderAlive && hasRelic(survivingAttacker, "capture_kill")) {
      putCardInHand(state, playerId, defender.cardId, events, defender.instanceId);
      events.push(effectEvent(`${survivingAttacker.name} captures ${defender.name}.`, survivingAttacker));
    }
  }
  // Defender reactions to being attacked (the strike landed even if it died).
  if (!defender.silenced) {
    if (hasEffect(defender, "freeze_attacker") && attackerAlive && survivingAttacker) {
      applyFreeze(state, defender, survivingAttacker, events);
    }
    if (
      hasEffect(defender, "chain_attacker") &&
      attackerAlive &&
      survivingAttacker &&
      !isSlotProtected(state, survivingAttacker) &&
      canDisable(state, defender.owner, survivingAttacker, "chain")
    ) {
      // Chained = 2 is one skipped owner turn in this engine: the counter is
      // decremented at turn start before attacks are offered.
      survivingAttacker.chained = Math.max(survivingAttacker.chained, 2);
      events.push(effectEvent(`${defender.name} chains ${survivingAttacker.name} for 1 turn.`, defender));
    }
    if (hasEffect(defender, "kaku_discard")) discardRandom(state, playerId, events);
    // APR: whoever swung at it never swings again.
    if (hasEffect(defender, "attack_lock") && attackerAlive && survivingAttacker) {
      survivingAttacker.attackLocked = true;
      survivingAttacker.attackLockedUntilTurn = state.turnNumber + 6;
      events.push(effectEvent(`${defender.name} stops ${survivingAttacker.name} for two turns.`, defender));
    }
    // Doomsday: it adapts to whatever hit it and shrugs that Camp off for three turns.
    // A hit that is already absorbed by Doomsday's current adaptation must not
    // restart the timer, or a repeated same-Camp attacker could never wear it off.
    if (hasEffect(defender, "camp_immunity_on_hit") && defenderAlive && !alreadyAdapted) {
      // turnNumber advances once per player's turn. The attacking player gets
      // another turn after two half-turns, so three of that player's turns end
      // eight half-turns after the hit.
      defender.campImmunity = { camp: attacker.camp, untilTurn: state.turnNumber + 8 };
      events.push(effectEvent(`${defender.name} adapts to ${attacker.camp}.`, defender));
    }
    if (defenderAlive && hasEffect(defender, "on_survive_buff_1")) {
      buffMinion(defender, 1, 1);
      events.push(effectEvent(`${defender.name} survives combat and gains +1/+1.`, defender));
    }
  }
  // Yoriichi Type Zero: any friendly that walks out of combat is sharpened.
  awardSurvivors(state, events, [attackerId, defender.instanceId]);
}

/** Yoriichi's payoff — every friendly participant that survives gains +1/+1. */
function awardSurvivors(state: GameState, events: GameEvent[], fought: string[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    const board = state.players[playerId].board;
    const hasActiveMentor = board.some((minion) => minion && hasEffect(minion, "survivor_buff") && !minion.silenced);
    if (!hasActiveMentor) continue;
    for (const minion of board) {
      if (!minion || !fought.includes(minion.instanceId)) continue;
      buffMinion(minion, 1, 1);
      events.push(effectEvent(`${minion.name} survives and grows +1/+1.`, minion));
    }
  }
}

function attackCore(state: GameState, playerId: PlayerId, attackerSlot: number, events: GameEvent[]): void {
  const attacker = state.players[playerId].board[attackerSlot];
  if (!attacker) return;
  triggerTenCommandments(state, attacker, events);
  const defenderId = opponent(playerId);
  // Exactly its ATK — no floor, no retaliation. Ea doubles a swing wherever it
  // lands; the One Ring adds its reach only against the core.
  let damage = hasRelic(attacker, "double_atk_damage") ? attacker.atk * 2 : attacker.atk;
  if (hasRelic(attacker, "core_strike_3")) damage += 3;
  const landed = dealCoreDamage(state, defenderId, damage, events);
  attacker.attacksUsed += 1;
  if (landed) {
    events.push({ kind: "damage", text: `${attacker.name} strikes the core for ${damage}.`, player: playerId, instanceId: attacker.instanceId });
  }
}

function triggerTenCommandments(state: GameState, attacker: MinionInstance, events: GameEvent[]): void {
  const source = state.players[opponent(attacker.owner)].board.find(
    (minion) =>
      minion &&
      !minion.silenced &&
      hasEffect(minion, "ten_commandments_first_attack") &&
      minion.commandmentsTriggeredAtTurn !== state.turnNumber,
  );
  if (!source) return;
  source.commandmentsTriggeredAtTurn = state.turnNumber;
  if (isSlotProtected(state, attacker) || !canDisable(state, source.owner, attacker, "chain")) return;
  attacker.chained = Math.max(attacker.chained, 2);
  events.push(effectEvent(`${source.name} chains the first attacker, ${attacker.name}, for one turn.`, source));
}

function spendCoin(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  player.coins -= 1;
  player.mana += 1;
  events.push({ kind: "effect", text: `${player.name} spends The Coin for +1 mana.`, player: playerId });
}

// ---------------------------------------------------------------------------
// Targeting. Ten cards print the word "Choose" on their face and for a long time
// the engine chose for them — always the leftmost legal minion, which made the
// text a lie and let anyone soak every removal effect in the game by parking
// junk in slot 0. These effects now stop and ask their controller.
//
// Effects NOT listed here keep auto-targeting on purpose: board-wide effects,
// "the weakest"/"the costliest" effects whose text already names the victim, and
// self-only effects. A listed effect with exactly one legal option resolves
// straight away rather than opening a pointless one-button prompt.
// ---------------------------------------------------------------------------
interface TargetSpec {
  /**
   * board = point at a minion · slot = point at a board POSITION, occupied or
   * not · hand = point at a card in a hand · option = pick a value.
   */
  kind?: "board" | "slot" | "hand" | "option" | "boardOrCore";
  side: "enemy" | "friendly" | "any";
  prompt: string;
  /** Which minions may be picked. `source` is excluded unless includeSelf is set. */
  filter?: (minion: MinionInstance, source: MinionInstance) => boolean;
  handFilter?: (card: PlayableCard, index: number) => boolean;
  includeSelf?: boolean;
  /** Preconditions checked BEFORE prompting, so the effect never asks then fizzles. */
  enabled?: (state: GameState, source: MinionInstance) => boolean;
  /** kind:"option" only — the labelled values on offer. */
  values?: LabelOption[] | ((state: GameState, source: MinionInstance, library: CardLibrary) => LabelOption[]);
  /** Who answers the prompt. Bargains are offered to the opponent. */
  chooser?: "source" | "opponent";
  /** kind:"boardOrCore" only — append the enemy core as one legal choice. */
  coreOption?: boolean;
}

type SourceCamp = Exclude<Camp, "ALL">;

/**
 * ALL is an umbrella recipient for positive camp buffs. It must not be used by
 * hostile camp filters: an ALL minion is not secretly Magic, Nature, or Tech,
 * so camp-specific damage, immunity, consumption, and other debuffs continue
 * to require an exact camp match.
 */
function receivesCampBuff(minion: MinionInstance, camp: SourceCamp): boolean {
  return minion.camp === camp || minion.camp === "ALL";
}

export const TARGETED_EFFECTS: Partial<Record<EffectId, TargetSpec>> = {
  // --- enemy side ---
  weak_point_mark: { side: "enemy", prompt: "Choose an enemy minion to mark its weak point" },
  strange_duel: { side: "enemy", prompt: "Choose an enemy minion to chain with Doctor Strange" },
  strange_bargain: {
    kind: "option",
    side: "enemy",
    chooser: "opponent",
    prompt: "Choose Doctor Strange's bargain",
    values: [
      { label: "Lose 10 Core HP", value: "core_hp" },
      { label: "Lose a random minion", value: "random_minion" },
      { label: "Lose 5 mana next turn", value: "mana" },
    ],
  },
  dark_dimension_banish: { side: "enemy", prompt: "Choose an enemy minion to banish to the Dark Dimension" },
  death_star_mark: { kind: "boardOrCore", side: "enemy", prompt: "Mark an enemy minion or the enemy core", coreOption: true },
  freeze_two: { side: "enemy", prompt: "Choose the first enemy minion to Freeze" },
  set_attack_1: { side: "enemy", prompt: "Set an enemy minion's ATK to 1" },
  stasis_enemy: { side: "enemy", prompt: "Choose an enemy minion to put into stasis" },
  vader_chain_or_destroy: { side: "enemy", prompt: "Choose an enemy minion for Darth Vader" },
  set_hp_1: { side: "enemy", prompt: "Set an enemy minion's HP to 1" },
  copy_minion_to_hand: {
    side: "any",
    prompt: "Choose a minion to copy into your hand",
    includeSelf: true,
    filter: (m) => !m.cardId.startsWith("token:"),
  },
  freeze_enemy: { side: "enemy", prompt: "Freeze an enemy minion" },
  freeze_and_weaken: { side: "enemy", prompt: "Freeze an enemy and halve its ATK" },
  silence_enemy: { side: "enemy", prompt: "Silence an enemy minion", filter: (m) => !m.silenced },
  reduce_atk_3: { side: "enemy", prompt: "Weaken an enemy minion by 3 ATK", filter: (m) => m.atk > 0 },
  bounce_enemy: { side: "enemy", prompt: "Return an enemy minion to its owner's hand" },
  freeze_or_kill: { side: "enemy", prompt: "Freeze an enemy; kill it if it is already Frozen" },
  batman_gadget_choice: { side: "enemy", prompt: "Choose an enemy minion for Batman" },
  freeze_and_silence_enemy: { side: "enemy", prompt: "Freeze and silence an enemy minion" },
  hashira_focus_attack: {
    side: "enemy",
    prompt: "Choose an Evil enemy for the Hashira to attack",
    filter: (m) => m.alignment === "Evil",
  },
  delayed_destroy: { side: "enemy", prompt: "Mark an enemy minion" },
  damage_evil_enemy_4: { side: "enemy", prompt: "Deal 4 damage to an Evil enemy", filter: (m) => m.alignment === "Evil" },
  damage_magic_enemy_2: { side: "enemy", prompt: "Deal 2 damage to a Magic enemy", filter: (m) => m.camp === "Magic" },
  destroy_small_4: { side: "enemy", prompt: "Destroy an enemy with 4 or less HP", filter: (m) => m.hp <= 4 },
  destroy_enemy: { side: "enemy", prompt: "Destroy an enemy minion" },
  destroy_enemy_taunt: { side: "enemy", prompt: "Destroy an enemy Taunt minion", filter: (m) => hasKeyword(m, "Taunt") },
  destroy_and_gain_stats: { side: "any", prompt: "Destroy a minion and gain its stats" },
  godrick_graft: { side: "friendly", prompt: "Kill a friendly minion and gain its stats and effects" },
  destroy_damaged_enemy: { side: "enemy", prompt: "Destroy a wounded enemy", filter: (m) => m.hp < m.maxHp },
  chain_damage: { side: "enemy", prompt: "Choose an enemy minion to take 1 damage" },
  devour_small: { side: "enemy", prompt: "Devour a small enemy", filter: (m) => m.atk <= 3 && m.hp <= 3 },
  consume_tech_4_hp: {
    side: "enemy",
    prompt: "Consume an enemy Tech minion with 4 HP or lower",
    filter: (m) => m.camp === "Tech" && m.hp <= 4,
  },
  consume_nature_4_hp: {
    side: "enemy",
    prompt: "Consume an enemy Nature minion with 4 HP or lower",
    filter: (m) => m.camp === "Nature" && m.hp <= 4,
  },
  // --- friendly side ---
  neutral_double_atk_hp_1: {
    side: "friendly",
    prompt: "Choose another friendly Neutral minion",
    filter: (m) => m.alignment === "Neutral",
  },
  meleoron_protect_ally: { side: "friendly", prompt: "Choose a friendly minion to hide", includeSelf: false },
  evil_invulnerable: {
    side: "friendly",
    prompt: "Choose a friendly Evil minion to make Invulnerable",
    filter: (m) => m.alignment === "Evil",
    includeSelf: true,
  },
  protect_slot: { kind: "slot", side: "friendly", prompt: "Protect a friendly minion board slot" },
  tech_buff: { side: "friendly", prompt: "Upgrade a friendly Tech minion", filter: (m) => receivesCampBuff(m, "Tech"), includeSelf: true },
  heal_ally_full: { side: "friendly", prompt: "Fully heal a friendly minion", includeSelf: true },
  // Cecil may return an ally, but never himself.
  bounce_friendly: { side: "friendly", prompt: "Return another friendly minion to your hand", includeSelf: false },
  heal_good_ally_full: { side: "friendly", prompt: "Fully heal a Good ally", filter: (m) => m.alignment === "Good" },
  buff_good_ally_3: { side: "friendly", prompt: "Give a Good ally +2/+2", filter: (m) => m.alignment === "Good" },
  buff_magic_ally_3: { side: "friendly", prompt: "Give a Magic ally +3/+3", filter: (m) => receivesCampBuff(m, "Magic") },
  buff_evil_ally_2: { side: "friendly", prompt: "Give an Evil ally +2/+2", filter: (m) => m.alignment === "Evil" },
  buff_evil_ally_3_2_heal: { side: "friendly", prompt: "Empower and heal an Evil ally", filter: (m) => m.alignment === "Evil" },
  buff_neutral_tech_ally_2: {
    side: "friendly",
    prompt: "Give a Neutral Tech ally +2/+2",
    filter: (m) => m.alignment === "Neutral" && receivesCampBuff(m, "Tech"),
  },
  buff_good_tech_ally_2: {
    side: "friendly",
    prompt: "Give a Good Tech ally +2/+2",
    filter: (m) => m.alignment === "Good" && receivesCampBuff(m, "Tech"),
  },
  give_shield_ally: { side: "friendly", prompt: "Give an ally Divine Shield", filter: (m) => !m.divineShield },
  give_dodge_50: { side: "friendly", prompt: "Give an ally 50% evasion", filter: (m) => !hasEffect(m, "dodge_50") },
  give_taunt: { side: "friendly", prompt: "Give an ally Taunt", filter: (m) => !hasKeyword(m, "Taunt") },
  devour_friendly: { side: "friendly", prompt: "Consume one of your own minions" },
  morpheus_choice: {
    kind: "option",
    side: "friendly",
    prompt: "Choose an alignment",
    values: [
      { label: "Red Pill — Good", value: "good" },
      { label: "Blue Pill — Evil", value: "evil" },
    ],
  },
  aladdin_wish: {
    kind: "option",
    side: "friendly",
    prompt: "Make a wish",
    values: [
      { label: "Give your hero Divine Shield", value: "hero_shield" },
      { label: "Summon a random 3-mana minion", value: "summon_3" },
      { label: "Gain a random Ascension Relic", value: "random_relic" },
    ],
  },
  discover_tech_card: {
    kind: "option",
    side: "friendly",
    prompt: "Choose 1 of 3 Tech cards from the deck",
    values: (state, _source, library) =>
      techCardsInDeck(state, library)
        .slice(0, 3)
        .map((card) => ({ label: card.name, value: card.id })),
  },
  replace_same_cost_random: { side: "any", prompt: "Choose another minion", includeSelf: false },
  // --- the hard cards ---
  copy_minion_effects: { side: "any", prompt: "Choose another minion to become" },
  knov_pocket_room: { side: "friendly", prompt: "Choose a friendly minion for the pocket room", includeSelf: false },
  steal_relic: { side: "enemy", prompt: "Take an enemy minion's Ascension Relic", filter: (m) => hasAnyRelic(m) },
  steal_and_equip_relic: {
    side: "enemy",
    prompt: "Take an enemy minion's Ascension Relic",
    filter: (m, source) => hasAnyRelic(m) && attachedRelics(m).some((relic) => canEquipRelicToBearer(relic, source)),
    enabled: (_state, source) => hasFreeRelicSlot(source),
  },
  steal_hand_relic: {
    kind: "hand",
    side: "enemy",
    prompt: "Choose an Ascension Relic in the enemy hand to steal",
    handFilter: (card) => isRelicCard(card),
  },
  destroy_relic: { side: "enemy", prompt: "Destroy an enemy minion's Ascension Relic", filter: (m) => hasAnyRelic(m) },
  mark_for_death: { side: "enemy", prompt: "Mark an enemy minion for death", filter: (m) => m.markedBy === null },
  mind_control_2: { side: "enemy", prompt: "Seize an enemy minion with 2 or less HP", filter: (m) => m.hp <= 2 },
  mind_control_enemy: { side: "enemy", prompt: "Gain control of an enemy minion" },
  motoko_kusanagi: {
    side: "enemy",
    prompt: "Take control of an enemy Tech minion with 4 HP or less",
    filter: (m) => m.camp === "Tech" && m.hp <= 4 && !m.temporaryControl,
  },
  copy_and_trigger: {
    side: "enemy",
    prompt: "Copy and fire an enemy minion's effect",
    filter: (m) => m.effectId !== "none" && m.effectTiming !== "passive",
  },
  steal_passive: {
    side: "enemy",
    prompt: "Steal an enemy minion's passive",
    filter: (m) => m.effectTiming === "passive" && m.effectId !== "none",
  },
  bounce_friendly_discount: { side: "friendly", prompt: "Return an ally to your hand at a discount" },
  set_stats_choice: { kind: "slot", side: "enemy", prompt: "Set an enemy minion board slot to 1/1" },
  pressure_chosen_card: {
    kind: "hand",
    side: "enemy",
    prompt: "Choose a card in the enemy hand — they must play it next turn or burn it",
  },
  steal_chosen: {
    kind: "hand",
    side: "enemy",
    prompt: "Choose a card to steal from the enemy hand",
  },
  choose_2_discard: {
    kind: "hand",
    side: "enemy",
    prompt: "Choose the first card in the enemy hand",
  },
  discard_draw_2: {
    kind: "hand",
    side: "friendly",
    prompt: "Choose the first card to discard",
  },
  consume_tech_card: {
    kind: "hand",
    side: "friendly",
    prompt: "Choose a Tech card to consume",
    handFilter: (card) => isMinionCard(card) && card.camp === "Tech",
  },
  // --- slot auras: pick a POSITION, empty or not; the mark is permanent ---
  slot_random_attacks: { kind: "slot", side: "enemy", prompt: "Curse an enemy slot — minions there attack at random, forever" },
  slot_permanent_silence: { kind: "slot", side: "enemy", prompt: "Silence an enemy slot — minions there are silenced, forever" },
  slot_permanent_chain: { kind: "slot", side: "enemy", prompt: "Chain an enemy slot — minions there are Chained, forever" },
  slot_growth_1: { kind: "slot", side: "friendly", prompt: "Bless one of your slots — minions there gain +1/+1 every turn" },
  slot_growth: { kind: "slot", side: "friendly", prompt: "Bless one of your slots — minions there gain +2/+2 every turn" },
  reveal_and_shuffle_chosen: {
    kind: "hand",
    side: "enemy",
    prompt: "Reveal a card in the enemy hand and shuffle it away",
  },
};

function targetOptions(state: GameState, source: MinionInstance, spec: TargetSpec): TargetOption[] {
  if (spec.enabled && !spec.enabled(state, source)) return [];
  const sides: PlayerId[] =
    spec.side === "any"
      ? [source.owner, opponent(source.owner)]
      : [spec.side === "enemy" ? opponent(source.owner) : source.owner];
  const options: TargetOption[] = [];
  for (const ownerId of sides) {
    state.players[ownerId].board.forEach((minion, slot) => {
      if (!minion) return;
      if (isUntargetable(state, minion)) return;
      if (ownerId !== source.owner && !enemyTargetable(state, minion)) return;
      if (ownerId !== source.owner && isProtectedDisableTarget(state, source, minion)) return;
      if (!spec.includeSelf && minion.instanceId === source.instanceId) return;
      if (spec.filter && !spec.filter(minion, source)) return;
      options.push({ owner: ownerId, slot });
    });
  }
  return options;
}

function isProtectedDisableTarget(state: GameState, source: MinionInstance, target: MinionInstance): boolean {
  if (!isSlotProtected(state, target)) return false;
  if (source.effectId === "freeze_or_kill") return !target.frozen;
  return new Set<EffectId>([
    "freeze_two",
    "strange_duel",
    "freeze_enemy",
    "freeze_and_weaken",
    "silence_enemy",
    "freeze_and_silence_enemy",
    "vader_chain_or_destroy",
  ]).has(source.effectId);
}

/** Whether an enemy effect may point at this minion at all. */
function enemyTargetable(state: GameState, minion: MinionInstance): boolean {
  // Neo's protected slot is a disable ward, not blanket untargetability: a
  // removal effect may still point at the minion, and combat may still hit it.
  if (minion.protectedSlot) return false;
  return !isUntargetable(state, minion);
}

/** Combat can hit a protected board slot; untargetability is the stricter rule
 * that blocks both attacks and effects. */
function attackTargetable(state: GameState, minion: MinionInstance): boolean {
  return !isUntargetable(state, minion);
}

function isUntargetable(state: GameState, minion: MinionInstance): boolean {
  if (minion.chained > 0) return true;
  if (hasRelic(minion, "untargetable")) return true;
  if (minion.untargetableUntilTurn !== null && minion.untargetableUntilTurn !== undefined && minion.untargetableUntilTurn > state.turnNumber) return true;
  if (minion.protectedByMeleoron) {
    return state.players[minion.owner].board.some(
      (ally) => ally !== null && ally.instanceId === minion.protectedByMeleoron && hasEffect(ally, "meleoron_protect_ally") && !ally.silenced,
    );
  }
  return false;
}

/** Every position on the chosen side — a slot aura does not need an occupant. */
function slotOptions(source: MinionInstance, spec: TargetSpec): TargetOption[] {
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return Array.from({ length: boardSize }, (_unused, slot) => ({ owner: ownerId, slot }));
}

/**
 * Whether a borrowed effect may legally point at the minion it was copied from.
 *
 * `runEffect` reads `chosen ?? requestChoice(...)`, so handing it a choice skips
 * `requestChoice` entirely, and with it the spec's own side, filter, includeSelf
 * and untargetable rules. `copy_and_trigger` is the only caller that builds a
 * choice by hand instead of getting one from a prompt, and the one it builds
 * always names an ENEMY minion, so every borrowed spec has to be re-checked
 * against it here.
 *
 * False means "do not hand this one over" — never "give up". The caller then
 * lets the effect ask for its own target, which is both legal and the stronger
 * reading of the card: the copy behaves as though its controller had cast it.
 */
function copiedVictimIsLegalTarget(state: GameState, source: MinionInstance, victim: TargetOption): boolean {
  const spec = TARGETED_EFFECTS[source.effectId];
  // An untargeted effect ignores `chosen` entirely; handing it one is noise.
  if (!spec) return false;
  const kind = spec.kind ?? "board";
  // A board answer can never satisfy a hand or option prompt.
  if (kind === "hand" || kind === "option") return false;
  const options = kind === "slot" ? slotOptions(source, spec) : targetOptions(state, source, spec);
  return options.some((option) => option.owner === victim.owner && option.slot === victim.slot);
}

/**
 * A minion's OWN effect, ignoring any it is temporarily wearing.
 *
 * All for One parks the borrower's real effect in `copyRestoreEffectId` while a
 * copy resolves, so for the length of that resolution `effectId` is somebody
 * else's. Any card that reads an effect OFF another minion has to ask for the
 * printed one, or it copies a borrowed power that is about to be handed back —
 * All for One copying All for One mid-copy being the obvious way in.
 */
function printedEffectId(minion: MinionInstance): EffectId {
  return minion.copyRestoreEffectId ?? minion.effectId;
}

/**
 * Puts a minion's own effect back after a copied one has finished with it.
 *
 * Safe to call at any time: it does nothing unless the minion is mid-copy, and
 * it deliberately does nothing while a prompt is still open, because the copied
 * effect has not finished until its last question is answered.
 */
function restoreCopiedEffect(state: GameState, minion: MinionInstance | null | undefined): void {
  if (!minion) return;
  if (minion.copyRestoreEffectId === null || minion.copyRestoreEffectId === undefined) return;
  if (state.phase === "targeting") return;
  minion.effectId = minion.copyRestoreEffectId;
  minion.copyRestoreEffectId = null;
}

function handOptions(state: GameState, source: MinionInstance, spec: TargetSpec, library: CardLibrary): HandOption[] {
  if (spec.enabled && !spec.enabled(state, source)) return [];
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return state.players[ownerId].hand
    .map((cardId, index) => ({ owner: ownerId, index, cardId }))
    .filter((option) => {
      const card = library[option.cardId];
      return Boolean(card) && (!spec.handFilter || spec.handFilter(card, option.index));
    });
}

/**
 * Opens a prompt, or resolves straight away when the answer is forced.
 * Returns the chosen answer, or "asked" when the game is now waiting.
 */
function requestChoice(
  state: GameState,
  source: MinionInstance,
  spec: TargetSpec,
  library: CardLibrary,
  step = 0,
  priorOptions: TargetOption[] = [],
  priorHandOptions: HandOption[] = [],
  priorLabelOptions: LabelOption[] = [],
): ResolvedChoice | "asked" | null {
  const kind = spec.kind ?? "board";
  const boardList =
    kind === "board" || kind === "boardOrCore"
      ? targetOptions(state, source, spec)
      : kind === "slot"
        ? slotOptions(source, spec)
        : [];
  const handList = kind === "hand" ? handOptions(state, source, spec, library) : [];
  const labelList =
    kind === "option"
      ? typeof spec.values === "function"
        ? spec.values(state, source, library)
        : (spec.values ?? [])
      : [];
  const coreOption = kind === "boardOrCore" && spec.coreOption === true;
  const count = boardList.length + handList.length + labelList.length + (coreOption ? 1 : 0);
  if (count === 0) return null;
  if (count === 1) {
    if (kind === "board" || kind === "slot" || (kind === "boardOrCore" && boardList.length === 1)) {
      return { kind: "board", target: boardList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
    }
    if (kind === "boardOrCore") return { kind: "core", owner: opponent(source.owner), step, priorOptions, priorHandOptions, priorLabelOptions };
    if (kind === "hand") return { kind: "hand", hand: handList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
    return { kind: "option", option: labelList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
  }
  // The escape hatch belongs only to the first prompt. Once a multi-step
  // effect has accepted an earlier choice, returning the source would refund
  // a card whose effect has already partly resolved.
  const cancelPlay =
    step === 0 && priorOptions.length === 0 && priorHandOptions.length === 0 && priorLabelOptions.length === 0
      ? state.pendingPlayCancel ?? state.pendingTarget?.cancelPlay
      : undefined;
  state.pendingTarget = {
    kind,
    player: spec.chooser === "opponent" ? opponent(source.owner) : source.owner,
    sourceInstanceId: source.instanceId,
    sourceOwner: source.owner,
    sourceName: source.name,
    sourceCardId: source.cardId,
    effectId: source.effectId,
    prompt: spec.prompt,
    options: boardList,
    handOptions: handList,
    labelOptions: labelList,
    coreOption,
    step,
    priorOptions,
    priorHandOptions,
    priorLabelOptions,
    ...(cancelPlay ? { cancelPlay } : {}),
  };
  state.phase = "targeting";
  return "asked";
}

/** Relics currently available as cards in the shared deck, in deck order. */
function relicsInDeck(state: GameState, library: CardLibrary): RelicDefinition[] {
  return [...state.deck, ...state.bottomDeck]
    .map((cardId) => library[cardId])
    .filter((card): card is RelicDefinition => isRelicCard(card));
}

/** Tech minion cards available to Vegapunk, in shared-deck order, without duplicate offers. */
function techCardsInDeck(state: GameState, library: CardLibrary): CardDefinition[] {
  const seen = new Set<string>();
  return [...state.deck, ...state.bottomDeck].flatMap((cardId) => {
    const card = library[cardId];
    if (!isMinionCard(card) || card.camp !== "Tech" || seen.has(card.id)) return [];
    seen.add(card.id);
    return [card];
  });
}

/** Minion cards of one alignment still in the shared draw pile. */
function alignmentMinionsInDeck(
  state: GameState,
  alignment: "Good" | "Evil",
  library: CardLibrary,
): CardDefinition[] {
  const seen = new Set<string>();
  return [...state.deck, ...state.bottomDeck].flatMap((cardId) => {
    const card = library[cardId];
    if (!isMinionCard(card) || card.alignment !== alignment || seen.has(card.id)) return [];
    seen.add(card.id);
    return [card];
  });
}

/** Discover up to three distinct alignment cards, using the duel's seeded RNG. */
function discoverAlignmentMinions(
  state: GameState,
  alignment: "Good" | "Evil",
  library: CardLibrary,
): CardDefinition[] {
  const pool = alignmentMinionsInDeck(state, alignment, library);
  const offers: CardDefinition[] = [];
  while (offers.length < 3 && pool.length > 0) {
    offers.push(pool.splice(rollInt(state, pool.length), 1)[0]);
  }
  return offers;
}

function removeCardFromDrawPile(state: GameState, cardId: string): boolean {
  const deckIndex = state.deck.indexOf(cardId);
  if (deckIndex >= 0) {
    state.deck.splice(deckIndex, 1);
    return true;
  }
  const bottomIndex = state.bottomDeck.indexOf(cardId);
  if (bottomIndex >= 0) {
    state.bottomDeck.splice(bottomIndex, 1);
    return true;
  }
  return false;
}

function grantRandomRelic(
  state: GameState,
  playerId: PlayerId,
  source: MinionInstance,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const available = relicsInDeck(state, library);
  if (available.length === 0) {
    events.push(effectEvent(`${source.name} finds no Ascension Relic.`, source));
    return;
  }
  const relic = available[rollInt(state, available.length)];
  if (!relic || !removeCardFromDrawPile(state, relic.id)) return;
  putCardInHand(state, playerId, relic.id, events);
  events.push(effectEvent(`${source.name} grants a random Ascension Relic: ${relic.name}.`, source));
}

function summonRandomCostFromDeck(
  state: GameState,
  playerId: PlayerId,
  cost: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const slot = player.board.findIndex((entry) => !entry);
  if (slot < 0) return;
  const candidates = [...state.deck, ...state.bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && card.cost === cost;
  });
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, cardId)) return;
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const summoned = createMinion(card, playerId, state);
  player.board[slot] = summoned;
  events.push({ kind: "effect", text: `${player.name} summons ${summoned.name} from the deck.`, player: playerId, cardId, instanceId: summoned.instanceId });
}

function summonRandomMinionFromDeck(
  state: GameState,
  source: MinionInstance,
  library: CardLibrary,
  events: GameEvent[],
  preferredSlot?: number,
  summoner: PlayerId = source.owner,
): void {
  const player = state.players[summoner];
  const slot =
    preferredSlot !== undefined && preferredSlot >= 0 && preferredSlot < player.board.length && !player.board[preferredSlot]
      ? preferredSlot
      : player.board.findIndex((entry) => !entry);
  if (slot < 0) return;
  const candidates = [...state.deck, ...state.bottomDeck].filter((cardId) => isMinionCard(library[cardId]));
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, cardId)) return;
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const summoned = createMinion(card, summoner, state);
  player.board[slot] = summoned;
  events.push({
    kind: "effect",
    text: `${source.name} summons ${summoned.name} from the deck.`,
    player: summoner,
    cardId,
    instanceId: summoned.instanceId,
  });
}

function summonShenron(
  state: GameState,
  dead: MinionInstance,
  deadSlot: number,
  events: GameEvent[],
): void {
  const owner = dead.owner;
  const player = state.players[owner];
  const slot = !player.board[deadSlot] ? deadSlot : player.board.findIndex((minion) => !minion);
  if (slot < 0) return;
  const shenron: CardDefinition = {
    kind: "minion",
    id: "token:shenron",
    name: "Shenron",
    cost: 7,
    atk: 7,
    hp: 7,
    rarity: "Black",
    camp: "Magic",
    alignment: "Neutral",
    keywords: ["Taunt"],
    effectId: "none",
    effectTiming: "none",
    effect: "Taunt.",
    flavor: "The wish dragon answers.",
    origin: dead.origin,
    art: resolvePublicAssetUrl("/card-art/raw/token-shenron.webp"),
  };
  const summoned = createMinion(shenron, owner, state);
  player.board[slot] = summoned;
  events.push({
    kind: "effect",
    text: `${dead.name}'s Dragon Balls summon Shenron.`,
    player: owner,
    cardId: summoned.cardId,
    instanceId: summoned.instanceId,
  });
}

function drawRandomKeywordMinion(
  state: GameState,
  source: MinionInstance,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const candidates = [...state.deck, ...state.bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && ["Taunt", "Divine Shield", "Passive"].some((keyword) => hasKeyword(card, keyword));
  });
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, cardId)) return;
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  putCardInHand(state, source.owner, card.id, events);
  events.push(effectEvent(`${source.name} draws ${card.name} from the deck.`, source));
}

function replaceWithRandomSameCost(state: GameState, target: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const slot = slotOf(state, target);
  if (slot < 0) return;
  const owner = target.owner;
  state.players[owner].board[slot] = null;
  discardAttachedRelics(state, target);
  state.bottomDeck.push(target.cardId);
  const candidates = [...state.deck, ...state.bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && card.cost === target.cost;
  });
  if (candidates.length === 0) {
    events.push({ kind: "effect", text: `${target.name} is put on the bottom of the deck, but no same-cost minion replaces it.`, player: owner, cardId: target.cardId });
    return;
  }
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, cardId)) return;
  const replacement = library[cardId];
  if (!isMinionCard(replacement)) return;
  const summoned = createMinion(replacement, owner, state);
  state.players[owner].board[slot] = summoned;
  events.push({ kind: "effect", text: `${target.name} is replaced by ${summoned.name}.`, player: owner, cardId, instanceId: summoned.instanceId });
}

function takeRelicFromDeckToHand(
  state: GameState,
  playerId: PlayerId,
  relicId: string,
  library: CardLibrary,
  events: GameEvent[],
): RelicDefinition | null {
  const relic = library[relicId];
  if (!isRelicCard(relic)) return null;
  if (!removeCardFromDrawPile(state, relicId)) return null;
  putCardInHand(state, playerId, relicId, events);
  return relic;
}

/** Resolve every live Frieren trigger caused by one relic play, once per source
 * each turn, pausing between discoveries when the player has more than one. */
function triggerRelicDiscoveries(
  state: GameState,
  playerId: PlayerId,
  sourceIds: string[],
  library: CardLibrary,
  events: GameEvent[],
): void {
  const remaining = [...sourceIds];
  while (remaining.length > 0 && state.phase === "main") {
    const sourceId = remaining.shift();
    if (!sourceId) continue;
    const sourceSlot = state.players[playerId].board.findIndex((minion) => minion?.instanceId === sourceId);
    const source = sourceSlot >= 0 ? state.players[playerId].board[sourceSlot] : null;
    if (!source || source.silenced || source.effectId !== "frieren_relic_discover") continue;
    if (source.relicDiscoveryTurn === state.turnNumber) continue;
    if (relicsInDeck(state, library).length === 0) continue;
    source.relicDiscoveryTurn = state.turnNumber;
    const suspended = runEffect(state, source, sourceSlot, library, events);
    if (suspended) {
      if (state.pendingTarget) state.pendingTarget.queuedRelicSources = remaining;
      return;
    }
  }
}

/**
 * Runs a minion's effect. Returns TRUE when it suspended waiting for a target —
 * the caller must stop and let `choose_target` resume it.
 */
function runEffect(
  state: GameState,
  source: MinionInstance,
  sourceSlot: number,
  library: CardLibrary,
  events: GameEvent[],
  chosen?: ResolvedChoice,
): boolean {
  const player = state.players[source.owner];
  const enemyId = opponent(source.owner);
  const enemy = state.players[enemyId];
  const label = `${source.name}:`;

  traceEffect(source.effectId);

  if (source.effectId === "discover_relic_self" || source.effectId === "choose_relic") {
    if (chosen?.kind !== "option") {
      const next = requestChoice(
        state,
        source,
        {
          kind: "option",
          side: "friendly",
          prompt: source.effectId === "discover_relic_self" ? "Discover 1 of 3 Ascension Relics" : "Choose 1 of 3 Ascension Relics",
          values: relicsInDeck(state, library).slice(0, 3).map((relic) => ({ label: relic.name, value: relic.id })),
        },
        library,
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
      return false;
    }

    const relic = takeRelicFromDeckToHand(state, source.owner, chosen.option.value, library, events);
    if (relic) {
      events.push(effectEvent(`${label} claims ${relic.name}.`, source));
    }
    return false;
  }

  if (source.effectId === "frieren_relic_discover") {
    if (chosen?.kind !== "option") {
      const next = requestChoice(
        state,
        source,
        {
          kind: "option",
          side: "friendly",
          prompt: "Discover 1 of 3 Ascension Relics",
          values: relicsInDeck(state, library).slice(0, 3).map((relic) => ({ label: relic.name, value: relic.id })),
        },
        library,
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
      return false;
    }

    const relic = takeRelicFromDeckToHand(state, source.owner, chosen.option.value, library, events);
    if (relic) events.push(effectEvent(`${source.name} discovers ${relic.name}.`, source));
    return false;
  }

  // Morpheus pauses twice: the pill chooses Good or Evil, then the chosen
  // alignment offers three random minions from the shared deck to draw.
  if (source.effectId === "morpheus_choice") {
    if (!chosen || chosen.kind !== "option") {
      const pill = requestChoice(state, source, TARGETED_EFFECTS.morpheus_choice!, library);
      if (pill === "asked") return true;
      if (!pill || pill.kind !== "option") return false;
      return runEffect(state, source, sourceSlot, library, events, pill);
    }

    const alignment = chosen.option.value === "good" ? "Good" : chosen.option.value === "evil" ? "Evil" : null;
    if (alignment) {
      const offers = discoverAlignmentMinions(state, alignment, library);
      if (offers.length === 0) {
        events.push(effectEvent(`${label} finds no ${alignment} minion in the deck.`, source));
        return false;
      }
      const cardChoice = requestChoice(
        state,
        source,
        {
          kind: "option",
          side: "friendly",
          prompt: `Discover ${offers.length} ${alignment} minion${offers.length === 1 ? "" : "s"} from the deck`,
          values: offers.map((card) => ({ label: card.name, value: card.id })),
        },
        library,
      );
      if (cardChoice === "asked") return true;
      if (!cardChoice || cardChoice.kind !== "option") return false;
      return runEffect(state, source, sourceSlot, library, events, cardChoice);
    }

    const card = library[chosen.option.value];
    if (!isMinionCard(card) || (card.alignment !== "Good" && card.alignment !== "Evil")) return false;
    if (!removeCardFromDrawPile(state, card.id)) return false;
    putCardInHand(state, source.owner, card.id, events);
    events.push(effectEvent(`${label} draws ${card.name} from the deck.`, source));
    return false;
  }

  // Voldemort still draws two when there are no cards available to discard.
  if (source.effectId === "discard_draw_2" && player.hand.length === 0) {
    drawDirect(state, source.owner, 2, events);
    events.push(effectEvent(`${label} draws two cards.`, source));
    return false;
  }

  // Batman resolves in two prompts: first the victim, then the gadget to use.
  // Keeping the victim in priorOptions makes the second prompt save/undo safe.
  if (source.effectId === "batman_gadget_choice") {
    if (chosen?.kind === "option") {
      const targetRef = chosen.priorOptions?.[0];
      const target = targetRef ? state.players[targetRef.owner].board[targetRef.slot] : null;
      if (!target) return false;
      if (chosen.option.value === "freeze") {
        applyFreeze(state, source, target, events);
      } else if (chosen.option.value === "silence") {
        if (!isSlotProtected(state, target) && canDisable(state, source.owner, target, "silence")) {
          applySilence(target);
          events.push(effectEvent(`${label} silences ${target.name}.`, source));
        }
      } else if (chosen.option.value === "weaken") {
        target.atk = Math.max(0, target.atk - 3);
        events.push(effectEvent(`${label} gives ${target.name} -3 ATK.`, source));
      }
      return false;
    }
    const first = chosen?.kind === "board"
      ? chosen
      : requestChoice(state, source, { side: "enemy", prompt: "Choose an enemy minion for Batman" }, library);
    if (first === "asked") return true;
    if (!first || first.kind !== "board") return false;
    const gadget = requestChoice(
      state,
      source,
      {
        kind: "option",
        side: "friendly",
        prompt: "Choose a gadget",
        values: [
          { label: "Freeze it", value: "freeze" },
          { label: "Silence it", value: "silence" },
          { label: "Give it -3 ATK", value: "weaken" },
        ],
      },
      library,
      1,
      [first.target],
    );
    if (gadget === "asked") return true;
    if (gadget) return runEffect(state, source, sourceSlot, library, events, gadget);
    return false;
  }

  // Targeted effects resolve against picked / pickedHand / pickedValue.
  let picked: MinionInstance | null = null;
  let pickedSlot: TargetOption | null = null;
  let pickedHand: HandOption | null = null;
  let pickedValue: string | null = null;
  let pickedCoreOwner: PlayerId | null = null;
  const spec = TARGETED_EFFECTS[source.effectId];
  if (spec) {
    const answer = chosen ?? requestChoice(state, source, spec, library);
    if (answer === "asked") return true;
    if (answer === null) return false;
    if (answer.kind === "board") {
      pickedSlot = answer.target;
      picked = state.players[answer.target.owner].board[answer.target.slot] ?? null;
    } else if (answer.kind === "hand") pickedHand = answer.hand;
    else if (answer.kind === "core") pickedCoreOwner = answer.owner;
    else pickedValue = answer.option.value;
    // Slot answers share the board-option payload, so preserve the prompt's
    // semantic kind; every other stage can validate from its actual answer.
    const kind = spec.kind === "slot" ? "slot" : spec.kind === "boardOrCore" ? "boardOrCore" : answer.kind;
    if (kind === "board" && !picked) return false;
    if (kind === "slot" && !pickedSlot) return false;
    if (kind === "hand" && !pickedHand) return false;
    if (kind === "option" && pickedValue === null) return false;
    if (kind === "boardOrCore" && !picked && pickedCoreOwner === null) return false;
  }

  if (source.effectId === "chain_all_minions") {
    for (const side of state.players) {
      for (const minion of side.board) {
        if (
          minion &&
          minion.instanceId !== source.instanceId &&
          !isSlotProtected(state, minion) &&
          canDisable(state, source.owner, minion, "chain")
        ) {
          minion.chained = Math.max(minion.chained, 2);
        }
      }
    }
    events.push(effectEvent(`${label} chains all other minions.`, source));
    return false;
  } else if (source.effectId === "free_chained_shield") {
    let freed = 0;
    for (const minion of player.board) {
      if (!minion || minion.chained <= 0) continue;
      minion.chained = 0;
      resolveChainGrowth(minion, events);
      minion.sleeping = false;
      minion.attacksUsed = 0;
      minion.divineShield = true;
      freed += 1;
    }
    events.push(effectEvent(`${label} frees ${freed} Chained friendly minion${freed === 1 ? "" : "s"}.`, source));
    return false;
  } else if (source.effectId === "flowey_save_load") {
    source.savedCoreHealth = player.health;
    events.push(effectEvent(`${label} saves the core at ${player.health} HP.`, source));
    return false;
  } else if (source.effectId === "aladdin_wish") {
    if (pickedValue === "hero_shield") {
      player.heroDivineShield = true;
      events.push(effectEvent(`${label} gives ${player.name}'s core Divine Shield.`, source));
    } else if (pickedValue === "summon_3") {
      summonRandomCostFromDeck(state, source.owner, 3, library, events);
    } else if (pickedValue === "random_relic") {
      grantRandomRelic(state, source.owner, source, library, events);
    }
    return false;
  } else if (source.effectId === "rebirth_friendly_dead") {
    const deadMinions = player.deadMinions ?? [];
    const slot = player.board.findIndex((minion) => minion === null);
    const candidates = deadMinions.flatMap((cardId, index) => {
      const card = library[cardId];
      return isMinionCard(card) ? [{ cardId, index, card }] : [];
    });
    if (slot >= 0 && candidates.length > 0) {
      const chosen = candidates[rollInt(state, candidates.length)];
      if (!chosen) return false;
      deadMinions.splice(chosen.index, 1);
      const discardIndex = state.discard.indexOf(chosen.cardId);
      if (discardIndex >= 0) state.discard.splice(discardIndex, 1);
      const reborn = createMinion(chosen.card, source.owner, state);
      reborn.suppressArrivalTheme = true;
      player.board[slot] = reborn;
      events.push(effectEvent(`${label} Rebirths ${reborn.name}.`, source));
    }
    return false;
  } else if (source.effectId === "replace_same_cost_random") {
    if (picked && blockedByDominionAuthority(state, source, picked.owner)) {
      events.push(effectEvent(`${picked.name} is protected by Dominion Authority.`, picked));
    } else if (picked) {
      replaceWithRandomSameCost(state, picked, library, events);
    }
    return false;
  } else if (source.effectId === "weak_point_mark") {
    if (picked) {
      source.weakPointTargetId = picked.instanceId;
      source.weakPointReady = true;
      events.push(effectEvent(`${label} marks ${picked.name}'s weak point.`, source));
    }
    return false;
  } else if (source.effectId === "stasis_enemy") {
    if (picked && pickedSlot && !isUntargetable(state, picked)) {
      state.players[picked.owner].board[pickedSlot.slot] = null;
      (state.stasis ??= []).push({
        minion: picked,
        owner: picked.owner,
        slot: pickedSlot.slot,
        returnAtTurn: state.turnNumber + 2,
        sourceName: source.name,
      });
      events.push({
        kind: "effect",
        text: `${label} puts ${picked.name} into stasis for two turns.`,
        player: source.owner,
        instanceId: picked.instanceId,
        motion: "stasis",
      });
    } else if (picked) {
      events.push(effectEvent(`${picked.name} resists stasis.`, picked));
    }
    return false;
  } else if (source.effectId === "dark_dimension_banish") {
    if (picked && pickedSlot) {
      state.players[picked.owner].board[pickedSlot.slot] = null;
      (state.darkDimension ??= []).push({
        minion: picked,
        owner: picked.owner,
        slot: pickedSlot.slot,
        sourceInstanceId: source.instanceId,
        sourceName: source.name,
      });
      events.push({
        kind: "effect",
        text: `${label} banishes ${picked.name} to the Dark Dimension until ${source.name} dies.`,
        player: source.owner,
        instanceId: picked.instanceId,
        motion: "stasis",
      });
    }
    return false;
  } else if (source.effectId === "vader_chain_or_destroy") {
    if (picked && pickedSlot) {
      if (hasDumbledoreProtection(state, picked)) {
        events.push(effectEvent(`${picked.name} resists Darth Vader's chain.`, picked));
      } else if (!isSlotProtected(state, picked) && canDisable(state, source.owner, picked, "chain")) {
        picked.atk = 1;
        picked.chained = Math.max(picked.chained, 2);
        events.push(effectEvent(`${label} sets ${picked.name}'s ATK to 1 and chains it.`, source));
      } else {
        events.push(effectEvent(`${picked.name} resists Darth Vader's chain.`, picked));
      }
    }
    return false;
  }

  // Rimuru combines a one-shot sacrifice with a persistent growth effect.
  // It asks only when a legal victim exists; the ongoing half still attaches
  // when Tempest enters an otherwise empty board.
  if (source.effectId === "rimuru_tempest" && !chosen) {
    const next = requestChoice(state, source, { side: "any", prompt: "Destroy a minion and gain its stats" }, library);
    if (next === "asked") return true;
    if (next) return runEffect(state, source, sourceSlot, library, events, next);
  }

  if (source.effectId === "rimuru_tempest") {
    const target = chosen?.kind === "board" ? state.players[chosen.target.owner].board[chosen.target.slot] : null;
    if (target) {
      const gainedAtk = target.atk;
      const gainedHp = target.hp;
      destroyInstance(state, target.owner, target.instanceId, events, `${source.name} destroys ${target.name}`);
      buffMinion(source, gainedAtk, gainedHp);
      events.push(effectEvent(`${label} gains ${gainedAtk}/${gainedHp} from ${target.name}.`, source));
    }
    if (!source.gainedEffects.some((effect) => effect.effectId === "rimuru_tempest_growth")) {
      source.gainedEffects.push({ effectId: "rimuru_tempest_growth", timing: "ongoing", text: "Ongoing: Gain +1/+1" });
    }
    source.effectId = "none";
    source.effectTiming = "ongoing";
  } else if (source.effectId === "copy_minion_effects") {
    if (picked) copyMinionEffects(source, picked, events);
  } else if (source.effectId === "neutral_double_atk_hp_1") {
    if (picked) {
      picked.atk *= 2;
      picked.maxHp = 1;
      picked.hp = 1;
      events.push(effectEvent(`${label} doubles ${picked.name}'s ATK and leaves it at 1 HP.`, source));
    }
  } else if (source.effectId === "strange_duel") {
    const canChainSource = !isSlotProtected(state, source) && canDisable(state, source.owner, source, "chain");
    const canChainTarget = Boolean(
      picked &&
      !isSlotProtected(state, picked) &&
      canDisable(state, source.owner, picked, "chain"),
    );
    if (picked && canChainSource && canChainTarget) {
      const until = state.turnNumber + 2;
      source.chained = Math.max(source.chained, 2);
      picked.chained = Math.max(picked.chained, 2);
      source.untargetableUntilTurn = until;
      picked.untargetableUntilTurn = until;
      events.push(effectEvent(`${label} chains itself to ${picked.name} for two turns.`, source));
    } else if (picked) {
      events.push(effectEvent(`${picked.name} resists Doctor Strange's chain.`, picked));
    }
  } else if (source.effectId === "strange_bargain") {
    const opponentPlayer = state.players[opponent(source.owner)];
    if (pickedValue === "core_hp") {
      opponentPlayer.health -= 10;
      events.push(effectEvent(`${label} costs ${opponentPlayer.name} 10 Core HP.`, source));
    } else if (pickedValue === "random_minion") {
      destroyRandomMinion(state, opponentPlayer.id, events, `${source.name}'s bargain claims a random minion`);
    } else if (pickedValue === "mana") {
      opponentPlayer.manaPenaltyNextTurn = Math.max(opponentPlayer.manaPenaltyNextTurn ?? 0, 5);
      events.push(effectEvent(`${label} removes 5 mana from ${opponentPlayer.name}'s next turn.`, source));
    }
  } else if (source.effectId === "death_star_mark") {
    source.attacksUsed = maxAttacks(source);
    if (pickedCoreOwner !== null) {
      source.deathStarTarget = { kind: "core", owner: pickedCoreOwner, resolveAtTurn: state.turnNumber + 2 };
      events.push(effectEvent(`${label} marks the enemy core.`, source));
    } else if (picked) {
      source.deathStarTarget = {
        kind: "minion",
        owner: picked.owner,
        instanceId: picked.instanceId,
        resolveAtTurn: state.turnNumber + 2,
      };
      events.push(effectEvent(`${label} marks ${picked.name}.`, source));
    }
  } else if (source.effectId === "knov_pocket_room") {
    const firstChoice = chosen?.priorOptions?.[0] ?? pickedSlot;
    if ((chosen?.step ?? 0) === 0) {
      if (!firstChoice) return false;
      const next = requestChoice(
        state,
        source,
        { side: "enemy", prompt: "Choose an enemy minion for the pocket room" },
        library,
        1,
        [firstChoice],
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
      return false;
    }
    const enemyChoice = pickedSlot;
    if (firstChoice && enemyChoice) {
      const friendly = state.players[firstChoice.owner].board[firstChoice.slot];
      const enemyMinion = state.players[enemyChoice.owner].board[enemyChoice.slot];
      // The two picks must be DIFFERENT minions. Under random play they can both
      // resolve to the same one, and the release below then puts a single
      // instance into two slots — the `instance <id> is on the board twice`
      // breach the balance gate reported on 18 August 2026. Replay it with
      // `npx tsx scripts/find-duplicate-instance.mts sim-fuzz-46 random,bot`.
      // The printed rule is "a friendly and an enemy", so one minion is never a
      // legal room. Refusing costs the controller the Battlecry and leaves the
      // board untouched, which is far better than a corrupt duel.
      const sameMinion = Boolean(friendly && enemyMinion && friendly.instanceId === enemyMinion.instanceId);
      if (sameMinion) {
        events.push(effectEvent(`${label} cannot open a pocket room around a single minion.`, source));
      }
      if (friendly && enemyMinion && !sameMinion) {
        state.players[friendly.owner].board[firstChoice.slot] = null;
        state.players[enemyMinion.owner].board[enemyChoice.slot] = null;
        (state.pocketRooms ??= []).push({
          owner: source.owner,
          friendly,
          friendlySlot: firstChoice.slot,
          enemy: enemyMinion,
          enemySlot: enemyChoice.slot,
          // turnNumber advances once at the start of each player's turn. Two
          // full turns therefore span four counter increments, not two.
          returnAtTurn: state.turnNumber + 4,
        });
        events.push(effectEvent(`${label} opens a pocket room for ${friendly.name} and ${enemyMinion.name}.`, source));
      }
    }
  } else if (source.effectId === "meleoron_protect_ally") {
    if (picked) {
      picked.protectedByMeleoron = source.instanceId;
      events.push(effectEvent(`${label} hides ${picked.name} from every target.`, source));
    }
  } else if (source.effectId === "mob_ascend") {
    const allies = friendlyOthers(player, source);
    if (allies.length >= 3) {
      returnMinionsToHand(state, player.id, allies, events);
      source.atk = 12;
      source.maxHp = 12;
      source.hp = 12;
      events.push(effectEvent(`${label} releases its power and ascends to 12/12.`, source));
    }
  } else if (source.effectId === "random_attacks_next_turn") {
    for (const side of state.players) {
      side.randomAttacksFromTurn = state.turnNumber + 1;
      side.randomAttacksUntilTurn = state.turnNumber + 1;
    }
    events.push(effectEvent(`${label} fills the next turn with random attacks.`, source));
  } else if (source.effectId === "rick_return_all") {
    returnAllMinionsToHand(state, events, source.instanceId, source.owner);
    events.push(effectEvent(`${label} sends every other minion back to its owner's hand.`, source));
  } else if (source.effectId === "ainz_skeleton_army") {
    summonSkeletons(state, source, events);
  } else if (source.effectId === "summon_sins") {
    summonSins(state, source, events);
  } else if (source.effectId === "naruto_shadow_clones") {
    summonShadowClones(state, source, events);
  } else if (source.effectId === "star_destroyer_tie_fighters") {
    summonTieFighters(state, source, events);
  } else if (source.effectId === "chaos_random_summon") {
    summonRandomMinionFromDeck(state, source, library, events);
  } else if (source.effectId === "heroic_relics") {
    grantRandomRelicsToBoard(state, source, library, events);
  } else if (source.effectId === "equip_random_relic") {
    equipRandomRelic(state, source, library, events);
  } else if (source.effectId === "draw_card") {
    drawDirect(state, source.owner, 1, events);
    events.push(effectEvent(`${label} draws a card.`, source));
  } else if (source.effectId === "draw_relic") {
    // A random relic, not a choice. Gol D. Roger and Indiana Jones already offer
    // the pick-one-of-three version, and the house spirit is not a treasure
    // hunter — it turns up with something useful and no ceremony.
    //
    // The randomness runs through the seeded RNG like everything else, never
    // Math.random, so a duel replays identically from its seed.
    const available = relicsInDeck(state, library);
    if (available.length) {
      const choice = available[Math.floor(nextRandom(state) * available.length) % available.length];
      const relic = takeRelicFromDeckToHand(state, source.owner, choice.id, library, events);
      if (relic) events.push(effectEvent(`${label} turns up ${relic.name}.`, source));
    } else {
      events.push(effectEvent(`${label} finds no relic left.`, source));
    }
  } else if (source.effectId === "freeze_two") {
    const firstChoice = chosen?.priorOptions?.[0] ?? pickedSlot;
    if (!firstChoice) return false;
    if ((chosen?.step ?? 0) === 0) {
      const first = state.players[firstChoice.owner].board[firstChoice.slot];
      const nextSpec: TargetSpec = {
        side: "enemy",
        prompt: "Choose the second enemy minion to Freeze",
        filter: (minion) => minion.instanceId !== first?.instanceId,
      };
      const next = requestChoice(state, source, nextSpec, library, 1, [firstChoice]);
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    const choices = [...(chosen?.priorOptions ?? []), ...(pickedSlot ? [pickedSlot] : [])];
    for (const choice of choices) {
      const target = state.players[choice.owner].board[choice.slot];
      if (target) applyFreeze(state, source, target, events);
    }
  } else if (source.effectId === "deal_enemy_core") {
    if (dealCoreDamage(state, enemyId, 2, events)) {
      events.push(effectEvent(`${label} deals 2 to the enemy core.`, source));
    }
  } else if (source.effectId === "heal_self") {
    source.hp = Math.min(source.maxHp, source.hp + 3);
    events.push(effectEvent(`${label} heals 3 HP.`, source));
  } else if (source.effectId === "aoe_damage_3") {
    damageAllEnemies(state, source, 3, events);
  } else if (source.effectId === "time_bomb_destroy_all") {
    for (const owner of [0, 1] as PlayerId[]) {
      for (let slot = 0; slot < boardSize; slot += 1) {
        if (state.players[owner].board[slot]) {
          destroyAtSlot(state, owner, slot, events, `${source.name} destroys all minions`, null, false);
        }
      }
    }
    events.push(effectEvent(`${label} destroys ALL minions.`, source));
  } else if (source.effectId === "aoe_damage_2") {
    damageAllEnemies(state, source, 2, events);
  } else if (source.effectId === "harmony_buff") {
    // Camps only, down from camps PLUS alignments (balance pass). Counting both
    // scaled to +6/+6 a turn on a 6-mana body, for 67%. ALL is a fourth camp
    // category, so a board containing it can legitimately reach four distinct
    // camp labels while still rewarding a genuinely varied board.
    const camps = new Set([...player.board, ...enemy.board].filter(Boolean).map((minion) => minion!.camp));
    buffMinion(source, camps.size, camps.size);
    events.push(effectEvent(`${label} harmonizes for +${camps.size}/+${camps.size}.`, source));
  } else if (source.effectId === "evil_invulnerable") {
    const target = picked ?? firstFriendlyByAlignment(player, "Evil") ?? source;
    target.invulnerableUntilTurn = state.turnNumber + 2;
    events.push(effectEvent(`${label} makes ${target.name} Invulnerable.`, source));
  } else if (source.effectId === "set_attack_1") {
    const target = picked;
    if (target) {
      target.atk = 1;
      events.push(effectEvent(`${label} sets ${target.name}'s ATK to 1.`, source));
    }
  } else if (source.effectId === "gain_divine_shield") {
    source.divineShield = true;
    events.push(effectEvent(`${label} gains Divine Shield.`, source));
  } else if (source.effectId === "absorb_left_stats") {
    const left = player.board[sourceSlot - 1];
    if (left) {
      buffMinion(source, left.atk, left.hp);
      events.push(effectEvent(`${label} absorbs ${left.name}'s stats.`, source));
    }
  } else if (source.effectId === "damaged_self_buff") {
    if (source.hp < source.maxHp) {
      buffMinion(source, 2, 2);
      const ally = player.board.find((minion) => minion && minion.instanceId !== source.instanceId);
      if (ally) buffMinion(ally, 2, 2);
      events.push(effectEvent(`${label} turns damage into power.`, source));
    }
  } else if (source.effectId === "gain_relic") {
    grantRelic(state, source.owner, source, events);
  } else if (source.effectId === "destroy_weakest") {
    destroyEnemyByPredicate(state, source, enemyId, () => true, "destroys the weakest enemy", events, "atk");
  } else if (source.effectId === "kill_random_enemy") {
    destroyRandomEnemyByPredicate(state, source, () => true, "kills a random enemy", events);
  } else if (source.effectId === "light_yagami_nature_kill") {
    destroyRandomEnemyByPredicate(
      state,
      source,
      (minion) => minion.camp === "Nature",
      "destroys a random Nature enemy minion",
      events,
    );
  } else if (source.effectId === "anti_good_grow") {
    const count = enemy.board.filter((minion) => minion?.alignment === "Good").length;
    if (count > 0) {
      // +2/+2 per Good enemy, down from +3/+2 (pass 4): 60.3% vs a 45.4%
      // bracket. This is a COMPOUNDING engine, not a recalculated aura — every
      // turn's growth is added permanently and survives the Good minions dying.
      // Good is ~35% of the roster, so a full enemy board averaged +5/+3 a turn,
      // for ever, on a card whose body is far below its tier.
      buffMinion(source, count * 2, count * 2);
      events.push(effectEvent(`${label} grows against Good enemies.`, source));
    }
  } else if (source.effectId === "protect_slot") {
    if (pickedSlot) layAura(state, pickedSlot, "slot_protected", source, events);
  } else if (source.effectId === "snap_balance") {
    destroyRandomMinion(state, source.owner, events, `${label} balances your board`);
    destroyRandomMinion(state, enemyId, events, `${label} balances the enemy board`);
    discardRandom(state, source.owner, events);
    discardRandom(state, enemyId, events);
  } else if (source.effectId === "destroy_small_good") {
    destroyRandomEnemyByPredicate(
      state,
      source,
      (minion) => minion.alignment === "Good" && minion.hp < 3,
      "destroys a random small Good enemy",
      events,
    );
  } else if (source.effectId === "no_evil_buff") {
    const anyEvil = [...player.board, ...enemy.board].some((minion) => minion?.alignment === "Evil");
    if (!anyEvil) {
      buffMinion(source, 3, 3);
      events.push(effectEvent(`${label} stands unopposed by Evil.`, source));
    }
  } else if (source.effectId === "destroy_small_neutral") {
    destroyRandomEnemyByPredicate(
      state,
      source,
      (minion) => minion.alignment === "Neutral" && minion.hp < 3,
      "destroys a random small Neutral enemy",
      events,
    );
  } else if (source.effectId === "summon_chained") {
    summonFromHand(state, source.owner, library, events, "Neutral");
  } else if (source.effectId === "avengers_recruit_good") {
    summonRandomGoodFromDeck(state, source, library, events);
  } else if (source.effectId === "delayed_destroy") {
    const target = picked;
    if (target) {
      if (target.delayedDestroySource === source.instanceId) {
        destroyInstance(state, enemyId, target.instanceId, events, `${label} completes the contract`);
      } else {
        target.delayedDestroySource = source.instanceId;
        events.push(effectEvent(`${label} marks ${target.name}.`, source));
      }
    }
  } else if (source.effectId === "freeze_and_weaken") {
    const target = picked;
    if (target) {
      applyFreeze(state, source, target, events);
      target.atk = Math.ceil(target.atk / 2);
      events.push(effectEvent(`${label} halves ${target.name}'s ATK.`, source));
    }
  } else if (source.effectId === "tech_buff") {
    const target = picked;
    if (target) {
      // +1/+1, down from +2/+2 (balance pass): every turn, forever, aimed wherever
      // it does most good was worth 76% on a 4-mana body.
      buffMinion(target, 1, 1);
      events.push(effectEvent(`${label} upgrades ${target.name}.`, source));
    }
  } else if (source.effectId === "reveal_hand") {
    // Now genuinely reveals: a random card is NAMED in the log, which in a
    // hotseat game is real information. It used to only say "reveals a card".
    if (enemy.hand.length === 0) {
      events.push(effectEvent(`${label} finds an empty enemy hand.`, source));
    } else {
      const cardId = enemy.hand[rollInt(state, enemy.hand.length)];
      const name = library[cardId]?.name ?? "an unknown card";
      events.push(effectEvent(`${label} reveals ${name} in the enemy hand.`, source));
    }
  } else if (source.effectId === "set_hp_1") {
    const target = picked;
    if (target) {
      target.hp = 1;
      events.push(effectEvent(`${label} sets ${target.name}'s HP to 1.`, source));
    }
  } else if (source.effectId === "set_all_enemy_hp_1") {
    let affected = 0;
    for (const minion of enemy.board) {
      if (!minion) continue;
      minion.hp = 1;
      affected += 1;
    }
    events.push(effectEvent(`${label} sets ${affected} enemy minion${affected === 1 ? "'s" : "s'"} HP to 1.`, source));
  } else if (source.effectId === "discover_random_keyword_minion") {
    drawRandomKeywordMinion(state, source, library, events);
  } else if (source.effectId === "copy_minion_to_hand") {
    if (picked) {
      const card = library[picked.cardId];
      if (isMinionCard(card)) {
        putCardInHand(state, source.owner, card.id, events);
        events.push(effectEvent(`${label} puts a copy of ${picked.name} into your hand.`, source));
      }
    }
  } else if (source.effectId === "lone_evil_buff") {
    const evilCount = player.board.filter((minion) => minion?.alignment === "Evil").length;
    if (evilCount === 1) {
      // +1/+1, down from +2/+2 (pass 3) and +3/+3 before that: still 59.8% vs a
      // 48.8% bracket. The "only Evil minion" condition keeps reading as
      // restrictive and keeps not being — it simply holds most turns.
      buffMinion(source, 1, 1);
      events.push(effectEvent(`${label} rules alone.`, source));
    }
  } else if (source.effectId === "pressure_hand" || source.effectId === "hand_shuffle") {
    discardRandom(state, enemyId, events);
    events.push(effectEvent(`${label} pressures the enemy hand.`, source));
  } else if (source.effectId === "copy_passive") {
    const copied: string[] = [];
    for (const donor of player.board) {
      if (!donor || donor.instanceId === source.instanceId || donor.silenced) continue;
      const effect = persistentEffects(donor).find(
        (candidate) => !source.gainedEffects.some((existing) => existing.effectId === candidate.effectId),
      );
      if (!effect) continue;
      source.gainedEffects.push({ ...effect });
      copied.push(donor.name);
      break;
    }
    for (const donor of enemy.board) {
      if (!donor || donor.silenced) continue;
      const effect = persistentEffects(donor).find(
        (candidate) => !source.gainedEffects.some((existing) => existing.effectId === candidate.effectId),
      );
      if (!effect) continue;
      source.gainedEffects.push({ ...effect });
      copied.push(donor.name);
      break;
    }
    events.push(effectEvent(`${label} copies ${copied.length} persistent effects.`, source));
  } else if (source.effectId === "rimuru_tempest_growth") {
    buffMinion(source, 1, 1);
    events.push(effectEvent(`${label} grows +1/+1.`, source));
  } else if (source.effectId === "self_buff_2") {
    buffMinion(source, 2, 2);
    events.push(effectEvent(`${label} grows +2/+2.`, source));
  } else if (source.effectId === "yoda_lowest_atk_buff") {
    const target = player.board
      .filter((minion): minion is MinionInstance => Boolean(minion))
      .sort((left, right) => left.atk - right.atk || left.playOrder - right.playOrder)[0];
    if (target) {
      buffMinion(target, 2, 2);
      events.push(effectEvent(`${label} empowers ${target.name}, the lowest-ATK ally.`, source));
    }
  } else if (source.effectId === "self_atk_3") {
    source.atk += 3;
    events.push(effectEvent(`${label} gains +3 ATK.`, source));
  } else if (source.effectId === "heal_5") {
    source.hp = Math.min(source.maxHp, source.hp + 5);
    events.push(effectEvent(`${label} heals 5 HP.`, source));
  } else if (source.effectId === "heal_all_friendly_full" || source.effectId === "avatar_aang_awakened") {
    for (const minion of player.board) if (minion) minion.hp = minion.maxHp;
    events.push(effectEvent(`${label} restores all friendly minions.`, source));
  } else if (source.effectId === "discover_tech_card") {
    const card = pickedValue ? library[pickedValue] : undefined;
    if (pickedValue && isMinionCard(card) && card.camp === "Tech" && removeCardFromDrawPile(state, pickedValue)) {
      putCardInHand(state, source.owner, pickedValue, events);
      events.push(effectEvent(`${label} draws ${card.name}.`, source));
    }
  } else if (source.effectId === "heal_self_full") {
    source.hp = source.maxHp;
    events.push(effectEvent(`${label} fully heals itself.`, source));
  } else if (source.effectId === "heal_ally_full" || source.effectId === "heal_good_ally_full") {
    const target = picked;
    if (target) {
      target.hp = target.maxHp;
      events.push(effectEvent(`${label} restores ${target.name}.`, source));
    }
  } else if (source.effectId === "aoe_all_1") {
    damageAllOther(state, source, 1, events);
  } else if (source.effectId === "aoe_all_2") {
    damageAllOther(state, source, 2, events);
  } else if (source.effectId === "aoe_all_4") {
    damageAllOther(state, source, 4, events);
  } else if (source.effectId === "aoe_all_3") {
    damageAllOther(state, source, 3, events);
  } else if (source.effectId === "damage_evil_enemy_4" || source.effectId === "damage_magic_enemy_2") {
    const amount = source.effectId === "damage_evil_enemy_4" ? 4 : 2;
    const slot = slotOf(state, picked);
    if (picked && slot >= 0) dealMinionDamage(state, picked.owner, slot, amount, source, events, true);
  } else if (source.effectId === "destroy_small_4") {
    destroyPicked(state, source, picked, "destroys a weak enemy", events);
  } else if (source.effectId === "destroy_enemy") {
    destroyPicked(state, source, picked, "destroys", events);
  } else if (source.effectId === "destroy_enemy_taunt") {
    destroyPicked(state, source, picked, "destroys", events);
  } else if (source.effectId === "destroy_and_gain_stats") {
    if (picked) {
      const gainedAtk = picked.atk;
      const gainedHp = picked.hp;
      destroyInstance(state, picked.owner, picked.instanceId, events, `${source.name} destroys ${picked.name}`);
      buffMinion(source, gainedAtk, gainedHp);
      events.push(effectEvent(`${label} gains ${gainedAtk}/${gainedHp} from ${picked.name}.`, source));
    }
  } else if (source.effectId === "godrick_graft") {
    if (picked) {
      const gainedAtk = picked.atk;
      const gainedHp = picked.hp;
      const gainedEffects = copyPersistentMinionTraits(source, picked);
      destroyInstance(state, picked.owner, picked.instanceId, events, `${source.name} kills ${picked.name} for grafting`);
      buffMinion(source, gainedAtk, gainedHp);
      source.effectId = "none";
      source.effectTiming = source.gainedEffects.some((effect) => effect.timing === "ongoing")
        ? "ongoing"
        : source.gainedEffects.some((effect) => effect.timing === "passive")
          ? "passive"
          : "none";
      events.push(
        effectEvent(
          `${label} gains ${gainedAtk}/${gainedHp}${gainedEffects ? " and the minion's effects" : ""}.`,
          source,
        ),
      );
    }
  } else if (source.effectId === "destroy_all_small") {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = enemy.board[slot];
      if (minion && minion.hp <= 2 && enemyTargetable(state, minion)) {
        destroyAtSlot(state, enemyId, slot, events, `${source.name} crushes ${minion.name}`);
      }
    }
  } else if (source.effectId === "destroy_damaged_enemy") {
    destroyPicked(state, source, picked, "destroys a wounded enemy", events);
  } else if (source.effectId === "destroy_all_damaged_enemies") {
    let destroyed = 0;
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = enemy.board[slot];
      if (!minion || minion.hp >= minion.maxHp || !enemyTargetable(state, minion)) continue;
      destroyAtSlot(state, enemyId, slot, events, `${source.name} kills ${minion.name}`);
      destroyed += 1;
    }
    if (destroyed > 0) events.push(effectEvent(`${label} kills all damaged enemy minions.`, source));
  } else if (source.effectId === "devour_small") {
    const slot = slotOf(state, picked);
    if (picked && slot >= 0) {
      const prey = picked;
      buffMinion(source, prey.atk, prey.hp);
      destroyAtSlot(state, prey.owner, slot, events, `${source.name} devours ${prey.name}`);
    }
  } else if (source.effectId === "consume_tech_4_hp" || source.effectId === "consume_nature_4_hp") {
    if (picked) consumeEnemyMinion(state, source, picked, events);
  } else if (source.effectId === "devour_friendly") {
    const prey = picked;
    if (prey) {
      buffMinion(source, prey.atk, prey.hp);
      destroyInstance(state, source.owner, prey.instanceId, events, `${source.name} consumes ${prey.name}`);
    }
  } else if (source.effectId === "chain_damage") {
    if (!pickedSlot) return false;
    if ((chosen?.step ?? 0) === 0) {
      const firstInstance = picked?.instanceId;
      dealMinionDamage(state, pickedSlot.owner, pickedSlot.slot, 1, source, events, true);
      const killed =
        firstInstance !== undefined &&
        !state.players.some((side) => side.board.some((minion) => minion?.instanceId === firstInstance));
      if (killed) {
        const next = requestChoice(
          state,
          source,
          { side: "enemy", prompt: "Choose another enemy minion to take 3 damage" },
          library,
          1,
          [pickedSlot],
        );
        if (next === "asked") return true;
        if (next) return runEffect(state, source, sourceSlot, library, events, next);
      }
    } else if (picked) {
      dealMinionDamage(state, pickedSlot.owner, pickedSlot.slot, 3, source, events, true);
    }
  } else if (source.effectId === "reduce_atk_3") {
    const target = picked;
    if (target) {
      target.atk = Math.max(0, target.atk - 3);
      events.push(effectEvent(`${label} weakens ${target.name}.`, source));
    }
  } else if (source.effectId === "freeze_enemy") {
    if (picked) applyFreeze(state, source, picked, events);
  } else if (source.effectId === "freeze_and_silence_enemy") {
    if (picked && !isSlotProtected(state, picked)) {
      const canFreeze = canDisable(state, source.owner, picked, "freeze");
      const canSilence = canDisable(state, source.owner, picked, "silence");
      if (canFreeze) {
        picked.frozen = true;
        picked.attacksUsed = maxAttacks(picked);
      }
      if (canSilence) applySilence(picked);
      if (canFreeze || canSilence) {
        const statuses = [canFreeze ? "freezes" : "", canSilence ? "silences" : ""].filter(Boolean).join(" and ");
        events.push(effectEvent(`${label} ${statuses} ${picked.name}.`, source));
      } else {
        events.push(effectEvent(`${picked.name} resists Kiritsugu's effect.`, picked));
      }
    } else if (picked) {
      events.push(effectEvent(`${picked.name} resists Kiritsugu's effect.`, picked));
    }
  } else if (source.effectId === "freeze_or_kill") {
    if (picked) {
      if (picked.frozen) destroyPicked(state, source, picked, "kills", events);
      else applyFreeze(state, source, picked, events);
    }
  } else if (source.effectId === "freeze_all") {
    for (const playerId of [0, 1] as PlayerId[]) {
      for (const minion of state.players[playerId].board) {
        if (minion && minion.instanceId !== source.instanceId) applyFreeze(state, source, minion, events);
      }
    }
  } else if (source.effectId === "freeze_all_enemies") {
    for (const minion of enemy.board) {
      if (minion) applyFreeze(state, source, minion, events);
    }
  } else if (source.effectId === "lunar_slime") {
    const target = randomEnemyMinion(state, source);
    if (target) transformIntoLunarSlime(state, source, target, events);
  } else if (source.effectId === "silence_enemy") {
    if (picked && !isSlotProtected(state, picked) && canDisable(state, source.owner, picked, "silence")) {
      applySilence(picked);
      events.push(effectEvent(`${source.name} silences ${picked.name}.`, source));
    }
  } else if (
    source.effectId === "buff_good_ally_3" ||
    source.effectId === "buff_magic_ally_3" ||
    source.effectId === "buff_evil_ally_2" ||
    source.effectId === "buff_neutral_tech_ally_2" ||
    source.effectId === "buff_good_tech_ally_2"
  ) {
    const amount = source.effectId === "buff_magic_ally_3" ? 3 : 2;
    if (picked) {
      buffMinion(picked, amount, amount);
      events.push(effectEvent(`${label} empowers ${picked.name}.`, source));
    }
  } else if (source.effectId === "buff_all_good_2") {
    buffAllAllies(player, source, (minion) => minion.alignment === "Good", 2, 2, true);
    events.push(effectEvent(`${label} empowers all Good allies.`, source));
  } else if (source.effectId === "buff_evil_ally_3_2_heal") {
    const target = picked;
    if (target) {
      // +2/+1, down from +3/+2 AND the full heal (balance pass 3): 59.2% vs a
      // 48.2% bracket. The heal was the hidden half — it refreshed an
      // ever-growing minion every turn, so chip damage never stuck.
      buffMinion(target, 2, 1);
      events.push(effectEvent(`${label} empowers ${target.name}.`, source));
    }
    // The three alignment anthems no longer buff THEMSELVES (balance pass 3).
    // All three measured 16-18 points above the cost-1 bracket, the largest
    // cluster in the roster, and they were each a growing body as well as an
    // anthem. They stay anthems; they stop being beaters.
  } else if (source.effectId === "buff_all_evil_1") {
    buffAllAllies(player, source, (minion) => minion.alignment === "Evil", 1, 1, false);
    events.push(effectEvent(`${label} rallies the Evil.`, source));
  } else if (source.effectId === "buff_all_neutral_1") {
    buffAllAllies(player, source, (minion) => minion.alignment === "Neutral", 1, 1, false);
    events.push(effectEvent(`${label} rallies the Neutral.`, source));
  } else if (source.effectId === "buff_all_magic_2_1") {
    buffAllAllies(player, source, (minion) => receivesCampBuff(minion, "Magic"), 2, 1, false);
    events.push(effectEvent(`${label} empowers Magic allies.`, source));
  } else if (source.effectId === "buff_all_tech_2_1") {
    buffAllAllies(player, source, (minion) => receivesCampBuff(minion, "Tech"), 2, 1, false);
    events.push(effectEvent(`${label} empowers Tech allies.`, source));
  } else if (source.effectId === "evil_count_buff") {
    const count = friendlyOthers(player, source).filter((minion) => minion.alignment === "Evil").length;
    if (count > 0) {
      buffMinion(source, count, count);
      events.push(effectEvent(`${label} feeds on ${count} Evil.`, source));
    }
  } else if (source.effectId === "give_shield_ally") {
    const target = picked;
    if (target) {
      target.divineShield = true;
      if (!target.gainedEffects.some((effect) => effect.text === "Passive: Divine Shield.")) {
        target.gainedEffects.push({ effectId: "none", timing: "passive", text: "Passive: Divine Shield." });
      }
      events.push(effectEvent(`${label} shields ${target.name}.`, source));
    }
  } else if (source.effectId === "give_dodge_50") {
    if (picked && !hasEffect(picked, "dodge_50")) {
      picked.gainedEffects.push({ effectId: "dodge_50", timing: "passive", text: "Passive: Evades 50% of incoming attacks." });
      events.push(effectEvent(`${label} gives ${picked.name} 50% evasion.`, source));
    }
  } else if (source.effectId === "shield_all_friendly") {
    for (const minion of player.board) if (minion?.alignment === "Good") minion.divineShield = true;
    events.push(effectEvent(`${label} shields the Good.`, source));
  } else if (source.effectId === "shield_good_magic") {
    for (const minion of player.board) if (minion && (minion.alignment === "Good" || receivesCampBuff(minion, "Magic"))) minion.divineShield = true;
    events.push(effectEvent(`${label} shields the faithful.`, source));
  } else if (source.effectId === "evil_2_shield") {
    if (player.board.filter((minion) => minion?.alignment === "Evil").length >= 2) {
      source.divineShield = true;
      events.push(effectEvent(`${label} is shielded by the guard.`, source));
    }
  } else if (source.effectId === "restore_shield") {
    if (!source.divineShield) {
      source.divineShield = true;
      events.push(effectEvent(`${label} reforms its shield.`, source));
    }
  } else if (source.effectId === "damaged_ongoing_buff") {
    if (source.hp < source.maxHp) {
      buffMinion(source, 2, 2);
      events.push(effectEvent(`${label} rages for +2/+2.`, source));
    }
  } else if (source.effectId === "double_other_friendly_attack") {
    const allies = friendlyOthers(player, source);
    for (const ally of allies) ally.atk *= 2;
    events.push(effectEvent(`${label} doubles the ATK of ${allies.length} other friendly minion${allies.length === 1 ? "" : "s"}.`, source));
  } else if (source.effectId === "copy_ally_atk") {
    const allies = friendlyOthers(player, source);
    if (allies.length > 0) {
      const donor = allies[rollInt(state, allies.length)];
      source.atk += donor.atk;
      events.push(effectEvent(`${label} gains ${donor.atk} ATK from ${donor.name}.`, source));
    }
  } else if (source.effectId === "copy_ally_hp") {
    const best = Math.max(0, ...friendlyOthers(player, source).map((minion) => minion.maxHp));
    if (best > source.maxHp) {
      buffMinion(source, 0, best - source.maxHp);
      events.push(effectEvent(`${label} matches the toughest HP.`, source));
    }
  } else if (source.effectId === "steal_random") {
    stealCard(state, source, enemy, (hand) => (hand.length ? rollInt(state, hand.length) : -1), events);
  } else if (source.effectId === "steal_chosen" || source.effectId === "steal_hand_relic") {
    if (pickedHand) stealCard(state, source, enemy, () => pickedHand.index, events);
  } else if (source.effectId === "steal_costliest") {
    stealCard(state, source, enemy, (hand) => costliestIndex(hand, library), events);
  } else if (source.effectId === "reshuffle_hand") {
    const count = player.hand.length;
    if (count > 0) {
      state.bottomDeck.push(...player.hand.splice(0));
      drawDirect(state, source.owner, count, events);
      events.push(effectEvent(`${label} recycles ${count} cards.`, source));
    }
  } else if (source.effectId === "discard_draw_2") {
    if (!pickedHand) return false;
    if ((chosen?.step ?? 0) === 0) {
      const next = requestChoice(
        state,
        source,
        {
          kind: "hand",
          side: "friendly",
          prompt: "Choose the second card to discard",
          handFilter: (_card, index) => index !== pickedHand.index,
        },
        library,
        1,
        [],
        [pickedHand],
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    const discards = [...(chosen?.priorHandOptions ?? []), pickedHand]
      .map((option) => option.index)
      .filter((index, position, all) => all.indexOf(index) === position)
      .sort((left, right) => right - left);
    for (const index of discards) {
      const [cardId] = player.hand.splice(index, 1);
      if (cardId) state.discard.push(cardId);
    }
    drawDirect(state, source.owner, 2, events);
    events.push(effectEvent(`${label} trades two cards.`, source));
  } else if (source.effectId === "choose_2_discard") {
    if (!pickedHand) return false;
    if ((chosen?.step ?? 0) === 0) {
      const next = requestChoice(
        state,
        source,
        {
          kind: "hand",
          side: "enemy",
          prompt: "Choose the second card in the enemy hand",
          handFilter: (_card, index) => index !== pickedHand.index,
        },
        library,
        1,
        [],
        [pickedHand],
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    if ((chosen?.step ?? 0) <= 1) {
      const selected = [...(chosen?.priorHandOptions ?? []), pickedHand];
      const allowed = new Set(selected.map((option) => option.index));
      const next = requestChoice(
        state,
        source,
        {
          kind: "hand",
          side: "enemy",
          prompt: "Choose which selected card to discard",
          handFilter: (_card, index) => allowed.has(index),
        },
        library,
        2,
        [],
        selected,
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    const index = pickedHand.index;
    const [discarded] = enemy.hand.splice(index, 1);
    if (discarded) {
      state.discard.push(discarded);
      events.push(effectEvent(`${label} discards ${library[discarded]?.name ?? "a card"}.`, source));
    }
  } else if (source.effectId === "consume_tech_card") {
    if (pickedHand) {
      const def = library[player.hand.splice(pickedHand.index, 1)[0]];
      if (!isMinionCard(def)) return false;
      buffMinion(source, def.atk, def.hp);
      events.push(effectEvent(`${label} absorbs ${def.name}.`, source));
    }
  } else if (source.effectId === "consume_all_friendly_tech") {
    const victims = player.board.filter(
      (minion): minion is MinionInstance => Boolean(minion && minion.instanceId !== source.instanceId && minion.camp === "Tech"),
    );
    let consumed = 0;
    let gainedEffects = 0;
    for (const victim of victims) {
      const gainedAtk = victim.atk;
      const gainedHp = victim.hp;
      buffMinion(source, gainedAtk, gainedHp);

      if (hasKeyword(victim, "Taunt") && !hasKeyword(source, "Taunt")) source.keywords.push("Taunt");
      if (victim.divineShield || hasKeyword(victim, "Divine Shield")) {
        source.divineShield = true;
        if (!hasKeyword(source, "Divine Shield")) source.keywords.push("Divine Shield");
      }

      const effects = [
        ...(victim.effectId !== "none" && (victim.effectTiming === "passive" || victim.effectTiming === "ongoing" || victim.effectTiming === "onPlayAndOngoing")
          ? [{ effectId: victim.effectId, timing: victim.effectTiming === "onPlayAndOngoing" ? "ongoing" : victim.effectTiming, text: victim.effect }]
          : []),
        ...victim.gainedEffects,
      ];
      for (const effect of effects) {
        if ((effect.timing === "passive" || effect.timing === "ongoing") && effect.effectId !== "none" && !hasEffect(source, effect.effectId)) {
          source.gainedEffects.push({ effectId: effect.effectId, timing: effect.timing, text: effect.text });
          gainedEffects += 1;
        }
      }

      destroyInstance(state, victim.owner, victim.instanceId, events, `${source.name} consumes ${victim.name}`);
      consumed += 1;
    }
    if (source.gainedEffects.some((effect) => effect.timing === "ongoing")) source.effectTiming = "ongoing";
    events.push(effectEvent(`${label} consumes ${consumed} friendly Tech minion${consumed === 1 ? "" : "s"} and gains their stats${gainedEffects ? " and effects" : ""}.`, source));
    source.effectId = "none";
  } else if (source.effectId === "dice_buff") {
    // Halved (2026 balance pass). A full d6 every turn averaged +3.5/+3.5 and
    // made Kite the single strongest card in the roster at 78% — the die is kept,
    // because the roll is the card, but it now pays out 1-3 instead of 1-6.
    const roll = Math.ceil(rollDie(state) / 2);
    buffMinion(source, roll, roll);
    events.push(effectEvent(`${label} rolls ${roll} for +${roll}/+${roll}.`, source));
  } else if (source.effectId === "doof_dice") {
    const roll = rollDie(state);
    if (roll <= 2) {
      for (const minion of enemy.board) if (minion) buffMinion(minion, 1, 1);
      events.push(effectEvent(`${label} backfires — enemies gain +1/+1.`, source));
    } else if (roll <= 5) {
      // +1/+1, down from +2/+2 (pass 3): 61.2% vs a 51% bracket. The middle
      // band is half of all rolls, so it, not the jackpot, was the card's real
      // value. The 1-in-6 jackpot stays — the gamble is the character.
      buffMinion(source, 1, 1);
      events.push(effectEvent(`${label} self-buffs +1/+1.`, source));
    } else {
      // +3/+3, down from +4/+4 (pass 4). Pass 3 cut the middle band and it
      // barely moved (+10.2 -> +9.0), which showed the jackpot was carrying the
      // card. The 1-in-6 gamble stays — that is the character — it just pays a
      // little less.
      buffMinion(source, 3, 3);
      events.push(effectEvent(`${label} hits the jackpot for +3/+3!`, source));
    }
  } else if (source.effectId === "doof_coinflip") {
    if (coinFlip(state)) {
      destroyInstance(state, source.owner, source.instanceId, events, `${label} loses the coin flip`);
    } else {
      buffMinion(source, 2, 1);
      events.push(effectEvent(`${label} wins the coin flip for +2/+1.`, source));
    }
  } else if (source.effectId === "bounce_enemy") {
    const target = picked;
    const slot = slotOf(state, target);
    if (target && slot >= 0 && !blockedByDominionAuthority(state, source, target.owner)) {
      enemy.board[slot] = null;
      discardAttachedRelics(state, target);
      putCardInHand(state, enemyId, target.cardId, events, target.instanceId);
      events.push(effectEvent(`${label} returns ${target.name} to hand.`, source));
    } else if (target && blockedByDominionAuthority(state, source, target.owner)) {
      events.push(effectEvent(`${target.name} is protected by Dominion Authority.`, target));
    }
  } else if (source.effectId === "bounce_friendly") {
    const target = picked;
    const slot = slotOf(state, target);
    if (target && slot >= 0) {
      player.board[slot] = null;
      discardAttachedRelics(state, target);
      putCardInHand(state, player.id, target.cardId, events, target.instanceId);
      events.push(effectEvent(`${label} returns ${target.name} to hand.`, source));
    }
  } else if (source.effectId === "give_taunt") {
    const target = picked;
    if (target) {
      target.keywords.push("Taunt");
      if (!target.gainedEffects.some((effect) => effect.text === "Passive: Taunt.")) {
        target.gainedEffects.push({ effectId: "none", timing: "passive", text: "Passive: Taunt." });
      }
      events.push(effectEvent(`${label} gives ${target.name} Taunt.`, source));
    }
  } else if (source.effectId === "alone_buff_5") {
    if (friendlyOthers(player, source).length === 0) {
      buffMinion(source, 3, 3);
      events.push(effectEvent(`${label} stands alone for +3/+3.`, source));
    }
  } else if (source.effectId === "ally_atk_1") {
    if (friendlyOthers(player, source).length > 0) {
      source.atk += 1;
      events.push(effectEvent(`${label} fights better together.`, source));
    }
  } else if (source.effectId === "taunt_aura") {
    for (const minion of friendlyOthers(player, source)) if (!hasKeyword(minion, "Taunt")) minion.keywords.push("Taunt");
    events.push(effectEvent(`${label} rallies allies to the front.`, source));
  } else if (source.effectId === "chain_random_enemy") {
    const candidates = state.players[enemyId].board.filter(
      (minion): minion is MinionInstance => Boolean(
        minion &&
        !isSlotProtected(state, minion) &&
        canDisable(state, source.owner, minion, "chain"),
      ),
    );
    const target = candidates.length > 0 ? candidates[rollInt(state, candidates.length)] : null;
    if (target) {
      target.chained = Math.max(target.chained, 2);
      events.push(effectEvent(`${label} chains ${target.name} for 1 turn.`, source));
    }
  } else if (source.effectId === "buddha_purify") {
    for (const owner of [0, 1] as PlayerId[]) {
      for (const minion of state.players[owner].board) {
        if (!minion) continue;
        minion.alignment = "Good";
        minion.chained = 0;
        resolveChainGrowth(minion, events);
        minion.frozen = false;
        minion.thawPending = false;
        minion.silenced = false;
        minion.markedBy = null;
        minion.markedForDeathAtTurn = null;
        minion.delayedDestroySource = null;
      }
    }
    events.push(effectEvent(`${label} purifies the board: all minions are Good and lose their negative statuses.`, source));
  } else if (source.effectId === "hashira_focus_attack") {
    if (picked) {
      for (let slot = 0; slot < boardSize; slot += 1) {
        const attacker = state.players[source.owner].board[slot];
        const target = state.players[picked.owner].board[pickedSlot?.slot ?? -1];
        if (!attacker || !target) break;
        if (attacker.frozen || attacker.chained > 0 || attacker.attackLocked) continue;
        if (!attacker.silenced && hasKeyword(attacker, "Cannot Attack")) continue;
        attackMinion(state, source.owner, slot, pickedSlot!.slot, events);
      }
      events.push(effectEvent(`${label} orders every able friendly minion to attack ${picked.name}.`, source));
    }
  } else if (source.effectId === "set_attack_highest_enemy") {
    const highest = Math.max(0, ...enemy.board.filter((minion): minion is MinionInstance => Boolean(minion)).map((minion) => minion.atk));
    if (highest > 0) {
      source.atk = highest;
      events.push(effectEvent(`${label} matches the highest enemy ATK (${highest}).`, source));
    }

  // ----------------------------------------------------------------- the hard cards
  } else if (source.effectId === "steal_relic") {
    // Ten Commandments takes the attached relic as a card. It never equips the
    // stolen card automatically; the controller must spend mana and choose a
    // bearer on a later action.
    if (picked && hasAnyRelic(picked)) {
      const relicIndex = firstRelicIndex(picked);
      const stolen = relicAt(picked, relicIndex);
      if (!stolen) return false;
      unequipRelic(picked, relicIndex);
      events.push(effectEvent(`${label} tears ${stolen.name} from ${picked.name}.`, source));
      putCardInHand(state, source.owner, stolen.id, events);
    }
  } else if (source.effectId === "steal_and_equip_relic") {
    if (picked && hasAnyRelic(picked) && hasFreeRelicSlot(source)) {
      const relicIndex = firstRelicIndex(picked);
      const stolen = relicAt(picked, relicIndex);
      if (!stolen || !canEquipRelicToBearer(stolen, source)) return false;
      unequipRelic(picked, relicIndex);
      equipRelic(state, source, stolen, library, events);
      events.push(effectEvent(`${label} takes ${stolen.name} from ${picked.name} and equips it.`, source));
    }
  } else if (source.effectId === "destroy_relic") {
    if (picked && hasAnyRelic(picked)) {
      const relicIndex = firstRelicIndex(picked);
      const lost = relicAt(picked, relicIndex);
      if (!lost) return false;
      unequipRelic(picked, relicIndex);
      state.discard.push(lost.id);
      events.push(effectEvent(`${label} destroys ${picked.name}'s ${lost.name}.`, source));
    }
  } else if (source.effectId === "mark_for_death") {
    if (picked) {
      picked.markedBy = source.instanceId;
      events.push(effectEvent(`${label} marks ${picked.name}.`, source));
    }
  } else if (source.effectId === "mind_control_2" || source.effectId === "mind_control_enemy") {
    if (picked) seizeMinion(state, source, picked, events);
  } else if (source.effectId === "motoko_kusanagi") {
    if (picked) seizeMinionTemporarily(state, source, picked, events);
  } else if (source.effectId === "copy_and_trigger") {
    if (picked && picked.effectId !== "none") {
      const borrowed = printedEffectId(picked);
      const victim: TargetOption = { owner: picked.owner, slot: slotOf(state, picked) };
      events.push(effectEvent(`${label} copies ${picked.name}'s power.`, source));
      // Wear the effect for one resolution. A copied effect that itself wants a
      // target is not re-prompted — it takes the same victim it was copied from.
      //
      // The victim is only OFFERED, never assumed, because that handoff skips
      // the borrowed spec's own rules (see `copiedVictimIsLegalTarget`). The
      // victim is by definition an enemy minion, so feeding it to a
      // `side: "friendly"` effect made this card fully heal, buff, shield or
      // Taunt the OPPONENT's minion, and made a `slot` effect bless their slot.
      // It is also how a friendly pick owned by the opponent reached Knov's
      // pocket-room resolver, the upstream cause of the `instance <id> is on the
      // board twice` breach the balance gate reported on 18 August 2026.
      //
      // When the victim is not legal, the copy is NOT lost. The effect asks for
      // its own target instead, which resolves it exactly as though All for One
      // had cast it: a copied friendly power lands on ITS controller's board.
      //
      // That requires the borrowed effect to survive an open prompt, because
      // the answer arrives on a later action. So the minion's own effect is
      // parked in `copyRestoreEffectId` rather than in a local, and it is put
      // back by `restoreCopiedEffect` — here when the copy finishes in one go,
      // or from `chooseTarget` when the last prompt is answered. Multi-step
      // copies (Knov's room, Ten Commandments' double Freeze) work for the same
      // reason: the minion keeps wearing the effect between questions.
      source.copyRestoreEffectId = source.effectId;
      source.effectId = borrowed;
      const offerVictim = copiedVictimIsLegalTarget(state, source, victim);
      runEffect(state, source, sourceSlot, library, events, offerVictim ? { kind: "board", target: victim } : undefined);
      restoreCopiedEffect(state, source);
    }
  } else if (source.effectId === "steal_passive") {
    if (picked && picked.effectId !== "none") {
      source.stolenPassiveFrom = picked.instanceId;
      source.stolenPassiveText = picked.effect;
      source.effectId = printedEffectId(picked);
      source.effectTiming = "passive";
      source.copyRestoreEffectId = null;
      picked.effectId = "none";
      picked.effectTiming = "none";
      picked.copyRestoreEffectId = null;
      events.push(effectEvent(`${label} steals ${picked.name}'s passive.`, source));
    }
  } else if (source.effectId === "steal_magic_effects") {
    const copiedNames: string[] = [];
    for (const minion of enemy.board) {
      if (!minion || minion.camp !== "Magic") continue;
      if (hasKeyword(minion, "Taunt") && !hasKeyword(source, "Taunt")) source.keywords.push("Taunt");
      if (minion.divineShield || hasKeyword(minion, "Divine Shield")) {
        source.divineShield = true;
        if (!hasKeyword(source, "Divine Shield")) source.keywords.push("Divine Shield");
      }
      const timing = minion.effectTiming === "onPlayAndOngoing" ? "ongoing" : minion.effectTiming;
      if ((timing === "passive" || timing === "ongoing") && minion.effectId !== "none" && !hasEffect(source, minion.effectId)) {
        source.gainedEffects.push({ effectId: minion.effectId, timing, text: minion.effect });
        copiedNames.push(minion.name);
      }
      if (!isSlotProtected(state, minion) && canDisable(state, source.owner, minion, "silence")) applySilence(minion);
    }
    if (source.gainedEffects.some((effect) => effect.timing === "ongoing")) source.effectTiming = "ongoing";
    events.push(effectEvent(`${label} silences Magic and gains ${copiedNames.length || "no"} effects.`, source));
    source.effectId = "none";
  } else if (source.effectId === "bounce_friendly_discount") {
    const slot = slotOf(state, picked);
    if (picked && slot >= 0) {
      const cardId = picked.cardId;
      player.board[slot] = null;
      discardAttachedRelics(state, picked);
      putCardInHand(state, source.owner, cardId, events, picked.instanceId);
      player.costReductions[cardId] = (player.costReductions[cardId] ?? 0) + 5;
      events.push(effectEvent(`${label} sends ${picked.name} home; it returns 5 cheaper.`, source));
    }
  } else if (source.effectId === "replace_allies_from_deck") {
    const victims = friendlyOthers(player, source);
    let replaced = 0;
    for (const victim of victims) {
      const slot = slotOf(state, victim);
      if (slot < 0) continue;
      let drawn: string | undefined;
      while (!drawn) {
        const nextCard = drawFromDeck(state, 1, events)[0];
        if (!nextCard) break;
        if (isMinionCard(library[nextCard])) drawn = nextCard;
        else putCardInHand(state, source.owner, nextCard, events);
      }
      destroyAtSlot(state, source.owner, slot, events, `${source.name} unmakes ${victim.name}`);
      const replacement = drawn ? library[drawn] : undefined;
      if (!isMinionCard(replacement)) continue;
      if (player.board[slot]) continue;
      player.board[slot] = createMinion(replacement, source.owner, state);
      replaced += 1;
    }
    if (replaced > 0) events.push(effectEvent(`${label} remakes ${replaced} of your minions.`, source));
  } else if (source.effectId === "transform_random_allies_up") {
    const targets = player.board.filter((minion): minion is MinionInstance => Boolean(minion));
    const transformed = targets.reduce(
      (count, target) => count + (transformMinionFromPool(state, source, target, 1, library, events) ? 1 : 0),
      0,
    );
    events.push(effectEvent(`${label} transforms ${transformed} friendly minion${transformed === 1 ? "" : "s"}.`, source));
  } else if (source.effectId === "devolve_enemy_minions") {
    const targets = enemy.board.filter((minion): minion is MinionInstance => Boolean(minion));
    let transformed = 0;
    for (const target of targets) {
      if (blockedByDominionAuthority(state, source, target.owner)) {
        events.push(effectEvent(`${target.name} is protected by Dominion Authority.`, target));
        continue;
      }
      if (isSlotProtected(state, target) || !canDisable(state, source.owner, target)) {
        events.push(effectEvent(`${target.name} resists the devolution.`, target));
        continue;
      }
      if (transformMinionFromPool(state, source, target, -1, library, events)) transformed += 1;
    }
    events.push(effectEvent(`${label} devolves ${transformed} enemy minion${transformed === 1 ? "" : "s"}.`, source));
  } else if (source.effectId === "set_stats_choice") {
    if (pickedSlot) layAura(state, pickedSlot, "slot_stats_one", source, events);
  } else if (source.effectId === "pressure_chosen_card") {
    if (pickedHand) {
      const name = library[pickedHand.cardId]?.name ?? "a card";
      enemy.pressured = { cardId: pickedHand.cardId, dueTurn: state.turnNumber + 2 };
      events.push(effectEvent(`${label} names ${name} — play it next turn or lose it.`, source));
    }
  } else if (
    source.effectId === "slot_random_attacks" ||
    source.effectId === "slot_permanent_silence" ||
    source.effectId === "slot_permanent_chain" ||
    source.effectId === "slot_growth_1" ||
    source.effectId === "slot_growth"
  ) {
    const auraId: SlotAuraId =
      source.effectId === "slot_random_attacks"
        ? "random_attacks"
        : source.effectId === "slot_permanent_silence"
          ? "slot_silence"
          : source.effectId === "slot_permanent_chain"
            ? "slot_chain"
            : source.effectId === "slot_growth_1"
              ? "slot_grow_1"
              : "slot_grow_2";
    if (pickedSlot) layAura(state, pickedSlot, auraId, source, events);
  } else if (source.effectId === "confuse_enemies") {
    // Sans. Their whole board swings blind through their next turn.
    enemy.confusedUntilTurn = state.turnNumber + 2;
    events.push(effectEvent(`${label} scrambles the enemy's aim.`, source));
  } else if (source.effectId === "reveal_and_shuffle_chosen") {
    if (!pickedHand) return false;
    if ((chosen?.step ?? 0) === 0) {
      const next = requestChoice(
        state,
        source,
        {
          kind: "hand",
          side: "enemy",
          prompt: "Choose the second card to reveal",
          handFilter: (_card, index) => index !== pickedHand.index,
        },
        library,
        1,
        [],
        [pickedHand],
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    if ((chosen?.step ?? 0) === 1) {
      const selected = [...(chosen?.priorHandOptions ?? []), pickedHand];
      const allowed = new Set(selected.map((option) => option.index));
      const next = requestChoice(
        state,
        source,
        {
          kind: "hand",
          side: "enemy",
          prompt: "Choose which revealed card to shuffle into the deck",
          handFilter: (_card, index) => allowed.has(index),
        },
        library,
        2,
        [],
        selected,
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    }
    if (pickedHand) {
      const name = library[pickedHand.cardId]?.name ?? "a card";
      const index = pickedHand.index;
      if (index >= 0) {
        enemy.hand.splice(index, 1);
        state.bottomDeck.push(pickedHand.cardId);
      }
      events.push(effectEvent(`${label} reveals ${name} and shuffles it away.`, source));
    }
  }
  return false;
}

function copyMinionEffects(source: MinionInstance, target: MinionInstance, events: GameEvent[]): void {
  const keepStats = { atk: source.atk, hp: source.hp, maxHp: source.maxHp, baseAtk: source.baseAtk, baseHp: source.baseHp };
  source.name = target.name;
  source.cost = target.cost;
  source.rarity = target.rarity;
  source.camp = target.camp;
  source.alignment = target.alignment;
  source.keywords = [...target.keywords];
  source.effectId = printedEffectId(target);
  // Becoming another minion replaces this one's identity outright, so a parked
  // "put your own effect back" note is stale the moment it lands.
  source.copyRestoreEffectId = null;
  source.effectTiming = target.effectTiming;
  source.effect = target.effect;
  source.origin = target.origin;
  source.art = target.art;
  source.silenced = target.silenced;
  source.passiveSilenceSources = [...(target.passiveSilenceSources ?? [])];
  source.divineShield = target.divineShield;
  source.gainedEffects = target.gainedEffects.map((effect) => ({ ...effect }));
  source.atk = keepStats.atk;
  source.hp = keepStats.hp;
  source.maxHp = keepStats.maxHp;
  source.baseAtk = keepStats.baseAtk;
  source.baseHp = keepStats.baseHp;
  if (hasKeyword(source, "Charge")) source.sleeping = false;
  events.push(effectEvent(`${source.name} becomes a copy of the chosen minion's effects without copying its stats.`, source));
}

function persistentEffects(minion: MinionInstance): Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }> {
  const effects: Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }> = [];
  if (
    minion.effectId !== "none" &&
    (minion.effectTiming === "passive" || minion.effectTiming === "ongoing" || minion.effectTiming === "onPlayAndOngoing")
  ) {
    effects.push({
      effectId: minion.effectId,
      timing: minion.effectTiming === "onPlayAndOngoing" ? "ongoing" : minion.effectTiming,
      text: minion.effect,
    });
  }
  effects.push(...minion.gainedEffects);
  return effects.filter((effect) => effect.effectId !== "none");
}

/** Transfer the persistent parts of a sacrificed minion without replaying its Battlecry. */
function copyPersistentMinionTraits(source: MinionInstance, target: MinionInstance): number {
  if (hasKeyword(target, "Taunt") && !hasKeyword(source, "Taunt")) source.keywords.push("Taunt");
  if (target.divineShield || hasKeyword(target, "Divine Shield")) {
    source.divineShield = true;
    if (!hasKeyword(source, "Divine Shield")) source.keywords.push("Divine Shield");
  }

  const effects: Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }> = [];
  if (
    target.effectId !== "none" &&
    (target.effectTiming === "passive" || target.effectTiming === "ongoing" || target.effectTiming === "onPlayAndOngoing")
  ) {
    const timing: "passive" | "ongoing" = target.effectTiming === "onPlayAndOngoing" ? "ongoing" : target.effectTiming;
    effects.push({ effectId: target.effectId, timing, text: target.effect });
  }
  effects.push(...target.gainedEffects);

  let copied = 0;
  for (const effect of effects) {
    if (effect.effectId === "none" || hasEffect(source, effect.effectId)) continue;
    source.gainedEffects.push({ effectId: effect.effectId, timing: effect.timing, text: effect.text });
    copied += 1;
  }
  return copied;
}

function consumeEnemyMinion(
  state: GameState,
  source: MinionInstance,
  prey: MinionInstance,
  events: GameEvent[],
): void {
  const slot = slotOf(state, prey);
  if (slot < 0) return;
  const gainedAtk = prey.atk;
  const gainedHp = prey.hp;
  const gainedEffects = copyPersistentMinionTraits(source, prey);
  buffMinion(source, gainedAtk, gainedHp);
  destroyAtSlot(state, prey.owner, slot, events, `${source.name} consumes ${prey.name}`);
  if (source.gainedEffects.some((effect) => effect.timing === "ongoing")) {
    source.effectId = "none";
    source.effectTiming = "ongoing";
  }
  events.push(
    effectEvent(
      `${source.name} gains ${gainedAtk}/${gainedHp}${gainedEffects ? " and its effects" : ""} from consuming ${prey.name}.`,
      source,
    ),
  );
}

function returnMinionsToHand(state: GameState, playerId: PlayerId, minions: MinionInstance[], events: GameEvent[]): void {
  const entries = minions
    .map((minion) => ({ minion, slot: slotOf(state, minion) }))
    .filter(({ minion, slot }) => minion.owner === playerId && slot >= 0);
  for (const { minion, slot } of entries) {
    state.players[playerId].board[slot] = null;
    discardAttachedRelics(state, minion);
    putCardInHand(state, playerId, minion.cardId, events, minion.instanceId);
  }
}

function returnAllMinionsToHand(
  state: GameState,
  events: GameEvent[],
  excludedInstanceId?: string,
  sourceOwner?: PlayerId,
): void {
  const entries = state.players.flatMap((player) =>
    player.board.map((minion, slot) => (minion ? { owner: player.id, minion, slot } : null)).filter(Boolean),
  ) as Array<{ owner: PlayerId; minion: MinionInstance; slot: number }>;
  for (const { owner, minion, slot } of entries) {
    if (minion.instanceId === excludedInstanceId) continue;
    if (sourceOwner !== undefined && owner !== sourceOwner && hasDominionAuthority(state, owner)) {
      events.push({ kind: "effect", text: `${minion.name} is protected by Dominion Authority.`, player: sourceOwner, instanceId: minion.instanceId });
      continue;
    }
    state.players[owner].board[slot] = null;
    discardAttachedRelics(state, minion);
    putCardInHand(state, owner, minion.cardId, events, minion.instanceId);
  }
}

function summonRandomGoodFromDeck(state: GameState, source: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const slot = state.players[source.owner].board.findIndex((entry) => !entry);
  if (slot < 0) return;
  const candidates = [...state.deck, ...state.bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && card.alignment === "Good";
  });
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  removeCardFromDrawPile(state, cardId);
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const summoned = createMinion(card, source.owner, state);
  state.players[source.owner].board[slot] = summoned;
  events.push(effectEvent(`${source.name} recruits ${summoned.name} from the deck.`, source));
}

function transformMinionFromPool(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  costDelta: number,
  library: CardLibrary,
  events: GameEvent[],
  preserveRelicId?: string,
): boolean {
  const slot = slotOf(state, target);
  if (slot < 0) return false;
  const candidates = Object.values(library).filter(
    (card): card is CardDefinition => isMinionCard(card) && card.cost === target.cost + costDelta,
  );
  if (candidates.length === 0) return false;
  const replacement = candidates[rollInt(state, candidates.length)];
  if (!replacement) return false;
  const preservedRelicIndex = preserveRelicId
    ? firstRelicIndex(target, (relic) => relic.relicId === preserveRelicId)
    : -1;
  const preservedRelic = preservedRelicIndex >= 0 ? relicAt(target, preservedRelicIndex) : null;
  if (preservedRelic) {
    for (const index of [0, 1]) {
      const relic = relicAt(target, index);
      if (relic && index !== preservedRelicIndex) state.discard.push(relic.id);
    }
  } else {
    discardAttachedRelics(state, target);
  }
  const transformed = createMinion(replacement, target.owner, state);
  if (preservedRelic) transformed.relic = preservedRelic;
  transformed.suppressArrivalTheme = true;
  state.players[target.owner].board[slot] = transformed;
  events.push(effectEvent(`${source.name} transforms ${target.name} into ${transformed.name}.`, source));
  return true;
}

function summonSkeletons(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const skeleton: CardDefinition = {
    kind: "minion",
    id: "token:skeleton",
    name: "Skeleton",
    cost: 1,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Magic",
    alignment: "Evil",
    keywords: ["Taunt"],
    effectId: "none",
    effectTiming: "none",
    effect: "Taunt.",
    flavor: "A servant of the Great Tomb.",
    origin: "Overlord",
    art: source.art.replace(/[^/]+$/, "token-skeleton.webp"),
  };
  let summoned = 0;
  for (let slot = 0; slot < boardSize; slot += 1) {
    if (state.players[source.owner].board[slot]) continue;
    state.players[source.owner].board[slot] = createMinion(skeleton, source.owner, state);
    summoned += 1;
  }
  if (summoned > 0) events.push(effectEvent(`${source.name} fills the board with ${summoned} Taunt Skeletons.`, source));
}

function summonHeroPowerRecruit(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  const slot = player.board.findIndex((entry) => !entry);
  if (slot < 0) return;
  const recruit: CardDefinition = {
    kind: "minion",
    id: "token:knight",
    name: "Knight",
    cost: 0,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Magic",
    alignment: "Good",
    keywords: [],
    effectId: "none",
    effectTiming: "none",
    effect: "-",
    flavor: "A small spark can turn the tide.",
    origin: "Hero Power",
    art: resolvePublicAssetUrl("/card-art/raw/token-knight.webp"),
  };
  const summoned = createMinion(recruit, playerId, state);
  player.board[slot] = summoned;
  events.push({ kind: "effect", text: `${player.name} summons a 1/1 Knight.`, player: playerId, instanceId: summoned.instanceId });
}

function summonShadowClones(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const shadowClone: CardDefinition = {
    kind: "minion",
    id: "token:shadow-clone",
    name: "Shadow Clone",
    cost: 0,
    atk: 2,
    hp: 2,
    rarity: "Black",
    camp: "Magic",
    alignment: "Good",
    keywords: [],
    effectId: "none",
    effectTiming: "none",
    effect: "-",
    flavor: "One body becomes many.",
    origin: "Naruto",
    art: resolvePublicAssetUrl("/card-art/raw/token-shadow-clone.webp"),
  };
  const player = state.players[source.owner];
  let summoned = 0;
  for (let slot = 0; slot < boardSize; slot += 1) {
    if (player.board[slot]) continue;
    player.board[slot] = createMinion(shadowClone, source.owner, state);
    summoned += 1;
  }
  if (summoned > 0) events.push(effectEvent(`${source.name} fills the board with ${summoned} Shadow Clones.`, source));
}

function summonLarva(state: GameState, source: MinionInstance, dead: MinionInstance, events: GameEvent[]): void {
  const player = state.players[source.owner];
  const slot = player.board.findIndex((entry) => !entry);
  if (slot < 0) return;
  const larva: CardDefinition = {
    kind: "minion",
    id: "token:larva",
    name: "Larva",
    cost: 0,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Nature",
    alignment: "Evil",
    keywords: [],
    effectId: "none",
    effectTiming: "none",
    effect: "-",
    flavor: "One more for the hive.",
    origin: "Alien",
    art: resolvePublicAssetUrl("/card-art/raw/token-larva.webp"),
  };
  const summoned = createMinion(larva, source.owner, state);
  player.board[slot] = summoned;
  events.push(effectEvent(`${source.name} hatches a 1/1 Larva after ${dead.name} dies.`, source));
}

function summonSins(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const keywordOrder: Array<CardDefinition["keywords"][number]> = ["Taunt", "Divine Shield", "Charge", "Chained"];
  for (let index = keywordOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = rollInt(state, index + 1);
    [keywordOrder[index], keywordOrder[swapIndex]] = [keywordOrder[swapIndex], keywordOrder[index]];
  }
  const sin: CardDefinition = {
    kind: "minion",
    id: "token:sin",
    name: "Sin",
    cost: 1,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Magic",
    alignment: "Evil",
    keywords: [],
    effectId: "none",
    effectTiming: "none",
    effect: "-",
    flavor: "A fragment of sin.",
    origin: source.origin,
    art: source.art.replace(/[^/]+$/, "token-sin.webp"),
  };
  const player = state.players[source.owner];
  const emptySlots = player.board.map((minion, slot) => (minion ? -1 : slot)).filter((slot) => slot >= 0);
  const summonedKeywords = keywordOrder.slice(0, emptySlots.length);
  summonedKeywords.forEach((keyword, index) => {
    const slot = emptySlots[index];
    const token = createMinion({ ...sin, keywords: [keyword], effect: `${keyword}.` }, source.owner, state);
    player.board[slot] = token;
  });
  if (summonedKeywords.length > 0) {
    events.push(effectEvent(`${source.name} summons ${summonedKeywords.length} Sin minions with different keywords.`, source));
  }
}

function summonTieFighters(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const tieFighter: CardDefinition = {
    kind: "minion",
    id: "token:tie-fighter",
    name: "TIE Fighter",
    cost: 1,
    atk: 1,
    hp: 1,
    rarity: "Black",
    camp: "Tech",
    alignment: "Evil",
    keywords: ["Charge"],
    effectId: "none",
    effectTiming: "none",
    effect: "Charge.",
    flavor: "Twin ion engines scream through the void.",
    origin: "Star Wars",
    art: source.art.replace(/[^/]+$/, "token-tie-fighter.webp"),
  };
  const player = state.players[source.owner];
  let summoned = 0;
  for (let slot = 0; slot < boardSize && summoned < 2; slot += 1) {
    if (player.board[slot]) continue;
    player.board[slot] = createMinion(tieFighter, source.owner, state);
    summoned += 1;
  }
  if (summoned > 0) {
    events.push(effectEvent(`${source.name} deploys ${summoned} 1/1 TIE Fighter${summoned === 1 ? "" : "s"} with Charge.`, source));
  }
}

function grantRandomRelicsToBoard(state: GameState, source: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const bearers = state.players[source.owner].board.filter(
    (minion): minion is MinionInstance => Boolean(minion && hasFreeRelicSlot(minion)),
  );
  const available = relicsInDeck(state, library).map((relic) => relic.id);
  let granted = 0;
  for (const bearer of bearers) {
    const eligible = available.filter((cardId) => {
      const relic = library[cardId];
      return isRelicCard(relic) && canEquipRelicToBearer(relic, bearer);
    });
    if (eligible.length === 0) break;
    const cardId = eligible[rollInt(state, eligible.length)];
    const availableIndex = available.indexOf(cardId);
    if (availableIndex < 0) continue;
    available.splice(availableIndex, 1);
    if (!cardId || !removeCardFromDrawPile(state, cardId)) continue;
    const relic = library[cardId];
    if (!isRelicCard(relic)) continue;
    equipRelic(state, bearer, createRelicInstance(relic), library, events);
    granted += 1;
  }
  events.push(effectEvent(`${source.name} grants Ascension Relics to ${granted} friendly minion${granted === 1 ? "" : "s"}.`, source));
}

function equipRandomRelic(state: GameState, source: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const available = relicsInDeck(state, library).filter((relic) => canEquipRelicToBearer(relic, source));
  if (available.length === 0) {
    events.push(effectEvent(`${source.name} finds no Ascension Relic.`, source));
    return;
  }
  const relic = available[rollInt(state, available.length)];
  if (!relic || !removeCardFromDrawPile(state, relic.id)) return;
  equipRelic(state, source, createRelicInstance(relic), library, events);
}

function resolvePocketRooms(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const rooms = state.pocketRooms ?? [];
  const due = rooms.filter((room) => room.returnAtTurn <= state.turnNumber);
  state.pocketRooms = rooms.filter((room) => room.returnAtTurn > state.turnNumber);
  for (const room of due) {
    const winners = room.friendly.atk === room.enemy.atk
      ? [room.friendly, room.enemy]
      : [room.friendly.atk > room.enemy.atk ? room.friendly : room.enemy];
    // Second line of defence, and the one that makes the invariant unbreakable
    // from here: never place the same instance twice, and never place one that
    // is somehow already on a board. The guard above stops today's cause; this
    // stops the whole bug class, because any future effect that manages to store
    // one minion on both sides of a room would otherwise corrupt the duel again.
    const placed = new Set<string>();
    for (const winner of winners) {
      if (placed.has(winner.instanceId)) continue;
      const alreadyLive = state.players.some((side) =>
        side.board.some((entry) => entry?.instanceId === winner.instanceId));
      if (alreadyLive) continue;
      const board = state.players[winner.owner].board;
      const preferred = winner.instanceId === room.friendly.instanceId ? room.friendlySlot : room.enemySlot;
      const slot = !board[preferred] ? preferred : board.findIndex((entry) => !entry);
      if (slot >= 0) {
        board[slot] = winner;
        placed.add(winner.instanceId);
        events.push(effectEvent(`${winner.name} returns from the pocket room.`, winner));
      } else {
        putCardInHand(state, winner.owner, winner.cardId, events);
        placed.add(winner.instanceId);
      }
    }
    const losers = [room.friendly, room.enemy].filter((minion) => !winners.includes(minion));
    for (const loser of losers) state.discard.push(loser.cardId);
    if (winners.length === 2) events.push({ kind: "effect", text: "The pocket room releases both minions on an ATK tie.", player: playerId });
  }
}

function resolveStasis(state: GameState, _playerId: PlayerId, events: GameEvent[]): void {
  const entries = state.stasis ?? (state.stasis = []);
  const due = entries.filter((entry) => entry.returnAtTurn <= state.turnNumber);
  state.stasis = entries.filter((entry) => entry.returnAtTurn > state.turnNumber);
  for (const entry of due) {
    const owner = state.players[entry.owner];
    const preferred = Math.max(0, Math.min(boardSize - 1, entry.slot));
    const slot = !owner.board[preferred] ? preferred : owner.board.findIndex((minion) => !minion);
    entry.minion.owner = entry.owner;
    if (slot >= 0) {
      owner.board[slot] = entry.minion;
      events.push({
        kind: "effect",
        text: `${entry.minion.name} returns from stasis after two turns.`,
        player: entry.owner,
        instanceId: entry.minion.instanceId,
      });
    } else {
      putCardInHand(state, entry.owner, entry.minion.cardId, events, entry.minion.instanceId);
      events.push({
        kind: "effect",
        text: `${entry.minion.name} returns from stasis to its owner's hand.`,
        player: entry.owner,
        instanceId: entry.minion.instanceId,
      });
    }
  }
}

function releaseDarkDimensionForSource(state: GameState, sourceInstanceId: string, events: GameEvent[]): void {
  const entries = state.darkDimension ?? [];
  const released = entries.filter((entry) => entry.sourceInstanceId === sourceInstanceId);
  if (released.length === 0) return;
  state.darkDimension = entries.filter((entry) => entry.sourceInstanceId !== sourceInstanceId);
  for (const entry of released) {
    const owner = state.players[entry.owner];
    const preferred = Math.max(0, Math.min(boardSize - 1, entry.slot));
    const slot = !owner.board[preferred] ? preferred : owner.board.findIndex((minion) => !minion);
    entry.minion.owner = entry.owner;
    if (slot >= 0) {
      owner.board[slot] = entry.minion;
      events.push({
        kind: "effect",
        text: `${entry.minion.name} returns from the Dark Dimension after ${entry.sourceName} dies.`,
        player: entry.owner,
        instanceId: entry.minion.instanceId,
        motion: "return",
      });
    } else {
      putCardInHand(state, entry.owner, entry.minion.cardId, events, entry.minion.instanceId);
      events.push({
        kind: "effect",
        text: `${entry.minion.name} returns from the Dark Dimension to its owner's hand.`,
        player: entry.owner,
        instanceId: entry.minion.instanceId,
        motion: "return",
      });
    }
  }
}

function resolveKingAttackLocks(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const kings = state.players[opponent(playerId)].board.filter(
    (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "king_attack_lock_random")),
  );
  const candidates = state.players[playerId].board.filter(
    (minion): minion is MinionInstance => Boolean(minion && !isUntargetable(state, minion)),
  );
  if (kings.length === 0 || candidates.length === 0) return;
  const target = candidates[rollInt(state, candidates.length)];
  const king = kings[0];
  target.attackLocked = true;
  target.attackLockedUntilTurn = Math.max(target.attackLockedUntilTurn ?? 0, state.turnNumber + 1);
  events.push(effectEvent(`${king.name} locks ${target.name}'s attacks for this turn.`, king));
}

function resolveMarkedDeaths(state: GameState, _playerId: PlayerId, events: GameEvent[]): void {
  for (const owner of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = state.players[owner].board[slot];
      if (!minion || minion.markedForDeathAtTurn === null || minion.markedForDeathAtTurn === undefined) continue;
      if (minion.markedForDeathAtTurn > state.turnNumber) continue;
      minion.markedForDeathAtTurn = null;
      destroyAtSlot(state, owner, slot, events, `${minion.name} dies from Shigaraki's mark`);
    }
  }
}

function resolveDeathStar(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const board = state.players[playerId].board;
  for (let slot = 0; slot < boardSize; slot += 1) {
    const source = board[slot];
    if (!source?.deathStarTarget || source.deathStarTarget.resolveAtTurn > state.turnNumber) continue;
    const target = source.deathStarTarget;
    source.deathStarTarget = null;
    if (target.kind === "core") {
      if (dealCoreDamage(state, target.owner, 12, events)) {
        events.push(effectEvent(`${source.name} fires on the marked core for 12 damage.`, source));
      }
    } else {
      const targetSlot = state.players[target.owner].board.findIndex((minion) => minion?.instanceId === target.instanceId);
      if (targetSlot >= 0) destroyAtSlot(state, target.owner, targetSlot, events, `${source.name} destroys the marked minion`);
    }
  }
}

function resolveEndOfTurn(state: GameState, playerId: PlayerId, _library: CardLibrary, events: GameEvent[]): void {
  for (const minion of state.players[playerId].board) {
    if (!minion || minion.attacksUsed !== 0) continue;
    for (const relic of attachedRelics(minion)) {
      if (relic.relicId !== "green_lantern_ring") continue;
      buffMinion(minion, 2, 1);
      events.push(effectEvent(`${minion.name} grows through the Green Lantern Ring (+2/+1).`, minion));
    }
  }

  const source = state.players[playerId].board.find(
    (minion) => minion && hasEffect(minion, "ragnaros_end_turn") && !minion.silenced,
  );
  if (source) {
    const target = randomEnemyMinion(state, source);
    if (target) {
      const slot = slotOf(state, target);
      if (slot >= 0) dealMinionDamage(state, target.owner, slot, 3, source, events, true);
    } else {
      const enemyId = opponent(playerId);
      if (dealCoreDamage(state, enemyId, 3, events)) {
        events.push(effectEvent(`${source.name} burns the enemy core for 3 damage.`, source));
      }
    }
  }
  resolveTemporaryControls(state, playerId, events);
}

function refreshPassiveAuras(state: GameState): void {
  for (const owner of [0, 1] as PlayerId[]) {
    const board = state.players[owner].board;
    const liveFantasticSources = new Set(
      board
        .filter((minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "fantastic_four_aura")))
        .map((minion) => minion.instanceId),
    );
    for (const target of board) {
      if (!target) continue;
      const old = target.auraBonuses ?? [];
      for (const bonus of old) {
        // A direct ATK-setting effect (for example Vader's chain) can land
        // while a positive aura is still attached.  Removing that old aura
        // must never leave a live minion below the game's 0-ATK floor.
        target.atk = Math.max(0, target.atk - bonus.atk);
        target.maxHp -= bonus.hp;
        target.hp = Math.min(target.hp, target.maxHp);
        for (const keyword of bonus.keywords) {
          const hasPrintedOrGranted = target.gainedEffects.some((effect) => effect.text.toLowerCase().includes(keyword.toLowerCase())) || target.effect.toLowerCase().includes(keyword.toLowerCase());
          if (!hasPrintedOrGranted) target.keywords = target.keywords.filter((entry) => entry !== keyword);
        }
        if (bonus.divineShield) {
          const fromAura = target.divineShieldAuraSources?.includes(bonus.sourceId) ?? false;
          target.divineShieldAuraSources = (target.divineShieldAuraSources ?? []).filter((sourceId) => sourceId !== bonus.sourceId);
          const hasPrintedOrGranted =
            hasKeyword(target, "Divine Shield") ||
            target.gainedEffects.some((effect) => effect.text.toLowerCase().includes("divine shield"));
          if (fromAura && !hasPrintedOrGranted) {
            if (!target.divineShield) {
              target.brokenAuraSources = Array.from(new Set([...(target.brokenAuraSources ?? []), bonus.sourceId]));
            } else {
              target.divineShield = false;
            }
          }
        }
      }
      target.brokenAuraSources = (target.brokenAuraSources ?? []).filter((sourceId) => liveFantasticSources.has(sourceId));
      target.divineShieldAuraSources = (target.divineShieldAuraSources ?? []).filter((sourceId) => liveFantasticSources.has(sourceId));
      target.auraBonuses = [];
    }
    for (const source of board) {
      if (!source || source.silenced) continue;
      if (hasEffect(source, "taunt_aura")) {
        for (const target of board) {
          if (!target || hasKeyword(target, "Taunt")) continue;
          target.keywords.push("Taunt");
          target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: ["Taunt"] });
        }
      }
      if (hasEffect(source, "freeman_charge_aura")) {
        for (const target of board) {
          if (!target) continue;
          if (!hasKeyword(target, "Charge")) {
            target.keywords.push("Charge");
            target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: ["Charge"] });
          }
          // Charge is normally read ONCE, when a minion is created, so granting
          // the keyword is not enough on its own: an aura has to wake what is
          // already asleep. Without this line the card would do nothing on the
          // turn Gordon lands and nothing for any minion already on the board,
          // which is most of the times you would want to play him.
          //
          // A minion woken this way stays awake if Gordon then dies, and that is
          // the intended reading rather than an oversight — it charged. The
          // keyword itself is stripped by the removal pass above, so the card
          // face stops promising something that is no longer true.
          target.sleeping = false;
        }
      }
      if (hasEffect(source, "fantastic_four_aura")) {
        for (const targetSlot of [0, 1, 2, 3]) {
          const target = board[targetSlot];
          if (!target) continue;
          if (targetSlot === 0) {
            if (!hasKeyword(target, "Taunt")) {
              target.keywords.push("Taunt");
              target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: ["Taunt"] });
            }
          } else if (targetSlot === 1) {
            const broken = target.brokenAuraSources?.includes(source.instanceId) ?? false;
            const hasPersistentShield =
              target.divineShield ||
              hasKeyword(target, "Divine Shield") ||
              target.gainedEffects.some((effect) => effect.text.toLowerCase().includes("divine shield"));
            if (!broken && !hasPersistentShield) {
              target.divineShield = true;
              target.divineShieldAuraSources = [...(target.divineShieldAuraSources ?? []), source.instanceId];
              target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: [], divineShield: true });
            }
          } else if (targetSlot === 2) {
            target.atk += 2;
            target.auraBonuses!.push({ sourceId: source.instanceId, atk: 2, hp: 0, keywords: [] });
          } else {
            target.maxHp += 2;
            target.hp += 2;
            target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 2, keywords: [] });
          }
        }
      }
      if (hasEffect(source, "buff_all_nature_2_1")) {
        // Giant Tree is an aura, not a bank of permanent start-of-turn buffs.
        // Its Nature allies therefore lose the contribution as soon as the
        // Tree leaves play or is silenced.
        for (const target of board) {
          if (!target || target.instanceId === source.instanceId || !receivesCampBuff(target, "Nature")) continue;
          target.atk += 2;
          target.maxHp += 1;
          target.hp += 1;
          target.auraBonuses!.push({ sourceId: source.instanceId, atk: 2, hp: 1, keywords: [] });
        }
      }
      if (hasEffect(source, "guts_missing_core_growth")) {
        const missingCore = Math.floor(Math.max(0, STARTING_CORE - state.players[source.owner].health) / 20);
        if (missingCore > 0) {
          source.atk += missingCore;
          source.maxHp += missingCore;
          source.hp += missingCore;
          source.auraBonuses!.push({ sourceId: source.instanceId, atk: missingCore, hp: missingCore, keywords: [] });
        }
      }
      if (!hasEffect(source, "glados_adjacent_tech")) continue;
      const sourceSlot = board.findIndex((entry) => entry?.instanceId === source.instanceId);
      for (const targetSlot of [sourceSlot - 1, sourceSlot + 1]) {
        const target = board[targetSlot];
        if (!target || !receivesCampBuff(target, "Tech")) continue;
        target.atk += 2;
        target.maxHp += 2;
        target.hp += 2;
        if (!hasKeyword(target, "Taunt")) target.keywords.push("Taunt");
        target.auraBonuses!.push({ sourceId: source.instanceId, atk: 2, hp: 2, keywords: ["Taunt"] });
      }
    }
  }
  const planetaryDefenseGrids = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "planetary_defense_grid_taunt_buff")),
    ),
  );
  for (const source of planetaryDefenseGrids) {
    for (const targetBoard of state.players.map((player) => player.board)) {
      for (const target of targetBoard) {
        if (!target || target.silenced || !hasKeyword(target, "Taunt")) continue;
        // "All OTHER Taunt minions". The grid is itself a Taunt, so without this
        // it fed its own buff and read as a 7/11 behind a 4/8's printed stats.
        if (target.instanceId === source.instanceId) continue;
        target.atk += 2;
        target.maxHp += 2;
        target.hp += 2;
        target.auraBonuses = target.auraBonuses ?? [];
        target.auraBonuses.push({ sourceId: source.instanceId, atk: 2, hp: 2, keywords: [] });
      }
    }
  }
  const battleships = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "battleship_tech_aura")),
    ),
  );
  for (const source of battleships) {
    for (const target of state.players[source.owner].board) {
      if (!target || !receivesCampBuff(target, "Tech")) continue;
      target.atk += 1;
      target.maxHp += 1;
      target.hp += 1;
      target.auraBonuses = target.auraBonuses ?? [];
      target.auraBonuses.push({ sourceId: source.instanceId, atk: 1, hp: 1, keywords: [] });
    }
  }
  const eldenBeasts = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "elden_beast_neutral_magic_atk")),
    ),
  );
  for (const source of eldenBeasts) {
    for (const target of state.players[source.owner].board) {
      if (!target || (target.alignment !== "Neutral" && target.camp !== "Magic")) continue;
      target.atk += 2;
      target.auraBonuses = target.auraBonuses ?? [];
      target.auraBonuses.push({ sourceId: source.instanceId, atk: 2, hp: 0, keywords: [] });
    }
  }
  const chaosSources = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "buff_all_friendly_3_neg2")),
    ),
  );
  for (const source of chaosSources) {
    for (const targetBoard of state.players.map((player) => player.board)) {
      for (const target of targetBoard) {
        if (!target || target.instanceId === source.instanceId) continue;
        // Chaos is global, but the -2 HP side of the aura is never allowed to
        // reduce a minion below 1 maximum/current HP.
        const hpDelta = Math.max(1 - target.maxHp, -2);
        const wasAlive = target.hp > 0;
        target.atk += 3;
        target.maxHp += hpDelta;
        // Chaos may not be the thing that kills a living minion, but it must
        // never resurrect one that was already at 0 HP and is waiting for the
        // action's death sweep.
        target.hp += hpDelta;
        if (wasAlive) target.hp = Math.max(1, target.hp);
        target.auraBonuses = target.auraBonuses ?? [];
        target.auraBonuses.push({ sourceId: source.instanceId, atk: 3, hp: hpDelta, keywords: [] });
      }
    }
  }
  const allMightSources = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "all_enemy_atk_down_1")),
    ),
  );
  for (const source of allMightSources) {
    for (const target of state.players[opponent(source.owner)].board) {
      if (!target) continue;
      // ATK is never a negative state, even if an imported/older save already
      // contains one before this aura is refreshed.
      target.atk = Math.max(0, target.atk);
      const reduction = Math.min(1, target.atk);
      target.atk -= reduction;
      target.auraBonuses = target.auraBonuses ?? [];
      target.auraBonuses.push({ sourceId: source.instanceId, atk: -reduction, hp: 0, keywords: [] });
    }
  }
}

function enforceGlobalSilence(state: GameState, events: GameEvent[]): void {
  const liveGojoIds = new Set(
    state.players.flatMap((player) =>
      player.board
        .filter((minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "yoda_global_silence")))
        .map((minion) => minion.instanceId),
    ),
  );

  // Gojo's Silence is an aura, not a permanent mutation. Remove only the
  // sources that are no longer live; a minion that was already silenced by a
  // separate effect was never claimed by this aura and stays silenced.
  for (const player of state.players) {
    for (const minion of player.board) {
      if (!minion || !minion.passiveSilenceSources?.length) continue;
      const remaining = minion.passiveSilenceSources.filter((sourceId) => liveGojoIds.has(sourceId));
      if (remaining.length === minion.passiveSilenceSources.length) continue;
      minion.passiveSilenceSources = remaining;
      if (remaining.length === 0) {
        minion.silenced = false;
        events.push(effectEvent(`${minion.name} is no longer silenced by Gojo.`, minion));
      }
    }
  }

  for (const owner of [0, 1] as PlayerId[]) {
    const gojos = state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && hasEffect(minion, "yoda_global_silence") && !minion.silenced),
    );
    if (gojos.length === 0) continue;
    const enemy = state.players[opponent(owner)];
    for (const minion of enemy.board) {
      if (!minion) continue;
      const sources = new Set(minion.passiveSilenceSources ?? []);
      // A pre-existing non-Gojo Silence is not owned by this aura. Once a
      // minion is marked by Gojo, however, all live Gojo sources are retained
      // so removing one of several Gojo cards cannot release it too early.
      if (minion.silenced && sources.size === 0) continue;
      if (isSlotProtected(state, minion) || !canDisable(state, owner, minion, "silence")) {
        if (sources.size > 0) {
          minion.passiveSilenceSources = [];
          minion.silenced = false;
          events.push(effectEvent(`${minion.name} is no longer silenced by Gojo.`, minion));
        }
        continue;
      }
      for (const gojo of gojos) sources.add(gojo.instanceId);
      const wasSilenced = minion.silenced;
      applySilence(minion, false);
      minion.passiveSilenceSources = [...sources];
      if (!wasSilenced) events.push(effectEvent(`${minion.name} is silenced by Gojo.`, gojos[0]));
    }
  }
}

/** Dumbledore's passive both blocks new disables and removes existing ones. */
function enforceDumbledoreCleansing(state: GameState, events: GameEvent[]): void {
  for (const owner of [0, 1] as PlayerId[]) {
    const board = state.players[owner].board;
    const protector = board.find((minion) => minion && hasEffect(minion, "dumbledore_cleanse") && !minion.silenced);
    if (!protector) continue;
    for (const minion of board) {
      if (!minion) continue;
      const wasSilenced = minion.silenced;
      const wasFrozen = minion.frozen;
      const wasChained = minion.chained > 0;
      const hadFreezeCurse = wasFrozen || minion.thawPending;
      if (!wasSilenced && !hadFreezeCurse && !wasChained) continue;
      minion.silenced = false;
      minion.frozen = false;
      minion.thawPending = false;
      minion.chained = 0;
      if (wasFrozen) minion.attacksUsed = 0;
      resolveChainGrowth(minion, events);
      const curses = [
        wasSilenced ? "Silence" : null,
        hadFreezeCurse ? "Freeze" : null,
        wasChained ? "Chained" : null,
      ].filter((curse): curse is string => curse !== null);
      const lastCurse = curses[curses.length - 1] ?? "their curses";
      const curseText = curses.length > 1 ? `${curses.slice(0, -1).join(", ")}, and ${lastCurse}` : lastCurse;
      events.push(effectEvent(`${protector.name} cleanses ${minion.name} of ${curseText}.`, protector));
    }
  }
}

// ---------------------------------------------------------------------------
// Ascension Relics. Relics are ordinary cards in the shared deck and hand.
// Playing one is the only path that creates an attached RelicInstance.
// ---------------------------------------------------------------------------
function grantRelic(state: GameState, playerId: PlayerId, source: MinionInstance, events: GameEvent[]): void {
  const cardId = [...state.deck, ...state.bottomDeck].find(isRelicCardId);
  if (!cardId) {
    events.push({ kind: "effect", text: "No Ascension Relic remains in the deck.", player: playerId });
    return;
  }
  removeCardFromDrawPile(state, cardId);
  putCardInHand(state, playerId, cardId, events);
  events.push({ kind: "effect", text: `${source.name} adds an Ascension Relic to hand.`, player: playerId, instanceId: source.instanceId, cardId });
}

/** Remove the temporary disable and delayed-kill states a Neuralyzer can clear. */
function cleanseNegativeStatuses(minion: MinionInstance, events: GameEvent[]): string[] {
  const removed: string[] = [];
  if (minion.silenced || minion.passiveSilenceSources.length > 0) {
    minion.silenced = false;
    minion.passiveSilenceSources = [];
    removed.push("Silence");
  }
  if (minion.frozen || minion.thawPending) {
    const wasFrozen = minion.frozen;
    minion.frozen = false;
    minion.thawPending = false;
    if (wasFrozen) minion.attacksUsed = 0;
    removed.push("Freeze");
  }
  if (minion.chained > 0) {
    minion.chained = 0;
    resolveChainGrowth(minion, events);
    removed.push("Chained");
  }
  if (minion.attackLocked || minion.attackLockedUntilTurn !== null) {
    minion.attackLocked = false;
    minion.attackLockedUntilTurn = null;
    removed.push("Attack Lock");
  }
  if (minion.markedBy !== null || minion.markedForDeathAtTurn != null) {
    minion.markedBy = null;
    minion.markedForDeathAtTurn = null;
    removed.push("Death Mark");
  }
  if (minion.delayedDestroySource !== null) {
    minion.delayedDestroySource = null;
    removed.push("Delayed Destruction");
  }
  return removed;
}

function canEquipRelicToBearer(relic: Pick<RelicDefinition | RelicInstance, "relicId">, bearer: MinionInstance): boolean {
  if (relic.relicId === "mjolnir" || relic.relicId === "excalibur") return bearer.alignment === "Good";
  return true;
}

function equipRelic(
  state: GameState,
  bearer: MinionInstance,
  relic: RelicInstance,
  library: CardLibrary,
  events: GameEvent[],
): void {
  if (!canEquipRelicToBearer(relic, bearer)) return;
  const slot = bearer.relic === null ? 0 : bearer.relic2 === null || bearer.relic2 === undefined ? 1 : -1;
  if (slot < 0) return;
  setRelicAt(bearer, slot, relic);
  events.push({
    kind: "effect",
    text: `${bearer.name} equips ${relic.name}.`,
    player: bearer.owner,
    cardId: relic.id,
    instanceId: bearer.instanceId,
  });
  if (relic.relicId === "time_turner") {
    relic.previousTurnStartHp = bearer.hp;
  }
  // One-shot relics fire the moment they are strapped on.
  if (relic.relicId === "double_stats") {
    bearer.atk *= 2;
    bearer.maxHp *= 2;
    bearer.hp *= 2;
  } else if (relic.relicId === "double_bearer_attack") {
    bearer.atk *= 2;
  } else if (relic.relicId === "pandora_box") {
    buffMinion(bearer, 4, 4);
  } else if (relic.relicId === "monkeys_paw") {
    buffMinion(bearer, 5, 5);
    relic.destroyOnTurn = state.turnNumber + 1;
  } else if (relic.relicId === "ark_divine_shield" || relic.relicId === "bearer_divine_shield") {
    bearer.divineShield = true;
  } else if (relic.relicId === "heal_full_now") {
    bearer.hp = bearer.maxHp;
  } else if (relic.relicId === "monster_cell") {
    buffMinion(bearer, 2, 2);
    if (!hasKeyword(bearer, "Taunt")) bearer.keywords.push("Taunt");
  } else if (relic.relicId === "cocoon") {
    bearer.chained = Math.max(bearer.chained, 1);
    relic.readyOnTurn = state.turnNumber + 2;
  } else if (relic.relicId === "excalibur") {
    if (!hasKeyword(bearer, "Charge")) bearer.keywords.push("Charge");
    bearer.sleeping = false;
  } else if (relic.relicId === "stand_arrow") {
    if (!coinFlip(state) || !transformMinionFromPool(state, bearer, bearer, 2, library, events)) {
      applySilence(bearer);
      events.push(effectEvent(`${bearer.name} is Silenced by the Stand Arrow.`, bearer));
    }
  } else if (relic.relicId === "poke_ball") {
    returnMinionsToHand(state, bearer.owner, [bearer], events);
    events.push(effectEvent(`${bearer.name} returns to hand in the Poké Ball.`, bearer));
  } else if (relic.relicId === "neuralyzer") {
    const removed = cleanseNegativeStatuses(bearer, events);
    const curseText = removed.length > 0 ? removed.join(", ") : "no negative effects";
    events.push(effectEvent(`The Neuralyzer removes ${curseText} from ${bearer.name}.`, bearer));
  }
}

function unequipRelic(bearer: MinionInstance, relicIndex = 0): void {
  setRelicAt(bearer, relicIndex, null);
}

function hasRelic(minion: MinionInstance | null | undefined, relicId: string): boolean {
  return Boolean(minion && attachedRelics(minion).some((relic) => relic.relicId === relicId));
}

function hasDominionAuthority(state: GameState, owner: PlayerId): boolean {
  return state.players[owner].board.some(
    (minion) => minion && !minion.silenced && hasEffect(minion, "dominion_authority"),
  );
}

function blockedByDominionAuthority(state: GameState, source: MinionInstance, targetOwner: PlayerId): boolean {
  return source.owner !== targetOwner && hasDominionAuthority(state, targetOwner);
}

/** All published relic card IDs use the r### namespace; minions use c###. */
function isRelicCardId(cardId: string): boolean {
  return /^r\d+$/i.test(cardId);
}

/** Mind control: move a minion to the other board if there is room for it. */
function seizeMinion(state: GameState, source: MinionInstance, victim: MinionInstance, events: GameEvent[]): void {
  if (blockedByDominionAuthority(state, source, victim.owner)) {
    events.push(effectEvent(`${victim.name} is protected by Dominion Authority.`, victim));
    return;
  }
  const fromSlot = slotOf(state, victim);
  const taker = state.players[source.owner];
  const freeSlot = taker.board.findIndex((slot) => !slot);
  if (fromSlot < 0 || freeSlot < 0) {
    events.push(effectEvent(`${source.name} has no room to seize ${victim.name}.`, source));
    return;
  }
  state.players[victim.owner].board[fromSlot] = null;
  victim.owner = source.owner;
  victim.sleeping = !hasKeyword(victim, "Charge");
  victim.attacksUsed = 0;
  taker.board[freeSlot] = victim;
  events.push(effectEvent(`${source.name} seizes ${victim.name}.`, source));
}

/** Motoko's temporary seizure: the victim returns after her controller's next turn. */
function seizeMinionTemporarily(
  state: GameState,
  source: MinionInstance,
  victim: MinionInstance,
  events: GameEvent[],
): void {
  if (blockedByDominionAuthority(state, source, victim.owner)) {
    events.push(effectEvent(`${victim.name} is protected by Dominion Authority.`, victim));
    return;
  }
  const fromSlot = slotOf(state, victim);
  const taker = state.players[source.owner];
  const freeSlot = taker.board.findIndex((slot) => !slot);
  if (fromSlot < 0 || freeSlot < 0) {
    events.push(effectEvent(`${source.name} has no room to seize ${victim.name}.`, source));
    return;
  }
  state.players[victim.owner].board[fromSlot] = null;
  const originalOwner = victim.owner;
  victim.owner = source.owner;
  victim.sleeping = !hasKeyword(victim, "Charge");
  victim.attacksUsed = 0;
  victim.temporaryControl = {
    originalOwner,
    originalSlot: fromSlot,
    expiresAtTurn: state.turnNumber + 2,
    expiresAfterPlayer: source.owner,
  } satisfies TemporaryMinionControl;
  taker.board[freeSlot] = victim;
  events.push(effectEvent(`${source.name} takes control of ${victim.name} until the end of your next turn.`, source));
}

/** Return every still-living Motoko victim when the promised control window ends. */
function resolveTemporaryControls(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const due = state.players.flatMap((player) =>
    player.board
      .map((minion, slot) => ({ owner: player.id, minion, slot }))
      .filter(({ minion }) =>
        minion &&
        minion.temporaryControl &&
        minion.temporaryControl.expiresAfterPlayer === playerId &&
        minion.temporaryControl.expiresAtTurn <= state.turnNumber,
      ),
  );

  for (const entry of due) {
    const victim = entry.minion;
    if (!victim?.temporaryControl) continue;
    const control = victim.temporaryControl;
    const currentSlot = state.players[entry.owner].board.findIndex(
      (minion) => minion?.instanceId === victim.instanceId,
    );
    if (currentSlot < 0) continue;

    state.players[entry.owner].board[currentSlot] = null;
    victim.owner = control.originalOwner;
    victim.temporaryControl = null;
    victim.sleeping = !hasKeyword(victim, "Charge");
    victim.attacksUsed = 0;
    const originalBoard = state.players[control.originalOwner].board;
    const preferred = Math.max(0, Math.min(boardSize - 1, control.originalSlot));
    const returnSlot = !originalBoard[preferred] ? preferred : originalBoard.findIndex((minion) => !minion);
    if (returnSlot >= 0) {
      originalBoard[returnSlot] = victim;
      events.push({
        kind: "effect",
        text: `${victim.name} returns to its owner after Motoko's control ends.`,
        player: control.originalOwner,
        instanceId: victim.instanceId,
        motion: "return",
      });
    } else {
      discardAttachedRelics(state, victim);
      putCardInHand(state, control.originalOwner, victim.cardId, events, victim.instanceId);
      events.push({
        kind: "effect",
        text: `${victim.name} returns to its owner's hand after Motoko's control ends.`,
        player: control.originalOwner,
        instanceId: victim.instanceId,
        motion: "return",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Slot auras. A mark on a POSITION, not on a minion — and permanent: the caster
// can die, be silenced or be bounced and the slot stays marked for the rest of
// the duel (owner ruling). Whoever stands there next inherits it, which is what
// makes a 10-mana card worth its cost.
// ---------------------------------------------------------------------------
function layAura(
  state: GameState,
  target: TargetOption,
  auraId: SlotAuraId,
  source: MinionInstance,
  events: GameEvent[],
): void {
  // A slot mark is committed only after the targeting answer has been applied.
  // Keeping this guard here makes a future multi-step effect unable to leak a
  // provisional/random marker into the board while its prompt is still open.
  if (state.phase === "targeting" || state.pendingTarget) return;
  const board = state.players[target.owner];
  const existing = board.slotAuras.find((aura) => aura.slot === target.slot && aura.auraId === auraId);
  if (existing) return;
  board.slotAuras.push({ slot: target.slot, auraId, sourceName: source.name });
  events.push(effectEvent(`${source.name} marks ${board.name}'s slot ${target.slot + 1} — permanently.`, source));
  enforceSlotAuras(state, events);
}

function hasSlotAura(state: GameState, owner: PlayerId, slot: number, auraId: SlotAuraId): boolean {
  return state.players[owner].slotAuras.some((aura) => aura.slot === slot && aura.auraId === auraId);
}

/**
 * Applies the auras that change a minion's STATE rather than its behaviour.
 * Called after every action, so a minion that walks into a silenced slot by any
 * route — played, summoned, seized, defected — is caught.
 */
function enforceSlotAuras(state: GameState, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    const player = state.players[playerId];
    for (const aura of player.slotAuras) {
      const minion = player.board[aura.slot];
      if (aura.auraId === "slot_stats_one" && minion) {
        minion.atk = 1;
        minion.maxHp = 1;
        minion.hp = 1;
      }
      if (aura.auraId === "slot_chain") {
        if (
          minion &&
          minion.chained === 0 &&
          !isSlotProtected(state, minion) &&
          canDisable(state, playerId, minion, "chain")
        ) {
          minion.chained = 2;
          events.push({
            kind: "effect",
            text: `${minion.name} is permanently Chained by the mark on slot ${aura.slot + 1}.`,
            player: playerId,
            instanceId: minion.instanceId,
          });
        }
        continue;
      }
      if (aura.auraId !== "slot_silence") continue;
      if (minion && !minion.silenced && !isSlotProtected(state, minion)) {
        if (!canDisable(state, playerId, minion, "silence")) continue;
        applySilence(minion);
        events.push({
          kind: "effect",
          text: `${minion.name} is silenced by the mark on slot ${aura.slot + 1}.`,
          player: playerId,
          instanceId: minion.instanceId,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Forced-random attacks. Three sources, one question: does this minion get to
// choose? Legality stays honest — every normal target is still offered — and the
// swing is redirected at resolution, so the roll happens once, in the engine,
// with the seeded generator.
// ---------------------------------------------------------------------------
export function attacksRandomly(state: GameState, attacker: MinionInstance): boolean {
  const slot = slotOf(state, attacker);
  if (slot >= 0 && hasSlotAura(state, attacker.owner, slot, "random_attacks")) return true;
  const confusedUntil = state.players[attacker.owner].confusedUntilTurn;
  if (confusedUntil !== null && confusedUntil > state.turnNumber) return true;
  const randomFrom = state.players[attacker.owner].randomAttacksFromTurn;
  const randomUntil = state.players[attacker.owner].randomAttacksUntilTurn;
  if (randomFrom !== null && randomFrom !== undefined && randomUntil !== null && randomUntil !== undefined) {
    if (state.turnNumber >= randomFrom && state.turnNumber <= randomUntil) return true;
  }
  // Kurogiri drags everyone into the fog, both boards, while it lives.
  return state.players.some((player) =>
    player.board.some((minion) => minion && hasEffect(minion, "chaos_aura") && !minion.silenced),
  );
}

/**
 * Picks where a blind swing actually lands. Guards still hold — Taunt and Kojiro
 * narrow the pool before the roll, rather than being bypassed by it.
 */
function randomAttackTarget(state: GameState, attacker: MinionInstance): number | "core" | null {
  const enemy = state.players[opponent(attacker.owner)];
  const ignoresGuards = hasRelic(attacker, "ignore_defences");
  const ignoresTaunt = tauntBypassActive(attacker);
  const bodyguard = enemy.board.findIndex(
    (minion) => minion && attackTargetable(state, minion) && hasEffect(minion, "redirect_attacks") && !minion.silenced,
  );
  const taunts = enemy.board
    .map((minion, slot) => ({ minion, slot }))
    .filter(({ minion }) => minion && attackTargetable(state, minion) && hasKeyword(minion, "Taunt") && !minion.silenced)
    .map(({ slot }) => slot);
  let pool: number[];
  if (!ignoresGuards && bodyguard >= 0) pool = [bodyguard];
  else if (!ignoresGuards && !ignoresTaunt && taunts.length) pool = taunts;
  else {
    pool = enemy.board
      .map((minion, slot) => ({ minion, slot }))
      .filter(({ minion }) => minion && attackTargetable(state, minion))
      .map(({ slot }) => slot);
  }
  const legal = pool.filter((slot) => {
    const target = enemy.board[slot];
    return target ? canDeclareAttack(state, attacker, target) : false;
  });
  if (legal.length > 0) return legal[rollInt(state, legal.length)];
  // Nothing on the board it may hit — the core is the only thing left.
  return hasHighestAttackRestriction(state, attacker) || (!ignoresGuards && (bodyguard >= 0 || (!ignoresTaunt && taunts.length))) ? null : "core";
}

/** Where a minion currently sits, or -1 if it has left the board. */
function slotOf(state: GameState, minion: MinionInstance | null): number {
  if (!minion) return -1;
  return state.players[minion.owner].board.findIndex((entry) => entry?.instanceId === minion.instanceId);
}

function destroyPicked(
  state: GameState,
  source: MinionInstance,
  picked: MinionInstance | null,
  message: string,
  events: GameEvent[],
): void {
  const slot = slotOf(state, picked);
  if (!picked || slot < 0) return;
  destroyAtSlot(state, picked.owner, slot, events, `${source.name} ${message}: ${picked.name}`, source);
}

/** Return a just-played target-card before its Battlecry resolves. */
function cancelPendingTarget(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const pending = state.pendingTarget;
  const cancel = pending?.cancelPlay;
  if (!pending || !cancel || pending.player !== playerId || cancel.player !== playerId) return;

  const player = state.players[playerId];
  const minion = player.board[cancel.slotIndex];
  if (!minion || minion.instanceId !== cancel.instanceId || minion.cardId !== cancel.cardId) return;

  player.board[cancel.slotIndex] = null;
  player.hand.splice(Math.min(cancel.handIndex, player.hand.length), 0, cancel.cardId);
  player.mana += cancel.manaRefund;
  if (cancel.previousCostReduction === undefined) delete player.costReductions[cancel.cardId];
  else player.costReductions[cancel.cardId] = cancel.previousCostReduction;
  player.pressured = cancel.previousPressured ? { ...cancel.previousPressured } : null;
  state.pendingTarget = null;
  state.pendingPlayCancel = null;
  state.phase = "main";
  events.push({
    kind: "draw",
    text: `${minion.name} returns to ${player.name}'s hand.`,
    player: playerId,
    cardId: cancel.cardId,
    instanceId: cancel.instanceId,
    motion: "return",
  });
}

/**
 * Resolves the target a player just named, then drains whatever was left of the
 * start-of-turn effect queue behind it.
 */
function chooseTarget(state: GameState, choiceIndex: number, library: CardLibrary, events: GameEvent[]): void {
  const pending = state.pendingTarget;
  if (!pending) return;
  const queuedRelicSources = pending.queuedRelicSources ?? [];
  let answer: ResolvedChoice | null = null;
  if ((pending.kind === "board" || pending.kind === "slot" || pending.kind === "boardOrCore") && pending.options[choiceIndex]) {
    answer = {
      kind: "board",
      target: pending.options[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "boardOrCore" && pending.coreOption && choiceIndex === pending.options.length) {
    answer = {
      kind: "core",
      owner: opponent(pending.sourceOwner),
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "hand" && pending.handOptions[choiceIndex]) {
    answer = {
      kind: "hand",
      hand: pending.handOptions[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "option" && pending.labelOptions[choiceIndex]) {
    answer = {
      kind: "option",
      option: pending.labelOptions[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  }
  state.pendingTarget = null;
  state.phase = "main";
  if (answer) {
    if (pending.heroPowerId) {
      resolveHeroPower(state, pending.sourceOwner, pending.heroPowerId, answer, events);
    } else {
    const slotIndex = state.players[pending.sourceOwner].board.findIndex(
      (minion) => minion?.instanceId === pending.sourceInstanceId,
    );
    const source = slotIndex >= 0 ? state.players[pending.sourceOwner].board[slotIndex] : null;
    if (source) {
      runEffect(state, source, slotIndex, library, events, answer);
      // A copied effect keeps its borrower wearing it across every prompt it
      // opens, so the minion's own effect is only put back once the copy has no
      // question left. `restoreCopiedEffect` declines while a prompt is open.
      restoreCopiedEffect(state, source);
    }
    }
  }
  if (state.phase === "main") {
    if (queuedRelicSources.length > 0) {
      triggerRelicDiscoveries(state, pending.sourceOwner, queuedRelicSources, library, events);
    }
    if (state.phase === "main") processEffectQueue(state, library, events);
  }
}

/**
 * Runs queued start-of-turn effects one at a time, stopping the moment one asks
 * for a target so the rest do not fire behind an open prompt.
 */
function processEffectQueue(state: GameState, library: CardLibrary, events: GameEvent[]): void {
  while (state.effectQueue.length > 0) {
    const entry = state.effectQueue[0];
    state.effectQueue.shift();
    const board = state.players[entry.owner].board;
    const slotIndex = board.findIndex((minion) => minion?.instanceId === entry.instanceId);
    if (slotIndex < 0) continue;
    const minion = board[slotIndex];
    if (!minion || minion.silenced || minion.chained > 0 || minion.frozen) continue;
    if (
      minion.effectTiming !== "ongoing" &&
      minion.effectTiming !== "onPlayAndOngoing" &&
      !battlecryRunsAsOngoing(minion)
    ) continue;
    if (minion.gainedEffects.some((effect) => effect.timing === "ongoing")) {
      const ownEffectId = minion.effectId;
      for (const gained of minion.gainedEffects.filter((effect) => effect.timing === "ongoing")) {
        minion.effectId = gained.effectId;
        if (runEffect(state, minion, slotIndex, library, events)) {
          minion.effectId = ownEffectId;
          return;
        }
      }
      minion.effectId = ownEffectId;
    }
    if (runEffect(state, minion, slotIndex, library, events)) return;
  }
}

function damageAllEnemies(
  state: GameState,
  source: MinionInstance,
  amount: number,
  events: GameEvent[],
  godzillaPath: ReadonlySet<string> = new Set(),
): void {
  const enemyId = opponent(source.owner);
  for (let slotIndex = 0; slotIndex < boardSize; slotIndex += 1) {
    if (state.players[enemyId].board[slotIndex]) {
      // Each target is its own branch of a reactive chain. Copying the path
      // prevents Godzillas from ping-ponging forever without suppressing a
      // second, separate hit later in the same area effect.
      dealMinionDamage(state, enemyId, slotIndex, amount, source, events, true, new Set(godzillaPath));
    }
  }
}

function damageAllEnemiesAndCore(
  state: GameState,
  source: MinionInstance,
  amount: number,
  events: GameEvent[],
  godzillaPath: ReadonlySet<string>,
): void {
  damageAllEnemies(state, source, amount, events, godzillaPath);
  const enemyId = opponent(source.owner);
  if (dealCoreDamage(state, enemyId, amount, events)) {
    events.push(effectEvent(`${source.name} deals ${amount} damage to all enemies and the enemy core.`, source));
  }
}

function dealMinionDamage(
  state: GameState,
  owner: PlayerId,
  slotIndex: number,
  amount: number,
  source: MinionInstance,
  events: GameEvent[],
  effectDamage = false,
  godzillaPath: ReadonlySet<string> = new Set(),
  combatDamage = false,
  attackTarget = false,
): void {
  const target = state.players[owner].board[slotIndex];
  if (!target || amount <= 0) return;
  if (!canDamage(state, source, target, effectDamage, events, combatDamage, attackTarget)) return;
  amount = modifyIncoming(state, source, target, amount);
  if (!target.silenced && hasEffect(target, "superman_damage_cap_3")) {
    amount = Math.min(amount, 3);
  }
  if (amount <= 0) return;
  // Shinigami Eyes reads straight past a Divine Shield.
  if (target.divineShield && !hasRelic(source, "ignore_defences")) {
    target.divineShield = false;
    events.push({ kind: "combat", text: `${target.name}'s Divine Shield breaks.`, player: owner, instanceId: target.instanceId });
    return;
  }
  target.hp -= amount;
  events.push({ kind: "damage", text: `${target.name} takes ${amount} damage.`, player: owner, instanceId: target.instanceId });
  if (
    target.hp > 0 &&
    hasEffect(target, "godzilla_damage_burst") &&
    !target.silenced &&
    !godzillaPath.has(target.instanceId)
  ) {
    const nextPath = new Set(godzillaPath);
    nextPath.add(target.instanceId);
    damageAllEnemiesAndCore(state, target, 2, events, nextPath);
  }
  if (target.hp > 0 && hasEffect(source, "shigaraki_decay") && !source.silenced) {
    target.markedBy = source.instanceId;
    target.markedForDeathAtTurn = state.turnNumber + 2;
    events.push(effectEvent(`${source.name} marks ${target.name} for decay.`, source));
  }
  if (target.hp <= 0) {
    destroyAtSlot(state, owner, slotIndex, events, `${target.name} falls`, effectDamage ? null : source);
  }
}

/** Relic damage maths, applied after the blow is allowed but before it lands. */
function modifyIncoming(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  amount: number,
): number {
  const relics = attachedRelics(target);
  let modified = amount;
  if (relics.some((relic) => relic.relicId === "half_from_nature") && source.camp === "Nature") {
    modified = Math.floor(modified / 2);
  } else if (relics.some((relic) => relic.relicId === "half_from_tech") && source.camp === "Tech") {
    modified = Math.floor(modified / 2);
  } else if (relics.some((relic) => relic.relicId === "half_from_magic") && source.camp === "Magic") {
    modified = Math.floor(modified / 2);
  }
  // Philosopher's Stone: untouchable on your own turn, brittle on theirs.
  else if (relics.some((relic) => relic.relicId === "philosophers_stone") && state.activePlayer !== target.owner) {
    modified = amount * 2;
  }
  const damageReduction = state.players[target.owner].board.filter(
    (minion) => minion && minion.instanceId !== target.instanceId && hasEffect(minion, "prince_lloyd_damage_ward"),
  ).length;
  return Math.max(0, modified - damageReduction);
}

function canDamage(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  effectDamage: boolean,
  events: GameEvent[],
  combatDamage: boolean,
  attackTarget: boolean,
): boolean {
  if (combatDamage && !attackTarget && hasRelic(target, "mjolnir")) {
    events.push(effectEvent(`${target.name} is Invulnerable while attacking with Mjolnir.`, target));
    return false;
  }
  if (!effectDamage && target.chained > 0) {
    events.push(effectEvent(`${target.name} is protected by its chains.`, target));
    return false;
  }
  if (target.untargetableUntilTurn !== null && target.untargetableUntilTurn !== undefined && target.untargetableUntilTurn > state.turnNumber) {
    events.push(effectEvent(`${target.name} is Chained beyond harm.`, target));
    return false;
  }
  // Neo's slot protection blocks Silence, Freeze, and Chained effects. Damage —
  // including normal combat damage — still reaches the minion in that slot.
  if (target.invulnerableUntilTurn !== null && target.invulnerableUntilTurn > state.turnNumber) {
    events.push(effectEvent(`${target.name} is Invulnerable.`, target));
    return false;
  }
  if (combatDamage && attackTarget && hasRelic(target, "immune_nature_attacks") && source.camp === "Nature") {
    events.push(effectEvent(`${target.name} is invulnerable to Nature attacks.`, target));
    return false;
  }
  if (combatDamage && attackTarget && hasRelic(target, "immune_tech_attacks") && source.camp === "Tech") {
    events.push(effectEvent(`${target.name} is invulnerable to Tech attacks.`, target));
    return false;
  }
  // Doomsday's adaptation, and the defensive relics.
  if (target.campImmunity && target.campImmunity.untilTurn > state.turnNumber && target.campImmunity.camp === source.camp) {
    events.push(effectEvent(`${target.name} has adapted to ${source.camp}.`, target));
    return false;
  }
  if (combatDamage && attackTarget && hasRelic(target, "immune_magic") && source.camp === "Magic") {
    events.push(effectEvent(`${target.name}'s Lostvayne turns the Magic aside.`, target));
    return false;
  }
  if (hasEffect(target, "immune_nature_tech") && (source.camp === "Nature" || source.camp === "Tech") && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to ${source.camp} damage.`, target));
    return false;
  }
  if (hasEffect(target, "immune_magic_minions") && source.camp === "Magic" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Magic minions.`, target));
    return false;
  }
  if (hasEffect(target, "immune_tech_minions") && source.camp === "Tech" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Tech minions.`, target));
    return false;
  }
  if (hasEffect(target, "immune_nature_minions") && source.camp === "Nature" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Nature minions.`, target));
    return false;
  }
  if (hasRelic(target, "philosophers_stone") && state.activePlayer === target.owner) {
    events.push(effectEvent(`${target.name} is untouchable while the Stone holds.`, target));
    return false;
  }
  if (!target.silenced) {
    const ownerBoard = state.players[target.owner].board;
    if (
      hasEffect(target, "invulnerable_if_frozen") &&
      state.players.some((player) => player.board.some((minion) => minion?.frozen))
    ) {
      events.push(effectEvent(`${target.name} is Invulnerable while a minion is Frozen.`, target));
      return false;
    }
    if (hasEffect(target, "invuln_if_alone") && ownerBoard.filter(Boolean).length <= 1) {
      events.push(effectEvent(`${target.name} is untouchable while alone.`, target));
      return false;
    }
    if (
      hasEffect(target, "invuln_with_good_ally") &&
      ownerBoard.some((minion) => minion && minion.instanceId !== target.instanceId && minion.alignment === "Good")
    ) {
      events.push(effectEvent(`${target.name} is shielded by an ally.`, target));
      return false;
    }
    if (hasEffect(target, "invuln_if_three_good") && ownerBoard.filter((minion) => minion?.alignment === "Good").length >= 3) {
      events.push(effectEvent(`${target.name} is untouchable.`, target));
      return false;
    }
  }
  if (!effectDamage && source.owner !== target.owner && hasEffect(target, "evade_first_attack") && !target.silenced) {
    if (target.evadedAttackAtTurn !== state.turnNumber) {
      target.evadedAttackAtTurn = state.turnNumber;
      events.push(effectEvent(`${target.name} evades the first attack targeting it this turn.`, target));
      return false;
    }
  }
  if (!effectDamage && source.owner !== target.owner && !target.silenced) {
    const kojiro = state.players[target.owner].board.find(
      (minion) =>
        minion &&
        minion.instanceId !== target.instanceId &&
        hasEffect(minion, "evade_allies_33") &&
        !minion.silenced,
    );
    if (kojiro && rollInt(state, 100) < 33) {
      events.push(effectEvent(`${kojiro.name} helps ${target.name} evade the attack.`, kojiro));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "high_attack_only") && source.atk < 5 && !target.silenced) {
    events.push(effectEvent(`${target.name}'s Infinity stops weak attacks.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "small_cannot_attack") && source.atk < 5 && !target.silenced) {
    events.push(effectEvent(`${target.name} ignores the weak ATK damage.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "small_attack_ward") && source.atk <= 2 && !target.silenced) {
    events.push(effectEvent(`${target.name} shrugs off the strike.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "mid_attack_only") && source.atk < 4 && !target.silenced) {
    events.push(effectEvent(`${target.name} ignores the weak blow.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "korosensei_defense") && source.atk < 4 && !target.silenced) {
    events.push(effectEvent(`${target.name} ignores the weak blow.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "oliva_ward") && source.atk < 2 && !target.silenced) {
    events.push(effectEvent(`${target.name} is unmoved.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "dodge_50") && !target.silenced) {
    if (coinFlip(state)) {
      events.push(effectEvent(`${target.name} slips away.`, target));
      return false;
    }
  }
  if (!effectDamage && hasRelic(target, "evade_50") && !target.silenced) {
    if (coinFlip(state)) {
      events.push(effectEvent(`${target.name} evades the attack through Infinity Castle.`, target));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "dodge_80") && !target.silenced) {
    if (rollInt(state, 100) < 80) {
      events.push(effectEvent(`${target.name} slips away.`, target));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "dodge_75") && !target.silenced) {
    if (rollInt(state, 100) < 75) {
      events.push(effectEvent(`${target.name} evades the attack.`, target));
      return false;
    }
  }
  if (!effectDamage && source.owner !== target.owner && hasEffect(target, "kaku_evade_counter") && !target.silenced) {
    if (rollInt(state, 100) < 50) {
      events.push(effectEvent(`${target.name} evades the attack and turns its force back.`, target));
      const attackerSlot = slotOf(state, source);
      if (attackerSlot >= 0) {
        dealMinionDamage(state, source.owner, attackerSlot, source.atk, target, events, true);
      }
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "korosensei_defense") && !target.silenced) {
    if (rollInt(state, 100) < 20) {
      events.push(effectEvent(`${target.name} evades the attack.`, target));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "evasive") && !target.silenced) {
    if (coinFlip(state)) {
      events.push(effectEvent(`${target.name} evades the attack.`, target));
      return false;
    }
  }
  return true;
}

function canDeclareAttack(state: GameState, attacker: MinionInstance, target: MinionInstance): boolean {
  // Mahoraga: it adapts, and no attacker gets a second look at it all game.
  if (hasEffect(target, "attack_once_ever") && !target.silenced && target.attackedBy.includes(attacker.instanceId)) {
    return false;
  }
  if (hasHighestAttackRestriction(state, attacker) && target.atk !== highestEnemyAttack(state, attacker.owner)) {
    return false;
  }
  return true;
}

function hasHighestAttackRestriction(state: GameState, attacker: MinionInstance): boolean {
  return hasEffect(attacker, "highest_atk_only") && !attacker.silenced && highestEnemyAttack(state, attacker.owner) >= 0;
}

function highestEnemyAttack(state: GameState, owner: PlayerId): number {
  const attacks = state.players[opponent(owner)].board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .map((minion) => minion.atk);
  return attacks.length > 0 ? Math.max(...attacks) : -1;
}

function canAttack(minion: MinionInstance): boolean {
  if (!minion.silenced && (hasEffect(minion, "watcher_reveal_hand") || hasEffect(minion, "ragnaros_end_turn"))) return false;
  if (!minion.silenced && hasKeyword(minion, "Cannot Attack")) return false;
  if (hasEffect(minion, "evasive") && !minion.silenced) return false;
  if (minion.attackLocked) return false; // APR has taken this swing until its lock expires
  // A 0-ATK minion may still declare an attack; it simply deals no damage.
  return !minion.sleeping && !minion.frozen && minion.chained === 0 && minion.attacksUsed < maxAttacks(minion);
}

/** Exported so the bot reads the SAME rule rather than keeping its own copy —
 *  it used to count every minion's swing once, which silently hid Flash's and
 *  Vergil's extra attacks from its lethal check. */
export function maxAttacks(minion: MinionInstance): number {
  // Flash keeps the original multi-attack passive and Divine Shield, but his
  // current card pass caps the speed at two swings.
  if (!minion.silenced && hasEffect(minion, "flash_speed")) return 2;
  if (!minion.silenced && hasEffect(minion, "attack_2x")) return 2;
  if (!minion.silenced && hasRelic(minion, "double_attack")) return 2;
  return 1;
}

function battlecryRunsAsOngoing(minion: MinionInstance): boolean {
  return (
    hasRelic(minion, "battlecry_to_ongoing") &&
    (minion.effectTiming === "onPlay" || minion.effectTiming === "onPlayAndDeathrattle")
  );
}

function hasKeyword(card: Pick<CardDefinition | MinionInstance, "keywords">, keyword: string): boolean {
  return card.keywords.some((entry) => entry === keyword);
}

function hasEffect(minion: MinionInstance, effectId: EffectId): boolean {
  const held = minion.effectId === effectId || minion.gainedEffects.some((effect) => effect.effectId === effectId);
  // A Chained minion is temporarily out of the duel in the same way a
  // Silenced minion is out of the rules text: its passive, aura, immunity and
  // other effect hooks do not answer while the chain counter is running.
  const active = !minion.silenced && minion.chained === 0;
  // Only a TRUE answer counts as the effect having been exercised. Recording
  // every question instead would mark a passive as covered because some other
  // card asked whether this minion had it, which is the opposite of the truth.
  if (held && active) traceEffect(effectId);
  return held && active;
}

function tauntBypassActive(minion: MinionInstance): boolean {
  return !minion.silenced && (hasEffect(minion, "charge_ignore_taunt") || hasEffect(minion, "black_ops_ignore_taunt"));
}

function isSlotProtected(state: GameState, minion: MinionInstance): boolean {
  const slot = slotOf(state, minion);
  return slot >= 0 && hasSlotAura(state, minion.owner, slot, "slot_protected");
}

function hasDumbledoreProtection(state: GameState, target: MinionInstance): boolean {
  return state.players[target.owner].board.some(
    (minion) => minion && hasEffect(minion, "dumbledore_cleanse") && !minion.silenced,
  );
}

function buffMinion(minion: MinionInstance, atk: number, hp: number): void {
  minion.atk += atk;
  minion.maxHp += hp;
  minion.hp += hp;
}

function resolveChainGrowth(minion: MinionInstance, events: GameEvent[]): void {
  if (!minion.chainGrowthPending || minion.chained > 0) return;
  minion.chainGrowthPending = false;
  buffMinion(minion, 1, 1);
  events.push(effectEvent(`${minion.name} breaks free and gains +1/+1.`, minion));
}

/**
 * Minions have two independent Ascension Relic straps. `relic` remains the
 * first slot for save and test compatibility; `relic2` is the new second slot.
 */
function attachedRelics(minion: MinionInstance): RelicInstance[] {
  return [minion.relic, minion.relic2 ?? null].filter((relic): relic is RelicInstance => relic !== null);
}

function relicAt(minion: MinionInstance, index: number): RelicInstance | null {
  return index === 0 ? minion.relic : minion.relic2 ?? null;
}

function setRelicAt(minion: MinionInstance, index: number, relic: RelicInstance | null): void {
  if (index === 0) minion.relic = relic;
  else minion.relic2 = relic;
}

function firstRelicIndex(minion: MinionInstance, predicate: (relic: RelicInstance) => boolean = () => true): number {
  for (const index of [0, 1]) {
    const relic = relicAt(minion, index);
    if (relic && predicate(relic)) return index;
  }
  return -1;
}

function hasAnyRelic(minion: MinionInstance | null | undefined): boolean {
  return Boolean(minion && (minion.relic || minion.relic2));
}

function hasFreeRelicSlot(minion: MinionInstance): boolean {
  return minion.relic === null || minion.relic2 === null || minion.relic2 === undefined;
}

function discardAttachedRelics(state: GameState, minion: MinionInstance): void {
  for (const relic of attachedRelics(minion)) state.discard.push(relic.id);
  minion.relic = null;
  minion.relic2 = null;
}

function randomEnemyMinion(state: GameState, source: MinionInstance): MinionInstance | null {
  const candidates = state.players[opponent(source.owner)].board.filter(
    (minion): minion is MinionInstance => {
      if (!minion) return false;
      return enemyTargetable(state, minion);
    },
  );
  return candidates.length > 0 ? candidates[rollInt(state, candidates.length)] : null;
}

function transformIntoLunarSlime(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  events: GameEvent[],
): void {
  if (blockedByDominionAuthority(state, source, target.owner)) {
    events.push(effectEvent(`${target.name} is protected by Dominion Authority.`, target));
    return;
  }
  if (!canDisable(state, source.owner, target)) {
    events.push(effectEvent(`${target.name} resists the Lunar Slime transformation.`, target));
    return;
  }
  if (target.temporaryTransform?.kind === "lunar_slime") {
    target.temporaryTransform.expiresAtTurn = state.turnNumber + 2;
    target.temporaryTransform.restoreOnPlayer = source.owner;
    events.push(effectEvent(`${source.name} refreshes ${target.name} as a Lunar Slime.`, source));
    return;
  }

  const original: TemporaryMinionTransform["original"] = {
    name: target.name,
    cost: target.cost,
    atk: target.atk,
    hp: target.hp,
    maxHp: target.maxHp,
    baseAtk: target.baseAtk,
    baseHp: target.baseHp,
    rarity: target.rarity,
    camp: target.camp,
    alignment: target.alignment,
    keywords: [...target.keywords],
    effectId: target.effectId,
    effectTiming: target.effectTiming,
    effect: target.effect,
    origin: target.origin,
    art: target.art,
    silenced: target.silenced,
    passiveSilenceSources: [...(target.passiveSilenceSources ?? [])],
    divineShield: target.divineShield,
    stolenPassiveFrom: target.stolenPassiveFrom,
    stolenPassiveText: target.stolenPassiveText,
    gainedEffects: target.gainedEffects.map((effect) => ({ ...effect })),
    relicDiscoveryTurn: target.relicDiscoveryTurn,
  };
  target.temporaryTransform = {
    kind: "lunar_slime",
    expiresAtTurn: state.turnNumber + 2,
    restoreOnPlayer: source.owner,
    original,
  };
  target.name = "Lunar Slime";
  target.cost = 1;
  target.atk = 1;
  target.hp = 1;
  target.maxHp = 1;
  target.baseAtk = 1;
  target.baseHp = 1;
  target.rarity = "Black";
  target.camp = "Nature";
  target.alignment = "Neutral";
  target.keywords = [];
  target.effectId = "none";
  target.effectTiming = "none";
  target.effect = "-";
  target.origin = "Elden Ring";
  target.silenced = false;
  target.passiveSilenceSources = [];
  target.divineShield = false;
  target.stolenPassiveFrom = null;
  target.stolenPassiveText = null;
  target.gainedEffects = [];
  events.push(effectEvent(`${source.name} transforms ${original.name} into a 1/1 Lunar Slime.`, source));
}

function restoreExpiredTransforms(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  for (const minion of state.players.flatMap((player) => player.board)) {
    const transform = minion?.temporaryTransform;
    if (!minion || !transform || transform.restoreOnPlayer !== playerId || transform.expiresAtTurn > state.turnNumber) continue;
    Object.assign(minion, transform.original);
    minion.keywords = [...transform.original.keywords];
    minion.gainedEffects = transform.original.gainedEffects.map((effect) => ({ ...effect }));
    minion.temporaryTransform = null;
    events.push(effectEvent(`${minion.name} returns from Lunar Slime form.`, minion));
  }
}

function firstFriendlyByAlignment(player: PlayerState, alignment: string): MinionInstance | null {
  return player.board.find((minion) => minion?.alignment === alignment) ?? null;
}

/**
 * Thaws every minion that spent this whole turn frozen. Only those flagged at
 * turn start qualify, so a minion frozen mid-turn (King's freeze_attacker, say)
 * still owes a full turn and is not let off by the turn simply ending.
 */
function thawServed(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  for (const minion of state.players[playerId].board) {
    if (!minion || !minion.thawPending) continue;
    minion.frozen = false;
    minion.thawPending = false;
    events.push({ kind: "effect", text: `${minion.name} thaws.`, player: playerId, instanceId: minion.instanceId });
  }
}

function applyFreeze(state: GameState, source: MinionInstance, target: MinionInstance, events: GameEvent[]): void {
  if (isSlotProtected(state, target) || !canDisable(state, source.owner, target, "freeze")) {
    events.push(effectEvent(`${target.name} resists Freeze.`, target));
    return;
  }
  target.frozen = true;
  target.attacksUsed = maxAttacks(target);
  events.push(effectEvent(`${source.name} freezes ${target.name}.`, source));
}

type DisableKind = "other" | "silence" | "freeze" | "chain";

/**
 * Silences a minion, and unwinds the stat GIFTS it is carrying.
 *
 * Silence used to be purely about text: printed effects and keywords went away
 * and the stat line stayed exactly where the enemy had pushed it. That made
 * Silence a non-answer against the growth cards, which are the cards it most
 * obviously should answer — a 1/1 pumped to 10/6 by its own engine lost every
 * future payment and kept every payment already made, so the board barely
 * changed. Silence now takes the growth back with the text.
 *
 * It moves in ONE direction. Anything that pushed a minion BELOW its printed
 * line is a curse rather than a gift, and Silence is not a cleanse, so a minion
 * nerfed to 1 ATK stays at 1 ATK. The rule is a clamp toward the printed stats
 * from above, never a restore from below.
 *
 * Aura contributions are deliberately not part of this arithmetic. They are
 * re-derived from the live board on every refresh, so removing one here would
 * simply be handed back a moment later; `suppressAuraBuffsOnSilenced` cancels
 * the positive half of them after each refresh instead.
 */
function stripStatBuffs(minion: MinionInstance): void {
  const auraAtk = (minion.auraBonuses ?? []).reduce((total, bonus) => total + bonus.atk, 0);
  const auraHp = (minion.auraBonuses ?? []).reduce((total, bonus) => total + bonus.hp, 0);

  const grantedAtk = minion.atk - auraAtk - minion.baseAtk;
  if (grantedAtk > 0) minion.atk = Math.max(0, minion.atk - grantedAtk);

  const grantedHp = minion.maxHp - auraHp - minion.baseHp;
  if (grantedHp > 0) {
    minion.maxHp = Math.max(1, minion.maxHp - grantedHp);
    minion.hp = Math.min(minion.hp, minion.maxHp);
  }
}

/**
 * The one way a minion becomes Silenced. Every caller goes through here so the
 * buff-stripping cannot be forgotten at one of the nine places that silence
 * something, and so re-silencing an already-silenced minion is free rather than
 * clamping it a second time.
 *
 * `permanent` is false for the ONE silence in the game that is an aura rather
 * than an event: Gojo's, which lifts the moment he leaves the board and whose
 * card says so in as many words. Taking a minion's growth away for good on a
 * silence that is explicitly temporary would make Gojo the strongest removal
 * card in the deck by accident. The aura's positive stat contributions are
 * still cancelled while it holds — `suppressAuraBuffsOnSilenced` does that, and
 * hands them straight back when the aura ends, which is the behaviour the card
 * describes.
 */
function applySilence(minion: MinionInstance, permanent = true): void {
  if (permanent && !minion.silenced) stripStatBuffs(minion);
  minion.silenced = true;
}

/**
 * Cancels the positive half of every aura landing on a silenced minion.
 *
 * Run as one sweep after the auras have been rebuilt rather than as a guard at
 * each of the eleven places that hand a bonus out: the negative half of an aura
 * (All Might's -1 ATK to the enemy board, Chaos's -2 HP to everyone) is a curse
 * and has to keep landing, so the test is the sign of the bonus, not the
 * identity of the source.
 */
function suppressAuraBuffsOnSilenced(state: GameState): void {
  for (const owner of [0, 1] as PlayerId[]) {
    for (const target of state.players[owner].board) {
      if (!target?.silenced || !target.auraBonuses?.length) continue;
      const kept: NonNullable<MinionInstance["auraBonuses"]> = [];
      for (const bonus of target.auraBonuses) {
        const atk = Math.min(0, bonus.atk);
        const hp = Math.min(0, bonus.hp);
        if (bonus.atk > 0) target.atk = Math.max(0, target.atk - bonus.atk);
        if (bonus.hp > 0) {
          target.maxHp -= bonus.hp;
          target.hp = Math.min(target.hp, target.maxHp);
        }
        kept.push({ ...bonus, atk, hp });
      }
      target.auraBonuses = kept;
    }
  }
}

function canDisable(
  state: GameState,
  sourceOwner: PlayerId,
  target: MinionInstance,
  kind: DisableKind = "other",
): boolean {
  if (target.protectedSlot) return false;
  if (isUntargetable(state, target)) return false;
  if (hasRelic(target, "immune_disable")) return false; // Anti-magic Mask
  if (kind === "silence" && hasRelic(target, "immune_silence")) return false;
  if ((kind === "freeze" || kind === "chain") && hasRelic(target, "immune_freeze_chain")) return false;
  if (hasDumbledoreProtection(state, target)) return false;
  const friendlyAura = state.players[target.owner].board.some(
    (minion) => minion && hasEffect(minion, "anti_disable_aura") && !minion.silenced,
  );
  return !friendlyAura || sourceOwner === target.owner;
}

function destroyEnemyByPredicate(
  state: GameState,
  source: MinionInstance,
  enemyId: PlayerId,
  predicate: (minion: MinionInstance) => boolean,
  message: string,
  events: GameEvent[],
  sortBy: "atk" | "slot" = "slot",
): void {
  const candidates = state.players[enemyId].board
    .map((minion, slotIndex) => ({ minion, slotIndex }))
    .filter(({ minion }) => minion && enemyTargetable(state, minion) && predicate(minion));
  if (sortBy === "atk") candidates.sort((left, right) => left.minion!.atk - right.minion!.atk);
  const target = candidates[0];
  if (!target?.minion) return;
  destroyAtSlot(state, enemyId, target.slotIndex, events, `${source.name} ${message}: ${target.minion.name}`);
}

function destroyRandomMinion(state: GameState, playerId: PlayerId, events: GameEvent[], prefix: string): void {
  const occupied = state.players[playerId].board
    .map((minion, slotIndex) => ({ minion, slotIndex }))
    .filter(({ minion }) => minion && !isUntargetable(state, minion));
  if (occupied.length === 0) return;
  const target = occupied[rollInt(state, occupied.length)];
  if (target?.minion) destroyAtSlot(state, playerId, target.slotIndex, events, `${prefix}: ${target.minion.name}`);
}

function destroyRandomEnemyByPredicate(
  state: GameState,
  source: MinionInstance,
  predicate: (minion: MinionInstance) => boolean,
  message: string,
  events: GameEvent[],
): void {
  const enemyId = opponent(source.owner);
  const candidates = state.players[enemyId].board
    .map((minion, slotIndex) => ({ minion, slotIndex }))
    .filter(({ minion }) => minion && enemyTargetable(state, minion) && predicate(minion));
  if (candidates.length === 0) return;
  const target = candidates[rollInt(state, candidates.length)];
  if (target?.minion) {
    destroyAtSlot(state, enemyId, target.slotIndex, events, `${source.name} ${message}: ${target.minion.name}`);
  }
}

function destroyInstance(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  events: GameEvent[],
  message: string,
): void {
  const slotIndex = state.players[playerId].board.findIndex((minion) => minion?.instanceId === instanceId);
  if (slotIndex >= 0) destroyAtSlot(state, playerId, slotIndex, events, message);
}

function destroyAtSlot(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
  events: GameEvent[],
  message: string,
  killer: MinionInstance | null = null,
  allowReplacement = true,
): void {
  const minion = state.players[playerId].board[slotIndex];
  if (!minion) return;
  if (allowReplacement && hasEffect(minion, "voldemort_phylactery") && !minion.silenced) {
    const replacement = state.players[playerId].board
      .map((ally, index) => ({ ally, index }))
      .filter(({ ally }) => ally && ally.instanceId !== minion.instanceId)
      .sort((left, right) => left.ally!.hp - right.ally!.hp || left.index - right.index)[0];
    if (replacement?.ally) {
      destroyAtSlot(state, playerId, replacement.index, events, `${minion.name}'s phylactery sacrifices ${replacement.ally.name}`, null, false);
      minion.hp = minion.maxHp;
      events.push(effectEvent(`${minion.name} restores itself with a phylactery.`, minion));
      return;
    }
  }
  const ringIndex = firstRelicIndex(minion, (relic) => relic.relicId === "rescue_full");
  if (ringIndex >= 0) {
    const ring = relicAt(minion, ringIndex);
    if (ring) {
      unequipRelic(minion, ringIndex);
      state.discard.push(ring.id);
      minion.hp = minion.maxHp;
      events.push(effectEvent(`${minion.name} survives at full health through the One Ring.`, minion));
      return;
    }
  }
  if (allowReplacement && rescueWithOogway(state, playerId, slotIndex, events)) return;
  const symbioteIndex = firstRelicIndex(minion, (relic) => relic.relicId === "symbiote");
  if (allowReplacement && symbioteIndex >= 0) {
    const symbiote = relicAt(minion, symbioteIndex);
    if (symbiote) {
      unequipRelic(minion, symbioteIndex);
      state.discard.push(symbiote.id);
      minion.hp = 1;
      minion.chained = Math.max(minion.chained, 2);
      events.push(effectEvent(`${minion.name} survives at 1 HP and is Chained by the Symbiote.`, minion));
      return;
    }
  }
  const rescued = allowReplacement && hasRelic(minion, "return_on_death"); // The Green Mask
  if (killer && !killer.silenced && hasEffect(killer, "grievous_on_kill_atk")) {
    killer.atk += minion.atk;
    events.push(effectEvent(`${killer.name} permanently gains ${minion.atk} ATK from killing ${minion.name}.`, killer));
  }
  state.players[playerId].board[slotIndex] = null;
  releaseDarkDimensionForSource(state, minion.instanceId, events);
  if (rescued) {
    events.push({ kind: "death", text: `${message} — The Green Mask sends it home.`, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
    putCardInHand(state, playerId, minion.cardId, events, minion.instanceId);
  } else {
    state.discard.push(minion.cardId);
    (state.players[playerId].deadMinions ??= []).push(minion.cardId);
    events.push({ kind: "death", text: message, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
  }
  // Relics die with their bearer. They are cards again only in the discard pile;
  // nothing puts them into a satchel or onto another minion automatically.
  const deathRelics = attachedRelics(minion);
  discardAttachedRelics(state, minion);
  resolveDeathrattle(state, minion, killer, slotIndex, events, deathRelics);
  releaseStolenPassive(state, minion, events);
  reactToDeath(state, minion, playerId, events, killer);
}

function rescueWithOogway(state: GameState, playerId: PlayerId, slotIndex: number, events: GameEvent[]): boolean {
  const target = state.players[playerId].board[slotIndex];
  if (!target) return false;
  const oogway = state.players[playerId].board.find(
    (minion) =>
      minion &&
      minion.instanceId !== target.instanceId &&
      hasEffect(minion, "oogway_rescue") &&
      !minion.silenced &&
      minion.rescueUsedAtTurn !== state.turnNumber,
  );
  if (!oogway) return false;
  oogway.rescueUsedAtTurn = state.turnNumber;
  state.players[playerId].board[slotIndex] = null;
  discardAttachedRelics(state, target);
  events.push({ kind: "death", text: `${target.name} would die, but Grand Master Oogway returns it to hand.`, player: playerId, instanceId: target.instanceId, cardId: target.cardId });
  putCardInHand(state, playerId, target.cardId, events, target.instanceId);
  oogway.chained = Math.max(oogway.chained, 2);
  events.push(effectEvent(`${oogway.name} is Chained for 1 turn after saving ${target.name}.`, oogway));
  return true;
}

function resolveDeathrattle(
  state: GameState,
  dead: MinionInstance,
  killer: MinionInstance | null,
  deadSlot: number,
  events: GameEvent[],
  deadRelics: RelicInstance[] = [],
): void {
  const library = libraryByState.get(state);
  for (const relic of deadRelics) {
    if (relic.relicId === "pandora_box" && library) {
      summonRandomMinionFromDeck(state, dead, library, events, undefined, opponent(dead.owner));
    } else if (relic.relicId === "dragon_balls") {
      summonShenron(state, dead, deadSlot, events);
    }
  }

  const triggerCount = deadRelics.some((relic) => relic.relicId === "necronomicon") ? 2 : 1;
  for (let trigger = 0; trigger < triggerCount; trigger += 1) {
    resolveCardDeathrattleOnce(state, dead, killer, deadSlot, events);
  }
}

function resolveCardDeathrattleOnce(
  state: GameState,
  dead: MinionInstance,
  killer: MinionInstance | null,
  deadSlot: number,
  events: GameEvent[],
): void {
  if (
    dead.silenced ||
    (dead.effectTiming !== "deathrattle" && dead.effectTiming !== "onPlayAndDeathrattle" && dead.effectId !== "flowey_save_load" && dead.effectId !== "avatar_aang_awakened")
  ) return;
  // The dead minion is already out of its board slot when this function runs,
  // so reactToDeath cannot discover its own effect. Record it at resolution.
  traceEffect(dead.effectId);
  if (dead.effectId === "light_yagami_nature_kill") {
    destroyRandomEnemyByPredicate(
      state,
      dead,
      (minion) => minion.camp === "Nature",
      "destroys a random Nature enemy minion",
      events,
    );
  } else if (dead.effectId === "deathrattle_good_buff_shield") {
    for (const ally of state.players[dead.owner].board) {
      if (!ally || ally.alignment !== "Good") continue;
      buffMinion(ally, 1, 1);
      ally.divineShield = true;
    }
    events.push(effectEvent(`${dead.name}'s Deathrattle empowers every friendly Good minion.`, dead));
  } else if (dead.effectId === "deathrattle_aoe_3") {
    damageAllEnemies(state, dead, 3, events);
    events.push(effectEvent(`${dead.name}'s Deathrattle deals 3 damage to all enemy minions.`, dead));
  } else if (dead.effectId === "black_hole_deathrattle") {
    let silenced = 0;
    for (const owner of [0, 1] as PlayerId[]) {
      for (const minion of state.players[owner].board) {
        if (minion && canDisable(state, dead.owner, minion, "silence")) {
          applySilence(minion);
          silenced += 1;
        }
      }
    }
    events.push(effectEvent(`${dead.name} silences ${silenced} minion${silenced === 1 ? "" : "s"} before the void consumes them.`, dead));
    for (const owner of [0, 1] as PlayerId[]) {
      for (let slot = 0; slot < boardSize; slot += 1) {
        if (state.players[owner].board[slot]) {
          destroyAtSlot(state, owner, slot, events, `${dead.name} destroys all minions`, null, false);
        }
      }
    }
  } else if (dead.effectId === "deathrattle_summon_morgott") {
    const slot = state.players[dead.owner].board[deadSlot] ? state.players[dead.owner].board.findIndex((minion) => !minion) : deadSlot;
    if (slot >= 0) {
      const morgott: CardDefinition = {
        kind: "minion",
        id: "token:morgott",
        name: "Morgott, the Omen King",
        cost: 3,
        atk: 3,
        hp: 3,
        rarity: "Black",
        camp: "Nature",
        alignment: "Evil",
        keywords: [],
        effectId: "none",
        effectTiming: "none",
        effect: "-",
        flavor: "The omen king returns.",
        origin: dead.origin,
        art: resolvePublicAssetUrl("/card-art/raw/token-morgott.webp"),
      };
      const summoned = createMinion(morgott, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Morgott, the Omen King.`, dead));
    }
  } else if (dead.effectId === "deathrattle_summon_drakath") {
    const slot = state.players[dead.owner].board[deadSlot]
      ? state.players[dead.owner].board.findIndex((minion) => !minion)
      : deadSlot;
    if (slot >= 0) {
      const drakath: CardDefinition = {
        kind: "minion",
        id: "token:drakath",
        name: "Drakath",
        cost: 5,
        atk: 5,
        hp: 3,
        rarity: "Black",
        camp: "Magic",
        alignment: "Evil",
        keywords: [],
        effectId: "none",
        effectTiming: "none",
        effect: "-",
        flavor: "Chaos answers chaos.",
        origin: dead.origin,
        art: resolvePublicAssetUrl("/card-art/raw/token-drakath.webp"),
      };
      const summoned = createMinion(drakath, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Drakath.`, dead));
    }
  } else if (dead.effectId === "kill_back") {
    // Darkwing's text is a real Deathrattle: the minion that dealt the lethal
    // blow is the killer, regardless of which side initiated combat. Resolve it
    // here so attacking into Darkwing and Darkwing dying on the retaliation path
    // behave identically.
    const killerAlive = Boolean(
      killer &&
        killer.owner !== dead.owner &&
        state.players[killer.owner].board.some((minion) => minion?.instanceId === killer.instanceId),
    );
    if (killer && killerAlive) {
      const killerSlot = slotOf(state, killer);
      if (killerSlot >= 0) {
        destroyAtSlot(state, killer.owner, killerSlot, events, `${dead.name} drags ${killer.name} down`, null);
        events.push(effectEvent(`${dead.name}'s Deathrattle destroys ${killer.name}.`, dead));
      }
    }
  } else if (dead.effectId === "deathrattle_summon_vision") {
    // Ultron's whole point is that killing him is not the end of him. The slot
    // rule matches Galactus above: take the slot he died in when it is free,
    // otherwise the first open one, and do nothing at all on a full board.
    const slot = state.players[dead.owner].board[deadSlot]
      ? state.players[dead.owner].board.findIndex((minion) => !minion)
      : deadSlot;
    if (slot >= 0) {
      const vision: CardDefinition = {
        kind: "minion",
        id: "token:vision",
        name: "Vision",
        cost: 7,
        atk: 5,
        hp: 3,
        rarity: "Purple",
        camp: "Tech",
        alignment: "Good",
        keywords: ["Taunt"],
        effectId: "none",
        effectTiming: "none",
        effect: "Taunt.",
        flavor: "Built to end him. Chose otherwise.",
        origin: "MCU",
        art: resolvePublicAssetUrl("/card-art/raw/token-vision.webp"),
      };
      const summoned = createMinion(vision, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Vision.`, dead));
    }
  } else if (dead.effectId === "deathrattle_summon_galactus") {
    const slot = state.players[dead.owner].board[deadSlot]
      ? state.players[dead.owner].board.findIndex((minion) => !minion)
      : deadSlot;
    if (slot >= 0) {
      const galactus: CardDefinition = {
        kind: "minion",
        id: "token:galactus",
        name: "Galactus",
        cost: 5,
        atk: 8,
        hp: 8,
        rarity: "Black",
        camp: "Magic",
        alignment: "Neutral",
        keywords: ["Taunt", "Cannot Attack"],
        effectId: "none",
        effectTiming: "none",
        effect: "Taunt. Cannot attack.",
        flavor: "The devourer of worlds arrives.",
        origin: "Marvel",
        art: resolvePublicAssetUrl("/card-art/raw/galactus.webp"),
      };
      const summoned = createMinion(galactus, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Galactus.`, dead));
    }
  } else if (dead.effectId === "avatar_aang_awakened") {
    const slot = state.players[dead.owner].board[deadSlot]
      ? state.players[dead.owner].board.findIndex((minion) => !minion)
      : deadSlot;
    if (slot >= 0) {
      const awakened: CardDefinition = {
        kind: "minion",
        id: "token:awakened",
        name: "Awakened",
        cost: 6,
        atk: 6,
        hp: 3,
        rarity: "Red",
        camp: "Magic",
        alignment: "Good",
        keywords: [],
        effectId: "none",
        effectTiming: "none",
        effect: "-",
        flavor: "The Avatar's spirit wakes.",
        origin: dead.origin,
        art: resolvePublicAssetUrl("/card-art/raw/token-awakened.webp"),
      };
      const summoned = createMinion(awakened, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Awakened.`, dead));
    }
  } else if (dead.effectId === "flowey_save_load") {
    if (dead.savedCoreHealth !== null && dead.savedCoreHealth !== undefined) {
      state.players[dead.owner].health = Math.min(STARTING_CORE, dead.savedCoreHealth);
      events.push(effectEvent(`${dead.name}'s Deathrattle restores the core to ${dead.savedCoreHealth} HP.`, dead));
    }
  } else if (dead.effectId === "ouken_reborn") {
    const slot = state.players[dead.owner].board[deadSlot]
      ? state.players[dead.owner].board.findIndex((minion) => !minion)
      : deadSlot;
    if (slot >= 0) {
      const rebornCard: CardDefinition = {
        kind: "minion",
        id: dead.cardId,
        name: dead.name,
        cost: dead.cost,
        atk: dead.baseAtk,
        hp: dead.baseHp,
        rarity: dead.rarity,
        camp: dead.camp,
        alignment: dead.alignment,
        keywords: ["Deathrattle"],
        effectId: "ouken_reborn",
        effectTiming: "deathrattle",
        effect: dead.effect,
        flavor: "",
        origin: dead.origin,
        art: dead.art,
      };
      const reborn = createMinion(rebornCard, dead.owner, state);
      reborn.suppressArrivalTheme = true;
      reborn.hp = 1;
      reborn.maxHp = Math.max(1, reborn.maxHp);
      reborn.chained = Math.max(reborn.chained, 2);
      state.players[dead.owner].board[slot] = reborn;
      events.push(effectEvent(`${dead.name} is Reborn and Chained.`, dead));
    }
  } else if (dead.effectId === "deathrattle_random_evil") {
    const candidates = ([0, 1] as PlayerId[]).flatMap((owner) =>
      state.players[owner].board
        .map((minion, slot) => ({ minion, owner, slot }))
        .filter(({ minion }) => minion?.alignment === "Evil" && !isUntargetable(state, minion)),
    );
    if (candidates.length > 0) {
      const target = candidates[rollInt(state, candidates.length)];
      if (target?.minion) {
        destroyAtSlot(state, target.owner, target.slot, events, `${dead.name} destroys ${target.minion.name}`, null);
      }
    }
    if (dealCoreDamage(state, dead.owner, 4, events)) {
      events.push(effectEvent(`${dead.name} deals 4 damage to its own Core.`, dead));
    }
  } else if (dead.effectId === "aizen_deathrattle") {
    if (nextRandom(state) < 0.5) {
      const slot = state.players[dead.owner].board[deadSlot] ? state.players[dead.owner].board.findIndex((minion) => !minion) : deadSlot;
      if (slot >= 0) {
        const rebornCard: CardDefinition = {
          kind: "minion",
          id: dead.cardId,
          name: dead.name,
          cost: dead.cost,
          atk: dead.baseAtk,
          hp: dead.baseHp,
          rarity: dead.rarity,
          camp: dead.camp,
          alignment: dead.alignment,
          keywords: dead.keywords.filter((keyword) => keyword !== "Deathrattle"),
          effectId: dead.effectId,
          effectTiming: dead.effectTiming,
          effect: dead.effect,
          flavor: "",
          origin: dead.origin,
          art: dead.art,
        };
        const reborn = createMinion(rebornCard, dead.owner, state);
        reborn.suppressArrivalTheme = true;
        reborn.hp = reborn.maxHp;
        reborn.divineShield = false;
        reborn.keywords = [];
        reborn.effectId = "none";
        reborn.effectTiming = "none";
        reborn.effect = "-";
        state.players[dead.owner].board[slot] = reborn;
        events.push(effectEvent(`${dead.name} is Reborn.`, dead));
      }
    }
    const killerAlive = Boolean(
      killer && state.players[killer.owner].board.some((minion) => minion?.instanceId === killer.instanceId),
    );
    if (killer && killerAlive) {
      const canSilence = canDisable(state, dead.owner, killer, "silence");
      const canChain = canDisable(state, dead.owner, killer, "chain");
      if (canSilence) applySilence(killer);
      if (canChain) killer.chained = Math.max(killer.chained, 2);
      const statuses = [canSilence ? "silences" : "", canChain ? "chains" : ""]
        .filter(Boolean)
        .join(" and ");
      if (statuses) {
        events.push(effectEvent(`${dead.name} ${statuses} its killer, ${killer.name}.`, dead));
      } else {
        events.push(effectEvent(`${killer.name} resists ${dead.name}'s curses.`, killer));
      }
    }
  } else if (dead.effectId === "reborn_75") {
    if (nextRandom(state) < 0.75) {
      const slot = state.players[dead.owner].board[deadSlot] ? state.players[dead.owner].board.findIndex((minion) => !minion) : deadSlot;
      if (slot >= 0) {
        const rebornCard: CardDefinition = {
          kind: "minion",
          id: dead.cardId,
          name: dead.name,
          cost: dead.cost,
          atk: dead.baseAtk,
          hp: dead.baseHp,
          rarity: dead.rarity,
          camp: dead.camp,
          alignment: dead.alignment,
          keywords: dead.keywords.filter((keyword) => keyword !== "Deathrattle"),
          effectId: dead.effectId,
          effectTiming: dead.effectTiming,
          effect: dead.effect,
          flavor: "",
          origin: dead.origin,
          art: dead.art,
        };
        const reborn = createMinion(rebornCard, dead.owner, state);
        reborn.suppressArrivalTheme = true;
        reborn.hp = 1;
        reborn.divineShield = false;
        reborn.keywords = [];
        reborn.effectId = "none";
        reborn.effectTiming = "none";
        reborn.effect = "-";
        state.players[dead.owner].board[slot] = reborn;
        events.push(effectEvent(`${dead.name} is Reborn.`, dead));
      }
    }
  } else if (dead.effectId === "mask_return_attacker") {
    const killerAlive = Boolean(
      killer &&
        killer.owner !== dead.owner &&
        state.players[killer.owner].board.some((minion) => minion?.instanceId === killer.instanceId),
    );
    if (killer && killerAlive) {
      if (hasDominionAuthority(state, killer.owner)) {
        events.push(effectEvent(`${killer.name} is protected by Dominion Authority.`, killer));
        return;
      }
      const killerSlot = slotOf(state, killer);
      if (killerSlot >= 0) {
        state.players[killer.owner].board[killerSlot] = null;
        discardAttachedRelics(state, killer);
        putCardInHand(state, dead.owner, killer.cardId, events, killer.instanceId);
        events.push(effectEvent(`${dead.name} returns the surviving attacker, ${killer.name}, to hand.`, dead));
      }
    }
  }
}

/** When Chrollo falls, whatever he was wearing returns to its owner. */
function releaseStolenPassive(state: GameState, dead: MinionInstance, events: GameEvent[]): void {
  if (!dead.stolenPassiveFrom) return;
  for (const playerId of [0, 1] as PlayerId[]) {
    for (const minion of state.players[playerId].board) {
      if (minion?.instanceId === dead.stolenPassiveFrom) {
        minion.effectId = dead.effectId;
        minion.effectTiming = "passive";
        events.push(effectEvent(`${minion.name} takes its passive back.`, minion));
        return;
      }
    }
  }
}

function discardRandom(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  if (player.hand.length === 0) return;
  const [card] = player.hand.splice(rollInt(state, player.hand.length), 1);
  if (!card) return;
  state.discard.push(card);
  events.push({ kind: "effect", text: `${player.name} discards a card.`, player: playerId, cardId: card });
}

function summonFromHand(
  state: GameState,
  playerId: PlayerId,
  library: CardLibrary,
  events: GameEvent[],
  alignment?: Alignment,
): void {
  const player = state.players[playerId];
  const slotIndex = player.board.findIndex((slot) => !slot);
  const candidates = player.hand
    .map((cardId, handIndex) => ({ cardId, handIndex, card: library[cardId] }))
    .filter(({ card }) => isMinionCard(card) && (!alignment || card.alignment === alignment));
  if (slotIndex < 0 || candidates.length === 0) return;
  const { cardId, handIndex } = candidates[rollInt(state, candidates.length)];
  player.hand.splice(handIndex, 1);
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const minion = createMinion(card, playerId, state);
  minion.chained = Math.max(2, minion.chained);
  player.board[slotIndex] = minion;
  events.push({ kind: "effect", text: `${player.name} summons ${minion.name} Chained.`, player: playerId, cardId, instanceId: minion.instanceId });
}

function checkGameOver(state: GameState, events: GameEvent[]): void {
  const playerOneDown = state.players[0].health <= 0;
  const playerTwoDown = state.players[1].health <= 0;
  if (!playerOneDown && !playerTwoDown) return;
  state.phase = "gameOver";
  state.mulligan = null;
  state.drawChoice = null;
  state.pendingTarget = null;
  state.pendingPlayCancel = null;
  state.effectQueue = [];
  state.winner = playerOneDown && playerTwoDown ? "draw" : playerOneDown ? 1 : 0;
  const text = state.winner === "draw" ? "Both cores collapse." : `${state.players[state.winner].name} wins.`;
  events.push({ kind: "gameOver", text });
}

function effectEvent(text: string, source: MinionInstance): GameEvent {
  return { kind: "effect", text, player: source.owner, cardId: source.cardId, instanceId: source.instanceId };
}

// ---------------------------------------------------------------------------
// Helpers for the full-roster effects (added 2026-07-12).
// ---------------------------------------------------------------------------
function friendlyOthers(player: PlayerState, source: MinionInstance): MinionInstance[] {
  return player.board.filter(
    (minion): minion is MinionInstance => minion !== null && minion.instanceId !== source.instanceId,
  );
}

function damageAllOther(state: GameState, source: MinionInstance, amount: number, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = state.players[playerId].board[slot];
      if (minion && minion.instanceId !== source.instanceId) {
        dealMinionDamage(state, playerId, slot, amount, source, events, true);
      }
    }
  }
}

function buffAllAllies(
  player: PlayerState,
  source: MinionInstance,
  predicate: (minion: MinionInstance) => boolean,
  atk: number,
  hp: number,
  includeSelf: boolean,
): void {
  for (const minion of player.board) {
    if (minion && predicate(minion) && (includeSelf || minion.instanceId !== source.instanceId)) {
      buffMinion(minion, atk, hp);
    }
  }
}

function sweepDeaths(state: GameState, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = state.players[playerId].board[slot];
      if (minion && minion.hp <= 0) destroyAtSlot(state, playerId, slot, events, `${minion.name} falls`);
    }
  }
}

function stealCard(
  state: GameState,
  source: MinionInstance,
  enemy: PlayerState,
  pickIndex: (hand: string[]) => number,
  events: GameEvent[],
): void {
  const index = pickIndex(enemy.hand);
  if (index < 0 || index >= enemy.hand.length) return;
  const cardId = enemy.hand.splice(index, 1)[0];
  putCardInHand(state, source.owner, cardId, events);
  events.push(effectEvent(`${source.name} steals a card.`, source));
}

function costliestIndex(hand: string[], library: CardLibrary): number {
  if (hand.length === 0) return -1;
  let best = 0;
  let bestCost = -1;
  hand.forEach((cardId, index) => {
    const cost = library[cardId]?.cost ?? 0;
    if (cost > bestCost) {
      bestCost = cost;
      best = index;
    }
  });
  return best;
}

function reactToDeath(
  state: GameState,
  dead: MinionInstance,
  deadOwner: PlayerId,
  events: GameEvent[],
  killer: MinionInstance | null = null,
): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (const minion of state.players[playerId].board) {
      if (!minion || minion.silenced || minion.instanceId === dead.instanceId) continue;
      // The death reactions below compare `minion.effectId` directly rather
      // than going through hasEffect, so they would be invisible to the coverage
      // trace. Recording here marks a death-reaction effect as exercised whenever
      // a death is resolved while its owner is on the board, which is the moment
      // its branch is genuinely reachable.
      traceEffect(minion.effectId);
      if (minion.chained > 0) continue;
      if (
        killer &&
        killer.instanceId === minion.instanceId &&
        hasEffect(minion, "meruem_kill_copy") &&
        !minion.silenced
      ) {
        buffMinion(minion, 1, 1);
        const copied = copyPersistentMinionTraits(minion, dead);
        events.push(
          effectEvent(
            `${minion.name} adapts after killing ${dead.name} (+1/+1${copied ? " and its effects" : ""}).`,
            minion,
          ),
        );
      } else if (minion.effectId === "xenomorph_queen_brood" && playerId === deadOwner) {
        summonLarva(state, minion, dead, events);
      } else if (minion.effectId === "nito_any_death_1_1") {
        // +1/+1, down from +2/+1 (pass 3): 62.3% vs a 48.2% bracket off the
        // smallest body in the game. It counts EVERY death on BOTH boards with
        // no cap, so the opponent's own trades were feeding it.
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} feeds on death (+1/+1).`, minion));
      } else if (minion.effectId === "friendly_death_buff_1_1" && playerId === deadOwner) {
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} avenges ${dead.name} (+1/+1).`, minion));
      } else if (minion.effectId === "tech_death_buff" && playerId === deadOwner && dead.camp === "Tech") {
        buffMinion(minion, 2, 2);
        events.push(effectEvent(`${minion.name} grows from the fallen Tech.`, minion));
      } else if (minion.effectId === "mark_for_death" && dead.markedBy === minion.instanceId) {
        // Kento Nanami collects on the minion he marked.
        buffMinion(minion, 2, 2);
        events.push(effectEvent(`${minion.name} collects on ${dead.name} (+2/+2).`, minion));
      }
    }
  }
}
