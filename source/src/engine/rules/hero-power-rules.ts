/**
 * Hero Powers in a duel: whether one can be used, what it costs, and what it does.
 * The definitions themselves live in ../hero-powers.ts.
 */
import { remainingDeckCards } from "../draw-piles";
import { HERO_POWER_COST, heroPowerCost, heroPowerDefinition } from "../hero-powers";
import { traceEffect } from "../trace";
import type {
  GameEvent,
  GameState,
  HeroPowerId,
  MinionInstance,
  PlayerId,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
} from "../types";
import { effectEvent, hasInfiniteMana, opponent, slotOf, type CardLibrary } from "./core";
import {
  applyChain,
  buffMinion,
  canDisable,
  hasEffect,
  isSlotProtected,
  reduceMinionHealth,
  restoreCoreHealth,
  setMinionAttack,
  setMinionHealth,
  supermanCovers,
} from "./stats";
import { damageAllEnemies, dealCoreDamage, invulnerableNow, modifyIncoming } from "./damage";
import { destroyAtSlot } from "./death";
import { drawDirect, putCardInHand, removeCardFromDrawPile } from "./cards";
import { enemyTargetable, isUntargetable } from "./targeting";
import { maxAttacks } from "./combat";
import { relicsInDeck } from "./relics";
import { reviveRandomFriendlyMinion, summonHeroPowerRecruit } from "./summons";
import { rollInt } from "./random";

function heroPowerTargetOptions(state: GameState, playerId: PlayerId, powerId: HeroPowerId): TargetOption[] {
  const definition = heroPowerDefinition(powerId);
  if (!definition || definition.target === "none") return [];
  const owners: PlayerId[] = definition.target === "any"
    ? [playerId, opponent(playerId)]
    : [definition.target === "friendly" ? playerId : opponent(playerId)];
  return owners.flatMap((owner) => state.players[owner].board.flatMap((minion, slot) => {
    if (!minion || isUntargetable(state, minion)) return [];
    if (owner !== playerId && !enemyTargetable(state, minion)) return [];
    if (powerId === "po_skadoosh" && minion.alignment !== "Evil") return [];
    return [{ owner, slot }];
  }));
}

export function heroPowerIsUsable(state: GameState, playerId: PlayerId): boolean {
  const powerId = state.heroPowers[playerId];
  if (!powerId || state.heroPowerUsed[playerId]) return false;
  const definition = heroPowerDefinition(powerId);
  if (!definition) return false;
  if (definition.passive) return false;
  if (!hasInfiniteMana(state, playerId) && state.players[playerId].mana < effectiveHeroPowerCost(state, playerId)) return false;
  return definition.target === "none" || heroPowerTargetOptions(state, playerId, powerId).length > 0;
}

/** Rudeus makes the controller's one Hero Power payment free while active.
 *  The interface shows this cost, never the printed one. */
export function effectiveHeroPowerCost(state: GameState, playerId: PlayerId): number {
  const free = state.players[playerId].board.some(
    (minion) => minion && hasEffect(minion, "rudeus_hero_power_free"),
  );
  const definition = heroPowerDefinition(state.heroPowers[playerId]);
  return free ? 0 : definition ? heroPowerCost(definition) : HERO_POWER_COST;
}

/** Kratos's passive is a live opponent lock: silence, chaining, death, and
 * leaving the board all make the opponent's relic and Hero Power actions legal
 * again because hasEffect handles those temporary statuses centrally. */
