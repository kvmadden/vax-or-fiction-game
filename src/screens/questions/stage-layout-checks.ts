// STAGE-SPEC step 2 and 3 (spec sections 7 and 8). One implementation of every geometry check, so
// the specimen overlay and the full-bank sweep read the exact same rule and can never disagree
// (brief Q3-adjacent ruling, spec section 7 note "shared by the overlay and the sweep").
//
// This module reads today's DOM as it already renders (no new data-* attributes on question
// components: adding those would be page-structure work, spec section 10 step 5, which is out of
// scope for steps 1 to 3 and the brief says do not start step 5 or later). Every target is found
// through the selectors and CSS custom properties the spec already names in sections 2 to 7, plus
// simple geometric clustering (column grouping, centered-orphan detection) where the spec would
// otherwise have relied on a not-yet-authored `data-orphan` or `data-align` attribute. Anywhere this
// module approximates rather than reads a literal attribute, the comment says so.
//
// Runs only in a browser context (getBoundingClientRect, getComputedStyle, document). Imported
// directly by StageSpecimen.tsx and dynamically imported inside full-bank-visual.mjs's
// page.evaluate, so both call the same compiled module.
//
// grow-to-fit-boundary (below) reads the type ladder's own stem cap and size tables from
// stage-fit.ts rather than a second copy of either: the same "one token drives both" discipline
// the rest of this module already follows for CSS custom properties, extended to the algorithm's
// own constants.

import type { QuestionKind } from "../../data/types";
import { STEM_CAPS, STEM_SIZE, answerLadder, stemSizeFor, type StemStep } from "./stage-fit";
import { stepDownIsJustified } from "./measured-stem-step";
import { SHORT_MIDDLE_LINE_RATIO, cloneForMeasure, hasUnacceptableShape, measureLines, shortMiddleLineIndex, unjoinTree } from "./widow-guard";
//
// STAGE-SPEC pass 3 step 1: seven production checks added here (vertical-balance,
// badge-placement, one-column-card-width, row-stretch, cue-alignment, tally-row-start,
// grow-to-fit-boundary). An independent designer found six High problems in the real renders that
// the sweep, at pass 2's own zero-issue report, never saw: every one of those defects passed a
// box-only geometry check while failing an ink-based or token-consistency read (a centered block's
// own box still starts on the edge even though its ink does not, and a card's own box can be the row's
// tallest slot while its painted content stays short). The additions below read ink lines (the
// same technique card-text-safe already uses) and the real CSS custom properties (the same
// technique clip-token-parity already uses), never a second guess at a number the spec already
// names once.

export type StageFormat = "widescreen" | "square" | "portrait";
export type StageBeat = "entering" | "locked" | "revealed" | "explaining";

// Fixed pass 4a (4A-7): the one real list of check codes, read by both the coverage-table
// initializer inside `computeStageChecks` and the sweep's own control-coverage gate
// (`full-bank-visual.mjs`), so a code added to one can never silently go unchecked by the other.
export const LAYOUT_CHECK_CODES = [
  "align-start", "align-end", "align-coverage", "card-text-safe", "card-badge-shape", "tally-zone",
  "clip-token-parity", "zone-contain", "grid-shape", "stage-over-budget", "token-unresolved",
  "vertical-balance", "vertical-balance-exempt", "badge-placement", "one-column-card-width",
  "row-stretch", "cue-alignment", "tally-row-start", "grow-to-fit-boundary", "last-line-widow",
  "which-patient-label-box", "which-patient-label-box-skipped", "which-patient-text-start-token",
  "row-content-alignment", "short-middle-line", "grow-to-fit-boundary-shape-exempt", "answer-step-down",
] as const;

// Codes that are structurally never going to have a mutation control that turns them RED: a
// coverage counter (`align-coverage`, `vertical-balance-exempt`), a raised-on-missing-data guard
// (`token-unresolved`), and an editorial flag rather than a layout defect (`stage-over-budget`,
// listed separately from layout failures in the spec itself, section 7's own table).
// `beat-stable` is a real control but is not named by its own `code` (it is a post-pass over two
// captured beats, not a single-state check `measure()` can attach a code to), so it is checked by
// name elsewhere in the sweep's own control gate instead of through this code-based list.
// STAGE-SPEC pass 4b fix (4B-C3): zone-contain never had its own control (no reason recorded), so
// this allowlist was silently hiding a real coverage gap rather than naming a genuinely
// control-proof code. A control now exists further down (`full-bank-visual.mjs`'s
// `layout-zone-contain-broken`), so zone-contain is removed from this list.
// Pass 4c-1b: `grow-to-fit-boundary-shape-exempt` is a coverage counter like vertical-balance-exempt
// (states where grow-to-fit-boundary found room for the next step but that step's stem shape does
// not fit, see the check itself), never an issue code a mutation could turn RED.
export const LAYOUT_CHECK_CODES_NO_CONTROL_EXPECTED = ["align-coverage", "vertical-balance-exempt", "token-unresolved", "stage-over-budget", "which-patient-label-box-skipped", "grow-to-fit-boundary-shape-exempt"] as const;

export interface StageCheckIssue {
  code: string;
  detail: Record<string, unknown>;
}

export interface StageCheckContext {
  root: ParentNode;
  format: StageFormat;
  beat: StageBeat;
  kind: string;
  canvasWidth: number;
  canvasHeight: number;
  tolerancePx: number;
}

export interface StageCheckOutcome {
  issues: StageCheckIssue[];
  startTargetCount: number;
  endTargetCount: number;
  coverageByCheck: Record<string, number>;
}

// Spec section 2.1: the one shared start x per format, in canvas px (before --stage-scale).
export const STAGE_EDGE_X: Record<StageFormat, number> = { widescreen: 64, square: 64, portrait: 16 };
// Spec section 2.1: top margin, header zone height, zone gap, footer zone height (voting beats).
export const STAGE_ZONES: Record<StageFormat, { top: number; headerH: number; gap: number; footerH: number; bottom: number }> = {
  widescreen: { top: 48, headerH: 80, gap: 24, footerH: 72, bottom: 48 },
  square: { top: 48, headerH: 96, gap: 24, footerH: 72, bottom: 48 },
  portrait: { top: 24, headerH: 48, gap: 16, footerH: 56, bottom: 24 },
};

interface Box { x: number; y: number; right: number; bottom: number; width: number; height: number }

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/**
 * The first line's ink-bounded box (a Range over the first non-empty text node), not the
 * element's own border box. cue-alignment needs this distinction the way card-text-safe already
 * does: a full-width, `text-align: center` block's own box still starts on the shared edge even
 * though its visible glyphs sit in the middle, which is exactly why align-start's own box-only
 * read passed the order cue an independent designer still found off the edge live.
 */
function firstInkBox(el: Element, origin: { x: number; y: number }, scale: number): Box | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects[0]) return toCanvas(rects[0]!, origin, scale);
  }
  return null;
}

/**
 * last-line-widow's own reader (pass 4a, 4A-13): the word count of each real rendered line of a
 * wrapped text block, top to bottom. Since pass 4c-1b this is widow-guard.ts's `measureLines`, the
 * same function the production widow guard measures with, so the guard, last-line-widow and
 * short-middle-line all read one line shape. The grouping is unchanged from this file's own pass
 * 4b reader (every word's every client rect, grouped by top rounded to a 2 px grid, so a
 * hyphen-split token counts on each line it really occupies), moved, not rewritten.
 */
function wordsPerRealLine(el: Element): number[] {
  return measureLines(el as HTMLElement).wordsPerLine;
}

/** Returns null for text that never wraps (one line total): a single-line answer that happens to
 * be one word is not the orphan-word defect last-line-widow exists to catch (spec 4.5). */
function lastLineWordCount(el: Element): number | null {
  const lines = wordsPerRealLine(el);
  if (lines.length < 2) return null; // never wrapped: one line total.
  return lines[lines.length - 1]!;
}

/**
 * short-middle-line (pass 4c-1, redefined pass 4c-1b, brief item 3). The defect is a line
 * stranded between two long ones, like REPL-PUB-13's "Use VZIG instead of vaccine / despite no /
 * vaccine contraindication.", and it is a WIDTH defect. Pass 4c-1 counted words (a middle line
 * holding fewer words than the last), which flagged ordinary greedy wraps (a 5-word middle line
 * over a 6-word last line reads fine) and passed the real defect whenever the counts tied (that
 * card's own [5, 2, 2]). Now: in a block of 3 or more lines, a middle line narrower than
 * SHORT_MIDDLE_LINE_RATIO of the block's widest line, by rendered ink width. The same rule and the
 * same constant the widow guard applies before it accepts a join (widow-guard.ts).
 */
function shortMiddleLine(el: Element): { lineIndex: number; ratio: number; lineWidths: number[] } | null {
  const { lineWidths } = measureLines(el as HTMLElement);
  const lineIndex = shortMiddleLineIndex(lineWidths);
  if (lineIndex === -1) return null;
  const widest = Math.max(...lineWidths);
  return { lineIndex, ratio: Number((lineWidths[lineIndex]! / widest).toFixed(3)), lineWidths: lineWidths.map((w) => Number(w.toFixed(1))) };
}

/**
 * Fixed pass 4a (4A-19): groups items into rows by nearest-neighbor y-distance to each row's own
 * first (anchor) member, so every item lands in exactly one row. The prior technique (a `Set` of
 * rounded y values, each then re-matched against every card within tolerance) could report the
 * same physical row under two adjacent rounded keys whenever a row's own cards spanned a rounding
 * boundary, double-counting it in row-stretch and row-content-alignment.
 */
function clusterByY<T extends { canvas: Box }>(items: T[], tolerance = 20): T[][] {
  const sorted = [...items].sort((a, b) => a.canvas.y - b.canvas.y);
  const rows: T[][] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.canvas.y - item.canvas.y) < tolerance);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows;
}

