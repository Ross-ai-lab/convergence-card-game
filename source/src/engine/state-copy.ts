import type {GameState} from './types';

const USE_NATIVE=Symbol('unsupported plain-state value');
/** The engine stores plain records and arrays. Reuse immutable primitives while
 * copying every mutable container, preserving aliases and sparse arrays.
 * Unsupported future payloads take the native path for the entire graph. */
export function copyGameState(state:GameState):GameState {
  const seen=new Map<object,unknown>();
  const copy=(value:unknown):unknown=>{
    if(typeof value==='function'||typeof value==='symbol')throw USE_NATIVE;
    if(value===null||typeof value!=='object')return value;
    const known=seen.get(value);if(known)return known;
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
    if(!array&&prototype!==Object.prototype&&prototype!==null)throw USE_NATIVE;
    const output=(array?new Array(value.length):{}) as Record<string,unknown>;
    seen.set(value,output);
    for(const key of Object.keys(value)) {
      const next=copy((value as Record<string,unknown>)[key]);
      if(key==='__proto__')Object.defineProperty(output,key,{value:next,writable:true,enumerable:true,configurable:true});
      else output[key]=next;
    }
    return output;
  };
  try{return copy(state) as GameState;}catch(error){if(error!==USE_NATIVE)throw error;return structuredClone(state);}
}
