/** Production-only smoke: no source imports or development hooks in the browser. */
import { launch, settleMotion } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base=process.argv[2];if(!base)throw new Error('Pass the published /play/ URL');
const browser=await launch();const page=await browser.newPage({viewport:{width:1440,height:950}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const progress=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('convergence.progress.v3')));
try{
 await mkdir('../.preview/release',{recursive:true});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('convergence.progress.v2','{"unlocked":216}');localStorage.setItem('convergence.save.v27','{"version":27}');localStorage.setItem('sound-test-preference','preserved');});
 await page.reload();await page.locator('.title-screen').waitFor();
 assert.equal((await progress()).unlockedIds.length,30);assert.equal((await progress()).completedChapters,0);
 assert.equal(await page.locator('.orbit-choice,.daily-pack-trigger').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('convergence.progress.v2')),null);
 assert.equal(await page.evaluate(()=>localStorage.getItem('sound-test-preference')),'preserved');
 await page.keyboard.type('Ross');await page.locator('.duel-trigger').click();
 assert.equal(await page.locator('.campaign-chapter').count(),20);
 await page.getByRole('button',{name:'Play chapter 1',exact:true}).click();
 await page.locator('.duel-intro').waitFor({state:'detached',timeout:25000});
 await page.locator('.mulligan-panel button.primary').click();
 await page.locator('.boss-portrait').evaluate(img=>img.decode());
 assert.equal(await page.evaluate(()=>typeof window.__debug),'undefined');
 assert((await page.locator('.campaign-hero .hero-name strong').textContent()).includes('GLaDOS'));
 await page.getByRole('button',{name:'Inspect GLaDOS',exact:true}).click();
 assert(await page.getByRole('dialog',{name:'GLaDOS card details'}).isVisible());
 await page.getByLabel('Close opponent details').click();
 await page.screenshot({path:'../.preview/release/live-chapter-one.png'});
 await page.getByRole('button',{name:'DEV tools',exact:true}).click();
 await page.locator('.developer-search input').fill('John Wick');await page.locator('.developer-card-row').first().click();
 await page.getByRole('button',{name:'I win',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('convergence.progress.v3')).completedChapters===1);
 assert.equal((await progress()).unlockedIds.length,39);assert.equal((await progress()).pendingRewards.length,9);
 await page.reload();await page.locator('.pack-veil').waitFor();assert.equal((await progress()).pendingRewards.length,9);
 await settleMotion(page);
 for(let hit=0;hit<8;hit++){const box=page.locator('.pack-box:not(.is-charged)');if(!await box.isVisible())break;const label=await box.getAttribute('aria-label');await box.click({force:true});await page.waitForFunction(label=>document.querySelector('.pack-box')?.getAttribute('aria-label')!==label,label);}
 await page.locator('.pack-collect:not([disabled])').click({timeout:25000});
 await page.locator('.deck-trigger').click();await page.getByRole('button',{name:'Remove John Wick',exact:true}).click();
 await page.getByLabel('Search unlocked cards').fill('GLaDOS');await page.getByRole('button',{name:'Add GLaDOS',exact:true}).click();
 assert.equal((await progress()).playerDeck.length,30);assert((await progress()).playerDeck.includes('c104'));
 await page.reload();assert((await progress()).playerDeck.includes('c104'));assert.equal((await progress()).pendingRewards.length,0);
 await page.locator('.duel-trigger').click();assert(await page.getByRole('button',{name:'Play chapter 2',exact:true}).isEnabled());
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'../.preview/release/live-campaign-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS live production: old-save reset, campaign gating, boss portrait/details, first victory, durable reward, deck swap/reload, next chapter, mobile layout, no debug hook and no page errors.');
}finally{await browser.close();}
