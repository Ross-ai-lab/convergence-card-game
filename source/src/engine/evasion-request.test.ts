import {it,expect} from 'vitest';
import {cards,relics} from '../data/cards';
import {createInitialGame,applyAction,makeCardLibrary} from './game';
import {spawnTestMinion} from './test-utils';
const library=makeCardLibrary(cards,relics);
it.each([['Bigfoot',6198,true],['Bigfoot',6400,false],['Sans',9408,true],['Sans',9776,false]] as const)('%s uses its exact evasion boundary',(name,seed,evades)=>{
  const game=createInitialGame(cards,'evasion-boundary',relics);game.phase='main';game.mulligan=null;game.activePlayer=0;game.rngSeed=seed;
  game.players[0].board[0]=spawnTestMinion(cards[0],0,{atk:1,hp:10,maxHp:10,sleeping:false,effectId:'none',keywords:[]});
  game.players[1].board[0]=spawnTestMinion(cards.find(c=>c.name===name)!,1,{hp:10,maxHp:10});
  const result=applyAction(game,{type:'attack_minion',player:0,attackerSlot:0,targetSlot:0},library);
  expect(result.state.players[1].board[0]!.hp).toBe(evades?10:9);
});
it('Kureo has the requested printed 2/2 stats',()=>expect(cards.find(c=>c.name==='Kureo Mado')).toMatchObject({atk:2,hp:2}));