function findStage(root: ParentNode): { origin: { x: number; y: number }; scale: number } | null {
  const stage = root.querySelector(".scaled-stage-content") as HTMLElement | null;
  if (!stage) return null;
  const b = stage.getBoundingClientRect();
  const scale = stage.offsetWidth ? b.width / stage.offsetWidth : 1;
  return { origin: { x: b.x, y: b.y }, scale };
}

function toCanvas(b: Box, origin: { x: number; y: number }, scale: number): Box {
  return {
    x: (b.x - origin.x) / scale,
    y: (b.y - origin.y) / scale,
    right: (b.right - origin.x) / scale,
    bottom: (b.bottom - origin.y) / scale,
    width: b.width / scale,
    height: b.height / scale,
  };
}

/**
 * A custom property's own computed value is its as-specified text with var() substituted, not an
 * arithmetically reduced number: `getComputedStyle(el).getPropertyValue('--x')` for
 * `--x: calc(var(--a) + var(--b))` returns the literal string "calc(...)", not a px number, so
 * parseFloat on it silently returns NaN for every token defined by calc() (most of this repo's
 * derived tokens, section 3.2's whole table included). A real length property fully resolves
 * var()+calc() to a used pixel value, so a disposable probe child reads the token through one.
 *
 * Returns NaN, not 0, when the token does not resolve anywhere in the cascade. Custom properties
 * are themselves inherited, so `getPropertyValue` on `el` already carries an ancestor's
 * declaration if one exists, and is the empty string only when no declaration reaches `el` at
 * all. That check has to run before the layout probe: an unresolved `var()` with no fallback
 * makes a non-inherited property like `width` compute to its own initial value (`auto`, which a
 * detached-from-flow probe still resolves to some real used pixel value, often 0), so the probe
 * alone cannot tell "the token really is 0" apart from "the token was never declared". A silent 0
 * default made an unresolved token pass every downstream comparison instead of failing them,
 * because a threshold of 0 is almost never crossed. The caller is responsible for raising
 * `token-unresolved` and must not treat NaN as a usable length.
 */
function numericVar(el: Element, name: string): number {
  if (!getComputedStyle(el).getPropertyValue(name).trim()) return NaN;
  const probe = document.createElement("div");
  probe.style.setProperty("position", "absolute");
  probe.style.setProperty("visibility", "hidden");
  probe.style.setProperty("pointer-events", "none");
  probe.style.setProperty("height", "0");
  probe.style.setProperty("width", `var(${name})`);
  el.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return px;
}

function visible(e: Element): boolean {
  for (let p: Element | null = e; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
  }
  return e.getBoundingClientRect().height > 0;
}

/** Cards (answer-bar and order-bar) that are visible in the current beat, in DOM order. */
function cardElements(root: ParentNode): Element[] {
  return [...root.querySelectorAll(".answer-bar, .order-bar")].filter(visible);
}

/**
 * Column clustering (proxy for the spec's `data-orphan` / first-column / last-column markup,
 * section 7's markup table). Groups cards by canvas x within a loose tolerance, then reports the
 * minimum-x group (align-start targets), the maximum-x group when there is more than one column
 * (align-end targets), and a best-effort "orphan" guess: a lone card in the highest row whose
 * center sits near the rail's own horizontal center, matching section 2.2's one sanctioned
 * exception (the centered third which-patient / odd estimate card).
 */
function columns(cards: Element[], origin: { x: number; y: number }, scale: number) {
  const withCanvas = cards.map((el) => ({ el, canvas: toCanvas(box(el), origin, scale) }));
  const xs = [...new Set(withCanvas.map((c) => Math.round(c.canvas.x / 4) * 4))].sort((a, b) => a - b);
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 0;
  const startGroup = withCanvas.filter((c) => Math.abs(Math.round(c.canvas.x / 4) * 4 - minX) < 20);
  const endGroup = xs.length > 1 ? withCanvas.filter((c) => Math.abs(Math.round(c.canvas.x / 4) * 4 - maxX) < 20) : startGroup;
  let orphan: Element | null = null;
  if (withCanvas.length % 2 === 1 && xs.length > 1) {
    const railLeft = Math.min(...withCanvas.map((c) => c.canvas.x));
    const railRight = Math.max(...withCanvas.map((c) => c.canvas.right));
    const railCenter = (railLeft + railRight) / 2;
    const last = withCanvas[withCanvas.length - 1]!;
    const cardCenter = (last.canvas.x + last.canvas.right) / 2;
    if (Math.abs(cardCenter - railCenter) < 8) orphan = last.el;
  }
  // Column count excludes the orphan's own x: a centered odd card sits at a third x distinct from
  // both peer columns, and it is section 2.2's one sanctioned exception, not a third track.
  const nonOrphanXs = [...new Set(withCanvas.filter((c) => c.el !== orphan).map((c) => Math.round(c.canvas.x / 4) * 4))];
  return { withCanvas, startGroup: startGroup.filter((c) => c.el !== orphan), endGroup: endGroup.filter((c) => c.el !== orphan), orphan, columnCount: nonOrphanXs.length };
}

function stemThresholdTargets(root: ParentNode): Element[] {
  const targets: Element[] = [];
  const stem = root.querySelector(".question-stage-copy h1, .question-stage-copy [data-comp-id='statement']");
  if (stem) targets.push(stem);
  const scenarioLabel = root.querySelector(".question-stage-scenario > span");
  if (scenarioLabel) targets.push(scenarioLabel);
  return targets.filter(visible);
}

export interface StageCardRect { index: number; x: number; y: number; right: number; bottom: number; width: number; height: number }

/**
 * Section 7's `beat-stable` check needs the same card's rect at two different beats (posed and
 * locked), which is not a single-state geometry check the overlay can mark, so it is a post-pass
 * the sweep runs itself over its own captured rows (spec section 7: "Runs as a post-pass over the
 * rows"). This export gives that post-pass the same canvas-space rects the rest of this module
 * already computes, keyed by DOM order, so posed and locked captures line up card for card.
 */
export function captureCardRects(root: ParentNode): StageCardRect[] {
  const stage = findStage(root);
  if (!stage) return [];
  const { origin, scale } = stage;
  return cardElements(root).map((el, index) => ({ index, ...toCanvas(box(el), origin, scale) }));
}

