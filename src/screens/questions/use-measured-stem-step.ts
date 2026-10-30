import { useLayoutEffect, useState, type RefObject } from "react";
import type { FormatId, QuestionKind } from "../../data/types";
import { CONTENT_ZONE_H, answerLadder, stemSizeFor, type StemStep } from "./stage-fit";
import { STEM_STEP_ORDER, resolveMeasuredStemStep, stepDownPastUnacceptableShape } from "./measured-stem-step";
import { cloneForMeasure, hasUnacceptableShape, resolveBlockShape, unjoinTree } from "./widow-guard";
import { computedFontSpec, settleFonts } from "./use-fonts-ready";

export interface MeasuredStemStep {
  stemStep: StemStep;
  /** The answer rail's size step, after the layout fallback (pass 4c-1b). Equal to the caller's
   * `firstPassAnswerStep` until ready, and always for binary (no answer ladder). */
  answerStep: number | null;
  /** `rawStemText` with its last words joined only when a real measurement, taken at the resolved
   * step's own font size, proves it is safe (widow-guard.ts). Equal to `rawStemText` until ready. */
  guardedText: string;
  /** True when the stem renders balanced (`data-balanced="true"` on the h1): widow-guard.ts's last
   * rung, taken only when no join and no pull-down join gave the stem a clean shape at this step.
   * False until ready. */
  balanced: boolean;
  /** False until the real measurement has landed. The caller keeps the stem, and every answer
   * label, visually hidden while this is false, so the audience never sees a size chosen from the
   * character estimate. */
  ready: boolean;
  /** Reviewer fix (mid-question resize): the stage scale (`--stage-scale`) this decision was made
   * against, 1 until measured. Passed to each answer label's own `WidowGuardedText` as its `scale`
   * prop so a label's own widow-guard decision, made independently inside that component, also
   * re-settles when a resize changes the scale, not only the stem this hook measures directly. */
  scale: number;
}

const canMeasure = typeof document !== "undefined" && typeof window !== "undefined";
const LABEL_SELECTOR = ".answer-bar__label, .order-bar > div > span";

/**
 * STAGE-SPEC pass 4c-1 (spec 4.2 steps 2-3, section 12's own "calibrate k before trusting the
 * thresholds"), extended in pass 4c-1b (brief item 4). Production used to pick the stem step from a
 * character-count estimate (k = 0.52, an average): pass 4b's own residual proved a single k cannot
 * predict two real stems one character apart, one of which rewraps at a step and one of which does
 * not. This hook replaces the estimate with a real measurement, taken in a layout effect before
 * the stem or any answer label is ever shown to the audience:
 *
 * 1. Start from stage-fit.ts's own character-estimate steps (`firstPassStep`, and
 *    `firstPassAnswerStep` for a kind with an answer ladder), the only values SSR or a DOM-free
 *    render ever sees. The caller's `ready` gate keeps the stem and labels hidden meanwhile.
 * 2. Wait for `document.fonts.ready`. IBM Plex is never measured before it has actually loaded:
 *    measuring a fallback system font would measure the wrong glyphs entirely.
 * 3. The answer rail's layout fallback (pass 4c-1b): a label whose line shape nothing but a smaller
 *    step can repair (widow-guard.ts `hasUnacceptableShape`, which first tries a safe join and a
 *    slightly narrower measure) is a label that does not fit at that step. The rail walks down
 *    stage-fit.ts's own answer ladder, one step for every card as spec 4.5 requires ("a long answer
 *    steps down for the whole rail"), to the first step where every label reads clean, or else to
 *    the step with the fewest that do not (`stepDownPastUnacceptableShape`). Each candidate is
 *    measured on hidden clones at the candidate's rendered size (the rendered floor included), never
 *    by changing the live rail: a page that runs transitions (reduced motion sets every property's
 *    to 0.01ms) reports the size it is animating away from on a synchronous read.
 *    When the rail does change step, the decided step is committed first and the stem is measured
 *    only once the live labels report their new size, so step 4 sees the real rail.
 * 4. Clone the real, already-rendered stem (inheriting its true computed font stack), set its
 *    font-size to each candidate step's rendered size (its canvas size, or the rendered floor
 *    when that is larger, exactly what the stem's own CSS paints), and read the clone's real
 *    height. That delta against the stem's own real height, added to the real measured height of
 *    the whole content group (stem block through the rail's own bottom edge, read straight off the
 *    live DOM at the decided answer step), decides whether a candidate step would really fit
 *    (`resolveMeasuredStemStep`, the pure grow/shrink walk).
 * 5. The stem's own layout fallback (pass 4c-1b): a step whose stem shape is unacceptable does not
 *    fit either, so the stem walks down its ladder to the first clean step
 *    (`stepDownPastUnacceptableShape`). stage-layout-checks.ts's grow-to-fit-boundary applies the
 *    same rule to the step above, so a stem held below its cap for this reason is not reported as
 *    one that could have grown.
 * 6. The widow join is decided at the final step, then everything lands in the one state update
 *    that flips `ready`, so nothing the audience has already seen changes size afterward.
 *
 * Beat-stable by construction: this only re-measures when `contentKey` changes (built by the
 * caller from kind, format, stem, scenario, options, count and tallyReserved), never when only
 * vote or lock state changes, so posed and locked resolve to identical steps for the identical
 * question (spec 6's own beat-stability rule).
 */
