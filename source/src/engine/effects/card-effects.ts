/**
 * Effects that draw, discover, steal or grant cards and relics.
 */
import { isMinionCard } from "../types";
import type { EffectContext } from "./context";
import {
  canEquipRelicToBearer,
  equipRandomRelic,
  equipRelic,
  firstRelicIndex,
  grantRandomRelicsToBoard,
  hasAnyRelic,
  hasFreeRelicSlot,
  relicAt,
  relicsInDeck,
  takeRelicFromDeckToHand,
  unequipRelic,
} from "../rules/relics";
import { copyMinionEffects, persistentEffects } from "../rules/minions";
import { drawDirect, putCardInHand, removeCardFromDrawPile, stealCard } from "../rules/cards";
import { effectEvent } from "../rules/core";
import { printedEffectId } from "../rules/targeting";
import { rollInt } from "../rules/random";

export function effectCopyMinionEffects(ctx: EffectContext): boolean | void {
  const { source, events, picked } = ctx;
  if (picked) copyMinionEffects(source, picked, events);
}

export function effectHeroicRelics(ctx: EffectContext): boolean | void {
  const { state, source, library, events } = ctx;
  grantRandomRelicsToBoard(state, source, library, events);
}

export function effectEquipRandomRelic(ctx: EffectContext): boolean | void {
  const { state, source, library, events } = ctx;
  equipRandomRelic(state, source, library, events);
}

export function effectDrawCard(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  drawDirect(state, source.owner, 1, events);
  events.push(effectEvent(`${label} draws a card.`, source));
}

export function effectDrawRelic(ctx: EffectContext): boolean | void {
  const { state, source, library, events, label } = ctx;
  // A random relic, not a choice. Gol D. Roger and Indiana Jones already offer
  // the pick-one-of-three version, and the house spirit is not a treasure
  // hunter — it turns up with something useful and no ceremony.
  //
  // The randomness runs through the seeded RNG like everything else, never
  // Math.random, so a duel replays identically from its seed.
  const available = relicsInDeck(state, source.owner, library);
  if (available.length) {
    const choice = available[rollInt(state, available.length)];
    const relic = takeRelicFromDeckToHand(state, source.owner, choice.id, library, events);
    if (relic) events.push(effectEvent(`${label} turns up ${relic.name}.`, source));
  } else {
    events.push(effectEvent(`${label} finds no relic left.`, source));
  }
}

export function effectDiscoverRandomKeywordMinion(ctx: EffectContext): boolean | void {
  const { state, source, library, events, label, pickedValue } = ctx;
  // A real Discover now. The card has always printed "Discover ... Draw one"
  // while the engine simply took one at random, so the choice it promised
  // never reached the player.
  const card = pickedValue ? library[pickedValue] : undefined;
  if (pickedValue && isMinionCard(card) && removeCardFromDrawPile(state, source.owner, pickedValue)) {
    putCardInHand(state, source.owner, pickedValue, events);
    events.push(effectEvent(`${label} discovers ${card.name}.`, source));
  }
}

export function effectCopyMinionToHand(ctx: EffectContext): boolean | void {
  const { state, source, library, events, label, picked } = ctx;
  if (picked) {
    const card = library[picked.cardId];
    if (isMinionCard(card)) {
      putCardInHand(state, source.owner, card.id, events);
      events.push(effectEvent(`${label} puts a copy of ${picked.name} into your hand.`, source));
    }
  }
}

export function effectCopyPassive(ctx: EffectContext): boolean | void {
  const { source, events, player, enemy, label } = ctx;
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
}

export function effectDiscoverTechCard(ctx: EffectContext): boolean | void {
  const { state, source, library, events, label, pickedValue } = ctx;
  const card = pickedValue ? library[pickedValue] : undefined;
  if (pickedValue && isMinionCard(card) && card.camp === "Tech" && removeCardFromDrawPile(state, source.owner, pickedValue)) {
    putCardInHand(state, source.owner, pickedValue, events);
    events.push(effectEvent(`${label} draws ${card.name}.`, source));
  }
}

export function effectStealHandRelic(ctx: EffectContext): boolean | void {
  const { state, source, events, enemy, pickedHand } = ctx;
  if (pickedHand) stealCard(state, source, enemy, () => pickedHand.index, events);
}

export function effectStealAndEquipRelic(ctx: EffectContext): boolean | void {
  const { state, source, library, events, label, picked } = ctx;
  if (picked && hasAnyRelic(picked) && hasFreeRelicSlot(source)) {
    const relicIndex = firstRelicIndex(picked);
    const stolen = relicAt(picked, relicIndex);
    if (!stolen || !canEquipRelicToBearer(stolen, source)) return false;
    unequipRelic(picked, relicIndex);
    equipRelic(state, source, stolen, library, events);
    events.push(effectEvent(`${label} takes ${stolen.name} from ${picked.name} and equips it.`, source));
  }
}

export function effectDestroyRelic(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked } = ctx;
  if (picked && hasAnyRelic(picked)) {
    const relicIndex = firstRelicIndex(picked);
    const lost = relicAt(picked, relicIndex);
    if (!lost) return false;
    unequipRelic(picked, relicIndex);
    state.discard.push(lost.id);
    events.push(effectEvent(`${label} destroys ${picked.name}'s ${lost.name}.`, source));
  }
}

export function effectStealPassive(ctx: EffectContext): boolean | void {
  const { source, events, label, picked } = ctx;
  if (picked && picked.effectId !== "none") {
    source.stolenPassiveFrom = picked.instanceId;
    source.stolenPassiveText = picked.effect;
    source.effectId = printedEffectId(picked);
    source.effectTiming = "passive";
    picked.effectId = "none";
    picked.effectTiming = "none";
    events.push(effectEvent(`${label} steals ${picked.name}'s passive.`, source));
  }
}
