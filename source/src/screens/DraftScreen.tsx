import { useMemo, useState } from "react";
import { Lightning } from "@phosphor-icons/react";
import { CardFace, playableFace } from "../card-face";
import { sfx } from "../audio/sfx";
import { heroPowerDefinition } from "../engine/hero-powers";
import { rarityName, type HeroPowerId } from "../engine/types";
import type { CardLibrary } from "../engine/game";
import {
  chooseDraftHeroPower, draftCard, draftDuelIndex, draftRivalDeck, draftShowcase, type DraftDuelRecord, draftDifficultyTitle, draftOffer, draftReady, pickDraftCard, retireDraftRun,
  draftCost, tierOf, updateDraftRun, DRAFT_LOSS_LIMIT, DRAFT_PICKS, DRAFT_WIN_GOAL, type DraftSave, type DraftTier,
} from "../draft";
import "./DraftScreen.css";

const TIER_LABEL: Record<DraftTier, string> = {
  Black: rarityName("Black"), Purple: rarityName("Purple"), Yellow: rarityName("Yellow"), Red: rarityName("Red"), Relic: "Relic",
};
const PICK_SOUND = { Black: "summonRare", Purple: "summonEpic", Yellow: "summonLegendary", Red: "summonMythic", Relic: "relicEquip" } as const;

/**
 * The Arena's whole front end: the rules, the Hero Power choice, the thirty
 * picks, the run between duels and its end. One screen with phases rather than
 * four overlays, because every phase shows the same growing deck beside it.
 */
export function DraftScreen({ save, library, liveDuel, onChange, onStartRun, onDuel, onResume, onClose }: {
  save: DraftSave;
  /** Resolves a duel's deciding card, which can be a token as well as a pool card. */
  library: CardLibrary;
  /** A saved, unfinished duel of this run that "Continue" can pick up. */
  liveDuel: boolean;
  onChange: (next: DraftSave) => void;
  onStartRun: () => void;
  onDuel: () => void;
  onResume: () => void;
  onClose: () => void;
}) {
  const run = save.run;
  const record = save.record;
  return (
    <div className="draft-overlay" role="dialog" aria-modal="true" aria-label="Arena">
      <section className="draft-panel">
        <header className="draft-header">
          <div className="draft-title">
            <span className="draft-sigil" aria-hidden="true"><DraftSigil /></span>
            <div>
              <h2>Arena</h2>
              <p className="draft-record">
                {record.runs ? `Best run ${record.bestWins} wins · ${record.runs} run${record.runs === 1 ? "" : "s"} · ${record.totalWins} total wins` : "Draft a deck. Win seven before you lose three."}
              </p>
            </div>
          </div>
          <button type="button" className="draft-close" onClick={() => { sfx.play("button"); onClose(); }} aria-label="Close Arena">×</button>
        </header>
        {!run || run.finished ? (
          <DraftIntro save={save} library={library} onStartRun={onStartRun} />
        ) : !run.heroPower ? (
          <PowerChoice choices={run.powerChoices} onChoose={(power) => { sfx.play("buff"); onChange(updateDraftRun(save, chooseDraftHeroPower(run, power))); }} />
        ) : draftReady(run) ? (
          <RunHub save={save} library={library} liveDuel={liveDuel} onDuel={onDuel} onResume={onResume} onRetire={() => onChange(retireDraftRun(save))} />
        ) : (
          <PickStage save={save} onChange={onChange} />
        )}
      </section>
    </div>
  );
}

function DraftSigil() {
  return (
    <svg viewBox="0 0 48 48">
      <rect x="9" y="7" width="20" height="28" rx="3" transform="rotate(-12 19 21)" />
      <rect x="19" y="9" width="20" height="28" rx="3" transform="rotate(10 29 23)" />
      <path d="M24 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" />
    </svg>
  );
}

