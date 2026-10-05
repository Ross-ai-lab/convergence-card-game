import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSave, loadGame, saveGame, queueSaveGame } from "./storage";
import { createInitialGame } from "./engine/game";
import { cards, relics } from "./data/cards";
import type { GameState } from "./engine/types";
import { spawnTestMinion } from "./engine/test-utils";
import { CAMPAIGN_STARTER_DECK, CAMPAIGN_DIFFICULTIES } from "./campaign";
import { applyAction, makeCardLibrary } from "./engine/game";

/**
 * The save slot, exercised through a stand-in for `window.localStorage`.
 *
 * `storage.ts` reaches for `window` directly and swallows every failure, so a
 * missing browser would make these tests pass by doing nothing at all. Stubbing
 * the global is what makes them able to fail.
 */
function memoryLocalStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const SAVE_KEY = "convergence.save.v32";
const LEGACY_SAVE_KEY = "convergence.save.v28";

function liveDuel(): GameState {
  const state = createInitialGame(cards, "storage-test", relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK] });
  return { ...state, phase: "main", mulligan: null, turnNumber: 4 };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the save slot", () => {
  it('refreshes copied passive text without replacing live combat stats', () => {
    vi.stubGlobal('window', {localStorage:memoryLocalStorage()});
    const game=liveDuel();
    const body=spawnTestMinion(cards.find(card=>card.id==='c001')!,0,{atk:7,hp:2,maxHp:9});
    body.gainedEffects=[{effectId:'robocop_evil_bonus',timing:'passive',text:'Passive: Deal 3x damage against Evil minions'}];
    game.players[0].board[0]=body;
    saveGame(game,[],{kind:'bot',skill:'normal'},1000);
    const loaded=loadGame()!.game.players[0].board[0]!;
    expect(loaded).toMatchObject({atk:7,hp:2,maxHp:9});
    expect(loaded.gainedEffects[0].text).toBe('Passive: Deal double damage against Evil minions');
  });
  it('rejects nonnumeric core health before it can corrupt a resumed duel', () => {
    const storage=memoryLocalStorage();vi.stubGlobal('window',{localStorage:storage});
    saveGame(liveDuel(),[],{kind:'bot',skill:'normal'},1000);
    const saved=JSON.parse(storage.getItem(SAVE_KEY)!);saved.game.players[0].health=null;
    storage.setItem(SAVE_KEY,JSON.stringify(saved));expect(loadGame()).toBeNull();
  });

  it('resolves an old Nine Hashira targeting save with its new volley', () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal('window', {localStorage:storage});
    const game=liveDuel();game.activePlayer=0;
    game.players[0].board[0]=spawnTestMinion(cards.find(card=>card.id==='c109')!,0);
    game.players[1].board[0]=spawnTestMinion(cards.find(card=>card.id==='c001')!,1,{alignment:'Evil',hp:10,maxHp:10});
    saveGame(game,[],{kind:'bot',skill:'normal'},1000);
    const legacy=JSON.parse(storage.getItem(SAVE_KEY)!);
    const source=legacy.game.players[0].board[0];
    source.effectId='hashira_focus_attack';
    legacy.game.phase='targeting';
    legacy.game.pendingTarget={kind:'board',player:0,sourceOwner:0,sourceInstanceId:source.instanceId,sourceCardId:'c109',sourceName:'Nine Hashira',effectId:'hashira_focus_attack',prompt:'Choose an Evil enemy',options:[{owner:1,slot:0}],handOptions:[],labelOptions:[],step:0,priorOptions:[],priorHandOptions:[],priorLabelOptions:[]};
    storage.setItem(SAVE_KEY,JSON.stringify(legacy));
    const loaded=loadGame()!.game;
    expect(loaded.phase).toBe('main');expect(loaded.pendingTarget).toBeNull();
    expect(loaded.players[1].board[0]?.hp).toBe(9);
    expect(loaded.players[0].board[0]).toMatchObject({effectId:'hashira_good_volley',attacksUsed:0});
  });

  it('caps legacy cores without resetting a damaged duel and refreshes replaced artwork', () => {
    vi.stubGlobal('window', { localStorage: memoryLocalStorage() });
    const game = liveDuel();
    game.players[0].health = 48;
    game.players[1].health = 12;
    game.players[0].board[0] = spawnTestMinion(cards.find(card => card.id === 'c126')!, 0, {art:'/card-art/raw/c126.webp',hp:1});
    saveGame(game, [], {kind:'bot',skill:'normal'}, 1000);
    const loaded = loadGame()!.game;
    expect(loaded.players.map(player => player.health)).toEqual([30,12]);
    expect(loaded.players[0].board[0]).toMatchObject({art:cards.find(card => card.id === 'c126')!.art,hp:1});
  });

  it('refreshes requested tiers and Mob text while retaining live combat stats',()=>{
    vi.stubGlobal('window',{localStorage:memoryLocalStorage()});const game=liveDuel();
    game.players[0].board[0]=spawnTestMinion(cards.find(card=>card.id==='c159')!,0,{rarity:'Red',atk:4,hp:3});
    game.players[0].board[1]=spawnTestMinion(cards.find(card=>card.id==='c053')!,0,{effect:'Battlecry: If 3 or more friendly minions are on the board, return them to your hand and set Mob\'s stats to 12/12',atk:12,hp:12,maxHp:12});
    saveGame(game,[],{kind:'bot',skill:'normal'},1000);const restored=loadGame()!.game;
    expect(restored.players[0].board[0]).toMatchObject({rarity:'Yellow',atk:4,hp:3});
    expect(restored.players[0].board[1]).toMatchObject({atk:12,hp:12,maxHp:12});expect(restored.players[0].board[1]?.effect).toContain('2 or more');expect(restored.players[0].board[1]?.effect).toContain('10/10');
  });
  it('migrates a v31 duel once and keeps its deadline on a second reload',()=>{
    const storage=memoryLocalStorage();vi.stubGlobal('window',{localStorage:storage});
    const game=liveDuel(),clock={key:'current-turn',remainingMs:9000,deadline:20000};
    storage.values.set('convergence.save.v31',JSON.stringify({version:31,game,events:[],mode:{kind:'hotseat'},savedAt:1000,turnClock:clock}));
    expect(loadGame()).toMatchObject({version:32,game,turnClock:clock});
    expect(storage.values.has('convergence.save.v31')).toBe(false);
    expect(loadGame()).toMatchObject({version:32,game,turnClock:clock});
  });
  it('updates an older Batman face without losing its current combat stats',()=>{
    vi.stubGlobal('window',{localStorage:memoryLocalStorage()});
    const game=liveDuel();
    const batman=cards.find(card=>card.id==='c005')!;
    game.players[0].board[0]=spawnTestMinion(batman,0,{rarity:'Purple',effect:batman.effect.replace('-2 ATK','-3 ATK'),atk:4,hp:3});
    saveGame(game,[],{kind:'bot',skill:'normal'},1000);
    const restored=loadGame()!.game.players[0].board[0]!;
    expect(restored.rarity).toBe('Red');expect(restored.effect).toContain('-2 ATK');
    expect(restored.atk).toBe(4);expect(restored.hp).toBe(3);
  });
  it('keeps the previous duel recoverable if migration cannot write the new slot',()=>{
    const storage=memoryLocalStorage();vi.stubGlobal('window',{localStorage:storage});const game=liveDuel();
    storage.values.set('convergence.save.v31',JSON.stringify({version:31,game,events:[],mode:{kind:'hotseat'},savedAt:1000}));
    vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new Error('quota');});
    expect(loadGame()?.game).toEqual(game);expect(storage.values.has('convergence.save.v31')).toBe(true);
  });
  it('updates an unfinished Batman gadget choice to the new attack reduction',()=>{
    vi.stubGlobal('window',{localStorage:memoryLocalStorage()});
    const game=liveDuel(),library=makeCardLibrary(cards,relics);
    game.players[0].hand=['c005'];game.players[0].mana=10;
    game.players[1].board[0]=spawnTestMinion(cards.find(card=>card.id==='c001')!,1);
    const victim=applyAction(game,{type:'play_card',player:0,handIndex:0,slotIndex:0},library).state;
    const gadget=applyAction(victim,{type:'choose_target',player:0,choiceIndex:0},library).state;
    gadget.pendingTarget!.labelOptions[2].label='Give it -3 ATK';
    saveGame(gadget,[],{kind:'bot',skill:'normal'},1000);
    expect(loadGame()!.game.pendingTarget!.labelOptions[2].label).toBe('Give it -2 ATK');
  });
  it("round-trips separate piles, pending Foresight, ownership and campaign cheat flags", () => {
    vi.stubGlobal("window", { localStorage: memoryLocalStorage() });
    const game = createInitialGame(cards, "separate-save", relics, {
      decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK],
      botCheats: [null, CAMPAIGN_DIFFICULTIES.ascendant.cheats],
    });
    game.phase = "drawChoice"; game.mulligan = null; game.activePlayer = 1;
    game.drawChoice = { player: 1, cards: game.playerDecks![1].deck.splice(0, 2) };
    game.playerDecks![0].bottomDeck = [game.playerDecks![0].deck.pop()!];
    game.players[0].board[0] = spawnTestMinion(cards[0], 0, { originalOwner: 1 });
    saveGame(game, [], { kind: "bot", skill: "hard" }, 1_000);
    const restored = loadGame()!.game;
    expect(restored).toEqual(game);
    const choice = { type: "choose_draw" as const, player: 1 as const, choiceIndex: 0 };
    const library = makeCardLibrary(cards, relics);
    expect(applyAction(restored, choice, library)).toEqual(applyAction(game, choice, library));
  });

  it.each([
    { playerDecks: [] },
    { playerDecks: [{ deck: [], bottomDeck: [] }, { deck: [3], bottomDeck: [] }] },
    { playerDecks: [null, null] },
    { playerDecks: [{ deck: [], bottomDeck: [] }, { deck: [], bottomDeck: [] }], deck: ["c001"] },
    { botCheats: [{}, null] },
    { botCheats: [null, { trueDice: true, readsYourReply: false, clairvoyance: false, foresight: "yes" }] },
  ])("rejects malformed optional separate-deck state %#", (corruption) => {
    const storage = memoryLocalStorage(); vi.stubGlobal("window", { localStorage: storage });
    saveGame(liveDuel(), [], { kind: "bot", skill: "hard" }, 1_000);
    const saved = JSON.parse(storage.values.get(SAVE_KEY)!);
    Object.assign(saved.game, corruption); storage.values.set(SAVE_KEY, JSON.stringify(saved));
    expect(loadGame()).toBeNull();
  });
  it("round-trips a duel in progress", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const game = liveDuel();

    saveGame(game, [], { kind: "bot", skill: "normal" }, 1_000);
    const restored = loadGame();

    expect(restored?.game.turnNumber).toBe(4);
    expect(restored?.mode).toEqual({ kind: "bot", skill: "normal" });
  });

  it("clears the previous version's key as well, so a finished duel stays finished", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    // A save left behind by the last engine version. `loadGame` still reads this
    // key, so leaving it in place after a clear used to resurrect an old duel on
    // the next visit — the title screen offered Continue on a game nobody had
    // been playing.
    storage.values.set(LEGACY_SAVE_KEY, JSON.stringify({ version: 28, game: liveDuel(), events: [], mode: { kind: "hotseat" }, savedAt: 1 }));
    saveGame(liveDuel(), [], { kind: "hotseat" }, 2);

    clearSave();

    expect(storage.values.has(SAVE_KEY)).toBe(false);
    expect(storage.values.has(LEGACY_SAVE_KEY)).toBe(false);
    expect(loadGame()).toBeNull();
  });

  it("refuses a finished duel", () => {
    const storage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });

    saveGame({ ...liveDuel(), phase: "gameOver", winner: 0 }, [], { kind: "hotseat" }, 3);

    expect(loadGame()).toBeNull();
  });
});

