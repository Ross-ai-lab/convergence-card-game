import {describe,it,expect} from 'vitest';
import {emptyProgress,finishDuel,unlockAllProgress} from './progress';
import {isLoreChapterUnlocked,LORE_CHAPTER_ONE} from './lore-chapters';

describe('first comic chapter',()=>{
  it('opens after any first campaign victory and keeps the other chapters sealed',()=>{
    for(let chapter=1;chapter<=20;chapter++) {
      const won=finishDuel(emptyProgress(),{winner:0,viewerId:0,turns:10,at:1,mode:{kind:'campaign',chapter,skill:'easy',duelId:`lore-${chapter}`}},{seen:[],played:[]});
      expect(isLoreChapterUnlocked(1,won.completedBosses)).toBe(true);
      for(let locked=2;locked<=10;locked++)expect(isLoreChapterUnlocked(locked,won.completedBosses)).toBe(false);
    }
    expect(LORE_CHAPTER_ONE.panels).toHaveLength(6);
  });
  it('does not open for losses, draws, local duels, or card-unlock cheats',()=>{
    for(const winner of [1,'draw'] as const) {
      const result=finishDuel(emptyProgress(),{winner,viewerId:0,turns:10,at:1,mode:{kind:'campaign',chapter:20,skill:'hard',duelId:`not-a-clear-${winner}`}},{seen:[],played:[]});
      expect(isLoreChapterUnlocked(1,result.completedBosses)).toBe(false);
    }
    const local=finishDuel(emptyProgress(),{winner:0,viewerId:0,turns:10,at:1,mode:{kind:'hotseat',duelId:'local-lore'}},{seen:[],played:[]});
    expect(isLoreChapterUnlocked(1,local.completedBosses)).toBe(false);
    expect(isLoreChapterUnlocked(1,unlockAllProgress(emptyProgress()).completedBosses)).toBe(false);
  });
});
