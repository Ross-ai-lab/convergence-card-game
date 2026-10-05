/** Equal-power tail/head overlap, shared by the worker and compatibility path. */
export function loopWeights(length:number):[Float32Array,Float32Array] {
  const head=new Float32Array(length),tail=new Float32Array(length);
  for(let i=0;i<length;i++){const angle=i/length*Math.PI/2;head[i]=Math.sin(angle);tail[i]=Math.cos(angle);}
  return [head,tail];
}
export function foldLoopChannel(input:Float32Array,weights:[Float32Array,Float32Array]):Float32Array {
  const [head,tail]=weights;const length=input.length-head.length;
  const output=input.slice(0,length);
  for(let i=0;i<head.length;i++)output[i]=input[i]*head[i]+input[length+i]*tail[i];
  return output;
}
export interface LoopRequest {id:number;channels:Float32Array[];fadeLength:number}
export interface LoopResponse {id:number;channels:Float32Array[]}
