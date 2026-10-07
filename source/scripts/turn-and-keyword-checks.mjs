import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

export async function checkTurnAndKeywords(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await mkdir('../.preview/turn-and-keywords',{recursive:true});
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('.title-screen').waitFor();
  const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')));
  assert.equal(p.unlockedIds.length,45);assert.equal(p.selectedHeroPower,'core_heal');assert.equal(p.playerDeck.length,30);
  await page.locator('.deck-trigger').click();await page.locator('.gallery-search').fill('Poopybutthole');await page.locator('.gallery-card-name').first().click();
  await page.locator('.gallery-detail-panel .cf-kw').filter({hasText:/^Reborn$/}).click();
  await page.locator('.cf-kw-pop').waitFor();
  assert((await page.locator('.cf-kw-pop').textContent()).includes('1 HP'));
  assert(await page.locator('.cf-kw-pop').evaluate(el=>{const old=el.style.pointerEvents;el.style.pointerEvents='auto';const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.cf-kw-pop')===el;el.style.pointerEvents=old;return top;}),'Reborn explanation is hidden behind its profile');
  await page.screenshot({path:'../.preview/turn-and-keywords/reborn.png'});
  await page.getByLabel('Close Star Chart').click();await page.locator('.gallery-search').fill('Indiana Jones');await page.locator('.gallery-card-name').first().click();
  await page.locator('.gallery-detail-panel .cf-kw').filter({hasText:/^Relics$/}).click();assert((await page.locator('.cf-kw-pop').textContent()).includes('equipment card'));
  await page.getByLabel('Close Star Chart').click();await page.locator('.gallery-search').fill('');
  while(await page.locator('.gallery-deck-remove').count()){
   const row=page.locator('.gallery-deck-row').last();await row.scrollIntoViewIfNeeded();await row.hover();await row.locator('.gallery-deck-remove').click();
  }
  assert.equal(await page.locator('.equipped-relic-peek').count(),0,'The final removed deck card left its portrait open');
  await page.close();
  for(const [remaining,turns] of [[100000,11],[100000,13],[100000,14],[9500,12],[2700,15]]){
   const duel=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
   try{
    await duel.goto(base);await duel.evaluate(async({remaining,turns})=>{
     localStorage.clear();const {emptyProgress,saveProgress}=await import('/src/progress.ts');const {createCampaignDuel}=await import('/src/campaign-duel.ts');const {cards,relics}=await import('/src/data/cards.ts');const {applyAction,makeCardLibrary}=await import('/src/engine/game.ts');const {saveGame}=await import('/src/storage.ts');
     const p={...emptyProgress(),storyIntroduced:true};saveProgress(p);const initial=createCampaignDuel({chapter:1,playerDeck:p.playerDeck,unlockedCardIds:p.unlockedIds,cards,relics,heroPower:p.selectedHeroPower,seed:'clock-fixture'});
     const {state}=applyAction(initial.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));state.players[0].turnsStarted=turns;state.players[0].hand=['c159'];state.players[0].mana=10;
     saveGame(state,[],{kind:'campaign',chapter:1,skill:'easy',duelId:'clock-fixture'},1,{key:`clock-fixture:0:${turns}`,remainingMs:remaining,deadline:null});
    },{remaining,turns});
    await duel.reload();await duel.locator('.continue-duel').click();await duel.locator('.hand-card').first().waitFor();
    if(remaining===100000){assert.equal(await duel.getByRole('timer').count(),0);if(turns===11)assert.equal(await duel.locator('.protocol-speech').count(),0);else assert((await duel.locator('.protocol-speech').textContent()).includes(`${16-turns} turns`));}
    else{
     await duel.getByRole('timer').waitFor();assert((await duel.locator('.protocol-speech').textContent()).includes(`${16-turns} turn`));
     await duel.screenshot({path:`../.preview/turn-and-keywords/clock-${turns}.png`});
     if(remaining===9500){
      const deadline=await duel.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).turnClock.deadline);
      const rng=await duel.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).game.rngSeed);
      await duel.locator('.hand-card').click();await duel.locator('[data-slot="0-0"]').click();await duel.locator('.card-choice-prompt').waitFor();
      // Saves are coalesced into idle time (up to 200 ms), so wait for this one to land.
      await duel.waitForFunction(rng=>JSON.parse(localStorage.getItem('convergence.save.v32')).game.rngSeed!==rng,rng,{timeout:3000}).catch(()=>{});
      assert.notEqual(await duel.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).game.rngSeed),rng,'The test did not exercise a random effect');
      assert.equal(await duel.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).turnClock.deadline),deadline,'A random card play reset the human deadline');
     }
     if(remaining<3000){await duel.locator('.turn-countdown.is-critical').waitFor();await duel.waitForFunction(()=>window.__debug.state().activePlayer===1||window.__debug.state().phase==='gameOver',{},{timeout:6000});}
    }
   }finally{await duel.close();}
  }
  await checkImpactReplay(browser,base);
  assert.deepEqual(errors,[]);console.log('PASS starting collection, Reborn and Relic explanations, final deck removal, hidden clock, urgent countdown, timeout and GLaDOS speech');
 }finally{if(!page.isClosed())await page.close();}
}