export function computeStageChecks(ctx: StageCheckContext): StageCheckOutcome {
  const issues: StageCheckIssue[] = [];
  // Coverage counts how many times each check actually ran (evaluated a real target), never how
  // many times it failed. A check that silently sees zero targets must not be indistinguishable
  // from a check that saw its targets and found them clean, the standing false-green pattern this
  // app names by name. `add` only ever records a failure. `ran` is called at every evaluation
  // site below, pass or fail.
  const coverageByCheck: Record<string, number> = {};
  const ran = (code: string, n = 1) => { coverageByCheck[code] = (coverageByCheck[code] ?? 0) + n; };
  const bump = (code: string) => { coverageByCheck[code] = coverageByCheck[code] ?? 0; };
  LAYOUT_CHECK_CODES.forEach(bump);

  const stage = findStage(ctx.root);
  if (!stage) return { issues: [], startTargetCount: 0, endTargetCount: 0, coverageByCheck };
  const { origin, scale } = stage;
  // Every issue carries a canvas-space anchor point and a short element description, so a marker
  // can be drawn exactly at the violating element (never guessed, never drawn over its own text)
  // and a manifest legend can name what each numbered marker is without redrawing text on the
  // image itself.
  type AnchorLike = Element | { x: number; y: number };
  const anchorPoint = (a: AnchorLike): { x: number; y: number } => {
    if (a instanceof Element) { const c = toCanvas(box(a), origin, scale); return { x: Number(c.x.toFixed(1)), y: Number(c.y.toFixed(1)) }; }
    return { x: Number(a.x.toFixed(1)), y: Number(a.y.toFixed(1)) };
  };
  const describeElement = (a: AnchorLike): string => {
    if (!(a instanceof Element)) return "layout";
    return a.getAttribute("data-role") || a.getAttribute("data-choice") || a.getAttribute("data-slot")
      || (a.className && typeof a.className === "string" && a.className.split(" ")[0]) || a.tagName.toLowerCase();
  };
  const add = (code: string, anchor: AnchorLike, detail: Record<string, unknown>) => {
    issues.push({ code, detail: { ...detail, anchor: anchorPoint(anchor), element: describeElement(anchor) } });
  };
  // A wrapped read of a token custom property: records that the read happened (coverage), and
  // raises its own issue naming the token when it did not resolve, instead of returning a 0 that
  // would let every downstream comparison pass silently.
  const readToken = (el: Element, name: string, anchor: AnchorLike = el): number => {
    ran("token-unresolved");
    const value = numericVar(el, name);
    if (!Number.isFinite(value)) add("token-unresolved", anchor, { token: name });
    return value;
  };
  const edgeStart = STAGE_EDGE_X[ctx.format];
  const edgeEnd = ctx.canvasWidth - edgeStart;
  const votingBeat = ctx.beat === "entering" || ctx.beat === "locked";

  const numberBadge = ctx.root.querySelector(".question-source-number");
  const startTargets: { el: Element; label: string }[] = [];
  const endTargets: { el: Element; label: string }[] = [];
  if (numberBadge && visible(numberBadge)) startTargets.push({ el: numberBadge, label: "number-badge" });

  const cards = cardElements(ctx.root);
  const { startGroup, endGroup, orphan, columnCount } = columns(cards, origin, scale);
  // Shared by one-column-card-width, stage-over-budget and grow-to-fit-boundary: the rail element
  // and the stem/scenario group, read once so every check that needs "the real content box" reads
  // the identical elements instead of three separate queries that could disagree.
  const rail = ctx.root.querySelector(".answer-rail, .estimate-answer-rail, .order-rail");
  const stemEl = ctx.root.querySelector(".question-stage-copy");

  // one-column-card-width (spec 2.2, section 10 step 1 item 3): in a genuine one-column list
  // (columnCount from the shared clustering helper above, which already excludes the one
  // sanctioned centered-odd-card exception from its own count), every card's own width equals the
  // rail's, not only the majority of them. Reading every card, orphan included, is what actually
  // catches a centered, narrower odd card that a column layout wrongly narrowed: the estimate
  // portrait "fifth card still about 195px wide" defect an independent designer measured live.
  if (votingBeat && columnCount === 1 && cards.length > 0 && rail) {
    ran("one-column-card-width");
    const railCanvas = toCanvas(box(rail), origin, scale);
    for (const card of cards) {
      const cardCanvas = toCanvas(box(card), origin, scale);
      const diff = Math.abs(cardCanvas.width - railCanvas.width);
      if (diff > 1 + ctx.tolerancePx) {
        add("one-column-card-width", card, { cardWidth: Number(cardCanvas.width.toFixed(1)), railWidth: Number(railCanvas.width.toFixed(1)), diffPx: Number(diff.toFixed(1)) });
      }
    }
  }

  // row-stretch (spec 3.7, section 10 step 1 item 4, fixed pass 4a / 4A-2): cards clustered into
  // the same grid row hold equal heights AND each card's own height matches its slot's height. The
  // grid's own `align-items: stretch` can size a card's SLOT to the row's tallest card while the
  // card itself, a column flex child with no flex-grow of its own, never actually grows to fill it.
  // Correct grid geometry, wrong painted box, which is why a box-only check of the slot alone
  // would have missed the "which-patient square: row one cards differ in height" defect an
  // independent designer measured live on the CARD's own rendered height, not its slot.
  //
  // Rows are clustered by each card's own `.answer-slot` ancestor y, not the card's own y: a card
  // that fails to stretch paints shorter than its slot, so clustering by the card's own y can split
  // one real grid row into two apparent rows whenever a short card's top edge drifts from its
  // stretched neighbors, exactly the case this check exists to catch. The slot's own y is stable
  // (the grid, not the card, controls it), so it is the more trustworthy row key.
  if (votingBeat && columnCount >= 2 && cards.length > 1) {
    ran("row-stretch");
    const withCanvas = cards.map((el) => {
      const slot = el.closest(".answer-slot") ?? el;
      return { el, canvas: toCanvas(box(el), origin, scale), slotCanvas: toCanvas(box(slot), origin, scale) };
    });
    for (const c of withCanvas) {
      const slotDiff = Math.abs(c.canvas.height - c.slotCanvas.height);
      if (slotDiff > 1 + ctx.tolerancePx) {
        add("row-stretch", c.el, { reason: "card-shorter-than-slot", cardHeight: Number(c.canvas.height.toFixed(1)), slotHeight: Number(c.slotCanvas.height.toFixed(1)), diffPx: Number(slotDiff.toFixed(1)) });
      }
    }
    for (const rowCards of clusterByY(withCanvas.map((c) => ({ ...c, canvas: c.slotCanvas })))) {
      if (rowCards.length < 2) continue;
      const y = rowCards[0]!.canvas.y;
      const heights = rowCards.map((c) => withCanvas.find((w) => w.el === c.el)!.canvas.height);
      const diff = Math.max(...heights) - Math.min(...heights);
      if (diff > 1 + ctx.tolerancePx) {
        add("row-stretch", rowCards[0]!.el, { reason: "row-heights-differ", row: Number(y.toFixed(1)), heights: heights.map((h) => Number(h.toFixed(1))), diffPx: Number(diff.toFixed(1)) });
      }
    }
  }

  if (votingBeat) {
    for (const t of stemThresholdTargets(ctx.root)) startTargets.push({ el: t, label: t.className || t.tagName });
    const cue = ctx.root.querySelector(".order-scramble-cue, [data-role='order-scramble-cue']");
    if (cue && visible(cue)) startTargets.push({ el: cue, label: "order-cue" });
    for (const c of startGroup) startTargets.push({ el: c.el, label: "card-start-column" });
    for (const c of endGroup) endTargets.push({ el: c.el, label: "card-end-column" });
    const pill = ctx.root.querySelector(".show-join-pill");
    if (pill && visible(pill)) endTargets.push({ el: pill, label: "join-pill" });
  }
  const statusPill = ctx.root.querySelector(".show-footer .show-source-pill, .show-source-pill");
  if (statusPill && visible(statusPill)) startTargets.push({ el: statusPill, label: "source-pill" });

  // cue-alignment (spec 5.4, section 10 step 1 item 5): the order cue's own visible ink, not its
  // element box. align-start above already reads the cue's box and never found it off the edge,
  // because a full-width, `text-align: center` block's own box still starts on the shared edge
  // even while its glyphs sit centered under it, exactly why an independent designer still
  // found "Scrambled" centered under a start-aligned stem in the real render. Also covers a stem
  // label when one is present (spec 4.3's own stem-label role), the "any stem-adjacent label" the
  // brief names alongside the cue.
  if (votingBeat) {
    const cue = ctx.root.querySelector(".order-scramble-cue, [data-role='order-scramble-cue']");
    const stemLabel = ctx.root.querySelector("[data-role='stem-label']");
    for (const el of [cue, stemLabel]) {
      if (!el || !visible(el)) continue;
      ran("cue-alignment");
      const ink = firstInkBox(el, origin, scale);
      if (!ink) continue;
      const diff = Math.abs(ink.x - edgeStart);
      if (diff > ctx.tolerancePx) add("cue-alignment", el, { x: Number(ink.x.toFixed(1)), expected: edgeStart, diffPx: Number(diff.toFixed(1)) });
    }
  }

  // align-start / align-end: every target's element box shares one x within tolerance.
  for (const { el, label } of startTargets) {
    ran("align-start");
    const canvas = toCanvas(box(el), origin, scale);
    const diff = Math.abs(canvas.x - edgeStart);
    if (diff > ctx.tolerancePx) add("align-start", el, { label, x: Number(canvas.x.toFixed(1)), expected: edgeStart, diffPx: Number(diff.toFixed(2)) });
  }
  for (const { el, label } of endTargets) {
    ran("align-end");
    const canvas = toCanvas(box(el), origin, scale);
    const diff = Math.abs(canvas.right - edgeEnd);
    if (diff > ctx.tolerancePx) add("align-end", el, { label, right: Number(canvas.right.toFixed(1)), expected: edgeEnd, diffPx: Number(diff.toFixed(2)) });
  }
  // align-coverage: a posed/locked state with fewer than 3 start targets means the sweep did not
  // actually see enough of the page to trust the align-start result for this state.
  if (votingBeat) {
    ran("align-coverage");
    if (startTargets.length < 3) add("align-coverage", numberBadge ?? { x: edgeStart, y: 40 }, { count: startTargets.length });
  }

  // card-text-safe + card-badge-shape + tally-zone + clip-token-parity: per visible card.
  for (const card of cards) {
    const isPill = card.classList.contains("order-bar") || card.closest(".question-show-frame--myth-among-three");
    const cardBox = box(card);
    const cardCanvas = toCanvas(cardBox, origin, scale);
    const safeInset = isPill ? readToken(card, "--stage-pill-safe-inset") : readToken(card, "--stage-card-safe-inset");
    const tallyW = readToken(card, "--stage-tally-w");
    const labels = [...card.querySelectorAll(".answer-bar__label, .order-bar > div > span, .answer-bar__note")].filter(visible);
    const pct = card.querySelector(".answer-bar__pct");
    const votes = card.querySelector(".answer-bar__votes");
    const beside = Boolean(pct && labels[0] && Math.abs(box(pct).y - box(labels[0] as Element).y) < box(labels[0] as Element).height);
    for (const label of labels) {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)) {
          ran("card-text-safe");
          const canvasLine = toCanvas({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, origin, scale);
          const startFromCard = canvasLine.x - cardCanvas.x;
          const endLimit = beside ? cardCanvas.width - safeInset - tallyW - 16 : cardCanvas.width - safeInset;
          const endFromCard = canvasLine.right - cardCanvas.x;
          if (startFromCard < safeInset - ctx.tolerancePx) add("card-text-safe", card, { side: "start", startFromCard: Number(startFromCard.toFixed(1)), safeInset });
          if (endFromCard > endLimit + ctx.tolerancePx) add("card-text-safe", card, { side: "end", endFromCard: Number(endFromCard.toFixed(1)), endLimit: Number(endLimit.toFixed(1)) });
        }
      }
    }
    // Only chevron cards have a slanted point to clear (section 3.6: pills have no nose at all).
    const badge = isPill ? null : card.querySelector(".answer-bar__key");
    if (badge && visible(badge)) {
      const point = readToken(card, "--stage-card-point");
      const bBox = toCanvas(box(badge), origin, scale);
      const H = cardCanvas.height;
      const corners: Array<[number, number]> = [[bBox.x, bBox.y], [bBox.x, bBox.bottom], [bBox.right, bBox.y], [bBox.right, bBox.bottom]];
      for (const [x, y] of corners) {
        ran("card-badge-shape");
        const localX = x - cardCanvas.x;
        const localY = y - cardCanvas.y;
        const required = (point * Math.abs(localY - H / 2)) / (H / 2) + 4;
        if (localX < required - ctx.tolerancePx) add("card-badge-shape", badge, { localX: Number(localX.toFixed(1)), required: Number(required.toFixed(1)) });
      }
    }
    // badge-placement (spec 3.4 / 3.6, section 10 step 1 item 2): every letter badge, chevron
    // (out of flow in the nose, `badge` above) or pill (in flow, myth's own, never matched by the
    // chevron-only query above since it is skipped for `isPill`). Both live centered on the label
    // row they belong to and start at the token the spec names, never overlapping the label's own
    // first ink, the "which patient portrait" badge-over-glyph defect an independent designer
    // measured live, caused by exactly that overlap.
    const anyBadge = badge ?? card.querySelector(".answer-bar__key");
    const label0 = labels.find((l) => l.classList.contains("answer-bar__label") || l.tagName === "SPAN") ?? labels[0];
    // STAGE-SPEC pass 4b fix (4B-C7): a badge with no label on its own card has nothing this check
    // can meaningfully compare it against (every branch below reads the label's own row or start
    // x). Counting it under `ran("badge-placement")` anyway made a labelless card indistinguishable
    // from one this check actually evaluated, the same false-coverage shape this module's own
    // header comment names for other checks.
    if (anyBadge && visible(anyBadge) && label0) {
      ran("badge-placement");
      const badgeCanvas = toCanvas(box(anyBadge), origin, scale);
      const label0Canvas = toCanvas(box(label0 as Element), origin, scale);
      // Whether the tally is reserved below the label row (spec 3.5) is read from the rail's own
      // `data-tally` attribute, not from the pct/votes elements' live visibility: at the entering
      // beat those numbers can still be fading in (`@starting-style`'s own opacity 0), so a
      // visibility-based read went stale on that beat and centered the badge on the wrong target,
      // a defect this pass's own first full sweep surfaced (which-patient square, "entering").
      const tallyAttr = card.closest("[data-tally]")?.getAttribute("data-tally");
      const tallyBelowLabelRow = tallyAttr === "below" && label0Canvas != null;
      // The portrait below-tally grid (which-patient / myth) deliberately top-aligns the badge with
      // the label's own first line, a legitimate design for a label that can wrap to several lines,
      // not a defect. Fixed pass 4a (4A-3): the exemption is decided from structure (the same
      // portrait-plus-below-tally condition `tallyBelowLabelRow` already computes above), never
      // from the badge's own computed `align-self`, because a computed style is downstream of the
      // very CSS this check exists to prove correct: any rule that set `align-self: start` on a
      // badge for an unrelated reason silently exempted itself from being checked at all, on every
      // format, not only the portrait grid the exemption is actually meant for. In the exempted
      // case the badge is still checked, against the label's own first-line top rather than center.
      const gridBadgeExemption = ctx.format === "portrait" && tallyBelowLabelRow;
      if (gridBadgeExemption && label0Canvas) {
        const topDiff = Math.abs(badgeCanvas.y - label0Canvas.y);
        if (topDiff > 2 + ctx.tolerancePx) add("badge-placement", anyBadge, { reason: "not-top-aligned-with-label", topDiff: Number(topDiff.toFixed(1)) });
      } else {
        const expectedCenterY = tallyBelowLabelRow && label0Canvas ? label0Canvas.y + label0Canvas.height / 2 : cardCanvas.y + cardCanvas.height / 2;
        const centerDiff = Math.abs(badgeCanvas.y + badgeCanvas.height / 2 - expectedCenterY);
        if (centerDiff > 2 + ctx.tolerancePx) add("badge-placement", anyBadge, { reason: "not-centered", centerDiff: Number(centerDiff.toFixed(1)) });
      }
      const badgeStartFromCard = badgeCanvas.x - cardCanvas.x;
      const expectedStart = isPill ? readToken(card, "--stage-pill-safe-inset") : readToken(card, "--stage-card-badge-x");
      if (Number.isFinite(expectedStart)) {
        const startDiff = Math.abs(badgeStartFromCard - expectedStart);
        if (startDiff > 2 + ctx.tolerancePx) add("badge-placement", anyBadge, { reason: "wrong-start-x", badgeStartFromCard: Number(badgeStartFromCard.toFixed(1)), expectedStart: Number(expectedStart.toFixed(1)) });
      }
      // Fixed pass 4a (4A-4): a real gap, not merely no overlap. The prior test
      // (`badgeCanvas.right > label0Canvas.x`) let the label start exactly where the badge ends,
      // gap zero, which is what portrait which-patient measures live today. `--stage-card-badge-gap`
      // is the spec's own token for this gap (3.2), read once per card the same way every other
      // token-driven assertion in this module already reads its own token.
      if (label0Canvas) {
        const badgeGap = readToken(card, "--stage-card-badge-gap");
        const gap = label0Canvas.x - badgeCanvas.right;
        if (Number.isFinite(badgeGap)) {
          if (gap < badgeGap - ctx.tolerancePx) add("badge-placement", anyBadge, { reason: "insufficient-badge-gap", gap: Number(gap.toFixed(1)), expectedGap: badgeGap });
        } else if (gap < -ctx.tolerancePx) {
          add("badge-placement", anyBadge, { reason: "overlaps-label", badgeRight: Number(badgeCanvas.right.toFixed(1)), labelStart: Number(label0Canvas.x.toFixed(1)) });
        }
      }
    }
    if (pct && votes && visible(pct)) {
      ran("tally-zone");
      const pctCanvas = toCanvas(box(pct), origin, scale);
      if (beside) {
        const zoneStart = cardCanvas.right - safeInset - tallyW;
        const zoneEnd = cardCanvas.right - safeInset;
        if (pctCanvas.x < zoneStart - ctx.tolerancePx || pctCanvas.right > zoneEnd + ctx.tolerancePx) {
          add("tally-zone", pct, { placement: "beside", x: Number(pctCanvas.x.toFixed(1)), zoneStart: Number(zoneStart.toFixed(1)), zoneEnd: Number(zoneEnd.toFixed(1)) });
        }
      } else if (labels[0]) {
        const labelCanvas = toCanvas(box(labels[0] as Element), origin, scale);
        if (pctCanvas.y < labelCanvas.bottom - ctx.tolerancePx) add("tally-zone", pct, { placement: "below", y: Number(pctCanvas.y.toFixed(1)), labelBottom: Number(labelCanvas.bottom.toFixed(1)) });
        // tally-row-start (spec 3.5, section 10 step 1 item 6): a below-row tally starts at the
        // same x as the label it belongs to, not merely below it (the y-only check just above).
        // The myth "tally row starts under the badge (x 90 against 137)" defect an independent
        // designer measured live passed a y-only check cleanly while still starting under the
        // badge instead of under the label's own text. Binary is spec 5.1's own sanctioned
        // exception: both the label and its tally are centered, never start-aligned, so a shared
        // left edge is never the right target there. A centered pair compares MIDPOINTS instead:
        // this pass's own first full sweep found every binary card flagged, a check bug (label and
        // tally hold different widths even when both are correctly centered), not a real defect.
        ran("tally-row-start");
        const isBinary = Boolean(card.closest(".question-show-frame--binary"));
        const diff = isBinary
          ? Math.abs((pctCanvas.x + pctCanvas.width / 2) - (labelCanvas.x + labelCanvas.width / 2))
          : Math.abs(pctCanvas.x - labelCanvas.x);
        if (diff > ctx.tolerancePx) add("tally-row-start", pct, { x: Number(pctCanvas.x.toFixed(1)), labelX: Number(labelCanvas.x.toFixed(1)), centered: isBinary, diffPx: Number(diff.toFixed(1)) });
      }
    }
    const point = readToken(card, "--stage-card-point");
    const inner = readToken(card, "--stage-card-point-inner");
    // A chevron's outer polygon usually paints on the card element itself, but estimate's plate
    // sets `clip-path: none` on the card and moves the outer polygon to `::before` instead
    // (presentation.css, the plate's dark fill and rim), with `::after` still the inner polygon in
    // every kind. Reading only the card and `::after` left estimate's own outer chevron unchecked,
    // so both possible homes for the outer polygon are read here.
    const clip = getComputedStyle(card).clipPath;
    const beforeClip = getComputedStyle(card, "::before").clipPath;
    const match = /polygon\(\s*([\d.]+)px/.exec(clip) ?? /polygon\(\s*([\d.]+)px/.exec(beforeClip);
    if (match) {
      ran("clip-token-parity");
      const outerPainted = parseFloat(match[1]!);
      if (Math.abs(outerPainted - point) > 0.5) add("clip-token-parity", card, { layer: "outer", painted: outerPainted, token: point });
    }
    const afterClip = getComputedStyle(card, "::after").clipPath;
    const afterMatch = /polygon\(\s*([\d.]+)px/.exec(afterClip);
    if (afterMatch) {
      ran("clip-token-parity");
      const innerPainted = parseFloat(afterMatch[1]!);
      if (Math.abs(innerPainted - inner) > 0.5) add("clip-token-parity", card, { layer: "inner", painted: innerPainted, token: inner });
    }
  }

  // last-line-widow (pass 4a, 4A-13, designer's critique): a stem or answer whose wrapped text
  // ends on a single-word last line reads as an orphan, spec 4.5's own "awkward breaks" rule.
  if (votingBeat) {
    const widowTargets: Element[] = [];
    const stemTextEl = ctx.root.querySelector(".question-stage-copy h1, .question-stage-copy [data-comp-id='statement']");
    if (stemTextEl && visible(stemTextEl)) widowTargets.push(stemTextEl);
    // STAGE-SPEC pass 4b fix (4B-C7): binary's own label ("TRUE" / "FALSE") is intrinsically one
    // word, so `lastLineWordCount` can only ever return null for it (never wraps, one line total).
    // Counting it in `ran("last-line-widow")` anyway credited this check with coverage on a target
    // it can structurally never evaluate, the same false-coverage shape the badge-placement and
    // which-patient-label-box fixes above name.
    if (ctx.kind !== "binary") {
      for (const c of cards) {
        const label = c.querySelector(".answer-bar__label, .order-bar > div > span");
        if (label && visible(label)) widowTargets.push(label);
      }
    }
    for (const el of widowTargets) {
      ran("last-line-widow");
      const count = lastLineWordCount(el);
      if (count === 1) add("last-line-widow", el, { text: el.textContent?.trim().slice(-40) });
      // short-middle-line (pass 4c-1, redefined by width in pass 4c-1b): the same target set. A
      // stranded short line reads the same whether the widow guard's join made it or the
      // browser's own wrap did, so every stem and answer is measured, not only the ones the
      // guard touched.
      ran("short-middle-line");
      const shortLine = shortMiddleLine(el);
      if (shortLine !== null) add("short-middle-line", el, { text: el.textContent?.trim().slice(-60), threshold: SHORT_MIDDLE_LINE_RATIO, ...shortLine });
    }
  }

  // zone-contain: stem / scenario / answer-rail glyphs stay inside the content zone. Header and
  // footer height read from the live tokens (`--stage-header-h`, `--stage-footer-h`) instead of
  // repeating their numbers here a second time, so a token change cannot silently diverge from
  // what this check enforces. STAGE_ZONES stays as the fallback for a root that carries no
  // `.question-show-frame` host to read the tokens from.
  const zoneHost = ctx.root.querySelector(".question-show-frame") ?? ctx.root.querySelector(".question-shell");
  const zoneDefaults = STAGE_ZONES[ctx.format];
  const zone = zoneHost
    ? { ...zoneDefaults, headerH: readToken(zoneHost, "--stage-header-h", { x: edgeStart, y: zoneDefaults.top }), footerH: readToken(zoneHost, "--stage-footer-h", { x: edgeStart, y: ctx.canvasHeight - zoneDefaults.bottom }) }
    : zoneDefaults;
  if (!Number.isFinite(zone.headerH)) zone.headerH = zoneDefaults.headerH;
  if (!Number.isFinite(zone.footerH)) zone.footerH = zoneDefaults.footerH;
  const zoneTop = zone.top + zone.headerH + zone.gap;
  const zoneBottom = votingBeat ? ctx.canvasHeight - zone.bottom - zone.footerH - zone.gap : ctx.canvasHeight - zone.bottom;
  const zoneRoles = [...ctx.root.querySelectorAll(".question-stage-copy h1, .question-stage-copy [data-comp-id='statement'], .question-stage-scenario p, .answer-bar, .order-bar, .answer-bar__pct, .answer-bar__votes")].filter(visible);
  for (const el of zoneRoles) {
    ran("zone-contain");
    const canvas = toCanvas(box(el), origin, scale);
    if (canvas.y < zoneTop - ctx.tolerancePx || canvas.bottom > zoneBottom + ctx.tolerancePx) {
      add("zone-contain", el, { role: el.className || el.tagName, top: Number(canvas.y.toFixed(1)), bottom: Number(canvas.bottom.toFixed(1)), zoneTop, zoneBottom });
    }
  }

  // grid-shape: which-patient / estimate rails at 3 or 4 answers.
  if (votingBeat && (ctx.kind === "which-patient" || ctx.kind === "estimate") && cards.length >= 3) {
    ran("grid-shape");
    const anyCard = cards[0]!;
    if (ctx.format === "portrait") {
      const poll = ctx.root.querySelector(".answer-bar__poll");
      if (ctx.kind === "which-patient" && cards.length >= 3 && poll && visible(poll)) add("grid-shape", poll, { expected: "poll hidden at 3 or 4 portrait which-patient answers", found: "visible" });
      if (columnCount > 1) add("grid-shape", anyCard, { expected: 1, found: columnCount });
    } else if (ctx.kind === "which-patient") {
      if (columnCount !== 2) add("grid-shape", anyCard, { expected: 2, found: columnCount });
      if (orphan) {
        const peers = cards.filter((c) => c !== orphan);
        const orphanCanvas = toCanvas(box(orphan), origin, scale);
        const railLeft = Math.min(...peers.map((c) => toCanvas(box(c), origin, scale).x));
        const railRight = Math.max(...peers.map((c) => toCanvas(box(c), origin, scale).right));
        const railCenter = (railLeft + railRight) / 2;
        const orphanCenter = (orphanCanvas.x + orphanCanvas.right) / 2;
        if (Math.abs(orphanCenter - railCenter) > ctx.tolerancePx) add("grid-shape", orphan, { orphanCenter: Number(orphanCenter.toFixed(1)), railCenter: Number(railCenter.toFixed(1)) });
        const peerWidth = toCanvas(box(peers[0]!), origin, scale).width;
        if (Math.abs(orphanCanvas.width - peerWidth) > ctx.tolerancePx) add("grid-shape", orphan, { orphanWidth: Number(orphanCanvas.width.toFixed(1)), peerWidth: Number(peerWidth.toFixed(1)) });
      }
    }
  }

  // row-content-alignment (pass 4a, 4A-15, designer's critique): a row's cards can share the same
  // slot height (row-stretch, above) while their own painted content still sits at different y
  // inside that shared slot, which is a defect row-stretch's own box-only comparison cannot see.
  // Checks the label's first ink line and the tally's own baseline across every 2-or-more-card row,
  // for the kinds and format the designer's critique named (which-patient, myth, estimate, square).
  if (votingBeat && ["which-patient", "myth-among-three", "estimate"].includes(ctx.kind) && ctx.format === "square" && cards.length > 1) {
    // STAGE-SPEC pass 4b fix (4B-C6): grouped by each card's own y before, the same double-count
    // risk row-stretch's own comment above already documents (a short, unstretched card's top edge
    // can drift from its stretched row neighbors and split one real row into two apparent ones).
    // Grouping by the stable `.answer-slot` ancestor y instead, as row-stretch already does.
    const withCanvas = cards.map((el) => {
      const slot = el.closest(".answer-slot") ?? el;
      return { el, canvas: toCanvas(box(el), origin, scale), slotCanvas: toCanvas(box(slot), origin, scale) };
    });
    for (const rowCards of clusterByY(withCanvas.map((c) => ({ ...c, canvas: c.slotCanvas })))) {
      if (rowCards.length < 2) continue;
      const y = Number(rowCards[0]!.canvas.y.toFixed(1));
      ran("row-content-alignment");
      // STAGE-SPEC pass 4b note (found investigating a real row-content-alignment hit, CAND-41):
      // F5 (spec 5.2) makes the plurality note `display: none` on every card except the row's own
      // winner, so a row can genuinely hold one card with 3 lines of content (label, tally, note)
      // beside one with 2 (label, tally), the same asymmetry the beat-stable exception already
      // names and authorizes ("allow the one label shift ... because it lands with the numbers
      // fading in"), just measured spatially (across a row) instead of temporally (across beats).
      // `align-content: center` is F5's own exact prescribed fix for this row (its CSS block's
      // last line: "square ... takes F1's align-content: center"), so a card with the extra note
      // row centers its own, taller content stack differently than its shorter neighbor even
      // though both cards share one stretched box height. Estimate's own noteRowH (stage-fit.ts)
      // bounds the real difference at 4 + 26 * 1.2 = 35.2 canvas px on square; not present for
      // any other kind this check covers (myth and which-patient carry no note role at all).
      const rowTolerance = ctx.kind === "estimate" ? 35.2 : 1 + ctx.tolerancePx;
      const firstLines = rowCards.map((c) => {
        const label = c.el.querySelector(".answer-bar__label, .order-bar > div > span");
        return label && visible(label) ? firstInkBox(label, origin, scale) : null;
      }).filter((b): b is Box => b != null);
      if (firstLines.length > 1) {
        const ys = firstLines.map((b) => b.y);
        const diff = Math.max(...ys) - Math.min(...ys);
        if (diff > rowTolerance) {
          add("row-content-alignment", rowCards[0]!.el, { reason: "first-line-y", row: y, ys: ys.map((v) => Number(v.toFixed(1))), diffPx: Number(diff.toFixed(1)) });
        }
      }
      const tallyBaselines = rowCards.map((c) => {
        const pct = c.el.querySelector(".answer-bar__pct");
        return pct && visible(pct) ? toCanvas(box(pct), origin, scale) : null;
      }).filter((b): b is Box => b != null);
      if (tallyBaselines.length > 1) {
        const bottoms = tallyBaselines.map((b) => b.bottom);
        const diff = Math.max(...bottoms) - Math.min(...bottoms);
        if (diff > rowTolerance) {
          add("row-content-alignment", rowCards[0]!.el, { reason: "tally-baseline", row: y, bottoms: bottoms.map((v) => Number(v.toFixed(1))), diffPx: Number(diff.toFixed(1)) });
        }
      }
    }
  }

  // which-patient-label-box (pass 4a, 4A-14; rewritten pass 4b, 4B-C1, spec 3.3 / 3.8): a
  // coordinator review of pass 4a found this check unreliable three ways, none of them proving
  // the geometry the check's own name claims to prove:
  //   1. The label is a flex item that shrinks to its own text unless something forces it to fill
  //      the row (F3's own fix does that now, but the check itself must not assume a hardcoded 438
  //      either: a card whose tally is not beside gets a wider box, spec 3.8's own "614" row).
  //   2. 62 and 438 were literals, not reads of the real `--stage-card-text-start` token: a future
  //      token change could silently desync this check from the CSS it exists to police.
  //   3. Every card whose canvas width missed 728 by more than 2px was silently skipped with no
  //      record at all, indistinguishable from a check that ran and found nothing.
  // Fixed here: text-start is the label's own first ink x minus the card's left edge (real glyphs,
  // not a shrunk box's own edge); available width is the card's own content-box width (canvas
  // width minus both computed inline paddings, whichever the CSS actually reserves that beat);
  // the expected start is read from the live `--stage-card-text-start` token, never a literal; and
  // a card skipped for not being 728-wide bumps its own named counter instead of vanishing.
  if (votingBeat && ctx.kind === "which-patient" && ctx.format === "widescreen") {
    for (const card of cards) {
      const cardCanvas = toCanvas(box(card), origin, scale);
      if (Math.abs(cardCanvas.width - 728) > 2 + ctx.tolerancePx) {
        ran("which-patient-label-box-skipped");
        continue;
      }
      const label = card.querySelector(".answer-bar__label");
      if (!label || !visible(label)) continue;
      ran("which-patient-label-box");
      const cardStyle = getComputedStyle(card);
      // Computed style values (padding, like font-size) are already canvas px: the stage's own
      // `--stage-scale` is a CSS `transform`, which never affects a box's own computed style, only
      // where it paints (the same "no division by scale" fact grow-to-fit-boundary's own fix
      // above documents for font-size). Dividing these by scale a second time would shrink the
      // canvas-space padding whenever scale < 1, undercounting the available width.
      const padStartPx = parseFloat(cardStyle.paddingLeft || "0");
      const padEndPx = parseFloat(cardStyle.paddingRight || "0");
      const expectedStart = readToken(card, "--stage-card-text-start");
      const ink = firstInkBox(label, origin, scale);
      if (ink) {
        const measuredStart = ink.x - cardCanvas.x;
        if (Math.abs(measuredStart - expectedStart) > 2 + ctx.tolerancePx) {
          add("which-patient-label-box", label, { reason: "text-start", measuredStart: Number(measuredStart.toFixed(1)), expected: Number(expectedStart.toFixed(1)) });
        }
      }
      const availableWidth = cardCanvas.width - (padStartPx + padEndPx);
      const labelCanvas = toCanvas(box(label), origin, scale);
      if (Math.abs(labelCanvas.width - availableWidth) > 2 + ctx.tolerancePx) {
        add("which-patient-label-box", label, { reason: "label-width", width: Number(labelCanvas.width.toFixed(1)), expected: Number(availableWidth.toFixed(1)) });
      }
    }
  }

  // which-patient-text-start-token (pass 4b, 4B-C1's own "separate small check", corrected against
  // a coordinator review): the first version of this asserted the live token against the spec's own
  // literal 62, but badge-x is an owner call (coordinator review: built 34 on wide against the
  // spec's 18, kept as built per this pass's own rule to leave every owner call at today's value),
  // so the live token is legitimately 78 (52 safe-inset, 34+32+12 badge sum) whenever that owner
  // call stays as built, and asserting 62 would fail on the CORRECT as-built state. What this check
  // can assert regardless of which way that owner call goes is internal consistency: the token
  // must actually equal what spec 3.2's own formula produces from the OTHER live tokens (the larger
  // of the safe inset and badge-x + badge-w + badge-gap), never a second hardcoded number that
  // could drift from either the formula or a future badge-x pick.
  if (votingBeat && ctx.kind === "which-patient" && ctx.format === "widescreen") {
    const anyCard = cards[0];
    if (anyCard) {
      ran("which-patient-text-start-token");
      const tokenValue = readToken(anyCard, "--stage-card-text-start");
      const safeInset = readToken(anyCard, "--stage-card-safe-inset");
      const badgeX = readToken(anyCard, "--stage-card-badge-x");
      const badgeW = readToken(anyCard, "--stage-card-badge-w");
      const badgeGap = readToken(anyCard, "--stage-card-badge-gap");
      const expected = Math.max(safeInset, badgeX + badgeW + badgeGap);
      if (Math.abs(tokenValue - expected) > 0.5) {
        add("which-patient-text-start-token", anyCard, { measured: Number(tokenValue.toFixed(1)), expected: Number(expected.toFixed(1)) });
      }
    }
  }

  // vertical-balance (spec 2.3, section 10 step 1 item 1): widescreen and square center the
  // stem-to-answers group by equal top and bottom gaps, and portrait top-aligns it. Read against the
  // real `[data-screen="question"]` container's own box, not the idealized header/footer-token
  // zone above: that idealized zone produced a spurious 35 to 130px imbalance even when a group
  // was genuinely centered inside its own real box (a page-structure step, spec 10 step 5, that
  // wires the zone tokens into the real grid rows, has not landed). Skipped only when the group
  // genuinely fills the zone (both gaps near zero, the spec's own stated exception), not when
  // only ONE gap is near zero, which is exactly a bottom- or top-pinned defect wearing the
  // exception's clothes: the "binary pinned to the bottom" / "myth pinned to the top" findings an
  // independent designer measured live both show one real gap and one collapsed to ~0.
  if (votingBeat && stemEl) {
    const screenEl = ctx.root.querySelector('[data-screen="question"]');
    const stemCanvas = toCanvas(box(stemEl), origin, scale);
    const railCanvas = rail ? toCanvas(box(rail), origin, scale) : null;
    const groupTop = railCanvas ? Math.min(stemCanvas.y, railCanvas.y) : stemCanvas.y;
    const groupBottom = railCanvas ? Math.max(stemCanvas.bottom, railCanvas.bottom) : stemCanvas.bottom;
    if (ctx.format === "portrait") {
      ran("vertical-balance");
      const diff = Math.abs(groupTop - zoneTop);
      if (diff > 8 + ctx.tolerancePx) add("vertical-balance", stemEl, { format: "portrait", stemTop: Number(groupTop.toFixed(1)), expectedTop: Number(zoneTop.toFixed(1)), diffPx: Number(diff.toFixed(1)) });
    } else if (screenEl) {
      const containerCanvas = toCanvas(box(screenEl), origin, scale);
      const topGap = groupTop - containerCanvas.y;
      const bottomGap = containerCanvas.bottom - groupBottom;
      const fillsZone = topGap < 4 && bottomGap < 4;
      // Fixed pass 4a (4A-5): a state the spec's own exception exempts from balancing is not a
      // state this check evaluated. Counting it under `vertical-balance`'s own coverage number made
      // an exempt-heavy run's coverage table indistinguishable from one where the check actually
      // ran its comparison every time, the same false-green shape this module's own header comment
      // names. Exempt states get their own counter instead, printed in the same coverage table.
      if (fillsZone) {
        ran("vertical-balance-exempt");
      } else {
        ran("vertical-balance");
        const balanceDiff = Math.abs(topGap - bottomGap);
        if (balanceDiff > 8 + ctx.tolerancePx) {
          add("vertical-balance", stemEl, { format: ctx.format, topGap: Number(topGap.toFixed(1)), bottomGap: Number(bottomGap.toFixed(1)), diffPx: Number(balanceDiff.toFixed(1)) });
        }
      }
    }
  }

  // stage-over-budget: an editorial flag, not a layout failure. Approximated from today's actual
  // rendered rail height. The type ladder in stage-fit.ts, section 4.2, is a later build step. This
  // reads what renders today, at today's sizes, against the spec's content zone height.
  if (rail && stemEl) {
    ran("stage-over-budget");
    const railCanvas = toCanvas(box(rail), origin, scale);
    const stemCanvas = toCanvas(box(stemEl), origin, scale);
    const contentTop = Math.min(stemCanvas.y, railCanvas.y);
    const contentBottom = railCanvas.bottom;
    const used = contentBottom - contentTop;
    const available = zoneBottom - zoneTop;
    if (used > available + ctx.tolerancePx) add("stage-over-budget", rail, { used: Number(used.toFixed(1)), available });

    // grow-to-fit-boundary (spec 4.2 step 3, section 10 step 1 item 7, fixed pass 4a / 4A-1): a
    // stem below its kind's largest step must not leave room for one more step in the content
    // zone, per the operator ruling of 2026-09-26 that text grows to the largest size that fits.
    //
    // The chosen step is read from the real `[data-screen="question"][data-stem-step]` attribute
    // each kind component already writes, never guessed back from a painted font size: the stage
    // is scaled with a CSS `transform`, not a layout-affecting property (`ScaledStage.tsx`), so
    // `getComputedStyle(...).fontSize` inside `.scaled-stage-content` already returns the value in
    // canvas px before the transform, and dividing that by `scale` a second time silently produced
    // a number small enough to never match any real step in `STEM_SIZE`, so `currentStep` was
    // always `undefined` and this check could never go RED no matter what rendered.
    //
    // `ran()` fires only once the step attribute has actually resolved to a real value: counting
    // every evaluation, resolved or not, made the coverage table indistinguishable from a check
    // that ran and passed, the same false-green pattern `numericVar`'s own header comment names.
    //
    // Free space is read from the real `[data-screen="question"]` box (the actual rendered content
    // container), not the idealized header/footer-token zone: `vertical-balance` above already
    // documents why the idealized zone can disagree with a real container by tens of pixels.
    const stepHost = ctx.root.querySelector('[data-screen="question"]');
    const stepAttr = stepHost?.getAttribute("data-stem-step") as StemStep | null;
    const cap = (STEM_CAPS as Record<string, StemStep>)[ctx.kind];
    // The kind's own ladder (VOF-96: a square true or false stem reads the wide ladder), the same sizes the fit and the
    // measured step use, so a stem painted at its kind's size is never reported as a mismatch.
    const sizesForFormat = STEM_SIZE[ctx.format]
      ? Object.fromEntries((["L", "M", "S", "XS"] as StemStep[]).map((step) => [step, stemSizeFor(ctx.kind as QuestionKind, ctx.format, step)])) as Record<StemStep, number>
      : undefined;
    if (stepHost && stepAttr && cap && sizesForFormat && (["L", "M", "S", "XS"] as StemStep[]).includes(stepAttr)) {
      ran("grow-to-fit-boundary");
      const currentStep = stepAttr;
      const stemTextEl = stemEl.querySelector("h1, [data-comp-id='statement']") ?? stemEl;
      const currentSize = sizesForFormat[currentStep];
      // No division by scale (the fix): the computed value is already canvas px.
      const paintedFontCanvas = parseFloat(getComputedStyle(stemTextEl).fontSize);
      if (Math.abs(paintedFontCanvas - currentSize) > 0.75) {
        add("grow-to-fit-boundary", stemEl, { reason: "painted-size-mismatch", currentStep, paintedFontCanvas: Number(paintedFontCanvas.toFixed(1)), expected: currentSize });
      }
      const STEP_ORDER: StemStep[] = ["L", "M", "S", "XS"];
      const idx = STEP_ORDER.indexOf(currentStep);
      const capIdx = STEP_ORDER.indexOf(cap);
      // STAGE-SPEC pass 4b fix (found investigating 4B-C2): portrait's own step table (spec 4.3)
      // gives M and S the identical 30px size (only L, at 36, differs). "Room for the next step"
      // is meaningless when the next step paints at the exact same size as the current one: there
      // is nothing to grow INTO. Both the old estimate (`height * (30/30 - 1) = 0`) and this pass's
      // own real-measurement clone (title small nonzero noise around 0 from reflow jitter, never a
      // true grow) always read as "room to spare" here, which is why this specific false positive
      // (estimate/portrait, real content: PUB-12) survived the coordinator's own review naming
      // only the re-wrap case. Skip the whole comparison when the next step would not actually
      // change the painted size.
      if (idx > capIdx && sizesForFormat[STEP_ORDER[idx - 1]!] !== currentSize) {
        const nextStep = STEP_ORDER[idx - 1]!;
        const nextSize = sizesForFormat[nextStep];
        const screenCanvas = toCanvas(box(stepHost), origin, scale);
        const freeSpace = screenCanvas.height - used;
        const stemBlockCanvas = toCanvas(box(stemEl), origin, scale);
        // STAGE-SPEC pass 4b fix (4B-C2, coordinator review): the prior estimate assumed the next
        // step's own line count never changes (`height * (nextSize / currentSize - 1)`), which is
        // false whenever growing a step re-wraps the same text onto one more line: a coordinator
        // review named 4 real states (REPL-CAND-05, -12, -27, -44) that re-wrap from 3 lines to 4
        // at the next step and would not actually fit, which this estimate reported as false-
        // positive room. Measuring the real height at the next size, in a hidden sibling clone of
        // the same rendered width so the real line-wrap width and the real cascade (font, weight,
        // line-height) both stay identical to the live element, replaces the guess with a fact.
        const parent = stemTextEl.parentElement;
        let measuredDelta = stemBlockCanvas.height * (nextSize / currentSize - 1); // fallback only if cloning is impossible
        let nextShapeUnacceptable = false;
        let currentShapeAcceptable = true;
        if (parent) {
          const originalRect = stemTextEl.getBoundingClientRect();
          // Bug found while investigating this fix's own first version: `stemBlockCanvas` is the
          // whole `.question-stage-copy` wrapper (kicker row and scenario included, not just the
          // stem), so diffing the clone's own height (the h1 alone) against that whole wrapper's
          // height produced a deeply negative "delta" on every real case (the wrapper is always
          // taller than the h1 alone), never a true measurement. The marginal change a font-size
          // step actually contributes to the wrapper's total height is the h1's OWN height delta:
          // next h1 height minus current h1 height, not next h1 height minus the whole wrapper.
          const currentTextHeightCanvas = originalRect.height / scale;
          const clone = stemTextEl.cloneNode(true) as HTMLElement;
          clone.style.setProperty("position", "absolute", "important");
          clone.style.setProperty("visibility", "hidden", "important");
          clone.style.setProperty("pointer-events", "none", "important");
          // STAGE-SPEC pass 4c-1 fix (found building the production measurement path, use-
          // measured-stem-step.ts): `width` and `font-size` are LAYOUT values, read before the
          // ancestor's `transform: scale(scale)` (ScaledStage.tsx) ever applies, exactly like
          // production's own CSS sets them (STEM_SIZE's raw canvas numbers, never pre-multiplied).
          // Setting `originalRect.width` (already screen-space, i.e. canvas width * scale) and
          // `nextSize * scale` here applied BOTH as if they were canvas-domain shrank the clone's
          // real canvas-domain box by another factor of scale on top of the ancestor's own
          // transform, so `nextRect.height` came out `scale` times too small and `measuredDelta`
          // (divided by scale only once) stayed `scale` times too small too: a real, provable
          // under-count, not a nitpick. Confirmed live: REPL-CAND-05 wide reported measuredDelta
          // 2 for a growth this check's own corrected math (and a live committed render) measures
          // at 75+, and PUB-12 wide reported 2 for a growth that similarly never fits. Dividing
          // width by scale and dropping the multiply on font-size (both canvas-domain, matching
          // how production itself sets these two properties) fixes both.
          clone.style.setProperty("width", `${originalRect.width / scale}px`, "important");
          clone.style.setProperty("font-size", `${nextSize}px`, "important");
          parent.appendChild(clone);
          const nextRect = clone.getBoundingClientRect();
          // STAGE-SPEC pass 4c-1b (brief item 4): the layout fallback in use-measured-stem-step.ts
          // treats a step whose stem ends in a widow no join can fix, or strands a middle line, as
          // a step that does not fit, and walks the stem down past it to a step that reads clean.
          // Room for such a step is not room this check may demand the stem grow into, so the same
          // shape rule decides it here too, on this clone with its text unjoined (the live stem may
          // carry the join its own step chose) at the next step's rendered size (never below the
          // rendered floor, the same size the hook measures). The exemption holds only while the
          // stem's current step itself reads clean: a stem that is both held below its cap and
          // still badly shaped is a defect this check keeps reporting. Counted, never silent.
          unjoinTree(clone);
          const floorCanvas = (parseFloat(getComputedStyle(stemTextEl).getPropertyValue("--stage-floor-stem")) || 0) / scale;
          // Already laid out once above: under reduced motion a size change would start a 0.01 ms
          // transition a synchronous read cannot see, so transitions go off first.
          clone.style.setProperty("transition", "none", "important");
          if (floorCanvas > nextSize) clone.style.setProperty("font-size", `${floorCanvas}px`, "important");
          nextShapeUnacceptable = hasUnacceptableShape(clone);
          clone.remove();
          const currentClone = cloneForMeasure(stemTextEl as HTMLElement, { raw: true });
          currentShapeAcceptable = !hasUnacceptableShape(currentClone);
          currentClone.remove();
          measuredDelta = nextRect.height / scale - currentTextHeightCanvas;
        }
        if (freeSpace - measuredDelta > 20) {
          if (nextShapeUnacceptable && currentShapeAcceptable) ran("grow-to-fit-boundary-shape-exempt");
          else add("grow-to-fit-boundary", stemEl, {
            reason: "room-for-next-step", currentStep, nextStep, freeSpace: Number(freeSpace.toFixed(1)), measuredDelta: Number(measuredDelta.toFixed(1)),
          });
        }
      }
    }
  }

  // answer-step-down (pass 4c-1b, brief item 4): grow-to-fit-boundary's counterpart for the answer
  // rail. The layout fallback in use-measured-stem-step.ts may step the whole rail below
  // stage-fit.ts's own first-pass size (written as `data-answer-first-pass`), but only past labels
  // nothing else repairs, so every step from the first pass down to the one just above the rail's
  // current step has more such labels than the current step (`stepDownIsJustified`). A rail below
  // its first pass that some larger step reads no worse at was shrunk for nothing. Labels are judged
  // as raw clones (joins undone, narrowing removed) at each step's rendered size, the same
  // measurement and the same label set the hook decides with. The clones keep the settled rail's
  // label widths, which do not depend on the answer size (the badge, the text start and the tally
  // zone are fixed tokens), so the hook, measuring at the first-pass rail, saw the same widths.
  const railHost = ctx.root.querySelector<HTMLElement>('[data-screen="question"][data-answer-first-pass][data-answer-step]');
  const railLadder = railHost ? answerLadder(ctx.kind as Parameters<typeof answerLadder>[0], ctx.format) : null;
  if (votingBeat && railHost && railLadder) {
    const firstPass = Number(railHost.getAttribute("data-answer-first-pass"));
    const current = Number(railHost.getAttribute("data-answer-step"));
    if (railLadder.includes(firstPass) && railLadder.includes(current)) {
      ran("answer-step-down");
      if (current < firstPass) {
        const labels = [...railHost.querySelectorAll<HTMLElement>(".answer-bar__label, .order-bar > div > span")];
        const floorCanvas = labels[0] ? (parseFloat(getComputedStyle(labels[0]).getPropertyValue("--stage-floor-answer")) || 0) / scale : 0;
        const defectsAt = (size: number): number => labels.filter((label) => {
          const clone = cloneForMeasure(label, { fontSizePx: Math.max(size, floorCanvas), raw: true });
          const unacceptable = hasUnacceptableShape(clone, true);
          clone.remove();
          return unacceptable;
        }).length;
        const byStep = new Map<number, number>();
        const counted = (size: number): number => {
          if (!byStep.has(size)) byStep.set(size, defectsAt(size));
          return byStep.get(size)!;
        };
        if (!stepDownIsJustified(railLadder, firstPass, current, counted)) add("answer-step-down", railHost, { firstPass, current, labelsUnfixableByStep: Object.fromEntries(byStep) });
      }
    }
  }

  return { issues, startTargetCount: startTargets.length, endTargetCount: endTargets.length, coverageByCheck };
}

/**
 * STAGE-SPEC pass 3 part B. A rendered text box in canvas space, gathered the same way
 * card-text-safe already walks a label's text nodes above, so a marker can be proven never to sit
 * on top of one (part A item 13, accept.mjs check 7).
 */
export interface StageTextBox { x: number; y: number; width: number; height: number }

// STAGE-SPEC pass 3 part D, item 15: markers 1 and 9 landed on top of the header's own "ORDER"
// kicker in today-order-widescreen, because this list (read by both the overlay and the render
// script's manifest, per this module's own header comment) never named either header text role, so
// a marker's own placement search never knew they were there to avoid. A truly needed change to
// this shared module, named in the pass 3 part D report per the brief's own instruction.
const TEXT_BOX_SELECTOR = [
  ".question-stage-copy h1", ".question-stage-copy [data-comp-id='statement']",
  ".question-stage-scenario > span", ".question-stage-scenario p",
  ".order-scramble-cue", ".order-statement", ".order-scenario",
  ".answer-bar__label", ".answer-bar__note", ".answer-bar__key",
  ".order-bar > div > span", ".answer-bar__pct", ".answer-bar__votes",
  ".question-source-kicker", ".question-source-number",
].join(", ");

/** Every visible glyph's ink-bounded line box, in canvas space. Shared by the overlay (to avoid
 * drawing a marker over text) and the render script (to prove the same thing in the manifest). */
export function collectTextBoxes(root: ParentNode): StageTextBox[] {
  const stage = findStage(root);
  if (!stage) return [];
  const { origin, scale } = stage;
  const boxes: StageTextBox[] = [];
  for (const el of [...root.querySelectorAll(TEXT_BOX_SELECTOR)].filter(visible)) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)) {
        const c = toCanvas({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, origin, scale);
        boxes.push({ x: c.x, y: c.y, width: c.width, height: c.height });
      }
    }
  }
  return boxes;
}