export function useMeasuredStemStep(
  rootRef: RefObject<HTMLElement | null>,
  kind: QuestionKind,
  format: FormatId,
  firstPassStep: StemStep,
  contentKey: string,
  rawStemText: string,
  firstPassAnswerStep: number | null = null,
): MeasuredStemStep {
  const [state, setState] = useState<MeasuredStemStep>({ stemStep: firstPassStep, answerStep: firstPassAnswerStep, guardedText: rawStemText, balanced: false, ready: false, scale: 1 });

  useLayoutEffect(() => {
    const fallback: MeasuredStemStep = { stemStep: firstPassStep, answerStep: firstPassAnswerStep, guardedText: rawStemText, balanced: false, ready: true, scale: 1 };
    if (!canMeasure) {
      // No DOM to measure (SSR, a DOM-free render). stage-fit.ts's own estimate is the only
      // value available, so it is applied outright rather than left permanently hidden.
      setState(fallback);
      return;
    }

    // A new question in the same mount (a format switch, a new tally reservation) starts over from
    // the character estimate, hidden, with the raw stem and every label raw and unnarrowed (the
    // labels reset themselves when `ready` drops). Returning `current` when nothing differs keeps a
    // first mount from rendering twice.
    setState((current) =>
      current.ready || current.stemStep !== firstPassStep || current.answerStep !== firstPassAnswerStep || current.guardedText !== rawStemText || current.balanced
        ? { stemStep: firstPassStep, answerStep: firstPassAnswerStep, guardedText: rawStemText, balanced: false, ready: false, scale: current.scale }
        : current,
    );

    let cancelled = false;
    let frame = 0;
    // Reviewer fix: started in `run()`, not inside `measureStem`, so the reported duration covers
    // the whole path a resize (or a new question) can take, including `decideAnswerStep`'s own
    // clone-measurement loop and the rAF wait for a stepped-down rail to settle, not only the
    // stem's own final clone-and-measure pass. A no-op unless the caller predefines
    // `window.__VOF_MEASURE_TIMES__` (the full-bank sweep opts in first).
    let measureStart = 0;
    const recordMeasureTime = () => {
      if (typeof performance === "undefined" || typeof window === "undefined") return;
      const times = (window as typeof window & { __VOF_MEASURE_TIMES__?: number[] }).__VOF_MEASURE_TIMES__;
      if (Array.isArray(times)) times.push(performance.now() - measureStart);
    };
    // A measurement that throws must never leave the stem and labels hidden for good: show what is
    // committed, unjoined, rather than nothing.
    const safely = (step: () => void) => () => {
      try {
        step();
      } catch (error) {
        console.warn("useMeasuredStemStep: measurement failed, showing the raw stem unjoined", error);
        if (!cancelled) setState((current) => ({ ...current, guardedText: rawStemText, balanced: false, ready: true }));
      }
    };

    const stageScale = (root: HTMLElement): number => {
      const scaleHost = root.closest<HTMLElement>(".scaled-stage-content");
      return scaleHost ? parseFloat(getComputedStyle(scaleHost).getPropertyValue("--stage-scale")) || 1 : 1;
    };

    // Step 3: the rail's own step. Every label is measured as a raw clone (joins undone, narrowing
    // removed), so the decision never depends on what a label showed for an earlier input.
    const decideAnswerStep = (root: HTMLElement): number | null => {
      const ladder = answerLadder(kind, format);
      if (!ladder || firstPassAnswerStep == null || !ladder.includes(firstPassAnswerStep)) return firstPassAnswerStep;
      const labels = [...root.querySelectorAll<HTMLElement>(LABEL_SELECTOR)];
      if (!labels.length) return firstPassAnswerStep;
      const floorCanvas = (parseFloat(getComputedStyle(labels[0]!).getPropertyValue("--stage-floor-answer")) || 0) / stageScale(root);
      const defectsAt = (size: number): number => labels.filter((label) => {
        const clone = cloneForMeasure(label, { fontSizePx: Math.max(size, floorCanvas), raw: true });
        try {
          return hasUnacceptableShape(clone, true);
        } finally {
          clone.remove();
        }
      }).length;
      return stepDownPastUnacceptableShape(ladder, firstPassAnswerStep, defectsAt);
    };

    // True once React has committed `answerStep` and every live label paints at its size.
    const railSettled = (root: HTMLElement, answerStep: number): boolean => {
      if (root.getAttribute("data-answer-step") !== String(answerStep)) return false;
      const labels = [...root.querySelectorAll<HTMLElement>(LABEL_SELECTOR)];
      if (!labels.length) return true;
      const floorCanvas = (parseFloat(getComputedStyle(labels[0]!).getPropertyValue("--stage-floor-answer")) || 0) / stageScale(root);
      const expected = Math.max(answerStep, floorCanvas);
      return labels.every((label) => Math.abs(parseFloat(getComputedStyle(label).fontSize) - expected) < 0.05);
    };

    const run = () => {
      if (cancelled) return;
      measureStart = typeof performance !== "undefined" ? performance.now() : 0;
      const root = rootRef.current;
      if (!root) {
        setState(fallback);
        return;
      }
      const answerStep = decideAnswerStep(root);
      // Compared with what is committed, not with the estimate: the stem must be measured against
      // the rail that is really on the page.
      if (answerStep == null || root.getAttribute("data-answer-step") === String(answerStep)) {
        measureStem(root, answerStep);
        return;
      }
      setState((current) => ({ ...current, answerStep }));
      let frames = 0;
      const waitForRail = safely(() => {
        if (cancelled) return;
        frames += 1;
        // Bounded: ten frames is far past React's commit and any transition this page runs.
        if (railSettled(root, answerStep) || frames >= 10) measureStem(root, answerStep);
        else frame = requestAnimationFrame(waitForRail);
      });
      frame = requestAnimationFrame(waitForRail);
    };

    const measureStem = (root: HTMLElement, answerStep: number | null) => {
      if (cancelled) return;
      const stemEl = root.querySelector<HTMLElement>(
        '.question-stage-copy h1, .question-stage-copy [data-comp-id="statement"]'
      );
      const stemBlock = root.querySelector<HTMLElement>(".question-stage-copy");
      if (!stemEl || !stemBlock) {
        // The stem is not in the DOM yet (an unexpected mount order). Fall back rather than
        // leave the caller waiting on a measurement that can never arrive.
        setState({ ...fallback, answerStep, scale: stageScale(root) });
        return;
      }
      const rail = root.querySelector<HTMLElement>('[data-role="answer-rail"]');

      const scale = stageScale(root);
      const budgetScreen = CONTENT_ZONE_H[format] * scale;
      // The stem's rendered floor, in canvas px: the stem's own CSS paints
      // `max(step size, --stage-floor-stem / --stage-scale)`, so a clone sized to the bare step
      // would measure a size the stage never shows wherever the floor is the larger of the two.
      const floorCanvas = (parseFloat(getComputedStyle(stemEl).getPropertyValue("--stage-floor-stem")) || 0) / scale;
      const renderedSize = (step: StemStep): number => Math.max(stemSizeFor(kind, format, step), floorCanvas);

      // Pass 4c-1b (warning item, portrait fit): portrait reserves the stem zone's own designed
      // minimum line count (question-stage.css `.question-stage-copy { min-height: ... }`, spec
      // 2.3), so a short stem's real box never shrinks below it even though a bare clone of the
      // h1 alone measures its true, shorter text height. `usedNow` below reads the real, already
      // painted `.question-stage-copy` box, which the browser has already floored correctly, but
      // a CANDIDATE step's clone has no such wrapper to floor it, so the delta between them would
      // otherwise under- or over-count. minLines is 1 outside portrait, where no such CSS rule
      // exists, so this is a no-op there (a natural multi-line stem is always taller than one
      // line's own floor).
      const minLines = parseFloat(getComputedStyle(stemBlock).getPropertyValue("--stage-stem-min-lines")) || 1;
      const stemZoneFloorScreen = (step: StemStep): number => minLines * 1.2 * renderedSize(step) * scale;

      // Reviewer fix: floored at the step the live stem is ACTUALLY committed to
      // (`data-stem-step`, the same attribute every kind component writes from its own
      // `measuredStem.stemStep`), not `firstPassStep`. On a resize re-run the live DOM already sits
      // at whatever step the PREVIOUS measurement settled on, which can differ from the
      // character-estimate `firstPassStep` this closure still carries (neither `contentKey` nor
      // `firstPassStep` change on a plain resize, so this effect's own inputs are stale by design);
      // flooring against the wrong step's own reserved min-height would misjudge the very delta
      // `usedIfStemIs` below depends on.
      const committedStepAttr = root.getAttribute("data-stem-step");
      const committedStep: StemStep = committedStepAttr && (STEM_STEP_ORDER as readonly string[]).includes(committedStepAttr)
        ? (committedStepAttr as StemStep)
        : firstPassStep;
      const stemRectNow = stemEl.getBoundingClientRect();
      const stemHeightNow = Math.max(stemRectNow.height, stemZoneFloorScreen(committedStep));

      const usedNowScreen = (): number => {
        const stemRect = stemBlock.getBoundingClientRect();
        const railRect = rail ? rail.getBoundingClientRect() : null;
        const top = railRect ? Math.min(stemRect.top, railRect.top) : stemRect.top;
        const bottom = railRect ? railRect.bottom : stemRect.bottom;
        return bottom - top;
      };
      const usedNow = usedNowScreen();

      // Same clone-and-measure technique stage-layout-checks.ts's own grow-to-fit-boundary check
      // already uses to verify this after the fact (stage-layout-checks.ts, "room-for-next-
      // step"): cloning the live stem inherits its true font stack, weight and letter-spacing
      // without this file having to know or guess any of them. The caller removes the clone.
      const stemCloneAt = (step: StemStep): HTMLElement => {
        const clone = stemEl.cloneNode(true) as HTMLElement;
        // Raw text and wrap: a stem that settled a join or a balance for an earlier input must not
        // measure with it.
        unjoinTree(clone);
        clone.removeAttribute("data-balanced");
        clone.style.setProperty("position", "absolute", "important");
        clone.style.setProperty("visibility", "hidden", "important");
        clone.style.setProperty("pointer-events", "none", "important");
        clone.style.setProperty("margin", "0", "important");
        clone.style.setProperty("top", "0px", "important");
        // Every CSS length here is a LAYOUT value: the ancestor's `transform: scale(scale)` (spec
        // section 1, ScaledStage.tsx) scales the painted result, never the layout math itself, so
        // width and font-size must both be set in the same canvas-domain units production's own
        // CSS uses, not the screen-space, already-scaled numbers getBoundingClientRect reports.
        // Setting a screen-space number here directly would silently shrink the clone by another
        // factor of scale on top of the ancestor's own transform (found live in pass 4c-1: a
        // clone read ~0.77x its true height at scale 0.77, the exact ratio a screen-space
        // font-size produces).
        clone.style.setProperty("width", `${stemRectNow.width / scale}px`, "important");
        // The live stem carries a font-size CSS transition for its own unrelated purpose. A clone
        // inherits that inline style, and reading geometry synchronously right after setting
        // font-size on a transitioning property can catch the browser mid-animation. The clone is
        // never seen, so there is nothing to animate: force it off for an instant, accurate read.
        clone.style.setProperty("transition", "none", "important");
        clone.style.setProperty("font-size", `${renderedSize(step)}px`, "important");
        stemEl.parentElement!.appendChild(clone);
        return clone;
      };
      const measuredStemHeightAt = (step: StemStep): number => {
        const clone = stemCloneAt(step);
        try {
          return Math.max(clone.getBoundingClientRect().height, stemZoneFloorScreen(step));
        } finally {
          clone.remove();
        }
      };

      // Step 4: the fit.
      const fittedStep = resolveMeasuredStemStep({
        kind,
        firstPassStep,
        budget: budgetScreen,
        usedIfStemIs: (candidate) => usedNow + (measuredStemHeightAt(candidate) - stemHeightNow),
      });

      // Step 5: the stem's own layout fallback, measured on a clone at each candidate step.
      const step = stepDownPastUnacceptableShape(STEM_STEP_ORDER, fittedStep, (candidate) => {
        const clone = stemCloneAt(candidate);
        try {
          return hasUnacceptableShape(clone) ? 1 : 0;
        } finally {
          clone.remove();
        }
      });

      // Step 6: the stem's shape, decided at the step it will really render at: the widow join,
      // else the pull-down join for a stranded short line, else the balanced measure, the same
      // resolver (no narrowing, spec 4.5) step 5's own acceptability test ran, so the two agree.
      const shapeMeasureEl = stemCloneAt(step);
      let guardedText: string;
      let balanced: boolean;
      try {
        const resolved = resolveBlockShape(shapeMeasureEl, false);
        guardedText = resolved.text;
        balanced = resolved.balance;
      } finally {
        shapeMeasureEl.remove();
      }

      setState({ stemStep: step, answerStep, guardedText, balanced, ready: true, scale });
      recordMeasureTime();
    };

    // Pass 4c-1b (warning item, font gate): request the stem's own weight and the first label's
    // own weight explicitly, raced against a timeout, rather than trusting `document.fonts.ready`
    // alone (it settles before an unrequested weight loads). rootRef.current already holds the
    // real, already-committed DOM at this point (a layout effect runs after commit), so the real
    // stem and label elements are there to read their computed `font` from.
    const gateRoot = rootRef.current;
    const gateStemEl = gateRoot?.querySelector<HTMLElement>(
      '.question-stage-copy h1, .question-stage-copy [data-comp-id="statement"]'
    ) ?? null;
    const gateLabelEl = gateRoot?.querySelector<HTMLElement>(LABEL_SELECTOR) ?? null;
    // Reviewer fix: the `font` shorthand, not the individual longhand properties (see
    // computedFontSpec's own doc comment): an estimate range label's `font-variant-numeric:
    // tabular-nums` can make `getComputedStyle(el).font` serialize empty, silently turning its
    // load request into a no-op.
    const fontSpecs = [gateStemEl, gateLabelEl]
      .filter((el): el is HTMLElement => el != null)
      .map((el) => computedFontSpec(el));
    settleFonts(fontSpecs).then(safely(run), safely(run));

    // Pass 4c-1b (warning item, stale decisions after a mid-question resize): the step and widow
    // join above are both measured in screen px against the stage's own scale (ScaledStage.tsx's
    // `--stage-scale`, recomputed on a window resize or a ResizeObserver on its own container).
    // Neither `contentKey` nor any other dependency below changes on a plain resize, so without
    // this the effect would never re-run and the decision would stay wrong for the new size (the
    // rendered floors are defined in screen px too, so the canvas-domain font-size a floor forces
    // genuinely differs at a different scale). Re-runs `run()` directly, the same measurement the
    // initial mount performs, with no reset-to-hidden step first: the current, already-decided
    // text stays visible throughout, replaced only once, atomically, in `measureStem`'s own
    // `setState` at the end.
    let resizeFrame = 0;
    let lastScale: number | null = null;
    let resizeObserver: ResizeObserver | undefined;
    const scaleHost = rootRef.current?.closest<HTMLElement>(".scaled-stage-content") ?? null;
    // Reviewer fix: `.scaled-stage-content` itself is sized to the FIXED canvas px for its format
    // (ScaledStage.tsx's own `dimensions.width`/`dimensions.height`, from FORMAT_DIMENSIONS) and
    // is scaled visually with `transform: scale(scale)`, which ResizeObserver's own spec never
    // reports (it observes layout-box size, unaffected by a transform). So `.scaled-stage-content`
    // never actually changes size and this observer, watching it directly, only ever fired once,
    // on its own initial observation, and never again. Its PARENT (the wrapper div ScaledStage.tsx
    // sizes to `dimensions.width * scale` / `dimensions.height * scale`) is the element whose real
    // layout box changes on every resize; `--stage-scale` itself is still read off `scaleHost`
    // (the child it is set on), independent of which element is being observed for the resize
    // event.
    const scaleObserveHost = scaleHost?.parentElement ?? null;
    if (canMeasure && scaleHost && scaleObserveHost && typeof ResizeObserver !== "undefined") {
      const checkScale = () => {
        if (cancelled) return;
        const current = parseFloat(getComputedStyle(scaleHost).getPropertyValue("--stage-scale")) || 1;
        if (lastScale !== null && Math.abs(current - lastScale) > 0.001) safely(run)();
        lastScale = current;
      };
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(checkScale);
      });
      resizeObserver.observe(scaleObserveHost);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, kind, format, firstPassStep, rawStemText, firstPassAnswerStep]);

  return state;
}
