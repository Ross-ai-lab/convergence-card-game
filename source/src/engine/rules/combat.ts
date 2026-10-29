/**
 * Attacks: who may attack what, simultaneous combat, and what a fight pays out.
 */
import type { GameEvent, GameState, MinionInstance, PlayerId } from "../types";
import {
  applyChain,
  buffMinion,
  canDisable,
  hasEffect,
  hasKeyword,
  isSlotProtected,
  tauntBypassActive,
} from "./stats";
import { attackTargetable } from "./targeting";
import { boardSize, effectEvent, opponent, slotOf } from "./core";
import { copyPersistentMinionTraits } from "./minions";
import { dealCoreDamage, dealMinionDamage } from "./damage";
import { hasRelic } from "./relics";
import { hasSlotAura } from "./auras";
import { putCardInHand } from "./cards";
import { rollInt } from "./random";

/**
 * What one minion's blow is worth against one particular victim, before any of
 * that victim's own defences.
 *
 * Shared by the declared attack and by the retaliation, because none of these
 * cards says "when attacking". RoboCop prints "Deal double damage against Evil
 * minions" and Doom Slayer prints the same; both used to deal plain ATK the
 * moment they were the one being swung at, which is half of every fight they
 * are in. Combat here is simultaneous, so a rule with no attack clause has to
 * apply to both blows.
 *
 * `hasEffect` already answers false for a silenced or chained minion, so there
 * is no silence guard to repeat.
 */
function strikeDamage(striker: MinionInstance, victim: MinionInstance): number {
  let damage = striker.atk;
  if (hasEffect(striker, "robocop_evil_bonus") && victim.alignment === "Evil") damage *= 2;
  if (hasEffect(striker, "doom_evil_slayer") && victim.alignment === "Evil") damage *= 2;
  return damage;
}

