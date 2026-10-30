import type { QuestionKind } from "../../data/types";
import { STEM_CAPS, type StemStep } from "./stage-fit";

export const STEM_STEP_ORDER: StemStep[] = ["L", "M", "S", "XS"];

export interface ResolveMeasuredStemStepParams {
  kind: QuestionKind;
  /** stage-fit.ts's own character-estimate step, the starting point every walk begins from. */
  firstPassStep: StemStep;
  /** The content zone's real budget, in the same units usedIfStemIs reports. */
  budget: number;
  /**
   * A real measurement of "if the stem were this step, how tall would the whole content group
   * really be", in the caller's own units. Never an estimate: production builds this from a
   * hidden clone of the live, already-rendered stem (see use-measured-stem-step.ts); a test can
   * hand it a fixed table instead, so the decision itself gets a browser-free unit test.
   */
  usedIfStemIs: (step: StemStep) => number;
}

/**
 * STAGE-SPEC pass 4c-1 (spec 4.2 steps 3 to 5). The grow/shrink decision, pulled out of the DOM
 * glue so it is a pure function of whatever usedIfStemIs reports: production wires that to a real
 * measurement (use-measured-stem-step.ts), a test wires it to a known fixture. stage-fit.ts stays
 * the one source of the step ladder and the per-kind caps (STEM_CAPS); this function only walks
 * that ladder against a real number instead of stage-fit.ts's own character-count estimate.
 *
 * 1. Grow while the next step up still fits, stopping at the kind's own cap (the 2026-09-26
 *    ruling: text grows to the largest size that fits).
 * 2. Shrink while the current step still overflows, down to XS (spec step 5: keep the floor,
 *    never clip). XS is the smallest step this ladder has; there is nothing to fall back to below
 *    it, exactly as stage-fit.ts's own shrink loop stops there too.
 */
export function resolveMeasuredStemStep({ kind, firstPassStep, budget, usedIfStemIs }: ResolveMeasuredStemStepParams): StemStep {
  const cap = STEM_CAPS[kind];
  let step = firstPassStep;

  let grew = true;
  while (grew && STEM_STEP_ORDER.indexOf(step) > STEM_STEP_ORDER.indexOf(cap)) {
    grew = false;
    const bigger = STEM_STEP_ORDER[STEM_STEP_ORDER.indexOf(step) - 1]!;
    if (usedIfStemIs(bigger) <= budget) {
      step = bigger;
      grew = true;
    }
  }

  while (usedIfStemIs(step) > budget && STEM_STEP_ORDER.indexOf(step) < STEM_STEP_ORDER.length - 1) {
    step = STEM_STEP_ORDER[STEM_STEP_ORDER.indexOf(step) + 1]!;
  }

  return step;
}

/**
 * STAGE-SPEC pass 4c-1b (brief item 4, spec 4.5): the layout fallback for a line shape nothing but
 * a smaller step can repair (a widow no join fixes, or a stranded middle line). A step whose text
 * renders that shape does not fit, the same as a step that runs out of room. `defectsAt(step)`
 * counts the blocks at that step still showing such a shape (the stem is one block, an answer rail
 * is every label). From `start`, walk down `ladder` and return the first step with none. When no
 * smaller step is clean, return the largest step with strictly fewer defects than `start` (a rail
 * where one label of two reads clean at the next step down takes that step), else `start`: a
 * smaller size that fixes nothing buys nothing. Shared by the stem (the STEM_STEP_ORDER ladder) and
 * the answer rail (stage-fit.ts's answerLadder), never re-deciding height: every step below one
 * that fit also fits.
 */
export function stepDownPastUnacceptableShape<T>(ladder: readonly T[], start: T, defectsAt: (step: T) => number): T {
  let best = start;
  let bestDefects = defectsAt(start);
  if (bestDefects === 0) return start;
  const from = ladder.indexOf(start);
  if (from === -1) return start;
  for (let i = from + 1; i < ladder.length; i++) {
    const defects = defectsAt(ladder[i]!);
    if (defects < bestDefects) {
      best = ladder[i]!;
      bestDefects = defects;
    }
    if (defects === 0) break;
  }
  return best;
}

/**
 * STAGE-SPEC pass 4c-1b: the promise `stepDownPastUnacceptableShape` keeps, checked from the other
 * side (stage-layout-checks.ts's answer-step-down). A walk that ends at `current` below `start`
 * only ever took a step with strictly fewer defects than every step above it, so each step from
 * `start` down to the one just above `current` has more defects than `current` does. True when
 * that holds, or when `current` is not below `start` at all.
 */
export function stepDownIsJustified<T>(ladder: readonly T[], start: T, current: T, defectsAt: (step: T) => number): boolean {
  const from = ladder.indexOf(start);
  const to = ladder.indexOf(current);
  if (from === -1 || to === -1 || to <= from) return true;
  const here = defectsAt(current);
  for (let i = from; i < to; i++) {
    if (defectsAt(ladder[i]!) <= here) return false;
  }
  return true;
}
