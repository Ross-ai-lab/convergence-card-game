import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Launch the Chromium installed by this project's Playwright dependency. */
export async function loadChromium() {
  return (await import("playwright")).chromium;
}

/**
 * A Chromium already on this machine, for when the one matching this project's
 * Playwright version was never downloaded. Cloud sessions ship a preinstalled
 * browser under /opt/pw-browsers whose build number rarely matches ours.
 */
function installedChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", path.join(os.homedir(), ".cache", "ms-playwright")]
    .filter((root) => root && fs.existsSync(root));
  const builds = (root, prefix) => fs.readdirSync(root)
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const root of roots) {
    for (const dir of builds(root, "chromium_headless_shell-")) {
      const binary = path.join(root, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (fs.existsSync(binary)) return binary;
    }
    for (const dir of builds(root, "chromium-")) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const binary = path.join(root, dir, sub);
        if (fs.existsSync(binary)) return binary;
      }
    }
  }
  return null;
}

/** Runs a Chromium start, retrying once with an installed browser when ours is missing. */
async function withInstalledFallback(start, options = {}) {
  try {
    return await start(options);
  } catch (error) {
    const executablePath = /Executable doesn't exist/.test(String(error?.message)) ? installedChromium() : null;
    if (!executablePath) throw error;
    console.warn(`Playwright's own Chromium is not installed; using ${executablePath}`);
    return start({ ...options, executablePath });
  }
}

/** Starts a shareable browser server, with the same fallback as launch(). */
export async function launchServer() {
  const chromium = await loadChromium();
  return withInstalledFallback((options) => chromium.launchServer(options));
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
  return withInstalledFallback((options) => chromium.launch(options), extraArgs.length ? { args: extraArgs } : {});
}

/**
 * Freeze motion for geometry checks and deliberate screenshots. This does not
 * measure smoothness: performance runs keep real animations and frame painting
 * active. A hidden preview can fail to advance paint-driven motion, while a
 * normal headless Chromium page does paint, so never infer a stall from geometry
 * taken midway through an animation.
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
