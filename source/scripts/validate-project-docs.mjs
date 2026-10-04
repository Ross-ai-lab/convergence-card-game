import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY_POINTS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'DESIGN-DECISIONS.md'];
const SKIP_DIRS = new Set(['.git', '.preview', 'dist', 'node_modules', '.wrangler']);
const VENDOR_DIRS = new Set(['materials/local-production/audio-tracks', 'materials/local-production/card-production']);
const projectPath = path => relative(ROOT, path).replaceAll('\\', '/');

// Markdown is permitted. This checks maintained documentation rather than imposing a file allowlist.
function markdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !VENDOR_DIRS.has(projectPath(path))) markdownFiles(path, found);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') found.push(path);
  }
  return found;
}

function anchors(text) {
  const result = new Set(), counts = new Map();
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {fenced = !fenced; continue;}
    if (fenced) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    if (!heading) continue;
    const base = heading[1].replace(/<[^>]*>/g,'').replace(/[*_`]/g,'').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s/g,'-');
    const count = counts.get(base) ?? 0;
    result.add(count ? `${base}-${count}` : base);
    counts.set(base,count+1);
  }
  for (const match of text.matchAll(/\bid=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}

const errors = [];
for (const name of ENTRY_POINTS) if (!existsSync(resolve(ROOT,name))) errors.push(`Missing documentation entry point: ${name}`);
const files = markdownFiles(ROOT).sort();
for (const file of files) {
  const text = readFileSync(file,'utf8');
  // Code examples are not document links. Include HTML images and navigation used by README.
  const body = text.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]+`/g,'');
  const links = [
    ...[...body.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)].map(match=>match[1].replace(/^<|>$/g,'')),
    ...[...body.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match=>match[1]),
  ];
  for (const href of links) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    try {
      const [pathPart, fragment] = href.split('#',2);
      const target = pathPart ? resolve(dirname(file),decodeURIComponent(pathPart.split('?')[0])) : file;
      if (target !== ROOT && !target.startsWith(ROOT+sep)) {
        errors.push(`${projectPath(file)}: local link leaves the project: ${href}`); continue;
      }
      if (!existsSync(target)) {errors.push(`${projectPath(file)}: missing local target: ${href}`);continue;}
      if (fragment && extname(target).toLowerCase() === '.md' && !anchors(readFileSync(target,'utf8')).has(decodeURIComponent(fragment)))
        errors.push(`${projectPath(file)}: missing heading: ${href}`);
    } catch (error) {errors.push(`${projectPath(file)}: invalid link ${href}: ${error.message}`);}
  }
}
const redirect = resolve(ROOT,'CLAUDE.md');
if (existsSync(redirect)) {
  const text = readFileSync(redirect,'utf8');
  if (!/\]\(AGENTS\.md\)/.test(text) || text.trim().split(/\r?\n/).length > 8)
    errors.push('CLAUDE.md must remain a short redirect to AGENTS.md.');
}
if (errors.length) {
  console.error('Documentation check failed:\n'+errors.map(error=>'  '+error).join('\n'));
  process.exitCode=1;
} else console.log(`Documentation passed: ${files.length} maintained Markdown files, local links and agent redirect. Additional Markdown is allowed.`);
