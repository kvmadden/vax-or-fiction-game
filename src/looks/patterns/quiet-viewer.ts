import { useSyncExternalStore } from "react";

/**
 * A viewer who asks for less transparency or forced colours never sees a topic pattern: patterns.css hides the layer for
 * them. So the slot does not fetch it for them either (the layer, its stylesheet and its tile). The stylesheet's rule
 * stays as the fallback for a browser that cannot read these settings from a script.
 */
export const QUIET_VIEWER = "(prefers-reduced-transparency: reduce), (forced-colors: active)";

function quietQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(QUIET_VIEWER);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const list = quietQuery();
  if (!list) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

const snapshot = (): boolean => quietQuery()?.matches ?? false;
// A page rendered in node has no viewer, and the browser reads the real setting before the layer could load.
const serverSnapshot = (): boolean => false;

/** Whether this viewer asks for less transparency or forced colours, kept current if they change the setting. */
export function useQuietViewer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
