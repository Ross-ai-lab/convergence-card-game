import assert from 'node:assert/strict';
import { launch, settleMotion } from './browser.mjs';
import { seedCampaignProgress } from './campaign-fixtures.mjs';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5177';
const browser = await launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('convergence.progress.v3')));
async function board() {
  await page.locator('.duel-intro').waitFor({ state: 'detached', timeout: 20000 });
  await page.locator('.mulligan-panel button.primary').click();
  await page.waitForFunction(() => window.__debug?.state().phase === 'main' && JSON.parse(localStorage.getItem('convergence.save.v29') ?? '{}').game?.phase === 'main');
}
async function finish(label = 'I win') {
  await page.getByRole('button', { name: 'DEV tools', exact: true }).click();
  await page.locator('.developer-search input').fill('John Wick');
  await page.locator('.developer-card-row').first().click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.result-overlay'));
}
async function collectPack() {
  await page.locator('.pack-veil').waitFor({ state: 'visible' });
  await settleMotion(page);
  for (let guard = 0; guard < 8; guard++) {
    const sealed = page.locator('.pack-box:not(.is-charged)');
    if (!await sealed.isVisible()) break;
    const label = await sealed.getAttribute('aria-label');
    await sealed.click({ force: true });
    await page.waitForFunction((label) => document.querySelector('.pack-box')?.getAttribute('aria-label') !== label, label);
  }
  await page.locator('.pack-collect:not([disabled])').click({ timeout: 25000 });
  await page.locator('.pack-stage').waitFor({ state: 'detached' });
}
try {
  await mkdir('../.preview/campaign', { recursive: true });
  await page.goto(base); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('convergence.progress.v2', '{"unlocked":216}'); localStorage.setItem('sound-test-preference', 'preserve'); }); await page.reload();
  await page.locator('.title-screen').waitFor();
  assert.equal((await progress()).unlockedIds.length, 30);
  assert.equal(await page.locator('.orbit-choice-easy, .orbit-choice-normal, .orbit-choice-hard, .daily-pack-trigger').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sound-test-preference')), 'preserve');
  await page.screenshot({ path: '../.preview/campaign/title.png' });
  await page.keyboard.type('Ross');
  await page.locator('.hotseat-trigger').click(); await page.locator('.hotseat-confirm-start').click();
  assert(await page.getByRole('dialog', { name: 'Two-player decks', exact: true }).isVisible());
  await page.getByRole('dialog', { name: 'Two-player decks', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.duel-trigger').click();
  assert.equal(await page.locator('.campaign-chapter button:not([disabled])').count(), 1);
  const lockedChapterCard = page.locator('[data-chapter="1"]');
  const lockedChapterText = await lockedChapterCard.textContent();
  assert(!lockedChapterText.includes('Tech fortifications'));
  assert(!lockedChapterText.includes('Recruit'));
  assert(!lockedChapterText.includes('first-win'));
  assert.equal(await lockedChapterCard.locator('details').count(), 0);
  assert(!(await page.locator('.campaign-panel').textContent()).includes('cards unlocked'));
  await page.getByRole('button', { name: 'Close campaign', exact: true }).click();
  await page.getByRole('button', { name: 'Starter deck', exact: true }).click();
  assert.equal(await page.locator('.deck-card').count(), 30);
  assert.deepEqual(await page.locator('.deck-curve span').allTextContents(), Array(10).fill('3'));
  assert.equal(await page.locator('.deck-card button:not([disabled])').count(), 0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: '../.preview/campaign/starter-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: '../.preview/campaign/chapters.png' });
  await page.getByRole('button', { name: 'Play chapter 1', exact: true }).click(); await board();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('convergence.save.v29')));
  assert.equal(saved.mode.kind, 'campaign'); assert.equal(saved.mode.chapter, 1);
  assert.equal(saved.game.playerDecks[0].deck.length, 27); assert.equal(saved.game.playerDecks[1].deck.length, 27);
  assert.equal(await page.locator('.campaign-hero .boss-portrait').getAttribute('alt'), 'GLaDOS portrait');
  assert((await page.locator('.campaign-hero .boss-chapter').textContent()).includes('Chapter 1'));
  await page.getByRole('button', { name: 'Inspect GLaDOS', exact: true }).click();
  assert(await page.getByRole('dialog', { name: 'GLaDOS card details' }).isVisible());
  assert(!(await page.getByRole('dialog', { name: 'GLaDOS card details' }).textContent()).includes('cards unlocked'));
  assert.equal((await progress()).unlockedIds.length, 30, 'Inspecting a locked boss cannot unlock it');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'GLaDOS card details' }).count(), 0);
  await page.evaluate(() => window.__debug.place('Modern Tank', 'me', 0));
  await page.locator('[aria-label="Player One\'s board"] .board-slot.ready').first().click();
  await page.locator('.campaign-hero.targetable').waitFor();
  assert.equal(await page.locator('.opponent-portrait-inspect').count(), 0, 'Portrait details must not intercept a core attack');
  const healthBefore = Number(await page.locator('.campaign-hero .health-gem').textContent());
  await page.locator('.campaign-hero .boss-portrait').click();
  assert(Number(await page.locator('.campaign-hero .health-gem').textContent()) < healthBefore);
  await page.reload(); await page.locator('.title-screen').waitFor(); await page.keyboard.type('Ross'); await page.locator('.continue-duel').click();
  assert.equal(await page.locator('.mulligan-panel').count(), 0);
  await finish();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('convergence.progress.v3')).completedChapters === 1);
  let record = await progress(); assert.equal(record.unlockedIds.length, 39); assert.equal(record.pendingRewards.length, 9);
  assert.equal(record.playerDeck.length, 30); assert.equal(record.selectedHeroPower, 'core_heal');
  await page.reload(); await page.locator('.pack-stage').waitFor(); assert.equal((await progress()).pendingRewards.length, 9);
  await collectPack(); assert.equal((await progress()).pendingRewards.length, 0);
  const resultCampaign = page.getByRole('button', { name: 'Campaign & deck', exact: true });
  if (await resultCampaign.isVisible().catch(() => false)) await resultCampaign.click();
  else await page.locator('.duel-trigger').click();
  const clearedChapterCard = page.locator('[data-chapter="1"]');
  assert.equal(await clearedChapterCard.locator('details[open]').count(), 1);
  assert((await clearedChapterCard.textContent()).includes('Rewards unlocked'));
  assert((await clearedChapterCard.textContent()).includes('GLaDOS'));
  await page.getByRole('button', { name: 'Close campaign', exact: true }).click();
  await page.getByRole('button', { name: 'My deck', exact: true }).click();
  await page.getByRole('button', { name: 'Remove John Wick', exact: true }).click();
  assert.equal((await progress()).playerDeck.length, 29);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  assert.equal(await page.locator('.campaign-chapter button:not([disabled])').count(), 0);
  await page.reload(); assert.equal((await progress()).playerDeck.length, 29);
  await page.locator('.title-screen').waitFor(); await page.keyboard.type('Ross');
  await page.locator('.deck-trigger').click();
  await page.getByLabel('Search unlocked cards').fill('GLaDOS');
  await page.getByRole('button', { name: 'Add GLaDOS', exact: true }).click();
  record = await progress(); assert.equal(record.playerDeck.length, 30); assert(record.playerDeck.includes('c104')); assert(!record.playerDeck.includes('c001'));
  await page.getByLabel('Search unlocked cards').fill('');
  await page.waitForFunction(() => [...document.querySelectorAll('.deck-card img')].filter((img) => {
    const rect = img.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight;
  }).every((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: '../.preview/campaign/deck-editor.png' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-chapter="1"] button').click(); await board(); await finish();
  assert.equal((await progress()).unlockedIds.length, 39); assert.equal((await progress()).completedChapters, 1);
  assert.equal(await page.locator('.pack-stage').count(), 0);
  await page.getByRole('button', { name: 'Campaign & deck', exact: true }).click();
  await page.getByRole('button', { name: 'Play chapter 2', exact: true }).click(); await board(); await finish('Enemy wins');
  assert.equal((await progress()).completedChapters, 1); assert.equal((await progress()).pendingRewards.length, 0);
  await page.goto(base); await seedCampaignProgress(page, 19);
  await page.keyboard.type('Ross');
  assert.equal(await page.locator('.orbit-choice-easy').count(), 0);
  await page.locator('.duel-trigger').click(); await page.getByRole('button', { name: 'Play chapter 20', exact: true }).click(); await board();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('convergence.save.v29')));
  assert.equal(saved.game.botCheats[1].foresight, true);
  await finish(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('convergence.progress.v3')).completedChapters === 20);
  assert.equal((await progress()).unlockedIds.length, 216); assert.deepEqual((await progress()).pendingRewards, ['c041']);
  await collectPack(); await page.getByRole('button', { name: 'Menu', exact: true }).click();
  assert.equal(await page.locator('.orbit-choice-easy, .orbit-choice-normal, .orbit-choice-hard').count(), 3);
  await page.screenshot({ path: '../.preview/campaign/completed.png' });
  await page.locator('.duel-trigger').click(); await board();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('convergence.save.v29')));
  assert.equal(saved.mode.kind, 'bot'); assert.equal(saved.game.playerDecks[1].deck.length + saved.game.players[1].hand.length, 30);
  assert.deepEqual(errors, []);
  console.log('PASS campaign: reset, gates, flat starter, resume, first win, durable pack, deck swaps, invalid draft, replay/loss, final reward and random free duel.');
} finally { await browser.close(); }
