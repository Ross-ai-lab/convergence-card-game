import { TUTORIAL_LESSONS, tutorialAllowsAction, nextTutorialStep, tutorialOpponentAction } from './tutorial';
import {TurnClock,TurnClockWarning,humanTurnKey} from './turn-clock';
import {expirePlayerTurn} from './engine/turn-timeout';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import "./gallery-detail.css";
// Board effects (camp signatures and the killing blow). Loaded
// HERE, immediately after App.css, on purpose: that is the exact cascade slot
// they occupied when they lived in screens/Screens.css, so moving the file could
// not change which rule wins anything.
import "./board-fx.css";
// Ross mode is a deliberate, secret developer surface that the owner can use
// in the published game too. Keep its styling separate from the main board
// stylesheet so the mode remains easy to audit without hiding the feature from
// the public build.
import "./dev-only.css";
import { sfx } from "./audio/sfx";
import { cards, relics } from "./data/cards";
import { BOT_CHEATS } from "./engine/bot";
import { BotSearch } from "./engine/bot-search";
import { PointerStore, type ScreenPoint } from "./pointer-store";

import { requestPhoneLandscape, usePhoneLayout } from './phone-layout';
import { useRelicPeek } from './relic-peek';

import { heroPowerDefinition, randomHeroPower } from "./engine/hero-powers";
import { isMinionCard, isRelicCard } from "./engine/types";
import { isTokenCardId } from "./engine/tokens";
import {
  actionKey,
  applyAction,
  attacksRandomly,
  CONCEALED_CHOICE_EFFECTS,
  createInitialGame,
  effectiveCardCost,
  effectiveHeroPowerCost,
  getLegalActions,
  hasFreeRelicSlot,
  hasInfiniteMana,
  makeCardLibrary,
  relicLockSource,
  opponentHandRevealed,
  relicRequiredAlignment,
  STARTING_CORE,
} from "./engine/game";
import type {
  DamageTallyEntry,
  GameAction,
  GameEvent,
  GameState,
  HeroPowerId,
  MinionInstance,
  PlayerId,
} from "./engine/types";
import { clearSave, EVENT_LOG_LIMIT, loadGame, queueSaveGame } from "./storage";
import {
  clearProgress,
  emptyProgress,
  finishDuel,
  loadProgress,
  saveProgress,
  unlockAllProgress,
  type Progress,
} from "./progress";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_STARTER_DECK, CAMPAIGN_DIFFICULTIES, CAMPAIGN_PREMISE, CAMPAIGN_PROTAGONIST } from "./campaign";
import { createCampaignDuel } from "./campaign-duel";
import { campaignComplete, canPlayChapter, acknowledgeBossSpeech, acknowledgeRewards, acknowledgeHeroPowers, saveDeckDraft, createNamedDeck, ensureNamedDeck, selectNamedDeck, selectHeroPower, CAMPAIGN_CARD_IDS } from "./progress";
import { LoreLibrary } from './screens/LoreLibrary';
import { randomDeck, validateDeck } from "./decks";
import { CampaignScreen, HotseatSetup } from "./screens/CampaignScreens";
import { CampaignSpeech, CollectedBossSpeech, type SpeechCue } from "./screens/CampaignSpeech";
import campaignVoiceManifest from "../data/campaign-voices.json";
import { onFontsReady } from "./textfit";
import { loadPlayerCount } from "./playerCount";
import { createDuelSeed } from "./duelSeed";
import {
  DuelIntro,
  FullscreenButton,
  HowToPlay,
  PassScreen,
  SettingsPanel,
  TitleScreen,
  type DuelIntroPhase,
  type GameMode,
} from "./screens/Screens";
// The component modules below bring no stylesheets of their own; every CSS
// import above keeps its original cascade position.
import { useFullscreen } from "./use-fullscreen";
import { campAccent, CardFace, FontRevisionContext, KeywordPopover, playableFace, RelicCardPeek } from "./card-face";
import type { DuelIntroState } from "./duel/fx";
import { useDuelFx } from "./duel/use-duel-fx";
import { useCardPreview } from "./duel/use-card-preview";
import { useDebugHook } from "./duel/use-debug-hook";
import { applyDeveloperEdit, type DeveloperEdit } from "./duel/developer-edits";
import { BoardRow, canAttackCore, FollowingArrow, otherPlayer, type Selection } from "./duel/board";
import { DragGhost, HandFan, ManaTray } from "./duel/hand";
import { HeroPlate, HeroPowerButton, HeroPowerCard, ProtocolWarningBubble } from "./duel/hero";
import { DrawChoiceOverlay, EventLog, HoverCard, MulliganOverlay, TargetPrompt, TutorialCoach } from "./duel/panels";
import { CardPack } from "./duel/card-pack";
import { DeveloperTools } from "./duel/developer-tools";
import { GameOver } from "./duel/game-over";
import { CardGallery } from "./gallery/card-gallery";
import { GalleryDetailModal } from "./gallery/card-profile";

function campaignVoiceDuration(key: string): number | undefined {
  const entries = campaignVoiceManifest as Record<string, { duration?: unknown }>;
  const entry = entries[key];
  return typeof entry?.duration === "number" ? entry.duration : undefined;
}

function heroPowersForDuel(
  mode: GameMode,
  playerPower: HeroPowerId | null,
  seed: string,
): [HeroPowerId | null, HeroPowerId | null] {
  return mode.kind === "hotseat" ? [playerPower, playerPower] : [playerPower, randomHeroPower(seed)];
}

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
/** Core at or under this swaps the music to the tense bed. Roughly a quarter. */
const TENSION_CORE = 12;

/**
 * The made-up damage tally behind the developer result screen.
 *
 * A tally entry needs an instance id and a number, and neither exists when no
 * duel was played. The id is spelled out rather than random so a screenshot of
 * that screen is reproducible, and the damage is a flat figure because there is
 * nothing to derive it from — see `developerShowResult`.
 */
const DEVELOPER_MVP_INSTANCE = "developer-mvp";
const DEVELOPER_MVP_DAMAGE = 42;

// Pointer-driven drag & drop. A press only becomes a drag after DRAG_THRESHOLD px
// of movement, so plain clicks keep the original select-then-click flow. The
// live pointer position is not here: it lives in the PointerStore.
type DragState =
  | { kind: "hand"; handIndex: number; cardId: string; active: boolean }
  | { kind: "attacker"; slotIndex: number; ox: number; oy: number; active: boolean }
  | null;

const DRAG_THRESHOLD = 8;

const BOT_ID: PlayerId = 1;

/**
 * The one cheat the engine has to know about, because the draw it changes
 * happens deep inside `beginTurn` where nothing knows which seat is a bot.
 * Every other cheat lives in the bot's own search. Hotseat grants it to nobody.
 */
function foresightSeat(mode: GameMode): PlayerId | null {
  return mode.kind !== "hotseat" && BOT_CHEATS[mode.skill].foresight ? BOT_ID : null;
}
// The practice bot thinks fast enough to be invisible — these pauses exist so a
// human can watch what it did, not because it is slow.
const BOT_DELAY_MS = 620;
const BOT_FIRST_DELAY_MS = 900;

const openingEvent: GameEvent = {
  kind: "info",
  text: "The rift opens. Player One begins.",
};

