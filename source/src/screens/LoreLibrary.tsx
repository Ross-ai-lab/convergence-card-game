import { useEffect, useState, type CSSProperties } from 'react';
import { LORE_CHAPTER_ONE, isLoreChapterUnlocked } from '../lore-chapters';
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

export function LoreLibrary({completedBosses,onClose}:{completedBosses:readonly number[];onClose:()=>void}) {
  const [reading,setReading] = useState(false);
  const unlocked = isLoreChapterUnlocked(1,completedBosses);
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(reading)setReading(false);else onClose();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[onClose,reading]);
  if (reading && unlocked) return <ComicReader onBack={()=>setReading(false)} onClose={onClose}/>;
  return <div className="lore-library-veil" onPointerDown={event=>event.target===event.currentTarget&&onClose()}>
    <section className="lore-library" role="dialog" aria-modal="true" aria-label="Lore chapters">
      <header><div><small>The Convergence chronicles</small><h2>Lore</h2></div><button type="button" aria-label="Close Lore" onClick={onClose}>×</button></header>
      <p>{unlocked?'Your first victory opened a door.':'Win against any champion to open the first chapter.'}</p>
      <div className="lore-chapter-grid">{Array.from({length:10},(_,index)=>{const available=isLoreChapterUnlocked(index+1,completedBosses);return <button key={index} disabled={!available} onClick={()=>available&&setReading(true)} className={`lore-chapter${available?' is-unlocked':''}`} aria-label={`Lore chapter ${index+1}, ${available?'The Empty Chair':'locked'}`}>
        <span className="lore-chapter-number">{['I','II','III','IV','V','VI','VII','VIII','IX','X'][index]}</span>
        <span><strong>{available?'The Empty Chair':`Chapter ${index+1}`}</strong><small>{available?'Read chapter I':'Locked'}</small></span>
        {available?<span aria-hidden="true" className="lore-read-arrow">›</span>:<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M6 12V8a6 6 0 0112 0v4M3 12h18v13H3z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="18" r="2" fill="currentColor"/></svg>}
      </button>;})}</div>
    </section>
  </div>;
}

function ComicReader({onBack,onClose}:{onBack:()=>void;onClose:()=>void}) {
  const [panel,setPanel] = useState(0);
  const [spread,setSpread] = useState(()=>matchMedia('(min-width:650px)').matches);
  const [loaded,setLoaded] = useState(false);
  const [failed,setFailed] = useState(false);
  const art = resolvePublicAssetUrl('lore/the-empty-chair.webp?v=chapter-one-2026');
  const count = spread ? 2 : 1;
  const last = LORE_CHAPTER_ONE.panels.length;
  const advance = (direction:number) => setPanel(current=>Math.max(0,Math.min(last-count,current+direction*count)));
  useEffect(()=>{const media=matchMedia('(min-width:650px)');const change=()=>{setSpread(media.matches);setPanel(current=>Math.min(current,last-(media.matches?2:1)));};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[last]);
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.key==='ArrowRight')advance(1);if(event.key==='ArrowLeft')advance(-1);};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[count,last]);
  return <div className="lore-library-veil comic-veil">
    <section className="comic-reader" role="dialog" aria-modal="true" aria-label="The Empty Chair comic">
      <header><button type="button" onClick={onBack} aria-label="Back to Lore">‹</button><div><small>Chapter I</small><h2>{LORE_CHAPTER_ONE.title}</h2></div><button type="button" onClick={onClose} aria-label="Close comic">×</button></header>
      <img className="comic-loader" src={art} alt="" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>
      {!loaded&&<p role="status" className="comic-loading">{failed?'The artwork could not load. Close and reopen the chapter to retry.':'Opening the chapter…'}</p>}
      <div className="comic-spread" style={{'--comic-columns':count} as CSSProperties} aria-live="polite">
        {LORE_CHAPTER_ONE.panels.slice(panel,panel+count).map((entry,offset)=>{const index=panel+offset;return <article key={index} className={`comic-frame${loaded?' is-loaded':''}`} aria-label={`Panel ${index+1}: ${entry.scene}`} style={{backgroundImage:`url("${art}")`,backgroundPosition:`${index%3*50}% ${Math.floor(index/3)*100}%`}}>
          {entry.caption&&<p className="comic-caption">{entry.caption}</p>}
          {entry.dialogue&&<p className="comic-dialogue">{entry.dialogue}</p>}
        </article>;})}
      </div>
      <footer><button type="button" onClick={()=>advance(-1)} disabled={panel===0} aria-label="Previous comic page">‹</button><span>{panel+1}{count===2?`–${Math.min(panel+count,last)}`:''} / {last}</span>{panel+count<last?<button type="button" onClick={()=>advance(1)} aria-label="Next comic page">›</button>:<button type="button" onClick={onBack} className="comic-finish">Finish chapter</button>}</footer>
    </section>
  </div>;
}
