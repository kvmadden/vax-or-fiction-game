// The syringe egg's tap counter (2026-09-28), pure so it can be tested without a browser. Five taps on the
// landing syringe, each within about two seconds of the one before, slap a band-aid on it. A slow tap starts the
// count over at one. A tap on the band-aid peels it off, once it has had a moment to stick, so the same burst of
// taps that put it on cannot also knock it straight back off.

/** Taps it takes to put the band-aid on. */
export const TAPS_TO_SHOW = 5;
/** The longest gap between two taps that still counts as the same run of taps. */
export const TAP_GAP_MS = 2000;
/** How long a fresh band-aid ignores taps while it settles. */
export const SETTLE_MS = 500;

export interface FiveTapState {
  /** Taps counted in the current run, 0 through 4. */
  count: number;
  /** When the last counted tap landed, or null before the first one. */
  lastTapAt: number | null;
  /** When the band-aid went on, or null while it is off. */
  shownAt: number | null;
}

export const INITIAL_FIVE_TAP: FiveTapState = { count: 0, lastTapAt: null, shownAt: null };

export function isBandAidOn(state: FiveTapState): boolean {
  return state.shownAt !== null;
}

/** A tap on the syringe. Counts toward the band-aid, and the fifth quick one puts it on. */
export function tapSyringe(state: FiveTapState, now: number): FiveTapState {
  if (isBandAidOn(state)) return state;
  const quick = state.lastTapAt !== null && now - state.lastTapAt <= TAP_GAP_MS;
  const count = quick ? state.count + 1 : 1;
  if (count >= TAPS_TO_SHOW) return { count: 0, lastTapAt: null, shownAt: now };
  return { count, lastTapAt: now, shownAt: null };
}

/** A tap on the band-aid. Peels it off, unless it went on a moment ago, and the count starts over. */
export function tapBandAid(state: FiveTapState, now: number): FiveTapState {
  if (!isBandAidOn(state) || now - (state.shownAt ?? now) < SETTLE_MS) return state;
  return INITIAL_FIVE_TAP;
}

/** One tap on the egg: on the band-aid while it is on, and on the syringe while it is off. */
export function tapEgg(state: FiveTapState, now: number): FiveTapState {
  return isBandAidOn(state) ? tapBandAid(state, now) : tapSyringe(state, now);
}
