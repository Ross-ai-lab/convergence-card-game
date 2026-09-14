"""Resumable verified range downloader for the official Qwen speech weights."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib, json, threading, time
import requests

ROOT=Path(__file__).resolve().parents[3]
REPO='Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
DEST=ROOT/'.preview/models/qwen-voice-design'
DEST.mkdir(parents=True,exist_ok=True)
files=requests.get(f'https://huggingface.co/api/models/{REPO}/tree/main?recursive=true',timeout=30).json()
for item in files:
    if item['type']!='file' or item['path'] in ('.gitattributes','README.md'): continue
    target=DEST/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
    size=item['size'];expected=item.get('lfs',{}).get('oid')
    if target.exists() and target.stat().st_size==size:
        if not expected or hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==expected:
            print('CURRENT',item['path'],flush=True);continue
    url=f'https://huggingface.co/{REPO}/resolve/main/{item["path"]}'
    if size<4*1024*1024:
        response=requests.get(url,timeout=90);response.raise_for_status()
        assert len(response.content)==size
        target.write_bytes(response.content);continue
    part=target.with_suffix('.part');ledger=target.with_suffix('.chunks.json')
    chunk=4*1024*1024;total=(size+chunk-1)//chunk
    done=set(json.loads(ledger.read_text())) if ledger.exists() and part.exists() else set()
    if not part.exists():
        with part.open('wb') as file:file.truncate(size)
    lock=threading.Lock();start=time.time()
    def download(index):
        lo=index*chunk;hi=min(size-1,lo+chunk-1)
        for attempt in range(4):
            try:
                response=requests.get(url+f'?part={lo}',headers={'Range':f'bytes={lo}-{hi}'},timeout=(20,90))
                response.raise_for_status()
                if response.status_code!=206 or response.headers.get('Content-Range')!=f'bytes {lo}-{hi}/{size}' or len(response.content)!=hi-lo+1:
                    raise RuntimeError(f'Unexpected range response for {index}')
                with part.open('r+b') as file:file.seek(lo);file.write(response.content)
                with lock:
                    done.add(index);ledger.write_text(json.dumps(sorted(done)))
                    if len(done)%16==0:print(item['path'],len(done),'/',total,'chunks',round(time.time()-start),'seconds',flush=True)
                return
            except Exception:
                if attempt==3:raise
                time.sleep(2*(attempt+1))
    print('DOWNLOAD',item['path'],size,'bytes;',len(done),'cached chunks',flush=True)
    with ThreadPoolExecutor(max_workers=24) as pool:
        for task in as_completed([pool.submit(download,i) for i in range(total) if i not in done]):task.result()
    actual=hashlib.file_digest(part.open('rb'),'sha256').hexdigest()
    if actual!=expected:raise RuntimeError(f'Checksum mismatch for {target}: {actual}')
    part.replace(target)
    print('VERIFIED',item['path'],actual,flush=True)
print('MODEL READY',DEST,flush=True)
