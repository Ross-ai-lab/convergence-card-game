import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CAMPAIGN_CHAPTERS,CAMPAIGN_PREMISE,CAMPAIGN_PROTAGONIST} from './campaign';
import {emptyProgress,finishDuel,acknowledgeBossSpeech,acknowledgeRewards,loadProgress,saveProgress,PROGRESS_KEY} from './progress';

describe('Rick Gramps campaign story',()=>{
  beforeEach(()=>{
    const values=new Map<string,string>();
    vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  });
  afterEach(()=>vi.unstubAllGlobals());
  it('supplies three distinct speeches for each of the twenty bosses',()=>{
    expect(CAMPAIGN_PROTAGONIST).toBe('Rick Gramps');
    expect(CAMPAIGN_PREMISE).toContain('greatest fighters');
    expect(CAMPAIGN_CHAPTERS).toHaveLength(20);
    const lines=CAMPAIGN_CHAPTERS.flatMap(c=>[c.story.entrance,c.story.defeat,c.story.play]);
    expect(new Set(lines).size).toBe(60);
    expect(lines.every(line=>line.length>30)).toBe(true);
  });
  it('preserves old saves and defaults the new story fields safely',()=>{
    const old={...emptyProgress()} as Partial<ReturnType<typeof emptyProgress>>;
    delete old.storyIntroduced;delete old.pendingBossSpeech;
    window.localStorage.setItem(PROGRESS_KEY,JSON.stringify(old));
    const restored=loadProgress();
    expect(restored.playerDeck).toEqual(old.playerDeck);
    expect(restored.storyIntroduced).toBe(false);
    expect(restored.pendingBossSpeech).toBeNull();
  });
  it('persists defeat dialogue and rewards together without paying twice',()=>{
    const mode={kind:'campaign' as const,chapter:1,skill:'easy' as const,duelId:'story-win'};
    const input={winner:0 as const,viewerId:0 as const,mode,turns:15,at:1};
    const won=finishDuel(emptyProgress(),input,{seen:[],played:[]});
    expect(won.pendingBossSpeech).toBe(1);expect(won.pendingRewards).toHaveLength(9);
    expect(saveProgress(won)).toBe(true);
    expect(loadProgress().pendingBossSpeech).toBe(1);
    const acknowledged=acknowledgeBossSpeech(loadProgress());
    expect(acknowledged.pendingRewards).toHaveLength(9);
    expect(finishDuel(acknowledged,input,{seen:[],played:[]})).toBe(acknowledged);
    const replay=finishDuel(acknowledgeRewards(acknowledged),{...input,mode:{...mode,duelId:'story-replay'}},{seen:[],played:[]});
    expect(replay.pendingBossSpeech).toBe(1);expect(replay.pendingRewards).toEqual([]);
    const loss=finishDuel(acknowledgeBossSpeech(replay),{...input,winner:1,mode:{...mode,duelId:'story-loss'}},{seen:[],played:[]});
    expect(loss.pendingBossSpeech).toBeNull();
  });
  it('rejects a pending speech for an undefeated future boss',()=>{
    saveProgress({...emptyProgress(),pendingBossSpeech:20});
    expect(loadProgress().pendingBossSpeech).toBeNull();
  });
});
