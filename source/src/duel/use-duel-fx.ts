/**
 * Every transient duel effect and the state that drives it.
 *
 * All of it is view-only: `spawnFx` diffs the state before and after an action
 * and turns the difference into floating numbers, death ghosts, impacts, card
 * flights, mana crystals and the attacker lunge. The engine never sees any of it.
 */
import { useEffect, useRef, useState } from "react";
import { sfx, type SfxName } from "../audio/sfx";
import { shouldPlayCardTheme } from "../audio/card-theme-policy";
import { hasInfiniteMana } from "../engine/game";
import { remainingDeckCount } from "../engine/draw-piles";
import { isThemedTokenId } from "../engine/tokens";
import { rarityRank, TOP_RARITY } from "../engine/types";
import type { Camp, GameAction, GameEvent, GameState, MinionInstance, PlayerId } from "../engine/types";
import { relicLibrary } from "../card-face";
import { otherPlayer } from "./board";
import {
  budgetParticles,
  HEAVY_LANDING_COST,
  heavyLandingWeight,
  makeParticles,
  RELIC_PLAY_FLASH_DURATION_MS,
  STRIKE_DELAY,
  type BoardToast,
  type Flight,
  type FloatNum,
  type Ghost,
  type Impact,
  type ImpactKind,
  type Lunge,
  type ManaFx,
  type RelicFlash,
  type TauntFlash,
} from "./fx";

export type TurnBanner = { id: number; text: string; mine: boolean };

