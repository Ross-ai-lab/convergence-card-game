import { isThemedTokenId } from "../engine/tokens";

/* ============================================================================
   CONVERGENCE — anime battle sound engine

   Design brief (owner, 2026-07-07): "not Mario". The first pass was bare
   oscillators — square/saw blips with no space around them, which is literally
   the chiptune palette. What makes modern anime-game audio read as cinematic:

   1. REVERB. Every sound is sent to a procedurally-built convolution reverb.
      A dry beep sounds like a 1990s console; the same beep in a hall sounds
      like a game. This is the single biggest change.
   2. LAYERS. Real impacts are transient + body + tail, not one waveform.
   3. INHARMONIC FM METAL. Bells, gongs and sword rings come from FM with a
      non-integer modulator ratio. Square waves cannot make this sound.
   4. SUB-BASS. A fast downward sine gives impacts physical weight.
   5. TAIKO. The signature anime-battle drum sits under attacks and big plays.

   Music is a real generated lo-fi track (see startMusic), not a synth drone —
   the old drone was two detuned oscillators, i.e. a Windows error tone.
   ============================================================================ */

export type SfxName =
  | "summonRare"
  | "summonEpic"
  | "summonLegendary"
  | "summonMythic"
  | "heavyLand"
  | "attack"
  | "hit"
  | "heroHit"
  | "death"
  | "heal"
  | "shieldBreak"
  | "freeze"
  | "buff"
  | "debuff"
  | "turn"
  | "pickup"
  | "invalid"
  | "draw"
  | "mana"
  | "coin"
  | "relicEquip"
  | "button"
  | "hover"
  | "win"
  | "lose";

/**
 * Rulebook v1.0 frame colours: Mythic=Red, Legendary=Yellow, Epic=Purple,
 * Rare=Black. Each tier gets its own summon fanfare, escalating in length,
 * low-end weight, layer count and how hard it ducks the music.
 */
export function summonSoundFor(rarity: string): SfxName {
  switch (rarity) {
    case "Red":
      return "summonMythic";
    case "Yellow":
      return "summonLegendary";
    case "Purple":
      return "summonEpic";
    default:
      return "summonRare";
  }
}

const STORAGE_KEY = "convergence.muted";
const MIX_KEY = "convergence.mix";
const MASTER_GAIN = 0.9;
const MUSIC_GAIN = 0.34;

/**
 * The score.
 *
 * Five tracks, generated locally rather than licensed or looped from one lofi
 * bed: a patient menu piece, a driving battle bed, a tense variant, and two
 * short stings. `tension` is the one that earns its keep — swapping the bed the
 * moment either core drops into range is the cheapest change in game audio and
 * the one players actually feel.
 */
export type Track = "menu" | "battle" | "tension";
type Sting = "victory" | "defeat";

const TRACK_URL: Record<Track | Sting, string[]> = {
  menu: [`${import.meta.env.BASE_URL}audio/music/menu.ogg`],
  battle: [`${import.meta.env.BASE_URL}audio/music/battle.ogg`],
  tension: [`${import.meta.env.BASE_URL}audio/music/tension.ogg`],
  victory: [`${import.meta.env.BASE_URL}audio/music/victory.ogg`],
  defeat: [`${import.meta.env.BASE_URL}audio/music/defeat.ogg`],
};
/**
 * Two faders. The per-card voice lines were retired -- summoning a minion fired
 * a rarity fanfare, a spoken line AND the card's music theme, and three at once
 * was noise. The clips are kept in
 * the local production library if they are ever wanted back.
 *
 * Card themes count as MUSIC, so the music fader governs both the battle loop
 * and the stings; a player who turns music down does not want either.
 */
export type Bus = "music" | "effects";
export type Mix = Record<Bus, number>;
const DEFAULT_MIX: Mix = { music: 0.7, effects: 0.9 };

/**
 * How many decoded card-theme clips to hold. Each is a 6-second stereo sting,
 * which decodes to roughly 2 MB, so this is the memory dial: 20 clips ≈ 42 MB.
 * It was 30 when the stings were 3 seconds.
 */
const THEME_CACHE_LIMIT = 20;

/**
 * Longest a card theme may hold the music down. Must exceed the sting length
 * (see build-card-stings.py, --seconds) with room to spare, or the loop returns
 * mid-theme.
 */
const THEME_DUCK_CEILING = 7.0;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let musicGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
let themeBus: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicVoiceGain: GainNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicRaw: AudioBuffer | null = null;
let musicLoading = false;
let currentTrack: Track | null = null;
let wantedTrack: Track | null = null;
const trackCache = new Map<string, AudioBuffer>();
let muted = loadMuted();
let mix = loadMix();

const themeCache = new Map<string, AudioBuffer>();
const themeMisses = new Set<string>();
let themeSource: AudioBufferSourceNode | null = null;
/** Rises on every request so a slow decode can tell it has been superseded. */
let themeToken = 0;
let openingCueBuffer: AudioBuffer | null = null;
let openingCueMiss = false;

function loadMix(): Mix {
  try {
    const raw = localStorage.getItem(MIX_KEY);
    if (!raw) return { ...DEFAULT_MIX };
    const parsed = JSON.parse(raw) as Partial<Mix>;
    const clamp = (value: unknown, fallback: number) =>
      typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
    return {
      music: clamp(parsed.music, DEFAULT_MIX.music),
      effects: clamp(parsed.effects, DEFAULT_MIX.effects),
    };
  } catch {
    return { ...DEFAULT_MIX };
  }
}

function saveMix() {
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    // private mode — the mix simply won't persist
  }
}

const stats = {
  played: 0,
  last: "" as SfxName | "",
  byName: {} as Record<string, number>,
  /** Voice lines actually spoken. Counts the TRIGGER, not the audibility —
   *  a clip that never reaches the bus is caught by the analyser probes. */
  themesPlayed: 0,
  lastTheme: "",
};

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // private mode — mute simply won't persist
  }
}

