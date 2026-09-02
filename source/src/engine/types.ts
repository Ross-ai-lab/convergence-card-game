export type PlayerId = 0 | 1;
/**
 * The three source camps plus the umbrella camp. ALL is deliberately not an
 * alias for any one source camp: it receives their positive camp buffs, while
 * camp-specific hostile effects still require the exact named camp.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array.
 */
export const CAMPS = ["Magic", "Tech", "Nature", "ALL"] as const;

export type Camp = (typeof CAMPS)[number];
/**
 * The three alignments, in the order the interface lists them.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array. A value can
 * therefore never exist in one of those two places and not the other.
 */
export const ALIGNMENTS = ["Good", "Neutral", "Evil"] as const;

export type Alignment = (typeof ALIGNMENTS)[number];
/**
 * The four card tiers, COMMONEST FIRST, each with the name the game shows.
 *
 * One table, because the alternative was seven. The colour is the internal
 * label — it names the gem on the card, not the tier — and the ranking, the
 * display names and "which tiers are above Rare" were separately typed out in
 * `App.tsx` (four times), `unlocks.ts` (twice) and `scripts/build-codex.mjs`,
 * each list carrying its own idea of the order. Everything downstream now reads
 * this one, and the order of the array IS the ranking: index 0 is the baseline
 * tier every other one escalates from.
 *
 * `csv.ts` validates incoming data against the same table, so a tier cannot
 * exist in the type and not in the validator.
 */
export const RARITY_TIERS = [
  { code: "Black", name: "Rare" },
  { code: "Purple", name: "Epic" },
  { code: "Yellow", name: "Legendary" },
  { code: "Red", name: "Mythic" },
] as const;

export type Rarity = (typeof RARITY_TIERS)[number]["code"];

export const RARITIES: readonly Rarity[] = RARITY_TIERS.map((tier) => tier.code);

/** The tier a card has to reach before it carries an animated shine. */
export const BASELINE_RARITY: Rarity = RARITY_TIERS[0].code;

/** The top tier. Its arrival takes the whole screen. */
export const TOP_RARITY: Rarity = RARITY_TIERS[RARITY_TIERS.length - 1].code;

/** Commonest to rarest, as a rank starting at 0. */
export function rarityRank(rarity: string): number {
  return RARITY_TIERS.findIndex((tier) => tier.code === rarity);
}

/** The name a player sees for a tier. Unknown values are shown as they are. */
export function rarityName(rarity: string): string {
  return RARITY_TIERS.find((tier) => tier.code === rarity)?.name ?? rarity;
}

/**
 * What a relic prints where a character prints its tier.
 *
 * A relic has no character tier. It carries this word so the card face, the
 * gallery filter and the pack's reveal order all have something to sort on, and
 * it deliberately sits OUTSIDE `RARITY_TIERS`: no card data may use it, and
 * `csv.ts` will reject it in a rarity column.
 */
export const RELIC_RARITY = "Relic";

/**
 * What a relic prints where a character prints its camp.
 *
 * Same story as `RELIC_RARITY`: a placeholder for a property relics do not have,
 * kept out of `CAMPS` so no card can carry it, and named here because the card
 * face, the gallery's hidden-option list and the codex all had it typed out.
 */
export const RELIC_CAMP_LABEL = "Ascension";
/**
 * When a card's printed text happens.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array. A value can
 * therefore never exist in one of those two places and not the other.
 */
export const EFFECT_TIMINGS = [
  "none",
  "onPlay",
  "ongoing",
  "onPlayAndOngoing",
  "onPlayAndDeathrattle",
  "passive",
  "deathrattle",
  // Reborn fires on death like a Deathrattle and is deliberately NOT one. It is
  // its own keyword, so the card prints "Reborn" and no timing word at all, the
  // Necronomicon does not double it, and it needs no "Deathrattle:" prefix in
  // front of a word that already says when it happens.
  "reborn",
] as const;

export type EffectTiming = (typeof EFFECT_TIMINGS)[number];

/** The ten Hero Powers; the player unlocks them while the bot can receive any. */
export type HeroPowerId =
  | "minion_hp"
  | "minion_atk"
  | "minion_hp_down"
  | "minion_atk_down"
  | "core_trade_draw"
  | "enemy_core_damage"
  | "core_heal"
  | "chain_growth"
  | "summon_recruit"
  | "give_taunt";

