/**
 * Prompts: which effects ask their controller to choose, what they may choose, and
 * resuming an effect once the answer arrives.
 */
import { isRelicCard } from "../types";
import { heroPowerDefinition } from "../hero-powers";
import type {
  EffectId,
  GameEvent,
  GameState,
  HandOption,
  LabelOption,
  MinionInstance,
  PlayerId,
  PlayableCard,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
} from "../types";
import { boardSize, opponent, type CardLibrary } from "./core";
import {
  attachedRelics,
  canEquipRelicToBearer,
  hasAnyRelic,
  hasFreeRelicSlot,
  triggerRelicDiscoveries,
} from "./relics";
import { battlecryRunsAsOngoing, hasEffect, hasKeyword, isSlotProtected } from "./stats";
import { campTargetedBy, hasSlotAura } from "./auras";
import { discoverKeywordMinions, discoverTechCards } from "./cards";
import { resolveHeroPower } from "./hero-power-rules";
import { runEffect } from "../effects/run-effect";

// ---------------------------------------------------------------------------
// Targeting. Ten cards print the word "Choose" on their face and for a long time
// the engine chose for them — always the leftmost legal minion, which made the
// text a lie and let anyone soak every removal effect in the game by parking
// junk in slot 0. These effects now stop and ask their controller.
//
// Effects NOT listed here keep auto-targeting on purpose: board-wide effects,
// "the weakest"/"the costliest" effects whose text already names the victim, and
// self-only effects. A listed board effect still opens its prompt with exactly
// one legal target, so the player can aim deliberately instead of accepting an
// invisible automatic choice. Hand and labelled choices may auto-resolve when
// only one answer exists.
// ---------------------------------------------------------------------------
interface TargetSpec {
  /**
   * board = point at a minion · slot = point at a board POSITION, occupied or
   * not · hand = point at a card in a hand · option = pick a value.
   */
  kind?: "board" | "slot" | "hand" | "option" | "boardOrCore";
  side: "enemy" | "friendly" | "any";
  prompt: string;
  /** Which minions may be picked. `source` is excluded unless includeSelf is set. */
  filter?: (minion: MinionInstance, source: MinionInstance) => boolean;
  handFilter?: (card: PlayableCard, index: number) => boolean;
  includeSelf?: boolean;
  /** Preconditions checked BEFORE prompting, so the effect never asks then fizzles. */
  enabled?: (state: GameState, source: MinionInstance) => boolean;
  /** kind:"option" only — the labelled values on offer. */
  values?: LabelOption[] | ((state: GameState, source: MinionInstance, library: CardLibrary) => LabelOption[]);
  /** Who answers the prompt. Bargains are offered to the opponent. */
  chooser?: "source" | "opponent";
  /** kind:"boardOrCore" only — append the enemy core as one legal choice. */
  coreOption?: boolean;
}

