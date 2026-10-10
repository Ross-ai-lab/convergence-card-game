/**
 * The online room's lifecycle, for the app: create or join a room, the hello
 * handshake, and a guest reconnecting after its connection drops. What the
 * messages MEAN for the duel is the app's business; this only delivers them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { hostRoom, joinRoom, type HostRoom, type Wire } from "./connection";
import { BUILD_FINGERPRINT, newRoomCode, ONLINE_PROTOCOL, type OnlineMessage } from "./protocol";
import type { HeroPowerId } from "../engine/types";

export type OnlineRole = "host" | "guest";

export type OnlineStatus =
  | { phase: "idle" }
  /** Asking the public server for the room. */
  | { phase: "opening"; role: OnlineRole; code: string }
  /** Host: the room is open and nobody has joined yet. */
  | { phase: "waiting"; role: "host"; code: string }
  | { phase: "connected"; role: OnlineRole; code: string; opponent: string }
  /** The connection dropped; the guest is trying to come back. */
  | { phase: "lost"; role: OnlineRole; code: string; opponent: string }
  /** Over: the reason is shown to the player. */
  | { phase: "closed"; reason: string };

/** How long a guest keeps trying to come back, and how often. */
const RECONNECT_FOR_MS = 60_000;
const RECONNECT_EVERY_MS = 3_000;

export type HelloMessage = Extract<OnlineMessage, { t: "hello" }>;

export interface OnlineHandlers {
  /**
   * Host only: a guest said hello. Return a reason to refuse it, or null to
   * accept. `returning` is true when it is the same guest coming back.
   */
  onHello: (hello: HelloMessage, returning: boolean) => string | null;
  /** Every other message, from the current opponent only. */
  onMessage: (message: OnlineMessage) => void;
  /** The opponent left on purpose, or could not come back in time. */
  onOpponentGone: (reason: string) => void;
}

