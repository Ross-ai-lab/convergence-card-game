/**
 * Damage to minions and cores, and every defence that can refuse or reduce it.
 */
import type { GameEvent, GameState, MinionInstance, PlayerId } from "../types";
import { attachedRelics, hasRelic } from "./relics";
import { boardSize, effectEvent, opponent, slotOf } from "./core";
import { coinFlip, rollInt } from "./random";
import { destroyAtSlot } from "./death";
import { hasEffect, supermanCovers } from "./stats";

/**
 * Credits one minion with damage it actually landed, for the game-over MVP.
 *
 * Called only where the blow has already been allowed and applied, so a shield
 * that ate the hit, an immunity that refused it, or a target that was never
 * there all credit nothing. The tally is keyed by instance rather than by card:
 * two copies of the same card are two different bodies with two different
 * duels behind them.
 */
function creditDamage(state: GameState, source: MinionInstance | null | undefined, amount: number): void {
  if (!source || amount <= 0) return;
  const tally = (state.damageTally ??= {});
  const entry = tally[source.instanceId];
  if (entry) {
    entry.damage += amount;
    return;
  }
  tally[source.instanceId] = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    name: source.name,
    art: source.art,
    owner: source.owner,
    damage: amount,
  };
}

/** A core has one Aladdin-granted Divine Shield, just like a minion does. */
export function dealCoreDamage(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  events: GameEvent[],
  source?: MinionInstance | null,
): boolean {
  const player = state.players[playerId];
  if (amount <= 0) return false;
  if (source && source.owner !== playerId && state.heroPowers[playerId] === "saitama_small_guard" && source.atk <= 3) {
    events.push({ kind: "effect", text: `Serious Disinterest ignores ${source.name}'s Core damage.`, player: playerId, instanceId: source.instanceId });
    return false;
  }
  if (state.coreInvincible?.[playerId]) {
    events.push({ kind: "effect", text: `${player.name}'s Core is invincible.`, player: playerId });
    return false;
  }
  if (player.heroDivineShield) {
    player.heroDivineShield = false;
    events.push({ kind: "combat", text: `${player.name}'s core Divine Shield breaks.`, player: playerId });
    return false;
  }
  if (player.health - amount <= 0 && state.heroPowers[playerId] === "voldemort_immortal" && player.board.some(Boolean)) {
    const taken = Math.max(0, player.health - 1);
    player.health = 1;
    if (taken > 0) creditDamage(state, source, taken);
    events.push({ kind: "effect", text: `Dark Immortality leaves ${player.name}'s Core at 1 HP while a minion remains.`, player: playerId });
    return false;
  }
  player.health -= amount;
  creditDamage(state, source, amount);
  return true;
}

export function damageAllEnemies(
  state: GameState,
  source: MinionInstance,
  amount: number,
  events: GameEvent[],
  godzillaPath: ReadonlySet<string> = new Set(),
): void {
  const enemyId = opponent(source.owner);
  for (let slotIndex = 0; slotIndex < boardSize; slotIndex += 1) {
    if (state.players[enemyId].board[slotIndex]) {
      // Each target is its own branch of a reactive chain. Copying the path
      // prevents Godzillas from ping-ponging forever without suppressing a
      // second, separate hit later in the same area effect.
      dealMinionDamage(state, enemyId, slotIndex, amount, source, events, true, new Set(godzillaPath));
    }
  }
}

