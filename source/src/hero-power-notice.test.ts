import {describe,it,expect,vi,afterEach} from 'vitest';
import {emptyProgress,finishDuel,hasNewHeroPower,acknowledgeHeroPowers,saveProgress,loadProgress} from './progress';
afterEach(()=>vi.unstubAllGlobals());
const win=(progress:ReturnType<typeof emptyProgress>,chapter:number)=>finishDuel(progress,{winner:0,viewerId:0,mode:{kind:'campaign',chapter,skill:'easy',duelId:`notice-${chapter}`},turns:10,at:1},{seen:[],played:[]});
describe('new Hero Power notice',()=>{
 it('starts old saves quietly and announces their next newly earned power',()=>{
  const storage=new Map<string,string>();vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
  const legacy=win(emptyProgress(),1);
  const {heroPowerSeenWins:_,...oldSave}=legacy;
  storage.set('convergence.progress.v4',JSON.stringify(oldSave));
  const loaded=loadProgress();expect(loaded.heroPowerSeenWins).toBe(1);expect(hasNewHeroPower(loaded)).toBe(false);
  expect(hasNewHeroPower(win(loaded,2))).toBe(true);
 });
 it('clears on viewing and returns only for another newly unlocked power',()=>{
  let p=emptyProgress();expect(hasNewHeroPower(p)).toBe(false);p=win(p,20);expect(hasNewHeroPower(p)).toBe(true);
  const power=p.selectedHeroPower;p=acknowledgeHeroPowers(p);expect(hasNewHeroPower(p)).toBe(false);expect(p.selectedHeroPower).toBe(power);
  p=win(p,20);expect(hasNewHeroPower(p)).toBe(false);p=win(p,3);expect(hasNewHeroPower(p)).toBe(true);
  for(let ch=1;ch<=20;ch++)p=win(p,ch);p=acknowledgeHeroPowers(p);expect(hasNewHeroPower(p)).toBe(false);
 });
 it('persists acknowledgement while adding the starter options without erasing a custom deck',()=>{
  const storage=new Map<string,string>();vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
  const p=acknowledgeHeroPowers(win(emptyProgress(),1));p.playerDeck=p.playerDeck.slice(1);saveProgress(p);
  const loaded=loadProgress();expect(loaded.playerDeck).toEqual(p.playerDeck);expect(loaded.unlockedIds.length).toBe(49);expect(hasNewHeroPower(loaded)).toBe(false);
 });
});
