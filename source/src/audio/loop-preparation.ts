import type {LoopRequest,LoopResponse} from './loop-mix';
let worker:Worker|null=null,disabled=false,sequence=0;
let idle:ReturnType<typeof setTimeout>|undefined;
const jobs=new Map<number,{resolve:(channels:Float32Array[])=>void;reject:()=>void;timer:ReturnType<typeof setTimeout>}>();
function stop() {worker?.terminate();worker=null;clearTimeout(idle);}
function fail() {disabled=true;stop();for(const job of jobs.values()){clearTimeout(job.timer);job.reject();}jobs.clear();}
/** Sound processing has its own thread; it never competes with card effects. */
export async function prepareLoop(context:AudioContext,source:AudioBuffer,fade=2):Promise<AudioBuffer> {
  const fadeLength=Math.min(Math.floor(fade*source.sampleRate),Math.floor(source.length/3));
  if(!fadeLength)return source;
  let channels:Float32Array[];
  try {
    if(disabled)throw new Error('Worker unavailable');
    if(!worker){
      worker=new Worker(new URL('./loop.worker.ts',import.meta.url),{type:'module'});
      worker.onerror=event=>{event.preventDefault();fail();};worker.onmessageerror=fail;
      worker.onmessage=({data}:MessageEvent<LoopResponse>)=>{
        const job=jobs.get(data.id);jobs.delete(data.id);if(job){clearTimeout(job.timer);job.resolve(data.channels);}
        if(!jobs.size)idle=setTimeout(stop,30_000);
      };
    }
    clearTimeout(idle);
    const id=++sequence;
    // Never transfer the AudioBuffer's live storage or the seam comparison's source.
    const input=Array.from({length:source.numberOfChannels},(_,ch)=>source.getChannelData(ch).slice());
    channels=await new Promise< Float32Array[] >((resolve,reject)=>{
      jobs.set(id,{resolve,reject:()=>reject(new Error('Loop worker failed')),timer:setTimeout(fail,10_000)});
      const request:LoopRequest={id,channels:input,fadeLength};
      try{worker!.postMessage(request,input.map(channel=>channel.buffer));}catch{fail();}
    });
  } catch {
    // Preserve sound in browsers which refuse workers. Small blocks yield to UI.
    const head=new Float32Array(fadeLength),tail=new Float32Array(fadeLength);
    const yieldUI=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
    for(let start=0;start<fadeLength;start+=4096){
      for(let i=start;i<Math.min(start+4096,fadeLength);i++){const a=i/fadeLength*Math.PI/2;head[i]=Math.sin(a);tail[i]=Math.cos(a);}
      await yieldUI();
    }
    const length=source.length-fadeLength;channels=[];
    for(let ch=0;ch<source.numberOfChannels;ch++){
      const input=source.getChannelData(ch),output=input.slice(0,length);
      for(let start=0;start<fadeLength;start+=4096){
        for(let i=start;i<Math.min(start+4096,fadeLength);i++)output[i]=input[i]*head[i]+input[length+i]*tail[i];
        await yieldUI();
      }
      channels.push(output);
    }
  }
  const output=context.createBuffer(source.numberOfChannels,source.length-fadeLength,source.sampleRate);
  channels.forEach((channel,ch)=>output.copyToChannel(channel as Float32Array<ArrayBuffer>,ch));
  return output;
}
