/**
 * Online duels: what the two browsers say to each other.
 *
 * LOCKSTEP WITH A REFEREE. Both browsers hold the same GameState and run the
 * same deterministic engine. The host is the referee: it applies every step
 * first, numbers it, and sends it on; the guest asks the host to make its moves
 * and applies the host's numbered steps in order. Nothing is ever applied twice
 * or out of order, so the two games stay identical without sending the whole
 * board after every click. After each step the host also sends a fingerprint of
 * its state; a guest whose own fingerprint differs asks for the full state and
 * replaces its copy, so a mismatch heals instead of splitting the duel in two.
 *
 * A step is wider than an engine action because two things end a turn or a duel
 * without one: the turn clock running out, and a player conceding.
 */
import { cards, relics } from "../data/cards";
import type { GameAction, GameEvent, GameState, HeroPowerId, PlayerId } from "../engine/types";

/** Bumped whenever a message changes shape. */
export const ONLINE_PROTOCOL = 1;

export type OnlineStep =
  | { kind: "action"; action: GameAction }
  | { kind: "timeout"; player: PlayerId }
  | { kind: "concede"; player: PlayerId };

export type OnlineMessage =
  /** Guest to host, on connecting: who it is and what it brings. */
  | { t: "hello"; v: number; build: string; token: string; name: string; deck: string[]; heroPower: HeroPowerId | null }
  /** Host to guest: the connection is refused, and why. */
  | { t: "reject"; reason: string }
  /** Host to guest: a whole duel, at the start, after a rematch, or to resync. */
  | { t: "start"; seq: number; state: GameState; events: GameEvent[] }
  /** Host to guest: the next numbered step, and the state fingerprint after it. */
  | { t: "step"; seq: number; step: OnlineStep; hash: string }
  /** Guest to host: please make this move for me. */
  | { t: "request"; step: OnlineStep }
  /** Host to guest: that move changed nothing (not legal now), so input is free again. */
  | { t: "refused" }
  /** Guest to host: my copy differs, send the whole state. */
  | { t: "resync" }
  /** Either side: I am leaving this duel on purpose. */
  | { t: "leave" };

/**
 * A fingerprint of the card data. Two builds with different cards would run
 * different games from the same moves, so they refuse each other up front
 * instead of drifting apart a few turns in.
 */
export const BUILD_FINGERPRINT = fnv1a(JSON.stringify([cards, relics]));

/** FNV-1a, 32-bit, as hex. Fast, and plenty for spotting two different states. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stateFingerprint(state: GameState): string {
  return fnv1a(JSON.stringify(state));
}

/** Room codes: six characters, without the ones people misread (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function newRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("");
}

/** Accepts what a person types or pastes: any case, spaces, or a whole invite link. */
export function normaliseRoomCode(input: string): string | null {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(input)?.[1];
  const code = (fromLink ?? input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === ROOM_CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char)) ? code : null;
}

/** The address a room is reachable at on the public signalling server. */
export function roomPeerId(code: string): string {
  return `convergence-duel-${code.toLowerCase()}`;
}

export function inviteLink(code: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Rejects anything that is not a well-formed message, so a bad packet is dropped, not run. */
export function parseMessage(value: unknown): OnlineMessage | null {
  if (!isObject(value) || typeof value.t !== "string") return null;
  switch (value.t) {
    case "hello":
      return typeof value.v === "number" && typeof value.build === "string" && typeof value.token === "string" &&
        typeof value.name === "string" && Array.isArray(value.deck) && value.deck.every((id) => typeof id === "string") &&
        (value.heroPower === null || typeof value.heroPower === "string")
        ? (value as OnlineMessage) : null;
    case "reject":
      return typeof value.reason === "string" ? (value as OnlineMessage) : null;
    case "start":
      return typeof value.seq === "number" && isObject(value.state) && Array.isArray(value.events) ? (value as OnlineMessage) : null;
    case "step":
      return typeof value.seq === "number" && isStep(value.step) && typeof value.hash === "string" ? (value as OnlineMessage) : null;
    case "request":
      return isStep(value.step) ? (value as OnlineMessage) : null;
    case "resync":
    case "refused":
    case "leave":
      return value as OnlineMessage;
    default:
      return null;
  }
}

function isStep(value: unknown): value is OnlineStep {
  if (!isObject(value)) return false;
  if (value.kind === "action") return isObject(value.action) && typeof value.action.type === "string";
  if (value.kind === "timeout" || value.kind === "concede") return value.player === 0 || value.player === 1;
  return false;
}

/** The seat a step belongs to: only that seat may ask for it. */
export function stepPlayer(step: OnlineStep): PlayerId | undefined {
  return step.kind === "action" ? (step.action as { player?: PlayerId }).player : step.player;
}

/** A display name: trimmed, short, and never empty. */
export function cleanName(name: string, fallback: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, 20);
  return cleaned || fallback;
}
