import {cards} from '../data/cards';
import {TOKEN_CARDS} from '../engine/tokens';
const tiers=new Map([...cards,...TOKEN_CARDS].map(card=>[card.id,card.rarity]));
/** Tracks stay on disk; changing a card's tier automatically changes eligibility. */
export function shouldPlayCardTheme(cardId:string):boolean {
  return /^r\d+$/.test(cardId)||['Yellow','Red'].includes(tiers.get(cardId)??'');
}