// ------------------------------------------------------------------- reverb
/** A dark, exponentially-decaying impulse response. No IR file needed. */
function buildImpulse(seconds: number, decay: number): AudioBuffer {
  const c = ctx!;
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const white = Math.random() * 2 - 1;
      // one-pole lowpass darkens the tail so it reads as a hall, not static
      lp += 0.34 * (white - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return ir;
}

export function unlock(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;

  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(comp);
  comp.connect(ctx.destination);

  // Three faders in front of the master, so a slider moves one thing and the
  // compressor still sees everything.
  sfxBus = ctx.createGain();
  sfxBus.gain.value = mix.effects;
  sfxBus.connect(master);

  themeBus = ctx.createGain();
  themeBus.gain.value = mix.music;
  themeBus.connect(master);

  convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(2.4, 2.8);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  convolver.connect(reverbReturn);
  reverbReturn.connect(sfxBus);

  musicGain = ctx.createGain();
  musicGain.gain.value = MUSIC_GAIN * mix.music;
  musicGain.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  if (!muted) void startMusic();
}

function live(): boolean {
  return !muted && ctx !== null && master !== null && ctx.state !== "closed";
}

/** Fan a voice out to the dry bus and the reverb send. */
function route(src: AudioNode, pan: number, send: number): void {
  const p = ctx!.createStereoPanner();
  p.pan.value = pan;
  src.connect(p);
  p.connect(sfxBus ?? master!);
  if (send > 0 && convolver) {
    const s = ctx!.createGain();
    s.gain.value = send;
    p.connect(s);
    s.connect(convolver);
  }
}

function envGain(t: number, dur: number, peak: number, attack: number): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

// -------------------------------------------------------------------- voices
type Common = { t: number; dur: number; gain: number; pan?: number; send?: number };

function osc(o: Common & { type?: OscillatorType; f0: number; f1?: number; attack?: number; detune?: number }) {
  const c = ctx!;
  const n = c.createOscillator();
  n.type = o.type ?? "sine";
  n.frequency.setValueAtTime(o.f0, o.t);
  if (o.f1 !== undefined) n.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), o.t + o.dur);
  if (o.detune) n.detune.value = o.detune;
  const g = envGain(o.t, o.dur, o.gain, o.attack ?? 0.004);
  n.connect(g);
  route(g, o.pan ?? 0, o.send ?? 0);
  n.start(o.t);
  n.stop(o.t + o.dur + 0.05);
}

function noise(o: Common & { type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number }) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.frequency.setValueAtTime(o.f0, o.t);
  if (o.f1 !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.t + o.dur);
  filter.Q.value = o.q ?? 1;
  const g = envGain(o.t, o.dur, o.gain, o.attack ?? 0.004);
  src.connect(filter);
  filter.connect(g);
  route(g, o.pan ?? 0, o.send ?? 0);
  src.start(o.t, Math.random() * 0.5);
  src.stop(o.t + o.dur + 0.05);
}

/** Inharmonic FM — the source of every bell, gong and blade ring here. */
function metal(o: Common & { carrier: number; ratio: number; index: number; attack?: number }) {
  const c = ctx!;
  const car = c.createOscillator();
  car.type = "sine";
  car.frequency.value = o.carrier;
  const mod = c.createOscillator();
  mod.type = "sine";
  mod.frequency.value = o.carrier * o.ratio;
  const modGain = c.createGain();
  modGain.gain.setValueAtTime(o.carrier * o.index, o.t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, o.carrier * o.index * 0.02), o.t + o.dur);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  const g = envGain(o.t, o.dur, o.gain, o.attack ?? 0.003);
  car.connect(g);
  route(g, o.pan ?? 0, o.send ?? 0.3);
  car.start(o.t);
  mod.start(o.t);
  car.stop(o.t + o.dur + 0.05);
  mod.stop(o.t + o.dur + 0.05);
}

/** The anime battle drum: pitch-dropping body + skin transient. */
function taiko(t: number, gain = 0.42, pan = 0, f0 = 165, f1 = 44, dur = 0.6) {
  osc({ type: "sine", f0, f1, t, dur, gain, attack: 0.002, pan, send: 0.3 });
  osc({ type: "sine", f0: f0 * 0.5, f1: f1 * 0.6, t, dur: dur * 1.3, gain: gain * 0.55, attack: 0.002, pan, send: 0.2 });
  noise({ t, dur: 0.05, gain: gain * 0.42, type: "lowpass", f0: 1600, f1: 300, pan, send: 0.15 });
}

/** Detuned saw stack under a filter swell — stands in for brass/strings. */
function swell(t: number, freqs: number[], dur: number, gain: number, send = 0.4, cutPeak = 2600) {
  const c = ctx!;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(320, t);
  filter.frequency.exponentialRampToValueAtTime(cutPeak, t + dur * 0.45);
  filter.frequency.exponentialRampToValueAtTime(700, t + dur);
  const g = envGain(t, dur, gain, dur * 0.18);
  filter.connect(g);
  route(g, 0, send);
  for (const f of freqs) {
    for (const det of [-8, 7]) {
      const n = c.createOscillator();
      n.type = "sawtooth";
      n.frequency.value = f;
      n.detune.value = det;
      n.connect(filter);
      n.start(t);
      n.stop(t + dur + 0.06);
    }
  }
}

/** Cymbal / gong wash. */
function crash(t: number, dur: number, gain: number, send = 0.6) {
  noise({ t, dur, gain, type: "highpass", f0: 2600, f1: 7000, pan: 0.1, send });
  metal({ t, dur: dur * 1.2, gain: gain * 0.5, carrier: 1180, ratio: 5.31, index: 6, pan: -0.15, send });
  metal({ t, dur: dur * 1.4, gain: gain * 0.35, carrier: 1970, ratio: 3.77, index: 5, pan: 0.2, send });
}

