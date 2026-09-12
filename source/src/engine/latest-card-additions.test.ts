import {describe,expect,it} from 'vitest';
import {cards,relics} from '../data/cards';
import {applyAction,createInitialGame,effectiveCardCost,getLegalActions,makeCardLibrary,readySwings} from './game';
import {spawnTestMinion} from './test-utils';
import type {GameState,MinionInstance,PlayerId} from './types';

const library=makeCardLibrary(cards,relics);
const card=(id:string)=>cards.find(c=>c.id===id)!;
const body=(id:string,owner:PlayerId,overrides:Partial<MinionInstance>={})=>spawnTestMinion(card(id),owner,overrides);
function main(seed:string):GameState {const s=createInitialGame(cards,seed,relics);s.phase='main';s.drawChoice=null;s.activePlayer=0;return s;}

describe('new Basic cards and latest adjustments',()=>{
  it.each([
    ['c086',4,1,4],['c024',8,6,6],['c009',5,0,9],['c185',3,1,1],['c048',7,1,1],['c037',3,0,4],
    ['c177',7,3,7],['c103',4,4,4],['c186',9,1,1],['c187',5,1,5],
  ] as const)('%s has its requested values',(id,cost,atk,hp)=>expect(card(id)).toMatchObject({cost,atk,hp}));
  it('keeps the requested origins and new Basic card traits',()=>{
    expect(card('c068').origin).toBe('Star Wars');
    for(const id of ['c186','c187'])expect(card(id)).toMatchObject({rarity:'Black',camp:'Tech',alignment:'Neutral',origin:'Basic'});
    expect(card('c186')).toMatchObject({name:'Antimatter Bomb',keywords:['Deathrattle'],effectId:'deathrattle_damage_both_cores_20'});
    expect(card('c187')).toMatchObject({name:'Carrier Strike Group',keywords:['Passive'],effectId:'carrier_lock_enemy_tech'});
  });
  it.each([75,15])('Antimatter Bomb hits both cores and resolves simultaneous lethal damage from %i HP',(health)=>{
    const s=main(`antimatter-${health}`);s.activePlayer=1;
    s.players[0].health=health;s.players[1].health=health;
    s.players[0].board[0]=body('c186',0);
    s.players[1].board[0]=body('c001',1,{atk:2,hp:10,maxHp:10,sleeping:false});
    const n=applyAction(s,{type:'attack_minion',player:1,attackerSlot:0,targetSlot:0},library).state;
    expect(n.players[0].health).toBe(health-20);expect(n.players[1].health).toBe(health-20);
    expect(n.players[0].board[0]).toBeNull();
    if(health===15)expect(n.winner).toBe('draw');
  });
  it('Silence prevents Antimatter Bomb from detonating',()=>{
    const s=main('antimatter-silenced');s.activePlayer=1;
    s.players[0].board[0]=body('c186',0,{silenced:true});s.players[1].board[0]=body('c001',1,{atk:2,hp:10,maxHp:10,sleeping:false});
    const n=applyAction(s,{type:'attack_minion',player:1,attackerSlot:0,targetSlot:0},library).state;
    expect(n.players.map(p=>p.health)).toEqual([75,75]);
  });
  it.each(['silence','death'] as const)('Carrier suppresses only enemy Tech attackers until its %s',(removal)=>{
    const s=main(`carrier-${removal}`);s.cheatMode=true;s.players[0].hand=['c187'];
    s.players[0].board[0]=body('c026',0,{sleeping:false});
    s.players[1].board[0]=body('c026',1,{sleeping:false});
    s.players[1].board[1]=body('c001',1,{atk:99,hp:20,maxHp:20,sleeping:false});
    s.players[1].board[2]=body('c043',1,{sleeping:false});
    const n=applyAction(s,{type:'play_card',player:0,handIndex:0,slotIndex:3},library).state;
    expect(readySwings(n.players[1].board[0]!)).toBe(0);expect(readySwings(n.players[0].board[0]!)).toBeGreaterThan(0);
    n.activePlayer=1;
    const attacks=getLegalActions(n,library).filter(a=>a.type==='attack_core'||a.type==='attack_minion');
    expect(attacks.some(a=>'attackerSlot' in a&&a.attackerSlot===0)).toBe(false);
    expect(attacks.some(a=>'attackerSlot' in a&&a.attackerSlot===1)).toBe(true);
    expect(attacks.some(a=>'attackerSlot' in a&&a.attackerSlot===2)).toBe(true);
    let restored:GameState;
    if(removal==='death')restored=applyAction(n,{type:'attack_minion',player:1,attackerSlot:1,targetSlot:3},library).state;
    else {n.players[0].board[3]!.silenced=true;restored=applyAction(n,{type:'attack_core',player:1,attackerSlot:2},library).state;}
    expect(readySwings(restored.players[1].board[0]!)).toBeGreaterThan(0);
    expect(getLegalActions(restored,library).some(a=>a.type==='attack_core'&&a.attackerSlot===0)).toBe(true);
  });
  it('Eye of Sauron adds two per active copy only to opposing Magic minions',()=>{
    const s=main('sauron-magic-tax');s.players[1].board[0]=body('c037',1);s.players[1].board[1]=body('c037',1);
    expect(effectiveCardCost(s,0,card('c072'))).toBe(card('c072').cost+4);
    expect(effectiveCardCost(s,0,card('c026'))).toBe(card('c026').cost);
    expect(effectiveCardCost(s,0,relics[0])).toBe(relics[0].cost);
    s.players[1].board[0]!.silenced=true;
    expect(effectiveCardCost(s,0,card('c072'))).toBe(card('c072').cost+2);
  });
});
