/** Capture the current campaign reward flow and collection states. */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launch, settleMotion } from './browser.mjs';
import { seedCampaignProgress } from './campaign-fixtures.mjs';
import { skipCampaignDialogue } from './story-fixtures.mjs';

const base = process.argv.find(arg => arg.startsWith('http')) || 'http://localhost:5177';
const mobile = process.argv.includes('--mobile');
const output = fileURLToPath(new URL('../../.preview/pack/', import.meta.url));
await mkdir(output, {recursive:true});
const browser = await launch();
const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1440,height:900}});
async function shoot(name) {
  await page.screenshot({path:`${output}${mobile ? 'mobile-' : ''}${name}.png`, animations:'disabled'});
  console.log(`Captured ${name}`);
}
async function filters() {
  if (mobile && await page.locator('.mobile-filter-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('.mobile-filter-toggle').click();
}
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.title-screen').waitFor();
  await shoot('00-title-tally');
  await page.locator('.deck-trigger').click();
  await page.locator('.gallery-cell img').first().evaluate(img=>img.decode());
  await shoot('01-gallery-unlocked');
  await page.locator('.gallery-help').click();
  await shoot('02-gallery-help');
  await page.locator('.help-x').click();
  await filters();
  await page.getByLabel('Filter by unlocked or locked').selectOption('locked');
  await shoot('03-gallery-locked');
  await page.getByLabel('Filter by unlocked or locked').selectOption('unlocked');
  await page.getByLabel('Filter by rarity').selectOption('Relic');
  await shoot('04-gallery-relics');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.duel-trigger').click();
  await page.locator('[data-chapter="1"] button').click();
  await skipCampaignDialogue(page);
  await page.locator('.duel-intro').dblclick();
  await page.locator('.duel-intro').waitFor({state:'detached'});
  await page.locator('.mulligan-panel button.primary').click();
  await page.waitForFunction(()=>window.__debug?.state().phase==='main');
  await page.evaluate(()=>{window.__debug.place('Godzilla','me',0);window.__debug.setCore('them',1);});
  await page.locator('[data-slot="0-0"].ready').click();
  await page.locator('.hero-plate.targetable').click();
  await page.locator('[data-story-stage="defeat"]').waitFor();
  await skipCampaignDialogue(page);
  await page.locator('.pack-veil').waitFor();
  await shoot('05-pack-sealed');
  for(let hit=0;hit<10;hit++) {
    const box=page.locator('.pack-box:not(.is-charged)');
    if(!await box.isVisible()) break;
    const label=await box.getAttribute('aria-label');
    await box.click({force:true}); // the deliberately moving pack never becomes stable
    await page.waitForFunction(previous=>document.querySelector('.pack-box')?.getAttribute('aria-label')!==previous,label);
  }
  await page.locator('.pack-collect:not([disabled])').waitFor();
  await settleMotion(page);
  await shoot('10-pack-open');
  await page.locator('.pack-collect').click();
  await page.reload();
  await page.locator('.deck-trigger').click();
  await shoot('11-gallery-after');
  await seedCampaignProgress(page);
  await page.evaluate(async()=>{const p=await import('/src/progress.ts');const current=p.loadProgress();p.saveProgress({...current,seen:[...current.unlockedIds],played:[...current.unlockedIds]});});
  await page.reload();
  await page.locator('.deck-trigger').click();
  await filters();
  for(const [value,name] of [['Red','12-shine-mythic'],['Yellow','13-shine-legendary'],['Purple','14-shine-epic'],['Relic','15-shine-relic'],['Black','16-shine-rare-none']]) {
    await page.getByLabel('Filter by rarity').selectOption(value);
    await shoot(name);
  }
  console.log('Campaign reward and collection captures complete.');
} finally { await browser.close(); }
