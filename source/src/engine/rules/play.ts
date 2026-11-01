/**
 * Playing a minion card and creating the minion it becomes.
 */
import { isMinionCard } from "../types";
import { traceEffect } from "../trace";
import type { CardDefinition, GameEvent, GameState, MinionInstance, PlayerId } from "../types";
import { CHAIN_TURNS, effectEvent, hasInfiniteMana, type CardLibrary } from "./core";
import { effectiveCardCost } from "./cards";
import { hasEffect, hasKeyword } from "./stats";
import { hasSlotAura } from "./auras";
import { runEffect } from "../effects/run-effect";

export function playCard(
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
  if (!isMinionCard(card) || hasSlotAura(state, playerId, slotIndex, "slot_bound")) return;
  const previousCostReduction = player.costReductions[cardId];
  const previousPressured = player.pressured?.cardId === cardId ? { ...player.pressured } : null;
  const manaPaid = hasInfiniteMana(state, playerId) ? 0 : effectiveCardCost(state, playerId, card);
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

export function createMinion(card: CardDefinition, owner: PlayerId, state: GameState): MinionInstance {
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
    ...(state.playerDecks ? { originalOwner: owner } : {}),
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
    // A card that PRINTS Chained arrives asleep as well, and that arrival turn
    // is already one of the two the keyword costs — so its counter is one lower
    // than `applyChain` sets, and the player still loses exactly two turns.
    chained: hasKeyword(card, "Chained") ? CHAIN_TURNS : 0,
    frozen: false,
    thawPending: false,
    silenced: false,
    passiveSilenceSources: [],
    divineShield: hasKeyword(card, "Divine Shield"),
    relic: null,
    relic2: null,
    suppressArrivalTheme: false,
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
    divineShieldAuraSources: [],
    brokenAuraSources: [],
    deathStarTarget: null,
    campImmunity: null,
    stolenPassiveFrom: null,
    stolenPassiveText: null,
    gainedEffects: [],
    savedCoreHealth: null,
    chainGrowthPending: false,
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
    minion.effectId !== "meleoron_protect_ally" &&
    minion.effectId !== "flowey_save_load"
  ) return;
  // A suspend here leaves phase === "targeting"; applyAction returns and the
  // player answers with `choose_target` before anything else can happen.
  runEffect(state, minion, slotIndex, library, events);
}
