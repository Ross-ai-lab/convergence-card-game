/** Duel overlays and side panels: prompts, opening-hand and draw choices, hover card, log and tutorial coach. */
import { memo, useState } from "react";
import { sfx } from "../audio/sfx";
import type { CardLibrary } from "../engine/game";
import type { GameAction, GameEvent, GameState, PendingTarget } from "../engine/types";
import { plainKeywordText, type KeywordEntry } from "../keywords";
import type { CardFaceModel } from "../card-presentation";
import { CardFace, playableFace } from "../card-face";
import { TUTORIAL_LESSONS } from "../tutorial";

export type HoverState = {
  face: CardFaceModel;
  effect: string;
  flavor: string;
  atkClass: string;
  hpClass: string;
  states: string[];
  onBoard: boolean;
  extraEffects: string[];
  keywordEntries: KeywordEntry[];
  rect: { left: number; right: number; top: number; bottom: number };
} | null;

/**
 * The banner that hangs over the board while a targeted effect waits. It is a
 * strip rather than a modal on purpose: you pick the victim by clicking it on
 * the real board, so covering the board would defeat the whole feature.
 */
export function TargetPrompt({
  pending,
  library,
  botControlled,
  onChoose,
  onCancel,
}: {
  pending: PendingTarget;
  library: CardLibrary;
  botControlled: boolean;
  onChoose: (choiceIndex: number) => void;
  onCancel: () => void;
}) {
  const card = library[pending.sourceCardId];
  const canCancel = Boolean((pending.cancelPlay || pending.cancelHeroPower) && !botControlled);
  const hasCardChoices = pending.kind === 'option' && pending.labelOptions.some(option => Boolean(library[option.value]));
  const cancelLabel = pending.cancelHeroPower ? "Cancel Hero Power" : "Return to hand";
  const hint = botControlled
    ? "The practice bot is choosing…"
    : pending.kind === "board" || pending.kind === "slot" || pending.kind === "boardOrCore"
      ? canCancel
        ? pending.cancelHeroPower
          ? "Click a highlighted minion — or click the board/hand to cancel this Hero Power."
          : "Click a highlighted minion — or click the board/hand to return this minion."
        : `Click a highlighted minion — ${pending.options.length} legal targets.`
      : pending.kind === "hand"
        ? "Their hand, face up. Pick one."
        : "Pick a value.";
  return (
    <div
      className={[
        "target-prompt",
        pending.kind === "board" && !canCancel ? "" : "interactive",
        hasCardChoices ? "card-choice-prompt" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="target-prompt-head">
        {card ? <img className="target-prompt-art" src={card.art} alt="" draggable={false} /> : null}
        <div className="target-prompt-text">
          <strong>{pending.sourceName}</strong>
          <span>{pending.prompt}</span>
          <small>{hint}</small>
        </div>
      </div>

      {canCancel ? (
        <button type="button" className="prompt-cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
      ) : null}

      {/* Hand targeting reveals the hand it is reaching into — that reveal IS
          the effect, so there is nothing to hide from the other player. */}
      {pending.kind === "hand" ? (
        <div className="prompt-hand">
          {pending.handOptions.map((option, choiceIndex) => (
            <button
              type="button"
              key={`${option.cardId}-${option.index}`}
              className="prompt-hand-card"
              disabled={botControlled}
              onClick={() => onChoose(choiceIndex)}
              title={library[option.cardId]?.name}
            >
              {library[option.cardId] ? <CardFace card={playableFace(library[option.cardId])} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {pending.kind === "boardOrCore" && pending.coreOption ? (
        <div className="prompt-values">
          <button
            type="button"
            className="prompt-value prompt-core-choice"
            disabled={botControlled}
            onClick={() => onChoose(pending.options.length)}
          >
            Enemy Core
          </button>
        </div>
      ) : null}

      {pending.kind === "option" ? (
        <div className="prompt-values">
          {pending.labelOptions.map((option, choiceIndex) => (
            <button
              type="button"
              key={option.value}
              className={library[option.value] ? "prompt-value prompt-card-choice" : "prompt-value"}
              disabled={botControlled}
              onClick={() => onChoose(choiceIndex)}
              title={library[option.value] ? `${option.label}: ${library[option.value].effect}` : option.label}
              aria-label={library[option.value] ? `${option.label}. ${library[option.value].effect}` : option.label}
            >
              {library[option.value] ? <CardFace card={playableFace(library[option.value])} /> : option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The duel log, newest first.
 *
 * It prints EVERYTHING it is handed. It used to print the last 30 of the 80
 * events being kept, which meant one busy turn — a board wipe, a chain of
 * Deathrattles — could push the move that caused it off the top of a list the
 * player was scrolling precisely to find that move in. A log that silently
 * drops the middle of a story is worse than a shorter one, because nothing
 * marks the gap.
 *
 * Memoised, because it is a few hundred list items rendered inside a
 * `<details>` whose children React builds whether or not the drawer is open,
 * and the events array only changes when something actually happened.
 */
export const EventLog = memo(function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <ol className="event-log">
      {events
        .map((event, index) => ({ event, index }))
        .reverse()
        .map(({ event, index }) => (
          // Keyed on the FORWARD index, so an entry keeps its key as newer
          // events arrive. Keying on the reversed position renumbered every row
          // in the list on every single action.
          <li key={`${index}-${event.text}`} className={`event-${event.kind}`}>
            {event.text}
          </li>
        ))}
    </ol>
  );
});

export function HoverCard({ hover }: { hover: NonNullable<HoverState> }) {
  // Bigger than it used to be, and no text panel underneath: the face prints its
  // own effect and flavour now, so this IS the readable copy of the card.
  const width = 300;
  const height = hover.extraEffects.length ? 492 : 440;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = hover.rect.right + 14;
  if (left + width > viewportW - 10) left = hover.rect.left - width - 14;
  if (left < 10) left = 10;
  let top = (hover.rect.top + hover.rect.bottom) / 2 - height / 2;
  top = Math.max(10, Math.min(top, viewportH - height - 10));
  const keywordWidth = 264;
  const keywordLeft = Math.min(left + width + 12, viewportW - keywordWidth - 10);
  const keywordOffset = keywordLeft - left;
  return (
    <aside className="hover-preview" style={{ left, top, width }} aria-hidden="true">
      <CardFace
        card={hover.face}
        atkClass={hover.atkClass}
        hpClass={hover.hpClass}
        effect={hover.effect}
        flavor={hover.flavor}
        states={hover.states}
        onBoard={hover.onBoard}
      />
      {hover.extraEffects.length ? <span className="hover-extra-effect">{hover.extraEffects.join(" • ")}</span> : null}
      {hover.keywordEntries.length ? (
        <div className="hover-keyword-definitions" style={{ left: keywordOffset, top: 0, width: keywordWidth }} aria-label="Keyword explanations">
          <span className="hover-keyword-heading">Keyword explanations</span>
          {hover.keywordEntries.map((entry) => (
            <span key={entry.term} className="hover-keyword-definition">
              <strong>{entry.term}</strong>
              <span>{plainKeywordText(entry.text)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export function MulliganOverlay({
  game,
  library,
  onChoose,
  locked = false,
}: {
  game: GameState;
  library: CardLibrary;
  onChoose: (action: GameAction) => void;
  locked?: boolean;
}) {
  const mulligan = game.mulligan;
  if (!mulligan) return null;
  const selectedCount = mulligan.selected.filter(Boolean).length;
  return (
    <div className="overlay">
      <section className={locked ? "draw-panel mulligan-panel locked" : "draw-panel mulligan-panel"}>
        <h2>{locked ? "Waiting for the opening hand…" : "Choose cards to replace"}</h2>
        <div className="mulligan-row">
          {game.players[mulligan.player].hand.map((cardId, handIndex) => {
            const selected = Boolean(mulligan.selected[handIndex]);
            const card = library[cardId];
            return (
              <button
                type="button"
                key={`${cardId}-${handIndex}`}
                className={selected ? "mulligan-card selected" : "mulligan-card"}
                aria-pressed={selected}
                disabled={locked}
                onClick={() => {
                  sfx.play("button");
                  onChoose({ type: "toggle_mulligan", player: mulligan.player, handIndex });
                }}
              >
                {card ? <CardFace card={playableFace(card)} /> : null}
              </button>
            );
          })}
        </div>
        <div className="choice-detail">
          <button
            type="button"
            className="primary"
            disabled={locked}
            onClick={() => {
              sfx.play("draw");
              onChoose({ type: "confirm_mulligan", player: mulligan.player });
            }}
          >
            {selectedCount ? "Mulligan selected" : "Keep opening hand"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function DrawChoiceOverlay({
  game,
  library,
  onChoose,
  locked = false,
}: {
  game: GameState;
  library: CardLibrary;
  onChoose: (action: GameAction) => void;
  /** True while the practice bot owns this draw — the human must not pick for it. */
  locked?: boolean;
}) {
  const drawChoice = game.drawChoice;
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  if (!drawChoice) return null;
  return (
    <div className="overlay">
      <section className={locked ? "draw-panel locked" : "draw-panel"}>
        <span>Draw Step</span>
        <h2>
          {locked
            ? `${game.players[drawChoice.player].name} is choosing…`
            : `${game.players[drawChoice.player].name}, inspect and choose`}
        </h2>
        <div className="choice-row">
          {drawChoice.cards.map((cardId, choiceIndex) => (
            <button
              type="button"
              key={cardId}
              className={selectedChoice === choiceIndex ? "choice-card selected" : "choice-card"}
              aria-pressed={selectedChoice === choiceIndex}
              disabled={locked}
              onClick={() => {
                if (selectedChoice === choiceIndex) {
                  sfx.play("draw");
                  onChoose({ type: "choose_draw", player: drawChoice.player, choiceIndex });
                } else {
                  sfx.play("button");
                  setSelectedChoice(choiceIndex);
                }
              }}
            >
              {library[cardId] ? <CardFace card={playableFace(library[cardId])} /> : null}
            </button>
          ))}
        </div>
        <div className="choice-detail">
          <button
            type="button"
            className="primary"
            disabled={locked || selectedChoice === null}
            onClick={() => {
              if (selectedChoice === null) return;
              sfx.play("draw");
              onChoose({ type: "choose_draw", player: drawChoice.player, choiceIndex: selectedChoice });
            }}
          >
            {locked ? "Bot is choosing" : selectedChoice === null ? "Pick a card" : "Choose Card"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function TutorialCoach({step,completed,onSkip,onStart}:{step:number;completed:boolean;onSkip:()=>void;onStart:()=>void}) {
  const lesson=TUTORIAL_LESSONS[Math.min(step,TUTORIAL_LESSONS.length-1)];
  return <aside className={`tutorial-coach${step===0?' is-welcome':''}`} aria-label="Tutorial">
    <div className="tutorial-coach-top"><span>Rick's field guide</span><small>{completed?'Complete':`${step+1} / ${TUTORIAL_LESSONS.length}`}</small></div>
    <strong>{completed?'Ready for the Convergence':lesson.title}</strong>
    <p>{completed?'Training complete. Returning to the menu…':lesson.body}</p>
    <small className="tutorial-coach-hint">{completed?'Choose any universe when you are ready.':lesson.hint}</small>
    {step===0&&!completed&&<button type="button" className="primary" onClick={onStart}>Start lesson</button>}
    <button type="button" onClick={onSkip}>Leave tutorial</button>
  </aside>;
}
