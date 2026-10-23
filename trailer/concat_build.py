"""Author the alternate 90-second Convergence cut with native Concat edits."""
from pathlib import Path
import json
import math
import random
import subprocess
import time
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ASSETS = GAME / '.preview/trailer/assets'
WORK = GAME / '.preview/concat'
PROJECT = HERE / 'Concat-Project'
OUTPUT = GAME / 'Convergence-Concat-Trailer.mp4'
WORK.mkdir(parents=True, exist_ok=True)
required = ['cards/c029.png','cards/c027.png','clips/battle.mp4','clips/relic.mp4',
            'clips/collection.mp4','clips/reward.mp4','clips/powers.mp4','audio/score-base.wav']
if not all((ASSETS/file).is_file() for file in required):
    subprocess.run(['node',str(HERE/'prepare.mjs')],cwd=HERE,check=True)
from remotion_video import validate_footage,render_contract
validate_footage(HERE,render_contract(HERE))
api = globals()['concat']
path = str(PROJECT)
plan = json.loads((HERE / 'plan.json').read_text(encoding='utf-8'))
ledger = [card for scene in plan['scenes'] for card in scene['cards']]
assert len(ledger) == len(set(ledger)), 'The cast ledger repeats a card.'


def tool(name, **args):
    return api.call(name, path=path, **args)


def batch(commands):
    return tool('edit_apply', command={'op': 'batch', 'commands': commands})


def key(clip, prop, at, value, ease=(0.2, 0.8, 0.2, 1.0)):
    return {'op': 'setClipKey', 'clipId': clip, 'property': prop,
            'at': at, 'value': value, 'ease': list(ease)}


def image_background():
    # A reusable visual asset only; Concat performs all timeline animation.
    import numpy as np
    w, h = 1920, 1080
    y, x = np.mgrid[0:h, 0:w]
    a = np.exp(-(((x - 650) / 820) ** 2 + ((y - 390) / 700) ** 2))
    b = np.exp(-(((x - 1650) / 900) ** 2 + ((y - 1050) / 700) ** 2))
    rgb = np.stack([10 + 26*a + 2*b, 8 + 8*a + 16*b, 24 + 31*a + 21*b], axis=-1)
    picture = Image.fromarray(np.uint8(np.clip(rgb, 0, 255))).convert('RGB')
    draw = ImageDraw.Draw(picture)
    for radius in (345, 370, 430):
        draw.ellipse((960-radius, 540-radius, 960+radius, 540+radius), outline=(86, 66, 63), width=1)
    for angle in range(0, 360, 60):
        px, py = 960+430*math.cos(math.radians(angle)), 540+430*math.sin(math.radians(angle))
        draw.regular_polygon((px, py, 9), 4, rotation=angle+45, outline=(194, 161, 94), width=2)
    random.seed(23)
    for _ in range(110):
        px, py = random.randrange(w), random.randrange(h)
        c = random.choice([(85, 67, 97), (140, 117, 101), (64, 77, 108)])
        draw.ellipse((px, py, px+2, py+2), fill=c)
    draw.rounded_rectangle((23, 23, w-24, h-24), radius=14, outline=(100, 82, 76), width=1)
    destination = WORK / 'atmosphere.png'
    picture.save(destination)
    return destination


media = {}
lanes = {}


def import_file(file):
    file = Path(file).resolve()
    if str(file) not in media:
        result = tool('media_import', file=str(file))
        media[str(file)] = result.get('createdId') or next(m['id'] for m in result['media'] if Path(m['path']).resolve() == file)
    return media[str(file)]


def clip(file, start, duration, track='T2', scale=1, x=0, y=0, angle=0, fade=0):
    result = tool('clip_add', mediaId=import_file(file), trackId=track, start=start)
    cid = result['createdId']
    current = next(c for c in result['timeline']['clips'] if c['id'] == cid)
    current_duration = current.get('duration', current.get('length', 5))
    batch([
        {'op': 'trimClip', 'clipId': cid, 'edge': 'end', 'delta': duration-current_duration},
        {'op': 'setClipTransform', 'clipId': cid, 'scale': scale, 'offsetX': x, 'offsetY': y, 'rotation': angle},
        {'op': 'updateClip', 'clipId': cid, 'patch': {'fadeIn': fade, 'fadeOut': fade}},
    ])
    return cid


def title(text, start, duration, size=0.048, y=-0.412, track='T4', x=0, color='#fff6df'):
    result = tool('title_add', start=start, duration=duration, trackId=track, offsetY=0,
        style={'content': text, 'fontFamily': '"Cabinet Grotesk"', 'fontWeight': 800,
            'fontSize': size, 'color': color, 'shadow': True, 'maxWidth': 0.94,
            'lineHeight': 1.08, 'tracking': 0.0005})
    cid = result['createdId']
    batch([
        {'op': 'setClipTransform', 'clipId': cid, 'offsetX': x},
        key(cid, 'opacity', 0, 0), key(cid, 'opacity', min(0.35/duration, 0.25), 1),
        key(cid, 'offsetY', 0, y+0.018), key(cid, 'offsetY', min(0.5/duration, 0.25), y),
        key(cid, 'opacity', max(0.75, 1-0.22/duration), 1), key(cid, 'opacity', 1, 0),
    ])
    return cid


