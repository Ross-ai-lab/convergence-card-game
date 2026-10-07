import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const OUTPUT=new URL('../../.preview/duel-performance/',import.meta.url);

/** Measure the real renderer while legal card plays resolve and their effects animate. */
export async function measureDuelPerformance(browser,base,label='current',seedBase=base,{saveVersion=32,assertStableCards=true,diagnosticStyle="",cpuRate=1,directInput=false,keyboardInput=false,trace=false,scenario='plays',viewport={width:1440,height:900}}={}) {
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await mkdir(OUTPUT,{recursive:true});
    await page.goto(seedBase);
    await page.evaluate(async(scenario)=>{
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
      if(scenario==='triggers') {
        state.players[0].hand=[];
        state.players[0].board=['Godzilla','Mr. Poopybutthole','Superman','John Wick'].map(name=>spawnTestMinion(cards.find(c=>c.name===name),0,{sleeping:false}));
        state.players[1].board=['Godzilla','Mr. Poopybutthole','Star Destroyer','Carnage Kabuto'].map(name=>spawnTestMinion(cards.find(c=>c.name===name),1,{sleeping:false}));
        state.players[1].hand=[];state.players[1].mana=10;state.players[1].maxMana=10;
      }
      saveGame(state,[],{kind:'campaign',chapter:1,skill:scenario==='triggers'?'hard':'easy',duelId:'frame-probe'},1);
    },scenario);
    if(seedBase!==base){const stored=await page.evaluate(()=>Object.entries(localStorage));await page.addInitScript(({entries,version})=>{for(let [key,value] of entries){if(/^convergence.save.v\d+$/.test(key)){key=`convergence.save.v${version}`;value=JSON.stringify({...JSON.parse(value),version}).replaceAll('"/card-art/','"./card-art/');}localStorage.setItem(key,value);}}, {entries:stored,version:saveVersion});await page.goto(base);}else await page.reload();
    await page.locator('.continue-duel').click();await page.locator('.battlefield').waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
    if(!await page.locator('.cf-art img').evaluateAll(images=>images.length>0&&images.every(img=>img.naturalWidth>0)))throw new Error('A benchmark card did not decode its real artwork');
    const session=await page.context().newCDPSession(page);await session.send('Performance.enable');if(cpuRate!==1)await session.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});if(diagnosticStyle)await page.addStyleTag({content:diagnosticStyle});
    const layers=new Map();if(trace){await session.send('LayerTree.enable');session.on('LayerTree.layerTreeDidChange',event=>{for(const layer of event.layers??[])layers.set(layer.layerId,layer);});}
    if(trace)await session.send('Tracing.start',{categories:'devtools.timeline,blink,cc',transferMode:'ReturnAsStream'});
    await session.send('Profiler.enable');await session.send('Profiler.start');
    const before=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    await page.evaluate(()=>{
      window.__frames=[];window.__longTasks=[];let last=performance.now();window.__probeRunning=true;
      const frame=now=>{if(!window.__probeRunning)return;window.__frames.push(now-last);last=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
      window.__probeObserver=new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration)));window.__probeObserver.observe({type:'longtask'});
    });
    if(scenario==='plays')for(const [index,name] of ['John Wick','Giant Tree','Ainz Ooal Gown','Meteor'].entries()) {
      if(index===2)await page.evaluate(()=>window.__persistentCard=document.querySelector('[data-slot="1-0"] .card-face'));
      const hand=page.locator('.hand-card').filter({hasText:name}).first();const slot=page.locator(`[data-slot="0-${index}"]`);
      if(keyboardInput){await hand.press('Enter');await slot.press('Enter');}else if(directInput){await hand.evaluate(node=>node.click());await slot.evaluate(node=>node.click());}else{await hand.click();await slot.click();}
      await page.waitForTimeout(700);
      if(assertStableCards&&index===2&&!await page.evaluate(()=>window.__persistentCard===document.querySelector('[data-slot="1-0"] .card-face')))throw new Error('Damage restarted the card face instead of its motion wrapper');
      if(assertStableCards&&await page.locator('.mythic-splash').count())throw new Error('Removed Mythic overlay still mounts');
    }
    if(scenario==='triggers') {
      await page.locator('[data-slot="0-1"]').evaluate(node=>node.click());
      await page.locator('[data-slot="1-0"]').evaluate(node=>node.click());
      await page.waitForTimeout(900);
      if(!await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')??'null')?.events.some(event=>event.kind==='combat')))throw new Error('The trigger benchmark did not resolve a real attack');
      await page.locator('.end-turn').evaluate(node=>{if(!node.disabled)node.click();});
      await page.waitForTimeout(6500);
    } else await page.waitForTimeout(1100);
    if(errors.length)throw new Error(`Renderer failed: ${errors.join('; ')}`);
    const measurements=await page.evaluate(()=>{window.__probeRunning=false;window.__probeObserver.disconnect();const frames=window.__frames.filter(n=>n>0).sort((a,b)=>a-b);return{frames:frames.length,medianFrameMs:frames[Math.floor(frames.length*.5)],p95FrameMs:frames[Math.floor(frames.length*.95)],worstFrameMs:frames.at(-1),longTasks:window.__longTasks,longTaskMs:window.__longTasks.reduce((a,b)=>a+b,0),runningAnimations:document.getAnimations().filter(a=>a.playState==='running').length,animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName,target:a.effect?.target?.className,properties:[...new Set(a.effect?.getKeyframes().flatMap(k=>Object.keys(k).filter(p=>!['offset','computedOffset','easing','composite'].includes(p))))??[]]}))};});
    measurements.finalPosition=await page.evaluate(()=>{
      const save=JSON.parse(localStorage.getItem('convergence.save.v32')??'null');
      return save?{phase:save.game.phase,activePlayer:save.game.activePlayer,boards:save.game.players.map(player=>player.board.map(body=>body?{name:body.name,atk:body.atk,hp:body.hp}:null)),events:save.events.map(event=>event.text)}:null;
    });
    const after=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    const {profile}=await session.send('Profiler.stop');
    if(trace){const done=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));await session.send('Tracing.end');const {stream}=await done;let output='';while(true){const chunk=await session.send('IO.read',{handle:stream});output+=chunk.data;if(chunk.eof)break;}await session.send('IO.close',{handle:stream});await writeFile(new URL(`${label}.trace.json`,OUTPUT),output);const nodes=await session.send('DOM.getDocument',{depth:-1});await writeFile(new URL(`${label}.layers.json`,OUTPUT),JSON.stringify({layers:[...layers.values()],nodes}));}
    const counts=new Map();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
    measurements.hotFunctions=profile.nodes.map(node=>({name:node.callFrame.functionName,url:node.callFrame.url,samples:counts.get(node.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,15);
    for(const key of ['TaskDuration','LayoutDuration','RecalcStyleDuration'])measurements[key+'Ms']=Math.round((after[key]-before[key])*1000);
    await mkdir(OUTPUT,{recursive:true});
    measurements.scenario=scenario;measurements.cpuRate=cpuRate;measurements.viewport=viewport;
    await writeFile(new URL(`${label}.cpuprofile`,OUTPUT),JSON.stringify(profile));
    await writeFile(new URL(`${label}.json`,OUTPUT),JSON.stringify(measurements,null,2));
    console.log(JSON.stringify({label,scenario,cpuRate,frames:measurements.frames,p95FrameMs:measurements.p95FrameMs,worstFrameMs:measurements.worstFrameMs,longTaskMs:measurements.longTaskMs,TaskDurationMs:measurements.TaskDurationMs}));
    return measurements;
  } finally {await page.close();}
}

// The same performance front door can compare two production builds in a
// sequence of isolated contexts. No production browser storage is touched.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const option=(name,fallback)=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
  const base=args.find(arg=>arg.startsWith('http'))??'http://127.0.0.1:5177';
  const baseline=option('baseline',null),seed=option('seed',base);
  const runs=Number(option('runs','3')),cpuRate=Number(option('cpu-rate','1'));
  const label=option('label','comparison'),scenario=option('scenario','plays');
  if(!Number.isInteger(runs)||runs<1||!Number.isFinite(cpuRate)||cpuRate<1||!/^[a-zA-Z0-9_.-]+$/.test(label)||!['plays','triggers'].includes(scenario))throw new Error('Invalid performance comparison options');
  // --gpu uses the machine's real graphics device. Headless Chromium otherwise
  // composites in software, which hides layer, blend and blur costs entirely.
  const gpu=args.includes('--gpu')?['--enable-gpu','--ignore-gpu-blocklist','--enable-gpu-rasterization',...(process.platform==='win32'?['--use-angle=d3d11']:[])]:[];
  const {launch}=await import('./browser.mjs');const browser=await launch(gpu);const results=[];
  try {
    for(let run=1;run<=runs;run++) {
      // Alternate ordering so warm-up or machine load does not always favour one side.
      const builds=baseline?[[baseline,'before'],[base,'after']]:[[base,'current']];
      if(run%2===0)builds.reverse();
      for(const [url,version] of builds)results.push({version,run,...await measureDuelPerformance(browser,url,`${label}-${version}-${run}`,seed,{directInput:true,cpuRate,scenario})});
    }
    await writeFile(new URL(`${label}-summary.json`,OUTPUT),JSON.stringify({base,baseline,seed,scenario,cpuRate,results},null,2));
  } finally {await browser.close();}
}
