import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./App.css";
// Board effects (camp signatures, the Mythic entrance, the killing blow). Loaded
// HERE, immediately after App.css, on purpose: that is the exact cascade slot
// they occupied when they lived in screens/Screens.css, so moving the file could
// not change which rule wins anything.
import "./board-fx.css";
// Ross mode is a deliberate, secret developer surface that the owner can use
// in the published game too. Keep its styling separate from the main board
// stylesheet so the mode remains easy to audit without hiding the feature from
// the public build.
import "./dev-only.css";
import { sfx, type SfxName } from "./audio/sfx";
import { cards, relics } from "./data/cards";
import { LORE_DETAILS, type LoreDetail } from "./data/lore";
import { chooseBotAction, BOT_CHEATS } from "./engine/bot";
import {
  HERO_POWER_COST,
  HERO_POWER_UNLOCK_ORDER,
  firstUnlockedHeroPower,
  heroPowerDefinition,
  isHeroPowerUnlocked,
  randomHeroPower,
} from "./engine/hero-powers";
import { isMinionCard, isRelicCard } from "./engine/types";
import {
  actionKey,
  applyAction,
  attacksRandomly,
  createInitialGame,
  effectiveCardCost,
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
  HeroPowerId,
  MinionInstance,
  PendingTarget,
  PlayerId,
  PlayableCard,
  RelicDefinition,
  RelicInstance,
  SlotAuraId,
} from "./engine/types";
import { clearSave, loadGame, saveGame } from "./storage";
import {
  botWins,
  clearProgress,
  emptyProgress,
  finishDuel,
  loadProgress,
  saveProgress,
  totals,
  unlockAllProgress,
  type Progress,
} from "./progress";
import {
  UNLOCK_REWARD,
  ensureUnlockOrder,
  newlyUnlocked,
  revealOrder,
  unlockedPool,
} from "./unlocks";
import { fitOneLine, fitParagraph, onFontsReady } from "./textfit";
import { loadPlayerCount } from "./playerCount";
import { createDuelSeed } from "./duelSeed";
import { spawnTestMinion } from "./engine/test-utils";
import {
  DuelIntro,
  HowToPlay,
  PassScreen,
  SettingsPanel,
  HeroPowersScreen,
  TitleScreen,
  type DuelIntroPhase,
  type GameMode,
  RecordScreen,
} from "./screens/Screens";

type Selection =
  | { kind: "hand"; handIndex: number }
  | { kind: "attacker"; slotIndex: number }
  | null;

const STAR_CHART_AXES = ["STR", "TUF", "WIL", "MAG", "INT", "AGI"] as const;

function heroPowersForDuel(
  mode: GameMode,
  playerPower: HeroPowerId | null,
  seed: string,
): [HeroPowerId | null, HeroPowerId | null] {
  return mode.kind === "hotseat" ? [playerPower, playerPower] : [playerPower, randomHeroPower(seed)];
}

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

function playableFace(card: PlayableCard, costOverride?: number): CardFaceModel {
  const face = isRelicCard(card) ? relicFace(card) : card;
  return costOverride === undefined || face.cost === costOverride ? face : { ...face, cost: costOverride };
}

function loreFor(card: PlayableCard): LoreDetail | null {
  return LORE_DETAILS[card.id] ?? null;
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
  motion: "death" | "return" | "stasis";
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
   * Which camp is arriving. Only set on a summon, and only four signatures were
   * built rather than one bespoke effect per card — the board reads far richer
   * for a fraction of the work, and a player learns the camp language in one
   * duel.
   */
  camp?: Camp;
};
/**
 * A card leaving the deck. `from`/`to` are viewport coordinates measured off the
 * real deck pile and the real destination at spawn time — the same technique the
 * attacker lunge uses, and the reason the flight lands where the card actually
 * goes at any window size.
 */
type Flight = {
  id: number;
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  mine: boolean;
  opening?: boolean;
  delayMs?: number;
};
type DuelIntroState = { id: number; phase: DuelIntroPhase };
type BoardToast = { id: number; text: string; durationMs: number; tone: "normal" | "bargain" };

// Keep this schedule aligned with the opening animation table in the project
// README. The intro ends after the mana reveal; opening card flights continue
// as pointer-free visual polish instead of blocking the first action.
const DUEL_INTRO_TIMINGS = {
  preludeMs: 1_860,
  revealMs: 1_680,
  drawMs: 3_430,
  manaMs: 570,
  exitMs: 315,
} as const;
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
  slot_chain: "CHAINED",
  slot_grow_1: "+1/+1",
  slot_grow_2: "+2/+2",
  slot_protected: "SAFE",
  slot_stats_one: "1/1",
};
const AURA_TEXT: Record<SlotAuraId, string> = {
  random_attacks: "a minion here can only attack at random",
  slot_silence: "a minion here is silenced",
  slot_chain: "a minion here is permanently Chained",
  slot_grow_1: "a minion here gains +1/+1 at the start of your turn",
  slot_grow_2: "a minion here gains +2/+2 at the start of your turn",
  slot_protected: "minions here resist Silence, Freeze, and Chain; attacks and ordinary removal can still reach them",
  slot_stats_one: "minions here are permanently set to 1/1",
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
};

const BOT_ID: PlayerId = 1;

/**
 * The one cheat the engine has to know about, because the draw it changes
 * happens deep inside `beginTurn` where nothing knows which seat is a bot.
 * Every other cheat lives in the bot's own search. Hotseat grants it to nobody.
 */
function foresightSeat(mode: GameMode): PlayerId | null {
  return mode.kind === "bot" && BOT_CHEATS[mode.skill].foresight ? BOT_ID : null;
}
const BOT_DELAY_MS = 620;
const BOT_FIRST_DELAY_MS = 900;

const openingEvent: GameEvent = {
  kind: "info",
  text: "The rift opens. Player One begins.",
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeParticles(kind: ImpactKind | "death" | "stasis", camp?: Camp): Particle[] {
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
  } else if (kind === "stasis") {
    // Stasis is suspension, not destruction: a small cyan lattice contracts
    // around the card while square motes hang in place instead of flying out
    // as death debris.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = rand(42, 78);
      push(Math.cos(a) * d, Math.sin(a) * d * 0.72, rand(3, 6), rand(0, 0.18), rand(0, 90), rand(0.65, 0.95));
    }
  } else {
    // death: a controlled burst of fragments with staggered timing. The card
    // itself supplies the break; these are the sparks and fragments around it.
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(28, 112);
      push(Math.cos(a) * d, Math.sin(a) * d * 0.78, rand(3, 8), rand(0, 0.16), rand(-320, 320), rand(0.54, 0.86));
    }
  }
  return out;
}

