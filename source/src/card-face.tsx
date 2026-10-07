/**
 * The live card face and the small surfaces that draw one: keyword buttons and
 * popovers, card peeks, and the relic-as-card conversion. Every card in the
 * game — hand, board, gallery, profile, pack, previews — renders through here.
 */
import { createContext, Fragment, memo, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { relics } from "./data/cards";
import { BASELINE_RARITY, isRelicCard, RARITIES, RELIC_CAMP_LABEL, RELIC_RARITY } from "./engine/types";
import type { PlayableCard, RelicDefinition, RelicInstance } from "./engine/types";
import { tokenCard } from "./engine/tokens";
import { cardArtPosition, splitCardText, sameCardFace, sameStrings, type CardFaceModel } from "./card-presentation";
import { plainKeywordText, type KeywordEntry } from "./keywords";
import { fitOneLine, fitParagraph } from "./textfit";

export const FontRevisionContext = createContext(0);

// Everything the card face needs to DRAW itself. It used to be six fields,
// because the rest was baked into a PNG; now the face is DOM, so it needs the
// whole printed card. CardDefinition and MinionInstance both satisfy it
// structurally; relics satisfy it too via relicFace() below, which is why the
// fields are widened rather than Pick'ed — a relic has no ATK/HP, and its rails
// read RELIC instead of a camp and an alignment.


/** Relic definitions by id — RelicInstance drops flavour and origin, so the
 *  full card has to be read back out of the library to be shown. */
export const relicLibrary = new Map(relics.map((relic) => [relic.id, relic]));

/** A relic as a drawable card: teal frame, no stat gems, and the
 *  side rails the printed relics use. */
export function relicFace(relic: RelicInstance | RelicDefinition): CardFaceModel {
  const def = relicLibrary.get(relic.id);
  return {
    name: relic.name,
    art: relic.art,
    effect: relic.effect,
    origin: def?.origin ?? "",
    flavor: def?.flavor ?? "",
    cost: def?.cost,
    rarity: RELIC_RARITY,
    camp: RELIC_CAMP_LABEL,
    alignment: RELIC_RARITY,
  };
}

export function playableFace(card: PlayableCard, costOverride?: number): CardFaceModel {
  const face = isRelicCard(card) ? relicFace(card) : card;
  return costOverride === undefined || face.cost === costOverride ? face : { ...face, cost: costOverride };
}

export const KEYWORD_POPOVER_GAP = 24;

export const GalleryPreviewContext = createContext<Record<string,string>>({});

// --- text auto-fit ----------------------------------------------------------
// The sizes come from `textfit.ts`, which measures the real glyphs in the real
// fonts and wraps them the way the browser will. The box numbers below are the
// real geometry out of App.css.
//
// These used to be two arithmetic estimates based on an average character
// width. That worked only because a hard ceiling of 37 design units was doing
// the real work — nearly every card hit the cap and the estimate never decided
// anything. The ceilings below are 2-3x higher, so the fit now IS the answer for
// most of the roster, and a character-count estimate is not good enough to be
// the answer: it assumes text fills a box completely when real text wraps at
// word boundaries and leaves a ragged edge, and it overestimates hardest exactly
// when the font is large.

/** Usable banner width. NOT the full 740: the mana gem sits on top of the
 *  banner's right end, so the name has to stop clear of it or it renders
 *  underneath the number. Symmetric because the name is centred. */
/* 500, down from 580, because the mana crystal grew a third: 84 design units to
 * 112, which walks its left edge from 664 to 636. MEASURED, not reasoned: the
 * widest name on the roster inks 475 units at the old 46 cap and stopped 52
 * short of the crystal. Raise the cap to 55 and that ink becomes ~570 and ends
 * at 660 — 24 units UNDER the enlarged crystal. The name is centred, so every
 * unit the crystal gains costs the box two. */
const NAME_BOX = 500;        // full-size card, 112-unit crystal
// Small card. The compact mana crystal grew 104 -> 240 design units (see the
// @container block in App.css), and this is the width the name is allowed to
// use before it slides under the cost number — so it had to come down with it.
const NAME_BOX_COMPACT = 470;
/**
 * A minion IN PLAY has its own geometry and needs its own two numbers, because
 * its gems are much bigger than the printed card's: the cost crystal is 150
 * design units against the print card's 78, and the ATK blade and HP heart are
 * 150-156 against 80-86. Reusing the printed card's boxes put every long name
 * underneath the cost number and ran the last line of wordy cards under the
 * blade — both measured, neither visible in a screenshot.
 *
 * The name is also pushed LEFT on board (see `.card-face.on-board .cf-name`), so
 * this width is the space to the left of the crystal rather than a symmetric
 * reserve.
 */
const NAME_BOX_BOARD = 540;
/**
 * The width a board name may use and still sit CENTRED.
 *
 * A minion in play carries a 150-unit cost crystal whose left edge is at 598, so
 * a centred name has to stay 152 units clear of BOTH edges: 750 - 2 x 152 = 446,
 * and 440 keeps a little back. Names that fit here are centred; the rest keep
 * the old left-shifted layout, because for them the space to the left of the
 * crystal is space they genuinely need.
 */
const NAME_BOX_BOARD_CENTRED = 440;
/** The board's own name cap, written in CSS as `min(46, …)`. Kept here so the
 *  centring test and the stylesheet cannot disagree about it. */
const BOARD_NAME_CAP = 46;

/** The description plaque's inner box: 618 x 302 design units, line-height 1.16. */
const RULES_BOX = { w: 618, h: 302, lineHeight: 1.16 } as const;
/**
 * The plaque on a board minion. SMALLER than the printed card's, because the
 * artwork is 15% BIGGER than the printed card's and the plaque takes what is
 * left. That is the intended direction of the trade: the picture is the card.
 * Trimmed padding (14 rather than 30/22) claws back what it can without
 * touching the art.
 */
const RULES_BOX_BOARD = { w: 664, h: 198, lineHeight: 1.16 } as const;
/** The flavour strip: 610 x 84, line-height 1.1. */
const FLAVOR_BOX = { w: 610, h: 84, lineHeight: 1.1 } as const;

/**
 * How big the rules text may get. Raised from 37, which is where "way too
 * small" came from: at 37 units a board minion's text renders around ten
 * pixels, and since the overwhelming majority of cards say something short
 * ("Taunt.", "Divine Shield.", "Freeze a minion") they ALL sat at that cap with
 * room to spare around them. Short text now fills its plaque. The wordiest cards
 * in the roster are limited by the box rather than by this number, and land
 * wherever the measurer says they land.
 */
const RULES_CEILING = 64;
const FLAVOR_CEILING = 32;
/* 55, up a fifth from 46. Every name on the roster was measured before this
 * moved: they all sat at 45.5, pinned by this ceiling rather than by their box,
 * so raising it is the only thing that makes a name bigger. The two longest —
 * "Rennala Queen of the Full Moon" and "Goku" — are
 * box-limited instead and grow less, which is the honest outcome rather than a
 * bug. The BOARD keeps its own 46 cap in CSS: a minion in play has far less
 * room across the top and nothing there was asking to be bigger. */
const NAME_CEILING = 55;
const NAME_CEILING_COMPACT = 72;

export function campAccent(camp: string): string {
  if (camp === "Nature") return "#79c66a";
  if (camp === "Tech") return "#70c9ff";
  if (camp === "ALL") return "#f0c767";
  // Relics print "Relic" where a character prints its camp, and fell
  // through to the Magic purple, so every relic wore another class's colour.
  // Teal is what their own card frame is printed in.
  if (camp === RELIC_CAMP_LABEL) return "#56d8cd";
  return "#b996ff";
}

/**
 * Which tiers carry an animated shine, and the baseline tier is deliberately
 * absent.
 *
 * The escalation only reads as an escalation if the bottom of it is still. Give
 * every card a shine and the tiers stop meaning anything; 60 Rare cards then
 * also stop costing anything, which is what keeps a full gallery affordable.
 *
 * Derived, so adding a tier to the engine's table cannot leave this list behind:
 * everything above the baseline, plus relics.
 */
const SHINE_RARITIES = new Set(
  [...RARITIES.filter((rarity) => rarity !== BASELINE_RARITY), RELIC_RARITY].map((rarity) => rarity.toLowerCase()),
);

/**
 * Rail values with a lit palette built for them.
 *
 * The camp and alignment marks live on the RAILS — the two vertical words down
 * the card's edges — rather than as artwork behind the picture. That was tried
 * and scrapped: two animated systems in the middle of one card compete for the
 * same space, and a card has one middle.
 *
 * `ALL` is in here despite belonging to only two cards, because its palette is
 * not a seventh invention — it cycles the other three camp hues in turn, which
 * is what the camp itself means.
 */
const RAIL_CAMPS = new Set(["magic", "tech", "nature", "all"]);
const RAIL_ALIGNMENTS = new Set(["good", "neutral", "evil"]);

/**
 * Rules text with every glossary word turned into a button.
 *
 * The scan is a single pass over the string against `KEYWORD_LOOKUP`, which is
 * sorted longest-match-first — that ordering is what stops "Shield" claiming
 * the position that belongs to "Divine Shield". A match only counts on word
 * boundaries, so "Charged" is not Charge and "Retarget" is not Target.
 *
 * The popover is rendered inline, next to the word, rather than in a portal. It
 * is small, it belongs to the sentence it interrupts, and every surface that
 * switches this on is already a modal with room around the card.
 */

export function KeywordText({ text, allowRelic = true }: { text: string; allowRelic?: boolean }) {
  const [open, setOpen] = useState<{ index: number; left: number; top: number;rect:DOMRect } | null>(null);
  const pieces = useMemo(() => splitCardText(text,allowRelic), [text,allowRelic]);
  const root=useRef<HTMLSpanElement>(null);
  useEffect(()=>setOpen(null),[text]);

  // Anything that moves the word out from under the panel closes it: a scroll,
  // a resize, Escape, or a click anywhere else. A definition pinned to a
  // viewport position is wrong the moment its word is somewhere else.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("pointerdown", outside,true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("pointerdown", outside,true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span ref={root}>
      {pieces.map((piece, index) =>
        piece.entry||piece.token ? (
          <button
            key={index}
            type="button"
            className={open?.index === index ? "cf-kw is-open" : "cf-kw"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              // The card face sits inside clickable furniture in some of its
              // homes; a definition must never also be a card selection.
              event.stopPropagation();
              if (open?.index === index) {
                setOpen(null);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setOpen({ index, left: (rect.left + rect.right) / 2, top: rect.bottom,rect });
            }}
            aria-expanded={open?.index === index}
          >
            {piece.text}
          </button>
        ) : (
          <Fragment key={index}>{piece.text}</Fragment>
        ),
      )}
      {open && pieces[open.index]?.entry ? (
        <KeywordPopover entries={[pieces[open.index].entry!]} left={open.left} top={open.top} />
      ) : null}
      {open&&pieces[open.index]?.token&&<CardPeek face={playableFace(tokenCard(pieces[open.index].token!,pieces[open.index].token==='token:sin'?{effect:'Gets one random keyword when summoned: Taunt, Divine Shield, Charge, or Chained.'}:{}))} rect={open.rect} label={`Token card: ${tokenCard(pieces[open.index].token!).name}`}/>}
    </span>
  );
}

