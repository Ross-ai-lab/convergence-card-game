import {applyAction,getLegalActions,type CardLibrary} from './game';
import type {GameState,GameEvent,PlayerId} from './types';

/** Finish a committed choice, or cancel an uncommitted play, then pass legally. */
export function expirePlayerTurn(original:GameState,player:PlayerId,library:CardLibrary):{state:GameState;events:GameEvent[]} {
  let state=original;const events:GameEvent[]=[];
  for(let guard=0;guard<256;guard++) {
    if(state.phase==='gameOver'||state.activePlayer!==player)return{state,events};
    const legal=getLegalActions(state,library);
    const action=state.phase==='main'?legal.find(action=>action.type==='end_turn'&&action.player===player)
      :legal.find(action=>action.type==='cancel_target'&&action.player===player)
        ??legal.find(action=>(action.type==='choose_target'||action.type==='choose_draw')&&action.player===player);
    if(!action)return{state,events};
    const result=applyAction(state,action,library,legal);if(result.state===state)return{state,events};
    state=result.state;events.push(...result.events);
    if(action.type==='end_turn')return{state,events};
  }
  throw new Error('Turn timeout exceeded the bounded choice-resolution queue');
}