function DraftIntro({ save, library, onStartRun }: { save: DraftSave; library: CardLibrary; onStartRun: () => void }) {
  const last = save.run?.finished ? save.run : null;
  // A new trio each time a run ends, so the screen does not wear one look forever.
  const showcase = useMemo(() => draftShowcase(`runs-${save.record.runs}`), [save.record.runs]);
  return (
    <div className="draft-intro">
      {last ? (
        <div className={last.wins >= DRAFT_WIN_GOAL ? "draft-summary perfect" : "draft-summary"}>
          <span className="draft-kicker">{last.wins >= DRAFT_WIN_GOAL ? "Perfect run" : "Run complete"}</span>
          <strong className="draft-summary-score">{last.wins} <small>wins</small></strong>
          <RecordPips wins={last.wins} losses={last.losses} />
          <p>{last.wins >= DRAFT_WIN_GOAL ? "Seven rivals fell to one drafted deck." : `${last.wins} win${last.wins === 1 ? "" : "s"} and ${last.losses} loss${last.losses === 1 ? "" : "es"} with this deck.`}</p>
          <DuelHistory history={last.history} library={library} />
          <DeckList picks={last.picks} heroPower={last.heroPower} compact />
        </div>
      ) : (
        <div className="draft-showcase" aria-hidden="true">
          {showcase.map((cardId) => {
            const card = draftCard(cardId);
            return card ? <div key={cardId} className="draft-showcase-card"><CardFace card={playableFace(card)} quiet /></div> : null;
          })}
        </div>
      )}
      <div className="draft-rules">
        <h3>How a draft works</h3>
        <ol>
          <li><b>Choose a Hero Power</b> from three.</li>
          <li><b>Pick thirty cards</b>, one from each offer of three. Any card in the game can appear, owned or not. Picks 1, 11 and 21 offer only Legendary or Mythic cards.</li>
          <li><b>Duel rival drafters</b> until you win {DRAFT_WIN_GOAL} or lose {DRAFT_LOSS_LIMIT}. Each rival drafts its own deck and gets tougher as you win. A draw is replayed.</li>
        </ol>
        <p className="draft-note">Drafts never award or remove collection cards.</p>
        <button type="button" className="draft-primary" onClick={() => { sfx.play("button"); onStartRun(); }}>
          {last ? "Draft a new deck" : "Start drafting"}
        </button>
      </div>
    </div>
  );
}

