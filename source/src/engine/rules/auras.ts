/**
 * Standing effects recomputed after every action: passive auras, global Silence, slot
 * marks and the watchers that react to a minion becoming afflicted.
 */
import { traceEffect } from "../trace";
import type {
  Camp,
  SlotAuraId,
  EffectId,
  GameEvent,
  GameState,
  Keyword,
  MinionInstance,
  PlayerId,
  TargetOption,
} from "../types";
import { CHAIN_GROWTH_REWARD, STARTING_CORE, effectEvent, opponent } from "./core";
import {
  applyChain,
  applySilence,
  buffMinion,
  canDisable,
  hasEffect,
  hasKeyword,
  isSlotProtected,
  setMinionAttack,
  setMinionHealth,
} from "./stats";
import { printedEffectId } from "./targeting";

type SourceCamp = Exclude<Camp, "ALL">;

/** All Might's aura, in ATK. Raised from 1 on 2 September 2026 (owner's ruling). */
const ALL_MIGHT_ATK_DEBUFF = 2;

/** Deep Sea King's discount, in mana, while anything is Frozen or Chained. */
export const DEEP_SEA_DISCOUNT = 3;

/**
 * ALL is an umbrella recipient for positive camp buffs.
 */
export function receivesCampBuff(minion: MinionInstance, camp: SourceCamp): boolean {
  return minion.camp === camp || minion.camp === "ALL";
}

/**
 * Whether a hostile camp-specific effect may CHOOSE this minion.
 *
 * ALL counts, and that is the owner's ruling of 2 September 2026, reversing the
 * rule before it. ALL used to take every camp buff and duck every camp answer,
 * which made it the only camp with no counterplay at all: Light Yagami hunts
 * Nature, Motoko hunts Tech, and an ALL minion sat outside every one of those
 * hunts while collecting all three camps' buffs.
 *
 * It is deliberately SELECTION only. Camp IMMUNITY still asks the attacker's
 * exact camp (`source.camp === "Nature"` and friends), because making ALL count
 * as every camp there would have an ALL attacker bounce off all three immunity
 * relics at once — a nerf nobody asked for and the opposite of this change.
 */
export function campTargetedBy(minion: MinionInstance, camp: SourceCamp): boolean {
  return minion.camp === camp || minion.camp === "ALL";
}

