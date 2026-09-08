import { useMemo, useState } from "react";
import { cards, relics } from "../data/cards";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STARTER_DECK } from "../campaign";
import { canPlayChapter, campaignComplete, type Progress } from "../progress";
import { validateDeck } from "../decks";
import { isMinionCard, rarityName } from "../engine/types";
import "./CampaignScreens.css";

const roster = [...cards, ...relics];
const rosterIds = roster.map(({ id }) => id);
const cardById = new Map(roster.map((card) => [card.id, card]));

export function CampaignScreen({ progress, onPlay, onClose }: {
  progress: Progress; onPlay: (chapter: number) => void; onClose: () => void;
}) {
  const valid = validateDeck(progress.playerDeck, rosterIds, progress.unlockedIds).valid;
  return <div className="campaign-overlay" role="dialog" aria-modal="true" aria-label="Campaign">
    <section className="campaign-panel campaign-chapter-panel">
      <header className="campaign-header"><div><h2>Campaign</h2>
        </div>
        <button className="campaign-close" onClick={onClose} aria-label="Close campaign">×</button></header>
      <div className="campaign-toolbar"><p>{campaignComplete(progress) ? "Campaign complete. Free duels are available on the title screen." : "Defeat each challenger to claim their universe and advance."}</p></div>
      {!valid && <p className="campaign-warning" role="status">Your deck has {progress.playerDeck.length} cards. Choose exactly 30 before starting a duel.</p>}
      <div className="campaign-chapters">{CAMPAIGN_CHAPTERS.map((chapter) => {
        const boss = cardById.get(chapter.bossId)!; const cleared = chapter.chapter <= progress.completedChapters;
        const available = canPlayChapter(progress, chapter.chapter);
        return <article key={chapter.chapter} className={`campaign-chapter${cleared ? " cleared" : ""}${available ? "" : " locked"}`} data-chapter={chapter.chapter}>
          <img src={boss.art} alt={boss.name} loading="eager" />
          <span className="campaign-eyebrow">Chapter {chapter.chapter} · {chapter.universe}</span><h3>{boss.name}</h3>
          {cleared ? <details open><summary>Rewards unlocked</summary>
            <p>{chapter.rewardCardIds.map((id) => cardById.get(id)?.name ?? id).join(" · ")}</p></details> : null}
          <button className="primary" disabled={!available || !valid} onClick={() => onPlay(chapter.chapter)}>
            {!available ? "Locked" : cleared ? "Replay · no rewards" : `Play chapter ${chapter.chapter}`}</button>
        </article>;
      })}</div>
    </section>
  </div>;
}

