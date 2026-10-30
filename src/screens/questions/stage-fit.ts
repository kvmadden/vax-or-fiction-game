// STAGE-SPEC step 7 (spec section 4.2, section 10 step 7). A pure, DOM-free function that picks
// the stem step, the answer size and the rail density from question text length alone, so the
// specimen, the sweep and a live room render the identical layout and nothing re-flows after
// mount (the spec's own determinism requirement).
//
// The per-role size tables below are transcribed from spec sections 4.3, 4.4 and 5.1 to 5.5, the
// same tables src/review/stage-specimen-fit.ts already carries for the DEV-only specimen. That
// file is a working reference, not code to import: production code never imports from src/review
// (the brief is explicit), so the tables are ported here rather than shared. What this file adds
// on top of that reference is the piece its own header comment says it deliberately does not
// carry: the height-estimate grow/shrink loop, spec 4.2 steps 2 to 4.

import type { FormatId, Question, QuestionKind } from "../../data/types";

export type StemStep = "L" | "M" | "S" | "XS";
export type StageDensity = "regular" | "compact";

const STEP_ORDER: StemStep[] = ["L", "M", "S", "XS"];

// Spec section 4.4: the largest step (the biggest font) a kind may ever reach. Exported for
// stage-layout-checks.ts's grow-to-fit-boundary check (spec section 7 / STAGE-SPEC pass 3 step 1
// item 7), so it reads the one real cap table instead of a second copy that could drift.
export const STEM_CAPS: Record<QuestionKind, StemStep> = {
  binary: "L",
  estimate: "M",
  "myth-among-three": "M",
  order: "S",
  "which-patient": "S",
};

// Spec section 4.3: stem sizes in canvas px, by format and step. Exported for the same reason
// STEM_CAPS is above.
export const STEM_SIZE: Record<FormatId, Record<StemStep, number>> = {
  widescreen: { L: 72, M: 56, S: 44, XS: 36 },
  square: { L: 56, M: 44, S: 36, XS: 30 },
  portrait: { L: 36, M: 30, S: 30, XS: 30 },
};

/**
 * VOF-96 (F2, the owner's pick of 2026-10-02): a true or false question on the square canvas takes a 72 stem at its largest
 * step, so its stem and its two cards fill the square. A statement too long for 72 steps down to 56, today's square size,
 * so no card in the bank ends up smaller than before, and below that the square ladder is unchanged.
 */
const SQUARE_BINARY_STEM: Record<StemStep, number> = { L: 72, M: 56, S: 36, XS: 30 };

/**
 * The stem's canvas px for a kind, a format and a step: STEM_SIZE, with the VOF-96 square true or false ladder on top. Every
 * other kind and format reads STEM_SIZE as it is. Exported, like STEM_SIZE, so the measured step and the layout checks read
 * the one table the fit itself uses.
 */
export function stemSizeFor(kind: QuestionKind, format: FormatId, step: StemStep): number {
  if (kind === "binary" && format === "square") return SQUARE_BINARY_STEM[step];
  return STEM_SIZE[format][step];
}

// VOF-96 (F2): a square true or false card takes 48 px of block padding instead of 16, so the pair of cards is 64 px
// taller than the shared binary card (spec 5.1's 193). question-stage.css paints the same 48.
const BINARY_RAIL_H: Record<FormatId, number> = { widescreen: 193, square: 193 + 2 * (48 - 16), portrait: 75 };

// Spec section 4.4: stem length thresholds in characters, by format, giving the first-pass step.
function stemStepForLength(format: FormatId, chars: number): StemStep {
  if (format === "portrait") return chars <= 40 ? "L" : "M";
  const thresholds = format === "square" ? { L: 60, M: 130, S: 220 } : { L: 60, M: 120, S: 200 };
  if (chars <= thresholds.L) return "L";
  if (chars <= thresholds.M) return "M";
  if (chars <= thresholds.S) return "S";
  return "XS";
}

// A cap is a ceiling, never a floor: text shorter than the cap's own threshold still steps down
// to the cap; text already smaller than the cap on its own length is left alone.
function capStep(step: StemStep, cap: StemStep): StemStep {
  return STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(cap) ? step : cap;
}