/**
 * Every keyword a card may print.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array. A value can
 * therefore never exist in one of those two places and not the other.
 */
export const KEYWORDS = [
  "Passive",
  "Ongoing",
  "Taunt",
  "Divine Shield",
  "Freeze",
  "Silence",
  "Chained",
  "Charge",
  "Deathrattle",
  "Cannot Attack",
  "Reborn",
] as const;

export type Keyword = (typeof KEYWORDS)[number];

/**
 * Every effect hook the engine knows how to resolve.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array. A value can
 * therefore never exist in one of those two places and not the other.
 */
export const EFFECT_IDS = [
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
  // --- added 2026-07-12: effects for the full roster (onPlay/ongoing actives) ---
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
  "all_enemy_atk_down_2",
  "copy_all_enemy_passives",
  "deep_sea_discount",
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
  // --- passive / reactive (checked inline, not run in runEffect) ---
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
  // --- the last five: slot auras and forced-random attacks ---
  "slot_random_attacks",
  "slot_growth_1",
  "foresight_draw",
  // --- 2026-08 card pass ---------------------------------------------------
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
  "ragnaros_ongoing_burn",
  "knov_pocket_room",
  "meleoron_protect_ally",
  "yoda_global_silence",
  "voldemort_phylactery",
  "rick_return_all",
  "shigaraki_decay",
  "heroic_relics",
  // --- requested card updates ---------------------------------------------
  "morpheus_choice",
  "aladdin_wish",
  "fantastic_four_aura",
  "evade_first_attack",
  "heal_self_full",
  "deathrattle_summon_morgott",
  "replace_same_cost_random",
  "deathrattle_random_evil",
  "highest_atk_only",
  "aizen_reborn_twice",
  "aizen_reborn_once",
  "reborn_once",
  "elden_beast_neutral_magic_atk",
  "oogway_rescue",
  "evade_allies_33",
  "korosensei_defense",
  // --- 2026-08 requested card replacements --------------------------------
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
  "slot_permanent_chain",
  // --- Star Wars / Tech card replacements ---------------------------------
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
  // --- 2026-09 card pass ---------------------------------------------------
  "chain_watch_growth",
  "wall_of_flesh_grind",
  "tai_lung_kill_keywords",
  "damage_enemy_1",
  "pillar_men_kill_heal",
  "taunt_ally_self_buff",
  "deathrattle_damage_random_enemy",
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

export interface CardDefinition {
  kind: "minion";
  id: string;
  name: string;
  cost: number;
  atk: number;
  hp: number;
  rarity: Rarity;
  camp: Camp;
  alignment: Alignment;
  keywords: Keyword[];
  effectId: EffectId;
  effectTiming: EffectTiming;
  effect: string;
  flavor: string;
  origin: string;
  art: string;
}

export interface TemporaryMinionControl {
  originalOwner: PlayerId;
  originalSlot: number;
  expiresAtTurn: number;
  expiresAfterPlayer: PlayerId;
}

export interface MinionInstance {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  name: string;
  cost: number;
  atk: number;
  hp: number;
  maxHp: number;
  baseAtk: number;
  baseHp: number;
  rarity: Rarity;
  camp: Camp;
  alignment: Alignment;
  keywords: Keyword[];
  effectId: EffectId;
  effectTiming: EffectTiming;
  effect: string;
  origin: string;
  art: string;
  playOrder: number;
  attacksUsed: number;
  sleeping: boolean;
  chained: number;
  frozen: boolean;
  /**
   * Set at the start of the owner's turn on a minion that is still frozen: it
   * has now SAT OUT that turn, so it thaws when the turn ends. Freeze is meant
   * to cost a minion one of its turns; thawing at turn start (the old
   * behaviour) cost it nothing, because the same loop reset attacksUsed and it
   * could attack immediately.
   */
  thawPending: boolean;
  silenced: boolean;
  /** Gojo's live aura sources; removed when those passive sources leave play. */
  passiveSilenceSources: string[];
  divineShield: boolean;
  /** The first Ascension Relic strapped to this minion, if any. Dies with it. */
  relic: RelicInstance | null;
  /** The optional second Ascension Relic slot. Older saves may omit it. */
  relic2?: RelicInstance | null;
  /** Reborn minions arrive without replaying their card's arrival music. */
  suppressArrivalTheme?: boolean;
  /** Motoko Kusanagi: temporary control returns after the controller's next turn. */
  temporaryControl: TemporaryMinionControl | null;
  /** Mahoraga: every attacker that has already swung at this minion. */
  attackedBy: string[];
  /** APR: this minion may never attack again. */
  attackLocked: boolean;
  /** APR: the lock expires after the minion misses two of its own turns. */
  attackLockedUntilTurn: number | null;
  /** Ten Commandments: this source has already chained one attacker this turn. */
  commandmentsTriggeredAtTurn: number | null;
  /** Kento Nanami: the instance that marked this minion for death. */
  markedBy: string | null;
  /** Shigaraki: the turn on which the mark becomes lethal. */
  markedForDeathAtTurn?: number | null;
  /** Doctor Strange: temporary untargetability and damage immunity. */
  untargetableUntilTurn?: number | null;
  /** Meleoron: the friendly minion protected while this source lives. */
  protectedByMeleoron?: string | null;
  /** Reversible stat/keyword contributions from live aura sources. */
  auraBonuses?: Array<{ sourceId: string; atk: number; hp: number; keywords: Keyword[]; divineShield?: boolean }>;
  /** Mastered Ultra Instinct Goku: the turn in which its first attack was evaded. */
  evadedAttackAtTurn?: number | null;
  /** Grand Master Oogway: one rescue per turn. */
  rescueUsedAtTurn?: number | null;
  /** Fantastic Four: live slot-1 Divine Shield contributions. */
  divineShieldAuraSources?: string[];
  /** Fantastic Four: a shield broken while its source remains alive. */
  brokenAuraSources?: string[];
  /** Death Star: a target waiting for the next turn's resolution. */
  deathStarTarget?:
    | { kind: "core"; owner: PlayerId; resolveAtTurn: number }
    | { kind: "minion"; owner: PlayerId; instanceId: string; resolveAtTurn: number }
    | null;
  /** Doomsday: immunity to one Camp, until the named turn. */
  campImmunity: { camp: Camp; untilTurn: number } | null;
  /** Chrollo: whose passive this minion is currently wearing. */
  stolenPassiveFrom: string | null;
  /** Chrollo: the printed passive text currently shown beneath this minion. */
  stolenPassiveText: string | null;
  /** Yubaba/Nyan: passive or ongoing effects granted by another card. */
  gainedEffects: Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }>;
  /** Frieren: the turn on which this minion already discovered a relic. */
  relicDiscoveryTurn: number | null;
  /** Flowey: the core HP captured by its Battlecry, restored on death. */
  savedCoreHealth?: number | null;
  /** Hero power: this minion gets +1/+1 when its one-turn chain expires. */
  chainGrowthPending?: boolean;
  /**
   * All for One: the minion's OWN effect, parked while it wears a copied one.
   *
   * Non-null means "currently wearing a borrowed effect, put this back when it
   * finishes". It has to be state rather than a local variable because a copied
   * effect may open a prompt, and the answer arrives on a later action — by
   * which time any local would be long gone and the effect would resolve
   * against `copy_and_trigger` instead of the borrowed one.
   */
  copyRestoreEffectId?: EffectId | null;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  health: number;
  /** Aladdin Lamp: one Divine Shield for this player's core. */
  heroDivineShield?: boolean;
  maxMana: number;
  mana: number;
  coins: number;
  hand: string[];
  board: Array<MinionInstance | null>;
  /** Kuma: per-card discounts, keyed by card id. */
  costReductions: Record<string, number>;
  /** Doctor Strange: mana removed from this player's next turn. */
  manaPenaltyNextTurn: number;
  /** Hand-pressure effects: a card this player must play by `dueTurn` or lose. */
  pressured: { cardId: string; dueTurn: number } | null;
  /** Permanent marks on this player's board positions. */
  slotAuras: SlotAura[];
  /** Kurogiri: the one full turn in which every swing is random. */
  randomAttacksFromTurn?: number | null;
  randomAttacksUntilTurn?: number | null;
  /** Card ids of friendly minions that have died this game, in death order. */
  deadMinions?: string[];
  fatigue: number;
  turnsStarted: number;
}

