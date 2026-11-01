/**
 * Running a minion's printed effect. Each effect is one handler, looked up by its id.
 */
import { traceEffect } from "../trace";
import type {
  EffectId,
  GameEvent,
  GameState,
  HandOption,
  MinionInstance,
  PlayerId,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
} from "../types";
import { opponent, type CardLibrary } from "../rules/core";
import type { EffectContext, EffectHandler, EffectStart } from "./context";
import { TARGETED_EFFECTS, requestChoice } from "../rules/targeting";
import {
  effectAladdinWish,
  effectAllyAtk1,
  effectAntiGoodGrow,
  effectBuddhaPurify,
  effectBuffAllGood2,
  effectBuffAllMagic21,
  effectBuffAllTech21,
  effectBuffEvilAlly2,
  effectDiceBuff,
  effectDoofCoinflip,
  effectDoubleOtherFriendlyAttack,
  effectFloweySaveLoad,
  effectGainDivineShield,
  effectHeal5,
  effectHealSelfFull,
  effectNeutralDoubleAtkHp1,
  effectRimuruTempest,
  effectRimuruTempestGrowth,
  effectSelfAtk3,
  effectSelfBuff2,
  effectSetStatsChoice,
  effectShieldAllFriendly,
  effectTauntAura,
  effectYodaLowestAtkBuff,
} from "./stat-effects";
import {
  effectAoeAll1,
  effectAoeAll2,
  effectAoeAll4,
  effectAoeDamage3,
  effectConsumeAllFriendlyTech,
  effectConsumeTech4Hp,
  effectDamageEnemy1,
  effectDestroyAllDamagedEnemies,
  effectDestroyDamagedEnemy,
  effectDestroyEnemyTaunt,
  effectDevourFriendly,
  effectGodrickGraft,
  effectHashiraGoodVolley,
  effectLightYagamiNatureKill,
  effectRagnarosOngoingBurn,
  effectSetAllEnemyHp1,
  effectSetHp1,
  effectSnapBalance,
  effectTimeBombDestroyAll,
  effectVaderChainOrDestroy,
  effectWallOfFleshGrind,
} from "./damage-effects";
import {
  effectAvatarAangAwakened,
  effectChaosRandomSummon,
  effectDevolveEnemyMinions,
  effectMobAscend,
  effectNarutoShadowClones,
  effectRebirthFriendlyDead,
  effectReplaceSameCostRandom,
  effectStarDestroyerTieFighters,
  effectSummonMargit,
  effectSummonSins,
  effectTransformRandomAlliesUp,
} from "./summon-effects";
import {
  effectBatmanGadgetChoice,
  effectDiscoverRelicSelf,
  effectFrierenRelicDiscover,
  effectMorpheusChoice,
} from "./prompted";
import {
  effectBounceFriendly,
  effectBounceFriendlyDiscount,
  effectChainAllMinions,
  effectDarkDimensionBanish,
  effectDeathStarMark,
  effectFreeChainedShield,
  effectFreezeAllEnemies,
  effectFreezeAndSilenceEnemy,
  effectFreezeAndWeaken,
  effectKnovPocketRoom,
  effectMeleoronProtectAlly,
  effectMindControl2,
  effectMotokoKusanagi,
  effectProtectSlot,
  effectRandomAttacksNextTurn,
  effectRickReturnAll,
  effectSilenceEnemy,
  effectSlotRandomAttacks,
  effectStasisEnemy,
  effectStrangeBargain,
} from "./control-effects";
import {
  effectCopyMinionEffects,
  effectCopyMinionToHand,
  effectCopyPassive,
  effectDestroyRelic,
  effectDiscoverRandomKeywordMinion,
  effectDiscoverTechCard,
  effectDrawCard,
  effectDrawRelic,
  effectEquipRandomRelic,
  effectHeroicRelics,
  effectStealAndEquipRelic,
  effectStealHandRelic,
  effectStealPassive,
} from "./card-effects";

/**
 * Effects that run their own prompts before the shared targeting step: each one
 * asks in stages, so the generic one-prompt resolution below does not fit them.
 */
