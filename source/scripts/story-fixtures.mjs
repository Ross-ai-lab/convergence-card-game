/** Dismiss only the real story UI; never alter progress or skip reward logic. */
export async function skipCampaignDialogue(page) {
  for (let index = 0; index < 3; index++) {
    const speech = page.locator('[data-story-key]');
    if (!await speech.count()) return;
    const key = await speech.getAttribute('data-story-key');
    await speech.locator('[data-story-skip]').click();
    await page.waitForFunction(key => document.querySelector('[data-story-key]')?.getAttribute('data-story-key') !== key, key);
  }
}
