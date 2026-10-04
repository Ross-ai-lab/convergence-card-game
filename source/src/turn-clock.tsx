import {useEffect,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';

export const PLAYER_TURN_MS=100_000;
export const humanTurnKey=(duelId:string|undefined,player:number,turnsStarted:number)=>`${duelId??'resumed'}:${player}:${turnsStarted}`;
export interface SavedTurnClock {key:string;remainingMs:number;deadline:number|null}

/** One deadline per human turn. Pauses preserve the budget; actions do not reset it. */
export class TurnClock {
  private snapshot:SavedTurnClock|null;
  private listeners=new Set<()=>void>();
  constructor(saved?:SavedTurnClock|null,now=Date.now()) {
    this.snapshot=saved?{key:saved.key,remainingMs:Math.min(PLAYER_TURN_MS,Math.max(0,saved.deadline===null?saved.remainingMs:saved.deadline-now)),deadline:null}:null;
  }
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  update(key:string|null,running:boolean,now:number) {
    let next=this.snapshot;
    if(key!==null&&key!==next?.key)next={key,remainingMs:PLAYER_TURN_MS,deadline:null};
    if(next&&running&&key!==null&&next.deadline===null)next={...next,deadline:now+next.remainingMs};
    if(next&&!running&&next.deadline!==null)next={...next,remainingMs:Math.max(0,next.deadline-now),deadline:null};
    if(next===this.snapshot)return;
    this.snapshot=next;for(const listener of this.listeners)listener();
  }
}

/** Only this small component ticks, and only during the final fifteen seconds. */
export function TurnClockWarning({clock}:{clock:TurnClock}) {
  const value=useSyncExternalStore(clock.subscribe,clock.getSnapshot,clock.getSnapshot);
  const [seconds,setSeconds]=useState<number|null>(null);
  useEffect(()=>{
    if(!value?.deadline){setSeconds(null);return;}
    let ticker:ReturnType<typeof setInterval>|undefined;
    const update=()=>{const left=Math.max(0,Math.ceil((value.deadline!-Date.now())/1000));setSeconds(left<=15?left:null);};
    update();
    const start=setTimeout(()=>{update();ticker=setInterval(update,200);},Math.max(0,value.deadline-Date.now()-15_000));
    return()=>{clearTimeout(start);if(ticker)clearInterval(ticker);};
  },[value]);
  if(seconds===null||value?.deadline===null)return null;
  return createPortal(<div className={`turn-countdown${seconds<=3?' is-critical':''}`} role="timer" aria-label={`${seconds} seconds left in your turn`}><small>Turn ending</small><strong>{seconds}s</strong></div>,document.body);
}
