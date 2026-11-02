/**
 * The emote menu that opens from the player's portrait, and the speech bubbles
 * emotes and replies appear in.
 *
 * Both are positioned from the portrait's measured box rather than nested in
 * it. The phone duel turns the player's plate into a fixed health gem in the
 * corner, and the desktop duel keeps it in the command bar; reading the box
 * puts the menu and the bubbles beside the portrait in either layout.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { sfx } from "../audio/sfx";
import type { PlayerId } from "../engine/types";
import { EMOTES, emoteBubbleDuration, type EmoteId } from "../emotes";
import { emoteVoiceDuration } from "./duel-setup";

export interface EmoteBubble {
  id: number;
  owner: PlayerId;
  speaker: string;
  text: string;
  /** The speaker's camp colour, for a champion. */
  accent?: string;
}

/**
 * One bubble per seat, each cleared by its own timer, and at most one pending
 * reply. `clear` drops everything, for a new duel or leaving the board.
 *
 * A line with a recording is spoken on the campaign voice channel, which keeps
 * one voice at a time: an emote cuts a story line short, and the next line cuts
 * the emote.
 */
export function useEmoteBubbles() {
  const [bubbles, setBubbles] = useState<Partial<Record<PlayerId, EmoteBubble>>>({});
  const serial = useRef(0);
  const timers = useRef<Partial<Record<PlayerId, number>>>({});
  const reply = useRef<number | null>(null);

  const say = useCallback((owner: PlayerId, speaker: string, text: string, accent?: string, voice?: string | null) => {
    const bubble: EmoteBubble = { id: ++serial.current, owner, speaker, text, accent };
    if (voice) sfx.playBossSpeech(voice);
    window.clearTimeout(timers.current[owner]);
    timers.current[owner] = window.setTimeout(() => {
      setBubbles((current) => (current[owner]?.id === bubble.id ? { ...current, [owner]: undefined } : current));
    }, emoteBubbleDuration(text, voice ? emoteVoiceDuration(voice) : 0));
    setBubbles((current) => ({ ...current, [owner]: bubble }));
  }, []);

  /** Says `text` after `delay`, unless a reply is already on its way. */
  const sayLater = useCallback((delay: number, owner: PlayerId, speaker: string, text: string, accent?: string, voice?: string | null) => {
    if (reply.current !== null) return false;
    reply.current = window.setTimeout(() => {
      reply.current = null;
      say(owner, speaker, text, accent, voice);
    }, delay);
    return true;
  }, [say]);

  const clear = useCallback(() => {
    for (const timer of Object.values(timers.current)) window.clearTimeout(timer);
    timers.current = {};
    if (reply.current !== null) window.clearTimeout(reply.current);
    reply.current = null;
    setBubbles({});
  }, []);

  useEffect(() => clear, [clear]);
  return { bubbles, say, sayLater, clear };
}

/** The portrait's box, kept current while the window resizes or rotates. */
function usePortraitBox(owner: PlayerId) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const measure = () => setBox(document.querySelector(`.hero-plate[data-hero="${owner}"]`)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [owner]);
  return box;
}

const MENU_WIDTH = 236;
const MENU_HEIGHT = 92;
const EDGE = 8;

/**
 * Four emotes above the portrait, as Hearthstone gathers its emotes around the
 * hero. Picking one, Escape, or a press anywhere else closes it.
 */
export function EmoteMenu({ owner, onPick, onClose }: { owner: PlayerId; onPick: (id: EmoteId) => void; onClose: () => void }) {
  const box = usePortraitBox(owner);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // The portrait toggles the menu itself; closing here as well would reopen it.
      if (menu.current?.contains(target) || target?.closest(`.hero-plate[data-hero="${owner}"]`)) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key, true); };
  }, [owner, onClose]);
  useEffect(() => { menu.current?.querySelector("button")?.focus({ preventScroll: true }); }, [box !== null]);
  if (!box) return null;
  // Centred above the portrait, inside the window.
  const anchorX = box.left + box.width / 2;
  const left = Math.max(EDGE, Math.min(window.innerWidth - MENU_WIDTH - EDGE, anchorX - MENU_WIDTH / 2));
  const top = Math.max(EDGE, box.top - MENU_HEIGHT - 10);
  return (
    <div
      ref={menu}
      className="emote-menu"
      role="menu"
      aria-label="Emotes"
      style={{ left, top, "--emote-origin": `${anchorX - left}px 100%` } as CSSProperties}
    >
      {EMOTES.map((emote, index) => (
        <button
          key={emote.id}
          type="button"
          role="menuitem"
          className={`emote-option emote-${emote.id}`}
          style={{ "--emote-i": index } as CSSProperties}
          onClick={() => onPick(emote.id)}
        >
          {emote.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A speech bubble beside a portrait: above the player's, below the opponent's,
 * so it never covers the portrait it belongs to.
 */
export function EmoteSpeech({ bubble, enemy }: { bubble: EmoteBubble; enemy: boolean }) {
  const box = usePortraitBox(bubble.owner);
  const self = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => { setWidth(self.current?.offsetWidth ?? 0); }, [bubble.id, bubble.text]);
  if (!box) return null;
  const anchorX = enemy ? box.left + box.width / 2 : box.left + Math.min(box.width / 2, 70);
  const left = Math.max(EDGE, Math.min(window.innerWidth - width - EDGE, anchorX - width / 2));
  const style: Record<string, string | number> = {
    left,
    "--emote-tail": `${Math.max(14, Math.min(width - 14, anchorX - left))}px`,
  };
  if (enemy) style.top = box.bottom + 12;
  else style.bottom = window.innerHeight - box.top + 12;
  if (bubble.accent) style["--emote-accent"] = bubble.accent;
  return (
    <div
      ref={self}
      className={`emote-speech ${enemy ? "is-enemy" : "is-mine"}`}
      role="status"
      data-emote-owner={bubble.owner}
      style={style as CSSProperties}
    >
      <b>{bubble.speaker}</b>
      <span>{bubble.text}</span>
    </div>
  );
}
