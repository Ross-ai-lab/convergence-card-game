/** Generate README navigation from its heading order; README is the authority. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../../README.md', import.meta.url));
const original = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const start = '<!-- README-NAV-START -->';
const end = '<!-- README-NAV-END -->';
const marker = /<!-- README-NAV-START -->[\s\S]*?<!-- README-NAV-END -->/;
if (!marker.test(original)) throw new Error('README navigation markers are missing. Restore both before generating the contents.');
const body = original.replace(marker, '');
const entries = [];
let fenced = false;
for (const line of body.split('\n')) {
  if (line.startsWith('```')) fenced = !fenced;
  if (fenced) continue;
  const heading = line.match(/^(#{2,3}) (.+)$/);
  if (!heading) continue;
  const [, level, label] = heading;
  const anchor = label.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  entries.push(`${level.length === 3 ? '  ' : ''}- [${label}](#${anchor})`);
}
const nav = `${start}\n${entries.join('\n')}\n${end}`;
const result = original.replace(marker, nav);
if (process.argv.includes('--check')) {
  if (result !== original) {
    console.error('README contents are stale. Run npm run readme:index.');
    process.exitCode = 1;
  } else console.log('README navigation is current.');
} else if (result !== original) {
  writeFileSync(file, result, 'utf8');
  console.log('README navigation refreshed from its headings.');
} else console.log('README navigation is already current.');
