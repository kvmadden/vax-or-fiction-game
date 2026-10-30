/**
 * The estimate range cards' colours, in authored order: teal, orange, cobalt, purple, pink, green. This list is the one
 * source of those colours. EstimateQuestion.tsx sets each card's --range-accent from it, every look paints from that
 * property, and no stylesheet sets it. tests/unit/estimate-range-accents.test.ts holds the order and the single source,
 * and tests/integration/looks-options.test.mjs reads the colours the cards really render in every look.
 */
export const ESTIMATE_RANGE_ACCENTS: readonly string[] = [
  "var(--color-vax)",
  "var(--color-fiction)",
  "var(--color-accent-cobalt)",
  "var(--color-accent-purple)",
  "var(--color-accent-pink)",
  "var(--color-accent-green)",
];

/** The accent for the range card at `index`, cobalt past the end of the list. */
export function estimateRangeAccent(index: number): string {
  return ESTIMATE_RANGE_ACCENTS[index] ?? "var(--color-accent-cobalt)";
}