export function refreshPassiveAuras(state: GameState): void {
  const previous=new Map<string,Map<string,{hp:number;atk:number;suppressedHp:number}>>();
  const grantAura=(target:MinionInstance,sourceId:string,atk:number,hp:number,keywords:Keyword[]=[])=>{
    const budget=previous.get(target.instanceId)?.get(sourceId);
    const spentAtk=Math.min(Math.max(0,atk),budget?.atk??0);
    const suppressedHp=Math.min(hp,budget?.suppressedHp??0);
    const spentHp=Math.min(hp-suppressedHp,budget?.hp??0);
    if(budget){budget.atk-=spentAtk;budget.hp-=spentHp;budget.suppressedHp-=suppressedHp;}
    if(target.silenced){target.auraBonuses!.push({sourceId,atk:0,hp:0,keywords});return;}
    target.atk+=atk-spentAtk;target.maxHp+=hp-suppressedHp;target.hp+=hp-suppressedHp-spentHp;
    target.auraBonuses!.push({sourceId,atk:atk-spentAtk,hp,keywords,spentAtk,suppressedHp});
  };
  for (const owner of [0, 1] as PlayerId[]) {
    const board = state.players[owner].board;
    const liveFantasticSources = new Set(
      board
        .filter((minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "fantastic_four_aura")))
        .map((minion) => minion.instanceId),
    );
    for (const target of board) {
      if (!target) continue;
      const old = target.auraBonuses ?? [];
      const budgets=new Map<string,{hp:number;atk:number;suppressedHp:number}>();previous.set(target.instanceId,budgets);
      let wounds=Math.max(0,target.maxHp-target.hp);
      let overwritten=Math.max(0,old.reduce((sum,bonus)=>sum+Math.max(0,bonus.hp-(bonus.suppressedHp??0)),0)-Math.max(0,target.maxHp-1));
      for (const bonus of old) {
        // A direct ATK-setting effect (for example Vader's chain) can land
        // while a positive aura is still attached.  Removing that old aura
        // must never leave a live minion below the game's 0-ATK floor.
        const extraSuppression=Math.min(overwritten,Math.max(0,bonus.hp-(bonus.suppressedHp??0)));overwritten-=extraSuppression;
        const suppressedHp=(bonus.suppressedHp??0)+extraSuppression;
        const capacity=Math.max(0,bonus.hp-suppressedHp);
        const spentHp=Math.min(wounds,capacity);wounds-=spentHp;
        const budget=budgets.get(bonus.sourceId)??{hp:0,atk:0,suppressedHp:0};
        budget.hp+=spentHp;budget.atk+=bonus.spentAtk??0;budget.suppressedHp+=suppressedHp;budgets.set(bonus.sourceId,budget);
        target.atk = Math.max(0, target.atk - bonus.atk);
        target.maxHp = Math.max(1,target.maxHp-capacity);
        // Rebuilding an aura must preserve wounds.  Removing a +HP aura and
        // then adding it again is not a heal, even when the refresh was
        // triggered by placing an unrelated minion such as Ragnaros.
        target.hp = Math.min(target.maxHp,target.hp-(capacity-spentHp));
        for (const keyword of bonus.keywords) {
          const hasPrintedOrGranted = target.gainedEffects.some((effect) => effect.text.toLowerCase().includes(keyword.toLowerCase())) || target.effect.toLowerCase().includes(keyword.toLowerCase());
          if (!hasPrintedOrGranted) target.keywords = target.keywords.filter((entry) => entry !== keyword);
        }
        if (bonus.divineShield) {
          const fromAura = target.divineShieldAuraSources?.includes(bonus.sourceId) ?? false;
          target.divineShieldAuraSources = (target.divineShieldAuraSources ?? []).filter((sourceId) => sourceId !== bonus.sourceId);
          const hasPrintedOrGranted =
            hasKeyword(target, "Divine Shield") ||
            target.gainedEffects.some((effect) => effect.text.toLowerCase().includes("divine shield"));
          if (fromAura && !hasPrintedOrGranted) {
            if (!target.divineShield) {
              target.brokenAuraSources = Array.from(new Set([...(target.brokenAuraSources ?? []), bonus.sourceId]));
            } else {
              target.divineShield = false;
            }
          }
        }
      }
      target.brokenAuraSources = (target.brokenAuraSources ?? []).filter((sourceId) => liveFantasticSources.has(sourceId));
      target.divineShieldAuraSources = (target.divineShieldAuraSources ?? []).filter((sourceId) => liveFantasticSources.has(sourceId));
      target.auraBonuses = [];
    }
    for (const source of board) {
      if (!source || source.silenced) continue;
      if (hasEffect(source, "taunt_aura")) {
        for (const target of board) {
          if (!target || hasKeyword(target, "Taunt")) continue;
          target.keywords.push("Taunt");
          target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: ["Taunt"] });
        }
      }
      if (hasEffect(source, "freeman_charge_aura")) {
        for (const target of board) {
          if (!target) continue;
          if (!hasKeyword(target, "Charge")) {
            target.keywords.push("Charge");
            target.auraBonuses!.push({ sourceId: source.instanceId, atk: 0, hp: 0, keywords: ["Charge"] });
          }
          // Charge is normally read ONCE, when a minion is created, so granting
          // the keyword is not enough on its own: an aura has to wake what is
          // already asleep. Without this line the card would do nothing on the
          // turn Gordon lands and nothing for any minion already on the board,
          // which is most of the times you would want to play him.
          //
          // A minion woken this way stays awake if Gordon then dies, and that is
          // the intended reading rather than an oversight — it charged. The
          // keyword itself is stripped by the removal pass above, so the card
          // face stops promising something that is no longer true.
          target.sleeping = false;
        }
      }
      if (hasEffect(source, "fantastic_four_aura")) {
        // FOUR IDENTICAL SLOTS, +1/+1 each (owner's ruling, 2 September 2026).
        // The four different gifts — Taunt, Divine Shield, +2 ATK, +2 HP — read
        // as a puzzle the player had to solve by placing minions in the right
        // order, and the Divine Shield half needed its own bookkeeping
        // (`divineShieldAuraSources`, `brokenAuraSources`) to survive being
        // popped. One buff on four slots is the same card with none of that.
        for (const targetSlot of [0, 1, 2, 3]) {
          const target = board[targetSlot];
          if (!target) continue;
          grantAura(target,source.instanceId,1,1);
        }
      }
      if (hasEffect(source, "buff_all_nature_2_1")) {
        // Giant Tree is an aura, not a bank of permanent start-of-turn buffs.
        // Its Nature allies therefore lose the contribution as soon as the
        // Tree leaves play or is silenced.
        for (const target of board) {
          if (!target || target.instanceId === source.instanceId || !receivesCampBuff(target, "Nature")) continue;
          grantAura(target,source.instanceId,2,1);
        }
      }
      if (hasEffect(source, "buff_all_tech_2_1")) {
        // Tech Hub is a standing aura. Rebuild its contribution every refresh
        // so leaving, silencing, or replacing the Hub removes the bonus cleanly.
        for (const target of board) {
          if (!target || target.instanceId === source.instanceId || !receivesCampBuff(target, "Tech")) continue;
          grantAura(target,source.instanceId,2,1);
        }
      }
      if (hasEffect(source, "taunt_ally_self_buff")) {
        const defenders = board.filter(ally => ally && !ally.silenced
          && (hasKeyword(ally, "Taunt") || ally.divineShield)).length;
        if (defenders > 0) grantAura(source, source.instanceId, defenders, defenders);
      }
      if (hasEffect(source, "guts_missing_core_growth")) {
        const missingCore = Math.floor(Math.max(0, STARTING_CORE - state.players[source.owner].health) / 5);
        if (missingCore > 0) grantAura(source, source.instanceId, missingCore, missingCore);
      }
      if (!hasEffect(source, "glados_adjacent_tech")) continue;
      const sourceSlot = board.findIndex((entry) => entry?.instanceId === source.instanceId);
      for (const targetSlot of [sourceSlot - 1, sourceSlot + 1]) {
        const target = board[targetSlot];
        if (!target || !receivesCampBuff(target, "Tech")) continue;
        if (!hasKeyword(target, "Taunt")) target.keywords.push("Taunt");
        grantAura(target,source.instanceId,2,2,["Taunt"]);
      }
    }
  }
  const planetaryDefenseGrids = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "planetary_defense_grid_taunt_buff")),
    ),
  );
  for (const source of planetaryDefenseGrids) {
    for (const target of state.players[source.owner].board) {
      if (!target || target.silenced || !hasKeyword(target, "Taunt")) continue;
        // "All OTHER Taunt minions". The grid is itself a Taunt, so without this
        // it fed its own buff and read as a 7/11 behind a 4/8's printed stats.
        if (target.instanceId === source.instanceId) continue;
        target.auraBonuses = target.auraBonuses ?? [];
        grantAura(target,source.instanceId,2,2);
    }
  }
  copyEnemyPassives(state);
  const battleships = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "battleship_tech_aura")),
    ),
  );
  for (const source of battleships) {
    for (const target of state.players[source.owner].board) {
      if (!target || !receivesCampBuff(target, "Tech")) continue;
      target.auraBonuses = target.auraBonuses ?? [];
      grantAura(target,source.instanceId,2,1);
    }
  }
  const eldenBeasts = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "elden_beast_neutral_magic_atk")),
    ),
  );
  for (const source of eldenBeasts) {
    for (const target of state.players[source.owner].board) {
      // `receivesCampBuff`, not a bare camp match: ALL is the umbrella camp and
      // takes every positive camp buff (see types.ts and the How To Play rules
      // screen). Battleship and the Giant Tree already read it this way; this
      // aura was the one that did not, so an ALL minion silently missed it.
      if (!target || (target.alignment !== "Neutral" && !receivesCampBuff(target, "Magic"))) continue;
      target.auraBonuses = target.auraBonuses ?? [];
      grantAura(target,source.instanceId,2,0);
    }
  }
  const allMightSources = ([0, 1] as PlayerId[]).flatMap((owner) =>
    state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "all_enemy_atk_down_2")),
    ),
  );
  for (const source of allMightSources) {
    for (const target of state.players[opponent(source.owner)].board) {
      if (!target) continue;
      // ATK is never a negative state, even if an imported/older save already
      // contains one before this aura is refreshed.
      target.atk = Math.max(0, target.atk);
      // Two, from one (owner's ruling, 2 September 2026). Still floored at the
      // target's own ATK so nothing goes negative.
      const reduction = Math.min(ALL_MIGHT_ATK_DEBUFF, target.atk);
      target.atk -= reduction;
      target.auraBonuses = target.auraBonuses ?? [];
      target.auraBonuses.push({ sourceId: source.instanceId, atk: -reduction, hp: 0, keywords: [] });
    }
  }
}