export function opponentHasKratosLock(state: GameState, playerId: PlayerId): boolean {
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

/**
 * The enemy minion currently forbidding this player's relics and Hero Power, if
 * any. Exported so the board can name it instead of blaming a full board.
 */
export function relicLockSource(state: GameState, playerId: PlayerId): string | null {
  const blocker = state.players[opponent(playerId)].board.find(
    (minion) => Boolean(minion) && opponentHasKratosLock(state, playerId) && hasEffect(minion!, "kratos_lockdown"),
  );
  return blocker ? blocker.name : null;
}

export function useHeroPower(state: GameState, playerId: PlayerId, library: CardLibrary, events: GameEvent[]): void {
  const powerId = state.heroPowers[playerId];
  const definition = heroPowerDefinition(powerId);
  if (!powerId || !definition || !heroPowerIsUsable(state, playerId)) return;
  const player = state.players[playerId];
  const manaCost = effectiveHeroPowerCost(state, playerId);
  if (!hasInfiniteMana(state, playerId)) player.mana -= manaCost;
  state.heroPowerUsed[playerId] = true;
  events.push({ kind: "effect", text: `${player.name} uses ${definition.name}.`, player: playerId });

  if (definition.target !== "none") {
    const options = heroPowerTargetOptions(state, playerId, powerId);
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
      cancelHeroPower: {
        player: playerId,
        powerId,
        manaRefund: hasInfiniteMana(state, playerId) ? 0 : manaCost,
      },
    };
    state.phase = "targeting";
    return;
  }
  resolveHeroPower(state, playerId, powerId, null, library, events);
}

export function resolveHeroPower(
  state: GameState,
  playerId: PlayerId,
  powerId: HeroPowerId,
  answer: ResolvedChoice | null,
  library: CardLibrary,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  const definition = heroPowerDefinition(powerId);
  if (!definition) return;
  const target = answer?.kind === "board" ? state.players[answer.target.owner].board[answer.target.slot] : null;
  if (powerId === "light_delayed_mark" && target) {
    target.markedBy = `hero-power:${powerId}`;
    target.markedForDeathAtTurn = state.turnNumber + 2;
    events.push({ kind: "effect", text: `${definition.name} marks ${target.name} for death next turn.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "all_for_one_copy" && target) {
    putCardInHand(state, playerId, target.cardId, events);
    events.push({ kind: "effect", text: `${definition.name} copies ${target.name} into ${player.name}'s hand.`, player: playerId, instanceId: target.instanceId, cardId: target.cardId });
  } else if (powerId === "vader_minion_tax") {
    const enemy = state.players[opponent(playerId)];
    enemy.minionCostPenaltyNextTurn += 1;
    events.push({ kind: "effect", text: `${definition.name} taxes enemy minion cards by 1 next turn.`, player: playerId });
  } else if (powerId === "po_skadoosh" && target) {
    dealHeroPowerDamage(state, target, 3, definition.name, events);
  } else if (powerId === "dio_freeze" && target) {
    if (isSlotProtected(state, target) || !canDisable(state, playerId, target, "freeze")) {
      events.push(effectEvent(`${target.name} resists Freeze.`, target));
    } else {
      target.frozen = true;
      target.attacksUsed = maxAttacks(target);
      events.push({ kind: "effect", text: `${definition.name} freezes ${target.name} for 1 turn.`, player: playerId, instanceId: target.instanceId });
    }
  } else if (powerId === "meruem_discover") {
    const available = remainingDeckCards(state, playerId);
    const cardId = available.length > 0 ? available[rollInt(state, available.length)] : undefined;
    if (cardId && removeCardFromDrawPile(state, playerId, cardId)) {
      putCardInHand(state, playerId, cardId, events);
      events.push({ kind: "effect", text: `${definition.name} discovers a card.`, player: playerId, cardId });
    }
  } else if (powerId === "luffy_set_one" && target) {
    setMinionAttack(target,1);
    setMinionHealth(target,1,1);
    events.push({ kind: "effect", text: `${definition.name} reduces ${target.name} to 1/1.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "bill_chaos" && target) {
    // Through the stat-overwrite helpers, so an aura's share is accounted for
    // and a minion that grows taller keeps a maximum it can be healed back to.
    const [atk, hp] = [target.hp, target.atk];
    setMinionAttack(target, atk);
    setMinionHealth(target, Math.max(target.maxHp, hp), hp);
    events.push({ kind: "effect", text: `${definition.name} swaps ${target.name}'s ATK and HP.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_hp" && target) {
    buffMinion(target, 0, 1);
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} +1 HP.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_atk" && target) {
    target.atk += 1;
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} +1 ATK.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_hp_down" && target) {
    reduceMinionHealth(target,1);
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} -1 HP.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "minion_atk_down" && target) {
    setMinionAttack(target,target.atk-1);
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
      applyChain(state, target, events);
      target.chainGrowthPending = true;
      events.push({ kind: "effect", text: `${definition.name} chains ${target.name}.`, player: playerId, instanceId: target.instanceId });
    }
  } else if (powerId === "summon_recruit") {
    summonHeroPowerRecruit(state, playerId, events);
  } else if ((powerId === "give_taunt" || powerId === "eye_taunt") && target) {
    if (!target.keywords.includes("Taunt")) target.keywords.push("Taunt");
    if (!target.gainedEffects.some((effect) => effect.text === "Passive: Taunt.")) {
      target.gainedEffects.push({ effectId: "none", timing: "passive", text: "Passive: Taunt." });
    }
    events.push({ kind: "effect", text: `${definition.name} gives ${target.name} Taunt.`, player: playerId, instanceId: target.instanceId });
  } else if (powerId === "gilgamesh_relic") {
    const available = relicsInDeck(state, playerId, library);
    if (available.length > 0) {
      const relic = available[rollInt(state, available.length)];
      if (relic && removeCardFromDrawPile(state, playerId, relic.id)) {
        putCardInHand(state, playerId, relic.id, events);
        events.push({ kind: "effect", text: `${definition.name} claims ${relic.name} from the treasury.`, player: playerId, cardId: relic.id });
      }
    }
  } else if (powerId === "gojo_core_shield") {
    player.heroDivineShield = true;
    events.push({ kind: "effect", text: `${definition.name} gives ${player.name}'s Core Divine Shield.`, player: playerId });
  } else if (powerId === "thanos_destroy") {
    const candidates = state.players[opponent(playerId)].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && enemyTargetable(state, minion)),
    );
    const target = candidates.length > 0 ? candidates[rollInt(state, candidates.length)] : null;
    if (target) {
      const targetSlot = slotOf(state, target);
      if (targetSlot >= 0) destroyAtSlot(state, target.owner, targetSlot, events, `${definition.name} destroys ${target.name}`, null);
    }
  } else if (powerId === "elden_revival") {
    reviveRandomFriendlyMinion(state, playerId, library, events, definition.name);
  }
}

