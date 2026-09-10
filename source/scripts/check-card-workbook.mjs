import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './card-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const generator = path.join(root, 'source/scripts/sync-card-workbook.mjs');
const workbook = path.join(root, 'materials/Convergence card stat excel sheet.xlsx');
const runtime = process.env.CONVERGENCE_ARTIFACT_RUNTIME || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
const python = path.join(runtime, process.platform === 'win32' ? 'python/python.exe' : 'python/bin/python');
function sync(args = [], ok = true) {
  const child = spawnSync(process.execPath, [generator, ...args], {encoding:'utf8', windowsHide:true});
  if (child.error) throw child.error;
  if (ok) assert.equal(child.status, 0, child.stdout + child.stderr);
  else assert.notEqual(child.status, 0, 'A stale or invalid workbook was accepted.');
  return child;
}

// Independent XML/CSV reader: verifies what Excel actually receives, including
// cached formula results, rather than trusting the builder's in-memory objects.
const verify = String.raw`
import csv, json, re, sys, zipfile, xml.etree.ElementTree as E
book, data_dir, root = sys.argv[1:]
ns = {'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def source(name):
    with open(data_dir+'/'+name,encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))
cards, relics = source('cards.csv'), source('relics.csv')
types = open(root+'/source/src/engine/types.ts',encoding='utf-8').read()
tiers = dict(re.findall(r'code:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"',types))
with zipfile.ZipFile(book) as z:
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        strings = [''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))]
    def sheet(number):
        xml=E.fromstring(z.read(f'xl/worksheets/sheet{number}.xml'))
        cells={}
        for c in xml.findall('.//x:sheetData/x:row/x:c',ns):
            v=c.find('x:v',ns)
            text=v.text if v is not None and v.text is not None else ''
            if c.get('t')=='s': text=strings[int(text)]
            elif c.get('t')=='inlineStr': text=''.join(c.find('x:is',ns).itertext())
            elif c.get('t')=='e': raise AssertionError(f'Excel error at {c.get("r")}: {text}')
            cells[c.get('r')]=text
        return cells,xml
    a, ax=sheet(1); b,bx=sheet(2); summary,_=sheet(4)
    actual_cards={a[f'L{i}']:i for i in range(2,len(cards)+2)}
    actual_relics={b[f'F{i}']:i for i in range(2,len(relics)+2)}
    assert set(actual_cards)=={c['id'] for c in cards}
    assert set(actual_relics)=={c['id'] for c in relics}
    assert len([v for k,v in a.items() if re.fullmatch(r'L\d+',k) and k!='L1' and v])==len(cards)
    assert len([v for k,v in b.items() if re.fullmatch(r'F\d+',k) and k!='F1' and v])==len(relics)
    for c in cards:
        i=actual_cards[c['id']]
        for col,key in [('A','cost'),('D','atk'),('E','hp')]: assert float(a[col+str(i)])==float(c[key]),(c['name'],key)
        for col,key in [('B','name'),('G','camp'),('H','alignment'),('I','effect'),('J','flavor'),('K','origin')]: assert a.get(col+str(i),'')==c[key].strip(),(c['name'],key)
        assert a[f'F{i}']==tiers[c['rarity']]
        assert a[f'C{i}']==f"{int(c['atk'])}/{int(c['hp'])}"
    for c in relics:
        i=actual_relics[c['id']]
        assert float(b[f'A{i}'])==float(c['cost'])
        for col,key in [('B','name'),('C','effect'),('D','flavor'),('E','origin')]: assert b.get(col+str(i),'')==c[key].strip(),(c['name'],key)
    roster_row=int(next(k[1:] for k,v in summary.items() if k.startswith('A') and v=='Roster'))
    assert [float(summary[f'B{roster_row+i}']) for i in [1,2,3]]==[len(cards),len(relics),len(cards)+len(relics)]
    mana=sorted({int(c['cost']) for c in cards+relics},reverse=True)
    for row,cost in enumerate(mana,2):
        assert float(summary[f'D{row}'])==cost
        assert float(summary[f'E{row}'])==sum(int(c['cost'])==cost for c in cards+relics)
    for xml in [ax,bx]:
        pane=xml.find('.//x:pane',ns)
        assert pane is not None and pane.get('xSplit')=='2' and pane.get('ySplit')=='1', 'Frozen headers or identifiers missing'
        assert xml.find('.//x:tableParts',ns) is not None, 'Filterable roster table missing'
    rules,_=sheet(3)
    readme=open(root+'/README.md',encoding='utf-8').read()
    section=re.search(r'## Rules at a glance\n([\s\S]*?)(?=\n## )',readme).group(1)
    expected=[re.sub(r'^- ','',line).replace('**','').strip() for line in section.splitlines() if line.strip()]
    assert [rules.get(f'A{i+3}','') for i in range(len(expected))]==expected
print(f'PASS exported workbook: {len(cards)} cards, {len(relics)} relics, every value, stats formulas, totals, rules, filters and frozen panes.')
`;

