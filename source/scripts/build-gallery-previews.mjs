import { readCards, readRelics, projectRoot } from './card-tools.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const files=[...new Set([...readCards(),...readRelics()].map(card=>card.art).filter(Boolean))].sort();
for (const file of files) if (!/^\/card-art\/raw\/[a-z0-9-]+\.webp$/i.test(file)) throw new Error(`Gallery artwork must stay inside card-art/raw: ${file}`);
const hash=createHash('sha256');
hash.update(readFileSync(fileURLToPath(import.meta.url))).update(readFileSync(join(projectRoot,'scripts/build-gallery-previews.py')));
for(const file of files) hash.update(file).update(readFileSync(join(projectRoot,'public',file)));
const signature=hash.digest('hex');
const output=join(projectRoot,'src/data/gallery-previews.ts');
if(existsSync(output)&&readFileSync(output,'utf8').startsWith(`// Artwork source SHA-256: ${signature}\n`)) {
  console.log(`Gallery previews current: ${files.length} images`);
} else {
  if(process.argv.includes('--check')) throw new Error('Gallery previews are stale. Run npm run build:gallery-art before publishing.');
  const result=spawnSync('python',[join(projectRoot,'scripts/build-gallery-previews.py')],{
    input:JSON.stringify({files:files.map(file=>join(projectRoot,'public',file)),output,signature}),encoding:'utf8',windowsHide:true,
  });
  if(result.error||result.status!==0) throw new Error(`Artwork preview generation needs Python with Pillow: ${result.error?.message??result.stderr}`);
  console.log(result.stdout.trim());
}
