/**
 * Relics: playing and equipping them, what each one does on its own schedule, and
 * finding them in a deck.
 */
import { isRelicCard } from "../types";
import { drawPileFor } from "../draw-piles";
import type {
  GameEvent,
  GameState,
  MinionInstance,
  PlayerId,
  RelicDefinition,
  RelicInstance,
  RelicId,
} from "../types";
import { effectEvent, hasInfiniteMana, slotOf, type CardLibrary } from "./core";
import { applyChain, applySilence, buffMinion, hasKeyword } from "./stats";
import { cleanseNegativeStatuses } from "./auras";
import { cloneState } from "../game";
import { coinFlip, rollInt } from "./random";
import { destroyAtSlot, sweepDeaths } from "./death";
import { effectiveCardCost, putCardInHand, removeCardFromDrawPile } from "./cards";
import { returnMinionsToHand, transformMinionFromPool } from "./minions";
import { runEffect } from "../effects/run-effect";

export function playRelic(
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
  if (!hasInfiniteMana(state, playerId)) player.mana -= effectiveCardCost(state, playerId, relic);
  if (player.costReductions[cardId]) delete player.costReductions[cardId];
  if (player.pressured?.cardId === cardId) player.pressured = null;
  const instance = createRelicInstance(relic);
  // The PLAY is logged before the relic is strapped on, which is the order it
  // happened in. It used to be logged after, and equipping is not a quiet
  // operation — a relic prints its own equip line and several of them fire an
  // effect immediately — so the log read backwards for the whole relic path:
  // "Knight equips Poké Ball", "Knight returns to hand in the Poké Ball", and
  // only then "Player Two plays Poké Ball on Knight". Every other play in the
  // game already logs the action first and its consequences after.
  events.push({
    kind: "play",
    text: `${player.name} plays ${relic.name} on ${bearer.name}.`,
    player: playerId,
    cardId: relic.id,
    instanceId: bearer.instanceId,
  });
  equipRelic(state, bearer, instance, library, events);
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

/** Resolve relics whose printed text begins at the bearer's owner's turn. */
export function resolveStartOfTurnRelics(
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
export function resolveDueMonkeyPaws(state: GameState, events: GameEvent[]): void {
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
    // ONE line, not two. This used to push "X dies from The Monkey's Paw" and
    // then let `destroyAtSlot` push "X falls to The Monkey's Paw" underneath it,
    // so every paw death was reported twice and read like two minions dying.
    // The death event already names the cause.
    destroyAtSlot(state, entry.owner, entry.slot, events, `${minion.name} falls to The Monkey's Paw`, null);
  }
}

/**
 * Pandora's Box used to claim its bearer at the start of the owner's next turn.
 * A box opened today never sets `destroyOnOwnerTurn`, so this only finishes a
 * box equipped in a duel saved before the change.
 */
export function resolveDuePandoraBoxes(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const due = state.players[playerId].board
    .map((minion, slot) => ({ minion, slot }))
    .filter(({ minion }) =>
      minion &&
      attachedRelics(minion).some(
        (relic) => relic.relicId === "pandora_box" && (relic.destroyOnOwnerTurn ?? Infinity) <= state.players[playerId].turnsStarted,
      ),
    );

  for (const entry of due) {
    const minion = state.players[playerId].board[entry.slot];
    if (!minion) continue;
    const boxIndex = firstRelicIndex(minion, (relic) => relic.relicId === "pandora_box");
    const box = boxIndex >= 0 ? relicAt(minion, boxIndex) : null;
    if (!box || (box.destroyOnOwnerTurn ?? Infinity) > state.players[playerId].turnsStarted) continue;
    unequipRelic(minion, boxIndex);
    state.discard.push(box.id);
    events.push({
      kind: "effect",
      text: `${minion.name} dies from Pandora's Box.`,
      player: playerId,
      cardId: box.id,
      instanceId: minion.instanceId,
    });
    destroyAtSlot(state, playerId, entry.slot, events, `${minion.name} falls to Pandora's Box`, null);
  }
}

// The passive board-ping used to live here: every ready minion clipped the enemy
// core for 1 at the start of their turn, regardless of anything printed on it.
// It was removed once minions could swing at the core themselves — two clocks
// running at once ended duels the turn a board completed, and the ping was the
// one that made a card's cost and ATK irrelevant. Hearthstone has no such rule.

/** Relics available in the effect controller's draw and bottom piles. */
export function relicsInDeck(state: GameState, playerId: PlayerId, library: CardLibrary): RelicDefinition[] {
  return [...drawPileFor(state, playerId).deck, ...drawPileFor(state, playerId).bottomDeck]
    .map((cardId) => library[cardId])
    .filter((card): card is RelicDefinition => isRelicCard(card));
}

export function grantRandomRelic(
  state: GameState,
  playerId: PlayerId,
  source: MinionInstance,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const available = relicsInDeck(state, playerId, library);
  if (available.length === 0) {
    events.push(effectEvent(`${source.name} finds no Relic.`, source));
    return;
  }
  const relic = available[rollInt(state, available.length)];
  if (!relic || !removeCardFromDrawPile(state, playerId, relic.id)) return;
  putCardInHand(state, playerId, relic.id, events);
  events.push(effectEvent(`${source.name} grants a random Relic: ${relic.name}.`, source));
}

export function takeRelicFromDeckToHand(
  state: GameState,
  playerId: PlayerId,
  relicId: string,
  library: CardLibrary,
  events: GameEvent[],
): RelicDefinition | null {
  const relic = library[relicId];
  if (!isRelicCard(relic)) return null;
  if (!removeCardFromDrawPile(state, playerId, relicId)) return null;
  putCardInHand(state, playerId, relicId, events);
  return relic;
}

/** Resolve every live Frieren trigger caused by one relic play, once per source
 * each turn, pausing between discoveries when the player has more than one. */
export function triggerRelicDiscoveries(
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
    if (relicsInDeck(state, playerId, library).length === 0) continue;
    const suspended = runEffect(state, source, sourceSlot, library, events);
    if (suspended) {
      if (state.pendingTarget) state.pendingTarget.queuedRelicSources = remaining;
      return;
    }
  }
}

