/** Phone/tablet regression checks, invoked through the existing check runner. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launch, settleMotion } from './browser.mjs';
import { seedCampaignProgress } from './campaign-fixtures.mjs';
import { skipCampaignDialogue } from './story-fixtures.mjs';
import { checkCampaignMotion } from './campaign-motion.mjs';
import { confirmStarterRestore } from './deck-fixtures.mjs';
import { holdCard as hold, rotateForDuel as rotate, resizePhone as resize, manualRotationBrowser } from './phone-fixtures.mjs';

const base = process.argv.find(arg => arg.startsWith('http')) || 'http://localhost:5177';
const useWebKit = process.argv.includes('--webkit');
const output = fileURLToPath(new URL(`../../.preview/${useWebKit ? 'mobile-webkit' : 'mobile'}/`, import.meta.url));
await mkdir(output, { recursive: true });
const browser = useWebKit ? await (await import('playwright')).webkit.launch() : await launch();
const sizeArgument = process.argv.find(arg => arg.startsWith('--size='))?.slice(7);
const sizes = sizeArgument ? sizeArgument.split(',').map(value => {
  const parts = value.split('x').map(Number);
  if (parts.length !== 2 || parts.some(number => !Number.isInteger(number) || number < 1)) throw new Error(`Invalid viewport ${value}; use --size=390x844,844x390.`);
  return parts;
}) : useWebKit ? [[390,844], [844,390], [1024,768]] : [[320,568], [360,740], [390,844], [430,932], [768,1024], [1024,768], [844,390], [667,375]];
const errors = [];

async function inside(page, selector, label) {
  const boxes = await page.locator(selector).evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      vw: innerWidth, vh: innerHeight, text: el.getAttribute('aria-label') || el.textContent?.slice(0, 60) };
  }));
  assert(boxes.length, `${label} missing`);
  assert(boxes.every(r => r.w > 0 && r.h > 0 && r.x >= -1 && r.y >= -1 && r.right <= r.vw + 1 && r.bottom <= r.vh + 1),
    `${label} outside viewport: ${JSON.stringify(boxes)}`);
}
async function noPageOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Document has horizontal overflow');
}
async function shoot(page, name) {
  await page.screenshot({ path: `${output}${name}.png`, animations: 'disabled' });
}
async function clickMenu(page, name) {
  const menu = page.getByRole('button', { name: 'Duel menu', exact: true });
  if (await menu.getAttribute('aria-expanded') !== 'true') await menu.tap();
  try {
    await page.waitForFunction(() => document.querySelector('.mobile-menu-toggle')?.getAttribute('aria-expanded') === 'true', null, {timeout: 2000});
  } catch (error) {
    await shoot(page, 'menu-failure');
    throw error;
  }
  await page.getByRole('button', { name, exact: true }).tap();
}

const holdCard = (page,locator,name) => hold(page,locator,name,useWebKit);
const rotateForDuel = (page,width,height) => rotate(page,width,height,useWebKit);
const resizePhone = (page,width,height) => resize(page,width,height,useWebKit);

try {
  for (const [width, height] of sizes) {
    console.log(`Checking mobile ${width}x${height}`);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await manualRotationBrowser(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${width}x${height}: ${error.message}`));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.title-screen').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => ['Nunito', 'Baloo 2'].every(family => [...document.fonts].some(font => font.family.replaceAll('"', '') === family && font.status === 'loaded'))), 'Card fonts did not load');
    await noPageOverflow(page);
    await inside(page, '.duel-trigger,.deck-trigger,.hotseat-trigger', 'Title actions');
    await shoot(page, `${width}x${height}-title`);

    await page.locator('.duel-trigger').tap();
    await page.locator('.campaign-chapter').first().waitFor();
    if (width === 390 || width === 844) await checkCampaignMotion(page);
    if (width === 390) await shoot(page, 'phone-boss-collection');
    assert.equal(await page.locator('.campaign-chapter').count(), 20);
    await inside(page, '.campaign-close', 'Collection close');
    await page.locator('[data-chapter="20"] button').scrollIntoViewIfNeeded();
    await inside(page, '[data-chapter="20"] button', 'Last universe action');
    await page.locator('.campaign-close').tap();

    await page.locator('.deck-trigger').tap();
    assert.equal(await page.locator('.gallery-grid .gallery-deck-card').count(), 30);
    await page.locator('.gallery-cell img').first().waitFor();
    await page.locator('.gallery-cell img').first().evaluate(img => img.decode());
    const firstCard = await page.locator('.gallery-cell').first().boundingBox();
    assert(firstCard.width >= 100 && firstCard.height >= 140, 'Collection grid cards are too small');
    const firstRows = await page.locator('.gallery-deck-card').evaluateAll(items=>items.slice(0,4).map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    assert(firstRows[1].x > firstRows[0].x && Math.abs(firstRows[1].y-firstRows[0].y)<1,'Collection is not a two-column grid');
    assert(await page.locator('.gallery-body').isVisible());
    assert(!(await page.locator('.gallery-deck').isVisible()), 'Deck list consumes collection space');
    await inside(page, '.mobile-deck-tabs button,.gallery-search,.screen-x', 'Builder controls');
    await shoot(page, `${width}x${height}-collection`);
    assert(await page.getByLabel('Filter by mana', { exact: true }).isVisible());
    await page.getByLabel('Filter by mana', { exact: true }).selectOption('1');
    assert(Number(await page.locator('.gallery-count').textContent()) < 30);
    await page.getByLabel('Filter by mana', { exact: true }).selectOption('');
    await page.locator('.gallery-mobile-scroll').evaluate(el=>el.scrollTo({top:350}));
    assert(await page.locator('.gallery-search').evaluate(el=>el.getBoundingClientRect().bottom<0),'Collection search remains pinned while scrolling');
    await page.getByRole('button', { name: 'Deck · 30/30', exact: true }).tap();
    assert(await page.locator('.gallery-deck').isVisible());
    assert(!(await page.locator('.gallery-body').isVisible()));
    await page.getByRole('button', { name: 'Remove John Wick from deck', exact: true }).tap();
    assert.equal(await page.locator('.gallery-deck-row').count(), 29);
    await page.getByRole('button', { name: 'Restore starter deck', exact: true }).tap();
    assert.equal(await page.locator('.gallery-deck-row').count(),29,'Reset occurred before confirmation');
    await page.getByRole('dialog',{name:'Restore starter deck?',exact:true}).getByRole('button',{name:'Cancel',exact:true}).tap();
    assert.equal(await page.locator('.gallery-deck-row').count(),29,'Cancel changed the deck');
    await page.getByRole('button', { name: 'Restore starter deck', exact: true }).tap();
    await confirmStarterRestore(page,true);
    assert.equal(await page.locator('.gallery-deck-row').count(), 30);
    await page.getByRole('button', { name: 'Choose hero power', exact: true }).tap();
    await inside(page, '.gallery-power-picker', 'Hero Power chooser');
    await page.getByLabel('Close hero power chooser').tap();
    await shoot(page, `${width}x${height}-deck`);
    await page.getByRole('button', { name: 'Close', exact: true }).tap();

    // Real campaign onboarding and mulligan. Development hook supplies a full board
    // only after ordinary touch play has been exercised below.
    await page.locator('.duel-trigger').tap();
    await page.locator('[data-chapter="1"] button').tap();
    await skipCampaignDialogue(page);
    await rotateForDuel(page,width,height);
    await page.locator('.duel-intro').dblclick();
    await page.locator('.duel-intro').waitFor({ state: 'detached', timeout: 20000 });
    await inside(page,'.mulligan-panel,.mulligan-card,.mulligan-panel button.primary','Fixed opening hand');
    assert(await page.locator('.mulligan-panel').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Opening hand requires scrolling');
    if (width===390) await shoot(page,'phone-mulligan');
    const openingCard = page.locator('.mulligan-card').first();
    const openingName = await openingCard.locator('.cf-name').textContent();
    await holdCard(page,openingCard,`Read ${openingName}`);
    await page.getByRole('button',{name:'Close card reader',exact:true}).tap();
    assert.equal(await page.locator('.mulligan-card.selected').count(),0,'Reading an opening card selected it for replacement');
    await page.locator('.mulligan-panel button.primary').tap();
    await page.waitForFunction(() => window.__debug?.state().phase === 'main');
    await page.locator('.enemy-hero-wrap').tap();
    await inside(page, '.enemy-power-card', 'Boss Hero Power');
    await page.locator('.enemy-hero-wrap').tap();
    await inside(page, '.board-slot,.end-turn,.hero-plate,.mobile-menu-toggle', 'Duel controls');
    if (page.viewportSize().width < page.viewportSize().height || page.viewportSize().height <= 600) {
      assert(await page.locator('.end-turn').evaluate(button => {
        const b = button.getBoundingClientRect();
        const hand = document.querySelector('.hand-fan').getBoundingClientRect();
        return [...document.querySelectorAll('.hand-card,.command-bar .health-gem')].every(el => {
          const r = el.getBoundingClientRect();
          const top = el.matches('.hand-card') ? Math.max(r.top,hand.top) : r.top;
          const bottom = el.matches('.hand-card') ? Math.min(r.bottom,hand.bottom) : r.bottom;
          return bottom <= top || r.right <= b.left || r.left >= b.right || bottom <= b.top || top >= b.bottom;
        });
      }), 'End Turn covers a hand card or core health');
    }
    const scrollableBoards = await page.locator('.board-row').evaluateAll(rows => rows.some(row => row.scrollWidth > row.clientWidth + 1));
    assert(!scrollableBoards, 'A board hides slots behind horizontal scrolling');

    const initialHandCount = await page.locator('.hand-card').count();
    await page.evaluate(() => window.__debug.giveCard('John Wick'));
    await page.waitForFunction(count => document.querySelectorAll('.hand-card').length === count + 1, initialHandCount);
    const handCount = await page.locator('.hand-card').count();
    await page.locator('.hand-item').last().scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.mobile-card-read').count(), 0, 'Read buttons remain on cards');
    await holdCard(page,page.getByRole('button',{name:'John Wick, 1 mana, playable',exact:true}).last(),'Read John Wick');
    await inside(page, '.mobile-inspection-panel,.mobile-inspection-card', 'Card reader');
    if (width === 390) await shoot(page, 'landscape-card-reader');
    const readerTurn = await page.locator('.deck-pile em').textContent();
    await page.keyboard.press('z');
    assert.equal(await page.locator('.deck-pile em').textContent(), readerTurn, 'Reader leaked a shortcut to the duel');
    await page.getByRole('button', { name: 'Close card reader', exact: true }).tap();
    assert.equal(await page.locator('.hand-card').count(), handCount, 'Reading spent a card');
    await page.getByRole('button', { name: 'John Wick, 1 mana, playable', exact: true }).last().tap();
    await page.getByRole('button', { name: 'John Wick, 1 mana, playable', exact: true }).last().tap();
    assert.equal(await page.locator('.hand-card.selected').count(), 0, 'Tapping a selected card did not deselect');
    await page.getByRole('button', { name: 'John Wick, 1 mana, playable', exact: true }).last().tap();
    await page.locator('[data-slot="0-3"]').tap();
    assert.equal(await page.locator('[data-slot="0-3"].occupied').count(), 1, 'Tap-to-play missed the fourth slot');
    assert(await page.locator('.hs-shell').evaluate(el => el.scrollLeft === 0 && el.scrollTop === 0), 'Card focus moved the whole game');
    await page.getByRole('button',{name:'Duel menu',exact:true}).tap();
    assert.equal(await page.getByRole('button',{name:'Undo last action',exact:true}).count(),0, 'Normal duels expose Undo');
    await page.getByRole('button',{name:'Duel menu',exact:true}).tap();
    await page.keyboard.press('z');
    assert.equal(await page.locator('[data-slot="0-3"].occupied').count(),1, 'Normal Z shortcut undid a move');

    await page.evaluate(() => {
      ['Batman','UFO','Musashi','John Wick'].forEach((name, slot) => window.__debug.place(name, 'me', slot));
      ['Po','Flash','Yujiro','Rennala'].forEach((name, slot) => window.__debug.place(name, 'them', slot));
    });
    await page.waitForFunction(() => window.__debug.state().mine === 4 && window.__debug.state().theirs === 4);
    await settleMotion(page); // measure settled cards even when headless frames are throttled
    await inside(page, '.board-slot .card-face', 'All eight populated cards');
    await shoot(page, `${width}x${height}-battlefield`);
    await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__debug.giveCard('John Wick'); });
    await holdCard(page,page.locator('[data-slot="0-0"]'),'Read Batman');
    assert(await page.getByRole('dialog', { name: 'Read Batman', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Close card reader', exact: true }).tap();
    await page.evaluate(() => window.__debug.equipRelic('Green Lantern Ring','me',0));
    const relicBadge = page.locator('[data-slot="0-0"] .relic-badge').first();
    await relicBadge.waitFor();
    const badgeSize = await relicBadge.boundingBox();
    await relicBadge.tap();
    await page.getByRole('status',{name:'Equipped relic: Green Lantern Ring',exact:true}).waitFor();
    assert((await page.locator('.equipped-relic-peek').textContent()).includes('Green Lantern Ring'));
    assert(Math.abs((await relicBadge.boundingBox()).width-badgeSize.width)<.5,'Relic tap enlarged its logo');
    assert.equal(await page.locator('[data-slot="0-0"].armed').count(),0,'Inspecting a relic armed its bearer');
    await page.getByRole('status',{name:'Equipped relic: Green Lantern Ring',exact:true}).waitFor({state:'detached',timeout:2000});
    const point = {x:badgeSize.x+badgeSize.width/2,y:badgeSize.y+badgeSize.height/2};
    let relicSession;
    if (useWebKit) await relicBadge.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:point.x,clientY:point.y});
    else {relicSession=await context.newCDPSession(page);await relicSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});}
    await page.waitForTimeout(1500);
    assert(await page.locator('.equipped-relic-peek').isVisible(),'Held relic preview closed early');
    await inside(page,'.equipped-relic-peek > section,.equipped-relic-card','Equipped relic preview');
    if (width===390) await shoot(page,'phone-equipped-relic');
    if (useWebKit) await relicBadge.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:point.x,clientY:point.y});
    else {await relicSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await relicSession.detach();}
    await page.locator('.equipped-relic-peek').waitFor({state:'detached'});
    await page.locator('[data-slot="0-3"]').tap();
    assert.equal(await page.locator('[data-slot="0-3"].armed').count(), 1);
    await page.locator('[data-slot="1-3"]').tap();
    assert.equal(await page.locator('[data-slot="0-3"].armed').count(), 0, 'Tap attack did not resolve');

    // Chromium exposes native touch gestures through CDP. Mobile WebKit exposes
    // taps only, so its scroll-container checks use programmatic scrolling.
    await page.locator('.hand-fan').evaluate(el=>el.scrollTo({top:0,left:0}));
    await page.waitForTimeout(200);
    const hand = await page.locator('.hand-fan').boundingBox();
    const current = page.viewportSize();
    const landscape = current.width > current.height && current.height <= 600;
    const from = { x: hand.x + hand.width * .75, y: hand.y + Math.min(hand.height * .6, 90) };
    const before = await page.locator('.hand-fan').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    const beforeCount = await page.locator('.hand-card').count();
    if (useWebKit) {
      await page.locator('.hand-fan').evaluate((el, vertical) => el.scrollBy(vertical ? {top:120} : {left:180}), landscape);
      await page.waitForTimeout(200);
    } else {
      const cd = await context.newCDPSession(page);
      await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let i = 1; i <= 8; i++) {
        await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x - (landscape ? 0 : 18 * i), y: from.y - (landscape ? 10 * i : 0) }] });
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(1100);
      await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cd.detach();
    }
    const after = await page.locator('.hand-fan').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    assert(landscape ? after.y > before.y : after.x > before.x, `Touch swipe did not scroll the hand: ${JSON.stringify({before,after,hand,current,from})}`);
    assert.equal(await page.locator('.hand-card').count(), beforeCount, 'Swiping played a card');
    assert.equal(await page.locator('.mobile-inspection-panel').count(), 0, 'A swipe opened the long-press reader');
    // End the swipe at rest, then wait for scroll snapping to settle.
    let previousPosition = '';
    let stableReads = 0;
    for (let frame = 0; frame < 50 && stableReads < 4; frame++) {
      await page.waitForTimeout(100);
      const position = await page.locator('.hand-fan').evaluate(el => `${el.scrollLeft},${el.scrollTop}`);
      stableReads = position === previousPosition ? stableReads + 1 : 0;
      previousPosition = position;
    }
    assert(stableReads >= 4, 'Touch hand scrolling did not settle');
    await shoot(page, `${width}x${height}-duel`);
    await clickMenu(page, 'Duel log');
    assert(await page.locator('.log-drawer[open]').isVisible());
    await inside(page,'.log-drawer-body,.event-log li:first-child','Latest log action');
    if (width===390) await shoot(page,'phone-duel-log');
    await page.locator('.log-drawer > summary').tap();
    await clickMenu(page, '◇ How to play');
    await inside(page, '.screen-panel:not(.gallery-panel)', 'Rules panel');
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await noPageOverflow(page);

    // Completed campaign gains difficulty choices without colliding with title actions.
    await seedCampaignProgress(page);
    await inside(page, '.orbit-choice,.duel-trigger,.deck-trigger,.hotseat-trigger,.continue-duel', 'Completed campaign title');
    console.log(`PASS ${useWebKit ? 'WebKit' : 'Chromium'} mobile ${width}x${height}: campaign, builder, filters, reader, all slots, play, attack, ${useWebKit ? 'scroll containers (native swipe verified in Chromium)' : 'native swipe'}, log, rules, free duels`);
    await context.close();
  }
  // Phone hotseat uses the real privacy curtain and both private mulligans.
  const context = await browser.newContext({ viewport: {width:390,height:844}, hasTouch:true, isMobile:true });
  await manualRotationBrowser(context,{missingApi:true});
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(`hotseat: ${error.message}`));
  await page.goto(base, {waitUntil:'domcontentloaded'});
  assert(await page.getByRole('button',{name:'Full screen',exact:true}).isDisabled(), 'Unsupported fullscreen remains interactive');
  await page.locator('.hotseat-trigger').tap();
  await page.locator('.hotseat-confirm-start').tap();
  await page.getByRole('button',{name:'Start two-player duel',exact:true}).tap();
  await rotateForDuel(page,390,844);
  await page.locator('.duel-intro').dblclick();
  await page.locator('.duel-intro').waitFor({state:'detached'});
  await page.locator('.mulligan-panel button.primary').tap();
  await inside(page, '.pass-inner,.pass-screen .primary', 'Phone privacy curtain');
  assert.equal(await page.locator('.pass-screen h2').textContent(), 'Player Two');
  assert(await page.locator('.pass-screen').evaluate(el=>{const r=el.getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;}), 'Privacy curtain leaves an uncovered edge');
  await shoot(page, '390x844-hotseat');
  await page.locator('.pass-screen .primary').tap();
  assert((await page.locator('.mulligan-panel').textContent()).includes('Player Two'));
  await page.locator('.mulligan-panel button.primary').tap();
  await page.locator('.pass-screen .primary').tap();
  const buttonBeforeHover = await page.locator('.end-turn').boundingBox();
  await page.locator('.end-turn').hover();
  const buttonAfterHover = await page.locator('.end-turn').boundingBox();
  assert(Math.abs(buttonBeforeHover.x - buttonAfterHover.x) < 1 && Math.abs(buttonBeforeHover.y - buttonAfterHover.y) < 1, 'End Turn moves on hover or touch');
  await page.locator('.end-turn').tap();
  await page.locator('.pass-screen').waitFor({state:'visible', timeout:10000});
  assert(await page.locator('.pass-screen').isVisible());
  console.log('PASS mobile hotseat: two private mulligans and the turn privacy curtain');
  await page.locator('.pass-screen .primary').tap();
  await page.evaluate(() => { window.__debug.place('John Wick', 'me', 0); window.__debug.setCore('them', 1); });
  await page.locator('.board-slot.ready').first().tap();
  await page.locator('.hero-plate.targetable').tap();
  await page.locator('.result-panel').waitFor();
  for (const [width,height] of [[844,390],[667,375],[568,320]]) {
    await resizePhone(page,width,height);
    await settleMotion(page);
    await inside(page, '.result-panel,.result-mvp-card,.gameover-buttons button', 'Victory screen');
    assert(await page.locator('.result-mvp-card .cf-desc').evaluate(el=>getComputedStyle(el).display!=='none'), 'Champion ability is hidden');
    await shoot(page, `${width}x${height}-victory`);
  }
  console.log('PASS mobile victory: complete champion and reachable Continue at all three landscape sizes');
  await context.close();
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('All mobile checks passed.');
} finally { await browser.close(); }
