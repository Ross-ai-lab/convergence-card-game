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

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  Cards,
  Crown,
  Scroll,
  GearSix,
  Lightning,
  MusicNotes,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Target,
  UsersThree,
} from "@phosphor-icons/react";

import "./Screens.css";
import { sfx, type Bus, type Mix } from "../audio/sfx";
import { cards } from "../data/cards";
import {
  LADDER_KEYS,
  LADDER_LABEL,
  totals,
  winPct,
  type LadderKey,
  type Progress,
} from "../progress";
import type { BotSkill } from "../engine/bot";

export type GameMode = { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };
export type DuelIntroPhase = "prelude" | "reveal" | "draw" | "mana" | "exit";

const SKILL_BLURB: Record<BotSkill, { title: string; note: string }> = {
  easy: { title: "Recruit", note: "Plays one move ahead, badly, and will let you win." },
  normal: { title: "Veteran", note: "Plays every single move correctly. Never sees the move after it." },
  hard: { title: "Ascendant", note: "Searches whole turns and answers what you are about to do." },
};

// A seeded scatter inspired by the bgfx pipeline: the cards are deliberately
// placed around the full frame instead of in another neat row. Using existing
// card art keeps the menu self-contained and makes the arena feel populated
// before the first duel begins.
const FLOATING_CARDS = Array.from({ length: 84 }, (_, index) => {
  const card = cards[(index * 37 + 11) % cards.length];
  const rotation = ((index * 47) % 42) - 21;
  const scale = 0.66 + ((index * 29) % 58) / 100;
  const depth = index % 5;
  return {
    id: `floating-card-${index}`,
    art: card.art,
    left: ((index * 41 + 3) % 110) - 5,
    top: ((index * 67 + 5) % 118) - 9,
    rotation,
    scale,
    spin: `${((index * 53) % 260) - 130}deg`,
    delay: -((index * 17) % 38),
    duration: 16 + (index % 9) * 1.35,
    opacity: 0.24 + depth * 0.05,
    blur: Math.max(0, 2.4 - depth * 0.55),
    reverse: index % 4 === 0,
  };
});

/**
 * The menu's own copy of a card's artwork, built by
 * `materials/local-production/asset-tools/build-menu-art.py`.
 *
 * A floating card is at most 134 CSS pixels wide and is blurred on top of that,
 * so the full artwork behind it was about twenty-five times more pixels than
 * could ever be seen: 4.67 MB across 84 files, all of it decoded on the main
 * thread before the menu settles. The thumbnails are the same pictures at 220px.
 */
function menuArt(art: string): string {
  // Only RASTER art has a thumbnail. One card is drawn as an SVG, which is
  // already tiny and scales perfectly, so it keeps the original path — rewriting
  // it pointed at a file the generator never makes, and the card rendered blank.
  if (!/\.(png|jpe?g|webp)$/i.test(art)) return art;
  return art.replace("/card-art/raw/", "/card-art/menu/").replace(/\.(png|jpe?g)$/i, ".webp");
}