def card(card_id, start, duration, x=0, y=0.07, scale=0.68, angle=0, track=None):
    if track is None:
        track = lanes['left' if x < -.05 else 'right' if x > .05 else 'center']
    cid = clip(ASSETS / 'cards' / (card_id+'.png'), start, duration, track,
               scale=scale, x=x, y=y, angle=angle)
    batch([
        key(cid, 'opacity', 0, 0), key(cid, 'opacity', min(.24/duration,.2), 1),
        key(cid, 'scale', 0, scale*.91), key(cid, 'scale', min(.65/duration,.3), scale),
        key(cid, 'scale', .9, scale*1.025), key(cid, 'scale', 1, scale*1.035),
        key(cid, 'offsetY', 0, y+.075), key(cid, 'offsetY', min(.65/duration,.3), y),
        key(cid, 'opacity', max(.8,1-.18/duration), 1), key(cid, 'opacity', 1, 0),
    ])
    return cid


print('Opening native Concat project...', flush=True)
if (PROJECT / 'concat.json').exists():
    existing = tool('project_open')
    if existing['timeline']['clips']:
        # Preserve each completed project before replacing this authored cut.
        import shutil
        old = WORK / 'previous-project'
        old.mkdir(exist_ok=True)
        shutil.copy2(PROJECT / 'concat.json', old / f'concat-{time.time_ns()}.json')
        batch([{'op': 'removeClips', 'clipIds': [c['id'] for c in existing['timeline']['clips']]}])
    extra = [t['id'] for t in existing['timeline']['tracks'] if t['id'] not in ('T1','T2','T3','T4')]
    if extra:
        batch([{'op':'removeTrack','trackId':tid} for tid in extra])
else:
    api.call('project_create', location=str(HERE), name=PROJECT.name,
             video={'width':1920,'height':1080,'rateNum':60,'rateDen':1})
tool('project_set_video', video={'width':1920,'height':1080,'rateNum':60,'rateDen':1})
for role in ['left','center','right','names','abilities']:
    lanes[role] = tool('track_add')['createdId']

background = clip(image_background(), 0, 90, 'T1')
batch([key(background, 'scale', 0, 1.0), key(background, 'scale', 1, 1.045),
       key(background, 'rotation', 0, -1), key(background, 'rotation', 1, 1)])
print('Building animated cards and native titles...', flush=True)
title('TWENTY UNIVERSES. ONE ARENA.', .15, 7.6, size=.055)
for cid, start, xpos, rot in [('c029',.1,-.29,-6),('c044',.42,0,0),('c076',.72,.29,6)]:
    card(cid,start,8-start,x=xpos,scale=.65,angle=rot)

sections = [
    ('battle',8,12,'UNLIKELY ALLIES. DEADLY SYNERGIES.'),
    ('relic',20,11,'Use iconic Relics to power your minions'),
    ('collection',31,12,'217 CARDS. MIX THEIR UNIVERSES.'),
    ('reward',55,13,'Conquer Universes. Claim their characters.'),
    ('powers',68,10,'CHOOSE YOUR POWER. CHANGE THE FIGHT.'),
]
for name,start,duration,headline in sections:
    print(f'Editing {name}...', flush=True)
    cid = clip(ASSETS/'clips'/f'{name}.mp4',start,duration,'T2',scale=.86,y=.06)
    title(headline,start+.12,duration-.3,size=.047 if len(headline)<40 else .043)
    # A gentle native push preserves the complete board and all card text.
    batch([key(cid,'scale',0,.855),key(cid,'scale',1,.88),
           {'op':'updateClip','clipId':cid,'patch':{'transitionIn':{'id':'concat.fade-white','duration':.16}}}])

title('TWENTY CHAMPIONS. UNIQUE POWERS.',43.12,11.6,size=.05)
card('c084',43,5.65,x=-.20,scale=.70)
title('MERUEM',43.65,4.6,size=.066,y=-.075,x=.205,track=lanes['names'])
title('Royal Appraisal\nDiscover a card.',44.15,4.1,size=.034,y=.12,x=.205,color='#d8d2e5',track=lanes['abilities'])
card('c114',48.65,6.35,x=-.20,scale=.70)
title('LORD VOLDEMORT',49.1,5.4,size=.045,y=-.075,x=.205,track=lanes['names'])
title('Dark Immortality\nDestroy his minions to defeat him.',49.6,4.9,size=.029,y=.12,x=.205,color='#d8d2e5',track=lanes['abilities'])

