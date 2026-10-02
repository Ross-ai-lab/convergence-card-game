import { useEffect, useRef, useState } from 'react';

type Watcher = { observer: IntersectionObserver; listeners: Map<Element, (near: boolean) => void> };
const watchers = new WeakMap<Element, Watcher>();

/** Load nearby artwork eagerly without ever discarding an already decoded image. */
export function useGalleryVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!near) return;
    // Promote once. Changing decoding/loading back during a pending decode
    // can abort WebKit's image request even though the source URL is unchanged.
    for (const image of ref.current?.querySelectorAll('img') ?? []) {
      if (image.loading === 'lazy' && !image.complete) image.loading = 'eager';
    }
  }, [near]);
  useEffect(() => {
    const element = ref.current;
    const body = element?.closest('.gallery-body');
    if (!element || !body || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    let boundRoot: Element | null = null;
    let boundWatcher: Watcher | undefined;
    const detach = () => {
      if (!boundRoot || !boundWatcher) return;
      boundWatcher.observer.unobserve(element);
      boundWatcher.listeners.delete(element);
      if (!boundWatcher.listeners.size) { boundWatcher.observer.disconnect(); watchers.delete(boundRoot); }
    };
    const bind = () => {
      const outer = element.closest('.gallery-mobile-scroll');
      const root = getComputedStyle(body).overflowY === 'visible' && outer ? outer : body;
      if (root === boundRoot) return;
      detach();
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
      boundRoot = root; boundWatcher = watcher;
    };
    bind();
    window.addEventListener('resize', bind);
    return () => {
      window.removeEventListener('resize', bind);
      detach();
    };
  }, []);
  return { ref, near, onFocus: () => setNear(true) };
}
