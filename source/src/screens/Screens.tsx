/**
 * Everything that is not the board.
 *
 * The game used to boot straight into a duel: no title, no mode choice, no rules,
 * and a "Cheat On/Off" button in the top bar as the third thing a new player saw.
 * That is fine for the person who built it and impossible for anyone else, and
 * this game is meant to be handed to a brother.
 *
 * Four screens, all overlays over the live board so nothing here can break a duel
 * in progress:
 *   TitleScreen  — the front door: continue, solo at three difficulties, hotseat.
 *   HowToPlay     — the rules, in the order they matter, in one quick guide.
 *   SettingsPanel— sound controls and a route back to the title screen.
 *   PassScreen   — the hotseat privacy curtain. Without it, hotseat is not a game:
 *                  both players can read each other's hand off the same screen.
 */

import { useEffect, useState, type ReactNode } from "react";

import "./Screens.css";
import { sfx, type Bus, type Mix } from "../audio/sfx";
import { cards } from "../data/cards";
import type { BotSkill } from "../engine/bot";

export type GameMode = { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };

const SKILL_BLURB: Record<BotSkill, { title: string; note: string }> = {
  easy: { title: "Recruit", note: "Plays one move ahead, badly, and will let you win." },
  normal: { title: "Veteran", note: "Plays every single move correctly. Never sees the move after it." },
  hard: { title: "Ascendant", note: "Searches whole turns and answers what you are about to do." },
};

const FEATURED_NAMES = ["Neo", "Kizaru", "Batman", "Dio Brando", "Rennala Queen of the Full Moon"];
const FEATURED_CHARACTERS = FEATURED_NAMES.flatMap((name) => {
  const card = cards.find((entry) => entry.name === name);
  return card ? [{ name: card.name, art: card.art }] : [];
});

/** A starfield that does not need an asset, a canvas or a library. */
function Rift() {
  return (
    <div className="rift" aria-hidden="true">
      <span className="rift-core" />
      <span className="rift-ring rift-ring-a" />
      <span className="rift-ring rift-ring-b" />
      <span className="rift-ring rift-ring-c" />
    </div>
  );
}

