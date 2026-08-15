import type { HeroPowerId } from "./types";

export const HERO_POWER_COST = 2;

export type HeroPowerTarget = "friendly" | "enemy" | "none";

export interface HeroPowerDefinition {
  id: HeroPowerId;
  name: string;
  text: string;
  target: HeroPowerTarget;
}

/**
 * The opening offer is deliberately a small, legible pool: every power costs
 * two mana, can be used once per turn, and differs by target or resource. The
 * engine owns the resolution; this table is the shared vocabulary for cards,
 * the offer overlay, the hero button, and tests.
 */
export const HERO_POWER_DEFINITIONS: readonly HeroPowerDefinition[] = [
  { id: "minion_hp", name: "Vital Spark", text: "Give a friendly minion +1 HP.", target: "friendly" },
  { id: "minion_atk", name: "Sharpen", text: "Give a friendly minion +1 ATK.", target: "friendly" },
  { id: "minion_hp_down", name: "Wither", text: "Give an enemy minion -1 HP.", target: "enemy" },
  { id: "minion_atk_down", name: "Dampen", text: "Give an enemy minion -1 ATK.", target: "enemy" },
  { id: "core_trade_draw", name: "Blood Price", text: "Lose 2 Core HP, then draw a card.", target: "none" },
  { id: "enemy_core_damage", name: "Core Bolt", text: "Deal 2 damage to the enemy Core.", target: "none" },
  { id: "core_heal", name: "Mend Core", text: "Heal your Core by 2 HP.", target: "none" },
  {
    id: "chain_growth",
    name: "Reforged Chains",
    text: "Chain a friendly minion for 1 turn. It gains +1/+1 when unchained.",
    target: "friendly",
  },
  { id: "summon_recruit", name: "Call a Recruit", text: "Summon a 1/1 Heroic Recruit.", target: "none" },
  { id: "give_taunt", name: "Stand Fast", text: "Give a friendly minion Taunt.", target: "friendly" },
];

export const HERO_POWER_IDS = HERO_POWER_DEFINITIONS.map(({ id }) => id) as HeroPowerId[];

export function heroPowerDefinition(id: HeroPowerId | null | undefined): HeroPowerDefinition | null {
  return HERO_POWER_DEFINITIONS.find((power) => power.id === id) ?? null;
}
