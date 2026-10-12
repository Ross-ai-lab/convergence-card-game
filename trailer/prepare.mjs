/** Repeatable trailer capture and media preparation. Uses isolated game saves. */
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {launch} from '../source/scripts/browser.mjs';
import {skipCampaignDialogue} from '../source/scripts/story-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const SOURCE = join(GAME, 'source');
const OUT = join(GAME, '.preview', 'trailer');
const ASSETS = join(OUT, 'assets');
const BASE = 'http://127.0.0.1:5187';
const FORCE = process.argv.includes('--force');
mkdirSync(join(ASSETS, 'clips'), {recursive:true});
mkdirSync(join(ASSETS, 'cards'), {recursive:true});
mkdirSync(join(ASSETS, 'art'), {recursive:true});
mkdirSync(join(ASSETS, 'audio'), {recursive:true});

function run(binary, args) {
  const result = spawnSync(binary, args, {encoding:'utf8', windowsHide:true, maxBuffer:8*1024*1024});
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
function csv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const columns=rows.shift(); return rows.filter(r=>r.length===columns.length).map(r=>Object.fromEntries(columns.map((key,i)=>[key,r[i]])));
}
const roster = [...csv(readFileSync(join(SOURCE,'data','cards.csv'),'utf8')), ...csv(readFileSync(join(SOURCE,'data','relics.csv'),'utf8'))];
const castIds = ['c029','c044','c076','c001','c005','c089','c104','c110','c022','c025','c016','c096','c045','c060','c070','c027','r035','r005','r027'];
const cast=castIds.map(id=>roster.find(card=>card.id===id));
if(cast.some(card=>!card)) throw new Error('A trailer card is missing from the current roster. Update the cast before capture.');
const hash=createHash('sha256');
function fingerprint(folder) {for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {const path=join(folder,entry.name); if(entry.isDirectory())fingerprint(path);else hash.update(readFileSync(path));}}
fingerprint(join(SOURCE,'src'));
hash.update(readFileSync(join(SOURCE,'data','cards.csv')));
hash.update(readFileSync(join(SOURCE,'data','relics.csv')));
hash.update(readFileSync(join(SOURCE,'scripts','browser.mjs')));
hash.update(readFileSync(join(SOURCE,'scripts','story-fixtures.mjs')));
hash.update(readFileSync(fileURLToPath(import.meta.url)));
const sourceHash=hash.digest('hex');
const manifestPath=join(OUT,'captures.json');
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{clips:{}};
function saveManifest(){writeFileSync(manifestPath,JSON.stringify({...manifest,sourceHash},null,2));}