export function dealMinionDamage(
  state: GameState,
  owner: PlayerId,
  slotIndex: number,
  amount: number,
  source: MinionInstance,
  events: GameEvent[],
  effectDamage = false,
  godzillaPath: ReadonlySet<string> = new Set(),
  combatDamage = false,
  attackTarget = false,
): void {
  const target = state.players[owner].board[slotIndex];
  if (!target || amount <= 0) return;
  if (!canDamage(state, source, target, effectDamage, events, combatDamage, attackTarget)) return;
  amount = modifyIncoming(state, source, target, amount);
  // Superman covers every friendly Good minion, not only himself (owner's
  // ruling, 2 September 2026). Read off the TARGET's own board, so a Superman
  // on the other side does nothing for the minion being hit.
  if (!target.silenced && supermanCovers(state, target)) {
    amount = Math.min(amount, 3);
  }
  if (amount <= 0) return;
  // Shinigami Eyes reads straight past a Divine Shield, and so does Silence.
  //
  // Silence "strips the printed effect and keywords" — that is the printed rule
  // on the How To Play screen and in the README — and Divine Shield is a
  // keyword. Every other keyword already answered to it (Taunt through
  // `!silenced` at the legality check, Cannot Attack through `attackForbidden`),
  // and the card face has always hidden the gold rim on a silenced minion. The
  // shield alone kept absorbing a hit, so a silenced minion showed no shield and
  // still ate a blow with one. Suppressed rather than deleted: Gojo's Silence is
  // an aura his own card calls temporary, so the shield comes back with the text.
  if (target.divineShield && !target.silenced && !hasRelic(source, "ignore_defences")) {
    target.divineShield = false;
    events.push({ kind: "combat", text: `${target.name}'s Divine Shield breaks.`, player: owner, instanceId: target.instanceId });
    return;
  }
  target.hp -= amount;
  creditDamage(state, source, amount);
  // Effect damage NAMES its source; combat damage does not.
  //
  // A combat blow is always preceded by its own "A attacks B" line, so
  // repeating the attacker reads as an echo. Effect damage has no such line: a
  // Battlecry that burns a minion used to print a bare "Cecil takes 1 damage."
  // directly under "Player Two plays Modern Tank", leaving the reader to guess
  // that the two were connected — and guessing wrong whenever anything else had
  // resolved in between.
  events.push({
    kind: "damage",
    text: effectDamage
      ? `${source.name} deals ${amount} damage to ${target.name}.`
      : `${target.name} takes ${amount} damage.`,
    player: owner,
    instanceId: target.instanceId,
  });
  if (
    target.hp > 0 &&
    hasEffect(target, "godzilla_damage_burst") &&
    !target.silenced &&
    !godzillaPath.has(target.instanceId)
  ) {
    const nextPath = new Set(godzillaPath);
    nextPath.add(target.instanceId);
    damageAllEnemies(state, target, 2, events, nextPath);
  }
  if (target.hp > 0 && hasEffect(source, "shigaraki_decay") && !source.silenced) {
    target.markedBy = source.instanceId;
    target.markedForDeathAtTurn = state.turnNumber + 2;
    events.push(effectEvent(`${source.name} marks ${target.name} for decay.`, source));
  }
  if (target.hp <= 0) {
    destroyAtSlot(state, owner, slotIndex, events, `${target.name} falls`, effectDamage ? null : source);
  }
}

/** Relic damage maths, applied after the blow is allowed but before it lands. */
export function modifyIncoming(
  state: GameState,
  _source: MinionInstance | null,
  target: MinionInstance,
  amount: number,
): number {
  const relics = attachedRelics(target);
  let modified = amount;
  // Philosopher's Stone: untouchable on your own turn, brittle on theirs.
  if (relics.some((relic) => relic.relicId === "philosophers_stone") && state.activePlayer !== target.owner) {
    modified = amount * 2;
  }
  const damageReduction = state.players[target.owner].board.filter(
    (minion) => minion && minion.instanceId !== target.instanceId && hasEffect(minion, "prince_lloyd_damage_ward"),
  ).length;
  return Math.max(0, modified - damageReduction);
}

/** Each minion evasion effect and its chance in percent. One card per chance. */
const DODGE_CHANCES = [["dodge_40", 40], ["dodge_50", 50], ["dodge_60", 60]] as const;

