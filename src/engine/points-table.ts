/**
 * How points work, as a player reads it: what a right answer scores by question kind, and the two streak bonuses.
 * One copy for every screen that shows it (the solo topic pick and the room phone's seat). It is plain data, with no
 * import, so the phone can show it without reaching the engine's answer-bearing modules. The values are held to
 * score() and KIND_BASE_POINTS by tests/unit/points-table.test.ts. A miss scores nothing, so it is not a row.
 */

export interface PointsRow {
  label: string;
  points: number;
}

/** A right answer's points by kind. Estimate and myth share one row because they score the same. */
export const KIND_POINTS: readonly PointsRow[] = [
  { label: 'True or false', points: 100 },
  { label: 'Estimate or myth', points: 150 },
  { label: 'Which patient', points: 200 },
  { label: 'Put in order', points: 250 },
];

/** The bonus a right answer adds when it makes a streak of three, and when it makes every fifth. */
export const STREAK_BONUS_ROWS: readonly PointsRow[] = [
  { label: 'Three in a row', points: 50 },
  { label: 'Every five in a row', points: 100 },
];
