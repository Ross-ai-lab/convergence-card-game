/** The two board rows, their slot auras and the motion wrappers around live minions. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GameAction, GameState, MinionInstance, PendingTarget, PlayerId, RelicInstance, SlotAuraId } from "../engine/types";
import { CardFace, relicFace } from "../card-face";
import type { FloatNum, Ghost, Impact, Lunge, Particle, RelicFlash, TauntFlash } from "./fx";
import type { PointerStore, ScreenPoint } from "../pointer-store";

export type Selection =
  | { kind: "hand"; handIndex: number }
  | { kind: "attacker"; slotIndex: number }
  | null;

function attachedRelics(minion: MinionInstance): Array<{ relic: RelicInstance; index: number }> {
  return [
    { relic: minion.relic, index: 0 },
    { relic: minion.relic2 ?? null, index: 1 },
  ].filter((entry): entry is { relic: RelicInstance; index: number } => entry.relic !== null);
}

// Slot auras are permanent, so the board wears both their label and colour.
const AURA_LABEL: Record<SlotAuraId, string> = {
  random_attacks: "RANDOM",
  slot_silence: "SILENCED",
  slot_chain: "CHAINED",
  slot_grow_1: "+1/+1",
  slot_grow_2: "+2/+2",
  slot_protected: "SAFE",
  slot_stats_one: "1/1",
  slot_bound: "LOCKED",
};

const AURA_TEXT: Record<SlotAuraId, string> = {
  random_attacks: "a minion here can only attack at random",
  slot_silence: "a minion here is silenced",
  slot_chain: "a minion here is permanently Chained",
  slot_grow_1: "a minion here gains +1/+1 at the start of your turn",
  slot_grow_2: "a minion here gains +2/+2 at the start of your turn",
  slot_protected: "minions here resist Silence, Freeze, and Chain; attacks and ordinary removal can still reach them",
  slot_stats_one: "minions here are permanently set to 1/1",
  slot_bound: "this slot cannot hold minions for the rest of the game",
};
/** Each permanent board-slot effect gets its own visible ring colour. */
const AURA_COLOR: Record<SlotAuraId, string> = {
  random_attacks: "#f0c767",
  slot_silence: "#b47cff",
  slot_chain: "#6ed7ff",
  slot_grow_1: "#ff8a65",
  slot_grow_2: "#35d6c2",
  slot_protected: "#52b6ff",
  slot_stats_one: "#ff5f6d",
  slot_bound: "#ff526f",
};

/**
 * Every minion the hovered one is currently reaching, by instance id.
 *
 * A REVERSE LOOKUP over live state, not a reading of card text. The engine
 * already writes down who is paying whom — an aura bonus records the source
 * that granted it, a shield records the source holding it up, a mark records
 * who set it — because it has to take those things back when the source dies.
 * Nothing here re-derives an effect: it asks the board who is on the hook, and
 * a minion whose text has not actually landed on anybody lights up nothing,
 * which is the honest answer.
 */
export function reachOf(game: GameState, source: MinionInstance): Set<string> {
  const reached = new Set<string>();
  const id = source.instanceId;
  for (const player of game.players) {
    for (const minion of player.board) {
      if (!minion || minion.instanceId === id) continue;
      const touched =
        (minion.auraBonuses ?? []).some((bonus) => bonus.sourceId === id) ||
        (minion.divineShieldAuraSources ?? []).includes(id) ||
        (minion.passiveSilenceSources ?? []).includes(id) ||
        minion.markedBy === id ||
        minion.stolenPassiveFrom === id;
      if (touched) reached.add(minion.instanceId);
    }
  }
  // Two the source itself records, rather than the target: a slot it is holding
  // safe, and a shot it has already lined up.
  if (source.protectedByMeleoron) reached.add(source.protectedByMeleoron);
  if (source.deathStarTarget?.kind === "minion") reached.add(source.deathStarTarget.instanceId);
  return reached;
}