/** Tension riser into a big hit. */
function riser(t: number, dur: number, gain: number) {
  noise({ t, dur, gain, type: "bandpass", f0: 300, f1: 5200, q: 1.4, send: 0.4, attack: dur * 0.7 });
  osc({ type: "sawtooth", f0: 110, f1: 700, t, dur, gain: gain * 0.5, attack: dur * 0.8, send: 0.3 });
}

// ------------------------------------------------------- music ducking
function musicLevel(): number {
  return MUSIC_GAIN * mix.music;
}

function duck(amount: number, hold: number) {
  if (!musicGain || !ctx) return;
  const t = ctx.currentTime;
  const g = musicGain.gain;
  const nominal = musicLevel();
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(nominal * amount, t + 0.05);
  g.setValueAtTime(nominal * amount, t + hold);
  g.linearRampToValueAtTime(nominal, t + hold + 0.7);
}

// ----------------------------------------------------------------- the kit
/**
 * A heavy body landing, scaled by how heavy it is.
 *
 * `weight` runs 0 to 1 and maps to mana cost 6 through 10 (owner's ruling,
 * 3 September 2026): a 6-mana body should be felt and a 10-mana body should be
 * an event, and one fixed thud for both said the wrong thing about the ones in
 * between.
 *
 * Every layer scales, but not by the same amount and not all from zero. Loudness
 * alone would just be a louder tap; weight is also LOWER and LONGER, so the sub
 * drops further and rings longer as the number climbs. The second taiko is the
 * one layer that genuinely arrives late — under about a third of the way up it
 * is inaudible, which is the intended "minimal at 6".
 *
 * It is deliberately all bottom end and no top at every weight. It fires UNDER a
 * rarity fanfare, so a second bright layer would fight it, while the sub and the
 * floor rumble sit in the one part of the spectrum the fanfares leave empty.
 */
function renderHeavyLand(t: number, weight: number): void {
  const w = Math.max(0, Math.min(1, weight));
  taiko(t, 0.16 + 0.2 * w, 0, 104 - 12 * w, 34 - 6 * w, 0.55 + 0.35 * w);
  osc({
    type: "sine",
    f0: 68 - 12 * w,
    f1: 27 - 6 * w,
    t,
    dur: 0.4 + 0.26 * w,
    gain: 0.14 + 0.22 * w,
    attack: 0.004,
    send: 0.12,
  });
  noise({ t: t + 0.01, dur: 0.2 + 0.14 * w, gain: 0.05 + 0.07 * w, type: "lowpass", f0: 420, f1: 90, send: 0.22 });
  // The late second beat. Below a third of the way up it does not sound at all.
  if (w > 0.34) taiko(t + 0.11, 0.06 + 0.18 * w, 0.12, 82 - 8 * w, 30 - 4 * w, 0.3 + 0.24 * w);
  // Only the top of the range ducks the music, so a 10-mana arrival owns the
  // room for a moment and a 6-mana one does not interrupt the bed.
  if (w > 0.7) duck(0.72, 0.4);
}

