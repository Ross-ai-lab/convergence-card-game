/**
 * Effects that damage or destroy.
 */
import type { MinionInstance, PlayerId } from "../types";
import type { EffectContext } from "./context";
import {
  applyChain,
  buffMinion,
  canDisable,
  hasDumbledoreProtection,
  hasEffect,
  hasKeyword,
  isSlotProtected,
  setMinionAttack,
} from "../rules/stats";
import { boardSize, effectEvent, slotOf } from "../rules/core";
import { consumeEnemyMinion, copyPersistentMinionTraits } from "../rules/minions";
import { damageAllEnemies, damageAllOther, dealCoreDamage, dealMinionDamage } from "../rules/damage";
import { destroyAtSlot, destroyInstance, destroyPicked, randomEnemyMinion } from "../rules/death";
import { isUntargetable } from "../rules/targeting";
import { rollInt } from "../rules/random";

export function effectVaderChainOrDestroy(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked, pickedSlot } = ctx;
  if (picked && pickedSlot) {
    if (hasDumbledoreProtection(state, picked)) {
      events.push(effectEvent(`${picked.name} resists Darth Vader's chain.`, picked));
    } else if (!isSlotProtected(state, picked) && canDisable(state, source.owner, picked, "chain")) {
      setMinionAttack(picked,1);
      applyChain(state, picked, events);
      events.push(effectEvent(`${label} sets ${picked.name}'s ATK to 1 and chains it.`, source));
    } else {
      events.push(effectEvent(`${picked.name} resists Darth Vader's chain.`, picked));
    }
  }
  return false;
}

export function effectWallOfFleshGrind(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  damageAllEnemies(state, source, 1, events);
  events.push(effectEvent(`${label} grinds all enemy minions for 1.`, source));
}

export function effectRagnarosOngoingBurn(ctx: EffectContext): boolean | void {
  const { state, source, events, enemyId, label } = ctx;
  const target = randomEnemyMinion(state, source);
  const targetSlot = target ? slotOf(state, target) : -1;
  if (target && targetSlot >= 0) {
    dealMinionDamage(state, target.owner, targetSlot, 3, source, events, true);
  } else if (dealCoreDamage(state, enemyId, 3, events, source)) {
    events.push(effectEvent(`${label} burns the enemy core for 3 damage.`, source));
  }
}

export function effectDamageEnemy1(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  const targetSlot = slotOf(state, picked);
  if (picked && targetSlot >= 0) dealMinionDamage(state, picked.owner, targetSlot, 1, source, events, true);
}

export function effectAoeDamage3(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  damageAllEnemies(state, source, 3, events);
}

export function effectTimeBombDestroyAll(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  for (const owner of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      if (state.players[owner].board[slot]) {
        destroyAtSlot(state, owner, slot, events, `${source.name} destroys all minions`, null, false);
      }
    }
  }
  events.push(effectEvent(`${label} destroys ALL minions.`, source));
}

export function effectLightYagamiNatureKill(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked } = ctx;
  const slot = picked ? slotOf(state, picked) : -1;
  if (picked && slot >= 0) {
    destroyAtSlot(state, picked.owner, slot, events, `${label} writes down ${picked.name}`, source);
  }
}

export function effectSnapBalance(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  // Thanos never targets himself. The printed body is one of the eligible
  // minions on the board, but the source must survive its own Battlecry.
  const eligible = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board
      .map((minion, slot) => ({ owner, slot, minion }))
      .filter(({ minion }) => minion && minion.instanceId !== source.instanceId && !isUntargetable(state, minion)),
  );
  const destroyCount = Math.floor(eligible.length / 2);
  for (let i = 0; i < destroyCount; i += 1) {
    const remaining = ([0, 1] as PlayerId[]).flatMap((owner) =>
      state.players[owner].board
        .map((minion, slot) => ({ owner, slot, minion }))
        .filter(({ minion }) => minion && minion.instanceId !== source.instanceId && !isUntargetable(state, minion)),
    );
    if (remaining.length === 0) break;
    const target = remaining[rollInt(state, remaining.length)];
    if (target?.minion) {
      destroyAtSlot(state, target.owner, target.slot, events, `${label} reduces the board: ${target.minion.name}`, source);
    }
  }
  events.push(effectEvent(`${label} destroys ${destroyCount} random minion${destroyCount === 1 ? "" : "s"} to reduce the board by half.`, source));
}

export function effectSetHp1(ctx: EffectContext): boolean | void {
  const { source, events, label, picked } = ctx;
  const target = picked;
  if (target) {
    target.hp = 1;
    events.push(effectEvent(`${label} sets ${target.name}'s HP to 1.`, source));
  }
}

export function effectSetAllEnemyHp1(ctx: EffectContext): boolean | void {
  const { source, events, enemy, label } = ctx;
  let affected = 0;
  for (const minion of enemy.board) {
    if (!minion) continue;
    minion.hp = 1;
    affected += 1;
  }
  events.push(effectEvent(`${label} sets ${affected} enemy minion${affected === 1 ? "'s" : "s'"} HP to 1.`, source));
}

export function effectAoeAll1(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  damageAllOther(state, source, 1, events);
}