print('Building final six-character montage...', flush=True)
for cid,start,dur,xpos,angle in [
    ('c022',78,.8,0,-3),('c060',78.8,.8,0,3),('c070',79.6,.8,0,-2),
    ('c183',80.4,.8,0,2),('c025',81.2,.8,0,-2),('c027',82,3,0,0)]:
    card(cid,start,dur,x=xpos,scale=.87,angle=angle)

title('CONVERGENCE',85.12,4.75,size=.112,y=-.055,color='#ffe5a0')
title('Your deck. Your Universes.',85.65,4.15,size=.039,y=.13,color='#fff6df',track=lanes['abilities'])

print('Mixing native music, nine dialogue clips and sound effects...',flush=True)
sound = json.loads((HERE/'soundtrack.json').read_text(encoding='utf-8'))
music_track = tool('track_add',bottom=True)['createdId']
voice_track = tool('track_add',bottom=True)['createdId']
fx_tracks = [tool('track_add',bottom=True)['createdId'] for _ in range(5)]
music = clip(ASSETS/'audio/score-base.wav',0,90,music_track)
music_keys = [key(music,'volume',0,.7),key(music,'volume',1,0)]
for voice in sound['voices']:
    folder = GAME/'source/public/audio'/('vo/announcer' if voice.get('kind')=='announcer' else 'campaign')
    cid = clip(folder/(voice['file']+'.ogg'),voice['at'],voice['duration'],voice_track)
    tool('clip_update',clipId=cid,patch={'volume':.9})
    a,b = voice['at'], voice['at']+voice['duration']
    for second,gain in [(max(0,a-.25),.7),(a,.112),(b,.112),(min(90,b+.45),.7)]:
        music_keys.append(key(music,'volume',second/90,gain,(0,0,1,1)))
music_keys.extend([key(music,'volume',89/90,.7),key(music,'volume',1,0)])
batch(music_keys)
free = [0.0]*len(fx_tracks)
for event in sorted(sound['events'],key=lambda e:e['at']):
    filename = event['kind']+'.wav'
    seconds = {'impact':1.4,'whoosh':.6,'rise':2.2}[event['kind']]
    lane = next(i for i,end in enumerate(free) if end <= event['at']+.00001)
    free[lane] = event['at']+seconds
    cid = clip(ASSETS/'audio'/filename,event['at'],seconds,fx_tracks[lane])
    tool('clip_update',clipId=cid,patch={'volume':event['gain']*.5})

print('Checking timeline, save/reopen and undo/redo...', flush=True)
summary = tool('timeline_read')
tool('project_save')
full = tool('project_get')
(WORK/'project-state.json').write_text(json.dumps(full,indent=2),encoding='utf-8')
(WORK/'timeline.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
# Prove reversible edits on the actual populated production timeline.
test_title = tool('title_add',start=89,duration=.2,style={'content':'temporary edit check'})
tool('edit_undo')
assert tool('timeline_read')['timeline'] == summary['timeline'], 'Undo did not restore the timeline.'
tool('edit_redo')
tool('edit_undo')
tool('project_save')
tool('project_close',save=True)
reopened = tool('project_open')
assert len(reopened['timeline']['clips']) == len(summary['timeline']['clips']), 'Saved clip count changed.'
assert abs(reopened['timeline']['duration']-90) < .02, f"Timeline became {reopened['timeline']['duration']} seconds."
actual_cards = {c['name']:(c['start'],c['end']) for c in reopened['timeline']['clips'] if c['kind']=='image'}
assert actual_cards['c027.png'] == (82,85), 'Thanos must accompany his voice.'

for second in [3,13,25,37,46,51,62,72,83.5,87]:
    print(f'Preview frame {second}s...',flush=True)
    tool('preview_frame',time=second,width=1280,height=720,
         output=str(WORK/f'frame-{second}.png'))
print('Native Concat project saved. Starting full-quality export...',flush=True)
result = tool('export_start',output=str(WORK/'Convergence-Concat-Trailer.mp4'),
              crf=14,preset='medium',codec='h264',rateNum=60,rateDen=1)
job = result['job']
last = None
while True:
    state = api.call('export_wait',job=job,timeoutSeconds=30)
    # ExportWait may return a status with a timeout marker while still running.
    report = json.dumps(state,sort_keys=True)
    if report != last:
        print(report,flush=True)
        last = report
    (WORK/'export-state.json').write_text(json.dumps(state,indent=2),encoding='utf-8')
    if (WORK/'cancel-export').exists():
        api.call('export_cancel',job=job)
        raise RuntimeError('Export cancelled by the project control file.')
    if state.get('state') == 'done':
        break
    if state.get('state') in ('failed','cancelled'):
        raise RuntimeError(f'Concat export failed: {state}')
tool('project_close',save=True)
rendered = WORK/'Convergence-Concat-Trailer.mp4'
report = globals()['concat_finish'](PROJECT,rendered,OUTPUT)
if report['issues']:
    raise RuntimeError(f"Finished video failed verification: {report['issues']}")
print(f'Export verified and delivered: {OUTPUT}',flush=True)
