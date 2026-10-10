/**
 * The rarity shine's layers, per tier: which pre-drawn texture goes in which
 * slot. The textures are drawn by `scripts/build-shine.mjs`; the motion lives in
 * App.css under THE RARITY SHINE. Rare is absent on purpose: it is the baseline
 * the other tiers escalate from.
 */
import epicMist from "./assets/shine/epic-mist.webp";
import epicDustNear from "./assets/shine/epic-dust-near.webp";
import epicDustFar from "./assets/shine/epic-dust-far.webp";
import epicRim from "./assets/shine/epic-rim.webp";
import legendaryRays from "./assets/shine/legendary-rays.webp";
import legendaryBloom from "./assets/shine/legendary-bloom.webp";
import legendaryRim from "./assets/shine/legendary-rim.webp";
import mythicFlame from "./assets/shine/mythic-flame.webp";
import mythicCore from "./assets/shine/mythic-core.webp";
import mythicEmbersNear from "./assets/shine/mythic-embers-near.webp";
import mythicEmbersFar from "./assets/shine/mythic-embers-far.webp";
import mythicRim from "./assets/shine/mythic-rim.webp";
import relicAurora from "./assets/shine/relic-aurora.webp";
import relicMotes from "./assets/shine/relic-motes.webp";
import relicSweep from "./assets/shine/relic-sweep.webp";
import relicRim from "./assets/shine/relic-rim.webp";

export interface ShineLayer {
  /** The slot class App.css positions and animates: `sh-<slot>`. */
  slot: "field" | "rays" | "bloom" | "flame" | "core" | "near" | "far" | "sweep" | "rim";
  src: string;
}

/** Keyed by the lower-case rarity class a card face already carries. */
export const SHINE_LAYERS: Readonly<Record<string, readonly ShineLayer[]>> = {
  purple: [
    { slot: "field", src: epicMist },
    { slot: "far", src: epicDustFar },
    { slot: "near", src: epicDustNear },
    { slot: "rim", src: epicRim },
  ],
  yellow: [
    { slot: "bloom", src: legendaryBloom },
    { slot: "rays", src: legendaryRays },
    { slot: "rim", src: legendaryRim },
  ],
  red: [
    { slot: "far", src: mythicEmbersFar },
    { slot: "near", src: mythicEmbersNear },
    { slot: "flame", src: mythicFlame },
    { slot: "core", src: mythicCore },
    { slot: "rim", src: mythicRim },
  ],
  relic: [
    { slot: "field", src: relicAurora },
    { slot: "near", src: relicMotes },
    { slot: "sweep", src: relicSweep },
    { slot: "rim", src: relicRim },
  ],
};

// Fetch and decode every texture at start-up, so the first shiny card to appear
// moves at once instead of fading in a frame or two after its face.
if (typeof Image !== "undefined") {
  for (const layers of Object.values(SHINE_LAYERS)) {
    for (const { src } of layers) {
      const image = new Image();
      image.src = src;
      image.decode?.().catch(() => {});
    }
  }
}
