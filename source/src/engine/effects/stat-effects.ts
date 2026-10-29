/**
 * Effects that buff, heal, shield or change a minion's numbers.
 */
import type { MinionInstance, PlayerId } from "../types";
import type { EffectContext } from "./context";
import { buffAllAllies, buffMinion, hasKeyword, setMinionHealth } from "../rules/stats";
import { coinFlip, rollDie } from "../rules/random";
import { destroyInstance } from "../rules/death";
import { effectEvent, friendlyOthers } from "../rules/core";
import { grantRandomRelic } from "../rules/relics";
import { layAura, receivesCampBuff, resolveChainGrowth } from "../rules/auras";
import { requestChoice } from "../rules/targeting";
import { runEffect } from "./run-effect";
import { summonRandomCostFromDeck } from "../rules/summons";

export function effectFloweySaveLoad(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  source.savedCoreHealth = player.health;
  events.push(effectEvent(`${label} saves the core at ${player.health} HP.`, source));
  return false;
}

export function effectAladdinWish(ctx: EffectContext): boolean | void {
  const { state, source, library, events, player, label, pickedValue } = ctx;
  // The wish itself is logged, not just its consequence. Watching the
  // opponent's lamp resolve used to show only the outcome, so a summon out of
  // the deck and a wish for a summon were the same two lines with nothing
  // saying a wish had been made at all.
  const wish =
    pickedValue === "hero_shield"
      ? "a shield for the core"
      : pickedValue === "summon_3"
        ? "a 3-mana ally"
        : "an Relic";
  events.push(effectEvent(`${label} wishes for ${wish}.`, source));
  if (pickedValue === "hero_shield") {
    player.heroDivineShield = true;
    events.push(effectEvent(`${label} gives ${player.name}'s core Divine Shield.`, source));
  } else if (pickedValue === "summon_3") {
    summonRandomCostFromDeck(state, source.owner, 3, library, events);
  } else if (pickedValue === "random_relic") {
    grantRandomRelic(state, source.owner, source, library, events);
  }
  return false;
}

// Rimuru combines a one-shot sacrifice with a persistent growth effect.
// It asks only when a legal victim exists; the ongoing half still attaches
// when Tempest enters an otherwise empty board.
export function effectRimuruTempest(ctx: EffectContext): boolean | void {
  const { state, source, sourceSlot, library, events, chosen, label } = ctx;
  if (!chosen) {
    const next = requestChoice(state, source, { side: "any", prompt: "Destroy a minion and gain its stats" }, library);
    if (next === "asked") return true;
    if (next) return runEffect(state, source, sourceSlot, library, events, next);
  }
  const target = chosen?.kind === "board" ? state.players[chosen.target.owner].board[chosen.target.slot] : null;
  if (target) {
    const gainedAtk = target.atk;
    const gainedHp = target.hp;
    destroyInstance(state, target.owner, target.instanceId, events, `${source.name} destroys ${target.name}`);
    buffMinion(source, gainedAtk, gainedHp);
    events.push(effectEvent(`${label} gains ${gainedAtk}/${gainedHp} from ${target.name}.`, source));
  }
  if (!source.gainedEffects.some((effect) => effect.effectId === "rimuru_tempest_growth")) {
    source.gainedEffects.push({ effectId: "rimuru_tempest_growth", timing: "ongoing", text: "Ongoing: Gain +1/+1" });
  }
  source.effectId = "none";
  source.effectTiming = "ongoing";
}

export function effectNeutralDoubleAtkHp1(ctx: EffectContext): boolean | void {
  const { source, events, label, picked } = ctx;
  if (picked) {
    picked.atk *= 2;
    setMinionHealth(picked,1,1);
    events.push(effectEvent(`${label} doubles ${picked.name}'s ATK and leaves it at 1 HP.`, source));
  }
}

export function effectGainDivineShield(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  source.divineShield = true;
  events.push(effectEvent(`${label} gains Divine Shield.`, source));
}

export function effectAntiGoodGrow(ctx: EffectContext): boolean | void {
  const { source, events, enemy, label } = ctx;
  const count = enemy.board.filter((minion) => minion?.alignment === "Good").length;
  if (count > 0) {
    // +2/+2 per Good enemy, down from +3/+2 (pass 4): 60.3% vs a 45.4%
    // bracket. This is a COMPOUNDING engine, not a recalculated aura — every
    // turn's growth is added permanently and survives the Good minions dying.
    // Good is ~35% of the roster, so a full enemy board averaged +5/+3 a turn,
    // for ever, on a card whose body is far below its tier.
    buffMinion(source, count * 2, count * 2);
    events.push(effectEvent(`${label} grows against Good enemies.`, source));
  }
}

