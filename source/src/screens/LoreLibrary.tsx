import { useEffect, useState, type CSSProperties } from 'react';
import { LORE_CHAPTERS, LORE_CHAPTER_VICTORIES, isLoreChapterUnlocked, type LoreChapter } from '../lore-chapters';
import { resolvePublicAssetUrl } from '../engine/asset-url';
import './LoreLibrary.css';

/**
 * A real book: a leather cover hinged on its spine, over a block of pages.
 * Hovering opens the cover and turns one leaf, and the first page glows.
 * Every moving part animates transform and opacity only.
 */
export function LoreBookButton({onOpen}:{onOpen:()=>void}) {
  return <button type="button" className="lore-book-button" aria-label="Lore" onClick={onOpen}>
    <span className="lb-stage" aria-hidden="true">
      <span className="lb-book">
        <span className="lb-back"/>
        <span className="lb-pages"/>
        <span className="lb-page"><span className="lb-glow"/><span className="lb-lines"/><span className="lb-sigil">◆</span></span>
        <span className="lb-leaf"/>
        <span className="lb-cover">
          <span className="lb-cover-front">
            <svg viewBox="0 0 80 106">
              <defs>
                <linearGradient id="lb-leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d3a63"/><stop offset=".55" stopColor="#47264d"/><stop offset="1" stopColor="#24162f"/></linearGradient>
                <radialGradient id="lb-sheen" cx=".3" cy=".25" r=".8"><stop offset="0" stopColor="#fff" stopOpacity=".16"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
                <linearGradient id="lb-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe6a6"/><stop offset=".5" stopColor="#d6aa55"/><stop offset="1" stopColor="#9b7334"/></linearGradient>
              </defs>
              <rect x="0" y="0" width="80" height="106" rx="3" fill="url(#lb-leather)"/>
              <rect x="0" y="0" width="80" height="106" rx="3" fill="url(#lb-sheen)"/>
              <rect x="6" y="6" width="68" height="94" rx="2" fill="none" stroke="url(#lb-gold)" strokeWidth="1.6"/>
              <rect x="9.5" y="9.5" width="61" height="87" rx="1.5" fill="none" stroke="#d6aa55" strokeWidth=".6" opacity=".7"/>
              {[[6,6],[74,6],[6,100],[74,100]].map(([x,y])=><path key={`${x}-${y}`} d={`M${x} ${y-5}L${x+5} ${y}L${x} ${y+5}L${x-5} ${y}Z`} fill="url(#lb-gold)"/>)}
              <circle cx="40" cy="41" r="15" fill="none" stroke="#d6aa55" strokeWidth=".8" opacity=".75"/>
              <path d="M40 27L49 41L40 55L31 41Z" fill="url(#lb-gold)" stroke="#7d5a26" strokeWidth=".6"/>
              <path d="M40 31L45.5 41L40 51L34.5 41Z" fill="#7a3f73"/>
              <path d="M40 34L43 41L40 48L37 41Z" fill="#e7b9ff" opacity=".85"/>
              <text x="40" y="74" textAnchor="middle" fill="url(#lb-gold)" fontSize="12.5" fontFamily="Georgia, serif" fontWeight="bold" letterSpacing="1.5">LORE</text>
              <path d="M25 80H55" stroke="#d6aa55" strokeWidth=".7" opacity=".8"/>
              <circle cx="40" cy="80" r="1.4" fill="#f2d48b"/>
            </svg>
          </span>
          <span className="lb-cover-inside"/>
        </span>
        <span className="lb-spine"><i/><i/><i/><i/></span>
      </span>
    </span>
  </button>;
}

const NUMERALS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
/** Storyboard light per chapter: keys, ledger, house, fold, archivist, ink, last lock, showdown, dawn. */
const STORYBOARD_HUES = [270, 265, 32, 285, 195, 330, 235, 44, 352, 172];

