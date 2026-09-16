/** Guard 80 boss lines, Rick's prologue and 20 Rick selections against stale assets. */
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
const BASE_ENGINE = "Qwen/Qwen3-TTS-12Hz-1.7B-Base";
const pythonString = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
const fingerprint = (chapter, stage) => {
  const voice = cast.cast[String(chapter.chapter)];
  const instruction = `${voice.voice} Perform with ${voice.direction[stage]}. Fluent English, vivid natural acting, clear words, no music or sound effects.`;
  const pythonJson = `[${[cast.engine, chapter[stage], instruction, voice.seed, "mix-v2"].map(pythonString).join(", ")}]`;
  return createHash("sha256").update(pythonJson).digest("hex");
};
const rick = cast.protagonist;
const rickClone = rick.clone;
assert.equal(rickClone.model, BASE_ENGINE, "Rick must use the approved Qwen Base clone model");
assert.equal(typeof rickClone.referenceTranscript, "string", "Rick's exact Base reference transcript must be saved in the voice cast");
const rickReferenceAudio = path.resolve(ROOT, "..", rickClone.referenceAudio);
const rickReferenceTranscriptFile = path.resolve(ROOT, "..", rickClone.referenceTranscriptFile);
const rickReferenceSha = createHash("sha256").update(await readFile(rickReferenceAudio)).digest("hex");
assert.equal((await readFile(rickReferenceTranscriptFile, "utf8")).trim(), rickClone.referenceTranscript.trim(), "Rick's reference transcript file must match the cast");
const rickFingerprint = (text) => createHash("sha256").update(
  `[${[BASE_ENGINE, text, rickReferenceSha, rickClone.referenceTranscript.trim(), rickClone.seed, "mix-v2"].map(pythonString).join(", ")}]`,
).digest("hex");

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
const rickKey = "rick-prologue";
const rickEntry = voices[rickKey];
assert(rickEntry, `Missing voice manifest entry: ${rickKey}`);
assert.equal(rickEntry.text, story.premise, `Stale dialogue text: ${rickKey}`);
assert.equal(rickEntry.speaker, rick.name, `Stale speaker: ${rickKey}`);
assert.equal(rickEntry.stage, "prologue", `Stale stage: ${rickKey}`);
assert.equal(rickEntry.model_type, "base", `Rick's prologue must use Base voice cloning: ${rickKey}`);
assert.equal(rickEntry.model_repo, BASE_ENGINE, `Stale Qwen model: ${rickKey}`);
assert.equal(rickEntry.reference_audio_sha256, rickReferenceSha, `Stale Rick reference audio: ${rickKey}`);
assert.equal(rickEntry.reference_transcript, rickClone.referenceTranscript.trim(), `Stale Rick reference transcript: ${rickKey}`);
assert.equal(rickEntry.fingerprint, rickFingerprint(story.premise), `Stale Qwen reference/seed: ${rickKey}`);
const rickFile = path.join(ROOT, "public/audio/campaign", `${rickKey}.ogg`);
const rickData = await readFile(rickFile);
assert.equal(createHash("sha256").update(rickData).digest("hex"), rickEntry.audioSha256, `Changed recording: ${rickKey}`);
if (!process.argv.includes("--hash-only")) {
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", rickFile], { encoding: "utf8" }));
  assert(duration > 2 && duration < 65, `Invalid duration: ${rickKey}`);
  assert(Math.abs(duration - rickEntry.duration) < 0.1, `Manifest duration drift: ${rickKey}`);
}
const rickIntroKeys = [];
for (const chapter of story.chapters) {
  const key = `${String(chapter.chapter).padStart(2, "0")}-rick-intro`;
  rickIntroKeys.push(key);
  const entry = voices[key];
  assert(entry, `Missing voice manifest entry: ${key}`);
  assert.equal(entry.text, chapter.rickIntro, `Stale dialogue text: ${key}`);
  assert.equal(entry.bossId, chapter.bossId, `Stale boss identity: ${key}`);
  assert.equal(entry.speaker, rick.name, `Stale speaker: ${key}`);
  assert.equal(entry.stage, "rick-intro", `Stale stage: ${key}`);
  assert.equal(entry.model_type, "base", `Rick's selection must use Base voice cloning: ${key}`);
  assert.equal(entry.model_repo, BASE_ENGINE, `Stale Qwen model: ${key}`);
  assert.equal(entry.reference_audio_sha256, rickReferenceSha, `Stale Rick reference audio: ${key}`);
  assert.equal(entry.reference_transcript, rickClone.referenceTranscript.trim(), `Stale Rick reference transcript: ${key}`);
  assert.equal(entry.fingerprint, rickFingerprint(chapter.rickIntro), `Stale Qwen reference/seed: ${key}`);
  const file = path.join(ROOT, "public/audio/campaign", `${key}.ogg`);
  const data = await readFile(file);
  assert.equal(createHash("sha256").update(data).digest("hex"), entry.audioSha256, `Changed recording: ${key}`);
  if (!process.argv.includes("--hash-only")) {
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
    assert(duration > 2 && duration < 65, `Invalid duration: ${key}`);
    assert(Math.abs(duration - entry.duration) < 0.1, `Manifest duration drift: ${key}`);
  }
}
assert.equal(Object.keys(voices).length, keys.length + rickIntroKeys.length + 1, "The manifest must contain exactly 80 boss lines, 20 Rick selections and Rick's prologue");
console.log(`PASS all ${keys.length} boss recordings, ${rickIntroKeys.length} Rick selections and Rick's prologue: dialogue, cast fingerprints, checksums and durations`);

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
    const allKeys = [...keys, ...rickIntroKeys, rickKey];
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
    }, allKeys.map((key) => [key, assetUrl(key)]));
    assert.equal(decoded.length, 101);
    for (const key of ["01-play", "20-play", "01-rick-intro", "20-rick-intro", rickKey]) {
      const signal = await page.evaluate((value) => window.__sfx.probeBossSpeech(value, 5000), key);
      assert(signal.peak > 0.01 && signal.activeMs > 200, `${key} must emit an audible signal: ${JSON.stringify(signal)}`);
    }
    await page.evaluate(() => {
      window.__sfx.setMuted(false);
      window.__sfx.playBossSpeech("01-rick-intro");
    });
    await page.waitForFunction(() => window.__sfx.getStats().bossSpeechKey === "01-rick-intro");
    await page.evaluate(() => window.__sfx.setMuted(true));
    assert.equal(await page.evaluate(() => window.__sfx.getStats().bossSpeechKey), null, "Mute must stop Rick's speech");
    await page.evaluate(() => {
      window.__sfx.setMuted(false);
      window.__sfx.playBossSpeech("01-rick-intro");
      window.__sfx.stopBossSpeech();
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__sfx.getStats().bossSpeechKey), null, "Cancelled Rick fetch cannot start speech later");
    console.log("PASS browser campaign audio: all 101 files decode; Rick is audible, muted, and cancelled correctly");
  } finally {
    await browser.close();
  }
}
