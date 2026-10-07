import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { sfx } from "../audio/sfx";
import { cards, relics } from "../data/cards";
import type { CardLibrary } from "../engine/game";
import type { PlayableCard } from "../engine/types";
import type { KeywordEntry } from "../keywords";
import { handKeywordEntriesFor } from "../card-presentation";
import { CardFace, KEYWORD_POPOVER_GAP, KeywordPopover, playableFace } from "../card-face";
import { revealOrder } from "../unlocks";

/**
 * The card pack a finished duel hands over.
 *
 * Three deliberate choices, because the obvious build of this is worse:
 *
 * The pack takes FIVE hits, not one. A single click is a dialog with a picture
 * on it — the reward arrives before the player has done anything, so nothing
 * builds. Raised from three on 3 September 2026 (owner's ruling): three had a
 * middle, five has a CLIMB, and each hit now cuts its own line into the box so
 * the damage is countable rather than just louder. The last hit does not open
 * it — the box holds, fully cracked and straining, for a beat, and then goes.
 *
 * The cards deal themselves out one at a time rather than appearing as a grid.
 * A grid of ten is read as "ten"; a stagger is read as ten separate arrivals,
 * which is the same information and a completely different feeling.
 *
 * The fireworks are generated once per mount and held in a ref. Generating them
 * during render would re-roll every spark on every state change, so the burst
 * would visibly reshuffle itself the moment the first card landed.
 */
const PACK_HITS = 5;

/**
 * The beat between the last hit and the burst.
 *
 * The pack does not open ON the fifth click. It holds, shaking, with all five
 * cracks lit, and then goes. That pause is the whole payoff of counting to five:
 * the player lands the last hit and then watches it fail, which is a different
 * event from a box that simply opens when clicked enough times.
 */
const PACK_BURST_DELAY_MS = 1000;

/**
 * Where each crack sits. One per hit, in the order they are cut.
 *
 * Angles rather than a symmetric fan: five evenly spaced lines read as a
 * snowflake, which is a pattern rather than damage. `scale` shortens the later
 * ones so the box looks broken from the middle outward instead of sliced into
 * equal pieces.
 */
const PACK_CRACKS = [
  { angle: 16, scale: 1 },
  { angle: -38, scale: 0.8 },
  { angle: 72, scale: 0.66 },
  { angle: -76, scale: 0.58 },
  { angle: 44, scale: 0.72 },
];

/** Card width and gap from `.pack-card` / `.pack-reveal`; keep the three in step. */
const PACK_CARD_WIDTH = 206;
const PACK_CARD_GAP = 14;
/** The card's own 750 × 1050 shape at the layout width above. */
const PACK_CARD_HEIGHT = (PACK_CARD_WIDTH * 1050) / 750;
/**
 * How far past its layout size the reveal may be DRAWN.
 *
 * The cards lay out at 206px and the transform decides what that looks like, so
 * a wide screen has no reason to stop at 206: at 1920 the fifteen-card grid was
 * using 1,081px of 1,920 and leaving 420px of empty veil down each side (owner's
 * ruling, 3 September 2026 — "why so much wasted space"). 1.35 is a ceiling
 * rather than a target: a transform scaled far past 1 rasterises text softly,
 * and a third bigger is the most this face takes while staying crisp.
 */
const PACK_MAX_SCALE = 1.35;
/**
 * Everything on the pack stage that is not the reveal — the kicker, the running
 * total, the Collect button and the gaps between them.
 *
 * Only a FALLBACK, used for the first frame before the reveal's own box has been
 * measured. The real figure is read off the laid-out wrapper, because a constant
 * here goes quietly stale the moment a font or a gap on that stage changes, and
 * the way it fails is a pack that scrolls again.
 */
const PACK_STAGE_RESERVE = 210;

interface PackLayout {
  columns: number;
  rows: number;
  /** The reveal's LAYOUT size, always at full card width. */
  width: number;
  height: number;
  /** What the whole reveal is rendered at, so it fits without scrolling. */
  scale: number;
  /** What a hovered card multiplies itself by to reach `PACK_HOVER_WIDTH`. */
  lift: number;
}

