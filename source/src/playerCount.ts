export const PLAYER_COUNT_API = "https://convergence-player-counter.hosbosmos.workers.dev/count";

const COUNTED_BROWSER_KEY = "convergence.player-counted.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type PlayerCountOptions = {
  request?: typeof fetch;
  storage?: StorageLike | null;
};

/**
 * Register this browser once, then return the shared public player count.
 * If storage is unavailable, read the total without incrementing so a privacy
 * setting cannot turn every refresh into a new player.
 */
export async function loadPlayerCount(options: PlayerCountOptions = {}): Promise<number | null> {
  const request = options.request ?? globalThis.fetch;
  let storage = options.storage;

  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }

  let shouldRegister = false;
  if (storage) {
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
