/** Guard the 80 published Qwen boss recordings against missing or stale assets. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const story = JSON.parse(await readFile(path.join(ROOT, "../materials/campaign-story.json"), "utf8"));
const voices = JSON.parse(await readFile(path.join(ROOT, "data/campaign-voices.json"), "utf8"));
const cast = JSON.parse(await readFile(path.join(ROOT, "../materials/campaign-voice-cast.json"), "utf8"));
const stages = ["entrance", "defeat", "loss", "play"];
const pythonString = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
const fingerprint = (chapter, stage) => {
  const voice = cast.cast[String(chapter.chapter)];
  const instruction = `${voice.voice} Perform with ${voice.direction[stage]}. Fluent English, vivid natural acting, clear words, no music or sound effects.`;
  const pythonJson = `[${[cast.engine, chapter[stage], instruction, voice.seed, "mix-v2"].map(pythonString).join(", ")}]`;
  return createHash("sha256").update(pythonJson).digest("hex");
};

const keys = [];
for (const chapter of story.chapters) {
  for (const stage of stages) {
    const key = `${String(chapter.chapter).padStart(2, "0")}-${stage}`;
    keys.push(key);
    const entry = voices[key];
    assert(entry, `Missing voice manifest entry: ${key}`);
    assert.equal(entry.text, chapter[stage], `Stale dialogue text: ${key}`);
    assert.equal(entry.fingerprint, fingerprint(chapter, stage), `Stale voice casting/direction: ${key}`);
    const file = path.join(ROOT, "public/audio/campaign", `${key}.ogg`);
    const data = await readFile(file);
    assert.equal(createHash("sha256").update(data).digest("hex"), entry.audioSha256, `Changed recording: ${key}`);
    if (!process.argv.includes("--hash-only")) {
      const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
      assert(duration > 2 && duration < 65, `Invalid duration: ${key}`);
      assert(Math.abs(duration - entry.duration) < 0.1, `Manifest duration drift: ${key}`);
    }
  }
}
assert.equal(keys.length, 80);
assert.equal(Object.keys(voices).length, 80, "The manifest must contain exactly the 80 campaign lines");
console.log(`PASS all ${keys.length} campaign recordings: dialogue, casting fingerprints, checksums and durations`);

const base = process.argv.find((arg) => arg.startsWith("http"));
if (base) {
  const { launch } = await import("./browser.mjs");
  const browser = await launch(["--autoplay-policy=no-user-gesture-required"]);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const rootUrl = base.endsWith("/") ? base : `${base}/`;
  const assetUrl = (key) => new URL(`audio/campaign/${key}.ogg`, rootUrl).href;
  try {
    await page.goto(base);
    await page.locator(".title-screen").waitFor();
    const decoded = await page.evaluate(async (urls) => {
      const context = new AudioContext();
      const durations = [];
      for (const [key, url] of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing ${key}: ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        durations.push([key, buffer.duration]);
      }
      await context.close();
      return durations;
    }, keys.map((key) => [key, assetUrl(key)]));
    assert.equal(decoded.length, 80);
    for (const key of ["01-play", "20-play"]) {
      const signal = await page.evaluate((value) => window.__sfx.probeBossSpeech(value, 5000), key);
      assert(signal.peak > 0.01 && signal.activeMs > 200, `${key} must emit an audible signal: ${JSON.stringify(signal)}`);
    }
    await page.evaluate(() => {
      window.__sfx.setMuted(false);
      window.__sfx.playBossSpeech("01-play");
    });
    await page.waitForFunction(() => window.__sfx.getStats().bossSpeechKey === "01-play");
    await page.evaluate(() => window.__sfx.setMuted(true));
    assert.equal(await page.evaluate(() => window.__sfx.getStats().bossSpeechKey), null, "Mute must stop boss speech");
    await page.evaluate(() => {
      window.__sfx.setMuted(false);
      window.__sfx.playBossSpeech("01-play");
      window.__sfx.stopBossSpeech();
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__sfx.getStats().bossSpeechKey), null, "Cancelled fetch cannot start speech later");
    console.log("PASS browser campaign audio: all files decode, signal is audible, mute and cancellation work");
  } finally {
    await browser.close();
  }
}
