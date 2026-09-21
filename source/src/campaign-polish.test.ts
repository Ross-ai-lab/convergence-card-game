import {describe,it,expect,vi,afterEach} from "vitest";
import {CAMPAIGN_CHAPTERS,CAMPAIGN_STARTER_DECK} from "./campaign";
import {emptyProgress,unlockAllChapters,canPlayChapter,saveProgress,loadProgress,finishDuel} from "./progress";
afterEach(()=>vi.unstubAllGlobals());
function storage(){const m=new Map<string,string>();vi.stubGlobal("window",{localStorage:{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>m.delete(k)}});}
describe("campaign polish",()=>{
 it("equips both Basic cards and sends Rick Prime to Goku's reward",()=>{const p=emptyProgress();expect(p.playerDeck).toHaveLength(30);expect(p.unlockedIds).toHaveLength(30);for(const id of ["c186","c187"])expect(p.playerDeck).toContain(id);expect(p.unlockedIds).not.toContain("c008");expect(p.unlockedIds).not.toContain("c045");expect(CAMPAIGN_CHAPTERS[0].rewardCardIds).toContain("c008");expect(CAMPAIGN_CHAPTERS[0].rewardCardIds).not.toContain("c045");expect(CAMPAIGN_CHAPTERS[18].rewardCardIds).toContain("c045");expect(CAMPAIGN_CHAPTERS[0].rewardCardIds).toHaveLength(10);});
 it("unlocks fights without granting cards or pretending chapters were beaten",()=>{storage();const p=unlockAllChapters(emptyProgress());expect(canPlayChapter(p,20)).toBe(true);expect(p.completedChapters).toBe(0);expect(p.unlockedIds).toHaveLength(30);saveProgress(p);expect(canPlayChapter(loadProgress(),20)).toBe(true);});
 it("migrates an untouched old starter without leaving a short deck",()=>{storage();const p=emptyProgress();p.playerDeck=CAMPAIGN_STARTER_DECK.map(id=>({c187:"c008",c186:"c045"} as Record<string,string>)[id]??id);saveProgress(p);expect(loadProgress().playerDeck).toEqual(CAMPAIGN_STARTER_DECK);});
 it("retains loss speech across reload without awarding victory rewards",()=>{storage();const p=finishDuel(emptyProgress(),{winner:1,viewerId:0,mode:{kind:"campaign",chapter:1,skill:"easy",duelId:"lost"},turns:5,at:1},{seen:[],played:[]});saveProgress(p);const n=loadProgress();expect(n.pendingBossSpeech).toBe(1);expect(n.pendingBossSpeechOutcome).toBe("loss");expect(n.completedChapters).toBe(0);expect(n.pendingRewards).toEqual([]);});
});
