/** One entry point for the isolated, free, local campaign voice renderer. */
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const python=path.join(root,'.preview/voice-runtime/Scripts/python.exe');
function run(program,args){return new Promise((resolve,reject)=>{const child=spawn(program,args,{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${program} exited ${code}. Resolve its error above before retrying.`)));});}
if(!existsSync(python)){
  await run('uv',['venv','--python','3.12','.preview/voice-runtime']);
  await run('uv',['pip','install','--python',python,'qwen-tts==0.1.1','faster-whisper==1.2.1']);
  await run('uv',['pip','install','--python',python,'torch==2.7.1','torchaudio==2.7.1','--index-url','https://download.pytorch.org/whl/cu128']);
}
const model=path.join(root,'.preview/models/qwen-voice-design');
if(!existsSync(path.join(model,'model.safetensors'))||!existsSync(path.join(model,'speech_tokenizer/model.safetensors'))){
  await run(python,['materials/local-production/asset-tools/download-voice-model.py']);
}
await run(python,['materials/local-production/asset-tools/voice-campaign.py',...process.argv.slice(2)]);
await run('py',['-3.14','materials/local-production/asset-tools/voice-audition.py']);