export function grantRandomRelicsToBoard(state: GameState, source: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  // Never the caster. "All your other minions" (owner's ruling, 2 September
  // 2026): a 2/2 body arming itself was the single best line the card had, and
  // it made a board-wide effect read as a self-buff.
  const bearers = state.players[source.owner].board.filter(
    (minion): minion is MinionInstance =>
      Boolean(minion && minion.instanceId !== source.instanceId && hasFreeRelicSlot(minion)),
  );
  const available = relicsInDeck(state, source.owner, library).map((relic) => relic.id);
  let granted = 0;
  for (const bearer of bearers) {
    const eligible = available.filter((cardId) => {
      const relic = library[cardId];
      return isRelicCard(relic) && canEquipRelicToBearer(relic, bearer);
    });
    // `continue`, not `break`: eligibility is per BEARER. Mjolnir and Excalibur
    // only fit a Good minion, so one Evil bearer with nothing left it could hold
    // used to end the whole grant and rob every ally standing behind it.
    if (eligible.length === 0) continue;
    const cardId = eligible[rollInt(state, eligible.length)];
    const availableIndex = available.indexOf(cardId);
    if (availableIndex < 0) continue;
    available.splice(availableIndex, 1);
    if (!cardId || !removeCardFromDrawPile(state, source.owner, cardId)) continue;
    const relic = library[cardId];
    if (!isRelicCard(relic)) continue;
    equipRelic(state, bearer, createRelicInstance(relic), library, events);
    granted += 1;
  }
  events.push(effectEvent(`${source.name} grants Relics to ${granted} friendly minion${granted === 1 ? "" : "s"}.`, source));
}

