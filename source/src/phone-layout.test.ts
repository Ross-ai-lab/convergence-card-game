import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPhoneViewport, requestPhoneLandscape } from './phone-layout';

afterEach(() => vi.unstubAllGlobals());
describe('phone landscape', () => {
  it('identifies rotated phones without gating a desktop or full-size tablet', () => {
    expect(isPhoneViewport(390,844,true)).toBe(true);
    expect(isPhoneViewport(844,390,true)).toBe(true);
    expect(isPhoneViewport(390,844,false)).toBe(false);
    expect(isPhoneViewport(768,1024,true)).toBe(false);
  });
  it('requests fullscreen then locks landscape from the play action', async () => {
    const calls: string[] = [];
    vi.stubGlobal('document',{fullscreenElement:null,documentElement:{requestFullscreen:async()=>{calls.push('fullscreen');}}});
    vi.stubGlobal('screen',{orientation:{lock:async(value:string)=>{calls.push(value);}}});
    await requestPhoneLandscape(true);
    expect(calls).toEqual(['fullscreen','landscape']);
  });
  it('handles a browser rejection without breaking the rotate fallback', async () => {
    vi.stubGlobal('document',{fullscreenElement:null,documentElement:{requestFullscreen:async()=>{throw new Error('not supported');}}});
    await expect(requestPhoneLandscape(true)).resolves.toBeUndefined();
    await expect(requestPhoneLandscape(false)).resolves.toBeUndefined();
  });
});