export function useDuelFx(viewerId: PlayerId, opponentId: PlayerId) {
  const fxId = useRef(1);
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [impacts, setImpacts] = useState<Impact[]>([]);
  const [lunge, setLunge] = useState<Lunge>(null);
  const [relicFlashes, setRelicFlashes] = useState<RelicFlash[]>([]);
  const relicFlash = relicFlashes[0] ?? null;
  useEffect(() => {
    if (!relicFlash) return;
    const timer = window.setTimeout(() => setRelicFlashes(items => items.filter(item => item.id !== relicFlash.id)), RELIC_PLAY_FLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [relicFlash]);
  const [toast, setToast] = useState<BoardToast | null>(null);
  const [shaking, setShaking] = useState(false);
  /**
   * How hard the table is currently dropping, 0 for not at all.
   *
   * A 6-mana-or-dearer body has just landed, and the table takes a short slow
   * drop rather than the fast rattle a core hit gets. Deliberately its own state
   * and not a reuse of `shaking` — a heavy arrival and a punch in the core are
   * different events and must not animate the same way. A NUMBER rather than a
   * flag, because the drop scales with the cost of what landed.
   */
  const [landing, setLanding] = useState(0);
  /** Cards in flight from the deck pile. Measured off the real elements. */
  const [flights, setFlights] = useState<Flight[]>([]);
  /** The rift answering an arrival or a death. A counter, so each one remounts. */
  const [riftFlare, setRiftFlare] = useState(0);
  /** Crystals just spent, or just refilled. */
  const [manaFx, setManaFx] = useState<ManaFx>(null);
  const [banner, setBanner] = useState<TurnBanner | null>(null);
  const [tauntFlash, setTauntFlash] = useState<TauntFlash>(null);
  /** Non-zero for the moment the killing blow lands, keyed so it replays. */
  const [lethal, setLethal] = useState(0);

  // The crystal animation is a one-shot; letting it sit in state would re-apply
  // its classes to whatever pips happen to be in that range on a later turn.
  useEffect(() => {
    if (!manaFx) return;
    const timer = window.setTimeout(() => setManaFx((cur) => (cur && cur.id === manaFx.id ? null : cur)), 950);
    return () => window.clearTimeout(timer);
  }, [manaFx]);

  /** A fresh id for anything keyed so it remounts: effects, banners, cues, alerts. */
  function nextId(): number {
    return fxId.current++;
  }

  /** Drops every running effect. The killing-blow flash is kept unless a new duel starts. */
  function clear({ newDuel = false } = {}) {
    setFloats([]);
    setGhosts([]);
    setImpacts([]);
    setLunge(null);
    setRelicFlashes([]);
    setToast(null);
    setFlights([]);
    setManaFx(null);
    setBanner(null);
    setTauntFlash(null);
    if (newDuel) setLethal(0);
  }

  /** Sends the already-dealt opening hand out of the deck in a single deal. */
  function spawnOpeningDeal(handCount: number, enemyHandCount: number) {
    const pile = document.querySelector<HTMLElement>(".deck-pile");
    const pileBox = pile?.getBoundingClientRect();
    if (!pileBox) return;

    const startX = pileBox.left + pileBox.width / 2 - 27;
    const startY = pileBox.top + pileBox.height / 2 - 37;
    const myTargets = Array.from(document.querySelectorAll<HTMLElement>(".hand-card"));
    const enemyTarget = document.querySelector<HTMLElement>(`[data-hero="${opponentId}"]`);
    const targetBox = enemyTarget?.getBoundingClientRect();
    const flights: Flight[] = [];

    const addFlight = (target: DOMRect, mine: boolean, delayMs: number) => {
      flights.push({
        id: fxId.current++,
        fx0: startX,
        fy0: startY,
        fx1: target.left + target.width / 2 - 27,
        fy1: target.top + target.height / 2 - 37,
        mine,
        opening: true,
        delayMs,
      });
    };

    myTargets.slice(0, handCount).forEach((card, index) => {
      addFlight(card.getBoundingClientRect(), true, index * 630);
    });

    if (targetBox) {
      Array.from({ length: enemyHandCount }, (_, index) => {
        addFlight(targetBox, false, 330 + index * 630);
      });
    }

    if (!flights.length) return;
    setFlights((current) => [...current, ...flights]);
    flights.forEach((flight) => sfx.play("draw", (flight.delayMs ?? 0) / 1000));
    const ids = new Set(flights.map((flight) => flight.id));
    window.setTimeout(() => setFlights((current) => current.filter((flight) => !ids.has(flight.id))), 6_300);
  }

  /** The opening ceremony was skipped; its card flights go with it. */
  function clearFlights() {
    setFlights([]);
  }

  // Diff previous vs next state and spawn all transient FX for this action:
  // floating numbers, death ghosts, per-card impacts and the attacker lunge.
  function spawnFx(prev: GameState, next: GameState, action: GameAction, resultEvents: GameEvent[]) {
    const isStrike = action.type === "attack_minion" || action.type === "attack_core";
    const strikeDelay = isStrike ? STRIKE_DELAY : 0;
    const newFloats: FloatNum[] = [];
    const newGhosts: Ghost[] = [];
    const newImpacts: Impact[] = [];
    let heroWasHit = false;
    let heavyLanding = 0;

    // Stacked sounds get nudged apart so a big turn reads as a volley of hits
    // rather than one smeared blob.
    let soundSlot = 0;
    const addImpact = (
      owner: PlayerId,
      slot: number | "hero",
      kind: ImpactKind,
      delay: number,
      soundOverride?: SfxName,
      camp?: Camp,
    ) => {
      newImpacts.push({ id: fxId.current++, owner, slot, kind, delay, particles: makeParticles(kind, camp), camp });
      const name: SfxName =
        soundOverride ??
        (slot === "hero" && kind === "hit"
          ? "heroHit"
          : kind === "shield"
            ? "shieldBreak"
            : kind === "summon"
              ? "minionLand"
              : kind);
      sfx.play(name, delay + soundSlot * 0.035);
      soundSlot++;
    };

    if (isStrike) sfx.play("attack");

    const before = new Map<string, { owner: PlayerId; slot: number; minion: MinionInstance }>();
    prev.players.forEach((p) =>
      p.board.forEach((m, slot) => {
        if (m) before.set(m.instanceId, { owner: p.id, slot, minion: m });
      }),
    );
    const after = new Map<string, { owner: PlayerId; slot: number; minion: MinionInstance }>();
    next.players.forEach((p) =>
      p.board.forEach((m, slot) => {
        if (m) after.set(m.instanceId, { owner: p.id, slot, minion: m });
      }),
    );
    const returningOwners = new Map<string, PlayerId>();
    const stasisIds = new Set<string>();
    resultEvents.forEach((event) => {
      if (event.motion === "return" && event.instanceId && event.player !== undefined) {
        returningOwners.set(event.instanceId, event.player);
      }
      if (event.motion === "stasis" && event.instanceId) stasisIds.add(event.instanceId);
    });
    // Equipping a relic is a deliberate power-spike moment, not a
    // normal card-play click. The relic's own universe theme replaces the old
    // one-size-fits-all fanfare; generated/effect-driven equips carry cardId too.
    const equippedRelicId = resultEvents.find(
      (event) => event.kind === "effect" && /\bequips\b/i.test(event.text) && event.cardId?.startsWith("r"),
    )?.cardId;
    if (equippedRelicId) sfx.playCardTheme(equippedRelicId, 0.05);
    else if (resultEvents.some((event) => event.kind === "effect" && /\bequips\b/i.test(event.text))) sfx.play("relicEquip", 0.05);

    // An enemy relic is easy to miss because its card vanishes from the hidden
    // hand. Listen to the engine's actual equip event, not only the direct
    // `play_relic` action: boss effects can grant or equip relics too, and those
    // were the six placements that previously produced no visual card.
    const enemyRelicEvents = resultEvents.filter(
      (event) => {
        if (!event.cardId?.startsWith("r") || !event.instanceId) return false;
        if (event.kind !== "effect" || !/\bequips\b/i.test(event.text)) return false;
        // The bearer is authoritative. Some generated effects describe the
        // source that granted the relic in `event.player`, not the seat that
        // now owns the bearer, so checking only that field misses real boss
        // relic plays.
        return next.players[opponentId].board.some((minion) => minion?.instanceId === event.instanceId);
      },
    );
    const flashes = enemyRelicEvents.flatMap(event => {
      const relic = event.cardId ? relicLibrary.get(event.cardId) : undefined;
      return relic && event.instanceId ? [{ id: fxId.current++, instanceId: event.instanceId, relic }] : [];
    });
    if (flashes.length) setRelicFlashes(items => [...items, ...flashes]);

    before.forEach((entry, id) => {
      const now = after.get(id);
      if (!now) {
        const destinationOwner = returningOwners.get(id);
        const motion = stasisIds.has(id) ? "stasis" : destinationOwner === undefined ? "death" : "return";
        const ghostId = fxId.current++;
        newGhosts.push({
          id: ghostId,
          owner: entry.owner,
          slot: entry.slot,
          minion: entry.minion,
          delay: strikeDelay,
          particles: makeParticles(motion === "stasis" ? "stasis" : "death"),
          motion,
          destinationOwner,
          batch: newGhosts[0]?.batch ?? ghostId,
          order: newGhosts.length,
        });
        return;
      }
      const delta = now.minion.hp - entry.minion.hp;
      if (delta !== 0) {
        newFloats.push({ id: fxId.current++, owner: now.owner, slot: now.slot, delta, delay: strikeDelay });
        addImpact(now.owner, now.slot, delta < 0 ? "hit" : "heal", strikeDelay);
      }
      if (entry.minion.divineShield && !now.minion.divineShield) addImpact(now.owner, now.slot, "shield", strikeDelay);
      if (!entry.minion.frozen && now.minion.frozen) addImpact(now.owner, now.slot, "freeze", strikeDelay);
      if (now.minion.atk > entry.minion.atk || now.minion.maxHp > entry.minion.maxHp) {
        addImpact(now.owner, now.slot, "buff", strikeDelay);
      } else if (now.minion.atk < entry.minion.atk || (now.minion.maxHp < entry.minion.maxHp && delta >= 0)) {
        addImpact(now.owner, now.slot, "debuff", strikeDelay);
      }
    });

    // A minion arriving plays the fanfare for its rarity — Rare through Mythic —
    // and then SPEAKS. The voice is the whole point of the moment, so it waits
    // for the fanfare's transient instead of starting on the same frame and
    // smearing into it.
    //
    // Exactly one arrival speaks per action: a board-filling effect that summons
    // three bodies should sound like an army landing, not three people talking
    // over each other. The loudest card present gets the line.
    const arrivals: MinionInstance[] = [];
    after.forEach((entry, id) => {
      if (!before.has(id)) {
        addImpact(entry.owner, entry.slot, "summon", 0.1, "minionLand", entry.minion.camp);
        // Weight, and it is keyed to COST rather than to rarity. Rarity already
        // has the fanfare; cost is the thing the player is paying and the thing
        // that makes a body feel big, and a 6-mana Rare should land as hard as
        // a 6-mana Mythic. The thud waits out the fanfare's transient so the two
        // read as one arrival instead of smearing together.
        //
        // It SCALES from 6 up to 10 rather than being one fixed thud, so the
        // whole top half of the curve is not flattened into a single sound.
        // A turn with several arrivals keeps the heaviest one's weight, because
        // the table has one drop however many bodies landed.
        if (entry.minion.cost >= HEAVY_LANDING_COST) {
          const weight = heavyLandingWeight(entry.minion.cost);
          sfx.playHeavyLand(weight, 0.16);
          heavyLanding = Math.max(heavyLanding, weight);
        }
        arrivals.push(entry.minion);
      }
    });

    const thematicArrivals = arrivals.filter(
      (minion) =>
        !minion.suppressArrivalTheme &&
        shouldPlayCardTheme(minion.cardId) &&
        (!minion.cardId.startsWith("token:") || isThemedTokenId(minion.cardId)),
    );
    if (thematicArrivals.length > 0) {
      const speaker = thematicArrivals.reduce((best, minion) =>
        rarityRank(minion.rarity) > rarityRank(best.rarity) ||
        (rarityRank(minion.rarity) === rarityRank(best.rarity) && minion.cost > best.cost)
          ? minion
          : best,
      );
      sfx.playCardTheme(speaker.cardId, speaker.rarity === TOP_RARITY ? 0.5 : 0.28);
      // NO HERALD ON A SUMMON (owner ruling). A Mythic landing used to also get a
      // narrator line stacked behind its theme; between the rarity fanfare, the
      // card's own theme and the music bed, an arrival already has three layers
      // and a fourth turned the loudest moment in the duel into clutter. The
      // herald now speaks only about the DUEL — its opening, first blood, a core
      // in danger, the ending — never about a card being placed.
    }

    next.players.forEach((p, i) => {
      const delta = p.health - prev.players[i].health;
      if (delta !== 0) {
        newFloats.push({ id: fxId.current++, owner: p.id, slot: "hero", delta, delay: strikeDelay });
        addImpact(p.id, "hero", delta < 0 ? "hit" : "heal", strikeDelay);
        if (delta < 0) heroWasHit = true;
      }
    });

    budgetParticles([...newImpacts, ...newGhosts]);
    if (newFloats.length) {
      setFloats((cur) => [...cur, ...newFloats]);
      const ids = new Set(newFloats.map((f) => f.id));
      window.setTimeout(() => setFloats((cur) => cur.filter((f) => !ids.has(f.id))), 1250);
    }
    if (newGhosts.length) {
      setGhosts((cur) => [...cur, ...newGhosts]);
      newGhosts.forEach((g, i) =>
        sfx.play(g.motion === "stasis" ? "freeze" : g.motion === "return" ? "draw" : "death", g.delay + i * 0.07),
      );
      const ids = new Set(newGhosts.map((g) => g.id));
      window.setTimeout(() => setGhosts((cur) => cur.filter((g) => !ids.has(g.id))), 1020 + Math.max(...newGhosts.map(g => g.delay)) * 1000);
    }
    if (newImpacts.length) {
      setImpacts((cur) => [...cur, ...newImpacts]);
      const ids = new Set(newImpacts.map((fx) => fx.id));
      window.setTimeout(() => setImpacts((cur) => cur.filter((fx) => !ids.has(fx.id))), 1600);
    }
    if (heroWasHit) {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 450);
    }
    if (heavyLanding > 0) {
      const weight = heavyLanding;
      setLanding(weight);
      window.setTimeout(() => setLanding((current) => (current === weight ? 0 : current)), 620);
    }

    // The rift answers whatever crossed it. One flare per action however many
    // bodies moved — a board-wipe should read as one event, not as six.
    if (arrivals.length > 0 || newGhosts.length > 0) {
      setRiftFlare(fxId.current++);
    }

    // --- the draw -------------------------------------------------------
    // A card that ARRIVED in a hand while the deck SHRANK is a draw; a card that
    // arrived without the deck moving was stolen or created, and flying that one
    // out of the pile would be a lie about where it came from.
    const drewFor = (id: PlayerId) => remainingDeckCount(next, id) < remainingDeckCount(prev, id) ||
      (prev.drawChoice?.player === id && !next.drawChoice);
    if (drewFor(0) || drewFor(1)) {
      const pile = document.querySelector(".deck-pile");
      const pileBox = pile?.getBoundingClientRect();
      const newFlights: Flight[] = [];
      next.players.forEach((p, i) => {
        if (!drewFor(p.id)) return;
        if (p.hand.length <= prev.players[i].hand.length) return;
        const mine = p.id === viewerId;
        const target = mine
          ? document.querySelector(".hand-fan")
          : document.querySelector(`[data-hero="${p.id}"]`);
        const targetBox = target?.getBoundingClientRect();
        if (!pileBox || !targetBox) return;
        newFlights.push({
          id: fxId.current++,
          fx0: pileBox.left + pileBox.width / 2 - 27,
          fy0: pileBox.top + pileBox.height / 2 - 37,
          fx1: targetBox.left + targetBox.width / 2 - 27,
          fy1: targetBox.top + targetBox.height / 2 - 37,
          mine,
        });
      });
      if (newFlights.length > 0) {
        setFlights((cur) => [...cur, ...newFlights]);
        newFlights.forEach((_, i) => sfx.play("draw", i * 0.12));
        const ids = new Set(newFlights.map((f) => f.id));
        window.setTimeout(() => setFlights((cur) => cur.filter((f) => !ids.has(f.id))), 700);
      }
    }

    // --- the crystals ---------------------------------------------------
    // Only the viewer's own tray is on screen, so only the viewer's mana is
    // worth animating. Cheat mode shows an infinity sign and has no pips at all.
    if (!hasInfiniteMana(next, viewerId)) {
      const was = prev.players[viewerId].mana;
      const now = next.players[viewerId].mana;
      if (now < was) {
        setManaFx({ id: fxId.current++, kind: "spend", from: was, to: now });
        if(action.type!=="play_card")sfx.play("mana");
      } else if (now > was) {
        setManaFx({ id: fxId.current++, kind: "refill", from: was, to: now });
      }
    }

    if (isStrike) {
      // Measure the two cards on screen so the attacker lunges toward its
      // actual target instead of a generic hop.
      const attackerEl = document.querySelector(`[data-slot="${action.player}-${action.attackerSlot}"]`);
      const targetEl =
        action.type === "attack_minion"
          ? document.querySelector(`[data-slot="${otherPlayer(action.player)}-${action.targetSlot}"]`)
          : document.querySelector(`[data-hero="${otherPlayer(action.player)}"]`);
      let dx = 0;
      let dy = -30;
      if (attackerEl && targetEl) {
        const a = attackerEl.getBoundingClientRect();
        const t = targetEl.getBoundingClientRect();
        dx = (t.left + t.width / 2 - (a.left + a.width / 2)) * 0.72;
        dy = (t.top + t.height / 2 - (a.top + a.height / 2)) * 0.72;
      }
      const marker = { id: fxId.current++, owner: action.player, slot: action.attackerSlot, dx, dy };
      setLunge(marker);
      window.setTimeout(() => setLunge((cur) => (cur && cur.id === marker.id ? null : cur)), 500);
    }
  }

  /** One short line in the middle of the board, then gone. */
  function showToast(text: string, durationMs = 1500, tone: BoardToast["tone"] = "normal") {
    const next = { id: fxId.current++, text, durationMs, tone };
    setToast(next);
    window.setTimeout(() => setToast((cur) => (cur && cur.id === next.id ? null : cur)), durationMs);
  }

  /** Flash these Taunt blockers for one second. */
  function flashTaunt(instanceIds: string[]) {
    const marker = { id: fxId.current++, instanceIds };
    setTauntFlash(marker);
    window.setTimeout(() => setTauntFlash((current) => (current?.id === marker.id ? null : current)), 1000);
  }

  /** Clears an aimed attack's Taunt flash without waiting for its timer. */
  function clearTauntFlash() {
    setTauntFlash(null);
  }

  /** Announce whose turn it is for a moment. Returns the cleanup for the effect that called it. */
  function showBanner(text: string, mine: boolean): () => void {
    const marker = { id: fxId.current++, text, mine };
    setBanner(marker);
    const timer = window.setTimeout(() => setBanner((cur) => (cur && cur.id === marker.id ? null : cur)), 1500);
    return () => window.clearTimeout(timer);
  }

  /**
   * The killing blow gets its own beat before the curtain: a white tear across
   * the board and a hard shake, so the duel ends on an impact rather than on a
   * screen simply appearing.
   */
  function strikeLethal(draw: boolean) {
    setLethal(fxId.current++);
    setShaking(true);
    window.setTimeout(() => setShaking(false), 520);
    sfx.play(draw ? "lose" : "win", 0.45);
  }

  return {
    floats, ghosts, impacts, lunge, relicFlash, toast, shaking, landing, flights, riftFlare, manaFx, banner, tauntFlash, lethal,
    nextId, clear, clearFlights, spawnOpeningDeal, spawnFx, showToast, flashTaunt, clearTauntFlash, showBanner, strikeLethal,
  };
}
