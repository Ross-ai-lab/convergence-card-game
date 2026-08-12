export type PlayerId = 0 | 1;
export type Camp = "Magic" | "Tech" | "Nature";
export type Alignment = "Good" | "Evil" | "Neutral";
export type Rarity = "Red" | "Yellow" | "Purple" | "Black";
export type EffectTiming = "none" | "onPlay" | "ongoing" | "onPlayAndOngoing" | "passive" | "deathrattle";

export type Keyword =
  | "Passive"
  | "Ongoing"
  | "Taunt"
  | "Divine Shield"
  | "Freeze"
  | "Silence"
  | "Chained"
  | "Invulnerable"
  | "Charge"
  | "Deathrattle";

export type EffectId =
  | "none"
  | "pressure_hand"
  | "hand_shuffle"
  | "draw_card"
  | "evasive"
  | "freeze_two"
  | "small_attack_ward"
  | "deal_enemy_core"
  | "heal_self"
  | "aoe_damage_3"
  | "time_bomb_ongoing_5"
  | "harmony_buff"
  | "evil_invulnerable"
  | "set_attack_zero"
  | "aoe_damage_2"
  | "godzilla_damage_burst"
  | "gain_divine_shield"
  | "absorb_left_stats"
  | "damaged_self_buff"
  | "gain_relic"
  | "copy_passive"
  | "anti_disable_aura"
  | "destroy_weakest"
  | "kill_random_enemy"
  | "destroy_enemy_taunt"
  | "destroy_and_gain_stats"
  | "godrick_graft"
  | "high_attack_only"
  | "anti_good_grow"
  | "small_cannot_attack"
  | "double_damage_nature"
  | "protect_slot"
  | "snap_balance"
  | "triple_attack"
  | "destroy_small_good"
  | "no_evil_buff"
  | "destroy_small_neutral"
  | "summon_chained"
  | "freeze_opposing"
  | "delayed_destroy"
  | "freeze_and_weaken"
  | "tech_buff"
  | "reveal_hand"
  | "reveal_enemy_draw"
  | "set_hp_one"
  | "lone_evil_buff"
  // --- added 2026-07-12: effects for the full roster (onPlay/ongoing actives) ---
  | "self_buff_2"
  | "self_atk_3"
  | "heal_five"
  | "heal_ally_full"
  | "heal_good_ally_full"
  | "aoe_all_1"
  | "aoe_all_2"
  | "aoe_all_3"
  | "damage_evil_enemy_4"
  | "damage_magic_enemy_2"
  | "destroy_small_4"
  | "destroy_enemy"
  | "destroy_all_small"
  | "destroy_damaged_enemy"
  | "destroy_all_damaged_enemies"
  | "devour_small"
  | "devour_friendly"
  | "chain_damage"
  | "reduce_atk_3"
  | "all_enemy_atk_down_2"
  | "freeze_one"
  | "freeze_all"
  | "freeze_all_enemies"
  | "lunar_slime"
  | "chain_attacker"
  | "silence_enemy"
  | "buff_good_ally_3"
  | "buff_all_good_2"
  | "buff_magic_ally_3"
  | "buff_evil_ally_2"
  | "buff_evil_ally_3_2_heal"
  | "buff_neutral_tech_ally_2"
  | "buff_good_tech_ally_2"
  | "buff_all_evil_1"
  | "buff_all_good_1"
  | "buff_all_neutral_1"
  | "buff_all_magic_2_1"
  | "buff_all_nature_2_1"
  | "buff_all_tech_2_1"
  | "buff_all_friendly_4_neg1"
  | "evil_count_buff"
  | "give_shield_ally"
  | "shield_all_friendly"
  | "shield_good_magic"
  | "evil_two_shield"
  | "restore_shield"
  | "damaged_ongoing_buff"
  | "lone_burst_8"
  | "copy_ally_atk"
  | "copy_ally_hp"
  | "steal_random"
  | "steal_chosen"
  | "steal_costliest"
  | "reshuffle_hand"
  | "discard_draw_2"
  | "consume_tech_card"
  | "consume_all_friendly_tech"
  | "dice_buff"
  | "doof_dice"
  | "doof_coinflip"
  | "bounce_enemy"
  | "give_taunt"
  | "alone_buff_5"
  | "ally_atk_1"
  | "taunt_aura"
  | "tempest_guardian_lords"
  | "tempest_guardian_growth"
  // --- passive / reactive (checked inline, not run in runEffect) ---
  | "double_attack"
  | "mid_attack_only"
  | "oliva_ward"
  | "invuln_with_good_ally"
  | "invuln_if_alone"
  | "invuln_if_three_good"
  | "dodge_half"
  | "give_dodge_half"
  | "immune_magic_minions"
  | "immune_tech_minions"
  | "immune_nature_minions"
  | "immune_nature_tech"
  | "dodge_80"
  | "freeze_attacker"
  | "on_kill_buff_1"
  | "on_survive_buff_1"
  | "on_survive_buff_2"
  | "friendly_death_buff_1_1"
  | "any_death_buff_2_2"
  | "any_death_buff_2_1"
  | "tech_death_buff"
  | "godrick_relic_on_kill"
  | "robocop_evil_bonus"
  | "kaku_discard"
  | "shifu_shield"
  // --- the hard cards, wired once relics, hand targeting and value choices existed ---
  | "steal_relic"
  | "choose_relic"
  | "destroy_relic"
  | "kill_back"
  | "attack_lock"
  | "attack_once_ever"
  | "survivor_buff"
  | "mark_for_death"
  | "mind_control_2"
  | "mind_control_4_delayed"
  | "copy_and_trigger"
  | "steal_passive"
  | "redirect_attacks"
  | "bounce_friendly_discount"
  | "replace_allies_from_deck"
  | "camp_immunity_on_hit"
  | "set_stats_choice"
  | "alignment_shift"
  | "pressure_chosen_card"
  | "reveal_and_shuffle_chosen"
  | "choose_two_discard_one"
  | "freeze_or_kill"
  | "discover_relic_self"
  | "steal_magic_effects"
  // --- the last five: slot auras and forced-random attacks ---
  | "slot_random_attacks"
  | "slot_permanent_silence"
  | "slot_growth"
  | "confuse_enemies"
  | "chaos_aura"
  | "foresight_draw"
  // --- 2026-08 card pass ---------------------------------------------------
  | "watcher_reveal_hand"
  | "charge"
  | "copy_minion_effects"
  | "double_neutral_atk_set_hp"
  | "random_attacks_next_turn"
  | "mob_ascend"
  | "strange_duel"
  | "death_star_mark"
  | "glados_adjacent_tech"
  | "gordon_survive_damage"
  | "deathrattle_aoe_3"
  | "avengers_recruit_good"
  | "doom_evil_slayer"
  | "ragnaros_end_turn"
  | "knov_pocket_room"
  | "meleoron_protect_ally"
  | "yoda_global_silence"
  | "voldemort_phylactery"
  | "rick_return_all"
  | "shigaraki_decay"
  | "ainz_skeleton_army"
  | "heroic_relics";

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

