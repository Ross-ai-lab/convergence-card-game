/** Full-roster layout coverage, called by the feature suite, with no extra command. */
export async function checkProfileLayouts(page, geometryOf, fits, check) {
  await page.locator('.gallery-search').fill('');
  const total = Number(await page.locator('.gallery-count').textContent());
  await page.locator('.gallery-card-name').first().click();
  await page.locator('.gallery-detail-panel').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const sizes = [[1920, 1080], [1536, 736], [1001, 700], [768, 1024], [390, 844], [360, 740], [360, 550], [390, 550], [320, 568], [568, 320], [667, 375]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const measured = await page.evaluate(async ({total,source}) => {
      const measure=Function(`return (${source})`)();
      const samples=[];
      for(let index=0;index<total;index++) {
        const panel=document.querySelector('.gallery-detail-panel');
        const name=panel.querySelector('.gdx-title h2').textContent;
        // Yield only while the fit observer is settling a changed layout.
        // Awaiting paints for every profile throttles hidden/headless browsers.
        let geometry=measure(panel);
        for(let attempt=0;geometry.outside>1&&attempt<20;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,16));
          geometry=measure(panel);
        }
        const close=panel.querySelector('.gallery-detail-close').getBoundingClientRect();
        samples.push({name,...geometry,closeVisible:close.top>=0&&close.left>=0&&close.bottom<=innerHeight&&close.right<=innerWidth});
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>{observer.disconnect();reject(new Error(`Profile navigation stuck at ${name}`));},2000);
          const observer=new MutationObserver(()=>{
            if(panel.querySelector('.gdx-title h2').textContent!==name){clearTimeout(timeout);observer.disconnect();resolve();}
          });
          observer.observe(panel,{subtree:true,characterData:true,childList:true});
          window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        });
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      return samples;
    },{total,source:geometryOf.toString()});
    const failures=measured.filter(geometry=>!fits(geometry)||!geometry.closeVisible);
    check(`all ${total} profiles fit at ${width} × ${height}`, failures.length === 0,
      failures.length ? JSON.stringify(failures.slice(0, 5)) : 'no overflow, clipped sections, or card overlap');
    if (height<=568 && width<=390) await page.screenshot({path:`../.preview/new-features/profile-${width}x${height}.png`});
  }
  await page.getByLabel('Close Star Chart').click();
}
