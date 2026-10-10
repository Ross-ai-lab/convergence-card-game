// Draws the rarity shine textures into src/assets/shine/.
//
//   npm run build:shine
//
// The shine is a few small pictures per tier that the browser only moves, turns
// and fades. Everything expensive (soft falloffs, the flame temperature ramp,
// the masks that cap the rays and the flames, the inset rim glow) is baked into
// these pictures once, here, instead of being recomputed by the graphics chip on
// every frame. The reasons are in the RARITY SHINE comment in App.css.
//
// Every texture is drawn in the card's DESIGN UNITS (the shine box is 732 x 1032
// of them, the card's inner face) and then scaled to its pixel size, so the
// numbers below can be read straight against App.css. Random placement is
// seeded, so a rebuild reproduces the same files byte for byte on one machine.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const OUT = new URL("../src/assets/shine/", import.meta.url);

/** Runs in the browser: returns { name: webpDataUrl } for every texture. */
function drawAll() {
  const W = 732; // shine box width, design units
  const H = 1032; // shine box height
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  /** A canvas for a layer of lw x lh design units, `px` pixels wide. */
  const layer = (lw, lh, px) => {
    const s = px / lw;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(lw * s);
    canvas.height = Math.round(lh * s);
    const ctx = canvas.getContext("2d");
    ctx.scale(s, s);
    return { canvas, ctx, s };
  };
  const out = {};
  const save = (name, canvas) => { out[name] = canvas.toDataURL("image/webp", 0.92); };

  /** A soft elliptical glow; the falloff is eased so it has no visible edge. */
  const blob = (ctx, cx, cy, rx, ry, rgb, a) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [at, k] of [[0, 1], [0.3, 0.8], [0.6, 0.38], [0.82, 0.12], [1, 0]]) g.addColorStop(at, rgba(rgb, a * k));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /** One particle: a near-white core falling off through the tier colour. */
  const dot = (ctx, x, y, core, glow, coreRgba, glowRgb, glowA) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, glow);
    g.addColorStop(0, coreRgba);
    g.addColorStop(core / glow, rgba(glowRgb, glowA));
    g.addColorStop(1, rgba(glowRgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, glow, 0, Math.PI * 2);
    ctx.fill();
  };

  /**
   * A particle field two card-heights tall whose top half equals its bottom
   * half, so translating it by -50% (or +50%) loops with no seam. Particles are
   * placed with a minimum spacing: random is what keeps them from reading as a
   * grid, and the spacing is what keeps two from fusing into one blob.
   */
  const particles = ({ name, lw, px, count, seed, core, glow, coreRgba, glowRgb, glowA, alpha = 1 }) => {
    const T = H; // one tile is one card height
    const { canvas, ctx } = layer(lw, T * 2, px);
    const r = rng(seed);
    const placed = [];
    for (let tries = 0; placed.length < count && tries < 4000; tries++) {
      const p = { x: glow[1] + r() * (lw - glow[1] * 2), y: r() * T, k: r() };
      if (placed.every((q) => Math.hypot(q.x - p.x, Math.min(Math.abs(q.y - p.y), T - Math.abs(q.y - p.y))) > lw / Math.sqrt(count) * 0.55)) placed.push(p);
    }
    ctx.globalAlpha = alpha;
    for (const p of placed) {
      const c = core[0] + (core[1] - core[0]) * p.k;
      const g = glow[0] + (glow[1] - glow[0]) * p.k;
      for (const dy of [-T, 0, T, 2 * T]) if (p.y + dy > -g && p.y + dy < 2 * T + g) dot(ctx, p.x, p.y + dy, c, g, coreRgba, glowRgb, glowA);
    }
    save(name, canvas);
  };

  /**
   * The rim: an inset glow plus a thin inner line, as a CSS inset box-shadow
   * would draw them. A canvas shadow blur is twice the Gaussian sigma, exactly
   * like a CSS blur radius, so the numbers carry over unchanged.
   */
  const rim = ({ name, glows, line }) => {
    const { canvas, ctx } = layer(W, H, 400);
    const R = 10;
    for (const { blur, rgb, a } of glows) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, R);
      ctx.clip();
      ctx.shadowColor = rgba(rgb, a);
      ctx.shadowBlur = blur * (canvas.width / W);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.rect(-W, -H, W * 3, H * 3);
      ctx.roundRect(0, 0, W, H, R);
      ctx.fill("evenodd");
      ctx.restore();
    }
    ctx.lineWidth = line.width;
    ctx.strokeStyle = rgba(line.rgb, line.a);
    ctx.beginPath();
    ctx.roundRect(line.width / 2, line.width / 2, W - line.width, H - line.width, R - line.width / 2);
    ctx.stroke();
    save(name, canvas);
  };

  // ---------------------------------------------------------------- EPIC
  // Violet mist drifting sideways, dust settling through it.
  {
    const lw = W * 1.5, lh = H * 1.5, ox = W * 0.25, oy = H * 0.25;
    const { canvas, ctx } = layer(lw, lh, 360);
    blob(ctx, ox + W * 0.2, oy + H * 0.22, W * 0.44, H * 0.34, [186, 132, 252], 0.6);
    blob(ctx, ox + W * 0.8, oy + H * 0.68, W * 0.42, H * 0.32, [142, 92, 226], 0.56);
    blob(ctx, ox + W * 0.5, oy + H * 0.98, W * 0.38, H * 0.22, [206, 164, 255], 0.44);
    blob(ctx, ox + W * 0.62, oy + H * 0.36, W * 0.22, H * 0.16, [226, 196, 255], 0.3);
    save("epic-mist", canvas);
  }
  particles({ name: "epic-dust-near", lw: W * 1.12, px: 480, count: 9, seed: 11, core: [1.2, 1.9], glow: [3.4, 4.8], coreRgba: "rgba(248, 236, 255, 1)", glowRgb: [184, 128, 250], glowA: 0.62 });
  particles({ name: "epic-dust-far", lw: W * 1.12, px: 480, count: 11, seed: 12, core: [0.8, 1.1], glow: [2.3, 3], coreRgba: "rgba(242, 228, 255, 0.85)", glowRgb: [168, 114, 242], glowA: 0.44, alpha: 0.8 });
  rim({ name: "epic-rim", glows: [{ blur: 30, rgb: [178, 122, 240], a: 0.5 }], line: { width: 1.6, rgb: [206, 168, 250], a: 0.3 } });

  // ----------------------------------------------------------- LEGENDARY
  // Ten thin rays turning about the card's foot, each its own gold. The radial
  // fade that used to be a CSS mask is baked in, so the layer is one picture.
  {
    const size = 320;
    const { canvas, ctx } = layer(size, size, 384);
    const c = size / 2;
    const golds = [[255, 246, 204], [255, 232, 154], [255, 215, 102], [255, 242, 184], [255, 223, 127], [255, 250, 224], [255, 207, 77], [255, 234, 168], [255, 217, 140], [255, 248, 214]];
    const cone = ctx.createConicGradient(((12 - 90) * Math.PI) / 180, c, c);
    const soft = 0.9; // degrees of feather on each ray edge
    golds.forEach((rgb, i) => {
      const a = i * 36, b = a + 4.4;
      cone.addColorStop(Math.max(0, a - soft) / 360, rgba(rgb, 0));
      cone.addColorStop(a / 360, rgba(rgb, 0.42));
      cone.addColorStop(b / 360, rgba(rgb, 0.42));
      cone.addColorStop(Math.min(360, b + soft) / 360, rgba(rgb, 0));
    });
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "destination-in";
    const fade = ctx.createRadialGradient(c, c, 0, c, c, 150);
    for (const [at, a] of [[0.02, 0], [0.24, 0.92], [0.66, 0.5], [1, 0]]) fade.addColorStop(at, `rgba(0, 0, 0, ${a})`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
    save("legendary-rays", canvas);
  }
  {
    const lw = W * 0.8, lh = H * 0.5;
    const { canvas, ctx } = layer(lw, lh, 256);
    blob(ctx, lw / 2, lh / 2, W * 0.3, H * 0.15, [255, 232, 168], 0.4);
    save("legendary-bloom", canvas);
  }
  rim({ name: "legendary-rim", glows: [{ blur: 40, rgb: [255, 200, 96], a: 0.62 }], line: { width: 2.2, rgb: [255, 236, 176], a: 0.55 } });

  // -------------------------------------------------------------- MYTHIC
  // A bed of flame along the foot. Each tongue is a tapered shape with a
  // temperature ramp along its length (white, gold, orange, red, gone), the
  // tongues ADD where they overlap the way light does, and the band is faded
  // off the bottom edge and capped low, so the flame never sits on the gems.
  const flames = (name, tongues, ramp, seed) => {
    const lh = H * 0.12;
    const { canvas, ctx, s } = layer(W, lh, 640);
    const r = rng(seed);
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const sx = scratch.getContext("2d");
    sx.scale(s, s);
    sx.globalCompositeOperation = "lighter";
    if (name === "mythic-flame") blob(sx, W / 2, lh + 6, W * 0.62, H * 0.05, [255, 120, 40], 0.55);
    for (const [x, halfWidth, height] of tongues) {
      const cx = W * x, base = lh + 4, tip = base - H * height;
      const lean = (r() - 0.5) * halfWidth * 0.9;
      const g = sx.createLinearGradient(0, base, 0, tip);
      for (const [at, rgb, a] of ramp) g.addColorStop(at, rgba(rgb, a));
      sx.fillStyle = g;
      sx.beginPath();
      sx.moveTo(cx - W * halfWidth, base);
      sx.bezierCurveTo(cx - W * halfWidth * 0.9, base - (base - tip) * 0.45, cx + lean - W * halfWidth * 0.25, tip + (base - tip) * 0.25, cx + lean, tip);
      sx.bezierCurveTo(cx + lean + W * halfWidth * 0.25, tip + (base - tip) * 0.3, cx + W * halfWidth * 0.95, base - (base - tip) * 0.4, cx + W * halfWidth, base);
      sx.closePath();
      sx.fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${(2.8 * s).toFixed(2)}px)`;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    // The cap: fully gone 11% of the card above the foot, faded off the edge.
    ctx.globalCompositeOperation = "destination-in";
    const cap = ctx.createLinearGradient(0, lh, 0, 0);
    for (const [f, a] of [[0, 0], [0.02, 0.55], [0.045, 1], [0.075, 0.62], [0.11, 0]]) cap.addColorStop(f / 0.12, `rgba(0, 0, 0, ${a})`);
    ctx.fillStyle = cap;
    ctx.fillRect(0, 0, W, lh);
    save(name, canvas);
  };
  /** Tongues with uneven spacing, width and height: even spacing is the tell
   *  that turns a fire back into a pattern. [x, half width, height] in card fractions. */
  const tongueRow = (seed, count, width, height) => {
    const r = rng(seed);
    return Array.from({ length: count }, (_, i) => [
      (i + 0.5 + (r() - 0.5) * 0.7) / count,
      width[0] + (width[1] - width[0]) * r(),
      height[0] + (height[1] - height[0]) * r(),
    ]);
  };
  flames(
    "mythic-flame",
    tongueRow(21, 15, [0.026, 0.05], [0.06, 0.16]),
    [[0, [255, 252, 238], 0.82], [0.2, [255, 210, 112], 0.72], [0.48, [250, 126, 40], 0.5], [0.74, [208, 40, 24], 0.26], [1, [180, 20, 16], 0]],
    21,
  );
  flames(
    "mythic-core",
    tongueRow(22, 11, [0.03, 0.055], [0.04, 0.075]),
    [[0, [255, 255, 252], 0.95], [0.3, [255, 234, 172], 0.72], [0.62, [252, 152, 52], 0.38], [1, [240, 110, 40], 0]],
    22,
  );
  particles({ name: "mythic-embers-near", lw: W, px: 428, count: 9, seed: 31, core: [1.5, 2.4], glow: [4.2, 6.4], coreRgba: "rgba(255, 250, 236, 1)", glowRgb: [255, 128, 58], glowA: 0.72 });
  particles({ name: "mythic-embers-far", lw: W, px: 428, count: 12, seed: 32, core: [0.9, 1.3], glow: [2.6, 3.4], coreRgba: "rgba(255, 236, 206, 0.9)", glowRgb: [255, 150, 78], glowA: 0.5, alpha: 0.85 });
  rim({ name: "mythic-rim", glows: [{ blur: 52, rgb: [255, 88, 44], a: 0.8 }, { blur: 14, rgb: [255, 156, 92], a: 0.5 }], line: { width: 2.6, rgb: [255, 190, 140], a: 0.66 } });

  // --------------------------------------------------------------- RELIC
  // An aurora: curtains of light hanging in loose waves, not round blobs.
  {
    const lw = W * 1.5, lh = H * 1.5, ox = W * 0.25, oy = H * 0.25;
    const { canvas, ctx, s } = layer(lw, lh, 360);
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const sx = scratch.getContext("2d");
    sx.scale(s, s);
    sx.globalCompositeOperation = "lighter";
    const curtains = [
      { y: 0.26, amp: 0.05, waves: 1.3, phase: 0.4, tall: 0.24, from: -0.1, to: 0.86, rgb: [126, 240, 255], a: 0.2 },
      { y: 0.6, amp: 0.06, waves: 1.1, phase: 2.1, tall: 0.22, from: 0.18, to: 1.12, rgb: [64, 196, 232], a: 0.2 },
      { y: 0.88, amp: 0.04, waves: 1.6, phase: 4.0, tall: 0.16, from: 0.05, to: 0.95, rgb: [130, 255, 214], a: 0.15 },
    ];
    for (const c of curtains) {
      const step = 5;
      for (let x = c.from * W; x <= c.to * W; x += step) {
        const t = (x - c.from * W) / ((c.to - c.from) * W);
        const along = Math.sin(Math.PI * t) ** 1.2 * (0.75 + 0.25 * Math.sin(t * 17 + c.phase));
        const cy = oy + H * (c.y + c.amp * Math.sin(t * Math.PI * 2 * c.waves + c.phase));
        const top = cy - H * c.tall * 0.75, bottom = cy + H * c.tall * 0.25;
        const g = sx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, rgba(c.rgb, 0));
        g.addColorStop(0.55, rgba(c.rgb, c.a * along * 0.7));
        g.addColorStop(0.86, rgba([220, 255, 255], c.a * along));
        g.addColorStop(1, rgba(c.rgb, 0));
        sx.fillStyle = g;
        sx.fillRect(ox + x, top, step + 1, bottom - top);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${(9 * s).toFixed(2)}px)`;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    save("relic-aurora", canvas);
  }
  particles({ name: "relic-motes", lw: W, px: 428, count: 10, seed: 41, core: [0.9, 1.4], glow: [2.4, 4], coreRgba: "rgba(236, 253, 255, 0.95)", glowRgb: [150, 236, 255], glowA: 0.4 });
  {
    // The light bar, tilted 14 degrees off vertical, centred in a layer 0.8 of
    // the card wide so it can cross in one transform.
    const lw = W * 0.8;
    const { canvas, ctx } = layer(lw, H, 256);
    ctx.translate(lw / 2, H / 2);
    ctx.rotate((14 * Math.PI) / 180);
    const g = ctx.createLinearGradient(-135, 0, 135, 0);
    for (const [at, a] of [[0, 0], [0.32, 0.22], [0.5, 0.52], [0.68, 0.22], [1, 0]]) g.addColorStop(at, at === 0.5 ? `rgba(255, 255, 255, ${a})` : `rgba(214, 250, 255, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(-135, -H * 0.62, 270, H * 1.24);
    save("relic-sweep", canvas);
  }
  rim({ name: "relic-rim", glows: [{ blur: 26, rgb: [150, 240, 255], a: 0.5 }], line: { width: 2, rgb: [196, 248, 255], a: 0.5 } });

  return out;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const textures = await page.evaluate(drawAll);
  await mkdir(OUT, { recursive: true });
  let total = 0;
  for (const [name, url] of Object.entries(textures)) {
    if (!url.startsWith("data:image/webp")) throw new Error(`${name}: the browser did not encode WebP`);
    const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    total += bytes.length;
    await writeFile(new URL(`${name}.webp`, OUT), bytes);
    console.log(`${name}.webp  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  console.log(`${Object.keys(textures).length} textures, ${(total / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
