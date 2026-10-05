import {loopWeights,foldLoopChannel,type LoopRequest} from './loop-mix';
self.onmessage=({data}:MessageEvent<LoopRequest>)=>{
  const weights=loopWeights(data.fadeLength);
  const channels=data.channels.map(channel=>foldLoopChannel(channel,weights));
  self.postMessage({id:data.id,channels},{transfer:channels.map(channel=>channel.buffer)});
};
