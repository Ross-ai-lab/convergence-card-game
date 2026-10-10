import { useState } from "react";
import { GlobeHemisphereWest, Copy, Check } from "@phosphor-icons/react";
import { sfx } from "../audio/sfx";
import { inviteLink, normaliseRoomCode, ROOM_CODE_LENGTH } from "../online/protocol";
import type { OnlineStatus } from "../online/use-online-session";
import "./OnlineScreen.css";

/**
 * The online lobby: a name, your deck, and either a room to open or a code to
 * join. Once both players are in, the duel starts on its own and this closes.
 */
export function OnlineScreen({ status, name, deckLabel, deckReady, initialCode, onName, onHost, onJoin, onCancel, onEditDeck, onClose }: {
  status: OnlineStatus;
  name: string;
  /** "Starter Deck · Mend Core", say. */
  deckLabel: string;
  deckReady: boolean;
  /** A code from an invite link, already filled in. */
  initialCode: string;
  onName: (name: string) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onCancel: () => void;
  onEditDeck: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const parsed = normaliseRoomCode(code);
  const busy = status.phase === "opening" || status.phase === "waiting" || status.phase === "connected" || status.phase === "lost";
  const copy = async (what: "link" | "code", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };
  return (
    <div className="online-overlay" role="dialog" aria-modal="true" aria-label="Online duel">
      <section className="online-panel">
        <header className="online-header">
          <span className="online-sigil" aria-hidden="true"><GlobeHemisphereWest size={30} weight="duotone" /></span>
          <div>
            <h2>Online duel</h2>
            <p>Play a friend on another device. Share a room code; no account needed.</p>
          </div>
          <button type="button" className="online-close" aria-label="Close online duel" onClick={() => { sfx.play("button"); onClose(); }}>×</button>
        </header>

        {status.phase === "waiting" || (status.phase === "opening" && status.role === "host") ? (
          <div className="online-room">
            <span className="online-kicker">{status.phase === "opening" ? "Opening your room" : "Your room is open"}</span>
            <div className="online-code" aria-label={`Room code ${status.code.split("").join(" ")}`}>
              {status.code.split("").map((char, index) => <span key={index}>{char}</span>)}
            </div>
            <div className="online-copy-row">
              <button type="button" className="online-primary" disabled={status.phase !== "waiting"} onClick={() => copy("link", inviteLink(status.code, window.location))}>
                {copied === "link" ? <Check size={18} weight="bold" /> : <Copy size={18} />} {copied === "link" ? "Link copied" : "Copy invite link"}
              </button>
              <button type="button" className="online-secondary" disabled={status.phase !== "waiting"} onClick={() => copy("code", status.code)}>
                {copied === "code" ? "Code copied" : "Copy code"}
              </button>
            </div>
            <p className="online-waiting"><span className="online-dot" aria-hidden="true" />{status.phase === "opening" ? "Contacting the connection service…" : "Waiting for your friend to join. The duel starts as soon as they do."}</p>
            <button type="button" className="online-secondary" onClick={() => { sfx.play("button"); onCancel(); }}>Close the room</button>
          </div>
        ) : status.phase === "opening" ? (
          <div className="online-room">
            <span className="online-kicker">Joining room {status.code}</span>
            <p className="online-waiting"><span className="online-dot" aria-hidden="true" />Connecting to your friend…</p>
            <button type="button" className="online-secondary" onClick={() => { sfx.play("button"); onCancel(); }}>Cancel</button>
          </div>
        ) : (
          <>
            {status.phase === "closed" ? <p className="online-error" role="alert">{status.reason}</p> : null}
            <div className="online-identity">
              <label className="online-field">
                <span>Your name</span>
                <input value={name} maxLength={20} onChange={(event) => onName(event.target.value)} placeholder="Player" />
              </label>
              <div className="online-deck">
                <span>Your deck</span>
                <strong>{deckLabel}</strong>
                <button type="button" className="online-link" onClick={() => { sfx.play("button"); onEditDeck(); }}>Edit deck</button>
              </div>
            </div>
            {!deckReady ? <p className="online-error">Your deck needs exactly 30 cards before you can play online.</p> : null}
            <div className="online-choices">
              <div className="online-choice">
                <h3>Create a room</h3>
                <p>Get a six-letter code and an invite link to send to your friend.</p>
                <button type="button" className="online-primary" disabled={!deckReady || busy} onClick={() => { sfx.play("button"); onHost(); }}>Create a room</button>
              </div>
              <div className="online-choice">
                <h3>Join a room</h3>
                <p>Type the code your friend sent, or paste their invite link.</p>
                <form className="online-join" onSubmit={(event) => { event.preventDefault(); if (parsed && deckReady) { sfx.play("button"); onJoin(parsed); } }}>
                  <input
                    aria-label="Room code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={"•".repeat(ROOM_CODE_LENGTH)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" className="online-primary" disabled={!parsed || !deckReady || busy}>Join</button>
                </form>
              </div>
            </div>
            <p className="online-note">Both players use their own deck and Hero Power. Online duels do not award cards.</p>
          </>
        )}
      </section>
    </div>
  );
}
