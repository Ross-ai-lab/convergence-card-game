/**
 * Changing a minion's numbers and conditions: buffs, stat overwrites, Silence, Chained
 * and Freeze, and the questions that decide whether a minion is protected from them.
 */
import { traceEffect } from "../trace";
import type {
  CardDefinition,
  EffectId,
  GameEvent,
  GameState,
  MinionInstance,
  PlayerId,
  PlayerState,
} from "../types";
import { CHAIN_TURNS, STARTING_CORE, effectEvent, slotOf } from "./core";
import { hasRelic } from "./relics";
import { hasSlotAura } from "./auras";
import { hiddenByMeleoron, isUntargetable } from "./targeting";
import { maxAttacks } from "./combat";

/** Restore core health without ever exceeding the game's maximum Core health. */
export function restoreCoreHealth(player: PlayerState, amount: number): number {
  const before = Math.min(STARTING_CORE, Math.max(0, player.health));
  player.health = Math.min(STARTING_CORE, before + Math.max(0, amount));
  return player.health - before;
}

/** Reductions consume the temporary attack contribution before the underlying stat. */
export function setMinionAttack(target: MinionInstance, value: number): void {
  let reduction = Math.max(0,target.atk-Math.max(0,value));
  for (const bonus of target.auraBonuses ?? []) {
    const consumed=Math.min(reduction,Math.max(0,bonus.atk));
    bonus.atk-=consumed;bonus.spentAtk=(bonus.spentAtk??0)+consumed;reduction-=consumed;
  }
  target.atk=Math.max(0,value);
}

export function setMinionHealth(target: MinionInstance, maximum: number, current: number): void {
  let reduction=Math.max(0,target.maxHp-maximum);
  for(const bonus of target.auraBonuses??[]) {
    const consumed=Math.min(reduction,Math.max(0,bonus.hp-(bonus.suppressedHp??0)));
    bonus.suppressedHp=(bonus.suppressedHp??0)+consumed;reduction-=consumed;
  }
  target.maxHp=Math.max(1,maximum);target.hp=current;
}

export function reduceMinionHealth(target: MinionInstance, amount: number): void {
  let reduction=amount, wounds=Math.max(0,target.maxHp-target.hp), currentLoss=amount;
  for(const bonus of target.auraBonuses??[]) {
    const capacity=Math.max(0,bonus.hp-(bonus.suppressedHp??0));
    const spent=Math.min(wounds,capacity);wounds-=spent;
    const consumed=Math.min(reduction,capacity);
    currentLoss-=Math.min(spent,consumed);bonus.suppressedHp=(bonus.suppressedHp??0)+consumed;reduction-=consumed;
  }
  target.maxHp=Math.max(1,target.maxHp-amount);target.hp-=currentLoss;
}

export function battlecryRunsAsOngoing(minion: MinionInstance): boolean {
  return (
    hasRelic(minion, "battlecry_to_ongoing") &&
    (minion.effectTiming === "onPlay" || minion.effectTiming === "onPlayAndDeathrattle")
  );
}

export function hasKeyword(card: Pick<CardDefinition | MinionInstance, "keywords">, keyword: string): boolean {
  return card.keywords.some((entry) => entry === keyword);
}

/**
 * Whether Superman's damage cap protects this minion.
 *
 * True for Superman himself whatever his alignment is printed as, and for any
 * Good minion standing on the same board as a live Superman. A silenced or
 * chained Superman protects nobody, which `hasEffect` already answers.
 */
export function supermanCovers(state: GameState, target: MinionInstance): boolean {
  return state.players[target.owner].board.some(
    (minion) =>
      Boolean(minion) &&
      hasEffect(minion!, "superman_damage_cap_3") &&
      (minion!.instanceId === target.instanceId || target.alignment === "Good"),
  );
}

export function hasEffect(minion: MinionInstance, effectId: EffectId): boolean {
  const held = minion.effectId === effectId || minion.gainedEffects.some((effect) => effect.effectId === effectId);
  // A Chained minion is temporarily out of the duel in the same way a
  // Silenced minion is out of the rules text: its passive, aura, immunity and
  // other effect hooks do not answer while the chain counter is running.
  const active = !minion.silenced && minion.chained === 0;
  // Only a TRUE answer counts as the effect having been exercised. Recording
  // every question instead would mark a passive as covered because some other
  // card asked whether this minion had it, which is the opposite of the truth.
  if (held && active) traceEffect(effectId);
  return held && active;
}

