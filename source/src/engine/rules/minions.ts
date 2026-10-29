/**
 * Moving minions between seats, hands and forms: control, bouncing, transforming and
 * copying effects.
 */
import { isMinionCard } from "../types";
import { isTokenCardId } from "../tokens";
import type {
  CardDefinition,
  EffectId,
  GameEvent,
  GameState,
  MinionInstance,
  PlayerId,
  TemporaryMinionControl,
} from "../types";
import { effectEvent, findEmptySlot, slotOf, type CardLibrary } from "./core";
import { buffMinion, hasEffect, hasKeyword } from "./stats";
import { createMinion } from "./play";
import { destroyAtSlot } from "./death";
import { discardAttachedRelics, firstRelicIndex, relicAt } from "./relics";
import { printedEffectId } from "./targeting";
import { putCardInHand } from "./cards";
import { rollInt } from "./random";

export function copyMinionEffects(source: MinionInstance, target: MinionInstance, events: GameEvent[]): void {
  const keepStats = { atk: source.atk, hp: source.hp, maxHp: source.maxHp, baseAtk: source.baseAtk, baseHp: source.baseHp };
  source.name = target.name;
  source.cost = target.cost;
  source.rarity = target.rarity;
  source.camp = target.camp;
  source.alignment = target.alignment;
  source.keywords = [...target.keywords];
  source.effectId = printedEffectId(target);
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

export function persistentEffects(minion: MinionInstance): Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }> {
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
export function copyPersistentMinionTraits(source: MinionInstance, target: MinionInstance): number {
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

export function consumeEnemyMinion(
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

export function returnMinionsToHand(state: GameState, playerId: PlayerId, minions: MinionInstance[], events: GameEvent[]): void {
  const entries = minions
    .map((minion) => ({ minion, slot: slotOf(state, minion) }))
    .filter(({ minion, slot }) => minion.owner === playerId && slot >= 0);
  for (const { minion, slot } of entries) {
    state.players[playerId].board[slot] = null;
    discardAttachedRelics(state, minion);
    putCardInHand(state, playerId, minion.cardId, events, minion.instanceId);
  }
}

export function returnAllMinionsToHand(
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
    putCardInHand(state, state.playerDecks ? (minion.originalOwner ?? owner) : owner, minion.cardId, events, minion.instanceId);
  }
}

export function transformMinionFromPool(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  costDelta: number,
  library: CardLibrary,
  events: GameEvent[],
  preserveRelicId?: string,
  sourceLabel?: string,
): boolean {
  const slot = slotOf(state, target);
  if (slot < 0) return false;
  const candidates = Object.values(library).filter(
    (card): card is CardDefinition => isMinionCard(card) && !isTokenCardId(card.id) && card.cost === target.cost + costDelta,
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
  if (target.originalOwner !== undefined) transformed.originalOwner = target.originalOwner;
  transformed.suppressArrivalTheme = true;
  state.players[target.owner].board[slot] = transformed;
  // `sourceLabel` exists because a RELIC can be the thing doing this, and a
  // relic has no minion to name. The Stand Arrow transforms its own bearer, so
  // the line read "Tech Hub transforms Tech Hub into Zoro" — which looks like a
  // minion doing something impossible rather than a relic doing exactly what it
  // prints.
  events.push(effectEvent(`${sourceLabel ?? source.name} transforms ${target.name} into ${transformed.name}.`, source));
  return true;
}

function hasDominionAuthority(state: GameState, owner: PlayerId): boolean {
  return state.players[owner].board.some(
    (minion) => minion && !minion.silenced && hasEffect(minion, "dominion_authority"),
  );
}

export function blockedByDominionAuthority(state: GameState, source: MinionInstance, targetOwner: PlayerId): boolean {
  return source.owner !== targetOwner && hasDominionAuthority(state, targetOwner);
}

/** Mind control: move a minion to the other board if there is room for it. */
export function seizeMinion(state: GameState, source: MinionInstance, victim: MinionInstance, events: GameEvent[]): void {
  if (blockedByDominionAuthority(state, source, victim.owner)) {
    events.push(effectEvent(`${victim.name} is protected by Dominion Authority.`, victim));
    return;
  }
  const fromSlot = slotOf(state, victim);
  const taker = state.players[source.owner];
  const freeSlot = findEmptySlot(state, source.owner);
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
export function seizeMinionTemporarily(
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
  const freeSlot = findEmptySlot(state, source.owner);
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
