import type {GameAction,GameState} from './engine/types';

export const TUTORIAL_LESSONS = [
  {title:'Welcome, Rick Gramps',body:'Bring the enemy Core to zero. Blue crystals are mana; hearts are health.',hint:'A short duel will teach each control.'},
  {title:'Play your first minion',body:'Tap Heavy Knights, then an empty friendly slot.',hint:'Its crystal shows the mana you pay.'},
  {title:'Let your minion wake',body:'End your turn. New minions usually need one turn before attacking.',hint:'The training opponent will pass.'},
  {title:'Attack the enemy Core',body:'Tap your ready Knight, then the enemy heart.',hint:'Cores do not strike back. Taunt defenders would block this attack.'},
  {title:'Refresh your mana',body:'End your turn again. Your mana refills and its limit grows.',hint:'The opponent will play a defender.'},
  {title:"Batman's gadget",body:'Play Batman. Choose the enemy, then read and choose a gadget.',hint:'A Battlecry happens when the card enters play.'},
  {title:'Equip a relic',body:'Play Green Lantern Ring onto Batman.',hint:'The badge shows his equipment. Tap it to inspect the relic.'},
  {title:'Grow your bearer',body:'End your turn. The Ring rewards Batman for not attacking.',hint:'Watch his attack and health increase.'},
  {title:'Prepare your trade',body:'Use Vital Spark on Batman. His extra health will help him survive combat.',hint:'Hero Powers usually cost two mana, once per turn.'},
  {title:'Trade with a minion',body:'Attack the defender with Batman. Both minions deal combat damage.',hint:'Divine Shield absorbs one hit; Silence removes it.'},
] as const;

export function tutorialAllowsAction(step:number,state:GameState,action:GameAction):boolean {
  if(action.player!==0)return true;
  const id='handIndex' in action?state.players[0].hand[action.handIndex]:undefined;
  if(step===1)return action.type==='play_card'&&id==='c169';
  if([2,4,7].includes(step))return action.type==='end_turn';
  if(step===3)return action.type==='attack_core';
  if(step===5)return action.type==='play_card'&&id==='c005'||action.type==='choose_target';
  if(step===6)return action.type==='play_relic'&&id==='r035'&&state.players[0].board[action.slotIndex]?.cardId==='c005';
  if(step===8) {
    if(action.type==='use_hero_power')return true;
    if(action.type==='choose_target') {const target=state.pendingTarget?.options[action.choiceIndex];return target?.owner===0&&state.players[0].board[target.slot]?.cardId==='c005';}
  }
  if(step===9)return action.type==='attack_minion'&&state.players[0].board[action.attackerSlot]?.cardId==='c005';
  return false;
}

export function nextTutorialStep(step:number,action:GameAction,next:GameState):number {
  if(action.player!==0)return step;
  if(step===5||step===8)return next.phase==='targeting'?step:step+1;
  return Math.min(TUTORIAL_LESSONS.length,step+1);
}

/** The opponent uses real actions, without attacking away the learning position. */
export function tutorialOpponentAction(state:GameState,legal:GameAction[]):GameAction|undefined {
  if(state.phase==='main'&&state.players[1].turnsStarted>=2&&!state.players[1].board.some(Boolean)) {
    const defender=legal.find(action=>action.type==='play_card'&&state.players[1].hand[action.handIndex]==='c143');
    if(defender)return defender;
  }
  return legal.find(action=>action.type==='end_turn')??legal[0];
}
