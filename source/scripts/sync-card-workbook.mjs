import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCards, readRelics, engineVocabulary, parseCsv } from './card-tools.mjs';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = path.resolve(option('--output', path.join(root, 'materials/Convergence card stat excel sheet.xlsx')));
const manifest = `${output}.sync.json`;
const preview = path.join(root, '.preview/card-workbook');
const dataDir = option('--data-dir', null);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const readJson = async (file) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; } };
const fileHash = async (file) => {
  try { return hash(await fs.readFile(file)); }
  catch (e) {
    if (e.code === 'ENOENT') return null;
    if (['EBUSY','EACCES','EPERM'].includes(e.code)) throw new Error(`Cannot read ${file}. Close the workbook in Excel and retry; freshness could not be verified.`, {cause:e});
    throw e;
  }
};

async function model() {
  const cards = dataDir ? parseCsv(await fs.readFile(path.join(dataDir, 'cards.csv'), 'utf8')) : readCards();
  const relics = dataDir ? parseCsv(await fs.readFile(path.join(dataDir, 'relics.csv'), 'utf8')) : readRelics();
  const vocab = engineVocabulary();
  const readme = (await fs.readFile(path.join(root, 'README.md'), 'utf8')).replaceAll('\r\n', '\n');
  const section = readme.match(/## Rules at a glance\n([\s\S]*?)(?=\n## )/);
  if (!section) throw new Error('README Rules at a glance section is missing; restore it before refreshing the workbook.');
  const rules = section[1].split('\n').map(line => line.replace(/^- /, '').replaceAll('**', '').trim()).filter(Boolean);
  const ids = [...cards, ...relics].map(card => card.id);
  if (!cards.length || !relics.length || new Set(ids).size !== ids.length || ids.some(id => !id)) throw new Error('Card workbook source has empty or duplicate card IDs.');
  for (const card of cards) {
    if (!vocab.rarityName[card.rarity]) throw new Error(`Unknown rarity for ${card.name}: ${card.rarity}`);
    for (const field of ['cost', 'atk', 'hp']) if (!Number.isFinite(Number(card[field])) || card[field] === '') throw new Error(`${card.name} has invalid ${field}.`);
  }
  for (const relic of relics) if (!Number.isFinite(Number(relic.cost)) || relic.cost === '') throw new Error(`${relic.name} has invalid mana cost.`);
  const fingerprint = hash(JSON.stringify({cards, relics, rules, rarity: vocab.rarityName, generator: hash((await fs.readFile(script, 'utf8')).replaceAll('\r\n', '\n'))}));
  const byCard = (a, b) => Number(b.cost) - Number(a.cost) || a.name.localeCompare(b.name, 'en');
  return {cards: cards.sort(byCard), relics: relics.sort(byCard), rules, vocab, fingerprint};
}

async function current(data) {
  const saved = await readJson(manifest);
  return saved?.sourceSha256 === data.fingerprint && saved?.workbookSha256 === await fileHash(output);
}

async function run() {
  const data = await model();
  if (await current(data) && !args.includes('--force') && !args.includes('--render')) {
    console.log(`Card workbook current: ${data.cards.length} cards + ${data.relics.length} relics.`);
    return;
  }
  if (args.includes('--check')) throw new Error('Card workbook is missing, edited, or stale. Run npm run sync:cards before publication.');

  const runtime = process.env.CONVERGENCE_ARTIFACT_RUNTIME || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
  const node = path.join(runtime, process.platform === 'win32' ? 'node/bin/node.exe' : 'node/bin/node');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(node).toLowerCase()) {
    try { await fs.access(node); } catch { throw new Error(`Bundled spreadsheet runtime is missing at ${node}. Restore Codex workspace dependencies before building; the stale workbook has not been accepted.`); }
    const child = spawnSync(node, [script, ...args], {stdio:'inherit', windowsHide:true});
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Card workbook refresh failed (exit ${child.status}). See the preceding error.`);
    return;
  }

  await fs.mkdir(preview, {recursive:true});
  await fs.mkdir(path.dirname(output), {recursive:true});
  const lock = `${output}.sync.lock`;
  let handle;
  const started = Date.now();
  while (!handle) {
    try {
      handle = await fs.open(lock, 'wx');
      await handle.writeFile(JSON.stringify({pid:process.pid}));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = await readJson(lock);
      if (owner?.pid) {
        try { process.kill(owner.pid, 0); } catch (check) { if (check.code === 'ESRCH') { await fs.unlink(lock).catch(() => {}); continue; } }
      }
      if (Date.now() - started > 120000) throw new Error(`Another workbook refresh still owns ${lock}. Wait for that refresh to finish before retrying.`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  const temp = `${output}.${randomUUID()}.tmp`;
  try {
    if (await current(data) && !args.includes('--force') && !args.includes('--render')) return;
    const packages = path.join(runtime, 'node/node_modules');
    const junction = path.join(preview, 'node_modules');
    try { await fs.symlink(packages, junction, process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const require = createRequire(path.join(preview, 'package.json'));
    const {Workbook, SpreadsheetFile} = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
    const wb = Workbook.create();
    const sheets = Object.fromEntries(['Cards', 'Relics', 'Rules', 'Summary'].map(name => [name, wb.worksheets.add(name)]));
    const {cards, relics, rules, vocab} = data;
    const cardRows = cards.map(c => [Number(c.cost), c.name, null, Number(c.atk), Number(c.hp), vocab.rarityName[c.rarity], c.camp, c.alignment, c.effect, c.flavor, c.origin, c.id]);
    const relicRows = relics.map(c => [Number(c.cost), c.name, c.effect, c.flavor, c.origin, c.id]);
    const base = (sheet, address) => { sheet.getRange(address).format = {font:{name:'Calibri',size:11,color:'#17202B'},verticalAlignment:'center',rowHeight:28}; sheet.showGridLines = false; };
    const header = (sheet, address) => { sheet.getRange(address).format = {fill:'#1F2937',font:{name:'Calibri',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',wrapText:true,rowHeight:28}; };
    function roster(sheet, name, rows, headers, widths) {
      const end = rows.length + 1;
      const last = String.fromCharCode(64 + headers.length);
      base(sheet, `A1:${last}${end}`);
      sheet.getRange(`A1:${last}${end}`).values = [headers, ...rows];
      sheet.tables.add(`A1:${last}${end}`, true, name);
      header(sheet, `A1:${last}1`);
      for (let i = 0; i < widths.length; i++) sheet.getRangeByIndexes(0, i, end, 1).format.columnWidth = widths[i];
      sheet.getRange(`B2:B${end}`).format.font.bold = true;
      sheet.getRange(`A2:A${end}`).setNumberFormat('0');
      sheet.freezePanes.freezeRows(1); sheet.freezePanes.freezeColumns(2);
    }
    roster(sheets.Cards, 'CardRoster', cardRows, ['Cost','Name','Stats','ATK','HP','Rarity','Camp','Alignment','Card Effect','Flavor Text','Origin','Card ID'], [8,33,9,7,7,15,14,14,66,44,27,12]);
    roster(sheets.Relics, 'RelicRoster', relicRows, ['Cost','Name','Card Effect','Flavor Text','Origin','Card ID'], [8,33,75,44,27,12]);
    const cardEnd = cards.length + 1, relicEnd = relics.length + 1;
    sheets.Cards.getRange(`C2:C${cardEnd}`).formulas = cards.map((_, i) => [`=D${i+2}&"/"&E${i+2}`]);
    sheets.Cards.getRange(`D2:E${cardEnd}`).setNumberFormat('0');
    const rarityFills = {Rare:'#E5E7EB',Epic:'#E9D5FF',Legendary:'#FFE28A',Mythic:'#F7B4AD'};
    const campFills = {Tech:'#D9EAF7',Nature:'#DFEFD8',Magic:'#E9DFF3',ALL:'#EEE8D8'};
    for (const [value, fill] of Object.entries(rarityFills)) sheets.Cards.getRange(`F2:F${cardEnd}`).conditionalFormats.add('containsText', {text:value,format:{fill,font:{bold:true}}});
    for (const [value, fill] of Object.entries(campFills)) sheets.Cards.getRange(`G2:G${cardEnd}`).conditionalFormats.add('containsText', {text:value,format:{fill}});
    for (const [value, fill] of Object.entries({Good:'#DEEBF7',Evil:'#F8E0E4',Neutral:'#EFEFEF'})) sheets.Cards.getRange(`H2:H${cardEnd}`).conditionalFormats.add('containsText', {text:value,format:{fill}});
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      sheets.Cards.getRange(`I${i+2}:K${i+2}`).format.wrapText = true;
      sheets.Cards.getRange(`A${i+2}:L${i+2}`).format.rowHeight = Math.max(42, Math.ceil(c.effect.length / 65) * 16 + 12, Math.ceil(c.flavor.length / 43) * 16 + 12, Math.ceil(c.name.length / 31) * 16 + 12);
      sheets.Cards.getRange(`A${i+2}:L${i+2}`).format.fill = i % 2 ? '#FFFFFF' : '#F6F6F6';
      sheets.Cards.getRange(`B${i+2}`).format.wrapText = true;
    }
    for (let i = 0; i < relics.length; i++) {
      const c = relics[i];
      sheets.Relics.getRange(`B${i+2}:E${i+2}`).format.wrapText = true;
      sheets.Relics.getRange(`A${i+2}:F${i+2}`).format.rowHeight = Math.max(42, Math.ceil(c.effect.length / 74) * 16 + 12, Math.ceil(c.flavor.length / 43) * 16 + 12);
      sheets.Relics.getRange(`A${i+2}:F${i+2}`).format.fill = i % 2 ? '#FFFFFF' : '#F6F6F6';
    }
    sheets.Cards.getRange(`A1:A${cardEnd}`).format.horizontalAlignment = 'center';
    sheets.Cards.getRange(`C1:H${cardEnd}`).format.horizontalAlignment = 'center';
    sheets.Relics.getRange(`A1:A${relicEnd}`).format.horizontalAlignment = 'center';
    base(sheets.Rules, `A1:A${rules.length+2}`);
    sheets.Rules.getRange('A1').values = [['Convergence rules']];
    sheets.Rules.getRange('A1').format.font = {name:'Calibri',size:15,bold:true,color:'#1F2937'};
    sheets.Rules.getRange(`A1:A${rules.length+2}`).format.columnWidth = 125;
    sheets.Rules.getRange(`A3:A${rules.length+2}`).values = rules.map(rule => [rule]);
    sheets.Rules.getRange(`A3:A${rules.length+2}`).format.wrapText = true;
    rules.forEach((rule, i) => { sheets.Rules.getRange(`A${i+3}`).format.rowHeight = Math.max(34, Math.ceil(rule.length / 122) * 17 + 16); });
    const summary = sheets.Summary;
    const tierNames = vocab.rarities.map(code => vocab.rarityName[code]).reverse();
    const manaValues = [...new Set([...cards,...relics].map(c => Number(c.cost)))].sort((a,b) => b-a);
    const campHeader = tierNames.length + 4;
    const rosterHeader = campHeader + vocab.camps.length + 3;
    const alignmentHeader = manaValues.length + 3;
    const endSummary = Math.max(rosterHeader + 3, alignmentHeader + vocab.alignments.length + 1);
    base(summary, `A1:E${endSummary}`);
    summary.getRange(`A1:A${endSummary}`).format.columnWidth = 23; summary.getRange(`B1:B${endSummary}`).format.columnWidth = 12;
    summary.getRange(`C1:C${endSummary}`).format.columnWidth = 4; summary.getRange(`D1:D${endSummary}`).format.columnWidth = 23; summary.getRange(`E1:E${endSummary}`).format.columnWidth = 12;
    for (const [cell, text] of [['A1','By Rarity'],[`A${campHeader}`,'By Camp'],[`A${rosterHeader}`,'Roster'],['D1','By Mana Cost'],[`D${alignmentHeader}`,'By Alignment']]) { summary.getRange(cell).values = [[text]]; summary.getRange(cell).format.font.bold = true; }
    tierNames.forEach((name, i) => { summary.getRange(`A${i+2}`).values = [[name]]; summary.getRange(`B${i+2}`).formulas = [[`=COUNTIF(Cards!F2:F${cardEnd},A${i+2})`]]; });
    summary.getRange(`A${tierNames.length+2}`).values = [['Total cards']]; summary.getRange(`B${tierNames.length+2}`).formulas = [[`=SUM(B2:B${tierNames.length+1})`]];
    vocab.camps.forEach((name,i) => { const row = campHeader+i+1; summary.getRange(`A${row}`).values = [[name]]; summary.getRange(`B${row}`).formulas = [[`=COUNTIF(Cards!G2:G${cardEnd},A${row})`]]; });
    manaValues.forEach((cost,i) => { const row=i+2; summary.getRange(`D${row}`).values = [[cost]]; summary.getRange(`E${row}`).formulas = [[`=COUNTIF(Cards!A2:A${cardEnd},D${row})+COUNTIF(Relics!A2:A${relicEnd},D${row})`]]; });
    vocab.alignments.forEach((name,i) => { const row=alignmentHeader+i+1; summary.getRange(`D${row}`).values = [[name]]; summary.getRange(`E${row}`).formulas = [[`=COUNTIF(Cards!H2:H${cardEnd},D${row})`]]; });
    summary.getRange(`A${rosterHeader+1}:A${rosterHeader+3}`).values = [['Cards'],['Relics'],['All collectible cards']];
    summary.getRange(`B${rosterHeader+1}:B${rosterHeader+3}`).formulas = [[`=COUNTA(Cards!L2:L${cardEnd})`],[`=COUNTA(Relics!F2:F${relicEnd})`],[`=SUM(B${rosterHeader+1}:B${rosterHeader+2})`]];
    summary.getRange(`D${endSummary}`).values = [['Mana includes relics']]; summary.getRange(`D${endSummary}`).format.font.italic = true;
    summary.getRange(`B2:B${endSummary}`).setNumberFormat('0'); summary.getRange(`E2:E${endSummary}`).setNumberFormat('0'); summary.getRange(`D2:D${manaValues.length+1}`).setNumberFormat('0');

    wb.recalculate();
    const totals = summary.getRange(`B${rosterHeader+1}:B${rosterHeader+3}`).values.map(row => row[0]);
    if (JSON.stringify(totals) !== JSON.stringify([cards.length,relics.length,cards.length+relics.length])) throw new Error(`Workbook summary calculation failed: ${JSON.stringify(totals)}`);
    if (sheets.Cards.getRange(`L2:L${cardEnd}`).values.flat().join(',') !== cards.map(c => c.id).join(',')) throw new Error('Card IDs changed during workbook creation.');
    if (sheets.Relics.getRange(`F2:F${relicEnd}`).values.flat().join(',') !== relics.map(c => c.id).join(',')) throw new Error('Relic IDs changed during workbook creation.');
    if (args.includes('--render')) {
      for (const [name, range] of [['Cards','A1:I5'],['Relics','A1:E5'],['Rules','A1:A8'],['Summary','A1:E18']]) {
        const png = await wb.render({sheetName:name,range,scale:1,format:'png'});
        await fs.writeFile(path.join(preview, `${name}.png`), new Uint8Array(await png.arrayBuffer()));
      }
      console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},summary:'Workbook error scan',maxChars:1000})).ndjson);
    }
    await (await SpreadsheetFile.exportXlsx(wb)).save(temp);
    if ((await model()).fingerprint !== data.fingerprint) throw new Error('Card sources changed during workbook generation. Retry with the completed card edit.');
    try { await fs.rename(temp, output); } catch (e) { throw new Error(`Could not replace ${output}. Close this workbook in Excel and retry the refresh. The previous workbook is preserved.`, {cause:e}); }
    const record = {sourceSha256:data.fingerprint,workbookSha256:await fileHash(output),cards:cards.length,relics:relics.length};
    await fs.writeFile(manifest, `${JSON.stringify(record,null,2)}\n`);
    if (!await current(data)) throw new Error('The workbook changed during final verification; retry the refresh.');
    console.log(`Card workbook refreshed and verified: ${cards.length} cards + ${relics.length} relics = ${cards.length+relics.length}.`);
  } finally {
    await fs.unlink(temp).catch(() => {});
    await fs.unlink(`${temp}.inspect.ndjson`).catch(() => {});
    await handle.close();
    await fs.unlink(lock).catch(() => {});
  }
}

run().catch(error => { console.error(`Card workbook: ${error.message}`); process.exitCode = 1; });
