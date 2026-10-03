import { useEffect } from 'react';
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

export function LoreLibrary({onClose}:{onClose:()=>void}) {
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[onClose]);
  return <div className="lore-library-veil" onPointerDown={event=>event.target===event.currentTarget&&onClose()}>
    <section className="lore-library" role="dialog" aria-modal="true" aria-label="Lore chapters">
      <header><div><small>The Convergence chronicles</small><h2>Lore</h2></div><button type="button" aria-label="Close Lore" onClick={onClose}>×</button></header>
      <p>Ten chapters await. Their stories are sealed for now.</p>
      <div className="lore-chapter-grid">{Array.from({length:10},(_,index)=><button key={index} disabled className="lore-chapter" aria-label={`Lore chapter ${index+1}, locked`}>
        <span className="lore-chapter-number">{['I','II','III','IV','V','VI','VII','VIII','IX','X'][index]}</span>
        <span><strong>Chapter {index+1}</strong><small>Locked</small></span>
        <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M6 12V8a6 6 0 0112 0v4M3 12h18v13H3z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="18" r="2" fill="currentColor"/></svg>
      </button>)}</div>
    </section>
  </div>;
}
