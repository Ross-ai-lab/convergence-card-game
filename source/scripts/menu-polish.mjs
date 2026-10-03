import assert from 'node:assert/strict';
import {seedCampaignProgress} from './campaign-fixtures.mjs';
import {skipCampaignDialogue} from './story-fixtures.mjs';
import {settleMotion} from './browser.mjs';

export async function checkMenuPolish(page) {
  await page.getByRole('button',{name:'Lore',exact:true}).click();
  assert.equal(await page.locator('.lore-chapter:disabled').count(),10);
  await page.screenshot({path:'../.preview/new-features/lore-library.png'});
  await page.getByLabel('Close Lore').click();
  await seedCampaignProgress(page,1);
  await page.locator('.deck-trigger').click();await page.locator('.gallery-cell').first().waitFor();
  assert(await page.locator('.gallery-mana-summary').evaluate(el=>{
    const titleBottom=el.querySelector('.gallery-mana-title').getBoundingClientRect().bottom;
    return [...el.querySelectorAll('.gallery-deck-curve span')].every(bar=>bar.getBoundingClientRect().top-12>=titleBottom);
  }),'Mana curve counts overlap their heading');
  const power=page.getByRole('button',{name:'Choose hero power',exact:true});
  assert((await power.textContent()).includes('New hero power available'));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).selectedHeroPower);
  await power.click();await page.getByLabel('Close hero power chooser').click();
  assert((await power.textContent()).includes('Choose Hero Power'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v4')).selectedHeroPower),before);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.duel-trigger').click();await page.locator('[data-chapter="1"] button').click();
  await skipCampaignDialogue(page);await page.locator('.duel-intro').dblclick();await page.locator('.duel-intro').waitFor({state:'detached'});
  await page.locator('.mulligan-panel button.primary').click();
  await page.waitForFunction(()=>window.__debug.state().phase==='main');
  await page.evaluate(()=>window.__debug.setCore('them',25));await settleMotion(page);
  const bar=await page.locator('.hero-plate.enemy').boundingBox(),fill=await page.locator('.hero-health-fill').boundingBox();
  assert(Math.abs(fill.width/bar.width-.5)<.03,'Boss health does not deplete the bar');
  assert.equal(await page.locator('.hero-health-fill').textContent(),'');
  await page.setViewportSize({width:844,height:390});
  const boss=await page.locator('.enemy-hero-wrap').boundingBox(),menu=await page.locator('.mobile-menu-toggle').boundingBox();
  assert(boss.width<=301&&boss.height<=54,'Boss header is not compact');assert(menu.width<=44&&menu.height<=36,'Menu size was not reduced');
  assert(await page.locator('.turn-banner').evaluateAll(items=>items.every(el=>getComputedStyle(el,'::before').content==='none')),'Turn sweep line remains');
  await page.screenshot({path:'../.preview/new-features/compact-boss-health.png'});
  console.log('PASS menu polish: ten locked Lore chapters, viewed-power acknowledgement, compact HUD and depleted boss health.');
}