function stepBigger(step: StemStep, cap: StemStep): StemStep | null {
  const idx = STEP_ORDER.indexOf(step);
  const capIdx = STEP_ORDER.indexOf(cap);
  if (idx <= capIdx) return null;
  return STEP_ORDER[idx - 1] ?? null;
}

function stepSmaller(step: StemStep): StemStep | null {
  const idx = STEP_ORDER.indexOf(step);
  return STEP_ORDER[idx + 1] ?? null;
}

// Spec sections 5.2 to 5.5: answer-role size ladders, largest first. Binary has none: its TRUE /
// FALSE label is a fixed size by format (spec 5.1), never chosen from text length.
const ANSWER_STEP_SIZES: Record<Exclude<QuestionKind, "binary">, Record<FormatId, number[]>> = {
  estimate: { widescreen: [52, 44, 36, 32], square: [44, 36, 30, 26], portrait: [30, 26, 22.5] },
  order: { widescreen: [36, 32], square: [30, 26], portrait: [22.5] },
  "myth-among-three": { widescreen: [36, 32], square: [30, 26], portrait: [22.5] },
  "which-patient": { widescreen: [36, 32], square: [30, 26], portrait: [22.5] },
};

// Exported (pass 4c-1b) for use-measured-stem-step.ts's layout fallback, which walks this same
// ladder down past a step whose labels end in a widow no join can fix. One ladder, one source.
export function answerLadder(kind: QuestionKind, format: FormatId): number[] | null {
  if (kind === "binary") return null;
  return ANSWER_STEP_SIZES[kind as Exclude<QuestionKind, "binary">][format] ?? null;
}

function answerStepBigger(kind: QuestionKind, format: FormatId, size: number): number | null {
  const ladder = answerLadder(kind, format);
  if (!ladder) return null;
  const idx = ladder.indexOf(size);
  if (idx <= 0) return null;
  return ladder[idx - 1] ?? null;
}

function answerStepSmaller(kind: QuestionKind, format: FormatId, size: number): number | null {
  const ladder = answerLadder(kind, format);
  if (!ladder) return null;
  const idx = ladder.indexOf(size);
  if (idx === -1 || idx >= ladder.length - 1) return null;
  return ladder[idx + 1] ?? null;
}

// The first-pass answer size from the longest option's character length (spec 5.x's own
// label/step/statement/answer-step rows, transcribed).
function firstPassAnswerSize(kind: QuestionKind, format: FormatId, longestChars: number): number | null {
  if (kind === "binary") return null;
  if (kind === "estimate") {
    if (format === "widescreen") return longestChars <= 14 ? 52 : longestChars <= 18 ? 44 : longestChars <= 22 ? 36 : 32;
    if (format === "square") return longestChars <= 10 ? 44 : longestChars <= 13 ? 36 : longestChars <= 16 ? 30 : 26;
    return longestChars <= 19 ? 30 : longestChars <= 22 ? 26 : 22.5;
  }
  if (kind === "order") {
    if (format === "widescreen") return longestChars <= 70 ? 36 : 32;
    if (format === "square") return longestChars <= 60 ? 30 : 26;
    return 22.5;
  }
  if (kind === "myth-among-three") {
    if (format === "widescreen") return longestChars <= 128 ? 36 : 32;
    if (format === "square") return longestChars <= 100 ? 30 : 26;
    return 22.5;
  }
  // which-patient
  if (format === "widescreen") return longestChars <= 46 ? 36 : 32;
  if (format === "square") return longestChars <= 52 ? 30 : 26;
  return 22.5;
}

// Spec section 4.2 step 2: "k = 0.52 (Plex Sans 600 average advance, an estimate). The builder
// calibrates k on the specimen against the real bank and pins the measured value." Calibrated
// against the spec's own worked boundary rows rather than replaced with an unrelated number: a
// 128-char myth statement is designed to sit at exactly 2 lines, 36px, inside the 1204px text box
// spec section 3.8 works out for that card (5.3's own "36 up to 128 chars (2 lines at 1204)" row).
// Solving chars * k * size / width == 2 at that boundary gives k = 2 * 1204 / (128 * 36) ~= 0.523.
// The order and which-patient worked rows (70 chars at 36px staying on 1 line inside 1360px; 46
// chars at 36px reaching 2 lines inside 438px) land within a few hundredths of the same value, so
// the spec's own starting estimate (0.52) is kept as the pinned, calibrated k.
export const STAGE_FIT_K = 0.52;