function render(name: SfxName, t: number): void {
  const jitter = (Math.random() - 0.5) * 0.3; // slight stereo spread per event

  switch (name) {
    // ---- summoning: one fanfare per rarity, each tier adds a layer --------

    // Black = Rare. Gunmetal. Grounded and martial: slap, thud, one bell.
    case "summonRare":
      noise({ t, dur: 0.07, gain: 0.18, type: "lowpass", f0: 3000, f1: 300, send: 0.18 });
      osc({ type: "sine", f0: 150, f1: 64, t, dur: 0.2, gain: 0.24, attack: 0.002, send: 0.12 });
      taiko(t, 0.19, 0, 140, 50, 0.3);
      metal({ t: t + 0.02, dur: 0.45, gain: 0.06, carrier: 880, ratio: 2.01, index: 3, pan: jitter, send: 0.4 });
      break;

    // Purple = Epic. Amethyst. Mystical: bell shimmer over a minor swell.
    case "summonEpic":
      duck(0.6, 0.3);
      noise({ t, dur: 0.07, gain: 0.15, type: "lowpass", f0: 3200, f1: 320, send: 0.18 });
      taiko(t, 0.28, -0.1, 150, 46, 0.42);
      swell(t + 0.02, [220, 261.63, 329.63], 0.8, 0.07, 0.5, 2200);
      metal({ t: t + 0.04, dur: 0.8, gain: 0.065, carrier: 1174, ratio: 2.01, index: 3.5, pan: 0.15, send: 0.6 });
      metal({ t: t + 0.09, dur: 0.6, gain: 0.045, carrier: 1568, ratio: 2.76, index: 3, pan: -0.2, send: 0.6 });
      crash(t + 0.02, 0.6, 0.04, 0.5);
      break;

    // Yellow = Legendary. Gold. Heroic: full taiko + major brass fanfare.
    case "summonLegendary":
      duck(0.45, 0.5);
      taiko(t, 0.4, -0.1);
      osc({ type: "sine", f0: 90, f1: 38, t, dur: 0.5, gain: 0.18, attack: 0.003, send: 0.2 });
      swell(t + 0.02, [220, 277.18, 329.63, 440], 0.95, 0.075, 0.5, 2800);
      metal({ t: t + 0.05, dur: 1.0, gain: 0.07, carrier: 1046, ratio: 2.01, index: 4, pan: 0.15, send: 0.55 });
      crash(t + 0.02, 0.9, 0.055, 0.55);
      break;

    // Red = Mythic. Crimson. The "OH I play YUJIRO" moment: riser into a
    // double taiko, sub drop, five-voice chord and a long gong.
    case "summonMythic":
      duck(0.28, 1.0);
      riser(t, 0.34, 0.095);
      taiko(t + 0.34, 0.52, -0.15, 185, 40, 0.8);
      taiko(t + 0.53, 0.36, 0.15, 150, 37, 0.72);
      osc({ type: "sine", f0: 70, f1: 28, t: t + 0.34, dur: 1.2, gain: 0.36, attack: 0.003, send: 0.22 });
      swell(t + 0.34, [110, 164.81, 220, 261.63, 329.63], 1.5, 0.085, 0.55, 3200);
      crash(t + 0.34, 1.7, 0.08, 0.72);
      metal({ t: t + 0.38, dur: 1.8, gain: 0.065, carrier: 880, ratio: 1.41, index: 6, pan: 0.2, send: 0.78 });
      metal({ t: t + 0.42, dur: 2.0, gain: 0.05, carrier: 587, ratio: 2.77, index: 5, pan: -0.25, send: 0.7 });
      break;

    // The full-weight thud, for the dev probe. Real arrivals go through
    // `playHeavyLand`, which scales it by mana cost.
    case "heavyLand":
      renderHeavyLand(t, 1);
      break;

    // ---- combat ----------------------------------------------------------
    // Anime sword slash: air swipe + inharmonic blade ring + sub thump.
    case "attack":
      noise({ t, dur: 0.17, gain: 0.17, type: "bandpass", f0: 900, f1: 6200, q: 1.2, pan: jitter, send: 0.35 });
      metal({ t: t + 0.01, dur: 0.3, gain: 0.075, carrier: 2400, ratio: 3.71, index: 4, pan: jitter, send: 0.45 });
      osc({ type: "sine", f0: 130, f1: 52, t, dur: 0.13, gain: 0.13, send: 0.15 });
      taiko(t + 0.02, 0.16, -jitter, 130, 48, 0.3);
      break;

    case "hit":
      noise({ t, dur: 0.06, gain: 0.3, type: "lowpass", f0: 6500, f1: 420, pan: jitter, send: 0.2 });
      osc({ type: "sine", f0: 185, f1: 52, t, dur: 0.2, gain: 0.3, attack: 0.002, send: 0.25 });
      metal({ t, dur: 0.14, gain: 0.09, carrier: 920, ratio: 2.31, index: 5, pan: jitter, send: 0.3 });
      break;

    // Hero core: a room-shaking taiko + gong.
    case "heroHit":
      duck(0.55, 0.35);
      taiko(t, 0.55, 0, 145, 36, 0.85);
      osc({ type: "sine", f0: 62, f1: 28, t, dur: 1.0, gain: 0.36, attack: 0.003, send: 0.25 });
      noise({ t, dur: 0.09, gain: 0.24, type: "lowpass", f0: 5000, f1: 260, send: 0.2 });
      crash(t + 0.01, 1.3, 0.05, 0.65);
      break;

    // Dissolve: pitch and spectrum collapse into a low bloom.
    case "death":
      metal({ t, dur: 0.6, gain: 0.09, carrier: 620, ratio: 2.77, index: 5, pan: jitter, send: 0.55 });
      noise({ t, dur: 0.55, gain: 0.14, type: "lowpass", f0: 1800, f1: 130, send: 0.45 });
      osc({ type: "sawtooth", f0: 240, f1: 48, t, dur: 0.5, gain: 0.09, send: 0.4 });
      osc({ type: "sine", f0: 165, f1: 42, t, dur: 0.28, gain: 0.18, attack: 0.002, send: 0.2 });
      osc({ type: "sine", f0: 110, f1: 40, t: t + 0.24, dur: 0.55, gain: 0.24, send: 0.35 });
      break;

    // ---- states ----------------------------------------------------------
    case "heal": {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) =>
        metal({ t: t + i * 0.07, dur: 0.7, gain: 0.075, carrier: f, ratio: 2.0, index: 2.2, pan: (i - 1) * 0.2, send: 0.6 }),
      );
      osc({ type: "sine", f0: 261.63, t, dur: 0.5, gain: 0.045, attack: 0.08, send: 0.5 });
      break;
    }

    case "shieldBreak":
      noise({ t, dur: 0.22, gain: 0.16, type: "highpass", f0: 3000, f1: 7500, send: 0.5 });
      metal({ t, dur: 0.45, gain: 0.06, carrier: 2100, ratio: 4.13, index: 7, pan: -0.2, send: 0.6 });
      metal({ t: t + 0.02, dur: 0.38, gain: 0.05, carrier: 3170, ratio: 2.73, index: 6, pan: 0.25, send: 0.6 });
      osc({ type: "sine", f0: 180, f1: 70, t, dur: 0.14, gain: 0.1, send: 0.2 });
      break;

    case "freeze":
      metal({ t, dur: 0.8, gain: 0.05, carrier: 1650, ratio: 2.41, index: 3, pan: -0.2, send: 0.65 });
      metal({ t: t + 0.05, dur: 0.7, gain: 0.04, carrier: 2340, ratio: 3.13, index: 3, pan: 0.25, send: 0.65 });
      noise({ t, dur: 0.35, gain: 0.05, type: "bandpass", f0: 4600, f1: 2800, q: 7, send: 0.5 });
      osc({ type: "sine", f0: 800, f1: 420, t: t + 0.04, dur: 0.35, gain: 0.045, send: 0.4 });
      break;

    case "buff":
      metal({ t, dur: 0.6, gain: 0.06, carrier: 880, ratio: 2.0, index: 3, pan: 0.1, send: 0.55 });
      osc({ type: "triangle", f0: 660, f1: 990, t, dur: 0.3, gain: 0.05, attack: 0.02, send: 0.45 });
      noise({ t, dur: 0.4, gain: 0.025, type: "highpass", f0: 4000, f1: 8000, send: 0.5 });
      break;

    case "debuff":
      metal({ t, dur: 0.55, gain: 0.055, carrier: 300, ratio: 1.73, index: 4, pan: -0.1, send: 0.5 });
      osc({ type: "triangle", f0: 420, f1: 170, t, dur: 0.4, gain: 0.06, attack: 0.02, send: 0.4 });
      osc({ type: "sine", f0: 190, f1: 90, t: t + 0.04, dur: 0.35, gain: 0.05, send: 0.3 });
      break;

    // ---- flow ------------------------------------------------------------
    case "turn":
      taiko(t, 0.24, -0.1, 150, 46, 0.45);
      metal({ t: t + 0.12, dur: 0.9, gain: 0.05, carrier: 784, ratio: 2.01, index: 3, pan: 0.15, send: 0.6 });
      swell(t + 0.05, [196, 293.66], 0.6, 0.04, 0.45, 1800);
      break;

    case "pickup":
      noise({ t, dur: 0.14, gain: 0.05, type: "highpass", f0: 500, f1: 2400, send: 0.2 });
      osc({ type: "sine", f0: 320, f1: 560, t, dur: 0.1, gain: 0.035, send: 0.25 });
      break;

    // A muted, weighty "no" — not a buzzer.
    case "invalid":
      osc({ type: "sine", f0: 120, f1: 78, t, dur: 0.16, gain: 0.13, attack: 0.002, send: 0.2 });
      noise({ t, dur: 0.08, gain: 0.05, type: "lowpass", f0: 700, f1: 200, send: 0.15 });
      break;

    case "draw":
      noise({ t, dur: 0.15, gain: 0.075, type: "bandpass", f0: 2600, f1: 900, q: 0.7, pan: jitter, send: 0.25 });
      metal({ t: t + 0.02, dur: 0.25, gain: 0.03, carrier: 1500, ratio: 2.2, index: 2, send: 0.4 });
      break;

    // Crystals spending. Deliberately the quietest thing in the game after the
    // hover tick: it fires on every single card played, so anything with a
    // transient on it would be the sound you remember the game by.
    case "mana":
      osc({ type: "sine", f0: 880, f1: 560, t, dur: 0.18, gain: 0.03, attack: 0.006, send: 0.45 });
      osc({ type: "sine", f0: 1320, f1: 840, t: t + 0.03, dur: 0.14, gain: 0.018, attack: 0.006, send: 0.5 });
      noise({ t, dur: 0.12, gain: 0.022, type: "highpass", f0: 3800, f1: 6800, send: 0.4 });
      break;

    case "coin":
      metal({ t, dur: 0.8, gain: 0.06, carrier: 1320, ratio: 2.41, index: 4, pan: 0.1, send: 0.6 });
      metal({ t: t + 0.03, dur: 0.6, gain: 0.035, carrier: 1980, ratio: 3.02, index: 3, pan: -0.15, send: 0.6 });
      break;

    // Ascension Relics are a goal moment: a low stadium thump, then a bright
    // four-note climb and a short shimmer as the equipment locks into place.
    case "relicEquip": {
      duck(0.5, 0.7);
      taiko(t, 0.3, 0, 155, 43, 0.55);
      osc({ type: "sine", f0: 86, f1: 42, t, dur: 0.65, gain: 0.22, attack: 0.003, send: 0.22 });
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        metal({
          t: t + index * 0.1,
          dur: 0.78,
          gain: 0.065,
          carrier: frequency,
          ratio: 2.01,
          index: 3.2,
          pan: (index - 1.5) * 0.12,
          send: 0.7,
        });
      });
      swell(t + 0.04, [261.63, 329.63, 392, 523.25], 0.95, 0.06, 0.56, 2600);
      crash(t + 0.28, 0.72, 0.045, 0.62);
      break;
    }

    case "button":
      noise({ t, dur: 0.03, gain: 0.07, type: "bandpass", f0: 1800, q: 1.5, send: 0.12 });
      osc({ type: "sine", f0: 520, f1: 380, t, dur: 0.05, gain: 0.035, send: 0.15 });
      break;

    case "hover":
      osc({ type: "sine", f0: 1100, t, dur: 0.03, gain: 0.014, send: 0.2 });
      break;

    // ---- endings ---------------------------------------------------------
    case "win": {
      duck(0.25, 1.6);
      taiko(t, 0.45, 0, 170, 42, 0.7);
      taiko(t + 0.42, 0.4, 0, 150, 38, 0.8);
      crash(t, 2.0, 0.07, 0.7);
      const chord = [
        [261.63, 329.63, 392.0],
        [329.63, 392.0, 523.25],
        [392.0, 523.25, 659.25],
      ];
      chord.forEach((c, i) => swell(t + i * 0.28, c, 1.1, 0.07, 0.55, 3200));
      metal({ t: t + 0.85, dur: 2.0, gain: 0.06, carrier: 1046, ratio: 2.01, index: 4, send: 0.7 });
      break;
    }

    case "lose":
      duck(0.25, 1.6);
      metal({ t, dur: 2.4, gain: 0.09, carrier: 110, ratio: 1.41, index: 7, send: 0.75 });
      osc({ type: "sine", f0: 130, f1: 44, t, dur: 1.6, gain: 0.22, attack: 0.02, send: 0.4 });
      swell(t + 0.1, [110, 130.81, 155.56], 1.8, 0.06, 0.6, 1100);
      noise({ t, dur: 1.0, gain: 0.045, type: "lowpass", f0: 600, f1: 70, send: 0.5 });
      break;
  }
}