function canDamage(
  state: GameState,
  source: MinionInstance,
  target: MinionInstance,
  effectDamage: boolean,
  events: GameEvent[],
  combatDamage: boolean,
  attackTarget: boolean,
): boolean {
  if (combatDamage && !attackTarget && hasRelic(target, "mjolnir")) {
    events.push(effectEvent(`${target.name} is Invulnerable while attacking with Mjolnir.`, target));
    return false;
  }
  if (!effectDamage && target.chained > 0) {
    events.push(effectEvent(`${target.name} is protected by its chains.`, target));
    return false;
  }
  if (target.untargetableUntilTurn !== null && target.untargetableUntilTurn !== undefined && target.untargetableUntilTurn > state.turnNumber) {
    // Doctor Strange's window, not a chain. The line said "Chained beyond harm",
    // which names the wrong keyword and sends a reader hunting for chains that
    // are not on the card.
    events.push(effectEvent(`${target.name} is beyond reach.`, target));
    return false;
  }
  // Neo's slot protection blocks Silence, Freeze, and Chained effects. Damage —
  // including normal combat damage — still reaches the minion in that slot.
  if (combatDamage && attackTarget && hasRelic(target, "immune_nature_attacks") && source.camp === "Nature") {
    events.push(effectEvent(`${target.name} is invulnerable to Nature attacks.`, target));
    return false;
  }
  if (combatDamage && attackTarget && hasRelic(target, "immune_tech_attacks") && source.camp === "Tech") {
    events.push(effectEvent(`${target.name} is invulnerable to Tech attacks.`, target));
    return false;
  }
  // Doomsday's adaptation, and the defensive relics.
  if (target.campImmunity && target.campImmunity.untilTurn > state.turnNumber && target.campImmunity.camp === source.camp) {
    events.push(effectEvent(`${target.name} has adapted to ${source.camp}.`, target));
    return false;
  }
  if (combatDamage && attackTarget && hasRelic(target, "immune_magic") && source.camp === "Magic") {
    events.push(effectEvent(`${target.name}'s Lostvayne turns the Magic aside.`, target));
    return false;
  }
  if (hasEffect(target, "immune_magic_minions") && source.camp === "Magic" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Magic minions.`, target));
    return false;
  }
  if (hasEffect(target, "immune_tech_minions") && source.camp === "Tech" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Tech minions.`, target));
    return false;
  }
  if (hasEffect(target, "immune_nature_minions") && source.camp === "Nature" && !target.silenced) {
    events.push(effectEvent(`${target.name} is immune to Nature minions.`, target));
    return false;
  }
  if (invulnerableNow(state, target, events)) return false;
  const cannotBeEvaded = combatDamage && attackTarget && !source.silenced && hasEffect(source, "nyan_unerring_attacks");
  if (!cannotBeEvaded && !effectDamage && source.owner !== target.owner && hasEffect(target, "evade_first_attack") && !target.silenced) {
    if (target.evadedAttackAtTurn !== state.turnNumber) {
      target.evadedAttackAtTurn = state.turnNumber;
      events.push(effectEvent(`${target.name} evades the first attack targeting it this turn.`, target));
      return false;
    }
  }
  if (!cannotBeEvaded && !effectDamage && source.owner !== target.owner && !target.silenced) {
    // Includes himself now (owner's ruling, 2 September 2026): the card reads
    // "all friendly minions", and he is one of them.
    const kojiro = state.players[target.owner].board.find(
      (minion) => minion && hasEffect(minion, "evade_allies_33") && !minion.silenced,
    );
    if (kojiro && rollInt(state, 100) < 33) {
      events.push(effectEvent(`${kojiro.name} helps ${target.name} evade the attack.`, kojiro));
      return false;
    }
  }
  if (!effectDamage && hasEffect(target, "small_cannot_attack") && source.atk < 5 && !target.silenced) {
    events.push(effectEvent(`${target.name} ignores the weak ATK damage.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "small_attack_ward_2") && source.atk <= 2 && !target.silenced) {
    events.push(effectEvent(`${target.name} shrugs off the strike.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "korosensei_defense") && source.atk < 4 && !target.silenced) {
    events.push(effectEvent(`${target.name} ignores the weak blow.`, target));
    return false;
  }
  if (!effectDamage && hasEffect(target, "oliva_ward") && source.atk < 2 && !target.silenced) {
    events.push(effectEvent(`${target.name} is unmoved.`, target));
    return false;
  }
  // One roll per evasion effect the target carries, in this fixed order.
  for (const [effectId, chance] of DODGE_CHANCES) {
    if (!cannotBeEvaded && !effectDamage && hasEffect(target, effectId) && !target.silenced) {
      if (rollInt(state, 100) < chance) {
        events.push(effectEvent(`${target.name} slips away.`, target));
        return false;
      }
    }
  }
  if (!cannotBeEvaded && !effectDamage && hasRelic(target, "evade_50") && !target.silenced) {
    if (coinFlip(state)) {
      events.push(effectEvent(`${target.name} evades the attack through Infinity Castle.`, target));
      return false;
    }
  }
  if (!cannotBeEvaded && !effectDamage && source.owner !== target.owner && hasEffect(target, "kaku_evade_counter") && !target.silenced) {
    if (rollInt(state, 100) < 50) {
      events.push(effectEvent(`${target.name} evades the attack and turns its force back.`, target));
      const attackerSlot = slotOf(state, source);
      if (attackerSlot >= 0) {
        dealMinionDamage(state, source.owner, attackerSlot, source.atk, target, events, true);
      }
      return false;
    }
  }
  if (!cannotBeEvaded && !effectDamage && hasEffect(target, "korosensei_defense") && !target.silenced) {
    if (rollInt(state, 100) < 20) {
      events.push(effectEvent(`${target.name} evades the attack.`, target));
      return false;
    }
  }
  return true;
}

/**
 * The Invulnerable states. They belong to the target alone, so they refuse
 * damage whatever dealt it: a minion, an effect, or a Hero Power with no body.
 */
export function invulnerableNow(state: GameState, target: MinionInstance, events: GameEvent[]): boolean {
  if (hasRelic(target, "philosophers_stone") && state.activePlayer === target.owner) {
    events.push(effectEvent(`${target.name} is untouchable while the Stone holds.`, target));
    return true;
  }
  if (target.silenced) return false;
  const ownerBoard = state.players[target.owner].board;
  if (hasEffect(target, "invuln_if_alone") && ownerBoard.filter(Boolean).length <= 1) {
    events.push(effectEvent(`${target.name} is untouchable while alone.`, target));
    return true;
  }
  if (
    hasEffect(target, "invuln_with_good_ally") &&
    ownerBoard.some((minion) => minion && minion.instanceId !== target.instanceId && minion.alignment === "Good")
  ) {
    events.push(effectEvent(`${target.name} is shielded by an ally.`, target));
    return true;
  }
  return false;
}

export function damageAllOther(state: GameState, source: MinionInstance, amount: number, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    for (let slot = 0; slot < boardSize; slot += 1) {
      const minion = state.players[playerId].board[slot];
      if (minion && minion.instanceId !== source.instanceId) {
        dealMinionDamage(state, playerId, slot, amount, source, events, true);
      }
    }
  }
}
