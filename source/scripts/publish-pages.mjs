import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
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

  const bundle = await readFile(scriptPath, "utf8");
  if (!bundle.includes("The Watcher,10,10,7")) {
    throw new Error("Published bundle does not contain Watcher 10/7");
  }
  if (bundle.includes("The Watcher,10,5,8")) {
    throw new Error("Published bundle still contains stale Watcher 5/8");
  }

  const files = await collectFiles(publishedTarget);
  if (files.length === 0) throw new Error("Published copy is empty");

  console.log(`Published ${files.length} generated files to ${relative(projectDir, publishedTarget)}/`);
  console.log(`Verified ${scriptSrc} contains The Watcher 10/7`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
