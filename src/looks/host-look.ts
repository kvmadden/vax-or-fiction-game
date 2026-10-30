import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { lookFlag, readRememberedLook, rememberLook, resolveHostLook, type LookId, type LookStorage } from "./look";
import { patternFlag, readRememberedPatterns, rememberPatterns, resolveHostPatterns } from "./patterns/pattern-setting";

/**
 * The look the host page shows, whether topic patterns draw behind its questions, and the picks the host makes in
 * setup. Each starts from its URL flag, then what this device remembered, then its default (Today, and patterns on).
 * `pick` and `setPatterns` apply at once and remember the choice for the next game on this device. A flag is only ever
 * a starting point, so it is never written to the device.
 */
export interface HostLookState {
  look: LookId;
  patterns: boolean;
  pick(look: LookId): void;
  setPatterns(on: boolean): void;
}

export type HostLookStore = StoreApi<HostLookState>;

/** Leave `search` and `storage` out to read the page's own address and the browser's storage, or pass null storage for none. */
export function createHostLookStore(seed: { search?: string; storage?: LookStorage | null } = {}): HostLookStore {
  const search = seed.search ?? (typeof window === "undefined" ? "" : window.location.search);
  const { storage } = seed;
  return createStore<HostLookState>()((set) => ({
    look: resolveHostLook({ flag: lookFlag(search), remembered: readRememberedLook(storage) }),
    patterns: resolveHostPatterns({ flag: patternFlag(search), remembered: readRememberedPatterns(storage) }),
    pick(look) {
      rememberLook(look, storage);
      set({ look });
    },
    setPatterns(on) {
      rememberPatterns(on, storage);
      set({ patterns: on });
    },
  }));
}

/** The host page's own store. A node test has no window, so it starts on Today with patterns on, and every test builds its own. */
export const hostLookStore: HostLookStore = createHostLookStore();

export function useHostLook<T>(selector: (state: HostLookState) => T): T {
  return useStore(hostLookStore, selector);
}