export function LoreLibrary({completedBosses,onClose}:{completedBosses:readonly number[];onClose:()=>void}) {
  const [reading,setReading] = useState<LoreChapter|null>(null);
  const opened = LORE_CHAPTERS.filter(chapter=>isLoreChapterUnlocked(chapter.number,completedBosses)).length;
  const victories = new Set(completedBosses).size;
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(reading)setReading(null);else onClose();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[onClose,reading]);
  if (reading) return <ComicReader chapter={reading} onBack={()=>setReading(null)} onClose={onClose}/>;
  const intro = opened===0 ? 'Win against any champion to open the first chapter.'
    : opened===LORE_CHAPTERS.length ? 'Every door is open. The chair is yours.'
    : opened===1 ? 'Your first victory opened a door.'
    : `${opened} of ${LORE_CHAPTERS.length} chapters open. Each new champion you defeat brings the next one closer.`;
  return <div className="lore-library-veil" onPointerDown={event=>event.target===event.currentTarget&&onClose()}>
    <section className="lore-library" role="dialog" aria-modal="true" aria-label="Lore chapters">
      <header><div><small>The Convergence chronicles</small><h2>Lore</h2></div><button type="button" aria-label="Close Lore" onClick={onClose}>×</button></header>
      <p>{intro}</p>
      <div className="lore-chapter-grid">{LORE_CHAPTERS.map((chapter,index)=>{const available=isLoreChapterUnlocked(chapter.number,completedBosses);const needed=LORE_CHAPTER_VICTORIES[index]-victories;return <button key={chapter.slug} disabled={!available} onClick={()=>available&&setReading(chapter)} className={`lore-chapter${available?' is-unlocked':''}`} aria-label={`Lore chapter ${chapter.number}, ${available?chapter.title:'locked'}`}>
        <span className="lore-chapter-number">{NUMERALS[index]}</span>
        <span><strong>{available?chapter.title:`Chapter ${chapter.number}`}</strong><small>{available?`Read chapter ${NUMERALS[index]}`:opened>0?`${needed} more ${needed===1?'victory':'victories'}`:'Locked'}</small></span>
        {available?<span aria-hidden="true" className="lore-read-arrow">›</span>:<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M6 12V8a6 6 0 0112 0v4M3 12h18v13H3z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="18" r="2" fill="currentColor"/></svg>}
      </button>;})}</div>
    </section>
  </div>;
}

/** One gold line drawing per storyboard chapter, drawn on a 100 by 100 grid. */
const MOTIFS: Record<string,string> = {
  'keys-without-doors':'M30 50a14 14 0 1 0 28 0a14 14 0 1 0 -28 0M58 50H86M76 50v10M84 50v8M38 50a6 6 0 1 0 12 0a6 6 0 1 0 -12 0',
  'the-ledger':'M50 30C40 24 26 24 16 28V76C26 72 40 72 50 78C60 72 74 72 84 76V28C74 24 60 24 50 30ZM50 30V78M24 38H42M24 46H42M24 54H38M58 38H76M58 46H76M58 54H72',
  'the-house-always-deals':'M22 34L48 26L58 74L32 82ZM40 28L66 22L74 72L48 78ZM56 24H82V76H56ZM69 40L74 50L69 60L64 50Z',
  'fold':'M28 22L52 28L74 20L70 46L80 66L56 72L34 80L36 56L22 42ZM36 56L52 46L70 46M52 28L52 46L56 72',
  'the-archivists-card':'M30 18H70V82H30ZM50 34a9 9 0 1 0 0.1 0M36 72C38 58 62 58 64 72M30 24H70',
  'counterfeit':'M50 18C62 38 72 50 72 62a22 22 0 0 1 -44 0C28 50 38 38 50 18ZM40 62a10 10 0 0 0 10 10',
  'the-last-lock':'M32 46V36a18 18 0 0 1 36 0V46M24 46H76V84H24ZM50 58a5 5 0 1 0 0.1 0M50 63V72',
  'showdown-at-the-table':'M20 30L46 24L52 70L26 76ZM80 30L54 24L48 70L74 76ZM50 14V22M42 16L46 22M58 16L54 22',
  'new-game':'M30 84V40a20 20 0 0 1 40 0V84ZM50 84V30M18 84H82M50 20V12M30 26L24 20M70 26L76 20M22 44H14M78 44H86',
};

