/**
 * An online duel, for the app: the room, the numbered steps and the resyncs
 * that keep two browsers on one duel. `useOnlineSession` delivers the messages;
 * this decides what they mean. The app keeps the duel's state and is asked to
 * change it through the callbacks below, so both seats still run every move
 * through exactly the same code a local duel does.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cards, relics } from "../data/cards";
import { createDuelSeed } from "../duelSeed";
import { createInitialGame } from "../engine/game";
import { PLAYER_HERO_POWER_IDS } from "../engine/hero-powers";
import type { GameEvent, GameState, HeroPowerId, PlayerId } from "../engine/types";
import { CAMPAIGN_CARD_IDS } from "../progress";
import type { GameMode } from "../screens/Screens";
import { cleanName, continuesOnlineDuel, normaliseRoomCode, stateFingerprint, stepPlayer, type OnlineMessage, type OnlineStep } from "./protocol";
import { useOnlineSession, type HelloMessage } from "./use-online-session";
import type { EmoteId } from "../emotes";

type OnlineMode = Extract<GameMode, { kind: "online" }>;

const NAME_KEY = "convergence.online.name";
const ROOM_KEY = "convergence.online.room";

export interface OnlineDuelOptions {
  game: GameState;
  events: GameEvent[];
  mode: GameMode;
  /** What this browser brings: its deck and Hero Power. */
  deck: readonly string[];
  heroPower: HeroPowerId | null;
  /** Applies one step to this browser's duel and returns the state it produced. */
  applyStep: (step: OnlineStep) => GameState;
  /** Puts a new online duel on the table. `resumed` skips the opening ceremony. */
  seatDuel: (state: GameState, events: GameEvent[], mode: OnlineMode, resumed: boolean) => void;
  /** Swaps in the host's copy of the duel already on the table. */
  replaceState: (state: GameState) => void;
  /** The opponent walked away from a live duel, which concedes it to this seat. */
  winByDeparture: (winner: PlayerId, reason: string) => void;
  toast: (text: string) => void;
  /** The opponent said an emote. */
  onEmote: (emote: EmoteId) => void;
  /** An invite link was opened. */
  openLobby: () => void;
}

