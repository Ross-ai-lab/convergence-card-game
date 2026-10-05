import {describe,it,expect,vi,afterEach} from 'vitest';
import {emptyProgress,saveDeckDraft,saveNamedDeck,selectNamedDeck,saveProgress,loadProgress,PROGRESS_KEY} from './progress';
afterEach(()=>vi.unstubAllGlobals());
describe('named decks',()=>{
  it('keeps presets independent from the working deck and restores cards and power',()=>{
    const original=emptyProgress();const saved=saveNamedDeck(original,'Nature');const id=saved.savedDecks[0].id;
    const changed=saveDeckDraft(saved,[],0);expect(changed.savedDecks[0].cards).toEqual(original.playerDeck);
    const restored=selectNamedDeck(changed,id);expect(restored.playerDeck).toEqual(original.playerDeck);
    expect(restored.hotseatDeck).toEqual(original.hotseatDeck);expect(restored.selectedDecks[0]).toBe(id);
    expect(restored.playerDeck).not.toBe(restored.savedDecks[0].cards);
    const detached=selectNamedDeck(restored,'');expect(detached.selectedDecks[0]).toBe(null);expect(detached.playerDeck).toEqual(restored.playerDeck);
  });
  it('stores incomplete drafts and updates an existing name without duplicate presets',()=>{
    const p=emptyProgress();const saved=saveNamedDeck(saveDeckDraft(p,p.playerDeck.slice(0,5)),'Starter experiment');
    const changed=saveNamedDeck(saveDeckDraft(saved,[]),'starter experiment');
    expect(changed.savedDecks).toHaveLength(1);expect(changed.savedDecks[0].cards).toEqual([]);
    expect(selectNamedDeck(changed,changed.savedDecks[0].id).playerDeck).toEqual([]);
  });
  it('persists presets while old progress keeps its collection and active deck',()=>{
    const values=new Map<string,string>();vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
    const p=saveNamedDeck(emptyProgress(),'My deck');saveProgress(p);expect(loadProgress().savedDecks).toEqual(p.savedDecks);
    const {savedDecks,selectedDecks,...legacy}=p;values.set(PROGRESS_KEY,JSON.stringify(legacy));
    const loaded=loadProgress();expect(loaded.playerDeck).toEqual(p.playerDeck);expect(loaded.unlockedIds).toEqual(p.unlockedIds);expect(loaded.savedDecks).toEqual([]);
  });
});
