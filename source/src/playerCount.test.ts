import { describe, expect, it, vi } from "vitest";
import { loadPlayerCount, PLAYER_COUNT_API } from "./playerCount";

function memoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("player count", () => {
  it("registers a browser once and saves its marker", async () => {
    const storage = memoryStorage();
    const request = vi.fn(async () => new Response(JSON.stringify({ count: 12 }), { status: 200 }));

    await expect(loadPlayerCount({ request, storage })).resolves.toBe(12);
    expect(request).toHaveBeenCalledWith(PLAYER_COUNT_API, expect.objectContaining({ method: "POST" }));
    expect(storage.setItem).toHaveBeenCalledWith("convergence.player-counted.v1", "yes");
  });

  it("only reads the total when this browser is already counted", async () => {
    const storage = memoryStorage("yes");
    const request = vi.fn(async () => new Response(JSON.stringify({ count: 12 }), { status: 200 }));

    await expect(loadPlayerCount({ request, storage })).resolves.toBe(12);
    expect(request).toHaveBeenCalledWith(PLAYER_COUNT_API, expect.objectContaining({ method: "GET" }));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not mark a browser when the counter request fails", async () => {
    const storage = memoryStorage();
    const request = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(loadPlayerCount({ request, storage })).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reads but never registers from a dev server", async () => {
    const storage = memoryStorage();
    const request = vi.fn(async () => new Response(JSON.stringify({ count: 12 }), { status: 200 }));

    // The worker answers a POST from localhost with 403 on purpose, so asking
    // to register there only ever produced console noise and no count.
    await expect(loadPlayerCount({ request, storage, origin: "http://localhost:5177" })).resolves.toBe(12);
    expect(request).toHaveBeenCalledWith(PLAYER_COUNT_API, expect.objectContaining({ method: "GET" }));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
