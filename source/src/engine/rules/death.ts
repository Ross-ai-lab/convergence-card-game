/**
 * Death and its consequences: rescues, Deathrattles, Reborn, death reactions and the
 * end of the duel.
 */
import { traceEffect } from "../trace";
import { tokenCard } from "../tokens";
import type { EffectId, GameEvent, GameState, MinionInstance, PlayerId, RelicInstance } from "../types";
import { STARTING_CORE, boardSize, effectEvent, findEmptySlot, opponent, slotOf } from "./core";
import { applyChain, applySilence, buffMinion, canDisable, hasEffect } from "./stats";
import {
  attachedRelics,
  discardAttachedRelics,
  firstRelicIndex,
  hasRelic,
  relicAt,
  unequipRelic,
} from "./relics";
import { createMinion } from "./play";
import { damageAllEnemies, dealCoreDamage, dealMinionDamage } from "./damage";
import { enemyTargetable, isUntargetable } from "./targeting";
import { hasSlotAura, layAura } from "./auras";
import { putCardInHand } from "./cards";
import { releaseDarkDimensionForSource } from "./turns";
import { rollInt } from "./random";
import { summonLarva, summonShenron } from "./summons";

export function destroyPicked(
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

export function randomEnemyMinion(state: GameState, source: MinionInstance): MinionInstance | null {
  const candidates = state.players[opponent(source.owner)].board.filter(
    (minion): minion is MinionInstance => {
      if (!minion) return false;
      return enemyTargetable(state, minion);
    },
  );
  return candidates.length > 0 ? candidates[rollInt(state, candidates.length)] : null;
}

export function destroyRandomMinion(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
  prefix: string,
  /** An instance the roll must never land on, for a card that excludes itself. */
  exceptInstanceId?: string,
): void {
  const occupied = state.players[playerId].board
    .map((minion, slotIndex) => ({ minion, slotIndex }))
    .filter(({ minion }) => minion && !isUntargetable(state, minion) && minion.instanceId !== exceptInstanceId);
  if (occupied.length === 0) return;
  const target = occupied[rollInt(state, occupied.length)];
  if (target?.minion) destroyAtSlot(state, playerId, target.slotIndex, events, `${prefix}: ${target.minion.name}`);
}

export function destroyInstance(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  events: GameEvent[],
  message: string,
): void {
  const slotIndex = state.players[playerId].board.findIndex((minion) => minion?.instanceId === instanceId);
  if (slotIndex >= 0) destroyAtSlot(state, playerId, slotIndex, events, message);
}

export function destroyAtSlot(
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
      applyChain(state, minion, events);
      events.push(effectEvent(`${minion.name} survives at 1 HP and is Chained by the Symbiote.`, minion));
      return;
    }
  }
  const rescued = allowReplacement && hasRelic(minion, "return_on_death"); // The Green Mask
  state.players[playerId].board[slotIndex] = null;
  releaseDarkDimensionForSource(state, minion.instanceId, events);
  if (rescued) {
    events.push({ kind: "death", text: `${message} — The Green Mask sends it home.`, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
    putCardInHand(state, playerId, minion.cardId, events, minion.instanceId);
  } else {
    state.discard.push(minion.cardId);
    const fallen = state.players[playerId];
    if (state.playerDecks) {
      (fallen.deadMinionOwners ??= (fallen.deadMinions ?? []).map(() => playerId)).push(minion.originalOwner ?? playerId);
    }
    (fallen.deadMinions ??= []).push(minion.cardId);
    events.push({ kind: "death", text: `${message}.`, player: playerId, instanceId: minion.instanceId, cardId: minion.cardId });
  }
  // Relics die with their bearer. They are cards again only in the discard pile;
  // nothing puts them into a satchel or onto another minion automatically.
  const deathRelics = attachedRelics(minion);
  discardAttachedRelics(state, minion);
  resolveDeathrattle(state, minion, killer, slotIndex, events, deathRelics);
  releaseStolenPassive(state, minion, events);
  reactToDeath(state, minion, playerId, events);
}

function rescueWithOogway(state: GameState, playerId: PlayerId, slotIndex: number, events: GameEvent[]): boolean {
  const target = state.players[playerId].board[slotIndex];
  if (!target) return false;
  const oogway = state.players[playerId].board.find(
    (minion) =>
      minion &&
      minion.instanceId !== target.instanceId &&
      hasEffect(minion, "oogway_rescue") &&
      !minion.silenced,
  );
  if (!oogway) return false;
  state.players[playerId].board[slotIndex] = null;
  discardAttachedRelics(state, target);
  events.push({ kind: "death", text: `${target.name} would die, but Grand Master Oogway returns it to hand.`, player: playerId, instanceId: target.instanceId, cardId: target.cardId });
  putCardInHand(state, playerId, target.cardId, events, target.instanceId);
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
  for (const relic of deadRelics) {
    if (relic.relicId === "dragon_balls") {
      summonShenron(state, dead, deadSlot, events);
    }
  }

  const triggerCount = deadRelics.some((relic) => relic.relicId === "necronomicon") ? 2 : 1;
  for (let trigger = 0; trigger < triggerCount; trigger += 1) {
    resolveCardDeathrattleOnce(state, dead, killer, deadSlot, events);
  }

  // Reborn is NOT a Deathrattle and so it sits outside that loop: the
  // Necronomicon doubles a Deathrattle, and doubling a rebirth would put two
  // copies of one minion on the board.
  resolveReborn(state, dead, killer, deadSlot, events);
}

/**
 * What a Reborn card comes back AS.
 *
 * Reborn spends itself. A minion returns carrying one life fewer, which means
 * the returning body prints different text from the one that died — and after
 * the last life the text is gone altogether, because a card that promises a
 * rebirth it can no longer pay is lying to whoever reads it.
 *
 * `null` is that last body: printed stats, no keyword, no effect, no text. The
 * table is the whole rule, so a card with more lives is one more row.
 */
const REBORN_STAGE: Partial<Record<EffectId, { effectId: EffectId; effect: string } | null>> = {
  // Mr. Poopybutthole. One life, then an ordinary minion.
  "reborn_once": null,
  // Aizen. Two lives; the count drops out of the text as he spends them, and the
  // curse on his killer goes with the last one.
  "aizen_reborn_twice": { effectId: "aizen_reborn_once", effect: "Reborn. Silence and chain your killer" },
  "aizen_reborn_once": null,
  // Ouken. Endless, so he comes back as exactly himself, for ever.
  "ouken_reborn": { effectId: "ouken_reborn", effect: "Reborn infinitely. Become Chained after each Reborn" },
};

/**
 * Brings a Reborn minion back.
 *
 * Silence stops it, like every other keyword: the rebirth is printed on the card
 * and Silence takes the card's text away. A full board stops the body but not
 * Aizen's curse, which is a separate promise on the same line.
 */
function resolveReborn(
  state: GameState,
  dead: MinionInstance,
  killer: MinionInstance | null,
  deadSlot: number,
  events: GameEvent[],
): void {
  if (dead.silenced || dead.effectTiming !== "reborn") return;
  traceEffect(dead.effectId);

  if (dead.effectId === "aizen_reborn_twice" || dead.effectId === "aizen_reborn_once") {
    curseTheKiller(state, dead, killer, events);
  }

  const board = state.players[dead.owner].board;
  const slot = findEmptySlot(state, dead.owner, deadSlot);
  if (slot < 0) return;

  const next = REBORN_STAGE[dead.effectId] ?? null;
  const reborn = createRebornBody(state, dead, next);
  board[slot] = reborn;
  // Ouken pays for his endlessness every single time.
  if (reborn.effectId === "ouken_reborn") applyChain(state, reborn, events);
  events.push(effectEvent(`${dead.name} is Reborn.`, dead));
}

/** Aizen's half of the bargain: whoever put him down goes down with him. */
function curseTheKiller(
  state: GameState,
  dead: MinionInstance,
  killer: MinionInstance | null,
  events: GameEvent[],
): void {
  const killerAlive = Boolean(
    killer && state.players[killer.owner].board.some((minion) => minion?.instanceId === killer.instanceId),
  );
  if (!killer || !killerAlive) return;
  const canSilence = canDisable(state, dead.owner, killer, "silence");
  const canChain = canDisable(state, dead.owner, killer, "chain");
  if (canSilence) applySilence(killer);
  if (canChain) applyChain(state, killer, events);
  const statuses = [canSilence ? "silences" : "", canChain ? "chains" : ""].filter(Boolean).join(" and ");
  if (statuses) events.push(effectEvent(`${dead.name} ${statuses} its killer, ${killer.name}.`, dead));
  else events.push(effectEvent(`${killer.name} resists ${dead.name}'s curses.`, killer));
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
  if (dead.effectId === "kagaya_bind_slots") {
    // Kagaya's own side is never random: it is exactly the empty position he
    // left behind. The opposing side chooses from the remaining empty slots.
    if (!hasSlotAura(state, dead.owner, deadSlot, "slot_bound")) {
      layAura(state, { owner: dead.owner, slot: deadSlot }, "slot_bound", dead, events);
    }
    const enemyOwner = opponent(dead.owner);
    const enemySlots = state.players[enemyOwner].board
      .map((minion, slot) => ({ minion, slot }))
      .filter(({ minion, slot }) => !minion && !hasSlotAura(state, enemyOwner, slot, "slot_bound"));
    if (enemySlots.length > 0) {
      const target = enemySlots[rollInt(state, enemySlots.length)];
      if (target) layAura(state, { owner: enemyOwner, slot: target.slot }, "slot_bound", dead, events);
    }
    events.push(effectEvent(`${dead.name}'s Deathrattle binds one empty slot on each side permanently.`, dead));
  } else if (dead.effectId === "deathrattle_damage_both_cores_20") {
    for (const owner of [0, 1] as PlayerId[]) dealCoreDamage(state, owner, 20, events, dead);
    events.push(effectEvent(`${dead.name}'s Deathrattle deals 20 damage to both cores.`, dead));
  } else if (dead.effectId === "deathrattle_damage_random_enemy") {
    const target = randomEnemyMinion(state, dead);
    const slot = target ? slotOf(state, target) : -1;
    if (target && slot >= 0) {
      dealMinionDamage(state, target.owner, slot, 1, dead, events, true);
      events.push(effectEvent(`${dead.name}'s Deathrattle clips ${target.name} for 1.`, dead));
    }
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
    const slot = findEmptySlot(state, dead.owner, deadSlot);
    if (slot >= 0) {
      const vision = tokenCard("token:vision");
      const summoned = createMinion(vision, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Vision.`, dead));
    }
  } else if (dead.effectId === "deathrattle_summon_galactus") {
    const slot = findEmptySlot(state, dead.owner, deadSlot);
    if (slot >= 0) {
      const galactus = tokenCard("token:galactus");
      const summoned = createMinion(galactus, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Galactus.`, dead));
    }
  } else if (dead.effectId === "avatar_aang_awakened") {
    const slot = findEmptySlot(state, dead.owner, deadSlot);
    if (slot >= 0) {
      const awakened = tokenCard("token:awakened", { origin: dead.origin });
      const summoned = createMinion(awakened, dead.owner, state);
      state.players[dead.owner].board[slot] = summoned;
      events.push(effectEvent(`${dead.name}'s Deathrattle summons Awakened.`, dead));
    }
  } else if (dead.effectId === "flowey_save_load") {
    if (dead.savedCoreHealth !== null && dead.savedCoreHealth !== undefined) {
      state.players[dead.owner].health = Math.min(STARTING_CORE, dead.savedCoreHealth);
      events.push(effectEvent(`${dead.name}'s Deathrattle restores the core to ${dead.savedCoreHealth} HP.`, dead));
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
    if (dealCoreDamage(state, dead.owner, 4, events, dead)) {
      events.push(effectEvent(`${dead.name} deals 4 damage to its own Core.`, dead));
    }
  }
}

/**
 * The body a Reborn minion comes back in.
 *
 * Reborn returns the CARD, not what had been done to it: printed stats, one HP,
 * and nothing else it was carrying — no buffs, no relic, no borrowed effect, no
 * shield. `stage` is the only thing that survives, and it is what the card will
 * PRINT from here on, so the reader can always count the lives that are left.
 * `null` is the last body of all: an ordinary minion with no text at all.
 */
function createRebornBody(
  state: GameState,
  dead: MinionInstance,
  stage: { effectId: EffectId; effect: string } | null,
): MinionInstance {
  const reborn = createMinion(
    {
      kind: "minion",
      id: dead.cardId,
      name: dead.name,
      cost: dead.cost,
      atk: dead.baseAtk,
      hp: dead.baseHp,
      rarity: dead.rarity,
      camp: dead.camp,
      alignment: dead.alignment,
      keywords: stage ? ["Reborn"] : [],
      effectId: stage ? stage.effectId : "none",
      effectTiming: stage ? "reborn" : "none",
      effect: stage ? stage.effect : "-",
      flavor: "",
      origin: dead.origin,
      art: dead.art,
    },
    dead.owner,
    state,
  );
  reborn.suppressArrivalTheme = true;
  if (dead.originalOwner !== undefined) reborn.originalOwner = dead.originalOwner;
  reborn.hp = 1;
  return reborn;
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

export function checkGameOver(state: GameState, events: GameEvent[]): void {
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

export function sweepDeaths(state: GameState, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = state.players[playerId].board[slot];
      if (minion && minion.hp <= 0) destroyAtSlot(state, playerId, slot, events, `${minion.name} falls`);
    }
  }
}

function reactToDeath(state: GameState, dead: MinionInstance, deadOwner: PlayerId, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (const minion of state.players[playerId].board) {
      if (!minion || minion.silenced || minion.instanceId === dead.instanceId) continue;
      if (minion.chained > 0) continue;
      // `hasEffect`, not a bare `effectId` comparison. These three are Passives,
      // and a Passive in this game can be WORN as well as printed — Meruem copies
      // a killed minion's persistent effects into `gainedEffects`, All for One
      // wears the whole enemy board's. Comparing `effectId` meant a copied John
      // Wick sat there doing nothing, which is the one outcome a copy effect must
      // never produce. `hasEffect` reads both, answers false for a silenced or
      // chained wearer, and records the coverage trace itself.
      if (hasEffect(minion, "xenomorph_queen_brood") && playerId === deadOwner && dead.cardId !== "token:larva") {
        summonLarva(state, minion, dead, events);
      } else if (hasEffect(minion, "nito_any_death_1_1")) {
        // +1/+1, down from +2/+1 (pass 3): 62.3% vs a 48.2% bracket off the
        // smallest body in the game. It counts EVERY death on BOTH boards with
        // no cap, so the opponent's own trades were feeding it.
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} feeds on death (+1/+1).`, minion));
      } else if (hasEffect(minion, "friendly_death_buff_1_1") && playerId === deadOwner) {
        buffMinion(minion, 1, 1);
        events.push(effectEvent(`${minion.name} avenges ${dead.name} (+1/+1).`, minion));
      }
    }
  }
}