export function useOnlineSession(handlers: OnlineHandlers) {
  const [status, setStatus] = useState<OnlineStatus>({ phase: "idle" });
  const latest = useRef(handlers);
  latest.current = handlers;
  const room = useRef<HostRoom | null>(null);
  const wire = useRef<Wire | null>(null);
  const guestToken = useRef<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const leaving = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const stopReconnect = () => {
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  };

  const teardown = useCallback(() => {
    stopReconnect();
    wire.current?.close();
    wire.current = null;
    room.current?.close();
    room.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  /** Opens a room; tries a fresh code if the first is somehow taken. */
  const host = useCallback(async (attempt = 0) => {
    teardown();
    leaving.current = false;
    guestToken.current = null;
    const code = newRoomCode();
    setStatus({ phase: "opening", role: "host", code });
    try {
      room.current = await hostRoom(code, {
        onReady: () => setStatus((current) => (current.phase === "opening" ? { phase: "waiting", role: "host", code } : current)),
        onError: (reason, type) => {
          if (type === "unavailable-id" && attempt < 3) { void host(attempt + 1); return; }
          // A guest that vanished mid-handshake is not the room failing.
          if (type === "peer-unavailable") return;
          teardown();
          setStatus({ phase: "closed", reason });
        },
        onGuest: (makeWire) => {
          let candidate: Wire | null = null;
          candidate = makeWire({
            onOpen: () => undefined,
            onMessage: (message) => {
              if (message.t === "hello") {
                const returning = guestToken.current !== null && guestToken.current === message.token;
                const busy = guestToken.current !== null && !returning;
                const refusal = message.v !== ONLINE_PROTOCOL || message.build !== BUILD_FINGERPRINT
                  ? "You are playing different versions of the game. Both of you should refresh the page."
                  : busy ? "This room already has two players." : latest.current.onHello(message, returning);
                if (refusal) {
                  candidate?.send({ t: "reject", reason: refusal });
                  window.setTimeout(() => candidate?.close(), 300);
                  return;
                }
                if (wire.current && wire.current !== candidate) wire.current.close();
                wire.current = candidate;
                guestToken.current = message.token;
                setStatus({ phase: "connected", role: "host", code, opponent: message.name });
                return;
              }
              if (candidate !== wire.current) return;
              if (message.t === "leave") {
                guestToken.current = null;
                wire.current = null;
                latest.current.onOpponentGone("Your opponent left the duel.");
                setStatus({ phase: "waiting", role: "host", code });
                return;
              }
              latest.current.onMessage(message);
            },
            onClose: () => {
              if (candidate !== wire.current || leaving.current) return;
              wire.current = null;
              const current = statusRef.current;
              if (current.phase !== "connected") return;
              setStatus({ phase: "lost", role: "host", code, opponent: current.opponent });
              // The host waits for the guest to come back; after that it gives up.
              stopReconnect();
              reconnectTimer.current = window.setTimeout(() => {
                if (statusRef.current.phase !== "lost") return;
                guestToken.current = null;
                latest.current.onOpponentGone("Your opponent's connection was lost.");
                setStatus({ phase: "waiting", role: "host", code });
              }, RECONNECT_FOR_MS);
            },
          });
        },
      });
    } catch {
      setStatus({ phase: "closed", reason: "The online module could not be loaded. Check the internet connection." });
    }
  }, [teardown]);

  /** Joins a room by code, sending who we are; retries if the line drops mid-duel. */
  const join = useCallback(async (code: string, hello: { name: string; deck: string[]; heroPower: HeroPowerId | null }) => {
    teardown();
    leaving.current = false;
    // Kept per room in this tab, so a guest that reloads mid-duel comes back as
    // the same player and the host hands the duel back instead of refusing it.
    const tokenKey = `convergence.online.token.${code}`;
    let token = guestToken.current;
    try { token ??= sessionStorage.getItem(tokenKey); } catch { /* no storage: a fresh token */ }
    token ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try { sessionStorage.setItem(tokenKey, token); } catch { /* reload rejoin is a bonus */ }
    guestToken.current = token;
    const startedLosing = { at: 0 };
    const connect = async (retrying: boolean) => {
      if (!retrying) setStatus({ phase: "opening", role: "guest", code });
      try {
        wire.current = await joinRoom(code, {
          onOpen: () => {
            stopReconnect();
            wire.current?.send({ t: "hello", v: ONLINE_PROTOCOL, build: BUILD_FINGERPRINT, token: token!, ...hello });
          },
          onMessage: (message) => {
            if (message.t === "reject") {
              leaving.current = true;
              teardown();
              setStatus({ phase: "closed", reason: message.reason });
              return;
            }
            if (message.t === "leave") {
              leaving.current = true;
              teardown();
              latest.current.onOpponentGone("Your opponent left the duel.");
              setStatus({ phase: "closed", reason: "Your opponent left the duel." });
              return;
            }
            if (message.t === "start") {
              const current = statusRef.current;
              setStatus({ phase: "connected", role: "guest", code, opponent: current.phase === "connected" || current.phase === "lost" ? current.opponent : message.state.players[0]?.name ?? "Opponent" });
            }
            latest.current.onMessage(message);
          },
          onClose: () => {
            if (leaving.current) return;
            const current = statusRef.current;
            if (current.phase !== "connected" && current.phase !== "lost") return;
            if (current.phase === "connected") startedLosing.at = Date.now();
            setStatus({ phase: "lost", role: "guest", code, opponent: current.opponent });
            retryLater();
          },
          onError: (reason) => {
            const current = statusRef.current;
            if (current.phase === "lost") { retryLater(); return; }
            teardown();
            setStatus({ phase: "closed", reason });
          },
        });
      } catch {
        setStatus({ phase: "closed", reason: "The online module could not be loaded. Check the internet connection." });
      }
    };
    const retryLater = () => {
      stopReconnect();
      if (Date.now() - startedLosing.at > RECONNECT_FOR_MS) {
        leaving.current = true;
        teardown();
        latest.current.onOpponentGone("The connection to your opponent was lost.");
        setStatus({ phase: "closed", reason: "The connection to your opponent was lost." });
        return;
      }
      reconnectTimer.current = window.setTimeout(() => { void connect(true); }, RECONNECT_EVERY_MS);
    };
    await connect(false);
  }, [teardown]);

  const send = useCallback((message: OnlineMessage) => wire.current?.send(message), []);

  /** Leaves on purpose: tells the opponent, then closes everything. */
  const leave = useCallback(() => {
    leaving.current = true;
    wire.current?.send({ t: "leave" });
    const closing = { wire: wire.current, room: room.current };
    wire.current = null;
    room.current = null;
    guestToken.current = null;
    stopReconnect();
    // A moment for the goodbye to leave before the line is cut.
    window.setTimeout(() => { closing.wire?.close(); closing.room?.close(); }, 250);
    setStatus({ phase: "idle" });
  }, []);

  return { status, host, join, send, leave };
}
