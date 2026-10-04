import {describe,it,expect} from 'vitest';
import {cards} from '../data/cards';
describe('requested card tiers',()=>{
 it('uses all eighteen requested rarities',()=>{
  const expected:Record<string,string>={c088:'Purple',c076:'Purple',c127:'Black',c148:'Black',c163:'Black',c149:'Black',c145:'Black',c151:'Black',c126:'Purple',c181:'Purple',c160:'Purple',c159:'Yellow',c045:'Yellow',c035:'Yellow',c065:'Yellow',c020:'Yellow',c184:'Yellow',c085:'Yellow'};
  for(const [id,tier] of Object.entries(expected))expect(cards.find(card=>card.id===id)?.rarity,id).toBe(tier);
 });
});
