/** Hero plates, Hero Power controls and the GLaDOS protocol warning. */
import { useEffect, useState, type CSSProperties } from "react";
import { heroPowerCost, heroPowerDefinition } from "../engine/hero-powers";
import { STARTING_CORE, type CardLibrary } from "../engine/game";
import { isMinionCard } from "../engine/types";
import type { GameAction, GameState, HeroPowerId, MinionInstance, PlayableCard, PlayerId } from "../engine/types";
import { campAccent, CardFace, playableFace } from "../card-face";
import { ImpactFx } from "./board";
import type { FloatNum, Impact } from "./fx";

export function ProtocolWarningBubble({turns}:{turns:number}) {
  const [visible,setVisible]=useState(true);
  useEffect(()=>{setVisible(true);const timer=setTimeout(()=>setVisible(false),6000);return()=>clearTimeout(timer);},[turns]);
  if(!visible)return null;
  const lines:Record<number,string>={4:'4 turns left. Failure is still an option.',3:'3 turns left. Your odds are not improving.',2:'2 turns left. Do try something intelligent.',1:'1 turn left. This is the part where you disappoint me.'};
  return <span className="protocol-speech" role="status" aria-label={`GLaDOS: ${lines[turns]}`}><b>GLaDOS</b>{lines[turns]}</span>;
}