export function effectRimuruTempestGrowth(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  buffMinion(source, 1, 1);
  events.push(effectEvent(`${label} grows +1/+1.`, source));
}

export function effectSelfBuff2(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  buffMinion(source, 2, 2);
  events.push(effectEvent(`${label} grows +2/+2.`, source));
}

export function effectYodaLowestAtkBuff(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  const target = player.board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .sort((left, right) => left.atk - right.atk || left.playOrder - right.playOrder)[0];
  if (target) {
    buffMinion(target, 2, 2);
    events.push(effectEvent(`${label} empowers ${target.name}, the lowest-ATK ally.`, source));
  }
}

export function effectSelfAtk3(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  source.atk += 3;
  events.push(effectEvent(`${label} gains +3 ATK.`, source));
}

export function effectHeal5(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  source.hp = Math.min(source.maxHp, source.hp + 5);
  events.push(effectEvent(`${label} heals 5 HP.`, source));
}

export function effectHealSelfFull(ctx: EffectContext): boolean | void {
  const { source, events, label } = ctx;
  source.hp = source.maxHp;
  events.push(effectEvent(`${label} fully heals itself.`, source));
}

export function effectBuffEvilAlly2(ctx: EffectContext): boolean | void {
  const { source, events, label, picked } = ctx;
  if (picked) {
    buffMinion(picked, 2, 2);
    events.push(effectEvent(`${label} empowers ${picked.name}.`, source));
  }
}

export function effectBuffAllGood2(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  buffAllAllies(player, source, (minion) => minion.alignment === "Good", 2, 2, true);
  events.push(effectEvent(`${label} empowers all Good allies.`, source));
}

export function effectBuffAllMagic21(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  buffAllAllies(player, source, (minion) => receivesCampBuff(minion, "Magic"), 2, 1, false);
  events.push(effectEvent(`${label} empowers Magic allies.`, source));
}

export function effectBuffAllTech21(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  buffAllAllies(player, source, (minion) => receivesCampBuff(minion, "Tech"), 2, 1, false);
  events.push(effectEvent(`${label} empowers Tech allies.`, source));
}

export function effectShieldAllFriendly(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  for (const minion of player.board) if (minion?.alignment === "Good") minion.divineShield = true;
  events.push(effectEvent(`${label} shields the Good.`, source));
}

export function effectDoubleOtherFriendlyAttack(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  const allies = friendlyOthers(player, source);
  for (const ally of allies) ally.atk *= 2;
  events.push(effectEvent(`${label} doubles the ATK of ${allies.length} other friendly minion${allies.length === 1 ? "" : "s"}.`, source));
}

export function effectDiceBuff(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  // Halved (2026 balance pass). A full d6 every turn averaged +3.5/+3.5 and
  // made Kite the single strongest card in the roster at 78% — the die is kept,
  // because the roll is the card, but it now pays out 1-3 instead of 1-6.
  const roll = Math.ceil(rollDie(state) / 2);
  buffMinion(source, roll, roll);
  events.push(effectEvent(`${label} rolls ${roll} for +${roll}/+${roll}.`, source));
}

export function effectDoofCoinflip(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  if (coinFlip(state)) {
    destroyInstance(state, source.owner, source.instanceId, events, `${label} loses the coin flip`);
  } else {
    source.atk *= 2;
    source.hp *= 2;
    source.maxHp *= 2;
    events.push(effectEvent(`${label} wins the coin flip and doubles its stats.`, source));
  }
}

export function effectAllyAtk1(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  if (friendlyOthers(player, source).length > 0) {
    source.atk += 1;
    events.push(effectEvent(`${label} fights better together.`, source));
  }
}

export function effectTauntAura(ctx: EffectContext): boolean | void {
  const { source, events, player, label } = ctx;
  for (const minion of friendlyOthers(player, source)) if (!hasKeyword(minion, "Taunt")) minion.keywords.push("Taunt");
  events.push(effectEvent(`${label} rallies allies to the front.`, source));
}

export function effectBuddhaPurify(ctx: EffectContext): boolean | void {
  const { state, source, events, label } = ctx;
  for (const owner of [0, 1] as PlayerId[]) {
    for (const minion of state.players[owner].board) {
      if (!minion) continue;
      minion.alignment = "Good";
      minion.chained = 0;
      resolveChainGrowth(minion, events);
      minion.frozen = false;
      minion.thawPending = false;
      minion.silenced = false;
      minion.markedBy = null;
      minion.markedForDeathAtTurn = null;
    }
  }
  events.push(effectEvent(`${label} purifies the board: all minions are Good and lose their negative statuses.`, source));
}

export function effectSetStatsChoice(ctx: EffectContext): boolean | void {
  const { state, source, events, pickedSlot } = ctx;
  if (pickedSlot) layAura(state, pickedSlot, "slot_stats_one", source, events);
}
