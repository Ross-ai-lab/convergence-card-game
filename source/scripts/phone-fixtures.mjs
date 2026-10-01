import assert from 'node:assert/strict';

/** Touch readers must remain open after the same finger is released. */
export async function holdCard(page, locator, dialogName, webKit = false) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const point = {x:box.x+box.width/2,y:box.y+box.height/2};
  if (webKit) {
    await locator.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:point.x,clientY:point.y});
    await page.getByRole('dialog',{name:dialogName,exact:true}).waitFor({timeout:2000});
    await locator.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:point.x,clientY:point.y});
    await locator.dispatchEvent('click');
  } else {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await page.getByRole('dialog',{name:dialogName,exact:true}).waitFor({timeout:2000});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } finally { await session.detach(); }
  }
  assert(await page.getByRole('dialog',{name:dialogName,exact:true}).isVisible(), 'Releasing a long press closed the reader');
}

/** Desktop emulation exercises the manual fallback, since it cannot physically rotate. */
export async function manualRotationBrowser(context, {missingApi = false} = {}) {
  await context.addInitScript((missingApi) => {
    window.__landscapeRequests = 0;
    if (missingApi) {
      Element.prototype.requestFullscreen = undefined;
      Object.defineProperty(Document.prototype,'fullscreenElement',{get:()=>undefined});
      return;
    }
    Element.prototype.requestFullscreen = () => {
      window.__landscapeRequests++;
      return Promise.reject(new DOMException('Fullscreen unavailable in this browser', 'NotSupportedError'));
    };
  },missingApi);
}

export async function resizePhone(page,width,height,webKit = false) {
  if (!webKit) {
    const session = await page.context().newCDPSession(page);
    const {windowId,bounds} = await session.send('Browser.getWindowForTarget');
    if (bounds.windowState !== 'normal') await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
    await session.detach();
  }
  await page.setViewportSize({width,height});
}

export async function rotateForDuel(page,width,height,webKit = false) {
  if (Math.min(width,height)<=600) assert(await page.evaluate(() => !document.documentElement.requestFullscreen || window.__landscapeRequests > 0), 'Starting a phone duel did not request landscape fullscreen');
  if (Math.min(width,height)<=600 && height>width) {
    await page.getByRole('dialog',{name:'Landscape mode required',exact:true}).waitFor();
    assert.equal(await page.locator('.mobile-end-turn').count(),0,'Portrait gate exposes End Turn');
    await resizePhone(page,height,width,webKit);
    await page.getByRole('dialog',{name:'Landscape mode required',exact:true}).waitFor({state:'detached'});
  }
}
