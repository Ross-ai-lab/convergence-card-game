import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./App.css";
// Board effects (camp signatures, the Mythic entrance, the killing blow). Loaded
// HERE, immediately after App.css, on purpose: that is the exact cascade slot
// they occupied when they lived in screens/Screens.css, so moving the file could
// not change which rule wins anything.
import "./board-fx.css";
import { sfx, type SfxName } from "./audio/sfx";
import { cards, relics } from "./data/cards";
import { chooseBotAction } from "./engine/bot";
import { isMinionCard, isRelicCard } from "./engine/types";
import {
  actionKey,
  applyAction,
  attacksRandomly,
  createInitialGame,
  getLegalActions,
  makeCardLibrary,
  STARTING_CORE,
  TARGETED_EFFECTS,
  type CardLibrary,
} from "./engine/game";
import type {
  Camp,
  GameAction,
  GameEvent,
  GameState,
  MinionInstance,
  PendingTarget,
  PlayerId,
  PlayableCard,
  RelicDefinition,
  RelicInstance,
  SlotAuraId,
} from "./engine/types";
import { clearSave, loadGame, saveGame } from "./storage";
import { fitOneLine, fitParagraph, onFontsReady } from "./textfit";
import { loadPlayerCount } from "./playerCount";
import { createDuelSeed } from "./duelSeed";
import { HowToPlay, PassScreen, SettingsPanel, TitleScreen, type GameMode } from "./screens/Screens";

type Selection =
  | { kind: "hand"; handIndex: number }
  | { kind: "attacker"; slotIndex: number }
  | null;

// Everything the card face needs to DRAW itself. It used to be six fields,
// because the rest was baked into a PNG; now the face is DOM, so it needs the
// whole printed card. CardDefinition and MinionInstance both satisfy it
// structurally; relics satisfy it too via relicFace() below, which is why the
// fields are widened rather than Pick'ed — a relic has no ATK/HP, and its rails
// read ASCENSION / RELIC instead of a camp and an alignment.
type CardFaceModel = {
  name: string;
  art: string;
  origin: string;
  effect: string;
  rarity: string;
  camp: string;
  alignment: string;
  cost?: number;
  atk?: number;
  hp?: number;
  flavor?: string;
  /** Drives the keyword artwork — a Taunt card is drawn behind a stone barrier
   *  whether it is on the board or still in your hand. */
  keywords?: readonly string[];
};

/** Relic definitions by id — RelicInstance drops flavour and origin, so the
 *  full card has to be read back out of the library to be shown. */
const relicLibrary = new Map(relics.map((relic) => [relic.id, relic]));

/** An Ascension Relic as a drawable card: teal frame, no stat gems, and the
 *  side rails the printed relics use. */
function relicFace(relic: RelicInstance | RelicDefinition): CardFaceModel {
  const def = relicLibrary.get(relic.id);
  return {
    name: relic.name,
    art: relic.art,
    effect: relic.effect,
    origin: def?.origin ?? "",
    flavor: def?.flavor ?? "",
    cost: def?.cost,
    rarity: "Relic",
    camp: "Ascension",
    alignment: "Relic",
  };
}

function playableFace(card: PlayableCard): CardFaceModel {
  return isRelicCard(card) ? relicFace(card) : card;
}

function attachedRelics(minion: MinionInstance): Array<{ relic: RelicInstance; index: number }> {
  return [
    { relic: minion.relic, index: 0 },
    { relic: minion.relic2 ?? null, index: 1 },
  ].filter((entry): entry is { relic: RelicInstance; index: number } => entry.relic !== null);
}

// Transient view-only effects. All of them are derived by diffing the previous
// and next GameState after an action — the engine stays 100% untouched.
type FloatNum = { id: number; owner: PlayerId; slot: number | "hero"; delta: number; delay: number };
type Particle = { key: number; dx: number; dy: number; size: number; delay: number; rot: number; dur: number };
type Ghost = {
  id: number;
  owner: PlayerId;
  slot: number;
  minion: MinionInstance;
  delay: number;
  particles: Particle[];
  motion: "death" | "return";
  destinationOwner?: PlayerId;
};
type Lunge = { id: number; owner: PlayerId; slot: number; dx: number; dy: number } | null;
type ImpactKind = "hit" | "heal" | "summon" | "buff" | "debuff" | "freeze" | "shield";
type Impact = {
  id: number;
  owner: PlayerId;
  slot: number | "hero";
  kind: ImpactKind;
  delay: number;
  particles: Particle[];
  /**
   * Which camp is arriving. Only set on a summon, and only three effects were
   * built rather than 175 — the board reads far richer for a fraction of the
   * work, and a player learns "green means Nature landed" in one duel.
   */
  camp?: Camp;
};
/**
 * A card leaving the deck. `from`/`to` are viewport coordinates measured off the
 * real deck pile and the real destination at spawn time — the same technique the
 * attacker lunge uses, and the reason the flight lands where the card actually
 * goes at any window size.
 */
type Flight = { id: number; fx0: number; fy0: number; fx1: number; fy1: number; mine: boolean };
/** Which crystals just changed, and in which direction. */
type ManaFx = { id: number; kind: "spend" | "refill"; from: number; to: number } | null;
// A Mythic landing is the loudest moment in a duel, so it takes the whole screen.
type Splash = { id: number; minion: MinionInstance } | null;
const MYTHIC_RARITY = "Red";
const SPLASH_MS = 1900;
/** Rulebook frame colours, ranked. Decides which arrival gets to speak. */
const RARITY_WEIGHT: Record<string, number> = { Red: 4, Yellow: 3, Purple: 2, Black: 1 };
/** Core at or under this swaps the music to the tense bed. Roughly a quarter. */
const TENSION_CORE = 12;

// Pointer-driven drag & drop. A press only becomes a drag after DRAG_THRESHOLD px
// of movement, so plain clicks keep the original select-then-click flow.
type DragState =
  | { kind: "hand"; handIndex: number; cardId: string; x: number; y: number; active: boolean }
  | { kind: "attacker"; slotIndex: number; ox: number; oy: number; x: number; y: number; active: boolean }
  | null;

const DRAG_THRESHOLD = 8;

/** Hand card width, matching `.hand-card`'s flex-basis in App.css. */
const HAND_CARD_W = 118;
/**
 * How wide the fan is allowed to get.
 *
 * The command bar is `[hero plate] [hand] [mana tray]`, and the hero plate
 * carries its own `min-width: 250px` — so a fan wider than this stops being
 * centred and starts sitting on top of the plate. Deliberately conservative:
 * the shell has ~1420px of usable width at 1440, and 820 + the two 250px
 * columns + the gaps leaves room to spare.
 */
const HAND_MAX_W = 820;

/** How far apart two hand cards sit. Never more than the card is wide. */
function handStep(count: number): number {
  if (count < 2) return HAND_CARD_W;
  return Math.min(HAND_CARD_W - 10, (HAND_MAX_W - HAND_CARD_W) / (count - 1));
}
// Combat FX land when the lunge connects, not when the button is released.
const STRIKE_DELAY = 0.18;
// The practice bot is Player Two, and it thinks fast enough to be invisible —
// these pauses exist so a human can watch what it did, not because it is slow.
// Slot auras are permanent, so the board wears both their label and colour.
const AURA_LABEL: Record<SlotAuraId, string> = {
  random_attacks: "RANDOM",
  slot_silence: "SILENCED",
  slot_grow_1: "+1/+1",
  slot_grow_2: "+2/+2",
  slot_protected: "SAFE",
  slot_stats_one: "1/1",
};
const AURA_TEXT: Record<SlotAuraId, string> = {
  random_attacks: "a minion here can only attack at random",
  slot_silence: "a minion here is silenced",
  slot_grow_1: "a minion here gains +1/+1 at the start of your turn",
  slot_grow_2: "a minion here gains +2/+2 at the start of your turn",
  slot_protected: "minions here cannot be targeted, silenced, or frozen; attacks can still hit them",
  slot_stats_one: "minions here are permanently set to 1/1",
};
/** Each permanent board-slot effect gets its own visible ring colour. */
const AURA_COLOR: Record<SlotAuraId, string> = {
  random_attacks: "#f0c767",
  slot_silence: "#b47cff",
  slot_grow_1: "#ff8a65",
  slot_grow_2: "#35d6c2",
  slot_protected: "#52b6ff",
  slot_stats_one: "#ff5f6d",
};

const BOT_ID: PlayerId = 1;
const BOT_DELAY_MS = 620;
const BOT_FIRST_DELAY_MS = 900;

const openingEvent: GameEvent = {
  kind: "info",
  text: "The rift opens. Player One begins.",
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeParticles(kind: ImpactKind | "death", camp?: Camp): Particle[] {
  const out: Particle[] = [];
  const push = (dx: number, dy: number, size: number, delay: number, rot: number, dur: number) =>
    out.push({ key: out.length, dx, dy, size, delay, rot, dur });
  if (kind === "hit") {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(24, 78);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(3, 7), rand(0, 0.06), rand(-160, 160), rand(0.34, 0.52));
    }
  } else if (kind === "heal" || kind === "buff") {
    for (let i = 0; i < 9; i++) push(rand(-34, 34), rand(-30, -86), rand(3, 6), rand(0, 0.24), 0, rand(0.55, 0.85));
  } else if (kind === "debuff") {
    for (let i = 0; i < 8; i++) push(rand(-30, 30), rand(26, 70), rand(3, 6), rand(0, 0.2), 0, rand(0.5, 0.8));
  } else if (kind === "summon") {
    // Each camp arrives differently, in motion as well as colour — colour alone
    // is not a signature, and half the read is whether the debris rises, falls
    // or snaps into place.
    if (camp === "Nature") {
      // Growth: everything climbs, from below, unevenly.
      for (let i = 0; i < 16; i++) {
        push(rand(-52, 52), rand(-40, -104), rand(3, 8), rand(0, 0.26), rand(-140, 140), rand(0.6, 0.95));
      }
    } else if (camp === "Tech") {
      // Assembly: hard horizontal snap, tight and fast, no drift.
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        push(side * rand(34, 96), rand(-16, 16), rand(3, 7), rand(0, 0.08), 0, rand(0.26, 0.4));
      }
    } else if (camp === "Magic") {
      // A sigil: an even ring that turns as it expands.
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * Math.PI * 2;
        const d = rand(46, 82);
        push(Math.cos(a) * d, Math.sin(a) * d * 0.65, rand(3, 6), rand(0, 0.14), rand(120, 300), rand(0.5, 0.82));
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2);
        const d = rand(30, 86);
        push(Math.cos(a) * d, Math.sin(a) * d * 0.6, rand(2, 5), rand(0, 0.1), rand(-90, 90), rand(0.4, 0.66));
      }
    }
  } else if (kind === "shield") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
      const d = rand(40, 84);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(4, 8), rand(0, 0.05), rand(-200, 200), rand(0.4, 0.6));
    }
  } else if (kind === "freeze") {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(16, 46);
      push(Math.cos(a) * d, Math.sin(a) * d, rand(4, 7), rand(0, 0.12), 45, rand(0.5, 0.7));
    }
  } else {
    // death: debris thrown outward, gravity applied by the shard-fly keyframe
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(26, 104);
      push(Math.cos(a) * d, Math.sin(a) * d * 0.8, rand(3, 9), rand(0, 0.07), rand(-320, 320), rand(0.44, 0.68));
    }
  }
  return out;
}

