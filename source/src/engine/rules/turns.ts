/**
 * The shape of a turn: the opening mulligan, drawing, start-of-turn upkeep and the
 * timed states that come due, and ending the turn.
 */
import { drawPileFor, remainingDeckCards } from "../draw-piles";
import type { GameEvent, GameState, MinionInstance, PlayerId } from "../types";
import { boardSize, effectEvent, findEmptySlot, type CardLibrary } from "./core";
import {
  attachedRelics,
  discardAttachedRelics,
  resolveDueMonkeyPaws,
  resolveDuePandoraBoxes,
  resolveStartOfTurnRelics,
} from "./relics";
import { battlecryRunsAsOngoing, buffMinion, hasEffect, hasKeyword } from "./stats";
import { dealCoreDamage } from "./damage";
import { destroyAtSlot } from "./death";
import { drawFromDeck, putCardInHand } from "./cards";
import { processEffectQueue } from "./targeting";
import { resolveChainGrowth } from "./auras";
import { summonHeroPowerSkeleton } from "./summons";

export function toggleMulligan(state: GameState, playerId: PlayerId, handIndex: number): void {
  const mulligan = state.mulligan;
  if (!mulligan || mulligan.player !== playerId) return;
  if (handIndex < 0 || handIndex >= state.players[playerId].hand.length) return;
  mulligan.selected[handIndex] = !mulligan.selected[handIndex];
}

export function confirmMulligan(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
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
  const replacements = rejected.length > 0 ? drawFromDeck(state, playerId, rejected.length, events) : [];
  for (const cardId of replacements) putCardInHand(state, playerId, cardId, events);
  // The replaced cards go to the bottom only after the new cards are drawn, so
  // a player cannot immediately redraw the card they just rejected.
  drawPileFor(state, playerId).bottomDeck.unshift(...rejected);
  if (rejected.length > 0) {
    events.push({
      kind: "draw",
      text: `${player.name} mulligans ${rejected.length} opening card${rejected.length === 1 ? "" : "s"}.`,
      player: playerId,
    });
  } else {
    events.push({ kind: "draw", text: `${player.name} keeps the opening hand.`, player: playerId });
  }
  const queue = mulligan.players ?? [mulligan.player];
  const queueIndex = queue.indexOf(playerId);
  const nextPlayer = queueIndex >= 0 ? queue[queueIndex + 1] : undefined;
  if (nextPlayer !== undefined) {
    state.mulligan = {
      player: nextPlayer,
      selected: Array(state.players[nextPlayer].hand.length).fill(false),
      players: queue.slice(queueIndex + 1),
    };
    state.phase = "mulligan";
    events.push({ kind: "info", text: `${state.players[nextPlayer].name} chooses an opening hand.`, player: nextPlayer });
    return;
  }
  state.mulligan = null;
  state.phase = "main";
}

/** Saved bot settings override legacy Foresight; a live Detective L still grants it. */
export function hasForesight(state: GameState, playerId: PlayerId): boolean {
  return (state.botCheats?.[playerId]?.foresight ?? (state.foresightFor === playerId)) ||
    state.players[playerId].board.some((minion) => Boolean(minion &&
      hasEffect(minion, "foresight_draw") && !minion.silenced && minion.chained === 0));
}

export function beginTurn(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  state.activePlayer = playerId;
  state.turnNumber += 1;
  resolveDueMonkeyPaws(state, events);
  const player = state.players[playerId];
  player.minionCostPenaltyThisTurn = player.minionCostPenaltyNextTurn;
  player.minionCostPenaltyNextTurn = 0;
  player.turnsStarted += 1;
  events.push({ kind: "turn", text: `${player.name}'s turn begins.`, player: playerId });

  // GLaDOS's Test Protocol gives the player fifteen of their own turns. The
  // check happens when their sixteenth turn would open, so enemy half-turns
  // never shorten the promised window.
  if (playerId === 0 && state.heroPowers[1] === "glados_test_protocol" && player.turnsStarted > 15) {
    player.health = 0;
    state.winner = 1;
    state.phase = "gameOver";
    events.push({ kind: "effect", text: "Test Protocol expires. GLaDOS ends the experiment.", player: 1 });
    return;
  }

  // Hearthstone's draw: one card, no choice. The pick-1-of-2 that used to happen
  // every single turn is now a card's privilege — Detective L's Foresight — or
  // the Ascendant opponent's standing cheat, which is the same mechanic granted
  // permanently rather than earned by putting a minion on the board.
  //
  // In separate-deck duels the offers and rejected cards stay in this seat's pile.
  const foresight = hasForesight(state, playerId);
  const drawn = drawFromDeck(state, playerId, foresight ? 2 : 1, events);

  if (foresight && drawn.length > 1) {
    state.phase = "drawChoice";
    state.drawChoice = { player: playerId, cards: drawn };
    events.push({ kind: "draw", text: `${player.name} reads two futures and takes one.`, player: playerId });
    return;
  }

  if (drawn.length > 0) {
    for (const cardId of drawn) {
      putCardInHand(state, playerId, cardId, events);
    }
  } else {
    applyFatigue(state, playerId, events);
  }
  finishStartOfTurn(state, playerId, library, events);
}

export function chooseDraw(
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
  drawPileFor(state, playerId).bottomDeck.unshift(...rejected);
  if (rejected.length > 0) {
    events.push({ kind: "draw", text: `${state.players[playerId].name} sends ${rejected.length} card to the bottom.`, player: playerId });
  }
  state.drawChoice = null;
  finishStartOfTurn(state, playerId, library, events);
}