// Spec 4.2 step 3 (the optional, cosmetic growth half): a step that only just fits by the k
// estimate is exactly where that estimate is least trustworthy, so growth alone withholds this
// safety cushion. Exported for the unit tests (4A-8): a test proving the cushion actually blocks a
// borderline grow needs the same number the algorithm itself uses, not a second guess at it.
//
// STAGE-SPEC pass 4b recalibration (found on a real full-bank sweep): raised from 60 to 80 after a
// real which-patient card (REPL-PUB-13) grew to 36px on a 71.6px-thin real margin and overflowed
// its own safe end by 13.6 canvas px, both a real last-line-widow and a real card-text-safe defect,
// neither of them a CSS bug. Tried lowering the margin first (a coordinator review's own concern,
// 4B-C2): confirmed unsafe on a scoped sample (16 new zone-contain plus 8 new stage-over-budget
// hits). 80 was tried the other direction and verified clean on the same sample, plus the four
// REPL-CAND states 4B-C2 named and a dozen more real selections, with no zone-contain or
// stage-over-budget regression anywhere sampled.
//
// STAGE-SPEC pass 4b attempt (4B-SWEEP, reverted): tried a per-kind table, binary at 40 and order
// at 15, reasoning from the check's own real-clone measurement that both had real slack the flat
// 80 was needlessly eating. Verified WRONG by the thing that actually matters, a real committed
// render: lowering binary to 40 let REPL-CAND-05 grow to "L", and the real result measured
// `stage-over-budget` at 621.1 of 604 and `zone-contain` on the answer-bar, a genuine, real
// overflow, not a check nitpick, on the exact card the check's own clone-measurement technique had
// said was safe (freeSpace 129.5, measured clone delta 75.1, 54.4px of predicted slack). The
// clone-measurement technique (4B-C2) is real and correctly diffs the stem's OWN height in
// isolation, but a committed re-render at "L" changes more than the stem alone (kicker row and
// answer-block spacing shift too), so its "safe" verdict is not proof against real overflow the
// way it reads. This is direct, reproduced evidence that GROW_SAFETY_MARGIN=80 is load-bearing for
// every kind this pass actually tried lowering, not only which-patient: back to one flat value.
export const GROW_SAFETY_MARGIN_BY_KIND: Record<QuestionKind, number> = {
  binary: 80,
  order: 80,
  estimate: 80,
  "myth-among-three": 80,
  "which-patient": 80,
};
export const GROW_SAFETY_MARGIN = GROW_SAFETY_MARGIN_BY_KIND["which-patient"];

function estimateLines(chars: number, size: number, width: number): number {
  if (chars <= 0) return 0;
  if (width <= 0 || size <= 0) return 1;
  return Math.max(1, Math.ceil((chars * STAGE_FIT_K * size) / width));
}

// Spec sections 2.1 and 2.6: column width and content-zone height, canvas px, before --stage-scale.
// Exported for the unit tests (4A-8): a test proving the shrink loop actually ran needs the real
// zone height to construct a genuinely over-budget input, not a second guess at the number.
const COLUMN_WIDTH: Record<FormatId, number> = { widescreen: 1472, square: 1072, portrait: 398 };
export const CONTENT_ZONE_H: Record<FormatId, number> = { widescreen: 604, square: 888, portrait: 748 };
const GAP_STEM_SCENARIO: Record<FormatId, number> = { widescreen: 16, square: 16, portrait: 8 };
// Spec 2.3: stem to order cue, 8 in every format.
const GAP_STEM_CUE = 8;
const GAP_TO_ANSWERS: Record<FormatId, number> = { widescreen: 24, square: 24, portrait: 16 };
const RAIL_GAP: Record<FormatId, number> = { widescreen: 16, square: 16, portrait: 8 };

/**
 * VOF-98 (the owner's pick of 2026-10-05): an estimate with five or more ranges lays them out in three rows on the wide stage,
 * and three rows of today's cards left no room for the ask, so the stem fell to its smallest step under 52 px ranges. Those
 * questions take tighter cards: compact density (8 px of padding and an 8 px gap) and a 112 px row instead of 120, which
 * keeps the stem at its 56 cap, two lines over the 52 px ranges. Exported so the CSS rule's reader and the tests share it.
 */
