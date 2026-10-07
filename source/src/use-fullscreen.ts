import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isFullscreenActive = () => Boolean(document.fullscreenElement);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(isFullscreenActive());
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreenActive()) {
      void document.exitFullscreen().catch((error: unknown) => {
        console.warn("Could not exit full screen.", error);
      });
      return;
    }

    const request = document.documentElement.requestFullscreen;
    if (!request) return;
    void request.call(document.documentElement).catch((error: unknown) => {
      console.warn("Could not enter full screen.", error);
    });
  }, []);

  return { isFullscreen, toggleFullscreen };
}
