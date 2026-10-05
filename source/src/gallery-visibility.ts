import { useEffect, useRef, useState } from 'react';

type Watcher = {
  observer:IntersectionObserver;
  listeners:Map<Element,(near:boolean)=>void>;
  rebind:()=>void;
};
const watchers=new WeakMap<Element,Watcher>();
function galleryWatcher(body:Element):Watcher {
  const listeners:Watcher['listeners']=new Map();
  let root:Element|null=null;
  const notify=(entries:IntersectionObserverEntry[])=>{
    for(const entry of entries)listeners.get(entry.target)?.(entry.isIntersecting||entry.target.contains(document.activeElement));
  };
  const watcher:Watcher={observer:null!,listeners,rebind:()=>{
    const outer=body.closest('.gallery-mobile-scroll');
    const next=getComputedStyle(body).overflowY==='visible'&&outer?outer:body;
    if(next===root)return;
    watcher.observer?.disconnect();root=next;
    watcher.observer=new IntersectionObserver(notify,{root,rootMargin:'700px 0px'});
    for(const element of listeners.keys())watcher.observer.observe(element);
  }};
  watcher.rebind();
  // One breakpoint read per gallery, not one per card on every resize.
  window.addEventListener('resize',watcher.rebind);
  return watcher;
}

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
    let watcher=watchers.get(body);
    if(!watcher){watcher=galleryWatcher(body);watchers.set(body,watcher);}
    watcher.listeners.set(element,setNear);watcher.observer.observe(element);
    return()=>{
      watcher.observer.unobserve(element);watcher.listeners.delete(element);
      if(!watcher.listeners.size){
        watcher.observer.disconnect();window.removeEventListener('resize',watcher.rebind);watchers.delete(body);
      }
    };
  }, []);
  return { ref, near, onFocus: () => setNear(true) };
}
