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
 *   HowToPlayContent — the rules, in the order they matter, at the end of the codex.
 *   SettingsPanel— three faders and the difficulty, changeable mid-duel.
 *   PassScreen   — the hotseat privacy curtain. Without it, hotseat is not a game:
 *                  both players can read each other's hand off the same screen.
 */

import { useEffect, useState, type ReactNode } from "react";

import "./Screens.css";
import { sfx, type Bus, type Mix } from "../audio/sfx";
import type { BotSkill } from "../engine/bot";

export type GameMode = { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };

const SKILL_BLURB: Record<BotSkill, { title: string; note: string }> = {
  easy: { title: "Recruit", note: "Plays one move ahead, badly, and will let you win." },
  normal: { title: "Veteran", note: "Plays every single move correctly. Never sees the move after it." },
  hard: { title: "Ascendant", note: "Searches whole turns and answers what you are about to do." },
};

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
        <section>
          <h4>The goal</h4>
          <p>
            Both players start on <b>76 core</b>. Drop it to zero and you win. Nothing damages a core on its own &mdash;
            every point comes from a minion swinging at it or an effect saying so.
          </p>
        </section>
        <section>
          <h4>Your turn</h4>
          <ol>
            <li>You draw one card.</li>
            <li>Your mana refills and grows by one. Duels run long enough that even the ten-cost Greats arrive.</li>
            <li>Drag cards from your hand onto an empty slot to play them. You have five slots.</li>
            <li>Drag one of your minions onto an enemy minion, or onto the enemy core, to attack.</li>
          </ol>
        </section>
        <section>
          <h4>Fighting</h4>
          <p>
            Combat is <b>simultaneous</b> &mdash; the defender always hits back, even when your blow kills it. A minion
            is asleep the turn it lands and attacks once a turn after that. A Chained minion waits through two of its
            owner's turns before it can act. A minion with <b>0 attack</b> cannot attack at all.
          </p>
        </section>
        <section>
          <h4>The board tells you everything in colour</h4>
          <ul className="legend">
            <li>
              <span className="swatch ring-green" /> this minion can attack
            </li>
            <li>
              <span className="swatch ring-red" /> a legal target right now
            </li>
            {/* BLUE, not gold. This line taught gold for as long as it existed
                and the game has painted it blue since the day gold was taken
                away from it — gold is the Divine Shield rim, and a shielded card
                sitting in hand read as "you can afford this". See the comment on
                .hand-card.playable in App.css. */}
            <li>
              <span className="swatch ring-blue" /> in your hand: you can afford it
            </li>
            <li>
              <span className="swatch ring-teal" /> selected
            </li>
          </ul>
          <p className="title-note">
            Conditions are drawn, never labelled: a wall means Taunt, a gold rim means Divine Shield, ice means Frozen,
            chains across the art mean Chained, a grey attack gem means it cannot swing.
          </p>
        </section>
        <section>
          <h4>Ascension Relics</h4>
          <p>
            Some effects pull a <b>relic</b> out of the rift and hang it on one of your minions. A relic is equipment:
            it belongs to the minion carrying it, and it <b>dies with that minion</b>. You never draw one and you never
            pay for one.
          </p>
          <p>
            You get one decision over them, and it is worth using. <b>Click the relic badge on a minion, then click
            another of your minions to pass it across.</b> Once a turn. Pull one off something about to die, or move it
            onto the minion that is about to swing. A few relics spend themselves the moment they land and cannot be
            passed on.
          </p>
          <p className="title-note">
            The <b>◈ Relics</b> button shows what is still in the rift, in the order it will be claimed, and who is
            wearing what.
          </p>
        </section>
        <section>
          <h4>Two things that surprise people</h4>
          <p>
            <b>Taunt closes the core.</b> While an enemy Taunt is standing, you must deal with it before anything can
            reach their core. And <b>both players draw from the same deck</b>, so the card you leave is a card they get.
          </p>
        </section>
        <section>
          <h4>Three keys</h4>
          <p>
            <b>Space</b> ends your turn, <b>Z</b> takes the last move back, <b>Esc</b> drops whatever you have selected.
            Everything else is the mouse.
          </p>
        </section>
      </div>
  );
}