export interface StageMarkerBox extends StageTextBox { number: number }

function boxesOverlap(a: StageTextBox, b: StageTextBox): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

/**
 * Placement for the numbered violation markers (spec section 8, part A item 13). One
 * implementation, shared by GuideOverlay (drawing) and the render script (recording in the
 * manifest), so a marker the overlay actually draws is the exact box the manifest names, and the
 * two can never disagree about where a marker landed.
 *
 * Starts at the coordinator's original above-left offset, then walks a ring of candidate points at
 * growing radius and every 45 degrees around the anchor until one candidate box clears every marker
 * already placed and every text box on the render. The candidate order favors small movements: a
 * marker keeps its original spot whenever nothing already collides with it.
 */
export function placeMarkers(anchors: { x: number; y: number }[], textBoxes: StageTextBox[], canvasWidth: number, canvasHeight: number): StageMarkerBox[] {
  const R = 9;
  const placed: StageMarkerBox[] = [];
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  anchors.forEach((anchor, i) => {
    const candidates: { x: number; y: number }[] = [{ x: anchor.x - 16, y: anchor.y - 16 }];
    for (const radius of [24, 32, 40, 48, 56, 64, 72]) {
      for (const angleDeg of [-135, -90, -45, 0, 45, 90, 135, 180]) {
        const rad = (angleDeg * Math.PI) / 180;
        candidates.push({ x: anchor.x + radius * Math.cos(rad), y: anchor.y + radius * Math.sin(rad) });
      }
    }
    let chosen = candidates[0]!;
    for (const c of candidates) {
      const x = clamp(c.x - R, 2, canvasWidth - 2 - R * 2);
      const y = clamp(c.y - R, 2, canvasHeight - 2 - R * 2);
      const test: StageTextBox = { x, y, width: R * 2, height: R * 2 };
      const hitsMarker = placed.some((p) => boxesOverlap(test, p));
      const hitsText = textBoxes.some((t) => boxesOverlap(test, t));
      if (!hitsMarker && !hitsText) { chosen = { x, y }; break; }
    }
    const finalBox: StageMarkerBox = { x: clamp(chosen.x, 2, canvasWidth - 2 - R * 2), y: clamp(chosen.y, 2, canvasHeight - 2 - R * 2), width: R * 2, height: R * 2, number: i + 1 };
    placed.push(finalBox);
  });
  return placed;
}

