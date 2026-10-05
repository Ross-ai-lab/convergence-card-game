import {describe,it,expect} from 'vitest';
import {loopWeights,foldLoopChannel} from './loop-mix';
describe('music loop preparation',()=>{
  it('keeps the original equal-power overlap sample for sample, without mutating source',()=>{
    const source=Float32Array.from({length:10000},(_,i)=>Math.sin(i*.003)*.3);const before=source.slice();
    const fade=3000,weights=loopWeights(fade),actual=foldLoopChannel(source,weights);
    const expected=source.slice(0,source.length-fade);
    for(let i=0;i<fade;i++)expected[i]=source[i]*Math.fround(Math.sin(i/fade*Math.PI/2))+source[expected.length+i]*Math.fround(Math.cos(i/fade*Math.PI/2));
    expect(actual).toEqual(expected);expect(source).toEqual(before);
    expect(actual[0]).toBe(source[actual.length]);
  });
});
