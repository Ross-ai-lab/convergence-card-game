import { launch } from './browser.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkDeckHover, checkFastGalleryScroll, checkGalleryHold, checkPreviewFallback, checkGalleryPaint } from './gallery-interactions.mjs';
import { checkDeathMotion } from './death-motion.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = process.argv[2] ?? 'http://localhost:5177';
const label = process.argv[3] ?? 'current';
const session = await page.context().newCDPSession(page);
await session.send('Performance.enable');
const results = {};
async function sample(name) {
  const before = await session.send('Performance.getMetrics');
  await page.waitForTimeout(1500);
  const after = await session.send('Performance.getMetrics');
  const metrics = Object.fromEntries(after.metrics.map(({ name, value }) => [name, value]));
  const old = Object.fromEntries(before.metrics.map(({ name, value }) => [name, value]));
  results[name] = await page.evaluate(() => ({
    elements: document.querySelectorAll('*').length,
    cells: document.querySelectorAll('.gallery-cell').length,
    faces: document.querySelectorAll('.gallery-cell .card-face').length,
    near: document.querySelectorAll('.gallery-cell.is-near').length,
    runningAnimations: document.getAnimations().filter(a => a.playState === 'running').length,
    scrollHeight: document.querySelector('.gallery-body')?.scrollHeight,
  }));
  for (const key of ['TaskDuration', 'LayoutDuration', 'RecalcStyleDuration']) {
    results[name][key + 'Ms'] = Math.round((metrics[key] - old[key]) * 1000);
  }
}
try {
  await page.goto(base);
  await page.locator('.title-screen').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await sample('menu');
  assert.equal(await page.locator('.table-frame').isVisible(), false, 'Covered board must not render on the menu');
  assert.equal(await page.locator('.mulligan-panel').count(), 0, 'Opening-hand prompt must not mount behind the title');
  await page.locator('.gallery-trigger').first().click();
  await page.locator('.gallery-cell').first().waitFor();
  await sample('gallery');
  await checkDeckHover(page);
  await checkFastGalleryScroll(page);
  await checkGalleryPaint(page);
  assert.equal(results.gallery.faces, results.gallery.cells, 'Every shell retains its full face');
  assert(results.gallery.near > 0 && results.gallery.near < results.gallery.cells, 'Only nearby artwork is eager');
  assert(await page.locator('.gallery-cell').evaluateAll(cells => cells.every(cell => getComputedStyle(cell).contentVisibility === 'visible')), 'Gallery still uses paint-skipping containment');
  const backdropRunning = await page.evaluate(() => document.getAnimations().filter(a =>
    a.playState === 'running' && a.effect?.target?.closest?.('.title-screen')).length);
  assert.equal(backdropRunning, 0, 'Menu animations must pause behind the gallery');
  await page.getByLabel('Filter by unlocked or locked').selectOption('locked');
  await sample('locked');
  await page.evaluate(() => { const body = document.querySelector('.gallery-body'); body.scrollTop = body.scrollHeight; });
  await sample('bottom');
  await checkFastGalleryScroll(page);
  assert.equal(results.bottom.scrollHeight, results.locked.scrollHeight, 'Scrolling must preserve gallery geometry');
  assert(results.bottom.near > 0 && results.bottom.near < 40, 'Eager image range must remain bounded');
  await page.locator('.gallery-card-name').last().click();
  await page.locator('.gallery-detail-panel').waitFor();
  await page.getByLabel('Close Star Chart').click();
  const lockedName=(await page.locator('.gallery-card-name').first().getAttribute('aria-label')).replace('Open Star Chart for ','');
  await page.setViewportSize({width:390,height:844});
  await checkGalleryHold(page,{cardName:lockedName,adding:true});
  await page.setViewportSize({width:1440,height:900});
  await page.getByLabel('Search the gallery').fill('no-such-card-zzzz');
  await page.locator('.gallery-empty').waitFor();
  await page.getByLabel('Search the gallery').fill('');
  await page.waitForFunction(() => document.querySelector('.gallery-body')?.scrollTop === 0);
  await page.locator('.gallery-cell .card-face').first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', {name:'Deck · 30/30',exact:true}).click();
  await page.locator('.gallery-deck-inspect').last().click();
  await page.locator('.gallery-detail-panel').waitFor();
  await page.getByLabel('Close Star Chart').click();
  await mkdir('../.preview/performance', { recursive: true });
  await page.screenshot({ path: `../.preview/performance/${label}.png` });
  await writeFile(`../.preview/performance/${label}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  // Exercise the real Vite worker protocol against the same deterministic engine.
  // Small fixed positions test transport and parity, not opponent strength.
  const parity = await page.evaluate(async () => {
    const [{ BotSearch }, { chooseBotAction }, { createInitialGame, makeCardLibrary }, { cards, relics }] = await Promise.all([
      import('/src/engine/bot-search.ts'), import('/src/engine/bot.ts'),
      import('/src/engine/game.ts'), import('/src/data/cards.ts'),
    ]);
    const library = makeCardLibrary(cards, relics);
    const search = new BotSearch();
    const game = createInitialGame(cards, 'worker-parity', relics);
    game.phase = 'main'; game.mulligan = null; game.activePlayer = 1;
    game.players[1].mana = 3; game.players[1].maxMana = 3;
    game.players[1].hand = cards.filter(c => c.cost <= 3).slice(0, 3).map(c => c.id);
    const results = [];
    for (const skill of ['easy', 'normal', 'hard']) {
      const expected = chooseBotAction(game, library, 1, skill);
      const actual = await new Promise(resolve => search.search({ game, library, player: 1, skill }, resolve));
      results.push(JSON.stringify(expected) === JSON.stringify(actual));
    }
    // Keep the worker alive until the harness verifies that no fallback ran.
    window.__performanceSearch = search;
    return results;
  });
  assert(parity.every(Boolean), 'Worker must choose the same moves at every difficulty');
  assert.equal(page.workers().length, 1, 'The reusable search worker must remain alive (no synchronous fallback)');
  await page.evaluate(() => { window.__performanceSearch.dispose(); delete window.__performanceSearch; });
  await checkDeathMotion(browser,base);
  await checkPreviewFallback(browser,base);
  console.log('PASS  performance: bounded gallery, scrolling, mobile detail, covered animations, and worker parity');
} finally {
  await browser.close();
}
