/**
 * How big a card's text is allowed to be.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Two arithmetic estimates lived in App.tsx:
 *
 *   fitOneLine(text, boxW, ratio)              -> boxW / (ratio * length)
 *   fitBox(text, boxW, boxH, ratio, lineHeight)-> sqrt(area / (length * ratio * lh))
 *
 * They multiplied a character count by a hand-calibrated average character
 * width. That is fine while a hard ceiling is doing the real work — every card
 * whose text was even slightly short hit the `min(37, …)` cap and the estimate
 * never mattered. It stops being fine the moment the ceiling goes up, because
 * then the estimate IS the answer for most of the roster, and an area estimate
 * has a specific blind spot: it assumes text can fill a box completely, when
 * real text wraps at word boundaries and leaves a ragged right edge. The wider
 * the words relative to the line, the more it overestimates — which is exactly
 * the regime a big font puts you in.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * Measures the real glyphs with the real fonts through a canvas, wraps the text
 * the way the browser will wrap it, counts the lines that actually result, and
 * binary-searches the largest size that still fits the box. No character-width
 * constant anywhere.
 *
 * NO REFLOW LOOP, and no flash of huge text. Nothing here touches the DOM or
 * reads layout — a canvas measurement does not invalidate anything, so this runs
 * during render like any other calculation. That was the property the old
 * estimates existed to protect and it is kept.
 *
 * FONTS LOAD LATE, which is the one genuine complication. Before Nunito and
 * Baloo 2 arrive, `measureText` silently answers with the fallback font's
 * metrics and every answer is wrong. So: measure anyway (the fallback is close
 * enough that nothing looks broken), and when `document.fonts.ready` resolves,
 * throw the cache away and let App re-render once with real numbers. The first
 * paint is never oversized because the fallback is wider than Nunito, not
 * narrower — erring toward text that is slightly too small for a few
 * milliseconds, which is invisible.
 *
 * Sizes in and out are DESIGN UNITS (the card's 750x1050 space), never pixels.
 * Everything on the card scales linearly with `--u`, so a ratio measured at any
 * nominal pixel size is the same ratio at every real size.
 */

export type FitFont = "rules" | "flavor" | "name";

/** Matches the CSS on `.cf-desc p`, `.cf-flavor` and `.cf-name`. */
const FONT_CSS: Record<FitFont, (size: number) => string> = {
  rules: (s) => `700 ${s}px "Nunito", sans-serif`,
  flavor: (s) => `italic 600 ${s}px "Nunito", sans-serif`,
  name: (s) => `700 ${s}px "Baloo 2", cursive`,
};

let ctx: CanvasRenderingContext2D | null = null;
let cache = new Map<string, number>();
let fontsReady = false;

function measurer(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === "undefined") return null;
  ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

/**
 * Greedy word wrap, the same rule the browser uses: words go on the current
 * line until one does not fit. Returns the line count, or Infinity when a single
 * word is wider than the box (which would overflow rather than wrap, so the
 * caller has to shrink).
 */
function lineCount(text: string, size: number, boxW: number, font: FitFont): number {
  const c = measurer();
  if (!c) return Infinity;
  c.font = FONT_CSS[font](size);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let lines = 1;
  let width = 0;
  const space = c.measureText(" ").width;
  for (const word of words) {
    const w = c.measureText(word).width;
    if (w > boxW) return Infinity; // one word cannot fit; nothing wraps out of this
    if (width === 0) {
      width = w;
    } else if (width + space + w <= boxW) {
      width += space + w;
    } else {
      lines += 1;
      width = w;
    }
  }
  return lines;
}

function search(fits: (size: number) => boolean, ceiling: number): number {
  if (!fits(6)) return 6; // give up rather than return something unreadable
  let lo = 6;
  let hi = ceiling;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // Half-unit steps: finer than the eye can tell at card scale and it keeps the
  // cache keys stable across re-renders.
  return Math.floor(lo * 2) / 2;
}

/**
 * Largest size (design units) at which `text` wraps into `boxW` x `boxH`.
 * `lineHeight` is the CSS line-height multiplier for that element.
 */
export function fitParagraph(
  text: string,
  boxW: number,
  boxH: number,
  lineHeight: number,
  ceiling: number,
  font: FitFont = "rules",
): number {
  if (!text) return ceiling;
  const key = `p|${font}|${boxW}|${boxH}|${lineHeight}|${ceiling}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  // A browser's line box is slightly TALLER than font-size x line-height: it adds
  // half-leading above and below, and a descender on the last line can reach past
  // the box. Measuring to the exact height therefore lands one or two pixels over
  // on the cards that fill their plaque completely, which `overflow: hidden`
  // silently clips — the bottom of the last line disappears and nothing errors.
  // 3% covers it and costs about 1.5% of font size. It does NOT chase the last
  // pixel: sub-pixel layout rounding leaves some paragraphs reporting one pixel
  // of overflow at any margin (widening this to 6% moved nothing), and one pixel
  // of a descender is invisible where a clipped LINE is 14. The check tolerates
  // 2px for the same reason and still fails loudly on a real clip.
  const usable = boxH * 0.97;
  const value = search((size) => {
    const lines = lineCount(text, size, boxW, font);
    return lines * size * lineHeight <= usable;
  }, ceiling);
  cache.set(key, value);
  return value;
}

/** Largest size (design units) that keeps `text` on ONE line inside `boxW`. */
export function fitOneLine(text: string, boxW: number, ceiling: number, font: FitFont = "name"): number {
  if (!text) return ceiling;
  const key = `l|${font}|${boxW}|${ceiling}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = search((size) => {
    const c = measurer();
    if (!c) return false;
    c.font = FONT_CSS[font](size);
    return c.measureText(text).width <= boxW;
  }, ceiling);
  cache.set(key, value);
  return value;
}

/**
 * Resolves once the card fonts are actually available. Callers should clear
 * their render on the callback — every measurement taken before this point used
 * the fallback font's metrics.
 */
export function onFontsReady(callback: () => void): void {
  if (fontsReady) return;
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) {
    fontsReady = true;
    return;
  }
  void Promise.all([
    fonts.load('700 100px "Nunito"'),
    fonts.load('italic 600 100px "Nunito"'),
    fonts.load('700 100px "Baloo 2"'),
  ])
    .catch(() => undefined)
    .then(() => {
      fontsReady = true;
      cache = new Map();
      callback();
    });
}