export const ESTIMATE_TIGHT_ROW_MIN = 112;
export function threeRowEstimate(kind: QuestionKind, format: FormatId, count: number): boolean {
  return kind === "estimate" && format === "widescreen" && count >= 5;
}

// Spec section 3.2: row-min per kind and format (large/compact chevrons and pills).
const ROW_MIN: Record<QuestionKind, Record<FormatId, number>> = {
  binary: { widescreen: 168, square: 168, portrait: 88 },
  estimate: { widescreen: 120, square: 120, portrait: 64 },
  "myth-among-three": { widescreen: 88, square: 88, portrait: 48 },
  order: { widescreen: 56, square: 56, portrait: 48 },
  "which-patient": { widescreen: 72, square: 72, portrait: 48 },
};

// Spec section 3.8: the card's own text-safe width, from the card-anatomy tokens (3.2/3.3).
function cardTextWidth(kind: QuestionKind, format: FormatId, cardWidth: number, hasBadge: boolean, tallyBeside: boolean): number {
  const point = format === "portrait" ? 24 : kind === "estimate" ? 24 : 36;
  const gutter = format === "portrait" ? 8 : 16;
  const safeInset = point + gutter;
  // STAGE-SPEC pass 4b fix (found investigating a which-patient card-text-safe overrun, REPL-
  // PUB-13): this used the spec-literal badge-x (point / 2) instead of the as-built formula
  // (question-stage.css's own --stage-card-badge-x, point / 2 + kit-space-16, kept as built per
  // this pass's own owner-call rule), so the estimate always believed the card had 16px more
  // width to work with than it really has. That gap was small enough to hide until a borderline-
  // length answer (58 chars, between the 46 and 78 char brackets) picked the wrong side of its
  // own step boundary, sizing itself 36px when the real 422px box only fits 32px cleanly.
  const badgeX = point / 2 + 16;
  const badgeW = format === "portrait" ? 24 : 32;
  const badgeGap = format === "portrait" ? 8 : 12;
  const textStart = hasBadge ? Math.max(safeInset, badgeX + badgeW + badgeGap) : safeInset;
  const tallyW = format === "portrait" ? 0 : 160;
  const tallyGap = format === "portrait" ? 4 : 16;
  const textEnd = tallyBeside ? safeInset + tallyW + tallyGap : safeInset;
  return Math.max(1, cardWidth - textStart - textEnd);
}

// Spec section 2.3: rail rows from the rendered count and the layout (list: count, 2-column grid:
// count / 2 rounded up). Portrait is always one column.
function rowsForKind(kind: QuestionKind, format: FormatId, count: number): number {
  if (format === "portrait") return Math.max(1, count);
  if (kind === "binary") return 1;
  if (kind === "which-patient" || kind === "estimate") return Math.max(1, Math.ceil(count / 2));
  return Math.max(1, count); // myth (fixed 3, one column), order (one column)
}

export interface StageFitInput {
  kind: QuestionKind;
  format: FormatId;
  stem: string;
  scenario?: string | null;
  /** The text of every answer, step, range label or statement the rail renders. */
  options: string[];
  /** Rendered row/card count, already known from question data (spec 2.3). */
  count: number;
  /** Whether the rail reserves a tally zone in this state (spec 3.5). Defaults to true (the
   * conservative budget: reserving room the layout might not end up needing is safer than
   * under-budgeting a zone that then collides with it). */
  tallyReserved?: boolean;
}

export interface StageFitResult {
  stemStep: StemStep;
  /** Answer role size in canvas px, or null for binary (fixed size by format, spec 5.1). */
  answerStep: number | null;
  density: StageDensity;
}

/** Exported for the unit tests (4A-8): lets a test compute the exact estimate a given step
 * combination would produce, to build a boundary case deliberately rather than guess at one. */