/**
 * Damage from a Hero Power. There is no attacker, so nothing that reads the
 * source's Camp, ATK or relics applies, but everything the target carries does:
 * Invulnerable, Divine Shield, the Philosopher's Stone, Prince Lloyd's ward,
 * Superman's cap and Godzilla's answer.
 */
function dealHeroPowerDamage(
  state: GameState,
  target: MinionInstance,
  amount: number,
  powerName: string,
  events: GameEvent[],
): void {
  const slot = slotOf(state, target);
  if (slot < 0 || invulnerableNow(state, target, events)) return;
  amount = modifyIncoming(state, null, target, amount);
  if (!target.silenced && supermanCovers(state, target)) amount = Math.min(amount, 3);
  if (amount <= 0) return;
  if (target.divineShield && !target.silenced) {
    target.divineShield = false;
    events.push({ kind: "combat", text: `${target.name}'s Divine Shield breaks.`, player: target.owner, instanceId: target.instanceId });
    return;
  }
  target.hp -= amount;
  events.push({ kind: "damage", text: `${powerName} deals ${amount} damage to ${target.name}.`, player: target.owner, instanceId: target.instanceId });
  if (target.hp > 0 && hasEffect(target, "godzilla_damage_burst") && !target.silenced) {
    damageAllEnemies(state, target, 2, events, new Set([target.instanceId]));
  }
  if (target.hp <= 0) destroyAtSlot(state, target.owner, slot, events, `${target.name} falls to ${powerName}`, null);
}