export const TARGETED_EFFECTS: Partial<Record<EffectId, TargetSpec>> = {
  strange_bargain: {
    kind: "option",
    side: "enemy",
    chooser: "opponent",
    prompt: "Choose Doctor Strange's bargain",
    values: [
      { label: "Lose 10 Core HP", value: "core_hp" },
      { label: "Lose a random minion", value: "random_minion" },
      { label: "Lose 5 mana next turn", value: "mana" },
    ],
  },
  dark_dimension_banish: { side: "enemy", prompt: "Choose an enemy minion to banish to the Dark Dimension" },
  // Chosen, not random, and no longer a Deathrattle as well (owner's ruling,
  // 2 September 2026). `campTargetedBy` rather than an exact match, so an ALL
  // minion is a legal victim.
  light_yagami_nature_kill: {
    side: "enemy",
    prompt: "Destroy an enemy minion",
  },
  death_star_mark: { kind: "boardOrCore", side: "enemy", prompt: "Mark an enemy minion or the enemy core", coreOption: true },
  stasis_enemy: { side: "enemy", prompt: "Choose an enemy minion to put into stasis" },
  vader_chain_or_destroy: { side: "enemy", prompt: "Choose an enemy minion for Darth Vader" },
  set_hp_1: { side: "enemy", prompt: "Set an enemy minion's HP to 1" },
  copy_minion_to_hand: {
    side: "any",
    prompt: "Choose a minion to copy into your hand",
    includeSelf: true,
    filter: (m) => !m.cardId.startsWith("token:"),
  },
  freeze_and_weaken: { side: "enemy", prompt: "Freeze an enemy and halve its ATK" },
  damage_enemy_1: { side: "enemy", prompt: "Deal 1 damage to an enemy minion" },
  silence_enemy: { side: "enemy", prompt: "Silence an enemy minion", filter: (m) => !m.silenced },
  batman_gadget_choice: { side: "enemy", prompt: "Choose an enemy minion for Batman" },
  freeze_and_silence_enemy: { side: "enemy", prompt: "Freeze and silence an enemy minion" },
  destroy_enemy_taunt: { side: "enemy", prompt: "Destroy an enemy Taunt minion", filter: (m) => hasKeyword(m, "Taunt") },
  godrick_graft: { side: "friendly", prompt: "Kill a friendly minion and gain its stats and effects" },
  destroy_damaged_enemy: { side: "enemy", prompt: "Destroy a wounded enemy", filter: (m) => m.hp < m.maxHp },
  consume_tech_4_hp: {
    side: "enemy",
    prompt: "Consume an enemy Tech minion with 4 HP or lower",
    filter: (m) => campTargetedBy(m, "Tech") && m.hp <= 4,
  },
  consume_nature_4_hp: {
    side: "enemy",
    prompt: "Consume an enemy Nature minion with 4 HP or lower",
    filter: (m) => campTargetedBy(m, "Nature") && m.hp <= 4,
  },
  // --- friendly side ---
  neutral_double_atk_hp_1: {
    side: "friendly",
    prompt: "Choose another friendly Neutral minion",
    filter: (m) => m.alignment === "Neutral",
  },
  meleoron_protect_ally: { side: "friendly", prompt: "Choose a friendly minion to hide", includeSelf: false },
  protect_slot: { kind: "slot", side: "friendly", prompt: "Protect a friendly minion board slot" },
  bounce_friendly: { side: "friendly", prompt: "Return another friendly minion to your hand", includeSelf: false },
  buff_evil_ally_2: { side: "friendly", prompt: "Give an Evil ally +2/+2", filter: (m) => m.alignment === "Evil" },
  devour_friendly: { side: "friendly", prompt: "Consume one of your own minions" },
  morpheus_choice: {
    kind: "option",
    side: "friendly",
    prompt: "Choose an alignment",
    values: [
      { label: "Red Pill — Good", value: "good" },
      { label: "Blue Pill — Evil", value: "evil" },
    ],
  },
  aladdin_wish: {
    kind: "option",
    side: "friendly",
    prompt: "Make a wish",
    values: [
      { label: "Give your hero Divine Shield", value: "hero_shield" },
      { label: "Summon a random 3-mana minion", value: "summon_3" },
      { label: "Gain a random Relic", value: "random_relic" },
    ],
  },
  discover_tech_card: {
    kind: "option",
    side: "friendly",
    prompt: "Choose 1 of 3 Tech cards from the deck",
    values: (state, _source, library) =>
      discoverTechCards(state, _source.owner, library).map((card) => ({ label: card.name, value: card.id })),
  },
  discover_random_keyword_minion: {
    kind: "option",
    side: "friendly",
    prompt: "Discover a Taunt, a Divine Shield and a Passive minion",
    values: (state, _source, library) =>
      discoverKeywordMinions(state, _source.owner, library).map((card) => ({ label: card.name, value: card.id })),
  },
  replace_same_cost_random: { side: "any", prompt: "Choose another minion", includeSelf: false },
  // --- the hard cards ---
  copy_minion_effects: { side: "any", prompt: "Choose another minion to become" },
  knov_pocket_room: { side: "friendly", prompt: "Choose a friendly minion for the pocket room", includeSelf: false },
  steal_and_equip_relic: {
    side: "enemy",
    prompt: "Take an enemy minion's Relic",
    filter: (m, source) => hasAnyRelic(m) && attachedRelics(m).some((relic) => canEquipRelicToBearer(relic, source)),
    enabled: (_state, source) => hasFreeRelicSlot(source),
  },
  steal_hand_relic: {
    kind: "hand",
    side: "enemy",
    prompt: "Choose an Relic in the enemy hand to steal",
    handFilter: (card) => isRelicCard(card),
  },
  destroy_relic: { side: "enemy", prompt: "Destroy an enemy minion's Relic", filter: (m) => hasAnyRelic(m) },
  mind_control_2: { side: "enemy", prompt: "Seize an enemy minion with 2 or less HP", filter: (m) => m.hp <= 2 },
  mind_control_enemy: { side: "enemy", prompt: "Gain control of an enemy minion" },
  motoko_kusanagi: {
    side: "enemy",
    prompt: "Take control of an enemy Tech minion with 4 HP or less",
    filter: (m) => campTargetedBy(m, "Tech") && m.hp <= 4 && !m.temporaryControl,
  },
  steal_passive: {
    side: "enemy",
    prompt: "Steal an enemy minion's passive",
    filter: (m) => m.effectTiming === "passive" && m.effectId !== "none",
  },
  bounce_friendly_discount: { side: "friendly", prompt: "Return an ally to your hand at a discount" },
  set_stats_choice: { kind: "slot", side: "enemy", prompt: "Set an enemy minion board slot to 1/1" },
  slot_random_attacks: { kind: "slot", side: "enemy", prompt: "Curse an enemy slot — minions there attack at random, forever" },
  slot_permanent_chain: { kind: "slot", side: "enemy", prompt: "Chain an enemy slot — minions there are Chained, forever" },
  slot_growth_1: { kind: "slot", side: "friendly", prompt: "Bless one of your slots — minions there gain +1/+1 every turn" },
};