export function equipRandomRelic(state: GameState, source: MinionInstance, library: CardLibrary, events: GameEvent[]): void {
  const available = relicsInDeck(state, source.owner, library).filter((relic) => canEquipRelicToBearer(relic, source));
  if (available.length === 0) {
    events.push(effectEvent(`${source.name} finds no Relic.`, source));
    return;
  }
  const relic = available[rollInt(state, available.length)];
  if (!relic || !removeCardFromDrawPile(state, source.owner, relic.id)) return;
  equipRelic(state, source, createRelicInstance(relic), library, events);
}

export function relicRequiredAlignment(relicId: string, effect?: string): "Good" | "Evil" | "Neutral" | null {
  const printed = effect?.match(/Can only be equipped by (Good|Evil|Neutral) minions/i)?.[1];
  if (printed === "Good" || printed === "Evil" || printed === "Neutral") return printed;
  if (relicId === "mjolnir" || relicId === "excalibur") return "Good";
  return null;
}

export function canEquipRelicToBearer(relic: Pick<RelicDefinition | RelicInstance, "relicId"> & { effect?: string }, bearer: MinionInstance): boolean {
  const required = relicRequiredAlignment(relic.relicId, relic.effect);
  return required === null || bearer.alignment === required;
}

/**
 * Pandora's Box takes on a random other relic's effect, rolled when it is
 * equipped. The card stays Pandora's Box: it keeps the box's id, so the box is
 * what goes to the discard pile, while it carries the chosen relic's rule id,
 * text, art and name, so every rule keyed on that relic applies to it.
 * Only printed roster relics the bearer could carry itself are rolled.
 */
function openPandorasBox(
  state: GameState,
  bearer: MinionInstance,
  box: RelicInstance,
  library: CardLibrary,
  events: GameEvent[],
): RelicInstance {
  const options = Object.values(library).filter((card): card is RelicDefinition =>
    isRelicCard(card) && /^r\d+$/.test(card.id) && card.relicId !== "none" && card.relicId !== "pandora_box" && canEquipRelicToBearer(card, bearer));
  if (options.length === 0) return box;
  const chosen = options[rollInt(state, options.length)];
  events.push({
    kind: "effect",
    text: `Pandora's Box opens: ${bearer.name} gains the effect of ${chosen.name}.`,
    player: bearer.owner,
    cardId: box.id,
    instanceId: bearer.instanceId,
  });
  return { ...createRelicInstance(chosen), id: box.id, name: `Pandora's Box: ${chosen.name}` };
}

