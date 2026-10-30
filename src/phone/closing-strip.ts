// The solo closing strip's own sizing (VOF-68): shared between PhoneClosing.tsx (today's pace) and
// SoloPaceRecap.tsx (Run, Climb, Best), so the two never drift apart on how a long round's strip lays out.

/** Eight or fewer marks stay the original size, one row, flex-wrap. Past eight, the strip steps down a size and
 *  switches to a fixed column count so its rows balance instead of leaving flex-wrap's ragged last row. */
export const STRIP_COMPACT_THRESHOLD = 8;

export function isStripCompact(count: number): boolean {
  return count > STRIP_COMPACT_THRESHOLD;
}

/** Half the marks, rounded up: the column count that splits a compact strip into two balanced rows (or one, for a
 *  count that still fits in a single row of that width). Undefined when the strip is not compact, so callers never
 *  set the CSS variable needlessly. */
export function stripColumns(count: number): number | undefined {
  return isStripCompact(count) ? Math.ceil(count / 2) : undefined;
}