/**
 * The prompts whose ANSWER is private when the other seat is the one answering.
 *
 * All six reach into the shared deck and offer three cards nobody else may see,
 * so the log line naming the winner would hand the reader a card they were never
 * shown being offered — and in a shared deck that is a card they might have been
 * about to draw.
 *
 * A NAMED LIST, not a prefix test. The interface used to mask any effect id
 * beginning with `discover_`, which caught three of these six and quietly leaked
 * the other three: Gol D. Roger and Indiana Jones share `choose_relic`, Frieren
 * has her own id, and Morpheus's second prompt is a discover under a name that
 * says nothing about it. Prompts with a visible board consequence — Aladdin's
 * wish, Batman's gadget, Doctor Strange's bargain — are deliberately absent:
 * hiding those would hide something the other player has to be able to read.
 */
export const CONCEALED_CHOICE_EFFECTS: ReadonlySet<EffectId> = new Set<EffectId>([
  "discover_relic_self",
  "discover_tech_card",
  "discover_random_keyword_minion",
  "choose_relic",
  "frieren_relic_discover",
  "morpheus_choice",
]);

function targetOptions(state: GameState, source: MinionInstance, spec: TargetSpec): TargetOption[] {
  if (spec.enabled && !spec.enabled(state, source)) return [];
  const sides: PlayerId[] =
    spec.side === "any"
      ? [source.owner, opponent(source.owner)]
      : [spec.side === "enemy" ? opponent(source.owner) : source.owner];
  const options: TargetOption[] = [];
  for (const ownerId of sides) {
    state.players[ownerId].board.forEach((minion, slot) => {
      if (!minion) return;
      if (isUntargetable(state, minion)) return;
      if (ownerId !== source.owner && !enemyTargetable(state, minion)) return;
      if (ownerId !== source.owner && isProtectedDisableTarget(state, source, minion)) return;
      if (!spec.includeSelf && minion.instanceId === source.instanceId) return;
      if (spec.filter && !spec.filter(minion, source)) return;
      options.push({ owner: ownerId, slot });
    });
  }
  return options;
}

function isProtectedDisableTarget(state: GameState, source: MinionInstance, target: MinionInstance): boolean {
  if (!isSlotProtected(state, target)) return false;
  return new Set<EffectId>([
    "freeze_and_weaken",
    "silence_enemy",
    "freeze_and_silence_enemy",
    "vader_chain_or_destroy",
  ]).has(source.effectId);
}

/** Whether an enemy effect may point at this minion at all. */
export function enemyTargetable(state: GameState, minion: MinionInstance): boolean {
  return !isUntargetable(state, minion);
}

/** Combat can hit a protected board slot; untargetability is the stricter rule
 * that blocks both attacks and effects. */
export function attackTargetable(state: GameState, minion: MinionInstance): boolean {
  return !isUntargetable(state, minion);
}

/** Whether a live Meleoron is currently hiding this minion. */
export function hiddenByMeleoron(state: GameState, minion: MinionInstance): boolean {
  if (!minion.protectedByMeleoron) return false;
  return state.players[minion.owner].board.some(
    (ally) => ally !== null && ally.instanceId === minion.protectedByMeleoron && hasEffect(ally, "meleoron_protect_ally") && !ally.silenced,
  );
}

export function isUntargetable(state: GameState, minion: MinionInstance): boolean {
  if (minion.chained > 0) return true;
  if (minion.untargetableUntilTurn !== null && minion.untargetableUntilTurn !== undefined && minion.untargetableUntilTurn > state.turnNumber) return true;
  return hiddenByMeleoron(state, minion);
}

/** Every position on the chosen side — a slot aura does not need an occupant. */
function slotOptions(state: GameState, source: MinionInstance, spec: TargetSpec): TargetOption[] {
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return Array.from({ length: boardSize }, (_unused, slot) => ({ owner: ownerId, slot }))
    .filter(({ slot }) => !hasSlotAura(state, ownerId, slot, "slot_bound"));
}