const PROMPTED_EFFECTS: Partial<Record<EffectId, EffectHandler<EffectStart>>> = {
  discover_relic_self: effectDiscoverRelicSelf,
  choose_relic: effectDiscoverRelicSelf,
  frieren_relic_discover: effectFrierenRelicDiscover,
  morpheus_choice: effectMorpheusChoice,
  batman_gadget_choice: effectBatmanGadgetChoice,
};

/** Every other effect, run after its TARGETED_EFFECTS prompt (if any) has an answer. */
const EFFECT_HANDLERS: Partial<Record<EffectId, EffectHandler<EffectContext>>> = {
  chain_all_minions: effectChainAllMinions,
  free_chained_shield: effectFreeChainedShield,
  flowey_save_load: effectFloweySaveLoad,
  aladdin_wish: effectAladdinWish,
  rebirth_friendly_dead: effectRebirthFriendlyDead,
  replace_same_cost_random: effectReplaceSameCostRandom,
  stasis_enemy: effectStasisEnemy,
  dark_dimension_banish: effectDarkDimensionBanish,
  vader_chain_or_destroy: effectVaderChainOrDestroy,
  rimuru_tempest: effectRimuruTempest,
  copy_minion_effects: effectCopyMinionEffects,
  neutral_double_atk_hp_1: effectNeutralDoubleAtkHp1,
  strange_bargain: effectStrangeBargain,
  death_star_mark: effectDeathStarMark,
  knov_pocket_room: effectKnovPocketRoom,
  meleoron_protect_ally: effectMeleoronProtectAlly,
  mob_ascend: effectMobAscend,
  random_attacks_next_turn: effectRandomAttacksNextTurn,
  rick_return_all: effectRickReturnAll,
  summon_sins: effectSummonSins,
  naruto_shadow_clones: effectNarutoShadowClones,
  star_destroyer_tie_fighters: effectStarDestroyerTieFighters,
  summon_margit: effectSummonMargit,
  chaos_random_summon: effectChaosRandomSummon,
  heroic_relics: effectHeroicRelics,
  equip_random_relic: effectEquipRandomRelic,
  draw_card: effectDrawCard,
  draw_relic: effectDrawRelic,
  wall_of_flesh_grind: effectWallOfFleshGrind,
  ragnaros_ongoing_burn: effectRagnarosOngoingBurn,
  damage_enemy_1: effectDamageEnemy1,
  aoe_damage_3: effectAoeDamage3,
  time_bomb_destroy_all: effectTimeBombDestroyAll,
  gain_divine_shield: effectGainDivineShield,
  light_yagami_nature_kill: effectLightYagamiNatureKill,
  anti_good_grow: effectAntiGoodGrow,
  protect_slot: effectProtectSlot,
  snap_balance: effectSnapBalance,
  freeze_and_weaken: effectFreezeAndWeaken,
  set_hp_1: effectSetHp1,
  set_all_enemy_hp_1: effectSetAllEnemyHp1,
  discover_random_keyword_minion: effectDiscoverRandomKeywordMinion,
  copy_minion_to_hand: effectCopyMinionToHand,
  copy_passive: effectCopyPassive,
  rimuru_tempest_growth: effectRimuruTempestGrowth,
  self_buff_2: effectSelfBuff2,
  yoda_lowest_atk_buff: effectYodaLowestAtkBuff,
  self_atk_3: effectSelfAtk3,
  heal_5: effectHeal5,
  avatar_aang_awakened: effectAvatarAangAwakened,
  discover_tech_card: effectDiscoverTechCard,
  heal_self_full: effectHealSelfFull,
  aoe_all_1: effectAoeAll1,
  aoe_all_2: effectAoeAll2,
  aoe_all_4: effectAoeAll4,
  destroy_enemy_taunt: effectDestroyEnemyTaunt,
  godrick_graft: effectGodrickGraft,
  destroy_damaged_enemy: effectDestroyDamagedEnemy,
  destroy_all_damaged_enemies: effectDestroyAllDamagedEnemies,
  consume_tech_4_hp: effectConsumeTech4Hp,
  consume_nature_4_hp: effectConsumeTech4Hp,
  devour_friendly: effectDevourFriendly,
  freeze_and_silence_enemy: effectFreezeAndSilenceEnemy,
  freeze_all_enemies: effectFreezeAllEnemies,
  silence_enemy: effectSilenceEnemy,
  buff_evil_ally_2: effectBuffEvilAlly2,
  buff_all_good_2: effectBuffAllGood2,
  buff_all_magic_2_1: effectBuffAllMagic21,
  buff_all_tech_2_1: effectBuffAllTech21,
  shield_all_friendly: effectShieldAllFriendly,
  double_other_friendly_attack: effectDoubleOtherFriendlyAttack,
  steal_hand_relic: effectStealHandRelic,
  consume_all_friendly_tech: effectConsumeAllFriendlyTech,
  dice_buff: effectDiceBuff,
  doof_coinflip: effectDoofCoinflip,
  bounce_friendly: effectBounceFriendly,
  ally_atk_1: effectAllyAtk1,
  taunt_aura: effectTauntAura,
  buddha_purify: effectBuddhaPurify,
  hashira_good_volley: effectHashiraGoodVolley,
  steal_and_equip_relic: effectStealAndEquipRelic,
  destroy_relic: effectDestroyRelic,
  mind_control_2: effectMindControl2,
  mind_control_enemy: effectMindControl2,
  motoko_kusanagi: effectMotokoKusanagi,
  steal_passive: effectStealPassive,
  bounce_friendly_discount: effectBounceFriendlyDiscount,
  transform_random_allies_up: effectTransformRandomAlliesUp,
  devolve_enemy_minions: effectDevolveEnemyMinions,
  set_stats_choice: effectSetStatsChoice,
  slot_random_attacks: effectSlotRandomAttacks,
  slot_permanent_chain: effectSlotRandomAttacks,
  slot_growth_1: effectSlotRandomAttacks,
};