export default function App() {
  const library = useMemo(() => makeCardLibrary(cards, relics), []);
  // A duel in progress is restored from localStorage; anything unreadable or
  // from an older engine falls back to a fresh game (see storage.ts).
  const restored = useMemo(() => loadGame(), []);
  const [game, setGame] = useState(() => restored?.game ?? createInitialGame(cards, createDuelSeed(), relics));
  const [events, setEvents] = useState<GameEvent[]>(() =>
    restored ? [...restored.events, { kind: "info" as const, text: "Duel restored from your last session." }] : [openingEvent],
  );
  const [mode, setMode] = useState<GameMode>(() => restored?.mode ?? { kind: "hotseat" });
  const vsBot = mode.kind === "bot";
  // The front door. A restored duel still starts here rather than dumping a
  // returning player straight onto a board they left hours ago.
  const [screen, setScreen] = useState<"title" | "playing">("title");
  const [overlay, setOverlay] = useState<null | "settings" | "howToPlay">(null);
  /**
   * Hotseat only: who the screen is currently cleared for. The curtain drops
   * whenever the turn passes to the other player, and stays down until they say
   * they are ready — otherwise both hands are readable off one screen and there
   * is no hidden information left in the game.
   */
  const [seatedPlayer, setSeatedPlayer] = useState<PlayerId>(0);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [impacts, setImpacts] = useState<Impact[]>([]);
  const [lunge, setLunge] = useState<Lunge>(null);
  const [splash, setSplash] = useState<Splash>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [shaking, setShaking] = useState(false);
  /** Cards in flight from the deck pile. Measured off the real elements. */
  const [flights, setFlights] = useState<Flight[]>([]);
  /** The rift answering an arrival or a death. A counter, so each one remounts. */
  const [riftFlare, setRiftFlare] = useState(0);
  /** Crystals just spent, or just refilled. */
  const [manaFx, setManaFx] = useState<ManaFx>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; mine: boolean } | null>(null);
  /** Non-zero for the moment the killing blow lands, keyed so it replays. */
  const [lethal, setLethal] = useState(0);
  const [drag, setDrag] = useState<DragState>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const fxId = useRef(1);
  /** Herald lines already spoken this duel. A ref, so a re-render cannot re-fire one. */
  const heraldSaid = useRef(new Set<string>());
  const dragOrigin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const legalActions = useMemo(() => getLegalActions(game, library), [game, library]);

  // Browsers only allow audio to start from a genuine gesture, so the context
  // is unlocked by the first real pointerdown/keydown rather than on mount.
  useEffect(() => {
    sfx.installUnlockListeners();
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadPlayerCount().then((count) => {
      if (mounted) setPlayerCount(count);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Every card's text size is measured against the real fonts, and the fonts are
  // not there on the first paint — until they land, `measureText` answers with
  // the fallback's metrics. One re-render once they arrive re-measures the whole
  // roster. It cannot flash oversized text: the fallback is WIDER than Nunito,
  // so the first pass errs a little small and then grows.
  const [, refit] = useState(0);
  useEffect(() => {
    onFontsReady(() => refit((n) => n + 1));
  }, []);

  // Persist after every change. A finished duel is not worth resuming, so the
  // slot is cleared instead of holding a game-over screen forever.
  useEffect(() => {
    if (game.phase === "gameOver") clearSave();
    else saveGame(game, events, mode, Date.now());
  }, [game, events, mode]);

  // The practice opponent. One move per tick, driven off the current state, so
  // it walks through draw picks and targeting prompts exactly like a human does
  // and the animations get to play between its moves.
  useEffect(() => {
    if (mode.kind !== "bot" || screen !== "playing") return;
    const action = chooseBotAction(game, library, BOT_ID, mode.skill);
    if (!action) return;
    const timer = window.setTimeout(() => perform(action), game.phase === "main" ? BOT_DELAY_MS : BOT_FIRST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [game, mode, screen, library]);

  // Hotseat: the moment the active player changes, the seat is stale and the
  // curtain has to come back down. Reading it off the state rather than off the
  // end-turn handler means it also catches a turn that changes hands inside an
  // effect.
  useEffect(() => {
    if (mode.kind !== "hotseat") return;
    if (game.phase === "gameOver") return;
    if (game.activePlayer !== seatedPlayer) sfx.stopCardTheme();
  }, [game.activePlayer, game.phase, mode.kind, seatedPlayer]);

  // Warm the voice clips for cards the viewer could actually play next, so the
  // first thing a card says is not preceded by a fetch.
  useEffect(() => {
    if (screen !== "playing") return;
    sfx.prefetchCardThemes(game.players[mode.kind === "bot" ? 0 : game.activePlayer].hand);
  }, [game, mode.kind, screen]);


  // The score follows the state of the duel: patient on the title, driving on the
  // board, and tense the moment either core is close enough to end it. Asking for
  // the track already playing is a no-op, so this can run on every render.
  const lowestCore = Math.min(game.players[0].health, game.players[1].health);

  useEffect(() => {
    if (game.phase === "gameOver") {
      void sfx.setTrack(null);
      return;
    }
    if (screen === "title") void sfx.setTrack("menu");
    else void sfx.setTrack(lowestCore <= TENSION_CORE ? "tension" : "battle");
  }, [screen, game.phase, lowestCore]);

  // Hotseat hands the screen to whoever's turn it is. Against the bot the screen
  // STAYS on Player One — the opponent is a real opponent, so its hand is never
  // shown and its turn plays out on the far side of the board.
  // Against the bot the screen stays on Player One forever. In hotseat it belongs
  // to whoever is currently SEATED, not to whoever's turn it is — those differ for
  // exactly as long as the privacy curtain is up, and during that gap nothing on
  // the incoming player's side may render or be clickable.
  const viewerId: PlayerId = vsBot ? 0 : seatedPlayer;
  const curtainUp =
    mode.kind === "hotseat" && screen === "playing" && game.phase !== "gameOver" && game.activePlayer !== seatedPlayer;

  /**
   * Whose turn it is, announced.
   *
   * Read off `activePlayer` rather than off the End Turn handler, for the same
   * reason the hotseat curtain is: a turn can also change hands inside an
   * effect, and a banner wired to the button would miss those.
   *
   * NEVER behind the curtain — the curtain already says whose turn it is, in
   * bigger letters, and a banner sweeping behind a closed door is just noise.
   */
  useEffect(() => {
    if (screen !== "playing" || game.phase === "gameOver" || curtainUp) return;
    const mine = game.activePlayer === viewerId;
    const text = vsBot
      ? mine
        ? "Your turn"
        : "Opponent's turn"
      : `${game.players[game.activePlayer].name}'s turn`;
    const marker = { id: fxId.current++, text, mine };
    setBanner(marker);
    const timer = window.setTimeout(() => setBanner((cur) => (cur && cur.id === marker.id ? null : cur)), 1500);
    return () => window.clearTimeout(timer);
  }, [game.activePlayer, game.phase, screen, curtainUp, viewerId, vsBot]);

  // The crystal animation is a one-shot; letting it sit in state would re-apply
  // its classes to whatever pips happen to be in that range on a later turn.
  useEffect(() => {
    if (!manaFx) return;
    const timer = window.setTimeout(() => setManaFx((cur) => (cur && cur.id === manaFx.id ? null : cur)), 950);
    return () => window.clearTimeout(timer);
  }, [manaFx]);

  // Herald moments. Each fires AT MOST ONCE per duel, tracked in a ref rather
  // than in state so a re-render can never re-fire one — a narrator that repeats
  // itself is worse than no narrator at all. Deliberately tied to MOMENTS and not
  // to turns: a line every turn is the fastest way to make a voice everyone liked
  // in the first duel unbearable by the third.
  useEffect(() => {
    if (screen !== "playing") return;
    const said = heraldSaid.current;
    const say = (clip: string, delay = 0) => {
      if (said.has(clip)) return;
      said.add(clip);
      sfx.playAnnouncer(clip, delay);
    };
    if (game.phase === "gameOver") {
      if (game.winner === "draw") say("draw", 1.1);
      else if (game.winner === viewerId) say("victory", 1.1);
      else say("defeat", 1.1);
      return;
    }
    // NO "FIRST BLOOD" LINE (owner ruling). It fired the moment either core took
    // any damage at all, which in a 76-core duel is turn two or three and means
    // nothing — a narrator announcing an event that happens in every single game
    // before anything is at stake. Removed from the sheet and the clip deleted,
    // not just muted. The herald keeps only the moments that are actually rare:
    // the opening, a core in real danger, and the ending.
    const mine = game.players[viewerId].health;
    const theirs = game.players[otherPlayer(viewerId)].health;
    if (theirs <= STARTING_CORE * 0.25) say("core_low_them", 0.6);
    if (mine <= STARTING_CORE * 0.25) say("core_low_you", 0.6);
  }, [game, screen, viewerId]);
  const viewer = game.players[viewerId];

  /**
   * The test hook. DEV ONLY.
   *
   * `scripts/check-ui.mjs` can drive most of the game by clicking, but some
   * situations cannot be reached that way without luck: a card that asks for a
   * target has to BE in your hand, and a relic must be played onto a chosen
   * bearer. Playing cards and hoping made those checks
   * skip on almost every run, which is coverage in name only.
   *
   * This lets a test say "put this card in my hand" and "hang this relic on
   * that minion" directly, so those checks run every time.
   *
   * It cannot reach the built game. `import.meta.env.DEV` is replaced by the
   * bundler with a literal `false`, the whole body is dead-code-eliminated, and
   * the dynamic import below is never emitted — the same treatment the analyser
   * probes in `audio/sfx.ts` get. `npm run build` is checked for the string
   * `__debug` as part of this; if it ever appears there, this has broken.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || screen !== "playing") return;
    const w = window as unknown as { __debug?: Record<string, unknown> };
    let cancelled = false;

    void import("./engine/test-utils").then(({ spawnTestMinion }) => {
      if (cancelled) return;
      const findCard = (nameOrId: string) => {
        const key = nameOrId.trim().toLowerCase();
        return (
          Object.values(library).find((c) => c.id.toLowerCase() === key) ??
          Object.values(library).find((c) => c.name.toLowerCase() === key) ??
          Object.values(library).find((c) => c.name.toLowerCase().includes(key))
        );
      };
      // `opponent()` is internal to the engine; the flip is trivial enough not
      // to widen that module's surface just for a dev hook.
      const other: PlayerId = viewerId === 0 ? 1 : 0;
      const sideOf = (side: string): PlayerId => (side === "them" ? other : viewerId);

      w.__debug = {
        /** Names of every card whose battlecry opens a prompt. */
          targetingCards: () =>
            Object.values(library)
            .filter(
              (c) =>
                isMinionCard(c) &&
                (c.effectTiming === "onPlay" || c.effectTiming === "onPlayAndOngoing") &&
                c.effectId in TARGETED_EFFECTS,
            )
            .map((c) => c.name),

        /** Put a card straight into a hand. */
        giveCard(nameOrId: string, side = "me") {
          const card = findCard(nameOrId);
          if (!card) return `no card matching "${nameOrId}"`;
          const owner = sideOf(side);
          setGame((current) => {
            const players = [...current.players] as GameState["players"];
            players[owner] = { ...players[owner], hand: [...players[owner].hand, card.id] };
            return { ...current, players };
          });
          return card.name;
        },

        /** Drop a minion onto a board slot, already awake. */
        place(nameOrId: string, side = "them", slotIndex = 0) {
          const card = findCard(nameOrId);
          if (!card || !isMinionCard(card)) return `"${nameOrId}" is not a minion`;
          const owner = sideOf(side);
          setGame((current) => {
            const players = [...current.players] as GameState["players"];
            const board = [...players[owner].board];
            board[slotIndex] = spawnTestMinion(card, owner, { sleeping: false });
            players[owner] = { ...players[owner], board };
            return { ...current, players };
          });
          return card.name;
        },

        /** Hang a relic on a minion already on the board. */
        equipRelic(relicName: string, side = "me", slotIndex = 0) {
          const owner = sideOf(side);
          // Resolve the relic BEFORE setGame. Reading it inside the updater and
          // assigning to an outer variable returns the stale default, because
          // the updater runs after this function has already returned.
          const wanted = relicName.trim().toLowerCase();
          const relicDef = relics.find((r) => r.name.toLowerCase() === wanted) ?? relics[0];
          if (!relicDef) return "relic catalog is empty";
          const relic: RelicInstance = {
            id: relicDef.id,
            relicId: relicDef.relicId,
            name: relicDef.name,
            effect: relicDef.effect,
            art: relicDef.art,
          };
          setGame((current) => {
            const players = [...current.players] as GameState["players"];
            const board = [...players[owner].board];
            const bearer = board[slotIndex];
            if (!bearer) return current;
            board[slotIndex] = bearer.relic
              ? { ...bearer, relic2: bearer.relic2 ?? relic }
              : { ...bearer, relic };
            players[owner] = { ...players[owner], board };
            return { ...current, players };
          });
          return relic.name;
        },

        /** A small readable summary, for assertions that need numbers. */
        state: () => ({
          phase: game.phase,
          activePlayer: game.activePlayer,
          viewer: viewerId,
          hand: game.players[viewerId].hand.length,
          mine: game.players[viewerId].board.filter(Boolean).length,
          theirs: game.players[viewerId === 0 ? 1 : 0].board.filter(Boolean).length,
        }),
      };
    });

    return () => {
      cancelled = true;
      delete w.__debug;
    };
  }, [game, library, screen, viewerId]);
  const opponentId = otherPlayer(viewerId);
  const opponent = game.players[opponentId];
  const opponentHandRevealed = viewer.board.some(
    (minion) => minion && minion.effectId === "watcher_reveal_hand" && !minion.silenced && minion.chained === 0,
  );
  const revealedOpponentHand = opponentHandRevealed ? opponent.hand : undefined;
  const myTurn = game.activePlayer === viewerId;
  // Every affordance and click reads this. Empty while the opponent is thinking,
  // so nothing lights up and nothing can be clicked on their behalf.
  const uiActions = myTurn ? legalActions : [];

  function clearFx() {
    setFloats([]);
    setGhosts([]);
    setImpacts([]);
    setLunge(null);
    setSplash(null);
    setToast(null);
    setHover(null);
    setDrag(null);
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
              ? "summonRare"
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
    resultEvents.forEach((event) => {
      if (event.motion === "return" && event.instanceId && event.player !== undefined) {
        returningOwners.set(event.instanceId, event.player);
      }
    });
    // Equipping an Ascension Relic is a deliberate power-spike moment, not a
    // normal card-play click. One fanfare per action keeps mass-equipping cards
    // celebratory without turning them into a stack of overlapping stings.
    if (resultEvents.some((event) => event.kind === "effect" && /\bequips\b/i.test(event.text))) {
      sfx.play("relicEquip", 0.05);
    }

    before.forEach((entry, id) => {
      const now = after.get(id);
      if (!now) {
        const destinationOwner = returningOwners.get(id);
        const motion = destinationOwner === undefined ? "death" : "return";
        newGhosts.push({
          id: fxId.current++,
          owner: entry.owner,
          slot: entry.slot,
          minion: entry.minion,
          delay: strikeDelay,
          particles: makeParticles("death"),
          motion,
          destinationOwner,
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
    // smearing into it, and a Mythic waits longer still because its splash owns
    // the screen first.
    //
    // Exactly one arrival speaks per action: a board-filling effect that summons
    // three bodies should sound like an army landing, not three people talking
    // over each other. The loudest card present gets the line.
    const arrivals: MinionInstance[] = [];
    after.forEach((entry, id) => {
      if (!before.has(id)) {
        addImpact(entry.owner, entry.slot, "summon", 0.1, sfx.summonSoundFor(entry.minion.rarity), entry.minion.camp);
        arrivals.push(entry.minion);
        if (entry.minion.rarity === MYTHIC_RARITY) {
          const marker: Splash = { id: fxId.current++, minion: entry.minion };
          setSplash(marker);
          window.setTimeout(() => setSplash((cur) => (cur && cur.id === marker.id ? null : cur)), SPLASH_MS);
        }
      }
    });

    const thematicArrivals = arrivals.filter((minion) => !minion.suppressArrivalTheme);
    if (thematicArrivals.length > 0) {
      const speaker = thematicArrivals.reduce((best, minion) =>
        RARITY_WEIGHT[minion.rarity] > RARITY_WEIGHT[best.rarity] ||
        (RARITY_WEIGHT[minion.rarity] === RARITY_WEIGHT[best.rarity] && minion.cost > best.cost)
          ? minion
          : best,
      );
      sfx.playCardTheme(speaker.cardId, speaker.rarity === MYTHIC_RARITY ? 0.5 : 0.28);
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

    if (newFloats.length) {
      setFloats((cur) => [...cur, ...newFloats]);
      const ids = new Set(newFloats.map((f) => f.id));
      window.setTimeout(() => setFloats((cur) => cur.filter((f) => !ids.has(f.id))), 1250);
    }
    if (newGhosts.length) {
      setGhosts((cur) => [...cur, ...newGhosts]);
      newGhosts.forEach((g, i) => sfx.play(g.motion === "return" ? "draw" : "death", g.delay + i * 0.07));
      const ids = new Set(newGhosts.map((g) => g.id));
      window.setTimeout(() => setGhosts((cur) => cur.filter((g) => !ids.has(g.id))), 760);
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

    // The rift answers whatever crossed it. One flare per action however many
    // bodies moved — a board-wipe should read as one event, not as six.
    if (arrivals.length > 0 || newGhosts.length > 0) {
      setRiftFlare(fxId.current++);
    }

    // --- the draw -------------------------------------------------------
    // A card that ARRIVED in a hand while the deck SHRANK is a draw; a card that
    // arrived without the deck moving was stolen or created, and flying that one
    // out of the pile would be a lie about where it came from.
    const deckBefore = prev.deck.length + prev.bottomDeck.length;
    const deckAfter = next.deck.length + next.bottomDeck.length;
    if (deckAfter < deckBefore) {
      const pile = document.querySelector(".deck-pile");
      const pileBox = pile?.getBoundingClientRect();
      const newFlights: Flight[] = [];
      next.players.forEach((p, i) => {
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
    if (!next.cheatMode) {
      const was = prev.players[viewerId].mana;
      const now = next.players[viewerId].mana;
      if (now < was) {
        setManaFx({ id: fxId.current++, kind: "spend", from: was, to: now });
        sfx.play("mana");
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

  function perform(action: GameAction) {
    const result = applyAction(game, action, library);
    if (result.state !== game) {
      spawnFx(game, result.state, action, result.events);
      if (result.state.activePlayer !== game.activePlayer && result.state.phase !== "gameOver") {
        sfx.play("turn", 0.05);
      }
      if (result.state.phase === "gameOver" && game.phase !== "gameOver") {
        // The killing blow gets its own beat before the curtain: a white tear
        // across the board and a hard shake, so the duel ends on an impact
        // rather than on a screen simply appearing.
        setLethal(fxId.current++);
        setShaking(true);
        window.setTimeout(() => setShaking(false), 520);
        sfx.play(result.state.winner === "draw" ? "lose" : "win", 0.45);
        // The fanfare is the transient; the sting is the music that follows it.
        // Against the bot a loss really is a loss; in hotseat somebody always won.
        const lost = vsBot && result.state.winner === BOT_ID;
        sfx.playSting(lost || result.state.winner === "draw" ? "defeat" : "victory");
      }
      setHistory((items) => [game, ...items].slice(0, 10));
      setGame(result.state);
      setSelection(null);
      setHover(null);
    }
    setEvents((items) => [...items, ...result.events].slice(-80));
  }

  function restart() {
    sfx.play("button");
    sfx.stopCardTheme();
    clearSave();
    setGame(createInitialGame(cards, createDuelSeed(), relics));
    setHistory([]);
    setSelection(null);
    clearFx();
    setSeatedPlayer(0);
    setLethal(0);
    heraldSaid.current = new Set();
    setEvents([{ kind: "info", text: "A new shared deck is prepared." }]);
  }

  /** Starts a fresh duel in the chosen mode, straight from the title screen. */
  function beginDuel(next: GameMode) {
    sfx.play("button");
    sfx.unlock();
    sfx.stopCardTheme();
    clearSave();
    setMode(next);
    setGame(createInitialGame(cards, createDuelSeed(), relics));
    setHistory([]);
    setSelection(null);
    clearFx();
    setSeatedPlayer(0);
    heraldSaid.current = new Set();
    sfx.playAnnouncer("duel_begin", 0.35);
    setEvents([
      {
        kind: "info",
        text:
          next.kind === "bot"
            ? "A practice opponent takes the far side of the board."
            : "Two players, one screen. The board hides itself when the turn changes hands.",
      },
    ]);
    setScreen("playing");
  }

  function toTitle() {
    sfx.play("button");
    sfx.stopCardTheme();
    setScreen("title");
  }

  /** Answers an open targeting prompt by naming a minion on the board. */
  function chooseTargetAt(owner: PlayerId, slotIndex: number): boolean {
    const pending = game.pendingTarget;
    // "slot" prompts are answered the same way, but an EMPTY slot is a valid answer.
    if (game.phase !== "targeting" || !pending) return false;
    if (pending.kind !== "board" && pending.kind !== "slot") return false;
    const choiceIndex = pending.options.findIndex((option) => option.owner === owner && option.slot === slotIndex);
    if (choiceIndex < 0) {
      sfx.play("invalid");
      return false;
    }
    perform({ type: "choose_target", player: pending.player, choiceIndex });
    return true;
  }

  function undo() {
    const [previous, ...rest] = history;
    if (!previous) return;
    sfx.play("button");
    setGame(previous);
    setHistory(rest);
    setSelection(null);
    clearFx();
    setEvents((items) => [...items, { kind: "info" as const, text: "Last local action undone." }].slice(-80));
  }

  function toggleCheatMode() {
    sfx.play("button");
    // Read the switch from the live state inside the updater. The settings
    // overlay can stay mounted across game changes, so closing over `game`
    // could toggle from an older render and show ON without changing the
    // current duel's affordability rules.
    const enabled = !game.cheatMode;
    setGame((current) => ({ ...current, cheatMode: !current.cheatMode }));
    setSelection(null);
    setEvents((items) =>
      [
        ...items,
        {
          kind: "info" as const,
          text: enabled ? "Cheat mode enabled. Mana is infinite." : "Cheat mode disabled. Mana costs restored.",
        },
      ].slice(-80),
    );
  }

  function previewCard(card: PlayableCard, el: HTMLElement) {
    if (drag?.active) return;
    sfx.hoverTick();
    const r = el.getBoundingClientRect();
    setHover({
      face: playableFace(card),
      effect: card.effect,
      flavor: card.flavor,
      atkClass: "",
      hpClass: "",
      states: [],
      onBoard: false,
      extraEffects: [],
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    });
  }

  function previewMinion(minion: MinionInstance, el: HTMLElement) {
    if (drag?.active) return;
    sfx.hoverTick();
    const def = library[minion.cardId];
    const r = el.getBoundingClientRect();
    const grantedEffects = minion.gainedEffects.map((effect) => effect.text).filter(Boolean);
    const copiedPassive = minion.stolenPassiveText?.replace(/^Passive:\s*/i, "");
    setHover({
      face: minion,
      effect: minion.silenced ? "" : minion.effect,
      flavor: def ? def.flavor : "",
      atkClass: statClass(minion.atk, minion.baseAtk),
      hpClass: minion.hp < minion.maxHp ? "is-hurt" : statClass(minion.maxHp, minion.baseHp),
      states: minionStates(minion, game.players[minion.owner].board),
      onBoard: true,
      extraEffects: minion.silenced
        ? []
        : [
            ...(grantedEffects.length ? [`Granted effect: ${grantedEffects.join(" • ")}`] : []),
            ...(copiedPassive ? [`Copied passive: ${copiedPassive}`] : []),
          ],
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    });
  }

  // A relic used to be a 26px badge with a tooltip. Hovering it now shows the
  // whole Ascension Relic card, teal frame and all — the live face costs nothing
  // to point at a different card.
  function previewRelic(relic: RelicInstance, el: HTMLElement) {
    if (drag?.active) return;
    sfx.hoverTick();
    const face = relicFace(relic);
    const r = el.getBoundingClientRect();
    setHover({
      face,
      effect: face.effect,
      flavor: face.flavor ?? "",
      atkClass: "",
      hpClass: "",
      states: [],
      onBoard: false,
      extraEffects: [],
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    });
  }

  function endPreview() {
    setHover(null);
  }

  function onHandCard(handIndex: number) {
    if (game.phase !== "main") {
      setSelection(null);
      return;
    }
    const canPlay = uiActions.some(
      (action) => (action.type === "play_card" || action.type === "play_relic") && action.handIndex === handIndex,
    );
    if (!canPlay) {
      // Every card in hand looks equally playable now, so the reason is said
      // once, briefly, in the middle of the board — not branded on the card.
      setSelection(null);
      const boardFull = !viewer.board.some((slot) => !slot);
      showToast(boardFull ? "No room on the board" : "Not enough mana");
      sfx.play("invalid");
      return;
    }
    setSelection({ kind: "hand", handIndex });
  }

  /**
   * Selects a minion to attack with, and warns when its swing will be rolled
   * rather than aimed — Sans, Kurogiri or a Bill Cipher slot. Said at the moment
   * of decision, because the redirect happens after the target is chosen.
   */
  function armAttacker(slotIndex: number) {
    setSelection({ kind: "attacker", slotIndex });
    const minion = viewer.board[slotIndex];
    if (minion && attacksRandomly(game, minion)) showToast("Swinging blind — the target is rolled");
  }

  /** One short line in the middle of the board, then gone. */
  function showToast(text: string) {
    const next = { id: fxId.current++, text };
    setToast(next);
    window.setTimeout(() => setToast((cur) => (cur && cur.id === next.id ? null : cur)), 1500);
  }

  function onBoardSlot(owner: PlayerId, slotIndex: number) {
    const minion = game.players[owner].board[slotIndex];

    if (game.phase === "targeting") {
      chooseTargetAt(owner, slotIndex);
      return;
    }
    if (game.phase !== "main") return;

    if (selection?.kind === "hand" && owner === viewerId) {
      const action = uiActions.find(
        (candidate) =>
          (candidate.type === "play_card" || candidate.type === "play_relic") &&
          candidate.player === viewerId &&
          candidate.handIndex === selection.handIndex &&
          candidate.slotIndex === slotIndex,
      );
      if (action) {
        perform(action);
        return;
      }
      // No placement here -- the slot already holds one of your own minions.
      // Fall through so the click ARMS that minion instead of being swallowed:
      // returning here meant picking up a card silently disabled attacking, and
      // you had to place the card before you could swing with anything.
    }

    if (selection?.kind === "attacker" && owner === opponentId) {
      const action = uiActions.find(
        (candidate) =>
          candidate.type === "attack_minion" &&
          candidate.attackerSlot === selection.slotIndex &&
          candidate.targetSlot === slotIndex,
      );
      if (action) perform(action);
      return;
    }

    if (owner === viewerId && minion) {
      const hasAttack = uiActions.some(
        (action) =>
          (action.type === "attack_minion" || action.type === "attack_core") &&
          action.player === viewerId &&
          action.attackerSlot === slotIndex,
      );
      if (hasAttack) armAttacker(slotIndex);
    }
  }

  function returnRelic(slotIndex: number, relicIndex = 0) {
    const action = uiActions.find(
      (candidate) => candidate.type === "return_relic" && candidate.slotIndex === slotIndex && (candidate.relicIndex ?? 0) === relicIndex,
    );
    if (action) perform(action);
  }

  // ------------------------------------------------------------- drag & drop
  function startHandDrag(e: React.PointerEvent<HTMLElement>, handIndex: number, playable: boolean) {
    // TOUCH HAS NO HOVER, and a hand card does not print its rules text — it is
    // 96px wide on a phone, where the text would be about five pixels. So the
    // only way to read a card you are holding was a hover that a finger cannot
    // produce. Pressing one now opens the same big preview a mouse gets, and
    // lifting off closes it (see endDrag / cancelDrag). A quick tap still
    // selects, because selection happens on click, not on pointerdown.
    if (e.pointerType === "touch") {
      const card = library[viewer.hand[handIndex]];
      if (card) previewCard(card, e.currentTarget);
    }
    if (game.phase !== "main" || !playable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no active pointer — drag still works without capture
    }
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({ kind: "hand", handIndex, cardId: viewer.hand[handIndex], x: e.clientX, y: e.clientY, active: false });
  }

  function startAttackDrag(e: React.PointerEvent<HTMLElement>, slotIndex: number, canAttack: boolean) {
    if (game.phase !== "main" || !canAttack) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // see above
    }
    const r = e.currentTarget.getBoundingClientRect();
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({
      kind: "attacker",
      slotIndex,
      ox: r.left + r.width / 2,
      oy: r.top + r.height / 2,
      x: e.clientX,
      y: e.clientY,
      active: false,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const becameActive =
      !drag.active &&
      Math.hypot(e.clientX - dragOrigin.current.x, e.clientY - dragOrigin.current.y) > DRAG_THRESHOLD;
    if (becameActive) {
      setHover(null);
      sfx.play("pickup");
      if (drag.kind === "hand") setSelection({ kind: "hand", handIndex: drag.handIndex });
      else armAttacker(drag.slotIndex);
    }
    if (drag.active || becameActive) setDrag({ ...drag, x: e.clientX, y: e.clientY, active: true });
  }

  function endDrag(e: React.PointerEvent) {
    // Close the press-and-hold preview a finger opened (see startHandDrag).
    if (e.pointerType === "touch") setHover(null);
    if (!drag) return;
    if (!drag.active) {
      // Never moved past the threshold — this is a plain click; let onClick handle it.
      setDrag(null);
      return;
    }
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest("[data-slot]") ?? null;
    const heroEl = el?.closest("[data-hero]") ?? null;
    let performed = false;
    if (drag.kind === "hand" && slotEl) {
      const [ownerStr, slotStr] = (slotEl.getAttribute("data-slot") ?? "").split("-");
      if (Number(ownerStr) === viewerId) {
        const slotIndex = Number(slotStr);
        const action = uiActions.find(
          (candidate) =>
            (candidate.type === "play_card" || candidate.type === "play_relic") &&
            candidate.handIndex === drag.handIndex &&
            candidate.slotIndex === slotIndex,
        );
        if (action) {
          perform(action);
          performed = true;
        }
      }
    } else if (drag.kind === "attacker") {
      if (slotEl) {
        const [ownerStr, slotStr] = (slotEl.getAttribute("data-slot") ?? "").split("-");
        if (Number(ownerStr) === opponentId) {
          const targetSlot = Number(slotStr);
          const action = uiActions.find(
            (candidate) =>
              candidate.type === "attack_minion" &&
              candidate.attackerSlot === drag.slotIndex &&
              candidate.targetSlot === targetSlot,
          );
          if (action) {
            perform(action);
            performed = true;
          }
        }
      } else if (heroEl && Number(heroEl.getAttribute("data-hero")) === opponentId) {
        const action = uiActions.find(
          (candidate) => candidate.type === "attack_core" && candidate.attackerSlot === drag.slotIndex,
        );
        if (action) {
          perform(action);
          performed = true;
        }
      }
    }
    if (!performed) {
      sfx.play("invalid");
      setSelection(null);
    }
    setHover(null);
    setDrag(null);
  }

  function cancelDrag() {
    // `pointercancel` is the NORMAL path on a phone: the row scrollers take
    // horizontal swipes via `touch-action: pan-x`, and the browser cancels the
    // pointer the moment it claims one. The preview has to close with it.
    setHover(null);
    if (!drag) return;
    if (drag.active) {
      sfx.play("invalid");
      setSelection(null);
    }
    setDrag(null);
  }

  const guardedHandClick = (handIndex: number) => {
    if (suppressClick.current) return;
    onHandCard(handIndex);
  };

  const guardedSlotClick = (owner: PlayerId, slotIndex: number) => {
    if (suppressClick.current) return;
    onBoardSlot(owner, slotIndex);
  };

  function attackCore() {
    if (selection?.kind !== "attacker") return;
    const action = uiActions.find(
      (candidate) => candidate.type === "attack_core" && candidate.attackerSlot === selection.slotIndex,
    );
    if (action) perform(action);
  }

  const endTurnAction = uiActions.find((action) => action.type === "end_turn");
  const coinAction = uiActions.find((action) => action.type === "use_coin");
  const coreTargetable = canAttackCore(uiActions, selection);
  const heroFx = (id: PlayerId) => impacts.filter((fx) => fx.slot === "hero" && fx.owner === id);
  const pendingTarget = game.phase === "targeting" ? game.pendingTarget : null;
  // Read off the state rather than asking the bot — chooseBotAction simulates
  // every legal move, which is far too much work to redo on every render.
  const botThinking =
    vsBot &&
    (game.phase === "main"
      ? game.activePlayer === BOT_ID
      : game.phase === "drawChoice"
        ? game.drawChoice?.player === BOT_ID
        : game.phase === "targeting"
          ? game.pendingTarget?.player === BOT_ID
          : false);

  /**
   * Three keys, and no more.
   *
   * Ending a turn is the one action taken every single turn and the button for
   * it lives at the far right edge of the screen, which is a long way from where
   * the hand is. Undo is the other one worth a key. Escape drops whatever is
   * selected, because the alternative — clicking an empty part of the table and
   * hoping — is not discoverable either.
   *
   * Held back deliberately: nothing here plays a card or attacks. Numbering the
   * hand would need the numbers drawn on the cards to be usable, and drawing
   * them breaks the "conditions are drawn, never labelled" rule the whole card
   * face is built on.
   */
  useEffect(() => {
    if (screen !== "playing") return;
    const onKey = (event: KeyboardEvent) => {
      // Never steal a key from a text field, a slider, or an open overlay —
      // the overlays run their own Escape handler.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (overlay || curtainUp || pendingTarget || game.phase === "drawChoice") return;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === " " || event.key === "Enter") {
        if (!endTurnAction) return;
        event.preventDefault();
        perform(endTurnAction);
      } else if (event.key === "z" || event.key === "Z") {
        if (history.length === 0) return;
        event.preventDefault();
        undo();
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, overlay, curtainUp, pendingTarget, game, endTurnAction, history.length]);

  return (
    <main className={drag?.active ? "hs-shell grabbing" : "hs-shell"}>
      <div className="table-glow" aria-hidden="true" />

      <div className={shaking ? "table-frame shaking" : "table-frame"}>
        <header className="top-strip">
        <div className="brand-mini">
          <span className="brand-mark" />
          <strong>Convergence</strong>
        </div>
        <HeroPlate
          enemy
          player={opponent}
          cheatMode={game.cheatMode}
          floats={floats.filter((f) => f.slot === "hero" && f.owner === opponentId)}
          impacts={heroFx(opponentId)}
          targetable={coreTargetable}
          active={game.activePlayer === opponentId && game.phase !== "gameOver"}
          thinking={botThinking}
          revealedHand={revealedOpponentHand}
          library={library}
          onCardPreview={previewCard}
          onCardPreviewEnd={endPreview}
          onStrike={attackCore}
        />
        <div className="system-buttons">
          <button type="button" onClick={restart}>Restart</button>
          <button
            type="button"
            onClick={() => {
              sfx.play("button");
              setOverlay("howToPlay");
            }}
            title="Learn the game in a few quick steps"
          >
            ◇ How to play
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.play("button");
              setOverlay("settings");
            }}
            title="Sound and settings"
          >
            ⚙ Settings
          </button>
          <button
            type="button"
            className={game.cheatMode ? "cheat-toggle active" : "cheat-toggle"}
            aria-pressed={game.cheatMode}
            onClick={toggleCheatMode}
            title={game.cheatMode ? "Infinite mana is on. Click to turn it off." : "Enable infinite mana"}
          >
            {game.cheatMode ? "⚡ Cheat On" : "⚡ Cheat Off"}
          </button>
          {/* The Coin exists for about one turn per duel. A button that is greyed
              out for the other twenty teaches nothing and takes up a slot. */}
          {coinAction ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                sfx.play("coin");
                perform(coinAction);
              }}
              title="Going second: spend The Coin for one extra mana this turn"
            >
              Coin
            </button>
          ) : null}
        </div>
        </header>

        <section className="battlefield">
          <BoardRow
            owner={opponentId}
            label={`${opponent.name}'s board`}
            game={game}
            legalActions={uiActions}
            viewerId={viewerId}
            pendingTarget={pendingTarget}
            selection={selection}
            onSlot={guardedSlotClick}
            onRelicReturn={returnRelic}
            ghosts={ghosts}
            floats={floats}
            impacts={impacts}
            lunge={lunge}
            onPreview={previewMinion}
            onPreviewEnd={endPreview}
            onRelicPreview={previewRelic}
            onDragStart={startAttackDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={cancelDrag}
          />
          {/* The seam the game is named after. Five layers because it is the one
              thing on the table that has to be alive while nothing is
              happening — see the rift block in App.css. */}
          <div className="rift-line" aria-hidden="true">
            <span className="rift-seam" />
            <span className="rift-glow" />
            <span className="rift-sweep a" />
            <span className="rift-sweep b" />
            {riftFlare ? <span key={riftFlare} className="rift-flare" /> : null}
          </div>
          <BoardRow
            owner={viewerId}
            label={`${viewer.name}'s board`}
            game={game}
            legalActions={uiActions}
            viewerId={viewerId}
            pendingTarget={pendingTarget}
            selection={selection}
            onSlot={guardedSlotClick}
            onRelicReturn={returnRelic}
            ghosts={ghosts}
            floats={floats}
            impacts={impacts}
            lunge={lunge}
            onPreview={previewMinion}
            onPreviewEnd={endPreview}
            onRelicPreview={previewRelic}
            onDragStart={startAttackDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={cancelDrag}
          />

          <button
            type="button"
            className="end-turn"
            onClick={() => endTurnAction && perform(endTurnAction)}
            disabled={!endTurnAction}
            title="End your turn (Space)"
          >
            End Turn
          </button>

          <div
            className={flights.length > 0 ? "deck-pile drawing" : "deck-pile"}
            title="Shared draw deck"
          >
            <span className="card-back" />
            <span className="card-back" />
            <span className="card-back" />
            <em>{game.deck.length + game.bottomDeck.length}</em>
          </div>
        </section>

        <section className="command-bar">
          <HeroPlate
            player={viewer}
            cheatMode={game.cheatMode}
            floats={floats.filter((f) => f.slot === "hero" && f.owner === viewerId)}
            impacts={heroFx(viewerId)}
            active={game.activePlayer === viewerId && game.phase !== "gameOver"}
          />

          <div className="hand-fan" aria-label={`${viewer.name}'s hand`}>
            {viewer.hand.map((cardId, handIndex) => {
              const card = library[cardId];
              const playable = uiActions.some(
                (action) => (action.type === "play_card" || action.type === "play_relic") && action.handIndex === handIndex,
              );
              const count = viewer.hand.length;
              const mid = (count - 1) / 2;
              const spread = count > 7 ? 2.6 : count > 4 ? 3.6 : 5;
              const lift = count > 7 ? 5 : 7;
              const style = {
                "--rot": `${(handIndex - mid) * spread}deg`,
                // THE ARC LIFTS THE MIDDLE, it does not drop the edges.
                //
                // This was `+|i - mid| * lift`, which pushed the outermost cards
                // DOWN by up to 22px — straight past the bottom of the window,
                // where the health gem was cut off. Same shape, hung the other
                // way up: the outermost card now sits on the baseline and the
                // middle rises, so nothing can ever go below the fan's own
                // bottom edge however many cards are held.
                "--ty": `${(Math.abs(handIndex - mid) - mid) * lift}px`,
                zIndex: handIndex + 1,
                // The overlap is COMPUTED so the fan always fits its column.
                //
                // It used to be three hand-picked numbers (-46/-34/-16, then
                // -30/-22/-10 once the cost gem moved to the left corner and the
                // face needed showing). Hand-picked numbers only work for the
                // hand sizes somebody happened to look at: at ten cards the
                // -30 tier ran 910px wide, the command bar's side columns were
                // squeezed under the hero plate's own 250px minimum, and the fan
                // slid over the health plate on one side and the mana tray on
                // the other. A formula cannot have that bug.
                //
                // Cards never overlap more than they must, so a small hand now
                // barely overlaps at all — strictly better than the old -10.
                marginLeft: handIndex === 0 ? 0 : -(HAND_CARD_W - handStep(count)),
              } as CSSProperties;
              const beingDragged = drag?.active && drag.kind === "hand" && drag.handIndex === handIndex;
              const classes = [
                "hand-card",
                selection?.kind === "hand" && selection.handIndex === handIndex ? "selected" : "",
                playable ? "playable" : "unplayable",
                beingDragged ? "dragging" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  type="button"
                  key={`${cardId}-${handIndex}`}
                  className={classes}
                  style={style}
                  onClick={() => guardedHandClick(handIndex)}
                  onPointerDown={(e) => startHandDrag(e, handIndex, playable)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onMouseEnter={(e) => previewCard(card, e.currentTarget)}
                  onMouseLeave={endPreview}
                  data-playable={playable}
                  title={playable ? "Drag onto the board (or click) to play" : undefined}
                >
                  {card ? <CardFace card={playableFace(card)} /> : null}
                </button>
              );
            })}
          </div>

          <div className="mana-tray" title={game.cheatMode ? "Infinite mana" : `${viewer.mana}/${viewer.maxMana} mana`}>
            {game.cheatMode ? (
              <em className="mana-inf">∞</em>
            ) : (
              <>
                <strong>{viewer.mana}/{viewer.maxMana}</strong>
                <div className="mana-row">
                  {Array.from({ length: viewer.maxMana }, (_, i) => {
                    // A crystal that just went out, or just came back. `--mi` is
                    // its position within the changed run, which is what makes
                    // the group drain one after another instead of all at once.
                    const spent = manaFx?.kind === "spend" && i >= manaFx.to && i < manaFx.from;
                    const refill = manaFx?.kind === "refill" && i >= manaFx.from && i < manaFx.to;
                    const classes = ["mana-pip", i < viewer.mana ? "full" : "", spent ? "spent" : "", refill ? "refill" : ""]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <span
                        key={`${manaFx?.id ?? 0}-${i}`}
                        className={classes}
                        style={
                          spent
                            ? ({ "--mi": manaFx.from - 1 - i } as CSSProperties)
                            : refill
                              ? ({ "--mi": i - manaFx.from } as CSSProperties)
                              : undefined
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <details className="log-drawer">
        <summary>Log</summary>
        <div className="log-drawer-body">
          <EventLog events={events} />
          {/* DEV ONLY, for two separate reasons and either one is enough.
              (1) It printed the whole GameState, both hands included, one click
              inside the Log drawer — straight through the hotseat curtain that
              exists so the incoming player cannot read the outgoing player's
              hand. (2) React renders the children of a collapsed <details>, so
              JSON.stringify of the entire game ran on EVERY render of the live
              site. `import.meta.env.DEV` is replaced with a literal false by the
              bundler and the whole branch is eliminated, the same treatment the
              __debug hook above gets. */}
          {import.meta.env.DEV ? (
            <details className="debug-panel">
              <summary>Debug State</summary>
              <pre>{JSON.stringify({ cheatMode: game.cheatMode, game, legalActions: legalActions.map(actionKey) }, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </details>

      {/* Cards leaving the deck. Fixed layer, so a flight is not clipped by the
          table frame on its way from the pile to the fan. */}
      {flights.map((flight) => (
        <div
          key={flight.id}
          className={flight.mine ? "draw-flight" : "draw-flight theirs"}
          aria-hidden="true"
          style={
            {
              "--fx0": `${flight.fx0}px`,
              "--fy0": `${flight.fy0}px`,
              "--fx1": `${flight.fx1}px`,
              "--fy1": `${flight.fy1}px`,
            } as CSSProperties
          }
        >
          <span className="card-back" />
        </div>
      ))}

      {banner ? (
        <div key={banner.id} className={banner.mine ? "turn-banner" : "turn-banner theirs"} aria-hidden="true">
          <b>{banner.text}</b>
        </div>
      ) : null}

      {hover ? <HoverCard hover={hover} /> : null}

      {splash ? <MythicSplash key={splash.id} minion={splash.minion} /> : null}

      {/* The blow that ends the duel. Fires on the action that sets a winner, so
          the hit is seen before the victory curtain drops over it. */}
      {lethal ? <div key={lethal} className="lethal-flash" aria-hidden="true" /> : null}

      {toast ? (
        <div className="board-toast" key={toast.id} role="status">
          {toast.text}
        </div>
      ) : null}

      {drag?.active && drag.kind === "hand" ? (
        <div className="drag-layer" style={{ transform: `translate(${drag.x - 64}px, ${drag.y - 104}px)` }} aria-hidden="true">
          <div className="drag-card">
            {library[drag.cardId] ? <CardFace card={playableFace(library[drag.cardId])} /> : null}
          </div>
        </div>
      ) : null}

      {drag?.active && drag.kind === "attacker" ? (
        <TargetingArrow x1={drag.ox} y1={drag.oy} x2={drag.x} y2={drag.y} />
      ) : null}

      {pendingTarget ? (
        <TargetPrompt
          pending={pendingTarget}
          library={library}
          botControlled={botThinking}
          onChoose={(choiceIndex) => {
            sfx.play("button");
            perform({ type: "choose_target", player: pendingTarget.player, choiceIndex });
          }}
        />
      ) : null}

      {game.phase === "drawChoice" && game.drawChoice && game.drawChoice.player === viewerId ? (
        <DrawChoiceOverlay game={game} library={library} onChoose={perform} locked={botThinking} />
      ) : null}

      {game.phase === "gameOver" ? (
        <GameOver game={game} library={library} vsBot={vsBot} onRestart={restart} onMenu={toTitle} />
      ) : null}

      {/* The curtain sits above every other overlay: nothing behind it may be
          readable, including an open prompt belonging to the other player. */}
      {curtainUp ? (
        <PassScreen
          toName={game.players[game.activePlayer].name}
          onReady={() => setSeatedPlayer(game.activePlayer)}
        />
      ) : null}

      {screen === "title" ? (
        <TitleScreen
          canContinue={game.phase !== "gameOver" && game.turnNumber > 1}
          playerCount={playerCount}
          onContinue={() => {
            sfx.play("button");
            sfx.unlock();
            setScreen("playing");
          }}
          onStart={beginDuel}
          onSettings={() => setOverlay("settings")}
        />
      ) : null}

      {overlay === "howToPlay" ? <HowToPlay onClose={() => setOverlay(null)} /> : null}
      {overlay === "settings" ? (
        <SettingsPanel
          onClose={() => setOverlay(null)}
          onMenu={() => {
            setOverlay(null);
            toTitle();
          }}
        />
      ) : null}
    </main>
  );
}

type HoverState = {
  face: CardFaceModel;
  effect: string;
  flavor: string;
  atkClass: string;
  hpClass: string;
  states: string[];
  onBoard: boolean;
  extraEffects: string[];
  rect: { left: number; right: number; top: number; bottom: number };
} | null;

function BoardRow({
  owner,
  label,
  game,
  legalActions,
  viewerId,
  pendingTarget,
  selection,
  onSlot,
  onRelicReturn,
  ghosts,
  floats,
  impacts,
  lunge,
  onPreview,
  onPreviewEnd,
  onRelicPreview,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  owner: PlayerId;
  label: string;
  game: GameState;
  legalActions: GameAction[];
  /** Whose side of the table this is drawn from — not necessarily whose turn it is. */
  viewerId: PlayerId;
  pendingTarget: PendingTarget | null;
  selection: Selection;
  onSlot: (owner: PlayerId, slotIndex: number) => void;
  /** Return a reusable attached relic to the owner's hand. */
  onRelicReturn: (slotIndex: number, relicIndex?: number) => void;
  ghosts: Ghost[];
  floats: FloatNum[];
  impacts: Impact[];
  lunge: Lunge;
  onPreview: (minion: MinionInstance, el: HTMLElement) => void;
  onPreviewEnd: () => void;
  onRelicPreview: (relic: RelicInstance, el: HTMLElement) => void;
  onDragStart: (e: React.PointerEvent<HTMLElement>, slotIndex: number, canAttack: boolean) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: (e: React.PointerEvent) => void;
  onDragCancel: () => void;
}) {
  return (
    <div className="board-row" aria-label={label}>
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
        const canReturnRelic =
          owner === viewerId &&
          minion !== null &&
          attachedRelics(minion).length > 0 &&
          legalActions.some((action) => action.type === "return_relic" && action.slotIndex === slotIndex);
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
          boardPrompt.options.some((option) => option.owner === owner && option.slot === slotIndex);
        const classes = [
          "board-slot",
          minion ? "occupied" : "empty",
          auras.length ? "has-slot-aura" : "",
          canPlace ? "placeable" : "",
          canTarget ? "targetable" : "",
          canAttack ? "ready" : "",
          armed ? "armed" : "",
          isLunging ? "striking" : "",
          canBeChosen ? "choosable" : "",
          boardPrompt !== null && !canBeChosen ? "dimmed" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const slotGhosts = ghosts.filter((g) => g.owner === owner && g.slot === slotIndex);
        const slotFloats = floats.filter((f) => f.owner === owner && f.slot === slotIndex);
        const slotImpacts = impacts.filter((fx) => fx.owner === owner && fx.slot === slotIndex);
        // Hit shake / freeze tint retrigger by remounting the jolt wrap per impact.
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
          <button
            type="button"
            key={slotIndex}
            className={classes}
            style={auraStyle}
            data-slot={`${owner}-${slotIndex}`}
            onClick={() => onSlot(owner, slotIndex)}
            onPointerDown={(e) => onDragStart(e, slotIndex, Boolean(canAttack))}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragCancel}
            onMouseEnter={minion ? (e) => onPreview(minion, e.currentTarget) : undefined}
            onMouseLeave={minion ? onPreviewEnd : undefined}
          >
            {minion ? (
              <div className="minion-wrap" key={minion.instanceId}>
                <div
                  className={isLunging ? "lunge-wrap lunging" : "lunge-wrap"}
                  key={isLunging && lunge ? `lunge-${lunge.id}` : "idle"}
                  style={
                    isLunging && lunge ? ({ "--lx": `${lunge.dx}px`, "--ly": `${lunge.dy}px` } as CSSProperties) : undefined
                  }
                >
                  <div
                    className={joltClasses}
                    key={lastKinetic ? `kin-${lastKinetic.id}` : "steady"}
                    style={lastKinetic ? ({ "--fd": `${lastKinetic.delay}s` } as CSSProperties) : undefined}
                  >
                    <MinionFace
                      minion={minion}
                      board={game.players[owner].board}
                      allBoard={game.players.flatMap((player) => player.board)}
                      onRelicReturn={canReturnRelic ? (relicIndex) => onRelicReturn(slotIndex, relicIndex) : undefined}
                      onRelicPreview={onRelicPreview}
                      onRelicPreviewEnd={onPreview}
                    />
                  </div>
                </div>
              </div>
            ) : null}
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
            {slotGhosts.map((ghost) => (
              <div
                className={[
                  "ghost-wrap",
                  ghost.motion === "return" ? "returning" : "dying",
                  ghost.motion === "return"
                    ? (ghost.destinationOwner === viewerId ? "returning-down" : "returning-up")
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={ghost.id}
                style={{ "--fd": `${ghost.delay}s` } as CSSProperties}
              >
                <MinionFace minion={ghost.minion} />
                {ghost.motion === "return" ? <ReturnBurst /> : <DeathBurst particles={ghost.particles} />}
              </div>
            ))}
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
        );
      })}
    </div>
  );
}

function ImpactFx({ impact }: { impact: Impact }) {
  const campClass = impact.camp ? ` camp-${impact.camp.toLowerCase()}` : "";
  return (
    <span
      className={`impact impact-${impact.kind}${campClass}`}
      style={{ "--fd": `${impact.delay}s` } as CSSProperties}
    >
      <span className="impact-core" />
      {/* The camp's signature: a rune ring for Magic, a rising bloom for Nature,
          a snapping bracket for Tech. Drawn in CSS, so it costs no asset. */}
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

function TargetingArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(90, dist * 0.28);
  const cx = x1 + (x2 - x1) / 2;
  const cy = y1 + (y2 - y1) / 2 - lift;
  const angle = (Math.atan2(y2 - cy, x2 - cx) * 180) / Math.PI;
  return (
    <svg className="target-arrow" aria-hidden="true">
      <path className="arrow-path" d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} />
      <circle className="arrow-root" cx={x1} cy={y1} r="9" />
      <g transform={`translate(${x2} ${y2}) rotate(${angle})`}>
        <polygon className="arrow-head" points="-6,-13 22,0 -6,13" />
      </g>
    </svg>
  );
}

// --- text auto-fit ----------------------------------------------------------
// The sizes come from `textfit.ts`, which measures the real glyphs in the real
// fonts and wraps them the way the browser will. The box numbers below are the
// real geometry out of App.css.
//
// These used to be two arithmetic estimates based on an average character
// width. That worked only because a hard ceiling of 37 design units was doing
// the real work — nearly every card hit the cap and the estimate never decided
// anything. The ceilings below are 2-3x higher, so the fit now IS the answer for
// most of the roster, and a character-count estimate is not good enough to be
// the answer: it assumes text fills a box completely when real text wraps at
// word boundaries and leaves a ragged edge, and it overestimates hardest exactly
// when the font is large.

/** Usable banner width. NOT the full 740: the mana gem sits on top of the
 *  banner's right end, so the name has to stop clear of it or it renders
 *  underneath the number. Symmetric because the name is centred. */
const NAME_BOX = 580;        // full-size card, 78-px gem
// Small card. The compact mana crystal grew 104 -> 240 design units (see the
// @container block in App.css), and this is the width the name is allowed to
// use before it slides under the cost number — so it had to come down with it.
const NAME_BOX_COMPACT = 470;
/**
 * A minion IN PLAY has its own geometry and needs its own two numbers, because
 * its gems are much bigger than the printed card's: the cost crystal is 150
 * design units against the print card's 78, and the ATK blade and HP heart are
 * 150-156 against 80-86. Reusing the printed card's boxes put every long name
 * underneath the cost number and ran the last line of wordy cards under the
 * blade — both measured, neither visible in a screenshot.
 *
 * The name is also pushed LEFT on board (see `.card-face.on-board .cf-name`), so
 * this width is the space to the left of the crystal rather than a symmetric
 * reserve.
 */
const NAME_BOX_BOARD = 540;

/** The description plaque's inner box: 618 x 302 design units, line-height 1.16. */
const RULES_BOX = { w: 618, h: 302, lineHeight: 1.16 } as const;
/**
 * The plaque on a board minion. SMALLER than the printed card's, because the
 * artwork is 15% BIGGER than the printed card's and the plaque takes what is
 * left. That is the intended direction of the trade: the picture is the card.
 * Trimmed padding (14 rather than 30/22) claws back what it can without
 * touching the art.
 */
const RULES_BOX_BOARD = { w: 664, h: 198, lineHeight: 1.16 } as const;
/** The flavour strip: 610 x 84, line-height 1.1. */
const FLAVOR_BOX = { w: 610, h: 84, lineHeight: 1.1 } as const;

/**
 * How big the rules text may get. Raised from 37, which is where "way too
 * small" came from: at 37 units a board minion's text renders around ten
 * pixels, and since the overwhelming majority of cards say something short
 * ("Taunt.", "Divine Shield.", "Freeze a minion") they ALL sat at that cap with
 * room to spare around them. Short text now fills its plaque. The wordiest cards
 * in the roster are limited by the box rather than by this number, and land
 * wherever the measurer says they land.
 */
const RULES_CEILING = 64;
const FLAVOR_CEILING = 32;
const NAME_CEILING = 46;
const NAME_CEILING_COMPACT = 72;

function CardFace({
  card,
  extras,
  states = [],
  onBoard = false,
  atkClass = "",
  hpClass = "",
  effect,
  flavor,
}: {
  card: CardFaceModel;
  extras?: ReactNode;
  /** Live condition classes for a minion in play (`is-frozen`, `is-shielded`…). */
  states?: readonly string[];
  /** True once the minion is on the table, where live state replaces the
   *  printed keyword — a popped Divine Shield must stop glowing. */
  onBoard?: boolean;
  atkClass?: string;
  hpClass?: string;
  /** Overrides the printed text — a silenced minion's box really is blank. */
  effect?: string;
  /** MinionInstance carries no flavour, so the board passes it in. */
  flavor?: string;
}) {
  // The card is DRAWN, not shown. Every number here is live, so a buff recolours
  // the real gem instead of pasting a second number over a picture, and changing
  // a line of cards.csv changes the card.
  const rawText = effect ?? card.effect ?? "";
  // 21 cards are stat-only and carry "-" as their effect, which is how the CSV
  // says "nothing". Printing it renders a lone dash in the middle of an empty
  // panel, which reads as a missing value rather than as a card with no text —
  // and it only became visible when board minions started showing their rules.
  // A vanilla minion gets no panel at all and spends the space on its artwork.
  const text = rawText.trim() === "-" ? "" : rawText;
  // Silence blanks only the rules copy. Keep the normal plaque, flavour and
  // rails in place so the red cross is the sole mark inside an otherwise
  // familiar card; vanilla stat-only cards still use the compact blank layout.
  const blank = text.trim().length === 0 && !states.includes("is-silenced");
  const quote = flavor ?? card.flavor ?? "";
  const fit = {
    "--cf-namefit": fitOneLine(card.name, NAME_BOX, NAME_CEILING),
    "--cf-namefitc": fitOneLine(card.name, NAME_BOX_COMPACT, NAME_CEILING_COMPACT),
    "--cf-namefitb": fitOneLine(card.name, NAME_BOX_BOARD, NAME_CEILING),
    // Canvas text metrics are a little more optimistic than the browser's
    // actual line boxes on the longest effects. Keep a conservative width
    // reserve so the final glyph line cannot be clipped by the plaque.
    "--cf-efffit": fitParagraph(text, RULES_BOX.w * 0.9, RULES_BOX.h, RULES_BOX.lineHeight, RULES_CEILING),
    "--cf-efffitb": fitParagraph(text, RULES_BOX_BOARD.w * 0.9, RULES_BOX_BOARD.h, RULES_BOX_BOARD.lineHeight, RULES_CEILING),
    "--cf-flavfit": fitParagraph(quote, FLAVOR_BOX.w, FLAVOR_BOX.h, FLAVOR_BOX.lineHeight, FLAVOR_CEILING, "flavor"),
  } as CSSProperties;
  const rarity = (card.rarity ?? "Black").toLowerCase();
  // Keyword artwork. On the board the live flags win, because a Divine Shield
  // can be popped while the printed keyword stays on the card forever.
  // Conditions belong to the BOARD, never the hand (owner ruling). A card you are
  // holding shows its keywords in its text; the artwork only reacts once the
  // minion is actually in play. Taunt is the one keyword that stays live in
  // `keywords` (minions can be granted it), so it is read from there; Divine
  // Shield and Chained come from the live flags in `states`.
  const keywordClasses = onBoard
    ? (card.keywords ?? []).filter((k) => k === "Taunt").map(() => "kw-taunt")
    : []
  const classes = ["card-face", `rarity-${rarity}`, onBoard ? "on-board" : "", blank ? "cf-blank" : "", ...keywordClasses, ...states]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={classes} style={fit}>
      <div className="cf-stage">
        <div className="cf-frame" aria-hidden="true" />
        <div className="cf-well" aria-hidden="true" />
        <CardArtwork card={card} />
        <div className="cf-desc"><p>{text}</p></div>
        <span className="cf-rail cf-camp">{card.camp}</span>
        <span className="cf-rail cf-align">{card.alignment}</span>
        {quote ? <div className="cf-flavor"><span>{`“${quote}”`}</span></div> : null}
        <div className="cf-origin">{card.origin}</div>
        <div className="cf-banner"><span className="cf-name">{card.name}</span></div>
        <div className="cf-gem cf-mana">{card.cost}</div>
        <div className={`cf-gem cf-atk ${atkClass}`}>{card.atk}</div>
        <div className={`cf-gem cf-hp ${hpClass}`}>{card.hp}</div>
        <div className="cf-fx" aria-hidden="true" />
        {states.includes("is-sleeping") ? (
          <span className="cf-sleep" aria-hidden="true"><i>z</i><i>z</i></span>
        ) : null}
        {extras}
      </div>
    </article>
  );
}

function MinionFace({
  minion,
  board,
  allBoard,
  onRelicPreview,
  onRelicPreviewEnd,
  onRelicReturn,
}: {
  minion: MinionInstance;
  board?: Array<MinionInstance | null>;
  allBoard?: Array<MinionInstance | null>;
  /** Hovering the relic badge swaps the preview to the relic's own card. */
  onRelicPreview?: (relic: RelicInstance, el: HTMLElement) => void;
  /** Given only when returning an attached relic to hand is legal right now. */
  onRelicReturn?: (relicIndex: number) => void;
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
          className={[
            "relic-badge",
            `relic-badge-${index}`,
            onRelicPreview ? "peekable" : "",
            onRelicReturn ? "movable" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={
            onRelicReturn
              ? `${relic.name} — ${relic.effect}\n\nClick to return it to your hand (once a turn).`
              : `${relic.name} — ${relic.effect}`
          }
          onPointerDown={
            onRelicReturn
              ? (e) => {
                  // Stops the board's own drag/arm handler seeing this press.
                  e.stopPropagation();
                  e.preventDefault();
                  onRelicReturn(index);
                }
              : undefined
          }
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

function CardArtwork({ card }: { card: CardFaceModel }) {
  // NEVER loading="lazy" here. Cards mount and unmount constantly as they move
  // between hand, board and preview, and a lazy <img> that is re-created during
  // that churn frequently never fires its load at all — it stays
  // complete:false / naturalWidth:0 forever and the card renders as a black
  // rectangle while the file itself serves fine. Half a board went black this
  // way. Only a handful of card images exist at once; load them eagerly.
  if (!card.art) return <div className="cf-art empty-art" aria-hidden="true" />;
  return (
    <div
      className={`cf-art ${
        card.name === "Yujiro" ? "cf-art-yujiro" : card.name === "Conquest" ? "cf-art-conquest" : ""
      }`}
    >
      <img src={card.art} alt="" draggable={false} />
    </div>
  );
}

/**
 * Live conditions as classes, so the CARD shows them — a stone barrier for
 * Taunt, a gold rim for Divine Shield, ice for Frozen. There is deliberately no
 * badge or chip anywhere: the artwork does the talking, the way it should.
 */
function minionStates(
  minion: MinionInstance,
  board?: Array<MinionInstance | null>,
  allBoard?: Array<MinionInstance | null>,
): string[] {
  const effectIds = new Set([minion.effectId, ...minion.gainedEffects.map((effect) => effect.effectId)]);
  const otherGood = board?.some((other) => other && other.instanceId !== minion.instanceId && other.alignment === "Good") ?? false;
  const goodCount = board?.filter((other) => other?.alignment === "Good").length ?? 0;
  const activeInvulnerable =
    !minion.silenced &&
    (effectIds.has("invuln_if_alone")
      ? (board?.filter(Boolean).length ?? 1) <= 1
      : effectIds.has("invuln_with_good_ally")
        ? otherGood
        : effectIds.has("invuln_if_three_good")
          ? goodCount >= 3
          : effectIds.has("invulnerable_if_frozen")
            ? (allBoard ?? board)?.some((other) => other?.frozen) ?? false
            : false);
  return [
    minion.sleeping ? "is-sleeping" : "",
    minion.chained > 0 ? "is-chained" : "",
    minion.frozen ? "is-frozen" : "",
    minion.silenced ? "is-silenced" : "",
    minion.divineShield ? "is-shielded" : "",
    typeof minion.invulnerableUntilTurn === "number" || activeInvulnerable ? "is-invulnerable" : "",
    minion.protectedSlot ? "is-protected" : "",
    minion.attackLocked ||
    (!minion.silenced && (effectIds.has("watcher_reveal_hand") || effectIds.has("ragnaros_end_turn")))
      ? "is-locked"
      : "",
    minion.markedBy || minion.markedForDeathAtTurn !== null && minion.markedForDeathAtTurn !== undefined ? "is-marked" : "",
    minion.campImmunity ? "is-adapted" : "",
  ].filter(Boolean);
}

function HeroPlate({
  player,
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
}: {
  player: GameState["players"][number];
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
  onCardPreview?: (card: PlayableCard, el: HTMLElement) => void;
  onCardPreviewEnd?: () => void;
  onStrike?: () => void;
}) {
  const wasHit = floats.some((f) => f.delta < 0);
  const classes = [
    "hero-plate",
    enemy ? "enemy" : "me",
    wasHit ? "hit" : "",
    // A plate cannot be both the thing you are about to hit and the thing
    // quietly announcing whose turn it is — targetable's red wins.
    active && !targetable ? "active" : "",
    thinking ? "thinking" : "",
    targetable ? "targetable" : "",
    player.heroDivineShield ? "is-shielded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const backs = Math.min(player.hand.length, 10);
  const canStrike = enemy && targetable && Boolean(onStrike);
  return (
    <button
      type="button"
      className={classes}
      data-hero={player.id}
      onClick={canStrike ? onStrike : undefined}
      aria-disabled={canStrike ? undefined : true}
      title={canStrike ? "Strike the enemy hero!" : undefined}
    >
      <span className="hero-sigil" title={`${player.name}'s sigil`}>
        <HeroSigil playerId={player.id} />
      </span>
      <span className="hero-name">
        <strong>
          {player.name}
          <span className="hero-think" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </strong>
      </span>
      {enemy && revealedHand && library ? (
        <span className="revealed-hand" title="The Watcher reveals this hand">
          {revealedHand.map((cardId, index) => {
            const card = library[cardId];
            return card ? (
              <span
                key={`${cardId}-${index}`}
                className="revealed-hand-card"
                title={card.name}
                onMouseEnter={onCardPreview ? (e) => onCardPreview(card, e.currentTarget) : undefined}
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

/**
 * The banner that hangs over the board while a targeted effect waits. It is a
 * strip rather than a modal on purpose: you pick the victim by clicking it on
 * the real board, so covering the board would defeat the whole feature.
 */
function TargetPrompt({
  pending,
  library,
  botControlled,
  onChoose,
}: {
  pending: PendingTarget;
  library: CardLibrary;
  botControlled: boolean;
  onChoose: (choiceIndex: number) => void;
}) {
  const card = library[pending.sourceCardId];
  const hint = botControlled
    ? "The practice bot is choosing…"
    : pending.kind === "board" || pending.kind === "boardOrCore"
      ? `Click a highlighted minion — ${pending.options.length} legal targets.`
      : pending.kind === "hand"
        ? "Their hand, face up. Pick one."
        : "Pick a value.";
  return (
    <div className={pending.kind === "board" ? "target-prompt" : "target-prompt interactive"} role="status">
      <div className="target-prompt-head">
        {card ? <img className="target-prompt-art" src={card.art} alt="" draggable={false} /> : null}
        <div className="target-prompt-text">
          <strong>{pending.sourceName}</strong>
          <span>{pending.prompt}</span>
          <small>{hint}</small>
        </div>
      </div>

      {/* Hand targeting reveals the hand it is reaching into — that reveal IS
          the effect, so there is nothing to hide from the other player. */}
      {pending.kind === "hand" ? (
        <div className="prompt-hand">
          {pending.handOptions.map((option, choiceIndex) => (
            <button
              type="button"
              key={`${option.cardId}-${option.index}`}
              className="prompt-hand-card"
              disabled={botControlled}
              onClick={() => onChoose(choiceIndex)}
              title={library[option.cardId]?.name}
            >
              {library[option.cardId] ? <CardFace card={playableFace(library[option.cardId])} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {pending.kind === "boardOrCore" && pending.coreOption ? (
        <div className="prompt-values">
          <button
            type="button"
            className="prompt-value prompt-core-choice"
            disabled={botControlled}
            onClick={() => onChoose(pending.options.length)}
          >
            Enemy Core
          </button>
        </div>
      ) : null}

      {pending.kind === "option" ? (
        <div className="prompt-values">
          {pending.labelOptions.map((option, choiceIndex) => (
            <button
              type="button"
              key={option.value}
              className={library[option.value] ? "prompt-value prompt-card-choice" : "prompt-value"}
              disabled={botControlled}
              onClick={() => onChoose(choiceIndex)}
              title={library[option.value] ? `${option.label}: ${library[option.value].effect}` : option.label}
              aria-label={library[option.value] ? `${option.label}. ${library[option.value].effect}` : option.label}
            >
              {library[option.value] ? <CardFace card={playableFace(library[option.value])} /> : option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The full-screen moment when a Mythic hits the board. Deliberately
 * `pointer-events: none` and self-clearing on a timer — a celebration must never
 * be able to swallow a click or wedge a turn.
 */
function MythicSplash({ minion }: { minion: MinionInstance }) {
  return (
    <div className="mythic-splash" aria-hidden="true">
      <span className="mythic-rays" />
      {/* The entrance, upgraded: the screen tears open, a shockwave leaves the
          card, and the name arrives letter by letter. This is the loudest moment
          in a duel and it now takes as much room as it deserves. */}
      <span className="mythic-tear" />
      <span className="mythic-shock" />
      <span className="mythic-shock mythic-shock-2" />
      <div className="mythic-body">
        <div className="mythic-art">
          <img src={minion.art} alt="" draggable={false} />
        </div>
        <div className="mythic-text">
          <span className="mythic-tier">Mythic</span>
          <strong>
            {minion.name.split("").map((letter, index) => (
              <span key={index} style={{ animationDelay: `${180 + index * 34}ms` } as CSSProperties}>
                {letter === " " ? " " : letter}
              </span>
            ))}
          </strong>
          <em>{minion.origin}</em>
        </div>
      </div>
    </div>
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

function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <ol className="event-log">
      {events.slice(-30).reverse().map((event, index) => (
        <li key={`${event.text}-${index}`} className={`event-${event.kind}`}>
          {event.text}
        </li>
      ))}
    </ol>
  );
}

function HoverCard({ hover }: { hover: NonNullable<HoverState> }) {
  // Bigger than it used to be, and no text panel underneath: the face prints its
  // own effect and flavour now, so this IS the readable copy of the card.
  const width = 300;
  const height = hover.extraEffects.length ? 492 : 440;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = hover.rect.right + 14;
  if (left + width > viewportW - 10) left = hover.rect.left - width - 14;
  if (left < 10) left = 10;
  let top = (hover.rect.top + hover.rect.bottom) / 2 - height / 2;
  top = Math.max(10, Math.min(top, viewportH - height - 10));
  return (
    <aside className="hover-preview" style={{ left, top, width }} aria-hidden="true">
      <CardFace
        card={hover.face}
        atkClass={hover.atkClass}
        hpClass={hover.hpClass}
        effect={hover.effect}
        flavor={hover.flavor}
        states={hover.states}
        onBoard={hover.onBoard}
      />
      {hover.extraEffects.length ? <span className="hover-extra-effect">{hover.extraEffects.join(" • ")}</span> : null}
    </aside>
  );
}

function DrawChoiceOverlay({
  game,
  library,
  onChoose,
  locked = false,
}: {
  game: GameState;
  library: CardLibrary;
  onChoose: (action: GameAction) => void;
  /** True while the practice bot owns this draw — the human must not pick for it. */
  locked?: boolean;
}) {
  const drawChoice = game.drawChoice;
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  if (!drawChoice) return null;
  return (
    <div className="overlay">
      <section className={locked ? "draw-panel locked" : "draw-panel"}>
        <span>Draw Step</span>
        <h2>
          {locked
            ? `${game.players[drawChoice.player].name} is choosing…`
            : `${game.players[drawChoice.player].name}, inspect and choose`}
        </h2>
        <div className="choice-row">
          {drawChoice.cards.map((cardId, choiceIndex) => (
            <button
              type="button"
              key={cardId}
              className={selectedChoice === choiceIndex ? "choice-card selected" : "choice-card"}
              aria-pressed={selectedChoice === choiceIndex}
              disabled={locked}
              onClick={() => {
                if (selectedChoice === choiceIndex) {
                  sfx.play("draw");
                  onChoose({ type: "choose_draw", player: drawChoice.player, choiceIndex });
                } else {
                  sfx.play("button");
                  setSelectedChoice(choiceIndex);
                }
              }}
            >
              {library[cardId] ? <CardFace card={playableFace(library[cardId])} /> : null}
            </button>
          ))}
        </div>
        <div className="choice-detail">
          <button
            type="button"
            className="primary"
            disabled={locked || selectedChoice === null}
            onClick={() => {
              if (selectedChoice === null) return;
              sfx.play("draw");
              onChoose({ type: "choose_draw", player: drawChoice.player, choiceIndex: selectedChoice });
            }}
          >
            {locked ? "Bot is choosing" : selectedChoice === null ? "Pick a card" : "Choose Card"}
          </button>
        </div>
      </section>
    </div>
  );
}

function GameOver({
  game,
  library,
  vsBot,
  onRestart,
  onMenu,
}: {
  game: GameState;
  library: CardLibrary;
  vsBot: boolean;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const draw = game.winner === "draw";
  const winnerId: PlayerId | null = typeof game.winner === "number" ? game.winner : null;
  const winner = winnerId !== null ? game.players[winnerId] : null;
  const loser = winnerId !== null ? game.players[otherPlayer(winnerId)] : null;
  const title = draw ? "Mutual Annihilation" : winner ? `${winner.name} Wins` : "Game Over";
  const resultLabel = draw ? "Both Cores Collapse" : "Core Collapsed";
  // The winner's parade: whatever they still had standing when it ended. The
  // duel is decided by which board survives, so the board IS the trophy.
  const survivors = winner ? winner.board.filter((minion): minion is MinionInstance => Boolean(minion)) : [];
  const banner = winner ? biggestSurvivor(winner) : null;
  const bannerArt = banner?.art ?? library[game.players[0].hand[0]]?.art;
  const botLine = vsBot ? (winner?.id === 1 ? "The practice bot takes it." : "You beat the practice bot.") : null;
  return (
    <div className={draw ? "overlay result-overlay draw" : "overlay result-overlay"}>
      <div className="result-rays" aria-hidden="true" />
      <section className="result-panel grand">
        {bannerArt && !draw ? (
          <div className="result-hero" aria-hidden="true">
            <img src={bannerArt} alt="" draggable={false} />
          </div>
        ) : null}
        <span className="result-label">{resultLabel}</span>
        <h2 className="result-title">{title}</h2>
        <p className="result-sub">
          The rift stabilizes after {game.turnNumber} turns.
          {botLine ? ` ${botLine}` : ""}
        </p>
        <div className="result-stats">
          {game.players.map((player) => (
            <div key={player.id} className={winner && player.id === winner.id ? "winner" : ""}>
              <span>{player.name}</span>
              <strong>{Math.max(0, player.health)}</strong>
              <small>final core</small>
            </div>
          ))}
        </div>
        {survivors.length ? (
          <div className="result-survivors">
            <span>Still standing{loser ? ` against ${loser.name}` : ""}</span>
            <div className="survivor-row">
              {survivors.map((minion) => (
                <figure key={minion.instanceId}>
                  <img src={minion.art} alt="" draggable={false} />
                  <figcaption>{minion.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
        <div className="gameover-buttons">
          <button type="button" className="primary" onClick={onRestart}>Rematch</button>
          <button type="button" onClick={onMenu}>Menu</button>
        </div>
      </section>
    </div>
  );
}

function canAttackCore(legalActions: GameAction[], selection: Selection): boolean {
  return (
    selection?.kind === "attacker" &&
    legalActions.some((action) => action.type === "attack_core" && action.attackerSlot === selection.slotIndex)
  );
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** The winner's proudest survivor, for the victory screen's parade image only. */
function biggestSurvivor(player: GameState["players"][number]): MinionInstance | null {
  let best: MinionInstance | null = null;
  for (const minion of player.board) {
    if (!minion) continue;
    if (!best || minion.cost > best.cost || (minion.cost === best.cost && minion.atk + minion.hp > best.atk + best.hp)) {
      best = minion;
    }
  }
  return best;
}

function statClass(current: number, base: number): string {
  if (current > base) return "is-buffed";
  if (current < base) return "is-hurt";
  return "";
}