/**
 * How wide a hovered card should end up on screen, in real pixels.
 *
 * A pack card is drawn anywhere between about 115px and 262px depending on how
 * many arrived and how big the window is, so a fixed hover scale means the
 * enlarged card is a different size every time — and on a fifteen-card pack in a
 * small window, still too small to read. This is the size it lands at instead,
 * and the multiplier is worked back from whatever the grid did.
 *
 * 315, cut a quarter from 420 on 4 September 2026 (owner's ruling). At 420 an
 * enlarged card covered most of its neighbours; the point is to read one card,
 * not to lose the row it came from.
 */
const PACK_HOVER_WIDTH = 315;
/** Never smaller than the card already is, never a jump that covers the screen. */
const PACK_HOVER_RANGE = { min: 1.25, max: 3.2 };

/** Reward cards preserve their complete printed face while the grid scales to fit. */
function packLayout(count: number, viewportWidth: number, availableHeight: number): PackLayout {
  const cards = Math.max(1, count);
  // `96vw` is the stage's own width in App.css; keep the two in step.
  const availableWidth = Math.max(160, viewportWidth * 0.96);
  const usableHeight = Math.max(160, availableHeight);
  let best: PackLayout | null = null;
  for (let split = 1; split <= cards; split += 1) {
    const columns = Math.ceil(cards / split);
    const rows = Math.ceil(cards / columns);
    const width = columns * PACK_CARD_WIDTH + (columns - 1) * PACK_CARD_GAP;
    const height = rows * PACK_CARD_HEIGHT + (rows - 1) * PACK_CARD_GAP;
    const scale = Math.min(PACK_MAX_SCALE, availableWidth / width, usableHeight / height);
    // The epsilon keeps the FEWEST rows on a tie: two rows and three rows often
    // fit identically, and the flatter one reads as a hand.
    if (!best || scale > best.scale + 0.001) {
      best = { columns, rows, width, height, scale, lift: hoverLift(scale) };
    }
  }
  return best ?? {
    columns: 1,
    rows: 1,
    width: PACK_CARD_WIDTH,
    height: PACK_CARD_HEIGHT,
    scale: 1,
    lift: hoverLift(1),
  };
}

/** The hover multiplier that lands a card of this scale at `PACK_HOVER_WIDTH`. */
function hoverLift(scale: number): number {
  const wanted = PACK_HOVER_WIDTH / (PACK_CARD_WIDTH * scale);
  return Math.max(PACK_HOVER_RANGE.min, Math.min(PACK_HOVER_RANGE.max, wanted));
}