for(const card of cast) copyFileSync(join(SOURCE,'public',card.art.replace(/^\//,'')),join(ASSETS,'art',`${card.id}.webp`));
copyFileSync(join(SOURCE,'public','fonts','Nunito.woff2'),join(ASSETS,'Nunito.woff2'));
copyFileSync(join(SOURCE,'public','fonts','Baloo2.woff2'),join(ASSETS,'Baloo2.woff2'));
writeFileSync(join(HERE,'cast.json'),JSON.stringify(cast.map(card=>({id:card.id,name:card.name,origin:card.origin||'Relic',cost:Number(card.cost),art:`art/${card.id}.webp`,face:`cards/${card.id}.png`})),null,2));

let ownedServer;
try {await fetch(BASE);} catch {
  ownedServer=spawn(process.execPath,[join(SOURCE,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port','5187','--strictPort'],{cwd:SOURCE,stdio:'ignore',windowsHide:true});
  for(let i=0;i<80;i++){try{await fetch(BASE);break;}catch{await new Promise(r=>setTimeout(r,250));}}
}
const browser=await launch(['--autoplay-policy=no-user-gesture-required']);
const errors=[];
async function pageFor(context){
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.title-screen').waitFor();
  await page.waitForTimeout(1000);
  await page.addStyleTag({content:'.debug-panel {display:none !important;}'});
  return page;
}
async function seedCollection(page){
  await page.evaluate(async()=>{
    const p=await import('/src/progress.ts');
    const progress=p.emptyProgress();
    progress.storyIntroduced=true;
    progress.completedBosses=Array.from({length:20},(_,i)=>i+1);
    progress.completedChapters=20;
    progress.unlockedIds=[...p.CAMPAIGN_CARD_IDS];
    progress.heroPowerSeenWins=20;
    p.saveProgress(progress);
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.title-screen').waitFor();
}
async function duel(page,chapter=6){
  await page.locator('.duel-trigger').click();
  await page.locator(`[data-chapter="${chapter}"] button`).click();
  await skipCampaignDialogue(page);
  await page.locator('.duel-intro').dblclick();
  await page.locator('.duel-intro').waitFor({state:'detached'});
  await page.locator('.mulligan-panel button.primary').click();
  await page.waitForFunction(()=>window.__debug?.state().phase==='main'&&window.__debug.state().activePlayer===window.__debug.state().viewer);
  await page.mouse.move(1870,1020);
  await page.waitForTimeout(650);
}
async function capture(name,setup,action,hold=1.5){
  const signature=createHash('sha256').update(sourceHash+pageFor.toString()+seedCollection.toString()+duel.toString()+setup.toString()+action.toString()+hold).digest('hex');
  const previous=manifest.clips[name];
  if(!FORCE&&previous?.signature===signature&&existsSync(join(ASSETS,'clips',`${name}.mp4`))){console.log(`Reusing ${name}`);return;}
  const rawFolder=join(OUT,'raw',name);mkdirSync(rawFolder,{recursive:true});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:rawFolder,size:{width:1920,height:1080}}});
  const created=performance.now();
  const page=await pageFor(context);
  const video=page.video();
  try {
    await setup(page);
    await page.waitForTimeout(500);
    const start=(performance.now()-created)/1000;
    await action(page);
    await page.waitForTimeout(hold*1000);
    const duration=(performance.now()-created)/1000-start;
    await page.screenshot({path:join(OUT,`${name}.png`)});
    await context.close();
    const raw=await video.path();
    run('ffmpeg',['-y','-loglevel','error','-ss',String(start),'-i',raw,'-t',String(duration),'-an','-r','30','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',join(ASSETS,'clips',`${name}.mp4`)]);
    const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=width,height,r_frame_rate:format=duration','-of','json',raw]));
    manifest.clips[name]={signature,start,duration:Number(duration.toFixed(3)),raw,source:probe,actions:action.toString()};saveManifest();
    console.log(`Captured ${name}: ${duration.toFixed(2)}s; source ${probe.streams[0].r_frame_rate}, ${probe.streams[0].width}x${probe.streams[0].height}`);
  } catch(error){await page.screenshot({path:join(OUT,`${name}-failure.png`)}).catch(()=>{});console.error(await page.locator('body').innerText());await context.close();throw error;}
}

try {
  // Card faces are actual game components, captured at twice their native size.
  const faceSignature=createHash('sha256').update(sourceHash+castIds.join(',')+'faces-v2').digest('hex');
  if(FORCE||manifest.faces!==faceSignature||cast.some(card=>!existsSync(join(ASSETS,'cards',`${card.id}.png`)))) {
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});
    const page=await pageFor(context);await seedCollection(page);await page.locator('.deck-trigger').click();
    await page.addStyleTag({content:'.gallery-grid {grid-template-columns:repeat(3,minmax(0,1fr)) !important;}'});
    for(const card of cast){
      await page.getByRole('searchbox',{name:'Search the gallery'}).fill(card.name);
      const face=page.locator('.gallery-cell').filter({has:page.getByRole('button',{name:`Open Star Chart for ${card.name}`,exact:true})}).locator('.card-face');
      await face.waitFor();await face.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode().catch(()=>{}))));
      await page.waitForTimeout(150);
      await face.screenshot({path:join(ASSETS,'cards',`${card.id}.png`)});
    }
    await context.close();manifest.faces=faceSignature;saveManifest();console.log(`Captured ${cast.length} real card faces`);
  }
  await capture('title',async()=>{},async page=>{await page.waitForTimeout(5_500);});
  await capture('collection',async page=>{await seedCollection(page);await page.locator('.deck-trigger').click();},async page=>{
    await page.waitForTimeout(1200);
    for(let i=0;i<55;i++){await page.locator('.gallery-body').evaluate((element,value)=>element.scrollTop=value,i*23);await page.waitForTimeout(45);}
    await page.waitForTimeout(1000);
  });
  await capture('battle',async page=>{
    await duel(page,6);
    await page.evaluate(()=>{['Goku','Batman','John Wick'].forEach((name,slot)=>window.__debug.place(name,'me',slot));['Darth Vader','Kratos','Godzilla','GLaDOS'].forEach((name,slot)=>window.__debug.place(name,'them',slot));window.__debug.giveCard('John Wick');});
    await page.waitForFunction(()=>window.__debug.state().mine===3&&window.__debug.state().theirs===4);
  },async page=>{
    await page.getByRole('button',{name:/^John Wick, 1 mana/}).last().click();
    await page.locator('[data-slot="0-3"]').click();
    await page.waitForTimeout(1100);
    await page.locator('[data-slot="0-0"]').click();await page.locator('[data-slot="1-0"]').click();
    await page.waitForTimeout(1600);
    await page.locator('[data-slot="0-1"]').click();await page.locator('[data-slot="1-1"]').click();
    await page.waitForTimeout(1400);
  },2);
  await capture('relic',async page=>{
    await duel(page,6);await page.evaluate(()=>{window.__debug.place('Batman','me',0);window.__debug.place('Darth Vader','me',1);window.__debug.place('Godzilla','them',0);window.__debug.place('Kratos','them',1);});
    await page.waitForFunction(()=>window.__debug.state().mine===2);
  },async page=>{
    await page.evaluate(()=>window.__debug.equipRelic('Green Lantern Ring','me',0));await page.waitForTimeout(1600);
    await page.getByRole('button',{name:'Inspect equipped Green Lantern Ring',exact:true}).click();
    await page.waitForTimeout(1800);
  },1.5);
  await capture('reward',async page=>{
    await duel(page,1);await page.evaluate(()=>{window.__debug.place('Doom Slayer','me',0);window.__debug.setCore('them',1);});
    await page.waitForFunction(()=>window.__debug.state().mine===1);
  },async page=>{
    await page.locator('[data-slot="0-0"]').click();await page.locator('[data-hero="1"]').click();
    await page.waitForFunction(()=>window.__debug?.state().phase==='gameOver');
    await page.waitForTimeout(1200);await skipCampaignDialogue(page);
    await page.locator('.pack-box').waitFor();
    for(let i=0;i<5;i++){await page.locator('.pack-box').click();await page.waitForTimeout(260);}
    await page.locator('.pack-reveal').waitFor();await page.waitForTimeout(5200);
  },1.5);
  await capture('champions',async page=>{await page.locator('.duel-trigger').click();},async page=>{
    await page.waitForTimeout(1800);await page.locator('[data-chapter="6"] button').hover();await page.waitForTimeout(1800);
  });
  await capture('friends',async()=>{},async page=>{
    await page.getByRole('button',{name:/^Online/}).click();await page.waitForTimeout(2800);
  });
  // The trailer score is edited from the game's own music and short stings.
  const music=join(SOURCE,'public','audio','music','battle.ogg');
  const opening=join(SOURCE,'public','audio','stings','opening-jrpg-trailer.ogg');
  run('ffmpeg',['-y','-loglevel','error','-i',opening,'-i',music,'-filter_complex',
    '[0:a]atrim=0:4.9,afade=t=out:st=4.1:d=0.8,volume=0.7,adelay=0|0[a];[1:a]atrim=0:44,afade=t=in:d=0.5,afade=t=out:st=41:d=3,volume=0.9,adelay=4000|4000[b];[a][b]amix=inputs=2:normalize=0,alimiter=limit=0.88,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]',
    '-map','[out]','-t','48','-c:a','pcm_s16le',join(ASSETS,'audio','score-base.wav')]);
  function effect(kind,seconds){
    const rate=48000, count=Math.round(rate*seconds), data=new Float32Array(count*2);
    let seed=23827,phase=0,low=0;
    for(let i=0;i<count;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed/4294967296)*2-1;
      const t=i/rate, u=t/seconds;low+=0.07*(noise-low);
      let sample;
      if(kind==='impact'){
        phase+=2*Math.PI*(43+112*Math.exp(-t*15))/rate;
        sample=Math.sin(phase)*Math.exp(-t*5.5)*0.58+noise*Math.exp(-t*32)*0.19+low*Math.exp(-t*3.2)*0.38;
        sample+=Math.sin(2*Math.PI*472*t)*Math.sin(2*Math.PI*1307*t)*Math.exp(-t*7)*0.06;
      }else{
        const envelope=Math.sin(Math.PI*u)**2;phase+=2*Math.PI*(140+u*900)/rate;
        sample=(low*2.2+noise*0.25+Math.sin(phase)*0.06)*envelope*(kind==='rise'?0.18:0.38);
      }
      data[i*2]=sample;data[i*2+1]=sample*(0.92+0.08*Math.sin(t*5));
    }
    // Decaying stereo reflections give the transient a space and a tail.
    for(const [delay,gain] of [[0.11,0.16],[0.23,0.10],[0.37,0.05]])for(let i=count-1;i>=Math.round(delay*rate);i--)for(let c=0;c<2;c++)data[i*2+c]+=data[(i-Math.round(delay*rate))*2+(1-c)]*gain;
    const wav=Buffer.alloc(44+count*4);wav.write('RIFF',0);wav.writeUInt32LE(36+count*4,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);
    for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(Math.tanh(data[i])*26000),44+i*2);
    writeFileSync(join(ASSETS,'audio',`${kind}.wav`),wav);
  }
  effect('impact',1.4);effect('whoosh',0.6);effect('rise',2.2);
  run('ffmpeg',['-y','-loglevel','error','-i',join(SOURCE,'public','audio','campaign','06-play.ogg'),'-ar','48000','-ac','2','-c:a','pcm_s16le',join(ASSETS,'audio','vader-voice.wav')]);
  const events=[
    ['whoosh',1.52,0.7],['impact',1.7,0.7],['impact',3.6,0.85],['whoosh',9.28,0.65],['impact',9.6,0.7],
    ['impact',15,0.75],['impact',17.6,0.4],['whoosh',21.65,0.7],['impact',22,0.7],['whoosh',26.12,0.65],
    ['impact',28.6,0.65],['impact',33.5,0.7],['whoosh',37.18,0.6],['rise',41.8,0.8],['impact',44,0.9],['vader-voice',4.3,1.6],
  ];
  const inputs=['-i',join(ASSETS,'audio','score-base.wav')];
  const filters=["[0:a]volume='0.85-0.6*if(between(t,4.1,4.4),(t-4.1)/0.3,if(between(t,4.4,8.8),1,if(between(t,8.8,9.3),(9.3-t)/0.5,0)))':eval=frame[a0]"];
  events.forEach(([kind,at,gain],i)=>{inputs.push('-i',join(ASSETS,'audio',`${kind}.wav`));filters.push(`[${i+1}:a]volume=${gain},adelay=${Math.round(at*1000)}|${Math.round(at*1000)}[a${i+1}]`);});
  filters.push(`${Array.from({length:events.length+1},(_,i)=>`[a${i}]`).join('')}amix=inputs=${events.length+1}:duration=first:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`);
  run('ffmpeg',['-y','-loglevel','error',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-t','48','-c:a','pcm_s16le',join(ASSETS,'audio','score.wav')]);
  writeFileSync(join(HERE,'soundtrack.json'),JSON.stringify({sources:['source/public/audio/music/battle.ogg','source/public/audio/stings/opening-jrpg-trailer.ogg'],events:events.map(([effect,seconds,gain])=>({effect,seconds,gain})),durationSeconds:48,targetLUFS:-16,maxTruePeakDB:-1.5},null,2));
  const stings=[['c029','vader'],['c044','goku'],['c076','godzilla'],['c016','doom']];
  for(const [id,name] of stings){const source=join(SOURCE,'public','audio','stings',`${id}.ogg`);if(existsSync(source))copyFileSync(source,join(ASSETS,'audio',`${name}.ogg`));}
  manifest.errors=errors;saveManifest();
  if(errors.length)throw new Error(`Game capture reported page errors: ${errors.join('; ')}`);
  console.log('Trailer media ready. Owner browser storage was not accessed.');
} finally {await browser.close();if(ownedServer)ownedServer.kill();}