/**
 * A minion's OWN effect.
 *
 * A plain read of `effectId` today. It used to mean something more: All for One
 * parked its real effect in `copyRestoreEffectId` while it wore a copied one, so
 * for the length of that resolution a minion's `effectId` could belong to
 * somebody else, and anything reading an effect OFF a minion had to ask for the
 * printed one or it would copy a power that was about to be handed back.
 *
 * That card became a passive on 2 September 2026 and the borrowing machinery was
 * deleted with it. The function is kept as the one name every "read another
 * minion's power" site calls, so if a card ever wears a temporary effect again
 * there is exactly one place to teach about it.
 */
export function printedEffectId(minion: MinionInstance): EffectId {
  return minion.effectId;
}

export function handOptions(state: GameState, source: MinionInstance, spec: TargetSpec, library: CardLibrary): HandOption[] {
  if (spec.enabled && !spec.enabled(state, source)) return [];
  const ownerId = spec.side === "enemy" ? opponent(source.owner) : source.owner;
  return state.players[ownerId].hand
    .map((cardId, index) => ({ owner: ownerId, index, cardId }))
    .filter((option) => {
      const card = library[option.cardId];
      return Boolean(card) && (!spec.handFilter || spec.handFilter(card, option.index));
    });
}

/**
 * Opens a prompt, or resolves straight away when the answer is forced.
 * Returns the chosen answer, or "asked" when the game is now waiting.
 */