export type GamePhase = "mulligan" | "main" | "drawChoice" | "targeting" | "gameOver";

export interface MulliganState {
  /** Only the starting player takes a mulligan in this game. */
  player: PlayerId;
  /** One flag per opening card; true means replace it. */
  selected: boolean[];
}

export interface DrawChoice {
  player: PlayerId;
  cards: string[];
}

/** What a pending choice is asking the player to point at. */
export type ChoiceKind = "board" | "slot" | "hand" | "option" | "boardOrCore";

// --------------------------------------------------------------------------
// Slot auras. A curse or blessing laid on a POSITION rather than on a minion,
// and they are PERMANENT: the minion that cast one can die, be silenced or be
// bounced, and the slot stays marked for the rest of the duel. Whoever stands
// there next inherits it. (Owner ruling — this is what makes them worth a
// 10-mana card.)
// --------------------------------------------------------------------------
/**
 * Five of these can be laid by a card in play. `slot_silence` and `slot_grow_2`
 * cannot: the cards that laid them were rewritten, and no effect reaches them
 * any more. They stay in the type, and the engine and the interface keep
 * handling them, for one reason — a save written before September 2026 may
 * still hold one, and `SAVE_VERSION` was not bumped when they stopped being
 * reachable. Delete them only alongside a save bump.
 */
