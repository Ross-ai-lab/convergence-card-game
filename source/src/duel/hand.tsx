/** The viewer's hand fan and mana tray along the bottom of the duel. */
import { useState, type CSSProperties, type PointerEvent } from "react";
import { effectiveCardCost, type CardLibrary } from "../engine/game";
import type { GameState, PlayableCard, PlayerId } from "../engine/types";
import { CardFace, playableFace } from "../card-face";
import type { ManaFx } from "./fx";

/** Hand card width, matching `.hand-card`'s flex-basis in App.css. */
const HAND_CARD_W = 118;
/**
 * How wide the fan is allowed to get.
 *
 * The command bar is `[hero plate] [hand] [mana tray]`, and both side columns
 * carry a 250px minimum — so a fan wider than the space between them stops being
 * centred and slides over the plate and the tray. 820px is the cap on a wide
 * window; on a narrower one the fan gets the window width less the two side
 * columns, their gaps and the frame padding, which is what `HAND_SIDE_RESERVE`
 * adds up to.
 */
const HAND_MAX_W = 820;
const HAND_SIDE_RESERVE = 580;

/**
 * How far a hand card's left edge is pulled over its neighbour, as CSS.
 *
 * The overlap is COMPUTED so the fan always fits its column. It used to be three
 * hand-picked numbers, and hand-picked numbers only work for the hand sizes
 * somebody happened to look at: at ten cards the fan ran 910px wide and slid over
 * the health plate on one side and the mana tray on the other. The width is a
 * CSS `min()` of the cap and the viewport, so the same formula holds at 1920 and
 * at 1024 without a resize listener. Cards never overlap more than they must.
 */
function handOverlap(count: number): string {
  const fanWidth = `min(${HAND_MAX_W}px, 100vw - ${HAND_SIDE_RESERVE}px)`;
  return `calc(min(${HAND_CARD_W - 10}px, (${fanWidth} - ${HAND_CARD_W}px) / ${count - 1}) - ${HAND_CARD_W}px)`;
}

export function HandFan({
  game,
  library,
  viewerId,
  playable,
  selectedIndex,
  draggingIndex,
  onCardClick,
  onCardPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onCardRest,
  onLeave,
}: {
  game: GameState;
  library: CardLibrary;
  viewerId: PlayerId;
  /** Whether the card at this hand index has a legal play right now. */
  playable: (handIndex: number) => boolean;
  selectedIndex: number | null;
  draggingIndex: number | null;
  onCardClick: (handIndex: number) => void;
  onCardPointerDown: (event: PointerEvent<HTMLElement>, handIndex: number, playable: boolean) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
  /** The pointer has come to rest on a card; arms its keyword panel. */
  onCardRest: (card: PlayableCard | undefined, el: HTMLElement) => void;
  onLeave: () => void;
}) {
  /** The pointer is somewhere over the hand, so the whole fan is enlarged. */
  const [hovered, setHovered] = useState(false);
  const viewer = game.players[viewerId];
  const count = viewer.hand.length;
  const mid = (count - 1) / 2;
  const spread = count > 7 ? 2.6 : count > 4 ? 3.6 : 5;
  const lift = count > 7 ? 5 : 7;
  return (
    /* Hovering ANY card lifts and enlarges the WHOLE hand (owner's ruling,
       2 September 2026). The old behaviour opened a separate full-size copy of
       one card beside the fan, which covered the board you were about to play it
       onto and left the fan itself the same unreadable size it had always been.
       Board minions keep their preview panel: there is no room to enlarge a
       board in place. */
    <div
      className={hovered ? "hand-fan is-open" : "hand-fan"}
      aria-label={`${viewer.name}'s hand`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        onLeave();
      }}
    >
      {viewer.hand.map((cardId, handIndex) => {
        const card = library[cardId];
        const canPlay = playable(handIndex);
        const cost = card ? effectiveCardCost(game, viewerId, card) : undefined;
        const style = {
          "--rot": `${(handIndex - mid) * spread}deg`,
          // THE ARC LIFTS THE MIDDLE, it does not drop the edges. Pushing the
          // outermost cards down sent them past the bottom of the window, where
          // the health gem was cut off; hung the other way up, the outermost card
          // sits on the baseline and nothing can go below the fan's own edge.
          "--ty": `${(Math.abs(handIndex - mid) - mid) * lift}px`,
          "--intro-index": `${handIndex}`,
          zIndex: handIndex + 1,
          marginLeft: handIndex === 0 ? 0 : handOverlap(count),
        } as CSSProperties;
        const classes = [
          "hand-card",
          selectedIndex === handIndex ? "selected" : "",
          canPlay ? "playable" : "unplayable",
          draggingIndex === handIndex ? "dragging" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div className="hand-item" key={`${cardId}-${handIndex}`}>
            <button
              type="button"
              className={classes}
              style={style}
              onClick={() => onCardClick(handIndex)}
              onPointerDown={(event) => onCardPointerDown(event, handIndex, canPlay)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              /* No per-card preview panel; the fan itself is what grows. What a
                 single card still gets, after two seconds, is its keywords
                 explained in a small panel off its top-right corner. */
              onMouseEnter={(event) => onCardRest(card, event.currentTarget)}
              onMouseLeave={onLeave}
              data-playable={canPlay}
              aria-label={card ? `${card.name}, ${cost} mana${canPlay ? ", playable" : ""}` : undefined}
              /* No `title` here. A native tooltip on a card you are holding
                 covers the neighbouring card a second after the pointer lands,
                 and it explains a control the player has already used by the
                 time they can read it. Owner ruling. */
            >
              {card ? <CardFace card={playableFace(card, cost)} /> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ManaTray({
  mana,
  maxMana,
  infinite,
  manaFx,
  introReveal,
}: {
  mana: number;
  maxMana: number;
  infinite: boolean;
  manaFx: ManaFx;
  /** The opening ceremony is revealing the crystals one by one. */
  introReveal: boolean;
}) {
  return (
    <div className="mana-tray" title={infinite ? "Infinite mana" : `${mana}/${maxMana} mana`}>
      {infinite ? (
        <em className="mana-inf">∞</em>
      ) : (
        <>
          <strong>{mana}/{maxMana}</strong>
          <div className="mana-row">
            {Array.from({ length: maxMana }, (_, i) => {
              // A crystal that just went out, or just came back. `--mi` is its
              // position within the changed run, which is what makes the group
              // drain one after another instead of all at once.
              const spent = manaFx?.kind === "spend" && i >= manaFx.to && i < manaFx.from;
              const refill = manaFx?.kind === "refill" && i >= manaFx.from && i < manaFx.to;
              const classes = ["mana-pip", i < mana ? "full" : "", spent ? "spent" : "", refill ? "refill" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <span
                  key={`${manaFx?.id ?? 0}-${i}`}
                  className={classes}
                  style={
                    {
                      ...(spent ? { "--mi": manaFx.from - 1 - i } : {}),
                      ...(refill ? { "--mi": i - manaFx.from } : {}),
                      ...(introReveal ? { "--intro-mana-index": i } : {}),
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
