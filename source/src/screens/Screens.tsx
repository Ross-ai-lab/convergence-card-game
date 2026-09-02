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
 *   HowToPlay     — the complete rules, as nine chapters plus two glossaries.
 *   SettingsPanel— sound controls and a route back to the title screen.
 *   PassScreen   — the hotseat privacy curtain. Without it, hotseat is not a game:
 *                  both players can read each other's hand off the same screen.
 */

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { KEYWORDS, keywordRuns } from "../keywords";
import {
  ArrowLeft,
  Cards,
  CornersIn,
  CornersOut,
  Crown,
  Gift,
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
import { cards, relics } from "../data/cards";
import {
  HERO_POWER_UNLOCK_ORDER,
  heroPowerDefinition,
  isHeroPowerUnlocked,
} from "../engine/hero-powers";
import type { HeroPowerId } from "../engine/types";
import {
  LADDER_KEYS,
  LADDER_LABEL,
  totals,
  winPct,
  type LadderKey,
  type Progress,
} from "../progress";
import type { BotSkill } from "../engine/bot";
import { STARTING_POOL } from "../unlocks";

export type GameMode = { kind: "hotseat" } | { kind: "bot"; skill: BotSkill };
export type DuelIntroPhase = "prelude" | "reveal" | "draw" | "mana" | "exit";

export function FullscreenButton({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = active ? CornersIn : CornersOut;
  const label = active ? "Exit full screen" : "Full screen";

  return (
    <button
      type="button"
      className={["fullscreen-trigger", className].filter(Boolean).join(" ")}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <Icon size={22} weight="fill" aria-hidden="true" />
      <span className="fullscreen-label">{label}</span>
    </button>
  );
}

const MINION_COUNT = cards.length;
const RELIC_COUNT = relics.length;

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
  dailyPackReady,
  dailyPackCards,
  onDailyPack,
  unlocked,
  rosterSize,
  developerCheatRevealed,
  developerCheatActive,
  onContinue,
  onStart,
  onSettings,
  isFullscreen,
  onToggleFullscreen,
  onGallery,
  onRecord,
  onHeroPowers,
  onTutorial,
  onDeveloperTools,
  onDeveloperUnlock,
  onDeveloperReset,
}: {
  canContinue: boolean;
  playerCount: number | null;
  /** Total duels finished on this device; the Record door is also useful at zero. */
  duelsPlayed: number;
  /** Whether today's free pack is still waiting to be taken. */
  dailyPackReady: boolean;
  /** How many cards it holds, so the button never spells the number itself. */
  dailyPackCards: number;
  onDailyPack: () => void;
  /** Cards the shared deck may currently draw from, and the whole roster. */
  unlocked: number;
  rosterSize: number;
  developerCheatRevealed: boolean;
  developerCheatActive: boolean;
  onContinue: () => void;
  onStart: (mode: GameMode) => void;
  onSettings: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onGallery: () => void;
  onRecord: () => void;
  onHeroPowers: () => void;
  onTutorial: () => void;
  onDeveloperTools: () => void;
  onDeveloperUnlock: () => void;
  onDeveloperReset: () => void;
}) {
  const [skill, setSkill] = useState<BotSkill>("normal");
  const [hotseatConfirmOpen, setHotseatConfirmOpen] = useState(false);
  const [developerResetConfirmOpen, setDeveloperResetConfirmOpen] = useState(false);
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
      <FullscreenButton active={isFullscreen} onToggle={onToggleFullscreen} className="title-fullscreen-trigger" />

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
          <p className="title-kicker">{MINION_COUNT} worlds. One arena.</p>
        </div>

        {canContinue ? (
          <button type="button" className="continue-duel" onClick={onContinue}>
            Continue duel
          </button>
        ) : null}

        {/* The day's free pack.

            It is loud on purpose and it is loud for exactly as long as it is
            true: once taken, the button is GONE rather than greyed out. A dead
            control that says "come back tomorrow" is a permanent piece of
            furniture advertising something the player cannot have, and it would
            sit there for 23 of every 24 hours. Its absence is the reward
            already collected. */}
        {dailyPackReady ? (
          <button type="button" className="daily-pack-trigger" onClick={onDailyPack}>
            <span className="daily-pack-shine" aria-hidden="true" />
            <Gift size={26} weight="fill" aria-hidden="true" />
            <span className="daily-pack-copy">
              <strong>Today&rsquo;s pack</strong>
              <small>{dailyPackCards} free cards</small>
            </span>
          </button>
        ) : null}

        <div className="title-links title-actions">
          <button
            type="button"
            className="hotseat-trigger"
            onClick={() => {
              sfx.play("button");
              setHotseatConfirmOpen(true);
            }}
          >
            <UsersThree size={22} weight="fill" aria-hidden="true" />
            <span>2 players</span>
          </button>
          {/* The tally rides INSIDE this button, stacked under its label, so the
              door to the gallery and the count of what is behind it are one
              object. Deliberately faint: the full unlock rules live one click
              away behind the gallery's "?", and this is a number to notice in
              passing, not an announcement. Once the roster is complete it
              disappears rather than reading the whole roster forever. */}
          <button type="button" className="gallery-trigger" onClick={onGallery}>
            <Cards size={22} weight="fill" aria-hidden="true" />
            <span className="gallery-trigger-stack">
              <span>Cards</span>
              {unlocked < rosterSize ? (
                <small className="unlock-tally">
                  {unlocked} / {rosterSize}
                </small>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            className="gallery-trigger"
            onClick={onRecord}
            title={duelsPlayed > 0 ? "View your duel record" : "View your record — no duels played yet"}
          >
            <Scroll size={22} weight="fill" aria-hidden="true" />
            <span>Win Record</span>
          </button>
          <button
            type="button"
            className="hero-power-trigger"
            onClick={onHeroPowers}
            title="Choose an unlocked Hero Power"
          >
            <Lightning size={22} weight="fill" aria-hidden="true" />
            <span>Hero Powers</span>
          </button>
          <button type="button" className="settings-trigger" onClick={onSettings}>
            <GearSix size={22} weight="fill" aria-hidden="true" />
            <span>Sound</span>
          </button>
        </div>

        {developerCheatRevealed ? (
          <div className="developer-cheat-panel" aria-label="Developer cheat">
            <span className="developer-cheat-label">Developer access</span>
            <button
              type="button"
              className="developer-tools-open"
              onClick={() => {
                sfx.play("button");
                onDeveloperTools();
              }}
            >
              Open developer tools
            </button>
            <button
              type="button"
              className="developer-tools-open"
              onClick={() => {
                sfx.play("button");
                onTutorial();
              }}
            >
              Run tutorial
            </button>
            <button
              type="button"
              className="developer-cheat-unlock"
              onClick={() => {
                sfx.play("button");
                onDeveloperUnlock();
              }}
              disabled={developerCheatActive}
            >
              {developerCheatActive ? "All cards and powers unlocked" : "Unlock all cards + powers"}
            </button>
            <button
              type="button"
              className="developer-cheat-reset"
              onClick={() => {
                sfx.play("button");
                setDeveloperResetConfirmOpen(true);
              }}
            >
              Reset progress
            </button>
          </div>
        ) : null}

        {playerCount !== null ? (
          <p className="title-player-count"><b>{playerCount.toLocaleString()}</b> played this game</p>
        ) : null}
      </div>

      {hotseatConfirmOpen ? (
        <Overlay title="Two-player duel" onClose={() => setHotseatConfirmOpen(false)}>
          <div className="hotseat-confirm">
            <p className="hotseat-confirm-question">Start a two-player duel?</p>
            <p className="hotseat-confirm-note">
              Both players share this screen. Player One gets the opening mulligan, and each hand is hidden during the
              other player&apos;s turn.
            </p>
            <div className="hotseat-confirm-actions">
              <button
                type="button"
                className="hotseat-confirm-cancel"
                onClick={() => {
                  sfx.play("button");
                  setHotseatConfirmOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hotseat-confirm-start"
                onClick={() => {
                  sfx.play("button");
                  setHotseatConfirmOpen(false);
                  onStart({ kind: "hotseat" });
                }}
              >
                Start duel
              </button>
            </div>
          </div>
        </Overlay>
      ) : null}

      {developerResetConfirmOpen ? (
        <Overlay title="Reset progress?" onClose={() => setDeveloperResetConfirmOpen(false)}>
          <div className="hotseat-confirm developer-reset-confirm">
            <p className="hotseat-confirm-question">Reset card progress?</p>
            <p className="hotseat-confirm-note">
              This clears card unlocks, collection marks, and the duel record. Your current duel stays untouched.
            </p>
            <div className="hotseat-confirm-actions">
              <button
                type="button"
                className="hotseat-confirm-cancel"
                onClick={() => {
                  sfx.play("button");
                  setDeveloperResetConfirmOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hotseat-confirm-start"
                onClick={() => {
                  sfx.play("button");
                  setDeveloperResetConfirmOpen(false);
                  onDeveloperReset();
                }}
              >
                Reset progression
              </button>
            </div>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}

export function HeroPowersScreen({
  botWins,
  selectedPower,
  onSelect,
  onClose,
}: {
  botWins: number;
  selectedPower: HeroPowerId | null;
  onSelect: (power: HeroPowerId) => void;
  onClose: () => void;
}) {
  return (
    <Overlay title="Hero Powers" onClose={onClose} wide>
      <div className="hero-power-menu">
        <p className="hero-power-menu-intro">
          Win against the bot to unlock one Hero Power per win. Each unlock is permanent.
          <b>{` ${Math.min(botWins, HERO_POWER_UNLOCK_ORDER.length)}/${HERO_POWER_UNLOCK_ORDER.length} unlocked`}</b>
        </p>
        <div className="hero-power-menu-grid">
          {HERO_POWER_UNLOCK_ORDER.map((powerId, index) => {
            const definition = heroPowerDefinition(powerId);
            if (!definition) return null;
            const unlockAt = index + 1;
            const unlocked = isHeroPowerUnlocked(powerId, botWins);
            const selected = selectedPower === powerId;
            return (
              <button
                type="button"
                key={powerId}
                className={[
                  "hero-power-menu-card",
                  unlocked ? "unlocked" : "locked",
                  selected ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!unlocked}
                aria-pressed={selected}
                onClick={() => {
                  sfx.play("button");
                  onSelect(powerId);
                }}
              >
                <span className="hero-power-menu-status">
                  {unlocked ? (selected ? "Selected" : `Unlocked · ${unlockAt}`) : `Locked · win ${unlockAt}`}
                </span>
                <strong><Lightning size={18} weight="fill" aria-hidden="true" /> {definition.name}</strong>
                <span>{definition.text}</span>
                <small>Costs 2 mana · once per turn</small>
              </button>
            );
          })}
        </div>
        {selectedPower === null ? (
          <p className="hero-power-menu-note">No Hero Power is selected yet. Win against the bot to claim your first.</p>
        ) : null}
      </div>
    </Overlay>
  );
}

/** The persistent duel record, grouped by opponent level. */
export function RecordScreen({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overall = totals(progress);
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

/**
 * The rules guide, written as nine short chapters in the order a new player
 * meets them: win condition, deck, turn, combat, then the vocabulary printed on
 * the cards, then the board's own symbols.
 *
 * Two things it is NOT allowed to be. It is not a summary — every keyword the
 * engine can put on a minion appears here, because a player who meets Chained
 * or Attack Locked mid-duel has nowhere else to look. And it is not free prose:
 * the glossary rows are a definition grid so the terms line up in one column
 * and can be scanned rather than read.
 */
function HowToPlayContent() {
  return (
    <div className="rules">
      <p className="rules-intro">
        Two cores, one shared deck, five slots each. Everything below is in the order you meet it.
      </p>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">1</span> How you win</h4>
        <p>
          Both cores start at <b>75 health</b>. Take the enemy core to zero and the duel is yours. Nothing
          damages a core on its own: the damage comes from a minion attacking it, or from an effect that says
          in so many words that it damages a core.
        </p>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">2</span> The shared deck</h4>
        <ul className="rules-list">
          <li>Both players draw from the <b>same shuffled deck</b>, one copy of each card. It holds the cards you have <b>unlocked</b>: {STARTING_POOL} to begin with, growing with every duel you finish against the bot, up to the full {MINION_COUNT} minions and {RELIC_COUNT} relics.</li>
          <li>You open with <b>3 cards</b>. Player One may replace any number of them once before the duel begins. Going second also hands you <b>The Coin</b>, worth 1 extra mana on the turn you spend it.</li>
          <li>Your hand holds <b>10 cards</b>. A card drawn into a full hand burns and is gone.</li>
          <li>When the deck runs dry, every further draw costs you core health: <b>1, then 2, then 3</b>, and up from there.</li>
        </ul>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">3</span> Your turn, in order</h4>
        <ol className="rules-steps">
          <li><b>Draw</b> one card.</li>
          <li>Your <b>mana</b> refills, and its maximum grows by one, up to <b>10</b>.</li>
          <li>Spend it in any order: play cards into your <b>five slots</b>, fire your Hero Power, attack with ready minions.</li>
          <li><b>End the turn</b> with Space.</li>
        </ol>
        <p className="rules-aside">
          Hero Powers are chosen from the <b>Hero Powers</b> menu. Win against the bot to unlock them one at a time,
          in the order shown there. A selected power costs 2 mana and works once per turn.
        </p>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">4</span> Attacking</h4>
        <ul className="rules-list">
          <li>Click or drag a hand card onto an empty slot to play it; click or drag a ready minion onto an enemy minion or the enemy core to attack.</li>
          <li>A minion <b>sleeps</b> the turn it arrives and attacks from your next turn. <b>Charge</b> skips that wait.</li>
          <li>One attack per turn, unless a card or relic says otherwise.</li>
          <li>Combat is <b>simultaneous</b>: the defender hits back even as it dies.</li>
          <li>A minion with <b>0 ATK</b> may still attack, but deals no damage.</li>
          <li>An enemy <b>Taunt</b> blocks the road to the core — clear it first, unless something explicitly ignores Taunt.</li>
          <li>A <b>Chained</b> minion is out of the duel entirely for <b>two</b> of its turns; a <b>Frozen</b> one for a single turn.</li>
        </ul>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">5</span> Keywords</h4>
        <p className="rules-aside">
          The first five say <b>when</b> a card&rsquo;s text happens. The rest are the words the text itself uses.
        </p>
        {/* Rendered from `src/keywords.ts`, which is the single copy of every
            definition. The card face's own keyword tooltips read the same
            entries, so a wording fix lands in both places or in neither. */}
        <dl className="rules-glossary">
          {KEYWORDS.map((entry) => (
            <Fragment key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>
                {keywordRuns(entry.text).map((run, index) =>
                  run.strong ? <b key={index}>{run.text}</b> : <Fragment key={index}>{run.text}</Fragment>,
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">6</span> Camp and alignment</h4>
        <p>
          Every minion carries a <b>camp</b> — Magic, Nature or Tech — and an <b>alignment</b> — Good, Evil or
          Neutral. A great many effects hunt by one or the other, so read both labels before you commit a card.
          A rare <b>ALL</b> camp minion counts as <b>every</b> camp: it accepts a buff aimed at any of the three, and
          it is a legal victim for anything that hunts one of them.
        </p>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">7</span> Ascension Relics</h4>
        <ul className="rules-list">
          <li>The <b>{RELIC_COUNT} relics</b> ride in the same shared deck and arrive in hand like any other card.</li>
          <li>Play one onto a friendly minion to equip it. A minion carries up to <b>two</b>, in independent slots.</li>
          <li>Every relic prints bare <b>RELIC</b> in its flavour-text slot, without quotation marks. This is the fixed relic label, not individual lore text.</li>
          <li>An attached relic stays with its bearer. A minion cannot choose to return it to its owner, and a relic cannot be manually returned to hand.</li>
          <li>A relic dies with its bearer unless its own text says otherwise. Effects that return a minion to hand discard its attached relics.</li>
        </ul>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">8</span> Reading the board</h4>
        <div className="rules-split">
          <ul className="legend">
            <li><span className="swatch ring-green" /> ready to attack</li>
            <li><span className="swatch ring-red" /> legal target</li>
            <li><span className="swatch ring-blue" /> you can afford this card</li>
            <li><span className="swatch ring-teal" /> selected</li>
          </ul>
          <dl className="rules-glossary rules-glossary-tight">
            <dt>Wall</dt>
            <dd>Taunt</dd>
            <dt>Gold rim</dt>
            <dd>Divine Shield</dd>
            <dt>Blue-white rim</dt>
            <dd>Invulnerable</dd>
            <dt>Ice</dt>
            <dd>Frozen</dd>
            <dt>Chains</dt>
            <dd>Chained</dd>
            <dt>Red cross</dt>
            <dd>Silenced</dd>
            <dt>Red pulse</dt>
            <dd>Marked</dd>
            <dt>Purple glow</dt>
            <dd>Adapted to a camp</dd>
            <dt>Grey gem</dt>
            <dd>Cannot attack</dd>
            <dt>Drifting z</dt>
            <dd>Asleep this turn</dd>
          </dl>
        </div>
        <p className="rules-aside">
          A board <b>slot</b> can be marked too, and a mark is <b>permanent</b>: it outlives whoever laid it and whoever
          stands in it. The slot wears a coloured ring and one of these labels.
        </p>
        <dl className="rules-glossary rules-glossary-tight">
          <dt>RANDOM</dt>
          <dd>A minion standing here can only attack at random.</dd>
          <dt>CHAINED</dt>
          <dd>A minion standing here is always Chained.</dd>
          <dt>SAFE</dt>
          <dd>A minion standing here resists Silence, Freeze and Chained.</dd>
          <dt>1/1</dt>
          <dd>A minion standing here is held at 1/1.</dd>
          <dt>+1/+1</dt>
          <dd>A minion standing here grows every one of your turns.</dd>
        </dl>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">9</span> Shortcuts</h4>
        <p><b>Space</b> or <b>Enter</b> end turn · <b>Z</b> undo your last action · <b>Esc</b> clear your selection.</p>
      </section>
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
