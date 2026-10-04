import {describe,it,expect} from 'vitest';
import {cards,relics} from './data/cards';
import {createInitialGame,makeCardLibrary,getLegalActions,applyAction} from './engine/game';
import {TUTORIAL_LESSONS,tutorialAllowsAction,nextTutorialStep,tutorialOpponentAction} from './tutorial';
const library=makeCardLibrary(cards,relics);

describe('guided training duel',()=>{
  it('finishes every lesson through real legal actions, with each gadget choice',()=>{
    for(const gadget of [0,1,2]) {
      let state=createInitialGame(cards,'training',relics,{tutorial:true,heroPowers:['minion_hp',null]});
      expect(state.mulligan).toBeNull();expect(state.players[0].hand).toEqual(['c169','c005','r035']);
      let step=1,guard=0;
      while(step<TUTORIAL_LESSONS.length&&guard++<60) {
        const legal=getLegalActions(state,library);
        const student=state.activePlayer===0;
        const allowed=legal.filter(action=>tutorialAllowsAction(step,state,action));
        const action=student ? (state.pendingTarget?.options.length===3?allowed[gadget]??allowed[0]:allowed[0]) : tutorialOpponentAction(state,legal);
        expect(action,`Step ${step}, phase ${state.phase}`).toBeDefined();
        const result=applyAction(state,action!,library);
        expect(result.state).not.toBe(state);
        step=nextTutorialStep(step,action!,result.state);state=result.state;
      }
      expect(step).toBe(TUTORIAL_LESSONS.length);
      expect(state.players[1].health).toBe(29);
      const batman=state.players[0].board.find(minion=>minion?.cardId==='c005');
      expect(batman?.relic?.id==='r035').toBe(true);
      expect(batman?.hp).toBeGreaterThan(0);
    }
  });
  it('keeps unrelated plays and premature passing outside the current lesson',()=>{
    const state=createInitialGame(cards,'training',relics,{tutorial:true});
    expect(tutorialAllowsAction(0,state,{type:'end_turn',player:0})).toBe(false);
    expect(tutorialAllowsAction(1,state,{type:'end_turn',player:0})).toBe(false);
    expect(tutorialAllowsAction(1,state,{type:'play_card',player:0,handIndex:1,slotIndex:0})).toBe(false);
    expect(tutorialAllowsAction(1,state,{type:'play_card',player:0,handIndex:0,slotIndex:0})).toBe(true);
  });
});
