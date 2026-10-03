import {describe,it,expect} from 'vitest';
import {cards,relics} from '../data/cards';
import {applyAction,createInitialGame,makeCardLibrary} from './game';
import {spawnTestMinion} from './test-utils';
import type {GameState} from './types';
const library=makeCardLibrary(cards,relics);
const card=(name:string)=>cards.find(c=>c.name===name)!;
function refresh(s:GameState){s.players[0].board[3]=null;s.players[0].hand=[card('UFO').id];return applyAction(s,{type:'play_card',player:0,handIndex:0,slotIndex:3},library).state;}
function setup(two=false){
  const s=createInitialGame(cards,'buff-consumption',relics);s.phase='main';s.drawChoice=null;s.activePlayer=0;s.cheatMode=true;
  s.players[0].board.fill(null);s.players[1].board.fill(null);
  s.players[0].board[0]=spawnTestMinion(card('Giant Tree'),0);
  s.players[0].board[1]=spawnTestMinion(card('Lu Bu'),0,{hp:3,maxHp:3,baseHp:3,atk:3,baseAtk:3});
  if(two)s.players[0].board[2]=spawnTestMinion(card('Giant Tree'),0);
  return refresh(s);
}
describe('temporary aura stats are spent before underlying stats',()=>{
  it('keeps a minion set to one HP alive when Giant Tree leaves',()=>{
    const s=setup();expect(s.players[0].board[1]?.hp).toBe(4);
    s.players[0].board[1]!.hp=1;s.players[0].board[0]=null;
    expect(refresh(s).players[0].board[1]).toMatchObject({hp:1,maxHp:3,atk:3});
  });
  it('does not heal damage on unrelated aura refreshes',()=>{
    const s=setup();s.players[0].board[1]!.hp=2;
    const next=refresh(s);expect(next.players[0].board[1]).toMatchObject({hp:2,maxHp:4});
    expect(refresh(next).players[0].board[1]?.hp).toBe(2);
  });
  it('removes stacked sources independently without killing a wounded survivor',()=>{
    const s=setup(true);expect(s.players[0].board[1]?.hp).toBe(5);
    s.players[0].board[1]!.hp=1;s.players[0].board[0]=null;
    const next=refresh(s);expect(next.players[0].board[1]).toMatchObject({hp:1,maxHp:4});
    next.players[0].board[2]=null;expect(refresh(next).players[0].board[1]).toMatchObject({hp:1,maxHp:3});
  });
  it('still removes a genuinely dead minion',()=>{
    const s=setup();s.players[0].board[1]!.hp=0;
    expect(refresh(s).players[0].board[1]).toBeNull();
  });
  it('removes unused bonus HP after healing',()=>{
    const s=setup();s.players[0].board[1]!.hp=4;s.players[0].board[0]=null;
    expect(refresh(s).players[0].board[1]).toMatchObject({hp:3,maxHp:3});
  });
  it('consumes aura attack first when Dampen reduces a buffed minion',()=>{
    const s=setup();s.activePlayer=1;s.heroPowers[1]='minion_atk_down';s.players[1].mana=10;
    const asking=applyAction(s,{type:'use_hero_power',player:1},library).state;
    const index=asking.pendingTarget!.options.findIndex(o=>o.owner===0&&o.slot===1);
    const next=applyAction(asking,{type:'choose_target',player:1,choiceIndex:index},library).state;
    expect(next.players[0].board[1]?.atk).toBe(4);next.players[0].board[0]=null;next.activePlayer=0;
    expect(refresh(next).players[0].board[1]?.atk).toBe(3);
  });
  it('Wither cannot spend the same already-damaged aura HP twice',()=>{
    const s=setup();s.players[0].board[1]!.hp=3;s.activePlayer=1;s.heroPowers[1]='minion_hp_down';s.players[1].mana=10;
    const asking=applyAction(s,{type:'use_hero_power',player:1},library).state;
    const index=asking.pendingTarget!.options.findIndex(o=>o.owner===0&&o.slot===1);
    const next=applyAction(asking,{type:'choose_target',player:1,choiceIndex:index},library).state;
    expect(next.players[0].board[1]).toMatchObject({hp:3,maxHp:3});next.players[0].board[0]=null;next.activePlayer=0;
    expect(refresh(next).players[0].board[1]).toMatchObject({hp:3,maxHp:3});
  });
  it('a fixed 1/1 remains 1/1 when its consumed aura leaves',()=>{
    const s=setup();s.activePlayer=1;s.heroPowers[1]='luffy_set_one';s.players[1].mana=10;
    const asking=applyAction(s,{type:'use_hero_power',player:1},library).state;
    const index=asking.pendingTarget!.options.findIndex(o=>o.owner===0&&o.slot===1);
    const next=applyAction(asking,{type:'choose_target',player:1,choiceIndex:index},library).state;
    expect(next.players[0].board[1]).toMatchObject({atk:1,hp:1,maxHp:1});next.players[0].board[0]=null;next.activePlayer=0;
    expect(refresh(next).players[0].board[1]).toMatchObject({atk:1,hp:1,maxHp:1});
  });
  it('Ainz followed by killing Giant Tree leaves the real Nature minion alive',()=>{
    const s=setup();s.activePlayer=1;s.players[1].hand=[card('Ainz Ooal Gown').id];
    const next=applyAction(s,{type:'play_card',player:1,handIndex:0,slotIndex:0},library).state;
    expect(next.players[0].board[1]?.hp).toBe(1);next.players[1].board[0]!.sleeping=false;
    const killed=applyAction(next,{type:'attack_minion',player:1,attackerSlot:0,targetSlot:0},library).state;
    expect(killed.players[0].board[0]).toBeNull();expect(killed.players[0].board[1]).toMatchObject({hp:1,maxHp:3});
  });
});
