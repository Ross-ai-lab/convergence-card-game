export const PLAYER_COUNT_API = "https://convergence-player-counter.hosbosmos.workers.dev/count";

const COUNTED_BROWSER_KEY = "convergence.player-counted.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type PlayerCountOptions = {
  request?: typeof fetch;
  storage?: StorageLike | null;
  /** The page's own origin. Defaults to the live one; tests pass their own. */
  origin?: string | null;
};

/**
 * A dev server may READ the count and may never WRITE it — `counter/worker.js`
 * enforces that deliberately, so the public figure cannot be inflated by every
 * debugging session and screenshot run.
 *
 * The client has to know it too. Asking to register from localhost is a request
 * that can only ever come back 403, and it did: two console errors on every
 * local boot of the game, which is exactly the noise the worker's read-allowance
 * was written to remove. Skipping the write locally leaves the read, so the
 * count still shows while developing.
 */
const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

/**
 * Register this browser once, then return the shared public player count.
 * If storage is unavailable, read the total without incrementing so a privacy
 * setting cannot turn every refresh into a new player.
 */
export async function loadPlayerCount(options: PlayerCountOptions = {}): Promise<number | null> {
  const request = options.request ?? globalThis.fetch;
  const origin = options.origin === undefined ? globalThis.location?.origin ?? null : options.origin;
  let storage = options.storage;

  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }

  let shouldRegister = false;
  if (storage && !LOCAL_ORIGIN.test(origin ?? "")) {
    try {
      shouldRegister = storage.getItem(COUNTED_BROWSER_KEY) !== "yes";
    } catch {
      storage = null;
    }
  }

  try {
    const response = await request(PLAYER_COUNT_API, {
      method: shouldRegister ? "POST" : "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { count?: unknown };
    if (!Number.isSafeInteger(payload.count) || (payload.count as number) < 0) return null;

    if (shouldRegister && storage) {
      try {
        storage.setItem(COUNTED_BROWSER_KEY, "yes");
      } catch {
        // The counter succeeded; a blocked local marker should not hide it.
      }
    }

    return payload.count as number;
  } catch {
    return null;
  }
}