export function play(name: SfxName, delay = 0): void {
  if (!live() || !ctx) return;
  stats.played++;
  stats.last = name;
  stats.byName[name] = (stats.byName[name] ?? 0) + 1;
  render(name, ctx.currentTime + Math.max(0, delay));
}

/** One heavy landing, at a weight of 0 (6 mana) through 1 (10 mana). */
export function playHeavyLand(weight: number, delay = 0): void {
  if (!live() || !ctx) return;
  stats.played++;
  stats.last = "heavyLand";
  stats.byName.heavyLand = (stats.byName.heavyLand ?? 0) + 1;
  renderHeavyLand(ctx.currentTime + Math.max(0, delay), weight);
}

let lastHover = 0;

export function hoverTick(): void {
  if (!live() || !ctx) return;
  const now = ctx.currentTime;
  if (now - lastHover < 0.07) return;
  lastHover = now;
  play("hover");
}

// -------------------------------------------------------------------- music
/**
 * Generated tracks never loop cleanly, so fold the tail back over the head with
 * an equal-power crossfade and loop the shortened buffer instead.
 */
function makeSeamlessLoop(src: AudioBuffer, fade = 2): AudioBuffer {
  const c = ctx!;
  const fadeLen = Math.min(Math.floor(fade * src.sampleRate), Math.floor(src.length / 3));
  const outLen = src.length - fadeLen;
  const out = c.createBuffer(src.numberOfChannels, outLen, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const inD = src.getChannelData(ch);
    const outD = out.getChannelData(ch);
    outD.set(inD.subarray(0, outLen));
    for (let i = 0; i < fadeLen; i++) {
      const x = i / fadeLen;
      const head = Math.sin((x * Math.PI) / 2);
      const tail = Math.cos((x * Math.PI) / 2);
      outD[i] = inD[i] * head + inD[outLen + i] * tail;
    }
  }
  return out;
}

