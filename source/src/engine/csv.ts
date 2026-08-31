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
const camps = new Set<Camp>(["Magic", "Tech", "Nature", "ALL"]);
const alignments = new Set<Alignment>(["Good", "Evil", "Neutral"]);
const timings = new Set<EffectTiming>(["none", "onPlay", "ongoing", "onPlayAndOngoing", "onPlayAndDeathrattle", "passive", "deathrattle"]);
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
  "draw_card",
  "draw_relic",
  "small_attack_ward",
  "aoe_damage_3",
  "time_bomb_destroy_all",
  "godzilla_damage_burst",
  "gain_divine_shield",
  "equip_random_relic",
  "copy_passive",
  "light_yagami_nature_kill",
  "destroy_enemy_taunt",
  "godrick_graft",
  "anti_good_grow",
  "small_cannot_attack",
  "protect_slot",
  "snap_balance",
  "flash_speed",
  "deathrattle_summon_galactus",
  "deathrattle_summon_vision",
  "freeman_charge_aura",
  "chain_all_minions",
  "freeze_and_weaken",
  "set_hp_1",
  "set_all_enemy_hp_1",
  // added 2026-07-12 — full-roster effects
  "self_buff_2",
  "self_atk_3",
  "heal_5",
  "bounce_friendly",
  "rebirth_friendly_dead",
  "aoe_all_1",
  "aoe_all_2",
  "aoe_all_4",
  "destroy_damaged_enemy",
  "destroy_all_damaged_enemies",
  "devour_friendly",
  "all_enemy_atk_down_1",
  "freeze_all_enemies",
  "chain_attacker",
  "silence_enemy",
  "buff_all_good_2",
  "buff_evil_ally_2",
  "buff_all_magic_2_1",
  "buff_all_nature_2_1",
  "buff_all_tech_2_1",
  "shield_all_friendly",
  "consume_tech_4_hp",
  "consume_nature_4_hp",
  "consume_all_friendly_tech",
  "dice_buff",
  "doof_coinflip",
  "ally_atk_1",
  "taunt_aura",
  "rimuru_tempest",
  "rimuru_tempest_growth",
  "attack_2x",
  "oliva_ward",
  "invuln_with_good_ally",
  "invuln_if_alone",
  "dodge_50",
  "immune_magic_minions",
  "immune_tech_minions",
  "immune_nature_minions",
  "enemy_cards_cost_1_more",
  "dodge_80",
  "on_kill_buff_1",
  "on_survive_buff_1",
  "friendly_death_buff_1_1",
  "nito_any_death_1_1",
  "robocop_evil_bonus",
  "shifu_shield",
  "kaku_evade_counter",
  "superman_damage_cap_3",
  "charge_ignore_taunt",
  "batman_gadget_choice",
  "steal_and_equip_relic",
  "flowey_save_load",
  "ouken_reborn",
  // the hard cards
  "steal_hand_relic",
  "choose_relic",
  "destroy_relic",
  "kill_back",
  "attack_lock",
  "attack_once_ever",
  "survivor_buff",
  "mind_control_2",
  "copy_and_trigger",
  "steal_passive",
  "bounce_friendly_discount",
  "camp_immunity_on_hit",
  "set_stats_choice",
  "discover_relic_self",
  // slot auras and forced-random attacks
  "slot_random_attacks",
  "slot_permanent_chain",
  "slot_growth_1",
  "foresight_draw",
  // 2026-08 card pass
  "watcher_reveal_hand",
  "charge",
  "copy_minion_effects",
  "neutral_double_atk_hp_1",
  "random_attacks_next_turn",
  "mob_ascend",
  "death_star_mark",
  "glados_adjacent_tech",
  "deathrattle_aoe_3",
  "doom_evil_slayer",
  "ragnaros_end_turn",
  "knov_pocket_room",
  "meleoron_protect_ally",
  "yoda_global_silence",
  "voldemort_phylactery",
  "rick_return_all",
  "shigaraki_decay",
  "heroic_relics",
  // requested card updates
  "morpheus_choice",
  "aladdin_wish",
  "fantastic_four_aura",
  "evade_first_attack",
  "heal_self_full",
  "deathrattle_summon_morgott",
  "replace_same_cost_random",
  "deathrattle_random_evil",
  "highest_atk_only",
  "aizen_deathrattle",
  "reborn_75",
  "elden_beast_neutral_magic_atk",
  "oogway_rescue",
  "evade_allies_33",
  "korosensei_defense",
  "stasis_enemy",
  "vader_chain_or_destroy",
  "grievous_on_kill_atk",
  "buddha_purify",
  "invulnerable_if_frozen",
  "summon_sins",
  "yoda_lowest_atk_buff",
  "king_attack_lock_random",
  "dominion_authority",
  "kratos_lockdown",
  "ten_commandments_first_attack",
  "hashira_focus_attack",
  "freeze_and_silence_enemy",
  "dumbledore_cleanse",
  "dark_dimension_banish",
  "strange_bargain",
  "reveal_top_deck",
  "free_chained_shield",
  "meruem_kill_copy",
  "deathrattle_summon_drakath",
  "avatar_aang_awakened",
  "chaos_random_summon",
  "copy_minion_to_hand",
  "discover_random_keyword_minion",
  "double_other_friendly_attack",
  "mind_control_enemy",
  "discover_tech_card",
  "transform_random_allies_up",
  "devolve_enemy_minions",
  "black_ops_ignore_taunt",
  "battleship_tech_aura",
  "star_destroyer_tie_fighters",
  "planetary_defense_grid_taunt_buff",
  "black_hole_deathrattle",
  "rudeus_hero_power_free",
  "prince_lloyd_damage_ward",
  "motoko_kusanagi",
  "shibukawa_defense_damage_2x",
  "xenomorph_queen_brood",
  "naruto_shadow_clones",
  "frieren_relic_discover",
  "guts_missing_core_growth",
]);

const relicIds = new Set<RelicId>([
  "none",
  "double_stats",
  "immune_magic",
  "rescue_full",
  "cleave_adjacent",
  "battlecry_to_ongoing",
  "immune_nature_attacks",
  "immune_tech_attacks",
  "double_bearer_attack",
  "immune_silence",
  "monster_cell",
  "philosophers_stone",
  "capture_kill",
  "immune_freeze_chain",
  "ongoing_grow_2",
  "heal_full_now",
  "cocoon",
  "ignore_defences",
  "return_on_death",
  "evade_50",
  "double_attack",
  "pandora_box",
  "monkeys_paw",
  "ark_divine_shield",
  "necronomicon",
  "dragon_balls",
  "mjolnir",
  "excalibur",
  "omnitrix",
  "stand_arrow",
  "poke_ball",
  "time_turner",
  "symbiote",
  "neuralyzer",
  "green_lantern_ring",
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
