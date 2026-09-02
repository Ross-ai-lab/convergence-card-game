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
 * Every power costs two mana and can be used once per turn. The engine owns the
 * resolution; this table is the shared vocabulary for the hero menu, the
 * in-duel hero button, and tests.
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
    // No duration printed: Chained means two turns and says so itself. The
    // reward went from +1/+1 to +2/+2 with that change — two turns of silence is
    // a real price, and the power is now as much about putting a minion out of
    // reach of removal for those turns as it is about the stats.
    text: "Chain a friendly minion. It gains +2/+2 when unchained.",
    target: "friendly",
  },
  { id: "summon_recruit", name: "Call a Recruit", text: "Summon a 1/1 Knight.", target: "none" },
  { id: "give_taunt", name: "Stand Fast", text: "Give a friendly minion Taunt.", target: "friendly" },
];

export const HERO_POWER_IDS = HERO_POWER_DEFINITIONS.map(({ id }) => id) as HeroPowerId[];

/** Pick one of all ten powers from a fresh duel seed for the bot. */
export function randomHeroPower(seed: string): HeroPowerId {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return HERO_POWER_IDS[(hash >>> 0) % HERO_POWER_IDS.length];
}

/** The unlock track shown in the Hero Powers menu, from one win to ten wins. */
export const HERO_POWER_UNLOCK_ORDER: readonly HeroPowerId[] = [
  "core_heal",
  "enemy_core_damage",
  "give_taunt",
  "chain_growth",
  "summon_recruit",
  "minion_atk",
  "minion_hp",
  "core_trade_draw",
  "minion_atk_down",
  "minion_hp_down",
];

export function isHeroPowerUnlocked(id: HeroPowerId, botWins: number): boolean {
  const unlockAt = HERO_POWER_UNLOCK_ORDER.indexOf(id) + 1;
  return unlockAt > 0 && botWins >= unlockAt;
}

export function firstUnlockedHeroPower(botWins: number): HeroPowerId | null {
  if (botWins <= 0) return null;
  const index = Math.min(botWins - 1, HERO_POWER_UNLOCK_ORDER.length - 1);
  return HERO_POWER_UNLOCK_ORDER[index];
}

export function heroPowerDefinition(id: HeroPowerId | null | undefined): HeroPowerDefinition | null {
  return HERO_POWER_DEFINITIONS.find((power) => power.id === id) ?? null;
}
