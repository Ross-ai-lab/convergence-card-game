import type { CardDefinition, MinionInstance, PlayerId } from "./types";

/**
 * Builds a board-ready minion straight from a card definition, for tests that
 * need a specific board rather than a played-out game.
 *
 * It lives here rather than being copy-pasted into each test file because every
 * new field on MinionInstance would otherwise break three factories at once —
 * which is exactly what happened when relics arrived.
 */
let sequence = 0;

export function spawnTestMinion(
  card: CardDefinition,
  owner: PlayerId,
  overrides: Partial<MinionInstance> = {},
): MinionInstance {
  sequence += 1;
  const base: MinionInstance = {
    instanceId: `t${sequence}`,
    cardId: card.id,
    owner,
    name: card.name,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    maxHp: card.hp,
    baseAtk: card.atk,
    baseHp: card.hp,
    rarity: card.rarity,
    camp: card.camp,
    alignment: card.alignment,
    keywords: [...card.keywords],
    effectId: card.effectId,
    effectTiming: card.effectTiming,
    effect: card.effect,
    origin: card.origin,
    art: card.art,
    playOrder: sequence,
    attacksUsed: 0,
    sleeping: false,
    chained: 0,
    frozen: false,
    thawPending: false,
    silenced: false,
    divineShield: card.keywords.includes("Divine Shield"),
    invulnerableUntilTurn: null,
    protectedSlot: false,
    delayedDestroySource: null,
    relic: null,
    temporaryTransform: null,
    attackedBy: [],
    attackLocked: false,
    attackLockedUntilTurn: null,
    markedBy: null,
    markedForDeathAtTurn: null,
    untargetableUntilTurn: null,
    protectedByMeleoron: null,
    auraBonuses: [],
    deathStarTarget: null,
    campImmunity: null,
    stolenPassiveFrom: null,
    stolenPassiveText: null,
    gainedEffects: [],
  };
  return { ...base, ...overrides };
}
