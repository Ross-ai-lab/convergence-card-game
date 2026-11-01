/**
 * Effects that disable, banish, steal or move minions.
 */
import type { SlotAuraId } from "../types";
import type { EffectContext } from "./context";
import {
  applyChain,
  applyFreeze,
  applySilence,
  canDisable,
  isSlotProtected,
  setMinionAttack,
} from "../rules/stats";
import { dealCoreDamage } from "../rules/damage";
import { destroyRandomMinion } from "../rules/death";
import { discardAttachedRelics } from "../rules/relics";
import { effectEvent, opponent, slotOf } from "../rules/core";
import { isUntargetable, requestChoice } from "../rules/targeting";
import { layAura, resolveChainGrowth } from "../rules/auras";
import { maxAttacks } from "../rules/combat";
import { putCardInHand } from "../rules/cards";
import { returnAllMinionsToHand, seizeMinion, seizeMinionTemporarily } from "../rules/minions";
import { runEffect } from "./run-effect";

export function effectChainAllMinions(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  for (const side of state.players) {
    for (const minion of side.board) {
      if (
        minion &&
        minion.instanceId !== source.instanceId &&
        !isSlotProtected(state, minion) &&
        canDisable(state, source.owner, minion, "chain")
      ) {
        applyChain(state, minion, events);
      }
    }
  }
  events.push(effectEvent(`${label} chains all other minions.`, source));
  return false;
}

export function effectFreeChainedShield(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  let freed = 0;
  for (const minion of player.board) {
    if (!minion || minion.chained <= 0) continue;
    minion.chained = 0;
    resolveChainGrowth(minion, events);
    minion.sleeping = false;
    minion.attacksUsed = 0;
    minion.divineShield = true;
    freed += 1;
  }
  events.push(effectEvent(`${label} frees ${freed} Chained friendly minion${freed === 1 ? "" : "s"}.`, source));
  return false;
}

export function effectStasisEnemy(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked, pickedSlot } = ctx;
  if (picked && pickedSlot && !isUntargetable(state, picked)) {
    state.players[picked.owner].board[pickedSlot.slot] = null;
    (state.stasis ??= []).push({
      minion: picked,
      owner: picked.owner,
      slot: pickedSlot.slot,
      // turnNumber advances once per player's turn, so two FULL turns is four
      // steps, not two — the same arithmetic the pocket room spells out below.
      // At +2 the victim missed a single turn while the card printed 2 turns.
      returnAtTurn: state.turnNumber + 4,
      sourceName: source.name,
    });
    events.push({
      kind: "effect",
      text: `${label} puts ${picked.name} into stasis for two turns.`,
      player: source.owner,
      instanceId: picked.instanceId,
      motion: "stasis",
    });
  } else if (picked) {
    events.push(effectEvent(`${picked.name} resists stasis.`, picked));
  }
  return false;
}

export function effectDarkDimensionBanish(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked, pickedSlot } = ctx;
  if (picked && pickedSlot) {
    state.players[picked.owner].board[pickedSlot.slot] = null;
    (state.darkDimension ??= []).push({
      minion: picked,
      owner: picked.owner,
      slot: pickedSlot.slot,
      sourceInstanceId: source.instanceId,
      sourceName: source.name,
    });
    events.push({
      kind: "effect",
      text: `${label} banishes ${picked.name} to the Dark Dimension until ${source.name} dies.`,
      player: source.owner,
      instanceId: picked.instanceId,
      motion: "stasis",
    });
  }
  return false;
}