async function fetchTrack(urls: string[], loop: boolean): Promise<AudioBuffer | null> {
  const key = urls[0];
  const cached = trackCache.get(key);
  if (cached) return cached;
  if (!ctx) return null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
      // A generated track never loops cleanly, so fold its tail back over its
      // head with an equal-power crossfade and loop the shortened buffer.
      const ready = loop ? makeSeamlessLoop(decoded, 2) : decoded;
      // Kept for the DEV loop-seam probe, which compares the folded buffer
      // against the untouched one. Dropping it silently disarms that check.
      if (loop) musicRaw = decoded;
      trackCache.set(key, ready);
      return ready;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Crossfades the bed to `track`, or to silence for null. Safe to call on every
 * render: asking for the track that is already playing does nothing.
 */
export async function setTrack(track: Track | null): Promise<void> {
  wantedTrack = track;
  if (muted || !ctx || !musicGain) return;
  if (track === currentTrack && musicSource) return;
  if (musicLoading) return;
  musicLoading = true;
  try {
    if (!track) {
      stopMusic();
      currentTrack = null;
      return;
    }
    // No fallback bed any more. There used to be a generic loop standing behind
    // every track so a missing file meant quieter rather than silent, and it was
    // 244 kB shipped to every player to insure against a failure that cannot
    // happen: all five beds are committed, and `fetchTrack` already returns null
    // safely, so a genuinely missing one is silence rather than a broken screen.
    const buffer = await fetchTrack(TRACK_URL[track], true);
    if (!buffer || muted || !ctx || !musicGain) return;
    // Superseded while decoding.
    if (wantedTrack !== track) return;

    const now = ctx.currentTime;
    const outgoing = musicSource;
    const outgoingGain = musicVoiceGain;
    if (outgoing && outgoingGain) {
      outgoingGain.gain.cancelScheduledValues(now);
      outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
      outgoingGain.gain.linearRampToValueAtTime(0.0001, now + 1.6);
      outgoing.stop(now + 1.7);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + (outgoing ? 1.6 : 2.5));
    gain.connect(musicGain);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(now);
    musicSource = source;
    musicVoiceGain = gain;
    musicBuffer = buffer;
    currentTrack = track;
    // The bus itself stays at nominal; the per-track gain does the fading, so a
    // duck and a crossfade cannot fight over the same parameter.
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicLevel(), now);
  } catch {
    // No track on disk — the game simply plays without music.
  } finally {
    musicLoading = false;
    // A title-to-duel click can request the battle bed while the unlock path
    // is still loading the menu bed. Do not lose that newer request.
    if (!muted && ctx && musicGain && wantedTrack !== currentTrack && wantedTrack !== track) {
      void setTrack(wantedTrack);
    }
  }
}

/** A one-shot over the bed: the win and the loss each get their own. */
export function playSting(name: Sting): void {
  if (muted || !ctx || !musicGain) return;
  void fetchTrack(TRACK_URL[name], false).then((buffer) => {
    if (!buffer || !ctx || !musicGain || muted) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 1.5;
    source.connect(gain);
    gain.connect(musicGain);
    duck(0.18, Math.min(6, buffer.duration));
    source.start();
  });
}

export async function startMusic(): Promise<void> {
  await setTrack(wantedTrack ?? "menu");
}

export function stopMusic(): void {
  if (!ctx || !musicSource) return;
  const t = ctx.currentTime;
  const source = musicSource;
  const gain = musicVoiceGain;
  musicSource = null;
  musicVoiceGain = null;
  currentTrack = null;
  if (gain) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
  }
  source.stop(t + 0.55);
}

// -------------------------------------------------------------------- voice
/**
 * Card themes.
 *
 * One 6-second sting per card or relic, cut from that item's YouTube source by
 * `scripts/build-card-stings.py` and served from `public/audio/stings/`. They
 * are fetched on demand rather than preloaded — 216 clips is ~29 MB on disk and
 * far more once decoded, so the cache holds the most recent handful.
 *
 * The battle loop is ducked almost to silence underneath, so a summon reads as
 * the music CROSSFADING to that card's theme and back, not as two pieces of
 * music playing at once.
 *
 * Only one theme sounds at a time. A turn that lands three minions should read
 * as three arrivals, not a pile-up, so a new summon cuts the previous sting.
 */
const CARD_THEME_ID = /^(?:c|r)\d+$/;

function isCardThemeId(cardId: string): boolean {
  return CARD_THEME_ID.test(cardId) || isThemedTokenId(cardId);
}

function themeUrl(cardId: string): string {
  const assetId = cardId.startsWith("token:") ? cardId.replace(/^token:/, "token-") : cardId;
  return `${import.meta.env.BASE_URL}audio/stings/${assetId}.ogg`;
}

