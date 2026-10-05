import {launch} from './browser.mjs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {addDeckCard} from './deck-fixtures.mjs';
const base=process.argv[2]??'http://127.0.0.1:5177';const browser=await launch();
const output='../.preview/card-interface-pass';await mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(...args){
     const result=connect.apply(this,args);
     if(args[0]===this.context.destination&&!window.__combatAnalyser){const analyser=this.context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;window.__combatAnalyser=analyser;connect.call(this,analyser);}
     return result;
   };
 });
 await page.goto(base);
 await page.evaluate(async()=>{
  const [{emptyProgress,saveProgress},{CAMPAIGN_CHAPTERS},{createCampaignDuel},{cards,relics},{spawnTestMinion},{saveGame}]=await Promise.all([import('/src/progress.ts'),import('/src/campaign.ts'),import('/src/campaign-duel.ts'),import('/src/data/cards.ts'),import('/src/engine/test-utils.ts'),import('/src/storage.ts')]);
  const chapter=CAMPAIGN_CHAPTERS.find(c=>c.bossId===cards.find(card=>card.name==='Yujiro').id).chapter;
  const progress={...emptyProgress(),storyIntroduced:true};saveProgress(progress);
  const {state}=createCampaignDuel({chapter,playerDeck:progress.playerDeck,unlockedCardIds:progress.unlockedIds,cards,relics,seed:'interface-pass'});state.phase='main';state.mulligan=null;state.players[0].mana=10;state.players[0].maxMana=10;state.players[0].hand=['c001'];
  state.players[0].board=['Survivors','Kureo Mado','Superman'].map(name=>spawnTestMinion(cards.find(c=>c.name===name),0,{sleeping:false}));state.players[0].board.push(null);state.players[1].board=[spawnTestMinion(cards.find(c=>c.name==='John Wick'),1,{sleeping:false}),null,null,null];
  saveGame(state,[],{kind:'campaign',chapter,skill:'easy'},Date.now());
 });await page.reload();await page.locator('.continue-duel').hover();
 assert((await page.locator('.continue-duel').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('linear-gradient'));
 await page.screenshot({path:output+'/continue-hover.png'});
 await page.locator('.continue-duel').click();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
 assert((await page.locator('.apex-prey img').getAttribute('src')).includes('superman.webp'));
 const rings=await page.locator('[data-slot="0-0"] .card-face').evaluate(card=>{const shield=getComputedStyle(card,'::after'),ready=getComputedStyle(card.querySelector('.cf-ready-glow'));return{shield:parseFloat(shield.width),ready:parseFloat(ready.width),goldZ:Number(shield.zIndex),greenZ:Number(ready.zIndex)}});
 assert(rings.ready>rings.shield+10);assert(rings.greenZ>rings.goldZ);
 await page.waitForTimeout(1700);await page.screenshot({path:output+'/shield-ready.png'});
 await page.locator('[data-slot="0-1"]').click();await page.locator('[data-hero="1"]').click();await page.locator('.apex-blocked').waitFor();assert(await page.locator('.enemy-power-card').isVisible());
 await page.screenshot({path:output+'/apex-blocked.png'});
 await page.locator('[data-slot="0-1"]').click();
 const sounds=await page.evaluate(()=>window.__sfx.getStats().byName);
 await page.locator('.hand-card').filter({hasText:'John Wick'}).click();await page.locator('[data-slot="0-3"]').click();
 await page.waitForFunction(count=>window.__sfx.getStats().byName.minionLand>count,sounds.minionLand??0);
 const landed=await page.evaluate(()=>window.__sfx.getStats().byName);
 assert.equal(landed.mana??0,sounds.mana??0);assert.equal(landed.summonRare??0,sounds.summonRare??0);
 await page.locator('[data-slot="0-1"]').click();await page.locator('[data-slot="1-0"]').click();
 await page.waitForFunction(()=>['attack','hit','death'].every(name=>window.__sfx.getStats().byName[name]>0));
 await page.waitForFunction(()=>window.__sfx.getStats().voicesLive===0);await page.waitForTimeout(300);
 for(const name of ['attack','hit','death']){
   const probe=await page.evaluate(async name=>{
     window.__sfx.stopCardTheme();window.__sfx.stopBossSpeech();
     const pending=window.__sfx.probePeak(name,850),analyser=window.__combatAnalyser;
     const bins=new Float32Array(analyser.frequencyBinCount);let total=0,mid=0,high=0;
     const until=performance.now()+1000;
     while(performance.now()<until){analyser.getFloatFrequencyData(bins);for(let i=0;i<bins.length;i++){const power=10**(bins[i]/10),hz=i*analyser.context.sampleRate/analyser.fftSize;total+=power;if(hz>=250)mid+=power;if(hz>=2000)high+=power;}await new Promise(r=>setTimeout(r,16));}
     return {...await pending,midShare:mid/total,highShare:high/total};
   },name);
   assert(probe.ctxState==='running'&&probe.peak>.01&&probe.activeMs>30,`${name}: ${JSON.stringify(probe)}`);
   assert(probe.midShare>.08&&probe.highShare<.1,`${name} lacks body or has excessive treble: ${JSON.stringify(probe)}`);
   console.log('Combat sound:',name,JSON.stringify(probe));
 }
 await page.keyboard.type('Ross');await page.getByRole('button',{name:'DEV tools',exact:true}).click();
 assert.equal(await page.locator('.developer-note').count(),0);
 await page.getByRole('button',{name:'Clear my board',exact:true}).click();
 await page.getByRole('searchbox',{name:'Find any card'}).fill('Saitama');await page.getByRole('button',{name:'10 mana Saitama OPM',exact:true}).click();await page.getByRole('button',{name:'Place on my board',exact:true}).click();
 await page.screenshot({path:output+'/developer-groups.png'});await page.getByRole('button',{name:'Close developer mode',exact:true}).click();assert((await page.locator('.apex-prey img').getAttribute('src')).includes('saitama.webp'));
 await page.screenshot({path:output+'/apex-target.png'});
 assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS: separated shield/readiness, Apex refusal feedback and changing target art, grouped developer controls.');
 await page.close();
 const deckPage=await browser.newPage({viewport:{width:1440,height:900}});await deckPage.goto(base);
 await deckPage.evaluate(async()=>{const {emptyProgress,saveProgress}=await import('/src/progress.ts');saveProgress({...emptyProgress(),storyIntroduced:true})});await deckPage.reload();
 await deckPage.locator('.duel-trigger').hover();await deckPage.screenshot();await deckPage.waitForTimeout(250);
 const halo=await deckPage.locator('.duel-trigger').evaluate(el=>getComputedStyle(el,'::before').animationName);assert.equal(halo,'collection-halo');
 await deckPage.screenshot({path:output+'/collection-hover.png'});
 await deckPage.locator('.deck-trigger').click();
 const picker=deckPage.getByRole('combobox',{name:'Saved decks'});assert.equal(await picker.locator('option').filter({hasText:'Current deck'}).count(),0);assert.equal(await picker.inputValue(),'starter-deck');
 assert.equal(await deckPage.getByRole('button',{name:'Restore starter deck',exact:true}).count(),0);
 await deckPage.getByRole('button',{name:'Remove John Wick from deck',exact:true}).click();
 await deckPage.getByRole('button',{name:'Create a new deck',exact:true}).click();await deckPage.getByRole('textbox',{name:'Deck name'}).fill('Nature squad');await deckPage.getByRole('button',{name:'Create deck',exact:true}).click();
 assert((await deckPage.locator('.gallery-deck-heading strong').innerText()).startsWith('0'));await addDeckCard(deckPage,'John Wick');
 const id=await picker.inputValue();await picker.selectOption('starter-deck');assert((await deckPage.locator('.gallery-deck-heading strong').innerText()).startsWith('29'));
 await picker.selectOption(id);assert((await deckPage.locator('.gallery-deck-heading strong').innerText()).startsWith('1'));
 await deckPage.reload();await deckPage.locator('.deck-trigger').click();assert.equal(await deckPage.getByRole('combobox',{name:'Saved decks'}).inputValue(),id);
 assert((await deckPage.locator('.gallery-deck-heading strong').innerText()).startsWith('1'));
 await deckPage.getByRole('button',{name:'Clear',exact:true}).click();await deckPage.getByRole('combobox',{name:'Saved decks'}).selectOption('starter-deck');assert((await deckPage.locator('.gallery-deck-heading strong').innerText()).startsWith('29'));
 await deckPage.waitForTimeout(600);await deckPage.screenshot({path:output+'/saved-decks.png'});
 await deckPage.setViewportSize({width:390,height:844});await deckPage.getByRole('button',{name:/Deck · 29\/30/}).click();await deckPage.getByRole('button',{name:'Create a new deck',exact:true}).click();
 const dialog=await deckPage.getByRole('dialog',{name:'Create a new deck',exact:true}).boundingBox();assert(dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=390&&dialog.y+dialog.height<=844);
 await deckPage.screenshot({path:output+'/phone-save-deck.png'});await deckPage.getByRole('button',{name:'Cancel',exact:true}).click();await deckPage.close();
 console.log('PASS: placement thud without mana beep, Collection hover, Starter Deck, automatic deck edits across switches/reload, empty new decks and phone creation dialog.');
}finally{await browser.close()}