export type SlotAuraId =
  | "random_attacks" // Bill Cipher — a minion here can only attack at random
  | "slot_silence" // Retired — a minion here is silenced. Nothing lays this now.
  | "slot_chain" // Giorno GER — a minion here is permanently Chained
  | "slot_grow_1" // Floor Guardians — a minion here gains +1/+1 each of your turns
  | "slot_grow_2" // Retired — +2/+2 each of your turns. Nothing lays this now.
  | "slot_protected" // Neo — minions here resist Silence, Freeze, and Chain; removal and attacks still reach them
  | "slot_stats_one"; // Doctor Manhattan — minions here are permanently 1/1

export interface SlotAura {
  slot: number;
  auraId: SlotAuraId;
  /** Who laid it, for the log and the hover text. It outlives them. */
  sourceName: string;
}

/** One minion a targeted effect is allowed to pick. */
export interface TargetOption {
  owner: PlayerId;
  slot: number;
}

/** One card in a hand a targeted effect is allowed to pick. */
export interface HandOption {
  owner: PlayerId;
  index: number;
  cardId: string;
}

/** One labelled value, for effects that choose a number or an alignment. */
export interface LabelOption {
  label: string;
  value: string;
}

/**
 * A targeted effect that has stopped mid-resolution and is waiting for its
 * controller to answer. The engine holds everything it needs to finish the
 * effect once `choose_target` arrives, so the pause survives a clone and a save.
 *
 * All three option lists are always present (empty when unused) rather than a
 * discriminated union, because the whole state is round-tripped through
 * structuredClone and JSON and flat shapes survive both without ceremony.
 */
export interface PendingTarget {
  kind: ChoiceKind;
  player: PlayerId;
  sourceInstanceId: string;
  sourceOwner: PlayerId;
  sourceName: string;
  sourceCardId: string;
  effectId: EffectId;
  /** Hero powers do not have a board minion source, so they carry their id here. */
  heroPowerId?: HeroPowerId;
  prompt: string;
  options: TargetOption[];
  handOptions: HandOption[];
  labelOptions: LabelOption[];
  /** A board-or-core prompt adds the enemy core after the board options. */
  coreOption?: boolean;
  step: number;
  priorOptions: TargetOption[];
  priorHandOptions: HandOption[];
  priorLabelOptions: LabelOption[];
  /** Allows a freshly played target-card to be returned before it resolves. */
  cancelPlay?: PendingPlayReturn;
  /** Allows a targetable Hero Power to be cancelled before it resolves. */
  cancelHeroPower?: PendingHeroPowerReturn;
  /** Frieren passive triggers waiting behind the relic discover prompt. */
  queuedRelicSources?: string[];
}

