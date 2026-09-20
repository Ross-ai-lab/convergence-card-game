import type { HeroPowerId } from "./types";

export const HERO_POWER_COST = 2;

export type HeroPowerTarget = "friendly" | "enemy" | "any" | "none";

export interface HeroPowerDefinition {
  id: HeroPowerId;
  name: string;
  text: string;
  target: HeroPowerTarget;
  cost?: number;
  passive?: boolean;
}

/**
 * Player powers cost two mana and can be used once per turn. Campaign powers may
 * be passive or use their own printed cost. The engine owns resolution; this
 * table is shared by menus, in-duel controls, campaign data and tests.
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
  { id: "glados_test_protocol", name: "Test Protocol", text: "The enemy has 15 turns to defeat you.", target: "none", cost: 0, passive: true },
  { id: "yujiro_apex_duel", name: "Apex Duel", text: "Only the enemy's highest-ATK minion may attack your Core.", target: "none", cost: 0, passive: true },
  { id: "light_delayed_mark", name: "Judgment Mark", text: "Mark an enemy minion. It dies at the start of your next turn.", target: "enemy", cost: 3 },
  { id: "voldemort_immortal", name: "Dark Immortality", text: "Cannot die while controlling a minion.", target: "none", cost: 0, passive: true },
  { id: "all_for_one_copy", name: "Quirk Theft", text: "Copy an enemy minion card into your hand.", target: "enemy", cost: 2 },
  { id: "ainz_skeleton", name: "Skeleton Legion", text: "At the start of every second turn, summon a 1/1 Skeleton.", target: "none", cost: 0, passive: true },
  { id: "eye_taunt", name: "Sauron's Gaze", text: "Give a friendly minion Taunt.", target: "friendly", cost: 1 },
  { id: "gilgamesh_relic", name: "Treasury Draw", text: "Gain a random Relic into your hand.", target: "none", cost: 2 },
  { id: "gojo_core_shield", name: "Limitless Barrier", text: "Your Core gains Divine Shield.", target: "none", cost: 2 },
  { id: "bill_chaos", name: "Chaos", text: "Swap a minion's current ATK and HP.", target: "any", cost: 1 },
  { id: "thanos_destroy", name: "The Snap", text: "Destroy a random enemy minion.", target: "none", cost: 5 },
  { id: "goku_start_mana", name: "Ultra Instinct", text: "Start with 2 mana instead of 1.", target: "none", cost: 0, passive: true },
  { id: "vader_minion_tax", name: "Imperial Tax", text: "Enemy minion cards cost 1 more next turn.", target: "none", cost: 2 },
  { id: "dio_freeze", name: "The World", text: "Freeze an enemy minion for 1 turn.", target: "enemy", cost: 2 },
  { id: "meruem_discover", name: "Royal Appraisal", text: "Discover a random card into your hand.", target: "none", cost: 2 },
  { id: "luffy_set_one", name: "Rubber Reality", text: "Set an enemy minion's stats to 1/1.", target: "enemy", cost: 3 },
  { id: "elden_revival", name: "Remembrance", text: "Revive a random friendly minion that died this game.", target: "none", cost: 3 },
  { id: "saitama_small_guard", name: "Serious Disinterest", text: "Cannot be damaged by minions with 3 or less ATK.", target: "none", cost: 0, passive: true },
  { id: "po_skadoosh", name: "Skadoosh", text: "Deal 3 damage to an Evil enemy minion.", target: "enemy", cost: 2 },
  { id: "conquest_no_retreat", name: "No Retreat", text: "Friendly minions cannot be Chained, Silenced, or Frozen.", target: "none", cost: 0, passive: true },
];

export const HERO_POWER_IDS = HERO_POWER_DEFINITIONS.map(({ id }) => id) as HeroPowerId[];

/** Pick one of the ten player powers from a fresh duel seed for free-play bots. */
export function randomHeroPower(seed: string): HeroPowerId {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return PLAYER_HERO_POWER_IDS[(hash >>> 0) % PLAYER_HERO_POWER_IDS.length];
}

export function heroPowerCost(definition: HeroPowerDefinition): number {
  return definition.cost ?? HERO_POWER_COST;
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

export const PLAYER_HERO_POWER_IDS = HERO_POWER_UNLOCK_ORDER;

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
