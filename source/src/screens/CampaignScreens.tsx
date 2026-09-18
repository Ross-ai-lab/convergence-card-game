import { cards, relics } from "../data/cards";
import { CAMPAIGN_CHAPTERS } from "../campaign";
import { canPlayChapter, campaignComplete, type Progress } from "../progress";
import { validateDeck } from "../decks";
import "./CampaignScreens.css";

const roster = [...cards, ...relics];
const rosterIds = roster.map(({ id }) => id);
const cardById = new Map(roster.map((card) => [card.id, card]));

export function CampaignScreen({ progress, onPlay, onClose }: {
  progress: Progress; onPlay: (chapter: number) => void; onClose: () => void;
}) {
  const valid = validateDeck(progress.playerDeck, rosterIds, progress.unlockedIds).valid;
  return <div className="campaign-overlay campaign-map" role="dialog" aria-modal="true" aria-label="Rick Gramps Collection">
    <section className="campaign-panel campaign-chapter-panel">
      <header className="campaign-header"><img className="campaign-collector" src={`${import.meta.env.BASE_URL}campaign/rick-gramps.webp`} alt="Rick Gramps" /><div><h2>Rick Gramps Collection</h2>
        </div>
        <button className="campaign-close" onClick={onClose} aria-label="Close Rick Gramps Collection">×</button></header>
      <div className="campaign-toolbar"><p>{campaignComplete(progress) ? "Every universe is conquered. Free duels are available on the title screen." : "Choose any universe. Conquer its champion to claim that universe's cards."}</p></div>
      {!valid && <p className="campaign-warning" role="status">Your deck has {progress.playerDeck.length} cards. Choose exactly 30 before starting a duel.</p>}
      <div className="campaign-chapters">{CAMPAIGN_CHAPTERS.map((chapter) => {
        const boss = cardById.get(chapter.bossId)!; const cleared = progress.completedBosses.includes(chapter.chapter);
        const available = canPlayChapter(progress, chapter.chapter);
        return <article key={chapter.chapter} className={`campaign-chapter${cleared ? " cleared" : ""}${available ? "" : " locked"}`} data-chapter={chapter.chapter}>
          <img src={boss.art} alt={boss.name} loading="eager" />
          <span className="campaign-eyebrow">Universe · {chapter.universe}</span><h3>{boss.name}</h3>
          {!cleared ? <p className="chapter-reward-preview">{chapter.rewardCardIds.length} cards in this universe</p> : null}
          {cleared ? <details open><summary>Rewards unlocked</summary>
            <p>{chapter.rewardCardIds.map((id) => cardById.get(id)?.name ?? id).join(" · ")}</p></details> : null}
          <button className="primary" disabled={!available || !valid} onClick={() => onPlay(chapter.chapter)}>
            {!available ? "Unavailable" : cleared ? "Universe Conquered" : "Conquer the Universe"}</button>
        </article>;
      })}</div>
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
