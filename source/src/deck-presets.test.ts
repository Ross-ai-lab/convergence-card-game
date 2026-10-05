import {describe,it,expect,vi,afterEach} from 'vitest';
import {emptyProgress,saveDeckDraft,createNamedDeck,ensureNamedDeck,selectNamedDeck,selectHeroPower,unlockAllProgress,saveProgress,loadProgress,PROGRESS_KEY} from './progress';
afterEach(()=>vi.unstubAllGlobals());
function memoryStorage(){
  const values=new Map<string,string>();
  vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  return values;
}
describe('automatically saved named decks',()=>{
  it('starts with a selected Starter Deck and saves edits across switches',()=>{
    const p=emptyProgress(),starter=p.selectedDecks[0]!;
    expect(p.savedDecks[0].name).toBe('Starter Deck');
    const edited=saveDeckDraft(p,p.playerDeck.slice(0,29));
    const created=createNamedDeck(edited,'Nature');const id=created.selectedDecks[0]!;
    expect(created.playerDeck).toEqual([]);expect(created.savedDecks.find(d=>d.id===starter)?.cards).toHaveLength(29);
    const added=saveDeckDraft(created,[p.playerDeck[0]]);
    const back=selectNamedDeck(added,starter);expect(back.playerDeck).toHaveLength(29);
    expect(selectNamedDeck(back,id).playerDeck).toEqual([p.playerDeck[0]]);
    expect(added.savedDecks.find(d=>d.id===id)?.cards).not.toBe(added.playerDeck);
  });
  it('clears only the selected deck and never overwrites a duplicate name',()=>{
    const p=emptyProgress(),created=createNamedDeck(p,'Nature');
    const edited=saveDeckDraft(created,[p.playerDeck[0]]),cleared=saveDeckDraft(edited,[]);
    expect(cleared.savedDecks.find(d=>d.name==='Nature')?.cards).toEqual([]);
    expect(cleared.savedDecks.find(d=>d.name==='Starter Deck')?.cards).toHaveLength(30);
    expect(createNamedDeck(edited,'  nAtUrE  ')).toBe(edited);
    expect(selectNamedDeck(edited,'')).toBe(edited);
  });
  it('keeps default hotseat editing independent from the personal deck',()=>{
    const p=ensureNamedDeck(emptyProgress(),1),edited=saveDeckDraft(p,p.hotseatDeck.slice(0,29),1);
    expect(edited.playerDeck).toEqual(p.playerDeck);expect(edited.hotseatDeck).toHaveLength(29);
    expect(edited.selectedDecks[1]).not.toBe(edited.selectedDecks[0]);
  });
  it('updates both seat copies when deliberately selecting the same named deck',()=>{
    const p=emptyProgress(),shared=selectNamedDeck(p,p.selectedDecks[0]!,1);
    const edited=saveDeckDraft(shared,[],1);expect(edited.playerDeck).toEqual([]);expect(edited.hotseatDeck).toEqual([]);
  });
  it('saves Hero Power changes with their deck',()=>{
    const p=unlockAllProgress(emptyProgress()),starter=p.selectedDecks[0]!;
    const powered=selectHeroPower(p,'enemy_core_damage');const other=createNamedDeck(powered,'Other');
    const changed=selectHeroPower(other,'core_heal');
    expect(selectNamedDeck(changed,starter).selectedHeroPower).toBe('enemy_core_damage');
  });
  it('persists incomplete deck edits without a Save button',()=>{
    memoryStorage();const p=emptyProgress(),created=createNamedDeck(p,'Experiment');
    const edited=saveDeckDraft(created,p.playerDeck.slice(0,4));saveProgress(edited);
    const loaded=loadProgress();expect(loaded.selectedDecks).toEqual(edited.selectedDecks);
    expect(loaded.playerDeck).toEqual(edited.playerDeck);expect(loaded.savedDecks).toEqual(edited.savedDecks);
  });
  it('names legacy unnamed drafts without resetting their cards or collection',()=>{
    const values=memoryStorage(),p=saveDeckDraft(emptyProgress(),emptyProgress().playerDeck.slice(0,29));
    const {savedDecks,selectedDecks,...legacy}=p;values.set(PROGRESS_KEY,JSON.stringify(legacy));
    const loaded=loadProgress();expect(loaded.playerDeck).toEqual(p.playerDeck);expect(loaded.unlockedIds).toEqual(p.unlockedIds);
    expect(loaded.savedDecks.find(d=>d.id===loaded.selectedDecks[0])?.name).toBe('Starter Deck');
    expect(loaded.savedDecks[0].cards).toHaveLength(29);
  });
  it('carries legacy unsaved edits into the selected preset while retaining other decks',()=>{
    const values=memoryStorage(),p=emptyProgress(),named=createNamedDeck(p,'Nature');
    const old={...named,playerDeck:p.playerDeck.slice(0,5)};values.set(PROGRESS_KEY,JSON.stringify(old));
    const loaded=loadProgress();expect(loaded.savedDecks.find(d=>d.name==='Nature')?.cards).toEqual(old.playerDeck);
    expect(loaded.savedDecks.find(d=>d.name==='Starter Deck')?.cards).toHaveLength(30);
  });
  it('preserves divergent legacy seat drafts instead of merging their edits',()=>{
    const values=memoryStorage(),p=emptyProgress();
    values.set(PROGRESS_KEY,JSON.stringify({...p,playerDeck:p.playerDeck.slice(0,29),hotseatDeck:p.hotseatDeck.slice(0,28),selectedDecks:[p.selectedDecks[0],p.selectedDecks[0]]}));
    const loaded=loadProgress();expect(loaded.playerDeck).toHaveLength(29);expect(loaded.hotseatDeck).toHaveLength(28);
    expect(loaded.selectedDecks[0]).not.toBe(loaded.selectedDecks[1]);
  });
});