function FloatingCardField() {
  return (
    <div className="floating-card-field" aria-hidden="true">
      {FLOATING_CARDS.map((card) => (
        <img
          key={card.id}
          src={menuArt(card.art)}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          className={card.reverse ? "reverse" : undefined}
          style={
            {
              left: `${card.left}%`,
              top: `${card.top}%`,
              "--float-rot": `${card.rotation}deg`,
              "--float-scale": card.scale,
              "--float-spin": card.spin,
              "--float-delay": `${card.delay}s`,
              "--float-duration": `${card.duration}s`,
              "--float-opacity": card.opacity,
              "--float-blur": `${card.blur}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Existing hotseat-curtain ornament. The title screen uses the raster rift. */
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

function Overlay({
  title,
  onClose,
  children,
  wide,
  variant,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: "settings";
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={variant ? `screen-veil ${variant}-veil` : "screen-veil"}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`screen-panel${wide ? " wide" : ""}${variant ? ` ${variant}-panel` : ""}`}
        role="dialog"
        aria-label={title}
      >
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
  duelsPlayed,
  onContinue,
  onStart,
  onSettings,
  onGallery,
  onRecord,
}: {
  canContinue: boolean;
  playerCount: number | null;
  /** Total duels finished on this device. Hides the Record door until there is one. */
  duelsPlayed: number;
  onContinue: () => void;
  onStart: (mode: GameMode) => void;
  onSettings: () => void;
  onGallery: () => void;
  onRecord: () => void;
}) {
  const [skill, setSkill] = useState<BotSkill>("normal");
  const skillIcon = {
    easy: Sparkle,
    normal: Target,
    hard: Crown,
  } satisfies Record<BotSkill, typeof Sparkle>;

  return (
    <div className="title-screen">
      <div className="title-rift-stage">
        <img
          className="title-rift-backdrop"
          src={`${import.meta.env.BASE_URL}menu-rift.webp`}
          alt=""
          draggable={false}
          fetchPriority="high"
        />
      </div>
      <FloatingCardField />

      <div className="duel-orbit" aria-label="Choose an opponent">
        {(Object.keys(SKILL_BLURB) as BotSkill[]).map((option) => {
          const Icon = skillIcon[option];
          return (
            <button
              key={option}
              type="button"
              className={`orbit-choice orbit-choice-${option}${option === skill ? " on" : ""}`}
              onClick={() => {
                sfx.play("button");
                setSkill(option);
              }}
              aria-pressed={option === skill}
              aria-label={`${SKILL_BLURB[option].title}: ${SKILL_BLURB[option].note}`}
            >
              <Icon size={option === skill ? 30 : 24} weight={option === skill ? "fill" : "regular"} aria-hidden="true" />
              <span>{SKILL_BLURB[option].title}</span>
            </button>
          );
        })}

        <button type="button" className="duel-trigger" onClick={() => onStart({ kind: "bot", skill })}>
          <span>Duel</span>
          <small>{SKILL_BLURB[skill].title}</small>
        </button>
      </div>
      <div className="title-inner">
        <div className="title-brand">
          <h1 className="title-word">
            {"CONVERGENCE".split("").map((letter, index) => (
              <span key={index} style={{ animationDelay: `${index * 45}ms` }}>
                {letter}
              </span>
            ))}
          </h1>
          <p className="title-kicker">175 worlds. One arena.</p>
        </div>

        {canContinue ? (
          <button type="button" className="continue-duel" onClick={onContinue}>
            Continue duel
          </button>
        ) : null}

        <div className="title-links title-actions">
          <button type="button" className="hotseat-trigger" onClick={() => onStart({ kind: "hotseat" })}>
            <UsersThree size={22} weight="fill" aria-hidden="true" />
            <span>2 players</span>
          </button>
          <button type="button" className="gallery-trigger" onClick={onGallery}>
            <Cards size={22} weight="fill" aria-hidden="true" />
            <span>Cards</span>
          </button>
          {/* No duels yet means an empty table and a promise of nothing, so the
              door only appears once there is something behind it. */}
          {duelsPlayed > 0 ? (
            <button type="button" className="gallery-trigger" onClick={onRecord}>
              <Scroll size={22} weight="fill" aria-hidden="true" />
              <span>Record</span>
            </button>
          ) : null}
          <button type="button" className="settings-trigger" onClick={onSettings}>
            <GearSix size={22} weight="fill" aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>

        {playerCount !== null ? (
          <p className="title-player-count"><b>{playerCount.toLocaleString()}</b> played this game</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What has survived every duel so far: the results, and how much of the roster
 * you have actually met.
 *
 * The collection is counted three ways on purpose, because they are three
 * different facts and only the first is close to automatic. SEEN is "this card
 * has been in my hand". PLAYED is "I have put it on the board". WON WITH is "it
 * was on the board in a duel I won". With one shared deck and no deckbuilding, a
 * match shows roughly 25 to 30 of 196 cards, so seeing the whole roster is a real
 * long game rather than a formality.
 */
export function RecordScreen({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overall = totals(progress);
  const overallPct = winPct(overall);
  const rosterSize = cards.length;
  const played = LADDER_KEYS.filter((key) => progress.ladders[key].played > 0);

  return (
    <div className="screen-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="screen-panel wide" role="dialog" aria-label="Your record">
        <header className="screen-panel-top">
          <h2>Your record</h2>
          <button type="button" className="screen-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="screen-panel-body record-body">
          <div className="record-headline">
            <div className="record-figure">
              <b>{overall.played}</b>
              <span>{overall.played === 1 ? "duel" : "duels"}</span>
            </div>
            <div className="record-figure">
              <b>{overall.won}</b>
              <span>won</span>
            </div>
            <div className="record-figure">
              <b>{overallPct === null ? "—" : `${overallPct}%`}</b>
              <span>win rate</span>
            </div>
          </div>

          <h3 className="record-heading">By opponent</h3>
          <table className="record-table">
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col">Played</th>
                <th scope="col">Won</th>
                <th scope="col">Lost</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {played.map((key: LadderKey) => {
                const record = progress.ladders[key];
                const pct = winPct(record);
                return (
                  <tr key={key}>
                    <th scope="row">{LADDER_LABEL[key]}</th>
                    <td>{record.played}</td>
                    <td>{record.won}</td>
                    <td>{record.lost}</td>
                    <td>{pct === null ? "—" : `${pct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="record-heading">Your collection</h3>
          <ul className="record-collection">
            <li>
              <b>{progress.seen.length}</b> of {rosterSize} cards have been in your hand
            </li>
            <li>
              <b>{progress.played.length}</b> you have put on the board
            </li>
            <li>
              <b>{progress.wonWith.length}</b> were on the board when you won
            </li>
          </ul>
          <p className="record-note">
            Marked on every card in the gallery. One duel deals you roughly 25 to 30 of them, so the whole
            roster takes a while.
          </p>

          {progress.recent.length ? (
            <>
              <h3 className="record-heading">Last {progress.recent.length === 1 ? "duel" : `${progress.recent.length} duels`}</h3>
              <ol className="record-recent">
                {progress.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className={`record-result is-${entry.outcome}`}>
                    <span className="record-outcome">
                      {entry.outcome === "won" ? "Won" : entry.outcome === "lost" ? "Lost" : "Draw"}
                    </span>
                    <span className="record-versus">{LADDER_LABEL[entry.ladder]}</span>
                    <span className="record-turns">{entry.turns} turns</span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// The opening is a text-free visual ceremony over the live board.
export function DuelIntro({ phase }: { phase: DuelIntroPhase }) {
  return (
    <div className={`duel-intro duel-intro-${phase}`} aria-hidden="true">
      <div className="duel-intro-rift-stage" aria-hidden="true">
        <div className="duel-intro-rift" aria-hidden="true" />
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
          <li>At the start of the duel, choose one of two random <b>Hero Powers</b>. Each costs 2 mana and works once per turn.</li>
          <li>Drag a card onto one of your five empty board slots to play it.</li>
          <li>Drag a ready minion onto an enemy minion or Core to attack.</li>
        </ol>
      </section>
      <div className="rules-split">
        <section>
          <h4>3. Fight smart</h4>
          <p>
            A minion sleeps on the turn it arrives and normally attacks once per turn. Combat is <b>simultaneous</b>:
            the defender hits back even if it dies. <b>Chained</b> minions wait two owner turns and cannot be targeted,
            while <b>Charge</b> minions can attack immediately. A minion with <b>0 ATK</b> can attack, but deals no damage.
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
          <p className="title-note">Wall = Taunt · gold rim = Divine Shield · ice = Frozen · chains = Chained · red cross = Silenced.</p>
        </section>
      </div>
      <section>
        <h4>5. Learn the card words</h4>
        <div className="rules-keywords">
          <p><b>Battlecry</b> — happens once when played.</p>
          <p><b>Ongoing</b> — happens at the start of its owner&rsquo;s turn.</p>
          <p><b>Passive</b> — stays active while the minion is on board.</p>
          <p><b>Charge</b> — may attack on the same turn it is summoned or changes controller.</p>
          <p><b>Deathrattle</b> — triggers after the minion dies, unless it was Silenced.</p>
          <p><b>Silence</b> — removes printed effects and keywords; stats stay.</p>
          <p><b>Freeze</b> — the minion misses its next turn.</p>
          <p><b>Divine Shield</b> — blocks the next damage instance.</p>
          <p><b>Destroy</b> — removes a minion directly, without dealing damage.</p>
          <p><b>Target</b> — a chosen minion, card, or board slot.</p>
          <p><b>Untargetable</b> — attacks and effects cannot choose the minion while it lasts.</p>
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

  const faders: Array<{ bus: Bus; label: string; note: string; icon: typeof MusicNotes }> = [
    { bus: "music", label: "Music", note: "Score & card themes", icon: MusicNotes },
    { bus: "effects", label: "Effects", note: "Impacts & fanfares", icon: Lightning },
  ];

  return (
    <Overlay title="Settings" onClose={onClose} variant="settings">
      <div className="settings">
        <div className={muted ? "settings-status muted" : "settings-status"}>
          <span className="settings-status-icon" aria-hidden="true">
            {muted ? <SpeakerSlash size={28} weight="fill" /> : <SpeakerHigh size={28} weight="fill" />}
          </span>
          <span className="settings-status-copy">
            <small>Master audio</small>
            <strong>{muted ? "Muted" : "Sound on"}</strong>
          </span>
          <button
            type="button"
            className="mute-row"
            onClick={() => {
              const now = sfx.toggleMuted();
              setMuted(now);
              if (!now) sfx.play("button");
            }}
            aria-pressed={muted}
            aria-label={muted ? "Turn sound on" : "Mute sound"}
          >
            {muted ? "Enable" : "Mute"}
          </button>
        </div>

        <div className="settings-mixer">
          {faders.map((fader) => {
            const Icon = fader.icon;
            const percentage = Math.round(mix[fader.bus] * 100);
            return (
              <label key={fader.bus} className={muted ? "fader off" : "fader"}>
                <span className="fader-icon" aria-hidden="true"><Icon size={22} weight="fill" /></span>
                <span className="fader-copy">
                  <span className="fader-top">
                    <b>{fader.label}</b>
                    <i>{percentage}</i>
                  </span>
                  <span className="fader-note">{fader.note}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={percentage}
                    disabled={muted}
                    style={{ "--level": `${percentage}%` } as CSSProperties}
                    aria-label={`${fader.label} volume`}
                    onChange={(event) => slide(fader.bus, Number(event.target.value) / 100)}
                    onPointerUp={() => {
                      if (fader.bus === "music") sfx.playCardTheme("c025");
                      else if (fader.bus === "effects") sfx.play("summonEpic");
                    }}
                  />
                </span>
              </label>
            );
          })}
        </div>

        <button type="button" className="settings-menu-button" onClick={onMenu}>
          <ArrowLeft size={19} weight="bold" aria-hidden="true" />
          <span>Back to menu</span>
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
