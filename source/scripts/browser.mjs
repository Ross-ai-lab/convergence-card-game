/** Launch the Chromium installed by this project's Playwright dependency. */
export async function loadChromium() {
  return (await import("playwright")).chromium;
}

/** The usual launch, with any extra Chromium args a caller needs. */
export async function launch(extraArgs = []) {
  const chromium = await loadChromium();
  return chromium.launch({
    ...(extraArgs.length ? { args: extraArgs } : {}),
  });
}
