import { useEffect, useRef, useState } from "react";
import "./CampaignSpeech.css";

function useSpeechText(text: string) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const start = performance.now();
    const timer = window.setInterval(() => {
      const count = Math.min(text.length, Math.floor((performance.now() - start) / 18));
      setShown(previous => Math.max(previous, count));
      if (count === text.length) window.clearInterval(timer);
    }, 32);
    return () => window.clearInterval(timer);
  }, [text]);
  return { visible: text.slice(0, shown), complete: shown >= text.length, reveal: () => setShown(text.length) };
}

export interface SpeechCue {
  id: number;
  name: string;
  art: string;
  text: string;
  accent: string;
}

export function CampaignSpeech({stage, chapter, name, text, art, accent, onContinue, onCancel}: {
  stage: "prologue" | "entrance" | "defeat"; chapter: number; name: string; text: string;
  art?: string; accent: string; onContinue: () => void; onCancel?: () => void;
}) {
  const speech = useSpeechText(text);
  const panel = useRef<HTMLElement>(null);
  const forward = () => speech.complete ? onContinue() : speech.reveal();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); (onCancel ?? onContinue)(); }
      if (event.key === "Tab") {
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onCancel, onContinue]);
  return <div className="campaign-speech-veil" style={{"--speech-accent":accent} as React.CSSProperties}>
    <section ref={panel} className={`campaign-speech-panel${art ? "" : " is-prologue"}`} role="dialog" aria-modal="true"
      aria-label={stage === "prologue" ? "Rick Gramps story" : `${name} ${stage} speech`} data-story-key={`${stage}-${chapter}`} data-story-stage={stage}>
      {art ? <img className="campaign-speech-portrait" src={art} alt={name} /> : <div className="campaign-speech-sigil" aria-hidden="true">R</div>}
      <div className="campaign-speech-copy">
        <span className="campaign-speech-kicker">{stage === "prologue" ? "The collection begins" : `Chapter ${chapter} · ${stage === "defeat" ? "Allegiance earned" : "A new challenger"}`}</span>
        <h2>{name}</h2>
        <div className="campaign-speech-text" onClick={speech.reveal}>
          <span className="speech-accessible">{text}</span><p aria-hidden="true">{speech.visible}<span className={speech.complete ? "speech-caret complete" : "speech-caret"}>▌</span></p>
        </div>
        <footer>
          {onCancel && <button className="speech-back" onClick={onCancel}>Back</button>}
          <button className="speech-skip" data-story-skip onClick={onContinue}>Skip dialogue</button>
          <button className="speech-continue" onClick={forward}>{!speech.complete ? "Show full text" : stage === "entrance" ? "Enter the arena" : stage === "defeat" ? "Continue" : "Begin collecting"}</button>
        </footer>
      </div>
    </section>
  </div>;
}

export function CollectedBossSpeech({cue, onDone}: {cue: SpeechCue; onDone: () => void}) {
  const speech = useSpeechText(cue.text);
  useEffect(() => {
    const timer = window.setTimeout(onDone, Math.max(5500, cue.text.length * 18 + 3500));
    return () => window.clearTimeout(timer);
  }, [cue.id, cue.text, onDone]);
  return <aside className="collected-boss-speech" role="status" data-boss-speech={cue.name} style={{"--speech-accent":cue.accent} as React.CSSProperties}>
    <img src={cue.art} alt="" /><div><strong>{cue.name}</strong><span className="speech-accessible">{cue.text}</span><p aria-hidden="true">{speech.visible}</p></div>
    <button onClick={onDone} aria-label="Dismiss boss speech">×</button>
  </aside>;
}
