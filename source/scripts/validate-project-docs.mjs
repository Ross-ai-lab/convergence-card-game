import { readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");

// README.md is the sole maintained project KB. These two ignored paths belong
// to optional local-production downloads already present on the owner's machine;
// they are frozen package notes, not permission to add more Markdown files.
const ALLOWED = new Set([
  "README.md",
  "materials/local-production/audio-tracks/README.md",
  "materials/local-production/card-production/web-sized-card-faces/README.md",
]);

const SKIP_DIRS = new Set([".git", ".preview", "dist", "node_modules"]);

function projectPath(path) {
  return relative(PROJECT_ROOT, path).replaceAll("\\", "/");
}

function findMarkdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(path, found);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      found.push(projectPath(path));
    }
  }
  return found;
}

const markdown = findMarkdownFiles(PROJECT_ROOT).sort();
const forbidden = markdown.filter((path) => !ALLOWED.has(path));

if (forbidden.length > 0) {
  console.error("Markdown policy failed: README.md is the only maintained project documentation file.");
  for (const path of forbidden) console.error(`  remove or fold into README.md: ${path}`);
  process.exit(1);
}

console.log(`Markdown policy passed (${markdown.length} approved existing file${markdown.length === 1 ? "" : "s"}).`);
