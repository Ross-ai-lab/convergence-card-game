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
let widthCache = new Map<string, WordWidths>();
let singleCache = new Map<string, number>();
let fontsReady = false;

function measurer(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === "undefined") return null;
  ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

/**
 * MEASURE EACH WORD ONCE, NOT ONCE PER SEARCH STEP.
 *
 * Canvas advance widths are linear in font size — a glyph's advance is scaled by
 * the size, not re-hinted — so a word measured at one size gives its width at
 * every size by simple proportion. Verified on this font stack across sizes 6 to
 * 48: maximum relative error 0.0004%, which is four orders of magnitude below
 * the half-unit rounding the search already applies.
 *
 * That matters because the binary search below runs fourteen steps, and the
 * naive version re-measured every word on every step. A rules paragraph of
 * sixteen words cost ~224 `measureText` calls per fit, six fits per card, 196
 * cards in the gallery: about a quarter of a million canvas calls, and a
 * measured **6.3 second** main-thread block the first time the gallery opened.
 *
 * Now each distinct (text, font) pair is measured once and the search does
 * arithmetic. Same answers, same rounding — the fit values are unchanged, which
 * `npm run check:cardface` verifies by measuring the rendered cards.
 */
const REFERENCE_SIZE = 100;

interface WordWidths {
  /** Advance width of each word at REFERENCE_SIZE. */
  words: number[];
  /** Advance width of a single space at REFERENCE_SIZE. */
  space: number;
}

/**
 * Width of a whole string at REFERENCE_SIZE, for the one-line fitter.
 *
 * Deliberately its own cache rather than a trick played on `wordWidths`. The
 * first attempt at this joined the words with a non-breaking space so the string
 * would look like a single word — and U+00A0 does not have a regular space's
 * advance in these fonts, so every multi-word card name measured narrower than
 * it renders and was sized up to 13.8px too wide. `check-cardface` caught it;
 * nothing else would have.
 */
function stringWidth(text: string, font: FitFont): number | null {
  const key = `1|${font}|${text}`;
  const hit = singleCache.get(key);
  if (hit !== undefined) return hit;
  const c = measurer();
  if (!c) return null;
  c.font = FONT_CSS[font](REFERENCE_SIZE);
  const width = c.measureText(text).width;
  singleCache.set(key, width);
  return width;
}

function wordWidths(text: string, font: FitFont): WordWidths | null {
  const key = `${font}|${text}`;
  const hit = widthCache.get(key);
  if (hit) return hit;
  const c = measurer();
  if (!c) return null;
  c.font = FONT_CSS[font](REFERENCE_SIZE);
  const value: WordWidths = {
    words: text.split(/\s+/).filter(Boolean).map((word) => c.measureText(word).width),
    space: c.measureText(" ").width,
  };
  widthCache.set(key, value);
  return value;
}

/**
 * Greedy word wrap, the same rule the browser uses: words go on the current
 * line until one does not fit. Returns the line count, or Infinity when a single
 * word is wider than the box (which would overflow rather than wrap, so the
 * caller has to shrink).
 */
function lineCount(text: string, size: number, boxW: number, font: FitFont): number {
  const measured = wordWidths(text, font);
  if (!measured) return Infinity;
  if (measured.words.length === 0) return 0;
  const scale = size / REFERENCE_SIZE;
  const space = measured.space * scale;
  let lines = 1;
  let width = 0;
  for (const reference of measured.words) {
    const w = reference * scale;
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
  // 10% covers it and costs about 5% of font size. It does NOT chase the last
  // pixel: sub-pixel layout rounding leaves some paragraphs reporting one pixel
  // of overflow at any margin (margins beyond this moved nothing), and one pixel
  // of a descender is invisible where a clipped LINE is 14. The check tolerates
  // 2px for the same reason and still fails loudly on a real clip.
  const usable = boxH * 0.9;
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
  // One measurement of the real string, scaled through every search step.
  const reference = stringWidth(text, font);
  const value = search((size) => {
    if (reference === null) return false;
    return (reference * size) / REFERENCE_SIZE <= boxW;
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
      // Both caches. The width cache holds fallback-font metrics until this
      // point, and keeping it would pin every card to the wrong measurements
      // for the rest of the session.
      cache = new Map();
      widthCache = new Map();
      singleCache = new Map();
      callback();
    });
}
