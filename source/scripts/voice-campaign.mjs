/** Reusable Qwen engine, Convergence-specific dialogue and casting adapter. */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const python = process.env.QWEN_RUNTIME || path.join(root, ".preview/voice-runtime/Scripts/python.exe");

function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${program} exited ${code}. Resolve its error above before retrying.`)));
  });
}

if (!existsSync(python)) {
  throw new Error(
    `Approved Qwen runtime is missing at ${python}. ` +
    "Run `just qwen-voice setup` once; this project command will not install or download weights implicitly.",
  );
}

const model = process.env.QWEN_MODEL_DIR || path.join(root, ".preview/models/qwen-voice-design");
if (!existsSync(path.join(model, "model.safetensors")) || !existsSync(path.join(model, "speech_tokenizer", "model.safetensors"))) {
  throw new Error(
    `Approved Qwen weights are missing at ${model}. ` +
    "Run `just qwen-voice setup --download`; the resumable downloader will reuse complete files.",
  );
}

await run(python, ["materials/local-production/asset-tools/voice-campaign.py", ...process.argv.slice(2)]);
