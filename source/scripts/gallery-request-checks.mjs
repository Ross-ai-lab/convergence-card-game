import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

export async function checkGalleryRequest(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await mkdir('../.preview/gallery-request',{recursive:true});await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('.title-screen').waitFor();await page.locator('.deck-trigger').click();
  const deck=await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).playerDeck);
  await page.getByLabel('Filter by unlocked or locked').selectOption('locked');
  await page.locator('.gallery-cell.is-locked .cf-desc').first().waitFor();
  assert(await page.locator('.gallery-cell.is-locked .cf-desc').count()>0,'Locked cards lost their descriptions');
  await page.getByRole('button',{name:'Unlock requirements for Allspark Cube',exact:true}).click();
  const expected=await page.evaluate(async()=>{const {CAMPAIGN_CHAPTERS}=await import('/src/campaign.ts');const {cards,relics}=await import('/src/data/cards.ts');const id=relics.find(r=>r.name==='Allspark Cube').id;const chapter=CAMPAIGN_CHAPTERS.find(c=>c.rewardCardIds.includes(id));return cards.find(c=>c.id===chapter.bossId).name;});
  assert((await page.getByRole('dialog',{name:'Unlock Allspark Cube',exact:true}).textContent()).includes(expected));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).playerDeck),deck);
  await page.screenshot({path:'../.preview/gallery-request/locked-cards.png'});await page.getByLabel('Close unlock requirements').click();
  await page.getByLabel('Filter by unlocked or locked').selectOption('unlocked');await page.getByLabel('Search the gallery').fill('John Wick');
  await page.locator('.gallery-cell .cf-kw').filter({hasText:/^Passive$/}).click();assert(await page.locator('.cf-kw-pop').isVisible());
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).playerDeck),deck,'A keyword click edited the deck');
  await page.screenshot({path:'../.preview/gallery-request/gallery-keyword.png'});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(async()=>{const p=await import('/src/progress.ts');p.saveProgress({...p.unlockAllProgress(p.emptyProgress()),storyIntroduced:true});});await page.reload();await page.locator('.deck-trigger').click();
  for(const [name,word,token] of [['Star Destroyer','TIE Fighters','TIE Fighter'],['Naruto','Shadow Clones','Shadow Clone'],['Silver Surfer','Galactus','Galactus'],['Ultron Prime','Vision','Vision'],['Avatar Aang','Awakened','Awakened'],['Morgott, the Omen King','Margit','Margit the Fell Omen'],['Xenomorph Queen','Larva','Larva'],['Seven Deadly Sins','Sin','Sin'],['Dragon Balls','Shenron','Shenron']]){
   await page.getByLabel('Search the gallery').fill(name);await page.getByRole('button',{name:`Open Star Chart for ${name}`,exact:true}).click();
   await page.locator('.gallery-detail-panel .cf-kw').filter({hasText:new RegExp(`^${word}$`)}).click();const preview=page.getByRole('status',{name:`Token card: ${token}`,exact:true});await preview.waitFor();
   await page.waitForFunction(()=>{const r=document.querySelector('.equipped-relic-peek')?.getBoundingClientRect();return r&&r.width>=200&&r.height>280&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
   const box=await preview.boundingBox();assert(box.width>=200&&box.x>=0&&box.y>=0&&box.x+box.width<=1441&&box.y+box.height<=901,`${name} token preview is clipped or too small: ${JSON.stringify(box)}`);
   assert(await preview.locator('.cf-desc').count()===1);
   if(name==='Star Destroyer')await page.screenshot({path:'../.preview/gallery-request/tie-fighter.png'});
   await page.keyboard.press('Escape');await page.getByLabel('Close Star Chart').click();
  }
  await page.close();
  const audio=await browser.newPage({viewport:{width:1440,height:900}});
  try{
   await audio.goto(base);await audio.evaluate(async()=>{
    localStorage.clear();const {emptyProgress,saveProgress}=await import('/src/progress.ts');const {createCampaignDuel}=await import('/src/campaign-duel.ts');const {cards,relics}=await import('/src/data/cards.ts');const {applyAction,makeCardLibrary}=await import('/src/engine/game.ts');const {saveGame}=await import('/src/storage.ts');
    const p={...emptyProgress(),storyIntroduced:true};saveProgress(p);const start=createCampaignDuel({chapter:2,playerDeck:p.playerDeck,unlockedCardIds:p.unlockedIds,cards,relics,seed:'rarity-audio'});const {state}=applyAction(start.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));state.players[0].hand=['c001','c076','c020'];state.cheatMode=true;state.cheatPlayer=0;saveGame(state,[],{kind:'campaign',chapter:2,skill:'easy',duelId:'rarity-audio'},1,{key:'rarity-audio:0:1',remainingMs:14500,deadline:null});
   });await audio.reload();await audio.locator('.continue-duel').click();await audio.getByRole('timer').waitFor();
   const box=await audio.getByRole('timer').boundingBox();assert(box.x>1250&&box.y>200&&box.y<340&&box.width<150,'Countdown did not move or shrink');assert((await audio.getByRole('timer').textContent()).match(/1[345]s/),'Countdown does not appear at fifteen seconds');await audio.screenshot({path:'../.preview/gallery-request/countdown.png'});
   await audio.waitForTimeout(1800);
   for(const [slot,name] of ['John Wick','Godzilla','Superman'].entries()){
    const before=await audio.evaluate(()=>window.__sfx.getStats().themesPlayed);await audio.locator('.hand-card').filter({hasText:name}).click();await audio.locator(`[data-slot="0-${slot}"]`).click();await audio.waitForTimeout(650);
    if(slot<2)assert.equal(await audio.evaluate(()=>window.__sfx.getStats().themesPlayed),before,`${name} still played a muted-tier theme`);
    else await audio.waitForFunction(before=>window.__sfx.getStats().themesPlayed>before,before,{timeout:5000});
   }
  }finally{await audio.close();}
  assert.deepEqual(errors,[]);console.log('PASS locked full cards, boss requirements, gallery keywords, all printed token references, smaller fifteen-second countdown, and rarity-based card music');
 }finally{if(!page.isClosed())await page.close();}
}
