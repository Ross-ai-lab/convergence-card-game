"""Transcribe recordings back and inspect signal quality; keep the heard text."""
from pathlib import Path
import argparse, difflib, hashlib, json, os, re
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--partial',action='store_true');args=parser.parse_args()
import torch
os.add_dll_directory(str(Path(torch.__file__).parent/'lib'))
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
manifest=json.loads((ROOT/'.preview/voice-full-hold/campaign-voices.json').read_text(encoding='utf-8'))
if not args.partial and len(manifest)!=80:raise RuntimeError(f'Expected 80 recordings, found {len(manifest)}')
report_path=ROOT/'.preview/campaign-voices/transcripts.json'
report=json.loads(report_path.read_text()) if report_path.exists() else {}
model=None;failed=[]
def normalized(text):return re.sub(r'[^a-z0-9 ]','',text.lower()).split()
for key,entry in sorted(manifest.items()):
    path=ROOT/'.preview/voice-full-hold/campaign'/f'{key}.ogg'
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    if report.get(key,{}).get('sha256')==digest and report[key].get('passed'):continue
    if model is None:model=WhisperModel('large-v3-turbo',device='cuda',compute_type='float16',local_files_only=True)
    segments,_=model.transcribe(str(path),language='en',vad_filter=True,beam_size=5)
    heard=' '.join(segment.text.strip() for segment in segments)
    expected=entry['text'];score=difflib.SequenceMatcher(None,normalized(expected),normalized(heard),autojunk=False).ratio()
    audio,rate=sf.read(path);peak=float(np.max(np.abs(audio)));rms=float(np.sqrt(np.mean(audio**2)))
    passed=score>=.86 and .015<peak<1.01 and rms>.006
    report[key]={'expected':expected,'heard':heard,'wordSimilarity':round(score,4),'peak':round(peak,4),'rms':round(rms,4),'sha256':digest,'passed':passed}
    report_path.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('PASS' if passed else 'REVIEW',key,round(score,3),heard,flush=True)
    if not passed:failed.append(key)
print('Reviewed',len(manifest),'recordings; needs review:',failed,flush=True)
if failed:raise SystemExit(1)
