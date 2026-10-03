import assert from 'node:assert/strict';

/** Walk the visible training controls, including every intermediate targeting screen. */
export async function playTutorial(page) {
  await page.getByRole('button',{name:'Start lesson',exact:true}).click();
  await page.locator('.hand-card.playable').first().click();await page.locator('[data-slot="0-0"]').click();
  const pass=async()=>{await page.locator('.end-turn').click();await page.locator('.hero-plate.me.active').waitFor();};
  await pass();await page.locator('[data-slot="0-0"]').click();await page.locator('.hero-plate.enemy.targetable').click();
  await pass();await page.locator('.hand-card').filter({hasText:'Batman'}).first().click();await page.locator('[data-slot="0-1"]').click();
  if(await page.locator('.board-slot.choosable').count())await page.locator('.board-slot.choosable').first().click();
  await page.locator('.target-prompt .prompt-value').first().click();
  await page.locator('.hand-card').filter({hasText:'Green Lantern Ring'}).first().click();await page.locator('[data-slot="0-1"]').click();
  await pass();await page.locator('.hero-power-button').click();await page.locator('[data-slot="0-1"]').click();
  await page.locator('[data-slot="0-1"]').click();await page.locator('.board-slot.targetable').first().click();
  await page.locator('.title-screen').waitFor({timeout:5000});
  assert.equal(await page.locator('.tutorial-coach').count(),0,'Tutorial did not end automatically');
}

/** Training must neither overwrite an unfinished duel nor suppress its later reward. */
export async function checkTutorialResume(page, base) {
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    localStorage.clear();
    const {emptyProgress,saveProgress}=await import('/src/progress.ts');
    const {createCampaignDuel}=await import('/src/campaign-duel.ts');
    const {cards,relics}=await import('/src/data/cards.ts');
    const {applyAction,makeCardLibrary}=await import('/src/engine/game.ts');
    const {saveGame}=await import('/src/storage.ts');
    const progress={...emptyProgress(),storyIntroduced:true};
    saveProgress(progress);
    const opening=createCampaignDuel({chapter:1,playerDeck:progress.playerDeck,unlockedCardIds:progress.unlockedIds,cards,relics,seed:'tutorial-resume'});
    const {state}=applyAction(opening.state,{type:'confirm_mulligan',player:0},makeCardLibrary(cards,relics));
    saveGame(state,[{kind:'info',text:'Original duel before training.'}],{kind:'campaign',chapter:1,skill:'easy',duelId:'tutorial-resume'},1);
  });
  await page.reload({waitUntil:'domcontentloaded'});
  const saved=await page.evaluate(()=>localStorage.getItem('convergence.save.v32'));
  await page.keyboard.type('Ross');
  await page.getByRole('button',{name:'Tutorial',exact:true}).click();
  await page.getByRole('button',{name:'Start lesson',exact:true}).click();
  await page.locator('.hand-card.playable').first().click();
  await page.locator('[data-slot="0-0"]').click();
  await page.getByRole('button',{name:'Leave tutorial',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('convergence.save.v32')),saved,'Tutorial replaced the saved duel');
  await page.locator('.continue-duel').click();
  await page.waitForFunction(()=>window.__debug.state().phase==='main');
  const resumed=await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.save.v32')).game);
  assert.deepEqual(resumed,JSON.parse(saved).game,'Tutorial changed the restored duel');
  await page.evaluate(()=>{window.__debug.place('John Wick','me',0);window.__debug.setCore('them',1);});
  await page.locator('[data-slot="0-0"]').click();
  await page.locator('.hero-plate.enemy.targetable').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).completedBosses.includes(1),null,{timeout:5000});
  console.log('PASS tutorial preserves an unfinished duel and its later first-clear reward.');
}