export function effectAoeAll2(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  damageAllOther(state, source, 2, events);
}

export function effectAoeAll4(ctx: EffectContext): boolean | void {
  const { state, source, events } = ctx;
  damageAllOther(state, source, 4, events);
}

export function effectDestroyEnemyTaunt(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  destroyPicked(state, source, picked, "destroys", events);
}

export function effectGodrickGraft(ctx: EffectContext): boolean | void {
  const { state, source, events, label, picked } = ctx;
  if (picked) {
    const gainedAtk = picked.atk;
    const gainedHp = picked.hp;
    const gainedEffects = copyPersistentMinionTraits(source, picked);
    destroyInstance(state, picked.owner, picked.instanceId, events, `${source.name} kills ${picked.name} for grafting`);
    buffMinion(source, gainedAtk, gainedHp);
    source.effectId = "none";
    source.effectTiming = source.gainedEffects.some((effect) => effect.timing === "ongoing")
      ? "ongoing"
      : source.gainedEffects.some((effect) => effect.timing === "passive")
        ? "passive"
        : "none";
    events.push(
      effectEvent(
        `${label} gains ${gainedAtk}/${gainedHp}${gainedEffects ? " and the minion's effects" : ""}.`,
        source,
      ),
    );
  }
}

export function effectDestroyDamagedEnemy(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  destroyPicked(state, source, picked, "destroys a wounded enemy", events);
}

export function effectDestroyAllDamagedEnemies(ctx: EffectContext): boolean | void {
  const { state, source, events, enemyId, enemy, label } = ctx;
  let destroyed = 0;
  for (let slot = 0; slot < boardSize; slot += 1) {
    const minion = enemy.board[slot];
    // This is a direct destroy, not attack damage. Evade belongs to the
    // combat-damage path and must never make a wounded minion survive this.
    if (!minion || minion.hp >= minion.maxHp || isUntargetable(state, minion)) continue;
    destroyAtSlot(state, enemyId, slot, events, `${source.name} kills ${minion.name}`);
    destroyed += 1;
  }
  if (destroyed > 0) events.push(effectEvent(`${label} kills all damaged enemy minions.`, source));
}

export function effectConsumeTech4Hp(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  if (picked) consumeEnemyMinion(state, source, picked, events);
}

export function effectDevourFriendly(ctx: EffectContext): boolean | void {
  const { state, source, events, picked } = ctx;
  const prey = picked;
  if (prey) {
    buffMinion(source, prey.atk, prey.hp);
    destroyInstance(state, source.owner, prey.instanceId, events, `${source.name} consumes ${prey.name}`);
  }
}

export function effectConsumeAllFriendlyTech(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label } = ctx;
  const victims = player.board.filter(
    (minion): minion is MinionInstance => Boolean(minion && minion.instanceId !== source.instanceId && minion.camp === "Tech"),
  );
  let consumed = 0;
  let gainedEffects = 0;
  for (const victim of victims) {
    const gainedAtk = victim.atk;
    const gainedHp = victim.hp;
    buffMinion(source, gainedAtk, gainedHp);

    if (hasKeyword(victim, "Taunt") && !hasKeyword(source, "Taunt")) source.keywords.push("Taunt");
    if (victim.divineShield || hasKeyword(victim, "Divine Shield")) {
      source.divineShield = true;
      if (!hasKeyword(source, "Divine Shield")) source.keywords.push("Divine Shield");
    }

    const effects = [
      ...(victim.effectId !== "none" && (victim.effectTiming === "passive" || victim.effectTiming === "ongoing" || victim.effectTiming === "onPlayAndOngoing")
        ? [{ effectId: victim.effectId, timing: victim.effectTiming === "onPlayAndOngoing" ? "ongoing" : victim.effectTiming, text: victim.effect }]
        : []),
      ...victim.gainedEffects,
    ];
    for (const effect of effects) {
      if ((effect.timing === "passive" || effect.timing === "ongoing") && effect.effectId !== "none" && !hasEffect(source, effect.effectId)) {
        source.gainedEffects.push({ effectId: effect.effectId, timing: effect.timing, text: effect.text });
        gainedEffects += 1;
      }
    }

    destroyInstance(state, victim.owner, victim.instanceId, events, `${source.name} consumes ${victim.name}`);
    consumed += 1;
  }
  if (source.gainedEffects.some((effect) => effect.timing === "ongoing")) source.effectTiming = "ongoing";
  events.push(
    effectEvent(
      consumed === 0
        ? `${label} finds no friendly Tech minion to consume.`
        : `${label} consumes ${consumed} friendly Tech minion${consumed === 1 ? "" : "s"} and gains their stats${gainedEffects ? " and effects" : ""}.`,
      source,
    ),
  );
  source.effectId = "none";
}

export function effectHashiraGoodVolley(ctx: EffectContext): boolean | void {
  const { state, source, events, player, label } = ctx;
  const damage = player.board.filter(minion => minion?.alignment === "Good").length;
  damageAllEnemies(state, source, damage, events);
  events.push(effectEvent(`${label} unleashes a coordinated strike for ${damage} damage to every enemy minion.`, source));
}
