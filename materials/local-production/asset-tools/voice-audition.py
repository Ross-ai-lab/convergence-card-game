"""Produce four Qwen and five Kokoro samples, plus self-announcing playlists."""
from pathlib import Path
import hashlib, json, subprocess, sys
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[3]
WORKSPACE=ROOT.parents[2]
sys.path.insert(0,str(WORKSPACE/'Pipelines/audio'))
from voice import speak_kokoro

OUT=ROOT/'materials/voice-auditions'
TEMP=ROOT/'.preview/voice-comparison'
TEMP.mkdir(parents=True,exist_ok=True)
story=json.loads((ROOT/'materials/campaign-story.json').read_text(encoding='utf-8'))
samples=[
 ('01-glados','GLaDOS',1,'play','af_heart',1.0,0),
 ('02-vader','Darth Vader',6,'entrance','bm_george',.9,-1),
 ('03-goku','Goku',19,'defeat','am_puck',1.06,0),
 ('04-bill','Bill Cipher',20,'loss','am_fenrir',1.12,2),
 ('05-tai-lung','Tai Lung',2,'entrance','am_michael',.98,-.5),
]
manifest=[]
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True)
def normalize(source,target,filters):
    measurement=run(['ffmpeg','-hide_banner','-nostats','-i',str(source),'-af',','.join(filters+['loudnorm=I=-18:TP=-1.5:LRA=9:print_format=json']),'-f','null','-'])
    stats=json.JSONDecoder().raw_decode(measurement.stderr[measurement.stderr.rfind('{'):])[0]
    norm=f"loudnorm=I=-18:TP=-1.5:LRA=9:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
    target.parent.mkdir(parents=True,exist_ok=True)
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-af',','.join(filters+[norm]),'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','96k',str(target)])
for index,(slug,name,chapter,stage,voice,speed,pitch) in enumerate(samples):
    text=story['chapters'][chapter-1][stage]
    spoken=text.capitalize() if chapter==20 else text
    for engine in (['qwen','kokoro'] if index<4 else ['kokoro']):
        output=OUT/engine/f'{slug}.mp3'
        if engine=='qwen':
            source=ROOT/'.preview/voice-full-hold/campaign'/f'{chapter:02d}-{stage}.ogg'
            if not source.exists():raise RuntimeError(f'Missing retained Qwen sample: {source}. Generate only this sample before retrying.')
            filters=['anull']
        else:
            source=TEMP/f'{slug}-kokoro.wav'
            if not speak_kokoro(spoken,source,voice=voice,speed=speed):raise RuntimeError(f'Kokoro failed: {slug}')
            filters=['highpass=f=65']
            if pitch:
                ratio=2**(pitch/12)
                filters += [f'asetrate=24000*{ratio}', 'aresample=24000',f'atempo={1/ratio}']
            if chapter==1:filters+=['tremolo=f=32:d=0.08','equalizer=f=2200:t=q:w=1:g=2']
            if chapter==6:filters+=['aecho=0.9:0.9:45:0.08']
        normalize(source,output,filters)
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(output)],text=True))
        manifest.append(dict(engine=engine,name=name,chapter=chapter,stage=stage,text=text,file=f'{engine}/{slug}.mp3',duration=duration,voice=voice if engine=='kokoro' else 'Qwen3-TTS VoiceDesign',sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
        print('DONE',engine,name,round(duration,1),'seconds',flush=True)
for engine in ['qwen','kokoro']:
    playlist=[]
    for entry in [e for e in manifest if e['engine']==engine]:
        label=TEMP/f"label-{engine}-{entry['chapter']}.wav"
        if not speak_kokoro(entry['name']+'. '+('Qwen.' if engine=='qwen' else 'Kokoro.'),label,voice='af_heart'):raise RuntimeError('Sampler label failed')
        label_audio,sr=sf.read(label);assert sr==24000
        decoded=TEMP/'decoded.wav'
        run(['ffmpeg','-v','error','-y','-i',str(OUT/entry['file']),'-ar','24000','-ac','1',str(decoded)])
        audio,sr=sf.read(decoded)
        playlist.extend([label_audio,np.zeros(12000),audio,np.zeros(24000)])
    wav=TEMP/f'{engine}-playlist.wav';sf.write(wav,np.concatenate(playlist),24000)
    normalize(wav,OUT/f'{engine}-samples.mp3',['anull'])
(OUT/'samples.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('READY',OUT,flush=True)