export function equipRelic(
  state: GameState,
  bearer: MinionInstance,
  relic: RelicInstance,
  library: CardLibrary,
  events: GameEvent[],
): void {
  if (!canEquipRelicToBearer(relic, bearer)) return;
  const slot = bearer.relic === null ? 0 : bearer.relic2 === null || bearer.relic2 === undefined ? 1 : -1;
  if (slot < 0) return;
  if (relic.relicId === "pandora_box") relic = openPandorasBox(state, bearer, relic, library, events);
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
  } else if (relic.relicId === "monkeys_paw") {
    buffMinion(bearer, 5, 5);
    relic.destroyOnTurn = state.turnNumber + 1;
  } else if (relic.relicId === "ark_divine_shield") {
    bearer.divineShield = true;
  } else if (relic.relicId === "heal_full_now") {
    bearer.hp = bearer.maxHp;
  } else if (relic.relicId === "monster_cell") {
    buffMinion(bearer, 2, 2);
    if (!hasKeyword(bearer, "Taunt")) bearer.keywords.push("Taunt");
  } else if (relic.relicId === "cocoon") {
    // The default, like every other chain in the game. It used to ask for one
    // turn, which the old counter resolved as none at all, so the drawback this
    // relic prints was decoration and its +3/+3 was free.
    applyChain(state, bearer, events);
    relic.readyOnTurn = state.turnNumber + 2;
  } else if (relic.relicId === "excalibur") {
    if (!hasKeyword(bearer, "Charge")) bearer.keywords.push("Charge");
    bearer.sleeping = false;
  } else if (relic.relicId === "stand_arrow") {
    if (!coinFlip(state) || !transformMinionFromPool(state, bearer, bearer, 2, library, events, undefined, "The Stand Arrow")) {
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

export function unequipRelic(bearer: MinionInstance, relicIndex = 0): void {
  setRelicAt(bearer, relicIndex, null);
}

/**
 * Straps a relic onto a minion already on the board, from outside a turn.
 *
 * Exists for the Ross-mode workbench and the `__debug` test hook, which both
 * used to build a `RelicInstance` by hand and drop it into the bearer's relic
 * slot. That skipped `equipRelic` and therefore skipped every one-shot a relic
 * fires the moment it lands: The Holy Grail did not double the stats, the Ark
 * granted no shield, the Poké Ball did not bounce, and testing a relic that way
 * showed a card that does not exist in a real duel.
 *
 * Returns a NEW state, or null when nothing could be equipped — no bearer, both
 * relic slots full, or a Good-only relic on an Evil minion.
 */
export function equipRelicFromOutside(
  state: GameState,
  owner: PlayerId,
  slotIndex: number,
  relic: RelicDefinition,
  library: CardLibrary,
): { state: GameState; events: GameEvent[] } | null {
  const next = cloneState(state);
  const bearer = next.players[owner].board[slotIndex];
  if (!bearer || !hasFreeRelicSlot(bearer) || !canEquipRelicToBearer(relic, bearer)) return null;
  const events: GameEvent[] = [];
  equipRelic(next, bearer, createRelicInstance(relic), library, events);
  sweepDeaths(next, events);
  return { state: next, events };
}

/**
 * Whether this minion is wearing a particular relic.
 *
 * `RelicId`, never `string`. It took a plain string for a long time, and six
 * dead checks accumulated behind it: `double_atk_damage`, `double_ongoing`,
 * `core_strike_3`, `untargetable`, `immune_disable` and `no_retaliation` all
 * named relics that do not exist, so they answered false for ever while their
 * comments described behaviour the game never had. One of them even claimed to
 * be the Anti-magic Mask, which is `immune_freeze_chain` and is checked on the
 * next line. Typing the parameter turns that whole class of mistake into a
 * compile error.
 */
export function hasRelic(minion: MinionInstance | null | undefined, relicId: RelicId): boolean {
  return Boolean(minion && attachedRelics(minion).some((relic) => relic.relicId === relicId));
}

/**
 * Minions have two independent Relic straps. `relic` remains the
 * first slot for save and test compatibility; `relic2` is the new second slot.
 */
export function attachedRelics(minion: MinionInstance): RelicInstance[] {
  return [minion.relic, minion.relic2 ?? null].filter((relic): relic is RelicInstance => relic !== null);
}

export function relicAt(minion: MinionInstance, index: number): RelicInstance | null {
  return index === 0 ? minion.relic : minion.relic2 ?? null;
}

function setRelicAt(minion: MinionInstance, index: number, relic: RelicInstance | null): void {
  if (index === 0) minion.relic = relic;
  else minion.relic2 = relic;
}

export function firstRelicIndex(minion: MinionInstance, predicate: (relic: RelicInstance) => boolean = () => true): number {
  for (const index of [0, 1]) {
    const relic = relicAt(minion, index);
    if (relic && predicate(relic)) return index;
  }
  return -1;
}

export function hasAnyRelic(minion: MinionInstance | null | undefined): boolean {
  return Boolean(minion && (minion.relic || minion.relic2));
}

/** Whether a minion still has room for another Relic. */
export function hasFreeRelicSlot(minion: MinionInstance): boolean {
  return minion.relic === null || minion.relic2 === null || minion.relic2 === undefined;
}

export function discardAttachedRelics(state: GameState, minion: MinionInstance): void {
  for (const relic of attachedRelics(minion)) state.discard.push(relic.id);
  minion.relic = null;
  minion.relic2 = null;
}