async function loadTheme(cardId: string): Promise<AudioBuffer | null> {
  if (!isCardThemeId(cardId)) return null;
  const cached = themeCache.get(cardId);
  if (cached) return cached;
  if (themeMisses.has(cardId) || !ctx) return null;
  try {
    const response = await fetch(themeUrl(cardId));
    if (!response.ok) {
      themeMisses.add(cardId);
      return null;
    }
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    if (themeCache.size >= THEME_CACHE_LIMIT) {
      const oldest = themeCache.keys().next().value;
      if (oldest !== undefined) themeCache.delete(oldest);
    }
    themeCache.set(cardId, buffer);
    return buffer;
  } catch {
    // A missing or undecodable clip is never worth breaking a turn over: the
    // card simply lands in silence, exactly as it did before voices existed.
    themeMisses.add(cardId);
    return null;
  }
}

export function stopCardTheme(): void {
  themeToken += 1;
  if (!themeSource) return;
  const source = themeSource;
  themeSource = null;
  try {
    source.stop();
  } catch {
    // already finished
  }
}

/**
 * Speaks a card's line. `delay` lines it up behind the summon fanfare so the
 * two do not start on the same frame and smear into each other.
 */
export function playCardTheme(cardId: string, delay = 0): void {
  if (!isCardThemeId(cardId)) return;
  if (muted || mix.music <= 0) return;
  unlock();
  if (!ctx || !themeBus) return;
  const token = (themeToken += 1);
  void loadTheme(cardId).then((buffer) => {
    if (!buffer || !ctx || !themeBus) return;
    // Superseded while we were decoding — a faster card already spoke.
    if (token !== themeToken || muted) return;
    if (themeSource) {
      try {
        themeSource.stop();
      } catch {
        // already finished
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(themeBus);
    // Pull the battle loop down to near-silence for the sting's whole length.
    // 0.32 was right for a spoken line sitting ON the music; a card theme IS
    // music, and two pieces of music at once is mush, so this is a crossfade.
    //
    // The ceiling must stay AHEAD of the clip length. It was 3.4 s, sized for
    // the old 3-second stings, and at 6 seconds that silently brought the
    // battle loop back up halfway through the theme -- audible as the music
    // swelling over a sting that is still playing.
    duck(0.06, Math.min(THEME_DUCK_CEILING, buffer.duration + 0.2));
    const at = ctx.currentTime + Math.max(0, delay);
    source.start(at);
    stats.themesPlayed += 1;
    stats.lastTheme = cardId;
    themeSource = source;
    source.addEventListener("ended", () => {
      if (themeSource === source) themeSource = null;
    });
  });
}

/**
 * The herald.
 *
 * One narrator across the whole duel, on its own clip set with its own treatment
 * so it never reads as a card speaking. Deliberately fired on MOMENTS rather than
 * on every turn: a line on each turn change is the fastest way to make a voice
 * everyone liked in the first game unbearable by the third.
 *
 * It rides the EFFECTS bus now that the voice bus is gone: it is the only
 * spoken audio left, it is rare, and grouping it with the card themes would
 * mean the music fader silenced the herald too.
 */
export function playAnnouncer(clip: string, delay = 0): void {
  if (muted || mix.effects <= 0) return;
  unlock();
  if (!ctx || !sfxBus) return;
  const key = `announcer/${clip}`;
  void (async () => {
    let buffer = themeCache.get(key) ?? null;
    if (!buffer) {
      if (themeMisses.has(key) || !ctx) return;
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/vo/announcer/${clip}.ogg`);
        if (!response.ok) {
          themeMisses.add(key);
          return;
        }
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        themeCache.set(key, buffer);
      } catch {
        themeMisses.add(key);
        return;
      }
    }
    if (!ctx || !sfxBus || muted) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.92;
    source.connect(gain);
    gain.connect(sfxBus);
    duck(0.3, Math.min(3.4, buffer.duration + 0.15));
    source.start(ctx.currentTime + Math.max(0, delay));
    stats.themesPlayed += 1;
    stats.lastTheme = key;
  })();
}

/** Plays the licensed, CC0 JRPG trailer cue used when a duel begins. */
export function playOpeningCue(delay = 0): void {
  if (muted || mix.effects <= 0) return;
  unlock();
  if (!ctx || !sfxBus || openingCueMiss) return;
  void (async () => {
    let buffer = openingCueBuffer;
    if (!buffer) {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/stings/opening-jrpg-trailer.ogg`);
        if (!response.ok || !ctx) {
          openingCueMiss = true;
          return;
        }
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        openingCueBuffer = buffer;
      } catch {
        openingCueMiss = true;
        return;
      }
    }
    if (!ctx || !sfxBus || muted) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    // The opening cue should add drama without overpowering the battle bed.
    gain.gain.value = 0.35;
    source.connect(gain);
    gain.connect(sfxBus);
    duck(0.22, Math.min(THEME_DUCK_CEILING, buffer.duration + 0.15));
    source.start(ctx.currentTime + Math.max(0, delay));
  })();
}

/** Warms the cache for cards the player is about to be able to play. */
export function prefetchCardThemes(cardIds: string[]): void {
  if (muted || !ctx) return;
  for (const cardId of cardIds.filter(isCardThemeId).slice(0, 6)) {
    if (!themeCache.has(cardId) && !themeMisses.has(cardId)) void loadTheme(cardId);
  }
}

// ---------------------------------------------------------------------- mix
export function getMix(): Mix {
  return { ...mix };
}

export function setBusLevel(bus: Bus, value: number): void {
  const level = Math.max(0, Math.min(1, value));
  mix = { ...mix, [bus]: level };
  saveMix();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (bus === "music" && musicGain) {
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(musicLevel(), now, 0.05);
  }
  if (bus === "effects" && sfxBus) sfxBus.gain.setTargetAtTime(level, now, 0.05);
  // Card themes are music, so the music fader moves them with the loop.
  if (bus === "music" && themeBus) themeBus.gain.setTargetAtTime(level, now, 0.05);
}