export function runEffect(
  state: GameState,
  source: MinionInstance,
  sourceSlot: number,
  library: CardLibrary,
  events: GameEvent[],
  chosen?: ResolvedChoice,
): boolean {
  const player = state.players[source.owner];
  const enemyId = opponent(source.owner);
  const enemy = state.players[enemyId];
  const label = `${source.name}:`;

  traceEffect(source.effectId);

  const start: EffectStart = { state, source, sourceSlot, library, events, chosen, player, enemyId, enemy, label };
  const prompted = PROMPTED_EFFECTS[source.effectId];
  if (prompted) return prompted(start) === true;

  // Targeted effects resolve against picked / pickedHand / pickedValue.
  let picked: MinionInstance | null = null;
  let pickedSlot: TargetOption | null = null;
  let pickedHand: HandOption | null = null;
  let pickedValue: string | null = null;
  let pickedCoreOwner: PlayerId | null = null;
  const spec = TARGETED_EFFECTS[source.effectId];
  if (spec) {
    const answer = chosen ?? requestChoice(state, source, spec, library);
    if (answer === "asked") return true;
    if (answer === null) return false;
    if (answer.kind === "board") {
      pickedSlot = answer.target;
      picked = state.players[answer.target.owner].board[answer.target.slot] ?? null;
    } else if (answer.kind === "hand") pickedHand = answer.hand;
    else if (answer.kind === "core") pickedCoreOwner = answer.owner;
    else pickedValue = answer.option.value;
    // Slot answers share the board-option payload, so preserve the prompt's
    // semantic kind; every other stage can validate from its actual answer.
    const kind = spec.kind === "slot" ? "slot" : spec.kind === "boardOrCore" ? "boardOrCore" : answer.kind;
    if (kind === "board" && !picked) return false;
    if (kind === "slot" && !pickedSlot) return false;
    if (kind === "hand" && !pickedHand) return false;
    if (kind === "option" && pickedValue === null) return false;
    if (kind === "boardOrCore" && !picked && pickedCoreOwner === null) return false;
  }

  const handler = EFFECT_HANDLERS[source.effectId];
  return handler
    ? handler({ ...start, picked, pickedSlot, pickedHand, pickedValue, pickedCoreOwner }) === true
    : false;
}
