import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Observe live animation; do not settle it or disable it for this check. */
export async function checkCampaignMotion(page) {
  const images = page.locator('.campaign-chapter > img');
  await images.first().evaluate(img => img.decode());
  await images.nth(1).evaluate(img => img.decode());
  const layout = () => page.locator('.campaign-chapter').evaluateAll(cards => cards.slice(0,4).map(card => {
    const box = card.getBoundingClientRect(), image = card.querySelector('img').getBoundingClientRect(), button = card.querySelector('button').getBoundingClientRect();
    return [box.x,box.y,box.width,box.height,image.width,image.height,button.bottom-box.bottom];
  }));
  const baseline = await layout();
  const hashes = [];
  for (let sample = 0; sample < 12; sample++) {
    const geometry = await layout();
    assert(geometry.every((row,i)=>row.every((value,j)=>Math.abs(value-baseline[i][j])<.5)), 'Boss tiles change size while idle');
    assert(geometry.every(row=>row[6]<=0), 'A boss action is clipped by its tile');
    const frames = [];
    for (let i=0;i<2;i++) frames.push(createHash('sha256').update(await images.nth(i).screenshot()).digest('hex'));
    hashes.push(frames.join(':'));
    await page.waitForTimeout(400);
  }
  assert.equal(new Set(hashes).size, 1, 'Boss portraits change or flicker while idle');
}
