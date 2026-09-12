import {describe,expect,it} from 'vitest';
import {cards,relics} from '../data/cards';
import {applyAction,createInitialGame,effectiveCardCost,makeCardLibrary} from './game';
import {spawnTestMinion} from './test-utils';
import type {EffectId,GameState,MinionInstance,PlayerId} from './types';

const library=makeCardLibrary(cards,relics);
const card=(id:string)=>cards.find(c=>c.id===id)!;
const minion=(id:string,owner:PlayerId,overrides:Partial<MinionInstance>={})=>spawnTestMinion(card(id),owner,overrides);
function state(seed:string):GameState{const s=createInitialGame(cards,seed,relics);s.phase='main';s.drawChoice=null;s.activePlayer=0;return s;}
function nextTurn(s:GameState){let n=applyAction(s,{type:'end_turn',player:s.activePlayer},library).state;while(n.phase==='drawChoice'&&n.drawChoice)n=applyAction(n,{type:'choose_draw',player:n.drawChoice.player,choiceIndex:0},library).state;return n;}

describe('requested card revision',()=>{
  it.each([
    ['c077',1,0,5],['c007',5,5,5],['c163',4,3,3],['c149',3,3,2],['c164',2,2,2],['c161',3,2,2],
    ['c098',7,6,6],['c083',8,6,6],['c021',6,3,3],['c026',8,6,6],['c101',9,4,4],['c133',5,3,3],
    ['c084',7,4,6],['c126',4,2,2],['c039',3,3,3],['c127',4,3,1],['c061',5,1,1],['c136',6,6,6],['c006',4,3,3],['c031',4,4,4],
  ] as const)('%s has the requested mana and printed stats',(id,cost,atk,hp)=>expect(card(id)).toMatchObject({cost,atk,hp}));
  it('keeps the requested names, origins and clarified rules',()=>{
    expect(card('c001').origin).toBe('John Wick');expect(card('c043').origin).toBe('Watchmen');expect(card('c002').origin).toBe('DCEU');
    expect(card('c072').name).toBe('Genie');expect(card('c103').name).toBe('Military Fort');
    expect(card('c061').effect).toBe('Battlecry: Summon a random minion from your deck');
    expect(card('c077')).toMatchObject({effectId:'none',keywords:['Taunt'],effect:'Taunt'});
    expect(card('c133').effect).not.toContain('minimum 1');
  });
  it.each(['dodge_50','dodge_80','evade_first_attack','evade_allies_33','kaku_evade_counter','korosensei_defense'] as EffectId[])('Nyan bypasses %s without defensive evasion rolls',(effectId)=>{
    for(let seed=1;seed<=12;seed++){
      const s=state(`nyan-${effectId}-${seed}`);
      s.players[0].board[0]=minion('c127',0,{atk:5,hp:10,maxHp:10,sleeping:false});
      s.players[1].board[0]=minion('c004',1,{atk:0,hp:20,maxHp:20,effectId,keywords:[],divineShield:false});
      const n=applyAction(s,{type:'attack_minion',player:0,attackerSlot:0,targetSlot:0},library).state;
      expect(n.players[1].board[0]?.hp).toBe(15);
      expect(n.players[0].board[0]?.hp).toBe(10);
    }
  });
  it('Nyan bypasses relic evasion but still respects Divine Shield',()=>{
    const s=state('nyan-relic');s.players[0].board[0]=minion('c127',0,{sleeping:false});
    const relic=relics.find(r=>r.relicId==='evade_50')!;
    s.players[1].board[0]=minion('c001',1,{atk:0,hp:20,maxHp:20,divineShield:true,relic:{...relic}});
    const n=applyAction(s,{type:'attack_minion',player:0,attackerSlot:0,targetSlot:0},library).state;
    expect(n.players[1].board[0]).toMatchObject({hp:20,divineShield:false});
  });
  it('Doofenshmirtz either dies or doubles damaged current and maximum stats',()=>{
    let won=false,lost=false;
    for(let seed=1;seed<=24;seed++){
      const s=state(`doof-double-${seed}`);s.players[0].board[0]=minion('c164',0,{hp:1,maxHp:2});
      const n=nextTurn(nextTurn(s));const result=n.players[0].board[0];
      if(result){expect(result).toMatchObject({atk:4,hp:2,maxHp:4});won=true;}else lost=true;
    }
    expect(won&&lost).toBe(true);
  });
  it('Kuma allows a returned card to be replayed for zero mana exactly once',()=>{
    const s=state('kuma-zero');s.cheatMode=true;s.players[0].hand=['c133'];s.players[0].board[0]=minion('c001',0);
    const n=applyAction(s,{type:'play_card',player:0,handIndex:0,slotIndex:1},library).state;
    expect(n.players[0].hand).toContain('c001');expect(effectiveCardCost(n,0,card('c001'))).toBe(0);
    n.cheatMode=false;n.players[0].mana=0;
    const played=applyAction(n,{type:'play_card',player:0,handIndex:n.players[0].hand.indexOf('c001'),slotIndex:0},library).state;
    expect(played.players[0].board[0]?.cardId).toBe('c001');expect(played.players[0].mana).toBe(0);
    expect(effectiveCardCost(played,0,card('c001'))).toBe(1);
  });
});
