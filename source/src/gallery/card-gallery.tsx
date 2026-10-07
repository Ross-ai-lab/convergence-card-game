/** My Deck: the collection wall, filters, deck sidebar, saved decks and Hero Power chooser. */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cards, relics } from "../data/cards";
import { heroPowerDefinition } from "../engine/hero-powers";
import { ALIGNMENTS, CAMPS, RARITIES, rarityName, RELIC_CAMP_LABEL, RELIC_RARITY } from "../engine/types";
import type { HeroPowerId } from "../engine/types";
import type { CardFaceModel } from "../card-presentation";
import { CardFace, CardPeek, GalleryPreviewContext, playableFace, relicFace } from "../card-face";
import { botWins, canEditDeck, hasNewHeroPower, type Progress } from "../progress";
import { CAMPAIGN_CHAPTERS } from "../campaign";
import { useGalleryVisibility } from "../gallery-visibility";
import { HeroPowerChoices } from "../screens/Screens";
import { GalleryDetailModal, type GalleryEntry } from "./card-profile";

/**
 * Every card in the game, on one page.
 *
 * It draws through the same `CardFace` the board draws through, from the same
 * `cards` and `relics` the engine loads, so it CANNOT go stale. Change a card's
 * text and the gallery already shows the new text; add a card and it appears.
 * That is the entire reason it is a screen inside the game rather than a folder
 * of exported pictures — a picture is right on the day it was taken and quietly
 * wrong forever after, with nothing to say so.
 *
 * Cards are shown as printed: no board state, no live buffs, no conditions.
 */
/**
 * The gallery's filters: one dropdown per attribute, never one dropdown for all
 * of them.
 *
 * The first version offered a single "sort by" list with Camp as an option,
 * which was incoherent — sorting BY camp cannot answer "show me the Tech
 * cards", and that is the only question anyone actually has. Each attribute now
 * gets its own control, and they combine, so Tech + Evil + 7 mana is three
 * clicks.
 *
 * The option lists are derived from the roster rather than typed out, so relics
 * (rarity "Relic", camp "Relic") appear on their own without a special case,
 * and a new camp or rarity would appear the moment a card used one.
 */
type FilterKey = "cost" | "rarity" | "camp" | "alignment";

const FILTER_LABEL: Record<FilterKey, string> = {
  cost: "Mana",
  rarity: "Rarity",
  camp: "Camp",
  alignment: "Alignment",
};

/** Shown when a filter is off. Reads as a sentence in the control itself. */
const FILTER_ANY: Record<FilterKey, string> = {
  cost: "Any mana",
  rarity: "Any rarity",
  camp: "Any camp",
  alignment: "Any alignment",
};

/**
 * The order each filter's options are listed in.
 *
 * Rarity runs commonest to rarest, which is not alphabetical, and it is read off
 * the engine's own tier table rather than typed out again — the colours carry no
 * order of their own, which is how Legendary once ended up listed above Epic.
 * Relics are appended because they are a card class rather than a character
 * tier.
 */
const VALUE_ORDER: Record<FilterKey, string[]> = {
  cost: [],
  rarity: [...RARITIES, RELIC_RARITY],
  camp: [...CAMPS],
  alignment: [...ALIGNMENTS],
};

/**
 * Values that exist in the data but must not be offered as a filter.
 *
 * A relic is not a camp and it is not an alignment — it carries the placeholder
 * strings "Relic" and "Relic" so the card face has something to print on its
 * rails. Deriving the option lists from the roster is what surfaced them, and
 * they read as real choices next to Magic and Evil, which they are not. Rarity
 * keeps "Relic" because there it IS the answer: it is what those cards are.
 */
const HIDDEN_FILTER_VALUES: Partial<Record<FilterKey, string[]>> = {
  camp: [RELIC_CAMP_LABEL],
  alignment: [RELIC_RARITY],
};

/**
 * A tier's option label is its PLAYER-FACING name.
 *
 * The colours are internal labels — they name the gem on the card, not the tier
 * — so a filter offering "Yellow" and "Red" would ask the player to know an
 * implementation detail. `rarityName` is the engine's own table, so every
 * surface that names a tier reads the same one.
 */
function filterOptionLabel(key: FilterKey, value: string): string {
  return key === "rarity" ? rarityName(value) : value;
}

