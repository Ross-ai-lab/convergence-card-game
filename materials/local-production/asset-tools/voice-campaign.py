"""Generate the campaign cast locally. Resume safely; never reuse stale speech.

Run with .preview/voice-runtime/Scripts/python.exe. --chapters 1,20 --stages play
is a small audition. The default renders only the four audition clips. Full-cast production is paused.
"""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, time

ROOT = Path(__file__).resolve().parents[3]
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
sox = list((Path(os.environ['LOCALAPPDATA']) / 'Microsoft/WinGet/Packages').glob('ChrisBagwell.SoX_*/sox-*/sox.exe'))
if sox:
    os.environ['PATH'] = str(sox[0].parent) + os.pathsep + os.environ['PATH']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chapters', default='')
    parser.add_argument('--keys', default='01-play,06-entrance,19-defeat,20-loss')
    parser.add_argument('--stages', default='entrance,defeat,loss,play')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--batch-size',type=int,default=4)
    args = parser.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is unavailable. Install the pinned CUDA torch build in the voice runtime.')
    story = json.loads((ROOT/'materials/campaign-story.json').read_text(encoding='utf-8'))
    cast = json.loads((ROOT/'materials/campaign-voice-cast.json').read_text(encoding='utf-8'))
    selected = {int(n) for n in args.chapters.split(',') if n}
    stages = args.stages.split(',')
    target = ROOT/'.preview/voice-full-hold/campaign'
    raw = ROOT/'.preview/campaign-voices/raw'
    target.mkdir(parents=True, exist_ok=True)
    raw.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT/'.preview/voice-full-hold/campaign-voices.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    model = None
    for chapter in story['chapters']:
        number = chapter['chapter']
        if selected and number not in selected:
            continue
        voice = cast['cast'][str(number)]
        jobs=[]
        for stage in stages:
            key=f'{number:02d}-{stage}'
            if key not in args.keys.split(','):continue
            text=chapter[stage]
            spoken=(text.capitalize() if number==20 else text).replace('DIO','Dio')
            instruction=voice['voice']+' Perform with '+voice['direction'][stage]+'. Fluent English, vivid natural acting, clear words, no music or sound effects.'
            fingerprint=hashlib.sha256(json.dumps([cast['engine'],text,instruction,voice['seed'],'mix-v2']).encode()).hexdigest()
            output=target/(key+'.ogg')
            if not args.force and output.exists() and manifest.get(key,{}).get('fingerprint')==fingerprint:
                print('CURRENT',key,flush=True);continue
            jobs.append(dict(key=key,text=text,spoken=spoken,instruction=instruction,fingerprint=fingerprint,stage=stage,output=output))
        if not jobs:continue
        if model is None:
            print('Loading',cast['engine'],'on',torch.cuda.get_device_name(),flush=True)
            model=Qwen3TTSModel.from_pretrained(str(ROOT/'.preview/models/qwen-voice-design'),device_map='cuda:0',dtype=torch.float16,attn_implementation='sdpa',low_cpu_mem_usage=True)
            # Decode waveforms one at a time to bound memory on the 6 GB GPU.
            original_decode=model.model.speech_tokenizer.decode
            def serial_decode(items,**kwargs):
                waves=[];rate=None
                for item in items:
                    out,rate=original_decode([item],**kwargs);waves.extend(out)
                return waves,rate
            model.model.speech_tokenizer.decode=serial_decode
            print('Model loaded; allocated GB',round(torch.cuda.memory_allocated()/1e9,2),flush=True)
        for offset in range(0,len(jobs),args.batch_size):
            batch=jobs[offset:offset+args.batch_size]
            torch.manual_seed(voice['seed']);torch.cuda.empty_cache()
            start=time.time();print('GENERATE',','.join(job['key'] for job in batch),voice['name'],flush=True)
            with torch.inference_mode():
                waves,rate=model.generate_voice_design(text=[job['spoken'] for job in batch],language=['English']*len(batch),instruct=[job['instruction'] for job in batch],max_new_tokens=900)
            elapsed=time.time()-start
            for job,samples in zip(batch,waves):
                key=job['key'];output=job['output'];samples=np.asarray(samples,dtype=np.float32);duration=len(samples)/rate
                if not np.isfinite(samples).all() or duration<2 or duration>65 or np.max(np.abs(samples))<.01:
                    raise RuntimeError(f'{key}: invalid/silent/runaway audio ({duration:.1f}s). Inspect before continuing.')
                wav=raw/(key+'.wav');sf.write(wav,samples,rate)
                filters=['highpass=f=65']
                if number==1:filters+=['tremolo=f=32:d=0.08','equalizer=f=2200:t=q:w=1:g=2']
                if number in (6,12,16):filters+=['aecho=0.9:0.9:45:0.08']
                measure=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(wav),'-af',','.join(filters+['loudnorm=I=-18:TP=-1.5:LRA=9:print_format=json']),'-f','null','-'],capture_output=True,text=True,check=True)
                levels=json.JSONDecoder().raw_decode(measure.stderr[measure.stderr.rfind('{'):])[0]
                filters+=[f"loudnorm=I=-18:TP=-1.5:LRA=9:measured_I={levels['input_i']}:measured_TP={levels['input_tp']}:measured_LRA={levels['input_lra']}:measured_thresh={levels['input_thresh']}:offset={levels['target_offset']}:linear=true"]
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-af',','.join(filters),'-c:a','libvorbis','-q:a','5',str(output)],check=True)
                final_duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(output)],text=True))
                manifest[key]={'chapter':number,'bossId':chapter['bossId'],'stage':job['stage'],'duration':round(final_duration,3),'text':job['text'],'fingerprint':job['fingerprint'],'audioSha256':hashlib.sha256(output.read_bytes()).hexdigest()}
                manifest_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
                print('DONE',key,'speech',round(duration,1),'seconds; batch wall',round(elapsed,1),'seconds; peak VRAM GB',round(torch.cuda.max_memory_allocated()/1e9,2),flush=True)
    print('Manifest clips:',len(manifest),flush=True)

if __name__ == '__main__':
    main()