export function useOnlineDuel(options: OnlineDuelOptions) {
  const { game, mode } = options;
  const online = mode.kind === "online" ? mode : null;
  /** Online guest: a move is on its way to the host; input waits for the answer. */
  const [awaitingHost, setAwaitingHost] = useState(false);
  /** Host: the number of the last step sent. Guest: the last step applied. */
  const onlineSeq = useRef(0);
  /** Steps from the host (guest) or move requests from the guest (host), applied one per render. */
  const [inbox, setInbox] = useState<OnlineMessage[]>([]);
  /** Guest: its copy differed from the host's and a full state is on its way. */
  const awaitingResync = useRef(false);
  const guestHello = useRef<HelloMessage | null>(null);
  const returning = useRef(false);
  const [name, setNameState] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } });
  const [inviteCode] = useState(() => {
    // An invite link, or the room this tab was playing in before a reload.
    try { return normaliseRoomCode(window.location.search) ?? normaliseRoomCode(sessionStorage.getItem(ROOM_KEY) ?? "") ?? ""; } catch { return ""; }
  });
  const latest = useRef(options);
  latest.current = options;

  const session = useOnlineSession({
    onHello: (hello, isReturning) => {
      const roster = new Set(CAMPAIGN_CARD_IDS);
      const deckOk = hello.deck.length === 30 && new Set(hello.deck).size === 30 && hello.deck.every((id) => roster.has(id));
      if (!deckOk) return "Your deck must hold 30 different cards. Finish it in My Deck, then join again.";
      if (hello.heroPower !== null && !PLAYER_HERO_POWER_IDS.includes(hello.heroPower)) return "Your Hero Power is not available in this version.";
      guestHello.current = { ...hello, name: cleanName(hello.name, "Guest") };
      returning.current = isReturning;
      return null;
    },
    onMessage: (message) => {
      if (message.t === "start") { receiveStart(message); return; }
      if (message.t === "resync") { sendStart(); return; }
      if (message.t === "refused") { setAwaitingHost(false); return; }
      if (message.t === "emote") { latest.current.onEmote(message.emote); return; }
      if (message.t === "step" || message.t === "request") setInbox((items) => [...items, message]);
    },
    onOpponentGone: (reason) => {
      const current = latest.current;
      if (current.mode.kind !== "online" || current.game.phase === "gameOver") { current.toast(reason); return; }
      current.winByDeparture(current.mode.seat, reason);
    },
  });
  const status = session.status;

  // An invite link opens the online lobby with its code filled in, then tidies
  // the address so a reload does not reopen it.
  useEffect(() => {
    if (!inviteCode) return;
    latest.current.openLobby();
    try { window.history.replaceState(null, "", window.location.pathname); } catch { /* the code is already read */ }
  }, [inviteCode]);

  /** Host: applies a step and, if it changed the duel, numbers it and sends it on. */
  function commitStep(step: OnlineStep): boolean {
    const next = options.applyStep(step);
    if (next === game) return false;
    onlineSeq.current += 1;
    session.send({ t: "step", seq: onlineSeq.current, step, hash: stateFingerprint(next) });
    return true;
  }
  const commitRef = useRef(commitStep);
  commitRef.current = commitStep;
  /** Host: the turn clock ran out. Only the host's clock ends a turn. */
  const hostTimeout = useCallback((player: PlayerId) => { commitRef.current({ kind: "timeout", player }); }, []);

  /** Every move this browser makes: the host applies it, the guest asks the host to. */
  function submitStep(step: OnlineStep) {
    if (!online) return;
    if (online.seat === 0) { commitStep(step); return; }
    if (awaitingHost) return;
    setAwaitingHost(true);
    session.send({ t: "request", step });
  }

  // One inbox item per render, so each step is applied to the state the last one produced.
  useEffect(() => {
    if (!inbox.length || !online) return;
    const [message, ...rest] = inbox;
    setInbox(rest);
    if (online.seat === 0) {
      // Host: only the guest's own seat may move, and only legal moves change anything.
      if (message.t === "request" && !(stepPlayer(message.step) === 1 && commitStep(message.step))) session.send({ t: "refused" });
      return;
    }
    if (message.t !== "step" || awaitingResync.current || message.seq <= onlineSeq.current) return;
    setAwaitingHost(false);
    if (message.seq !== onlineSeq.current + 1) { awaitingResync.current = true; session.send({ t: "resync" }); return; }
    onlineSeq.current = message.seq;
    const next = options.applyStep(message.step);
    if (stateFingerprint(next) !== message.hash) { awaitingResync.current = true; session.send({ t: "resync" }); }
  }, [inbox, online, game]);

  // A request the host never answered (an illegal move, a dropped packet) frees the guest again.
  useEffect(() => {
    if (!awaitingHost) return;
    const timer = window.setTimeout(() => setAwaitingHost(false), 2500);
    return () => window.clearTimeout(timer);
  }, [awaitingHost]);

  /** Host: sends the whole duel as it stands, for a start, a rematch or a resync. */
  function sendStart(state = latest.current.game, opening = latest.current.events) {
    session.send({ t: "start", seq: onlineSeq.current, state, events: opening.slice(-60) });
  }

  /** Host: a guest is in. A returning guest gets the duel back; a new one gets a new duel. */
  useEffect(() => {
    if (status.phase !== "connected" || status.role !== "host") return;
    const current = latest.current;
    if (returning.current && current.mode.kind === "online" && current.game.phase !== "gameOver") { sendStart(); return; }
    startHostedDuel();
  }, [status]);

  /** Host: builds a duel from both decks, takes seat one, and sends it. Also the rematch. */
  function startHostedDuel() {
    const hello = guestHello.current;
    if (!hello || status.phase !== "connected") return;
    const seed = createDuelSeed();
    const built = createInitialGame(cards, seed, relics, {
      decks: [latest.current.deck, hello.deck], heroPowers: [latest.current.heroPower, hello.heroPower],
      mulliganPlayers: [0, 1], hasCoin: true,
    });
    built.players[0].name = cleanName(name, "Host");
    built.players[1].name = hello.name;
    // Both browsers must hold byte-identical states, so the host plays the copy
    // that has made the same JSON round trip the guest's has.
    const state = JSON.parse(JSON.stringify(built)) as GameState;
    const opening: GameEvent[] = [{ kind: "info", text: `${built.players[0].name} and ${built.players[1].name} meet online.` }];
    onlineSeq.current = 0;
    latest.current.seatDuel(state, opening, { kind: "online", seat: 0, room: status.code, duelId: seed }, false);
    sendStart(state, opening);
  }

  /** Guest: a whole duel arrived, new or as a resync of the current one. */
  function receiveStart(message: Extract<OnlineMessage, { t: "start" }>) {
    const current = latest.current;
    const room = status.phase === "connected" || status.phase === "lost" ? status.code : "";
    onlineSeq.current = message.seq;
    awaitingResync.current = false;
    setInbox([]);
    setAwaitingHost(false);
    if (continuesOnlineDuel(current.mode, message.seq, room)) { current.replaceState(message.state); return; }
    // A duel already under way (a reload rejoining) skips the opening ceremony.
    current.seatDuel(message.state, message.events, { kind: "online", seat: 1, room, duelId: String(message.state.rngSeed) }, message.seq > 0);
  }

  /** Leaves the online room on purpose. */
  function leave() {
    try { sessionStorage.removeItem(ROOM_KEY); } catch { /* nothing to forget */ }
    session.leave();
    setInbox([]);
    setAwaitingHost(false);
  }

  return {
    status,
    /** The room code an invite link or a reload brought, for the lobby to fill in. */
    inviteCode,
    name,
    setName(next: string) {
      setNameState(next);
      try { localStorage.setItem(NAME_KEY, next); } catch { /* a name is not worth an error */ }
    },
    awaitingHost,
    submitStep,
    /** Tells the other browser this seat said an emote. */
    sendEmote(emote: EmoteId) { session.send({ t: "emote", emote }); },
    hostTimeout,
    rematch: startHostedDuel,
    leave,
    host() { void session.host(); },
    join(code: string) {
      try { sessionStorage.setItem(ROOM_KEY, code); } catch { /* reload rejoin is a bonus */ }
      void session.join(code, { name: cleanName(name, "Guest"), deck: [...latest.current.deck], heroPower: latest.current.heroPower });
    },
  };
}
