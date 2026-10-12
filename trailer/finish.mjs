/** Complete the trailer's shareable outputs after the master render. */
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {writeFileSync,statSync} from 'node:fs';

const here=dirname(fileURLToPath(import.meta.url));
const game=resolve(here,'..');
const renderer=resolve(here,'../../../../Pipelines/video/remotion');
const master=process.argv[2]||join(game,'Convergence-Trailer.mp4');
const share=join(game,'Convergence-Trailer-Share.mp4');
const poster=join(game,'Convergence-Trailer-Poster.jpg');
function run(command,args,cwd=here){
  const result=spawnSync(command,args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(result.status!==0)throw new Error(`${command} failed: ${result.stderr||result.stdout||result.error}`);
  return result.stdout;
}
run('ffmpeg',['-y','-loglevel','error','-i',master,'-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','slow','-crf','24','-maxrate','2500k','-bufsize','5000k','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',share]);
run(process.execPath,[join(renderer,'node_modules/@remotion/cli/remotion-cli.js'),'still',join(here,'index.tsx'),'TrailerPoster',poster,`--public-dir=${join(game,'.preview/trailer/assets')}`,'--frame=90','--image-format=jpeg','--log=error'],renderer);
const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,r_frame_rate','-of','json',share]));
const video=info.streams.find(stream=>stream.codec_type==='video');
if(video.width!==1920||video.height!==1080||video.r_frame_rate!=='30/1'||Math.abs(Number(info.format.duration)-48)>0.1||!info.streams.some(stream=>stream.codec_type==='audio'))throw new Error('The sharing copy does not match the trailer output contract.');
run('ffmpeg',['-v','error','-i',share,'-f','null','-']);
writeFileSync(join(here,'.preview','deliverables.json'),JSON.stringify({master,share,poster,shareBytes:statSync(share).size,shareProbe:info},null,2));
console.log(`Sharing copy: ${(statSync(share).size/1024/1024).toFixed(1)} MB, 1920x1080, 48 seconds`);
console.log(`Poster: ${poster}`);
