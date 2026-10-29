/**
 * The player's hands on the duel: clicks and drags on the hand, the board and
 * the enemy core, aiming an attacker or a targeted effect, and the arrows that
 * show the aim. Every choice it makes ends in one of the legal actions it was
 * given, so nothing here can play a move the engine would refuse.
 */
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { sfx } from "../audio/sfx";
import { attacksRandomly, hasFreeRelicSlot, relicLockSource, relicRequiredAlignment, type CardLibrary } from "../engine/game";
import { isRelicCard, type GameAction, type GameState, type MinionInstance, type PendingTarget, type PlayerId } from "../engine/types";
import type { PointerStore, ScreenPoint } from "../pointer-store";
import type { Selection } from "./board";
import type { useDuelFx } from "./use-duel-fx";

type DuelFx = ReturnType<typeof useDuelFx>;

// Pointer-driven drag & drop. A press only becomes a drag after DRAG_THRESHOLD px
// of movement, so plain clicks keep the original select-then-click flow. The
// live pointer position is not here: it lives in the PointerStore.
export type DragState =
  | { kind: "hand"; handIndex: number; cardId: string; active: boolean }
  | { kind: "attacker"; slotIndex: number; ox: number; oy: number; active: boolean }
  | null;

const DRAG_THRESHOLD = 8;

export interface DuelInputOptions {
  game: GameState;
  library: CardLibrary;
  viewerId: PlayerId;
  opponentId: PlayerId;
  /** The legal actions the viewer may take right now. Empty while they cannot act. */
  uiActions: GameAction[];
  pendingTarget: PendingTarget | null;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  drag: DragState;
  setDrag: (drag: DragState) => void;
  setTargetArrowOrigin: (origin: ScreenPoint | null) => void;
  pointer: PointerStore;
  perform: (action: GameAction) => void;
  fx: DuelFx;
  clearHoverPreview: () => void;
  duelIntro: unknown;
  setEnemyPowerOpen: (open: boolean) => void;
}