function ComicReader({chapter,onBack,onClose}:{chapter:LoreChapter;onBack:()=>void;onClose:()=>void}) {
  const [panel,setPanel] = useState(0);
  const [spread,setSpread] = useState(()=>matchMedia('(min-width:650px)').matches);
  const [loaded,setLoaded] = useState(!chapter.art);
  const [failed,setFailed] = useState(false);
  const art = chapter.art ? resolvePublicAssetUrl(chapter.art) : null;
  const count = spread ? 2 : 1;
  const last = chapter.panels.length;
  const numeral = NUMERALS[chapter.number-1];
  const motif = MOTIFS[chapter.slug];
  const advance = (direction:number) => setPanel(current=>Math.max(0,Math.min(last-count,current+direction*count)));
  useEffect(()=>{const media=matchMedia('(min-width:650px)');const change=()=>{setSpread(media.matches);setPanel(current=>Math.min(current,last-(media.matches?2:1)));};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[last]);
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.key==='ArrowRight')advance(1);if(event.key==='ArrowLeft')advance(-1);};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[count,last]);
  return <div className="lore-library-veil comic-veil">
    <section className="comic-reader" role="dialog" aria-modal="true" aria-label={`${chapter.title} comic`} style={{'--sb-hue':`${STORYBOARD_HUES[chapter.number-1]}`} as CSSProperties}>
      <header><button type="button" onClick={onBack} aria-label="Back to Lore">‹</button><div><small>Chapter {numeral}</small><h2>{chapter.title}</h2></div><button type="button" onClick={onClose} aria-label="Close comic">×</button></header>
      {art&&<img className="comic-loader" src={art} alt="" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}
      {!loaded&&<p role="status" className="comic-loading">{failed?'The artwork could not load. Close and reopen the chapter to retry.':'Opening the chapter…'}</p>}
      <div className="comic-spread" style={{'--comic-columns':count} as CSSProperties} aria-live="polite">
        {chapter.panels.slice(panel,panel+count).map((entry,offset)=>{const index=panel+offset;return <article key={index} className={`comic-frame${loaded?' is-loaded':''}${art?'':' is-storyboard'}`} aria-label={`Panel ${index+1}: ${entry.scene}`} style={art?{backgroundImage:`url("${art}")`,backgroundPosition:`${index%3*50}% ${Math.floor(index/3)*100}%`}:{'--sb-tilt':`${(index%2?1:-1)*(4+index*3)}deg`} as CSSProperties}>
          {!art&&<div className="storyboard-art" aria-hidden="true">
            {motif&&<svg viewBox="0 0 100 100"><path d={motif}/></svg>}
            <span className="storyboard-mark">{numeral} · {index+1}</span>
            <p className="storyboard-scene">{entry.scene}</p>
          </div>}
          {entry.caption&&<p className="comic-caption">{entry.caption}</p>}
          {entry.dialogue&&<p className="comic-dialogue">{entry.dialogue}</p>}
        </article>;})}
      </div>
      <footer><button type="button" onClick={()=>advance(-1)} disabled={panel===0} aria-label="Previous comic page">‹</button><span>{panel+1}{count===2?`–${Math.min(panel+count,last)}`:''} / {last}</span>{panel+count<last?<button type="button" onClick={()=>advance(1)} aria-label="Next comic page">›</button>:<button type="button" onClick={onBack} className="comic-finish">Finish chapter</button>}</footer>
    </section>
  </div>;
}