export interface MinionTransformSnapshot {
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
  silenced: boolean;
  divineShield: boolean;
  stolenPassiveFrom: string | null;
  stolenPassiveText: string | null;
  gainedEffects: Array<{ effectId: EffectId; timing: "passive" | "ongoing"; text: string }>;
}

export interface TemporaryMinionTransform {
  kind: "lunar_slime";
  expiresAtTurn: number;
  restoreOnPlayer: PlayerId;
  original: MinionTransformSnapshot;
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
  divineShield: boolean;
  invulnerableUntilTurn: number | null;
  protectedSlot: boolean;
  delayedDestroySource: string | null;
  /** The Ascension Relic strapped to this minion, if any. Dies with it. */
  relic: RelicInstance | null;
  /** A temporary transformation that restores at the named player's next turn. */
  temporaryTransform: TemporaryMinionTransform | null;
  /** Mahoraga: every attacker that has already swung at this minion. */
  attackedBy: string[];
  /** APR: this minion may never attack again. */
  attackLocked: boolean;
  /** APR: the lock expires after the minion misses two of its own turns. */
  attackLockedUntilTurn: number | null;
  /** Kento Nanami: the instance that marked this minion for death. */
  markedBy: string | null;
  /** Shigaraki: the turn on which the mark becomes lethal. */
  markedForDeathAtTurn?: number | null;
  /** Doctor Strange: temporary untargetability and damage immunity. */
  untargetableUntilTurn?: number | null;
  /** Meleoron: the friendly minion protected while this source lives. */
  protectedByMeleoron?: string | null;
  /** GLaDOS: reversible stat/keyword contributions from live aura sources. */
  auraBonuses?: Array<{ sourceId: string; atk: number; hp: number; keywords: Keyword[] }>;
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
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  health: number;
  maxMana: number;
  mana: number;
  coins: number;
  hand: string[];
  board: Array<MinionInstance | null>;
  /** Lelouch: a minion promised to this player at the start of their next turn. */
  pendingControl: { instanceId: string; fromPlayer: PlayerId; dueTurn: number } | null;
  /** Kuma: per-card discounts, keyed by card id. */
  costReductions: Record<string, number>;
  /** Hand-pressure effects: a card this player must play by `dueTurn` or lose. */
  pressured: { cardId: string; dueTurn: number } | null;
  /** Permanent marks on this player's board positions. */
  slotAuras: SlotAura[];
  /** Sans: every minion this player controls swings at random until this turn. */
  confusedUntilTurn: number | null;
  /** Kurogiri: the one full turn in which every swing is random. */
  randomAttacksFromTurn?: number | null;
  randomAttacksUntilTurn?: number | null;
  /** Reusable attached relics may be returned to hand once during this turn. */
  relicMoves: number;
  fatigue: number;
  turnsStarted: number;
}