/** The definition panel itself, kept on screen and out of the card's clipping. */
export function KeywordPopover({
  entries,
  left,
  top,
  above = false,
  side,
}: {
  entries: KeywordEntry[];
  left: number;
  top: number;
  /** Always sit ABOVE `top`, rather than below it unless there is no room. */
  above?: boolean;
  /** Place beside an anchored card, keeping the card itself unobstructed. */
  side?: "auto" | "left" | "right";
}) {
  const baseWidth = 264;
  // Flip above the word when there is no room beneath it. The estimate scales
  // with how many definitions are stacked in one panel.
  const sideGap = KEYWORD_POPOVER_GAP;
  const beside = side !== undefined;
  const canFitRight = left + sideGap + baseWidth <= window.innerWidth - 10;
  const placement = side === "auto" ? (canFitRight ? "right" : "left") : side;
  const availableSide = placement === "right"
    ? window.innerWidth - left - sideGap - 10
    : left - sideGap - 10;
  // A narrow screen can leave less room than the full panel. Shrink the panel
  // inside that side column instead of clamping it back over the card.
  const width = beside ? Math.max(160, Math.min(baseWidth, availableSide)) : baseWidth;
  const estimatedHeight = 60 + entries.length * (width < baseWidth ? 150 : 120);
  const besideLeft = placement === "right" ? left + sideGap : left - width - sideGap;
  const clampedLeft = beside
    ? Math.max(10, Math.min(besideLeft, window.innerWidth - width - 10))
    : Math.max(10, Math.min(left - width / 2, window.innerWidth - width - 10));
  const clampedTop = Math.max(10, Math.min(top, window.innerHeight - estimatedHeight - 10));
  const flip = above || top + estimatedHeight > window.innerHeight;
  // A PORTAL, and that is the fix for the clipping.
  //
  // The panel is `position: fixed`, which is normally enough — but a fixed
  // element is still positioned and painted inside the nearest ancestor that
  // makes a stacking context, and a card face is full of them: transforms on the
  // frame, blend modes on the shine, its own z-indexed gems and rails. Rendered
  // in place, the panel was showing the card's flavour text through itself and
  // being painted over by the ATK gem. Mounted on `document.body` it has no
  // ancestor left to be trapped by.
  return createPortal(
    <span
      className={flip ? "cf-kw-pop is-above" : "cf-kw-pop"}
      role="note"
      style={beside
        ? { left: clampedLeft, top: clampedTop, width }
        : { left: clampedLeft, top: flip ? undefined : top + 8, bottom: flip ? window.innerHeight - top + 12 : undefined, width }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {entries.map((entry) => (
        <span key={entry.term} className="cf-kw-pop-entry">
          <strong>{entry.term}</strong>
          <span>{plainKeywordText(entry.text)}</span>
        </span>
      ))}
    </span>,
    document.body,
  );
}

export const CardFace = memo(function CardFace({
  card,
  lazyArt = false,
  quiet = false,
  states = [],
  onBoard = false,
  atkClass = "",
  hpClass = "",
  effect,
  flavor,
  interactiveKeywords = false,
}: {
  card: CardFaceModel;
  /** Gallery only — see the loading note in `CardArtwork`. */
  lazyArt?: boolean;
  quiet?: boolean;
  /** Live condition classes for a minion in play (`is-frozen`, `is-shielded`…). */
  states?: readonly string[];
  /** True once the minion is on the table, where live state replaces the
   *  printed keyword — a popped Divine Shield must stop glowing. */
  onBoard?: boolean;
  atkClass?: string;
  hpClass?: string;
  /** Overrides the printed text — a silenced minion's box really is blank. */
  effect?: string;
  /** MinionInstance carries no flavour, so the board passes it in. */
  flavor?: string;
  /**
   * Turns every glossary word in the rules text into a button that explains
   * itself.
   *
   * OPT-IN, and deliberately off everywhere the card is a control rather than a
   * page. A card in hand is clicked to PLAY it and a minion on the board is
   * clicked to ATTACK with it; putting a second meaning on part of those faces
   * would turn "I clicked Taunt" into a misplay. It is on in the gallery, which
   * is the one place a card is only ever being read.
   */
  interactiveKeywords?: boolean;
}) {
  useContext(FontRevisionContext);
  // The card is DRAWN, not shown. Every number here is live, so a buff recolours
  // the real gem instead of pasting a second number over a picture, and changing
  // a line of cards.csv changes the card.
  const rawText = effect ?? card.effect ?? "";
  // 21 cards are stat-only and carry "-" as their effect, which is how the CSV
  // says "nothing". Printing it renders a lone dash in the middle of an empty
  // panel, which reads as a missing value rather than as a card with no text —
  // and it only became visible when board minions started showing their rules.
  // A vanilla minion gets no panel at all and spends the space on its artwork.
  const text = rawText.trim() === "-" ? "" : rawText;
  // Silence blanks only the rules copy. Keep the normal plaque, flavour and
  // rails in place so the red cross is the sole mark inside an otherwise
  // familiar card; vanilla stat-only cards still use the compact blank layout.
  const blank = text.trim().length === 0 && !states.includes("is-silenced");
  const quote = flavor ?? card.flavor ?? "";
  const fit = {
    "--cf-namefit": fitOneLine(card.name, NAME_BOX, NAME_CEILING),
    "--cf-namefitc": fitOneLine(card.name, NAME_BOX_COMPACT, NAME_CEILING_COMPACT),
    "--cf-namefitb": fitOneLine(card.name, NAME_BOX_BOARD, NAME_CEILING),
    // Canvas text metrics are a little more optimistic than the browser's
    // actual line boxes on the longest effects. Keep a conservative width
    // reserve so the final glyph line cannot be clipped by the plaque.
    "--cf-efffit": fitParagraph(text, RULES_BOX.w * 0.9, RULES_BOX.h, RULES_BOX.lineHeight, RULES_CEILING),
    "--cf-efffitb": fitParagraph(text, RULES_BOX_BOARD.w * 0.9, RULES_BOX_BOARD.h, RULES_BOX_BOARD.lineHeight, RULES_CEILING),
    "--cf-flavfit": fitParagraph(quote, FLAVOR_BOX.w, FLAVOR_BOX.h, FLAVOR_BOX.lineHeight, FLAVOR_CEILING, "flavor"),
  } as CSSProperties;
  const rarity = (card.rarity ?? "Black").toLowerCase();
  const isRelicFace = rarity === "relic";
  /* Centre the board name only when centring costs it nothing — that is, when
   * the symmetric box fits the name at the same size the wider asymmetric box
   * would. The centred box is the smaller of the two, so its fit can never be
   * larger; equality means both were capped by the ceiling rather than by width.
   *
   * COMPARING THE TWO FITS, not testing one against the cap. `fitOneLine` floors
   * its answer to half units (`Math.floor(lo * 2) / 2`), so a name that fits
   * comfortably at the 46 cap comes back as 45.5 and never as 46 — a `>= 46`
   * test is dead code that silently centres nothing. Every name on the roster
   * measures 45.5 for exactly this reason. */
  const boardNameCentred = onBoard &&
    fitOneLine(card.name, NAME_BOX_BOARD_CENTRED, BOARD_NAME_CAP) >=
    fitOneLine(card.name, NAME_BOX_BOARD, BOARD_NAME_CAP);
  // Only values with a palette BUILT get a lit rail. A relic's camp and
  // alignment are the placeholders "Relic" and "Relic", and relics print no
  // rails at all; naming the built sets explicitly is what stops a future camp
  // or alignment silently rendering a class nothing styles.
  const campMark = RAIL_CAMPS.has((card.camp ?? "").toLowerCase()) ? (card.camp ?? "").toLowerCase() : null;
  const alignMark = RAIL_ALIGNMENTS.has((card.alignment ?? "").toLowerCase())
    ? (card.alignment ?? "").toLowerCase()
    : null;
  // Keyword artwork. On the board the live flags win, because a Divine Shield
  // can be popped while the printed keyword stays on the card forever.
  // Conditions belong to the BOARD, never the hand (owner ruling). A card you are
  // holding shows its keywords in its text; the artwork only reacts once the
  // minion is actually in play. Taunt is the one keyword that stays live in
  // `keywords` (minions can be granted it), so it is read from there; Divine
  // Shield and Chained come from the live flags in `states`.
  const silenceHidesKeywords = states.includes("is-silenced") || states.includes("is-chained");
  const keywordClasses = onBoard && !silenceHidesKeywords
    ? (card.keywords ?? []).filter((k) => k === "Taunt").map(() => "kw-taunt")
    : [];
  const classes = ["card-face", `rarity-${rarity}`, onBoard ? "on-board" : "", blank ? "cf-blank" : "", ...keywordClasses, ...states]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={classes} style={fit}>
      {onBoard?<span className="cf-ready-glow" aria-hidden="true"/>:null}
      <div className="cf-stage">
        <div className="cf-frame" aria-hidden="true" />
        <div className="cf-well" aria-hidden="true" />
        <CardArtwork card={card} lazy={lazyArt} />
        <div className="cf-desc"><p>{interactiveKeywords ? <KeywordText text={text} allowRelic={!isRelicFace}/> : text}</p></div>
        {/* A relic has no camp and no alignment. It carried the placeholders
            "Relic" and "Relic" purely so the rails had something to print,
            and two rails naming a thing that is not a property of the card is
            worse than empty rails — the frame colour and the gem already say
            "relic" without help. Characters keep both. */}
        {isRelicFace ? null : (
          <>
            {/* Both rails are where a card announces itself now. An earlier
                build put a turning arcane circle behind the artwork instead,
                and it was scrapped: a second animated system in the middle of
                the card competes with the tier shine for the same space, and
                the card only has one middle. The words were already there. */}
            <span className={campMark ? `cf-rail cf-camp rail-${campMark}` : "cf-rail cf-camp"}>{card.camp}</span>
            <span className={alignMark ? `cf-rail cf-align rail-${alignMark}` : "cf-rail cf-align"}>
              {card.alignment}
            </span>
          </>
        )}
        {/* Relics use RELIC as a bare slot label. Character flavour keeps its
            decorative quotation marks. */}
        {quote ? <div className="cf-flavor"><span>{isRelicFace ? quote : `“${quote}”`}</span></div> : null}
        <div className="cf-origin">{card.origin}</div>
        {/* A board name is CENTRED when it can be.
            On a board the name used to be pushed left by an asymmetric padding
            so it cleared the cost crystal, which left short names — most of
            them — visibly off-centre for no reason. They are centred now, and
            only a name too wide for the symmetric safe box falls back to the
            old layout, because for that name the space beside the crystal is
            space it genuinely needs. */}
        <div className="cf-banner">
          <span className={boardNameCentred ? "cf-name is-centred" : "cf-name"}>{card.name}</span>
        </div>
        <div className="cf-gem cf-mana">{card.cost}</div>
        <div className={`cf-gem cf-atk ${atkClass}`}>{card.atk}</div>
        <div className={`cf-gem cf-hp ${hpClass}`}>{card.hp}</div>
        {/* The rarity shine. Its own element rather than pseudo-elements on the
            existing layers, because `.cf-art::after` is already the glass sheen
            and `.cf-stage::after` is spoken for by the board's rim states — a
            shine written on top of either would fight a condition the player
            needs to see.

            FIVE FIXED SLOTS for every tier, styled per rarity, with the ones a
            tier does not use switched off in CSS. The alternative — a different
            element list per rarity — puts the layer count in two places at once
            and lets the markup and the stylesheet disagree silently. Rare gets
            no shine at all: it is the baseline the other tiers escalate from. */}
        {!quiet && SHINE_RARITIES.has(rarity) ? (
          <div className="cf-shine" aria-hidden="true">
            <span className="sh-field" />
            <span className="sh-veil" />
            <span className="sh-grain" />
            <span className="sh-grain2" />
            <span className="sh-sweep" />
            <span className="sh-rim" />
          </div>
        ) : null}
        {!quiet && <div className="cf-fx" aria-hidden="true" />}
        {states.includes("is-sleeping") ? (
          <span className="cf-sleep" aria-hidden="true"><i>z</i><i>z</i></span>
        ) : null}
      </div>
    </article>
  );
}, (a, b) => sameCardFace(a.card, b.card) && sameStrings(a.states, b.states)
  && a.lazyArt === b.lazyArt && a.quiet === b.quiet && a.onBoard === b.onBoard
  && a.atkClass === b.atkClass && a.hpClass === b.hpClass && a.effect === b.effect
  && a.flavor === b.flavor && a.interactiveKeywords === b.interactiveKeywords);