export function useDuelInput(options: DuelInputOptions) {
  const {
    game, library, viewerId, opponentId, uiActions, pendingTarget, selection, setSelection,
    drag, setDrag, setTargetArrowOrigin, pointer, perform, fx, clearHoverPreview, duelIntro, setEnemyPowerOpen,
  } = options;
  const viewer = game.players[viewerId];
  const [apexAlert, setApexAlert] = useState<number | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);

  /** Answers an open targeting prompt by naming a minion on the board. */
  function chooseTargetAt(owner: PlayerId, slotIndex: number): boolean {
    const pending = game.pendingTarget;
    // "slot" prompts are answered the same way, but an EMPTY slot is a valid answer.
    if (game.phase !== "targeting" || !pending) return false;
    if (pending.kind !== "board" && pending.kind !== "slot" && pending.kind !== "boardOrCore") return false;
    const choiceIndex = pending.options.findIndex((option) => option.owner === owner && option.slot === slotIndex);
    if (choiceIndex < 0) {
      sfx.play("invalid");
      return false;
    }
    perform({ type: "choose_target", player: pending.player, choiceIndex });
    return true;
  }

  /** Cancels a fresh target-card play or Hero Power through the engine. */
  function cancelTarget(): boolean {
    const pending = game.pendingTarget;
    if (!pending || pending.player !== viewerId || (!pending.cancelPlay && !pending.cancelHeroPower)) return false;
    const action = uiActions.find((candidate) => candidate.type === "cancel_target" && candidate.player === viewerId);
    if (!action) return false;
    sfx.play("button");
    perform(action);
    return true;
  }

  function trackTargetPointer(event: React.PointerEvent<HTMLElement>) {
    if (game.phase === "main" && selection?.kind === "attacker" && !drag?.active) {
      pointer.schedule({ x: event.clientX, y: event.clientY });
      return;
    }
    if (
      game.phase !== "targeting" ||
      !pendingTarget ||
      pendingTarget.player !== viewerId ||
      (pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" && pendingTarget.kind !== "boardOrCore")
    ) {
      return;
    }
    pointer.schedule({ x: event.clientX, y: event.clientY });
  }

  function onHandCard(handIndex: number) {
    if (duelIntro) return;
    if (game.phase === "main" && selection?.kind === "hand" && selection.handIndex === handIndex) {
      setSelection(null);
      return;
    }
    if (game.phase === "main" && selection?.kind === "attacker") {
      cancelAttackerSelection();
      return;
    }
    if (
      game.phase === "targeting" &&
      game.pendingTarget?.player === viewerId &&
      (game.pendingTarget.cancelPlay || game.pendingTarget.cancelHeroPower)
    ) {
      cancelTarget();
      return;
    }
    if (game.phase !== "main") {
      setSelection(null);
      return;
    }
    const canPlay = uiActions.some(
      (action) => (action.type === "play_card" || action.type === "play_relic") && action.handIndex === handIndex,
    );
    if (!canPlay) {
      // Every card in hand looks equally playable now, so the reason is said
      // once, briefly, in the middle of the board — not branded on the card.
      setSelection(null);
      // NAME THE REASON. A relic refused by Kratos used to be reported as "No
      // room on the board", which is a different problem with a different fix
      // and sends the player rearranging a board that was never the issue.
      const card = library[viewer.hand[handIndex]];
      const relicLock = card && isRelicCard(card) ? relicLockSource(game, viewerId) : null;
      const requiredAlignment = card && isRelicCard(card) ? relicRequiredAlignment(card.relicId, card.effect) : null;
      const noEligibleBearer = requiredAlignment !== null &&
        !viewer.board.some((slot) => slot?.alignment === requiredAlignment && hasFreeRelicSlot(slot));
      const boardFull = !viewer.board.some((slot) => !slot);
      fx.showToast(
        relicLock
          ? `${relicLock} is blocking your relics`
          : noEligibleBearer
            ? `No ${requiredAlignment} minions`
          : boardFull
            ? "No room on the board"
            : "Not enough mana",
      );
      sfx.play("invalid");
      return;
    }
    setSelection({ kind: "hand", handIndex });
  }

  /**
   * Selects a minion to attack with, and warns when its swing will be rolled
   * rather than aimed — Kurogiri, or a Bill Cipher slot. Said at the moment
   * of decision, because the redirect happens after the target is chosen.
   */
  function armAttacker(slotIndex: number) {
    setSelection({ kind: "attacker", slotIndex });
    const sourceElement = document.querySelector<HTMLElement>(`[data-slot="${viewerId}-${slotIndex}"]`);
    const bounds = sourceElement?.getBoundingClientRect();
    if (bounds) {
      const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      setTargetArrowOrigin(origin);
      pointer.set(origin);
    }
    const minion = viewer.board[slotIndex];
    if (minion && attacksRandomly(game, minion)) fx.showToast("Swinging blind — the target is rolled");
  }

  /** Drop an armed attack without spending the minion's attack. */
  function cancelAttackerSelection(): boolean {
    if (selection?.kind !== "attacker") return false;
    sfx.play("button");
    setSelection(null);
    clearHoverPreview();
    setTargetArrowOrigin(null);
    return true;
  }

  /** Flash the live Taunt blockers when an aimed attack tries to pass them. */
  function flashTauntBlockers(targetSlot?: number): boolean {
    if (game.phase !== "main" || selection?.kind !== "attacker") return false;
    const attackerSlot = selection.slotIndex;
    const legalAttackTargets = new Set(
      uiActions
        .filter(
          (action): action is Extract<GameAction, { type: "attack_minion" }> =>
            action.type === "attack_minion" && action.attackerSlot === attackerSlot,
        )
        .map((action) => action.targetSlot),
    );
    if (targetSlot !== undefined && legalAttackTargets.has(targetSlot)) return false;

    const blockerIds = game.players[opponentId].board
      .map((minion, slot) => ({ minion, slot }))
      .filter(
        ({ minion, slot }) =>
          Boolean(minion) &&
          !minion!.silenced &&
          minion!.keywords.includes("Taunt") &&
          legalAttackTargets.has(slot),
      )
      .map(({ minion }) => minion!.instanceId);
    if (blockerIds.length === 0) return false;

    fx.flashTaunt(blockerIds);
    return true;
  }

  function onBoardSlot(owner: PlayerId, slotIndex: number) {
    if (duelIntro) return;
    const minion = game.players[owner].board[slotIndex];

    if (game.phase === "targeting") {
      const chosen = chooseTargetAt(owner, slotIndex);
      if (!chosen) cancelTarget();
      return;
    }
    if (game.phase !== "main") return;

    if (selection?.kind === "hand" && owner === viewerId) {
      const action = uiActions.find(
        (candidate) =>
          (candidate.type === "play_card" || candidate.type === "play_relic") &&
          candidate.player === viewerId &&
          candidate.handIndex === selection.handIndex &&
          candidate.slotIndex === slotIndex,
      );
      if (action) {
        perform(action);
        return;
      }
      // No placement here -- the slot already holds one of your own minions.
      // Fall through so the click ARMS that minion instead of being swallowed:
      // returning here meant picking up a card silently disabled attacking, and
      // you had to place the card before you could swing with anything.
    }

    if (selection?.kind === "attacker") {
      if (owner !== opponentId) {
        cancelAttackerSelection();
        return;
      }
      const action = uiActions.find(
        (candidate) =>
          candidate.type === "attack_minion" &&
          candidate.attackerSlot === selection.slotIndex &&
          candidate.targetSlot === slotIndex,
      );
      if (action) perform(action);
      else if (!minion || !flashTauntBlockers(slotIndex)) cancelAttackerSelection();
      return;
    }

    if (owner === viewerId && minion) {
      const hasAttack = uiActions.some(
        (action) =>
          (action.type === "attack_minion" || action.type === "attack_core") &&
          action.player === viewerId &&
          action.attackerSlot === slotIndex,
      );
      if (hasAttack) armAttacker(slotIndex);
    }
  }

  // ------------------------------------------------------------- drag & drop
  function startHandDrag(e: React.PointerEvent<HTMLElement>, handIndex: number, playable: boolean) {
    if (duelIntro) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") return;
    if (game.phase !== "main" || !playable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no active pointer — drag still works without capture
    }
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({ kind: "hand", handIndex, cardId: viewer.hand[handIndex], active: false });
  }

  function startAttackDrag(e: React.PointerEvent<HTMLElement>, slotIndex: number, canAttack: boolean) {
    if (duelIntro) return;
    if (e.pointerType === "touch") return;
    if (game.phase !== "main" || !canAttack) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // see above
    }
    const r = e.currentTarget.getBoundingClientRect();
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({
      kind: "attacker",
      slotIndex,
      ox: r.left + r.width / 2,
      oy: r.top + r.height / 2,
      active: false,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const becameActive =
      !drag.active &&
      Math.hypot(e.clientX - dragOrigin.current.x, e.clientY - dragOrigin.current.y) > DRAG_THRESHOLD;
    if (becameActive) {
      clearHoverPreview();
      sfx.play("pickup");
      if (drag.kind === "hand") setSelection({ kind: "hand", handIndex: drag.handIndex });
      else {
        armAttacker(drag.slotIndex);
        setTargetArrowOrigin(null);
      }
    }
    // Activate immediately so a release before the next frame still drops the card.
    if (becameActive) {
      pointer.set({ x: e.clientX, y: e.clientY });
      setDrag({ ...drag, active: true });
    } else if (drag.active) pointer.schedule({ x: e.clientX, y: e.clientY });
  }

  function endDrag(e: React.PointerEvent) {
    if (e.pointerType === "touch") clearHoverPreview();
    if (!drag) return;
    if (!drag.active) {
      // Never moved past the threshold — this is a plain click; let onClick handle it.
      setDrag(null);
      return;
    }
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest("[data-slot]") ?? null;
    const heroEl = el?.closest("[data-hero]") ?? null;
    let performed = false;
    if (drag.kind === "hand" && slotEl) {
      const [ownerStr, slotStr] = (slotEl.getAttribute("data-slot") ?? "").split("-");
      if (Number(ownerStr) === viewerId) {
        const slotIndex = Number(slotStr);
        const action = uiActions.find(
          (candidate) =>
            (candidate.type === "play_card" || candidate.type === "play_relic") &&
            candidate.handIndex === drag.handIndex &&
            candidate.slotIndex === slotIndex,
        );
        if (action) {
          perform(action);
          performed = true;
        }
      }
    } else if (drag.kind === "attacker") {
      if (slotEl) {
        const [ownerStr, slotStr] = (slotEl.getAttribute("data-slot") ?? "").split("-");
        if (Number(ownerStr) === opponentId) {
          const targetSlot = Number(slotStr);
          const action = uiActions.find(
            (candidate) =>
              candidate.type === "attack_minion" &&
              candidate.attackerSlot === drag.slotIndex &&
              candidate.targetSlot === targetSlot,
          );
          if (action) {
            perform(action);
            performed = true;
          }
        }
      } else if (heroEl && Number(heroEl.getAttribute("data-hero")) === opponentId) {
        const action = uiActions.find(
          (candidate) => candidate.type === "attack_core" && candidate.attackerSlot === drag.slotIndex,
        );
        if (action) {
          perform(action);
          performed = true;
        }
      }
    }
    if (!performed) {
      sfx.play("invalid");
      const apexBlocked=drag.kind==='attacker'&&heroEl&&Number(heroEl.getAttribute('data-hero'))===opponentId&&flashApexRestriction();
      if(!apexBlocked&&!cancelAttackerSelection())setSelection(null);
    }
    clearHoverPreview();
    setDrag(null);
  }

  function cancelDrag() {
    // `pointercancel` is the NORMAL path on a phone: the row scrollers take
    // horizontal swipes via `touch-action: pan-x`, and the browser cancels the
    // pointer the moment it claims one. The preview has to close with it.
    clearHoverPreview();
    if (!drag) return;
    if (drag.active) {
      sfx.play("invalid");
      if (!cancelAttackerSelection()) setSelection(null);
    }
    setDrag(null);
  }

  const guardedHandClick = (handIndex: number) => {
    if (suppressClick.current) return;
    onHandCard(handIndex);
  };

  const guardedSlotClick = (owner: PlayerId, slotIndex: number) => {
    if (suppressClick.current) return;
    onBoardSlot(owner, slotIndex);
  };

  const apexBodies=game.heroPowers[opponentId]==='yujiro_apex_duel'?viewer.board.filter((m):m is MinionInstance=>Boolean(m)):[];
  const apexAttack=Math.max(-1,...apexBodies.map(m=>m.atk));
  const apexPrey=(selection?.kind==='attacker'?apexBodies.find(m=>m===viewer.board[selection.slotIndex]&&m.atk===apexAttack):null)??apexBodies.find(m=>m.atk===apexAttack);
  function flashApexRestriction():boolean {
    const attacker=selection?.kind==='attacker'?viewer.board[selection.slotIndex]:null;
    if(game.heroPowers[opponentId]!=='yujiro_apex_duel'||!attacker||attacker.atk>=apexAttack)return false;
    const marker=fx.nextId();setEnemyPowerOpen(true);setApexAlert(marker);
    window.setTimeout(()=>setApexAlert(current=>current===marker?null:current),1100);
    return true;
  }
  function attackCore() {
    if (selection?.kind !== "attacker") return;
    const action = uiActions.find(
      (candidate) => candidate.type === "attack_core" && candidate.attackerSlot === selection.slotIndex,
    );
    if (action) perform(action);
    else if (!flashApexRestriction()&&!flashTauntBlockers()) cancelAttackerSelection();
  }

  const targetSourceKey = pendingTarget
    ? pendingTarget.heroPowerId
      ? `hero-power:${pendingTarget.heroPowerId}`
      : `board:${pendingTarget.sourceOwner}:${pendingTarget.sourceInstanceId}`
    : null;

  // Target arrows are view-only, but their origin belongs to the real source:
  // the Hero Power button for a power, or the minion that opened a card effect.
  // Resolve it after the pending target renders so the arrow follows responsive
  // layout instead of guessing from the board grid.
  useEffect(() => {
    if (
      game.phase !== "targeting" ||
      !pendingTarget ||
      pendingTarget.player !== viewerId ||
      (pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" && pendingTarget.kind !== "boardOrCore")
    ) {
      setTargetArrowOrigin(null);
      return;
    }

    let sourceElement: HTMLElement | null = null;
    if (pendingTarget.heroPowerId) {
      sourceElement = document.querySelector<HTMLElement>(".hero-power-button");
    } else {
      const sourceSlot = game.players[pendingTarget.sourceOwner].board.findIndex(
        (minion) => minion?.instanceId === pendingTarget.sourceInstanceId,
      );
      if (sourceSlot >= 0) {
        sourceElement = document.querySelector<HTMLElement>(`[data-slot="${pendingTarget.sourceOwner}-${sourceSlot}"]`);
      }
    }

    const bounds = sourceElement?.getBoundingClientRect();
    if (!bounds) {
      setTargetArrowOrigin(null);
      return;
    }
    const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    setTargetArrowOrigin(origin);
    pointer.set(origin);
  }, [game.phase, pendingTarget?.kind, targetSourceKey, viewerId]);

  return {
    apexAlert, apexPrey, attackCore, cancelAttackerSelection, cancelDrag, cancelTarget, endDrag,
    guardedHandClick, guardedSlotClick, moveDrag, startAttackDrag, startHandDrag, trackTargetPointer,
  };
}