export type GamePhase = "main" | "drawChoice" | "targeting" | "gameOver";

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
export type SlotAuraId =
  | "random_attacks" // Bill Cipher — a minion here can only attack at random
  | "slot_silence" // Giorno GER — a minion here is silenced the moment it lands
  | "slot_grow_2" // Ultra Instinct Goku — a minion here gains +2/+2 each of your turns
  | "slot_protected" // Neo — minions here cannot be targeted, silenced, or frozen
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
export type RelicId =
  | "none"
  | "double_stats"
  | "immune_magic"
  | "core_strike_3"
  | "bearer_divine_shield"
  | "cleave_adjacent"
  | "double_ongoing"
  | "half_from_nature"
  | "half_from_tech"
  | "double_atk_damage"
  | "half_from_magic"
  | "monster_cell"
  | "philosophers_stone"
  | "capture_kill"
  | "immune_disable"
  | "ongoing_grow_2"
  | "heal_full_now"
  | "cocoon"
  | "ignore_defences"
  | "return_on_death"
  | "untargetable"
  /** Tesseract: the bearer strikes from outside space, so nothing strikes back. */
  | "no_retaliation";

export interface RelicDefinition {
  kind: "relic";
  id: string;
  name: string;
  relicId: RelicId;
  effect: string;
  flavor: string;
  origin: string;
  art: string;
  /** Printed mana cost paid when this relic is played. Infinity Castle has none,
   * hence optional for the legacy data format. */
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
  deck: string[];
  bottomDeck: string[];
  discard: string[];
  drawChoice: DrawChoice | null;
  pendingTarget: PendingTarget | null;
  /** Knov's pocket room entries; optional for backwards-compatible saved/test states. */
  pocketRooms?: PocketRoom[];
  effectQueue: QueuedEffect[];
  winner: PlayerId | "draw" | null;
  players: [PlayerState, PlayerState];
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
  | { type: "choose_draw"; player: PlayerId; choiceIndex: number }
  | { type: "choose_target"; player: PlayerId; choiceIndex: number }
  | { type: "use_coin"; player: PlayerId }
  | { type: "return_relic"; player: PlayerId; slotIndex: number };

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
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  legalActions: GameAction[];
}
