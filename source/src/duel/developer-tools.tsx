/** Ross mode's developer workbench: board edits, card placement and result previews. */
import { useEffect, useMemo, useState } from "react";
import { hasInfiniteMana } from "../engine/game";
import { ALIGNMENTS, CAMPS, compareCatalogue, isRelicCard, RARITIES, rarityName, RELIC_CAMP_LABEL, RELIC_RARITY } from "../engine/types";
import type { GameState, PlayableCard, PlayerId } from "../engine/types";
import { CardFace, playableFace } from "../card-face";
import type { DeveloperEdit } from "./developer-edits";

export function DeveloperTools({
  screen,
  cards: allCards,
  game,
  viewerId,
  onClose,
  onToggleCheat,
  onUndoTurn,
  canUndoTurn,
  onEdit,
  onShowResult,
  onTestCard,
}: {
  screen: "title" | "playing";
  cards: PlayableCard[];
  game: GameState;
  viewerId: PlayerId;
  onClose: () => void;
  onToggleCheat: () => void;
  onUndoTurn: () => void;
  canUndoTurn: boolean;
  onEdit: (edit: DeveloperEdit) => void;
  onShowResult: (winner: PlayerId | "draw", cardId: string) => void;
  onTestCard: (cardId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(allCards[0]?.id ?? "");
  const [filters, setFilters] = useState({ kind: "all", cost: "all", rarity: "all", camp: "all", alignment: "all" });
  const otherId: PlayerId = viewerId === 0 ? 1 : 0;
  const selected = allCards.find((card) => card.id === selectedId) ?? allCards[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allCards
      .filter((card) => {
        const relic = isRelicCard(card);
        const kind = relic ? "relic" : "minion";
        const cost = card.cost === undefined ? "" : String(card.cost);
        const rarity = relic ? RELIC_RARITY : card.rarity;
        const camp = relic ? RELIC_CAMP_LABEL : card.camp;
        const alignment = relic ? RELIC_RARITY : card.alignment;
        return (
          (!needle || [card.name, card.origin, card.effect, relic ? "relic" : "minion"].join(" ").toLowerCase().includes(needle)) &&
          (filters.kind === "all" || filters.kind === kind) &&
          (filters.cost === "all" || filters.cost === cost) &&
          (filters.rarity === "all" || filters.rarity === rarity) &&
          (filters.camp === "all" || filters.camp === camp) &&
          (filters.alignment === "all" || filters.alignment === alignment)
        );
      })
      // The gallery's order, so a card sits where the player would look for it.
      .sort((left, right) => compareCatalogue(
        { ...left, rarity: isRelicCard(left) ? RELIC_RARITY : left.rarity },
        { ...right, rarity: isRelicCard(right) ? RELIC_RARITY : right.rarity },
        filters.cost !== "all",
      ));
  }, [allCards, filters, query]);

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (selected && filtered.some((card) => card.id === selected.id)) return;
    if (filtered[0]) setSelectedId(filtered[0].id);
  }, [filtered, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="developer-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="developer-panel" role="dialog" aria-modal="true" aria-label="Developer mode">
        <header className="developer-panel-top">
          <div>
            <span className="developer-kicker">Ross access</span>
            <h2>Developer mode</h2>
          </div>
          <button type="button" className="screen-x" onClick={onClose} aria-label="Close developer mode">×</button>
        </header>

        {screen==='playing'&&<div className="developer-controls">
          <div className="developer-control-group dev-mine" aria-label="My cheats"><strong>My side</strong>
            <button type="button" className={`developer-action${hasInfiniteMana(game,viewerId)?' active':''}`} onClick={onToggleCheat}>Infinite mana: {hasInfiniteMana(game,viewerId)?'ON':'OFF'}</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'setCore',owner:viewerId,value:1})}>My Core → 1</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'healCore',owner:viewerId})}>Fully heal my core</button>
            <button type="button" className={`developer-action${game.coreInvincible?.[viewerId]?' active':''}`} onClick={()=>onEdit({kind:'invincibleCore',owner:viewerId})}>{game.coreInvincible?.[viewerId]?'Core invincible: ON':'Make the core invincible'}</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'clearBoard',owner:viewerId})}>Clear my board</button>
          </div>
          <div className="developer-control-group dev-enemy" aria-label="Enemy cheats"><strong>Enemy side</strong>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'setCore',owner:otherId,value:1})}>Enemy Core → 1</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'healCore',owner:otherId})}>Fully heal enemy core</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'clearHand',owner:otherId})}>Remove all enemy cards</button>
            <button type="button" className="developer-action" onClick={()=>onEdit({kind:'clearBoard',owner:otherId})}>Clear enemy board</button>
          </div>
          <div className="developer-control-group dev-neutral"><button type="button" className="developer-action" onClick={onUndoTurn} disabled={!canUndoTurn}>Undo a turn</button></div>
        </div>}

        <div className="developer-workbench">
          <div className="developer-card-list-wrap">
            <label className="developer-search">
              <span>Find any card</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, origin, or effect"
                autoFocus
              />
            </label>
            <div className="developer-filters" aria-label="Card filters">
              <label>
                <span>Type</span>
                <select aria-label="Filter by type" value={filters.kind} onChange={(event) => setFilter("kind", event.target.value)}>
                  <option value="all">All types</option>
                  <option value="minion">Minions</option>
                  <option value="relic">Relics</option>
                </select>
              </label>
              <label>
                <span>Cost</span>
                <select aria-label="Filter by cost" value={filters.cost} onChange={(event) => setFilter("cost", event.target.value)}>
                  <option value="all">Any cost</option>
                  {Array.from(new Set(allCards.map((card) => card.cost).filter((cost): cost is number => cost !== undefined))).sort((a, b) => a - b).map((cost) => (
                    <option key={cost} value={cost}>{cost} mana</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Rarity</span>
                <select aria-label="Filter by rarity" value={filters.rarity} onChange={(event) => setFilter("rarity", event.target.value)}>
                  <option value="all">Any rarity</option>
                  {RARITIES.map((rarity) => <option key={rarity} value={rarity}>{rarityName(rarity)}</option>)}
                  <option value={RELIC_RARITY}>{RELIC_RARITY}</option>
                </select>
              </label>
              <label>
                <span>Camp</span>
                <select aria-label="Filter by camp" value={filters.camp} onChange={(event) => setFilter("camp", event.target.value)}>
                  <option value="all">Any camp</option>
                  {CAMPS.map((camp) => <option key={camp} value={camp}>{camp}</option>)}
                  <option value={RELIC_CAMP_LABEL}>{RELIC_CAMP_LABEL}</option>
                </select>
              </label>
              <label>
                <span>Alignment</span>
                <select aria-label="Filter by alignment" value={filters.alignment} onChange={(event) => setFilter("alignment", event.target.value)}>
                  <option value="all">Any alignment</option>
                  {ALIGNMENTS.map((alignment) => <option key={alignment} value={alignment}>{alignment}</option>)}
                  <option value={RELIC_RARITY}>{RELIC_RARITY}</option>
                </select>
              </label>
            </div>
            <div className="developer-card-list">
              {filtered.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={card.id === selected?.id ? "developer-card-row selected" : "developer-card-row"}
                  onClick={() => setSelectedId(card.id)}
                >
                  <span className="developer-card-mana" aria-label={`${card.cost} mana`}>{card.cost}</span>
                  <span className="developer-card-name">{card.name}</span>
                  <small>{card.origin}</small>
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="developer-inspector">
              <div className="developer-card-preview">
                <CardFace card={playableFace(selected)} />
              </div>
              <div className="developer-card-copy">
                <span className="developer-kicker">Selected card</span>
                <h3>{selected.name}</h3>
                <p>{selected.effect}</p>
                {screen === "title" ? (
                  <button type="button" className="developer-primary" onClick={() => onTestCard(selected.id)}>
                    Start test duel with this card
                  </button>
                ) : (
                  <div className="developer-card-actions">
                    <div className="developer-owned-actions dev-mine-actions">
                      <button type="button" className="developer-secondary dev-mine-action" onClick={()=>onEdit({kind:'giveCard',cardId:selected.id,owner:viewerId})}>Give to my hand</button>
                      {!isRelicCard(selected)?<button type="button" className="developer-secondary dev-mine-action" onClick={()=>onEdit({kind:'placeCard',cardId:selected.id,owner:viewerId})}>Place on my board</button>:<button type="button" className="developer-secondary dev-mine-action" onClick={()=>onEdit({kind:'equipRelic',cardId:selected.id,owner:viewerId})}>Equip on my first minion</button>}
                    </div>
                    <div className="developer-owned-actions dev-enemy-actions">
                      <button type="button" className="developer-secondary dev-enemy-action" onClick={()=>onEdit({kind:'giveCard',cardId:selected.id,owner:otherId})}>Give to enemy hand</button>
                      {!isRelicCard(selected)?<button type="button" className="developer-secondary dev-enemy-action" onClick={()=>onEdit({kind:'placeCard',cardId:selected.id,owner:otherId})}>Place on enemy board</button>:<button type="button" className="developer-secondary dev-enemy-action" onClick={()=>onEdit({kind:'equipRelic',cardId:selected.id,owner:otherId})}>Equip on enemy first minion</button>}
                    </div>
                  </div>
                )}
                {/* OUTSIDE the title/duel split, like the pack buttons above:
                    the result screen is not part of a duel either, and it is
                    reachable normally only by playing one to a particular end.
                    The champion is whichever card is selected here, so this
                    needs no second card picker. */}
                <div className="developer-result">
                  <span className="developer-kicker">Result screen, this card as champion</span>
                  <div className="developer-result-actions">
                    <button
                      type="button"
                      className="developer-secondary dev-mine-action"
                      onClick={() => onShowResult(viewerId, selected.id)}
                      title="Shows this result. An active campaign duel counts toward progression."
                    >
                      I win
                    </button>
                    <button
                      type="button"
                      className="developer-secondary dev-enemy-action"
                      onClick={() => onShowResult(otherId, selected.id)}
                      title="Shows this result. An active campaign duel counts toward progression."
                    >
                      Enemy wins
                    </button>
                    <button
                      type="button"
                      className="developer-secondary"
                      onClick={() => onShowResult("draw", selected.id)}
                      title="Shows this result. An active campaign duel counts toward progression."
                    >
                      Draw
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : <p className="developer-empty">No cards match this search.</p>}
        </div>


      </section>
    </div>
  );
}
