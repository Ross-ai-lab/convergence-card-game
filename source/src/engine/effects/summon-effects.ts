/**
 * Effects that summon, revive, transform or replace minions.
 */
import { isMinionCard } from "../types";
import { tokenCard } from "../tokens";
import type { MinionInstance } from "../types";
import type { EffectContext } from "./context";
import { blockedByDominionAuthority, returnMinionsToHand, transformMinionFromPool } from "../rules/minions";
import { canDisable, isSlotProtected } from "../rules/stats";
import { createMinion } from "../rules/play";
import { effectEvent, findEmptySlot, friendlyOthers } from "../rules/core";
import {
  replaceWithRandomSameCost,
  summonRandomMinionFromDeck,
  summonShadowClones,
  summonSins,
  summonTieFighters,
} from "../rules/summons";
import { rollInt } from "../rules/random";

export function effectRebirthFriendlyDead(ctx: EffectContext): boolean | void {
  const { state, source, library, events, player, label } = ctx;
  const deadMinions = player.deadMinions ?? [];
  const slot = findEmptySlot(state, source.owner);
  const candidates = deadMinions.flatMap((cardId, index) => {
    const card = library[cardId];
    return isMinionCard(card) ? [{ cardId, index, card }] : [];
  });
  if (slot >= 0 && candidates.length > 0) {
    const chosen = candidates[rollInt(state, candidates.length)];
    if (!chosen) return false;
    deadMinions.splice(chosen.index, 1);
    const originalOwner = player.deadMinionOwners?.splice(chosen.index, 1)[0];
    const discardIndex = state.discard.indexOf(chosen.cardId);
    if (discardIndex >= 0) state.discard.splice(discardIndex, 1);
    const reborn = createMinion(chosen.card, source.owner, state);
    if (originalOwner !== undefined) reborn.originalOwner = originalOwner;
    reborn.suppressArrivalTheme = true;
    player.board[slot] = reborn;
    events.push(effectEvent(`${label} Rebirths ${reborn.name}.`, source));
  }
  return false;
}

export function effectReplaceSameCostRandom(ctx: EffectContext): boolean | void {
  const { state, source, library, events, picked } = ctx;
  if (picked && blockedByDominionAuthority(state, source, picked.owner)) {
    events.push(effectEvent(`${picked.name} is protected by Dominion Authority.`, picked));
  } else if (picked) {
    replaceWithRandomSameCost(state, picked, library, events);
  }
  return false;
}

export function effectMobAscend(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label } = ctx;
  const allies = friendlyOthers(player, source);
  if (allies.length >= 2) {
    returnMinionsToHand(state, player.id, allies, events);
    for(const bonus of source.auraBonuses??[]){bonus.atk=0;bonus.hp=0;bonus.spentAtk=0;bonus.suppressedHp=0;}
    source.atk = 10;
    source.maxHp = 10;
    source.hp = 10;
    events.push(effectEvent(`${label} releases its power and ascends to 10/10.`, source));
  }
}

export function effectSummonSins(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  summonSins(state, source, events);
}

export function effectNarutoShadowClones(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  summonShadowClones(state, source, events);
}

export function effectStarDestroyerTieFighters(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  summonTieFighters(state, source, events);
}

export function effectSummonMargit(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label } = ctx;
  const slot = findEmptySlot(state, source.owner);
  if (slot >= 0) {
    const summoned = createMinion(tokenCard("token:margit"), source.owner, state);
    summoned.suppressArrivalTheme = true;
    player.board[slot] = summoned;
    events.push(effectEvent(`${label} summons Margit the Fell Omen (1/1 with Taunt).`, source));
  }
}

export function effectChaosRandomSummon(ctx: EffectContext): boolean | void {
  const { state, source, library, events } = ctx;
  summonRandomMinionFromDeck(state, source, library, events);
}

export function effectAvatarAangAwakened(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  for (const minion of player.board) if (minion) minion.hp = minion.maxHp;
  events.push(effectEvent(`${label} restores all friendly minions.`, source));
}

export function effectTransformRandomAlliesUp(ctx: EffectContext): boolean | void {
  const { state, source, library, events, player, label } = ctx;
  // `player`, which is the CASTER's board, never `state.players[0]`. Worth
  // stating because the bug reported against this card was that an opponent's
  // Mask changed everybody's minions — and the way that reads on screen is
  // every minion on the table turning over at once, which is also what a
  // correct cast looks like from the wrong seat when both boards are full.
  const targets = player.board.filter((minion): minion is MinionInstance => Boolean(minion));
  const transformed = targets.reduce(
    (count, target) => count + (transformMinionFromPool(state, source, target, 1, library, events) ? 1 : 0),
    0,
  );
  events.push(effectEvent(`${label} transforms ${transformed} friendly minion${transformed === 1 ? "" : "s"}.`, source));
}

export function effectDevolveEnemyMinions(ctx: EffectContext): boolean | void {
  const { state, source, library, events, enemy, label } = ctx;
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
}
