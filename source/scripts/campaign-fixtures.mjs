/** Test-only progression setup, using the same first-clear transactions as the app. */
export async function seedCampaignProgress(page, cleared = 20, { boardDeck = false } = {}) {
  await page.evaluate(async ({ cleared, boardDeck }) => {
    const progressModule = await import('/src/progress.ts');
    const { CAMPAIGN_CHAPTERS, CAMPAIGN_DIFFICULTIES } = await import('/src/campaign.ts');
    let progress = progressModule.emptyProgress();
    for (const chapter of CAMPAIGN_CHAPTERS.slice(0, cleared)) {
      progress = progressModule.finishDuel(progress, {
        winner: 0, viewerId: 0, turns: 20, at: chapter.chapter,
        mode: { kind: 'campaign', chapter: chapter.chapter,
          skill: CAMPAIGN_DIFFICULTIES[chapter.difficultyId].botSkill, duelId: `fixture-${chapter.chapter}` },
      }, { seen: [], played: [] });
    }
    if (boardDeck) {
      const { cards, relics } = await import('/src/data/cards.ts');
      // Board-effect tests need enough relics left for three-option discoveries,
      // independent of which cards the opening shuffle dealt into hand.
      const tech = cards.filter((card) => card.camp === 'Tech').slice(0, 8);
      const techIds = new Set(tech.map((card) => card.id));
      const others = cards.filter((card) => !techIds.has(card.id)).slice(0, 12);
      const deck = [...tech, ...others, ...relics.slice(0, 10)].map((card) => card.id);
      progress = progressModule.saveDeckDraft(progress, deck, 0);
      progress = progressModule.saveDeckDraft(progress, deck, 1);
    }
    progressModule.saveProgress(progressModule.acknowledgeRewards(progress));
  }, { cleared, boardDeck });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.title-screen').waitFor();
}