export function estimateTotalHeight(input: StageFitInput, stemStep: StemStep, answerStep: number | null, density: StageDensity): number {
  const { kind, format, stem, scenario, options, count, tallyReserved = true } = input;
  const stemSize = stemSizeFor(kind, format, stemStep);
  const width = COLUMN_WIDTH[format];
  const stemLines = Math.max(1, estimateLines(stem.length, stemSize, width));
  let height = stemLines * 1.2 * stemSize;

  if (scenario) {
    const scenarioSize = format === "portrait" ? 22.5 : format === "square" ? 28 : 32;
    const scenarioLines = Math.max(1, estimateLines(scenario.length, scenarioSize, width));
    const scenarioLabelH = 1.2 * (format === "portrait" ? 18 : format === "square" ? 24 : 26);
    height += GAP_STEM_SCENARIO[format] + scenarioLabelH + 8 + scenarioLines * 1.3 * scenarioSize;
  }

  // STAGE-SPEC pass 4b fix (found investigating a real stage-over-budget / zone-contain hit,
  // BUNDLE-vax-or-fiction-q15): order always renders its own scramble cue ("Scrambled. Put these
  // in order on your device.") between the stem and the rail, spec 5.4's own row, which this
  // estimate never budgeted at all (only the generic `scenario` field above, which order's cue is
  // not). The gap between missed real content and the estimate was 86px on this real question, all
  // of it this one row: cue line height plus the stem-to-cue gap (spec 2.3, judgment call 9's own
  // gap token) it sits under.
  if (kind === "order") {
    const cueSize = format === "portrait" ? 18 : 28;
    height += GAP_STEM_CUE + cueSize * 1.2;
    // STAGE-SPEC pass 4b fix (4B-SWEEP, found on the same BUNDLE-vax-or-fiction-q15 real state the
    // cue fix above already targeted): even with the cue's own line counted, a real DOM measurement
    // (stem top to rail top, `.order-scramble-cue` and `.order-rail` real rects divided by the
    // real `--stage-scale`) still read 169.4 real canvas px, against this estimate's 118.4, a 51px
    // gap this estimate still missed. `--stage-stem-pad`'s own block padding (spec section 1,
    // `--kit-space-24` vertical) sits around the whole stem group for every kind, never counted by
    // this function at all (every other kind absorbs it inside its own larger margins, order's
    // tighter budget is the one case thin enough to expose it), and order's cue-to-rail gap is the
    // page's `--stage-gap-to-answers` PLUS the stem block's own bottom half of that same pad, not
    // the token alone. Order-specific, not a general fix: no other kind's own real sweep showed a
    // stage-over-budget or zone-contain miss this pass, so nothing else is known broken here.
    height += 51;
  }

  height += GAP_TO_ANSWERS[format];

  if (kind === "binary") {
    height += BINARY_RAIL_H[format];
  } else if (answerStep != null) {
    const padBlock = density === "compact" ? (format === "portrait" ? 4 : 8) : (format === "portrait" ? 8 : 16);
    const rows = rowsForKind(kind, format, count);
    const cardsPerRow = format === "portrait" ? 1 : (kind === "which-patient" || kind === "estimate") ? 2 : 1;
    const perRowWidth = (COLUMN_WIDTH[format] - (cardsPerRow - 1) * RAIL_GAP[format]) / cardsPerRow;
    const hasBadge = kind === "which-patient" || kind === "myth-among-three";
    const tallyBeside = tallyReserved && format === "widescreen" && kind !== "order";
    const textWidth = cardTextWidth(kind, format, perRowWidth, hasBadge, tallyBeside);
    const longest = options.reduce((max, o) => Math.max(max, o.length), 0);
    const lines = Math.max(1, estimateLines(longest, answerStep, textWidth));
    // Spec 3.5: a below-row tally is its own reserved line, not part of the label's own line box.
    // Left out of this estimate entirely, the algorithm could grow or under-shrink a card whose
    // real rendered height always carries this row whenever a tally is reserved and not placed
    // beside the label (order never reserves one at all, spec 5.4).
    let tallyRowH = 0;
    if (tallyReserved && !tallyBeside && kind !== "order") {
      // STAGE-SPEC pass 4b fix (4B-C5, coordinator review): this used to add the percent size plus
      // a 12px gap, a guess that never matched what production actually reserves
      // (`question-stage.css`'s own below-tally `min-height: calc(--stage-stat-pct + kit-space-4 +
      // --stage-stat-votes)`): percent, a 4px gap, then the votes line, not percent-plus-gap alone.
      // Real numbers: 70 on wide/square (40 + 4 + 26), 38 on portrait (20 + 4 + 14).
      const pctSize = format === "portrait" ? 20 : 40;
      const votesSize = format === "portrait" ? 14 : 26;
      tallyRowH = pctSize + 4 + votesSize;
    }
    // Spec 5.2: estimate's "typical room answer" note sits on its own reserved line below the
    // label whenever the rail reserves tally room (the same play-mode gate, spec 3.5).
    let noteRowH = 0;
    if (kind === "estimate" && tallyReserved) {
      const noteSize = format === "portrait" ? 14 : 26;
      // STAGE-SPEC pass 4b fix (4B-C5): the note's own row needs the same 4px gap spec 5.2's card
      // anatomy already gives it in production (`.answer-bar__main`'s own column gap), which this
      // estimate had never counted, undercounting every estimate card that reserves a note row.
      noteRowH = 4 + noteSize * 1.2;
    }
    const rowMin = threeRowEstimate(kind, format, count) && density === "compact" ? ESTIMATE_TIGHT_ROW_MIN : ROW_MIN[kind][format];
    const cardH = Math.max(rowMin, lines * 1.25 * answerStep + 2 * padBlock + tallyRowH + noteRowH, 2 * answerStep);
    const gap = density === "compact" ? RAIL_GAP[format] / 2 : RAIL_GAP[format];
    height += rows * cardH + Math.max(0, rows - 1) * gap;
  }

  return height;
}

