import {describe,it,expect} from 'vitest';
import {TurnClock,PLAYER_TURN_MS} from './turn-clock';

describe('human turn deadline',()=>{
  it('gives one hundred seconds and never resets on actions',()=>{
    const clock=new TurnClock();clock.update('turn-1',true,1000);
    expect(clock.getSnapshot()?.deadline).toBe(101000);
    clock.update('turn-1',true,40000);expect(clock.getSnapshot()?.deadline).toBe(101000);
  });
  it('preserves the remaining budget across privacy and menu pauses',()=>{
    const clock=new TurnClock();clock.update('a',true,1000);clock.update('a',false,31000);
    expect(clock.getSnapshot()).toEqual({key:'a',remainingMs:70000,deadline:null});
    clock.update('a',true,50000);expect(clock.getSnapshot()?.deadline).toBe(120000);
  });
  it('restores the deadline instead of giving a new turn on reload',()=>{
    const clock=new TurnClock({key:'a',remainingMs:PLAYER_TURN_MS,deadline:100000},95000);
    clock.update('a',true,96000);expect(clock.getSnapshot()?.deadline).toBe(101000);
  });
  it('starts a fresh budget for the next human turn only',()=>{
    const clock=new TurnClock({key:'a',remainingMs:0,deadline:null},0);
    clock.update(null,false,0);expect(clock.getSnapshot()?.remainingMs).toBe(0);
    clock.update('b',true,3000);expect(clock.getSnapshot()?.deadline).toBe(103000);
  });
  it('expired saves remain expired and oversized saves are clamped',()=>{
    expect(new TurnClock({key:'a',remainingMs:100000,deadline:50},100).getSnapshot()?.remainingMs).toBe(0);
    expect(new TurnClock({key:'a',remainingMs:900000,deadline:null},100).getSnapshot()?.remainingMs).toBe(100000);
  });
});
