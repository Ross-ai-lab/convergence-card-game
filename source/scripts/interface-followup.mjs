import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {manualRotationBrowser,resizePhone} from './phone-fixtures.mjs';
import {playTutorial} from './tutorial-flow.mjs';

export async function seedMainDuel(page,base) {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    localStorage.clear();
    const {emptyProgress,saveProgress}=await import('/src/progress.ts');
    const {createCampaignDuel}=await import('/src/campaign-duel.ts');
    const {cards,relics}=await import('/src/data/cards.ts');
    const {makeCardLibrary,applyAction}=await import('/src/engine/game.ts');
    const {saveGame}=await import('/src/storage.ts');
    const progress={...emptyProgress(),storyIntroduced:true};saveProgress(progress);
    const initial=createCampaignDuel({chapter:2,playerDeck:progress.playerDeck,unlockedCardIds:progress.unlockedIds,cards,relics,seed:'discover-fit'});
    const {state}=applyAction(initial.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));
    state.players[0].hand=['c159','c005','c001','r035'];state.players[0].mana=10;state.players[0].maxMana=10;
    saveGame(state,[],{kind:'campaign',chapter:2,skill:'easy',duelId:'discover-fit'},1);
  });
  await page.reload();await page.locator('.continue-duel').click();
  await page.waitForFunction(()=>window.__debug.state().phase==='main');
}

async function fits(page,selector) {
  const boxes=await page.locator(selector).evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{w:r.width,h:r.height,top:r.top,left:r.left,bottom:r.bottom,right:r.right,vw:innerWidth,vh:innerHeight};}));
  assert(boxes.length>0&&boxes.every(r=>r.w>0&&r.h>0&&r.top>=-1&&r.left>=-1&&r.bottom<=r.vh+1&&r.right<=r.vw+1),`${selector} clipped: ${JSON.stringify(boxes)}`);
}

