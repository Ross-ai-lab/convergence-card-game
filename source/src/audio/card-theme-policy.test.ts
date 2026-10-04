import {describe,it,expect} from 'vitest';
import {cards,relics} from '../data/cards';
import {shouldPlayCardTheme} from './card-theme-policy';
describe('card music follows the current rarity',()=>{
 it('mutes every Rare and Epic minion without removing their assets',()=>{for(const card of cards.filter(c=>['Black','Purple'].includes(c.rarity)))expect(shouldPlayCardTheme(card.id),card.name).toBe(false);});
 it('enables every Legendary and Mythic minion automatically',()=>{for(const card of cards.filter(c=>['Yellow','Red'].includes(c.rarity)))expect(shouldPlayCardTheme(card.id),card.name).toBe(true);});
 it('keeps equipment themes enabled',()=>{for(const relic of relics)expect(shouldPlayCardTheme(relic.id)).toBe(true);});
 it('follows token tiers too',()=>{expect(shouldPlayCardTheme('token:vision')).toBe(false);expect(shouldPlayCardTheme('token:awakened')).toBe(true);expect(shouldPlayCardTheme('missing')).toBe(false);});
});
