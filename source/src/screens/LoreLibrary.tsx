import { useEffect, useState, type CSSProperties } from 'react';
import { LORE_CHAPTER_ONE, isLoreChapterUnlocked } from '../lore-chapters';
import { resolvePublicAssetUrl } from '../engine/asset-url';
import './LoreLibrary.css';

export function LoreBookButton({onOpen}:{onOpen:()=>void}) {
  return <button type="button" className="lore-book-button" aria-label="Lore" onClick={onOpen}>
    <svg viewBox="0 0 90 120" aria-hidden="true">
      <defs><linearGradient id="lore-cover"><stop stopColor="#593259"/><stop offset="1" stopColor="#20172f"/></linearGradient></defs>
      <path d="M13 8H72Q81 8 81 17V110H17Q8 110 8 102V16Q8 8 13 8Z" fill="#17111d"/>
      <path d="M17 99H81V111H17Q10 111 10 105Q10 99 17 99Z" fill="#d6bd85" stroke="#8a683c"/>
      <path d="M18 103H77M18 107H77" stroke="#947d53"/>
      <path d="M11 8H77V100H17Q11 100 11 107Z" fill="url(#lore-cover)" stroke="#dab566" strokeWidth="2"/>
      <path d="M22 8V100M28 20H68V87H28Z" fill="none" stroke="#b99758" opacity=".7"/>
      <path d="M48 28L56 40L48 52L40 40Z" fill="#e0bc71"/>
      <text x="48" y="68" textAnchor="middle" fill="#f2d99b" fontSize="13" fontFamily="Georgia" fontWeight="bold">LORE</text>
      <path d="M11 27H22M11 80H22" stroke="#dab566" strokeWidth="4"/>
    </svg>
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
  const art = resolvePublicAssetUrl('lore/the-empty-chair.webp');
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