// ---------------------------------------------------------------------------

export function EffectCodex({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: "When it happens",
      entries: [
        ["Battlecry", "Happens once when the minion enters play."],
        ["Ongoing", "Happens at the start of its owner's turn while the minion is active."],
        ["Passive", "Always applies while the minion is active. It does not trigger a second time."],
        ["Battlecry/Ongoing", "The same effect happens on arrival and again at the start of its owner's turns."],
      ],
    },
    {
      title: "Board conditions",
      entries: [
        ["Chained", "The minion is unavailable for its first two turns. It cannot attack or run Ongoing effects until the chains break."],
        ["Taunt", "The enemy must deal with this minion before attacking your core."],
        ["Divine Shield", "Blocks the next damage instance, then the golden shield disappears."],
        ["Freeze", "The minion loses its next turn. It thaws after sitting out that turn."],
        ["Silence", "Removes the minion's printed effect and active keywords. Its stats remain."],
        ["Invulnerable", "The minion cannot take damage while the condition is active. The blue aura shows it."],
        ["Evade", "The minion has a chance to avoid an incoming attack. The percentage is printed on the card."],
      ],
    },
    {
      title: "Effect language",
      entries: [
        ["Target", "A chosen minion, card, or board slot. Some protections make a minion untargetable."],
        ["Board slot", "A position on the board. Slot effects can remain after the original minion leaves."],
        ["Destroy", "Kills the minion directly rather than dealing damage."],
        ["Gain stats", "Adds ATK and maximum/current HP to the recipient."],
        ["Summon", "Creates or brings a minion onto an open board slot."],
        ["Lose ATK", "Permanently reduces ATK, never below zero."],
        ["Copy a passive", "Gives the copier the other minion's Passive or Ongoing text, but not its Battlecry."],
        ["Relic", "Equipment attached to a minion. It dies with that minion and can sometimes be moved once per turn."],
      ],
    },
    {
      title: "Special rules",
      entries: [
        ["Core", "Each player starts at 76 core health. A minion attacks the opposing core directly when no Taunt stops it."],
        ["Sleep", "Every normal minion sleeps for the turn it is played. Chained adds a second unavailable turn."],
        ["Immune", "The named damage type cannot hurt the minion while the immunity is active."],
        ["Marked", "A delayed effect is waiting on the minion. The card's text explains when it resolves."],
      ],
    },
  ] as const;

  return (
    <Overlay title="Effect Codex" onClose={onClose} wide>
      <div className="codex">
        <p className="codex-intro">A quick translation of the words and visual conditions used across the card pool.</p>
        {sections.map((section) => (
          <section className="codex-section" key={section.title}>
            <h4>{section.title}</h4>
            <div className="codex-grid">
              {section.entries.map(([term, explanation]) => (
                <article className="codex-entry" key={term}>
                  <h5>{term}</h5>
                  <p>{explanation}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
        <section className="codex-section codex-howto">
          <h4>How to play</h4>
          <HowToPlayContent />
        </section>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------

export function SettingsPanel({
  onClose,
  onMenu,
  mode,
  onSkillChange,
}: {
  onClose: () => void;
  onMenu: () => void;
  mode: GameMode;
  onSkillChange: (skill: BotSkill) => void;
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

        {mode.kind === "bot" ? (
          <div className="setting-block">
            <h4>Opponent</h4>
            <div className="skill-row tight">
              {(Object.keys(SKILL_BLURB) as BotSkill[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === mode.skill ? "skill-chip on" : "skill-chip"}
                  onClick={() => onSkillChange(option)}
                  aria-pressed={option === mode.skill}
                >
                  <b>{SKILL_BLURB[option].title}</b>
                  <span>{SKILL_BLURB[option].note}</span>
                </button>
              ))}
            </div>
            <p className="title-note">Changing this takes effect on the opponent&rsquo;s next move.</p>
          </div>
        ) : null}

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