describe("the v26 migration", () => {
  it("resets pre-campaign saves instead of migrating them", () => {
    const storage = memoryLocalStorage(); vi.stubGlobal("window", { localStorage: storage });
    storage.values.set(LEGACY_SAVE_KEY, JSON.stringify({ version: 28, game: liveDuel(), events: [], mode: { kind: "hotseat" }, savedAt: 1 }));
    expect(loadGame()).toBeNull(); expect(storage.values.has(LEGACY_SAVE_KEY)).toBe(false);
  });
});

describe('deferred duel storage',()=>{
  it('flushes the newest complete duel and clock when the page closes',()=>{
    const memory=memoryLocalStorage();const listeners=new Map<string,()=>void>();let idle=()=>{};
    vi.stubGlobal('window',{localStorage:memory,requestIdleCallback:(run:()=>void)=>{idle=run;return 1;},cancelIdleCallback:vi.fn(),addEventListener:(name:string,run:()=>void)=>listeners.set(name,run)});
    vi.stubGlobal('document',{visibilityState:'visible',addEventListener:vi.fn()});
    const first=liveDuel(),latest=structuredClone(first);latest.players[0].health=17;
    const clock={key:'test:0:1',remainingMs:45000,deadline:55000};
    queueSaveGame(first,[],{kind:'bot',skill:'normal'},1000);
    queueSaveGame(latest,[{kind:'info',text:'Newest action'}],{kind:'bot',skill:'normal'},1100,clock);
    expect(memory.getItem(SAVE_KEY)).toBeNull();listeners.get('pagehide')!();idle();
    const payload=JSON.parse(memory.getItem(SAVE_KEY)!);
    expect(payload.game.players[0].health).toBe(17);expect(payload.turnClock).toEqual(clock);
    expect(payload.events.at(-1).text).toBe('Newest action');
  });
  it('does not restore a duel cleared before the pending write',()=>{
    const memory=memoryLocalStorage();let idle=()=>{};
    vi.stubGlobal('window',{localStorage:memory,requestIdleCallback:(run:()=>void)=>{idle=run;return 1;},cancelIdleCallback:vi.fn(),addEventListener:vi.fn()});
    vi.stubGlobal('document',{visibilityState:'visible',addEventListener:vi.fn()});
    queueSaveGame(liveDuel(),[],{kind:'bot',skill:'normal'},1000);clearSave();idle();
    expect(memory.getItem(SAVE_KEY)).toBeNull();
  });
});