export interface StageSpecimenMetrics {
  topGap: number | null;
  bottomGap: number | null;
  stemTop: number | null;
  tallyVisible: boolean;
}

/**
 * The three measurements pass 3's accept.mjs needs and today's checks do not already record (spec
 * sections 2.3 and 3.5): how far the stem-to-answers group sits from the top and bottom of the
 * content zone (square centering, part A item 2), where the stem starts (portrait alignment, part
 * A item 3), and whether any tally number is actually painted on screen (hands-up, part A item 4).
 */
export function computeSpecimenMetrics(ctx: StageCheckContext): StageSpecimenMetrics {
  const stage = findStage(ctx.root);
  if (!stage) return { topGap: null, bottomGap: null, stemTop: null, tallyVisible: false };
  const { origin, scale } = stage;

  const stemEl = ctx.root.querySelector(".question-stage-copy");
  const rail = ctx.root.querySelector(".answer-rail, .estimate-answer-rail, .order-rail");
  // The container square centering actually happens inside is `[data-screen="question"]`'s own
  // real box, not the idealized token-based zone above: the page-structure step that would wire
  // `--stage-header-h` / `--stage-footer-h` into the real `.show-safe` grid rows is spec section 10
  // step 5, out of scope for this pass (the tokens exist today but nothing reads them yet, per
  // question-stage.css's own step-1 comment). Measuring topGap/bottomGap against the idealized zone
  // instead of the real container produced a spurious ~35 to ~130px imbalance even when the group
  // was genuinely centered inside its real box. stemTop (portrait alignment, part A item 3) stays
  // against the idealized zone: that check is specifically proving portrait already matches the
  // spec's target position, not merely its own container.
  const screenEl = ctx.root.querySelector('[data-screen="question"]');
  let topGap: number | null = null;
  let bottomGap: number | null = null;
  let stemTop: number | null = null;
  if (stemEl) {
    const stemCanvas = toCanvas(box(stemEl), origin, scale);
    stemTop = Number(stemCanvas.y.toFixed(1));
  }
  if (stemEl && rail && screenEl) {
    const stemCanvas = toCanvas(box(stemEl), origin, scale);
    const railCanvas = toCanvas(box(rail), origin, scale);
    const containerCanvas = toCanvas(box(screenEl), origin, scale);
    const groupTop = Math.min(stemCanvas.y, railCanvas.y);
    const groupBottom = Math.max(stemCanvas.bottom, railCanvas.bottom);
    topGap = Number((groupTop - containerCanvas.y).toFixed(1));
    bottomGap = Number((containerCanvas.bottom - groupBottom).toFixed(1));
  }

  const tallyVisible = [...ctx.root.querySelectorAll(".answer-bar__pct, .answer-bar__votes")].some((el) => visible(el) && box(el).width > 0 && box(el).height > 0);

  return { topGap, bottomGap, stemTop, tallyVisible };
}

