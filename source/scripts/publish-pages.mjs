import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = resolve(sourceDir, "..");
const distDir = join(sourceDir, "dist");
const playDir = join(projectDir, "play");

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: sourceDir,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args]);
  }
  if (process.platform === "win32") {
    return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`]);
  }
  return run("npm", args);
}

function assertInside(root, candidate, label) {
  const rootPath = resolve(root) + sep;
  const candidatePath = resolve(candidate);
  if (!candidatePath.startsWith(rootPath)) {
    throw new Error(`${label} escaped its expected directory: ${candidatePath}`);
  }
  return candidatePath;
}

async function assertFile(path, label) {
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error(`${label} is not a file: ${path}`);
  } catch (error) {
    throw new Error(`${label} is missing: ${path}`, { cause: error });
  }
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

async function hashFile(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function assertPublishedCopyMatchesBuild() {
  const generatedFiles = await collectFiles(distDir);
  const publishedFiles = await collectFiles(playDir);
  const generatedSet = new Set(generatedFiles);
  const publishedSet = new Set(publishedFiles);
  const missing = generatedFiles.filter((file) => !publishedSet.has(file));
  const extra = publishedFiles.filter((file) => !generatedSet.has(file));
  const mismatched = [];

  for (const file of generatedFiles) {
    if (!publishedSet.has(file)) continue;
    const [generatedHash, publishedHash] = await Promise.all([
      hashFile(join(distDir, file)),
      hashFile(join(playDir, file)),
    ]);
    if (generatedHash !== publishedHash) mismatched.push(file);
  }

  if (missing.length || extra.length || mismatched.length) {
    const details = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      extra.length ? `extra: ${extra.join(", ")}` : "",
      mismatched.length ? `different: ${mismatched.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`Published copy does not exactly match the generated build (${details})`);
  }

  return generatedFiles.length;
}

async function main() {
  await runNpm(["run", "validate:data"]);
  await runNpm(["run", "build", "--", "--base=./"]);

  await assertFile(join(distDir, "index.html"), "Generated build entrypoint");

  const publishedTarget = assertInside(projectDir, playDir, "Published copy");
  if (publishedTarget !== resolve(projectDir, "play")) {
    throw new Error(`Refusing to replace unexpected published directory: ${publishedTarget}`);
  }

  await rm(publishedTarget, { recursive: true, force: true });
  await mkdir(publishedTarget, { recursive: true });
  await cp(distDir, publishedTarget, { recursive: true, force: true });

  const indexPath = join(publishedTarget, "index.html");
  const indexHtml = await readFile(indexPath, "utf8");
  const scriptSrc = indexHtml.match(/<script[^>]+src=["']([^"']+\.js)["']/i)?.[1];
  if (!scriptSrc) throw new Error("Published play/index.html does not reference a JavaScript bundle");

  const scriptPath = assertInside(publishedTarget, join(publishedTarget, scriptSrc), "Published JavaScript bundle");
  await assertFile(scriptPath, "Published JavaScript bundle");

  const fileCount = await assertPublishedCopyMatchesBuild();
  if (fileCount === 0) throw new Error("Published copy is empty");

  console.log(`Published ${fileCount} generated files to ${relative(projectDir, publishedTarget)}/`);
  console.log("Verified the published copy exactly matches the generated build");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
