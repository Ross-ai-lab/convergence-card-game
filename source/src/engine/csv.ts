import type {
  Alignment,
  Camp,
  CardDefinition,
  EffectId,
  EffectTiming,
  Keyword,
  Rarity,
  RelicDefinition,
  RelicId,
} from "./types";

const rarities = new Set<Rarity>(["Red", "Yellow", "Purple", "Black"]);
const camps = new Set<Camp>(["Magic", "Tech", "Nature"]);
const alignments = new Set<Alignment>(["Good", "Evil", "Neutral"]);
const timings = new Set<EffectTiming>(["none", "onPlay", "ongoing", "onPlayAndOngoing", "passive", "deathrattle"]);
const keywords = new Set<Keyword>([
  "Passive",
  "Ongoing",
  "Taunt",
  "Divine Shield",
  "Freeze",
  "Silence",
  "Chained",
  "Invulnerable",
  "Charge",
  "Deathrattle",
  "Cannot Attack",
]);

const effectIds = new Set<EffectId>([
  "none",
  "pressure_hand",
  "hand_shuffle",
  "draw_card",
  "evasive",
  "freeze_two",
  "small_attack_ward",
  "deal_enemy_core",
  "heal_self",
  "aoe_damage_3",
  "time_bomb_ongoing_5",
  "harmony_buff",
  "evil_invulnerable",
  "set_attack_1",
  "aoe_damage_2",
  "godzilla_damage_burst",
  "gain_divine_shield",
  "absorb_left_stats",
  "damaged_self_buff",
  "gain_relic",
  "copy_passive",
  "anti_disable_aura",
  "destroy_weakest",
  "kill_random_enemy",
  "destroy_enemy_taunt",
  "destroy_and_gain_stats",
  "godrick_graft",
  "high_attack_only",
  "anti_good_grow",
  "small_cannot_attack",
  "damage_3x_nature",
  "protect_slot",
  "snap_balance",
  "attack_3x",
  "destroy_small_good",
  "no_evil_buff",
  "destroy_small_neutral",
  "summon_chained",
  "freeze_opposing",
  "delayed_destroy",
  "freeze_and_weaken",
  "tech_buff",
  "reveal_hand",
  "reveal_enemy_draw",
  "set_hp_1",
  "lone_evil_buff",
  // added 2026-07-12 — full-roster effects
  "self_buff_2",
  "self_atk_3",
  "heal_5",
  "heal_ally_full",
  "heal_good_ally_full",
  "aoe_all_1",
  "aoe_all_2",
  "aoe_all_3",
  "damage_evil_enemy_4",
  "damage_magic_enemy_2",
  "destroy_small_4",
  "destroy_enemy",
  "destroy_all_small",
  "destroy_damaged_enemy",
  "destroy_all_damaged_enemies",
  "devour_small",
  "devour_friendly",
  "chain_damage",
  "reduce_atk_3",
  "all_enemy_atk_down_2",
  "freeze_enemy",
  "freeze_all",
  "freeze_all_enemies",
  "lunar_slime",
  "chain_attacker",
  "silence_enemy",
  "buff_good_ally_3",
  "buff_all_good_2",
  "buff_magic_ally_3",
  "buff_evil_ally_2",
  "buff_evil_ally_3_2_heal",
  "buff_neutral_tech_ally_2",
  "buff_good_tech_ally_2",
  "buff_all_evil_1",
  "buff_all_good_1",
  "buff_all_neutral_1",
  "buff_all_magic_2_1",
  "buff_all_nature_2_1",
  "buff_all_tech_2_1",
  "buff_all_friendly_3_neg2",
  "evil_count_buff",
  "give_shield_ally",
  "shield_all_friendly",
  "shield_good_magic",
  "evil_2_shield",
  "restore_shield",
  "damaged_ongoing_buff",
  "lone_burst_8",
  "copy_ally_atk",
  "copy_ally_hp",
  "steal_random",
  "steal_chosen",
  "steal_costliest",
  "reshuffle_hand",
  "discard_draw_2",
  "consume_tech_card",
  "consume_all_friendly_tech",
  "dice_buff",
  "doof_dice",
  "doof_coinflip",
  "bounce_enemy",
  "give_taunt",
  "alone_buff_5",
  "ally_atk_1",
  "taunt_aura",
  "tempest_guardian_lords",
  "tempest_guardian_growth",
  "attack_2x",
  "mid_attack_only",
  "oliva_ward",
  "invuln_with_good_ally",
  "invuln_if_alone",
  "invuln_if_three_good",
  "dodge_50",
  "give_dodge_50",
  "immune_magic_minions",
  "immune_tech_minions",
  "immune_nature_minions",
  "immune_nature_tech",
  "dodge_80",
  "freeze_attacker",
  "on_kill_buff_1",
  "on_survive_buff_1",
  "on_survive_buff_2",
  "friendly_death_buff_1_1",
  "nulgath_any_death_1_1",
  "nito_any_death_1_1",
  "tech_death_buff",
  "godrick_relic_on_kill",
  "robocop_evil_bonus",
  "kaku_discard",
  "shifu_shield",
  // the hard cards
  "steal_relic",
  "choose_relic",
  "destroy_relic",
  "kill_back",
  "attack_lock",
  "attack_once_ever",
  "survivor_buff",
  "mark_for_death",
  "mind_control_2",
  "mind_control_4_delayed",
  "copy_and_trigger",
  "steal_passive",
  "redirect_attacks",
  "bounce_friendly_discount",
  "replace_allies_from_deck",
  "camp_immunity_on_hit",
  "set_stats_choice",
  "alignment_shift",
  "pressure_chosen_card",
  "reveal_and_shuffle_chosen",
  "choose_2_discard",
  "freeze_or_kill",
  "discover_relic_self",
  "steal_magic_effects",
  // slot auras and forced-random attacks
  "slot_random_attacks",
  "slot_permanent_silence",
  "slot_growth",
  "confuse_enemies",
  "chaos_aura",
  "foresight_draw",
  // 2026-08 card pass
  "watcher_reveal_hand",
  "charge",
  "copy_minion_effects",
  "neutral_double_atk_hp_1",
  "random_attacks_next_turn",
  "mob_ascend",
  "strange_duel",
  "death_star_mark",
  "glados_adjacent_tech",
  "gordon_survive_damage",
  "deathrattle_aoe_3",
  "avengers_recruit_good",
  "doom_evil_slayer",
  "ragnaros_end_turn",
  "knov_pocket_room",
  "meleoron_protect_ally",
  "yoda_global_silence",
  "voldemort_phylactery",
  "rick_return_all",
  "shigaraki_decay",
  "ainz_skeleton_army",
  "heroic_relics",
  // requested card updates
  "morpheus_choice",
  "aladdin_wish",
  "fantastic_four_aura",
  "evade_first_attack",
  "heal_all_friendly_full",
  "heal_self_full",
  "deathrattle_summon_morgott",
  "replace_same_cost_random",
  "deathrattle_random_evil",
  "highest_atk_only",
  "aizen_deathrattle",
  "chain_random_enemy",
  "weak_point_mark",
  "dodge_75",
  "reborn_75",
  "mask_return_attacker",
  "elden_beast_magic_atk",
  "oogway_rescue",
  "set_attack_highest_enemy",
  "evade_allies_33",
  "korosensei_defense",
  "stasis_enemy",
  "vader_chain_or_destroy",
  "deathrattle_good_buff_shield",
  "grievous_on_kill_atk",
  "buddha_purify",
  "invulnerable_if_frozen",
  "summon_sins",
  "yoda_lowest_atk_buff",
  "king_attack_lock_random",
  "dominion_authority",
  "kratos_chain_break",
  "ten_commandments_first_attack",
  "hashira_focus_attack",
  "freeze_and_silence_enemy",
]);

