/** The opening beats of a fresh duel: rift, reveal, opening deal, mana and exit. */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { sfx } from "../audio/sfx";
import type { DuelIntroState } from "./fx";
import type { DuelIntroPhase } from "../screens/Screens";

// Keep this schedule aligned with the opening animation table in the project
// README. The intro ends after the mana reveal; opening card flights continue
// as pointer-free visual polish instead of blocking the first action.
export const DUEL_INTRO_TIMINGS = {
  preludeMs: 1_860,
  revealMs: 1_680,
  drawMs: 3_430,
  manaMs: 570,
  exitMs: 315,
} as const;

// A fresh duel has a complete opening state immediately, but the player
// should experience that state arriving in beats. The intro is view-only:
// it never changes the engine state, it only unlocks the already-created
// board after the rift, opening deal, and mana reveal have landed.
export function useDuelIntroSchedule(
  duelIntro: DuelIntroState | null,
  setDuelIntro: Dispatch<SetStateAction<DuelIntroState | null>>,
  onDeal: () => void,
) {
  useEffect(() => {
    if (!duelIntro) return;
    const { id, phase } = duelIntro;
    const moveTo = (nextPhase: DuelIntroPhase) => {
      setDuelIntro((current) => (current && current.id === id ? { ...current, phase: nextPhase } : current));
    };

    if (phase === "prelude") {
      const timer = window.setTimeout(() => moveTo("reveal"), DUEL_INTRO_TIMINGS.preludeMs);
      return () => window.clearTimeout(timer);
    }
    if (phase === "reveal") {
      sfx.play("turn", 0.08);
      const timer = window.setTimeout(() => moveTo("draw"), DUEL_INTRO_TIMINGS.revealMs);
      return () => window.clearTimeout(timer);
    }
    if (phase === "draw") {
      const frame = window.requestAnimationFrame(() => {
        onDeal();
      });
      const timer = window.setTimeout(() => moveTo("mana"), DUEL_INTRO_TIMINGS.drawMs);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (phase === "mana") {
      sfx.play("mana", 0.08);
      const timer = window.setTimeout(() => moveTo("exit"), DUEL_INTRO_TIMINGS.manaMs);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => setDuelIntro((current) => (current?.id === id ? null : current)),
      DUEL_INTRO_TIMINGS.exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [duelIntro]);
}