export function enforceGlobalSilence(state: GameState, events: GameEvent[]): void {
  const liveGojoIds = new Set(
    state.players.flatMap((player) =>
      player.board
        .filter((minion): minion is MinionInstance => Boolean(minion && !minion.silenced && hasEffect(minion, "yoda_global_silence")))
        .map((minion) => minion.instanceId),
    ),
  );

  // Gojo's Silence is an aura, not a permanent mutation. Remove only the
  // sources that are no longer live; a minion that was already silenced by a
  // separate effect was never claimed by this aura and stays silenced.
  for (const player of state.players) {
    for (const minion of player.board) {
      if (!minion || !minion.passiveSilenceSources?.length) continue;
      const remaining = minion.passiveSilenceSources.filter((sourceId) => liveGojoIds.has(sourceId));
      if (remaining.length === minion.passiveSilenceSources.length) continue;
      minion.passiveSilenceSources = remaining;
      if (remaining.length === 0) {
        minion.silenced = false;
        events.push(effectEvent(`${minion.name} is no longer silenced by Gojo.`, minion));
      }
    }
  }

  for (const owner of [0, 1] as PlayerId[]) {
    const gojos = state.players[owner].board.filter(
      (minion): minion is MinionInstance => Boolean(minion && hasEffect(minion, "yoda_global_silence") && !minion.silenced),
    );
    if (gojos.length === 0) continue;
    const enemy = state.players[opponent(owner)];
    for (const minion of enemy.board) {
      if (!minion) continue;
      const sources = new Set(minion.passiveSilenceSources ?? []);
      // A pre-existing non-Gojo Silence is not owned by this aura. Once a
      // minion is marked by Gojo, however, all live Gojo sources are retained
      // so removing one of several Gojo cards cannot release it too early.
      if (minion.silenced && sources.size === 0) continue;
      if (isSlotProtected(state, minion) || !canDisable(state, owner, minion, "silence")) {
        if (sources.size > 0) {
          minion.passiveSilenceSources = [];
          minion.silenced = false;
          events.push(effectEvent(`${minion.name} is no longer silenced by Gojo.`, minion));
        }
        continue;
      }
      for (const gojo of gojos) sources.add(gojo.instanceId);
      const wasSilenced = minion.silenced;
      applySilence(minion, false);
      minion.passiveSilenceSources = [...sources];
      if (!wasSilenced) events.push(effectEvent(`${minion.name} is silenced by Gojo.`, gojos[0]));
    }
  }
}

