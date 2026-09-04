/** Launch the Chromium installed by this project's Playwright dependency. */
export async function loadChromium() {
  return (await import("playwright")).chromium;
}

/**
 * The usual launch, with any extra Chromium args a caller needs.
 *
 * When `CONVERGENCE_BROWSER_WS` is set it CONNECTS to that already-running
 * browser instead of starting one. `check-all.mjs` sets it so several suites
 * share one browser while running at the same time; each still gets its own
 * context, so their storage and their pages cannot see each other. A connected
 * `browser.close()` only drops the connection, which is why the suites can keep
 * calling it exactly as they do when they own the browser.
 */
export async function launch(extraArgs = []) {
  const chromium = await loadChromium();
  const shared = process.env.CONVERGENCE_BROWSER_WS;
  if (shared) return chromium.connect(shared);
  return chromium.launch({
    ...(extraArgs.length ? { args: extraArgs } : {}),
  });
}

/**
 * Jump every transition and animation on the page straight to its end state.
 *
 * A HEADLESS PAGE NEVER PAINTS, so a CSS transition never advances: the hovered
 * card measures at its starting size, the faded panel measures at zero opacity,
 * and everything about the check looks like a broken feature. It is not — the
 * `:hover` matches, the rule is in the CSSOM and the custom property resolves;
 * only the interpolation is frozen, because nothing is asking for frames.
 *
 * Call this after the screen is set up and before measuring or photographing.
 * It cost an hour the first time (the pack's hover-to-enlarge, 4 September
 * 2026), and it is the same hour for every fade, slide and lift after it.
 *
 * `animations: false` keeps keyframe animations running — use that when the
 * thing being checked is an animation and the transitions are what is in the
 * way.
 */
export async function settleMotion(page, { animations = true } = {}) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      /* A NEGATIVE DELAY, not a zero one. On a page that never paints an
         animation's clock may never have started at all, so shortening its
         duration leaves it at 0% — measured on the pack's deal animation, whose
         cards kept reporting two-thirds of their settled width. Starting it a
         second in the past puts every animation past its end, where its fill
         mode holds the final frame. */
      ${animations ? "animation-duration: 0.001s !important; animation-delay: -1s !important;" : ""}
    }`,
  });
  // One frame for the style to take effect, without needing a paint.
  await page.waitForTimeout(50);
}
