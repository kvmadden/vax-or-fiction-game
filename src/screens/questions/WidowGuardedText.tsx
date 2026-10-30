import React, { useLayoutEffect, useRef, useState } from "react";
import { resolveBlockShape } from "./widow-guard";

type Tag = "h1" | "p" | "span" | "div";

export interface WidowGuardedTextProps {
  /** The raw, unmodified text (before any widow join). */
  text: string;
  /** From useFontsReady(), and in every kind component also the measured answer step's own ready
   * flag: measurement never runs, and the element stays hidden, until true. */
  fontsReady: boolean;
  /** Reviewer fix (mid-question resize): `useMeasuredStemStep`'s own `scale` field. A label's
   * widow-join decision is made independently of the stem, in this component's own effect below,
   * so it needs its own trigger to re-settle when a resize changes the stage scale: included in
   * `source` below, the same reset-on-change mechanism a new `text` already uses. Defaults to 1 so
   * an existing caller that has not been updated to pass it keeps behaving exactly as before. */
  scale?: number;
  /** Pass 4c-1b: an answer label may also narrow its own measure (widow-guard.ts
   * `LABEL_MEASURE_STEPS`) when no join alone gives it an acceptable shape. */
  allowNarrowing?: boolean;
  as?: Tag;
  className?: string;
  style?: React.CSSProperties;
  /** How to turn the (possibly widow-joined) text into the actual rendered children, for a
   * caller that layers its own processing on top (emphasis highlighting, keep-compound spans).
   * Defaults to rendering the text verbatim. */
  render?: (resolvedText: string) => React.ReactNode;
  [dataAttr: `data-${string}`]: unknown;
}

/**
 * STAGE-SPEC pass 4c-1, extended in pass 4c-1b (brief item 4). Renders `text`, then measures how
 * it actually wrapped and settles its line shape with widow-guard.ts's `resolveBlockShape`: as it
 * wraps when that is acceptable, else the first safe join of its last words, else (with
 * `allowNarrowing`) a slightly narrower measure, alone or with a join. The element stays hidden
 * until this resolves, so the audience only ever sees the final text and measure, never the
 * unmodified render this measurement depends on. A narrower measure is extra inline end padding
 * inside the element's own box, so the box, its text start and its row never move.
 */
export const WidowGuardedText: React.FC<WidowGuardedTextProps> = ({
  text,
  fontsReady,
  allowNarrowing = false,
  scale = 1,
  as = "span",
  className,
  style,
  render,
  ...rest
}) => {
  const ref = useRef<HTMLElement | null>(null);
  // `source` is the input the current state was settled for. A new `text`, `allowNarrowing` or
  // `scale` (a mid-question resize, reviewer fix), or the fonts gate closing again (the kind's
  // measurement starting over), first puts the raw text back with no narrowing and hides it,
  // during render (React's pattern for resetting state on an input change), so the next
  // measurement never reads text or padding left over from before.
  const source = `${allowNarrowing ? "narrow" : "keep"}|${scale}|${text}`;
  const [state, setState] = useState<{ source: string; text: string; narrowPx: number; padEndPx: number; balance: boolean; ready: boolean }>({ source, text, narrowPx: 0, padEndPx: 0, balance: false, ready: false });
  const raw = { source, text, narrowPx: 0, padEndPx: 0, balance: false, ready: false };
  const stale = state.source !== source || (!fontsReady && (state.ready || state.text !== text || state.narrowPx !== 0 || state.balance));
  if (stale) setState(raw);
  const view = stale ? raw : state;

  useLayoutEffect(() => {
    if (!fontsReady || state.ready || state.source !== source) return;
    const el = ref.current;
    if (!el || typeof window === "undefined") {
      setState({ ...raw, ready: true });
      return;
    }
    // Reviewer fix (item 5): timed on the same shared clock the stem's own measurement uses, so a
    // caller that predefines `window.__VOF_MEASURE_TIMES__` (the full-bank sweep) sees the
    // slowest measurement across BOTH the stem's own hook and every answer label's own effect, not
    // only the stem's.
    const measureStart = typeof performance !== "undefined" ? performance.now() : 0;
    const recordMeasureTime = () => {
      if (typeof performance === "undefined" || typeof window === "undefined") return;
      const times = (window as typeof window & { __VOF_MEASURE_TIMES__?: number[] }).__VOF_MEASURE_TIMES__;
      if (Array.isArray(times)) times.push(performance.now() - measureStart);
    };
    try {
      const resolved = resolveBlockShape(el, allowNarrowing);
      // The element shows its raw text with no narrowing here (the reset above guarantees it), so
      // its computed end padding is the stylesheet's own base, the one resolveBlockShape measured
      // the narrower measure against.
      const baseEnd = parseFloat(getComputedStyle(el).paddingInlineEnd) || 0;
      setState({ source, text: resolved.text, narrowPx: resolved.narrowPx, padEndPx: baseEnd + resolved.narrowPx, balance: resolved.balance, ready: true });
      recordMeasureTime();
    } catch {
      // A measurement that throws must never leave the label hidden for good: show it as written.
      setState({ ...raw, ready: true });
      recordMeasureTime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, fontsReady, allowNarrowing, state.source, state.ready]);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        // The narrower measure: the stylesheet's own end padding plus the narrowing, exactly the
        // padding resolveBlockShape measured. `data-narrowed` carries the added px alone, so a raw
        // clone (widow-guard.ts `cloneForMeasure`) can take it back off.
        ...(view.narrowPx > 0 ? { paddingInlineEnd: `${view.padEndPx}px` } : {}),
        visibility: view.ready ? style?.visibility : "hidden",
      }}
      data-narrowed={view.narrowPx > 0 ? view.narrowPx : undefined}
      // The balanced measure (widow-guard.ts's last rung): the stylesheet's own `text-wrap:
      // balance` rule keys on this attribute, and a raw clone takes it off again.
      data-balanced={view.balance ? "true" : undefined}
      {...rest}
    >
      {render ? render(view.text) : view.text}
    </Tag>
  );
};
