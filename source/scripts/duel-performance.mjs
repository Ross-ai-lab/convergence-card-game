import {mkdir,writeFile} from 'node:fs/promises';

/** Measure the real renderer while legal card plays resolve and their effects animate. */
export async function measureDuelPerformance(browser,base,label='current',seedBase=base,{saveVersion=32,assertStableCards=true}={}) {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  try {
    await page.goto(seedBase);
    await page.evaluate(async()=>{
      localStorage.clear();
      const {emptyProgress,saveProgress}=await import('/src/progress.ts');
      const {createCampaignDuel}=await import('/src/campaign-duel.ts');
      const {cards,relics}=await import('/src/data/cards.ts');
      const {makeCardLibrary,applyAction}=await import('/src/engine/game.ts');
      const {spawnTestMinion}=await import('/src/engine/test-utils.ts');
      const {saveGame}=await import('/src/storage.ts');
      const p={...emptyProgress(),storyIntroduced:true};saveProgress(p);
      const initial=createCampaignDuel({chapter:1,playerDeck:p.playerDeck,unlockedCardIds:p.unlockedIds,cards,relics,seed:'frame-probe'});
      const {state}=applyAction(initial.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));
      state.players[0].hand=['John Wick','Giant Tree','Ainz Ooal Gown','Meteor'].map(name=>cards.find(c=>c.name===name).id);
      state.players[0].mana=100;state.players[0].maxMana=10;
      state.players[1].board=['Modern Tank','John Wick','Sonic','UFO'].map(name=>spawnTestMinion(cards.find(c=>c.name===name),1,{hp:10,maxHp:10,sleeping:false}));
      saveGame(state,[],{kind:'campaign',chapter:1,skill:'easy',duelId:'frame-probe'},1);
    });
    if(seedBase!==base){const stored=await page.evaluate(()=>Object.entries(localStorage));await page.addInitScript(({entries,version})=>{for(let [key,value] of entries){if(/^convergence.save.v\d+$/.test(key)){key=`convergence.save.v${version}`;value=JSON.stringify({...JSON.parse(value),version});}localStorage.setItem(key,value);}}, {entries:stored,version:saveVersion});await page.goto(base);}else await page.reload();
    await page.locator('.continue-duel').click();await page.locator('.hand-card').first().waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
    const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
    await session.send('Profiler.enable');await session.send('Profiler.start');
    const before=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    await page.evaluate(()=>{
      window.__frames=[];window.__longTasks=[];let last=performance.now();window.__probeRunning=true;
      const frame=now=>{if(!window.__probeRunning)return;window.__frames.push(now-last);last=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
      window.__probeObserver=new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration)));window.__probeObserver.observe({type:'longtask'});
    });
    for(const [index,name] of ['John Wick','Giant Tree','Ainz Ooal Gown','Meteor'].entries()) {
      if(index===2)await page.evaluate(()=>window.__persistentCard=document.querySelector('[data-slot="1-0"] .card-face'));
      await page.locator('.hand-card').filter({hasText:name}).first().click();await page.locator(`[data-slot="0-${index}"]`).click();await page.waitForTimeout(700);
      if(assertStableCards&&index===2&&!await page.evaluate(()=>window.__persistentCard===document.querySelector('[data-slot="1-0"] .card-face')))throw new Error('Damage restarted the card face instead of its motion wrapper');
      if(assertStableCards&&await page.locator('.mythic-splash').count())throw new Error('Removed Mythic overlay still mounts');
    }
    await page.waitForTimeout(1100);
    const measurements=await page.evaluate(()=>{window.__probeRunning=false;window.__probeObserver.disconnect();const frames=window.__frames.filter(n=>n>0).sort((a,b)=>a-b);return{frames:frames.length,medianFrameMs:frames[Math.floor(frames.length*.5)],p95FrameMs:frames[Math.floor(frames.length*.95)],worstFrameMs:frames.at(-1),longTasks:window.__longTasks,longTaskMs:window.__longTasks.reduce((a,b)=>a+b,0),runningAnimations:document.getAnimations().filter(a=>a.playState==='running').length};});
    const after=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    const {profile}=await session.send('Profiler.stop');
    const counts=new Map();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
    measurements.hotFunctions=profile.nodes.map(node=>({name:node.callFrame.functionName,url:node.callFrame.url,samples:counts.get(node.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,15);
    for(const key of ['TaskDuration','LayoutDuration','RecalcStyleDuration'])measurements[key+'Ms']=Math.round((after[key]-before[key])*1000);
    await mkdir('../.preview/duel-performance',{recursive:true});
    await writeFile(`../.preview/duel-performance/${label}.json`,JSON.stringify(measurements,null,2));
    console.log(JSON.stringify({label,...measurements}));
    return measurements;
  } finally {await page.close();}
}
