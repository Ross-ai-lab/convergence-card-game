import {describe,it,expect,vi} from 'vitest';
import {DeferredTask} from './deferred-task';
describe('deferred latest save',()=>{
  it('writes the latest state once, including changes made before idle time',()=>{
    let tick=()=>{};const cancel=vi.fn();const schedule=vi.fn((run:()=>void)=>{tick=run;return cancel;});
    const queue=new DeferredTask(schedule);const old=vi.fn(),latest=vi.fn();
    queue.queue(old);queue.queue(latest);expect(schedule).toHaveBeenCalledOnce();
    tick();expect(old).not.toHaveBeenCalled();expect(latest).toHaveBeenCalledOnce();
    queue.flush();expect(latest).toHaveBeenCalledOnce();
  });
  it('flushes on leaving and cannot resurrect a cleared duel',()=>{
    let tick=()=>{};const queue=new DeferredTask(run=>{tick=run;return vi.fn();});const write=vi.fn();
    queue.queue(write);queue.flush();tick();expect(write).toHaveBeenCalledOnce();
    queue.queue(write);queue.discard();tick();expect(write).toHaveBeenCalledOnce();
  });
});
