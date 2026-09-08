"""Render the campaign reading copy from committed JSON, live CSVs and README rules.

No card allocation, reward selection, README edits or gameplay writes occur here.
"""
import argparse, base64, csv, html, json, os, re, tempfile
from collections import Counter
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('output',type=Path,help='Destination HTML review file')
REPORT=parser.parse_args().output.resolve()
ROOT=Path(__file__).resolve().parents[1]
plan=json.loads((ROOT/'materials/campaign-design.json').read_text(encoding='utf-8'))
aliases={key.lower():value for key,value in plan['universeAliases'].items()}
cards=[]
for file in ['cards.csv','relics.csv']:
    with (ROOT/'source/data'/file).open(encoding='utf-8-sig',newline='') as stream:
        cards.extend(csv.DictReader(stream))
for card in cards:
    card['universe']=aliases.get(card['origin'].lower(),card['origin'])
    card['cost']=int(card['cost'])
    card['kind']='relic' if card['id'].startswith('r') else 'minion'
byid={card['id']:card for card in cards}
starter=plan['starterCardIds']
chapters=[dict(ch,profile=plan['difficultyProfiles'][ch['difficultyId']]['label']) for ch in plan['chapters']]
power_source=(ROOT/'source/src/engine/hero-powers.ts').read_text(encoding='utf-8')
power_names=dict(re.findall(r'id: "([^"]+)",\s*name: "([^"]+)"',power_source))
assert len(power_names)==10,'Hero Power source format changed; update the report parser'
readme=(ROOT/'README.md').read_text(encoding='utf-8')
block=readme.split('<!-- CAMPAIGN-DESIGN-START -->',1)[1].split('<!-- CAMPAIGN-DESIGN-END -->',1)[0]
rules=[]
for section in block.split('\n#### ')[1:]:
    title,prose=section.split('\n',1)
    paragraphs=[' '.join(p.splitlines()) for p in prose.strip().split('\n\n') if p.strip()]
    rules.append((title,paragraphs))
assert rules,'No campaign rules found in README'

E=html.escape
def name(x):return E(byid[x]['name'])
def card_button(x):return f'<button class="card-name" data-card="{x}">{name(x)}</button>'
def card_rows(xs):
    return '<div class="card-list">'+''.join(f'<div class="card-row"><span class="mana">{byid[x]["cost"]}</span><div>{card_button(x)}<small>{E(byid[x].get("camp","Relic"))} · {E(byid[x].get("alignment","Equipment"))}</small></div></div>' for x in xs)+'</div>'
def portrait(x):
    art=ROOT/'source/public'/byid[x]['art'].lstrip('/')
    return 'data:image/webp;base64,'+base64.b64encode(art.read_bytes()).decode()
