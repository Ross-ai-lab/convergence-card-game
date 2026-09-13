/** Advance real dialogue using its sole forward button. */
export async function skipCampaignDialogue(page) {
  for(let phase=0;phase<3;phase++){
    const speech=page.locator('[data-story-key]');if(!await speech.count())return;
    const key=await speech.getAttribute('data-story-key');
    await speech.locator('.campaign-speech-text').click();
    await speech.locator('[data-story-continue]').click();
    await page.waitForFunction(key=>document.querySelector('[data-story-key]')?.getAttribute('data-story-key')!==key,key);
  }
}