/**
 * Whether this minion walks past Taunt and a bodyguard's soak.
 *
 * Meleoron's ally belongs here, not only in `isUntargetable`: the card grants
 * "ignores Taunt AND cannot be targeted", and only the second half was wired,
 * so the hidden ally was still herded into the enemy's Taunt like anyone else.
 * The hiding is Meleoron's, not the ally's, so the ally's own Silence does not
 * cancel it — which is why this sits outside the silence guard.
 */
export function tauntBypassActive(state: GameState, minion: MinionInstance): boolean {
  if (hiddenByMeleoron(state, minion)) return true;
  return !minion.silenced && (hasEffect(minion, "nyan_unerring_attacks") || hasEffect(minion, "black_ops_ignore_taunt"));
}

export function isSlotProtected(state: GameState, minion: MinionInstance): boolean {
  const slot = slotOf(state, minion);
  return slot >= 0 && hasSlotAura(state, minion.owner, slot, "slot_protected");
}

export function hasDumbledoreProtection(state: GameState, target: MinionInstance): boolean {
  return state.players[target.owner].board.some(
    (minion) => minion && hasEffect(minion, "dumbledore_cleanse") && !minion.silenced,
  );
}

export function buffMinion(minion: MinionInstance, atk: number, hp: number): void {
  minion.atk += atk;
  minion.maxHp += hp;
  minion.hp += hp;
}

/**
 * The one place a minion becomes Chained.
 *
 * Fifteen separate lines used to write `chained = Math.max(chained, 2)`, which
 * was fine while nothing watched the transition. The One-Eyed Owl watches it, so
 * "becomes Chained" needs a single definition: the counter rising from zero.
 * Raising an existing chain is not a new one and pays nothing.
 *
 * `turns` MEANS TURNS. It did not until 2 September 2026, and that is the whole
 * story of why Chained and Freeze were the same card: the counter is spent at
 * the START of a turn, before attacks are offered, so a counter of 1 ticked to 0
 * and the minion swung that same turn. One meant zero, two meant one, and
 * Queen's Cocoon — which asked for one — cost its bearer nothing whatsoever.
 * The +1 is that off-by-one, paid once, here.
 *
 * A minion that ARRIVES Chained does not come through this function: it is born
 * with the counter set in `createMinion`, and it is asleep on the turn it lands,
 * so that turn is already one of the two it loses. Both routes cost a player the
 * same thing — two turns in which the minion does nothing.
 */
export function applyChain(_state: GameState, target: MinionInstance, _events: GameEvent[], turns = CHAIN_TURNS): void {
  // The One-Eyed Owl payout used to live here. It now runs off the
  // end-of-action diff in `feedAfflictionWatchers`, because the card watches
  // Freeze and Silence as well and those arrive by routes this function never
  // sees.
  if (_state.heroPowers[target.owner] === "conquest_no_retreat") return;
  target.chained = Math.max(target.chained, turns + 1);
}

/**
 * Thaws every minion that spent this whole turn frozen. Only those flagged at
 * turn start qualify, so a minion frozen mid-turn (King's freeze_attacker, say)
 * still owes a full turn and is not let off by the turn simply ending.
 */
export function thawServed(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  for (const minion of state.players[playerId].board) {
    if (!minion || !minion.thawPending) continue;
    minion.frozen = false;
    minion.thawPending = false;
    events.push({ kind: "effect", text: `${minion.name} thaws.`, player: playerId, instanceId: minion.instanceId });
  }
}

export function applyFreeze(state: GameState, source: MinionInstance, target: MinionInstance, events: GameEvent[]): void {
  if (isSlotProtected(state, target) || !canDisable(state, source.owner, target, "freeze")) {
    events.push(effectEvent(`${target.name} resists Freeze.`, target));
    return;
  }
  target.frozen = true;
  target.attacksUsed = maxAttacks(target);
  events.push(effectEvent(`${source.name} freezes ${target.name}.`, source));
}

