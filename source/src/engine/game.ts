import type {
  ApplyResult,
  Alignment,
  SlotAuraId,
  CardDefinition,
  EffectId,
  GameAction,
  GameEvent,
  GameState,
  HandOption,
  LabelOption,
  MinionInstance,
  PlayerId,
  PlayerState,
  RelicDefinition,
  RelicInstance,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
} from "./types";

export type CardLibrary = Record<string, CardDefinition>;

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
 * At 76, with the plain +1 mana ramp below, the median duel runs 21 player-turns
 * — about ten each, the same shape as Hearthstone — 80% of duels reach 10 mana,
 * boards sit at 3.1 of 5 slots, and 6% end as blowouts.
 *
 * **This number carries ALL of the pacing weirdness on purpose.** A player never
 * feels an unusual health total; they feel an unusual mana curve every single
 * turn. `npm run sim -- --sweep` is the measurement behind it.
 */
const DEFAULT_STARTING_HEALTH = 76;

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
 * The lever that works is the one players never feel: **starting core HP**. At
 * 76 with this plain +1 ramp, 80% of duels reach 10 mana — the same access the
 * clever ramp bought at 48 — with fewer blowouts and fuller boards. Put the odd
 * number in the health bar, never in the mana curve.
 *
 * The field survives only so `npm run sim -- --sweep` can still measure
 * alternatives. The shipped game is 1.
 */
const DEFAULT_MANA_RAMP = 1;

export function makeCardLibrary(cards: CardDefinition[]): CardLibrary {
  return Object.fromEntries(cards.map((card) => [card.id, card]));
}

/** Knobs the simulator sweeps. The game itself always uses the defaults. */
export interface GameSetup {
  startingHealth?: number;
  manaRamp?: number;
}

export function createInitialGame(
  cards: CardDefinition[],
  seed = "convergence-v1",
  relicDefs: RelicDefinition[] = [],
  setup: GameSetup = {},
): GameState {
  const health = setup.startingHealth ?? DEFAULT_STARTING_HEALTH;
  const deck = buildDeck(cards, seed);
  const players: [PlayerState, PlayerState] = [makePlayer(0, "Player One", health), makePlayer(1, "Player Two", health)];
  const state: GameState = {
    phase: "main",
    activePlayer: 0,
    turnNumber: 1,
    cheatMode: false,
    manaRamp: setup.manaRamp ?? DEFAULT_MANA_RAMP,
    nextInstance: 1,
    nextPlayOrder: 1,
    rngSeed: hashSeed(`${seed}:rng`),
    deck,
    bottomDeck: [],
    discard: [],
    // Relics live in the state as finished instances rather than ids, so the
    // engine never needs a lookup table and a saved game is self-describing.
    // All 21 are in the pool now: Tesseract used to ask for a "move a minion to
    // another slot" action the game does not have, and was re-cut as
    // `no_retaliation` rather than leaving one relic permanently on the bench.
    relicPool: seededShuffle(
      relicDefs
        .filter((relic) => relic.relicId !== "none")
        .map((relic) => ({
          id: relic.id,
          relicId: relic.relicId,
          name: relic.name,
          effect: relic.effect,
          art: relic.art,
        })),
      `${seed}:relics`,
    ),
    drawChoice: null,
    pendingTarget: null,
    effectQueue: [],
    winner: null,
    players,
  };

  players[0].turnsStarted = 1;
  // Opening hands: 2 going first, 3 plus The Coin going second (owner ruling).
  // Raised from 1 and 2 to fix dead openings — the balance gate measured that
  // 20.7% of players could not legally play a single card across their first
  // THREE turns (28.2% going first, 13.3% going second). Cost is frozen, so the
  // hand is the lever. Re-measure with `npm run check:balance`; the gate's
  // deadOpening threshold is the guard on it.
  drawDirect(state, 0, 2, []);
  drawDirect(state, 1, 3, []);
  players[1].coins = 1;
  return state;
}

export function applyAction(state: GameState, action: GameAction, library: CardLibrary): ApplyResult {
  const currentLegal = getLegalActions(state, library);
  if (!currentLegal.some((legal) => sameAction(legal, action))) {
    return {
      state,
      events: [{ kind: "warning", text: "That move is not legal right now.", player: action.player }],
      legalActions: currentLegal,
    };
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];

  if (action.type === "play_card") {
    playCard(next, action.player, action.handIndex, action.slotIndex, library, events);
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
    thawServed(next, action.player, events);
    beginTurn(next, opponent(action.player), library, events);
  } else if (action.type === "choose_draw") {
    chooseDraw(next, action.player, action.choiceIndex, library, events);
  } else if (action.type === "choose_target") {
    chooseTarget(next, action.choiceIndex, library, events);
  } else if (action.type === "use_coin") {
    spendCoin(next, action.player, events);
  } else if (action.type === "move_relic") {
    moveRelic(next, action.player, action.fromSlot, action.toSlot, events);
  }

  // Slot marks are permanent and position-based, so they are re-applied after
  // every action — whichever route a minion took into a marked slot.
  enforceSlotAuras(next, events);
  checkGameOver(next, events);
  return {
    state: next,
    events,
    legalActions: getLegalActions(next, library),
  };
}