export function requestChoice(
  state: GameState,
  source: MinionInstance,
  spec: TargetSpec,
  library: CardLibrary,
  step = 0,
  priorOptions: TargetOption[] = [],
  priorHandOptions: HandOption[] = [],
  priorLabelOptions: LabelOption[] = [],
): ResolvedChoice | "asked" | null {
  const kind = spec.kind ?? "board";
  const boardList =
    kind === "board" || kind === "boardOrCore"
      ? targetOptions(state, source, spec)
      : kind === "slot"
        ? slotOptions(state, source, spec)
        : [];
  const handList = kind === "hand" ? handOptions(state, source, spec, library) : [];
  const labelList =
    kind === "option"
      ? typeof spec.values === "function"
        ? spec.values(state, source, library)
        : (spec.values ?? [])
      : [];
  const coreOption = kind === "boardOrCore" && spec.coreOption === true;
  const count = boardList.length + handList.length + labelList.length + (coreOption ? 1 : 0);
  if (count === 0) return null;
  if (count === 1 && kind !== "board" && kind !== "slot" && kind !== "boardOrCore") {
    if (kind === "hand") return { kind: "hand", hand: handList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
    return { kind: "option", option: labelList[0], step, priorOptions, priorHandOptions, priorLabelOptions };
  }
  // The escape hatch belongs only to the first prompt. Once a multi-step
  // effect has accepted an earlier choice, returning the source would refund
  // a card whose effect has already partly resolved.
  const cancelPlay =
    step === 0 && priorOptions.length === 0 && priorHandOptions.length === 0 && priorLabelOptions.length === 0
      ? state.pendingPlayCancel ?? state.pendingTarget?.cancelPlay
      : undefined;
  state.pendingTarget = {
    kind,
    player: spec.chooser === "opponent" ? opponent(source.owner) : source.owner,
    sourceInstanceId: source.instanceId,
    sourceOwner: source.owner,
    sourceName: source.name,
    sourceCardId: source.cardId,
    effectId: source.effectId,
    prompt: spec.prompt,
    options: boardList,
    handOptions: handList,
    labelOptions: labelList,
    coreOption,
    step,
    priorOptions,
    priorHandOptions,
    priorLabelOptions,
    ...(cancelPlay ? { cancelPlay } : {}),
  };
  state.phase = "targeting";
  return "asked";
}

/** Cancel a just-played target-card or targetable Hero Power before it resolves. */
export function cancelPendingTarget(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const pending = state.pendingTarget;
  if (!pending || pending.player !== playerId) return;

  const heroPowerCancel = pending.cancelHeroPower;
  if (heroPowerCancel && heroPowerCancel.player === playerId) {
    const player = state.players[playerId];
    player.mana += heroPowerCancel.manaRefund;
    state.heroPowerUsed[playerId] = false;
    state.pendingTarget = null;
    state.pendingPlayCancel = null;
    state.phase = "main";
    const definition = heroPowerDefinition(heroPowerCancel.powerId);
    events.push({
      kind: "info",
      text: `${definition?.name ?? "Hero Power"} cancelled.`,
      player: playerId,
    });
    return;
  }

  const cancel = pending.cancelPlay;
  if (!cancel || cancel.player !== playerId) return;

  const player = state.players[playerId];
  const minion = player.board[cancel.slotIndex];
  if (!minion || minion.instanceId !== cancel.instanceId || minion.cardId !== cancel.cardId) return;

  player.board[cancel.slotIndex] = null;
  player.hand.splice(Math.min(cancel.handIndex, player.hand.length), 0, cancel.cardId);
  player.mana += cancel.manaRefund;
  if (cancel.previousCostReduction === undefined) delete player.costReductions[cancel.cardId];
  else player.costReductions[cancel.cardId] = cancel.previousCostReduction;
  player.pressured = cancel.previousPressured ? { ...cancel.previousPressured } : null;
  state.pendingTarget = null;
  state.pendingPlayCancel = null;
  state.phase = "main";
  events.push({
    kind: "draw",
    text: `${minion.name} returns to ${player.name}'s hand.`,
    player: playerId,
    cardId: cancel.cardId,
    instanceId: cancel.instanceId,
    motion: "return",
  });
}

/**
 * Resolves the target a player just named, then drains whatever was left of the
 * start-of-turn effect queue behind it.
 */
export function chooseTarget(state: GameState, choiceIndex: number, library: CardLibrary, events: GameEvent[]): void {
  const pending = state.pendingTarget;
  if (!pending) return;
  const queuedRelicSources = pending.queuedRelicSources ?? [];
  let answer: ResolvedChoice | null = null;
  if ((pending.kind === "board" || pending.kind === "slot" || pending.kind === "boardOrCore") && pending.options[choiceIndex]) {
    answer = {
      kind: "board",
      target: pending.options[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "boardOrCore" && pending.coreOption && choiceIndex === pending.options.length) {
    answer = {
      kind: "core",
      owner: opponent(pending.sourceOwner),
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "hand" && pending.handOptions[choiceIndex]) {
    answer = {
      kind: "hand",
      hand: pending.handOptions[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  } else if (pending.kind === "option" && pending.labelOptions[choiceIndex]) {
    answer = {
      kind: "option",
      option: pending.labelOptions[choiceIndex],
      step: pending.step,
      priorOptions: pending.priorOptions,
      priorHandOptions: pending.priorHandOptions,
      priorLabelOptions: pending.priorLabelOptions,
    };
  }
  state.pendingTarget = null;
  state.phase = "main";
  if (answer) {
    if (pending.heroPowerId) {
      resolveHeroPower(state, pending.sourceOwner, pending.heroPowerId, answer, library, events);
    } else {
    const slotIndex = state.players[pending.sourceOwner].board.findIndex(
      (minion) => minion?.instanceId === pending.sourceInstanceId,
    );
    const source = slotIndex >= 0 ? state.players[pending.sourceOwner].board[slotIndex] : null;
    if (source) {
      runEffect(state, source, slotIndex, library, events, answer);
    }
    }
  }
  if (state.phase === "main") {
    if (queuedRelicSources.length > 0) {
      triggerRelicDiscoveries(state, pending.sourceOwner, queuedRelicSources, library, events);
    }
    if (state.phase === "main") processEffectQueue(state, library, events);
  }
}

/**
 * Runs queued start-of-turn effects one at a time, stopping the moment one asks
 * for a target so the rest do not fire behind an open prompt.
 */
export function processEffectQueue(state: GameState, library: CardLibrary, events: GameEvent[]): void {
  while (state.effectQueue.length > 0) {
    const entry = state.effectQueue[0];
    state.effectQueue.shift();
    const board = state.players[entry.owner].board;
    const slotIndex = board.findIndex((minion) => minion?.instanceId === entry.instanceId);
    if (slotIndex < 0) continue;
    const minion = board[slotIndex];
    if (!minion || minion.silenced || minion.chained > 0 || minion.frozen) continue;
    if (
      minion.effectTiming !== "ongoing" &&
      minion.effectTiming !== "onPlayAndOngoing" &&
      !battlecryRunsAsOngoing(minion)
    ) continue;
    if (minion.gainedEffects.some((effect) => effect.timing === "ongoing")) {
      const ownEffectId = minion.effectId;
      for (const gained of minion.gainedEffects.filter((effect) => effect.timing === "ongoing")) {
        minion.effectId = gained.effectId;
        if (runEffect(state, minion, slotIndex, library, events)) {
          minion.effectId = ownEffectId;
          return;
        }
      }
      minion.effectId = ownEffectId;
    }
    if (runEffect(state, minion, slotIndex, library, events)) return;
  }
}