function PowerChoice({ choices, onChoose }: { choices: HeroPowerId[]; onChoose: (power: HeroPowerId) => void }) {
  return (
    <div className="draft-stage">
      <div className="draft-stage-head">
        <span className="draft-kicker">Before the first pick</span>
        <h3>Choose your Hero Power</h3>
      </div>
      <div className="draft-powers">
        {choices.map((power) => {
          const definition = heroPowerDefinition(power);
          if (!definition) return null;
          return (
            <button key={power} type="button" className="draft-power" onClick={() => onChoose(power)}>
              <strong><Lightning size={20} weight="fill" aria-hidden="true" /> {definition.name}</strong>
              <span>{definition.text}</span>
              <small>Costs 2 mana · once per turn</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PickStage({ save, onChange }: { save: DraftSave; onChange: (next: DraftSave) => void }) {
  const run = save.run!;
  const offer = draftOffer(run);
  if (!offer) return null;
  const pickNumber = offer.pick + 1;
  return (
    <div className="draft-board">
      <div className="draft-stage">
        <div className="draft-stage-head">
          <span className={offer.special ? "draft-kicker champion" : "draft-kicker"}>
            {offer.special ? "Champion pick · Legendary or Mythic" : `${TIER_LABEL[offer.tier]} pick`}
          </span>
          <h3>Pick {pickNumber} <small>of {DRAFT_PICKS}</small></h3>
          <div className="draft-progress" role="progressbar" aria-label="Draft progress" aria-valuemin={0} aria-valuemax={DRAFT_PICKS} aria-valuenow={run.picks.length}>
            <span style={{ width: `${(run.picks.length / DRAFT_PICKS) * 100}%` }} />
          </div>
        </div>
        <div className={`draft-offer tier-${offer.tier.toLowerCase()}`}>
          {offer.cardIds.map((cardId) => {
            const card = draftCard(cardId);
            if (!card) return null;
            return (
              <button
                key={`${offer.pick}-${cardId}`}
                type="button"
                className="draft-pick"
                aria-label={`Draft ${card.name}, ${draftCost(card)} mana`}
                onClick={() => {
                  sfx.play(PICK_SOUND[tierOf(card)]);
                  onChange(updateDraftRun(save, pickDraftCard(run, cardId)));
                }}
              >
                <CardFace card={playableFace(card)} />
              </button>
            );
          })}
        </div>
      </div>
      <DeckList picks={run.picks} heroPower={run.heroPower} />
    </div>
  );
}

function RunHub({ save, library, liveDuel, onDuel, onResume, onRetire }: { save: DraftSave; library: CardLibrary; liveDuel: boolean; onDuel: () => void; onResume: () => void; onRetire: () => void }) {
  const run = save.run!;
  const [confirmRetire, setConfirmRetire] = useState(false);
  // The same seeded rival the next duel will deal, so its power is known now.
  const rivalPower = useMemo(() => heroPowerDefinition(draftRivalDeck(run.id, draftDuelIndex(run)).heroPower), [run]);
  return (
    <div className="draft-board">
      <div className="draft-stage draft-hub">
        <div className="draft-stage-head">
          <span className="draft-kicker">Your run</span>
          <h3>{run.wins} <small>win{run.wins === 1 ? "" : "s"}</small> · {run.losses} <small>loss{run.losses === 1 ? "" : "es"}</small></h3>
        </div>
        <RecordPips wins={run.wins} losses={run.losses} />
        <div className="draft-rival">
          <span className="draft-kicker">Next rival · {draftDifficultyTitle(run.wins)}</span>
          {rivalPower ? (
            <p className="draft-rival-power">
              <strong><Lightning size={16} weight="fill" aria-hidden="true" /> {rivalPower.name}</strong>
              <span>{rivalPower.text}</span>
            </p>
          ) : null}
          {run.draws ? <small>{run.draws} draw{run.draws === 1 ? "" : "s"} replayed</small> : null}
        </div>
        {liveDuel ? (
          <button type="button" className="draft-primary" onClick={() => { sfx.play("button"); onResume(); }}>Resume your duel</button>
        ) : (
          <button type="button" className="draft-primary" onClick={() => { sfx.play("button"); onDuel(); }}>Duel the next rival</button>
        )}
        {run.activeDuel && !liveDuel ? <p className="draft-warning">Your last duel was left unfinished. It counts as a loss when the next one starts.</p> : null}
        <DuelHistory history={run.history} library={library} />
        {confirmRetire ? (
          <div className="draft-retire-confirm" role="group" aria-label="Retire this run?">
            <span>End the run now with {run.wins} win{run.wins === 1 ? "" : "s"}?</span>
            <button type="button" onClick={() => { sfx.play("button"); setConfirmRetire(false); }}>Keep playing</button>
            <button type="button" className="danger" onClick={() => { sfx.play("button"); onRetire(); }}>Retire run</button>
          </div>
        ) : (
          <button type="button" className="draft-secondary" onClick={() => { sfx.play("button"); setConfirmRetire(true); }}>Retire run</button>
        )}
      </div>
      <DeckList picks={run.picks} heroPower={run.heroPower} />
    </div>
  );
}

const OUTCOME_LABEL = { won: "Won", lost: "Lost", drawn: "Draw" } as const;

/** Each finished duel as the card that decided it: yours for a win, the rival's for a loss. */
function DuelHistory({ history, library }: { history: DraftDuelRecord[]; library: CardLibrary }) {
  if (!history.length) return null;
  return (
    <div className="draft-history-wrap">
    <span className="draft-kicker">Duels so far</span>
    <ol className="draft-history" aria-label="Duels so far">
      {history.map((entry, index) => {
        const card = entry.mvpCardId ? library[entry.mvpCardId] : undefined;
        return (
          <li key={index} className={`draft-history-duel ${entry.outcome}`}>
            <span className="draft-history-badge">{OUTCOME_LABEL[entry.outcome]}</span>
            {card ? <div className="draft-history-card"><CardFace card={playableFace(card)} quiet /></div> : <div className="draft-history-card empty" />}
            <small>{card ? (entry.outcome === "lost" ? `Beaten by ${card.name}` : card.name) : `Duel ${index + 1}`}</small>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

function RecordPips({ wins, losses }: { wins: number; losses: number }) {
  return (
    <div className="draft-pips" aria-label={`${wins} of ${DRAFT_WIN_GOAL} wins, ${losses} of ${DRAFT_LOSS_LIMIT} losses`}>
      <span className="draft-pip-row wins">
        {Array.from({ length: DRAFT_WIN_GOAL }, (_, index) => <i key={index} className={index < wins ? "on" : ""} />)}
      </span>
      <span className="draft-pip-row losses">
        {Array.from({ length: DRAFT_LOSS_LIMIT }, (_, index) => <i key={index} className={index < losses ? "on" : ""} />)}
      </span>
    </div>
  );
}

/** The deck so far: Hero Power, mana curve and every pick, cheapest first. */
function DeckList({ picks, heroPower, compact = false }: { picks: string[]; heroPower: HeroPowerId | null; compact?: boolean }) {
  const [preview, setPreview] = useState<{ id: string; top: number; left: number } | null>(null);
  const sorted = useMemo(
    () => picks.map((id) => draftCard(id)!).filter(Boolean).sort((a, b) => draftCost(a) - draftCost(b) || a.name.localeCompare(b.name)),
    [picks],
  );
  const curve = Array.from({ length: 7 }, (_, index) => sorted.filter((card) => (index === 6 ? draftCost(card) >= 7 : draftCost(card) === index + 1)).length);
  const peak = Math.max(4, ...curve);
  const power = heroPowerDefinition(heroPower);
  const previewCard = preview ? draftCard(preview.id) : undefined;
  return (
    <aside className={compact ? "draft-deck compact" : "draft-deck"} aria-label="Drafted deck">
      <header>
        <strong>Your deck</strong>
        <span>{picks.length} / {DRAFT_PICKS}</span>
      </header>
      {power ? <p className="draft-deck-power"><Lightning size={14} weight="fill" aria-hidden="true" /> {power.name}</p> : null}
      <div className="draft-curve" aria-label="Mana curve">
        {curve.map((amount, index) => (
          <span key={index} className="draft-curve-bar">
            <i style={{ height: `${(amount / peak) * 100}%` }} />
            <b>{amount || ""}</b>
            <small>{index === 6 ? "7+" : index + 1}</small>
          </span>
        ))}
      </div>
      <ol className="draft-deck-list">
        {sorted.map((card) => (
          <li
            key={card.id}
            className={`tier-${tierOf(card).toLowerCase()}`}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              const box = event.currentTarget.getBoundingClientRect();
              setPreview({ id: card.id, top: box.top + box.height / 2, left: box.left });
            }}
            onPointerLeave={() => setPreview(null)}
          >
            <span className="draft-row-cost">{draftCost(card)}</span>
            <span className="draft-row-name">{card.name}</span>
          </li>
        ))}
      </ol>
      {previewCard && preview ? (
        <div className="draft-row-preview" style={{ top: preview.top, left: preview.left }} aria-hidden="true">
          <CardFace card={playableFace(previewCard)} />
        </div>
      ) : null}
    </aside>
  );
}