/** Replay a wrapper's motion without rebuilding its decoded card and observers. */
function ReplayMotion({sequence,className,style,children,animationName}:{sequence?:number;className:string;style?:CSSProperties;children:ReactNode;animationName?:string}) {
  const node=useRef<HTMLDivElement>(null);
  const previous=useRef<{sequence?:number;className:string}>({className:""});
  useLayoutEffect(()=>{
    const last=previous.current;
    previous.current={sequence,className};
    // A new CSS animation starts itself. Querying it before paint forces a
    // separate style/layout pass for every minion hit by the same effect.
    if(sequence===undefined||last.sequence===undefined||last.className!==className)return;
    for(const animation of node.current?.getAnimations({subtree:Boolean(animationName)})??[]){
      if(!animationName||(animation as CSSAnimation).animationName===animationName){animation.currentTime=0;animation.play();}
    }
  },[sequence,className,animationName]);
  return <div ref={node} className={className} style={style}>{children}</div>;
}

/**
 * Departures from one action begin on successive frames, one card each. Every
 * death restyles and relays out its own card (about 7 ms), so seven at once was
 * a single ~110 ms frame; spread out, a board wipe ripples across a tenth of a
 * second. Until its frame, a departing card looks exactly as it did alive.
 */
function useDepartureRipple(ghosts: Ghost[]): (ghost: Ghost) => boolean {
  const latest = ghosts.reduce((batch, ghost) => Math.max(batch, ghost.batch), -1);
  const last = ghosts.reduce((order, ghost) => (ghost.batch === latest ? Math.max(order, ghost.order) : order), 0);
  const [ripple, setRipple] = useState({ batch: -1, step: 0 });
  const step = ripple.batch === latest ? ripple.step : 0;
  useEffect(() => {
    if (latest < 0 || step >= last) return;
    const frame = requestAnimationFrame(() => setRipple({ batch: latest, step: step + 1 }));
    return () => cancelAnimationFrame(frame);
  }, [latest, step, last]);
  return (ghost) => ghost.batch !== latest || ghost.order <= step;
}

