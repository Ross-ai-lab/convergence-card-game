import {describe,it,expect} from 'vitest';
import {cards,relics} from '../data/cards';
import {applyAction,createInitialGame,makeCardLibrary} from './game';
import {expirePlayerTurn} from './turn-timeout';
import {spawnTestMinion} from './test-utils';
const library=makeCardLibrary(cards,relics);
const id=(name:string)=>cards.find(c=>c.name===name)!.id;
function main(){const s=createInitialGame(cards,'timeout',relics);s.phase='main';s.mulligan=null;s.drawChoice=null;s.activePlayer=0;s.players[0].mana=10;s.players[0].board.fill(null);s.players[1].board.fill(null);return s;}
describe('expired human turns resolve through legal actions',()=>{
  it('passes an ordinary turn without changing the original state',()=>{
    const s=main(),original=structuredClone(s),result=expirePlayerTurn(s,0,library);
    expect(result.state.activePlayer).toBe(1);expect(s).toEqual(original);expect(result.events.length).toBeGreaterThan(0);
  });
  it('cancels an uncommitted targeted play before passing',()=>{
    const s=main();s.players[0].hand=[id('Batman')];s.players[1].board[0]=spawnTestMinion(cards.find(c=>c.id===id('John Wick'))!,1);
    const asking=applyAction(s,{type:'play_card',player:0,handIndex:0,slotIndex:0},library).state;
    const result=expirePlayerTurn(asking,0,library);expect(result.state.activePlayer).toBe(1);expect(result.state.pendingTarget).toBeNull();
  });
  it('finishes a committed Discover choice before passing',()=>{
    const s=main();s.players[0].hand=[id('Indiana Jones')];
    const asking=applyAction(s,{type:'play_card',player:0,handIndex:0,slotIndex:0},library).state;
    expect(asking.phase).toBe('targeting');
    // A queued/automatic Discover has no return-to-hand transaction.
    delete asking.pendingTarget!.cancelPlay;
    const result=expirePlayerTurn(asking,0,library);expect(result.state.activePlayer).toBe(1);expect(result.state.pendingTarget).toBeNull();
    expect(result.state.players[0].hand.some(c=>c.startsWith('r'))).toBe(true);
  });
  it('cannot pass the opponent turn or a finished game',()=>{
    const s=main();expect(expirePlayerTurn(s,1,library).state).toBe(s);
    s.phase='gameOver';s.winner=0;expect(expirePlayerTurn(s,0,library).state).toBe(s);
  });
});
