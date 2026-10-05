import {it,expect,vi,afterEach} from 'vitest';
import {loopWeights,foldLoopChannel} from './loop-mix';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('preserves both channels and the seamless overlap when a browser refuses workers',async()=>{
  vi.resetModules();vi.useFakeTimers();vi.stubGlobal('Worker',undefined);
  const {prepareLoop}=await import('./loop-preparation');
  const channels=[Float32Array.from({length:900},(_,i)=>Math.sin(i*.1)),Float32Array.from({length:900},(_,i)=>Math.cos(i*.1))];
  const source={numberOfChannels:2,length:900,sampleRate:300,getChannelData:(ch:number)=>channels[ch]} as AudioBuffer;
  const copied:Float32Array[]=[];
  const context={createBuffer:(count:number,length:number,rate:number)=>({numberOfChannels:count,length,sampleRate:rate,copyToChannel:(data:Float32Array,ch:number)=>copied[ch]=data.slice()})} as unknown as AudioContext;
  const pending=prepareLoop(context,source,2);await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({numberOfChannels:2,length:600,sampleRate:300});
  for(let ch=0;ch<2;ch++)expect(copied[ch]).toEqual(foldLoopChannel(channels[ch],loopWeights(300)));
  expect(channels[0].length).toBe(900);
});
