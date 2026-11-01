import {describe,it,expect} from 'vitest';
import {emptyProgress,finishDuel,unlockAllProgress} from './progress';
import {isLoreChapterUnlocked,LORE_CHAPTER_ONE,LORE_CHAPTERS,LORE_CHAPTER_VICTORIES} from './lore-chapters';

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

  it('opens later chapters as more champions fall, and the finale only after all twenty',()=>{
    expect(LORE_CHAPTERS.map(chapter=>chapter.number)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    for(const chapter of LORE_CHAPTERS)expect(chapter.panels,chapter.title).toHaveLength(6);
    let progress=emptyProgress();
    for(let boss=1;boss<=20;boss++){
      progress=finishDuel(progress,{winner:0,viewerId:0,turns:10,at:boss,mode:{kind:'campaign',chapter:boss,skill:'easy',duelId:`lore-run-${boss}`}},{seen:[],played:[]});
      const open=LORE_CHAPTERS.filter(chapter=>isLoreChapterUnlocked(chapter.number,progress.completedBosses)).length;
      expect(open,`after ${boss} victories`).toBe(LORE_CHAPTER_VICTORIES.filter(needed=>needed<=boss).length);
    }
    expect(isLoreChapterUnlocked(10,progress.completedBosses)).toBe(true);
    const repeat=finishDuel(emptyProgress(),{winner:0,viewerId:0,turns:10,at:1,mode:{kind:'campaign',chapter:3,skill:'easy',duelId:'repeat-a'}},{seen:[],played:[]});
    const again=finishDuel(repeat,{winner:0,viewerId:0,turns:10,at:2,mode:{kind:'campaign',chapter:3,skill:'easy',duelId:'repeat-b'}},{seen:[],played:[]});
    expect(isLoreChapterUnlocked(2,again.completedBosses)).toBe(false);
  });
});