export function announceTopDeck(state: GameState, library: CardLibrary, events: GameEvent[]): void {
  for (const player of state.players) {
    const topCardId = remainingDeckCards(state, player.id)[0];
    if (!topCardId) continue;
    const cardName = library[topCardId]?.name ?? "a card";
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
  const startingMana = state.heroPowers[playerId] === "goku_start_mana" ? 2 : 1;
  const earnedMana = Math.min(10, startingMana + Math.round((player.turnsStarted - 1) * (state.manaRamp ?? 1)));
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

  if (state.heroPowers[playerId] === "ainz_skeleton" && player.turnsStarted % 2 === 0) summonHeroPowerSkeleton(state, playerId, events);

  const skipOngoing = new Set<string>();
  for (const minion of player.board) {
    if (!minion) continue;
    if (minion.attackLockedUntilTurn !== null && minion.attackLockedUntilTurn <= state.turnNumber) {
      minion.attackLocked = false;
      minion.attackLockedUntilTurn = null;
      events.push(effectEvent(`${minion.name} can attack again.`, minion));
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
      // NOT added to `skipOngoing`. The turn a chain reaches zero is a free
      // turn by every other rule in the engine: the minion may attack
      // (`readySwings` reads the decremented counter) and it is targetable
      // again (`isUntargetable` reads the same one). Adding it here charged the
      // Ongoing half one extra turn that the attack half never paid, so a
      // Chained engine sat out two payments for a one-turn chain. The
      // `chained === 0` filter below is what actually holds a still-chained
      // minion back.
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
  // One entry per ready minion. There used to be a second entry for a
  // `double_ongoing` relic, and no relic in the file has ever granted that, so
  // the branch was a permanent false.
  state.effectQueue = ready.map((minion) => ({ instanceId: minion.instanceId, owner: playerId }));

  processEffectQueue(state, library, events);
}

/**
 * Everything that comes due at the start of a player's turn before their board
 * acts: relic timers tick, and a card someone was pressured into playing burns
 * if they ignored it.
 */
function resolveUpkeep(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const player = state.players[playerId];

  resolveDuePandoraBoxes(state, playerId, events);
  resolveStasis(state, playerId, events);
  resolvePocketRooms(state, playerId, events);
  resolveMarkedDeaths(state, playerId, events);
  resolveDeathStar(state, playerId, events);

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

export function applyFatigue(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  player.fatigue += 1;
  if (dealCoreDamage(state, playerId, player.fatigue, events)) {
    events.push({ kind: "damage", text: `${player.name} takes ${player.fatigue} fatigue damage.`, player: playerId });
  }
}

export function spendCoin(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const player = state.players[playerId];
  player.coins -= 1;
  player.mana += 1;
  events.push({ kind: "effect", text: `${player.name} spends The Coin for +1 mana.`, player: playerId });
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
      const slot = findEmptySlot(state, winner.owner, preferred);
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
    const slot = findEmptySlot(state, entry.owner, preferred);
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

export function releaseDarkDimensionForSource(state: GameState, sourceInstanceId: string, events: GameEvent[]): void {
  const entries = state.darkDimension ?? [];
  const released = entries.filter((entry) => entry.sourceInstanceId === sourceInstanceId);
  if (released.length === 0) return;
  state.darkDimension = entries.filter((entry) => entry.sourceInstanceId !== sourceInstanceId);
  for (const entry of released) {
    const owner = state.players[entry.owner];
    const preferred = Math.max(0, Math.min(boardSize - 1, entry.slot));
    const slot = findEmptySlot(state, entry.owner, preferred);
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
      if (dealCoreDamage(state, target.owner, 12, events, source)) {
        events.push(effectEvent(`${source.name} fires on the marked core for 12 damage.`, source));
      }
    } else {
      const targetSlot = state.players[target.owner].board.findIndex((minion) => minion?.instanceId === target.instanceId);
      if (targetSlot >= 0) destroyAtSlot(state, target.owner, targetSlot, events, `${source.name} destroys the marked minion`);
    }
  }
}

export function resolveEndOfTurn(state: GameState, playerId: PlayerId, _library: CardLibrary, events: GameEvent[]): void {
  for (const minion of state.players[playerId].board) {
    if (!minion || minion.attacksUsed !== 0) continue;
    for (const relic of attachedRelics(minion)) {
      if (relic.relicId !== "green_lantern_ring") continue;
      buffMinion(minion, 2, 1);
      events.push(effectEvent(`${minion.name} grows through the Green Lantern Ring (+2/+1).`, minion));
    }
  }

  resolveTemporaryControls(state, playerId, events);
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
    const returnSlot = findEmptySlot(state, control.originalOwner, preferred);
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

/**
 * Clears the timed states that have run out.
 *
 * Every rule that reads these already compares against `turnNumber`, so an
 * expired one changes nothing about how a duel plays. What it changes is what
 * the BOARD says: `campImmunity` drives the adapted ring on Doomsday's card, and
 * nothing ever set it back to null, so a minion that adapted to Magic on turn 4
 * wore the ring for the rest of the duel while taking Magic damage normally. A
 * status the player can see has to stop being shown when it stops being true.
 */
export function expireTimedStates(state: GameState): void {
  for (const player of state.players) {
    for (const minion of player.board) {
      if (!minion) continue;
      if (minion.campImmunity && minion.campImmunity.untilTurn <= state.turnNumber) {
        minion.campImmunity = null;
      }
      if (
        minion.untargetableUntilTurn !== null &&
        minion.untargetableUntilTurn !== undefined &&
        minion.untargetableUntilTurn <= state.turnNumber
      ) {
        minion.untargetableUntilTurn = null;
      }
    }
  }
}
