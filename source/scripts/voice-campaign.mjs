/** Reusable Qwen engine, Convergence-specific dialogue and casting adapter. */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
// The shared voice runtime and weights live in the workspace's voice pipeline, two levels above this repository.
const voicePipeline = path.join(root, "../../../Pipelines/audio/qwen");
const python = process.env.QWEN_RUNTIME || path.join(voicePipeline, ".venv/Scripts/python.exe");

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

const models = [
  ["VoiceDesign", process.env.QWEN_MODEL_DIR || path.join(voicePipeline, "models/qwen-voice-design")],
  ["Base", process.env.QWEN_BASE_MODEL_DIR || path.join(voicePipeline, "models/qwen-base")],
];
for (const [label, model] of models) {
  if (!existsSync(path.join(model, "model.safetensors")) || !existsSync(path.join(model, "speech_tokenizer", "model.safetensors"))) {
    throw new Error(
      `Approved Qwen ${label} weights are missing at ${model}. ` +
      "Run `just qwen-voice setup --model-type all`; the resumable downloader will reuse complete files.",
    );
  }
}

await run(python, ["materials/local-production/asset-tools/voice-campaign.py", ...process.argv.slice(2)]);
