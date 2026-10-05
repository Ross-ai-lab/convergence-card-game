import {describe,it,expect} from 'vitest';
import {copyGameState} from './state-copy';
import {createInitialGame} from './game';
import {cards,relics} from '../data/cards';
import {spawnTestMinion} from './test-utils';
import type {GameState} from './types';

describe('rules-engine state copies',()=>{
  it('matches native copying for a late duel and keeps every mutable container independent',()=>{
    const state=createInitialGame(cards,'copy-parity',relics);
    for(const player of state.players){player.board=cards.slice(100,104).map(card=>spawnTestMinion(card,player.id));player.deadMinions=cards.slice(10,35).map(card=>card.id);}
    const before=structuredClone(state),copy=copyGameState(state);
    expect(copy).toEqual(before);
    copy.players[0].hand.push('c001');copy.players[0].board[0]!.hp=1;
    copy.players[0].board[0]!.gainedEffects.push({effectId:'friendly_death_buff_1_1',timing:'passive',text:'Copy only'});
    copy.players[0].deadMinions!.push('c002');
    expect(state).toEqual(before);
  });
  it('preserves aliases, optional undefined values and sparse arrays',()=>{
    const state=createInitialGame(cards,'copy-aliases',relics);
    const body=spawnTestMinion(cards[0],0);state.players[0].board[0]=body;Object.assign(state,{sharedBody:body});
    const sparse=new Array(5);sparse[3]=body;
    Object.assign(state,{sparse,optional:undefined});
    const copy=copyGameState(state) as GameState&{sparse:unknown[];optional:undefined;sharedBody:unknown};
    expect(copy).toEqual(structuredClone(state));
    expect(copy.players[0].board[0]).toBe(copy.sharedBody);
    expect(copy.sparse[3]).toBe(copy.players[0].board[0]);expect(0 in copy.sparse).toBe(false);
    expect(Object.hasOwn(copy,'optional')).toBe(true);
  });
  it('copies a __proto__ data key without changing the target prototype',()=>{
    const state=createInitialGame(cards,'copy-keys',relics);
    Object.defineProperty(state.players[0].costReductions,'__proto__',{value:{value:2},enumerable:true});
    const copy=copyGameState(state);
    expect(copy).toEqual(structuredClone(state));expect(Object.getPrototypeOf(copy.players[0].costReductions)).toBe(Object.prototype);
    expect(Object.hasOwn(copy.players[0].costReductions,'__proto__')).toBe(true);
  });
  it('falls back for a future non-plain value without losing graph identity',()=>{
    const state=createInitialGame(cards,'copy-future',relics);
    const body=spawnTestMinion(cards[0],0);state.players[0].board[0]=body;
    Object.assign(state,{future:new Map([['body',body]]),date:new Date(12345)});
    const copy=copyGameState(state) as GameState&{future:Map<string,unknown>;date:Date};
    expect(copy).toEqual(structuredClone(state));expect(copy.future.get('body')).toBe(copy.players[0].board[0]);
  });
});
