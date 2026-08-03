const PLAYER_COUNT_API = "https://convergence-player-counter.hosbosmos.workers.dev/count";

async function showPlayerCount() {
  try {
    const response = await fetch(PLAYER_COUNT_API, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;

    const payload = await response.json();
    if (!Number.isSafeInteger(payload.count) || payload.count < 0) return;

    document.querySelectorAll("[data-player-count-value]").forEach((element) => {
      element.textContent = payload.count.toLocaleString();
    });
    document.querySelectorAll("[data-player-count]").forEach((element) => {
      element.hidden = false;
    });
  } catch {
    // The page and game remain fully usable if the optional counter is offline.
  }
}

void showPlayerCount();