// --------------------------------------------------------------------- mute
export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  saveMuted(next);
  if (next) {
    stopCardTheme();
    stopMusic();
  } else {
    unlock();
    void startMusic();
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

export function getStats() {
  return {
    ...stats,
    byName: { ...stats.byName },
    current: currentTrack,
    ctxState: ctx ? ctx.state : "none",
    muted,
    musicPlaying: musicSource !== null,
    musicGainValue: musicGain ? +musicGain.gain.value.toFixed(4) : null,
    musicGainNominal: MUSIC_GAIN,
  };
}

export function installUnlockListeners(): void {
  const once = () => unlock();
  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
}

export const sfx = {
  play,
  hoverTick,
  unlock,
  isMuted,
  setMuted,
  toggleMuted,
  startMusic,
  stopMusic,
  getStats,
  installUnlockListeners,
  summonSoundFor,
  playCardTheme,
  playAnnouncer,
  playHeavyLand,
  playOpeningCue,
  stopCardTheme,
  prefetchCardThemes,
  getMix,
  setBusLevel,
  setTrack,
  playSting,
};

if (import.meta.env.DEV) {
  const probe = async (fn: (() => void) | null, ms: number) => {
    unlock();
    if (!ctx || !master) return null;
    if (ctx.state === "suspended") await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    // Sample the bus: peak (loudness), energy (weight), activeMs (how long it rings).
    const scan = async (duration: number) => {
      let peak = 0;
      let energy = 0;
      let activeTicks = 0;
      const end = Date.now() + duration;
      while (Date.now() < end) {
        analyser.getFloatTimeDomainData(buf);
        let framePeak = 0;
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > framePeak) framePeak = a;
          energy += buf[i] * buf[i];
        }
        if (framePeak > 0.01) activeTicks++;
        if (framePeak > peak) peak = framePeak;
        await new Promise((r) => setTimeout(r, 16));
      }
      return { peak, energy, activeMs: activeTicks * 16 };
    };
    const wasMuted = muted;
    muted = false;
    const base = await scan(120);
    if (fn) fn();
    const s = await scan(ms);
    muted = wasMuted;
    master.disconnect(analyser);
    return {
      baseline: +base.peak.toFixed(4),
      peak: +s.peak.toFixed(4),
      energy: +s.energy.toFixed(1),
      activeMs: s.activeMs,
      ctxState: ctx.state,
    };
  };

  (window as unknown as { __sfx?: unknown }).__sfx = {
    ...sfx,
    probePeak: async (name: SfxName, ms = 900) => {
      stopMusic();
      const r = await probe(() => play(name), ms);
      return { name, ...r };
    },
    /**
     * A card theme is the one sound in the game that comes off disk rather than
     * out of an oscillator, so it has a whole extra way to be silent: the fetch
     * or the decode can fail and every counter still reads healthy. This measures
     * the bus, which is the only thing that cannot lie.
     */
    probeCardTheme: async (cardId: string, ms = 2600) => {
      stopMusic();
      const before = getMix().music;
      setBusLevel("music", 1);
      const r = await probe(() => playCardTheme(cardId), ms);
      setBusLevel("music", before);
      return { cardId, ...r };
    },
    /**
     * Proves the CROSSFADE, which no other probe can see: every one of them
     * stops the music first, so they all measure a card theme playing over
     * silence. This reads the music loop's own gain param -- the thing `duck()`
     * actually automates -- before, during and after a sting.
     */
    probeDuck: async (cardId: string) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      setMuted(false);
      // Restore whatever was loaded afterwards. probeLoopSeam measures the
      // CURRENTLY loaded buffer, so a probe that quietly leaves a different
      // track selected makes an unrelated check fail further down the suite.
      const previousTrack = currentTrack;
      await setTrack("battle");
      await startMusic();
      await wait(900);
      const nominal = musicGain ? musicGain.gain.value : 0;
      playCardTheme(cardId);
      await wait(700); // duck ramps over 50 ms, so this is well inside the hold
      const ducked = musicGain ? musicGain.gain.value : 0;
      // Must outlast the sting itself plus the 0.7 s ramp back, or this reads a
      // still-ducked value and reports a failure that is really a short wait.
      await wait((THEME_DUCK_CEILING + 1.2) * 1000);
      const restored = musicGain ? musicGain.gain.value : 0;
      if (previousTrack && previousTrack !== "battle") await setTrack(previousTrack);
      stopMusic();
      return { nominal, ducked, restored };
    },
    probeTrack: async (track: Track, ms = 2200) => {
      await setTrack(track);
      const r = await probe(null, ms);
      return { track, playing: musicSource !== null, current: currentTrack, ...r };
    },
    probeMusic: async (ms = 1500) => {
      await startMusic();
      const r = await probe(null, ms);
      return { musicPlaying: musicSource !== null, ...r };
    },
    /**
     * By construction the crossfade makes looped[0] the original sample that
     * immediately FOLLOWS looped[last] — so wrapping is sample-adjacent, while a
     * naive loop would jump from the track's last sample back to its first.
     */
    probeLoopSeam: async () => {
      await startMusic();
      if (!musicRaw || !musicBuffer) return { error: "no music" };
      const raw = musicRaw.getChannelData(0);
      const loop = musicBuffer.getChannelData(0);
      const naiveJump = Math.abs(raw[0] - raw[raw.length - 1]);
      const seamlessJump = Math.abs(loop[0] - loop[loop.length - 1]);
      const expectedNext = raw[musicBuffer.length]; // the sample right after the loop's last
      return {
        rawSeconds: +(musicRaw.length / musicRaw.sampleRate).toFixed(2),
        loopSeconds: +(musicBuffer.length / musicBuffer.sampleRate).toFixed(2),
        naiveJump: +naiveJump.toFixed(5),
        seamlessJump: +seamlessJump.toFixed(5),
        firstSampleIsAdjacent: Math.abs(loop[0] - expectedNext) < 1e-6,
      };
    },
  };
}