parts=['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convergence Campaign Design</title><style>']
parts.append('''
:root{color-scheme:light;--ink:#233c40;--paper:#f5eddb;--gold:#a26824;--line:#c9b99a;--teal:#286265}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Georgia,serif}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--teal);outline-offset:3px}header{padding:48px max(24px,calc((100vw - 1180px)/2));background:#29484d;color:#f7ecd5;border-bottom:8px solid #b98339}.kicker{font:12px/1.5 Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#e6c68c}h1{font-size:clamp(36px,5vw,66px);line-height:1.04;margin:12px 0 20px;font-weight:normal;max-width:780px}header p{max-width:770px;color:#e6dfcd;font-size:19px}.metrics{display:flex;flex-wrap:wrap;gap:24px;margin-top:28px}.metric{border-left:1px solid #ad976b;padding-left:16px}.metric b{display:block;font:32px Georgia,serif}.metric span{font:12px Arial,sans-serif;text-transform:uppercase;letter-spacing:1px}main{max-width:1228px;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}nav button{border:1px solid var(--line);background:#fff9ed;color:var(--ink);padding:10px 16px;border-radius:3px}nav button[aria-selected=true]{background:var(--teal);color:#fff}h2{font-size:32px;font-weight:normal;line-height:1.15}h3{font-size:23px;font-weight:normal;margin:0 0 12px}.intro{max-width:900px}.note{padding:18px 22px;border-left:4px solid var(--gold);background:#eadfc7;margin:22px 0}.searchbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:22px 0}.searchbar label{font:14px Arial,sans-serif}.searchbar input{flex:1;min-width:160px;padding:11px;border:1px solid var(--line);background:#fffaf0;color:var(--ink)}.searchbar span{font:13px Arial,sans-serif}.panel[hidden],.chapter[hidden]{display:none}.route{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.route-item{background:#fff9eb;border:1px solid var(--line);padding:20px}.chapter-no{font:12px Arial,sans-serif;color:var(--gold);letter-spacing:1px}.route-item h3{margin:9px 0}.route-item p{font-size:15px;margin:8px 0}.badge{display:inline-block;font:12px Arial,sans-serif;padding:4px 8px;background:#e1e9df;margin:3px 4px 3px 0}.route-item a{color:var(--teal);font-size:14px}.chapter{margin:16px 0;border:1px solid var(--line);background:#fff9ed}.chapter>summary{padding:18px;cursor:pointer;display:flex;align-items:center;gap:20px;list-style:none}.chapter>summary::after{content:'+';font-size:27px;margin-left:auto;color:var(--gold)}.chapter[open]>summary::after{content:'−'}.portrait{width:100px;height:120px;object-fit:contain;background:#e6ddc8;flex:0 0 100px}.summary-copy{min-width:0}.summary-copy h3{margin:4px 0}.summary-copy p{margin:5px 0;font-size:15px}.chapter-body{padding:4px 22px 24px}.card-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 22px}.card-row{display:flex;align-items:center;gap:10px;min-height:61px;border-bottom:1px solid #e1d7c2;padding:8px 0;min-width:0}.card-row>div{min-width:0}.mana{display:grid;place-items:center;background:#d5e2dc;border:1px solid #9dbbb0;border-radius:50%;width:30px;height:30px;flex:0 0 30px;font:bold 14px Arial,sans-serif}.card-name{border:0;padding:0;background:none;color:#234e55;text-align:left;font-size:16px;text-decoration:underline;text-decoration-color:#a7b9ac;text-underline-offset:3px}.card-row small{display:block;font:11px Arial,sans-serif;color:#726850;margin-top:3px}.rule-block{padding:22px 0;border-bottom:1px solid var(--line);max-width:930px}.rule-block p{margin:12px 0}.reward-count{color:var(--teal);font:bold 14px Arial,sans-serif}.empty{padding:25px;background:#eadfc7}dialog{width:min(540px,calc(100vw - 32px));border:2px solid var(--gold);background:#fff9eb;color:var(--ink);padding:28px}dialog::backdrop{background:#233c40aa}dialog button.close{float:right;background:none;border:1px solid var(--line);padding:5px 10px}dialog h2{clear:both;padding-top:20px}footer{margin:40px 0 10px;font:13px Arial,sans-serif;color:#71674f}.curve{display:flex;align-items:end;gap:8px;height:125px;margin:24px 0 40px}.curve div{flex:1;text-align:center;height:100%;display:flex;flex-direction:column;justify-content:end}.curve b{display:block;background:#759b8c;min-height:3px;height:var(--height);font:12px Arial,sans-serif;padding-top:3px}.curve small{font:12px Arial,sans-serif;margin-top:8px}@media(max-width:900px){.route{grid-template-columns:repeat(2,minmax(0,1fr))}.card-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){header{padding:32px 20px}main{padding:18px}.route,.card-list{grid-template-columns:minmax(0,1fr)}.portrait{width:65px;height:88px;flex-basis:65px}.chapter>summary{gap:12px;padding:13px}.summary-copy h3{font-size:20px}nav button{padding:9px 10px;font-size:14px}.metrics{gap:18px}.metric b{font-size:28px}.chapter-body{padding:4px 15px 20px}}
''')
parts.append('[hidden]{display:none!important}</style></head><body><header><div class="kicker">Convergence · Campaign proposal</div><h1>Thirty cards.<br>Twenty challengers.</h1><p>A fixed starter deck becomes your own creation. Every defeated universe adds new choices; your next duel still begins with thirty cards.</p><div class="metrics"><div class="metric"><b>20</b><span>Named opponents</span></div><div class="metric"><b>30</b><span>Cards per deck</span></div><div class="metric"><b>216</b><span>Cards allocated</span></div><div class="metric"><b>600</b><span>Boss deck slots</span></div></div></header><main>')
tabs=[('route','Campaign route'),('starter','Starter deck'),('decks','Boss decks'),('rewards','Chapter rewards'),('rules','Rules & next steps')]
parts.append('<nav aria-label="Design sections">'+''.join(f'<button data-tab="{id}" aria-selected="false">{label}</button>' for id,label in tabs)+'</nav><div class="searchbar"><label for="search">Search this section</label><input id="search" type="search" placeholder="Type a name or keyword…"><span id="result-count" aria-live="polite"></span></div>')
parts.append('<section class="panel" id="route"><h2>The proposed campaign order</h2><p class="intro">Begin against formations and combat specialists. Advance through control decks, pirate emperors and cosmic threats. Bill Cipher is the final encounter. These placements are a design proposal, not measured difficulty rankings.</p><div class="note">All four campaign chunks are implemented: twenty character opponents, custom decks, fixed rewards, progression and save/reset handling. Chapters 1–9 give nine cards each to preserve complete larger universe packs later. Chapter 20 keeps its own one-card reward.</div><div class="route">')
cumulative=30
for ch in chapters:
    cumulative+=len(ch['rewardCardIds'])
    parts.append(f'<article class="route-item searchable" data-search="{E(byid[ch["bossId"]]["name"]+" "+ch["universe"]+" "+ch["theme"])}"><span class="chapter-no">CHAPTER {ch["chapter"]:02}</span><h3>{name(ch["bossId"])}</h3><span class="badge">{ch["profile"]}</span><p>{E(ch["theme"])}</p><p><strong>+{len(ch["rewardCardIds"])} cards</strong> · {cumulative} owned afterward</p><a href="#deck-{ch["chapter"]}" data-jump="deck-{ch["chapter"]}">Inspect fixed deck</a></article>')