function Overlay({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="screen-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={wide ? "screen-panel wide" : "screen-panel"} role="dialog" aria-label={title}>
        <header className="screen-panel-top">
          <h2>{title}</h2>
          <button type="button" className="screen-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="screen-panel-body">{children}</div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TitleScreen({
  canContinue,
  playerCount,
  onContinue,
  onStart,
  onSettings,
}: {
  canContinue: boolean;
  playerCount: number | null;
  onContinue: () => void;
  onStart: (mode: GameMode) => void;
  onSettings: () => void;
}) {
  const [skill, setSkill] = useState<BotSkill>("normal");

  return (
    <div className="title-screen">
      <Rift />
      <div className="title-inner">
        <p className="title-kicker">175 of fiction&rsquo;s greatest, pulled into one arena</p>
        <h1 className="title-word">
          {"CONVERGENCE".split("").map((letter, index) => (
            <span key={index} style={{ animationDelay: `${index * 55}ms` }}>
              {letter}
            </span>
          ))}
        </h1>

        {playerCount !== null ? (
          <p className="title-player-count"><b>{playerCount.toLocaleString()}</b> played this game</p>
        ) : null}

        <div className="title-gallery" aria-label="Featured Convergence characters">
          {FEATURED_CHARACTERS.map((character) => (
            <div className="title-portrait" key={character.name}>
              <img src={character.art} alt="" draggable={false} />
              <span>{character.name}</span>
            </div>
          ))}
        </div>

        {canContinue ? (
          <button type="button" className="title-btn primary" onClick={onContinue}>
            Continue your duel
          </button>
        ) : null}

        <div className="title-block">
          <h3>Play alone</h3>
          <div className="skill-row">
            {(Object.keys(SKILL_BLURB) as BotSkill[]).map((option) => (
              <button
                key={option}
                type="button"
                className={option === skill ? "skill-chip on" : "skill-chip"}
                onClick={() => {
                  sfx.play("button");
                  setSkill(option);
                }}
                aria-pressed={option === skill}
              >
                <b>{SKILL_BLURB[option].title}</b>
                <span>{SKILL_BLURB[option].note}</span>
              </button>
            ))}
          </div>
          <button type="button" className="title-btn primary" onClick={() => onStart({ kind: "bot", skill })}>
            Duel the {SKILL_BLURB[skill].title}
          </button>
        </div>

        <div className="title-block">
          <h3>Play together</h3>
          <p className="title-note">Two players, one screen. The board is hidden while you swap seats.</p>
          <button type="button" className="title-btn" onClick={() => onStart({ kind: "hotseat" })}>
            Start a hotseat duel
          </button>
        </div>

        <div className="title-links">
          <button type="button" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HowToPlayContent() {
  return (
    <div className="rules">
      <p className="rules-intro">A quick path from your opening hand to your first winning attack.</p>
      <section>
        <h4>1. Win the duel</h4>
        <p>
          Each Core starts at <b>76 health</b>. Reduce the opposing Core to zero. Minions attack it directly unless a
          <b> Taunt</b> is standing in the way.
        </p>
      </section>
      <section>
        <h4>2. Take your turn</h4>
        <ol className="rules-steps">
          <li><b>Draw</b> one card.</li>
          <li>Your <b>mana</b> refills and its maximum grows by one.</li>
          <li>Drag a card onto one of your five empty board slots to play it.</li>
          <li>Drag a ready minion onto an enemy minion or Core to attack.</li>
        </ol>
      </section>
      <div className="rules-split">
        <section>
          <h4>3. Fight smart</h4>
          <p>
            A minion sleeps on the turn it arrives and normally attacks once per turn. Combat is <b>simultaneous</b>:
            the defender hits back even if it dies. <b>Chained</b> minions wait two owner turns, and a minion with
            <b> 0 ATK</b> cannot attack.
          </p>
        </section>
        <section>
          <h4>4. Read the board</h4>
          <ul className="legend">
            <li><span className="swatch ring-green" /> can attack</li>
            <li><span className="swatch ring-red" /> legal target</li>
            <li><span className="swatch ring-blue" /> affordable card</li>
            <li><span className="swatch ring-teal" /> selected</li>
          </ul>
          <p className="title-note">Wall = Taunt · gold rim = Divine Shield · ice = Frozen · chains = Chained.</p>
        </section>
      </div>
      <section>
        <h4>5. Learn the card words</h4>
        <div className="rules-keywords">
          <p><b>Battlecry</b> — happens once when played.</p>
          <p><b>Ongoing</b> — happens at the start of its owner&rsquo;s turn.</p>
          <p><b>Passive</b> — stays active while the minion is on board.</p>
          <p><b>Silence</b> — removes printed effects and keywords; stats stay.</p>
          <p><b>Freeze</b> — the minion misses its next turn.</p>
          <p><b>Divine Shield</b> — blocks the next damage instance.</p>
          <p><b>Destroy</b> — removes a minion directly, without dealing damage.</p>
          <p><b>Target</b> — a chosen minion, card, or board slot.</p>
        </div>
      </section>
      <div className="rules-split">
        <section>
          <h4>6. Use relics</h4>
          <p>
            Relics are cards in your hand. Play one onto a friendly minion to equip it, or click an attached relic badge
            to pass it across <b>once per turn</b>. Relics die with their bearer unless their text says otherwise.
          </p>
        </section>
        <section>
          <h4>Shortcuts</h4>
          <p><b>Space</b> end turn · <b>Z</b> undo · <b>Esc</b> clear your selection.</p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Overlay title="How to play" onClose={onClose} wide>
      <HowToPlayContent />
    </Overlay>
  );
}

// ---------------------------------------------------------------------------

export function SettingsPanel({
  onClose,
  onMenu,
}: {
  onClose: () => void;
  onMenu: () => void;
}) {
  const [mix, setMix] = useState<Mix>(() => sfx.getMix());
  const [muted, setMuted] = useState(() => sfx.isMuted());

  const slide = (bus: Bus, value: number) => {
    sfx.setBusLevel(bus, value);
    setMix(sfx.getMix());
  };

  const faders: Array<{ bus: Bus; label: string; note: string }> = [
    { bus: "music", label: "Music", note: "The score, and each card's theme" },
    { bus: "effects", label: "Effects", note: "Impacts, fanfares, the herald" },
  ];

  return (
    <Overlay title="Settings" onClose={onClose}>
      <div className="settings">
        <button
          type="button"
          className={muted ? "mute-row muted" : "mute-row"}
          onClick={() => {
            const now = sfx.toggleMuted();
            setMuted(now);
            if (!now) sfx.play("button");
          }}
          aria-pressed={!muted}
        >
          {muted ? "🔇 Sound is off" : "🔊 Sound is on"}
        </button>

        {faders.map((fader) => (
          <label key={fader.bus} className={muted ? "fader off" : "fader"}>
            <span className="fader-top">
              <b>{fader.label}</b>
              <i>{Math.round(mix[fader.bus] * 100)}</i>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(mix[fader.bus] * 100)}
              disabled={muted}
              onChange={(event) => slide(fader.bus, Number(event.target.value) / 100)}
              onPointerUp={() => {
                if (fader.bus === "music") sfx.playCardTheme("c025");
                else if (fader.bus === "effects") sfx.play("summonEpic");
              }}
            />
            <span className="fader-note">{fader.note}</span>
          </label>
        ))}

        <button type="button" className="title-btn" onClick={onMenu}>
          Back to menu
        </button>

      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------

/**
 * The hotseat curtain.
 *
 * Deliberately opaque and deliberately requiring a click: an automatic timer
 * would either be too fast for someone still handing the laptop over, or long
 * enough to be annoying every single turn.
 */
export function PassScreen({ toName, onReady }: { toName: string; onReady: () => void }) {
  return (
    <div className="pass-screen">
      <Rift />
      <div className="pass-inner">
        <p className="pass-kicker">Hand the screen over</p>
        <h2>{toName}</h2>
        <p className="pass-note">Your board is hidden until you are ready. Nobody can see your hand.</p>
        <button
          type="button"
          className="title-btn primary"
          onClick={() => {
            sfx.play("button");
            onReady();
          }}
          autoFocus
        >
          I&rsquo;m ready
        </button>
      </div>
    </div>
  );
}