/** The reversible part of a minion play while its target prompt is open. */
export interface PendingPlayReturn {
  player: PlayerId;
  slotIndex: number;
  handIndex: number;
  cardId: string;
  instanceId: string;
  manaRefund: number;
  previousCostReduction?: number;
  previousPressured: { cardId: string; dueTurn: number } | null;
}

/** The reversible payment and once-per-turn mark for an open Hero Power target. */
export interface PendingHeroPowerReturn {
  player: PlayerId;
  powerId: HeroPowerId;
  manaRefund: number;
}

/** The answer to a pending choice, handed back into the effect that asked. */
export type ResolvedChoice =
  | { kind: "board"; target: TargetOption }
  | { kind: "hand"; hand: HandOption }
  | { kind: "option"; option: LabelOption }
  | { kind: "core"; owner: PlayerId };

export type ResolvedChoiceWithProgress = ResolvedChoice & {
  step?: number;
  priorOptions?: TargetOption[];
  priorHandOptions?: HandOption[];
  priorLabelOptions?: LabelOption[];
};

// --------------------------------------------------------------------------
// Ascension Relics. Every relic's printed text is about "the bearer", so they
// are minion equipment, not hero trinkets. The card stays in deck/hand until
// the player explicitly pays its cost and straps it to a chosen friendly minion.
// --------------------------------------------------------------------------
/**
 * Every Ascension Relic hook the engine knows how to resolve.
 *
 * The array is the single source of truth: the type is derived from it, and
 * `csv.ts` validates incoming data against the same array. A value can
 * therefore never exist in one of those two places and not the other.
 */
export const RELIC_IDS = [
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
] as const;

export type RelicId = (typeof RELIC_IDS)[number];

export interface RelicDefinition {
  kind: "relic";
  id: string;
  name: string;
  relicId: RelicId;
  effect: string;
  flavor: string;
  origin: string;
  art: string;
  /** Printed mana cost paid when this relic is played. Optional because the
   * legacy data format had no cost column; every shipped relic prints one. */
  cost?: number;
}

export type PlayableCard = CardDefinition | RelicDefinition;

export function isMinionCard(card: PlayableCard | undefined): card is CardDefinition {
  return card?.kind === "minion";
}

export function isRelicCard(card: PlayableCard | undefined): card is RelicDefinition {
  return card?.kind === "relic";
}

/** A relic in play: the definition plus the little state some of them carry. */
export interface RelicInstance {
  id: string;
  relicId: RelicId;
  name: string;
  effect: string;
  art: string;
  /** Queen's Cocoon: the turn its +3/+3 payoff lands. */
  readyOnTurn?: number;
  /** The Monkey's Paw's global due turn, retained for its existing behavior. */
  destroyOnTurn?: number;
  /** Pandora's Box: the owner's turn count on which the bearer dies. */
  destroyOnOwnerTurn?: number;
  /** Time Turner: HP recorded when the bearer's previous turn began. */
  previousTurnStartHp?: number;
}

/**
 * Start-of-turn "ongoing" effects run one at a time so a targeted one can
 * suspend the whole batch and resume after the choice, instead of the rest
 * silently firing while the prompt is open.
 */
export interface QueuedEffect {
  instanceId: string;
  owner: PlayerId;
}