/** Dumbledore's passive both blocks new disables and removes existing ones. */
export function enforceDumbledoreCleansing(state: GameState, events: GameEvent[]): void {
  for (const owner of [0, 1] as PlayerId[]) {
    const board = state.players[owner].board;
    const protector = board.find((minion) => minion && hasEffect(minion, "dumbledore_cleanse") && !minion.silenced);
    if (!protector) continue;
    for (const minion of board) {
      if (!minion) continue;
      const wasSilenced = minion.silenced;
      const wasFrozen = minion.frozen;
      const wasChained = minion.chained > 0;
      const hadFreezeCurse = wasFrozen || minion.thawPending;
      if (!wasSilenced && !hadFreezeCurse && !wasChained) continue;
      minion.silenced = false;
      minion.frozen = false;
      minion.thawPending = false;
      minion.chained = 0;
      if (wasFrozen) minion.attacksUsed = 0;
      resolveChainGrowth(minion, events);
      const curses = [
        wasSilenced ? "Silence" : null,
        hadFreezeCurse ? "Freeze" : null,
        wasChained ? "Chained" : null,
      ].filter((curse): curse is string => curse !== null);
      const lastCurse = curses[curses.length - 1] ?? "their curses";
      const curseText = curses.length > 1 ? `${curses.slice(0, -1).join(", ")}, and ${lastCurse}` : lastCurse;
      events.push(effectEvent(`${protector.name} cleanses ${minion.name} of ${curseText}.`, protector));
    }
  }
}