parts.append('</div></section><section class="panel" id="starter"><h2>Your first thirty cards</h2><p class="intro">All ten Basic cards, sixteen additional minions and four relics. No Mythics and no future boss-universe cards. The curve is deliberately flat: three cards at every mana cost from one through ten. This starter-only rule does not restrict later custom decks.</p><p>The deck becomes editable after chapter one. The new cards remain in your collection until you choose a swap.</p><h3>Cards by mana cost</h3><div class="curve">')
counts=Counter(byid[x]['cost'] for x in starter)
for n in range(1,11):parts.append(f'<div><b style="--height:{counts[n]/max(counts.values())*100}%">{counts[n]}</b><small>{n}</small></div>')
parts.append('</div>'+card_rows(sorted(starter,key=lambda x:(byid[x]['cost'],x)))+'</section>')
for tab,field,title in [('decks','deckCardIds','Twenty fixed opponent decks'),('rewards','rewardCardIds','Every first-clear reward')]:
    parts.append(f'<section class="panel" id="{tab}"><h2>{title}</h2><p>Open a chapter to inspect every card. Click a card name to read its current printed effect.</p>')
    if tab=='decks':parts.append('<p>All decks have thirty different cards. The full universe is mandatory; filler cards support the theme and may unlock later. A boss deck does not determine its reward pack. Listed order is for reading; every attempt shuffles independently.</p>')
    else:parts.append('<p>Thirty starter cards plus these 186 rewards cover all 216 cards exactly once. No pack rerolls. No daily, loss, draw or replay rewards.</p>')
    for ch in chapters:
        xs=ch[field]; search=' '.join(byid[x]['name']+' '+byid[x]['universe']+' '+byid[x].get('camp','Relic') for x in xs)
        anchor=('deck-' if tab=='decks' else 'reward-')+str(ch['chapter'])
        parts.append(f'<details class="chapter searchable" id="{anchor}" data-search="{E(byid[ch["bossId"]]["name"]+" "+search)}"'+(' open' if ch['chapter']==1 else '')+f'><summary><img class="portrait" src="{portrait(ch["bossId"])}" alt="{name(ch["bossId"])}"><div class="summary-copy"><span class="chapter-no">CHAPTER {ch["chapter"]:02} · {E(ch["universe"])}</span><h3>{name(ch["bossId"])}</h3><p>{E(ch["theme"])}</p><span class="reward-count">{len(xs)} cards</span></div></summary><div class="chapter-body">')
        if tab=='decks':
            cc=Counter(byid[x]['cost'] for x in xs)
            parts.append(f'<p><strong>{ch["profile"]} · {power_names[ch["heroPowerId"]]}</strong> · 75 Core HP · Mean cost {sum(byid[x]["cost"] for x in xs)/30:.2f}</p><p>{E(ch["designReason"])}</p>'+card_rows(xs))
        else:
            parts.append('<h3>Complete universe</h3>'+card_rows(ch['universeCardIds']))
            if ch['fillerRewardIds']:parts.append('<h3 style="margin-top:24px">Fixed additional cards</h3>'+card_rows(ch['fillerRewardIds']))
            else:parts.append('<p>This reward contains the universe only, with no filler cards.</p>')
        parts.append('</div></details>')
    parts.append('</section>')
