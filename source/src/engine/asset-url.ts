/**
 * The one place a public asset address is turned into a URL the browser can use.
 *
 * The published game lives at `/convergence-card-game/play/`, and `vite.config.ts`
 * sets `base: './'` so everything under that folder resolves relative to the page.
 * That only rewrites the addresses Vite can SEE. An address written straight into
 * the source as `"/card-art/raw/galactus.webp"` ships exactly as typed, and the
 * leading slash sends the browser to the DOMAIN root instead — a 404 for a file
 * that is sitting on the server, correctly uploaded, one folder away. Six summoned
 * tokens shipped broken that way while all 196 real cards worked, because the cards
 * came through here and the tokens did not.
 *
 * So: every runtime asset address goes through this function, engine code included.
 */

/**
 * The base the app is being served from.
 *
 * Read defensively on purpose. `import.meta.env` exists under Vite and Vitest, but
 * `scripts/simulate.ts` runs this same engine under plain Node through tsx, where it
 * does not exist at all. Reaching for `.BASE_URL` directly there is a TypeError that
 * takes down the balance simulator, so an absent env falls back to serving from root.
 */
function currentBase(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL ?? "/";
}

export function resolvePublicAssetUrl(assetPath: string, baseUrl: string = currentBase()): string {
  if (!assetPath || /^(?:data:|blob:|https?:\/\/)/i.test(assetPath)) return assetPath;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, "")}`;
}