const relicIds = new Set<RelicId>([
  "none",
  "double_stats",
  "immune_magic",
  "core_strike_3",
  "bearer_divine_shield",
  "cleave_adjacent",
  "double_ongoing",
  "half_from_nature",
  "half_from_tech",
  "double_atk_damage",
  "half_from_magic",
  "monster_cell",
  "philosophers_stone",
  "capture_kill",
  "immune_disable",
  "ongoing_grow_2",
  "heal_full_now",
  "cocoon",
  "ignore_defences",
  "return_on_death",
  "untargetable",
  "no_retaliation",
]);

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];

  return body.map((values) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), values[index]?.trim() ?? ""])),
  );
}

export function parseCardsCsv(text: string): CardDefinition[] {
  const rows = parseCsv(text);
  return rows.map((row, index) => normalizeCardRow(row, index + 2));
}

/**
 * Relics carry no ATK/HP — they are equipment, so the only field the engine
 * needs beyond the printed text is the `relicId` hook.
 */
export function parseRelicsCsv(text: string): RelicDefinition[] {
  return parseCsv(text).map((row, index) => {
    const line = index + 2;
    if (!row.id || !row.name) throw new Error(`Relic line ${line}: id and name are required.`);
    return {
      kind: "relic" as const,
      id: row.id,
      name: row.name,
      relicId: oneOf(row.relicId, relicIds, "relicId", line),
      effect: row.effect ?? "",
      flavor: row.flavor ?? "",
      origin: row.origin ?? "",
      art: row.art ?? "",
      cost: /^\d+$/.test((row.cost ?? "").trim()) ? Number(row.cost) : undefined,
    };
  });
}

function normalizeCardRow(row: Record<string, string>, line: number): CardDefinition {
  const cost = parseIntField(row.cost, "cost", line);
  const atk = parseIntField(row.atk, "atk", line);
  const hp = parseIntField(row.hp, "hp", line);
  const rarity = oneOf(row.rarity, rarities, "rarity", line);
  const camp = oneOf(row.camp, camps, "camp", line);
  const alignment = oneOf(row.alignment, alignments, "alignment", line);
  const effectId = oneOf(row.effectId, effectIds, "effectId", line);
  const effectTiming = oneOf(row.effectTiming, timings, "effectTiming", line);
  const parsedKeywords = row.keywords
    ? row.keywords.split(";").map((keyword) => oneOf(keyword.trim(), keywords, "keyword", line))
    : [];

  if (!row.id || !row.name) {
    throw new Error(`Line ${line}: id and name are required.`);
  }

  return {
    kind: "minion" as const,
    id: row.id,
    name: row.name,
    cost,
    atk,
    hp,
    rarity,
    camp,
    alignment,
    keywords: parsedKeywords,
    effectId,
    effectTiming,
    effect: row.effect,
    flavor: row.flavor,
    origin: row.origin,
    art: row.art ?? "",
  };
}

function parseIntField(value: string, field: string, line: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Line ${line}: ${field} must be a non-negative integer.`);
  }
  return parsed;
}

function oneOf<T extends string>(value: string, allowed: Set<T>, field: string, line: number): T {
  if (allowed.has(value as T)) return value as T;
  throw new Error(`Line ${line}: ${field} has invalid value "${value}".`);
}
