import assert from 'node:assert/strict';

/** Re-add a removed card through the ordinary collection, on desktop or phone. */
export async function addDeckCard(page,name,touch=false){
  assert.equal(await page.getByRole('button',{name:'Restore starter deck',exact:true}).count(),0);
  const collection=page.getByRole('button',{name:'Collection',exact:true});
  const mobile=await collection.isVisible();
  if(mobile){if(touch)await collection.tap();else await collection.click();}
  const search=page.getByRole('searchbox',{name:'Search the gallery'});await search.fill(name);
  const add=page.getByRole('button',{name:`Add ${name}`,exact:true});if(touch)await add.tap();else await add.click();await search.fill('');
  if(mobile){const deck=page.getByRole('button',{name:/^Deck · \d+\/30$/});if(touch)await deck.tap();else await deck.click();}
}