export async function checkImpactReplay(browser,base){
  const motion=await browser.newPage({viewport:{width:1440,height:900}});
  try{
   await motion.goto(base);await motion.evaluate(async()=>{
    localStorage.clear();const {emptyProgress,saveProgress}=await import('/src/progress.ts');const {createCampaignDuel}=await import('/src/campaign-duel.ts');const {cards,relics}=await import('/src/data/cards.ts');const {applyAction,makeCardLibrary}=await import('/src/engine/game.ts');const {spawnTestMinion}=await import('/src/engine/test-utils.ts');const {saveGame}=await import('/src/storage.ts');
    const p={...emptyProgress(),storyIntroduced:true};saveProgress(p);const initial=createCampaignDuel({chapter:2,playerDeck:p.playerDeck,unlockedCardIds:p.unlockedIds,cards,relics,heroPower:p.selectedHeroPower,seed:'impact-replay'});
    const {state}=applyAction(initial.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));state.players[0].hand=[];
    state.players[0].board=[spawnTestMinion(cards.find(c=>c.name==='Flash'),0),null,null,null];
    state.players[1].board=[spawnTestMinion(cards.find(c=>c.name==='Modern Tank'),1,{hp:50,maxHp:50,atk:0}),null,null,null];
    saveGame(state,[],{kind:'campaign',chapter:2,skill:'easy',duelId:'impact-replay'},1);
   });
   await motion.reload();await motion.locator('.continue-duel').click();await motion.locator('[data-slot="0-0"].ready').waitFor();
   await motion.evaluate(()=>{window.__strikeCard=document.querySelector('[data-slot="0-0"] .card-face');window.__hitCard=document.querySelector('[data-slot="1-0"] .card-face');});
   for(let attack=0;attack<2;attack++){
    await motion.locator('[data-slot="0-0"]').click();await motion.locator('[data-slot="1-0"]').click();
    assert(await motion.evaluate(()=>window.__strikeCard===document.querySelector('[data-slot="0-0"] .card-face')&&window.__hitCard===document.querySelector('[data-slot="1-0"] .card-face')),'Repeated attacks remounted card artwork');
    assert(await motion.locator('[data-slot="1-0"] .jolt-wrap').evaluate(el=>el.getAnimations().some(a=>a.playState==='running')),'Repeated damage did not replay its motion');
    await motion.waitForTimeout(550);
   }
   assert.equal(await motion.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).game.players[1].board[0].hp),42);
  }finally{await motion.close();}
 console.log('PASS consecutive attacks preserve decoded cards and replay impact motion');
}
