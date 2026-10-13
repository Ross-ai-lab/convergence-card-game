/** Edit the game's existing music and character dialogue into one measured trailer mix. */
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw new Error(`${command} failed: ${result.stderr||result.stdout||result.error}`);return result.stdout;}
function effect(output,kind,seconds){
  const rate=48000,count=Math.round(rate*seconds),data=new Float32Array(count*2);let seed=23827,phase=0,low=0;
  for(let i=0;i<count;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/4294967296*2-1,t=i/rate,u=t/seconds;low+=0.07*(noise-low);let sample;
    if(kind==='impact'){phase+=2*Math.PI*(43+112*Math.exp(-t*15))/rate;sample=Math.sin(phase)*Math.exp(-t*5.5)*0.58+noise*Math.exp(-t*32)*0.19+low*Math.exp(-t*3.2)*0.38;sample+=Math.sin(2*Math.PI*472*t)*Math.sin(2*Math.PI*1307*t)*Math.exp(-t*7)*0.06;}
    else{const envelope=Math.sin(Math.PI*u)**2;phase+=2*Math.PI*(140+u*900)/rate;sample=(low*2.2+noise*0.25+Math.sin(phase)*0.06)*envelope*(kind==='rise'?0.18:0.38);}
    data[i*2]=sample;data[i*2+1]=sample*(0.92+0.08*Math.sin(t*5));
  }
  for(const [delay,gain] of [[0.11,0.16],[0.23,0.10],[0.37,0.05]])for(let i=count-1;i>=Math.round(delay*rate);i--)for(let c=0;c<2;c++)data[i*2+c]+=data[(i-Math.round(delay*rate))*2+(1-c)]*gain;
  const wav=Buffer.alloc(44+count*4);wav.write('RIFF',0);wav.writeUInt32LE(36+count*4,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(Math.tanh(data[i])*26000),44+i*2);writeFileSync(output,wav);
}
export function buildSoundtrack({source,assets,here,plan}){
  const folder=join(assets,'audio'),opening=join(source,'public/audio/stings/opening-jrpg-trailer.ogg');
  const battle=join(source,'public/audio/music/battle.ogg'),tension=join(source,'public/audio/music/tension.ogg'),victory=join(source,'public/audio/music/victory.ogg');
  run('ffmpeg',['-y','-loglevel','error','-i',opening,'-stream_loop','-1','-i',battle,'-stream_loop','-1','-i',tension,'-i',victory,'-filter_complex',
    '[0:a]atrim=0:8,afade=t=out:st=6:d=2,volume=0.7[a];[1:a]atrim=0:64,afade=t=in:d=2,afade=t=out:st=60:d=4,volume=0.85,adelay=4000|4000[b];[2:a]atrim=0:25,afade=t=in:d=3,afade=t=out:st=21:d=4,volume=0.9,adelay=63000|63000[c];[3:a]atrim=0:6,afade=t=in:d=0.4,afade=t=out:st=4:d=2,volume=0.8,adelay=84000|84000[d];[a][b][c][d]amix=inputs=4:normalize=0,apad,atrim=0:90,alimiter=limit=0.88,loudnorm=I=-17:TP=-2:LRA=11,aresample=48000[out]',
    '-map','[out]','-t','90','-c:a','pcm_s16le',join(folder,'score-base.wav')]);
  effect(join(folder,'impact.wav'),'impact',1.4);effect(join(folder,'whoosh.wav'),'whoosh',0.6);effect(join(folder,'rise.wav'),'rise',2.2);
  const voiceManifest=JSON.parse(readFile(source,'data/campaign-voices.json'));
  const voices=plan.voices.map(voice=>{
    const path=join(source,voice.kind==='announcer'?`public/audio/vo/announcer/${voice.file}.ogg`:`public/audio/campaign/${voice.file}.ogg`),duration=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path]));
    if(voice.at+duration>plan.durationSeconds-0.5)throw new Error(`${voice.character}'s complete phrase extends past the ending.`);
    return {...voice,path,duration,text:voice.text||voiceManifest[voice.file].text};
  });
  for(let i=1;i<voices.length;i++)if(voices[i].at<voices[i-1].at+voices[i-1].duration)throw new Error('Character dialogue overlaps. Change the edit timing.');
  const impacts=[1.7,8,9.1,12,15.3,17.6,20,22.4,26,31,43,55.8,58.2,58.6,59,59.4,59.8,60.8,68,70,73.6,78,82,85];
  const events=impacts.map(at=>({path:join(folder,'impact.wav'),at,gain:at===26||at===55.8?0.52:0.25,kind:'impact'}));
  for(const at of [7.65,19.65,30.65,42.65,54.65,67.65,77.65,84.65])events.push({path:join(folder,'whoosh.wav'),at,gain:0.45,kind:'whoosh'});
  events.push({path:join(folder,'rise.wav'),at:82.5,gain:0.65,kind:'rise'});
  for(const voice of voices)events.push({...voice,gain:1.15,kind:'character-voice'});
  const duck=voices.map(v=>`if(between(t,${v.at-0.25},${v.at}),(t-${v.at-0.25})/0.25,if(between(t,${v.at},${v.at+v.duration}),1,if(between(t,${v.at+v.duration},${v.at+v.duration+0.45}),(${v.at+v.duration+0.45}-t)/0.45,0)))`).reduce((a,b)=>a?`max(${a},${b})`:b,'');
  const inputs=['-i',join(folder,'score-base.wav')],filters=[`[0:a]volume='0.8*(1-0.84*(${duck}))':eval=frame[a0]`];
  events.forEach((e,i)=>{inputs.push('-i',e.path);filters.push(`[${i+1}:a]aresample=48000,volume=${e.gain},adelay=${Math.round(e.at*1000)}|${Math.round(e.at*1000)}[a${i+1}]`);});
  filters.push(`${Array.from({length:events.length+1},(_,i)=>`[a${i}]`).join('')}amix=inputs=${events.length+1}:duration=first:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`);
  run('ffmpeg',['-y','-loglevel','error',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-t','90','-c:a','pcm_s16le',join(folder,'score.wav')]);
  writeFileSync(join(here,'soundtrack.json'),JSON.stringify({durationSeconds:90,voices:voices.map(({path,...v})=>v),events:events.filter(e=>e.kind!=='character-voice').map(({path,...e})=>e),musicDucking:0.84,targetLUFS:-16,maxTruePeakDB:-1.5},null,2));
  console.log(`Prepared 90-second score with ${voices.length} complete speech cues and music ducking.`);
}
import {readFileSync} from 'node:fs';
function readFile(source,path){return readFileSync(join(source,path),'utf8');}