export function HeroPlate({
  player,
  identity,
  heroPower,
  cheatMode,
  floats,
  impacts,
  enemy = false,
  targetable = false,
  active = false,
  thinking = false,
  revealedHand,
  library,
  onCardPreview,
  onCardPreviewEnd,
  onStrike,
  onBlockedStrike,
  heroPowerCounter,
  protocolWarning = false,
  apexPrey,
}: {
  player: GameState["players"][number];
  identity?: { card: PlayableCard; chapter: number; universe: string };
  heroPower?: HeroPowerId | null;
  cheatMode: boolean;
  floats: FloatNum[];
  impacts: Impact[];
  enemy?: boolean;
  targetable?: boolean;
  /** Holds for the whole turn. The banner is the event, this is the state. */
  active?: boolean;
  /** The practice opponent is mid-move. Only ever true on the enemy plate. */
  thinking?: boolean;
  revealedHand?: string[];
  library?: CardLibrary;
  onCardPreview?: (card: PlayableCard, el: HTMLElement, owner?: PlayerId, instant?: boolean) => void;
  onCardPreviewEnd?: () => void;
  onStrike?: () => void;
  onBlockedStrike?: () => void;
  heroPowerCounter?: string;
  protocolWarning?: boolean;
  apexPrey?:MinionInstance;
}) {
  const wasHit = floats.some((f) => f.delta < 0);
  const classes = [
    "hero-plate",
    identity ? "campaign-hero" : "",
    enemy ? "enemy" : "me",
    wasHit ? "hit" : "",
    // A plate cannot be both the thing you are about to hit and the thing
    // quietly announcing whose turn it is — targetable's red wins.
    active && !targetable ? "active" : "",
    thinking ? "thinking" : "",
    targetable ? "targetable" : "",
    protocolWarning ? "protocol-warning" : "",
    player.heroDivineShield ? "is-shielded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const backs = Math.min(player.hand.length, 10);
  const power = heroPowerDefinition(heroPower);
  const canStrike = enemy && targetable && Boolean(onStrike);
  const strikeHandler = canStrike ? onStrike : onBlockedStrike;
  return (
    <button
      type="button"
      className={classes}
      data-hero={player.id}
      onClick={strikeHandler}
      aria-disabled={strikeHandler ? undefined : true}
      aria-label={enemy && power ? `${player.name}. Hero Power: ${power.name}. ${power.text}` : undefined}
    >
      {enemy && <span className="hero-health-fill" aria-hidden="true" style={{width:`${Math.max(0,Math.min(1,player.health/STARTING_CORE))*100}%`,'--boss-tint':campAccent(identity && isMinionCard(identity.card) ? identity.card.camp : 'Nature')} as CSSProperties} />}
      {/* Light layers that pulse by opacity alone, so the compositor runs them. */}
      {targetable && <span className="hero-plate-pulse" aria-hidden="true" />}
      {wasHit && <span className="hero-plate-flash" aria-hidden="true" />}
      <span className="hero-sigil" title={identity ? identity.card.name : `${player.name}'s sigil`}>
        {identity ? <img className="boss-portrait" src={identity.card.art} alt={`${identity.card.name} portrait`} draggable={false} /> : <HeroSigil playerId={player.id} />}
      </span>
      <span className="hero-name">
        {identity && <span className="boss-chapter" title={identity.universe}>Universe · {identity.universe}</span>}
        <strong>
          {player.name}
          <span className="hero-think" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </strong>
        {power ? <small className="hero-power-label">⚡ {power.name}{heroPowerCounter ? <b className="hero-power-counter">{heroPowerCounter}</b> : null}</small> : null}
      </span>
      {enemy&&apexPrey&&<span className="apex-prey" title={`Apex Duel: ${apexPrey.name} is your highest-ATK minion (${apexPrey.atk} ATK)`} aria-label={`Apex Duel target: ${apexPrey.name}`}><img src={apexPrey.art} alt="" draggable={false}/><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><path d="M20 0v10m0 20v10M0 20h10m20 0h10"/></svg></span>}
      {enemy && revealedHand && library ? (
        <span className="revealed-hand" aria-label="The Watcher reveals this hand">
          {revealedHand.map((cardId, index) => {
            const card = library[cardId];
            return card ? (
              <span
                key={`${cardId}-${index}`}
                className="revealed-hand-card"
                /* No `title`. A native tooltip on a card whose full face is
                   already being shown is a second, worse copy of the same
                   answer, and it arrives on top of the artwork. */
                onMouseEnter={onCardPreview ? (e) => onCardPreview(card, e.currentTarget, undefined, true) : undefined}
                onMouseLeave={onCardPreviewEnd}
              >
                <CardFace card={playableFace(card)} />
              </span>
            ) : null;
          })}
          <em>{revealedHand.length}</em>
        </span>
      ) : enemy ? (
        <span className="hand-backs" title={`${player.hand.length} cards in hand`}>
          {Array.from({ length: backs }, (_, i) => (
            <span key={i} className="card-back" style={{ marginLeft: i === 0 ? 0 : -9 }} />
          ))}
          <em>{player.hand.length}</em>
        </span>
      ) : null}
      {enemy ? (
        <span className="mini-mana" title={cheatMode ? "Infinite mana" : `${player.mana}/${player.maxMana} mana`}>
          {cheatMode ? "∞" : `${player.mana}/${player.maxMana}`}
        </span>
      ) : null}
      <span className="health-gem" title={`Core: ${player.health} health${player.heroDivineShield ? " — Divine Shield" : ""}`}>
        {player.health}
      </span>
      <span className="fx-layer" aria-hidden="true">
        {impacts.map((fx) => (
          <ImpactFx key={fx.id} impact={fx} />
        ))}
      </span>
      {floats.map((f, index) => (
        <span
          key={f.id}
          className={f.delta < 0 ? "float-num hurt" : "float-num heal"}
          style={{ top: `calc(18% + ${index * 18}px)`, "--fd": `${f.delay}s` } as CSSProperties}
        >
          {f.delta < 0 ? f.delta : `+${f.delta}`}
        </span>
      ))}
    </button>
  );
}

export function HeroPowerCard({ definition, cost: liveCost, turnsRemaining }: { definition: ReturnType<typeof heroPowerDefinition>; cost?: number; turnsRemaining?: number }) {
  if (!definition) return null;
  const cost = liveCost ?? heroPowerCost(definition);
  return (
    <aside className="enemy-power-card" id="enemy-hero-power-card" aria-label={`${definition.name}: ${definition.text}`}>
      <div className="enemy-power-card-head">
        <span className="enemy-power-card-cost">{definition.passive ? "∞" : cost}</span>
        <span className="enemy-power-card-title">
          <small>ENEMY HERO POWER</small>
          <strong>⚡ {definition.name}</strong>
        </span>
      </div>
      <p>{definition.text}</p>
      {definition.id === "glados_test_protocol" && turnsRemaining !== undefined ? (
        <small className="enemy-power-card-count">{turnsRemaining} turns remaining</small>
      ) : null}
      <small className="enemy-power-card-foot">{definition.passive ? "Always active" : `Costs ${cost} mana · Once per turn`}</small>
    </aside>
  );
}

export function HeroPowerButton({
  definition,
  cost: liveCost,
  action,
  used,
  onUse,
}: {
  definition: ReturnType<typeof heroPowerDefinition>;
  /** What using it costs right now (a board effect can waive the printed cost). */
  cost?: number;
  action?: GameAction;
  used: boolean;
  onUse: (action: Extract<GameAction, { type: "use_hero_power" }>) => void;
}) {
  if (!definition) return null;
  const cost = liveCost ?? heroPowerCost(definition);
  const usable = action?.type === "use_hero_power" && !used;
  return (
    <button
      type="button"
      className={usable ? "hero-power-button ready" : "hero-power-button"}
      disabled={!usable}
      onClick={() => {
        if (action?.type === "use_hero_power") onUse(action);
      }}
      title={`${definition.text} ${definition.passive ? "Always active." : `Costs ${cost} mana and can be used once per turn.`}`}
    >
      <span className="hero-power-cost">{definition.passive ? "∞" : cost}</span>
      <span className="hero-power-copy">
        <strong>⚡ {definition.name}</strong>
        <small>{used ? "Used this turn" : definition.text}</small>
      </span>
    </button>
  );
}

/**
 * A player's permanent heraldry. Player One is the convergent star — rays drawn
 * inward to a single point. Player Two is the eclipse — a broken ring around a
 * dark core. Fixed for the whole game: a hero is never a picture of a minion.
 */
function HeroSigil({ playerId }: { playerId: PlayerId }) {
  if (playerId === 0) {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="sigil-field" cx="20" cy="20" r="19" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line key={deg} className="sigil-ray" x1="20" y1="20" x2="20" y2="3" transform={`rotate(${deg} 20 20)`} />
        ))}
        <polygon className="sigil-core" points="20,9 27,20 20,31 13,20" />
        <circle className="sigil-pip" cx="20" cy="20" r="2.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle className="sigil-field" cx="20" cy="20" r="19" />
      <circle className="sigil-ring" cx="20" cy="20" r="13" />
      <circle className="sigil-ring inner" cx="20" cy="20" r="8.5" />
      <path className="sigil-shard" d="M20 3 L25 14 L20 20 L15 14 Z" />
      <path className="sigil-shard" d="M20 37 L15 26 L20 20 L25 26 Z" />
      <circle className="sigil-void" cx="20" cy="20" r="5" />
    </svg>
  );
}
