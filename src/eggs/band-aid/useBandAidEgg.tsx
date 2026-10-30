import React, { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_FIVE_TAP, isBandAidOn, tapEgg, type FiveTapState } from './five-tap';
import { SyringeBandAid } from './SyringeBandAid';

/** How long the peel plays before the band-aid leaves. Matches band-aid-egg.css's own peel. */
export const PEEL_MS = 420;

export interface BandAidEgg {
  /** Spread on the wordmark's root. Empty while the egg is off, so every other screen renders exactly as before. */
  rootProps: { 'data-band-aid-egg'?: 'off' | 'on' | 'peeling' };
  /** Drawn inside the syringe's own svg, after its path. */
  bandAid: React.ReactNode;
  /** The invisible tap target laid over the syringe, at least 44px each way. */
  target: React.ReactNode;
}

const OFF: BandAidEgg = { rootProps: {}, bandAid: null, target: null };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The landing syringe's band-aid egg (2026-09-28). Off unless `enabled`, and ShowWordmark only enables it for the
 * landing page, so the five other screens that draw the wordmark never carry it. The tap target is a decoration,
 * not a control: hidden from assistive tech and out of the tab order, since the band-aid itself says nothing.
 *
 * Its styles load with the egg, from band-aid-egg.css, and the target only renders once they have, so no unstyled
 * element ever sits in the wordmark's flow. Nothing it adds is in flow at all, so the wordmark's box never moves.
 */
export function useBandAidEgg(enabled: boolean): BandAidEgg {
  const [state, setState] = useState<FiveTapState>(INITIAL_FIVE_TAP);
  const stateRef = useRef<FiveTapState>(INITIAL_FIVE_TAP);
  const [peeling, setPeeling] = useState(false);
  const [styled, setStyled] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    // If the stylesheet cannot load, the egg simply never appears: the target waits for it.
    import('./band-aid-egg.css').then(() => { if (live) setStyled(true); }, () => {});
    return () => { live = false; };
  }, [enabled]);

  useEffect(() => {
    if (!peeling) return undefined;
    const timer = window.setTimeout(() => setPeeling(false), PEEL_MS);
    return () => window.clearTimeout(timer);
  }, [peeling]);

  const onTap = useCallback(() => {
    const current = stateRef.current;
    const next = tapEgg(current, performance.now());
    if (next === current) return;
    stateRef.current = next;
    setState(next);
    // A band-aid coming off peels away, unless the person asked for less motion: then it simply goes.
    if (isBandAidOn(current) && !isBandAidOn(next)) setPeeling(!prefersReducedMotion());
    else if (isBandAidOn(next)) setPeeling(false);
  }, []);

  if (!enabled) return OFF;
  const on = isBandAidOn(state);
  const phase = on ? 'on' : peeling ? 'peeling' : null;
  return {
    rootProps: { 'data-band-aid-egg': phase ?? 'off' },
    // Keyed by when it went on, so every new band-aid mounts fresh and slaps on again.
    bandAid: phase ? <SyringeBandAid key={state.shownAt ?? 'peeling'} phase={phase} /> : null,
    target: styled ? <span className="band-aid-egg__target" data-role="band-aid-egg-target" aria-hidden="true" onClick={onTap} /> : null,
  };
}
