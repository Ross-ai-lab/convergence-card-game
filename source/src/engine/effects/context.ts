/**
 * What an effect handler is given to work with.
 */
import type {
  GameEvent,
  GameState,
  HandOption,
  MinionInstance,
  PlayerId,
  PlayerState,
  ResolvedChoiceWithProgress as ResolvedChoice,
  TargetOption,
} from "../types";
import type { CardLibrary } from "../rules/core";

/**
 * Runs a minion's effect. Returns TRUE when it suspended waiting for a target —
 * the caller must stop and let `choose_target` resume it.
 */
/** What every effect starts from: the minion, where it stands and what it was told. */
export interface EffectStart {
  state: GameState;
  source: MinionInstance;
  sourceSlot: number;
  library: CardLibrary;
  events: GameEvent[];
  chosen?: ResolvedChoice;
  player: PlayerState;
  enemyId: PlayerId;
  enemy: PlayerState;
  label: string;
}

/** An effect's start plus whatever its targeting prompt resolved to. */
export interface EffectContext extends EffectStart {
  picked: MinionInstance | null;
  pickedSlot: TargetOption | null;
  pickedHand: HandOption | null;
  pickedValue: string | null;
  pickedCoreOwner: PlayerId | null;
}

/** Returns true when the effect suspended to wait for a target. */
export type EffectHandler<Context> = (ctx: Context) => boolean | void;