export default function App() {
  // The FULL roster, always. A restricted pool decides what a new duel is dealt
  // from; it must never decide what the engine can resolve. A saved duel, a
  // minion already on the board, or a card copied out of the enemy's hand can
  // all name a card that is not currently unlocked, and every one of them has to
  // keep working.
  const library = useMemo(() => makeCardLibrary(cards, relics), []);
  /**
   * The unlocked slice of the roster: what a NEW duel is dealt from.
   *
   * Restricting the deck is the whole of the feature, because every effect that
   * fetches a card — summon-from-deck, the relic grants, the Discover offers —
   * reads `state.deck` rather than the library. Cut the deck and they are all
   * cut with it, with no per-effect work at all.
   */
  const initialProgress = useMemo(() => ensureUnlockOrder(loadProgress(), [...cards, ...relics]), []);
  /**
   * The only thing in this game that outlives a duel. Held in state so the title
   * screen and the gallery re-render the moment a duel is folded in, and written
   * straight through to localStorage whenever it changes.
   */
  const [progress, setProgress] = useState<Progress>(initialProgress);
  // The unlock order is generated on the first load that ever runs, and it has
  // to reach disk before the first duel ends — otherwise the pack that duel
  // hands over would be torn from an order nothing had saved.
  useEffect(() => {
    if (initialProgress.unlockOrder.length) saveProgress(initialProgress);
  }, [initialProgress]);
  const pool = useMemo(() => {
    const ids = new Set(unlockedPool(progress.unlockOrder, progress.unlocked));
    if (!ids.size) return { cards, relics };
    return { cards: cards.filter((card) => ids.has(card.id)), relics: relics.filter((relic) => ids.has(relic.id)) };
  }, [progress.unlockOrder, progress.unlocked]);
  // A duel in progress is restored from localStorage; anything unreadable or
  // from an older engine falls back to a fresh game (see storage.ts).
  const restored = useMemo(() => loadGame(), []);
  const [game, setGame] = useState(() => {
    if (!restored) return createInitialGame(pool.cards, createDuelSeed(), pool.relics);
    if (restored.mode.kind !== "bot" || restored.game.heroPowers[1]) return restored.game;
    return {
      ...restored.game,
      heroPowers: heroPowersForDuel(restored.mode, restored.game.heroPowers[0], String(restored.game.rngSeed)),
    };
  });
  const [hasLiveSave, setHasLiveSave] = useState(() => Boolean(restored));
  const [events, setEvents] = useState<GameEvent[]>(() =>
    restored ? [...restored.events, { kind: "info" as const, text: "Duel restored from your last session." }] : [openingEvent],
  );
  const [mode, setMode] = useState<GameMode>(() => restored?.mode ?? { kind: "hotseat" });
  const vsBot = mode.kind === "bot";
  // The front door. A restored duel still starts here rather than dumping a
  // returning player straight onto a board they left hours ago.
  const [screen, setScreen] = useState<"title" | "playing">("title");
  const [duelIntro, setDuelIntro] = useState<DuelIntroState | null>(null);
  const [overlay, setOverlay] = useState<null | "settings" | "howToPlay" | "gallery" | "record" | "heroPowers">(null);
  const [developerCheatRevealed, setDeveloperCheatRevealed] = useState(false);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [developerDuelActive, setDeveloperDuelActive] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  /**
   * The pack a just-won duel earned, waiting to be torn open. Null whenever
   * there is nothing to open — a loss that earned one card still fills it, and
   * hotseat never does.
   */
  const [pack, setPack] = useState<string[] | null>(null);
  const initialBotWinCount = initialProgress.developerCheat ? HERO_POWER_UNLOCK_ORDER.length : botWins(initialProgress);
  const [selectedHeroPower, setSelectedHeroPower] = useState<HeroPowerId | null>(() => firstUnlockedHeroPower(initialBotWinCount));
  const botWinCount = useMemo(
    () => (progress.developerCheat ? HERO_POWER_UNLOCK_ORDER.length : botWins(progress)),
    [progress],
  );
  const totalDuels = useMemo(() => totals(progress).played, [progress]);
  useEffect(() => {
    const first = firstUnlockedHeroPower(botWinCount);
    setSelectedHeroPower((current) => (current && isHeroPowerUnlocked(current, botWinCount) ? current : first));
  }, [botWinCount]);

  useEffect(() => {
    if (screen !== "title" || overlay !== null) return;
    let buffer = "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      buffer = `${buffer}${event.key.toLowerCase()}`.slice(-4);
      if (buffer === "ross") {
        setDeveloperCheatRevealed(true);
        sfx.play("button", 0.08);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, overlay]);
  /**
   * What THIS duel has shown the viewer, as a ref rather than state: it changes
   * several times a turn, nothing renders from it until the duel ends, and making
   * it state would re-render the whole board on every draw for no visible reason.
   */
  const duelCards = useRef<{ seen: Set<string>; played: Set<string> }>({ seen: new Set(), played: new Set() });
  /** One duel folds into the record once, however many times game over renders. */
  const duelRecorded = useRef(false);
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
  const [toast, setToast] = useState<BoardToast | null>(null);
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

  // A fresh duel has a complete opening state immediately, but the player
  // should experience that state arriving in beats. The intro is view-only:
  // it never changes the engine state, it only unlocks the already-created
  // board after the rift, opening deal, and mana reveal have landed.
  useEffect(() => {
    if (!duelIntro) return;
    const { id, phase } = duelIntro;
    const moveTo = (nextPhase: DuelIntroPhase) => {
      setDuelIntro((current) => (current && current.id === id ? { ...current, phase: nextPhase } : current));
    };

    if (phase === "prelude") {
      const timer = window.setTimeout(() => moveTo("reveal"), DUEL_INTRO_TIMINGS.preludeMs);
      return () => window.clearTimeout(timer);
    }
    if (phase === "reveal") {
      sfx.play("turn", 0.08);
      const timer = window.setTimeout(() => moveTo("draw"), DUEL_INTRO_TIMINGS.revealMs);
      return () => window.clearTimeout(timer);
    }
    if (phase === "draw") {
      const frame = window.requestAnimationFrame(() => {
        spawnOpeningDeal();
      });
      const timer = window.setTimeout(() => moveTo("mana"), DUEL_INTRO_TIMINGS.drawMs);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (phase === "mana") {
      sfx.play("mana", 0.08);
      const timer = window.setTimeout(() => moveTo("exit"), DUEL_INTRO_TIMINGS.manaMs);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => setDuelIntro((current) => (current?.id === id ? null : current)),
      DUEL_INTRO_TIMINGS.exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [duelIntro]);

  // Persist after every change. A finished duel is not worth resuming, so the
  // slot is cleared instead of holding a game-over screen forever.
  useEffect(() => {
    if (tutorialActive || developerDuelActive || game.phase === "gameOver") {
      clearSave();
      setHasLiveSave(false);
    } else if (screen === "playing") {
      saveGame(game, events, mode, Date.now());
      setHasLiveSave(true);
    }
  }, [game, events, mode, screen, tutorialActive, developerDuelActive]);

  // The practice opponent. One move per tick, driven off the current state, so
  // it walks through draw picks and targeting prompts exactly like a human does
  // and the animations get to play between its moves.
  useEffect(() => {
    if (mode.kind !== "bot" || screen !== "playing" || duelIntro) return;
    const action = chooseBotAction(game, library, BOT_ID, mode.skill);
    if (!action) return;
    const timer = window.setTimeout(() => perform(action), game.phase === "main" ? BOT_DELAY_MS : BOT_FIRST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [game, mode, screen, library, duelIntro]);

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

  // A card counts as SEEN once it has been in your hand. Watching the hand
  // rather than the draw event means a card that arrives by Discover, by theft,
  // by a Battlecry or by any future route is counted the same way, with nothing
  // to keep in sync. In hotseat both seats are the player, so both count.
  useEffect(() => {
    const ledger = duelCards.current;
    const hands = vsBot ? [game.players[0].hand] : [game.players[0].hand, game.players[1].hand];
    for (const hand of hands) for (const cardId of hand) ledger.seen.add(cardId);
  }, [game, vsBot]);
  const seatOwner = game.phase === "mulligan" && game.mulligan ? game.mulligan.player : game.activePlayer;
  const curtainUp =
    mode.kind === "hotseat" && screen === "playing" && game.phase !== "gameOver" && seatOwner !== seatedPlayer;

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
    if (screen !== "playing" || game.phase === "gameOver" || curtainUp || duelIntro) return;
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
  }, [game.activePlayer, game.phase, screen, curtainUp, viewerId, vsBot, duelIntro]);

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

        /**
         * Set a core to any value, so a duel can be brought to the brink.
         *
         * Added for the card-pack screen, which only exists after a duel ends
         * and was otherwise reachable only by playing twenty real turns. It does
         * NOT end the duel by itself, on purpose: the phase flip belongs to the
         * engine's own win check, so a duel finished this way finishes through
         * exactly the path a real one takes. Drop a core to 1, swing at it, and
         * everything downstream — the record, the reward, the pack — runs for
         * real.
         */
        setCore(side = "them", value = 1) {
          const owner = sideOf(side);
          setGame((current) => {
            const players = [...current.players] as GameState["players"];
            players[owner] = { ...players[owner], health: value };
            return { ...current, players };
          });
          return `${side} core = ${value}`;
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
  const viewerCanAct = (game.phase === "mulligan" && game.mulligan?.player === viewerId) || myTurn;
  // Every affordance and click reads this. Empty while the opponent is thinking,
  // so nothing lights up and nothing can be clicked on their behalf.
  const uiActions = viewerCanAct && !duelIntro ? legalActions : [];

  function clearFx() {
    setFloats([]);
    setGhosts([]);
    setImpacts([]);
    setLunge(null);
    setSplash(null);
    setToast(null);
    setHover(null);
    setDrag(null);
    setFlights([]);
    setManaFx(null);
    setBanner(null);
  }

  /** Sends the already-dealt opening hand out of the deck in a single deal. */
  function spawnOpeningDeal() {
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

    myTargets.slice(0, game.players[viewerId].hand.length).forEach((card, index) => {
      addFlight(card.getBoundingClientRect(), true, index * 630);
    });

    if (targetBox) {
      Array.from({ length: game.players[opponentId].hand.length }, (_, index) => {
        addFlight(targetBox, false, 330 + index * 630);
      });
    }

    if (!flights.length) return;
    setFlights((current) => [...current, ...flights]);
    flights.forEach((flight) => sfx.play("draw", (flight.delayMs ?? 0) / 1000));
    const ids = new Set(flights.map((flight) => flight.id));
    window.setTimeout(() => setFlights((current) => current.filter((flight) => !ids.has(flight.id))), 6_300);
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
    const stasisIds = new Set<string>();
    resultEvents.forEach((event) => {
      if (event.motion === "return" && event.instanceId && event.player !== undefined) {
        returningOwners.set(event.instanceId, event.player);
      }
      if (event.motion === "stasis" && event.instanceId) stasisIds.add(event.instanceId);
    });
    // Equipping an Ascension Relic is a deliberate power-spike moment, not a
    // normal card-play click. The relic's own universe theme replaces the old
    // one-size-fits-all fanfare; generated/effect-driven equips carry cardId too.
    const equippedRelicId = resultEvents.find(
      (event) => event.kind === "effect" && /\bequips\b/i.test(event.text) && event.cardId?.startsWith("r"),
    )?.cardId;
    if (equippedRelicId) sfx.playCardTheme(equippedRelicId, 0.05);
    else if (resultEvents.some((event) => event.kind === "effect" && /\bequips\b/i.test(event.text))) sfx.play("relicEquip", 0.05);

    before.forEach((entry, id) => {
      const now = after.get(id);
      if (!now) {
        const destinationOwner = returningOwners.get(id);
        const motion = stasisIds.has(id) ? "stasis" : destinationOwner === undefined ? "death" : "return";
        newGhosts.push({
          id: fxId.current++,
          owner: entry.owner,
          slot: entry.slot,
          minion: entry.minion,
          delay: strikeDelay,
          particles: makeParticles(motion === "stasis" ? "stasis" : "death"),
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
      newGhosts.forEach((g, i) =>
        sfx.play(g.motion === "stasis" ? "freeze" : g.motion === "return" ? "draw" : "death", g.delay + i * 0.07),
      );
      const ids = new Set(newGhosts.map((g) => g.id));
      window.setTimeout(() => setGhosts((cur) => cur.filter((g) => !ids.has(g.id))), 1020);
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
    const hiddenEnemyDiscover =
      action.type === "choose_target" &&
      game.pendingTarget?.player !== viewerId &&
      Boolean(game.pendingTarget?.effectId.startsWith("discover_"));
    const bargainChoice =
      action.type === "choose_target" && game.pendingTarget?.effectId === "strange_bargain"
        ? game.pendingTarget.labelOptions[action.choiceIndex]?.label
        : undefined;
    // Read the played card off the state the player acted ON: once the action
    // is applied the card has left the hand and the index means something else.
    if (
      (action.type === "play_card" || action.type === "play_relic") &&
      (!vsBot || action.player === viewerId)
    ) {
      const playedId = game.players[action.player].hand[action.handIndex];
      if (playedId) duelCards.current.played.add(playedId);
    }
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
      if (bargainChoice) showToast(`Doctor Strange's bargain chosen: ${bargainChoice}`, 3000, "bargain");

      // Tutorial lessons advance from the action that just happened, not from
      // the entire event log. The old event-derived calculation could observe
      // the bot's automatic response after a Taunt attack and jump from the
      // attack lesson straight to completion. Keep the guide on the exact
      // interaction the player completed.
      if (tutorialActive && !tutorialCompleted && action.player === viewerId) {
        let nextStep: number | null = null;
        if (result.state.phase === "targeting" && result.state.pendingTarget?.player === viewerId) {
          nextStep = 3;
        } else if (action.type === "play_card" || action.type === "play_relic") {
          nextStep = 1;
        } else if (action.type === "choose_target") {
          nextStep = 3;
        } else if (action.type === "attack_minion" || action.type === "attack_core") {
          nextStep = 3;
        }
        if (action.type === "end_turn") {
          // The first body is asleep until the next turn. Passing advances to
          // the combat lesson once the Recruit has finished its turn.
          setTutorialStep((current) => (current === 1 ? 2 : current));
        } else if (nextStep !== null) {
          setTutorialStep((current) => Math.max(current, nextStep));
        }
        if (action.type === "choose_target" && tutorialStep === 3 && result.state.phase !== "targeting") {
          setTutorialStep(3);
          setTutorialCompleted(true);
        }
      }
    }
    const visibleEvents = hiddenEnemyDiscover
      ? result.events.map((event) =>
          event.kind === "draw" || event.kind === "effect"
            ? { ...event, text: "The opponent resolves a Discover effect." }
            : event,
        )
      : result.events;
    setEvents((items) => [...items, ...visibleEvents].slice(-80));
  }

  /**
   * Folds the finished duel into the permanent record, exactly once.
   *
   * It runs from an effect rather than from the action handler because a duel
   * can also end on the BOT's move, on a Deathrattle resolving inside somebody
   * else's action, or on a restored save that was already over. Watching the
   * phase catches every one of those; hooking the handler caught only the first.
   */
  useEffect(() => {
    if (game.phase !== "gameOver" || duelRecorded.current || tutorialActive || developerDuelActive) return;
    duelRecorded.current = true;
    const next = finishDuel(
      progress,
      { winner: game.winner, viewerId, mode, turns: game.turnNumber, at: Date.now() },
      { seen: [...duelCards.current.seen], played: [...duelCards.current.played] },
    );
    setProgress(next);
    saveProgress(next);
    // The pack is read from the two counts rather than recomputed from the
    // reward table, so the cards torn out of it are exactly the cards the record
    // just committed. Recomputing here is how the screen and the save drift.
    const earned = newlyUnlocked(next.unlockOrder, progress.unlocked, next.unlocked);
    if (earned.length) setPack(earned);
  }, [game.phase, game.winner, game.turnNumber, mode, viewerId, progress, tutorialActive, developerDuelActive]);

  function restart() {
    sfx.play("button");
    sfx.unlock();
    sfx.stopCardTheme();
    clearSave();
    setTutorialActive(false);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(false);
    setDeveloperToolsOpen(false);
    duelCards.current = { seen: new Set(), played: new Set() };
    duelRecorded.current = false;
    setPack(null);
    setDuelIntro({ id: fxId.current++, phase: "prelude" });
    // A restart keeps the mode, so it keeps the opponent's cheats too.
    const seed = createDuelSeed();
    setGame(
      createInitialGame(pool.cards, seed, pool.relics, {
        foresightFor: foresightSeat(mode),
        heroPowers: heroPowersForDuel(mode, selectedHeroPower, seed),
      }),
    );
    setHistory([]);
    setSelection(null);
    clearFx();
    setSeatedPlayer(0);
    setLethal(0);
    heraldSaid.current = new Set();
    sfx.playOpeningCue(0.35);
    setEvents([{ kind: "info", text: "A new shared deck is prepared." }]);
  }

  function activateDeveloperCheat() {
    const next = unlockAllProgress(progress);
    setProgress(next);
    saveProgress(next);
    setSelectedHeroPower(firstUnlockedHeroPower(HERO_POWER_UNLOCK_ORDER.length));
  }

  function resetDeveloperProgress() {
    clearProgress();
    const next = ensureUnlockOrder(emptyProgress(), [...cards, ...relics]);
    setProgress(next);
    saveProgress(next);
    setSelectedHeroPower(null);
    setDeveloperCheatRevealed(false);
  }

  /** Starts a fresh duel in the chosen mode, straight from the title screen. */
  function beginDuel(next: GameMode, options: { testCardId?: string } = {}) {
    sfx.play("button");
    sfx.unlock();
    sfx.stopCardTheme();
    clearSave();
    setTutorialActive(false);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(Boolean(options.testCardId));
    setDeveloperToolsOpen(false);
    duelCards.current = { seen: new Set(), played: new Set() };
    duelRecorded.current = false;
    setPack(null);
    setDuelIntro({ id: fxId.current++, phase: "prelude" });
    setMode(next);
    const seed = createDuelSeed();
    const nextGame = createInitialGame(pool.cards, seed, pool.relics, {
      foresightFor: foresightSeat(next),
      heroPowers: heroPowersForDuel(next, selectedHeroPower, seed),
    });
    if (options.testCardId && library[options.testCardId]) {
      nextGame.players[0].hand = [options.testCardId, ...nextGame.players[0].hand].slice(0, 10);
      nextGame.cheatMode = true;
    }
    setGame(nextGame);
    setHistory([]);
    setSelection(null);
    clearFx();
    setSeatedPlayer(0);
    heraldSaid.current = new Set();
    sfx.playOpeningCue(0.35);
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

  /** Starts the real rules engine in a deterministic teaching position. */
  function beginTutorial() {
    sfx.play("button");
    sfx.unlock();
    sfx.stopCardTheme();
    clearSave();
    setTutorialActive(true);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(false);
    setDeveloperToolsOpen(false);
    duelCards.current = { seen: new Set(), played: new Set() };
    duelRecorded.current = false;
    setPack(null);
    setDuelIntro({ id: fxId.current++, phase: "prelude" });
    // `easy` is the Recruit AI. It keeps the real bot loop while the curated
    // Goblins Taunt body stays on the board as the first combat lesson.
    setMode({ kind: "bot", skill: "easy" });
    const seed = createDuelSeed();
    setGame(
      createInitialGame(cards, seed, relics, {
        heroPowers: ["core_heal", null],
        tutorial: true,
      }),
    );
    setHistory([]);
    setSelection(null);
    clearFx();
    setSeatedPlayer(0);
    setLethal(0);
    heraldSaid.current = new Set();
    sfx.playOpeningCue(0.35);
    setEvents([{ kind: "info", text: "Tutorial started. Follow the Rift guide." }]);
    setScreen("playing");
  }

  function toTitle() {
    sfx.play("button");
    sfx.stopCardTheme();
    setDuelIntro(null);
    setTutorialActive(false);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(false);
    setDeveloperToolsOpen(false);
    setScreen("title");
  }

  /** Answers an open targeting prompt by naming a minion on the board. */
  function chooseTargetAt(owner: PlayerId, slotIndex: number): boolean {
    const pending = game.pendingTarget;
    // "slot" prompts are answered the same way, but an EMPTY slot is a valid answer.
    if (game.phase !== "targeting" || !pending) return false;
    if (pending.kind !== "board" && pending.kind !== "slot" && pending.kind !== "boardOrCore") return false;
    const choiceIndex = pending.options.findIndex((option) => option.owner === owner && option.slot === slotIndex);
    if (choiceIndex < 0) {
      sfx.play("invalid");
      return false;
    }
    perform({ type: "choose_target", player: pending.player, choiceIndex });
    return true;
  }

  /** Cancels a fresh target-card play and returns its card/mana through the engine. */
  function cancelTarget(): boolean {
    const pending = game.pendingTarget;
    if (!pending?.cancelPlay || pending.player !== viewerId) return false;
    const action = uiActions.find((candidate) => candidate.type === "cancel_target" && candidate.player === viewerId);
    if (!action) return false;
    sfx.play("button");
    perform(action);
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

  /** Infinite mana, exposed inside the Ross-only developer workbench. */
  function toggleCheatMode() {
    sfx.play("button");
    setDeveloperDuelActive(true);
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

  function developerSetMana() {
    setDeveloperDuelActive(true);
    setGame((current) => {
      const players = [...current.players] as GameState["players"];
      const player = players[viewerId];
      players[viewerId] = { ...player, mana: player.maxMana };
      return { ...current, players };
    });
    setEvents((items) => [...items, { kind: "info" as const, text: "Developer mode filled your mana." }].slice(-80));
  }

  function developerSetCore(owner: PlayerId, value: number) {
    setDeveloperDuelActive(true);
    setGame((current) => {
      const players = [...current.players] as GameState["players"];
      players[owner] = { ...players[owner], health: value };
      return { ...current, players };
    });
    setEvents((items) =>
      [...items, { kind: "info" as const, text: `Developer mode set ${owner === viewerId ? "your" : "the opponent's"} Core to ${value}.` }].slice(-80),
    );
  }

  function developerGiveCard(cardId: string, owner: PlayerId) {
    if (!library[cardId]) return;
    setDeveloperDuelActive(true);
    setGame((current) => {
      const players = [...current.players] as GameState["players"];
      if (players[owner].hand.length >= 10) return current;
      players[owner] = { ...players[owner], hand: [...players[owner].hand, cardId] };
      return { ...current, players };
    });
    setEvents((items) =>
      [...items, { kind: "info" as const, text: `Developer mode added ${library[cardId].name} to ${owner === viewerId ? "your" : "the opponent's"} hand.` }].slice(-80),
    );
  }

  function developerPlaceCard(cardId: string, owner: PlayerId) {
    const card = library[cardId];
    if (!card || !isMinionCard(card)) return;
    setDeveloperDuelActive(true);
    setGame((current) => {
      const players = [...current.players] as GameState["players"];
      const slotIndex = players[owner].board.findIndex((slot) => !slot);
      if (slotIndex < 0) return current;
      const board = [...players[owner].board];
      board[slotIndex] = spawnTestMinion(card, owner, { sleeping: false });
      players[owner] = { ...players[owner], board };
      return { ...current, players };
    });
    setEvents((items) =>
      [...items, { kind: "info" as const, text: `Developer mode placed ${card.name} on ${owner === viewerId ? "your" : "the opponent's"} board.` }].slice(-80),
    );
  }

  function developerEquipRelic(cardId: string, owner: PlayerId) {
    const relicDef = library[cardId];
    if (!relicDef || !isRelicCard(relicDef)) return;
    setDeveloperDuelActive(true);
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
      const slotIndex = board.findIndex((slot) => slot && (!slot.relic || !slot.relic2));
      if (slotIndex < 0) return current;
      const bearer = board[slotIndex];
      if (!bearer) return current;
      board[slotIndex] = bearer.relic ? { ...bearer, relic2: relic } : { ...bearer, relic };
      players[owner] = { ...players[owner], board };
      return { ...current, players };
    });
    setEvents((items) =>
      [...items, { kind: "info" as const, text: `Developer mode equipped ${relic.name} on the first available minion.` }].slice(-80),
    );
  }

  function developerClearBoard(owner: PlayerId) {
    setDeveloperDuelActive(true);
    setGame((current) => {
      const players = [...current.players] as GameState["players"];
      players[owner] = { ...players[owner], board: [null, null, null, null, null] };
      return { ...current, players };
    });
    setEvents((items) =>
      [...items, { kind: "info" as const, text: `Developer mode cleared ${owner === viewerId ? "your" : "the opponent's"} board.` }].slice(-80),
    );
  }

  function previewCard(card: PlayableCard, el: HTMLElement, owner?: PlayerId) {
    if (drag?.active) return;
    sfx.hoverTick();
    const r = el.getBoundingClientRect();
    setHover({
      face: playableFace(card, owner === undefined ? undefined : effectiveCardCost(game, owner, card)),
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
    if (duelIntro) return;
    if (game.phase === "targeting" && game.pendingTarget?.cancelPlay?.player === viewerId) {
      cancelTarget();
      return;
    }
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
  function showToast(text: string, durationMs = 1500, tone: BoardToast["tone"] = "normal") {
    const next = { id: fxId.current++, text, durationMs, tone };
    setToast(next);
    window.setTimeout(() => setToast((cur) => (cur && cur.id === next.id ? null : cur)), durationMs);
  }

  function onBoardSlot(owner: PlayerId, slotIndex: number) {
    if (duelIntro) return;
    const minion = game.players[owner].board[slotIndex];

    if (game.phase === "targeting") {
      const chosen = chooseTargetAt(owner, slotIndex);
      if (!chosen && game.pendingTarget?.cancelPlay?.player === viewerId) cancelTarget();
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

  // ------------------------------------------------------------- drag & drop
  function startHandDrag(e: React.PointerEvent<HTMLElement>, handIndex: number, playable: boolean) {
    if (duelIntro) return;
    // TOUCH HAS NO HOVER, and a hand card does not print its rules text — it is
    // 96px wide on a phone, where the text would be about five pixels. So the
    // only way to read a card you are holding was a hover that a finger cannot
    // produce. Pressing one now opens the same big preview a mouse gets, and
    // lifting off closes it (see endDrag / cancelDrag). A quick tap still
    // selects, because selection happens on click, not on pointerdown.
    if (e.pointerType === "touch") {
      const card = library[viewer.hand[handIndex]];
      if (card) previewCard(card, e.currentTarget, viewerId);
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
    if (duelIntro) return;
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
  // A bot's Discover/target prompt belongs to the hidden opponent. Keep the
  // engine prompt alive for the bot, but do not render its choices to the human.
  const pendingTarget =
    game.phase === "targeting" && game.pendingTarget?.player === viewerId ? game.pendingTarget : null;
  // Read off the state rather than asking the bot — chooseBotAction simulates
  // every legal move, which is far too much work to redo on every render.
  const botThinking =
    vsBot &&
    (game.phase === "mulligan"
      ? game.mulligan?.player === BOT_ID
      : game.phase === "main"
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
      if (overlay || curtainUp || duelIntro || pendingTarget || game.phase === "drawChoice" || game.phase === "mulligan") return;
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
  }, [screen, overlay, curtainUp, duelIntro, pendingTarget, game, endTurnAction, history.length]);

  return (
    <main
      className={[
        "hs-shell",
        drag?.active ? "grabbing" : "",
        tutorialActive ? "tutorial-mode" : "",
        developerDuelActive ? "developer-duel" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="table-glow" aria-hidden="true" />

      <div
        className={[
          "table-frame",
          shaking ? "shaking" : "",
          duelIntro ? "duel-opening" : "",
          duelIntro ? `duel-opening-${duelIntro.phase}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="top-strip">
        <div className="brand-mini">
          <span className="brand-mark" />
          <strong>Convergence</strong>
        </div>
        <div className="enemy-hero-wrap">
          <HeroPlate
            enemy
            player={opponent}
            heroPower={game.heroPowers[opponentId]}
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
          <HeroPowerCard definition={heroPowerDefinition(game.heroPowers[opponentId])} />
        </div>
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
          {developerCheatRevealed ? (
            <button
              type="button"
              className="developer-tools-trigger"
              onClick={() => setDeveloperToolsOpen(true)}
              title="Open developer tools"
            >
              DEV tools
            </button>
          ) : null}
          {/* The quick toggle stays available only in a live duel through the
              developer workbench. Keeping it out of the normal action rail
              makes Ross mode discoverable only to the person who knows the
              title-screen key, while the workbench remains fully useful. */}
          {import.meta.env.DEV ? (
            <button
              type="button"
              className={game.cheatMode ? "cheat-toggle active" : "cheat-toggle"}
              aria-pressed={game.cheatMode}
              onClick={toggleCheatMode}
              title={game.cheatMode ? "Infinite mana is on. Click to turn it off." : "Enable infinite mana"}
            >
              {game.cheatMode ? "⚡ Cheat On" : "⚡ Cheat Off"}
            </button>
          ) : null}
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

        <section
          className="battlefield"
          onClick={(event) => {
            if (event.target === event.currentTarget && game.pendingTarget?.cancelPlay?.player === viewerId) {
              cancelTarget();
            }
          }}
        >
          <BoardRow
            owner={opponentId}
            label={`${opponent.name}'s board`}
            game={game}
            legalActions={uiActions}
            viewerId={viewerId}
            pendingTarget={pendingTarget}
            selection={selection}
            onSlot={guardedSlotClick}
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
          <div className="hero-command">
            <HeroPlate
              player={viewer}
              heroPower={game.heroPowers[viewerId]}
              cheatMode={game.cheatMode}
              floats={floats.filter((f) => f.slot === "hero" && f.owner === viewerId)}
              impacts={heroFx(viewerId)}
              active={game.activePlayer === viewerId && game.phase !== "gameOver"}
            />
            {game.heroPowers[viewerId] ? (
              <HeroPowerButton
                definition={heroPowerDefinition(game.heroPowers[viewerId])}
                action={uiActions.find((candidate) => candidate.type === "use_hero_power")}
                used={game.heroPowerUsed[viewerId]}
                onUse={(action) => {
                  sfx.play("button");
                  perform(action);
                }}
              />
            ) : null}
          </div>

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
                "--intro-index": `${handIndex}`,
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
                  onMouseEnter={(e) => previewCard(card, e.currentTarget, viewerId)}
                  onMouseLeave={endPreview}
                  data-playable={playable}
                  title={playable ? "Drag onto the board (or click) to play" : undefined}
                >
                  {card ? <CardFace card={playableFace(card, effectiveCardCost(game, viewerId, card))} /> : null}
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
                          {
                            ...(spent ? { "--mi": manaFx.from - 1 - i } : {}),
                            ...(refill ? { "--mi": i - manaFx.from } : {}),
                            ...(duelIntro?.phase === "mana" ? { "--intro-mana-index": i } : {}),
                          } as CSSProperties
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
          className={[
            "draw-flight",
            flight.mine ? "" : "theirs",
            flight.opening ? "opening" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
          style={
            {
              "--fx0": `${flight.fx0}px`,
              "--fy0": `${flight.fy0}px`,
              "--fx1": `${flight.fx1}px`,
              "--fy1": `${flight.fy1}px`,
              "--flight-delay": `${flight.delayMs ?? 0}ms`,
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
        <div
          className={toast.tone === "bargain" ? "board-toast bargain-popup" : "board-toast"}
          key={toast.id}
          role="status"
          style={{ animationDuration: `${toast.durationMs}ms` }}
        >
          {toast.text}
        </div>
      ) : null}

      {drag?.active && drag.kind === "hand" ? (
        <div className="drag-layer" style={{ transform: `translate(${drag.x - 64}px, ${drag.y - 104}px)` }} aria-hidden="true">
          <div className="drag-card">
            {library[drag.cardId] ? <CardFace card={playableFace(library[drag.cardId], effectiveCardCost(game, viewerId, library[drag.cardId]))} /> : null}
          </div>
        </div>
      ) : null}

      {drag?.active && drag.kind === "attacker" ? (
        <TargetingArrow x1={drag.ox} y1={drag.oy} x2={drag.x} y2={drag.y} />
      ) : null}

      {/* Board/slot prompts are now entirely in-board: the highlighted legal
          slots are the instruction, so a fixed tip strip only adds noise.
          Hand, value, and board-or-core choices still need their controls. */}
      {pendingTarget && pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" ? (
        <TargetPrompt
          pending={pendingTarget}
          library={library}
          botControlled={botThinking}
          onChoose={(choiceIndex) => {
            sfx.play("button");
            perform({ type: "choose_target", player: pendingTarget.player, choiceIndex });
          }}
          onCancel={cancelTarget}
        />
      ) : null}

      {game.phase === "drawChoice" && game.drawChoice && game.drawChoice.player === viewerId ? (
        <DrawChoiceOverlay game={game} library={library} onChoose={perform} locked={botThinking} />
      ) : null}

      {game.phase === "mulligan" && game.mulligan?.player === viewerId && !duelIntro ? (
        <MulliganOverlay game={game} library={library} onChoose={perform} locked={botThinking} />
      ) : null}

      {game.phase === "gameOver" ? (
        <GameOver
          game={game}
          library={library}
          vsBot={vsBot}
          tutorial={tutorialActive}
          onRestart={tutorialActive ? beginTutorial : restart}
          onMenu={toTitle}
        />
      ) : null}

      {tutorialActive && game.phase !== "gameOver" && !duelIntro ? (
        <TutorialCoach
          step={tutorialStep}
          completed={tutorialCompleted}
          onSkip={toTitle}
        />
      ) : null}

      {/* Above the result screen, not beside it. The pack is the reward for the
          duel that just ended, so it has to be the thing in the way. */}
      {pack ? (
        <CardPack ids={pack} library={library} total={progress.unlocked} onDone={() => setPack(null)} />
      ) : null}

      {/* The curtain sits above every other overlay: nothing behind it may be
          readable, including an open prompt belonging to the other player. */}
      {curtainUp ? (
        <PassScreen
          toName={game.players[seatOwner].name}
          onReady={() => setSeatedPlayer(seatOwner)}
        />
      ) : null}

      {duelIntro ? <DuelIntro phase={duelIntro.phase} /> : null}

      {screen === "title" ? (
        <TitleScreen
          canContinue={hasLiveSave && game.phase !== "gameOver" && (game.turnNumber > 1 || game.phase === "mulligan")}
          playerCount={playerCount}
          onContinue={() => {
            sfx.play("button");
            sfx.unlock();
            setDuelIntro(null);
            setScreen("playing");
          }}
          onStart={beginDuel}
          onSettings={() => setOverlay("settings")}
          onGallery={() => setOverlay("gallery")}
          onRecord={() => setOverlay("record")}
          onHeroPowers={() => setOverlay("heroPowers")}
          onTutorial={beginTutorial}
          onDeveloperTools={() => setDeveloperToolsOpen(true)}
          developerCheatRevealed={developerCheatRevealed}
          developerCheatActive={progress.developerCheat}
          onDeveloperUnlock={activateDeveloperCheat}
          onDeveloperReset={resetDeveloperProgress}
          duelsPlayed={totalDuels}
          unlocked={progress.unlocked}
          rosterSize={progress.unlockOrder.length || cards.length + relics.length}
        />
      ) : null}

      {overlay === "howToPlay" ? <HowToPlay onClose={() => setOverlay(null)} /> : null}
      {overlay === "gallery" ? <CardGallery progress={progress} onClose={() => setOverlay(null)} /> : null}
      {overlay === "record" ? <RecordScreen progress={progress} onClose={() => setOverlay(null)} /> : null}
      {overlay === "heroPowers" ? (
        <HeroPowersScreen
          botWins={botWinCount}
          selectedPower={selectedHeroPower}
          onSelect={(power) => setSelectedHeroPower(power)}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "settings" ? (
        <SettingsPanel
          onClose={() => setOverlay(null)}
          onMenu={() => {
            setOverlay(null);
            toTitle();
          }}
        />
      ) : null}
      {developerToolsOpen ? (
        <DeveloperTools
          screen={screen}
          cards={Object.values(library)}
          game={game}
          viewerId={viewerId}
          onClose={() => setDeveloperToolsOpen(false)}
          onToggleCheat={toggleCheatMode}
          onSetMana={developerSetMana}
          onSetCore={developerSetCore}
          onGiveCard={developerGiveCard}
          onPlaceCard={developerPlaceCard}
          onEquipRelic={developerEquipRelic}
          onClearBoard={developerClearBoard}
          onRestart={restart}
          onTestCard={(cardId) => beginDuel({ kind: "bot", skill: "easy" }, { testCardId: cardId })}
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
                  ghost.motion === "stasis" ? "stasis" : ghost.motion === "return" ? "returning" : "dying",
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
                {ghost.motion === "stasis" ? <StasisBurst particles={ghost.particles} /> : ghost.motion === "return" ? <ReturnBurst /> : <DeathBurst particles={ghost.particles} />}
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
      <span className="death-ring death-ring-two" />
      <span className="death-slice death-slice-one" />
      <span className="death-slice death-slice-two" />
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
/* 500, down from 580, because the mana crystal grew a third: 84 design units to
 * 112, which walks its left edge from 664 to 636. MEASURED, not reasoned: the
 * widest name on the roster inks 475 units at the old 46 cap and stopped 52
 * short of the crystal. Raise the cap to 55 and that ink becomes ~570 and ends
 * at 660 — 24 units UNDER the enlarged crystal. The name is centred, so every
 * unit the crystal gains costs the box two. */
const NAME_BOX = 500;        // full-size card, 112-unit crystal
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
/**
 * The width a board name may use and still sit CENTRED.
 *
 * A minion in play carries a 150-unit cost crystal whose left edge is at 598, so
 * a centred name has to stay 152 units clear of BOTH edges: 750 - 2 x 152 = 446,
 * and 440 keeps a little back. Names that fit here are centred; the rest keep
 * the old left-shifted layout, because for them the space to the left of the
 * crystal is space they genuinely need.
 */
const NAME_BOX_BOARD_CENTRED = 440;
/** The board's own name cap, written in CSS as `min(46, …)`. Kept here so the
 *  centring test and the stylesheet cannot disagree about it. */
const BOARD_NAME_CAP = 46;

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
/* 55, up a fifth from 46. Every name on the roster was measured before this
 * moved: they all sat at 45.5, pinned by this ceiling rather than by their box,
 * so raising it is the only thing that makes a name bigger. The two longest —
 * "Rennala Queen of the Full Moon" and "Mastered Ultra Instinct Goku" — are
 * box-limited instead and grow less, which is the honest outcome rather than a
 * bug. The BOARD keeps its own 46 cap in CSS: a minion in play has far less
 * room across the top and nothing there was asking to be bigger. */
const NAME_CEILING = 55;
const NAME_CEILING_COMPACT = 72;

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
 * (rarity "Relic", camp "Ascension") appear on their own without a special case,
 * and a new camp or rarity would appear the moment a card used one.
 */
/** Cells built on the first frame; the rest follow when the browser is idle. */
const FIRST_GALLERY_BATCH = 36;

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

/** Rarity runs commonest to rarest, which is not alphabetical. */
const VALUE_ORDER: Record<FilterKey, string[]> = {
  cost: [],
  // Commonest to rarest: Rare, Epic, Legendary, Mythic. The colours carry no
  // order of their own, which is how Legendary ended up listed above Epic.
  rarity: ["Black", "Purple", "Yellow", "Red", "Relic"],
  camp: ["Magic", "Tech", "Nature", "ALL"],
  alignment: ["Good", "Neutral", "Evil"],
};

/**
 * Values that exist in the data but must not be offered as a filter.
 *
 * A relic is not a camp and it is not an alignment — it carries the placeholder
 * strings "Ascension" and "Relic" so the card face has something to print on its
 * rails. Deriving the option lists from the roster is what surfaced them, and
 * they read as real choices next to Magic and Evil, which they are not. Rarity
 * keeps "Relic" because there it IS the answer: it is what those cards are.
 */
const HIDDEN_FILTER_VALUES: Partial<Record<FilterKey, string[]>> = {
  camp: ["Ascension"],
  alignment: ["Relic"],
};

/**
 * The rarity tiers under the names the game actually uses for them.
 *
 * The colours are the internal labels — they name the gem on the card, not the
 * tier — so a filter offering "Yellow" and "Red" asks the player to know an
 * implementation detail. `build-codex.mjs` has carried this same mapping for the
 * public page since long before the gallery had filters; keep the two in step.
 */
const RARITY_NAME: Record<string, string> = {
  Black: "Rare",
  Purple: "Epic",
  Yellow: "Legendary",
  Red: "Mythic",
  Relic: "Relic",
};

function filterOptionLabel(key: FilterKey, value: string): string {
  return key === "rarity" ? (RARITY_NAME[value] ?? value) : value;
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
 * locked wall second, so mixing 50 readable cards into 146 sealed ones is a
 * list that answers neither question. There is therefore no view showing all
 * all at once, which is the deliberate cost of that.
 */
type UnlockFilter = "unlocked" | "locked";
type GalleryEntry = { key: string; card: PlayableCard; face: CardFaceModel };

function CardGallery({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [status, setStatus] = useState<UnlockFilter>("unlocked");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    cost: "",
    rarity: "",
    camp: "",
    alignment: "",
  });
  /**
   * How many cells are mounted right now.
   *
   * Building the full roster of card faces in one go is about 850 ms of DOM work, which is
   * a visible hitch on a screen that should just appear. The first batch is
   * roughly two screens deep and lands immediately; the rest arrive on the next
   * idle callback, by which time the reader is still looking at row one. Nothing
   * about scrolling changes, because `content-visibility` was already skipping
   * the off-screen ones — this is about the cost of CREATING them.
   */
  const [mounted, setMounted] = useState(FIRST_GALLERY_BATCH);
  /** The scrolling element, so the scroll handler can flag it without a render. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const openEntry = useCallback((entryKey: string) => setSelectedEntryKey(entryKey), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      unlocked: new Set(unlockedPool(progress.unlockOrder, progress.unlocked)),
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
    kept = kept.filter((entry) => collection.unlocked.has(entry.key) === wantUnlocked);
    // Always mana then name. A filtered list in raw roster order is barely a
    // list, and this removes the need for a separate ordering control.
    return [...kept].sort(
      (a, b) => (a.face.cost ?? 99) - (b.face.cost ?? 99) || a.face.name.localeCompare(b.face.name),
    );
  }, [entries, filters, status, collection]);

  const selectedEntry = selectedEntryKey ? sorted.find((entry) => entry.key === selectedEntryKey) ?? null : null;

  useEffect(() => {
    if (selectedEntryKey && !selectedEntry) setSelectedEntryKey(null);
  }, [selectedEntryKey, selectedEntry]);

  // A new search or a new order means a different first screen, so the batch
  // starts again rather than leaving the top of the list unmounted.
  useEffect(() => {
    setMounted(FIRST_GALLERY_BATCH);
  }, [needle, filters, status]);

  useEffect(() => {
    if (mounted >= sorted.length) return;
    // Bound to window. Pulling requestIdleCallback off the object and calling it
    // bare throws "Illegal invocation" in Chromium, and the failure is silent
    // here -- the first batch had already painted, so the gallery simply stopped
    // at 36 cards and looked finished.
    // The { timeout } is load-bearing, not a nicety. A hidden tab never goes
    // "idle" in Chromium, so a bare requestIdleCallback never fires -- measured,
    // not assumed. A player who opens the gallery and switches tabs would have
    // come back to a gallery permanently stuck at its first 36 cards. With a
    // timeout the callback is guaranteed to run.
    const idle: (fn: () => void) => number = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 300 })
      : (fn) => window.setTimeout(fn, 32);
    const cancel = (handle: number) =>
      window.cancelIdleCallback ? window.cancelIdleCallback(handle) : window.clearTimeout(handle);
    const handle = idle(() => setMounted(sorted.length));
    return () => cancel(handle);
  }, [mounted, sorted.length]);

  /**
   * Warms every card image the moment the screen has finished appearing.
   *
   * `lazyArt` is right for the FIRST paint and wrong for the twentieth: asking
   * for the whole roster at once is the single biggest cost of opening the gallery,
   * which is why the cells load lazily — but the browser's lazy heuristics only
   * look a short way ahead, and a fast flick outruns them, which is what leaves
   * a screenful of cards showing a frame and no picture.
   *
   * Warming them AFTER the open costs the opening nothing. The whole set is
   * fetched a few at a time on idle callbacks so it never competes with a
   * scroll, and decoded off the main thread. By the time
   * anyone has scrolled anywhere the file is already in the cache and the lazy
   * <img> resolves instantly.
   */
  useEffect(() => {
    if (mounted < sorted.length) return;
    const urls = sorted.map((entry) => entry.face.art).filter((art): art is string => Boolean(art));
    let index = 0;
    let stopped = false;
    let handle = 0;
    // Bound to window for the same reason the batch loader is: calling
    // requestIdleCallback bare throws "Illegal invocation" in Chromium.
    const idle: (fn: () => void) => number = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 500 })
      : (fn) => window.setTimeout(fn, 32);
    const cancel = (id: number) =>
      window.cancelIdleCallback ? window.cancelIdleCallback(id) : window.clearTimeout(id);
    const pump = () => {
      if (stopped) return;
      for (let taken = 0; taken < 6 && index < urls.length; taken += 1, index += 1) {
        const image = new Image();
        image.decoding = "async";
        image.src = urls[index];
      }
      if (index < urls.length) handle = idle(pump);
    };
    handle = idle(pump);
    return () => {
      stopped = true;
      cancel(handle);
    };
  }, [mounted, sorted]);

  /**
   * Flags the body while it is being scrolled, so the CSS can park the card
   * shine for the duration.
   *
   * Deliberately a classList write and not a state update. A scroll fires far
   * more often than a frame, and re-rendering the full memoised grid to
   * say "we are moving" would cost more than the animations it is trying to
   * quieten.
   */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let idleTimer = 0;
    const onScroll = () => {
      body.classList.add("is-scrolling");
      window.clearTimeout(idleTimer);
      // Long enough to cover the tail of a flick, short enough that letting go
      // and looking brings the shine straight back.
      idleTimer = window.setTimeout(() => body.classList.remove("is-scrolling"), 140);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
      window.clearTimeout(idleTimer);
      body.classList.remove("is-scrolling");
    };
  }, []);

  return (
    <div
      className="screen-veil gallery-veil"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {/* Deliberately NOT `wide`. That class sets its own 760px width at the same
          specificity as anything here can reach, and it is defined in a stylesheet
          that loads later, so it wins on source order and squeezes the grid to
          three columns. Leaving it off means nothing competes. */}
      <section className="screen-panel gallery-panel" role="dialog" aria-label="Card gallery">
        <header className="screen-panel-top">
          <h2>Card gallery</h2>
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
        <div className="screen-panel-body gallery-body" ref={bodyRef}>
          {sorted.length ? (
            <div className="gallery-grid">
              {sorted.slice(0, mounted).map((entry) => (
                <GalleryCell
                  key={entry.key}
                  face={entry.face}
                  locked={!collection.unlocked.has(entry.key)}
                  entryKey={entry.key}
                  onOpen={openEntry}
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
              ))}
            </div>
          ) : (
            <p className="gallery-empty">Nothing matches “{query}”.</p>
          )}
        </div>
      </section>
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
    </div>
  );
}

function StarChart({ values, accent, name }: { values: number[]; accent: string; name: string }) {
  const size = 240;
  const centre = size / 2;
  const radius = 72;
  const point = (index: number, value: number, extra = 0) => {
    const angle = (-90 + index * 60) * (Math.PI / 180);
    const distance = radius * Math.max(0, Math.min(10, value)) / 10 + extra;
    return {
      x: centre + Math.cos(angle) * distance,
      y: centre + Math.sin(angle) * distance,
      angle,
    };
  };
  const polygon = (value: number) =>
    STAR_CHART_AXES.map((_axis, index) => {
      const pointValue = point(index, value);
      return `${pointValue.x.toFixed(1)},${pointValue.y.toFixed(1)}`;
    }).join(" ");
  const dataPoints = STAR_CHART_AXES.map((_axis, index) => point(index, values[index] ?? 0));

  return (
    <svg className="star-chart" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${name} Star Chart`}>
      {[2, 4, 6, 8, 10].map((level) => (
        <polygon key={level} className="star-chart-ring" points={polygon(level)} />
      ))}
      {STAR_CHART_AXES.map((_axis, index) => {
        const end = point(index, 10);
        return <line key={index} className="star-chart-axis" x1={centre} y1={centre} x2={end.x} y2={end.y} />;
      })}
      <polygon
        className="star-chart-data"
        points={dataPoints.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ")}
        style={{ "--chart-accent": accent } as CSSProperties}
      />
      {dataPoints.map((item, index) => (
        <circle
          key={index}
          className="star-chart-point"
          cx={item.x}
          cy={item.y}
          r="4"
          style={{ "--chart-accent": accent } as CSSProperties}
        />
      ))}
      {STAR_CHART_AXES.map((axis, index) => {
        const label = point(index, 10, 21);
        const anchor = Math.cos(label.angle) > 0.28 ? "start" : Math.cos(label.angle) < -0.28 ? "end" : "middle";
        return (
          <text key={axis} className="star-chart-label" x={label.x} y={label.y} textAnchor={anchor}>
            {axis} <tspan>{values[index] ?? 0}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

function campAccent(camp: string): string {
  if (camp === "Nature") return "#79c66a";
  if (camp === "Tech") return "#70c9ff";
  if (camp === "ALL") return "#f0c767";
  return "#b996ff";
}

function GalleryDetailModal({
  entry,
  locked,
  onClose,
  onNavigate,
}: {
  entry: GalleryEntry;
  locked: boolean;
  onClose: () => void;
  onNavigate: (direction: number) => void;
}) {
  const profile = locked ? null : loreFor(entry.card);
  const accent = campAccent(entry.face.camp);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (!locked && event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(-1);
      } else if (!locked && event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [locked, onClose, onNavigate]);

  return (
    <div className="gallery-detail-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className={`gallery-detail-panel ${isRelicCard(entry.card) ? "is-relic" : "is-minion"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.face.name} Star Chart`}
      >
        <button type="button" className="screen-x gallery-detail-close" onClick={onClose} aria-label="Close Star Chart">×</button>

        <div className="gallery-detail-body">
          <div className={`gallery-detail-primary${locked ? " is-locked" : ""}`}>
            <div className="gallery-detail-card">{locked ? <SealedFace card={entry.face} /> : <CardFace card={entry.face} />}</div>
            {locked ? <p className="gallery-detail-sealed-note">Rules remain sealed until this card joins your deck.</p> : null}
          </div>

          {locked ? (
            <div className="gallery-detail-locked">
              <span className="gallery-detail-kicker">The Rift is holding this profile</span>
              <h3>Unlock this card to read its Star Chart</h3>
              <p>The artwork, name, and cost remain visible. Its lore profile stays sealed until the card enters your shared deck.</p>
            </div>
          ) : profile ? (
            <>
              {(() => {
                const loreCopy = (
                  <>
                    <p>{profile.lore}</p>
                    {profile.quote ? <blockquote style={{ "--quote-accent": accent } as CSSProperties}>“{profile.quote}”</blockquote> : null}
                  </>
                );
                return isRelicCard(entry.card) ? (
                  <div className="gallery-detail-lore">{loreCopy}</div>
                ) : (
                  <div className="gallery-detail-chart-row">
                    <div className="gallery-detail-chart-wrap">
                      <StarChart values={profile.vals} accent={accent} name={entry.face.name} />
                      <span className="gallery-detail-chart-caption">Lore attributes · 0 to 10</span>
                    </div>
                    <div className="gallery-detail-lore">{loreCopy}</div>
                  </div>
                );
              })()}

              <div className="gallery-detail-columns">
                <DetailList title="Strengths" tone="strength" items={profile.str} />
                <DetailList title="Weaknesses" tone="weakness" items={profile.wk} />
              </div>
              <div className="gallery-detail-columns">
                <DetailBox title="Signature move">
                  {profile.sig_name ? <strong>{profile.sig_name}</strong> : null}
                  <span>{profile.sig_desc || "No signature move recorded."}</span>
                </DetailBox>
                <section className="gallery-detail-box gallery-detail-relationships">
                  <h3>Relationships</h3>
                  <div className="gallery-detail-box-copy">
                    {profile.rivals.length ? profile.rivals.map((rival) => (
                      <span key={`${rival.who}-${rival.rel}`} className={rival.id ? "detail-rival linked" : "detail-rival"}>
                        {rival.who}{rival.rel ? ` · ${rival.rel}` : ""}
                      </span>
                    )) : <span className="detail-rival">No recorded relationship</span>}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="gallery-detail-locked">
              <span className="gallery-detail-kicker">Card profile</span>
              <h3>This card has no Star Chart entry yet</h3>
              <p>The current card rules remain authoritative above. The lore page has not profiled this card.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailList({ title, tone, items }: { title: string; tone: "strength" | "weakness"; items: string[] }) {
  return (
    <section className={`gallery-detail-box ${tone}`}>
      <h3>{title}</h3>
      <ul>{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Not recorded</li>}</ul>
    </section>
  );
}

function DetailBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-detail-box">
      <h3>{title}</h3>
      <div className="gallery-detail-box-copy">{children}</div>
    </section>
  );
}

/**
 * One card in the gallery, held still between renders.
 *
 * The gallery mounts every card in the game at once, and each card face is a
 * size container with its own gradients, shadows and six text measurements. Two
 * things keep that affordable and they belong together: this memo stops a search
 * keystroke re-rendering the full roster, and `content-visibility: auto` on
 * `.gallery-cell` stops the browser laying out and painting the ones off screen.
 */
const GalleryCell = memo(function GalleryCell({
  entryKey,
  face,
  mark,
  locked = false,
  onOpen,
}: {
  entryKey: string;
  face: CardFaceModel;
  mark: CollectionMark;
  /** Not yet in the shared deck. Shown, never hidden — see `UnlockHelp`. */
  locked?: boolean;
  onOpen: (entryKey: string) => void;
}) {
  return (
    <div
      className={locked ? `gallery-cell mark-${mark} is-locked` : `gallery-cell mark-${mark}`}
      data-mark={mark}
      title={locked ? "Locked — not yet in the shared deck" : COLLECTION_TITLE[mark]}
      role="button"
      tabIndex={0}
      aria-label={locked ? `${face.name}, locked card` : `Open Star Chart for ${face.name}`}
      onClick={() => onOpen(entryKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(entryKey);
        }
      }}
    >
      {locked ? <SealedFace card={face} lazyArt /> : <CardFace card={face} lazyArt />}
      {locked ? (
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
  const left = Math.max(0, progress.unlockOrder.length - progress.unlocked);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Stops the gallery's own Escape handler closing the whole screen
        // behind this. One press should shut one thing.
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="help-veil"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="help-pop" role="dialog" aria-label="How unlocking works">
        <button type="button" className="help-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Unlocking cards</h3>
        <table className="help-table">
          <tbody>
            <tr>
              <th scope="row">Beat the Ascendant</th>
              <td>+{UNLOCK_REWARD.hard.won} cards</td>
            </tr>
            <tr>
              <th scope="row">Beat the Veteran</th>
              <td>+{UNLOCK_REWARD.normal.won} cards</td>
            </tr>
            <tr>
              <th scope="row">Beat the Recruit</th>
              <td>+{UNLOCK_REWARD.easy.won} cards</td>
            </tr>
            <tr>
              <th scope="row">Lose or draw</th>
              <td>+{UNLOCK_REWARD.normal.lost} card</td>
            </tr>
            <tr>
              <th scope="row">Hotseat</th>
              <td>–</td>
            </tr>
          </tbody>
        </table>
        <p className="help-state">
          <strong>
            {progress.unlocked} of {progress.unlockOrder.length || cards.length + relics.length}
          </strong>{" "}
          unlocked{left ? `, ${left} still to find` : " — the whole roster is yours"}.
        </p>
      </section>
    </div>
  );
}

/**
 * Which tiers carry an animated shine, and Rare is deliberately absent.
 *
 * The escalation only reads as an escalation if the bottom of it is still. Give
 * every card a shine and the tiers stop meaning anything; 58 Rare cards then
 * also stop costing anything, which is what keeps a full gallery affordable.
 */
const SHINE_RARITIES = new Set(["purple", "yellow", "red", "relic"]);

/**
 * Rail values with a lit palette built for them.
 *
 * The camp and alignment marks live on the RAILS — the two vertical words down
 * the card's edges — rather than as artwork behind the picture. That was tried
 * and scrapped: two animated systems in the middle of one card compete for the
 * same space, and a card has one middle.
 *
 * `ALL` is in here despite belonging to only two cards, because its palette is
 * not a seventh invention — it cycles the other three camp hues in turn, which
 * is what the camp itself means.
 */
const RAIL_CAMPS = new Set(["magic", "tech", "nature", "all"]);
const RAIL_ALIGNMENTS = new Set(["good", "neutral", "evil"]);

/** How far a card has got in your collection. Ordered weakest to strongest. */
type CollectionMark = "unseen" | "seen" | "played" | "won";

const COLLECTION_TITLE: Record<CollectionMark, string> = {
  unseen: "Not yet drawn",
  seen: "Has been in your hand",
  played: "You have played it",
  won: "You have won with it",
};

/**
 * A locked card, drawn cheaply.
 *
 * The seal already covers the middle of the face, so a locked card was building
 * a full 23-element card face — rules panel, flavour, origin, both rails, the
 * stat gems, the shine — and then hiding almost all of it behind a padlock. In
 * the opening gallery's locked cards are not all laid out, and laying all of them
 * out measured 219 ms against 4.5 ms when they are skipped: about 1.4 ms each,
 * which is three rows per frame at a normal scroll speed.
 *
 * This draws the four things a sealed card is SUPPOSED to show and nothing else
 * — frame colour, name, mana cost, and a shape behind the glass. That is the
 * printed doctrine for a locked card rather than a saving invented to fit one,
 * and the saving comes for free: nine elements instead of twenty-three, and one
 * text measurement instead of six. The three paragraph fits are the expensive
 * ones and none of them is needed, because none of that text is drawn.
 *
 * It keeps the `card-face` class and the rarity class, so every rule that
 * already dressed a locked card — the grayscale, the thin outline, the seal
 * itself — lands on it unchanged.
 */
function SealedFace({ card, lazyArt = false }: { card: CardFaceModel; lazyArt?: boolean }) {
  const fit = {
    // Both one-line name fits, because the compact one is what a narrow
    // container query switches to and an unset variable would silently fall
    // back to the uncapped default rather than to a fitted size.
    "--cf-namefit": fitOneLine(card.name, NAME_BOX, NAME_CEILING),
    "--cf-namefitc": fitOneLine(card.name, NAME_BOX_COMPACT, NAME_CEILING_COMPACT),
  } as CSSProperties;
  const rarity = (card.rarity ?? "Black").toLowerCase();
  return (
    <article className={`card-face cf-sealed rarity-${rarity}`} style={fit}>
      <div className="cf-stage">
        <div className="cf-frame" aria-hidden="true" />
        <div className="cf-well" aria-hidden="true" />
        <CardArtwork card={card} lazy={lazyArt} />
        <div className="cf-banner">
          <span className="cf-name">{card.name}</span>
        </div>
        <div className="cf-gem cf-mana">{card.cost}</div>
      </div>
    </article>
  );
}

function CardFace({
  card,
  lazyArt = false,
  extras,
  states = [],
  onBoard = false,
  atkClass = "",
  hpClass = "",
  effect,
  flavor,
}: {
  card: CardFaceModel;
  /** Gallery only — see the loading note in `CardArtwork`. */
  lazyArt?: boolean;
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
  const isRelicFace = rarity === "relic";
  /* Centre the board name only when centring costs it nothing — that is, when
   * the symmetric box fits the name at the same size the wider asymmetric box
   * would. The centred box is the smaller of the two, so its fit can never be
   * larger; equality means both were capped by the ceiling rather than by width.
   *
   * COMPARING THE TWO FITS, not testing one against the cap. `fitOneLine` floors
   * its answer to half units (`Math.floor(lo * 2) / 2`), so a name that fits
   * comfortably at the 46 cap comes back as 45.5 and never as 46 — a `>= 46`
   * test is dead code that silently centres nothing. Every name on the roster
   * measures 45.5 for exactly this reason. */
  const boardNameCentred =
    fitOneLine(card.name, NAME_BOX_BOARD_CENTRED, BOARD_NAME_CAP) >=
    fitOneLine(card.name, NAME_BOX_BOARD, BOARD_NAME_CAP);
  // Only values with a palette BUILT get a lit rail. A relic's camp and
  // alignment are the placeholders "Ascension" and "Relic", and relics print no
  // rails at all; naming the built sets explicitly is what stops a future camp
  // or alignment silently rendering a class nothing styles.
  const campMark = RAIL_CAMPS.has((card.camp ?? "").toLowerCase()) ? (card.camp ?? "").toLowerCase() : null;
  const alignMark = RAIL_ALIGNMENTS.has((card.alignment ?? "").toLowerCase())
    ? (card.alignment ?? "").toLowerCase()
    : null;
  // Keyword artwork. On the board the live flags win, because a Divine Shield
  // can be popped while the printed keyword stays on the card forever.
  // Conditions belong to the BOARD, never the hand (owner ruling). A card you are
  // holding shows its keywords in its text; the artwork only reacts once the
  // minion is actually in play. Taunt is the one keyword that stays live in
  // `keywords` (minions can be granted it), so it is read from there; Divine
  // Shield and Chained come from the live flags in `states`.
  const silenceHidesKeywords = states.includes("is-silenced") || states.includes("is-chained");
  const keywordClasses = onBoard && !silenceHidesKeywords
    ? (card.keywords ?? []).filter((k) => k === "Taunt").map(() => "kw-taunt")
    : [];
  const classes = ["card-face", `rarity-${rarity}`, onBoard ? "on-board" : "", blank ? "cf-blank" : "", ...keywordClasses, ...states]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={classes} style={fit}>
      <div className="cf-stage">
        <div className="cf-frame" aria-hidden="true" />
        <div className="cf-well" aria-hidden="true" />
        <CardArtwork card={card} lazy={lazyArt} />
        <div className="cf-desc"><p>{text}</p></div>
        {/* A relic has no camp and no alignment. It carried the placeholders
            "Ascension" and "Relic" purely so the rails had something to print,
            and two rails naming a thing that is not a property of the card is
            worse than empty rails — the frame colour and the gem already say
            "relic" without help. Characters keep both. */}
        {isRelicFace ? null : (
          <>
            {/* Both rails are where a card announces itself now. An earlier
                build put a turning arcane circle behind the artwork instead,
                and it was scrapped: a second animated system in the middle of
                the card competes with the tier shine for the same space, and
                the card only has one middle. The words were already there. */}
            <span className={campMark ? `cf-rail cf-camp rail-${campMark}` : "cf-rail cf-camp"}>{card.camp}</span>
            <span className={alignMark ? `cf-rail cf-align rail-${alignMark}` : "cf-rail cf-align"}>
              {card.alignment}
            </span>
          </>
        )}
        {/* Relics use RELIC as a bare slot label. Character flavour keeps its
            decorative quotation marks. */}
        {quote ? <div className="cf-flavor"><span>{isRelicFace ? quote : `“${quote}”`}</span></div> : null}
        <div className="cf-origin">{card.origin}</div>
        {/* A board name is CENTRED when it can be.
            On a board the name used to be pushed left by an asymmetric padding
            so it cleared the cost crystal, which left short names — most of
            them — visibly off-centre for no reason. They are centred now, and
            only a name too wide for the symmetric safe box falls back to the
            old layout, because for that name the space beside the crystal is
            space it genuinely needs. */}
        <div className="cf-banner">
          <span className={boardNameCentred ? "cf-name is-centred" : "cf-name"}>{card.name}</span>
        </div>
        <div className="cf-gem cf-mana">{card.cost}</div>
        <div className={`cf-gem cf-atk ${atkClass}`}>{card.atk}</div>
        <div className={`cf-gem cf-hp ${hpClass}`}>{card.hp}</div>
        {/* The rarity shine. Its own element rather than pseudo-elements on the
            existing layers, because `.cf-art::after` is already the glass sheen
            and `.cf-stage::after` is spoken for by the board's rim states — a
            shine written on top of either would fight a condition the player
            needs to see.

            FIVE FIXED SLOTS for every tier, styled per rarity, with the ones a
            tier does not use switched off in CSS. The alternative — a different
            element list per rarity — puts the layer count in two places at once
            and lets the markup and the stylesheet disagree silently. Rare gets
            no shine at all: it is the baseline the other tiers escalate from. */}
        {SHINE_RARITIES.has(rarity) ? (
          <div className="cf-shine" aria-hidden="true">
            <span className="sh-field" />
            <span className="sh-veil" />
            <span className="sh-grain" />
            <span className="sh-grain2" />
            <span className="sh-sweep" />
            <span className="sh-rim" />
          </div>
        ) : null}
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
}: {
  minion: MinionInstance;
  board?: Array<MinionInstance | null>;
  allBoard?: Array<MinionInstance | null>;
  /** Hovering the relic badge swaps the preview to the relic's own card. */
  onRelicPreview?: (relic: RelicInstance, el: HTMLElement) => void;
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
          ]
            .filter(Boolean)
            .join(" ")}
          title={`${relic.name} — ${relic.effect}`}
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

function CardArtwork({ card, lazy = false }: { card: CardFaceModel; lazy?: boolean }) {
  // NEVER loading="lazy" here. Cards mount and unmount constantly as they move
  // between hand, board and preview, and a lazy <img> that is re-created during
  // that churn frequently never fires its load at all — it stays
  // complete:false / naturalWidth:0 forever and the card renders as a black
  // rectangle while the file itself serves fine. Half a board went black this
  // way. Only a handful of card images exist at once; load them eagerly.
  //
  // The GALLERY is the one exception, and it is a different situation, not a
  // relaxation of the rule above. Its cells mount once and stay put, so there is
  // no churn to lose a load in — while requesting the full roster at once is the
  // single biggest cost of opening the screen.
  if (!card.art) return <div className="cf-art empty-art" aria-hidden="true" />;
  return (
    <div
      className={`cf-art ${
        card.name === "Yujiro"
          ? "cf-art-yujiro"
          : card.name === "Conquest"
            ? "cf-art-conquest"
            : card.name === "Stand Arrow"
              ? "cf-art-stand-arrow"
              : ""
      }`}
    >
      <img src={card.art} alt="" draggable={false} loading={lazy ? "lazy" : undefined} decoding={lazy ? "async" : undefined} />
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
  const effectsActive = !minion.silenced && minion.chained === 0;
  const otherGood = board?.some((other) => other && other.instanceId !== minion.instanceId && other.alignment === "Good") ?? false;
  const goodCount = board?.filter((other) => other?.alignment === "Good").length ?? 0;
  const activeInvulnerable =
    effectsActive &&
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
    minion.divineShield && !minion.silenced ? "is-shielded" : "",
    typeof minion.invulnerableUntilTurn === "number" || activeInvulnerable ? "is-invulnerable" : "",
    minion.protectedSlot ? "is-protected" : "",
    minion.attackLocked ||
    (effectsActive && (effectIds.has("watcher_reveal_hand") || effectIds.has("ragnaros_end_turn")))
      ? "is-locked"
      : "",
    minion.markedBy || minion.markedForDeathAtTurn !== null && minion.markedForDeathAtTurn !== undefined ? "is-marked" : "",
    minion.campImmunity ? "is-adapted" : "",
  ].filter(Boolean);
}

function HeroPlate({
  player,
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
}: {
  player: GameState["players"][number];
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
  const power = heroPowerDefinition(heroPower);
  const canStrike = enemy && targetable && Boolean(onStrike);
  return (
    <button
      type="button"
      className={classes}
      data-hero={player.id}
      onClick={canStrike ? onStrike : undefined}
      aria-disabled={canStrike ? undefined : true}
      aria-label={enemy && power ? `${player.name}. Hero Power: ${power.name}. ${power.text}` : undefined}
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
        {power ? <small className="hero-power-label">⚡ {power.name}</small> : null}
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

function HeroPowerCard({ definition }: { definition: ReturnType<typeof heroPowerDefinition> }) {
  if (!definition) return null;
  return (
    <aside className="enemy-power-card" id="enemy-hero-power-card" aria-label={`${definition.name}: ${definition.text}`}>
      <div className="enemy-power-card-head">
        <span className="enemy-power-card-cost">{HERO_POWER_COST}</span>
        <span className="enemy-power-card-title">
          <small>ENEMY HERO POWER</small>
          <strong>⚡ {definition.name}</strong>
        </span>
      </div>
      <p>{definition.text}</p>
      <small className="enemy-power-card-foot">Costs {HERO_POWER_COST} mana · Once per turn</small>
    </aside>
  );
}

function HeroPowerButton({
  definition,
  action,
  used,
  onUse,
}: {
  definition: ReturnType<typeof heroPowerDefinition>;
  action?: GameAction;
  used: boolean;
  onUse: (action: Extract<GameAction, { type: "use_hero_power" }>) => void;
}) {
  if (!definition) return null;
  const usable = action?.type === "use_hero_power" && !used;
  return (
    <button
      type="button"
      className={usable ? "hero-power-button ready" : "hero-power-button"}
      disabled={!usable}
      onClick={() => {
        if (action?.type === "use_hero_power") onUse(action);
      }}
      title={`${definition.text} Costs ${HERO_POWER_COST} mana and can be used once per turn.`}
    >
      <span className="hero-power-cost">{HERO_POWER_COST}</span>
      <span className="hero-power-copy">
        <strong>⚡ {definition.name}</strong>
        <small>{used ? "Used this turn" : definition.text}</small>
      </span>
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
  onCancel,
}: {
  pending: PendingTarget;
  library: CardLibrary;
  botControlled: boolean;
  onChoose: (choiceIndex: number) => void;
  onCancel: () => void;
}) {
  const card = library[pending.sourceCardId];
  const canCancel = Boolean(pending.cancelPlay && !botControlled);
  const hint = botControlled
    ? "The practice bot is choosing…"
    : pending.kind === "board" || pending.kind === "slot" || pending.kind === "boardOrCore"
      ? canCancel
        ? `Click a highlighted minion — or click the board/hand to return this minion.`
        : `Click a highlighted minion — ${pending.options.length} legal targets.`
      : pending.kind === "hand"
        ? "Their hand, face up. Pick one."
        : "Pick a value.";
  return (
    <div
      className={[
        "target-prompt",
        pending.kind === "board" && !canCancel ? "" : "interactive",
        pending.kind === "option" ? "card-choice-prompt" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="target-prompt-head">
        {card ? <img className="target-prompt-art" src={card.art} alt="" draggable={false} /> : null}
        <div className="target-prompt-text">
          <strong>{pending.sourceName}</strong>
          <span>{pending.prompt}</span>
          <small>{hint}</small>
        </div>
      </div>

      {canCancel ? (
        <button type="button" className="prompt-cancel" onClick={onCancel}>
          Return to hand
        </button>
      ) : null}

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

function MulliganOverlay({
  game,
  library,
  onChoose,
  locked = false,
}: {
  game: GameState;
  library: CardLibrary;
  onChoose: (action: GameAction) => void;
  locked?: boolean;
}) {
  const mulligan = game.mulligan;
  if (!mulligan) return null;
  const selectedCount = mulligan.selected.filter(Boolean).length;
  return (
    <div className="overlay">
      <section className={locked ? "draw-panel mulligan-panel locked" : "draw-panel mulligan-panel"}>
        <span>Opening Hand</span>
        <h2>{locked ? "Waiting for the opening hand…" : "Choose cards to replace"}</h2>
        <p className="mulligan-intro">
          Select any number of cards to mulligan. Replacements come from the shared deck, then your old cards go to the bottom.
        </p>
        <div className="mulligan-row">
          {game.players[mulligan.player].hand.map((cardId, handIndex) => {
            const selected = Boolean(mulligan.selected[handIndex]);
            const card = library[cardId];
            return (
              <button
                type="button"
                key={`${cardId}-${handIndex}`}
                className={selected ? "mulligan-card selected" : "mulligan-card"}
                aria-pressed={selected}
                disabled={locked}
                onClick={() => {
                  sfx.play("button");
                  onChoose({ type: "toggle_mulligan", player: mulligan.player, handIndex });
                }}
              >
                {card ? <CardFace card={playableFace(card)} /> : null}
              </button>
            );
          })}
        </div>
        <div className="choice-detail">
          <span>{selectedCount ? `${selectedCount} selected for replacement` : "Keeping all three cards"}</span>
          <button
            type="button"
            className="primary"
            disabled={locked}
            onClick={() => {
              sfx.play("draw");
              onChoose({ type: "confirm_mulligan", player: mulligan.player });
            }}
          >
            {selectedCount ? "Mulligan selected" : "Keep opening hand"}
          </button>
        </div>
      </section>
    </div>
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

/**
 * The card pack a finished duel hands over.
 *
 * Three deliberate choices, because the obvious build of this is worse:
 *
 * The pack takes THREE hits, not one. A single click is a dialog with a picture
 * on it — the reward arrives before the player has done anything, so nothing
 * builds. Three hits with escalating damage on the pack itself is the smallest
 * structure that has a middle, and the middle is where the anticipation lives.
 *
 * The cards deal themselves out one at a time rather than appearing as a grid.
 * A grid of ten is read as "ten"; a stagger is read as ten separate arrivals,
 * which is the same information and a completely different feeling.
 *
 * The fireworks are generated once per mount and held in a ref. Generating them
 * during render would re-roll every spark on every state change, so the burst
 * would visibly reshuffle itself the moment the first card landed.
 */
const PACK_HITS = 3;

/** Card width and gap from `.pack-card` / `.pack-reveal`; keep the three in step. */
const PACK_CARD_WIDTH = 206;
const PACK_CARD_GAP = 14;

/** How wide the reveal must be to hold a balanced row of `count` cards. */
function packRowWidth(count: number): number {
  const perRow = count <= 5 ? Math.max(1, count) : Math.ceil(count / 2);
  return perRow * PACK_CARD_WIDTH + (perRow - 1) * PACK_CARD_GAP;
}

function CardPack({
  ids,
  library,
  total,
  onDone,
}: {
  ids: string[];
  library: CardLibrary;
  total: number;
  onDone: () => void;
}) {
  const [hits, setHits] = useState(0);
  const [dealt, setDealt] = useState(0);
  const opened = hits >= PACK_HITS;
  // Sorted so the rarest and dearest card is the last one to land. What the pack
  // CONTAINS is already settled by the unlock order; this only decides the order
  // they arrive in, so it cannot bias the reward.
  const faces = useMemo(
    () =>
      revealOrder(ids.map((id) => library[id]).filter((card): card is PlayableCard => Boolean(card))).map((card) =>
        playableFace(card),
      ),
    [ids, library],
  );
  // One roll per mount. `useState` with an initialiser, not `useMemo`: a memo is
  // allowed to be thrown away and recomputed, and a re-rolled firework is a
  // visible glitch rather than a cheap recovery.
  const [sparks] = useState(() =>
    Array.from({ length: 92 }, (_, index) => {
      // Two shells, not one ring. A single evenly spaced ring reads as a circle
      // of dots however fast it moves; a dense near shell inside a sparser far
      // one is what a firework actually looks like.
      const near = index % 3 !== 0;
      const angle = (index / 92) * Math.PI * 2 + Math.random() * 0.7;
      const distance = near ? 120 + Math.random() * 200 : 300 + Math.random() * 320;
      return {
        key: index,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.8,
        size: near ? 6 + Math.random() * 10 : 3 + Math.random() * 6,
        delay: Math.random() * (near ? 0.2 : 0.4),
        dur: near ? 0.9 + Math.random() * 0.6 : 1.2 + Math.random() * 0.8,
        hue: [46, 190, 276, 12][index % 4],
      };
    }),
  );

  // Cards deal themselves; there is nothing left to click once the pack is open,
  // so making the player click ten more times would only be in the way.
  useEffect(() => {
    if (!opened || dealt >= faces.length) return;
    const handle = window.setTimeout(() => {
      setDealt((count) => count + 1);
      sfx.play("draw");
    }, dealt === 0 ? 420 : 160);
    return () => window.clearTimeout(handle);
  }, [opened, dealt, faces.length]);

  function strike() {
    if (opened) return;
    const next = hits + 1;
    setHits(next);
    if (next >= PACK_HITS) {
      sfx.play("summonMythic");
    } else {
      sfx.play(next === 1 ? "hit" : "shieldBreak");
    }
  }

  const allDealt = opened && dealt >= faces.length;

  return (
    <div className={opened ? "pack-veil is-open" : "pack-veil"}>
      {opened ? (
        <div className="pack-burst" aria-hidden="true">
          {sparks.map((spark) => (
            <span
              key={spark.key}
              className="pack-spark"
              style={
                {
                  "--sx": `${spark.x}px`,
                  "--sy": `${spark.y}px`,
                  "--ss": `${spark.size}px`,
                  "--sd": `${spark.delay}s`,
                  "--st": `${spark.dur}s`,
                  "--sh": `${spark.hue}`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      <section className="pack-stage" role="dialog" aria-label="New cards unlocked">
        {opened ? null : (
          <>
            <p className="pack-kicker">{faces.length === 1 ? "One new card" : `${faces.length} new cards`}</p>
            <button
              type="button"
              className={`pack-box hits-${hits}`}
              onClick={strike}
              aria-label={`Strike the pack to open it. ${PACK_HITS - hits} to go.`}
            >
              <span className="pack-box-face" aria-hidden="true">
                <span className="pack-box-sigil">✦</span>
              </span>
              <span className="pack-box-crack c1" aria-hidden="true" />
              <span className="pack-box-crack c2" aria-hidden="true" />
              <span className="pack-box-crack c3" aria-hidden="true" />
              <span className="pack-box-glow" aria-hidden="true" />
            </button>
            <p className="pack-hint">{hits === 0 ? "Strike it open" : hits === 1 ? "Again" : "Once more"}</p>
          </>
        )}

        {opened ? (
          <>
            <p className="pack-kicker is-open">Added to the shared deck</p>
            {/* Rows are balanced rather than left to wrap. Six cards wrapping
                naturally gave a row of five and one card stranded underneath it,
                which reads as a mistake; three and three reads as a hand. The
                width is what does it, because flex-wrap has no notion of an
                even split. */}
            <div className="pack-reveal" style={{ maxWidth: `min(${packRowWidth(faces.length)}px, 96vw)` }}>
              {faces.slice(0, dealt).map((face, index) => (
                <div className="pack-card" key={`${face.name}-${index}`}>
                  {/* NOT lazy, unlike the gallery. At most ten images, and each
                      one is the thing the player is here to look at — a card
                      that deals itself onto the table with an empty black frame
                      is the reward arriving broken. */}
                  <CardFace card={face} />
                </div>
              ))}
            </div>
            <p className={allDealt ? "pack-total is-in" : "pack-total"}>
              {total} of {cards.length + relics.length} cards unlocked
            </p>
            <button type="button" className="primary pack-collect" onClick={onDone} disabled={!allDealt}>
              Collect
            </button>
          </>
        ) : null}
      </section>
    </div>
  );
}

function TutorialCoach({
  step,
  completed,
  onSkip,
}: {
  step: number;
  completed: boolean;
  onSkip: () => void;
}) {
  const lessonList = [
    {
      title: "Play a card",
      body: "Choose a blue-glowing card, then click an empty slot on your side of the board.",
      hint: "Blue means you can afford the card.",
    },
    {
      title: "End your turn",
      body: "Your new minion needs a turn to wake up. Press the green End Turn button to pass to the Recruit.",
      hint: "The Recruit takes its turn, then your minion can act.",
    },
    {
      title: "Take your first swing",
      body: "When a minion has a green rim, click it, then choose the enemy Taunt minion.",
      hint: "Combat is simultaneous, so defenders strike back.",
    },
    {
      title: "Answer the prompt",
      body: "A Battlecry can pause the duel. Click one of the teal-highlighted legal targets. Completing this prompt finishes the tutorial.",
      hint: "The board lights up only the choices the card allows.",
    },
  ];
  const safeStep = Math.max(0, Math.min(step, lessonList.length - 1));
  const lesson = completed
    ? {
        title: "Tutorial complete",
        body: "You completed all four guided lessons. Leave the tutorial to keep playing.",
        hint: "The full duel remains available from developer mode.",
      }
    : lessonList[safeStep];

  return (
    <aside className="tutorial-coach" aria-label="Tutorial">
      <div className="tutorial-coach-top">
        <span>Tutorial</span>
        <small>{completed ? lessonList.length : safeStep + 1} / {lessonList.length}</small>
      </div>
      <div className="tutorial-progress" aria-hidden="true">
        {lessonList.map((_lesson, index) => <i key={index} className={index <= safeStep ? "on" : ""} />)}
      </div>
      <strong>{lesson.title}</strong>
      <p>{lesson.body}</p>
      <small className="tutorial-coach-hint">{lesson.hint}</small>
      <button type="button" onClick={onSkip}>Leave tutorial</button>
    </aside>
  );
}

function DeveloperTools({
  screen,
  cards: allCards,
  game,
  viewerId,
  onClose,
  onToggleCheat,
  onSetMana,
  onSetCore,
  onGiveCard,
  onPlaceCard,
  onEquipRelic,
  onClearBoard,
  onRestart,
  onTestCard,
}: {
  screen: "title" | "playing";
  cards: PlayableCard[];
  game: GameState;
  viewerId: PlayerId;
  onClose: () => void;
  onToggleCheat: () => void;
  onSetMana: () => void;
  onSetCore: (owner: PlayerId, value: number) => void;
  onGiveCard: (cardId: string, owner: PlayerId) => void;
  onPlaceCard: (cardId: string, owner: PlayerId) => void;
  onEquipRelic: (cardId: string, owner: PlayerId) => void;
  onClearBoard: (owner: PlayerId) => void;
  onRestart: () => void;
  onTestCard: (cardId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(allCards[0]?.id ?? "");
  const otherId: PlayerId = viewerId === 0 ? 1 : 0;
  const selected = allCards.find((card) => card.id === selectedId) ?? allCards[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allCards
      .filter((card) =>
        !needle || [card.name, card.origin, card.effect].join(" ").toLowerCase().includes(needle),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [allCards, query]);

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

        <div className="developer-controls">
          {screen === "playing" ? (
            <>
              <button type="button" className={game.cheatMode ? "developer-action active" : "developer-action"} onClick={onToggleCheat}>
                {game.cheatMode ? "Infinite mana: ON" : "Infinite mana: OFF"}
              </button>
              <button type="button" className="developer-action" onClick={onSetMana}>Fill my mana</button>
              <button type="button" className="developer-action" onClick={() => onSetCore(viewerId, 1)}>My Core → 1</button>
              <button type="button" className="developer-action" onClick={() => onSetCore(otherId, 1)}>Enemy Core → 1</button>
              <button type="button" className="developer-action" onClick={() => onSetCore(viewerId, STARTING_CORE)}>Restore my Core</button>
              <button type="button" className="developer-action" onClick={() => onClearBoard(viewerId)}>Clear my board</button>
              <button type="button" className="developer-action" onClick={() => onClearBoard(otherId)}>Clear enemy board</button>
              <button type="button" className="developer-action" onClick={onRestart}>Restart test duel</button>
            </>
          ) : null}
        </div>

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
            <div className="developer-card-list">
              {filtered.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={card.id === selected?.id ? "developer-card-row selected" : "developer-card-row"}
                  onClick={() => setSelectedId(card.id)}
                >
                  <span className="developer-card-kind">{isRelicCard(card) ? "RELIC" : `${card.cost}M`}</span>
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
                    <button type="button" className="developer-primary" onClick={() => onGiveCard(selected.id, viewerId)}>Give to my hand</button>
                    <button type="button" className="developer-secondary" onClick={() => onGiveCard(selected.id, otherId)}>Give to enemy hand</button>
                    {!isRelicCard(selected) ? (
                      <>
                        <button type="button" className="developer-secondary" onClick={() => onPlaceCard(selected.id, viewerId)}>Place on my board</button>
                        <button type="button" className="developer-secondary" onClick={() => onPlaceCard(selected.id, otherId)}>Place on enemy board</button>
                      </>
                    ) : (
                      <button type="button" className="developer-secondary" onClick={() => onEquipRelic(selected.id, viewerId)}>Equip on my first minion</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : <p className="developer-empty">No cards match this search.</p>}
        </div>

        <p className="developer-note">Developer actions affect this test duel only and do not enter your record or unlock track.</p>
      </section>
    </div>
  );
}

function GameOver({
  game,
  library,
  vsBot,
  tutorial = false,
  onRestart,
  onMenu,
}: {
  game: GameState;
  library: CardLibrary;
  vsBot: boolean;
  tutorial?: boolean;
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
  const botLine = tutorial
    ? "The tutorial is complete."
    : vsBot
      ? winner?.id === 1
        ? "The practice bot takes it."
        : "You beat the practice bot."
      : null;
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
          <button type="button" className="primary" onClick={onRestart}>{tutorial ? "Play tutorial again" : "Rematch"}</button>
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
