/** Full-quality trailer preparation. Real engine, isolated saves, 60 distinct captures per second. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {launch} from '../source/scripts/browser.mjs';
import {skipCampaignDialogue} from '../source/scripts/story-fixtures.mjs';
import {captureBrowserArgs,installCaptureClock,loadCaptureImages,captureBrowserClip} from '../../../../Pipelines/video/browser_capture.mjs';
import {buildSoundtrack} from './soundtrack.mjs';

const HERE=dirname(fileURLToPath(import.meta.url)),GAME=resolve(HERE,'..'),SOURCE=join(GAME,'source');
const OUT=join(GAME,'.preview/trailer'),ASSETS=join(OUT,'assets'),BASE='http://127.0.0.1:5187';
const FORCE=process.argv.includes('--force'),ONLY=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const plan=JSON.parse(readFileSync(join(HERE,'plan.json'),'utf8'));
const manifestPath=join(OUT,'captures.json');
for(const folder of ['clips','cards','art','audio'])mkdirSync(join(ASSETS,folder),{recursive:true});
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{clips:{}};
function saveManifest(){writeFileSync(manifestPath,JSON.stringify(manifest,null,2));}
function csv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const columns=rows.shift();
  return rows.filter(r=>r.length===columns.length).map(r=>Object.fromEntries(columns.map((key,i)=>[key,r[i]])));
}
const roster=[...csv(readFileSync(join(SOURCE,'data/cards.csv'),'utf8')),...csv(readFileSync(join(SOURCE,'data/relics.csv'),'utf8'))];
const used=new Map();
for(const scene of plan.scenes)for(const id of scene.cards){if(used.has(id))throw new Error(`Card ${id} repeats in ${used.get(id)} and ${scene.id}. Change the cast ledger.`);used.set(id,scene.id);}
if(plan.scenes.reduce((n,s)=>n+s.seconds,0)!==plan.durationSeconds)throw new Error('Trailer scenes do not total 90 seconds.');
const cast=[...used.keys()].map(id=>roster.find(card=>card.id===id));
if(cast.some(card=>!card))throw new Error('The current roster is missing a planned trailer card.');
const campaign=JSON.parse(readFileSync(join(GAME,'materials/campaign-design.json'),'utf8'));
const expectedRewards=plan.scenes.find(s=>s.id==='reward').cards.filter(id=>id!=='c016');
if([...campaign.chapters[0].rewardCardIds].sort().join()!==[...expectedRewards].sort().join())throw new Error('Campaign rewards changed. Update the cast ledger before filming.');
const hash=createHash('sha256');
function fingerprint(folder){for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(folder,entry.name);if(entry.isDirectory())fingerprint(path);else hash.update(readFileSync(path));}}
fingerprint(join(SOURCE,'src'));fingerprint(join(SOURCE,'data'));
for(const path of [fileURLToPath(import.meta.url),join(HERE,'plan.json'),resolve(HERE,'../../../../Pipelines/video/browser_capture.mjs'),join(SOURCE,'scripts/story-fixtures.mjs')])hash.update(readFileSync(path));
// Media is part of the fingerprint: replacing art must invalidate recorded footage.
for(const card of cast){const path=join(SOURCE,'public',card.art.replace(/^\//,''));hash.update(readFileSync(path));copyFileSync(path,join(ASSETS,'art',`${card.id}.webp`));}
const sourceHash=hash.digest('hex');
for(const font of ['Nunito','Baloo2'])copyFileSync(join(SOURCE,`public/fonts/${font}.woff2`),join(ASSETS,`${font}.woff2`));
writeFileSync(join(HERE,'cast.json'),JSON.stringify(cast.map(c=>({id:c.id,name:c.name,origin:c.origin||'Relic',cost:Number(c.cost),art:`art/${c.id}.webp`,face:`cards/${c.id}.png`,scene:used.get(c.id)})),null,2));
copyFileSync(join(HERE,'Trailer-Rules.md'),join(process.env.USERPROFILE,'Desktop/Convergence-Trailer-Rules.md'));
buildSoundtrack({source:SOURCE,assets:ASSETS,here:HERE,plan});
let ownedServer;
try{await fetch(BASE);}catch{ownedServer=spawn(process.execPath,[join(SOURCE,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5187','--strictPort'],{cwd:SOURCE,stdio:'ignore',windowsHide:true});for(let i=0;i<80;i++){try{await fetch(BASE);break;}catch{await new Promise(r=>setTimeout(r,250));}}}
const browser=await launch([...captureBrowserArgs(),'--autoplay-policy=no-user-gesture-required']);
const errors=[];
async function pageFor(context){
  const page=await context.newPage();await installCaptureClock(page);
  page.on('pageerror',error=>errors.push(error.message));await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);await page.locator('.title-screen').waitFor();
  await page.addStyleTag({content:'.debug-panel,.developer-tools,.hover-preview,.card-peek {display:none!important;} .boss-portrait {opacity:0!important;}'});
  return page;
}
async function seedCollection(page,{power='core_heal'}={}){
  await page.evaluate(async power=>{const p=await import('/src/progress.ts');const progress=p.emptyProgress();progress.storyIntroduced=true;progress.completedBosses=Array.from({length:20},(_,i)=>i+1);progress.completedChapters=20;progress.unlockedIds=[...p.CAMPAIGN_CARD_IDS];progress.heroPowerSeenWins=20;p.saveProgress(p.selectHeroPower(progress,power));},power);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.title-screen').waitFor();
}
async function duel(page,chapter=6){
  await page.locator('.duel-trigger').click();
  const chapterButton=page.locator(`[data-chapter="${chapter}"] button`);
  if(await chapterButton.count())await chapterButton.click();
  await skipCampaignDialogue(page);
  if(await page.locator('.duel-intro').count()){await page.locator('.duel-intro').dblclick();await page.locator('.duel-intro').waitFor({state:'detached'});}
  await page.locator('.mulligan-panel button.primary').click();
  await page.waitForFunction(()=>window.__debug?.state().phase==='main'&&window.__debug.state().activePlayer===window.__debug.state().viewer);
  await page.addStyleTag({content:'.hand-fan {visibility:hidden!important;} .hero-plate.enemy .hero-sigil {display:none!important;}'});
  await page.mouse.move(0,0);await page.waitForTimeout(500);
}
const click=async(page,selector)=>{await page.locator(selector).last().evaluate(element=>element.click());};
async function audit(page,sceneId){
  const visible=await page.evaluate(()=>[...document.querySelectorAll('.card-face')].filter(el=>el.checkVisibility({visibilityProperty:true,opacityProperty:true})).map(el=>({name:el.querySelector('.cf-name')?.textContent?.trim(),board:!!el.closest('.board-row')})).filter(c=>c.name));
  const allowed=new Set(plan.scenes.find(s=>s.id===sceneId).cards.map(id=>roster.find(c=>c.id===id).name));
  for(const card of visible)if(!allowed.has(card.name))throw new Error(`${sceneId} shows an unplanned card: ${card.name}. It may repeat elsewhere.`);
  const boardNames=visible.filter(c=>c.board).map(c=>c.name);
  if(new Set(boardNames).size!==boardNames.length)throw new Error(`${sceneId} has duplicate cards on its board.`);
  return [...new Set(visible.map(c=>c.name))];
}
async function capture(name,seconds,setup,events=[],update){
  if(ONLY && ONLY!==name)return;
  const signature=createHash('sha256').update(sourceHash+name+seconds+setup.toString()+events.map(e=>e.at+e.run.toString()+e.verify?.toString()).join()+update?.toString()).digest('hex');
  const output=join(ASSETS,'clips',`${name}.mp4`),previous=manifest.clips[name];
  if(!FORCE && previous?.signature===signature && previous.method==='frame-stepped-browser' && existsSync(output)){console.log(`Reusing ${name}: native ${previous.fps} fps`);return;}
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const page=await pageFor(context),seen=new Set();
  try{
    await setup(page);await loadCaptureImages(page);
    const report=await captureBrowserClip({page,output,fps:60,seconds,events,screenshot:join(OUT,`${name}.png`),update:async(p,t)=>{if(update)await update(p,t);if(Math.round(t*60)%15===0)for(const card of await audit(p,name))seen.add(card);},onProgress:({seconds:elapsed})=>{if(elapsed%3===0)console.log(`${name}: ${elapsed}/${seconds} seconds`);}});
    manifest.clips[name]={signature,...report,seenCards:[...seen]};manifest.sourceHash=sourceHash;saveManifest();
    console.log(`Captured ${name}: ${report.frames} frames, ${report.uniqueFrames} distinct, ${report.width}x${report.height} at ${report.fps} fps`);
  }catch(error){await page.screenshot({path:join(OUT,`${name}-failure.png`)}).catch(()=>{});throw error;}finally{await context.close();}
}
try{
  // Reuse the real card components, with full images decoded and two-times raster resolution.
  const faceSignature=sourceHash+'faces-v3';
  if(!ONLY && (FORCE||manifest.faces!==faceSignature||cast.some(c=>!existsSync(join(ASSETS,'cards',`${c.id}.png`))))){
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});const page=await pageFor(context);await seedCollection(page);await page.locator('.deck-trigger').click();
    await page.addStyleTag({content:'.gallery-grid {grid-template-columns:repeat(3,minmax(0,1fr))!important;} .gallery-deck {display:none!important;} .gallery-workspace {grid-template-columns:1fr!important;}'});
    for(const card of cast){await page.getByRole('searchbox',{name:'Search the gallery'}).fill(card.name);const face=page.locator(`.gallery-deck-card[data-card-id="${card.id}"] .card-face`);await face.waitFor();await face.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode();})));await face.screenshot({path:join(ASSETS,'cards',`${card.id}.png`)});}
    await context.close();manifest.faces=faceSignature;saveManifest();console.log(`Prepared ${cast.length} sharp card faces; cast ledger contains no repeats.`);
  }
  await capture('battle',12,async page=>{
    await duel(page,6);await page.evaluate(()=>{['John Wick','Batman'].forEach((name,slot)=>window.__debug.place(name,'me',slot));['G-Man','Conquest'].forEach((name,slot)=>window.__debug.place(name,'them',slot));window.__debug.giveCard('Mugen & Jin');});
    await page.waitForFunction(()=>window.__debug.state().mine===2&&window.__debug.state().theirs===2);
  },[
    {at:1.1,name:'Summon Mugen & Jin beside allies',run:async page=>{await click(page,'.hand-item button[aria-label^="Mugen & Jin,"]');await click(page,'[data-slot="0-2"]');},verify:async page=>page.evaluate(()=>window.__debug.state().mine===3)},
    {at:4.0,name:'Batman attacks G-Man; John Wick grows after an ally dies',run:async page=>{await click(page,'[data-slot="0-1"]');await click(page,'[data-slot="1-0"]');},verify:async page=>(await page.locator('[data-slot="0-0"] .cf-atk').innerText())==='2'},
    {at:7.3,name:'The strengthened John Wick attacks',run:async page=>{await click(page,'[data-slot="0-0"]');await click(page,'[data-slot="1-0"]');},verify:async page=>page.evaluate(()=>window.__debug.state().mine===1)}
  ]);
  await capture('relic',11,async page=>{
    await duel(page,6);await page.evaluate(()=>{window.__debug.place('Superman','me',1);['General Grievous','Homelander','Doctor Octopus'].forEach((name,slot)=>window.__debug.place(name,'them',slot));});await page.waitForFunction(()=>window.__debug.state().mine===1&&window.__debug.state().theirs===3);
  },[
    {at:2.4,name:'Equip Infinity Stone through the game engine',run:async page=>{await page.evaluate(()=>window.__debug.equipRelic('Infinity Stone','me',1));},verify:async page=>await page.getByRole('button',{name:'Inspect equipped Infinity Stone',exact:true}).count()===1},
    {at:6.0,name:'Infinity Stone cleaves the target and both adjacent minions',run:async page=>{await click(page,'[data-slot="0-1"]');await click(page,'[data-slot="1-1"]');},verify:async page=>page.evaluate(()=>window.__debug.state().theirs===0&&window.__debug.state().mine===1)}
  ]);
  await capture('collection',12,async page=>{
    await seedCollection(page);await page.locator('.deck-trigger').click();
    const ids=plan.scenes.find(s=>s.id==='collection').cards;
    await page.addStyleTag({content:`.gallery-deck {display:none!important;} .gallery-workspace {grid-template-columns:1fr!important;} .gallery-grid {grid-template-columns:repeat(3,minmax(0,1fr))!important;max-width:1420px;margin:0 auto!important;} .gallery-deck-card {display:none!important;} ${ids.map(id=>`.gallery-deck-card[data-card-id="${id}"]`).join(',')} {display:block!important;} .gallery-cell {container-type:inline-size!important;} .gallery-cell .card-face > *, .gallery-cell .card-face::before, .gallery-cell .card-face::after {--u:calc(100cqw / 750)!important;} .gallery-card-add:hover {box-shadow:none!important;} .card-peek {display:none!important;}`});
    await loadCaptureImages(page);await page.mouse.move(0,0);
    const assets=await page.locator('.gallery-deck-card:visible img').evaluateAll(images=>images.map(i=>({src:i.currentSrc,width:i.naturalWidth,height:i.naturalHeight,complete:i.complete})));
    manifest.collectionImages=assets;saveManifest();
  },[],async(page,t)=>{await page.locator('.gallery-body').evaluate((element,t)=>{const u=Math.max(0,Math.min(1,(t-1.2)/9.4));element.scrollTop=(element.scrollHeight-element.clientHeight)*(u*u*(3-2*u));},t);});
  await capture('reward',13,async page=>{
    await duel(page,1);await page.evaluate(()=>{window.__debug.place('Doom Slayer','me',0);window.__debug.setCore('them',1);});await page.waitForFunction(()=>window.__debug.state().mine===1);
  },[
    {at:0.8,name:'Land the winning attack',run:async page=>{await click(page,'[data-slot="0-0"]');await click(page,'[data-hero="1"]');},verify:async page=>page.evaluate(()=>window.__debug?.state().phase==='gameOver')},
    {at:2.2,name:'Continue past the defeated champion dialogue',run:async page=>{await skipCampaignDialogue(page);}},
    {at:3.2,name:'First pack strike',run:async page=>{await click(page,'.pack-box');}},
    {at:3.6,name:'Second pack strike',run:async page=>{await click(page,'.pack-box');}},
    {at:4.0,name:'Third pack strike',run:async page=>{await click(page,'.pack-box');}},
    {at:4.4,name:'Fourth pack strike',run:async page=>{await click(page,'.pack-box');}},
    {at:4.8,name:'Fifth pack strike; full card reveal follows',run:async page=>{await click(page,'.pack-box');}}
  ]);
  await capture('powers',10,async page=>{
    await seedCollection(page,{power:'minion_atk'});await duel(page,6);
    await page.locator('.end-turn').click();
    await page.waitForFunction(()=>window.__debug?.state().phase==='main'&&window.__debug.state().activePlayer===window.__debug.state().viewer&&window.__debug.state().turn>=3);
    await page.evaluate(()=>{['Avatar Aang','Frieren'].forEach((name,slot)=>window.__debug.place(name,'me',slot));['Ragnaros','Lelouch Lamperouge'].forEach((name,slot)=>window.__debug.place(name,'them',slot));});
    await page.waitForFunction(()=>window.__debug.state().mine===2&&window.__debug.state().theirs===2);
  },[
    {at:2.0,name:'Use the chosen power on Frieren',run:async page=>{await click(page,'.hero-power-button');await click(page,'[data-slot="0-1"]');},verify:async page=>(await page.locator('[data-slot="0-1"] .cf-atk').innerText())==='3'},
    {at:5.6,name:'Frieren defeats Ragnaros with the chosen power',run:async page=>{await click(page,'[data-slot="0-1"]');await click(page,'[data-slot="1-0"]');},verify:async page=>page.evaluate(()=>window.__debug.state().theirs===1&&window.__debug.state().mine===2)}
  ]);
  manifest.errors=errors;manifest.sourceHash=sourceHash;saveManifest();
  if(errors.length)throw new Error(`Capture page errors: ${errors.join('; ')}`);
  console.log('Trailer assets ready. Isolated saves only; no owner progress was accessed.');
}finally{await browser.close();if(ownedServer)ownedServer.kill();}