export function attackMinion(
  state: GameState,
  playerId: PlayerId,
  attackerSlot: number,
  targetSlot: number,
  events: GameEvent[],
): void {
  const attacker = state.players[playerId].board[attackerSlot];
  const defenderId = opponent(playerId);
  const defender = state.players[defenderId].board[targetSlot];
  if (!attacker || !defender) return;
  const attackerId = attacker.instanceId;
  events.push({ kind: "combat", text: `${attacker.name} attacks ${defender.name}.`, player: playerId, instanceId: attacker.instanceId });
  defender.attackedBy.push(attackerId);
  // Ea is already in `attacker.atk`: it doubles the printed ATK once, when it is
  // equipped. A second doubling used to be applied here against a relic id
  // (`double_atk_damage`) that no relic has ever carried, so it never fired.
  const outgoing = strikeDamage(attacker, defender);
  const alreadyAdapted =
    defender.campImmunity !== null &&
    defender.campImmunity.camp === attacker.camp &&
    defender.campImmunity.untilTurn > state.turnNumber;
  // Simultaneous combat, Hearthstone-style: the defender ALWAYS retaliates with
  // its attack value, even if the blow kills it (owner ruling, 2026-07-06).
  dealMinionDamage(state, defenderId, targetSlot, outgoing, attacker, events, false, new Set(), true, true);
  // Infinity Stone: the swing carries into the two neighbours of the target.
  if (hasRelic(attacker, "cleave_adjacent")) {
    for (const side of [targetSlot - 1, targetSlot + 1]) {
      if (side >= 0 && side < boardSize && state.players[defenderId].board[side]) {
        dealMinionDamage(state, defenderId, side, outgoing, attacker, events, true, new Set(), true, true);
      }
    }
  }
  // Simultaneous combat has NO exception in the current roster. A
  // `no_retaliation` relic hook used to sit here, guarding a branch that also
  // printed "strikes from outside space" into the log; no relic has ever
  // granted it, so neither the skip nor the line could happen. Re-adding it is
  // a two-line change on the day a relic actually prints it.
  //
  // Retaliation is combat damage, but it is not an attack declared by the
  // attacker, so defensive attack-immunity relics must not absorb this return
  // blow when their bearer started the fight.
  let retaliation = strikeDamage(defender, attacker);
  // Shibukawa's doubling is the one multiplier that IS about defending, so it
  // belongs here rather than in the shared calculation.
  if (hasEffect(defender, "shibukawa_defense_damage_2x")) retaliation *= 2;
  dealMinionDamage(state, playerId, attackerSlot, retaliation, defender, events, false, new Set(), true, false);
  const survivingAttacker = state.players[playerId].board[attackerSlot];
  const attackerAlive = Boolean(survivingAttacker && survivingAttacker.instanceId === attackerId);
  const defenderAlive = state.players[defenderId].board.some((minion) => minion?.instanceId === defender.instanceId);
  if (attackerAlive && survivingAttacker) {
    survivingAttacker.attacksUsed += 1;
    if (!survivingAttacker.silenced) {
      if (hasEffect(survivingAttacker, "on_survive_buff_1")) {
        buffMinion(survivingAttacker, 1, 1);
        // Said out loud, like the defender's copy of this two blocks down. It
        // was the one stat change in combat that happened in silence.
        events.push(effectEvent(`${survivingAttacker.name} survives combat and gains +1/+1.`, survivingAttacker));
      }
      if (!defenderAlive && hasEffect(survivingAttacker, "on_kill_buff_1")) {
        buffMinion(survivingAttacker, 1, 1);
        events.push(effectEvent(`${survivingAttacker.name} takes the kill and gains +1/+1.`, survivingAttacker));
      }
      if (!defenderAlive && hasEffect(survivingAttacker, "doom_evil_slayer") && defender.alignment === "Evil") {
        survivingAttacker.hp = Math.min(survivingAttacker.maxHp, survivingAttacker.hp + 3);
        events.push(effectEvent(`${survivingAttacker.name} heals 3 after slaying Evil.`, survivingAttacker));
      }
    }
    // Allspark Cube: the kill is taken home as a card.
    if (!defenderAlive && hasRelic(survivingAttacker, "capture_kill")) {
      putCardInHand(state, playerId, defender.cardId, events, defender.instanceId);
      events.push(effectEvent(`${survivingAttacker.name} captures ${defender.name}.`, survivingAttacker));
    }
  }
  // The defender's own kill reactions. A minion that kills its attacker on the
  // retaliation has killed a minion, and every OTHER kill hook in the engine
  // already treats it that way — Grievous, Meruem, Darkwing and Aizen all read
  // the killer out of `destroyAtSlot`, which the retaliation path fills in.
  // Zoro's "+1/+1 after killing a minion" was the odd one out and only ever
  // paid on his own swing.
  if (defenderAlive && !attackerAlive) {
    if (hasEffect(defender, "on_kill_buff_1")) {
      buffMinion(defender, 1, 1);
      events.push(effectEvent(`${defender.name} kills its attacker and gains +1/+1.`, defender));
    }
    if (hasEffect(defender, "doom_evil_slayer") && attacker.alignment === "Evil") {
      defender.hp = Math.min(defender.maxHp, defender.hp + 3);
      events.push(effectEvent(`${defender.name} heals 3 after slaying Evil.`, defender));
    }
    if (hasRelic(defender, "capture_kill")) {
      putCardInHand(state, defenderId, attacker.cardId, events, attacker.instanceId);
      events.push(effectEvent(`${defender.name} captures ${attacker.name}.`, defender));
    }
  }
  // Defender reactions to being attacked (the strike landed even if it died).
  if (!defender.silenced) {
    if (
      hasEffect(defender, "chain_attacker") &&
      attackerAlive &&
      survivingAttacker &&
      !isSlotProtected(state, survivingAttacker) &&
      canDisable(state, defender.owner, survivingAttacker, "chain")
    ) {
      // Chained = 2 is one skipped owner turn in this engine: the counter is
      // decremented at turn start before attacks are offered.
      applyChain(state, survivingAttacker, events);
      events.push(effectEvent(`${defender.name} chains ${survivingAttacker.name}.`, defender));
    }
    // Knuckle: the attacker misses its next two owner turns.
    if (hasEffect(defender, "attack_lock") && attackerAlive && survivingAttacker) {
      survivingAttacker.attackLocked = true;
      survivingAttacker.attackLockedUntilTurn = state.turnNumber + 6;
      events.push(effectEvent(`${defender.name} stops ${survivingAttacker.name} for two turns.`, defender));
    }
    // Doomsday: it adapts to whatever hit it and shrugs that Camp off for three turns.
    // A hit that is already absorbed by Doomsday's current adaptation must not
    // restart the timer, or a repeated same-Camp attacker could never wear it off.
    if (hasEffect(defender, "camp_immunity_on_hit") && defenderAlive && !alreadyAdapted) {
      // turnNumber advances once per player's turn. The attacking player gets
      // another turn after two half-turns, so three of that player's turns end
      // eight half-turns after the hit.
      defender.campImmunity = { camp: attacker.camp, untilTurn: state.turnNumber + 8 };
      events.push(effectEvent(`${defender.name} adapts to ${attacker.camp}.`, defender));
    }
    if (defenderAlive && hasEffect(defender, "on_survive_buff_1")) {
      buffMinion(defender, 1, 1);
      events.push(effectEvent(`${defender.name} survives combat and gains +1/+1.`, defender));
    }
  }
  // Kill rewards are paid only once the whole exchange is over — see
  // `resolveKillRewards` for why, and for which reactions are NOT rewards.
  resolveKillRewards(state, playerId, attackerSlot, defender, defenderAlive, events);
  resolveKillRewards(state, defenderId, targetSlot, attacker, attackerAlive, events);

  // Yoriichi Type Zero: any friendly that walks out of combat is sharpened.
  awardSurvivors(state, events, [attackerId, defender.instanceId]);
  // Last, so the chain lands on an attacker that has already taken its blow.
  triggerTenCommandments(state, attacker, events, attackerAlive);
}

