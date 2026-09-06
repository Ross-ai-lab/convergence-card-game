/** Full-roster layout coverage, called by the feature suite, with no extra command. */
export async function checkProfileLayouts(page, geometryOf, fits, check) {
  await page.locator('.gallery-search').fill('');
  const total = Number(await page.locator('.gallery-count').textContent());
  await page.locator('.gallery-cell').first().click();
  await page.locator('.gallery-detail-panel').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const sizes = [[1920, 1080], [1536, 736], [1001, 700], [768, 1024], [390, 844], [360, 740]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const failures = [];
    for (let index = 0; index < total; index++) {
      const name = await page.locator('.gdx-title h2').textContent();
      const geometry = await page.locator('.gallery-detail-panel').evaluate(geometryOf);
      if (!fits(geometry)) failures.push({ name, ...geometry });
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(previous => document.querySelector('.gdx-title h2')?.textContent !== previous, name);
    }
    check(`all ${total} profiles fit at ${width} × ${height}`, failures.length === 0,
      failures.length ? JSON.stringify(failures.slice(0, 5)) : 'no overflow, clipped sections, or card overlap');
  }
  await page.getByLabel('Close Star Chart').click();
}