/** One plain-English sentence per check code, for the render manifest's legend (spec section 8 /
 * the coordinator's item 4). Kept beside the checks so a new code cannot ship without a meaning. */
export const CHECK_MEANINGS: Record<string, string> = {
  "align-start": "This element does not start on the shared left edge every other block starts on.",
  "align-end": "This element does not end on the shared right edge every other block ends on.",
  "align-coverage": "Too few elements were found on the edge to trust the alignment check for this state.",
  "card-text-safe": "This card's text crosses into the chevron's slanted point instead of staying in the safe box.",
  "card-badge-shape": "This letter badge sits partly inside the chevron's slanted point instead of clearing it.",
  "tally-zone": "This vote number sits outside its reserved tally zone.",
  "clip-token-parity": "This chevron's painted point does not match the token that is supposed to drive it.",
  "zone-contain": "This text sits outside the header-to-footer content zone.",
  "grid-shape": "This which-patient grid is not the 2-column shape (or centered third card) the spec calls for.",
  "stage-over-budget": "This rail's content is taller than the zone it has to fit in.",
  "token-unresolved": "A named CSS token did not resolve to a length, so its check could not run.",
  "unsettled": "The specimen measured this state before it finished settling, so the result may be stale.",
  "vertical-balance": "The stem-to-answers group is not centered (wide/square) or top-aligned (portrait) inside its zone.",
  "badge-placement": "This letter badge is not centered on its label row, is off its own start token, or overlaps the label's first glyph.",
  "one-column-card-width": "This card does not span the full rail width in a one-column layout.",
  "row-stretch": "Cards in the same grid row do not share the same rendered height.",
  "cue-alignment": "This element's visible text does not start on the shared edge, even though its own box does.",
  "tally-row-start": "This below-row tally number does not start at the same x as the label it belongs to.",
  "grow-to-fit-boundary": "This stem is below its kind's largest step even though the content zone has room for the next step up.",
  "vertical-balance-exempt": "Not an issue code: counts states the vertical-balance check exempted (the group already fills its zone), so exempt states are never silently folded into vertical-balance's own coverage number.",
  "answer-step-down": "This answer rail sits below its first-pass size although its labels read no worse one step up.",
  "grow-to-fit-boundary-shape-exempt": "Not an issue code: counts stems grow-to-fit-boundary found room above but held there, because at the next step up the stem would end in a widow no join can fix or strand a middle line (the layout fallback's own rule).",
  "last-line-widow": "This stem or answer wraps to a last line that holds only a single word.",
  "short-middle-line": "This stem or answer wraps to a middle line narrower than half of its own widest line, a short line stranded between two long ones.",
  "which-patient-label-box": "This which-patient card's label box does not match the spec's worked 728-wide-cell numbers (62 text start, 438 wide).",
  "row-content-alignment": "Cards in the same row hold equal slot heights but their painted content (first line or tally) does not line up inside those slots.",
};