function CardArtwork({ card, lazy = false }: { card: CardFaceModel; lazy?: boolean }) {
  const previews=useContext(GalleryPreviewContext);
  const preview=previews[card.art.split('/').pop()?.replace('.webp','') ?? ''];
  const position = cardArtPosition(card.name);
  // NEVER loading="lazy" here. Cards mount and unmount constantly as they move
  // between hand, board and preview, and a lazy <img> that is re-created during
  // that churn frequently never fires its load at all — it stays
  // complete:false / naturalWidth:0 forever and the card renders as a black
  // rectangle while the file itself serves fine. Half a board went black this
  // way. Only a handful of card images exist at once; load them eagerly.
  //
  // The GALLERY is the one exception, and it is a different situation, not a
  // relaxation of the rule above. Its cells mount once and stay put, so there is
  // no churn to lose a load in — while requesting the full roster at once is the
  // single biggest cost of opening the screen.
  if (!card.art) return <div className="cf-art empty-art" aria-hidden="true" />;
  return (
    <div
      className="cf-art"
      style={{
        "--card-art-position": position,
        ...(preview ? { backgroundImage: `url("${preview}")`, backgroundSize: "cover", backgroundPosition: position } : {}),
      } as CSSProperties}
    >
      <img src={card.art} alt="" draggable={false} loading={lazy ? "lazy" : undefined} decoding={lazy ? "async" : undefined}
        onError={preview ? event=>{event.currentTarget.style.opacity='0';} : undefined}
        onLoad={preview ? event=>{event.currentTarget.style.opacity='';} : undefined} />
    </div>
  );
}

export function CardPeek({face,rect,label}: {face:CardFaceModel;rect:{left:number;right:number;top:number;bottom:number};label:string}) {
  const width=Math.min(300,(innerHeight-16)/1.4,innerWidth-16),height=width*1.4;
  const beside=rect.right+12;
  const left=Math.max(8,Math.min(beside+width<=innerWidth-8?beside:rect.left-width-12,innerWidth-width-8));
  const top=Math.max(8,Math.min((rect.top+rect.bottom-height)/2,innerHeight-height-8));
  return createPortal(<aside className="equipped-relic-peek" role="status" aria-label={label} style={{left,top,width}}>
    <CardFace card={face} />
  </aside>,document.body);
}

export function RelicCardPeek({relic,rect}: {relic:RelicInstance;rect:{left:number;right:number;top:number;bottom:number}}) {
  return <CardPeek face={relicFace(relic)} rect={rect} label={`Equipped relic: ${relic.name}`} />;
}