function faceValue(face: CardFaceModel, key: FilterKey): string {
  return key === "cost" ? String(face.cost ?? "") : (face[key] ?? "");
}

/**
 * The unlock filter, which is deliberately NOT a fifth `FilterKey`.
 *
 * The other four read a value printed on the card face and match it. This one
 * asks a question about the player's record instead, and folding it into the
 * same machinery would mean inventing a fake face attribute for it and then
 * hiding that attribute from the option lists. Two controls that look identical
 * and are built differently is the honest arrangement here.
 *
 * It is also the only filter with NO "any" option, and the only one that starts
 * switched on. Owner's ruling: the gallery is your collection first and the
 * locked wall second, so mixing unlocked and sealed cards is a
 * list that answers neither question. There is therefore no view that shows the
 * whole roster at once, which is the deliberate cost of that.
 */
type UnlockFilter = "unlocked" | "locked";

export function CardGallery({ progress, fontRevision, seat = 0, onChange, onHeroPowerChange, onHeroPowerViewed, onClose, onPresetCreate,onPresetSelect }: {
  onPresetCreate:(name:string)=>boolean;onPresetSelect:(id:string)=>boolean;
  progress: Progress; fontRevision: number; seat?: 0 | 1; onChange: (ids: string[]) => void; onHeroPowerChange: (power: HeroPowerId) => void; onHeroPowerViewed: () => void; onClose: () => void;
}) {
  const deck = seat === 0 ? progress.playerDeck : progress.hotseatDeck;
  const selectedPreset=progress.savedDecks.find(entry=>entry.id===progress.selectedDecks[seat]);
  const [saveOpen,setSaveOpen]=useState(false);
  const [deckName,setDeckName]=useState('');
  const [deckNotice,setDeckNotice]=useState('');
  const [saveError,setSaveError]=useState('');
  const duplicateName=progress.savedDecks.some(preset=>preset.name.toLocaleLowerCase()===deckName.trim().replace(/\s+/g,' ').toLocaleLowerCase());
  const readOnly = !canEditDeck(progress);
  const deckIds = new Set(deck);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const closePowers=()=>{setPowerOpen(false);onHeroPowerViewed();};
  const [mobileDeckView, setMobileDeckView] = useState(false);
  const [artPreviews, setArtPreviews] = useState<Record<string,string> | null>(null);
  useEffect(() => { void import('../data/gallery-previews').then(module=>setArtPreviews(module.galleryPreviews)).catch(()=>setArtPreviews({})); }, []);
  const [deckPreview, setDeckPreview] = useState<{key:string; face: CardFaceModel; rect: DOMRect} | null>(null);
  const [lockedInfo,setLockedInfo]=useState<{key:string;rect:DOMRect}|null>(null);
  const equippedPower = heroPowerDefinition(progress.selectedHeroPower);
  const powerPicker = useRef<HTMLElement>(null);
  const createPicker = useRef<HTMLFormElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!saveOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    createPicker.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus({preventScroll:true});
  }, [saveOpen]);
  useEffect(() => {
    if (!powerOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    powerPicker.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, [powerOpen]);
  const [showEquipped, setShowEquipped] = useState(true);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [status, setStatus] = useState<UnlockFilter>("unlocked");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    cost: "",
    rarity: "",
    camp: "",
    alignment: "",
  });
  /** The scrolling element, so a new search or filter can return to the top. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const openEntry = useCallback((entryKey: string) => setSelectedEntryKey(entryKey), []);
  // Stable callbacks keep the memoised cells still when unrelated gallery state
  // changes, such as hovering the deck list. They read the latest deck at click time.
  const latestDeck = useRef({ deck, onChange });
  latestDeck.current = { deck, onChange };
  const toggleCard = useCallback((entryKey: string) => {
    const { deck, onChange } = latestDeck.current;
    onChange(deck.includes(entryKey) ? deck.filter(id => id !== entryKey) : [...deck, entryKey]);
  }, []);
  const showLockedInfo = useCallback((key: string, rect: DOMRect) => { setDeckPreview(null); setLockedInfo({ key, rect }); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (event.target instanceof HTMLElement && !!event.target.closest('select'))) { event.stopImmediatePropagation(); return; }
      if (event.key === "Escape") { event.stopImmediatePropagation(); if(saveOpen)setSaveOpen(false);else if (powerOpen) closePowers(); else onClose(); }
      if ((powerOpen || saveOpen) && event.key === "Tab") {
        const buttons = [...((saveOpen ? createPicker : powerPicker).current?.querySelectorAll<HTMLElement>("input,button:not([disabled])") ?? [])];
        const first=buttons[0], last=buttons.at(-1);
        if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, powerOpen, saveOpen]);

  const needle = query.trim().toLowerCase();
  // Built ONCE and then only filtered. Rebuilding the faces on every keystroke
  // handed React a brand-new object for every card, so every cell re-rendered for every
  // letter typed even though the cards had not changed.
  const allEntries = useMemo(
    (): GalleryEntry[] => [
      ...cards.map((card) => ({ key: card.id, card, face: playableFace(card) })),
      ...relics.map((relic) => ({ key: relic.id, card: relic, face: relicFace(relic) })),
    ],
    [],
  );
  // Sets, not `includes`: this is checked once per card per render, and the
  // three lists together are the size of the whole roster.
  const collection = useMemo(
    () => ({
      seen: new Set(progress.seen),
      played: new Set(progress.played),
      wonWith: new Set(progress.wonWith),
      unlocked: new Set(progress.unlockedIds),
    }),
    [progress],
  );
  const entries = useMemo(() => {
    const all = allEntries;
    if (!needle) return all;
    // Search everything printed on the face. Looking for "freeze" should find
    // the cards that freeze, not only the ones with Freeze in their name.
    return all.filter((entry) =>
      [
        entry.face.name,
        entry.face.effect,
        entry.face.origin,
        entry.face.camp,
        entry.face.alignment,
        entry.face.rarity,
        entry.face.flavor ?? "",
        (entry.face.keywords ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [needle, allEntries]);

  // Every value the roster actually uses, in the house order, so no option ever
  // points at an empty result.
  const options = useMemo(() => {
    const build = (key: FilterKey) => {
      const hidden = new Set(HIDDEN_FILTER_VALUES[key] ?? []);
      const present = new Set(
        allEntries.map((entry) => faceValue(entry.face, key)).filter((value) => value && !hidden.has(value)),
      );
      if (key === "cost") {
        return [...present].sort((a, b) => Number(a) - Number(b));
      }
      const order = VALUE_ORDER[key];
      return [...present].sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi) || a.localeCompare(b);
      });
    };
    return { cost: build("cost"), rarity: build("rarity"), camp: build("camp"), alignment: build("alignment") };
  }, [allEntries]);

  const sorted = useMemo(() => {
    const active = (Object.keys(filters) as FilterKey[]).filter((key) => filters[key] !== "");
    let kept = active.length
      ? entries.filter((entry) => active.every((key) => faceValue(entry.face, key) === filters[key]))
      : entries;
    const wantUnlocked = status === "unlocked";
    kept = kept.filter((entry) => collection.unlocked.has(entry.key) === wantUnlocked && (showEquipped || !deck.includes(entry.key)));
    const rarityRank = (entry: GalleryEntry) => {
      const index = VALUE_ORDER.rarity.indexOf(entry.face.rarity);
      return index < 0 ? VALUE_ORDER.rarity.length : index;
    };
    return [...kept].sort((a, b) =>
      (filters.cost ? rarityRank(a) - rarityRank(b) : (a.face.cost ?? 99) - (b.face.cost ?? 99))
      || a.face.name.localeCompare(b.face.name));
  }, [entries, filters, status, collection, showEquipped, deck]);

  const selectedEntry = selectedEntryKey ? allEntries.find((entry) => entry.key === selectedEntryKey) ?? null : null;

  useEffect(() => {
    if (selectedEntryKey && !selectedEntry) setSelectedEntryKey(null);
  }, [selectedEntryKey, selectedEntry]);

  useEffect(() => {
    const body = bodyRef.current, outer = body?.closest<HTMLElement>('.gallery-mobile-scroll');
    (outer && getComputedStyle(outer).overflowY === 'auto' ? outer : body)?.scrollTo({ top: 0 });
  }, [needle, filters, status]);


  const manaCurve = Array.from({length:10},(_,i)=>allEntries.filter(entry=>deckIds.has(entry.key) && entry.face.cost===i+1).length);
  const manaPeak = Math.max(1,...manaCurve);
  useLayoutEffect(() => {
    const grid=gridRef.current;
    if (!grid) return;
    const size=()=>{const width=grid.firstElementChild?.getBoundingClientRect().width;if(width)grid.style.setProperty('--gallery-unit',`${width/750}px`);};
    const observer=new ResizeObserver(size);observer.observe(grid);size();
    return ()=>observer.disconnect();
  },[artPreviews, mobileDeckView, sorted.length]);
  return (
    <GalleryPreviewContext.Provider value={artPreviews ?? {}}><div
      className={`screen-veil gallery-veil${selectedEntry || help ? " has-detail" : ""}${selectedEntry ? " has-profile" : ""}`}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {/* Deliberately NOT `wide`. That class sets its own 760px width at the same
          specificity as anything here can reach, and it is defined in a stylesheet
          that loads later, so it wins on source order and squeezes the grid to
          three columns. Leaving it off means nothing competes. */}
      <section className={`screen-panel gallery-panel${mobileDeckView ? " mobile-deck-view" : ""}`} role="dialog" aria-label="My Deck" aria-modal="true">
        <div className="gallery-mobile-scroll">
        <header className="screen-panel-top">
          <h2>My Deck</h2>
          <nav className="mobile-deck-tabs" aria-label="Deck builder view">
            <button type="button" aria-pressed={!mobileDeckView} onClick={() => setMobileDeckView(false)}>Collection</button>
            <button type="button" aria-pressed={mobileDeckView} onClick={() => setMobileDeckView(true)}>Deck · {deck.length}/30</button>
          </nav>
          <label className="gallery-equipped"><input type="checkbox" checked={showEquipped} onChange={event => setShowEquipped(event.target.checked)} />Show equipped cards</label>
          <input
            className="gallery-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, rules, origin…"
            aria-label="Search the gallery"
          />
          <div className="gallery-filters">
            {(Object.keys(FILTER_LABEL) as FilterKey[]).map((key) => (
              <label key={key} className={filters[key] ? "gallery-filter is-active" : "gallery-filter"}>
                <span className="gallery-filter-label">{FILTER_LABEL[key]}</span>
                <select
                  value={filters[key]}
                  aria-label={`Filter by ${FILTER_LABEL[key].toLowerCase()}`}
                  onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                >
                  <option value="">{FILTER_ANY[key]}</option>
                  {options[key].map((value) => (
                    <option key={value} value={value}>
                      {filterOptionLabel(key, value)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="gallery-filter is-active">
              <span className="gallery-filter-label">Collection</span>
              <select
                value={status}
                aria-label="Filter by unlocked or locked"
                onChange={(event) => setStatus(event.target.value as UnlockFilter)}
              >
                <option value="unlocked">Unlocked</option>
                <option value="locked">Locked</option>
              </select>
            </label>
          </div>
          <span className="gallery-count">{sorted.length}</span>
          <button
            type="button"
            className={help ? "gallery-help is-open" : "gallery-help"}
            onClick={() => setHelp((open) => !open)}
            aria-expanded={help}
            aria-label="How unlocking works"
          >
            ?
          </button>
          <button type="button" className="screen-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {help ? <UnlockHelp progress={progress} onClose={() => setHelp(false)} /> : null}
        <div className="gallery-workspace">
        <div className="screen-panel-body gallery-body" ref={bodyRef}>
          {!artPreviews ? <p role="status">Opening collection…</p> : sorted.length ? (
            <div className="gallery-grid" ref={gridRef}>
              {sorted.map((entry) => (
                <div className="gallery-deck-card" key={entry.key} data-card-id={entry.key}>
                <GalleryCell
                  key={entry.key}
                  face={entry.face}
                  fontRevision={fontRevision}
                  locked={!collection.unlocked.has(entry.key)}
                  entryKey={entry.key}
                  onOpen={openEntry}
                  onLocked={showLockedInfo}
                  inDeck={deckIds.has(entry.key)}
                  canAdd={!readOnly && (deckIds.has(entry.key) || deck.length < 30) && collection.unlocked.has(entry.key)}
                  onToggle={toggleCard}
                  mark={
                    collection.wonWith.has(entry.key)
                      ? "won"
                      : collection.played.has(entry.key)
                        ? "played"
                        : collection.seen.has(entry.key)
                          ? "seen"
                          : "unseen"
                  }
                />
                </div>
              ))}
            </div>
          ) : (
            <p className="gallery-empty">Nothing matches “{query}”.</p>
          )}
        </div>
        <aside className="gallery-deck" aria-label={seat === 1 ? "Player Two deck" : "Current deck"}>
          <header className="gallery-deck-heading"><label className="gallery-filter gallery-deck-selector"><span className="gallery-filter-label">Saved decks</span>
            <select aria-label="Saved decks" value={selectedPreset?.id} onChange={event=>{setDeckPreview(null);setDeckNotice(onPresetSelect(event.target.value)?'Deck loaded':'Could not load. Browser storage is unavailable.');}}>
              {progress.savedDecks.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select></label>
            <strong aria-live="polite" className={deck.length === 30 ? "is-complete" : "is-incomplete"}>{deck.length}<small> / 30</small></strong></header>
          <div className="gallery-preset-actions"><button type="button" disabled={!deck.length||readOnly} onClick={()=>{setDeckPreview(null);onChange([]);setDeckNotice('Deck cleared');}}>Clear</button>
            <button type="button" className="preset-create" disabled={readOnly} onClick={()=>{let serial=1;while(progress.savedDecks.some(deck=>deck.name.toLowerCase()===`deck ${serial}`))serial++;setDeckName(`Deck ${serial}`);setSaveError('');setSaveOpen(true);}}>Create a new deck</button></div>
          {deckNotice&&<p className="gallery-preset-notice" role="status">{deckNotice}</p>}
          <div className="gallery-deck-list" onScroll={() => setDeckPreview(null)}>{allEntries.filter((entry) => deckIds.has(entry.key))
            .sort((a, b) => (a.face.cost ?? 0) - (b.face.cost ?? 0) || a.face.name.localeCompare(b.face.name))
            .map((entry) => <div className="gallery-deck-row" key={entry.key} data-card-id={entry.key}
              onPointerEnter={event => { if (event.pointerType === 'mouse' && matchMedia('(hover: hover) and (pointer: fine)').matches) setDeckPreview({key:entry.key,face:entry.face,rect:event.currentTarget.getBoundingClientRect()}); }}
              onPointerLeave={() => setDeckPreview(null)}>
              <img src={entry.card.art} alt="" loading="lazy" />
              <button className="gallery-deck-inspect" onClick={() => { setSelectedEntryKey(entry.key); }} aria-label={`Inspect ${entry.face.name}`}>
                <span className="gallery-deck-mana">{entry.face.cost}</span><span className="gallery-deck-name">{entry.face.name}</span>
              </button>
              <button className="gallery-deck-remove" disabled={readOnly} onClick={() => {setDeckPreview(null);onChange(deck.filter((id) => id !== entry.key));}}
                aria-label={`Remove ${entry.face.name} from deck`} title={`Remove ${entry.face.name}`}>−</button>
            </div>)}</div>
          <footer className="gallery-deck-footer">
            <div className="gallery-mana-summary"><span className="gallery-mana-title">Mana curve</span><div className="gallery-deck-curve" aria-label="Deck mana curve">{Array.from({ length: 10 }, (_, i) => {
              const count = manaCurve[i];
              return <div key={i}><span data-count={count} style={{ height: `${Math.max(2, count / manaPeak * 13)}px` }}>{count}</span><small>{i + 1}</small></div>;
            })}</div></div>
            <div className="gallery-deck-actions">
              <button type="button" className={`gallery-hero-power${hasNewHeroPower(progress)?' has-new-power':''}`} aria-label="Choose hero power" aria-description={equippedPower?.name} aria-expanded={powerOpen} onClick={() => setPowerOpen(true)}>
                <span className="gallery-power-icon" aria-hidden="true">ϟ</span><strong aria-live="polite">{hasNewHeroPower(progress)?'New hero power available':'Choose Hero Power'}</strong>
              </button>
            </div>
            {readOnly && <small>Starter deck · 30 cards</small>}
          </footer>
        </aside>
        </div>
        </div>
      </section>
      {deckPreview && deckIds.has(deckPreview.key) && !selectedEntry && !powerOpen && !saveOpen && <CardPeek face={deckPreview.face} rect={deckPreview.rect} label={`Deck card: ${deckPreview.face.name}`} />}
      {lockedInfo&&!selectedEntry&&<LockedCardInfo cardId={lockedInfo.key} rect={lockedInfo.rect} onClose={()=>setLockedInfo(null)}/>}
      {saveOpen&&<div className="gallery-power-shade" onPointerDown={event=>{if(event.target===event.currentTarget)setSaveOpen(false);}}>
        <form ref={createPicker} className="gallery-save-dialog" role="dialog" aria-modal="true" aria-label="Create a new deck" onSubmit={event=>{event.preventDefault();if(!deckName.trim()||duplicateName)return;const saved=onPresetCreate(deckName);if(saved){setSaveOpen(false);setDeckPreview(null);setMobileDeckView(true);setDeckNotice('New deck created');}else setSaveError('Could not create the deck. Browser storage is unavailable.');}}>
          <h3>Create a new deck</h3><label>Deck name<input aria-label="Deck name" autoFocus maxLength={60} value={deckName} onChange={event=>setDeckName(event.target.value)}/></label>
          <p>Start with an empty deck. Your other decks keep their cards.</p>
          {duplicateName&&<p role="alert">That name already exists. Choose a different name.</p>}
          {saveError&&<p role="alert">{saveError}</p>}
          <div><button type="button" onClick={()=>setSaveOpen(false)}>Cancel</button><button type="submit" className="primary" disabled={!deckName.trim()||duplicateName}>Create deck</button></div>
        </form>
      </div>}
      {powerOpen && <div className="gallery-power-shade" onPointerDown={event => {if(event.target===event.currentTarget)closePowers();}}>
        <section ref={powerPicker} className="gallery-power-picker" role="dialog" aria-modal="true" aria-label="Choose hero power">
          <header><h3>Hero power</h3><button type="button" aria-label="Close hero power chooser" onClick={closePowers}>×</button></header>
          <HeroPowerChoices botWins={botWins(progress)} selectedPower={progress.selectedHeroPower} onSelect={power => {onHeroPowerChange(power);setPowerOpen(false);}} />
        </section>
      </div>}
      {selectedEntry ? (
        <GalleryDetailModal
          entry={selectedEntry}
          locked={!collection.unlocked.has(selectedEntry.key)}
          onClose={() => setSelectedEntryKey(null)}
          onNavigate={(direction) => {
            const index = sorted.findIndex((entry) => entry.key === selectedEntry.key);
            if (index < 0 || !sorted.length) return;
            const next = sorted[(index + direction + sorted.length) % sorted.length];
            setSelectedEntryKey(next.key);
          }}
        />
      ) : null}
    </div></GalleryPreviewContext.Provider>
  );
}

/** Stable faces retain their artwork while offscreen rendering stays deferred. */
const GalleryCell = memo(function GalleryCell({
  entryKey,
  face,
  mark,
  locked = false,
  onOpen,
  inDeck,
  canAdd,
  onToggle,
  onLocked,
}: {
  entryKey: string;
  face: CardFaceModel;
  fontRevision: number;
  mark: CollectionMark;
  /** Not yet unlocked. Shown, never hidden — see `UnlockHelp`. */
  locked?: boolean;
  onOpen: (entryKey: string) => void;
  inDeck: boolean;
  canAdd: boolean;
  onToggle: (entryKey: string) => void;
  onLocked: (entryKey:string,rect:DOMRect)=>void;
}) {
  const { ref, near, onFocus } = useGalleryVisibility();
  const hold = useRef<{timer:number; x:number; y:number; id:number} | null>(null);
  const heldClick = useRef(false);
  // A scroll cancels a pending hold. The listener exists only while a hold is
  // pending: one per cell, permanently, ran every card's handler on every scroll.
  const cancelHold = useCallback(function cancel() {
    if (!hold.current) return;
    window.clearTimeout(hold.current.timer); hold.current = null;
    document.removeEventListener('scroll', cancel, true);
  }, []);
  useEffect(() => cancelHold, [cancelHold]);
  return (
    <div
      ref={ref}
      onFocus={onFocus}
      className={`gallery-cell mark-${mark}${near ? " is-near" : ""}${locked ? " is-locked" : ""}${inDeck ? " is-in-deck" : ""}`}
      data-mark={mark}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.pointerType === 'mouse') return;
        cancelHold(); heldClick.current = false;
        hold.current = {id:event.pointerId,x:event.clientX,y:event.clientY,timer:window.setTimeout(() => {
          heldClick.current = true; cancelHold(); onOpen(entryKey);
        },1000)};
        document.addEventListener('scroll', cancelHold, true);
      }}
      onPointerMove={event => { const pending=hold.current; if (pending && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>10) {heldClick.current=true;cancelHold();} }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onClickCapture={event => { if (heldClick.current) {event.preventDefault();event.stopPropagation();heldClick.current=false;} }}
    >
      <CardFace card={face} lazyArt quiet interactiveKeywords />
      {inDeck && <span className="gallery-deck-badge" aria-hidden="true">✓ In deck</span>}
      <button type="button" className="gallery-card-add" aria-label={locked?`Unlock requirements for ${face.name}`:`${inDeck ? "Remove" : "Add"} ${face.name}`} aria-pressed={inDeck}
        disabled={!canAdd&&!locked} onClick={event=>locked?onLocked(entryKey,event.currentTarget.getBoundingClientRect()):onToggle(entryKey)} />
      <button type="button" className="gallery-card-name" aria-label={`Open Star Chart for ${face.name}`}
        title={`Open ${face.name} lore`} onClick={() => onOpen(entryKey)} />
      {near && locked ? (
        <span className="gallery-lock" aria-hidden="true">
          {/* An ANTIQUE ORNATE padlock, drawn rather than fetched because it is
              furniture — an icon in the same family as the keyword artwork, not
              a photograph.

              The shape does the work, and the first version got that wrong: a
              plain rounded rectangle with a band and four rivets reads as a
              padlock ICON, the kind of thing a browser puts in an address bar,
              and no amount of extra rivets rescues it. What makes a lock look
              OLD is its silhouette — horns at the four corners, sides that
              pinch inward, a body that comes to a point at the foot — and then
              scrollwork inside that outline.

              Every dark mark is a hole, a groove or a shadow, so the whole
              thing still works as one flat colour over any artwork. */}
          <svg viewBox="0 0 120 152" width="120" height="152">
            {/* shackle, drawn first so the body's shoulders overlap its feet */}
            <path
              d="M34 70V48a26 26 0 0 1 52 0v22"
              fill="none"
              stroke="currentColor"
              strokeWidth="13"
              strokeLinecap="round"
              opacity="0.94"
            />
            <path
              d="M38 66V48a22 22 0 0 1 44 0v18"
              fill="none"
              stroke="rgba(16,12,22,0.28)"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* The body: horns at the four corners, sides that pinch inward, a
                broad foot with only a slight dip.

                The foot was a long spike first and the lock read as a shield or
                a pendant. An antique padlock is WIDE at the bottom — it has to
                hold a mechanism — so the curve is shallow and the corners flare
                out past it. */}
            <path
              fill="currentColor"
              d="M33 63 L16 48 L26 70
                 C11 75 11 84 24 89
                 C11 94 11 103 26 108
                 L16 126 L34 112
                 C40 126 48 132 60 134
                 C72 132 80 126 86 112
                 L104 126 L94 108
                 C109 103 109 94 96 89
                 C109 84 109 75 94 70
                 L104 48 L87 63 Z"
            />

            {/* inner bevel, one step darker, following the same silhouette */}
            <path
              fill="rgba(16,12,22,0.16)"
              d="M37 70 C27 74 27 81 34 87 C27 93 27 100 37 105
                 C43 118 49 124 60 127 C71 124 77 118 83 105
                 C93 100 93 93 86 87 C93 81 93 74 83 70 Z"
            />

            {/* Scrollwork in the SHOULDERS and the HAUNCHES, not around the
                keyhole. Two curls level with the keyhole plus a curve beneath
                it read as a face — eyes and a mouth — which is the one thing an
                ornate lock must not do. Pushed out to the corners they read as
                what they are: iron scrollwork following the body's edge. */}
            <g fill="none" stroke="rgba(16,12,22,0.6)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M41 72 C31 73 28 81 35 84 C40 86 44 82 42 78" />
              <path d="M79 72 C89 73 92 81 85 84 C80 86 76 82 78 78" />
              <path d="M40 105 C31 108 30 117 38 118 C43 118 45 114 43 110" />
              <path d="M80 105 C89 108 90 117 82 118 C77 118 75 114 77 110" />
            </g>

            <g fill="rgba(16,12,22,0.82)">
              {/* screws set into the horns, where a real lock is bolted */}
              <circle cx="27" cy="66" r="2.4" />
              <circle cx="93" cy="66" r="2.4" />
              <circle cx="29" cy="111" r="2.2" />
              <circle cx="91" cy="111" r="2.2" />
              {/* keyhole, cut clean through */}
              <circle cx="60" cy="92" r="7.4" />
              <path d="M55.4 96.5h9.2l2.6 15H52.8z" />
            </g>

            {/* the escutcheon ring the keyhole sits in */}
            <circle cx="60" cy="95" r="13" fill="none" stroke="rgba(16,12,22,0.4)" strokeWidth="1.8" />
          </svg>
        </span>
      ) : null}
    </div>
  );
});

/**
 * What the "?" in the gallery header opens.
 *
 * It exists because every part of this system is invisible from the board: a
 * player who wins a duel sees a pack, and nothing tells them why it held six
 * cards instead of three.
 *
 * A POPUP over the gallery, not a panel pushed in above the grid. The inline
 * version shoved 200 cards down the page to make room for itself, so opening it
 * lost the reader's place in the list and closing it lost it again.
 *
 * It is also down to a table and one line of state. Everything else it used to
 * print — a paragraph of preamble, the reason hotseat pays nothing, a paragraph
 * on how batches are balanced — was true and unread: the table already answers
 * the only question anyone opens this to ask.
 */
function UnlockHelp({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const left = cards.length + relics.length - progress.unlockedIds.length;
  return <div className="help-veil" onClick={onClose}><section className="help-pop" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="help-x" onClick={onClose} aria-label="Close unlocking help">×</button><h3>Unlocking cards</h3>
    <p>Start with 45 available cards, a 30-card deck, and Mend Core. First-time victories unlock the fixed cards listed in each universe.</p>
    <p>Your deck always starts a duel with exactly 30 different unlocked cards. Swap cards in the deck builder from the start.</p>
    <p>Losses, draws, replays and hotseat duels grant no cards.</p>
    <p>Clicking on card title opens their Star Chart.</p>
    <p className="help-state">{progress.unlockedIds.length} cards unlocked{left ? ` · ${left} still to earn` : " · collection complete"}.</p>
  </section></div>;
}

/** How far a card has got in your collection. Ordered weakest to strongest. */
type CollectionMark = "unseen" | "seen" | "played" | "won";

function LockedCardInfo({cardId,rect,onClose}:{cardId:string;rect:DOMRect;onClose:()=>void}) {
  const node=useRef<HTMLElement>(null);
  const chapter=CAMPAIGN_CHAPTERS.find(chapter=>chapter.rewardCardIds.includes(cardId));
  const boss=cards.find(card=>card.id===chapter?.bossId),card=[...cards,...relics].find(card=>card.id===cardId);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!node.current?.contains(event.target as Node))onClose();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopImmediatePropagation();onClose();}};
    window.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key,true);window.addEventListener('scroll',onClose,true);window.addEventListener('resize',onClose);
    return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key,true);window.removeEventListener('scroll',onClose,true);window.removeEventListener('resize',onClose);};
  },[onClose]);
  const width=Math.min(280,innerWidth-20),left=Math.max(10,Math.min(rect.right+12+width<=innerWidth?rect.right+12:rect.left-width-12,innerWidth-width-10));
  const top=Math.max(10,Math.min(rect.top+rect.height*.2,innerHeight-150));
  return createPortal(<section ref={node} className="locked-card-info" role="dialog" aria-label={`Unlock ${card?.name}`} style={{left,top,width}}>
    <button type="button" onClick={onClose} aria-label="Close unlock requirements">×</button><small>Locked card</small><strong>{card?.name}</strong>
    <p>{boss?<>Defeat <b>{boss.name}</b> in {chapter?.universe} to unlock this card.</>:'This card is available from the start.'}</p>
  </section>,document.body);
}
