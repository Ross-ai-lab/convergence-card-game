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
 *   HowToPlay     — the complete rules, as eleven chapters plus two glossaries.
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
  onHeroPowers,
  heroPowerName,
}: {
  canContinue: boolean;
  playerCount: number | null;
  /** Total duels finished on this device; the Record door is also useful at zero. */
  duelsPlayed: number;
  onContinue: () => void;
  onStart: (mode: GameMode) => void;
  onSettings: () => void;
  onGallery: () => void;
  onRecord: () => void;
  onHeroPowers: () => void;
  heroPowerName: string;
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
          <button
            type="button"
            className="gallery-trigger"
            onClick={onRecord}
            title={duelsPlayed > 0 ? "View your duel record" : "View your record — no duels played yet"}
          >
            <Scroll size={22} weight="fill" aria-hidden="true" />
            <span>Record</span>
          </button>
          <button
            type="button"
            className="hero-power-trigger"
            onClick={onHeroPowers}
            title="Choose an unlocked Hero Power"
          >
            <Lightning size={22} weight="fill" aria-hidden="true" />
            <span>Hero Powers</span>
            <small>{heroPowerName}</small>
          </button>
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
          Beat the bot to unlock powers permanently. Your first unlock arrives after one win; the tenth arrives after ten.
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

/**
 * The rules guide, written as eleven short chapters in the order a new player
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
          <li>Both players draw from the <b>same shuffled deck</b> — 175 minions and 21 relics, one copy of each.</li>
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
          Hero Powers are chosen from the <b>Hero Powers</b> menu. Beat the bot to unlock them one at a time,
          from the weakest unlock to the strongest at ten wins. A selected power costs 2 mana and works once per turn.
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
          <li>A <b>Chained</b> minion is out of the duel entirely while its chains hold: see the next chapter.</li>
        </ul>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">5</span> Chained, in full</h4>
        <p>
          <b>Chained</b> is the game&rsquo;s price tag on something too strong for its cost, and it is stricter
          than sleep. A Chained minion is unavailable for its <b>first two owner turns</b>. Across that window
          it cannot attack, its Ongoing effect does not fire, and it <b>cannot be targeted at all</b> — not by
          an attack, not by removal, not by a buff of your own. It simply sits there, untouchable by both
          players, until the chains break and it wakes up ready.
        </p>
        <p className="rules-aside">
          Some cards arrive Chained by their own printed text; others are chained by an enemy effect or by a
          marked board slot. Chains across the artwork are how you spot it.
        </p>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">6</span> When a card&rsquo;s text happens</h4>
        <dl className="rules-glossary">
          <dt>Battlecry</dt>
          <dd>Happens once, when the minion enters play.</dd>
          <dt>Ongoing</dt>
          <dd>Happens again at the start of its owner&rsquo;s turn. An enemy Ongoing waits for the enemy&rsquo;s turn, not yours.</dd>
          <dt>Passive</dt>
          <dd>A standing rule that applies for as long as the minion is active. It never &ldquo;fires&rdquo;.</dd>
          <dt>Battlecry/Ongoing</dt>
          <dd>Both: once on arrival, then again every owner turn.</dd>
          <dt>Deathrattle</dt>
          <dd>Happens after the minion dies — unless it was Silenced first.</dd>
        </dl>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">7</span> Words on the cards</h4>
        <dl className="rules-glossary">
          <dt>Taunt</dt>
          <dd>The enemy must deal with this minion before attacking your core.</dd>
          <dt>Charge</dt>
          <dd>May attack the same turn it is summoned, or the turn it changes controller.</dd>
          <dt>Chained</dt>
          <dd>Two owner turns of nothing: no attack, no passive or Ongoing effect, and untargetable by either side.</dd>
          <dt>Divine Shield</dt>
          <dd>Blocks the next instance of damage, whatever its size, then the gold rim goes out.</dd>
          <dt>Freeze</dt>
          <dd>The minion loses its next turn, then thaws once it has sat that turn out.</dd>
          <dt>Silence</dt>
          <dd>Strips the printed effect and keywords, and takes back every stat <b>buff</b> the minion is carrying, down to its printed stats. Nerfs it has taken are kept. A Silence that its own card calls temporary only suspends the buffs.</dd>
          <dt>Evade</dt>
          <dd>A printed percentage chance to dodge an incoming attack outright.</dd>
          <dt>Invulnerable</dt>
          <dd>Takes no damage while the condition lasts; a blue-and-white rim shows it.</dd>
          <dt>Immune</dt>
          <dd>Takes no damage from one named source — a camp, an alignment, a damage type.</dd>
          <dt>Untargetable</dt>
          <dd>Attacks and effects cannot choose it while the condition lasts.</dd>
          <dt>Attack Locked</dt>
          <dd>Cannot attack until the printed lock ends; the attack gem greys out.</dd>
          <dt>Marked</dt>
          <dd>A delayed effect is waiting on the minion. The card that marked it says when it lands.</dd>
          <dt>Protected slot</dt>
          <dd>A board position that shields whoever stands in it from Silence, Freeze and Chained — but not from damage, targeting or removal.</dd>
          <dt>Destroy</dt>
          <dd>Removes a minion outright, dealing no damage. Divine Shield does not stop it.</dd>
          <dt>Summon</dt>
          <dd>Puts a new minion into an open slot. No open slot, no summon.</dd>
          <dt>Gain stats</dt>
          <dd>Adds ATK and both maximum and current HP.</dd>
          <dt>Target</dt>
          <dd>A minion, card or board slot that you choose when the effect resolves.</dd>
        </dl>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">8</span> Camp and alignment</h4>
        <p>
          Every minion carries a <b>camp</b> — Magic, Nature or Tech — and an <b>alignment</b> — Good, Evil or
          Neutral. A great many effects hunt by one or the other, so read both labels before you commit a card.
          A rare <b>ALL</b> camp minion accepts a buff aimed at any camp and takes no camp-specific debuff at all.
        </p>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">9</span> Ascension Relics</h4>
        <ul className="rules-list">
          <li>The <b>21 relics</b> ride in the same shared deck and arrive in hand like any other card.</li>
          <li>Play one onto a friendly minion to equip it. A minion carries up to <b>two</b>, in independent slots.</li>
          <li>An attached relic stays with its bearer. A minion cannot choose to return it to its owner, and a relic cannot be manually returned to hand.</li>
          <li>A relic dies with its bearer unless its own text says otherwise. Effects that return a minion to hand discard its attached relics.</li>
        </ul>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">10</span> Reading the board</h4>
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
            <dt>Grey gem</dt>
            <dd>Cannot attack</dd>
            <dt>Drifting z</dt>
            <dd>Asleep this turn</dd>
          </dl>
        </div>
      </section>

      <section className="rules-chapter">
        <h4><span className="rules-step-no">11</span> Shortcuts</h4>
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
