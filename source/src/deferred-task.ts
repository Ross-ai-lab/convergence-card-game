/** Coalesce replaceable work and flush the latest value when leaving a page. */
export class DeferredTask {
  private pending:(()=>void)|null=null;
  private cancel:(()=>void)|null=null;
  private schedule:(run:()=>void)=>()=>void;
  constructor(schedule:(run:()=>void)=>()=>void) {this.schedule=schedule;}
  queue(run:()=>void) {
    this.pending=run;
    if(!this.cancel)this.cancel=this.schedule(()=>this.flush());
  }
  flush=()=>{
    const run=this.pending;
    this.discard();
    run?.();
  };
  discard() {
    this.cancel?.();this.cancel=null;this.pending=null;
  }
}
export function scheduleIdle(run:()=>void):()=>void {
  if(typeof window.requestIdleCallback==='function') {
    const id=window.requestIdleCallback(run,{timeout:200});
    return()=>window.cancelIdleCallback(id);
  }
  const id=window.setTimeout(run,32);
  return()=>window.clearTimeout(id);
}
