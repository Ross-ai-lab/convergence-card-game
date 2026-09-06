import { useEffect, useRef, useState } from 'react';

type Watcher = { observer: IntersectionObserver; listeners: Map<Element, (near: boolean) => void> };
const watchers = new WeakMap<Element, Watcher>();

/** Keep lightweight, focusable grid cells; only nearby cells need full card faces. */
export function useGalleryVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const root = element?.closest('.gallery-body');
    if (!element || !root || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    let watcher = watchers.get(root);
    if (!watcher) {
      const listeners: Watcher['listeners'] = new Map();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          listeners.get(entry.target)?.(entry.isIntersecting || entry.target.contains(document.activeElement));
        }
      }, { root, rootMargin: '700px 0px' });
      watcher = { observer, listeners };
      watchers.set(root, watcher);
    }
    watcher.listeners.set(element, setNear);
    watcher.observer.observe(element);
    return () => {
      watcher.observer.unobserve(element);
      watcher.listeners.delete(element);
      if (!watcher.listeners.size) {
        watcher.observer.disconnect();
        watchers.delete(root);
      }
    };
  }, []);
  return { ref, near, onFocus: () => setNear(true) };
}