export interface GameState {
  phase: GamePhase;
  activePlayer: PlayerId;
  turnNumber: number;
  cheatMode: boolean;
  cheatPlayer?: PlayerId | null;
  /**
   * How fast max mana climbs, in mana per turn. Lives in the state so a save and
   * an undo carry it, and so the simulator can sweep it without a global.
   * 1 is the classic +1 a turn; the shipped value is higher because mana cost is
   * frozen and the ramp is therefore the only way the expensive half of the
   * roster ever reaches a board. See `finishStartOfTurn`.
   */
  manaRamp: number;
  nextInstance: number;
  nextPlayOrder: number;
  /** xorshift32 state. Lives IN the game state so undo rewinds luck too. */
  rngSeed: number;
  /**
   * The seat that draws two and keeps one every turn, or null when nobody does.
   *
   * This is the Ascendant opponent's Foresight cheat, and it lives in the state
   * rather than in the bot for two reasons: the draw happens deep inside
   * `beginTurn`, where nothing knows who is a bot, and a save has to restore a
   * duel that still cheats. Optional so an older save loads without it.
   *
   * Self-play never sets it, so the balance harness keeps measuring the honest
   * game.
   */
  foresightFor?: PlayerId | null;
  deck: string[];
  bottomDeck: string[];
  discard: string[];
  drawChoice: DrawChoice | null;
  pendingTarget: PendingTarget | null;
  /** Keeps a play-to-hand escape alive across multi-step target prompts. */
  pendingPlayCancel?: PendingPlayReturn | null;
  /** The player-only opening mulligan, or null once the duel has started. */
  mulligan: MulliganState | null;
  /** The selected power for each player. */
  heroPowers: [HeroPowerId | null, HeroPowerId | null];
  /** Once-per-own-turn gate, reset at the start of each player's turn. */
  heroPowerUsed: [boolean, boolean];
  /** Knov's pocket room entries; optional for backwards-compatible saved/test states. */
  pocketRooms?: PocketRoom[];
  /** G-Man's temporarily removed minions. */
  stasis: StasisEntry[];
  /** Dormammu's minions banished until the source dies. */
  darkDimension: DarkDimensionEntry[];
  effectQueue: QueuedEffect[];
  winner: PlayerId | "draw" | null;
  /**
   * How much damage each minion has dealt this duel, keyed by instance id.
   *
   * It survives the minion: a body that carried the duel and then died is
   * exactly the body the game-over screen wants to name, so the tally cannot
   * live on `MinionInstance`. Optional because every save written before it
   * existed has to keep loading, and an absent tally simply names nobody.
   *
   * Only damage with a MINION behind it is counted. Fatigue and hero powers
   * have no card to put on a screen, so crediting them would be inventing an
   * MVP out of something the player never played.
   */
  damageTally?: Record<string, DamageTallyEntry>;
  players: [PlayerState, PlayerState];
}

/** One minion's damage total, with enough of its face to draw it after it dies. */
export interface DamageTallyEntry {
  instanceId: string;
  cardId: string;
  name: string;
  art: string;
  owner: PlayerId;
  damage: number;
}

export interface StasisEntry {
  minion: MinionInstance;
  owner: PlayerId;
  slot: number;
  returnAtTurn: number;
  sourceName: string;
}

export interface DarkDimensionEntry {
  minion: MinionInstance;
  owner: PlayerId;
  slot: number;
  sourceInstanceId: string;
  sourceName: string;
}

export interface PocketRoom {
  owner: PlayerId;
  friendly: MinionInstance;
  friendlySlot: number;
  enemy: MinionInstance;
  enemySlot: number;
  returnAtTurn: number;
}

export type GameAction =
  | { type: "play_card"; player: PlayerId; handIndex: number; slotIndex: number }
  | { type: "play_relic"; player: PlayerId; handIndex: number; slotIndex: number }
  | { type: "attack_minion"; player: PlayerId; attackerSlot: number; targetSlot: number }
  | { type: "attack_core"; player: PlayerId; attackerSlot: number }
  | { type: "end_turn"; player: PlayerId }
  | { type: "toggle_mulligan"; player: PlayerId; handIndex: number }
  | { type: "confirm_mulligan"; player: PlayerId }
  | { type: "choose_draw"; player: PlayerId; choiceIndex: number }
  | { type: "choose_target"; player: PlayerId; choiceIndex: number }
  | { type: "cancel_target"; player: PlayerId }
  | { type: "use_hero_power"; player: PlayerId }
  | { type: "use_coin"; player: PlayerId };

export type GameEventKind =
  | "info"
  | "draw"
  | "play"
  | "combat"
  | "damage"
  | "death"
  | "effect"
  | "turn"
  | "warning"
  | "gameOver";

export interface GameEvent {
  kind: GameEventKind;
  text: string;
  player?: PlayerId;
  cardId?: string;
  instanceId?: string;
  /** View-only motion hint for a minion leaving the board. */
  motion?: "return" | "stasis";
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  legalActions: GameAction[];
}