/**
 * Everything a minion is PAID for making a kill, resolved once the whole
 * exchange is over.
 *
 * Owner ruling: a kill reward lands after the counter-blow, never before it.
 * These used to fire from inside the victim's death, which happens midway
 * through a simultaneous fight — so a killer was healed, enlarged or handed a
 * keyword a beat before the blow that was already coming at it. Pillar Men made
 * it obvious (mended to full, then knocked straight back down), but Tai Lung,
 * Meruem and Grievous all bought survival with a reward they had not finished
 * earning.
 *
 * Death REACTIONS that are not rewards stay where they are: Nito and John Wick
 * pay out on any minion dying anywhere, and are usually nowhere near the fight.
 *
 * Takes a slot rather than an instance because the exchange may have removed or
 * replaced the minion, and takes `victimSurvived` from the caller so one
 * function serves both sides of a simultaneous fight.
 */
function resolveKillRewards(
  state: GameState,
  owner: PlayerId,
  slot: number,
  victim: MinionInstance,
  victimSurvived: boolean,
  events: GameEvent[],
): void {
  if (victimSurvived) return;
  const killer = state.players[owner].board[slot];
  if (!killer) return;

  if (hasEffect(killer, "pillar_men_kill_heal") && killer.hp < killer.maxHp) {
    killer.hp = killer.maxHp;
    events.push(effectEvent(`${killer.name} is made whole by the kill.`, killer));
  }

  if (hasEffect(killer, "tai_lung_kill_keywords")) {
    buffMinion(killer, 1, 1);
    // Chained is the one keyword never inherited: it is the price printed on
    // Tai Lung's own card, not a prize for winning a fight.
    const taken = victim.keywords.filter(
      (keyword) => keyword !== "Chained" && !killer.keywords.includes(keyword),
    );
    killer.keywords.push(...taken);
    if (taken.includes("Divine Shield")) killer.divineShield = true;
    events.push(
      effectEvent(
        `${killer.name} takes ${victim.name}'s measure (+1/+1${taken.length ? ` and ${taken.join(", ")}` : ""}).`,
        killer,
      ),
    );
  }

  if (hasEffect(killer, "meruem_kill_copy")) {
    buffMinion(killer, 1, 1);
    const copied = copyPersistentMinionTraits(killer, victim);
    events.push(
      effectEvent(
        `${killer.name} adapts after killing ${victim.name} (+1/+1${copied ? " and its effects" : ""}).`,
        killer,
      ),
    );
  }

  if (hasEffect(killer, "grievous_on_kill_atk") && victim.atk > 0) {
    killer.atk += victim.atk;
    events.push(effectEvent(`${killer.name} permanently gains ${victim.atk} ATK from killing ${victim.name}.`, killer));
  }
}

/** Yoriichi's payoff — every friendly participant that survives gains +1/+1. */
function awardSurvivors(state: GameState, events: GameEvent[], fought: string[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    const board = state.players[playerId].board;
    const hasActiveMentor = board.some((minion) => minion && hasEffect(minion, "survivor_buff") && !minion.silenced);
    if (!hasActiveMentor) continue;
    for (const minion of board) {
      if (!minion || !fought.includes(minion.instanceId)) continue;
      buffMinion(minion, 1, 1);
      events.push(effectEvent(`${minion.name} survives and grows +1/+1.`, minion));
    }
  }
}

