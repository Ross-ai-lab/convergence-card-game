/**
 * The wire for an online duel: one PeerJS data connection between two browsers.
 *
 * PeerJS's free public server only introduces the two browsers; the duel itself
 * travels directly between them, or through PeerJS's public relay when a
 * network blocks direct connections. No account, no server of our own.
 * Messages are JSON, the same format a saved duel uses, so a state that
 * survives a save survives the trip.
 *
 * The library is loaded only when someone opens an online room, so it adds
 * nothing to the game's first load.
 */
import type { DataConnection, Peer as PeerType, PeerError } from "peerjs";
import { parseMessage, roomPeerId, type OnlineMessage } from "./protocol";

export interface WireEvents {
  /** A connection is open and can carry messages. */
  onOpen: () => void;
  onMessage: (message: OnlineMessage) => void;
  /** The connection closed or failed; `reason` is shown to the player. */
  onClose: (reason: string) => void;
}

export interface Wire {
  send: (message: OnlineMessage) => void;
  close: () => void;
}

async function loadPeer(): Promise<typeof PeerType> {
  const module = await import("peerjs");
  return module.Peer;
}

/** What a PeerJS failure means to a player, in plain words. */
export function describePeerError(error: Pick<PeerError<string>, "type"> | { type?: string }): string {
  switch (error.type) {
    case "peer-unavailable": return "No room with that code is open. Check the code, or ask your friend to create the room again.";
    case "unavailable-id": return "That room code is already in use.";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed": return "The connection service could not be reached. Check the internet connection and try again.";
    case "browser-incompatible": return "This browser cannot make direct connections.";
    case "webrtc": return "The direct connection failed. Some networks block it; try another network.";
    default: return "The connection failed. Try again.";
  }
}

function attach(conn: DataConnection, events: WireEvents, onGone: () => void): Wire {
  let closed = false;
  const close = (reason: string) => {
    if (closed) return;
    closed = true;
    onGone();
    events.onClose(reason);
  };
  conn.on("open", () => events.onOpen());
  conn.on("data", (data) => {
    const message = parseMessage(data);
    if (message) events.onMessage(message);
  });
  conn.on("close", () => close("The connection closed."));
  conn.on("error", () => close("The connection failed."));
  return {
    send: (message) => { if (!closed && conn.open) conn.send(message); },
    close: () => { if (!closed) { closed = true; onGone(); conn.close(); } },
  };
}

export interface HostRoom {
  close: () => void;
}

/**
 * Opens a room under `code` and waits. Each guest that connects gets its own
 * wire through `onGuest`; the host decides whether to keep it. A guest that
 * drops and reconnects simply arrives again.
 */
export async function hostRoom(code: string, handlers: {
  onReady: () => void;
  onGuest: (makeWire: (events: WireEvents) => Wire) => void;
  onError: (reason: string, type?: string) => void;
}): Promise<HostRoom> {
  const Peer = await loadPeer();
  const peer = new Peer(roomPeerId(code), { debug: 0 });
  let destroyed = false;
  peer.on("open", () => handlers.onReady());
  peer.on("connection", (conn) => {
    handlers.onGuest((events) => attach(conn, events, () => undefined));
  });
  peer.on("disconnected", () => { if (!destroyed) peer.reconnect(); });
  peer.on("error", (error) => handlers.onError(describePeerError(error), error.type));
  return { close: () => { destroyed = true; peer.destroy(); } };
}

/** Connects to the room under `code`. */
export async function joinRoom(code: string, events: WireEvents & { onError: (reason: string, type?: string) => void }): Promise<Wire> {
  const Peer = await loadPeer();
  const peer = new Peer({ debug: 0 });
  let wire: Wire | null = null;
  let gone = false;
  const destroy = () => { if (!gone) { gone = true; peer.destroy(); } };
  peer.on("error", (error) => {
    events.onError(describePeerError(error), error.type);
    destroy();
  });
  peer.on("open", () => {
    const conn = peer.connect(roomPeerId(code), { reliable: true, serialization: "json" });
    wire = attach(conn, events, destroy);
  });
  return {
    send: (message) => wire?.send(message),
    close: () => { wire?.close(); destroy(); },
  };
}