export function effectStrangeBargain(ctx: EffectContext): boolean | void {
  const { state, source, events, label, pickedValue } = ctx;
  const opponentPlayer = state.players[opponent(source.owner)];
  if (pickedValue === "core_hp") {
    // Through `dealCoreDamage`, like every other core hit in the game. It used
    // to subtract from `health` directly, which was the one path in the engine
    // that walked past Aladdin's core Divine Shield — a shield the player had
    // paid a card for and could watch fail to do anything.
    if (dealCoreDamage(state, opponentPlayer.id, 10, events, source)) {
      events.push(effectEvent(`${label} costs ${opponentPlayer.name} 10 Core HP.`, source));
    }
  } else if (pickedValue === "random_minion") {
    destroyRandomMinion(state, opponentPlayer.id, events, `${source.name}'s bargain claims a random minion`);
  } else if (pickedValue === "mana") {
    opponentPlayer.manaPenaltyNextTurn = Math.max(opponentPlayer.manaPenaltyNextTurn ?? 0, 5);
    events.push(effectEvent(`${label} removes 5 mana from ${opponentPlayer.name}'s next turn.`, source));
  }
}

export function effectDeathStarMark(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked, pickedCoreOwner } = ctx;
  // It swings like anything else. The Battlecry used to spend its attack, so a
  // Death Star handed Charge was silently held back — a rule the card stopped
  // printing, and one nothing else in the roster has.
  if (pickedCoreOwner !== null) {
    source.deathStarTarget = { kind: "core", owner: pickedCoreOwner, resolveAtTurn: state.turnNumber + 2 };
    events.push(effectEvent(`${label} marks the enemy core.`, source));
  } else if (picked) {
    source.deathStarTarget = {
      kind: "minion",
      owner: picked.owner,
      instanceId: picked.instanceId,
      resolveAtTurn: state.turnNumber + 2,
    };
    events.push(effectEvent(`${label} marks ${picked.name}.`, source));
  }
}

export function effectKnovPocketRoom(ctx: EffectContext): boolean | void {
  const { state, source, sourceSlot, library, events, chosen, label, pickedSlot } = ctx;
  const firstChoice = chosen?.priorOptions?.[0] ?? pickedSlot;
  if ((chosen?.step ?? 0) === 0) {
    if (!firstChoice) return false;
    const next = requestChoice(
      state,
      source,
      { side: "enemy", prompt: "Choose an enemy minion for the pocket room" },
      library,
      1,
      [firstChoice],
    );
    if (next === "asked") return true;
    if (next) return runEffect(state, source, sourceSlot, library, events, next);
    return false;
  }
  const enemyChoice = pickedSlot;
  if (firstChoice && enemyChoice) {
    const friendly = state.players[firstChoice.owner].board[firstChoice.slot];
    const enemyMinion = state.players[enemyChoice.owner].board[enemyChoice.slot];
    // The two picks must be DIFFERENT minions. Under random play they can both
    // resolve to the same one, and the release below then puts a single
    // instance into two slots — the `instance <id> is on the board twice`
    // breach the balance gate reported on 18 August 2026. Replay it with
    // `npx tsx scripts/find-duplicate-instance.mts sim-fuzz-46 random,bot`.
    // The printed rule is "a friendly and an enemy", so one minion is never a
    // legal room. Refusing costs the controller the Battlecry and leaves the
    // board untouched, which is far better than a corrupt duel.
    const sameMinion = Boolean(friendly && enemyMinion && friendly.instanceId === enemyMinion.instanceId);
    if (sameMinion) {
      events.push(effectEvent(`${label} cannot open a pocket room around a single minion.`, source));
    }
    if (friendly && enemyMinion && !sameMinion) {
      state.players[friendly.owner].board[firstChoice.slot] = null;
      state.players[enemyMinion.owner].board[enemyChoice.slot] = null;
      (state.pocketRooms ??= []).push({
        owner: source.owner,
        friendly,
        friendlySlot: firstChoice.slot,
        enemy: enemyMinion,
        enemySlot: enemyChoice.slot,
        // turnNumber advances once at the start of each player's turn. Two
        // full turns therefore span four counter increments, not two.
        returnAtTurn: state.turnNumber + 4,
      });
      events.push(effectEvent(`${label} opens a pocket room for ${friendly.name} and ${enemyMinion.name}.`, source));
    }
  }
}

export function effectMeleoronProtectAlly(ctx: EffectContext): boolean | void {
  const { source, events, label, picked } = ctx;
  if (picked) {
    picked.protectedByMeleoron = source.instanceId;
    events.push(effectEvent(`${label} hides ${picked.name} from every target.`, source));
  }
}