export function BoardRow({
  owner,
  label,
  game,
  legalActions,
  viewerId,
  pendingTarget,
  selection,
  tauntFlash,
  onSlot,
  ghosts,
  floats,
  impacts,
  lunge,
  onPreview,
  onPreviewEnd,
  onRelicPreview,
  onRelicPress,
  relicFlash,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  reach,
}: {
  owner: PlayerId;
  label: string;
  game: GameState;
  legalActions: GameAction[];
  /** Whose side of the table this is drawn from — not necessarily whose turn it is. */
  viewerId: PlayerId;
  pendingTarget: PendingTarget | null;
  selection: Selection;
  tauntFlash: TauntFlash;
  onSlot: (owner: PlayerId, slotIndex: number) => void;
  ghosts: Ghost[];
  floats: FloatNum[];
  impacts: Impact[];
  lunge: Lunge;
  onPreview: (minion: MinionInstance, el: HTMLElement) => void;
  onPreviewEnd: () => void;
  onRelicPreview: (relic: RelicInstance, el: HTMLElement) => void;
  onRelicPress: (event: React.PointerEvent<HTMLElement>, relic: RelicInstance) => void;
  relicFlash: RelicFlash | null;
  onDragStart: (e: React.PointerEvent<HTMLElement>, slotIndex: number, canAttack: boolean) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: (e: React.PointerEvent) => void;
  onDragCancel: () => void;
  /** Instance ids the hovered minion is currently affecting. */
  reach: ReadonlySet<string>;
}) {
  const departed = useDepartureRipple(ghosts);
  return (
    <div className="board-row" aria-label={label} data-side={owner === viewerId ? "Your board" : "Opponent's board"}>
      {game.players[owner].board.map((minion, slotIndex) => {
        const canPlace =
          selection?.kind === "hand" &&
          owner === viewerId &&
          legalActions.some(
            (action) =>
              (action.type === "play_card" || action.type === "play_relic") && action.slotIndex === slotIndex,
          );
        const canTarget =
          selection?.kind === "attacker" &&
          owner !== viewerId &&
          legalActions.some((action) => action.type === "attack_minion" && action.targetSlot === slotIndex);
        const canAttack =
          owner === viewerId &&
          minion &&
          legalActions.some(
            (action) =>
              (action.type === "attack_minion" || action.type === "attack_core") && action.attackerSlot === slotIndex,
          );
        const armed = selection?.kind === "attacker" && owner === viewerId && selection.slotIndex === slotIndex;
        const tauntFlashing = Boolean(minion && tauntFlash?.instanceIds.includes(minion.instanceId));
        const isLunging = lunge !== null && lunge.owner === owner && lunge.slot === slotIndex;
        // A targeted effect is waiting: only its legal victims light up, and the
        // highlight reads differently from an attack target on purpose.
        // "slot" prompts point at a POSITION, so empty slots are choosable too.
        const boardPrompt =
          pendingTarget !== null &&
          (pendingTarget.kind === "board" || pendingTarget.kind === "slot" || pendingTarget.kind === "boardOrCore")
            ? pendingTarget
            : null;
        const auras = game.players[owner].slotAuras.filter((aura) => aura.slot === slotIndex);
        const auraColors = auras.map((aura) => AURA_COLOR[aura.auraId]);
        const auraStyle = auraColors.length
          ? ({
              "--slot-aura-primary": auraColors[0],
              "--slot-aura-rings": auraColors
                .map((color, index) => `0 0 0 ${2 + index * 3}px ${color}`)
                .join(", "),
            } as CSSProperties)
          : undefined;
        const canBeChosen =
          boardPrompt !== null &&
          boardPrompt.options.some((option,index) => option.owner === owner && option.slot === slotIndex && legalActions.some(action=>action.type==='choose_target'&&action.choiceIndex===index));
        const slotGhosts = ghosts.filter((g) => g.owner === owner && g.slot === slotIndex);
        // A departure still waiting for its frame keeps the slot exactly as it was.
        const departureWaiting = slotGhosts.some((g) => !departed(g));
        const classes = [
          "board-slot",
          minion || departureWaiting ? "occupied" : "empty",
          auras.length ? "has-slot-aura" : "",
          auras.some((aura) => aura.auraId === "slot_bound") ? "slot-is-bound" : "",
          canPlace ? "placeable" : "",
          canTarget ? "targetable" : "",
          canAttack ? "ready" : "",
          armed ? "armed" : "",
          tauntFlashing ? "taunt-flashing" : "",
          isLunging ? "striking" : "",
          canBeChosen ? "choosable" : "",
          boardPrompt !== null && !canBeChosen ? "dimmed" : "",
          // Only the minions being AFFECTED are ringed. The source used to be
          // ringed too, more brightly, and that was the wrong read: the source
          // is the one you are already pointing at, so marking it says nothing
          // and puts a fifth ring on a board that has four. Owner's ruling,
          // 3 September 2026.
          minion && reach.has(minion.instanceId) ? "in-reach" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const slotFloats = floats.filter((f) => f.owner === owner && f.slot === slotIndex);
        const slotImpacts = impacts.filter((fx) => fx.owner === owner && fx.slot === slotIndex);
        // Motion replays on the wrapper; the card stays mounted through impacts.
        const kinetic = slotImpacts.filter((fx) => fx.kind === "hit" || fx.kind === "freeze");
        const lastKinetic = kinetic.length ? kinetic[kinetic.length - 1] : null;
        const joltClasses = [
          "jolt-wrap",
          kinetic.some((fx) => fx.kind === "hit") ? "jolting" : "",
          kinetic.some((fx) => fx.kind === "freeze") ? "frosting" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div className="board-cell" key={slotIndex}>
          <button
            type="button"
            key={slotIndex}
            className={classes}
            style={auraStyle}
            data-slot={`${owner}-${slotIndex}`}
            data-instance={minion?.instanceId}
            aria-label={minion ? `${minion.name}, ${minion.atk} attack, ${minion.hp} health${canAttack ? ", ready to attack" : ""}` : `Empty slot ${slotIndex + 1}`}
            onClick={() => onSlot(owner, slotIndex)}
            onPointerDown={(e) => onDragStart(e, slotIndex, Boolean(canAttack))}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragCancel}
            onMouseEnter={minion ? (e) => onPreview(minion, e.currentTarget) : undefined}
            onMouseLeave={minion ? onPreviewEnd : undefined}
          >
            {/* Keep a departing body's card mounted; only its motion changes.
                Rebuilding every death face made board-wide clears decode/layout
                a second board just as the impact animation was starting. */}
            {[...(minion?[{body:minion,ghost:null as Ghost|null,gone:false}]:[]),...slotGhosts.map(ghost=>({body:ghost.minion,ghost,gone:departed(ghost)}))].map(({body,ghost,gone})=>(
              <ReplayMotion key={body.instanceId}
                sequence={!ghost&&tauntFlashing?tauntFlash?.id:undefined} animationName="taunt-blocker-flash"
                className={ghost&&gone?`minion-wrap ghost-wrap ${ghost.motion==='stasis'?'stasis':ghost.motion==='return'?`returning ${ghost.destinationOwner===viewerId?'returning-down':'returning-up'}`:'dying'}`:'minion-wrap'}
                style={ghost&&gone?({'--fd':`${ghost.delay}s`} as CSSProperties):undefined}>
                <ReplayMotion
                  sequence={!ghost&&isLunging&&lunge?lunge.id:undefined}
                  className={!ghost&&isLunging?'lunge-wrap lunging':'lunge-wrap'}
                  style={!ghost&&isLunging&&lunge?({'--lx':`${lunge.dx}px`,'--ly':`${lunge.dy}px`} as CSSProperties):undefined}>
                  <ReplayMotion sequence={!ghost?lastKinetic?.id:undefined}
                    className={!ghost?joltClasses:'jolt-wrap'}
                    style={!ghost&&lastKinetic?({'--fd':`${lastKinetic.delay}s`} as CSSProperties):undefined}>
                    <MinionFace minion={body}
                      board={!ghost?game.players[owner].board:undefined}
                      allBoard={!ghost?game.players.flatMap(player=>player.board):undefined}
                      onRelicPreview={!ghost?onRelicPreview:undefined}
                      onRelicPress={!ghost?onRelicPress:undefined}
                      onRelicPreviewEnd={!ghost?onPreview:undefined}/>
                    {!ghost&&relicFlash?.instanceId===body.instanceId?<RelicPopup key={relicFlash.id} flash={relicFlash}/>:null}
                  </ReplayMotion>
                </ReplayMotion>
                {ghost&&gone?(ghost.motion==='stasis'?<StasisBurst particles={ghost.particles}/>:ghost.motion==='return'?<ReturnBurst/>:<DeathBurst particles={ghost.particles}/>):null}
              </ReplayMotion>
            ))}
            {auras.length ? (
              <span className="slot-auras" aria-hidden="true">
                {auras.map((aura) => (
                  <span
                    key={aura.auraId}
                    className={`slot-aura ${aura.auraId}`}
                    title={`${aura.sourceName} marked this slot permanently: ${AURA_TEXT[aura.auraId]}`}
                  >
                    {AURA_LABEL[aura.auraId]}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="fx-layer" aria-hidden="true">
              {slotImpacts.map((fx) => (
                <ImpactFx key={fx.id} impact={fx} />
              ))}
            </span>
            {slotFloats.map((f, index) => (
              <span
                key={f.id}
                className={f.delta < 0 ? "float-num hurt" : "float-num heal"}
                style={{ top: `calc(30% + ${index * 20}px)`, "--fd": `${f.delay}s` } as CSSProperties}
              >
                {f.delta < 0 ? f.delta : `+${f.delta}`}
              </span>
            ))}
          </button>
          </div>
        );
      })}
    </div>
  );
}

export function ImpactFx({ impact }: { impact: Impact }) {
  const campClass = impact.camp ? ` camp-${impact.camp.toLowerCase()}` : "";
  return (
    <span
      className={`impact impact-${impact.kind}${campClass}`}
      style={{ "--fd": `${impact.delay}s` } as CSSProperties}
    >
      <span className="impact-core" />
      {/* The camp's signature: a rune ring for Magic, a rising bloom for Nature,
          a snapping bracket for Tech, and a compass for ALL. Drawn in CSS, so
          it costs no asset. */}
      {impact.camp ? <span className="camp-sigil" /> : null}
      {impact.particles.map((p) => (
        <i
          key={p.key}
          className={`p p-${impact.kind}`}
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--ps": `${p.size}px`,
              "--pd": `${p.delay}s`,
              "--pr": `${p.rot}deg`,
              "--pt": `${p.dur}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function DeathBurst({ particles }: { particles: Particle[] }) {
  return (
    <span className="death-burst" aria-hidden="true">
      <span className="death-flash" />
      <span className="death-ring death-ring-one" />
      {particles.map((p) => (
        <i
          key={p.key}
          className="p p-death"
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--ps": `${p.size}px`,
              "--pd": `${p.delay}s`,
              "--pr": `${p.rot}deg`,
              "--pt": `${p.dur}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function ReturnBurst() {
  return (
    <span className="return-burst" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function StasisBurst({ particles }: { particles: Particle[] }) {
  return (
    <span className="stasis-burst" aria-hidden="true">
      <span className="stasis-ring stasis-ring-one" />
      <span className="stasis-ring stasis-ring-two" />
      {particles.map((p) => (
        <i
          key={p.key}
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--ps": `${p.size}px`,
              "--pd": `${p.delay}s`,
              "--pr": `${p.rot}deg`,
              "--pt": `${p.dur}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** A curve that lifts with its length, from the source to the pointer. */
function arrowGeometry(from: ScreenPoint, to: ScreenPoint): { path: string; head: string } {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(90, dist * 0.28);
  const cx = from.x + (to.x - from.x) / 2;
  const cy = from.y + (to.y - from.y) / 2 - lift;
  const angle = (Math.atan2(to.y - cy, to.x - cx) * 180) / Math.PI;
  return { path: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`, head: `translate(${to.x} ${to.y}) rotate(${angle})` };
}

/**
 * The targeting arrow, from its source to the live pointer. It follows the
 * pointer store directly, rewriting two attributes per frame, so aiming never
 * re-renders the duel.
 */
export function FollowingArrow({ from, pointer }: { from: ScreenPoint; pointer: PointerStore }) {
  const path = useRef<SVGPathElement>(null);
  const head = useRef<SVGGElement>(null);
  const initial = arrowGeometry(from, pointer.get() ?? from);
  useLayoutEffect(() => {
    const draw = () => {
      const geometry = arrowGeometry(from, pointer.get() ?? from);
      path.current?.setAttribute("d", geometry.path);
      head.current?.setAttribute("transform", geometry.head);
    };
    draw();
    return pointer.subscribe(draw);
  }, [from, pointer]);
  return (
    <svg className="target-arrow" aria-hidden="true">
      <path ref={path} className="arrow-path" d={initial.path} />
      <g ref={head} transform={initial.head}>
        <polygon className="arrow-head" points="-6,-13 22,0 -6,13" />
      </g>
    </svg>
  );
}

function RelicPopup({ flash }: { flash: RelicFlash }) {
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const place = () => {
      const bearer = document.querySelector<HTMLElement>(`[data-instance="${flash.instanceId}"]`);
      if (!bearer) return;
      const rect = bearer.getBoundingClientRect();
      const width = Math.min(240, window.innerWidth - 24, (window.innerHeight - 24) * 5 / 7);
      const height = width * 7 / 5;
      const right = rect.right + 12;
      const left = right + width <= window.innerWidth - 12 ? right : rect.left - width - 12;
      setPosition({ width, height, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - 12)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [flash.instanceId]);
  // Escape board transforms, stacking contexts and board-only card sizing.
  return createPortal(<div className="relic-play-flash" data-bearer={flash.instanceId} style={position} aria-hidden="true">
    <CardFace card={relicFace(flash.relic)} />
  </div>, document.body);
}

function MinionFace({
  minion,
  board,
  allBoard,
  onRelicPreview,
  onRelicPress,
  onRelicPreviewEnd,
}: {
  minion: MinionInstance;
  board?: Array<MinionInstance | null>;
  allBoard?: Array<MinionInstance | null>;
  /** Hovering the relic badge swaps the preview to the relic's own card. */
  onRelicPreview?: (relic: RelicInstance, el: HTMLElement) => void;
  onRelicPress?: (event: React.PointerEvent<HTMLElement>, relic: RelicInstance) => void;
  /** Leaving it puts the minion back under the pointer, so the preview never
   *  goes blank while the pointer is still inside the slot. */
  onRelicPreviewEnd?: (minion: MinionInstance, el: HTMLElement) => void;
}) {
  const atkClass = statClass(minion.atk, minion.baseAtk);
  const hpClass = minion.hp < minion.maxHp ? "is-hurt" : statClass(minion.maxHp, minion.baseHp);
  return (
    <>
      <CardFace
        card={minion}
        onBoard
        states={minionStates(minion, board, allBoard)}
        atkClass={atkClass}
        hpClass={hpClass}
        effect={minion.silenced ? "" : minion.effect}
      />
      {attachedRelics(minion).map(({ relic, index }) => (
        <span
          key={`${relic.id}-${index}`}
          role={onRelicPress ? 'button' : undefined}
          aria-label={`Inspect equipped ${relic.name}`}
          onPointerDown={onRelicPress ? event => { event.stopPropagation(); event.preventDefault(); onRelicPress(event, relic); } : undefined}
          onClick={onRelicPress ? event => { event.stopPropagation(); event.preventDefault(); } : undefined}
          onContextMenu={event => event.preventDefault()}
          className={[
            "relic-badge",
            `relic-badge-${index}`,
            onRelicPreview ? "peekable" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseEnter={
            onRelicPreview
              ? (e) => {
                  e.stopPropagation();
                  onRelicPreview(relic, e.currentTarget);
                }
              : undefined
          }
          onMouseLeave={
            onRelicPreviewEnd
              ? (e) => {
                  e.stopPropagation();
                  onRelicPreviewEnd(minion, e.currentTarget.parentElement ?? e.currentTarget);
                }
              : undefined
          }
        >
          <img src={relic.art} alt="" draggable={false} />
        </span>
      ))}
    </>
  );
}

/**
 * Live conditions as classes, so the CARD shows them — a stone barrier for
 * Taunt, a gold rim for Divine Shield, ice for Frozen. There is deliberately no
 * badge or chip anywhere: the artwork does the talking, the way it should.
 */
export function minionStates(
  minion: MinionInstance,
  board?: Array<MinionInstance | null>,
  allBoard?: Array<MinionInstance | null>,
): string[] {
  const effectIds = new Set([minion.effectId, ...minion.gainedEffects.map((effect) => effect.effectId)]);
  const effectsActive = !minion.silenced && minion.chained === 0;
  const otherGood = board?.some((other) => other && other.instanceId !== minion.instanceId && other.alignment === "Good") ?? false;
  const activeInvulnerable =
    effectsActive &&
    (effectIds.has("invuln_if_alone")
      ? (board?.filter(Boolean).length ?? 1) <= 1
      : effectIds.has("invuln_with_good_ally")
        ? otherGood
        : effectIds.has("invulnerable_if_frozen")
          ? (allBoard ?? board)?.some((other) => other?.frozen) ?? false
          : false);
  return [
    minion.sleeping ? "is-sleeping" : "",
    minion.chained > 0 ? "is-chained" : "",
    minion.frozen ? "is-frozen" : "",
    minion.silenced ? "is-silenced" : "",
    minion.divineShield && !minion.silenced ? "is-shielded" : "",
    activeInvulnerable ? "is-invulnerable" : "",
    minion.attackLocked || minion.techAttackSuppressed || (!minion.silenced && minion.keywords.includes("Cannot Attack"))
      ? "is-locked"
      : "",
    minion.markedBy || minion.markedForDeathAtTurn !== null && minion.markedForDeathAtTurn !== undefined ? "is-marked" : "",
    minion.campImmunity ? "is-adapted" : "",
  ].filter(Boolean);
}

export function statClass(current: number, base: number): string {
  if (current > base) return "is-buffed";
  if (current < base) return "is-hurt";
  return "";
}

/** Whether the armed attacker may strike the enemy core. */
export function canAttackCore(legalActions: GameAction[], selection: Selection): boolean {
  return (
    selection?.kind === "attacker" &&
    legalActions.some((action) => action.type === "attack_core" && action.attackerSlot === selection.slotIndex)
  );
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}
