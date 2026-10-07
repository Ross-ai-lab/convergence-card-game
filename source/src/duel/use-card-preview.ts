/**
 * Card previews and keyword panels for the duel: the enlarged hover card, the
 * two-second keyword panel on a resting hand card, and the reach highlight that
 * rings every minion the hovered one is affecting.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { effectiveCardCost, type CardLibrary } from "../engine/game";
import type { GameState, MinionInstance, PlayableCard, PlayerId, RelicInstance } from "../engine/types";
import type { KeywordEntry } from "../keywords";
import { handKeywordEntriesFor, minionKeywordEntriesFor } from "../card-presentation";
import { playableFace, relicFace } from "../card-face";
import { minionStates, reachOf, statClass } from "./board";
import type { HoverState } from "./panels";

/** The enlarged card keeps its original one-second hover delay. */
const HOVER_PREVIEW_DELAY_MS = 1000;
/**
 * How long the pointer must rest on a card in hand before its keywords appear.
 *
 * Two seconds (owner's ruling, 3 September 2026). Long enough that sweeping the
 * fan to read it never fires a panel, short enough that stopping on a card you
 * do not understand answers you without a click.
 */
const HAND_KEYWORD_DELAY_MS = 2000;
const BOARD_KEYWORD_DELAY_MS = 2000;