/** Remove the temporary disable and delayed-kill states a Neuralyzer can clear. */
export function cleanseNegativeStatuses(minion: MinionInstance, events: GameEvent[]): string[] {
  const removed: string[] = [];
  if (minion.silenced || minion.passiveSilenceSources.length > 0) {
    minion.silenced = false;
    minion.passiveSilenceSources = [];
    removed.push("Silence");
  }
  if (minion.frozen || minion.thawPending) {
    const wasFrozen = minion.frozen;
    minion.frozen = false;
    minion.thawPending = false;
    if (wasFrozen) minion.attacksUsed = 0;
    removed.push("Freeze");
  }
  if (minion.chained > 0) {
    minion.chained = 0;
    resolveChainGrowth(minion, events);
    removed.push("Chained");
  }
  if (minion.attackLocked || minion.attackLockedUntilTurn !== null) {
    minion.attackLocked = false;
    minion.attackLockedUntilTurn = null;
    removed.push("Attack Lock");
  }
  if (minion.markedBy !== null || minion.markedForDeathAtTurn != null) {
    minion.markedBy = null;
    minion.markedForDeathAtTurn = null;
    removed.push("Death Mark");
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Slot auras. A mark on a POSITION, not on a minion — and permanent: the caster
// can die, be silenced or be bounced and the slot stays marked for the rest of
// the duel (owner ruling). Whoever stands there next inherits it, which is what
// makes a 10-mana card worth its cost.
// ---------------------------------------------------------------------------
export function layAura(
  state: GameState,
  target: TargetOption,
  auraId: SlotAuraId,
  source: MinionInstance,
  events: GameEvent[],
): void {
  // A slot mark is committed only after the targeting answer has been applied.
  // Keeping this guard here makes a future multi-step effect unable to leak a
  // provisional/random marker into the board while its prompt is still open.
  if (state.phase === "targeting" || state.pendingTarget) return;
  const board = state.players[target.owner];
  const existing = board.slotAuras.find((aura) => aura.slot === target.slot && aura.auraId === auraId);
  if (existing) return;
  board.slotAuras.push({ slot: target.slot, auraId, sourceName: source.name });
  events.push(effectEvent(`${source.name} marks ${board.name}'s slot ${target.slot + 1} — permanently.`, source));
  enforceSlotAuras(state, events);
}

export function hasSlotAura(state: GameState, owner: PlayerId, slot: number, auraId: SlotAuraId): boolean {
  return state.players[owner].slotAuras.some((aura) => aura.slot === slot && aura.auraId === auraId);
}

/**
 * Applies the auras that change a minion's STATE rather than its behaviour.
 * Called after every action, so a minion that walks into a silenced slot by any
 * route — played, summoned, seized, defected — is caught.
 */
export function enforceSlotAuras(state: GameState, events: GameEvent[]): void {
  for (const playerId of [0, 1] as PlayerId[]) {
    const player = state.players[playerId];
    for (const aura of player.slotAuras) {
      const minion = player.board[aura.slot];
      if (aura.auraId === "slot_stats_one" && minion) {
        setMinionAttack(minion,1);
        setMinionHealth(minion,1,1);
      }
      if (aura.auraId === "slot_chain") {
        if (
          minion &&
          minion.chained === 0 &&
          !isSlotProtected(state, minion) &&
          canDisable(state, playerId, minion, "chain")
        ) {
          applyChain(state, minion, events);
          events.push({
            kind: "effect",
            text: `${minion.name} is permanently Chained by the mark on slot ${aura.slot + 1}.`,
            player: playerId,
            instanceId: minion.instanceId,
          });
        }
        continue;
      }
      if (aura.auraId !== "slot_silence") continue;
      if (minion && !minion.silenced && !isSlotProtected(state, minion)) {
        if (!canDisable(state, playerId, minion, "silence")) continue;
        applySilence(minion);
        events.push({
          kind: "effect",
          text: `${minion.name} is silenced by the mark on slot ${aura.slot + 1}.`,
          player: playerId,
          instanceId: minion.instanceId,
        });
      }
    }
  }
}

/** Which minions are currently Chained, Frozen or Silenced, by instance. */
type AfflictionState = Map<string, { chained: boolean; frozen: boolean; silenced: boolean }>;

export function afflictionSnapshot(state: GameState): AfflictionState {
  const snapshot: AfflictionState = new Map();
  for (const player of state.players) {
    for (const minion of player.board) {
      if (!minion) continue;
      snapshot.set(minion.instanceId, {
        chained: minion.chained > 0,
        frozen: minion.frozen,
        silenced: minion.silenced,
      });
    }
  }
  return snapshot;
}

/**
 * Pays every One-Eyed Owl for each minion that picked up an affliction.
 *
 * A DIFF, not a hook. The card reads "whenever a minion becomes Chained, Frozen
 * or Silenced", and those three arrive from a dozen different places — a
 * targeted effect, an aura, a slot mark, a relic, a global sweep — several of
 * which have no events array to report into. Comparing the board before and
 * after the whole action catches all of them, including the routes that do not
 * exist yet.
 *
 * A minion that arrives ALREADY afflicted pays nothing: it was not there before,
 * so it never "became" anything. That is why the lookup misses count as no
 * change rather than as a new affliction, and it is what stops Albion — who is
 * printed Chained — from feeding an Owl every time a copy of him is summoned.
 *
 * One payout per minion per action, not one per affliction: a card that freezes
 * and silences in the same breath is one event to watch, not two.
 */
export function feedAfflictionWatchers(state: GameState, before: AfflictionState, events: GameEvent[]): void {
  const watchers: MinionInstance[] = [];
  for (const player of state.players) {
    for (const minion of player.board) {
      if (minion && hasEffect(minion, "chain_watch_growth")) watchers.push(minion);
    }
  }
  if (watchers.length === 0) return;

  for (const player of state.players) {
    for (const minion of player.board) {
      if (!minion) continue;
      const was = before.get(minion.instanceId);
      if (!was) continue;
      const gained =
        (minion.chained > 0 && !was.chained) ||
        (minion.frozen && !was.frozen) ||
        (minion.silenced && !was.silenced);
      if (!gained) continue;
      for (const watcher of watchers) {
        if (watcher.instanceId === minion.instanceId) continue;
        buffMinion(watcher, 1, 1);
        events.push(effectEvent(`${watcher.name} feeds on ${minion.name}'s suffering (+1/+1).`, watcher));
      }
    }
  }
}

export function resolveChainGrowth(minion: MinionInstance, events: GameEvent[]): void {
  if (!minion.chainGrowthPending || minion.chained > 0) return;
  minion.chainGrowthPending = false;
  // Matches the printed reward on Reforged Chains, the one power that sets this
  // flag. Raised with the chain's length: two lost turns had to buy more.
  buffMinion(minion, CHAIN_GROWTH_REWARD, CHAIN_GROWTH_REWARD);
  events.push(
    effectEvent(`${minion.name} breaks free and gains +${CHAIN_GROWTH_REWARD}/+${CHAIN_GROWTH_REWARD}.`, minion),
  );
}

/**
 * Cancels the positive half of every aura landing on a silenced minion.
 *
 * Run as one sweep after the auras have been rebuilt rather than as a guard at
 * each of the places that hand a bonus out: the negative half of an aura (All
 * Might's -1 ATK to the enemy board) is a curse and has to keep landing, so the
 * test is the sign of the bonus, not the identity of the source.
 */
/**
 * All for One: every enemy minion's printed Passive or Ongoing, worn at once.
 *
 * Rebuilt from scratch on every recompute rather than granted once, because it
 * is an AURA in everything but name — an enemy minion dying has to take its
 * power back with it. `gainedEffects` is the right home because `hasEffect`
 * already reads it, so every passive in the game answers for the wearer without
 * a single one of them needing to know this card exists.
 *
 * Two exclusions, and both are the same bug. It never copies its own id, or two
 * All for Ones facing each other would each try to wear the other's copy of the
 * other's copy. And it copies the PRINTED effect (`printedEffectId`), never what
 * a minion is currently wearing, so it cannot pick up a power that is itself on
 * loan.
 *
 * The whole `gainedEffects` array is replaced, so a card that grants All for One
 * an effect by some other route loses it on the next recompute. Nothing in the
 * roster does that today; a card that did would need its grant recorded
 * somewhere this function does not own.
 */
function copyEnemyPassives(state: GameState): void {
  for (const owner of [0, 1] as PlayerId[]) {
    for (const wearer of state.players[owner].board) {
      if (!wearer || wearer.effectId !== "copy_all_enemy_passives") continue;
      // Same reason as Deep Sea King's discount: this reads `effectId` directly
      // rather than going through `hasEffect`, so the tracer cannot see it.
      traceEffect("copy_all_enemy_passives");
      if (wearer.silenced || wearer.chained > 0) {
        wearer.gainedEffects = [];
        continue;
      }
      const copied: MinionInstance["gainedEffects"] = [];
      const seen = new Set<EffectId>();
      for (const enemyMinion of state.players[opponent(owner)].board) {
        if (!enemyMinion || enemyMinion.silenced || enemyMinion.chained > 0) continue;
        const timing = enemyMinion.effectTiming;
        if (timing !== "passive" && timing !== "ongoing") continue;
        const effectId = printedEffectId(enemyMinion);
        if (effectId === "none" || effectId === "copy_all_enemy_passives" || seen.has(effectId)) continue;
        seen.add(effectId);
        copied.push({ effectId, timing, text: enemyMinion.effect });
      }
      wearer.gainedEffects = copied;
    }
  }
}

export function suppressAuraBuffsOnSilenced(state: GameState): void {
  for (const owner of [0, 1] as PlayerId[]) {
    for (const target of state.players[owner].board) {
      if (!target?.silenced || !target.auraBonuses?.length) continue;
      const kept: NonNullable<MinionInstance["auraBonuses"]> = [];
      for (const bonus of target.auraBonuses) {
        const atk = Math.min(0, bonus.atk);
        const hp = Math.min(0, bonus.hp);
        if (bonus.atk > 0) target.atk = Math.max(0, target.atk - bonus.atk);
        if (bonus.hp > 0) {
          target.maxHp = Math.max(1,target.maxHp-Math.max(0,bonus.hp-(bonus.suppressedHp??0)));
          target.hp = Math.min(target.hp, target.maxHp);
        }
        kept.push({ ...bonus, atk, hp });
      }
      target.auraBonuses = kept;
    }
  }
}