export function attackCore(state: GameState, playerId: PlayerId, attackerSlot: number, events: GameEvent[]): void {
  const attacker = state.players[playerId].board[attackerSlot];
  if (!attacker) return;
  const defenderId = opponent(playerId);
  // Exactly its ATK — no floor, no retaliation, and no relic bonus. Two used to
  // be applied here, `double_atk_damage` and `core_strike_3`, and neither id
  // belongs to a relic: Ea doubles the printed ATK on equip instead, and the One
  // Ring is a rescue, not a core-damage bonus.
  const damage = attacker.atk;
  const landed = dealCoreDamage(state, defenderId, damage, events, attacker);
  attacker.attacksUsed += 1;
  if (landed) {
    events.push({ kind: "damage", text: `${attacker.name} strikes the core for ${damage}.`, player: playerId, instanceId: attacker.instanceId });
  }
  triggerTenCommandments(state, attacker, events, true);
}

/**
 * Chains the first enemy minion to attack this turn.
 *
 * Called AFTER the swing has resolved, exactly like Hypnos's `chain_attacker`.
 * Running it first looked equivalent and was not: a Chained minion is protected
 * from combat damage (`canDamage`), so chaining the attacker before the blow
 * landed made the punishment cancel the defender's own retaliation — attacking
 * into Ten Commandments cost the attacker nothing at all.
 *
 * The trigger is spent whether or not the attacker is still standing: it fired,
 * and the next attacker this turn is no longer the first one.
 */
function triggerTenCommandments(
  state: GameState,
  attacker: MinionInstance,
  events: GameEvent[],
  attackerAlive: boolean,
): void {
  const source = state.players[opponent(attacker.owner)].board.find(
    (minion) =>
      minion &&
      !minion.silenced &&
      hasEffect(minion, "ten_commandments_first_attack") &&
      minion.commandmentsTriggeredAtTurn !== state.turnNumber,
  );
  if (!source) return;
  source.commandmentsTriggeredAtTurn = state.turnNumber;
  if (!attackerAlive) return;
  if (isSlotProtected(state, attacker) || !canDisable(state, source.owner, attacker, "chain")) return;
  applyChain(state, attacker, events);
  events.push(effectEvent(`${source.name} chains the first attacker, ${attacker.name}.`, source));
}

// ---------------------------------------------------------------------------
// Forced-random attacks. Three sources, one question: does this minion get to
// choose? Legality stays honest — every normal target is still offered — and the
// swing is redirected at resolution, so the roll happens once, in the engine,
// with the seeded generator.
// ---------------------------------------------------------------------------
export function attacksRandomly(state: GameState, attacker: MinionInstance): boolean {
  const slot = slotOf(state, attacker);
  if (slot >= 0 && hasSlotAura(state, attacker.owner, slot, "random_attacks")) return true;
  const randomFrom = state.players[attacker.owner].randomAttacksFromTurn;
  const randomUntil = state.players[attacker.owner].randomAttacksUntilTurn;
  if (randomFrom !== null && randomFrom !== undefined && randomUntil !== null && randomUntil !== undefined) {
    if (state.turnNumber >= randomFrom && state.turnNumber <= randomUntil) return true;
  }
  return false;
}

/**
 * Picks where a blind swing actually lands. Guards still hold — Taunt and a
 * bodyguard narrow the pool before the roll, rather than being bypassed by it.
 */
export function randomAttackTarget(state: GameState, attacker: MinionInstance): number | "core" | null {
  const enemy = state.players[opponent(attacker.owner)];
  const ignoresGuards = hasRelic(attacker, "ignore_defences");
  const ignoresTaunt = tauntBypassActive(state, attacker);
  const taunts = enemy.board
    .map((minion, slot) => ({ minion, slot }))
    .filter(({ minion }) => minion && attackTargetable(state, minion) && hasKeyword(minion, "Taunt") && !minion.silenced)
    .map(({ slot }) => slot);
  let pool: number[];
  if (!ignoresGuards && !ignoresTaunt && taunts.length) pool = taunts;
  else {
    pool = enemy.board
      .map((minion, slot) => ({ minion, slot }))
      .filter(({ minion }) => minion && attackTargetable(state, minion))
      .map(({ slot }) => slot);
  }
  const legal = pool.filter((slot) => {
    const target = enemy.board[slot];
    return target ? canDeclareAttack(state, attacker, target) : false;
  });
  if (legal.length > 0) return legal[rollInt(state, legal.length)];
  // Nothing on the board it may hit — the core is the only thing left.
  return hasHighestAttackRestriction(state, attacker) || yujiroCoreAttackRestricted(state, attacker) || (!ignoresGuards && !ignoresTaunt && taunts.length > 0) ? null : "core";
}

/**
 * Whether this player can read the enemy's hand — The Watcher's printed half.
 *
 * Lives here rather than in the component because it is a rule, not a view: the
 * UI used to spell out its own silenced-and-not-chained test beside the effect
 * id, which is `hasEffect`'s job and drifts the moment that rule changes.
 */