parts.append('<section class="panel" id="rules"><h2>Rules, rulings and implementation boundaries</h2>')
for title,paragraphs in rules:
    parts.append(f'<article class="rule-block"><h3>{E(title)}</h3>'+''.join('<p>'+E(p)+'</p>' for p in paragraphs)+'</article>')
parts.append('</section><p class="empty" id="empty" hidden>No matching bosses or cards in this section. Clear the search or choose another section.</p><footer>Source: current Convergence card and relic data, approved campaign requirements, and the phase-one proposal. The campaign, deck builder, progression and character banners are implemented. Release verification covers the generated package and public game.</footer></main><dialog id="card-dialog"><button class="close" aria-label="Close card details">Close</button><h2 id="card-title"></h2><p id="card-meta"></p><p id="card-effect"></p></dialog>')
embedded={x:{k:byid[x].get(k,'') for k in ['name','cost','kind','camp','alignment','effect','universe','atk','hp']} for x in byid}
parts.append('<script id="card-data" type="application/json">'+json.dumps(embedded,ensure_ascii=False).replace('<','\\u003c')+'</script><script>')
parts.append('''
const data=JSON.parse(document.getElementById('card-data').textContent), panels=[...document.querySelectorAll('.panel')], nav=[...document.querySelectorAll('[data-tab]')], input=document.getElementById('search');let active='route';
function filter(){const q=input.value.trim().toLowerCase();const panel=document.getElementById(active);const rows=[...panel.querySelectorAll(active==='starter'?'.card-row':active==='rules'?'.rule-block':'.searchable')];let shown=0;for(const row of rows){row.hidden=!!q&&!(row.dataset.search||row.textContent).toLowerCase().includes(q);if(!row.hidden)shown++;}const unit=active==='starter'?'cards':active==='rules'?'sections':'chapters';document.getElementById('result-count').textContent=rows.length?`${shown} of ${rows.length} ${unit}`:'';document.getElementById('empty').hidden=!rows.length||shown>0;}
function activate(id,write=false){active=id;for(const p of panels)p.hidden=p.id!==id;for(const b of nav)b.setAttribute('aria-selected',String(b.dataset.tab===id));filter();if(write)history.replaceState(null,'','#'+id);}
for(const b of nav)b.addEventListener('click',()=>activate(b.dataset.tab,true));input.addEventListener('input',filter);
for(const a of document.querySelectorAll('[data-jump]'))a.addEventListener('click',e=>{e.preventDefault();input.value='';activate('decks');const d=document.getElementById(a.dataset.jump);d.open=true;history.replaceState(null,'','#'+d.id);d.scrollIntoView({block:'start'});});
const dialog=document.getElementById('card-dialog');for(const b of document.querySelectorAll('[data-card]'))b.addEventListener('click',()=>{const c=data[b.dataset.card];document.getElementById('card-title').textContent=c.name;document.getElementById('card-meta').textContent=`${c.cost} mana · ${c.universe} · ${c.kind==='relic'?'Relic':c.camp+' / '+c.alignment+' · '+c.atk+' ATK / '+c.hp+' HP'}`;document.getElementById('card-effect').textContent=c.effect;if(!dialog.open)dialog.showModal();});dialog.querySelector('.close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function fromHash(){const h=location.hash.slice(1);if(h.startsWith('deck-')||h.startsWith('reward-')){activate(h.startsWith('deck-')?'decks':'rewards');const d=document.getElementById(h);if(d){d.open=true;d.scrollIntoView();}}else activate(panels.some(p=>p.id===h)?h:'route');}fromHash();window.addEventListener('hashchange',fromHash);
</script></body></html>
''')
REPORT.parent.mkdir(parents=True, exist_ok=True)
output=''.join(parts)
if not REPORT.exists() or REPORT.read_bytes()!=output.encode('utf-8'):
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',newline='',dir=REPORT.parent,
            prefix=REPORT.stem+' ',suffix='.tmp',delete=False) as stream:
        staging=Path(stream.name)
        stream.write(output)
    try:
        os.replace(staging,REPORT)
    finally:
        staging.unlink(missing_ok=True)
print('Report:',REPORT)