export default function App() {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  // The FULL roster, always. A restricted pool decides what a new duel is dealt
  // from; it must never decide what the engine can resolve. A saved duel, a
  // minion already on the board, or a card copied out of the enemy's hand can
  // all name a card that is not currently unlocked, and every one of them has to
  // keep working.
  const library = useMemo(() => makeCardLibrary(cards, relics), []);
  // Campaign ownership and deck drafts are loaded independently of a live duel.
  const initialProgress = useMemo(() => loadProgress(), []);
  /**
   * The only thing in this game that outlives a duel. Held in state so the title
   * screen and the gallery re-render the moment a duel is folded in, and written
   * straight through to localStorage whenever it changes.
   */
  const [progress, setProgress] = useState<Progress>(initialProgress);
  // Save the initial campaign record before a first duel can finish.
  useEffect(() => {
    if (!saveProgress(initialProgress)) setStorageError(true);
  }, [initialProgress]);
  // A duel in progress is restored from localStorage; anything unreadable or
  // from an older engine falls back to a fresh game (see storage.ts).
  const restored = useMemo(() => {
    const saved = loadGame();
    if (saved?.mode.kind === "bot" && !campaignComplete(initialProgress)) return null;
    if (saved?.mode.kind === "campaign" && !canPlayChapter(initialProgress, saved.mode.chapter)) return null;
    if (saved && saved.mode.kind !== 'hotseat') {
      saved.game.players[0].name = 'Rick Gramps';
      saved.events = saved.events.map(event => ({ ...event, text: event.text.replaceAll('Player One', 'Rick Gramps') }));
    }
    return saved;
  }, [initialProgress]);
  const turnClock=useMemo(()=>new TurnClock(restored?.turnClock),[restored]);
  const [game, setGame] = useState(() => {
    if (!restored) return createInitialGame(cards, createDuelSeed(), relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK] });
    if (restored.mode.kind === "hotseat" || restored.game.heroPowers[1]) return restored.game;
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
  const campaignChapter = mode.kind === "campaign" ? CAMPAIGN_CHAPTERS[mode.chapter - 1] : undefined;
  const campaignBoss = campaignChapter ? library[campaignChapter.bossId] : undefined;
  const vsBot = mode.kind !== "hotseat";
  // The front door. A restored duel still starts here rather than dumping a
  // returning player straight onto a board they left hours ago.
  const [screen, setScreen] = useState<"title" | "playing">("title");
  const phoneLayout = usePhoneLayout();
  const compactLayout = phoneLayout.compact;
  const needsLandscape = screen === 'playing' && phoneLayout.portrait;

  const relicPeek = useRelicPeek();
  useEffect(() => {

    if (screen !== 'playing') window.screen.orientation?.unlock?.();
  }, [screen, needsLandscape]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [duelIntro, setDuelIntro] = useState<DuelIntroState | null>(null);
  const [overlay, setOverlay] = useState<null | "settings" | "howToPlay" | "campaign" | "deck" | "hotseat" | "opponent" | "lore">(null);
  useEffect(() => {
    if (overlay !== "opponent") return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOverlay(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [overlay]);
  const [developerCheatRevealed, setDeveloperCheatRevealed] = useState(false);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [developerDuelActive, setDeveloperDuelActive] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const tutorialReturn = useRef<{
    game: GameState;
    events: GameEvent[];
    mode: GameMode;
    hasLiveSave: boolean;
    history: GameState[];
    seatedPlayer: PlayerId;
    recorded: boolean;
    cards: { seen: Set<string>; played: Set<string> };
    announcements: Set<string>;
  } | null>(null);
  // Unviewed first-clear rewards survive reload; developer previews are transient.
  const [pack, setPack] = useState<string[] | null>(() => initialProgress.pendingRewards.length ? initialProgress.pendingRewards : null);
  const [chapterSpeech, setChapterSpeech] = useState<{mode: Extract<GameMode,{kind:"campaign"}>; stage:"prologue"|"rick-intro"|"entrance"} | null>(null);
  const [bossLines, setBossLines] = useState<SpeechCue[]>([]);
  const closeBossLine = useCallback(() => setBossLines(lines => lines.slice(1)), []);
  const defeatedChapter = progress.pendingBossSpeech ? CAMPAIGN_CHAPTERS.find(chapter => chapter.chapter === progress.pendingBossSpeech) : undefined;
  const defeatedBoss = defeatedChapter ? library[defeatedChapter.bossId] : undefined;
  const [storageError, setStorageError] = useState(false);
  const [builderSeat, setBuilderSeat] = useState<0 | 1>(0);
  const [builderReturn, setBuilderReturn] = useState<"title" | "campaign" | "hotseat">("title");
  const selectedHeroPower = progress.selectedHeroPower;
  function persistProgress(next: Progress) {
    setProgress(next); const saved = saveProgress(next); setStorageError(!saved); return saved;
  }
  function createDeckPreset(name:string,seat:0|1):boolean {
    const next=createNamedDeck(progress,name,seat);
    if(next===progress)return false;
    const saved=saveProgress(next);setStorageError(!saved);
    if(saved)setProgress(next);
    return saved;
  }
  function setSelectedHeroPower(power: HeroPowerId) { persistProgress(acknowledgeHeroPowers(selectHeroPower(progress, power,builderSeat))); }
  function openDeck(seat: 0 | 1 = 0, back: "title" | "campaign" | "hotseat" = "title") {
    const next=ensureNamedDeck(progress,seat);if(next!==progress)persistProgress(next);
    setBuilderSeat(seat); setBuilderReturn(back); setOverlay("deck");
  }
  function closePack() {
    if (!progress.pendingRewards.length || persistProgress(acknowledgeRewards(progress))) setPack(null);
  }
  function continueChapterSpeech() {
    if (!chapterSpeech) return;
    if (chapterSpeech.stage === "prologue") {
      const next = {...progress, storyIntroduced:true};
      const saved = saveProgress(next); setStorageError(!saved);
      if (saved) { setProgress(next); setChapterSpeech({...chapterSpeech,stage:"rick-intro"}); }
      return;
    }
    if (chapterSpeech.stage === "rick-intro") {
      setChapterSpeech({...chapterSpeech,stage:"entrance"});
      return;
    }
    const next = chapterSpeech.mode;
    setChapterSpeech(null);
    beginDuel(next,{skipStory:true});
  }
  function closeDefeatSpeech() {
    const next = {...progress,pendingBossSpeech:null};
    const saved = saveProgress(next); setStorageError(!saved);
    if (saved) setProgress(next);
  }
  useEffect(() => {
    if (screen !== "playing" || game.phase === "gameOver") setBossLines([]);
  }, [screen, game.phase]);

  // One voice request owns the whole speech layer. Changing dialogue, closing
  // an overlay, leaving the duel, or advancing the collected-boss queue cancels
  // both the current source and any fetch/decode that is still pending.
  useEffect(() => {
    let key: string | null = null;
    if (chapterSpeech?.stage === "prologue") {
      key = "rick-prologue";
    } else if (chapterSpeech?.stage === "rick-intro") {
      key = `${String(chapterSpeech.mode.chapter).padStart(2, "0")}-rick-intro`;
    } else if (chapterSpeech?.stage === "entrance") {
      key = `${String(chapterSpeech.mode.chapter).padStart(2, "0")}-entrance`;
    } else if (defeatedChapter) {
      key = `${String(defeatedChapter.chapter).padStart(2, "0")}-${progress.pendingBossSpeechOutcome === "loss" ? "loss" : "defeat"}`;
    } else if (screen === "playing" && game.phase !== "gameOver" && bossLines[0]) {
      key = bossLines[0].voiceKey;
    }
    if (!key) {
      sfx.stopBossSpeech();
      return;
    }
    const cancel = sfx.playBossSpeech(key);
    return cancel;
  }, [bossLines[0]?.id, chapterSpeech, defeatedChapter, game.phase, progress.pendingBossSpeechOutcome, screen]);

  useEffect(() => {
    if (screen !== "title" && screen !== "playing") return;
    if (screen === "title" && overlay !== null) return;
    let buffer = "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
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
  // Against the bot the screen stays on Player One forever. In hotseat it belongs
  // to whoever is currently SEATED, not to whoever's turn it is — those differ for
  // exactly as long as the privacy curtain is up, and during that gap nothing on
  // the incoming player's side may render or be clickable.
  const viewerId: PlayerId = vsBot ? 0 : seatedPlayer;
  const opponentId = otherPlayer(viewerId);
  const fx = useDuelFx(viewerId, opponentId);
  const relicFlash = fx.relicFlash;
  /** Whether the enemy Hero Power card is showing. Opened by a click, not a hover. */
  const [enemyPowerOpen, setEnemyPowerOpen] = useState(false);
  const [apexAlert,setApexAlert]=useState<number|null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  /** Where a drag or an aim points. Moves re-render only the ghost and the arrow. */
  const pointer = useMemo(() => new PointerStore(), []);
  useEffect(() => () => pointer.cancel(), [pointer]);
  const dragArrowOrigin = useMemo(() => (drag?.kind === "attacker" ? { x: drag.ox, y: drag.oy } : null), [drag]);
  const [targetArrowOrigin, setTargetArrowOrigin] = useState<ScreenPoint | null>(null);
  // An arrow on screen means the player is aiming: an armed attacker, or a
  // spell, battlecry or Hero Power waiting for its target. A dragged attacker
  // drops the arrow origin, so the drag itself counts too.
  const preview = useCardPreview(game, library, Boolean(drag?.active) || targetArrowOrigin !== null);
  const { clearHoverPreview, clearHandKeywords } = preview;
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  /** Herald lines already spoken this duel. A ref, so a re-render cannot re-fire one. */
  const heraldSaid = useRef(new Set<string>());
  const dragOrigin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const legalActions = useMemo(() => getLegalActions(game, library), [game, library]);
  const botSearch = useMemo(() => new BotSearch(), []);
  useEffect(() => () => botSearch.dispose(), [botSearch]);

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
  const [fontRevision, refit] = useState(0);
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
        fx.spawnOpeningDeal(game.players[viewerId].hand.length, game.players[opponentId].hand.length);
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
    if (tutorialActive) return;
    if (developerDuelActive && mode.kind !== "campaign") {
      clearSave();
      setHasLiveSave(false);
    } else if (screen === "playing" && game.phase !== "gameOver") {
      queueSaveGame(game, events, mode, Date.now(),turnClock.getSnapshot());
      setHasLiveSave(true);
    }
  }, [game, events, mode, screen, tutorialActive, developerDuelActive]);

  // The practice opponent. One move per tick, driven off the current state, so
  // it walks through draw picks and targeting prompts exactly like a human does
  // and the animations get to play between its moves.
  useEffect(() => {
    if (mode.kind === "hotseat" || screen !== "playing" || needsLandscape || duelIntro || relicFlash || (tutorialActive && tutorialCompleted)) return;
    const actor = game.phase === "mulligan" ? game.mulligan?.player
      : game.phase === "drawChoice" ? game.drawChoice?.player
      : game.phase === "targeting" ? game.pendingTarget?.player : game.activePlayer;
    if (game.phase === "gameOver" || actor !== BOT_ID) return;
    let timer = 0;
    if (tutorialActive) {
      const action=tutorialOpponentAction(game,legalActions);
      const timer=window.setTimeout(()=>{if(action)perform(action);},350);
      return ()=>window.clearTimeout(timer);
    }
    const cancel = botSearch.search({ game, library, player: BOT_ID, skill: mode.skill }, (action) => {
      if (action) timer = window.setTimeout(() => perform(action), game.phase === "main" ? BOT_DELAY_MS : BOT_FIRST_DELAY_MS);
    });
    return () => { cancel(); window.clearTimeout(timer); };
  }, [game, mode, screen, library, duelIntro, botSearch, relicFlash, needsLandscape, tutorialActive, tutorialCompleted]);

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
    sfx.prefetchCardThemes(game.players[mode.kind !== "hotseat" ? 0 : game.activePlayer].hand);
  }, [game, mode.kind, screen]);

  // The score follows the state of the duel: patient on the title, driving on the
  // board, and tense the moment either core is close enough to end it. Asking for
  // the track already playing is a no-op, so this can run on every render.
  const lowestCore = Math.min(game.players[0].health, game.players[1].health);

  useEffect(() => {
    // THE PACK TAKES THE BED OFF ENTIRELY (owner's ruling, 4 September 2026).
    // Ducking it to a tenth was not enough: a bed at a tenth under a piece of
    // music is still a second piece of music, and the two were audible together
    // through the whole ceremony. It comes back when the pack is collected,
    // because this effect runs again the moment `pack` clears.
    if (pack) {
      void sfx.setTrack(null);
      return;
    }
    // THE SCREEN IS ASKED FIRST, and that ordering is the whole of a bug fixed
    // 3 September 2026. A finished duel keeps `phase === "gameOver"` when the
    // player takes the Menu button back to the title — nothing resets the game
    // until they start another one — so a game-over test placed above this line
    // answered for the title screen too, and the menu music never came back.
    // Every route home was silent from the first duel until the tab was
    // reloaded.
    if (screen === "title") {
      void sfx.setTrack("menu");
      return;
    }
    if (game.phase === "gameOver") {
      void sfx.setTrack(null);
      return;
    }
    void sfx.setTrack(lowestCore <= TENSION_CORE ? "tension" : "battle");
  }, [screen, game.phase, lowestCore, pack]);

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
    // A turn can pass through drawChoice, targeting, and main without changing
    // activePlayer. Those are phases of one turn, not new turn announcements.
    const mine = game.activePlayer === viewerId;
    const text = vsBot
      ? mine
        ? "Your turn"
        : "Opponent's turn"
      : `${game.players[game.activePlayer].name}'s turn`;
    return fx.showBanner(text, mine);
  }, [game.activePlayer, screen, curtainUp, viewerId, vsBot, duelIntro]);

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
      // MUSIC, NOT A VOICE (owner's ruling, 3 September 2026). The herald used
      // to narrate the ending — "your core collapses, the rift takes you" —
      // which is the one line a player hears on every single duel they lose,
      // and the third time is one too many. Each of the three endings now has
      // its own piece of music instead. Fired HERE rather than at the killing
      // blow, so the developer jump to the result screen scores itself too.
      // The pack sits ABOVE the result screen and has music of its own, so the
      // ending waits its turn: this fires again when the pack is collected,
      // which is the moment the result screen is actually looked at.
      if (pack) return;
      if (said.has("ending")) return;
      said.add("ending");
      const lost = vsBot && game.winner === BOT_ID;
      sfx.playCue(game.winner === "draw" ? "draw" : lost ? "defeat" : "victory");
      return;
    }
    // NO "FIRST BLOOD" LINE (owner ruling). It fired the moment either core took
    // any damage at all, which in a duel is turn two or three and means
    // nothing — a narrator announcing an event that happens in every single game
    // before anything is at stake. Removed from the sheet and the clip deleted,
    // not just muted. The herald keeps only the moments that are actually rare:
    // the opening, a core in real danger, and the ending.
    const mine = game.players[viewerId].health;
    if (mine <= STARTING_CORE * 0.25) say("core_low_you", 0.6);
  }, [game, screen, viewerId, vsBot, pack]);

  /**
   * The pack ceremony has its own music.
   *
   * It starts with the sealed box and ends when the pack is collected, rather
   * than running to the end of the clip: the player decides how long they read
   * their new cards for, and a piece still playing over the screen behind it
   * would follow them out.
   */
  useEffect(() => {
    if (!pack) return;
    sfx.playCue("pack");
    return () => sfx.stopCue();
  }, [pack]);
  const viewer = game.players[viewerId];
  // The arena stays clean above 20 HP. It wears in three deliberate stages:
  // 20–11, 10–6, and 5 or less. There is no separate one-HP treatment.
  const viewerHealthBand = viewer.health <= 5
    ? "hp-critical"
    : viewer.health <= 10
      ? "hp-bloodied"
      : viewer.health <= 20
        ? "hp-wounded"
        : "hp-healthy";
  const gladosTurnsRemaining = game.heroPowers[otherPlayer(viewerId)] === "glados_test_protocol"
    ? Math.max(0, 16 - viewer.turnsStarted)
    : undefined;
  const gladosProtocolWarning = gladosTurnsRemaining !== undefined && gladosTurnsRemaining > 0 && gladosTurnsRemaining <= 4;

  useDebugHook(screen === "playing", game, library, viewerId, setGame);
  const viewerHasInfiniteMana = hasInfiniteMana(game, viewerId);
  const opponentHasInfiniteMana = hasInfiniteMana(game, opponentId);
  const opponent = game.players[opponentId];
  const revealedOpponentHand = opponentHandRevealed(game, viewerId) ? opponent.hand : undefined;
  const myTurn = game.activePlayer === viewerId;
  const viewerCanAct = (game.phase === "mulligan" && game.mulligan?.player === viewerId) || myTurn;
  // Every affordance and click reads this. Empty while the opponent is thinking,
  // so nothing lights up and nothing can be clicked on their behalf.
  const uiActions = viewerCanAct && !duelIntro && !needsLandscape && !(tutorialActive && tutorialCompleted) ? legalActions.filter(action=>!tutorialActive||tutorialAllowsAction(tutorialStep,game,action)) : [];
  const clockActor:PlayerId|null=tutorialActive||game.phase==='mulligan'||game.phase==='gameOver'||mode.kind!=='hotseat'&&game.activePlayer===1?null:game.activePlayer;
  const clockKey=clockActor===null?null:humanTurnKey(mode.duelId,clockActor,game.players[clockActor].turnsStarted);
  const choiceActor=game.phase==='targeting'?game.pendingTarget?.player:game.phase==='drawChoice'?game.drawChoice?.player:game.activePlayer;
  const clockRunning=clockKey!==null&&screen==='playing'&&!duelIntro&&!curtainUp&&!needsLandscape&&!developerToolsOpen&&!developerDuelActive&&choiceActor===clockActor;
  const clockLatest=useRef({game,events,mode,tutorialActive,hasLiveSave,developerDuelActive});
  clockLatest.current={game,events,mode,tutorialActive,hasLiveSave,developerDuelActive};
  useLayoutEffect(()=>turnClock.update(clockKey,clockRunning,Date.now()),[turnClock,clockKey,clockRunning]);
  useEffect(()=>{
    const persist=()=>{const current=clockLatest.current;if(current.hasLiveSave&&!current.tutorialActive&&!current.developerDuelActive&&current.game.phase!=='gameOver')queueSaveGame(current.game,current.events,current.mode,Date.now(),turnClock.getSnapshot());};
    // Only a clock CHANGE is saved. Persisting on mount rewrote an untouched save on
    // every page load and appended another "Duel restored" line to its log each time.
    return turnClock.subscribe(persist);
  },[turnClock]);
  useEffect(()=>{
    const clock=turnClock.getSnapshot();
    if(!clockRunning||clockActor===null||clock?.deadline===null||clock?.deadline===undefined)return;
    const timer=window.setTimeout(()=>{
      if(turnClock.getSnapshot()?.key!==clockKey||turnClock.getSnapshot()?.deadline!==clock.deadline)return;
      const current=clockLatest.current;
      const result=expirePlayerTurn(current.game,clockActor,library);
      if(result.state===current.game)return;
      fx.spawnFx(current.game,result.state,{type:'end_turn',player:clockActor},result.events);setGame(result.state);setSelection(null);
      setEvents(items=>[...items,{kind:'info',text:"Time is up. The turn ends.",player:clockActor} as GameEvent,...result.events].slice(-EVENT_LOG_LIMIT));
    },Math.max(0,clock.deadline-Date.now()));
    return()=>window.clearTimeout(timer);
  },[turnClock,clockKey,clockRunning,clockActor,library]);

  function clearFx({ newDuel = false } = {}) {
    fx.clear({ newDuel });
    setDrag(null);
    setTargetArrowOrigin(null);
    clearHoverPreview();
  }

  function skipDuelIntro() {
    if (!duelIntro) return;
    // The engine state and opening hands already exist. Only the visual
    // ceremony and its queued opening cue are being skipped.
    sfx.stopCue();
    fx.clearFlights();
    setDuelIntro(null);
  }

  function perform(action: GameAction) {
    if (tutorialActive && tutorialCompleted) return;
    if(tutorialActive&&!tutorialCompleted&&!tutorialAllowsAction(tutorialStep,game,action)) {fx.showToast('Follow the highlighted lesson, or leave the tutorial.',1800);return;}
    setEnemyPowerOpen(false);
    clearHandKeywords();
    const hiddenEnemyDiscover =
      action.type === "choose_target" &&
      game.pendingTarget !== null &&
      game.pendingTarget.player !== viewerId &&
      CONCEALED_CHOICE_EFFECTS.has(game.pendingTarget.effectId);
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
    const result = applyAction(game, action, library, legalActions, false);
    if (result.state !== game) {
      if (!tutorialActive && (mode.kind === "hotseat" || action.player === viewerId)) {
        for (const event of result.events) {
          if (event.kind !== "play" || event.player !== action.player || !event.cardId) continue;
          const chapter = CAMPAIGN_CHAPTERS.find(entry => entry.bossId === event.cardId && progress.completedBosses.includes(entry.chapter));
          const boss = chapter ? library[chapter.bossId] : undefined;
          if (chapter && boss && isMinionCard(boss)) {
            const voiceKey = `${String(chapter.chapter).padStart(2, "0")}-play`;
            const cue = {id:fx.nextId(),name:boss.name,art:boss.art,text:chapter.story.play,accent:campAccent(boss.camp),voiceKey,duration:campaignVoiceDuration(voiceKey)};
            setBossLines(lines => [...lines, cue]);
          }
        }
      }
      fx.spawnFx(game, result.state, action, result.events);
      if (result.state.activePlayer !== game.activePlayer && result.state.phase !== "gameOver") {
        sfx.play("turn", 0.05);
      }
      if (result.state.phase === "gameOver" && game.phase !== "gameOver") {
        fx.strikeLethal(result.state.winner === "draw");
        // The fanfare is the transient. The music that follows it is fired by
        // the herald effect on the PHASE, not here, so the developer jump to
        // the result screen gets the same ending piece a played duel does.
      }
      setHistory((items) => [game, ...items].slice(0, 10));
      setGame(result.state);
      setSelection(null);
      clearHoverPreview();
      setTargetArrowOrigin(null);
      fx.clearTauntFlash();
      if (bargainChoice) fx.showToast(`Doctor Strange's bargain chosen: ${bargainChoice}`, 3000, "bargain");

      if (tutorialActive && !tutorialCompleted && action.player === viewerId) {
        const step=nextTutorialStep(tutorialStep,action,result.state);
        setTutorialStep(step);
        if(step===TUTORIAL_LESSONS.length)setTutorialCompleted(true);
      }
    }
    const visibleEvents = hiddenEnemyDiscover
      ? result.events.map((event) =>
          event.kind === "draw" || event.kind === "effect"
            ? { ...event, text: "The opponent resolves a Discover effect." }
            : event,
        )
      : result.events;
    // 300, against the 80 this kept before. A median duel is 22 player-turns and
    // a busy one produces well over 80 lines, so the old ceiling was routinely
    // deleting the first half of the duel while it was still being played.
    setEvents((items) => [...items, ...visibleEvents].slice(-EVENT_LOG_LIMIT));
  }

  // Record each non-tutorial duel once. Only first campaign clears grant cards.
  useEffect(() => {
    if (game.phase !== "gameOver" || duelRecorded.current || tutorialActive) return;
    duelRecorded.current = true;
    const next = finishDuel(
      progress,
      { winner: game.winner, viewerId, mode, turns: game.turnNumber, at: Date.now() },
      { seen: [...duelCards.current.seen], played: [...duelCards.current.played] },
    );
    const saved = persistProgress(next);
    if (saved) { clearSave(); setHasLiveSave(false); }
    if (next.pendingRewards.length) setPack(next.pendingRewards);
  }, [game.phase, game.winner, game.turnNumber, mode, viewerId, progress, tutorialActive]);

  function prepareDuel(next: GameMode, seed: string, developer = false) {
    if (next.kind === "campaign") return createCampaignDuel({ chapter: next.chapter, playerDeck: progress.playerDeck,
      unlockedCardIds: progress.unlockedIds, cards, relics, seed, heroPower: selectedHeroPower }).state;
    const playerDeck = developer ? CAMPAIGN_STARTER_DECK : progress.playerDeck;
    const opponentDeck = next.kind === "hotseat" ? progress.hotseatDeck : randomDeck(CAMPAIGN_CARD_IDS, `${seed}:opponent`);
    const state = createInitialGame(cards, seed, relics, { decks: [playerDeck, opponentDeck],
      foresightFor: foresightSeat(next), heroPowers: heroPowersForDuel(next, selectedHeroPower, seed),
      mulliganPlayers: next.kind === "hotseat" ? [0, 1] : [0], hasCoin: next.kind === "hotseat" });
    if (next.kind !== 'hotseat') state.players[0].name = 'Rick Gramps';
    return state;
  }

  function restart() {
    if (mode.kind === "campaign" && game.winner === viewerId) { toTitle(); setOverlay("campaign"); return; }
    if (mode.kind === "campaign") {
      if (progress.pendingBossSpeech !== null) persistProgress(acknowledgeBossSpeech(progress));
      setChapterSpeech(null);
      sfx.stopBossSpeech();
      beginDuel(mode, { skipStory: true });
      return;
    }
    beginDuel(mode);
  }

  function activateDeveloperCheat() {
    const next = unlockAllProgress(progress);
    persistProgress(next);
  }

  function resetDeveloperProgress() {
    clearProgress();
    const next = emptyProgress();
    persistProgress(next);
    clearSave(); setHasLiveSave(false); duelRecorded.current = true;
    setPack(null); setOverlay(null); setScreen("title");
    setGame(createInitialGame(cards, createDuelSeed(), relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK] }));
    setDeveloperCheatRevealed(false);
  }

  /** Starts a fresh duel in the chosen mode, straight from the title screen. */
  function beginDuel(next: GameMode, options: { testCardId?: string; skipStory?: boolean } = {}) {
    if (next.kind === "campaign" && !canPlayChapter(progress, next.chapter)) return;
    if (next.kind === "bot" && !campaignComplete(progress) && !options.testCardId) { setOverlay("campaign"); return; }
    if (!options.testCardId && !validateDeck(progress.playerDeck, CAMPAIGN_CARD_IDS, progress.unlockedIds).valid) {
      openDeck(0, next.kind === "campaign" ? "campaign" : next.kind === "hotseat" ? "hotseat" : "title");
      return;
    }
    if (next.kind === "hotseat" && !validateDeck(progress.hotseatDeck, CAMPAIGN_CARD_IDS, progress.unlockedIds).valid) { openDeck(1, "hotseat"); return; }
    if (next.kind === "campaign" && !options.skipStory) {
      setOverlay(null);
      setChapterSpeech({mode:next,stage:progress.storyIntroduced ? "rick-intro" : "prologue"});
      return;
    }
    const seed = createDuelSeed();
    void requestPhoneLandscape(phoneLayout.phone);
    const nextGame = prepareDuel(next, seed, Boolean(options.testCardId));
    next = { ...next, duelId: seed }; setOverlay(null);
    sfx.play("button");
    sfx.unlock();
    sfx.stopCardTheme();
    // An ending piece is 16 seconds long, and leaving the screen it belongs to
    // must take it with you rather than play it over the next one.
    sfx.stopCue();
    clearSave();
    setTutorialActive(false);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(Boolean(options.testCardId));
    setDeveloperToolsOpen(false);
    duelCards.current = { seen: new Set(), played: new Set() };
    duelRecorded.current = false;
    setPack(null);
    setBossLines([]);
    setDuelIntro({ id: fx.nextId(), phase: "prelude" });
    setMode(next);
    if (options.testCardId && library[options.testCardId]) {
      nextGame.players[0].hand = [options.testCardId, ...nextGame.players[0].hand].slice(0, 10);
      nextGame.cheatMode = true;
      nextGame.cheatPlayer = 0;
    }
    setGame(nextGame);
    setHistory([]);
    setSelection(null);
    clearFx({ newDuel: true });
    setSeatedPlayer(0);
    heraldSaid.current = new Set();
    sfx.playOpeningCue(0.35);
    setEvents([
      {
        kind: "info",
        text:
          next.kind !== "hotseat"
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
    void requestPhoneLandscape(phoneLayout.phone);
    sfx.stopCardTheme();
    // An ending piece is 16 seconds long, and leaving the screen it belongs to
    // must take it with you rather than play it over the next one.
    sfx.stopCue();
    if (!tutorialActive) tutorialReturn.current = {
      game, events, mode, hasLiveSave, history, seatedPlayer,
      recorded: duelRecorded.current,
      cards: duelCards.current,
      announcements: heraldSaid.current,
    };
    setTutorialActive(true);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(false);
    setDeveloperToolsOpen(false);
    duelCards.current = { seen: new Set(), played: new Set() };
    duelRecorded.current = false;
    setPack(null);
    setDuelIntro(null);
    // The scripted opponent uses ordinary engine actions at each teaching turn.
    setMode({ kind: "bot", skill: "easy" });
    const seed = createDuelSeed();
    const tutorialGame = createInitialGame(cards, seed, relics, {
        heroPowers: ["minion_hp", null],
        tutorial: true,
        hasCoin: false,
      });
    tutorialGame.players[0].name = 'Rick Gramps';
    tutorialGame.players[1].name = 'Training Construct';
    setGame(tutorialGame);
    setHistory([]);
    setSelection(null);
    clearFx({ newDuel: true });
    setSeatedPlayer(0);
    heraldSaid.current = new Set();
    sfx.playOpeningCue(0.35);
    setEvents([{ kind: "info", text: "Tutorial started. Follow the Rift guide." }]);
    setScreen("playing");
  }

  function toTitle() {
    relicPeek.cancel();
    if (tutorialActive) {
      const previous = tutorialReturn.current;
      if (previous) {
        setGame(previous.game);
        setEvents(previous.events);
        setMode(previous.mode);
        setHasLiveSave(previous.hasLiveSave);
        setHistory(previous.history);
        setSeatedPlayer(previous.seatedPlayer);
        duelRecorded.current = previous.recorded;
        duelCards.current = previous.cards;
        heraldSaid.current = previous.announcements;
        tutorialReturn.current = null;
      }
      setSelection(null);
      clearFx();
    }
    sfx.play("button");
    sfx.stopCardTheme();
    sfx.stopCue();
    setDuelIntro(null);
    setTutorialActive(false);
    setTutorialCompleted(false);
    setTutorialStep(0);
    setDeveloperDuelActive(false);
    setDeveloperToolsOpen(false);
    setMobileMenuOpen(false);
    setEnemyPowerOpen(false);
    setScreen("title");
  }

  useEffect(() => {
    if (!tutorialActive || !tutorialCompleted) return;
    const timer = window.setTimeout(toTitle, 1500);
    return () => window.clearTimeout(timer);
  }, [tutorialActive, tutorialCompleted]);

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

  /** Cancels a fresh target-card play or Hero Power through the engine. */
  function cancelTarget(): boolean {
    const pending = game.pendingTarget;
    if (!pending || pending.player !== viewerId || (!pending.cancelPlay && !pending.cancelHeroPower)) return false;
    const action = uiActions.find((candidate) => candidate.type === "cancel_target" && candidate.player === viewerId);
    if (!action) return false;
    sfx.play("button");
    perform(action);
    return true;
  }

  /** One informational line in the duel log, trimmed to the shared limit. */
  function logInfo(text: string) {
    setEvents((items) => [...items, { kind: "info" as const, text }].slice(-EVENT_LOG_LIMIT));
  }

  function undo() {
    if (!developerCheatRevealed) return;
    const [previous, ...rest] = history;
    if (!previous) return;
    sfx.play("button");
    setGame(previous);
    setHistory(rest);
    setSelection(null);
    clearFx();
    logInfo("Last local action undone.");
  }

  function undoTurn() {
    if (!developerCheatRevealed) return;
    const boundary = history.findIndex((snapshot) => snapshot.turnNumber < game.turnNumber);
    if (boundary < 0) return;
    const previous = history[boundary];
    setGame(previous);
    setHistory(history.slice(boundary + 1));
    setSelection(null);
    clearFx();
    logInfo("Last turn undone.");
  }

  /** Infinite mana, exposed inside the Ross-only developer workbench. */
  function toggleCheatMode() {
    sfx.play("button");
    setDeveloperDuelActive(mode.kind !== "campaign");
    // ONE reading of the switch drives both the write and the log line. The
    // updater used to make its own decision from `current` while the log read
    // the render's `game`, so the two could describe opposite outcomes; and an
    // updater cannot hand its answer back out, because React runs it during the
    // next render, long after this function has returned.
    const enabled = !hasInfiniteMana(game, viewerId);
    setGame((current) =>
      enabled
        ? { ...current, cheatMode: true, cheatPlayer: viewerId }
        : { ...current, cheatMode: false, cheatPlayer: null },
    );
    setSelection(null);
    logInfo(enabled ? "Cheat mode enabled. Mana is infinite." : "Cheat mode disabled. Mana costs restored.");
  }

  /** A workbench board edit. Relics go through the engine, so their landing effects fire. */
  function developerEdit(edit: DeveloperEdit) {
    const result = applyDeveloperEdit(game, edit, library, viewerId);
    if (!result) return;
    setDeveloperDuelActive(true);
    setGame(result.state);
    logInfo(result.text);
  }

  /**
   * Jumps straight to the result screen, with a chosen winner and a chosen MVP.
   *
   * The result screen is the winner's title, the rays, the champion's full card
   * face and its damage line, and every one of them used to need a real duel
   * played to its end — and a SPECIFIC end, since which card it names is decided
   * by who dealt the most damage.
   *
   * OUTSIDE A LIVE CAMPAIGN DUEL NOTHING IS RECORDED. `duelRecorded` is claimed
   * before the phase changes, so the effect that writes the record, pays the pack
   * and clears the save sees a duel that has already been dealt with and stands
   * down. A live campaign duel is the exception: it ends for real and counts
   * toward progression, as the workbench buttons say. The log names which of the
   * two happened, because a result screen that looks exactly like a real one is
   * the one place a developer shortcut could be mistaken for a win.
   *
   * The tally is written the way the engine writes it — one entry, keyed by
   * instance id, owned by the winner — rather than by teaching `GameOver` a
   * second way to be told about a card. Its damage figure is invented, and it is
   * the only invented number on the screen.
   */
  function developerShowResult(winner: PlayerId | "draw", cardId: string) {
    const card = library[cardId];
    // Claimed BEFORE the state change, because the recording effect fires on the
    // phase and would otherwise have already run by the time this returns.
    const campaignResult = screen === "playing" && mode.kind === "campaign" && game.phase !== "gameOver";
    duelRecorded.current = !campaignResult;
    setDeveloperDuelActive(true);
    setDeveloperToolsOpen(false);
    setScreen("playing");
    setDuelIntro(null);
    // A BOT duel, whatever was last played. The ending music asks whether the
    // duel was LOST, and only a duel against the bot can be: in hotseat somebody
    // always won, so `Enemy wins` from a hotseat mode played the victory piece
    // and the loss music could not be heard from the developer tools at all.
    if (!campaignResult) setMode({ kind: "bot", skill: "normal" });
    heraldSaid.current.delete("ending");
    const mvpOwner: PlayerId = winner === "draw" ? viewerId : winner;
    const tally: Record<string, DamageTallyEntry> = card
      ? {
          [DEVELOPER_MVP_INSTANCE]: {
            instanceId: DEVELOPER_MVP_INSTANCE,
            cardId: card.id,
            name: card.name,
            art: card.art,
            owner: mvpOwner,
            damage: DEVELOPER_MVP_DAMAGE,
          },
        }
      : {};
    setGame((current) => ({ ...current, phase: "gameOver", winner, damageTally: tally }));
    const winnerLabel =
      winner === "draw" ? "a draw" : winner === viewerId ? "your win" : `${game.players[winner].name}'s win`;
    const champion = card ? `, with ${card.name} as the champion` : "";
    logInfo(campaignResult
      ? `Developer mode ended this campaign duel on ${winnerLabel}${champion}. It counts toward progression like a played result.`
      : `Developer mode opened the result screen on ${winnerLabel}${champion}. Nothing was recorded: no duel, no record line, no pack.`);
  }

  function trackTargetPointer(event: React.PointerEvent<HTMLElement>) {
    if (game.phase === "main" && selection?.kind === "attacker" && !drag?.active) {
      pointer.schedule({ x: event.clientX, y: event.clientY });
      return;
    }
    if (
      game.phase !== "targeting" ||
      !pendingTarget ||
      pendingTarget.player !== viewerId ||
      (pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" && pendingTarget.kind !== "boardOrCore")
    ) {
      return;
    }
    pointer.schedule({ x: event.clientX, y: event.clientY });
  }

  function onHandCard(handIndex: number) {
    if (duelIntro) return;
    if (game.phase === "main" && selection?.kind === "hand" && selection.handIndex === handIndex) {
      setSelection(null);
      return;
    }
    if (game.phase === "main" && selection?.kind === "attacker") {
      cancelAttackerSelection();
      return;
    }
    if (
      game.phase === "targeting" &&
      game.pendingTarget?.player === viewerId &&
      (game.pendingTarget.cancelPlay || game.pendingTarget.cancelHeroPower)
    ) {
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
      // NAME THE REASON. A relic refused by Kratos used to be reported as "No
      // room on the board", which is a different problem with a different fix
      // and sends the player rearranging a board that was never the issue.
      const card = library[viewer.hand[handIndex]];
      const relicLock = card && isRelicCard(card) ? relicLockSource(game, viewerId) : null;
      const requiredAlignment = card && isRelicCard(card) ? relicRequiredAlignment(card.relicId, card.effect) : null;
      const noEligibleBearer = requiredAlignment !== null &&
        !viewer.board.some((slot) => slot?.alignment === requiredAlignment && hasFreeRelicSlot(slot));
      const boardFull = !viewer.board.some((slot) => !slot);
      fx.showToast(
        relicLock
          ? `${relicLock} is blocking your relics`
          : noEligibleBearer
            ? `No ${requiredAlignment} minions`
          : boardFull
            ? "No room on the board"
            : "Not enough mana",
      );
      sfx.play("invalid");
      return;
    }
    setSelection({ kind: "hand", handIndex });
  }

  /**
   * Selects a minion to attack with, and warns when its swing will be rolled
   * rather than aimed — Kurogiri, or a Bill Cipher slot. Said at the moment
   * of decision, because the redirect happens after the target is chosen.
   */
  function armAttacker(slotIndex: number) {
    setSelection({ kind: "attacker", slotIndex });
    const sourceElement = document.querySelector<HTMLElement>(`[data-slot="${viewerId}-${slotIndex}"]`);
    const bounds = sourceElement?.getBoundingClientRect();
    if (bounds) {
      const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      setTargetArrowOrigin(origin);
      pointer.set(origin);
    }
    const minion = viewer.board[slotIndex];
    if (minion && attacksRandomly(game, minion)) fx.showToast("Swinging blind — the target is rolled");
  }

  /** Drop an armed attack without spending the minion's attack. */
  function cancelAttackerSelection(): boolean {
    if (selection?.kind !== "attacker") return false;
    sfx.play("button");
    setSelection(null);
    clearHoverPreview();
    setTargetArrowOrigin(null);
    return true;
  }

  /** Flash the live Taunt blockers when an aimed attack tries to pass them. */
  function flashTauntBlockers(targetSlot?: number): boolean {
    if (game.phase !== "main" || selection?.kind !== "attacker") return false;
    const attackerSlot = selection.slotIndex;
    const legalAttackTargets = new Set(
      uiActions
        .filter(
          (action): action is Extract<GameAction, { type: "attack_minion" }> =>
            action.type === "attack_minion" && action.attackerSlot === attackerSlot,
        )
        .map((action) => action.targetSlot),
    );
    if (targetSlot !== undefined && legalAttackTargets.has(targetSlot)) return false;

    const blockerIds = game.players[opponentId].board
      .map((minion, slot) => ({ minion, slot }))
      .filter(
        ({ minion, slot }) =>
          Boolean(minion) &&
          !minion!.silenced &&
          minion!.keywords.includes("Taunt") &&
          legalAttackTargets.has(slot),
      )
      .map(({ minion }) => minion!.instanceId);
    if (blockerIds.length === 0) return false;

    fx.flashTaunt(blockerIds);
    return true;
  }

  function onBoardSlot(owner: PlayerId, slotIndex: number) {
    if (duelIntro) return;
    const minion = game.players[owner].board[slotIndex];

    if (game.phase === "targeting") {
      const chosen = chooseTargetAt(owner, slotIndex);
      if (!chosen) cancelTarget();
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

    if (selection?.kind === "attacker") {
      if (owner !== opponentId) {
        cancelAttackerSelection();
        return;
      }
      const action = uiActions.find(
        (candidate) =>
          candidate.type === "attack_minion" &&
          candidate.attackerSlot === selection.slotIndex &&
          candidate.targetSlot === slotIndex,
      );
      if (action) perform(action);
      else if (!minion || !flashTauntBlockers(slotIndex)) cancelAttackerSelection();
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
    if (e.pointerType === "touch" || e.pointerType === "pen") return;
    if (game.phase !== "main" || !playable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no active pointer — drag still works without capture
    }
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDrag({ kind: "hand", handIndex, cardId: viewer.hand[handIndex], active: false });
  }

  function startAttackDrag(e: React.PointerEvent<HTMLElement>, slotIndex: number, canAttack: boolean) {
    if (duelIntro) return;
    if (e.pointerType === "touch") return;
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
      active: false,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const becameActive =
      !drag.active &&
      Math.hypot(e.clientX - dragOrigin.current.x, e.clientY - dragOrigin.current.y) > DRAG_THRESHOLD;
    if (becameActive) {
      clearHoverPreview();
      sfx.play("pickup");
      if (drag.kind === "hand") setSelection({ kind: "hand", handIndex: drag.handIndex });
      else {
        armAttacker(drag.slotIndex);
        setTargetArrowOrigin(null);
      }
    }
    // Activate immediately so a release before the next frame still drops the card.
    if (becameActive) {
      pointer.set({ x: e.clientX, y: e.clientY });
      setDrag({ ...drag, active: true });
    } else if (drag.active) pointer.schedule({ x: e.clientX, y: e.clientY });
  }

  function endDrag(e: React.PointerEvent) {
    if (e.pointerType === "touch") clearHoverPreview();
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
      const apexBlocked=drag.kind==='attacker'&&heroEl&&Number(heroEl.getAttribute('data-hero'))===opponentId&&flashApexRestriction();
      if(!apexBlocked&&!cancelAttackerSelection())setSelection(null);
    }
    clearHoverPreview();
    setDrag(null);
  }

  function cancelDrag() {
    // `pointercancel` is the NORMAL path on a phone: the row scrollers take
    // horizontal swipes via `touch-action: pan-x`, and the browser cancels the
    // pointer the moment it claims one. The preview has to close with it.
    clearHoverPreview();
    if (!drag) return;
    if (drag.active) {
      sfx.play("invalid");
      if (!cancelAttackerSelection()) setSelection(null);
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

  const apexBodies=game.heroPowers[opponentId]==='yujiro_apex_duel'?viewer.board.filter((m):m is MinionInstance=>Boolean(m)):[];
  const apexAttack=Math.max(-1,...apexBodies.map(m=>m.atk));
  const apexPrey=(selection?.kind==='attacker'?apexBodies.find(m=>m===viewer.board[selection.slotIndex]&&m.atk===apexAttack):null)??apexBodies.find(m=>m.atk===apexAttack);
  function flashApexRestriction():boolean {
    const attacker=selection?.kind==='attacker'?viewer.board[selection.slotIndex]:null;
    if(game.heroPowers[opponentId]!=='yujiro_apex_duel'||!attacker||attacker.atk>=apexAttack)return false;
    const marker=fx.nextId();setEnemyPowerOpen(true);setApexAlert(marker);
    window.setTimeout(()=>setApexAlert(current=>current===marker?null:current),1100);
    return true;
  }
  function attackCore() {
    if (selection?.kind !== "attacker") return;
    const action = uiActions.find(
      (candidate) => candidate.type === "attack_core" && candidate.attackerSlot === selection.slotIndex,
    );
    if (action) perform(action);
    else if (!flashApexRestriction()&&!flashTauntBlockers()) cancelAttackerSelection();
  }

  const endTurnAction = uiActions.find((action) => action.type === "end_turn");
  const coinAction = uiActions.find((action) => action.type === "use_coin");
  const coreTargetable = canAttackCore(uiActions, selection);
  const heroFx = (id: PlayerId) => fx.impacts.filter((fx) => fx.slot === "hero" && fx.owner === id);
  // A bot's Discover/target prompt belongs to the hidden opponent. Keep the
  // engine prompt alive for the bot, but do not render its choices to the human.
  const pendingTarget =
    game.phase === "targeting" && game.pendingTarget?.player === viewerId ? game.pendingTarget : null;
  const targetSourceKey = pendingTarget
    ? pendingTarget.heroPowerId
      ? `hero-power:${pendingTarget.heroPowerId}`
      : `board:${pendingTarget.sourceOwner}:${pendingTarget.sourceInstanceId}`
    : null;

  // Target arrows are view-only, but their origin belongs to the real source:
  // the Hero Power button for a power, or the minion that opened a card effect.
  // Resolve it after the pending target renders so the arrow follows responsive
  // layout instead of guessing from the board grid.
  useEffect(() => {
    if (
      game.phase !== "targeting" ||
      !pendingTarget ||
      pendingTarget.player !== viewerId ||
      (pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" && pendingTarget.kind !== "boardOrCore")
    ) {
      setTargetArrowOrigin(null);
      return;
    }

    let sourceElement: HTMLElement | null = null;
    if (pendingTarget.heroPowerId) {
      sourceElement = document.querySelector<HTMLElement>(".hero-power-button");
    } else {
      const sourceSlot = game.players[pendingTarget.sourceOwner].board.findIndex(
        (minion) => minion?.instanceId === pendingTarget.sourceInstanceId,
      );
      if (sourceSlot >= 0) {
        sourceElement = document.querySelector<HTMLElement>(`[data-slot="${pendingTarget.sourceOwner}-${sourceSlot}"]`);
      }
    }

    const bounds = sourceElement?.getBoundingClientRect();
    if (!bounds) {
      setTargetArrowOrigin(null);
      return;
    }
    const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    setTargetArrowOrigin(origin);
    pointer.set(origin);
  }, [game.phase, pendingTarget?.kind, targetSourceKey, viewerId]);
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
   * the hand is. Developer mode also enables Z for Undo. Escape drops whatever is
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
      if (mobileMenuOpen && event.key === "Escape") { setMobileMenuOpen(false); return; }
      if (needsLandscape || overlay || developerToolsOpen || mobileMenuOpen || curtainUp || duelIntro || pendingTarget || game.phase === "drawChoice" || game.phase === "mulligan") return;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === " " || event.key === "Enter") {
        // A focused control owns its activation key. Do not end the turn when
        // Enter is meant to pick a card, a slot, or a toolbar button.
        if(event.key==="Enter"&&target?.closest('button,a,select,[role="button"]'))return;
        if (!endTurnAction) return;
        event.preventDefault();
        perform(endTurnAction);
      } else if (event.key === "z" || event.key === "Z") {
        if (!developerCheatRevealed || history.length === 0) return;
        event.preventDefault();
        undo();
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, overlay, developerToolsOpen, mobileMenuOpen, curtainUp, duelIntro, pendingTarget, game, endTurnAction, history.length, needsLandscape, developerCheatRevealed]);

  // While a card or an arrow follows the pointer, every display frame runs the
  // main thread, and Chrome then restyles each running CSS animation on it. The
  // board's rarity shine holds still for that moment; the held card keeps its own.
  const pointerFollowing = Boolean(drag?.active) || Boolean(targetArrowOrigin && (pendingTarget || selection?.kind === "attacker"));
  // While an action's effects play, the graphics chip is the limit, so the
  // board's shine holds still for that moment too (owner's choice, 8 October
  // 2026). A card that has just landed keeps its own; see `just-arrived`.
  const effectsPlaying = fx.impacts.length > 0 || fx.ghosts.length > 0 || fx.floats.length > 0 || fx.lunge !== null || fx.shaking || fx.landing > 0;

  return (
    <FontRevisionContext value={fontRevision}><main
      className={[
        "hs-shell",
        screen === "title" ? "at-title" : "",
        overlay || developerToolsOpen || pack || chapterSpeech || defeatedChapter ? "has-overlay" : "",
        overlay === "deck" ? "title-covered" : "",
        drag?.active ? "grabbing" : "",
        tutorialActive ? "tutorial-mode" : "",
        developerDuelActive ? "developer-duel" : "",
        screen === "playing" ? viewerHealthBand : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onContextMenu={event => { if ((event.target as Element).closest('.hand-card,.board-slot,.mulligan-card')) event.preventDefault(); }}
      onPointerMove={trackTargetPointer}
      onClickCapture={event => {

        if (mobileMenuOpen && !(event.target as Element).closest('.system-buttons,.mobile-menu-toggle')) setMobileMenuOpen(false);
      }}
    >
      <div className="table-glow" aria-hidden="true" />

      <div
        className={[
          "table-frame",
          fx.shaking ? "shaking" : "",
          fx.landing > 0 ? "heavy-landing" : "",
          duelIntro ? "duel-opening" : "",
          duelIntro ? `duel-opening-${duelIntro.phase}` : "",
          pointerFollowing ? "pointer-following" : "",
          effectsPlaying ? "effects-playing" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        /* The drop animates the frame without remounting the board. Remounting
           the whole table made every existing minion flicker when a heavy card
           arrived, especially Divine Shield cards such as UFO and Flash. */
        style={fx.landing > 0 ? ({ "--thud": fx.landing } as CSSProperties) : undefined}
      >
        <div className="health-damage-overlay" aria-hidden="true" />
        <header className="top-strip">
        <div className="brand-mini">
          <span className="brand-mark" />
          <strong>Convergence</strong>
        </div>
        {/* Click, never hover (owner's ruling, 2 September 2026). It used to
            open after a one-second hover, which meant it appeared whenever the
            pointer crossed the top strip on its way somewhere else, and covered
            the enemy board while it was there. */}
        <div
          className={`enemy-hero-wrap${enemyPowerOpen?" is-open":""}${apexAlert!==null?" apex-blocked":""}`}
          onPointerDown={(event) => {
            // The plate is ALSO the button that attacks the enemy core, so the
            // toggle stands aside for exactly the click that would be a swing —
            // and takes every other click on it, which is the whole strip.
            if ((event.target as HTMLElement).closest(".hero-plate.targetable")) return;
            // While aiming, a click on the portrait is an attempt to hit it, even
            // behind a Taunt. Opening the power card then would cover the board
            // mid-aim. Yujiro's hunt still opens it, from the blocked strike.
            if (selection?.kind === "attacker" || targetArrowOrigin !== null) return;
            setEnemyPowerOpen((open) => !open);
          }}
        >
          <HeroPlate
            enemy
            identity={campaignBoss && campaignChapter ? { card: campaignBoss, chapter: campaignChapter.chapter, universe: campaignChapter.universe } : undefined}
            player={opponent}
            heroPower={game.heroPowers[opponentId]}
            cheatMode={opponentHasInfiniteMana}
            floats={fx.floats.filter((f) => f.slot === "hero" && f.owner === opponentId)}
            impacts={heroFx(opponentId)}
            targetable={coreTargetable}
            active={game.activePlayer === opponentId && game.phase !== "gameOver"}
            thinking={botThinking}
            revealedHand={revealedOpponentHand}
            library={library}
            onCardPreview={preview.previewCard}
            onCardPreviewEnd={preview.endPreview}
            onStrike={attackCore}
            onBlockedStrike={selection?.kind === "attacker" ? attackCore : undefined}
            heroPowerCounter={game.heroPowers[opponentId] === "glados_test_protocol" ? `${Math.min(15, game.players[viewerId].turnsStarted)}/15` : undefined}
            protocolWarning={gladosProtocolWarning}
            apexPrey={apexPrey}
          />
          {campaignBoss && !coreTargetable && selection?.kind !== "attacker" && <button
            type="button" className="opponent-portrait-inspect" aria-label={`Open Star Chart for ${campaignBoss.name}`}
            title={`View ${campaignBoss.name}'s Star Chart`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setEnemyPowerOpen(false); setOverlay("opponent"); }}
          />}
          <HeroPowerCard key={apexAlert??"power"}
            definition={heroPowerDefinition(game.heroPowers[opponentId])}
            cost={effectiveHeroPowerCost(game, opponentId)}
            turnsRemaining={gladosTurnsRemaining}
          />
          {gladosProtocolWarning&&screen==='playing'&&<ProtocolWarningBubble turns={gladosTurnsRemaining!}/>}
        </div>
        <button className="mobile-menu-toggle" type="button" aria-label="Duel menu" aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(open => !open)}>☰ Menu</button>
        <div className={`system-buttons${mobileMenuOpen ? " mobile-open" : ""}`} onClickCapture={() => setMobileMenuOpen(false)}>
          {game.heroPowers[viewerId] && <p className="mobile-power-description"><strong>{heroPowerDefinition(game.heroPowers[viewerId])?.name}</strong>
            <span>{heroPowerDefinition(game.heroPowers[viewerId])?.text}</span><small>2 mana · Once per turn{game.heroPowerUsed[viewerId] ? " · Used" : ""}</small></p>}
          <button type="button" className="mobile-log-trigger" onClick={() => setLogOpen(open => !open)}>Duel log</button>
          {developerCheatRevealed && <button type="button" className="mobile-undo-trigger" disabled={!history.length || botThinking || game.phase !== "main"} onClick={undo}>Undo last action</button>}
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
          <FullscreenButton active={isFullscreen} onToggle={toggleFullscreen} />
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
              className={viewerHasInfiniteMana ? "cheat-toggle active" : "cheat-toggle"}
              aria-pressed={viewerHasInfiniteMana}
              onClick={toggleCheatMode}
              title={viewerHasInfiniteMana ? "Infinite mana is on. Click to turn it off." : "Enable infinite mana"}
            >
              {viewerHasInfiniteMana ? "⚡ Cheat On" : "⚡ Cheat Off"}
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
            if (game.pendingTarget?.player === viewerId) {
              if (event.target === event.currentTarget) cancelTarget();
              return;
            }
            const target = event.target;
            if (target instanceof Element && target.closest(".board-slot, .end-turn, .deck-pile")) return;
            if (selection?.kind === "hand") { setSelection(null); return; }
            if (selection?.kind !== "attacker") return;
            cancelAttackerSelection();
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
            tauntFlash={fx.tauntFlash}
            onSlot={guardedSlotClick}
            ghosts={fx.ghosts}
            floats={fx.floats}
            impacts={fx.impacts}
            lunge={fx.lunge}
            onPreview={preview.previewMinion}
            onPreviewEnd={preview.endPreview}
            reach={preview.reach}
            relicFlash={relicFlash}
            onRelicPreview={preview.previewRelic}
            onRelicPress={(event, relic) => { clearHoverPreview(); relicPeek.start(event, relic); }}
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
            {fx.riftFlare ? <span key={fx.riftFlare} className="rift-flare" /> : null}
          </div>
          <BoardRow
            owner={viewerId}
            label={`${viewer.name}'s board`}
            game={game}
            legalActions={uiActions}
            viewerId={viewerId}
            pendingTarget={pendingTarget}
            selection={selection}
            tauntFlash={fx.tauntFlash}
            onSlot={guardedSlotClick}
            ghosts={fx.ghosts}
            floats={fx.floats}
            impacts={fx.impacts}
            lunge={fx.lunge}
            onPreview={preview.previewMinion}
            onPreviewEnd={preview.endPreview}
            reach={preview.reach}
            relicFlash={relicFlash}
            onRelicPreview={preview.previewRelic}
            onRelicPress={(event, relic) => { clearHoverPreview(); relicPeek.start(event, relic); }}
            onDragStart={startAttackDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={cancelDrag}
          />

          {!compactLayout && <button
            type="button"
            className="end-turn"
            onClick={() => endTurnAction && perform(endTurnAction)}
            disabled={!endTurnAction}
            title="End your turn (Space)"
          >
            End Turn
          </button>}

          <div
            className={fx.flights.length > 0 ? "deck-pile drawing" : "deck-pile"}
            title={`Your turn ${viewer.turnsStarted}`}
          >
            <span className="card-back" />
            <span className="card-back" />
            <span className="card-back" />
            <em aria-label="Your turn count">Turn {viewer.turnsStarted}</em>
          </div>
        </section>

        <section className="command-bar">
          <div className="hero-command">
            <HeroPlate
              player={viewer}
              heroPower={game.heroPowers[viewerId]}
              cheatMode={viewerHasInfiniteMana}
              floats={fx.floats.filter((f) => f.slot === "hero" && f.owner === viewerId)}
              impacts={heroFx(viewerId)}
              active={game.activePlayer === viewerId && game.phase !== "gameOver"}
            />
            {game.heroPowers[viewerId] ? (
              <HeroPowerButton
                definition={heroPowerDefinition(game.heroPowers[viewerId])}
                cost={effectiveHeroPowerCost(game, viewerId)}
                action={uiActions.find((candidate) => candidate.type === "use_hero_power")}
                used={game.heroPowerUsed[viewerId]}
                onUse={(action) => {
                  sfx.play("button");
                  perform(action);
                }}
              />
            ) : null}
          </div>

          <HandFan
            game={game}
            library={library}
            viewerId={viewerId}
            playable={(handIndex) => uiActions.some(
              (action) => (action.type === "play_card" || action.type === "play_relic") && action.handIndex === handIndex,
            )}
            selectedIndex={selection?.kind === "hand" ? selection.handIndex : null}
            draggingIndex={drag?.active && drag.kind === "hand" ? drag.handIndex : null}
            onCardClick={guardedHandClick}
            onCardPointerDown={startHandDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onCardRest={preview.armHandKeywords}
            onLeave={clearHandKeywords}
          />

          <ManaTray
            mana={viewer.mana}
            maxMana={viewer.maxMana}
            infinite={viewerHasInfiniteMana}
            manaFx={fx.manaFx}
            introReveal={duelIntro?.phase === "mana"}
          />
        </section>
      </div>

      <details className="log-drawer" open={logOpen} onToggle={event => setLogOpen(event.currentTarget.open)}>
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
              <pre>{JSON.stringify({ cheatMode: game.cheatMode, cheatPlayer: game.cheatPlayer, game, legalActions: legalActions.map(actionKey) }, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </details>

      {/* Cards leaving the deck. Fixed layer, so a flight is not clipped by the
          table frame on its way from the pile to the fan. */}
      {fx.flights.map((flight) => (
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

      {fx.banner ? (
        <div key={fx.banner.id} className={fx.banner.mine ? "turn-banner" : "turn-banner theirs"} aria-hidden="true">
          <b>{fx.banner.text}</b>
        </div>
      ) : null}

      {preview.hover ? <HoverCard hover={preview.hover} /> : null}
      {relicPeek.relic && relicPeek.rect && screen === 'playing' && !needsLandscape && <RelicCardPeek relic={relicPeek.relic} rect={relicPeek.rect} />}
      {compactLayout && screen === 'playing' && !needsLandscape && game.phase === 'main' && !overlay && !mobileMenuOpen && !enemyPowerOpen && !logOpen && !curtainUp && !duelIntro && !pack && !chapterSpeech && !defeatedChapter && !developerToolsOpen
        ? createPortal(<button type="button" className="end-turn mobile-end-turn" disabled={!endTurnAction}
          onClick={() => endTurnAction && perform(endTurnAction)} title="End your turn (Space)">End Turn</button>, document.body) : null}
      {needsLandscape && <div className="phone-rotate-screen" role="dialog" aria-modal="true" aria-label="Landscape mode required">
        <section><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="27" y="12" width="46" height="76" rx="8"/><path d="M38 19h24M45 80h10M8 48c0-22 18-40 40-40M8 48l-5-9M8 48l10-3M92 52c0 22-18 40-40 40M92 52l5 9M92 52l-10 3"/></svg>
          <h2>Turn your phone sideways</h2><p>Duels play in landscape.</p>
          {typeof document.documentElement.requestFullscreen === 'function' && <button className="primary" onClick={() => { void requestPhoneLandscape(true); }}>Enter landscape fullscreen</button>}
          <button onClick={toTitle}>Return to menu</button></section>
      </div>}
      {preview.handKeywords ? (
        // ABOVE the card, never beside it. Beside meant sitting on the card it
        // was explaining, or on its neighbour in the fan; the empty board over
        // the hand is the one place with room. The panel is CENTRED on the left
        // it is given, so this hangs it over the card's right-hand side.
        // Owner's ruling, 3 September 2026.
        <KeywordPopover entries={preview.handKeywords.entries} left={preview.handKeywords.left + 96} top={preview.handKeywords.top} above />
      ) : null}

      {/* The blow that ends the duel. Fires on the action that sets a winner, so
          the hit is seen before the victory curtain drops over it. */}
      {fx.lethal ? <div key={fx.lethal} className="lethal-flash" aria-hidden="true" /> : null}

      {fx.toast ? (
        <div
          className={fx.toast.tone === "bargain" ? "board-toast bargain-popup" : "board-toast"}
          key={fx.toast.id}
          role="status"
          style={{ animationDuration: `${fx.toast.durationMs}ms` }}
        >
          {fx.toast.text}
        </div>
      ) : null}
      {screen==='playing'&&!tutorialActive&&<TurnClockWarning clock={turnClock}/>}

      {drag?.active && drag.kind === "hand" ? (
        <DragGhost pointer={pointer}>
          {library[drag.cardId] ? <CardFace card={playableFace(library[drag.cardId], effectiveCardCost(game, viewerId, library[drag.cardId]))} /> : null}
        </DragGhost>
      ) : null}

      {drag?.active && drag.kind === "attacker" ? (
        <FollowingArrow from={dragArrowOrigin!} pointer={pointer} />
      ) : null}

      {targetArrowOrigin && (pendingTarget || (selection?.kind === "attacker" && !drag?.active)) ? (
        <FollowingArrow from={targetArrowOrigin} pointer={pointer} />
      ) : null}

      {/* Board/slot prompts are now entirely in-board: the highlighted legal
          slots are the instruction, so a fixed tip strip only adds noise.
          Hand, value, and board-or-core choices still need their controls. */}
      {screen === "playing" && pendingTarget && pendingTarget.kind !== "board" && pendingTarget.kind !== "slot" ? (
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

      {screen === "playing" && game.phase === "drawChoice" && game.drawChoice && game.drawChoice.player === viewerId ? (
        <DrawChoiceOverlay game={game} library={library} onChoose={perform} locked={botThinking} />
      ) : null}

      {screen === "playing" && game.phase === "mulligan" && game.mulligan?.player === viewerId && !duelIntro ? (
        <MulliganOverlay game={game} library={library} onChoose={perform} locked={botThinking} />
      ) : null}

      {screen === "playing" && game.phase === "gameOver" ? (
        <GameOver
          game={game}
          library={library}
          tutorial={tutorialActive}
          campaign={mode.kind === "campaign"}
          campaignLoss={mode.kind === "campaign" && typeof game.winner === "number" && game.winner !== viewerId}
          onRestart={tutorialActive ? beginTutorial : restart}
          onMenu={toTitle}
        />
      ) : null}

      {tutorialActive && game.phase !== "gameOver" && !duelIntro ? (
        <TutorialCoach
          step={tutorialStep}
          completed={tutorialCompleted}
          onSkip={toTitle}
          onStart={()=>setTutorialStep(1)}
        />
      ) : null}

      {/* Above the result screen, not beside it. The pack is the reward for the
          duel that just ended, so it has to be the thing in the way. */}
      {pack && !defeatedChapter ? (
        <CardPack ids={pack} library={library} total={progress.unlockedIds.length} onDone={closePack} />
      ) : null}

      {/* The curtain sits above every other overlay: nothing behind it may be
          readable, including an open prompt belonging to the other player. */}
      {curtainUp ? (
        <PassScreen
          toName={game.players[seatOwner].name}
          onReady={() => setSeatedPlayer(seatOwner)}
        />
      ) : null}

      {duelIntro ? <DuelIntro phase={duelIntro.phase} onSkip={skipDuelIntro} /> : null}
      {bossLines[0] && screen === "playing" && game.phase !== "gameOver" ? <CollectedBossSpeech key={bossLines[0].id} cue={bossLines[0]} onDone={closeBossLine} /> : null}
      {chapterSpeech && (() => {
        const chapter = CAMPAIGN_CHAPTERS[chapterSpeech.mode.chapter-1];
        const boss = library[chapter.bossId];
        return <CampaignSpeech key={`${chapterSpeech.stage}-${chapter.chapter}`} stage={chapterSpeech.stage} chapter={chapter.chapter}
          name={chapterSpeech.stage === "entrance" ? boss.name : CAMPAIGN_PROTAGONIST}
          text={chapterSpeech.stage === "prologue" ? CAMPAIGN_PREMISE : chapterSpeech.stage === "rick-intro" ? chapter.story.rickIntro : chapter.story.entrance}
          art={chapterSpeech.stage === "entrance" ? boss.art : `${import.meta.env.BASE_URL}campaign/rick-gramps.webp`} accent={chapterSpeech.stage === "entrance" && isMinionCard(boss) ? campAccent(boss.camp) : "#d7b76f"}
          onContinue={continueChapterSpeech} onCancel={() => {setChapterSpeech(null);setOverlay("campaign");}} />;
      })()}
      {defeatedChapter && defeatedBoss && <CampaignSpeech key={`defeat-${defeatedChapter.chapter}`} stage={progress.pendingBossSpeechOutcome === "loss" ? "loss" : "defeat"} chapter={defeatedChapter.chapter}
        name={defeatedBoss.name} text={progress.pendingBossSpeechOutcome === "loss" ? defeatedChapter.story.loss : defeatedChapter.story.defeat} art={defeatedBoss.art}
        accent={isMinionCard(defeatedBoss) ? campAccent(defeatedBoss.camp) : "#d7b76f"} onContinue={closeDefeatSpeech} />}

      {screen === "title" ? (
        <TitleScreen
          canContinue={hasLiveSave && game.phase !== "gameOver"}
          playerCount={playerCount}
          onContinue={() => {
            void requestPhoneLandscape(phoneLayout.phone);
            sfx.play("button");
            sfx.unlock();
            setDuelIntro(null);
            setScreen("playing");
          }}
          onStart={(next) => next.kind === "hotseat" ? setOverlay("hotseat") : beginDuel(next)}
          campaignCleared={campaignComplete(progress)}
          completedChapters={progress.completedChapters}
          onCampaign={() => setOverlay("campaign")}
          onDeck={() => openDeck()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTutorial={beginTutorial}
          onLore={() => setOverlay('lore')}
          onDeveloperTools={() => setDeveloperToolsOpen(true)}
          developerCheatRevealed={developerCheatRevealed}
          developerCheatActive={progress.developerCheat}
          onDeveloperUnlock={activateDeveloperCheat}
          onDeveloperReset={resetDeveloperProgress}
          unlocked={progress.unlockedIds.length}
          rosterSize={cards.length + relics.length}
        />
      ) : null}

      {overlay === "campaign" && <CampaignScreen progress={progress} onClose={() => setOverlay(null)}
        onPlay={(chapter) => beginDuel({ kind: "campaign", chapter, skill: CAMPAIGN_DIFFICULTIES[CAMPAIGN_CHAPTERS[chapter - 1].difficultyId].botSkill })} />}
      {overlay === 'lore' && <LoreLibrary completedBosses={progress.completedBosses} onClose={()=>setOverlay(null)} />}
      {overlay === "deck" && <CardGallery onPresetCreate={name=>createDeckPreset(name,builderSeat)} onPresetSelect={id=>persistProgress(selectNamedDeck(progress,id,builderSeat))} onHeroPowerViewed={()=>persistProgress(acknowledgeHeroPowers(progress))} onHeroPowerChange={setSelectedHeroPower} progress={progress} fontRevision={fontRevision} seat={builderSeat} onChange={(ids) => persistProgress(saveDeckDraft(progress, ids, builderSeat))}
        onClose={() => setOverlay(builderReturn === "title" ? null : builderReturn)} />}
      {overlay === "hotseat" && <HotseatSetup progress={progress} onClose={() => setOverlay(null)} onEdit={(seat) => openDeck(seat, "hotseat")}
        onStart={() => beginDuel({ kind: "hotseat" })} />}
      {storageError && <div className="campaign-storage-error" role="alert">Progress could not be saved. Keep this page open and retry.
        <button onClick={() => { if (persistProgress(progress) && game.phase === "gameOver") { clearSave(); setHasLiveSave(false); } }}>Retry save</button></div>}
      {overlay === "opponent" && campaignBoss && <GalleryDetailModal
        entry={{ key: campaignBoss.id, card: campaignBoss, face: playableFace(campaignBoss) }}
        locked={false}
        onClose={() => setOverlay(null)}
        onNavigate={() => undefined}
      />}
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
      {developerToolsOpen ? (
        <DeveloperTools
          screen={screen}
          cards={Object.values(library).filter((card) => !isTokenCardId(card.id))}
          game={game}
          viewerId={viewerId}
          onClose={() => setDeveloperToolsOpen(false)}
          onToggleCheat={toggleCheatMode}
          onUndoTurn={undoTurn}
          canUndoTurn={history.some((snapshot) => snapshot.turnNumber < game.turnNumber)}
          onEdit={developerEdit}
          onShowResult={developerShowResult}
          onTestCard={(cardId) => beginDuel({ kind: "bot", skill: "easy" }, { testCardId: cardId })}
        />
      ) : null}
    </main></FontRevisionContext>
  );
}
