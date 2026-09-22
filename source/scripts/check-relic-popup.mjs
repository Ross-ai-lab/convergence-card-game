import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launch } from './browser.mjs';
import { seedCampaignProgress } from './campaign-fixtures.mjs';

export async function checkRelicPopup(base = 'http://localhost:5177') {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(base);
    await seedCampaignProgress(page);
    for (const multi of [false, true]) {
      await page.evaluate(async (multi) => {
        const { cards, relics } = await import('/src/data/cards.ts');
        const { createInitialGame } = await import('/src/engine/game.ts');
        const { spawnTestMinion } = await import('/src/engine/test-utils.ts');
        const { saveGame } = await import('/src/storage.ts');
        const g = createInitialGame(cards, 'relic-popup', relics);
        g.phase = 'main'; g.mulligan = null; g.activePlayer = 1;
        g.players[1].name = 'Gilgamesh';
        g.players[1].mana = 10; g.players[1].maxMana = 10;
        g.heroPowers = [null, null];
        g.botCheats = [null, { readsYourReply: false, trueDice: false, clairvoyance: false, foresight: false }];
        const names = ['Elder wand', 'Ea', 'Necronomicon'];
        const ids = names.map(name => relics.find(r => r.name === name).id);
        g.deck = []; g.bottomDeck = [];
        g.playerDecks = [{ deck: [], bottomDeck: [] }, { deck: ids, bottomDeck: [] }];
        g.players[1].hand = [multi ? cards.find(c => c.name === 'The 7 Heroic Spirits').id : ids[0]];
        g.players[1].board = [0, 1, 2, 3].map((slot) => slot < (multi ? 3 : 1)
          ? spawnTestMinion(cards.find(c => c.effectId === 'none'), 1, { instanceId: `popup-bearer-${slot}`, sleeping: true, attacksUsed: 1 }) : null);
        saveGame(g, [], { kind: 'campaign', chapter: 1, skill: 'easy' }, Date.now());
      }, multi);
      await page.reload();
      await page.evaluate(() => {
        window.popupRecords = [];
        window.popupTimerDelays = [];
        window.popupTimerElapsed = [];
        const nativeSetTimeout = window.setTimeout;
        window.setTimeout = function (handler, delay, ...args) {
          const popupVisible = Boolean(document.querySelector('.relic-play-flash'));
          if (popupVisible) window.popupTimerDelays.push(Number(delay));
          if (!popupVisible || typeof handler !== 'function') {
            return nativeSetTimeout.call(window, handler, delay, ...args);
          }
          const scheduledAt = performance.now();
          const wrappedHandler = function (...callbackArgs) {
            if (Number(delay) === 2000) window.popupTimerElapsed.push(performance.now() - scheduledAt);
            return handler.apply(this, callbackArgs);
          };
          return nativeSetTimeout.call(window, wrappedHandler, delay, ...args);
        };
        const seen = new Map();
        new MutationObserver(() => {
          for (const el of document.querySelectorAll('.relic-play-flash')) {
            if (seen.has(el)) continue;
            const card = el.querySelector('.card-face');
            const rect = card.getBoundingClientRect();
            const record = { name: el.textContent, width: rect.width, height: rect.height, start: performance.now(), end: null,
              bearer: el.dataset.bearer || el.closest('[data-instance]')?.dataset.instance };
            seen.set(el, record); window.popupRecords.push(record);
          }
          for (const [el, record] of seen) if (!el.isConnected && record.end === null) record.end = performance.now();
        }).observe(document.body, { childList: true, subtree: true });
      });
      await page.locator('.continue-duel').click();
      await page.waitForFunction(() => window.popupRecords.length > 0, { timeout: 15000 });
      if (process.env.RELIC_SCREENSHOT) {
        await fs.mkdir('../.preview/relic-popup', { recursive: true });
        await page.screenshot({ path: `../.preview/relic-popup/${multi ? 'multiple' : 'single'}.png` });
      }
      await page.waitForFunction(count => window.popupRecords.filter(r => r.end !== null).length >= count, multi ? 3 : 1, { timeout: 15000 });
      const { records, popupTimerDelays, popupTimerElapsed } = await page.evaluate(() => ({
        records: window.popupRecords,
        popupTimerDelays: window.popupTimerDelays,
        popupTimerElapsed: window.popupTimerElapsed,
      }));
      console.log(JSON.stringify({ multi, records, popupTimerDelays, popupTimerElapsed }));
      assert.equal(records.length, multi ? 3 : 1, 'every equipped relic appears exactly once');
      assert.equal(
        popupTimerDelays.filter((delay) => delay === 2000).length,
        multi ? 3 : 1,
        'each visible relic has a 2,000 ms removal timer',
      );
      assert.equal(popupTimerElapsed.length, multi ? 3 : 1, 'each removal timer fired');
      for (const elapsed of popupTimerElapsed) {
        assert.ok(elapsed >= 1950, `timer elapsed at least 1,950 ms: ${elapsed}`);
      }
      for (const name of multi ? ['Elder wand', 'Ea', 'Necronomicon'] : ['Elder wand']) {
        assert.equal(records.filter(r => r.name.includes(name)).length, 1, `actual relic card: ${name}`);
      }
      for (const r of records) {
        assert.ok(r.width >= 180 && r.height >= 250, `visible full card: ${r.width} x ${r.height}`);
        assert.ok(r.bearer?.startsWith('popup-bearer-'), 'exact bearer');
      }
      if (multi) assert.equal(new Set(records.map(r => r.bearer)).size, 3);
    }
  } finally { await browser.close(); }
}

if (process.argv[1]?.endsWith('check-relic-popup.mjs')) await checkRelicPopup(process.argv[2]);