export function CardPack({
  ids,
  library,
  total,
  onDone,
}: {
  ids: string[];
  library: CardLibrary;
  total: number;
  onDone: () => void;
}) {
  const [hits, setHits] = useState(0);
  const [dealt, setDealt] = useState(0);
  /**
   * Fully cracked but not yet open.
   *
   * `opened` is its own state rather than `hits >= PACK_HITS`, because the last
   * hit and the burst are now a second apart. Everything downstream — the
   * fireworks, the deal, the Collect button — keys off `opened`, so none of it
   * had to learn about the pause.
   */
  const charged = hits >= PACK_HITS;
  const [opened, setOpened] = useState(false);
  const [packKeywords, setPackKeywords] = useState<{
    entries: KeywordEntry[];
    left: number;
    top: number;
    side: "left" | "right";
  } | null>(null);
  const packKeywordTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (packKeywordTimer.current !== null) window.clearTimeout(packKeywordTimer.current);
  }, []);

  useEffect(() => {
    if (!charged || opened) return;
    const handle = window.setTimeout(() => {
      setOpened(true);
      sfx.play("summonMythic");
    }, PACK_BURST_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [charged, opened]);
  // How many cards a row can hold depends on the window, so it is read from the
  // window and re-read when that changes. A pack is on screen for a few seconds,
  // which makes one listener cheap and a stale layout expensive.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /**
   * The height the reveal is actually allowed, MEASURED rather than assumed.
   *
   * The wrapper is the one flexible child of the stage, so whatever the kicker,
   * the total and the Collect button leave over is exactly its height — and
   * reading it beats guessing it, because the guess is what goes stale. There is
   * no feedback loop: the reveal is scaled by a transform, which takes no part
   * in layout, so the box being measured never moves because of what is measured.
   */
  const revealBox = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  useEffect(() => {
    const node = revealBox.current;
    if (!node) return;
    setMeasuredHeight(node.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasuredHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [opened]);
  // Sorted so the rarest and dearest card is the last one to land. What the pack
  // CONTAINS is already settled by the unlock order; this only decides the order
  // they arrive in, so it cannot bias the reward.
  const rewardCards = useMemo(
    () => revealOrder(ids.map((id) => library[id]).filter((card): card is PlayableCard => Boolean(card))),
    [ids, library],
  );
  const faces = useMemo(() => rewardCards.map((card) => playableFace(card)), [rewardCards]);

  function clearPackKeywords() {
    if (packKeywordTimer.current !== null) {
      window.clearTimeout(packKeywordTimer.current);
      packKeywordTimer.current = null;
    }
    setPackKeywords(null);
  }

  function armPackKeywords(card: PlayableCard | undefined, el: HTMLElement) {
    clearPackKeywords();
    if (!card) return;
    const entries = handKeywordEntriesFor(card);
    if (entries.length === 0) return;
    packKeywordTimer.current = window.setTimeout(() => {
      packKeywordTimer.current = null;
      if (!el.isConnected) return;
      // The layout wrapper stays small while the inner card grows on hover.
      // Calculate that intended visual rectangle directly, so the popup never
      // falls back onto the enlarged face when the transform is in flight.
      const rect = el.getBoundingClientRect();
      const origin = getComputedStyle(el).getPropertyValue("--lift-origin").trim().split(/\s+/);
      const visualWidth = PACK_HOVER_WIDTH;
      const visualHeight = PACK_CARD_HEIGHT * (visualWidth / PACK_CARD_WIDTH);
      const visualLeft = origin[0] === "left"
        ? rect.left
        : origin[0] === "right"
          ? rect.right - visualWidth
          : rect.left + (rect.width - visualWidth) / 2;
      const visualTop = origin[1] === "top"
        ? rect.top
        : origin[1] === "bottom"
          ? rect.bottom - visualHeight
          : rect.top + (rect.height - visualHeight) / 2;
      const visualRight = visualLeft + visualWidth;
      const side = window.innerWidth - visualRight - KEYWORD_POPOVER_GAP >= visualLeft - KEYWORD_POPOVER_GAP ? "right" : "left";
      setPackKeywords({
        entries,
        left: side === "right" ? visualRight : visualLeft,
        top: visualTop,
        side,
      });
    }, 1000);
  }
  // One roll per mount. `useState` with an initialiser, not `useMemo`: a memo is
  // allowed to be thrown away and recomputed, and a re-rolled firework is a
  // visible glitch rather than a cheap recovery.
  const [sparks] = useState(() => {
    // The blast is sized to the SCREEN. A fixed 620px reach is a fair explosion
    // in a 900px window and a modest puff in the middle of a 1440px-tall one,
    // which is the shape of the complaint that produced this: it read as a small
    // rectangle of light rather than as something going off.
    const reach = Math.max(0.85, Math.min(window.innerWidth, window.innerHeight) / 820);
    return Array.from({ length: 128 }, (_, index) => {
      // Two shells, not one ring. A single evenly spaced ring reads as a circle
      // of dots however fast it moves; a dense near shell inside a sparser far
      // one is what a firework actually looks like.
      const near = index % 3 !== 0;
      const angle = (index / 128) * Math.PI * 2 + Math.random() * 0.7;
      const distance = (near ? 150 + Math.random() * 250 : 380 + Math.random() * 420) * reach;
      return {
        key: index,
        x: Math.cos(angle) * distance,
        // ROUND, not squashed. The vertical throw was multiplied by 0.8, which
        // is what made a burst read as a wide flat oval instead of a sphere
        // opening (owner's ruling, 3 September 2026).
        y: Math.sin(angle) * distance,
        size: near ? 6 + Math.random() * 10 : 3 + Math.random() * 6,
        delay: Math.random() * (near ? 0.2 : 0.4),
        dur: near ? 0.9 + Math.random() * 0.6 : 1.2 + Math.random() * 0.8,
        hue: [46, 190, 276, 12][index % 4],
      };
    });
  });

  // Cards deal themselves; there is nothing left to click once the pack is open,
  // so making the player click ten more times would only be in the way.
  useEffect(() => {
    if (!opened || dealt >= faces.length) return;
    const handle = window.setTimeout(() => {
      setDealt((count) => count + 1);
      sfx.play("draw");
    }, dealt === 0 ? 420 : 160);
    return () => window.clearTimeout(handle);
  }, [opened, dealt, faces.length]);

  function strike() {
    if (charged) return;
    const next = hits + 1;
    setHits(next);
    // The climb is in the SOUND as well as the cracks. The first hit is a dull
    // knock, the middle three are the shell breaking, and the last one is a
    // heavy landing rather than the fanfare — the fanfare belongs to the burst
    // a second later, or the two would collide.
    if (next >= PACK_HITS) sfx.playHeavyLand(1);
    else sfx.play(next === 1 ? "hit" : "shieldBreak");
  }

  const allDealt = opened && dealt >= faces.length;
  const layout = packLayout(
    faces.length,
    viewportWidth,
    // The fallback is the first frame only, before the wrapper exists to measure.
    measuredHeight || Math.min(viewportHeight * 0.94, viewportHeight - 40) - PACK_STAGE_RESERVE,
  );

  return (
    <div className={opened ? "pack-veil is-open" : "pack-veil"}>
      {opened ? (
        <div className="pack-burst" aria-hidden="true">
          {/* The blast itself, and the part that was missing: a round white core
              that swells and dies, with two shockwave rings running out through
              it. The sparks alone read as confetti appearing — a firework is
              light FIRST and debris second. All three are circles centred on the
              pack, so the explosion has a shape instead of a bounding box. */}
          <span className="pack-flash" />
          <span className="pack-shock" />
          <span className="pack-shock is-late" />
          {sparks.map((spark) => (
            <span
              key={spark.key}
              className="pack-spark"
              style={
                {
                  "--sx": `${spark.x}px`,
                  "--sy": `${spark.y}px`,
                  "--ss": `${spark.size}px`,
                  "--sd": `${spark.delay}s`,
                  "--st": `${spark.dur}s`,
                  "--sh": `${spark.hue}`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      <section className="pack-stage" role="dialog" aria-label="New cards unlocked">
        {opened ? null : (
          <>
            {/* NO WORDS ON THE SEALED SCREEN (owner's ruling, 4 September 2026).
                The count above the pack and the running instruction below it —
                "Strike it open", "Again", "Once more", "It is giving way…" —
                are gone. A pack that shakes, cracks and brightens under the
                pointer is already saying what to do, and the sentence saying it
                too was the only part of the ceremony written in prose. The
                button keeps its `aria-label`, which is where that instruction
                genuinely belongs. */}
            <button
              type="button"
              // Keyed on the count, so the shake RESTARTS on every click. Same
              // animation name on every hit state means the browser would
              // otherwise let it run once and ignore the rest.
              key={`pack-${hits}`}
              className={`pack-box hits-${hits}${charged ? " is-charged" : ""}`}
              onClick={strike}
              // The shake and the glow both read this, so their strength climbs
              // with the count instead of being three hand-written states.
              style={{ "--hit": hits / PACK_HITS } as CSSProperties}
              aria-label={`Strike the pack to open it. ${Math.max(0, PACK_HITS - hits)} to go.`}
            >
              <span className="pack-box-face" aria-hidden="true">
                <span className="pack-box-sigil">✦</span>
              </span>
              {PACK_CRACKS.map((crack, index) => (
                <span
                  // Keyed by the HIT it belongs to, so a new line mounts on its
                  // own click and plays its cut animation once. Rendering all
                  // five and toggling opacity would fade them in instead.
                  key={index}
                  className={index < hits ? "pack-box-crack is-cut" : "pack-box-crack"}
                  style={{ "--ca": `${crack.angle}deg`, "--cs": crack.scale } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <span className="pack-box-glow" aria-hidden="true" />
            </button>
          </>
        )}

        {opened ? (
          <>
            {/* No kicker here either (owner's ruling, 4 September 2026). "Added
                to the shared deck" was the last line of prose on this screen,
                and the cards arriving one at a time already say it. The running
                total below them stays, because it is a number nothing else
                reports. */}
            {/* Rows are balanced rather than left to wrap. Six cards wrapping
                naturally gave a row of five and one card stranded underneath it,
                which reads as a mistake; three and three reads as a hand. The
                width is what does it, because flex-wrap has no notion of an
                even split. */}
            <div className="pack-scroll" ref={revealBox}>
              {/* Laid out at full card width and DRAWN smaller. The width and
                  height below are the layout the faces measure themselves
                  against — 206px a card, above the floor where `.card-face`
                  retains its complete rules — and the transform is what makes fifteen
                  of them fit a window that has room for ten. */}
              <div
                className="pack-reveal"
                style={
                  {
                    width: `${layout.width}px`,
                    height: `${layout.height}px`,
                    transform: `scale(${layout.scale})`,
                    // How far a hovered card lifts, computed so it always reads
                    // at about the same size on screen whatever the grid did:
                    // a fixed 1.5 is a small nudge on a five-card pack drawn at
                    // 1.27 and not nearly enough on fifteen drawn at 0.56.
                    "--pack-lift": layout.lift,
                  } as CSSProperties
                }
              >
                {faces.slice(0, dealt).map((face, index) => (
                  <div
                    className="pack-card"
                    key={`${face.name}-${index}`}
                    onMouseEnter={(event) => armPackKeywords(rewardCards[index], event.currentTarget)}
                    onMouseLeave={clearPackKeywords}
                    // A card on the edge of the grid grows INWARD. Enlarging
                    // from the centre pushed the first card 63px off the left of
                    // a 1920 screen, and the grid is deliberately as wide as the
                    // window now, so the outer column is exactly where a pointer
                    // lands most often.
                    style={
                      {
                        "--lift-origin": `${
                          index % layout.columns === 0
                            ? "left"
                            : index % layout.columns === layout.columns - 1
                              ? "right"
                              : "center"
                        } ${
                          layout.rows === 1
                            ? "center"
                            : index < layout.columns
                              ? "top"
                              : Math.floor(index / layout.columns) === layout.rows - 1
                                ? "bottom"
                                : "center"
                        }`,
                      } as CSSProperties
                    }
                  >
                    {/* The lift lives on an INNER element. `.pack-card` is
                        carrying the deal animation, whose `both` fill holds a
                        transform on it forever, and an animation's fill beats a
                        plain `:hover` rule in the cascade — the hover would
                        simply never apply. */}
                    <div className="pack-card-lift">
                      {/* NOT lazy, unlike the gallery. Fifteen images at the
                          most, and each one is the thing the player is here to
                          look at — a card that deals itself onto the table with
                          an empty black frame is the reward arriving broken. */}
                      <CardFace card={face} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className={allDealt ? "pack-total is-in" : "pack-total"}>
              {total} of {cards.length + relics.length} cards unlocked
            </p>
            <button type="button" className="primary pack-collect" onClick={onDone} disabled={!allDealt}>
              Collect
            </button>
            {packKeywords ? <KeywordPopover entries={packKeywords.entries} left={packKeywords.left} top={packKeywords.top} side={packKeywords.side} /> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