export function opponentHandRevealed(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId].board.some((minion) => minion && hasEffect(minion, "watcher_reveal_hand"));
}

export function canDeclareAttack(state: GameState, attacker: MinionInstance, target: MinionInstance): boolean {
  // Mahoraga: it adapts, and no attacker gets a second look at it all game.
  if (hasEffect(target, "attack_once_ever") && !target.silenced && target.attackedBy.includes(attacker.instanceId)) {
    return false;
  }
  if (hasHighestAttackRestriction(state, attacker) && target.atk !== highestEnemyAttack(state, attacker.owner)) {
    return false;
  }
  return true;
}

export function hasHighestAttackRestriction(state: GameState, attacker: MinionInstance): boolean {
  return hasEffect(attacker, "highest_atk_only") && !attacker.silenced && highestEnemyAttack(state, attacker.owner) >= 0;
}

export function yujiroCoreAttackRestricted(state: GameState, attacker: MinionInstance): boolean {
  if (state.heroPowers[opponent(attacker.owner)] !== "yujiro_apex_duel") return false;
  const highest = state.players[attacker.owner].board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .reduce((max, minion) => Math.max(max, minion.atk), -1);
  return highest >= 0 && attacker.atk < highest;
}

function highestEnemyAttack(state: GameState, owner: PlayerId): number {
  const attacks = state.players[opponent(owner)].board
    .filter((minion): minion is MinionInstance => Boolean(minion))
    .map((minion) => minion.atk);
  return attacks.length > 0 ? Math.max(...attacks) : -1;
}

/**
 * Everything that forbids a swing outright, ignoring the turn's own bookkeeping.
 *
 * Split out from `canAttack` because Nine Hashira orders a mass attack that
 * deliberately overrides sleep and the once-a-turn limit but must still respect
 * the cards that simply never attack. Two copies of this list drifted apart:
 * the Hashira loop knew about the Cannot Attack keyword and not about Ragnaros,
 * The Watcher or an Evade body.
 *
 * `hasEffect` already answers false for a silenced or chained minion, so no
 * caller needs its own silence guard around one.
 */
function carrierSuppresses(state: GameState, minion: MinionInstance): boolean {
  return minion.camp === "Tech" && state.players[opponent(minion.owner)].board.some(source => source && hasEffect(source, "carrier_lock_enemy_tech"));
}

export function refreshCarrierLocks(state: GameState): void {
  for (const player of state.players) for (const minion of player.board) {
    if (minion) minion.techAttackSuppressed = carrierSuppresses(state, minion);
  }
}

function attackForbidden(minion: MinionInstance, state?: GameState): boolean {
  if (state ? carrierSuppresses(state, minion) : minion.techAttackSuppressed) return true;
  // ONE rule, read off the keyword. Two cards used to state "Cannot attack" in
  // their prose only and be stopped by an effect-id check here instead, which
  // meant the card face, the keyword column and the engine each had their own
  // answer. Both now carry the keyword.
  if (!minion.silenced && hasKeyword(minion, "Cannot Attack")) return true;
  return minion.attackLocked; // Knuckle has taken this swing until its lock expires
}

export function canAttack(minion: MinionInstance, state?: GameState): boolean {
  // A 0-ATK minion may still declare an attack; it simply deals no damage.
  return readySwings(minion, state) > 0;
}

/**
 * How many attacks this minion could still declare this turn.
 *
 * Exported so the bot's lethal check reads the SAME rule the legality check
 * does. `maxAttacks` used to be exported for that and the bot never called it:
 * its `reach` counted one swing per body and stopped, so Flash's and Vergil's
 * second attack were invisible to it, a minion that had already swung once had
 * its remaining swing ignored, and a Cannot Attack body like Galactus was
 * counted as eight points of reach it could never deliver.
 */
export function readySwings(minion: MinionInstance, state?: GameState): number {
  if (attackForbidden(minion, state)) return 0;
  if (minion.sleeping || minion.frozen || minion.chained > 0) return 0;
  return Math.max(0, maxAttacks(minion) - minion.attacksUsed);
}

export function maxAttacks(minion: MinionInstance): number {
  // Flash keeps the original multi-attack passive and Divine Shield, but his
  // current card pass caps the speed at two swings.
  if (!minion.silenced && hasEffect(minion, "flash_speed")) return 2;
  if (!minion.silenced && hasEffect(minion, "attack_2x")) return 2;
  if (!minion.silenced && hasRelic(minion, "double_attack")) return 2;
  return 1;
}
