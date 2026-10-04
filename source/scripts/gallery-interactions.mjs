import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Compare actual card pixels after scrolling and repeated profile overlays. */
export async function checkGalleryPaint(page) {
  const cell=page.locator('.gallery-cell').filter({has:page.getByRole('button',{name:'Remove John Wick',exact:true})});
  await cell.scrollIntoViewIfNeeded();await cell.locator('img').evaluate(img=>img.decode());
  await page.evaluate(()=>document.fonts.ready);
  const hash=async()=>createHash('sha256').update(await cell.screenshot()).digest('hex');
  const before=await hash();
  await checkFastGalleryScroll(page);
  await cell.scrollIntoViewIfNeeded();
  const after=await hash();assert.equal(after,before,'Fast scrolling changes the painted card surface');
}

export async function checkPreviewFallback(browser,base) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try {
    await context.route('**/card-art/raw/*.webp',route=>route.abort());
    await page.goto(base);await page.locator('.title-screen').waitFor();
    await page.locator('.deck-trigger').tap();await page.locator('.gallery-cell').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.gallery-cell.is-near img')];return images.length>0&&images.every(img=>img.complete&&img.naturalWidth===0&&img.style.opacity==='0');});
    assert(await page.locator('.gallery-cell .cf-art').evaluateAll(art=>art.every(el=>getComputedStyle(el).backgroundImage.includes('data:image/webp'))),'Pending artwork lacks a preview');
    const preview=await page.locator('.gallery-cell .cf-art').first().evaluate(async el=>{
      const image=new Image();image.src=el.style.backgroundImage.slice(5,-2);await image.decode();return image.naturalWidth;
    });
    assert(preview>0&&preview<=64,'Fallback artwork is not a decoded lightweight image');
    await mkdir('../.preview/performance',{recursive:true});
    await page.screenshot({path:'../.preview/performance/cold-gallery.png'});
    console.log('PASS cold gallery: complete printed cards retain decoded artwork previews even with full images blocked.');
  } finally {await context.close();}
}

export async function checkGalleryHold(page, {webKit = false, cardName='John Wick', adding=false} = {}) {
  assert.equal(await page.locator('.gallery-compact-label').count(), 0, 'Duplicate card names remain');
  const locked=page.getByRole('button',{name:`Unlock requirements for ${cardName}`,exact:true,includeHidden:true});
  const card = adding&&await locked.count()?locked:page.getByRole('button', {name:`${adding?'Add':'Remove'} ${cardName}`, exact:true, includeHidden:true});
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const point = {x:box.x+box.width/2,y:box.y+box.height/2};
  const before = await card.getAttribute('aria-pressed');
  const session = webKit ? null : await page.context().newCDPSession(page);
  if (session) await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  else await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:10,clientX:point.x,clientY:point.y});
  await page.getByRole('dialog',{name:`${cardName} Star Chart`,exact:true}).waitFor({timeout:2500});
  if (session) await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:10});
  assert.equal(await card.getAttribute('aria-pressed'),before,'Holding a card changed the deck');
  await page.getByLabel('Close Star Chart').click();
  await card.scrollIntoViewIfNeeded();
  const swipeBox=await card.boundingBox();
  const swipePoint={x:swipeBox.x+swipeBox.width/2,y:swipeBox.y+swipeBox.height/2};
  if (session) {
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[swipePoint]});
    for (let step=1;step<=4;step++) {
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipePoint.x,y:swipePoint.y-step*18}]});
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(1100);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await session.detach();
  } else {
    await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:11,clientX:point.x,clientY:point.y});
    await card.dispatchEvent('pointermove',{pointerType:'touch',pointerId:11,clientX:point.x,clientY:point.y-40});
    await page.waitForTimeout(1100);
    await card.dispatchEvent('pointercancel',{pointerType:'touch',pointerId:11});
  }
  assert.equal(await page.locator('.gallery-detail-panel').count(),0,'Swiping opened a profile');
  assert.equal(await card.getAttribute('aria-pressed'),before,'Swiping changed the deck');
  await page.locator('.gallery-mobile-scroll').evaluate(el => el.scrollTop=0);
}

export async function checkDeckHover(page) {
  const row=page.locator('.gallery-deck-row').filter({has:page.getByRole('button',{name:'Inspect Ragnaros',exact:true})});
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  const preview=page.getByRole('status',{name:'Deck card: Ragnaros',exact:true});
  assert(await preview.isVisible(),'Deck hover requires a delay');
  assert((await preview.locator('.cf-desc').textContent()).includes('Deal 3 damage'),'Preview lacks the printed rules');
  const rect=await preview.boundingBox();
  assert(rect.width>=250,'Deck preview is not enlarged');
  await page.mouse.move(10,10);
  assert.equal(await preview.count(),0,'Deck preview did not dismiss on exit');
}

/** Warm two distant rows, then jump between them without destroying decoded images. */
export async function checkFastGalleryScroll(page) {
  const mobileScroll=await page.locator('.gallery-body').evaluate(el=>getComputedStyle(el).overflowY==='visible');
  const root=page.locator(mobileScroll?'.gallery-mobile-scroll':'.gallery-body');
  for (const end of [false,true]) {
    await root.evaluate((el,end)=>el.scrollTop=end?el.scrollHeight:0,end);
    await page.waitForFunction(()=>[...document.querySelectorAll('.gallery-cell.is-near img')].every(img=>img.complete&&img.naturalWidth>0));
    await page.locator('.gallery-cell.is-near img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  }
  await page.evaluate(()=>{window.__scrollArt=[...document.querySelectorAll('.gallery-cell img')].filter(img=>img.complete&&img.naturalWidth);});
  for (let step=0;step<12;step++) {
    await root.evaluate((el,end)=>el.scrollTop=end?el.scrollHeight:0,step%2===0);
    assert(await page.evaluate(()=>window.__scrollArt.every(img=>img.isConnected&&img.complete&&img.naturalWidth>0)), 'Fast scrolling discarded decoded artwork');
    await page.waitForTimeout(20);
  }
  await page.evaluate(()=>delete window.__scrollArt);
  await root.evaluate(el=>el.scrollTop=0);
}
