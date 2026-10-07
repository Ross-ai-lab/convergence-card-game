import { duelMvp, type CardLibrary } from "../engine/game";
import type { DamageTallyEntry, GameState, PlayerId } from "../engine/types";
import { CardFace, playableFace } from "../card-face";

export function GameOver({
  game,
  library,
  tutorial = false,
  campaign = false,
  campaignLoss = false,
  onRestart,
  onMenu,
}: {
  game: GameState;
  /** So the MVP can be drawn as its real card face rather than as a thumbnail. */
  library: CardLibrary;
  tutorial?: boolean;
  campaign?: boolean;
  campaignLoss?: boolean;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const draw = game.winner === "draw";
  const winnerId: PlayerId | null = typeof game.winner === "number" ? game.winner : null;
  const winner = winnerId !== null ? game.players[winnerId] : null;
  const title = draw ? "Mutual Annihilation" : winner ? `${winner.name} Wins` : "Game Over";
  /**
   * The one card this screen is about: whichever of the winner's minions dealt
   * the most damage over the whole duel.
   *
   * It replaced the parade of survivors, and the reason is that surviving is
   * the wrong measure. A board is what happens to be left standing at the end,
   * so the parade was routinely five bodies that had done nothing and none of
   * the ones that won the duel — a Mythic that traded for three minions and
   * died in the process never appeared on its own victory screen. Damage is
   * what a duel is actually decided by, and it is the only figure here that
   * names a card rather than a number.
   *
   * A draw has no winner to ask, so it asks the whole table.
   */
  const mvp =
    winnerId !== null
      ? duelMvp(game, winnerId)
      : (() => {
          const both = ([0, 1] as PlayerId[]).map((id) => duelMvp(game, id));
          return both.reduce<DamageTallyEntry | null>(
            (best, entry) => (entry && (!best || entry.damage > best.damage) ? entry : best),
            null,
          );
        })();
  const mvpCard = mvp ? library[mvp.cardId] : undefined;
  const mvpOwner = mvp ? game.players[mvp.owner] : null;
  /*
   * TWO THINGS WERE REMOVED FROM THIS SCREEN on 3 September 2026, owner's
   * ruling, and both for the same reason: the screen was saying a thing twice.
   *
   * The wide champion strip was the MVP's own artwork, bled across the top —
   * the same picture as the card face directly beneath it, at lower resolution
   * and with nothing on it. It was already being dropped under 720px of height
   * as the first thing to go; it is now gone at every height.
   *
   * The line under the title — "The rift stabilizes after N turns", plus
   * whichever sentence about the practice bot applied — was the only prose on a
   * screen whose whole job is to name a winner and a card.
   */
  return (
    <div className={draw ? "overlay result-overlay draw" : "overlay result-overlay"}>
      {/* The rays turn inside a CLIPPING FRAME. A rotating square has to be
          about 1.8x the viewport or its corners sweep into view, and a box that
          big — by inset or by transform, both count — is scrollable overflow the
          overlay then reports forever. The frame is exactly viewport-sized and
          clips, so the overlay measures what it can actually show. */}
      <div className="result-rays-frame" aria-hidden="true">
        <div className="result-rays" />
      </div>
      <section className="result-panel grand">
        <h2 className="result-title">{title}</h2>
        {mvp ? (
          <div className="result-mvp">
            <span className="result-mvp-kicker">
              {mvpOwner ? `${mvpOwner.name}'s champion` : "Champion of the duel"}
            </span>
            {/* The complete printed champion card. */}
            <div className="result-mvp-card">
              {mvpCard ? (
                <CardFace card={playableFace(mvpCard)} />
              ) : (
                <figure className="result-mvp-fallback">
                  <img src={mvp.art} alt="" draggable={false} />
                  <figcaption>{mvp.name}</figcaption>
                </figure>
              )}
            </div>
            <p className="result-mvp-line">
              <strong>{mvp.damage}</strong> damage dealt
            </p>
          </div>
        ) : null}
        <div className="gameover-buttons">
          {campaignLoss ? (
            <><button type="button" className="primary" onClick={onRestart}>Rematch</button><button type="button" onClick={onMenu}>Return to menu</button></>
          ) : winnerId !== null && !tutorial ? (
            <button type="button" className="primary" onClick={campaign ? onRestart : onMenu}>Continue</button>
          ) : (
            <><button type="button" className="primary" onClick={onRestart}>{tutorial ? "Play tutorial again" : "Rematch"}</button><button type="button" onClick={onMenu}>Menu</button></>
          )}
        </div>
      </section>
    </div>
  );
}