function inspect(book = workbook, data = path.join(root, 'source/data')) {
  const child = spawnSync(python, ['-c', verify, book, data, root], {encoding:'utf8', windowsHide:true});
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stdout + child.stderr);
  console.log(child.stdout.trim());
}

sync();
sync(['--check']);
inspect();
const before = (await fs.stat(workbook)).mtimeMs;
sync();
assert.equal((await fs.stat(workbook)).mtimeMs, before, 'An unchanged workbook should not be rewritten.');

if (process.argv.includes('--exercise')) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'convergence-workbook-test-'));
  try {
    const out = path.join(scratch, 'cards.xlsx');
    const data = path.join(scratch, 'data'); await fs.mkdir(data);
    const writeCsv = async (name, rows) => {
      const headers = Object.keys(rows[0]);
      const encode = value => `"${String(value).replaceAll('"','""')}"`;
      await fs.writeFile(path.join(data,name), [headers,...rows.map(row => headers.map(key => row[key]))].map(row => row.map(encode).join(',')).join('\n'));
    };
    const cards = parseCsv(await fs.readFile(path.join(root,'source/data/cards.csv'),'utf8'));
    const relics = parseCsv(await fs.readFile(path.join(root,'source/data/relics.csv'),'utf8'));
    const params = ['--output',out,'--data-dir',data];
    await writeCsv('cards.csv',cards); await writeCsv('relics.csv',relics);
    sync([...params,'--check'], false);
    sync(params); inspect(out,data);
    const wick = cards.find(card => card.id === 'c001');
    wick.name = 'John Wick, refreshed'; wick.atk = '2'; wick.hp = '0'; wick.effect = 'A quoted "effect",\nwith a second line';
    cards.push({...wick,id:'c999',name:'Added card'});
    relics.push({...relics[0],id:'r999',name:'Added relic',cost:'7'});
    await writeCsv('cards.csv',cards); await writeCsv('relics.csv',relics);
    sync([...params,'--check'], false);
    sync(params); inspect(out,data);
    await fs.appendFile(out,'tampered');
    sync([...params,'--check'], false);
    sync(params); inspect(out,data);
    cards.pop(); relics.pop();
    await writeCsv('cards.csv',cards); await writeCsv('relics.csv',relics);
    sync(params); inspect(out,data);
    cards.push({...cards[0]}); await writeCsv('cards.csv',cards);
    const preserved = await fs.readFile(out);
    sync(params,false);
    assert.deepEqual(await fs.readFile(out),preserved,'Invalid source must preserve the last workbook.');
    console.log('PASS refresh lifecycle: missing file, edits, zero stats, quoted multiline text, added/removed cards and relics, tampering, invalid source, and no unnecessary rewrite.');
  } finally {
    const resolved = await fs.realpath(scratch);
    assert(resolved.toLowerCase().startsWith(path.join(await fs.realpath(os.tmpdir()),'convergence-workbook-test-').toLowerCase()));
    await fs.rm(resolved,{recursive:true,force:true});
  }
}
