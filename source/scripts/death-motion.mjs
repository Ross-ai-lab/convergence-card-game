import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { manualRotationBrowser } from './phone-fixtures.mjs';

/** Kill through a real card play, rather than mounting a hand-built effect. */
export async function checkDeathMotion(browser, base) {
  for(const viewport of [{width:1440,height:900},{width:844,height:390}]) {
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.height<600});
  await manualRotationBrowser(context);
  const page=await context.newPage();
  try {
    await page.goto(base);
    await page.evaluate(async()=>{
      const [{createCampaignDuel},{CAMPAIGN_STARTER_DECK},{cards,relics},{spawnTestMinion},{saveGame}] = await Promise.all([
        import('/src/campaign-duel.ts'),import('/src/campaign.ts'),import('/src/data/cards.ts'),import('/src/engine/test-utils.ts'),import('/src/storage.ts')]);
      const {state}=createCampaignDuel({chapter:1,playerDeck:CAMPAIGN_STARTER_DECK,unlockedCardIds:CAMPAIGN_STARTER_DECK,cards,relics,seed:'death-motion'});
      state.phase='main';state.mulligan=null;state.players[0].mana=10;state.players[0].maxMana=10;
      state.players[0].hand=[cards.find(card=>card.name==='Meteor').id];
      state.players[1].board[1]=spawnTestMinion(cards.find(card=>card.name==='John Wick'),1,{sleeping:false});
      saveGame(state,[],{kind:'campaign',chapter:1,skill:'easy'},Date.now());
    });
    await page.reload();await page.locator('.continue-duel').tap();
    await page.evaluate(()=>document.fonts.ready);
    const slot=page.locator('[data-slot="1-1"]');
    await slot.locator('.minion-wrap').evaluate(node=>{for(const animation of node.getAnimations())if(animation.animationName==='minion-arrive')animation.finish();window.__dyingFace=node.querySelector('.card-face');});
    const before=await slot.locator('.minion-wrap').boundingBox();
    await slot.locator('img').first().evaluate(img=>img.decode());
    await page.locator('.hand-card').tap();
    await page.locator('[data-slot="0-0"]').tap();
    await page.locator('.ghost-wrap.dying').waitFor();
    assert(await page.locator('.ghost-wrap.dying .card-face').evaluate(card=>card===window.__dyingFace),'Death rebuilt the minion card');
    const ghost=await page.locator('.ghost-wrap.dying').boundingBox();
    assert(Math.abs(before.width-ghost.width)<1&&Math.abs(before.height-ghost.height)<1,'Death ghost changes the card dimensions');
    const samples=await page.locator('.ghost-wrap.dying .card-face').evaluate(card=>{
      const animation=card.getAnimations().find(animation=>animation.animationName==='death-dissolve');
      if(!animation)throw new Error('Missing death dissolve');
      animation.pause();
      const values=[0,130,310,640].map(time=>{animation.currentTime=time;const style=getComputedStyle(card);return {opacity:Number(style.opacity),transform:style.transform};});
      animation.currentTime=310;
      return values;
    });
    assert(samples[0].opacity===1&&samples[1].opacity>.95&&samples[2].opacity<samples[1].opacity&&samples[3].opacity===0,`Death opacity does not resolve cleanly: ${JSON.stringify(samples)}`);
    await mkdir('../.preview/motion',{recursive:true});
    await page.screenshot({path:`../.preview/motion/death-${viewport.width}x${viewport.height}.png`});
    await page.locator('.ghost-wrap').waitFor({state:'detached',timeout:2500});
    assert.equal(await page.locator('[data-slot="1-1"].occupied').count(),0,'Destroyed minion remains on board');
    console.log('PASS death motion: real Meteor kill, original card geometry, controlled dissolve and complete cleanup.');
  } finally {await context.close();}
  }
}