/** `dragActive` suppresses every preview while a card or attacker is being dragged. */
export function useCardPreview(game: GameState, library: CardLibrary, dragActive: boolean) {
  const [hover, setHover] = useState<HoverState>(null);
  const hoverTimer = useRef<number | null>(null);
  const hoverRequest = useRef(0);
  /**
   * The keyword panel for a card being rested on in hand, after two seconds.
   *
   * TWO SECONDS, not the ordinary hover delay. Sweeping across your own hand to
   * read it must not fire five panels, and a card whose keywords you want
   * explained is one you have stopped on. `left`/`top` are the card's top-right
   * corner in viewport coordinates, which is where the panel hangs.
   */
  const [handKeywords, setHandKeywords] = useState<{ entries: KeywordEntry[]; left: number; top: number } | null>(null);
  const handKeywordTimer = useRef<number | null>(null);
  const boardKeywordTimer = useRef<number | null>(null);
  /** The board minion under the pointer, for the reach highlight. */
  const [reachSource, setReachSource] = useState<string | null>(null);
  /**
   * Who that minion is currently affecting. Recomputed only when the pointer
   * moves to a different minion or the board itself changes, so a hover does
   * not walk both boards on every unrelated render.
   */
  const reach = useMemo(() => {
    if (!reachSource) return new Set<string>();
    const found = game.players.flatMap((player) => player.board).find((minion) => minion?.instanceId === reachSource);
    return found ? reachOf(game, found) : new Set<string>();
  }, [reachSource, game]);

  function clearHoverTimer() {
    hoverRequest.current += 1;
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    if (boardKeywordTimer.current !== null) window.clearTimeout(boardKeywordTimer.current);
    hoverTimer.current = null;
    boardKeywordTimer.current = null;
  }

  function clearHoverPreview() {
    clearHoverTimer();
    setHover(null);
  }

  function scheduleHoverPreview(preview: () => void) {
    clearHoverTimer();
    setHover(null);
    const request = hoverRequest.current;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (request === hoverRequest.current) preview();
    }, HOVER_PREVIEW_DELAY_MS);
  }

  /**
   * @param instant Skip the hover delay.
   *
   * The delay exists so that sweeping the pointer across your own hand does not
   * flash five card panels. A hand revealed by The Watcher is the opposite
   * situation: the whole point of the reveal is to read those cards, they are
   * 25px wide and unreadable without the panel, and a one-second wait per card
   * turns reading five of them into five seconds of hovering.
   */
  function previewCard(card: PlayableCard, el: HTMLElement, owner?: PlayerId, instant = false) {
    if (dragActive) return;
    const face = playableFace(card, owner === undefined ? undefined : effectiveCardCost(game, owner, card));
    const show = () => {
      if (!el.isConnected) return;
      sfx.hoverTick();
      const r = el.getBoundingClientRect();
      setHover({
        face,
        effect: card.effect,
        flavor: card.flavor,
        atkClass: "",
        hpClass: "",
        states: [],
        onBoard: false,
        extraEffects: [],
        keywordEntries: handKeywordEntriesFor(card),
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      });
    };
    if (instant) {
      clearHoverTimer();
      show();
      return;
    }
    scheduleHoverPreview(show);
  }

  function previewMinion(minion: MinionInstance, el: HTMLElement) {
    if (dragActive) return;
    // Set immediately, unlike the card preview below it. The reach highlight is
    // an answer to "what is this thing doing", and an answer that arrives after
    // the same delay as a full card panel arrives after the player has already
    // moved on.
    setReachSource(minion.instanceId);
    const def = library[minion.cardId];
    const grantedEffects = minion.gainedEffects.map((effect) => effect.text).filter(Boolean);
    const copiedPassive = minion.stolenPassiveText?.replace(/^Passive:\s*/i, "");
    const keywordEntries = minionKeywordEntriesFor(minion);
    scheduleHoverPreview(() => {
      if (!el.isConnected) return;
      sfx.hoverTick();
      const r = el.getBoundingClientRect();
      setHover({
        face: minion,
        effect: minion.silenced ? "" : minion.effect,
        flavor: def ? def.flavor : "",
        atkClass: statClass(minion.atk, minion.baseAtk),
        hpClass: minion.hp < minion.maxHp ? "is-hurt" : statClass(minion.maxHp, minion.baseHp),
        states: minionStates(minion, game.players[minion.owner].board),
        onBoard: true,
        extraEffects: minion.silenced
          ? []
          : [
              ...(grantedEffects.length ? [`Granted effect: ${grantedEffects.join(" • ")}`] : []),
              ...(copiedPassive ? [`Copied passive: ${copiedPassive}`] : []),
            ],
        keywordEntries: [],
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      });
      if (keywordEntries.length > 0) {
        boardKeywordTimer.current = window.setTimeout(() => {
          boardKeywordTimer.current = null;
          if (!el.isConnected) return;
          setHover((current) => current ? { ...current, keywordEntries } : current);
        }, Math.max(0, BOARD_KEYWORD_DELAY_MS - HOVER_PREVIEW_DELAY_MS));
      }
    });
  }

  // A relic used to be a 26px badge with a tooltip. Hovering it now shows the
  // whole Relic card, teal frame and all — the live face costs nothing
  // to point at a different card.
  function previewRelic(relic: RelicInstance, el: HTMLElement) {
    if (dragActive) return;
    const face = relicFace(relic);
    clearHoverTimer();
    sfx.hoverTick();
    const r = el.getBoundingClientRect();
    setHover({
      face,
      effect: face.effect,
      flavor: face.flavor ?? "",
      atkClass: "",
      hpClass: "",
      states: [],
      onBoard: false,
      extraEffects: [],
      keywordEntries: [],
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    });
  }

  /** Cancels a pending hand-keyword panel and hides any open one. */
  const clearHandKeywords = useCallback(() => {
    if (handKeywordTimer.current !== null) {
      window.clearTimeout(handKeywordTimer.current);
      handKeywordTimer.current = null;
    }
    setHandKeywords(null);
  }, []);

  /**
   * Arms the two-second keyword panel for one card in hand.
   *
   * Reads everything the card PRINTS, in the order it prints it, and looks each
   * word up in the one glossary the How to play screen also renders from. A card
   * with no glossary word on it arms nothing, so plenty of cards never show a
   * panel at all — which is what keeps it from becoming wallpaper.
   */
  function armHandKeywords(card: PlayableCard | undefined, el: HTMLElement) {
    clearHandKeywords();
    if (!card || dragActive) return;
    const entries = handKeywordEntriesFor(card);
    if (entries.length === 0) return;
    handKeywordTimer.current = window.setTimeout(() => {
      handKeywordTimer.current = null;
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      setHandKeywords({ entries, left: rect.right, top: rect.top });
    }, HAND_KEYWORD_DELAY_MS);
  }

  function endPreview() {
    setReachSource(null);
    clearHoverPreview();
  }

  return {
    hover, handKeywords, reach,
    previewCard, previewMinion, previewRelic, endPreview, clearHoverPreview, armHandKeywords, clearHandKeywords,
  };
}