export async function checkDiscoverAndPhoneSpace(browser,base) {
  await mkdir('../.preview/followup',{recursive:true});
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  await manualRotationBrowser(context);
  const page=await context.newPage();
  const requested=[];page.on('request',request=>requested.push(request.url()));
  try {
    await seedMainDuel(page,base);
    await page.evaluate(()=>window.__debug.setCore('them',10));await page.waitForTimeout(900);
    assert(!requested.some(url=>url.includes('/announcer/core_low_them.ogg')),'Removed enemy-low-health line still plays');
    await page.evaluate(()=>window.__debug.setCore('them',50));
    await page.evaluate(()=>{['Batman','UFO','Musashi','John Wick'].forEach((name,slot)=>window.__debug.place(name,'them',slot));});
    const sizes=await page.evaluate(()=>({board:document.querySelector('.board-slot').getBoundingClientRect().height,hand:document.querySelector('.hand-card').getBoundingClientRect().width,fieldTop:document.querySelector('.battlefield').getBoundingClientRect().top}));
    assert(sizes.board>=150&&sizes.hand>=100&&sizes.fieldTop<=57,`Reclaimed space was not used: ${JSON.stringify(sizes)}`);
    await fits(page,'.board-slot');await fits(page,'.hand-card');
    await page.getByRole('button',{name:'Duel menu',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Duel menu',exact:true}).getAttribute('aria-expanded'),'true','Larger hand blocks the menu');
    await page.getByRole('button',{name:'Duel menu',exact:true}).click();
    await page.screenshot({path:'../.preview/followup/larger-phone-table.png'});
    await page.locator('.hand-card').filter({hasText:'Indiana Jones'}).click();await page.locator('[data-slot="0-0"]').click();
    await page.locator('.card-choice-prompt').waitFor();
    await page.locator('.mythic-splash').waitFor({state:'detached',timeout:5000});
    for(const [width,height] of [[1440,900],[844,390],[667,375],[568,320]]) {
      await page.setViewportSize({width,height});
      console.log(`Checking Discover ${width}x${height}`);
      await page.screenshot({path:`../.preview/followup/discover-${width}x${height}.png`});
      await fits(page,'.card-choice-prompt');await fits(page,'.prompt-card-choice');await fits(page,'.prompt-card-choice .cf-desc');await fits(page,'.card-choice-prompt .prompt-cancel');
      assert.equal(await page.locator('.prompt-card-choice').count(),3);
      assert(await page.locator('.card-choice-prompt').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Discover requires scrolling');
      await page.screenshot({path:`../.preview/followup/discover-${width}x${height}.png`});
    }
    await page.locator('.prompt-card-choice').first().click();
    await page.waitForFunction(()=>window.__debug.state().phase==='main');
    console.log('PASS real Indiana Jones Discover: three full cards and cancel fit without scrolling; larger phone board and hand.');
  } finally {await context.close();}
}

export async function checkFirstComic(page,base) {
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
  assert(!await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/lore/the-empty-chair.webp'))),'Comic art loads before the reader opens');
  await page.getByRole('button',{name:'Lore',exact:true}).click();assert.equal(await page.locator('.lore-chapter:disabled').count(),10);await page.getByLabel('Close Lore').click();
  await page.evaluate(async()=>{
    const {emptyProgress,finishDuel,acknowledgeRewards,acknowledgeBossSpeech,saveProgress}=await import('/src/progress.ts');
    const progress=finishDuel(emptyProgress(),{winner:0,viewerId:0,turns:12,at:1,mode:{kind:'campaign',chapter:20,skill:'hard',duelId:'first-comic-last-boss'}},{seen:[],played:[]});
    saveProgress({...acknowledgeBossSpeech(acknowledgeRewards(progress)),storyIntroduced:true});
  });
  await page.reload();await page.getByRole('button',{name:'Lore',exact:true}).click();
  assert.equal(await page.locator('.lore-chapter:disabled').count(),9);
  await page.getByLabel('Close Lore').click();
  for(const [width,height] of [[1536,679],[390,550],[844,390],[568,320]]) {
    await page.setViewportSize({width,height});
    await fits(page,'.duel-trigger,.deck-trigger,.tutorial-trigger,.hotseat-trigger');
    await page.screenshot({path:`../.preview/followup/title-${width}x${height}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Lore',exact:true}).click();
  await page.getByRole('button',{name:'Lore chapter 1, The Empty Chair',exact:true}).click();
  await page.locator('.comic-frame.is-loaded').first().waitFor();
  for(const [width,height] of [[1440,900],[390,550],[844,390],[568,320]]) {
    await page.setViewportSize({width,height});
    for(let guard=0;guard<6;guard++) {
      await fits(page,'.comic-reader');await fits(page,'.comic-frame');await fits(page,'.comic-caption,.comic-dialogue');
      assert(await page.locator('.comic-reader').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Comic requires scrolling');
      if(await page.getByRole('button',{name:'Finish chapter',exact:true}).count())break;
      await page.getByLabel('Next comic page').click();
    }
    await page.screenshot({path:`../.preview/followup/comic-${width}x${height}.png`});
    await page.getByLabel('Back to Lore').click();await page.getByRole('button',{name:'Lore chapter 1, The Empty Chair',exact:true}).click();
  }
  await page.getByLabel('Close comic').click();
  await page.setViewportSize({width:1440,height:900});
  console.log('PASS comic: any first boss (including chapter 20) unlocks only chapter I; every panel and control fits.');
}

export async function checkTouchTutorialEntry(browser,base) {
  const context=await browser.newContext({viewport:{width:390,height:550},isMobile:true,hasTouch:true});
  await manualRotationBrowser(context);
  const page=await context.newPage();
  try {
    await page.goto(base);await page.getByRole('button',{name:'Tutorial',exact:true}).tap();
    await page.getByRole('dialog',{name:'Landscape mode required',exact:true}).waitFor();
    await resizePhone(page,844,390,browser.browserType().name()==='webkit');
    await page.getByRole('dialog',{name:'Landscape mode required',exact:true}).waitFor({state:'detached'});
    await playTutorial(page);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).completedChapters),0);
    console.log('PASS phone Tutorial: portrait entry, rotation, every lesson, automatic return, and no real victory.');
  } finally {await context.close();}
}
