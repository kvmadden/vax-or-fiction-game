import { useEffect, useState } from "react";

/**
 * Pass 4c-1b: `document.fonts.ready` settles once every weight the page has already REQUESTED has
 * loaded, not once every weight the page will go on to use has loaded. A weight nothing has drawn
 * with yet (a heavier stem or label size no earlier paint touched) can still be missing after
 * `ready` resolves, so a measurement taken right then can measure the wrong glyphs. Loading each
 * font spec explicitly with `document.fonts.load` forces the browser to actually fetch it, raced
 * against a timeout so a font that never loads (a network failure, a font host down) cannot hang
 * every caller forever: after the timeout this resolves anyway and the caller measures with
 * whatever is present rather than staying hidden for good.
 */
export const FONT_GATE_TIMEOUT_MS = 1500;

/** Matches use-measured-stem-step.ts's own LABEL_SELECTOR: the two files gate on the same fonts
 * (the stem and the first answer label), so they must agree on where to find the label. */
const LABEL_SELECTOR = ".answer-bar__label, .order-bar > div > span";

/**
 * A `document.fonts.load`-compatible spec built from the individual longhand properties, not the
 * `font` shorthand. `getComputedStyle(el).font` serializes to an EMPTY STRING in some browsers
 * once a property the shorthand cannot express is set (`font-variant-numeric: tabular-nums`,
 * question-stage.css's own estimate range labels): `fontSet.load('')` is a silent no-op, skipping
 * the explicit load this whole gate exists to force. Style, weight, size and family are the only
 * four the shorthand's own required-property grammar needs, and every one of them serializes on
 * its own regardless of what else is set.
 */
export function computedFontSpec(el: HTMLElement): string {
  const computed = getComputedStyle(el);
  return `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`.trim();
}

/**
 * Requests `specs` (each a CSS `font` shorthand, from `getComputedStyle(el).font`) and resolves
 * once every one has settled (loaded or failed) or `timeoutMs` has passed, whichever comes first.
 * A spec that fails to load resolves its own `load()` promise to a rejection, caught here so one
 * bad spec cannot hang the others.
 */
export function settleFonts(specs: string[], timeoutMs: number = FONT_GATE_TIMEOUT_MS): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fontSet) return Promise.resolve();
  const ready: Promise<unknown> = fontSet.ready ?? Promise.resolve();
  const loads = specs.filter(Boolean).map((spec) => fontSet.load(spec).catch(() => []));
  const settled = Promise.all([ready, ...loads]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  return Promise.race([settled, timeout]);
}

/**
 * True once IBM Plex has actually loaded (the stem's own weight and the first answer label's own
 * weight, requested explicitly, with the timeout above). Shared by every widow-guard measurement
 * (widow-guard.ts, WidowGuardedText.tsx) so text is never measured, and never judged for a real
 * widow, in a fallback system font: a fallback font can wrap at different word boundaries than the
 * real one, which would make the guard's own decision wrong for the font the audience actually
 * sees.
 */
export function useFontsReady(): boolean {
  // Pass 4c-1b (reviewer fix): `document.fonts.status === "loaded"` only means every weight the
  // page has already REQUESTED has settled, never that this hook's own stem-and-label specs are
  // among them, so it used to skip `settleFonts` entirely whenever it happened to read true on
  // mount, silently reporting ready before requesting the one weight it exists to gate on. SSR
  // still starts ready outright (there is nothing to measure): "undefined document" is the only
  // fast path left.
  const [ready, setReady] = useState<boolean>(() => typeof document === "undefined");

  useEffect(() => {
    if (ready || typeof document === "undefined") return;
    let cancelled = false;
    const stemEl = document.querySelector<HTMLElement>(
      '.question-stage-copy h1, .question-stage-copy [data-comp-id="statement"]'
    );
    const labelEl = document.querySelector<HTMLElement>(LABEL_SELECTOR);
    const specs = [stemEl, labelEl]
      .filter((el): el is HTMLElement => el != null)
      .map((el) => computedFontSpec(el));
    settleFonts(specs).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