export function getLegalActions(state: GameState, library: CardLibrary): GameAction[] {
  if (state.phase === "gameOver") return [];
  if (state.phase === "targeting") {
    const pending = state.pendingTarget;
    if (!pending) return [];
    const count =
      pending.kind === "board" || pending.kind === "slot"
        ? pending.options.length
        : pending.kind === "hand"
          ? pending.handOptions.length
          : pending.labelOptions.length;
    return Array.from({ length: count }, (_unused, choiceIndex) => ({
      type: "choose_target" as const,
      player: pending.player,
      choiceIndex,
    }));
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
  const actions: GameAction[] = [{ type: "end_turn", player: player.id }];

  if (player.coins > 0) {
    actions.push({ type: "use_coin", player: player.id });
  }

  // Re-strapping an Ascension Relic. Relics arrive by luck, and this is the one
  // decision the player gets over them: pull a relic off a minion that is about
  // to die, or move it onto the threat that is about to swing. Capped per turn,
  // because a relic dying with its bearer is the cost the whole system is built
  // on — free movement would delete it.
  if (player.relicMoves < RELIC_MOVES_PER_TURN) {
    player.board.forEach((bearer, fromSlot) => {
      if (!bearer || !relicCanMove(bearer.relic)) return;
      player.board.forEach((target, toSlot) => {
        if (!target || toSlot === fromSlot || target.relic) return;
        actions.push({ type: "move_relic", player: player.id, fromSlot, toSlot });
      });
    });
  }

  player.hand.forEach((cardId, handIndex) => {
    const card = library[cardId];
    if (!card || (!state.cheatMode && effectiveCost(player, card) > player.mana)) return;
    player.board.forEach((slot, slotIndex) => {
      if (!slot) {
        actions.push({ type: "play_card", player: player.id, handIndex, slotIndex });
      }
    });
  });

  // Kojiro Sasaki soaks every attack aimed at his side; Taunt does the same job
  // one rank below him. Shinigami Eyes ignores both.
  const bodyguard = enemy.board
    .map((minion, targetSlot) => ({ minion, targetSlot }))
    .find(({ minion }) => minion && hasEffect(minion, "redirect_attacks") && !minion.silenced);
  const tauntTargets = enemy.board
    .map((minion, targetSlot) => ({ minion, targetSlot }))
    .filter(({ minion }) => minion && hasKeyword(minion, "Taunt") && !minion.silenced);

  player.board.forEach((minion, attackerSlot) => {
    if (!minion || !canAttack(minion)) return;
    const ignoresGuards = hasRelic(minion, "ignore_defences");
    const forced = ignoresGuards ? [] : bodyguard ? [bodyguard] : tauntTargets;
    const possibleTargets = forced.length
      ? forced
      : enemy.board.map((target, targetSlot) => ({ minion: target, targetSlot })).filter(({ minion: target }) => target);

    possibleTargets.forEach(({ minion: target, targetSlot }) => {
      if (target && canDeclareAttack(minion, target)) {
        actions.push({ type: "attack_minion", player: player.id, attackerSlot, targetSlot });
      }
    });

    // Hearthstone's rule: the enemy core is a legal target for ANY ready minion.
    // Only a guard stops it — a Taunt, or Kojiro soaking his side — and the same
    // things that would force a minion target force it here. Shinigami Eyes walks
    // past both. (Before this, the core could only be hit with the enemy board
    // completely empty, which made ATK almost meaningless.)
    if (forced.length === 0) {
      actions.push({ type: "attack_core", player: player.id, attackerSlot });
    }
  });

  return actions;
}

/** A card's cost after Kuma-style discounts. */
function effectiveCost(player: PlayerState, card: CardDefinition): number {
  return Math.max(0, card.cost - (player.costReductions[card.id] ?? 0));
}

export function actionKey(action: GameAction): string {
  if (action.type === "play_card") return `${action.type}:${action.player}:${action.handIndex}:${action.slotIndex}`;
  if (action.type === "attack_minion") {
    return `${action.type}:${action.player}:${action.attackerSlot}:${action.targetSlot}`;
  }
  if (action.type === "attack_core") return `${action.type}:${action.player}:${action.attackerSlot}`;
  if (action.type === "choose_draw") return `${action.type}:${action.player}:${action.choiceIndex}`;
  if (action.type === "choose_target") return `${action.type}:${action.player}:${action.choiceIndex}`;
  if (action.type === "move_relic") return `${action.type}:${action.player}:${action.fromSlot}:${action.toSlot}`;
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

function buildDeck(cards: CardDefinition[], seed: string): string[] {
  const shuffled = seededShuffle(cards, seed);
  return shuffled.map((card) => card.id);
}

function makePlayer(id: PlayerId, name: string, health: number = DEFAULT_STARTING_HEALTH): PlayerState {
  return {
    id,
    name,
    health,
    maxMana: 1,
    mana: 1,
    coins: 0,
    hand: [],
    board: Array(boardSize).fill(null),
    relics: [],
    pendingControl: null,
    costReductions: {},
    pressured: null,
    slotAuras: [],
    confusedUntilTurn: null,
    fatigue: 0,
    turnsStarted: 0,
    relicMoves: 0,
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
  player.hand.splice(handIndex, 1);
  if (!state.cheatMode) {
    player.mana -= effectiveCost(player, card);
  }
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
    events.push(effectEvent(`${minion.name} gains Divine Shield from Shifu.`, minion));
  }
  applyOnPlayEffects(state, minion, slotIndex, library, events);
}

function createMinion(card: CardDefinition, owner: PlayerId, state: GameState): MinionInstance {
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
    sleeping: true,
    // Ordinary minions sleep through the turn they are played. Chained minions
    // remain unavailable through two of their owner's turns.
    chained: hasKeyword(card, "Chained") ? 2 : 0,
    frozen: false,
    thawPending: false,
    silenced: false,
    divineShield: hasKeyword(card, "Divine Shield"),
    invulnerableUntilTurn: null,
    protectedSlot: false,
    delayedDestroySource: null,
    relic: null,
    attackedBy: [],
    attackLocked: false,
    attackLockedUntilTurn: null,
    markedBy: null,
    campImmunity: null,
    stolenPassiveFrom: null,
    stolenPassiveText: null,
    gainedEffects: [],
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
  if (minion.effectTiming !== "onPlay" && minion.effectTiming !== "onPlayAndOngoing") return;
  // A suspend here leaves phase === "targeting"; applyAction returns and the
  // player answers with `choose_target` before anything else can happen.
  runEffect(state, minion, slotIndex, library, events);
}

function beginTurn(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  state.activePlayer = playerId;
  state.turnNumber += 1;
  const player = state.players[playerId];
  player.turnsStarted += 1;
  player.relicMoves = 0;
  events.push({ kind: "turn", text: `${player.name}'s turn begins.`, player: playerId });

  // Hearthstone's draw: one card, no choice. The pick-1-of-2 that used to happen
  // every single turn is now a card's privilege — Detective L's Foresight.
  const foresight = player.board.some(
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

function finishStartOfTurn(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const player = state.players[playerId];
  // Derived from the turn count rather than incremented, so the ramp is a single
  // number that a save, an undo and the simulator all agree on. At ramp 1 this is
  // exactly the classic +1 a turn.
  player.maxMana = Math.min(10, 1 + Math.round((player.turnsStarted - 1) * (state.manaRamp ?? 1)));
  player.mana = player.maxMana;
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
    }
    minion.sleeping = false;
    minion.attacksUsed = 0;
  }

  // Queue them instead of running them inline: a targeted ongoing effect has to
  // be able to stop the batch mid-way and resume after the player answers.
  // White Whistle earns its bearer a second pass through the queue.
  const ready = player.board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .filter((minion) => !skipOngoing.has(minion.instanceId) && !minion.silenced && minion.chained === 0)
    .filter((minion) => minion.effectTiming === "ongoing" || minion.effectTiming === "onPlayAndOngoing")
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
 * acts: a promised defector arrives, relic timers tick, and a card someone was
 * pressured into playing burns if they ignored it.
 */
function resolveUpkeep(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const player = state.players[playerId];

  // Lelouch's command lands.
  if (player.pendingControl && player.pendingControl.dueTurn <= state.turnNumber) {
    const { instanceId, fromPlayer } = player.pendingControl;
    player.pendingControl = null;
    const slot = state.players[fromPlayer].board.findIndex((minion) => minion?.instanceId === instanceId);
    const victim = slot >= 0 ? state.players[fromPlayer].board[slot] : null;
    const free = player.board.findIndex((entry) => !entry);
    if (victim && free >= 0) {
      state.players[fromPlayer].board[slot] = null;
      victim.owner = playerId;
      victim.sleeping = true;
      player.board[free] = victim;
      events.push({ kind: "effect", text: `${victim.name} defects to ${player.name}.`, player: playerId, instanceId });
    }
  }

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

  // Ultra Instinct Goku's blessing feeds whoever is standing in the marked slot.
  for (const aura of player.slotAuras) {
    if (aura.auraId !== "slot_grow_2") continue;
    const minion = player.board[aura.slot];
    if (!minion) continue;
    buffMinion(minion, 2, 2);
    events.push({
      kind: "effect",
      text: `${minion.name} grows on ${aura.sourceName}'s blessing (+2/+2).`,
      player: playerId,
      instanceId: minion.instanceId,
    });
  }

  for (const minion of player.board) {
    if (!minion?.relic) continue;
    // Devil Fruit feeds its bearer every turn.
    if (minion.relic.relicId === "ongoing_grow_2") {
      buffMinion(minion, 2, 2);
      events.push(effectEvent(`${minion.name} grows on the Devil Fruit (+2/+2).`, minion));
    }
    // Queen's Cocoon opens.
    if (minion.relic.relicId === "cocoon" && minion.relic.readyOnTurn !== undefined && minion.relic.readyOnTurn <= state.turnNumber) {
      minion.relic.readyOnTurn = undefined;
      buffMinion(minion, 3, 3);
      events.push(effectEvent(`${minion.name} emerges from the Cocoon (+3/+3).`, minion));
    }
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

function putCardInHand(state: GameState, playerId: PlayerId, cardId: string, events: GameEvent[]): void {
  const player = state.players[playerId];
  if (player.hand.length >= handLimit) {
    state.discard.push(cardId);
    events.push({ kind: "draw", text: `${player.name}'s hand is full, so a card burns.`, player: playerId, cardId });
    return;
  }
  player.hand.push(cardId);
  events.push({ kind: "draw", text: `${player.name} adds a card to hand.`, player: playerId, cardId });
}

function applyFatigue(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  player.fatigue += 1;
  player.health -= player.fatigue;
  events.push({ kind: "damage", text: `${player.name} takes ${player.fatigue} fatigue damage.`, player: playerId });
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
  events.push({ kind: "combat", text: `${attacker.name} attacks ${defender.name}.`, player: playerId, instanceId: attacker.instanceId });
  defender.attackedBy.push(attackerId);
  // RoboCop-style: triple the blow when striking an Evil defender. Ea doubles
  // whatever the attacker was going to land.
  let outgoing =
    hasEffect(attacker, "robocop_evil_bonus") && !attacker.silenced && defender.alignment === "Evil"
      ? attacker.atk * 3
      : attacker.atk;
  if (hasRelic(attacker, "double_atk_damage")) outgoing *= 2;
  if (hasEffect(attacker, "double_damage_nature") && !attacker.silenced && defender.camp === "Nature") {
    outgoing *= 2;
  }
  // Simultaneous combat, Hearthstone-style: the defender ALWAYS retaliates with
  // its attack value, even if the blow kills it (owner ruling, 2026-07-06).
  dealMinionDamage(state, defenderId, targetSlot, outgoing, attacker, events);
  // Infinity Stone: the swing carries into the two neighbours of the target.
  if (hasRelic(attacker, "cleave_adjacent")) {
    for (const side of [targetSlot - 1, targetSlot + 1]) {
      if (side >= 0 && side < boardSize && state.players[defenderId].board[side]) {
        dealMinionDamage(state, defenderId, side, outgoing, attacker, events, true);
      }
    }
  }
  // Tesseract: the bearer strikes from outside space, so nothing reaches back.
  // It is the one thing in the game that suspends simultaneous combat, and only
  // on the bearer's own swing — it is still hit normally on the enemy's turn.
  if (!hasRelic(attacker, "no_retaliation")) {
    dealMinionDamage(state, playerId, attackerSlot, defender.atk, defender, events);
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
    }
    // Allspark Cube: the kill is taken home as a card.
    if (!defenderAlive && hasRelic(survivingAttacker, "capture_kill")) {
      putCardInHand(state, playerId, defender.cardId, events);
      events.push(effectEvent(`${survivingAttacker.name} captures ${defender.name}.`, survivingAttacker));
    }
  }
  // Defender reactions to being attacked (the strike landed even if it died).
  if (!defender.silenced) {
    if (hasEffect(defender, "freeze_attacker") && attackerAlive && survivingAttacker) {
      applyFreeze(state, defender, survivingAttacker, events);
    }
    if (hasEffect(defender, "kaku_discard")) discardRandom(state, playerId, events);
    // APR: whoever swung at it never swings again.
    if (hasEffect(defender, "attack_lock") && attackerAlive && survivingAttacker) {
      survivingAttacker.attackLocked = true;
      survivingAttacker.attackLockedUntilTurn = state.turnNumber + 6;
      events.push(effectEvent(`${defender.name} stops ${survivingAttacker.name} for two turns.`, defender));
    }
    // Doomsday: it adapts to whatever hit it and shrugs that Camp off for two turns.
    if (hasEffect(defender, "camp_immunity_on_hit") && defenderAlive) {
      defender.campImmunity = { camp: attacker.camp, untilTurn: state.turnNumber + 2 };
      events.push(effectEvent(`${defender.name} adapts to ${attacker.camp}.`, defender));
    }
    // Darkwing: the blade that kills it takes its killer along.
    if (hasEffect(defender, "kill_back") && !defenderAlive && attackerAlive && survivingAttacker) {
      destroyInstance(state, playerId, survivingAttacker.instanceId, events, `${defender.name} drags ${survivingAttacker.name} down`);
    }
    if (defenderAlive && hasEffect(defender, "on_survive_buff_1")) {
      buffMinion(defender, 1, 1);
      events.push(effectEvent(`${defender.name} survives combat and gains +1/+1.`, defender));
    }
  }
  // Yoriichi Type Zero: any friendly that walks out of combat is sharpened.
  awardSurvivors(state, events, [attackerId, defender.instanceId]);
}

/** Yoriichi's payoff — a friendly that lived through the exchange gains +2/+1. */
function awardSurvivors(state: GameState, events: GameEvent[], fought: string[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    const board = state.players[playerId].board;
    const mentor = board.some((minion) => minion && hasEffect(minion, "survivor_buff") && !minion.silenced);
    if (!mentor) continue;
    for (const minion of board) {
      if (!minion || hasEffect(minion, "survivor_buff")) continue;
      if (!fought.includes(minion.instanceId)) continue;
      buffMinion(minion, 2, 1);
      events.push(effectEvent(`${minion.name} survives and grows +2/+1.`, minion));
    }
  }
}

function attackCore(state: GameState, playerId: PlayerId, attackerSlot: number, events: GameEvent[]): void {
  const attacker = state.players[playerId].board[attackerSlot];
  if (!attacker) return;
  const defenderId = opponent(playerId);
  // Exactly its ATK — no floor, no retaliation. Ea doubles a swing wherever it
  // lands; the One Ring adds its reach only against the core.
  let damage = hasRelic(attacker, "double_atk_damage") ? attacker.atk * 2 : attacker.atk;
  if (hasRelic(attacker, "core_strike_3")) damage += 3;
  state.players[defenderId].health -= damage;
  attacker.attacksUsed += 1;
  events.push({ kind: "damage", text: `${attacker.name} strikes the core for ${damage}.`, player: playerId, instanceId: attacker.instanceId });
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
  kind?: "board" | "slot" | "hand" | "option";
  side: "enemy" | "friendly" | "any";
  prompt: string;
  /** Which minions may be picked. `source` is excluded unless includeSelf is set. */
  filter?: (minion: MinionInstance, source: MinionInstance) => boolean;
  handFilter?: (card: CardDefinition, index: number) => boolean;
  includeSelf?: boolean;
  /** Preconditions checked BEFORE prompting, so the effect never asks then fizzles. */
  enabled?: (state: GameState, source: MinionInstance) => boolean;
  /** kind:"option" only — the labelled values on offer. */
  values?: LabelOption[];
}

export const TARGETED_EFFECTS: Partial<Record<EffectId, TargetSpec>> = {
  // --- enemy side ---
  freeze_two: { side: "enemy", prompt: "Choose the first enemy minion to Freeze" },
  set_attack_zero: { side: "enemy", prompt: "Set an enemy minion's ATK to 1" },
  set_hp_one: { side: "enemy", prompt: "Set an enemy minion's HP to 1" },
  freeze_one: { side: "enemy", prompt: "Freeze an enemy minion" },
  freeze_and_weaken: { side: "enemy", prompt: "Freeze an enemy and halve its ATK" },
  silence_enemy: { side: "enemy", prompt: "Silence an enemy minion", filter: (m) => !m.silenced },
  reduce_atk_3: { side: "enemy", prompt: "Weaken an enemy minion by 3 ATK", filter: (m) => m.atk > 0 },
  bounce_enemy: { side: "enemy", prompt: "Return an enemy minion to its owner's hand" },
  delayed_destroy: { side: "enemy", prompt: "Mark an enemy minion" },
  damage_evil_enemy_4: { side: "enemy", prompt: "Deal 4 damage to an Evil enemy", filter: (m) => m.alignment === "Evil" },
  damage_magic_enemy_2: { side: "enemy", prompt: "Deal 2 damage to a Magic enemy", filter: (m) => m.camp === "Magic" },
  destroy_small_4: { side: "enemy", prompt: "Destroy an enemy with 4 or less HP", filter: (m) => m.hp <= 4 },
  destroy_enemy: { side: "enemy", prompt: "Destroy an enemy minion" },
  destroy_enemy_taunt: { side: "enemy", prompt: "Destroy an enemy Taunt minion", filter: (m) => hasKeyword(m, "Taunt") },
  destroy_and_gain_stats: { side: "any", prompt: "Destroy a minion and gain its stats" },
  destroy_damaged_enemy: { side: "enemy", prompt: "Destroy a wounded enemy", filter: (m) => m.hp < m.maxHp },
  chain_damage: { side: "enemy", prompt: "Choose an enemy minion to take 1 damage" },
  devour_small: { side: "enemy", prompt: "Devour a small enemy", filter: (m) => m.atk <= 3 && m.hp <= 3 },
  lone_burst_8: {
    side: "enemy",
    prompt: "Unleash 8 damage on an enemy minion",
    enabled: (state, source) => friendlyOthers(state.players[source.owner], source).length === 0,
  },
  // --- friendly side ---
  evil_invulnerable: {
    side: "friendly",
    prompt: "Choose a friendly Evil minion to make Invulnerable",
    filter: (m) => m.alignment === "Evil",
    includeSelf: true,
  },
  protect_slot: { kind: "slot", side: "friendly", prompt: "Protect a friendly minion board slot" },
  tech_buff: { side: "friendly", prompt: "Upgrade a friendly Tech minion", filter: (m) => m.camp === "Tech", includeSelf: true },
  heal_ally_full: { side: "friendly", prompt: "Fully heal an ally" },
  heal_good_ally_full: { side: "friendly", prompt: "Fully heal a Good ally", filter: (m) => m.alignment === "Good" },
  buff_good_ally_3: { side: "friendly", prompt: "Give a Good ally +2/+2", filter: (m) => m.alignment === "Good" },
  buff_magic_ally_3: { side: "friendly", prompt: "Give a Magic ally +3/+3", filter: (m) => m.camp === "Magic" },
  buff_evil_ally_2: { side: "friendly", prompt: "Give an Evil ally +2/+2", filter: (m) => m.alignment === "Evil" },
  buff_evil_ally_3_2_heal: { side: "friendly", prompt: "Empower and heal an Evil ally", filter: (m) => m.alignment === "Evil" },
  buff_neutral_tech_ally_2: {
    side: "friendly",
    prompt: "Give a Neutral Tech ally +2/+2",
    filter: (m) => m.alignment === "Neutral" && m.camp === "Tech",
  },
  buff_good_tech_ally_2: {
    side: "friendly",
    prompt: "Give a Good Tech ally +2/+2",
    filter: (m) => m.alignment === "Good" && m.camp === "Tech",
  },
  give_shield_ally: { side: "friendly", prompt: "Give an ally Divine Shield", filter: (m) => !m.divineShield },
  give_dodge_half: { side: "friendly", prompt: "Give an ally 50% evasion", filter: (m) => !hasEffect(m, "dodge_half") },
  give_taunt: { side: "friendly", prompt: "Give an ally Taunt", filter: (m) => !hasKeyword(m, "Taunt") },
  devour_friendly: { side: "friendly", prompt: "Consume one of your own minions" },
  // --- the hard cards ---
  choose_relic: {
    side: "friendly",
    prompt: "Choose a friendly minion to receive an Ascension Relic",
    includeSelf: true,
    enabled: (state) => state.relicPool.length > 0,
    filter: (m) => !m.relic,
  },
  steal_relic: { side: "enemy", prompt: "Take an enemy minion's Ascension Relic", filter: (m) => m.relic !== null },
  destroy_relic: { side: "enemy", prompt: "Destroy an enemy minion's Ascension Relic", filter: (m) => m.relic !== null },
  mark_for_death: { side: "enemy", prompt: "Mark an enemy minion for death", filter: (m) => m.markedBy === null },
  mind_control_2: { side: "enemy", prompt: "Seize an enemy minion with 2 or less HP", filter: (m) => m.hp <= 2 },
  mind_control_4_delayed: {
    side: "enemy",
    prompt: "Claim an enemy minion with 4 or less HP — it defects next turn",
    filter: (m) => m.hp <= 4,
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
  alignment_shift: {
    kind: "option",
    side: "friendly",
    prompt: "Your minions all adopt the alignment",
    values: [
      { label: "Good", value: "Good" },
      { label: "Evil", value: "Evil" },
      { label: "Neutral", value: "Neutral" },
    ],
  },
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
  discard_draw_2: {
    kind: "hand",
    side: "friendly",
    prompt: "Choose the first card to discard",
  },
  consume_tech_card: {
    kind: "hand",
    side: "friendly",
    prompt: "Choose a Tech card to consume",
    handFilter: (card) => card.camp === "Tech",
  },
  // --- slot auras: pick a POSITION, empty or not; the mark is permanent ---
  slot_random_attacks: { kind: "slot", side: "enemy", prompt: "Curse an enemy slot — minions there attack at random, forever" },
  slot_permanent_silence: { kind: "slot", side: "enemy", prompt: "Silence an enemy slot — minions there are silenced, forever" },
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
      if (ownerId !== source.owner && !enemyTargetable(state, minion)) return;
      if (!spec.includeSelf && minion.instanceId === source.instanceId) return;
      if (spec.filter && !spec.filter(minion, source)) return;
      options.push({ owner: ownerId, slot });
    });
  }
  return options;
}

/** Whether an enemy effect may point at this minion at all. */
function enemyTargetable(state: GameState, minion: MinionInstance): boolean {
  if (minion.protectedSlot || isSlotProtected(state, minion)) return false;
  if (minion.relic?.relicId === "untargetable") return false; // Infinity Castle
  return true;
}

/** Every position on the chosen side — a slot aura does not need an occupant. */
function slotOptions(source: MinionInstance, spec: TargetSpec): TargetOption[] {
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return Array.from({ length: boardSize }, (_unused, slot) => ({ owner: ownerId, slot }));
}

function handOptions(state: GameState, source: MinionInstance, spec: TargetSpec, library: CardLibrary): HandOption[] {
  if (spec.enabled && !spec.enabled(state, source)) return [];
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return state.players[ownerId].hand
    .map((cardId, index) => ({ owner: ownerId, index, cardId }))
    .filter((option) => !spec.handFilter || spec.handFilter(library[option.cardId], option.index));
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
    kind === "board" ? targetOptions(state, source, spec) : kind === "slot" ? slotOptions(source, spec) : [];
  const handList = kind === "hand" ? handOptions(state, source, spec, library) : [];
  const labelList = kind === "option" ? (spec.values ?? []) : [];
  const count = boardList.length + handList.length + labelList.length;
  if (count === 0) return null;
  if (count === 1) {
    if (kind === "board" || kind === "slot") return { kind: "board", target: boardList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
    if (kind === "hand") return { kind: "hand", hand: handList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
    return { kind: "option", option: labelList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
  }
  state.pendingTarget = {
    kind,
    player: source.owner,
    sourceInstanceId: source.instanceId,
    sourceOwner: source.owner,
    sourceName: source.name,
    sourceCardId: source.cardId,
    effectId: source.effectId,
    prompt: spec.prompt,
    options: boardList,
    handOptions: handList,
    labelOptions: labelList,
    step,
    priorOptions,
    priorHandOptions,
    priorLabelOptions,
  };
  state.phase = "targeting";
  return "asked";
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

  // Voldemort still draws two when there are no cards available to discard.
  if (source.effectId === "discard_draw_2" && player.hand.length === 0) {
    drawDirect(state, source.owner, 2, events);
    events.push(effectEvent(`${label} draws two cards.`, source));
    return false;
  }

  // Targeted effects resolve against picked / pickedHand / pickedValue.
  let picked: MinionInstance | null = null;
  let pickedSlot: TargetOption | null = null;
  let pickedHand: HandOption | null = null;
  let pickedValue: string | null = null;
  const spec = TARGETED_EFFECTS[source.effectId];
  if (spec) {
    const answer = chosen ?? requestChoice(state, source, spec, library);
    if (answer === "asked") return true;
    if (answer === null) return false;
    if (answer.kind === "board") {
      pickedSlot = answer.target;
      picked = state.players[answer.target.owner].board[answer.target.slot] ?? null;
    } else if (answer.kind === "hand") pickedHand = answer.hand;
    else pickedValue = answer.option.value;
    // Slot answers share the board-option payload, so preserve the prompt's
    // semantic kind; every other stage can validate from its actual answer.
    const kind = spec.kind === "slot" ? "slot" : answer.kind;
    if (kind === "board" && !picked) return false;
    if (kind === "slot" && !pickedSlot) return false;
    if (kind === "hand" && !pickedHand) return false;
    if (kind === "option" && pickedValue === null) return false;
  }

  if (source.effectId === "draw_card") {
    drawDirect(state, source.owner, 1, events);
    events.push(effectEvent(`${label} draws a card.`, source));
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
    enemy.health -= 2;
    events.push(effectEvent(`${label} deals 2 to the enemy core.`, source));
  } else if (source.effectId === "heal_self") {
    source.hp = Math.min(source.maxHp, source.hp + 3);
    events.push(effectEvent(`${label} heals 3 HP.`, source));
  } else if (source.effectId === "aoe_damage_3") {
    damageAllEnemies(state, source, 3, events);
  } else if (source.effectId === "aoe_damage_2") {
    damageAllEnemies(state, source, 2, events);
  } else if (source.effectId === "harmony_buff") {
    // Camps only, down from camps PLUS alignments (balance pass). Counting both
    // scaled to +6/+6 a turn on a 6-mana body, for 67%. Three camps is the cap
    // now, which still makes a mixed board the point of the card.
    const camps = new Set([...player.board, ...enemy.board].filter(Boolean).map((minion) => minion!.camp));
    buffMinion(source, camps.size, camps.size);
    events.push(effectEvent(`${label} harmonizes for +${camps.size}/+${camps.size}.`, source));
  } else if (source.effectId === "evil_invulnerable") {
    const target = picked ?? firstFriendlyByAlignment(player, "Evil") ?? source;
    target.invulnerableUntilTurn = state.turnNumber + 2;
    events.push(effectEvent(`${label} makes ${target.name} Invulnerable.`, source));
  } else if (source.effectId === "set_attack_zero") {
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
  } else if (source.effectId === "freeze_opposing") {
    freezeTargets(state, source, enemyId, [sourceSlot], events);
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
  } else if (source.effectId === "set_hp_one") {
    const target = picked;
    if (target) {
      target.hp = Math.min(target.hp, 1);
      events.push(effectEvent(`${label} sets ${target.name}'s HP to 1.`, source));
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
    buffMinion(source, 1, 1);
    events.push(effectEvent(`${label} copies a fragment of power.`, source));
  } else if (source.effectId === "self_buff_2") {
    buffMinion(source, 2, 2);
    events.push(effectEvent(`${label} grows +2/+2.`, source));
  } else if (source.effectId === "self_atk_3") {
    source.atk += 3;
    events.push(effectEvent(`${label} gains +3 ATK.`, source));
  } else if (source.effectId === "heal_five") {
    source.hp = Math.min(source.maxHp, source.hp + 5);
    events.push(effectEvent(`${label} heals 5 HP.`, source));
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
  } else if (source.effectId === "destroy_all_small") {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = enemy.board[slot];
      if (minion && minion.hp <= 2 && !isSlotProtected(state, minion)) {
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
  } else if (source.effectId === "all_enemy_atk_down_2") {
    for (const minion of enemy.board) if (minion) minion.atk = Math.max(0, minion.atk - 2);
    events.push(effectEvent(`${label} saps enemy strength.`, source));
  } else if (source.effectId === "freeze_one") {
    if (picked) applyFreeze(state, source, picked, events);
  } else if (source.effectId === "freeze_all") {
    for (const playerId of [0, 1] as PlayerId[]) {
      for (const minion of state.players[playerId].board) {
        if (minion && minion.instanceId !== source.instanceId) applyFreeze(state, source, minion, events);
      }
    }
  } else if (source.effectId === "silence_enemy") {
    if (picked && canDisable(state, source.owner, picked)) {
      picked.silenced = true;
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
    buffAllAllies(player, source, (minion) => minion.alignment === "Good", 2, 2, false);
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
  } else if (source.effectId === "buff_all_good_1") {
    buffAllAllies(player, source, (minion) => minion.alignment === "Good", 1, 1, false);
    events.push(effectEvent(`${label} rallies the Good.`, source));
  } else if (source.effectId === "buff_all_neutral_1") {
    buffAllAllies(player, source, (minion) => minion.alignment === "Neutral", 1, 1, false);
    events.push(effectEvent(`${label} rallies the Neutral.`, source));
  } else if (source.effectId === "buff_all_magic_2_1") {
    buffAllAllies(player, source, (minion) => minion.camp === "Magic", 2, 1, false);
    events.push(effectEvent(`${label} empowers Magic allies.`, source));
  } else if (source.effectId === "buff_all_nature_2_1") {
    buffAllAllies(player, source, (minion) => minion.camp === "Nature", 2, 1, false);
    events.push(effectEvent(`${label} empowers Nature allies.`, source));
  } else if (source.effectId === "buff_all_tech_2_1") {
    buffAllAllies(player, source, (minion) => minion.camp === "Tech", 2, 1, false);
    events.push(effectEvent(`${label} empowers Tech allies.`, source));
  } else if (source.effectId === "buff_all_friendly_4_neg1") {
    // +3/-2, down from +3/-1 (pass 3) and +4/-1 before that: board-wide ATK
    // every turn measured 64.5% against a 51.8% bracket. The ATK is the card;
    // the HP cost is what makes it a bargain, so the cost is what goes up.
    for (const minion of player.board) if (minion) buffMinion(minion, 3, -2);
    sweepDeaths(state, events);
    events.push(effectEvent(`${label} gives power at a cost.`, source));
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
      events.push(effectEvent(`${label} shields ${target.name}.`, source));
    }
  } else if (source.effectId === "give_dodge_half") {
    if (picked && !hasEffect(picked, "dodge_half")) {
      picked.gainedEffects.push({ effectId: "dodge_half", timing: "passive", text: "Passive: Evades 50% of incoming attacks." });
      events.push(effectEvent(`${label} gives ${picked.name} 50% evasion.`, source));
    }
  } else if (source.effectId === "shield_all_friendly") {
    for (const minion of player.board) if (minion?.alignment === "Good") minion.divineShield = true;
    events.push(effectEvent(`${label} shields the Good.`, source));
  } else if (source.effectId === "shield_good_magic") {
    for (const minion of player.board) if (minion && (minion.alignment === "Good" || minion.camp === "Magic")) minion.divineShield = true;
    events.push(effectEvent(`${label} shields the faithful.`, source));
  } else if (source.effectId === "evil_two_shield") {
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
  } else if (source.effectId === "lone_burst_8") {
    const slot = slotOf(state, picked);
    if (picked && slot >= 0) {
      dealMinionDamage(state, picked.owner, slot, 8, source, events, true);
      events.push(effectEvent(`${label} unleashes 8 damage.`, source));
    }
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
  } else if (source.effectId === "steal_chosen") {
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
  } else if (source.effectId === "consume_tech_card") {
    if (pickedHand) {
      const def = library[player.hand.splice(pickedHand.index, 1)[0]];
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
      buffMinion(source, 3, 3);
      events.push(effectEvent(`${label} wins the coin flip for +3/+3.`, source));
    }
  } else if (source.effectId === "bounce_enemy") {
    const target = picked;
    const slot = slotOf(state, target);
    if (target && slot >= 0) {
      enemy.board[slot] = null;
      putCardInHand(state, enemyId, target.cardId, events);
      events.push(effectEvent(`${label} returns ${target.name} to hand.`, source));
    }
  } else if (source.effectId === "give_taunt") {
    const target = picked;
    if (target) {
      target.keywords.push("Taunt");
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

  // ----------------------------------------------------------------- the hard cards
  } else if (source.effectId === "choose_relic") {
    if (picked && pickedSlot) {
      const choices = state.relicPool.slice(0, 3).map((relic) => ({ label: relic.name, value: relic.id }));
      const next = requestChoice(
        state,
        source,
        {
          kind: "option",
          side: "friendly",
          prompt: "Choose 1 of 3 Ascension Relics",
          values: choices,
        },
        library,
        1,
        [pickedSlot],
      );
      if (next === "asked") return true;
      if (next) return runEffect(state, source, sourceSlot, library, events, next);
    } else if (chosen?.kind === "option" && chosen.priorOptions?.[0]) {
      const targetOption = chosen.priorOptions[0];
      const target = state.players[targetOption.owner].board[targetOption.slot];
      const relicIndex = state.relicPool.findIndex((relic) => relic.id === pickedValue);
      const relic = relicIndex >= 0 ? state.relicPool.splice(relicIndex, 1)[0] : null;
      if (target && relic && !target.relic) {
        equipRelic(state, target, relic, events);
        events.push(effectEvent(`${label} equips ${relic.name} to ${target.name}.`, source));
      }
    }
  } else if (source.effectId === "steal_relic") {
    // Ten Commandments. The card says "from the enemy hand", but relics are
    // equipment in this model, so it takes one off an enemy minion instead.
    if (picked?.relic) {
      const stolen = picked.relic;
      unequipRelic(picked);
      events.push(effectEvent(`${label} tears ${stolen.name} from ${picked.name}.`, source));
      equipRelic(state, source, stolen, events);
    }
  } else if (source.effectId === "destroy_relic") {
    if (picked?.relic) {
      const lost = picked.relic;
      unequipRelic(picked);
      events.push(effectEvent(`${label} destroys ${picked.name}'s ${lost.name}.`, source));
    }
  } else if (source.effectId === "mark_for_death") {
    if (picked) {
      picked.markedBy = source.instanceId;
      events.push(effectEvent(`${label} marks ${picked.name}.`, source));
    }
  } else if (source.effectId === "mind_control_2") {
    if (picked) seizeMinion(state, source, picked, events);
  } else if (source.effectId === "mind_control_4_delayed") {
    if (picked) {
      player.pendingControl = { instanceId: picked.instanceId, fromPlayer: picked.owner, dueTurn: state.turnNumber + 2 };
      events.push(effectEvent(`${label} commands ${picked.name} to defect next turn.`, source));
    }
  } else if (source.effectId === "copy_and_trigger") {
    if (picked && picked.effectId !== "none") {
      const borrowed = picked.effectId;
      events.push(effectEvent(`${label} copies ${picked.name}'s power.`, source));
      // Wear the effect for one resolution. A copied effect that itself wants a
      // target is not re-prompted — it takes the same victim it was copied from.
      const own = source.effectId;
      source.effectId = borrowed;
      runEffect(state, source, sourceSlot, library, events, { kind: "board", target: { owner: picked.owner, slot: slotOf(state, picked) } });
      source.effectId = own;
      state.pendingTarget = null;
      if (state.phase === "targeting") state.phase = "main";
    }
  } else if (source.effectId === "steal_passive") {
    if (picked && picked.effectId !== "none") {
      source.stolenPassiveFrom = picked.instanceId;
      source.stolenPassiveText = picked.effect;
      source.effectId = picked.effectId;
      source.effectTiming = "passive";
      picked.effectId = "none";
      picked.effectTiming = "none";
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
      if (canDisable(state, source.owner, minion)) minion.silenced = true;
    }
    if (source.gainedEffects.some((effect) => effect.timing === "ongoing")) source.effectTiming = "ongoing";
    events.push(effectEvent(`${label} silences Magic and gains ${copiedNames.length || "no"} effects.`, source));
    source.effectId = "none";
  } else if (source.effectId === "bounce_friendly_discount") {
    const slot = slotOf(state, picked);
    if (picked && slot >= 0) {
      const cardId = picked.cardId;
      player.board[slot] = null;
      putCardInHand(state, source.owner, cardId, events);
      player.costReductions[cardId] = (player.costReductions[cardId] ?? 0) + 5;
      events.push(effectEvent(`${label} sends ${picked.name} home; it returns 5 cheaper.`, source));
    }
  } else if (source.effectId === "replace_allies_from_deck") {
    const victims = friendlyOthers(player, source);
    let replaced = 0;
    for (const victim of victims) {
      const slot = slotOf(state, victim);
      if (slot < 0) continue;
      const drawn = drawFromDeck(state, 1, events)[0];
      destroyAtSlot(state, source.owner, slot, events, `${source.name} unmakes ${victim.name}`);
      if (!drawn || !library[drawn]) continue;
      if (player.board[slot]) continue;
      player.board[slot] = createMinion(library[drawn], source.owner, state);
      replaced += 1;
    }
    if (replaced > 0) events.push(effectEvent(`${label} remakes ${replaced} of your minions.`, source));
  } else if (source.effectId === "set_stats_choice") {
    if (pickedSlot) layAura(state, pickedSlot, "slot_stats_one", source, events);
  } else if (source.effectId === "alignment_shift") {
    const alignment = (pickedValue ?? "Neutral") as Alignment;
    for (const minion of player.board) if (minion) minion.alignment = alignment;
    events.push(effectEvent(`${label} turns your board ${alignment}.`, source));
  } else if (source.effectId === "pressure_chosen_card") {
    if (pickedHand) {
      const name = library[pickedHand.cardId]?.name ?? "a card";
      enemy.pressured = { cardId: pickedHand.cardId, dueTurn: state.turnNumber + 2 };
      events.push(effectEvent(`${label} names ${name} — play it next turn or lose it.`, source));
    }
  } else if (
    source.effectId === "slot_random_attacks" ||
    source.effectId === "slot_permanent_silence" ||
    source.effectId === "slot_growth"
  ) {
    const auraId: SlotAuraId =
      source.effectId === "slot_random_attacks"
        ? "random_attacks"
        : source.effectId === "slot_permanent_silence"
          ? "slot_silence"
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

// ---------------------------------------------------------------------------
// Ascension Relics. Every relic's text is about "the bearer", so a relic is
// equipment: gaining one straps it to a minion you control, and it is destroyed
// with that minion. A minion carries one at a time.
// ---------------------------------------------------------------------------
function grantRelic(state: GameState, playerId: PlayerId, source: MinionInstance, events: GameEvent[]): void {
  const relic = state.relicPool.shift();
  if (!relic) {
    events.push({ kind: "effect", text: "No Ascension Relics remain in the rift.", player: playerId });
    return;
  }
  events.push({ kind: "effect", text: `${source.name} claims ${relic.name}.`, player: playerId, instanceId: source.instanceId });
  // Its finder wears it when it can; otherwise it waits in the satchel and the
  // next minion to arrive picks it up.
  if (!source.relic) equipRelic(state, source, relic, events);
  else {
    const free = state.players[playerId].board.find((minion) => minion && !minion.relic);
    if (free) equipRelic(state, free, relic, events);
    else state.players[playerId].relics.push(relic);
  }
}

function equipRelic(state: GameState, bearer: MinionInstance, relic: RelicInstance, events: GameEvent[]): void {
  if (bearer.relic) {
    state.players[bearer.owner].relics.push(relic);
    return;
  }
  bearer.relic = relic;
  events.push({ kind: "effect", text: `${bearer.name} equips ${relic.name}.`, player: bearer.owner, instanceId: bearer.instanceId });
  // One-shot relics fire the moment they are strapped on.
  if (relic.relicId === "double_stats") {
    bearer.atk *= 2;
    bearer.maxHp *= 2;
    bearer.hp *= 2;
  } else if (relic.relicId === "bearer_divine_shield") {
    bearer.divineShield = true;
  } else if (relic.relicId === "heal_full_now") {
    bearer.hp = bearer.maxHp;
  } else if (relic.relicId === "monster_cell") {
    buffMinion(bearer, 4, 4);
    bearer.effectId = "none";
    bearer.effectTiming = "none";
    bearer.divineShield = false;
  } else if (relic.relicId === "cocoon") {
    bearer.chained = Math.max(bearer.chained, 1);
    relic.readyOnTurn = state.turnNumber + 2;
  }
}

function unequipRelic(bearer: MinionInstance): void {
  bearer.relic = null;
}

/** How many Ascension Relics a player may re-strap in one of their turns. */
export const RELIC_MOVES_PER_TURN = 1;

/**
 * Relics that spend themselves the instant they are strapped on. These may NOT
 * be moved. Re-equipping one would re-fire it — Rebirth Cube would double a
 * minion's stats every single turn — and moving one without re-firing it is a
 * dead action that only confuses. The other sixteen are read continuously by
 * combat, damage and upkeep, so moving those is exactly the decision worth
 * having. Keep this set in step with the one-shot branches in `equipRelic`.
 */
const ONE_SHOT_RELICS = new Set(["double_stats", "bearer_divine_shield", "heal_full_now", "monster_cell", "cocoon"]);

export function relicCanMove(relic: RelicInstance | null): boolean {
  return Boolean(relic && !ONE_SHOT_RELICS.has(relic.relicId));
}

/**
 * Re-strap a relic onto another friendly minion. Deliberately does NOT go
 * through `equipRelic`: that fires the one-shot relics, and this path must never
 * re-fire anything.
 */
function moveRelic(state: GameState, playerId: PlayerId, fromSlot: number, toSlot: number, events: GameEvent[]): void {
  const player = state.players[playerId];
  const bearer = player.board[fromSlot];
  const target = player.board[toSlot];
  if (!bearer || !target || !bearer.relic || target.relic) return;
  if (!relicCanMove(bearer.relic)) return;
  if (player.relicMoves >= RELIC_MOVES_PER_TURN) return;

  const relic = bearer.relic;
  bearer.relic = null;
  target.relic = relic;
  player.relicMoves += 1;
  events.push({
    kind: "effect",
    text: `${bearer.name} passes ${relic.name} to ${target.name}.`,
    player: playerId,
    instanceId: target.instanceId,
  });
}

function hasRelic(minion: MinionInstance | null | undefined, relicId: string): boolean {
  return Boolean(minion && minion.relic && minion.relic.relicId === relicId);
}

/** Mind control: move a minion to the other board if there is room for it. */
function seizeMinion(state: GameState, source: MinionInstance, victim: MinionInstance, events: GameEvent[]): void {
  const fromSlot = slotOf(state, victim);
  const taker = state.players[source.owner];
  const freeSlot = taker.board.findIndex((slot) => !slot);
  if (fromSlot < 0 || freeSlot < 0) {
    events.push(effectEvent(`${source.name} has no room to seize ${victim.name}.`, source));
    return;
  }
  state.players[victim.owner].board[fromSlot] = null;
  victim.owner = source.owner;
  victim.sleeping = true;
  victim.attacksUsed = 0;
  taker.board[freeSlot] = victim;
  events.push(effectEvent(`${source.name} seizes ${victim.name}.`, source));
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
  const board = state.players[target.owner];
  const existing = board.slotAuras.find((aura) => aura.slot === target.slot && aura.auraId === auraId);
  if (!existing) {
    board.slotAuras.push({ slot: target.slot, auraId, sourceName: source.name });
  }
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
      if (aura.auraId !== "slot_silence") continue;
      if (minion && !minion.silenced) {
        minion.silenced = true;
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
  const bodyguard = enemy.board.findIndex(
    (minion) => minion && hasEffect(minion, "redirect_attacks") && !minion.silenced,
  );
  const taunts = enemy.board
    .map((minion, slot) => ({ minion, slot }))
    .filter(({ minion }) => minion && hasKeyword(minion, "Taunt") && !minion.silenced)
    .map(({ slot }) => slot);
  let pool: number[];
  if (!ignoresGuards && bodyguard >= 0) pool = [bodyguard];
  else if (!ignoresGuards && taunts.length) pool = taunts;
  else {
    pool = enemy.board
      .map((minion, slot) => ({ minion, slot }))
      .filter(({ minion }) => minion)
      .map(({ slot }) => slot);
  }
  const legal = pool.filter((slot) => {
    const target = enemy.board[slot];
    return target ? canDeclareAttack(attacker, target) : false;
  });
  if (legal.length > 0) return legal[rollInt(state, legal.length)];
  // Nothing on the board it may hit — the core is the only thing left.
  return !ignoresGuards && (bodyguard >= 0 || taunts.length) ? null : "core";
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
  destroyAtSlot(state, picked.owner, slot, events, `${source.name} ${message}: ${picked.name}`);
}

/**
 * Resolves the target a player just named, then drains whatever was left of the
 * start-of-turn effect queue behind it.
 */
function chooseTarget(state: GameState, choiceIndex: number, library: CardLibrary, events: GameEvent[]): void {
  const pending = state.pendingTarget;
  if (!pending) return;
  let answer: ResolvedChoice | null = null;
  if ((pending.kind === "board" || pending.kind === "slot") && pending.options[choiceIndex]) {
    answer = {
      kind: "board",
      target: pending.options[choiceIndex],
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
    const slotIndex = state.players[pending.sourceOwner].board.findIndex(
      (minion) => minion?.instanceId === pending.sourceInstanceId,
    );
    const source = slotIndex >= 0 ? state.players[pending.sourceOwner].board[slotIndex] : null;
    if (source) runEffect(state, source, slotIndex, library, events, answer);
  }
  if (state.phase === "main") processEffectQueue(state, library, events);
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
    if (minion.effectTiming !== "ongoing" && minion.effectTiming !== "onPlayAndOngoing") continue;
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

function damageAllEnemies(state: GameState, source: MinionInstance, amount: number, events: GameEvent[]): void {
  const enemyId = opponent(source.owner);
  for (let slotIndex = 0; slotIndex < boardSize; slotIndex += 1) {
    if (state.players[enemyId].board[slotIndex]) {
      dealMinionDamage(state, enemyId, slotIndex, amount, source, events, true);
    }
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
): void {
  const target = state.players[owner].board[slotIndex];
  if (!target || amount <= 0) return;
  if (!canDamage(state, source, target, effectDamage, events)) return;
  amount = modifyIncoming(state, source, target, amount);
  if (amount <= 0) return;
  // Shinigami Eyes reads straight past a Divine Shield.
  if (target.divineShield && !hasRelic(source, "ignore_defences")) {
    target.divineShield = false;
    events.push({ kind: "combat", text: `${target.name}'s Divine Shield breaks.`, player: owner, instanceId: target.instanceId });
    return;
  }
  target.hp -= amount;
  events.push({ kind: "damage", text: `${target.name} takes ${amount} damage.`, player: owner, instanceId: target.instanceId });
  if (target.hp <= 0) {
    destroyAtSlot(state, owner, slotIndex, events, `${target.name} falls`);
  }
}

/** Relic damage maths, applied after the blow is allowed but before it lands. */
function modifyIncoming(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  amount: number,
): number {
  const relic = target.relic?.relicId;
  if (relic === "half_from_nature" && source.camp === "Nature") return Math.floor(amount / 2);
  if (relic === "half_from_tech" && source.camp === "Tech") return Math.floor(amount / 2);
  if (relic === "half_from_magic" && source.camp === "Magic") return Math.floor(amount / 2);
  // Philosopher's Stone: untouchable on your own turn, brittle on theirs.
  if (relic === "philosophers_stone" && state.activePlayer !== target.owner) return amount * 2;
  return amount;
}

function canDamage(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  effectDamage: boolean,
  events: GameEvent[],
): boolean {
  if (isSlotProtected(state, target)) {
    events.push(effectEvent(`${target.name} is protected by its board slot.`, target));
    return false;
  }
  if (target.invulnerableUntilTurn !== null && target.invulnerableUntilTurn > state.turnNumber) {
    events.push(effectEvent(`${target.name} is Invulnerable.`, target));
    return false;
  }
  // Doomsday's adaptation, and the defensive relics.
  if (target.campImmunity && target.campImmunity.untilTurn > state.turnNumber && target.campImmunity.camp === source.camp) {
    events.push(effectEvent(`${target.name} has adapted to ${source.camp}.`, target));
    return false;
  }
  if (hasRelic(target, "immune_magic") && source.camp === "Magic") {
    events.push(effectEvent(`${target.name}'s Lostvayne turns the Magic aside.`, target));
    return false;
  }
  if (hasEffect(target, "immune_nature_tech") && (source.camp === "Nature" || source.camp === "Tech") && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to ${source.camp} damage.`, target));
    return false;
  }
  if (hasRelic(target, "philosophers_stone") && state.activePlayer === target.owner) {
    events.push(effectEvent(`${target.name} is untouchable while the Stone holds.`, target));
    return false;
  }
  if (!target.silenced) {
    const ownerBoard = state.players[target.owner].board;
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
  if (!effectDamage && hasEffect(target, "oliva_ward") && source.atk < 2 && !target.silenced) {
    events.push(effectEvent(`${target.name} is unmoved.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "dodge_half") && !target.silenced) {
    if (coinFlip(state)) {
      events.push(effectEvent(`${target.name} slips away.`, target));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "dodge_80") && !target.silenced) {
    if (rollInt(state, 100) < 80) {
      events.push(effectEvent(`${target.name} slips away.`, target));
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

function canDeclareAttack(attacker: MinionInstance, target: MinionInstance): boolean {
  // Mahoraga: it adapts, and no attacker gets a second look at it all game.
  if (hasEffect(target, "attack_once_ever") && !target.silenced && target.attackedBy.includes(attacker.instanceId)) {
    return false;
  }
  return true;
}

function canAttack(minion: MinionInstance): boolean {
  if (hasEffect(minion, "evasive") && !minion.silenced) return false;
  if (minion.attackLocked) return false; // APR has taken this one's swing away for good
  // Hearthstone again: a minion with no ATK cannot attack at all. It used to be
  // able to, swinging for a floor of 1 at the core, which is not a rule anyone
  // would print on a card.
  if (minion.atk <= 0) return false;
  return !minion.sleeping && !minion.frozen && minion.chained === 0 && minion.attacksUsed < maxAttacks(minion);
}

/** Exported so the bot reads the SAME rule rather than keeping its own copy —
 *  it used to count every minion's swing once, which silently hid Flash's and
 *  Vergil's extra attacks from its lethal check. */
export function maxAttacks(minion: MinionInstance): number {
  if (!minion.silenced && hasEffect(minion, "triple_attack")) return 3;
  if (!minion.silenced && hasEffect(minion, "double_attack")) return 2;
  return 1;
}

function hasKeyword(card: Pick<CardDefinition | MinionInstance, "keywords">, keyword: string): boolean {
  return card.keywords.some((entry) => entry === keyword);
}

function hasEffect(minion: MinionInstance, effectId: EffectId): boolean {
  return minion.effectId === effectId || minion.gainedEffects.some((effect) => effect.effectId === effectId);
}

function isSlotProtected(state: GameState, minion: MinionInstance): boolean {
  const slot = slotOf(state, minion);
  return slot >= 0 && hasSlotAura(state, minion.owner, slot, "slot_protected");
}

function buffMinion(minion: MinionInstance, atk: number, hp: number): void {
  minion.atk += atk;
  minion.maxHp += hp;
  minion.hp += hp;
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

function freezeTargets(
  state: GameState,
  source: MinionInstance,
  targetOwner: PlayerId,
  targetSlots: number[],
  events: GameEvent[],
): void {
  for (const slotIndex of targetSlots) {
    const target = state.players[targetOwner].board[slotIndex];
    if (target) applyFreeze(state, source, target, events);
  }
}

function applyFreeze(state: GameState, source: MinionInstance, target: MinionInstance, events: GameEvent[]): void {
  if (!canDisable(state, source.owner, target)) {
    events.push(effectEvent(`${target.name} resists Freeze.`, target));
    return;
  }
  target.frozen = true;
  target.attacksUsed = maxAttacks(target);
  events.push(effectEvent(`${source.name} freezes ${target.name}.`, source));
}

function canDisable(state: GameState, sourceOwner: PlayerId, target: MinionInstance): boolean {
  if (target.protectedSlot || isSlotProtected(state, target)) return false;
  if (hasRelic(target, "immune_disable")) return false; // Anti-magic Mask
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
    .filter(({ minion }) => minion && predicate(minion));
  if (sortBy === "atk") candidates.sort((left, right) => left.minion!.atk - right.minion!.atk);
  const target = candidates[0];
  if (!target?.minion) return;
  destroyAtSlot(state, enemyId, target.slotIndex, events, `${source.name} ${message}: ${target.minion.name}`);
}

function destroyRandomMinion(state: GameState, playerId: PlayerId, events: GameEvent[], prefix: string): void {
  const occupied = state.players[playerId].board
    .map((minion, slotIndex) => ({ minion, slotIndex }))
    .filter(({ minion }) => minion);
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

function destroyAtSlot(state: GameState, playerId: PlayerId, slotIndex: number, events: GameEvent[], message: string): void {
  const minion = state.players[playerId].board[slotIndex];
  if (!minion) return;
  const rescued = hasRelic(minion, "return_on_death"); // The Green Mask
  state.players[playerId].board[slotIndex] = null;
  if (rescued) {
    events.push({ kind: "death", text: `${message} — The Green Mask sends it home.`, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
    putCardInHand(state, playerId, minion.cardId, events);
  } else {
    state.discard.push(minion.cardId);
    events.push({ kind: "death", text: message, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
  }
  // A relic dies with its bearer, and Chrollo hands a stolen passive back.
  if (minion.relic) minion.relic = null;
  releaseStolenPassive(state, minion, events);
  reactToDeath(state, minion, playerId, events);
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
    .filter(({ card }) => card && (!alignment || card.alignment === alignment));
  if (slotIndex < 0 || candidates.length === 0) return;
  const { cardId, handIndex } = candidates[rollInt(state, candidates.length)];
  player.hand.splice(handIndex, 1);
  const minion = createMinion(library[cardId], playerId, state);
  minion.chained = Math.max(2, minion.chained);
  player.board[slotIndex] = minion;
  events.push({ kind: "effect", text: `${player.name} summons ${minion.name} Chained.`, player: playerId, cardId, instanceId: minion.instanceId });
}

function checkGameOver(state: GameState, events: GameEvent[]): void {
  const playerOneDown = state.players[0].health <= 0;
  const playerTwoDown = state.players[1].health <= 0;
  if (!playerOneDown && !playerTwoDown) return;
  state.phase = "gameOver";
  state.drawChoice = null;
  state.pendingTarget = null;
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

function reactToDeath(state: GameState, dead: MinionInstance, deadOwner: PlayerId, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (const minion of state.players[playerId].board) {
      if (!minion || minion.silenced || minion.instanceId === dead.instanceId) continue;
      if (minion.effectId === "any_death_buff_2_2") {
        // +1/+1, via +1/+2 (pass 5) from +2/+2. Unbounded growth off EVERY death
        // on BOTH boards, so the opponent's own trades feed it, and the body is
        // already 1/1 with nothing left to cut. Pass 5's half-measure measured
        // 61.4% against a 50.3% bracket, so pass 6 finished the job and landed on
        // the branch below's number — Gravelord Nito, identical effect, 47.7%
        // against 48.5% and stable there since pass 3.
        //
        // Cutting the same card in two consecutive passes is normally how a card
        // gets destroyed (see APR). What makes it safe here is that a full
        // 1500-duel run sits BETWEEN the two cuts: the danger is an unmeasured
        // chain, not a second change. If this undershoots, the next move is a
        // body buff — there is no third nerf available.
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} feeds on death (+1/+1).`, minion));
      } else if (minion.effectId === "any_death_buff_2_1") {
        // +1/+1, down from +2/+1 (pass 3): 62.3% vs a 48.2% bracket off the
        // smallest body in the game. It counts EVERY death on BOTH boards with
        // no cap, so the opponent's own trades were feeding it.
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} feeds on death (+1/+1).`, minion));
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
