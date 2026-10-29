/**
 * Bringing minions onto the board from decks, tokens and the dead.
 */
import { isMinionCard } from "../types";
import { drawPileFor } from "../draw-piles";
import { tokenCard } from "../tokens";
import type { CardDefinition, GameEvent, GameState, MinionInstance, PlayerId } from "../types";
import { boardSize, effectEvent, findEmptySlot, slotOf, type CardLibrary } from "./core";
import { createMinion } from "./play";
import { discardAttachedRelics } from "./relics";
import { hasSlotAura } from "./auras";
import { removeCardFromDrawPile } from "./cards";
import { rollInt } from "./random";

export function summonRandomCostFromDeck(
  state: GameState,
  playerId: PlayerId,
  cost: number,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const slot = findEmptySlot(state, playerId);
  if (slot < 0) return;
  const candidates = [...drawPileFor(state, playerId).deck, ...drawPileFor(state, playerId).bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && card.cost === cost;
  });
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, playerId, cardId)) return;
  const card = library[cardId];
  if (!isMinionCard(card)) return;
  const summoned = createMinion(card, playerId, state);
  player.board[slot] = summoned;
  events.push({ kind: "effect", text: `${player.name} summons ${summoned.name} from the deck.`, player: playerId, cardId, instanceId: summoned.instanceId });
}

export function summonRandomMinionFromDeck(
  state: GameState,
  source: MinionInstance,
  library: CardLibrary,
  events: GameEvent[],
  preferredSlot?: number,
  summoner: PlayerId = source.owner,
): void {
  const player = state.players[summoner];
  const slot = findEmptySlot(state, summoner, preferredSlot);
  if (slot < 0) return;
  const candidates = [...drawPileFor(state, summoner).deck, ...drawPileFor(state, summoner).bottomDeck].filter((cardId) => isMinionCard(library[cardId]));
  if (candidates.length === 0) return;
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, summoner, cardId)) return;
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