export function DeckBuilder({ progress, seat = 0, onChange, onClose }: {
  progress: Progress; seat?: 0 | 1; onChange: (ids: string[]) => void; onClose: () => void;
}) {
  const deck = seat === 0 ? progress.playerDeck : progress.hotseatDeck;
  const readOnly = !progress.completedChapters && !progress.developerCheat;
  const [search, setSearch] = useState(""); const [camp, setCamp] = useState("");
  const [alignment, setAlignment] = useState(""); const [cost, setCost] = useState("");
  const [kind, setKind] = useState(""); const [selectedOnly, setSelectedOnly] = useState(false);
  const selected = new Set(deck); const unlocked = new Set(progress.unlockedIds);
  const shown = roster.filter((card) => unlocked.has(card.id) && (!selectedOnly || selected.has(card.id)) &&
    (!search || `${card.name} ${card.origin} ${card.effect}`.toLowerCase().includes(search.toLowerCase())) &&
    (!cost || card.cost === Number(cost)) && (!kind || card.kind === kind) &&
    (!camp || (isMinionCard(card) && (card.camp === camp || card.camp === "ALL"))) &&
    (!alignment || (isMinionCard(card) && card.alignment === alignment)))
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name));
  const curve = useMemo(() => Array.from({ length: 10 }, (_, i) => deck.filter((id) => cardById.get(id)?.cost === i + 1).length), [deck]);
  return <div className="campaign-overlay" role="dialog" aria-modal="true" aria-label={`Player ${seat + 1} deck builder`}>
    <section className="campaign-panel deck-builder">
      <header className="campaign-header"><div><span className="campaign-eyebrow">YOUR COLLECTION</span><h2>{readOnly ? "Starter deck" : `Player ${seat + 1} deck`}</h2>
        <p aria-live="polite">{deck.length} / 30 cards · {progress.unlockedIds.length} unlocked</p></div><button onClick={onClose}>Done</button></header>
      <p className="deck-instructions">{readOnly ? "Win chapter one to earn cards you can swap into this deck." : "Remove a selected card, then choose its replacement. Changes save automatically; a duel requires exactly 30 cards."}</p>
      <div className="deck-curve" aria-label="Deck mana curve">{curve.map((count, i) => <div key={i}>
        <span style={{ height: `${Math.max(3, count / Math.max(3, ...curve) * 54)}px` }}>{count}</span><small>{i + 1}</small></div>)}</div>
      <div className="deck-filters">
        <input aria-label="Search unlocked cards" placeholder="Search cards or effects" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by mana" value={cost} onChange={(e) => setCost(e.target.value)}><option value="">All mana</option>{curve.map((_, i) => <option key={i} value={i + 1}>{i + 1} mana</option>)}</select>
        <select aria-label="Filter by camp" value={camp} onChange={(e) => setCamp(e.target.value)}><option value="">All camps</option>{["Tech", "Nature", "Magic"].map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Filter by alignment" value={alignment} onChange={(e) => setAlignment(e.target.value)}><option value="">All alignments</option>{["Good", "Evil", "Neutral"].map((a) => <option key={a}>{a}</option>)}</select>
        <select aria-label="Filter by card type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option><option value="minion">Minions</option><option value="relic">Relics</option></select>
        <label><input type="checkbox" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />Selected only</label>
        {!readOnly && <button onClick={() => onChange([...CAMPAIGN_STARTER_DECK])}>Restore starter</button>}
      </div>
      <p className="deck-result-count">{shown.length} cards shown</p>
      <div className="deck-cards">{shown.map((card) => <article className={`deck-card${selected.has(card.id) ? " selected" : ""}`} key={card.id} data-card-id={card.id}>
        <img src={card.art} alt="" loading="lazy" /><div><span className="campaign-eyebrow">{card.cost} mana · {isMinionCard(card) ? `${card.camp} · ${card.alignment}` : "Relic"}</span>
          <h3>{card.name}</h3>{isMinionCard(card) && <span className="deck-combat-stats">{card.atk} ATK · {card.hp} HP · {rarityName(card.rarity)}</span>}<p>{card.effect}</p></div>
        <button disabled={readOnly || (!selected.has(card.id) && deck.length >= 30)} aria-pressed={selected.has(card.id)}
          aria-label={`${selected.has(card.id) ? "Remove" : "Add"} ${card.name}`} onClick={() => onChange(selected.has(card.id) ? deck.filter((id) => id !== card.id) : [...deck, card.id])}>
          {selected.has(card.id) ? (readOnly ? "In starter" : "Remove") : "Add"}</button>
      </article>)}</div>
      {!shown.length && <p className="campaign-warning">No unlocked cards match these filters.</p>}
    </section>
  </div>;
}

export function HotseatSetup({ progress, onEdit, onStart, onClose }: {
  progress: Progress; onEdit: (seat: 0 | 1) => void; onStart: () => void; onClose: () => void;
}) {
  const valid = [progress.playerDeck, progress.hotseatDeck].every((deck) => validateDeck(deck, rosterIds, progress.unlockedIds).valid);
  return <div className="campaign-overlay" role="dialog" aria-modal="true" aria-label="Two-player decks"><section className="campaign-panel hotseat-decks">
    <header className="campaign-header"><h2>Two players, two decks</h2><button onClick={onClose}>Close</button></header>
    <p>Each player uses a separate 30-card deck. Both decks can use the same unlocked cards. Hands stay private between turns.</p>
    <div className="campaign-toolbar"><button onClick={() => onEdit(0)}>Player One · {progress.playerDeck.length}/30</button>
      <button onClick={() => onEdit(1)}>Player Two · {progress.hotseatDeck.length}/30</button></div>
    {!valid && <p className="campaign-warning">Both players need exactly 30 cards before starting.</p>}
    <button className="primary" disabled={!valid} onClick={onStart}>Start two-player duel</button>
  </section></div>;
}