type DisableKind = "other" | "silence" | "freeze" | "chain";

/**
 * Silences a minion, and unwinds the stat GIFTS it is carrying.
 *
 * Silence used to be purely about text: printed effects and keywords went away
 * and the stat line stayed exactly where the enemy had pushed it. That made
 * Silence a non-answer against the growth cards, which are the cards it most
 * obviously should answer — a 1/1 pumped to 10/6 by its own engine lost every
 * future payment and kept every payment already made, so the board barely
 * changed. Silence now takes the growth back with the text.
 *
 * It moves in ONE direction. Anything that pushed a minion BELOW its printed
 * line is a curse rather than a gift, and Silence is not a cleanse, so a minion
 * nerfed to 1 ATK stays at 1 ATK. The rule is a clamp toward the printed stats
 * from above, never a restore from below.
 *
 * Aura contributions are deliberately not part of this arithmetic. They are
 * re-derived from the live board on every refresh, so removing one here would
 * simply be handed back a moment later; `suppressAuraBuffsOnSilenced` cancels
 * the positive half of them after each refresh instead.
 */
function stripStatBuffs(minion: MinionInstance): void {
  const auraAtk = (minion.auraBonuses ?? []).reduce((total, bonus) => total + bonus.atk, 0);
  const auraHp = (minion.auraBonuses ?? []).reduce((total, bonus) => total + bonus.hp - (bonus.suppressedHp ?? 0), 0);

  const grantedAtk = minion.atk - auraAtk - minion.baseAtk;
  if (grantedAtk > 0) minion.atk = Math.max(0, minion.atk - grantedAtk);

  const grantedHp = minion.maxHp - auraHp - minion.baseHp;
  if (grantedHp > 0) {
    minion.maxHp = Math.max(1, minion.maxHp - grantedHp);
    minion.hp = Math.min(minion.hp, minion.maxHp);
  }
}

/**
 * The one way a minion becomes Silenced. Every caller goes through here so the
 * buff-stripping cannot be forgotten at one of the nine places that silence
 * something, and so re-silencing an already-silenced minion is free rather than
 * clamping it a second time.
 *
 * `permanent` is false for the ONE silence in the game that is an aura rather
 * than an event: Gojo's, which lifts the moment he leaves the board and whose
 * card says so in as many words. Taking a minion's growth away for good on a
 * silence that is explicitly temporary would make Gojo the strongest removal
 * card in the deck by accident. The aura's positive stat contributions are
 * still cancelled while it holds — `suppressAuraBuffsOnSilenced` does that, and
 * hands them straight back when the aura ends, which is the behaviour the card
 * describes.
 */
export function applySilence(minion: MinionInstance, permanent = true): void {
  if (permanent && !minion.silenced) stripStatBuffs(minion);
  minion.silenced = true;
}

export function canDisable(
  state: GameState,
  _sourceOwner: PlayerId,
  target: MinionInstance,
  kind: DisableKind = "other",
): boolean {
  if (isUntargetable(state, target)) return false;
  // A blanket `immune_disable` check used to sit here labelled "Anti-magic
  // Mask". The Mask is `immune_freeze_chain` and is answered two lines down;
  // no relic has ever carried `immune_disable`, so the check was never true.
  if (kind === "silence" && hasRelic(target, "immune_silence")) return false;
  if ((kind === "freeze" || kind === "chain") && hasRelic(target, "immune_freeze_chain")) return false;
  if (state.heroPowers[target.owner] === "conquest_no_retreat" && (kind === "silence" || kind === "freeze" || kind === "chain")) return false;
  if (hasDumbledoreProtection(state, target)) return false;
  return true;
}

export function buffAllAllies(
  player: PlayerState,
  source: MinionInstance,
  predicate: (minion: MinionInstance) => boolean,
  atk: number,
  hp: number,
  includeSelf: boolean,
): void {
  for (const minion of player.board) {
    if (minion && predicate(minion) && (includeSelf || minion.instanceId !== source.instanceId)) {
      buffMinion(minion, atk, hp);
    }
  }
}