export function summonShenron(
  state: GameState,
  dead: MinionInstance,
  deadSlot: number,
  events: GameEvent[],
): void {
  const owner = dead.owner;
  const player = state.players[owner];
  const slot = findEmptySlot(state, owner, deadSlot);
  if (slot < 0) return;
  const shenron = tokenCard("token:shenron", { origin: dead.origin });
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

export function replaceWithRandomSameCost(state: GameState, target: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const slot = slotOf(state, target);
  if (slot < 0) return;
  const owner = target.owner;
  state.players[owner].board[slot] = null;
  discardAttachedRelics(state, target);
  // Pick the replacement from the draw pile BEFORE the displaced minion joins
  // it, or Angstrom Levy can "replace" a minion with the very card he just
  // buried — there is one copy of everything in this deck.
  const candidates = [...drawPileFor(state, owner).deck, ...drawPileFor(state, owner).bottomDeck].filter((cardId) => {
    const card = library[cardId];
    return isMinionCard(card) && card.cost === target.cost;
  });
  // `unshift`, not `push`. `drawFromDeck` refills with `bottomDeck.reverse()`,
  // so the LAST entry here is drawn FIRST — pushing put the card on top of the
  // deck, which is the opposite of what the card promises.
  drawPileFor(state, owner).bottomDeck.unshift(target.cardId);
  if (candidates.length === 0) {
    events.push({ kind: "effect", text: `${target.name} is put on the bottom of the deck, but no same-cost minion replaces it.`, player: owner, cardId: target.cardId });
    return;
  }
  const cardId = candidates[rollInt(state, candidates.length)];
  if (!cardId || !removeCardFromDrawPile(state, owner, cardId)) return;
  const replacement = library[cardId];
  if (!isMinionCard(replacement)) return;
  const summoned = createMinion(replacement, owner, state);
  state.players[owner].board[slot] = summoned;
  events.push({ kind: "effect", text: `${target.name} is replaced by ${summoned.name}.`, player: owner, cardId, instanceId: summoned.instanceId });
}

export function summonHeroPowerRecruit(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  const slot = findEmptySlot(state, playerId);
  if (slot < 0) return;
  const recruit = tokenCard("token:knight");
  const summoned = createMinion(recruit, playerId, state);
  summoned.suppressArrivalTheme = true;
  player.board[slot] = summoned;
  events.push({ kind: "effect", text: `${player.name} summons a 1/1 Knight.`, player: playerId, instanceId: summoned.instanceId });
}

export function summonHeroPowerSkeleton(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  const slot = findEmptySlot(state, playerId);
  if (slot < 0) return;
  const skeleton = tokenCard("token:skeleton");
  const summoned = createMinion(skeleton, playerId, state);
  summoned.suppressArrivalTheme = true;
  player.board[slot] = summoned;
  events.push({ kind: "effect", text: `${player.name} summons a 1/1 Skeleton.`, player: playerId, instanceId: summoned.instanceId });
}

export function reviveRandomFriendlyMinion(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[], label: string): void {
  const player = state.players[playerId];
  const slot = findEmptySlot(state, playerId);
  const dead = player.deadMinions ?? [];
  const candidates = dead.flatMap((cardId, index) => {
    const card = library[cardId];
    return isMinionCard(card) ? [{ cardId, index, card }] : [];
  });
  if (slot < 0 || candidates.length === 0) return;
  const chosen = candidates[rollInt(state, candidates.length)];
  if (!chosen) return;
  dead.splice(chosen.index, 1);
  const originalOwner = player.deadMinionOwners?.splice(chosen.index, 1)[0];
  const discardIndex = state.discard.indexOf(chosen.cardId);
  if (discardIndex >= 0) state.discard.splice(discardIndex, 1);
  const revived = createMinion(chosen.card, playerId, state);
  if (originalOwner !== undefined) revived.originalOwner = originalOwner;
  revived.suppressArrivalTheme = true;
  player.board[slot] = revived;
  events.push({ kind: "effect", text: `${label} revives ${revived.name}.`, player: playerId, instanceId: revived.instanceId, cardId: revived.cardId });
}

export function summonShadowClones(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const shadowClone = tokenCard("token:shadow-clone");
  const player = state.players[source.owner];
  let summoned = 0;
  for (let slot = 0; slot < boardSize; slot += 1) {
    if (player.board[slot] || hasSlotAura(state, source.owner, slot, "slot_bound")) continue;
    const tokenMinion = createMinion(shadowClone, source.owner, state);
    tokenMinion.suppressArrivalTheme = true;
    player.board[slot] = tokenMinion;
    summoned += 1;
  }
  if (summoned > 0) events.push(effectEvent(`${source.name} fills the board with ${summoned} Shadow Clones.`, source));
}

export function summonLarva(state: GameState, source: MinionInstance, dead: MinionInstance, events: GameEvent[]): void {
  const player = state.players[source.owner];
  const slot = findEmptySlot(state, source.owner);
  if (slot < 0) return;
  const larva = tokenCard("token:larva");
  const summoned = createMinion(larva, source.owner, state);
  player.board[slot] = summoned;
  events.push(effectEvent(`${source.name} hatches a 1/1 Larva after ${dead.name} dies.`, source));
}

export function summonSins(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const keywordOrder: Array<CardDefinition["keywords"][number]> = ["Taunt", "Divine Shield", "Charge", "Chained"];
  for (let index = keywordOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = rollInt(state, index + 1);
    [keywordOrder[index], keywordOrder[swapIndex]] = [keywordOrder[swapIndex], keywordOrder[index]];
  }
  const sin = tokenCard("token:sin", { origin: source.origin });
  const player = state.players[source.owner];
  const emptySlots = player.board
    .map((minion, slot) => (minion || hasSlotAura(state, source.owner, slot, "slot_bound") ? -1 : slot))
    .filter((slot) => slot >= 0);
  const summonedKeywords = keywordOrder.slice(0, emptySlots.length);
  summonedKeywords.forEach((keyword, index) => {
    const slot = emptySlots[index];
    const tokenMinion = createMinion({ ...sin, keywords: [keyword], effect: `${keyword}.` }, source.owner, state);
    tokenMinion.suppressArrivalTheme = true;
    player.board[slot] = tokenMinion;
  });
  if (summonedKeywords.length > 0) {
    events.push(effectEvent(`${source.name} summons ${summonedKeywords.length} Sin minions with different keywords.`, source));
  }
}

export function summonTieFighters(state: GameState, source: MinionInstance, events: GameEvent[]): void {
  const tieFighter = tokenCard("token:tie-fighter");
  const player = state.players[source.owner];
  let summoned = 0;
  for (let slot = 0; slot < boardSize && summoned < 2; slot += 1) {
    if (player.board[slot] || hasSlotAura(state, source.owner, slot, "slot_bound")) continue;
    const tokenMinion = createMinion(tieFighter, source.owner, state);
    tokenMinion.suppressArrivalTheme = true;
    player.board[slot] = tokenMinion;
    summoned += 1;
  }
  if (summoned > 0) {
    events.push(effectEvent(`${source.name} deploys ${summoned} 1/1 TIE Fighter${summoned === 1 ? "" : "s"} with Charge.`, source));
  }
}
