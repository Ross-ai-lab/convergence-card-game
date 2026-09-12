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
  return <div className="campaign-overlay" role="dialog" aria-modal="true" aria-label="Campaign">
    <section className="campaign-panel campaign-chapter-panel">
      <header className="campaign-header"><div><span className="campaign-eyebrow">RICK GRAMPS' COLLECTION</span><h2>Campaign</h2>
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