/**
 * Spec section 4.2, the full algorithm.
 *
 * 1. First-pass step from the character thresholds (4.3/4.4/5.x).
 * 2. Estimate the content height (above).
 * 3. While there is room, step up (stem, then answers, repeating) until the next step up would
 *    not fit or the role reaches its cap. the 2026-09-26 design call: text grows to the largest
 *    size that fits, so a short question is never left small in empty room.
 * 4. While it overflows, step down in order: stem, answer, density, stem, answer.
 * 5. If everything is at its floor and it still does not fit, keep the floors: the sweep's
 *    `stage-over-budget` check flags it as an editorial issue, and the zone is left to grow
 *    (the caller never clips or shrinks below a floor).
 *
 * Deterministic from text length alone, never from a measured overflow, so the specimen, the
 * sweep and a live room all compute the identical layout and nothing re-flows after mount.
 */
export function stageFit(input: StageFitInput): StageFitResult {
  const { kind, format, stem, options } = input;
  const cap = STEM_CAPS[kind];
  let stemStep = capStep(stemStepForLength(format, stem.length), cap);
  const longestOption = options.reduce((max, o) => Math.max(max, o.length), 0);
  let answerStep = kind === "binary" ? null : firstPassAnswerSize(kind, format, longestOption);
  // VOF-98 (the owner's pick of 2026-10-05): three rows of ranges on the wide stage always take the tighter cards, so the
  // ask keeps its 56 over the 52 px ranges instead of falling under them.
  let density: StageDensity = threeRowEstimate(kind, format, input.count) ? "compact" : "regular";

  const fits = () => estimateTotalHeight(input, stemStep, answerStep, density) <= CONTENT_ZONE_H[format];
  // STAGE-SPEC step 9 fix (stage-over-budget, long binary statements): k is an estimate (spec 4.2
  // step 2's own words), and growing all the way to a kind's cap on a genuinely long, multi-line
  // statement is exactly the case where that estimate is least accurate -- a measured 131-char
  // binary statement grown to its full "L" step estimated 562.6 of 604 (42px of headroom) but
  // rendered at 621.1, a ~58px miss the sweep caught as real overflow. Growing is the optional,
  // cosmetic half of the algorithm (the design call is "grows to the largest size that FITS"; a step
  // that turns out not to fit was never a legitimate candidate), so only the grow decision itself
  // subtracts a safety margin, leaving the shrink loop and the final fits() check below exact
  // against the real zone.
  const fitsForGrowth = () => {
    const est = estimateTotalHeight(input, stemStep, answerStep, density);
    const ok = est <= CONTENT_ZONE_H[format] - GROW_SAFETY_MARGIN_BY_KIND[kind];
    return ok;
  };

  // Step 3: grow while room is left. Pulled into its own function (STAGE-SPEC pass 4b fix) because
  // it runs twice: once here, and again after the shrink loop below. The two real residual
  // grow-to-fit-boundary hits found on BUNDLE-vax-or-fiction-q15 and the classic PUB-12/BUNDLE-
  // vax-or-fiction-q14 estimate card share one real cause the single-pass algorithm never covered:
  // shrinking a role that grew past its cap can free room a still-capped role could now grow into,
  // and step 3 only ever ran once, before step 4 had shrunk anything. A second grow pass after the
  // shrink loop can only ever run when the state it starts from already satisfies `fitsForGrowth()`
  // (that is what caused the shrink loop to stop), so it can only grow roles that are still below
  // their own cap, never re-open ones the shrink loop deliberately reduced, and the margin inside
  // `fitsForGrowth()` keeps it from ever growing back into a state the exact `fits()` boundary
  // would then reject (margin > 0 always leaves slack under the raw zone height).
  const growWhileRoom = () => {
    let grew = true;
    while (grew) {
      grew = false;
      const biggerStem = stepBigger(stemStep, cap);
      if (biggerStem) {
        const before = stemStep;
        stemStep = biggerStem;
        if (fitsForGrowth()) grew = true;
        else stemStep = before;
      }
      if (kind !== "binary" && answerStep != null) {
        const biggerAnswer = answerStepBigger(kind, format, answerStep);
        if (biggerAnswer != null) {
          const before = answerStep;
          answerStep = biggerAnswer;
          if (fitsForGrowth()) grew = true;
          else answerStep = before;
        }
      }
    }
  };
  growWhileRoom();

  // Step 4: step down while it overflows, in the spec's own interleaved order (stem, answer,
  // density, stem, answer), taking one step per role per pass rather than exhausting one role
  // before the next is ever tried. A bounded guard, never an infinite loop: a full cycle through
  // every role with nothing left to shrink means step 5 (keep the floors) has been reached.
  const SHRINK_ORDER: Array<"stem" | "answer" | "density"> = ["stem", "answer", "density", "stem", "answer"];
  let cycleIdx = 0;
  let stalledCycles = 0;
  while (!fits() && stalledCycles < SHRINK_ORDER.length) {
    const action = SHRINK_ORDER[cycleIdx % SHRINK_ORDER.length]!;
    cycleIdx += 1;
    let changed = false;
    if (action === "stem") {
      const smallerStem = stepSmaller(stemStep);
      if (smallerStem) { stemStep = smallerStem; changed = true; }
    } else if (action === "answer" && kind !== "binary" && answerStep != null) {
      const smallerAnswer = answerStepSmaller(kind, format, answerStep);
      if (smallerAnswer != null) { answerStep = smallerAnswer; changed = true; }
    } else if (action === "density" && density === "regular") {
      density = "compact";
      changed = true;
    }
    stalledCycles = changed ? 0 : stalledCycles + 1;
  }

  // Second grow pass (see growWhileRoom's own comment above): the shrink loop above may have freed
  // room a role below its cap can now safely grow back into.
  growWhileRoom();

  return { stemStep, answerStep, density };
}

/** The stem's canvas px size for a resolved step (spec 4.3), for a caller that only holds the
 * step and needs to render it. Pass the kind wherever it is known: a square true or false stem
 * reads its own ladder (VOF-96, stemSizeFor above). */
export function stemSizeForStep(format: FormatId, step: StemStep, kind?: QuestionKind): number {
  return kind ? stemSizeFor(kind, format, step) : STEM_SIZE[format][step];
}

/** Convenience for a kind component: run stageFit from a Question and also resolve the stem's
 * canvas px size, so the caller does not have to re-read STEM_SIZE itself. */
export function stageFitFromQuestion(
  question: Pick<Question, "statement" | "scenario">,
  kind: QuestionKind,
  format: FormatId,
  options: string[],
  count: number,
  tallyReserved = true,
): StageFitResult & { stemSize: number } {
  const result = stageFit({
    kind,
    format,
    stem: question.statement ?? "",
    scenario: question.scenario ?? null,
    options,
    count,
    tallyReserved,
  });
  return { ...result, stemSize: stemSizeFor(kind, format, result.stemStep) };
}
