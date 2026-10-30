import { useEffect, useRef } from "react";

/**
 * The page's beats, for anything that holds a change back until the screen is changing anyway. A look's picture that
 * arrives after its wait is one: swapping the backdrop in the middle of a question would jolt the room, so it waits
 * for the next beat. The page that owns the beat announces it, and a surface listens only while it holds something.
 * At present only the big screen's router announces (at each new screen or question), so a surface on a page that
 * never announces never takes what it holds, and keeps the drawn set.
 */
const listeners = new Set<() => void>();

/** Tells everything that is holding a change back that the page has moved to its next beat. */
export function announceLookBeat(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` at each beat until the returned function is called. */
export function onLookBeat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For the page that owns the beat: announces each time `key` changes. The key it first renders with is the page arriving, not a beat. */
export function useAnnounceLookBeat(key: string): void {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    announceLookBeat();
  }, [key]);
}