export function effectRandomAttacksNextTurn(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  for (const side of state.players) {
    side.randomAttacksFromTurn = state.turnNumber + 1;
    side.randomAttacksUntilTurn = state.turnNumber + 1;
  }
  events.push(effectEvent(`${label} fills the next turn with random attacks.`, source));
}

export function effectRickReturnAll(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  returnAllMinionsToHand(state, events, source.instanceId, source.owner);
  events.push(effectEvent(`${label} sends every other minion back to its owner's hand.`, source));
}

export function effectProtectSlot(ctx: EffectContext): boolean | void {
  const { state, source, events, pickedSlot } = ctx;
  if (pickedSlot) layAura(state, pickedSlot, "slot_protected", source, events);
}

export function effectFreezeAndWeaken(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked } = ctx;
  const target = picked;
  if (target) {
    applyFreeze(state, source, target, events);
    setMinionAttack(target,Math.ceil(target.atk/2));
    events.push(effectEvent(`${label} halves ${target.name}'s ATK.`, source));
  }
}

export function effectFreezeAndSilenceEnemy(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked } = ctx;
  if (picked && !isSlotProtected(state, picked)) {
    const canFreeze = canDisable(state, source.owner, picked, "freeze");
    const canSilence = canDisable(state, source.owner, picked, "silence");
    if (canFreeze) {
      picked.frozen = true;
      picked.attacksUsed = maxAttacks(picked);
    }
    if (canSilence) applySilence(picked);
    if (canFreeze || canSilence) {
      const statuses = [canFreeze ? "freezes" : "", canSilence ? "silences" : ""].filter(Boolean).join(" and ");
      events.push(effectEvent(`${label} ${statuses} ${picked.name}.`, source));
    } else {
      events.push(effectEvent(`${picked.name} resists Kiritsugu's effect.`, picked));
    }
  } else if (picked) {
    events.push(effectEvent(`${picked.name} resists Kiritsugu's effect.`, picked));
  }
}

export function effectFreezeAllEnemies(ctx: EffectContext): boolean | void {
  const { state, source, events, enemy } = ctx;
  for (const minion of enemy.board) {
    if (minion) applyFreeze(state, source, minion, events);
  }
}

export function effectSilenceEnemy(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  if (picked && !isSlotProtected(state, picked) && canDisable(state, source.owner, picked, "silence")) {
    applySilence(picked);
    events.push(effectEvent(`${source.name} silences ${picked.name}.`, source));
  }
}

export function effectBounceFriendly(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label, picked } = ctx;
  const target = picked;
  const slot = slotOf(state, target);
  if (target && slot >= 0) {
    player.board[slot] = null;
    discardAttachedRelics(state, target);
    putCardInHand(state, player.id, target.cardId, events, target.instanceId);
    events.push(effectEvent(`${label} returns ${target.name} to hand.`, source));
  }
}

export function effectMindControl2(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  if (picked) seizeMinion(state, source, picked, events);
}

export function effectMotokoKusanagi(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  if (picked) seizeMinionTemporarily(state, source, picked, events);
}

export function effectBounceFriendlyDiscount(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label, picked } = ctx;
  const slot = slotOf(state, picked);
  if (picked && slot >= 0) {
    const cardId = picked.cardId;
    player.board[slot] = null;
    discardAttachedRelics(state, picked);
    putCardInHand(state, source.owner, cardId, events, picked.instanceId);
    player.costReductions[cardId] = (player.costReductions[cardId] ?? 0) + 5;
    events.push(effectEvent(`${label} sends ${picked.name} home; it returns 5 cheaper.`, source));
  }
}

export function effectSlotRandomAttacks(ctx: EffectContext): boolean | void {
  const { state, source, events, pickedSlot } = ctx;
  const auraId: SlotAuraId =
    source.effectId === "slot_random_attacks"
      ? "random_attacks"
      : source.effectId === "slot_permanent_chain"
        ? "slot_chain"
        : "slot_grow_1";
  if (pickedSlot) layAura(state, pickedSlot, auraId, source, events);
}
